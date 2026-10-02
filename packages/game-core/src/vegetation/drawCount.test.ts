import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { LINK_HELD, applyVisibility, setDrawCount } from "./drawCount";

const instanced = () => new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 4);

describe("setDrawCount", () => {
  it("CPU path: hides an empty mesh and shows it again when it draws", () => {
    const mesh = instanced();
    const rule = () => mesh.count > 0;
    setDrawCount(mesh, 0, rule);
    expect(mesh.visible).toBe(false);
    setDrawCount(mesh, 3, rule);
    expect(mesh.count).toBe(3);
    expect(mesh.visible).toBe(true);
  });

  it("GPU path: visibility follows registration, never the count", () => {
    const mesh = instanced();
    let registered = false;
    const rule = () => registered;
    setDrawCount(mesh, 3, rule);
    expect(mesh.visible).toBe(false);
    registered = true;
    setDrawCount(mesh, 0, rule);
    expect(mesh.visible).toBe(true);
    registered = false;
    applyVisibility(mesh, rule);
    expect(mesh.visible).toBe(false);
  });

  it("a mesh held by the link gate stays hidden whatever its rule says", () => {
    const mesh = instanced();
    mesh.userData[LINK_HELD] = true;
    setDrawCount(mesh, 3, () => mesh.count > 0);
    expect(mesh.visible).toBe(false);
  });
});
