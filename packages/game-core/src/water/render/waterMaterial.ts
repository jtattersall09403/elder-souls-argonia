import * as THREE from "three";
import { WHITEWATER_GLSL, STREAK_LAYERS } from "./whitewaterStreaks";
import { STRIP_BANK_FADE_START } from "./ChannelStrips";
import type { CSM } from "three/examples/jsm/csm/CSM.js";
import { FLOW_WAVE_MIN_SPEED_MS, SEA, WAVES, flowWaveGlsl, snapOmegaGlsl, gerstnerGlsl, gerstnerSumGlsl, gerstnerFragGlsl, gerstnerCrestGlsl, standingRatioGlsl, surfGlsl,
  waveExposureGlsl, whitecapThreshold, whitecapDriftMS } from "@elder-souls/game-core/water/index";
import { buriedThresholdM, tideResponseGlsl } from "../waterData";

import type { WaterAssets } from "./types";
import { RIPPLE_PATCH_M } from "./RippleSim";
import { FOAM_FIELD_GLSL, createFoamFieldUniforms, type FoamFieldUniforms } from "./FoamField";
import { RAIN_RINGS_GLSL } from "./rainRings";
import { SPARKLE_SSS_GLSL } from "./sparkleSss";
import { HORIZON_BLEND_GLSL } from "./horizonBlend";
import { MENISCUS_GLSL } from "./meniscus";
import { SHORE_FROTH_GLSL } from "./shoreFroth";

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
 *   rings, drifting river flecks — all turbidity-damped), speckle-free
 *   distance shading (detail and roughness LOD), tiered SSR, and the
 *   terrain-cut shoreline of decision 0047: the hardware depth test against
 *   the blit-written scene depth trims the surface at the terrain, a
 *   VERTICAL thickness fade (unrefracted scene depth) softens it, and the
 *   raster only ever discards as a coarse buried guard (signed depth + lift).
 *
 * Adapted from WaterThreeJS (MIT © achrefelouafi); flow advection after
 * three.js `Water2`/Valve; shore-wave formulas per
 * docs/research/rendering/water-edges-and-shore-waves.md.
 */

export type WaterVariant = "above" | "below";
/**
 * `field` is the province-wide raster grid; `strip` is the same shader driven
 * by per-vertex attributes along a compiled steep-stream polyline (decision
 * 0046 item 4) — one look, two sources, so a stream never changes appearance
 * where it leaves the raster.
 */
export type WaterSurfaceMode = "field" | "strip";

export interface WaterTier {
  name: "low" | "high";
  ssr: boolean;
  godRays: boolean;
  ripples: boolean;
  waveBands: number;
  /** The surface grid's uniform cell (m), the one source WaterSurface builds
   * from: bands under ~2x this leave the vertex path for the fragment
   * (perf-diag9 V1, `vertexBandWeight`). */
  gridCellM: number;
  /** Crest-defining bands (`crestBands`) whose height the crest reads per
   * pixel instead of from the mesh (perf-diag11 W1); 0 = mesh crest. */
  crestBands: number;
  rtScale: number;
  samples: number;
}

export const WATER_TIERS: Record<"low" | "high", WaterTier> = {
  // samples stay 0: a multisampled half-float RT costs serious VRAM/bandwidth
  // (owner round 1 perf); water/overlay edges still get the canvas MSAA.
  high: { name: "high", ssr: true, godRays: true, ripples: true, waveBands: WAVES.bands, gridCellM: 2.6, crestBands: 2, rtScale: 0.9, samples: 0 },
  low: { name: "low", ssr: false, godRays: false, ripples: true, waveBands: WAVES.lowTierBands, gridCellM: 3.6, crestBands: 2, rtScale: 0.75, samples: 0 },
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
 *
 * The ambient air layer (fireflies, midges, dragonflies, pollen, leaves, sun
 * shafts) lives here too, for the same reason: it is transparent and depth-
 * write free, and on layer 0 the water surface painted over every midge and
 * dragonfly — the two species placed over open water (owner 2026-09-11).
 */
export const PRECIP_LAYER = 5;
export const MAX_CONTACT_BODIES = 8;
/** Nearest cascade plunge points fed to the field shader for pool foam. */
export const MAX_PLUNGE_SOURCES = 16;

export interface WaterUniforms extends FoamFieldUniforms {
  uWaveTime: { value: number };
  /** Transport clock (s): current advection, unscaled by wind or preview rate. */
  uTransportTime: { value: number };
  /** Weather wind → wave-energy scale (game-core setWindWaveScale twin). */
  uWindWave: { value: number };
  /** The weather's 10 m wind: speed (m/s) sets the sea's rms height with the
   * compiled fetch (`esSeaRms`); the unit direction drifts the still-water
   * detail and the whitecap pattern (audit root causes 1, 2, 5). */
  uWindMS: { value: number };
  uWindDir: { value: THREE.Vector2 };
  /** Crest-noise threshold above which a pixel whitecaps (`whitecapThreshold`). */
  uCapThreshold: { value: number };
  /** Open-water fetch cap the flow raster's B is encoded against (m). */
  uFetchMax: { value: number };
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
  /** Signed-depth decode of the surface B channel: depth = B·span + min. */
  uSurfDepthMin: { value: number };
  uSurfDepthSpan: { value: number };
  /** Texels at or below this signed depth are buried (never level-weighted). */
  uSurfBuried: { value: number };
  uSurfShore: { value: THREE.Texture };
  /** 16f colour constituents: algae rides `uSurfShore.a`, dark rides
   * `uKlassTex.a` (packed at load; the shader is at the 16-sampler limit).
   * `uColourOn` 0 when the build ships no dressing. */
  uColourOn: { value: number };
  uFlowTex: { value: THREE.Texture };
  uKlassTex: { value: THREE.Texture };
  uFlowExtentM: { value: number };
  uFlowMax: { value: number };
  /** 16d (0067): beyond the province the water is the open sea at y = 0
   * over the apron's ground (`uApronTex`, RG16 heights, row 0 = north).
   * `uHasApron` 0 keeps the edge-texel rule for a build without the apron. */
  uHasApron: { value: number };
  /** First row of `uSurfTex` that holds the apron tile (the province's rows
   * end at `uSurfSize`); no extra sampler — the water shader already uses
   * every texture unit the flyover's GPU budget allows. */
  uApronRow0: { value: number };
  uApronMin: { value: number };
  uApronSpan: { value: number };
  uApronOrigin: { value: THREE.Vector2 };
  uApronMpp: { value: number };
  uApronSize: { value: THREE.Vector2 };
  /** Class index / turbidity / salinity of the coast, for the sea beyond. */
  uApronCoast: { value: THREE.Vector3 };
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
  /** Strip/fall ownership mask (0 field, 128 strip, 255 fall) + its toggle:
   * the field surface discards where a strip mesh or sheet owns the cell. */
  uHasOwner: { value: number };
  uSurfExtentM: { value: number };
  /** x, z, radius (m), strength — nearest waterfall plunge pools. */
  uPlunges: { value: THREE.Vector4[] };
  uPlungeCount: { value: number };
  /** Vanilla foam tile (kit slot `foam`, alpha = coverage) or null → fbm. */
  uFoamTex: { value: THREE.Texture | null };
  /** Sun direction (unit, world), sun radiance and sky ambient for the
   * sparkle, crest scatter and meniscus rim — copied from the runtime each
   * frame (the aerial patch owns `uSunDirW`; never redeclared here). */
  uWaterSunDir: { value: THREE.Vector3 };
  uWaterSunLight: { value: THREE.Vector3 };
  uWaterAmbient: { value: THREE.Vector3 };
  /** Dev debug view (`?wdbg=<n>`, WATER_DEBUG_GLSL): 0 = the normal output. */
  uEsDebugMode: { value: number };
}

/** The water debug views (`?wdbg=<n>`, tooling/gpu-lane/README.md): a uniform
 * compare at the very end of the fragment, so mode 0 is the shipped output
 * and the program and its cache key are the same in every mode. Each mode
 * writes an opaque colour: 1 vertex normal, 2 shading normal, 3 fresnel,
 * 4 foam, 5 crest (0.5 grey = still level, ±1 m to black/white), 6 reflected
 * sky/env, 7 refraction/transmitted colour, 8 final alpha, 9 aerial change
 * (|post − pre| x exposure, 0.25 = white), 10 sparkle, 11 fract(rest xz / 4 m) as
 * RG, 12 the normal colour at alpha 1 (overdraw of stacked transparent
 * layers), 13 reflection weight in the final mix (fresnel × cover), 14 the
 * final colour before aerial and fog, 15 SSR weight. The HDR views 6, 7 and
 * 14 are tone mapped with the scene exposure and output encoded like the
 * final colour, so they read on the same scale as the shipped image. */
export const WATER_DEBUG_GLSL = /* glsl */ `
if (uEsDebugMode > 0.5) {
  int esDm = int(uEsDebugMode + 0.5);
  vec3 esDc = gl_FragColor.rgb;
  if (esDm == 1) esDc = normalize(vEsNormalW) * 0.5 + 0.5;
  else if (esDm == 2) esDc = esNW * 0.5 + 0.5;
  else if (esDm == 3) esDc = vec3(esDbgFres);
  else if (esDm == 4) esDc = vec3(esFoam);
  else if (esDm == 5) esDc = vec3(clamp(esDbgCrest * 0.5 + 0.5, 0.0, 1.0));
  else if (esDm == 6) esDc = esDbgSky;
  else if (esDm == 7) esDc = esDbgRefr;
  else if (esDm == 8) esDc = vec3(gl_FragColor.a);
  else if (esDm == 9) {
    vec3 esDa = abs(esDbgPost - esDbgPre);
#ifdef TONE_MAPPING
    esDa *= toneMappingExposure;
#endif
    esDc = clamp(esDa * 4.0, 0.0, 1.0);
  }
  else if (esDm == 10) esDc = vec3(esDbgSpec);
  else if (esDm == 11) esDc = vec3(fract(vEsRestXZ * 0.25), 0.0);
  else if (esDm == 13) esDc = vec3(esDbgReflW);
  else if (esDm == 14) esDc = esDbgMix;
  else if (esDm == 15) esDc = vec3(esDbgSsrW);
  if (esDm == 6 || esDm == 7 || esDm == 14) {
#ifdef TONE_MAPPING
    esDc = toneMapping(esDc);
#endif
    esDc = linearToOutputTexel(vec4(esDc, 1.0)).rgb;
  }
  gl_FragColor = vec4(esDc, 1.0);
}`;

export function createWaterUniforms(assets: WaterAssets): WaterUniforms {
  const m = assets.meta;
  return {
    uWaveTime: { value: 0 },
    uTransportTime: { value: 0 },
    uWindWave: { value: 1 },
    uWindMS: { value: 0 },
    uWindDir: { value: new THREE.Vector2(WAVES.windDir[0], WAVES.windDir[1]) },
    uCapThreshold: { value: whitecapThreshold(0) },
    uFetchMax: { value: m.flow.fetchMaxM ?? SEA.fetchMaxM },
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
    uSurfDepthMin: { value: m.surface.depthMinM ?? 0 },
    uSurfDepthSpan: { value: m.surface.depthSpanM ?? 25.5 },
    uSurfBuried: { value: buriedThresholdM(m) },
    uSurfShore: { value: assets.shoreTex },
    uColourOn: { value: assets.dressing ? 1 : 0 },
    uFlowTex: { value: assets.flowTex },
    uKlassTex: { value: assets.klassTex },
    uFlowExtentM: { value: m.flow.size * m.flow.metresPerPixel },
    uFlowMax: { value: m.flow.flowMax },
    uHasApron: { value: assets.apron ? 1 : 0 },
    uApronRow0: { value: assets.apron?.atlasRow0 ?? 0 },
    uApronMin: { value: assets.apron?.minM ?? 0 },
    uApronSpan: { value: assets.apron ? assets.apron.maxM - assets.apron.minM : 1 },
    uApronOrigin: { value: new THREE.Vector2(assets.apron?.ground.originM[0] ?? 0, assets.apron?.ground.originM[1] ?? 0) },
    uApronMpp: { value: assets.apron?.ground.metresPerSample ?? 1 },
    uApronSize: { value: new THREE.Vector2(assets.apron?.ground.nx ?? 1, assets.apron?.ground.ny ?? 1) },
    uApronCoast: { value: new THREE.Vector3(assets.apron?.coastClassIndex ?? 1, assets.apron?.coastTurbidity ?? 0, assets.apron?.coastSalinity ?? 1) },
    uSsrStrength: { value: 0.85 },
    uRefractStrength: { value: 0.35 },
    uRipple: { value: null },
    uRippleInfo: { value: new THREE.Vector4(0, 0, RIPPLE_PATCH_M, 0) },
    uRainRipple: { value: 0 },
    uBodies: { value: Array.from({ length: MAX_CONTACT_BODIES }, () => new THREE.Vector4()) },
    uBodyCount: { value: 0 },
    uHasOwner: { value: assets.hasOwner ? 1 : 0 },
    uSurfExtentM: { value: m.surface.size * m.surface.metresPerPixel },
    uPlunges: { value: Array.from({ length: MAX_PLUNGE_SOURCES }, () => new THREE.Vector4()) },
    uPlungeCount: { value: 0 },
    ...createFoamFieldUniforms(),
    uFoamTex: { value: assets.waterfallTextures?.foam ?? null },
    uWaterSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uWaterSunLight: { value: new THREE.Vector3(0, 0, 0) },
    uWaterAmbient: { value: new THREE.Vector3(0, 0, 0) },
    uEsDebugMode: { value: 0 },
  };
}

/** Noise helpers (adapted from WaterThreeJS, MIT). Shared with the foam
 * field pass (`FoamField`), which decodes the same rasters. */
export const NOISE_GLSL = /* glsl */ `
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

/** Screen-space reflections march only this near (metres): beyond it the
 * environment map's sky reflection is indistinguishable at the pixel.
 * 1.2 km → 420 m (16f round 3) → 260 m (round 5, owner: bring it in a
 * little further; the march is per water pixel, so this is frame time). */
export const SSR_FADE_START_M = 160;
export const SSR_FADE_END_M = 260;

/** Shared data samplers (W/depth/shore raster, flow, class). */
export const SAMPLER_GLSL = /* glsl */ `
  uniform sampler2D uSurfTex;
  uniform float uSurfMin;
  uniform float uSurfSpan;
  uniform float uSurfSize;
  uniform float uSurfMpp;
  uniform float uSurfShoreMax;
  uniform float uSurfDepthMin;
  uniform float uSurfDepthSpan;
  uniform float uSurfBuried;
  uniform sampler2D uSurfShore;
  uniform float uColourOn;
  uniform sampler2D uFlowTex;
  uniform sampler2D uKlassTex;
  uniform float uFlowExtentM;
  uniform float uFlowMax;
  uniform float uLevelTide;
  uniform float uLevelSeason;
  uniform float uWaveTime;
  uniform float uTransportTime;
  uniform float uWindWave;
  uniform float uWindMS;
  uniform vec2 uWindDir;
  uniform float uCapThreshold;
  uniform float uFetchMax;
  uniform float uHasApron;
  uniform float uApronRow0;
  uniform float uApronMin;
  uniform float uApronSpan;
  uniform vec2 uApronOrigin;
  uniform float uApronMpp;
  uniform vec2 uApronSize;
  uniform vec3 uApronCoast;

  // KEEP IN LOCKSTEP with waterData.decodeDepthByte(): B is SIGNED depth.
  vec2 esDecodeSurf(vec4 t){
    float w = uSurfMin + ((t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0) * uSurfSpan;
    return vec2(w, t.b * uSurfDepthSpan + uSurfDepthMin);
  }

  // Outside the province square (the water raster's own extent).
  bool esOutside(vec2 wpos){
    float extent = uSurfSize * uSurfMpp;
    return wpos.x < 0.0 || wpos.y < 0.0 || wpos.x >= extent || wpos.y >= extent;
  }
  // The apron ground (m) beyond the border: manual bilinear over the RG16
  // tile, clamped to its edge. KEEP IN LOCKSTEP with WaterData.apronHeight().
  float esApronTexel(ivec2 i){
    vec4 t = texelFetch(uSurfTex, ivec2(i.x, int(uApronRow0) + i.y), 0);
    return uApronMin + ((t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0) * uApronSpan;
  }
  float esApronGround(vec2 wpos){
    vec2 f = clamp((wpos - uApronOrigin) / uApronMpp, vec2(0.0), uApronSize - 1.001);
    ivec2 i0 = ivec2(f);
    vec2 t = f - vec2(i0);
    ivec2 i1 = min(i0 + 1, ivec2(uApronSize) - 1);
    return mix(mix(esApronTexel(i0), esApronTexel(ivec2(i1.x, i0.y)), t.x),
               mix(esApronTexel(ivec2(i0.x, i1.y)), esApronTexel(i1), t.x), t.y);
  }

  // Manual bilinear over the 16-bit W raster (height, signed depth). Beyond
  // the province the water is the OPEN SEA at y = 0 over the apron ground
  // (16d, decision 0067): a river or lake on the border ends at the border,
  // the sea and the canon inlets continue. Without an apron the EDGE texel
  // continues (clamp-to-edge): a sea border carries the sea outward, a land
  // border carries buried ground (audit mechanism 5).
  // KEEP IN LOCKSTEP with WaterData.surfaceBase / depthProxy.
  vec2 esSurfaceAt(vec2 wpos){
    if (uHasApron > 0.5 && esOutside(wpos)) return vec2(0.0, -esApronGround(wpos));
    vec2 f = clamp(wpos / uSurfMpp - 0.5, vec2(0.0), vec2(uSurfSize - 1.001));
    ivec2 i0 = ivec2(f);
    vec2 t = f - vec2(i0);
    ivec2 i1 = min(i0 + 1, ivec2(int(uSurfSize) - 1));
    vec2 s00 = esDecodeSurf(texelFetch(uSurfTex, i0, 0));
    vec2 s10 = esDecodeSurf(texelFetch(uSurfTex, ivec2(i1.x, i0.y), 0));
    vec2 s01 = esDecodeSurf(texelFetch(uSurfTex, ivec2(i0.x, i1.y), 0));
    vec2 s11 = esDecodeSurf(texelFetch(uSurfTex, i1, 0));
    // NOT-BURIED height weighting: buried texels carry W = ground - buryM, so
    // mixing their W into the surface tilts the last texel 5-40 degrees down
    // into the bank ("blobs sitting on land"). Table texels (dry now, but
    // floodable, signed depth in (-2, 0]) carry their body's level and DO
    // count, so the level plane extends over the whole floodable band and a
    // season lift wets it. The depth keeps plain bilinear.
    // KEEP IN LOCKSTEP with WaterData.surfaceBase().
    vec4 esBw = vec4((1.0 - t.x) * (1.0 - t.y), t.x * (1.0 - t.y),
                     (1.0 - t.x) * t.y, t.x * t.y);
    vec4 esWet = vec4(step(uSurfBuried, s00.y), step(uSurfBuried, s10.y),
                      step(uSurfBuried, s01.y), step(uSurfBuried, s11.y));
    vec4 esWw = esBw * esWet;
    float esWsum = esWw.x + esWw.y + esWw.z + esWw.w;
    vec2 esPlain = mix(mix(s00, s10, t.x), mix(s01, s11, t.x), t.y);
    float esH = esWsum > 0.0
      ? (esWw.x * s00.x + esWw.y * s10.x + esWw.z * s01.x + esWw.w * s11.x) / esWsum
      : esPlain.x;
    return vec2(esH, esPlain.y);
  }

  // 16f colour constituents at wpos: x algae (shore raster A), y dark
  // (class raster A). Zero without the dressing. The alpha bytes are written
  // at load into the DataTexture, never decoded from a PNG's alpha (canvas
  // premultiply would corrupt the RGB), which is why they can ride alpha.
  vec2 esColourAt(vec2 wpos){
    if (uColourOn < 0.5) return vec2(0.0);
    float extent = uSurfSize * uSurfMpp;
    float algae = texture2D(uSurfShore, clamp(wpos / extent, vec2(0.0), vec2(1.0))).a;
    float dark = texture2D(uKlassTex, clamp(wpos / uFlowExtentM, vec2(0.0), vec2(1.0))).a;
    return vec2(algae, dark);
  }
  // Shore raster: R = shore distance, G = season response, B = tannin,
  // A = algae (packed at load; a PNG's own alpha is never data).
  vec3 esShoreAt(vec2 wpos){
    float extent = uSurfSize * uSurfMpp;
    vec3 s = texture2D(uSurfShore, clamp(wpos / extent, vec2(0.0), vec2(1.0))).rgb;
    return vec3(s.r * uSurfShoreMax, s.g, s.b);
  }
  // The compiled open-water fetch (m) at wpos (flow raster B, sqrt-encoded).
  float esFetchAt(vec4 flowTexel){
    return flowTexel.z * flowTexel.z * uFetchMax;
  }
`;

/* ------------------------------------------------------------------ *
 * Steep-strip whitewater (ES_STRIP) — decision 0047 item 4.
 *
 * A compiled steep reach is a shallow film running down a grade. Rendered
 * with the river material it was BROWN (silt albedo, Beer-Lambert over a few
 * centimetres) and its fixed-direction detail drift read as water running
 * uphill. Whitewater is a look, not a colour: slope x speed set an aeration
 * fraction that mixes the clear/tannin water tint toward aerated white,
 * removes transmission and raises roughness; streak noise is scrolled along
 * the ribbon's OWN arc length by a per-ribbon uniform speed (never world-time
 * x world position, never a fixed world drift), so a chute always reads as
 * running down its own axis. No shoreline terms, no refraction, no SSR.
 *
 * The TS functions and `STRIP_AERATION_GLSL` are twins: the tests measure the
 * TS, the shader compiles the string. Edit both or neither.
 * ------------------------------------------------------------------ */

function smoothstep01(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Coverage across the ribbon: 1 over the compiled water width (|side| ≤
 * `STRIP_BANK_FADE_START`), dissolving to 0 at the mesh edge `edge` =
 * (halfWidth + bank) / halfWidth (the `aEdge` attribute). Monotone, ≤ 1, and
 * multiplied into nothing bright: the bank fade can never paint a line.
 */
export function stripBankProfile(side: number, edge = 1.4): number {
  return 1 - smoothstep01(STRIP_BANK_FADE_START, Math.max(edge, STRIP_BANK_FADE_START + 1e-3), Math.abs(side));
}

/**
 * Whitewater blend `w = smoothstep(0.06, 0.30, slope) · smoothstep(0.8, 3.0,
 * speed)` (research §4.2.2 — our threshold, tuned to the 0047 classifier's
 * 0.035 steep floor): below it the ribbon is a clear film, above it the
 * aerated path. Aeration = 0.25 + 0.75 · w.
 * @param dropPerM metres of fall per metre of run (the `aDrop` attribute).
 * @param speedMS  local water speed.
 */
export function stripWhitewaterBlend(dropPerM: number, speedMS: number): number {
  return smoothstep01(0.06, 0.30, dropPerM) * smoothstep01(0.8, 3.0, speedMS);
}
export function stripAeration(dropPerM: number, speedMS: number): number {
  return Math.min(Math.max(0.25 + 0.75 * stripWhitewaterBlend(dropPerM, speedMS), 0), 1);
}

/** Aerated-water tint the strip albedo is mixed toward. */
export const STRIP_WHITE = [0.85, 0.88, 0.90] as const;

/** Streak phase along the ribbon: arc metres minus the ribbon's uniform
 * scroll speed x transport time. A feature at arc `a` at time `t` is at
 * `a + scroll·dt` at `t + dt` — downstream. The body layer (0) scrolls at
 * exactly the ribbon speed; the foam and accent layers at the measured
 * 2x / 0.3x of it (whitewaterStreaks.ts). TS twin of the strip fragment. */
export function stripStreakPhase(arcM: number, scrollMS: number, timeS: number, layer = 0): number {
  const L = STREAK_LAYERS[Math.min(Math.max(layer, 0), STREAK_LAYERS.length - 1)];
  return arcM - (scrollMS * L.rateMS / STREAK_LAYERS[0].rateMS) * timeS;
}
/** Strip scroll gain: the body layer's 1.7 m/s rate x gain = the ribbon speed. */
export function stripStreakGain(scrollMS: number): number {
  return Math.min(Math.max(scrollMS / STREAK_LAYERS[0].rateMS, 0.3), 2);
}

/**
 * Strip albedo for a given aeration and streak value: the clear/tannin water
 * tint mixed toward STRIP_WHITE by `aeration · (0.35 + 0.65 · streak)`. Never
 * the silt-tan river albedo. TS twin of the ES_STRIP fragment block.
 */
export function stripAlbedo(aeration: number, streak: number, salinity: number, tannin: number): [number, number, number] {
  const clear = [0.035 + (0.05 - 0.035) * salinity, 0.115 + (0.14 - 0.115) * salinity, 0.10 + (0.155 - 0.10) * salinity];
  const tea = [0.045, 0.065, 0.022];
  const tn = Math.min(Math.max(tannin, 0), 1);
  const w = Math.min(Math.max(aeration * (0.35 + 0.65 * streak), 0), 1);
  const out = [0, 0, 0] as [number, number, number];
  for (let i = 0; i < 3; i++) {
    const tint = clear[i] + (tea[i] - clear[i]) * tn;
    out[i] = tint + (STRIP_WHITE[i] - tint) * w;
  }
  return out;
}

export const STRIP_AERATION_GLSL = /* glsl */ `
float esStripBank(float side, float edge){
  // KEEP IN LOCKSTEP with stripBankProfile(): full over the compiled width,
  // dissolved across the bank margin only
  return 1.0 - smoothstep(${STRIP_BANK_FADE_START.toFixed(2)}, max(edge, ${(STRIP_BANK_FADE_START + 1e-3).toFixed(3)}), abs(side));
}
// KEEP IN LOCKSTEP with stripWhitewaterBlend() / stripAeration().
float esStripBlend(float dropPerM, float speedMS){
  return smoothstep(0.06, 0.30, dropPerM) * smoothstep(0.8, 3.0, speedMS);
}
float esStripAeration(float dropPerM, float speedMS){
  return clamp(0.25 + 0.75 * esStripBlend(dropPerM, speedMS), 0.0, 1.0);
}
float esStripGain(float scrollMS){
  return clamp(scrollMS / ${STREAK_LAYERS[0].rateMS.toFixed(2)}, 0.3, 2.0);
}
`;

/** Transport-clock advection cycle (s) for dual-phase foam/normal scrolling:
 * the scroll distance per cycle is `speed · FOAM_CYCLE_S`, so 1 m/s of
 * current moves foam exactly 1 m/s. */
export const FOAM_CYCLE_S = 6;
/** Buried guard: a field fragment discards only where the raster's signed
 * depth + lift is below this (relaxed with distance, never below the floor).
 * Everything else is cut by the terrain under the hardware depth test. */
export const BURIED_GUARD = { nearM: -0.35, perMetre: 0.0005, floorM: -0.7, fadeM: 0.2 } as const;
/** The field is dissolved where the compiled still surface is steeper than
 * this (metres per metre, read from the raster's own gradient — never the
 * screen-space derivative, whose far-grid step opened holes and domes,
 * audit mechanism 2): a sheet, not a field, carries a drop. */
export const FIELD_SLOPE_FADE = { start: 0.5, full: 1.0 } as const;
/** Vertical thickness (m) over which the surface fades in at the shoreline. */
export const EDGE_FADE_M = 0.15;
/** Vertical thickness (m) under which the contact-foam line draws. */
export const CONTACT_FOAM_M = 0.12;
/** The flow's own churn around a body standing in it (`esContactRush`): off
 * in a still pond, full in a torrent. `speedFullMS` is a wading pace — a
 * mountain stream runs 1.5 m/s (the round-2 evidence) — and `wake` is the
 * downstream tail's weight against the upstream bow's. Owner 2026-09-14. */
export const RUSH = { speedFromMS: 0.35, speedFullMS: 1.6, wake: 0.75 } as const;
const FLOW_WAVE_MIN_GLSL = FLOW_WAVE_MIN_SPEED_MS.toFixed(2);
/** River foam flecks: fbm (2 octaves, `scale` cycles/m) thresholded between
 * lo..hi — tuned so the dual-phase mix covers ≈ 3–6 % of a river (the test
 * ports esFbm and measures it). */
export const FLECK = { scale: 1.7, lo: 0.515, hi: 0.545 } as const;
/**
 * Vanilla foam tile as the FIELD foam's dissolve/breakup (study §3.1 (3)):
 * `foamtile01` (kit `waterfall-fx-textures`, slot `foam`), 256², coverage in
 * ALPHA. Measured 2026-09-08 over the whole tile: alpha mean 0.152, std
 * 0.195; the shader's 3-octave `esFbm` at the 0.55 cycles/m foam scale has
 * mean 0.436, std 0.130. The sample is remapped onto the fbm's moments so
 * the dissolve threshold (`esFThr = 1 − esFoamE`) covers the same area at the
 * same energy as the procedural path — the owner-reviewed density holds,
 * only the structure changes. `tileM` is the world size of one tile.
 * `fleck` thresholds the dual-phase texture mean for the river flecks
 * (measured 4.2 % coverage on the same tile with the dual-phase mean, 2026-09-08).
 */
export const FOAM_TEX = { tileM: 3.0, mean: 0.152, std: 0.195, fbmMean: 0.436, fbmStd: 0.130,
  fleck: { lo: 0.44, hi: 0.50 } } as const;

/**
 * How far the field's owner-mask hole is grown, in metres. Smaller than the
 * strip ribbon's own bank overlap (`STRIP_BANK_M` each side), so the hole can
 * never outrun the geometry that fills it.
 */
export const OWNER_DILATE_M = 1.2;

/** Dilated owner-mask coverage (0 = the field owns this pixel, 1 = a strip
 * or sheet does), compiled into the FIELD fragment shader. The share of the
 * five taps that are owned, so the field dissolves under a ribbon over
 * OWNER_DILATE_M instead of ending on a texel edge (audit mechanism 1). */
const OWNER_MASK_GLSL = /* glsl */ `
float esOwnedFrac(vec2 wpos){
  float e = ${OWNER_DILATE_M.toFixed(2)};
  vec2 taps[5];
  taps[0] = wpos;
  taps[1] = wpos + vec2(e, 0.0);
  taps[2] = wpos - vec2(e, 0.0);
  taps[3] = wpos + vec2(0.0, e);
  taps[4] = wpos - vec2(0.0, e);
  float owned = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 uv = taps[i] / max(uSurfExtentM, 1.0);
    // Owner mask = ALPHA of the surface raster's province rows (packed at
    // load; one sampler fewer on a 16-unit GPU). texelFetch keeps it NEAREST.
    if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))
        && texelFetch(uSurfTex, ivec2(uv * uSurfSize), 0).a > 0.25) owned += 1.0;
  }
  return owned / 5.0;
}
`;

/**
 * The foam dissolve/breakup mask in world metres: the vanilla foam tile when
 * the kit slot is bound (remapped onto the fbm's moments, see FOAM_TEX), the
 * procedural fbm otherwise. `esFoamMask` is the 3-octave dissolve field,
 * `esFoamMask2` the 2-octave fleck/streak field — both dual-phase advected by
 * the caller exactly as before.
 */
const FOAM_MASK_GLSL = /* glsl */ `
uniform sampler2D uFoamTex;
#ifdef ES_FOAM_TEX
float esFoamTexAt(vec2 wp){
  float a = texture2D(uFoamTex, wp / ${FOAM_TEX.tileM.toFixed(2)}).a;
  return ${FOAM_TEX.fbmMean.toFixed(3)} + (a - ${FOAM_TEX.mean.toFixed(3)}) * ${(FOAM_TEX.fbmStd / FOAM_TEX.std).toFixed(4)};
}
float esFoamMask(vec2 wp){ return esFoamTexAt(wp); }
float esFoamMask2(vec2 wp){ return esFoamTexAt(wp * 0.7 + 2.0); }
float esFoamFleck(vec2 wp){ return texture2D(uFoamTex, wp / ${FOAM_TEX.tileM.toFixed(2)}).a; }
#else
float esFoamMask(vec2 wp){ return esFbm(wp * 0.55, 3); }
float esFoamMask2(vec2 wp){ return esFbm(wp * 0.55, 2); }
float esFoamFleck(vec2 wp){ return esFbm(wp * ${FLECK.scale.toFixed(2)} + 5.0, 2); }
#endif
`;

function fragmentPrelude(tier: WaterTier, variant: WaterVariant, strip: boolean): string {
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
  uniform float uRainRipple;
  uniform float uHasOwner;
  uniform float uSurfExtentM;
  uniform vec4 uPlunges[${MAX_PLUNGE_SOURCES}];
  uniform int uPlungeCount;
  varying float vEsStill; // the vertex still level (m): lift and crest base; depth, shore and exposure are per pixel (diag4 V2)
  varying float vEsSurfH; // the vertex swash + shore swell height (m), swapped for its per-pixel value in the lift (f33)
  varying vec4 vEsKlass;  // turbidity(silt), salinity, tannin, class index; the field reads only the class (its colour is per pixel, perf10 c9 V8)
#ifdef ES_STRIP
  varying vec2 vEsColour;  // 16f: algae, dark (the ribbon's; the field samples them per pixel)
#endif
  varying vec3 vEsFlow;   // flow m/s (xy) + surface drop along flow (z)
  varying vec3 vEsNormalW; // world-space wave normal
  varying vec2 vEsSurf;   // fetch exposure, surf energy (the shore frame is per pixel)

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
      float ring = smoothstep(0.3, 0.75, q) * (1.0 - smoothstep(0.95, 1.5, q));
      c += ring * B.w * 0.6;
    }
    return min(c, 0.65);
  }

  /** Fast water piling on whatever stands in it: a bow wave hugging the
   * UPSTREAM face and a white wake tearing away downstream. The ring above is
   * a still-water splash and needs the body to move; this is the flow's own,
   * so standing still in a torrent is not glassy (owner 2026-09-14: "even if
   * you're standing still in sloped, fast flowing water it is rushing around
   * and splashing off the player's body"). Visual only — no CPU twin, because
   * nothing reads it back; the physical side is the contact emitter, which
   * already rates its spray on the speed RELATIVE to the flow.
   * dir is the unit flow direction, speed its magnitude in m/s. */
  float esContactRush(vec2 wp, vec2 dir, float speed){
    float gain = smoothstep(${RUSH.speedFromMS.toFixed(2)}, ${RUSH.speedFullMS.toFixed(2)}, speed);
    if (gain <= 0.001) return 0.0;
    float c = 0.0;
    for (int i = 0; i < ${MAX_CONTACT_BODIES}; i++){
      if (i >= uBodyCount) break;
      vec4 B = uBodies[i];
      if (B.w < 0.01) continue;
      vec2 d = (wp - B.xy) / max(B.z, 0.1);
      float along = dot(d, dir);                       // + is downstream
      float across = abs(dot(d, vec2(-dir.y, dir.x)));
      // the bow: a crescent tight to the upstream face
      float bow = (1.0 - smoothstep(0.8, 1.7, length(d))) * (1.0 - smoothstep(-0.7, 0.2, along));
      // the wake: a tail that spreads and fades downstream
      float wake = smoothstep(0.0, 0.4, along) * (1.0 - smoothstep(0.5, 4.0, along))
                 * (1.0 - smoothstep(0.45 + along * 0.35, 1.1 + along * 0.5, across));
      c += (bow + wake * ${RUSH.wake.toFixed(2)}) * B.w;
    }
    return clamp(c * gain, 0.0, 1.0);
  }

  /** Plunge-pool foam: a churning disc plus an expanding RING, spreading OUT
   * on the receiving surface under each nearby cascade and carried downstream
   * by the field flow (research §4 — plunge foam spreads, it never pops up).
   * P = (x, z, radius ≈ widthM, strength); it fades out by ~2 × radius. */
  float esPlungeFoam(vec2 wp, vec2 flow){
    float f = 0.0;
    for (int i = 0; i < ${MAX_PLUNGE_SOURCES}; i++){
      if (i >= uPlungeCount) break;
      vec4 P = uPlunges[i];
      if (P.w < 0.01) continue;
      float r = max(P.z, 0.5);
      // the impact point the foam grew FROM sits upstream of this pixel
      float q = length(wp - P.xy - flow * 0.6) / r;
      float disc = 1.0 - smoothstep(0.35, 2.0, q);
      // the expanding ring: fxrapidsringheavy's jetPuffs curve, eased 0 -> 1
      // over 2.67 s (ease-in), fading as it spreads; phase per source
      float ph = fract(uTransportTime / 2.67 + P.x * 0.013 + P.y * 0.007);
      float e = ph * ph;
      float rr = 0.45 + 1.15 * e;
      float ring = (1.0 - smoothstep(0.0, 0.16, abs(q - rr))) * (1.0 - e);
      f += P.w * (disc + ring * 0.6);
    }
    return min(f, 0.75);
  }

  ${tier.ssr && variant === "above" && !strip ? /* glsl */ `
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
        // the hit window's far side fades instead of cutting (f33: a hit/miss
        // step at diff = 8 m drew straight-edged reflection seams)
        float conf = edge.x * edge.y * (1.0 - float(i) / 18.0 * 0.4) * (1.0 - smoothstep(4.0, 8.0, diff));
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

export function createWaterMaterial(
  variant: WaterVariant,
  ctx: WaterMaterialContext,
  mode: WaterSurfaceMode = "field",
): THREE.MeshPhysicalMaterial {
  const { csm, applyAerial, uniforms, tier } = ctx;
  const strip = mode === "strip";
  /** The field crest reads the tier's crest bands per pixel (diag11 W1); a
   * strip draws its own whitewater and has no crest. */
  const crestPx = tier.crestBands > 0 && !strip;
  const foamTex = !!ctx.assets.waterfallTextures?.foam;
  const classes = ctx.assets.meta.klass.classes;
  const material = new THREE.MeshPhysicalMaterial({
    roughness: 0.08,
    metalness: 0.0,
    specularIntensity: 0.5, // F0 ≈ 0.02 — water
    side: strip ? THREE.DoubleSide : variant === "above" ? THREE.FrontSide : THREE.BackSide,
    // strips overlap the field by one station at each join; a small offset
    // makes the strip win that overlap instead of z-fighting it.
    polygonOffset: strip,
    polygonOffsetFactor: strip ? -2 : 0,
    polygonOffsetUnits: strip ? -4 : 0,
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
${strip ? "#define ES_STRIP 1" : ""}
#ifdef ES_STRIP
// Strip vertices carry their own hydraulics: the raster is a 3.66 m field
// and a one-texel ribbon bilinears into blobs on it (decision 0046 item 4).
attribute float aStill;
attribute float aBedDepth;
attribute vec2 aFlow;
attribute float aSeason;
attribute float aDrop;
attribute float aSide;
// ribbon UV (decision 0047 item 4): signed across metres, arc metres, and
// the ribbon's uniform scroll speed for the whitewater streaks
attribute float aSideM;
attribute float aArc;
attribute float aScroll;
attribute vec2 aRockFoam;   // 16f: baked rock foam at the centreline and at this edge
attribute float aEdge;
varying float vEsSide;
varying vec4 vEsStrip;
varying vec2 vEsRockFoam;
#endif
uniform float uVerticalScale;
varying float vEsStill;
varying float vEsSurfH;  // swash + shore swell at this vertex (f33: the fragment swaps it per pixel)
varying vec4 vEsKlass;
#ifdef ES_STRIP
varying vec2 vEsColour;  // 16f: algae, dark
#endif
varying vec3 vEsFlow;
varying vec3 vEsNormalW; // the vertex wave normal: debug view 1 only (the fragment's is per pixel, perf10 c9 V8)
varying vec2 vEsSurf;   // fetch exposure, surf energy
varying vec2 vEsRestXZ;  // rest world xz: per-pixel shore frame and crest phase (diag14 V1, V2)
varying vec3 vEsWaveIn;  // vertex wave amp (the crest height swap), fetch, standing
varying float vEsFlowH;  // vertex along-flow undulation height (m): the crest swaps it per pixel (perf10 D11)
${SAMPLER_GLSL}
${gerstnerGlsl(tier.waveBands, tier.gridCellM)}
${crestPx ? `varying float vEsCrestV;  // crest bands' vertex height (diag11 W1, diag12 Q2)
${gerstnerCrestGlsl(tier.waveBands, tier.gridCellM, tier.crestBands)}` : ""}
${standingRatioGlsl(classes)}
${tideResponseGlsl(classes)}
${surfGlsl()}
${flowWaveGlsl()}`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
vec3 esRestW = (modelMatrix * vec4(position, 1.0)).xyz;
vEsRestXZ = esRestW.xz;
#ifdef ES_STRIP
vEsSide = aSide;
vEsStrip = vec4(aSideM, aArc, aScroll, aEdge);
vEsRockFoam = aRockFoam;
vec2 esSurf = vec2(aStill, max(aBedDepth, 0.0));
#else
vec2 esSurf = esSurfaceAt(esRestW.xz);
#endif
// (beyond the raster every texture clamps to its edge texel: no override)
vec2 esDataUv = clamp(esRestW.xz / uFlowExtentM, vec2(0.0), vec2(1.0));
vec4 esKl = texture2D(uKlassTex, esDataUv);
vec4 esFl = texture2D(uFlowTex, esDataUv);
vec3 esSS = esShoreAt(esRestW.xz);   // shore dist, season response, tannin
#ifndef ES_STRIP
if (uHasApron > 0.5 && esOutside(esRestW.xz) && esTideResponse(esKl.r * 255.0) < 0.5) {
  // beyond the border, past a LAND or inland-water edge texel: the coast's
  // class, no current, the open sea's fetch, far from any shore, no season
  // response, no tannin (16d, 0067). Past a SEA edge texel the clamped values
  // already are the sea's, and keeping them is what makes the surface
  // continuous across the border (the owner's seam, 2026-09-15).
  esKl = vec4(uApronCoast.x / 255.0, uApronCoast.y, uApronCoast.z, 1.0);
  esFl = vec4(0.5, 0.5, 1.0, 1.0);
  esSS = vec3(uSurfShoreMax, 0.0, 0.0);
}
#endif
float esFetchM = esFetchAt(esFl);
#ifdef ES_STRIP
// no tide response inland on a steep reach; season rides the attribute
float esStill = esSurf.x + uLevelSeason * aSeason;
#else
float esStill = esSurf.x + uLevelTide * esTideResponse(esKl.r * 255.0) + uLevelSeason * esSS.y;
#endif
float esShore = esSS.x;
float esTurbV = max(esKl.g, esSS.z);
// shore frame: shoreward = -grad(shoreDist), for the swell's normal tilt.
// The surf's energy is the COMPILED directional fetch at the point (waves.ts
// gating lesson: never the depth term, which is 0 exactly at the waterline)
float esFetch = esFetchExp(esFetchM, esTurbV);
vec2 esShoreDir = vec2(0.0);
if (esShore < 90.0) {
  float eG = uSurfMpp * 2.0;
  vec2 esGradD = vec2(
    esShoreAt(esRestW.xz + vec2(eG, 0.0)).x - esShore,
    esShoreAt(esRestW.xz + vec2(0.0, eG)).x - esShore) / eG;
  float esGL = length(esGradD);
  esShoreDir = esGL > 0.05 ? -esGradD / esGL : vec2(0.0);
}
// the waterline itself TRAVELS: asymmetric swash + shoaling shore swell,
// added BEFORE the depth proxy so the advancing tongue renders on the
// beach face instead of being discarded as buried (research doc §5).
// THE surf energy knob (16c round 2): the sea's rms for the weather wind
// and this shore's compiled fetch — CPU twin surfEnergyScale() in
// waterWorld.sample. The along-shore phase makes the crests arrive
// obliquely instead of the whole waterline rising as one (alongShorePhase).
float esSurfE = esSurfEnergy(uWindMS, esFetchM);
float esAlong = esAlongPhase(esRestW.xz, esShoreDir, uWaveTime);
float esSwellDHdd = 0.0;
vEsSurfH = 0.0;
#ifndef ES_STRIP
vEsSurfH = esSwash(esShore, esFetch, uWaveTime, esSurfE, esAlong)
         + esShoreSwell(esShore, max(esSurf.y, 0.0), esFetch, uWaveTime, esSurfE, esAlong, esSwellDHdd);
esStill += vEsSurfH;
#endif
// SIGNED depth + lift (decision 0047): wet ⇔ > 0. Dry vertices stay
// negative until fragment interpolation; the fragment's buried guard and the
// hardware depth test against the terrain do the cutting.
float esVDepth = esSurf.y + (esStill - esSurf.x);
#ifdef ES_STRIP
// narrow water carries ripples, never swell: a Gerstner band wide enough to
// see would swing the whole ribbon off its bed.
float esExposure = 0.05;
#else
float esExposure = esWaveExposure(esShore, esVDepth, esTurbV);
#endif
float esCamDist = distance(cameraPosition.xz, esRestW.xz);
// the sea's rms height from the wind and the fetch (ruling 7), the local
// exposure on top; no distance fade (the far grid carries the swell, and
// the horizon blend is what the far sea meets) — CPU twin: waterWorld.sample
float esWaveAmp = esExposure * esSeaRms(uWindMS, esFetchM);
EsWave esW;
// per-band fetch (long swell needs long fetch) + the class standing ratio
// (lakes/marsh bob, coast marches) — CPU twin: waterWorld.sample; set on
// every vertex, so the fragment's per-pixel normal never interpolates a
// standing ratio toward a dry vertex's zero
float esStandW = esStandingRatio(esKl.r * 255.0, esShore);
vEsWaveIn = vec3(0.0, esFetchM, esStandW);${crestPx ? `
vEsCrestV = 0.0;` : ""}
if (esWaveAmp > 0.0005) {
  vEsWaveIn.x = esWaveAmp;
  esW = esWaveSampleEx(esRestW.xz, esWaveAmp, esFetchM, esStandW, uWaveTime);${crestPx ? `
  vEsCrestV = esWaveCrestH(esRestW.xz, esWaveAmp, esFetchM, esStandW, uWaveTime).z;` : ""}
} else {
  esW.disp = vec3(0.0);
  esW.normal = vec3(0.0, 1.0, 0.0);
  esW.height = 0.0;
}
// the shore swell's tilt stays OUT of the vertex normal: the shore direction
// and the swell slope change faster than the grid, so the fragment adds them
// per pixel at the rest xz (diag14 V1); the swell height stays here (0047)
#ifdef ES_STRIP
vec2 esFlowV = aFlow;
#else
vec2 esFlowV = (esFl.xy - 0.5) * 2.0 * uFlowMax;
#endif
float esFlowSp = length(esFlowV);
// Along-flow travelling undulation (decision 0047 item 6): a lowland river
// at 0.3 m/s is no longer a flat plate. CPU twin: waves.ts flowWaveAt(),
// used by WaterWorld.sample so buoyancy rides the same crests. Faded out
// beyond 150 m in the shader only (far LOD triangles cannot carry a 1.6 m
// wavelength; the CPU never queries there).
float esFlowH = 0.0;
${strip ? "" : /* glsl */ `
if (esFlowSp > ${FLOW_WAVE_MIN_GLSL}) {
  vec3 esFlowN;
  float esFlowFade = 1.0 - smoothstep(150.0, 400.0, esCamDist);
  // height only: its 1.6 m wavelength is shorter than the grid, so its slope
  // is added per pixel in the fragment (f33), never to the vertex normal
  esFlowH = esFlowWave(esRestW.xz, esFlowV / esFlowSp, esFlowSp, uWaveTime, esFlowN) * esFlowFade;
}`}
vEsSurf = vec2(esFetch, esSurfE);
vEsStill = esStill;
vEsKlass = vec4(esKl.g, esKl.b, esSS.z, esKl.r * 255.0);   // turbidity, salinity, tannin, class
#ifdef ES_STRIP
vEsColour = esColourAt(esRestW.xz);
#endif
// surface drop along the current → cascades/rapids where water descends
float esDropSlope = 0.0;
#ifdef ES_STRIP
esDropSlope = clamp(aDrop, 0.0, 1.0);
#else
if (esFlowSp > ${FLOW_WAVE_MIN_GLSL}) {
  vec2 esDownAt = esSurfaceAt(esRestW.xz + (esFlowV / esFlowSp) * 7.0);
  esDropSlope = clamp((esSurf.x - esDownAt.x) / 7.0, 0.0, 1.0);
}
#endif
vEsFlow = vec3(esFlowV, esDropSlope);
vEsNormalW = esW.normal;
vec3 objectNormal = esW.normal;`,
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `
vEsFlowH = esFlowH;
vec3 transformed = vec3(
  position.x + esW.disp.x,
  (esStill + esW.disp.y + esFlowH) * uVerticalScale,
  position.z + esW.disp.z);`,
      );

    const prelude = fragmentPrelude(tier, variant, strip);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
${strip ? "#define ES_STRIP 1" : ""}
#ifdef ES_STRIP
varying float vEsSide;
varying vec4 vEsStrip;
varying vec2 vEsRockFoam;
#endif
${strip ? STRIP_AERATION_GLSL + WHITEWATER_GLSL : ""}
${NOISE_GLSL}
${surfGlsl()}
${strip ? "" : snapOmegaGlsl() + flowWaveGlsl()}
${SAMPLER_GLSL}
${prelude}
${strip ? "" : OWNER_MASK_GLSL + waveExposureGlsl() + tideResponseGlsl(classes)}
${strip ? "" : FOAM_FIELD_GLSL + RAIN_RINGS_GLSL + SPARKLE_SSS_GLSL + HORIZON_BLEND_GLSL + SHORE_FROTH_GLSL + FOAM_MASK_GLSL}
${MENISCUS_GLSL}
varying vec2 vEsRestXZ;
varying vec3 vEsWaveIn;
varying float vEsFlowH;
${gerstnerSumGlsl(tier.waveBands, tier.gridCellM)}
${gerstnerFragGlsl(tier.waveBands, tier.gridCellM)}
${crestPx ? `varying float vEsCrestV;
${gerstnerCrestGlsl(tier.waveBands, tier.gridCellM, tier.crestBands)}` : ""}
${foamTex && !strip ? "#define ES_FOAM_TEX 1" : ""}
uniform vec3 uWaterSunDir;
uniform vec3 uWaterSunLight;
uniform vec3 uWaterAmbient;
uniform float uVerticalScale;
uniform float uEsDebugMode;`,
      )
      .replace(
        "void main() {",
        /* glsl */ `void main() {
  // debug-view captures (wdbg=, WATER_DEBUG_GLSL); written where each term is made
  float esDbgFres = 0.0; float esDbgCrest = 0.0; float esDbgSpec = 0.0;
  vec3 esDbgSky = vec3(0.0); vec3 esDbgRefr = vec3(0.0);
  vec3 esDbgPre = vec3(0.0); vec3 esDbgPost = vec3(0.0); vec3 esDbgMix = vec3(0.0);
  float esDbgReflW = 0.0; float esDbgSsrW = 0.0;
  float esGuard = 1.0;
  ${strip ? /* glsl */ `
  float esExpoPx = 0.05;   // narrow water: ripples, never swell (the vertex twin)
  // the ribbon's colour constituents ride its own vertices (it is one station wide)
  float esTurbPx = vEsKlass.x, esSalPx = vEsKlass.y, esTanPx = vEsKlass.z;
  vec2 esColPx = vEsColour;` : /* glsl */ `
  // Depth, shore distance and exposure PER PIXEL (perf-diag4 V2): read from
  // varyings they were one plane per triangle, and the foam thresholds over
  // them printed straight-edged pale triangles along the mesh grid.
  vec2 esFS = esSurfaceAt(vEsWorldPos.xz);
  // The shore frame, swash and shore swell PER PIXEL at the rest xz (diag14
  // V1, diag15 V4, f33): the swell changes faster than the grid, so its
  // interpolated vertex height made the lift, hence depth, exposure and the
  // buried guard, one plane per triangle. The vertex height still moves the
  // surface (0047); only the fragment's lift swaps it for the exact value.
  vec2 esShoreDirR = vec2(0.0);   // shared with the normal tilt and the surf foam phase
  float esSwellD = 0.0;           // dH/d(shore distance) of the swell, for the normal
  float esSurfHPx = 0.0;
  {
    vec3 esSR = esShoreAt(vEsRestXZ);
    if (uHasApron > 0.5 && esOutside(vEsRestXZ) && esTideResponse(vEsKlass.w) < 0.5)
      esSR = vec3(uSurfShoreMax, 0.0, 0.0);
    float eGR = uSurfMpp * 2.0;
    vec2 esGradR = vec2(
      esShoreAt(vEsRestXZ + vec2(eGR, 0.0)).x - esSR.x,
      esShoreAt(vEsRestXZ + vec2(0.0, eGR)).x - esSR.x) / eGR;
    float esGLR = length(esGradR);
    esShoreDirR = -esGradR / max(esGLR, 1e-4) * smoothstep(0.02, 0.08, esGLR);
    float esAlongR = esAlongPhase(vEsRestXZ, esShoreDirR, uWaveTime);
    esSurfHPx = esSwash(esSR.x, vEsSurf.x, uWaveTime, vEsSurf.y, esAlongR)
              + esShoreSwell(esSR.x, max(esSurfaceAt(vEsRestXZ).y, 0.0), vEsSurf.x, uWaveTime, vEsSurf.y,
                  esAlongR, esSwellD);
  }
  float esLift = vEsStill - vEsSurfH + esSurfHPx - esFS.x;   // tide + season + surf at this pixel
  float esDepthPx = esFS.y + esLift;  // signed depth + lift
  vec3 esSPx = esShoreAt(vEsWorldPos.xz);   // shore dist, season response, tannin
  // The colour constituents PER PIXEL (perf10 c9 V8): turbidity and salinity
  // from the class raster, tannin from the shore raster, algae and dark from
  // their alpha bytes. As vertex varyings they were one plane per triangle in
  // the Beer-Lambert absorption and printed straight-edged transmitted-colour
  // steps along the mesh grid.
  vec4 esKlPx = texture2D(uKlassTex, clamp(vEsWorldPos.xz / uFlowExtentM, vec2(0.0), vec2(1.0)));
  vec2 esColPx = esColourAt(vEsWorldPos.xz);
  // past the border on a land / inland edge texel: the vertex stage's apron rule
  if (uHasApron > 0.5 && esOutside(vEsWorldPos.xz) && esTideResponse(vEsKlass.w) < 0.5) {
    esSPx = vec3(uSurfShoreMax, 0.0, 0.0);
    esKlPx = vec4(uApronCoast.x / 255.0, uApronCoast.y, uApronCoast.z, 1.0);
  }
  float esTurbPx = esKlPx.g, esSalPx = esKlPx.b, esTanPx = esSPx.z;
  float esShorePx = esSPx.x;
  float esExpoPx = esWaveExposure(esShorePx, esDepthPx, max(esTurbPx, esTanPx));
  {
    // Decision 0047: the raster no longer cuts the shoreline. It only guards
    // against drawing BURIED surface (signed depth + lift below the floor);
    // the visible edge is the plane meeting the terrain mesh under the
    // hardware depth test against the blit-written scene depth. Phase 16c:
    // the three guards are COVERAGE terms folded into esCover, never a hard
    // discard on an unsampled target (audit mechanism 1), and the floor is
    // tight at every distance (a relaxed floor drew the dry table band as a
    // sheet over far shores, mechanism 4).
    float esGuardDist = distance(cameraPosition, vEsWorldPos);
    float esFloor = max(${BURIED_GUARD.nearM.toFixed(2)} - ${BURIED_GUARD.perMetre.toFixed(4)} * esGuardDist,
                        ${BURIED_GUARD.floorM.toFixed(2)});
    esGuard *= smoothstep(esFloor - ${BURIED_GUARD.fadeM.toFixed(2)}, esFloor, esDepthPx);
    // A field surface is never a cliff: where the compiled STILL surface's
    // slope, read from the RASTER's own gradient, exceeds FIELD_SLOPE_FADE
    // the raster is bridging a drop the compiler owns as a sheet
    // (mechanism 2: the screen-space derivative on a far grid cell read a
    // step as a ramp and drew a dome, or a hole).
    float esGe = uSurfMpp;
    vec2 esGW = vec2(esSurfaceAt(vEsWorldPos.xz + vec2(esGe, 0.0)).x - esSurfaceAt(vEsWorldPos.xz - vec2(esGe, 0.0)).x,
                     esSurfaceAt(vEsWorldPos.xz + vec2(0.0, esGe)).x - esSurfaceAt(vEsWorldPos.xz - vec2(0.0, esGe)).x)
                / (2.0 * esGe);
    esGuard *= 1.0 - smoothstep(${FIELD_SLOPE_FADE.start.toFixed(2)}, ${FIELD_SLOPE_FADE.full.toFixed(2)}, length(esGW));
    // The field never shows under a compiled strip or waterfall sheet: those
    // draw the same water from their own geometry (decision 0046 item 4).
    // Dilated by OWNER_DILATE_M and dissolved, never cut (mechanism 3).
    if (uHasOwner > 0.5) esGuard *= 1.0 - esOwnedFrac(vEsWorldPos.xz);
    if (esGuard <= 0.003) discard;
  }`}
  vec2 esScreenUV = gl_FragCoord.xy / uResolution;
  ${variant === "above" ? /* glsl */ `
  // Scene depth at THIS pixel (unrefracted). No manual occlusion discard:
  // the material depth-tests against the scene depth the blit wrote.
  float esFragEye = -(viewMatrix * vec4(vEsWorldPos, 1.0)).z;
  float esSceneEye = esEyeDepth(esScreenUV);
  ` : ""}`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        /* glsl */ `
float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
float esSpeed = length(vEsFlow.xy);
// cascades: white churning descent where the surface visibly drops
float esCascade = smoothstep(0.04, 0.30, vEsFlow.z);
float esDist = distance(cameraPosition, vEsWorldPos);
// The wave normal PER PIXEL inside 400 m (perf10 c9 V8): every vertex band
// at the rest xz, its amplitude from this pixel's exposure. The interpolated
// vertex normal kinked at each grid edge; the refraction offset (esNW.xz)
// and the fresnel turned the kinks into straight-edged pale facets. Past
// 120-400 m it hands over to the vertex normal (the far grid's own filter).
float esAmpPx = esExpoPx * esSeaRms(uWindMS, vEsWaveIn.y);
vec3 esNBase = normalize(vEsNormalW);
float esNPxW = 1.0 - smoothstep(120.0, 400.0, esDist);
if (esNPxW > 0.0) {
  vec3 esNPx = vec3(0.0, 1.0, 0.0);
  if (esAmpPx > 0.0005)
    esNPx = esWaveSampleEx(vEsRestXZ, esAmpPx, vEsWaveIn.y, vEsWaveIn.z, uWaveTime).normal;
  esNBase = normalize(mix(esNBase, esNPx, esNPxW));
}
// distance LOD: detail normals AND their strength fade out far away —
// unfiltered procedural ripple at 1 px = the "TV static" (round 2, defect 1)
float esDetFade = exp(-esDist * 0.010);
float esFarFade = exp(-esDist * 0.0025);
float esDetStrength = (0.10 + 0.10 * esExpoPx + 0.05 * min(esSpeed, 1.0))
                    * (0.2 + 0.8 * esFarFade) * (1.0 + 2.5 * esCascade);
// flow advection (Water2 dual-phase); still water gets a gentle wobble, not
// a stream (round 2: 'flowing' foam on static pools)
bool esFlowing = esSpeed > ${FLOW_WAVE_MIN_GLSL};
// still water: the fine ripples travel downwind at their own phase speed
// (audit root cause 2: a fixed 3 cm/s wander read as a static sea)
float esStillDrift = clamp(0.15 + 0.06 * uWindMS, 0.5, 1.5);
vec2 esDrift = esSpeed > 0.05 ? vEsFlow.xy : uWindDir * esStillDrift;
// Transport (foam/normal advection) runs on the TRANSPORT clock on a
// ${FOAM_CYCLE_S} s dual-phase cycle: the scroll distance per cycle is speed x cycle, so
// 1 m/s of current moves foam exactly 1 m/s whatever the wind or preview
// rate does to uWaveTime, which stays the waves/surf clock.
float esCycle = ${FOAM_CYCLE_S.toFixed(1)};
float esPh1 = fract(uTransportTime / esCycle);
float esPh2 = fract(uTransportTime / esCycle + 0.5);
float esPhB = abs(esPh1 * 2.0 - 1.0);
// fast water: features stretch along the flow (anisotropy is a primary
// speed cue — research rivers-on-slopes Q2)
vec2 esFDirN = esSpeed > 0.05 ? vEsFlow.xy / esSpeed : vec2(1.0, 0.0);
float esStretch = 1.0 + 1.4 * smoothstep(0.4, 2.2, esSpeed);
vec2 esP1 = (vEsWorldPos.xz - esDrift * esPh1 * esCycle) * 0.55;
vec2 esP2 = (vEsWorldPos.xz - esDrift * esPh2 * esCycle) * 0.55;
vec2 esG = mix(esDetailGrad(esP1, vec2(0.0)), esDetailGrad(esP2, vec2(0.0)), esPhB);
// Apply directional strength to the LOCAL gradient, never rotate kilometre
// world coordinates by a changing flow angle (the river barcode defect).
esG -= esFDirN * dot(esG, esFDirN) * (1.0 - 1.0 / esStretch);
// Fine detail ripple: on flowing water it follows the CURRENT (dual-phase,
// bounded offsets — decision 0047 root cause 6: the old fixed world-direction
// drift read as upstream motion on every chute); still water keeps a slow
// uniform wander.
vec2 esGF = vec2(0.0);
if (esDetFade > 0.02) {
  if (esFlowing) {
    vec2 esQ1 = (vEsWorldPos.xz - esDrift * esPh1 * esCycle) * 2.3 + 17.0;
    vec2 esQ2 = (vEsWorldPos.xz - esDrift * esPh2 * esCycle) * 2.3 + 17.0;
    esGF = mix(esDetailGrad(esQ1, vec2(0.0)), esDetailGrad(esQ2, vec2(0.0)), esPhB) * esDetFade * 0.5;
  } else {
    // transport clock: uWaveTime folds every 8192 s and this drift is not periodic
    esGF = esDetailGrad(vEsWorldPos.xz * 2.3 + 17.0, -uWindDir * esStillDrift * 0.6 * uTransportTime) * esDetFade * 0.5;
  }
}
vec2 esRip = vec2(0.0);
float esRipCrest = 0.0;
#ifdef ES_RIPPLES
{
  vec2 rUv = (vEsWorldPos.xz - uRippleInfo.xy) / uRippleInfo.z + 0.5;
  // fade over the outer band, as FoamField does (a hard cut drew a 64 m square)
  vec2 rE2 = smoothstep(vec2(0.02), vec2(0.12), rUv) * smoothstep(vec2(0.02), vec2(0.12), 1.0 - rUv);
  float rEdge = rE2.x * rE2.y;
  if (uRippleInfo.w > 0.5 && rEdge > 0.0) {
    float rTexel = 1.0 / 256.0;
    float hx1 = texture2D(uRipple, rUv + vec2(rTexel, 0.0)).r;
    float hx0 = texture2D(uRipple, rUv - vec2(rTexel, 0.0)).r;
    float hz1 = texture2D(uRipple, rUv + vec2(0.0, rTexel)).r;
    float hz0 = texture2D(uRipple, rUv - vec2(0.0, rTexel)).r;
    esRip = vec2(hx1 - hx0, hz1 - hz0) * 14.0 * rEdge;
    esRipCrest = abs(texture2D(uRipple, rUv).r) * 6.0 * rEdge;
  }
}
#endif
// rain (study §3.1 (6)): analytic cell-hashed drop rings on ALL visible
// water — discrete expanding rings, no buffers, faded by ~100 m; the 64 m
// ripple-sim stamps stay for the near field. Real time, not the wave clock.
vec2 esRainG = vec2(0.0);
${strip ? "" : /* glsl */ `
if (uRainRipple > 0.02) esRainG = esRainRings(vEsWorldPos.xz, uTransportTime, uRainRipple, esDist);`}
// short Gerstner bands the grid cannot carry (perf-diag9 V1): their slope per
// pixel, faded out where a pixel spans several of their wavelengths; z is
// their height, which makes the foam crest non-planar inside a triangle
vec3 esWaveF = vec3(0.0);
float esFlowHPx = vEsFlowH;   // along-flow undulation height at this pixel (set below where it flows)
if (esAmpPx > 0.0005 && esNPxW > 0.0)
  esWaveF = esWaveFrag(vEsRestXZ, esAmpPx, vEsWaveIn.y, vEsWaveIn.z, uWaveTime) * esNPxW;
// the tier's crest bands (its sharpest, by curvature): exact minus
// interpolated vertex HEIGHT per pixel for the crest, under the same fade;
// the vertex sum is unchanged (0047). Their slope is already in the per-pixel
// normal above (diag12 Q2: a 17.9 m band on the 3.6 m grid kinked the
// Gouraud normal).
float esCrestD = 0.0;${crestPx ? `
if (vEsWaveIn.x > 0.0005 && esNPxW > 0.0)
  esCrestD = (esWaveCrestH(vEsRestXZ, vEsWaveIn.x, vEsWaveIn.y, vEsWaveIn.z, uWaveTime).z - vEsCrestV) * esNPxW;` : ""}
vec2 esWaveG = esWaveF.xy;
${strip ? "" : /* glsl */ `
// shore swell slope per pixel at the rest xz (diag14 V1): the shore frame from
// the raster's 2-texel gradient under a soft cut, the vertex stage's swell
// profile; only its height stays per vertex (0047). In the vertex normal this
// tilt snapped between grid vertices and drew pale triangular facets.
// the along-flow undulation's slope per pixel (f33; the CPU twin sums the
// same two small-slope fields)
if (esFlowing) {
  vec3 esFlowN;
  float esFlowFadePx = 1.0 - smoothstep(150.0, 400.0, esDist);
  esFlowHPx = esFlowWave(vEsRestXZ, esFDirN, esSpeed, uWaveTime, esFlowN) * esFlowFadePx;
  esWaveG -= (esFlowN.xz / max(esFlowN.y, 1e-3)) * esFlowFadePx;
}
// the shore swell (the frame and dH/dd come from the prelude); height slope = dH/dd * grad(d)
// = -shoreDir * dH/dd. The old shore < 90 m gate is gone: a hard cut on a
// raster value is itself a straight edge, and the swell is zero there anyway.
esWaveG -= esShoreDirR * esSwellD;`}
vec3 esNW = normalize(vec3(
  esNBase.x - (esG.x + esGF.x) * esDetStrength - esWaveG.x - esRip.x - esRainG.x,
  esNBase.y,
  esNBase.z - (esG.y + esGF.y) * esDetStrength - esWaveG.y - esRip.y - esRainG.y));
// waterline meniscus (study §3.1 (8)): within +-0.4 m of the camera height
// and arm's reach, the normal tilts toward the camera; the rim is added in
// the lighting stage. Both variants: the half-in-half-out swimming shot.
float esMen = esMeniscusBand((vEsWorldPos.y - cameraPosition.y) / max(uVerticalScale, 1e-3), esDist);
if (esMen > 0.0) esNW = esMeniscusNormal(esNW, normalize(cameraPosition - vEsWorldPos), esMen);
${variant === "below" ? "esNW = -esNW;" : ""}
vec3 normal = normalize((viewMatrix * vec4(esNW, 0.0)).xyz);
vec3 nonPerturbedNormal = normal;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        variant === "above" && strip
          ? /* glsl */ `
// ---- whitewater strip (decision 0047 item 4) ---------------------------
float esSal = esSalPx;
float esTan = esTanPx;
float esBlend = esStripBlend(vEsFlow.z, esSpeed);
float esAer = esStripAeration(vEsFlow.z, esSpeed);
// three streak layers scrolled along the ribbon's OWN arc (vEsStrip.y, metres)
// by its uniform speed x transport time: body at the ribbon speed, foam at
// 2x, accent at 0.3x (the measured 6.7x spread), plus the 0.03 UV/s U drift
// and the 8.33 s U-scale breathing — never world position x time, never a
// fixed world drift (TS twins: stripStreakPhase, stripStreakGain, streakUv)
float esStripU = clamp(0.5 + 0.5 * vEsSide / max(vEsStrip.w, 1.0), 0.0, 1.0);
float esStripFoam;
float esStreak = esWhitewater(esStripU, vEsStrip.y, uTransportTime, esStripGain(vEsStrip.z), 0.5, esStripFoam);
float esWhite = clamp(esAer * (0.35 + 0.65 * esStreak), 0.0, 1.0);
// below the slope x speed threshold the film stays clear (no white streaks)
esWhite *= mix(0.15, 1.0, esBlend);
// 16f: the foam a bed boulder leaves (pillow upstream, tail downstream),
// baked per station from bed-rocks.json; interpolated across the ribbon
// between the centreline and the edge value, broken by the streak noise
{
  float esRockF = mix(vEsRockFoam.x, vEsRockFoam.y, clamp(abs(vEsSide), 0.0, 1.0));
  esWhite = clamp(esWhite + esRockF * (0.6 + 0.4 * esStreak) * (1.0 - esWhite), 0.0, 1.0);
}
// The player and the floating bodies churn a steep stream too. The contact
// rings and the ripple-sim crest reach the FIELD fragment only (they are
// added into esFoamE there), and this branch replaces that block wholesale,
// so wading into a chute showed nothing at all (owner 2026-09-14:
// "interaction effects between player and these kinds of sloped water also
// don't seem to be working (no effects at all)"). Both terms are already in
// scope: esContactFoam is in the shared prelude and esRipCrest in the shared
// normal block, which the ribbon's normal already uses. Added AFTER the
// slope/speed gate so a slow clear film still shows a wake.
// ...and the flow's own churn: a bow wave on the upstream face of anything
// standing in the torrent and a wake tearing away downstream, so a player who
// is standing STILL in fast water still has water rushing off them.
vec2 esRushDir = vEsFlow.xy / max(esSpeed, 1e-3);
float esRush = esContactRush(vEsWorldPos.xz, esRushDir, esSpeed);
esWhite = clamp(esWhite + (esContactFoam(vEsWorldPos.xz) + esRipCrest * 0.5 + esRush) * (1.0 - esWhite), 0.0, 1.0);
// clear / tannin tint only — NEVER the silt-tan river albedo, no Beer–Lambert
// brown (TS twin: stripAlbedo)
vec3 esAlbClear = mix(vec3(0.035, 0.115, 0.10), vec3(0.05, 0.14, 0.155), esSal);
vec3 esAlb = mix(esAlbClear, vec3(0.045, 0.065, 0.022), clamp(esTan, 0.0, 1.0));
vec3 esT = vec3(1.0 - esAer);           // transmission: entrained air, not depth
vec2 esRUV = esScreenUV;                // no refraction on whitewater
float esFoam = esWhite;
float esBank = esStripBank(vEsSide, vEsStrip.w);
diffuseColor.rgb = mix(esAlb, vec3(${STRIP_WHITE.map((v) => v.toFixed(2)).join(", ")}), esWhite);
roughnessFactor = mix(0.5, 0.9, esWhite);
#include <emissivemap_fragment>`
          : variant === "above"
          ? /* glsl */ `
// 16f colour constituents (decision 0070, dossier water-colour.md): the
// dark constituent is more tannin (blackwater under canopy); algae adds a
// little suspended matter and, below, a green cast to the albedo.
float esAlgae = esColPx.x;
float esTurb = clamp(esTurbPx + esAlgae * 0.25, 0.0, 1.0);   // suspended silt — "whitewater" opacity
float esSal = esSalPx;
float esTan = clamp(esTanPx + esColPx.y * 0.7, 0.0, 1.0);    // dissolved tannin — "blackwater" tea
float esMurk = clamp(esTurb * 0.7 + esTan * 0.8, 0.0, 1.0);
// ---- the shoreline is cut by the terrain; its fade is VERTICAL -----------
// Reconstruct the scene point behind this pixel from the UNREFRACTED scene
// depth along the view ray and take the true vertical water thickness over
// it (decision 0047 root cause 8: the ray thickness read through the
// REFRACTED uv printed the 0.25 m ripple texels into the waterline).
float esTv;
{
  vec3 esRay = normalize(vEsWorldPos - cameraPosition);
  vec3 esCamFwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float esSceneT = esSceneEye / max(dot(esRay, esCamFwd), 1e-3);
  vec3 esSceneW = cameraPosition + esRay * esSceneT;
  esTv = (vEsWorldPos.y - esSceneW.y) / max(uVerticalScale, 1e-3);
}
// refraction distortion is for the TRANSMITTED colour sample only; it dies
// in the shallows and is rejected when it lands in front of the surface
float esThickPre = max(esSceneEye - esFragEye, 0.0);
float esDistort = uRefractStrength * clamp(6.0 / max(esFragEye, 1.0), 0.02, 1.0)
                * smoothstep(0.03, 0.5, esTv);
vec2 esRUV = clamp(esScreenUV + esNW.xz * esDistort, vec2(0.001), vec2(0.999));
float esSceneEyeR = esEyeDepth(esRUV);
if (esSceneEyeR < esFragEye) { esRUV = esScreenUV; esSceneEyeR = esSceneEye; }
float esThick = max(esSceneEyeR - esFragEye, 0.0);
float esColDepth = min(esThick, max(esDepthPx, 0.05) * 4.0);
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
esAlb = mix(esAlb, vec3(0.16, 0.30, 0.10), esAlgae * 0.55);              // algae green (16f)

// ---- foam: a system, not a blanket (round 2 defect: white sheets) ------
float esShoreD = esShorePx;
float esExpo = esExpoPx;
// contact line and froth stay within ~20 m of the shore horizontally: deep
// water under a steep bank has a small vertical depth but carries no surf
float esShoreNear = 1.0 - smoothstep(8.0, 20.0, esShoreD);
// 1. thin contact line exactly at the waterline (vertical thickness under
// CONTACT_FOAM_M, noise-broken so it never prints a grid) — fetch-boosted so
// the active surf edge always carries a bright lip
float esFoamE;
{
  float esCn0 = esFbm(vEsWorldPos.xz * 1.3 + 3.0, 2);
  esFoamE = (1.0 - smoothstep(0.0, ${CONTACT_FOAM_M.toFixed(2)}, esTv + (esCn0 - 0.45) * 0.10))
          * (0.18 + 0.5 * clamp(max(esExpo * 2.0, vEsSurf.x), 0.0, 1.0)) * esShoreNear;
}
// 2. surf: bore foam riding each arriving crest + backwash remnants —
// same closed forms as the swell/swash geometry, so foam and waterline
// move together; per-pixel phase jitter breaks the parallel-band look
{
  float bn = esFbm(vEsWorldPos.xz * 0.16, 3);
  // the vertex stage's energy (vEsSurf.y) and the per-pixel shore frame at
  // the rest xz (diag15 V4: a vertex direction, interpolated, kinked the
  // phase at every triangle edge and the thresholds cut pale wedges)
  esFoamE += esSurfFoam(esShoreD + bn * 4.0, vEsSurf.x, uWaveTime, vEsSurf.y,
    esAlongPhase(vEsRestXZ, esShoreDirR, uWaveTime)) * 0.85;
}
// 3. whitecaps on genuinely exposed water, never in the far shimmer zone
// The mesh crest alone thins out with vertex LOD, so whitecaps vanish at
// distance. A screen-resolution, world-anchored fbm crest keeps the density
// PIXEL-driven; it is advected on the transport clock and scaled by wind.
// The crest per pixel: the mesh crest is one plane per triangle (vertex
// height minus vertex still level, both interpolated), so the short bands'
// own height rides on top of it (perf-diag4 V2), and the crest bands'
// per-pixel height swap (esCrestD, diag11 W1 / diag12 Q2). The along-flow
// undulation (1.6 m wavelength, under the grid) is swapped the same way:
// interpolated per vertex it aliased into one tilted plane per triangle, and
// the whitecap threshold cut it into straight-edged pale wedges that changed
// every frame on rivers (perf10 D11).
float esCrest = (vEsWorldPos.y / max(uVerticalScale, 1e-3)) - vEsStill + esWaveF.z + esCrestD
              - vEsFlowH + esFlowHPx;
float esCrestMesh = esCrest;   // the real crest, for the backlit scatter
esDbgCrest = esCrest;
float esCrestFade = 1.0 - smoothstep(1200.0, 2400.0, esDist);
// whitecap density from the wind (waves.ts whitecapCoverage: 2 % of the sea
// at the swell floor, 6 % at 12 m/s, 12 % in a squall): the crest noise
// thresholds at the matching quantile (uCapThreshold, TS twin
// whitecapThreshold), and the pattern rides downwind at the peak band's
// group speed (audit root cause 5)
{
  vec2 esCP = (vEsWorldPos.xz - uWindDir * ${whitecapDriftMS().toFixed(2)} * uTransportTime) * 0.085;
  float esCn = esFbm(esCP, 3) * 0.5 + esFbm(esCP * 2.7 + 11.0, 2) * 0.5;
  esCrest = max(esCrest, 0.16 + smoothstep(uCapThreshold - 0.01, uCapThreshold + 0.02, esCn) * 0.3);
}
esFoamE += smoothstep(0.16, 0.34, esCrest) * clamp(esExpo * 4.0, 0.0, 1.0) * 0.8 * esCrestFade;
// 4. rapids churn near banks + aerated cascades wherever water descends
// (coverage CAPPED — a saturated threshold was the round-6 solid crust)
esFoamE += smoothstep(0.3, 1.1, esSpeed) * (1.0 - smoothstep(4.0, 30.0, esShoreD)) * 0.5;
esFoamE += esCascade * 0.55;
// 5. player/crate/splash rings + sim crests + plunge pools
esFoamE += esContactFoam(vEsWorldPos.xz) + esRipCrest * 0.5;
// a flowing river churns around a wader the same way a chute does (the strip
// variant carries the twin of this line)
if (esSpeed > ${RUSH.speedFromMS.toFixed(2)})
  esFoamE += esContactRush(vEsWorldPos.xz, vEsFlow.xy / max(esSpeed, 1e-3), esSpeed);
esFoamE += esPlungeFoam(vEsWorldPos.xz, vEsFlow.xy);
// 5b. shoreline depth-range froth (study §4 (2)): a wider, lower,
// noise-broken band over ~1.8 m of vertical depth behind the contact line
esFoamE += esShoreFroth(esTv, esFbm(vEsWorldPos.xz * 0.9 + 7.0, 2), vEsSurf.x) * esShoreNear;
// cap below saturation so the threshold texture ALWAYS breaks the foam up
// (max coverage ~0.65, research Q3) ...
esFoamE = min(esFoamE, 0.85);
// 5c. ...then the PERSISTENT foam energy field (study §3.1 (1)): the
// instantaneous terms above are the floor, the field carries memory — crest
// foam trailing off the back of a wave, surf lingering on the sand, plunge
// and contact foam drifting downstream on the compiled flow. Same dissolve
// below, so the field's edge is seamless.
esFoamE = max(esFoamE, min(esFoamFieldAt(vEsWorldPos.xz), 0.95));
// murky water barely foams white
esFoamE *= (1.0 - 0.75 * esMurk);
// foam advection: DUAL-PHASE, like the normals. Scroll distance per cycle
// = speed x cycle (Valve's one true speed knob). Never any velocity × absolute
// time: an OSCILLATING velocity × t swings hundreds of metres per frame
// (round-5 barcode); a SPATIALLY-VARYING velocity × t shears neighbouring
// pixels apart until the noise shreds into stripes (round-6 barcode).
// The mask is ONE foam family: the vanilla foam tile when bound (ES_FOAM_TEX,
// remapped onto the fbm moments — FOAM_TEX), the procedural fbm otherwise.
float esFTex;
{
  vec2 esFP1 = vEsWorldPos.xz - esDrift * esPh1 * esCycle;
  vec2 esFP2 = vEsWorldPos.xz - esDrift * esPh2 * esCycle;
  esFTex = mix(esFoamMask(esFP1), esFoamMask(esFP2), esPhB);
}
// flowing water reads as CURRENT: foam stretches into streaks along the
// flow and slides downstream (owner round 6 — rivers must look like rivers);
// gated at the flow-wave floor, not 0.3 m/s (decision 0047 root cause 7)
if (esFlowing) {
  // Never rotate the absolute world position by a spatially varying flow
  // direction: far from origin, tiny bend-angle changes become huge texture
  // jumps/barcodes. Stretch a world-anchored pattern using LOCAL offsets.
  float esAdv = min(esSpeed, 2.5) * esCycle;   // metres per cycle — bounded
  vec2 esSP1 = vEsWorldPos.xz - esFDirN * esAdv * esPh1;
  vec2 esSP2 = vEsWorldPos.xz - esFDirN * esAdv * esPh2;
  vec2 esSmear = esFDirN * 1.55;
  float esStreak1 = (esFoamMask2(esSP1 - esSmear) + esFoamMask2(esSP1) + esFoamMask2(esSP1 + esSmear)) / 3.0;
  float esStreak2 = (esFoamMask2(esSP2 - esSmear) + esFoamMask2(esSP2) + esFoamMask2(esSP2 + esSmear)) / 3.0;
  float esStreak = mix(esStreak1, esStreak2, esPhB);
  esFTex = mix(esFTex, esStreak, smoothstep(0.2, 1.0, esSpeed));
  esFoamE += smoothstep(0.6, 1.6, esSpeed) * 0.3;
}
float esFThr = 1.0 - esFoamE;
float esFoam = smoothstep(esFThr - 0.18, esFThr + 0.26, esFTex)
             * smoothstep(0.0, 0.10, esFoamE);
// breakup jitter on the TRANSPORT clock (the wave clock folds; a sin of it
// would pop at the fold unless snapped — real time needs no snapping)
esFoam = clamp(esFoam, 0.0, 1.0)
       * (0.5 + 0.5 * esFbm(vEsWorldPos.xz * 1.9 + vec2(sin(uTransportTime * 0.17), cos(uTransportTime * 0.15)) * 0.8, 3))
       * (0.25 + 0.75 * esFarFade) * 0.9;
// 6. sparse drifting foam flecks on flowing river water (decision 0047 item
// 6): a few percent coverage, dual-phase advected 1:1 with the current so a
// slow lowland river visibly moves. TS twin of the threshold: riverFleck().
if (esFlowing && vEsKlass.w > 2.5 && vEsKlass.w < 3.5) {
  vec2 esFk1 = vEsWorldPos.xz - esDrift * esPh1 * esCycle;
  vec2 esFk2 = vEsWorldPos.xz - esDrift * esPh2 * esCycle;
  float esFk = mix(esFoamFleck(esFk1), esFoamFleck(esFk2), esPhB);
#ifdef ES_FOAM_TEX
  float esFleck = smoothstep(${FOAM_TEX.fleck.lo.toFixed(3)}, ${FOAM_TEX.fleck.hi.toFixed(3)}, esFk) * (0.25 + 0.75 * esFarFade);
#else
  float esFleck = smoothstep(${FLECK.lo.toFixed(3)}, ${FLECK.hi.toFixed(3)}, esFk) * (0.25 + 0.75 * esFarFade);
#endif
  esFoam = max(esFoam, esFleck * 0.7 * (1.0 - 0.6 * esMurk));
}
float esFoamShade = 0.72 + 0.36 * esFoamMask(vEsWorldPos.xz * 6.7);
// foam is off-white ALBEDO + high roughness, never near-1.0 white — full
// white kills all lighting shape and reads as crust (research Q3)
diffuseColor.rgb = mix(esAlb * (1.0 - esT), vec3(0.80, 0.84, 0.86) * esFoamShade, esFoam);
// distance roughness LOD kills specular fireflies (round 2, defect 1)
roughnessFactor = mix(
  clamp(0.05 + esTurb * 0.28 + min(esSpeed, 1.0) * 0.08 + (1.0 - esFarFade) * 0.24, 0.0, 0.85),
  0.92, esFoam);
#include <emissivemap_fragment>`
          : /* glsl */ `
float esTurb = clamp(esTurbPx + esTanPx + esColPx.y * 0.7, 0.0, 1.0);
vec3 esAlbU = mix(vec3(0.05, 0.14, 0.15), vec3(0.06, 0.08, 0.03), esTurb);
esAlbU = mix(esAlbU, vec3(0.16, 0.30, 0.10), esColPx.x * 0.55);       // algae green (16f)
diffuseColor.rgb = esAlbU;
roughnessFactor = 0.4;
float esFoam = 0.0;
#include <emissivemap_fragment>`,
      )
      .replace(
        "#include <opaque_fragment>",
        variant === "above" && strip
          ? /* glsl */ `
// whitewater: env/sun specular as lit, transmission (1 - aeration) of the
// scene straight through (no refraction, no SSR), dissolved across the bank
// overlap by aSide only — no shoreline terms on a ribbon.
vec3 esView = normalize(cameraPosition - vEsWorldPos);
float esFresT = 0.02 + 0.98 * pow(1.0 - max(dot(esNW, esView), 0.0), 5.0);
vec3 esTransmit = texture2D(uSceneColor, esScreenUV).rgb * esT * (1.0 - esFresT);
outgoingLight = outgoingLight + esTransmit;
esDbgFres = esFresT; esDbgSky = reflectedLight.indirectSpecular; esDbgRefr = esTransmit; esDbgReflW = esFresT * esBank;
outgoingLight = mix(texture2D(uSceneColor, esScreenUV).rgb, outgoingLight, esBank);
#include <opaque_fragment>`
          : variant === "above"
          ? /* glsl */ `
vec3 esView = normalize(cameraPosition - vEsWorldPos);
vec3 esSpecEnv = reflectedLight.indirectSpecular;
#ifdef ES_SSR
// Distance LOD (16f round 3): the 18-step screen-space march ran to 1.2 km,
// where a reflection is a pixel or two the environment map already gives.
// Past ${SSR_FADE_END_M} m the sky reflection alone carries the far field.
if (esDist < ${SSR_FADE_END_M.toFixed(1)}) {
  vec4 esS = esSsr(vEsWorldPos, reflect(-esView, esNW));
  float esFres = 0.02 + 0.98 * pow(1.0 - max(dot(esNW, esView), 0.0), 5.0);
  float esSsrFade = 1.0 - smoothstep(${SSR_FADE_START_M.toFixed(1)}, ${SSR_FADE_END_M.toFixed(1)}, esDist);
  esDbgSsrW = clamp(esS.a, 0.0, 1.0) * uSsrStrength * esSsrFade * (1.0 - esFoam);
  esSpecEnv = mix(esSpecEnv, esS.rgb * esFres, esDbgSsrW);
}
#endif
float esFresT = 0.02 + 0.98 * pow(1.0 - max(dot(esNW, esView), 0.0), 5.0);
vec3 esTransmit = texture2D(uSceneColor, esRUV).rgb * esT * (1.0 - esFoam) * (1.0 - esFresT);
outgoingLight = outgoingLight - reflectedLight.indirectSpecular + esSpecEnv + esTransmit;
// soft contact: the surface fades in over EDGE_FADE_M of VERTICAL thickness
// where the terrain cuts it (decision 0047) — no raster, no ripple texel, no
// view-angle dependence in the waterline; foam may stand on the line itself
float esEdgeSoft = smoothstep(0.0, ${EDGE_FADE_M.toFixed(2)}, esTv);
float esCover = max(esEdgeSoft, esFoam) * esGuard;
// ---- Water Pro transfers (study §3.1 (4), (5), (7), (8)) ---------------
// sparkle: a dedicated sun glint with its own 8-500 m window, added AFTER
// the specular and deliberately outside the roughness distance-LOD above
float esSpark = esSparkle(esNW, esView, uWaterSunDir, esDist, esExpo) * esFresT;
// crest scatter: backlit crests glow with the water's transmission tint,
// gated on wave exposure (still marsh water never glows) and sun elevation
vec3 esSssTint = mix(vec3(0.10, 0.45, 0.40), vec3(0.14, 0.11, 0.04), esMurk);
float esSssW = esCrestSss(esView, uWaterSunDir, esCrestMesh, esExpo);
outgoingLight += uWaterSunLight * (esSpark + esSssW * esSssTint) * (1.0 - esFoam);
esDbgFres = esFresT; esDbgSky = esSpecEnv; esDbgRefr = esTransmit; esDbgSpec = esSpark;
esDbgReflW = esFresT * esCover;   // the reflected share of the final mix (env + SSR ride it)
// meniscus rim across the waterline band at the camera
outgoingLight += uWaterAmbient * 10.0 * esMeniscusRim(esMen);
outgoingLight = mix(texture2D(uSceneColor, esScreenUV).rgb, outgoingLight, esCover);
// horizon: the far sea converges on the sky it reflects over 1.5-3.5 km, so
// the water/sky join has no seam. Before the aerial term (tonemapping_fragment)
// — the fog then acts once on a colour that already agrees with the sky.
#ifdef USE_ENVMAP
{
  float esHz = esHorizonBlend(esDist);
  if (esHz > 0.0) {
    vec3 esSkyDir = reflect(-esView, vec3(0.0, 1.0, 0.0));
    esSkyDir.y = max(esSkyDir.y, 0.02);
    vec3 esSkyCol = textureCubeUV(envMap, normalize(esSkyDir), 0.4).rgb * envMapIntensity;
    outgoingLight = mix(outgoingLight, esSkyCol, esHz);
  }
}
#endif
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
  float esShimmer = smoothstep(0.5, 0.92, esFbm(vEsWorldPos.xz * 0.5 + vec2(0.2) * uTransportTime, 4));
  vec3 esCol = (dot(esRefr, esRefr) < 1e-4)
    ? esGlow * 1.6
    : mix(esGlow * 1.4, esSky, 1.0 - esFresU);
  esCol += esGlow * esShimmer * 0.8;
  // meniscus rim from below: the same band, the same highlight
  esCol += uWaterAmbient * 10.0 * esMeniscusRim(esMen);
  outgoingLight = esCol;
  esDbgFres = esFresU; esDbgSky = esSky; esDbgRefr = esGlow; esDbgReflW = esFresU;
}
#include <opaque_fragment>`,
      )
      .replace("#include <opaque_fragment>", "#include <opaque_fragment>\nesDbgMix = gl_FragColor.rgb;")
      .replace("#include <tonemapping_fragment>", "esDbgPre = gl_FragColor.rgb;\n#include <tonemapping_fragment>")
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>\n${WATER_DEBUG_GLSL}`);
  };

  applyAerial(material);
  // the aerial term lands before tonemapping (sky/aerial.ts); this capture
  // follows it, so wdbg=9 reads the aerial's change to the colour
  const aerialHook = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    aerialHook.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <tonemapping_fragment>", "esDbgPost = gl_FragColor.rgb;\n#include <tonemapping_fragment>");
  };
  material.customProgramCacheKey = () => `es-water-${variant}-${tier.name}-${mode}${foamTex ? "-ftex" : ""}`;
  return material;
}
