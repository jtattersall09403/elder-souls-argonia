/**
 * Data + URL-state helpers for the clickable routes/waterways map layers.
 *
 *  - routes.json / waterways.json:   the Phase 4 anchor-to-anchor road and boat
 *                                    network (geometry; now carrying id/name/class).
 *  - routes-minor.json:              derived local tracks (worldgen.compile_minor_routes).
 *  - waterways-minor.json:           minor water channels, same shape as
 *                                    routes-minor.json; optional, tolerated absent.
 *  - routes-index.json:              the route registry projected by
 *                                    `python3 -m worldgen.export_routes` — the browser
 *                                    never reads world/sources/routes/registry.json.
 *
 * All geometries index the same 1345-px hydrology grid as places' minor tracks.
 * No module-level mutable state: loaders return values, the component owns them.
 */
import type {
  MinorTrack, MinorTracksBundle, RegisteredRoute, RouteGeometry, RoutesIndexBundle,
} from "@elder-souls/contracts";
import { HYDRO_GRID_SAMPLES, METRES_PER_HYDRO_SAMPLE, metresToHydroPixel } from "../provinceScale";
import type { TipSection } from "../map/hydrographIndex";

export type { MinorTrack, RegisteredRoute, RouteGeometry, RoutesIndexBundle } from "@elder-souls/contracts";

export const HYDRO_GRID_PX = HYDRO_GRID_SAMPLES;

/** What the details panel shows for one clicked line, whichever bundle it came from. */
export interface RouteSelection {
  key: string;
  /** Registry id when the geometry carries one, else the derived track id. */
  id: string | null;
  name: string;
  mode: "road" | "boat" | "track" | "channel";
  klass: string | null;
  from: string;
  to: string;
  lengthKm: number | null;
  px: [number, number][];
  registry: RegisteredRoute | null;
}

async function getJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  // Vite's dev server answers a missing public file with index.html (200).
  if (!(r.headers.get("content-type") ?? "").includes("json")) return null;
  return (await r.json()) as T;
}

export async function loadRoutesIndex(baseUrl: string): Promise<RoutesIndexBundle | null> {
  const d = await getJson<RoutesIndexBundle>(`${baseUrl}province/routes-index.json`);
  return d && d.routes ? d : null;
}

export async function loadRoads(baseUrl: string): Promise<RouteGeometry[]> {
  const d = await getJson<{ routes?: RouteGeometry[] }>(`${baseUrl}province/routes.json`);
  return d?.routes ?? [];
}

export async function loadWaterways(baseUrl: string): Promise<RouteGeometry[]> {
  const d = await getJson<{ lanes?: RouteGeometry[] }>(`${baseUrl}province/waterways.json`);
  return d?.lanes ?? [];
}

/** Minor channels are produced by a separate workstream; absence is normal. */
export async function loadMinorWaterways(baseUrl: string): Promise<MinorTrack[]> {
  // worldgen.compile_minor_waterways writes its paths under `channels` (the
  // land bundle uses `tracks`); accept either so a rename never blanks the layer.
  const d = await getJson<MinorTracksBundle & { channels?: MinorTrack[] }>(`${baseUrl}province/waterways-minor.json`);
  if (Array.isArray(d?.channels)) return d.channels;
  return Array.isArray(d?.tracks) ? d.tracks : [];
}

/** Path length in km from the pixel grid, for geometries that carry no lengthKm. */
export function pixelLengthKm(px: [number, number][], metresPerPixel = METRES_PER_HYDRO_SAMPLE): number {
  let m = 0;
  for (let i = 1; i < px.length; i++) {
    m += Math.hypot(px[i][0] - px[i - 1][0], px[i][1] - px[i - 1][1]) * metresPerPixel;
  }
  return m / 1000;
}

const titleCase = (slug: string) => slug.replace(/-/g, " ");

export function selectMajor(
  g: RouteGeometry, mode: "road" | "boat", index: RoutesIndexBundle | null,
): RouteSelection {
  const reg = (g.id && index?.routes[g.id]) || null;
  return {
    key: g.id ?? `${mode}:${g.from}-${g.to}`,
    id: g.id ?? null,
    name: g.name ?? reg?.name ?? `${titleCase(g.from)} → ${titleCase(g.to)}`,
    mode,
    klass: g.class ?? reg?.class ?? null,
    from: g.from, to: g.to,
    lengthKm: g.lengthKm ?? pixelLengthKm(g.px),
    px: g.px,
    registry: reg,
  };
}

/** Minor land tracks / water channels: no registry entry, so derived fields only.
 * `placeName` resolves the `place.<region>.<slug>` endpoints the tracks use. */
export function selectMinor(
  t: MinorTrack, mode: "track" | "channel", index: RoutesIndexBundle | null,
  placeName: (id: string) => string,
): RouteSelection {
  const reg = index?.routes[t.id] ?? null;
  return {
    key: t.id,
    id: reg ? t.id : null,
    name: reg?.name ?? `${placeName(t.from)} → ${placeName(t.to)}`,
    mode,
    klass: t.kind ?? null,
    from: placeName(t.from), to: placeName(t.to),
    lengthKm: t.lengthKm ?? pixelLengthKm(t.px),
    px: t.px,
    registry: reg,
  };
}

/**
 * Authored route structures (worldgen.compile_route_structures): the stairs,
 * stepped ascents, decks, spans and lip steps that carry the stretches terrain
 * grading could not fix. Coordinates arrive in WORLD METRES; the map layer
 * works in hydrology-grid pixels, so they are converted here. Drawing them in
 * 3D is Round B's job — this is the 2D map trace and its hover label.
 */
export interface RouteStructure {
  id: string;
  wayId: string;
  kind: "stair" | "stepped-ascent" | "deck" | "bridge" | "lip-step";
  family: string;
  pieces: number;
  riseM: number;
  spanM: number;
  why: string;
  /** The crossing record a bridge or deck carries (`crossings.json` id). */
  crossingId?: string;
  /** One point per placed piece, [x east, z south] in metres. */
  pointsM: [number, number][];
}

export const METRES_PER_HYDRO_PX = METRES_PER_HYDRO_SAMPLE;

export async function loadRouteStructures(baseUrl: string): Promise<RouteStructure[]> {
  const d = await getJson<{ structures?: RouteStructure[] }>(
    `${baseUrl}province/route-structures.json`);
  return d?.structures ?? [];
}

/** A structure's trace in hydrology-grid pixels, the space the layer draws in.
 * Uses the same metre→pixel conversion as every other metres-based trace here
 * (`metresToPx`): the plain divide it used before landed half a pixel south-east
 * of the metre it names, because the layer's uv helper re-adds the cell centre. */
export function structurePx(s: RouteStructure): [number, number][] {
  return s.pointsM.map((p) => metresToPx(p as [number, number]));
}

/* ---------------------------------------------------------------------------
 * Hover sections. Every route record hovers through the map's ONE tooltip
 * (owner 2026-09-16: no second tooltip), so each builder returns the
 * `TipSection` rows App renders; nothing here is a preformatted string.
 * ------------------------------------------------------------------------ */
const row = (k: string, v: string | null | undefined): [string, string][] =>
  v === null || v === undefined || v === "" ? [] : [[k, v]];
const num = (v: number | null | undefined, digits: number, unit = "") =>
  v === null || v === undefined ? null : `${v.toFixed(digits)}${unit}`;

/** A road, lane, track or channel line. */
export function routeTip(sel: RouteSelection): TipSection {
  const reg = sel.registry;
  return {
    title: sel.name,
    rows: [
      ...row("id", sel.id ?? "derived, no registry entry"),
      ...row("mode", `${sel.mode}${sel.klass ? ` (${sel.klass})` : ""}`),
      ...row("from → to", `${sel.from} → ${sel.to}`),
      ...row("length", num(sel.lengthKm, 2, " km")),
      ...row("condition", reg?.condition ? `${reg.condition}${reg.conditionWhy ? ` — ${reg.conditionWhy}` : ""}` : null),
      ...row("confidence", reg?.confidence),
    ],
  };
}

/** A structure: what it is, how many pieces, and the height it carries. */
export function structureTip(s: RouteStructure, carried?: WaterCrossing | null): TipSection {
  return {
    title: `${s.kind} on ${s.wayId}`,
    rows: [
      ...row("id", s.id),
      ...row("pieces", `${s.pieces} piece${s.pieces === 1 ? "" : "s"} (${s.family})`),
      ...row("size", `${Math.abs(s.riseM).toFixed(1)} m rise over ${s.spanM.toFixed(0)} m`),
      ...row("carries", carried ? `${carried.id} (${carried.band}, ${carried.water})` : null),
      ...row("why", s.why),
    ],
  };
}

/** One colour per structure kind; a span is drawn as a recoloured stretch of
 *  its road line (owner 2026-09-16), a flight the same way. */
export const STRUCTURE_COLOUR: Record<string, string> = {
  bridge: "#ffb454", deck: "#d89a52", trestle: "#c58a4a",
  stair: "#9fd0ff", "stepped-ascent": "#7fb0e8", "lip-step": "#b7c4d4",
};
export const STRUCTURE_STYLE = { stroke: "#ffb454", width: 3.4 };

/* ---------------------------------------------------------------------------
 * The four route sub-layers (16e deliverable 8, decision 0068).
 *
 * Every value below is READ from a record `worldgen.export_routes` published
 * into province/ — route-grades.json, crossings.json, travel-services.json.
 * Nothing here recomputes a gradient, a span, a depth or a fare: the browser
 * draws the record (decision 0066). All three are tolerated absent, like the
 * minor waterways, so a studio on ground where the stage has not run is blank
 * rather than broken.
 * ------------------------------------------------------------------------ */

/** Province-frame metres [east, south] → the layer's hydrology-pixel space. */
export function metresToPx(p: [number, number]): [number, number] {
  return [metresToHydroPixel(p[0]), metresToHydroPixel(p[1])];
}

/** One capped choke point on a solved road (worldgen.grade_routes). */
export interface RouteGrade {
  id: string;
  wayId: string | null;
  class: string | null;
  fromM: number | null;
  toM: number | null;
  lengthM: number | null;
  worstDegBefore: number | null;
  capDeg: number | null;
  /** Recomputed by the exporter from the authored profile, not by the browser. */
  gradientAfterDeg: number;
  maxDeltaM: number | null;
  /** What the apply receipt says actually moved; null when the vault is absent. */
  maxAbsDeltaM: number | null;
  shoulderM: number | null;
  absorbed?: unknown;
  why: string | null;
  /** The profile's ground trace, [east, south] metres. */
  lineM: [number, number][];
}

export async function loadRouteGrades(baseUrl: string): Promise<RouteGrade[]> {
  const d = await getJson<{ patches?: RouteGrade[] }>(`${baseUrl}province/route-grades.json`);
  return d?.patches ?? [];
}

export const GRADE_STYLE = { stroke: "#f0a63c", width: 4.2 };

export function gradeTip(g: RouteGrade): TipSection {
  const span = g.fromM === null || g.toM === null ? null : `${g.fromM.toFixed(0)}–${g.toM.toFixed(0)} m`;
  const delta = g.maxAbsDeltaM === null
    ? (g.maxDeltaM === null ? "not recorded" : `${g.maxDeltaM.toFixed(2)} m (authored bound)`)
    : `${g.maxAbsDeltaM.toFixed(2)} m`;
  return {
    title: `graded: ${g.wayId ?? g.id}`,
    rows: [
      ...row("chainage", span ? `${span}${g.lengthM === null ? "" : `, ${g.lengthM.toFixed(0)} m long`}` : null),
      ...row("gradient", `${num(g.worstDegBefore, 2) ?? "?"}° → ${g.gradientAfterDeg.toFixed(2)}° (cap ${num(g.capDeg, 1) ?? "?"}°)`),
      ...row("max |delta|", delta),
      ...row("shoulder", num(g.shoulderM, 1, " m") ?? "?"),
      ...row("why", g.why),
    ],
  };
}

/** A way standing in non-sea water (worldgen.derive_crossings, schema 2). */
export interface WaterCrossing {
  id: string;
  water: string;
  band: "ford" | "span" | "ferry" | string;
  spanM: number;
  maxDepthM: number;
  entityId: string;
  entityKind: string;
  positionM: [number, number];
  banks: [number, number][];
  servesRoutes: string[];
  wayName?: string;
  wayClass?: string;
  network?: string;
  nearestPlaceId?: string;
  nearestPlaceName?: string;
  nearestPlaceM?: number;
}

export async function loadCrossings(baseUrl: string): Promise<WaterCrossing[]> {
  const d = await getJson<{ crossings?: WaterCrossing[] }>(`${baseUrl}province/crossings.json`);
  return d?.crossings ?? [];
}

/** Band colours: a ford you wade, a span you cross dry, a ferry you must pay. */
export const CROSSING_BAND_COLOUR: Record<string, string> = {
  ford: "#5fd07a", span: "#ff9f43", ferry: "#ff5252",
};

export function crossingTip(c: WaterCrossing): TipSection {
  return {
    title: `${c.band} — ${c.water}${c.wayName ? ` on ${c.wayName}` : ""}`,
    rows: [
      ...row("id", c.id),
      ...row("size", `${c.spanM.toFixed(0)} m across, ${c.maxDepthM.toFixed(2)} m deep`),
      ...row("water", `${c.entityId} (${c.entityKind})`),
      ...row("serves", c.servesRoutes.length ? c.servesRoutes.join(", ") : null),
      ...row("near", c.nearestPlaceName),
    ],
  };
}

/** Travel services: who carries you, from where, for what (travel-services.json). */
export interface TravelStation {
  id: string;
  kind: string;
  placeId?: string;
  positionM: [number, number] | null;
  status?: string;
  piece?: string;
  berth?: { depthM?: number | null; jettyM?: number | null; floats?: boolean | null; hullClass?: string; entityId?: string; entityKind?: string };
}

export interface TravelHop {
  from: string;
  to: string;
  lengthM?: number;
  follows?: Record<string, string>;
}

export interface TravelService {
  id: string;
  serviceKind: string;
  status?: string;
  form?: string;
  fare?: { gold?: number; freeIf?: unknown[] };
  operator?: { role?: string; ownerFaction?: string | null; nearestPlaceId?: string };
  hops: TravelHop[];
  stations?: string[];
  why?: string;
}

export interface TravelServicesBundle {
  stations: TravelStation[];
  services: TravelService[];
  rootways: { id: string; from: string; to: string; status?: string }[];
}

export async function loadTravelServices(baseUrl: string): Promise<TravelServicesBundle> {
  const d = await getJson<Partial<TravelServicesBundle>>(`${baseUrl}province/travel-services.json`);
  return { stations: d?.stations ?? [], services: d?.services ?? [], rootways: d?.rootways ?? [] };
}

export const STATION_COLOUR: Record<string, string> = {
  place: "#e6ecf5", "ferry-landing": "#ff9f43", "root-node": "#6fd08c",
};

/** Hop styling by service kind: a ferry is a fixed run, a boat a hire, a
 *  rootworm the Hist's own road — solid, dashed, dotted green. */
export const HOP_STYLE: Record<string, { stroke: string; dash?: string }> = {
  ferry: { stroke: "#ff9f43" },
  boat: { stroke: "#5fd6e8", dash: "6 4" },
  rootworm: { stroke: "#6fd08c", dash: "1.5 3" },
};

export function serviceTip(s: TravelService): TipSection {
  return {
    title: `${s.serviceKind}${s.form ? ` (${s.form})` : ""}: ${s.id}`,
    rows: [
      ...row("fare", s.fare?.gold === undefined ? null : `${s.fare.gold} gold`),
      ...row("operator", s.operator?.role),
      ...row("status", s.status),
      ...row("why", s.why),
    ],
  };
}

/** A station's berth; every number is optional on the record (a place
 *  station has none, a landing may carry `null` before the water is proved). */
export function stationTip(st: TravelStation): TipSection {
  const b = st.berth;
  const berth = b
    ? [num(b.depthM, 2, " m deep") && `berth ${num(b.depthM, 2, " m deep")}`,
       num(b.jettyM, 1, " m") && `jetty ${num(b.jettyM, 1, " m")}`,
       b.floats === undefined || b.floats === null ? "" : (b.floats ? "floats" : "fixed")]
        .filter(Boolean).join(", ")
    : "";
  return {
    title: `${st.kind}: ${st.id}`,
    rows: [
      ...row("place", st.placeId),
      ...row("berth", berth),
      ...row("status", st.status),
    ],
  };
}

/** The four independently toggled route sub-layers (`routeLayers=`). */
export const ROUTE_SUB_LAYERS = ["spans", "grades", "crossings", "services"] as const;
export type RouteSubLayer = (typeof ROUTE_SUB_LAYERS)[number];

/**
 * The sub-layers on when the URL says nothing (owner 2026-09-16: bridges,
 * decks, fords and ferries should be on the map without hunting for a
 * checkbox). `routeLayers=none` is the explicit empty set, so "all four off"
 * still round-trips through the URL.
 */
export const ROUTE_SUB_LAYERS_DEFAULT: RouteSubLayer[] = ["spans", "crossings"];

export function parseRouteLayers(value: string | null): RouteSubLayer[] {
  if (value === null) return [...ROUTE_SUB_LAYERS_DEFAULT];
  const want = new Set(value.split(",").map((s) => s.trim()).filter(Boolean));
  return ROUTE_SUB_LAYERS.filter((n) => want.has(n));
}

/** Query keys owned by the waterways layer (`water=1`); the selected route is `route`. */
export const ROUTES_URL_KEYS = ["water", "route", "routeLayers"] as const;

export interface RoutesUrlState {
  showWater: boolean;
  selectedKey: string | null;
  /** Sub-layers switched on; `spans` and `crossings` default on. */
  subLayers: RouteSubLayer[];
}

export function parseRoutesUrl(q: URLSearchParams): RoutesUrlState {
  return {
    showWater: q.get("water") === "1",
    selectedKey: q.get("route"),
    subLayers: parseRouteLayers(q.get("routeLayers")),
  };
}

export function encodeRoutesUrl(s: RoutesUrlState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.showWater) out.water = "1";
  if (s.selectedKey) out.route = s.selectedKey;
  out.routeLayers = s.subLayers.length
    ? ROUTE_SUB_LAYERS.filter((n) => s.subLayers.includes(n)).join(",")
    : "none";
  return out;
}

/** Line styling by mode — water is cyan and unbroken, land is tan. */
export const ROUTE_STYLE: Record<RouteSelection["mode"], { stroke: string; width: number; dash?: string }> = {
  road: { stroke: "#e0b072", width: 2.0 },
  track: { stroke: "#e8d9b0", width: 1.1, dash: "4 3" },
  boat: { stroke: "#5fd6e8", width: 2.2 },
  channel: { stroke: "#5fd6e8", width: 1.2, dash: "3 3" },
};
