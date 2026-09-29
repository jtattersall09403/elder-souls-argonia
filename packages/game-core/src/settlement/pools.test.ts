import { describe, expect, it } from "vitest";
import { LocalWaterSurfaces, type LocalPoolRecord } from "../water/localSurfaces";
import { assertPoolsSchema, syncPlacePools } from "./pools";
import { assembleSettlementBundle, type SettlementPartBundle } from "./settlementIndex";

const pool = (id: string): LocalPoolRecord => ({
  id, centreM: [10, 20], radiusM: 4, levelM: 30.92, bedM: 30.4,
});

describe("place pools (16k walk 4)", () => {
  it("registers a loaded place's pools and unregisters them when it leaves or the layer unmounts", () => {
    const s = new LocalWaterSurfaces();
    let registered = syncPlacePools(s, new Set(), [
      { id: "place.a", pools: [pool("pool.place.a.spring")] }, { id: "place.b" }]);
    expect(s.list().map((p) => p.id)).toEqual(["pool.place.a.spring"]);
    expect(s.at(10, 20)?.levelM).toBe(30.92);
    expect([...registered]).toEqual(["place.a"]);
    // place.a leaves the loaded set: its pool goes
    registered = syncPlacePools(s, registered, [{ id: "place.b" }]);
    expect(s.list()).toEqual([]);
    expect(s.at(10, 20)).toBeNull();
    // loaded again, then the layer unmounts (sync with nothing loaded)
    registered = syncPlacePools(s, registered, [{ id: "place.a", pools: [pool("pool.place.a.spring")] }]);
    expect(s.list()).toHaveLength(1);
    registered = syncPlacePools(s, registered, []);
    expect(s.list()).toEqual([]);
    expect(registered.size).toBe(0);
  });

  it("refuses pools on a bundle schema before 5, naming the version", () => {
    const places = [{ id: "place.a", pools: [pool("pool.place.a.spring")] }];
    expect(() => assertPoolsSchema(4, places)).toThrow(/schema 4 carries pools \(place\.a\); pools need schema 5/);
    expect(() => assertPoolsSchema(4, [{ id: "place.a" }])).not.toThrow();
    expect(() => assertPoolsSchema(5, places)).not.toThrow();
  });

  it("refuses an old place bundle with pools even when a newer bundle is in the set", () => {
    const part = (id: string, schemaVersion: number, pools?: LocalPoolRecord[]): SettlementPartBundle => ({
      schemaVersion, collisionFrame: "f", kind: "settlement-place-bundle", placeId: id,
      lod: { tiers: 3, absoluteTriangleFloor: [1, 1], distancePerFootprintDiagonal: [1, 1],
        farMergeDistanceM: 1, atlasMaxSize: 1, colliderRadiusM: 1, colliderPartBudget: 1 },
      kits: {}, settlement: { id, placementIds: [], boundaryM: [], budgetReport: null,
        floodBandReport: {}, variants: [], ...(pools ? { pools } : {}) },
      placements: [], groundTreatments: [], navmeshCuts: [], navmeshLinks: [], doors: [],
      compiledObjects: [],
    });
    const entries = [{ id: "place.a", bundle: "a", sha256: "1" }, { id: "place.b", bundle: "b", sha256: "2" }];
    expect(() => assembleSettlementBundle(
      [part("place.a", 4, [pool("pool.place.a.spring")]), part("place.b", 5)], entries as never))
      .toThrow(/schema 4 carries pools/);
    const ok = assembleSettlementBundle(
      [part("place.a", 5, [pool("pool.place.a.spring")]), part("place.b", 4)], entries as never);
    expect(ok.schemaVersion).toBe(5);
    expect(ok.settlements[0].pools).toHaveLength(1);
  });
});
