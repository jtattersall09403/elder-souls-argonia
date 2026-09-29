import * as tsl from "three/tsl";
import { sel, type TslNode } from "../../render/nodes/materialNodes";

// Loosely typed on purpose (docs/standards/tsl-shaders.md §1).
const { clamp, dFdx, dFdy, exp, float, fwidth, length, max, min, refract, sin, smoothstep: nodeSmoothstep, sqrt, vec2, vec3 } = tsl as TslNode;

/** Projected shallow-water light focusing shared by refraction and the
 * underwater composite. Coordinates are world metres (undo display-only
 * verticalScale before calling); phase uses the same seconds as water waves.
 *
 * This is an analytic lens approximation, not a photon simulation. Its
 * physical visibility gates matter as much as the animated pattern: never
 * add caustics to ambient light, sky pixels, or an unlit/shadowed receiver.
 * Projection reference: GPU Gems, chapter 2, Rendering Water Caustics.
 * https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics
 */

export interface CausticVisibilityInput {
  /** Surface height minus receiver height, metres. */
  depthM: number;
  turbidity: number;
  tannin: number;
  /** Y component of the unit direction from the surface toward the sun. */
  sunElevation: number;
  /** Dot(receiver normal, direction toward refracted light), clamped 0…1. */
  receiverIncidence: number;
  /** Combined direct sun/cloud/shadow visibility, 0…1; never ambient light. */
  directLightVisibility: number;
  /** Resolved small-wave activity, 0 for a perfectly still surface, 1 lively. */
  waveActivity: number;
}

/** Tannin darkens focused light but must not extinguish it: Black Marsh
 * water is stained almost everywhere, and a coefficient that kills caustics
 * there kills them in the whole province. Halved from the 4.2 of round 1. */
const TANNIN_EXTINCTION = 2.1;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** CPU twin of esCausticVisibility for probes and capability decisions. */
export function causticVisibility(input: CausticVisibilityInput): number {
  const { depthM, sunElevation } = input;
  if (depthM <= 0 || sunElevation <= 0) return 0;
  const sunY = clamp01(sunElevation);
  const eta = 1 / 1.333;
  const refractedCosine = Math.sqrt(1 - eta * eta * (1 - sunY * sunY));
  const opticalPath = depthM / refractedCosine;
  const extinction = 0.10 + 2.4 * clamp01(input.turbidity) + TANNIN_EXTINCTION * clamp01(input.tannin);
  return smoothstep(0.01, 0.06, depthM)
    * (1 - smoothstep(3, 7, depthM))
    * smoothstep(0.015, 0.2, sunY)
    * clamp01(input.receiverIncidence)
    * clamp01(input.directLightVisibility)
    * clamp01(input.waveActivity)
    * Math.exp(-extinction * opticalPath);
}

/** Node helpers (TSL twins of the old WATER_CAUSTICS_GLSL); no uniforms,
 * textures, global state or material ownership. Caller injects sampled
 * receiver/water/light data. Derivative-bearing: call at the top level of a
 * fragment graph (never inside an `If`), as the GLSL required. */
export function esCausticVisibility(depthM: TslNode, turbidity: TslNode, tannin: TslNode,
  sunElevation: TslNode, receiverIncidence: TslNode, directLightVisibility: TslNode,
  waveActivity: TslNode): TslNode {
  const d = float(depthM), sunE = float(sunElevation);
  const sunY = clamp(sunE, 0.0, 1.0);
  const eta = 1.0 / 1.333;
  const refractedCosine = sqrt(float(1.0).sub(float(eta * eta).mul(float(1.0).sub(sunY.mul(sunY)))));
  const opticalPath = d.div(refractedCosine);
  const extinction = float(0.10).add(float(2.4).mul(clamp(turbidity, 0.0, 1.0)))
    .add(float(TANNIN_EXTINCTION).mul(clamp(tannin, 0.0, 1.0)));
  const value = nodeSmoothstep(0.01, 0.06, d)
    .mul(float(1.0).sub(nodeSmoothstep(3.0, 7.0, d)))
    .mul(nodeSmoothstep(0.015, 0.2, sunY))
    .mul(clamp(receiverIncidence, 0.0, 1.0))
    .mul(clamp(directLightVisibility, 0.0, 1.0))
    .mul(clamp(waveActivity, 0.0, 1.0))
    .mul(exp(extinction.negate().mul(opticalPath)));
  return sel(d.lessThanEqual(0.0).or(sunE.lessThanEqual(0.0)), float(0.0), value);
}

/** The four crossing capillary-gravity bands: direction, frequency, amplitude,
 * phase rate and phase offset (hessian of each summed into the curvature). */
const CAUSTIC_BANDS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [1.0, 0.0, 5.9, 0.035, 3.1, 0.0],
  [0.6, 0.8, 8.3, 0.023, 3.7, 1.4],
  [-0.8, 0.6, 4.1, 0.050, 2.4, 2.8],
  [0.28, -0.96, 10.7, 0.012, 4.2, 0.6],
];

/** Approximate density of rays focused by four crossing capillary-gravity
 * wave bands. The Jacobian determinant forms connected folds rather than a
 * scrolling painted texture. Finite width prevents singular highlights. */
export function esCausticFocus(projectedMetres: TslNode, depthM: TslNode, timeS: TslNode): TslNode {
  const p = vec2(projectedMetres);
  let curvature: TslNode = vec3(0.0);
  for (const [dx, dz, frequency, amplitude, rate, offset] of CAUSTIC_BANDS) {
    const phase = float(timeS).mul(-rate).add(offset);
    const hessian = float(-amplitude * frequency * frequency)
      .mul(sin(p.dot(vec2(dx, dz)).mul(frequency).add(phase)));
    curvature = curvature.add(hessian.mul(vec3(dx * dx, dx * dz, dz * dz)));
  }
  const focusDistance = float(1.0 - 1.0 / 1.333).mul(min(depthM, 5.0));
  const lens = curvature.mul(focusDistance);
  const jacobianDet = float(1.0).add(lens.x).mul(float(1.0).add(lens.z)).sub(lens.y.mul(lens.y));
  const footprint = max(length(dFdx(p)), length(dFdy(p)));
  const width = max(0.20, fwidth(jacobianDet));
  const focus = clamp(float(1.0).div(max(jacobianDet.abs(), width)).sub(1.0).mul(0.5), 0.0, 1.0);
  // Nyquist on the ACTUAL bands above: the longest is 2*pi/4.1 = 1.53 m, so
  // the pattern only starts to alias near a 0.77 m pixel footprint.
  return focus.mul(float(1.0).sub(nodeSmoothstep(0.35, 1.2, footprint)));
}

/** Multiply the lit receiver's direct light by (strength * this). Coordinates
 * are world metres (undo display-only verticalScale before calling). */
export function esWaterCaustics(worldPositionMetres: TslNode, receiverNormalWorld: TslNode,
  waterSurfaceMetres: TslNode, turbidity: TslNode, tannin: TslNode,
  sunDirectionToLight: TslNode, directLightVisibility: TslNode,
  waveTimeSeconds: TslNode, waveActivity: TslNode): TslNode {
  const position = vec3(worldPositionMetres);
  const sun = vec3(sunDirectionToLight).div(max(length(sunDirectionToLight), 0.0001));
  const lightRay = refract(sun.negate(), vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
  const depthM = float(waterSurfaceMetres).sub(position.y);
  const receiverNormal = vec3(receiverNormalWorld).div(max(length(receiverNormalWorld), 0.0001));
  const visibility = esCausticVisibility(depthM, turbidity, tannin, sun.y,
    receiverNormal.dot(lightRay.negate()), directLightVisibility, waveActivity);
  // Always evaluate derivative-bearing focus uniformly (mixed quads).
  const projectedMetres = position.xz
    .sub(lightRay.xz.mul(max(depthM, 0.0)).div(max(lightRay.y.negate(), 0.1)));
  return visibility.mul(esCausticFocus(projectedMetres, max(depthM, 0.0), waveTimeSeconds));
}
