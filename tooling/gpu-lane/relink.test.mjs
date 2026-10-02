// Tests for probes/relink.js (the compile-only properties.get wrap and the per-material warm keys),
// the post-GC heap probe split and the --trace-gpu option. RELINK_PROBE=<file URL> runs the probe tests
// against another copy of the probe (standard 14: seen to fail on the old code).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

const probeUrl = process.env.RELINK_PROBE ? new URL(process.env.RELINK_PROBE) : new URL("./probes/relink.js", import.meta.url);

function page() {
  class GL { shaderSource() {} attachShader() {} linkProgram() {} }
  const win = { WebGL2RenderingContext: GL };
  const ctx = vm.createContext({ window: win, performance: { now: () => 1 }, Object, Array, String, WeakMap, Map, Math, Promise });
  vm.runInContext(readFileSync(probeUrl, "utf8"), ctx);
  return { win, gl: new GL() };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

test("properties.get is wrapped only inside compile / compileAsync", async () => {
  const { gl } = page();
  const orig = function (x) { return x; };
  const R = { properties: { get: orig }, compile() { this.during = this.properties.get; },
    compileAsync() { this.duringAsync = this.properties.get; return this.pending; } };
  R.renderBufferDirect = function () { gl.linkProgram({}); };
  await tick();
  assert.equal(R.properties.get, orig, "no wrap outside a compile");
  R.compile();
  assert.notEqual(R.during, orig, "wrapped while compile runs");
  assert.equal(R.properties.get, orig, "original restored after compile returns");
  let settle; R.pending = new Promise((r) => { settle = r; });
  const p = R.compileAsync();
  assert.notEqual(R.properties.get, orig, "still wrapped while compileAsync is pending");
  settle(); await p; await tick();
  assert.equal(R.properties.get, orig, "original restored once the promise settles");
});

test("every warm key per material is kept; a draw key outside them lists every differing field vs the nearest warm key", async () => {
  const { win, gl } = page();
  const mat = { isMaterial: true, uuid: "uuid-1234567", type: "M", defines: {}, customProgramCacheKey: () => "" };
  const R = { info: { programs: [] }, properties: { get: (x) => x } };
  const link = (k) => { const p = {}; R.info.programs.push({ program: p, cacheKey: k }); gl.linkProgram(p); };
  R.compile = function () { this.properties.get(mat); link("a,1,x,9"); link("a,2,y,9"); };
  R.renderBufferDirect = function () { link("a,2,x,7,z"); };
  await tick();
  R.compile();
  R.renderBufferDirect(null, null, null, mat, { name: "o" });
  R.renderBufferDirect(null, null, null, mat, { name: "o" }); // same draw key again: no duplicate row
  const m = JSON.parse(JSON.stringify(win.__DIAG__.relink().materials["uuid-123"]));
  assert.equal(m.warmHashes.length, 2);
  assert.equal(m.drawHashes.length, 1);
  assert.equal(m.same, false);
  assert.equal(m.mismatches.length, 1);
  const x = m.mismatches[0];
  assert.ok(m.warmHashes.includes(x.nearestWarmHash));
  // nearest is "a,1,x,9" (differs at index 1, 3, 4) vs "a,2,y,9" (index 2, 3, 4): tie, first wins
  assert.deepEqual(x.diffs.map((d) => d.index), [1, 3, 4]);
  assert.deepEqual(x.diffs[0], { index: 1, warm: "1", draw: "2" });
  assert.deepEqual(x.diffs[2], { index: 4, warm: "", draw: "z" });
});

test("a draw key equal to one of several warm keys is not a mismatch", async () => {
  const { win, gl } = page();
  const mat = { isMaterial: true, uuid: "uuid-aaaaaaa", type: "M", defines: {}, customProgramCacheKey: () => "" };
  const R = { info: { programs: [] }, properties: { get: (x) => x } };
  const link = (k) => { const p = {}; R.info.programs.push({ program: p, cacheKey: k }); gl.linkProgram(p); };
  R.compile = function () { this.properties.get(mat); link("k1"); link("k2"); };
  R.renderBufferDirect = function () { link("k2"); };
  await tick();
  R.compile();
  R.renderBufferDirect(null, null, null, mat, {});
  const m = JSON.parse(JSON.stringify(win.__DIAG__.relink().materials["uuid-aaa"]));
  assert.equal(m.same, true);
  assert.deepEqual(m.mismatches, []);
});

test("heap is read post-GC by measure.mjs: no in-page heap probe, no performance.memory series", async () => {
  const { INPAGE_PROBES, PROBES } = await import("./checks.mjs");
  assert.ok(PROBES.includes("heap"));
  assert.ok(!INPAGE_PROBES.includes("heap"));
  assert.equal(existsSync(new URL("./probes/heap.js", import.meta.url)), false);
  for (const n of INPAGE_PROBES) assert.ok(existsSync(new URL(`./probes/${n}.js`, import.meta.url)), n);
});

test("--trace-gpu: parseArgs turns trace on; GPU events of any duration are kept inside long frames and the top 5 are listed", async () => {
  const { parseArgs } = await import("./measure.mjs");
  const o = parseArgs(["--run", "r", "--url", "?a=1", "--trace-gpu"]);
  assert.equal(o.traceGpu, true);
  assert.equal(o.trace, true);
  assert.equal(parseArgs(["--run", "r", "--url", "?a=1", "--trace"]).traceGpu, false);
  const { classifyFrames, gpuEventsInSpans, isGpuCategoryEvent, GPU_TRACE_CATEGORIES, TRACE_CATEGORIES } = await import("./trace-frames.mjs");
  assert.ok(GPU_TRACE_CATEGORIES.includes("disabled-by-default-gpu.service") && GPU_TRACE_CATEGORIES.includes("gpu.angle"));
  assert.ok(!TRACE_CATEGORIES.includes("gpu.angle"));
  const fa = (ts) => ({ name: "FireAnimationFrame", ph: "X", pid: 1, tid: 1, ts, dur: 1000 });
  const g = (name, ts, dur) => ({ name, cat: "disabled-by-default-gpu.service", ph: "X", pid: 2, tid: 5, ts, dur, args: { n: name } });
  const gpu = [g("A", 20000, 100), g("B", 21000, 300), g("C", 22000, 50), g("D", 23000, 400), g("E", 24000, 10), g("F", 25000, 20), g("outside", 90000, 5)];
  assert.ok(isGpuCategoryEvent(gpu[0]));
  const ev = [{ ph: "M", name: "process_name", pid: 2, args: { name: "GPU Process" } }, fa(0), fa(10000), fa(60000), fa(70000), fa(130000), ...gpu];
  const r = classifyFrames(ev, { gpuAnyDur: true });
  assert.equal(r.long.length, 1);
  assert.deepEqual(r.long[0].gpuTop.map((e) => e.name), ["D", "B", "A", "C", "F"]);
  assert.match(r.long[0].gpuTop[0].args, /"n":"D"/);
  assert.equal(classifyFrames(ev).long[0].gpuTop, undefined, "off without the option");
  const kept = gpuEventsInSpans(gpu, new Set([2]), r.long.map((f) => f.spanUs));
  assert.deepEqual(kept.map((e) => e.name), ["A", "B", "C", "D", "E", "F"], "the event outside the long frame is dropped");
});
