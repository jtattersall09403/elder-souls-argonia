// node --test tooling/gpu-lane/pod-capture-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { onePercentLow, parseSteps, counter, heapSlope, isStalled, lumaRatios, parseProfile, parseShots, screenMiddle, shotSchedule, stalledReads, summariseProfile , settleGate, shotSettle, summariseView, parseViews, browserStoppedAnswering, podSetupCommand, aimJs, HUD_HIDE_JS, HUD_SHOW_JS, viewDeadlineS, installGpuErrorProbe, gpuProbeLine } from "./pod-capture-lib.mjs";

const img = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([...f(x, y), 255], (y * w + x) * 4); return d; };

test("screenMiddle: black middle, bright HUD edges ignored", () => {
  const d = img(100, 100, (x, y) => (x >= 30 && x < 70 && y >= 40 && y < 90 ? [0, 0, 0] : [255, 255, 255]));
  assert.deepEqual(screenMiddle(d, 100, 100), { luma: 0, blackShare: 1 });
});
test("screenMiddle: half dark, grey luma", () => {
  const d = img(100, 100, (x) => (x < 50 ? [2, 2, 2] : [100, 100, 100]));
  const r = screenMiddle(d, 100, 100);
  assert.equal(r.blackShare, 0.5); assert.equal(r.luma, 51);
});
test("counter dedupes with counts, most frequent first", () => {
  const c = counter(5); ["a", "b", "b", "abcdefg", "abcdeXX"].forEach(c.add);
  assert.deepEqual(c.list(), [["b", 2], ["abcde", 2], ["a", 1]]);
});
test("default schedule: 500 ms to 60 s then 2 s to 120 s", () => {
  const s = shotSchedule();
  assert.equal(s.length, 120 + 31); assert.equal(s[1], 0.5); assert.equal(s[119], 59.5); assert.equal(s[120], 60); assert.equal(s.at(-1), 120);
});
test("schedule clipped by a short run and parsed from flags", () => {
  assert.deepEqual(parseShots("1000@2,5000", 10), [0, 1, 2, 7]);
  assert.deepEqual(parseShots(undefined, 1), [0, 0.5, 1]);
  assert.throws(() => parseShots("bad", 10));
  assert.deepEqual(parseProfile("10@60"), { seconds: 10, at: 60 });
});
test("summariseProfile attributes self and total time", () => {
  const cf = (n) => ({ functionName: n, url: "http://x/a.js", lineNumber: 1, columnNumber: 2 });
  const p = { nodes: [{ id: 1, callFrame: cf("root"), children: [2] }, { id: 2, callFrame: cf("leaf") }], samples: [2, 2, 1], timeDeltas: [1000, 2000, 3000], startTime: 0, endTime: 6000 };
  const s = summariseProfile(p);
  assert.deepEqual(Object.fromEntries(s.selfTop), { "root @ a.js:1:2": 3, "leaf @ a.js:1:2": 3 });
  assert.equal(s.totalTop[0][1], 6); assert.equal(s.totalMs, 6);
});

test("heapSlope: starts after buffer/texture counts are quiet, ignores the streaming ramp", () => {
  const s = [];
  for (let t = 0; t < 30; t++) s.push({ s: t, heapMB: 100 + t * 20, buffers: t, textures: t }); // streaming: +1200 MB/min
  for (let t = 30; t < 90; t++) s.push({ s: t, heapMB: 700 + (t - 30) * 0.1, buffers: 30, textures: 30 }); // settled: +6 MB/min
  const r = heapSlope(s);
  assert.equal(r.quietAt, 30);
  assert.equal(r.mbPerMin, 6);
  assert.equal(heapSlope(s.slice(0, 40)).mbPerMin, null); // too few quiet seconds
});

test("isStalled: advance, hold, unreadable", () => {
  assert.equal(isStalled(10, 70), false);
  assert.equal(isStalled(10, 10), true);
  assert.equal(isStalled(undefined, 5), true);
  assert.equal(isStalled(5, NaN), true);
});
test("stalledReads lists stalled keys and final", () => {
  assert.deepEqual(stalledReads({ 15: { stalled: false }, 30: { stalled: true } }, { stalled: true }), ["30", "final"]);
  assert.deepEqual(stalledReads({ 15: {} }, {}), []);
});
test("lumaRatios: per read, null on missing or zero compare", () => {
  const r = lumaRatios({ 15: { luma: 10 }, 30: { luma: 5 }, 60: { luma: 4 } }, { 15: { luma: 20 }, 30: { luma: 0 } }, { luma: 9 }, { luma: 3 });
  assert.deepEqual(r, { 15: 0.5, 30: null, 60: null, final: 3 });
});

test("parseSteps: sorted by at, rejects missing js", () => {
  const s = parseSteps(JSON.stringify([{ at: 20, label: "b", js: "2" }, { at: 5, label: "a", js: "1", waitMs: 100 }]));
  assert.deepEqual(s.map((x) => x.at), [5, 20]);
  assert.throws(() => parseSteps(JSON.stringify([{ at: 1, label: "x" }])), /js/);
  assert.throws(() => parseSteps(JSON.stringify([{ at: "1", js: "x" }])), /at/);
  assert.throws(() => parseSteps("{}"), /array/);
});

test("onePercentLow: slowest 1 % mean as fps; empty is null", () => {
  assert.equal(onePercentLow([...Array(99).fill(16.7), 100]), 10);
  assert.equal(onePercentLow([]), null);
});

test("settleGate: reads once, N frames after 5 s at 0 pending, never before the floor", () => {
  const g = settleGate(300, 20);
  const fire = [];
  for (let s = 0; s <= 40; s++) if (g.feed(s, { p: s < 8 ? 3 : 0, g: 10 }, s * 60)) fire.push(s);
  assert.deepEqual(fire, [25]); // gate at 20 s (floor; zero since 8 s), frame 1200 + 300 = 1500 at 25 s
  assert.equal(g.settledAt, 8);
});
test("settleGate: a build with no queue counts as 0 pending; pending resets the wait", () => {
  const g = settleGate(60, 0);
  const fire = [];
  for (let s = 0; s <= 20; s++) if (g.feed(s, { p: s === 4 ? 1 : undefined, g: 5 }, s * 60)) fire.push(s);
  assert.deepEqual(fire, [11]); // zero again from 5 s, gate at 10 s (frame 600), +60 frames at 11 s
});

test("parseViews: inline steps sorted, bad shapes refused", async () => {
  const { parseViews } = await import("./pod-capture-lib.mjs");
  const v = parseViews(JSON.stringify([{ name: "A-webgpu", url: "http://h/x", steps: [{ at: 30, js: "1" }, { at: 10, js: "2" }] }, { name: "B", url: "http://h/y" }]));
  assert.deepEqual(v[0].steps.map((s) => s.at), [10, 30]); assert.deepEqual(v[1].steps, []);
  assert.throws(() => parseViews("[]"), /non-empty/);
  assert.throws(() => parseViews(JSON.stringify([{ name: "a/b", url: "http://h" }])), /name/);
  assert.throws(() => parseViews(JSON.stringify([{ name: "a", url: "http://h" }, { name: "a", url: "http://h" }])), /duplicate/);
  assert.throws(() => parseViews(JSON.stringify([{ name: "a", url: "h" }])), /url/);
  assert.throws(() => parseViews(JSON.stringify([{ name: "a", url: "http://h", steps: [{ at: 1 }] }])), /js/);
});
test("capVerdict: a blank page at 58.5 fps is capped, at 240 it is not", async () => {
  const { capVerdict } = await import("./pod-capture-lib.mjs");
  assert.deepEqual(capVerdict(58.5), { blankRafFps: 58.5, capDetected: true });
  assert.deepEqual(capVerdict(240.04), { blankRafFps: 240, capDetected: false });
  assert.deepEqual(capVerdict(NaN), { blankRafFps: null, capDetected: null });
});
test("summaryTable: header, cap line and one row per view with dashes for missing values", async () => {
  const { summaryTable } = await import("./pod-capture-lib.mjs");
  const t = summaryTable([{ name: "A", summary: { lumaSettled: 40.123, tris: 940000, fps: 59 } }, { name: "B" }], { capDetected: false, blankRafFps: 240 }).split("\n");
  assert.equal(t[0], "cap detected: false (blank-page rAF 240 fps)");
  assert.equal(t.length, 6);
  assert.match(t[4], /^\| A \| - \| - \| 40\.12 \| - \| - \| - \| 59 \|.*\| 0\.94 \|/);
  assert.match(t[5], /^\| B( \| -)+ \|$/);
});
test("the iter7 views file parses: A, B, D x webgpu, webgl backend, studio, plus B-webgpu-diag", async () => {
  const { parseViews } = await import("./pod-capture-lib.mjs");
  const { readFileSync } = await import("node:fs");
  const v = parseViews(readFileSync(new URL("./views/webgpu10-iter7.json", import.meta.url), "utf8"));
  assert.equal(v.length, 10);
  assert.equal(v.filter((x) => x.url.includes("renderer=webgl")).length, 3);
  assert.equal(v.find((x) => x.name === "B-webgpu-diag").steps.length, 3);
});
test("contaminationVerdict: slow blank rAF or a retained heap flags the view", async () => {
  const { contaminationVerdict } = await import("./pod-capture-lib.mjs");
  assert.deepEqual(contaminationVerdict({ rafFps: 240, heapMB: 2 }, 240), { contaminated: false, reasons: [] });
  assert.equal(contaminationVerdict({ rafFps: 227, heapMB: 2 }, 240).contaminated, true);
  assert.equal(contaminationVerdict({ rafFps: 229, heapMB: 2 }, 240).contaminated, false);
  assert.deepEqual(contaminationVerdict({ rafFps: 240, heapMB: 1579 }, 240).reasons, ["heap 1579 MB > 50"]);
  assert.equal(contaminationVerdict({ rafFps: null, heapMB: null }, 240).contaminated, false);
});
test("prepSummary: steps and start-to-first-capture; the summary carries the line", async () => {
  const { prepSummary, summaryTable } = await import("./pod-capture-lib.mjs");
  const p = prepSummary('{"step":"build:webgpu","seconds":15,"at":1000}\n{"step":"sync:dev","seconds":0,"at":1001,"skipped":true}\n{"step":"serve","seconds":5,"at":1020}\n', 1100);
  assert.equal(p.toFirstCaptureS, 115);
  assert.equal(prepSummary("", 1), null);
  assert.match(summaryTable([], null, p).split("\n")[1], /^prep: build:webgpu 15 s, sync:dev skip, serve 5 s; start to first capture 115 s$/);
});
test("parseViews: absolute URLs and the plain flag", () => {
  const v = parseViews(JSON.stringify([{ name: "fire", url: "https://threejs.org/examples/webgpu_volume_fire.html", plain: true, seconds: 30 }]));
  assert.equal(v[0].plain, true);
  assert.throws(() => parseViews(JSON.stringify([{ name: "a", url: "http://x/", plain: "yes" }])), /plain/);
});
test("browserStoppedAnswering: timeouts and dropped sockets, not answered errors", () => {
  assert.ok(browserStoppedAnswering(new Error("Target.createBrowserContext timed out")));
  assert.ok(browserStoppedAnswering("HeapProfiler.collectGarbage timed out"));
  assert.ok(!browserStoppedAnswering(new Error("Page.navigate: Cannot navigate to invalid URL")));
});
test("podSetupCommand runs pod-setup.sh over the pod ssh", () => {
  assert.equal(podSetupCommand("ssh -i /tmp/k -p 2222 root@1.2.3.4", "webgpu"),
    "ssh -i /tmp/k -p 2222 -o StrictHostKeyChecking=no root@1.2.3.4 bash /root/site/tooling/gpu-lane/pod-setup.sh webgpu");
});
test("parseViews: clean and aim", () => {
  const v = parseViews(JSON.stringify([{ name: "a", url: "http://x/", clean: true, aim: [1.57, 0.2] }]));
  assert.deepEqual(v[0].aim, [1.57, 0.2]);
  assert.throws(() => parseViews(JSON.stringify([{ name: "a", url: "http://x/", aim: [1, 2, 3] }])), /aim/);
  assert.throws(() => parseViews(JSON.stringify([{ name: "a", url: "http://x/", clean: 1 }])), /clean/);
});
test("aimJs calls aimCamera once the debug hook exists", () => {
  const calls = []; const window = {};
  const run = (js) => new Function("window", `return ${js}`)(window);
  assert.equal(run(aimJs([0.5, -0.1])), false);
  window.__STUDIO_CHARACTER_DEBUG__ = { aimCamera: (...a) => calls.push(a) };
  assert.equal(run(aimJs([0.5, -0.1])), true); run(aimJs([2]));
  assert.deepEqual(calls, [[0.5, -0.1], [2]]);
});
test("HUD hide keeps the marked render canvas, not the largest; hides the rest; fails on a resize", () => {
  const el = (tag = "DIV", w = 0, ctx = null) => ({ style: { visibility: "", overflow: "" }, dataset: {}, tagName: tag, width: w, height: w, clientWidth: w, clientHeight: w, contains: () => false, marked: ctx === "render" });
  // walk-10 vol smoke 2: the 2D province preview canvas (2048) is larger than the render canvas (512)
  const main = el("CANVAS", 512, "render"), map = el("CANVAS", 2048, "2d"), mini = el("CANVAS", 200, "2d"), hud = el(), wrap = el(), page = el();
  wrap.contains = (x) => x === main;
  const html = el(), body = el();
  const window = {}, document = { documentElement: html, body, querySelector: (q) => (q === "canvas[data-render-canvas]" ? [map, mini, main].find((c) => c.marked) ?? null : null), querySelectorAll: () => [page, map, hud, wrap, mini, main] };
  const run = (js) => new Function("window", "document", `return ${js}`)(window, document);
  const r = run(HUD_HIDE_JS);
  assert.equal(r.ok, true); assert.equal(r.hidden, 4); assert.deepEqual(r.after, [512, 512, 512, 512]);
  for (const e of [map, mini, hud, page]) assert.equal(e.style.visibility, "hidden");
  assert.equal(wrap.style.visibility, ""); assert.equal(main.style.visibility, "");
  assert.equal(html.style.overflow, "hidden"); assert.equal(body.style.overflow, "hidden");
  run(HUD_SHOW_JS); assert.equal(map.style.visibility, ""); assert.equal(body.style.overflow, "");
  // a hide that resizes the render canvas fails loudly
  Object.defineProperty(body.style, "overflow", { set() { main.clientWidth = 600; }, get() { return ""; } });
  const bad = run(HUD_HIDE_JS); assert.equal(bad.ok, false); assert.match(bad.err, /size changed/);
  run(HUD_SHOW_JS);
  // no marked render canvas: not ok, nothing hidden
  main.marked = false;
  assert.deepEqual(run(HUD_HIDE_JS), { ok: false, hidden: 0, err: "no canvas[data-render-canvas]" });
});

test("ancestorPids: walks /proc stat parents up to (not including) PID 1", async () => {
  const { ancestorPids } = await import("./pod-capture-lib.mjs");
  const stat = { 50: "50 (node x) S 40 1", 40: "40 (bash) S 7 1", 7: "7 (claude) S 1 1" };
  assert.deepEqual(ancestorPids(50, (p) => stat[p]), [50, 40, 7]);
});

test("heapTop: sums self size per function and sorts", async () => {
  const { heapTop } = await import("./pod-capture-lib.mjs");
  const f = (name, size, children = []) => ({ callFrame: { functionName: name, url: "a.js", lineNumber: 0, columnNumber: 4 }, selfSize: size, children });
  const t = heapTop({ head: f("(root)", 0, [f("g", 2e6, [f("h", 5e6)]), f("g", 1e6)]) }, 2);
  assert.deepEqual(t, [{ fn: "h a.js:1:5", selfMB: 5 }, { fn: "g a.js:1:5", selfMB: 3 }]);
});

test("summaryTable: failed column carries the view's failure reason", async () => {
  const { summaryTable } = await import("./pod-capture-lib.mjs");
  assert.match(summaryTable([{ name: "A", summary: { failed: "not-ready" } }], null).split("\n")[4], /^\| A \| not-ready \|/);
});

test("shotSettle: waits out a luma transient, opens once fps and luma are steady, times out otherwise", () => {
  const g = shotSettle({ seconds: 4, minS: 15, timeoutS: 40 });
  const luma = (s) => (s < 12 ? 100 : s < 22 ? 100 - 4 * (s - 12) : 60 + 3 * Math.min(s - 22, 5));
  let opened = null;
  for (let s = 1; s <= 40 && opened === null; s++) if (g.feed(s, 60, luma(s))) opened = s;
  assert.ok(opened >= 30 && opened < 40, `opened at ${opened}`); assert.equal(g.timedOut, false);
  const t = shotSettle({ seconds: 4, minS: 1, timeoutS: 10 });
  for (let s = 1; s <= 10; s++) t.feed(s, 10 * s, 100);
  assert.equal(t.at, 10); assert.equal(t.timedOut, true);
});
// series shaped on walk 10 vol r1 reads (result.json reads at 30/60/120/settled): halos fps ~31 with hitch reads at 4,
// int-brinas fps 162-227, mist-forced luma 1.73-1.97, mist-radiation luma ramping 14 -> 43 over 60 s
const runGate = (fps, luma, cfg = {}) => { const g = shotSettle({ minS: 30, timeoutS: 120, ...cfg }); for (let s = 1; s <= 120; s++) if (g.feed(s, fps(s), luma(s))) break; return g; };
test("shotSettle: a hitchy but steady series opens (r1 halos: 31 fps, one read in three at 4)", () => {
  const g = runGate((s) => (s % 3 === 0 ? 4 : 31 + (s % 2)), () => 14.7);
  assert.equal(g.timedOut, false); assert.ok(g.at <= 32, `at ${g.at}`);
  const i = runGate((s) => [162, 171, 227, 166, 175][s % 5], (s) => 70.4 + (s % 3) * 0.3);
  assert.equal(i.timedOut, false, "interior 162-227 fps");
});
test("shotSettle: a dark steady frame opens on the absolute luma floor (r1 mist-forced 1.73-1.97)", () => {
  const g = runGate(() => 15, (s) => 1.73 + (s % 4) * 0.08);
  assert.equal(g.timedOut, false);
  assert.equal(runGate(() => 15, (s) => 1.73 + (s % 4) * 0.08, { lumaFloor: 0.01 }).timedOut, true, "without the floor the same series fails");
});
test("shotSettle: a genuine exposure ramp holds the gate shut (r1 mist-radiation 14 -> 43 luma over 60 s)", () => {
  const g = runGate(() => 16, (s) => 14 + 0.5 * Math.min(s, 70));
  assert.ok(g.at >= 70 && !g.timedOut, `ramp ends at 70 s: opened at ${g.at}`);
  const f = runGate((s) => (s < 28 ? 8 : 16), () => 50);
  assert.ok(f.at >= 32 && !f.timedOut, `fps step at 28 s: opened at ${f.at}`);
});
test("summariseView: rates from the cost window, heap from the post-quiet slope, never a read at timeout", () => {
  const r = { reads: { settled: { fps: 4, gpuMs: { supported: true, avg: 99, cpu: 88, calls: 10 } } }, heapSlope: { mbPerMin: 1.8 },
    window: { work: { wallFps: 21.1, low1: 9, gpuFrameMs: { mean: 12.5 }, workMs: { mean: 37 }, costMs: { mean: 40 } }, heap: { fitMBPerMin: 451 } } };
  const s = summariseView(r);
  assert.deepEqual([s.from, s.fps, s.gpuMs, s.cpuMs, s.heapMbPerMin, s.calls], ["window", 21.1, 12.5, 37, 1.8, 10]);
  const u = summariseView({ final: { fps: 4 }, window: { unsettled: true, work: { wallFps: 7 } } });
  assert.deepEqual([u.from, u.fps, u.heapMbPerMin], ["unsettled", 7, null]);
  assert.equal(summariseView({ final: { fps: 4 } }).fps, null);
});
test("parseViews: readyFlag is a global name", () => {
  assert.equal(parseViews(JSON.stringify([{ name: "a", url: "http://x/", readyFlag: "__harnessReady" }]))[0].readyFlag, "__harnessReady");
  assert.throws(() => parseViews(JSON.stringify([{ name: "a", url: "http://x/", readyFlag: "a.b()" }])), /readyFlag/);
});
test("parseViews: settle false or a known config", () => {
  assert.equal(parseViews(JSON.stringify([{ name: "a", url: "http://x/", settle: false }]))[0].settle, false);
  assert.throws(() => parseViews(JSON.stringify([{ name: "a", url: "http://x/", settle: { wait: 3 } }])), /settle/);
});

test("needsChromeRestart: a stuck target or a failed context restarts Chrome; a live browser after a page error does not", async () => {
  const { needsChromeRestart } = await import("./pod-capture-lib.mjs");
  assert.equal(needsChromeRestart({ failed: "capture-timeout", targetStuck: true }, true), true);
  assert.equal(needsChromeRestart({ failed: "capture-timeout", targetStuck: false }, true), false);
  assert.equal(needsChromeRestart({ error: "Error: Target.createBrowserContext timed out" }, true), true);
  assert.equal(needsChromeRestart({ error: "Error: Target.createTarget: failed" }, true), true);
  assert.equal(needsChromeRestart({ error: "Error: Runtime.evaluate timed out" }, true), false);
  assert.equal(needsChromeRestart({ error: "Error: Runtime.evaluate timed out" }, false), true);
  assert.equal(needsChromeRestart({}, false), false);
});

import { pausedClockViews, backendFailure, cpuTop as cpuTopFn } from "./pod-capture-lib.mjs";
test("pausedClockViews names studio views without rate=, skips plain pages", () => {
  assert.deepEqual(pausedClockViews([{ name: "a", url: "http://x/?view=character&rate=0.5" }, { name: "b", url: "http://x/?view=character&t=12" }, { name: "c", url: "http://x/h.html", plain: true }]), ["b"]);
});
test("backendFailure: a WebGPU view on the WebGL backend is no-webgpu; others pass", () => {
  const v = { name: "a", url: "http://x/?renderer=webgpu&rate=0.5" };
  assert.equal(backendFailure(v, { reads: { settled: { backend: "webgl" } } }), "no-webgpu");
  assert.equal(backendFailure(v, { reads: { settled: { backend: "webgpu" } } }), null);
  assert.equal(backendFailure({ name: "b", url: "http://x/?renderer=webgl" }, { final: { backend: "webgl" } }), null);
  assert.equal(backendFailure({ ...v, url: "http://x/", expectBackend: "webgpu" }, { final: { backend: "webgl" } }), "no-webgpu");
  assert.equal(backendFailure(v, { failed: "not-ready", final: { backend: "webgl" } }), null);
});
test("cpuTop aggregates self time per url:line:col per frame from a fixture profile", () => {
  const cf = (functionName, url, lineNumber) => ({ functionName, url, lineNumber, columnNumber: 3 });
  const profile = { nodes: [{ id: 1, callFrame: cf("(root)", "", -1), children: [2, 3] }, { id: 2, callFrame: cf("draw", "http://h/assets/index.js", 10) }, { id: 3, callFrame: cf("cull", "http://h/assets/index.js", 20) }],
    samples: [2, 2, 3, 2, 1], timeDeltas: [1000, 1000, 500, 1000, 200] };
  const r = cpuTopFn(profile, 10, 2);
  assert.equal(r.sampledMs, 4);
  assert.deepEqual(r.top, [{ fn: "draw http://h/assets/index.js:10:3", selfMs: 3, msPerFrame: 0.3 }, { fn: "cull http://h/assets/index.js:20:3", selfMs: 0.5, msPerFrame: 0.05 }]);
  assert.match(summariseView({ window: { cpuTop: r } }).cpuTop, /^draw index\.js:10:3 0\.3; cull index\.js:20:3 0\.05$/);
});

test("viewDeadlineS: grows with the view's seconds, floor holds", () => {
  const o = { readyS: 90, windowS: 10, floorS: 180 };
  assert.equal(viewDeadlineS(360, o), 520);
  assert.equal(viewDeadlineS(120, o), 280);
  assert.equal(viewDeadlineS(30, o), 190);
  assert.equal(viewDeadlineS(30, { ...o, floorS: 600 }), 600);
});
// --probe-gpu-errors: a fake WebGPU API on a fake window
function fakeGpuWindow(renderer) {
  class GPUDevice { createShaderModule(d) { return { code: d.code }; } createRenderPipeline() { return {}; } createBindGroup() { return {}; } }
  class GPUBuffer { constructor(label, size) { this.label = label; this.size = size; } destroy() {} }
  class GPURenderPassEncoder { setPipeline() {} setVertexBuffer() {} setIndexBuffer() {} setBindGroup() {} draw() {} drawIndexed() {} drawIndirect() {} drawIndexedIndirect() {} }
  class GPUCommandEncoder { beginRenderPass() { return new GPURenderPassEncoder(); } }
  const win = { GPUDevice, GPUBuffer, GPURenderPassEncoder, GPUCommandEncoder, __RENDERER__: renderer };
  installGpuErrorProbe(win);
  const dev = new GPUDevice(), mod = dev.createShaderModule({ code: "@vertex fn main() {}" });
  const pipe = dev.createRenderPipeline({ label: "renderPipeline_BSX", vertex: { module: mod, entryPoint: "main", buffers: [
    { arrayStride: 12, attributes: [{ shaderLocation: 0, format: "float32x3", offset: 0 }] },
    { arrayStride: 64, stepMode: "instance", attributes: [{ shaderLocation: 1, format: "float32x4", offset: 0 }] }] } });
  const pass = new GPUCommandEncoder().beginRenderPass({ label: "main" });
  return { win, pass, pipe, GPUBuffer };
}
test("gpu-error probe: a draw with an unset vertex slot is dumped once per pipeline, with the three render object", () => {
  const at = {};
  const { win, pass, pipe, GPUBuffer } = fakeGpuWindow({ backend: { draw() { at.pass.drawIndexedIndirect(new GPUBuffer("indirect", 20), 40); }, get: () => ({}) } });
  at.pass = pass;
  assert.equal(win.__gpuErrorProbe.threeHooked, true);
  const old = new GPUBuffer("position", 120); old.destroy();
  pass.setPipeline(pipe); pass.setVertexBuffer(0, old, 0, 120);
  const ro = { object: { name: "BSX", type: "Mesh", id: 7, userData: { esGpuCull: true } }, geometry: { id: 3, attributes: { position: { id: 1, itemSize: 3, array: new Float32Array(3) } } },
    material: { name: "Mat.001", id: 9, type: "MeshStandardNodeMaterial" }, getCacheKey: () => "k1", getVertexBuffers: () => [{ name: "position" }], getAttributes: () => [{ name: "position" }] };
  win.__RENDERER__.backend.draw(ro); win.__RENDERER__.backend.draw(ro);
  const p = win.__gpuErrorProbe;
  assert.equal(p.dumps.length, 1);
  const d = p.dumps[0];
  assert.deepEqual(d.missing, [1]);
  assert.equal(d.kind, "drawIndexedIndirect"); assert.equal(d.args.indirectBuffer.label, "indirect"); assert.equal(d.args.offset, 40);
  assert.equal(d.pipeline.label, "renderPipeline_BSX"); assert.equal(d.pipeline.buffers[1].stepMode, "instance");
  assert.deepEqual(d.set.map((x) => [x.slot, x.buffer.label, x.buffer.destroyed]), [[0, "position", true]]);
  assert.equal(d.vertexWGSL, "@vertex fn main() {}");
  assert.equal(d.three.object.name, "BSX"); assert.deepEqual(d.three.object.userDataKeys, ["esGpuCull"]); assert.equal(d.three.cacheKey, "k1");
  assert.match(gpuProbeLine(p), /^not-a-bar; slot 1 missing renderPipeline_BSX obj BSX/);
});
test("gpu-error probe: every required slot set, no dump", () => {
  const { win, pass, pipe, GPUBuffer } = fakeGpuWindow();
  pass.setPipeline(pipe); pass.setVertexBuffer(0, new GPUBuffer("a", 12)); pass.setVertexBuffer(1, new GPUBuffer("b", 64));
  pass.drawIndexed(36, 2);
  assert.equal(win.__gpuErrorProbe.dumps.length, 0); assert.equal(win.__gpuErrorProbe.draws, 1);
  assert.match(gpuProbeLine(win.__gpuErrorProbe), /^not-a-bar; no unset slot in 1 draws/);
});
