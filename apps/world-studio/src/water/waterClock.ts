/**
 * The water animation clock (owner round 1): the world clock is PAUSED by
 * default (URLs pin exact instants), but water must always be alive — waves,
 * ripples, foam and splash rings run on this accumulator instead. It advances
 * at least real time and speeds up moderately with the world-time rate
 * (capped so time-lapse doesn't boil the sea). One shared value drives the
 * shader's `uWaveTime` AND the CPU `WorldWaterQuery`, so what floats matches
 * what renders.
 */

let seconds = 0;

export function advanceWaterClock(deltaS: number, worldRate: number): void {
  const rate = Math.max(1, Math.min(Number.isFinite(worldRate) ? worldRate : 1, 8));
  seconds += Math.min(deltaS, 0.25) * rate;
}

export function waterTimeS(): number {
  return seconds;
}
