import type { TslNode } from "../../render/nodes/materialNodes";
import * as TSLNS from "three/tsl";
// TSL typings are too deep for tsc to check usefully (0107 §1): the graph is typed as TslNode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  clamp, float, smoothstep,
} = TSLNS as any;
/**
 * Shoreline DEPTH-RANGE froth (Greenheck study §4 (2), §6 "Beach and surf"):
 * a second, wider foam band driven by the vertical water depth over
 * ~1.5–2 m, noise-broken and at lower coverage than the 12 cm contact line
 * it sits behind (`CONTACT_FOAM_M` in waterMaterial.ts). Water Pro's
 * `foam.shoreline.range` is the same physical control at 2 m. The surf band
 * deposits into the persistent foam field through this band, so froth
 * lingers on the sand and drains back instead of vanishing with the crest.
 *
 * TS twin ↔ `SHORE_FROTH_GLSL`. Edit both or neither.
 */
export const SHORE_FROTH = {
  /** Depth (m) over which the froth fades out from the waterline. */
  rangeM: 1.8,
  /** Noise displacement of the band edge (m of depth) — a straight
   * depth-contour line is the "game water" tell. */
  noiseM: 0.8,
  /** Peak coverage — well under the contact line's, so the two read as a
   * bright lip with a broken fringe behind it. */
  coverage: 0.32,
} as const;

/** Band weight 0..1 at `depthM` of vertical water, `noise` 0..1. */
export function shoreFrothBand(depthM: number, noise: number): number {
  const d = depthM + (noise - 0.5) * SHORE_FROTH.noiseM;
  const t = Math.min(Math.max(d / SHORE_FROTH.rangeM, 0), 1);
  return 1 - t * t * (3 - 2 * t);
}

/** Froth energy: the band, scaled by coverage and by the shore's wave
 * energy (fetch exposure) so a still marsh margin keeps only a faint
 * fringe and an exposed beach a real one. */
export function shoreFroth(depthM: number, noise: number, fetchExposure: number): number {
  return shoreFrothBand(depthM, noise) * SHORE_FROTH.coverage
    * (0.25 + 0.75 * Math.min(Math.max(fetchExposure, 0), 1));
}

/** TSL twins of shoreFrothBand() / shoreFroth(). */
export function esShoreFrothBand(depthM: TslNode, noise: TslNode): TslNode {
  const d = (depthM as TslNode).add((noise as TslNode).sub(0.5).mul(Number(SHORE_FROTH.noiseM.toFixed(2))));
  return float(1.0).sub(smoothstep(0.0, Number(SHORE_FROTH.rangeM.toFixed(2)), d));
}
export function esShoreFroth(depthM: TslNode, noise: TslNode, fetchExp: TslNode): TslNode {
  return (esShoreFrothBand(depthM, noise) as TslNode).mul(Number(SHORE_FROTH.coverage.toFixed(2)))
    .mul((clamp(fetchExp, 0.0, 1.0) as TslNode).mul(0.75).add(0.25));
}
