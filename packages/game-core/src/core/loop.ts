export type FixedStep = {
  step: number;
  accumulator: number;
  maxSteps: number;
};

/** A bounded fixed-timestep accumulator. Portable and independent of any render loop. */
export function createFixedStep(step = 1 / 60, maxSteps = 5): FixedStep {
  return { step, accumulator: 0, maxSteps };
}

/**
 * Feeds elapsed frame time into the accumulator and invokes `tick` once per
 * whole fixed step, capped by `maxSteps` to avoid a spiral of death after a
 * long stall. Returns the number of ticks run.
 */
export function runFixedSteps(state: FixedStep, frameDelta: number, tick: (dt: number) => void): number {
  if (!Number.isFinite(frameDelta) || frameDelta <= 0) return 0;
  state.accumulator = Math.min(state.accumulator + frameDelta, state.step * state.maxSteps);
  let ticks = 0;
  while (state.accumulator >= state.step) {
    tick(state.step);
    state.accumulator -= state.step;
    ticks += 1;
  }
  return ticks;
}
