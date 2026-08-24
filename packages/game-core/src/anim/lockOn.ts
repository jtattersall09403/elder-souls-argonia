import type { AnimationState, Vec2 } from "../core/types";

export const WALK_LOOP_PLANTED_SPEED = 1.046;
export const MAX_WALK_LOOP_TIME_SCALE = 3.5;

type WalkLoopAnimation = Extract<AnimationState, "WALK" | "WALK_BACK" | "STRAFE_LEFT" | "STRAFE_RIGHT">;

/** Matches the authored planted-foot speed to Ecctrl's relative planar speed. */
export function walkLoopTimeScale(animation: WalkLoopAnimation, moveSpeed: number) {
  const finiteSpeed = Number.isFinite(moveSpeed) ? Math.max(0, moveSpeed) : 0;
  const magnitude = Math.min(MAX_WALK_LOOP_TIME_SCALE, finiteSpeed / WALK_LOOP_PLANTED_SPEED);
  return animation === "WALK_BACK" ? -magnitude : magnitude;
}

export function lockOnYaws(
  player: { x: number; z: number },
  target: { x: number; z: number },
) {
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const length = Math.hypot(dx, dz) || 1;
  const x = dx / length;
  const z = dz / length;
  return {
    playerFacingYaw: Math.atan2(x, z),
    cameraYaw: Math.atan2(-x, -z),
  };
}

export function lockOnLocomotionAnimation(
  movement: Vec2,
  magnitude: number,
  reversing = lockOnOrientationWarp(movement).reversing,
): Extract<AnimationState, "WALK" | "RUN" | "WALK_BACK" | "STRAFE_LEFT" | "STRAFE_RIGHT"> | null {
  if (magnitude <= 0.08) return null;
  if (reversing) return "WALK_BACK";
  const lateral = Math.abs(movement.x);
  const longitudinal = Math.abs(movement.y);
  if (lateral > longitudinal * 0.8) return movement.x < 0 ? "STRAFE_LEFT" : "STRAFE_RIGHT";
  return "WALK";
}

export function lockOnOrientationWarp(movement: Vec2, wasReversing = false) {
  // Ecctrl maps stick-right to forward × up, which is local -X for this rig.
  const locomotionAngle = Math.atan2(-movement.x, movement.y);
  const absoluteAngle = Math.abs(locomotionAngle);
  const reverseEntry = Math.PI * (100 / 180);
  const reverseExit = Math.PI * (80 / 180);
  const reversing = wasReversing
    ? absoluteAngle > reverseExit
    : absoluteAngle > reverseEntry;
  const warp = reversing
    ? locomotionAngle - Math.sign(locomotionAngle) * Math.PI
    : locomotionAngle;
  return { warp, reversing };
}

export function lockOnSprintAllowed(lockedOn: boolean) {
  return !lockedOn;
}

export function dampLockOnOrientationWarp(current: number, target: number, delta: number, damping = 12) {
  return target + (current - target) * Math.exp(-damping * Math.max(0, delta));
}
