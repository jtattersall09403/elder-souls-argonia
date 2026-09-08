import { describe, expect, it } from "vitest";
import { excludedByFootprints } from "./Groundcover";

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
