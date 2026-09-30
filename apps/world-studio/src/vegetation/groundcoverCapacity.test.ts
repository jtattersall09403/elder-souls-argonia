import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { gcMeshCapacity } from "./Groundcover";

describe("ground-cover mesh capacity", () => {
  it("reads the staging rows on the GPU cull path, not the pool's shared instanceMatrix", () => {
    const mesh = new THREE.InstancedMesh(new THREE.BufferGeometry(), undefined, 64);
    // GpuCullSystem.addDraw swaps in the pool-wide output buffer.
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(100_000 * 16), 16);
    const gc = { matrices: new Float32Array(64 * 16) } as Parameters<typeof gcMeshCapacity>[1];
    expect(gcMeshCapacity(mesh, gc)).toBe(64);
    // 65 rows must regrow the mesh, or the fill writes past the staging arrays.
    expect(gcMeshCapacity(mesh, gc) < 65).toBe(true);
  });

  it("reads instanceMatrix on the CPU path", () => {
    const mesh = new THREE.InstancedMesh(new THREE.BufferGeometry(), undefined, 96);
    expect(gcMeshCapacity(mesh, undefined)).toBe(96);
  });
});
