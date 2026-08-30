/**
 * The synoptic driver (module 55 §98, decision 0032): the province is ~7.4 km
 * across — one real weather cell — so ONE seeded synoptic timeline drives the
 * whole map, and regional variety comes from local *expression* of that state
 * against the climate fields (express.ts). Two deterministic layers:
 *
 * 1. SPELLS (multi-day): monsoon rain arrives in 40–80 h active spells
 *    alternating with break spells (isolated storms, squall lines), dry-season
 *    weather in settled/parched spells — the tropical rhythm the research doc
 *    §5.2 verifies. Seeded per (year, spell index).
 * 2. SLOTS (90 world-minutes): within a spell, each slot rolls a weather state
 *    from weights(spell kind, season, time of day) with persistence, so
 *    afternoon convection peaks inland storms while mornings stay clear.
 *
 * Everything is a pure function of epoch minutes: no accumulated state, fully
 * scrubbable, save-free — a studio URL reproduces the exact same weather.
 */

import {
  dayOfYear,
  fromEpochMinutes,
  seasonScalar,
  toEpochMinutes,
  MINUTES_PER_DAY,
  DAYS_PER_YEAR,
} from "@elder-souls/world-time";
import { hash01, pickWeighted } from "./hash";
import {
  PROFILES,
  TRANSITION_MIN,
  blendProfiles,
  type StateProfile,
  type WeatherKind,
} from "./states";

export const SLOT_MINUTES = 90; // 16 slots/day; divides 1440 exactly
const SLOTS_PER_DAY = MINUTES_PER_DAY / SLOT_MINUTES;

// ---------------------------------------------------------------------------
// Spell layer
// ---------------------------------------------------------------------------

export type SpellKind = "active" | "break" | "fair" | "parched";

export interface Spell {
  kind: SpellKind;
  /** 1-based first day of year covered (inclusive). */
  startDay: number;
  lengthDays: number;
  index: number;
}

/** Spell length ranges in days (active 40–80 h per the monsoon literature). */
const SPELL_DAYS: Record<SpellKind, [number, number]> = {
  active: [2, 3],
  break: [2, 5],
  fair: [2, 4],
  parched: [2, 5],
};

function spellWeights(s: number): readonly (readonly [SpellKind, number])[] {
  if (s >= 0.4) {
    return [
      ["active", 0.55],
      ["break", 0.35],
      ["fair", 0.1],
    ] as const;
  }
  if (s >= 0) {
    return [
      ["active", 0.3],
      ["break", 0.3],
      ["fair", 0.4],
    ] as const;
  }
  if (s >= -0.5) {
    return [
      ["fair", 0.5],
      ["parched", 0.25],
      ["break", 0.15],
      ["active", 0.1],
    ] as const;
  }
  return [
    ["parched", 0.5],
    ["fair", 0.4],
    ["break", 0.1],
  ] as const;
}

const spellCache = new Map<number, Spell[]>();

/** The seeded spell partition of one calendar year (restarts each year — the
 * Morning Star 1 discontinuity is invisible at weather granularity). */
export function spellsForYear(year: number): Spell[] {
  const cached = spellCache.get(year);
  if (cached) return cached;
  const spells: Spell[] = [];
  let day = 1;
  let i = 0;
  while (day <= DAYS_PER_YEAR) {
    const s = seasonScalar(day);
    const kind = pickWeighted(spellWeights(s), hash01(year, i, 1));
    const [lo, hi] = SPELL_DAYS[kind];
    const len = Math.min(lo + Math.floor(hash01(year, i, 2) * (hi - lo + 1)), DAYS_PER_YEAR - day + 1);
    spells.push({ kind, startDay: day, lengthDays: len, index: i });
    day += len;
    i += 1;
  }
  spellCache.set(year, spells);
  return spells;
}

export function spellAt(year: number, yearDay: number): Spell {
  const spells = spellsForYear(year);
  // ~110 spells/year; linear scan is fine and cache-hot.
  for (const sp of spells) {
    if (yearDay < sp.startDay + sp.lengthDays) return sp;
  }
  return spells[spells.length - 1];
}

// ---------------------------------------------------------------------------
// Slot layer
// ---------------------------------------------------------------------------

/** Afternoon convective bell over tropical land (research §5.2): storms build
 * through midday, peak afternoon–evening, decay overnight. */
export function convectionFactor(hourOfDay: number): number {
  return Math.exp(-Math.pow((hourOfDay - 15.5) / 3.2, 2));
}

/** Re-roll probability per slot — Bethesda's "volatility" per spell kind. */
const VOLATILITY: Record<SpellKind, number> = {
  active: 0.35,
  break: 0.45,
  fair: 0.25,
  parched: 0.15,
};

function stateWeights(
  spell: SpellKind,
  s: number,
  hourOfDay: number,
): readonly (readonly [WeatherKind, number])[] {
  const convect = convectionFactor(hourOfDay);
  const wet = Math.max(0, s);
  const dry = Math.max(0, -s);
  // Owner round 4: the old weights only ever rolled "clear" or "overcast"
  // outside rain, so the sky was binary. The fair-weather ladder
  // (fair/partly/broken) takes most of what used to be "clear" weight —
  // cloudless skies are the MINORITY in a humid tropical province, and the
  // interesting days are the in-between ones. Cumulus is also diurnal: fair
  // mornings build to partly/broken over land through the afternoon
  // (`convect`), the same heating curve that drives thunderstorms.
  switch (spell) {
    case "active":
      return [
        ["rain", 0.35],
        ["downpour", 0.22 + 0.1 * wet],
        ["overcast", 0.25],
        ["thunderstorm", 0.12 * convect],
        ["squall", 0.03],
        ["broken", 0.04],
      ] as const;
    case "break":
      // Squall lines are characteristic of monsoon BREAK phases (research
      // §5.2 — Darwin climatology), alongside isolated afternoon storms.
      return [
        ["clear", 0.05],
        ["fair", 0.08],
        ["partly", 0.09 + 0.06 * convect],
        ["broken", 0.1 + 0.08 * convect],
        ["overcast", 0.24],
        ["thunderstorm", 0.3 * convect + 0.03],
        ["squall", 0.1],
        ["rain", 0.1],
      ] as const;
    case "fair":
      return [
        ["clear", 0.16],
        ["fair", 0.2],
        ["partly", 0.16 + 0.08 * convect],
        ["broken", 0.09 + 0.07 * convect],
        ["overcast", 0.14],
        ["haze", 0.12 * dry],
        ["rain", 0.06 * wet],
        ["thunderstorm", 0.08 * convect * (0.3 + wet)],
      ] as const;
    case "parched":
      // Dry-season subsidence: genuinely cloudless days are common HERE and
      // rare elsewhere — that contrast is what makes the seasons read.
      return [
        ["haze", 0.44],
        ["clear", 0.28],
        ["fair", 0.15],
        ["partly", 0.06 + 0.04 * convect],
        ["overcast", 0.04],
        ["thunderstorm", 0.03 * convect],
      ] as const;
  }
}

const slotCache = new Map<string, WeatherKind[]>();

/** All slot states of one spell, rolled sequentially with persistence. */
function slotStatesOfSpell(year: number, spell: Spell): WeatherKind[] {
  const key = `${year}:${spell.index}`;
  const cached = slotCache.get(key);
  if (cached) return cached;
  const n = spell.lengthDays * SLOTS_PER_DAY;
  const out: WeatherKind[] = new Array(n);
  let prev: WeatherKind | null = null;
  for (let i = 0; i < n; i += 1) {
    const hour = ((i % SLOTS_PER_DAY) + 0.5) * (SLOT_MINUTES / 60);
    const s = seasonScalar(spell.startDay + Math.floor(i / SLOTS_PER_DAY));
    // A squall line is minutes-to-an-hour of violence, then it has PASSED —
    // force a re-roll and never roll squall twice in a row.
    const mustReroll = prev === null || prev === "squall";
    const reroll = mustReroll || hash01(year, spell.index * 4096 + i, 3) < VOLATILITY[spell.kind];
    if (reroll) {
      let weights = stateWeights(spell.kind, s, hour);
      if (prev === "squall") weights = weights.filter(([k]) => k !== "squall");
      prev = pickWeighted(weights, hash01(year, spell.index * 4096 + i, 4));
    }
    out[i] = prev as WeatherKind;
  }
  slotCache.set(key, out);
  return out;
}

function yearStartEpochMin(year: number): number {
  return toEpochMinutes({ era: 4, year, month: 0, day: 1, minuteOfDay: 0 });
}

/** Weather state of an absolute 90-minute slot index. */
export function stateAtSlot(absSlot: number): WeatherKind {
  const epochMin = absSlot * SLOT_MINUTES;
  const inst = fromEpochMinutes(epochMin);
  const yd = dayOfYear(inst.month, inst.day);
  const spell = spellAt(inst.year, yd);
  const states = slotStatesOfSpell(inst.year, spell);
  const spellStartSlot = Math.round(
    (yearStartEpochMin(inst.year) + (spell.startDay - 1) * MINUTES_PER_DAY) / SLOT_MINUTES,
  );
  const i = absSlot - spellStartSlot;
  return states[Math.max(0, Math.min(states.length - 1, i))];
}

// ---------------------------------------------------------------------------
// The blended synoptic sample
// ---------------------------------------------------------------------------

export interface SynopticSample {
  /** State being left and state being entered (equal outside transitions). */
  prev: WeatherKind;
  state: WeatherKind;
  /** 0 fully prev → 1 fully state. */
  blend: number;
  /** Parameter block blended between the two states. */
  profile: StateProfile;
  spellKind: SpellKind;
  slot: number;
  minutesIntoSlot: number;
}

function smooth01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Slow deterministic cloud-cover wander in [-1, 1]: two incommensurate
 * sines over epoch minutes (periods ~3.3 h and ~47 min), so a "clear" or
 * "overcast" state drifts between a few fluffy clouds and a broken deck
 * across the day (owner round 2: coverage variety) — pure function, no RNG. */
export function coverWander(epochMinutes: number): number {
  return (
    0.62 * Math.sin((2 * Math.PI * epochMinutes) / 197 + 1.7) +
    0.38 * Math.sin((2 * Math.PI * epochMinutes) / 47 + 4.2)
  );
}

/** Applies the coverage wander to a profile (returns a copy; identity when
 * the profile's covJitter is ~0). Shared by the auto timeline and the
 * force-state preview so a forced clear day still drifts its cumulus. */
export function applyCoverWander(profile: StateProfile, epochMinutes: number): StateProfile {
  if (profile.covJitter <= 0.005) return profile;
  const w = coverWander(epochMinutes);
  const w2 = coverWander(epochMinutes + 71);
  return {
    ...profile,
    cloudLow: clamp01(profile.cloudLow + profile.covJitter * 0.8 * w2),
    cloudMid: clamp01(profile.cloudMid + profile.covJitter * w),
    cloudHigh: clamp01(profile.cloudHigh + profile.covJitter * 0.6 * w),
  };
}

export function synopticAt(epochMinutes: number): SynopticSample {
  const slot = Math.floor(epochMinutes / SLOT_MINUTES);
  const minutesIntoSlot = epochMinutes - slot * SLOT_MINUTES;
  const state = stateAtSlot(slot);
  const prev = stateAtSlot(slot - 1);
  const inst = fromEpochMinutes(epochMinutes);
  const spellKind = spellAt(inst.year, dayOfYear(inst.month, inst.day)).kind;
  let blend = 1;
  if (prev !== state) {
    blend = smooth01(minutesIntoSlot / TRANSITION_MIN[state]);
  }
  // Day-to-day coverage variety: the wander jitters the layer coverages by
  // the blended covJitter amplitude (rainy states author ~0 so precipitation
  // never loses its deck).
  const profile = applyCoverWander(
    prev === state || blend >= 1
      ? PROFILES[state]
      : blendProfiles(PROFILES[prev], PROFILES[state], blend),
    epochMinutes,
  );
  return { prev, state, blend, profile, spellKind, slot, minutesIntoSlot };
}

// ---------------------------------------------------------------------------
// Derived deterministic conditions
// ---------------------------------------------------------------------------

/** Radiation-mist precondition (research §5.2): dawn basin mist REQUIRES the
 * preceding night to have been clear and calm — a causal cross-dependency
 * between successive states, not a random roll. 0..1 for the most recent
 * night (02:00–05:00). */
export function clearCalmNightFactor(epochMinutes: number): number {
  const minuteOfDay = ((epochMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  // Most recent 03:30, i.e. last night for dawn/daytime queries.
  const nightRef = epochMinutes - ((minuteOfDay - 210 + MINUTES_PER_DAY) % MINUTES_PER_DAY);
  let score = 0;
  let maxRain = 0;
  for (const dt of [-90, 0, 90]) {
    const syn = synopticAt(nightRef + dt);
    // How much of the night sky was open to space (radiative cooling): the
    // fair-weather ladder grades this instead of the old clear/overcast step.
    const skyClear =
      syn.state === "clear" || syn.state === "haze" || syn.state === "fair"
        ? 1
        : syn.state === "partly"
          ? 0.75
          : syn.state === "broken"
            ? 0.45
            : syn.state === "overcast"
              ? 0.3
              : 0;
    const calm = Math.min(1, Math.max(0, (4.5 - syn.profile.windMS) / 2.5));
    score += skyClear * calm;
    maxRain = Math.max(maxRain, syn.profile.rain);
  }
  // Any rainy interval means cloud cover blocked the night's radiative
  // cooling — one clear hour either side does not rescue the fog.
  return (score / 3) * Math.max(0, 1 - maxRain * 1.6);
}

/** Ground wetness 0..1: deterministic trailing integral of rain — rises
 * during rain, decays over tens of minutes after (research §4), scrubbable
 * with no history buffer. */
export function rainWetness(epochMinutes: number): number {
  const STEP = 6; // minutes
  const TAU = 30; // decay constant, minutes
  let sum = 0;
  let wsum = 0;
  for (let k = 0; k < 15; k += 1) {
    const w = Math.exp((-k * STEP) / TAU);
    sum += w * synopticAt(epochMinutes - k * STEP).profile.rain;
    wsum += w;
  }
  return Math.min(1, (sum / wsum) * 1.4);
}

/** Lightning flash envelope 0..1 at this instant. Flash times are seeded per
 * slot; each flash is a ~1.2 s (0.02 world-minute) triangular pulse.
 * `forcedRate` (studio force-state preview) overrides the timeline's rate. */
export function lightningAt(epochMinutes: number, forcedRate?: number): number {
  const WIDTH = 0.02;
  let env = 0;
  for (const slotOff of [0, -1]) {
    const slot = Math.floor(epochMinutes / SLOT_MINUTES) + slotOff;
    const rate = forcedRate ?? PROFILES[stateAtSlot(slot)].lightningPerMin;
    if (rate <= 0) continue;
    const n = Math.floor(rate * SLOT_MINUTES);
    for (let k = 0; k < n; k += 1) {
      const t = slot * SLOT_MINUTES + hash01(slot, 77 + k) * SLOT_MINUTES;
      const dt = Math.abs(epochMinutes - t);
      if (dt < WIDTH) env = Math.max(env, 1 - dt / WIDTH);
    }
  }
  return env;
}

/** Prevailing wind travel direction (XZ, unit): matches the sea-wave tuning
 * in game-core waves.ts so clouds, chop and swell agree; wanders slowly
 * ±25° between slots. */
export function windDirAt(epochMinutes: number): [number, number] {
  const slot = Math.floor(epochMinutes / SLOT_MINUTES);
  const f = smooth01((epochMinutes - slot * SLOT_MINUTES) / SLOT_MINUTES);
  const a0 = (hash01(slot, 9) - 0.5) * 0.9; // ±25°
  const a1 = (hash01(slot + 1, 9) - 0.5) * 0.9;
  const a = a0 + (a1 - a0) * f + Math.atan2(-0.75, 0.66);
  return [Math.cos(a), Math.sin(a)];
}
