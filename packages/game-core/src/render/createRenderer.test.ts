import { describe, expect, it } from "vitest";
import { shareInstancedPrograms } from "./createRenderer";
import type { WebGPURenderer } from "three/webgpu";

describe("shareInstancedPrograms", () => {
  it("puts every InstancedMesh on the attribute path (no per-mesh uniform buffer)", () => {
    // three's InstanceNode uses a uniform buffer when count * 64 <= the limit;
    // a count of 0 must fail that test too.
    const capabilities = { getUniformBufferLimit: () => 65536 };
    shareInstancedPrograms({ backend: { capabilities } } as unknown as WebGPURenderer);
    expect(0 * 64 <= capabilities.getUniformBufferLimit()).toBe(false);
  });
});
