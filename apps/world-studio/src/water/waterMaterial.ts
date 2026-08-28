import * as THREE from "three";
import type { CSM } from "three/examples/jsm/csm/CSM.js";
import { WAVES, gerstnerGlsl } from "@elder-souls/game-core/water/index";
import { applyAerialPerspective, type AerialUniforms } from "../sky/aerial";
import type { WaterAssets } from "./waterAssets";
import { RIPPLE_PATCH_M } from "./RippleSim";

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
 * docs/research/water-edges-and-shore-waves.md.
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
  high: { name: "high", ssr: true, godRays: true, ripples: true, waveBands: WAVES.bands, rtScale: 1.0, samples: 0 },
  low: { name: "low", ssr: false, godRays: false, ripples: true, waveBands: WAVES.lowTierBands, rtScale: 0.75, samples: 0 },
};

export const WATER_LAYER = 3;
/** Display-referred UI (city markers) renders in a final overlay pass —
 * the tone-mapped blit would crush `toneMapped:false` materials to black. */
export const OVERLAY_LAYER = 4;
export const MAX_CONTACT_BODIES = 8;

export interface WaterUniforms {
  uWaveTime: { value: number };
  uLevelTide: { value: number };
  uLevelSeason: { value: number };
  uVerticalScale: { value: number };
  uSceneColor: { value: THREE.Texture | null };
  uSceneDepth: { value: THREE.Texture | null };
  uCamNear: { value: number };
  uCamFar: { value: number };
  uResolution: { value: THREE.Vector2 };
  uProjMatrix: { value: THREE.Matrix4 };
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
  /** x, z, radius, strength — churn sources (player, crates, splashes). */
  uBodies: { value: THREE.Vector4[] };
  uBodyCount: { value: number };
}

export function createWaterUniforms(assets: WaterAssets): WaterUniforms {
  const m = assets.meta;
  return {
    uWaveTime: { value: 0 },
    uLevelTide: { value: 0 },
    uLevelSeason: { value: 0 },
    uVerticalScale: { value: 1 },
    uSceneColor: { value: null },
    uSceneDepth: { value: null },
    uCamNear: { value: 0.3 },
    uCamFar: { value: 60000 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uProjMatrix: { value: new THREE.Matrix4() },
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
      sum += amp * esNoised(p).x;
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
      g += amp * n.yz;
      p = M * p;
      fl = -fl * 0.85;
      amp *= 0.55;
    }
    return g;
  }
`;

/** Shared data samplers (W/depth/shore raster, flow, class). */
const SAMPLER_GLSL = /* glsl */ `
  uniform sampler2D uSurfTex;
  uniform float uSurfMin;
  uniform float uSurfSpan;
  uniform float uSurfSize;
  uniform float uSurfMpp;
  uniform float uSurfShoreMax;
  uniform sampler2D uSurfShore;
  uniform sampler2D uFlowTex;
  uniform sampler2D uKlassTex;
  uniform float uFlowExtentM;
  uniform float uFlowMax;
  uniform float uLevelTide;
  uniform float uLevelSeason;
  uniform float uWaveTime;

  // KEEP IN LOCKSTEP with waterData.tideResponseOf().
  float esTideResponse(float salinity){
    return smoothstep(0.02, 0.15, salinity);
  }

  vec2 esDecodeSurf(vec4 t){
    float w = uSurfMin + ((t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0) * uSurfSpan;
    return vec2(w, t.b * 25.5);
  }

  // Manual bilinear over the 16-bit W raster (height, depth proxy).
  vec2 esSurfaceAt(vec2 wpos){
    float extent = uSurfSize * uSurfMpp;
    if (wpos.x < 0.0 || wpos.y < 0.0 || wpos.x >= extent || wpos.y >= extent) {
      return vec2(0.0, 25.5); // beyond the province: open sea
    }
    vec2 f = clamp(wpos / uSurfMpp - 0.5, vec2(0.0), vec2(uSurfSize - 1.001));
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
    vec3 s = texture2D(uSurfShore, wpos / extent).rgb;
    return vec3(s.r * uSurfShoreMax, s.g, s.b);
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
  uniform float uSsrStrength;
  uniform float uRefractStrength;
  uniform vec4 uBodies[${MAX_CONTACT_BODIES}];
  uniform int uBodyCount;
  ${tier.ripples ? "#define ES_RIPPLES 1" : ""}
  uniform sampler2D uRipple;
  uniform vec4 uRippleInfo;
  varying vec4 vEsData;   // stillW, depth, exposure, shoreDist
  varying vec3 vEsKlass;  // turbidity(silt), salinity, tannin
  varying vec2 vEsFlow;   // m/s
  varying vec3 vEsNormalW; // world-space wave normal

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
      float q = length(wp - B.xy) / max(B.z, 0.1);
      float ring = smoothstep(0.25, 0.7, q) * (1.0 - smoothstep(1.0, 1.6, q));
      c += ring * B.w;
    }
    return min(c, 0.85);
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
  aerial: AerialUniforms;
  assets: WaterAssets;
  uniforms: WaterUniforms;
  tier: WaterTier;
}

export function createWaterMaterial(variant: WaterVariant, ctx: WaterMaterialContext): THREE.MeshPhysicalMaterial {
  const { csm, aerial, uniforms, tier } = ctx;
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
varying vec4 vEsData;
varying vec3 vEsKlass;
varying vec2 vEsFlow;
varying vec3 vEsNormalW;
${SAMPLER_GLSL}
${gerstnerGlsl(tier.waveBands)}`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
vec3 esRestW = (modelMatrix * vec4(position, 1.0)).xyz;
vec2 esSurf = esSurfaceAt(esRestW.xz);
vec2 esDataUv = clamp(esRestW.xz / uFlowExtentM, vec2(0.0), vec2(1.0));
vec4 esKl = texture2D(uKlassTex, esDataUv);
vec4 esFl = texture2D(uFlowTex, esDataUv);
float esOutside = (esRestW.x < 0.0 || esRestW.z < 0.0
  || esRestW.x >= uFlowExtentM || esRestW.z >= uFlowExtentM) ? 1.0 : 0.0;
esKl = mix(esKl, vec4(0.0, 0.25, 1.0, 1.0), esOutside);
esFl = mix(esFl, vec4(0.5, 0.5, 0.0, 1.0), esOutside);
vec3 esSS = esShoreAt(esRestW.xz);   // shore dist, season response, tannin
float esStill = esSurf.x + uLevelTide * esTideResponse(esKl.b) + uLevelSeason * esSS.y;
float esVDepth = max(esSurf.y + (esStill - esSurf.x), 0.0);
float esShore = esSS.x;
float esExposure = esWaveExposure(esShore, esVDepth, max(esKl.g, esSS.z));
// lapping swash: the waterline breathes up the beach (research doc §1)
esStill += esSwash(esShore, esExposure, uWaveTime);
float esCamDist = distance(cameraPosition.xz, esRestW.xz);
float esWaveAmp = esExposure * exp(-esCamDist * 0.0006);
EsWave esW;
if (esWaveAmp > 0.002) {
  esW = esWaveSample(esRestW.xz, esWaveAmp, uWaveTime);
} else {
  esW.disp = vec3(0.0);
  esW.normal = vec3(0.0, 1.0, 0.0);
  esW.height = 0.0;
}
vEsData = vec4(esStill, esVDepth, esExposure, esShore);
vEsKlass = vec3(esKl.g, esKl.b, esSS.z);   // turbidity, salinity, tannin
vEsFlow = (esFl.xy - 0.5) * 2.0 * uFlowMax;
vEsNormalW = esW.normal;
vec3 objectNormal = esW.normal;`,
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
${prelude}
uniform float uWaveTime;
uniform float uVerticalScale;`,
      )
      .replace(
        "void main() {",
        /* glsl */ `void main() {
  // Buried surface (dry ground everywhere near): kill before ANY texture
  // work — also removes valley-spanning ghost sheets (round 1, defect 4).
  if (vEsData.y <= 0.004) discard;
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
float esSpeed = length(vEsFlow);
float esDist = distance(cameraPosition, vEsWorldPos);
// distance LOD: detail normals AND their strength fade out far away —
// unfiltered procedural ripple at 1 px = the "TV static" (round 2, defect 1)
float esDetFade = exp(-esDist * 0.010);
float esFarFade = exp(-esDist * 0.0025);
float esDetStrength = (0.10 + 0.10 * vEsData.z + 0.05 * min(esSpeed, 1.0))
                    * (0.2 + 0.8 * esFarFade);
// flow advection (Water2 dual-phase); still water gets a gentle wobble, not
// a stream (round 2: 'flowing' foam on static pools)
vec2 esDrift = esSpeed > 0.05
  ? vEsFlow
  : vec2(sin(uWaveTime * 0.13), cos(uWaveTime * 0.11)) * 0.03;
float esPh1 = fract(uWaveTime * 0.25);
float esPh2 = fract(uWaveTime * 0.25 + 0.5);
float esPhB = abs(esPh1 * 2.0 - 1.0);
vec2 esP1 = (vEsWorldPos.xz - esDrift * esPh1 * 4.0) * 0.55;
vec2 esP2 = (vEsWorldPos.xz - esDrift * esPh2 * 4.0) * 0.55;
vec2 esG = mix(esDetailGrad(esP1, vec2(0.0)), esDetailGrad(esP2, vec2(0.0)), esPhB);
vec2 esGF = esDetFade > 0.02
  ? esDetailGrad(vEsWorldPos.xz * 2.3 + 17.0, vec2(0.11, 0.07) * uWaveTime) * esDetFade * 0.5
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
vec3 esNW = normalize(vec3(
  esNBase.x - (esG.x + esGF.x) * esDetStrength - esRip.x,
  esNBase.y,
  esNBase.z - (esG.y + esGF.y) * esDetStrength - esRip.y));
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
// 1. thin contact line exactly at the waterline
float esFoamE = (1.0 - smoothstep(0.015, 0.24, esThick))
              * (0.18 + 0.5 * clamp(esExpo * 2.0, 0.0, 1.0));
// 2. advancing lapping bands, synced to the swash rhythm (research §1)
{
  float bn = esFbm(vEsWorldPos.xz * 0.16, 3);
  float ph = fract((uWaveTime * 0.9 + (esShoreD + bn * 5.0) * 0.5) / 6.2831853);
  float band = smoothstep(0.86, 0.985, 1.0 - ph);
  esFoamE += band * (1.0 - smoothstep(2.0, 16.0, esShoreD)) * clamp(esExpo * 2.5, 0.0, 1.0) * 0.85;
}
// 3. whitecaps on genuinely exposed water, never in the far shimmer zone
float esCrest = (vEsWorldPos.y / max(uVerticalScale, 1e-3)) - vEsData.x;
esFoamE += smoothstep(0.16, 0.34, esCrest) * esExpo * 0.8 * (1.0 - smoothstep(1200.0, 2400.0, esDist));
// 4. rapids churn near banks
esFoamE += smoothstep(0.3, 1.1, esSpeed) * (1.0 - smoothstep(4.0, 30.0, esShoreD)) * 0.6;
// 5. player/crate/splash rings + sim crests
esFoamE += esContactFoam(vEsWorldPos.xz) + esRipCrest * 0.5;
// murky water barely foams white
esFoamE = min(esFoamE, 1.0) * (1.0 - 0.75 * esMurk);
float esFTex = esFbm(vEsWorldPos.xz * 0.55 - (vEsFlow + esDrift) * uWaveTime * 0.35, 4);
float esFThr = 1.0 - esFoamE;
float esFoam = smoothstep(esFThr - 0.18, esFThr + 0.26, esFTex)
             * smoothstep(0.0, 0.10, esFoamE);
esFoam = clamp(esFoam, 0.0, 1.0)
       * (0.55 + 0.45 * esFbm(vEsWorldPos.xz * 1.9 + uWaveTime * 0.1, 3))
       * (0.25 + 0.75 * esFarFade) * 0.9;
float esFoamShade = 0.72 + 0.36 * esFbm(vEsWorldPos.xz * 3.7, 3);
diffuseColor.rgb = mix(esAlb * (1.0 - esT), vec3(0.92, 0.95, 0.97) * esFoamShade, esFoam);
// distance roughness LOD kills specular fireflies (round 2, defect 1)
roughnessFactor = mix(
  clamp(0.05 + esTurb * 0.28 + min(esSpeed, 1.0) * 0.08 + (1.0 - esFarFade) * 0.24, 0.0, 0.75),
  0.85, esFoam);
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

  applyAerialPerspective(material, aerial);
  material.customProgramCacheKey = () => `es-water-${variant}-${tier.name}`;
  return material;
}
