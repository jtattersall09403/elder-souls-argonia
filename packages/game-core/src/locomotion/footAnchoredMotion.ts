import { clipConfig } from "../anim/animationManifest";
import type { AnimationState } from "../core/types";

/**
 * Motion taken from the feet instead of from a number.
 *
 * A committed action — a swing, a dodge, an execution — used to move the body
 * at a constant `lunge` speed for the whole wind-up, a hand-set figure per
 * attack. That is why feet slide: the number and the animation are two
 * independent descriptions of the same movement, and nothing keeps them
 * agreeing. A battleaxe's overhead is the clearest case. Its feet plant and
 * stay planted — the whole clip moves the body 3.6 cm — while the authored
 * lunge pushed it forward through the entire wind-up.
 *
 * The rule this replaces it with is the one a real body obeys: **while a foot
 * is on the ground it does not slide**, so any motion of that foot relative to
 * the actor's own root is motion the body actually made. Anchor the planted
 * foot, move the body by the negative of its travel, and when the other foot
 * plants, anchor that one instead.
 *
 * ## Measured at build time, not run time
 *
 * The pipeline already samples both soles for every clip (it is how
 * `authoredGroundSpeed` is derived), so the integration happens there and each
 * clip carries a `groundTrack`: cumulative planar displacement per support
 * sample, in the actor's own frame, in metres. The runtime differentiates it.
 * That keeps the expensive part deterministic and testable, and means no
 * per-frame bone reading.
 *
 * ## The cap, and why there is one
 *
 * With one anchor point and no knowledge of the body's own rotation, a
 * *pivoting* clip is indistinguishable from a travelling one — a planted foot
 * swinging round a turn traces the same arc either way. Skyrim's one-handed
 * power attack turns the body through most of a circle, and the measurement
 * reads it as 1.8 m of sideways travel it plainly does not make. Measuring the
 * rotation out needs a reliable body-facing axis and the rig does not offer
 * one: a Blender bone's local axis runs *along* the bone, so the pelvis points
 * up the spine rather than forward, and the line between the feet swings
 * through every stride.
 *
 * So the applied speed is capped by the attack's own authored lunge. That makes
 * the change strictly one-directional: it can move an actor *less* than the
 * number it replaces, never more. Every case the owner reported is an attack
 * that should move them less, and a pivot clip degrades to what it does today
 * rather than to something worse.
 *
 * ## What this is deliberately *not* applied to
 *
 * Locomotion. Walking and running keep their existing time-scaling against
 * `authoredGroundSpeed`, which is calibrated and owner-approved. The track
 * under-reads a run — during the airborne phase of a stride neither foot is
 * planted, so anchoring the lower one under-counts the distance covered — and
 * locomotion is the one case where the controller's speed is the thing the
 * player is steering, so the animation should follow it rather than the other
 * way round. Committed actions are the opposite: the animation is in charge.
 */

/** Displacement in the actor's own frame: +forward is the way it faces. */
export type LocalDisplacement = { forward: number; lateral: number };

const ZERO: LocalDisplacement = { forward: 0, lateral: 0 };

/**
 * The pipeline reports the pair as Blender's planar (x, y) scaled to metres.
 *
 * Forward is −y, established from the data rather than assumed: the walk and
 * run cycles, which unambiguously travel forwards, both integrate to a large
 * negative y and a near-zero x.
 */
function toLocal(sample: readonly [number, number]): LocalDisplacement {
  return { lateral: sample[0], forward: -sample[1] };
}

/** Cumulative displacement at a source time, interpolated between samples. */
export function groundTrackAt(state: AnimationState, sourceTime: number): LocalDisplacement {
  const config = clipConfig(state);
  const track = config.groundTrack;
  const envelope = config.supportEnvelope;
  if (!track || track.length === 0 || !envelope) return ZERO;
  const interval = envelope.sampleIntervalSeconds;
  if (!(interval > 0)) return ZERO;
  const position = (sourceTime - (envelope.sampleStartTimeSeconds ?? 0)) / interval;
  if (!Number.isFinite(position)) return ZERO;
  if (position <= 0) return toLocal(track[0]);
  if (position >= track.length - 1) return toLocal(track[track.length - 1]);
  const index = Math.floor(position);
  const alpha = position - index;
  const a = toLocal(track[index]);
  const b = toLocal(track[index + 1]);
  return {
    forward: a.forward + (b.forward - a.forward) * alpha,
    lateral: a.lateral + (b.lateral - a.lateral) * alpha,
  };
}

/**
 * How fast the feet say the body is moving, in the actor's own frame, m/s.
 *
 * `elapsed` is time into the *action*, which for an untrimmed clip is source
 * time; trimmed clips are offset by their playback window and scaled by their
 * rate, so a reskin that trims differently cannot silently change the motion.
 */
export function footAnchoredVelocity(
  state: AnimationState,
  elapsed: number,
  delta: number,
  /** Ceiling on the resulting speed, m/s. See "The cap" above. */
  maximumSpeed = Infinity,
): LocalDisplacement {
  if (!(delta > 0)) return ZERO;
  const config = clipConfig(state);
  const rate = config.playbackRate || 1;
  const offset = config.playbackStartTime ?? 0;
  const from = groundTrackAt(state, offset + Math.max(0, elapsed - delta) * rate);
  const to = groundTrackAt(state, offset + Math.max(0, elapsed) * rate);
  // Source time advances `rate` times faster than action time, so the distance
  // covered per second of action scales with it too.
  const forward = (to.forward - from.forward) / delta;
  const lateral = (to.lateral - from.lateral) / delta;
  const speed = Math.hypot(forward, lateral);
  if (!(speed > maximumSpeed) || !(speed > 0)) return { forward, lateral };
  const scale = maximumSpeed / speed;
  return { forward: forward * scale, lateral: lateral * scale };
}

/**
 * `footAnchoredVelocity` for a *looping* stride, m/s in the actor's frame.
 *
 * Locomotion clips loop, so the source time wraps; a step that crosses the
 * wrap is the distance to the end of the loop plus the distance from its
 * start. Round 7 (owner 2026-09-05): locked-on and crouched movement are
 * driven from the clip's own feet at playback rate 1 — the planted foot is
 * the anchor and the body moves relative to it — instead of a controller
 * speed with the clip's cadence scaled to chase it.
 */
export function footAnchoredLoopVelocity(
  state: AnimationState,
  elapsed: number,
  delta: number,
): LocalDisplacement {
  if (!(delta > 0)) return ZERO;
  const config = clipConfig(state);
  const rate = config.playbackRate || 1;
  const start = config.playbackStartTime ?? 0;
  const end = config.playbackEndTime ?? config.sourceDuration ?? 0;
  const loop = end - start;
  if (!(loop > 0)) return footAnchoredVelocity(state, elapsed, delta);
  const wrap = (t: number) => start + (((t - start) % loop) + loop) % loop;
  const fromSource = wrap(start + Math.max(0, elapsed - delta) * rate);
  const toSource = wrap(start + Math.max(0, elapsed) * rate);
  const from = groundTrackAt(state, fromSource);
  const to = groundTrackAt(state, toSource);
  let forward = to.forward - from.forward;
  let lateral = to.lateral - from.lateral;
  if (toSource < fromSource) {
    const atEnd = groundTrackAt(state, end);
    const atStart = groundTrackAt(state, start);
    forward = (atEnd.forward - from.forward) + (to.forward - atStart.forward);
    lateral = (atEnd.lateral - from.lateral) + (to.lateral - atStart.lateral);
  }
  // A stride never moves against its own direction of travel. The measured
  // track can still carry a one-frame reversal at a foot switch (the anchor
  // caught mid-lift), and on a loop that reads as a jerk backwards every
  // cycle; the component against the loop's net travel is dropped.
  const total = groundTrackTotal(state);
  const length = Math.hypot(total.forward, total.lateral);
  if (length > 1e-6) {
    const ux = total.forward / length;
    const uz = total.lateral / length;
    const along = forward * ux + lateral * uz;
    if (along < 0) {
      forward -= along * ux;
      lateral -= along * uz;
    }
  }
  return { forward: forward / delta, lateral: lateral / delta };
}

/** Total ground the clip's feet cover, for tests and for tooling. */
export function groundTrackTotal(state: AnimationState): LocalDisplacement {
  const config = clipConfig(state);
  const track = config.groundTrack;
  if (!track || track.length === 0) return ZERO;
  return toLocal(track[track.length - 1]);
}

/** Whether a clip has a measured track at all. Older builds will not. */
export function hasGroundTrack(state: AnimationState) {
  const track = clipConfig(state).groundTrack;
  return Array.isArray(track) && track.length > 1;
}
