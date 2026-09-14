import * as THREE from "three";
import { SEA, SURF_ENERGY, SWASH } from "../waves";
import { buriedThresholdM, type WaterMeta } from "../waterData";
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
    /** Signed-depth decode of the surface B channel (decision 0047). */
    uWetDepthMin: { value: 0 },
    uWetDepthSpan: { value: 25.5 },
    /** Signed depth above which a texel's level counts (waterData
     * buriedThresholdM): buried texels never weigh into the wet band's level. */
    uWetBuried: { value: 0.001 },
    /** Class texture size, metres per sample and grid origin in metres. */
    uWetKlassParams: { value: new THREE.Vector3(1, 1, 0) },
    uWetShoreMax: { value: 160 },
    uWetHasSupport: { value: 0 },
    uWetHasCharacter: { value: 0 },
    uWetLevels: { value: new THREE.Vector2(0, 0) },
    uRainWet: { value: 0 },
    /** Wave-scale knob (caustic wind only). */
    uWetWind: { value: 1 },
    /** The weather's 10 m wind (m/s): the beach band's surf energy, the same
     * knob as the water surface's (waves.ts surfEnergyScale). 0 = the floor
     * wind, a calm sea. */
    uWetWindMS: { value: 0 },
    uWetTime: { value: 0 },
    /** Dev-only A/B scalar on the caustic terms only (1 = shipped look). */
    uWetCausticDebug: { value: 1 },
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
  uniforms.uWetDepthSpan.value = surface.depthSpanM ?? 25.5;
  uniforms.uWetBuried.value = buriedThresholdM(assets.meta);
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
uniform float uWetDepthSpan;
uniform float uWetBuried;
uniform vec3 uWetKlassParams;
uniform float uWetShoreMax;
uniform float uWetHasSupport;
uniform float uWetHasCharacter;
uniform vec2 uWetLevels;
uniform float uRainWet;
uniform float uWetWind;
uniform float uWetWindMS;
uniform float uWetTime;
uniform vec3 uWetSun;
uniform float uWetCausticDebug;
// Base gain: the focused-ray density is sparse, so a unit gain reads as a
// 0.3 % bed lift in probes; 3x brings a 1 m sunlit bed into the visible band.
#define CAUSTIC_STRENGTH 3.0
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
  return vec2(uWetParams.x + level * uWetParams.y, sampleValue.b * uWetDepthSpan + uWetDepthMin);
}
// NOT-BURIED level weighting (KEEP IN LOCKSTEP with waterMaterial.ts
// esSurfaceAt and WaterData.surfaceBase): a buried texel carries
// W = ground − 3 m, and a plain bilinear mixed that into the level, so the
// band's threshold H − W walked 3 m across every last wet texel and the band
// edge staircased at texel resolution (16c round 2: the owner's straight,
// saw-toothed wet edges). Only texels whose signed depth is above the buried
// threshold weigh into the level; the depth keeps the plain bilinear. The
// native-coverage path is owner-weighted already (esOwnedRaster).
vec2 esWetSampleSurface(vec2 worldXZ) {
  if (!esWetInsideProvince(worldXZ)) return vec2(0.0, 25.5);
  if (uWetNativeCoverage > 0.5) {
    vec4 value = esOwnedRaster(worldXZ, uWetSurf, uWetSupport, uWetParams.z, uWetParams.w, uWetOrigin);
    float level = dot(value.rg, vec2(65280.0, 255.0)) / 65535.0;
    return vec2(uWetParams.x + level * uWetParams.y, value.b * uWetDepthSpan + uWetDepthMin);
  }
  vec2 pixel = clamp((worldXZ - uWetOrigin) / uWetParams.w, vec2(0.0), vec2(uWetParams.z - 1.0));
  ivec2 corner = ivec2(floor(pixel));
  vec2 f = fract(pixel);
  vec2 s00 = esWetLevelDepth(corner);
  vec2 s10 = esWetLevelDepth(corner + ivec2(1, 0));
  vec2 s01 = esWetLevelDepth(corner + ivec2(0, 1));
  vec2 s11 = esWetLevelDepth(corner + ivec2(1, 1));
  vec4 bw = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  vec4 wet = vec4(step(uWetBuried, s00.y), step(uWetBuried, s10.y), step(uWetBuried, s01.y), step(uWetBuried, s11.y));
  vec4 ww = bw * wet;
  float wsum = ww.x + ww.y + ww.z + ww.w;
  vec2 plain = mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
  float level = wsum > 0.0
    ? (ww.x * s00.x + ww.y * s10.x + ww.z * s01.x + ww.w * s11.x) / wsum
    : plain.x;
  return vec2(level, plain.y);
}
// KEEP IN LOCKSTEP with waves.ts surfEnergyScale(wind, SEA.fetchMaxM): THE
// surf energy knob, on the ocean's fetch (the ground shader has no fetch
// raster; a coast/estuary shore is the open sea's, see the class note in
// SURFACE_WETNESS_GLSL).
float esWetSurfEnergy(float windMS) {
  float u = max(${SEA.swellFloorWindMS.toFixed(1)}, windMS);
  float hs = min(0.0016 * u * sqrt(${SEA.fetchMaxM.toFixed(1)} / 9.81), 0.21 * u * u / 9.81);
  return clamp(hs * 0.25 / ${SURF_ENERGY.refRmsM.toFixed(2)}, ${SURF_ENERGY.min.toFixed(1)}, ${SURF_ENERGY.max.toFixed(1)});
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
  // Ownership of the column, NOT a light gate: a support raster names the
  // owning body where a bundle ships one; the field bundle has none, and
  // there "submerged" is exactly the sampled signed depth proxy standing
  // above the receiver. Gating on uWetHasSupport alone zeroed caustics for
  // every fragment in the province (decision 0046 bundle).
  float supportSample = texture2D(uWetSupport, suv).r;
  float supported = uWetHasSupport > 0.5 ? step(0.5, supportSample) : step(0.05, column.y);
  supported = mix(supported, 1.0, outside) * step(0.5, uWetParams.z);
  if (uWetAccessParams.x > 0.5 && stage.x > offset + 0.001) supported = 0.0;
  float focus = esWaterCaustics(receiver, receiverNormal, level, klass.g, shore.b,
    uWetSun, supported, uWetTime, clamp(0.45 + uWetWind * 0.3, 0.45, 1.0));
  outgoingLight += reflectedLight.directDiffuse * focus * CAUSTIC_STRENGTH * uWetCausticDebug;
  vec2 localOwner = texture2D(uWetSupport, suv).gb;
  float localBody = mix(dot(localOwner, vec2(65280.0, 255.0)), 65535.0, outside);
  float localFocus = esLocalWaterCaustic(receiver, receiverNormal, level, uWetSun);
  // The physical patch must not make opaque tannin/turbidity transparent.
  float localVisibility = esCausticVisibility(level - receiver.y, klass.g, shore.b,
    uWetSun.y, 1.0, supported, 1.0);
  outgoingLight += reflectedLight.directDiffuse * localFocus * localVisibility
    * uWetCausticDebug * (1.0 - step(0.5, abs(localBody - uLocalWaterBody)));
}
#include <opaque_fragment>`;
}

/** The minimum HEIGHT the wet-shore band fades over (m). The swash run-up sets
 * how far up a beach the band reaches, but it falls to 0.08 m where there is
 * no surf, and a band that fades over 8 cm of height is an iso-contour of the
 * compiled level: a straight line with the raster's own steps and bilinear
 * facets in it (owner 2026-09-14). 0.35 m is a hand's depth of damp sand — at
 * a beach's slope a couple of metres of ground, at a river bank a few
 * centimetres of bank, and never a drawn line. */
export const WET_BAND_SOFT_M = 0.35;

export const SURFACE_WETNESS_GLSL = /* glsl */`
float esWetTotal = 0.0;
// The compiled band is a 22 m strip that darkens the ground by 45 %: from
// the air it projected to a one-pixel black line tracing every coast at any
// distance (16c round 2). It fades out with camera distance; rain wetness
// below is unaffected.
float esWetFade = 1.0 - smoothstep(350.0, 1200.0, distance(cameraPosition.xz, vEsWorldPos.xz));
if (uWetParams.z > 0.5 && esWetFade > 0.0) {
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
      // The beach run-up band belongs to the sea: a coast or estuary class
      // is the open sea's shore, whose fetch is the ocean's (the ground
      // shader has no texture unit left for the compiled fetch raster, and
      // needs none: the class already says which shores the surf reaches).
      // Inland lakes and rivers keep a damp contact edge, never run-up.
      float esWetFetch = 0.0;
      if (esWetClass > 0.5 && esWetClass < 2.5) {
        esWetFetch = 1.0 - 0.85 * clamp(max(esWetK.g, esWetSS.b), 0.0, 1.0);
      }
      // KEEP IN LOCKSTEP with waves.ts swashMax(): the recent waterline
      float esWetLift = ${(0.75 * SWASH.amplitudeM).toFixed(6)} * esWetSurfEnergy(uWetWindMS)
        * max(1.0 - esWetShore / ${SWASH.bandM.toFixed(1)}, 0.0) * clamp(esWetFetch * 1.6, 0.0, 1.0) + 0.08;
      // How much HEIGHT the band fades over. The run-up lift alone bottoms out
      // at 0.08 m where there is no surf (a river bank, a lee shore), and an
      // 8 cm window over a smooth field prints a razor-thin iso-contour: the
      // owner's "unpleasant sharp edges. The lines themselves are too straight
      // and you can see those jagged triangular spiky edge effect things along
      // the edges" (2026-09-14, tmp/image.png, and the same at every river).
      // The floor below is the softness, never the position: the run-up still
      // decides how far UP the beach the band reaches.
      float esWetSoft = max(esWetLift, ${WET_BAND_SOFT_M.toFixed(2)});
      float esWetN = 0.65 * esWetNoise(esWetXZ * 0.35) + 0.35 * esWetNoise(esWetXZ * 1.7);
      // ...and the contour is broken by the same noise, at the softness scale,
      // so the edge wanders like a tide line instead of tracing the raster.
      float esAbove = esWetH - esWetW + (esWetN - 0.5) * esWetSoft * 0.9;
      float esWet = (1.0 - smoothstep(esWetSoft * 0.55, esWetSoft * 1.65, esAbove))
        * (1.0 - smoothstep(14.0, 22.0, esWetShore)) * (0.8 + 0.4 * esWetN);
      if (uWetAccessParams.x > 0.5) esWet *= 1.0 - smoothstep(esWetSoft, esWetSoft * 1.65,
        esWetStageValue.x - esWetOffset);
      // Signed depth distinguishes genuinely reachable dry shore from dry
      // terrain that merely sits near a body's raster level (a bundle with a
      // support raster, or any signed-depth bundle: decision 0047 v2 ships
      // depthMinM < 0). The depth raster is quantised at 0.12 m, so this
      // window is FIVE quanta wide and noise-broken: a 0.2 m window over a
      // 0.12 m quantum was the staircase and the triangular facets along the
      // waterline (bilinear interpolation of a quantised field, 2026-09-14).
      if (uWetHasSupport > 0.5 || uWetDepthMin < -0.5)
        esWet *= 1.0 - smoothstep(esWetSoft * 1.65 + 0.15, esWetSoft * 1.65 + 0.75,
          -esWetDepth + (esWetN - 0.5) * 0.25);
      esWet *= smoothstep(0.78, 0.9, normalize(esNrmW).y);
      esWetTotal = clamp(esWet * 0.85, 0.0, 1.0) * esWetFade;
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
      .replace("#include <emissivemap_fragment>", SURFACE_WETNESS_GLSL)
      .replace("#include <opaque_fragment>", waterReceiverLight('vEsWorldPos', 'esNrmW', 'uVerticalScale'));
  };
  const previousKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${previousKey.call(material)}|water-ground-wetness-v5`;
  material.needsUpdate = true;
}
