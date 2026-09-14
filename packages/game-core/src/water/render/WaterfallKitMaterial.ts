import * as THREE from "three";
import { WHITEWATER_GLSL, FALLS_SHADOW_VERTEX_PARS, FALLS_SHADOW_VERTEX, FALLS_SHADOW_FRAGMENT_PARS,
  STREAK_BREATHE_PERIOD_S, STREAK_BREATHE_AMPLITUDE } from "./whitewaterStreaks";
import type { KitShapeRole } from "./WaterfallKit";
import { POOL_FADE_M } from "./WaterfallKitStack";

/**
 * The one material family every vanilla FX piece is drawn with (decision
 * 0064): Bethesda's geometry and textures, our shading. Per shape role it
 * reproduces the UV-scroll controllers the export dropped (audit §4), a
 * second layer of the same texture at a near-but-unequal rate, the slow U
 * drift and the U-scale breathe on the thin sheets; alpha blend, depth-write
 * off, double-sided; the edge-on fade (cos 0.26 → 0.09, audit §7); a soft
 * depth fade per layer against the scene depth; unlit emissive grey or white
 * times the shared falls irradiance (`whitewaterStreaks.esFallsIrradianceG`)
 * under the scene's CSM shadow, so a piece exposes like the strip whitewater
 * and the pool foam beside it; nothing drawn from under water; geometry
 * below the receiving pool fades out.
 *
 * The `lit` kind (the bodies' inner water shell, `fxwatertile01` + normal)
 * is the one lit surface: albedo × irradiance plus a sun highlight from the
 * scrolling normal map, so the body reads as water under the whitewater.
 *
 * Instanced: `instanceMatrix` from the stack, `aInst` = (phase s, pool y,
 * reserved, alpha scale). `uVerticalScale` is applied to the WORLD y after
 * the instance transform, like every other water mesh.
 */

export interface KitSharedUniforms {
  uTime: { value: number };
  uVerticalScale: { value: number };
  uAmbient: { value: THREE.Vector3 };
  uSunLight: { value: THREE.Vector3 };
  uSunDir: { value: THREE.Vector3 };
  uSceneDepth: { value: THREE.Texture | null };
  uHasDepth: { value: number };
  uCamNear: { value: number };
  uCamFar: { value: number };
  uResolution: { value: THREE.Vector2 };
  uOpacity: { value: number };
  uUnderwater: { value: number };
  /** Season/tide lift of the receiving pools (m). */
  uLift: { value: number };
}

export function createKitSharedUniforms(): KitSharedUniforms {
  return {
    uTime: { value: 0 },
    uVerticalScale: { value: 1 },
    uAmbient: { value: new THREE.Vector3(0.2, 0.2, 0.2) },
    uSunLight: { value: new THREE.Vector3(1, 1, 1) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSceneDepth: { value: null },
    uHasDepth: { value: 0 },
    uCamNear: { value: 0.3 },
    uCamFar: { value: 60000 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uOpacity: { value: 1 },
    uUnderwater: { value: 0 },
    uLift: { value: 0 },
  };
}

/** Edge-on fade: opacity 1 → 0 between cos 0.26 and cos 0.09 (audit §7). */
export const KIT_FACING_FADE = { start: 0.09, full: 0.26 } as const;

const VERTEX = /* glsl */ `
attribute vec4 aInst;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec4 vInst;
uniform float uVerticalScale;
uniform float uLift;
${FALLS_SHADOW_VERTEX_PARS}
void main() {
  vUv = uv;
  vInst = aInst;
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  // the receiving pool moves with the season/tide; the whole piece rides it
  wp.y = (wp.y + uLift) * uVerticalScale;
  vec3 esShadowVertex = wp.xyz;
  // three's shadow chunk offsets along transformedNormal when the geometry
  // has normals (HAS_NORMAL): the kit meshes do, so it must exist
  vec3 transformedNormal = normalize(normalMatrix * (mat3(instanceMatrix) * normal));
  ${FALLS_SHADOW_VERTEX}
  vWorldPos = worldPosition.xyz;
  vNormalW = normalize(mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec4 vInst;
uniform float uTime;
uniform vec3 uAmbient;
uniform vec3 uSunLight;
uniform vec3 uSunDir;
uniform sampler2D uSceneDepth;
uniform float uHasDepth;
uniform float uCamNear;
uniform float uCamFar;
uniform vec2 uResolution;
uniform float uOpacity;
uniform float uUnderwater;
uniform float uVerticalScale;
uniform float uLift;
uniform sampler2D uTex;
#ifdef ES_KIT_NORMAL
uniform sampler2D uNormalTex;
#endif
uniform vec2 uScroll;
uniform vec2 uScroll2;
uniform float uHasScroll2;
uniform float uBreathe;
uniform float uEmissive;
uniform float uAlpha;
uniform float uSoftDepthM;
uniform float uUpness;
uniform float uLit;
uniform float uCovLum;
#include <common>
${FALLS_SHADOW_FRAGMENT_PARS}
${WHITEWATER_GLSL}
void main() {
  float t = uTime + vInst.x;
  // Bethesda's controllers: the UV offset ramps linearly, forever; the thin
  // sheets also breathe their U scale 1.00 -> 1.05 -> 1.00 over 8.33 s
  float breathe = 1.0 + uBreathe * ${STREAK_BREATHE_AMPLITUDE.toFixed(2)}
    * 0.5 * (1.0 - cos(6.2831853 * t / ${STREAK_BREATHE_PERIOD_S.toFixed(2)}));
  vec2 uv1 = vec2(vUv.x * breathe, vUv.y) + uScroll * t;
  const vec3 LUMW = vec3(0.2126, 0.7152, 0.0722);
  vec4 s1 = texture2D(uTex, uv1);
  // coverage: alpha, or (greyscale-to-alpha textures) the grey itself
  float cov = s1.a * (uCovLum > 0.5 ? pow(dot(s1.rgb, LUMW), 2.0) : 1.0);
  vec3 tone = s1.rgb;
  if (uHasScroll2 > 0.5) {
    vec4 s2 = texture2D(uTex, vec2(vUv.x * breathe + 0.37, vUv.y + 0.11) + uScroll2 * t);
    float cov2 = s2.a * (uCovLum > 0.5 ? pow(dot(s2.rgb, LUMW), 2.0) : 1.0);
    cov = 1.0 - (1.0 - cov) * (1.0 - cov2);
    tone = max(tone, s2.rgb);
  }
  float alpha = uAlpha * cov * vInst.w * uOpacity;
  // nothing of the kit is drawn from under the pool: that view is the field
  // water's below variant, not an opaque plane through the surface
  alpha *= 1.0 - clamp(uUnderwater, 0.0, 1.0);
  // geometry that dips under the receiving pool fades out (the stack lands
  // its last piece at the plunge, but the vanilla feet go a little below)
  float poolY = (vInst.y + uLift) * uVerticalScale;
  alpha *= smoothstep(poolY - ${POOL_FADE_M.toFixed(2)} * uVerticalScale, poolY, vWorldPos.y);
  // edge-on layers fade instead of showing their silhouette as a cut
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 faceN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  float facing = abs(dot(faceN, viewDir));
  alpha *= smoothstep(${KIT_FACING_FADE.start.toFixed(2)}, ${KIT_FACING_FADE.full.toFixed(2)}, facing);
  // soft particle against the scene depth, per layer (audit §4 rule 5)
  if (uHasDepth > 0.5 && uSoftDepthM > 0.0) {
    vec2 suv = gl_FragCoord.xy / uResolution;
    float d = texture2D(uSceneDepth, suv).x;
    float sceneEye = (uCamNear * uCamFar) / (uCamFar - d * (uCamFar - uCamNear));
    float fragEye = 1.0 / gl_FragCoord.w;
    alpha *= smoothstep(0.0, uSoftDepthM, sceneEye - fragEye);
  }
  if (alpha < 0.004) discard;
  float vis = esFallsSunVisibility();
  vec3 irr = esFallsIrradianceG(uAmbient, uSunLight, uSunDir, uUpness, vis);
  vec3 color;
  if (uLit > 0.5) {
    // the lit inner water shell: albedo under the shared irradiance plus a
    // sun highlight from the scrolling normal map
    vec3 n = vNormalW;
#ifdef ES_KIT_NORMAL
    vec3 nt = texture2D(uNormalTex, uv1 * 2.0).xyz * 2.0 - 1.0;
    n = normalize(n + nt * 0.6);
#endif
    if (dot(n, viewDir) < 0.0) n = -n;
    vec3 h = normalize(viewDir + uSunDir);
    float spec = pow(max(dot(n, h), 0.0), 48.0) * vis * 0.35;
    vec3 sun = uSunLight / ${(0.06).toFixed(2)};
    color = tone * uEmissive * irr + spec * sun * RECIPROCAL_PI;
  } else {
    color = tone * uEmissive * irr;
  }
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** One material per shape role, sharing the frame uniforms by reference. */
export function createKitPieceMaterial(role: KitShapeRole, texture: THREE.Texture | null,
  normal: THREE.Texture | null, shared: KitSharedUniforms, applyAerial: (m: THREE.Material) => void): THREE.ShaderMaterial {
  const uniforms: Record<string, THREE.IUniform> = {
    ...THREE.UniformsUtils.merge([THREE.UniformsLib.lights]) as Record<string, THREE.IUniform>,
    ...shared,
    uTex: { value: texture },
    uNormalTex: { value: normal },
    uScroll: { value: new THREE.Vector2(role.scroll[0], role.scroll[1]) },
    uScroll2: { value: new THREE.Vector2(role.scroll2?.[0] ?? 0, role.scroll2?.[1] ?? 0) },
    uHasScroll2: { value: role.scroll2 ? 1 : 0 },
    uBreathe: { value: role.breathe ? 1 : 0 },
    uEmissive: { value: role.emissive },
    uAlpha: { value: role.alpha },
    uSoftDepthM: { value: role.softDepthM },
    uUpness: { value: role.upness },
    uLit: { value: role.kind === "lit" ? 1 : 0 },
    uCovLum: { value: role.covFromLum ? 1 : 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: normal && role.kind === "lit" ? { ES_KIT_NORMAL: 1 } : {},
    // `lights: true` only pulls three's directional SHADOW block in (the
    // falls take the scene's CSM cascades); no light chunk is evaluated
    lights: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // Named so a shader-compile error in the probe/console identifies this
  // material instead of reporting a blank name (0064 bring-up).
  material.name = `es-waterfall-kit-${role.kind}-${role.match}`;
  applyAerial(material);
  material.customProgramCacheKey = () => `es-waterfall-kit${normal && role.kind === "lit" ? "-n" : ""}`;
  return material;
}

/** A texture bound for the kit: repeat both axes (the offset scrolls forever), no colour management. */
export function prepareKitTexture(tex: THREE.Texture): THREE.Texture {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
