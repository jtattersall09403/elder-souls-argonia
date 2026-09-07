import * as THREE from "three";
import { SHORE_SWELL, SWASH } from "../waves";
import type { WaterMeta } from "../waterData";
import { WATER_CAUSTICS_GLSL } from "./caustics";
import { CONNECTED_STAGE_GLSL } from "./connectedStage";
import { LOCAL_WATER_EDGE_M, LOCAL_WATER_SURFACE_GLSL } from "../localPatchPresentation";
import { LOCAL_WATER_CAUSTICS_GLSL } from "./localWaterCaustics";
import { boundedPhysicalLighting } from "./boundedPhysicalLighting";
import type { LocalWaterSurfaceState } from "./types";

/** The previous raster bundle remains supported for reversible studio comparison. */
export interface GroundWetnessAssets {
  meta: WaterMeta;
  surfaceTex: THREE.Texture;
  shoreTex: THREE.Texture;
  klassTex: THREE.Texture;
  supportTex?: THREE.Texture;
  characterTex?: THREE.Texture;
  accessTex?: THREE.Texture;
}

/** Each scene owns its wetness state; the renderer injects current tide/season/weather. */
export function createGroundWetnessUniforms() {
  return {
    uLocalWaterField: { value: null as THREE.Texture | null },
    uLocalWaterInfo: { value: new THREE.Vector4(0, 0, 1, 1) },
    uLocalWaterEdge: { value: LOCAL_WATER_EDGE_M },
    uLocalWaterActive: { value: 0 },
    uLocalWaterBody: { value: 0 },
    uWetSurf: { value: null as THREE.Texture | null },
    uWetShore: { value: null as THREE.Texture | null },
    uWetKlass: { value: null as THREE.Texture | null },
    uWetSupport: { value: null as THREE.Texture | null },
    uWetCharacter: { value: null as THREE.Texture | null },
    uWetAccess: { value: null as THREE.Texture | null },
    uWetAccessParams: { value: new THREE.Vector3(0, -2, 4) },
    uWetNativeCoverage: { value: 0 },
    /** Surface minimum, range, texture size and metres per sample. */
    uWetParams: { value: new THREE.Vector4(0, 1, 0, 1) },
    uWetOrigin: { value: 0 },
    uWetDepthMin: { value: 0 },
    /** Class texture size, metres per sample and grid origin in metres. */
    uWetKlassParams: { value: new THREE.Vector3(1, 1, 0) },
    uWetShoreMax: { value: 160 },
    uWetHasSupport: { value: 0 },
    uWetHasCharacter: { value: 0 },
    uWetLevels: { value: new THREE.Vector2(0, 0) },
    uRainWet: { value: 0 },
    uWetWind: { value: 1 },
    uWetTime: { value: 0 },
    uWetSun: { value: new THREE.Vector3(0, -1, 0) },
  };
}

export type GroundWetnessUniforms = ReturnType<typeof createGroundWetnessUniforms>;

export function updateGroundLocalWater(uniforms: GroundWetnessUniforms, state: LocalWaterSurfaceState | null): void {
  uniforms.uLocalWaterActive.value = state?.active ? 1 : 0;
  uniforms.uLocalWaterField.value = state?.field ?? null;
  if (!state) return;
  uniforms.uLocalWaterInfo.value.set(state.originX, state.originZ, state.cellSizeM, state.size);
  uniforms.uLocalWaterEdge.value = state.edgeBlendM;
  uniforms.uLocalWaterBody.value = state.bodyIndex;
}

export function primeGroundWetnessUniforms(uniforms: GroundWetnessUniforms, assets: GroundWetnessAssets): void {
  const { surface, klass } = assets.meta;
  uniforms.uWetSurf.value = assets.surfaceTex;
  uniforms.uWetShore.value = assets.shoreTex;
  uniforms.uWetKlass.value = assets.klassTex;
  uniforms.uWetSupport.value = assets.supportTex ?? null;
  uniforms.uWetCharacter.value = assets.characterTex ?? null;
  uniforms.uWetAccess.value = assets.accessTex ?? null;
  uniforms.uWetAccessParams.value.set(assets.accessTex ? 1 : 0,
    surface.accessMinOffsetM ?? -2, surface.accessSpanM ?? 4);
  uniforms.uWetNativeCoverage.value = surface.nativeChannelCoverage ? 1 : 0;
  uniforms.uWetHasSupport.value = assets.supportTex ? 1 : 0;
  uniforms.uWetHasCharacter.value = assets.characterTex ? 1 : 0;
  uniforms.uWetParams.value.set(surface.minM, surface.maxM - surface.minM, surface.size, surface.metresPerPixel);
  uniforms.uWetOrigin.value = surface.gridOriginM ?? surface.metresPerPixel * 0.5;
  uniforms.uWetDepthMin.value = surface.depthMinM ?? 0;
  uniforms.uWetKlassParams.value.set(klass.size, klass.metresPerPixel, klass.gridOriginM ?? klass.metresPerPixel * 0.5);
  uniforms.uWetShoreMax.value = surface.shoreMaxM ?? 160;
}

export const WATER_RECEIVER_DECLARATIONS = /* glsl */`
uniform sampler2D uWetSurf;
uniform sampler2D uWetShore;
uniform sampler2D uWetKlass;
uniform sampler2D uWetSupport;
uniform vec3 uWetAccessParams;
uniform float uWetNativeCoverage;
uniform vec4 uWetParams;
uniform float uWetOrigin;
uniform float uWetDepthMin;
uniform vec3 uWetKlassParams;
uniform float uWetShoreMax;
uniform float uWetHasSupport;
uniform float uWetHasCharacter;
uniform vec2 uWetLevels;
uniform float uRainWet;
uniform float uWetWind;
uniform float uWetTime;
uniform vec3 uWetSun;
${WATER_CAUSTICS_GLSL}
${CONNECTED_STAGE_GLSL}
${LOCAL_WATER_SURFACE_GLSL}
${LOCAL_WATER_CAUSTICS_GLSL}

bool esWetInsideProvince(vec2 p) {
  return all(greaterThanEqual(p, vec2(0.0)))
    && all(lessThan(p, vec2(uWetParams.z * uWetParams.w)));
}
vec3 esWetStage(vec2 p, float salinity, float season) {
  if (!esWetInsideProvince(p)) return vec3(-2.0, 1.0, 0.0);
  if (uWetAccessParams.x < 0.5) return vec3(-2.0, smoothstep(0.02, 0.15, salinity), season);
  return esConnectedStage(p, uWetSurf, uWetSupport, uWetShore,
    uWetParams.z, uWetParams.w, uWetOrigin, uWetAccessParams.y, uWetAccessParams.z);
}

vec2 esWetSurfaceUv(vec2 worldXZ) {
  return ((worldXZ - uWetOrigin) / uWetParams.w + 0.5) / uWetParams.z;
}
vec2 esWetClassUv(vec2 worldXZ) {
  return ((worldXZ - uWetKlassParams.z) / uWetKlassParams.y + 0.5) / uWetKlassParams.x;
}
// Decode BEFORE interpolation: 16-bit level is in RG, signed depth in B.
vec2 esWetLevelDepth(ivec2 texel) {
  vec4 sampleValue = texelFetch(uWetSurf, clamp(texel, ivec2(0), ivec2(uWetParams.z) - 1), 0);
  float level = (sampleValue.r * 255.0 * 256.0 + sampleValue.g * 255.0) / 65535.0;
  return vec2(uWetParams.x + level * uWetParams.y, sampleValue.b * 25.5 + uWetDepthMin);
}
vec2 esWetSampleSurface(vec2 worldXZ) {
  if (!esWetInsideProvince(worldXZ)) return vec2(0.0, 25.5);
  if (uWetNativeCoverage > 0.5) {
    vec4 value = esOwnedRaster(worldXZ, uWetSurf, uWetSupport, uWetParams.z, uWetParams.w, uWetOrigin);
    float level = dot(value.rg, vec2(65280.0, 255.0)) / 65535.0;
    return vec2(uWetParams.x + level * uWetParams.y, value.b * 25.5 + uWetDepthMin);
  }
  vec2 pixel = clamp((worldXZ - uWetOrigin) / uWetParams.w, vec2(0.0), vec2(uWetParams.z - 1.0));
  ivec2 corner = ivec2(floor(pixel));
  vec2 f = fract(pixel);
  return mix(mix(esWetLevelDepth(corner), esWetLevelDepth(corner + ivec2(1, 0)), f.x),
             mix(esWetLevelDepth(corner + ivec2(0, 1)), esWetLevelDepth(corner + ivec2(1, 1)), f.x), f.y);
}
float esWetShoreAt(vec2 worldXZ) {
  return texture2D(uWetShore, esWetSurfaceUv(worldXZ)).r * uWetShoreMax;
}
float esWetHash(vec2 p) { return fract(sin(dot(p, vec2(157.31, 113.97))) * 43137.5453); }
float esWetNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(esWetHash(i), esWetHash(i + vec2(1.0, 0.0)), f.x),
             mix(esWetHash(i + vec2(0.0, 1.0)), esWetHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/** Shared direct-light receiver path for terrain and opt-in physical props.
 * Evaluate derivative-bearing optics uniformly, then apply ownership gates;
 * branching around them at a shore makes mixed pixel quads undefined.
 */
export function waterReceiverLight(position: string, normal: string, verticalScale: string): string {
  return /* glsl */ `
{
  vec3 receiver = ${position};
  receiver.y /= max(${verticalScale}, 0.001);
  vec3 receiverNormal = normalize(${normal});
  vec2 suv = esWetSurfaceUv(receiver.xz);
  // The physical query and ocean surface continue beyond the raster as
  // tidal open sea. Receivers must use that same column and chemistry.
  float outside = float(!esWetInsideProvince(receiver.xz));
  vec3 shore = mix(texture2D(uWetShore, suv).rgb, vec3(1.0, 0.0, 0.0), outside);
  vec3 klass = mix(texture2D(uWetKlass, esWetClassUv(receiver.xz)).rgb,
    vec3(1.0 / 255.0, 0.25, 1.0), outside);
  vec2 column = esWetSampleSurface(receiver.xz);
  vec3 stage = esWetStage(receiver.xz, klass.b, shore.g);
  float offset = stage.y * uWetLevels.x + stage.z * uWetLevels.y;
  float level = column.x + offset;
  float supported = uWetHasSupport * step(0.5, texture2D(uWetSupport, suv).r);
  supported = mix(supported, 1.0, outside) * step(0.5, uWetParams.z);
  if (uWetAccessParams.x > 0.5 && stage.x > offset + 0.001) supported = 0.0;
  float focus = esWaterCaustics(receiver, receiverNormal, level, klass.g, shore.b,
    uWetSun, supported, uWetTime, clamp(uWetWind * 0.3, 0.15, 1.0));
  outgoingLight += reflectedLight.directDiffuse * focus * 0.8;
  vec2 localOwner = texture2D(uWetSupport, suv).gb;
  float localBody = mix(dot(localOwner, vec2(65280.0, 255.0)), 65535.0, outside);
  float localFocus = esLocalWaterCaustic(receiver, receiverNormal, level, uWetSun);
  // The physical patch must not make opaque tannin/turbidity transparent.
  float localVisibility = esCausticVisibility(level - receiver.y, klass.g, shore.b,
    uWetSun.y, 1.0, supported, 1.0);
  outgoingLight += reflectedLight.directDiffuse * localFocus * localVisibility
    * (1.0 - step(0.5, abs(localBody - uLocalWaterBody)));
}
#include <opaque_fragment>`;
}

const SURFACE_WETNESS = /* glsl */`
float esWetTotal = 0.0;
if (uWetParams.z > 0.5) {
  vec2 esWetXZ = vEsWorldPos.xz;
  float esWetExtent = uWetParams.z * uWetParams.w;
  bool esWetInside = all(greaterThanEqual(esWetXZ, vec2(0.0))) && all(lessThan(esWetXZ, vec2(esWetExtent)));
  vec2 esWetUv = esWetSurfaceUv(esWetXZ);
  bool esWetSupported = uWetHasSupport < 0.5 || texture2D(uWetSupport, esWetUv).r > 0.5;
  if (esWetInside && esWetSupported) {
    vec3 esWetSS = texture2D(uWetShore, esWetUv).rgb;
    float esWetShore = esWetSS.r * uWetShoreMax;
    if (esWetShore < 22.0) {
      vec2 esWetSurface = esWetSampleSurface(esWetXZ);
      vec2 esWetKuv = esWetClassUv(esWetXZ);
      vec4 esWetK = texture2D(uWetKlass, esWetKuv);
      ivec2 esWetKpixel = clamp(ivec2(floor(esWetKuv * uWetKlassParams.x)), ivec2(0), ivec2(uWetKlassParams.x - 1.0));
      float esWetClass = texelFetch(uWetKlass, esWetKpixel, 0).r * 255.0;
      if (uWetHasSupport > 0.5 && esWetClass < 0.5) esWetClass = 4.0;
      vec3 esWetStageValue = esWetStage(esWetXZ, esWetK.b, esWetSS.g);
      float esWetOffset = esWetStageValue.y * uWetLevels.x + esWetStageValue.z * uWetLevels.y;
      float esWetW = esWetSurface.x + esWetOffset;
      float esWetDepth = esWetSurface.y + esWetOffset;
      float esWetH = vEsWorldPos.y / uVerticalScale;
      // Match the surface's coastal fetch/shelter gate. Inland lakes and
      // rivers keep a damp contact edge but cannot inherit beach run-up.
      float esWetFetch = 0.0;
      if (esWetClass > 0.5 && esWetClass < 2.5) {
        float esWetStep = uWetParams.w * 2.0;
        vec2 esWetGradient = vec2(esWetShoreAt(esWetXZ + vec2(esWetStep, 0.0)), esWetShoreAt(esWetXZ + vec2(0.0, esWetStep))) - esWetShore;
        float esWetGradientLength = length(esWetGradient);
        float esWetSeaward = esWetGradientLength > 0.05 * esWetStep
          ? esWetShoreAt(esWetXZ + esWetGradient / esWetGradientLength * 30.0) : esWetShore;
        esWetFetch = clamp(max(esWetShore, esWetSeaward) / ${SHORE_SWELL.fetchM.toFixed(1)}, 0.0, 1.0)
          * (1.0 - 0.85 * clamp(max(esWetK.g, esWetSS.b), 0.0, 1.0));
      }
      float esWetLift = ${(0.75 * SWASH.amplitudeM).toFixed(6)} * clamp(pow(uWetWind, 0.8), 0.6, 3.2)
        * max(1.0 - esWetShore / ${SWASH.bandM.toFixed(1)}, 0.0) * clamp(esWetFetch * 1.6, 0.0, 1.0) + 0.08;
      float esWetN = 0.65 * esWetNoise(esWetXZ * 0.35) + 0.35 * esWetNoise(esWetXZ * 1.7);
      float esAbove = esWetH - esWetW + (esWetN - 0.5) * esWetLift * 0.9;
      float esWet = (1.0 - smoothstep(esWetLift * 0.55, esWetLift * 1.65, esAbove))
        * (1.0 - smoothstep(14.0, 22.0, esWetShore)) * (0.8 + 0.4 * esWetN);
      if (uWetAccessParams.x > 0.5) esWet *= 1.0 - smoothstep(esWetLift, esWetLift * 1.65,
        esWetStageValue.x - esWetOffset);
      // Signed depth distinguishes genuinely reachable dry shore from far
      // dry terrain inside a supported seasonal basin. Allow quantisation
      // headroom (depth is encoded in 10 cm steps).
      if (uWetHasSupport > 0.5) esWet *= 1.0 - smoothstep(esWetLift * 1.65 + 0.1, esWetLift * 1.65 + 0.3, -esWetDepth);
      esWet *= smoothstep(0.78, 0.9, normalize(esNrmW).y);
      esWetTotal = clamp(esWet * 0.85, 0.0, 1.0);
    }
  }
}
// Rain remains independent of hydrological support and persists as the
// injected weather wetness decays; canopy shelters the ground below it.
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
#include <emissivemap_fragment>
`;

/** Apply after terrain splat shading and before aerial perspective. The host
 * terrain shader supplies vEsWorldPos, esNrmW, uVerticalScale, uClimateAir and
 * uProvinceExtentM; these are its existing world-position/climate inputs. */
export function applyGroundWetness(material: THREE.Material, uniforms: GroundWetnessUniforms): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.fragmentShader = boundedPhysicalLighting(shader.fragmentShader, renderer.capabilities?.maxTextures ?? 16);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${WATER_RECEIVER_DECLARATIONS}`)
      .replace("#include <emissivemap_fragment>", SURFACE_WETNESS)
      .replace("#include <opaque_fragment>", waterReceiverLight('vEsWorldPos', 'esNrmW', 'uVerticalScale'));
  };
  const previousKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${previousKey.call(material)}|water-ground-wetness-v2`;
  material.needsUpdate = true;
}
