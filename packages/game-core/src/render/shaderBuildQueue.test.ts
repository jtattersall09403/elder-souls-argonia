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
    expect(q.deferred).toBe(4);
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
      _objects: { get: (object: { id: string }) => ({ key: object.id }) },
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
    expect(queue.deferred).toBe(2);
    expect(queueShaderBuilds(fake as unknown as WebGPURenderer, 0)).toBeNull();
  });
});
