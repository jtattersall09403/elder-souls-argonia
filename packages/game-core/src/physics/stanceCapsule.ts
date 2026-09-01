import type { Stance } from "../locomotion/stance";
import {
  CHARACTER_BODY_CENTER_HEIGHT,
  CHARACTER_CAPSULE_HALF_HEIGHT,
  CHARACTER_CAPSULE_RADIUS,
  CHARACTER_FLOAT_HEIGHT,
} from "./characterPhysics";

/**
 * The navigation capsule's shape per stance.
 *
 * Two volumes have always been separate here (see `characterPhysics`): the
 * skeleton-fitted hurtbox, which is what combat hits, and this one, which is
 * what the world stops. Crouching already lowered the first, because those
 * capsules ride the live bones — so ducking a swing has always worked. It did
 * nothing to this one, so ducking *under* something did not.
 *
 * ## Why the capsule shrinks upward
 *
 * The controller suspends the body a fixed `floatHeight` above the ground and
 * everything else is measured from the body origin — the rendered model hangs
 * off it at `CHARACTER_MODEL_OFFSET`, and the camera, the hurtbox and the
 * spawn heights all assume it. Moving the origin to crouch would move all of
 * them.
 *
 * So the origin does not move. The capsule is shortened and its *local* centre
 * is dropped by the same amount, which pins the soles where they were and
 * brings only the crown down. That is also what actually happens when a person
 * crouches: the feet stay, the head lowers.
 */

/**
 * How much of a standing actor a crouched one occupies.
 *
 * Skyrim's sneak puts the crown at roughly two thirds of standing height. Kept
 * as a *proportion* rather than an absolute, because the navigation capsule is
 * deliberately not as tall as the actor — it is tuned for stairs and
 * suspension, and combat uses the fitted hurtbox instead — so the number that
 * has to scale is the capsule's own crown, not the character's.
 */
export const CROUCHED_HEIGHT_SHARE = 2 / 3;

/** Where the standing capsule's crown sits above the ground. Unchanged. */
export const STANDING_CROWN_HEIGHT =
  CHARACTER_BODY_CENTER_HEIGHT + CHARACTER_CAPSULE_HALF_HEIGHT + CHARACTER_CAPSULE_RADIUS;
export const CROUCHED_CROWN_HEIGHT = STANDING_CROWN_HEIGHT * CROUCHED_HEIGHT_SHARE;

export type CapsuleShape = {
  /** Half the cylindrical section, excluding caps — Rapier's own parameter. */
  readonly halfLength: number;
  readonly radius: number;
  /** Where the capsule's centre sits relative to the body origin, metres. */
  readonly centerOffset: number;
};

/**
 * The capsule whose crown sits `crownHeight` above the ground.
 *
 * Derived rather than tabulated so a third stance — prone, a mounted rider, a
 * creature — is one number rather than three hand-checked ones that have to
 * stay consistent with each other. Passing the standing crown reproduces the
 * shipped capsule exactly, which is the property the tests hold it to.
 */
export function stanceCapsule(crownHeight: number): CapsuleShape {
  // The soles, relative to the body origin: the standing capsule's bottom,
  // which the suspension holds one float height off the ground. Fixed, because
  // the origin does not move between stances.
  const soles = -(CHARACTER_CAPSULE_HALF_HEIGHT + CHARACTER_CAPSULE_RADIUS);
  const wanted = crownHeight - CHARACTER_BODY_CENTER_HEIGHT;
  // Never shorter than a sphere: a capsule with negative cylinder is not a
  // shape, and a stance that low is a different problem anyway.
  const crown = Math.max(soles + 2 * CHARACTER_CAPSULE_RADIUS, wanted);
  return {
    halfLength: Math.max(0, (crown - soles) / 2 - CHARACTER_CAPSULE_RADIUS),
    radius: CHARACTER_CAPSULE_RADIUS,
    centerOffset: (soles + crown) / 2,
  };
}

export const STANCE_CAPSULES: Readonly<Record<Stance, CapsuleShape>> = {
  standing: stanceCapsule(STANDING_CROWN_HEIGHT),
  crouching: stanceCapsule(CROUCHED_CROWN_HEIGHT),
};

/** The name Ecctrl gives its own capsule collider. */
export const CHARACTER_CAPSULE_COLLIDER_NAME = "character-capsule-collider";

/**
 * The minimal Rapier surface this needs, so the rule can be tested and so a
 * future controller swap does not drag a physics import into game logic.
 */
export type ResizableCapsule = {
  setHalfHeight(halfHeight: number): unknown;
  setRadius(radius: number): unknown;
  setTranslationWrtParent(translation: { x: number; y: number; z: number }): unknown;
};

/** Reshape a character's navigation capsule for a stance. */
export function applyStanceCapsule(collider: ResizableCapsule, stance: Stance) {
  const shape = STANCE_CAPSULES[stance];
  collider.setHalfHeight(shape.halfLength);
  collider.setRadius(shape.radius);
  collider.setTranslationWrtParent({ x: 0, y: shape.centerOffset, z: 0 });
}

/**
 * Whether there is room to stand up again.
 *
 * Not wired to anything yet — the sandbox has no ceilings — but the rule
 * belongs with the shape it depends on, and Phase 12's interiors will need it
 * the moment a crouched player walks under a lintel. Returns the height needed
 * above the soles.
 */
export function headroomToStand() {
  return STANDING_CROWN_HEIGHT - CHARACTER_FLOAT_HEIGHT;
}

/** Where the crown of a stance's capsule sits above the ground, metres. */
export function stanceCrownHeight(stance: Stance) {
  const shape = STANCE_CAPSULES[stance];
  return CHARACTER_BODY_CENTER_HEIGHT + shape.centerOffset + shape.halfLength + shape.radius;
}
