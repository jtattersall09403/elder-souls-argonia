import { describe, expect, it } from "vitest";
import { occludedByTerrain } from "./terrainOcclusionReference.testkit";

const eye = { x: 0, y: 2, z: 0 };
const target = { x: 300, y: 2, z: 0 };

describe("occludedByTerrain", () => {
  it("flat ground does not occlude", () => {
    expect(occludedByTerrain(eye, target, () => 0)).toBe(false);
  });

  it("a 30 m ridge between eye and target occludes", () => {
    const ridge = (x: number) => (x > 120 && x < 180 ? 30 : 0);
    expect(occludedByTerrain(eye, target, (x) => ridge(x))).toBe(true);
  });

  it("unknown ground never occludes", () => {
    expect(occludedByTerrain(eye, target, () => null)).toBe(false);
  });

  it("the first 24 m are never tested (the eye stands on the ground)", () => {
    const bump = (x: number) => (x < 20 ? 50 : 0);
    expect(occludedByTerrain(eye, target, (x) => bump(x))).toBe(false);
  });

  it("nothing inside the skip distance is ever occluded", () => {
    expect(occludedByTerrain(eye, { x: 10, y: 2, z: 0 }, () => 100)).toBe(false);
  });
});
