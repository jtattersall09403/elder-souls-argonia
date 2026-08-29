/**
 * Local expression (module 55 §98): the single synoptic state reads
 * differently by place — the same "downpour" is a wall of water in the
 * high-rain interior and a grey drizzle in the NW rain shadow; a squall is
 * violence on the open Padomaic coast and gusty overcast inland. The region
 * weighting the master plan asks for enters HERE, through the climate fields,
 * so weather stays spatially coherent (no state pops at region borders) while
 * regions keep distinct weather character. Fixed-difficulty rule (0004):
 * everything is world state on the calendar, never scaled to the player.
 */

import {
  applyCoverWander,
  clearCalmNightFactor,
  lightningAt,
  rainWetness,
  synopticAt,
  windDirAt,
  type SynopticSample,
} from "./synoptic";
import { PROFILES, type StateProfile, type WeatherKind } from "./states";
import { MINUTES_PER_DAY, seasonScalar, fromEpochMinutes, dayOfYear } from "@elder-souls/world-time";

/** Climate-field values at a position — sampled from climate-air.png (RGB =
 * humidity/mist/canopy) and climate-weather.png (RGB = rain amplitude /
 * storm exposure / advection sea-fog), plus terrain elevation. */
export interface LocalClimate {
  /** Rain amplitude R 0..1 (climatology §3): windward + coastal moisture. */
  rainAmp: number;
  /** Storm exposure X 0..1: open-ocean coast high, placid bays/inland low. */
  stormExposure: number;
  /** Advection sea-fog propensity 0..1: coasts and up-estuary corridors. */
  seaFog: number;
  /** Radiation-mist propensity 0..1 (climate-air G: wet inland basins). */
  mistProp: number;
  /** Relative humidity 0..1 (climate-air R). */
  humidity: number;
  /** Canopy closure 0..1 (climate-air B) — suppresses rain/wetness under it. */
  canopy: number;
  /** Terrain elevation, metres (true metres, not vertical-scaled). */
  elevationM: number;
}

/** The three mist regimes (module 55 §97) — distinct systems, 0..1 each. */
export interface MistRegimes {
  /** Radiation mist: dawn pooling in wet inland basins, dry/recession season,
   * only after a clear calm night. */
  radiation: number;
  /** Advection sea fog rolling up estuaries. */
  advection: number;
  /** Cloud-forest whiteout AT the queried elevation (= bell × whiteoutBase). */
  whiteout: number;
  /** Whiteout's weather/state modulator WITHOUT the elevation bell — the
   * renderer applies the bell per-pixel so distant peaks stay fogged when
   * the camera is at sea level. */
  whiteoutBase: number;
  /** Weather fog/haze from the current state (rain veil, dry haze). */
  weather: number;
}

export interface WeatherSample {
  /** Dominant state (for UI/audio/AI); parameters below are what to render. */
  state: WeatherKind;
  prev: WeatherKind;
  blend: number;
  spellKind: SynopticSample["spellKind"];
  /** Blended synoptic parameter block (province-wide). */
  profile: StateProfile;
  /** Local precipitation strength 0..1 after rain-amplitude expression. */
  rainIntensity: number;
  /** Wind: travel direction (XZ unit), speed m/s, gust fraction 0..1. */
  windDirXZ: [number, number];
  windSpeedMS: number;
  gustiness: number;
  mist: MistRegimes;
  /** Practical sight distance, metres (min across air/mist/rain). */
  visibilityM: number;
  /** Ground wetness 0..1 (rain trail, decays over tens of minutes). */
  wetness: number;
  /** Traction 0..1 (1 dry): published for Phase 9 climbing/boats, not yet
   * consumed by locomotion. */
  grip: number;
  /** Lightning flash envelope 0..1 at this instant. */
  lightning: number;
  /** Direct-sun dimming 0..1 (clouds + in-cloud whiteout). */
  sunDim: number;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function smoothstep01(x: number): number {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

/** Cloud-forest belt: bell over elevation. Summits reach ~650 m (6b sculpt);
 * the belt sits on the upper mountain flanks (mass-elevation effect brings
 * tropical cloud forest down to ~500–700 m on small coastal ranges). */
export function whiteoutBell(elevationM: number): number {
  return Math.exp(-Math.pow((elevationM - 520) / 130, 2));
}

export function weatherSampleAt(epochMinutes: number, local: LocalClimate): WeatherSample {
  return express(synopticAt(epochMinutes), epochMinutes, local, undefined);
}

/** Studio force-state preview (the Skyrim `fw` path, module 55 tooling):
 * expresses `kind` at full blend regardless of the calendar timeline —
 * wetness and lightning are synthesized so a forced storm previews wet
 * ground and flashes. The shipped game only ever uses the auto timeline. */
export function weatherSampleForState(
  kind: WeatherKind,
  epochMinutes: number,
  local: LocalClimate,
): WeatherSample {
  const slot = Math.floor(epochMinutes / 90);
  const syn: SynopticSample = {
    prev: kind,
    state: kind,
    blend: 1,
    // Forced states keep the coverage wander (a forced clear day still
    // drifts its scattered cumulus).
    profile: applyCoverWander(PROFILES[kind], epochMinutes),
    spellKind: "fair",
    slot,
    minutesIntoSlot: epochMinutes - slot * 90,
  };
  // Forced clear/haze also treats last night as clear so the dawn-mist
  // presets preview mist regardless of what the auto timeline rolled.
  const clearNight = kind === "clear" || kind === "haze" ? 1 : undefined;
  const sample = express(syn, epochMinutes, local, PROFILES[kind].lightningPerMin, clearNight);
  sample.wetness = Math.max(sample.wetness, clamp01(0.85 * sample.rainIntensity));
  sample.grip = 1 - 0.35 * sample.wetness;
  return sample;
}

/** Studio force-REGIME previews (owner round 2: the mist regimes are
 * computed conditions, not rolled states, so the force dropdown needs their
 * own entries): "mist" = radiation dawn mist at full strength, "fog" =
 * advection sea fog at full strength — both expressed over a calm clear
 * state, drawn where the respective climate rasters allow (basins /
 * coast-estuary corridors). Preview tooling only; the shipped game derives
 * regimes from the calendar. */
export type ForcedRegime = "mist" | "fog";
export const FORCED_REGIMES: readonly ForcedRegime[] = ["mist", "fog"];

export function weatherSampleForRegime(
  regime: ForcedRegime,
  epochMinutes: number,
  local: LocalClimate,
): WeatherSample {
  const s = weatherSampleForState("clear", epochMinutes, local);
  if (regime === "mist") {
    s.mist.radiation = 1;
    s.visibilityM = Math.min(s.visibilityM, 140);
  } else {
    s.mist.advection = 1;
    s.visibilityM = Math.min(s.visibilityM, 350);
  }
  return s;
}

function express(
  syn: SynopticSample,
  epochMinutes: number,
  local: LocalClimate,
  forcedLightningRate: number | undefined,
  clearNightOverride?: number,
): WeatherSample {
  const p = syn.profile;
  const inst = fromEpochMinutes(epochMinutes);
  const s = seasonScalar(dayOfYear(inst.month, inst.day));
  const minuteOfDay = ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  // Rain: local amplitude expression. A squall's precipitation core is a
  // coastal phenomenon — inland it passes as wind and a brief spatter.
  let rain = p.rain * (0.35 + 0.95 * local.rainAmp);
  const squallness =
    (syn.state === "squall" ? syn.blend : 0) + (syn.prev === "squall" ? 1 - syn.blend : 0);
  rain *= 1 - squallness * (1 - (0.4 + 0.6 * local.stormExposure));
  // Precipitation begin-fade-in (owner round 2: "no rain without clouds"):
  // rain only falls once the blended deck has actually arrived — the
  // Bethesda 80%-transitioned rule, keyed on cloud mass so it also covers
  // the transition OUT of a rainy state (deck leaves, rain stops with it).
  const cloudMass = (p.cloudMid + 0.6 * p.cloudLow) * p.cloudDensity;
  rain *= smoothstep01((cloudMass - 0.45) / 0.3);
  rain = clamp01(rain);

  // Wind: exposed coasts run windier than sheltered interior; squall wind
  // hits hardest where the storm-exposure field is high.
  const windSpeedMS = p.windMS * (0.75 + 0.45 * local.stormExposure + 0.4 * squallness * local.stormExposure);
  const gustiness = clamp01(p.gust * (0.8 + 0.4 * local.stormExposure));

  // --- The three mist regimes (distinct systems, module 55 §97) ---
  const drySeason = 0.5 - 0.5 * s;
  const dawnBell = Math.exp(-Math.pow((minuteOfDay - 360) / 110, 2));
  const duskBell = 0.35 * Math.exp(-Math.pow((minuteOfDay - 1120) / 90, 2));
  const radiation =
    clamp01(local.mistProp * 1.15) *
    (dawnBell + duskBell) *
    (0.25 + 0.75 * drySeason) *
    (clearNightOverride ?? clearCalmNightFactor(epochMinutes)) *
    (1 - clamp01(rain * 2)); // rain scrubs radiation mist out
  // Advection sea fog: humid marine air, strongest mornings and in the wetter
  // half of the year, needs non-violent weather to hold together.
  const morningBell = Math.exp(-Math.pow((minuteOfDay - 420) / 190, 2));
  const holdsTogether = syn.state === "clear" || syn.state === "overcast" || syn.state === "haze" ? 1 : 0.25;
  const advection =
    clamp01(local.seaFog) * (0.35 + 0.65 * morningBell) * (0.5 + 0.5 * Math.max(0, s)) * holdsTogether * 0.8;
  // Cloud-forest whiteout: the montane belt fogs whenever weather brings
  // cloud, and clears to thin wisps on settled days (owner round 2: the old
  // ≥0.55 floor put an opaque band on every clear-day summit — the "black
  // caps"/"purple layer" reports — real cloud forest clears when the
  // synoptic air is dry and subsiding).
  const whiteoutBase = clamp01(
    0.12 +
      0.8 * clamp01(p.cloudMid * p.cloudDensity * 0.9 + rain * 0.5) -
      0.1 * (syn.state === "haze" ? 1 : 0),
  );
  const weatherFog = p.fogMie * (0.6 + 0.4 * local.humidity);
  const mist: MistRegimes = {
    radiation: clamp01(radiation),
    advection: clamp01(advection),
    whiteout: clamp01(whiteoutBell(local.elevationM) * whiteoutBase),
    whiteoutBase,
    weather: weatherFog,
  };

  // Visibility: the worst offender wins (published to AI/encounters, §97).
  const visWeather = p.visibilityKm * 1000 * (1 - 0.55 * clamp01(rain));
  const visRad = mist.radiation > 0.02 ? 30000 - (30000 - 140) * mist.radiation : 30000;
  const visAdv = mist.advection > 0.02 ? 30000 - (30000 - 350) * mist.advection : 30000;
  const visWhite = mist.whiteout > 0.02 ? 30000 - (30000 - 70) * mist.whiteout : 30000;
  const visibilityM = Math.max(50, Math.min(visWeather, visRad, visAdv, visWhite));

  // Wetness: rain trail × how much sky this ground actually sees.
  const wetness = clamp01(rainWetness(epochMinutes) * (1 - 0.8 * local.canopy) * (0.4 + 0.8 * local.rainAmp));
  const grip = 1 - 0.35 * wetness;

  const sunDim = clamp01(Math.max(p.sunDim, mist.whiteout * 0.9));

  // Lightning needs a storm deck overhead (owner round 2: flashes were
  // firing at full rate from minute 0 of a thunderstorm slot, against a sky
  // still blending in from clear/overcast). Gate by the BLENDED cloud mass
  // so flashes start only once the sky reads stormy.
  const lightningGate = smoothstep01(
    ((p.cloudLow + p.cloudMid) * 0.5 * p.cloudDensity - 0.5) / 0.25,
  );

  return {
    state: syn.blend < 0.5 ? syn.prev : syn.state,
    prev: syn.prev,
    blend: syn.blend,
    spellKind: syn.spellKind,
    profile: p,
    rainIntensity: rain,
    windDirXZ: windDirAt(epochMinutes),
    windSpeedMS,
    gustiness,
    mist,
    visibilityM,
    wetness,
    grip,
    lightning: lightningAt(epochMinutes, forcedLightningRate) * lightningGate,
    sunDim,
  };
}
