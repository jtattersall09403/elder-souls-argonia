import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  encodeRoutesUrl, parseRoutesUrl, pixelLengthKm, selectMajor, selectMinor,
  type RouteGeometry, type RoutesIndexBundle,
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
