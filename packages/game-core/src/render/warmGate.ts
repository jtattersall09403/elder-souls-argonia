/**
 * Warm-before-ready gate (perf10 C5). After a load, the same pose ran a ~5 s
 * burst of 13-17 ms frames: V8 was still tiering the render loop up (the
 * c8m1 trace holds ~520 ms of Maglev/Turbofan work in the first second, the
 * profile's hot set unchanged from the settled seconds). The gate keeps the
 * game closed while the real render path runs, counting frames, and opens
 * only once the per-frame main-thread work has been stable for
 * `stableFrames` frames in a row (no timer), or at `maxFrames`.
 *
 * Pure: the caller feeds one work sample (ms) per frame.
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

export type WarmGateState = { frames: number; open: boolean; reason: "warming" | "stable" | "cap" };

export class WarmGate {
  readonly opts: WarmGateOptions;
  private window: number[] = [];
  readonly state: WarmGateState = { frames: 0, open: false, reason: "warming" };

  constructor(opts: Partial<WarmGateOptions> = {}) {
    this.opts = { ...WARM_GATE_DEFAULTS, ...opts };
  }

  /** One warm frame's main-thread work (ms). Returns true once open (stays open). */
  step(workMs: number): boolean {
    const s = this.state;
    if (s.open) return true;
    s.frames++;
    const { stableFrames, minFrames, maxFrames, ratio, slackMs } = this.opts;
    this.window.push(workMs);
    if (this.window.length > stableFrames) this.window.shift();
    if (s.frames >= maxFrames) { s.open = true; s.reason = "cap"; return true; }
    if (s.frames < minFrames || this.window.length < stableFrames) return false;
    const sorted = this.window.slice().sort((a, b) => a - b);
    const median = sorted[(sorted.length - 1) >> 1]; // lower median: a half-slow run never passes
    if (sorted[sorted.length - 1] <= median * ratio + slackMs) { s.open = true; s.reason = "stable"; }
    return s.open;
  }
}
