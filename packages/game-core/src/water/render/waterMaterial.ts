import * as THREE from "three";
import { WHITEWATER_GLSL, STREAK_LAYERS } from "./whitewaterStreaks";
import { STRIP_BANK_FADE_START } from "./ChannelStrips";
import type { CSM } from "three/examples/jsm/csm/CSM.js";
import { FLOW_WAVE_MIN_SPEED_MS, WAVES, flowWaveGlsl, gerstnerGlsl, surfGlsl } from "@elder-souls/game-core/water/index";
import { OPEN_SEA_DEPTH_M, buriedThresholdM } from "../waterData";

import type { WaterAssets } from "./types";
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
  rtScale: number;
  samples: number;
}

export const WATER_TIERS: Record<"low" | "high", WaterTier> = {
  // samples stay 0: a multisampled half-float RT costs serious VRAM/bandwidth
  // (owner round 1 perf); water/overlay edges still get the canvas MSAA.
  high: { name: "high", ssr: true, godRays: true, ripples: true, waveBands: WAVES.bands, rtScale: 0.9, samples: 0 },
  low: { name: "low", ssr: false, godRays: false, ripples: true, waveBands: WAVES.lowTierBands, rtScale: 0.75, samples: 0 },
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
/** Nearest cascade plunge points fed to the field shader for pool foam. */
export const MAX_PLUNGE_SOURCES = 16;

export interface WaterUniforms {
  uWaveTime: { value: number };
  /** Transport clock (s): current advection, unscaled by wind or preview rate. */
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
  /** Strip/fall ownership mask (0 field, 128 strip, 255 fall) + its toggle:
   * the field surface discards where a strip mesh or sheet owns the cell. */
  uOwnerTex: { value: THREE.Texture | null };
  uHasOwner: { value: number };
  uSurfExtentM: { value: number };
  /** x, z, radius (m), strength — nearest waterfall plunge pools. */
  uPlunges: { value: THREE.Vector4[] };
  uPlungeCount: { value: number };
}

export function createWaterUniforms(assets: WaterAssets): WaterUniforms {
  const m = assets.meta;
  return {
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
    uOwnerTex: { value: assets.ownerTex },
    uHasOwner: { value: assets.ownerTex ? 1 : 0 },
    uSurfExtentM: { value: m.surface.size * m.surface.metresPerPixel },
    uPlunges: { value: Array.from({ length: MAX_PLUNGE_SOURCES }, () => new THREE.Vector4()) },
    uPlungeCount: { value: 0 },
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
  uniform sampler2D uFlowTex;
  uniform sampler2D uKlassTex;
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

  // KEEP IN LOCKSTEP with waterData.decodeDepthByte(): B is SIGNED depth.
  vec2 esDecodeSurf(vec4 t){
    float w = uSurfMin + ((t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0) * uSurfSpan;
    return vec2(w, t.b * uSurfDepthSpan + uSurfDepthMin);
  }

  // Manual bilinear over the 16-bit W raster (height, signed depth).
  vec2 esSurfaceAt(vec2 wpos){
    float extent = uSurfSize * uSurfMpp;
    if (wpos.x < 0.0 || wpos.y < 0.0 || wpos.x >= extent || wpos.y >= extent) {
      return vec2(0.0, ${OPEN_SEA_DEPTH_M.toFixed(1)}); // beyond the province: open sea
    }
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
export const BURIED_GUARD = { nearM: -0.35, perMetre: 0.002, floorM: -2.0 } as const;
/** Vertical thickness (m) over which the surface fades in at the shoreline. */
export const EDGE_FADE_M = 0.15;
/** Vertical thickness (m) under which the contact-foam line draws. */
export const CONTACT_FOAM_M = 0.12;
/** A field surface is never a cliff: fragments whose still-surface metric
 * slope exceeds this are discarded (falls are sheets). */
export const FIELD_MAX_SLOPE = 1.0;
const FLOW_WAVE_MIN_GLSL = FLOW_WAVE_MIN_SPEED_MS.toFixed(2);
/** River foam flecks: fbm (2 octaves, `scale` cycles/m) thresholded between
 * lo..hi — tuned so the dual-phase mix covers ≈ 3–6 % of a river (the test
 * ports esFbm and measures it). */
export const FLECK = { scale: 1.7, lo: 0.515, hi: 0.545 } as const;

/**
 * How far the field's owner-mask hole is grown, in metres. Smaller than the
 * strip ribbon's own bank overlap (`STRIP_BANK_M` each side), so the hole can
 * never outrun the geometry that fills it.
 */
export const OWNER_DILATE_M = 1.2;

/** Dilated owner-mask test, compiled into the FIELD fragment shader. */
const OWNER_MASK_GLSL = /* glsl */ `
bool esOwnedNearby(vec2 wpos){
  float e = ${OWNER_DILATE_M.toFixed(2)};
  vec2 taps[5];
  taps[0] = wpos;
  taps[1] = wpos + vec2(e, 0.0);
  taps[2] = wpos - vec2(e, 0.0);
  taps[3] = wpos + vec2(0.0, e);
  taps[4] = wpos - vec2(0.0, e);
  for (int i = 0; i < 5; i++) {
    vec2 uv = taps[i] / max(uSurfExtentM, 1.0);
    if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))
        && texture2D(uOwnerTex, uv).r > 0.25) return true;
  }
  return false;
}
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
  uniform sampler2D uOwnerTex;
  uniform float uHasOwner;
  uniform float uSurfExtentM;
  uniform vec4 uPlunges[${MAX_PLUNGE_SOURCES}];
  uniform int uPlungeCount;
  varying vec4 vEsData;   // stillW, signed depth + lift, exposure, shoreDist
  varying vec4 vEsKlass;  // turbidity(silt), salinity, tannin, class index
  varying vec3 vEsFlow;   // flow m/s (xy) + surface drop along flow (z)
  varying vec3 vEsNormalW; // world-space wave normal
  varying vec3 vEsSurf;   // fetch exposure, shoreward dir (xz)

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

export function createWaterMaterial(
  variant: WaterVariant,
  ctx: WaterMaterialContext,
  mode: WaterSurfaceMode = "field",
): THREE.MeshPhysicalMaterial {
  const { csm, applyAerial, uniforms, tier } = ctx;
  const strip = mode === "strip";
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
attribute float aEdge;
varying float vEsSide;
varying vec4 vEsStrip;
#endif
uniform float uVerticalScale;
varying vec4 vEsData;
varying vec4 vEsKlass;
varying vec3 vEsFlow;
varying vec3 vEsNormalW;
varying vec3 vEsSurf;
${SAMPLER_GLSL}
${gerstnerGlsl(tier.waveBands)}
${surfGlsl()}
${flowWaveGlsl()}`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
vec3 esRestW = (modelMatrix * vec4(position, 1.0)).xyz;
#ifdef ES_STRIP
vEsSide = aSide;
vEsStrip = vec4(aSideM, aArc, aScroll, aEdge);
vec2 esSurf = vec2(aStill, max(aBedDepth, 0.0));
#else
vec2 esSurf = esSurfaceAt(esRestW.xz);
#endif
vec2 esDataUv = clamp(esRestW.xz / uFlowExtentM, vec2(0.0), vec2(1.0));
vec4 esKl = texture2D(uKlassTex, esDataUv);
vec4 esFl = texture2D(uFlowTex, esDataUv);
float esOutside = (esRestW.x < 0.0 || esRestW.z < 0.0
  || esRestW.x >= uFlowExtentM || esRestW.z >= uFlowExtentM) ? 1.0 : 0.0;
esKl = mix(esKl, vec4(0.0, 0.25, 1.0, 1.0), esOutside);
esFl = mix(esFl, vec4(0.5, 0.5, 0.0, 1.0), esOutside);
vec3 esSS = esShoreAt(esRestW.xz);   // shore dist, season response, tannin
#ifdef ES_STRIP
// no tide response inland on a steep reach; season rides the attribute
float esStill = esSurf.x + uLevelSeason * aSeason;
#else
float esStill = esSurf.x + uLevelTide * esTideResponse(esKl.b) + uLevelSeason * esSS.y;
#endif
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
// the waterline itself TRAVELS: asymmetric swash + shoaling shore swell,
// added BEFORE the depth proxy so the advancing tongue renders on the
// beach face instead of being discarded as buried (research doc §5).
// esSurfWind: KEEP IN LOCKSTEP with game-core surfWindScale() — storm seas
// break harder on the beach (round 3).
float esSurfWind = clamp(pow(uWindWave, 0.8), 0.6, 3.2);
float esSwellDHdd = 0.0;
#ifndef ES_STRIP
esStill += esSwash(esShore, esFetch, uWaveTime, esSurfWind);
esStill += esShoreSwell(esShore, max(esSurf.y, 0.0), esFetch, uWaveTime, esSurfWind, esSwellDHdd);
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
float esWaveAmp = esExposure * uWindWave * exp(-esCamDist * 0.0006);
EsWave esW;
if (esWaveAmp > 0.002) {
  esW = esWaveSample(esRestW.xz, esWaveAmp, uWaveTime);
} else {
  esW.disp = vec3(0.0);
  esW.normal = vec3(0.0, 1.0, 0.0);
  esW.height = 0.0;
}
// swell tilts the normal along the shoreward axis
esW.normal.xz += esShoreDir * esSwellDHdd;
esW.normal = normalize(esW.normal);
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
  esFlowH = esFlowWave(esRestW.xz, esFlowV / esFlowSp, esFlowSp, uWaveTime, esFlowN) * esFlowFade;
  // summed slopes of two small-slope height fields (CPU twin does the same)
  vec2 esSlope = esW.normal.xz / max(esW.normal.y, 1e-3) + (esFlowN.xz / max(esFlowN.y, 1e-3)) * esFlowFade;
  esW.normal = normalize(vec3(esSlope.x, 1.0, esSlope.y));
}`}
vEsSurf = vec3(esFetch, esShoreDir);
vEsData = vec4(esStill, esVDepth, esExposure, esShore);
vEsKlass = vec4(esKl.g, esKl.b, esSS.z, esKl.r * 255.0);   // turbidity, salinity, tannin, class
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
#endif
${strip ? STRIP_AERATION_GLSL + WHITEWATER_GLSL : ""}
${NOISE_GLSL}
${surfGlsl()}
${SAMPLER_GLSL}
${prelude}
${strip ? "" : OWNER_MASK_GLSL}
uniform float uVerticalScale;`,
      )
      .replace(
        "void main() {",
        /* glsl */ `void main() {
  ${strip ? "" : /* glsl */ `
  {
    // Decision 0047: the raster no longer cuts the shoreline. It only guards
    // against drawing BURIED surface (signed depth + lift well below zero,
    // relaxed with distance so far LOD triangles never open holes); the
    // visible edge is the plane meeting the terrain mesh under the hardware
    // depth test against the blit-written scene depth.
    vec2 esFS = esSurfaceAt(vEsWorldPos.xz);
    float esLift = vEsData.x - esFS.x;   // tide + season + surf at this pixel
    float esGuardDist = distance(cameraPosition, vEsWorldPos);
    if (esFS.y + esLift < max(${BURIED_GUARD.nearM.toFixed(2)} - ${BURIED_GUARD.perMetre.toFixed(3)} * esGuardDist,
                              ${BURIED_GUARD.floorM.toFixed(1)})) discard;
    // A field surface is never a cliff: where the STILL surface's metric
    // slope exceeds 1.0 the raster is bridging a drop the compiler owns as a
    // sheet (or, on v1 data, a cliff foot carrying the lip's level). Not
    // multiplied by uVerticalScale — the exaggeration is display only.
    vec2 esDW = vec2(dFdx(vEsData.x), dFdy(vEsData.x));
    vec2 esDP = vec2(length(vec2(dFdx(vEsWorldPos.x), dFdx(vEsWorldPos.z))),
                     length(vec2(dFdy(vEsWorldPos.x), dFdy(vEsWorldPos.z))));
    if (length(esDW / max(esDP, vec2(1e-4))) > ${FIELD_MAX_SLOPE.toFixed(1)}) discard;
    // The field never shows under a compiled strip or waterfall sheet: those
    // draw the same water from their own geometry (decision 0046 item 4).
    // DILATED by OWNER_DILATE_M: the mask is a 3.66 m raster and a chute is
    // ~3 m wide, so a nearest-texel test left a live field fringe either side.
    if (uHasOwner > 0.5 && esOwnedNearby(vEsWorldPos.xz)) discard;
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
vec3 esNBase = normalize(vEsNormalW);
float esSpeed = length(vEsFlow.xy);
// cascades: white churning descent where the surface visibly drops
float esCascade = smoothstep(0.04, 0.30, vEsFlow.z);
float esDist = distance(cameraPosition, vEsWorldPos);
// distance LOD: detail normals AND their strength fade out far away —
// unfiltered procedural ripple at 1 px = the "TV static" (round 2, defect 1)
float esDetFade = exp(-esDist * 0.010);
float esFarFade = exp(-esDist * 0.0025);
float esDetStrength = (0.10 + 0.10 * vEsData.z + 0.05 * min(esSpeed, 1.0))
                    * (0.2 + 0.8 * esFarFade) * (1.0 + 2.5 * esCascade);
// flow advection (Water2 dual-phase); still water gets a gentle wobble, not
// a stream (round 2: 'flowing' foam on static pools)
bool esFlowing = esSpeed > ${FLOW_WAVE_MIN_GLSL};
vec2 esDrift = esSpeed > 0.05
  ? vEsFlow.xy
  : vec2(sin(uTransportTime * 0.13), cos(uTransportTime * 0.11)) * 0.03;
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
    esGF = esDetailGrad(vEsWorldPos.xz * 2.3 + 17.0, vec2(0.11, 0.07) * uWaveTime) * esDetFade * 0.5;
  }
}
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
        variant === "above" && strip
          ? /* glsl */ `
// ---- whitewater strip (decision 0047 item 4) ---------------------------
float esSal = vEsKlass.y;
float esTan = vEsKlass.z;
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
float esTurb = vEsKlass.x;   // suspended silt — "whitewater" opacity
float esSal = vEsKlass.y;
float esTan = vEsKlass.z;    // dissolved tannin — "blackwater" tea
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
// 1. thin contact line exactly at the waterline (vertical thickness under
// CONTACT_FOAM_M, noise-broken so it never prints a grid) — fetch-boosted so
// the active surf edge always carries a bright lip
float esFoamE;
{
  float esCn0 = esFbm(vEsWorldPos.xz * 1.3 + 3.0, 2);
  esFoamE = (1.0 - smoothstep(0.0, ${CONTACT_FOAM_M.toFixed(2)}, esTv + (esCn0 - 0.45) * 0.10))
          * (0.18 + 0.5 * clamp(max(esExpo * 2.0, vEsSurf.x), 0.0, 1.0));
}
// 2. surf: bore foam riding each arriving crest + backwash remnants —
// same closed forms as the swell/swash geometry, so foam and waterline
// move together; per-pixel phase jitter breaks the parallel-band look
{
  float bn = esFbm(vEsWorldPos.xz * 0.16, 3);
  float esSurfWindF = clamp(pow(uWindWave, 0.8), 0.6, 3.2);
  esFoamE += esSurfFoam(esShoreD + bn * 4.0, vEsSurf.x, uWaveTime, esSurfWindF) * 0.85;
}
// 3. whitecaps on genuinely exposed water, never in the far shimmer zone
// The mesh crest alone thins out with vertex LOD, so whitecaps vanish at
// distance. A screen-resolution, world-anchored fbm crest keeps the density
// PIXEL-driven; it is advected on the transport clock and scaled by wind.
float esCrest = (vEsWorldPos.y / max(uVerticalScale, 1e-3)) - vEsData.x;
float esCrestFade = 1.0 - smoothstep(1200.0, 2400.0, esDist);
{
  vec2 esCP = vEsWorldPos.xz * 0.085 - esDrift * uTransportTime * 0.05;
  float esCn = esFbm(esCP, 3) * 0.5 + esFbm(esCP * 2.7 + 11.0, 2) * 0.5;
  esCrest = max(esCrest, (esCn - 0.62) * 1.6 * clamp(uWindWave, 0.0, 2.0));
}
esFoamE += smoothstep(0.16, 0.34, esCrest) * esExpo * 0.8 * esCrestFade;
// 4. rapids churn near banks + aerated cascades wherever water descends
// (coverage CAPPED — a saturated threshold was the round-6 solid crust)
esFoamE += smoothstep(0.3, 1.1, esSpeed) * (1.0 - smoothstep(4.0, 30.0, esShoreD)) * 0.5;
esFoamE += esCascade * 0.55;
// 5. player/crate/splash rings + sim crests + plunge pools
esFoamE += esContactFoam(vEsWorldPos.xz) + esRipCrest * 0.5;
esFoamE += esPlungeFoam(vEsWorldPos.xz, vEsFlow.xy);
// murky water barely foams white; cap below saturation so the threshold
// texture ALWAYS breaks the foam up (max coverage ~0.65, research Q3)
esFoamE = min(esFoamE, 0.85) * (1.0 - 0.75 * esMurk);
// foam advection: DUAL-PHASE, like the normals. Scroll distance per cycle
// = speed x cycle (Valve's one true speed knob). Never any velocity × absolute
// time: an OSCILLATING velocity × t swings hundreds of metres per frame
// (round-5 barcode); a SPATIALLY-VARYING velocity × t shears neighbouring
// pixels apart until the noise shreds into stripes (round-6 barcode).
float esFTex;
{
  vec2 esFP1 = (vEsWorldPos.xz - esDrift * esPh1 * esCycle) * 0.55;
  vec2 esFP2 = (vEsWorldPos.xz - esDrift * esPh2 * esCycle) * 0.55;
  esFTex = mix(esFbm(esFP1, 3), esFbm(esFP2, 3), esPhB);
}
// flowing water reads as CURRENT: foam stretches into streaks along the
// flow and slides downstream (owner round 6 — rivers must look like rivers);
// gated at the flow-wave floor, not 0.3 m/s (decision 0047 root cause 7)
if (esFlowing) {
  // Never rotate the absolute world position by a spatially varying flow
  // direction: far from origin, tiny bend-angle changes become huge texture
  // jumps/barcodes. Stretch a world-anchored pattern using LOCAL offsets.
  float esAdv = min(esSpeed, 2.5) * esCycle;   // metres per cycle — bounded
  vec2 esSP1 = (vEsWorldPos.xz - esFDirN * esAdv * esPh1) * 0.55;
  vec2 esSP2 = (vEsWorldPos.xz - esFDirN * esAdv * esPh2) * 0.55;
  vec2 esSmear = esFDirN * 0.85;
  float esStreak1 = (esFbm(esSP1 - esSmear, 2) + esFbm(esSP1, 2) + esFbm(esSP1 + esSmear, 2)) / 3.0;
  float esStreak2 = (esFbm(esSP2 - esSmear, 2) + esFbm(esSP2, 2) + esFbm(esSP2 + esSmear, 2)) / 3.0;
  float esStreak = mix(esStreak1, esStreak2, esPhB);
  esFTex = mix(esFTex, esStreak, smoothstep(0.2, 1.0, esSpeed));
  esFoamE += smoothstep(0.6, 1.6, esSpeed) * 0.3;
}
float esFThr = 1.0 - esFoamE;
float esFoam = smoothstep(esFThr - 0.18, esFThr + 0.26, esFTex)
             * smoothstep(0.0, 0.10, esFoamE);
esFoam = clamp(esFoam, 0.0, 1.0)
       * (0.5 + 0.5 * esFbm(vEsWorldPos.xz * 1.9 + vec2(sin(uWaveTime * 0.17), cos(uWaveTime * 0.15)) * 0.8, 3))
       * (0.25 + 0.75 * esFarFade) * 0.9;
// 6. sparse drifting foam flecks on flowing river water (decision 0047 item
// 6): a few percent coverage, dual-phase advected 1:1 with the current so a
// slow lowland river visibly moves. TS twin of the threshold: riverFleck().
if (esFlowing && vEsKlass.w > 2.5 && vEsKlass.w < 3.5) {
  vec2 esFk1 = (vEsWorldPos.xz - esDrift * esPh1 * esCycle) * ${FLECK.scale.toFixed(2)} + 5.0;
  vec2 esFk2 = (vEsWorldPos.xz - esDrift * esPh2 * esCycle) * ${FLECK.scale.toFixed(2)} + 5.0;
  float esFk = mix(esFbm(esFk1, 2), esFbm(esFk2, 2), esPhB);
  float esFleck = smoothstep(${FLECK.lo.toFixed(3)}, ${FLECK.hi.toFixed(3)}, esFk) * (0.25 + 0.75 * esFarFade);
  esFoam = max(esFoam, esFleck * 0.7 * (1.0 - 0.6 * esMurk));
}
float esFoamShade = 0.72 + 0.36 * esFbm(vEsWorldPos.xz * 3.7, 3);
// foam is off-white ALBEDO + high roughness, never near-1.0 white — full
// white kills all lighting shape and reads as crust (research Q3)
diffuseColor.rgb = mix(esAlb * (1.0 - esT), vec3(0.80, 0.84, 0.86) * esFoamShade, esFoam);
// distance roughness LOD kills specular fireflies (round 2, defect 1)
roughnessFactor = mix(
  clamp(0.05 + esTurb * 0.28 + min(esSpeed, 1.0) * 0.08 + (1.0 - esFarFade) * 0.24, 0.0, 0.85),
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
        variant === "above" && strip
          ? /* glsl */ `
// whitewater: env/sun specular as lit, transmission (1 - aeration) of the
// scene straight through (no refraction, no SSR), dissolved across the bank
// overlap by aSide only — no shoreline terms on a ribbon.
vec3 esView = normalize(cameraPosition - vEsWorldPos);
float esFresT = 0.02 + 0.98 * pow(1.0 - max(dot(esNW, esView), 0.0), 5.0);
vec3 esTransmit = texture2D(uSceneColor, esScreenUV).rgb * esT * (1.0 - esFresT);
outgoingLight = outgoingLight + esTransmit;
outgoingLight = mix(texture2D(uSceneColor, esScreenUV).rgb, outgoingLight, esBank);
#include <opaque_fragment>`
          : variant === "above"
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
// soft contact: the surface fades in over EDGE_FADE_M of VERTICAL thickness
// where the terrain cuts it (decision 0047) — no raster, no ripple texel, no
// view-angle dependence in the waterline; foam may stand on the line itself
float esEdgeSoft = smoothstep(0.0, ${EDGE_FADE_M.toFixed(2)}, esTv);
float esCover = max(esEdgeSoft, esFoam);
outgoingLight = mix(texture2D(uSceneColor, esScreenUV).rgb, outgoingLight, esCover);
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
  material.customProgramCacheKey = () => `es-water-${variant}-${tier.name}-${mode}`;
  return material;
}
