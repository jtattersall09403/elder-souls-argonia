import type { WebGPURenderer } from "three/webgpu";

/**
 * Node-material builds off the frame (decision 0111 §3; walk 9 replaced the
 * per-frame ms budget with this queue).
 *
 * three builds a material's node graph into shaders in JS the first frame an
 * object with that material is drawn (`NodeManager.getForRender`), and one
 * build of our materials takes 50 to 500 ms on the VM (fog, cascades, fixture
 * lights, LOD fade and wind in one graph). Built synchronously, character
 * view's hundreds of first draws froze the page (walk 7); budgeted at 12 ms a
 * frame with at least one build per frame, every frame that built ran long
 * (fps under 10) and the world filled in at two or three materials a second
 * while everything waiting was hidden (walk 9: ~1,000 draws held back a
 * second over a 40 s hold at Riverwalk).
 *
 * An object that drew before and is re-keyed (a light set, fog or material
 * change) keeps drawing under its built program while the new key builds on
 * a detached render object: a re-key costs stale frames, never a vanish.
 * Here an object whose material is not built yet is not drawn; its build is
 * queued and runs with three's `buildAsync`, which yields to the browser
 * after every shader stage, so no task holds the main thread for a whole
 * build and frames keep coming with everything already built in them. One
 * build per cache key; one at a time by default (builds are main-thread JS,
 * so a second in flight only interleaves, and its scheduler.yield
 * continuations would leave no gap for ordinary tasks); the nearest waiting
 * object's build starts first (the character and the ground around it, not
 * the far tiles).
 */
export const SHADER_BUILDS_IN_FLIGHT = 1;

/** The waiting builds, by cache key: the pure part of the queue (unit-tested). */
export class BuildQueue<K = unknown> {
  private readonly waiting = new Map<K, { start: () => unknown; priority: number }>();
  private readonly running = new Set<K>();
  /** Draws skipped because their material was not built (a measure for the HUD and the boot check). */
  deferred = 0;
  /** Builds finished. */
  built = 0;
  constructor(readonly inFlight: number, private readonly onError: (e: unknown) => void = () => {}) {}

  /** An unbuilt draw for `key`: queue its build (lower `priority` starts first; the latest start wins). */
  request(key: K, priority: number, start: () => unknown): void {
    this.deferred++;
    if (this.running.has(key)) return;
    const w = this.waiting.get(key);
    if (w) { w.start = start; w.priority = Math.min(w.priority, priority); }
    else this.waiting.set(key, { start, priority });
    // choose after the frame's draws have all asked (a microtask runs once the render task ends)
    if (!this.scheduled) { this.scheduled = true; queueMicrotask(() => { this.scheduled = false; this.pump(); }); }
  }
  private scheduled = false;

  /** Builds waiting to start, and running. */
  get pending(): number { return this.waiting.size + this.running.size; }

  private pump(): void {
    while (this.running.size < this.inFlight && this.waiting.size > 0) {
      let best: K | undefined, bestP = Infinity;
      for (const [k, w] of this.waiting) if (w.priority < bestP) { best = k; bestP = w.priority; }
      const key = best as K;
      const { start } = this.waiting.get(key)!;
      this.waiting.delete(key);
      this.running.add(key);
      // the next build starts from a plain task: three's buildAsync yields with scheduler.yield(),
      // whose continuations outrank ordinary tasks, so back-to-back builds would starve timers,
      // network callbacks and devtools for as long as the queue is full
      Promise.resolve().then(start).catch(this.onError).finally(() => {
        this.running.delete(key); this.built++; setTimeout(() => this.pump(), 0);
      });
    }
  }
}

/** The three 0.184 render object fields the queue reads. */
interface RenderObjectInternals {
  readonly id: number;
  version: number;
  camera: unknown;
  drawRange: unknown;
  group: unknown;
  initialCacheKey: unknown;
  readonly needsUpdate: boolean;
  material: { version: number };
  getCacheKey(): unknown;
  constructor: new (...a: unknown[]) => RenderObjectInternals;
}

/** The three 0.184 internals the queue reads (Renderer, RenderObjects, NodeManager, Pipelines). */
interface RendererInternals {
  _renderObjectDirect: (...a: unknown[]) => void;
  _currentRenderContext: unknown;
  _currentRenderBundle: unknown;
  _objects: {
    get: (...a: unknown[]) => RenderObjectInternals;
    getChainMap(passId?: unknown): { get(keys: unknown[]): RenderObjectInternals | undefined };
    nodes: unknown; geometries: unknown; renderer: unknown;
  };
  _nodes: {
    nodeBuilderCache: Map<unknown, unknown>;
    get(renderObject: object): { nodeBuilderState?: unknown };
    getForRenderCacheKey(renderObject: object): unknown;
    getForRender(renderObject: object, useAsync?: boolean): unknown;
    needsRefresh(renderObject: object): boolean;
    updateBefore(renderObject: object): void;
    updateForRender(renderObject: object): void;
    updateAfter(renderObject: object): void;
  };
  _geometries: { updateForRender(renderObject: object): void };
  _bindings: { updateForRender(renderObject: object): void };
  _pipelines: { updateForRender(renderObject: object): void; isReady(renderObject: object): boolean };
  backend: { draw(renderObject: object, info: unknown): void };
  info: unknown;
}

interface Placed { matrixWorld?: { elements: ArrayLike<number> } }
interface Viewer { matrixWorld?: { elements: ArrayLike<number> } }

/** Squared distance from the camera to the object's origin (the queue's priority). */
function distanceSq(object: Placed, camera: Viewer): number {
  const o = object.matrixWorld?.elements, c = camera.matrixWorld?.elements;
  if (!o || !c) return Infinity;
  const dx = o[12] - c[12], dy = o[13] - c[13], dz = o[14] - c[14];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Install the queue on a renderer (`inFlight` <= 0 leaves three's synchronous
 * builds, as the harness wants: its scenes compile up front and read their
 * first frame). Returns the queue for its counters.
 */
export function queueShaderBuilds(renderer: WebGPURenderer, inFlight = SHADER_BUILDS_IN_FLIGHT): BuildQueue | null {
  if (!(inFlight > 0)) return null;
  const r = renderer as unknown as RendererInternals;
  const draw = r._renderObjectDirect;
  const queue = new BuildQueue(inFlight, (e) => console.error("[shader build]", e));
  // readable by the diagnostics (buildQueueOf), never enumerated
  Object.defineProperty(renderer, "esBuildQueue", { value: queue, configurable: true });
  // render objects that have drawn built: the fast path skips every lookup of ours for them.
  // Per queue instance (engineering standard 8), weak so disposed objects go.
  const drawn = new WeakSet<object>();
  r._renderObjectDirect = function (this: RendererInternals, ...a: unknown[]) {
    const [object, material, scene, camera, lightsNode, group, clippingContext, passId] = a;
    const objects = this._objects, nodes = this._nodes;
    const current = objects.getChainMap(passId).get([object, material, this._currentRenderContext, lightsNode]);
    if (current && drawn.has(current)) {
      const stale = (current.version !== (material as { version: number }).version || current.needsUpdate)
        && current.initialCacheKey !== current.getCacheKey();
      if (!stale || nodes.nodeBuilderCache.has(current.getCacheKey())) { draw.apply(this, a); return; }
      // Re-keyed (a light, fog or material change) and the new program is not built: three would
      // dispose this render object and draw nothing until the build lands. Keep drawing it under
      // its built program and build the new key on a detached render object (never in the chain
      // map), so the swap happens on the first frame after the build: stale frames, never a vanish.
      const ro = current;
      queue.request(ro.getCacheKey(), distanceSq(object as Placed, camera as Viewer), () => {
        const twin = new ro.constructor(objects.nodes, objects.geometries, objects.renderer, object, material, scene, camera, lightsNode, this._currentRenderContext, clippingContext);
        // never disposed: disposing would drop the cache entry it just built (usedTimes -> 0);
        // its node data is weakly held and goes with it
        return nodes.getForRender(twin, true);
      });
      if (this._currentRenderBundle !== null) return;
      ro.camera = camera;
      ro.drawRange = (object as { geometry: { drawRange: unknown } }).geometry.drawRange;
      ro.group = group;
      if (nodes.needsRefresh(ro)) {
        nodes.updateBefore(ro); this._geometries.updateForRender(ro); nodes.updateForRender(ro); this._bindings.updateForRender(ro);
      }
      this._pipelines.updateForRender(ro);
      if (this._pipelines.isReady(ro)) this.backend.draw(ro, this.info);
      return;
    }
    const ro = objects.get(object, material, scene, camera, lightsNode, this._currentRenderContext, clippingContext, passId);
    const key = nodes.getForRenderCacheKey(ro);
    if (nodes.get(ro).nodeBuilderState !== undefined || nodes.nodeBuilderCache.has(key)) {
      drawn.add(ro);
      draw.apply(this, a);
      return;
    }
    queue.request(key, distanceSq(object as Placed, camera as Viewer), () => nodes.getForRender(ro, true));
  };
  return queue;
}

/** The queue installed on `renderer`, if any (the diagnostics read its counters). */
export function buildQueueOf(renderer: object): BuildQueue | null {
  return (renderer as { esBuildQueue?: BuildQueue }).esBuildQueue ?? null;
}
