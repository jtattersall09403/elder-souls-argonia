/** Refraction-map Jacobian for the interactive surface. Unlike decorative
 * caustic noise, moving a body changes these focused rays through the same
 * height/slope field used by the visible surface and physical queries.
 * Receiver material supplies direct-light shadowing; this is not emission.
 */
export const LOCAL_WATER_CAUSTICS_GLSL = /* glsl */ `
vec2 esLocalRefractedOffset(vec2 p, vec3 sunDirection, float depth) {
  vec4 water = esLocalWaterSurface(p);
  vec3 normal = normalize(vec3(-water.y, 1.0, -water.z));
  vec3 ray = refract(-sunDirection, normal, 1.0 / 1.333);
  return ray.xz / max(-ray.y, 0.15) * max(0.0, depth + water.x);
}
float esLocalWaterCaustic(vec3 receiver, vec3 receiverNormal, float level, vec3 sunDirection) {
  // Derivatives must execute before any per-pixel dry/depth branch.
  float footprint = max(length(dFdx(receiver.xz)), length(dFdy(receiver.xz)));
  float depth = level - receiver.y;
  if (uLocalWaterActive < 0.5 || depth <= 0.03 || depth > 12.0 || sunDirection.y <= 0.05) return 0.0;
  vec3 flatRay = refract(-sunDirection, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
  vec2 p = receiver.xz - flatRay.xz / max(-flatRay.y, 0.15) * depth;
  if (esLocalWaterMask(p) < 0.5) return 0.0;
  float stepM = max(uLocalWaterInfo.z, 0.25);
  // A dry/foreign neighbour is not a flat water sample. Differentiating
  // across that discontinuity makes a spurious bright rectangular bank.
  if (min(min(esLocalWaterMask(p + vec2(stepM, 0.0)), esLocalWaterMask(p - vec2(stepM, 0.0))),
          min(esLocalWaterMask(p + vec2(0.0, stepM)), esLocalWaterMask(p - vec2(0.0, stepM)))) < 0.5) return 0.0;
  vec2 dx = (esLocalRefractedOffset(p + vec2(stepM, 0.0), sunDirection, depth)
           - esLocalRefractedOffset(p - vec2(stepM, 0.0), sunDirection, depth)) / (2.0 * stepM);
  vec2 dz = (esLocalRefractedOffset(p + vec2(0.0, stepM), sunDirection, depth)
           - esLocalRefractedOffset(p - vec2(0.0, stepM), sunDirection, depth)) / (2.0 * stepM);
  float jacobian = (1.0 + dx.x) * (1.0 + dz.y) - dx.y * dz.x;
  float focused = clamp(1.0 / max(abs(jacobian), 0.1), 0.25, 3.0) - 1.0;
  return focused * (1.0 - smoothstep(stepM * 0.5, stepM * 2.0, footprint))
    * smoothstep(0.5, 0.9, receiverNormal.y) * exp(-depth * 0.12);
}
`;

/** CPU optical oracle for probes: the same central-difference refraction
 * Jacobian as the shader, before receiver attenuation and pixel filtering.
 * Returns a relative direct-light change, not an emissive intensity.
 */
export function localWaterFocus(
  sample: (x: number, z: number) => { height: number; slopeX: number; slopeZ: number } | null,
  x: number, z: number, depth: number, sun: readonly [number, number, number], cellSizeM: number,
): number {
  if (depth <= 0.03 || depth > 12 || sun[1] <= 0.05 || !sample(x, z)) return 0;
  const step = Math.max(cellSizeM, 0.25);
  const offset = (px: number, pz: number): [number, number] | null => {
    const water = sample(px, pz);
    if (!water) return null;
    const nLength = Math.hypot(water.slopeX, 1, water.slopeZ);
    const nx = -water.slopeX / nLength, ny = 1 / nLength, nz = -water.slopeZ / nLength;
    const eta = 1 / 1.333;
    const dot = -(sun[0] * nx + sun[1] * ny + sun[2] * nz);
    const normalScale = eta * dot + Math.sqrt(Math.max(0, 1 - eta * eta * (1 - dot * dot)));
    const rx = -eta * sun[0] - normalScale * nx;
    const ry = -eta * sun[1] - normalScale * ny;
    const rz = -eta * sun[2] - normalScale * nz;
    const distance = Math.max(0, depth + water.height) / Math.max(-ry, 0.15);
    return [rx * distance, rz * distance];
  };
  const xp = offset(x + step, z), xm = offset(x - step, z);
  const zp = offset(x, z + step), zm = offset(x, z - step);
  if (!xp || !xm || !zp || !zm) return 0;
  const xx = (xp[0] - xm[0]) / (2 * step), xz = (xp[1] - xm[1]) / (2 * step);
  const zx = (zp[0] - zm[0]) / (2 * step), zz = (zp[1] - zm[1]) / (2 * step);
  const determinant = (1 + xx) * (1 + zz) - xz * zx;
  return Math.max(0.25, Math.min(3, 1 / Math.max(Math.abs(determinant), 0.1))) - 1;
}
