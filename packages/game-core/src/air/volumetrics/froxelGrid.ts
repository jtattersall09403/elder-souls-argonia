/**
 * The froxel medium (decision 0112 §1, §7): a camera-aligned grid with
 * exponential depth slices, filled by two TSL compute passes per update:
 * inject + light (density from the fog field, lit by sun, sky and the
 * nearest fixture lights, all in scene-referred radiance), then integrate
 * front to back (Hillaire 2015, energy-conserving) into in-scatter (rgb)
 * and transmittance (a). `applyVolumetrics` samples the result in the fog
 * stage. WebGPU only: on the WebGL backend the band is always "off".
 *
 * No module state: one `Volumetrics` per renderer, owned by whoever mounts it.
 */
import * as THREE from "three";
import { Storage3DTexture, type WebGPURenderer } from "three/webgpu";
import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";
import { matrixFinite } from "../../render/cameraAspect";
import { fogRegimesInto, WET_HAZE_SCALE_M, MOISTURE_FLOOR, MIST_FADE_SHARE, MIST_SCALE_SHARE, type FogFieldInput, type FogRegimes } from "./fogField";
import { FOG_NOISE, FogDrift, FogShapeBake, bakeFogWarp } from "./fogNoise";
import { VOLUMETRIC_BANDS, bandSpec, type BandSpec, type VolumetricTier } from "./bandGovernor";
import { SHADOWED_SKY, SUN_PROBES_M, SUN_PROBE_NEAR_M, probeSoftM } from "./terrainSun";
import { TerrainGrids, GRID_TEXELS, NEAR_SIZE_M, FAR_SIZE_M, type TerrainSamplers } from "./terrainGrids";
import { CanopyMap, CANOPY_SIZE_M, CANOPY_TEXELS, type Crown } from "./canopyMap";
import { FIRE_HALO_SIGMA_PER_M, lampHalo, type VolumetricsSampler } from "./volumetricNodes";

const T = tsl as unknown as Record<string, (...a: TslNode[]) => TslNode> & Record<string, TslNode>;
const {
  Fn, If, Loop, abs, clamp, cos, dot, exp, float, floor, fract, instanceIndex, int, length, log, max, min, mix, normalize, pow,
  sin, smoothstep, step, texture, texture3D, textureStore, uniform, uniformArray, uvec3, vec2, vec3, vec4,
} = T;

export type VolumetricBand = "off" | "low" | "medium" | "high";
/** The grids are allocated once at this size (the largest band) and never resized (see the class doc). */
export const MAX_GRID = VOLUMETRIC_BANDS.high.grid;
export const FROXEL_NEAR_M = 0.5;
export const MAX_VOLUME_LIGHTS = 16;
export const MAX_APERTURES = 4;
const HISTORY_BLEND = 0.9;
export const ALBEDO = 0.95;
/** Dust lit inside a window beam (m^-1, vol10 F4): the beam scatters off at least this much medium, so a
 * shaft shows at window height above a floor mist (Keeba's tops out at 0.35 m). In-scatter only: the
 * beam adds no extinction (the room's medium keeps its own transmittance). */
export const BEAM_DUST_PER_M = 0.04;
/** The inject stage's window-beam phase: an isotropic floor mixed with a forward HG(0.7) lobe. */
export function beamPhase(cosToEye: number): number {
  const g = 0.7;
  const hgv = (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * cosToEye, 1.5));
  return 0.4 / (4 * Math.PI) + 0.6 * hgv;
}
/** CPU twin of the inject stage's window-beam in-scatter per metre (radiance/m) for a beam of irradiance
 * `irradiance` inside its cone, in a medium of extinction `sigmaT`. */
export function beamInscatterPerM(irradiance: number, sigmaT: number, cosToEye: number): number {
  return irradiance * beamPhase(cosToEye) * Math.max(sigmaT, BEAM_DUST_PER_M) * ALBEDO;
}
/** CPU twin of the inject stage's sky in-scatter per metre indoors (outdoor 0: skyOpen 1; sun straight up,
 * unshadowed: skyKeep 1): the cell's ambient as `skyIrradiance` scattered by the room's medium. */
export function interiorSkyInscatterPerM(skyIrradiance: number, sigmaT: number): number {
  return skyIrradiance * SKY_INSCATTER * sigmaT * ALBEDO;
}
/** Sky in-scatter per unit sky irradiance E: a uniform upper-hemisphere sky of radiance E/π seen by an
 * isotropic scatterer gives E/(2π); 0.8/π carries the ground bounce on top. Under the same sky a
 * white Lambert floor reads E/π, so thick fog settles at 0.76 of the floor's radiance, never above it. */
export const SKY_INSCATTER = 0.8 / Math.PI;
/** Range (m) over which the per-pixel shaft march carries the sun under the canopy (steps: the band's
 * `shaftSteps`). */
const SHAFT_NEAR_M = 40;
/** A window beam's half-angle of spread (rad, ~3 deg): the sun disc (0.27 deg) plus the bright
 * circumsolar sky and the sky seen through the opening widen the shaft along its length. */
export const BEAM_SPREAD_RAD = 0.052;
/** Radius (m) of a window beam `alongM` metres in from its aperture of `radiusM`: a cone. */
export function beamRadiusM(radiusM: number, alongM: number, spreadRad = BEAM_SPREAD_RAD): number {
  return radiusM + Math.max(0, alongM) * Math.tan(spreadRad);
}
/** Penumbra (m per metre in from the window): the soft edge the sun disc and the opening's frame add. */
export const BEAM_PENUMBRA_PER_M = 0.04;
/** Soft-edge half-width (m) of a beam `alongM` in, sampled at cells of `cellM`: at least one cell, so the
 * grid never resolves a binary edge into a step (vol10 diag3 Q5). */
export function beamEdgeM(alongM: number, cellM: number): number {
  return Math.max(cellM, Math.max(0, alongM) * BEAM_PENUMBRA_PER_M);
}
/** Cross-section energy kept by the soft edge: a smoothstep over r +- w is symmetric about r, so it adds
 * about pi*w^2/3 of disc area; dividing by 1 + w^2/(3r^2) keeps the beam's flux. */
export function beamEdgeNorm(radiusM: number, edgeM: number): number {
  return 1 / (1 + (edgeM * edgeM) / (3 * radiusM * radiusM));
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** CPU twin of beamMask: membership 0..1 at `offM` off the axis, `alongM` in, for a beam of aperture
 * radius `radiusM`, length `lengthM`, on cells of `cellM` (unnormalised edge; 0.5 at the cone's side). */
export function beamMembership(offM: number, alongM: number, radiusM: number, lengthM: number, cellM: number, spreadRad = BEAM_SPREAD_RAD): number {
  const r = beamRadiusM(radiusM, alongM, spreadRad);
  const w = beamEdgeM(alongM, cellM);
  return (1 - smooth(r - w, r + w, offM)) * smooth(0, cellM, alongM)
    * Math.exp(-BEAM_DUST_PER_M * Math.max(0, alongM)) * (1 - smooth(0.4 * lengthM, lengthM, alongM));
}
/** Sun-ray optical depth through the medium itself: density sampled at these distances (m) up the sun
 * ray, each standing for the span `SUN_OD_SPAN_M` (midpoint rule over 0..255 m). */
export const SUN_OD_PROBES_M = [12, 35, 90, 200] as const;
export const SUN_OD_SPAN_M = [23.5, 39, 82.5, 110] as const;
/** The sun light that reaches a point of the medium (per unit sun irradiance): the share the medium
 * above it lets through (`sunT`) arrives as the direct beam with the phase lobe; the share it took out
 * is scattered on, and arrives as near-isotropic diffuse light (1/4pi). Without this the forward lobe
 * saw the full sun inside a 150 m haze and the haze read ~3x the horizon sky (walk 9). */
export function sunInscatterGain(sunT: number, phase: number): number {
  return sunT * phase + (1 - sunT) / (4 * Math.PI);
}
/** Sun phase: strongly forward (g 0.85) over an isotropic-ish floor, the peak clamped for a grazing
 * sun (below ~8 deg), which otherwise draws one saturated column along the sun's azimuth in steam;
 * the forward share never falls under SUN_FORWARD_FLOOR, so a dawn mist still wears the sun's tint
 * toward it (vol10 diag8 F-7). */
export const SUN_FORWARD_FLOOR = 0.35;
function sunPhase(cSun: TslNode, sunY: TslNode): TslNode {
  return mix(hg(0.2, cSun), hg(0.85, cSun), smoothstep(0.03, 0.14, sunY).mul(0.75 - SUN_FORWARD_FLOOR).add(SUN_FORWARD_FLOOR));
}

/** Peak densities (m^-1) and shapes of the outdoor fog terms in density() (vol10 diag8 F-1..F-6, O-2). */
export const FOG_TERMS = {
  /** Radiation mist at the basin floor, full cover. */
  mistPeakPerM: 0.04,
  /** Mist is integrated out to here from the camera (m), fading over the last quarter: a grazing ray
   * along a 6 m layer never sums more than this much of it (no white horizon band). */
  mistFarCapM: 400,
  /** Marsh ground fog at its base, full cover. */
  marshPeakPerM: 0.16, marshTopM: 2.5,
  /** Mist and marsh tops move +- this (m) with the low-octave shape (fogShapeAt .z). */
  topReliefM: 5,
  /** Sea fog bank: density, top above sea level (m, billowed +-6 m by the shape) and its fade (m). */
  seaPeakPerM: 0.03, seaTopM: 20, seaFadeM: 6,
  /** Rain-fed wet haze at the ground per unit wetHaze (0..4). */
  wetHazePerM: 1.2e-3,
  /** Cap cloud at the belt centre, full cover, where the ground reaches the belt. */
  capPeakPerM: 0.02,
  /** Canopy haze under the crowns at full canopyHaze, and the sunlit dust value once the sun is above
   * ~15 deg (sin 13..17 deg blend). */
  canopyHazePerM: 0.025, canopyDustPerM: 0.06, canopyDustSunY: [0.225, 0.292] as const,
} as const;

/** One point of the medium for fogTermsAt: the terrain-grid values there and the fog uniforms. */
export interface FogTermPoint {
  y: number; ground: number; floor: number; waterH: number; waterMask: number; moist: number; sea: number;
  /** 0..1 under the crowns; horizontal distance from the camera (m). */
  under: number; distM: number;
  /** cover x mist, y steam, z marsh, w sea; canopy haze 0..1; the shape noise (0.5 = its median). */
  cover: readonly number[]; canopyHaze: number; noise: number;
  /** The low-octave shape (fogShapeAt .z, fogShapeNoise outA[1]) that moves the layer tops. */
  noiseLow: number;
  mistDepth: number; mistHeightScale: number; mistBurn: number; wetHaze: number; sunY: number;
  /** Cap-cloud belt (centre, sigma below, sigma above; m) and its cover. */
  capBelt: readonly [number, number, number]; capCover: number;
}
export interface FogTerms { mist: number; marsh: number; sea: number; wet: number; canopy: number; cap: number }

const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Under-the-crowns share at a canopy texel (r cover, b crown top): CPU twin of the `under` node in density(). */
export const canopyUnder = (cover: number, topM: number, groundM: number) => sm(0, 0.05, cover) * sm(0, 0.3, topM - groundM);
const burnCpu = (n: number, c: number, rim: number) => Math.max(n - (1 - c) - rim, 0) / Math.max(c, 0.05);

/** CPU twin of density()'s mist, marsh, sea, wet-haze, cap and canopy terms (froxel prefilter width 0, the
 * shape's coverage and slow terms at their mean): for tests and the dev probe. Writes into `out`. */
export function fogTermsAt(q: FogTermPoint, out: FogTerms): FogTerms {
  const T = FOG_TERMS, n = q.noise, nc = n - 0.5;
  const relief = (q.noiseLow - 0.5) * 2 * T.topReliefM;
  const hAG = q.y - q.ground;
  const moistW = MOISTURE_FLOOR + (1 - MOISTURE_FLOOR) * q.moist * q.moist;
  const top = q.floor + q.mistDepth + relief;
  const depth = Math.max(top - q.floor, 1);
  const hF = Math.max(q.y - q.floor, 0);
  const mistRim = ((q.ground - q.floor) / depth * 0.5 + (1 - q.moist)) * q.mistBurn;
  out.mist = Math.exp(-hF / (depth * MIST_SCALE_SHARE * Math.max(q.mistHeightScale, 1e-3)))
    * (1 - sm(top - Math.max(depth * MIST_FADE_SHARE, 1.5), top, q.y)) * sm(-1, 1, hAG) * sm(0, 6, top - q.ground)
    * (1 - sm(0.75 * T.mistFarCapM, T.mistFarCapM, q.distM))
    * burnCpu(n, q.cover[0], mistRim) * moistW * T.mistPeakPerM;
  const surf = q.ground + (Math.max(q.ground, q.waterH) - q.ground) * q.waterMask;
  const hAS = q.y - surf;
  const low = 1 - sm(2, 12, q.ground - q.floor);
  const marshTop = T.marshTopM + relief;
  const fall = Math.min(1, Math.max(0, 1 - hAS / Math.max(marshTop, 0.2)));
  const skirt = q.waterMask * Math.exp(Math.max(hAS, 0) / -2) * (1 - sm(4, 6, hAS)) * 0.3;
  out.marsh = q.moist * low * Math.max(fall, skirt) * (hAS >= 0 ? 1 : 0)
    * burnCpu(n, q.cover[2], (1 - q.waterMask) * q.mistBurn * 0.5) * T.marshPeakPerM;
  const seaTop = T.seaTopM + nc * 12;
  out.sea = q.sea * (1 - sm(seaTop - T.seaFadeM, seaTop, q.y)) * burnCpu(n, q.cover[3], 0) * T.seaPeakPerM;
  out.wet = Math.exp(Math.max(hAG, 0) / -WET_HAZE_SCALE_M) * q.wetHaze * T.wetHazePerM;
  const canopyK = T.canopyHazePerM + (T.canopyDustPerM - T.canopyHazePerM) * sm(T.canopyDustSunY[0], T.canopyDustSunY[1], q.sunY);
  const [bc, sb, sa] = q.capBelt, bz = (q.y - bc) / (q.y >= bc ? sa : sb);
  out.cap = sm(bc - 2 * sb, bc, q.ground) * Math.exp(-0.5 * bz * bz) * burnCpu(n, q.capCover, 0) * T.capPeakPerM;
  out.canopy = q.under * (1 - sm(0, 25, hAG)) * q.canopyHaze * canopyK * (n * 0.5 + 0.5);
  return out;
}

/** View depth of the centre-free slice boundary `s` of `n` (exponential distribution). */
export function sliceDepth(s: number, n: number, near: number, far: number): number {
  return near * Math.pow(far / near, s / n);
}

/** `fire`: a fire's light; the air within FIRE_HALO_FALLOFF_M of it scatters at FIRE_HALO_SIGMA_PER_M. */
export interface VolumeLight { position: THREE.Vector3; radiance: THREE.Color; radiusM: number; fire?: boolean }

/** A window: light entering along `direction` through a disc of `radiusM` at `position`. */
export interface ApertureLight {
  position: THREE.Vector3; direction: THREE.Vector3; radiusM: number; lengthM: number;
  /** The beam's colour: the drawn rig's sun or moon colour x its direct share (InteriorDoors). */
  irradiance: THREE.Color;
  /** Half-angle the beam widens by (rad); default BEAM_SPREAD_RAD. */
  spreadRad?: number;
}
/** Per-cell interior profile (0112 §6). */
/** Halo dampness (fogField `halo`, 0..1) of an interior cell's air: hearth smoke, cooking steam
 * and breath in a closed room, scattering lamp and fire light like a humid night outdoors (fogField
 * reaches 0.6 at humidity ~0.75). Gives 0.012 /m with LAMP_HALO high's 0.02 /m floor. */
export const INTERIOR_HALO_DAMP = 0.6;
export interface InteriorFogProfile { floorY: number; floorMistTopM: number; floorMistDensity: number; dustDensity: number }

export interface VolumetricsFrame {
  camera: THREE.PerspectiveCamera;
  /** Real seconds, unwrapped (the studio's water transport clock): drives steam rise, motes, floor mist. */
  timeS: number;
  /** Real seconds since the last update; the fog drift integrates it. Absent: timeS's step (0..600 s). */
  deltaS?: number;
  /** Unit vector toward the sun (or moon). */
  sunDir: THREE.Vector3;
  /** Sun irradiance at the ground, the directional light's colour × intensity. */
  sunIrradiance: THREE.Color;
  /** Sky irradiance on a horizontal plane (the hemisphere light's colour × intensity: three.js
   * treats that product as irradiance, its Lambert BRDF divides by π). */
  skyIrradiance: THREE.Color;
  fog?: FogFieldInput;
  regimes?: FogRegimes;
  lights?: readonly VolumeLight[];
  apertures?: readonly ApertureLight[];
  interior?: InteriorFogProfile | null;
  /** The cap-cloud belt in runtime metres (world-weather WHITEOUT_BELT x vertical scale); absent: no cap cloud. */
  capBelt?: { centreM: number; sigmaBelowM: number; sigmaAboveM: number };
  /** Radiation mist depth over the basin floor at dawn (m; the regimes' mistDepthScale sinks it as the
   * sun climbs). The studio passes 6 (scale height 1.2 m); absent: 30. */
  mistDepthM?: number;
}

export interface VolumetricsDeps {
  renderer: WebGPURenderer;
  backend: "webgpu" | "webgl";
  terrain: TerrainSamplers;
  crowns: (x: number, z: number, radiusM: number) => Iterable<Crown>;
  /** The renderer's volumetric tier (bandGovernor): picks the band rows and the fog shape's texels
   * (128^3 8 MiB, mobile 64^3 1 MiB). Default high. */
  tier?: VolumetricTier;
}

/** An rgba8 repeat-wrapped linear 3-D noise texture (fogNoise bakes). */
function makeNoise3(data: Uint8Array, n: number, name: string): THREE.Data3DTexture {
  const t = new THREE.Data3DTexture(data, n, n, n);
  t.name = name;
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

function makeGrid(g: readonly [number, number, number], name: string): Storage3DTexture {
  const t = new Storage3DTexture(g[0], g[1], g[2]);
  t.name = name;
  t.format = THREE.RGBAFormat;
  t.type = THREE.HalfFloatType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  return t;
}

/** A 1³ texture the fog stage samples while no band is on (transmittance 1, no in-scatter). */
function makeClear(): THREE.Data3DTexture {
  const t = new THREE.Data3DTexture(new Float32Array([0, 0, 0, 1]), 1, 1, 1);
  t.format = THREE.RGBAFormat; t.type = THREE.FloatType;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Band-relative `uvw` (0..1 over a `g`-texel grid) to the `MAX_GRID` texture the band fills the low
 * corner of; clamped half a texel in, so linear filtering never reads texels outside the band.
 */
function subUvw(uvw: TslNode, g: TslNode): TslNode {
  return clamp(uvw.mul(g), vec3(0.5), g.sub(0.5)).div(vec3(MAX_GRID[0], MAX_GRID[1], MAX_GRID[2]));
}

const hg = (g: number, c: TslNode) =>
  float((1 - g * g) / (4 * Math.PI)).div(pow(max(float(1 + g * g).sub(c.mul(2 * g)), float(1e-4)), float(1.5)));

/** Copy `src` into `dst` when both components are finite; returns whether it did. */
function copyFinite(dst: THREE.Vector2, src: THREE.Vector2): boolean {
  if (!Number.isFinite(src.x) || !Number.isFinite(src.y)) return false;
  dst.copy(src);
  return true;
}

export class Volumetrics implements VolumetricsSampler {
  band: VolumetricBand = "off";
  readonly grids: TerrainGrids;
  readonly canopy: CanopyMap;
  /** The fog's own noise (fogNoise): shape 128^3 (or 64^3) baked over the first frames into this same
   * texture (FogShapeBake), and warp 32^3 baked at construction (~15 ms). */
  private readonly fogShape: THREE.Data3DTexture;
  private readonly shapeBake: FogShapeBake | null;
  private readonly tier: VolumetricTier;
  private readonly fogWarp: THREE.Data3DTexture;
  /** The fog field's clock and drift (integrated offsets, morph, eased coverage). */
  readonly drift = new FogDrift();
  private readonly regimes: FogRegimes = { radiationMist: 0, steamFog: 0, marshFog: 0, seaFog: 0, canopyHaze: 0, air: 1, halo: 0, windXZ: [0, 0] };
  private readonly coverTarget = new Float64Array(5);
  private lastTimeS = Number.NaN;
  private readonly clear = makeClear();
  /**
   * The four grids, allocated once at `MAX_GRID` (WebGPU only) and destroyed only by `dispose`: a
   * band fills the low corner of each and samples it through `subUvw`. Bind groups sample these, and
   * three clears a bind group when its texture is destroyed, so a band step that freed them left
   * live materials sampling a destroyed texture (walk 10, "es-vol-integrated"). Texture identity
   * never changes: a band step sets uniforms and picks that band's kernels (built once, cached).
   */
  private readonly scatter: readonly [Storage3DTexture, Storage3DTexture] | null;
  private readonly integ: Storage3DTexture | null;
  private readonly blurred: Storage3DTexture | null;
  private readonly kernelsByBand = new Map<VolumetricBand, { inject: [TslNode, TslNode]; blur: [TslNode, TslNode]; integrate: TslNode }>();
  private kernels: { inject: [TslNode, TslNode]; blur: [TslNode, TslNode]; integrate: TslNode } | null = null;
  private parity = 0;
  private frameIndex = 0;
  private readonly prevViewProj = new THREE.Matrix4();
  private readonly _vp = new THREE.Matrix4();
  private hasHistory = false;
  /** Last dispatch sizes (invocations) for probes: inject, integrate. */
  readonly dispatch = { inject: 0, integrate: 0 };

  readonly on = uniform(0);
  readonly near = uniform(FROXEL_NEAR_M);
  readonly far = uniform(400);
  /** Grid dimensions (x, y, slices) of the current band, for the fog stage's per-pixel jitter. */
  readonly gridSize = uniform(new THREE.Vector3(1, 1, 1));
  private readonly u = {
    camPos: uniform(new THREE.Vector3()), camRight: uniform(new THREE.Vector3()), camUp: uniform(new THREE.Vector3()),
    camFwd: uniform(new THREE.Vector3()), tanHalf: uniform(new THREE.Vector2(1, 1)), jitter: uniform(0), jitterXY: uniform(new THREE.Vector2()), time: uniform(0),
    prevViewProj: uniform(new THREE.Matrix4()), history: uniform(0),
    sunDir: uniform(new THREE.Vector3(0, 1, 0)), sunIrr: uniform(new THREE.Color(0, 0, 0)), skyIrr: uniform(new THREE.Color(0, 0, 0)),
    canopyHaze: uniform(0), air: uniform(1), haloSigma: uniform(0), haloViewM: uniform(0),
    mistDepth: uniform(30), mistHeightScale: uniform(1), mistBurn: uniform(0), wetHaze: uniform(0), capCover: uniform(0), capBelt: uniform(new THREE.Vector3(470, 150, 55)),
    // fog drift (FogDrift uploads, 0..1 texture units): per-octave and per-warp offsets, morph, coverage
    off: [0, 1, 2, 3].map(() => uniform(new THREE.Vector3())), warpOff: [0, 1].map(() => uniform(new THREE.Vector3())),
    phiA: uniform(0), phiB: uniform(0), wfade: uniform(0.5), slow: uniform(0.5),
    /** Eased coverage: x radiation mist, y steam, z marsh, w sea. */
    cover: uniform(new THREE.Vector4()),
    steamOff: uniform(new THREE.Vector3()), wispOff: uniform(new THREE.Vector3()),
    nearOrigin: uniform(new THREE.Vector2()), farOrigin: uniform(new THREE.Vector2()), canopyOrigin: uniform(new THREE.Vector2()),
    floorY: uniform(0), floorTop: uniform(0), floorMist: uniform(0), dust: uniform(0), outdoor: uniform(1),
    lightCount: uniform(0, "int"), apertureCount: uniform(0, "int"),
    /** The band's per-pixel march steps (uniform loop bounds: a band step recompiles no material). */
    moteSteps: uniform(0, "int"), shaftSteps: uniform(12, "int"),
  };
  private readonly lightPos = Array.from({ length: MAX_VOLUME_LIGHTS }, () => new THREE.Vector4());
  private readonly lightCol = Array.from({ length: MAX_VOLUME_LIGHTS }, () => new THREE.Vector4());
  private readonly apPos = Array.from({ length: MAX_APERTURES }, () => new THREE.Vector4());
  private readonly apDir = Array.from({ length: MAX_APERTURES }, () => new THREE.Vector4());
  private readonly apCol = Array.from({ length: MAX_APERTURES }, () => new THREE.Vector4());
  /** The nearest point lights (xyz, reach) and radiance, read by the fog stage's analytic airlight. */
  readonly halo: NonNullable<VolumetricsSampler["halo"]>;
  /** The tier's lamp-halo row (volumetricNodes `lampHalo`). */
  private readonly haloRow: ReturnType<typeof lampHalo>;
  readonly lights = { pos: uniformArray(this.lightPos, "vec4"), col: uniformArray(this.lightCol, "vec4"), count: this.u.lightCount, max: MAX_VOLUME_LIGHTS };
  private readonly uApPos = uniformArray(this.apPos, "vec4");
  private readonly uApDir = uniformArray(this.apDir, "vec4");
  private readonly uApCol = uniformArray(this.apCol, "vec4");
  private readonly order: number[] = [];

  constructor(private readonly deps: VolumetricsDeps) {
    this.grids = new TerrainGrids(deps.terrain);
    this.canopy = new CanopyMap(deps.crowns);
    const gpu = deps.backend === "webgpu";
    this.tier = deps.tier ?? "high";
    this.haloRow = lampHalo(this.tier);
    this.u.haloViewM.value = this.haloRow.viewM;
    this.halo = { sigmaFloor: this.u.haloSigma, viewM: this.u.haloViewM, minReachM: this.haloRow.minReachM };
    const n = gpu ? VOLUMETRIC_BANDS[this.tier].fog.shapeTexels : 1;
    this.shapeBake = gpu ? new FogShapeBake(n) : null;
    this.fogShape = makeNoise3(this.shapeBake?.data ?? new Uint8Array(4), n, "es-vol-fog-shape");
    this.fogWarp = makeNoise3(gpu ? bakeFogWarp() : new Uint8Array(4), gpu ? FOG_NOISE.warpTexels : 1, "es-vol-fog-warp");
    this.scatter = gpu ? [makeGrid(MAX_GRID, "es-vol-scatter-a"), makeGrid(MAX_GRID, "es-vol-scatter-b")] : null;
    this.integ = gpu ? makeGrid(MAX_GRID, "es-vol-integrated") : null;
    this.blurred = gpu ? makeGrid(MAX_GRID, "es-vol-scatter-blurred") : null;
  }

  /** The fog shape texture (constant for the object's life, also across its bake). */
  get fogShapeTexture(): THREE.Data3DTexture { return this.fogShape; }

  /** Advance the fog shape's bake by `slices` channel slices; on completion re-upload the same texture. */
  stepShapeBake(slices?: number): void {
    if (this.shapeBake && !this.shapeBake.done && this.shapeBake.step(slices)) this.fogShape.needsUpdate = true;
  }

  /** The textures the grids live in, for tests and probes (constant for the object's life). */
  get textures(): readonly (Storage3DTexture | null)[] {
    return [this.scatter?.[0] ?? null, this.scatter?.[1] ?? null, this.integ, this.blurred];
  }

  /** The integrated grid at band-relative `uvw` (0..1 over the band's grid); clear (rgb 0, a 1) while off. */
  sampleIntegrated(uvw: TslNode): TslNode {
    if (!this.integ) return texture3D(this.clear, uvw, 0);
    return mix(vec4(0, 0, 0, 1), texture3D(this.integ, subUvw(uvw, this.gridSize), 0), this.on);
  }

  /** Dev probe (vol10 diag7): the medium's state for a capture to confirm each fog row. Called on
   * demand (never per frame): eased cover (x mist, y steam, z marsh, w sea, canopy haze), the last
   * regimes, halo sigma, the share of canopy-map texels with r > 0.4 within 100 m of `at`, and per
   * term (fogTermsAt, shape noise at its median) the density at 0/2/10 m over the surface at `at`
   * with the grid values it read (ground, basin floor, water height and mask, moisture, sea). */
  debugProbe(at: { x: number; z: number }): {
    band: VolumetricBand; cover: number[]; capCover: number; mistDepthM: number; mistBurn: number; wetHaze: number;
    regimes: FogRegimes; haloSigma: number; canopyCover100m: number;
    grid: { ground: number; floor: number; waterH: number; waterMask: number; moist: number; sea: number; under: number } | null;
    densityAt: { hM: number; total: number; mist: number; marsh: number; sea: number; wet: number; canopy: number; cap: number }[];
  } {
    const texel = (g: { data: Float32Array; origin: THREE.Vector2; sizeM: number }, ch: number, texels: number): number => {
      const i = Math.floor(((at.x - g.origin.x) / g.sizeM) * texels), j = Math.floor(((at.z - g.origin.y) / g.sizeM) * texels);
      if (!(i >= 0 && j >= 0 && i < texels && j < texels)) return Number.NaN;
      return g.data[(j * texels + i) * 4 + ch];
    };
    const near = this.grids.near, far = this.grids.far;
    const cmap = { data: this.canopy.data, origin: this.canopy.origin, sizeM: CANOPY_SIZE_M };
    const inNear = Number.isFinite(texel(near, 0, GRID_TEXELS));
    const ground = inNear ? texel(near, 0, GRID_TEXELS) : texel(far, 0, GRID_TEXELS);
    const grid = Number.isFinite(ground) ? {
      ground, floor: texel(far, 1, GRID_TEXELS), waterH: inNear ? texel(near, 1, GRID_TEXELS) : ground,
      waterMask: inNear ? texel(near, 2, GRID_TEXELS) : 0,
      moist: Math.min(1, Math.max(0, inNear ? Math.max(texel(near, 3, GRID_TEXELS), texel(near, 2, GRID_TEXELS), texel(far, 2, GRID_TEXELS))
        : Math.max(texel(far, 3, GRID_TEXELS), texel(far, 2, GRID_TEXELS)))),
      sea: texel(far, 2, GRID_TEXELS),
      under: canopyUnder(texel(cmap, 0, CANOPY_TEXELS) || 0, texel(cmap, 2, CANOPY_TEXELS) || 0, ground),
    } : null;
    const densityAt: { hM: number; total: number; mist: number; marsh: number; sea: number; wet: number; canopy: number; cap: number }[] = [];
    if (grid) {
      const surf = grid.waterMask > 0 ? Math.max(grid.ground, grid.waterH) : grid.ground;
      const c4 = this.u.cover.value, cv = [c4.x, c4.y, c4.z, c4.w], cb = this.u.capBelt.value;
      for (const hM of [0, 2, 10]) {
        const t = fogTermsAt({
          y: surf + hM, ...grid, distM: 0, cover: cv, canopyHaze: this.u.canopyHaze.value, noise: 0.5, noiseLow: 0.5,
          mistDepth: this.u.mistDepth.value, mistHeightScale: this.u.mistHeightScale.value, mistBurn: this.u.mistBurn.value,
          wetHaze: this.u.wetHaze.value, sunY: this.u.sunDir.value.y,
          capBelt: [cb.x, cb.y, cb.z], capCover: this.u.capCover.value,
        }, { mist: 0, marsh: 0, sea: 0, wet: 0, canopy: 0, cap: 0 });
        densityAt.push({ hM, total: t.mist + t.marsh + t.sea + t.wet + t.canopy + t.cap, ...t });
      }
    }
    const u = this.u, c = u.cover.value;
    const d = this.canopy.data, o = this.canopy.origin, k = CANOPY_TEXELS / CANOPY_SIZE_M;
    let n = 0, hit = 0;
    for (let j = 0; j < CANOPY_TEXELS; j++) for (let i = 0; i < CANOPY_TEXELS; i++) {
      const x = o.x + (i + 0.5) / k - at.x, z = o.y + (j + 0.5) / k - at.z;
      if (x * x + z * z > 100 * 100) continue;
      n++; if (d[(j * CANOPY_TEXELS + i) * 4] > 0.4) hit++;
    }
    return {
      band: this.band, cover: [c.x, c.y, c.z, c.w, u.canopyHaze.value], capCover: u.capCover.value,
      mistDepthM: u.mistDepth.value, mistBurn: u.mistBurn.value, wetHaze: u.wetHaze.value,
      regimes: { ...this.regimes, windXZ: [this.regimes.windXZ[0], this.regimes.windXZ[1]] },
      haloSigma: u.haloSigma.value, canopyCover100m: n ? hit / n : 0, grid, densityAt,
    };
  }

  setBand(band: VolumetricBand): void {
    if (this.deps.backend !== "webgpu") band = "off";
    if (band === this.band) return;
    this.band = band;
    this.hasHistory = false;
    if (band === "off") {
      this.on.value = 0;
      this.dispatch.inject = 0; this.dispatch.integrate = 0;
      return;
    }
    const spec = bandSpec(band, this.tier);
    this.u.moteSteps.value = spec.moteSteps;
    this.u.shaftSteps.value = spec.shaftSteps;
    this.far.value = spec.farM;
    this.gridSize.value.set(spec.grid[0], spec.grid[1], spec.grid[2]);
    let k = this.kernelsByBand.get(band);
    if (!k) {
      const [a, b] = this.scatter!;
      k = {
        inject: [this.injectKernel(spec, a, b), this.injectKernel(spec, b, a)],
        blur: [this.blurKernel(spec, a), this.blurKernel(spec, b)],
        integrate: this.integrateKernel(spec, this.blurred!),
      };
      this.kernelsByBand.set(band, k);
    }
    this.kernels = k;
    this.dispatch.inject = spec.grid[0] * spec.grid[1] * spec.grid[2];
    this.dispatch.integrate = spec.grid[0] * spec.grid[1];
    this.on.value = 1;
  }

  /**
   * The fog shape at world `p` (TSL), 0..1: the band's octave sum of the fog's own noise (fogNoise
   * fogShapeNoise is the CPU twin), domain-warped, contrast-stretched about 0.5. `.x` the shape, `.y` the
   * spatial coverage noise (warp a), `.z` the same stretch over the lowest octave only (125 m features) (the layer
   * tops' relief; fogShapeNoise outA[1]). Sampled at world p only; the 4th octave fades to its mean beyond
   * FOG_NOISE.fineFadeM of the eye (level of detail, the mean density does not move).
   */
  private fogShapeAt(p: TslNode, spec: BandSpec): TslNode {
    const u = this.u;
    const rot = (v: TslNode, a: number) => {
      const c = Math.cos(a), s = Math.sin(a);
      return vec3(v.x.mul(c).sub(v.z.mul(s)), v.y, v.x.mul(s).add(v.z.mul(c)));
    };
    let q: TslNode = p;
    let cov: TslNode = float(0.5);
    for (let k = 0; k < spec.fog.warps; k++) {
      const L = FOG_NOISE.warp[k].tileM;
      const w = texture3D(this.fogWarp, rot(p, (k + 0.5) * FOG_NOISE.rotationRad).div(L).sub(u.warpOff[k]), 0);
      q = q.add(w.xyz.sub(0.5).mul(2 * FOG_NOISE.warp[k].ampM));
      if (k === 0) cov = w.w;
    }
    let sum: TslNode = float(0), low: TslNode = float(0);
    let wsum = 0, wlow = 0;
    for (let k = 0; k < spec.fog.octaves; k++) {
      const o = FOG_NOISE.octaves[k];
      const uvw = rot(q, k * FOG_NOISE.rotationRad).div(vec3(o.tileXZ, o.tileY, o.tileXZ)).sub(u.off[k]);
      let sv: TslNode;
      if (k < 2) {
        const sA = texture3D(this.fogShape, uvw.add(vec3(u.phiA, 0, 0)), 0).x;
        const sB = texture3D(this.fogShape, uvw.add(vec3(0, u.phiB, 0)), 0).y;
        sv = mix(sA, sB, u.wfade);
      } else {
        sv = texture3D(this.fogShape, uvw, 0).z;
        if (k === 3) {
          const fine = float(1).sub(smoothstep(FOG_NOISE.fineFadeM[0], FOG_NOISE.fineFadeM[1], length(p.sub(u.camPos))));
          sv = mix(float(0.5), sv, fine);
        }
      }
      sum = sum.add(sv.mul(o.weight));
      wsum += o.weight;
      if (k === 0) { low = low.add(sv.mul(o.weight)); wlow += o.weight; }
    }
    const stretch = (v: TslNode) => clamp(v.sub(0.5).mul(FOG_NOISE.contrast).add(0.5), 0, 1);
    return vec3(stretch(sum.div(wsum)), cov, wlow > 0 ? stretch(low.div(wlow)) : float(0.5));
  }

  /** Burn-off (fogNoise burnOff): the share of shape `n` left under coverage `c`, the spatial term `cov`
   * and the slow day term moving c by up to +-FOG_NOISE.coverage.spatialShare. */
  private burn(n: TslNode, c: TslNode, cov: TslNode, rim: TslNode = float(0)): TslNode {
    const share = FOG_NOISE.coverage.spatialShare;
    const cp = clamp(c.mul(float(1).add(cov.sub(0.5).add(this.u.slow.sub(0.5)).mul(share))), 0, 1);
    return max(n.sub(float(1).sub(cp).add(rim)), float(0)).div(max(cp, float(0.05)));
  }

  /** Density (m^-1) of the medium at world `p` (TSL); `fp` is the froxel's depth extent in metres,
   * which widens every hard transition to at least a froxel so the grid never stair-steps (prefilter). */
  private density(p: TslNode, spec: BandSpec, fp: TslNode = float(0)): TslNode {
    const u = this.u;
    const nuv = p.xz.sub(u.nearOrigin).div(NEAR_SIZE_M);
    const fuv = p.xz.sub(u.farOrigin).div(FAR_SIZE_M);
    const nearT = texture(this.grids.near.texture, nuv);
    const farT = texture(this.grids.far.texture, fuv);
    const inNear = smoothstep(0, 0.06, min(min(nuv.x, nuv.y), min(float(1).sub(nuv.x), float(1).sub(nuv.y))));
    const ground = mix(farT.r, nearT.r, inNear);
    const hAG = p.y.sub(ground);
    const waterMask = nearT.b.mul(inNear);
    // ground moisture: wet ground, standing water (near b, far a) and the sea (far b), 0..1, squared: mist
    // and marsh fog pool over water and wet basins and thin over dry slopes (fogField moistureWeight)
    const moist = clamp(mix(max(farT.a, farT.b), max(max(nearT.a, nearT.b), farT.b), inNear), 0, 1);
    const moistW = float(MOISTURE_FLOOR).add(float(1 - MOISTURE_FLOOR).mul(moist.mul(moist)));
    const soft = (w: number) => max(float(w), fp.mul(0.6));
    const shape = this.fogShapeAt(p, spec);
    const n = shape.x, cov = shape.y;
    const nc = n.sub(0.5);
    // layer tops: relief from the lowest octave only (125 m features), which survives the
    // slice averaging that flattens the fine octaves past ~50 m (vol10 diag9 S4)
    const relief = shape.z.sub(0.5).mul(2 * FOG_TERMS.topReliefM);
    const outdoor = u.outdoor;
    // radiation mist: pools over the basin floor, falling exponentially with height above it
    // (fogField mistHeightProfile), faded to zero by a top billowed by the shape; ground above the floor
    // (slopes, rims) sits higher in the profile and carries less; the lateral edge fades over the last 6 m.
    const top = farT.g.add(u.mistDepth).add(relief);
    const depth = max(top.sub(farT.g), float(1));
    const hF = max(p.y.sub(farT.g), float(0));
    const mist = exp(hF.div(depth.mul(MIST_SCALE_SHARE).mul(max(u.mistHeightScale, float(1e-3)))).negate())
      .mul(float(1).sub(smoothstep(top.sub(max(depth.mul(MIST_FADE_SHARE), soft(1.5))), top, p.y)))
      .mul(smoothstep(-1, 1, hAG)).mul(smoothstep(0, 6, top.sub(ground)))
      // integrated only out to mistFarCapM: a grazing ray in the thin layer never saturates to a white band
      .mul(float(1).sub(smoothstep(0.75 * FOG_TERMS.mistFarCapM, FOG_TERMS.mistFarCapM, length(p.xz.sub(u.camPos.xz)))))
      // the sun clears rims, dry land and shores first, water last: the burn threshold rises with height
      // above the basin floor and with dryness (fogTermsAt mistRim)
      .mul(this.burn(n, u.cover.x, cov, ground.sub(farT.g).div(depth).mul(0.5).add(float(1).sub(moist)).mul(u.mistBurn)))
      .mul(moistW).mul(FOG_TERMS.mistPeakPerM);
    // steam fog: wisps over water, thin rising columns, patchy (~half covered), each column fading with
    // height at its own 1..5 m; its own drift and rise (FogDrift steam/wisp offsets)
    const signed = (v: TslNode) => v.sub(0.5).mul(3.2);
    const ns = signed(texture3D(this.fogShape, p.div(vec3(...FOG_NOISE.steam.tile)).sub(u.steamOff), 0).z);
    const nh = signed(texture3D(this.fogShape, p.div(vec3(...FOG_NOISE.wisp.tile)).sub(u.wispOff), 0).w);
    const overW = p.y.sub(nearT.g);
    const colTop = float(1).add(ns.mul(3)).add(nh);
    const steam = waterMask.mul(float(1).sub(smoothstep(colTop.mul(0.3), colTop, overW))).mul(smoothstep(-0.3, 0.1, overW))
      .mul(smoothstep(0.55, 0.8, ns.add(nh.mul(0.5)))).mul(u.cover.y).mul(0.12);
    // marsh ground fog: knee-to-waist over wet ground and standing water (measured from the water surface
    // there), pooling in low ground (within 12 m of the basin floor); the top torn by the shape into
    // mounds and gaps, density falling linearly with height to that top
    const surf = mix(ground, max(ground, nearT.g), waterMask);
    const hAS = p.y.sub(surf);
    const low = float(1).sub(smoothstep(2, 12, ground.sub(farT.g)));
    // top 2.5 m + the low-octave relief (+-topReliefM, several froxel rows at 100 m), plus a 0.3x skirt over water
    // falling at a 2 m scale height to 6 m so the bank reads past 50 m (vol10 diag7 O2)
    const marshTop = float(FOG_TERMS.marshTopM).add(relief);
    const marshFall = clamp(float(1).sub(hAS.div(max(marshTop, float(0.2)))), 0, 1);
    const skirt = waterMask.mul(exp(max(hAS, float(0)).div(-2))).mul(float(1).sub(smoothstep(4, 6, hAS))).mul(0.3);
    const marsh = moist.mul(low).mul(max(marshFall, skirt)).mul(smoothstep(float(0).sub(soft(0.3)), float(0), hAS))
      .mul(this.burn(n, u.cover.z, cov, float(1).sub(waterMask).mul(u.mistBurn).mul(0.5))).mul(FOG_TERMS.marshPeakPerM);
    // sea fog: a bank over the sea with a top ~20 m billowed +-6 m by the shape, faded over its last 6 m
    const seaTop = float(FOG_TERMS.seaTopM).add(nc.mul(12));
    const sea = farT.b.mul(float(1).sub(smoothstep(seaTop.sub(FOG_TERMS.seaFadeM), seaTop, p.y)))
      .mul(this.burn(n, u.cover.w, cov)).mul(FOG_TERMS.seaPeakPerM);
    // cap cloud: where the ground rises into the belt (high ground; the far grid has no spare channel
    // for the climate vis raster), a bell on height about the belt centre, torn by the same shape
    // (no extra noise taps); 0.02 /m at full cover (vol10 diag7 O8)
    const bc = u.capBelt.x, by = p.y.sub(bc);
    const bs = mix(u.capBelt.y, u.capBelt.z, step(float(0), by));
    const bz = by.div(bs);
    const cap = smoothstep(bc.sub(u.capBelt.y.mul(2)), bc, ground).mul(exp(bz.mul(bz).mul(-0.5)))
      .mul(this.burn(n, u.capCover, cov)).mul(FOG_TERMS.capPeakPerM);
    const cuv = p.xz.sub(u.canopyOrigin).div(CANOPY_SIZE_M);
    const cs = texture(this.canopy.texture, cuv);
    const under = smoothstep(0, 0.05, cs.r).mul(smoothstep(0, 0.3, cs.b.sub(ground)));
    // canopy haze: humid air under the crowns (0112 §5); once the sun is above ~15 deg the sunlit dust
    // value, so shafts have a medium at midday (vol10 diag8 O-2)
    const canopyK = mix(float(FOG_TERMS.canopyHazePerM), float(FOG_TERMS.canopyDustPerM),
      smoothstep(FOG_TERMS.canopyDustSunY[0], FOG_TERMS.canopyDustSunY[1], u.sunDir.y));
    const haze = under.mul(float(1).sub(smoothstep(0, 25, hAG))).mul(u.canopyHaze).mul(canopyK).mul(n.mul(0.5).add(0.5));
    const air = this.airDensity(p).add(exp(max(hAG, float(0)).div(-WET_HAZE_SCALE_M)).mul(u.wetHaze).mul(FOG_TERMS.wetHazePerM));
    const outside = mist.add(steam).add(marsh).add(sea).add(haze).add(cap).mul(outdoor);
    // interior floor mist: 0..top, two octaves swirling in opposite directions, curling top
    const sw = vec3(u.time.mul(0.25), 0, u.time.mul(0.1));
    const f1 = signed(texture3D(this.fogShape, p.add(sw).div(vec3(6, 2.4, 6)).add(vec3(0, u.time.mul(0.01), 0)), 0).z);
    const f2 = signed(texture3D(this.fogShape, p.sub(sw.mul(1.6).zyx).div(vec3(2.2, 1.2, 2.2)), 0).w);
    const fTop = u.floorTop.add(f1.mul(0.35)).add(f2.mul(0.15));
    const floor = float(1).sub(smoothstep(fTop.sub(0.5), fTop, p.y))
      .mul(smoothstep(u.floorY.sub(0.1), u.floorY.add(0.05), p.y))
      .mul(clamp(float(0.7).add(f1.mul(0.5)).add(f2.mul(0.3)), 0.1, 1.5)).mul(u.floorMist);
    return outside.add(air).add(floor).add(u.dust);
  }

  /** Per-pixel in-scatter the grid cannot hold (VolumetricsSampler.extra): canopy shafts marched at
   * 8 steps over the first 40 m (full canopy sharpness, the grid holds the soft remainder) and sparse
   * dust motes lit inside each window beam. */
  extra(dir: TslNode, segLen: TslNode, sigma: TslNode): TslNode {
    const u = this.u;
    const cam = u.camPos;
    const acc = vec3(0).toVar();
    // shafts: the sun's in-scatter under the crowns out to SHAFT_NEAR_M, marched per pixel at full canopy
    // sharpness. The grid leaves this share out (shaftNear), so the march REPLACES the grid's sun term
    // there and blends into it over the far edge: gaps between beams stay dark, crowns are not brightened.
    If(u.outdoor.mul(step(float(0), u.sunDir.y)).greaterThan(0), () => {
      const span = min(segLen, SHAFT_NEAR_M);
      const dt = span.div(float(u.shaftSteps));
      const ph = sunPhase(dot(dir, u.sunDir), u.sunDir.y);
      Loop(u.shaftSteps, ({ i: k }: { i: TslNode }) => {
        const t = dt.mul(float(k).add(0.5));
        const p = cam.add(dir.mul(t));
        const w = this.shaftNear(p, t);
        acc.addAssign(vec3(u.sunIrr).mul(ph).mul(this.gridDensity(p)).mul(w).mul(this.canopyT(p))
          .mul(dt).mul(exp(sigma.mul(t).negate())).mul(ALBEDO));
      });
    });
    // motes: hashed points on a 0.3 m lattice, ~1 in 8 cells kept (~4.6 /m^3), lit only inside a beam,
    // drifting and twinkling slowly: an additive sparkle over the beam the grid draws (no extinction)
    Loop(u.apertureCount, ({ i }: { i: TslNode }) => {
      const span = min(segLen, 10);
      const dt = span.div(float(max(u.moteSteps, int(1))));
      Loop(u.moteSteps, ({ i: k }: { i: TslNode }) => {
        const p = cam.add(dir.mul(dt.mul(float(k).add(0.5))));
        const cell = floor(p.div(0.3));
        const hsh = (o: number[]) => fract(sin(dot(cell, vec3(o[0], o[1], o[2]))).mul(43758.5453));
        const hx = hsh([127.1, 311.7, 74.7]), hy = hsh([269.5, 183.3, 246.1]), hz = hsh([113.5, 271.9, 124.6]), keep = hsh([419.2, 371.9, 157.3]);
        const drift = vec3(sin(u.time.mul(0.2).add(hx.mul(6.28))), cos(u.time.mul(0.17).add(hy.mul(6.28))), sin(u.time.mul(0.23).add(hz.mul(6.28)))).mul(0.06);
        const m = cell.add(vec3(hx, hy, hz).mul(0.7).add(0.15)).mul(0.3).add(drift);
        const rel = m.sub(cam);
        const along = dot(rel, dir);
        const off = length(rel.sub(dir.mul(along)));
        const size = max(along.mul(0.0035), float(0.004));
        const disc = float(1).sub(smoothstep(size.mul(0.4), size, off)).mul(step(float(0), along)).mul(step(along, segLen));
        const inBeam = this.beamMask(m, i, float(0.05));
        const twinkle = float(0.55).add(sin(u.time.mul(0.9).add(keep.mul(40))).mul(0.45));
        acc.addAssign(this.uApCol.element(i).xyz.mul(disc.mul(inBeam).mul(step(0.875, keep)).mul(twinkle).mul(0.5)));
      });
    });
    return acc;
  }

  /**
   * Extinction (m^-1) at world `p` read back from the integrated grid: the drop in its transmittance over
   * one slice around p's view depth. The per-pixel shaft march reads this, not `density()`: density()
   * samples the terrain grids and the noise volume, and everything the apply stage samples is bound by
   * EVERY fogged material, which pushed the water and ground past WebGPU's 16 textures per stage (0111
   * §2); it also cost ~100 texture reads per pixel. The grid's own value is the same field at froxel
   * resolution, which the shafts' 40 m reach resolves (the crowns' sharpness comes from canopyT).
   */
  private gridDensity(p: TslNode): TslNode {
    const u = this.u;
    const rel = p.sub(u.camPos);
    const z = max(dot(rel, u.camFwd), this.near);
    const g = this.gridUvw(p);
    const uv = g.xy;
    const lnRatio = log(this.far.div(this.near));
    const half = float(0.5).div(this.gridSize.z);
    const s = g.z;
    const s0 = clamp(s.sub(half), 0, 1), s1 = clamp(s.add(half), 0, 1);
    const t0 = this.sampleIntegrated(vec3(uv, s0)).a, t1 = this.sampleIntegrated(vec3(uv, s1)).a;
    // texel i holds the transmittance at the END of slice i: the depths are half a slice on
    const d0 = this.near.mul(exp(s0.add(half).mul(lnRatio))), d1 = this.near.mul(exp(s1.add(half).mul(lnRatio)));
    const ds = d1.sub(d0).mul(length(rel).div(z));
    return max(log(max(t0, float(1e-4))).sub(log(max(t1, float(1e-4)))), float(0)).div(max(ds, float(1e-3)));
  }

  /** Grid coordinates (uv, slice 0..1) of world `p` in the camera basis the grid was injected with
   * (froxelUvw is the TS twin). The fog stage looks the medium up by this, never by the render camera's
   * screen position, so a grid built a frame behind a turning camera still sits on the geometry. */
  gridUvw(p: TslNode): TslNode {
    const u = this.u;
    const rel = p.sub(u.camPos);
    const z = max(dot(rel, u.camFwd), this.near);
    const ndc = vec2(dot(rel, u.camRight).div(z.mul(u.tanHalf.x)), dot(rel, u.camUp).div(z.mul(u.tanHalf.y)));
    const s = log(z.div(this.near)).div(log(this.far.div(this.near)));
    return vec3(ndc.x.mul(0.5).add(0.5), float(0.5).sub(ndc.y.mul(0.5)), s);
  }

  /** Share of the sun in-scatter at `p` (distance `t` from the eye) carried by the per-pixel shaft march
   * instead of the grid: under a crown, fading out over the last quarter of SHAFT_NEAR_M. */
  private shaftNear(p: TslNode, t: TslNode): TslNode {
    const c = texture(this.canopy.texture, p.xz.sub(this.u.canopyOrigin).div(CANOPY_SIZE_M));
    return smoothstep(0, 0.3, c.b.sub(p.y)).mul(float(1).sub(smoothstep(SHAFT_NEAR_M * 0.75, SHAFT_NEAR_M, t))).mul(this.u.outdoor);
  }

  /** Canopy transmittance of the sun ray from `p` (three samples up the ray). */
  private canopyT(p: TslNode): TslNode {
    const u = this.u;
    const trans = float(1).toVar();
    const sy = max(u.sunDir.y, 0.05);
    // 12 steps up the sun ray through the crown layer, a sharp density threshold so leaf gaps stay
    // open (distinct shafts, not a uniform dimming)
    for (const up of [1, 2.5, 4, 5.5, 7, 8.5, 10, 12, 14, 16.5, 19, 22]) {
      const h = p.y.add(up);
      const xz = p.xz.add(u.sunDir.xz.mul(float(up).div(sy)));
      const c = texture(this.canopy.texture, xz.sub(u.canopyOrigin).div(CANOPY_SIZE_M));
      const inside = step(c.g, h).mul(step(h, c.b));
      trans.mulAssign(float(1).sub(smoothstep(0.4, 0.5, c.r).mul(inside)));
    }
    return trans.mul(u.outdoor);
  }

  /** Terrain shadow on the sun at `p`: five probes up the sun ray against the ground height (terrainSun.ts
   * is the TS twin). Probes inside SUN_PROBE_NEAR_M read the near grid where it covers them, the rest the
   * far grid only. Indoors the term is 1 (the room's own geometry is not in the grids). */
  private terrainSunT(p: TslNode): TslNode {
    const u = this.u;
    const vis = float(1).toVar();
    for (const d of SUN_PROBES_M) {
      const q = p.add(u.sunDir.mul(d));
      const far = texture(this.grids.far.texture, q.xz.sub(u.farOrigin).div(FAR_SIZE_M)).r;
      let g: TslNode = far;
      if (d <= SUN_PROBE_NEAR_M) {
        const nuv = q.xz.sub(u.nearOrigin).div(NEAR_SIZE_M);
        const inNear = smoothstep(0, 0.06, min(min(nuv.x, nuv.y), min(float(1).sub(nuv.x), float(1).sub(nuv.y))));
        g = mix(far, texture(this.grids.near.texture, nuv).r, inNear);
      }
      const sft = probeSoftM(d);
      vis.mulAssign(smoothstep(-sft, sft, q.y.sub(g)));
    }
    return mix(float(1), vis, u.outdoor);
  }

  /** The air baseline's extinction (m^-1): thin haze thinning with altitude. */
  private airDensity(p: TslNode): TslNode {
    return exp(max(p.y, 0).div(-1200)).mul(this.u.air).mul(0.7e-4);
  }

  /** Share of the sky dome open above `p`: the canopy over it takes up to 93 % (shafts read by contrast). */
  private skyOpen(p: TslNode): TslNode {
    const c = texture(this.canopy.texture, p.xz.sub(this.u.canopyOrigin).div(CANOPY_SIZE_M));
    return float(1).sub(smoothstep(0, 1, c.b.sub(p.y)).mul(smoothstep(0, 0.5, c.r)).mul(0.98).mul(this.u.outdoor));
  }

  /** 0..1 inside window beam `i` at world `p` on cells of `cellM` (beamMembership is the CPU twin): a cone
   * from the aperture disc (radius ap.w) widening by apCol.w = tan(spread) per metre, its side a smoothstep
   * over +- beamEdgeM (one cell, or the penumbra, whichever is wider) flux-normalised by beamEdgeNorm, its
   * strength fading with the dust extinction along it and to 0 over its last 60 %. */
  private beamMask(p: TslNode, i: TslNode, cellM: TslNode): TslNode {
    const ap = this.uApPos.element(i);
    const ad = this.uApDir.element(i);
    const rel = p.sub(ap.xyz);
    const along = dot(rel, ad.xyz);
    const a = max(along, float(0));
    const r = ap.w.add(a.mul(this.uApCol.element(i).w));
    const w = max(cellM, a.mul(BEAM_PENUMBRA_PER_M));
    const norm = float(1).div(float(1).add(w.mul(w).div(r.mul(r).mul(3))));
    return float(1).sub(smoothstep(r.sub(w), r.add(w), length(rel.sub(ad.xyz.mul(along))))).mul(norm)
      .mul(smoothstep(float(0), cellM, along)).mul(exp(a.mul(-BEAM_DUST_PER_M)))
      .mul(float(1).sub(smoothstep(ad.w.mul(0.4), ad.w, along)));
  }

  private injectKernel(spec: BandSpec, write: Storage3DTexture, history: Storage3DTexture): TslNode {
    const [gx, gy, gz] = spec.grid;
    const u = this.u;
    return Fn(() => {
      const id = instanceIndex;
      const coord = uvec3(id.mod(gx), id.div(gx).mod(gy), id.div(gx * gy));
      const uv = vec2(float(coord.x).add(0.5).add(u.jitterXY.x).div(gx), float(coord.y).add(0.5).add(u.jitterXY.y).div(gy));
      const ndc = vec2(uv.x.mul(2).sub(1), float(1).sub(uv.y.mul(2)));
      const s = float(coord.z).add(0.5).add(u.jitter).div(gz);
      const depth = this.near.mul(pow(this.far.div(this.near), s));
      const dir = u.camRight.mul(ndc.x.mul(u.tanHalf.x)).add(u.camUp.mul(ndc.y.mul(u.tanHalf.y))).add(u.camFwd);
      const p = u.camPos.add(dir.mul(depth));
      const v = normalize(dir);
      const fp = depth.mul(Math.pow(spec.farM / FROXEL_NEAR_M, 1 / gz) - 1);
      const sigmaT = max(this.density(p, spec, fp), float(1e-7)).toVar();
      const cSun = dot(v, u.sunDir);
      const phaseSun = sunPhase(cSun, u.sunDir.y);
      const sunVis = this.terrainSunT(p);
      const skyKeep = float(1).sub(smoothstep(0, 0.05, u.sunDir.y).mul(float(1 - SHADOWED_SKY).mul(float(1).sub(sunVis))));
      // the medium's own shadow on the sun (sunInscatterGain): optical depth up the sun ray
      let sunOd: TslNode = float(0);
      SUN_OD_PROBES_M.forEach((d, k) => {
        sunOd = sunOd.add(this.density(p.add(u.sunDir.mul(d)), spec, fp).mul(SUN_OD_SPAN_M[k]));
      });
      const sunT = exp(sunOd.negate());
      const sunGain = sunT.mul(phaseSun).add(float(1).sub(sunT).mul(1 / (4 * Math.PI)));
      const radiance = vec3(u.sunIrr).mul(sunGain).mul(this.canopyT(p)).mul(sunVis).mul(step(float(0), u.sunDir.y))
        .mul(float(1).sub(this.shaftNear(p, length(dir).mul(depth))))
        .add(vec3(u.skyIrr).mul(SKY_INSCATTER).mul(this.skyOpen(p)).mul(skyKeep)).toVar();
      // point lights: analytic airlight in the apply stage (volumetricNodes), not here
      // window beams: a cone (beamMask) lit in the beam's own colour; the medium inside it is the room's
      // dust (density(), the interior record), so the beam reads as lit dust, never as an opaque column
      const beam = vec3(0).toVar();
      Loop(u.apertureCount, ({ i }: { i: TslNode }) => {
        const ad = this.uApDir.element(i);
        beam.addAssign(this.uApCol.element(i).xyz.mul(this.beamMask(p, i, fp))
          .mul(mix(float(1 / (4 * Math.PI)), hg(0.7, dot(ad.xyz, v.negate())), 0.6)));
      });
      // clear air scatters blue more than red (Rayleigh-like tint on the air share only; mist and the
      // window beam keep their own colour)
      const airShare = clamp(this.airDensity(p).div(sigmaT), 0, 1);
      const tint = mix(vec3(1), vec3(0.5, 0.78, 1.4), airShare);
      // the beam lights at least BEAM_DUST_PER_M of dust inside its cone (beamInscatterPerM is the CPU twin)
      const cur = vec4(radiance.mul(tint).mul(sigmaT).add(beam.mul(max(sigmaT, float(BEAM_DUST_PER_M)))).mul(ALBEDO), sigmaT).toVar();
      If(u.history.greaterThan(0.5), () => {
        const prev = u.prevViewProj.mul(vec4(p, 1));
        const pn = prev.xy.div(prev.w);
        const puv = vec2(pn.x.mul(0.5).add(0.5), float(0.5).sub(pn.y.mul(0.5)));
        const ps = log(max(prev.w, this.near).div(this.near)).div(log(this.far.div(this.near)));
        const inside = step(0, puv.x).mul(step(puv.x, 1)).mul(step(0, puv.y)).mul(step(puv.y, 1))
          .mul(step(0, ps)).mul(step(ps, 1)).mul(step(0, prev.w));
        const hist = texture3D(history, subUvw(vec3(puv, ps), vec3(gx, gy, gz)), 0).toVar();
        // A non-finite history texel (NaN fails every compare, Inf fails the bound)
        // would self-feed forever: keep the current sample instead (fix17).
        const mag = abs(hist.x).add(abs(hist.y)).add(abs(hist.z)).add(abs(hist.w)).add(abs(ps)).add(abs(puv.x)).add(abs(puv.y));
        If(mag.lessThan(1e30), () => {
          cur.assign(mix(cur, hist, inside.mul(HISTORY_BLEND)));
        });
      });
      textureStore(write, coord, cur).toWriteOnly();
    })().compute(gx * gy * gz).setName("volumetricsInject");
  }

  /** 3x3 tent blur of the lit scatter grid in xy (the resolve that removes the per-pixel dither grain). */
  private blurKernel(spec: BandSpec, read: Storage3DTexture): TslNode {
    const [gx, gy, gz] = spec.grid;
    const out = this.blurred as Storage3DTexture;
    return Fn(() => {
      const id = instanceIndex;
      const coord = uvec3(id.mod(gx), id.div(gx).mod(gy), id.div(gx * gy));
      const c = vec3(float(coord.x).add(0.5).div(gx), float(coord.y).add(0.5).div(gy), float(coord.z).add(0.5).div(gz));
      const acc = vec4(0).toVar();
      for (const [dx, dy, w] of [[-1, -1, 1], [0, -1, 2], [1, -1, 1], [-1, 0, 2], [0, 0, 4], [1, 0, 2], [-1, 1, 1], [0, 1, 2], [1, 1, 1]]) {
        acc.addAssign(texture3D(read, subUvw(c.add(vec3(dx / gx, dy / gy, 0)), vec3(gx, gy, gz)), 0).mul(w / 16));
      }
      textureStore(out, coord, acc).toWriteOnly();
    })().compute(gx * gy * gz).setName("volumetricsBlur");
  }

  private integrateKernel(spec: BandSpec, read: Storage3DTexture): TslNode {
    const [gx, gy, gz] = spec.grid;
    const u = this.u;
    const integ = this.integ as Storage3DTexture;
    return Fn(() => {
      const id = instanceIndex;
      const x = id.mod(gx), y = id.div(gx);
      const uv = vec2(float(x).add(0.5).div(gx), float(y).add(0.5).div(gy));
      const ndc = vec2(uv.x.mul(2).sub(1), float(1).sub(uv.y.mul(2)));
      const rayScale = length(vec3(ndc.x.mul(u.tanHalf.x), ndc.y.mul(u.tanHalf.y), 1));
      const accum = vec3(0).toVar();
      const trans = float(1).toVar();
      const ratio = this.far.div(this.near);
      Loop(gz, ({ i }: { i: TslNode }) => {
        const fi = float(i);
        const d0 = this.near.mul(pow(ratio, fi.div(gz)));
        const d1 = this.near.mul(pow(ratio, fi.add(1).div(gz)));
        const ds = d1.sub(d0).mul(rayScale);
        const sc = texture3D(read, subUvw(vec3(uv, fi.add(0.5).div(gz)), vec3(gx, gy, gz)), 0);
        const sig = max(sc.a, float(1e-7));
        const tr = exp(sig.mul(ds).negate());
        accum.addAssign(trans.mul(sc.rgb.sub(sc.rgb.mul(tr)).div(sig)));
        trans.mulAssign(tr);
        textureStore(integ, uvec3(x, y, int(i)), vec4(accum, trans)).toWriteOnly();
      });
    })().compute(gx * gy).setName("volumetricsIntegrate");
  }

  /** Per frame: the fog field, the grids, the lights, then the two compute passes. */
  update(f: VolumetricsFrame): void {
    this.stepShapeBake();
    if (this.band === "off" || !this.kernels) return;
    const u = this.u;
    const cam = f.camera;
    const spec = bandSpec(this.band, this.tier);
    this.grids.update(cam.position.x, cam.position.z);
    this.canopy.update(cam.position.x, cam.position.z);
    // The origins come from multi-frame bakes and are NaN until a bake first finishes (and again
    // after bakeAll): a uniform is copied only when finite, and the kernels wait for both terrain
    // grids (below, after the fog clock steps), the integrated grid reading clear meanwhile (walk 10 diag20 E4: farOrigin NaN in inject).
    const nearReady = copyFinite(u.nearOrigin.value, this.grids.near.origin);
    const farReady = copyFinite(u.farOrigin.value, this.grids.far.origin);
    copyFinite(u.canopyOrigin.value, this.canopy.origin);
    const sunElevationDeg = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, f.sunDir.y / (f.sunDir.length() || 1)))));
    let r: FogRegimes | null = f.regimes ?? null;
    if (!r && f.fog) r = fogRegimesInto(this.regimes, f.fog, f.fog.sunElevationDeg ?? sunElevationDeg);
    const interior = f.interior ?? null;
    u.outdoor.value = interior ? 0 : 1;
    this.stepFog(f, r);
    if (!nearReady || !farReady) { this.on.value = 0; this.hasHistory = false; return; }
    this.on.value = 1;
    u.mistDepth.value = (f.mistDepthM ?? 30) * (r?.mistDepthScale ?? 1);
    u.mistBurn.value = r?.mistBurn ?? 0; u.wetHaze.value = r?.wetHaze ?? 0;
    u.capCover.value = f.capBelt ? (r?.capCloud ?? 0) : 0;
    if (f.capBelt) u.capBelt.value.set(f.capBelt.centreM, f.capBelt.sigmaBelowM, f.capBelt.sigmaAboveM);
    // the region's radiation-mist scale height (fogField mistHeightProfile heightScale, G3 climate profile)
    u.mistHeightScale.value = r?.heightScale ?? 1;
    u.floorY.value = interior?.floorY ?? 0; u.floorTop.value = interior ? interior.floorY + interior.floorMistTopM : 0;
    u.floorMist.value = interior?.floorMistDensity ?? 0; u.dust.value = interior?.dustDensity ?? 0;
    // steam rise and motes only: real seconds folded at an hour (their textures tile far below it)
    u.time.value = f.timeS % 3600;
    u.sunDir.value.copy(f.sunDir).normalize();
    u.sunIrr.value.copy(f.sunIrradiance);
    u.skyIrr.value.copy(f.skyIrradiance);
    // camera basis
    cam.updateMatrixWorld();
    u.camPos.value.setFromMatrixPosition(cam.matrixWorld);
    u.camRight.value.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    u.camUp.value.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    u.camFwd.value.setFromMatrixColumn(cam.matrixWorld, 2).normalize().negate();
    const ty = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    u.tanHalf.value.set(ty * (Number.isFinite(cam.aspect) && cam.aspect > 0 ? cam.aspect : 1), ty);
    this.pickLights(f.lights ?? [], u.camPos.value);
    const aps = f.apertures ?? [];
    const na = Math.min(aps.length, MAX_APERTURES);
    for (let i = 0; i < na; i++) {
      const a = aps[i];
      this.apPos[i].set(a.position.x, a.position.y, a.position.z, a.radiusM);
      this.apDir[i].set(a.direction.x, a.direction.y, a.direction.z, a.lengthM);
      this.apCol[i].set(a.irradiance.r, a.irradiance.g, a.irradiance.b, Math.tan(a.spreadRad ?? BEAM_SPREAD_RAD));
    }
    u.apertureCount.value = na;
    // temporal: jitter the slice depth, blend with the reprojected history
    const temporal = spec.temporal && this.hasHistory;
    u.jitter.value = spec.temporal ? ((this.frameIndex * 0.618034) % 1) - 0.5 : 0;
    // R2 sequence for the in-slice xy jitter (a froxel's footprint is covered over ~8 frames)
    u.jitterXY.value.set(spec.temporal ? ((this.frameIndex * 0.7548777) % 1) - 0.5 : 0, spec.temporal ? ((this.frameIndex * 0.5698403) % 1) - 0.5 : 0);
    u.history.value = temporal ? 1 : 0;
    u.prevViewProj.value.copy(this.prevViewProj);
    const k = this.parity;
    this.deps.renderer.compute(this.kernels.inject[k]);
    this.deps.renderer.compute(this.kernels.blur[k]);
    this.deps.renderer.compute(this.kernels.integrate);
    this.parity = 1 - k;
    this.frameIndex++;
    // history is only kept from a finite matrix; otherwise the next frame starts fresh (fix17)
    this._vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.hasHistory = matrixFinite(this._vp);
    if (this.hasHistory) this.prevViewProj.copy(this._vp);
  }

  /** Advance the fog drift (FogDrift) by the frame's real seconds and upload its offsets, morph and
   * eased coverage. Reads only the clock, the wind and the regimes: never the camera or the player. */
  private stepFog(f: VolumetricsFrame, r: FogRegimes | null): void {
    const u = this.u;
    const dt = f.deltaS !== undefined && Number.isFinite(f.deltaS) ? f.deltaS : (Number.isFinite(this.lastTimeS) ? Math.min(600, Math.max(0, f.timeS - this.lastTimeS)) : 0);
    this.lastTimeS = f.timeS;
    const d = this.drift;
    d.step(dt, r?.windXZ[0] ?? 0, r?.windXZ[1] ?? 0, f.fog?.dayIndex ?? 0);
    const t = this.coverTarget;
    t[0] = r?.radiationMist ?? 0; t[1] = r?.steamFog ?? 0; t[2] = r?.marshFog ?? 0; t[3] = r?.seaFog ?? 0; t[4] = r?.canopyHaze ?? 0;
    d.ease(t, dt, f.fog?.minuteOfDay ?? 0, f.fog?.weatherState);
    for (let k = 0; k < 4; k++) u.off[k].value.set(d.octaveOff[3 * k], 0, d.octaveOff[3 * k + 2]);
    for (let k = 0; k < 2; k++) u.warpOff[k].value.set(d.warpOff[3 * k], 0, d.warpOff[3 * k + 2]);
    u.phiA.value = d.phiA; u.phiB.value = d.phiB; u.wfade.value = d.wfade; u.slow.value = d.slow;
    u.cover.value.set(d.cover[0], d.cover[1], d.cover[2], d.cover[3]);
    u.canopyHaze.value = d.cover[4]; u.air.value = r?.air ?? 1;
    // indoors no fog regimes arrive (InteriorDoors passes the cell profile only), so the halo
    // medium was 0 and a hearth or candle wore no glow in the air (vol10 D11): a lived-in cell's
    // air carries its hearth's smoke and steam, a damp medium at INTERIOR_HALO_DAMP
    const damp = f.interior ? Math.max(r?.halo ?? 0, INTERIOR_HALO_DAMP) : (r?.halo ?? 0);
    u.haloSigma.value = damp * this.haloRow.sigmaFloorPerM;
    u.steamOff.value.fromArray(d.steamOff); u.wispOff.value.fromArray(d.wispOff);
  }

  /** The `MAX_VOLUME_LIGHTS` lights nearest the camera (whose reach can touch the grid). */
  private pickLights(lights: readonly VolumeLight[], at: THREE.Vector3): void {
    const order = this.order;
    order.length = 0;
    for (let i = 0; i < lights.length; i++) {
      if (lights[i].position.distanceTo(at) - lights[i].radiusM < this.far.value) order.push(i);
    }
    order.sort((a, b) => lights[a].position.distanceToSquared(at) - lights[b].position.distanceToSquared(at));
    const n = Math.min(order.length, MAX_VOLUME_LIGHTS);
    for (let k = 0; k < n; k++) {
      const l = lights[order[k]];
      this.lightPos[k].set(l.position.x, l.position.y, l.position.z, l.radiusM);
      this.lightCol[k].set(l.radiance.r, l.radiance.g, l.radiance.b, l.fire ? FIRE_HALO_SIGMA_PER_M : 0);
    }
    this.u.lightCount.value = n;
  }

  dispose(): void {
    for (const t of this.textures) t?.dispose();
    this.kernels = null; this.kernelsByBand.clear();
    this.grids.dispose();
    this.canopy.dispose();
    this.fogShape.dispose();
    this.fogWarp.dispose();
    this.clear.dispose();
  }
}

