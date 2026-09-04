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

export type { MinorTrack, RegisteredRoute, RouteGeometry, RoutesIndexBundle } from "@elder-souls/contracts";

export const HYDRO_GRID_PX = 1345;

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
export function pixelLengthKm(px: [number, number][], metresPerPixel = 5.48352): number {
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

/** Query keys owned by the waterways layer (`water=1`); the selected route is `route`. */
export const ROUTES_URL_KEYS = ["water", "route"] as const;

export interface RoutesUrlState {
  showWater: boolean;
  selectedKey: string | null;
}

export function parseRoutesUrl(q: URLSearchParams): RoutesUrlState {
  return { showWater: q.get("water") === "1", selectedKey: q.get("route") };
}

export function encodeRoutesUrl(s: RoutesUrlState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.showWater) out.water = "1";
  if (s.selectedKey) out.route = s.selectedKey;
  return out;
}

/** Line styling by mode — water is cyan and unbroken, land is tan. */
export const ROUTE_STYLE: Record<RouteSelection["mode"], { stroke: string; width: number; dash?: string }> = {
  road: { stroke: "#e0b072", width: 2.0 },
  track: { stroke: "#e8d9b0", width: 1.1, dash: "4 3" },
  boat: { stroke: "#5fd6e8", width: 2.2 },
  channel: { stroke: "#5fd6e8", width: 1.2, dash: "3 3" },
};
