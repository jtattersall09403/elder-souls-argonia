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
export type Poly = Pt[];

export interface BpDistrict {
  id: string;
  kind: string | null;
  cultureKit: string | null;
  wealth: string | null;
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
  notes: string | null;
  polygon: Poly | null;
  centreM: Pt | null;
}

export interface BpWay {
  id: string;
  group: "routes" | "canals" | "boardwalks";
  kind: string | null;
  widthM: number | null;
  notes: string | null;
  points: Poly;
}

export interface BpDoor {
  id: string;
  parcelId: string | null;
  facingDeg: number | null;
  thresholdM: Pt | null;
  interiorClaim: { sizeClass: string | null; culture: string | null; owner: string | null };
}

export interface BpLandmark {
  id: string; kind: string | null; assetRef: string | null; notes: string | null; positionM: Pt | null;
}
export interface BpDock {
  id: string; waterBodyId: string | null; piledToBed: boolean | null; notes: string | null; positionM: Pt | null;
}
export interface BpCombatSpace {
  id: string; clearanceClass: string | null; notes: string | null; polygon: Poly | null;
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
  if (data.schemaVersion !== 1) {
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

export const WAY_STYLE: Record<string, { colour: string; dash?: string }> = {
  routes: { colour: "#e0c48a" },
  canals: { colour: "#6fb7e0" },
  boardwalks: { colour: "#caa06a", dash: "6 4" },
};

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
