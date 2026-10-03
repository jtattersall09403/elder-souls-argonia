import { describe, expect, it } from "vitest";
import type { WebGPURenderer } from "three/webgpu";
import { BuildQueue, deferBuildsInto, queueShaderBuilds } from "./shaderBuildQueue";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("BuildQueue", () => {
  it("builds each key once, at most inFlight at a time, nearest first", async () => {
    const started: string[] = [];
    const done = new Map<string, () => void>();
    const start = (k: string) => () => { started.push(k); return new Promise<void>((r) => done.set(k, r)); };
    const q = new BuildQueue<string>(1);
    q.request("far", 100, start("far"));
    q.request("near", 1, start("near"));
    q.request("mid", 10, start("mid"));
    await tick();
    expect(started).toEqual(["near"]); // chosen once the frame's requests are all in
    q.request("far", 100, start("far")); // a repeat of a waiting build is not queued twice
    done.get("near")!(); await tick(); await tick();
    expect(started).toEqual(["near", "mid"]);
    done.get("mid")!(); await tick(); await tick();
    expect(started).toEqual(["near", "mid", "far"]);
    expect(q.skippedDraws).toBe(4);
    done.get("far")!(); await tick(); await tick();
    expect(q.pending).toBe(0);
    expect(q.built).toBe(3);
  });
});

describe("queueShaderBuilds", () => {
  it("times out a build that never settles: logs its key once, frees the slot, runs the next; a late settle frees nothing", async () => {
    const logged: string[] = [];
    let settleHung: () => void = () => {};
    const q = new BuildQueue<string>(1, () => {}, 50, (k, label) => logged.push(`${k}:${label}`));
    const ran: string[] = [];
    q.request("hung", 1, () => { ran.push("hung"); return new Promise<void>((r) => { settleHung = r; }); }, "Marsh (MeshStandardNodeMaterial)");
    q.request("next", 2, () => { ran.push("next"); return new Promise<void>(() => {}); }, "Next");
    await tick();
    expect(ran).toEqual(["hung"]);
    await new Promise((r) => setTimeout(r, 70));
    expect(logged).toEqual(["hung:Marsh (MeshStandardNodeMaterial)"]);
    expect(q.timedOut.has("hung")).toBe(true);
    expect(ran).toEqual(["hung", "next"]);
    settleHung(); await tick(); await tick();
    expect(q.pending).toBe(1); // "next" still holds its slot: the late settle freed nothing
    expect(q.built).toBe(0);
  });

  it("draws full-screen quads and timed-out keys synchronously", () => {
    const drawn: string[] = [];
    const fake = {
      _objects: { get: (object: { id: string }) => ({ key: object.id }), getChainMap: () => ({ get: () => undefined }) },
      _currentRenderContext: null,
      _renderTarget: null as object | null,
      _renderObjectFunction: null as unknown,
      _nodes: { nodeBuilderCache: new Map(), get: () => ({ nodeBuilderState: undefined }), getForRenderCacheKey: (ro: { key: string }) => ro.key, getForRender: () => new Promise(() => {}) },
      _renderObjectDirect(object: { id: string }) { drawn.push(object.id); },
    };
    const queue = queueShaderBuilds(fake as unknown as WebGPURenderer, 1)!;
    const call = (o: object) => (fake._renderObjectDirect as (...a: unknown[]) => void)(o, {}, {}, {});
    call({ id: "blit", isQuadMesh: true });
    queue.timedOut.add("hung");
    call({ id: "hung" });
    call({ id: "mesh" });
    expect(drawn).toEqual(["blit", "hung"]);
    expect(queue.skippedDraws).toBe(1);
  });

  it("builds an offscreen one-shot draw synchronously; defers canvas, frame-target and shadow draws", () => {
    const drawn: string[] = [];
    const fake = {
      _objects: { get: (object: { id: string }) => ({ key: object.id }), getChainMap: () => ({ get: () => undefined }) },
      _currentRenderContext: null,
      _renderTarget: null as object | null,
      _renderObjectFunction: null as unknown,
      _nodes: { nodeBuilderCache: new Map(), get: () => ({ nodeBuilderState: undefined }), getForRenderCacheKey: (ro: { key: string }) => ro.key, getForRender: () => new Promise(() => {}) },
      _renderObjectDirect(object: { id: string }) { drawn.push(object.id); },
    };
    const queue = queueShaderBuilds(fake as unknown as WebGPURenderer, 1)!;
    const call = (id: string) => (fake._renderObjectDirect as (...a: unknown[]) => void)({ id }, {}, {}, {});
    const bake = {}, sceneTarget = {}, shadowMap = {};
    fake._renderTarget = bake; call("pmrem"); // a one-shot bake: drawn on first use
    fake._renderTarget = null; call("canvas"); // the canvas: deferred
    deferBuildsInto(fake, sceneTarget);
    fake._renderTarget = sceneTarget; call("scene"); // the registered scene pass target: deferred
    fake._renderTarget = shadowMap; fake._renderObjectFunction = () => {}; call("shadow"); // shadow pass: deferred
    expect(drawn).toEqual(["pmrem"]);
    expect(queue.skippedDraws).toBe(3);
  });

  it("never queues a shadow-pass or override-material draw (three restores the override before pump); a normal draw still queues", () => {
    const drawn: string[] = [];
    const fake = {
      _objects: { get: (object: { id: string }) => ({ key: object.id }), getChainMap: () => ({ get: () => undefined }) },
      _currentRenderContext: null,
      _renderTarget: {} as object | null,
      _renderObjectFunction: () => {},
      _nodes: { nodeBuilderCache: new Map(), get: () => ({ nodeBuilderState: undefined }), getForRenderCacheKey: (ro: { key: string }) => ro.key, getForRender: () => new Promise(() => {}) },
      _renderObjectDirect(object: { id: string }) { drawn.push(object.id); },
    };
    const queue = queueShaderBuilds(fake as unknown as WebGPURenderer, 1)!;
    const call = (id: string, material: object, scene: object) => (fake._renderObjectDirect as (...a: unknown[]) => void)({ id }, material, scene, {});
    const shadowMaterial = { isShadowPassMaterial: true, positionNode: { skinned: true } };
    call("caster", shadowMaterial, { overrideMaterial: shadowMaterial });
    shadowMaterial.positionNode = null as unknown as { skinned: boolean }; // three restores the override after the draw
    call("override", {}, { overrideMaterial: {} });
    call("shadowPass", { isShadowPassMaterial: true }, { overrideMaterial: null });
    call("normal", {}, { overrideMaterial: null });
    expect(drawn).toEqual(["caster", "override", "shadowPass"]);
    expect(queue.skippedDraws).toBe(1);
    expect(queue.pending).toBe(1);
  });

  it("draws built objects, queues unbuilt ones off the frame, draws them once built", async () => {
    const built = new Set<string>();
    const drawn: string[] = [];
    const nodes = {
      nodeBuilderCache: new Map<unknown, unknown>(),
      get: (ro: { key: string }) => ({ nodeBuilderState: built.has(ro.key) ? {} : undefined }),
      getForRenderCacheKey: (ro: { key: string }) => ro.key,
      getForRender: async (ro: { key: string }) => { await tick(); built.add(ro.key); },
    };
    const fake = {
      _objects: { get: (object: { id: string }) => ({ key: object.id }), getChainMap: () => ({ get: () => undefined }) },
      _currentRenderContext: null,
      _nodes: nodes,
      _renderObjectDirect(object: { id: string }) { drawn.push(object.id); },
    };
    built.add("a");
    const queue = queueShaderBuilds(fake as unknown as WebGPURenderer, 2)!;
    const at = (id: string, x: number) => ({ id, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1] } });
    const camera = { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } };
    const frame = () => { for (const o of [at("a", 0), at("b", 5), at("c", 50)]) (fake._renderObjectDirect as (...a: unknown[]) => void)(o, {}, {}, camera); };
    frame();
    expect(drawn).toEqual(["a"]);
    await tick(); await tick(); await tick();
    frame();
    expect(drawn.slice(1)).toEqual(["a", "b", "c"]);
    expect(queue.skippedDraws).toBe(2);
    expect(queueShaderBuilds(fake as unknown as WebGPURenderer, 0)).toBeNull();
  });

  it("keeps drawing a re-keyed object under its built program while the new key builds", async () => {
    const drawnDirect: string[] = [];
    const cache = new Map<unknown, unknown>([["k1", {}]]);
    const mat = { version: 0 };
    let key = "k1";
    const ro = {
      key: "k1", version: 0, initialCacheKey: "k1", material: mat, camera: null, drawRange: null, group: null,
      get needsUpdate() { return key !== "k1"; },
      getMaterialCacheKey: () => "", getDynamicCacheKey: () => key,
    };
    let built = 0;
    const quiet = { removeEventListener() {} };
    class Twin { material = quiet; geometry = quiet; onMaterialDispose = null; onGeometryDispose = null; }
    Object.defineProperty(ro, "constructor", { value: Twin });
    const nodes = {
      nodeBuilderCache: cache,
      get: () => ({ nodeBuilderState: {} }),
      getForRenderCacheKey: (r: { key: string }) => r.key,
      getForRender: async () => { await tick(); built++; cache.set(key, {}); },
      delete() {},
      needsRefresh: () => false, updateBefore() {}, updateForRender() {}, updateAfter() {},
    };
    const fake = {
      _objects: { get: () => ro, getChainMap: () => ({ get: () => ro }), nodes: {}, geometries: {}, renderer: {} },
      _currentRenderContext: null, _currentRenderBundle: null,
      _nodes: nodes,
      _geometries: { updateForRender() {} }, _bindings: { updateForRender() {} },
      _pipelines: { updateForRender() {}, isReady: () => true },
      backend: { draw: () => drawnDirect.push("stale") },
      info: {},
      _renderObjectDirect() { drawnDirect.push("three"); },
    };
    const queue = queueShaderBuilds(fake as unknown as WebGPURenderer, 1)!;
    const object = { geometry: { drawRange: {} }, matrixWorld: { elements: new Array(16).fill(0) } };
    const camera = { matrixWorld: { elements: new Array(16).fill(0) } };
    const draw = () => (fake._renderObjectDirect as (...a: unknown[]) => void)(object, mat, {}, camera, {}, null, null, "default");
    draw(); draw(); // first draw marks ro built; second is the fast path
    expect(drawnDirect).toEqual(["three", "three"]);
    key = "k2"; // a light flip re-keys it
    draw();
    expect(drawnDirect[2]).toBe("stale");
    await tick(); await tick(); await tick();
    expect(built).toBe(1);
    expect(queue.pending).toBe(0);
    draw();
    expect(drawnDirect[3]).toBe("three");
  });

  it("leaves no twin listening on the material and none retained after N re-keys", async () => {
    const listeners = new Set<unknown>();
    const mat = { version: 0, addEventListener: (_t: string, f: unknown) => listeners.add(f), removeEventListener: (_t: string, f: unknown) => listeners.delete(f) };
    const geo = { drawRange: {}, addEventListener() {}, removeEventListener() {} };
    const cache = new Map<unknown, { usedTimes: number; key: string }>();
    const data = new WeakMap<object, { nodeBuilderState?: { usedTimes: number; key: string } }>();
    let key = "k0";
    class RO {
      version = 0; camera = null; drawRange = null; group = null; material = mat; geometry = geo;
      initialCacheKey = key; onMaterialDispose = () => {}; onGeometryDispose = () => {};
      constructor() { mat.addEventListener("dispose", this.onMaterialDispose); }
      get needsUpdate() { return this.initialCacheKey !== key; }
      getMaterialCacheKey() { return ""; }
      getDynamicCacheKey() { return key; }
    }
    const take = (ro: object) => { const s = cache.get(key) ?? { usedTimes: 0, key }; cache.set(key, s); s.usedTimes++; data.set(ro, { nodeBuilderState: s }); };
    let real = new RO(); take(real);
    const nodes = {
      nodeBuilderCache: cache,
      get: (ro: object) => data.get(ro) ?? {},
      getForRenderCacheKey: (ro: RO) => ro.getMaterialCacheKey() + ro.getDynamicCacheKey(),
      getForRender: async (ro: RO) => { await tick(); take(ro); },
      delete: (ro: RO) => { const s = data.get(ro)?.nodeBuilderState; data.delete(ro); if (s && --s.usedTimes === 0) cache.delete(s.key); },
      needsRefresh: () => false, updateBefore() {}, updateForRender() {}, updateAfter() {},
    };
    const fake = {
      _objects: { get: () => real, getChainMap: () => ({ get: () => real }), nodes: {}, geometries: {}, renderer: {} },
      _currentRenderContext: null, _currentRenderBundle: null, _nodes: nodes,
      _geometries: { updateForRender() {} }, _bindings: { updateForRender() {} },
      _pipelines: { updateForRender() {}, isReady: () => true },
      backend: { draw() {} }, info: {},
      // three's own draw: a stale render object with its key cached is replaced (the old one disposed)
      _renderObjectDirect() {
        if (real.needsUpdate) { mat.removeEventListener("dispose", real.onMaterialDispose); nodes.delete(real); real = new RO(); take(real); }
      },
    };
    const queue = queueShaderBuilds(fake as unknown as WebGPURenderer, 1)!;
    const object = { geometry: geo, matrixWorld: { elements: new Array(16).fill(0) } };
    const camera = { matrixWorld: { elements: new Array(16).fill(0) } };
    const draw = () => (fake._renderObjectDirect as (...a: unknown[]) => void)(object, mat, {}, camera, {}, null, null, "default");
    draw(); draw();
    for (let i = 1; i <= 5; i++) {
      key = `k${i}`;
      draw(); // stale draw, twin build queued
      await tick(); await tick(); await tick(); await tick();
      draw(); // three swaps onto the built key; the twin's share is released
    }
    expect(listeners.size).toBe(1); // the real render object's listener only
    expect(queue.twinsHeld).toBe(0);
    expect(cache.size).toBe(1);
    expect(cache.get("k5")!.usedTimes).toBe(1);
  });

  /** A re-keyable render object and a fake renderer whose render() context is null between frames. */
  const rekeyRig = (getForRender: (ro: unknown) => unknown) => {
    const mat = { version: 0 };
    const state = { key: "k1", materialKeyCalls: 0, constructedWith: [] as unknown[], drawn: 0 };
    const cache = new Map<unknown, unknown>([["k1", {}]]);
    const quiet = { removeEventListener() {} };
    const ro = {
      version: 0, initialCacheKey: "k1", material: mat, geometry: { id: 7, ...quiet }, camera: null, drawRange: null, group: null,
      get needsUpdate() { return state.key !== "k1"; },
      getMaterialCacheKey: () => { state.materialKeyCalls++; return ""; },
      getDynamicCacheKey: () => state.key,
    };
    class Twin {
      material = quiet; geometry = quiet; onMaterialDispose = null; onGeometryDispose = null;
      constructor(...a: unknown[]) { state.constructedWith.push(a[8]); }
    }
    Object.defineProperty(ro, "constructor", { value: Twin });
    const fake = {
      _objects: { get: () => ro, getChainMap: () => ({ get: () => ro }), nodes: {}, geometries: {}, renderer: {} },
      _currentRenderContext: null as unknown, _currentRenderBundle: null,
      _nodes: {
        nodeBuilderCache: cache, get: () => ({ nodeBuilderState: {} }), getForRenderCacheKey: () => "k1",
        getForRender, delete() {}, needsRefresh: () => false, updateBefore() {}, updateForRender() {}, updateAfter() {},
      },
      _geometries: { updateForRender() {} }, _bindings: { updateForRender() {} },
      _pipelines: { updateForRender() {}, isReady: () => true },
      backend: { draw() {} }, info: {},
      _renderObjectDirect() { state.drawn++; },
    };
    const object = { geometry: { drawRange: {} }, matrixWorld: { elements: new Array(16).fill(0) } };
    const camera = { matrixWorld: { elements: new Array(16).fill(0) } };
    const queue = queueShaderBuilds(fake as unknown as WebGPURenderer, 1)!;
    // a draw inside render(): the context is set for the draw and restored to null after it
    const draw = () => {
      fake._currentRenderContext = { id: 3 };
      (fake._renderObjectDirect as (...a: unknown[]) => void)(object, mat, {}, camera, {}, null, null, "default");
      fake._currentRenderContext = null;
    };
    return { state, queue, draw, mat };
  };

  it("builds a twin with the render context of its request, after render() restored it to null", async () => {
    const rig = rekeyRig(async () => {});
    rig.draw(); rig.draw();
    rig.state.key = "k2";
    rig.draw();
    await tick(); await tick();
    expect(rig.state.constructedWith).toEqual([{ id: 3 }]);
  });

  it("never retries a twin build that throws: it falls back to three's synchronous draw", async () => {
    const errors: unknown[] = [];
    const origError = console.error;
    console.error = (...a: unknown[]) => { errors.push(a[0]); };
    try {
      let builds = 0;
      const rig = rekeyRig(() => { builds++; throw new Error("boom"); });
      rig.draw(); rig.draw();
      rig.state.key = "k2";
      rig.draw();
      await tick(); await tick();
      expect(rig.queue.timedOut.has("k2")).toBe(true);
      const drawnBefore = rig.state.drawn;
      for (let i = 0; i < 5; i++) { rig.draw(); await tick(); }
      expect(builds).toBe(1);
      expect(rig.state.drawn - drawnBefore).toBe(5);
      expect(errors).toHaveLength(1);
      expect(String(errors[0])).toContain("k2");
    } finally { console.error = origError; }
  });

  it("computes a stale object's material key once until its material, geometry or version changes", async () => {
    const rig = rekeyRig(() => new Promise(() => {}));
    rig.draw(); rig.draw();
    rig.state.key = "k2";
    rig.draw();
    const after = rig.state.materialKeyCalls;
    expect(after).toBe(1);
    rig.draw(); rig.draw();
    expect(rig.state.materialKeyCalls).toBe(after);
    rig.mat.version++;
    rig.draw();
    expect(rig.state.materialKeyCalls).toBe(after + 1);
  });

  it("re-hashes a drawn object's dynamic key only when the environment key or context node moved (C9b)", () => {
    const mat = { version: 0 };
    let hashes = 0, env = 1;
    const ro = {
      version: 0, initialCacheKey: "k1", initialNodesCacheKey: 5, material: mat, geometry: { id: 1 }, object: { receiveShadow: true },
      clippingContext: null, camera: null, scene: {}, lightsNode: {},
      get needsUpdate(): boolean { throw new Error("needsUpdate read"); },
      getMaterialCacheKey: () => "", getDynamicCacheKey: () => { hashes++; return env === 1 ? 5 : 6; },
    };
    const contextNode = { id: 9, version: 0 };
    const fake = {
      _objects: { get: () => ro, getChainMap: () => ({ get: () => ro }), nodes: {}, geometries: {}, renderer: {} },
      _currentRenderContext: { id: 3 }, _currentRenderBundle: null, contextNode,
      _nodes: {
        nodeBuilderCache: new Map([["k1", {}], ["6", {}]]), get: () => ({ nodeBuilderState: {} }), getForRenderCacheKey: () => "k1",
        getCacheKey: () => env, getForRender() {}, delete() {}, needsRefresh: () => false, updateBefore() {}, updateForRender() {}, updateAfter() {},
      },
      _geometries: { updateForRender() {} }, _bindings: { updateForRender() {} },
      _pipelines: { updateForRender() {}, isReady: () => true },
      backend: { draw() {} }, info: { frame: 0 },
      _renderObjectDirect() {},
    };
    queueShaderBuilds(fake as unknown as WebGPURenderer, 1);
    const object = { geometry: { drawRange: {} } };
    const draw = () => (fake._renderObjectDirect as (...a: unknown[]) => void)(object, mat, {}, {}, {}, null, null, "default");
    draw(); draw(); draw(); draw();
    expect(hashes).toBe(1);
    contextNode.version++;
    draw(); draw();
    expect(hashes).toBe(2);
    env = 2;
    draw();
    expect(hashes).toBeGreaterThan(2); // re-hashed (plus the re-key lookup's own read)
  });
});
