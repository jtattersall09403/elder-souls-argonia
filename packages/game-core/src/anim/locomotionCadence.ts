import type { AnimationState } from "../core/types";
import { clipAuthoredGroundSpeed, clipConfig } from "./animationManifest";

/**
 * Match a locomotion clip's playback rate to how fast the actor is actually
 * travelling.
 *
 * Every stride is authored for one ground speed (the pipeline measures it from
 * the planted foot and bakes it into the manifest as `authoredGroundSpeed`).
 * Play that clip at any other speed and the feet either scrub forward or drag
 * backward, and a controller that steps between two speeds — an enemy dropping
 * out of a run as it closes, say — visibly stutters because the cadence does
 * not follow. Scaling playback by the speed ratio keeps the contact cadence
 * honest without touching gameplay speeds.
 */

/**
 * Playback rates outside this band read worse than the slide they fix: too low
 * looks like slow motion, too high like a cartoon scurry. Clamping keeps a
 * badly-matched pairing merely imperfect instead of absurd.
 */
export const CADENCE_MULTIPLIER_BAND = { min: 0.6, max: 1.8 } as const;

/**
 * Below this, a clip is a standing or airborne action rather than a travelling
 * stride. Deliberately above the residual the measurement reports for jump and
 * landing clips (0.19-0.29 m/s of authored foot drift with no ground under
 * them) and below the slowest real gait (WALK_BACK, 0.69 m/s).
 */
export const MIN_AUTHORED_GROUND_SPEED = 0.5;

/**
 * True when this clip's timing should follow the actor's ground speed.
 *
 * Only an ordinary ground-bound clip qualifies. A jump is timed by the physics
 * arc and a landing by its authored contact, so scaling either to the actor's
 * horizontal speed desynchronises the pose from the thing that owns it — which
 * showed up as a 0.15 m hand pop at the launch-to-fall seam.
 */
export function isTravelTimed(animation: AnimationState) {
  return (clipConfig(animation).supportMode ?? "penetration") === "penetration"
    && (clipAuthoredGroundSpeed(animation) ?? 0) >= MIN_AUTHORED_GROUND_SPEED;
}

/**
 * Playback multiplier for `animation` at `groundSpeed` metres/second.
 * Returns 1 for any clip that is not a travelling stride.
 */
export function locomotionSpeedMultiplier(animation: AnimationState, groundSpeed: number) {
  if (!isTravelTimed(animation)) return 1;
  const authored = clipAuthoredGroundSpeed(animation);
  if (authored == null || authored < MIN_AUTHORED_GROUND_SPEED) return 1;
  const ratio = Math.abs(groundSpeed) / authored;
  if (!Number.isFinite(ratio) || ratio <= 0) return CADENCE_MULTIPLIER_BAND.min;
  return Math.min(CADENCE_MULTIPLIER_BAND.max, Math.max(CADENCE_MULTIPLIER_BAND.min, ratio));
}
