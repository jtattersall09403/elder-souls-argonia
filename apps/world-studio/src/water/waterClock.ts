/**
 * The water animation clock (owner round 1): the world clock is PAUSED by
 * default (URLs pin exact instants), but water must always be alive. Waves
 * run on the phase accumulator instead. It advances
 * at least real time and speeds up moderately with the world-time rate
 * (capped so time-lapse doesn't boil the sea). One shared value drives the
 * shader's `uWaveTime` AND the CPU `WorldWaterQuery`, so what floats matches
 * what renders.
 *
 * Round 3: the accumulator also runs faster in wind (game-core
 * windWaveSpeed — ≈1 at the calibrated default, ~2.2× in a squall), so storm
 * waves arrive faster and shore breaking quickens (owner ask). Scaling the
 * phase accumulator keeps wave geometry and queries phase-continuous.
 * Physical flow/foam/contact lifetimes use the separate real-time transport
 * clock and never inherit wind or preview acceleration.
 */

import { getWindWaveScale } from "@elder-souls/game-core/water/index";
import { WaterClock } from "@elder-souls/game-core/water/WaterClock";

const clock = new WaterClock();

export function advanceWaterClock(deltaS: number, worldRate: number): void {
  clock.advance(deltaS, worldRate, getWindWaveScale());
}

export function waterTimeS(): number {
  return clock.phaseS;
}

export function waterTransportTimeS(): number { return clock.transportS; }
export function waterTransportDeltaS(): number { return clock.deltaS; }
export function setWaterClockHidden(hidden: boolean): void { clock.setHidden(hidden); }
