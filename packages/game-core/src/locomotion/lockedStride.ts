import { lockOnLocomotionAnimation } from "../anim/lockOn";
import type { AnimationState, Vec2 } from "../core/types";

/**
 * Locked-on strides: which clip, and how fast it runs.
 *
 * Two rules live here, both owner rulings, both pure so they can be tested
 * without a scene.
 *
 * **Forward is ordinary movement.** Round 8 (owner 2026-09-05): while locked
 * on, pushing towards the target plays the *normal* forward stride at the
 * normal free-roam speed — the same clip and the same cadence as unlocked
 * running. Only backwards and lateral movement keep the locked strafe clips
 * and their foot-anchored drive. So this module's selector returns `null` for
 * forward, which is the caller's signal to fall through to its ordinary
 * locomotion selection (weapon overrides included).
 *
 * **The rate is analogue.** A gamepad stick reports how far it is pushed and
 * that magnitude survives all the way from `InputController` (its dead zone
 * rescales rather than snapping to 1); the locked stride now uses it. The clip
 * rate, the clock and the measured ground track all advance together — that is
 * what keeps the planted foot anchored (decision 0040 §47) — so scaling the
 * rate scales the speed by exactly the same factor, and the feet never scrub.
 */

/** The locked clips this module owns. Forward is not one of them. */
export type LockedStrideClip = Extract<AnimationState, "WALK_BACK" | "STRAFE_LEFT" | "STRAFE_RIGHT">;

/**
 * The locked strafe/back clip for a movement input, or `null` when the input
 * is forward (or below the movement dead zone) and the ordinary locomotion
 * selection should answer instead.
 */
export function lockedStrideClip(
  movement: Vec2,
  magnitude: number,
  reversing?: boolean,
): LockedStrideClip | null {
  const clip = lockOnLocomotionAnimation(movement, magnitude, reversing);
  return clip === "WALK_BACK" || clip === "STRAFE_LEFT" || clip === "STRAFE_RIGHT" ? clip : null;
}

/**
 * Top playback rate of a locked strafe/back stride.
 *
 * Round 7 set 1.35×; round 8's owner note asks for "a further 50%" on the
 * strafes, so 1.35 × 1.5. Written as the product so the provenance is legible.
 */
export const LOCKED_STRIDE_RATE = 1.35 * 1.5;

/** Below this the stick is treated as centred and the actor stands. */
export const MOVE_DEAD_ZONE = 0.08;

/**
 * Floor on the analogue fraction. A stride played much slower than a third of
 * its authored pace reads as slow motion rather than as a careful step, so a
 * push just past the dead zone starts at 0.35 of the top rate and is
 * proportional from there up.
 */
export const MIN_STRIDE_FRACTION = 0.35;

/**
 * Playback rate for a stride at a given stick magnitude (0..1; keyboard is 1).
 *
 * Returns 0 inside the dead zone — the caller should not be moving at all.
 */
export function strideRateForMagnitude(magnitude: number, maximumRate = LOCKED_STRIDE_RATE) {
  if (!Number.isFinite(magnitude) || magnitude <= MOVE_DEAD_ZONE) return 0;
  const fraction = Math.min(1, Math.max(MIN_STRIDE_FRACTION, magnitude));
  return maximumRate * fraction;
}
