/**
 * Frame-sliced work queue.
 *
 * Crossing 16-40 m of new ground fires four rebuilds (vegetation instances,
 * flora colliders, settlement meshes, chunk terrain geometry) that each used
 * to run to completion inside a single frame — the walking stutter the owner
 * reported on 2026-09-20. "Option 1" of that ruling: spread the work over
 * frames instead of shrinking it.
 *
 * Each job is a plain generator; one `next()` is one indivisible step (a
 * species group, a collider body, a chunk geometry). The queue runs steps in
 * priority order until the frame's budget is spent, then stops and resumes on
 * the next pump. Groundcover has done this with its own `performance.now()`
 * budget since Phase 10; this is that idea, generalised and shared.
 *
 * No module-level state: the scene root owns a queue and hands it down
 * (standard 5, no new mutable singletons in `packages/`).
 */

/** Milliseconds of main thread a single pump may spend. A 60 fps frame is
 * 16.7 ms; rendering, physics and the camera keep the rest. */
export const FRAME_WORK_BUDGET_MS = 6;

/**
 * The budget a pump may spend on a frame of the given length.
 *
 * A fixed 6 ms is right at 60 fps; when frames are already slow (load, shader
 * compile, weak devices) the queue still takes at most 40 % of the frame but
 * drains faster, capped at 24 ms so a stalled frame never turns into a stalled
 * second.
 */
export function frameWorkBudgetMs(frameDeltaMs: number): number {
  return Math.min(24, Math.max(FRAME_WORK_BUDGET_MS, 0.4 * frameDeltaMs));
}

/** A unit of sliced work. Every `next()` must be safe to stop after. */
export type FrameJob = Iterator<void>;

export interface FrameJobOptions {
  /** Lower runs first. Colliders (10) before terrain (20) before vegetation
   * (30) before settlement meshes (40): the player must not fall through or
   * walk into something before it is solid. */
  priority: number;
  /** Debug label, reported through the DEV window hook. */
  label: string;
  onDone?: () => void;
  onError?: (error: unknown) => void;
}

export interface FrameJobHandle {
  /** Remove the job and let the generator run its `finally` blocks. */
  cancel(): void;
}

interface Entry {
  job: FrameJob;
  options: FrameJobOptions;
  seq: number;
}

export class FrameWorkQueue {
  private readonly entries: Entry[] = [];
  private seq = 0;

  constructor(private readonly budgetMs: number = FRAME_WORK_BUDGET_MS) {}

  add(job: FrameJob, options: FrameJobOptions): FrameJobHandle {
    const entry: Entry = { job, options, seq: this.seq++ };
    this.entries.push(entry);
    return { cancel: () => this.remove(entry, true) };
  }

  get pending(): number {
    return this.entries.length;
  }

  /** Labels of the jobs still queued, in the order they will run. */
  get labels(): string[] {
    return this.sorted().map((entry) => entry.options.label);
  }

  /**
   * Run steps until the deadline passes or nothing is left. ALWAYS runs at
   * least one step, even when the budget is already spent, so a queue can
   * never stall behind a frame that overran elsewhere (the same progress
   * guarantee as Groundcover's `generated > 0` rule).
   */
  pump(
    now: number = performance.now(),
    budgetMs: number = this.budgetMs,
  ): { steps: number; ms: number } {
    const start = now;
    const deadline = start + budgetMs;
    let steps = 0;
    while (this.entries.length > 0) {
      if (steps > 0 && performance.now() > deadline) break;
      const entry = this.sorted()[0];
      steps++;
      let result: IteratorResult<void>;
      try {
        result = entry.job.next();
      } catch (error) {
        // A throwing job is removed; every other job in the queue is
        // untouched. Its owner decides what a failure means.
        this.remove(entry, false);
        entry.options.onError?.(error);
        continue;
      }
      if (result.done) {
        this.remove(entry, false);
        entry.options.onDone?.();
      }
    }
    return { steps, ms: performance.now() - start };
  }

  private sorted(): Entry[] {
    return [...this.entries].sort(
      (a, b) => a.options.priority - b.options.priority || a.seq - b.seq,
    );
  }

  private remove(entry: Entry, close: boolean): void {
    const at = this.entries.indexOf(entry);
    if (at < 0) return;
    this.entries.splice(at, 1);
    if (close) entry.job.return?.();
  }
}
