import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CELL_SUN_GAIN, CELL_SUN_MAX_ELEVATION_RAD, clampCellSunElevation } from "./interiorLoader";

describe("cell sun (vol10 diag6 P1/P2)", () => {
  it("clamps a 68 deg sun to 45 deg, keeping its bearing", () => {
    const a = THREE.MathUtils.degToRad(68);
    const v = clampCellSunElevation(new THREE.Vector3(Math.cos(a) * 0.6, Math.sin(a), Math.cos(a) * 0.8));
    expect(Math.asin(v.y)).toBeCloseTo(CELL_SUN_MAX_ELEVATION_RAD, 6);
    expect(v.length()).toBeCloseTo(1, 6);
    expect(v.z / v.x).toBeCloseTo(0.8 / 0.6, 6);
  });
  it("leaves a sun at or below 45 deg alone", () => {
    const a = THREE.MathUtils.degToRad(30);
    const v = clampCellSunElevation(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    expect(v.y).toBeCloseTo(Math.sin(a), 6);
  });
  it("gain puts the patch >= 5x the ambient floor at the r5 ratio", () => {
    expect(1 + 0.9 * CELL_SUN_GAIN).toBeGreaterThanOrEqual(5);
  });
});
