/**
 * Step-up smoothing for the drawn model (owner, 16k walk 6: "you sort of
 * stutter between heights as you go up" stairs).
 *
 * The physics body climbs a staircase as a smooth ramp (ecctrl's float
 * spring: 36–61 mm per 60 Hz frame on 0.2 m risers, no snaps). The drawn
 * model did not: the controller's support plane jumps a whole riser the frame
 * its ground cast reaches the next tread, and the penetration grounding solve
 * (`game-core/anim/grounding.ts` `nextSupportCorrection`) raises the model by
 * that riser in ONE frame, then releases it as the body catches up. The model
 * drew a staircase over a smooth body.
 *
 * This follows the grounding correction with a first-order lag while the
 * actor is grounded in locomotion, so a step-up is spread over ~`tau` seconds
 * instead of one frame. It never lags more than `maxLagMeters` (a sole may
 * sit that far into the next tread for a few frames, hidden by the stride),
 * and it snaps for everything that is not a step: airborne, landing
 * (floor-contact) and authored clips, and any jump larger than
 * `snapMeters` (a teleport, a mantle). The solve's own release after the
 * body catches up is followed the same way; a constant solve (at rest, flat
 * ground) is drawn exactly.
 *
 * Only the model root is smoothed; the body, its collider and the camera
 * target keep the physics pose (gameplay is untouched).
 */
export type StepSmoothingOptions = {
  /** Time constant of the rise, seconds. */
  tau?: number;
  /** Largest distance the drawn correction may trail the solved one. */
  maxLagMeters?: number;
  /** A rise bigger than this is not a stair step: snap. */
  snapMeters?: number;
  /**
   * A change this small is gait, not a step: drawn exactly, so the grounding
   * solve's sole-penetration guard (visual:check's 0.02 m bar) holds on flat
   * ground.
   */
  followMeters?: number;
};

export class StepSmoother {
  private value = 0;
  private primed = false;
  private readonly tau: number;
  private readonly maxLag: number;
  private readonly snap: number;
  private readonly follow: number;

  constructor({ tau = 0.08, maxLagMeters = 0.25, snapMeters = 0.6, followMeters = 0.03 }: StepSmoothingOptions = {}) {
    this.tau = tau;
    this.maxLag = maxLagMeters;
    this.snap = snapMeters;
    this.follow = followMeters;
  }

  /**
   * @param target the grounding solve's correction this frame (metres).
   * @param smooth true only while grounded in a locomotion clip.
   * @returns the correction to draw.
   */
  update(target: number, deltaSeconds: number, smooth: boolean): number {
    const rise = target - this.value; // signed: the solve also releases downward
    if (!this.primed || !smooth || Math.abs(rise) <= this.follow || Math.abs(rise) > this.snap
      || !Number.isFinite(rise)) {
      this.value = target;
      this.primed = true;
      return target;
    }
    this.value += rise * (1 - Math.exp(-Math.max(0, deltaSeconds) / this.tau));
    this.value = Math.min(target + this.maxLag, Math.max(target - this.maxLag, this.value));
    return this.value;
  }

  reset(): void {
    this.primed = false;
  }
}
