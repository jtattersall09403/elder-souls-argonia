import { describe, expect, it, vi } from "vitest";
import { frameWorkBudgetMs, FrameWorkQueue, FRAME_WORK_BUDGET_MS, FRAME_WORK_STARTUP_BUDGET_MS, FRAME_WORK_STARTUP_MS, type FrameJob } from "./frameWork";

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

describe("frameWorkBudgetMs startup window", () => {
  it("gives the startup budget inside the window and the steady one after", () => {
    expect(frameWorkBudgetMs(16, 0)).toBe(FRAME_WORK_STARTUP_BUDGET_MS);
    expect(frameWorkBudgetMs(16, FRAME_WORK_STARTUP_MS - 1)).toBe(FRAME_WORK_STARTUP_BUDGET_MS);
    expect(frameWorkBudgetMs(10, FRAME_WORK_STARTUP_MS)).toBe(FRAME_WORK_BUDGET_MS);
    expect(frameWorkBudgetMs(10)).toBe(FRAME_WORK_BUDGET_MS);
  });
});

describe("FrameWorkQueue run order", () => {
  it("runs by priority, then arrival, without re-sorting per step", () => {
    const q = new FrameWorkQueue(1000);
    const ran: string[] = [];
    const job = (name: string): FrameJob => (function* () { ran.push(name); })();
    q.add(job("veg-a"), { priority: 30, label: "veg-a" });
    q.add(job("col"), { priority: 10, label: "col" });
    q.add(job("veg-b"), { priority: 30, label: "veg-b" });
    q.add(job("ter"), { priority: 20, label: "ter" });
    expect(q.labels).toEqual(["col", "ter", "veg-a", "veg-b"]);
    q.pump();
    expect(ran).toEqual(["col", "ter", "veg-a", "veg-b"]);
  });
});
