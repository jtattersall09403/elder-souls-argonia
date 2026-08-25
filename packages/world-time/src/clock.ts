/**
 * The world clock (world module 55 §94, decision 0016). One deterministic
 * province time that every system reads: sky, weather, flood, tide, ecology,
 * schedules, quests. No Date.now(), no RNG — a WorldInstant is the only input.
 */

import {
  DAYS_PER_YEAR,
  MINUTES_PER_DAY,
  WEEKDAYS,
  dayOfYear,
  monthAndDay,
  weekdayIndex,
} from "./calendar";
import { TWILIGHT, sunAt } from "./ephemeris";
import { seasonState, type SeasonState } from "./season";

export interface WorldInstant {
  era: 1 | 2 | 3 | 4;
  year: number;
  /** 0-based month index. */
  month: number;
  /** 1-based day of month. */
  day: number;
  /** 0..1439, fractional allowed. */
  minuteOfDay: number;
}

export type DayPhase =
  | "night"
  | "astronomical"
  | "nautical"
  | "civil"
  | "sunrise"
  | "morning"
  | "noon"
  | "afternoon"
  | "sunset"
  | "dusk";

/** The reference epoch: 4E 201 Morning Star 1, 00:00. Arithmetic is 4E-only. */
export const EPOCH_YEAR = 201;

/**
 * The default studio instant: 17 Last Seed 4E 201 (the canon 4E 201 date every
 * TES player knows), mid-morning.
 */
export const DEFAULT_INSTANT: WorldInstant = {
  era: 4,
  year: 201,
  month: 7,
  day: 17,
  minuteOfDay: 600,
};

/** Absolute province minutes since the epoch for a 4E instant. */
export function toEpochMinutes(instant: WorldInstant): number {
  if (instant.era !== 4) {
    throw new Error("world-time arithmetic is defined for the Fourth Era only");
  }
  const days =
    (instant.year - EPOCH_YEAR) * DAYS_PER_YEAR + dayOfYear(instant.month, instant.day) - 1;
  return days * MINUTES_PER_DAY + instant.minuteOfDay;
}

/** Inverse of {@link toEpochMinutes}. */
export function fromEpochMinutes(epochMinutes: number): WorldInstant {
  const totalDays = Math.floor(epochMinutes / MINUTES_PER_DAY);
  const minuteOfDay = epochMinutes - totalDays * MINUTES_PER_DAY;
  const year = EPOCH_YEAR + Math.floor(totalDays / DAYS_PER_YEAR);
  const yearDay = ((totalDays % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR + 1;
  const { month, day } = monthAndDay(yearDay);
  return { era: 4, year, month, day, minuteOfDay };
}

/** Day phase from sun altitude (twilight bands are altitudes, not clock times). */
export function dayPhaseAt(epochMinutes: number): DayPhase {
  const sun = sunAt(epochMinutes);
  const altDeg = (sun.altitude * 180) / Math.PI;
  const minuteOfDay =
    ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const rising = minuteOfDay < 720;
  if (altDeg <= TWILIGHT.astronomicalDeg) return "night";
  if (altDeg <= TWILIGHT.nauticalDeg) return "astronomical";
  if (altDeg <= TWILIGHT.civilDeg) return "nautical";
  if (altDeg <= TWILIGHT.riseSetDeg) return rising ? "civil" : "dusk";
  if (altDeg <= 6) return rising ? "sunrise" : "sunset";
  // Noon band: within ±30 minutes of solar noon.
  if (Math.abs(minuteOfDay - 720) <= 30) return "noon";
  return rising ? "morning" : "afternoon";
}

export class WorldClock {
  /** World minutes advanced per real second; 0 = frozen (studio default). */
  rate = 0;

  private epochMin: number;

  constructor(instant: WorldInstant = DEFAULT_INSTANT) {
    this.epochMin = toEpochMinutes(instant);
  }

  now(): WorldInstant {
    return fromEpochMinutes(this.epochMin);
  }

  /** Absolute, monotonic province time — the only thing systems should diff. */
  epochMinutes(): number {
    return this.epochMin;
  }

  setInstant(instant: WorldInstant): void {
    this.epochMin = toEpochMinutes(instant);
  }

  setEpochMinutes(epochMinutes: number): void {
    this.epochMin = epochMinutes;
  }

  /** Advance by elapsed real seconds at the current rate. */
  advance(realSeconds: number): void {
    if (this.rate !== 0) this.epochMin += realSeconds * this.rate;
  }

  season(): SeasonState {
    const instant = this.now();
    const yearDay = dayOfYear(instant.month, instant.day) + instant.minuteOfDay / MINUTES_PER_DAY;
    return seasonState(instant.month, yearDay);
  }

  dayPhase(): DayPhase {
    return dayPhaseAt(this.epochMin);
  }

  weekday(): string {
    return WEEKDAYS[weekdayIndex(Math.floor(this.epochMin / MINUTES_PER_DAY))];
  }
}
