/**
 * "Places (Phase 11 plot)" — the plotted province map (decision 0041 Part 0
 * item 5; the owner's Part 4 review medium).
 *
 * One dot per sited catalogue place, drawn over the 2D map canvas: colour by
 * region zone (the society.CULTURES palette, shipped inside places.json),
 * size by importance tier (0 largest), a dashed pale outline for
 * ruined / abandoned / drowned. Filters by region, tier, class, danger,
 * density layer and text; hover for a label, click for the record and its
 * *why*; "fly here" hands the place's u/v to App's existing spawn mechanism.
 * Under the dots, an optional thin "Minor tracks" layer (routes-minor.json,
 * tolerated absent) and the terrain-scour candidate-sites underlay.
 *
 * Filters, the selected place and the two sub-layers round-trip through the
 * URL via `onUrlState` (App owns the query string). Mount inside the map
 * canvas's `position: relative` wrapper — the SVG shares its u/v space.
 */
import { useEffect, useMemo, useState } from "react";
import {
  DEAD_STATUSES, HYDRO_GRID_PX, TRACK_DASH, dotRadius, landformColour,
  loadCandidateSites, loadMinorTracks, loadPlaces, matchesFilter, toggleIn, zoneColour,
  type CandidateSiteSet, type MinorTracksBundle, type PlacesFilter, type PlacesUrlState,
  type PlottedPlace, type PlottedPlacesBundle,
} from "./placesData";

const VB = 1000;

const PANEL: React.CSSProperties = {
  background: "rgba(10,14,20,0.9)", color: "#e6ecf5", border: "1px solid #2b3644",
  borderRadius: 8, padding: "8px 10px", font: "12px system-ui",
};

function Chip({ on, colour, label, onClick }: { on: boolean; colour?: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "1px 7px", borderRadius: 11,
      cursor: "pointer", border: `1px solid ${on ? "#5b7fb5" : "#2b3644"}`,
      background: on ? "#1d2c40" : "#141a22", color: on ? "#e6ecf5" : "#7d8894", font: "12px system-ui",
    }}>
      {colour && <span style={{ width: 9, height: 9, borderRadius: 9, background: colour }} />}
      {label}
    </button>
  );
}

function ChipRow({ label, keys, active, colourOf, onToggle }: {
  label: string; keys: string[]; active: Set<string>; colourOf?: (k: string) => string; onToggle: (k: string) => void;
}) {
  if (keys.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ opacity: 0.7, minWidth: 44 }}>{label}</span>
      {keys.map((k) => (
        <Chip key={k} label={k} colour={colourOf?.(k)} on={active.size === 0 || active.has(k)} onClick={() => onToggle(k)} />
      ))}
    </div>
  );
}

const WHY_LABELS: [keyof PlottedPlace["why"], string][] = [
  ["founding", "founding"], ["siteAdvantages", "site advantages"], ["occupantsMotive", "occupants' motive"],
  ["pressures", "pressures"], ["wouldChangeIf", "would change if"],
];

function Field({ k, v }: { k: string; v: unknown }) {
  if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) return null;
  const text = Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  return <div style={{ marginTop: 2, wordBreak: "break-word" }}><span style={{ opacity: 0.65 }}>{k}: </span>{text}</div>;
}

export interface PlacesLayerProps {
  baseUrl: string;
  initial: PlacesUrlState;
  onUrlState: (s: PlacesUrlState) => void;
  /** Fly the 3D camera to a province-fraction position (App converts to km). */
  onFly: (u: number, v: number) => void;
}

export function PlacesLayer({ baseUrl, initial, onUrlState, onFly }: PlacesLayerProps) {
  const [bundle, setBundle] = useState<PlottedPlacesBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<MinorTracksBundle | null | "missing">(null);
  const [sites, setSites] = useState<CandidateSiteSet | null>(null);
  const [filter, setFilter] = useState<PlacesFilter>(initial.filter);
  const [selectedId, setSelectedId] = useState<string | null>(initial.selectedId);
  const [showTracks, setShowTracks] = useState(initial.showTracks);
  const [showSites, setShowSites] = useState(initial.showSites);
  const [hovered, setHovered] = useState<PlottedPlace | null>(null);

  useEffect(() => {
    let alive = true;
    loadPlaces(baseUrl).then((b) => { if (alive) setBundle(b); })
      .catch((e: Error) => { if (alive) setLoadError(e.message); });
    return () => { alive = false; };
  }, [baseUrl]);

  useEffect(() => {
    if (!showTracks || tracks !== null) return;
    let alive = true;
    loadMinorTracks(baseUrl).then((t) => { if (alive) setTracks(t ?? "missing"); })
      .catch(() => { if (alive) setTracks("missing"); });
    return () => { alive = false; };
  }, [showTracks, tracks, baseUrl]);

  useEffect(() => {
    if (!showSites || sites) return;
    let alive = true;
    loadCandidateSites().then((s) => { if (alive) setSites(s); }).catch(() => {});
    return () => { alive = false; };
  }, [showSites, sites]);

  useEffect(() => {
    onUrlState({ filter, selectedId, showTracks, showSites });
  }, [filter, selectedId, showTracks, showSites, onUrlState]);

  const places = bundle?.places ?? [];
  const axes = useMemo(() => {
    const uniq = (f: (p: PlottedPlace) => string | null | undefined) =>
      [...new Set(places.map((p) => f(p) ?? "?"))].sort();
    return {
      regions: uniq((p) => p.region), tiers: uniq((p) => String(p.importanceTier)),
      classes: uniq((p) => p.class), dangers: uniq((p) => p.dangerTier), densities: uniq((p) => p.densityLayer),
    };
  }, [places]);

  const visible = useMemo(() => places.filter((p) => matchesFilter(p, filter)), [places, filter]);
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const landformIndex = useMemo(() => new Map((sites?.landformClasses ?? []).map((c, i) => [c, i])), [sites]);

  const setAxis = (key: keyof Omit<PlacesFilter, "search">, k: string) =>
    setFilter({ ...filter, [key]: toggleIn(filter[key], k) });

  const trackList = tracks && tracks !== "missing" ? tracks.tracks : [];

  return (
    <>
      <svg viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1 }}>
        {showSites && sites?.sites.map((s) => (
          <rect key={s.id} x={s.uv[0] * VB - 1.6} y={s.uv[1] * VB - 1.6} width={3.2} height={3.2} opacity={0.7}
            fill={landformColour(landformIndex.get(s.landform) ?? 0, sites.landformClasses.length)}>
            <title>{`${s.landform} · ${s.id}\n${s.regionName} · ${s.elevationM.toFixed(0)} m · slope ${s.slopeDeg.toFixed(1)}°`}</title>
          </rect>
        ))}
        {showTracks && trackList.map((t) => (
          <polyline key={t.id} fill="none" stroke="#e8d9b0" strokeWidth={1.1} opacity={0.8}
            strokeDasharray={TRACK_DASH[t.kind]} vectorEffect="non-scaling-stroke"
            points={t.px.map(([c, r]) => `${(c / HYDRO_GRID_PX) * VB},${(r / HYDRO_GRID_PX) * VB}`).join(" ")}>
            <title>{`${t.kind} ${t.id}: ${t.from} → ${t.to} (${t.lengthKm} km)`}</title>
          </polyline>
        ))}
        {visible.map((p) => {
          const dead = DEAD_STATUSES.has(p.status);
          const isSel = p.id === selectedId;
          return (
            <circle key={p.id} cx={p.position.u * VB} cy={p.position.v * VB} r={dotRadius(p.importanceTier)}
              fill={zoneColour(bundle, p.region)} fillOpacity={dead ? 0.55 : 0.95}
              stroke={isSel ? "#ffffff" : dead ? "#f3f0e6" : "rgba(0,0,0,0.7)"}
              strokeWidth={isSel ? 3 : dead ? 1.6 : 1}
              strokeDasharray={dead ? "2.5 2" : undefined}
              style={{ cursor: "pointer" }}
              onPointerEnter={() => setHovered(p)} onPointerLeave={() => setHovered(null)}
              onClick={(e) => { e.stopPropagation(); setSelectedId(p.id); }} />
          );
        })}
      </svg>

      {hovered && (
        <div style={{
          ...PANEL, position: "absolute", pointerEvents: "none", zIndex: 4, padding: "3px 7px", whiteSpace: "nowrap",
          left: `${hovered.position.u * 100}%`, top: `${hovered.position.v * 100}%`, transform: "translate(12px, -50%)",
        }}>
          <strong>{hovered.name}</strong> · {hovered.type ?? hovered.class} · T{hovered.importanceTier}
        </div>
      )}

      {/* ---- filter panel ------------------------------------------------ */}
      <div style={{ ...PANEL, position: "absolute", top: 8, left: 8, zIndex: 3, maxWidth: 330, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>Places (Phase 11 plot)</strong>
          <label style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={showTracks} onChange={(e) => setShowTracks(e.target.checked)} /> minor tracks
          </label>
          <label style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={showSites} onChange={(e) => setShowSites(e.target.checked)} /> candidate sites
          </label>
        </div>
        <div style={{ opacity: 0.8 }}>
          {loadError ? `places.json failed: ${loadError} (run python3 -m worldgen.export_places)` : bundle
            ? `${visible.length} shown of ${places.length} plotted · ${bundle.unsitedCount} unsited (not exported)`
            : "loading places.json…"}
          {showTracks && tracks === "missing" && " · routes-minor.json not present"}
          {showTracks && trackList.length > 0 && ` · ${trackList.length} tracks`}
        </div>
        <input value={filter.search} placeholder="search name or id" onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          style={{ background: "#141a22", color: "#e6ecf5", border: "1px solid #2b3644", borderRadius: 5, padding: "3px 6px", font: "12px system-ui" }} />
        <ChipRow label="region" keys={axes.regions} active={filter.regions} colourOf={(k) => zoneColour(bundle, k)} onToggle={(k) => setAxis("regions", k)} />
        <ChipRow label="tier" keys={axes.tiers} active={filter.tiers} onToggle={(k) => setAxis("tiers", k)} />
        <ChipRow label="class" keys={axes.classes} active={filter.classes} onToggle={(k) => setAxis("classes", k)} />
        <ChipRow label="danger" keys={axes.dangers} active={filter.dangers} onToggle={(k) => setAxis("dangers", k)} />
        <ChipRow label="density" keys={axes.densities} active={filter.densities} onToggle={(k) => setAxis("densities", k)} />
        {showSites && sites && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", opacity: 0.9 }}>
            {sites.landformClasses.map((c, i) => (
              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, background: landformColour(i, sites.landformClasses.length) }} />{c}
              </span>
            ))}
          </div>
        )}
        <div style={{ opacity: 0.6 }}>dot size = importance (T0 largest) · colour = region zone · dashed = ruined/abandoned/drowned</div>
      </div>

      {/* ---- detail panel ------------------------------------------------ */}
      {selected && (
        <div style={{ ...PANEL, position: "absolute", top: 8, right: 8, zIndex: 3, width: 340, maxHeight: "90%", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <strong style={{ font: "600 14px system-ui" }}>{selected.name}</strong>
            <button onClick={() => setSelectedId(null)} style={{ cursor: "pointer", background: "none", border: "none", color: "#8b96a3" }}>✕</button>
          </div>
          <div style={{ opacity: 0.7, wordBreak: "break-all" }}>{selected.id}</div>
          <div style={{ marginTop: 4 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 10, background: zoneColour(bundle, selected.region), marginRight: 5 }} />
            {selected.region} · {selected.class}/{selected.family}/{selected.type}
            {selected.magnitude && ` · ${selected.magnitude}`} · T{selected.importanceTier} · {selected.dangerTier} · {selected.status}
          </div>
          <button onClick={() => onFly(selected.position.u, selected.position.v)} style={{
            marginTop: 6, padding: "4px 12px", borderRadius: 5, cursor: "pointer", border: "1px solid #4a5568",
            background: "#2b5b3f", color: "#d8dee7", font: "13px system-ui",
          }}>✈ Fly here</button>
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#ffc46b", fontWeight: 600 }}>why</div>
            {WHY_LABELS.map(([k, label]) => selected.why[k] && (
              <div key={k} style={{ marginTop: 3 }}><span style={{ opacity: 0.65 }}>{label}: </span>{selected.why[k]}</div>
            ))}
          </div>
          {selected.whySiteWon && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#8fd6a0", fontWeight: 600 }}>why this site won</div>
              <div>{selected.whySiteWon}</div>
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#9ec5ff", fontWeight: 600 }}>record</div>
            <Field k="culture" v={selected.culture} />
            <Field k="densityLayer" v={selected.densityLayer} />
            <Field k="workflow" v={selected.workflow} />
            <Field k="discovery" v={selected.discovery} />
            <Field k="valueTier" v={selected.valueTier} />
            <Field k="hardConstraints" v={selected.hardConstraints} />
            <Field k="reachedVia" v={selected.reachedVia} />
            <Field k="position" v={`u ${selected.position.u.toFixed(4)}, v ${selected.position.v.toFixed(4)}`} />
            <Field k="positionM" v={selected.positionM} />
            <Field k="plotFacts" v={selected.plotFacts} />
          </div>
        </div>
      )}
    </>
  );
}
