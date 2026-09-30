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
 * Compile cost (L19 round): every preset-specific number is a uniform
 * (`VolumeFieldUniforms`), so all presets' kernels and raymarch materials emit
 * one shader text each, and the renderer builds one render pipeline and one
 * advection compute pipeline for any number of presets and fires. The ray
 * loop's bound is a uniform too: a constant bound let SwiftShader unroll it.
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
/** Detail noise texture edge (texels) and its noise period (cells). */
const DETAIL_N = 32;
const DETAIL_PERIOD = 4;
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

/** Periodic 3-D gradient noise in about -1..1 (quintic fade), lattice period `period` cells. */
function periodicNoise(x: number, y: number, z: number, period: number, salt: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (ix: number, iy: number, iz: number, dx: number, dy: number, dz: number) => {
    const m = (v: number) => ((v % period) + period) % period;
    let h = (m(ix) * 73856093) ^ (m(iy) * 19349663) ^ (m(iz) * 83492791) ^ (salt * 2654435761);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    h ^= h >>> 15;
    const a = ((h >>> 0) % 4096) / 4096 * Math.PI * 2;
    const c = (((h >>> 12) % 4096) / 4096) * 2 - 1;
    const r = Math.sqrt(1 - c * c);
    return (Math.cos(a) * r * dx + Math.sin(a) * r * dy + c * dz) * 1.6;
  };
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const x0 = lerp(grad(xi, yi, zi, fx, fy, fz), grad(xi + 1, yi, zi, fx - 1, fy, fz), u);
  const x1 = lerp(grad(xi, yi + 1, zi, fx, fy - 1, fz), grad(xi + 1, yi + 1, zi, fx - 1, fy - 1, fz), u);
  const x2 = lerp(grad(xi, yi, zi + 1, fx, fy, fz - 1), grad(xi + 1, yi, zi + 1, fx - 1, fy, fz - 1), u);
  const x3 = lerp(grad(xi, yi + 1, zi + 1, fx, fy - 1, fz - 1), grad(xi + 1, yi + 1, zi + 1, fx - 1, fy - 1, fz - 1), u);
  return lerp(lerp(x0, x1, v), lerp(x2, x3, v), w);
}

/**
 * The tiling detail noise (fix 3), baked on the CPU once per FlameSystem and
 * shared by every preset's field (L19 round: the GPU kernel that filled it,
 * and the advection kernel's inline curl noise, were ~70 MaterialX noise
 * calls that took SwiftShader 20-50 s to compile, inside compileAsync).
 * rgb: a vec3 noise in about -1.6..1.6 (the ray's displacement, and the
 * advection's curl potential); a: an erosion fbm in about 0..1.
 * Period `DETAIL_PERIOD` noise cells over the texture, repeat-wrapped.
 */
export function makeVolumeDetail(): THREE.Data3DTexture {
  const n = DETAIL_N, P = DETAIL_PERIOD;
  const data = new Uint16Array(n * n * n * 4);
  const h = THREE.DataUtils.toHalfFloat;
  let o = 0;
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const qx = ((x + 0.5) / n) * P, qy = ((y + 0.5) / n) * P, qz = ((z + 0.5) / n) * P;
    data[o++] = h(periodicNoise(qx, qy, qz, P, 1));
    data[o++] = h(periodicNoise(qx, qy, qz, P, 2));
    data[o++] = h(periodicNoise(qx, qy, qz, P, 3));
    const ero = periodicNoise(qx * 2, qy * 2, qz * 2, 2 * P, 4) * 0.33 + periodicNoise(qx, qy, qz, P, 5) * 0.67;
    data[o++] = h(ero * 0.8 + 0.5);
  }
  const t = new THREE.Data3DTexture(data, n, n, n);
  t.name = "fire-volume-detail";
  t.format = THREE.RGBAFormat;
  t.type = THREE.HalfFloatType;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** A divergence-free velocity: the curl of the detail texture's vec3 potential, by central differences. */
function curlNoise(detail: THREE.Data3DTexture, p: TslNode, octave3: TslNode): TslNode {
  const e = 0.08;
  const tex = (q: TslNode) => texture3D(detail, q.div(DETAIL_PERIOD), 0).xyz;
  const pot = (q: TslNode) => tex(q)
    .add(tex(q.mul(2.07).add(11.3)).mul(0.5))
    .add(tex(q.mul(4.13).add(23.9)).mul(octave3.mul(0.25)));
  const dx = vec3(e, 0, 0), dy = vec3(0, e, 0), dz = vec3(0, 0, e);
  const px0 = pot(p.sub(dx)), px1 = pot(p.add(dx));
  const py0 = pot(p.sub(dy)), py1 = pot(p.add(dy));
  const pz0 = pot(p.sub(dz)), pz1 = pot(p.add(dz));
  const x = py1.z.sub(py0.z).sub(pz1.y).add(pz0.y);
  const y = pz1.x.sub(pz0.x).sub(px1.z).add(px0.z);
  const z = px1.y.sub(px0.y).sub(py1.x).add(py0.x);
  return vec3(x, y, z).div(2 * e);
}

/**
 * The preset's tuning as uniforms (webgpu lead L19 round): every number that
 * differs between presets is a uniform, never a WGSL constant, so every
 * preset's kernels and raymarch material emit the SAME shader text and the
 * renderer compiles one compute and one render pipeline for all of them
 * (20 fires of 5 presets compile what 1 fire compiles). Only the grid and
 * the ray step count stay structural (all presets share them).
 */
export interface VolumeFieldUniforms {
  riseSpeed: TslNode; turbulence: TslNode; noiseScale: TslNode; dissipation: TslNode;
  emit: TslNode; sourceRadius: TslNode; density: TslNode; rootShare: TslNode;
  /** Ray samples: a uniform bound, so the compiler cannot unroll the march
   * (SwiftShader's JIT unrolled the constant 32-step loop: 50-70 s per compile). */
  steps: TslNode;
  /** Weight of the third curl-noise octave: 1 when `octaves` > 2, else 0. */
  octave3: TslNode;
}

function fieldUniforms(c: FireVolumeConfig): VolumeFieldUniforms {
  return {
    riseSpeed: uniform(c.riseSpeed), turbulence: uniform(c.turbulence), noiseScale: uniform(c.noiseScale),
    dissipation: uniform(c.dissipation), emit: uniform(c.emit), sourceRadius: uniform(c.sourceRadius),
    density: uniform(c.density), rootShare: uniform(ROOT / c.box.heightH), octave3: uniform(c.octaves > 2 ? 1 : 0),
    steps: uniform(c.steps, "int"),
  };
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
  readonly u: VolumeFieldUniforms;

  constructor(readonly config: FireVolumeConfig, name: string,
    /** The shared detail noise (`makeVolumeDetail`), owned by the caller. */
    readonly detail: THREE.Data3DTexture) {
    this.u = fieldUniforms(config);
    this.a = makeGrid(config.grid, `${name}-a`);
    this.b = makeGrid(config.grid, `${name}-b`);
    this.kernels = [this.kernel(this.a, this.b), this.kernel(this.b, this.a)];
  }

  private kernel(read: Storage3DTexture, write: Storage3DTexture): TslNode {
    const [gx, gy, gz] = this.config.grid;
    const cells = gx * gy * gz;
    const { uDt, uSimTime } = this;
    const c = this.u;
    return Fn(() => {
      const id = instanceIndex;
      const coord = uvec3(id.mod(gx), id.div(gx).mod(gy), id.div(gx * gy));
      const uvw = vec3(coord).add(0.5).div(vec3(gx, gy, gz));
      const here = texture3D(read, uvw, 0).r;
      // velocity in box units per second: buoyant rise (hot rises faster)
      // plus curl-noise licking that scrolls up with time
      const np = uvw.mul(vec3(c.noiseScale, c.noiseScale.mul(2), c.noiseScale))
        .add(vec3(uSimTime.mul(0.13), uSimTime.mul(-0.9), uSimTime.mul(0.07)));
      const curl = curlNoise(this.detail, np, c.octave3).mul(c.turbulence);
      const rise = c.riseSpeed.mul(clamp(here, 0, 1.2).mul(0.8).add(0.35));
      const vel = vec3(curl.x, curl.y.mul(0.35).add(rise), curl.z);
      // semi-Lagrangian: fetch where this cell's contents came from
      const prev = uvw.sub(vel.mul(uDt));
      const back = texture3D(read, prev, 0).r;
      const cooled = back.mul(exp(uDt.mul(c.dissipation).negate()));
      // flickering source disc on the floor
      const r = length(uvw.xz.sub(0.5).mul(2)).div(c.sourceRadius);
      const flick = texture3D(this.detail, vec3(uvw.x.mul(5), uvw.z.mul(5), uSimTime.mul(3.1)).div(DETAIL_PERIOD), 0).x
        .mul(0.6 / 1.6).add(0.75);
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
  const fu = field.u;
  const material = premultipliedFireMaterial(new NodeMaterial(), "fire-volume");
  material.side = THREE.BackSide;
  const iPosSeed = attribute("iPosSeed", "vec4");
  const iBox = attribute("iBox", "vec4");
  const iAnim = attribute("iAnim", "vec4");
  const position = attribute("position", "vec3");
  const at = iPosSeed.xyz;
  const size = vec3(iBox.x, iBox.y, iBox.x);
  const floor = at.sub(vec3(0, iBox.y.mul(fu.rootShare), 0));
  const world = floor.add(position.mul(size));
  const dist = length(T.cameraPosition.sub(at));
  const share = volumeShareNode(u, dist);
  const intensity = iBox.w.mul(share).mul(fireFlickerNode(u.uTime, iPosSeed.w, iAnim.x, iAnim.y));
  const clip = T.cameraProjectionMatrix.mul(T.cameraViewMatrix).mul(vec4(world, 1));
  material.vertexNode = sel(intensity.greaterThan(0), clip, vec4(2, 2, 2, 1));

  const vWorld = varying(world, "vVolWorld");
  const vFloor = varying(floor, "vVolFloor");
  const vSize = varying(size, "vVolSize");
  // the seed's mirroring variant (0..7), whole in the vertex stage: fix 2 found
  // the streaks were the fragment stage thresholding the INTERPOLATED seed
  // (seeds 0.25 and 0.5 sit on a step edge, so rows flipped variant)
  const vVariant = varying(T.floor(T.fract(iPosSeed.w).mul(8)), "vVolVariant");
  const vPalette = varying(iBox.z, "vVolPalette");
  const vIntensity = varying(intensity, "vVolIntensity");
  const vLean = varying(u.uWind.mul(iAnim.z), "vVolLean");
  const steps = fu.steps;

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
    const stepLen = span.div(float(steps));
    // de-banding: IGN offsets each ray's first sample by a fraction of a step
    const jitter = T.interleavedGradientNoise(T.screenCoordinate.xy).toVar();
    // the seed picks one of 8 mirrorings of the shared field
    const variant = T.floor(vVariant.add(0.5));
    const flipX = T.mod(variant, float(2));
    const flipZ = T.mod(T.floor(variant.mul(0.5)), float(2));
    const swap = step(3.5, variant);
    const tAcc = float(0).toVar();
    const cell = vec3(1 / c.grid[0], 1 / c.grid[1], 1 / c.grid[2]).mul(1.2);
    const dScale = fu.noiseScale.mul(3);
    const dRise = fu.riseSpeed.mul(0.5);
    const alpha = float(0).toVar();
    const row = int(vPalette.add(0.5));
    const base = u.uRamp.element(row.mul(3));
    const midC = u.uRamp.element(row.mul(3).add(1));
    const tip = u.uRamp.element(row.mul(3).add(2));
    // optical depth per metre of ray at temperature 1
    const sigma = fu.density.div(vSize.y);
    Loop({ start: int(0), end: steps, type: "int", condition: "<" }, ({ i }: { i: TslNode }) => {
      const tr = tEnter.add(float(i).add(jitter).mul(stepLen));
      const pos = o.add(d.mul(tr));
      const box = pos.sub(bmin).div(vSize);
      // wind leans the upper field, quadratic in height
      const leaned = vec3(box.x.sub(vLean.x.mul(box.y).mul(box.y).mul(0.15)), box.y,
        box.z.sub(vLean.y.mul(box.y).mul(box.y).mul(0.15)));
      const mx = mix(leaned.x, float(1).sub(leaned.x), flipX);
      const mz = mix(leaned.z, float(1).sub(leaned.z), flipZ);
      const uvw0 = vec3(mix(mx, mz, swap), leaned.y, mix(mz, mx, swap));
      // detail pass (fix 3): noise carried up with the flow at the preset's
      // rise speed; it displaces the fetch by about one grid cell and erodes
      // the cool edge into separate tongues, detail the 16x32x16 grid lacks
      const dp = vec3(uvw0.x.mul(dScale), uvw0.y.mul(dScale.mul(0.55)).sub(u.uTime.mul(dRise)), uvw0.z.mul(dScale))
        .add(variant.mul(3.7));
      const det = texture3D(field.detail, dp.div(DETAIL_PERIOD)).level(0);
      const uvw = uvw0.add(det.xyz.mul(cell));
      const hi = det.w;
      // flame envelope (judge (a), 2026-09-29: the raw field filled its box as a column): a
      // teardrop narrowing to the tip, widest a quarter up, and a fade over the top 30 %
      const r = length(T.vec2(box.x.sub(0.5), box.z.sub(0.5)));
      const halfW = T.sqrt(clamp(box.y.mul(4), 0.35, 1)).mul(T.pow(float(1).sub(clamp(box.y, 0, 1)), float(0.8))).mul(0.5);
      const env = float(1).sub(smoothstep(0.55, 1.0, r.div(max(halfW, 1e-3))))
        .mul(float(1).sub(smoothstep(0.7, 1.0, box.y)));
      const raw = texture3D(field.a, uvw).level(0).r.mul(env);
      // erosion: hot cells survive, cool cells only where the detail noise is high
      const temp = raw.mul(smoothstep(0.35, 0.65, hi.mul(0.8).add(raw.mul(0.5))));
      const a = float(1).sub(exp(temp.mul(sigma).mul(stepLen).negate()));
      // accumulate opacity-weighted temperature, not colour: the ramp is
      // applied once to the ray's temperature (the three.js example's order),
      // so a ray through the hot core lands on the hot colour instead of an
      // average of red, orange and white
      const wgt = float(1).sub(alpha).mul(a);
      tAcc.addAssign(temp.mul(wgt));
      alpha.addAssign(wgt);
    });
    If(alpha.lessThan(0.004), () => { Discard(); });
    // the ray's temperature through a sharp ramp: red fringe, orange body,
    // then a narrow step into the near-white kernel (fix 2, judge (a): the
    // per-sample colour average read as a diffuse orange core)
    const tRay = tAcc.div(max(alpha, 1e-3));
    const avg = mix(mix(mix(base, tip, smoothstep(0.1, 0.3, tRay)), midC, smoothstep(0.35, 0.55, tRay)),
      vec3(1.0, 0.93, 0.72), smoothstep(0.62, 0.78, tRay));
    const gainDN = u.uGain.element(row);
    const gain = mix(gainDN.x, gainDN.y, u.uNight);
    // the cards' core/fringe split applied to the ray's opacity: by day the
    // card's core is smoothstep(0.3, 0.75, heat) at alpha 0.95, a solid shape
    // over the sky; the raw optical alpha is a soft gradient that let the sky
    // through (pale, pink-grey). So the day core is the same kind of step on
    // the ray's alpha; by night it relaxes to the raw alpha (the soft volume)
    const core = mix(smoothstep(0.12, 0.55, alpha), alpha, u.uNight);
    // the thin outer shell adds light and covers nothing, as the cards'
    // fringe does (L19 round: by night the raw alpha let every ray's faint
    // edge cover the background at a near-black colour, 0.224 of
    // fire-stress's drawn pixels read black on WebGPU)
    const cover = core.mul(smoothstep(0.02, 0.12, alpha)).mul(mix(0.95, 0.7, u.uNight)).mul(vIntensity);
    const glow = smoothstep(0.0, 0.5, alpha).mul(mix(0.06, 0.55, u.uNight));
    const k = clamp(core.mul(mix(1.0, 0.8, u.uNight)).add(glow).mul(vIntensity), 0, 1);
    const display = min(avg.mul(gain), vec3(1));
    // a sample that neither covers nor adds half an 8-bit step is not drawn
    // (L19 round: the faint outer shell of every box wrote alpha > 0 with a
    // near-black colour, 0.224 of fire-stress's drawn pixels on WebGPU)
    const visible = max(clamp(cover, 0, 1), max(max(display.x, display.y), display.z).mul(k));
    If(visible.lessThan(0.5 / 255), () => { Discard(); });
    const scene = displayToScene(display, u.uExposure, u.uToneMapped);
    return vec4(scene.mul(k), clamp(cover, 0, 1));
  })();
  return material;
}
