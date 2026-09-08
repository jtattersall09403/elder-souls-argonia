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

export const SPARKLE_SSS_GLSL = /* glsl */ `
// KEEP IN LOCKSTEP with sparkleWindow() / sparkleTerm() / crestSssTerm().
float esSparkleWindow(float dist){
  return smoothstep(${SPARKLE.minDistM.toFixed(1)}, ${SPARKLE.nearFullM.toFixed(1)}, dist)
       * (1.0 - smoothstep(${SPARKLE.fadeStartM.toFixed(1)}, ${SPARKLE.fadeEndM.toFixed(1)}, dist));
}
float esSparkle(vec3 N, vec3 view, vec3 sunDir, float dist, float exposure){
  float cosR = max(dot(reflect(-view, N), sunDir), 0.0);
  return pow(cosR, ${SPARKLE.power.toFixed(1)}) * esSparkleWindow(dist) * clamp(exposure, 0.0, 1.0)
       * ${SPARKLE.strength.toFixed(2)};
}
float esCrestSss(vec3 view, vec3 sunDir, float crest, float exposure){
  vec2 s = sunDir.xz / max(length(sunDir.xz), 1e-4);
  float back = max(dot(-view.xz, s), 0.0);
  return pow(back, ${CREST_SSS.power.toFixed(1)}) * clamp(crest / ${CREST_SSS.ampRefM.toFixed(2)}, 0.0, 1.0)
       * clamp(exposure, 0.0, 1.0) * smoothstep(0.0, ${CREST_SSS.sunRiseY.toFixed(2)}, sunDir.y)
       * ${CREST_SSS.strength.toFixed(2)};
}
`;
