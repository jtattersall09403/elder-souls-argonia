import { describe, expect, it } from "vitest";
import {
  excludedByFootprints,
  foundationScatterPoints,
  foundationScatterWeight,
} from "./Groundcover";

describe("building groundcover exclusion", () => {
  const footprint: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  it("rejects origins inside the building", () => {
    expect(excludedByFootprints(5, 5, 0, [footprint])).toBe(true);
  });
  it("includes the species radius outside the wall", () => {
    expect(excludedByFootprints(11.5, 5, 2, [footprint])).toBe(true);
    expect(excludedByFootprints(12.5, 5, 2, [footprint])).toBe(false);
  });
});

describe("authored foundation scatter band", () => {
  const treatment = {
    id: "treatment.test-house",
    footprintM: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][],
    foundationScatterBandM: [0, 1.2] as [number, number],
  };

  it("is zero inside and outside the band, and peaks beside the wall", () => {
    expect(foundationScatterWeight(5, 5, treatment)).toBe(0);
    expect(foundationScatterWeight(5, -1.2, treatment)).toBe(0);
    expect(foundationScatterWeight(5, -0.1, treatment))
      .toBeGreaterThan(foundationScatterWeight(5, -0.9, treatment));
  });

  it("produces deterministic points only outside the building and inside the band", () => {
    const first = foundationScatterPoints(treatment);
    expect(first.length).toBeGreaterThan(0);
    expect(foundationScatterPoints(treatment)).toEqual(first);
    for (const point of first) {
      expect(excludedByFootprints(point.x, point.z, 0, [treatment.footprintM])).toBe(false);
      expect(foundationScatterWeight(point.x, point.z, treatment)).toBeGreaterThan(0);
    }
  });
});
