/**
 * The raymarched fire volume (decision 0110; WebGPU backend only).
 *
 * The large presets (`FireConfig.volume`: torches, brazier, hearth,
 * campfire) draw near the camera as a box raymarched through a small
 * stable-fluids grid, a scaled port of three.js webgpu_volume_fire
 * (vol-fix-design.md part B, vol-fire-research.md). One fixed solver step
 * (1/`simHz` s, at most `FIRE_VOLUME_MAX_CATCHUP` per frame) is 4 + `jacobi`
 * compute passes:
 *   1. advect velocity (semi-Lagrangian) with forces: buoyancy b*T - 0.15*smoke,
 *      age-keyed curl from the fire's own curl texture (`makeFireCurl`), an
 *      ambient curl on smoke, wind (uWind x windResponse, rising with height),
 *      damping 0.25/s, wall fade;
 *   2. divergence; 3. Jacobi pressure x `jacobi` (A/B, ends in A);
 *   4. project (subtract the pressure gradient);
 *   5. advect the dye (smoke, temperature, age) with the source disc's
 *      flickering emission fused in.
 * Velocity always ends in `velA`; the dye ping-pongs and `dyeView` (the node
 * the march samples) is pointed at the current one after each step.
 *
 * Sharing: every fire of a preset samples one shared field (mirrored and
 * swapped by its seed, 8 variants, plus a per-seed offset into the march
 * detail); the nearest fires own a private field (FlameSystem). A field
 * steps only in frames where one of its fires is inside the volume reach.
 *
 * Compile cost (L19 round): every preset-specific number is a uniform
 * (`VolumeFieldUniforms`), so all presets' kernels and raymarch materials emit
 * one shader text each. The ray loop's bound is a uniform too: a constant
 * bound let SwiftShader unroll it.
 *
 * Output is the cards' display-referred treatment (core covers, glow adds,
 * `displayToScene` through the frame's tone map), so a volume sits in the
 * same day/night envelope the card fire was judged in; smoke adds a dim
 * cover above the flame.
 *
 * Instance attributes (FlameSystem.ts writes them):
 *   iPosSeed vec4  emitter position (m) in the FlameSystem group's space, seed 0..1
 *   iBox     vec4  box width m, box height m, palette row, intensity 0..1
 *   iAnim    vec4  flicker Hz, flicker share, wind response, unused
 */
import * as THREE from "three";
import { NodeMaterial, Storage3DTexture, type WebGPURenderer } from "three/webgpu";
import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";
import { sel } from "../../render/nodes/materialNodes";
import { FIRE_VOLUME_MAX_CATCHUP, type FireVolumeConfig, type FireVolumeTierConfig } from "./fireTypes";
import { FLAME_VOLUME_ROOT_FADE, displayToScene, fireFlickerNode } from "./fireNodes";
import { FLAME_ROOT_SHARE, premultipliedFireMaterial, volumeShareNode, type FireUniforms } from "./flameMaterial";

const T = tsl as unknown as Record<string, (...a: TslNode[]) => TslNode> & Record<string, TslNode>;
const {
  Fn, If, Discard, Loop, attribute, clamp, exp, float, instanceIndex, int, length, max, min, mix,
  normalize, smoothstep, step, texture3D, textureStore, uniform, uvec3, varying, vec3, vec4,
} = T;

/**
 * The flame's look against the reference (three.js webgpu_volume_fire, captured in vol10 r2b;
 * vol-fire-research.md §1): its ramp runs black -> red #ff0000 (T .05-.35) -> orange #ff7305
 * (.35-.65) -> pale yellow #ffe68c (.65-1). Ours ramps the ray's opacity-weighted temperature
 * through the preset's palette (base = red, tip = orange, mid = yellow) at these edges, the
 * reference's three bands shifted down by the 0.1 our erosion removes from the cool shell.
 */
export const VOLUME_RAMP_EDGES = { redToOrange: [0.18, 0.4], orangeToYellow: [0.42, 0.6], yellowToWhite: [0.66, 0.8] } as const;
/** How much the ray's temperature drops at the top of the flame envelope (opacity-weighted height
 * 0.55 -> 1): the reference's tips are red because its T dissipates with age as the tongue rises
 * (fire lifespan 1.3 s); our coarse grid keeps hot cells to the tip, so the tip cools here. */
export const VOLUME_TIP_COOLING = 0.6;
/** Smoke extinction as a share of the flame's (`density` per box height): the reference's smoke is
 * low density (splat 7/120 per step against T 5.5/120, lifespan 3.5 s), a thin grey veil. */
export const VOLUME_SMOKE_SIGMA_SHARE = 0.35;
/** Smoke albedo-times-light by day (grey, the reference's lit plume) and by night (lit from below by
 * its own flame: a dim warm grey, never the near-black that vanished against a dark room, D11). */
export const VOLUME_SMOKE_DAY = [0.3, 0.28, 0.26] as const;
export const VOLUME_SMOKE_NIGHT = [0.11, 0.075, 0.05] as const;

/** Steps run when a field is first used (1 s at 60 Hz), so a fire lit on screen is already burning. */
export const VOLUME_PREWARM_STEPS = 60;
/** The curl texture's noise lattice period (cells across the texture). */
const CURL_PERIOD = 8;
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
 * The fire's own curl texture (vol-fix-design.md B2): the curl of a periodic
 * vec3 gradient noise (lattice period `CURL_PERIOD`), by central differences
 * on the texture's own lattice, normalised to unit rms; `n`^3 rgba16float,
 * repeat-wrapped. Deterministic (std 6); baked once per FlameSystem. The fog
 * never samples it.
 */
export function makeFireCurl(n: number): THREE.Data3DTexture {
  const P = CURL_PERIOD;
  const pot = new Float32Array(n * n * n * 3);
  let o = 0;
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const qx = (x / n) * P, qy = (y / n) * P, qz = (z / n) * P;
    pot[o++] = periodicNoise(qx, qy, qz, P, 11);
    pot[o++] = periodicNoise(qx, qy, qz, P, 12);
    pot[o++] = periodicNoise(qx, qy, qz, P, 13);
  }
  const at = (x: number, y: number, z: number, c: number) =>
    pot[((((z + n) % n) * n + ((y + n) % n)) * n + ((x + n) % n)) * 3 + c];
  const curl = new Float32Array(n * n * n * 3);
  let sum = 0;
  o = 0;
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const cx = (at(x, y + 1, z, 2) - at(x, y - 1, z, 2)) - (at(x, y, z + 1, 1) - at(x, y, z - 1, 1));
    const cy = (at(x, y, z + 1, 0) - at(x, y, z - 1, 0)) - (at(x + 1, y, z, 2) - at(x - 1, y, z, 2));
    const cz = (at(x + 1, y, z, 1) - at(x - 1, y, z, 1)) - (at(x, y + 1, z, 0) - at(x, y - 1, z, 0));
    curl[o++] = cx; curl[o++] = cy; curl[o++] = cz;
    sum += cx * cx + cy * cy + cz * cz;
  }
  const k = 1 / Math.sqrt(sum / (n * n * n) / 3 || 1);
  const data = new Uint16Array(n * n * n * 4);
  const h = THREE.DataUtils.toHalfFloat;
  for (let i = 0, j = 0; i < curl.length; i += 3) {
    data[j++] = h(curl[i] * k); data[j++] = h(curl[i + 1] * k); data[j++] = h(curl[i + 2] * k); data[j++] = h(1);
  }
  const t = new THREE.Data3DTexture(data, n, n, n);
  t.name = "fire-curl";
  t.format = THREE.RGBAFormat;
  t.type = THREE.HalfFloatType;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/**
 * The preset's tuning as uniforms (webgpu lead L19 round): every number that
 * differs between presets is a uniform, never a WGSL constant, so every
 * preset's kernels and raymarch material emit the SAME shader text. Only the
 * grid and the Jacobi count stay structural.
 */
export interface VolumeFieldUniforms {
  buoyancy: TslNode; turbulence: TslNode; noiseScale: TslNode; dissipation: TslNode;
  emit: TslNode; sourceRadius: TslNode; density: TslNode; rootShare: TslNode;
  /** Ray samples: a uniform bound, so the compiler cannot unroll the march. */
  steps: TslNode;
  /** Weight of the third curl octave: 1 when `octaves` > 2, else 0. */
  octave3: TslNode;
  /** Wind response of the preset (FireConfig.windResponse). */
  windResponse: TslNode;
  /** This field's offset into the curl texture (0 shared; per-seed on a private field). */
  seedOffset: TslNode;
  /** Share of the box height the flame envelope spans (`FireVolumeConfig.flameShare`); the smoke plume above. */
  flameShare: TslNode;
}

function fieldUniforms(c: FireVolumeConfig, steps: number, windResponse: number): VolumeFieldUniforms {
  return {
    buoyancy: uniform(c.buoyancy), turbulence: uniform(c.turbulence), noiseScale: uniform(c.noiseScale),
    dissipation: uniform(c.dissipation), emit: uniform(c.emit), sourceRadius: uniform(c.sourceRadius),
    density: uniform(c.density), rootShare: uniform(ROOT / c.box.heightH), octave3: uniform(c.octaves > 2 ? 1 : 0),
    steps: uniform(steps, "int"), windResponse: uniform(windResponse), seedOffset: uniform(new THREE.Vector3()),
    flameShare: uniform(c.flameShare ?? 1),
  };
}

/** Options of one field. */
export interface VolumeFieldOptions {
  config: FireVolumeConfig;
  name: string;
  /** The fire's curl texture (`makeFireCurl`), owned by the caller. */
  curl: THREE.Data3DTexture;
  /** The tier's solver settings (Jacobi count is structural: a tier change builds new fields). */
  tier: FireVolumeTierConfig;
  /** March steps for this tier. */
  steps: number;
  /** FireConfig.windResponse of the preset. */
  windResponse: number;
  /** World wind, xz m/s (FireUniforms.uWind). */
  wind: TslNode;
}

/**
 * One field: velocity, pressure and dye grids and the solver passes over
 * them. GPU memory `fireVolumeCost(config).fieldMB`.
 */
export class VolumeFireField {
  readonly config: FireVolumeConfig;
  readonly curl: THREE.Data3DTexture;
  readonly u: VolumeFieldUniforms;
  /** The current dye (smoke, temperature, age): the march samples through this node. */
  readonly dyeView: TslNode;
  private readonly textures: Storage3DTexture[];
  private readonly dye: [Storage3DTexture, Storage3DTexture];
  /** Per dye parity, the step's passes in order. */
  private readonly passes: [TslNode[], TslNode[]];
  private parity = 0;
  private readonly uDt: TslNode;
  private readonly uSimTime = uniform(0);
  private readonly uAmbient = uniform(new THREE.Vector3());
  private readonly stepS: number;
  private simTime = 0;
  private warmed = false;

  constructor(o: VolumeFieldOptions) {
    this.config = o.config;
    this.curl = o.curl;
    this.stepS = 1 / o.tier.simHz;
    this.uDt = uniform(this.stepS);
    this.u = fieldUniforms(o.config, o.steps, o.windResponse);
    const g = o.config.grid;
    const velA = makeGrid(g, `${o.name}-vel-a`), velB = makeGrid(g, `${o.name}-vel-b`);
    const pA = makeGrid(g, `${o.name}-p-a`), pB = makeGrid(g, `${o.name}-p-b`);
    const div = makeGrid(g, `${o.name}-div`);
    this.dye = [makeGrid(g, `${o.name}-dye-a`), makeGrid(g, `${o.name}-dye-b`)];
    this.textures = [velA, velB, pA, pB, div, ...this.dye];
    this.dyeView = texture3D(this.dye[0]);
    const build = (dyeR: Storage3DTexture, dyeW: Storage3DTexture): TslNode[] => {
      const list = [this.advectVelocity(velA, dyeR, velB, o.wind), this.divergence(velB, div)];
      for (let i = 0; i < o.tier.jacobi; i++) list.push(i % 2 === 0 ? this.jacobi(pA, div, pB) : this.jacobi(pB, div, pA));
      list.push(this.project(velB, o.tier.jacobi % 2 === 0 ? pA : pB, velA), this.advectDye(velA, dyeR, dyeW));
      return list;
    };
    this.passes = [build(this.dye[0], this.dye[1]), build(this.dye[1], this.dye[0])];
  }

  /** Compute passes per solver step. */
  get passesPerStep(): number { return this.passes[0].length; }

  private cell(): { coord: TslNode; uvw: TslNode; cells: number; inv: TslNode } {
    const [gx, gy, gz] = this.config.grid;
    const id = instanceIndex;
    const coord = uvec3(id.mod(gx), id.div(gx).mod(gy), id.div(gx * gy));
    return { coord, uvw: vec3(coord).add(0.5).div(vec3(gx, gy, gz)), cells: gx * gy * gz, inv: vec3(1 / gx, 1 / gy, 1 / gz) };
  }

  private wall(uvw: TslNode): TslNode {
    return smoothstep(0.0, 0.08, min(min(uvw.x, float(1).sub(uvw.x)), min(uvw.z, float(1).sub(uvw.z))))
      .mul(float(1).sub(smoothstep(0.92, 1.0, uvw.y)));
  }

  private curlAt(q: TslNode): TslNode {
    const c = this.u;
    return texture3D(this.curl, q, 0).xyz
      .add(texture3D(this.curl, q.mul(2.07).add(0.31), 0).xyz.mul(0.5))
      .add(texture3D(this.curl, q.mul(4.13).add(0.67), 0).xyz.mul(c.octave3.mul(0.25)));
  }

  private advectVelocity(velR: Storage3DTexture, dyeR: Storage3DTexture, velW: Storage3DTexture, wind: TslNode): TslNode {
    const { coord, uvw, cells } = this.cell();
    const c = this.u;
    const { uDt, uAmbient } = this;
    return Fn(() => {
      const v0 = texture3D(velR, uvw, 0).xyz;
      const v = texture3D(velR, uvw.sub(v0.mul(uDt)), 0).xyz.toVar();
      const d = texture3D(dyeR, uvw, 0);
      const smoke = d.x, temp = d.y, age = d.z;
      v.y.addAssign(c.buoyancy.mul(temp).sub(smoke.mul(0.15)).mul(uDt));
      // age-keyed curl: each parcel gets its own evolving push (vol-fire-research.md 1)
      const q = uvw.mul(c.noiseScale.div(CURL_PERIOD)).add(vec3(0, age.mul(-0.6), age.mul(0.13)).div(CURL_PERIOD))
        .add(c.seedOffset);
      v.addAssign(this.curlAt(q).mul(c.turbulence.mul(3.2).mul(temp).mul(exp(age.mul(-0.1)))).mul(uDt));
      // ambient drift on the smoke (CPU-wrapped time scroll)
      v.addAssign(texture3D(this.curl, uvw.mul(0.5 / CURL_PERIOD).add(uAmbient), 0).xyz
        .mul(c.turbulence.mul(0.2).mul(smoke)).mul(uDt));
      // wind leans and sheds the tongues: a horizontal force rising with height
      const lean = wind.mul(c.windResponse).mul(uvw.y.mul(uvw.y)).mul(1.5).mul(uDt);
      v.x.addAssign(lean.x);
      v.z.addAssign(lean.y);
      const out = v.mul(float(1).sub(uDt.mul(0.25))).mul(this.wall(uvw));
      textureStore(velW, coord, vec4(out, 1)).toWriteOnly();
    })().compute(cells).setName("fireVolumeAdvectVelocity");
  }

  private divergence(velR: Storage3DTexture, divW: Storage3DTexture): TslNode {
    const { coord, uvw, cells, inv } = this.cell();
    const [gx, gy, gz] = this.config.grid;
    return Fn(() => {
      const at = (dx: number, dy: number, dz: number) => texture3D(velR, uvw.add(vec3(dx, dy, dz).mul(inv)), 0);
      const dv = at(1, 0, 0).x.sub(at(-1, 0, 0).x).mul(gx)
        .add(at(0, 1, 0).y.sub(at(0, -1, 0).y).mul(gy))
        .add(at(0, 0, 1).z.sub(at(0, 0, -1).z).mul(gz)).mul(0.5);
      textureStore(divW, coord, vec4(dv, 0, 0, 1)).toWriteOnly();
    })().compute(cells).setName("fireVolumeDivergence");
  }

  private jacobi(pR: Storage3DTexture, divR: Storage3DTexture, pW: Storage3DTexture): TslNode {
    const { coord, uvw, cells, inv } = this.cell();
    return Fn(() => {
      const at = (dx: number, dy: number, dz: number) => texture3D(pR, uvw.add(vec3(dx, dy, dz).mul(inv)), 0).x;
      const sum = at(1, 0, 0).add(at(-1, 0, 0)).add(at(0, 1, 0)).add(at(0, -1, 0)).add(at(0, 0, 1)).add(at(0, 0, -1));
      const p = sum.sub(texture3D(divR, uvw, 0).x).div(6);
      textureStore(pW, coord, vec4(p, 0, 0, 1)).toWriteOnly();
    })().compute(cells).setName("fireVolumeJacobi");
  }

  private project(velR: Storage3DTexture, pR: Storage3DTexture, velW: Storage3DTexture): TslNode {
    const { coord, uvw, cells, inv } = this.cell();
    return Fn(() => {
      const at = (dx: number, dy: number, dz: number) => texture3D(pR, uvw.add(vec3(dx, dy, dz).mul(inv)), 0).x;
      const grad = vec3(at(1, 0, 0).sub(at(-1, 0, 0)), at(0, 1, 0).sub(at(0, -1, 0)), at(0, 0, 1).sub(at(0, 0, -1)))
        .mul(0.5).mul(inv);
      textureStore(velW, coord, vec4(texture3D(velR, uvw, 0).xyz.sub(grad), 1)).toWriteOnly();
    })().compute(cells).setName("fireVolumeProject");
  }

  private advectDye(velR: Storage3DTexture, dyeR: Storage3DTexture, dyeW: Storage3DTexture): TslNode {
    const { coord, uvw, cells } = this.cell();
    const c = this.u;
    const { uDt, uSimTime } = this;
    return Fn(() => {
      const v = texture3D(velR, uvw, 0).xyz;
      const d = texture3D(dyeR, uvw.sub(v.mul(uDt)), 0);
      const smoke = d.x.mul(float(1).sub(uDt.div(2.0)));
      const temp = d.y.mul(float(1).sub(uDt.mul(c.dissipation)));
      // the source disc, flickering from the fire's own noise at (seed, t)
      const r = length(uvw.xz.sub(0.5).mul(2)).div(c.sourceRadius);
      const flick = texture3D(this.curl, vec3(uvw.x.mul(0.6), uvw.z.mul(0.6), uSimTime.mul(0.35)).add(c.seedOffset), 0).x
        .mul(0.25).add(0.85);
      const src = float(1).sub(smoothstep(0.55, 1.0, r)).mul(float(1).sub(smoothstep(0.0, 0.14, uvw.y)));
      const feed = src.mul(c.emit).mul(uDt).mul(flick);
      const t = min(temp.add(feed), float(1.6));
      const s = min(smoke.add(feed.mul(0.4)), float(2));
      const aged = mix(d.z.add(uDt), float(0), src);
      const age = sel(s.lessThan(0.01), float(0), aged);
      const wall = this.wall(uvw);
      textureStore(dyeW, coord, vec4(s.mul(wall), t.mul(wall), age, 1)).toWriteOnly();
    })().compute(cells).setName("fireVolumeAdvectDye");
  }

  private runStep(renderer: WebGPURenderer): void {
    this.simTime += this.stepS;
    this.uSimTime.value = this.simTime;
    const t = this.simTime;
    (this.uAmbient.value as THREE.Vector3).set(0, (0.25 * t / CURL_PERIOD) % 1, (0.06 * t / CURL_PERIOD) % 1);
    const list = this.passes[this.parity];
    for (let i = 0; i < list.length; i++) renderer.compute(list[i]);
    this.parity ^= 1;
    (this.dyeView as unknown as { value: THREE.Texture }).value = this.dye[this.parity];
  }

  /** Run the prewarm now (FlameSystem.warm at mount; else the first `step`). */
  warm(renderer: WebGPURenderer, timeS: number): void {
    if (this.warmed) return;
    this.warmed = true;
    for (let i = 0; i < VOLUME_PREWARM_STEPS; i++) this.runStep(renderer);
    this.simTime = timeS;
  }

  /** Advance the field to `timeS` in fixed steps (at most FIRE_VOLUME_MAX_CATCHUP; prewarms on first use). */
  step(renderer: WebGPURenderer, timeS: number): void {
    if (!this.warmed) { this.warm(renderer, timeS); return; }
    if (timeS < this.simTime - 1) this.simTime = timeS; // a clock jump back (harness reset)
    let n = 0;
    while (this.simTime + this.stepS <= timeS && n < FIRE_VOLUME_MAX_CATCHUP) { this.runStep(renderer); n++; }
    if (timeS - this.simTime > this.stepS) this.simTime = timeS - this.stepS; // drop the backlog, never spiral
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
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
 * The raymarch material of one field's volumes, sampling its current dye (`field.dyeView`).
 * Drawn on the box's back faces, so a camera inside the box still sees it.
 */
export function makeVolumeMaterial(u: FireUniforms, field: VolumeFireField): NodeMaterial {
  const c = field.config;
  const fu = field.u;
  const material = premultipliedFireMaterial(new NodeMaterial(), "fire-volume");
  material.side = THREE.BackSide;
  // diag7 O9: no depth test on the back face (a ray whose exit lies under the
  // ground was discarded whole, cutting every flame base flat); the march ends
  // at the scene depth instead, so walls in front still hide the flame
  material.depthTest = false;
  const iPosSeed = attribute("iPosSeed", "vec4");
  const iBox = attribute("iBox", "vec4");
  const iAnim = attribute("iAnim", "vec4");
  const position = attribute("position", "vec3");
  const at = T.modelWorldMatrix.mul(vec4(iPosSeed.xyz, 1)).xyz; // group space -> world (interior cells stand at 4000 m)
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
  const vSeed = varying(iPosSeed.w, "vVolSeed");
  const vIntensity = varying(intensity, "vVolIntensity");
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
    // the scene's eye depth behind this pixel (the pass's low target holds the
    // copied scene depth; viewportDepthTexture reads a per-render copy of it,
    // never the bound attachment), turned into a distance along the ray
    const sceneEyeZ = T.perspectiveDepthToViewZ(T.viewportDepthTexture().x, T.cameraNear, T.cameraFar).negate();
    const dEyeZ = max(T.cameraViewMatrix.mul(vec4(d, 0)).z.negate(), float(1e-4));
    const tExit = min(min(min(tf.x, tf.y), tf.z), sceneEyeZ.div(dEyeZ));
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
    const hAcc = float(0).toVar();
    const cell = vec3(1 / c.grid[0], 1 / c.grid[1], 1 / c.grid[2]).mul(1.2);
    const smokeA = float(0).toVar();
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
      // the wind lean is in the field (its velocity carries the force); the box stays upright
      const leaned = box;
      const mx = mix(leaned.x, float(1).sub(leaned.x), flipX);
      const mz = mix(leaned.z, float(1).sub(leaned.z), flipZ);
      const uvw0 = vec3(mix(mx, mz, swap), leaned.y, mix(mz, mx, swap));
      // detail: one fetch of the fire's curl texture, offset per seed (B4) so two fires of
      // one shared field never match outline for outline; it displaces the dye fetch by about
      // a cell and erodes the cool edge into separate tongues
      const dp = uvw0.mul(2.3 / 8).add(vec3(0, u.uTime.mul(-0.05), 0)).add(vSeed.mul(0.618));
      const det = texture3D(field.curl, dp).level(0);
      const uvw = uvw0.add(det.xyz.mul(cell));
      const hi = clamp(det.y.mul(0.3).add(0.5), 0, 1);
      // flame envelope (judge (a), 2026-09-29: the raw field filled its box as a column): a
      // teardrop narrowing to the tip, widest a quarter up, and a fade over the top 30 %
      // the envelope spans the lower `flameShare` of the box (fy 0..1); the smoke plume rises above it
      const r = length(T.vec2(box.x.sub(0.5), box.z.sub(0.5)));
      const fy = box.y.div(fu.flameShare);
      const halfW = T.sqrt(clamp(fy.mul(4), 0.35, 1)).mul(T.pow(float(1).sub(clamp(fy, 0, 1)), float(0.8))).mul(0.5);
      const env = float(1).sub(smoothstep(0.55, 1.0, r.div(max(halfW, 1e-3))))
        .mul(float(1).sub(smoothstep(0.7, 1.0, fy)))
        // zero at the emitter plane: nothing below it (inside the fuel) draws, no hard cut
        .mul(smoothstep(fu.rootShare, fu.rootShare.add(FLAME_VOLUME_ROOT_FADE), box.y));
      // plume: a column widening as it rises (radius 0.15 -> 0.45 box widths), from half the
      // flame's height to a fade over the box's top 15 %
      const plume = float(1).sub(smoothstep(0.6, 1.0, r.div(box.y.mul(0.3).add(0.15))))
        .mul(smoothstep(fu.flameShare.mul(0.5), fu.flameShare, box.y))
        .mul(float(1).sub(smoothstep(0.85, 1.0, box.y)));
      const dye = field.dyeView.sample(uvw).level(0);
      const raw = dye.y.mul(env);
      // erosion: hot cells survive, cool cells only where the detail noise is high
      const temp = raw.mul(smoothstep(0.35, 0.65, hi.mul(0.8).add(raw.mul(0.5))));
      const a = float(1).sub(exp(temp.mul(sigma).mul(stepLen).negate()));
      // accumulate opacity-weighted temperature, not colour: the ramp is
      // applied once to the ray's temperature (the three.js example's order),
      // so a ray through the hot core lands on the hot colour instead of an
      // average of red, orange and white
      const wgt = float(1).sub(alpha).mul(a);
      tAcc.addAssign(temp.mul(wgt));
      hAcc.addAssign(clamp(fy, 0, 1).mul(wgt));
      alpha.addAssign(wgt);
      // smoke: absorbs behind the fire's own cover, above all over the tip
      const sa = float(1).sub(exp(dye.x.mul(plume).mul(sigma).mul(VOLUME_SMOKE_SIGMA_SHARE).mul(stepLen).negate()));
      smokeA.addAssign(float(1).sub(alpha).sub(smokeA).max(0).mul(sa));
    });
    If(alpha.add(smokeA).lessThan(0.004), () => { Discard(); });
    // the ray's temperature through a sharp ramp: red fringe, orange body,
    // then a narrow step into the near-white kernel (fix 2, judge (a): the
    // per-sample colour average read as a diffuse orange core)
    // the tip cools toward red (VOLUME_TIP_COOLING), then the three bands of VOLUME_RAMP_EDGES
    const hRay = hAcc.div(max(alpha, 1e-3));
    const tRay = tAcc.div(max(alpha, 1e-3)).mul(float(1).sub(smoothstep(0.55, 1.0, hRay).mul(VOLUME_TIP_COOLING)));
    const E = VOLUME_RAMP_EDGES;
    const avg = mix(mix(mix(base, tip, smoothstep(E.redToOrange[0], E.redToOrange[1], tRay)), midC,
      smoothstep(E.orangeToYellow[0], E.orangeToYellow[1], tRay)),
    vec3(1.0, 0.93, 0.72), smoothstep(E.yellowToWhite[0], E.yellowToWhite[1], tRay));
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
    const smokeCover = clamp(smokeA.mul(0.6).mul(vIntensity), 0, 1);
    const visible = max(max(clamp(cover, 0, 1), smokeCover), max(max(display.x, display.y), display.z).mul(k));
    If(visible.lessThan(0.5 / 255), () => { Discard(); });
    const scene = displayToScene(display, u.uExposure, u.uToneMapped);
    const smokeScene = displayToScene(mix(vec3(...VOLUME_SMOKE_DAY), vec3(...VOLUME_SMOKE_NIGHT), u.uNight), u.uExposure, u.uToneMapped);
    const c0 = clamp(cover, 0, 1);
    return vec4(scene.mul(k).add(smokeScene.mul(smokeCover).mul(float(1).sub(c0))),
      c0.add(smokeCover.mul(float(1).sub(c0))));
  })();
  return material;
}
