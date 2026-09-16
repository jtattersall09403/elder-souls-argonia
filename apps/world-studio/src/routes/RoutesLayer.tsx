/**
 * "Routes" — clickable road, boat-lane, minor-track and minor-channel lines
 * over the 2D map, with the four route sub-layers (spans, grades, crossings,
 * services) drawn from their published records.
 *
 * Roads (routes.json) and minor tracks (routes-minor.json) draw in tan; boat
 * lanes (waterways.json) and minor channels (waterways-minor.json, tolerated
 * absent) draw in cyan under `water=1`. Clicking any line opens a details
 * panel: id, name, class, mode, from/to, length, and — for lines whose `id` is
 * in the route registry (routes-index.json, written by worldgen.export_routes)
 * — confidence, sources and notes.
 *
 * HOVER goes through the map's one tooltip (owner 2026-09-16): every element
 * here reports its `TipSection`s through `onHover`, and App merges them into
 * the readout it already draws for the ground, the water and the graph. A
 * span or a flight is drawn as a RECOLOURED STRETCH of its road line, never a
 * marker (owner 2026-09-16).
 *
 * Mount inside the map's transformed wrapper, under PlacesLayer: the SVG
 * shares its u/v space. Selection round-trips through the URL (`route=`);
 * App owns the query string.
 */
import { useEffect, useMemo, useState } from "react";
import {
  CROSSING_BAND_COLOUR, GRADE_STYLE, HOP_STYLE, ROUTE_STYLE, STATION_COLOUR, STRUCTURE_COLOUR,
  STRUCTURE_STYLE, crossingTip, gradeTip, loadCrossings, loadMinorWaterways, loadRoads,
  loadRouteGrades, loadRoutesIndex, loadRouteStructures, loadTravelServices, loadWaterways,
  metresToPx, routeTip, selectMajor, selectMinor, serviceTip, stationTip, structurePx, structureTip,
  type MinorTrack, type RouteGrade, type RouteGeometry, type RouteSelection, type RouteStructure,
  type RouteSubLayer, type RoutesIndexBundle, type TravelServicesBundle, type WaterCrossing,
} from "./routesData";
import type { TipSection } from "../map/hydrographIndex";
import { hydroPixelCenterToUv } from "../provinceScale";
import { loadLadder, type Ladder } from "../ladder";

const VB = 1000;

/** Hydrology pixel → this SVG's viewBox coordinate (the layer's one mapping). */
const uv = (pixel: number) => hydroPixelCenterToUv(pixel) * VB;

/** A layer draws only if the stage that makes it ran on this ground. No
 *  ladder record at all (a build from before the record existed) hides nothing. */
const stageRan = (l: Ladder | null, stage: string) => l === null || l.ran.includes(stage);

const PANEL: React.CSSProperties = {
  background: "rgba(10,14,20,0.9)", color: "#e6ecf5", border: "1px solid #2b3644",
  borderRadius: 8, padding: "8px 10px", font: "12px system-ui",
};

export interface RoutesLayerProps {
  baseUrl: string;
  /** Draw the boat lanes and minor channels (`water=1`). */
  showWater: boolean;
  /** Draw the minor land tracks (shares the places layer's `tracks=1`). */
  showTracks: boolean;
  selectedKey: string | null;
  onSelectedKey: (key: string | null) => void;
  /** `place.<region>.<slug>` → display name, supplied by the places bundle. */
  placeName: (id: string) => string;
  /** Which of the four route sub-layers are on (`routeLayers=`; spans and
   *  crossings unless the URL says otherwise). */
  subLayers?: RouteSubLayer[];
  /** The sections the map's tooltip should show for the hovered element, or
   *  null when the pointer leaves it. */
  onHover?: (sections: TipSection[] | null) => void;
}

function Row({ k, v }: { k: string; v: unknown }) {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return null;
  return (
    <div style={{ marginTop: 2, wordBreak: "break-word" }}>
      <span style={{ opacity: 0.65 }}>{k}: </span>{Array.isArray(v) ? v.join(", ") : String(v)}
    </div>
  );
}

export function RoutesLayer({
  baseUrl, showWater, showTracks, selectedKey, onSelectedKey, placeName, subLayers = [], onHover,
}: RoutesLayerProps) {
  const [index, setIndex] = useState<RoutesIndexBundle | null>(null);
  const [roads, setRoads] = useState<RouteGeometry[]>([]);
  const [lanes, setLanes] = useState<RouteGeometry[]>([]);
  const [tracks, setTracks] = useState<MinorTrack[]>([]);
  const [channels, setChannels] = useState<MinorTrack[] | null>(null);
  const [structures, setStructures] = useState<RouteStructure[]>([]);
  const [grades, setGrades] = useState<RouteGrade[] | null>(null);
  const [crossings, setCrossings] = useState<WaterCrossing[] | null>(null);
  const [services, setServices] = useState<TravelServicesBundle | null>(null);
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [open, setOpen] = useState(true);
  const layerOn = (n: RouteSubLayer) => subLayers.includes(n);
  const showSpans = layerOn("spans"), showGrades = layerOn("grades");
  const showCrossings = layerOn("crossings"), showServices = layerOn("services");
  // routes-minor.json / waterways-minor.json are the Phase 11 solve; on this
  // ground their stages were skipped, so they would draw a second, stale road
  // network beside the real one (owner 2026-09-16). A build with no ladder
  // record at all hides nothing (ladder.ts).
  const minorRoutesBuilt = stageRan(ladder, "compile_minor_routes");
  const minorChannelsBuilt = stageRan(ladder, "compile_minor_waterways");
  const unbuiltMinor = [
    showTracks && !minorRoutesBuilt ? "minor routes" : "",
    showWater && !minorChannelsBuilt ? "minor waterways" : "",
  ].filter(Boolean).join(" and ");
  const hover = (sections: TipSection[] | null) => ({
    onPointerEnter: () => onHover?.(sections),
    onPointerLeave: () => onHover?.(null),
  });

  useEffect(() => {
    let alive = true;
    const set = <T,>(f: (v: T) => void) => (v: T) => { if (alive) f(v); };
    loadRoutesIndex(baseUrl).then(set(setIndex)).catch(() => {});
    loadRoads(baseUrl).then(set(setRoads)).catch(() => {});
    // Every layer here is gated on the STAGE that produces it having run on
    // this ground (province/ladder.json `ran`), not on the record's
    // `hiddenLayers` list: `compile_route_structures` ran at 16e while
    // `hiddenLayers` still names "route-structures" (16h draws it in 3D).
    loadLadder(baseUrl).then((l) => {
      if (!alive) return;
      setLadder(l);
      if (stageRan(l, "compile_route_structures")) {
        loadRouteStructures(baseUrl).then(set(setStructures)).catch(() => {});
      }
    });
    return () => { alive = false; };
  }, [baseUrl]);

  useEffect(() => {
    if (!showWater || channels !== null) return;
    let alive = true;
    Promise.all([
      loadWaterways(baseUrl),
      minorChannelsBuilt ? loadMinorWaterways(baseUrl) : Promise.resolve([] as MinorTrack[]),
    ])
      .then(([l, c]) => { if (alive) { setLanes(l); setChannels(c); } })
      .catch(() => { if (alive) setChannels([]); });
    return () => { alive = false; };
  }, [showWater, channels, minorChannelsBuilt, baseUrl]);

  // The three published records are fetched the first time their layer is
  // switched on, and kept: they are small and the owner toggles them often.
  useEffect(() => {
    if (!showGrades || grades !== null) return;
    let alive = true;
    loadRouteGrades(baseUrl).then((g) => { if (alive) setGrades(g); }).catch(() => { if (alive) setGrades([]); });
    return () => { alive = false; };
  }, [showGrades, grades, baseUrl]);

  useEffect(() => {
    // the spans layer needs them too: a structure's hover names the crossing
    // it carries (route-structures.json `crossingId`, decision 0066)
    if ((!showCrossings && !showSpans) || crossings !== null) return;
    let alive = true;
    loadCrossings(baseUrl).then((c) => { if (alive) setCrossings(c); }).catch(() => { if (alive) setCrossings([]); });
    return () => { alive = false; };
  }, [showCrossings, showSpans, crossings, baseUrl]);

  useEffect(() => {
    if (!showServices || services !== null) return;
    let alive = true;
    loadTravelServices(baseUrl)
      .then((s) => { if (alive) setServices(s); })
      .catch(() => { if (alive) setServices({ stations: [], services: [], rootways: [] }); });
    return () => { alive = false; };
  }, [showServices, services, baseUrl]);

  useEffect(() => {
    if (!showTracks || tracks.length || !minorRoutesBuilt) return;
    let alive = true;
    import("../places/placesData").then(({ loadMinorTracks }) => loadMinorTracks(baseUrl))
      .then((b) => { if (alive && b) setTracks(b.tracks); })
      .catch(() => {});
    return () => { alive = false; };
  }, [showTracks, tracks.length, minorRoutesBuilt, baseUrl]);

  const lines = useMemo(() => {
    const out: RouteSelection[] = roads.map((g) => selectMajor(g, "road", index));
    if (showTracks && minorRoutesBuilt) out.push(...tracks.map((t) => selectMinor(t, "track", index, placeName)));
    if (showWater) {
      out.push(...lanes.map((g) => selectMajor(g, "boat", index)));
      if (minorChannelsBuilt) out.push(...(channels ?? []).map((t) => selectMinor(t, "channel", index, placeName)));
    }
    return out;
  }, [roads, lanes, tracks, channels, index, showWater, showTracks, minorRoutesBuilt, minorChannelsBuilt, placeName]);

  const selected = useMemo(() => lines.find((l) => l.key === selectedKey) ?? null, [lines, selectedKey]);

  /** The crossing a structure carries, by the `crossingId` its record states. */
  const crossingById = useMemo(() => new Map((crossings ?? []).map((c) => [c.id, c])), [crossings]);

  const stationPos = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const st of services?.stations ?? []) if (st.positionM) m.set(st.id, metresToPx(st.positionM));
    return m;
  }, [services]);

  return (
    <>
      <svg viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: "none" }}>
        {lines.map((l) => {
          const st = ROUTE_STYLE[l.mode];
          const pts = l.px.map(([c, r]) => `${uv(c)},${uv(r)}`).join(" ");
          const on = l.key === selectedKey;
          return (
            <g key={l.key} style={{ cursor: "pointer" }} {...hover([routeTip(l)])}
              onClick={(e) => { e.stopPropagation(); onSelectedKey(on ? null : l.key); }}>
              {/* fat invisible hit line: thin routes are hard to hit exactly;
                  pointerEvents "stroke" so a transparent stroke still hits */}
              <polyline points={pts} fill="none" stroke="transparent" strokeWidth={9} vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "stroke" }} />
              <polyline points={pts} fill="none" stroke={on ? "#ffffff" : st.stroke}
                strokeWidth={on ? st.width + 1.6 : st.width} strokeDasharray={st.dash}
                opacity={on ? 1 : 0.85} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {/* SPANS AND FLIGHTS: the stretch of the road each structure occupies,
            recoloured by kind. The pieces themselves are placed in 3D by 16h. */}
        {showSpans && structures.map((s) => {
          const px = structurePx(s);
          if (px.length < 2) return null;
          const pts = px.map(([c, r]) => `${uv(c)},${uv(r)}`).join(" ");
          const colour = STRUCTURE_COLOUR[s.kind] ?? STRUCTURE_STYLE.stroke;
          const carried = s.crossingId ? crossingById.get(s.crossingId) ?? null : null;
          return (
            <g key={s.id} style={{ pointerEvents: "stroke" }} {...hover([structureTip(s, carried)])}>
              <polyline points={pts} fill="none" stroke="transparent" strokeWidth={9} vectorEffect="non-scaling-stroke" />
              <polyline points={pts} fill="none" stroke={colour} strokeWidth={STRUCTURE_STYLE.width}
                strokeLinecap="butt" vectorEffect="non-scaling-stroke" opacity={0.95} />
            </g>
          );
        })}

        {/* GRADES: each capped choke point drawn over its road in amber. Every
            number on hover comes from route-grades.json; none is recomputed. */}
        {showGrades && (grades ?? []).map((g) => {
          if (g.lineM.length < 2) return null;
          const pts = g.lineM.map((p) => { const [c, r] = metresToPx(p); return `${uv(c)},${uv(r)}`; }).join(" ");
          return (
            <g key={g.id} style={{ pointerEvents: "stroke" }} {...hover([gradeTip(g)])}>
              <polyline points={pts} fill="none" stroke="transparent" strokeWidth={9}
                vectorEffect="non-scaling-stroke" />
              <polyline points={pts} fill="none" stroke={GRADE_STYLE.stroke}
                strokeWidth={GRADE_STYLE.width} strokeLinecap="round"
                vectorEffect="non-scaling-stroke" opacity={0.9} />
            </g>
          );
        })}

        {/* CROSSINGS: one marker per place a way stands in water, by band. */}
        {showCrossings && (crossings ?? []).map((c) => {
          const [cx, cy] = metresToPx(c.positionM);
          const colour = CROSSING_BAND_COLOUR[c.band] ?? "#ffffff";
          return (
            <g key={c.id} style={{ pointerEvents: "all" }} {...hover([crossingTip(c)])}>
              {c.banks?.length === 2 && (
                <polyline points={c.banks.map((b) => { const [u2, v2] = metresToPx(b); return `${uv(u2)},${uv(v2)}`; }).join(" ")}
                  fill="none" stroke={colour} strokeWidth={1.2} strokeDasharray="3 2"
                  vectorEffect="non-scaling-stroke" opacity={0.7} />
              )}
              <circle cx={uv(cx)} cy={uv(cy)} r={4.5} fill={colour} stroke="#0b0f15" strokeWidth={0.8}
                vectorEffect="non-scaling-stroke" />
              <text x={uv(cx) + 6} y={uv(cy) - 5} fill={colour} fontSize={8} opacity={0.85}>{c.water}</text>
            </g>
          );
        })}

        {/* SERVICES: the stations you board at and the hops between them. */}
        {showServices && services && <>
          {services.services.flatMap((sv) => sv.hops.map((h, i) => {
            const a = stationPos.get(h.from), b = stationPos.get(h.to);
            if (!a || !b) return null;
            const st = HOP_STYLE[sv.serviceKind] ?? { stroke: "#c9d3e0" };
            return (
              <g key={`${sv.id}:${i}`} style={{ pointerEvents: "stroke" }} {...hover([serviceTip(sv)])}>
                <line x1={uv(a[0])} y1={uv(a[1])} x2={uv(b[0])} y2={uv(b[1])} stroke="transparent"
                  strokeWidth={9} vectorEffect="non-scaling-stroke" />
                <line x1={uv(a[0])} y1={uv(a[1])} x2={uv(b[0])} y2={uv(b[1])} stroke={st.stroke}
                  strokeWidth={2} strokeDasharray={st.dash} vectorEffect="non-scaling-stroke" opacity={0.9} />
              </g>
            );
          }))}
          {services.stations.map((st) => {
            if (!st.positionM) return null;
            const [sx, sy] = metresToPx(st.positionM);
            return (
              <g key={st.id} style={{ pointerEvents: "all" }} {...hover([stationTip(st)])}>
                <circle cx={uv(sx)} cy={uv(sy)} r={3.6} fill={STATION_COLOUR[st.kind] ?? "#c9d3e0"}
                  stroke="#0b0f15" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </>}
      </svg>

      {unbuiltMinor && (
        <div style={{
          ...PANEL, position: "absolute", top: 8, left: 8, zIndex: 3, maxWidth: 260, opacity: 0.85,
        }}>
          {unbuiltMinor}: not built on this ground (16g)
        </div>
      )}

      {selected && (
        <div style={{
          ...PANEL, position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
          zIndex: 3, width: 330, maxHeight: open ? "55%" : undefined, overflowY: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <button onClick={() => setOpen(!open)} title={open ? "collapse" : "expand"}
              style={{ cursor: "pointer", background: "none", border: "none", color: "#e6ecf5", font: "600 13px system-ui", padding: 0, textAlign: "left" }}>
              {open ? "▾" : "▸"} {selected.name}
            </button>
            <button onClick={() => onSelectedKey(null)} style={{ cursor: "pointer", background: "none", border: "none", color: "#8b96a3" }}>✕</button>
          </div>
          {open && <>
            <div style={{ opacity: 0.7, wordBreak: "break-all" }}>{selected.id ?? "(not in the route registry)"}</div>
            <Row k="mode" v={selected.mode} />
            <Row k="class" v={selected.klass} />
            <Row k="from" v={selected.from} />
            <Row k="to" v={selected.to} />
            <Row k="length" v={selected.lengthKm === null ? null : `${selected.lengthKm.toFixed(2)} km`} />
            {selected.registry ? <>
              <Row k="confidence" v={selected.registry.confidence} />
              <Row k="condition" v={selected.registry.condition} />
              <Row k="condition why" v={selected.registry.conditionWhy} />
              {selected.registry.solved === false && <Row k="solved" v="no geometry solved yet" />}
              <Row k="notes" v={selected.registry.notes} />
              <Row k="sources" v={selected.registry.sources} />
              <Row k="aliases" v={selected.registry.aliases} />
            </> : (
              <div style={{ marginTop: 4, opacity: 0.6 }}>derived route — no registry entry</div>
            )}
          </>}
        </div>
      )}
    </>
  );
}
