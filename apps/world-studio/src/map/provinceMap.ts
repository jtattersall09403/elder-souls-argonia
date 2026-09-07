/**
 * The MAIN 2D province map, as data: the height raster, its metadata and the
 * generated overlay rasters (rivers, wetlands, boat lanes, roads…).
 *
 * Extracted from App.tsx so the Blueprint view can show the *same* coloured map
 * the owner reads on the map screen, zoomed to one settlement, instead of its
 * own grey hillshade (owner feedback 2026-09-05, item 1). App and the Blueprint
 * view now share this loader and `terrainColor.paintTerrainCanvas`; neither
 * copies the other's painting.
 *
 * Resolution caveat, worth knowing before reading a crop: the province map is a
 * 1345 px raster at ~5.48 m per pixel. A settlement 300 m across is therefore
 * about 55 pixels — the backdrop is *coarse by construction*, and zooming in
 * enlarges pixels rather than revealing detail. It is the right backdrop for
 * "where is this place and what is around it", not for reading the ground under
 * a single building; the exported hillshade crop (layer `terrain`) is the finer
 * read of the ground, and both are available as layers.
 *
 * No module-level mutable state: loaders return values, the caller owns them.
 */
import { paintTerrainCanvas } from "../terrainColor";

export interface ProvinceMapMeta {
  metresPerPixel: number;
  heightMinMetres: number;
  heightMaxMetres: number;
  imageWidth: number;
  imageHeight: number;
}

/** `province/meta.json` — the raster's own geometry and height range. */
export async function loadProvinceMeta(baseUrl: string): Promise<ProvinceMapMeta> {
  const r = await fetch(`${baseUrl}province/meta.json`);
  if (!r.ok) throw new Error(`province/meta.json: HTTP ${r.status}`);
  return (await r.json()) as ProvinceMapMeta;
}

/**
 * Decode `province/height-rg.png` into metres. The 16-bit height is packed as
 * high byte → R, low byte → G (~3 mm steps), which is why this cannot be a
 * plain `<img>`: the map has to read the numbers, not the colours.
 *
 * `ctx` lets a caller reuse one offscreen canvas for the overlays too.
 */
export async function decodeProvinceHeights(
  baseUrl: string, meta: ProvinceMapMeta, ctx?: CanvasRenderingContext2D,
): Promise<{ heights: Float32Array; ctx: CanvasRenderingContext2D }> {
  const img = new Image();
  img.src = `${baseUrl}province/height-rg.png`;
  await img.decode();
  let g = ctx;
  if (!g) {
    const off = document.createElement("canvas");
    off.width = meta.imageWidth;
    off.height = meta.imageHeight;
    g = off.getContext("2d", { willReadFrequently: true })!;
  }
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, meta.imageWidth, meta.imageHeight).data;
  const heights = new Float32Array(meta.imageWidth * meta.imageHeight);
  const span = meta.heightMaxMetres - meta.heightMinMetres;
  for (let i = 0; i < heights.length; i++) {
    heights[i] = meta.heightMinMetres + ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * span;
  }
  return { heights, ctx: g };
}

/** Overlay rasters worth having under a blueprint: water first, then the
 * network. All are the same 1345-px grid as the height raster. */
export const CONTEXT_OVERLAY_FILES: Record<string, string> = {
  wetlands: "hydro-wetlands.png",
  rivers: "hydro-rivers.png",
};

/** Load overlay PNGs by layer name; a missing file simply yields no entry. */
export async function loadOverlayImages(
  baseUrl: string, files: Record<string, string>,
): Promise<Record<string, HTMLImageElement>> {
  const out: Record<string, HTMLImageElement> = {};
  await Promise.all(Object.entries(files).map(async ([name, file]) => {
    const img = new Image();
    img.src = `${baseUrl}province/${file}`;
    try {
      await img.decode();
      out[name] = img;
    } catch { /* layer not generated yet */ }
  }));
  return out;
}

/**
 * Paint the coloured province map (the same elevation ramp and hillshade as the
 * map screen), draw the overlays over it, and return the canvas.
 */
export function paintProvinceMap(
  heights: Float32Array, meta: ProvinceMapMeta, seaLevel: number,
  overlays: HTMLImageElement[] = [],
): HTMLCanvasElement {
  const canvas = paintTerrainCanvas(heights, meta.imageWidth, meta.imageHeight, seaLevel);
  const ctx = canvas.getContext("2d")!;
  for (const img of overlays) ctx.drawImage(img, 0, 0, meta.imageWidth, meta.imageHeight);
  return canvas;
}

export interface MetreBox { x0: number; z0: number; x1: number; z1: number }

/**
 * Cut a metre-space rectangle out of the province canvas as a data URL, plus
 * the exact metre box the cut covers (pixel-snapped outwards, so the image is
 * placed honestly rather than stretched to the requested box).
 *
 * `provinceExtentM` is the published province extent the blueprint metres use;
 * the raster's own extent differs from it by a few millimetres across 7.4 km,
 * which is far below one pixel and is deliberately ignored.
 */
export function cropProvinceMap(
  canvas: HTMLCanvasElement, provinceExtentM: number, box: MetreBox,
): { url: string; box: MetreBox } | null {
  const n = canvas.width;
  const mPerPx = provinceExtentM / n;
  const c0 = Math.max(0, Math.floor(box.x0 / mPerPx));
  const r0 = Math.max(0, Math.floor(box.z0 / mPerPx));
  const c1 = Math.min(n, Math.ceil(box.x1 / mPerPx));
  const r1 = Math.min(canvas.height, Math.ceil(box.z1 / mPerPx));
  const w = c1 - c0, h = r1 - r0;
  if (w < 1 || h < 1) return null;
  const cut = document.createElement("canvas");
  cut.width = w;
  cut.height = h;
  cut.getContext("2d")!.drawImage(canvas, c0, r0, w, h, 0, 0, w, h);
  return {
    url: cut.toDataURL("image/png"),
    box: { x0: c0 * mPerPx, z0: r0 * mPerPx, x1: c1 * mPerPx, z1: r1 * mPerPx },
  };
}
