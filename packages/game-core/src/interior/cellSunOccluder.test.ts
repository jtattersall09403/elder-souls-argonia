import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { apertureFace, CELL_SUN_OCCLUDER_MATERIAL, cellSunOccluder } from "./cellSunOccluder";

const box = new THREE.Box3(new THREE.Vector3(-4, 0, -3), new THREE.Vector3(4, 3, 3));
// one window in the +x wall, centre 0.3 m inside it (the Brinas case), 0.5 m radius
const window = { centre: new THREE.Vector3(3.7, 1.5, 0), outward: new THREE.Vector3(1, 0, 0), halfSideM: 0.5 };

function hits(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): boolean {
  const dir = to.clone().sub(from);
  const ray = new THREE.Raycaster(from, dir.clone().normalize(), 0, dir.length());
  return ray.intersectObject(mesh).length > 0;
}

describe("cellSunOccluder (vol10 diag4 D2)", () => {
  const mesh = cellSunOccluder(box, [window]);
  mesh.updateMatrixWorld();
  const floor = new THREE.Vector3(1.7, 0.01, 0);
  // the sun low in the east, beyond the +x window: aim through the hole centre
  const throughHole = new THREE.Vector3(4, 1.5 + (1.5 - 0.01) * (0.3 / 2), 0);
  const sunDir = throughHole.clone().sub(floor).normalize();

  it("opens the window: a floor point sees the sun through the hole", () => {
    expect(hits(mesh, floor, floor.clone().addScaledVector(sunDir, 20))).toBe(false);
  });
  it("closes the wall: the same sun from a floor point off the window is blocked", () => {
    const off = new THREE.Vector3(1.7, 0.01, 2);
    expect(hits(mesh, off, off.clone().addScaledVector(sunDir, 20))).toBe(true);
    const noon = new THREE.Vector3(0, 0.01, 0);
    expect(hits(mesh, noon, new THREE.Vector3(0, 20, 0))).toBe(true);
  });
  it("projects an aperture centre onto the face it exits by", () => {
    const f = apertureFace(box, window);
    expect([f.axis, f.max, f.centre.x]).toEqual([0, true, 4]);
  });
  it("is shadow-only and shares one material", () => {
    expect(mesh.castShadow).toBe(true);
    expect(CELL_SUN_OCCLUDER_MATERIAL.colorWrite).toBe(false);
    expect(CELL_SUN_OCCLUDER_MATERIAL.depthWrite).toBe(false);
    expect(cellSunOccluder(box, []).material).toBe(mesh.material);
  });
  it("is deterministic in its inputs", () => {
    const a = cellSunOccluder(box, [window]).geometry.getAttribute("position").array;
    expect(Array.from(a)).toEqual(Array.from(mesh.geometry.getAttribute("position").array));
  });
});
