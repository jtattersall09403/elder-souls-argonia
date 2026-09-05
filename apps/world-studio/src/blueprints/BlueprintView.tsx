/**
 * Blueprint view (Phase 11 Part 7) — the interactive replacement for the static
 * `render_blueprint` PNG sheets, which the owner could not read ("a lot of stuff
 * jumbled on top of each other", 2026-09-05).
 *
 * Wheel to zoom, drag to pan, `+`/`-`/`0` on the keyboard. The terrain crop sits
 * underneath; then clearance, districts (tinted by kit set), ways, parcels as
 * their real footprints (a tick on the door edge, a stub for the authored yaw),
 * landmarks, docks, combat spaces, quest sockets and the siting candidates.
 * Hover names a thing; click opens every field it carries — for a parcel its
 * asset and orientation reason, for a candidate why it won or lost. Each class
 * has a checkbox, and labels appear only past LABEL_PX_PER_M so a village does
 * not turn into a wall of text.
 *
 * All geometry is in world metres, straight from blueprints.json — the SVG's
 * user space IS metre space (X east, Z south), so the scale bar is honest and
 * nothing has to be un-projected. Selection, the chosen blueprint and the hidden
 * layers round-trip through the URL via `onUrlState` (App owns the query string).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  blueprintBounds, findBlueprint, groundFitFill, kitFill,
  LABEL_PX_PER_M, loadBlueprints, polyPath, scaleBarMetres, shortName, SOCKET_FILL,
  toggleIn, WAY_STYLE,
  type BlueprintBundle, type BlueprintUrlState, type Poly, type Pt,
} from "./blueprintsData";

const PANEL: React.CSSProperties = {
  background: "rgba(10,14,20,0.92)", color: "#e6ecf5", border: "1px solid #2b3644",
  borderRadius: 8, padding: "8px 10px", font: "12px system-ui",
};

const LAYER_LABEL: Record<string, string> = {
  terrain: "terrain", boundary: "boundary", clearance: "clearance", districts: "districts",
  ways: "roads / canals / boardwalks", parcels: "parcels", doors: "doors",
  landmarks: "landmarks", docks: "docks", combatSpaces: "combat spaces",
  questSockets: "quest sockets", siting: "siting candidates",
};

/** What a click selected: the object, its class, and the fields to list. */
interface Picked {
  id: string;
  kind: string;
  title: string;
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
      const s = Math.max(0.05, Math.min(80, v.s * factor));
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

  const pick = (p: Picked) => (e: React.MouseEvent) => { e.stopPropagation(); setSelectedId(p.id); };
  const enter = (text: string) => (e: React.MouseEvent) => {
    const r = boxRef.current?.getBoundingClientRect();
    setHover({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0), text });
  };

  const picked: Picked | null = useMemo(() => {
    if (!bp || !selectedId) return null;
    const find = <T extends { id: string }>(list: T[]) => list.find((o) => o.id === selectedId);
    const d = find(bp.districts);
    if (d) return { id: d.id, kind: "district", title: shortName(d.id), fields: fieldsOf(d as unknown as Record<string, unknown>, ["kind", "cultureKit", "wealth", "notes"]) };
    const p = find(bp.parcels);
    if (p) return { id: p.id, kind: "parcel", title: shortName(p.id), fields: fieldsOf(p as unknown as Record<string, unknown>, ["use", "districtId", "buildingFamily", "assetRef", "groundFit", "yawDeg", "orientationWhy", "notes", "centreM"]) };
    const w = find(bp.ways);
    if (w) return { id: w.id, kind: w.group, title: shortName(w.id), fields: fieldsOf(w as unknown as Record<string, unknown>, ["kind", "widthM", "notes"]) };
    const dr = find(bp.doors);
    if (dr) return { id: dr.id, kind: "door", title: shortName(dr.id), fields: [...fieldsOf(dr as unknown as Record<string, unknown>, ["parcelId", "facingDeg", "thresholdM"]), ...fieldsOf(dr.interiorClaim as unknown as Record<string, unknown>, ["sizeClass", "culture", "owner"])] };
    const lm = find(bp.landmarks);
    if (lm) return { id: lm.id, kind: "landmark", title: shortName(lm.id), fields: fieldsOf(lm as unknown as Record<string, unknown>, ["kind", "assetRef", "notes", "positionM"]) };
    const dk = find(bp.docks);
    if (dk) return { id: dk.id, kind: "dock", title: shortName(dk.id), fields: fieldsOf(dk as unknown as Record<string, unknown>, ["waterBodyId", "piledToBed", "notes", "positionM"]) };
    const cs = find(bp.combatSpaces);
    if (cs) return { id: cs.id, kind: "combat space", title: shortName(cs.id), fields: fieldsOf(cs as unknown as Record<string, unknown>, ["clearanceClass", "notes"]) };
    const so = find(bp.questSockets);
    if (so) return { id: so.id, kind: "quest socket", title: shortName(so.id), fields: fieldsOf(so as unknown as Record<string, unknown>, ["kind", "parcelId", "ownerQuestTier", "notes", "positionM"]) };
    const kt = find(bp.clearance.kept);
    if (kt) return { id: kt.id, kind: "kept tree", title: shortName(kt.id), fields: fieldsOf(kt as unknown as Record<string, unknown>, ["kind", "notes", "positionM"]) };
    const ca = bp.siting?.candidates.find((c) => c.id === selectedId);
    if (ca) return { id: ca.id, kind: ca.chosen ? "siting candidate (chosen)" : "siting candidate (rejected)", title: shortName(ca.id), fields: fieldsOf(ca as unknown as Record<string, unknown>, ["positionM", "why", "rejectedBecause"]) };
    return null;
  }, [bp, selectedId]);

  const parcelById = useMemo(() => new Map((bp?.parcels ?? []).map((p) => [p.id, p])), [bp]);

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
            {/* terrain backdrop, placed by its recorded metre extent */}
            {on("terrain") && bp.terrain && (
              <image href={`${baseUrl}${bp.terrain.image}`} x={bp.terrain.x0} y={bp.terrain.z0}
                width={bp.terrain.x1 - bp.terrain.x0} height={bp.terrain.z1 - bp.terrain.z0}
                preserveAspectRatio="none" opacity={0.9} />
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
                    onClick={pick({ id: k.id, kind: "kept tree", title: k.id, fields: [] })} />
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
                  onClick={pick({ id: d.id, kind: "district", title: d.id, fields: [] })} />
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
                onClick={pick({ id: c.id, kind: "combat space", title: c.id, fields: [] })} />
            ))}

            {/* ways: drawn at their real width, so a 2.2 m boardwalk looks it */}
            {on("ways") && bp.ways.map((w) => {
              const style = WAY_STYLE[w.group] ?? WAY_STYLE.routes;
              return (
                <path key={w.id} d={polyPath(w.points, false)} fill="none" stroke={style.colour}
                  strokeOpacity={w.id === selectedId ? 1 : 0.85}
                  strokeWidth={Math.max(w.widthM ?? 2, px(1.5))}
                  strokeDasharray={style.dash ? `${px(7)} ${px(5)}` : undefined}
                  strokeLinecap="round" strokeLinejoin="round" style={{ cursor: "pointer" }}
                  onMouseEnter={enter(`${shortName(w.id)} — ${w.kind ?? w.group} · ${w.widthM ?? "?"} m wide`)}
                  onMouseLeave={() => setHover(null)}
                  onClick={pick({ id: w.id, kind: w.group, title: w.id, fields: [] })} />
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
                      onMouseEnter={enter(`${shortName(p.id)} — ${p.use ?? "?"} · ${p.buildingFamily ?? "?"} · ${p.groundFit ?? "?"}`)}
                      onMouseLeave={() => setHover(null)}
                      onClick={pick({ id: p.id, kind: "parcel", title: p.id, fields: [] })} />
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

            {/* doors: a tick across the wall the door sits in, plus its facing */}
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
                  onClick={pick({ id: d.id, kind: "door", title: d.id, fields: [] })}>
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
                  onClick={pick({ id: l.id, kind: "landmark", title: l.id, fields: [] })} />
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
                onClick={pick({ id: d.id, kind: "dock", title: d.id, fields: [] })} />
            ))}

            {/* quest sockets */}
            {on("questSockets") && bp.questSockets.map((so) => so.positionM && (
              <g key={so.id}>
                <circle cx={so.positionM[0]} cy={so.positionM[1]} r={px(5)} fill={SOCKET_FILL}
                  stroke={so.id === selectedId ? "#fff" : "#3a2f10"} strokeWidth={px(1.4)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={enter(`${shortName(so.id)} — ${so.kind ?? "socket"}${so.ownerQuestTier != null ? ` · tier ${so.ownerQuestTier}` : ""}`)}
                  onMouseLeave={() => setHover(null)}
                  onClick={pick({ id: so.id, kind: "quest socket", title: so.id, fields: [] })} />
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
                  onClick={pick({ id: c.id, kind: "siting candidate", title: c.id, fields: [] })} />
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
          </>
        )}
      </div>

      {/* ---- details panel ------------------------------------------------ */}
      {bp && (
        <div style={{ ...PANEL, position: "absolute", top: 10, right: 10, zIndex: 5, width: 340, maxHeight: "88%", overflowY: "auto" }}>
          {picked ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <strong style={{ font: "600 14px system-ui" }}>{picked.title}</strong>
                <button onClick={() => setSelectedId(null)} style={{ cursor: "pointer", background: "none", border: "none", color: "#8b96a3" }}>✕</button>
              </div>
              <div style={{ color: "#9ec5ff" }}>{picked.kind}</div>
              <div style={{ opacity: 0.6, wordBreak: "break-all" }}>{picked.id}</div>
              {picked.fields.map(([k, v]) => <Field key={k} k={k} v={v} />)}
              {!picked.fields.length && <div style={{ marginTop: 4, opacity: 0.7 }}>no further fields on this object</div>}
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
              <div style={{ color: "#8fd6a0", fontWeight: 600, marginTop: 8 }}>budget</div>
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
