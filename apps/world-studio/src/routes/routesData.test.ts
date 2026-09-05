import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  METRES_PER_HYDRO_PX, encodeRoutesUrl, parseRoutesUrl, pixelLengthKm, selectMajor, selectMinor,
  structureLabel, structurePx,
  type RouteGeometry, type RouteStructure, type RoutesIndexBundle,
} from "./routesData";

const province = (f: string) => JSON.parse(readFileSync(join(__dirname, "../../public/province", f), "utf8"));
const index = province("routes-index.json") as RoutesIndexBundle;
const roads = province("routes.json").routes as RouteGeometry[];
const lanes = province("waterways.json").lanes as RouteGeometry[];

describe("routes index (worldgen.export_routes)", () => {
  it("is schemaVersion 1 and keyed by route id", () => {
    expect(index.schemaVersion).toBe(1);
    for (const [id, r] of Object.entries(index.routes)) {
      expect(id).toMatch(/^route\.(road|boat|track)\./);
      expect(r.mode && r.class && r.from && r.to).toBeTruthy();
    }
  });

  it("joins every drawn road and boat lane to a registry entry", () => {
    for (const g of [...roads, ...lanes]) {
      expect(g.id, `${g.from}→${g.to} has no id`).toBeTruthy();
      expect(index.routes[g.id!], `${g.id} missing from routes-index.json`).toBeDefined();
    }
  });

  it("selects a road with its registry fields, and a minor track without", () => {
    const sel = selectMajor(roads[0], "road", index);
    expect(sel.registry).not.toBeNull();
    expect(sel.name.length).toBeGreaterThan(0);
    expect(sel.lengthKm).toBeGreaterThan(0);
    const minor = selectMinor(
      { id: "track.x.y", kind: "footpath", from: "place.a.b", to: "network", lengthKm: 0.4, px: [[0, 0], [3, 4]] },
      "track", index, (id) => (id === "place.a.b" ? "Bogmother" : id));
    expect(minor.registry).toBeNull();
    expect(minor.id).toBeNull();
    expect(minor.name).toBe("Bogmother → network");
  });

  it("measures pixel paths in km and round-trips the URL state", () => {
    expect(pixelLengthKm([[0, 0], [1000, 0]], 5.48352)).toBeCloseTo(5.48352, 3);
    expect(encodeRoutesUrl({ showWater: false, selectedKey: null })).toEqual({});
    const s = parseRoutesUrl(new URLSearchParams({ water: "1", route: "route.road.soulrest-blackrose" }));
    expect(s.showWater).toBe(true);
    expect(encodeRoutesUrl(s)).toEqual({ water: "1", route: "route.road.soulrest-blackrose" });
  });
});

describe("route structures (worldgen.compile_route_structures)", () => {
  const bundle = province("route-structures.json") as
    { schemaVersion: number; structures: RouteStructure[] };

  it("is schemaVersion 1, with a stable id, a piece count and a why on every entry", () => {
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.structures.length).toBeGreaterThan(0);
    for (const s of bundle.structures) {
      expect(s.id).toMatch(/^structure\./);
      expect(s.wayId).toMatch(/^(route|track)\./);
      expect(s.pieces).toBeGreaterThan(0);
      expect(s.pointsM.length).toBe(s.pieces);
      expect(s.why.length).toBeGreaterThan(20);
    }
  });

  it("converts world metres to the hydrology grid the layer draws in", () => {
    const s: RouteStructure = {
      id: "structure.x.1", wayId: "track.x.y", kind: "stair", family: "stone-rural",
      pieces: 2, riseM: -4.25, spanM: 30, why: "because", pointsM: [[0, 0], [METRES_PER_HYDRO_PX, 0]],
    };
    expect(structurePx(s)).toEqual([[0, 0], [1, 0]]);
    expect(structureLabel(s)).toBe("stair — 2 pieces, 4.3 m rise over 30 m");
  });

  it("keeps every structure on a way the map actually draws", () => {
    const ids = new Set(roads.map((r) => r.id));
    for (const s of bundle.structures) {
      if (s.wayId.startsWith("route.road.")) expect(ids.has(s.wayId), s.wayId).toBe(true);
    }
  });
});
