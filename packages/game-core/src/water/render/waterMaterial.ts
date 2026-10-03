import * as THREE from "three";
import { MeshPhysicalNodeMaterial, PhysicalLightingModel } from "three/webgpu";
import type { TslNode } from "../../render/nodes/materialNodes";
import { createDepthPlaceholder, eyeDepthAtUvNode } from "../../render/nodes/depthNodes";
import {
  STREAK_LAYERS, STREAK_BREATHE_AMPLITUDE, STREAK_BREATHE_PERIOD_S, STREAK_U_DRIFT_UVS, STREAK_WOBBLE_AMPLITUDE,
  STREAK_WOBBLE_FREQ,
} from "./whitewaterStreaks";
import { STRIP_BANK_FADE_START } from "./ChannelStrips";
import { FLOW_WAVE_MIN_SPEED_MS, SEA, WAVES, whitecapThreshold, whitecapDriftMS } from "@elder-souls/game-core/water/index";
import { buriedThresholdM } from "../waterData";

import type { WaterAssets } from "./types";
import { RIPPLE_PATCH_M } from "./RippleSim";
import { createFoamFieldUniforms, esFoamFieldAt, type FoamFieldUniforms } from "./FoamField";
import { esRainRings } from "./rainRings";
import { esCrestSss, esSparkle } from "./sparkleSss";
import { esHorizonBlend } from "./horizonBlend";
import { esMeniscusBand, esMeniscusNormal, esMeniscusRim } from "./meniscus";
import { esShoreFroth } from "./shoreFroth";
import {
  esAlongPhase, esDetailGrad, esFbm, esFetchAt, esFetchExp, esFlowWave, esHash21, esOutside, esSeaRms,
  esShoreAt, esShoreSwell, esStandingRatio, esSurfEnergy, esSurfFoam, esSwash, esTideResponse, esWaveExposure,
  esWaveCrestH, esWaveFrag, esWaveSampleEx, esColourAt, makeSurfaceAt, placeholderTexture, sel,
} from "./waterNodes";
import * as TSLNS from "three/tsl";
import { sharedUniform } from "../../render/nodes/sharedUniform";
// TSL typings are too deep for tsc to check usefully (0107 §1): the graph is typed as TslNode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  Break, Fn, If, Loop, abs, all, attribute, cameraFar, cameraNear, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, clamp, cos, distance, dot, exp, float, floor, fract, getScreenPosition, int, ivec2, length, max, min, mix, modelWorldMatrix, normalize, pmremTexture, positionGeometry, positionWorld, pow, reflect, refract, screenUV, sin, smoothstep, texture, uniformArray, varying, vec2, vec3, vec4,
} = TSLNS as any;

/* eslint-disable @typescript-eslint/no-explicit-any */
const n = (v: TslNode): any => v;
/** The GLSL baked these constants with toFixed(d); keep the same rounding. */
const fx = (v: number, d: number): number => Number(v.toFixed(d));

/**
 * The Phase 8b water material (decision 0025, reworked in owner round 2), a
 * TSL node material since decision 0107: a `MeshPhysicalNodeMaterial` whose
 * lighting model inherits the CSM sun/moon shadows + GGX glints, PMREM sky
 * reflections and the scene fog node (aerial haze), exposure-correct. The
 * graph adds:
 *
 * - vertex (`positionNode`): still-water height from the compiled W raster
 *   (+ tide + season + shore swash), Gerstner displacement scaled by baked
 *   exposure — the same wave/swash tables the CPU query uses (game-core/water);
 * - fragment: flow-advected ripples + the local interactive ripple sim
 *   (`normalNode`), Beer–Lambert refraction, per-pixel water colour and the
 *   foam system (`colorNode` / `roughnessNode`), the buried/slope/owner guard
 *   (`maskNode`), and the composite (SSR, transmission, sparkle, crest
 *   scatter, meniscus rim, soft terrain contact, horizon blend) in the
 *   lighting model's `finish`, i.e. on the lit colour BEFORE fog and tone
 *   mapping, exactly where the GLSL patched `opaque_fragment`.
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

/** Screen-space reflections march only this near (metres): beyond it the
 * environment map's sky reflection is indistinguishable at the pixel.
 * 1.2 km → 420 m (16f round 3) → 260 m (round 5, owner: bring it in a
 * little further; the march is per water pixel, so this is frame time). */
export const SSR_FADE_START_M = 160;
export const SSR_FADE_END_M = 260;
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

/** A TSL uniform or texture node; systems write `.value` exactly as they wrote the old `{ value }`. */
export type WaterUniformNode<T> = TslNode & { value: T };

export interface WaterUniforms extends FoamFieldUniforms {
  uWaveTime: WaterUniformNode<number>;
  /** Transport clock (s): current advection, unscaled by wind or preview rate. */
  uTransportTime: WaterUniformNode<number>;
  /** Weather wind → wave-energy scale (game-core setWindWaveScale twin). */
  uWindWave: WaterUniformNode<number>;
  /** The weather's 10 m wind: speed (m/s) sets the sea's rms height with the
   * compiled fetch; the unit direction drifts the still-water detail and the
   * whitecap pattern (audit root causes 1, 2, 5). */
  uWindMS: WaterUniformNode<number>;
  uWindDir: WaterUniformNode<THREE.Vector2>;
  /** Crest-noise threshold above which a pixel whitecaps (`whitecapThreshold`). */
  uCapThreshold: WaterUniformNode<number>;
  /** Open-water fetch cap the flow raster's B is encoded against (m). */
  uFetchMax: WaterUniformNode<number>;
  uLevelTide: WaterUniformNode<number>;
  uLevelSeason: WaterUniformNode<number>;
  uVerticalScale: WaterUniformNode<number>;
  /** Scene colour / depth behind the water (texture nodes: set `.value`). */
  uSceneColor: WaterUniformNode<THREE.Texture>;
  uSceneDepth: WaterUniformNode<THREE.Texture>;
  /** Kept for writers; the graph reads the camera's own near/far/projection. */
  uCamNear: WaterUniformNode<number>;
  uCamFar: WaterUniformNode<number>;
  uResolution: WaterUniformNode<THREE.Vector2>;
  uProjMatrix: WaterUniformNode<THREE.Matrix4>;
  uSurfTex: WaterUniformNode<THREE.Texture>;
  uSurfMin: WaterUniformNode<number>;
  uSurfSpan: WaterUniformNode<number>;
  uSurfSize: WaterUniformNode<number>;
  uSurfMpp: WaterUniformNode<number>;
  uSurfShoreMax: WaterUniformNode<number>;
  /** Signed-depth decode of the surface B channel: depth = B·span + min. */
  uSurfDepthMin: WaterUniformNode<number>;
  uSurfDepthSpan: WaterUniformNode<number>;
  /** Texels at or below this signed depth are buried (never level-weighted). */
  uSurfBuried: WaterUniformNode<number>;
  uSurfShore: WaterUniformNode<THREE.Texture>;
  /** 16f colour constituents: algae rides `uSurfShore.a`, dark rides `uKlassTex.a`. */
  uColourOn: WaterUniformNode<number>;
  uFlowTex: WaterUniformNode<THREE.Texture>;
  uKlassTex: WaterUniformNode<THREE.Texture>;
  uFlowExtentM: WaterUniformNode<number>;
  uFlowMax: WaterUniformNode<number>;
  /** 16d (0067): beyond the province the water is the open sea at y = 0 over the apron's ground. */
  uHasApron: WaterUniformNode<number>;
  /** First row of `uSurfTex` that holds the apron tile. */
  uApronRow0: WaterUniformNode<number>;
  uApronMin: WaterUniformNode<number>;
  uApronSpan: WaterUniformNode<number>;
  uApronOrigin: WaterUniformNode<THREE.Vector2>;
  uApronMpp: WaterUniformNode<number>;
  uApronSize: WaterUniformNode<THREE.Vector2>;
  /** Class index / turbidity / salinity of the coast, for the sea beyond. */
  uApronCoast: WaterUniformNode<THREE.Vector3>;
  uSsrStrength: WaterUniformNode<number>;
  uRefractStrength: WaterUniformNode<number>;
  uRipple: WaterUniformNode<THREE.Texture>;
  /** patch centre x, z, patch size (m); w = strength toggle. */
  uRippleInfo: WaterUniformNode<THREE.Vector4>;
  /** Rain intensity 0..1 (round 2). */
  uRainRipple: WaterUniformNode<number>;
  /** x, z, radius, strength — churn sources. A uniform array: write `.array[i]`. */
  uBodies: TslNode & { array: THREE.Vector4[] };
  uBodyCount: WaterUniformNode<number>;
  /** Strip/fall ownership mask toggle. */
  uHasOwner: WaterUniformNode<number>;
  uSurfExtentM: WaterUniformNode<number>;
  /** x, z, radius (m), strength — nearest waterfall plunge pools. Write `.array[i]`. */
  uPlunges: TslNode & { array: THREE.Vector4[] };
  uPlungeCount: WaterUniformNode<number>;
  /** Vanilla foam tile (kit slot `foam`, alpha = coverage); the placeholder when absent. */
  uFoamTex: WaterUniformNode<THREE.Texture>;
  /** Sun direction (unit, world), sun radiance and sky ambient for the
   * sparkle, crest scatter and meniscus rim — copied from the runtime each frame. */
  uWaterSunDir: WaterUniformNode<THREE.Vector3>;
  uWaterSunLight: WaterUniformNode<THREE.Vector3>;
  uWaterAmbient: WaterUniformNode<THREE.Vector3>;
  /** Placeholders a writer restores instead of the old `value = null`. */
  placeholders: { color: THREE.Texture; depth: THREE.DepthTexture; ripple: THREE.Texture };
}

export function createWaterUniforms(assets: WaterAssets): WaterUniforms {
  const m = assets.meta;
  const placeholders = {
    color: placeholderTexture(),
    depth: createDepthPlaceholder(),
    ripple: placeholderTexture(),
  };
  const u = (v: number) => sharedUniform(v) as WaterUniformNode<number>;
  return {
    uWaveTime: u(0),
    uTransportTime: u(0),
    uWindWave: u(1),
    uWindMS: u(0),
    uWindDir: sharedUniform(new THREE.Vector2(WAVES.windDir[0], WAVES.windDir[1])) as WaterUniformNode<THREE.Vector2>,
    uCapThreshold: u(whitecapThreshold(0)),
    uFetchMax: u(m.flow.fetchMaxM ?? SEA.fetchMaxM),
    uLevelTide: u(0),
    uLevelSeason: u(0),
    uVerticalScale: u(1),
    uSceneColor: texture(placeholders.color) as WaterUniformNode<THREE.Texture>,
    uSceneDepth: texture(placeholders.depth) as WaterUniformNode<THREE.Texture>,
    uCamNear: u(0.3),
    uCamFar: u(60000),
    uResolution: sharedUniform(new THREE.Vector2(1, 1)) as WaterUniformNode<THREE.Vector2>,
    uProjMatrix: sharedUniform(new THREE.Matrix4()) as WaterUniformNode<THREE.Matrix4>,
    uSurfTex: texture(assets.surfaceTex) as WaterUniformNode<THREE.Texture>,
    uSurfMin: u(m.surface.minM),
    uSurfSpan: u(m.surface.maxM - m.surface.minM),
    uSurfSize: u(m.surface.size),
    uSurfMpp: u(m.surface.metresPerPixel),
    uSurfShoreMax: u(m.surface.shoreMaxM ?? 160),
    uSurfDepthMin: u(m.surface.depthMinM ?? 0),
    uSurfDepthSpan: u(m.surface.depthSpanM ?? 25.5),
    uSurfBuried: u(buriedThresholdM(m)),
    uSurfShore: texture(assets.shoreTex) as WaterUniformNode<THREE.Texture>,
    uColourOn: u(assets.dressing ? 1 : 0),
    uFlowTex: texture(assets.flowTex) as WaterUniformNode<THREE.Texture>,
    uKlassTex: texture(assets.klassTex) as WaterUniformNode<THREE.Texture>,
    uFlowExtentM: u(m.flow.size * m.flow.metresPerPixel),
    uFlowMax: u(m.flow.flowMax),
    uHasApron: u(assets.apron ? 1 : 0),
    uApronRow0: u(assets.apron?.atlasRow0 ?? 0),
    uApronMin: u(assets.apron?.minM ?? 0),
    uApronSpan: u(assets.apron ? assets.apron.maxM - assets.apron.minM : 1),
    uApronOrigin: sharedUniform(new THREE.Vector2(assets.apron?.ground.originM[0] ?? 0, assets.apron?.ground.originM[1] ?? 0)) as WaterUniformNode<THREE.Vector2>,
    uApronMpp: u(assets.apron?.ground.metresPerSample ?? 1),
    uApronSize: sharedUniform(new THREE.Vector2(assets.apron?.ground.nx ?? 1, assets.apron?.ground.ny ?? 1)) as WaterUniformNode<THREE.Vector2>,
    uApronCoast: sharedUniform(new THREE.Vector3(assets.apron?.coastClassIndex ?? 1, assets.apron?.coastTurbidity ?? 0, assets.apron?.coastSalinity ?? 1)) as WaterUniformNode<THREE.Vector3>,
    uSsrStrength: u(0.85),
    uRefractStrength: u(0.35),
    uRipple: texture(placeholders.ripple) as WaterUniformNode<THREE.Texture>,
    uRippleInfo: sharedUniform(new THREE.Vector4(0, 0, RIPPLE_PATCH_M, 0)) as WaterUniformNode<THREE.Vector4>,
    uRainRipple: u(0),
    uBodies: uniformArray(Array.from({ length: MAX_CONTACT_BODIES }, () => new THREE.Vector4()), "vec4") as TslNode,
    uBodyCount: u(0),
    uHasOwner: u(assets.hasOwner ? 1 : 0),
    uSurfExtentM: u(m.surface.size * m.surface.metresPerPixel),
    uPlunges: uniformArray(Array.from({ length: MAX_PLUNGE_SOURCES }, () => new THREE.Vector4()), "vec4") as TslNode,
    uPlungeCount: u(0),
    ...createFoamFieldUniforms(),
    uFoamTex: texture(assets.waterfallTextures?.foam ?? placeholderTexture()) as WaterUniformNode<THREE.Texture>,
    uWaterSunDir: sharedUniform(new THREE.Vector3(0, 1, 0)) as WaterUniformNode<THREE.Vector3>,
    uWaterSunLight: sharedUniform(new THREE.Vector3(0, 0, 0)) as WaterUniformNode<THREE.Vector3>,
    uWaterAmbient: sharedUniform(new THREE.Vector3(0, 0, 0)) as WaterUniformNode<THREE.Vector3>,
    placeholders,
  };
}

/* ------------------------------------------------------------------ *
 * Fragment helpers (the old fragment prelude), over the uniform nodes.
 * ------------------------------------------------------------------ */

/** Eye depth (m, positive) of the scene depth texture at `uv`. */
function esEyeDepth(u: WaterUniforms, uv: TslNode): TslNode {
  return eyeDepthAtUvNode(n(u.uSceneDepth), uv, cameraNear, cameraFar);
}

/** churn RINGS (annulus), textured later, capped well below solid. */
function makeContactFoam(u: WaterUniforms): (...args: TslNode[]) => TslNode {
  return Fn(([wp]: [TslNode]) => {
  const c = float(0.0).toVar();
  Loop(MAX_CONTACT_BODIES, ({ i }: { i: TslNode }) => {
    If(n(i).greaterThanEqual(int(u.uBodyCount)), () => { Break(); });
    const B = n(n(u.uBodies).element(i));
    If(B.w.greaterThanEqual(0.01), () => {
      const q = n(length(n(wp).sub(B.xy))).div(max(B.z, 0.1));
      const ring = n(smoothstep(0.3, 0.75, q)).mul(float(1.0).sub(smoothstep(0.95, 1.5, q)));
      c.addAssign(ring.mul(B.w).mul(0.6));
    });
  });
  return min(c, 0.65);
  });  // inline: it reads uniforms and a uniform array, which a layout function does not declare (r184)
}

/** Fast water piling on whatever stands in it: a bow wave on the upstream
 * face and a wake downstream (owner 2026-09-14). Visual only. */
function makeContactRush(u: WaterUniforms): (...args: TslNode[]) => TslNode {
  return Fn(([wp, dir, speed]: [TslNode, TslNode, TslNode]) => {
  const gain = smoothstep(fx(RUSH.speedFromMS, 2), fx(RUSH.speedFullMS, 2), speed);
  const c = float(0.0).toVar();
  const dr = n(dir);
  Loop(MAX_CONTACT_BODIES, ({ i }: { i: TslNode }) => {
    If(n(i).greaterThanEqual(int(u.uBodyCount)), () => { Break(); });
    const B = n(n(u.uBodies).element(i));
    If(B.w.greaterThanEqual(0.01), () => {
      const d = n(n(wp).sub(B.xy).div(max(B.z, 0.1)));
      const along = n(dot(d, dr));
      const across = abs(dot(d, vec2(dr.y.negate(), dr.x)));
      const bow = n(float(1.0).sub(smoothstep(0.8, 1.7, length(d)))).mul(float(1.0).sub(smoothstep(-0.7, 0.2, along)));
      const wake = n(smoothstep(0.0, 0.4, along)).mul(float(1.0).sub(smoothstep(0.5, 4.0, along)))
        .mul(float(1.0).sub(smoothstep(along.mul(0.35).add(0.45), along.mul(0.5).add(1.1), across)));
      c.addAssign(bow.add(wake.mul(fx(RUSH.wake, 2))).mul(B.w));
    });
  });
  // gain <= 0.001 returned 0 in the GLSL; c * gain is 0 there to within 1e-3·c
  return sel(n(gain).lessThanEqual(0.001), float(0.0), clamp(n(c).mul(gain), 0.0, 1.0));
  });  // inline: it reads uniforms and a uniform array, which a layout function does not declare (r184)
}

/** Plunge-pool foam: a churning disc plus an expanding ring per nearby cascade. */
function makePlungeFoam(u: WaterUniforms): (...args: TslNode[]) => TslNode {
  return Fn(([wp, flow]: [TslNode, TslNode]) => {
  const f = float(0.0).toVar();
  Loop(MAX_PLUNGE_SOURCES, ({ i }: { i: TslNode }) => {
    If(n(i).greaterThanEqual(int(u.uPlungeCount)), () => { Break(); });
    const P = n(n(u.uPlunges).element(i));
    If(P.w.greaterThanEqual(0.01), () => {
      const r = max(P.z, 0.5);
      const q = n(length(n(wp).sub(P.xy).sub(n(flow).mul(0.6)))).div(r);
      const disc = float(1.0).sub(smoothstep(0.35, 2.0, q));
      const ph = n(fract(n(u.uTransportTime).div(2.67).add(P.x.mul(0.013)).add(P.y.mul(0.007))));
      const e = ph.mul(ph);
      const rr = e.mul(1.15).add(0.45);
      const ring = n(float(1.0).sub(smoothstep(0.0, 0.16, abs(q.sub(rr))))).mul(float(1.0).sub(e));
      f.addAssign(P.w.mul(n(disc).add(ring.mul(0.6))));
    });
  });
  return min(f, 0.75);
  });  // inline: it reads uniforms and a uniform array, which a layout function does not declare (r184)
}

/** Tiered screen-space reflection: 18 steps, 1.12 growth. Returns vec4(rgb, confidence). */
function makeSsr(u: WaterUniforms): (...args: TslNode[]) => TslNode {
  return Fn(([ro, rd]: [TslNode, TslNode]) => {
  const result = vec4(0.0).toVar();
  const stepLen = float(2.2).toVar();
  const prevDiff = float(-1.0).toVar();
  const prevUV = vec2(0.0).toVar();
  Loop({ start: int(1), end: int(19) }, ({ i }: { i: TslNode }) => {
    const p = n(ro).add(n(rd).mul(stepLen.mul(float(i))));
    const viewP = n(cameraViewMatrix).mul(vec4(p, 1.0));
    const clip = n(cameraProjectionMatrix).mul(viewP);
    If(clip.w.lessThanEqual(0.0), () => { Break(); });
    const uv = n(getScreenPosition(viewP.xyz, cameraProjectionMatrix)).toVar();
    If(uv.x.lessThan(0.0).or(uv.x.greaterThan(1.0)).or(uv.y.lessThan(0.0)).or(uv.y.greaterThan(1.0)), () => { Break(); });
    const sceneEye = n(esEyeDepth(u, uv));
    const rayEye = viewP.z.negate();
    const diff = rayEye.sub(sceneEye).toVar();
    If(diff.greaterThan(0.0).and(diff.lessThan(8.0)).and(sceneEye.lessThan(n(cameraFar).mul(0.9))), () => {
      // the divisor is nudged off exact zero only, so sel() never multiplies an inf (clamp() below gives the same t)
      const den = diff.sub(prevDiff);
      const t = sel(prevDiff.lessThan(0.0), float(1.0), prevDiff.negate().div(sel(abs(den).lessThan(1e-12), float(1e-12), den)));
      const hitUV = n(mix(prevUV, uv, clamp(t, 0.0, 1.0)));
      const edge = n(smoothstep(0.0, 0.12, hitUV)).mul(smoothstep(0.0, 0.12, float(1.0).sub(hitUV)));
      // the hit window's far side fades instead of cutting (f33: a hit/miss
      // step at diff = 8 m drew straight-edged reflection seams)
      const conf = edge.x.mul(edge.y).mul(float(1.0).sub(float(i).div(18.0).mul(0.4)))
        .mul(float(1.0).sub(smoothstep(4.0, 8.0, diff)));
      result.assign(vec4(n(n(u.uSceneColor).sample(hitUV)).rgb, conf));
      Break();
    });
    prevDiff.assign(diff);
    prevUV.assign(uv);
    stepLen.mulAssign(1.12);
  });
  return result;
  });  // inline: it samples the scene textures (see makeSurfaceAt)
}

/** Dilated owner-mask coverage (0 = the field owns this pixel, 1 = a strip or sheet does). */
function esOwnedFrac(u: WaterUniforms, wpos: TslNode): TslNode {
  const e = fx(OWNER_DILATE_M, 2);
  const taps = [vec2(0, 0), vec2(e, 0), vec2(-e, 0), vec2(0, e), vec2(0, -e)];
  let owned: TslNode = float(0.0);
  for (const off of taps) {
    const uv = n(n(wpos).add(off).div(max(u.uSurfExtentM, 1.0)));
    const inside = all(uv.greaterThanEqual(vec2(0.0))).and(all(uv.lessThan(vec2(1.0))));
    const texel = n(n(u.uSurfTex).load(ivec2(uv.mul(u.uSurfSize))));
    owned = n(owned).add(sel(n(inside).and(texel.a.greaterThan(0.25)), float(1.0), float(0.0)));
  }
  return n(owned).div(5.0);
}

/** The foam dissolve/breakup mask: the vanilla foam tile (remapped onto the fbm's moments) or the fbm. */
function foamMasks(u: WaterUniforms, foamTex: boolean) {
  const tileM = fx(FOAM_TEX.tileM, 2);
  const texAt = (wp: TslNode) => {
    const a = n(n(u.uFoamTex).sample(n(wp).div(tileM))).a;
    return a.sub(fx(FOAM_TEX.mean, 3)).mul(fx(FOAM_TEX.fbmStd / FOAM_TEX.std, 4)).add(fx(FOAM_TEX.fbmMean, 3));
  };
  if (foamTex) {
    return {
      mask: (wp: TslNode) => texAt(wp),
      mask2: (wp: TslNode) => texAt(n(wp).mul(0.7).add(2.0)),
      fleck: (wp: TslNode) => n(n(u.uFoamTex).sample(n(wp).div(tileM))).a,
    };
  }
  return {
    mask: (wp: TslNode) => esFbm(n(wp).mul(0.55), 3),
    mask2: (wp: TslNode) => esFbm(n(wp).mul(0.55), 2),
    fleck: (wp: TslNode) => esFbm(n(wp).mul(fx(FLECK.scale, 2)).add(5.0), 2),
  };
}

/* ------------------------------------------------------------------ *
 * Steep-strip whitewater (procedural streak path of whitewaterStreaks'
 * esWhitewater; the water material never bound a streak texture).
 * ------------------------------------------------------------------ */

function esStripBank(side: TslNode, edge: TslNode): TslNode {
  return float(1.0).sub(smoothstep(fx(STRIP_BANK_FADE_START, 2), max(edge, fx(STRIP_BANK_FADE_START + 1e-3, 3)), abs(side)));
}
function esStripBlend(dropPerM: TslNode, speedMS: TslNode): TslNode {
  return n(smoothstep(0.06, 0.30, dropPerM)).mul(smoothstep(0.8, 3.0, speedMS));
}
function esStripAeration(dropPerM: TslNode, speedMS: TslNode): TslNode {
  return clamp(n(esStripBlend(dropPerM, speedMS)).mul(0.75).add(0.25), 0.0, 1.0);
}
function esStripGain(scrollMS: TslNode): TslNode {
  return clamp(n(scrollMS).div(fx(STREAK_LAYERS[0].rateMS, 2)), 0.3, 2.0);
}
function esStreakValueNoise(p: TslNode): TslNode {
  const i = floor(p);
  const f = n(fract(p));
  const uu = n(f.mul(f).mul(float(3.0).sub(f.mul(2.0))));
  return mix(mix(esHash21(i), esHash21(n(i).add(vec2(1.0, 0.0))), uu.x),
    mix(esHash21(n(i).add(vec2(0.0, 1.0))), esHash21(n(i).add(vec2(1.0, 1.0))), uu.x), uu.y);
}
function esStreakField(uv: TslNode): TslNode {
  return esStreakValueNoise(vec2(n(uv).x, n(uv).y.mul(0.5)));
}
function esStreakUv(layer: number, uu0: TslNode, arcM: TslNode, t: TslNode, gain: TslNode, wobbleScale: number): TslNode {
  const L = STREAK_LAYERS[layer];
  const tile = fx(L.tileM, 2), rate = fx(L.rateMS, 2), across = fx(L.acrossTiles, 2), phase = fx(L.phaseS, 2);
  const tp = n(t).add(phase);
  const breathe = n(float(1.0).sub(cos(tp.mul(6.2831853).div(fx(STREAK_BREATHE_PERIOD_S, 2)))))
    .mul(fx(STREAK_BREATHE_AMPLITUDE * 0.5, 3)).add(1.0);
  const wobble = n(sin(n(uu0).mul(fx(STREAK_WOBBLE_FREQ, 1)).add(tp))).mul(fx(STREAK_WOBBLE_AMPLITUDE, 2) * wobbleScale);
  const uu = n(uu0).sub(0.5).mul(breathe).mul(across).add(0.5 * across).add(tp.mul(fx(STREAK_U_DRIFT_UVS, 3))).add(wobble);
  const vv = n(arcM).div(tile).sub(n(gain).mul(rate).mul(t).div(tile));
  return vec2(uu, vv);
}
function esWhitewater(uu: TslNode, arcM: TslNode, t: TslNode, gain: TslNode, wobbleScale: number): TslNode {
  const body = n(esStreakField(esStreakUv(0, uu, arcM, t, gain, wobbleScale)));
  const foam = n(esStreakField(n(esStreakUv(1, uu, arcM, t, gain, wobbleScale)).add(vec2(11.0, 3.0))));
  const accent = n(esStreakField(n(esStreakUv(2, uu, arcM, t, gain, wobbleScale)).add(vec2(5.0, 17.0))));
  return clamp(body.mul(foam.mul(0.75).add(0.55)).mul(accent.mul(0.6).add(0.7)), 0.0, 1.0);
}

export interface WaterMaterialContext {
  assets: WaterAssets;
  uniforms: WaterUniforms;
  tier: WaterTier;
}

/** The lit-colour composite the GLSL spliced before `opaque_fragment`. */
type Composite = (outgoing: TslNode, reflected: {
  directDiffuse: TslNode; indirectDiffuse: TslNode; directSpecular: TslNode; indirectSpecular: TslNode;
}, envSample: ((dir: TslNode, roughness: number) => TslNode) | null) => TslNode;

class WaterLightingModel extends PhysicalLightingModel {
  constructor(private readonly composite: Composite) { super(); }
  finish(builder: any): void {
    super.finish(builder);
    const { outgoingLight, reflectedLight } = builder.context;
    const material = builder.material as THREE.MeshPhysicalMaterial;
    const envTex = (material.envMap ?? builder.scene?.environment ?? null) as THREE.Texture | null;
    const intensity = material.envMap ? material.envMapIntensity : (builder.scene?.environmentIntensity ?? 1);
    const envSample = envTex
      ? (dir: TslNode, roughness: number) => n(pmremTexture(envTex, dir, float(roughness))).rgb.mul(intensity)
      : null;
    outgoingLight.assign(this.composite(outgoingLight, reflectedLight, envSample));
  }
}

class WaterNodeMaterial extends MeshPhysicalNodeMaterial {
  composite: Composite | null = null;
  setupLightingModel(): any {
    return this.composite ? new WaterLightingModel(this.composite) : super.setupLightingModel();
  }
}

export function createWaterMaterial(
  variant: WaterVariant,
  ctx: WaterMaterialContext,
  mode: WaterSurfaceMode = "field",
): MeshPhysicalNodeMaterial {
  const { uniforms: u, tier } = ctx;
  const strip = mode === "strip";
  const foamTex = !!ctx.assets.waterfallTextures?.foam;
  const classes = ctx.assets.meta.klass.classes;
  const material = new WaterNodeMaterial();
  material.roughness = 0.08;
  material.metalness = 0.0;
  material.specularIntensity = 0.5; // F0 ≈ 0.02 — water
  material.side = strip ? THREE.DoubleSide : variant === "above" ? THREE.FrontSide : THREE.BackSide;
  // strips overlap the field by one station at each join; a small offset
  // makes the strip win that overlap instead of z-fighting it.
  material.polygonOffset = strip;
  material.polygonOffsetFactor = strip ? -2 : 0;
  material.polygonOffsetUnits = strip ? -4 : 0;
  material.envMapIntensity = 1.0;
  material.name = `es-water-${variant}-${tier.name}-${mode}${foamTex ? "-ftex" : ""}`;
  const surfaceAt = makeSurfaceAt(u, "esSurfaceAtV");
  const surfaceAtF = makeSurfaceAt(u, "esSurfaceAtF");
  const esContactFoamFn = makeContactFoam(u);
  const esContactRushFn = makeContactRush(u);
  const esPlungeFoamFn = makePlungeFoam(u);
  const esSsrFn = makeSsr(u);
  const FLOW_MIN = fx(FLOW_WAVE_MIN_SPEED_MS, 2);

  /* ---------------- vertex ---------------- */
  const restW = n(n(modelWorldMatrix).mul(vec4(positionGeometry, 1.0))).xyz;
  const aStill = attribute("aStill", "float"), aBedDepth = attribute("aBedDepth", "float");
  const aFlow = attribute("aFlow", "vec2"), aSeason = attribute("aSeason", "float");
  const aDrop = attribute("aDrop", "float");
  const surf = n(n(strip ? vec2(aStill, max(aBedDepth, 0.0)) : surfaceAt(restW.xz)).toVar());
  const dataUv = clamp(restW.xz.div(u.uFlowExtentM), vec2(0.0), vec2(1.0));
  let kl = n(n(n(u.uKlassTex).sample(dataUv)).toVar());
  let fl = n(n(n(u.uFlowTex).sample(dataUv)).toVar());
  let ss = n(n(esShoreAt(u, restW.xz)).toVar());
  if (!strip) {
    // beyond the border past a LAND or inland edge texel: the coast's class,
    // no current, open-sea fetch, far from any shore (16d, 0067)
    const beyond = n(u.uHasApron).greaterThan(0.5).and(esOutside(u, restW.xz))
      .and(n(esTideResponse(classes, kl.r.mul(255.0))).lessThan(0.5));
    const coast = n(u.uApronCoast);
    kl = n(sel(beyond, vec4(coast.x.div(255.0), coast.y, coast.z, 1.0), kl));
    fl = n(sel(beyond, vec4(0.5, 0.5, 1.0, 1.0), fl));
    ss = n(sel(beyond, vec3(u.uSurfShoreMax, 0.0, 0.0), ss));
  }
  const fetchM = n(n(esFetchAt(u, fl)).toVar());
  let still = strip
    ? n(surf.x.add(n(u.uLevelSeason).mul(aSeason)))
    : n(surf.x.add(n(u.uLevelTide).mul(esTideResponse(classes, kl.r.mul(255.0)))).add(n(u.uLevelSeason).mul(ss.y)));
  const shore = ss.x;
  const turbV = max(kl.g, ss.z);
  const fetch = n(n(esFetchExp(fetchM, turbV)).toVar());
  // shore frame: shoreward = -grad(shoreDist), for the swell's normal tilt
  const eG = n(u.uSurfMpp).mul(2.0);
  const gradD = n(vec2(
    n(esShoreAt(u, restW.xz.add(vec2(eG, 0.0)))).x.sub(shore),
    n(esShoreAt(u, restW.xz.add(vec2(0.0, eG)))).x.sub(shore))).div(eG);
  const gL = length(gradD);
  const shoreDir = n(n(sel(shore.lessThan(90.0).and(n(gL).greaterThan(0.05)), gradD.negate().div(max(gL, 1e-6)), vec2(0.0))).toVar());
  const surfE = esSurfEnergy(u.uWindMS, fetchM);
  const alongPh = esAlongPhase(restW.xz, shoreDir, u.uWaveTime);
  // swash + shore swell height at this vertex; the fragment swaps it for its
  // per-pixel value in the lift (f33). The swell's tilt stays OUT of the
  // vertex normal: the fragment adds it per pixel at the rest xz (diag14 V1).
  let surfH: TslNode = float(0.0);
  if (!strip) {
    surfH = n(n(esSwash(shore, fetch, u.uWaveTime, surfE, alongPh))
      .add(esShoreSwell(shore, max(surf.y, 0.0), fetch, u.uWaveTime, surfE, alongPh).h).toVar());
    still = still.add(surfH);
  }
  const vEsSurfH = n(varying(surfH, "vEsSurfH"));
  // rest world xz: the per-pixel shore frame, wave normal and crest phase (diag14 V1, V2)
  const vEsRestXZ = n(varying(restW.xz, "vEsRestXZ"));
  /** The field crest reads the tier's crest bands per pixel (diag11 W1); a
   * strip draws its own whitewater and has no crest. */
  const crestPx = tier.crestBands > 0 && !strip;
  const vDepth = surf.y.add(still.sub(surf.x));
  const exposure = strip ? float(0.05) : n(esWaveExposure(shore, vDepth, turbV));
  const camDist = distance(n(cameraPosition).xz, restW.xz);
  const waveAmp = n(n(exposure).mul(esSeaRms(u.uWindMS, fetchM)).toVar());
  const standW = n(n(esStandingRatio(classes, kl.r.mul(255.0), shore)).toVar());
  const wave = esWaveSampleEx(restW.xz, waveAmp, fetchM, standW, u.uWaveTime, tier.waveBands, tier.gridCellM);
  // below 0.0005 amplitude the GLSL skipped the spectrum (flat, up)
  const live = waveAmp.greaterThan(0.0005);
  // vertex wave amp (the crest height swap), fetch, standing; the standing
  // ratio on every vertex, so the fragment's per-pixel normal never
  // interpolates it toward a dry vertex's zero (perf10 c9 V8)
  const vEsWaveIn = n(varying(vec3(sel(live, waveAmp, float(0.0)), fetchM, standW), "vEsWaveIn"));
  // the crest bands' vertex height (diag11 W1, diag12 Q2)
  const vEsCrestV = crestPx
    ? n(varying(sel(live, n(esWaveCrestH(restW.xz, waveAmp, fetchM, standW, u.uWaveTime,
      tier.waveBands, tier.gridCellM, tier.crestBands)).z, float(0.0)), "vEsCrestV"))
    : null;
  const wDisp = n(n(sel(live, wave.disp, vec3(0.0))).toVar());
  // the vertex wave normal: debug/far only, the fragment's is per pixel inside 400 m (V8)
  const wNormal = n(n(sel(live, wave.normal, vec3(0.0, 1.0, 0.0))).toVar());
  const flowV = n(n(strip ? aFlow : fl.xy.sub(0.5).mul(2.0).mul(u.uFlowMax)).toVar());
  const flowSp = n(n(length(flowV)).toVar());
  let flowH: TslNode = float(0.0);
  if (!strip) {
    const flowing = flowSp.greaterThan(FLOW_MIN);
    const flowFade = float(1.0).sub(smoothstep(150.0, 400.0, camDist));
    // height only: its 1.6 m wavelength is shorter than the grid, so its slope
    // is added per pixel in the fragment (f33), never to the vertex normal
    const fw = esFlowWave(restW.xz, flowV.div(max(flowSp, 1e-6)), flowSp, u.uWaveTime);
    flowH = sel(flowing, n(fw.h).mul(flowFade), float(0.0));
  }
  let dropSlope: TslNode = float(0.0);
  if (strip) dropSlope = clamp(aDrop, 0.0, 1.0);
  else {
    const downAt = n(surfaceAt(restW.xz.add(flowV.div(max(flowSp, 1e-6)).mul(7.0))));
    dropSlope = sel(flowSp.greaterThan(FLOW_MIN), clamp(surf.x.sub(downAt.x).div(7.0), 0.0, 1.0), float(0.0));
  }
  // fetch exposure, surf energy (the shore frame is per pixel, diag15 V4)
  const vEsSurf = n(varying(vec2(fetch, surfE), "vEsSurf"));
  // the vertex still level (m): lift and crest base; depth, shore and
  // exposure are per pixel (perf-diag4 V2)
  const vEsStill = n(varying(still, "vEsStill"));
  // vertex along-flow undulation height (m): the crest swaps it per pixel (perf10 D11)
  const vEsFlowH = strip ? null : n(varying(flowH, "vEsFlowH"));
  // turbidity, salinity, tannin, class index; the field reads only the class
  // (its colour constituents are per pixel, perf10 c9 V8)
  const vEsKlass = n(varying(vec4(kl.g, kl.b, ss.z, kl.r.mul(255.0)), "vEsKlass"));
  const vEsFlow = n(varying(vec3(flowV, dropSlope), "vEsFlow"));
  const vEsNormalW = n(varying(wNormal, "vEsNormalW"));
  const vEsSide = n(varying(attribute("aSide", "float"), "vEsSide"));
  const vEsStrip = n(varying(vec4(attribute("aSideM", "float"), attribute("aArc", "float"),
    attribute("aScroll", "float"), attribute("aEdge", "float")), "vEsStrip"));
  const vEsRockFoam = n(varying(attribute("aRockFoam", "vec2"), "vEsRockFoam"));
  const pg = n(positionGeometry);
  material.positionNode = vec3(pg.x.add(wDisp.x), still.add(wDisp.y).add(flowH).mul(u.uVerticalScale), pg.z.add(wDisp.z));

  /* ---------------- fragment ---------------- */
  const wp = n(positionWorld);
  const wpXZ = wp.xz;
  let guard: TslNode = float(1.0);
  // Depth, shore distance and exposure PER PIXEL (perf-diag4 V2): read from
  // varyings they were one plane per triangle, and the foam thresholds over
  // them printed straight-edged pale triangles along the mesh grid. A strip
  // keeps the vertex values (narrow water: ripples, never swell).
  let depthPx: TslNode = strip ? varying(vDepth, "vEsDepth") : float(0.0);
  let shorePx: TslNode = strip ? varying(shore, "vEsShore") : float(0.0);
  let expoPx: TslNode = float(0.05);
  // the colour constituents: a strip's ride its own vertices (it is one
  // station wide); the field's are per pixel (below)
  let turbPx: TslNode = vEsKlass.x, salPx: TslNode = vEsKlass.y, tanPx: TslNode = vEsKlass.z;
  let colPx: TslNode = strip ? varying(esColourAt(u, restW.xz), "vEsColour") : vec2(0.0);
  // the per-pixel shore frame at the rest xz and the swell's dH/d(shore
  // distance), shared by the normal tilt and the surf foam phase
  let shoreDirR: TslNode = vec2(0.0);
  let swellD: TslNode = float(0.0);
  if (!strip) {
    // Decision 0047: the raster only guards against BURIED surface; the
    // visible edge is the terrain under the hardware depth test. Coverage
    // terms folded into esCover, never a hard cut (audit mechanisms 1-4).
    const fs = n(surfaceAtF(wpXZ));
    // The shore frame, swash and shore swell PER PIXEL at the rest xz (diag14
    // V1, diag15 V4, f33): the swell changes faster than the grid, so its
    // interpolated vertex height made the lift, hence depth, exposure and the
    // buried guard, one plane per triangle. The vertex height still moves the
    // surface (0047); only the fragment's lift swaps it for the exact value.
    let sR = n(n(esShoreAt(u, vEsRestXZ)).toVar());
    const beyondR = n(u.uHasApron).greaterThan(0.5).and(esOutside(u, vEsRestXZ))
      .and(n(esTideResponse(classes, vEsKlass.w)).lessThan(0.5));
    sR = n(sel(beyondR, vec3(u.uSurfShoreMax, 0.0, 0.0), sR));
    const eGR = n(u.uSurfMpp).mul(2.0);
    const gradR = n(vec2(
      n(esShoreAt(u, vEsRestXZ.add(vec2(eGR, 0.0)))).x.sub(sR.x),
      n(esShoreAt(u, vEsRestXZ.add(vec2(0.0, eGR)))).x.sub(sR.x))).div(eGR);
    const gLR = n(length(gradR));
    shoreDirR = n(n(gradR.negate().div(max(gLR, 1e-4)).mul(smoothstep(0.02, 0.08, gLR))).toVar("esShoreDirR"));
    const alongR = esAlongPhase(vEsRestXZ, shoreDirR, u.uWaveTime);
    const swR = esShoreSwell(sR.x, max(n(surfaceAtF(vEsRestXZ)).y, 0.0), vEsSurf.x, u.uWaveTime, vEsSurf.y, alongR);
    swellD = n(n(swR.dHdd).toVar("esSwellD"));
    const surfHPx = n(esSwash(sR.x, vEsSurf.x, u.uWaveTime, vEsSurf.y, alongR)).add(swR.h);
    const lift = vEsStill.sub(vEsSurfH).add(surfHPx).sub(fs.x);   // tide + season + surf at this pixel
    depthPx = n(n(fs.y.add(lift)).toVar());
    let sPx = n(n(esShoreAt(u, wpXZ)).toVar());
    // The colour constituents PER PIXEL (perf10 c9 V8): turbidity and salinity
    // from the class raster, tannin from the shore raster, algae and dark from
    // their alpha bytes. As vertex varyings they were one plane per triangle
    // in the Beer-Lambert absorption and printed straight-edged
    // transmitted-colour steps along the mesh grid.
    let klPx = n(n(n(u.uKlassTex).sample(clamp(wpXZ.div(u.uFlowExtentM), vec2(0.0), vec2(1.0)))).toVar());
    colPx = n(n(esColourAt(u, wpXZ)).toVar("esColPx"));
    // past the border on a land / inland edge texel: the vertex stage's apron rule
    const beyondPx = n(u.uHasApron).greaterThan(0.5).and(esOutside(u, wpXZ))
      .and(n(esTideResponse(classes, vEsKlass.w)).lessThan(0.5));
    sPx = n(sel(beyondPx, vec3(u.uSurfShoreMax, 0.0, 0.0), sPx));
    const coastPx = n(u.uApronCoast);
    klPx = n(sel(beyondPx, vec4(coastPx.x.div(255.0), coastPx.y, coastPx.z, 1.0), klPx));
    turbPx = n(klPx.g.toVar("esTurbPx"));
    salPx = n(klPx.b.toVar("esSalPx"));
    tanPx = n(sPx.z.toVar("esTanPx"));
    shorePx = n(sPx.x.toVar());
    expoPx = n(n(esWaveExposure(shorePx, depthPx, max(turbPx, tanPx))).toVar());
    const guardDist = distance(cameraPosition, wp);
    const floorM = max(n(guardDist).mul(-fx(BURIED_GUARD.perMetre, 4)).add(fx(BURIED_GUARD.nearM, 2)), fx(BURIED_GUARD.floorM, 2));
    guard = n(smoothstep(n(floorM).sub(fx(BURIED_GUARD.fadeM, 2)), floorM, depthPx));
    const ge = u.uSurfMpp;
    const gw = n(vec2(
      n(surfaceAtF(wpXZ.add(vec2(ge, 0.0)))).x.sub(n(surfaceAtF(wpXZ.sub(vec2(ge, 0.0)))).x),
      n(surfaceAtF(wpXZ.add(vec2(0.0, ge)))).x.sub(n(surfaceAtF(wpXZ.sub(vec2(0.0, ge)))).x))).div(n(ge).mul(2.0));
    guard = n(guard).mul(float(1.0).sub(smoothstep(fx(FIELD_SLOPE_FADE.start, 2), fx(FIELD_SLOPE_FADE.full, 2), length(gw))));
    // uniform branch, as dev: the 5 owner-mask loads only where strips own water
    const guardIn = guard;
    guard = n(Fn(() => {
      const gv = n(guardIn).toVar("esGuard");
      If(n(u.uHasOwner).greaterThan(0.5), () => { gv.mulAssign(float(1.0).sub(esOwnedFrac(u, wpXZ))); });
      return gv;
    })());
    material.maskNode = n(guard).greaterThan(0.003);
  }
  const screenUv = screenUV;
  const viewPos = n(cameraViewMatrix).mul(vec4(wp, 1.0));
  const fragEye = n(n(viewPos).z.negate().toVar());
  const sceneEye = n(n(esEyeDepth(u, screenUv)).toVar());

  // ---- normal ----
  const speed = n(n(length(vEsFlow.xy)).toVar());
  const cascade = n(n(smoothstep(0.04, 0.30, vEsFlow.z)).toVar());
  const dist = n(n(distance(cameraPosition, wp)).toVar());
  // The wave normal PER PIXEL inside 400 m (perf10 c9 V8): every vertex band
  // at the rest xz, its amplitude from this pixel's exposure. The
  // interpolated vertex normal kinked at each grid edge; the refraction
  // offset and the fresnel turned the kinks into straight-edged pale facets.
  // Past 120-400 m it hands over to the vertex normal (the far grid's filter).
  const ampPx = n(n(n(expoPx).mul(esSeaRms(u.uWindMS, vEsWaveIn.y))).toVar("esAmpPx"));
  const nPxW = n(n(float(1.0).sub(smoothstep(120.0, 400.0, dist))).toVar("esNPxW"));
  const nBase = n(Fn(() => {
    const o = n(normalize(vEsNormalW)).toVar();
    If(nPxW.greaterThan(0.0).and(ampPx.greaterThan(0.0005)), () => {
      const npx = esWaveSampleEx(vEsRestXZ, ampPx, vEsWaveIn.y, vEsWaveIn.z, u.uWaveTime, tier.waveBands, tier.gridCellM).normal;
      o.assign(normalize(mix(o, npx, nPxW)));
    }).ElseIf(nPxW.greaterThan(0.0), () => {
      o.assign(normalize(mix(o, vec3(0.0, 1.0, 0.0), nPxW)));
    });
    return o;
  })().toVar("esNBase"));
  const detFade = n(n(exp(dist.mul(-0.010))).toVar());
  const farFade = n(n(exp(dist.mul(-0.0025))).toVar());
  const detStrength = n(expoPx).mul(0.10).add(0.10).add(n(min(speed, 1.0)).mul(0.05))
    .mul(farFade.mul(0.8).add(0.2)).mul(cascade.mul(2.5).add(1.0));
  const flowing = speed.greaterThan(FLOW_MIN);
  const stillDrift = clamp(n(u.uWindMS).mul(0.06).add(0.15), 0.5, 1.5);
  const drift = n(n(sel(speed.greaterThan(0.05), vEsFlow.xy, n(u.uWindDir).mul(stillDrift))).toVar());
  const cycle = FOAM_CYCLE_S;
  const ph1 = n(n(fract(n(u.uTransportTime).div(cycle))).toVar());
  const ph2 = n(n(fract(n(u.uTransportTime).div(cycle).add(0.5))).toVar());
  const phB = n(n(abs(ph1.mul(2.0).sub(1.0))).toVar());
  const fDirN = n(n(sel(speed.greaterThan(0.05), vEsFlow.xy.div(max(speed, 1e-6)), vec2(1.0, 0.0))).toVar());
  const stretch = n(n(smoothstep(0.4, 2.2, speed)).mul(1.4).add(1.0).toVar());
  const p1 = wpXZ.sub(drift.mul(ph1).mul(cycle)).mul(0.55);
  const p2 = wpXZ.sub(drift.mul(ph2).mul(cycle)).mul(0.55);
  let g = n(n(mix(esDetailGrad(p1, vec2(0.0)), esDetailGrad(p2, vec2(0.0)), phB)).toVar());
  g = g.sub(fDirN.mul(dot(g, fDirN)).mul(float(1.0).sub(float(1.0).div(stretch))));
  const q1 = wpXZ.sub(drift.mul(ph1).mul(cycle)).mul(2.3).add(17.0);
  const q2 = wpXZ.sub(drift.mul(ph2).mul(cycle)).mul(2.3).add(17.0);
  const gfFlow = n(mix(esDetailGrad(q1, vec2(0.0)), esDetailGrad(q2, vec2(0.0)), phB)).mul(detFade).mul(0.5);
  const gfStill = n(esDetailGrad(wpXZ.mul(2.3).add(17.0),
    n(u.uWindDir).negate().mul(stillDrift).mul(0.6).mul(u.uTransportTime))).mul(detFade).mul(0.5);
  // Real branches, as dev: one of the two detail fields, none past ~390 m
  // (sel() ran three esDetailGrad noise evaluations on every pixel; F2).
  const gF = n(Fn(() => {
    const o = vec2(0.0).toVar();
    If(detFade.greaterThan(0.02), () => {
      If(flowing, () => { o.assign(gfFlow); }).Else(() => { o.assign(gfStill); });
    });
    return o;
  })().toVar());
  let rip: TslNode = vec2(0.0);
  let ripCrest: TslNode = float(0.0);
  if (tier.ripples) {
    const info = n(u.uRippleInfo);
    const rUv = n(wpXZ.sub(info.xy).div(info.z).add(0.5));
    const on = info.w.greaterThan(0.5).and(all(rUv.greaterThan(vec2(0.02)))).and(all(rUv.lessThan(vec2(0.98))));
    const rT = 1.0 / 256.0;
    const R = (o: TslNode) => n(n(u.uRipple).sample(rUv.add(o))).r;
    // uniform gate (patch live) around the 5 samples, the per-pixel range as sel()
    // packed: xy gradient, z crest
    const ripAll = n(Fn(() => {
      const o = vec3(0.0).toVar();
      If(info.w.greaterThan(0.5), () => {
        const g2 = n(vec2(R(vec2(rT, 0.0)).sub(R(vec2(-rT, 0.0))), R(vec2(0.0, rT)).sub(R(vec2(0.0, -rT))))).mul(14.0);
        o.assign(sel(on, vec3(g2, n(abs(n(n(u.uRipple).sample(rUv)).r)).mul(6.0)), vec3(0.0)));
      });
      return o;
    })().toVar());
    rip = ripAll.xy;
    ripCrest = ripAll.z;
  }
  let rainG: TslNode = vec2(0.0);
  if (!strip) {
    // uniform branch, as dev: the rain rings only while it rains
    rainG = n(Fn(() => {
      const o = vec2(0.0).toVar();
      If(n(u.uRainRipple).greaterThan(0.02), () => { o.assign(esRainRings(wpXZ, u.uTransportTime, u.uRainRipple, dist)); });
      return o;
    })().toVar());
  }
  // short Gerstner bands the grid cannot carry (perf-diag9 V1): slope per
  // pixel in xy, faded where a pixel spans several wavelengths; z is their
  // height, which makes the foam crest non-planar inside a triangle
  const waveF = n(Fn(() => {
    const o = vec3(0.0).toVar();
    If(ampPx.greaterThan(0.0005).and(nPxW.greaterThan(0.0)), () => {
      o.assign(n(esWaveFrag(vEsRestXZ, ampPx, vEsWaveIn.y, vEsWaveIn.z, u.uWaveTime, tier.waveBands, tier.gridCellM))
        .mul(nPxW));
    });
    return o;
  })().toVar("esWaveF"));
  // the tier's crest bands (its sharpest, by curvature): exact minus
  // interpolated vertex HEIGHT per pixel for the crest, under the same fade;
  // the vertex sum is unchanged (0047). Their slope is already in the
  // per-pixel normal above (diag12 Q2).
  let crestD: TslNode = float(0.0);
  if (vEsCrestV) {
    const crestV = vEsCrestV;
    crestD = n(Fn(() => {
      const o = float(0.0).toVar();
      If(vEsWaveIn.x.greaterThan(0.0005).and(nPxW.greaterThan(0.0)), () => {
        o.assign(n(n(esWaveCrestH(vEsRestXZ, vEsWaveIn.x, vEsWaveIn.y, vEsWaveIn.z, u.uWaveTime,
          tier.waveBands, tier.gridCellM, tier.crestBands)).z.sub(crestV)).mul(nPxW));
      });
      return o;
    })().toVar("esCrestD"));
  }
  rip = n(rip).add(waveF.xy);
  let flowHPx: TslNode = float(0.0);   // along-flow undulation height at this pixel (field)
  if (!strip) {
    // the along-flow undulation's slope per pixel (f33; the CPU twin sums the
    // same two small-slope fields)
    // .xy the slope, .z the undulation height at this pixel (perf10 D11)
    const flowGH = n(Fn(() => {
      const o = vec3(0.0, 0.0, vEsFlowH!).toVar();
      If(flowing, () => {
        const fw = esFlowWave(vEsRestXZ, fDirN, speed, u.uWaveTime);
        const fN = n(fw.normal);
        const fade = n(float(1.0).sub(smoothstep(150.0, 400.0, dist)));
        o.assign(vec3(fN.xz.div(max(fN.y, 1e-3)).mul(fade), n(fw.h).mul(fade)));
      });
      return o;
    })().toVar("esFlowGH"));
    const flowG = flowGH.xy;
    flowHPx = flowGH.z;
    // the shore swell: height slope = dH/dd * grad(d) = -shoreDir * dH/dd
    // (diag14 V1; no hard shore < 90 m gate: a hard cut on a raster value is
    // itself a straight edge, and the swell is zero there anyway)
    rip = n(rip).sub(flowG).sub(n(shoreDirR).mul(swellD));
  }
  const nb = n(nBase);
  let nw = n(normalize(vec3(
    nb.x.sub(n(g).x.add(gF.x).mul(detStrength)).sub(n(rip).x).sub(n(rainG).x),
    nb.y,
    nb.z.sub(n(g).y.add(gF.y).mul(detStrength)).sub(n(rip).y).sub(n(rainG).y))));
  const men = n(n(esMeniscusBand(wp.y.sub(n(cameraPosition).y).div(max(u.uVerticalScale, 1e-3)), dist)).toVar());
  const nwIn = nw;
  nw = n(Fn(() => {
    const o = n(nwIn).toVar();
    If(men.greaterThan(0.0), () => { o.assign(esMeniscusNormal(o, normalize(n(cameraPosition).sub(wp)), men)); });
    return o;
  })());
  if (variant === "below") nw = nw.negate();
  nw = nw.toVar("esNW");
  material.normalNode = normalize(n(cameraViewMatrix).mul(vec4(nw, 0.0)).xyz);

  // ---- albedo, roughness, foam ----
  let composite: Composite;
  if (variant === "above" && strip) {
    const sal = salPx, tan = tanPx;
    const blend = esStripBlend(vEsFlow.z, speed);
    const aer = n(esStripAeration(vEsFlow.z, speed));
    const stripU = clamp(n(vEsSide).div(max(vEsStrip.w, 1.0)).mul(0.5).add(0.5), 0.0, 1.0);
    const streak = n(esWhitewater(stripU, vEsStrip.y, u.uTransportTime, esStripGain(vEsStrip.z), 0.5));
    let white = n(clamp(aer.mul(streak.mul(0.65).add(0.35)), 0.0, 1.0));
    white = white.mul(mix(0.15, 1.0, blend));
    const rockF = mix(vEsRockFoam.x, vEsRockFoam.y, clamp(abs(vEsSide), 0.0, 1.0));
    white = n(clamp(white.add(n(rockF).mul(streak.mul(0.4).add(0.6)).mul(float(1.0).sub(white))), 0.0, 1.0));
    const rushDir = vEsFlow.xy.div(max(speed, 1e-3));
    const rush = n(esContactRushFn(wpXZ, rushDir, speed));
    white = n(clamp(white.add(n(esContactFoamFn(wpXZ)).add(n(ripCrest).mul(0.5)).add(rush).mul(float(1.0).sub(white))), 0.0, 1.0)).toVar("esWhite");
    const albClear = mix(vec3(0.035, 0.115, 0.10), vec3(0.05, 0.14, 0.155), sal);
    const alb = mix(albClear, vec3(0.045, 0.065, 0.022), clamp(tan, 0.0, 1.0));
    const T = vec3(float(1.0).sub(aer));
    const bank = esStripBank(vEsSide, vEsStrip.w);
    const sw = STRIP_WHITE.map((v) => fx(v, 2));
    material.colorNode = vec4(mix(alb, vec3(sw[0], sw[1], sw[2]), white), 1.0);
    material.roughnessNode = mix(0.5, 0.9, white);
    composite = (outgoing) => {
      const view = normalize(n(cameraPosition).sub(wp));
      const fresT = n(pow(float(1.0).sub(max(dot(nw, view), 0.0)), 5.0)).mul(0.98).add(0.02);
      const scene = n(n(u.uSceneColor).sample(screenUv)).rgb;
      const transmit = scene.mul(T).mul(float(1.0).sub(fresT));
      return mix(scene, n(outgoing).add(transmit), bank);
    };
  } else if (variant === "above") {
    const algae = n(colPx).x;
    const turb = n(n(clamp(n(turbPx).add(algae.mul(0.25)), 0.0, 1.0)).toVar());
    const sal = salPx;
    const tan = n(n(clamp(n(tanPx).add(n(colPx).y.mul(0.7)), 0.0, 1.0)).toVar());
    const murk = n(n(clamp(turb.mul(0.7).add(tan.mul(0.8)), 0.0, 1.0)).toVar());
    // vertical thickness over the unrefracted scene point (decision 0047 root cause 8)
    const ray = n(normalize(wp.sub(cameraPosition)));
    const vm = n(cameraViewMatrix);
    const camFwd = vec3(vm.element(0).z, vm.element(1).z, vm.element(2).z).negate();
    const sceneT = sceneEye.div(max(dot(ray, camFwd), 1e-3));
    const sceneW = n(cameraPosition).add(ray.mul(sceneT));
    const tv = n(wp.y.sub(sceneW.y).div(max(u.uVerticalScale, 1e-3))).toVar("esTv");
    const distort = n(n(u.uRefractStrength).mul(clamp(float(6.0).div(max(fragEye, 1.0)), 0.02, 1.0)).mul(smoothstep(0.03, 0.5, tv)).toVar());
    const rUvRaw = clamp(n(screenUv).add(nw.xz.mul(distort)), vec2(0.001), vec2(0.999));
    const sceneEyeRRaw = n(esEyeDepth(u, rUvRaw));
    const rejected = sceneEyeRRaw.lessThan(fragEye);
    const rUv = n(sel(rejected, screenUv, rUvRaw)).toVar("esRUV");
    const sceneEyeR = sel(rejected, sceneEye, sceneEyeRRaw);
    const thick = max(n(sceneEyeR).sub(fragEye), 0.0);
    const colDepth = min(thick, n(max(depthPx, 0.05)).mul(4.0));
    const absorb = vec3(0.30, 0.10, 0.06).add(vec3(1.2, 1.7, 2.3).mul(turb)).add(vec3(2.2, 2.0, 4.6).mul(tan));
    const T = n(n(exp(n(absorb).negate().mul(colDepth))).toVar("esT"));
    let alb = n(n(mix(vec3(0.035, 0.115, 0.10), vec3(0.05, 0.14, 0.155), sal)).toVar());
    alb = n(mix(alb, vec3(0.115, 0.085, 0.048), clamp(turb, 0.0, 1.0)));
    alb = n(mix(alb, vec3(0.045, 0.065, 0.022), clamp(tan, 0.0, 1.0)));
    alb = n(mix(alb, vec3(0.16, 0.30, 0.10), algae.mul(0.55)));
    const shoreD = n(shorePx);
    const expo = n(expoPx);
    // 1. thin contact line
    const cn0 = n(n(esFbm(wpXZ.mul(1.3).add(3.0), 2)).toVar());
    let foamE = n(float(1.0).sub(smoothstep(0.0, fx(CONTACT_FOAM_M, 2), tv.add(cn0.sub(0.45).mul(0.10)))))
      .mul(n(clamp(max(expo.mul(2.0), vEsSurf.x), 0.0, 1.0)).mul(0.5).add(0.18));
    // 2. surf bore + backwash
    const bn = n(n(esFbm(wpXZ.mul(0.16), 3)).toVar());
    // the vertex stage's energy (vEsSurf.y) and the per-pixel shore frame at
    // the rest xz (diag15 V4: a vertex direction, interpolated, kinked the
    // phase at every triangle edge and the thresholds cut pale wedges)
    foamE = foamE.add(n(esSurfFoam(shoreD.add(bn.mul(4.0)), vEsSurf.x, u.uWaveTime, vEsSurf.y,
      esAlongPhase(vEsRestXZ, shoreDirR, u.uWaveTime))).mul(0.85));
    // 3. whitecaps
    // the mesh crest is one plane per triangle; the short bands' own height
    // rides on top of it (perf-diag4 V2), and the crest bands' per-pixel
    // height swap (crestD, diag11 W1 / diag12 Q2). The along-flow undulation
    // (1.6 m wavelength, under the grid) is swapped the same way: per vertex it
    // aliased into one tilted plane per triangle and the whitecap threshold cut
    // it into straight-edged pale wedges on rivers (perf10 D11)
    let crestMesh: TslNode = wp.y.div(max(u.uVerticalScale, 1e-3)).sub(vEsStill).add(waveF.z).add(crestD);
    if (vEsFlowH) crestMesh = n(crestMesh).sub(vEsFlowH).add(flowHPx);
    const crestFade = float(1.0).sub(smoothstep(1200.0, 2400.0, dist));
    const cp = n(n(wpXZ.sub(n(u.uWindDir).mul(fx(whitecapDriftMS(), 2)).mul(u.uTransportTime)).mul(0.085)).toVar());
    const cn = n(n(esFbm(cp, 3)).mul(0.5).add(n(esFbm(cp.mul(2.7).add(11.0), 2)).mul(0.5)).toVar());
    const crest = max(crestMesh, n(smoothstep(n(u.uCapThreshold).sub(0.01), n(u.uCapThreshold).add(0.02), cn)).mul(0.3).add(0.16));
    foamE = foamE.add(n(smoothstep(0.16, 0.34, crest)).mul(clamp(expo.mul(4.0), 0.0, 1.0)).mul(0.8).mul(crestFade));
    // 4. rapids churn + cascades
    foamE = foamE.add(n(smoothstep(0.3, 1.1, speed)).mul(float(1.0).sub(smoothstep(4.0, 30.0, shoreD))).mul(0.5));
    foamE = foamE.add(cascade.mul(0.55));
    // 5. contact rings, sim crests, rush, plunge pools
    foamE = foamE.add(esContactFoamFn(wpXZ)).add(n(ripCrest).mul(0.5));
    foamE = foamE.add(sel(speed.greaterThan(fx(RUSH.speedFromMS, 2)),
      esContactRushFn(wpXZ, vEsFlow.xy.div(max(speed, 1e-3)), speed), float(0.0)));
    foamE = foamE.add(esPlungeFoamFn(wpXZ, vEsFlow.xy));
    // 5b. shoreline depth-range froth
    foamE = foamE.add(esShoreFroth(tv, esFbm(wpXZ.mul(0.9).add(7.0), 2), vEsSurf.x));
    foamE = n(min(foamE, 0.85)).toVar();
    // 5c. persistent foam field
    foamE = n(max(foamE, min(esFoamFieldAt(u, wpXZ), 0.95)));
    foamE = foamE.mul(float(1.0).sub(murk.mul(0.75)));
    const masks = foamMasks(u, foamTex && !strip);
    const fp1 = wpXZ.sub(drift.mul(ph1).mul(cycle));
    const fp2 = wpXZ.sub(drift.mul(ph2).mul(cycle));
    let fTex = n(n(mix(masks.mask(fp1), masks.mask(fp2), phB)).toVar());
    {
      const adv = n(min(speed, 2.5)).mul(cycle);
      const sp1 = wpXZ.sub(fDirN.mul(adv).mul(ph1));
      const sp2 = wpXZ.sub(fDirN.mul(adv).mul(ph2));
      const smear = fDirN.mul(1.55);
      const s1 = n(masks.mask2(sp1.sub(smear))).add(masks.mask2(sp1)).add(masks.mask2(sp1.add(smear))).div(3.0);
      const s2 = n(masks.mask2(sp2.sub(smear))).add(masks.mask2(sp2)).add(masks.mask2(sp2.add(smear))).div(3.0);
      const streak = mix(s1, s2, phB);
      fTex = n(sel(flowing, mix(fTex, streak, smoothstep(0.2, 1.0, speed)), fTex));
      foamE = n(sel(flowing, foamE.add(n(smoothstep(0.6, 1.6, speed)).mul(0.3)), foamE));
    }
    const fThr = float(1.0).sub(foamE);
    let foam = n(smoothstep(n(fThr).sub(0.18), n(fThr).add(0.26), fTex)).mul(smoothstep(0.0, 0.10, foamE));
    const tt = n(u.uTransportTime);
    foam = n(clamp(foam, 0.0, 1.0))
      .mul(n(esFbm(wpXZ.mul(1.9).add(vec2(sin(tt.mul(0.17)), cos(tt.mul(0.15))).mul(0.8)), 3)).mul(0.5).add(0.5))
      .mul(farFade.mul(0.75).add(0.25)).mul(0.9);
    // 6. river flecks (class 3 = river)
    {
      const fk = mix(masks.fleck(fp1), masks.fleck(fp2), phB);
      const lo = foamTex ? fx(FOAM_TEX.fleck.lo, 3) : fx(FLECK.lo, 3);
      const hi = foamTex ? fx(FOAM_TEX.fleck.hi, 3) : fx(FLECK.hi, 3);
      const fleck = n(smoothstep(lo, hi, fk)).mul(farFade.mul(0.75).add(0.25));
      const isRiver = flowing.and(vEsKlass.w.greaterThan(2.5)).and(vEsKlass.w.lessThan(3.5));
      foam = n(sel(isRiver, max(foam, fleck.mul(0.7).mul(float(1.0).sub(murk.mul(0.6)))), foam));
    }
    foam = foam.toVar("esFoam");
    const foamShade = n(n(masks.mask(wpXZ.mul(6.7))).mul(0.36).add(0.72).toVar());
    material.colorNode = vec4(mix(n(alb).mul(float(1.0).sub(T)), vec3(0.80, 0.84, 0.86).mul(foamShade), foam), 1.0);
    material.roughnessNode = mix(
      clamp(turb.mul(0.28).add(0.05).add(n(min(speed, 1.0)).mul(0.08)).add(float(1.0).sub(farFade).mul(0.24)), 0.0, 0.85),
      0.92, foam);
    composite = (outgoing, reflected, envSample) => {
      const view = n(normalize(n(cameraPosition).sub(wp)));
      let specEnv = n(reflected.indirectSpecular);
      if (tier.ssr) {
        // Real branch, as dev: the 18-step march (up to 18 depth reads and a
        // colour read) only inside the SSR fade range (F2: sel() marched every pixel).
        const envIn = specEnv;
        specEnv = n(Fn(() => {
          const o = n(envIn).toVar();
          If(dist.lessThan(fx(SSR_FADE_END_M, 1)), () => {
            const s = n(esSsrFn(wp, reflect(view.negate(), nw)));
            const fres = n(pow(float(1.0).sub(max(dot(nw, view), 0.0)), 5.0)).mul(0.98).add(0.02);
            const ssrFade = float(1.0).sub(smoothstep(fx(SSR_FADE_START_M, 1), fx(SSR_FADE_END_M, 1), dist));
            o.assign(mix(o, s.rgb.mul(fres), n(clamp(s.a, 0.0, 1.0)).mul(u.uSsrStrength).mul(ssrFade).mul(float(1.0).sub(foam))));
          });
          return o;
        })());
      }
      const fresT = n(pow(float(1.0).sub(max(dot(nw, view), 0.0)), 5.0)).mul(0.98).add(0.02);
      const transmit = n(n(u.uSceneColor).sample(rUv)).rgb.mul(T).mul(float(1.0).sub(foam)).mul(float(1.0).sub(fresT));
      let out = n(outgoing).sub(reflected.indirectSpecular).add(specEnv).add(transmit);
      const edgeSoft = smoothstep(0.0, fx(EDGE_FADE_M, 2), tv);
      const cover = n(max(edgeSoft, foam)).mul(guard);
      const spark = n(esSparkle(nw, view, u.uWaterSunDir, dist, expo)).mul(fresT);
      const sssTint = mix(vec3(0.10, 0.45, 0.40), vec3(0.14, 0.11, 0.04), murk);
      const sssW = esCrestSss(view, u.uWaterSunDir, crestMesh, expo);
      out = out.add(n(u.uWaterSunLight).mul(spark.add(n(sssW).mul(sssTint))).mul(float(1.0).sub(foam)));
      out = out.add(n(u.uWaterAmbient).mul(10.0).mul(esMeniscusRim(men)));
      out = n(mix(n(n(u.uSceneColor).sample(screenUv)).rgb, out, cover));
      if (envSample) {
        const hz = n(esHorizonBlend(dist));
        const sky = n(reflect(view.negate(), vec3(0.0, 1.0, 0.0)));
        const skyDir = normalize(vec3(sky.x, max(sky.y, 0.02), sky.z));
        out = n(sel(hz.greaterThan(0.0), mix(out, envSample(skyDir, 0.4), hz), out));
      }
      return out;
    };
  } else {
    const turb = clamp(n(turbPx).add(tanPx).add(n(colPx).y.mul(0.7)), 0.0, 1.0);
    let albU = n(mix(vec3(0.05, 0.14, 0.15), vec3(0.06, 0.08, 0.03), turb));
    albU = n(mix(albU, vec3(0.16, 0.30, 0.10), n(colPx).x.mul(0.55)));
    material.colorNode = vec4(albU, 1.0);
    material.roughnessNode = float(0.4);
    composite = (_outgoing, reflected, envSample) => {
      // Snell's window: refract the up-ray through the surface into the sky.
      const view = n(normalize(n(cameraPosition).sub(wp)));
      const I = view.negate();
      const nUp = n(sel(nw.y.greaterThan(0.0), nw, nw.negate()));
      const refr = n(refract(I, nUp.negate(), 1.333));
      const ci = abs(dot(nUp, I));
      const fresU = n(pow(float(1.0).sub(ci), 5.0)).mul(0.98).add(0.02);
      const glow = n(reflected.directDiffuse).add(reflected.indirectDiffuse);
      const hasRefr = n(dot(refr, refr)).greaterThan(1e-4);
      const sky = envSample ? sel(hasRefr, n(envSample(refr, 0.08)).mul(1.15), glow.mul(2.4)) : glow.mul(2.4);
      const shimmer = smoothstep(0.5, 0.92, esFbm(wpXZ.mul(0.5).add(vec2(0.2).mul(u.uTransportTime)), 4));
      let col = n(sel(hasRefr, mix(glow.mul(1.4), sky, float(1.0).sub(fresU)), glow.mul(1.6)));
      col = col.add(glow.mul(shimmer).mul(0.8));
      col = col.add(n(u.uWaterAmbient).mul(10.0).mul(esMeniscusRim(men)));
      return col;
    };
  }
  material.composite = composite;
  material.needsUpdate = true;
  return material;
}
