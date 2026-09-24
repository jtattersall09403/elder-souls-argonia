import type { AnimationState } from "../core/types";
import { UNIT_CLIP_TIMING, type ClipTiming } from "./clipTiming";

export type AnimationCommand = {
  state: AnimationState;
  startAt: number;
  /** Optional transition-specific override; null uses the manifest default. */
  crossFadeDuration: number | null;
  /**
   * How the action clock maps onto this clip (`anim/clipTiming`).
   *
   * Unit timing means the clip is the action, which is the normal case and
   * the whole design of the externally timed path. An attack scaled by its
   * weapon class passes `attackClipTiming(attack)` here, so a dagger's swing
   * plays as fast as the dagger's timing says it swings, a greatsword's swing
   * plays faster than its wind-up, and the contact window still lands on the
   * visible blade.
   */
  timing: ClipTiming;
  serial: number;
};

export function createAnimationCommand(
  state: AnimationState,
  startAt = 0,
  crossFadeDuration: number | null = null,
  timing: ClipTiming = UNIT_CLIP_TIMING,
): AnimationCommand {
  return { state, startAt, crossFadeDuration, timing, serial: 0 };
}

/** Mutates a ref-owned command synchronously and reports whether it changed. */
export function updateAnimationCommand(
  command: AnimationCommand,
  state: AnimationState,
  startAt = 0,
  restart = false,
  crossFadeDuration: number | null = null,
  timing: ClipTiming = UNIT_CLIP_TIMING,
) {
  if (command.state === state && !restart) return false;
  command.state = state;
  command.startAt = startAt;
  command.crossFadeDuration = crossFadeDuration;
  command.timing = timing;
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
