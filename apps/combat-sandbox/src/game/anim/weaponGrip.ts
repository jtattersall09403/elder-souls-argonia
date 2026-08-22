import * as THREE from "three";

export type GripSide = "right" | "left";
export type Point3 = Readonly<{ x: number; y: number; z: number }>;
export type WristPose = { position: THREE.Vector3; quaternion: THREE.Quaternion };

// Centers of the vertices whose weight for the corresponding hand bone is at
// least 0.5, expressed in DEF-hand.R/L local space.
export const RIGHT_HAND_PALM_CENTER: Point3 = Object.freeze({ x: -0.0123, y: 0.0624, z: -0.003 });
export const LEFT_HAND_PALM_CENTER: Point3 = Object.freeze({ x: 0.0123, y: 0.0624, z: -0.003 });

// Geometry authored by makeSword. These values are in unscaled sword-local
// space; the sword group applies SWORD_VISUAL_SCALE.
export const SWORD_VISUAL_SCALE = 1.08;
export const SWORD_GRIP_CENTER_LOCAL: Point3 = Object.freeze({ x: 0, y: -0.08, z: 0 });
export const SWORD_GRIP_HALF_LENGTH_LOCAL = 0.14;
export const SWORD_GRIP_MIN_Y_LOCAL = SWORD_GRIP_CENTER_LOCAL.y - SWORD_GRIP_HALF_LENGTH_LOCAL;
export const SWORD_GRIP_MAX_Y_LOCAL = SWORD_GRIP_CENTER_LOCAL.y + SWORD_GRIP_HALF_LENGTH_LOCAL;

// The dominant palm sits near the guard and the support palm sits lower on the
// same rigid hilt. Their scaled separation is 0.1296 m.
export const SWORD_DOMINANT_GRIP_LOCAL: Point3 = Object.freeze({ x: 0, y: -0.02, z: 0 });
export const SWORD_SUPPORT_GRIP_LOCAL: Point3 = Object.freeze({ x: 0, y: -0.14, z: 0 });
export const SWORD_TWO_HAND_GRIP_SEPARATION =
  (SWORD_DOMINANT_GRIP_LOCAL.y - SWORD_SUPPORT_GRIP_LOCAL.y) * SWORD_VISUAL_SCALE;

export const SWORD_BLADE_AXIS_LOCAL: Point3 = Object.freeze({ x: 0, y: 1, z: 0 });
export const HAND_GRIP_AXIS_LOCAL: Point3 = Object.freeze({ x: 0, y: 0, z: 1 });

// Rotates sword-local coordinates into hand-local coordinates. RotX(+90deg)
// maps the sword/hilt +Y axis onto the index-to-pinky grip axis (+Z) of both
// mirrored hands in AnimationLibrary.glb.
export const SWORD_LOCAL_TO_HAND_LOCAL_QUATERNION = Object.freeze({
  x: Math.SQRT1_2,
  y: 0,
  z: 0,
  w: Math.SQRT1_2,
});

const setVector = (target: THREE.Vector3, point: Point3) => target.set(point.x, point.y, point.z);

export function palmCenter(side: GripSide, target = new THREE.Vector3()) {
  return setVector(target, side === "right" ? RIGHT_HAND_PALM_CENTER : LEFT_HAND_PALM_CENTER);
}

export function swordSocketQuaternion(target = new THREE.Quaternion()) {
  const rotation = SWORD_LOCAL_TO_HAND_LOCAL_QUATERNION;
  return target.set(rotation.x, rotation.y, rotation.z, rotation.w);
}

/** Position of the sword origin in hand-local space for a palm-centered grip. */
export function swordSocketPosition(
  side: GripSide,
  gripLocal: Point3 = SWORD_DOMINANT_GRIP_LOCAL,
  target = new THREE.Vector3(),
) {
  const rotatedGrip = setVector(new THREE.Vector3(), gripLocal)
    .multiplyScalar(SWORD_VISUAL_SCALE)
    .applyQuaternion(swordSocketQuaternion());
  return palmCenter(side, target).sub(rotatedGrip);
}

/** Converts an authored grip-center target into the sword origin in world space. */
export function swordOriginFromGrip(
  gripWorld: Point3,
  swordWorldQuaternion: THREE.Quaternion,
  gripLocal: Point3 = SWORD_DOMINANT_GRIP_LOCAL,
  target = new THREE.Vector3(),
) {
  const offset = setVector(new THREE.Vector3(), gripLocal)
    .multiplyScalar(SWORD_VISUAL_SCALE)
    .applyQuaternion(swordWorldQuaternion);
  return setVector(target, gripWorld).sub(offset);
}

export function swordPointInWorld(
  swordWorldPosition: Point3,
  swordWorldQuaternion: THREE.Quaternion,
  swordLocalPoint: Point3,
  target = new THREE.Vector3(),
) {
  return setVector(target, swordLocalPoint)
    .multiplyScalar(SWORD_VISUAL_SCALE)
    .applyQuaternion(swordWorldQuaternion)
    .add(setVector(new THREE.Vector3(), swordWorldPosition));
}

export function palmPointInWorld(
  wristWorldPosition: Point3,
  handWorldQuaternion: THREE.Quaternion,
  side: GripSide,
  target = new THREE.Vector3(),
) {
  return palmCenter(side, target)
    .applyQuaternion(handWorldQuaternion)
    .add(setVector(new THREE.Vector3(), wristWorldPosition));
}

/**
 * Resolves the wrist-bone pose that preserves the calibrated hand-to-sword
 * socket for a desired sword world pose.
 */
export function wristPoseFromSword(
  swordWorldPosition: Point3,
  swordWorldQuaternion: THREE.Quaternion,
  side: GripSide,
  gripLocal: Point3 = SWORD_DOMINANT_GRIP_LOCAL,
  target: WristPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
) {
  target.quaternion
    .copy(swordWorldQuaternion)
    .multiply(swordSocketQuaternion(new THREE.Quaternion()).invert())
    .normalize();
  target.position
    .copy(swordSocketPosition(side, gripLocal))
    .applyQuaternion(target.quaternion)
    .multiplyScalar(-1)
    .add(setVector(new THREE.Vector3(), swordWorldPosition));
  return target;
}

/**
 * Builds a complete sword orientation: local +Y follows the blade and local
 * +Z follows the supplied roll guide after projection onto the blade plane.
 */
export function swordFrameQuaternion(
  gripWorld: Point3,
  tipWorld: Point3,
  rollGuideWorld: Point3,
  target = new THREE.Quaternion(),
) {
  const yAxis = setVector(new THREE.Vector3(), tipWorld).sub(setVector(new THREE.Vector3(), gripWorld));
  if (yAxis.lengthSq() < 1e-12) throw new RangeError("Sword grip and tip must not coincide");
  yAxis.normalize();

  const zAxis = setVector(new THREE.Vector3(), rollGuideWorld)
    .addScaledVector(yAxis, -yAxis.dot(setVector(new THREE.Vector3(), rollGuideWorld)));
  if (zAxis.lengthSq() < 1e-12) {
    const fallback = Math.abs(yAxis.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);
    zAxis.copy(fallback).addScaledVector(yAxis, -fallback.dot(yAxis));
  }
  zAxis.normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  zAxis.crossVectors(xAxis, yAxis).normalize();
  return target.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)).normalize();
}
