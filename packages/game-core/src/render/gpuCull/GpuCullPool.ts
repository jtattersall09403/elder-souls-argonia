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
 *     mesh from the page's shared buffers, so disposing the mesh's geometry
 *     never frees them),
 *   - `update` once a frame before render, `refreshCounts` every few frames.
 */
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import type { LodFadeUniforms } from "../../fx/lodFade";
import { detachSharedAttribute } from "../../vegetation/slotGeometry";
import { GpuCullSystem, type GpuCullDraw, type GpuCullDrawOptions } from "./GpuCullSystem";
import { INDIRECT_STRIDE, type SunSweep } from "./cullMath";

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
}

/** Stand-in for a detached mesh's instance matrix: the mesh is out of the
 * scene or about to be disposed, so it never draws from it. */
function placeholderMatrix(): THREE.InstancedBufferAttribute {
  return new THREE.InstancedBufferAttribute(new Float32Array(16), 16);
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

export class GpuCullPool {
  static supported = GpuCullSystem.supported;

  private readonly pages: GpuCullSystem[] = [];
  private readonly draws = new Map<GpuCullSystem, Set<PooledDraw>>();
  private readonly pageRows: number;
  private readonly pageDraws: number;
  private reading = false;

  constructor(readonly options: GpuCullPoolOptions) {
    this.pageRows = options.pageRows ?? 1 << 16;
    this.pageDraws = options.pageDraws ?? 256;
  }

  /** Register a mesh; its page's buffers become its instance source. */
  addDraw(mesh: THREE.InstancedMesh, opts: GpuCullDrawOptions): PooledDraw {
    for (const system of this.pages) {
      const draw = system.addDraw(mesh, opts);
      if (draw) return this.track(system, draw, mesh);
    }
    const system = new GpuCullSystem({
      rows: Math.max(this.pageRows, opts.capacity),
      maxDraws: this.pageDraws,
      lodFade: this.options.lodFade,
      payloads: this.options.payloads,
    });
    this.pages.push(system);
    this.draws.set(system, new Set());
    const draw = system.addDraw(mesh, opts);
    if (!draw) throw new Error("GpuCullPool: a fresh page refused a draw");
    return this.track(system, draw, mesh);
  }

  private track(system: GpuCullSystem, draw: GpuCullDraw, mesh: THREE.InstancedMesh): PooledDraw {
    const pooled: PooledDraw = { system, draw, mesh, kept: 0, filled: 0 };
    this.draws.get(system)!.add(pooled);
    return pooled;
  }

  setCandidate(d: PooledDraw, k: number, matrix: THREE.Matrix4, dataSlot: number): void {
    d.system.setCandidate(d.draw, k, matrix, dataSlot);
  }

  setCandidateRange(
    d: PooledDraw, k0: number, matrices: Float32Array,
    payloads: readonly Float32Array[] = [], dataSlot = 0,
  ): void {
    d.system.setCandidateRange(d.draw, k0, matrices, payloads, dataSlot);
  }

  setBand(d: PooledDraw, band: readonly [number, number, number, number] | null): void {
    d.system.setBand(d.draw, band);
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
    if (d.filled > n) d.system.clearCandidateRange(d.draw, n, d.filled - n);
    d.filled = n;
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
    d.mesh.instanceMatrix = placeholderMatrix();
    const set = this.draws.get(d.system);
    set?.delete(d);
    if (set && set.size === 0) {
      const i = this.pages.indexOf(d.system);
      if (i >= 0) this.pages.splice(i, 1);
      this.draws.delete(d.system);
      d.system.dispose();
    }
  }

  /** Dispatch every page's reset + cull, once, before this frame's render. */
  update(renderer: WebGPURenderer, camera: THREE.Camera, sweep: SunSweep | null): void {
    const nodes: unknown[] = [];
    for (const system of this.pages) {
      if (system.drawCount > 0) nodes.push(...system.prepare(camera, sweep));
    }
    if (nodes.length > 0) renderer.compute(nodes as never);
  }

  /**
   * Read the indirect args back (async, one read in flight at most) and set
   * each mesh's `count` to its kept instances, at least 1. The indirect args
   * decide what is DRAWN; `count` only feeds `renderer.info` (three counts
   * `count` instances per indirect draw, WebGPUBackend.draw), so the HUD's
   * triangle line reads the GPU's own kept set, a read-back or so behind.
   * Returns the total kept at the last completed read.
   */
  refreshCounts(renderer: WebGPURenderer): void {
    if (this.reading || this.pages.length === 0) return;
    this.reading = true;
    const pages = [...this.pages];
    Promise.all(pages.map((system) => renderer.getArrayBufferAsync(system.indirect as never)))
      .then((buffers) => {
        buffers.forEach((buffer, p) => {
          const ind = new Uint32Array(buffer);
          for (const d of this.draws.get(pages[p]) ?? []) {
            d.kept = ind[d.draw.index * INDIRECT_STRIDE + 1] ?? 0;
            d.mesh.count = Math.max(1, d.kept);
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
    for (const system of this.pages) system.dispose();
    this.pages.length = 0;
    this.draws.clear();
  }
}
