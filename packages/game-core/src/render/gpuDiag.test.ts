import { describe, expect, it } from "vitest";
import { createGpuDiag } from "./gpuDiag";

function fakeDevice() {
  const pass = { draw() {}, drawIndexed() {}, drawIndirect() {}, drawIndexedIndirect() {} };
  return {
    queue: { writeBuffer(..._a: unknown[]) {}, writeTexture(..._a: unknown[]) {}, submit(..._a: unknown[]) {} },
    createRenderPipeline: () => ({}), createRenderPipelineAsync: async () => ({}),
    createComputePipeline: () => ({}), createComputePipelineAsync: async () => ({}),
    createShaderModule: () => ({}), createBindGroup: () => ({}),
    createBuffer: (_d?: unknown) => ({ destroy() {} }), createTexture: () => ({ destroy() {} }),
    createCommandEncoder: () => ({ beginRenderPass: () => ({ ...pass }) }),
    createRenderBundleEncoder: () => ({ ...pass }),
  };
}

describe("gpuDiag", () => {
  it("counts per frame and rolls frames up per second", () => {
    const dev = fakeDevice();
    const nodes = { _createNodeBuilderState: (o: { material: { name: string } }) => o };
    const diag = createGpuDiag(dev as unknown as GPUDevice, nodes as never, 4);
    dev.createRenderPipeline();
    dev.createBuffer({ size: 64 } as never).destroy();
    dev.queue.writeBuffer({} as never, 0 as never, new Uint8Array(10) as never);
    const p = dev.createCommandEncoder().beginRenderPass();
    p.draw(); p.drawIndexed();
    nodes._createNodeBuilderState({ material: { name: "kit 1234" } });
    const f = diag.endFrame(100);
    expect(f).toMatchObject({ pipelines: 1, buffers: 1, bufferBytes: 64, bufferDestroys: 1, writeBytes: 10, draws: 2, builds: 1 });
    diag.endFrame(600); diag.endFrame(1100); diag.endFrame(1200); diag.endFrame(1300);
    expect(diag.frames()).toHaveLength(4); // capacity
    const secs = diag.seconds();
    expect(secs.map((s) => s.fps)).toEqual([1, 3]);
    expect(diag.buildsBy()).toEqual([["kit #", 1]]);
  });
});
