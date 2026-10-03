// node --test tooling/gpu-lane/pod-capture-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { onePercentLow, parseSteps, counter, heapSlope, isStalled, lumaRatios, parseProfile, parseShots, screenMiddle, shotSchedule, stalledReads, summariseProfile , settleGate, shotSettle, summariseView, parseViews, browserStoppedAnswering, podSetupCommand, aimJs, HUD_HIDE_JS, HUD_SHOW_JS, installGpuErrorProbe, gpuProbeLine, installNanProbe, nanProbeLine, installDrawCensus, drawCensusLine, summaryTable, profileStartS, devHooksLine } from "./pod-capture-lib.mjs";

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
  assert.deepEqual(parseProfile("10@60"), { seconds: 10, at: 60, from: "nav" });
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
  assert.match(t[4], /^\| A \| - \| - \| - \| 40\.12 \| - \| - \| - \| 59 \|.*\| 0\.94 \|/);
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
test("prepDists: a source change after .srchash is stale and builds once; unchanged is fresh; the summary carries this run's rows", async () => {
  const { prepDists, prepLine, summaryTable, distNameOf } = await import("./pod-capture-lib.mjs");
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { execFileSync } = await import("node:child_process");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const wt = mkdtempSync(join(tmpdir(), "prep-")), git = (...a) => execFileSync("git", ["-C", wt, ...a], { encoding: "utf8" });
  git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t");
  mkdirSync(join(wt, "packages")); writeFileSync(join(wt, "packages/a.ts"), "1"); git("add", "-A"); git("commit", "-qm", "one");
  const keyOf = (n) => execFileSync("bash", [join(here, "build-dist.sh"), "--key", wt, n], { encoding: "utf8" }).trim();
  const srchash = { webgpu: keyOf("webgpu") }; // the dist was built from commit one
  const built = [];
  const run = () => prepDists({ names: ["webgpu"], head: git("rev-parse", "HEAD").trim(), keyOf, srchashOf: (n) => srchash[n] ?? null,
    build: (n) => { built.push(n); srchash[n] = keyOf(n); }, sync: () => ({ skipped: true }) });
  const fresh = run();
  assert.deepEqual(built, []); assert.deepEqual(fresh.steps.map((s) => [s.step, Boolean(s.fresh)]), [["build:webgpu", true], ["sync:webgpu", false]]);
  writeFileSync(join(wt, "packages/a.ts"), "2"); git("commit", "-qam", "two"); // a fix committed after the build
  const stale = run();
  assert.deepEqual(built, ["webgpu"]); assert.equal(stale.dists.webgpu.built, true); assert.equal(stale.dists.webgpu.key, srchash.webgpu);
  run(); assert.deepEqual(built, ["webgpu"]); // rebuilt once, then fresh again
  writeFileSync(join(wt, "docs.md"), "x"); assert.equal(keyOf("webgpu"), srchash.webgpu); // a non-source file keeps the key
  assert.throws(() => prepDists({ names: ["webgpu"], keyOf: () => "b", srchashOf: () => "a", build: () => { throw new Error("build-dist webgpu failed"); } }), /build-dist webgpu failed/);
  const lines = summaryTable([], null, stale).split("\n");
  assert.match(lines[1], new RegExp(`^HEAD [0-9a-f]{40}; source key webgpu ${srchash.webgpu.slice(0, 12)}$`));
  assert.match(lines[2], /^prep: build:webgpu [\d.]+ s, sync:webgpu skip; total [\d.]+ s$/);
  assert.match(prepLine(fresh), /prep: build:webgpu fresh, sync:webgpu skip/);
  assert.deepEqual(["https://x/elder-souls-argonia/webgpu/?a", "http://h/elder-souls-argonia/studio/", "http://h/elder-souls-argonia/harness/?sys=fire", "about:blank"].map(distNameOf), ["webgpu", "dev", "harness", null]);
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
  assert.deepEqual(run(HUD_HIDE_JS), { ok: false, hidden: 0, err: "no canvas[data-render-canvas] and no __RENDERER__.domElement" });
  // c10: a classic WebGLRenderer dev page marks no canvas; the renderer's own canvas is the render canvas
  window.__RENDERER__ = { domElement: main };
  const dev = run(HUD_HIDE_JS); assert.equal(dev.ok, true); assert.equal(dev.hidden, 4); run(HUD_SHOW_JS);
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
  const { win, pass, pipe, GPUBuffer } = fakeGpuWindow({ backend: { draw() { at.pass.drawIndexedIndirect(new GPUBuffer("indirect", 20), 40); }, get: (k) => (k === "pipeKey" ? { pipeline: at.pipe } : {}) } });
  at.pipe = pipe;
  at.pass = pass;
  assert.equal(win.__gpuErrorProbe.threeHooked, true);
  const old = new GPUBuffer("position", 120); old.destroy();
  pass.setPipeline(pipe); pass.setVertexBuffer(0, old, 0, 120);
  const ro = { object: { name: "BSX", type: "Mesh", id: 7, userData: { esGpuCull: true } }, geometry: { id: 3, attributes: { position: { id: 1, itemSize: 3, array: new Float32Array(3) } } },
    material: { name: "Mat.001", id: 9, type: "MeshStandardNodeMaterial" }, pipeline: "pipeKey", getCacheKey: () => "k1", getVertexBuffers: () => [{ name: "position" }], getAttributes: () => [{ name: "position" }] };
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
  // the failing draw's object and pipeline from the SAME backend.draw call
  assert.deepEqual(d.tuple, { sameCall: true, passPipelineLabel: "renderPipeline_BSX", materialName: "Mat.001", cacheKey: "k1", threePipelineLabel: "renderPipeline_BSX", threePipelineIsBound: true });
  assert.match(gpuProbeLine(p), /^not-a-bar; slot 1 missing renderPipeline_BSX obj BSX mat Mat\.001 three-pipeline renderPipeline_BSX/);
});
test("gpu-error probe: every required slot set, no dump", () => {
  const { win, pass, pipe, GPUBuffer } = fakeGpuWindow();
  pass.setPipeline(pipe); pass.setVertexBuffer(0, new GPUBuffer("a", 12)); pass.setVertexBuffer(1, new GPUBuffer("b", 64));
  pass.drawIndexed(36, 2);
  assert.equal(win.__gpuErrorProbe.dumps.length, 0); assert.equal(win.__gpuErrorProbe.draws, 1);
  assert.match(gpuProbeLine(win.__gpuErrorProbe), /^not-a-bar; no unset slot in 1 draws/);
});
test("gpu-error probe: destroyedInSubmit names the destroy stack only when a destroyed buffer is bound at submit", () => {
  class GPUBuffer { constructor(d) { this.label = d.label; this.size = d.size; this.usage = d.usage; } destroy() {} }
  class GPURenderPassEncoder { setBindGroup() {} setVertexBuffer() {} setIndexBuffer() {} drawIndexedIndirect() {} end() {} }
  class GPUComputePassEncoder { setBindGroup() {} end() {} }
  class GPUCommandEncoder { constructor(d) { this.label = d?.label ?? ""; } copyBufferToBuffer() {} beginRenderPass() { return new GPURenderPassEncoder(); } beginComputePass() { return new GPUComputePassEncoder(); } finish() { return {}; } }
  class GPUDevice { createBuffer(d) { return new GPUBuffer(d); } createBindGroup() { return {}; } createCommandEncoder(d) { return new GPUCommandEncoder(d); } }
  const submitted = [];
  class GPUQueue { submit(cbs) { submitted.push(cbs.length); } }
  let t = 0;
  const win = { GPUDevice, GPUBuffer, GPURenderPassEncoder, GPUComputePassEncoder, GPUCommandEncoder, GPUQueue, performance: { now: () => (t += 10) } };
  installGpuErrorProbe(win);
  const dev = new GPUDevice(), q = new GPUQueue();
  const live = dev.createBuffer({ label: "live", size: 64, usage: 72 }), doomed = dev.createBuffer({ label: "", size: 256, usage: 72 });
  const bg = dev.createBindGroup({ label: "bindGroup_lights", entries: [{ binding: 0, resource: { buffer: live } }, { binding: 1, resource: { buffer: doomed } }] });
  const frame = (label) => { const e = dev.createCommandEncoder({ label }); const p = e.beginRenderPass({}); p.setBindGroup(0, bg); p.end(); q.submit([e.finish()]); };
  const P = win.__gpuErrorProbe;
  frame("renderContext_6");
  assert.equal(P.destroyedInSubmit.length, 0); // bound but not destroyed: no record
  function disposeLights() { doomed.destroy(); }
  disposeLights();
  const other = dev.createCommandEncoder({ label: "compute" }); other.beginComputePass().setBindGroup(0, dev.createBindGroup({ entries: [{ binding: 0, resource: { buffer: live } }] })); q.submit([other.finish()]);
  assert.equal(P.destroyedInSubmit.length, 0); // destroyed buffer not bound by this encoder: no record
  for (let i = 0; i < 7; i++) frame("renderContext_6");
  assert.equal(P.destroyedInSubmitSeen, 7); assert.equal(P.destroyedInSubmit.length, 5); assert.equal(submitted.length, 9);
  const r = P.destroyedInSubmit[0];
  assert.equal(r.encoder, "renderContext_6"); assert.equal(r.buffers.length, 1);
  const b = r.buffers[0];
  assert.deepEqual([b.id, b.size, b.usage, b.via], [2, 256, 72, "bindGroup_lights"]);
  assert.match(b.destroyStack[0], /disposeLights/); assert.ok(b.createStack.length > 0); assert.ok(b.msDestroyToSubmit > 0);
  frame("renderContext_9"); // a new encoder label still gets its first record
  assert.equal(P.destroyedInSubmit.length, 6); assert.equal(P.destroyedInSubmit[5].encoder, "renderContext_9");
  // an indirect-args buffer destroyed after use, and a copy destination: each named by the call that bound it
  const args = dev.createBuffer({ label: "cullArgs", size: 20, usage: 256 }), dst = dev.createBuffer({ label: "readback", size: 20, usage: 9 });
  const ok = dev.createCommandEncoder({ label: "veg" }); const vp = ok.beginRenderPass({}); vp.drawIndexedIndirect(args, 0); vp.end(); q.submit([ok.finish()]);
  assert.equal(P.destroyedInSubmit.length, 6); // live indirect buffer: no record
  args.destroy(); dst.destroy();
  const e = dev.createCommandEncoder({ label: "veg" }); const p2 = e.beginRenderPass({}); p2.drawIndexedIndirect(args, 0); p2.end(); e.copyBufferToBuffer(live, 0, dst, 0, 20); q.submit([e.finish()]);
  assert.deepEqual(P.destroyedInSubmit[6].buffers.map((x) => [x.label, x.via]), [["cullArgs", "drawIndexedIndirect"], ["readback", "copyBufferToBuffer dst"]]);
  assert.match(gpuProbeLine(P), /destroyed-in-submit 9 \(errors 0\) enc renderContext_6 buf #2 via bindGroup_lights destroyed by at disposeLights/);
});

// --draw-census: a fake renderer and WebGPU device on a fake window, frames driven by hand
test("draw census: categories, kinds, refreshes, us/draw and created-in-window counts", () => {
  const rafs = [];
  class GPUDevice { createRenderPipeline() { return {}; } createShaderModule() { return {}; } }
  const r = { backend: { draw() {} }, _nodes: { needsRefresh: (ro) => ro.object.name !== "static" }, _renderObjectDirect(ro) { this.backend.draw(ro); },
    render(list) { for (const ro of list) { this._nodes.needsRefresh(ro); this._renderObjectDirect(ro); } }, getRenderTarget: () => null };
  const win = { GPUDevice, performance: { now: () => 0 }, requestAnimationFrame: (f) => rafs.push(f), __RENDERER__: r };
  installDrawCensus(win);
  const frame = () => rafs.shift()();
  const dev = new GPUDevice();
  dev.createRenderPipeline({ label: "warmup" }); // before start: not counted
  const veg = { object: { name: "", isInstancedMesh: true, count: 40, userData: {} }, geometry: { indirect: {} }, material: { name: "" } };
  const ground = { object: { name: "static", userData: {} }, geometry: {}, material: { name: "es-ground" } };
  const empty = { object: { name: "", isInstancedMesh: true, count: 0, userData: { esSettlementBatch: true } }, geometry: {}, material: { name: "" } };
  const odd = { object: { name: "thing", type: "Mesh", userData: {} }, geometry: {}, material: { name: "x", type: "MeshBasicNodeMaterial" } };
  r._renderObjectDirect(ground); // before start: not counted
  win.__drawCensus.start();
  let t = 0; win.performance.now = () => (t += 0.005);
  for (let i = 0; i < 2; i++) {
    r.render([veg, veg, ground, empty, odd]);
    frame();
  }
  dev.createRenderPipeline({ label: "renderPipeline_late" }); dev.createShaderModule({ label: "late.wgsl" });
  const c = win.__drawCensus.stop();
  assert.equal(c.frames, 2);
  assert.deepEqual(c.hooked, { draw: true, renderObjectDirect: true, needsRefresh: true, render: true, renderObjects: false, renderBufferDirect: false });
  assert.equal(c.renderCallsPerFrame, 1); assert.ok(c.renderMsPerFrame > c.renderObjectMsPerFrame); assert.deepEqual(Object.keys(c.renderObjectByTarget), ["screen"]);
  assert.equal(c.drawsPerFrame, 5); assert.equal(c.drawsMax, 5);
  assert.deepEqual(c.byCategory, { "veg-gpucull": 2, "settlement-merge": 1, terrain: 1, other: 1 });
  assert.deepEqual(c.kindsPerFrame, { plain: 2, instanced: 1, indirect: 2, zero: 1 });
  assert.equal(c.refreshesPerFrame, 4); assert.equal(c.refreshByCategory.terrain, undefined);
  assert.equal(c.usPerDraw, 5); // one now() pair inside draw = 5 us
  assert.ok(c.usPerRenderObject > c.usPerDraw);
  assert.deepEqual(c.createdInWindow, { pipelines: 1, shaders: 1, labels: ["pipelines:renderPipeline_late", "shaders:late.wgsl"] });
  assert.equal(c.otherTop[0][0], "Mesh:thing|MeshBasicNodeMaterial:x");
  // the inclusive renderObject figure, not backend.draw alone (diag13 D2: 1.81 printed for 13.08)
  const line = drawCensusLine({ ...c, usPerRenderObject: 13.08, usPerRenderObjectExcl: 9.5, renderObjectExclMsPerFrame: 6, usPerDraw: 1.81, renderMsPerFrame: 9, renderObjectMsPerFrame: 7, renderCallsPerFrame: 6 }, 12.5);
  assert.match(line, /^not-a-bar; 5 draws \(all passes\), render\(\) 9 ms\/frame \(6 calls\), renderObject 13\.08 us incl \(7 ms\/frame\), 9\.5 us excl \(6 ms\/frame\), backend\.draw 1\.81 us, work - render\(\) 3\.5 ms; 4 refreshes \(main 4; esStatic 0, dynamic 4\), RenderObject \+0\/-0 per frame, 2 created in window; keptZero 0; veg-gpucull 2, settlement-merge 1, terrain 1; targets screen 5; passes main 5\/5 \(objects\/draws per frame\)$/);
  assert.match(drawCensusLine(null), /^not-a-bar; census unread/);
});

test("draw census (c9): nested render() is excluded from renderObject time; refreshes by pass/static/tag; RenderObject churn", () => {
  const rafs = [];
  let target = null, tt = 0;
  const disposed = [];
  const r = { backend: { draw() {} }, _nodes: { needsRefresh: () => true },
    _objects: { createRenderObject(o) { const ro = { object: o, onDispose() { disposed.push(o); } }; return ro; } },
    // the first receiver renders a shadow map nested in itself: 10 ms inside its renderObject call
    _renderObjectDirect(o, m, s, cam) { tt += 1; if (o.nested) { const prev = target; target = { texture: { name: "shadow" } }; this.render([{ object: { name: "", userData: {} }, camera: { uuid: "c0", isOrthographicCamera: true } }]); target = prev; } this.backend.draw({ object: o, material: m, geometry: {}, camera: cam }); },
    render(list) { for (const ro of list) { this._nodes.needsRefresh(ro); tt += 4; if (ro.camera) { /* shadow object */ this._renderObjectDirect(ro.object, {}, null, ro.camera); } } },
    getRenderTarget: () => target };
  const win = { performance: { now: () => tt }, requestAnimationFrame: (f) => rafs.push(f), __RENDERER__: r };
  installDrawCensus(win);
  win.__drawCensus.start();
  const recv = { name: "terrain", nested: true, userData: { esStatic: true } };
  const ro1 = r._objects.createRenderObject(recv); ro1.onDispose();
  r._objects.createRenderObject(recv);
  r._nodes.needsRefresh({ object: recv, camera: { isPerspectiveCamera: true } });
  r.render([{ object: recv, camera: { isPerspectiveCamera: true } }]);
  rafs.shift()();
  const c = win.__drawCensus.stop();
  assert.ok(c.hooked.renderObjects);
  assert.deepEqual(c.renderObjectChurn, { createdPerFrame: 2, disposedPerFrame: 1 }); assert.deepEqual(disposed, [recv]);
  // outer renderObject: 1 own + nested render (4 refresh + 1 inner renderObject) = inclusive 6, exclusive 1; inner: 1
  assert.ok(c.renderObjectMsPerFrame > c.renderObjectExclMsPerFrame);
  assert.equal(c.renderObjectExclMsPerFrame, 2); assert.equal(c.renderObjectMsPerFrame, 7);
  assert.ok(c.usPerRenderObject > c.usPerRenderObjectExcl);
  assert.deepEqual(c.refreshByStatic, { static: 2, dynamic: 1 });
  assert.deepEqual(c.refreshByPass, { main: { static: 2, dynamic: 0 }, shadow0: { static: 0, dynamic: 1 } });
  assert.deepEqual(c.refreshByPassTag.main, { terrain: { static: 2, dynamic: 0 } });
  assert.match(drawCensusLine(c), /3 refreshes \(main 2 shadow0 1; esStatic 2, dynamic 1\), RenderObject \+2\/-1 per frame/);
});

test("draw census: byTarget draws by category and kept-zero vegetation draws", () => {
  const rafs = [];
  let target = null;
  const r = { backend: { draw() {} }, _nodes: { needsRefresh: () => false }, _renderObjectDirect(ro) { this.backend.draw(ro); },
    render() {}, getRenderTarget: () => target };
  const win = { performance: { now: () => 0 }, requestAnimationFrame: (f) => rafs.push(f), __RENDERER__: r };
  installDrawCensus(win);
  const mk = (kept) => ({ object: { name: "", isInstancedMesh: true, count: 1, userData: { esGpuCull: true, esKept: kept } }, geometry: { indirect: {} }, material: { name: "" } });
  win.__drawCensus.start();
  target = { texture: { name: "shadow-cascade-0" } };
  r._renderObjectDirect(mk(0)); r._renderObjectDirect(mk(5));
  target = null;
  r._renderObjectDirect(mk(7));
  rafs.shift()();
  const c = win.__drawCensus.stop();
  assert.deepEqual(c.byTarget["shadow-cascade-0"], { drawsPerFrame: 2, keptZeroPerFrame: 1, "veg-gpucull": 2 });
  assert.deepEqual(c.byTarget.screen, { drawsPerFrame: 1, keptZeroPerFrame: 0, "veg-gpucull": 1 });
  assert.equal(c.keptZeroPerFrame, 1);
  assert.match(drawCensusLine(c), /keptZero 1; veg-gpucull 3; targets shadow-cascade-0 2, screen 1; passes shadow0 2\/2, main 1\/1 \(objects\/draws per frame\)$/);
});

test("draw census (diag20 E8): per-pass objects and draws, one shadow pass per cascade camera, reflection apart", () => {
  const rafs = [];
  let target = null;
  const r = { backend: { draw() {} }, _nodes: { needsRefresh: () => false }, _renderObjectDirect(o, m, s, cam) { this.backend.draw({ object: o, material: m, geometry: {}, camera: cam }); },
    render() {}, getRenderTarget: () => target };
  const win = { performance: { now: () => 0 }, requestAnimationFrame: (f) => rafs.push(f), __RENDERER__: r };
  installDrawCensus(win);
  const obj = { name: "", userData: {} }, mat = { name: "" };
  const main = { uuid: "m", isPerspectiveCamera: true }, c0 = { uuid: "c0", isOrthographicCamera: true }, c1 = { uuid: "c1", isOrthographicCamera: true };
  win.__drawCensus.start();
  for (let f = 0; f < 2; f++) {
    target = { texture: { name: "" } };
    for (let i = 0; i < 6; i++) r._renderObjectDirect(obj, mat, null, c0);
    for (let i = 0; i < 3; i++) r._renderObjectDirect(obj, mat, null, c1);
    target = { texture: { name: "waterReflection" } }; r._renderObjectDirect(obj, mat, null, main);
    target = null; for (let i = 0; i < 4; i++) r._renderObjectDirect(obj, mat, null, main);
    rafs.shift()();
  }
  const c = win.__drawCensus.stop();
  // seen to fail before the per-pass split: both cascades read as one "rt" target of 9 draws, no objects per pass
  assert.deepEqual(c.byPass, { shadow0: { objectsPerFrame: 6, drawsPerFrame: 6 }, main: { objectsPerFrame: 4, drawsPerFrame: 4 },
    shadow1: { objectsPerFrame: 3, drawsPerFrame: 3 }, reflection: { objectsPerFrame: 1, drawsPerFrame: 1 } });
  assert.match(drawCensusLine(c), /passes shadow0 6\/6, main 4\/4, shadow1 3\/3, reflection 1\/1/);
});

test("views pin weather (diag20 E7): a studio view without w= gets w=clear and is named in the summary", () => {
  const [a, b, c, d] = parseViews(JSON.stringify([{ name: "a", url: "http://x/elder-souls-argonia/webgpu/?view=character&x=1&z=2&t=22&rate=0.5" },
    { name: "b", url: "http://x/elder-souls-argonia/webgpu/?view=character&t=22&w=rain" }, { name: "c", url: "https://threejs.org/examples/x.html" },
    { name: "d", url: "http://x/?view=character", plain: true }]));
  assert.equal(a.url, "http://x/elder-souls-argonia/webgpu/?view=character&x=1&z=2&t=22&rate=0.5&w=clear"); assert.equal(a.weatherPinAdded, true);
  assert.equal(b.url, "http://x/elder-souls-argonia/webgpu/?view=character&t=22&w=rain"); assert.equal(b.weatherPinAdded, undefined);
  assert.equal(c.weatherPinAdded, undefined); assert.equal(d.weatherPinAdded, undefined);
  const t = summaryTable([{ name: "a", summary: summariseView({ ...a, weatherPinAdded: true }) }, { name: "b", summary: summariseView(b) }], null);
  assert.match(t.split("\n")[0], /^WEATHER UNPINNED in the views file \(w=clear added; diag20 E7\): a$/);
  assert.doesNotMatch(summaryTable([{ name: "b", summary: summariseView(b) }], null), /WEATHER UNPINNED/);
});

test("--profile N@settle+S (diag20 E8): starts S s after the settle gate, and the summary maps the profile to source", () => {
  assert.deepEqual(parseProfile("12@settle+5"), { seconds: 12, at: 5, from: "settle" });
  assert.deepEqual(parseProfile("10@60"), { seconds: 10, at: 60, from: "nav" });
  assert.throws(() => parseProfile("10@ready+5"), /settle\+<s>/);
  assert.equal(profileStartS(parseProfile("12@settle+5"), null, 9), 14, "no settle gate: from ready");
  assert.equal(profileStartS(parseProfile("12@settle+5"), 40, 9), 45);
  assert.equal(profileStartS(parseProfile("12@settle+5"), null, null), null, "not settled yet: not started");
  assert.equal(profileStartS(parseProfile("10@60"), 40, 9), 60);
  // one map: chunk index.js line 0 col 10 -> src/a.ts:7
  const maps = new Map([["index.js", { sources: ["src/a.ts"], lines: [[[0, 0, 6, 0]]] }]]);
  const prof = { startTime: 0, endTime: 3000, nodes: [{ id: 1, callFrame: { functionName: "Yg", url: "http://x/assets/index.js", lineNumber: 0, columnNumber: 10 }, children: [] }], samples: [1, 1, 1], timeDeltas: [1000, 1000, 1000] };
  assert.deepEqual(summariseProfile(prof, 30, maps).selfTopSrc, [["Yg @ src/a.ts:7", 3]]);
  assert.equal(summariseProfile(prof, 30).selfTopSrc, undefined, "no maps: no source column");
  const s = summariseView({ name: "v", url: "u", profile: { at: 45, from: "settle", atSpec: 5, ...summariseProfile(prof, 30, maps) } });
  assert.equal(s.profileSrc, "settle+5 s: Yg @ src/a.ts:7 3");
});

test("dev hooks line (diag20 E8): casters missing a layer and the warm gate's open reason", () => {
  assert.equal(devHooksLine({ castersMissingLayer: [], warm: { open: true, reason: "stable", frames: 41 } }), "casters missing layer 0; warm stable @41f");
  const missing = [{ name: "wall", owner: "settlements", kind: "Mesh esSettlementBatch" }, { name: "<unnamed>", owner: "<scene>", kind: "Mesh" }];
  assert.equal(devHooksLine({ castersMissingLayer: missing, warm: { open: true, reason: "cap", frames: 600 } }),
    "casters missing layer 2 (expect 0): wall [settlements, Mesh esSettlementBatch], <unnamed> [<scene>, Mesh]; warm cap @600f");
  const many = Array.from({ length: 10 }, (_, i) => ({ name: `m${i}`, owner: "o", kind: "Mesh" }));
  assert.match(devHooksLine({ castersMissingLayer: many, warm: null }), /m7 \[o, Mesh\] \+2 more; warm \?$/);
  assert.equal(devHooksLine({ castersMissingLayer: null, warm: null }), "casters ?; warm ?");
  assert.equal(devHooksLine(null), null);
});

test("loadTimeline: complete = max of streaming-quiet, queue empty, last build; over 10 s is BAR FAIL", async () => {
  const { loadTimeline, loadLine } = await import("./pod-capture-lib.mjs");
  const page = (last) => ({ probe: { firstPresent: 1200, builds: { count: 40, ms: 3100, last }, transcode: { count: 12, ms: 900, last: 5000, workers: 2 } }, fetch: { count: 80, bytes: 42e6, last: 6400 } });
  const ok = loadTimeline(page(7300), { streamFirst: 3, streamQuiet: 8, queueEmpty: 6 });
  assert.equal(ok.complete, 8); assert.equal(ok.barFail, false);
  assert.equal(loadLine(ok), "complete 8 (fetch 6.4, transcode 900ms/12, builds 3100ms/40 last 7.3, stream 3-8, present 1.2)");
  const late = loadTimeline(page(11200), { streamFirst: 3, streamQuiet: 8, queueEmpty: 6 });
  assert.equal(late.complete, 11.2); assert.equal(late.barFail, true); assert.match(loadLine(late), /^BAR FAIL complete 11.2/);
  const q = loadTimeline(page(2000), { streamFirst: 3, streamQuiet: 4, queueEmpty: 10.5 });
  assert.equal(q.complete, 10.5); assert.equal(q.barFail, true);
  const none = loadTimeline(null, { streamFirst: 3, streamQuiet: 4, queueEmpty: 5 });
  assert.equal(none.complete, null); assert.equal(none.barFail, true); assert.ok(none.transcode.unobservable);
  assert.ok(loadTimeline({ ...page(1000), probe: { ...page(1000).probe, transcode: { count: 0, ms: 0, last: null, workers: 0 } } }, { streamQuiet: 1, queueEmpty: 1 }).transcode.unobservable);
});
test("installLoadTimeline: pipeline builds, first present and KTX2 worker round trips are counted", () => {
  return import("./pod-capture-lib.mjs").then(({ installLoadTimeline }) => {
    let clock = 0; const listeners = [];
    class GPUDevice { createRenderPipeline() { clock += 50; return {}; } createShaderModule() { clock += 10; return {}; } createRenderPipelineAsync() { clock += 5; return Promise.resolve({}); } createComputePipeline() {} createComputePipelineAsync() { return Promise.resolve(); } }
    class GPUQueue { submit() {} }
    class Worker { postMessage() {} addEventListener(_, f) { listeners.push(f); } }
    const win = { performance: { now: () => clock, setResourceTimingBufferSize() {} }, GPUDevice, GPUQueue, Worker };
    installLoadTimeline(win);
    const d = new GPUDevice(); d.createShaderModule(); clock = 100; d.createRenderPipeline();
    clock = 120; new GPUQueue().submit();
    const w = new Worker(); clock = 200; w.postMessage({ type: "transcode", id: 7 }); clock = 260; listeners[0]({ data: { type: "transcode", id: 7 } });
    const t = win.__loadTimeline;
    assert.equal(t.builds.count, 2); assert.equal(t.builds.ms, 60); assert.equal(t.builds.last, 150);
    assert.equal(t.firstPresent, 120);
    assert.deepEqual([t.transcode.count, t.transcode.ms, t.transcode.workers], [1, 60, 1]);
    return d.createRenderPipelineAsync().then(() => Promise.resolve()).then(() => assert.equal(t.builds.count, 3));
  });
});

// --probe-nan: a fake GPUQueue/GPUBuffer on a fake window; the probe must fire on a NaN write and stay quiet otherwise
function fakeNanWindow(renderer) {
  class GPUQueue { submit() {} writeBuffer() {} writeTexture() {} }
  class GPUBuffer { constructor(label, size, usage) { this.label = label; this.size = size; this.usage = usage; this._ab = new ArrayBuffer(size); } getMappedRange() { return this._ab; } unmap() {} }
  const win = { GPUQueue, GPUBuffer, __RENDERER__: renderer, performance: { now: () => 5 } };
  installNanProbe(win);
  return { win, q: new GPUQueue(), GPUBuffer };
}
test("nan probe: a NaN in a Float32 uniform write is recorded with label, frame and the uniform name", () => {
  const binding = { name: "objectUniforms", uniforms: [{ name: "fogTime", offset: 0, itemSize: 1 }, { name: "windDir", offset: 4, itemSize: 4 }] };
  const at = {};
  const be = { updateBinding(b) { at.q.writeBuffer(at.buf, 0, new Float32Array([1, 2, 3, 4, 0.5, NaN, 0, 0])); } };
  const { win, q, GPUBuffer } = fakeNanWindow({ backend: be });
  at.q = q; at.buf = new GPUBuffer("bindingBuffer7_objectUniforms_(vertex)", 32, 0x40 | 0x8);
  q.submit([]); q.submit([]);
  win.__RENDERER__.backend.updateBinding(binding);
  win.__RENDERER__.backend.updateBinding(binding);
  const p = win.__nanProbe;
  assert.equal(p.records.length, 1); assert.equal(p.bad, 2); assert.equal(p.badPerFrame[2], 2);
  const r = p.records[0];
  assert.equal(r.label, "bindingBuffer7_objectUniforms_(vertex)"); assert.equal(r.frame, 2); assert.equal(r.floatIndex, 5); assert.equal(r.byteOffset, 20);
  assert.equal(r.value, "NaN"); assert.equal(r.group, "objectUniforms"); assert.deepEqual(r.uniforms, ["windDir"]);
  assert.match(nanProbeLine(p), /^not-a-bar; 2 bad writes, first f2 bindingBuffer7_objectUniforms_\(vertex\)\/objectUniforms\.windDir NaN/);
});
test("nan probe: layout names the compute pipeline, group/binding and WGSL uniform struct that bound the hit buffer (D4)", () => {
  class GPUQueue { submit() {} writeBuffer() {} writeTexture() {} }
  class GPUBuffer { constructor(label, size, usage) { this.label = label; this.size = size; this.usage = usage; } }
  class GPUDevice { createShaderModule(d) { return { label: d.label }; } createComputePipeline(d) { return { label: d.label }; } createBindGroup(d) { return { entries: d.entries }; } }
  class GPUComputePassEncoder { setPipeline() {} setBindGroup() {} }
  const win = { GPUQueue, GPUBuffer, GPUDevice, GPUComputePassEncoder, performance: { now: () => 5 } };
  installNanProbe(win);
  const dev = new GPUDevice(), q = new GPUQueue(), buf = new GPUBuffer("NodeBuffer_inject", 464, 0x40 | 0x8), other = new GPUBuffer("other", 16, 0x40);
  const code = "struct NodeBuffer_9Struct {\n  camPos : vec3<f32>,\n  jitterXY : vec2<f32>\n};\n@binding( 1 ) @group( 0 )\nvar<uniform> NodeBuffer_9 : NodeBuffer_9Struct;\n@compute @workgroup_size(8) fn main() {}";
  assert.equal(win.__nanProbe.layout, null, "no hit, no layout");
  const pl = dev.createComputePipeline({ label: "froxelInject", compute: { module: dev.createShaderModule({ code }) } });
  const f = new Float32Array(116); f[22] = NaN;
  q.writeBuffer(buf, 0, f);
  assert.deepEqual(win.__nanProbe.layout, { err: "no compute pass bound a hit buffer" });
  const pass = new GPUComputePassEncoder();
  pass.setPipeline(pl); pass.setBindGroup(0, dev.createBindGroup({ entries: [{ binding: 0, resource: { buffer: other } }, { binding: 1, resource: { buffer: buf } }] }));
  const L = JSON.parse(JSON.stringify(win.__nanProbe)).layout;
  assert.deepEqual([L.pipelineLabel, L.group, L.binding, L.bufferLabel, L.byteOffset], ["froxelInject", 0, 1, "NodeBuffer_inject", 88]);
  assert.match(L.wgslStruct, /^var<uniform> NodeBuffer_9 : NodeBuffer_9Struct;\nstruct NodeBuffer_9Struct \{[^}]*jitterXY : vec2<f32>/);
  assert.ok(L.wgsl.includes("@compute"));
});
test("nan probe: finite writes stay clean; index buffers and int arrays are skipped; mapped and half-float paths fire", () => {
  const { win, q, GPUBuffer } = fakeNanWindow();
  q.writeBuffer(new GPUBuffer("ok", 16, 0x40), 0, new Float32Array([1, 2, 3, 4]));
  assert.equal(win.__nanProbe.records.length, 0);
  assert.match(nanProbeLine(win.__nanProbe), /^not-a-bar; clean \(1 writes/);
  q.writeBuffer(new GPUBuffer("idx", 16, 0x10 | 0x8), 0, new Float32Array([NaN, 0, 0, 0]));
  q.writeBuffer(new GPUBuffer("ints", 16, 0x80), 0, new Uint32Array([0x7fc00000, 0, 0, 0]));
  assert.equal(win.__nanProbe.records.length, 0); assert.equal(win.__nanProbe.scanned, 1);
  const m = new GPUBuffer("mapped", 4096, 0x80); new Float32Array(m.getMappedRange())[1] = Infinity; m.unmap();
  q.writeTexture({ texture: { label: "lightField", format: "rgba16float", width: 1, height: 1 } }, new Uint16Array([0x3c00, 0x7e00, 0, 0]), { offset: 0 }, [1, 1]);
  const rs = win.__nanProbe.records;
  assert.deepEqual(rs.map((r) => [r.kind, r.label, r.value, r.floatIndex]), [["mapped", "mapped", "Inf", 1], ["writeTexture", "lightField", "NaN", 1]]);
  assert.equal(rs[0].mapping, undefined);
});
test("nan probe: a hit inside updateForRender names its owner (object, material, node; camera for render) and the persistent table", () => {
  const at = {};
  const obj = { name: "reedClump", type: "Mesh", uuid: "o1", userData: { kit: 1 }, parent: { name: "cell", parent: { name: "veg", parent: { type: "Scene" } } } };
  const cam = { type: "PerspectiveCamera", name: "probeCam", uuid: "c1", aspect: 0, fov: 50, near: 0.1, far: 100, zoom: 1, isArrayCamera: false };
  const ctx = { width: 0, height: 0, label: "rt", renderTarget: { width: 0, height: 4, depth: 1, samples: 0, texture: { name: "probeRT" } } };
  const ro = { object: obj, material: { name: "reedMat", type: "MeshStandardNodeMaterial", uuid: "m1" }, context: ctx, camera: cam };
  const vec = { isVector3: true, x: 1, y: NaN, z: 0, constructor: { name: "Vector3" } };
  const objB = { name: "object", uniforms: [{ name: "nodeUniform6", offset: 0, itemSize: 4, nodeUniform: { name: "nodeUniform6", node: { name: "windDir", value: vec, constructor: { name: "UniformNode" } } } }] };
  const renB = { name: "render", uniforms: [{ name: "cameraProjectionMatrix", offset: 0, itemSize: 16 }] };
  const be = { updateBinding(b) { at.q.writeBuffer(at.buf, 0, at.data); } };
  const bindings = { updateForRender(r) { for (const b of r.list) be.updateBinding(b); } };
  const renderer = { backend: be, _bindings: bindings, getRenderTarget: () => ctx.renderTarget, getViewport: () => ({ x: 0, y: 0, z: 0, w: 4 }), getDrawingBufferSize: () => ({ x: 800, y: 600 }) };
  const { win, q, GPUBuffer } = fakeNanWindow(renderer);
  at.q = q; at.buf = new GPUBuffer("bindingBuffer18", 64, 0x40 | 0x8);
  const run = (list, data) => { at.data = data; win.__RENDERER__._bindings.updateForRender({ ...ro, list }); };
  run([objB], new Float32Array([1, NaN, 0, 0])); run([objB], new Float32Array([1, NaN, 0, 0])); run([objB], new Float32Array([1, 2, 0, 0])); // transient
  const proj = new Float32Array(16); proj[0] = Infinity;
  run([renB], proj); run([renB], proj); // persistent
  const p = win.__nanProbe;
  assert.equal(p.records.length, 2); assert.equal(p.bad, 4);
  const [o, r] = p.records;
  assert.equal(o.group, "object"); assert.equal(o.owner.object.name, "reedClump"); assert.deepEqual(o.owner.object.parents, ["cell", "veg", "Scene"]);
  assert.deepEqual(o.owner.object.userData, ["kit"]); assert.equal(o.owner.material.name, "reedMat"); assert.equal(o.owner.context.target.label, "probeRT");
  assert.deepEqual(o.owner.node, [{ uniform: "nodeUniform6", name: "windDir", class: "UniformNode", valueType: "object", valueClass: "Vector3", value: [1, "NaN", 0] }]);
  assert.equal(r.group, "render"); assert.equal(r.owner.camera.name, "probeCam"); assert.equal(r.owner.camera.aspect, 0);
  assert.deepEqual(r.owner.renderer.viewport, [0, 0, 0, 4]); assert.deepEqual(r.owner.renderer.drawingBuffer, [800, 600]); assert.equal(r.owner.renderer.target.height, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(p)).persistent, [{ group: "render", uuid: "c1", name: "probeCam", bad: 2 }]);
  assert.match(nanProbeLine(p), /persistent 1;/);
});
test("nan probe: a mapped NaN pattern beside denormals is packed, not bad; a uniform NaN is still bad", () => {
  const { win, q, GPUBuffer } = fakeNanWindow();
  const m = new GPUBuffer("packed", 4096, 172); m.getMappedRange();
  const u = new Uint32Array(m._ab); u[10] = 1; u[11] = 0x7fc00000; u[12] = 1; m.unmap();
  assert.equal(win.__nanProbe.bad, 0); assert.equal(win.__nanProbe.packedSkipped, 1);
  q.writeBuffer(new GPUBuffer("uni", 16, 0x40 | 0x8), 0, new Float32Array([1, NaN, 0, 1e-45]));
  assert.equal(win.__nanProbe.bad, 1); assert.equal(win.__nanProbe.packedSkipped, 1);
  assert.match(nanProbeLine(win.__nanProbe), /packed-skipped 1\)/);
});

test("gpu-error probe: encoderPasses names each encoder label's pass once (attachments, first pipeline, camera); destroyedInSubmit carries it", () => {
  class GPUTexture { constructor(label, format, w, h, sc) { Object.assign(this, { label, format, width: w, height: h, sampleCount: sc }); } createView() { return {}; } }
  class GPUBuffer { constructor(d) { this.label = d.label; this.size = d.size; } destroy() {} }
  class GPURenderPassEncoder { setPipeline() {} setBindGroup() {} end() {} }
  class GPUCommandEncoder { constructor(d) { this.label = d?.label ?? ""; } beginRenderPass() { return new GPURenderPassEncoder(); } finish() { return {}; } }
  class GPUDevice { createBuffer(d) { return new GPUBuffer(d); } createBindGroup() { return {}; } createCommandEncoder(d) { return new GPUCommandEncoder(d); } createRenderPipeline() { return {}; } }
  class GPUQueue { submit() {} }
  const at = {};
  const renderer = { backend: { draw(ro) { at.pass.setPipeline(at.pipe); } } };
  const win = { GPUTexture, GPUDevice, GPUBuffer, GPURenderPassEncoder, GPUCommandEncoder, GPUQueue, __RENDERER__: renderer, performance: { now: () => 1 } };
  installGpuErrorProbe(win);
  const dev = new GPUDevice(), q = new GPUQueue();
  const shadow = new GPUTexture("shadowMap", "depth32float", 2048, 2048, 1), colour = new GPUTexture("scene", "rgba16float", 1280, 720, 4), depth = new GPUTexture("", "depth24plus", 1280, 720, 4);
  at.pipe = dev.createRenderPipeline({ label: "renderPipeline_shadow", vertex: { buffers: [] } });
  const doomed = dev.createBuffer({ label: "lights", size: 64 }), bg = dev.createBindGroup({ label: "bg", entries: [{ binding: 0, resource: { buffer: doomed } }] });
  const run = (label, d, cam) => { const e = dev.createCommandEncoder({ label }); at.pass = e.beginRenderPass(d); at.pass.setBindGroup(0, bg); renderer.backend.draw({ camera: cam, object: { name: "sunShadow" } }); at.pass.end(); q.submit([e.finish()]); };
  const P = win.__gpuErrorProbe;
  run("renderContext_6", { colorAttachments: [], depthStencilAttachment: { view: shadow.createView() } }, { type: "OrthographicCamera", name: "", isOrthographicCamera: true });
  run("renderContext_6", { colorAttachments: [{ view: colour.createView() }], depthStencilAttachment: { view: depth.createView() } }, { type: "PerspectiveCamera" });
  assert.deepEqual(P.encoderPasses.renderContext_6, { passLabel: "", colour: [], depth: { label: "shadowMap", format: "depth32float", size: [2048, 2048], sampleCount: 1 },
    firstPipeline: "renderPipeline_shadow", camera: { type: "OrthographicCamera", name: "", ortho: true, array: false, object: "sunShadow" } }, "first pass of the label only");
  assert.equal(P.destroyedInSubmit.length, 0, "no destroyed buffer yet: no record");
  run("renderContext_2", { colorAttachments: [{ view: colour.createView() }] }, null);
  assert.deepEqual(P.encoderPasses.renderContext_2.colour, [{ label: "scene", format: "rgba16float", size: [1280, 720], sampleCount: 4 }]);
  assert.equal(P.encoderPasses.renderContext_2.camera, null);
  doomed.destroy();
  run("renderContext_6", { colorAttachments: [] }, null);
  assert.equal(P.destroyedInSubmit[0].pass.firstPipeline, "renderPipeline_shadow");
});
test("load timeline: buffered longtask records and bootLongestTask; empty list and null when there were none", async () => {
  const { installLoadTimeline, loadTimeline } = await import("./pod-capture-lib.mjs");
  const observers = [];
  class PerformanceObserver { constructor(cb) { this.cb = cb; observers.push(this); } observe(o) { this.opts = o; } }
  const win = { performance: { now: () => 0, setResourceTimingBufferSize() {} }, PerformanceObserver };
  installLoadTimeline(win);
  assert.deepEqual(observers[0].opts, { type: "longtask", buffered: true });
  const t = win.__loadTimeline;
  const none = loadTimeline({ probe: JSON.parse(JSON.stringify(t)), fetch: null }, {});
  assert.deepEqual([none.longTasks, none.bootLongestTask], [[], null]);
  observers[0].cb({ getEntries: () => [{ startTime: 310.4, duration: 8412.6, name: "self", attribution: [{ name: "unknown", containerType: "window" }] }, { startTime: 9100, duration: 120, name: "self", attribution: [] }] });
  const lt = loadTimeline({ probe: JSON.parse(JSON.stringify(t)), fetch: null }, {});
  assert.equal(lt.longTasks.length, 2);
  assert.deepEqual(lt.bootLongestTask, { at: 0.3, ms: 8413, name: "self", attribution: "unknown window" });
  const bare = { performance: { now: () => 0, setResourceTimingBufferSize() {} } };
  installLoadTimeline(bare);
  assert.equal(loadTimeline({ probe: bare.__loadTimeline, fetch: null }, {}).longTasksUnobservable, "no PerformanceObserver");
});

import { viewShots, shotTime, hudClock, clockVerdict, withFinalJpgLuma, summaryTable as summaryTableF2, summariseView as summariseViewF2 } from "./pod-capture-lib.mjs";
test("viewShots/shotTime: frames count from navigation unless shotsFrom settle; seconds-only views every 10 s (diag19 D5)", () => {
  assert.deepEqual(viewShots({ seconds: 60 }, "500@60,2000", 60), [0, 10, 20, 30, 40, 50, 60]);
  assert.equal(viewShots({ shots: "none", seconds: 60 }, undefined, 60).length, 0);
  assert.equal(viewShots({}, "1000@2,5000", 10).length, parseShots("1000@2,5000", 10).length);
  // old: a 60 s view whose settle gate opened at 45 s had shot time 15 at s=60; now 60 for any view without shotsFrom
  assert.equal(shotTime({ clean: true }, 60, 45), 60);
  assert.equal(shotTime({ shotsFrom: "settle" }, 60, 45), 15);
  assert.equal(shotTime({ shotsFrom: "settle" }, 60, null), -1);
  assert.throws(() => parseViews(JSON.stringify([{ name: "a", url: "http://x/", shotsFrom: "ready" }])), /shotsFrom/);
});
test("hudClock/clockVerdict: HUD HH:MM per frame, clockAdvancing first vs last", () => {
  assert.deepEqual(hudClock("fps 60\n07:05\nalt 3 m"), { hhmm: "07:05", minute: 425 });
  assert.equal(hudClock("fps 60 · 12.5 ms"), null);
  assert.deepEqual(clockVerdict([{ clock: hudClock("07:05") }, { clock: null }, { clock: hudClock("07:40") }]), { first: "07:05", last: "07:40", clockAdvancing: true });
  assert.equal(clockVerdict([{ clock: hudClock("07:05") }, { clock: hudClock("07:05") }]).clockAdvancing, false);
  assert.equal(clockVerdict([{ clock: hudClock("07:05") }]).clockAdvancing, null);
});
test("summary: a rate= view whose clock did not advance is flagged in summary.md", () => {
  const v = (name, url, adv) => ({ name, summary: summariseViewF2({ url, clock: { first: "07:05", last: adv ? "07:30" : "07:05", clockAdvancing: adv } }) });
  const md = summaryTableF2([v("a", "http://x/?rate=0.5", false), v("b", "http://x/?rate=0.5", true), v("c", "http://x/?rate=0", false)], null);
  assert.match(md, /CLOCK STOPPED[^\n]*: a$/m);
  assert.match(md, /07:05->07:05 STOPPED/);
});
test("withFinalJpgLuma: luma final and black are final.jpg's own (diag19 Q1: 0.32 read beside a lit final.jpg)", () => {
  const f = withFinalJpgLuma({ luma: 0.32, blackShare: 0.972, fps: 30 }, { luma: 145.5, blackShare: 0 });
  assert.deepEqual(f, { luma: 145.5, blackShare: 0, fps: 30, lumaSource: "final.jpg" });
  assert.equal(summariseViewF2({ final: f }).lumaFinal, 145.5);
});

test("view heapsample: the --profile grammar, one parser; a bad spec names heapsample", async () => {
  const { parseHeapSample, parseViews } = await import("./pod-capture-lib.mjs");
  assert.deepEqual(parseHeapSample("10@settle+5"), { seconds: 10, at: 5, from: "settle" });
  assert.deepEqual(parseHeapSample("10@60"), parseProfile("10@60"));
  assert.throws(() => parseHeapSample("10"), /heapsample wants/);
  assert.throws(() => parseViews(JSON.stringify([{ name: "a", url: "http://x/y", heapsample: "bad" }])), /heapsample wants/);
  assert.equal(parseViews(JSON.stringify([{ name: "a", url: "http://x/y", heapsample: "10@settle+5" }]))[0].heapsample, "10@settle+5");
});

test("heap alloc top5, veg tris by rung and fetch before ready: filled from a fixture, empty and null-safe without it", async () => {
  const { heapAllocLine, vegRungLine, VEG_READ_JS, resourceSummary, resourceLine } = await import("./pod-capture-lib.mjs");
  const rows = Array.from({ length: 7 }, (_, i) => ({ name: `f${i} a.ts:${i}`, MB: 7 - i }));
  assert.equal(heapAllocLine(rows), "f0 a.ts:0 7 MB; f1 a.ts:1 6 MB; f2 a.ts:2 5 MB; f3 a.ts:3 4 MB; f4 a.ts:4 3 MB");
  assert.equal(heapAllocLine([]), null); assert.equal(heapAllocLine(undefined), null);
  const read = { veg: { trianglesByRung: { near: 1.5e6, mid: 5e5, far: 2e5, card: 1e5 }, triangles: 2.3e6 }, render: { triangles: 3e6, calls: 900 } };
  assert.equal(vegRungLine(read), "near 1.5 / mid 0.5 / far 0.2 / card 0.1 M; veg total 2.3 M; render triangles 3 M");
  assert.equal(vegRungLine({ veg: null, render: null }), null); assert.equal(vegRungLine(undefined), null);
  assert.equal(vegRungLine({ veg: null, render: { triangles: 2e6 } }), "render triangles 2 M");
  // the page JS itself runs null-safe: no handle, no renderer
  assert.deepEqual(new Function("window", `return ${VEG_READ_JS}`)({}), { veg: null, render: null });
  const got = new Function("window", `return ${VEG_READ_JS}`)({ __STUDIO_VEGETATION_DEBUG__: { trianglesByRung: { near: 1, mid: 2, far: 3, card: 4 }, triangles: 10 }, __RENDERER__: { info: { render: { triangles: 5, drawCalls: 2, frame: 9 } } } });
  assert.deepEqual(got.render, { triangles: 5, drawCalls: 2 }); assert.equal(got.veg.trianglesByRung.card, 4);
  const sum = resourceSummary([
    { name: "http://h/a/b.glb?v=1", transferSize: 3e6, encodedBodySize: 3e6, responseEnd: 10 }, { name: "http://h/t.ktx2", transferSize: 0, encodedBodySize: 2e6, responseEnd: 20 },
    { name: "http://h/c.json", transferSize: 1e5, encodedBodySize: 1e5, responseEnd: 30 }, { name: "http://h/x.png", transferSize: 5e5, encodedBodySize: 5e5, responseEnd: 40 }]);
  assert.equal(sum.requests, 4); assert.equal(sum.MB, 5.6); assert.deepEqual(sum.byKind.glb, { n: 1, MB: 3 }); assert.deepEqual(sum.byKind.ktx2, { n: 1, MB: 2 });
  assert.deepEqual(sum.top.map((t) => t.name), ["a/b.glb", "h/t.ktx2", "h/x.png"]);
  assert.equal(resourceLine(sum), "4 req / 5.6 MB (glb 1/3 MB, ktx2 1/2 MB, png 1/0.5 MB, json 1/0.1 MB); top3 a/b.glb 3, h/t.ktx2 2, h/x.png 0.5");
  assert.equal(resourceLine(null), null);
  assert.equal(resourceSummary(undefined).requests, 0);
  const s = summariseView({ vegRead: undefined, final: { vegRead: read } , heapSample: { topAllocated: rows }, resources: { atReady: sum } });
  assert.match(s.vegTrisByRung, /^near 1\.5/); assert.match(s.heapAllocTop5, /^f0 /); assert.match(s.fetchBeforeReady, /^4 req/);
  const e = summariseView({});
  assert.equal(e.vegTrisByRung, null); assert.equal(e.heapAllocTop5, null); assert.equal(e.fetchBeforeReady, null);
  const t = summaryTable([{ name: "a", summary: s }, { name: "b", summary: e }], null);
  assert.match(t, /heap alloc top5 \| veg tris by rung \| fetch before ready \|/); assert.match(t, /\| - \| - \| - \|\n?$/m);
});

// ---- webgpu10 chunk 10 fix B: classic WebGLRenderer pages, the pose gate, per-pass triangles, program errors ----
// A fake classic WebGLRenderer page: renderBufferDirect per draw, info.render.triangles counted by three, no backend.
function fakeClassicPage() {
  const rafs = [], log = [];
  let target = null;
  const canvas = { tagName: "CANVAS", isConnected: true, style: { visibility: "" }, dataset: {}, width: 1280, height: 720, clientWidth: 1280, clientHeight: 720, contains: () => false };
  const r = { domElement: canvas, info: { render: { calls: 0, triangles: 0, frame: 0 }, memory: { geometries: 3, textures: 2 }, programs: [{}, {}] },
    getRenderTarget: () => target, setRenderTarget: (t) => { target = t; },
    renderBufferDirect(camera, scene, geometry, material, object) { this.info.render.calls++; this.info.render.triangles += geometry.tris * (object.count ?? 1); log.push(object.name); },
    render(scene, camera) { for (const o of scene) this.renderBufferDirect(camera, scene, o.geometry, o.material, o); } };
  const win = { performance: { now: () => 0 }, requestAnimationFrame: (f) => rafs.push(f), __RENDERER__: r, __RAFN: 0 };
  return { r, win, rafs, log, canvas, setTarget: (t) => { target = t; } };
}

test("c10 frame capture on a classic WebGLRenderer page: clean frames are written (no data-render-canvas mark)", async () => {
  const { captureFrame } = await import("./pod-capture-lib.mjs");
  const { mkdtempSync, writeFileSync, readdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const { win, canvas } = fakeClassicPage();
  const hud = { style: { visibility: "" }, dataset: {}, contains: () => false }, html = { style: { overflow: "" } }, body = { style: { overflow: "" } };
  const document = { documentElement: html, body, querySelector: () => null, querySelectorAll: () => [hud, canvas] };
  const evaluate = async (js) => new Function("window", "document", `return ${js}`)(win, document);
  let hiddenAtShot = null;
  const shoot = async () => { hiddenAtShot = hud.style.visibility; return Buffer.from("jpeg-bytes").toString("base64"); };
  const dir = mkdtempSync(join(tmpdir(), "c10-frames-"));
  for (const s of [12.5, 22.5]) writeFileSync(join(dir, `${String(s * 1000).padStart(6, "0")}.jpg`), Buffer.from(await captureFrame({ evaluate, shoot }, true), "base64"));
  assert.deepEqual(readdirSync(dir).sort(), ["012500.jpg", "022500.jpg"]);
  assert.equal(hiddenAtShot, "hidden"); assert.equal(hud.style.visibility, ""); // HUD hidden for the shot only
  // no renderer canvas at all: the frame throws (pod-capture records it in result.shotErrors), never a silent skip
  win.__RENDERER__ = null;
  await assert.rejects(captureFrame({ evaluate, shoot }, true), /clean: .*no canvas/);
});

test("c10 draw census on a classic WebGLRenderer: draws and triangles per pass and perfTag, esIndirect apart, renderer info", () => {
  const { r, win, rafs } = fakeClassicPage();
  installDrawCensus(win);
  const main = { uuid: "m", isPerspectiveCamera: true }, sun = { uuid: "s", isOrthographicCamera: true };
  const mk = (name, tris, ud = {}, count) => ({ name, geometry: { tris }, material: { name: "", type: "MeshStandardMaterial" }, userData: ud, count, isInstancedMesh: count !== undefined });
  const terrain = mk("chunk", 1000, { perfTag: "terrain" }), veg = mk("veg-near", 200, { perfTag: "veg" }, 10), cull = mk("cull", 50, { perfTag: "veg", esIndirect: true }, 100);
  win.__drawCensus.start();
  for (let f = 0; f < 2; f++) {
    r.info.render.triangles = 0;
    r.setRenderTarget({ texture: { name: "ShadowMap" } }); r.render([terrain, veg], sun);
    r.setRenderTarget(null); r.render([terrain, veg, cull], main);
    rafs.shift()();
  }
  const c = win.__drawCensus.stop();
  assert.equal(c.hooked.renderBufferDirect, true); assert.equal(c.hooked.render, true); assert.equal(c.hooked.draw, false);
  assert.equal(c.drawsPerFrame, 5); assert.equal(c.renderCallsPerFrame, 2);
  assert.deepEqual(c.trisByPass.main, { drawsPerFrame: 2, trisPerFrame: 3000, indirectDrawsPerFrame: 1, indirectTrisPerFrame: 5000 });
  assert.deepEqual(c.trisByPass.shadow0, { drawsPerFrame: 2, trisPerFrame: 3000, indirectDrawsPerFrame: 0, indirectTrisPerFrame: 0 });
  assert.deepEqual(c.trisByTag.veg, { drawsPerFrame: 2, trisPerFrame: 4000, indirectDrawsPerFrame: 1, indirectTrisPerFrame: 5000 });
  assert.equal(c.trisByTag.terrain.trisPerFrame, 2000);
  assert.deepEqual(c.rendererInfo, { renderer: "WebGLRenderer", calls: 10, triangles: 11000, frame: 0, geometries: 3, textures: 2, programs: 2 });
});

test("c10 per-pass table in summary.md, ready-gate cell, program-error cell", async () => {
  const { trisPassTable, readyGateLine } = await import("./pod-capture-lib.mjs");
  const census = { trisByPass: { main: { drawsPerFrame: 2, trisPerFrame: 3e6, indirectDrawsPerFrame: 1, indirectTrisPerFrame: 2.9e6 } }, trisByTag: { veg: { drawsPerFrame: 1, trisPerFrame: 1e6, indirectDrawsPerFrame: 1, indirectTrisPerFrame: 2.9e6 } },
    rendererInfo: { renderer: "WebGPURenderer/webgpu", calls: 440, triangles: 9.5e6, programs: null } };
  const t = trisPassTable("canopy-08", census);
  assert.match(t[1], /^### canopy-08: triangles per frame by pass and perfTag \(WebGPURenderer\/webgpu, info\.render calls 440 tris 9\.50 M/);
  assert.equal(t[4], "| pass main | 2 | 3.00 | 1 | 2.90 |"); assert.equal(t[5], "| tag veg | 1 | 1.00 | 1 | 2.90 |");
  assert.deepEqual(trisPassTable("x", null), []);
  const r = { poseAt: 14.5, pose: { residual: { posM: 0.4, yawDeg: 0.3, pitchDeg: 6.1 } }, readyS: 4.2, final: { buildQueue: { pending: 3 } }, loadHarness: { queueEmpty: null, streamQuiet: 41 } };
  assert.equal(readyGateLine(r), "pose 14.5 s (0.4 m, yaw 0.3 deg, pitch 6.1 deg); ready 4.2 s; queue pending 3; streaming quiet 41 s");
  assert.match(readyGateLine({ poseAt: null, poseTimedOut: true, pose: { last: { posM: 812, yawDeg: null } } }), /^pose TIMED OUT \(last 812 m, yaw - deg\); ready - s; queue pending n\/a/);
  const s = summariseView({ url: "http://x/?rate=0.5", errors: [{ by: { perfTag: "veg", name: "veg-near", materialType: "MeshStandardNodeMaterial" }, attributes: ["0:position", "11:nodeAttribute"] }], shotErrors: ["4.2 s: clean: x"], window: { drawCensus: census } });
  assert.equal(s.programErrors, "1: veg/veg-near/MeshStandardNodeMaterial [2 attrs]"); assert.equal(s.shotErrors, "4.2 s: clean: x");
  const md = summaryTable([{ name: "canopy-08", summary: s, window: { drawCensus: census } }], null);
  assert.match(md, /\| ready gate \| program errors \| shot error \| clock \|/); assert.match(md, /### canopy-08: triangles per frame/);
});

test("c10 pose gate: poseTarget from the URL and aim; residuals in m and degrees", async () => {
  const { poseTarget, poseResidual } = await import("./pod-capture-lib.mjs");
  const t = poseTarget("http://h/s/?view=character&x=4.02&z=4.61&rate=0.5", [-Math.PI / 2, -0.26]);
  assert.equal(t.character, true); assert.equal(t.x, 4020); assert.equal(t.z, 4610); assert.ok(Math.abs(t.yaw + 90) < 1e-9);
  assert.equal(poseTarget("http://h/s/?view=character&rate=0.5"), null);
  assert.equal(poseTarget("http://h/s/?x=1&z=2"), null); // fly view without yaw/pitch: nothing to gate
  assert.deepEqual(poseTarget("http://h/s/?x=1&z=2&yaw=90&pitch=-10"), { character: false, x: 1000, z: 2000, yaw: 90, pitch: -10 });
  // follow camera at yaw -90 (forward = (-sin, -cos) = (+1, 0)): 5 m behind the pivot on x, level
  const at = poseResidual({ p: [4015, 51, 4610], f: [1, 0, 0] }, t, 5, 50);
  assert.equal(at.ok, true); assert.equal(at.posM, 0); assert.equal(at.yawDeg, 0);
  const water = poseResidual({ p: [0, 30, 0], f: [0, 0, -1] }, t, 5, null);
  assert.equal(water.ok, false); assert.ok(water.posM > 6000); assert.equal(water.yawDeg, 90);
  const turned = poseResidual({ p: [4015, 51, 4610], f: [Math.cos(0.05), 0, Math.sin(0.05)] }, t, 5, 50);
  assert.equal(turned.ok, false); assert.ok(turned.yawDeg > 2); // focus still within 1 m, yaw 2.9 deg off
  // fly: compass yaw from north (-z) clockwise, pitch up positive
  const fly = poseResidual({ p: [1000, 300, 2000], f: [Math.sin(Math.PI / 2) * Math.cos(-0.1745), Math.sin(-0.1745), -Math.cos(Math.PI / 2)] }, { character: false, x: 1000, z: 2000, yaw: 90, pitch: -10 });
  assert.equal(fly.ok, true);
});

test("c10 pose gate: a camera that arrives late opens the gate only after 3 consecutive frames at the pose", async () => {
  const { installPoseProbe, poseResidual, poseReadyJs, poseTarget } = await import("./pod-capture-lib.mjs");
  const { r, win } = fakeClassicPage();
  let t = 0; win.performance.now = () => t;
  win.__STUDIO_CHARACTER_DEBUG__ = { cameraArm: () => 5, playerY: () => 50 };
  const intervals = []; win.setInterval = (f) => intervals.push(f); win.clearInterval = () => {};
  const renderer = r; win.__RENDERER__ = null;
  installPoseProbe(win, poseResidual, 3);
  win.__RENDERER__ = renderer; intervals[0](); // the renderer appears after the init script
  const target = poseTarget("http://h/s/?view=character&x=4.02&z=4.61&rate=0.5", [-Math.PI / 2]);
  const read = () => new Function("window", `return ${poseReadyJs(target)}`)(win);
  const cam = (x, z, fx, fz) => ({ isPerspectiveCamera: true, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, -fx, 0, -fz, 0, x, 51, z, 1] } });
  assert.equal(read().ready, false); // target set
  const frame = (c) => { win.__RAFN++; t += 16; renderer.render([], c); };
  frame(cam(0, 0, 0, -1)); frame(cam(0, 0, 0, -1)); // the boot camera over open water
  frame(cam(4015, 4610, 1, 0)); frame(cam(4015, 4610, 1, 0)); // at the pose two frames
  frame(cam(4015, 4612.5, 1, 0)); // one frame 2.5 m off resets the count
  frame(cam(4015, 4610, 1, 0)); frame(cam(4015, 4610, 1, 0));
  // frame 8: a water reflection camera (off the pose, into a target) and the scene camera into a composer target
  win.__RAFN++; t += 16;
  renderer.setRenderTarget({ texture: { name: "reflection" } }); renderer.render([], cam(4015, 4590, 1, 0));
  renderer.setRenderTarget({ texture: { name: "ShadowMap" } }); renderer.render([], cam(0, 0, 0, -1)); // shadow targets never scored
  renderer.setRenderTarget({ texture: { name: "composer" } }); renderer.render([], cam(4015, 4610, 1, 0));
  renderer.setRenderTarget(null);
  assert.equal(read().ready, false, JSON.stringify(read())); // frame 8 closes on the next frame's first render
  frame(cam(4015, 4610, 1, 0));
  const p = read();
  assert.equal(p.ready, true, JSON.stringify(p)); assert.equal(p.residual.posM, 0); assert.equal(p.residual.yawDeg, 0); assert.equal(p.frames, 8);
  assert.ok(Math.abs(p.at - 0.144) < 1e-9);
});

test("c10 program-error probe: VALIDATE_STATUS failures name the program's attributes and the object that linked it", async () => {
  const { installProgramErrorProbe } = await import("./pod-capture-lib.mjs");
  const src = "#version 300 es\nlayout(location = 0) in vec3 position;\nlayout(location = 11) in vec4 nodeAttribute11;\nin vec2 uv;\nvoid main() {}";
  class WebGL2RenderingContext {
    linkProgram() {} getProgramParameter(p, n) { return n === 0x8b83 ? false : true; } getProgramInfoLog() { return ""; }
    getAttachedShaders(p) { return p.shaders; } getShaderParameter(sh, n) { return n === 0x8b4f ? sh.type : null; } getShaderSource(sh) { return sh.src; }
  }
  const logged = [];
  const win = { WebGL2RenderingContext, console: { error: (...a) => logged.push(a.join(" ")) }, __RENDERER__: null, setInterval: () => 1, clearInterval: () => {} };
  const backend = { createRenderPipeline(ro) { gl.linkProgram(ro.prog); }, draw() {} };
  win.__RENDERER__ = { backend };
  installProgramErrorProbe(win);
  const gl = new WebGL2RenderingContext();
  const prog = { shaders: [{ type: 0x8b30, src: "frag" }, { type: 0x8b31, src }] };
  backend.createRenderPipeline({ prog, object: { name: "veg-gpucull", type: "InstancedMesh", isInstancedMesh: true, userData: { perfTag: "veg" } }, material: { name: "bark", type: "MeshStandardNodeMaterial" } });
  win.console.error(`THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS ${gl.getProgramParameter(prog, 0x8b83)}\n\nProgram Info Log: ERROR 0:349 Attribute location out of range`);
  win.console.error("unrelated");
  assert.equal(logged.length, 2); // the page's own log still prints
  assert.equal(win.__programErrors.length, 1);
  const e = win.__programErrors[0];
  assert.deepEqual(e.attributes, ["0:position", "11:nodeAttribute11", "uv"]);
  assert.deepEqual(e.by, { perfTag: "veg", name: "veg-gpucull", type: "InstancedMesh", instanced: true, material: "bark", materialType: "MeshStandardNodeMaterial" });
  assert.match(e.message, /VALIDATE_STATUS false/);
});

test("c10 view set: a URL with scenario/visualScenario/validation fails loudly; long views shoot every 10 s from the first frame", async () => {
  const { viewShots, shotTime, viewEndS } = await import("./pod-capture-lib.mjs");
  for (const k of ["scenario=portrait", "visualScenario=1", "validation=1"]) {
    assert.throws(() => parseViews(JSON.stringify([{ name: "a", url: `http://x/?view=character&rate=0.5&${k}` }])), /never in a capture/);
  }
  assert.throws(() => parseViews(JSON.stringify([{ name: "a", url: "http://x/?rate=0.5", long: -1 }])), /"long"/);
  const v = parseViews(JSON.stringify([{ name: "LONG", url: "http://x/?view=character&rate=0.5&w=clear", long: 180 }]))[0];
  const shots = viewShots(v, undefined, 60);
  assert.equal(shots[0], 0); assert.equal(shots.at(-1), 180); assert.equal(shots.length, 19);
  assert.equal(shotTime(v, 40, null, null), -1); assert.equal(shotTime(v, 40, null, 15), 25);
  assert.equal(viewEndS(v, 60, null), Infinity); assert.equal(viewEndS(v, 60, 15), 195); assert.equal(viewEndS({}, 60, 15), 60);
});

test("c10 harness2: frames count from the pose gate, never page start", async () => {
  const { shotTime, viewShots, framesBeforePose } = await import("./pod-capture-lib.mjs");
  const view = { name: "v", url: "/x" }, shots = viewShots(view, "500@60,2000", 120);
  // fake page: the pose gate passes at 9.0 s; a frame is due when shotTime >= next shot
  let si = 0; const taken = [];
  for (let s = 0; s <= 12; s += 0.1) {
    const poseAt = s >= 9 ? 9 : undefined;
    if (poseAt === undefined) continue;
    const t = shotTime(view, s, null, null, poseAt);
    if (si < shots.length && t >= shots[si]) { taken.push(s); while (si < shots.length && shots[si] <= t) si++; }
  }
  assert.ok(taken.length > 0 && Math.min(...taken) >= 9 - 1e-9, `first frame ${taken[0]}`);
  assert.equal(shotTime(view, 5, null, null, 9) < 0, true);
  assert.equal(shotTime(view, 5, null, null, null), 5, "pose never passed: counts from page start");
  assert.equal(framesBeforePose(view, null), true);
  assert.equal(framesBeforePose(view, 9.1), false);
  assert.equal(framesBeforePose({ plain: true }, undefined), false);
});

test("c10 harness2: kits arrived -> last pipeline build", async () => {
  const { kitsArrivedS, buildsAfterKits, readyGateLine } = await import("./pod-capture-lib.mjs");
  const entries = [
    { name: "https://h/webgpu/kits/a/a.glb", responseEnd: 4200 }, { name: "https://h/kits/b.glb?v=1", responseEnd: 6840 },
    { name: "https://h/webgpu/kits/a/a.ktx2", responseEnd: 9000 }, { name: "https://h/terrain/t.glb", responseEnd: 9500 },
  ];
  assert.equal(kitsArrivedS(entries), 6.8);
  assert.equal(kitsArrivedS([]), null);
  const lt = { builds: { count: 40, ms: 900, last: 11.3 } };
  const m = buildsAfterKits(entries, lt, true);
  assert.deepEqual([m.kitsArrivedS, m.lastBuildS, m.buildsAfterKitsS, m.buildsAfterKits], [6.8, 11.3, 4.5, null]);
  const dev = buildsAfterKits(entries, lt, false);
  assert.equal(dev.na, true); assert.equal(dev.buildsAfterKitsS, null);
  const line = readyGateLine({ poseAt: 9.1, readyS: 4, final: { buildQueue: { pending: 0 } }, kitsArrivedS: m.kitsArrivedS, lastBuildS: m.lastBuildS, buildsAfterKitsS: m.buildsAfterKitsS, loadAfterKits: m });
  assert.match(line, /kits arrived 6.8 s, last build 11.3 s, builds after kits 4.5 s/);
  assert.match(readyGateLine({ poseAt: 9.1, kitsArrivedS: 6.8, loadAfterKits: dev }), /builds after kits n\/a/);
  assert.match(readyGateLine({ poseAt: null, poseTimedOut: true, framesBeforePose: true }), /FRAMES BEFORE POSE/);
});
