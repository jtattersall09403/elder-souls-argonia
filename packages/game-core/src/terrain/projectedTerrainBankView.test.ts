import { describe, expect, it } from 'vitest';
import { Box3, OrthographicCamera, PerspectiveCamera, Vector3, WebGPUCoordinateSystem, type Camera } from 'three';
import { projectedTerrainBankView } from './projectedTerrainBankView';

function random() {
  let seed = 0x3943;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
}
function measured(point: Vector3, camera: Camera, dy: number, width: number, height: number) {
  const from = point.clone().project(camera), to = point.clone().add(new Vector3(0, dy, 0)).project(camera);
  return Math.hypot((to.x - from.x) * width * 0.5, (to.y - from.y) * height * 0.5);
}

describe('conservative homogeneous bank-error projection', () => {
  it('does not underestimate a far-off-axis feature using Euclidean camera distance', () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 10000); camera.updateMatrixWorld();
    const point = new Vector3(900, 0, -100);
    const box = new Box3(new Vector3(899, -1, -101), new Vector3(901, 1, -99));
    const view = projectedTerrainBankView(box, camera, 1000, 1000, 1, 1);
    const actual = measured(point, camera, 1, 1000, 1000);
    const naive = 500 * camera.projectionMatrix.elements[5] / point.length();
    expect(actual).toBeGreaterThan(naive * 8);
    expect(actual).toBeLessThanOrEqual(view.pixelsPerRadian / view.distanceM);
  });

  it('bounds corners and deterministic interior samples for rolled, downward and off-axis perspective views', () => {
    const rng = random();
    for (let scenario = 0; scenario < 24; scenario++) {
      const camera = new PerspectiveCamera(35 + rng() * 60, 0.7 + rng() * 2, 0.1, 100000);
      camera.position.set(-400 + rng() * 800, 350 + rng() * 1000, 500 + rng() * 1000);
      camera.lookAt(0, 0, 0); camera.rotateZ(-Math.PI + rng() * 2 * Math.PI); camera.updateMatrixWorld();
      const scale = [1, 2, 5][scenario % 3], width = 960 * (scenario % 2 + 1), height = 540 * (scenario % 2 + 1);
      const box = new Box3(new Vector3(-250, -10 * scale, -250), new Vector3(300, 40 * scale, 150));
      const maximum = 1.1, view = projectedTerrainBankView(box, camera, width, height, maximum, scale);
      expect(view.distanceM).toBeGreaterThan(0);
      for (let sample = 0; sample < 72; sample++) {
        const x = sample < 8 ? (sample & 1) : rng(), y = sample < 8 ? ((sample >> 1) & 1) : rng(), z = sample < 8 ? ((sample >> 2) & 1) : rng();
        const point = new Vector3(box.min.x + x * (box.max.x - box.min.x), box.min.y + y * (box.max.y - box.min.y), box.min.z + z * (box.max.z - box.min.z));
        const errorM = maximum * (0.1 + rng() * 0.9);
        const displacement = errorM * scale + view.scaledHeightRoundoffM;
        const bound = displacement * view.pixelsPerRadian / view.distanceM;
        for (const sign of [-1, 1]) expect(measured(point, camera, sign * displacement, width, height)).toBeLessThanOrEqual(bound + 1e-8);
      }
    }
  });

  it('handles orthographic projection and drawing-buffer pixel density without Euclidean distance', () => {
    const camera = new OrthographicCamera(-100, 100, 60, -60, 0.1, 5000);
    camera.position.set(200, 400, 600); camera.lookAt(0, 0, 0); camera.rotateZ(0.7); camera.updateMatrixWorld();
    const box = new Box3(new Vector3(-10, -20, -10), new Vector3(10, 20, 10));
    const view = projectedTerrainBankView(box, camera, 1600, 900, 1, 5);
    const highDpi = projectedTerrainBankView(box, camera, 3200, 1800, 1, 5);
    expect(view.distanceM).toBe(1);
    expect(highDpi.pixelsPerRadian).toBe(view.pixelsPerRadian * 2);
    const dy = 5 + view.scaledHeightRoundoffM;
    expect(measured(new Vector3(), camera, dy, 1600, 900)).toBeCloseTo(dy * view.pixelsPerRadian, 8);
  });

  it('rejects behind-camera, near-plane and perturbation-crossing cases in both clip conventions', () => {
    for (const gpu of [false, true]) {
      const camera = new PerspectiveCamera(60, 1, 1, 100);
      if (gpu) { camera.coordinateSystem = WebGPUCoordinateSystem; camera.updateProjectionMatrix(); }
      camera.updateMatrixWorld();
      for (const box of [new Box3(new Vector3(-1, -1, 1), new Vector3(1, 1, 2)),
        new Box3(new Vector3(-1, -1, -2), new Vector3(1, 1, -0.5))]) {
        expect(projectedTerrainBankView(box, camera, 1000, 1000, 1, 1).distanceM).toBe(0);
      }
      camera.lookAt(0, -1, -1); camera.updateMatrixWorld();
      const near = new Box3(new Vector3(-0.01, -1, -1), new Vector3(0.01, -0.99, -0.99));
      expect(projectedTerrainBankView(near, camera, 1000, 1000, 0.1, 1).distanceM).toBeGreaterThan(0);
      expect(projectedTerrainBankView(near, camera, 1000, 1000, 1, 1).distanceM).toBe(0);
    }
  });

  it('includes displayed-height Float32 roundoff in the common finite-displacement bound', () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 1000000);
    camera.position.set(0, 50000, 50000); camera.lookAt(0, 30000, 0); camera.updateMatrixWorld();
    const box = new Box3(new Vector3(-100, 30000, -100), new Vector3(100, 33000, 100));
    const view = projectedTerrainBankView(box, camera, 1920, 1080, 0.5, 5);
    expect(view.scaledHeightRoundoffM).toBe(2 ** -8);
    const delta = 2.5 + view.scaledHeightRoundoffM;
    expect(measured(box.max, camera, delta, 1920, 1080)).toBeLessThanOrEqual(delta * view.pixelsPerRadian / view.distanceM);
  });

  it('rejects the reversed-depth near plane and invalid numeric inputs', () => {
    const camera = new PerspectiveCamera(60, 1, 1, 100);
    Object.defineProperty(camera, 'reversedDepth', { value: true });
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const safe = new Box3(new Vector3(-0.1, -0.1, -3), new Vector3(0.1, 0.1, -2));
    const near = new Box3(new Vector3(-0.1, -0.1, -2), new Vector3(0.1, 0.1, -0.5));
    expect(projectedTerrainBankView(safe, camera, 1000, 1000, 1, 1).distanceM).toBeGreaterThan(0);
    expect(projectedTerrainBankView(near, camera, 1000, 1000, 1, 1).distanceM).toBe(0);
    expect(projectedTerrainBankView(safe, camera, NaN, 1000, 1, 1).distanceM).toBe(0);
    expect(projectedTerrainBankView(safe, camera, 1000, 1000, Infinity, 1).distanceM).toBe(0);
  });
});
