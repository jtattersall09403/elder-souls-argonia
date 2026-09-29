/**
 * The raymarched fire volume (decision 0110; WebGPU backend only).
 *
 * The large presets (`FireConfig.volume`: torches, brazier, hearth,
 * campfire) draw near the camera as a box raymarched through a small
 * simulated temperature grid, a cut-down port of three.js
 * webgpu_volume_fire: the example's full stable-fluids solver (velocity
 * advection, divergence, Jacobi pressure, projection: ~25 passes on a
 * 100x200x100 grid) becomes ONE advection kernel per sub-step on a
 * 16x32x16 grid. Velocity is not simulated: it is buoyant rise plus the curl
 * of a noise potential, which is divergence-free by construction, so no
 * pressure solve is needed. Hot cells rise, cool (`dissipation`) and are
 * fed by a flickering source disc at the floor (`emit`).
 *
 * Sharing: every fire of a preset samples the SAME field (mirrored and
 * swapped by its seed, 8 variants), so the compute cost is per preset in
 * reach, never per fire. A field steps only in frames where one of its fires
 * is inside `FIRE_VOLUME_REACH_M`; beyond that the fire is its cards
 * (flameMaterial.ts `volumeShareNode` cross-fades the two).
 *
 * Output is the cards' display-referred treatment (core covers, glow adds,
 * `displayToScene` through the frame's tone map), so a volume sits in the
 * same day/night envelope the card fire was judged in.
 *
 * Instance attributes (FlameSystem.ts writes them):
 *   iPosSeed vec4  emitter world position (m), seed 0..1
 *   iBox     vec4  box width m, box height m, palette row, intensity 0..1
 *   iAnim    vec4  flicker Hz, flicker share, wind response, unused
 */
import * as THREE from "three";
import { NodeMaterial, Storage3DTexture, type WebGPURenderer } from "three/webgpu";
import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";
import { sel } from "../../render/nodes/materialNodes";
import type { FireVolumeConfig } from "./fireTypes";
import { displayToScene, fireFlickerNode } from "./fireNodes";
import { FLAME_ROOT_SHARE, premultipliedFireMaterial, volumeShareNode, type FireUniforms } from "./flameMaterial";

const T = tsl as unknown as Record<string, (...a: TslNode[]) => TslNode> & Record<string, TslNode>;
const {
  Fn, If, Discard, Loop, attribute, clamp, exp, float, instanceIndex, int, length, max, min, mix,
  normalize, smoothstep, step, texture3D, textureStore, uniform, uvec3, varying, vec3, vec4,
} = T;

/** Sub-steps per frame: two, A->B then B->A, so the drawn field is always A. */
export const VOLUME_SUBSTEPS = 2;
/** Steps run when a field is first used, so a fire lit on screen is already burning. */
export const VOLUME_PREWARM_STEPS = 60;
/** Box bottom sits this share of the flame height below the emitter (as the cards' root). */
const ROOT = FLAME_ROOT_SHARE;

function makeGrid(grid: readonly [number, number, number], name: string): Storage3DTexture {
  const t = new Storage3DTexture(grid[0], grid[1], grid[2]);
  t.name = name;
  t.format = THREE.RGBAFormat;
  t.type = THREE.HalfFloatType; // rgba16float: storage-writable and filterable in core WebGPU
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  return t;
}

/** A divergence-free velocity: the curl of a noise potential, by central differences. */
function curlNoise(p: TslNode, octaves: number): TslNode {
  const e = 0.08;
  const pot = (q: TslNode) => {
    let v = T.mx_noise_vec3(q);
    if (octaves > 1) v = v.add(T.mx_noise_vec3(q.mul(2.07).add(11.3)).mul(0.5));
    if (octaves > 2) v = v.add(T.mx_noise_vec3(q.mul(4.13).add(23.9)).mul(0.25));
    return v;
  };
  const dx = vec3(e, 0, 0), dy = vec3(0, e, 0), dz = vec3(0, 0, e);
  const px0 = pot(p.sub(dx)), px1 = pot(p.add(dx));
  const py0 = pot(p.sub(dy)), py1 = pot(p.add(dy));
  const pz0 = pot(p.sub(dz)), pz1 = pot(p.add(dz));
  const x = py1.z.sub(py0.z).sub(pz1.y).add(pz0.y);
  const y = pz1.x.sub(pz0.x).sub(px1.z).add(px0.z);
  const z = px1.y.sub(px0.y).sub(py1.x).add(py0.x);
  return vec3(x, y, z).div(2 * e);
}

/** One preset's field: two grids and the two advection kernels between them. */
export class VolumeFireField {
  readonly a: Storage3DTexture;
  private readonly b: Storage3DTexture;
  private readonly kernels: TslNode[];
  private readonly uDt = uniform(1 / 60);
  private readonly uSimTime = uniform(0);
  private simTime = 0;
  private warmed = false;

  constructor(readonly config: FireVolumeConfig, name: string) {
    this.a = makeGrid(config.grid, `${name}-a`);
    this.b = makeGrid(config.grid, `${name}-b`);
    this.kernels = [this.kernel(this.a, this.b), this.kernel(this.b, this.a)];
  }

  private kernel(read: Storage3DTexture, write: Storage3DTexture): TslNode {
    const c = this.config;
    const [gx, gy, gz] = c.grid;
    const cells = gx * gy * gz;
    const { uDt, uSimTime } = this;
    return Fn(() => {
      const id = instanceIndex;
      const coord = uvec3(id.mod(gx), id.div(gx).mod(gy), id.div(gx * gy));
      const uvw = vec3(coord).add(0.5).div(vec3(gx, gy, gz));
      const here = texture3D(read, uvw, 0).r;
      // velocity in box units per second: buoyant rise (hot rises faster)
      // plus curl-noise licking that scrolls up with time
      const np = uvw.mul(vec3(c.noiseScale, c.noiseScale * 2, c.noiseScale))
        .add(vec3(uSimTime.mul(0.13), uSimTime.mul(-0.9), uSimTime.mul(0.07)));
      const curl = curlNoise(np, c.octaves).mul(c.turbulence);
      const rise = float(c.riseSpeed).mul(clamp(here, 0, 1.2).mul(0.8).add(0.35));
      const vel = vec3(curl.x, curl.y.mul(0.35).add(rise), curl.z);
      // semi-Lagrangian: fetch where this cell's contents came from
      const prev = uvw.sub(vel.mul(uDt));
      const back = texture3D(read, prev, 0).r;
      const cooled = back.mul(exp(uDt.mul(-c.dissipation)));
      // flickering source disc on the floor
      const r = length(uvw.xz.sub(0.5).mul(2)).div(c.sourceRadius);
      const flick = T.mx_noise_float(vec3(uvw.x.mul(5), uvw.z.mul(5), uSimTime.mul(3.1))).mul(0.6).add(0.75);
      const src = float(1).sub(smoothstep(0.55, 1.0, r)).mul(float(1).sub(smoothstep(0.0, 0.14, uvw.y)))
        .mul(c.emit).mul(uDt).mul(flick);
      // walls: nothing survives at the sides and the lid
      const wall = smoothstep(0.0, 0.08, min(min(uvw.x, float(1).sub(uvw.x)), min(uvw.z, float(1).sub(uvw.z))))
        .mul(float(1).sub(smoothstep(0.9, 1.0, uvw.y)));
      const t = min(cooled.add(src), float(1.6)).mul(wall);
      textureStore(write, coord, vec4(t, 0, 0, 1)).toWriteOnly();
    })().compute(cells).setName("fireVolumeAdvect");
  }

  /** Advance the field to `timeS` (sub-steps of at most 1/30 s; prewarms on first use). */
  step(renderer: WebGPURenderer, timeS: number): void {
    if (!this.warmed) {
      this.warmed = true;
      this.uDt.value = 1 / 30;
      for (let i = 0; i < VOLUME_PREWARM_STEPS; i++) {
        this.simTime += 1 / 30;
        this.uSimTime.value = this.simTime;
        renderer.compute(this.kernels[i % 2]);
      }
      this.simTime = timeS;
      return;
    }
    const dt = Math.min(1 / 30, Math.max(0, timeS - this.simTime));
    if (dt <= 0) return;
    this.simTime = timeS;
    this.uSimTime.value = timeS;
    this.uDt.value = dt / VOLUME_SUBSTEPS;
    for (let i = 0; i < VOLUME_SUBSTEPS; i++) renderer.compute(this.kernels[i % 2]);
  }

  dispose(): void {
    this.a.dispose();
    this.b.dispose();
  }
}

/** The unit box the volume is drawn on: x, z -0.5..0.5, y 0..1. */
export function makeVolumeBox(): THREE.InstancedBufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.setIndex(box.getIndex());
  g.setAttribute("position", box.getAttribute("position"));
  return g;
}

/**
 * The raymarch material of one preset's volumes, sampling `field.a`.
 * Drawn on the box's back faces, so a camera inside the box still sees it.
 */
export function makeVolumeMaterial(u: FireUniforms, field: VolumeFireField): NodeMaterial {
  const c = field.config;
  const material = premultipliedFireMaterial(new NodeMaterial(), "fire-volume");
  material.side = THREE.BackSide;
  const iPosSeed = attribute("iPosSeed", "vec4");
  const iBox = attribute("iBox", "vec4");
  const iAnim = attribute("iAnim", "vec4");
  const position = attribute("position", "vec3");
  const at = iPosSeed.xyz;
  const size = vec3(iBox.x, iBox.y, iBox.x);
  const floor = at.sub(vec3(0, iBox.y.mul(ROOT / c.box.heightH), 0));
  const world = floor.add(position.mul(size));
  const dist = length(T.cameraPosition.sub(at));
  const share = volumeShareNode(u, dist);
  const intensity = iBox.w.mul(share).mul(fireFlickerNode(u.uTime, iPosSeed.w, iAnim.x, iAnim.y));
  const clip = T.cameraProjectionMatrix.mul(T.cameraViewMatrix).mul(vec4(world, 1));
  material.vertexNode = sel(intensity.greaterThan(0), clip, vec4(2, 2, 2, 1));

  const vWorld = varying(world, "vVolWorld");
  const vFloor = varying(floor, "vVolFloor");
  const vSize = varying(size, "vVolSize");
  const vSeed = varying(iPosSeed.w, "vVolSeed");
  const vPalette = varying(iBox.z, "vVolPalette");
  const vIntensity = varying(intensity, "vVolIntensity");
  const vLean = varying(u.uWind.mul(iAnim.z), "vVolLean");
  const steps = c.steps;

  material.fragmentNode = Fn(() => {
    const o = T.cameraPosition;
    const d = normalize(vWorld.sub(o));
    // slab test against the instance's box, in world space (axis-aligned)
    const bmin = vFloor.sub(vec3(vSize.x.mul(0.5), 0, vSize.z.mul(0.5)));
    const bmax = bmin.add(vSize);
    const safe = vec3(
      sel(T.abs(d.x).lessThan(1e-5), float(1e-5), d.x),
      sel(T.abs(d.y).lessThan(1e-5), float(1e-5), d.y),
      sel(T.abs(d.z).lessThan(1e-5), float(1e-5), d.z),
    );
    const ta = bmin.sub(o).div(safe);
    const tb = bmax.sub(o).div(safe);
    const tn = min(ta, tb);
    const tf = T.max(ta, tb);
    const tEnter = max(max(max(tn.x, tn.y), tn.z), float(0));
    const tExit = min(min(tf.x, tf.y), tf.z);
    const span = max(tExit.sub(tEnter), float(0));
    const stepLen = span.div(steps);
    // de-banding (judge (a), 2026-09-29): IGN offsets each ray's first sample
    // by a fraction of a step, and a second, decorrelated per-pixel hash
    // jitters every sample inside its grid cell (stochastic filtering), so
    // neither the step spacing nor the 32 field layers print as bands
    const px = T.screenCoordinate.xy;
    const jitter = T.interleavedGradientNoise(px).toVar();
    const h0 = T.interleavedGradientNoise(px.add(T.vec2(47.0, 17.0))).toVar();
    const h1 = T.fract(h0.mul(1.618034).add(jitter.mul(0.7548777))).toVar();
    const h2 = T.fract(h0.mul(0.5698403).add(jitter.mul(1.3247180))).toVar();
    const cell = vec3(1 / c.grid[0], 1 / c.grid[1], 1 / c.grid[2]);
    // the seed picks one of 8 mirrorings of the shared field
    const flipX = step(0.5, T.fract(vSeed.mul(2)));
    const flipZ = step(0.5, T.fract(vSeed.mul(4)));
    const swap = step(0.5, vSeed);
    const acc = vec3(0).toVar();
    const alpha = float(0).toVar();
    const row = int(vPalette.add(0.5));
    const base = u.uRamp.element(row.mul(3));
    const midC = u.uRamp.element(row.mul(3).add(1));
    const tip = u.uRamp.element(row.mul(3).add(2));
    // optical depth per metre of ray at temperature 1
    const sigma = float(c.density).div(vSize.y);
    Loop(steps, ({ i }: { i: TslNode }) => {
      const tr = tEnter.add(float(i).add(jitter).mul(stepLen));
      const pos = o.add(d.mul(tr));
      const box = pos.sub(bmin).div(vSize);
      // wind leans the upper field, quadratic in height
      const leaned = vec3(box.x.sub(vLean.x.mul(box.y).mul(box.y).mul(0.15)), box.y,
        box.z.sub(vLean.y.mul(box.y).mul(box.y).mul(0.15)));
      const mx = mix(leaned.x, float(1).sub(leaned.x), flipX);
      const mz = mix(leaned.z, float(1).sub(leaned.z), flipZ);
      // per-sample cell jitter: golden-ratio walk from the pixel's hash, +-0.5 cell
      const g = float(i).mul(0.618034);
      const cj = vec3(T.fract(h0.add(g)), T.fract(h1.add(g.mul(1.32))), T.fract(h2.add(g.mul(0.79)))).sub(0.5).mul(cell);
      const uvw = vec3(mix(mx, mz, swap), leaned.y, mix(mz, mx, swap)).add(cj);
      // flame envelope (judge (a), 2026-09-29: the raw field filled its box as a column): a
      // teardrop narrowing to the tip, widest a quarter up, and a fade over the top 30 %
      const r = length(T.vec2(box.x.sub(0.5), box.z.sub(0.5)));
      const halfW = T.sqrt(clamp(box.y.mul(4), 0.35, 1)).mul(T.pow(float(1).sub(clamp(box.y, 0, 1)), float(0.8))).mul(0.5);
      const env = float(1).sub(smoothstep(0.55, 1.0, r.div(max(halfW, 1e-3))))
        .mul(float(1).sub(smoothstep(0.7, 1.0, box.y)));
      const temp = texture3D(field.a, uvw).level(0).r.mul(env);
      const a = float(1).sub(exp(temp.mul(sigma).mul(stepLen).negate()));
      // colour by temperature: cool red fringe, orange body, yellow-white core
      // the hottest cells go past the ramp to a near-white kernel (the example's hot core)
      const col = mix(mix(mix(base, tip, smoothstep(0.08, 0.35, temp)), midC, smoothstep(0.5, 0.95, temp)),
        vec3(1.0, 0.93, 0.72), smoothstep(0.9, 1.4, temp));
      const wgt = float(1).sub(alpha).mul(a);
      acc.addAssign(col.mul(wgt));
      alpha.addAssign(wgt);
    });
    If(alpha.lessThan(0.004), () => { Discard(); });
    const avg = acc.div(max(alpha, 1e-3));
    const gainDN = u.uGain.element(row);
    const gain = mix(gainDN.x, gainDN.y, u.uNight);
    // the cards' core/fringe split applied to the ray's opacity: by day the
    // card's core is smoothstep(0.3, 0.75, heat) at alpha 0.95, a solid shape
    // over the sky; the raw optical alpha is a soft gradient that let the sky
    // through (pale, pink-grey). So the day core is the same kind of step on
    // the ray's alpha; by night it relaxes to the raw alpha (the soft volume)
    const core = mix(smoothstep(0.12, 0.55, alpha), alpha, u.uNight);
    const cover = core.mul(mix(0.95, 0.7, u.uNight)).mul(vIntensity);
    const glow = smoothstep(0.0, 0.5, alpha).mul(mix(0.06, 0.55, u.uNight));
    const k = clamp(core.mul(mix(1.0, 0.8, u.uNight)).add(glow).mul(vIntensity), 0, 1);
    const scene = displayToScene(min(avg.mul(gain), vec3(1)), u.uExposure, u.uToneMapped);
    return vec4(scene.mul(k), clamp(cover, 0, 1));
  })();
  return material;
}
