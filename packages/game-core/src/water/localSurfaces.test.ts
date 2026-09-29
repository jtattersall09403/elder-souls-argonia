import { describe, expect, it } from "vitest";
import { LocalWaterSurfaces, poolBedAt, type LocalPoolRecord } from "./localSurfaces";
import { buildPoolGeometry, POOL_RINGS, POOL_SEGMENTS } from "./render/PoolDiscs";

const spring: LocalPoolRecord = { id: "pool.greenspring.spring", centreM: [4718, 1868], radiusM: 2.5, levelM: 2.95, bedM: 2.4 };

describe("local water surfaces (a place's pools)", () => {
  it("answers the level inside the rim and nothing outside", () => {
    const s = new LocalWaterSurfaces();
    s.set("place.hist-heartland.greenspring", [spring]);
    expect(s.at(4718, 1868)?.levelM).toBe(2.95);
    expect(s.at(4718, 1868)?.bedM).toBeCloseTo(2.4, 6);
    expect(s.at(4718 + 2.5, 1868)?.bedM).toBeCloseTo(2.95, 6);
    expect(s.at(4718 + 2.6, 1868)).toBeNull();
  });
  it("replaces an owner's pools and tells its listeners", () => {
    const s = new LocalWaterSurfaces();
    const seen: number[] = [];
    s.subscribe(p => seen.push(p.length));
    s.set("a", [spring]);
    s.set("a", []);
    expect(seen).toEqual([1, 0]);
    expect(s.list()).toHaveLength(0);
  });
  it("refuses a pool with no depth or an unreal radius", () => {
    const s = new LocalWaterSurfaces();
    expect(() => s.set("a", [{ ...spring, bedM: 3 }])).toThrow(RangeError);
    expect(() => s.set("a", [{ ...spring, radiusM: 40 }])).toThrow(RangeError);
  });
  it("builds a strip-mode disc whose vertices carry the level and a bowl bed", () => {
    const built = buildPoolGeometry([spring])!;
    const n = 1 + POOL_RINGS * POOL_SEGMENTS;
    expect(built.geometry.getAttribute("position").count).toBe(n);
    expect(built.triangleCount).toBe(POOL_SEGMENTS + (POOL_RINGS - 1) * POOL_SEGMENTS * 2);
    const still = built.geometry.getAttribute("aStill");
    const bed = built.geometry.getAttribute("aBedDepth");
    for (let i = 0; i < n; i++) expect(still.getX(i)).toBeCloseTo(2.95, 5);
    expect(bed.getX(0)).toBeCloseTo(0.55, 6);
    expect(bed.getX(n - 1)).toBeCloseTo(0.05, 6);
    for (const name of ["aFlow", "aSeason", "aDrop", "aSide", "aSideM", "aArc", "aScroll", "aEdge", "aRockFoam"]) {
      expect(built.geometry.getAttribute(name)).toBeDefined();
    }
    expect(poolBedAt(spring, 0)).toBe(2.4);
  });
});
