/** CityMarkers freezes its static matrices (perf10 f6): nothing under the root recomposes per frame. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { freezeMatrices } from "./CityMarkers";

describe("freezeMatrices", () => {
  it("composes each matrix once and turns matrixAutoUpdate off", () => {
    const root = new THREE.Group();
    const marker = new THREE.Group();
    marker.position.set(10, 2, -5);
    const sprite = new THREE.Sprite();
    sprite.position.set(0, 400, 0);
    marker.add(sprite);
    root.add(marker);
    freezeMatrices(root);
    let on = 0;
    root.traverse((o) => { if (o.matrixAutoUpdate) on++; });
    expect(on).toBe(0);
    expect(new THREE.Vector3().setFromMatrixPosition(sprite.matrixWorld).toArray()).toEqual([10, 402, -5]);
    // a later move is ignored until the owner calls updateMatrix (the rescaled sprites do)
    marker.position.x = 99;
    root.updateMatrixWorld();
    expect(sprite.matrixWorld.elements[12]).toBe(10);
  });
});
