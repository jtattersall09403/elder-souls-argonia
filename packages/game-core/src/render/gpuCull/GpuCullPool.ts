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
 *     mesh from the page's shared buffers; those are marked page-owned and
 *     the renderer's store refuses to delete them, so disposing a member's
 *     geometry never frees them, whatever three's cached lists still hold),
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

/** The renderer's attribute store (three 0.184 `Renderer._attributes`). */
interface AttributeStore { delete(attribute: object): unknown; esPageGuard?: boolean }

/** Marks a page buffer; the guarded store will not delete a marked buffer. */
const PAGE_OWNED = "esPageOwned";

/**
 * Make this renderer's attribute store refuse to delete a page-owned buffer.
 *
 * three's geometry dispose handler (Geometries.js onDispose) deletes every
 * attribute in the render object's CACHED attribute list (RenderObject
 * `getAttributes`), which for a hidden, released member still names the
 * page's `esSlot`, matrices and payloads even after `removeDraw` swapped
 * stand-ins in. Deleting them unset a vertex slot of every other draw on the
 * page ("Vertex buffer slot N ... not set ... DrawIndexedIndirect", the
 * submit rejected, a black frame; webgpu diag10 D3). Per renderer instance,
 * once; the page frees its own buffers in `releasePage`.
 */
export function guardPageBuffers(renderer: WebGPURenderer): AttributeStore | null {
  const store = (renderer as unknown as { _attributes?: AttributeStore | null })._attributes;
  if (!store) return null;
  if (!store.esPageGuard) {
    const del = store.delete.bind(store);
    store.delete = (attribute: object) =>
      (attribute as Record<string, unknown>)[PAGE_OWNED] ? null : del(attribute);
    store.esPageGuard = true;
  }
  return store;
}

interface VertexRenderObject {
  attributes: unknown[] | null;
  getAttributes(): unknown[];
  getVertexBuffers(): ({ name?: string; id?: number } & object)[];
}
interface GuardedBackend {
  draw(renderObject: VertexRenderObject, info: unknown): unknown;
  get(object: object): { buffer?: unknown };
  esVertexGuard?: boolean;
}
interface UploadStore extends AttributeStore { update(attribute: object, type: number): void }

/** three's `AttributeType.VERTEX`. */
const VERTEX_ATTRIBUTE = 1;

/**
 * Before every draw, make sure each vertex buffer the render object binds has
 * a backend buffer. A render object caches its attribute list
 * (RenderObject.getAttributes) and resets it only on an attribute id change
 * or its own geometry's dispose; when a shared buffer it still lists is freed
 * elsewhere, WebGPUBackend binds `undefined`, the slot reads as unset and the
 * whole command buffer is rejected (black frame; webgpu diag11). The guard
 * drops the stale list, and re-uploads any buffer still missing through the
 * attribute store (both maps), logging the first hit so a capture names the
 * path that freed it. Per renderer instance, once.
 */
export function guardVertexBuffers(renderer: WebGPURenderer): boolean {
  const r = renderer as unknown as { backend?: GuardedBackend; _attributes?: UploadStore | null };
  const backend = r.backend;
  if (!backend || typeof backend.draw !== "function" || backend.esVertexGuard) return !!backend?.esVertexGuard;
  const draw = backend.draw.bind(backend);
  let logged = false;
  backend.draw = (renderObject: VertexRenderObject, info: unknown) => {
    const store = r._attributes;
    if (store) repairVertexBuffers(renderObject, backend, store, () => {
      if (logged) return false;
      logged = true;
      return true;
    });
    return draw(renderObject, info);
  };
  backend.esVertexGuard = true;
  return true;
}

/** The guard's per-draw step (exported for its test). */
export function repairVertexBuffers(
  renderObject: VertexRenderObject, backend: Pick<GuardedBackend, "get">,
  store: UploadStore, shouldLog: () => boolean,
): number {
  let buffers = renderObject.getVertexBuffers();
  let missing = -1;
  for (let i = 0; i < buffers.length; i++) if (!backend.get(buffers[i]).buffer) { missing = i; break; }
  if (missing < 0) return 0;
  const first = buffers[missing];
  // the cached list may name a buffer the geometry no longer holds
  renderObject.attributes = null;
  renderObject.getAttributes();
  buffers = renderObject.getVertexBuffers();
  let repaired = 0;
  for (let i = 0; i < buffers.length; i++) {
    const vb = buffers[i];
    if (backend.get(vb).buffer) continue;
    store.delete(vb);
    store.update(vb, VERTEX_ATTRIBUTE);
    repaired++;
  }
  if (shouldLog()) {
    console.warn("[gpuCull] vertex buffer without a backend buffer before draw", {
      slot: missing, name: first.name ?? "", id: first.id, reuploaded: repaired,
    });
  }
  return repaired;
}

export class GpuCullPool {
  static supported = GpuCullSystem.supported;

  private readonly pages: GpuCullSystem[] = [];
  private readonly draws = new Map<GpuCullSystem, Set<PooledDraw>>();
  private readonly pageRows: number;
  private readonly pageDraws: number;
  private reading = false;
  /** The guarded attribute store, set by the first `update`. */
  private store: AttributeStore | null = null;

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
    for (const b of system.sharedBuffers) (b as unknown as Record<string, unknown>)[PAGE_OWNED] = true;
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

  /** Dispatch every page's reset + cull, once, before this frame's render. */
  update(renderer: WebGPURenderer, camera: THREE.Camera, sweep: SunSweep | null): void {
    if (!this.store) {
      this.store = guardPageBuffers(renderer);
      guardVertexBuffers(renderer);
    }
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
    for (const system of this.pages) this.releasePage(system);
    this.pages.length = 0;
    this.draws.clear();
  }
}
