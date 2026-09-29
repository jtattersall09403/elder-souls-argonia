import type { TslNode } from "../../render/nodes/materialNodes";
import * as TSLNS from "three/tsl";
// TSL typings are too deep for tsc to check usefully (0107 §1): the graph is typed as TslNode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  clamp, dot, float, length, max, pow, reflect, smoothstep,
} = TSLNS as any;
/**
 * Sun sparkle and crest subsurface scatter (Greenheck study §1.8, §3.1 (4)
 * and (5)).
 *
 * **Sparkle** is a dedicated glint term, separate from the material's GGX
 * specular: `pow(sat(dot(reflect(−view, N), sunDir)), 512)` inside an
 * explicit distance window (fades in past `minDistM`, out by `fadeEndM`),
 * scaled by wave exposure. It is added after the specular and is NOT scaled
 * by the roughness distance-LOD — that LOD exists to stop fireflies from the
 * detail normals; the sparkle has its own bounded, filtered fade.
 *
 * **Crest SSS** is the backlit glow of a wave crest seen against the sun:
 * `pow(sat(dot(−view, sunDirXZ)), P) · sat(crest / ampRef)`, gated on wave
 * exposure (still marsh water never glows) and on sun elevation, tinted by
 * the water's transmission colour at the integration site.
 *
 * TS twins ↔ `SPARKLE_SSS_GLSL`. Edit both or neither.
 */
export const SPARKLE = {
  power: 512,
  minDistM: 8,
  nearFullM: 20,
  fadeStartM: 250,
  fadeEndM: 500,
  strength: 1.0,
} as const;

export const CREST_SSS = {
  power: 3,
  /** Crest height (m) at which the glow saturates. */
  ampRefM: 0.25,
  strength: 0.6,
  /** Sun elevation (unit y) over which the glow fades in from the horizon. */
  sunRiseY: 0.25,
} as const;

const sat = (v: number) => Math.min(Math.max(v, 0), 1);
const sstep = (e0: number, e1: number, x: number) => {
  const t = sat((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Distance window 0..1 of the sparkle term. */
export function sparkleWindow(distM: number): number {
  return sstep(SPARKLE.minDistM, SPARKLE.nearFullM, distM) * (1 - sstep(SPARKLE.fadeStartM, SPARKLE.fadeEndM, distM));
}

/** Sparkle weight for `cosR = dot(reflect(−view, N), sunDir)`. */
export function sparkleTerm(cosR: number, distM: number, exposure: number): number {
  return Math.pow(sat(cosR), SPARKLE.power) * sparkleWindow(distM) * sat(exposure) * SPARKLE.strength;
}

/** Crest scatter weight for `cosBack = dot(−view.xz, normalize(sunDir.xz))`. */
export function crestSssTerm(cosBack: number, crestM: number, exposure: number, sunY: number): number {
  return Math.pow(sat(cosBack), CREST_SSS.power) * sat(crestM / CREST_SSS.ampRefM) * sat(exposure)
    * sstep(0, CREST_SSS.sunRiseY, sunY) * CREST_SSS.strength;
}

/** TSL twins of sparkleWindow() / sparkleTerm() / crestSssTerm(). */
export function esSparkleWindow(dist: TslNode): TslNode {
  return (smoothstep(Number(SPARKLE.minDistM.toFixed(1)), Number(SPARKLE.nearFullM.toFixed(1)), dist) as TslNode)
    .mul(float(1.0).sub(smoothstep(Number(SPARKLE.fadeStartM.toFixed(1)), Number(SPARKLE.fadeEndM.toFixed(1)), dist)));
}
export function esSparkle(N: TslNode, view: TslNode, sunDir: TslNode, dist: TslNode, exposure: TslNode): TslNode {
  const cosR = max(dot(reflect((view as TslNode).negate(), N), sunDir), 0.0);
  return (pow(cosR, Number(SPARKLE.power.toFixed(1))) as TslNode).mul(esSparkleWindow(dist)).mul(clamp(exposure, 0.0, 1.0))
    .mul(Number(SPARKLE.strength.toFixed(2)));
}
export function esCrestSss(view: TslNode, sunDir: TslNode, crest: TslNode, exposure: TslNode): TslNode {
  const sd = sunDir as TslNode;
  const s = sd.xz.div(max(length(sd.xz), 1e-4));
  const back = max(dot((view as TslNode).xz.negate(), s), 0.0);
  return (pow(back, Number(CREST_SSS.power.toFixed(1))) as TslNode)
    .mul(clamp((crest as TslNode).div(Number(CREST_SSS.ampRefM.toFixed(2))), 0.0, 1.0))
    .mul(clamp(exposure, 0.0, 1.0)).mul(smoothstep(0.0, Number(CREST_SSS.sunRiseY.toFixed(2)), sd.y))
    .mul(Number(CREST_SSS.strength.toFixed(2)));
}
