import * as THREE from "three";
import { WaterData, type WaterMeta } from "../waterData";
import { WaterWorld } from "../waterWorld";
import type { WaterAssets } from "./types";

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
  /** Accurate terrain height where chunks are loaded; null = use the proxy. */
  groundHeight?: (x: number, z: number) => number | null;
  seasonScalar: () => number;
  waveTimeS?: () => number;
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

export async function loadWaterAssets(options: LoadWaterAssetsOptions): Promise<WaterAssets> {
  const base = options.baseUrl;
  const waterBase = `${base}${options.waterPath ?? "province/water"}/`;
  const [meta, floodStates] = await Promise.all([
    fetch(`${waterBase}water-meta.json`).then((r) => r.json() as Promise<WaterMeta>),
    fetch(`${base}province/refined/flood-states.json`).then((r) => r.json()).catch(() => null),
  ]);
  const ownerFile = meta.surface.ownerFile;
  const [surfImg, flowImg, klassImg, shoreImg, ownerImg] = await Promise.all([
    fetchImageData(`${waterBase}${meta.surface.file}`),
    fetchImageData(`${waterBase}${meta.flow.file}`),
    fetchImageData(`${waterBase}${meta.klass.file}`),
    fetchImageData(`${waterBase}${meta.surface.shoreFile ?? "water-shore.png"}`),
    ownerFile ? fetchImageData(`${waterBase}${ownerFile}`) : Promise.resolve(null),
  ]);

  // Dequantise W + depth proxy + shore distance for the CPU samplers.
  const n = meta.surface.size;
  const span = meta.surface.maxM - meta.surface.minM;
  const shoreMax = meta.surface.shoreMaxM ?? 160;
  const surface = new Float32Array(n * n);
  const depth = new Float32Array(n * n);
  const shore = new Float32Array(n * n);
  const season = new Float32Array(n * n);
  const px = surfImg.data;
  const sp = shoreImg.data;
  for (let i = 0; i < n * n; i++) {
    surface[i] = meta.surface.minM + ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * span;
    depth[i] = px[i * 4 + 2] * 0.1;
    shore[i] = (sp[i * 4] / 255) * shoreMax;
    season[i] = sp[i * 4 + 1] / 255;
  }
  const data = new WaterData(
    meta,
    surface,
    depth,
    new Uint8ClampedArray(flowImg.data),
    new Uint8ClampedArray(klassImg.data),
    shore,
    season,
  );

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
  };
}
