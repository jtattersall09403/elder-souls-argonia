import {
  lightningAt,
  weatherSampleAt,
  weatherSampleForState,
  PROFILES,
  WEATHER_KINDS,
  type LocalClimate,
  type WeatherKind,
  type WeatherSample,
} from "@elder-souls/world-weather";
import { climateAirAt, climateWeatherAt } from "./climateSampler";

/**
 * The studio's weather authority (Phase 8c, decision 0032): one sample per
 * frame from the deterministic weather machine, expressed at the camera
 * against the climate rasters. Both canvases, the light rig, the rain
 * system, the water and the environment query read THIS, so what falls is
 * what wets is what the AI will see. Default mode is `auto` (the calendar
 * timeline — the only mode the game ships); a forced state is studio
 * preview tooling, kept in the URL as `w=`.
 */

export type WeatherOverride = "auto" | WeatherKind;

let override: WeatherOverride = "auto";
const listeners = new Set<() => void>();
let version = 0;

export function setWeatherOverride(v: WeatherOverride): void {
  override = v;
  version += 1;
  listeners.forEach((fn) => fn());
}
export function getWeatherOverride(): WeatherOverride {
  return override;
}
export function subscribeWeather(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function weatherVersion(): number {
  return version;
}

export function parseWeatherParam(w: string | null): WeatherOverride {
  return w && (WEATHER_KINDS as readonly string[]).includes(w) ? (w as WeatherKind) : "auto";
}

/** Last computed sample — HUD/debug/env-query read this between updates. */
let lastSample: WeatherSample | null = null;
let lastKey = "";

const DEFAULT_LOCAL: LocalClimate = {
  rainAmp: 0.6,
  stormExposure: 0.2,
  seaFog: 0.2,
  mistProp: 0.5,
  humidity: 0.6,
  canopy: 0.3,
  elevationM: 10,
};

/**
 * Weather at (x, z) for the current instant. Cached on (quantised epoch,
 * ~30 m position, override) — the machine costs a few dozen hash lookups per
 * genuine recompute, nothing per cached frame.
 */
export function weatherAt(
  base: string,
  epochMinutes: number,
  xM: number,
  zM: number,
  extentM: number,
  /** Terrain/camera elevation in TRUE metres (vertical scale removed). */
  elevationM: number,
): WeatherSample {
  const key = `${override}:${Math.round(epochMinutes * 20)}:${Math.round(xM / 30)}:${Math.round(zM / 30)}:${Math.round(elevationM / 25)}`;
  if (lastSample && key === lastKey) return lastSample;
  const air = climateAirAt(base, xM, zM, extentM);
  const wx = climateWeatherAt(base, xM, zM, extentM);
  const local: LocalClimate = {
    rainAmp: wx?.[0] ?? DEFAULT_LOCAL.rainAmp,
    stormExposure: wx?.[1] ?? DEFAULT_LOCAL.stormExposure,
    seaFog: wx?.[2] ?? DEFAULT_LOCAL.seaFog,
    mistProp: air?.[1] ?? DEFAULT_LOCAL.mistProp,
    humidity: air?.[0] ?? DEFAULT_LOCAL.humidity,
    canopy: air?.[2] ?? DEFAULT_LOCAL.canopy,
    elevationM,
  };
  lastSample =
    override === "auto"
      ? weatherSampleAt(epochMinutes, local)
      : weatherSampleForState(override, epochMinutes, local);
  lastKey = key;
  return lastSample;
}

/** The most recent sample without recomputing (env query, HUD). */
export function lastWeatherSample(): WeatherSample | null {
  return lastSample;
}

/** Lightning flash envelope, evaluated per frame (flashes are ~1.2 s wide —
 * far finer than the sample cache quantum). */
export function lightningNow(epochMinutes: number): number {
  if (override === "auto") return lightningAt(epochMinutes);
  const rate = PROFILES[override].lightningPerMin;
  return rate > 0 ? lightningAt(epochMinutes, rate) : 0;
}
