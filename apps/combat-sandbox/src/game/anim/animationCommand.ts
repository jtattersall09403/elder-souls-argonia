import type { AnimationState } from "../core/types";

export type AnimationCommand = {
  state: AnimationState;
  startAt: number;
  /** Optional transition-specific override; null uses the manifest default. */
  crossFadeDuration: number | null;
  serial: number;
};

export function createAnimationCommand(
  state: AnimationState,
  startAt = 0,
  crossFadeDuration: number | null = null,
): AnimationCommand {
  return { state, startAt, crossFadeDuration, serial: 0 };
}

/** Mutates a ref-owned command synchronously and reports whether it changed. */
export function updateAnimationCommand(
  command: AnimationCommand,
  state: AnimationState,
  startAt = 0,
  restart = false,
  crossFadeDuration: number | null = null,
) {
  if (command.state === state && !restart) return false;
  command.state = state;
  command.startAt = startAt;
  command.crossFadeDuration = crossFadeDuration;
  command.serial += 1;
  return true;
}

/**
 * Advance mixer-owned cross-fade weights on the same clock as the pose.
 * Externally timed combat clips slow during hit-stop; using render time for
 * their fades makes the outgoing pose disappear while the incoming source
 * frame is almost frozen, exposing abrupt authored opening poses.
 */
export function animationMixerDelta(
  renderDelta: number,
  externalElapsedBefore: number | null = null,
  externalElapsedAfter: number | null = null,
) {
  if (externalElapsedBefore !== null && externalElapsedAfter !== null) {
    return Math.max(0, externalElapsedAfter - externalElapsedBefore);
  }
  return Math.max(0, Math.min(renderDelta, 1 / 30));
}
