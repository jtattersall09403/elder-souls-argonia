import * as THREE from "three";
import { SWASH } from "@elder-souls/game-core/water/index";
import type { WaterAssets } from "./waterAssets";

/**
 * Shore wetness band on the TERRAIN (owner round 2: "when water retreats,
 * the land should look visibly wet"). The ground material samples the same
 * compiled water rasters and darkens + polishes the strip between the
 * current waterline and the swash/tide reach — the module-50 §36 "wetness
 * band", research doc §2 (closed-form recent waterline; no history buffer
 * needed because the runup is analytic).
 *
 * One shared uniform set: textures land when the water assets load; the
 * water mesh updates the tide/season levels every frame.
 */

export const wetnessUniforms = {
  uWetSurf: { value: null as THREE.Texture | null },
  uWetShore: { value: null as THREE.Texture | null },
  uWetKlass: { value: null as THREE.Texture | null },
  /** minM, span, sizePx (0 = off), metresPerPixel of the W raster. */
  uWetParams: { value: new THREE.Vector4(0, 1, 0, 3.65568) },
  uWetShoreMax: { value: 160 },
  uWetKlassExtent: { value: 7373 },
  /** x = tide offset, y = season offset (m). */
  uWetLevels: { value: new THREE.Vector2(0, 0) },
  /** Rain wetness 0..1 (Phase 8c weather machine; decays after rain). */
  uRainWet: { value: 0 },
  /** Wind wave scale (game-core, round 3): storm swash wets a higher band. */
  uWetWind: { value: 1 },
};

export function primeWetnessUniforms(assets: WaterAssets): void {
  const m = assets.meta;
  wetnessUniforms.uWetSurf.value = assets.surfaceTex;
  wetnessUniforms.uWetShore.value = assets.shoreTex;
  wetnessUniforms.uWetKlass.value = assets.klassTex;
  wetnessUniforms.uWetParams.value.set(
    m.surface.minM,
    m.surface.maxM - m.surface.minM,
    m.surface.size,
    m.surface.metresPerPixel,
  );
  wetnessUniforms.uWetShoreMax.value = m.surface.shoreMaxM ?? 160;
  wetnessUniforms.uWetKlassExtent.value = m.flow.size * m.flow.metresPerPixel;
}

const f = (v: number) => {
  const s = String(v);
  return s.includes(".") ? s : `${s}.0`;
};

const WETNESS_GLSL = /* glsl */ `
uniform sampler2D uWetSurf;
uniform sampler2D uWetShore;
uniform sampler2D uWetKlass;
uniform vec4 uWetParams;
uniform float uWetShoreMax;
uniform float uWetKlassExtent;
uniform vec2 uWetLevels;
uniform float uRainWet;
uniform float uWetWind;

// 16-bit water level at one texel of the W raster (r hi byte, g lo byte),
// normalised 0..1 of the surface span.
float esWetLvl(ivec2 t) {
  vec4 s = texelFetch(uWetSurf, clamp(t, ivec2(0), ivec2(uWetParams.z) - 1), 0);
  return (s.r * 255.0 * 256.0 + s.g * 255.0) / 65535.0;
}

// Cheap value noise for breaking the wet band's edge up (own hash — the
// aerial patch's noise is only present when both patches share a material).
float esWetHash(vec2 p) {
  return fract(sin(dot(p, vec2(157.31, 113.97))) * 43137.5453);
}
float esWetNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(esWetHash(i), esWetHash(i + vec2(1.0, 0.0)), f.x),
             mix(esWetHash(i + vec2(0.0, 1.0)), esWetHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/**
 * Chain onto a ground material AFTER its splat patch (and before the aerial
 * term is applied — the aerial pass declares vEsWorldPos ahead of everything
 * at compile time, so it is usable here).
 */
export function applyShoreWetness(material: THREE.Material): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, wetnessUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${WETNESS_GLSL}`)
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
float esWetTotal = 0.0;
if (uWetParams.z > 0.5) {
  float esWetExtent = uWetParams.z * uWetParams.w;
  vec2 esWetUv = vEsWorldPos.xz / esWetExtent;
  if (all(greaterThanEqual(esWetUv, vec2(0.0))) && all(lessThan(esWetUv, vec2(1.0)))) {
    vec3 esWetSS = texture2D(uWetShore, esWetUv).rgb; // shore, season, tannin
    float esWetShore = esWetSS.r * uWetShoreMax;
    if (esWetShore < 22.0) {
      // Manual bilinear over the 16-bit level raster: nearest texelFetch at
      // 3.66 m/px stepped the recent-waterline height, which — cut against a
      // height interpolated across the coarse far-LOD terrain triangles —
      // drew the wet band as triangle-shaped patches with dead-straight
      // edges (owner round 4 "squared wet-ground edges").
      vec2 esWetP = esWetUv * uWetParams.z - 0.5;
      ivec2 esWetP0 = ivec2(floor(esWetP));
      vec2 esWetF = fract(esWetP);
      float esWetLevel = mix(
        mix(esWetLvl(esWetP0), esWetLvl(esWetP0 + ivec2(1, 0)), esWetF.x),
        mix(esWetLvl(esWetP0 + ivec2(0, 1)), esWetLvl(esWetP0 + ivec2(1, 1)), esWetF.x),
        esWetF.y);
      vec4 esWetK = texture2D(uWetKlass, vEsWorldPos.xz / uWetKlassExtent);
      float esWetW = uWetParams.x
        + esWetLevel * uWetParams.y
        + smoothstep(0.02, 0.15, esWetK.b) * uWetLevels.x
        + esWetSS.g * uWetLevels.y;
      float esWetH = vEsWorldPos.y / uVerticalScale;
      // recent waterline = still level + swash reach (+ small headroom);
      // wind-scaled like the swash itself (game-core surfWindScale twin)
      float esWetLift = ${f(0.7 * SWASH.amplitudeM)} * clamp(pow(uWetWind, 0.8), 0.6, 3.2)
        * max(1.0 - esWetShore / ${f(SWASH.bandM)}, 0.0) + 0.12;
      // Organic edge: two octaves of world-space noise wobble the band's
      // reach (real swash never leaves a ruler line), and a soft coverage
      // ramble keeps the interior from reading flat.
      float esWetN = 0.65 * esWetNoise(vEsWorldPos.xz * 0.35)
                   + 0.35 * esWetNoise(vEsWorldPos.xz * 1.7);
      float esAbove = esWetH - esWetW + (esWetN - 0.5) * esWetLift * 0.9;
      float esWet = (1.0 - smoothstep(esWetLift * 0.55, esWetLift * 1.65, esAbove))
                  * (1.0 - smoothstep(14.0, 22.0, esWetShore))
                  * (0.8 + 0.4 * esWetN);
      // swash never wets steep walls (research §3) — kills dark stripes on
      // gorge sides
      esWet *= smoothstep(0.78, 0.9, normalize(esNrmW).y);
      esWetTotal = esWet * 0.85;
    }
  }
}
// Rain wetness (Phase 8c): global decaying scalar from the weather machine,
// suppressed per-pixel under canopy (climate-air B — sheltered ground stays
// dry under the deep forest) and slightly on steep faces (water runs off).
if (uRainWet > 0.003) {
  vec2 esRwUv = vec2(vEsWorldPos.x / uProvinceExtentM, 1.0 - vEsWorldPos.z / uProvinceExtentM);
  float esRwCanopy = texture2D(uClimateAir, esRwUv).b;
  float esRainWet = uRainWet * (1.0 - 0.75 * esRwCanopy)
    * (0.55 + 0.45 * smoothstep(0.55, 0.85, normalize(esNrmW).y)) * 0.8;
  esWetTotal = max(esWetTotal, esRainWet);
}
if (esWetTotal > 0.003) {
  diffuseColor.rgb *= 1.0 - 0.45 * esWetTotal;
  roughnessFactor = mix(roughnessFactor, 0.3, esWetTotal * 0.8);
}
#include <emissivemap_fragment>`,
      );
  };
}
