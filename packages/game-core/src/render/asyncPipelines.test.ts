import { describe, expect, it } from "vitest";
import type { WebGPURenderer } from "three/webgpu";
import { compilePipelinesAsync, pipelineCompilesOf } from "./asyncPipelines";

describe("compilePipelinesAsync", () => {
  it("routes the per-draw pipeline step down the async path and counts the compiles", async () => {
    let release!: () => void;
    const seen: unknown[] = [];
    const pipelines = {
      getForRender(_ro: object, promises?: { push(p: Promise<unknown>): void } | null) {
        seen.push(promises);
        promises?.push(new Promise<void>((r) => { release = r; }));
      },
      updateForRender(ro: object) { this.getForRender(ro, null); },
    };
    const renderer = { _pipelines: pipelines } as unknown as WebGPURenderer;
    const state = compilePipelinesAsync(renderer);
    pipelines.updateForRender({});
    expect(seen[0]).not.toBeNull();
    expect(state.pending).toBe(1);
    release(); await Promise.resolve(); await Promise.resolve();
    expect(state).toEqual({ pending: 0, done: 1 });
    expect(pipelineCompilesOf(renderer)).toBe(state);
  });
});
