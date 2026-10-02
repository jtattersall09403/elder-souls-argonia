import { describe, expect, it } from "vitest";
import { LocalWaterSurfaces, poolBedAt, type LocalPoolRecord } from "./localSurfaces";
import { WaterData, type WaterMeta } from "./waterData";
import { WaterWorld } from "./waterWorld";
import { IMMERSION_COLUMN_METRES, immersionAt } from "../physics/waterSampler";
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

describe("a place's pool answers the player's water query like shallow field water", () => {
  const meta: WaterMeta = {
    surface: { file: "", size: 2, metresPerPixel: 10000, minM: -10, maxM: 10, buryM: 3 },
    flow: { file: "", size: 2, metresPerPixel: 10000, flowMax: 3, shoreMaxM: 160 },
    klass: { file: "", size: 2, metresPerPixel: 10000, classes: ["none", "lake"] },
  };
  // dry province water (surface far below the ground); the pool is the only water
  const data = new WaterData(meta, new Float32Array([-9, -9, -9, -9]), new Float32Array(4),
    new Uint8ClampedArray(16), new Uint8ClampedArray(16));
  function world(groundHeight?: (x: number, z: number) => number | null) {
    const surfaces = new LocalWaterSurfaces();
    surfaces.set("place.greenspring", [spring]);
    return new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0,
      groundHeight, localSurfaces: surfaces });
  }

  it("is wet at the spring's level inside the rim, over the cut ground, with the field's column immersion", () => {
    const w = world(() => 2.45);
    const top = 2.45 + IMMERSION_COLUMN_METRES; // column top of a walker standing on the bed
    const s = w.sample({ x: 4718, y: top, z: 1868 }, 0);
    expect(s.waterBodyId).toBe("pool.greenspring.spring");
    expect(s.surfaceHeight).toBe(2.95);
    expect(s.depth).toBeCloseTo(0.5, 6);
    expect(s.immersion).toBeCloseTo(immersionAt(2.95, top), 9);
    expect(s.immersion).toBeCloseTo(0.5 / IMMERSION_COLUMN_METRES, 6); // wading, below the swim threshold
    expect(w.sampleBoundary(4719, 1868, w.levelOffsets(0), { waterBodyId: null, depth: 0, surfaceHeight: 0 }).waterBodyId).toBe("pool.greenspring.spring");
  });

  it("is dry outside the rim and where the ground stands above the level", () => {
    expect(world(() => 2.45).sample({ x: 4718 + 2.6, y: 3, z: 1868 }, 0).waterBodyId).toBeNull();
    const high = world(() => 3.1).sample({ x: 4718, y: 3.1, z: 1868 }, 0);
    expect(high.waterBodyId).toBeNull();
    expect(high.immersion).toBe(0);
  });

  it("falls back to the published bowl bed where no ground chunk is loaded", () => {
    expect(world().sample({ x: 4718, y: 3, z: 1868 }, 0).depth).toBeCloseTo(0.55, 6);
  });
});
