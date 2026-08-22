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

/** Elevation colouring: depth blues below sea level, marsh greens to upland
 * greys above, with a light east-west hillshade. */
function colour(height: number, seaLevel: number, shade: number): [number, number, number] {
  if (height < seaLevel) {
    const d = Math.min(1, (seaLevel - height) / 60);
    return [18 + 30 * (1 - d), 60 + 70 * (1 - d), 120 + 60 * (1 - d)];
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
  const [meta, setMeta] = useState<ProvinceMeta | null>(null);
  const [seaLevel, setSeaLevel] = useState(0);
  const [readout, setReadout] = useState("");

  // Load the height raster once; keep decoded heights for repaints and hover.
  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    (async () => {
      const m: ProvinceMeta = await (await fetch(`${base}province/meta.json`)).json();
      const img = new Image();
      img.src = `${base}province/height8.png`;
      await img.decode();
      const off = document.createElement("canvas");
      off.width = m.imageWidth;
      off.height = m.imageHeight;
      const ctx = off.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, m.imageWidth, m.imageHeight).data;
      const heights = new Float32Array(m.imageWidth * m.imageHeight);
      const span = m.heightMaxMetres - m.heightMinMetres;
      for (let i = 0; i < heights.length; i++) heights[i] = m.heightMinMetres + (px[i * 4] / 255) * span;
      heightsRef.current = heights;
      setMeta(m);
    })();
  }, []);

  // Repaint terrain + anchors whenever data or sea level changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const heights = heightsRef.current;
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
  }, [meta, seaLevel]);

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const heights = heightsRef.current;
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
          Sea level {seaLevel} m{" "}
          <input type="range" min={-20} max={20} step={1} value={seaLevel}
            onChange={(e) => setSeaLevel(Number(e.target.value))} />
        </label>
        <span style={{ opacity: 0.75 }}>{extentKm} km across at raw Skyrim scale (rescale decision pending)</span>
        <span style={{ minWidth: 260 }}>{readout}</span>
      </div>
      <canvas ref={canvasRef} onMouseMove={onMove}
        style={{ width: "min(92vmin, 900px)", imageRendering: "pixelated", borderRadius: 6 }} />
      <p style={{ maxWidth: 720, opacity: 0.8, margin: 0 }}>
        Terrain: Tamriel Worldspaces Argonia heightfield (coarse macro prior — not final terrain).
        Dashed rings are settlement-anchor placement tolerances; positions are first-pass
        estimates from lore maps and will be corrected from your feedback before hydrology work.
      </p>
    </div>
  );
}
