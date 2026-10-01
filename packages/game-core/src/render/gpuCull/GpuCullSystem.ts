/**
 * GPU-driven culling and LOD rung selection for instanced draws (decision
 * 0108 §7, lane L9, WebGPU backend only).
 *
 * THE SHAPE. One system owns one ROW ARENA. A draw (one InstancedMesh: one
 * species × rung × part) registers with a capacity and gets a contiguous row
 * range `[base, base + capacity)`. Its candidates (every copy of the resident
 * cells that COULD draw in it) are written into those rows of the candidate
 * buffers once, when a cell builds, and never re-uploaded per frame. Each
 * frame one compute pass
 *   1. zeroes every draw's indirect `instanceCount`, then
 *   2. per candidate: bounding sphere (swept along the sun shadow for a
 *      casting draw) against the six frustum planes, then the draw's LOD band
 *      with the SAME ramps and camera history the vertex shader's `lodFade`
 *      uses (`cullMath.ts` is the tested TypeScript twin), and for a kept copy
 *      `atomicAdd`s the draw's `instanceCount` and copies the matrix and the
 *      batch-data slot into row `base + old` of the OUTPUT buffers.
 * The draw's `instanceMatrix` IS the output matrix buffer (a
 * `StorageInstancedBufferAttribute` shared by every draw of the system, so
 * three's `InstanceNode` reads it through a storage `element(instanceIndex)`)
 * and its `esSlot` attribute is the output slot buffer; the indirect args put
 * `firstInstance = base`, so `instanceIndex` lands in the draw's own rows.
 * Materials are untouched: the same NodeMaterial graph draws from either
 * source, and a copy kept during a cross-fade lands in both rungs exactly as
 * the CPU path shows both.
 *
 * Deviation from the lead's sketch (an id list read in positionNode): the
 * compute copies the 64-byte matrix instead of a 4-byte id, so the vertex
 * stage keeps three's own instance path and no material changes (the id list
 * would need every feature that reads the instance matrix — wind, LOD fade,
 * billboards — to learn a second source). The copy costs visible rows only.
 *
 * Per-frame CPU->GPU traffic: the frustum planes, the sun sweep and the
 * candidate high-water (uniforms); the camera position and history are the
 * lodFade uniforms the materials already read.
 *
 * Needs `indirect-first-instance` (every draw but the first has a non-zero
 * `firstInstance`); `GpuCullSystem.supported(renderer)` says whether the
 * device has it, and the caller keeps its CPU path when it does not.
 */
import * as THREE from "three";
import {
  IndirectStorageBufferAttribute, StorageBufferAttribute, StorageInstancedBufferAttribute,
  type WebGPURenderer,
} from "three/webgpu";
import * as tsl from "three/tsl";
import type { LodFadeUniforms } from "../../fx/lodFade";
import { sel, type TslNode } from "../nodes/materialNodes";
import {
  BAYER4_MAX, BAND_EPS_M, DRAW_CASTS, DRAW_FROM_ZERO, DRAW_NO_BAND, EMPTY_DRAW,
  INDIRECT_STRIDE, LOD_FADE_SAMPLES, LOD_OPEN_M, RangeAllocator, SWEEP_MAX_M, indirectArgs,
  type SunSweep,
} from "./cullMath";
import { installStableInstanceNames } from "./stableInstanceNames";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
/* eslint-disable @typescript-eslint/no-explicit-any */
const {
  Fn, If, Return, storage, uniform, uniformArray, instanceIndex, atomicAdd, atomicStore,
  uint, float, max, min, smoothstep, step, distance, length,
} = tsl as unknown as Record<string, any>;

/** `addUpdateRange`, merged into the last range when the two touch: slots
 * are handed out in order, so a cell fill is a few ranges, not one per copy
 * (each range is its own `writeBuffer`). */
function addRange(attr: THREE.BufferAttribute, start: number, count: number): void {
  const ranges = attr.updateRanges;
  const last = ranges[ranges.length - 1];
  if (last && last.start + last.count === start) last.count += count;
  else if (last && start + count === last.start) { last.start = start; last.count += count; }
  else attr.addUpdateRange(start, count);
}

/** Workgroup size of both compute passes. */
const WG = 64;

export interface GpuCullDrawOptions {
  /** Rows (maximum candidates) the draw owns. */
  capacity: number;
  /** Object-space bounding sphere of the drawn geometry (unscaled). */
  sphere: THREE.Sphere;
  /** LOD band `[dIn, dOut, wIn, wOut]` (lodFade's `esLodBand`); null = frustum only. */
  band: readonly [number, number, number, number] | null;
  /** The draw casts the sun shadow: its sphere is swept along the shadow. */
  casts: boolean;
  /** Its shadow band starts at 0 (`shadowBandFromZero`): keep copies nearer than the inner edge. */
  fromZero: boolean;
}

export interface GpuCullDraw {
  index: number;
  base: number;
  capacity: number;
}

export interface GpuCullSystemOptions {
  /** Total rows (sum of every draw's capacity the system can hold). */
  rows: number;
  /** Draws the indirect buffer holds. */
  maxDraws: number;
  /** The lodFade uniforms the draws' materials read (camera position + history). */
  lodFade: LodFadeUniforms;
  /** Extra vec4 per-row channels copied with a kept candidate (ground cover's
   * tint and its per-row LOD band); 0 by default. Output channel `c` is
   * `payloads[c]`, bound by the caller (an `instanceColor`, a band attribute). */
  payloads?: number;
}

/** Whether the renderer can run the GPU path. */
function supported(renderer: WebGPURenderer): boolean {
  const backend = (renderer as any).backend;
  if (!backend?.isWebGPUBackend) return false;
  const features: Set<string> | undefined = backend.device?.features;
  return !!features?.has("indirect-first-instance");
}

export class GpuCullSystem {
  static supported = supported;

  /** Output matrices: the `instanceMatrix` of every registered draw. */
  readonly matrices: StorageInstancedBufferAttribute;
  /** Output batch-data slots: the `esSlot` attribute of every registered draw. */
  readonly slots: StorageInstancedBufferAttribute;
  /** Indirect draw args, `INDIRECT_STRIDE` u32 per draw. */
  readonly indirect: IndirectStorageBufferAttribute;
  /** Output vec4 payload channels (`options.payloads`), row for row with `matrices`. */
  readonly payloads: StorageInstancedBufferAttribute[];

  /** Candidates, `stride` vec4 a row: the matrix's four columns, then one
   * per payload channel. One buffer, and the draws' info + band one more:
   * WebGPU allows 8 storage buffers per compute stage (the payload-carrying
   * ground-cover cull uses all 8). */
  private readonly cand: StorageBufferAttribute;
  private readonly stride: number;
  private readonly candInfo: StorageBufferAttribute;
  /** Per draw two vec4: (radius, centreY, flags, base), then the LOD band. */
  private readonly draws: StorageBufferAttribute;
  private readonly rowsAlloc: RangeAllocator;
  private readonly freeDraws: number[] = [];
  private nextDraw = 0;
  /** Rows the cull dispatch covers (the arena's high-water mark). */
  private high = 0;

  private readonly uPlanes: { array: THREE.Vector4[] } & TslNode;
  private readonly uSun: { value: THREE.Vector3 } & TslNode;
  private readonly uHigh: { value: number } & TslNode;
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly resetNode: TslNode;
  private readonly cullNode: TslNode;

  constructor(readonly options: GpuCullSystemOptions) {
    installStableInstanceNames();
    const { rows, maxDraws } = options;
    this.matrices = new StorageInstancedBufferAttribute(new Float32Array(rows * 16), 16);
    this.slots = new StorageInstancedBufferAttribute(new Float32Array(rows), 1);
    this.indirect = new IndirectStorageBufferAttribute(new Uint32Array(maxDraws * INDIRECT_STRIDE), 1);
    const channels = options.payloads ?? 0;
    this.stride = 4 + channels;
    this.cand = new StorageBufferAttribute(new Float32Array(rows * this.stride * 4), 4);
    this.payloads = Array.from({ length: channels },
      () => new StorageInstancedBufferAttribute(new Float32Array(rows * 4), 4));
    const info = new Uint32Array(rows * 2);
    for (let r = 0; r < rows; r++) info[r * 2] = EMPTY_DRAW;
    this.candInfo = new StorageBufferAttribute(info, 2);
    this.draws = new StorageBufferAttribute(new Float32Array(maxDraws * 8), 4);
    this.rowsAlloc = new RangeAllocator(rows);

    this.uPlanes = uniformArray(Array.from({ length: 6 }, () => new THREE.Vector4()), "vec4");
    this.uSun = uniform(new THREE.Vector3());
    this.uHigh = uniform(0, "uint");

    const indirectAtomic = storage(this.indirect, "uint", maxDraws * INDIRECT_STRIDE).toAtomic();
    this.resetNode = Fn(() => {
      If(instanceIndex.greaterThanEqual(uint(maxDraws)), () => { Return(); });
      atomicStore(indirectAtomic.element(instanceIndex.mul(INDIRECT_STRIDE).add(1)), uint(0));
    })().compute(maxDraws, [WG]).setName("gpuCull");
    this.cullNode = this.buildCull(indirectAtomic).compute(rows, [WG]).setName("gpuCullRows");
  }

  private buildCull(indirectAtomic: TslNode): TslNode {
    const { rows, maxDraws, lodFade } = this.options;
    const S = this.stride;
    const cand = storage(this.cand, "vec4", rows * S).toReadOnly();
    const candInfo = storage(this.candInfo, "uvec2", rows).toReadOnly();
    const draws = storage(this.draws, "vec4", maxDraws * 2).toReadOnly();
    const outMat = storage(this.matrices, "vec4", rows * 4);
    const outSlot = storage(this.slots, "float", rows);
    const outPay = this.payloads.map((a) => storage(a, "vec4", rows));
    const planes = this.uPlanes;
    const sun = this.uSun;
    const high = this.uHigh;

    // The vertex shader's ramp (lodFade `rampNode`), averaged over the history.
    const ramp = (edge: TslNode, w: TslNode, d: TslNode): TslNode => {
      const ws = max(w, float(1e-6));
      return sel(w.greaterThan(0), smoothstep(edge.sub(ws), edge.add(ws), d), step(edge, d));
    };
    const meanRamp = (edge: TslNode, w: TslNode, origin: TslNode): TslNode => {
      let s: TslNode = float(0);
      for (let k = 0; k < LOD_FADE_SAMPLES; k++) {
        const cam = lodFade.esLodViewPos.xz.add(lodFade.esLodHist.element(k).xy);
        s = s.add(ramp(edge, w, distance(cam, origin)));
      }
      return s.div(LOD_FADE_SAMPLES);
    };

    return Fn(() => {
      const i = instanceIndex;
      If(i.greaterThanEqual(high), () => { Return(); });
      const ci = candInfo.element(i).toVar();
      const d = ci.x;
      If(d.equal(uint(EMPTY_DRAW)), () => { Return(); });
      const at = i.mul(S).toVar();
      const c0 = cand.element(at).toVar();
      const c1 = cand.element(at.add(1)).toVar();
      const c2 = cand.element(at.add(2)).toVar();
      const c3 = cand.element(at.add(3)).toVar();
      const di = draws.element(d.mul(2)).toVar(); // (radius, centreY, flags, base)
      const flags = uint(di.z);
      const scale = max(max(length(c0.xyz), length(c1.xyz)), length(c2.xyz));
      const r = di.x.mul(scale).toVar();
      const centre = c3.xyz.add(c1.xyz.mul(di.y)).toVar();

      // 1. Frustum, the caster's sphere swept along the sun shadow.
      const casts = flags.bitAnd(uint(DRAW_CASTS)).notEqual(uint(0));
      const len = sel(casts, min(float(SWEEP_MAX_M), r.mul(2).mul(sun.z)), float(0));
      const sx = sun.x.mul(len).toVar();
      const sz = sun.y.mul(len).toVar();
      for (let p = 0; p < 6; p++) {
        const pl = planes.element(p);
        const dist = pl.xyz.dot(centre).add(pl.w);
        const gain = max(float(0), pl.x.mul(sx).add(pl.z.mul(sz)));
        If(dist.add(gain).lessThan(r.negate()), () => { Return(); });
      }

      // 2. The LOD band, every edge moved BAND_EPS_M the permissive way.
      If(flags.bitAnd(uint(DRAW_NO_BAND)).equal(uint(0)), () => {
        const band = draws.element(d.mul(2).add(1)).toVar();
        const origin = c3.xz;
        const fromZero = flags.bitAnd(uint(DRAW_FROM_ZERO)).notEqual(uint(0));
        const noIn = fromZero.or(band.x.lessThanEqual(0));
        const dIn = max(band.x.sub(BAND_EPS_M), float(1e-6));
        const fadeIn = sel(noIn, float(1), meanRamp(dIn, band.z, origin));
        const open = band.y.lessThanEqual(0).or(band.y.greaterThanEqual(LOD_OPEN_M));
        const fadeOut = sel(open, float(0), meanRamp(band.y.add(BAND_EPS_M), band.w, origin));
        If(fadeIn.lessThanEqual(0).or(fadeOut.greaterThan(BAYER4_MAX)), () => { Return(); });
      });

      // 3. Append to the draw's rows.
      const old = atomicAdd(indirectAtomic.element(d.mul(INDIRECT_STRIDE).add(1)), uint(1)).toVar();
      const row = uint(di.w).add(old).toVar();
      outMat.element(row.mul(4)).assign(c0);
      outMat.element(row.mul(4).add(1)).assign(c1);
      outMat.element(row.mul(4).add(2)).assign(c2);
      outMat.element(row.mul(4).add(3)).assign(c3);
      outSlot.element(row).assign(float(ci.y));
      for (let c = 0; c < outPay.length; c++) outPay[c].element(row).assign(cand.element(at.add(4 + c)));
    })();
  }

  /**
   * Register one draw: allocates its rows and indirect slot, points the mesh
   * at the shared output buffers and the indirect args. The mesh's own
   * `instanceMatrix` is replaced; `geometry` must be the mesh's own
   * (shallow) geometry, since it receives `esSlot` and the indirect offset.
   */
  addDraw(mesh: THREE.InstancedMesh, opts: GpuCullDrawOptions): GpuCullDraw | null {
    const base = this.rowsAlloc.alloc(opts.capacity);
    if (base < 0) return null;
    const index = this.freeDraws.pop() ?? (this.nextDraw < this.options.maxDraws ? this.nextDraw++ : -1);
    if (index < 0) {
      this.rowsAlloc.release(base, opts.capacity);
      return null;
    }
    const geometry = mesh.geometry;
    const indexed = geometry.index !== null;
    const count = indexed ? geometry.index!.count : geometry.getAttribute("position").count;
    const args = indirectArgs(indexed, count, 0, base);
    const ind = this.indirect.array as Uint32Array;
    ind.set(args, index * INDIRECT_STRIDE);
    addRange(this.indirect, index * INDIRECT_STRIDE, INDIRECT_STRIDE);
    this.indirect.needsUpdate = true;

    const s = opts.sphere;
    const radius = s.radius + Math.hypot(s.center.x, s.center.z);
    const flags = (opts.casts ? DRAW_CASTS : 0) | (opts.fromZero ? DRAW_FROM_ZERO : 0)
      | (opts.band ? 0 : DRAW_NO_BAND);
    const dr = this.draws.array as Float32Array;
    dr.set([radius, s.center.y, flags, base], index * 8);
    dr.set(opts.band ?? [0, 0, 0, 0], index * 8 + 4);
    addRange(this.draws, index * 8, 8);
    this.draws.needsUpdate = true;

    mesh.instanceMatrix = this.matrices as unknown as THREE.InstancedBufferAttribute;
    mesh.count = Math.max(1, opts.capacity);
    mesh.frustumCulled = false;
    geometry.setAttribute("esSlot", this.slots);
    geometry.setIndirect(this.indirect, index * INDIRECT_STRIDE * 4);
    this.high = Math.max(this.high, base + opts.capacity);
    return { index, base, capacity: opts.capacity };
  }

  /** Write candidate `k` (0..capacity-1) of `draw`: its instance matrix and batch-data slot. */
  setCandidate(draw: GpuCullDraw, k: number, matrix: THREE.Matrix4, dataSlot: number): void {
    const row = draw.base + k;
    (this.cand.array as Float32Array).set(matrix.elements, row * this.stride * 4);
    const info = this.candInfo.array as Uint32Array;
    info[row * 2] = draw.index;
    info[row * 2 + 1] = dataSlot;
    this.touch(row, 1);
  }

  /**
   * Write `n = matrices.length / 16` candidates of `draw` from row `k0`: their
   * column-major matrices, one batch-data slot for all, and one vec4 per row
   * per payload channel. One upload range per buffer.
   */
  setCandidateRange(
    draw: GpuCullDraw, k0: number, matrices: Float32Array,
    payloads: readonly Float32Array[] = [], dataSlot = 0,
  ): void {
    const n = matrices.length / 16;
    if (n <= 0) return;
    const row = draw.base + k0;
    const cand = this.cand.array as Float32Array;
    const w = this.stride * 4;
    const channels = Math.min(this.payloads.length, payloads.length);
    const info = this.candInfo.array as Uint32Array;
    for (let k = 0; k < n; k++) {
      const at = (row + k) * w;
      cand.set(matrices.subarray(k * 16, k * 16 + 16), at);
      for (let c = 0; c < channels; c++) {
        cand.set(payloads[c].subarray(k * 4, k * 4 + 4), at + 16 + c * 4);
      }
      info[(row + k) * 2] = draw.index;
      info[(row + k) * 2 + 1] = dataSlot;
    }
    this.touch(row, n);
  }

  /** Switch candidates `[k0, k0 + n)` of `draw` off. */
  clearCandidateRange(draw: GpuCullDraw, k0: number, n: number): void {
    if (n <= 0) return;
    const row = draw.base + k0;
    const info = this.candInfo.array as Uint32Array;
    for (let k = 0; k < n; k++) info[(row + k) * 2] = EMPTY_DRAW;
    addRange(this.candInfo, row * 2, n * 2);
    this.candInfo.needsUpdate = true;
  }

  /** Switch candidate `k` of `draw` off (its cell was dropped). */
  clearCandidate(draw: GpuCullDraw, k: number): void {
    const row = draw.base + k;
    (this.candInfo.array as Uint32Array)[row * 2] = EMPTY_DRAW;
    addRange(this.candInfo, row * 2, 2);
    this.candInfo.needsUpdate = true;
  }

  /** Replace a draw's LOD band (a layer widening it to the union of the
   * bands its copies carry; null = frustum only). */
  setBand(draw: GpuCullDraw, band: readonly [number, number, number, number] | null): void {
    const dr = this.draws.array as Float32Array;
    dr[draw.index * 8 + 2] = (dr[draw.index * 8 + 2] & ~DRAW_NO_BAND) | (band ? 0 : DRAW_NO_BAND);
    if (band) dr.set(band, draw.index * 8 + 4);
    addRange(this.draws, draw.index * 8, 8);
    this.draws.needsUpdate = true;
  }

  /** Give a draw's rows and indirect slot back (its mesh leaves the scene). */
  removeDraw(draw: GpuCullDraw): void {
    const info = this.candInfo.array as Uint32Array;
    for (let k = 0; k < draw.capacity; k++) info[(draw.base + k) * 2] = EMPTY_DRAW;
    addRange(this.candInfo, draw.base * 2, draw.capacity * 2);
    this.candInfo.needsUpdate = true;
    (this.indirect.array as Uint32Array).fill(0, draw.index * INDIRECT_STRIDE, (draw.index + 1) * INDIRECT_STRIDE);
    addRange(this.indirect, draw.index * INDIRECT_STRIDE, INDIRECT_STRIDE);
    this.indirect.needsUpdate = true;
    this.rowsAlloc.release(draw.base, draw.capacity);
    this.freeDraws.push(draw.index);
  }

  private touch(row: number, n: number): void {
    addRange(this.cand, row * this.stride * 4, n * this.stride * 4);
    this.cand.needsUpdate = true;
    addRange(this.candInfo, row * 2, n * 2);
    this.candInfo.needsUpdate = true;
  }

  /**
   * Set this frame's uniforms from the camera (its matrices current) and the
   * sun sweep, then dispatch the reset and the cull. Call before render; the
   * lodFade uniforms must already hold this frame's camera and history.
   */
  update(renderer: WebGPURenderer, camera: THREE.Camera, sweep: SunSweep | null): void {
    renderer.compute(this.prepare(camera, sweep) as any);
  }

  /** Draws registered now (0 = the dispatch can be skipped). */
  get drawCount(): number {
    return this.nextDraw - this.freeDraws.length;
  }

  /** `update` without the dispatch: sets the uniforms and returns the two
   * compute nodes, so a pool of systems runs ONE `renderer.compute` call. */
  prepare(camera: THREE.Camera, sweep: SunSweep | null): TslNode[] {
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView, (camera as any).coordinateSystem);
    this.frustum.planes.forEach((pl, p) => {
      this.uPlanes.array[p].set(pl.normal.x, pl.normal.y, pl.normal.z, pl.constant);
    });
    this.uSun.value.set(sweep?.x ?? 0, sweep?.z ?? 0, sweep?.perM ?? 0);
    this.uHigh.value = this.high;
    return [this.resetNode, this.cullNode];
  }

  /** The planes `update` last used (6 × nx, ny, nz, d), for a CPU twin. */
  planesArray(out: Float32Array = new Float32Array(24)): Float32Array {
    this.uPlanes.array.forEach((v: THREE.Vector4, p: number) => v.toArray(out, p * 4));
    return out;
  }

  dispose(): void {
    (this.resetNode as any).dispose?.();
    (this.cullNode as any).dispose?.();
  }
}
