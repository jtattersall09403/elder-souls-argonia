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
import { hash01 } from "./hash";
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
  /** Orographic cloud-belt mask 0..1 (climate-vis R): does terrain near this
   * column climb into the montane belt? Cap cloud forms where moist wind is
   * forced up slopes, so it clings to the massif — free air at belt ALTITUDE
   * over the lowlands carries none (owner round 3: fog volumes are LOCAL). */
  beltMask: number;
  /** Regional ambient-haze extinction, 0..1 = beta 0 … 0.02 per metre
   * (climate-vis G). This is the *baseline* thickness of the air over this
   * kind of country — steamy inner-basin marsh is permanently murkier than a
   * windswept ridge. Owner round 4: region visibility is not a separate
   * system from weather, it is the SLOWEST-MOVING component of local
   * weather; `regionHazeFactor` below is the fast component that breathes it
   * with the hour, the season and the sky. Optional: absent ⇒ a neutral
   * lowland default, so old call sites keep working. */
  regionExtinction?: number;
  /** Terrain elevation, metres (true metres, not vertical-scaled). */
  elevationM: number;
  /** World position, metres — enables the LOCAL component of the airmass
   * clarity wander (airmassFactor). Optional: absent = temporal-only. */
  xM?: number;
  zM?: number;
}

/** Neutral fallback when no climate-vis raster is available: thin air
 * (beta 6e-4/m ≈ 5 km of sight). Deliberately THIN — a missing raster must
 * not silently impose murk on a caller that has no region data. */
export const DEFAULT_REGION_EXTINCTION = 0.03;

/** Extinction (per metre) that a `regionExtinction` channel value means. Kept
 * here because the raster bake, the renderer and this module must agree —
 * `climate-vis` stores beta/REGION_EXTINCTION_MAX. */
export const REGION_EXTINCTION_MAX = 0.02;

/** The three mist regimes (module 55 §97). Each has a LOCAL value at the
 * queried position (for AI/HUD/the camera veil) and a province-wide BASE —
 * the synoptic condition ("it is a sea-fog morning") with the local raster
 * multiplier removed. The renderer takes the BASE and applies locality
 * per-pixel from the climate rasters, so a fog bank is drawn where the fog
 * IS: stand on a summit and look down on the misty valley (owner round 3);
 * the old camera-local strengths made fog follow the camera instead. */
export interface MistRegimes {
  /** Radiation mist at this position: dawn pooling in wet inland basins,
   * dry/recession season, only after a clear calm night. */
  radiation: number;
  /** Radiation condition WITHOUT the local mist-propensity raster. */
  radiationBase: number;
  /** Advection sea fog at this position (coast/estuary corridors). */
  advection: number;
  /** Advection condition WITHOUT the local sea-fog raster. */
  advectionBase: number;
  /** Cloud-forest whiteout AT the queried elevation and column
   * (= bell × whiteoutBase × beltMask). */
  whiteout: number;
  /** Whiteout's weather/state modulator WITHOUT the elevation bell or the
   * orographic mask — the renderer applies both per-pixel so distant peaks
   * wear their cloud collars when the camera is at sea level. */
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
  /** Practical sight distance, metres (min across region air/mist/rain). */
  visibilityM: number;
  /** Live multiplier on this region's baseline air thickness (round 4) — the
   * renderer's ambient-haze uniform and `visibilityM` are both derived from
   * it, so the drawn murk and the published number cannot drift apart. */
  regionHaze: number;
  /** Sight distance from the REGION air alone, metres (no mist/rain). */
  regionVisibilityM: number;
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

/** Lightning needs a storm deck overhead (owner round 2: flashes were
 * firing at full rate from minute 0 of a thunderstorm slot, against a sky
 * still blending in from clear/overcast). Gate by the BLENDED cloud mass so
 * flashes start only once the sky reads stormy. Shared by the sample
 * (wx.lightning) and the renderer's per-frame flash path. */
export function lightningCloudGate(p: {
  cloudLow: number;
  cloudMid: number;
  cloudDensity: number;
}): number {
  return smoothstep01(((p.cloudLow + p.cloudMid) * 0.5 * p.cloudDensity - 0.5) / 0.25);
}

/** Cloud-forest belt profile (owner round 3): an ASYMMETRIC bell over
 * elevation — soft lower skirt (cloud drapes down the flanks), sharp upper
 * edge so the tallest summits (~600–650 m, 6b sculpt) stand ABOVE the cloud
 * like real peaks over a cloud sea. Mass-elevation effect brings tropical
 * cloud forest down to ~400–550 m on small coastal ranges. Shared constants:
 * the aerial shader and the climate-vis bake mirror these numbers. */
export const WHITEOUT_BELT = {
  centreM: 470,
  sigmaBelowM: 150,
  sigmaAboveM: 55,
  /** Terrain columns whose neighbourhood max elevation crosses this band
   * support cap cloud (climate-vis R mask ramp). */
  maskRampLoM: 320,
  maskRampHiM: 450,
} as const;

/**
 * VISIBILITY AS LOCAL WEATHER (owner round 4). The authored per-region
 * sightlines ("900 m on firm lowland") were a static sketch sitting beside
 * the mist/fog work. They are now one system: the region raster supplies the
 * per-place BASELINE (`regionExtinction` — how thick this kind of country's
 * air runs on an average day) and this function supplies the LIVE multiplier
 * that makes it breathe. One number, used by both the renderer's ambient haze
 * and the published `visibilityM`, so what the AI reads is what you see.
 *
 * Grounded in the province climatology (docs/research/black-marsh-climatology
 * .md) — humid tropical lowland air behaves like this:
 *  - humidity is the carrier: the wetter the air, the more it scatters;
 *  - it is murkiest NOT during rain but in the hours AFTER, when standing
 *    water evaporates into hot afternoon air (the marsh "steam");
 *  - rain itself adds its own veil (a separate density in the shader), and
 *    washes aerosol out, so the rain term here is modest;
 *  - the pre-dawn hours are damp and settled — condensation haze — while
 *    midday convective mixing over a dry, breezy ridge scours the air clear;
 *  - wind mixes the boundary layer and thins the murk.
 */
/**
 * Post-8c tweaks (owner 2026-08-30, Phase P backlog holds the follow-ups):
 *
 * WHITEOUT_ENABLED=false — the mountaintop cap cloud is OFF for now: seen
 * from ground level it showed hard square edges (raster-resolution artefacts
 * of the belt mask). It returns, improved, in the polish phase; the bell /
 * base / mask machinery stays live so probes and the re-enable keep working.
 *
 * VISIBILITY_LIFT=0.72 — a global ~30 % thinning of ambient haze/mist ("I
 * like the mist, the density is just a bit too much"). Applied at the SOURCES
 * (region haze factor, mist regime bases, weather fog) so the renderer and
 * the published visibility number move together, per §97's one-authority
 * rule.
 */
export const WHITEOUT_ENABLED = false;
export const VISIBILITY_LIFT = 0.72;

/** Deterministic 1-D value noise on a continuous coordinate (smoothstepped
 * between hashed lattice values — same family as the synoptic hashes). */
function valueNoise1(t: number, salt: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  return hash01(i, salt) * (1 - s) + hash01(i + 1, salt) * s;
}

/**
 * Airmass clarity wander (owner 2026-08-30: "same place at same time on
 * different days looks like it has exactly the same visibility"). The region
 * haze was a deterministic function of clock + static rasters, so it WAS
 * identical across days. Real boundary-layer clarity rides the airmass:
 * subsiding dry days are crisp, stagnant humid days are thick — days-scale
 * autocorrelation, spatially patchy at valley/basin scale. This models it as
 * mean-one multiplicative wander around each place's climatological midpoint
 * (the rasters stay the midpoint; climatology stays in charge):
 *  - between-day: two octaves, ~2.3- and ~6.1-day periods, ±~30 %;
 *  - local patches: ~2.7 km cells drifting on a ~9-day period, ±~20 % — one
 *    basin murky while the next valley is clear, and the pattern moves.
 * Callers pass position via LocalClimate.xM/zM; without it the factor is
 * temporal-only, so old call sites stay deterministic and valid.
 */
export function airmassFactor(epochMinutes: number, xM?: number, zM?: number): number {
  const days = epochMinutes / MINUTES_PER_DAY;
  const temporal =
    0.6 * valueNoise1(days / 2.3, 11) + 0.4 * valueNoise1(days / 6.1, 12);
  let spatial = 0.5;
  if (xM !== undefined && zM !== undefined) {
    const gx = xM / 2700 + 2 * valueNoise1(days / 9.0, 13);
    const gz = zM / 2700 + 2 * valueNoise1(days / 9.0, 17);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const top = hash01(ix, iz, 19) * (1 - sx) + hash01(ix + 1, iz, 19) * sx;
    const bot = hash01(ix, iz + 1, 19) * (1 - sx) + hash01(ix + 1, iz + 1, 19) * sx;
    spatial = top * (1 - sz) + bot * sz;
  }
  return (0.7 + 0.6 * temporal) * (0.8 + 0.4 * spatial);
}

export function regionHazeFactor(p: {
  humidity: number;
  rainIntensity: number;
  wetness: number;
  windSpeedMS: number;
  minuteOfDay: number;
  /** Season scalar −1 (dry) … +1 (wet). */
  season: number;
}): number {
  // Afternoon heat drives evaporation off wet ground → the steam term.
  const dayHeat = Math.exp(-Math.pow((p.minuteOfDay - 870) / 260, 2));
  const steam = p.wetness * dayHeat;
  // Damp settled pre-dawn air (distinct from radiation mist, which is its own
  // regime — this is the thickening that happens even when no bank forms).
  const preDawn = Math.exp(-Math.pow((p.minuteOfDay - 330) / 150, 2));
  // Mechanical mixing: a breeze thins the murk, a calm makes it pool.
  const mixOut = clamp01(1 - 0.05 * (p.windSpeedMS - 2.5)) * 0.35 + 0.65;
  // Afternoon burn-off (owner 2026-08-30): convective mixing after midday
  // visibly CLEARS the air on non-rainy days — morning murk should not
  // survive to 15:00 at full strength. (The steam term can still oppose it
  // over wet ground, which is correct: post-rain afternoons steam.)
  const burnOff = 1 - 0.22 * Math.exp(-Math.pow((p.minuteOfDay - 900) / 210, 2))
    * (1 - clamp01(p.rainIntensity * 2));
  const raw =
    0.45 +
    0.55 * p.humidity +
    0.35 * p.rainIntensity +
    0.6 * steam +
    0.3 * preDawn +
    0.15 * Math.max(0, p.season);
  return Math.min(2.4, Math.max(0.3, raw * mixOut * burnOff)) * VISIBILITY_LIFT;
}

/** Clear-air sight distance from a region extinction and its live factor
 * (Koschmieder, 3/beta at the 5 % contrast threshold). */
export function regionVisibilityM(regionExtinction: number, hazeFactor: number): number {
  const beta = REGION_EXTINCTION_MAX * Math.max(0, regionExtinction) * hazeFactor;
  return beta > 1e-6 ? Math.min(30000, 3 / beta) : 30000;
}

export function whiteoutBell(elevationM: number): number {
  const d = elevationM - WHITEOUT_BELT.centreM;
  const s = d < 0 ? WHITEOUT_BELT.sigmaBelowM : WHITEOUT_BELT.sigmaAboveM;
  return Math.exp(-Math.pow(d / s, 2));
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
  const clearNight = kind === "clear" || kind === "haze" || kind === "fair" ? 1 : undefined;
  const sample = express(syn, epochMinutes, local, PROFILES[kind].lightningPerMin, clearNight);
  sample.wetness = Math.max(sample.wetness, clamp01(0.85 * sample.rainIntensity));
  sample.grip = 1 - 0.35 * sample.wetness;
  return sample;
}

/** Studio force-REGIME previews (owner round 2: the mist regimes are
 * computed conditions, not rolled states, so the force dropdown needs their
 * own entries): "mist" = radiation dawn mist, "fog" = advection sea fog —
 * both force the CONDITION to full strength while locality stays with the
 * climate rasters (owner round 3): force sea fog and the coast/estuaries
 * bank up while the interior stays clear — a fog bank you can look AT, not
 * a province-wide veil. Preview tooling only; the shipped game derives
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
    s.mist.radiationBase = 1;
    s.mist.radiation = clamp01(local.mistProp * 1.15);
    if (s.mist.radiation > 0.05) {
      s.visibilityM = Math.min(s.visibilityM, 140 + (30000 - 140) * Math.pow(1 - s.mist.radiation, 3));
    }
  } else {
    s.mist.advectionBase = 1;
    s.mist.advection = clamp01(local.seaFog);
    if (s.mist.advection > 0.05) {
      s.visibilityM = Math.min(s.visibilityM, 350 + (30000 - 350) * Math.pow(1 - s.mist.advection, 3));
    }
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

  // Wind: exposed coasts run windier than sheltered interior; GUST-FRONT
  // weather (squall lines and thunderstorm outflow alike) hits hardest where
  // the storm-exposure field is high. Round 4: thunderstorms were excluded
  // from that boost, so a storm sea read calmer than a squall sea at the same
  // place — a mature storm's cold pool is the same phenomenon.
  const stormness =
    (syn.state === "thunderstorm" ? syn.blend : 0) + (syn.prev === "thunderstorm" ? 1 - syn.blend : 0);
  // Owner round 4 asked for PARITY, so the coefficient is 1 for both: the two
  // states now drive the sea and the shore surf identically, and differ where
  // the owner said they should — the sky (shelf wall, green cast, lightning)
  // and how long they last.
  const gustFront = squallness + stormness;
  const windSpeedMS = p.windMS * (0.75 + 0.45 * local.stormExposure + 0.4 * gustFront * local.stormExposure);
  const gustiness = clamp01(p.gust * (0.8 + 0.4 * local.stormExposure));

  // --- The three mist regimes (distinct systems, module 55 §97) ---
  const drySeason = 0.5 - 0.5 * s;
  const dawnBell = Math.exp(-Math.pow((minuteOfDay - 360) / 110, 2));
  const duskBell = 0.35 * Math.exp(-Math.pow((minuteOfDay - 1120) / 90, 2));
  const radiationBase = clamp01(
    (dawnBell + duskBell) *
      (0.25 + 0.75 * drySeason) *
      (clearNightOverride ?? clearCalmNightFactor(epochMinutes)) *
      (1 - clamp01(rain * 2)), // rain scrubs radiation mist out
  ) * VISIBILITY_LIFT;
  const radiation = clamp01(local.mistProp * 1.15) * radiationBase;
  // Advection sea fog: humid marine air, strongest mornings and in the wetter
  // half of the year, needs non-violent weather to hold together.
  const morningBell = Math.exp(-Math.pow((minuteOfDay - 420) / 190, 2));
  // Sea fog survives settled skies; convection and rain tear it apart. The
  // fair-weather ladder grades that instead of the old clear/overcast step.
  const settled =
    syn.state === "clear" || syn.state === "haze" || syn.state === "fair"
      ? 1
      : syn.state === "partly"
        ? 0.85
        : syn.state === "broken" || syn.state === "overcast"
          ? 0.7
          : 0.25;
  const holdsTogether = settled;
  const advectionBase = clamp01(
    (0.35 + 0.65 * morningBell) * (0.5 + 0.5 * Math.max(0, s)) * holdsTogether * 0.8,
  ) * VISIBILITY_LIFT;
  const advection = clamp01(local.seaFog) * advectionBase;
  // Cloud-forest whiteout: the belt follows the SYNOPTIC cloud — thick under
  // rainy decks, moderate under overcast, and genuinely CLEAR on settled
  // clear/haze days (owner round 3: no permanent whiteout; nice clear views
  // sometimes — real cloud forest clears when the air is dry and subsiding;
  // the coverage wander gives partly-cloudy days passing wisps for free).
  const cloudDeck = p.cloudMid * p.cloudDensity;
  const whiteoutBase = clamp01(0.95 * smoothstep01((cloudDeck - 0.25) / 0.5) + 0.35 * rain);
  const weatherFog = p.fogMie * (0.6 + 0.4 * local.humidity) * VISIBILITY_LIFT;
  const mist: MistRegimes = {
    radiation,
    radiationBase,
    advection,
    advectionBase,
    // whiteoutBase/bell/mask still computed and published (probes, re-enable),
    // but the expressed strength is zeroed while the cap cloud is off.
    whiteout: WHITEOUT_ENABLED
      ? clamp01(whiteoutBell(local.elevationM) * whiteoutBase * clamp01(local.beltMask))
      : 0,
    whiteoutBase,
    weather: weatherFog,
  };

  // Visibility: the worst offender wins (published to AI/encounters, §97).
  // Cubic ramps (round 3): the old linear maps left half-strength fog with a
  // ~15 km published visibility — fog must register in the number the AI and
  // HUD read as soon as it visibly thickens.
  const visWeather = p.visibilityKm * 1000 * (1 - 0.55 * clamp01(rain));
  const visCurve = (strength: number, denseM: number): number =>
    strength > 0.02 ? denseM + (30000 - denseM) * Math.pow(1 - strength, 3) : 30000;
  const visRad = visCurve(mist.radiation, 140);
  const visAdv = visCurve(mist.advection, 350);
  const visWhite = visCurve(mist.whiteout, 70);
  // Region air (round 4): the baseline thickness of THIS country's air,
  // breathing with the hour/season/sky. Formerly a renderer-only uniform —
  // now the same number reaches the published sight distance, which is what
  // made the two read as separate systems.
  const wetnessNow = clamp01(rainWetness(epochMinutes) * (1 - 0.8 * local.canopy) * (0.4 + 0.8 * local.rainAmp));
  // Airmass wander: day-to-day and basin-to-basin clarity variation around
  // the climatological midpoint (see airmassFactor). Multiplies the region
  // haze, so the renderer's uniform and the published visibility move
  // together, per the one-authority rule.
  const airmass = airmassFactor(epochMinutes, local.xM, local.zM);
  const regionHaze = regionHazeFactor({
    humidity: local.humidity,
    rainIntensity: rain,
    wetness: wetnessNow,
    windSpeedMS,
    minuteOfDay,
    season: s,
  }) * airmass;
  const regionVis = regionVisibilityM(
    local.regionExtinction ?? DEFAULT_REGION_EXTINCTION,
    regionHaze,
  );
  const visibilityM = Math.max(50, Math.min(visWeather, visRad, visAdv, visWhite, regionVis));

  // Wetness: rain trail × how much sky this ground actually sees (computed
  // above, since the region-haze steam term needs it).
  const wetness = wetnessNow;
  const grip = 1 - 0.35 * wetness;

  const sunDim = clamp01(Math.max(p.sunDim, mist.whiteout * 0.9));

  const lightningGate = lightningCloudGate(p);

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
    regionHaze,
    regionVisibilityM: regionVis,
    wetness,
    grip,
    lightning: lightningAt(epochMinutes, forcedLightningRate) * lightningGate,
    sunDim,
  };
}
