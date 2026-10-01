import { describe, expect, it } from "vitest";
import { BuildBudget, budgetShaderBuilds } from "./shaderBuildBudget";
import type { WebGPURenderer } from "three/webgpu";

describe("BuildBudget", () => {
  it("admits builds until the frame's ms are spent, always one per frame, and resets each frame", () => {
    const b = new BuildBudget(12);
    expect(b.admit(1)).toBe(true); b.spend(30); // one build may overrun on its own
    expect(b.admit(1)).toBe(false);
    expect(b.admit(2)).toBe(true); b.spend(5);
    expect(b.admit(2)).toBe(true); b.spend(8);
    expect(b.admit(2)).toBe(false);
    expect(b.deferred).toBe(2);
  });
});

describe("budgetShaderBuilds", () => {
  it("draws built objects freely and holds unbuilt ones past the budget to a later frame", () => {
    const built = new Set<string>();
    const drawn: string[] = [];
    const nodes = {
      nodeFrame: { frameId: 1 },
      nodeBuilderCache: new Map<unknown, unknown>(),
      get: (ro: { key: string }) => ({ nodeBuilderState: built.has(ro.key) ? {} : undefined }),
      getForRenderCacheKey: (ro: { key: string }) => ro.key,
    };
    let clock = 0;
    const fake = {
      _objects: { get: (object: string) => ({ key: object }) },
      _currentRenderContext: null,
      _nodes: nodes,
      _renderObjectDirect(object: string) { if (!built.has(object)) { clock += 20; built.add(object); } drawn.push(object); },
    };
    const realNow = performance.now;
    performance.now = () => clock;
    try {
      const budget = budgetShaderBuilds(fake as unknown as WebGPURenderer, 12)!;
      const frame = () => { for (const o of ["a", "b", "c"]) (fake._renderObjectDirect as (...a: unknown[]) => void)(o); };
      frame();
      expect(drawn).toEqual(["a"]);
      nodes.nodeFrame.frameId = 2; frame();
      expect(drawn).toEqual(["a", "a", "b"]);
      nodes.nodeFrame.frameId = 3; frame();
      expect(drawn.slice(3)).toEqual(["a", "b", "c"]);
      expect(budget.deferred).toBe(3);
      expect(budgetShaderBuilds(fake as unknown as WebGPURenderer, 0)).toBeNull();
    } finally {
      performance.now = realNow;
    }
  });
});
