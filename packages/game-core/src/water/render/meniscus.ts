/**
 * Waterline meniscus (Greenheck study §1.8, §3.1 (8)): when the camera sits
 * within ±`thicknessM` of the surface — the half-in-half-out swimming shot
 * — the surface normal of the fragments right at the camera is tilted
 * toward the camera and a rim highlight is laid across the band. Both
 * variants (above/below) carry it: the band is a function of the fragment's
 * height relative to the camera and its distance, so it only ever appears
 * where the near clip crosses the water.
 *
 * TS twin ↔ `MENISCUS_GLSL`. Edit both or neither.
 */
export const MENISCUS = {
  /** Half-width (m) of the band about the camera height. */
  thicknessM: 0.4,
  /** Fragments farther than this (m) never carry the meniscus. */
  reachM: 2.5,
  /** How far the normal tilts toward the camera (0..1). */
  normalStrength: 0.6,
  /** Rim highlight strength and its falloff exponent. */
  rimStrength: 0.35,
  sharpness: 3,
} as const;

const sstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Band weight 0..1 for a fragment `dyM` above (+) / below (−) the camera
 * at `distM` from it. */
export function meniscusBand(dyM: number, distM: number): number {
  return (1 - sstep(0, MENISCUS.thicknessM, Math.abs(dyM))) * (1 - sstep(0.3, MENISCUS.reachM, distM));
}

/** Rim highlight weight for a band value. */
export function meniscusRim(band: number): number {
  return MENISCUS.rimStrength * Math.pow(Math.min(Math.max(band, 0), 1), MENISCUS.sharpness);
}

export const MENISCUS_GLSL = /* glsl */ `
// KEEP IN LOCKSTEP with meniscusBand() / meniscusRim().
float esMeniscusBand(float dy, float dist){
  return (1.0 - smoothstep(0.0, ${MENISCUS.thicknessM.toFixed(2)}, abs(dy)))
       * (1.0 - smoothstep(0.3, ${MENISCUS.reachM.toFixed(2)}, dist));
}
vec3 esMeniscusNormal(vec3 n, vec3 toCam, float band){
  return normalize(mix(n, toCam, band * ${MENISCUS.normalStrength.toFixed(2)}));
}
float esMeniscusRim(float band){
  return ${MENISCUS.rimStrength.toFixed(2)} * pow(clamp(band, 0.0, 1.0), ${MENISCUS.sharpness.toFixed(1)});
}
`;
