/**
 * "Routes" — clickable road, boat-lane, minor-track and minor-channel lines
 * over the 2D map (Phase 11 Part 4 step 2, owner feedback round).
 *
 * Roads (routes.json) and minor tracks (routes-minor.json) draw in tan; boat
 * lanes (waterways.json) and minor channels (waterways-minor.json, tolerated
 * absent) draw in cyan under `water=1`. Clicking any line opens a details
 * panel: id, name, class, mode, from/to, length, and — for lines whose `id` is
 * in the route registry (routes-index.json, written by worldgen.export_routes)
 * — confidence, sources and notes. Minor routes with no registry id show their
 * derived fields only.
 *
 * Mount inside the map canvas's `position: relative` wrapper, under
 * PlacesLayer: the SVG shares its u/v space. Selection round-trips through the
 * URL (`route=`); App owns the query string.
 */
import { useEffect, useMemo, useState } from "react";
import {
  HYDRO_GRID_PX, ROUTE_STYLE, loadMinorWaterways, loadRoads, loadRoutesIndex, loadWaterways,
  selectMajor, selectMinor,
  type MinorTrack, type RouteGeometry, type RouteSelection, type RoutesIndexBundle,
} from "./routesData";

const VB = 1000;

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
}

function Row({ k, v }: { k: string; v: unknown }) {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return null;
  return (
    <div style={{ marginTop: 2, wordBreak: "break-word" }}>
      <span style={{ opacity: 0.65 }}>{k}: </span>{Array.isArray(v) ? v.join(", ") : String(v)}
    </div>
  );
}

export function RoutesLayer({ baseUrl, showWater, showTracks, selectedKey, onSelectedKey, placeName }: RoutesLayerProps) {
  const [index, setIndex] = useState<RoutesIndexBundle | null>(null);
  const [roads, setRoads] = useState<RouteGeometry[]>([]);
  const [lanes, setLanes] = useState<RouteGeometry[]>([]);
  const [tracks, setTracks] = useState<MinorTrack[]>([]);
  const [channels, setChannels] = useState<MinorTrack[] | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    const set = <T,>(f: (v: T) => void) => (v: T) => { if (alive) f(v); };
    loadRoutesIndex(baseUrl).then(set(setIndex)).catch(() => {});
    loadRoads(baseUrl).then(set(setRoads)).catch(() => {});
    return () => { alive = false; };
  }, [baseUrl]);

  useEffect(() => {
    if (!showWater || channels !== null) return;
    let alive = true;
    Promise.all([loadWaterways(baseUrl), loadMinorWaterways(baseUrl)])
      .then(([l, c]) => { if (alive) { setLanes(l); setChannels(c); } })
      .catch(() => { if (alive) setChannels([]); });
    return () => { alive = false; };
  }, [showWater, channels, baseUrl]);

  useEffect(() => {
    if (!showTracks || tracks.length) return;
    let alive = true;
    import("../places/placesData").then(({ loadMinorTracks }) => loadMinorTracks(baseUrl))
      .then((b) => { if (alive && b) setTracks(b.tracks); })
      .catch(() => {});
    return () => { alive = false; };
  }, [showTracks, tracks.length, baseUrl]);

  const lines = useMemo(() => {
    const out: RouteSelection[] = roads.map((g) => selectMajor(g, "road", index));
    if (showTracks) out.push(...tracks.map((t) => selectMinor(t, "track", index, placeName)));
    if (showWater) {
      out.push(...lanes.map((g) => selectMajor(g, "boat", index)));
      out.push(...(channels ?? []).map((t) => selectMinor(t, "channel", index, placeName)));
    }
    return out;
  }, [roads, lanes, tracks, channels, index, showWater, showTracks, placeName]);

  const selected = useMemo(() => lines.find((l) => l.key === selectedKey) ?? null, [lines, selectedKey]);

  return (
    <>
      <svg viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: "none" }}>
        {lines.map((l) => {
          const st = ROUTE_STYLE[l.mode];
          const pts = l.px.map(([c, r]) => `${(c / HYDRO_GRID_PX) * VB},${(r / HYDRO_GRID_PX) * VB}`).join(" ");
          const on = l.key === selectedKey;
          return (
            <g key={l.key} style={{ cursor: "pointer" }}
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
      </svg>

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
