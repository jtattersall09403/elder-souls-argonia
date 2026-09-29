import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { bool } from "three/tsl";
import {
  applyLodFade,
  createLodFadeUniforms,
  lodBayer4,
  lodCopyCollapsed,
  lodFadeFactors,
  lodLadder,
  lodPixelKept,
  BAYER4_THRESHOLDS,
  LOD_CULL_BAND_M,
  LOD_OPEN_M,
  applyLodFadeWithShadow,
} from "./lodFade";
import {
  applyBatchData,
  batchUniformsOf,
  createBatchDataTexture,
  createBatchDataUniforms,
  writeBatchInstance,
} from "./batchData";


/** How many of `bands` keep the pixel with threshold `bayer` at distance `d`. */
function coverage(bands: readonly [number, number, number, number][], d: number, bayer: number): number {
  let kept = 0;
  for (const band of bands) if (lodPixelKept(lodFadeFactors(band, d), bayer)) kept++;
  return kept;
}

/** Ladders as the scatter builds them (`lodRings` numbers for real species). */
const LADDERS = {
  // 2 m rock: one level, no card, vanishes at 70 m; rings run PAST its draw distance.
  rock2m: { ladder: lodLadder([24, 50, 100], 1, null, 70), vanish: true, maxDraw: 70 },
  // 19 m palm: three mesh levels and a card, a land tree (never vanishes).
  palm19: { ladder: lodLadder([48, 96, 153], 3, 3, 1985), vanish: false, maxDraw: 1985 },
  // 6 m jungle tree.
  jungle6: { ladder: lodLadder([24, 50, 100], 3, 3, 1985), vanish: false, maxDraw: 1985 },
  // A shrub with one mesh level and a card, vanishing at 120 m.
  shrubCard: { ladder: lodLadder([24, 50, 100], 1, 1, 120), vanish: true, maxDraw: 120 },
  // A submerged species whose rings sit closer than the margin.
  kelp: { ladder: lodLadder([12, 25, 50], 3, 3, 120), vanish: true, maxDraw: 120 },
};

describe("lodLadder", () => {
  it("tiles [0, maxDraw) with one rung per distinct kit level", () => {
    expect(LADDERS.rock2m.ladder).toEqual([{ level: 0, lo: 0, hi: 70 }]);
    expect(LADDERS.palm19.ladder).toEqual([
      { level: 0, lo: 0, hi: 48 }, { level: 1, lo: 48, hi: 96 },
      { level: 2, lo: 96, hi: 153 }, { level: 3, lo: 153, hi: 1985 },
    ]);
    expect(LADDERS.shrubCard.ladder).toEqual([
      { level: 0, lo: 0, hi: 100 }, { level: 1, lo: 100, hi: 120 },
    ]);
  });
  it("clips rungs to the draw distance", () => {
    expect(lodLadder([24, 50, 100], 3, 3, 60)).toEqual([
      { level: 0, lo: 0, hi: 24 }, { level: 1, lo: 24, hi: 50 }, { level: 2, lo: 50, hi: 60 },
    ]);
  });
});

/**
 * The coverage invariant, the part that lives without a CPU rebuild: the
 * ladder itself is walked against `cellRungs` in
 * `vegetation/cellBuild.test.ts` (decision 0082), where the pre-0082
 * `lodCopies` rule survives as the parity oracle.
 */
describe("one copy per pixel", () => {
  it("was red on the round-4 rule: a rock's merged band dissolved at its inner ring", () => {
    // What rounds 2–4 emitted for a rock at 55 m: one copy whose band still
    // carried the ring-1 fade-in edge although nothing sat below it.
    const round4Band: [number, number, number, number] = [24, 100, 5, 5];
    const kept = BAYER4_THRESHOLDS.filter((b) => lodPixelKept(lodFadeFactors(round4Band, 22), b));
    expect(kept.length).toBeLessThan(16 / 2);
  });

  it("for the ground ring's three tile-band tiers drawn together", () => {
    // Groundcover.tsx: every tier copy of a plant exists at once; the shader
    // alone decides. Bands (dIn, dOut, wIn, wOut) with matched half-widths.
    const tiers: [number, number, number, number][] = [
      [0, 30, 0, 4], [30, 75, 4, 6], [75, 165, 6, 10],
    ];
    const holes: string[] = [];
    for (let d = 0; d <= 165 - 10; d += 0.25) {
      for (const bayer of BAYER4_THRESHOLDS) {
        if (coverage(tiers, d, bayer) !== 1) holes.push(`d=${d} bayer=${bayer}`);
      }
    }
    expect(holes.slice(0, 5)).toEqual([]);
  });

  it("a collapsed copy keeps no pixel, and an unbound band keeps every pixel", () => {
    for (const bayer of BAYER4_THRESHOLDS) {
      expect(lodPixelKept(lodFadeFactors([0, 0, 0, 0], 500), bayer)).toBe(true);
    }
    const gone = lodFadeFactors([0, 100, 0, 5], 200);
    expect(lodCopyCollapsed(gone)).toBe(true);
    for (const bayer of BAYER4_THRESHOLDS) expect(lodPixelKept(gone, bayer)).toBe(false);
  });

  it("a hard step is a step: nothing partial on either side of the edge", () => {
    for (const d of [47.99, 48, 48.01]) {
      const inFactor = lodFadeFactors([48, LOD_OPEN_M, 0, 0], d).fadeIn;
      const outFactor = lodFadeFactors([0, 48, 0, 0], d).fadeOut;
      expect(inFactor === 0 || inFactor === 1).toBe(true);
      expect(inFactor).toBe(outFactor);
    }
  });

  it("the node dither is a 4x4 Bayer tile holding every threshold once", () => {
    for (const [ox, oy] of [[0, 0], [4, 8], [13, 2]]) {
      const tile: number[] = [];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) tile.push(lodBayer4(ox + x + 0.5, oy + y + 0.5));
      expect([...tile].sort((a, b) => a - b)).toEqual([...BAYER4_THRESHOLDS]);
    }
  });
});

describe("applyLodFade", () => {
  it("fills the position (collapse) and mask (dither) slots", () => {
    const material = new MeshStandardNodeMaterial();
    const uniforms = createLodFadeUniforms();
    applyLodFade(material, uniforms);
    expect(material.positionNode).not.toBeNull();
    expect(material.maskNode).not.toBeNull();
    // The shadow pass reuses the colour slots unless the flag asks otherwise.
    expect(material.maskShadowNode).toBeNull();
    expect(material.castShadowPositionNode).toBeNull();
    expect((uniforms.esLodViewPos as { isNode?: boolean }).isNode).toBe(true);
    expect(uniforms.esLodViewPos.value).toBeInstanceOf(THREE.Vector3);
  });

  it("never patches twice", () => {
    const material = new MeshStandardNodeMaterial();
    const uniforms = createLodFadeUniforms();
    applyLodFade(material, uniforms);
    const position = material.positionNode;
    const mask = material.maskNode;
    applyLodFade(material, uniforms);
    expect(material.positionNode).toBe(position);
    expect(material.maskNode).toBe(mask);
  });

  it("casts from distance zero in the shadow slots only, under the flag", () => {
    const material = new MeshStandardNodeMaterial();
    applyLodFadeWithShadow(material, undefined, createLodFadeUniforms(),
      { shadowBandFromZero: true });
    // The shadow band differs from the colour band: its own mask and position.
    expect(material.maskShadowNode).not.toBeNull();
    expect(material.maskShadowNode).not.toBe(material.maskNode);
    expect(material.castShadowPositionNode).not.toBeNull();
    expect(material.castShadowPositionNode).not.toBe(material.positionNode);
    // Unflagged, the shadow reuses the colour band.
    const plain = new MeshStandardNodeMaterial();
    applyLodFadeWithShadow(plain, undefined, createLodFadeUniforms());
    expect(plain.maskShadowNode).toBeNull();
    expect(plain.castShadowPositionNode).toBeNull();
  });

  it("keeps an earlier feature's mask in the from-zero shadow mask", () => {
    const material = new MeshStandardNodeMaterial();
    const earlier = bool(true);
    material.maskNode = earlier;
    applyLodFade(material, createLodFadeUniforms(), { shadowBandFromZero: true });
    expect(material.maskNode).not.toBe(earlier);
    expect(material.maskShadowNode).not.toBeNull();
  });
});

describe("applyBatchData", () => {
  it("marks the material once, in either order with the fade", () => {
    const uniforms = createBatchDataUniforms();
    const before = new MeshStandardNodeMaterial();
    applyBatchData(before, undefined, uniforms);
    applyLodFade(before, createLodFadeUniforms());
    const after = new MeshStandardNodeMaterial();
    applyLodFade(after, createLodFadeUniforms());
    applyBatchData(after, undefined, uniforms);
    expect(batchUniformsOf(before)).toBe(uniforms);
    expect(batchUniformsOf(after)).toBe(uniforms);
    const other = createBatchDataUniforms();
    applyBatchData(before, undefined, other);
    expect(batchUniformsOf(before)).toBe(uniforms);
  });

  it("shares the occlusion mask and window, never the data texture", () => {
    const base = createBatchDataUniforms();
    const batch = createBatchDataUniforms(base);
    expect(batch.esOccMask).toBe(base.esOccMask);
    expect(batch.esOccParams).toBe(base.esOccParams);
    expect(batch.esBatchData).not.toBe(base.esBatchData);
  });

  it("a grown batch reuses the patched material and re-points its texture", () => {
    // A clone does not carry the batch mark, so a batch that grows must REUSE
    // its material, never re-clone it.
    const material = new MeshStandardNodeMaterial();
    const uniforms = createBatchDataUniforms();
    applyBatchData(material, undefined, uniforms);
    uniforms.esBatchData.value = createBatchDataTexture(8);
    const grown = createBatchDataTexture(16);
    uniforms.esBatchData.value = grown;
    expect(batchUniformsOf(material)?.esBatchData.value).toBe(grown);
    expect(batchUniformsOf(material.clone())).toBeUndefined();
  });

  it("writes two RGBA texels per instance", () => {
    const texture = createBatchDataTexture(4);
    writeBatchInstance(texture, 2, [1, 2, 3, 4], -0.5, 0.25);
    const data = texture.image.data as Float32Array;
    expect([...data.slice(16, 24)]).toEqual([1, 2, 3, 4, -0.5, 0.25, 0, 0]);
  });
});
