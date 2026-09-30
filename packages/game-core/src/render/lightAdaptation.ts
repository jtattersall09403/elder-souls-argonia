/**
 * Pure helpers for the sun/eye pair the sky rig drives each frame.
 *
 * Eye adaptation eases the tone-mapping exposure in LOG space on REAL
 * seconds: exposure targets span ~4 orders of magnitude between an interior
 * (1) and noon (~1e-4), and a linear ease across that range spends ~30 s in
 * the last factor of ten (walk 6: the white-out after leaving a door). The
 * time constant is independent of the world clock rate.
 */
export const EXPOSURE_ADAPT_TAU_S = 0.5;

/** One adaptation step: returns the new exposure after `dtRealS` seconds. */
export function adaptExposure(current: number, target: number, dtRealS: number): number {
  if (!(current > 0) || !Number.isFinite(current)) return target;
  if (!(target > 0) || dtRealS <= 0) return current;
  const k = 1 - Math.exp(-dtRealS / EXPOSURE_ADAPT_TAU_S);
  return Math.exp(Math.log(current) + (Math.log(target) - Math.log(current)) * k);
}

/**
 * Shadow sun quantisation: the shadow map is only re-oriented once the true
 * sun has moved more than `stepDeg` from the last applied direction. A
 * rotation of the light every frame re-rasterises every edge on a new texel
 * grid, which reads as crawling, flickering shadows (walk 6, porch post).
 * Writes the new direction into `applied` and returns true when it stepped.
 */
export const SHADOW_SUN_STEP_DEG = 0.08;

export function stepShadowSun(
  applied: { x: number; y: number; z: number },
  sun: { x: number; y: number; z: number },
  stepDeg = SHADOW_SUN_STEP_DEG,
): boolean {
  const la = Math.hypot(applied.x, applied.y, applied.z);
  const ls = Math.hypot(sun.x, sun.y, sun.z);
  if (ls === 0) return false;
  if (la > 0) {
    const cos = (applied.x * sun.x + applied.y * sun.y + applied.z * sun.z) / (la * ls);
    if (cos >= Math.cos((stepDeg * Math.PI) / 180)) return false;
  }
  applied.x = sun.x / ls; applied.y = sun.y / ls; applied.z = sun.z / ls;
  return true;
}
