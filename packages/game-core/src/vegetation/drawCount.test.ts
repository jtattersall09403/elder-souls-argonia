import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { setDrawCount } from "./drawCount";

describe("setDrawCount", () => {
  it("hides an empty instanced mesh and shows it again when it draws", () => {
    const mesh = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 4);
    setDrawCount(mesh, 0);
    expect(mesh.count).toBe(0);
    expect(mesh.visible).toBe(false);
    setDrawCount(mesh, 3);
    expect(mesh.count).toBe(3);
    expect(mesh.visible).toBe(true);
  });
});
