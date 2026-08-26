import * as THREE from "three";
import type { CSM } from "three/examples/jsm/csm/CSM.js";
import { WAVES, gerstnerGlsl } from "@elder-souls/game-core/water/index";
import { applyAerialPerspective, type AerialUniforms } from "../sky/aerial";
import type { WaterAssets } from "./waterAssets";

/**
 * The Phase 8b water material (decision 0025): a `MeshPhysicalMaterial`
 * patched via `onBeforeCompile` (the decision-0020 pattern) so it inherits —
 * exposure-correct and for free — CSM sun/moon shadows and GGX glints, the
 * PMREM sky reflection (stars and moons at night included) and the shared
 * aerial-perspective term. The patch injects:
 *
 * - vertex: still-water surface height from the compiled W raster (+ tide +
 *   season), Gerstner displacement scaled by baked exposure (fetch × depth) —
 *   the same wave table the CPU query uses (`game-core/water/waves.ts`);
 * - fragment: flow-advected dual-phase ripple normals (Valve/`Water2` trick),
 *   depth-based Beer–Lambert refraction of the scene RT, per-pixel water
 *   colour from turbidity/salinity, shoreline/rapids/contact foam, tiered SSR
 *   with PMREM fallback, and manual scene-depth occlusion (the surface is
 *   continuous province-wide and simply hides under the terrain).
 *
 * Shore foam, absorption and underwater shading adapted from WaterThreeJS
 * (MIT, © achrefelouafi); flow advection after three.js `Water2` /
 * Valve's Portal 2 flow maps.
 */

export type WaterVariant = "above" | "below";

export interface WaterTier {
  name: "low" | "high";
  ssr: boolean;
  godRays: boolean;
  waveBands: number;
  /** Scene RT resolution scale. */
  rtScale: number;
  samples: number;
}

export const WATER_TIERS: Record<"low" | "high", WaterTier> = {
  // samples stay 0: a multisampled half-float RT costs serious VRAM/bandwidth
  // (owner round 1 perf); water/overlay edges still get the canvas MSAA.
  high: { name: "high", ssr: true, godRays: true, waveBands: WAVES.bands, rtScale: 1.0, samples: 0 },
  low: { name: "low", ssr: false, godRays: false, waveBands: WAVES.lowTierBands, rtScale: 0.75, samples: 0 },
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
  uFlowTex: { value: THREE.Texture };
  uKlassTex: { value: THREE.Texture };
  uFlowExtentM: { value: number };
  uFlowMax: { value: number };
  uShoreMax: { value: number };
  uSsrStrength: { value: number };
  uRefractStrength: { value: number };
  /** x, z, radius, strength — player/boat/splash churn sources. */
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
    uFlowTex: { value: assets.flowTex },
    uKlassTex: { value: assets.klassTex },
    uFlowExtentM: { value: m.flow.size * m.flow.metresPerPixel },
    uFlowMax: { value: m.flow.flowMax },
    uShoreMax: { value: m.flow.shoreMaxM },
    uSsrStrength: { value: 0.85 },
    uRefractStrength: { value: 0.35 },
    uBodies: { value: Array.from({ length: MAX_CONTACT_BODIES }, () => new THREE.Vector4()) },
    uBodyCount: { value: 0 },
  };
}

/** Noise + detail-normal helpers (adapted from WaterThreeJS, MIT). */
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
  vec2 esDetailGrad(vec2 p, vec2 drift){
    vec2 g = vec2(0.0);
    float amp = 1.0;
    mat2 M = mat2(1.7, 1.1, -1.1, 1.7);
    vec2 flow = drift;
    for (int i = 0; i < 3; i++){
      vec3 n = esNoised(p + flow);
      g += amp * n.yz;
      p = M * p;
      flow = -flow * 0.85;
      amp *= 0.55;
    }
    return g;
  }
`;

/** Shared vertex+fragment data samplers (W raster, flow, class). */
const SAMPLER_GLSL = /* glsl */ `
  uniform sampler2D uSurfTex;
  uniform float uSurfMin;
  uniform float uSurfSpan;
  uniform float uSurfSize;
  uniform float uSurfMpp;
  uniform sampler2D uFlowTex;
  uniform sampler2D uKlassTex;
  uniform float uFlowExtentM;
  uniform float uFlowMax;
  uniform float uShoreMax;
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

  // Manual bilinear over the 16-bit W raster (still water height, depth proxy).
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
  varying vec4 vEsData;   // stillW, depth, exposure, shoreDist
  varying vec3 vEsKlass;  // turbidity, salinity, seasonResp
  varying vec2 vEsFlow;   // m/s
  varying vec3 vEsNormalW; // world-space wave normal

  float esEyeDepth(vec2 uv){
    float d = texture2D(uSceneDepth, uv).x;
    return (uCamNear * uCamFar) / (uCamFar - d * (uCamFar - uCamNear));
  }

  float esContactFoam(vec2 wp){
    // churn RINGS, not discs (owner round 1, defect 3): an annulus that
    // spreads outward, hollow in the middle, capped well below solid
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
esKl = mix(esKl, vec4(0.0, 0.25, 1.0, 0.0), esOutside);
esFl = mix(esFl, vec4(0.5, 0.5, 0.0, 1.0), esOutside);
float esStill = esSurf.x + uLevelTide * esTideResponse(esKl.b) + uLevelSeason * esKl.a;
float esVDepth = max(esSurf.y + (esStill - esSurf.x), 0.0);
float esShore = esFl.a * uShoreMax;
float esExposure = esWaveExposure(esShore, esVDepth);
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
vEsKlass = vec3(esKl.g, esKl.b, esKl.a);
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
uniform float uLevelTide;
uniform float uLevelSeason;
uniform float uVerticalScale;`,
      )
      .replace(
        "void main() {",
        /* glsl */ `void main() {
  // Buried surface (dry ground everywhere near): kill before ANY texture
  // work. Also removes the "water sheets" that coarse far triangles between
  // dry vertices used to stretch across valleys (owner round 1, defect 4).
  if (vEsData.y <= 0.004) discard;
  vec2 esScreenUV = gl_FragCoord.xy / uResolution;
  ${variant === "above" ? /* glsl */ `
  float esFragEye = -(viewMatrix * vec4(vEsWorldPos, 1.0)).z;
  float esSceneEye = esEyeDepth(esScreenUV);
  // The province surface is continuous — cull where terrain is in front.
  if (esSceneEye < esFragEye - 0.02) discard;
  ` : ""}`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        /* glsl */ `
float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
// WORLD-space wave normal from the vertex Gerstner sample…
vec3 esNBase = normalize(vEsNormalW);
// …plus flow-advected dual-phase ripples (Water2/Valve) + wind drift.
float esSpeed = length(vEsFlow);
vec2 esDrift = esSpeed > 0.05 ? vEsFlow : vec2(0.05, 0.04);
float esPh1 = fract(uWaveTime * 0.25);
float esPh2 = fract(uWaveTime * 0.25 + 0.5);
float esPhB = abs(esPh1 * 2.0 - 1.0);
float esDist = distance(cameraPosition, vEsWorldPos);
float esDetFade = exp(-esDist * 0.010);
float esDetStrength = (0.10 + 0.10 * vEsData.z + 0.05 * min(esSpeed, 1.0));
vec2 esP1 = (vEsWorldPos.xz - esDrift * esPh1 * 4.0) * 0.55;
vec2 esP2 = (vEsWorldPos.xz - esDrift * esPh2 * 4.0) * 0.55;
vec2 esG = mix(esDetailGrad(esP1, vec2(0.0)), esDetailGrad(esP2, vec2(0.0)), esPhB);
// the fine capillary cascade only exists near the camera
vec2 esGF = esDetFade > 0.02
  ? esDetailGrad(vEsWorldPos.xz * 2.3 + 17.0, vec2(0.11, 0.07) * uWaveTime) * esDetFade * 0.5
  : vec2(0.0);
vec3 esNW = normalize(vec3(
  esNBase.x - (esG.x + esGF.x) * esDetStrength,
  esNBase.y,
  esNBase.z - (esG.y + esGF.y) * esDetStrength));
${variant === "below" ? "esNW = -esNW;" : ""}
// three's lighting runs in VIEW space
vec3 normal = normalize((viewMatrix * vec4(esNW, 0.0)).xyz);
vec3 nonPerturbedNormal = normal;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        variant === "above"
          ? /* glsl */ `
float esTurb = vEsKlass.x;
float esSal = vEsKlass.y;
vec2 esRUV = clamp(
  esScreenUV + esNW.xz * uRefractStrength * clamp(6.0 / max(esFragEye, 1.0), 0.02, 1.0),
  vec2(0.001), vec2(0.999));
float esSceneEyeR = esEyeDepth(esRUV);
if (esSceneEyeR < esFragEye) { esRUV = esScreenUV; esSceneEyeR = esSceneEye; }
float esThick = max(esSceneEyeR - esFragEye, 0.0);
float esColDepth = min(esThick, max(vEsData.y, 0.05) * 4.0);
// Beer–Lambert: clear tropical sea → tannic blackwater by turbidity.
// Blackwater goes opaque within ~30 cm — the marsh must NOT read like the
// coast (owner round 1, defect 11).
vec3 esAbsorb = mix(vec3(0.30, 0.10, 0.06), vec3(2.4, 3.4, 4.8), esTurb);
vec3 esT = exp(-esAbsorb * esColDepth);
vec3 esAlbClear = mix(vec3(0.035, 0.115, 0.10), vec3(0.05, 0.14, 0.155), esSal);
vec3 esAlb = mix(esAlbClear, vec3(0.11, 0.062, 0.024), esTurb * esTurb);
// Foam: shoreline lap + rapids churn + wind-driven crests + contact bodies
float esCrest = (vEsWorldPos.y / max(uVerticalScale, 1e-3)) - vEsData.x; // wave height above still water
float esFoamE = (1.0 - smoothstep(0.04, 1.1, esThick)) * 0.55;
esFoamE += smoothstep(0.3, 1.1, esSpeed) * (1.0 - smoothstep(4.0, 30.0, vEsData.w)) * 0.7;
esFoamE += smoothstep(0.16, 0.34, esCrest) * vEsData.z * 0.8;   // whitecaps on exposed water
esFoamE += esContactFoam(vEsWorldPos.xz);
esFoamE = min(esFoamE, 1.0);
float esFTex = esFbm(vEsWorldPos.xz * 0.55 - (vEsFlow + vec2(0.22, 0.18)) * uWaveTime * 0.4, 4);
float esFThr = 1.0 - esFoamE;
float esFoam = smoothstep(esFThr - 0.18, esFThr + 0.26, esFTex)
             * smoothstep(0.0, 0.12, esFoamE);
// always textured — never a solid sheet
esFoam = clamp(esFoam, 0.0, 1.0) * (0.55 + 0.45 * esFbm(vEsWorldPos.xz * 1.9 + uWaveTime * 0.1, 3)) * 0.9;
float esFoamShade = 0.72 + 0.36 * esFbm(vEsWorldPos.xz * 3.7, 3);
diffuseColor.rgb = mix(esAlb * (1.0 - esT), vec3(0.92, 0.95, 0.97) * esFoamShade, esFoam);
roughnessFactor = mix(clamp(0.05 + esTurb * 0.28 + min(esSpeed, 1.0) * 0.08, 0.0, 0.7), 0.85, esFoam);
#include <emissivemap_fragment>`
          : /* glsl */ `
float esTurb = vEsKlass.x;
vec3 esAlbU = mix(vec3(0.05, 0.14, 0.15), vec3(0.10, 0.065, 0.03), esTurb);
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
// bank/tree reflections matter up close; beyond ~1.2 km the PMREM sky term
// carries the reflection alone (perf, owner round 1)
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
