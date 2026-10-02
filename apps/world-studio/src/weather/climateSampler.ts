/**
 * CPU access to the compiled climate rasters (Phase 8a/8c): climate-air.png
 * (R humidity, G mist propensity, B canopy closure) and climate-weather.png
 * (R rain amplitude, G storm exposure, B advection sea fog). One decode each,
 * shared by the sky turbidity term, the weather machine's local expression
 * and the environment query. hydro-regions.png (the region map) gives the
 * region class under the camera and so its fog profile (RegionFogProbe).
 * Every raster's row 0 is world z = 0 (no flipY).
 */
import { REGION_FOG_NEUTRAL, type RegionFogProfile } from "@elder-souls/game-core/air/volumetrics/fogField";

export interface RasterPixels {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

const rasters = new Map<string, RasterPixels | "pending" | "failed">();

let worker: Worker | null = null;

/** One worker decodes every raster (climateRaster.worker.ts); the main thread
 * only receives the transferred pixel buffer. */
function decoder(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./climateRaster.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<{ url: string; buf?: ArrayBuffer; w?: number; h?: number; error?: string }>) => {
    const { url, buf, error } = e.data;
    const name = url.slice(url.lastIndexOf("/") + 1);
    if (error || !buf) rasters.set(name, "failed");
    else rasters.set(name, { data: new Uint8ClampedArray(buf), w: e.data.w!, h: e.data.h! });
  };
  worker = w;
  return w;
}

function ensure(base: string, name: string): RasterPixels | null {
  const state = rasters.get(name);
  if (state && state !== "pending" && state !== "failed") return state;
  if (state) return null;
  rasters.set(name, "pending");
  if (typeof Worker === "undefined") {
    rasters.set(name, "failed");
    return null;
  }
  decoder().postMessage({ url: new URL(`${base}province/${name}`, location.href).href });
  return null;
}

/** Bilinear sample of a decoded raster at (x, z) world metres into `out` (rgb 0..1): continuous
 * across texel edges, so a near-binary mask (the climate-vis belt) has no step at a cell edge. */
export function bilinearInto(px: RasterPixels, xM: number, zM: number, extentM: number, out: number[]): number[] {
  const fx = Math.max(0, Math.min(px.w - 1, (xM / extentM) * (px.w - 1)));
  const fz = Math.max(0, Math.min(px.h - 1, (zM / extentM) * (px.h - 1)));
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const x1 = Math.min(px.w - 1, x0 + 1), z1 = Math.min(px.h - 1, z0 + 1);
  const tx = fx - x0, tz = fz - z0, d = px.data;
  const a = (z0 * px.w + x0) * 4, b = (z0 * px.w + x1) * 4, c = (z1 * px.w + x0) * 4, e = (z1 * px.w + x1) * 4;
  for (let k = 0; k < 3; k++) {
    const top = d[a + k] + (d[b + k] - d[a + k]) * tx;
    const bot = d[c + k] + (d[e + k] - d[c + k]) * tx;
    out[k] = (top + (bot - top) * tz) / 255;
  }
  return out;
}

function sample(px: RasterPixels | null, xM: number, zM: number, extentM: number): [number, number, number] | null {
  if (!px) return null;
  return bilinearInto(px, xM, zM, extentM, [0, 0, 0]) as [number, number, number];
}

/** Tap offsets (texels) of the belt-mask smoothing: a rotated four-tap box over the bilinear field,
 * twin of aerial.ts esBeltMask. */
export const BELT_MASK_TAPS: readonly (readonly [number, number])[] = [[1, 0.5], [-0.5, 1], [-1, -0.5], [0.5, -1]];
/** The smoothed mask is remapped through smoothstep(lo, hi) (aerial.ts twin). */
export const BELT_MASK_EDGE = { lo: 0.05, hi: 0.85 } as const;

/** Smoothed cloud-forest belt mask 0..1 from climate-vis R at (x, z): four rotated bilinear taps a
 * texel out, then a smoothstep, so the cap cloud has no square raster edges. */
export function smoothBeltMask(px: RasterPixels, xM: number, zM: number, extentM: number, scratch: number[] = [0, 0, 0]): number {
  const tex = extentM / Math.max(1, px.w - 1);
  let sum = 0;
  for (const [dx, dz] of BELT_MASK_TAPS) sum += bilinearInto(px, xM + dx * tex, zM + dz * tex, extentM, scratch)[0];
  const t = Math.min(1, Math.max(0, (sum / BELT_MASK_TAPS.length - BELT_MASK_EDGE.lo) / (BELT_MASK_EDGE.hi - BELT_MASK_EDGE.lo)));
  return t * t * (3 - 2 * t);
}

/** Onshore probe: climate-weather B (advection sea-fog propensity) is sampled `probePx` texels either
 * side of the camera; mobile probes the same rasters, one cell size per tier. */
export const ONSHORE = {
  high: { probePx: 3, cellM: 64 },
  mobile: { probePx: 3, cellM: 128 },
  /** Gradient magnitude (propensity per km) below which the wind direction is not trusted. */
  minGradPerKm: 0.05,
  /** Local propensity that carries the full onshore amplitude. */
  fullPropensity: 0.5,
} as const;

/** 0..1 onshore component of the wind at a point: dot(wind travel, -grad B) on the unit gradient,
 * faded in by the gradient's strength and scaled by the local propensity B. Pure. */
export function onshoreFromGradient(b: number, gradX: number, gradZ: number, windDirXZ: readonly [number, number]): number {
  const g = Math.hypot(gradX, gradZ);
  if (g < 1e-9) return 0;
  const dir = Math.max(0, -(windDirXZ[0] * gradX + windDirXZ[1] * gradZ) / g);
  const trust = Math.min(1, g * 1000 / ONSHORE.minGradPerKm);
  return Math.min(1, dir * trust * Math.min(1, b / ONSHORE.fullPropensity));
}

/** Per-host cache of the onshore inputs (B and its gradient), refreshed only when the camera enters
 * a new cell; the wind dot is per frame (cheap). One instance per sky host (std 8). */
export class OnshoreProbe {
  private cellX = NaN;
  private cellZ = NaN;
  private b = 0;
  private gx = 0;
  private gz = 0;
  private readonly s = [0, 0, 0];
  constructor(private readonly tier: { probePx: number; cellM: number } = ONSHORE.high) {}

  /** Onshore 0..1 at (x, z) for the wind travel direction; 0 until climate-weather decodes. */
  at(base: string, xM: number, zM: number, extentM: number, windDirXZ: readonly [number, number]): number {
    const px = ensure(base, "climate-weather.png");
    return px ? this.atRaster(px, xM, zM, extentM, windDirXZ) : 0;
  }

  /** As `at`, on a decoded climate-weather raster. */
  atRaster(px: RasterPixels, xM: number, zM: number, extentM: number, windDirXZ: readonly [number, number]): number {
    const cx = Math.floor(xM / this.tier.cellM), cz = Math.floor(zM / this.tier.cellM);
    if (cx !== this.cellX || cz !== this.cellZ) {
      this.cellX = cx; this.cellZ = cz;
      const ox = (cx + 0.5) * this.tier.cellM, oz = (cz + 0.5) * this.tier.cellM;
      const d = this.tier.probePx * extentM / Math.max(1, px.w - 1);
      const s = this.s;
      this.b = bilinearInto(px, ox, oz, extentM, s)[2];
      const e = bilinearInto(px, ox + d, oz, extentM, s)[2], w = bilinearInto(px, ox - d, oz, extentM, s)[2];
      const n = bilinearInto(px, ox, oz + d, extentM, s)[2], so = bilinearInto(px, ox, oz - d, extentM, s)[2];
      this.gx = (e - w) / (2 * d); this.gz = (n - so) / (2 * d);
    }
    return onshoreFromGradient(this.b, this.gx, this.gz, windDirXZ);
  }
}

/** climate-air at (x, z) world metres: [humidity, mistPropensity, canopy].
 * Null until the raster decodes (callers keep their previous/default). */
export function climateAirAt(base: string, xM: number, zM: number, extentM: number): [number, number, number] | null {
  return sample(ensure(base, "climate-air.png"), xM, zM, extentM);
}

/** climate-weather at (x, z): [rainAmp, stormExposure, seaFog]. */
export function climateWeatherAt(base: string, xM: number, zM: number, extentM: number): [number, number, number] | null {
  return sample(ensure(base, "climate-weather.png"), xM, zM, extentM);
}

/** climate-vis at (x, z): [orographic belt mask, region extinction /0.02, –]
 * (Phase 8c round 3 — fog locality + region ambient visibility). */
export function climateVisAt(base: string, xM: number, zM: number, extentM: number): [number, number, number] | null {
  return sample(ensure(base, "climate-vis.png"), xM, zM, extentM);
}

/** The published region legend and climate profiles (hydrology-meta.json `regionsLegend`,
 * `climateProfiles`; home table world/sources/climate/climate-regions.json). */
export interface RegionClimateMeta {
  regionsLegend: Record<string, { name: string; rgb: [number, number, number] }>;
  climateProfiles: Record<string, { fog?: RegionFogProfile }>;
}

const rgbKey = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

/** Region class id at (x, z) world metres from the decoded region map: nearest texel (classes are
 * categorical, never blended), transparent = ocean (class 0), an unknown colour = -1. */
export function regionClassAt(px: RasterPixels, xM: number, zM: number, extentM: number,
  classByRgb: ReadonlyMap<number, number>): number {
  const ix = Math.max(0, Math.min(px.w - 1, Math.round((xM / extentM) * (px.w - 1))));
  const iz = Math.max(0, Math.min(px.h - 1, Math.round((zM / extentM) * (px.h - 1))));
  const i = (iz * px.w + ix) * 4, d = px.data;
  if (d[i + 3] === 0) return 0;
  return classByRgb.get(rgbKey(d[i], d[i + 1], d[i + 2])) ?? -1;
}

/** Fog profile of the region under the camera, refreshed only when the camera enters a new cell
 * (allocation-free per frame). One instance per sky host (std 8). Neutral until the map decodes
 * or where the class has no profile. */
export class RegionFogProbe {
  private readonly classByRgb = new Map<number, number>();
  private readonly profileByClass = new Map<number, Readonly<RegionFogProfile>>();
  private cellX = NaN;
  private cellZ = NaN;
  private current: Readonly<RegionFogProfile> = REGION_FOG_NEUTRAL;
  regionClass = -1;
  constructor(meta: RegionClimateMeta, private readonly cellM = 32) {
    for (const [id, row] of Object.entries(meta.regionsLegend)) {
      const cid = Number(id);
      this.classByRgb.set(rgbKey(row.rgb[0], row.rgb[1], row.rgb[2]), cid);
      const fog = meta.climateProfiles[row.name]?.fog;
      if (fog) this.profileByClass.set(cid, Object.freeze({ ...fog }));
    }
  }

  at(base: string, xM: number, zM: number, extentM: number): Readonly<RegionFogProfile> {
    const px = ensure(base, "hydro-regions.png");
    return px ? this.atRaster(px, xM, zM, extentM) : this.current;
  }

  /** As `at`, on a decoded region map. */
  atRaster(px: RasterPixels, xM: number, zM: number, extentM: number): Readonly<RegionFogProfile> {
    const cx = Math.floor(xM / this.cellM), cz = Math.floor(zM / this.cellM);
    if (cx === this.cellX && cz === this.cellZ) return this.current;
    this.cellX = cx; this.cellZ = cz;
    this.regionClass = regionClassAt(px, xM, zM, extentM, this.classByRgb);
    this.current = this.profileByClass.get(this.regionClass) ?? REGION_FOG_NEUTRAL;
    return this.current;
  }
}
