import { describe, expect, it } from "vitest";

import {
  AIM_CONVERGENCE_FAR_METERS,
  aimAngles,
  aimConvergencePoint,
  angleBetweenDegrees,
  directionTo,
  type Vec3,
} from "./aimConvergence";

/**
 * The over-the-shoulder geometry, in numbers taken from the scene: the camera
 * sits 0.42 m to the archer's right and 0.22 m above the eye, and the nock is
 * roughly at the eye, 0.3 m to the *left* of the camera's line.
 */
const CAMERA: Vec3 = { x: 0.42, y: 1.82, z: 0 };
const NOCK: Vec3 = { x: 0.12, y: 1.55, z: -0.1 };
const FORWARD: Vec3 = { x: 0, y: 0, z: -1 };

describe("aimConvergence", () => {
  it("puts the shot through the point the crosshair is on", () => {
    const target = aimConvergencePoint(CAMERA, FORWARD, 18);
    const launch = directionTo(NOCK, target);
    // The launch line, extended to the target's range, arrives at the target.
    const range = Math.hypot(target.x - NOCK.x, target.y - NOCK.y, target.z - NOCK.z);
    const arrival = {
      x: NOCK.x + launch.x * range,
      y: NOCK.y + launch.y * range,
      z: NOCK.z + launch.z * range,
    };
    expect(arrival.x).toBeCloseTo(target.x, 6);
    expect(arrival.y).toBeCloseTo(target.y, 6);
    expect(arrival.z).toBeCloseTo(target.z, 6);
  });

  it("is the fix for a shot that ran parallel to the camera", () => {
    // What round 8 did: fire along the camera's own direction from the nock.
    const target = aimConvergencePoint(CAMERA, FORWARD, 18);
    const parallelMiss = Math.hypot(target.x - NOCK.x, target.y - NOCK.y);
    // Half a metre off at 18 m, low and left — the reported defect.
    expect(parallelMiss).toBeGreaterThan(0.35);
    const converged = directionTo(NOCK, target);
    expect(angleBetweenDegrees(converged, FORWARD)).toBeGreaterThan(0.5);
    // And the converged line is the one that hits: zero error at the crosshair.
    expect(angleBetweenDegrees(converged, directionTo(NOCK, target))).toBeCloseTo(0, 9);
  });

  it("takes a far point when the crosshair ray hits nothing", () => {
    const target = aimConvergencePoint(CAMERA, FORWARD, null);
    expect(target.z).toBeCloseTo(-AIM_CONVERGENCE_FAR_METERS, 6);
    // At that range the parallax is under a fifth of a degree.
    expect(angleBetweenDegrees(directionTo(NOCK, target), FORWARD)).toBeLessThan(0.2);
  });

  it("refuses to swing the bow onto something against the camera", () => {
    const target = aimConvergencePoint(CAMERA, FORWARD, 0.4);
    expect(target.z).toBeLessThan(-2.9);
  });

  it("reports yaw and pitch in the aim's own convention", () => {
    expect(aimAngles({ x: 0, y: 0, z: -1 }).yaw).toBeCloseTo(0, 9);
    expect(aimAngles({ x: -1, y: 0, z: 0 }).yaw).toBeCloseTo(Math.PI / 2, 9);
    expect(aimAngles({ x: 0, y: 1, z: 0 }).pitch).toBeCloseTo(Math.PI / 2, 9);
  });
});
