import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { meshHiddenBy, setMeshHidden } from "@elder-souls/game-core/actors/meshVisibility";
import { fadePlayerModel, gatePlayerFirstShow, warmPlayerFadePrograms } from "./playerFade";

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

describe("warmPlayerFadePrograms hides late equipment until it links (perf10 c12 R2 item 2: SteelShield)", () => {
  it("hides a mesh with a fresh material until the link resolves, keeps other hides, never re-hides", async () => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial()));
    const instant = () => Promise.resolve();
    await warmPlayerFadePrograms(group, instant).linked; // the player, shown
    const shield = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ name: "SteelShield0" }));
    group.add(shield);
    let finish!: () => void;
    const pending = new Promise<void>((r) => { finish = r; });
    let compiles = 0;
    const deferred = () => { compiles++; return pending; };
    const { warmed, linked } = warmPlayerFadePrograms(group, deferred);
    expect(warmed).toBe(1);
    expect(shield.visible).toBe(false);
    expect(warmPlayerFadePrograms(group, deferred).warmed).toBe(0); // next frame: no re-hide, no re-warm
    expect(compiles).toBe(2);
    expect(shield.visible).toBe(false);
    finish(); await linked;
    expect(shield.visible).toBe(true);
    expect(meshHiddenBy(shield).size).toBe(0);
    // A mesh armour hides stays hidden after its link.
    const covered = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    setMeshHidden(covered, "armour", true);
    group.add(covered);
    await warmPlayerFadePrograms(group, instant).linked;
    expect(covered.visible).toBe(false);
    expect([...meshHiddenBy(covered)]).toEqual(["armour"]);
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

describe("fadePlayerModel (vol10 diag6 C2: armour swapped in mid-fade stayed opaque)", () => {
  it("a material swapped in mid-fade takes the current opacity at once and is restored after", () => {
    const group = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ opacity: 0.9 });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), body);
    group.add(mesh);
    fadePlayerModel(group, 0.5);
    expect(body.opacity).toBeCloseTo(0.45, 6);
    const armour = new THREE.MeshStandardMaterial();
    group.add(new THREE.Mesh(new THREE.BufferGeometry(), armour));
    fadePlayerModel(group, 0.5); // same opacity: the old early return skipped the new mesh
    expect(armour.transparent).toBe(true);
    expect(armour.opacity).toBeCloseTo(0.5, 6);
    fadePlayerModel(group, 1);
    expect(body.opacity).toBeCloseTo(0.9, 6);
    expect(body.transparent).toBe(false);
    expect(armour.opacity).toBe(1);
    expect(armour.transparent).toBe(false);
    // a faded material taken off mid-fade and put back at full opacity is restored
    mesh.material = armour; fadePlayerModel(group, 0.3);
    mesh.material = body; fadePlayerModel(group, 1);
    expect(body.opacity).toBeCloseTo(0.9, 6);
  });
});

describe("fadePlayerModel depth write (vol10 diag7 O12: a part-faded head wrote depth and read detached)", () => {
  it("drops depthWrite while 0 < opacity < 1 and restores each material's own value at 1", () => {
    const group = new THREE.Group();
    const body = new THREE.MeshStandardMaterial();
    const glass = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false });
    group.add(new THREE.Mesh(new THREE.BufferGeometry(), body), new THREE.Mesh(new THREE.BufferGeometry(), glass));
    fadePlayerModel(group, 0.5);
    expect(body.depthWrite).toBe(false);
    expect(glass.depthWrite).toBe(false);
    fadePlayerModel(group, 1);
    expect(body.depthWrite).toBe(true);
    expect(glass.depthWrite).toBe(false);
  });
});
