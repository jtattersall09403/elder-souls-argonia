/** Uses the existing native/hero atlas; no additional texture sampler. */
export const MARINE_COVERAGE_GLSL = /* glsl */ `
uniform vec4 uMarineCoverageInfo; // scalar offset, square stride, tile metres, enabled
uniform vec4 uMarineNearRects[4]; // minX,minZ,maxX,maxZ; displayed geometry only
uniform int uMarineNearCount;
bool esMarineReplaced(vec2 p, float mode) {
  if (uMarineCoverageInfo.w < 0.5 || mode > -0.5 || mode < -2.5) return false;
  if (mode > -1.5) {
    ivec2 tile = ivec2(floor(p / uMarineCoverageInfo.z));
    int stride = int(uMarineCoverageInfo.y);
    if (any(lessThan(tile, ivec2(0))) || any(greaterThanEqual(tile, ivec2(stride)))) return false;
    return esNativeScalar(int(uMarineCoverageInfo.x) + tile.y * stride + tile.x) > 0.5;
  }
  for (int i = 0; i < 4; i++) {
    if (i >= uMarineNearCount) break;
    vec4 r = uMarineNearRects[i];
    if (all(greaterThanEqual(p, r.xy)) && all(lessThan(p, r.zw))) return true;
  }
  return false;
}
`;

/** Test/reference twin of the mutually exclusive geometry replacement rule. */
export function marineReplaced(mode: number, x: number, z: number, mask: Float32Array,
  stride: number, tileM: number, near: readonly (readonly [number, number, number, number])[]): boolean {
  if (mode > -.5 || mode < -2.5) return false;
  if (mode > -1.5) {
    const tx = Math.floor(x / tileM), tz = Math.floor(z / tileM);
    return tx >= 0 && tz >= 0 && tx < stride && tz < stride && mask[tz * stride + tx] > .5;
  }
  return near.some(([minX, minZ, maxX, maxZ]) => x >= minX && z >= minZ && x < maxX && z < maxZ);
}
