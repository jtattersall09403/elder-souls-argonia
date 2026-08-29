import {
  lightningAt,
  lightningCloudGate,
  weatherSampleAt,
  weatherSampleForRegime,
  weatherSampleForState,
  FORCED_REGIMES,
  PROFILES,
  WEATHER_KINDS,
  type ForcedRegime,
  type LocalClimate,
  type WeatherKind,
  type WeatherSample,
} from "@elder-souls/world-weather";
import { climateAirAt, climateVisAt, climateWeatherAt } from "./climateSampler";

/**
 * The studio's weather authority (Phase 8c, decision 0032): one sample per
 * frame from the deterministic weather machine, expressed at the camera
 * against the climate rasters. Both canvases, the light rig, the rain
 * system, the water and the environment query read THIS, so what falls is
 * what wets is what the AI will see. Default mode is `auto` (the calendar
 * timeline — the only mode the game ships); a forced state is studio
 * preview tooling, kept in the URL as `w=`.
 */

/** Forceable: a weather state, or one of the computed mist regimes (round
 * 2 — the regimes are conditions, not rolled states, but the studio needs
 * to preview them on demand: "mist" = radiation dawn mist, "fog" = sea fog). */
export type WeatherOverride = "auto" | WeatherKind | ForcedRegime;

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
  if (!w) return "auto";
  if ((WEATHER_KINDS as readonly string[]).includes(w)) return w as WeatherKind;
  if ((FORCED_REGIMES as readonly string[]).includes(w)) return w as ForcedRegime;
  return "auto";
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
  beltMask: 0,
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
  const vis = climateVisAt(base, xM, zM, extentM);
  const local: LocalClimate = {
    rainAmp: wx?.[0] ?? DEFAULT_LOCAL.rainAmp,
    stormExposure: wx?.[1] ?? DEFAULT_LOCAL.stormExposure,
    seaFog: wx?.[2] ?? DEFAULT_LOCAL.seaFog,
    mistProp: air?.[1] ?? DEFAULT_LOCAL.mistProp,
    humidity: air?.[0] ?? DEFAULT_LOCAL.humidity,
    canopy: air?.[2] ?? DEFAULT_LOCAL.canopy,
    beltMask: vis?.[0] ?? DEFAULT_LOCAL.beltMask,
    elevationM,
  };
  lastSample =
    override === "auto"
      ? weatherSampleAt(epochMinutes, local)
      : (FORCED_REGIMES as readonly string[]).includes(override)
        ? weatherSampleForRegime(override as ForcedRegime, epochMinutes, local)
        : weatherSampleForState(override as WeatherKind, epochMinutes, local);
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
  // The cloud gate (no flashes against a sky still blending in) rides the
  // cached sample — the gate moves over minutes, far slower than the cache
  // quantum, while the flash envelope itself needs per-frame evaluation.
  const gate = lastSample ? lightningCloudGate(lastSample.profile) : 1;
  if (gate <= 0) return 0;
  if (override === "auto") return lightningAt(epochMinutes) * gate;
  if ((FORCED_REGIMES as readonly string[]).includes(override)) return 0;
  const rate = PROFILES[override as WeatherKind].lightningPerMin;
  return rate > 0 ? lightningAt(epochMinutes, rate) * gate : 0;
}
