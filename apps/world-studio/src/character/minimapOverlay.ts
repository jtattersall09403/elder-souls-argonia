/**
 * Minimap overlay data: the plotted places, roads, boat lanes, minor tracks
 * and minor channels drawn over the province crop in walk and fly mode
 * (owner ask 2026-09-04). Loaded once per session from the same bundles the
 * 2D map's PlacesLayer / RoutesLayer read; drawing is a pure function of the
 * crop transform so the Minimap component stays a thin canvas host.
 *
 * Coordinates: places carry province fractions (u east, v south); route
 * geometries index the 1345-px hydrology grid. Both are converted to map
 * raster pixels through `MapMeta` by the caller-supplied `toPx`.
 */
import type { MapMeta } from "@elder-souls/game-core/hud/minimap";
import { HYDRO_GRID_PX, loadMinorTracks, loadPlaces } from "../places/placesData";
import { loadMinorWaterways, loadRoads, loadWaterways } from "../routes/routesData";

export interface OverlayDot {
  id: string;
  name: string;
  u: number;
  v: number;
  tier: number;
  colour: string;
  dead: boolean;
}

export interface OverlayLine {
  mode: "road" | "boat" | "track" | "channel";
  /** Hydrology-grid pixels [col, row]. */
  px: [number, number][];
}

export interface MinimapOverlay {
  dots: OverlayDot[];
  lines: OverlayLine[];
}

const DEAD = new Set(["ruined", "abandoned", "drowned"]);

/** Every loader tolerates a missing file: the overlay just has less on it. */
export async function loadMinimapOverlay(baseUrl: string): Promise<MinimapOverlay> {
  const [places, roads, lanes, tracks, channels] = await Promise.all([
    loadPlaces(baseUrl).catch(() => null),
    loadRoads(baseUrl).catch(() => []),
    loadWaterways(baseUrl).catch(() => []),
    loadMinorTracks(baseUrl).catch(() => null),
    loadMinorWaterways(baseUrl).catch(() => []),
  ]);
  const dots: OverlayDot[] = (places?.places ?? []).map((p) => ({
    id: p.id, name: p.name, u: p.position.u, v: p.position.v, tier: p.importanceTier,
    colour: places?.zoneColours[p.region] ?? "#9aa5b1", dead: DEAD.has(p.status),
  }));
  const lines: OverlayLine[] = [
    ...roads.map((g) => ({ mode: "road" as const, px: g.px })),
    ...lanes.map((g) => ({ mode: "boat" as const, px: g.px })),
    ...(tracks?.tracks ?? []).map((t) => ({ mode: "track" as const, px: t.px })),
    ...channels.map((t) => ({ mode: "channel" as const, px: t.px })),
  ];
  return { dots, lines };
}

const LINE_STYLE: Record<OverlayLine["mode"], { stroke: string; width: number; dash: number[] }> = {
  road: { stroke: "#e0b072", width: 2.0, dash: [] },
  boat: { stroke: "#5fd6e8", width: 2.0, dash: [] },
  track: { stroke: "#efe2bd", width: 1.2, dash: [3, 2] },
  channel: { stroke: "#7fe3f0", width: 1.2, dash: [2, 2] },
};

/** A minimap canvas point, written in place by a `ToView`. */
export interface ViewPoint { x: number; y: number }
/** Map-raster pixel to minimap canvas, written into `out` (no allocation per point). */
export type ToView = (px: number, py: number, out: ViewPoint) => void;

/** Heading bucket (degrees) below which the minimap is not redrawn. */
export const MINIMAP_HEADING_STEP_DEG = 3;

/**
 * The minimap's view quantised to what it can show: the centre to whole view
 * pixels (`metresPerViewPx`), the heading to MINIMAP_HEADING_STEP_DEG. The
 * panel redraws only when one of these changes (perf10 diag10 C3b: it redrew
 * every time the position prop moved by a millimetre).
 */
export function minimapView(xM: number, zM: number, headingDeg: number, metresPerViewPx: number): { cx: number; cz: number; heading: number } {
  const buckets = 360 / MINIMAP_HEADING_STEP_DEG;
  return {
    cx: Math.round(xM / metresPerViewPx),
    cz: Math.round(zM / metresPerViewPx),
    heading: ((Math.round(headingDeg / MINIMAP_HEADING_STEP_DEG) % buckets) + buckets) % buckets,
  };
}

const NO_DASH: number[] = [];
const DEAD_DASH = [2, 1.5];
// read-only after construction except the point the draw writes and reads at once
const scratchPoint: ViewPoint = { x: 0, y: 0 };

/**
 * Draw the overlay. `toView` maps map-raster pixels to minimap canvas
 * coordinates (the crop transform); `metresPerViewPx` decides how much
 * detail is worth drawing (labels only when zoomed in).
 */
export function drawMinimapOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: MinimapOverlay,
  meta: MapMeta,
  toView: ToView,
  viewPx: number,
  metresPerViewPx: number,
): void {
  const pt = scratchPoint;
  const gridToMap = meta.imageWidth / HYDRO_GRID_PX;
  const zoomed = metresPerViewPx < 20;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const line of overlay.lines) {
    if (!zoomed && (line.mode === "track" || line.mode === "channel")) continue;
    const st = LINE_STYLE[line.mode];
    ctx.strokeStyle = st.stroke;
    ctx.lineWidth = zoomed ? st.width : Math.max(0.8, st.width * 0.6);
    ctx.setLineDash(zoomed ? st.dash : NO_DASH);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < line.px.length; i++) {
      const cr = line.px[i];
      toView((cr[0] + 0.5) * gridToMap, (cr[1] + 0.5) * gridToMap, pt);
      const x = pt.x; const y = pt.y;
      if (x < -4 || y < -4 || x > viewPx + 4 || y > viewPx + 4) { started = false; continue; }
      if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
    }
    ctx.stroke();
  }
  ctx.setLineDash(NO_DASH);
  ctx.globalAlpha = 1;
  const labelled: { x: number; y: number }[] = [];
  for (const d of overlay.dots) {
    if (!zoomed && d.tier > 1) continue;
    toView(d.u * meta.imageWidth, d.v * meta.imageHeight, pt);
    const x = pt.x; const y = pt.y;
    if (x < -6 || y < -6 || x > viewPx + 6 || y > viewPx + 6) continue;
    const r = zoomed ? Math.max(2.2, 5 - d.tier * 0.7) : Math.max(1.6, 4 - d.tier);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = d.colour;
    ctx.globalAlpha = d.dead ? 0.6 : 0.95;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = d.dead ? "#f3f0e6" : "rgba(0,0,0,0.75)";
    if (d.dead) ctx.setLineDash(DEAD_DASH);
    ctx.stroke();
    if (d.dead) ctx.setLineDash(NO_DASH);
    // Labels: zoomed view only, tier ≤ 2, and never on top of another label.
    if (zoomed && d.tier <= 2 && !labelled.some((l) => Math.abs(l.x - x) < 46 && Math.abs(l.y - y) < 11)) {
      labelled.push({ x, y });
      ctx.font = "9px system-ui";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillText(d.name, x + r + 2.5, y + 3.5);
      ctx.fillStyle = "#e6ecf5";
      ctx.fillText(d.name, x + r + 2, y + 3);
    }
  }
  ctx.restore();
}
