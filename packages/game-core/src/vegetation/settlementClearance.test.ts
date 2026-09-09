import { describe, expect, it } from "vitest";
import {
  FRINGE_MIN_KEEP,
  clearancesNear,
  indexClearances,
  keepAt,
  keepForExtent,
  survivesClearance,
  type SettlementClearance,
} from "./settlementClearance";

const HARD = [[[100, 100], [200, 100], [200, 200], [100, 200]]] as const;
const THIN = [[[50, 50], [250, 50], [250, 250], [50, 250]]] as const;
const CLEARANCE: SettlementClearance = {
  hardClear: HARD as never,
  thinned: THIN as never,
  kept: [{ id: "kept.test.hist", kind: "hist-tree", positionM: [150, 150] }],
};

/**
 * Emitted by `worldgen.settlement_clearance.keep_at` — the compiler's own
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

describe("settlement clearance, runtime side", () => {
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
    const indexed = indexClearances({
      blueprints: [{ id: "place.test", clearance: CLEARANCE }],
    });
    for (let roll = 0; roll < 1; roll += 0.05) {
      expect(survivesClearance(150, 130, 0.4, indexed, roll)).toBe(false);
    }
    // Wild marsh a field away is untouched whatever the roll.
    expect(survivesClearance(600, 600, 0.4, indexed, 0.99)).toBe(true);
  });

  it("thins the fringe without emptying it", () => {
    const indexed = indexClearances({
      blueprints: [{ id: "place.test", clearance: CLEARANCE }],
    });
    let survivors = 0;
    const trials = 200;
    for (let n = 0; n < trials; n++) {
      if (survivesClearance(150, 92, 0.2, indexed, n / trials)) survivors++;
    }
    expect(survivors).toBeGreaterThan(trials * 0.2);
    expect(survivors).toBeLessThan(trials * 0.8);
  });

  it("indexes the streamed blueprint bundle and skips distant ground", () => {
    const indexed = indexClearances({
      blueprints: [{ id: "place.test", clearance: CLEARANCE }],
    });
    expect(indexed).toHaveLength(1);
    expect(clearancesNear(150, 150, indexed)).toHaveLength(1);
    expect(clearancesNear(5000, 5000, indexed)).toHaveLength(0);
  });
});
