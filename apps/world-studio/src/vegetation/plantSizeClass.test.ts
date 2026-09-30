import { describe, expect, it } from "vitest";
import { QUALITY_PRESETS } from "@elder-souls/game-core/core/quality";
import {
  isLargePlant,
  TREE_MESH_FLOOR_M,
  LARGE_PLANT_TOP_TIER_M,
  plantDrawDistance,
  SMALL_PLANT_TOP_TIER_M,
  speciesRings,
} from "./floraKit";

// Owner walk 6: large bushes hold their full mesh to ~200 m in medium; small
// ones keep the near radius; big trees card no nearer than 200 m in medium.
describe("plant size class", () => {
  it("classes by geometry: height or half footprint >= 2.5 m", () => {
    expect(isLargePlant(3.8, 4.2)).toBe(true); // bigshrub2
    expect(isLargePlant(1.2, 7.5)).toBe(true); // tundrashrub03, wide
    expect(isLargePlant(1.1, 2.8)).toBe(false); // braken
    expect(isLargePlant(2.2, 2.9)).toBe(false); // fallforest shrub
  });

  for (const q of ["low", "medium", "high"] as const) {
    const p = QUALITY_PRESETS[q];
    it(`${q}: large plants keep mesh to the large radius and draw past it; small stay near`, () => {
      const big = speciesRings({ heightM: 3.8, footprintM: 4.2, meshLevels: 1, category: "shrub", submerged: false, folded: true }, p.vegDrawScale, q);
      const small = speciesRings({ heightM: 1.1, footprintM: 2.8, meshLevels: 1, category: "shrub", submerged: false, folded: true }, p.vegDrawScale, q);
      expect(big[0]).toBeGreaterThanOrEqual(LARGE_PLANT_TOP_TIER_M[q]);
      expect(small[0]).toBeLessThan(LARGE_PLANT_TOP_TIER_M[q]);
      expect(small[0]).toBeGreaterThanOrEqual(SMALL_PLANT_TOP_TIER_M[q]);
      expect(plantDrawDistance(3.8, 4.2, p.vegDrawScale, q)).toBeGreaterThan(big[0]);
    });
  }

  it("medium: the 19 m, 380-triangle aspen at the owner site cards at >= 200 m, a 42 m tiered tree at >= 240 m; a heavy tree keeps max(base reach, floor)", () => {
    const m = QUALITY_PRESETS.medium;
    const folded = speciesRings({ heightM: 19, triangles: 380, meshLevels: 1, category: "tree", submerged: false, folded: true }, m.vegDrawScale, "medium");
    const heavy = speciesRings({ heightM: 15, triangles: 4000, meshLevels: 1, category: "tree", submerged: false, folded: true }, m.vegDrawScale, "medium");
    expect(heavy[0]).toBeCloseTo(Math.max(15 * 7 * m.vegDrawScale, TREE_MESH_FLOOR_M.medium), 6);
    const tiered = speciesRings({ heightM: 42, meshLevels: 3, category: "tree", submerged: false, folded: false }, m.vegDrawScale, "medium");
    expect(folded[0]).toBeGreaterThanOrEqual(200);
    expect(tiered[2]).toBeGreaterThanOrEqual(240);
  });

  it("medium: a heavy single-level tree >= 6 m keeps its mesh to the floor; a 4 m tree is unaffected", () => {
    const m = QUALITY_PRESETS.medium;
    const mangrove = speciesRings({ heightM: 9.3, triangles: 4039, meshLevels: 1, category: "tree", submerged: false, folded: true }, m.vegDrawScale, "medium");
    expect(mangrove[0]).toBeGreaterThanOrEqual(TREE_MESH_FLOOR_M.medium);
    const small = speciesRings({ heightM: 4, triangles: 4039, meshLevels: 1, category: "tree", submerged: false, folded: true }, m.vegDrawScale, "medium");
    expect(small[0]).toBeLessThan(TREE_MESH_FLOOR_M.medium);
  });
});
