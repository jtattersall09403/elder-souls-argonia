import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyLodFade,
  createLodFadeUniforms,
  lodCopyCollapsed,
  lodFadeFactors,
  lodLadder,
  lodPixelKept,
  reapplyLodFade,
  BAYER4_THRESHOLDS,
  LOD_CULL_BAND_M,
  LOD_OPEN_M,
  LOD_FRAGMENT_TEST,
  LOD_SHADOW_FROM_ZERO_LINE,
  applyLodFadeWithShadow,
} from "./lodFade";
import {
  applyBatchData,
  createBatchDataTexture,
  createBatchDataUniforms,
  reapplyBatchData,
  writeBatchInstance,
} from "./batchData";
import { OCCLUSION_MIN_DISTANCE_M } from "../render/terrainOcclusion";


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

  it("the GLSL discard is the mirror's comparison, both sides", () => {
    expect(LOD_FRAGMENT_TEST).toContain("esLodBayer >= vEsLod.x || esLodBayer < vEsLod.y");
  });
});

describe("applyLodFade", () => {
  const compile = (material: THREE.Material) => {
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "void main() {\n#include <begin_vertex>\n}",
      fragmentShader: "void main() {\n#include <alphatest_fragment>\n}",
    };
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      null as unknown as THREE.WebGLRenderer,
    );
    return shader;
  };

  it("injects the band into the vertex shader and the discard before any texture fetch", () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createLodFadeUniforms();
    applyLodFade(material, uniforms);
    const shader = compile(material);
    expect(shader.vertexShader).toContain("esLodBand");
    // A fully faded copy is collapsed to zero-area triangles, not just
    // discarded per fragment.
    expect(shader.vertexShader).toContain("transformed = vec3(0.0)");
    expect(shader.uniforms.esLodViewPos).toBe(uniforms.esLodViewPos);
    // FIRST statement in main(): a rejected fragment must not sample a map.
    const main = shader.fragmentShader.indexOf("void main() {");
    const discard = shader.fragmentShader.indexOf("discard");
    const alphaTest = shader.fragmentShader.indexOf("#include <alphatest_fragment>");
    expect(discard).toBeGreaterThan(main);
    expect(discard).toBeLessThan(alphaTest);
    expect(
      shader.fragmentShader
        .slice(main + "void main() {".length, shader.fragmentShader.indexOf("float esLodBayer"))
        .trim(),
    ).toBe("");
  });

  it("never patches twice, and survives an onBeforeCompile overwrite", () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createLodFadeUniforms();
    applyLodFade(material, uniforms);
    applyLodFade(material, uniforms);
    material.onBeforeCompile = () => undefined; // what CSM does
    reapplyLodFade(material);
    const shader = compile(material);
    expect(shader.vertexShader.match(/varying vec2 vEsLod/g)).toHaveLength(1);
    expect(material.customProgramCacheKey()).toContain("|es-lod");
  });

  it("casts from distance zero on the depth material only, under the flag", () => {
    const material = new THREE.MeshStandardMaterial();
    const depth = new THREE.MeshDepthMaterial();
    applyLodFadeWithShadow(material, depth, createLodFadeUniforms(),
      { shadowBandFromZero: true });
    const colour = compile(material);
    const shadow = compile(depth);
    expect(shadow.vertexShader).toContain(LOD_SHADOW_FROM_ZERO_LINE);
    expect(colour.vertexShader).not.toContain(LOD_SHADOW_FROM_ZERO_LINE);
    // The outer edge is untouched: the far rung and the cards still cast
    // nothing, and the mid rung stops casting where its band ends.
    expect(shadow.vertexShader).toContain("float esLodOut =");
    expect(depth.customProgramCacheKey()).toContain("|es-lod-shadow0");
    expect(material.customProgramCacheKey()).not.toContain("shadow0");
    // Unflagged, both materials keep the normal inner edge.
    const plain = new THREE.MeshDepthMaterial();
    applyLodFade(plain, createLodFadeUniforms());
    expect(compile(plain).vertexShader).not.toContain(LOD_SHADOW_FROM_ZERO_LINE);
  });

  it("is a no-op on a material it never touched", () => {
    const material = new THREE.MeshStandardMaterial();
    const before = material.onBeforeCompile;
    reapplyLodFade(material);
    expect(material.onBeforeCompile).toBe(before);
  });
});

describe("the USE_BATCHING branch (decision 0082 round 1)", () => {
  it("injects both branches and reads the per-instance data texture", () => {
    const material = new THREE.MeshStandardMaterial();
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "void main() {\n#include <begin_vertex>\n}",
      fragmentShader: "void main() {\n}",
    };
    applyLodFade(material, createLodFadeUniforms());
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      null as unknown as THREE.WebGLRenderer,
    );
    expect(shader.vertexShader).toContain("#ifdef USE_INSTANCING");
    expect(shader.vertexShader).toContain("#elif defined(USE_BATCHING)");
    expect(shader.vertexShader).toContain("esBatchTexel(0)");
    expect(shader.vertexShader).toContain("batchingMatrix[3].xyz");
    expect(shader.vertexShader).toContain("getIndirectIndex(gl_DrawID)");
    // The terrain-occlusion collapse, read from the swept mask.
    expect(shader.vertexShader).toContain("esOccMask");
    expect(shader.vertexShader).toContain(
      `esLodD > ${OCCLUSION_MIN_DISTANCE_M.toFixed(1)}`);
  });
});

describe("applyBatchData", () => {
  it("binds its uniforms and survives the CSM onBeforeCompile overwrite", () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createBatchDataUniforms();
    applyBatchData(material, undefined, uniforms);
    material.onBeforeCompile = () => undefined; // what CSM does
    reapplyBatchData(material);
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "void main() {\n#include <begin_vertex>\n}",
      fragmentShader: "void main() {\n}",
    };
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      null as unknown as THREE.WebGLRenderer,
    );
    expect(shader.vertexShader).toContain("esBatchTexel");
    expect(shader.uniforms.esBatchData).toBe(uniforms.esBatchData);
    expect(shader.uniforms.esOccParams).toBe(uniforms.esOccParams);
  });

  it("a grown batch reuses the patched material and re-points its texture", () => {
    // `Material.clone` JSON-copies userData and drops onBeforeCompile, so a
    // batch that grows must REUSE its material, never re-clone it.
    const material = new THREE.MeshStandardMaterial();
    const uniforms = createBatchDataUniforms();
    applyBatchData(material, undefined, uniforms);
    const first = createBatchDataTexture(8);
    uniforms.esBatchData.value = first;
    // What growBatch does: same material object, a bigger data texture.
    const grown = createBatchDataTexture(16);
    uniforms.esBatchData.value = grown;
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "void main() {\n}",
      fragmentShader: "void main() {\n}",
    };
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      null as unknown as THREE.WebGLRenderer,
    );
    expect(shader.vertexShader).toContain("esBatchTexel");
    expect(shader.uniforms.esBatchData).toBe(uniforms.esBatchData);
    expect((shader.uniforms.esBatchData as { value: unknown }).value).toBe(grown);
    // The husk a clone would have produced patches nothing.
    const cloned = material.clone();
    expect(cloned.userData.esBatchWrapped).toBeUndefined();
  });

  it("writes two RGBA texels per instance", () => {
    const texture = createBatchDataTexture(4);
    writeBatchInstance(texture, 2, [1, 2, 3, 4], -0.5, 0.25);
    const data = texture.image.data as Float32Array;
    expect([...data.slice(16, 24)]).toEqual([1, 2, 3, 4, -0.5, 0.25, 0, 0]);
  });
});
