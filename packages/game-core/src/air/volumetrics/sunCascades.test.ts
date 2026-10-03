import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cascadeLit, pickCascade, shadowCoord, shadowTexel } from "./sunCascades";

/** A sun cascade as three r184 builds it on WebGPU: ortho 40 m box, sun straight down from y = 100,
 * LightShadow.updateMatrices' identity-Z bias times projection times view. */
function cascadeMatrix(): THREE.Matrix4 {
  const cam = new THREE.OrthographicCamera(-20, 20, 20, -20, 1, 200);
  cam.coordinateSystem = THREE.WebGPUCoordinateSystem;
  cam.position.set(0, 100, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
  return bias.multiply(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
}

describe("sun cascades in the inject kernel (CPU twin)", () => {
  it("picks the cascade by view depth, -1 past the last", () => {
    const ends = [12, 40, 120, 0];
    expect(pickCascade(5, ends, 3)).toBe(0);
    expect(pickCascade(12, ends, 3)).toBe(0);
    expect(pickCascade(30, ends, 3)).toBe(1);
    expect(pickCascade(119, ends, 3)).toBe(2);
    expect(pickCascade(121, ends, 3)).toBe(-1);
    expect(pickCascade(5, ends, 0)).toBe(-1);
  });

  it("maps world to texel rows with y flipped and depth in [0,1]", () => {
    const m = cascadeMatrix().elements;
    const c = shadowCoord(m, 0, 50, 0);
    expect(c.u).toBeCloseTo(0.5, 6);
    expect(c.v).toBeCloseTo(0.5, 6);
    expect(c.d).toBeGreaterThan(0);
    expect(c.d).toBeLessThan(1);
    expect(shadowTexel(c.u, c.v, 1024, 1024)).toEqual([512, 512]);
    expect(shadowTexel(1, 1, 1024, 1024)).toEqual([1023, 1023]);
  });

  it("a froxel under a crown is shadowed, one beside it is lit, one outside the map falls back", () => {
    const m = cascadeMatrix().elements;
    // a crown slab at y 10 over x < 0 (the rest of the map holds the ground at y 0)
    const crown = shadowCoord(m, -5, 10, 0).d, ground = shadowCoord(m, 5, 0, 0).d;
    const depthAt = (i: number) => (i < 512 ? crown : ground);
    expect(cascadeLit(m, 1024, 1024, depthAt, -5, 2, 0)).toBe(0);
    expect(cascadeLit(m, 1024, 1024, depthAt, 5, 2, 0)).toBe(1);
    expect(cascadeLit(m, 1024, 1024, depthAt, -5, 15, 0)).toBe(1);
    expect(cascadeLit(m, 1024, 1024, depthAt, 30, 2, 0)).toBeNull();
  });
});
