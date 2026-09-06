import * as THREE from "three";
import type { CSM } from "three/examples/jsm/csm/CSM.js";
import { WAVES, gerstnerGlsl, surfGlsl } from "@elder-souls/game-core/water/index";

import type { WaterAssets } from "./types";
import { RIPPLE_PATCH_M } from "./RippleSim";
import { WATER_CAUSTICS_GLSL } from "./caustics";

/**
 * The Phase 8b water material (decision 0025, reworked in owner round 2):
 * a `MeshPhysicalMaterial` patched via `onBeforeCompile` (decision-0020
 * pattern) that inherits CSM sun/moon shadows + GGX glints, PMREM sky
 * reflections and the aerial term, exposure-correct. The patch injects:
 *
 * - vertex: still-water height from the compiled W raster (+ tide + season
 *   + shore swash), Gerstner displacement scaled by baked exposure — the
 *   same wave/swash tables the CPU query uses (game-core/water);
 * - fragment: flow-advected ripples + the local interactive ripple sim,
 *   Beer–Lambert refraction, per-pixel water colour, a REAL foam system
 *   (thin contact line, advancing lapping bands, whitecaps, rapids, churn
 *   rings — all turbidity-damped), speckle-free distance shading (detail
 *   and roughness LOD), tiered SSR, depth-fade soft edges and manual
 *   scene-depth occlusion.
 *
 * Adapted from WaterThreeJS (MIT © achrefelouafi); flow advection after
 * three.js `Water2`/Valve; shore-wave formulas per
 * docs/research/rendering/water-edges-and-shore-waves.md.
 */

export type WaterVariant = "above" | "below";

export interface WaterTier {
  name: "low" | "high";
  ssr: boolean;
  godRays: boolean;
  ripples: boolean;
  waveBands: number;
  rtScale: number;
  samples: number;
}

export const WATER_TIERS: Record<"low" | "high", WaterTier> = {
  // samples stay 0: a multisampled half-float RT costs serious VRAM/bandwidth
  // (owner round 1 perf); water/overlay edges still get the canvas MSAA.
  high: { name: "high", ssr: true, godRays: true, ripples: true, waveBands: WAVES.bands, rtScale: 0.9, samples: 0 },
  // Quality changes capture/detail cost, never the physical wave spectrum.
  low: { name: "low", ssr: false, godRays: false, ripples: true, waveBands: WAVES.bands, rtScale: 0.75, samples: 0 },
};

export const WATER_LAYER = 3;
/** Display-referred UI (city markers) renders in a final overlay pass —
 * the tone-mapped blit would crush `toneMapped:false` materials to black. */
export const OVERLAY_LAYER = 4;
/**
 * Precipitation (rain streaks). Owner round 4: rain vanished BEHIND every
 * body of water — ocean, rivers, pools, near and far. Root cause: rain is
 * transparent with `depthWrite:false`, so it wrote no depth into pass 1's
 * render target; the water surface then renders in pass 3, on top of that
 * already-composited image, and had nothing to test against — it simply
 * painted over the streaks. Rain therefore gets its own layer and is drawn
 * in pass 3 AFTER the water surface, depth-tested against the scene depth
 * the blit wrote, so it correctly appears in front of water it is in front
 * of and behind terrain it is behind.
 */
export const PRECIP_LAYER = 5;
export const MAX_CONTACT_BODIES = 8;

export interface WaterUniforms {
  uWaveTime: { value: number };
  /** Weather wind → wave-energy scale (game-core setWindWaveScale twin). */
  uWindWave: { value: number };
  uLevelTide: { value: number };
  uLevelSeason: { value: number };
  uVerticalScale: { value: number };
  uSceneColor: { value: THREE.Texture | null };
  uSceneDepth: { value: THREE.Texture | null };
  uCamNear: { value: number };
  uCamFar: { value: number };
  uResolution: { value: THREE.Vector2 };
  uProjMatrix: { value: THREE.Matrix4 };
  uInvProjView: { value: THREE.Matrix4 };
  uSupportTex: { value: THREE.Texture };
  uCharacterTex: { value: THREE.Texture };
  uSurfaceOrigin: { value: number };
  uFlowOrigin: { value: number };
  uFlowMpp: { value: number };
  uDepthMin: { value: number };
  uDirectSun: { value: number };
  uCausticsInOpaque: { value: number };
  uSunDirection: { value: THREE.Vector3 };
  uSurfTex: { value: THREE.Texture };
  uSurfMin: { value: number };
  uSurfSpan: { value: number };
  uSurfSize: { value: number };
  uSurfMpp: { value: number };
  uSurfShoreMax: { value: number };
  uSurfShore: { value: THREE.Texture };
  uFlowTex: { value: THREE.Texture };
  uKlassTex: { value: THREE.Texture };
  uFlowExtentM: { value: number };
  uFlowMax: { value: number };
  uSsrStrength: { value: number };
  uRefractStrength: { value: number };
  uRipple: { value: THREE.Texture | null };
  /** patch centre x, z, patch size (m); w = strength toggle. */
  uRippleInfo: { value: THREE.Vector4 };
  /** Rain intensity 0..1 (round 2): drives the procedural rain agitation
   * that covers ALL visible water beyond the simulated ripple patch. */
  uRainRipple: { value: number };
  /** x, z, radius, strength — churn sources (player, crates, splashes). */
  uBodies: { value: THREE.Vector4[] };
  uBodyCount: { value: number };
}

export function createWaterUniforms(assets: WaterAssets): WaterUniforms {
  const m = assets.meta;
  return {
    uWaveTime: { value: 0 },
    uWindWave: { value: 1 },
    uLevelTide: { value: 0 },
    uLevelSeason: { value: 0 },
    uVerticalScale: { value: 1 },
    uSceneColor: { value: null },
    uSceneDepth: { value: null },
    uCamNear: { value: 0.3 },
    uCamFar: { value: 60000 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uProjMatrix: { value: new THREE.Matrix4() },
    uInvProjView: { value: new THREE.Matrix4() },
    uSupportTex: { value: assets.supportTex },
    uCharacterTex: { value: assets.characterTex },
    uSurfaceOrigin: { value: m.surface.gridOriginM ?? m.surface.metresPerPixel * 0.5 },
    uFlowOrigin: { value: m.flow.gridOriginM ?? m.flow.metresPerPixel * 0.5 },
    uFlowMpp: { value: m.flow.metresPerPixel },
    uDepthMin: { value: m.surface.depthMinM ?? 0 },
    uDirectSun: { value: 0 },
    uCausticsInOpaque: { value: 0 },
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uSurfTex: { value: assets.surfaceTex },
    uSurfMin: { value: m.surface.minM },
    uSurfSpan: { value: m.surface.maxM - m.surface.minM },
    uSurfSize: { value: m.surface.size },
    uSurfMpp: { value: m.surface.metresPerPixel },
    uSurfShoreMax: { value: m.surface.shoreMaxM ?? 160 },
    uSurfShore: { value: assets.shoreTex },
    uFlowTex: { value: assets.flowTex },
    uKlassTex: { value: assets.klassTex },
    uFlowExtentM: { value: m.flow.size * m.flow.metresPerPixel },
    uFlowMax: { value: m.flow.flowMax },
    uSsrStrength: { value: 0.85 },
    uRefractStrength: { value: 0.35 },
    uRipple: { value: null },
    uRippleInfo: { value: new THREE.Vector4(0, 0, RIPPLE_PATCH_M, 0) },
    uRainRipple: { value: 0 },
    uBodies: { value: Array.from({ length: MAX_CONTACT_BODIES }, () => new THREE.Vector4()) },
    uBodyCount: { value: 0 },
  };
}

/** Noise helpers (adapted from WaterThreeJS, MIT). */
const NOISE_GLSL = /* glsl */ `
  float esHash21(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  vec3 esNoised(vec2 x){
    vec2 p = floor(x);
    vec2 f = fract(x);
    vec2 u  = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    float a = esHash21(p);
    float b = esHash21(p + vec2(1.0, 0.0));
    float c = esHash21(p + vec2(0.0, 1.0));
    float d = esHash21(p + vec2(1.0, 1.0));
    float k1 = b - a;
    float k2 = c - a;
    float k3 = a - b - c + d;
    float n  = a + k1 * u.x + k2 * u.y + k3 * u.x * u.y;
    vec2  g  = du * vec2(k1 + k3 * u.y, k2 + k3 * u.x);
    return vec3(n, g);
  }
  float esFbm(vec2 p, int oct){
    float amp = 0.5, sum = 0.0;
    mat2 M = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 6; i++){
      if (i >= oct) break;
      float footprint = max(length(dFdx(p)), length(dFdy(p)));
      sum += amp * mix(esNoised(p).x, 0.5, smoothstep(0.35, 1.0, footprint));
      p = M * p;
      amp *= 0.5;
    }
    return sum;
  }
  vec2 esDetailGrad(vec2 p, vec2 flow){
    vec2 g = vec2(0.0);
    float amp = 1.0;
    mat2 M = mat2(1.7, 1.1, -1.1, 1.7);
    vec2 fl = flow;
    for (int i = 0; i < 3; i++){
      vec3 n = esNoised(p + fl);
      float footprint = max(length(dFdx(p)), length(dFdy(p)));
      g += amp * n.yz * (1.0 - smoothstep(0.25, 0.8, footprint));
      p = M * p;
      fl = M * fl;
      amp *= 0.55;
    }
    return g;
  }
`;

/** Shared data samplers (W/depth/shore raster, flow, class). */
export const SAMPLER_GLSL = /* glsl */ `
  uniform sampler2D uSurfTex;
  uniform float uSurfMin;
  uniform float uSurfSpan;
  uniform float uSurfSize;
  uniform float uSurfMpp;
  uniform float uSurfShoreMax;
  uniform sampler2D uSurfShore;
  uniform sampler2D uFlowTex;
  uniform sampler2D uKlassTex;
  uniform sampler2D uSupportTex;
  uniform sampler2D uCharacterTex;
  uniform float uSurfaceOrigin;
  uniform float uFlowOrigin;
  uniform float uFlowMpp;
  uniform float uDepthMin;
  uniform float uFlowExtentM;
  uniform float uFlowMax;
  uniform float uLevelTide;
  uniform float uLevelSeason;
  uniform float uWaveTime;
  uniform float uWindWave;

  // KEEP IN LOCKSTEP with waterData.tideResponseOf().
  float esTideResponse(float salinity){
    return smoothstep(0.02, 0.15, salinity);
  }

  vec2 esDecodeSurf(vec4 t){
    float w = uSurfMin + ((t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0) * uSurfSpan;
    return vec2(w, t.b * 25.5 + uDepthMin);
  }

  // Manual bilinear over the 16-bit W raster (height, depth proxy).
  vec2 esSurfaceAt(vec2 wpos){
    float extent = uSurfSize * uSurfMpp;
    if (wpos.x < 0.0 || wpos.y < 0.0 || wpos.x >= extent || wpos.y >= extent) {
      return vec2(0.0, 25.5); // beyond the province: open sea
    }
    vec2 f = clamp((wpos - uSurfaceOrigin) / uSurfMpp, vec2(0.0), vec2(uSurfSize - 1.001));
    ivec2 i0 = ivec2(f);
    vec2 t = f - vec2(i0);
    ivec2 i1 = min(i0 + 1, ivec2(int(uSurfSize) - 1));
    vec2 s00 = esDecodeSurf(texelFetch(uSurfTex, i0, 0));
    vec2 s10 = esDecodeSurf(texelFetch(uSurfTex, ivec2(i1.x, i0.y), 0));
    vec2 s01 = esDecodeSurf(texelFetch(uSurfTex, ivec2(i0.x, i1.y), 0));
    vec2 s11 = esDecodeSurf(texelFetch(uSurfTex, i1, 0));
    return mix(mix(s00, s10, t.x), mix(s01, s11, t.x), t.y);
  }

  // Shore raster: R = shore distance, G = season response, B = tannin.
  // (Data never rides PNG alpha — canvas premultiply corrupts it.)
  vec3 esShoreAt(vec2 wpos){
    float extent = uSurfSize * uSurfMpp;
    if (wpos.x < 0.0 || wpos.y < 0.0 || wpos.x >= extent || wpos.y >= extent) {
      return vec3(uSurfShoreMax, 0.0, 0.0);
    }
    vec3 s = texture2D(uSurfShore, (wpos - uSurfaceOrigin + uSurfMpp * 0.5) / extent).rgb;
    return vec3(s.r * uSurfShoreMax, s.g, s.b);
  }

  vec3 esSupportAt(vec2 p) {
    float extent = uSurfSize * uSurfMpp;
    if (p.x < 0.0 || p.y < 0.0 || p.x >= extent || p.y >= extent) return vec3(1.0, 1.0, 1.0);
    return texture2D(uSupportTex, (p - uSurfaceOrigin + uSurfMpp * 0.5) / extent).rgb;
  }
  vec2 esFlowUv(vec2 p) { return clamp((p - uFlowOrigin + uFlowMpp * 0.5) / uFlowExtentM, vec2(0.0), vec2(1.0)); }
  float esClassAt(vec2 p) {
    ivec2 size = textureSize(uKlassTex, 0);
    ivec2 pixel = clamp(ivec2(floor(esFlowUv(p) * vec2(size))), ivec2(0), size - 1);
    float klass = texelFetch(uKlassTex, pixel, 0).r * 255.0;
    // A small supported native pond can lie between coarse semantic cells.
    // It is inland water, never permission for the ocean grid to bridge it.
    return klass < 0.5 ? 4.0 : klass;
  }
  vec2 esFlowAt(vec2 p) {
    vec2 bytes = texture2D(uFlowTex, esFlowUv(p)).xy * 255.0;
    vec2 velocity = (bytes / 255.0 - 0.5) * 2.0 * uFlowMax;
    return velocity * step(vec2(0.501), abs(bytes - 127.5));
  }
`;

function fragmentPrelude(tier: WaterTier, variant: WaterVariant): string {
  return /* glsl */ `
  uniform sampler2D uSceneColor;
  uniform sampler2D uSceneDepth;
  uniform float uCamNear;
  uniform float uCamFar;
  uniform vec2 uResolution;
  uniform mat4 uProjMatrix;
  uniform mat4 uInvProjView;
  uniform float uDirectSun;
  uniform float uCausticsInOpaque;
  uniform vec3 uSunDirection;
  uniform float uSsrStrength;
  uniform float uRefractStrength;
  uniform vec4 uBodies[${MAX_CONTACT_BODIES}];
  uniform int uBodyCount;
  ${tier.ripples ? "#define ES_RIPPLES 1" : ""}
  uniform sampler2D uRipple;
  uniform vec4 uRippleInfo;
  uniform float uRainRipple;
  varying vec4 vEsData;   // stillW, depth, exposure, shoreDist
  varying vec3 vEsKlass;  // turbidity(silt), salinity, tannin
  varying vec3 vEsFlow;   // flow m/s (xy) + surface drop along flow (z)
  varying vec3 vEsNormalW; // world-space wave normal
  varying vec3 vEsSurf;   // fetch exposure, shoreward dir (xz)
  varying float vRibbon;

  float esEyeDepth(vec2 uv){
    float d = texture2D(uSceneDepth, uv).x;
    return (uCamNear * uCamFar) / (uCamFar - d * (uCamFar - uCamNear));
  }

  float esContactFoam(vec2 wp){
    // churn RINGS (annulus), textured later, capped well below solid
    float c = 0.0;
    for (int i = 0; i < ${MAX_CONTACT_BODIES}; i++){
      if (i >= uBodyCount) break;
      vec4 B = uBodies[i];
      if (B.w < 0.01) continue;
      vec3 here = esSupportAt(wp);
      vec3 there = esSupportAt(B.xy);
      if (distance(here.yz, there.yz) > 0.001) continue;
      float q = length(wp - B.xy) / max(B.z, 0.1);
      float ring = smoothstep(0.3, 0.75, q) * (1.0 - smoothstep(0.95, 1.5, q));
      c += ring * B.w * 0.6;
    }
    return min(c, 0.65);
  }

  ${tier.ssr && variant === "above" ? /* glsl */ `
  #define ES_SSR 1
  vec4 esSsr(vec3 ro, vec3 rd){
    float stepLen = 2.2;
    float prevDiff = -1.0;
    vec2 prevUV = vec2(0.0);
    for (int i = 1; i <= 18; i++){
      vec3 p = ro + rd * (stepLen * float(i));
      vec4 clip = uProjMatrix * viewMatrix * vec4(p, 1.0);
      if (clip.w <= 0.0) break;
      vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
      float sceneEye = esEyeDepth(uv);
      float rayEye = -(viewMatrix * vec4(p, 1.0)).z;
      float diff = rayEye - sceneEye;
      if (diff > 0.0 && diff < 8.0 && sceneEye < uCamFar * 0.9){
        float t = prevDiff < 0.0 ? 1.0 : (-prevDiff / (diff - prevDiff));
        vec2 hitUV = mix(prevUV, uv, clamp(t, 0.0, 1.0));
        vec2 edge = smoothstep(0.0, 0.12, hitUV) * smoothstep(0.0, 0.12, 1.0 - hitUV);
        float conf = edge.x * edge.y * (1.0 - float(i) / 18.0 * 0.4);
        return vec4(texture2D(uSceneColor, hitUV).rgb, conf);
      }
      prevDiff = diff;
      prevUV = uv;
      stepLen *= 1.12;
    }
    return vec4(0.0);
  }` : ""}
  `;
}

export interface WaterMaterialContext {
  csm: CSM | null;
  applyAerial: (material: THREE.Material) => void;
  assets: WaterAssets;
  uniforms: WaterUniforms;
  tier: WaterTier;
}

export function createWaterMaterial(variant: WaterVariant, ctx: WaterMaterialContext): THREE.MeshPhysicalMaterial {
  const { csm, applyAerial, uniforms, tier } = ctx;
  const material = new THREE.MeshPhysicalMaterial({
    roughness: 0.08,
    metalness: 0.0,
    specularIntensity: 0.5, // F0 ≈ 0.02 — water
    side: variant === "above" ? THREE.FrontSide : THREE.BackSide,
  });
  material.envMapIntensity = 1.0;

  csm?.setupMaterial(material);
  const csmHook = material.onBeforeCompile;

  material.onBeforeCompile = (shader, renderer) => {
    csmHook?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
uniform float uVerticalScale;
attribute vec4 waterOverride;
attribute float waterGround;
varying float vRibbon;
varying vec4 vEsData;
varying vec3 vEsKlass;
varying vec3 vEsFlow;
varying vec3 vEsNormalW;
varying vec3 vEsSurf;
${SAMPLER_GLSL}
${gerstnerGlsl(tier.waveBands)}
${surfGlsl()}`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
vec3 esRestW = (modelMatrix * vec4(position, 1.0)).xyz;
vec2 esSurf = esSurfaceAt(esRestW.xz);
vRibbon = waterOverride.w;
if (waterOverride.w > 0.5) esSurf = vec2(waterOverride.x, waterOverride.x - waterGround);
vec2 esDataUv = esFlowUv(esRestW.xz);
vec4 esKl = texture2D(uKlassTex, esDataUv);
esKl.r = esClassAt(esRestW.xz) / 255.0;
if (waterOverride.w > 0.5) esKl.r = 3.0 / 255.0;
vec4 esFl = texture2D(uFlowTex, esDataUv);
vec3 esCharacter = texture2D(uCharacterTex, esDataUv).rgb;
float esOutside = (esRestW.x < 0.0 || esRestW.z < 0.0
  || esRestW.x >= uFlowExtentM || esRestW.z >= uFlowExtentM) ? 1.0 : 0.0;
esKl = mix(esKl, vec4(1.0 / 255.0, 0.25, 1.0, 1.0), esOutside);
esCharacter.b = mix(esCharacter.b, 1.0, esOutside);
esFl = mix(esFl, vec4(0.5, 0.5, 0.0, 1.0), esOutside);
vec3 esSS = esShoreAt(esRestW.xz);   // shore dist, season response, tannin
float esStill = esSurf.x + uLevelTide * esTideResponse(esKl.b) + uLevelSeason * esSS.y;
float esShore = esSS.x;
float esTurbV = max(esKl.g, esSS.z);
// shore frame: seaward = +grad(shoreDist); fetch is sampled ~30 m SEAWARD
// so the beach edge of a big bay keeps the bay's wave energy (waves.ts
// gating lesson — waveExposure's depth term is 0 exactly at the waterline,
// which silently muted all lapping in rounds 2-6)
float esFetch;
vec2 esShoreDir = vec2(0.0);
if (esShore < 90.0) {
  float eG = uSurfMpp * 2.0;
  vec2 esGradD = vec2(
    esShoreAt(esRestW.xz + vec2(eG, 0.0)).x - esShore,
    esShoreAt(esRestW.xz + vec2(0.0, eG)).x - esShore) / eG;
  float esGL = length(esGradD);
  vec2 esSeaDir = esGL > 0.05 ? esGradD / esGL : vec2(0.0);
  esShoreDir = -esSeaDir;
  float esSeaD = esGL > 0.05 ? esShoreAt(esRestW.xz + esSeaDir * 30.0).x : esShore;
  esFetch = esFetchExp(max(esSeaD, esShore), esTurbV);
} else {
  esFetch = esFetchExp(esShore, esTurbV);
}
esFetch *= esCharacter.b * (esKl.r * 255.0 < 2.5 ? 1.0 : 0.0);
// the waterline itself TRAVELS: asymmetric swash + shoaling shore swell,
// added BEFORE the depth proxy so the advancing tongue renders on the
// beach face instead of being discarded as buried (research doc §5).
// esSurfWind: KEEP IN LOCKSTEP with game-core surfWindScale() — storm seas
// break harder on the beach (round 3).
float esSurfWind = clamp(pow(uWindWave, 0.8), 0.6, 3.2);
esStill += esSwash(esShore, esFetch, uWaveTime, esSurfWind);
float esSwellDHdd;
esStill += esShoreSwell(esShore, max(esSurf.y, 0.0), esFetch, uWaveTime, esSurfWind, esSwellDHdd);
float esVDepth = max(esSurf.y + uLevelTide * esTideResponse(esKl.b) + uLevelSeason * esSS.y, 0.0);
float esExposure = esWaveExposure(esShore, esVDepth, esTurbV);
float esCamDist = distance(cameraPosition.xz, esRestW.xz);
float esWaveAmp = min(esExposure * esCharacter.b * uWindWave, esVDepth * 0.45);
EsWave esW;
if (esWaveAmp > 0.002) {
  vec2 rest = esRestW.xz;
  for (int i = 0; i < 3; i++) {
    esW = esWaveSample(rest, esWaveAmp, uWaveTime);
    rest = esRestW.xz - esW.disp.xz;
  }
  esW = esWaveSample(rest, esWaveAmp, uWaveTime);
  // Eulerian height sampling keeps the shoreline fixed in XZ even when
  // adjacent semantic regions have different exposure. CPU uses this map.
  esW.disp.xz = vec2(0.0);
} else {
  esW.disp = vec3(0.0);
  esW.normal = vec3(0.0, 1.0, 0.0);
  esW.height = 0.0;
}
// swell tilts the normal along the shoreward axis
esW.normal.xz += esShoreDir * esSwellDHdd;
esW.normal = normalize(esW.normal);
if (waterOverride.w > 0.5) esW.normal = normalize(normal + vec3(esW.normal.x, 0.0, esW.normal.z));
vEsSurf = vec3(esFetch, esShoreDir);
vEsData = vec4(esStill, max(esSurf.y + esStill + esW.disp.y - esSurf.x, 0.0), esExposure, esShore);
vEsKlass = vec3(esKl.g, esKl.b, esSS.z);   // turbidity, salinity, tannin
vec2 esFlowV = waterOverride.w > 0.5 ? waterOverride.yz : esFlowAt(esRestW.xz);
// surface drop along the current → cascades/rapids where water descends
float esDropSlope = 0.0;
float esFlowSp = length(esFlowV);
if (esFlowSp > 0.15) {
  vec2 esDownAt = esSurfaceAt(esRestW.xz + (esFlowV / esFlowSp) * 7.0);
  esDropSlope = clamp((esSurf.x - esDownAt.x) / 7.0, 0.0, 1.0);
}
if (waterOverride.w > 0.5) esDropSlope = clamp(length(normal.xz) / max(normal.y, 0.001), 0.0, 1.0);
vEsFlow = vec3(esFlowV, esDropSlope);
vec3 objectNormal = normalize(vec3(esW.normal.x, esW.normal.y / max(uVerticalScale, 0.001), esW.normal.z));
vEsNormalW = objectNormal;`,
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `
vec3 transformed = vec3(
  position.x + esW.disp.x,
  (esStill + esW.disp.y) * uVerticalScale,
  position.z + esW.disp.z);`,
      );

    const prelude = fragmentPrelude(tier, variant);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
${NOISE_GLSL}
${SAMPLER_GLSL}
${WATER_CAUSTICS_GLSL}
${surfGlsl()}
${prelude}
uniform float uVerticalScale;`,
      )
      .replace(
        "void main() {",
        /* glsl */ `void main() {
  // Buried surface (dry ground everywhere near): kill before ANY texture
  // work — also removes valley-spanning ghost sheets (round 1, defect 4).
  if (vEsData.y <= 0.004) discard;
  if (vRibbon < 0.5 && esSupportAt(vEsWorldPos.xz).x < 0.5) discard;
  // The horizon grid serves marine water only. Inland geometry is fixed
  // to the native water lattice and never interpolates across body IDs.
  float waterClass = esClassAt(vEsWorldPos.xz);
  bool insideProvince = all(greaterThanEqual(vEsWorldPos.xz, vec2(0.0))) && all(lessThan(vEsWorldPos.xz, vec2(uFlowExtentM)));
  if (vRibbon < -0.5 && insideProvince && waterClass >= 2.5) discard;
  if (vRibbon > -0.5 && vRibbon < 0.5 && (!insideProvince || waterClass < 2.5)) discard;
  vec2 esScreenUV = gl_FragCoord.xy / uResolution;
  ${variant === "above" ? /* glsl */ `
  float esFragEye = -(viewMatrix * vec4(vEsWorldPos, 1.0)).z;
  float esSceneEye = esEyeDepth(esScreenUV);
  if (esSceneEye < esFragEye - 0.02) discard;
  ` : ""}`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        /* glsl */ `
float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
vec3 esNBase = normalize(vEsNormalW);
float esSpeed = length(vEsFlow.xy);
// cascades: white churning descent where the surface visibly drops
float esCascade = smoothstep(0.04, 0.30, vEsFlow.z);
// waterfall detection: the true metric slope of the STILL surface via
// screen-space derivatives — near-vertical spans switch to falling-water
// shading (research: waterfalls-realtime, option A)
float esFall = 0.0;
{
  vec2 esDW = vec2(dFdx(vEsData.x), dFdy(vEsData.x)) * uVerticalScale;
  vec2 esDP = vec2(length(vec2(dFdx(vEsWorldPos.x), dFdx(vEsWorldPos.z))),
                   length(vec2(dFdy(vEsWorldPos.x), dFdy(vEsWorldPos.z))));
  esFall = smoothstep(1.2, 3.0, length(esDW / max(esDP, vec2(1e-4))));
}
float esDist = distance(cameraPosition, vEsWorldPos);
// distance LOD: detail normals AND their strength fade out far away —
// unfiltered procedural ripple at 1 px = the "TV static" (round 2, defect 1)
float esDetFade = exp(-esDist * 0.010);
float esFarFade = exp(-esDist * 0.0025);
float esDetStrength = (0.10 + 0.10 * vEsData.z + 0.05 * min(esSpeed, 1.0))
                    * (0.2 + 0.8 * esFarFade) * (1.0 + 2.5 * esCascade);
// flow advection (Water2 dual-phase); still water gets a gentle wobble, not
// a stream (round 2: 'flowing' foam on static pools)
vec2 esDrift = esSpeed > 0.05
  ? vEsFlow.xy
  : vec2(sin(uWaveTime * 0.13), cos(uWaveTime * 0.11)) * 0.03;
float esPh1 = fract(uWaveTime * 0.25);
float esPh2 = fract(uWaveTime * 0.25 + 0.5);
float esPhB = abs(esPh1 * 2.0 - 1.0);
// fast water: features stretch along the flow (anisotropy is a primary
// speed cue — research rivers-on-slopes Q2)
vec2 esFDirN = esSpeed > 0.05 ? vEsFlow.xy / esSpeed : vec2(1.0, 0.0);
float esStretch = 1.0 + 1.4 * smoothstep(0.4, 2.2, esSpeed);
vec2 esP1 = (vEsWorldPos.xz - esDrift * esPh1 * 4.0) * 0.55;
vec2 esP2 = (vEsWorldPos.xz - esDrift * esPh2 * 4.0) * 0.55;
vec2 esG = mix(esDetailGrad(esP1, vec2(0.0)), esDetailGrad(esP2, vec2(0.0)), esPhB);
// Apply directional strength to the LOCAL gradient, never rotate kilometre
// world coordinates by a changing flow angle (the river barcode defect).
esG -= esFDirN * dot(esG, esFDirN) * (1.0 - 1.0 / esStretch);
vec2 esGF = esDetFade > 0.02
  ? mix(esDetailGrad((vEsWorldPos.xz - esDrift * esPh1 * 4.0) * 2.3 + 17.0, vec2(0.0)),
        esDetailGrad((vEsWorldPos.xz - esDrift * esPh2 * 4.0) * 2.3 + 17.0, vec2(0.0)), esPhB) * esDetFade * 0.5
  : vec2(0.0);
vec2 esRip = vec2(0.0);
float esRipCrest = 0.0;
#ifdef ES_RIPPLES
{
  vec2 rUv = (vEsWorldPos.xz - uRippleInfo.xy) / uRippleInfo.z + 0.5;
  if (uRippleInfo.w > 0.5 && all(greaterThan(rUv, vec2(0.02))) && all(lessThan(rUv, vec2(0.98)))) {
    float rTexel = 1.0 / 256.0;
    float hx1 = texture2D(uRipple, rUv + vec2(rTexel, 0.0)).r;
    float hx0 = texture2D(uRipple, rUv - vec2(rTexel, 0.0)).r;
    float hz1 = texture2D(uRipple, rUv + vec2(0.0, rTexel)).r;
    float hz0 = texture2D(uRipple, rUv - vec2(0.0, rTexel)).r;
    esRip = vec2(hx1 - hx0, hz1 - hz0) * 14.0;
    esRipCrest = abs(texture2D(uRipple, rUv).r) * 6.0;
  }
}
#endif
// rain agitation (round 2): the sim patch only reaches ~64 m — beyond it a
// fast time-jittered high-frequency perturbation makes rain read on ALL
// visible water. Two decorrelated phases so it shimmers rather than scrolls;
// fades with distance like the other detail so the far shimmer stays clean.
vec2 esRainG = vec2(0.0);
if (uRainRipple > 0.02) {
  esRainG = (esDetailGrad(vEsWorldPos.xz * 2.9, vec2(0.41, 0.33) * uWaveTime * 2.6)
           + esDetailGrad(vEsWorldPos.xz * 5.3 + 31.0, vec2(-0.29, 0.47) * uWaveTime * 2.6))
          * uRainRipple * 0.09 * (0.25 + 0.75 * esFarFade);
}
vec3 esNW = normalize(vec3(
  esNBase.x - (esG.x + esGF.x) * esDetStrength - esRip.x - esRainG.x,
  esNBase.y,
  esNBase.z - (esG.y + esGF.y) * esDetStrength - esRip.y - esRainG.y));
${variant === "below" ? "esNW = -esNW;" : ""}
vec3 normal = normalize((viewMatrix * vec4(esNW, 0.0)).xyz);
vec3 nonPerturbedNormal = normal;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        variant === "above"
          ? /* glsl */ `
float esTurb = vEsKlass.x;   // suspended silt — "whitewater" opacity
float esSal = vEsKlass.y;
float esTan = vEsKlass.z;    // dissolved tannin — "blackwater" tea
float esMurk = clamp(esTurb * 0.7 + esTan * 0.8, 0.0, 1.0);
// refraction distortion dies in the shallows (edge quality, research §3)
float esThickPre = max(esSceneEye - esFragEye, 0.0);
float esDistort = uRefractStrength * clamp(6.0 / max(esFragEye, 1.0), 0.02, 1.0)
                * smoothstep(0.03, 0.5, esThickPre);
vec2 esRUV = clamp(esScreenUV + esNW.xz * esDistort, vec2(0.001), vec2(0.999));
float esSceneEyeR = esEyeDepth(esRUV);
if (esSceneEyeR < esFragEye) { esRUV = esScreenUV; esSceneEyeR = esSceneEye; }
float esThick = max(esSceneEyeR - esFragEye, 0.0);
float esColDepth = min(esThick, max(vEsData.y, 0.05) * 4.0);
// Beer–Lambert, three real tropical water types (research doc: Sioli/Amazon
// typology): clear sea/mountain streams; SILT whitewater — lighter opaque
// tan (café-au-lait); TANNIN blackwater — glassy dark tea, green-red.
vec3 esAbsorb = vec3(0.30, 0.10, 0.06)
  + esTurb * vec3(1.2, 1.7, 2.3)
  + esTan * vec3(2.2, 2.0, 4.6);
vec3 esT = exp(-esAbsorb * esColDepth);
vec3 esAlbClear = mix(vec3(0.035, 0.115, 0.10), vec3(0.05, 0.14, 0.155), esSal);
vec3 esAlb = esAlbClear;
esAlb = mix(esAlb, vec3(0.115, 0.085, 0.048), clamp(esTurb, 0.0, 1.0));  // silt tan
esAlb = mix(esAlb, vec3(0.045, 0.065, 0.022), clamp(esTan, 0.0, 1.0));   // tea green

// ---- foam: a system, not a blanket (round 2 defect: white sheets) ------
float esShoreD = vEsData.w;
float esExpo = vEsData.z;
// 1. thin contact line exactly at the waterline — fetch-boosted so the
// active surf edge always carries a bright lip
float esFoamE = (1.0 - smoothstep(0.015, 0.24, esThick))
              * (0.18 + 0.5 * clamp(max(esExpo * 2.0, vEsSurf.x), 0.0, 1.0));
// 2. surf: bore foam riding each arriving crest + backwash remnants —
// same closed forms as the swell/swash geometry, so foam and waterline
// move together; per-pixel phase jitter breaks the parallel-band look
{
  float bn = esFbm(vEsWorldPos.xz * 0.16, 3);
  float esSurfWindF = clamp(pow(uWindWave, 0.8), 0.6, 3.2);
  esFoamE += esSurfFoam(esShoreD + bn * 4.0, vEsSurf.x, uWaveTime, esSurfWindF) * 0.85;
}
// 3. whitecaps on genuinely exposed water, never in the far shimmer zone
float esCrest = (vEsWorldPos.y / max(uVerticalScale, 1e-3)) - vEsData.x;
esFoamE += smoothstep(0.16, 0.34, esCrest) * esExpo * 0.8 * (1.0 - smoothstep(1200.0, 2400.0, esDist));
// 4. rapids churn near banks + aerated cascades wherever water descends
// (coverage CAPPED — a saturated threshold was the round-6 solid crust)
esFoamE += smoothstep(0.3, 1.1, esSpeed) * (1.0 - smoothstep(4.0, 30.0, esShoreD)) * 0.5;
esFoamE += esCascade * 0.55;
// 5. player/crate/splash rings + sim crests
esFoamE += esContactFoam(vEsWorldPos.xz);
// murky water barely foams white; cap below saturation so the threshold
// texture ALWAYS breaks the foam up (max coverage ~0.65, research Q3)
esFoamE = min(esFoamE, 0.85) * (1.0 - 0.75 * esMurk);
// foam advection: DUAL-PHASE, like the normals. Scroll distance per cycle
// ∝ speed (Valve's one true speed knob). Never any velocity × absolute
// time: an OSCILLATING velocity × t swings hundreds of metres per frame
// (round-5 barcode); a SPATIALLY-VARYING velocity × t shears neighbouring
// pixels apart until the noise shreds into stripes (round-6 barcode).
float esFTex;
{
  vec2 esFP1 = (vEsWorldPos.xz - esDrift * esPh1 * 4.0) * 0.55;
  vec2 esFP2 = (vEsWorldPos.xz - esDrift * esPh2 * 4.0) * 0.55;
  esFTex = mix(esFbm(esFP1, 3), esFbm(esFP2, 3), esPhB);
}
// flowing water reads as CURRENT: foam stretches into streaks along the
// flow and slides downstream (owner round 6 — rivers must look like rivers)
if (esSpeed > 0.3) {
  // Never rotate the absolute world position by a spatially varying flow
  // direction: far from origin, tiny bend-angle changes become huge texture
  // jumps/barcodes. Stretch a world-anchored pattern using local offsets.
  vec2 esSP1 = (vEsWorldPos.xz - esDrift * esPh1 * 4.0) * 0.55;
  vec2 esSP2 = (vEsWorldPos.xz - esDrift * esPh2 * 4.0) * 0.55;
  vec2 esStretch = esFDirN * 0.85;
  float esStreak1 = (esFbm(esSP1 - esStretch, 2) + esFbm(esSP1, 2) + esFbm(esSP1 + esStretch, 2)) / 3.0;
  float esStreak2 = (esFbm(esSP2 - esStretch, 2) + esFbm(esSP2, 2) + esFbm(esSP2 + esStretch, 2)) / 3.0;
  float esStreak = mix(esStreak1, esStreak2, esPhB);
  esFTex = mix(esFTex, esStreak, smoothstep(0.35, 1.0, esSpeed));
  esFoamE += smoothstep(0.6, 1.6, esSpeed) * 0.3;
}
// falling water (near-vertical spans): two down-scrolling noise scales,
// multiplied; a uniform scroll offset is SAFE with absolute time (its
// spatial gradient is constant). Aeration brightens, never whites out.
if (esFall > 0.01) {
  float esY = vEsWorldPos.y / max(uVerticalScale, 1e-3);
  float esAcrossF = esFbm(vEsWorldPos.xz * 0.7, 2) * 5.0;
  float esF1 = esFbm(vec2(esAcrossF * 0.9, esY * 0.22 + uWaveTime * 2.6), 3);
  float esF2 = esFbm(vec2(esAcrossF * 0.35 + 7.0, esY * 0.08 + uWaveTime * 1.1), 2);
  esFTex = mix(esFTex, esF1 * (0.55 + 0.9 * esF2), esFall);
  esFoamE = mix(esFoamE, 0.42 + 0.30 * esF2, esFall);
}
esFoamE = min(esFoamE, 0.68);
float esFThr = 1.0 - esFoamE;
float esFoam = smoothstep(esFThr - 0.18, esFThr + 0.26, esFTex)
             * smoothstep(0.0, 0.10, esFoamE);
esFoam = clamp(esFoam, 0.0, 1.0)
       * (0.5 + 0.5 * esFbm(vEsWorldPos.xz * 1.9 + vec2(sin(uWaveTime * 0.17), cos(uWaveTime * 0.15)) * 0.8, 3))
       * (0.25 + 0.75 * esFarFade) * 0.9;
float esFoamShade = 0.72 + 0.36 * esFbm(vEsWorldPos.xz * 3.7, 3);
// foam is off-white ALBEDO + high roughness, never near-1.0 white — full
// white kills all lighting shape and reads as crust (research Q3)
diffuseColor.rgb = mix(esAlb * (1.0 - esT), vec3(0.80, 0.84, 0.86) * esFoamShade, esFoam);
// distance roughness LOD kills specular fireflies (round 2, defect 1)
roughnessFactor = mix(
  clamp(0.05 + esTurb * 0.28 + min(esSpeed, 1.0) * 0.08 + (1.0 - esFarFade) * 0.24
        + esFall * 0.35, 0.0, 0.85),
  0.92, esFoam);
#include <emissivemap_fragment>`
          : /* glsl */ `
float esTurb = clamp(vEsKlass.x + vEsKlass.z, 0.0, 1.0);
vec3 esAlbU = mix(vec3(0.05, 0.14, 0.15), vec3(0.06, 0.08, 0.03), esTurb);
diffuseColor.rgb = esAlbU;
roughnessFactor = 0.4;
float esFoam = 0.0;
#include <emissivemap_fragment>`,
      )
      .replace(
        "#include <opaque_fragment>",
        variant === "above"
          ? /* glsl */ `
vec3 esView = normalize(cameraPosition - vEsWorldPos);
vec3 esSpecEnv = reflectedLight.indirectSpecular;
#ifdef ES_SSR
if (esDist < 1200.0) {
  vec4 esS = esSsr(vEsWorldPos, reflect(-esView, esNW));
  float esFres = 0.02 + 0.98 * pow(1.0 - max(dot(esNW, esView), 0.0), 5.0);
  float esSsrFade = 1.0 - smoothstep(800.0, 1200.0, esDist);
  esSpecEnv = mix(esSpecEnv, esS.rgb * esFres,
    clamp(esS.a, 0.0, 1.0) * uSsrStrength * esSsrFade * (1.0 - esFoam));
}
#endif
float esFresT = 0.02 + 0.98 * pow(1.0 - max(dot(esNW, esView), 0.0), 5.0);
vec3 esTransmit = texture2D(uSceneColor, esRUV).rgb * esT * (1.0 - esFoam) * (1.0 - esFresT);
// Project onto the actual refracted opaque receiver, in world metres.
float bedDepth = texture2D(uSceneDepth, esRUV).r;
vec4 bedH = uInvProjView * vec4(esRUV * 2.0 - 1.0, bedDepth * 2.0 - 1.0, 1.0);
vec3 bed = bedH.xyz / bedH.w;
bed.y /= max(uVerticalScale, 0.001);
vec3 bedNormal = normalize(cross(dFdx(bed), dFdy(bed)));
if (bedNormal.y < 0.0) bedNormal = -bedNormal;
if (uCausticsInOpaque < 0.5 && bedDepth < 0.999999 && esDist < 160.0) {
  float caustic = esWaterCaustics(bed, bedNormal, vEsData.x, esTurb, esTan,
    uSunDirection, uDirectSun, uWaveTime, clamp(uWindWave * 0.3 + esSpeed * 0.2, 0.15, 1.0));
  esTransmit *= 1.0 + caustic * 0.8 * (1.0 - smoothstep(80.0, 160.0, esDist));
}
outgoingLight = outgoingLight - reflectedLight.indirectSpecular + esSpecEnv + esTransmit;
// depth-fade soft contact: the water melts into the bank instead of a
// hard painted line (research §3)
float esEdgeSoft = smoothstep(0.0, 0.10, esThick);
outgoingLight = mix(texture2D(uSceneColor, esScreenUV).rgb, outgoingLight, max(esEdgeSoft, esFoam));
#include <opaque_fragment>`
          : /* glsl */ `
// Snell's window: refract the up-ray through the surface into the sky.
{
  vec3 esView = normalize(cameraPosition - vEsWorldPos);
  vec3 esI = -esView;
  vec3 esNup = esNW.y > 0.0 ? esNW : -esNW;
  vec3 esRefr = refract(esI, -esNup, 1.333);
  float esCi = abs(dot(esNup, esI));
  float esFresU = 0.02 + 0.98 * pow(1.0 - esCi, 5.0);
  vec3 esGlow = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  vec3 esSky = esGlow * 2.4;
  #ifdef USE_ENVMAP
  if (dot(esRefr, esRefr) > 1e-4) {
    esSky = textureCubeUV(envMap, esRefr, 0.08).rgb * envMapIntensity * 1.15;
  }
  #endif
  float esShimmer = smoothstep(0.5, 0.92, esFbm(vEsWorldPos.xz * 0.5 + vec2(0.2) * uWaveTime, 4));
  vec3 esCol = (dot(esRefr, esRefr) < 1e-4)
    ? esGlow * 1.6
    : mix(esGlow * 1.4, esSky, 1.0 - esFresU);
  esCol += esGlow * esShimmer * 0.8;
  outgoingLight = esCol;
}
#include <opaque_fragment>`,
      );
  };

  applyAerial(material);
  material.customProgramCacheKey = () => `es-water-v2-${variant}-${tier.name}`;
  return material;
}
