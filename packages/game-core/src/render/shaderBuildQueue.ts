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

/** The three 0.184 internals the queue reads (Renderer, RenderObjects, NodeManager). */
interface RendererInternals {
  _renderObjectDirect: (...a: unknown[]) => void;
  _objects: { get: (...a: unknown[]) => object };
  _currentRenderContext: unknown;
  _nodes: {
    nodeBuilderCache: Map<unknown, unknown>;
    get(renderObject: object): { nodeBuilderState?: unknown };
    getForRenderCacheKey(renderObject: object): unknown;
    getForRender(renderObject: object, useAsync?: boolean): unknown;
  };
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
  r._renderObjectDirect = function (this: RendererInternals, ...a: unknown[]) {
    const [object, material, scene, camera, lightsNode, , clippingContext, passId] = a;
    const ro = this._objects.get(object, material, scene, camera, lightsNode, this._currentRenderContext, clippingContext, passId);
    const nodes = this._nodes;
    const key = nodes.getForRenderCacheKey(ro);
    if (nodes.get(ro).nodeBuilderState !== undefined || nodes.nodeBuilderCache.has(key)) {
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
