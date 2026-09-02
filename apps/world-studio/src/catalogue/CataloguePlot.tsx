/**
 * The plotted province map (Phase 11 Part 0 item 5, decision 0041) — the
 * owner's Part 4 review medium.
 *
 * Every catalogue place is a DOT on the existing 2D province map, filterable
 * by importance tier, taxonomy class, region and workflow status; hovering or
 * clicking one opens a detail panel with the whole record, its `why` and (once
 * sited) its `whySiteWon`. Deliberately NOT the 3D city markers: this is a
 * review artefact, cheap to draw and cheap to read at province scale.
 *
 * An optional underlay plots the terrain-scour candidate sites (Part 0 item 2)
 * as small landform-coloured marks, so a review can see *demand* (the
 * catalogue) against *supply* (interesting ground).
 *
 * Mount it inside the map canvas's `position: relative` wrapper — the SVG
 * fills the parent and shares the canvas's u/v space exactly.
 */
import { useEffect, useMemo, useState } from "react";
import {
  loadCatalogue,
  loadCandidateSites,
  landformColour,
  placeLabel,
  TIER_COLOURS,
  WORKFLOW_ORDER,
  type CandidateSiteSet,
  type CataloguePlace,
} from "./catalogueData";
import { FIXTURE_CATALOGUE } from "./fixturePlaces";

const VB = 1000; // viewBox units; the map canvas is square, so u,v -> u*VB,v*VB

const PANEL: React.CSSProperties = {
  background: "rgba(10,14,20,0.88)",
  color: "#e6ecf5",
  border: "1px solid #2b3644",
  borderRadius: 8,
  padding: "8px 10px",
  font: "12px system-ui",
};

function Chip({ on, colour, label, onClick }: {
  on: boolean; colour?: string; label: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 7px", borderRadius: 11, cursor: "pointer",
      border: `1px solid ${on ? "#5b7fb5" : "#2b3644"}`,
      background: on ? "#1d2c40" : "#141a22",
      color: on ? "#e6ecf5" : "#7d8894", font: "12px system-ui",
    }}>
      {colour && <span style={{ width: 9, height: 9, borderRadius: 9, background: colour }} />}
      {label}
    </button>
  );
}

function toggle(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

/** Human-readable dump of the record minus the fields the panel renders itself. */
function detailRows(p: CataloguePlace): [string, string][] {
  const skip = new Set(["id", "name", "why", "whySiteWon", "position"]);
  return Object.entries(p)
    .filter(([k, v]) => !skip.has(k) && v !== null && v !== undefined)
    .map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)]);
}

export function CataloguePlot() {
  const catalogue = useMemo(() => loadCatalogue(FIXTURE_CATALOGUE), []);
  const [showPlaces, setShowPlaces] = useState(true);
  const [showSites, setShowSites] = useState(false);
  const [sites, setSites] = useState<CandidateSiteSet | null>(null);
  const [sitesError, setSitesError] = useState(false);
  const [selected, setSelected] = useState<CataloguePlace | null>(null);
  const [hovered, setHovered] = useState<CataloguePlace | null>(null);

  const classes = useMemo(
    () => [...new Set(catalogue.places.map((p) => p.classification?.class ?? "?"))].sort(),
    [catalogue],
  );
  const regions = useMemo(() => catalogue.regions.map((r) => r.region), [catalogue]);
  const tiers = useMemo(
    () => [...new Set(catalogue.places.map((p) => p.importanceTier))].sort((a, b) => a - b),
    [catalogue],
  );

  // Empty filter set = "no filter", so a fresh view shows everything.
  const [tierFilter, setTierFilter] = useState<Set<string>>(new Set());
  const [classFilter, setClassFilter] = useState<Set<string>>(new Set());
  const [regionFilter, setRegionFilter] = useState<Set<string>>(new Set());
  const [workflowFilter, setWorkflowFilter] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!showSites || sites || sitesError) return;
    let alive = true;
    loadCandidateSites()
      .then((s) => { if (alive) setSites(s); })
      .catch(() => { if (alive) setSitesError(true); });
    return () => { alive = false; };
  }, [showSites, sites, sitesError]);

  const regionOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of catalogue.regions) for (const p of r.places) m.set(p.id, r.region);
    return m;
  }, [catalogue]);

  const visible = useMemo(() => catalogue.places.filter((p) => {
    if (tierFilter.size && !tierFilter.has(String(p.importanceTier))) return false;
    if (classFilter.size && !classFilter.has(p.classification?.class ?? "?")) return false;
    if (regionFilter.size && !regionFilter.has(regionOf.get(p.id) ?? "")) return false;
    if (workflowFilter.size && !workflowFilter.has(p.workflow)) return false;
    return true;
  }), [catalogue, tierFilter, classFilter, regionFilter, workflowFilter, regionOf]);

  const plotted = visible.filter((p) => p.position);
  const unsited = visible.length - plotted.length;

  const landformIndex = useMemo(() => {
    const m = new Map<string, number>();
    (sites?.landformClasses ?? []).forEach((c, i) => m.set(c, i));
    return m;
  }, [sites]);

  const shown = hovered ?? selected;

  return (
    <>
      {/* ---- the dots, in the canvas's own u/v space --------------------- */}
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1 }}
      >
        {showSites && sites?.sites.map((s) => (
          <rect
            key={s.id}
            x={s.uv[0] * VB - 1.6} y={s.uv[1] * VB - 1.6} width={3.2} height={3.2}
            fill={landformColour(landformIndex.get(s.landform) ?? 0, sites.landformClasses.length)}
            opacity={0.72}
          >
            <title>{`${s.landform} · ${s.id}\n${s.regionName} · ${s.elevationM.toFixed(0)} m · slope ${s.slopeDeg.toFixed(1)}° · score ${s.detectorScore.toFixed(0)}`}</title>
          </rect>
        ))}
        {showPlaces && plotted.map((p) => {
          const cx = p.position!.u * VB;
          const cy = p.position!.v * VB;
          const r = 9 - Math.min(4, p.importanceTier) * 1.3;
          const cut = p.status === "cut";
          return (
            <g key={p.id} style={{ cursor: "pointer" }}
              onPointerEnter={() => setHovered(p)}
              onPointerLeave={() => setHovered(null)}
              onClick={() => setSelected(p)}>
              <circle cx={cx} cy={cy} r={r}
                fill={cut ? "none" : TIER_COLOURS[Math.min(4, p.importanceTier)]}
                stroke={selected?.id === p.id ? "#ffffff" : "rgba(0,0,0,0.65)"}
                strokeWidth={selected?.id === p.id ? 2.5 : 1.2}
                strokeDasharray={cut ? "3 3" : undefined}
                opacity={p.workflow === "derived" ? 0.55 : 0.95} />
              <title>{`${placeLabel(p)} — tier ${p.importanceTier} · ${p.classification?.class}/${p.classification?.type} · ${p.workflow}`}</title>
            </g>
          );
        })}
      </svg>

      {/* ---- filters ----------------------------------------------------- */}
      <div style={{
        ...PANEL, position: "absolute", top: 8, left: 8, zIndex: 3,
        maxWidth: 300, display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>Catalogue</strong>
          <label style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={showPlaces}
              onChange={(e) => setShowPlaces(e.target.checked)} /> places
          </label>
          <label style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={showSites}
              onChange={(e) => setShowSites(e.target.checked)} /> candidate sites
          </label>
        </div>
        <div style={{ opacity: 0.8 }}>
          {plotted.length} plotted / {visible.length} shown of {catalogue.places.length}
          {unsited > 0 && ` · ${unsited} not yet sited`}
          {showSites && sites && ` · ${sites.sites.length} candidate sites`}
          {showSites && sitesError && " · candidate-sites.json missing"}
        </div>
        {catalogue.isFixture && (
          <div style={{ color: "#ffc46b" }}>
            FIXTURE DATA — no world/sources/catalogue/places-*.json committed yet.
          </div>
        )}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <span style={{ opacity: 0.7 }}>tier</span>
          {tiers.map((t) => (
            <Chip key={t} label={`T${t}`} colour={TIER_COLOURS[Math.min(4, t)]}
              on={tierFilter.size === 0 || tierFilter.has(String(t))}
              onClick={() => setTierFilter(toggle(tierFilter, String(t)))} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <span style={{ opacity: 0.7 }}>class</span>
          {classes.map((c) => (
            <Chip key={c} label={c} on={classFilter.size === 0 || classFilter.has(c)}
              onClick={() => setClassFilter(toggle(classFilter, c))} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <span style={{ opacity: 0.7 }}>region</span>
          {regions.map((r) => (
            <Chip key={r} label={r} on={regionFilter.size === 0 || regionFilter.has(r)}
              onClick={() => setRegionFilter(toggle(regionFilter, r))} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <span style={{ opacity: 0.7 }}>status</span>
          {WORKFLOW_ORDER.map((w) => (
            <Chip key={w} label={w} on={workflowFilter.size === 0 || workflowFilter.has(w)}
              onClick={() => setWorkflowFilter(toggle(workflowFilter, w))} />
          ))}
        </div>
        {showSites && sites && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", opacity: 0.9 }}>
            {sites.landformClasses.map((c, i) => (
              <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <span style={{
                  width: 8, height: 8,
                  background: landformColour(i, sites.landformClasses.length),
                }} />{c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ---- detail panel ------------------------------------------------ */}
      {shown && (
        <div style={{
          ...PANEL, position: "absolute", top: 8, right: 8, zIndex: 3,
          width: 320, maxHeight: "88%", overflowY: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ font: "600 14px system-ui" }}>{placeLabel(shown)}</strong>
            {selected && !hovered && (
              <button onClick={() => setSelected(null)}
                style={{ cursor: "pointer", background: "none", border: "none", color: "#8b96a3" }}>✕</button>
            )}
          </div>
          <div style={{ opacity: 0.7, wordBreak: "break-all" }}>{shown.id}</div>
          {shown.why && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: "#ffc46b" }}>why</div>
              {Object.entries(shown.why).map(([k, v]) => (
                <div key={k} style={{ marginTop: 2 }}>
                  <span style={{ opacity: 0.65 }}>{k}: </span>{String(v)}
                </div>
              ))}
            </div>
          )}
          {shown.whySiteWon && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: "#8fd6a0" }}>why this site won</div>
              <div>{shown.whySiteWon}</div>
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <div style={{ color: "#9ec5ff" }}>record</div>
            {detailRows(shown).map(([k, v]) => (
              <div key={k} style={{ marginTop: 2, wordBreak: "break-word" }}>
                <span style={{ opacity: 0.65 }}>{k}: </span>{v}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
