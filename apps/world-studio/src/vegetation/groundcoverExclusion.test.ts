import { describe, expect, it } from "vitest";
import {
  excludedByFootprints,
  nearReachFraction,
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

describe("near-tier reach scales with the mesh's cost", () => {
  it("gives a typical grass clump the full reach", () => {
    expect(nearReachFraction(250)).toBe(1);
  });
  it("gives a cheaper mesh no more than the full reach", () => {
    expect(nearReachFraction(60)).toBe(1);
  });
  it("halves the reach for a mesh twice the reference cost", () => {
    expect(nearReachFraction(500)).toBeCloseTo(0.5, 10);
  });
  it("floors the reach for the spiky-grass tuft", () => {
    expect(nearReachFraction(2298)).toBeCloseTo(0.25, 10);
  });
});
