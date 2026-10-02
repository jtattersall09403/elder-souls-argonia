import { describe, expect, it } from "vitest";
import type { WebGPURenderer } from "three/webgpu";
import { BuildQueue, queueShaderBuilds } from "./shaderBuildQueue";

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
      getCacheKey: () => key,
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
      getCacheKey() { return key; }
    }
    const take = (ro: object) => { const s = cache.get(key) ?? { usedTimes: 0, key }; cache.set(key, s); s.usedTimes++; data.set(ro, { nodeBuilderState: s }); };
    let real = new RO(); take(real);
    const nodes = {
      nodeBuilderCache: cache,
      get: (ro: object) => data.get(ro) ?? {},
      getForRenderCacheKey: (ro: RO) => ro.getCacheKey(),
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
});

