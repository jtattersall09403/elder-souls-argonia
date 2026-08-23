import { useEffect, useRef, useState } from "react";
import type { SettlementAnchor, SuggestedConnection } from "@elder-souls/contracts";
import anchorsFile from "../../../world/sources/anchors/settlement-anchors.json";
import { Fly3D, type DetailPatch } from "./Fly3D";
import { colour } from "./terrainColor";

const urlParams = new URLSearchParams(window.location.search);

interface ProvinceMeta {
  metresPerPixel: number;
  heightMinMetres: number;
  heightMaxMetres: number;
  imageWidth: number;
  imageHeight: number;
}

const anchors = anchorsFile.anchors as SettlementAnchor[];
const connections = (anchorsFile.suggestedConnections ?? []) as SuggestedConnection[];

/**
 * Preview of Phase 3 "option 2" interior conditioning (decision 0005): land
 * above a threshold is soft-compressed toward lore's low marsh heart, weighted
 * by interiorness so border mountains and coasts keep their source shape. This
 * is a visual preview only — real conditioning happens in the world compiler.
 */
type Conditioning = "off" | "mild" | "strong";
const CONDITIONING: Record<Exclude<Conditioning, "off">, { threshold: number; keep: number }> = {
  mild: { threshold: 20, keep: 0.5 },   // 100 m hill -> ~60 m
  strong: { threshold: 12, keep: 0.25 }, // 100 m hill -> ~34 m
};

function conditionHeights(base: Float32Array, w: number, h: number, mode: Exclude<Conditioning, "off">): Float32Array {
  const { threshold, keep } = CONDITIONING[mode];
  const out = new Float32Array(base.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const height = base[i];
      // Interiorness: 0 within 10% of any map edge (border ranges untouched),
      // ramping to 1 beyond 22% in, with a smoothstep between.
      const edge = Math.min(x / w, (w - 1 - x) / w, y / h, (h - 1 - y) / h);
      const t = Math.min(1, Math.max(0, (edge - 0.1) / 0.12));
      const interior = t * t * (3 - 2 * t);
      out[i] = height > threshold
        ? threshold + (height - threshold) * (1 - interior * (1 - keep))
        : height;
    }
  }
  return out;
}


export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heightsRef = useRef<Float32Array | null>(null);
  const conditionedRef = useRef<Partial<Record<Conditioning, Float32Array>>>({});
  const [meta, setMeta] = useState<ProvinceMeta | null>(null);
  const [seaLevel, setSeaLevel] = useState(0);
  // Strong is the owner-chosen conditioning (decision 0005, revised).
  const [conditioning, setConditioning] = useState<Conditioning>("strong");
  const [readout, setReadout] = useState("");
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [view, setView] = useState<"map" | "fly3d">(urlParams.get("view") === "fly3d" ? "fly3d" : "map");
  const [camMode, setCamMode] = useState<"fly" | "orbit">(urlParams.get("cam") === "orbit" ? "orbit" : "fly");
  const [spawnKm, setSpawnKm] = useState<{ x: number; z: number }>({
    x: Number(urlParams.get("x")) || 10.4, z: Number(urlParams.get("z")) || 8.4,
  });
  const [exaggeration, setExaggeration] = useState(Number(urlParams.get("ex")) || 5);
  const [flyPos, setFlyPos] = useState("");
  const [detail, setDetail] = useState<DetailPatch | null>(null);

  // Reproducible URLs: keep view state in the query string.
  useEffect(() => {
    const q = new URLSearchParams();
    if (view === "fly3d") {
      q.set("view", "fly3d");
      q.set("cam", camMode);
      q.set("x", spawnKm.x.toFixed(2));
      q.set("z", spawnKm.z.toFixed(2));
      q.set("ex", String(exaggeration));
    }
    const qs = q.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [view, camMode, spawnKm, exaggeration]);
  const overlaysRef = useRef<Record<string, HTMLImageElement>>({});
  const decodedPxRef = useRef<Record<string, Uint8ClampedArray>>({});
  const [layers, setLayers] = useState<Record<string, boolean>>({
    rivers: true, wetlands: true, routes: true, waterways: true, rootways: false,
    danger: false, cultures: false, regions: false, mist: false, flood: false,
    soil: false, watersheds: false, salinity: false,
  });
  const climateRef = useRef<Record<string, { humidity: number; mist: number; rain: string; visibility: number }>>({});
  const [overlaysReady, setOverlaysReady] = useState(false);
  const [legends, setLegends] = useState<Record<string, Record<string, { name: string; rgb: number[] }>>>({});

  function displayHeights(): Float32Array | null {
    const base = heightsRef.current;
    if (!base || !meta) return base;
    if (conditioning === "off") return base;
    let cached = conditionedRef.current[conditioning];
    if (!cached) {
      cached = conditionHeights(base, meta.imageWidth, meta.imageHeight, conditioning);
      conditionedRef.current[conditioning] = cached;
    }
    return cached;
  }

  // Load the height raster once; keep decoded heights for repaints and hover.
  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    (async () => {
      const m: ProvinceMeta = await (await fetch(`${base}province/meta.json`)).json();
      const img = new Image();
      img.src = `${base}province/height-rg.png`;
      await img.decode();
      const off = document.createElement("canvas");
      off.width = m.imageWidth;
      off.height = m.imageHeight;
      const ctx = off.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, m.imageWidth, m.imageHeight).data;
      const heights = new Float32Array(m.imageWidth * m.imageHeight);
      const span = m.heightMaxMetres - m.heightMinMetres;
      // 16-bit height packed as high byte -> R, low byte -> G (~3 mm steps).
      for (let i = 0; i < heights.length; i++) {
        heights[i] = m.heightMinMetres + ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * span;
      }
      heightsRef.current = heights;
      setMeta(m);
      // Generated overlays; missing files just leave a layer empty.
      const overlayFiles: Record<string, string> = {
        rivers: "hydro-rivers.png", wetlands: "hydro-wetlands.png",
        regions: "hydro-regions.png", flood: "hydro-flood.png",
        soil: "hydro-soil.png", watersheds: "hydro-watersheds.png",
        salinity: "hydro-salinity.png", routes: "soc-routes.png",
        danger: "soc-danger.png", cultures: "soc-cultures.png",
        waterways: "soc-waterways.png", rootways: "soc-rootways.png",
        mist: "hydro-mist.png",
      };
      await Promise.all(
        Object.entries(overlayFiles).map(async ([name, file]) => {
          const overlay = new Image();
          overlay.src = `${base}province/${file}`;
          try {
            await overlay.decode();
            overlaysRef.current[name] = overlay;
          } catch {
            /* layer not generated yet */
          }
        }),
      );
      const decode = (name: string) => {
        const img = overlaysRef.current[name];
        if (!img) return;
        ctx.clearRect(0, 0, m.imageWidth, m.imageHeight);
        ctx.drawImage(img, 0, 0);
        decodedPxRef.current[name] = ctx.getImageData(0, 0, m.imageWidth, m.imageHeight).data;
      };
      try {
        const hydroMeta = await (await fetch(`${base}province/hydrology-meta.json`)).json();
        // Hydrology meta carries the decided world scale (×3, decision 0006);
        // the terrain meta is raw extractor scale.
        if (hydroMeta.metresPerPixel) setMeta({ ...m, metresPerPixel: hydroMeta.metresPerPixel });
        const collected: typeof legends = { regions: hydroMeta.regionsLegend ?? {} };
        climateRef.current = hydroMeta.climateProfiles ?? {};
        try {
          const socMeta = await (await fetch(`${base}province/society-meta.json`)).json();
          collected.danger = socMeta.dangerLegend ?? {};
          collected.cultures = socMeta.cultureLegend ?? {};
        } catch { /* society pass not generated yet */ }
        setLegends(collected);
        decode("regions");
        decode("danger");
        decode("cultures");
      } catch {
        /* hydrology metadata not generated yet */
      }
      setOverlaysReady(true);
      // Phase 6 basin detail patch (optional; absent until compiled).
      try {
        const bm = await (await fetch(`${base}province/basin/meta.json`)).json();
        const bimg = new Image();
        bimg.src = `${base}province/basin/height-rg.png`;
        await bimg.decode();
        const off = document.createElement("canvas");
        off.width = bm.imageWidth;
        off.height = bm.imageHeight;
        const bctx = off.getContext("2d", { willReadFrequently: true })!;
        bctx.drawImage(bimg, 0, 0);
        const bpx = bctx.getImageData(0, 0, bm.imageWidth, bm.imageHeight).data;
        const bh = new Float32Array(bm.imageWidth * bm.imageHeight);
        const bspan = bm.heightMaxMetres - bm.heightMinMetres;
        for (let i = 0; i < bh.length; i++) {
          bh[i] = bm.heightMinMetres + ((bpx[i * 4] * 256 + bpx[i * 4 + 1]) / 65535) * bspan;
        }
        setDetail({
          heights: bh, width: bm.imageWidth, height: bm.imageHeight,
          metresPerPixel: bm.metresPerPixel, originM: bm.originM as [number, number],
        });
      } catch { /* basin not compiled yet */ }
    })();
  }, []);

  // Repaint terrain + anchors whenever data, sea level or conditioning changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const heights = displayHeights();
    if (!canvas || !heights || !meta) return;
    const { imageWidth: w, imageHeight: h } = meta;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const out = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const grad = heights[Math.min(i + 1, heights.length - 1)] - heights[i];
        const shade = Math.max(0.75, Math.min(1.15, 1 + grad * 0.06));
        const [r, g, b] = colour(heights[i], seaLevel, heights[i] < seaLevel ? 1 : shade);
        out.data[i * 4] = r; out.data[i * 4 + 1] = g; out.data[i * 4 + 2] = b; out.data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);

    // Generated overlays under the anchors, in back-to-front order.
    for (const name of ["regions", "soil", "watersheds", "flood", "salinity",
                        "danger", "cultures", "wetlands", "rivers", "waterways",
                        "routes", "rootways", "mist"]) {
      const img = overlaysRef.current[name];
      if (layers[name] && img) ctx.drawImage(img, 0, 0);
    }

    // Suggested transport connections (candidate edges, not road geometry).
    const byId = new Map(anchors.map((a) => [a.id, a]));
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 6]);
    for (const c of connections) {
      const from = byId.get(c.from);
      const to = byId.get(c.to);
      if (!from || !to) continue;
      ctx.beginPath();
      ctx.moveTo(from.u * w, from.v * h);
      ctx.lineTo(to.u * w, to.v * h);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1;

    for (const a of anchors) {
      const x = a.u * w;
      const y = a.v * h;
      const major = a.rank === "major";
      ctx.strokeStyle = major ? "rgba(255,220,120,0.55)" : "rgba(180,200,255,0.5)";
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(x, y, a.toleranceUV * w, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = major ? "#ffd678" : "#b4c8ff";
      ctx.beginPath();
      ctx.arc(x, y, major ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 13px system-ui";
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillText(a.name, x + 9, y + 5);
      ctx.fillStyle = major ? "#ffe9b8" : "#d5e0ff";
      ctx.fillText(a.name, x + 8, y + 4);
    }
  }, [meta, seaLevel, conditioning, layers, overlaysReady]);

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const heights = displayHeights();
    if (!canvas || !heights || !meta) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * meta.imageWidth);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * meta.imageHeight);
    if (x < 0 || y < 0 || x >= meta.imageWidth || y >= meta.imageHeight) return;
    const hgt = heights[y * meta.imageWidth + x];
    const km = (v: number) => ((v * meta.metresPerPixel) / 1000).toFixed(2);
    // Canvas readback un-premultiplies alpha, so match the nearest colour.
    const lookup = (layer: string, whenEmpty = ""): string => {
      const px = decodedPxRef.current[layer];
      const legend = legends[layer];
      if (!px || !legend) return "";
      const i = (y * meta.imageWidth + x) * 4;
      if (px[i + 3] === 0) return whenEmpty;
      let best: string | null = null;
      let bestDist = 40;
      for (const r of Object.values(legend)) {
        const dist = Math.abs(r.rgb[0] - px[i]) + Math.abs(r.rgb[1] - px[i + 1]) + Math.abs(r.rgb[2] - px[i + 2]);
        if (dist < bestDist) { bestDist = dist; best = r.name; }
      }
      return best ? ` · ${best}` : "";
    };
    const regionPart = lookup("regions", " · ocean");
    const regionName = regionPart.replace(" · ", "");
    const climate = climateRef.current[regionName];
    const climatePart = climate
      ? ` · humidity ${Math.round(climate.humidity * 100)}% · vis ~${climate.visibility} m`
      : "";
    const info = regionPart + lookup("danger") + lookup("cultures", " · hinterland") + climatePart;
    const text = `${km(x)} km E, ${km(y)} km S · elevation ${hgt.toFixed(1)} m${info}`;
    setReadout(text);
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, text });
  }

  function enterFly(xKm: number, zKm: number) {
    setSpawnKm({ x: xKm, z: zKm });
    setView("fly3d");
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !meta) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * meta.imageWidth;
    const y = ((e.clientY - rect.top) / rect.height) * meta.imageHeight;
    enterFly((x * meta.metresPerPixel) / 1000, (y * meta.metresPerPixel) / 1000);
  }

  const extentKm = meta ? ((meta.imageWidth * meta.metresPerPixel) / 1000).toFixed(1) : "…";

  // The map canvas must STAY MOUNTED while flying — it is both the terrain
  // texture and the hover data source — so the 3D view overlays it.
  const flyOverlay = view === "fly3d" && meta && heightsRef.current && canvasRef.current && overlaysReady ? (
    <div style={{ position: "fixed", inset: 0, zIndex: 5, background: "#10141a" }}>
      <Fly3D heights={displayHeights()!} size={meta.imageWidth}
        metresPerPixel={meta.metresPerPixel} textureCanvas={canvasRef.current}
        spawnKm={spawnKm} exaggeration={exaggeration} mode={camMode} detail={detail}
        onPosition={(x, z, alt) => setFlyPos(`${x.toFixed(2)} km E · ${z.toFixed(2)} km S · alt ${Math.round(alt)} m`)} />
      <div style={{
        position: "absolute", top: 10, left: 10, display: "flex", gap: 10, alignItems: "center",
        background: "rgba(10,14,20,0.8)", padding: "8px 12px", borderRadius: 8, flexWrap: "wrap",
      }}>
        <button onClick={() => setView("map")} style={{ padding: "4px 10px", cursor: "pointer" }}>← Map</button>
        <button onClick={() => setCamMode(camMode === "fly" ? "orbit" : "fly")}
          style={{ padding: "4px 10px", cursor: "pointer" }}>
          {camMode === "fly" ? "Switch to orbit" : "Switch to fly"}
        </button>
        <label>exaggeration ×{exaggeration}{" "}
          <input type="range" min={1} max={6} step={0.5} value={exaggeration}
            onChange={(e) => setExaggeration(Number(e.target.value))} />
        </label>
        <span style={{ opacity: 0.85 }}>{flyPos}</span>
      </div>
      <div style={{
        position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
        background: "rgba(10,14,20,0.75)", padding: "6px 12px", borderRadius: 8,
        font: "13px system-ui", whiteSpace: "nowrap",
      }}>
        {camMode === "fly"
          ? "Click the view to capture the mouse (Esc releases) · WASD move · E/Q up/down · Shift = 4× speed"
          : "Drag to pan · right-drag to rotate · wheel to zoom"}
      </div>
    </div>
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 16 }}>
      {flyOverlay}
      <h1 style={{ font: "600 18px system-ui", margin: 0 }}>Argonia province preview — Phase 2 source ingest</h1>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        <label>
          Sea level {seaLevel.toFixed(2)} m{" "}
          <input type="range" min={-1} max={3} step={0.05} value={seaLevel}
            style={{ width: 260 }}
            onChange={(e) => setSeaLevel(Number(e.target.value))} />
        </label>
        <label>
          exact:{" "}
          <input type="number" min={-90} max={125} step={0.1} value={seaLevel}
            style={{ width: 70 }}
            onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setSeaLevel(v); }} />
          {" "}m
        </label>
        <button onClick={() => enterFly(spawnKm.x, spawnKm.z)}
          style={{ padding: "4px 12px", borderRadius: 5, cursor: "pointer", border: "1px solid #4a5568", background: "#2b5b3f", color: "#d8dee7", font: "13px system-ui" }}>
          ✈ Fly the province
        </button>
        <span style={{ opacity: 0.75 }}>{extentKm} km across at ×3 world scale (decision 0006)</span>
        <span style={{ minWidth: 260 }}>{readout}</span>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        <span>Layers:</span>
        {(["rivers", "wetlands", "routes", "waterways", "rootways", "danger", "cultures", "regions", "mist", "flood", "soil", "watersheds", "salinity"] as const).map((name) => (
          <label key={name} style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={layers[name]}
              onChange={(e) => setLayers({ ...layers, [name]: e.target.checked })} />{" "}
            {name}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span>Interior relief:</span>
        {([
          ["off", "As source"],
          ["mild", "Compressed — mild"],
          ["strong", "Compressed — strong (chosen)"],
        ] as [Conditioning, string][]).map(([mode, label]) => (
          <button key={mode} onClick={() => setConditioning(mode)}
            style={{
              padding: "4px 10px", borderRadius: 5, cursor: "pointer",
              border: "1px solid #4a5568",
              background: conditioning === mode ? "#3b5bdb" : "#1c2430",
              color: "#d8dee7", font: "13px system-ui",
            }}>
            {label}
          </button>
        ))}
      </div>
      {(["regions", "danger", "cultures"] as const).map((layer) =>
        layers[layer] && legends[layer] && Object.keys(legends[layer]).length > 0 ? (
          <div key={layer} style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", maxWidth: 860 }}>
            {Object.values(legends[layer]).filter((r) => r.name !== "ocean").map((r) => (
              <span key={r.name} style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "12px system-ui" }}>
                <span style={{ width: 11, height: 11, borderRadius: 2, background: `rgb(${r.rgb.join(",")})` }} />
                {r.name}
              </span>
            ))}
          </div>
        ) : null,
      )}
      <div style={{ position: "relative" }}>
        <canvas ref={canvasRef} onPointerMove={onMove} onPointerLeave={() => setTip(null)}
          onDoubleClick={onDoubleClick}
          style={{ width: "min(92vmin, 900px)", imageRendering: "pixelated", borderRadius: 6, touchAction: "none" }} />
        {tip && (
          <div style={{
            position: "absolute", left: tip.x + 14, top: tip.y + 10, pointerEvents: "none",
            background: "rgba(10, 14, 20, 0.88)", color: "#e6ecf5", padding: "4px 8px",
            borderRadius: 5, font: "12px system-ui", whiteSpace: "nowrap", zIndex: 2,
            transform: tip.x > 560 ? "translateX(calc(-100% - 26px))" : undefined,
          }}>
            {tip.text}
          </div>
        )}
      </div>
      <p style={{ maxWidth: 720, opacity: 0.8, margin: 0 }}>
        Terrain: Tamriel Worldspaces Argonia heightfield (coarse macro prior — not final terrain).
        Dashed rings are anchor placement tolerances; positions were corrected at the owner
        review (coastal anchors snapped to verified coast, Gideon to the measured western pass).
        Solid tan lines (“routes”) are computed least-cost road corridors for the owner's
        major-city network — they seek dry ground, passes and cheap crossings; dotted lines
        are the underlying graph intent. Cyan lines (“waterways”) are solved boat lanes
        (coastal shipping + navigable rivers; each is ≥83% on water). Green dotted arcs
        (“rootways”) are the speculative rootworm Underground Express between deep-marsh
        stations — schematic, re-authored with Hist placement later. “danger” shows the fixed 1–5 danger bands (never
        player-scaled) from region character, remoteness and road relief; “cultures” shows
        pass-1 dominant-culture territories. Hydrology layers are the coarse province solve
        on the owner-chosen strong terrain (regardless of the relief toggle): rivers by
        drainage area, wetlands and tidal flats, flood frequency, soils, basins, salinity.
        The hover tooltip reports region, danger and culture wherever you point.
        <strong> Double-click anywhere on the map to fly there in 3D</strong> (the flyover
        drapes the currently-toggled layers over the terrain, so pick layers first);
        the URL captures the view for sharing.
      </p>
    </div>
  );
}
