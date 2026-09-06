/** Irregular bubble groups in an advected foam patch. Neighbour search keeps
 * cell edges invisible; footprint-integrated rings do not become stripes
 * when individual bubbles shrink below a pixel. No bitmap asset is created.
 */
export const PARTICLE_FOAM_GLSL = /* glsl */ `
vec3 esBubbleRandom(vec2 cell) {
  vec3 p = fract(vec3(cell.x, cell.y, cell.x) * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yzz) * p.zyx);
}
float esParticleFoam(vec2 p, float phase) {
  vec2 cells = p * 4.0 + vec2(sin(phase), cos(phase));
  vec2 origin = floor(cells);
  float pixel = max(0.006, max(length(dFdx(cells)), length(dFdy(cells))));
  float coverage = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 cell = origin + vec2(float(x), float(y));
    vec3 random = esBubbleRandom(cell + floor(phase * 7.0));
    vec2 centre = cell + 0.05 + random.xy * 0.9;
    float distanceM = length(cells - centre);
    float radius = 0.12 + random.z * 0.18;
    float outer = smoothstep(-pixel, pixel, radius + 0.025 - distanceM);
    float inner = smoothstep(-pixel, pixel, radius - 0.025 - distanceM);
    coverage = max(coverage, (outer - inner) * smoothstep(0.2, 0.55, random.z));
  }
  return coverage;
}
`;

/** Probe twin of the finite-width ring's pixel integral. */
export function bubbleRingCoverage(distance: number, radius: number, pixel: number): number {
  const width = Math.max(0.006, pixel);
  const smooth = (v: number) => {
    const t = Math.max(0, Math.min(1, (v + width) / (2 * width)));
    return t * t * (3 - 2 * t);
  };
  return smooth(radius + 0.025 - distance) - smooth(radius - 0.025 - distance);
}
