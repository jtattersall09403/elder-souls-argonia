import * as THREE from "three";
import type { CSM } from "three/examples/jsm/csm/CSM.js";
import { WAVES, gerstnerGlsl, surfGlsl } from "@elder-souls/game-core/water/index";

import type { WaterAssets } from "./types";
import { RIPPLE_PATCH_M } from "./RippleSim";
import { WATER_CAUSTICS_GLSL } from "./caustics";
import { SPECTRAL_OCEAN_GLSL } from "./SpectralOceanTextures";
import { flowAdvectionGlsl } from "../flowAdvection";
import { CONNECTED_STAGE_GLSL } from "./connectedStage";
import { LOCAL_WATER_SURFACE_GLSL } from '../localPatchPresentation';
import { boundedPhysicalLighting } from './boundedPhysicalLighting';
import { NATIVE_WATER_GROUND_GLSL } from './NativeWaterAtlas';
import { MARINE_COVERAGE_GLSL } from './marineCoverage';
import { WATER_SSR_GLSL } from './waterSsr';
import { RIPPLE_ISOLATION_GLSL } from './rippleIsolation';
import { MARINE_DATUM_GLSL } from './marineDatum';

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

/** Shared by both faces of every water surface. A clamped vertex-depth
 * interpolation cannot classify a shoreline crossing: dry vertices become
 * zero instead of retaining their signed distance above water. */
export const WATER_NATIVE_FRAGMENT_DEPTH_GLSL = /* glsl */ `
float esFragmentDepth = vEsData.y;
bool hasNativeDepth = false;
bool requiresNative = vRibbon > 0.5 && vRibbon < 1.5;
// Conservative arithmetic bounds avoid atlas fetches for the open horizon.
bool withinNativeBounds = all(greaterThanEqual(vEsWorldPos.xz, vec2(0.0)))
  && all(lessThanEqual(vEsWorldPos.xz, vec2(uNativeGroundInfo.x * uNativeGroundInfo.y)));
if (uNativeGroundActive > 0.5 && (requiresNative || withinNativeBounds)) {
  float nativeGround = esNativeGroundAt(vEsWorldPos.xz);
  // Existing native coverage includes standing/coastal seasonal shores,
  // not just ribbons. Deep water outside that sparse domain keeps its
  // original depth proxy; missing native ribbon coverage remains invalid.
  if (nativeGround < 1e8 || requiresNative) {
    esFragmentDepth = vEsWorldPos.y / max(uVerticalScale, 0.001) - nativeGround;
    hasNativeDepth = true;
  }
}
// Coarse owner planes must not interpolate another owner's proxy ground
// through a sparse-atlas gap. Evaluate their original proxy at this pixel.
if (!hasNativeDepth && vRibbon < 0.5 && vRasterExplicit > 1.5) {
  vec2 raster = esSurfaceAt(vEsWorldPos.xz);
  esFragmentDepth = raster.y + vEsWorldPos.y / max(uVerticalScale, 0.001) - raster.x;
}
if (esFragmentDepth <= 0.004) discard;
`;

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
  uNativeGroundActive: { value: number };
  uNativeGroundInfo: { value: THREE.Vector4 };
  uNativeGroundOffsets: { value: THREE.Vector3 };
  uMarineCoverageInfo: { value: THREE.Vector4 };
  uMarineNearRects: { value: THREE.Vector4[] };
  uMarineNearCount: { value: number };
  uLocalWaterField: { value: THREE.Texture | null };
  uLocalWaterInfo: { value: THREE.Vector4 };
  uLocalWaterEdge: { value: number };
  uLocalWaterActive: { value: number };
  uLocalWaterBody: { value: number };
  uAccessTex: { value: THREE.Texture };
  uHasAccess: { value: number };
  uAccessMinOffset: { value: number };
  uAccessSpan: { value: number };
  uNativeChannelCoverage: { value: number };
  uOceanPrevious: { value: THREE.Texture | null };
  uOceanNext: { value: THREE.Texture | null };
  uOceanAlpha: { value: number };
  uOceanEnabled: { value: number };
  uWaveTime: { value: number };
  uTransportTime: { value: number };
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
    uNativeGroundActive: { value: 0 }, uNativeGroundInfo: { value: new THREE.Vector4() }, uNativeGroundOffsets: { value: new THREE.Vector3() },
    uMarineCoverageInfo: { value: new THREE.Vector4() }, uMarineNearRects: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, uMarineNearCount: { value: 0 },
    uLocalWaterField: { value: null }, uLocalWaterInfo: { value: new THREE.Vector4(0, 0, 0.25, 128) },
    uLocalWaterEdge: { value: 2 }, uLocalWaterActive: { value: 0 }, uLocalWaterBody: { value: 0 },
    uAccessTex: { value: assets.accessTex ?? assets.supportTex },
    uHasAccess: { value: assets.accessTex ? 1 : 0 },
    uAccessMinOffset: { value: m.surface.accessMinOffsetM ?? -2 },
    uAccessSpan: { value: m.surface.accessSpanM ?? 4 },
    uNativeChannelCoverage: { value: m.surface.nativeChannelCoverage ? 1 : 0 },
    uOceanPrevious: { value: null }, uOceanNext: { value: null },
    uOceanAlpha: { value: 0 }, uOceanEnabled: { value: 0 },
    uWaveTime: { value: 0 },
    uTransportTime: { value: 0 },
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
  uniform sampler2D uAccessTex;
  uniform float uHasAccess;
  uniform float uAccessMinOffset;
  uniform float uAccessSpan;
  uniform float uNativeChannelCoverage;
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
  uniform float uTransportTime;
  uniform float uWindWave;

  // KEEP IN LOCKSTEP with waterData.tideResponseOf().
  float esTideResponse(float salinity){
    return smoothstep(0.02, 0.15, salinity);
  }
  ${CONNECTED_STAGE_GLSL}
  vec3 esStageAt(vec2 p, float salinity, float season) {
    float extent = uSurfSize * uSurfMpp;
    if (p.x < 0.0 || p.y < 0.0 || p.x >= extent || p.y >= extent) return vec3(-2.0, 1.0, 0.0);
    if (uHasAccess < 0.5) return vec3(-2.0, esTideResponse(salinity), season);
    return esConnectedStage(p, uSurfTex, uSupportTex, uSurfShore,
      uSurfSize, uSurfMpp, uSurfaceOrigin, uAccessMinOffset, uAccessSpan);
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
    if (uNativeChannelCoverage > 0.5) return esDecodeSurf(esOwnedRaster(wpos,
      uSurfTex, uSupportTex, uSurfSize, uSurfMpp, uSurfaceOrigin));
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
  ${RIPPLE_ISOLATION_GLSL}
  varying vec4 vEsData;   // stillW, depth, exposure, shoreDist
  varying vec3 vEsKlass;  // turbidity(silt), salinity, tannin
  varying vec3 vEsFlow;   // flow m/s (xy) + surface drop along flow (z)
  varying vec3 vEsNormalW; // world-space wave normal
  varying vec3 vEsSurf;   // fetch exposure, shoreward dir (xz)
  varying float vRibbon;
  varying float vEsFlowY;
  varying float vEsAccess;
  varying float vWaterBodyIndex;
  varying float vRasterExplicit;
  varying vec3 vOceanDetail;
  ${SPECTRAL_OCEAN_GLSL}
  ${LOCAL_WATER_SURFACE_GLSL}
  ${NATIVE_WATER_GROUND_GLSL}
  ${MARINE_COVERAGE_GLSL}
  ${flowAdvectionGlsl()}
  float esFallingNoise(vec3 p, vec3 n, int octaves) {
    vec2 weights = abs(n.xz);
    weights /= max(weights.x + weights.y, 0.001);
    // Blend noise VALUES on fixed planes, never position coordinates or
    // world-space axes rotated by a changing local current direction.
    return esFbm(p.zy, octaves) * weights.x + esFbm(p.xy, octaves) * weights.y;
  }

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

  ${tier.ssr && variant === "above" ? WATER_SSR_GLSL : ""}
  `;
}

export interface WaterMaterialContext {
  csm: CSM | null;
  applyAerial: (material: THREE.Material) => void;
  assets: WaterAssets;
  uniforms: WaterUniforms;
  tier: WaterTier;
  nativeRibbonLayout?: boolean;
  nativeInlandLayout?: boolean;
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
    shader.fragmentShader = boundedPhysicalLighting(shader.fragmentShader, renderer.capabilities?.maxTextures ?? 16);
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
uniform float uVerticalScale;
${ctx.nativeInlandLayout ? `attribute vec3 waterRasterOverride;
attribute vec2 waterRasterResponse;
attribute float waterRasterExplicit;
attribute float waterGround;
#define waterOverride vec4(waterRasterOverride, 0.0)
#define waterFlowY 0.0
#define waterLevelResponse vec3(waterRasterResponse, waterRasterExplicit)` : ctx.nativeRibbonLayout ? `attribute vec3 waterRibbonFlow;
attribute vec2 waterRibbonResponse;
attribute float waterRibbonResponseValid;
#define waterOverride vec4(position.y, waterRibbonFlow.xz, 1.0)
#define waterGround 0.0
#define waterFlowY waterRibbonFlow.y
#define waterLevelResponse vec3(waterRibbonResponse, waterRibbonResponseValid)` : `attribute vec4 waterOverride;
attribute float waterGround;
attribute float waterFlowY;
attribute vec3 waterLevelResponse;`}
#define esSourceNormal ${ctx.nativeInlandLayout ? 'vec3(0.0, 1.0, 0.0)' : 'normal'}
attribute float waterAccessOffset;
attribute float waterBodyIndex;
attribute float waterNative;
attribute float waterCellSize;
varying float vWaterBodyIndex;
varying float vRasterExplicit;
varying vec3 vOceanDetail;
varying float vRibbon;
varying float vEsFlowY;
varying float vEsAccess;
varying vec4 vEsData;
varying vec3 vEsKlass;
varying vec3 vEsFlow;
varying vec3 vEsNormalW;
varying vec3 vEsSurf;
${SAMPLER_GLSL}
${MARINE_DATUM_GLSL}
${gerstnerGlsl(tier.waveBands)}
${SPECTRAL_OCEAN_GLSL}
${LOCAL_WATER_SURFACE_GLSL}
${NATIVE_WATER_GROUND_GLSL}
${surfGlsl()}`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
vec3 esRestW = (modelMatrix * vec4(position, 1.0)).xyz;
// Explicit raster vertices share a geometric edge but sample their own
// side's semantics. Native/hero overrides retain current velocity in yz.
vec2 esDataXZ = (waterOverride.w < 0.5 && waterLevelResponse.z > 0.5) ? waterOverride.yz : esRestW.xz;
vec2 esSurf = esMarineDatumSurface(esSurfaceAt(esDataXZ), waterOverride.w);
vRibbon = waterOverride.w;
vWaterBodyIndex = waterBodyIndex;
vRasterExplicit = waterLevelResponse.z;
vEsFlowY = waterFlowY;
if (waterOverride.w > 0.5 || waterLevelResponse.z > 0.5) esSurf = vec2(waterOverride.x, waterOverride.x - waterGround);
if (uNativeGroundActive > 0.5 && waterOverride.w > 0.5 && waterOverride.w < 1.5) esSurf.y = esSurf.x - esNativeGroundAt(esRestW.xz);
vec2 esDataUv = esFlowUv(esDataXZ);
vec4 esKl = texture2D(uKlassTex, esDataUv);
esKl.r = esClassAt(esDataXZ) / 255.0;
if (waterOverride.w > 0.5 && waterOverride.w < 1.5) esKl.r = 3.0 / 255.0;
if (waterLevelResponse.z > 1.5 && waterOverride.w < 0.5) esKl.r = 3.0 / 255.0;
vec4 esFl = texture2D(uFlowTex, esDataUv);
vec3 esCharacter = texture2D(uCharacterTex, esDataUv).rgb;
float esOutside = (esRestW.x < 0.0 || esRestW.z < 0.0
  || esRestW.x >= uFlowExtentM || esRestW.z >= uFlowExtentM) ? 1.0 : 0.0;
esKl = mix(esKl, vec4(1.0 / 255.0, 0.25, 1.0, 1.0), esOutside);
esCharacter.b = mix(esCharacter.b, 1.0, esOutside);
esFl = mix(esFl, vec4(0.5, 0.5, 0.0, 1.0), esOutside);
vec3 esSS = esShoreAt(esDataXZ);   // shore dist, season response, tannin
vec3 esStage = esStageAt(esDataXZ, esKl.b, esSS.y);
if (waterLevelResponse.z > 0.5) esStage.yz = waterLevelResponse.xy;
float esLevelOffset = uLevelTide * esStage.y + uLevelSeason * esStage.z;
vEsAccess = (waterOverride.w > 0.5 ? waterAccessOffset : esStage.x) - esLevelOffset;
float esStill = esSurf.x + esLevelOffset;
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
    esShoreAt(esDataXZ + vec2(eG, 0.0)).x - esShore,
    esShoreAt(esDataXZ + vec2(0.0, eG)).x - esShore) / eG;
  float esGL = length(esGradD);
  vec2 esSeaDir = esGL > 0.05 ? esGradD / esGL : vec2(0.0);
  esShoreDir = -esSeaDir;
  float esSeaD = esGL > 0.05 ? esShoreAt(esDataXZ + esSeaDir * 30.0).x : esShore;
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
float esVDepth = max(esSurf.y + esLevelOffset, 0.0);
float esExposure = esWaveExposure(esShore, esVDepth, esTurbV);
float esCamDist = distance(cameraPosition.xz, esRestW.xz);
float esWaveAmp = min(esExposure * esCharacter.b * uWindWave, esVDepth * 0.45);
EsWave esW;
vOceanDetail = vec3(0.0);
if (uOceanEnabled > 0.5 && esKl.r * 255.0 < 2.5) {
  vec2 detailSlope;
  vec3 spectrum = esOceanSpectrum(esRestW.xz, max(waterCellSize, 0.125), detailSlope) * esWaveAmp;
  vOceanDetail = vec3(detailSlope * esWaveAmp, esWaveAmp);
  esW.disp = vec3(0.0, spectrum.x, 0.0);
  esW.normal = normalize(vec3(-spectrum.y, 1.0, -spectrum.z));
  esW.height = spectrum.x;
} else if (esWaveAmp > 0.002) {
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
if ((waterOverride.w > 0.5 && waterOverride.w < 1.5) || waterNative > 0.5) esW.normal = normalize(esSourceNormal + vec3(esW.normal.x, 0.0, esW.normal.z));
if (waterOverride.w > 1.5) {
  vec4 local = esLocalWaterSurface(esRestW.xz);
  esW.disp.y += local.x;
  esW.normal = normalize(vec3(esW.normal.x / max(esW.normal.y, 0.001) - local.y,
    1.0, esW.normal.z / max(esW.normal.y, 0.001) - local.z));
}
vEsSurf = vec3(esFetch, esShoreDir);
vEsData = vec4(esStill, max(esSurf.y + esStill + esW.disp.y - esSurf.x, 0.0), esExposure, esShore);
vEsKlass = vec3(esKl.g, esKl.b, esSS.z);   // turbidity, salinity, tannin
vec2 esFlowV = waterOverride.w > 0.5 ? waterOverride.yz : esFlowAt(esDataXZ);
// surface drop along the current → cascades/rapids where water descends
float esDropSlope = 0.0;
float esFlowSp = length(esFlowV);
if (esFlowSp > 0.15) {
  vec2 esDownAt = esSurfaceAt(esDataXZ + (esFlowV / esFlowSp) * 7.0);
  esDropSlope = clamp((esSurf.x - esDownAt.x) / 7.0, 0.0, 1.0);
}
if (waterOverride.w > 0.5) esDropSlope = length(esSourceNormal.xz) / max(esSourceNormal.y, 0.001);
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
  ${WATER_NATIVE_FRAGMENT_DEPTH_GLSL}
  float localMask = esLocalWaterMask(vEsWorldPos.xz);
  if (vRibbon > 1.5 && localMask < 0.5) discard;
  if (vRibbon < 1.5 && localMask > 0.5) {
    vec3 support = esSupportAt(vEsWorldPos.xz);
    float owner = (vRibbon > 0.5 || vRasterExplicit > 0.5) ? vWaterBodyIndex : floor(support.g * 255.0 + 0.5) * 256.0 + floor(support.b * 255.0 + 0.5);
    if (abs(owner - uLocalWaterBody) < 0.5) discard;
  }
  if (vRibbon > 0.5 && vRibbon < 1.5 && vEsAccess > 0.001) discard;
  if (vRibbon < 0.5 && esSupportAt(vEsWorldPos.xz).x < mix(0.5, 0.75, uNativeChannelCoverage)) discard;
  if (vRibbon < 0.5 && vRasterExplicit > 0.5) {
    vec2 ownerBytes = esSupportAt(vEsWorldPos.xz).gb;
    float owner = floor(ownerBytes.x * 255.0 + 0.5) * 256.0 + floor(ownerBytes.y * 255.0 + 0.5);
    if (abs(owner - vWaterBodyIndex) > 0.5) discard;
  }
  if (vRibbon < 0.5 && uHasAccess > 0.5) {
    vec3 stage = esStageAt(vEsWorldPos.xz, 0.0, 0.0);
    if (stage.x > uLevelTide * stage.y + uLevelSeason * stage.z + 0.001) discard;
  }
  // The horizon grid serves marine water only. Inland geometry is fixed
  // to the native water lattice and never interpolates across body IDs.
  float waterClass = esClassAt(vEsWorldPos.xz);
  bool insideProvince = all(greaterThanEqual(vEsWorldPos.xz, vec2(0.0))) && all(lessThan(vEsWorldPos.xz, vec2(uFlowExtentM)));
  if (vRibbon < -0.5 && insideProvince && waterClass >= 2.5) discard;
  if (vRibbon > -0.5 && vRibbon < 0.5 && (!insideProvince || waterClass < 2.5)) discard;
  if (esMarineReplaced(vEsWorldPos.xz, vRibbon)) discard;
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
if (uOceanEnabled > 0.5 && vOceanDetail.z > 0.00001) {
  float pixelM = max(length(dFdx(vEsWorldPos.xz)), length(dFdy(vEsWorldPos.xz)));
  vec2 detail = (esOceanBand(vEsWorldPos.xz, 1, pixelM).yz + esOceanBand(vEsWorldPos.xz, 2, pixelM).yz) * vOceanDetail.z;
  // Replace only mesh-filtered detail; retain the long swell and shoreline
  // normal. Never rotate world coordinates or double-count vertex slopes.
  vec2 gradient = esNBase.xz / max(esNBase.y, 0.001) + (vOceanDetail.xy - detail) * uVerticalScale;
  esNBase = normalize(vec3(gradient.x, 1.0, gradient.y));
}
// A conservative flat patch may have vertices in a neighbour's channel.
// Its visible standing-water pixels retain their own flow, with zero grade.
vec3 esRenderedFlow = vRasterExplicit > 1.5 && vRibbon < 0.5 ? vec3(esFlowAt(vEsWorldPos.xz), 0.0) : vEsFlow;
float esRenderedFlowY = vRasterExplicit > 1.5 && vRibbon < 0.5 ? 0.0 : vEsFlowY;
float esSpeed = length(vec3(esRenderedFlow.x, esRenderedFlowY, esRenderedFlow.y));
// cascades: white churning descent where the surface visibly drops
float esCascade = smoothstep(0.04, 0.30, esRenderedFlow.z);
// Classify the actual still-water grade, not projected screen derivatives.
// The latter change with camera azimuth/pitch and studio exaggeration, making
// the same sheet switch appearance as the player looks around.
float esFall = smoothstep(1.2, 3.0, esRenderedFlow.z);
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
  ? esRenderedFlow.xy
  : vec2(sin(uWaveTime * 0.13), cos(uWaveTime * 0.11)) * 0.03;
float esPh1 = fract(uTransportTime * 0.25);
float esPh2 = fract(uTransportTime * 0.25 + 0.5);
EsFlowCoordinates esAdvected = esFlowAdvection(
  vec3(vEsWorldPos.x, vEsWorldPos.y / max(uVerticalScale, 0.001), vEsWorldPos.z),
  vec3(esDrift.x, esRenderedFlowY, esDrift.y), uTransportTime, 1.0);
float esPhB = esAdvected.blend;
// fast water: features stretch along the flow (anisotropy is a primary
// speed cue — research rivers-on-slopes Q2)
vec2 esFDirN = length(esRenderedFlow.xy) > 0.05 ? normalize(esRenderedFlow.xy) : vec2(1.0, 0.0);
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
  // The resolved physical patch already contains this impact. Crossfade the
  // older normal-only ring field at its perimeter, never double the wave.
  float esRippleWeight = uRippleInfo.w;
  if (vRibbon > 1.5) esRippleWeight *= 1.0 - esLocalWaterWeight(vEsWorldPos.xz);
  if (esRippleWeight > 0.0 && all(greaterThan(rUv, vec2(0.02))) && all(lessThan(rUv, vec2(0.98)))) {
    vec3 isolated = esIsolatedRipple(uRipple, rUv);
    esRip = isolated.xy * 14.0 * esRippleWeight;
    esRipCrest = abs(isolated.z) * 6.0 * esRippleWeight;
  }
}
#endif
// rain agitation (round 2): the sim patch only reaches ~64 m — beyond it a
// fast time-jittered high-frequency perturbation makes rain read on ALL
// visible water. Two decorrelated phases so it shimmers rather than scrolls;
// fades with distance like the other detail so the far shimmer stays clean.
vec2 esRainG = vec2(0.0);
if (uRainRipple > 0.02) {
  esRainG = (esDetailGrad(vEsWorldPos.xz * 2.9, vec2(0.41, 0.33) * uTransportTime * 2.6)
           + esDetailGrad(vEsWorldPos.xz * 5.3 + 31.0, vec2(-0.29, 0.47) * uTransportTime * 2.6))
          * uRainRipple * 0.09 * (0.25 + 0.75 * esFarFade);
}
vec3 esFlowGradient = vec3(esG.x + esGF.x, 0.0, esG.y + esGF.y);
if (esFall > 0.01) {
  vec2 weights = abs(esNBase.xz) / max(abs(esNBase.x) + abs(esNBase.z), 0.001);
  vec2 gZY = mix(esDetailGrad(esAdvected.a.zy * 0.55, vec2(0.0)),
                esDetailGrad(esAdvected.b.zy * 0.55, vec2(0.0)), esPhB);
  vec2 gXY = mix(esDetailGrad(esAdvected.a.xy * 0.55, vec2(0.0)),
                esDetailGrad(esAdvected.b.xy * 0.55, vec2(0.0)), esPhB);
  esFlowGradient = mix(esFlowGradient,
    vec3(0.0, gZY.y, gZY.x) * weights.x + vec3(gXY.x, gXY.y, 0.0) * weights.y, esFall);
}
vec3 esNW = normalize(esNBase - esFlowGradient * esDetStrength
  - vec3(esRip.x + esRainG.x, 0.0, esRip.y + esRainG.y));
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
float esColDepth = min(esThick, max(esFragmentDepth, 0.05) * 4.0);
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
// Falling water uses the SAME 3D current as geometry and physics. Different
// texture scales do not invent different falling speeds.
if (esFall > 0.01) {
  float esF1 = mix(esFallingNoise(esAdvected.a * 0.22, esNBase, 3),
                   esFallingNoise(esAdvected.b * 0.22, esNBase, 3), esPhB);
  float esF2 = mix(esFallingNoise(esAdvected.a * 0.08 + 7.0, esNBase, 2),
                   esFallingNoise(esAdvected.b * 0.08 + 7.0, esNBase, 2), esPhB);
  esFTex = mix(esFTex, esF1 * (0.55 + 0.9 * esF2), esFall);
  esFoamE = mix(esFoamE, 0.42 + 0.30 * esF2, esFall);
}
esFoamE = min(esFoamE, 0.68);
float esFThr = 1.0 - esFoamE;
float esFoam = smoothstep(esFThr - 0.18, esFThr + 0.26, esFTex)
             * smoothstep(0.0, 0.10, esFoamE);
float esMicroFoam = mix(esFbm(esAdvected.a.xz * 1.9, 3), esFbm(esAdvected.b.xz * 1.9, 3), esPhB);
float esShadeNoise = mix(esFbm(esAdvected.a.xz * 3.7, 3), esFbm(esAdvected.b.xz * 3.7, 3), esPhB);
if (esFall > 0.01) {
  esMicroFoam = mix(esMicroFoam, mix(esFallingNoise(esAdvected.a * 1.9, esNBase, 3),
    esFallingNoise(esAdvected.b * 1.9, esNBase, 3), esPhB), esFall);
  esShadeNoise = mix(esShadeNoise, mix(esFallingNoise(esAdvected.a * 3.7, esNBase, 3),
    esFallingNoise(esAdvected.b * 3.7, esNBase, 3), esPhB), esFall);
}
esFoam = clamp(esFoam, 0.0, 1.0)
       * (0.5 + 0.5 * esMicroFoam)
       * (0.25 + 0.75 * esFarFade) * 0.9;
if (vRibbon > 1.5) esFoam = max(esFoam, clamp(esLocalWaterSurface(vEsWorldPos.xz).w, 0.0, 0.85));
float esFoamShade = 0.72 + 0.36 * esShadeNoise;
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
float esFres = 0.02 + 0.98 * pow(1.0 - max(dot(esNW, esView), 0.0), 5.0);
// Trace only where a sharp reflection can contribute. PMREM remains the
// continuous fallback; direct sun/moon glints are unaffected by this budget.
float esSsrVisibility = smoothstep(0.02, 0.08, esFres)
  * (1.0 - smoothstep(0.25, 0.55, roughnessFactor));
if (esDist < 1200.0 && esSsrVisibility > 0.001) {
  vec4 esS = esSsr(vEsWorldPos, reflect(-esView, esNW));
  float esSsrFade = 1.0 - smoothstep(800.0, 1200.0, esDist);
  esSpecEnv = mix(esSpecEnv, esS.rgb * esFres,
    clamp(esS.a, 0.0, 1.0) * uSsrStrength * esSsrFade * esSsrVisibility * (1.0 - esFoam));
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
  material.customProgramCacheKey = () => `es-water-v2-${variant}-${tier.name}-${ctx.nativeInlandLayout ? "native-inland" : ctx.nativeRibbonLayout ? "native-ribbon" : "general"}`;
  return material;
}
