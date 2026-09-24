import type { RapierRigidBody } from "@react-three/rapier";
import { CHARACTER_CAPSULE_RADIUS } from "@elder-souls/game-core/physics/characterPhysics";
import type { AnimationState } from "@elder-souls/game-core/core/types";
import type { WeaponAnimationProfile } from "@elder-souls/game-core/equipment/types";
import { plantedPivotTranslation } from "@elder-souls/game-core/locomotion/footAnchoredMotion";
import * as THREE from "three";

/** Rotate a planted stance about its sole instead of dragging both feet in arcs. */
export function rotateBodyAroundSole(
  body: RapierRigidBody,
  rotation: THREE.Quaternion,
  sole: THREE.Object3D | null,
  soleWorld: THREE.Vector3,
) {
  if (!sole) {
    body.setRotation(rotation, true);
    return;
  }
  sole.getWorldPosition(soleWorld);
  const position = body.translation();
  const current = body.rotation();
  const currentYaw = Math.atan2(
    2 * (current.w * current.y + current.x * current.z),
    1 - 2 * (current.y * current.y + current.z * current.z),
  );
  const wantedYaw = Math.atan2(
    2 * (rotation.w * rotation.y + rotation.x * rotation.z),
    1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
  );
  const planted = plantedPivotTranslation(position, soleWorld, currentYaw, wantedYaw);
  body.setTranslation({
    x: planted.x,
    y: position.y,
    z: planted.z,
  }, true);
  body.setRotation(rotation, true);
}

/**
 * Which way the measured ground track's lateral axis points in the world,
 * applied to the actor's *left* (forward × up is its right, so left is
 * (forward.z, −forward.x)).
 *
 * The pipeline reports the track in Blender's planar (x, y) with forward −y;
 * for a rig facing −y with +z up, the actor's right is −x, so +x is its left
 * and the sign is +1. A constant rather than folded into the maths so a rig
 * with the other handedness is a one-line change.
 */
export const TRACK_LATERAL_SIGN = 1;
/**
 * Two navigation capsules in contact, plus a solver's worth of softness. An
 * enemy whose swing walks it forward on its own feet stops here instead of
 * pressing a few millimetres into the player.
 */
export const ENEMY_CONTACT_STOP_DISTANCE = CHARACTER_CAPSULE_RADIUS * 2 + 0.05;

/**
 * The lock-on selector answers in core clips; a weapon that overrides its
 * locomotion answers for the same directions in its own.
 */
export function lockedWeaponClip(
  weaponLocomotion: WeaponAnimationProfile["locomotion"],
  standard: AnimationState,
): AnimationState {
  if (standard === "RUN_BACK") {
    if (weaponLocomotion?.walkBack === "GREATSWORD_WALK_BACK") return "GREATSWORD_RUN_BACK";
    if (weaponLocomotion?.walkBack === "BOW_WALK_BACK") return "BOW_RUN_BACK";
  }
  if (!weaponLocomotion) return standard;
  return ({
    WALK: weaponLocomotion.walk,
    WALK_BACK: weaponLocomotion.walkBack,
    STRAFE_LEFT: weaponLocomotion.strafeLeft,
    STRAFE_RIGHT: weaponLocomotion.strafeRight,
    RUN: weaponLocomotion.run,
  } as Partial<Record<string, AnimationState>>)[standard] ?? standard;
}
