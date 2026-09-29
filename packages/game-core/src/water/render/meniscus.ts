import type { TslNode } from "../../render/nodes/materialNodes";
import * as TSLNS from "three/tsl";
// TSL typings are too deep for tsc to check usefully (0107 §1): the graph is typed as TslNode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  abs, clamp, float, mix, normalize, pow, smoothstep,
} = TSLNS as any;
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

/** TSL twins of meniscusBand() / meniscusRim() (constants rounded as the GLSL baked them). */
export function esMeniscusBand(dy: TslNode, dist: TslNode): TslNode {
  return (float(1.0).sub(smoothstep(0.0, Number(MENISCUS.thicknessM.toFixed(2)), abs(dy))) as TslNode)
    .mul(float(1.0).sub(smoothstep(0.3, Number(MENISCUS.reachM.toFixed(2)), dist)));
}
export function esMeniscusNormal(nrm: TslNode, toCam: TslNode, band: TslNode): TslNode {
  return normalize(mix(nrm, toCam, (band as TslNode).mul(Number(MENISCUS.normalStrength.toFixed(2)))));
}
export function esMeniscusRim(band: TslNode): TslNode {
  return (pow(clamp(band, 0.0, 1.0), Number(MENISCUS.sharpness.toFixed(1))) as TslNode)
    .mul(Number(MENISCUS.rimStrength.toFixed(2)));
}
