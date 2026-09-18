import { describe, expect, it } from "vitest";
import { LOD_BAND_M } from "@elder-souls/game-core/fx/lodFade";
import { lodDistances, lodRings, maxDrawDistance, treeDrawDistance } from "./floraKit";

describe("lodRings", () => {
  it("keeps every level at least one crossfade band wide at every quality scale", () => {
    // 16f round 4: the low preset (0.55) scaled ring 1 INSIDE ring 0 for tall
    // species — an inverted ladder that skipped level 1 (see `lodRings`).
    for (const drawScale of [0.55, 0.8, 1]) {
      for (const submerged of [false, true]) {
        for (let heightM = 0.3; heightM <= 70; heightM += 0.7) {
          const rings = lodRings(heightM, drawScale, submerged);
          expect(rings[0]).toBeGreaterThanOrEqual(2 * LOD_BAND_M);
          for (let i = 1; i < rings.length; i++) {
            expect(rings[i] - rings[i - 1]).toBeGreaterThanOrEqual(2 * LOD_BAND_M - 1e-9);
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
