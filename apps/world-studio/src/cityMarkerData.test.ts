/** City beacons read their positions from the exported data (owner 2026-09-05). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PlottedPlace, PlottedPlacesBundle } from "@elder-souls/contracts";
import type { Blueprint, BlueprintBundle } from "./blueprints/blueprintsData";
import { cityMarkers, polygonCentroid } from "./cityMarkerData";

const readJson = <T,>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../public/province/${name}`, import.meta.url), "utf8")) as T;

const place = (id: string, tier: number, xz: [number, number]): PlottedPlace =>
  ({ id, name: id, importanceTier: tier, positionM: xz } as unknown as PlottedPlace);

const blueprint = (id: string, boundary: [number, number][]): Blueprint =>
  ({ id, boundary } as unknown as Blueprint);

describe("polygonCentroid", () => {
  it("finds the area centroid of a rectangle", () => {
    expect(polygonCentroid([[0, 0], [10, 0], [10, 4], [0, 4]])).toEqual([5, 2]);
  });
  it("falls back to the vertex mean for a degenerate ring", () => {
    expect(polygonCentroid([[2, 2], [4, 2]])).toEqual([3, 2]);
  });
  it("has nothing to say about an empty ring", () => {
    expect(polygonCentroid([])).toBeNull();
  });
});

describe("cityMarkers", () => {
  const places = [
    place("place.a.city", 0, [100, 100]),
    place("place.b.town", 1, [200, 200]),
    place("place.c.shack", 3, [300, 300]),
  ];

  it("takes only tier 0 and tier 1 places", () => {
    expect(cityMarkers(places).map((m) => m.id)).toEqual(["place.a.city", "place.b.town"]);
  });

  it("stands on the blueprint centroid when a blueprint exists", () => {
    const marks = cityMarkers(places, [blueprint("place.a.city", [[150, 90], [170, 90], [170, 110], [150, 110]])]);
    const city = marks.find((m) => m.id === "place.a.city")!;
    expect([city.xM, city.zM]).toEqual([160, 100]);
    expect(city.fromBlueprint).toBe(true);
    expect(marks.find((m) => m.id === "place.b.town")!.fromBlueprint).toBe(false);
  });

  it("prefers an exported centreM over the boundary centroid", () => {
    const bp = { ...blueprint("place.a.city", [[0, 0], [10, 0], [10, 10], [0, 10]]), centreM: [7, 3] } as Blueprint;
    const city = cityMarkers(places, [bp]).find((m) => m.id === "place.a.city")!;
    expect([city.xM, city.zM]).toEqual([7, 3]);
  });

  it("marks tier 0 major and tier 1 minor", () => {
    const marks = cityMarkers(places);
    expect(marks.map((m) => m.major)).toEqual([true, false]);
  });
});

describe("the exported province data", () => {
  const places = readJson<PlottedPlacesBundle>("places.json").places;
  const blueprints = readJson<BlueprintBundle>("blueprints.json").blueprints;
  const marks = cityMarkers(places, blueprints);

  it("produces a beacon for every tier 0/1 place", () => {
    const expected = places.filter((p) => p.importanceTier <= 1 && p.positionM).length;
    expect(marks.length).toBe(expected);
    expect(marks.length).toBeGreaterThan(8);
  });

  it("stands Lilmoth on its blueprint, east of the place anchor", () => {
    const lilmoth = marks.find((m) => m.id === "place.mercantile-coast.lilmoth")!;
    const anchor = places.find((p) => p.id === lilmoth.id)!.positionM!;
    expect(lilmoth.fromBlueprint).toBe(true);
    expect(lilmoth.xM).toBeGreaterThan(anchor[0] + 20);
    expect(Math.hypot(lilmoth.xM - anchor[0], lilmoth.zM - anchor[1])).toBeLessThan(200);
  });

  it("keeps every beacon inside the province", () => {
    for (const m of marks) {
      expect(m.xM, m.id).toBeGreaterThanOrEqual(0);
      expect(m.xM, m.id).toBeLessThanOrEqual(8000);
      expect(m.zM, m.id).toBeGreaterThanOrEqual(0);
      expect(m.zM, m.id).toBeLessThanOrEqual(8000);
    }
  });
});
