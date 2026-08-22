import { describe, expect, it } from "vitest";
import anchorsFile from "../../../world/sources/anchors/settlement-anchors.json";

const anchors = anchorsFile.anchors;

describe("settlement anchors source data", () => {
  it("has unique ids", () => {
    expect(new Set(anchors.map((a) => a.id)).size).toBe(anchors.length);
  });

  it("keeps every anchor and its tolerance inside the province extent", () => {
    for (const a of anchors) {
      expect(a.u, a.id).toBeGreaterThanOrEqual(0);
      expect(a.u, a.id).toBeLessThanOrEqual(1);
      expect(a.v, a.id).toBeGreaterThanOrEqual(0);
      expect(a.v, a.id).toBeLessThanOrEqual(1);
      expect(a.toleranceUV, a.id).toBeGreaterThan(0);
      expect(a.toleranceUV, a.id).toBeLessThan(0.2);
    }
  });

  it("contains the eight canonical major cities", () => {
    const majors = anchors.filter((a) => a.rank === "major").map((a) => a.id).sort();
    expect(majors).toEqual([
      "archon", "blackrose", "gideon", "helstrom",
      "lilmoth", "soulrest", "stormhold", "thorn",
    ]);
  });
});
