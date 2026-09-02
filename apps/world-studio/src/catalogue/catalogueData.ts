/**
 * Catalogue + candidate-site data for the plotted province map
 * (Phase 11 Part 0 item 5, decision 0041).
 *
 * Review tooling: this reads the *authoring* sources directly off disk through
 * Vite so a regenerated catalogue shows up on the next page load — one command
 * (`npm run dev -w @elder-souls/world-studio`) is the whole regeneration story.
 *
 *  - places:  world/sources/catalogue/places-<region>.json — globbed, so zero
 *             files is a legal state (empty layer, no crash). The schema is
 *             owned by tooling/world-generation/worldgen/catalogue.py; the
 *             types here are a deliberately loose *view* of it (every field
 *             optional beyond the ones present at `derived`), so a schema that
 *             grows never breaks the map.
 *  - sites:   world/sources/sites/candidate-sites.json — ~1 MB, so it is
 *             dynamically imported only when the underlay is switched on.
 *
 * No module-level mutable state: loaders return values, the component owns them.
 */

export interface PlaceClassification {
  class: string;
  family: string;
  type: string;
  variant?: string | null;
  magnitude?: string | null;
}

export interface PlaceWhy {
  founding?: string;
  siteAdvantages?: string;
  occupantsMotive?: string;
  pressures?: string;
  wouldChangeIf?: string;
}

export interface CataloguePlace {
  id: string;
  name?: string;
  namingRule?: string;
  classification: PlaceClassification;
  status: string;
  provenance: string;
  importanceTier: number;
  workflow: "derived" | "plotted" | "authored" | "frozen";
  dangerTier?: number;
  discovery?: string;
  why?: PlaceWhy;
  position?: { u: number; v: number };
  whySiteWon?: string;
  candidatesConsidered?: unknown;
  /** Anything else the schema carries — shown verbatim in the detail panel. */
  [key: string]: unknown;
}

export interface RegionCatalogue {
  region: string;
  seed: string;
  places: CataloguePlace[];
}

export interface CatalogueLoad {
  regions: RegionCatalogue[];
  places: CataloguePlace[];
  /** True when nothing is committed yet and the demo fixture is standing in. */
  isFixture: boolean;
}

interface RegionFileShape {
  schemaVersion?: number;
  region?: string;
  seed?: string;
  places?: CataloguePlace[];
}

/** Vite glob: resolved at build time, `{}` when no region file exists yet. */
const regionModules = import.meta.glob<RegionFileShape>(
  "../../../../world/sources/catalogue/places-*.json",
  { eager: true, import: "default" },
);

function toRegions(mods: Record<string, RegionFileShape>): RegionCatalogue[] {
  return Object.entries(mods)
    .map(([path, data]) => ({
      region: data.region ?? path.replace(/^.*places-(.*)\.json$/, "$1"),
      seed: data.seed ?? "",
      places: (data.places ?? []).filter((p) => p && typeof p.id === "string"),
    }))
    .sort((a, b) => a.region.localeCompare(b.region));
}

/**
 * The real catalogue if any region file exists, else the dev fixture — so the
 * view is reviewable (and testable) before Part 1 derives anything.
 */
export function loadCatalogue(fixture: RegionCatalogue[]): CatalogueLoad {
  const regions = toRegions(regionModules);
  const use = regions.length > 0 ? regions : fixture;
  return {
    regions: use,
    places: use.flatMap((r) => r.places),
    isFixture: regions.length === 0,
  };
}

export interface CandidateSite {
  id: string;
  landform: string;
  uv: [number, number];
  worldM: [number, number];
  elevationM: number;
  slopeDeg: number;
  regionName: string;
  dangerBand: number;
  detectorScore: number;
  scores?: Record<string, number>;
}

export interface CandidateSiteSet {
  landformClasses: string[];
  sites: CandidateSite[];
}

/**
 * Terrain-scour supply (Part 0 item 2), fetched on demand — it is ~1 MB.
 * `landformClasses` in that file is a keyed detector table, not a list; the
 * key order is the detector order and is the legend order here.
 */
export async function loadCandidateSites(): Promise<CandidateSiteSet> {
  const mod = (await import("../../../../world/sources/sites/candidate-sites.json")) as unknown as {
    default?: { landformClasses?: Record<string, unknown>; sites?: CandidateSite[] };
    landformClasses?: Record<string, unknown>;
    sites?: CandidateSite[];
  };
  const data = mod.default ?? mod;
  return {
    landformClasses: Object.keys(data.landformClasses ?? {}),
    sites: data.sites ?? [],
  };
}

/** Stable, colour-blind-safe-ish hue ramp keyed by index (deterministic). */
export function landformColour(index: number, total: number): string {
  const hue = Math.round((index / Math.max(1, total)) * 320);
  return `hsl(${hue} 70% 62%)`;
}

/** Tier 0 (canon major) reads hottest; tier 4 (density fill) coolest/dimmest. */
export const TIER_COLOURS = ["#ffd166", "#f4845f", "#7bd389", "#61a5c2", "#9aa5b1"];

export const WORKFLOW_ORDER = ["derived", "plotted", "authored", "frozen"] as const;

export function placeLabel(p: CataloguePlace): string {
  return p.name ?? p.namingRule ?? p.id;
}
