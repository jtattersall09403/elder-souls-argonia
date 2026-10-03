import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { releaseHeld, setDrawCount } from "./drawCount";

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

  it("a held member stays hidden whatever its count; a pool of empty members shows none on release (F38)", () => {
    const pool = [0, 0, 3, 0].map((count) => ({
      mesh: new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 4),
      count, held: true,
    }));
    for (const m of pool) setDrawCount(m.mesh, m.count, m.held);
    expect(pool.some((m) => m.mesh.visible)).toBe(false);
    // The link settles: the old `show` set every member visible, 3 of them empty.
    for (const m of pool) releaseHeld(m);
    expect(pool.filter((m) => m.mesh.visible).map((m) => m.count)).toEqual([3]);
    expect(pool.every((m) => !m.held)).toBe(true);
  });
});
