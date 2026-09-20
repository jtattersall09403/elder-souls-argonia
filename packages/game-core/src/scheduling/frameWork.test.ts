import { describe, expect, it, vi } from "vitest";
import { frameWorkBudgetMs, FrameWorkQueue } from "./frameWork";

function* counter(n: number, log: string[], label: string): Generator<void> {
  for (let i = 0; i < n; i++) { log.push(`${label}${i}`); yield; }
}

describe("FrameWorkQueue", () => {
  it("stops stepping once the budget deadline has passed", () => {
    const queue = new FrameWorkQueue(0);
    const log: string[] = [];
    queue.add(counter(10, log, "a"), { priority: 0, label: "a" });
    const first = queue.pump();
    // Budget 0: the progress guarantee runs exactly one step, no more.
    expect(first.steps).toBe(1);
    expect(log).toEqual(["a0"]);
    expect(queue.pending).toBe(1);
  });

  it("runs at least one step per pump even with no budget left", () => {
    const queue = new FrameWorkQueue(0);
    const log: string[] = [];
    queue.add(counter(3, log, "a"), { priority: 0, label: "a" });
    for (let i = 0; i < 4; i++) queue.pump();
    expect(log).toEqual(["a0", "a1", "a2"]);
    expect(queue.pending).toBe(0);
  });

  it("runs the whole queue when the budget allows", () => {
    const queue = new FrameWorkQueue(1000);
    const log: string[] = [];
    queue.add(counter(3, log, "a"), { priority: 0, label: "a" });
    const done = vi.fn();
    queue.add(counter(2, log, "b"), { priority: 1, label: "b", onDone: done });
    const { steps } = queue.pump();
    expect(steps).toBe(7); // 3 + 1 yields for a, 2 + 1 for b
    expect(done).toHaveBeenCalledOnce();
    expect(queue.pending).toBe(0);
  });

  it("runs jobs in ascending priority order", () => {
    const queue = new FrameWorkQueue(1000);
    const log: string[] = [];
    queue.add(counter(2, log, "late"), { priority: 40, label: "late" });
    queue.add(counter(2, log, "early"), { priority: 10, label: "early" });
    expect(queue.labels).toEqual(["early", "late"]);
    queue.pump();
    expect(log).toEqual(["early0", "early1", "late0", "late1"]);
  });

  it("cancel removes the job and runs its return()", () => {
    const queue = new FrameWorkQueue(0);
    const log: string[] = [];
    function* job(): Generator<void> {
      try { yield; log.push("step"); yield; } finally { log.push("closed"); }
    }
    const handle = queue.add(job(), { priority: 0, label: "x" });
    queue.pump(); // one step: enters the body, so its `finally` is live
    handle.cancel();
    expect(log).toEqual(["closed"]);
    expect(queue.pending).toBe(0);
    queue.pump();
    expect(log).toEqual(["closed"]); // cancelled: "step" never ran
  });

  it("a throwing job calls onError and leaves the other jobs running", () => {
    const queue = new FrameWorkQueue(1000);
    const log: string[] = [];
    function* bad(): Generator<void> { throw new Error("boom"); }
    const onError = vi.fn();
    queue.add(bad(), { priority: 0, label: "bad", onError });
    queue.add(counter(2, log, "ok"), { priority: 1, label: "ok" });
    queue.pump();
    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0][0] as Error).message).toBe("boom");
    expect(log).toEqual(["ok0", "ok1"]);
    expect(queue.pending).toBe(0);
  });

  it("scales the budget with the frame length, capped at 24 ms", () => {
    expect(frameWorkBudgetMs(15)).toBe(6); // 60 fps: the floor holds
    expect(frameWorkBudgetMs(50)).toBe(20);
    expect(frameWorkBudgetMs(200)).toBe(24);
  });
});
