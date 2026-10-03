/**
 * Warm-before-ready gate (perf10 C5). After a load, the same pose ran a ~5 s
 * burst of 13-17 ms frames: V8 was still tiering the render loop up (the
 * c8m1 trace holds ~520 ms of Maglev/Turbofan work in the first second, the
 * profile's hot set unchanged from the settled seconds). The gate keeps the
 * game closed while the real render path runs, counting frames, and opens
 * only once the per-frame main-thread work has been stable for
 * `stableFrames` frames in a row (no timer) AND no shader build is pending
 * (decision 0108 §2: a material is ready before its first draw; walk 10
 * diag20 E2: ~330 pipelines built lazily to 42-48 s behind an open gate), or
 * at `maxFrames`.
 *
 * Pure: the caller feeds one work sample (ms), the build queue's pending
 * count and the spawn ring's pending pieces per frame.
 */
export interface WarmGateOptions {
  /** Frames always run before the gate may open. */
  minFrames: number;
  /** Length of the run of stable frames that opens it. */
  stableFrames: number;
  /** A frame is stable when its work is within `ratio`× + `slackMs` of the run's median. */
  ratio: number;
  slackMs: number;
  /** Hard cap: the gate opens here even if the work never settles. */
  maxFrames: number;
}

export const WARM_GATE_DEFAULTS: WarmGateOptions = {
  minFrames: 60, stableFrames: 60, ratio: 1.25, slackMs: 1, maxFrames: 900,
};

export type WarmGateState = { frames: number; open: boolean; reason: "warming" | "ring" | "stable" | "cap" };

export class WarmGate {
  readonly opts: WarmGateOptions;
  /** Ring of the last `stableFrames` samples and a sort scratch: no allocation per frame. */
  private readonly ring: Float64Array;
  private readonly sorted: Float64Array;
  private filled = 0;
  readonly state: WarmGateState = { frames: 0, open: false, reason: "warming" };

  constructor(opts: Partial<WarmGateOptions> = {}) {
    this.opts = { ...WARM_GATE_DEFAULTS, ...opts };
    this.ring = new Float64Array(this.opts.stableFrames);
    this.sorted = new Float64Array(this.opts.stableFrames);
  }

  /**
   * One warm frame's main-thread work (ms), the shader builds still pending,
   * and the spawn-ring pieces not yet drawn (decision 0120 rule 5: the gate
   * holds while any is pending; pieces beyond the ring are never counted).
   * Returns true once open (stays open).
   */
  step(workMs: number, pendingBuilds = 0, ringPending = 0): boolean {
    const s = this.state;
    if (s.open) return true;
    s.frames++;
    const { stableFrames, minFrames, maxFrames, ratio, slackMs } = this.opts;
    if (s.frames >= maxFrames) { s.open = true; s.reason = "cap"; return true; }
    // a frame while the ring streams in is not a settled frame
    if (ringPending > 0) { this.filled = 0; s.reason = "ring"; return false; }
    s.reason = "warming";
    this.ring[this.filled % stableFrames] = workMs;
    this.filled++;
    if (pendingBuilds > 0 || s.frames < minFrames || this.filled < stableFrames) return false;
    this.sorted.set(this.ring);
    this.sorted.sort();
    const median = this.sorted[(stableFrames - 1) >> 1]; // lower median: a half-slow run never passes
    if (this.sorted[stableFrames - 1] <= median * ratio + slackMs) { s.open = true; s.reason = "stable"; }
    return s.open;
  }
}
