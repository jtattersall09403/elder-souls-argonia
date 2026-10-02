import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createOcclusionCadence, hiddenBehindTerrain, topCornersOfBox } from "./terrainOcclusion";

/** A synthetic ridge 200 m high between x = 300 and x = 320, flat elsewhere. */
const ridge = (x: number): number => (x > 300 && x < 320 ? 200 : 0);
const eye = { x: 0, y: 10, z: 0 };

describe("hiddenBehindTerrain", () => {
  it("hides a low corner beyond the ridge", () => {
    expect(hiddenBehindTerrain(eye, [{ x: 600, y: 0, z: 0 }], (x) => ridge(x))).toBe(true);
  });

  it("keeps a corner that stands above the line of sight", () => {
    expect(hiddenBehindTerrain(eye, [{ x: 600, y: 400, z: 0 }], (x) => ridge(x))).toBe(false);
  });

  it("keeps a mixed corner set: every corner must be hidden", () => {
    const corners = [{ x: 600, y: 0, z: 0 }, { x: 600, y: 400, z: 0 }];
    expect(hiddenBehindTerrain(eye, corners, (x) => ridge(x))).toBe(false);
  });

  it("sees everything from an eye above the ridge", () => {
    expect(hiddenBehindTerrain({ x: 0, y: 500, z: 0 }, [{ x: 600, y: 0, z: 0 }], (x) => ridge(x)))
      .toBe(false);
  });

  it("never blocks on missing data", () => {
    expect(hiddenBehindTerrain(eye, [{ x: 600, y: 0, z: 0 }], () => NaN)).toBe(false);
    expect(hiddenBehindTerrain(eye, [{ x: 600, y: 0, z: 0 }], () => -Infinity)).toBe(false);
  });

  it("keeps a unit closer than the skipped near band", () => {
    expect(hiddenBehindTerrain(eye, [{ x: 80, y: 0, z: 0 }], () => 500)).toBe(false);
  });

  it("gives five top points for a box", () => {
    const points = topCornersOfBox(new THREE.Box3(
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 20, 30)));
    expect(points).toHaveLength(5);
    expect(points.every((p) => p.y === 20)).toBe(true);
    expect(points[4]).toEqual({ x: 5, y: 20, z: 15 });
  });
});

describe("createOcclusionCadence", () => {
  it("fires first, then only on time or movement, never on a turn", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld();
    const due = createOcclusionCadence();
    expect(due(camera, 0)).toBe(true);
    expect(due(camera, 100)).toBe(false);
    camera.rotation.y = Math.PI / 2;
    camera.updateMatrixWorld();
    expect(due(camera, 200)).toBe(false);
    expect(due(camera, 2100)).toBe(true);
    camera.position.set(0, 0, 20);
    expect(due(camera, 2110)).toBe(true);
    expect(due(camera, 2120)).toBe(false);
  });
});

describe("march cost (perf10)", () => {
  it("marches a 6 km line in at most 130 samples and still finds a 150 m ridge at 3 km", () => {
    let calls = 0;
    const heightAt = (x: number) => { calls++; return x > 2950 && x < 3100 ? 200 : 0; };
    expect(hiddenBehindTerrain({ x: 0, y: 2, z: 0 }, [{ x: 6000, y: 10, z: 0 }], heightAt)).toBe(true);
    calls = 0;
    // An unblocked corner marches the whole line: the fixed 15 m step took 394 samples.
    expect(hiddenBehindTerrain({ x: 0, y: 2, z: 0 }, [{ x: 6000, y: 10, z: 0 }], () => { calls++; return 0; })).toBe(false);
    expect(calls).toBeLessThanOrEqual(130);
  });
});
