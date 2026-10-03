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
 * a detached render object (released once the real one holds the new key): a
 * re-key costs stale frames, never a vanish and never a retained object.
 * Here an object whose material is not built yet is not drawn; its build is
 * queued and runs with three's `buildAsync`, which yields to the browser
 * after every shader stage, so no task holds the main thread for a whole
 * build and frames keep coming with everything already built in them. One
 * build per cache key; one at a time by default (builds are main-thread JS,
 * so a second in flight only interleaves, and its scheduler.yield
 * continuations would leave no gap for ordinary tasks); the nearest waiting
 * object's build starts first (the character and the ground around it, not
 * the far tiles).
 *
 * Only the frame's own passes defer: a draw to the canvas, to a target the
 * scene pass registered with `deferBuildsInto` (the water pipeline's scene
 * target, the bloom source), or inside three's shadow pass (a custom render
 * object function). Every other draw into a render target (a PMREM bake, a
 * census, a capture, a ripple or foam step) builds synchronously and draws: a
 * one-shot pass is never drawn again, so a skipped draw there leaves its
 * target empty for good (walk 10: the sky IBL stayed all zeros on WebGPU).
 * Shadow-pass and override-material draws never defer either: three swaps the
 * shared override material per caster and restores it after the draw, so a
 * deferred build would key on the restored material and never fill.
 * Full-screen quads (three's QuadMesh: the bloom and water composites, the
 * blit to the canvas) never defer either: they are a handful of tiny
 * programs, and one of them skipped blacks the whole frame.
 *
 * Every async slot has a timeout and logs its key: a build that throws, or has
 * not settled after BUILD_TIMEOUT_MS, is logged once (key and material) and frees
 * its slot, so one hung build cannot hold the queue (walk 10, Greenspring:
 * the view went black with nothing logged). Its object then builds
 * synchronously on its next draw (three's own path) rather than queueing
 * again: a retry could hang the slot a second time, while a synchronous
 * build costs one long frame and always ends with the object drawn.
 * `?buildq=0` in the studio skips the queue (all builds synchronous).
 */
export const SHADER_BUILDS_IN_FLIGHT = 1;
/** A build twin whose object never re-draws is released after this long. */
export const TWIN_HOLD_MS = 10_000;
/** A queued build still unsettled after this long is logged and frees its slot (builds take 50 to 500 ms). */
export const BUILD_TIMEOUT_MS = 10_000;

/** The waiting builds, by cache key: the pure part of the queue (unit-tested). */
export class BuildQueue<K = unknown> {
  private readonly waiting = new Map<K, { start: () => unknown; priority: number; label: string }>();
  private readonly running = new Set<K>();
  /**
   * Draws skipped because their material was not built, CUMULATIVE (every skipped draw of every
   * frame, not unique keys): read it as a rate; `pending` is the backlog.
   */
  skippedDraws = 0;
  /** Detached build twins still held until the real render object takes their key (0 when settled). */
  twinsHeld = 0;
  /** Builds finished. */
  built = 0;
  /** Keys whose build timed out or failed: their objects build synchronously from then on. */
  readonly timedOut = new Set<K>();
  /** Render targets the frame's scene pass draws into: their draws defer like the canvas's. */
  readonly frameTargets = new WeakSet<object>();
  constructor(
    readonly inFlight: number,
    private readonly onError: (e: unknown, key: K, label: string) => void = () => {},
    private readonly timeoutMs = BUILD_TIMEOUT_MS,
    private readonly onTimeout: (key: K, label: string) => void = (key, label) =>
      console.error(`[shader build] timed out after ${timeoutMs} ms, key ${String(key)}, material ${label}; it builds synchronously on its next draw`),
  ) {}

  /** An unbuilt draw for `key`: queue its build (lower `priority` starts first; the latest start wins). `label` names the material in a timeout log. */
  request(key: K, priority: number, start: () => unknown, label = ""): void {
    this.skippedDraws++;
    if (this.running.has(key)) return;
    const w = this.waiting.get(key);
    if (w) { w.start = start; w.priority = Math.min(w.priority, priority); }
    else this.waiting.set(key, { start, priority, label });
    // choose after the frame's draws have all asked (a microtask runs once the render task ends)
    if (!this.scheduled) { this.scheduled = true; queueMicrotask(() => { this.scheduled = false; this.pump(); }); }
  }
  private scheduled = false;

  /** Builds waiting to start, and running. */
  get pending(): number { return this.waiting.size + this.running.size; }

  private pump(): void {
    while (this.running.size < this.inFlight && this.waiting.size > 0) {
      let best: K | undefined, bestP = Infinity;
      for (const [k, w] of this.waiting) if (best === undefined || w.priority < bestP) { best = k; bestP = w.priority; }
      const key = best as K;
      const { start, label } = this.waiting.get(key)!;
      this.waiting.delete(key);
      this.running.add(key);
      // the slot is freed once: by the settle or by the timeout, whichever comes first
      let freed = false;
      const free = () => {
        if (freed) return false;
        freed = true; clearTimeout(timer); this.running.delete(key);
        // the next build starts from a plain task: three's buildAsync yields with scheduler.yield(),
        // whose continuations outrank ordinary tasks, so back-to-back builds would starve timers,
        // network callbacks and devtools for as long as the queue is full
        setTimeout(() => this.pump(), 0);
        return true;
      };
      const timer = setTimeout(() => { if (free()) { this.timedOut.add(key); this.onTimeout(key, label); } }, this.timeoutMs);
      // a build that throws falls back to three's synchronous build once, like a timeout: never
      // re-queued per frame (walk 10, C7: a failing twin build looped every frame)
      Promise.resolve().then(start).then(
        () => { if (free()) this.built++; },
        (e) => { if (free()) { this.timedOut.add(key); this.onError(e, key, label); } },
      );
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
  initialNodesCacheKey?: unknown;
  clippingContext?: { cacheKey: unknown } | null;
  clippingContextCacheKey?: unknown;
  object?: { receiveShadow?: boolean };
  scene?: unknown;
  lightsNode?: unknown;
  material: { version: number; isShadowPassMaterial?: boolean; removeEventListener(t: string, f: unknown): void };
  geometry: { id?: number; removeEventListener(t: string, f: unknown): void };
  onMaterialDispose: unknown;
  onGeometryDispose: unknown;
  getMaterialCacheKey(): string;
  getDynamicCacheKey(): unknown;
  constructor: new (...a: unknown[]) => RenderObjectInternals;
}

/** The three 0.184 internals the queue reads (Renderer, RenderObjects, NodeManager, Pipelines). */
interface RendererInternals {
  _renderObjectDirect: (...a: unknown[]) => void;
  contextNode?: { id: unknown; version: unknown };
  _currentRenderContext: unknown;
  _currentRenderBundle: unknown;
  _renderTarget: object | null;
  _renderObjectFunction: unknown;
  _objects: {
    get: (...a: unknown[]) => RenderObjectInternals;
    getChainMap(passId?: unknown): { get(keys: unknown[]): RenderObjectInternals | undefined };
    nodes: unknown; geometries: unknown; renderer: unknown;
  };
  _nodes: {
    delete(renderObject: object): unknown;
    nodeBuilderCache: Map<unknown, unknown>;
    get(renderObject: object): { nodeBuilderState?: unknown };
    getForRenderCacheKey(renderObject: object): unknown;
    getForRender(renderObject: object, useAsync?: boolean): unknown;
    needsRefresh(renderObject: object): boolean;
    getCacheKey?(scene: unknown, lightsNode: unknown): unknown;
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

/** The material's name and type, for a timeout log. */
function materialLabel(material: unknown): string {
  const m = material as { name?: string; type?: string };
  return `${m.name || "(unnamed)"} (${m.type ?? "?"})`;
}

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
  const queue = new BuildQueue(inFlight, (e, key, label) =>
    console.error(`[shader build] failed, key ${String(key)}, material ${label}; it builds synchronously on its next draw`, e));
  // readable by the diagnostics (buildQueueOf), never enumerated
  Object.defineProperty(renderer, "esBuildQueue", { value: queue, configurable: true });
  // render objects that have drawn built: the fast path skips every lookup of ours for them.
  // Per queue instance (engineering standard 8), weak so disposed objects go.
  const drawn = new WeakSet<object>();
  // Build twins by cache key, held after their build until the real render object holds the same
  // key (then the twin's share of the builder state is released: usedTimes stays >= 1 and the
  // cache entry lives on with its real owner). A twin is never left listening on the material.
  const twins = new Map<unknown, { twin: RenderObjectInternals; at: number; object: object }>();
  // scene objects with a twin held: the per-draw release check runs only for them
  const twinned = new WeakSet<object>();
  let sweptFrame = -1;
  const nodes0 = r._nodes;
  // one key array for every chain lookup: filled and read synchronously, so a re-entrant draw
  // (a shadow pass inside draw.call) overwriting it between two lookups is harmless
  const lookupKeys: unknown[] = [null, null, null, null];
  const chainGet = (chain: { get(keys: unknown[]): RenderObjectInternals | undefined }, object: unknown, material: unknown, context: unknown, lightsNode: unknown) => {
    lookupKeys[0] = object; lookupKeys[1] = material; lookupKeys[2] = context; lookupKeys[3] = lightsNode;
    return chain.get(lookupKeys);
  };
  // three's getCacheKey is getMaterialCacheKey() (a string walk over every material property,
  // the geometry and the object) + getDynamicCacheKey() (a number). The material part only
  // changes with material.version, the geometry or the render object's version: cache it per
  // render object (per queue instance, weak) and add the dynamic part, which carries the light
  // and fog re-keys, on each read (walk 10, C8: the full key ran several times per stale draw).
  const materialKeys = new WeakMap<object, { mv: number; rv: number; gid: number | undefined; key: string }>();
  const cacheKeyOf = (ro: RenderObjectInternals): unknown => {
    const mv = ro.material.version, rv = ro.version, gid = ro.geometry?.id;
    let c = materialKeys.get(ro);
    if (!c) { c = { mv, rv, gid, key: ro.getMaterialCacheKey() }; materialKeys.set(ro, c); }
    else if (c.mv !== mv || c.rv !== rv || c.gid !== gid) { c.mv = mv; c.rv = rv; c.gid = gid; c.key = ro.getMaterialCacheKey(); }
    return c.key + (ro.getDynamicCacheKey() as string);
  };
  const release = (key: unknown) => {
    const t = twins.get(key);
    if (!t) return;
    twins.delete(key); queue.twinsHeld = twins.size;
    twinned.delete(t.object);
    nodes0.delete(t.twin);
  };
  // the real render object now holds a twin's key: hand the twin's share back (twinned objects only)
  const settleTwin = (current: RenderObjectInternals | undefined) => {
    if (!current) return;
    const key = cacheKeyOf(current);
    const t = twins.get(key);
    if (t && t.twin !== current && nodes0.get(current).nodeBuilderState !== undefined) release(key);
  };
  // an object removed before it re-drew: its twin goes after TWIN_HOLD_MS (nobody needs the key
  // then). Once per frame (walk 10, C9c: per draw it cost a Date.now and a Map walk each).
  const sweepTwins = (frame: number | undefined) => {
    if (frame !== undefined && frame === sweptFrame) return;
    sweptFrame = frame ?? -1;
    const now = Date.now();
    for (const [k, t] of twins) if (now - t.at > TWIN_HOLD_MS) release(k);
  };
  // RenderObject.needsUpdate hashes the dynamic key on every read, and three reads it again in
  // its own draw (walk 10, C9b). The dynamic key is a function of the environment key (cached by
  // three per render call), the context node, receiveShadow and the camera count: re-hash only
  // when one of those moved. The clipping check is read without consuming three's flag.
  const dynamic = new WeakMap<object, { env: unknown; cid: unknown; cv: unknown; rs: boolean; cams: number; init: unknown; stale: boolean }>();
  const needsUpdateOf = (ro: RenderObjectInternals, renderer: RendererInternals): boolean => {
    const nodes = renderer._nodes;
    if (typeof nodes.getCacheKey !== "function" || !renderer.contextNode || !ro.object) return ro.needsUpdate;
    const clip = ro.clippingContext;
    if (clip && clip.cacheKey !== ro.clippingContextCacheKey) return true;
    const env = ro.material.isShadowPassMaterial === true ? 0 : nodes.getCacheKey(ro.scene, ro.lightsNode);
    const cid = renderer.contextNode.id, cv = renderer.contextNode.version;
    const rs = ro.object.receiveShadow === true;
    const cam = ro.camera as { isArrayCamera?: boolean; cameras?: unknown[] } | null;
    const cams = cam?.isArrayCamera ? cam.cameras!.length : -1;
    const init = ro.initialNodesCacheKey;
    let m = dynamic.get(ro);
    if (m && m.env === env && m.cid === cid && m.cv === cv && m.rs === rs && m.cams === cams && m.init === init) return m.stale;
    const stale = init !== ro.getDynamicCacheKey();
    if (!m) dynamic.set(ro, { env, cid, cv, rs, cams, init, stale });
    else { m.env = env; m.cid = cid; m.cv = cv; m.rs = rs; m.cams = cams; m.init = init; m.stale = stale; }
    return stale;
  };
  // named parameters matching three 0.184's signature: no rest array or destructure per draw (walk 10, C9a)
  r._renderObjectDirect = function (this: RendererInternals, object: unknown, material: unknown, scene: unknown, camera: unknown,
    lightsNode: unknown, group: unknown, clippingContext: unknown, passId: unknown) {
    // an offscreen pass that is not the frame's own: three's synchronous build, then the draw
    // and a full-screen quad (composite, blit): one skipped blacks the frame
    const target = this._renderTarget;
    if (target && !queue.frameTargets.has(target) && !this._renderObjectFunction) {
      draw.call(this, object, material, scene, camera, lightsNode, group, clippingContext, passId); return;
    }
    if ((object as { isQuadMesh?: boolean }).isQuadMesh) {
      draw.call(this, object, material, scene, camera, lightsNode, group, clippingContext, passId); return;
    }
    // a shadow-pass or override-material draw builds now: three swaps the shared override
    // material's positionNode/side/alphaTest per caster and restores it after the draw
    // (r184 Renderer.js:3402-3475), so a build deferred to pump() runs on the restored
    // material, caches under another key and the requested key never fills (walk 10 diag20
    // E1: six SteelMaleBody shadow draws held every day frame). These variants are few.
    if ((material as { isShadowPassMaterial?: boolean }).isShadowPassMaterial === true
      || ((scene as { overrideMaterial?: unknown } | null)?.overrideMaterial ?? null) !== null) {
      draw.call(this, object, material, scene, camera, lightsNode, group, clippingContext, passId); return;
    }
    if (twins.size) sweepTwins((this.info as { frame?: number } | undefined)?.frame);
    const objects = this._objects, nodes = this._nodes;
    // the per-draw lookup reuses one key array (no allocation per draw); the lookups after
    // draw.call build their own, as draw.call can re-enter this function (a shadow pass)
    const chain = objects.getChainMap(passId);
    const current = chainGet(chain, object, material, this._currentRenderContext, lightsNode);
    if (current && drawn.has(current)) {
      const changed = current.version !== (material as { version: number }).version || needsUpdateOf(current, this);
      const newKey = changed ? cacheKeyOf(current) : undefined;
      if (!changed || current.initialCacheKey === newKey || nodes.nodeBuilderCache.has(newKey)) {
        draw.call(this, object, material, scene, camera, lightsNode, group, clippingContext, passId);
        if (twins.size && twinned.has(object as object)) settleTwin(chainGet(chain, object, material, this._currentRenderContext, lightsNode));
        return;
      }
      // Re-keyed (a light, fog or material change) and the new program is not built: three would
      // dispose this render object and draw nothing until the build lands. Keep drawing it under
      // its built program and build the new key on a detached render object (never in the chain
      // map), so the swap happens on the first frame after the build: stale frames, never a vanish.
      // The real render object cannot build it: its node data already holds the old builder state.
      const ro = current;
      const key = newKey;
      if (queue.timedOut.has(key)) { draw.call(this, object, material, scene, camera, lightsNode, group, clippingContext, passId); return; }
      // the twin is built later, after three's render() has restored its render context to null:
      // take the context now (walk 10, C7: getMaterialCacheKey read context.id off null)
      const context = this._currentRenderContext;
      queue.request(key, distanceSq(object as Placed, camera as Viewer), () => {
        const twin = new ro.constructor(objects.nodes, objects.geometries, objects.renderer, object, material, scene, camera, lightsNode, context, clippingContext);
        // the constructor listens for material/geometry dispose: drop both now, or the shared
        // material retains every twin (and its nodes, bindings, attributes) for the session
        twin.material.removeEventListener("dispose", twin.onMaterialDispose);
        twin.geometry.removeEventListener("dispose", twin.onGeometryDispose);
        // not disposed: dispose would drop the cache entry it just built (usedTimes -> 0) before
        // the real render object takes it; `release` hands the share back once it has
        return Promise.resolve(nodes.getForRender(twin, true)).then(() => {
          if (twins.has(key)) release(key);
          twins.set(key, { twin, at: Date.now(), object: object as object }); twinned.add(object as object); queue.twinsHeld = twins.size;
        });
      }, materialLabel(material));
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
      draw.call(this, object, material, scene, camera, lightsNode, group, clippingContext, passId);
      if (twins.size && twinned.has(object as object)) settleTwin(chainGet(chain, object, material, this._currentRenderContext, lightsNode));
      return;
    }
    if (queue.timedOut.has(key)) { drawn.add(ro); draw.call(this, object, material, scene, camera, lightsNode, group, clippingContext, passId); return; }
    queue.request(key, distanceSq(object as Placed, camera as Viewer), () => nodes.getForRender(ro, true), materialLabel(material));
  };
  return queue;
}

/** Let draws into `target` defer like the canvas's (a per-frame scene pass target; no-op without a queue). */
export function deferBuildsInto(renderer: object, target: object): void {
  buildQueueOf(renderer)?.frameTargets.add(target);
}

/** The queue installed on `renderer`, if any (the diagnostics read its counters). */
export function buildQueueOf(renderer: object): BuildQueue | null {
  return (renderer as { esBuildQueue?: BuildQueue }).esBuildQueue ?? null;
}
