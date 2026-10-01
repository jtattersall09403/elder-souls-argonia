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
import { makeVolumeDetail } from "../../fx/fire/volumeFire";
import { fogRegimes, MOISTURE_FLOOR, type FogFieldInput, type FogRegimes } from "./fogField";
import { SHADOWED_SKY, SUN_PROBES_M, SUN_PROBE_NEAR_M, probeSoftM } from "./terrainSun";
import { TerrainGrids, NEAR_SIZE_M, FAR_SIZE_M, type TerrainSamplers } from "./terrainGrids";
import { CanopyMap, CANOPY_SIZE_M, type Crown } from "./canopyMap";
import type { VolumetricsSampler } from "./volumetricNodes";

const T = tsl as unknown as Record<string, (...a: TslNode[]) => TslNode> & Record<string, TslNode>;
const {
  Fn, If, Loop, clamp, cos, dot, exp, float, floor, fract, instanceIndex, int, length, log, max, min, mix, normalize, pow,
  sin, smoothstep, step, texture, texture3D, textureStore, uniform, uniformArray, uvec3, vec2, vec3, vec4,
} = T;

export type VolumetricBand = "off" | "low" | "medium" | "high";
export interface BandSpec { grid: readonly [number, number, number]; farM: number; temporal: boolean }
export const VOLUMETRIC_BANDS: Record<Exclude<VolumetricBand, "off">, BandSpec> = {
  low: { grid: [80, 45, 32], farM: 400, temporal: false },
  medium: { grid: [128, 72, 48], farM: 800, temporal: true },
  high: { grid: [160, 90, 64], farM: 1500, temporal: true },
};
export const FROXEL_NEAR_M = 0.5;
export const MAX_VOLUME_LIGHTS = 16;
export const MAX_APERTURES = 4;
const HISTORY_BLEND = 0.9;
const ALBEDO = 0.95;
/** Sky in-scatter per unit sky irradiance E: a uniform upper-hemisphere sky of radiance E/π seen by an
 * isotropic scatterer gives E/(2π); 0.8/π carries the ground bounce on top. Under the same sky a
 * white Lambert floor reads E/π, so thick fog settles at 0.76 of the floor's radiance, never above it. */
export const SKY_INSCATTER = 0.8 / Math.PI;
/** Range (m) over which the per-pixel shaft march carries the sun under the canopy, and its steps. */
const SHAFT_NEAR_M = 40;
const SHAFT_STEPS = 12;
/** Sun phase: strongly forward (g 0.85) over an isotropic-ish floor, the peak clamped for a grazing
 * sun (below ~8 deg), which otherwise draws one saturated column along the sun's azimuth in steam. */
function sunPhase(cSun: TslNode, sunY: TslNode): TslNode {
  return mix(hg(0.2, cSun), hg(0.85, cSun), smoothstep(0.03, 0.14, sunY).mul(0.72).add(0.03));
}

/** The band for a renderer tier (0108): WebGL is always off. */
export function volumetricBandFor(backend: "webgpu" | "webgl", tier: "low" | "medium" | "high" | "lowest"): VolumetricBand {
  if (backend !== "webgpu" || tier === "lowest") return "off";
  return tier;
}
/** One step down (the frame-budget downgrade). */
export function bandBelow(b: VolumetricBand): VolumetricBand {
  return b === "high" ? "medium" : b === "medium" ? "low" : "off";
}

/** View depth of the centre-free slice boundary `s` of `n` (exponential distribution). */
export function sliceDepth(s: number, n: number, near: number, far: number): number {
  return near * Math.pow(far / near, s / n);
}

export interface VolumeLight { position: THREE.Vector3; radiance: THREE.Color; radiusM: number }
/** A window: light entering along `direction` through a disc of `radiusM` at `position`. */
export interface ApertureLight { position: THREE.Vector3; direction: THREE.Vector3; radiusM: number; lengthM: number; irradiance: THREE.Color }
/** Per-cell interior profile (0112 §6). */
export interface InteriorFogProfile { floorY: number; floorMistTopM: number; floorMistDensity: number; dustDensity: number }

export interface VolumetricsFrame {
  camera: THREE.PerspectiveCamera;
  timeS: number;
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
  /** Radiation mist depth over the basin floor, 10..60 m. */
  mistDepthM?: number;
}

export interface VolumetricsDeps {
  renderer: WebGPURenderer;
  backend: "webgpu" | "webgl";
  terrain: TerrainSamplers;
  crowns: (x: number, z: number, radiusM: number) => Iterable<Crown>;
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

const hg = (g: number, c: TslNode) =>
  float((1 - g * g) / (4 * Math.PI)).div(pow(max(float(1 + g * g).sub(c.mul(2 * g)), float(1e-4)), float(1.5)));

export class Volumetrics implements VolumetricsSampler {
  band: VolumetricBand = "off";
  readonly grids: TerrainGrids;
  readonly canopy: CanopyMap;
  private readonly detail = makeVolumeDetail();
  private readonly clear = makeClear();
  private scatter: [Storage3DTexture, Storage3DTexture] | null = null;
  private integ: Storage3DTexture | null = null;
  private blurred: Storage3DTexture | null = null;
  private kernels: { inject: [TslNode, TslNode]; blur: [TslNode, TslNode]; integrate: TslNode } | null = null;
  private parity = 0;
  private frameIndex = 0;
  private readonly sampleNodes: TslNode[] = [];
  private readonly prevViewProj = new THREE.Matrix4();
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
    mist: uniform(0), steam: uniform(0), marsh: uniform(0), sea: uniform(0), canopyHaze: uniform(0), air: uniform(1),
    wind: uniform(new THREE.Vector2()), mistDepth: uniform(30),
    nearOrigin: uniform(new THREE.Vector2()), farOrigin: uniform(new THREE.Vector2()), canopyOrigin: uniform(new THREE.Vector2()),
    floorY: uniform(0), floorTop: uniform(0), floorMist: uniform(0), dust: uniform(0), outdoor: uniform(1),
    lightCount: uniform(0, "int"), apertureCount: uniform(0, "int"),
  };
  private readonly lightPos = Array.from({ length: MAX_VOLUME_LIGHTS }, () => new THREE.Vector4());
  private readonly lightCol = Array.from({ length: MAX_VOLUME_LIGHTS }, () => new THREE.Vector4());
  private readonly apPos = Array.from({ length: MAX_APERTURES }, () => new THREE.Vector4());
  private readonly apDir = Array.from({ length: MAX_APERTURES }, () => new THREE.Vector4());
  private readonly apCol = Array.from({ length: MAX_APERTURES }, () => new THREE.Vector4());
  /** The nearest point lights (xyz, reach) and radiance, read by the fog stage's analytic airlight. */
  readonly lights = { pos: uniformArray(this.lightPos, "vec4"), col: uniformArray(this.lightCol, "vec4"), count: this.u.lightCount, max: MAX_VOLUME_LIGHTS };
  private readonly uApPos = uniformArray(this.apPos, "vec4");
  private readonly uApDir = uniformArray(this.apDir, "vec4");
  private readonly uApCol = uniformArray(this.apCol, "vec4");
  private readonly order: number[] = [];

  constructor(private readonly deps: VolumetricsDeps) {
    this.grids = new TerrainGrids(deps.terrain);
    this.canopy = new CanopyMap(deps.crowns);
  }

  sampleIntegrated(uvw: TslNode): TslNode {
    const n = texture3D(this.integ ?? this.clear, uvw, 0);
    this.sampleNodes.push(n);
    return n;
  }

  setBand(band: VolumetricBand): void {
    if (this.deps.backend !== "webgpu") band = "off";
    if (band === this.band) return;
    this.freeGrids();
    this.band = band;
    this.hasHistory = false;
    if (band === "off") {
      this.on.value = 0;
      for (const n of this.sampleNodes) n.value = this.clear;
      return;
    }
    const spec = VOLUMETRIC_BANDS[band];
    this.far.value = spec.farM;
    this.gridSize.value.set(spec.grid[0], spec.grid[1], spec.grid[2]);
    this.scatter = [makeGrid(spec.grid, "es-vol-scatter-a"), makeGrid(spec.grid, "es-vol-scatter-b")];
    this.integ = makeGrid(spec.grid, "es-vol-integrated");
    this.blurred = makeGrid(spec.grid, "es-vol-scatter-blurred");
    this.kernels = {
      inject: [this.injectKernel(spec, this.scatter[0], this.scatter[1]), this.injectKernel(spec, this.scatter[1], this.scatter[0])],
      blur: [this.blurKernel(spec, this.scatter[0]), this.blurKernel(spec, this.scatter[1])],
      integrate: this.integrateKernel(spec, this.blurred),
    };
    this.dispatch.inject = spec.grid[0] * spec.grid[1] * spec.grid[2];
    this.dispatch.integrate = spec.grid[0] * spec.grid[1];
    for (const n of this.sampleNodes) n.value = this.integ;
    this.on.value = 1;
  }

  /** Density (m^-1) of the medium at world `p` (TSL); `fp` is the froxel's depth extent in metres,
   * which widens every hard transition to at least a froxel so the grid never stair-steps (prefilter). */
  private density(p: TslNode, fp: TslNode = float(0)): TslNode {
    const u = this.u;
    const nuv = p.xz.sub(u.nearOrigin).div(NEAR_SIZE_M);
    const fuv = p.xz.sub(u.farOrigin).div(FAR_SIZE_M);
    const nearT = texture(this.grids.near.texture, nuv);
    const farT = texture(this.grids.far.texture, fuv);
    const inNear = smoothstep(0, 0.06, min(min(nuv.x, nuv.y), min(float(1).sub(nuv.x), float(1).sub(nuv.y))));
    const ground = mix(farT.r, nearT.r, inNear);
    const hAG = p.y.sub(ground);
    const waterMask = nearT.b.mul(inNear);
    const wet = nearT.a.mul(inNear);
    // ground moisture (wet ground or standing water, the far grid's a; 0..1), squared: mist gathers over
    // wet basins and thins over dry slopes (fogField moistureWeight; fable5-world-demo Froxels.ts:148)
    const moist = mix(farT.a, max(nearT.a, nearT.b), inNear);
    const moistW = float(MOISTURE_FLOOR).add(float(1 - MOISTURE_FLOOR).mul(moist.mul(moist)));
    const soft = (w: number) => max(float(w), fp.mul(0.6));
    // drift: two octaves advected by the wind in different directions, the time axis mutating the shape
    const w3 = vec3(u.wind.x, 0, u.wind.y).mul(u.time);
    const w3b = vec3(u.wind.y.negate(), 0, u.wind.x).mul(u.time.mul(0.6));
    const n1 = texture3D(this.detail, p.sub(w3).div(vec3(56, 30, 56)).add(vec3(0, 0, u.time.mul(0.004))), 0).x;
    const n2 = texture3D(this.detail, p.sub(w3b.add(w3.mul(1.7))).div(vec3(15, 9, 15)).add(vec3(u.time.mul(0.011), 0, 0)), 0).y;
    const n = clamp(float(0.55).add(n1.mul(0.35)).add(n2.mul(0.2)), 0, 1.4);
    const outdoor = u.outdoor;
    // radiation mist: a flat-topped pool over the basin floor; the top is billowed by the noise
    // (+-3 m) and falls off over 8 m or a froxel; the lateral edge fades over the last 6 m of depth.
    const top = farT.g.add(u.mistDepth).add(n1.mul(1.2)).add(n2.mul(0.6));
    const mist = float(1).sub(smoothstep(top.sub(soft(1.5)), top, p.y))
      .mul(smoothstep(-1, 1, hAG)).mul(smoothstep(0, 6, top.sub(ground)))
      .mul(n).mul(u.mist).mul(moistW).mul(0.045);
    // steam fog: wisps over water, thin rising columns (stretched 5x vertically), patchy (~half
    // covered), each column fading with height at its own 1..5 m
    const rise = vec3(0, u.time.mul(0.35), 0);
    const ns = texture3D(this.detail, p.sub(w3.mul(0.8)).sub(rise).div(vec3(2.2, 3, 2.2)), 0).x;
    const nh = texture3D(this.detail, p.sub(w3.mul(1.2)).sub(rise.mul(1.5)).div(vec3(1.3, 2.2, 1.3)), 0).z;
    const overW = p.y.sub(nearT.g);
    const colTop = float(1).add(ns.mul(3)).add(nh);
    const steam = waterMask.mul(float(1).sub(smoothstep(colTop.mul(0.3), colTop, overW))).mul(smoothstep(-0.3, 0.1, overW))
      .mul(smoothstep(0.55, 0.8, ns.add(nh.mul(0.5)))).mul(u.steam).mul(0.12);
    // marsh ground fog: knee-to-waist (0.5..1.6 m), the top torn by both octaves into mounds and gaps,
    // density falling linearly with height to that top (thick at the ankles, thin at the waist)
    const marshTop = float(0.35).add(n1.mul(1.1)).add(n2.mul(0.9));
    const marshFall = clamp(float(1).sub(hAG.div(max(marshTop, float(0.2)))), 0, 1);
    const marsh = wet.mul(marshFall).mul(smoothstep(float(0).sub(soft(0.3)), float(0), hAG)).mul(smoothstep(0.25, 0.6, n2.add(n1.mul(0.5))))
      .mul(n).mul(u.marsh).mul(0.14);
    const sea = farT.b.mul(exp(max(p.y, 0).div(-150))).mul(n).mul(u.sea).mul(0.012);
    const cuv = p.xz.sub(u.canopyOrigin).div(CANOPY_SIZE_M);
    const under = smoothstep(0, 0.3, texture(this.canopy.texture, cuv).b.sub(ground));
    // canopy haze: humid air under the crowns, 0.01..0.03 /m at full strength (0112 §5)
    const haze = under.mul(float(1).sub(smoothstep(0, 25, hAG))).mul(u.canopyHaze).mul(0.025).mul(n.mul(0.5).add(0.5));
    const air = this.airDensity(p);
    const outside = mist.add(steam).add(marsh).add(sea).add(haze).mul(outdoor);
    // interior floor mist: 0..top, two octaves swirling in opposite directions, curling top
    const sw = vec3(u.time.mul(0.25), 0, u.time.mul(0.1));
    const f1 = texture3D(this.detail, p.add(sw).div(vec3(3, 1.2, 3)).add(vec3(0, u.time.mul(0.02), 0)), 0).x;
    const f2 = texture3D(this.detail, p.sub(sw.mul(1.6).zyx).div(vec3(1.1, 0.6, 1.1)), 0).y;
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
      const dt = span.div(SHAFT_STEPS);
      const ph = sunPhase(dot(dir, u.sunDir), u.sunDir.y);
      for (let k = 0; k < SHAFT_STEPS; k++) {
        const t = dt.mul(k + 0.5);
        const p = cam.add(dir.mul(t));
        const w = this.shaftNear(p, t);
        acc.addAssign(vec3(u.sunIrr).mul(ph).mul(this.gridDensity(p)).mul(w).mul(this.canopyT(p))
          .mul(dt).mul(exp(sigma.mul(t).negate())).mul(ALBEDO));
      }
    });
    // motes: hashed points on a 0.3 m lattice, ~1 in 8 cells kept (~4.6 /m^3), lit only inside a beam,
    // drifting and twinkling slowly
    Loop(u.apertureCount, ({ i }: { i: TslNode }) => {
      const ap = this.uApPos.element(i);
      const ad = this.uApDir.element(i);
      const span = min(segLen, 10);
      const dt = span.div(28);
      for (let k = 0; k < 28; k++) {
        const p = cam.add(dir.mul(dt.mul(k + 0.5)));
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
        const brel = m.sub(ap.xyz);
        const bAlong = dot(brel, ad.xyz);
        const inBeam = step(float(0), bAlong).mul(float(1).sub(smoothstep(ap.w.mul(0.8), ap.w, length(brel.sub(ad.xyz.mul(bAlong))))))
          .mul(float(1).sub(smoothstep(ad.w.mul(0.7), ad.w, bAlong)));
        const twinkle = float(0.55).add(sin(u.time.mul(0.9).add(keep.mul(40))).mul(0.45));
        acc.addAssign(this.uApCol.element(i).xyz.mul(disc.mul(inBeam).mul(step(0.875, keep)).mul(twinkle).mul(0.5)));
      }
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
      const sigmaT = max(this.density(p, fp), float(1e-7)).toVar();
      const cSun = dot(v, u.sunDir);
      const phaseSun = sunPhase(cSun, u.sunDir.y);
      const sunVis = this.terrainSunT(p);
      const skyKeep = float(1).sub(smoothstep(0, 0.05, u.sunDir.y).mul(float(1 - SHADOWED_SKY).mul(float(1).sub(sunVis))));
      const radiance = vec3(u.sunIrr).mul(phaseSun).mul(this.canopyT(p)).mul(sunVis).mul(step(float(0), u.sunDir.y))
        .mul(float(1).sub(this.shaftNear(p, length(dir).mul(depth))))
        .add(vec3(u.skyIrr).mul(SKY_INSCATTER).mul(this.skyOpen(p)).mul(skyKeep)).toVar();
      // point lights: analytic airlight in the apply stage (volumetricNodes), not here
      Loop(u.apertureCount, ({ i }: { i: TslNode }) => {
        const ap = this.uApPos.element(i);
        const ad = this.uApDir.element(i);
        const rel = p.sub(ap.xyz);
        const along = dot(rel, ad.xyz);
        const radial = length(rel.sub(ad.xyz.mul(along)));
        const inBeam = step(float(0), along).mul(float(1).sub(smoothstep(ap.w.mul(0.8), ap.w, radial)))
          .mul(float(1).sub(smoothstep(ad.w.mul(0.7), ad.w, along)));
        // beam-local dust: fine motes drifting in the shaft (0.15..2.65 /m), the room around it stays clear
        const mote = texture3D(this.detail, p.add(vec3(u.time.mul(0.03), u.time.mul(-0.02), 0)).div(vec3(0.14, 0.14, 0.14)), 0).x;
        sigmaT.addAssign(inBeam.mul(float(0.15).add(smoothstep(0.66, 0.78, mote).mul(2.5))));
        radiance.addAssign(this.uApCol.element(i).xyz.mul(inBeam).mul(mix(float(1 / (4 * Math.PI)), hg(0.7, dot(ad.xyz, v.negate())), 0.6)));
      });
      // clear air scatters blue more than red (Rayleigh-like tint on the air share only; mist stays white)
      const airShare = clamp(this.airDensity(p).div(sigmaT), 0, 1);
      const tint = mix(vec3(1), vec3(0.5, 0.78, 1.4), airShare);
      const cur = vec4(radiance.mul(tint).mul(sigmaT.mul(ALBEDO)), sigmaT).toVar();
      If(u.history.greaterThan(0.5), () => {
        const prev = u.prevViewProj.mul(vec4(p, 1));
        const pn = prev.xy.div(prev.w);
        const puv = vec2(pn.x.mul(0.5).add(0.5), float(0.5).sub(pn.y.mul(0.5)));
        const ps = log(max(prev.w, this.near).div(this.near)).div(log(this.far.div(this.near)));
        const inside = step(0, puv.x).mul(step(puv.x, 1)).mul(step(0, puv.y)).mul(step(puv.y, 1))
          .mul(step(0, ps)).mul(step(ps, 1)).mul(step(0, prev.w));
        const hist = texture3D(history, vec3(puv, ps), 0);
        cur.assign(mix(cur, hist, inside.mul(HISTORY_BLEND)));
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
        acc.addAssign(texture3D(read, c.add(vec3(dx / gx, dy / gy, 0)), 0).mul(w / 16));
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
        const sc = texture3D(read, vec3(uv, fi.add(0.5).div(gz)), 0);
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
    if (this.band === "off" || !this.kernels) return;
    const u = this.u;
    const cam = f.camera;
    const spec = VOLUMETRIC_BANDS[this.band];
    this.grids.update(cam.position.x, cam.position.z);
    this.canopy.update(cam.position.x, cam.position.z);
    u.nearOrigin.value.copy(this.grids.near.origin);
    u.farOrigin.value.copy(this.grids.far.origin);
    u.canopyOrigin.value.copy(this.canopy.origin);
    const r = f.regimes ?? (f.fog ? fogRegimes(f.fog) : null);
    const interior = f.interior ?? null;
    u.outdoor.value = interior ? 0 : 1;
    u.mist.value = r?.radiationMist ?? 0; u.steam.value = r?.steamFog ?? 0; u.marsh.value = r?.marshFog ?? 0;
    u.sea.value = r?.seaFog ?? 0; u.canopyHaze.value = r?.canopyHaze ?? 0; u.air.value = r?.air ?? 1;
    if (r) u.wind.value.set(r.windXZ[0], r.windXZ[1]);
    u.mistDepth.value = f.mistDepthM ?? 30;
    u.floorY.value = interior?.floorY ?? 0; u.floorTop.value = interior ? interior.floorY + interior.floorMistTopM : 0;
    u.floorMist.value = interior?.floorMistDensity ?? 0; u.dust.value = interior?.dustDensity ?? 0;
    u.time.value = f.timeS;
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
    u.tanHalf.value.set(ty * cam.aspect, ty);
    this.pickLights(f.lights ?? [], u.camPos.value);
    const aps = f.apertures ?? [];
    const na = Math.min(aps.length, MAX_APERTURES);
    for (let i = 0; i < na; i++) {
      const a = aps[i];
      this.apPos[i].set(a.position.x, a.position.y, a.position.z, a.radiusM);
      this.apDir[i].set(a.direction.x, a.direction.y, a.direction.z, a.lengthM);
      this.apCol[i].set(a.irradiance.r, a.irradiance.g, a.irradiance.b, 0);
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
    this.prevViewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.hasHistory = true;
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
      this.lightCol[k].set(l.radiance.r, l.radiance.g, l.radiance.b, 0);
    }
    this.u.lightCount.value = n;
  }

  private freeGrids(): void {
    this.scatter?.forEach((t) => t.dispose());
    this.integ?.dispose();
    this.blurred?.dispose();
    this.scatter = null; this.integ = null; this.blurred = null; this.kernels = null;
  }

  dispose(): void {
    this.freeGrids();
    this.grids.dispose();
    this.canopy.dispose();
    this.detail.dispose();
    this.clear.dispose();
    this.sampleNodes.length = 0;
  }
}

