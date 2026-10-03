import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { aspectFor, matrixFinite, updateProjection } from "./cameraAspect";

describe("camera aspect owner", () => {
  it("never yields aspect 0 for a 0-size or unsized canvas", () => {
    expect(aspectFor(0, 0, 0)).toBe(1);
    expect(aspectFor(0, 720, 0)).toBe(1);
    expect(aspectFor(1280, 0, 1.5)).toBe(1.5);
    expect(aspectFor(1280, 720, 0)).toBeCloseTo(16 / 9);
  });
  it("turns R3F's PerspectiveCamera(75, 0) into a finite projection", () => {
    const cam = new THREE.PerspectiveCamera(75, 0, 0.3, 60000);
    cam.updateProjectionMatrix();
    expect(matrixFinite(cam.projectionMatrix)).toBe(false);
    updateProjection(cam, 0, 0);
    expect(matrixFinite(cam.projectionMatrix)).toBe(true);
    expect(matrixFinite(cam.projectionMatrixInverse)).toBe(true);
    updateProjection(cam, 1600, 900);
    expect(cam.aspect).toBeCloseTo(16 / 9);
    updateProjection(cam, 0, 900);
    expect(cam.aspect).toBeCloseTo(16 / 9);
  });
});
