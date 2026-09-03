import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEAD_STATUSES, EMPTY_FILTER, dotRadius, encodePlacesUrl, matchesFilter, parsePlacesUrl,
  type PlottedPlace, type PlottedPlacesBundle,
} from "./placesData";

const bundle = JSON.parse(
  readFileSync(join(__dirname, "../../public/province/places.json"), "utf8"),
) as PlottedPlacesBundle;

describe("plotted places bundle (worldgen.export_places)", () => {
  it("is schemaVersion 1, sorted by id, every dot inside the province", () => {
    expect(bundle.schemaVersion).toBe(1);
    const ids = bundle.places.map((p) => p.id);
    expect(ids).toEqual([...ids].sort());
    for (const p of bundle.places) {
      expect(p.id).toMatch(/^place\.[a-z0-9-]+\.[a-z0-9-]+$/);
      expect(p.position.u).toBeGreaterThanOrEqual(0);
      expect(p.position.u).toBeLessThanOrEqual(1);
      expect(p.position.v).toBeGreaterThanOrEqual(0);
      expect(p.position.v).toBeLessThanOrEqual(1);
      expect(bundle.zoneColours[p.region], `${p.id}: region ${p.region} has no zone colour`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("URL state round-trips and stays short by default", () => {
    expect(encodePlacesUrl({ filter: EMPTY_FILTER, selectedId: null, showTracks: false, showSites: false })).toEqual({});
    const q = new URLSearchParams({ pr: "dunmer-north,hist-heartland", pt: "0,1", pc: "ruin", pd: "D3", pl: "landmark",
      pq: "thorn", place: "place.dunmer-north.andalen-plantation", tracks: "1" });
    const s = parsePlacesUrl(q);
    expect([...s.filter.regions]).toEqual(["dunmer-north", "hist-heartland"]);
    expect(encodePlacesUrl(s)).toEqual(Object.fromEntries(q.entries()));
  });

  it("filters by every axis and by text on name or id", () => {
    const p = bundle.places[0];
    expect(matchesFilter(p, EMPTY_FILTER)).toBe(true);
    expect(matchesFilter(p, { ...EMPTY_FILTER, regions: new Set(["nowhere"]) })).toBe(false);
    expect(matchesFilter(p, { ...EMPTY_FILTER, tiers: new Set([String(p.importanceTier)]) })).toBe(true);
    expect(matchesFilter(p, { ...EMPTY_FILTER, search: p.id.slice(-6).toUpperCase() })).toBe(true);
    const dead: PlottedPlace = { ...p, status: "drowned" };
    expect(DEAD_STATUSES.has(dead.status)).toBe(true);
  });

  it("sizes dots by importance, tier 0 largest", () => {
    expect(dotRadius(0)).toBeGreaterThan(dotRadius(1));
    expect(dotRadius(4)).toBeGreaterThan(0);
    expect(dotRadius(9)).toBe(dotRadius(4));
  });
});
