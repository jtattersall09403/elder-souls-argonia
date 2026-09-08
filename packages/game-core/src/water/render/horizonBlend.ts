/**
 * Horizon convergence (Greenheck study §1.8 "Atmospheric fog", §3.1 (7)):
 * the water's lit colour is blended toward the sampled sky/environment
 * colour along the view direction over ~1.5–3.5 km, so the far sea meets the
 * sky with no seam. Applied to `outgoingLight` BEFORE the shared aerial
 * term (which the material already carries), so nothing is fogged twice:
 * aerial perspective then acts on a water colour that already agrees with
 * the sky it is about to be fogged into.
 *
 * TS twin ↔ `HORIZON_BLEND_GLSL`. Edit both or neither.
 */
export const HORIZON = {
  startM: 1500,
  endM: 3500,
  /** Never a full replacement: the last few percent keep the swell's
   * specular alive on the horizon line. */
  maxBlend: 0.92,
} as const;

export function horizonBlendWeight(distM: number): number {
  const t = Math.min(Math.max((distM - HORIZON.startM) / (HORIZON.endM - HORIZON.startM), 0), 1);
  return t * t * (3 - 2 * t) * HORIZON.maxBlend;
}

export const HORIZON_BLEND_GLSL = /* glsl */ `
// KEEP IN LOCKSTEP with horizonBlendWeight().
float esHorizonBlend(float dist){
  return smoothstep(${HORIZON.startM.toFixed(1)}, ${HORIZON.endM.toFixed(1)}, dist) * ${HORIZON.maxBlend.toFixed(2)};
}
`;
