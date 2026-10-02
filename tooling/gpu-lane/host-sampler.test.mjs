import test from "node:test";
import assert from "node:assert/strict";
import { coreCorrelation, coreCorrelationText, hostSeries, parseSamplerLine } from "./host-sampler.mjs";


test("parseSamplerLine: 22-token line carries the thread columns, '-' is null", () => {
  const r = parseSamplerLine("1 2 3 0.5 4 100 90 2400 3000 - 77 12 3100 5000000 2000000 1 4 88 30 2500 100000 3000");
  assert.deepEqual(r.slice(10), [77, 12, 3100, 5000000, 2000000, 1, 4, 88, 30, 2500, 100000, 3000]);
  const d = parseSamplerLine("1 2 3 0.5 4 100 90 2400 3000 - - - - - - - - - - - - -");
  assert.deepEqual(d.slice(10), Array(12).fill(null));
  assert.equal(parseSamplerLine("1 2 3 0.5 4 100 90 2400 3000 - 1 2"), null);
});

test("hostSeries thread deltas: same tid only, ns -> ms, throttled usec -> ms", () => {
  const o = 1000;
  const row = (e, tid, core, mhz, run, wait, mig, nv, gt, gw, th) => [o + e, 0, 0, 1, 1, 100, 50, 1, 2, "-", tid, core, mhz, run, wait, mig, nv, gt, 9, 2000, gw, th];
  const rows = [row(0, 7, 3, 3000, 0, 0, 0, 0, 5, 0, 0), row(100, 7, 4, 1500, 8e6, 2e6, 1, 3, 5, 1e6, 4000), row(200, 8, 5, 2000, 9e6, 9e6, 5, 5, 5, 3e6, 4000)];
  rows.meta = { cpuset: "0-111", governor: "performance", maxMhzDistinct: [3400] };
  const s = hostSeries(rows, o);
  assert.deepEqual([s.cpuset, s.governor, s.maxMhzDistinct], ["0-111", "performance", [3400]]);
  assert.deepEqual(s.core, [4, 5]);
  assert.deepEqual(s.coreMhz, [1500, 2000]);
  assert.deepEqual(s.runMs, [8, null]);
  assert.deepEqual(s.waitMs, [2, null]);
  assert.deepEqual(s.migr, [1, null]);
  assert.deepEqual(s.nvcsw, [3, null]);
  assert.deepEqual(s.gpuWaitMs, [1, 2]);
  assert.deepEqual(s.throttledMs, [4, 0]);
});

test("coreCorrelation: long (work >= 12) vs normal frames matched to the covering sample", () => {
  // samples end at 100,200,300; interval (prev,own]
  const host = { t: [100, 200, 300], core: [1, 2, 3], coreMhz: [3000, 1500, 3000], waitMs: [0, 4, 0], migr: [0, 1, 0], throttledMs: [0, 10, 0] };
  // frames: t=50 normal (sample0), t=150 long (sample1), t=250 normal (sample2), t=190 long (sample1), t=400 outside
  const series = { t: [50, 150, 190, 250, 400], dt: [16, 16, 16, 16, 16], work: [5, 12, 30, 6, 40], gpu: [null, null, null, null, null] };
  const c = coreCorrelation(series, host);
  assert.deepEqual(c.long, { n: 2, coreMhz: 1500, migrPct: 100, waitMs: 4, throttledMs: 10 });
  assert.deepEqual(c.normal, { n: 2, coreMhz: 3000, migrPct: 0, waitMs: 0, throttledMs: 0 });
  assert.deepEqual(c.longFrames, [[150, 12, 2, 1500, 4, 1, 10], [190, 30, 2, 1500, 4, 1, 10]]);
  assert.equal(coreCorrelationText("a settled", c), "a settled core: long n=2 mhz 1500 vs 3000, migr 100% vs 0%, wait 4 vs 0 ms, throttled 10 vs 0 ms");
  assert.equal(coreCorrelation(series, null), null);
});
