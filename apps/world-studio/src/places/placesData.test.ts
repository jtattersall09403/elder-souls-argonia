import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEAD_STATUSES, DUNGEON_KINDS, EMPTY_FILTER, dotRadius, encodePlacesUrl, isUnderwaterEntry,
  matchesFilter, parsePlacesUrl,
  type PlottedPlace, type PlottedPlacesBundle,
} from "./placesData";

const bundle = JSON.parse(
  readFileSync(join(__dirname, "../../public/province/places.json"), "utf8"),
) as PlottedPlacesBundle;

describe("plotted places bundle (worldgen.export_places)", () => {
  it("is schemaVersion 2, sorted by id, every dot inside the province", () => {
    expect(bundle.schemaVersion).toBe(2);
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
      pq: "thorn", place: "place.dunmer-north.andalen-plantation", tracks: "1",
      ps: "hostile,wary", pk: "delve", pf: "root-cavern", pp: "dungeon-delve", pi: "major",
      pdg: "1", puw: "1" });
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

  it("filters the schema-v2 axes: stance, interior, purpose, dungeon-like, underwater", () => {
    const delve = bundle.places.find((q) => DUNGEON_KINDS.has(q.interiorDetail?.kind ?? ""));
    expect(delve, "no dungeon-like place in the bundle").toBeDefined();
    expect(matchesFilter(delve!, { ...EMPTY_FILTER, dungeonLike: true })).toBe(true);
    expect(matchesFilter(delve!, { ...EMPTY_FILTER, stances: new Set([delve!.stance ?? "?"]) })).toBe(true);
    expect(matchesFilter(delve!, { ...EMPTY_FILTER, stances: new Set(["not-a-stance"]) })).toBe(false);
    const building = bundle.places.find((q) => q.interiorDetail?.kind === "building");
    expect(matchesFilter(building!, { ...EMPTY_FILTER, dungeonLike: true })).toBe(false);
    const wet = bundle.places.find(isUnderwaterEntry);
    expect(wet, "no underwater entrance in the bundle").toBeDefined();
    expect(matchesFilter(wet!, { ...EMPTY_FILTER, underwater: true })).toBe(true);
    const dry = bundle.places.find((q) => !isUnderwaterEntry(q))!;
    expect(matchesFilter(dry, { ...EMPTY_FILTER, underwater: true })).toBe(false);
    const withPurpose = bundle.places.find((q) => q.purposeDetail?.primary)!;
    expect(matchesFilter(withPurpose, { ...EMPTY_FILTER, purposes: new Set([withPurpose.purposeDetail!.primary!]) })).toBe(true);
    expect(matchesFilter(withPurpose, { ...EMPTY_FILTER, impacts: new Set(["not-an-impact"]) })).toBe(false);
  });

  it("carries the schema-v2 detail blocks the review panel renders", () => {
    for (const p of bundle.places) {
      expect(Array.isArray(p.questProvisions)).toBe(true);
      if (p.stanceDetail) expect(p.stanceDetail.baseline).toBe(p.stance);
      if (p.contents) {
        for (const line of [...p.contents.creatures, ...p.contents.npcs, ...p.contents.loot]) {
          expect(typeof line).toBe("string");
        }
      }
      if (p.travelStation) {
        for (const d of p.travelStation.destinations) expect(d.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("sizes dots by importance, tier 0 largest", () => {
    expect(dotRadius(0)).toBeGreaterThan(dotRadius(1));
    expect(dotRadius(4)).toBeGreaterThan(0);
    expect(dotRadius(9)).toBe(dotRadius(4));
  });
});
