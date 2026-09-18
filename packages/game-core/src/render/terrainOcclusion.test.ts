import { describe, expect, it } from "vitest";
import {
  occludedByTerrain,
  OcclusionCellCache,
  OCCLUSION_CELL_M,
} from "./terrainOcclusion";

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

describe("OcclusionCellCache", () => {
  it("tests one ray per 32 m cell", () => {
    let calls = 0;
    const cache = new OcclusionCellCache(eye, () => { calls++; return 0; }, 20);
    cache.occluded(400, 0);
    const afterFirst = calls;
    cache.occluded(400 + OCCLUSION_CELL_M / 4, 0); // same cell
    expect(calls).toBe(afterFirst);
    expect(cache.tested).toBe(1);
    cache.occluded(400 + OCCLUSION_CELL_M * 2, 0); // another cell
    expect(cache.tested).toBe(2);
  });

  it("raises the target to the cell's canopy top, so a low ridge does not hide a tall tree", () => {
    const ridge = (x: number) => (x > 120 && x < 180 ? 12 : 0);
    const short = new OcclusionCellCache(eye, (x) => ridge(x), 0);
    const tall = new OcclusionCellCache(eye, (x) => ridge(x), 40);
    expect(short.occluded(400, 0)).toBe(true);
    expect(tall.occluded(400, 0)).toBe(false);
  });

  it("a cell whose ground is unknown is never culled", () => {
    const cache = new OcclusionCellCache(eye, () => null, 20);
    expect(cache.occluded(400, 0)).toBe(false);
  });
});
