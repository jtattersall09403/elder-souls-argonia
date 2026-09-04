/**
 * Data + URL-state helpers for the "Places (Phase 11 plot)" map layer — the
 * owner's Part 4 review medium (decision 0041 Part 0 item 5).
 *
 *  - places.json:        apps/world-studio/public/province/places.json, written
 *                        by `python3 -m worldgen.export_places` (re-run after any
 *                        catalogue change; the pytest test_export_places fails
 *                        when it is stale). Shape: PlottedPlacesBundle (contracts).
 *  - routes-minor.json:  optional local tracks (another workstream); absence is
 *                        tolerated and reported, never thrown.
 *  - candidate sites:    world/sources/sites/candidate-sites.json underlay (~1 MB,
 *                        dynamically imported only when switched on).
 *
 * No module-level mutable state: loaders return values, the component owns them.
 */
import type {
  MinorTracksBundle,
  PlottedPlace,
  PlottedPlaceQuestLink,
  PlottedPlacesBundle,
} from "@elder-souls/contracts";

export type {
  PlottedPlace, PlottedPlacesBundle, MinorTrack, MinorTracksBundle,
  PlottedPlaceContents, PlottedPlaceInterior, PlottedPlacePurpose, PlottedPlaceStance,
  PlottedPlaceTravelStation, PlottedPlaceQuestLink, PlottedQuestGroup,
} from "@elder-souls/contracts";

/** Pixel side of the hydrology grid that routes.json / routes-minor.json index. */
export const HYDRO_GRID_PX = 1345;

export async function loadPlaces(baseUrl: string): Promise<PlottedPlacesBundle> {
  const r = await fetch(`${baseUrl}province/places.json`);
  if (!r.ok) throw new Error(`places.json: HTTP ${r.status}`);
  const data = (await r.json()) as PlottedPlacesBundle;
  if (data.schemaVersion !== 2) throw new Error(`places.json schemaVersion ${data.schemaVersion} unsupported — re-run python3 -m worldgen.export_places`);
  return data;
}

/** `null` when the file is absent (404) — the layer simply has nothing to draw. */
export async function loadMinorTracks(baseUrl: string): Promise<MinorTracksBundle | null> {
  const r = await fetch(`${baseUrl}province/routes-minor.json`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`routes-minor.json: HTTP ${r.status}`);
  const ct = r.headers.get("content-type") ?? "";
  // Vite's dev server answers a missing public file with index.html (200).
  if (!ct.includes("json")) return null;
  const data = (await r.json()) as MinorTracksBundle;
  return Array.isArray(data.tracks) ? data : null;
}

export interface CandidateSite {
  id: string;
  landform: string;
  uv: [number, number];
  regionName: string;
  elevationM: number;
  slopeDeg: number;
  detectorScore: number;
}

export interface CandidateSiteSet {
  landformClasses: string[];
  sites: CandidateSite[];
}

/** Terrain-scour supply (Part 0 item 2). `landformClasses` in the file is a
 * keyed detector table; its key order is the legend order here. */
export async function loadCandidateSites(): Promise<CandidateSiteSet> {
  const mod = (await import("../../../../world/sources/sites/candidate-sites.json")) as unknown as {
    default?: { landformClasses?: Record<string, unknown>; sites?: CandidateSite[] };
  };
  const data = mod.default ?? (mod as { landformClasses?: Record<string, unknown>; sites?: CandidateSite[] });
  return { landformClasses: Object.keys(data.landformClasses ?? {}), sites: data.sites ?? [] };
}

/** Stable hue ramp keyed by index (deterministic). */
export function landformColour(index: number, total: number): string {
  return `hsl(${Math.round((index / Math.max(1, total)) * 320)} 70% 62%)`;
}

// ---------------------------------------------------------------------------
// Drawing conventions
// ---------------------------------------------------------------------------

/** Dot radius in viewBox units (VB=1000): tier 0 largest. */
export function dotRadius(tier: number): number {
  return Math.max(3.5, 10 - Math.min(4, Math.max(0, tier)) * 1.6);
}

/** Statuses drawn with the distinct (dashed, pale) outline. */
export const DEAD_STATUSES = new Set(["ruined", "abandoned", "drowned"]);

export function zoneColour(bundle: PlottedPlacesBundle | null, region: string): string {
  return bundle?.zoneColours[region] ?? "#9aa5b1";
}

export const TRACK_DASH: Record<string, string | undefined> = {
  track: undefined,
  footpath: "4 3",
  boardwalk: "1.5 2",
  causeway: "6 2",
};

// ---------------------------------------------------------------------------
// Filters and their URL round-trip (reproducible URLs, module 85 §67)
// ---------------------------------------------------------------------------

/** Interior kinds the owner calls "dungeon-like" (as opposed to `building`). */
export const DUNGEON_KINDS = new Set(["delve", "dungeon", "complex", "warren"]);

/** An underwater way in: the entrance itself, or an Argonian dive route. */
export function isUnderwaterEntry(p: PlottedPlace): boolean {
  return p.entrance === "underwater-entry" || (p.underwaterAccess !== null && p.underwaterAccess !== "none");
}

export interface PlacesFilter {
  regions: Set<string>;
  tiers: Set<string>;
  classes: Set<string>;
  dangers: Set<string>;
  densities: Set<string>;
  /** Hostility baseline (the six schema-v2 stances). */
  stances: Set<string>;
  /** Interior kind and family. */
  interiorKinds: Set<string>;
  interiorFamilies: Set<string>;
  /** playerPurpose.primary / .impact. */
  purposes: Set<string>;
  impacts: Set<string>;
  /** Shortcut over interiorKinds: any of DUNGEON_KINDS. */
  dungeonLike: boolean;
  /** Only places with an underwater entrance or dive access. */
  underwater: boolean;
  /** Quest grouping keys (owner 2026-09-04): `main`, `faction:<line id>`, `other`,
   * `minor`, plus `any` (linked to some quest) and `none` (linked to no quest). */
  quests: Set<string>;
  search: string;
}

export interface PlacesUrlState {
  filter: PlacesFilter;
  selectedId: string | null;
  showTracks: boolean;
  showSites: boolean;
}

export const EMPTY_FILTER: PlacesFilter = {
  regions: new Set(), tiers: new Set(), classes: new Set(), dangers: new Set(), densities: new Set(),
  stances: new Set(), interiorKinds: new Set(), interiorFamilies: new Set(),
  purposes: new Set(), impacts: new Set(), dungeonLike: false, underwater: false, quests: new Set(), search: "",
};

/** Query keys owned by this layer (the `cat=1` toggle itself is App's). */
export const PLACES_URL_KEYS = [
  "pr", "pt", "pc", "pd", "pl", "pq", "place", "tracks", "sites",
  "ps", "pk", "pf", "pp", "pi", "pdg", "puw", "pqs",
] as const;

function setOf(v: string | null): Set<string> {
  return new Set((v ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export function parsePlacesUrl(q: URLSearchParams): PlacesUrlState {
  return {
    filter: {
      regions: setOf(q.get("pr")),
      tiers: setOf(q.get("pt")),
      classes: setOf(q.get("pc")),
      dangers: setOf(q.get("pd")),
      densities: setOf(q.get("pl")),
      stances: setOf(q.get("ps")),
      interiorKinds: setOf(q.get("pk")),
      interiorFamilies: setOf(q.get("pf")),
      purposes: setOf(q.get("pp")),
      impacts: setOf(q.get("pi")),
      dungeonLike: q.get("pdg") === "1",
      underwater: q.get("puw") === "1",
      quests: setOf(q.get("pqs")),
      search: q.get("pq") ?? "",
    },
    selectedId: q.get("place"),
    showTracks: q.get("tracks") === "1",
    showSites: q.get("sites") === "1",
  };
}

/** Only non-default entries are emitted, so a fresh view keeps a short URL. */
export function encodePlacesUrl(s: PlacesUrlState): Record<string, string> {
  const out: Record<string, string> = {};
  const list = (key: string, set: Set<string>) => {
    if (set.size) out[key] = [...set].sort().join(",");
  };
  list("pr", s.filter.regions);
  list("pt", s.filter.tiers);
  list("pc", s.filter.classes);
  list("pd", s.filter.dangers);
  list("pl", s.filter.densities);
  list("ps", s.filter.stances);
  list("pk", s.filter.interiorKinds);
  list("pf", s.filter.interiorFamilies);
  list("pp", s.filter.purposes);
  list("pi", s.filter.impacts);
  if (s.filter.dungeonLike) out.pdg = "1";
  if (s.filter.underwater) out.puw = "1";
  list("pqs", s.filter.quests);
  if (s.filter.search) out.pq = s.filter.search;
  if (s.selectedId) out.place = s.selectedId;
  if (s.showTracks) out.tracks = "1";
  if (s.showSites) out.sites = "1";
  return out;
}

/** Empty set = no filter on that axis. Search matches name or id, case-insensitive. */
export function matchesFilter(p: PlottedPlace, f: PlacesFilter): boolean {
  if (f.regions.size && !f.regions.has(p.region)) return false;
  if (f.tiers.size && !f.tiers.has(String(p.importanceTier))) return false;
  if (f.classes.size && !f.classes.has(p.class ?? "?")) return false;
  if (f.dangers.size && !f.dangers.has(p.dangerTier ?? "?")) return false;
  if (f.densities.size && !f.densities.has(p.densityLayer ?? "?")) return false;
  if (f.stances.size && !f.stances.has(p.stance ?? "?")) return false;
  if (f.interiorKinds.size && !f.interiorKinds.has(p.interiorDetail?.kind ?? "?")) return false;
  if (f.interiorFamilies.size && !f.interiorFamilies.has(p.interiorDetail?.family ?? "?")) return false;
  if (f.purposes.size && !f.purposes.has(p.purposeDetail?.primary ?? "?")) return false;
  if (f.impacts.size && !f.impacts.has(p.purposeDetail?.impact ?? "?")) return false;
  if (f.dungeonLike && !DUNGEON_KINDS.has(p.interiorDetail?.kind ?? "")) return false;
  if (f.underwater && !isUnderwaterEntry(p)) return false;
  if (f.quests.size && !matchesQuestFilter(p, f.quests)) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    if (!p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) return false;
  }
  return true;
}

/** The quest-grouping key of one link (what the `pqs` chips toggle). */
export function questGroupKey(l: PlottedPlaceQuestLink): string {
  return l.group === "faction" ? `faction:${l.line ?? l.lineName}` : String(l.group);
}

/** OR across the selected keys: a place shows if any of its links is in a
 * selected group, or `any` / `none` is selected and applies. */
export function matchesQuestFilter(p: PlottedPlace, keys: Set<string>): boolean {
  const links = p.questLinks ?? [];
  if (keys.has("any") && links.length) return true;
  if (keys.has("none") && !links.length) return true;
  return links.some((l) => keys.has(questGroupKey(l)));
}

export function toggleIn(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}
