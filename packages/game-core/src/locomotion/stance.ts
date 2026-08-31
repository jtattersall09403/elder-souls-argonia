import { clipAuthoredGroundSpeed } from "../anim/animationManifest";
import type { AnimationState, Vec2 } from "../core/types";
import type { WeaponAnimationProfile } from "../equipment/types";

/**
 * Standing or crouching.
 *
 * Crouching is a *stance*, not a speed multiplier on a walk. Skyrim authors
 * sneaking as a complete locomotion set — its own idle, stride, reverse and
 * strafes — so treating it as a slowed walk would play a standing stride at a
 * crouched speed, which is the classic skating defect the animation contract's
 * cadence rule exists to prevent.
 *
 * The stance lives in `game-core` rather than in either app because it is
 * shared: the world studio's exploration locomotion and the sandbox's combat
 * FSM both need it, and stealth (Phase 13's detection model, module 76 §121.5's
 * sneak-attack table) will read it from here rather than from a scene ref.
 *
 * Today the stance changes movement speed and pose only. It deliberately does
 * **not** touch combat: no reach change, no attack gating, no detection. Those
 * arrive with the stealth system, and the seam they will use is
 * `StanceState.crouching` — one field, already threaded through the actors,
 * rather than a new concept to retro-fit.
 */
export type Stance = "standing" | "crouching";

/**
 * Crouched top speed, in metres per second.
 *
 * Read off the authored stride rather than chosen: `CROUCH_WALK` is
 * `sneakwalk_forward`, and the pipeline measures the planar velocity of its
 * planted sole. Driving the controller at the speed the clip was authored for
 * is what makes a crouched walk look planted instead of scrubbed, and it means
 * re-sourcing the sneak clip retunes the speed automatically.
 */
export const CROUCH_SPEED = clipAuthoredGroundSpeed("CROUCH_WALK") ?? 0.71;

/**
 * You cannot crouch in mid-air, and you cannot sprint from a crouch.
 *
 * Both are stance rules rather than input rules, so an AI or a replay driving
 * the same actor gets them for free.
 */
export function canCrouch({ grounded, acting }: { grounded: boolean; acting: boolean }) {
  return grounded && !acting;
}

export type StanceInput = {
  /** Rising edge of the crouch button. */
  toggled: boolean;
  grounded: boolean;
  /** The actor is mid-action (attacking, rolling, guarding, aiming). */
  acting: boolean;
  /** Sprint is being requested; standing up is part of breaking into a run. */
  sprinting: boolean;
};

/**
 * Advance the stance for one frame.
 *
 * A toggle rather than a hold: stealth is a mode you stay in for minutes, and
 * a hold binding is unusable on a touch screen and painful on a pad. Leaving
 * the ground or breaking into a sprint stands the actor up on its own, which
 * is what every player expects and saves a second press.
 */
export function nextStance(current: Stance, input: StanceInput): Stance {
  if (!input.grounded || input.sprinting) return "standing";
  if (input.toggled && canCrouch(input)) {
    return current === "crouching" ? "standing" : "crouching";
  }
  return current;
}

/**
 * The crouched clip for a movement direction.
 *
 * Same shape as the lock-on locomotion selector: strafes and a real reverse
 * stride, because a crouched actor moves sideways and backwards often enough
 * that mirroring one forward clip would be obvious.
 */
export function crouchLocomotionAnimation(
  move: Vec2,
  moveMagnitude: number,
  weapon?: WeaponAnimationProfile,
): AnimationState {
  if (moveMagnitude <= 0.08) return weapon?.crouchIdle ?? "CROUCH_IDLE";
  // Sideways only when it is clearly sideways: a diagonal reads better as the
  // forward stride turned than as a strafe crabbing at an angle.
  if (Math.abs(move.x) > Math.abs(move.y) * 1.4) {
    return move.x < 0 ? "CROUCH_STRAFE_LEFT" : "CROUCH_STRAFE_RIGHT";
  }
  return move.y < 0 ? "CROUCH_WALK_BACK" : "CROUCH_WALK";
}

/** Every crouched state, for the animation contract's coverage checks. */
export const CROUCH_STATES: readonly AnimationState[] = [
  "CROUCH_IDLE",
  "CROUCH_WALK",
  "CROUCH_WALK_BACK",
  "CROUCH_STRAFE_LEFT",
  "CROUCH_STRAFE_RIGHT",
  "SWORD_CROUCH_IDLE",
];
