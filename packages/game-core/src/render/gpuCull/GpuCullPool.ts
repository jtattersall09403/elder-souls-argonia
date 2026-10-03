/**
 * A growable set of `GpuCullSystem` PAGES: what a streaming layer
 * (`Vegetation.tsx`, `Groundcover.tsx`) registers its instanced draws with on
 * the WebGPU backend (lane L9b, decision 0111).
 *
 * A system's row arena is fixed at construction (its buffers and compute
 * graphs are sized once), while a layer's draws come and go and grow as the
 * camera walks. So the pool never resizes: a draw goes into the first page
 * with room, and a new page is made when none has any (a draw larger than a
 * page gets a page of its own size). A page whose last draw leaves is freed.
 * Every page's reset + cull nodes run in ONE `renderer.compute` call per frame.
 *
 * A layer uses it the same way on every draw:
 *   - `addDraw(mesh, opts)` when the mesh is made (the mesh's `instanceMatrix`,
 *     its geometry's `esSlot` and indirect args now point at the page),
 *   - `setCandidate` / `setCandidateRange` when copies are handed rows,
 *     `clearCandidate` / `clearCandidateRange` when they are given back,
 *   - `removeDraw` before the mesh is pooled or disposed (it detaches the
 *     mesh from the page's shared buffers; those are marked page-owned, the
 *     kit's vertex buffers kit-shared, and the renderer's store refuses to
 *     delete either, so disposing a member's geometry never frees them,
 *     whatever three's cached lists still hold),
 *   - `update` once a frame before render, `refreshCounts` every few frames.
 */
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import type { LodFadeUniforms } from "../../fx/lodFade";
import { detachSharedAttribute, isKitShared } from "../../vegetation/slotGeometry";
import { GpuCullSystem, type GpuCullDraw, type GpuCullDrawOptions } from "./GpuCullSystem";
import { INDIRECT_STRIDE, sphereSweptInFrustum, type SunSweep } from "./cullMath";
import { applyVisibility, type VisibleRule } from "../../vegetation/drawCount";
import { LOD_OPEN_M } from "../../fx/lodFade";
import { setCastShadow } from "../shadowCasters";

/** Metres the CPU submit test widens a member's bounds and band edges by, on
 * top of the GPU cull's own: the LOD history and a read-back's lag move the
 * camera that far between the cull and the test (0108 §4). */
export const SUBMIT_MARGIN_M = 8;

/** How far the camera may move (m) or turn (cosine of the angle) from where
 * the last read-back's cull ran before a kept-none member is shown again
 * until a fresh read-back: a read-back is a few frames old, and a member the
 * camera turned towards must not pop in late. */
export const READ_STALE_M = 2;
export const READ_STALE_COS = Math.cos((3 * Math.PI) / 180);

export interface GpuCullPoolOptions {
  lodFade: LodFadeUniforms;
  /** Rows per page (a larger draw gets a page of its own size). */
  pageRows?: number;
  /** Draws per page. */
  pageDraws?: number;
  /** vec4 payload channels every page copies (`GpuCullSystemOptions.payloads`). */
  payloads?: number;
}

export interface PooledDraw {
  system: GpuCullSystem;
  draw: GpuCullDraw;
  mesh: THREE.InstancedMesh;
  /** Kept instances at the last `refreshCounts` read-back. */
  kept: number;
  /** Candidates the last `fillDraw` wrote (rows `[0, filled)`). */
  filled: number;
  /** World AABB of every candidate written since the last fill (minX, minY,
   * minZ, maxX, maxY, maxZ; min > max = none): grows on write, never shrinks
   * on a clear, so it can only err towards drawing. */
  bounds: Float32Array;
  /** Object-space cull sphere (radius, centre Y) and the draw's band/flags. */
  radius: number;
  centreY: number;
  band: readonly [number, number, number, number] | null;
  casts: boolean;
  fromZero: boolean;
  /** Whether three gets this member this frame (`updateSubmit`): it kept
   * copies at the last read-back, or it may keep some and that read-back
   * cannot speak for it yet (rows written or bounds entering view since, or
   * the view moved past `READ_STALE_M` / `READ_STALE_COS`). A member the GPU
   * last kept none of is not drawn in any pass (webgpu10 diag19 D2). */
  submit: boolean;
  /** Bumped by every candidate write and by the bounds entering view; the
   * read-back that started after the last bump clears `pending`. */
  writes: number;
  /** `writes` as of the last completed read-back's dispatch. */
  readWrites: number;
  /** `boundsMayKeep` at the last `updateSubmit`. */
  mayKeep: boolean;
  /** The member's one visibility rule (drawCount.ts), re-applied when `submit` flips. */
  rule: VisibleRule;
}

/**
 * The per-frame submit test, on scalars only: may any candidate inside the
 * AABB `b` be kept by the GPU cull (frustum `planes`, sun `sweep` for a
 * caster, LOD `band` around the camera at `vx`, `vz`)? Widened by
 * `SUBMIT_MARGIN_M`; empty bounds never submit.
 */
export function boundsMayKeep(
  b: ArrayLike<number>, planes: ArrayLike<number>, sweep: SunSweep | null,
  band: readonly [number, number, number, number] | null, fromZero: boolean,
  vx: number, vz: number,
): boolean {
  if (b[0] > b[3]) return false;
  const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
  const r = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2 + SUBMIT_MARGIN_M;
  if (!sphereSweptInFrustum(planes, cx, cy, cz, r, sweep && sweep.perM > 0 ? sweep : null)) return false;
  if (!band) return true;
  const [dIn, dOut, wIn, wOut] = band;
  const dx = Math.max(b[0] - vx, 0, vx - b[3]);
  const dz = Math.max(b[2] - vz, 0, vz - b[5]);
  const near = Math.hypot(dx, dz);
  const far = Math.hypot(Math.max(vx - b[0], b[3] - vx), Math.max(vz - b[2], b[5] - vz));
  const inner = fromZero || dIn <= 0 ? 0 : dIn - Math.abs(wIn) - SUBMIT_MARGIN_M;
  const outer = dOut <= 0 || dOut >= LOD_OPEN_M ? Infinity : dOut + Math.abs(wOut) + SUBMIT_MARGIN_M;
  return far >= inner && near <= outer;
}

/** Grow `b` by a candidate's cull sphere (matrix `m` at offset `o`). */
function growBounds(b: Float32Array, m: ArrayLike<number>, o: number, radius: number, centreY: number): void {
  const scale = Math.max(
    Math.hypot(m[o], m[o + 1], m[o + 2]), Math.hypot(m[o + 4], m[o + 5], m[o + 6]),
    Math.hypot(m[o + 8], m[o + 9], m[o + 10]));
  const r = radius * scale;
  const x = m[o + 12] + m[o + 4] * centreY;
  const y = m[o + 13] + m[o + 5] * centreY;
  const z = m[o + 14] + m[o + 6] * centreY;
  if (x - r < b[0]) b[0] = x - r;
  if (y - r < b[1]) b[1] = y - r;
  if (z - r < b[2]) b[2] = z - r;
  if (x + r > b[3]) b[3] = x + r;
  if (y + r > b[4]) b[4] = y + r;
  if (z + r > b[5]) b[5] = z + r;
}

function emptyBounds(b: Float32Array): void {
  b.fill(Infinity, 0, 3);
  b.fill(-Infinity, 3, 6);
}

/**
 * The object-space sphere the cull tests a draw's copies with. A mesh part
 * is its geometry's bounding sphere; an octahedral IMPOSTOR (a material with
 * `esImpostor`, vegetation/impostor.ts) draws a unit quad its positionNode
 * rebuilds at `cellM` around `centre`, so its sphere is that quad's, never
 * the unit quad's.
 */
export function cullSphereOf(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Sphere {
  const imp = (material as unknown as { esImpostor?: { centre: THREE.Vector3; cellM: number } }).esImpostor;
  if (imp) return new THREE.Sphere(imp.centre.clone(), imp.cellM * Math.SQRT1_2);
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  return geometry.boundingSphere!;
}

/** The renderer's attribute store (three 0.184 `Renderer._attributes`). */
interface AttributeStore { delete(attribute: object): unknown; esPageGuard?: boolean }

/** Marks a page buffer; the guarded store will not delete a marked buffer. */
const PAGE_OWNED = "esPageOwned";

function markPageOwned<T extends object>(b: T): T {
  (b as Record<string, unknown>)[PAGE_OWNED] = true;
  return b;
}

/**
 * Make this renderer's attribute store refuse to delete a page-owned buffer
 * or a kit-shared one (`KIT_SHARED`, vegetation/slotGeometry.ts: a slot
 * view's dispose deleted the kit vertex buffers other views still drew,
 * webgpu10 diag19 D1).
 *
 * three's geometry dispose handler (Geometries.js onDispose) deletes every
 * attribute in the render object's CACHED attribute list (RenderObject
 * `getAttributes`), which for a hidden, released member still names the
 * page's `esSlot`, matrices and payloads even after `removeDraw` swapped
 * stand-ins in. Deleting them unset a vertex slot of every other draw on the
 * page ("Vertex buffer slot N ... not set ... DrawIndexedIndirect", the
 * submit rejected, a black frame; webgpu diag10 D3). Per renderer instance,
 * once; the page frees its own buffers in `releasePage`. Any layer that
 * disposes slot views calls it at mount, on either backend.
 */
export function guardSharedBuffers(renderer: WebGPURenderer): AttributeStore | null {
  const store = (renderer as unknown as { _attributes?: AttributeStore | null })._attributes;
  if (!store) return null;
  if (!store.esPageGuard) {
    const del = store.delete.bind(store);
    store.delete = (attribute: object) =>
      (attribute as Record<string, unknown>)[PAGE_OWNED] || isKitShared(attribute) ? null : del(attribute);
    store.esPageGuard = true;
  }
  return store;
}

export class GpuCullPool {
  static supported = GpuCullSystem.supported;

  private readonly pages: GpuCullSystem[] = [];
  private readonly draws = new Map<GpuCullSystem, Set<PooledDraw>>();
  /** Every member, flat, for the per-frame submit loop (no iterator per frame). */
  private readonly members: PooledDraw[] = [];
  private readonly pageRows: number;
  private readonly pageDraws: number;
  private reading = false;
  /** True while the host shows something that hides the pool's draws (an interior cell). */
  private idle = false;
  /** The guarded attribute store, set by the first `update`. */
  private store: AttributeStore | null = null;
  /** The ONE stand-in instance matrix every released member gets, owned by
   * this pool and page-marked: a released mesh's dispose (three deletes its
   * cached attribute list) cannot destroy it while a shadow pass still
   * submits that mesh (webgpu10 diag20 E3). Freed in `dispose`. */
  readonly standIn = markPageOwned(new THREE.InstancedBufferAttribute(new Float32Array(16), 16));
  /** Per-frame scratch, made once: the compute nodes and the CPU frustum. */
  private readonly nodes: unknown[] = [];
  private readonly projView = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();
  private readonly planes = new Float32Array(24);
  /** Camera position and forward at the last `updateSubmit`, and as of the
   * last completed read-back's dispatch (NaN: no read-back yet). */
  private readonly framePose = new Float64Array(6).fill(NaN);
  private readonly seenPose = new Float64Array(6).fill(NaN);

  constructor(readonly options: GpuCullPoolOptions) {
    this.pageRows = options.pageRows ?? 1 << 16;
    this.pageDraws = options.pageDraws ?? 256;
  }

  /** Register a mesh; its page's buffers become its instance source.
   * `rule` is the mesh's one visibility rule and must read `submit` (the
   * default is `submit` alone); the pool re-applies it when `submit` flips. */
  addDraw(mesh: THREE.InstancedMesh, opts: GpuCullDrawOptions, rule?: VisibleRule): PooledDraw {
    for (const system of this.pages) {
      const draw = system.addDraw(mesh, opts);
      if (draw) return this.track(system, draw, mesh, opts, rule);
    }
    const system = new GpuCullSystem({
      rows: Math.max(this.pageRows, opts.capacity),
      maxDraws: this.pageDraws,
      lodFade: this.options.lodFade,
      payloads: this.options.payloads,
    });
    for (const b of system.sharedBuffers) markPageOwned(b);
    this.pages.push(system);
    this.draws.set(system, new Set());
    const draw = system.addDraw(mesh, opts);
    if (!draw) throw new Error("GpuCullPool: a fresh page refused a draw");
    return this.track(system, draw, mesh, opts, rule);
  }

  private track(
    system: GpuCullSystem, draw: GpuCullDraw, mesh: THREE.InstancedMesh,
    opts: GpuCullDrawOptions, rule?: VisibleRule,
  ): PooledDraw {
    const s = opts.sphere;
    const pooled: PooledDraw = {
      system, draw, mesh, kept: 0, filled: 0, bounds: new Float32Array(6),
      radius: Math.max(0, s.radius) + Math.hypot(s.center.x, s.center.z), centreY: s.center.y,
      band: opts.band, casts: opts.casts, fromZero: opts.fromZero,
      submit: false, writes: 0, readWrites: 0, mayKeep: false,
      rule: rule ?? (() => pooled.submit),
    };
    emptyBounds(pooled.bounds);
    // census flag: renderer.info counts this draw at `mesh.count` (the last kept read-back), not the GPU's live count
    mesh.userData.esIndirect = true;
    // three culls the member per camera on its candidates' bounds, so each
    // sun cascade draws only the casters inside its own box (a near batch is
    // not rendered into the far cascades, nor a far one into the near):
    // webgpu10 diag19 D2 (2). The sphere follows `bounds` in `updateSubmit`.
    mesh.frustumCulled = true;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), -1);
    this.members.push(pooled);
    applyVisibility(mesh, pooled.rule);
    this.draws.get(system)!.add(pooled);
    return pooled;
  }

  setCandidate(d: PooledDraw, k: number, matrix: THREE.Matrix4, dataSlot: number): void {
    d.system.setCandidate(d.draw, k, matrix, dataSlot);
    growBounds(d.bounds, matrix.elements, 0, d.radius, d.centreY);
    d.writes++;
  }

  setCandidateRange(
    d: PooledDraw, k0: number, matrices: Float32Array,
    payloads: readonly Float32Array[] = [], dataSlot = 0,
  ): void {
    d.system.setCandidateRange(d.draw, k0, matrices, payloads, dataSlot);
    for (let o = 0; o < matrices.length; o += 16) growBounds(d.bounds, matrices, o, d.radius, d.centreY);
    d.writes++;
  }

  setBand(d: PooledDraw, band: readonly [number, number, number, number] | null): void {
    d.system.setBand(d.draw, band);
    d.band = band;
  }

  /**
   * Replace a draw's whole candidate list (a layer that refills a mesh in one
   * go, as ground cover does): rows `[0, n)` from `matrices` (16 per row) and
   * the payload channels (4 per row), the rows the previous fill used past
   * `n` switched off. Nothing is uploaded again until the next fill.
   */
  fillDraw(d: PooledDraw, matrices: Float32Array, payloads: readonly Float32Array[] = []): void {
    const n = Math.min(matrices.length / 16, d.draw.capacity);
    d.system.setCandidateRange(d.draw, 0, matrices.subarray(0, n * 16), payloads, 0);
    emptyBounds(d.bounds);
    for (let o = 0; o < n * 16; o += 16) growBounds(d.bounds, matrices, o, d.radius, d.centreY);
    if (d.filled > n) d.system.clearCandidateRange(d.draw, n, d.filled - n);
    d.filled = n;
    d.writes++;
  }

  clearCandidate(d: PooledDraw, k: number): void {
    d.system.clearCandidate(d.draw, k);
  }

  clearCandidateRange(d: PooledDraw, k0: number, n: number): void {
    d.system.clearCandidateRange(d.draw, k0, n);
  }

  /**
   * Give the draw's rows back and detach its mesh from the page: the mesh
   * gets a placeholder instance matrix and loses the page's `esSlot`, payload
   * attributes and indirect args, so disposing it (or its geometry) frees
   * nothing the page still uses. Payload bindings the caller made are the
   * caller's to undo (`detachPayloads`).
   */
  removeDraw(d: PooledDraw): void {
    d.system.removeDraw(d.draw);
    const geometry = d.mesh.geometry;
    if (geometry.getAttribute("esSlot") === (d.system.slots as unknown)) detachSharedAttribute(geometry, "esSlot");
    geometry.setIndirect(null);
    delete d.mesh.userData.esIndirect;
    d.mesh.instanceMatrix = this.standIn;
    setCastShadow(d.mesh, false);
    d.mesh.frustumCulled = false;
    d.mesh.boundingSphere = null;
    const set = this.draws.get(d.system);
    set?.delete(d);
    const at = this.members.indexOf(d);
    if (at >= 0) { this.members[at] = this.members[this.members.length - 1]; this.members.pop(); }
    if (set && set.size === 0) {
      const i = this.pages.indexOf(d.system);
      if (i >= 0) this.pages.splice(i, 1);
      this.draws.delete(d.system);
      this.releasePage(d.system);
    }
  }

  /** Free a page: its buffers lose the page mark and are deleted here, the
   * one place they leave the pool. */
  private releasePage(system: GpuCullSystem): void {
    for (const b of system.sharedBuffers) {
      delete (b as unknown as Record<string, unknown>)[PAGE_OWNED];
      this.store?.delete(b);
    }
    system.dispose();
  }

  /**
   * Idle the pool while the host hides its draws (an interior cell is shown):
   * `update` neither dispatches nor submits and `refreshCounts` reads nothing
   * back. Going idle un-submits every member and zeroes its kept count; the
   * first `update` after leaving idle runs the cull and submit as usual.
   */
  setIdle(idle: boolean): void {
    if (idle === this.idle) return;
    this.idle = idle;
    if (!idle) return;
    this.seenPose.fill(NaN); // the zeroed counts speak for no view

    for (const d of this.members) {
      d.kept = 0;
      if (!d.submit) continue;
      d.submit = false;
      applyVisibility(d.mesh, d.rule);
    }
  }

  /** Dispatch every page's reset + cull, once, before this frame's render,
   * and decide each member's `submit` (no allocation). */
  update(renderer: WebGPURenderer, camera: THREE.Camera, sweep: SunSweep | null): void {
    if (this.idle) return;
    this.store ??= guardSharedBuffers(renderer);
    const nodes = this.nodes;
    nodes.length = 0;
    for (const system of this.pages) {
      if (system.drawCount === 0) continue;
      const [reset, cull] = system.prepare(camera, sweep);
      nodes.push(reset, cull);
    }
    if (nodes.length > 0) renderer.compute(nodes as never);
    this.updateSubmit(camera, sweep);
  }

  /**
   * A member whose last read-back kept nothing is not handed to three
   * (webgpu10 diag19 D2: kept-none members cost a render object per pass),
   * unless that read-back cannot speak for it yet: rows were written since,
   * its bounds just entered the (widened) view or band, or the camera moved
   * or turned past the stale limits since the read-back's cull. A member
   * whose bounds cannot be in view or band is never handed over unless it
   * kept copies; one with no candidates never is. Also keeps the member's
   * bounding sphere on its bounds for three's per-camera cull.
   */
  updateSubmit(camera: THREE.Camera, sweep: SunSweep | null): void {
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView, (camera as unknown as { coordinateSystem: number }).coordinateSystem as never);
    const planes = this.planes;
    for (let p = 0; p < 6; p++) {
      const pl = this.frustum.planes[p];
      planes[p * 4] = pl.normal.x; planes[p * 4 + 1] = pl.normal.y;
      planes[p * 4 + 2] = pl.normal.z; planes[p * 4 + 3] = pl.constant;
    }
    const e = camera.matrixWorld.elements;
    const vx = e[12];
    const vz = e[14];
    const seen = this.seenPose;
    const stale = !(Math.hypot(e[12] - seen[0], e[13] - seen[1], e[14] - seen[2]) < READ_STALE_M)
      || !(-(e[8] * seen[3] + e[9] * seen[4] + e[10] * seen[5]) / (Math.hypot(e[8], e[9], e[10]) || 1) > READ_STALE_COS);
    const len = Math.hypot(e[8], e[9], e[10]) || 1;
    const fp = this.framePose;
    fp[0] = e[12]; fp[1] = e[13]; fp[2] = e[14];
    fp[3] = -e[8] / len; fp[4] = -e[9] / len; fp[5] = -e[10] / len;
    for (let i = 0; i < this.members.length; i++) {
      const d = this.members[i];
      const b = d.bounds;
      const empty = b[0] > b[3];
      const mayKeep = !empty
        && boundsMayKeep(b, planes, d.casts ? sweep : null, d.band, d.fromZero, vx, vz);
      if (mayKeep && !d.mayKeep) d.writes++;
      d.mayKeep = mayKeep;
      const submit = !empty && (d.kept > 0 || (mayKeep && (stale || d.writes !== d.readWrites)));
      const sphere = d.mesh.boundingSphere;
      if (submit && sphere) {
        sphere.center.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
        sphere.radius = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2;
      }
      if (submit === d.submit) continue;
      d.submit = submit;
      applyVisibility(d.mesh, d.rule);
    }
  }

  /**
   * Read the indirect args back (async, one read in flight at most) and set
   * each member's `kept` (which `updateSubmit` hides kept-none members by)
   * and its mesh's `count` to the kept instances, at least 1. The indirect args
   * decide what is DRAWN; `count` only feeds `renderer.info` (three counts
   * `count` instances per indirect draw, WebGPUBackend.draw), so the HUD's
   * triangle line reads the GPU's own kept set, a read-back or so behind.
   * Returns the total kept at the last completed read.
   */
  refreshCounts(renderer: WebGPURenderer): void {
    if (this.idle || this.reading || this.pages.length === 0) return;
    this.reading = true;
    const pages = [...this.pages];
    // What this read speaks for: the cull dispatched before it ran from this
    // pose and over these writes (a member written later stays pending).
    const pose = Float64Array.from(this.framePose);
    const writes = new Map<PooledDraw, number>();
    for (const d of this.members) writes.set(d, d.writes);
    Promise.all(pages.map((system) => renderer.getArrayBufferAsync(system.indirect as never)))
      .then((buffers) => {
        this.seenPose.set(pose);
        buffers.forEach((buffer, p) => {
          const ind = new Uint32Array(buffer);
          for (const d of this.draws.get(pages[p]) ?? []) {
            const w = writes.get(d);
            if (w === undefined) continue;
            d.readWrites = w;
            d.kept = ind[d.draw.index * INDIRECT_STRIDE + 1] ?? 0;
            d.mesh.count = Math.max(1, d.kept);
            d.mesh.userData.esKept = d.kept;
          }
        });
      })
      .catch(() => undefined)
      .finally(() => { this.reading = false; });
  }

  /** Kept instances over every draw at the last read-back. */
  get kept(): number {
    let n = 0;
    for (const set of this.draws.values()) for (const d of set) n += d.kept;
    return n;
  }

  /** Rows the pages hold (their memory is ~ rows × (128 + 16 × payloads + 12) bytes). */
  get rows(): number {
    return this.pages.reduce((s, p) => s + p.options.rows, 0);
  }

  dispose(): void {
    for (const system of this.pages) this.releasePage(system);
    this.pages.length = 0;
    this.draws.clear();
    this.members.length = 0;
    delete (this.standIn as unknown as Record<string, unknown>)[PAGE_OWNED];
    this.store?.delete(this.standIn);
  }
}
