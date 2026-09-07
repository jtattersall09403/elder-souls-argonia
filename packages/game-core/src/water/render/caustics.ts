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

/** Fragment-shader helpers; no uniforms, textures, global state or material
 * ownership. Caller injects sampled receiver/water/light data. Multiply the
 * lit receiver colour by (1 + strength * esWaterCaustics(...)) BEFORE the
 * water absorption/fog step. Call once per receiver, not again on fog colour.
 * Derivatives require WebGL2 (the game's baseline).
 */
export const WATER_CAUSTICS_GLSL = /* glsl */ `
float esCausticVisibility(float depthM, float turbidity, float tannin,
  float sunElevation, float receiverIncidence, float directLightVisibility,
  float waveActivity) {
  if (depthM <= 0.0 || sunElevation <= 0.0) return 0.0;
  float sunY = clamp(sunElevation, 0.0, 1.0);
  float eta = 1.0 / 1.333;
  float refractedCosine = sqrt(1.0 - eta * eta * (1.0 - sunY * sunY));
  float opticalPath = depthM / refractedCosine;
  float extinction = 0.10 + 2.4 * clamp(turbidity, 0.0, 1.0)
    + 2.1 * clamp(tannin, 0.0, 1.0);
  return smoothstep(0.01, 0.06, depthM)
    * (1.0 - smoothstep(3.0, 7.0, depthM))
    * smoothstep(0.015, 0.2, sunY)
    * clamp(receiverIncidence, 0.0, 1.0)
    * clamp(directLightVisibility, 0.0, 1.0)
    * clamp(waveActivity, 0.0, 1.0)
    * exp(-extinction * opticalPath);
}

void esCausticCurvature(inout vec3 curvature, vec2 p, vec2 direction,
  float frequency, float amplitude, float phase) {
  float hessian = -amplitude * frequency * frequency
    * sin(dot(p, direction) * frequency + phase);
  curvature += hessian * vec3(direction.x * direction.x,
    direction.x * direction.y, direction.y * direction.y);
}

// Approximate density of rays focused by four crossing capillary-gravity
// wave bands. The Jacobian determinant forms connected folds rather than
// a scrolling painted texture. Finite width prevents singular highlights.
float esCausticFocus(vec2 projectedMetres, float depthM, float timeS) {
  vec3 curvature = vec3(0.0);
  esCausticCurvature(curvature, projectedMetres, vec2(1.0, 0.0), 5.9, 0.035, -timeS * 3.1);
  esCausticCurvature(curvature, projectedMetres, vec2(0.6, 0.8), 8.3, 0.023, -timeS * 3.7 + 1.4);
  esCausticCurvature(curvature, projectedMetres, vec2(-0.8, 0.6), 4.1, 0.050, -timeS * 2.4 + 2.8);
  esCausticCurvature(curvature, projectedMetres, vec2(0.28, -0.96), 10.7, 0.012, -timeS * 4.2 + 0.6);
  float focusDistance = (1.0 - 1.0 / 1.333) * min(depthM, 5.0);
  vec3 lens = curvature * focusDistance;
  float jacobianDet = (1.0 + lens.x) * (1.0 + lens.z) - lens.y * lens.y;
  float footprint = max(length(dFdx(projectedMetres)), length(dFdy(projectedMetres)));
  float width = max(0.20, fwidth(jacobianDet));
  float focus = clamp((1.0 / max(abs(jacobianDet), width) - 1.0) * 0.5, 0.0, 1.0);
  // Nyquist on the ACTUAL bands above: the longest is 2*pi/4.1 = 1.53 m, so
  // the pattern only starts to alias near a 0.77 m pixel footprint. The old
  // 0.08-0.35 m band faded caustics out about three metres from the camera.
  return focus * (1.0 - smoothstep(0.35, 1.2, footprint));
}

float esWaterCaustics(vec3 worldPositionMetres, vec3 receiverNormalWorld,
  float waterSurfaceMetres, float turbidity, float tannin,
  vec3 sunDirectionToLight, float directLightVisibility,
  float waveTimeSeconds, float waveActivity) {
  vec3 sun = sunDirectionToLight / max(length(sunDirectionToLight), 0.0001);
  vec3 lightRay = refract(-sun, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
  float depthM = waterSurfaceMetres - worldPositionMetres.y;
  vec3 receiverNormal = receiverNormalWorld / max(length(receiverNormalWorld), 0.0001);
  float visibility = esCausticVisibility(depthM, turbidity, tannin, sun.y,
    dot(receiverNormal, -lightRay), directLightVisibility, waveActivity);
  // Always evaluate derivative-bearing focus uniformly. Returning early in
  // a shoreline/shadow branch gives undefined derivatives on mixed quads.
  vec2 projectedMetres = worldPositionMetres.xz
    - lightRay.xz * max(depthM, 0.0) / max(-lightRay.y, 0.1);
  return visibility * esCausticFocus(projectedMetres, max(depthM, 0.0), waveTimeSeconds);
}
`;
