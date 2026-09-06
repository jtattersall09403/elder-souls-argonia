/** CPU twin: WaterData's owner-aware access/tide/season sampler. Packed RG16
 * is affine, but different owners' barriers and level responses must never
 * blend. Shared by water and opaque receiving materials. */
export const CONNECTED_STAGE_GLSL = /* glsl */ `
vec4 esOwnedRaster(vec2 worldXZ, sampler2D field, sampler2D supportMap,
  float size, float mpp, float origin) {
  vec2 pixel = clamp((worldXZ - origin) / mpp, vec2(0.0), vec2(size - 1.0));
  ivec2 limit = ivec2(int(size) - 1);
  ivec2 base = ivec2(floor(pixel));
  ivec2 nearest = min(ivec2(floor(pixel + 0.5)), limit);
  vec2 owner = texelFetch(supportMap, nearest, 0).gb;
  vec2 f = fract(pixel);
  vec4 result = vec4(0.0);
  float total = 0.0;
  for (int z = 0; z < 2; z++) for (int x = 0; x < 2; x++) {
    ivec2 p = min(base + ivec2(x, z), limit);
    if (any(greaterThan(abs(texelFetch(supportMap, p, 0).gb - owner), vec2(0.5 / 255.0)))) continue;
    float weight = (x == 0 ? 1.0 - f.x : f.x) * (z == 0 ? 1.0 - f.y : f.y);
    result += texelFetch(field, p, 0) * weight;
    total += weight;
  }
  return result / max(total, 0.000001);
}
vec3 esConnectedStage(vec2 worldXZ, sampler2D surfaceMap, sampler2D supportMap,
  sampler2D shoreMap, float size, float mpp, float origin, float minimum, float span) {
  vec2 pixel = clamp((worldXZ - origin) / mpp, vec2(0.0), vec2(size - 1.0));
  ivec2 limit = ivec2(int(size) - 1);
  ivec2 base = ivec2(floor(pixel));
  ivec2 nearest = min(ivec2(floor(pixel + 0.5)), limit);
  vec2 owner = texelFetch(supportMap, nearest, 0).gb;
  vec2 f = fract(pixel);
  vec3 result = vec3(0.0);
  float total = 0.0;
  for (int z = 0; z < 2; z++) {
    for (int x = 0; x < 2; x++) {
      ivec2 p = min(base + ivec2(x, z), limit);
      vec2 candidate = texelFetch(supportMap, p, 0).gb;
      if (any(greaterThan(abs(candidate - owner), vec2(0.5 / 255.0)))) continue;
      float weight = (x == 0 ? 1.0 - f.x : f.x) * (z == 0 ? 1.0 - f.y : f.y);
      // Packed after PNG decoding; original CPU RGB/access arrays unchanged.
      vec3 access = vec3(texelFetch(supportMap, p, 0).a,
        texelFetch(shoreMap, p, 0).a, texelFetch(surfaceMap, p, 0).a);
      float threshold = minimum + dot(access.rg, vec2(65280.0, 255.0)) / 65535.0 * span;
      result += vec3(threshold, access.b, texelFetch(shoreMap, p, 0).g) * weight;
      total += weight;
    }
  }
  return result / max(total, 0.000001);
}
`;
