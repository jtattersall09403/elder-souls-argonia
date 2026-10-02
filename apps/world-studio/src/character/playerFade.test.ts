import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { warmPlayerFadePrograms } from "./playerFade";

describe("warmPlayerFadePrograms (16k walk 10: first fade linked every player material mid-walk)", () => {
  it("compiles each new material transparent then as drawn, once", () => {
    const group = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ name: "Body" });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), body);
    group.add(mesh);
    const seen: boolean[] = [];
    const compile = (object: THREE.Object3D) => object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) seen.push((m.material as THREE.Material).transparent);
    });
    expect(warmPlayerFadePrograms(group, compile)).toBe(1);
    expect(seen).toEqual([true, false]);
    expect(body.transparent).toBe(false);
    expect(mesh.material).toBe(body);
    expect(warmPlayerFadePrograms(group, compile)).toBe(0);
    group.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ transparent: true })));
    expect(warmPlayerFadePrograms(group, compile)).toBe(1); // an equipment change's new material
    expect(seen.slice(2)).toEqual([false, false, false, true]); // per compile, both meshes: only the new one flips
  });
});
