import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";
import type { WaterRuntime } from "./types";
import { WATER_LAYER } from "./waterMaterial";
import { fallsIrradianceNode, fallsSunVisibilityNode } from "./whitewaterStreaks";
import type { FallPath } from "./WaterfallSheets";
import { liftedInstancePositionNode, sceneEyeDepthNode, type KitSharedUniforms } from "./WaterfallKitMaterial";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const {
  Break, Fn, If, Loop, attribute, cameraPosition, clamp, distance, dot, exp, float, floor, fract, length, max, min,
  mix, normalize, positionWorld, pow, screenCoordinate, select, sin, smoothstep, uniform, varying, vec2, vec3, vec4,
} = tsl as unknown as Record<string, TslNode>;

/**
 * A ray-marched mist volume per fall (decision 0064; research
 * `waterfall-mist-and-spray.md`). This is NOT the weather system's froxel
 * fog (cut, owner 2026-09-13): it is a small analytic volume per cascade —
 * a cone that hugs the falling water and fans out downward (spray shed by
 * the jet, growing with the distance fallen) plus an ellipsoid dome over the
 * plunge pool (the cloud the impact throws up) — marched in `MIST_STEPS`
 * jittered steps between the ray's entry into the fall's bounding box and
 * its exit or the scene depth, whichever is first, so the mist wraps rock
 * and water softly instead of ending on a plane. Density is a two-octave
 * value noise drifting up and downstream, scaled by a smooth falloff from
 * each shape's axis; lighting is the shared falls irradiance under the
 * sun's shadow node with a Henyey–Greenstein forward-scatter lobe toward
 * the sun (mist glows when backlit). Drawn only within `MIST_DRAW_M`,
 * nothing from under water.
 *
 * One InstancedMesh of unit cubes (one per fall, axis-aligned in world
 * space so the box slab test is trivial), back faces only so the camera may
 * stand inside the volume. Cost is bounded by the box's screen area ×
 * `MIST_STEPS`; a fall seen from its base fills a good part of the frame, so
 * the noise is cheap (value noise, no textures).
 */

export const MIST_STEPS = 20;
/** Volumes fade in from this range and are culled beyond the far figure. */
export const MIST_DRAW_M = { near: 120, far: 150 } as const;
/** Cone radius at the lip and the growth per metre fallen (m). */
export const MIST_CONE = { lipRadiusFrac: 0.35, growPerM: 0.11, maxRadiusM: 12 } as const;
/** Dome radii over the pool: horizontal from the bowl, vertical from the drop. */
export const MIST_DOME = { horizontalScale: 1.15, heightPerDropM: 0.22, minHeightM: 2, maxHeightM: 14 } as const;
/** Extinction per metre at full density (cone at the foot / dome). */
export const MIST_SIGMA = { cone: 0.035, dome: 0.06 } as const;
/** Mist albedo (grey) and the HG forward-scatter asymmetry. */
export const MIST_ALBEDO = 0.86;
export const MIST_HG_G = 0.55;
/** Drift of the density field (m/s): up and downstream. */
export const MIST_DRIFT = { upMS: 0.8, downstreamMS: 0.6 } as const;

export interface MistVolumeSite {
  id: string;
  lip: THREE.Vector3;
  plunge: THREE.Vector3;
  forward: THREE.Vector3;
  widthM: number;
  dropM: number;
  bowlRadiusM: number;
  /** World AABB of the proxy box. */
  min: THREE.Vector3;
  max: THREE.Vector3;
}

/** The analytic volume for one traced fall (pure; the tests read it). */
export function mistVolumeSite(path: FallPath): MistVolumeSite {
  const c = path.cascade;
  const pts = path.points;
  const lipIndex = Math.max(pts.findIndex((p) => p.s >= 0), 0);
  const lip = new THREE.Vector3(pts[lipIndex].x, pts[lipIndex].y, pts[lipIndex].z);
  const plunge = new THREE.Vector3(c.plunge.x, c.plunge.y, c.plunge.z);
  const dl = Math.hypot(c.direction.x, c.direction.z) || 1;
  const forward = new THREE.Vector3(c.direction.x / dl, 0, c.direction.z / dl);
  const widthM = Math.max(c.widthM, 0.5);
  const dropM = Math.max(lip.y - plunge.y, 0.5);
  const bowlRadiusM = Math.max(c.bowlRadiusM ?? widthM, widthM * 0.9, 4);
  const coneFoot = Math.min(widthM * MIST_CONE.lipRadiusFrac + dropM * MIST_CONE.growPerM, MIST_CONE.maxRadiusM);
  const domeR = bowlRadiusM * MIST_DOME.horizontalScale;
  const domeH = Math.min(Math.max(dropM * MIST_DOME.heightPerDropM, MIST_DOME.minHeightM), MIST_DOME.maxHeightM);
  const r = Math.max(coneFoot, domeR) + 1;
  const min = new THREE.Vector3(Math.min(lip.x, plunge.x) - r, plunge.y - 1, Math.min(lip.z, plunge.z) - r);
  const max = new THREE.Vector3(Math.max(lip.x, plunge.x) + r, Math.max(lip.y + 1, plunge.y + domeH + 1), Math.max(lip.z, plunge.z) + r);
  return { id: path.id, lip, plunge, forward, widthM, dropM, bowlRadiusM, min, max };
}

/** The old `esMistHash` (value-noise lattice hash). */
function mistHash(q: TslNode): TslNode {
  const p = fract(q.mul(0.3183099).add(vec3(0.1, 0.17, 0.23))).mul(17.0);
  return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
}

/** The old `esMistNoise`: trilinear value noise, smoothstep-weighted. */
function mistNoise(p: TslNode): TslNode {
  const i = floor(p);
  const f0 = fract(p);
  const f = f0.mul(f0).mul(vec3(3.0).sub(f0.mul(2.0)));
  const h = (x: number, y: number, z: number) => mistHash(i.add(vec3(x, y, z)));
  return mix(
    mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y),
    mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y),
    f.z);
}

interface MistVaryings { lip: TslNode; plunge: TslNode; params: TslNode; forward: TslNode }

/** Density 0..1 at a world point: the cone hugging the fall + the dome over the pool. */
function mistDensity(p: TslNode, t: TslNode, v: MistVaryings, verticalScale: TslNode): TslNode {
  const axis = v.plunge.sub(v.lip);
  const len = max(length(axis), 0.5);
  const ad = axis.div(len);
  const f = clamp(dot(p.sub(v.lip), ad).div(len), 0, 1);          // 0 at the lip, 1 at the plunge
  const onAxis = v.lip.add(ad.mul(f).mul(len));
  const width = v.params.x;
  const drop = v.params.y;
  const radius = min(width.mul(MIST_CONE.lipRadiusFrac).add(f.mul(drop).mul(MIST_CONE.growPerM)), MIST_CONE.maxRadiusM);
  const q = length(p.sub(onAxis)).div(max(radius, 0.3));
  const q2 = float(1).sub(q.mul(q));
  const cone = select(q.lessThan(1), q2.mul(q2).mul(f.mul(0.85).add(0.15)), float(0));
  const domeR = v.params.z.mul(MIST_DOME.horizontalScale);
  const domeH = clamp(drop.mul(MIST_DOME.heightPerDropM), MIST_DOME.minHeightM, MIST_DOME.maxHeightM).mul(verticalScale);
  const dc = v.plunge.add(vec3(v.forward.x, 0, v.forward.y).mul(domeR).mul(0.25));
  const dd = p.sub(dc).div(vec3(domeR, domeH, domeR));
  const qd = dot(dd, dd);
  const qd2 = float(1).sub(qd);
  const dome = select(qd.lessThan(1).and(p.y.greaterThanEqual(v.plunge.y.sub(0.5))), qd2.mul(qd2), float(0));
  // a drifting, breathing density: two octaves, rising and going downstream
  const drift = vec3(v.forward.x.mul(MIST_DRIFT.downstreamMS), -MIST_DRIFT.upMS, v.forward.y.mul(MIST_DRIFT.downstreamMS)).mul(t);
  const np = p.add(drift);
  const n = smoothstep(0.25, 0.85, mistNoise(np.mul(0.35)).mul(0.65).add(mistNoise(np.mul(0.9).add(7.3)).mul(0.35)));
  return cone.mul(MIST_SIGMA.cone).add(dome.mul(MIST_SIGMA.dome)).mul(n.mul(0.65).add(0.35));
}

/** The ray-marched mist material (one per volume mesh). */
function createMistMaterial(shared: KitSharedUniforms, camForward: TslNode): MeshBasicNodeMaterial {
  const u = shared as unknown as Record<string, TslNode>;
  const material = new MeshBasicNodeMaterial();
  material.name = "es-waterfall-mist-volume";
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = false;
  material.side = THREE.BackSide;
  material.positionNode = liftedInstancePositionNode(u.uLift, u.uVerticalScale);
  const lifted = (a: TslNode) => vec3(a.x, a.y.add(u.uLift).mul(u.uVerticalScale), a.z);
  const v: MistVaryings = {
    lip: varying(lifted(attribute("aLip", "vec3")), "vEsMistLip"),
    plunge: varying(lifted(attribute("aPlunge", "vec3")), "vEsMistPlunge"),
    params: attribute("aParams", "vec4"),   // width, drop, bowl radius, phase
    forward: attribute("aForward", "vec4").xy,
  };
  const boxMin = varying(lifted(attribute("aBoxMin", "vec3")), "vEsMistBoxMin");
  const boxMax = varying(lifted(attribute("aBoxMax", "vec3")), "vEsMistBoxMax");
  const vis = fallsSunVisibilityNode(shared.sunShadow);
  const irr = fallsIrradianceNode(u.uAmbient, u.uSunLight, u.uSunDir, float(0.5), vis);

  const out = Fn(() => {
    const ro = cameraPosition;
    const rd = normalize(positionWorld.sub(ro)).toVar();
    // slab test against the fall's world box
    const inv = vec3(1).div(rd);
    const t0 = boxMin.sub(ro).mul(inv);
    const t1 = boxMax.sub(ro).mul(inv);
    const tmin = min(t0, t1);
    const tmax = max(t0, t1);
    const tEnter = max(max(tmin.x, tmin.y), max(tmin.z, 0.0)).toVar();
    const tExit = min(min(tmax.x, tmax.y), tmax.z).toVar();
    // never march past what is in front of the mist
    If(u.uHasDepth.greaterThan(0.5), () => {
      const sceneEye = sceneEyeDepthNode(u.uSceneDepth, u.uResolution, u.uCamNear, u.uCamFar);
      const along = max(dot(rd, camForward), 0.05);
      tExit.assign(min(tExit, sceneEye.div(along)));
    });
    const dist = distance(ro, boxMin.add(boxMax).mul(0.5));
    const range = float(1).sub(smoothstep(MIST_DRAW_M.near, MIST_DRAW_M.far, dist));
    const span = tExit.sub(tEnter);
    const ds = span.div(MIST_STEPS);
    // jitter the start per pixel so the steps never band
    const jitter = fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453));
    const t = u.uTime.add(v.params.w);
    const T = float(1).toVar();
    // Henyey-Greenstein forward lobe toward the sun, on top of the isotropic term
    const mu = dot(rd, u.uSunDir);
    const g = MIST_HG_G;
    const hg = float(1 - g * g).div(pow(float(1 + g * g).sub(mu.mul(2 * g)), 1.5).mul(4 * Math.PI));
    const sunGlow = hg.mul(vis).mul(2.4).add(0.85);
    If(tExit.greaterThan(tEnter).and(range.greaterThan(0.001)).and(u.uUnderwater.lessThanEqual(0.5)), () => {
      Loop(MIST_STEPS, ({ i }: { i: TslNode }) => {
        const tt = tEnter.add(float(i).add(jitter).mul(ds));
        const p = ro.add(rd.mul(tt));
        const sigma = mistDensity(p, t, v, u.uVerticalScale);
        If(sigma.greaterThan(1e-4), () => {
          const a = float(1).sub(exp(sigma.negate().mul(ds)));
          T.mulAssign(float(1).sub(a));
          If(T.lessThan(0.02), () => { Break(); });
        });
      });
    });
    // (the old L accumulator was never read: colour is albedo x light, alpha 1 - T)
    const alpha = float(1).sub(T).mul(range).mul(u.uOpacity).mul(
      select(tExit.greaterThan(tEnter).and(range.greaterThan(0.001)).and(u.uUnderwater.lessThanEqual(0.5)), float(1), float(0)));
    return vec4(vec3(MIST_ALBEDO).mul(irr).mul(sunGlow), alpha);
  })();
  material.colorNode = out;
  material.maskNode = out.a.greaterThanEqual(0.004);
  return material;
}

export interface MistVolumeDiagnostics {
  count: number;
  steps: number;
  perFall: Record<string, { coneFootRadiusM: number; domeRadiusM: number }>;
}

export class WaterfallMistVolume {
  readonly mesh: THREE.InstancedMesh;
  readonly material: MeshBasicNodeMaterial;
  readonly diagnostics: MistVolumeDiagnostics;
  /** The camera's forward axis (world), a `uniform()` node written by `setCamera`. */
  private readonly camForward: { value: THREE.Vector3 } = uniform(new THREE.Vector3(0, 0, -1));

  constructor(paths: readonly FallPath[], shared: KitSharedUniforms) {
    const sites = paths.map(mistVolumeSite);
    const n = sites.length;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const lip = new Float32Array(n * 3);
    const plunge = new Float32Array(n * 3);
    const params = new Float32Array(n * 4);
    const forward = new Float32Array(n * 4);
    const bmin = new Float32Array(n * 3);
    const bmax = new Float32Array(n * 3);
    const perFall: MistVolumeDiagnostics["perFall"] = {};
    const mesh = new THREE.InstancedMesh(geometry, undefined as unknown as THREE.Material, Math.max(n, 1));
    mesh.count = n;
    const m = new THREE.Matrix4();
    sites.forEach((s, i) => {
      lip.set([s.lip.x, s.lip.y, s.lip.z], i * 3);
      plunge.set([s.plunge.x, s.plunge.y, s.plunge.z], i * 3);
      params.set([s.widthM, s.dropM, s.bowlRadiusM, (i * 37) % 100], i * 4);
      forward.set([s.forward.x, s.forward.z, 0, 0], i * 4);
      bmin.set([s.min.x, s.min.y, s.min.z], i * 3);
      bmax.set([s.max.x, s.max.y, s.max.z], i * 3);
      const size = s.max.clone().sub(s.min);
      m.makeScale(size.x, size.y, size.z).setPosition(s.min.clone().add(s.max).multiplyScalar(0.5));
      mesh.setMatrixAt(i, m);
      perFall[s.id] = {
        coneFootRadiusM: Math.min(s.widthM * MIST_CONE.lipRadiusFrac + s.dropM * MIST_CONE.growPerM, MIST_CONE.maxRadiusM),
        domeRadiusM: s.bowlRadiusM * MIST_DOME.horizontalScale,
      };
    });
    geometry.setAttribute("aLip", new THREE.InstancedBufferAttribute(lip, 3));
    geometry.setAttribute("aPlunge", new THREE.InstancedBufferAttribute(plunge, 3));
    geometry.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 4));
    geometry.setAttribute("aForward", new THREE.InstancedBufferAttribute(forward, 4));
    geometry.setAttribute("aBoxMin", new THREE.InstancedBufferAttribute(bmin, 3));
    geometry.setAttribute("aBoxMax", new THREE.InstancedBufferAttribute(bmax, 3));
    this.material = createMistMaterial(shared, this.camForward);
    mesh.material = this.material;
    mesh.name = "water-waterfall-mist-volume";
    mesh.layers.set(WATER_LAYER);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    // after every kit piece: the volume composites over the fall and the pool
    mesh.renderOrder = 6;
    this.mesh = mesh;
    this.diagnostics = { count: n, steps: MIST_STEPS, perFall };
  }

  /** The camera's forward axis (world), for the depth clamp along the ray. */
  setCamera(camera: THREE.Camera): void {
    camera.getWorldDirection(this.camForward.value);
  }

  update(_runtime: WaterRuntime): void { /* shared uniforms carry time and light */ }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
