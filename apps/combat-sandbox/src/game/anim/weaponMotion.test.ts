import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  SWORD_DOMINANT_GRIP_LOCAL,
  SWORD_SUPPORT_GRIP_LOCAL,
  swordFrameQuaternion,
  swordOriginFromGrip,
  wristPoseFromSword,
} from "./weaponGrip";
import {
  EXECUTION_ANCHOR_DISTANCE,
  EXECUTION_DAMAGE_PROGRESS,
  bladeCenter,
  executionAnchor,
  executionBladeIntersectsVictim,
  executionFacingYaw,
  executionWeaponPath,
  guardWeaponPath,
  parryWeaponPath,
} from "./weaponMotion";
import { SWORD_TWO_HAND_GRIP_SEPARATION } from "./weaponGrip";

describe("paired weapon motion", () => {
  it("anchors a backstab behind and a riposte in front of the victim", () => {
    const enemy = { x: 2, z: 4 };
    const forward = { x: 0, z: 1 };
    expect(executionAnchor(enemy, forward, "backstab")).toEqual({ x: 2, z: 4 - EXECUTION_ANCHOR_DISTANCE });
    expect(executionAnchor(enemy, forward, "riposte")).toEqual({ x: 2, z: 4 + EXECUTION_ANCHOR_DISTANCE });
    expect(executionFacingYaw(0.4, "backstab")).toBeCloseTo(0.4);
    expect(executionFacingYaw(0.4, "riposte")).toBeCloseTo(0.4 + Math.PI);
  });

  it("drives the blade through the torso and then withdraws it", () => {
    const before = executionWeaponPath(0);
    const impact = executionWeaponPath(EXECUTION_DAMAGE_PROGRESS);
    const withdrawn = executionWeaponPath(0.8);
    expect(impact.tip.z).toBeGreaterThan(1.35);
    expect(impact.grip.z).toBeGreaterThan(before.grip.z);
    expect(withdrawn.tip.z).toBeLessThan(impact.tip.z);
    expect(executionBladeIntersectsVictim(0)).toBe(false);
    expect(executionBladeIntersectsVictim(EXECUTION_DAMAGE_PROGRESS)).toBe(true);
    expect(executionBladeIntersectsVictim(0.8)).toBe(false);
  });

  it("keeps the complete parry arc in front of either fighter", () => {
    const rightShoulder = { x: -0.064, y: 1.286, z: -0.241 };
    const safeReach = 0.547 * 0.92;
    for (let step = 0; step <= 20; step += 1) {
      const path = parryWeaponPath(step / 20);
      expect(path.grip.z).toBeGreaterThanOrEqual(0.16);
      expect(path.tip.z).toBeGreaterThanOrEqual(0.16);
      expect(bladeCenter(path).z).toBeGreaterThan(0.16);
      expect(path.grip.x).toBeLessThan(0);
      const swordQuaternion = swordFrameQuaternion(path.grip, path.tip, { x: 0, y: 0, z: 1 });
      const swordOrigin = swordOriginFromGrip(path.grip, swordQuaternion);
      const wrist = wristPoseFromSword(swordOrigin, swordQuaternion, "right", SWORD_DOMINANT_GRIP_LOCAL);
      expect(wrist.position.distanceTo(new THREE.Vector3(rightShoulder.x, rightShoulder.y, rightShoulder.z))).toBeLessThan(safeReach);
    }
  });

  it("holds guard below the shoulders with a vertical two-handed hilt", () => {
    const path = guardWeaponPath();
    const rightShoulder = { x: -0.212, y: 1.409, z: -0.156 };
    const leftShoulder = { x: 0.164, y: 1.415, z: -0.055 };
    const safeReach = 0.547 * 0.92;
    expect(path.grip.y).toBeLessThan(1.441);
    expect(path.offHand.y).toBeLessThan(path.grip.y);
    expect(path.grip.y - path.offHand.y).toBeCloseTo(SWORD_TWO_HAND_GRIP_SEPARATION);
    expect(path.offHand.x).toBe(path.grip.x);
    expect(path.offHand.z).toBe(path.grip.z);
    expect(path.tip.x).toBe(path.grip.x);
    expect(path.tip.z).toBe(path.grip.z);
    expect(path.tip.y - path.grip.y).toBeCloseTo(1.19);
    const swordQuaternion = swordFrameQuaternion(path.grip, path.tip, { x: 0, y: 0, z: 1 });
    const swordOrigin = swordOriginFromGrip(path.grip, swordQuaternion);
    const rightWrist = wristPoseFromSword(swordOrigin, swordQuaternion, "right", SWORD_DOMINANT_GRIP_LOCAL);
    const leftWrist = wristPoseFromSword(swordOrigin, swordQuaternion, "left", SWORD_SUPPORT_GRIP_LOCAL);
    expect(rightWrist.position.distanceTo(new THREE.Vector3(rightShoulder.x, rightShoulder.y, rightShoulder.z))).toBeLessThan(safeReach);
    expect(leftWrist.position.distanceTo(new THREE.Vector3(leftShoulder.x, leftShoulder.y, leftShoulder.z))).toBeLessThan(safeReach);
  });
});
