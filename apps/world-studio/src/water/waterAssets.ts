import * as THREE from "three";
import { WaterData, WaterWorld, type WaterMeta } from "@elder-souls/game-core/water/index";
import { worldClock } from "../sky/timeState";

/**
 * Loads + decodes the compiled water rasters (worldgen/compile_water.py,
 * decision 0025) once per session and exposes them three ways:
 * - `WaterData`/`WaterWorld` — the CPU query (gameplay, buoyancy, HUD);
 * - THREE textures — the same bytes for the water material;
 * - the province `FloodBasin` amplitudes for tide/season level offsets.
 */

export interface WaterAssets {
  data: WaterData;
  world: WaterWorld;
  meta: WaterMeta;
  /** RGBA8 of water-surface.png (R,G = W16, B = depth proxy). Nearest. */
  surfaceTex: THREE.DataTexture;
  /** RGBA8 of water-flow.png. Linear. */
  flowTex: THREE.DataTexture;
  /** RGBA8 of water-class.png. Linear (class index R is CPU-only). */
  klassTex: THREE.DataTexture;
  tidalAmplitudeM: number;
  seasonalAmplitudeM: number;
}

/** Studio wet-season toggle: overrides the calendar season when non-null. */
let wetOverride: boolean | null = null;
export function setWetSeasonOverride(v: boolean | null): void {
  wetOverride = v;
}
export function effectiveSeasonScalar(): number {
  if (wetOverride !== null) return wetOverride ? 1 : 0;
  return worldClock.season().s;
}

/** Terrain ground-height hook — CharacterMode wires its ChunkWorld in so the
 * water query uses real chunk heights where they are loaded. */
let groundHeightFn: ((x: number, z: number) => number | null) | null = null;
export function setWaterGroundHeight(fn: ((x: number, z: number) => number | null) | null): void {
  groundHeightFn = fn;
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

let assetsPromise: Promise<WaterAssets> | null = null;

export function sharedWaterAssets(base: string): Promise<WaterAssets> {
  if (assetsPromise) return assetsPromise;
  assetsPromise = (async () => {
    const [meta, floodStates] = await Promise.all([
      fetch(`${base}province/water/water-meta.json`).then((r) => r.json() as Promise<WaterMeta>),
      fetch(`${base}province/refined/flood-states.json`).then((r) => r.json()).catch(() => null),
    ]);
    const [surfImg, flowImg, klassImg] = await Promise.all([
      fetchImageData(`${base}province/water/${meta.surface.file}`),
      fetchImageData(`${base}province/water/${meta.flow.file}`),
      fetchImageData(`${base}province/water/${meta.klass.file}`),
    ]);

    // Dequantise W + depth proxy for the CPU samplers.
    const n = meta.surface.size;
    const span = meta.surface.maxM - meta.surface.minM;
    const surface = new Float32Array(n * n);
    const depth = new Float32Array(n * n);
    const px = surfImg.data;
    for (let i = 0; i < n * n; i++) {
      surface[i] = meta.surface.minM + ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * span;
      depth[i] = px[i * 4 + 2] * 0.1;
    }
    const data = new WaterData(
      meta,
      surface,
      depth,
      new Uint8ClampedArray(flowImg.data),
      new Uint8ClampedArray(klassImg.data),
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
      groundHeight: (x, z) => groundHeightFn?.(x, z) ?? null,
      seasonScalar: effectiveSeasonScalar,
    });

    return {
      data,
      world,
      meta,
      surfaceTex: dataTexture(surfImg, THREE.NearestFilter),
      flowTex: dataTexture(flowImg, THREE.LinearFilter),
      klassTex: dataTexture(klassImg, THREE.LinearFilter),
      tidalAmplitudeM,
      seasonalAmplitudeM,
    };
  })();
  return assetsPromise;
}
