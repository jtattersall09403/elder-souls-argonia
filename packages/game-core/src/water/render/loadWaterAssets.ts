import * as THREE from "three";
import { WaterData, type WaterMeta } from "../waterData";
import { WaterWorld, type WaterWorldOptions } from "../waterWorld";
import type { WaterAssets } from "./types";

/** Caller-owned load; apps decide caching and lifetime. Paths are relative
 * to baseUrl (a Pages deployment prefix or an absolute URL). */
export interface LoadWaterAssetsOptions {
  baseUrl: string;
  waterPath?: string;
  floodStatesPath?: string;
  groundHeight?: WaterWorldOptions["groundHeight"];
  seasonScalar: WaterWorldOptions["seasonScalar"];
  waveTimeS?: WaterWorldOptions["waveTimeS"];
  signal?: AbortSignal;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Water ${label} must be an object`);
  return value as Record<string, unknown>;
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }

/** Validate before decoding/allocating. Flow and class share shader UVs. */
export function validateWaterMeta(value: unknown): asserts value is WaterMeta {
  const meta = record(value, "metadata");
  if (meta.schemaVersion !== 2) throw new Error("Water loader requires schemaVersion 2");
  for (const name of ["surface", "flow", "klass"] as const) {
    const grid = record(meta[name], `${name} grid`);
    if (!finite(grid.size) || !Number.isSafeInteger(grid.size) || grid.size < 2
      || !Number.isSafeInteger(grid.size * grid.size * 4)
      || !finite(grid.metresPerPixel) || grid.metresPerPixel <= 0
      || !finite(grid.gridOriginM) || typeof grid.file !== "string" || !grid.file.trim()) {
      throw new Error(`Water ${name} grid has invalid dimensions, origin or file`);
    }
  }
  const surface = record(meta.surface, "surface grid");
  const flow = record(meta.flow, "flow grid");
  const klass = record(meta.klass, "class grid");
  if (!finite(surface.minM) || !finite(surface.maxM) || surface.maxM <= surface.minM
    || !finite(surface.depthMinM) || !finite(surface.buryM) || surface.buryM < 0
    || !finite(surface.shoreMaxM) || surface.shoreMaxM <= 0
    || typeof surface.supportFile !== "string" || !surface.supportFile.trim()
    || typeof surface.shoreFile !== "string" || !surface.shoreFile.trim()
    || typeof klass.characterFile !== "string" || !klass.characterFile.trim()
    || !finite(flow.flowMax) || flow.flowMax <= 0
    || !finite(flow.shoreMaxM) || flow.shoreMaxM <= 0) {
    throw new Error("Water schema-2 signed depth, support, shore or flow encoding is invalid");
  }
  if (flow.size !== klass.size || flow.metresPerPixel !== klass.metresPerPixel
    || flow.gridOriginM !== klass.gridOriginM) {
    throw new Error("Water flow and class grids must share size, scale and origin");
  }
  if (!Array.isArray(klass.classes) || klass.classes.length === 0
    || !klass.classes.every((name) => typeof name === "string")) {
    throw new Error("Water class names are missing or invalid");
  }
  if (meta.ribbons !== undefined) {
    if (!Array.isArray(meta.ribbons)) throw new Error("Water ribbons must be an array");
    for (const value of meta.ribbons) {
      const ribbon = record(value, "ribbon");
      if (typeof ribbon.id !== "string" || !Number.isSafeInteger(ribbon.bodyIndex)
        || !Array.isArray(ribbon.points) || ribbon.points.length < 2) {
        throw new Error("Water ribbon has invalid identity or points");
      }
      for (const value of ribbon.points) {
        const point = record(value, "ribbon point");
        if (![point.x, point.y, point.z, point.groundM, point.halfWidthM].every(finite)
          || (point.halfWidthM as number) <= 0) {
          throw new Error(`Water ribbon ${ribbon.id} requires finite native ground and coordinates`);
        }
      }
    }
  }
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Water asset ${url}: HTTP ${response.status}`);
  return response.json();
}

async function fetchRaster(url: string, size: number, signal: AbortSignal): Promise<ImageData> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Water asset ${url}: HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), {
    premultiplyAlpha: "none", colorSpaceConversion: "none",
  });
  let canvas: OffscreenCanvas | undefined;
  try {
    signal.throwIfAborted();
    if (bitmap.width !== size || bitmap.height !== size) {
      throw new Error(`Water raster ${url}: expected ${size}×${size}, received ${bitmap.width}×${bitmap.height}`);
    }
    canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error(`Water raster ${url}: 2D decoding context unavailable`);
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, size, size);
  } finally {
    bitmap.close();
    // getImageData owns its pixels; release the temporary backing store.
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}

function rasterTexture(image: ImageData, filter: THREE.MagnificationTextureFilter): THREE.DataTexture {
  // WaterData never mutates these bytes. CPU sampling and GPU upload share
  // storage, avoiding another full province-sized copy for each texture.
  const bytes = new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  const texture = new THREE.DataTexture(bytes, image.width, image.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.magFilter = filter;
  texture.minFilter = filter as THREE.MinificationTextureFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Dispose after all scene consumers release this caller-owned bundle. */
export function disposeWaterAssets(assets: WaterAssets): void {
  for (const texture of [assets.surfaceTex, assets.flowTex, assets.klassTex,
    assets.shoreTex, assets.supportTex, assets.characterTex]) texture.dispose();
}

export async function loadWaterAssets(options: LoadWaterAssetsOptions): Promise<WaterAssets> {
  const base = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`;
  const waterPath = options.waterPath ?? "province/water/v2/";
  const waterBase = `${base}${waterPath.endsWith("/") ? waterPath : `${waterPath}/`}`;
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  const textures: THREE.DataTexture[] = [];
  try {
    const [meta, floodStates] = await Promise.all([
      fetchJson(`${waterBase}water-meta.json`, controller.signal),
      fetchJson(`${base}${options.floodStatesPath ?? "province/refined/flood-states.json"}`, controller.signal),
    ]);
    validateWaterMeta(meta);
    const basins = record(floodStates, "flood states").basins;
    const basin = record(Array.isArray(basins) ? basins[0] : undefined, "flood basin");
    const { tidalAmplitudeM, seasonalAmplitudeM } = basin;
    // Never silently retune tide/season ranges if the authored source fails.
    if (!finite(tidalAmplitudeM) || tidalAmplitudeM < 0
      || !finite(seasonalAmplitudeM) || seasonalAmplitudeM < 0) {
      throw new Error("Water flood basin has invalid tidal or seasonal amplitude");
    }
    const [surfaceImage, flowImage, classImage, shoreImage, supportImage, characterImage] = await Promise.all([
      fetchRaster(`${waterBase}${meta.surface.file}`, meta.surface.size, controller.signal),
      fetchRaster(`${waterBase}${meta.flow.file}`, meta.flow.size, controller.signal),
      fetchRaster(`${waterBase}${meta.klass.file}`, meta.klass.size, controller.signal),
      fetchRaster(`${waterBase}${meta.surface.shoreFile}`, meta.surface.size, controller.signal),
      fetchRaster(`${waterBase}${meta.surface.supportFile}`, meta.surface.size, controller.signal),
      fetchRaster(`${waterBase}${meta.klass.characterFile}`, meta.klass.size, controller.signal),
    ]);
    controller.signal.throwIfAborted();
    const count = meta.surface.size * meta.surface.size;
    const surface = new Float32Array(count), depth = new Float32Array(count);
    const shore = new Float32Array(count), season = new Float32Array(count), tannin = new Float32Array(count);
    const span = meta.surface.maxM - meta.surface.minM;
    for (let i = 0; i < count; i++) {
      const p = i * 4;
      surface[i] = meta.surface.minM + ((surfaceImage.data[p] * 256 + surfaceImage.data[p + 1]) / 65535) * span;
      depth[i] = surfaceImage.data[p + 2] * 0.1 + meta.surface.depthMinM!;
      shore[i] = (shoreImage.data[p] / 255) * meta.surface.shoreMaxM!;
      season[i] = shoreImage.data[p + 1] / 255;
      tannin[i] = shoreImage.data[p + 2] / 255;
    }
    const data = new WaterData(meta, surface, depth, flowImage.data, classImage.data,
      shore, season, supportImage.data, characterImage.data, tannin);
    const world = new WaterWorld(data, {
      tidalAmplitudeM, seasonalAmplitudeM, groundHeight: options.groundHeight,
      seasonScalar: options.seasonScalar, waveTimeS: options.waveTimeS,
    });
    const texture = (image: ImageData, filter: THREE.MagnificationTextureFilter) => {
      const result = rasterTexture(image, filter);
      textures.push(result);
      return result;
    };
    return {
      data, world, meta, tidalAmplitudeM, seasonalAmplitudeM,
      surfaceTex: texture(surfaceImage, THREE.NearestFilter),
      flowTex: texture(flowImage, THREE.LinearFilter),
      klassTex: texture(classImage, THREE.LinearFilter),
      shoreTex: texture(shoreImage, THREE.LinearFilter),
      supportTex: texture(supportImage, THREE.NearestFilter),
      characterTex: texture(characterImage, THREE.NearestFilter),
    };
  } catch (error) {
    controller.abort(error);
    textures.forEach((texture) => texture.dispose());
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", cancel);
  }
}
