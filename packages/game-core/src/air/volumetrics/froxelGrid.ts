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
import { fogRegimes, type FogFieldInput, type FogRegimes } from "./fogField";
import { TerrainGrids, NEAR_SIZE_M, FAR_SIZE_M, type TerrainSamplers } from "./terrainGrids";
import { CanopyMap, CANOPY_SIZE_M, type Crown } from "./canopyMap";
import type { VolumetricsSampler } from "./volumetricNodes";

const T = tsl as unknown as Record<string, (...a: TslNode[]) => TslNode> & Record<string, TslNode>;
const {
  Fn, If, Loop, clamp, dot, exp, float, instanceIndex, int, length, log, max, min, mix, normalize, pow,
  smoothstep, step, texture, texture3D, textureStore, uniform, uniformArray, uvec3, vec2, vec3, vec4,
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
  /** Sky irradiance on a horizontal plane (the ambient/hemisphere light's colour × intensity × π). */
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
  private kernels: { inject: [TslNode, TslNode]; integrate: [TslNode, TslNode] } | null = null;
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
  private readonly u = {
    camPos: uniform(new THREE.Vector3()), camRight: uniform(new THREE.Vector3()), camUp: uniform(new THREE.Vector3()),
    camFwd: uniform(new THREE.Vector3()), tanHalf: uniform(new THREE.Vector2(1, 1)), jitter: uniform(0), time: uniform(0),
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
  private readonly uLightPos = uniformArray(this.lightPos, "vec4");
  private readonly uLightCol = uniformArray(this.lightCol, "vec4");
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
    this.scatter = [makeGrid(spec.grid, "es-vol-scatter-a"), makeGrid(spec.grid, "es-vol-scatter-b")];
    this.integ = makeGrid(spec.grid, "es-vol-integrated");
    this.kernels = {
      inject: [this.injectKernel(spec, this.scatter[0], this.scatter[1]), this.injectKernel(spec, this.scatter[1], this.scatter[0])],
      integrate: [this.integrateKernel(spec, this.scatter[0]), this.integrateKernel(spec, this.scatter[1])],
    };
    this.dispatch.inject = spec.grid[0] * spec.grid[1] * spec.grid[2];
    this.dispatch.integrate = spec.grid[0] * spec.grid[1];
    for (const n of this.sampleNodes) n.value = this.integ;
    this.on.value = 1;
  }

  /** Density (m^-1) of the medium at world `p` (TSL). */
  private density(p: TslNode): TslNode {
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
    // drift: two octaves advected by the wind at different speeds, the time axis mutating the shape
    const w3 = vec3(u.wind.x, 0, u.wind.y).mul(u.time);
    const n1 = texture3D(this.detail, p.sub(w3).div(vec3(56, 30, 56)).add(vec3(0, 0, u.time.mul(0.004))), 0).x;
    const n2 = texture3D(this.detail, p.sub(w3.mul(1.7)).div(vec3(15, 9, 15)).add(vec3(u.time.mul(0.011), 0, 0)), 0).y;
    const n = clamp(float(0.55).add(n1.mul(0.35)).add(n2.mul(0.2)), 0, 1.4);
    const outdoor = u.outdoor;
    // radiation mist: flat top over the basin floor, soft 5 m edge
    const top = farT.g.add(u.mistDepth);
    const mist = float(1).sub(smoothstep(top.sub(5), top.add(n2.mul(1.5)), p.y)).mul(step(float(-1), hAG))
      .mul(n).mul(u.mist).mul(0.025);
    // steam fog: 0..8 m over water, vertically stretched wisps
    const ns = texture3D(this.detail, p.sub(w3.mul(0.6)).div(vec3(6, 18, 6)).add(vec3(0, u.time.mul(-0.02), 0)), 0).x;
    const overW = p.y.sub(nearT.g);
    const steam = waterMask.mul(float(1).sub(smoothstep(0, 8, overW))).mul(step(float(-0.3), overW))
      .mul(clamp(ns.mul(0.7).add(0.3), 0, 1)).mul(u.steam).mul(0.06);
    const marsh = wet.mul(float(1).sub(smoothstep(0.5, 3, hAG))).mul(n).mul(u.marsh).mul(0.05);
    const sea = farT.b.mul(exp(max(p.y, 0).div(-150))).mul(n).mul(u.sea).mul(0.012);
    const cuv = p.xz.sub(u.canopyOrigin).div(CANOPY_SIZE_M);
    const under = texture(this.canopy.texture, cuv).r;
    const haze = under.mul(float(1).sub(smoothstep(0, 25, hAG))).mul(u.canopyHaze).mul(0.006).mul(n);
    const air = exp(max(p.y, 0).div(-1200)).mul(u.air).mul(2e-4);
    const outside = mist.add(steam).add(marsh).add(sea).add(haze).mul(outdoor);
    const floor = float(1).sub(smoothstep(u.floorTop.sub(0.8), u.floorTop.add(n2.mul(0.3)), p.y))
      .mul(step(u.floorY.sub(0.2), p.y)).mul(n).mul(u.floorMist);
    return outside.add(air).add(floor).add(u.dust);
  }

  /** Canopy transmittance of the sun ray from `p` (three samples up the ray). */
  private canopyT(p: TslNode): TslNode {
    const u = this.u;
    const trans = float(1).toVar();
    const sy = max(u.sunDir.y, 0.05);
    for (const up of [3, 10, 22]) {
      const h = p.y.add(up);
      const xz = p.xz.add(u.sunDir.xz.mul(float(up).div(sy)));
      const c = texture(this.canopy.texture, xz.sub(u.canopyOrigin).div(CANOPY_SIZE_M));
      const inside = step(c.g, h).mul(step(h, c.b));
      trans.mulAssign(float(1).sub(c.r.mul(inside).mul(0.9)));
    }
    return trans.mul(u.outdoor);
  }

  private injectKernel(spec: BandSpec, write: Storage3DTexture, history: Storage3DTexture): TslNode {
    const [gx, gy, gz] = spec.grid;
    const u = this.u;
    return Fn(() => {
      const id = instanceIndex;
      const coord = uvec3(id.mod(gx), id.div(gx).mod(gy), id.div(gx * gy));
      const uv = vec2(float(coord.x).add(0.5).div(gx), float(coord.y).add(0.5).div(gy));
      const ndc = vec2(uv.x.mul(2).sub(1), float(1).sub(uv.y.mul(2)));
      const s = float(coord.z).add(0.5).add(u.jitter).div(gz);
      const depth = this.near.mul(pow(this.far.div(this.near), s));
      const dir = u.camRight.mul(ndc.x.mul(u.tanHalf.x)).add(u.camUp.mul(ndc.y.mul(u.tanHalf.y))).add(u.camFwd);
      const p = u.camPos.add(dir.mul(depth));
      const v = normalize(dir);
      const sigmaT = max(this.density(p), float(1e-7));
      const cSun = dot(v, u.sunDir);
      const phaseSun = mix(hg(0.2, cSun), hg(0.75, cSun), 0.5);
      const radiance = vec3(u.sunIrr).mul(phaseSun).mul(this.canopyT(p)).mul(step(float(0), u.sunDir.y))
        .add(vec3(u.skyIrr).mul(0.8 / Math.PI)).toVar();
      Loop(u.lightCount, ({ i }: { i: TslNode }) => {
        const lp = this.uLightPos.element(i);
        const d = p.sub(lp.xyz);
        const r2 = max(dot(d, d), float(0.09));
        const dist = T.sqrt(r2);
        const win = clamp(float(1).sub(pow(dist.div(lp.w), float(4))), 0, 1);
        // scatter angle: light's travel (light -> p) against the view's (p -> camera)
        radiance.addAssign(this.uLightCol.element(i).xyz.mul(win.mul(win)).div(r2).mul(hg(0.6, dot(d.div(dist), v.negate()))));
      });
      Loop(u.apertureCount, ({ i }: { i: TslNode }) => {
        const ap = this.uApPos.element(i);
        const ad = this.uApDir.element(i);
        const rel = p.sub(ap.xyz);
        const along = dot(rel, ad.xyz);
        const radial = length(rel.sub(ad.xyz.mul(along)));
        const inBeam = step(float(0), along).mul(float(1).sub(smoothstep(ap.w.mul(0.8), ap.w, radial)))
          .mul(float(1).sub(smoothstep(ad.w.mul(0.7), ad.w, along)));
        radiance.addAssign(this.uApCol.element(i).xyz.mul(inBeam).mul(hg(0.7, dot(ad.xyz, v.negate()))));
      });
      const cur = vec4(radiance.mul(sigmaT.mul(ALBEDO)), sigmaT).toVar();
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
    u.history.value = temporal ? 1 : 0;
    u.prevViewProj.value.copy(this.prevViewProj);
    const k = this.parity;
    this.deps.renderer.compute(this.kernels.inject[k]);
    this.deps.renderer.compute(this.kernels.integrate[k]);
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
    this.scatter = null; this.integ = null; this.kernels = null;
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

