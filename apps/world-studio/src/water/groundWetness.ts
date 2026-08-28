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
if (uWetParams.z > 0.5) {
  float esWetExtent = uWetParams.z * uWetParams.w;
  vec2 esWetUv = vEsWorldPos.xz / esWetExtent;
  if (all(greaterThanEqual(esWetUv, vec2(0.0))) && all(lessThan(esWetUv, vec2(1.0)))) {
    float esWetShore = texture2D(uWetShore, esWetUv).r * uWetShoreMax;
    if (esWetShore < 22.0) {
      vec4 esWetT = texelFetch(uWetSurf, ivec2(esWetUv * uWetParams.z), 0);
      vec4 esWetK = texture2D(uWetKlass, vEsWorldPos.xz / uWetKlassExtent);
      float esWetW = uWetParams.x
        + ((esWetT.r * 255.0 * 256.0 + esWetT.g * 255.0) / 65535.0) * uWetParams.y
        + smoothstep(0.02, 0.15, esWetK.b) * uWetLevels.x
        + esWetK.a * uWetLevels.y;
      float esWetH = vEsWorldPos.y / uVerticalScale;
      // recent waterline = still level + swash reach (+ small headroom)
      float esWetLift = ${f(0.7 * SWASH.amplitudeM)} * max(1.0 - esWetShore / ${f(SWASH.bandM)}, 0.0) + 0.12;
      float esAbove = esWetH - esWetW;
      float esWet = (1.0 - smoothstep(esWetLift * 0.7, esWetLift * 1.5, esAbove))
                  * (1.0 - smoothstep(14.0, 22.0, esWetShore));
      esWet *= 0.85;
      diffuseColor.rgb *= 1.0 - 0.45 * esWet;
      roughnessFactor = mix(roughnessFactor, 0.3, esWet * 0.8);
    }
  }
}
#include <emissivemap_fragment>`,
      );
  };
}
