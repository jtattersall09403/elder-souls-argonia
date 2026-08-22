import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  HAND_GRIP_AXIS_LOCAL,
  LEFT_HAND_PALM_CENTER,
  RIGHT_HAND_PALM_CENTER,
  SWORD_BLADE_AXIS_LOCAL,
  SWORD_DOMINANT_GRIP_LOCAL,
  SWORD_GRIP_MAX_Y_LOCAL,
  SWORD_GRIP_MIN_Y_LOCAL,
  SWORD_SUPPORT_GRIP_LOCAL,
  SWORD_TWO_HAND_GRIP_SEPARATION,
  SWORD_VISUAL_SCALE,
  palmPointInWorld,
  swordFrameQuaternion,
  swordOriginFromGrip,
  swordPointInWorld,
  swordSocketPosition,
  swordSocketQuaternion,
  wristPoseFromSword,
} from "./weaponGrip";

const expectVectorClose = (actual: THREE.Vector3, expected: THREE.Vector3, precision = 6) => {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
};

describe("rig-calibrated sword grip", () => {
  it("keeps the measured palm centers mirrored only across hand-local X", () => {
    expect(RIGHT_HAND_PALM_CENTER.x).toBeCloseTo(-LEFT_HAND_PALM_CENTER.x, 6);
    expect(RIGHT_HAND_PALM_CENTER.y).toBeCloseTo(LEFT_HAND_PALM_CENTER.y, 6);
    expect(RIGHT_HAND_PALM_CENTER.z).toBeCloseTo(LEFT_HAND_PALM_CENTER.z, 6);
  });

  it("maps sword +Y onto the hand's index-to-pinky +Z grip axis", () => {
    const blade = new THREE.Vector3(
      SWORD_BLADE_AXIS_LOCAL.x,
      SWORD_BLADE_AXIS_LOCAL.y,
      SWORD_BLADE_AXIS_LOCAL.z,
    ).applyQuaternion(swordSocketQuaternion());
    expectVectorClose(blade, new THREE.Vector3(
      HAND_GRIP_AXIS_LOCAL.x,
      HAND_GRIP_AXIS_LOCAL.y,
      HAND_GRIP_AXIS_LOCAL.z,
    ));
    expect(swordSocketQuaternion().length()).toBeCloseTo(1, 7);
  });

  it("places the dominant grip center at either measured palm center", () => {
    for (const side of ["right", "left"] as const) {
      const pointInHand = new THREE.Vector3(
        SWORD_DOMINANT_GRIP_LOCAL.x,
        SWORD_DOMINANT_GRIP_LOCAL.y,
        SWORD_DOMINANT_GRIP_LOCAL.z,
      )
        .multiplyScalar(SWORD_VISUAL_SCALE)
        .applyQuaternion(swordSocketQuaternion())
        .add(swordSocketPosition(side));
      const expected = side === "right" ? RIGHT_HAND_PALM_CENTER : LEFT_HAND_PALM_CENTER;
      expectVectorClose(pointInHand, new THREE.Vector3(expected.x, expected.y, expected.z));
    }
    expectVectorClose(swordSocketPosition("right"), new THREE.Vector3(-0.0123, 0.0624, 0.0186));
  });

  it("keeps both hand markers inside the modeled grip on one rigid hilt", () => {
    expect(SWORD_DOMINANT_GRIP_LOCAL.y).toBeGreaterThanOrEqual(SWORD_GRIP_MIN_Y_LOCAL);
    expect(SWORD_DOMINANT_GRIP_LOCAL.y).toBeLessThanOrEqual(SWORD_GRIP_MAX_Y_LOCAL);
    expect(SWORD_SUPPORT_GRIP_LOCAL.y).toBeGreaterThanOrEqual(SWORD_GRIP_MIN_Y_LOCAL);
    expect(SWORD_SUPPORT_GRIP_LOCAL.y).toBeLessThanOrEqual(SWORD_GRIP_MAX_Y_LOCAL);
    expect(SWORD_TWO_HAND_GRIP_SEPARATION).toBeCloseTo(0.1296, 7);
  });

  it("round-trips an arbitrary sword pose through the wrist socket", () => {
    const wristPosition = new THREE.Vector3(1.2, 0.85, -2.1);
    const wristQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.31, -0.72, 0.18));
    const socketPosition = swordSocketPosition("right");
    const swordPosition = socketPosition.clone().applyQuaternion(wristQuaternion).add(wristPosition);
    const swordQuaternion = wristQuaternion.clone().multiply(swordSocketQuaternion());

    const recovered = wristPoseFromSword(swordPosition, swordQuaternion, "right");
    expectVectorClose(recovered.position, wristPosition);
    expect(Math.abs(recovered.quaternion.dot(wristQuaternion))).toBeCloseTo(1, 7);

    const palm = palmPointInWorld(recovered.position, recovered.quaternion, "right");
    const grip = swordPointInWorld(swordPosition, swordQuaternion, SWORD_DOMINANT_GRIP_LOCAL);
    expectVectorClose(palm, grip);
  });

  it("places both palms on their separate markers for one rigid sword pose", () => {
    const swordPosition = new THREE.Vector3(-0.06, 1.22, 0.18);
    const swordQuaternion = swordFrameQuaternion(
      swordPosition,
      new THREE.Vector3(-0.06, 2.41, 0.18),
      { x: 0, y: 0, z: 1 },
    );
    const rightWrist = wristPoseFromSword(
      swordPosition,
      swordQuaternion,
      "right",
      SWORD_DOMINANT_GRIP_LOCAL,
    );
    const leftWrist = wristPoseFromSword(
      swordPosition,
      swordQuaternion,
      "left",
      SWORD_SUPPORT_GRIP_LOCAL,
    );
    const rightPalm = palmPointInWorld(rightWrist.position, rightWrist.quaternion, "right");
    const leftPalm = palmPointInWorld(leftWrist.position, leftWrist.quaternion, "left");
    const dominantMarker = swordPointInWorld(swordPosition, swordQuaternion, SWORD_DOMINANT_GRIP_LOCAL);
    const supportMarker = swordPointInWorld(swordPosition, swordQuaternion, SWORD_SUPPORT_GRIP_LOCAL);

    expectVectorClose(rightPalm, dominantMarker);
    expectVectorClose(leftPalm, supportMarker);
    expect(rightPalm.distanceTo(leftPalm)).toBeCloseTo(SWORD_TWO_HAND_GRIP_SEPARATION, 7);
  });

  it("converts a grip-center path target into a sword-origin target", () => {
    const grip = new THREE.Vector3(-0.06, 1.2, 0.22);
    const swordQuaternion = swordFrameQuaternion(grip, new THREE.Vector3(-0.06, 2.39, 0.22), { x: 0, y: 0, z: 1 });
    const origin = swordOriginFromGrip(grip, swordQuaternion);
    expectVectorClose(swordPointInWorld(origin, swordQuaternion, SWORD_DOMINANT_GRIP_LOCAL), grip);
  });

  it("builds a full, stable sword frame rather than only aligning one axis", () => {
    const quaternion = swordFrameQuaternion(
      { x: 0, y: 0, z: 0 },
      { x: 0.4, y: 1, z: 0.2 },
      { x: 0, y: 0, z: 1 },
    );
    const expectedBlade = new THREE.Vector3(0.4, 1, 0.2).normalize();
    const blade = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const roll = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    expectVectorClose(blade, expectedBlade);
    expect(roll.dot(expectedBlade)).toBeCloseTo(0, 7);
    expect(roll.z).toBeGreaterThan(0);

    const parallelGuide = swordFrameQuaternion(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 2, z: 0 },
    );
    expect([...parallelGuide.toArray()].every(Number.isFinite)).toBe(true);
    expect(() => swordFrameQuaternion(
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 0, y: 0, z: 1 },
    )).toThrow(RangeError);
  });
});
