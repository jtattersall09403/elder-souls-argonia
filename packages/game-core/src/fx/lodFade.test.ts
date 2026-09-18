import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyLodFade,
  createLodFadeUniforms,
  lodCopies,
  lodCopyCollapsed,
  lodFadeFactors,
  lodLadder,
  lodPixelKept,
  reapplyLodFade,
  BAYER4_THRESHOLDS,
  LOD_CULL_BAND_M,
  LOD_MARGIN_M,
  LOD_OPEN_M,
  LOD_REBUILD_MOVE_M,
  LOD_FRAGMENT_TEST,
} from "./lodFade";

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
 * Walk the camera in from `from` to 1 m with a rebuild every
 * LOD_REBUILD_MOVE_M of CHARACTER movement (the throttle at speed adds up to
 * `slack` more) while the camera sits `cameraOffset` metres ahead of (-) or
 * behind (+) the character, and require exactly one copy per pixel on every
 * frame. Returns the frames that broke it.
 */
function walk(
  { ladder, vanish, maxDraw }: { ladder: ReturnType<typeof lodLadder>; vanish: boolean; maxDraw: number },
  cameraOffset: number,
  slack = 0,
  from = maxDraw + 40,
): string[] {
  const holes: string[] = [];
  let character = from;
  let copies = lodCopies(character + cameraOffset, ladder, vanish);
  let lastBuild = character;
  for (; character > 1; character -= 0.25) {
    if (lastBuild - character > LOD_REBUILD_MOVE_M + slack) {
      const eye = character + cameraOffset;
      copies = lodCopies(eye, ladder, vanish);
      lastBuild = character;
    }
    const d = character + cameraOffset;
    if (d < 0 || d > maxDraw - LOD_CULL_BAND_M) continue;
    const bands = copies.map((c) => c.band);
    for (const bayer of BAYER4_THRESHOLDS) {
      const n = coverage(bands, d, bayer);
      if (n !== 1) holes.push(`d=${d.toFixed(2)} bayer=${bayer}: ${n} copies`);
    }
  }
  return holes;
}

describe("every frame draws exactly one copy per pixel", () => {
  for (const [name, ladder] of Object.entries(LADDERS)) {
    for (const cameraOffset of [0, 5.8, -5.8]) {
      it(`${name}, camera ${cameraOffset} m from the character, rebuild every ${LOD_REBUILD_MOVE_M} m`, () => {
        expect(walk(ladder, cameraOffset).slice(0, 5)).toEqual([]);
      });
    }
    it(`${name}, a sprint that overruns the rebuild by the throttle slack`, () => {
      expect(walk(ladder, -5.8, LOD_MARGIN_M - LOD_REBUILD_MOVE_M - 1).slice(0, 5)).toEqual([]);
    });
    it(`${name}, a rebuild that never lands still draws one copy per pixel`, () => {
      // Outrun completely: the level is wrong for a while, never absent.
      const holes: string[] = [];
      const copies = lodCopies(ladder.maxDraw - 10, ladder.ladder, ladder.vanish);
      for (let d = 0; d < ladder.maxDraw - LOD_CULL_BAND_M; d += 0.5) {
        for (const bayer of BAYER4_THRESHOLDS) {
          if (coverage(copies.map((c) => c.band), d, bayer) !== 1) holes.push(`d=${d}`);
        }
      }
      expect(holes.slice(0, 5)).toEqual([]);
    });
  }

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

describe("lodCopies", () => {
  const { ladder } = LADDERS.palm19;
  it("emits one open copy well away from any boundary", () => {
    // The card rung is wide: 300 m is more than a margin from both its edges.
    const copies = lodCopies(300, ladder, false);
    expect(copies).toEqual([{ level: 3, band: [0, LOD_OPEN_M, 0, 0] }]);
  });
  it("closes an edge only against a neighbour that was emitted", () => {
    const copies = lodCopies(96 - 10, ladder, false);
    expect(copies.map((c) => c.level)).toEqual([1, 2]);
    expect(copies[0].band).toEqual([0, 96, 0, 0]);
    expect(copies[1].band).toEqual([96, LOD_OPEN_M, 0, 0]);
  });
  it("a vanishing species dithers its last edge; a land tree never does", () => {
    const [rock] = lodCopies(60, LADDERS.rock2m.ladder, true);
    expect(rock.band).toEqual([0, 70, 0, LOD_CULL_BAND_M]);
    const [tree] = lodCopies(1900, ladder, false);
    expect(tree.band[1]).toBe(LOD_OPEN_M);
  });
  it("never emits a level outside the ladder and never nothing", () => {
    for (let d = 0; d <= 2100; d += 3) {
      const copies = lodCopies(d, ladder, false);
      expect(copies.length).toBeGreaterThan(0);
      for (const c of copies) expect(ladder.some((r) => r.level === c.level)).toBe(true);
    }
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

  it("is a no-op on a material it never touched", () => {
    const material = new THREE.MeshStandardMaterial();
    const before = material.onBeforeCompile;
    reapplyLodFade(material);
    expect(material.onBeforeCompile).toBe(before);
  });
});
