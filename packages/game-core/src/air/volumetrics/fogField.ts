/**
 * The fog field (decision 0112 §4): where and when each fog regime is
 * present, as a pure, deterministic function of the clock, the weather and
 * the local climate. The GPU shapes each regime from the terrain grids; this
 * only says how strong each one is right now, and which way the air drifts.
 *
 * Regimes (tooling/.reports/16k/walk6/vol-research-climate.md):
 * - radiation mist: pools in basins after a clear, calm night; ramps from
 *   3 h before sunrise, peaks at sunrise, gone 2.5 h after;
 * - steam fog: wisps over water on cool dawns;
 * - marsh ground fog: at dawn and dusk over wet ground;
 * - sea fog: onshore wind, humid air;
 * - canopy haze: humid mornings and 30–90 min after rain;
 * - air baseline: always, so shafts and halos have a medium.
 */

export interface FogFieldInput {
  /** Minutes since local midnight (0..1440). */
  minuteOfDay: number;
  /** Today's sunrise and sunset, minutes since midnight. */
  sunriseMin: number;
  sunsetMin: number;
  /** 0..1: how clear and calm the previous night was (1 = no cloud, no wind). */
  prevNightClearCalm: number;
  /** Hours since rain last stopped (Infinity when none recent); 0 while raining. */
  hoursSinceRain: number;
  /** Rain intensity now, 0..1. */
  rain: number;
  windSpeedMS: number;
  /** Travel direction of the wind, XZ unit vector. */
  windDirXZ: readonly [number, number];
  /** Regional climate humidity, 0..1. */
  humidity: number;
  /** 0 dry season .. 1 wet season. */
  wetSeason: number;
  /** The weather state's name; `ground-mist` forces the mist regimes. */
  weatherState?: string;
  /** 0..1: does the wind blow in from the sea here (onshore component). */
  onshore?: number;
}

export interface FogRegimes {
  radiationMist: number;
  steamFog: number;
  marshFog: number;
  seaFog: number;
  canopyHaze: number;
  /** Baseline extinction multiplier (1 = the air baseline). */
  air: number;
  /** Advection velocity of the noise, m/s, XZ. */
  windXZ: [number, number];
}

/** Mist kept over bone-dry ground; wet ground or standing water carries it all (froxelGrid's moistW). */
export const MOISTURE_FLOOR = 0.25;

/** Weight of the radiation mist on ground of moisture `m` (0 dry .. 1 wet or water), squared as in
 * fable5-world-demo src/gpu/passes/Froxels.ts:148 @ fd75fdb7 (MIT): mist pools over wet basins and
 * thins on dry slopes. The moisture is the frozen water record's marsh class and water mask
 * (studioSamplers.ts), never re-derived (0065/0066). */
export function moistureWeight(m: number): number {
  const c = clamp01(m);
  return MOISTURE_FLOOR + (1 - MOISTURE_FLOOR) * c * c;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Signed hours from `eventMin` to `minuteOfDay`, wrapped into -12..12. */
function hoursFrom(minuteOfDay: number, eventMin: number): number {
  let d = (minuteOfDay - eventMin) / 60;
  while (d > 12) d -= 24;
  while (d < -12) d += 24;
  return d;
}

/** Dawn envelope: ramps in from `leadH` before sunrise, peak at sunrise, gone `tailH` after. */
function dawnEnvelope(h: number, leadH: number, tailH: number): number {
  if (h <= 0) return smooth(-leadH, 0, h);
  return 1 - smooth(0, tailH, h);
}

export function fogRegimes(i: FogFieldInput): FogRegimes {
  const hSunrise = hoursFrom(i.minuteOfDay, i.sunriseMin);
  const hSunset = hoursFrom(i.minuteOfDay, i.sunsetMin);
  const wind = Math.max(0, i.windSpeedMS);
  // mist needs still air: gone above ~5 m/s
  const calm = 1 - smooth(1.5, 5, wind);
  const forced = i.weatherState === "ground-mist" ? 1 : 0;
  const rainDamp = 1 - clamp01(i.rain * 1.5);
  const humid = clamp01(i.humidity);

  const dawn = dawnEnvelope(hSunrise, 3, 2.5);
  const radiationMist = Math.max(forced, clamp01(i.prevNightClearCalm) * dawn * calm * (0.4 + 0.6 * humid)) * rainDamp;

  const steamDawn = dawnEnvelope(hSunrise, 2, 2);
  const steamFog = Math.max(forced * 0.8, steamDawn * calm * (0.3 + 0.7 * clamp01(i.prevNightClearCalm))) * rainDamp;

  const dusk = Math.max(0, 1 - Math.abs(hSunset - 0.75) / 1.75);
  const marshFog = Math.max(forced, Math.max(dawnEnvelope(hSunrise, 2.5, 2), dusk) * calm * (0.35 + 0.65 * humid)
    * (0.6 + 0.4 * clamp01(i.wetSeason)));

  const onshore = clamp01(i.onshore ?? 0);
  const seaFog = onshore * smooth(0.6, 0.95, humid) * (1 - smooth(8, 14, wind)) * (0.5 + 0.5 * clamp01(i.wetSeason));

  const afterRain = Number.isFinite(i.hoursSinceRain)
    ? smooth(0, 0.5, i.hoursSinceRain) * (1 - smooth(1.5, 2.5, i.hoursSinceRain))
    : 0;
  const humidMorning = dawnEnvelope(hSunrise, 1, 3) * smooth(0.5, 0.9, humid);
  const canopyHaze = clamp01(0.25 + Math.max(afterRain, humidMorning) * 0.75) * rainDamp;

  const air = 1 + 2 * humid + 3 * clamp01(i.rain);
  // noise drifts at the wind speed, floored so still air still mutates slowly
  const drift = Math.max(0.3, wind);
  return {
    radiationMist, steamFog, marshFog, seaFog, canopyHaze, air,
    windXZ: [i.windDirXZ[0] * drift, i.windDirXZ[1] * drift],
  };
}
