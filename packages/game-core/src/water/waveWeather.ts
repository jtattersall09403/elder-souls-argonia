/** Presentation energy response, not a change to authored weather or water
 * levels. State belongs to the scene; CPU and GPU read its published scale. */
export const WATER_AMPLITUDE_RESPONSE_S = 8;

export function advanceWaveAmplitude(current: number, target: number, deltaS: number): number {
  const goal = Math.min(6, Math.max(.35, Number.isFinite(target) ? target : 1));
  // Seed a new scene at its actual weather, avoiding an artificial startup sea.
  if (!Number.isFinite(current)) return goal;
  const previous = Math.min(6, Math.max(.35, current));
  // Explicit suspension and clock discontinuities supply zero elapsed time.
  if (!(deltaS > 0) || !Number.isFinite(deltaS)) return previous;
  return previous + (goal - previous) * -Math.expm1(-deltaS / WATER_AMPLITUDE_RESPONSE_S);
}
