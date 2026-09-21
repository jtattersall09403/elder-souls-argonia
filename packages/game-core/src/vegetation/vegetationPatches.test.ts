import { describe, expect, it } from "vitest";
import {
  clearanceBoundsM,
  DEFAULT_KEPT_RADIUS_M,
  edgeJitter,
  FRINGE_FALLOFF_M,
  FRINGE_MIN_KEEP,
  KEPT_RADIUS_M,
  WALL_ENRICH_BAND_M,
  WALL_ENRICH_GAIN,
  indexPatches,
  keepAt,
  PATCH_GRID_PAD_M,
  keepForExtent,
  patchesNear,
  survivesPatches,
  type IndexedPatch,
  type VegetationClearancePatch,
  type VegetationPatchesDoc,
  type VegetationPatchRecord,
} from "./vegetationPatches";

const HARD = [[[100, 100], [200, 100], [200, 200], [100, 200]]] as const;
const THIN = [[[50, 50], [250, 50], [250, 250], [50, 250]]] as const;
const CLEARANCE: VegetationClearancePatch = {
  hardClear: HARD as never,
  thinned: THIN as never,
  kept: [{ id: "kept.test.hist", kind: "hist-tree", positionM: [150, 150] }],
};

const DOC: VegetationPatchesDoc = {
  schemaVersion: 1,
  patches: [{
    id: "patch.test.town",
    kind: "vegetation-clearance",
    owner: { record: "place.test", chunk: "16h" },
    why: "the runtime twin needs a patch to evaluate",
    ...CLEARANCE,
  }],
};

/**
 * Emitted by `worldgen.vegetation_patches.keep_at` — the compiler's own
 * answers. The compiled tiers and this runtime layer must agree exactly, or a
 * settlement is cleared of trees and still full of grass.
 */
const PYTHON_KEEP: [number, number, number][] = [
  [120, 100, 0], [127, 99.3, 0.480315028], [134, 98.6, 0.393000157],
  [141, 97.9, 0.355], [148, 97.2, 0.39], [155, 96.5, 0.425],
  [162, 95.8, 0.46], [169, 95.1, 0.495], [176, 94.4, 0.53],
  [183, 93.7, 0.565], [190, 93, 0.6], [197, 92.3, 0.635],
  [204, 91.6, 0.715188134], [211, 90.9, 0.963810199], [121, 90.2, 0.74],
  [128, 89.5, 0.775], [135, 88.8, 0.81], [142, 88.1, 0.845],
  [149, 87.4, 0.88], [156, 86.7, 0.915], [163, 86, 0.95],
  [170, 85.3, 0.985], [177, 84.6, 1], [184, 83.9, 1],
];

describe("vegetation-clearance patches, runtime side", () => {
  it("agrees with the compiler's rule to the last digit", () => {
    for (const [x, z, expected] of PYTHON_KEEP) {
      expect(keepAt(x, z, CLEARANCE)).toBeCloseTo(expected, 8);
    }
  });

  it("leaves nothing growing on built ground", () => {
    expect(keepAt(150, 130, CLEARANCE)).toBe(0);
    expect(keepAt(110, 190, CLEARANCE)).toBe(0);
  });

  it("keeps the Hist's own ground inside the clearing", () => {
    expect(keepAt(150, 150, CLEARANCE)).toBe(1);
    expect(keepAt(167, 150, CLEARANCE)).toBe(1);
    expect(keepAt(169, 150, CLEARANCE)).toBe(0);
  });

  it("grades the fringe rather than stepping it", () => {
    const walk = [98, 95, 90, 85].map((z) => keepAt(150, z, CLEARANCE));
    expect(walk).toEqual([...walk].sort((a, b) => a - b));
    expect(walk[0]).toBeGreaterThan(0);
    expect(walk[0]).toBeLessThan(1);
    expect(keepAt(150, 60, CLEARANCE)).toBe(1);
    expect(FRINGE_MIN_KEEP).toBeLessThan(0.5);
  });

  it("clears a wide plant by its fronds, not by its origin", () => {
    // A metre outside the wall: the origin survives, a 5 m fern does not.
    const outside = { x: 150, z: 96 };
    expect(keepAt(outside.x, outside.z, CLEARANCE)).toBeGreaterThan(0);
    expect(keepForExtent(outside.x, outside.z, 5, [CLEARANCE])).toBe(0);
  });

  it("keeps no grass at all inside a building footprint, at any roll", () => {
    const indexed = indexPatches(DOC);
    for (let roll = 0; roll < 1; roll += 0.05) {
      expect(survivesPatches(150, 130, 0.4, indexed, roll)).toBe(false);
    }
    // Wild marsh a field away is untouched whatever the roll.
    expect(survivesPatches(600, 600, 0.4, indexed, 0.99)).toBe(true);
  });

  it("thins the fringe without emptying it", () => {
    const indexed = indexPatches(DOC);
    let survivors = 0;
    const trials = 200;
    for (let n = 0; n < trials; n++) {
      if (survivesPatches(150, 92, 0.2, indexed, n / trials)) survivors++;
    }
    expect(survivors).toBeGreaterThan(trials * 0.2);
    expect(survivors).toBeLessThan(trials * 0.8);
  });

  it("refuses a patch document of the wrong schema version", () => {
    expect(() => indexPatches({ schemaVersion: 2, patches: [] })).toThrow(/schemaVersion/);
  });

  it("indexes the streamed patch list and skips distant ground", () => {
    const indexed = indexPatches(DOC);
    expect(indexed).toHaveLength(1);
    expect(indexed[0].id).toBe("patch.test.town");
    expect(patchesNear(150, 150, indexed)).toHaveLength(1);
    expect(patchesNear(5000, 5000, indexed)).toHaveLength(0);
  });
});

describe("patch grid (2026-09-20 hitch fix)", () => {
  // A deterministic LCG: the test must not depend on Math.random.
  function lcg(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  it("returns exactly what the linear scan returns", () => {
    const rnd = lcg(20260920);
    const patches: VegetationPatchRecord[] = [];
    for (let i = 0; i < 50; i++) {
      const x = (rnd() - 0.5) * 6000;
      const z = (rnd() - 0.5) * 6000;
      const w = 10 + rnd() * 400;
      const h = 10 + rnd() * 400;
      patches.push({
        id: `p${i}`,
        hardClear: [[[x, z], [x + w, z], [x + w, z + h], [x, z + h]]],
      });
    }
    const indexed = indexPatches({ schemaVersion: 1, patches });
    expect(indexed.grid).toBeTruthy();
    // The same entries with the grid stripped: the linear path.
    const linear: IndexedPatch[] = indexed.map((e) => e);

    for (let i = 0; i < 500; i++) {
      const x = (rnd() - 0.5) * 7000;
      const z = (rnd() - 0.5) * 7000;
      const pad = rnd() * PATCH_GRID_PAD_M;
      const viaGrid = patchesNear(x, z, indexed, pad);
      const viaScan = patchesNear(x, z, linear, pad);
      expect(new Set(viaGrid)).toEqual(new Set(viaScan));
      expect(viaGrid.length).toBe(viaScan.length);
    }
  });

  it("falls back to the full scan when the pad exceeds the stamped margin", () => {
    const indexed = indexPatches({
      schemaVersion: 1,
      patches: [{ id: "a", hardClear: [[[0, 0], [10, 0], [10, 10], [0, 10]]] }],
    });
    const far = PATCH_GRID_PAD_M + 200;
    expect(patchesNear(-100, 5, indexed, far)).toHaveLength(1);
  });
});

describe("patch segment index (2026-09-21 generation cost)", () => {
  // The implementation this replaced, kept here as the reference answer: a
  // linear walk of every segment of every polygon.
  type Poly = readonly (readonly [number, number])[];
  function bruteInside(x: number, z: number, poly: Poly): boolean {
    let inside = false;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i];
      const [bx, bz] = poly[(i + 1) % poly.length];
      if ((az > z) !== (bz > z)) {
        const t = (z - az) / (bz - az);
        if (x < ax + t * (bx - ax)) inside = !inside;
      }
    }
    return inside;
  }
  function bruteDistance(x: number, z: number, poly: Poly): number {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i];
      const [bx, bz] = poly[(i + 1) % poly.length];
      const dx = bx - ax; const dz = bz - az;
      const length2 = dx * dx + dz * dz;
      const t = length2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2));
      best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
    }
    return best;
  }
  /** `keepAt` as it was written before the index. */
  function bruteKeepAt(x: number, z: number, c: VegetationClearancePatch): number {
    for (const kept of c.kept ?? []) {
      const radius = (kept.kind && KEPT_RADIUS_M[kept.kind]) || DEFAULT_KEPT_RADIUS_M;
      if (Math.hypot(x - kept.positionM[0], z - kept.positionM[1]) <= radius) return 1;
    }
    const near = (polys: readonly Poly[]) => {
      let inside = false; let best = Infinity;
      for (const poly of polys) {
        if (poly.length < 3) continue;
        if (bruteInside(x, z, poly)) inside = true;
        best = Math.min(best, bruteDistance(x, z, poly));
      }
      return { inside, distance: best };
    };
    const hard = c.hardClear ?? [];
    const falloff = c.fringeFalloffM || FRINGE_FALLOFF_M;
    let dHard = Infinity; let dWall = Infinity;
    if (hard.length > 0) {
      const n = near(hard);
      const jitter = edgeJitter(x, z);
      if (n.inside || n.distance <= jitter) return 0;
      dHard = n.distance;
      dWall = dHard - jitter;
    }
    const thin = near(c.thinned ?? []);
    if (!thin.inside) return 1;
    if (hard.length === 0) dHard = Math.max(0, falloff - thin.distance);
    const t = falloff > 0 ? Math.min(1, dHard / falloff) : 1;
    let keep = FRINGE_MIN_KEEP + (1 - FRINGE_MIN_KEEP) * t;
    if (dWall < WALL_ENRICH_BAND_M) {
      keep *= 1 + WALL_ENRICH_GAIN * (1 - dWall / WALL_ENRICH_BAND_M);
    }
    return Math.min(1, keep);
  }

  function lcg(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  const rnd = lcg(20260921);
  // A 3,000-vertex road corridor: the shape that cost 110-555 ms a tile.
  const half = 1500;
  const spine: [number, number][] = [];
  for (let i = 0; i <= half; i++) {
    const t = i / half;
    spine.push([t * 900, 400 + Math.sin(t * 9) * 60 + Math.cos(t * 23) * 8]);
  }
  const corridor: [number, number][] = [
    ...spine.map(([x, z]) => [x, z - 5] as [number, number]),
    ...[...spine].reverse().map(([x, z]) => [x, z + 5] as [number, number]),
  ];
  const cases: VegetationClearancePatch[] = [
    { hardClear: [corridor], thinned: [] },
    CLEARANCE,
    { hardClear: [[[0, 0], [40, 0], [40, 40], [0, 40]]] as never, thinned: [] },
    { thinned: [[[-200, -200], [200, -200], [200, 200], [-200, 200]]] as never },
    {
      hardClear: [[[300, 300], [360, 305], [355, 380], [290, 350]]] as never,
      thinned: [[[260, 260], [400, 260], [400, 420], [260, 420]]] as never,
      fringeFalloffM: 6,
    },
  ];

  it("gives the brute-force answer for every query", () => {
    let cleared = 0; let graded = 0;
    for (const clearance of cases) {
      const b = clearanceBoundsM(clearance)!;
      for (let i = 0; i < 500; i++) {
        const x = b.minX - 20 + rnd() * (b.maxX - b.minX + 40);
        const z = b.minZ - 20 + rnd() * (b.maxZ - b.minZ + 40);
        const mine = keepAt(x, z, clearance);
        const theirs = bruteKeepAt(x, z, clearance);
        expect(Math.abs(mine - theirs)).toBeLessThan(1e-9);
        expect(mine === 0).toBe(theirs === 0);
        if (mine === 0) cleared++; else if (mine < 1) graded++;
      }
    }
    // fixture: the points must actually land on built ground and in fringes,
    // or this test agrees with the reference about nothing.
    expect(cleared).toBeGreaterThan(50);
    expect(graded).toBeGreaterThan(50);
  });
});
