/**
 * Data + URL-state helpers for the Blueprint view (Phase 11 Part 7).
 *
 * Source: `apps/world-studio/public/province/blueprints.json`, written by
 * `python3 -m worldgen.export_blueprints`. Everything in it is already in world
 * metres (X east, Z south) — this module never converts UV, it only picks
 * colours, computes bounds and round-trips the URL.
 *
 * App-only review tooling: nothing here ships in the game (CLAUDE.md's
 * packages rule covers the game, not the studio's review viewers).
 * No module-level mutable state: loaders return values, the view owns them.
 */

export type Pt = [number, number];

/**
 * The plain-English record a reviewer reads on click (blueprint.py `why`).
 * Every key is nullable: the blueprints are being re-authored, and an unwritten
 * key must show as a visible gap ("not yet written", in red), never be hidden.
 */
export interface BpWhy {
  what: string | null;
  whyHere: string | null;
  /** Area records (districts, docks) carry no `whySpot`. */
  whySpot?: string | null;
  whyNeighbours: string | null;
  playerPurpose: string | null;
  microGeography: string | null;
}

/** Heading order for the why block, as the owner asked to read it. */
export const WHY_HEADINGS: [keyof BpWhy, string][] = [
  ["what", "What it is"],
  ["whyHere", "Why it is in this place"],
  ["whySpot", "Why this spot"],
  ["whyNeighbours", "Why it sits with its neighbours"],
  ["playerPurpose", "What it gives the player"],
  ["microGeography", "How it uses the ground"],
];

/** Keys shown for a whole-area record — a district or a dock has no one spot. */
export const AREA_WHY_KEYS = new Set<keyof BpWhy>([
  "what", "whyHere", "whyNeighbours", "playerPurpose", "microGeography",
]);
export type Poly = Pt[];

export interface BpDistrict {
  id: string;
  kind: string | null;
  cultureKit: string | null;
  wealth: string | null;
  why: BpWhy | null;
  notes: string | null;
  polygon: Poly | null;
  centreM: Pt | null;
}

export interface BpParcel {
  id: string;
  districtId: string | null;
  use: string | null;
  buildingFamily: string | null;
  assetRef: string | null;
  groundFit: string | null;
  yawDeg: number | null;
  orientationWhy: string | null;
  /** A gate or arch stands ACROSS this way — highlighted when the parcel is picked. */
  spans: string | null;
  interior: { kind: string | null; assetRef?: string | null } | null;
  why: BpWhy | null;
  notes: string | null;
  polygon: Poly | null;
  centreM: Pt | null;
}

export type WayGroup = "routes" | "canals" | "boardwalks" | "fences";

export interface BpWay {
  id: string;
  group: WayGroup;
  kind: string | null;
  widthM: number | null;
  assetRef: string | null;
  routing: string | null;
  /** Parcel / dock / landmark ids this way terminates at (drawn as a tick). */
  endsAt: string[];
  why: string | null;
  notes: string | null;
  /** The authored waypoints; `points` is derived from them by the street router. */
  via: Poly | null;
  points: Poly;
}

/** How a walking player arrives — the design is judged from the ground. */
export interface BpApproach {
  id: string;
  mode: string | null;
  fromRouteId: string | null;
  fromDirection: string | null;
  firstSeen: string | null;
  sequence: string | null;
  wayfinding: string | null;
  notes: string | null;
}

export interface BpScaleGrounding {
  loreSource?: string | null;
  population?: string | number | null;
  households?: number | null;
  buildingsPlanned?: number | null;
  npcsPlanned?: number | null;
  why?: string | null;
}

export interface BpDoor {
  id: string;
  parcelId: string | null;
  facingDeg: number | null;
  thresholdM: Pt | null;
  interiorClaim: { sizeClass: string | null; culture: string | null; owner: string | null };
}

export interface BpLandmark {
  id: string; kind: string | null; assetRef: string | null; why: BpWhy | null;
  notes: string | null; positionM: Pt | null;
}
export interface BpDock {
  id: string; waterBodyId: string | null; piledToBed: boolean | null; why: BpWhy | null;
  notes: string | null; positionM: Pt | null;
}
export interface BpCombatSpace {
  id: string; clearanceClass: string | null; why: string | null; notes: string | null; polygon: Poly | null;
}
export interface BpSocket {
  id: string; kind: string | null; parcelId: string | null; ownerQuestTier: number | null;
  notes: string | null; positionM: Pt | null;
}
export interface BpKeptTree {
  id: string; kind: string | null; notes: string | null; positionM: Pt | null;
}
export interface BpClearance {
  hardClear: Poly[];
  thinned: Poly[];
  kept: BpKeptTree[];
}
export interface BpCandidate {
  id: string; chosen: boolean; why: string | null; rejectedBecause: string | null; positionM: Pt | null;
}
export interface BpSiting {
  dossier: string | null;
  candidates: BpCandidate[];
}
export interface BpTerrain {
  image: string; x0: number; z0: number; x1: number; z1: number; pxM: number;
}

export interface Blueprint {
  id: string;
  seed: string | null;
  causalModel: Record<string, string>;
  boundary: Poly | null;
  districts: BpDistrict[];
  parcels: BpParcel[];
  ways: BpWay[];
  landmarks: BpLandmark[];
  docks: BpDock[];
  doors: BpDoor[];
  combatSpaces: BpCombatSpace[];
  questSockets: BpSocket[];
  approaches: BpApproach[];
  scaleGrounding: BpScaleGrounding | null;
  /** Metre box the province-map backdrop and the neighbour context cover. */
  contextM: Bounds;
  clearance: BpClearance;
  siting: BpSiting | null;
  budget: Record<string, number>;
  provision: { quests?: string[]; notes?: string };
  assetConstraints: string[];
  terrain: BpTerrain | null;
  summary: Record<string, number>;
}

export interface BlueprintBundle {
  schemaVersion: number;
  source: string;
  units: string;
  provinceExtentM: number;
  layers: string[];
  blueprints: Blueprint[];
}

export async function loadBlueprints(baseUrl: string): Promise<BlueprintBundle> {
  const r = await fetch(`${baseUrl}province/blueprints.json`);
  if (!r.ok) throw new Error(`blueprints.json: HTTP ${r.status}`);
  const ct = r.headers.get("content-type") ?? "";
  // Vite's dev server answers a missing public file with index.html (200).
  if (!ct.includes("json")) throw new Error("blueprints.json missing — run python3 -m worldgen.export_blueprints");
  const data = (await r.json()) as BlueprintBundle;
  if (data.schemaVersion !== 2) {
    throw new Error(`blueprints.json schemaVersion ${data.schemaVersion} unsupported — re-run python3 -m worldgen.export_blueprints`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Drawing conventions (shared with worldgen.render_blueprint so the static
// print sheet and this viewer agree by construction)
// ---------------------------------------------------------------------------

/** District tint by kit SET — the two-culture rule reads at a glance. */
export const KIT_FILL: Record<string, string> = {
  "argonian": "#3f7a5a", "argonian-stilt": "#2f8a7a", "argonian-mud": "#5a8a3f",
  "argonian-root": "#2e6b45", "argonian-stone": "#4f7f6a",
  "imperial": "#8a6a45", "dunmer-hlaalu": "#8a4f5a",
  "neutral-works": "#7a7a5a", "neutral-underwater": "#4a6a8a",
};

/** Parcel fill by ground fit — the slope ladder, cheapest first. */
export const GROUND_FIT_FILL: Record<string, string> = {
  direct: "#d9d2c4", plinth: "#c9b98f", pad: "#c2a978", stilt: "#9fc6d8", "dug-in": "#a89bb5",
};

export interface WayStyle {
  colour: string;
  /** Dash pattern in SCREEN pixels (the view divides by px-per-metre). */
  dash?: [number, number];
  /** Draw at the way's real width in metres (a road, a canal) or as a thin
   * line whatever the zoom (a fence is 0.3 m wide and would vanish). */
  hairline?: boolean;
}

/**
 * A line style per way KIND, so the map distinguishes the things the owner
 * asked to tell apart: a dredged `channel` from a cut `canal`, and a fence from
 * a wall from a palisade from a hedge. Falls back to the group.
 */
export const WAY_STYLE: Record<string, WayStyle> = {
  routes: { colour: "#e0c48a" },
  canals: { colour: "#6fb7e0" },
  boardwalks: { colour: "#caa06a", dash: [6, 4] },
  fences: { colour: "#b0a58c", hairline: true },
  // canals: a cut is a solid blue line; a dredged navigation channel into open
  // water is the same blue, long-dashed — it is water already, only deepened.
  canal: { colour: "#6fb7e0" },
  channel: { colour: "#7fd0f0", dash: [10, 6] },
  // fences: solid grey-brown pale = hedge, heavy = wall, spiked dash = palisade.
  fence: { colour: "#b0a58c", dash: [3, 2], hairline: true },
  wall: { colour: "#9a9384", hairline: false },
  palisade: { colour: "#a5762f", dash: [1.5, 2.5], hairline: true },
  hedge: { colour: "#6f9a5e", dash: [2, 2], hairline: true },
};

/** Style for one way: its kind wins, then its group. */
export function wayStyle(group: string, kind: string | null): WayStyle {
  return (kind && WAY_STYLE[kind]) || WAY_STYLE[group] || WAY_STYLE.routes;
}

/** A compass word ("north-east", "SW", "west") → degrees clockwise from north,
 * or null when the text names no direction. Approaches may give a route id
 * instead, in which case the view uses the route's far end. */
export function compassDeg(text: string | null): number | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/[^a-z]/g, "");
  const table: Record<string, number> = {
    n: 0, north: 0, ne: 45, northeast: 45, e: 90, east: 90, se: 135, southeast: 135,
    s: 180, south: 180, sw: 225, southwest: 225, w: 270, west: 270, nw: 315, northwest: 315,
  };
  return table[t] ?? null;
}

export const SOCKET_FILL = "#ffd166";

export function kitFill(kit: string | null): string {
  return (kit && KIT_FILL[kit]) || "#6b7280";
}

export function groundFitFill(fit: string | null): string {
  return (fit && GROUND_FIT_FILL[fit]) || "#b9b9b9";
}

/** Labels are drawn only when the view is zoomed in past this (px per metre) —
 * the owner's complaint about the static sheets was label pile-up. */
export const LABEL_PX_PER_M = 3;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Bounds { x0: number; z0: number; x1: number; z1: number }

/** Metre bounds of everything drawn for one blueprint (terrain crop included). */
export function blueprintBounds(bp: Blueprint): Bounds {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const eat = (p: Pt | null | undefined) => {
    if (!p) return;
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < z0) z0 = p[1];
    if (p[1] > z1) z1 = p[1];
  };
  const eatPoly = (poly: Poly | null | undefined) => poly?.forEach(eat);
  eatPoly(bp.boundary);
  bp.districts.forEach((d) => eatPoly(d.polygon));
  bp.parcels.forEach((p) => { eatPoly(p.polygon); eat(p.centreM); });
  bp.ways.forEach((w) => eatPoly(w.points));
  bp.landmarks.forEach((l) => eat(l.positionM));
  bp.docks.forEach((d) => eat(d.positionM));
  bp.doors.forEach((d) => eat(d.thresholdM));
  bp.combatSpaces.forEach((c) => eatPoly(c.polygon));
  bp.questSockets.forEach((s) => eat(s.positionM));
  bp.clearance.hardClear.forEach(eatPoly);
  bp.clearance.thinned.forEach(eatPoly);
  bp.clearance.kept.forEach((k) => eat(k.positionM));
  if (bp.terrain) {
    eat([bp.terrain.x0, bp.terrain.z0]);
    eat([bp.terrain.x1, bp.terrain.z1]);
  }
  if (!Number.isFinite(x0)) return { x0: 0, z0: 0, x1: 100, z1: 100 };
  const pad = Math.max(4, Math.max(x1 - x0, z1 - z0) * 0.03);
  return { x0: x0 - pad, z0: z0 - pad, x1: x1 + pad, z1: z1 + pad };
}

export function polyPath(poly: Poly, close = true): string {
  if (!poly.length) return "";
  const d = poly.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
  return close ? `${d} Z` : d;
}

/** A nice round scale-bar length (metres) for the current zoom. */
export function scaleBarMetres(pxPerM: number): number {
  const target = 120 / Math.max(pxPerM, 1e-6);   // aim for at most ~120 px
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  let best = pow;
  for (const step of [1, 2, 5]) {
    if (step * pow <= target) best = step * pow;
  }
  return best;
}

// ---------------------------------------------------------------------------
// URL state (module 85 §67: a link reproduces the view)
// ---------------------------------------------------------------------------

export interface BlueprintUrlState {
  /** Selected blueprint id (short form: the id without its `place.` prefix). */
  blueprintId: string | null;
  /** Selected object id, opened in the details panel. */
  selectedId: string | null;
  /** Layers switched OFF (default: everything on) — keeps the URL short. */
  hidden: Set<string>;
}

export const BLUEPRINT_URL_KEYS = ["bp", "blueprint", "bpsel", "bphide"] as const;

export const EMPTY_BLUEPRINT_URL: BlueprintUrlState = {
  blueprintId: null, selectedId: null, hidden: new Set(),
};

export function parseBlueprintUrl(q: URLSearchParams): BlueprintUrlState {
  return {
    blueprintId: q.get("blueprint"),
    selectedId: q.get("bpsel"),
    hidden: new Set((q.get("bphide") ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
  };
}

export function encodeBlueprintUrl(s: BlueprintUrlState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.blueprintId) out.blueprint = s.blueprintId;
  if (s.selectedId) out.bpsel = s.selectedId;
  if (s.hidden.size) out.bphide = [...s.hidden].sort().join(",");
  return out;
}

/** `?blueprint=` accepts either the full id or the slug after `place.`. */
export function findBlueprint(bundle: BlueprintBundle | null, id: string | null): Blueprint | null {
  if (!bundle) return null;
  if (!id) return bundle.blueprints[0] ?? null;
  return bundle.blueprints.find((b) => b.id === id)
    ?? bundle.blueprints.find((b) => b.id.endsWith(`.${id}`) || b.id.split(".").pop() === id)
    ?? bundle.blueprints[0] ?? null;
}

export function toggleIn(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

/** Short display name: the last dotted segment, hyphens opened up. */
export function shortName(id: string): string {
  return (id.split(".").pop() ?? id).replace(/-/g, " ");
}
