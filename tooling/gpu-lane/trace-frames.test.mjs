// node --test tooling/gpu-lane/trace-frames.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { keepTraceEvent, mainThreadStages, topCause } from "./trace-frames.mjs";

const X = (name, ts, dur, tid = 1) => ({ ph: "X", pid: 1, tid, name, ts, dur });
test("mainThreadStages: self time, nested GC not counted twice, other threads and containers ignored", () => {
  const ev = [
    X("FireAnimationFrame", 0, 10_000), X("FireAnimationFrame", 16_000, 10_000),
    X("RunTask", 0, 30_000), // container: skipped
    X("FunctionCall", 0, 10_000), X("V8.GC_SCAVENGER", 2_000, 4_000), // js self 6, gc 4 (inside FunctionCall)
    X("FunctionCall", 16_000, 10_000),
    X("FunctionCall", 0, 50_000, 2), // another thread
  ];
  const r = mainThreadStages(ev);
  assert.equal(r.frames, 2);
  // FireAnimationFrame is js too: its 10 ms contain FunctionCall 10 ms -> 0 self; js = 6 + 10, gc = 4
  assert.deepEqual(r.totalMs, { js: 16, gc: 4 });
  assert.deepEqual(r.perFrameMs, { js: 8, gc: 2 });
});
test("mainThreadStages: no frames -> empty", () => assert.deepEqual(mainThreadStages([]), { frames: 0, totalMs: {}, perFrameMs: {} }));
test("topCause and keepTraceEvent", () => {
  assert.equal(topCause({ js: 3, gc: 9 }), "gc"); assert.equal(topCause({}), null);
  assert.equal(keepTraceEvent({ ph: "X", name: "x", dur: 100 }), false);
  assert.equal(keepTraceEvent({ ph: "X", name: "MinorGC", dur: 100 }), true);
  assert.equal(keepTraceEvent({ ph: "M", name: "process_name" }), true);
});
