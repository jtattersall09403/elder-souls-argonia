import * as THREE from "three";
import { WaterData, assertWaterSchema, decodeDepthByte, type WaterMeta } from "../waterData";
import { WaterWorld } from "../waterWorld";
import type { WaterAssets } from "./types";
import { loadWaterfallTextures, type WaterfallTextureSlot } from "./WaterfallSheets";
import { loadWaterfallKit } from "./WaterfallKit";

/**
 * Loads + decodes the compiled water rasters (worldgen/compile_water.py,
 * decision 0025) and exposes them three ways:
 * - `WaterData`/`WaterWorld` — the CPU query (gameplay, buoyancy, HUD);
 * - THREE textures — the same bytes for the water material;
 * - the province `FloodBasin` amplitudes for tide/season level offsets.
 *
 * App-agnostic: clocks, the season scalar and the terrain ground hook are
 * injected, and callers own their own caching.
 */

export interface LoadWaterAssetsOptions {
  /** Site base URL, ending in `/` (Vite `import.meta.env.BASE_URL`). */
  baseUrl: string;
  /** Province-relative water bundle directory. */
  waterPath?: string;
  /** The apron manifest (`province/apron/apron-manifest.json`, 16d). When
   * given and present, the sea beyond the border is drawn over the apron's
   * `ring2` tile; a 404 or a missing tile leaves the edge-texel rule. */
  apronManifestUrl?: string;
  /** Accurate terrain height where chunks are loaded; null = use the proxy. */
  groundHeight?: (x: number, z: number) => number | null;
  seasonScalar: () => number;
  waveTimeS?: () => number;
  /** Waterfall FX texture URLs by shader slot (the app composes them from the
   * kit manifest via `WATERFALL_TEXTURE_ROLES`); missing = procedural. */
  waterfallTextureUrls?: Partial<Record<WaterfallTextureSlot, string>> & Record<string, string | undefined>;
  /** The waterfall FX kit GLB (`kits/waterfall-fx-v1.glb`); missing = falls undrawn. */
  waterfallKitUrl?: string;
  /** The weather's wind speed (m/s) for the sea's energy; 0 = the swell floor. */
  windSpeedMS?: () => number;
}

/** Entity labels from the raw RGBA bytes of water-id.png (R·256 + G). */
export function decodeWaterIds(size: number, rgba: Uint8ClampedArray | Uint8Array): Uint16Array {
  const out = new Uint16Array(size * size);
  for (let i = 0; i < size * size; i++) out[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1];
  return out;
}

async function fetchImageData(url: string): Promise<ImageData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`water asset ${url}: ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function dataTexture(img: ImageData, filter: THREE.MagnificationTextureFilter): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    new Uint8Array(img.data.buffer.slice(0)),
    img.width,
    img.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  tex.magFilter = filter;
  tex.minFilter = filter as THREE.MinificationTextureFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Decoded CPU rasters from the raw RGBA bytes of water-surface.png and
 * water-shore.png. Pure (no canvas) so the v1/v2 decode is unit-testable. */
export function decodeWaterRasters(meta: WaterMeta, surfaceRgba: Uint8ClampedArray | Uint8Array,
  shoreRgba: Uint8ClampedArray | Uint8Array): {
  surface: Float32Array; depth: Float32Array; shore: Float32Array; season: Float32Array;
} {
  const n = meta.surface.size;
  const span = meta.surface.maxM - meta.surface.minM;
  const shoreMax = meta.surface.shoreMaxM ?? 160;
  const surface = new Float32Array(n * n);
  const depth = new Float32Array(n * n);
  const shore = new Float32Array(n * n);
  const season = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    surface[i] = meta.surface.minM + ((surfaceRgba[i * 4] * 256 + surfaceRgba[i * 4 + 1]) / 65535) * span;
    depth[i] = decodeDepthByte(surfaceRgba[i * 4 + 2], meta);
    shore[i] = (shoreRgba[i * 4] / 255) * shoreMax;
    season[i] = shoreRgba[i * 4 + 1] / 255;
  }
  return { surface, depth, shore, season };
}

interface ApronTile {
  file: string; originM: [number, number]; shape: [number, number]; metresPerSample: number; minM: number; maxM: number;
}

/** The apron's far tile as `WaterAssets.apron`, or undefined when the
 * manifest or its tile cannot be read. Never throws: the sea must still draw
 * on a build without the apron (the ladder hides it, or an older publish). */
async function loadApron(manifestUrl: string, base: string, klass: Uint8ClampedArray, klassSize: number,
  classes: readonly string[]): Promise<WaterAssets["apron"]> {
  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) return undefined;
    const manifest = await res.json() as { tiles?: ApronTile[] };
    const tile = manifest.tiles?.find((t) => (t as { id?: string }).id === "ring2") ?? manifest.tiles?.at(-1);
    if (!tile) return undefined;
    const dir = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);
    const img = await fetchImageData(`${dir}${tile.file}`);
    const [ny, nx] = tile.shape;
    if (img.width !== nx || img.height !== ny) return undefined;
    const heights = new Float32Array(nx * ny);
    const span = tile.maxM - tile.minM;
    for (let i = 0; i < heights.length; i++) {
      heights[i] = tile.minM + ((img.data[i * 4] * 256 + img.data[i * 4 + 1]) / 65535) * span;
    }
    // The coast's own turbidity and salinity, read from the class raster's
    // coast texels (the record), never guessed.
    const coast = Math.max(0, classes.indexOf("coast"));
    const turb: number[] = []; const sal: number[] = [];
    for (let i = 0; i < klassSize * klassSize; i += 7) {
      if (klass[i * 4] === coast) { turb.push(klass[i * 4 + 1]); sal.push(klass[i * 4 + 2]); }
    }
    const median = (v: number[]) => (v.length ? v.sort((a, b) => a - b)[v.length >> 1] / 255 : 0);
    return {
      ground: { heights, nx, ny, originM: tile.originM, metresPerSample: tile.metresPerSample },
      tex: dataTexture(img, THREE.NearestFilter),
      minM: tile.minM, maxM: tile.maxM,
      coastClassIndex: coast, coastTurbidity: median(turb), coastSalinity: sal.length ? median(sal) : 1,
    };
  } catch {
    void base;
    return undefined;
  }
}

export async function loadWaterAssets(options: LoadWaterAssetsOptions): Promise<WaterAssets> {
  const base = options.baseUrl;
  const waterBase = `${base}${options.waterPath ?? "province/water"}/`;
  const [meta, floodStates, waterfallTextures, waterfallKit] = await Promise.all([
    fetch(`${waterBase}water-meta.json`).then((r) => r.json() as Promise<WaterMeta>),
    fetch(`${base}province/refined/flood-states.json`).then((r) => r.json()).catch(() => null),
    options.waterfallTextureUrls ? loadWaterfallTextures(options.waterfallTextureUrls) : Promise.resolve(undefined),
    options.waterfallKitUrl ? loadWaterfallKit(options.waterfallKitUrl) : Promise.resolve(null),
  ]);
  assertWaterSchema(meta);
  const ownerFile = meta.surface.ownerFile;
  const idFile = meta.surface.idFile;
  const [surfImg, flowImg, klassImg, shoreImg, ownerImg, idImg] = await Promise.all([
    fetchImageData(`${waterBase}${meta.surface.file}`),
    fetchImageData(`${waterBase}${meta.flow.file}`),
    fetchImageData(`${waterBase}${meta.klass.file}`),
    fetchImageData(`${waterBase}${meta.surface.shoreFile ?? "water-shore.png"}`),
    ownerFile ? fetchImageData(`${waterBase}${ownerFile}`) : Promise.resolve(null),
    idFile ? fetchImageData(`${waterBase}${idFile}`) : Promise.resolve(null),
  ]);

  // Dequantise W + signed depth + shore distance for the CPU samplers.
  const { surface, depth, shore, season } = decodeWaterRasters(meta, surfImg.data, shoreImg.data);
  const data = new WaterData(
    meta,
    surface,
    depth,
    new Uint8ClampedArray(flowImg.data),
    new Uint8ClampedArray(klassImg.data),
    shore,
    season,
    idImg ? decodeWaterIds(meta.surface.size, idImg.data) : undefined,
  );

  const apron = options.apronManifestUrl
    ? await loadApron(options.apronManifestUrl, base, new Uint8ClampedArray(klassImg.data), meta.klass.size, meta.klass.classes)
    : undefined;
  data.attachApron(apron?.ground ?? null);

  const basin = (floodStates?.basins?.[0] ?? {}) as {
    tidalAmplitudeM?: number;
    seasonalAmplitudeM?: number;
  };
  const tidalAmplitudeM = basin.tidalAmplitudeM ?? 0.5;
  const seasonalAmplitudeM = basin.seasonalAmplitudeM ?? 1.4;
  const world = new WaterWorld(data, {
    tidalAmplitudeM,
    seasonalAmplitudeM,
    groundHeight: (x, z) => options.groundHeight?.(x, z) ?? null,
    seasonScalar: options.seasonScalar,
    waveTimeS: options.waveTimeS,
    windSpeedMS: options.windSpeedMS,
  });

  return {
    data,
    world,
    meta,
    surfaceTex: dataTexture(surfImg, THREE.NearestFilter),
    flowTex: dataTexture(flowImg, THREE.LinearFilter),
    klassTex: dataTexture(klassImg, THREE.LinearFilter),
    shoreTex: dataTexture(shoreImg, THREE.LinearFilter),
    // NEAREST: the mask is a hard ownership decision per surface texel —
    // filtering it would bleed a half-texel hole around every strip.
    ownerTex: ownerImg ? dataTexture(ownerImg, THREE.NearestFilter) : null,
    tidalAmplitudeM,
    seasonalAmplitudeM,
    apron,
    waterfallTextures,
    waterfallKit,
  };
}
