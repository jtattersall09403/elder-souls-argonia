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
import { sunBurn } from "./fogNoise";

/** A region's fog profile (world/sources/climate/climate-regions.json `fog`, published in
 * hydrology-meta `climateProfiles[name].fog`): relative multipliers about 1.0 on the regimes below. */
export interface RegionFogProfile {
  /** Scales the air baseline and the ground fogs' coverage (marsh fog, steam fog, canopy haze). */
  densityScale: number;
  /** Scales the radiation mist's scale height (mistHeightProfile). */
  heightScale: number;
  /** Radiation-mist propensity: scales the clear-calm-night mist. */
  radiationMist: number;
  /** Onshore sea-fog propensity: scales the advected sea fog. */
  seaFog: number;
  /** Scales how fast the climbing sun burns ground fog off. */
  burnOffScale: number;
  /** Added to the climate humidity before the regimes read it. */
  humidityBias: number;
}

/** The profile where no region is known yet (raster still decoding): every regime as authored. */
export const REGION_FOG_NEUTRAL: Readonly<RegionFogProfile> = Object.freeze({
  densityScale: 1, heightScale: 1, radiationMist: 1, seaFog: 1, burnOffScale: 1, humidityBias: 0,
});

export interface FogFieldInput {
  /** Minutes since local midnight (0..1440). */
  minuteOfDay: number;
  /** Today's sunrise and sunset, minutes since midnight. */
  sunriseMin: number;
  sunsetMin: number;
  /** 0..1 synoptic cloud cover now (low + mid + half high); feeds the cap cloud on high ground. */
  cloud?: number;
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
  /** The weather's own expressed radiation-mist strength here, 0..1 (WeatherSample.mist.radiation);
   * the studio's `w=mist` override sets it. It lifts the radiation mist to at least this strength. */
  weatherRadiation?: number;
  /** 0..1: does the wind blow in from the sea here (onshore component). */
  onshore?: number;
  /** The weather's own expressed advection sea-fog strength here, 0..1 (WeatherSample.mist.advection);
   * the studio's `w=fog` override sets it. It lifts the sea fog to at least this strength. */
  weatherAdvection?: number;
  /** Sun elevation above the horizon (deg): the sun burns mist, steam, marsh fog and canopy haze off
   * between 4 and 25 deg (fogNoise sunBurn), less in humid air. Absent: no burn-off. */
  sunElevationDeg?: number;
  /** The weather's live region-haze factor here (world-weather regionHazeFactor x airmass, WeatherSample.
   * regionHaze): humid, rainy and steaming air thickens it, the afternoon burn-off thins it. Scales the
   * air baseline about REGION_HAZE_REF. Absent: 1 x the baseline. */
  regionHaze?: number;
  /** Game day number (floor of epoch minutes / 1440): re-phases the fog's slow modulators each day. */
  dayIndex?: number;
  /** The fog profile of the region under the camera (RegionFogProbe). Absent: REGION_FOG_NEUTRAL. */
  profile?: Readonly<RegionFogProfile>;
}

export interface FogRegimes {
  radiationMist: number;
  steamFog: number;
  marshFog: number;
  seaFog: number;
  canopyHaze: number;
  /** Baseline extinction multiplier (1 = the air baseline). */
  air: number;
  /** 0..1: how damp the air is for lamp halos (humidity, mist, sea fog); volumetricNodes LAMP_HALO turns
   * it into the halo medium's floor extinction, so damp nights wear halos under a clear sky. */
  halo: number;
  /** Advection velocity of the noise, m/s, XZ. */
  windXZ: [number, number];
  /** The region's radiation-mist scale-height multiplier (mistHeightProfile's `heightScale`). */
  heightScale?: number;
  /** Radiation-mist top as a share of its dawn depth: 1 - 0.8 sunBurn, so the top sinks as the sun climbs. */
  mistDepthScale?: number;
  /** 0..1 sun burn-off weight (sunBurn x region burnOffScale): rims and edges clear first by this. */
  mistBurn?: number;
  /** Rain-fed wet haze over the ground, 0..4 (4 x rain), at WET_HAZE_SCALE_M scale height. */
  wetHaze?: number;
  /** 0..1 cap cloud on high ground: synoptic cloud x humidity (vol10 diag7 O8). */
  capCloud?: number;
}

/** Scale height (m) of the rain-fed wet haze above the ground (vol10 diag7 O2). */
export const WET_HAZE_SCALE_M = 40;
/** Halo dampness floor on a humid night (humidity > 0.5, sun below the horizon; vol10 diag7 O7). */
export const NIGHT_HALO_FLOOR = 0.4;

/** regionHaze at which the froxel air equals its humidity/rain baseline: an average humid lowland
 * morning (0.9 raw x VISIBILITY_LIFT 0.72 ~ 0.65). The air scales by regionHaze / this, clamped. */
export const REGION_HAZE_REF = 0.65;
export const REGION_HAZE_SCALE = { min: 0.4, max: 2.5 } as const;
/** Share of the ground mists (radiation, steam, canopy haze) rain keeps: rain thins them, it never
 * deletes them, and its depth haze comes through the air term. */
export const RAIN_MIST_KEEP = 0.35;

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

/** Scale height of the radiation mist as a share of its depth: density falls by e every depth/5 above
 * the basin floor (30 m deep → 6 m), so it is thick at the floor and the water and thin by mid-depth. */
export const MIST_SCALE_SHARE = 0.2;
/** The mist fades out over the top 40 % of its depth, reaching zero at the top. */
export const MIST_FADE_SHARE = 0.4;

/** Vertical weight (0..1) of the radiation mist at `hAboveFloor` metres over the basin floor for a pool
 * `depthM` deep: exponential fall from the floor, faded to zero by the top. froxelGrid's density() is
 * the TSL twin (the top there is billowed by the noise). */
export function mistHeightProfile(hAboveFloor: number, depthM: number, heightScale = 1): number {
  const d = Math.max(depthM, 1e-3);
  const h = Math.max(hAboveFloor, 0);
  return Math.exp(-h / (d * MIST_SCALE_SHARE * Math.max(heightScale, 1e-3))) * (1 - smooth(d * (1 - MIST_FADE_SHARE), d, h));
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

/** The regimes as a fresh object (tests, harness); per frame use `fogRegimesInto`. */
export function fogRegimes(i: FogFieldInput): FogRegimes {
  return fogRegimesInto({ radiationMist: 0, steamFog: 0, marshFog: 0, seaFog: 0, canopyHaze: 0, air: 1, halo: 0, windXZ: [0, 0] }, i);
}

/** Write the regimes into `out` (allocation-free). Each regime is a coverage target 0..1: froxelGrid
 * eases it (FogDrift) and burns the shape noise off at threshold 1 - coverage. */
export function fogRegimesInto(out: FogRegimes, i: FogFieldInput, sunElevationDeg = i.sunElevationDeg): FogRegimes {
  const hSunrise = hoursFrom(i.minuteOfDay, i.sunriseMin);
  const hSunset = hoursFrom(i.minuteOfDay, i.sunsetMin);
  const wind = Math.max(0, i.windSpeedMS);
  // mist needs still air: gone above ~5 m/s
  const calm = 1 - smooth(1.5, 5, wind);
  // rain feeds ground fog even in rain-state wind (5-7 m/s, where calm is 0): marsh and mist keep half the rain
  const groundCalm = Math.max(calm, 0.5 * clamp01(i.rain));
  const rainDamp = 1 - (1 - RAIN_MIST_KEEP) * clamp01(i.rain * 1.5);
  const p = i.profile ?? REGION_FOG_NEUTRAL;
  const humid = clamp01(i.humidity + p.humidityBias);
  // the sun burns ground fog off as it climbs (4..25 deg); humid air slows it but never holds more than 15 %
  const burnW = sunElevationDeg === undefined ? 0 : clamp01(sunBurn(sunElevationDeg) * p.burnOffScale);
  const sunKeep = 1 - burnW * (1 - 0.15 * humid);

  const dawn = dawnEnvelope(hSunrise, 3, 2.5);
  const radiationMist = Math.max(clamp01(i.weatherRadiation ?? 0),
    clamp01(clamp01(i.prevNightClearCalm) * dawn * groundCalm * (0.4 + 0.6 * humid) * p.radiationMist)) * rainDamp * sunKeep;

  const steamDawn = dawnEnvelope(hSunrise, 2, 2);
  const steamFog = p.densityScale * steamDawn * calm * (0.3 + 0.7 * clamp01(i.prevNightClearCalm)) * rainDamp * sunKeep;

  const dusk = Math.max(0, 1 - Math.abs(hSunset - 0.75) / 1.75);
  const marshFog = p.densityScale * Math.max(dawnEnvelope(hSunrise, 2.5, 2), dusk) * groundCalm * (0.35 + 0.65 * humid)
    * (0.6 + 0.4 * clamp01(i.wetSeason)) * sunKeep;

  const onshore = clamp01(i.onshore ?? 0);
  const seaFog = Math.max(clamp01(i.weatherAdvection ?? 0),
    clamp01(onshore * smooth(0.6, 0.95, humid) * (1 - smooth(8, 14, wind)) * (0.5 + 0.5 * clamp01(i.wetSeason)) * p.seaFog));

  const afterRain = Number.isFinite(i.hoursSinceRain)
    ? smooth(0, 0.5, i.hoursSinceRain) * (1 - smooth(1.5, 2.5, i.hoursSinceRain))
    : 0;
  const humidMorning = dawnEnvelope(hSunrise, 1, 3) * smooth(0.5, 0.9, humid);
  const canopyHaze = clamp01((0.25 + Math.max(afterRain, humidMorning) * 0.75 * sunKeep) * rainDamp * p.densityScale);

  const hazeScale = i.regionHaze === undefined ? 1
    : Math.min(REGION_HAZE_SCALE.max, Math.max(REGION_HAZE_SCALE.min, i.regionHaze / REGION_HAZE_REF));
  const air = (1 + 2 * humid + 3 * clamp01(i.rain)) * hazeScale * p.densityScale;
  const night = sunElevationDeg !== undefined && sunElevationDeg < 0 && humid > 0.5 ? NIGHT_HALO_FLOOR : 0;
  const halo = Math.max(night, smooth(0.55, 0.95, humid), radiationMist, clamp01(marshFog), seaFog, clamp01(i.rain));
  // noise drifts at the wind speed, floored so still air still mutates slowly
  const drift = Math.max(0.3, wind);
  out.radiationMist = radiationMist; out.steamFog = clamp01(steamFog); out.marshFog = clamp01(marshFog); out.seaFog = seaFog;
  out.canopyHaze = canopyHaze; out.air = air; out.halo = halo; out.heightScale = p.heightScale;
  out.mistDepthScale = 1 - 0.8 * burnW; out.mistBurn = burnW; out.wetHaze = 4 * clamp01(i.rain);
  out.capCloud = clamp01(i.cloud ?? 0) * humid;
  out.windXZ[0] = i.windDirXZ[0] * drift; out.windXZ[1] = i.windDirXZ[1] * drift;
  return out;
}
