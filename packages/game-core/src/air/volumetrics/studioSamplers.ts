/**
 * The volumetric medium's inputs from real world data (decision 0112): pure,
 * deterministic functions (0032) the host composes with its own sources.
 * - terrain samplers over the compiled water record (`WaterWorld`): the
 *   water surface and mask, the sea (the graph's `coast` class, 0065: read
 *   the record, never re-derive it) and wet ground (the `marsh` class);
 * - the fog clock: sunrise/sunset from the ephemeris, the previous night's
 *   clear+calm and the hours since rain from the weather machine;
 * - crowns from vegetation instances; the nearest fixture lights.
 */
import * as THREE from "three";
import { sunTimes } from "@elder-souls/world-time";
import type { TerrainSamplers } from "./terrainGrids";
import type { Crown } from "./canopyMap";
import type { VolumeLight } from "./froxelGrid";

// ---------- terrain ----------

/** What the samplers read from the water runtime (`WaterWorld` satisfies it). */
export interface WaterRecordQuery {
  sampleBoundary(x: number, z: number, epochMinutes: number): { depth: number; surfaceHeight: number };
  readonly data: { sample(x: number, z: number): { className: string } };
}

/** The water class the compile takes from the graph as the open sea (waterData `TIDAL_CLASSES`). */
export const SEA_CLASS = "coast";
/** The wet-ground class (the graph's marsh bodies and reaches). */
export const WET_CLASS = "marsh";

export function studioTerrainSamplers(src: {
  groundHeight: (x: number, z: number) => number | null | undefined;
  /** Null until the water record has loaded: no water, no sea, dry. */
  water: () => WaterRecordQuery | null;
  epochMinutes: () => number;
}): TerrainSamplers {
  return {
    groundHeight: (x, z) => src.groundHeight(x, z) ?? 0,
    water: (x, z) => {
      const w = src.water();
      if (!w) return { height: 0, mask: 0 };
      const b = w.sampleBoundary(x, z, src.epochMinutes());
      return { height: b.surfaceHeight, mask: b.depth > 0 ? 1 : 0 };
    },
    seaMask: (x, z) => (src.water()?.data.sample(x, z).className === SEA_CLASS ? 1 : 0),
    wetness: (x, z) => (src.water()?.data.sample(x, z).className === WET_CLASS ? 1 : 0),
  };
}

// ---------- the fog clock ----------

/** The weather at one instant, as the fog field needs it. */
export interface WeatherProbe { rain: number; cloud: number; windSpeedMS: number }
export type WeatherAtEpoch = (epochMinutes: number) => WeatherProbe;

const DAY = 1440;
const RAIN_ON = 0.02;
export const RAIN_STEP_MIN = 15;
export const RAIN_LOOKBACK_H = 6;

/** Today's sunrise and sunset (minutes of day); 06:00/18:00 where the sun never crosses. */
export function sunriseSunsetMin(epochMinutes: number, latitudeRad?: number): { sunriseMin: number; sunsetMin: number } {
  const t = sunTimes(epochMinutes, latitudeRad);
  return { sunriseMin: t.sunrise ?? 360, sunsetMin: t.sunset ?? 1080 };
}

/** The epoch minute of the last night's 03:00 (today's, once past it; else yesterday's). */
export function previousNight0300(epochMinutes: number): number {
  const day = Math.floor(epochMinutes / DAY) * DAY;
  return epochMinutes - day >= 180 ? day + 180 : day - DAY + 180;
}

/** 0..1: no cloud and no wind at the previous night's 03:00. */
export function prevNightClearCalm(epochMinutes: number, weather: WeatherAtEpoch): number {
  const w = weather(previousNight0300(epochMinutes));
  const clear = 1 - Math.min(1, Math.max(0, w.cloud));
  const calm = 1 - Math.min(1, Math.max(0, (w.windSpeedMS - 1) / 4));
  return clear * calm;
}

/** Hours since rain stopped: 0 while raining; stepped back 15 min at a time up to 6 h, else Infinity. */
export function hoursSinceRain(epochMinutes: number, weather: WeatherAtEpoch): number {
  if (weather(epochMinutes).rain > RAIN_ON) return 0;
  const grid = Math.floor(epochMinutes / RAIN_STEP_MIN) * RAIN_STEP_MIN;
  const steps = (RAIN_LOOKBACK_H * 60) / RAIN_STEP_MIN;
  for (let k = 1; k <= steps; k++) {
    const t = grid - (k - 1) * RAIN_STEP_MIN;
    if (t >= epochMinutes) continue;
    if (weather(t).rain > RAIN_ON) return (epochMinutes - t) / 60;
  }
  return Infinity;
}

/**
 * The two look-backs, recomputed once per 15-minute bucket (each is up to 25
 * weather samples; the frame must not pay that). One per host, no module state.
 */
export class FogClockHistory {
  private bucket = Number.NaN;
  private clearCalm = 1;
  private sinceRain = Infinity;
  /** True when this call recomputed (the caller's weather cache was used for other instants). */
  update(epochMinutes: number, weather: WeatherAtEpoch): boolean {
    const b = Math.floor(epochMinutes / RAIN_STEP_MIN);
    if (b === this.bucket) return false;
    this.bucket = b;
    // sampled at the bucket's start, so every frame in it (and every session) agrees
    const t0 = b * RAIN_STEP_MIN;
    this.clearCalm = prevNightClearCalm(t0, weather);
    this.sinceRain = hoursSinceRain(t0, weather);
    return true;
  }
  get prevNightClearCalm(): number { return this.clearCalm; }
  /** Hours since rain at the bucket's start, advanced to `epochMinutes` (0 stays 0 while it rains). */
  hoursSinceRain(epochMinutes: number, rainingNow: boolean): number {
    if (rainingNow) return 0;
    if (!Number.isFinite(this.sinceRain)) return Infinity;
    return this.sinceRain + (epochMinutes - this.bucket * RAIN_STEP_MIN) / 60;
  }
}

// ---------- crowns ----------

/** Crowns near a point, from whatever holds the tree instances; `version`
 * changes when that set changes (cells loaded or evicted), so the host can
 * force the canopy map to rebake. */
export interface CrownSource {
  readonly version: number;
  crowns(x: number, z: number, radiusM: number): Iterable<Crown>;
}

/** Fraction of a tree's height below the crown (trunk clear of leaves). */
export const CROWN_BOTTOM_FRACTION = 0.45;

/** A tree instance's crown: the species' template footprint and height at the instance's scale. */
export function crownOf(x: number, y: number, z: number, scale: number, heightM: number, halfWidthM: number): Crown {
  const h = heightM * scale;
  return { x, z, radiusM: halfWidthM * scale, bottomM: y + h * CROWN_BOTTOM_FRACTION, topM: y + h };
}

// ---------- fixture lights ----------

/** A read over lights: `(x, y, z, radiusM, r, g, b)` per light (FixtureLightField.forEachLight). */
export type LightVisitor = (visit: (x: number, y: number, z: number, radiusM: number, r: number, g: number, b: number) => void) => void;

/**
 * The `max` lights nearest (x, y, z), written into `out` (its entries reused,
 * grown as needed); returns the count. `out.length` is set to the count.
 */
export function nearestVolumeLights(forEach: LightVisitor, x: number, y: number, z: number, max: number, out: VolumeLight[]): number {
  const cand: { d: number; x: number; y: number; z: number; r: number; cr: number; cg: number; cb: number }[] = [];
  forEach((lx, ly, lz, radiusM, r, g, b) => {
    if (r + g + b <= 0) return;
    cand.push({ d: (lx - x) ** 2 + (ly - y) ** 2 + (lz - z) ** 2, x: lx, y: ly, z: lz, r: radiusM, cr: r, cg: g, cb: b });
  });
  cand.sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z);
  const n = Math.min(max, cand.length);
  for (let i = 0; i < n; i++) {
    const c = cand[i];
    const l = out[i] ?? (out[i] = { position: new THREE.Vector3(), radiance: new THREE.Color(), radiusM: 0 });
    l.position.set(c.x, c.y, c.z);
    l.radiance.setRGB(c.cr, c.cg, c.cb);
    l.radiusM = c.r;
  }
  out.length = n;
  return n;
}
