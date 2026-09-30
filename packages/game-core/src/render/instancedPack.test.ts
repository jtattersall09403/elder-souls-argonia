import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MAX_VERTEX_BUFFERS, packInstancedAttributes, vertexBufferCount } from "./instancedPack";
import { WaterfallMistVolume } from "../water/render/WaterfallMistVolume";
import { traceWaterfallSheet, type Cascade } from "../water/render/WaterfallSheets";
import { createKitSharedUniforms } from "../water/render/WaterfallKitMaterial";

describe("instanced vertex buffers (WebGPU maxVertexBuffers = 8)", () => {
  it("packs per-instance attributes into one buffer with the same values", () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const a = new Float32Array([1, 2, 3, 4, 5, 6]);
    const b = new Float32Array([7, 8]);
    packInstancedAttributes(g, [["aA", a, 3], ["aB", b, 1]], 2);
    const mesh = new THREE.InstancedMesh(g, undefined as unknown as THREE.Material, 2);
    expect(vertexBufferCount(mesh)).toBe(3 + 1 + 1);
    const aA = g.getAttribute("aA") as THREE.InterleavedBufferAttribute;
    expect([aA.getX(1), aA.getY(1), aA.getZ(1)]).toEqual([4, 5, 6]);
    expect((g.getAttribute("aB") as THREE.InterleavedBufferAttribute).getX(1)).toBe(8);
  });

  it("counts separate instanced attributes one buffer each (the case that failed at 10)", () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 6; i++) g.setAttribute(`a${i}`, new THREE.InstancedBufferAttribute(new Float32Array(3), 3));
    const mesh = new THREE.InstancedMesh(g, undefined as unknown as THREE.Material, 1);
    expect(vertexBufferCount(mesh)).toBe(10);
  });

  it("the waterfall mist volume fits", () => {
    const cascade = {
      id: "f", lip: { x: 0, y: 20, z: 0 }, plunge: { x: 0, y: 0, z: 4 }, direction: { x: 0, z: 1 },
      widthM: 8, dropM: 20, riverBand: 0, bodyIndex: 0,
      profile: Array.from({ length: 40 }, (_, i) => (i < 1 ? 19.5 : -1.5)), profileStepM: 1, profileStartM: 0,
      lipSpeedMS: 3, bowlRadiusM: 6,
    } as Cascade;
    const mist = new WaterfallMistVolume([traceWaterfallSheet(cascade)], createKitSharedUniforms());
    expect(mist.mesh.count).toBe(1);
    expect(vertexBufferCount(mist.mesh)).toBeLessThanOrEqual(MAX_VERTEX_BUFFERS);
  });
});
