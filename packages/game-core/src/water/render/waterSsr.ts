export const WATER_SSR_STEPS = 18;
const FIRST_STEP_M = 0.12;
const STEP_GROWTH = 1.45;

/** Diagnostic schedule: resolve nearby hulls before spending long rays on
 * distant scenery. The old first sample2.2m away skipped close contacts. */
export function waterSsrDistances(): number[] {
  let distance = 0, step = FIRST_STEP_M;
  return Array.from({ length: WATER_SSR_STEPS }, () => {
    distance += step; step *= STEP_GROWTH; return distance;
  });
}

export const WATER_SSR_GLSL = /* glsl */ `
#define ES_SSR 1
vec4 esSsr(vec3 ro, vec3 rd) {
  vec3 originView = (viewMatrix * vec4(ro, 1.0)).xyz;
  vec3 directionView = (viewMatrix * vec4(rd, 0.0)).xyz;
  float distanceM = 0.0;
  float previousDistance = 0.0;
  float previousDiff = -0.01;
  float stepM = ${FIRST_STEP_M};
  for (int i = 0; i < ${WATER_SSR_STEPS}; i++) {
    distanceM += stepM;
    vec3 rayView = originView + directionView * distanceM;
    vec4 clip = uProjMatrix * vec4(rayView, 1.0);
    if (clip.w <= 0.0) break;
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) break;
    float sceneEye = esEyeDepth(uv);
    float diff = -rayView.z - sceneEye;
    if (previousDiff <= 0.0 && diff > 0.0 && sceneEye < uCamFar * 0.9) {
      float lo = previousDistance, hi = distanceM;
      vec2 hitUV = uv;
      float hitDiff = diff;
      for (int refine = 0; refine < 4; refine++) {
        float mid = (lo + hi) * 0.5;
        vec3 testView = originView + directionView * mid;
        vec4 testClip = uProjMatrix * vec4(testView, 1.0);
        vec2 testUV = testClip.xy / testClip.w * 0.5 + 0.5;
        float testDiff = -testView.z - esEyeDepth(testUV);
        if (testDiff > 0.0) { hi = mid; hitUV = testUV; hitDiff = testDiff; }
        else lo = mid;
      }
      // Depth discontinuities are not solid eight-metre slabs. Reject
      // unrelated foreground silhouettes instead of smearing them on water.
      float thickness = 0.12 + min(1.5, hi * 0.006);
      float confidence = 1.0 - smoothstep(thickness * 0.3, thickness, hitDiff);
      vec2 edge = smoothstep(0.0, 0.12, hitUV) * smoothstep(0.0, 0.12, 1.0 - hitUV);
      confidence *= edge.x * edge.y * (1.0 - float(i) / ${WATER_SSR_STEPS}.0 * 0.4);
      if (confidence > 0.001) return vec4(texture2D(uSceneColor, hitUV).rgb, confidence);
    }
    previousDistance = distanceM;
    previousDiff = diff;
    stepM *= ${STEP_GROWTH};
  }
  return vec4(0.0);
}
`;
