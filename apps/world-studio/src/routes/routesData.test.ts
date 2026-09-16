import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  METRES_PER_HYDRO_PX, crossingLabel, encodeRoutesUrl, gradeLabel, metresToPx, parseRouteLayers,
  parseRoutesUrl, pixelLengthKm, selectMajor, selectMinor, serviceLabel, stationLabel,
  structureLabel, structurePx,
  type RouteGeometry, type RouteGrade, type RouteStructure, type RoutesIndexBundle,
  type TravelService, type TravelStation, type WaterCrossing,
} from "./routesData";
import { hydroPixelCenterToUv, METRES_PER_HYDRO_SAMPLE } from "../provinceScale";

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
    expect(encodeRoutesUrl({ showWater: false, selectedKey: null, subLayers: [] })).toEqual({});
    const s = parseRoutesUrl(new URLSearchParams({ water: "1", route: "route.road.soulrest-blackrose" }));
    expect(s.showWater).toBe(true);
    expect(s.subLayers).toEqual([]);
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
    expect(structurePx(s)).toEqual([metresToPx([0, 0]), metresToPx([METRES_PER_HYDRO_PX, 0])]);
    expect(structureLabel(s)).toBe("stair — 2 pieces, 4.3 m rise over 30 m");
  });

  it("keeps every structure on a way the map actually draws", () => {
    const ids = new Set(roads.map((r) => r.id));
    for (const s of bundle.structures) {
      if (s.wayId.startsWith("route.road.")) expect(ids.has(s.wayId), s.wayId).toBe(true);
    }
  });
});


describe("the four route sub-layers (16e deliverable 8)", () => {
  it("maps province metres to the pixel space the layer's uv helper expects", () => {
    // metre → pixel → uv must round-trip to the metre's own fraction of the
    // authored frame: the half-pixel the uv helper re-adds is taken off here.
    const m = 10_000;
    const [c] = metresToPx([m, 0]);
    expect(c).toBeCloseTo(m / METRES_PER_HYDRO_SAMPLE - 0.5, 9);
    expect(hydroPixelCenterToUv(c) * 4034 * 1.82784).toBeCloseTo(m, 6);
    expect(metresToPx([0, METRES_PER_HYDRO_SAMPLE])[1]).toBeCloseTo(0.5, 9);
  });

  it("parses the routeLayers query in a fixed order and ignores unknown names", () => {
    expect(parseRouteLayers(null)).toEqual([]);
    expect(parseRouteLayers("services, spans,bogus")).toEqual(["spans", "services"]);
    const s = parseRoutesUrl(new URLSearchParams({ routeLayers: "grades,crossings" }));
    expect(s.subLayers).toEqual(["grades", "crossings"]);
    expect(encodeRoutesUrl(s)).toEqual({ routeLayers: "grades,crossings" });
  });

  const grade: RouteGrade = {
    id: "patch.route-grade.x.000", wayId: "route.road.x", class: "road",
    fromM: 21, toM: 41.5, lengthM: 20.5, worstDegBefore: 8.08, capDeg: 8,
    gradientAfterDeg: 7.41, maxDeltaM: 0.95, maxAbsDeltaM: 0.57, shoulderM: 2,
    why: "the ground ran over the cap", lineM: [[0, 0], [10, 0]],
  };

  it("labels a grade patch from the record, before → after, with the applied delta", () => {
    const t = gradeLabel(grade);
    expect(t).toContain("route.road.x");
    expect(t).toContain("chainage 21–42 m, 21 m long");
    expect(t).toContain("gradient 8.08° → 7.41° (cap 8.0°)");
    expect(t).toContain("max |delta| 0.57 m");
    expect(t).toContain("shoulder 2.0 m");
    expect(t).toContain("the ground ran over the cap");
  });

  it("says which number it is showing when the apply receipt is absent", () => {
    expect(gradeLabel({ ...grade, maxAbsDeltaM: null })).toContain("0.95 m (authored bound)");
  });

  it("labels a crossing with its band, water, span, depth and the routes it serves", () => {
    const c: WaterCrossing = {
      id: "crossing.major.001", water: "lake", band: "ferry", spanM: 411.3, maxDepthM: 6.84,
      entityId: "body.221-1650", entityKind: "tarn-upland", positionM: [430.9, 3092.6],
      banks: [[524.9, 3191.4], [350.2, 3044.1]], servesRoutes: ["route.road.gideon-blackwood-road"],
      wayName: "the Blackwood Road", nearestPlaceName: "The Drowning Gate",
    };
    const t = crossingLabel(c);
    expect(t).toContain("crossing.major.001");
    expect(t).toContain("ferry — lake on the Blackwood Road");
    expect(t).toContain("411 m across, 6.84 m deep");
    expect(t).toContain("body.221-1650 (tarn-upland)");
    expect(t).toContain("serves route.road.gideon-blackwood-road");
    expect(t).toContain("near The Drowning Gate");
  });

  it("labels a service by kind, fare, operator and status, and a station by its berth", () => {
    const sv: TravelService = {
      id: "boat.alten-corimont-helstrom", serviceKind: "boat", form: "station-run",
      status: "active", fare: { gold: 5 }, operator: { role: "boat owner" },
      hops: [{ from: "station.a", to: "station.b" }],
    };
    const t = serviceLabel(sv);
    expect(t).toContain("boat (station-run)");
    expect(t).toContain("5 gold");
    expect(t).toContain("operator: boat owner");
    expect(t).toContain("status: active");

    const st: TravelStation = {
      id: "ferry-landing.drowning-gate.east", kind: "ferry-landing", positionM: [350.2, 3044.1],
      status: "active", berth: { depthM: 2.64, floats: true },
    };
    const label = stationLabel(st);
    expect(label).toContain("ferry-landing");
    expect(label).toContain("berth 2.64 m deep, floats");
  });
});
