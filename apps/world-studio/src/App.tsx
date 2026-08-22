import { useEffect, useRef, useState } from "react";
import type { SettlementAnchor } from "@elder-souls/contracts";
import anchorsFile from "../../../world/sources/anchors/settlement-anchors.json";

interface ProvinceMeta {
  metresPerPixel: number;
  heightMinMetres: number;
  heightMaxMetres: number;
  imageWidth: number;
  imageHeight: number;
}

const anchors = anchorsFile.anchors as SettlementAnchor[];

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

/** Elevation colouring: depth blues below sea level, marsh greens to upland
 * greys above, with a light east-west hillshade. */
function colour(height: number, seaLevel: number, shade: number): [number, number, number] {
  if (height < seaLevel) {
    const depth = seaLevel - height;
    if (depth < 2) {
      // Marsh shallows get their own band so sub-metre sea-level changes read.
      const t = depth / 2; // waterlogged green -> teal
      return [60 - 30 * t, 110 - 15 * t, 90 + 40 * t];
    }
    const d = Math.min(1, (depth - 2) / 60);
    return [18 + 12 * (1 - d), 60 + 35 * (1 - d), 120 + 40 * (1 - d)];
  }
  const a = Math.min(1, (height - seaLevel) / 110);
  let r: number, g: number, b: number;
  if (a < 0.25) {
    const t = a / 0.25; // wet lowland: dark green -> green
    r = 44 + 30 * t; g = 92 + 40 * t; b = 52 + 10 * t;
  } else if (a < 0.6) {
    const t = (a - 0.25) / 0.35; // hills: green -> ochre
    r = 74 + 86 * t; g = 132 - 22 * t; b = 62 - 4 * t;
  } else {
    const t = (a - 0.6) / 0.4; // uplands: ochre -> pale grey
    r = 160 + 60 * t; g = 110 + 90 * t; b = 58 + 130 * t;
  }
  return [r * shade, g * shade, b * shade];
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heightsRef = useRef<Float32Array | null>(null);
  const conditionedRef = useRef<Partial<Record<Conditioning, Float32Array>>>({});
  const [meta, setMeta] = useState<ProvinceMeta | null>(null);
  const [seaLevel, setSeaLevel] = useState(0);
  const [conditioning, setConditioning] = useState<Conditioning>("off");
  const [readout, setReadout] = useState("");

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
  }, [meta, seaLevel, conditioning]);

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const heights = displayHeights();
    if (!canvas || !heights || !meta) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * meta.imageWidth);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * meta.imageHeight);
    if (x < 0 || y < 0 || x >= meta.imageWidth || y >= meta.imageHeight) return;
    const hgt = heights[y * meta.imageWidth + x];
    const km = (v: number) => ((v * meta.metresPerPixel) / 1000).toFixed(2);
    setReadout(`${km(x)} km E, ${km(y)} km S · elevation ${hgt.toFixed(1)} m`);
  }

  const extentKm = meta ? ((meta.imageWidth * meta.metresPerPixel) / 1000).toFixed(1) : "…";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 16 }}>
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
        <span style={{ opacity: 0.75 }}>{extentKm} km across at raw Skyrim scale (rescale decision pending)</span>
        <span style={{ minWidth: 260 }}>{readout}</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span>Interior relief:</span>
        {([
          ["off", "As source"],
          ["mild", "Compressed — mild (peaks ~60 m)"],
          ["strong", "Compressed — strong (peaks ~34 m)"],
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
      <canvas ref={canvasRef} onMouseMove={onMove}
        style={{ width: "min(92vmin, 900px)", imageRendering: "pixelated", borderRadius: 6 }} />
      <p style={{ maxWidth: 720, opacity: 0.8, margin: 0 }}>
        Terrain: Tamriel Worldspaces Argonia heightfield (coarse macro prior — not final terrain).
        Dashed rings are settlement-anchor placement tolerances; positions are first-pass
        estimates from lore maps and will be corrected from your feedback before hydrology work.
        “Compressed” modes preview Phase 3 interior conditioning (decision 0005, option 2):
        land above a threshold is squashed toward lore's low marsh heart, fading to no change
        within ~10% of the map edges so border mountains and coasts keep their source shape.
        Hover elevations reflect the selected mode.
      </p>
    </div>
  );
}
