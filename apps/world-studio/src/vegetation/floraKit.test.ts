import { describe, expect, it } from "vitest";
import {
  lodDistances,
  lodRings,
  maxDrawDistance,
  treeDrawDistance,
  MIN_MESH_LOD_REACH_M,
  SUBMERGED_LOD_SCALE,
} from "./floraKit";
import { lodLadder } from "@elder-souls/game-core/fx/lodFade";

describe("lodDistances (folded chain)", () => {
  it("gives a folded species one reach at clamp(height x 5, 30, 140)", () => {
    // Round 9: an alpha-tested plant's mesh chain is one geometry, so the
    // extra rings charged full-mesh triangles to 260 m for nothing. One reach,
    // then the card (decision 0084; Skyrim's ~140 m loaded grid).
    expect(lodDistances(0.9, true)).toEqual([30, 30, 30]);
    expect(lodDistances(9.2, true)).toEqual([46, 46, 46]);
    expect(lodDistances(28.5, true)).toEqual([140, 140, 140]);
    // The ladder folds the three identical levels into one mesh rung.
    expect(lodLadder(lodDistances(9.2, true), 1, 1, 400)).toEqual([
      { level: 0, lo: 0, hi: 46 },
      { level: 1, lo: 46, hi: 400 },
    ]);
  });
});

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
