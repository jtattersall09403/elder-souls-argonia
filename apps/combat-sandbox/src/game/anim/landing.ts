import type { AnimationState } from "../core/types";
import { clipConfig } from "./animationManifest";

export type LandingKind = "stationary" | "moving" | "sprint" | "hard";

export type LandingSelection = {
  animation: Extract<AnimationState, "JUMP_LAND" | "JUMP_LAND_LEFT" | "JUMP_LAND_RIGHT">;
  duration: number;
  /** Playback rate that fits the authored clip to `duration`, capped. */
  animationSpeed: number;
  kind: LandingKind;
  impactSpeed: number;
  planarSpeed: number;
};

const MOVING_SPEED = 0.75;
const SPRINT_SPEED = 4.4;
const HARD_IMPACT_SPEED = 6.5;

/**
 * A moving landing must not hold a planted touchdown pose while the controller
 * keeps its horizontal speed: the feet are stationary in the clip and moving in
 * the world, which is exactly what reads as skating. Give the impact only long
 * enough to register, then hand back to locomotion.
 */
const MOVING_LANDING_DURATION = 0.24;
const SPRINT_LANDING_DURATION = 0.18;

/**
 * Ceiling on landing playback rate. Fitting a 0.87s clip into a 0.24s window
 * would need 3.6x and reads as a blur, so the clip instead plays at a brisk but
 * legible rate and is cross-faded out mid-recovery — which is what a runner's
 * touchdown looks like anyway.
 */
const MAX_LANDING_ANIMATION_SPEED = 2;

/**
 * Resolve the touchdown clip without taking horizontal authority from the
 * movement controller. Vanilla's left/right clips were auditioned but contain
 * authored quarter-turns, so they are unsafe while controller facing remains
 * authoritative. Gameplay movement remains live during this visual recovery,
 * so the authored touchdown must retain enough time to read without imposing
 * a separate control lock.
 */
export function selectLandingAnimation({
  velocity,
  impactSpeed,
}: {
  velocity: { x: number; z: number };
  impactSpeed: number;
}): LandingSelection {
  const planarSpeed = Math.hypot(velocity.x, velocity.z);
  const hard = impactSpeed >= HARD_IMPACT_SPEED;
  const stationary = planarSpeed < MOVING_SPEED;
  const kind: LandingKind = hard
    ? "hard"
    : stationary
      ? "stationary"
      : planarSpeed >= SPRINT_SPEED
        ? "sprint"
        : "moving";
  const duration = hard
    ? 0.46
    : stationary
      ? 0.58
      : kind === "sprint"
        ? SPRINT_LANDING_DURATION
        : MOVING_LANDING_DURATION;
  return {
    animation: "JUMP_LAND",
    duration,
    animationSpeed: landingAnimationSpeed(duration),
    kind,
    impactSpeed,
    planarSpeed,
  };
}

/** Rate that shows as much of the authored landing as `duration` allows. */
export function landingAnimationSpeed(
  duration: number,
  animation: Extract<AnimationState, "JUMP_LAND" | "JUMP_LAND_LEFT" | "JUMP_LAND_RIGHT"> = "JUMP_LAND",
) {
  const source = clipConfig(animation).sourceDuration;
  if (!source || duration <= 0) return 1;
  return Math.min(MAX_LANDING_ANIMATION_SPEED, source / duration);
}
