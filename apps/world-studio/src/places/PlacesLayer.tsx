/**
 * "Places (Phase 11 plot)" — the plotted province map (decision 0041 Part 0
 * item 5; the owner's Part 4 review medium).
 *
 * One dot per sited catalogue place, drawn over the 2D map canvas: colour by
 * region zone (the society.CULTURES palette, shipped inside places.json),
 * size by importance tier (0 largest), a dashed pale outline for
 * ruined / abandoned / drowned, and a cyan ring for an underwater way in.
 * Filters by region, tier, class, danger, density layer, hostility stance,
 * interior kind/family, purpose and impact, plus "dungeon-like" and
 * "underwater entrance" shortcuts and free text; hover for a label, click for
 * the record, its *why* and its schema-v2 blocks (purpose, hook, stance and
 * flips, interior, contents, travel station, quest provisions); "fly here"
 * hands the place's u/v to App's existing spawn mechanism. Under the dots sits
 * the terrain-scour candidate-sites underlay; route/track lines (including the
 * minor tracks this panel's `tracks` checkbox toggles) are drawn by
 * ../routes/RoutesLayer.
 *
 * Filters, the selected place and the two sub-layers round-trip through the
 * URL via `onUrlState` (App owns the query string). Mount inside the map
 * canvas's `position: relative` wrapper — the SVG shares its u/v space.
 */
import { useEffect, useMemo, useState } from "react";
import {
  DEAD_STATUSES, dotRadius, isUnderwaterEntry, landformColour,
  loadCandidateSites, loadPlaces, matchesFilter, toggleIn, zoneColour,
  type CandidateSiteSet, type PlacesFilter, type PlacesUrlState,
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

/** The multi-select axes of PlacesFilter (the booleans and `search` are not). */
type SetAxis = {
  [K in keyof PlacesFilter]: PlacesFilter[K] extends Set<string> ? K : never;
}[keyof PlacesFilter];

function Section({ title, colour, children }: { title: string; colour: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ color: colour, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}

function Lines({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 3 }}>
      <span style={{ opacity: 0.65 }}>{label}</span>
      {items.map((t, i) => (
        <div key={i} style={{ paddingLeft: 8, wordBreak: "break-word" }}>· {t}</div>
      ))}
    </div>
  );
}

/** The schema-v2 blocks: purpose, hook, stance + flips, interior, contents,
 * travel station and the quest linkage the quest layer will hold us to. */
function PlaceV2({ p }: { p: PlottedPlace }) {
  const purpose = p.purposeDetail;
  const stance = p.stanceDetail;
  const it = p.interiorDetail;
  const c = p.contents;
  const ts = p.travelStation;
  return (
    <>
      {(purpose || p.hook) && (
        <Section title="player purpose" colour="#ffc46b">
          {purpose && <Field k="primary" v={`${purpose.primary ?? "?"} · impact ${purpose.impact ?? "?"}`} />}
          {purpose && <Field k="secondary" v={purpose.secondary} />}
          {p.hook && <div style={{ marginTop: 3, fontStyle: "italic" }}>{p.hook}</div>}
        </Section>
      )}
      {stance && (
        <Section title="stance" colour="#ff9d8a">
          <Field k="baseline" v={stance.baseline} />
          <Field k="owner" v={stance.owner} />
          <Field k="clearable" v={stance.clearable === null ? null : stance.clearable ? "yes" : "no"} />
          <Field k="respawn" v={stance.respawn} />
          <Lines label="flips" items={stance.flips} />
        </Section>
      )}
      {(it || p.entrance || (p.underwaterAccess && p.underwaterAccess !== "none")) && (
        <Section title="interior" colour="#9fe0c8">
          {it && <Field k="kind" v={`${it.kind ?? "?"} · ${it.family ?? "?"} · ${it.sizeBand ?? "?"}`} />}
          {it && typeof it.wetFraction === "number" && <Field k="wet" v={`${Math.round(it.wetFraction * 100)}%`} />}
          {it && <Field k="entrances" v={it.entranceCount} />}
          {it && <Field k="exterior shell" v={it.exteriorShell} />}
          {it && <Field k="vertical" v={it.verticalRelationship} />}
          <Field k="entrance type" v={p.entrance} />
          <Field k="underwater access" v={p.underwaterAccess} />
        </Section>
      )}
      {c && (
        <Section title="contents" colour="#d7a8ff">
          <Lines label="creatures" items={c.creatures} />
          <Lines label="NPCs" items={c.npcs} />
          <Lines label="loot" items={c.loot} />
        </Section>
      )}
      {ts && (
        <Section title="travel station" colour="#5fd6e8">
          <Field k="modes" v={ts.modes} />
          <Lines label="destinations" items={ts.destinations.map((d) => d.name)} />
        </Section>
      )}
      {(p.questProvisions.length > 0 || p.tierOwnership) && (
        <Section title="quest linkage" colour="#ffd166">
          <Field k="tier ownership" v={p.tierOwnership} />
          <Lines label="provisions (docs/quests/20)" items={p.questProvisions} />
        </Section>
      )}
    </>
  );
}

export interface PlacesLayerProps {
  baseUrl: string;
  initial: PlacesUrlState;
  onUrlState: (s: PlacesUrlState) => void;
  /** Fly the 3D camera to a province-fraction position (App converts to km). */
  onFly: (u: number, v: number) => void;
  /** Extra checkboxes for sibling layers (App injects the waterways toggle). */
  controls?: React.ReactNode;
}

export function PlacesLayer({ baseUrl, initial, onUrlState, onFly, controls }: PlacesLayerProps) {
  const [bundle, setBundle] = useState<PlottedPlacesBundle | null>(null);
  // Owner 2026-09-03: the panels hid the map. Both fold to a one-line header
  // and sit at the bottom corners, leaving the centre clear.
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      stances: uniq((p) => p.stance),
      interiorKinds: uniq((p) => p.interiorDetail?.kind).filter((k) => k !== "?"),
      interiorFamilies: uniq((p) => p.interiorDetail?.family).filter((k) => k !== "?"),
      purposes: uniq((p) => p.purposeDetail?.primary).filter((k) => k !== "?"),
      impacts: uniq((p) => p.purposeDetail?.impact).filter((k) => k !== "?"),
    };
  }, [places]);

  const visible = useMemo(() => places.filter((p) => matchesFilter(p, filter)), [places, filter]);
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const landformIndex = useMemo(() => new Map((sites?.landformClasses ?? []).map((c, i) => [c, i])), [sites]);

  const setAxis = (key: SetAxis, k: string) =>
    setFilter({ ...filter, [key]: toggleIn(filter[key], k) });

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
        {visible.map((p) => {
          const dead = DEAD_STATUSES.has(p.status);
          const isSel = p.id === selectedId;
          const wet = isUnderwaterEntry(p);
          const r = dotRadius(p.importanceTier);
          return (
            <g key={p.id}>
            {wet && (
              <circle cx={p.position.u * VB} cy={p.position.v * VB} r={r + 3.2} fill="none"
                stroke="#5fd6e8" strokeWidth={1.4} strokeDasharray="2 1.6" pointerEvents="none" />
            )}
            <circle cx={p.position.u * VB} cy={p.position.v * VB} r={r}
              fill={zoneColour(bundle, p.region)} fillOpacity={dead ? 0.55 : 0.95}
              stroke={isSel ? "#ffffff" : dead ? "#f3f0e6" : "rgba(0,0,0,0.7)"}
              strokeWidth={isSel ? 3 : dead ? 1.6 : 1}
              strokeDasharray={dead ? "2.5 2" : undefined}
              style={{ cursor: "pointer" }}
              onPointerEnter={() => setHovered(p)} onPointerLeave={() => setHovered(null)}
              onClick={(e) => { e.stopPropagation(); setSelectedId(p.id); }} />
            </g>
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
      <div style={{ ...PANEL, position: "absolute", bottom: 8, left: 8, zIndex: 3, maxWidth: 330, maxHeight: "60%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setFilterOpen(!filterOpen)} title={filterOpen ? "collapse" : "expand"}
            style={{ cursor: "pointer", background: "none", border: "none", color: "#e6ecf5", font: "600 12px system-ui", padding: 0 }}>
            {filterOpen ? "▾" : "▸"} Places (Phase 11 plot)
          </button>
          {!filterOpen && bundle && <span style={{ opacity: 0.7 }}>{visible.length}/{places.length}</span>}
          {filterOpen && <>
          <label style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={showTracks} onChange={(e) => setShowTracks(e.target.checked)} /> minor tracks
          </label>
          <label style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={showSites} onChange={(e) => setShowSites(e.target.checked)} /> candidate sites
          </label>
          {controls}
          </>}
        </div>
        {filterOpen && <>
        <div style={{ opacity: 0.8 }}>
          {loadError ? `places.json failed: ${loadError} (run python3 -m worldgen.export_places)` : bundle
            ? `${visible.length} shown of ${places.length} plotted · ${bundle.unsitedCount} unsited (not exported)`
            : "loading places.json…"}
        </div>
        <input value={filter.search} placeholder="search name or id" onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          style={{ background: "#141a22", color: "#e6ecf5", border: "1px solid #2b3644", borderRadius: 5, padding: "3px 6px", font: "12px system-ui" }} />
        <ChipRow label="region" keys={axes.regions} active={filter.regions} colourOf={(k) => zoneColour(bundle, k)} onToggle={(k) => setAxis("regions", k)} />
        <ChipRow label="tier" keys={axes.tiers} active={filter.tiers} onToggle={(k) => setAxis("tiers", k)} />
        <ChipRow label="class" keys={axes.classes} active={filter.classes} onToggle={(k) => setAxis("classes", k)} />
        <ChipRow label="danger" keys={axes.dangers} active={filter.dangers} onToggle={(k) => setAxis("dangers", k)} />
        <ChipRow label="density" keys={axes.densities} active={filter.densities} onToggle={(k) => setAxis("densities", k)} />
        <ChipRow label="stance" keys={axes.stances} active={filter.stances} onToggle={(k) => setAxis("stances", k)} />
        <ChipRow label="purpose" keys={axes.purposes} active={filter.purposes} onToggle={(k) => setAxis("purposes", k)} />
        <ChipRow label="impact" keys={axes.impacts} active={filter.impacts} onToggle={(k) => setAxis("impacts", k)} />
        <ChipRow label="interior" keys={axes.interiorKinds} active={filter.interiorKinds} onToggle={(k) => setAxis("interiorKinds", k)} />
        <ChipRow label="family" keys={axes.interiorFamilies} active={filter.interiorFamilies} onToggle={(k) => setAxis("interiorFamilies", k)} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ opacity: 0.7, minWidth: 44 }}>only</span>
          <Chip label="dungeon-like" on={filter.dungeonLike} onClick={() => setFilter({ ...filter, dungeonLike: !filter.dungeonLike })} />
          <Chip label="underwater entrance" colour="#5fd6e8" on={filter.underwater} onClick={() => setFilter({ ...filter, underwater: !filter.underwater })} />
        </div>
        {showSites && sites && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", opacity: 0.9 }}>
            {sites.landformClasses.map((c, i) => (
              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, background: landformColour(i, sites.landformClasses.length) }} />{c}
              </span>
            ))}
          </div>
        )}
        <div style={{ opacity: 0.6 }}>dot size = importance (T0 largest) · colour = region zone · dashed = ruined/abandoned/drowned · cyan ring = underwater way in</div>
        </>}
      </div>

      {/* ---- detail panel ------------------------------------------------ */}
      {selected && (
        <div style={{ ...PANEL, position: "absolute", bottom: 8, right: 8, zIndex: 3, width: 340, maxHeight: detailOpen ? "70%" : undefined, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <button onClick={() => setDetailOpen(!detailOpen)} title={detailOpen ? "collapse" : "expand"}
              style={{ cursor: "pointer", background: "none", border: "none", color: "#e6ecf5", font: "600 14px system-ui", padding: 0, textAlign: "left" }}>
              {detailOpen ? "▾" : "▸"} {selected.name}
            </button>
            <button onClick={() => setSelectedId(null)} style={{ cursor: "pointer", background: "none", border: "none", color: "#8b96a3" }}>✕</button>
          </div>
          {detailOpen && <>
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
          <PlaceV2 p={selected} />
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
          </>}
        </div>
      )}
    </>
  );
}
