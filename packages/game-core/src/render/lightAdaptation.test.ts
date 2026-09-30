import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CSM } from "three/examples/jsm/csm/CSM.js";
import { adaptExposure, stepShadowSun } from "./lightAdaptation";

function settleSeconds(from: number, to: number, fps: number): number {
  let e = from;
  for (let f = 1; f < fps * 60; f++) {
    e = adaptExposure(e, to, 1 / fps);
    if (Math.abs(e / to - 1) < 0.1) return f / fps;
  }
  return Infinity;
}

describe("adaptExposure", () => {
  // The clock rate never enters: the same real seconds at rate 1 and rate 30.
  for (const rate of [1, 30]) {
    it(`interior (1) to noon (1e-4) within 10% in under 3 s, rate ${rate}`, () => {
      const t = settleSeconds(1, 1e-4, 60);
      expect(t).toBeLessThan(3);
      expect(t).toBeGreaterThan(1);
      expect(settleSeconds(1e-4, 1, 30)).toBeLessThan(3);
    });
  }
  it("recovers from a non-finite current value", () => {
    expect(adaptExposure(Number.NaN, 0.5, 0.016)).toBe(0.5);
  });
});

describe("shadow sun", () => {
  it("holds the direction under sub-step motion, steps past it", () => {
    const applied = { x: 0, y: 0, z: 0 };
    expect(stepShadowSun(applied, { x: 0, y: 1, z: 0 })).toBe(true);
    const tiny = (0.05 * Math.PI) / 180;
    expect(stepShadowSun(applied, { x: Math.sin(tiny), y: Math.cos(tiny), z: 0 })).toBe(false);
    const big = (0.1 * Math.PI) / 180;
    expect(stepShadowSun(applied, { x: Math.sin(big), y: Math.cos(big), z: 0 })).toBe(true);
  });

  it("sub-texel camera moves leave the cascade's texel grid unchanged", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    const csm = new CSM({ camera, parent: scene, cascades: 1, maxFar: 120, shadowMapSize: 2048, lightMargin: 400, mode: "practical" });
    csm.fade = true;
    const applied = { x: 0, y: 0, z: 0 };
    const uvOf = (p: THREE.Vector3) => {
      const light = csm.lights[0];
      light.updateMatrixWorld(); light.target.updateMatrixWorld();
      light.shadow.updateMatrices(light);
      return p.clone().applyMatrix4(light.shadow.matrix);
    };
    const probe = new THREE.Vector3(3, 0, -10);
    const shadowUv = (camX: number, sunWobbleDeg: number) => {
      camera.position.set(camX, 2, 0);
      camera.updateMatrixWorld();
      const a = THREE.MathUtils.degToRad(40 + sunWobbleDeg);
      stepShadowSun(applied, { x: Math.cos(a) * 0.3, y: Math.sin(a), z: Math.cos(a) * 0.9 });
      csm.lightDirection.set(applied.x, applied.y, applied.z).negate();
      csm.update();
      return uvOf(probe);
    };
    const base = shadowUv(0, 0);
    const texel = 1 / 2048;
    for (const [dx, wob] of [[0.001, 0.01], [0.002, 0.03], [0.0005, 0.02]]) {
      const uv = shadowUv(dx, wob);
      // The world point lands on the same texel position (to float noise):
      // the grid did not slide or rotate.
      // A whole-texel slide of the window is fine; a fractional one crawls.
      for (const d of [(uv.x - base.x) / texel, (uv.y - base.y) / texel]) {
        expect(Math.abs(d - Math.round(d))).toBeLessThan(1e-2);
      }
    }
    csm.dispose();
  });
});
