import { describe, expect, it } from "vitest";
import {
  SettlementBundleSource, assembleSettlementBundle, bundlesInRange,
  type SettlementIndex,
  type SettlementPartBundle,
} from "./settlementIndex";

const entry = (i: number, x: number, radiusM = 50) => ({
  id: `place.p${String(i).padStart(2, "0")}`, positionM: [x, 0] as [number, number], radiusM,
  bundle: `settlements/place.p${String(i).padStart(2, "0")}.json`, sha256: `sha${i}`,
});

describe("bundlesInRange (S8)", () => {
  it("picks by range even when the index is short (walk 9: all eleven loaded everywhere)", () => {
    const index: SettlementIndex = { schemaVersion: 1,
      places: Array.from({ length: 3 }, (_, i) => entry(i, i * 10_000)) };
    expect(bundlesInRange(index, { x: 0, z: 0 }).map((e) => e.id)).toEqual(["place.p00"]);
  });

  it("with 25 places loads only those within 2 km plus their radius", () => {
    // p00..p24 at x = 0, 500, 1000 ... 12 000 m; radius 50 m: 0..2050 m is in
    const index: SettlementIndex = { schemaVersion: 1,
      places: Array.from({ length: 25 }, (_, i) => entry(i, i * 500)) };
    const ids = bundlesInRange(index, { x: 0, z: 0 }).map((e) => e.id);
    expect(ids).toEqual(["place.p00", "place.p01", "place.p02", "place.p03", "place.p04"]);
    // a big place's radius reaches into range from 2.4 km away
    index.places[5] = entry(5, 2400, 500);
    expect(bundlesInRange(index, { x: 0, z: 0 }).map((e) => e.id)).toContain("place.p05");
    expect(bundlesInRange(index, null)).toHaveLength(25);
  });
});

describe("SettlementBundleSource (S8)", () => {
  const part = (id: string, x: number): SettlementPartBundle => ({
    schemaVersion: 4, collisionFrame: "f", kind: "settlement-place-bundle", placeId: id,
    lod: { tiers: 3, absoluteTriangleFloor: [1, 1], distancePerFootprintDiagonal: [1, 1],
      farMergeDistanceM: 1, atlasMaxSize: 1, colliderRadiusM: 1, colliderPartBudget: x > 0 ? 9 : 4 },
    kits: {}, settlement: { id, placementIds: [`${id}.a`], boundaryM: [], budgetReport: null,
      floodBandReport: {}, variants: [] },
    placements: [], groundTreatments: [], navmeshCuts: [], navmeshLinks: [], doors: [],
    compiledObjects: [],
  });

  it("owns each load's result, publishes only on request, and evicts bundles outside the published set", async () => {
    const places = Array.from({ length: 25 }, (_, i) => entry(i, i * 500));
    const fetched: string[] = [];
    const source = new SettlementBundleSource("/", async (url) => {
      fetched.push(url);
      if (url.endsWith("index.json")) return { schemaVersion: 1, places };
      const id = url.replace(/^.*settlements\//, "").replace(/\.json$/, "");
      return part(id, places.find((p) => p.id === id)!.positionM[0]);
    });
    const heard: string[][] = [];
    source.subscribe((set) => heard.push(set.bundleIds));
    const first = await source.load({ x: 0, z: 0 });
    expect(first.bundleIds).toHaveLength(5);
    expect(first.lod.colliderPartBudget).toBe(9);
    expect(heard).toEqual([]);                      // a load broadcasts nothing
    source.publish(first);
    expect((await source.load({ x: 10, z: 0 })).key).toBe(first.key);
    source.publish(await source.load({ x: 10, z: 0 }));
    expect(heard).toHaveLength(1);                  // same key: not re-sent
    // a far load (another reader's) does not change what is published
    const far = await source.load({ x: 12_000, z: 0 });
    expect(far.bundleIds).toContain("place.p24");
    expect(source.published()!.key).toBe(first.key);
    // the next publish evicts the far bundles; the published ones stay cached
    source.publish(first);
    expect(source.cachedBundleCount()).toBe(5);
    await source.load({ x: 0, z: 0 });
    expect(fetched.filter((u) => u.endsWith("place.p00.json"))).toHaveLength(1);
    expect(fetched.filter((u) => u.endsWith("index.json"))).toHaveLength(1);
    // the caller's range: 5.5 km from x = 0 reaches p00..p11 (5500 + 50 m)
    expect((await source.load({ x: 0, z: 0 }, 5500)).bundleIds).toHaveLength(12);
  });

  it("refuses a set whose bundles carry different collision frames", () => {
    const a = part("place.a", 0);
    const b = { ...part("place.b", 1), collisionFrame: "old-frame" };
    expect(() => assembleSettlementBundle([a, b]))
      .toThrow(/mixed settlement collision frames: f \(place\.a\); old-frame \(place\.b\)/);
    expect(assembleSettlementBundle([a, part("place.c", 1)]).collisionFrame).toBe("f");
  });
});
