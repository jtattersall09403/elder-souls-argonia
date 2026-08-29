/**
 * Weather states and their computed parameter blocks (module 55 §98): the
 * Bethesda WTHR record is the checklist of what a state must say, but the
 * values here are *inputs to computation* — the sky model and climate fields
 * turn them into final light/fog/cloud numbers at runtime. Ground mist is NOT
 * a rolled state: the three mist regimes are derived conditions (research doc
 * weather-clouds-rain-threejs §5.2 — radiation mist requires last night to
 * have been clear), computed in express.ts.
 */

export type WeatherKind =
  | "clear"
  | "haze" // dry-season haze
  | "overcast"
  | "rain" // steady monsoonal rain
  | "downpour" // monsoonal wall of water
  | "squall" // fast-moving gust front (sea/coast expression strongest)
  | "thunderstorm"; // afternoon convective storm

export const WEATHER_KINDS: readonly WeatherKind[] = [
  "clear",
  "haze",
  "overcast",
  "rain",
  "downpour",
  "squall",
  "thunderstorm",
];

/** Numeric parameter block; every field blends linearly between states. */
export interface StateProfile {
  /** Cloud coverage by layer, 0..1: low scud, mid deck, high cirrus. */
  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;
  /** Cloud opacity/thickness 0..1. */
  cloudDensity: number;
  /** 0 bright-lit cloud → 1 storm-black bases. */
  cloudDark: number;
  /** Cloud character (owner round 2 / research §8): 0 = featureless
   * nimbostratus sheet, 1 = crisp hard-edged fair-weather cumulus. Drives
   * the coverage-remap softness and contrast in the dome shader. */
  cloudPuff: number;
  /** Cloud scroll-speed multiplier (storm winds aloft read fast). */
  cloudScroll: number;
  /** Squall shelf-wall: directional coverage/darkness asymmetry 0..1 —
   * a near-black advancing wall on the downwind horizon, lighter behind. */
  stormFront: number;
  /** Thunderstorm green-grey shift 0..1 (reads in the brighter cloud tones). */
  greenTint: number;
  /** Day-to-day coverage wander amplitude: slow deterministic jitter applied
   * to the layer coverages in synopticAt, so two "clear" or "overcast" slots
   * differ (a few fluffy clouds vs a broken deck) without a state change. */
  covJitter: number;
  /** Fraction of direct sunlight removed by the deck (drives shadows too). */
  sunDim: number;
  /** Overcast sky becomes the light source: extra ambient share 0..1. */
  ambientLift: number;
  /** Sky colour desaturation toward grey 0..1. */
  skyGrey: number;
  /** Extra boundary-layer Mie density multiplier (weather fog/haze). */
  fogMie: number;
  /** Clear-air sight distance under this weather, km (before mist regimes). */
  visibilityKm: number;
  /** Precipitation strength 0..1 (before local rain-amplitude expression). */
  rain: number;
  /** Mean wind speed m/s and gust fraction 0..1. */
  windMS: number;
  gust: number;
  /** Lightning flashes per world-minute (0 = none). */
  lightningPerMin: number;
}

/** Tuning notes (owner round 2): the four wet states must read as a STEEP
 * visual ladder — rain (featureless grey nimbostratus sheet, still fairly
 * light) → downpour (much darker, fog-blurred base) → squall (near-black
 * advancing wall, one horizon lighter) → thunderstorm (darkest base, green
 * cast, ragged racing scud). Differentiation comes from layer character
 * (cloudPuff/cloudScroll/stormFront/greenTint), not only darkness. */
export const PROFILES: Record<WeatherKind, StateProfile> = {
  clear: {
    cloudLow: 0.08, cloudMid: 0.14, cloudHigh: 0.22,
    cloudDensity: 0.6, cloudDark: 0.05,
    cloudPuff: 1.0, cloudScroll: 1, stormFront: 0, greenTint: 0, covJitter: 0.2,
    sunDim: 0, ambientLift: 0, skyGrey: 0,
    fogMie: 0, visibilityKm: 30, rain: 0,
    windMS: 2.5, gust: 0.1, lightningPerMin: 0,
  },
  haze: {
    cloudLow: 0.04, cloudMid: 0.05, cloudHigh: 0.12,
    cloudDensity: 0.4, cloudDark: 0.05,
    cloudPuff: 0.45, cloudScroll: 0.8, stormFront: 0, greenTint: 0, covJitter: 0.07,
    sunDim: 0.06, ambientLift: 0.05, skyGrey: 0.3,
    fogMie: 1.0, visibilityKm: 8, rain: 0,
    windMS: 2, gust: 0.08, lightningPerMin: 0,
  },
  overcast: {
    cloudLow: 0.42, cloudMid: 0.72, cloudHigh: 0.3,
    cloudDensity: 0.85, cloudDark: 0.3,
    cloudPuff: 0.4, cloudScroll: 1, stormFront: 0, greenTint: 0, covJitter: 0.18,
    sunDim: 0.72, ambientLift: 0.35, skyGrey: 0.55,
    fogMie: 0.3, visibilityKm: 16, rain: 0,
    windMS: 3.5, gust: 0.2, lightningPerMin: 0,
  },
  rain: {
    cloudLow: 0.7, cloudMid: 0.97, cloudHigh: 0.15,
    cloudDensity: 0.95, cloudDark: 0.45,
    cloudPuff: 0.06, cloudScroll: 1.1, stormFront: 0, greenTint: 0, covJitter: 0.03,
    sunDim: 0.8, ambientLift: 0.32, skyGrey: 0.7,
    fogMie: 0.9, visibilityKm: 7, rain: 0.45,
    windMS: 5, gust: 0.3, lightningPerMin: 0,
  },
  downpour: {
    cloudLow: 0.95, cloudMid: 1, cloudHigh: 0.05,
    cloudDensity: 1, cloudDark: 0.65,
    cloudPuff: 0.12, cloudScroll: 1.5, stormFront: 0, greenTint: 0.1, covJitter: 0,
    sunDim: 0.94, ambientLift: 0.28, skyGrey: 0.85,
    fogMie: 2.4, visibilityKm: 2.2, rain: 1,
    windMS: 7, gust: 0.45, lightningPerMin: 0.15,
  },
  squall: {
    cloudLow: 0.95, cloudMid: 0.95, cloudHigh: 0,
    cloudDensity: 1, cloudDark: 0.85,
    cloudPuff: 0.5, cloudScroll: 2.8, stormFront: 1, greenTint: 0.15, covJitter: 0,
    sunDim: 0.95, ambientLift: 0.22, skyGrey: 0.8,
    fogMie: 1.7, visibilityKm: 3, rain: 0.8,
    windMS: 14, gust: 0.9, lightningPerMin: 0.5,
  },
  thunderstorm: {
    cloudLow: 0.9, cloudMid: 0.98, cloudHigh: 0.04,
    cloudDensity: 1, cloudDark: 0.92,
    cloudPuff: 0.55, cloudScroll: 2.1, stormFront: 0.25, greenTint: 0.65, covJitter: 0,
    sunDim: 0.93, ambientLift: 0.25, skyGrey: 0.8,
    fogMie: 1.5, visibilityKm: 4, rain: 0.75,
    windMS: 9, gust: 0.7, lightningPerMin: 2.5,
  },
};

export function blendProfiles(a: StateProfile, b: StateProfile, t: number): StateProfile {
  const out = {} as Record<keyof StateProfile, number>;
  for (const k of Object.keys(a) as (keyof StateProfile)[]) {
    out[k] = a[k] + (b[k] - a[k]) * t;
  }
  return out as StateProfile;
}

/** World-minutes a transition INTO this state takes (Bethesda-style blended
 * transitions are free variety; the squall line is the one weather that
 * legitimately arrives fast — research §5.2). */
export const TRANSITION_MIN: Record<WeatherKind, number> = {
  clear: 40,
  haze: 45,
  overcast: 35,
  rain: 30,
  downpour: 22,
  squall: 6,
  thunderstorm: 28,
};
