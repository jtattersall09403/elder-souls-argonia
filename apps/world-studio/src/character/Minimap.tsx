import { useEffect, useMemo, useRef, useState } from "react";
import {
  cropRectFor,
  headingWedge,
  positionInCrop,
  worldToMapPx,
  type MapMeta,
} from "@elder-souls/game-core/hud/minimap";

/** Minimap panel size (CSS px) and zoomed-view span (world metres). */
const VIEW_PX = 180;
const ZOOM_SPAN_M = 1500;
/** Working copy of the province map — blitting crops from the full 4033²
 * canvas every update would be needlessly slow, so it is downscaled once. */
const DOWNSCALE_PX = 1024;

/**
 * Walk-mode minimap (bottom-left): a ~1.5 km crop of the province map,
 * north-up, centred on the player with a heading wedge. Click/tap toggles a
 * full-province view so the owner can see where they are overall.
 */
export function Minimap({ mapCanvas, meta, xKm, zKm, headingDeg, bottomPx }: {
  /** The studio's painted province-map canvas (stays mounted in every view). */
  mapCanvas: HTMLCanvasElement | null;
  meta: MapMeta;
  xKm: number;
  zKm: number;
  headingDeg: number;
  /** Lifts the panel clear of the touch joystick when needed. */
  bottomPx: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoomed, setZoomed] = useState(true);

  // One-off downscale of the big map canvas into a fast working copy.
  const small = useMemo(() => {
    if (!mapCanvas) return null;
    const c = document.createElement("canvas");
    c.width = DOWNSCALE_PX;
    c.height = DOWNSCALE_PX;
    c.getContext("2d")!.drawImage(mapCanvas, 0, 0, DOWNSCALE_PX, DOWNSCALE_PX);
    return c;
  }, [mapCanvas]);

  // Same world extent, fewer pixels: metres-per-pixel scales up.
  const smallMeta: MapMeta = useMemo(() => ({
    imageWidth: DOWNSCALE_PX,
    imageHeight: DOWNSCALE_PX,
    metresPerPixel: (meta.metresPerPixel * meta.imageWidth) / DOWNSCALE_PX,
  }), [meta]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !small) return;
    const ctx = canvas.getContext("2d")!;
    const xM = xKm * 1000;
    const zM = zKm * 1000;
    ctx.clearRect(0, 0, VIEW_PX, VIEW_PX);
    let dot: { x: number; y: number };
    if (zoomed) {
      const crop = cropRectFor(xM, zM, ZOOM_SPAN_M, smallMeta);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(small, crop.x, crop.y, crop.size, crop.size, 0, 0, VIEW_PX, VIEW_PX);
      dot = positionInCrop(xM, zM, crop, smallMeta, VIEW_PX);
    } else {
      ctx.drawImage(small, 0, 0, VIEW_PX, VIEW_PX);
      const { px, py } = worldToMapPx(xM, zM, smallMeta);
      dot = { x: (px / DOWNSCALE_PX) * VIEW_PX, y: (py / DOWNSCALE_PX) * VIEW_PX };
    }
    // Player: heading wedge behind a centred dot.
    const wedge = headingWedge(dot.x, dot.y, headingDeg, zoomed ? 11 : 8);
    ctx.beginPath();
    ctx.moveTo(wedge[0][0], wedge[0][1]);
    ctx.lineTo(wedge[1][0], wedge[1][1]);
    ctx.lineTo(wedge[2][0], wedge[2][1]);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, zoomed ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = "#3aa0ff";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // North marker.
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText("N", VIEW_PX / 2 + 1, 13);
    ctx.fillStyle = "#e6ecf5";
    ctx.fillText("N", VIEW_PX / 2, 12);
  }, [small, smallMeta, xKm, zKm, headingDeg, zoomed]);

  if (!small) return null;
  return (
    <canvas
      ref={canvasRef}
      width={VIEW_PX}
      height={VIEW_PX}
      onClick={() => setZoomed((z) => !z)}
      title={zoomed ? "~1.5 km around you — click for the whole province" : "Whole province — click to zoom back in"}
      style={{
        position: "absolute", left: 12, bottom: bottomPx,
        width: VIEW_PX, height: VIEW_PX, borderRadius: 8, cursor: "pointer",
        border: "1px solid rgba(230,236,245,0.35)", background: "rgba(10,14,20,0.8)",
      }}
    />
  );
}
