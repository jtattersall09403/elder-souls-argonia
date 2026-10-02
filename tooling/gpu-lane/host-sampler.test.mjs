import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coreCorrelation, coreCorrelationText, hostSeries, parseSamplerLine, THREAD_AWK } from "./host-sampler.mjs";


test("THREAD_AWK picks main threads by tid==pid with every comm 'chrome'", () => {
  // expected, written first: renderer 200 (busier) main = task 200, core 5, 2 threads busy (200 +20ms, 201 +30ms; 202 +10ms not (jiffies are 10 ms));
  // renderer 100 (idle keeper) loses; GPU main = task 300, core 9; non-main GPU thread 301 ignored.
  const d = mkdtempSync(join(tmpdir(), "hs-"));
  const stat = (tid, ut, core) => `${tid} (chrome) S 1 1 1 0 -1 0 0 0 0 0 ${ut} 0 0 0 20 0 1 0 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${core} 0 0 0`;
  const mk = (pid, tid, line) => { mkdirSync(join(d, "proc", String(pid), "task", String(tid)), { recursive: true }); writeFileSync(join(d, "proc", String(pid), "task", String(tid), "stat"), line + "\n"); };
  mk(100, 100, stat(100, 5, 1)); mk(200, 200, stat(200, 12, 5)); mk(200, 201, stat(201, 6, 6)); mk(200, 202, stat(202, 2, 7)); mk(300, 300, stat(300, 4, 9)); mk(300, 301, stat(301, 50, 2));
  writeFileSync(join(d, "prev"), "100 5\n200 10\n201 3\n202 1\n");
  writeFileSync(join(d, "pids"), "100 R\n200 R\n300 G\n");
  const awk = THREAD_AWK.replaceAll("/proc/", d + "/proc/").replace('"/proc/cpuinfo"', '"/dev/null"').replaceAll("/sys/", d + "/sys/");
  writeFileSync(join(d, "a.awk"), awk);
  const files = [[100, 100], [200, 200], [200, 201], [200, 202], [300, 300], [300, 301]].map(([p, t]) => join(d, "proc", String(p), "task", String(t), "stat"));
  const out = execFileSync("awk", ["-f", join(d, "a.awk"), join(d, "prev"), join(d, "pids"), ...files], { encoding: "utf8" }).trim().split("\n").at(-1).split(" ");
  rmSync(d, { recursive: true });
  assert.equal(out.length, 14);
  assert.deepEqual([out[0], out[1], out[7], out[8], out[12], out[13]], ["200", "5", "300", "9", "200", "2"]);
});

test("parseSamplerLine: 24-token line carries the thread columns, '-' is null", () => {
  const r = parseSamplerLine("1 2 3 0.5 4 100 90 2400 3000 - 77 12 3100 5000000 2000000 1 4 88 30 2500 100000 3000 77 6");
  assert.deepEqual(r.slice(10), [77, 12, 3100, 5000000, 2000000, 1, 4, 88, 30, 2500, 100000, 3000, 77, 6]);
  const d = parseSamplerLine("1 2 3 0.5 4 100 90 2400 3000 - - - - - - - - - - - - - - -");
  assert.deepEqual(d.slice(10), Array(14).fill(null));
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
