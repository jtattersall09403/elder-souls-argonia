import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  INTERIOR_EXPOSURE_MAX, InteriorEnvironment, interiorAmbientMean, interiorExposure,
} from "./interiorEnvironment";
import { INTERIOR_AMBIENT_SCALE, type LoadedInterior } from "./interiorLoader";
import type { InteriorBundle } from "./bundle";

const cubeOf = (v: number) => {
  const c: [number, number, number] = [v, v, v];
  return { px: c, nx: c, py: c, ny: c, pz: c, nz: c };
};
const bundleAt = (mean: number) => ({
  ambient: { colorRGB: [255, 255, 255], intensity: 1 },
  lighting: { ambientCube: cubeOf(mean / INTERIOR_AMBIENT_SCALE) },
}) as unknown as InteriorBundle;

describe("interior auto-exposure (perf10 c12 A)", () => {
  it("a vanilla-dark hut (mean 0.04) is drawn at 4, a bright cell (0.5) at 1, and the clamp holds", () => {
    expect(interiorAmbientMean(bundleAt(0.04))).toBeCloseTo(0.04, 6);
    expect(interiorExposure(0.04)).toBeCloseTo(4, 6);
    expect(interiorExposure(0.5)).toBe(1);
    expect(interiorExposure(0.001)).toBe(INTERIOR_EXPOSURE_MAX);
    expect(interiorExposure(0)).toBe(INTERIOR_EXPOSURE_MAX);
  });

  it("eases from the outside exposure to the cell's over ~0.5 s and restores the outside value", () => {
    const clear = { color: new THREE.Color(), alpha: 0 };
    const gl = {
      toneMappingExposure: 22,
      getClearColor: (t: THREE.Color) => t.copy(clear.color),
      getClearAlpha: () => clear.alpha,
      setClearColor: (c: THREE.Color, a = 1) => { clear.color.copy(c); clear.alpha = a; },
    };
    const cell = {
      bundle: bundleAt(0.04), group: new THREE.Group(), fog: new THREE.Fog(0, 1, 2), background: new THREE.Color(),
    } as unknown as LoadedInterior;
    const inside = new InteriorEnvironment(new THREE.Scene(), gl, cell);
    expect(gl.toneMappingExposure).toBe(INTERIOR_EXPOSURE_MAX); // 22 clamped: no pop past the max
    inside.frame(0.1);
    expect(gl.toneMappingExposure).toBeGreaterThan(4);
    expect(gl.toneMappingExposure).toBeLessThan(INTERIOR_EXPOSURE_MAX);
    for (let i = 0; i < 4; i++) inside.frame(0.1);
    expect(gl.toneMappingExposure).toBeLessThan(4.15); // 0.5 s: within 5 % of the step
    inside.restore();
    expect(gl.toneMappingExposure).toBe(22);
  });
});
