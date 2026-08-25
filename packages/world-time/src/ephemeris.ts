/**
 * Sun, moon and star ephemeris for Argonia (world module 55 §95).
 *
 * The coordinate math is the standard declination/hour-angle → altitude/azimuth
 * transform (SunCalc's API shape, reimplemented against our fictional calendar —
 * research doc verdict: port the math, don't take the dependency). The planet
 * itself is authored: one latitude constant, one axial tilt, no equation of
 * time, moons on a canon 28-night cycle. Everything is a pure function of
 * epoch minutes — same instant, same sky, always.
 *
 * Conventions: angles in radians unless suffixed Deg; azimuth measured from
 * north, clockwise (east = 90°); world axes X east, Y up, Z south (decision
 * 0003), so compass north is −Z. Directions point from observer toward body.
 */

import { DAYS_PER_YEAR, MINUTES_PER_DAY, dayOfYear } from "./calendar";

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/**
 * Province latitude. EXTRAPOLATED (sky-moons-calendar dossier): the canonical
 * Southron pole star puts Argonia near the celestial equator, southern
 * hemisphere; −10° leaves the south celestial pole 10° above the southern
 * horizon and day length at 12 h ± ~35 min. Retunable at the owner gate.
 */
export const LATITUDE_DEG = -10;
export const LATITUDE = LATITUDE_DEG * DEG;

/** Nirn's axial tilt (authored; drives seasonal declination swing). */
export const AXIAL_TILT_DEG = 23.5;
const AXIAL_TILT = AXIAL_TILT_DEG * DEG;

/**
 * Day of year of the ascending equinox (solar longitude 0), placed so the
 * summer solstice (max northern declination) lands mid-Midyear — canon: "the
 * Steed [Midyear] is prominent in the southern sky during the summer solstice".
 */
const EQUINOX_DAY = dayOfYear(5, 15) - DAYS_PER_YEAR / 4; // 74.75

/** Sun/moon rise-set and twilight altitudes (standard definitions, in degrees). */
export const TWILIGHT = {
  riseSetDeg: -0.833,
  civilDeg: -6,
  nauticalDeg: -12,
  astronomicalDeg: -18,
} as const;

export interface HorizontalPosition {
  /** Altitude above the horizon, radians. */
  altitude: number;
  /** Azimuth from north, clockwise, radians. */
  azimuth: number;
  /** Unit direction from observer toward the body, world axes (X east, Y up, Z south). */
  direction: { x: number; y: number; z: number };
}

export interface SunState extends HorizontalPosition {
  /** Solar ecliptic longitude, radians (0 = equinox). */
  eclipticLongitude: number;
  /** Solar declination, radians. */
  declination: number;
}

export interface MoonDef {
  id: "masser" | "secunda";
  name: string;
  /** Apparent angular diameter, radians. Masser is "well over twice" Secunda. */
  angularDiameter: number;
  /** Ecliptic longitude offset from the shared moon track, radians. */
  longitudeOffset: number;
  /** Orbital inclination to the celestial equator, radians. */
  inclination: number;
  /** Node phase for the declination wave, radians. */
  node: number;
}

/**
 * Canon-shaped moons: both travel the same track (they cross Tamriel's sky
 * together), Secunda trailing slightly; sizes authored so Masser reads well
 * over twice Secunda's width. TES moons are enormous compared to Luna.
 */
export const MOONS: readonly MoonDef[] = [
  { id: "masser", name: "Masser", angularDiameter: 10 * DEG, longitudeOffset: 0, inclination: 4 * DEG, node: 0 },
  { id: "secunda", name: "Secunda", angularDiameter: 4 * DEG, longitudeOffset: 7 * DEG, inclination: 7 * DEG, node: 1.1 },
];

/**
 * The canonical 28-night lunar cycle (Argonian calcinator practice: one
 * twenty-eighth of the circle per night — CANON_DERIVED, dossier).
 */
export const SYNODIC_NIGHTS = 28;

/** Authored phase epoch: 4E 201 Morning Star 1 is a new moon (age 0). */
const NEW_MOON_EPOCH_DAY = 0;

export interface MoonState extends HorizontalPosition {
  id: MoonDef["id"];
  name: string;
  angularDiameter: number;
  /** Age within the synodic cycle, nights (0 = new, 14 = full). */
  phaseAge: number;
  /** Illuminated fraction of the disc, 0..1. */
  illuminatedFraction: number;
  /** Elongation from the sun along the ecliptic, radians. */
  elongation: number;
  eclipticLongitude: number;
  declination: number;
}

/** Continuous day count (fractional) since the package epoch. */
export function epochDays(epochMinutes: number): number {
  return epochMinutes / MINUTES_PER_DAY;
}

/** Solar ecliptic longitude at a (fractional) epoch day. */
export function sunEclipticLongitude(epochDay: number): number {
  const yearDay = ((epochDay % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  return normalize((TAU * (yearDay - EQUINOX_DAY)) / DAYS_PER_YEAR);
}

/** Solar declination at a (fractional) epoch day. */
export function sunDeclination(epochDay: number): number {
  return Math.asin(Math.sin(AXIAL_TILT) * Math.sin(sunEclipticLongitude(epochDay)));
}

function normalize(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

/** Declination + hour angle → altitude/azimuth/direction at the province latitude. */
export function toHorizontal(
  declination: number,
  hourAngle: number,
  latitude: number = LATITUDE,
): HorizontalPosition {
  const sinAlt =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.min(1, Math.max(-1, sinAlt)));
  // atan2 form measured from south, positive westward; +π converts to from-north clockwise.
  const azimuth = normalize(
    Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude),
    ) + Math.PI,
  );
  const cosAlt = Math.cos(altitude);
  return {
    altitude,
    azimuth,
    direction: {
      x: Math.sin(azimuth) * cosAlt,
      y: Math.sin(altitude),
      z: -Math.cos(azimuth) * cosAlt,
    },
  };
}

/** Hour angle of a body from its right ascension. RA ≈ ecliptic longitude (authored simplification). */
function hourAngleOf(epochMinutes: number, rightAscension: number): number {
  return localSiderealAngle(epochMinutes) - rightAscension;
}

/**
 * Local sidereal angle: hour angle of the vernal point. Stars gain ~4 minutes
 * a day against the sun, which is exactly what makes each month's
 * constellation "in the sky throughout" its month.
 */
export function localSiderealAngle(epochMinutes: number): number {
  const minuteOfDay = ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const solarHourAngle = (TAU * (minuteOfDay - 720)) / MINUTES_PER_DAY;
  return normalize(solarHourAngle + sunEclipticLongitude(epochDays(epochMinutes)));
}

/** Sun position and orbital state at an instant. */
export function sunAt(epochMinutes: number, latitude: number = LATITUDE): SunState {
  const day = epochDays(epochMinutes);
  const eclipticLongitude = sunEclipticLongitude(day);
  const declination = Math.asin(Math.sin(AXIAL_TILT) * Math.sin(eclipticLongitude));
  const minuteOfDay = ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hourAngle = (TAU * (minuteOfDay - 720)) / MINUTES_PER_DAY;
  return { ...toHorizontal(declination, hourAngle, latitude), eclipticLongitude, declination };
}

/** Moon position and phase at an instant. */
export function moonAt(
  epochMinutes: number,
  moon: MoonDef,
  latitude: number = LATITUDE,
): MoonState {
  const day = epochDays(epochMinutes);
  const phaseAge = mod(day - NEW_MOON_EPOCH_DAY, SYNODIC_NIGHTS);
  const sunLon = sunEclipticLongitude(day);
  const elongation = normalize((TAU * phaseAge) / SYNODIC_NIGHTS + moon.longitudeOffset);
  const eclipticLongitude = normalize(sunLon + elongation);
  const declination = moon.inclination * Math.sin(eclipticLongitude - moon.node);
  const position = toHorizontal(declination, hourAngleOf(epochMinutes, eclipticLongitude), latitude);
  return {
    ...position,
    id: moon.id,
    name: moon.name,
    angularDiameter: moon.angularDiameter,
    phaseAge,
    illuminatedFraction: (1 - Math.cos(elongation)) / 2,
    elongation,
    eclipticLongitude,
    declination,
  };
}

/** All moons at an instant. */
export function moonsAt(epochMinutes: number, latitude: number = LATITUDE): MoonState[] {
  return MOONS.map((m) => moonAt(epochMinutes, m, latitude));
}

function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}

export interface SunTimes {
  /** Minutes of day; null when the sun never crosses the given altitude. */
  sunrise: number | null;
  sunset: number | null;
  civilDawn: number | null;
  civilDusk: number | null;
  nauticalDawn: number | null;
  nauticalDusk: number | null;
  astronomicalDawn: number | null;
  astronomicalDusk: number | null;
}

/** Rise/set and twilight times (minutes of day) for the day containing an epoch minute. */
export function sunTimes(epochMinutes: number, latitude: number = LATITUDE): SunTimes {
  const dayStart = Math.floor(epochDays(epochMinutes));
  const declination = sunDeclination(dayStart + 0.5);
  const cross = (altDeg: number): { am: number; pm: number } | null => {
    const cosH =
      (Math.sin(altDeg * DEG) - Math.sin(latitude) * Math.sin(declination)) /
      (Math.cos(latitude) * Math.cos(declination));
    if (cosH < -1 || cosH > 1) return null;
    const halfDayMinutes = (Math.acos(cosH) / TAU) * MINUTES_PER_DAY;
    return { am: 720 - halfDayMinutes, pm: 720 + halfDayMinutes };
  };
  const rise = cross(TWILIGHT.riseSetDeg);
  const civil = cross(TWILIGHT.civilDeg);
  const nautical = cross(TWILIGHT.nauticalDeg);
  const astronomical = cross(TWILIGHT.astronomicalDeg);
  return {
    sunrise: rise?.am ?? null,
    sunset: rise?.pm ?? null,
    civilDawn: civil?.am ?? null,
    civilDusk: civil?.pm ?? null,
    nauticalDawn: nautical?.am ?? null,
    nauticalDusk: nautical?.pm ?? null,
    astronomicalDawn: astronomical?.am ?? null,
    astronomicalDusk: astronomical?.pm ?? null,
  };
}

/**
 * Altitude of the south celestial pole (the Southron pole star's steady
 * height above the southern horizon): |latitude|.
 */
export const SOUTH_POLE_ALTITUDE = Math.abs(LATITUDE);
