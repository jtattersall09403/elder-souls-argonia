/**
 * Blueprint view (Phase 11 Part 7, round 2) — the interactive replacement for
 * the static `render_blueprint` PNG sheets, which the owner could not read
 * ("a lot of stuff jumbled on top of each other", 2026-09-05).
 *
 * Round 2 answers the owner's three asks of 2026-09-05:
 *
 *  1. BACKDROP = THE MAIN MAP. The `map` layer paints the same coloured
 *     province map the map screen paints — same height raster, same elevation
 *     ramp (`terrainColor`), same river/wetland overlays, through the shared
 *     `map/provinceMap.ts` loader — and crops it to the blueprint's exported
 *     `contextM` box. Over it, the `context` layer draws the NEIGHBOURING
 *     plotted places and the road / boat-lane / track / channel network from the
 *     very bundles PlacesLayer and RoutesLayer read (`loadMinimapOverlay`).
 *     Caveat, stated plainly in the legend: the province map is a 1345-px
 *     raster at ~5.5 m per pixel, so at settlement zoom it is coarse — it says
 *     where the place sits, not what the ground does under one house. The
 *     exported hillshade crop (`terrain`) stays as the finer read underneath.
 *  2. CLICK → THE WHYS. The details panel leads with the plain-English `why`
 *     block, under the owner's headings, then orientation and its reason, and
 *     only then the dense fields, collapsed. A missing why shows in red.
 *  3. THE NEW THINGS ARE DRAWN. Fences / walls / palisades / hedges have their
 *     own line styles, `channel` differs from `canal`, a selected way shows its
 *     authored `via` waypoints and a tick where it attaches to each `endsAt`
 *     parcel, a selected gate highlights the way it `spans`, and approaches
 *     enter as arrows from the edge that flash their `firstSeen` object.
 *
 * All geometry is in world metres, straight from blueprints.json — the SVG's
 * user space IS metre space (X east, Z south), so the scale bar is honest and
 * nothing has to be un-projected. Selection, the chosen blueprint and the hidden
 * layers round-trip through the URL via `onUrlState` (App owns the query string).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AREA_WHY_KEYS, blueprintBounds, compassDeg, findBlueprint, groundFitFill, kitFill,
  LABEL_PX_PER_M, loadBlueprints, polyPath, scaleBarMetres, shortName, SOCKET_FILL,
  toggleIn, wayStyle, WHY_HEADINGS,
  type Blueprint, type BlueprintBundle, type BlueprintUrlState, type BpApproach,
  type BpWhy, type Poly, type Pt,
} from "./blueprintsData";
import {
  CONTEXT_OVERLAY_FILES, cropProvinceMap, decodeProvinceHeights, loadOverlayImages,
  loadProvinceMeta, paintProvinceMap,
} from "../map/provinceMap";
import { loadMinimapOverlay, type MinimapOverlay } from "../character/minimapOverlay";
import { HYDRO_GRID_PX } from "../places/placesData";

const PANEL: React.CSSProperties = {
  background: "rgba(10,14,20,0.92)", color: "#e6ecf5", border: "1px solid #2b3644",
  borderRadius: 8, padding: "8px 10px", font: "12px system-ui",
};

const LAYER_LABEL: Record<string, string> = {
  map: "province map", context: "neighbours + routes", terrain: "terrain crop",
  boundary: "boundary", clearance: "clearance", districts: "districts",
  ways: "roads / canals / boardwalks", fences: "fences / walls", parcels: "parcels",
  doors: "doors", landmarks: "landmarks", docks: "docks", combatSpaces: "combat spaces",
  approaches: "approaches", questSockets: "quest sockets", siting: "siting candidates",
};

const CONTEXT_LINE: Record<string, { stroke: string; width: number; dash?: string }> = {
  road: { stroke: "#e0b072", width: 4 },
  boat: { stroke: "#5fd6e8", width: 4 },
  track: { stroke: "#efe2bd", width: 2, dash: "8 6" },
  channel: { stroke: "#7fe3f0", width: 2, dash: "5 5" },
};

/** What a click selected: the object, its class, its whys and its dense fields. */
interface Picked {
  id: string;
  kind: string;
  title: string;
  /** The plain-English block (districts, parcels, landmarks, docks). */
  why: BpWhy | null;
  /** Which headings apply — an area record has no "why this spot". */
  areaOnly: boolean;
  /** The one-sentence why a way or a combat space carries instead of a block. */
  whyText: string | null;
  /** True when this class carries that sentence rather than a why block. */
  sentenceWhy: boolean;
  /** Whether this class is supposed to carry a why at all (drives the red gap). */
  wantsWhy: boolean;
  orientation: { facing: string; why: string | null } | null;
  fields: [string, unknown][];
}

function fieldsOf(obj: Record<string, unknown>, keys: string[]): [string, unknown][] {
  return keys.map((k) => [k, obj[k]] as [string, unknown])
    .filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length));
}

function Field({ k, v }: { k: string; v: unknown }) {
  const text = Array.isArray(v) ? v.join(", ")
    : typeof v === "object" ? JSON.stringify(v)
    : typeof v === "boolean" ? (v ? "yes" : "no")
    : String(v);
  return (
    <div style={{ marginTop: 3, wordBreak: "break-word" }}>
      <span style={{ opacity: 0.65 }}>{k}: </span>{text}
    </div>
  );
}

const MISSING: React.CSSProperties = { color: "#ff6b5a", fontStyle: "italic" };

/** The gap is shown, never hidden (owner 2026-09-05: "not yet written", in red). */
function NotWritten({ what }: { what: string }) {
  return <div style={{ ...MISSING, marginTop: 2 }}>not yet written — {what}</div>;
}

/** Degrees clockwise from north → a unit vector in (x east, z south). */
function heading(deg: number): Pt {
  const r = (deg * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
}

/** The point on a polygon's edge nearest a threshold, so the door tick sits on
 * the wall rather than floating (blueprints place the threshold on the edge, but
 * a compiler nudge or a hand edit can put it a few centimetres off). */
function nearestEdgePoint(poly: Poly, p: Pt): Pt {
  let best: Pt = poly[0], bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const vx = b[0] - a[0], vz = b[1] - a[1];
    const len2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / len2));
    const q: Pt = [a[0] + vx * t, a[1] + vz * t];
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}

function dist2(a: Pt, b: Pt): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

/** Any object's position, whatever class it belongs to — used by `endsAt` ticks,
 * `spans` highlights and the approach's `firstSeen` flash. */
function positionOf(bp: Blueprint, id: string): Pt | null {
  const p = bp.parcels.find((o) => o.id === id);
  if (p) return p.centreM ?? (p.polygon?.[0] ?? null);
  const l = bp.landmarks.find((o) => o.id === id);
  if (l) return l.positionM;
  const d = bp.docks.find((o) => o.id === id);
  if (d) return d.positionM;
  const dt = bp.districts.find((o) => o.id === id);
  if (dt) return dt.centreM;
  const w = bp.ways.find((o) => o.id === id);
  if (w && w.points.length) return w.points[Math.floor(w.points.length / 2)];
  const c = bp.combatSpaces.find((o) => o.id === id);
  if (c?.polygon?.length) return c.polygon[0];
  return null;
}

/** Where an approach enters, and where it is heading: the far end of its route
 * when it names one, else a compass bearing out from the settlement centre. */
function approachArrow(bp: Blueprint, ap: BpApproach, centre: Pt, radius: number,
): { from: Pt; to: Pt } | null {
  const way = ap.fromRouteId ? bp.ways.find((w) => w.id === ap.fromRouteId) : undefined;
  if (way && way.points.length >= 2) {
    const ends: Pt[] = [way.points[0], way.points[way.points.length - 1]];
    const from = dist2(ends[0], centre) > dist2(ends[1], centre) ? ends[0] : ends[1];
    const to = dist2(ends[0], centre) > dist2(ends[1], centre) ? ends[1] : ends[0];
    return { from, to };
  }
  const deg = compassDeg(ap.fromDirection);
  if (deg === null) return null;
  const v = heading(deg);      // the direction the player comes FROM
  return {
    from: [centre[0] + v[0] * radius * 1.35, centre[1] + v[1] * radius * 1.35],
    to: [centre[0] + v[0] * radius * 0.55, centre[1] + v[1] * radius * 0.55],
  };
}

export interface BlueprintViewProps {
  baseUrl: string;
  initial: BlueprintUrlState;
  onUrlState: (s: BlueprintUrlState) => void;
  onClose: () => void;
}

export function BlueprintView({ baseUrl, initial, onUrlState, onClose }: BlueprintViewProps) {
  const [bundle, setBundle] = useState<BlueprintBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blueprintId, setBlueprintId] = useState<string | null>(initial.blueprintId);
  const [selectedId, setSelectedId] = useState<string | null>(initial.selectedId);
  const [hidden, setHidden] = useState<Set<string>>(initial.hidden);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  /** The object an approach hover flashes (`firstSeen`). */
  const [flashId, setFlashId] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  // Metre-space view: the centre and the zoom (screen px per world metre).
  const [view, setView] = useState<{ cx: number; cz: number; s: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    loadBlueprints(baseUrl).then((b) => { if (alive) setBundle(b); })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [baseUrl]);

  const bp = useMemo(() => findBlueprint(bundle, blueprintId), [bundle, blueprintId]);
  const bounds = useMemo(() => (bp ? blueprintBounds(bp) : null), [bp]);

  useEffect(() => { onUrlState({ blueprintId, selectedId, hidden }); }, [blueprintId, selectedId, hidden, onUrlState]);

  // ---- the main map as backdrop -------------------------------------------
  // Painted ONCE per session from the same rasters App.tsx uses, then cropped
  // per blueprint. Sea level 0 matches the map screen's default.
  const provinceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapCrop, setMapCrop] = useState<{ url: string; box: { x0: number; z0: number; x1: number; z1: number } } | null>(null);
  const showMap = !hidden.has("map");

  useEffect(() => {
    if (!showMap || provinceCanvasRef.current) return;
    let alive = true;
    (async () => {
      try {
        const meta = await loadProvinceMeta(baseUrl);
        const [{ heights }, overlays] = await Promise.all([
          decodeProvinceHeights(baseUrl, meta),
          loadOverlayImages(baseUrl, CONTEXT_OVERLAY_FILES),
        ]);
        if (!alive) return;
        provinceCanvasRef.current = paintProvinceMap(heights, meta, 0, Object.values(overlays));
        setMapReady(true);
      } catch (e) {
        if (alive) setMapError((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [showMap, baseUrl]);

  useEffect(() => {
    const canvas = provinceCanvasRef.current;
    if (!bp || !canvas || !bundle) { setMapCrop(null); return; }
    setMapCrop(cropProvinceMap(canvas, bundle.provinceExtentM, bp.contextM));
  }, [bp, bundle, mapReady]);

  // ---- neighbouring places and the route network --------------------------
  const [overlay, setOverlay] = useState<MinimapOverlay | null>(null);
  const showContext = !hidden.has("context");
  useEffect(() => {
    if (!showContext || overlay) return;
    let alive = true;
    loadMinimapOverlay(baseUrl).then((o) => { if (alive) setOverlay(o); }).catch(() => {});
    return () => { alive = false; };
  }, [showContext, overlay, baseUrl]);

  /** Only what falls inside the blueprint's context box, in metres. */
  const context = useMemo(() => {
    if (!bp || !bundle || !overlay) return null;
    const ext = bundle.provinceExtentM;
    const perPx = ext / HYDRO_GRID_PX;
    const b = bp.contextM;
    const inside = (p: Pt) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.z0 && p[1] <= b.z1;
    const dots = overlay.dots
      .map((d) => ({ ...d, at: [d.u * ext, d.v * ext] as Pt }))
      .filter((d) => inside(d.at));
    const lines = overlay.lines
      .map((l) => ({ mode: l.mode, pts: l.px.map(([c, r]) => [c * perPx, r * perPx] as Pt) }))
      .filter((l) => l.pts.some(inside));
    return { dots, lines };
  }, [bp, bundle, overlay]);

  // Measure the viewport so the metre↔pixel scale is real.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [bundle]);

  const fit = useCallback(() => {
    if (!bounds) return;
    const s = Math.min(size.w / (bounds.x1 - bounds.x0), size.h / (bounds.z1 - bounds.z0));
    setView({ cx: (bounds.x0 + bounds.x1) / 2, cz: (bounds.z0 + bounds.z1) / 2, s });
  }, [bounds, size.w, size.h]);

  // Fit on first load and whenever the blueprint changes.
  useEffect(() => { fit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [bp?.id]);
  useEffect(() => { if (!view) fit(); }, [view, fit]);

  const zoomBy = useCallback((factor: number, anchor?: { x: number; y: number }) => {
    setView((v) => {
      if (!v) return v;
      const s = Math.max(0.02, Math.min(80, v.s * factor));
      if (!anchor) return { ...v, s };
      // Keep the world point under the cursor fixed.
      const dx = anchor.x - size.w / 2, dy = anchor.y - size.h / 2;
      const wx = v.cx + dx / v.s, wz = v.cz + dy / v.s;
      return { cx: wx - dx / s, cz: wz - dy / s, s };
    });
  }, [size.w, size.h]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "+" || e.key === "=") zoomBy(1.25);
      else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.25);
      else if (e.key === "0") fit();
      else if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomBy, fit]);

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const on = (layer: string) => !hidden.has(layer);
  const s = view?.s ?? 1;
  const px = (n: number) => n / s;                 // n screen px, in metres
  const showLabels = s >= LABEL_PX_PER_M;
  const viewBox = view
    ? `${view.cx - size.w / 2 / s} ${view.cz - size.h / 2 / s} ${size.w / s} ${size.h / s}`
    : "0 0 100 100";

  const pickId = (id: string) => (e: React.MouseEvent) => { e.stopPropagation(); setSelectedId(id); };
  const enter = (text: string) => (e: React.MouseEvent) => {
    const r = boxRef.current?.getBoundingClientRect();
    setHover({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0), text });
  };

  const picked: Picked | null = useMemo(() => {
    if (!bp || !selectedId) return null;
    const find = <T extends { id: string }>(list: T[]) => list.find((o) => o.id === selectedId);
    const rec = (o: Record<string, unknown>, kind: string, keys: string[],
                 opts: Partial<Picked> = {}): Picked => ({
      id: String(o.id), kind, title: shortName(String(o.id)),
      why: (o.why as BpWhy) ?? null, areaOnly: false, whyText: null, sentenceWhy: false, wantsWhy: true,
      orientation: null, fields: fieldsOf(o, keys), ...opts,
    });
    const d = find(bp.districts);
    if (d) return rec(d as unknown as Record<string, unknown>, "district",
      ["kind", "cultureKit", "wealth", "notes"], { areaOnly: true });
    const p = find(bp.parcels);
    if (p) return rec(p as unknown as Record<string, unknown>, "parcel",
      ["use", "districtId", "buildingFamily", "assetRef", "groundFit", "spans", "interior", "notes", "centreM"],
      { orientation: {
        facing: typeof p.yawDeg === "number" ? `${p.yawDeg}° clockwise from north` : "no yaw authored",
        why: p.orientationWhy,
      } });
    const w = find(bp.ways);
    if (w) return rec(w as unknown as Record<string, unknown>, w.group === "fences" ? "fence" : w.group,
      ["kind", "widthM", "routing", "assetRef", "endsAt", "notes"],
      { why: null, whyText: w.why, sentenceWhy: true });
    const dr = find(bp.doors);
    if (dr) return rec(dr as unknown as Record<string, unknown>, "door",
      ["parcelId", "facingDeg", "thresholdM"], {
        wantsWhy: false,
        fields: [...fieldsOf(dr as unknown as Record<string, unknown>, ["parcelId", "facingDeg", "thresholdM"]),
          ...fieldsOf(dr.interiorClaim as unknown as Record<string, unknown>, ["sizeClass", "culture", "owner"])],
      });
    const lm = find(bp.landmarks);
    if (lm) return rec(lm as unknown as Record<string, unknown>, "landmark", ["kind", "assetRef", "notes", "positionM"]);
    const dk = find(bp.docks);
    if (dk) return rec(dk as unknown as Record<string, unknown>, "dock",
      ["waterBodyId", "piledToBed", "notes", "positionM"], { areaOnly: true });
    const cs = find(bp.combatSpaces);
    if (cs) return rec(cs as unknown as Record<string, unknown>, "combat space",
      ["clearanceClass", "notes"], { why: null, whyText: cs.why, sentenceWhy: true });
    const so = find(bp.questSockets);
    if (so) return rec(so as unknown as Record<string, unknown>, "quest socket",
      ["kind", "parcelId", "ownerQuestTier", "notes", "positionM"], { wantsWhy: false });
    const kt = find(bp.clearance.kept);
    if (kt) return rec(kt as unknown as Record<string, unknown>, "kept tree",
      ["kind", "notes", "positionM"], { wantsWhy: false });
    const ca = bp.siting?.candidates.find((c) => c.id === selectedId);
    if (ca) return rec(ca as unknown as Record<string, unknown>,
      ca.chosen ? "siting candidate (chosen)" : "siting candidate (rejected)",
      ["positionM", "why", "rejectedBecause"], { why: null, wantsWhy: false });
    return null;
  }, [bp, selectedId]);

  const parcelById = useMemo(() => new Map((bp?.parcels ?? []).map((p) => [p.id, p])), [bp]);
  const centre: Pt = bounds ? [(bounds.x0 + bounds.x1) / 2, (bounds.z0 + bounds.z1) / 2] : [0, 0];
  const radius = bounds ? Math.max(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0) / 2 : 50;
  /** The way a selected gate parcel stands across (`spans`), highlighted. */
  const spannedWay = useMemo(() => {
    const sel = picked && bp ? bp.parcels.find((p) => p.id === picked.id) : null;
    return sel?.spans ? bp?.ways.find((w) => w.id === sel.spans) ?? null : null;
  }, [picked, bp]);
  const flashAt = flashId && bp ? positionOf(bp, flashId) : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 6, background: "#0c1016", color: "#e6ecf5", font: "13px system-ui" }}>
      <div ref={boxRef} style={{ position: "absolute", inset: 0, cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" }}
        onPointerDown={(e) => {
          if (!view) return;
          dragRef.current = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz };
          movedRef.current = false;
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d || !view) return;
          if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) movedRef.current = true;
          setView({ ...view, cx: d.cx - (e.clientX - d.x) / view.s, cz: d.cz - (e.clientY - d.y) / view.s });
        }}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerLeave={() => { dragRef.current = null; setHover(null); }}
        onClick={() => { if (!movedRef.current) setSelectedId(null); }}>

        {bp && view && (
          <svg width={size.w} height={size.h} viewBox={viewBox} style={{ display: "block" }}>
            {/* the MAIN 2D map, cropped to this blueprint's context box */}
            {on("map") && mapCrop && (
              <image href={mapCrop.url} x={mapCrop.box.x0} y={mapCrop.box.z0}
                width={mapCrop.box.x1 - mapCrop.box.x0} height={mapCrop.box.z1 - mapCrop.box.z0}
                preserveAspectRatio="none" style={{ imageRendering: "pixelated" }} />
            )}

            {/* neighbouring plotted places and the route / waterway network */}
            {on("context") && context && (
              <g pointerEvents="none">
                {context.lines.map((l, i) => {
                  const st = CONTEXT_LINE[l.mode];
                  return (
                    <path key={`cl${i}`} d={polyPath(l.pts, false)} fill="none" stroke={st.stroke}
                      strokeOpacity={0.55} strokeWidth={px(st.width)} strokeDasharray={st.dash
                        ? st.dash.split(" ").map((n) => px(Number(n))).join(" ") : undefined}
                      strokeLinecap="round" strokeLinejoin="round" />
                  );
                })}
                {context.dots.map((d) => (
                  <g key={d.id} opacity={d.dead ? 0.6 : 0.95}>
                    <circle cx={d.at[0]} cy={d.at[1]} r={px(5)} fill={d.colour}
                      stroke="#0c1016" strokeWidth={px(1.2)} strokeDasharray={d.dead ? `${px(2)} ${px(2)}` : undefined} />
                    <text x={d.at[0] + px(8)} y={d.at[1] + px(4)} fontSize={px(11)} fill="#dfe8f2"
                      stroke="#0c1016" strokeWidth={px(2.5)} paintOrder="stroke">{d.name}</text>
                  </g>
                ))}
              </g>
            )}

            {/* terrain backdrop, placed by its recorded metre extent */}
            {on("terrain") && bp.terrain && (
              <image href={`${baseUrl}${bp.terrain.image}`} x={bp.terrain.x0} y={bp.terrain.z0}
                width={bp.terrain.x1 - bp.terrain.x0} height={bp.terrain.z1 - bp.terrain.z0}
                preserveAspectRatio="none" opacity={on("map") ? 0.75 : 0.95} />
            )}

            {/* clearance: hard clear solid-ish, thinned hatched-light, kept trees */}
            {on("clearance") && (
              <g>
                {bp.clearance.hardClear.map((poly, i) => (
                  <path key={`hc${i}`} d={polyPath(poly)} fill="#c8b489" fillOpacity={0.13}
                    stroke="#c8b489" strokeOpacity={0.5} strokeWidth={px(1)} />
                ))}
                {bp.clearance.thinned.map((poly, i) => (
                  <path key={`th${i}`} d={polyPath(poly)} fill="#7fb08a" fillOpacity={0.10}
                    stroke="#7fb08a" strokeOpacity={0.4} strokeWidth={px(1)} strokeDasharray={`${px(5)} ${px(4)}`} />
                ))}
                {bp.clearance.kept.map((k) => k.positionM && (
                  <circle key={k.id} cx={k.positionM[0]} cy={k.positionM[1]} r={px(4)} fill="#57a06a"
                    stroke={k.id === selectedId ? "#fff" : "none"} strokeWidth={px(2)} style={{ cursor: "pointer" }}
                    onMouseEnter={enter(`${shortName(k.id)} — kept ${k.kind ?? "tree"}`)} onMouseLeave={() => setHover(null)}
                    onClick={pickId(k.id)} />
                ))}
              </g>
            )}

            {/* districts */}
            {on("districts") && bp.districts.map((d) => d.polygon && (
              <g key={d.id}>
                <path d={polyPath(d.polygon)} fill={kitFill(d.cultureKit)} fillOpacity={0.22}
                  stroke={kitFill(d.cultureKit)} strokeOpacity={0.9}
                  strokeWidth={px(d.id === selectedId ? 3 : 1.5)} style={{ cursor: "pointer" }}
                  onMouseEnter={enter(`${shortName(d.id)} — ${d.kind ?? "district"} · ${d.cultureKit ?? "?"}`)}
                  onMouseLeave={() => setHover(null)}
                  onClick={pickId(d.id)} />
                {showLabels && d.centreM && (
                  <text x={d.centreM[0]} y={d.centreM[1]} fontSize={px(13)} fill="#dfe8f2" fillOpacity={0.8}
                    textAnchor="middle" pointerEvents="none">{shortName(d.id)}</text>
                )}
              </g>
            ))}

            {/* settlement boundary */}
            {on("boundary") && bp.boundary && (
              <path d={polyPath(bp.boundary)} fill="none" stroke="#f2f2f2" strokeOpacity={0.75}
                strokeWidth={px(1.6)} strokeDasharray={`${px(9)} ${px(6)}`} pointerEvents="none" />
            )}

            {/* combat spaces */}
            {on("combatSpaces") && bp.combatSpaces.map((c) => c.polygon && (
              <path key={c.id} d={polyPath(c.polygon)} fill="#e06c6c" fillOpacity={0.10}
                stroke="#e06c6c" strokeOpacity={0.8} strokeWidth={px(c.id === selectedId ? 3 : 1.2)}
                strokeDasharray={`${px(4)} ${px(3)}`} style={{ cursor: "pointer" }}
                onMouseEnter={enter(`${shortName(c.id)} — combat space · ${c.clearanceClass ?? "?"}`)}
                onMouseLeave={() => setHover(null)}
                onClick={pickId(c.id)} />
            ))}

            {/* ways: roads / canals / boardwalks at their real width; fences,
                walls, palisades and hedges as their own thin line styles */}
            {bp.ways.map((w) => {
              const isFence = w.group === "fences";
              if (!on(isFence ? "fences" : "ways")) return null;
              const st = wayStyle(w.group, w.kind);
              const sel = w.id === selectedId || w.id === spannedWay?.id;
              const width = st.hairline
                ? Math.max(px(sel ? 3.5 : 2), w.widthM ?? 0.3)
                : Math.max(w.widthM ?? 2, px(1.5));
              return (
                <g key={w.id}>
                  <path d={polyPath(w.points, false)} fill="none"
                    stroke={sel ? "#ffffff" : st.colour} strokeOpacity={sel ? 1 : 0.85}
                    strokeWidth={width}
                    strokeDasharray={st.dash ? `${px(st.dash[0])} ${px(st.dash[1])}` : undefined}
                    strokeLinecap="round" strokeLinejoin="round" style={{ cursor: "pointer" }}
                    onMouseEnter={enter(`${shortName(w.id)} — ${w.kind ?? w.group} · ${w.widthM ?? "?"} m wide`)}
                    onMouseLeave={() => setHover(null)}
                    onClick={pickId(w.id)} />
                  {/* the AUTHORED waypoints behind the routed line, when picked */}
                  {w.id === selectedId && w.via && (
                    <g pointerEvents="none">
                      <path d={polyPath(w.via, false)} fill="none" stroke="#ffffff" strokeOpacity={0.35}
                        strokeWidth={px(1)} strokeDasharray={`${px(3)} ${px(4)}`} />
                      {w.via.map((v, i) => (
                        <circle key={i} cx={v[0]} cy={v[1]} r={px(3)} fill="none"
                          stroke="#ffffff" strokeOpacity={0.6} strokeWidth={px(1)} />
                      ))}
                    </g>
                  )}
                  {/* where the way ATTACHES to a parcel / dock / landmark */}
                  {w.id === selectedId && w.endsAt.map((ref) => {
                    const target = positionOf(bp, ref);
                    if (!target) return null;
                    const near = w.points.reduce((a, b) => (dist2(a, target) < dist2(b, target) ? a : b));
                    const dx = target[0] - near[0], dz = target[1] - near[1];
                    const len = Math.hypot(dx, dz) || 1;
                    const t = px(4);
                    return (
                      <line key={ref} x1={near[0] - (dz / len) * t} y1={near[1] + (dx / len) * t}
                        x2={near[0] + (dz / len) * t} y2={near[1] - (dx / len) * t}
                        stroke="#ffffff" strokeWidth={px(2.5)} strokeLinecap="round" pointerEvents="none" />
                    );
                  })}
                </g>
              );
            })}

            {/* parcels: the real footprint, with a yaw stub from the centre */}
            {on("parcels") && bp.parcels.map((p) => {
              const c = p.centreM;
              const yaw = typeof p.yawDeg === "number" ? heading(p.yawDeg) : null;
              const stub = 6;
              return (
                <g key={p.id}>
                  {p.polygon && (
                    <path d={polyPath(p.polygon)} fill={groundFitFill(p.groundFit)} fillOpacity={0.75}
                      stroke={p.id === selectedId ? "#ffffff" : "#22282f"} strokeWidth={px(p.id === selectedId ? 2.5 : 1)}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={enter(`${shortName(p.id)} — ${p.use ?? "?"} · ${p.buildingFamily ?? "?"} · ${p.groundFit ?? "?"}${p.spans ? ` · spans ${shortName(p.spans)}` : ""}`)}
                      onMouseLeave={() => setHover(null)}
                      onClick={pickId(p.id)} />
                  )}
                  {yaw && c && (
                    <line x1={c[0]} y1={c[1]} x2={c[0] + yaw[0] * stub} y2={c[1] + yaw[1] * stub}
                      stroke="#1a1f26" strokeWidth={px(1.6)} pointerEvents="none" />
                  )}
                  {showLabels && c && (
                    <text x={c[0]} y={c[1] - px(7)} fontSize={px(10)} fill="#101418" textAnchor="middle"
                      pointerEvents="none">{shortName(p.id)}</text>
                  )}
                </g>
              );
            })}

            {/* doors: a tick ON the parcel edge the door sits in, plus its facing */}
            {on("doors") && bp.doors.map((d) => {
              if (!d.thresholdM) return null;
              const parcel = d.parcelId ? parcelById.get(d.parcelId) : undefined;
              const at = parcel?.polygon ? nearestEdgePoint(parcel.polygon, d.thresholdM) : d.thresholdM;
              const f = heading(d.facingDeg ?? 0);
              const tick = 1.6, out = 2.4;
              return (
                <g key={d.id} style={{ cursor: "pointer" }}
                  onMouseEnter={enter(`${shortName(d.id)} — door · ${d.interiorClaim.sizeClass ?? "?"} ${d.interiorClaim.culture ?? ""} interior`)}
                  onMouseLeave={() => setHover(null)}
                  onClick={pickId(d.id)}>
                  <line x1={at[0] - f[1] * tick} y1={at[1] + f[0] * tick}
                    x2={at[0] + f[1] * tick} y2={at[1] - f[0] * tick}
                    stroke={d.id === selectedId ? "#ffffff" : "#e8503f"} strokeWidth={Math.max(px(2.5), 0.5)} strokeLinecap="round" />
                  <line x1={at[0]} y1={at[1]} x2={at[0] + f[0] * out} y2={at[1] + f[1] * out}
                    stroke="#e8503f" strokeOpacity={0.8} strokeWidth={Math.max(px(1.4), 0.25)} />
                </g>
              );
            })}

            {/* landmarks and docks */}
            {on("landmarks") && bp.landmarks.map((l) => l.positionM && (
              <g key={l.id}>
                <path d={`M${l.positionM[0]} ${l.positionM[1] - px(6)} L${l.positionM[0] + px(6)} ${l.positionM[1]} L${l.positionM[0]} ${l.positionM[1] + px(6)} L${l.positionM[0] - px(6)} ${l.positionM[1]} Z`}
                  fill="#c98ae0" stroke={l.id === selectedId ? "#fff" : "#2a2030"} strokeWidth={px(1.2)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={enter(`${shortName(l.id)} — landmark · ${l.kind ?? "?"}`)} onMouseLeave={() => setHover(null)}
                  onClick={pickId(l.id)} />
                {showLabels && (
                  <text x={l.positionM[0] + px(9)} y={l.positionM[1] + px(3)} fontSize={px(10)}
                    fill="#e6d4f2" pointerEvents="none">{shortName(l.id)}</text>
                )}
              </g>
            ))}
            {on("docks") && bp.docks.map((d) => d.positionM && (
              <rect key={d.id} x={d.positionM[0] - px(5)} y={d.positionM[1] - px(5)} width={px(10)} height={px(10)}
                fill="#5fd6e8" stroke={d.id === selectedId ? "#fff" : "#12303a"} strokeWidth={px(1.2)}
                style={{ cursor: "pointer" }}
                onMouseEnter={enter(`${shortName(d.id)} — dock · ${d.waterBodyId ?? "?"}`)} onMouseLeave={() => setHover(null)}
                onClick={pickId(d.id)} />
            ))}

            {/* approaches: an arrow in from the edge, the way a player arrives */}
            {on("approaches") && (
              <g>
                <defs>
                  <marker id="bp-approach-head" viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0 0 L10 5 L0 10 z" fill="#ffd166" />
                  </marker>
                </defs>
                {bp.approaches.map((ap) => {
                  const arrow = approachArrow(bp, ap, centre, radius);
                  if (!arrow) return null;
                  const sel = ap.id === selectedId;
                  return (
                    <line key={ap.id} x1={arrow.from[0]} y1={arrow.from[1]} x2={arrow.to[0]} y2={arrow.to[1]}
                      stroke="#ffd166" strokeOpacity={sel ? 1 : 0.75} strokeWidth={px(sel ? 4 : 2.5)}
                      markerEnd="url(#bp-approach-head)" strokeLinecap="round" style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => {
                        setFlashId(ap.firstSeen);
                        enter(`${shortName(ap.id)} — ${ap.mode ?? "walk"} in · first seen: ${ap.firstSeen ? shortName(ap.firstSeen) : "not yet written"}`)(e);
                      }}
                      onMouseLeave={() => { setFlashId(null); setHover(null); }}
                      onClick={pickId(ap.id)} />
                  );
                })}
                {/* the first thing that reads on the horizon, flashed on hover */}
                {flashAt && (
                  <circle cx={flashAt[0]} cy={flashAt[1]} r={px(16)} fill="none" stroke="#ffd166"
                    strokeWidth={px(3)} strokeDasharray={`${px(6)} ${px(4)}`} pointerEvents="none" />
                )}
              </g>
            )}

            {/* quest sockets */}
            {on("questSockets") && bp.questSockets.map((so) => so.positionM && (
              <g key={so.id}>
                <circle cx={so.positionM[0]} cy={so.positionM[1]} r={px(5)} fill={SOCKET_FILL}
                  stroke={so.id === selectedId ? "#fff" : "#3a2f10"} strokeWidth={px(1.4)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={enter(`${shortName(so.id)} — ${so.kind ?? "socket"}${so.ownerQuestTier != null ? ` · tier ${so.ownerQuestTier}` : ""}`)}
                  onMouseLeave={() => setHover(null)}
                  onClick={pickId(so.id)} />
                {showLabels && (
                  <text x={so.positionM[0] + px(8)} y={so.positionM[1] - px(6)} fontSize={px(10)}
                    fill={SOCKET_FILL} pointerEvents="none">{shortName(so.id)}</text>
                )}
              </g>
            ))}

            {/* siting candidates: the deliberation, chosen filled, rejected hollow */}
            {on("siting") && bp.siting?.candidates.map((c) => c.positionM && (
              <g key={c.id}>
                <circle cx={c.positionM[0]} cy={c.positionM[1]} r={px(9)}
                  fill={c.chosen ? "#8fd6a0" : "none"} fillOpacity={0.55}
                  stroke={c.id === selectedId ? "#fff" : c.chosen ? "#8fd6a0" : "#d08a8a"}
                  strokeWidth={px(2)} strokeDasharray={c.chosen ? undefined : `${px(4)} ${px(3)}`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={enter(`${shortName(c.id)} — siting candidate (${c.chosen ? "chosen" : "rejected"})`)}
                  onMouseLeave={() => setHover(null)}
                  onClick={pickId(c.id)} />
                {showLabels && (
                  <text x={c.positionM[0] + px(12)} y={c.positionM[1] + px(4)} fontSize={px(10)}
                    fill={c.chosen ? "#8fd6a0" : "#d08a8a"} pointerEvents="none">{shortName(c.id)}</text>
                )}
              </g>
            ))}
          </svg>
        )}

        {/* scale bar + north arrow */}
        {view && (
          <div style={{ position: "absolute", left: 12, bottom: 12, display: "flex", gap: 14, alignItems: "flex-end", pointerEvents: "none" }}>
            <div>
              <div style={{ height: 7, borderLeft: "2px solid #e6ecf5", borderRight: "2px solid #e6ecf5",
                borderBottom: "2px solid #e6ecf5", width: scaleBarMetres(s) * s }} />
              <div style={{ font: "11px system-ui", opacity: 0.85 }}>{scaleBarMetres(s)} m · {s.toFixed(2)} px/m</div>
            </div>
            <div style={{ font: "11px system-ui", opacity: 0.85, textAlign: "center" }}>↑<br />N</div>
          </div>
        )}

        {hover && (
          <div style={{ ...PANEL, position: "absolute", left: hover.x + 14, top: hover.y + 12, padding: "3px 7px",
            pointerEvents: "none", whiteSpace: "nowrap", zIndex: 4 }}>{hover.text}</div>
        )}
      </div>

      {/* ---- header: blueprint picker + layer checklist -------------------- */}
      <div style={{ ...PANEL, position: "absolute", top: 10, left: 10, zIndex: 5, maxWidth: 460 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ font: "600 13px system-ui" }}>Blueprints</strong>
          <select value={bp?.id ?? ""} onChange={(e) => { setBlueprintId(e.target.value); setSelectedId(null); }}
            style={{ background: "#141a22", color: "#e6ecf5", border: "1px solid #2b3644", borderRadius: 5, padding: "3px 6px", font: "12px system-ui" }}>
            {(bundle?.blueprints ?? []).map((b) => (
              <option key={b.id} value={b.id}>{shortName(b.id)}</option>
            ))}
          </select>
          <button onClick={fit} style={{ cursor: "pointer", background: "#1c2430", color: "#d8dee7", border: "1px solid #4a5568", borderRadius: 5, padding: "3px 9px", font: "12px system-ui" }}>reset (0)</button>
          <button onClick={onClose} style={{ cursor: "pointer", background: "none", border: "none", color: "#8b96a3", font: "14px system-ui" }}>✕ close</button>
        </div>
        {error && <div style={{ marginTop: 5, color: "#ff9d8a" }}>{error}</div>}
        {mapError && <div style={{ marginTop: 5, color: "#ff9d8a" }}>province map: {mapError}</div>}
        {!bundle && !error && <div style={{ marginTop: 5, opacity: 0.75 }}>loading blueprints.json…</div>}
        {bp && (
          <>
            <div style={{ marginTop: 5, opacity: 0.75, wordBreak: "break-all" }}>{bp.id}</div>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 6 }}>
              {(bundle?.layers ?? []).map((name) => (
                <label key={name} style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={!hidden.has(name)}
                    onChange={() => setHidden(toggleIn(hidden, name))} /> {LAYER_LABEL[name] ?? name}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 6, opacity: 0.6 }}>
              wheel to zoom · drag to pan · +/− zoom · 0 reset ·
              labels appear at {LABEL_PX_PER_M} px per metre{showLabels ? " (on)" : " (zoom in)"}
            </div>
            <div style={{ marginTop: 4, opacity: 0.55 }}>
              The province map is the same picture as the map screen, at ~5.5 m per pixel —
              coarse this close in. It shows where the place sits and what is around it;
              the terrain crop under it reads the ground.
            </div>
          </>
        )}
      </div>

      {/* ---- details panel ------------------------------------------------ */}
      {bp && (
        <div style={{ ...PANEL, position: "absolute", top: 10, right: 10, zIndex: 5, width: 360, maxHeight: "88%", overflowY: "auto" }}>
          {picked ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <strong style={{ font: "600 14px system-ui" }}>{picked.title}</strong>
                <button onClick={() => setSelectedId(null)} style={{ cursor: "pointer", background: "none", border: "none", color: "#8b96a3" }}>✕</button>
              </div>
              <div style={{ color: "#9ec5ff" }}>{picked.kind}</div>

              {/* the whys, in plain English, first */}
              {picked.wantsWhy && (
                <div style={{ marginTop: 8 }}>
                  {/* a way or a combat space carries one sentence, not a block */}
                  {picked.sentenceWhy ? (
                      picked.whyText
                        ? <div style={{ lineHeight: 1.45 }}>{picked.whyText}</div>
                        : <NotWritten what="no reason given for what this connects or why it runs here" />
                    ) : picked.why ? (
                      WHY_HEADINGS
                        .filter(([k]) => !picked.areaOnly || AREA_WHY_KEYS.has(k))
                        .map(([k, label]) => (
                          <div key={k} style={{ marginTop: 6 }}>
                            <div style={{ color: "#ffc46b", fontWeight: 600 }}>{label}</div>
                            {picked.why?.[k]
                              ? <div style={{ lineHeight: 1.45 }}>{picked.why[k]}</div>
                              : <NotWritten what={`no “${label.toLowerCase()}”`} />}
                          </div>
                        ))
                    ) : <NotWritten what="this record carries no `why` block" />}
                </div>
              )}

              {/* orientation and its reason */}
              {picked.orientation && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: "#8fd6a0", fontWeight: 600 }}>Which way it faces</div>
                  <div style={{ lineHeight: 1.45 }}>{picked.orientation.facing}</div>
                  {picked.orientation.why
                    ? <div style={{ lineHeight: 1.45, opacity: 0.9 }}>{picked.orientation.why}</div>
                    : <NotWritten what="no reason given for the facing" />}
                </div>
              )}

              {/* the dense fields, out of the way */}
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", opacity: 0.75 }}>ids, piece, ground fit</summary>
                <div style={{ opacity: 0.6, wordBreak: "break-all", marginTop: 4 }}>{picked.id}</div>
                {picked.fields.map(([k, v]) => <Field key={k} k={k} v={v} />)}
                {!picked.fields.length && <div style={{ marginTop: 4, opacity: 0.7 }}>no further fields on this object</div>}
              </details>
            </>
          ) : (
            <>
              <strong style={{ font: "600 14px system-ui" }}>{shortName(bp.id)}</strong>
              <div style={{ opacity: 0.7, marginTop: 3 }}>
                {Object.entries(bp.summary).map(([k, v]) => `${v} ${k}`).join(" · ")}
              </div>
              <div style={{ color: "#ffc46b", fontWeight: 600, marginTop: 8 }}>why it is here</div>
              {Object.entries(bp.causalModel).map(([k, v]) => <Field key={k} k={k} v={v} />)}
              {bp.siting?.dossier && <Field k="dossier" v={bp.siting.dossier} />}

              <div style={{ color: "#9ec5ff", fontWeight: 600, marginTop: 10 }}>how a player arrives</div>
              {bp.approaches.length ? bp.approaches.map((ap) => (
                <div key={ap.id} style={{ marginTop: 6, paddingLeft: 8, borderLeft: "2px solid #2b3644", cursor: "pointer" }}
                  onMouseEnter={() => setFlashId(ap.firstSeen)} onMouseLeave={() => setFlashId(null)}
                  onClick={() => setSelectedId(ap.id)}>
                  <div style={{ opacity: 0.8 }}>
                    {ap.mode ?? "walk"} in{ap.fromDirection ? ` from the ${ap.fromDirection}` : ""}
                    {ap.fromRouteId ? ` along ${shortName(ap.fromRouteId)}` : ""}
                  </div>
                  <div style={{ lineHeight: 1.45 }}>
                    <span style={{ opacity: 0.65 }}>first seen: </span>
                    {ap.firstSeen ? shortName(ap.firstSeen) : <span style={MISSING}>not yet written</span>}
                  </div>
                  {ap.sequence ? <div style={{ lineHeight: 1.45 }}>{ap.sequence}</div>
                    : <NotWritten what="no order of sight" />}
                  {ap.wayfinding ? <div style={{ lineHeight: 1.45, opacity: 0.9 }}>{ap.wayfinding}</div>
                    : <NotWritten what="no wayfinding" />}
                </div>
              )) : <NotWritten what="no approach designed — the place is only judged from the air" />}

              <div style={{ color: "#8fd6a0", fontWeight: 600, marginTop: 10 }}>how big, and why</div>
              {bp.scaleGrounding ? (
                <>
                  {bp.scaleGrounding.why && <div style={{ lineHeight: 1.45 }}>{bp.scaleGrounding.why}</div>}
                  {Object.entries(bp.scaleGrounding)
                    .filter(([k]) => k !== "why")
                    .map(([k, v]) => <Field key={k} k={k} v={v} />)}
                </>
              ) : <NotWritten what="the size is not grounded in lore" />}

              <div style={{ color: "#8fd6a0", fontWeight: 600, marginTop: 10 }}>budget</div>
              {Object.entries(bp.budget).map(([k, v]) => <Field key={k} k={k} v={v} />)}
              {bp.provision.quests?.length ? (
                <>
                  <div style={{ color: "#ffd166", fontWeight: 600, marginTop: 8 }}>quests provided for</div>
                  <Field k="quests" v={bp.provision.quests} />
                  {bp.provision.notes && <Field k="notes" v={bp.provision.notes} />}
                </>
              ) : null}
              {bp.assetConstraints.length > 0 && (
                <>
                  <div style={{ color: "#9fe0c8", fontWeight: 600, marginTop: 8 }}>asset constraints</div>
                  {bp.assetConstraints.map((c, i) => (
                    <div key={i} style={{ marginTop: 3, paddingLeft: 8 }}>· {c}</div>
                  ))}
                </>
              )}
              <div style={{ marginTop: 8, opacity: 0.6 }}>click anything on the map for its own record.</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
