import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { gatePlayerFirstShow, warmPlayerFadePrograms } from "./playerFade";

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
    expect(warmPlayerFadePrograms(group, compile).warmed).toBe(1);
    expect(seen).toEqual([true, false]);
    expect(body.transparent).toBe(false);
    expect(mesh.material).toBe(body);
    expect(warmPlayerFadePrograms(group, compile).warmed).toBe(0);
    group.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ transparent: true })));
    expect(warmPlayerFadePrograms(group, compile).warmed).toBe(1); // an equipment change's new material
    expect(seen.slice(2)).toEqual([false, false, false, true]); // per compile, both meshes: only the new one flips
  });
});

describe("gatePlayerFirstShow (perf10 diag 6 C3: the warm ran after the player's first draw)", () => {
  it("keeps the player hidden until its fade programs link, then shows it once", async () => {
    const group = new THREE.Group();
    let compiles = 0;
    let finish!: () => void;
    const linked = new Promise<void>((r) => { finish = r; });
    const compile = () => { compiles++; return linked; };
    expect(gatePlayerFirstShow(group, true, compile)).toBe(false); // no mesh loaded yet
    expect(group.visible).toBe(false);
    group.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial()));
    expect(gatePlayerFirstShow(group, false, compile)).toBe(false); // scene pass not seen: key unknown
    expect(compiles).toBe(0);
    expect(gatePlayerFirstShow(group, true, compile)).toBe(false);
    expect(compiles).toBe(2); // warmed before any visible frame
    expect(gatePlayerFirstShow(group, true, compile)).toBe(false);
    expect(compiles).toBe(2);
    expect(group.visible).toBe(false);
    finish(); await linked; await Promise.resolve(); await Promise.resolve();
    expect(group.visible).toBe(true);
    expect(gatePlayerFirstShow(group, true, compile)).toBe(true);
  });
});
