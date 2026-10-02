// Tests for probes/relink.js (no per-draw wrap at steady state, warm materials from compile arguments,
// the `first` tag, the per-material warm keys),
// the post-GC heap probe split and the --trace-gpu option. RELINK_PROBE=<file URL> runs the probe tests
// against another copy of the probe (standard 14: seen to fail on the old code).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

const probeUrl = process.env.RELINK_PROBE ? new URL(process.env.RELINK_PROBE) : new URL("./probes/relink.js", import.meta.url);

function page() {
  class GL { shaderSource() {} attachShader() {} linkProgram() {} }
  // One fake timer slot: fire() runs the pending idle timeout (the hook's disarm).
  const timer = { fn: null, fire() { const f = this.fn; this.fn = null; f?.(); } };
  const win = { WebGL2RenderingContext: GL, setTimeout: (f) => { timer.fn = f; return 1; }, clearTimeout: () => { timer.fn = null; } };
  const ctx = vm.createContext({ window: win, performance: { now: () => 1 }, Object, Array, String, WeakMap, WeakSet, Set, Map, Math, Promise });
  vm.runInContext(readFileSync(probeUrl, "utf8"), ctx);
  return { win, gl: new GL(), timer };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const scene = (...mats) => ({ children: mats.map((material) => ({ material, children: [] })) });

test("no per-draw wrap at steady state: properties.get never wrapped, renderBufferDirect is three's own once links stop", async () => {
  const { win, gl, timer } = page();
  const getOrig = (x) => x;
  const R = { properties: { get: getOrig }, compile() { this.during = this.properties.get; } };
  const rbd = function () { gl.linkProgram({}); };
  R.renderBufferDirect = rbd;
  await tick();
  R.compile(scene());
  assert.equal(R.during, getOrig, "properties.get is not wrapped inside a compile");
  assert.equal(R.properties.get, getOrig);
  assert.notEqual(R.renderBufferDirect, rbd, "armed while links happen (load)");
  timer.fire();
  assert.equal(R.renderBufferDirect, rbd, "idle: three's own function, nothing per draw");
  assert.equal(win.__DIAG__.relinkHookArmed(), false);
  gl.linkProgram({}); // a link while disarmed re-arms
  assert.notEqual(R.renderBufferDirect, rbd);
  assert.equal(win.__DIAG__.relink().events.at(-1)[3].owner, "(outside draw)");
});

test("warm materials come from the compile arguments (arrays, nested, overrideMaterial); a draw of an unwarmed material is `first`", async () => {
  const { win, gl } = page();
  const M = (uuid, name = "") => ({ isMaterial: true, uuid, name, type: "M", defines: {} });
  const a = M("aaaa-1", "A"), b = M("bbbb-1", "B"), o = M("oooo-1", "O"), cold = M("cccc-1");
  const R = { info: { programs: [] } };
  R.renderBufferDirect = function () { gl.linkProgram({}); };
  const sc = { overrideMaterial: o, children: [{ material: [a], children: [{ material: b, children: [] }] }] };
  R.compileAsync = function () { gl.linkProgram({}); return new Promise(() => {}); }; // never settles
  await tick();
  R.compileAsync(sc, { isCamera: true, material: cold });
  for (const m of [a, b, o, cold]) R.renderBufferDirect(null, null, null, m, { name: "x" });
  const ev = JSON.parse(JSON.stringify(win.__DIAG__.relink().events));
  assert.equal(ev[0][3].warm, true);
  assert.equal(ev[1][3].warm, false, "warm ends with the sync call, the pending promise does not hold it");
  assert.deepEqual(ev.slice(1).map((e) => e[3].first ?? false), [false, false, false, true]);
});

test("every warm key per material is kept; a draw key outside them lists every differing field vs the nearest warm key", async () => {
  const { win, gl } = page();
  const mat = { isMaterial: true, uuid: "uuid-1234567", type: "M", defines: {}, customProgramCacheKey: () => "" };
  const R = { info: { programs: [] }, properties: { get: (x) => x } };
  const link = (k) => { const p = {}; R.info.programs.push({ program: p, cacheKey: k }); gl.linkProgram(p); };
  R.compile = function () { link("a,1,x,9"); link("a,2,y,9"); };
  R.renderBufferDirect = function () { link("a,2,x,7,z"); };
  await tick();
  R.compile(scene(mat));
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
  R.compile = function () { link("k1"); link("k2"); };
  R.renderBufferDirect = function () { link("k2"); };
  await tick();
  R.compile(scene(mat));
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
