/**
 * The province season scalar s(t) ∈ [−1 dry … +1 wet] promised by the climate
 * model (module 50 §33.1, produced here per module 55 §94), plus the named
 * monsoon season. Curve shape follows docs/research/black-marsh-climatology.md
 * §3: dry trough mid-Xeech, monsoon rise from Rain's Hand, flood peak at the
 * Hearthfire–Frostfall turn, recession with heavy dawn mist to year's end.
 */

import { DAYS_PER_YEAR, MONTHS } from "./calendar";

export type SeasonName = "dry" | "rain-onset" | "monsoon" | "flood-peak" | "recession";

export interface SeasonState {
  /** Season scalar, −1 (deep dry) … +1 (flood peak). */
  s: number;
  name: SeasonName;
  /** Jel name of the current month (the Argonian season vocabulary). */
  jelMonth: string;
}

/** Control points (1-based day of year → s), interpolated with cosine easing. */
const CURVE: readonly [number, number][] = [
  [15, -0.9],
  [45, -1.0], // mid-Xeech: deep dry
  [75, -0.85],
  [105, -0.35], // Rain's Hand: onset
  [135, 0.2],
  [165, 0.55],
  [195, 0.75],
  [225, 0.85],
  [255, 0.95],
  [274, 1.0], // Hearthfire–Frostfall turn: flood peak
  [295, 0.8],
  [320, 0.3],
  [345, -0.2], // recession
];

const SEASON_BY_MONTH: readonly SeasonName[] = [
  "dry",
  "dry",
  "dry",
  "rain-onset",
  "monsoon",
  "monsoon",
  "monsoon",
  "monsoon",
  "flood-peak",
  "flood-peak",
  "recession",
  "recession",
];

/** Season scalar for a (fractional) 1-based day of year; periodic and continuous. */
export function seasonScalar(yearDay: number): number {
  const d = ((yearDay - 1) % DAYS_PER_YEAR + DAYS_PER_YEAR) % DAYS_PER_YEAR + 1;
  const n = CURVE.length;
  for (let i = 0; i < n; i += 1) {
    const [d0, s0] = CURVE[i];
    const [d1raw, s1] = CURVE[(i + 1) % n];
    const d1 = i + 1 < n ? d1raw : d1raw + DAYS_PER_YEAR;
    const dd = i + 1 < n ? d : d < d0 ? d + DAYS_PER_YEAR : d;
    if (dd >= d0 && dd <= d1) {
      const t = (dd - d0) / (d1 - d0);
      const eased = (1 - Math.cos(Math.PI * t)) / 2;
      return s0 + (s1 - s0) * eased;
    }
  }
  return CURVE[0][1];
}

/** Full season state for a 0-based month and fractional 1-based day of year. */
export function seasonState(month: number, yearDay: number): SeasonState {
  return {
    s: seasonScalar(yearDay),
    name: SEASON_BY_MONTH[month],
    jelMonth: MONTHS[month].jel,
  };
}
