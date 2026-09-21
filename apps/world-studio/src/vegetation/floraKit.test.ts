import { describe, expect, it } from "vitest";
import {
  lodDistances,
  lodRings,
  maxDrawDistance,
  treeDrawDistance,
  MIN_MESH_LOD_REACH_M,
  SUBMERGED_LOD_SCALE,
} from "./floraKit";

describe("lodRings", () => {
  it("keeps the ladder ordered and the mesh reach at its floor at every quality scale", () => {
    // 16f round 4: the low preset (0.55) scaled ring 1 INSIDE ring 0 for tall
    // species — an inverted ladder that skipped level 1 (see `lodRings`).
    // Rung edges are hard steps since 2026-09-21, so there is no band width to
    // assert: what still matters is the order and the full-mesh reach.
    for (const drawScale of [0.55, 0.8, 1]) {
      for (const submerged of [false, true]) {
        for (let heightM = 0.3; heightM <= 70; heightM += 0.7) {
          const rings = lodRings(heightM, drawScale, submerged);
          const floor = MIN_MESH_LOD_REACH_M * (submerged ? SUBMERGED_LOD_SCALE : 1);
          expect(rings[0]).toBeGreaterThanOrEqual(floor - 1e-9);
          for (let i = 1; i < rings.length; i++) {
            expect(rings[i]).toBeGreaterThanOrEqual(rings[i - 1] - 1e-9);
          }
        }
      }
    }
  });

  it("never scales the near ring down", () => {
    expect(lodRings(20, 0.55, false)[0]).toBe(lodDistances(20)[0]);
  });
});

describe("tree draw distance", () => {
  it("reaches the far corner of the outermost loaded chunk, past any height cap", () => {
    const reach = treeDrawDistance(2, 467.93);
    expect(reach).toBeCloseTo(3 * 467.93 * Math.SQRT2, 3);
    // No tree height reaches that under the T-tier cap, which is what made
    // trees vanish at 350–900 m in round 3.
    expect(maxDrawDistance(70)).toBeLessThan(reach);
  });
});
