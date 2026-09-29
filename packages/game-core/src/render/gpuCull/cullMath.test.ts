import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { lodCopyCollapsed, lodFadeFactorsOver } from "../../fx/lodFade";
import {
  DRAW_CASTS, DRAW_FROM_ZERO, RangeAllocator, bandKeeps, candidateKept, indirectArgs,
  sphereSweptInFrustum, unionBand, sunSweepOf, LOD_OPEN_M, LOD_FADE_SAMPLES,
} from "./cullMath";

const planesOf = (camera: THREE.PerspectiveCamera): Float32Array => {
  camera.updateMatrixWorld();
  const f = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const out = new Float32Array(24);
  f.planes.forEach((p, i) => out.set([p.normal.x, p.normal.y, p.normal.z, p.constant], i * 4));
  return out;
};

describe("gpuCull cullMath", () => {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 3000);
  camera.position.set(0, 3, 0);
  camera.lookAt(0, 3, -100);
  const planes = planesOf(camera);
  const zeros = new Float32Array(16);

  it("keeps a sphere ahead and drops one behind", () => {
    expect(sphereSweptInFrustum(planes, 0, 3, -50, 1, null)).toBe(true);
    expect(sphereSweptInFrustum(planes, 0, 3, 50, 1, null)).toBe(false);
  });

  it("keeps a caster behind the camera whose shadow sweeps into view", () => {
    // Sun travelling towards -z, long shadows: a tall tree 5 m behind casts forward.
    const sweep = { x: 0, z: -1, perM: 3 };
    expect(sphereSweptInFrustum(planes, 0, 5, 5, 5, null)).toBe(false);
    expect(sphereSweptInFrustum(planes, 0, 5, 5, 5, sweep)).toBe(true);
  });

  it("band test is a superset of the shader's collapse rule", () => {
    const band: [number, number, number, number] = [30, 60, 0, 0];
    for (let d = 0; d < 100; d += 0.5) {
      const shaderKeeps = !lodCopyCollapsed(lodFadeFactorsOver(band, [d]));
      if (shaderKeeps) expect(bandKeeps(band, 0, -d, 0, 0, zeros, false)).toBe(true);
    }
    expect(bandKeeps(band, 0, -10, 0, 0, zeros, false)).toBe(false);
    expect(bandKeeps(band, 0, -10, 0, 0, zeros, true)).toBe(true); // from-zero caster
    expect(bandKeeps(band, 0, -80, 0, 0, zeros, true)).toBe(false);
  });

  it("a copy mid cross-fade lands in both rungs", () => {
    // Camera moved from 29 m to 31 m of the copy over the history: both sides live.
    const hist = new Float32Array(16);
    for (let k = 0; k < 8; k++) hist[k * 2 + 1] = -(k / 7) * 2; // older samples nearer, down to 29 m
    const near: [number, number, number, number] = [0, 30, 0, 0];
    const mid: [number, number, number, number] = [30, 60, 0, 0];
    expect(bandKeeps(near, 0, -31, 0, 0, hist, false)).toBe(true);
    expect(bandKeeps(mid, 0, -31, 0, 0, hist, false)).toBe(true);
  });

  it("candidateKept combines frustum and band", () => {
    const m = new THREE.Matrix4().makeTranslation(0, 0, -40).elements;
    const draw = { radius: 2, centreY: 1, flags: DRAW_CASTS | DRAW_FROM_ZERO, band: [50, 90, 0, 0] as const };
    expect(candidateKept(planes, m, draw, 0, 0, zeros, null)).toBe(true);
    expect(candidateKept(planes, m, { ...draw, flags: 0 }, 0, 0, zeros, null)).toBe(false);
  });

  it("indirect args and the row allocator", () => {
    expect(indirectArgs(true, 36, 0, 100)).toEqual([36, 0, 0, 0, 100]);
    expect(indirectArgs(false, 36, 0, 100)).toEqual([36, 0, 0, 100, 0]);
    const a = new RangeAllocator(100);
    const x = a.alloc(40);
    const y = a.alloc(40);
    expect([x, y, a.alloc(40)]).toEqual([0, 40, -1]);
    a.release(x, 40);
    a.release(y, 40);
    expect(a.available).toBe(100);
    expect(a.alloc(100)).toBe(0);
  });
});

describe("unionBand / sunSweepOf (lane L9b)", () => {
  it("keeps the nearest inner edge, the farthest or open outer edge, the widest ramps", () => {
    expect(unionBand(null, [10, 50, 2, 4])).toEqual([10, 50, 2, 4]);
    expect(unionBand([10, 50, 2, 4], [40, 120, 6, 3])).toEqual([10, 120, 6, 4]);
    expect(unionBand([10, 50, 2, 4], [0, LOD_OPEN_M, 0, 0])).toEqual([0, 0, 2, 4]);
  });
  it("a copy either band keeps, the union keeps", () => {
    const a: [number, number, number, number] = [20, 60, 4, 6];
    const b: [number, number, number, number] = [60, 110, 6, 10];
    const u = unionBand(a, b);
    const hist = new Float32Array(LOD_FADE_SAMPLES * 2);
    for (let d = 0; d < 140; d += 0.5) {
      if (bandKeeps(a, d, 0, 0, 0, hist, false) || bandKeeps(b, d, 0, 0, 0, hist, false)) {
        expect(bandKeeps(u, d, 0, 0, 0, hist, false)).toBe(true);
      }
    }
  });
  it("sweeps away from the sun, null below the horizon", () => {
    const s = sunSweepOf(3, 4, 0)!;
    expect(s.x).toBeCloseTo(-1);
    expect(s.z).toBeCloseTo(0);
    expect(s.perM).toBeCloseTo(0.75);
    expect(sunSweepOf(1, -1, 0)).toBeNull();
    expect(sunSweepOf(0, 1, 0)).toEqual({ x: 0, z: 0, perM: 0 });
  });
});
