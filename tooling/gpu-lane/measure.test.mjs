import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHud } from "./hud-parse.mjs";

const sample = [
  "Riverwalk · night · vis ~120 m · N 0° · 0.0 m/s",
  "perf ▾ 58 fps",
  "veg: 58 fps · gpu ~12.3/20.1 ms · cpu 4.2/8 ms · calls 512 · gate 0.3/1 ms · draws 40 (ranges 12)",
  "gc: rebuilds 0/s · gen 1/2 ms",
  "tris 3.2M / budget 4.0M: terrain 1.0M+0.5M · veg 1.2M+0.3M (near 0.4M · mid 0.5M · far 0.2M · card 0.1M) · places 0.1M+0.0M · hidden 3c/2s",
  "gpu(wall, not work on Metal): pre 0.1 · sky 0.4 · scene 6.2 (max 9.0) · water 1.5 · post 0.3",
  "cpu by stage: pre 0.2 · veg 1.1 (max 3.0) · scene 2.0",
  "post on · bloom gpu 0.40 ms · cpu 0.10 ms",
].join("\n");

test("parses the HUD lines into numbers", () => {
  const h = parseHud(sample);
  assert.equal(h.fps, 58);
  assert.equal(h.gpuMs, 12.3);
  assert.equal(h.gpuWall, true);
  assert.equal(h.cpuMaxMs, 8);
  assert.equal(h.drawCalls, 512);
  assert.equal(h.tris, 3_200_000);
  assert.equal(h.trisBudget, 4_000_000);
  assert.deepEqual(h.trisByGroup.veg, { main: 1_200_000, shadow: 300_000 });
  assert.deepEqual(h.trisByGroup.places, { main: 100_000, shadow: 0 });
  assert.deepEqual(h.hidden, { chunks: 3, sectors: 2 });
  assert.deepEqual(h.gpuByPass.scene, { avg: 6.2, max: 9 });
  assert.equal(h.gpuByPass.post.avg, 0.3);
  assert.deepEqual(h.cpuByStage.veg, { avg: 1.1, max: 3 });
});

test("n/a GPU timer and a closed HUD give nulls", () => {
  const h = parseHud("veg: off · 30 fps · gpu n/a · cpu 3/5 ms · calls 10\ngpu by pass: n/a");
  assert.equal(h.fps, 30);
  assert.equal(h.gpuMs, null);
  assert.equal(h.gpuByPass, null);
  assert.equal(parseHud("").tris, null);
});

test("frame stats: mean fps, min and 1 % low from rAF timestamps", async () => {
  const { frameStats } = await import("./measure.mjs");
  const ts = [0];
  for (let i = 1; i <= 200; i++) ts.push(ts[i - 1] + (i === 100 ? 50 : 10));
  const s = frameStats(ts);
  assert.equal(s.frames, 200);
  assert.equal(s.minFps, 20);
  assert.equal(s.p1LowFps, 33.33);
  assert.equal(s.settledFps, 98.04);
});

test("workStats: cost = max(work, gpu), uncapped fps from the mean, 1 % low from p99, hitches > 33 ms", async () => {
  const { workStats } = await import("./measure.mjs");
  const frames = [];
  for (let i = 0; i < 100; i++) frames.push({ t: i * 17, dt: i === 50 ? 40 : 17, work: i === 50 ? 30 : 8, gpu: 10 });
  const s = workStats(frames);
  assert.equal(s.workFrames, 100);
  assert.equal(s.costMs.mean, 10.2); // 99 × 10 (gpu wins) + 30
  assert.equal(s.uncappedFps, 98.04);
  assert.equal(s.p1LowUncapped, 33.33); // p99 index 99 of 100 sorted = 30
  assert.deepEqual(s.workMs, { mean: 8.22, p50: 8, p99: 30, max: 30 });
  assert.deepEqual(s.hitches, [{ t: 850, dt: 40, work: 30, gpu: 10 }]);
  assert.equal(workStats([{ t: 0, dt: 0, work: 5, gpu: null }]).uncappedFps, 200, "no GPU timer: work alone");
});

test("profileSummary: self time per function and per file from samples and deltas", async () => {
  const { profileSummary } = await import("./measure.mjs");
  const cf = (functionName, url, lineNumber) => ({ functionName, url, lineNumber, columnNumber: 0 });
  const profile = { nodes: [{ id: 1, callFrame: cf("(root)", "", -1) }, { id: 2, callFrame: cf("a", "http://x/assets/index.js", 9) },
    { id: 3, callFrame: cf("b", "http://x/assets/Char.js", 0) }], samples: [2, 2, 3, 1], timeDeltas: [0, 1000, 1000, 2000, 0] };
  const p = profileSummary(profile);
  assert.equal(p.totalMs, 4);
  assert.deepEqual(p.topSelf[0], { name: "a index.js:10:1", selfMs: 2, pct: 50 });
  assert.deepEqual(p.byFile.map((x) => x.name), ["index.js", "Char.js", "((root))"]);
});

test("profile token: a diag spot, and its top self-time functions per frame with url:line", async () => {
  const { profileTopPerFrame } = await import("./measure.mjs");
  const { parseSpots, isDiagnosisSpot } = await import("./spots.mjs");
  const [s] = parseSpots("aprof ?view=character&rate=30 profile\n");
  assert.equal(s.probes.profile, true);
  assert.equal(isDiagnosisSpot(s), true);
  assert.equal(isDiagnosisSpot(parseSpots("a ?view=character&rate=30\n")[0]), false);
  const cf = (functionName, url, lineNumber) => ({ functionName, url, lineNumber, columnNumber: 0 });
  const profile = { nodes: [{ id: 1, callFrame: cf("(root)", "", -1) }, { id: 2, callFrame: cf("a", "http://x/assets/index.js", 9) },
    { id: 3, callFrame: cf("b", "http://x/assets/Char.js", 0) }], samples: [2, 2, 3, 1], timeDeltas: [0, 1000, 1000, 2000, 0] };
  const top = profileTopPerFrame(profile, 4, 2);
  assert.deepEqual(top, [{ name: "a", at: "http://x/assets/index.js:10", msPerFrame: 0.5 }, { name: "b", at: "http://x/assets/Char.js:1", msPerFrame: 0.5 }]);
});

test("readyTris: the exact HUD stat wins over the 0.1 M-rounded text, so a small interior gets ready (perf-diag23 Q3)", async () => {
  const { readyTris, isReady } = await import("./measure.mjs");
  const hut = "veg: 551 fps\ntris 0.0M / budget 4.0M: terrain 0.0M+0.0M";
  assert.equal(readyTris(31234, hut), 31234);
  assert.equal(readyTris(undefined, hut), 0, "text fallback still rounds");
  assert.equal(readyTris(undefined, "tris 3.2M / budget 4.0M:"), 3.2e6);
  const samples = Array.from({ length: 26 }, (_, i) => ({ t: i * 1000, fps: 551, loading: false, pre: 0, gc: 0, tris: readyTris(31234, hut) }));
  assert.equal(isReady(samples), true);
});

test("isReady: 20 s, tris stable 2 % for 5 s, no Loading, pre and gc under 2 ms for 5 s", async () => {
  const { isReady } = await import("./measure.mjs");
  const at = (t, tris, extra = {}) => ({ t, tris, fps: 60, loading: false, pre: 0.5, gc: 0.3, ...extra });
  const run = (from, to, f = (t) => at(t, 3.2e6)) => { const o = []; for (let t = from; t <= to; t += 1000) o.push(f(t)); return o; };
  assert.equal(isReady(run(0, 25000)), true, "settled scene");
  assert.equal(isReady(run(0, 12000)), false, "under 20 s since navigation");
  assert.equal(isReady(run(15000, 25000), { startT: 0 }), true, "startT counts from navigation");
  assert.equal(isReady(run(9000, 14000), { startT: 0 }), false, "stable but only 14 s in");
  assert.equal(isReady(run(0, 25000, (t) => at(t, 3.2e6 + (t > 21000 ? 5e5 : 0)))), false, "tris still moving");
  assert.equal(isReady(run(0, 25000, (t) => at(t, 3.2e6, { loading: t === 25000 }))), false, "loading line");
  assert.equal(isReady(run(0, 25000, (t) => at(t, 3.2e6, { fps: t === 25000 ? 0 : 60 }))), false, "no fps yet");
  assert.equal(isReady(run(0, 25000, (t) => at(t, 3.2e6, { pre: t === 22000 ? 12 : 0.5 }))), false, "pre stage busy");
  assert.equal(isReady(run(0, 25000, (t) => at(t, 3.2e6, { gc: t === 24000 ? 8 : 0.3 }))), false, "gc stage busy");
  assert.equal(isReady(run(0, 25000, (t) => at(t, 3.2e6, { pre: null, gc: null }))), false, "no CPU stage line");
  const loadingThenQuiet = run(0, 30000, (t) => at(t, 3.2e6, { pre: t < 16000 ? 14 : 0.5 }));
  assert.equal(isReady(loadingThenQuiet.filter((s) => s.t <= 20000)), false, "pre busy until 16 s");
  assert.equal(isReady(loadingThenQuiet), true, "quiet for the last 5 s");
});

test("closeOrphanPages opens a blank keeper page first, closes every other page and counts them", async () => {
  const { closeOrphanPages } = await import("./measure.mjs");
  const closed = [];
  const page = (id) => ({ close: async () => { closed.push(id); if (id === "b") throw new Error("gone"); } });
  const keeper = page("keeper");
  const ctx0 = { newPage: async () => keeper, pages: () => [page("a"), page("b"), keeper] };
  const browser = { contexts: () => [ctx0, { pages: () => [] }, { pages: () => [page("c")] }] };
  const r = await closeOrphanPages(browser);
  assert.equal(r.closed, 3);
  assert.equal(r.keep, keeper);
  assert.deepEqual(closed, ["a", "b", "c"], "the keeper is never closed");
  assert.deepEqual(await closeOrphanPages({ contexts: () => [] }), { closed: 0, keep: null });
});

test("parseArgs: --smoke defaults to spot a, 40 s gate, 5 s settle, one shot; --census and --diag", async () => {
  const { parseArgs, SPOT_A } = await import("./measure.mjs");
  const s = parseArgs(["--smoke"]);
  assert.deepEqual(s.url, [`${SPOT_A}&rate=0.5`]);
  assert.equal(s.run, "smoke");
  assert.equal(s.clean, "1");
  assert.equal(s.readyTimeout, 40);
  assert.equal(s.settle, 5);
  assert.equal(s.shots, true);
  assert.equal(parseArgs(["--smoke", "--url", "?x=1", "--url", "?x=2"]).url.length, 1, "one spot only");
  const c = parseArgs(["--run", "r", "--url", "?x=1&diag=heap", "--census", "--diag", "relink"]);
  assert.equal(c.census, true);
  assert.deepEqual(c.diagList.sort(), ["heap", "relink"]);
  assert.throws(() => parseArgs(["--run", "r", "--url", "?x=1", "--diag", "nope"]), /unknown --diag probe/);
  assert.deepEqual(parseArgs(["--run", "r", "--url", "?x=1"]).diagList, []);
});

test("meanLuma and the black-frame check: night shots (29, 36) pass, a black frame fails", async () => {
  const { meanLuma, smokeProblems } = await import("./measure.mjs");
  const px = (r, g, b, n = 100) => Array.from({ length: n }, () => [r, g, b, 255]).flat();
  assert.equal(Math.round(meanLuma(px(255, 255, 255))), 255);
  assert.equal(meanLuma(px(0, 0, 0)), 0);
  const ok = { ready: true, readyS: 25, uncappedFps: 90, consoleErrors: [], contextLost: 0, foreign: [] };
  // tooling/.reports/gpu-lane/r3-ab/url0-settled.jpg measures 29.07 and url1-settled.jpg 36.57 (PIL mean of L): both pass.
  assert.deepEqual(smokeProblems({ ...ok, luma: 29.07 }), []);
  assert.deepEqual(smokeProblems({ ...ok, luma: 36.57 }), []);
  assert.match(smokeProblems({ ...ok, luma: 2 })[0], /black frame/);
  assert.match(smokeProblems({ ...ok, luma: null })[0], /no screenshot/);
});

test("viewProblem: a character URL left on the map page or suspended fails at 10 s, naming the stage", async () => {
  const { viewProblem, smokeProblems } = await import("./measure.mjs");
  const ok = { view: "character", shown: true, canvas: true, lastMark: "es:load:warm-gate", inFlight: [] };
  assert.equal(viewProblem(ok, "character", 30), null);
  assert.equal(viewProblem({ ...ok, view: null }, "character", 9.5), null); // still in time
  assert.equal(viewProblem({ ...ok, view: null }, null, 30), null); // the map view is not checked
  // c12s1: only es:load:first-present, the overlay hidden, the ground raster never finishing.
  const c12 = viewProblem({ ...ok, shown: false, canvas: false, lastMark: "es:load:first-present",
    inFlight: [["http://x/elder-souls-argonia/studio/province/refined/ground-control.png", 9.1]] }, "character", 10.2);
  assert.match(c12, /^view: character view mounted but hidden after 10.2 s/);
  assert.match(c12, /last load mark es:load:first-present; in flight: province\/refined\/ground-control.png 9.1 s/);
  assert.match(viewProblem({ ...ok, view: null }, "character", 10), /not mounted .*the map page/);
  assert.match(viewProblem({ ...ok, view: "character-error" }, "character", 10), /page shows character-error/);
  assert.equal(viewProblem({ ...ok, canvas: false }, "character", 15), null);
  assert.match(viewProblem({ ...ok, view: "fly3d", canvas: false }, "fly3d", 20), /no canvas after 20 s/);
  const r = { ready: false, readyS: 10.2, uncappedFps: 90, luma: 30, consoleErrors: [], contextLost: 0, foreign: [], viewStall: c12 };
  assert.equal(smokeProblems(r)[0], c12);
});

test("smokeProblems: vsync cap, ready gate, GPU errors, lost context, foreign pages", async () => {
  const { smokeProblems } = await import("./measure.mjs");
  const ok = { ready: true, readyS: 25, uncappedFps: 90, luma: 30, consoleErrors: ["404 foo"], contextLost: 0, foreign: [] };
  assert.deepEqual(smokeProblems(ok), []);
  assert.match(smokeProblems({ ...ok, uncappedFps: 58.4 })[0], /vsync cap/);
  assert.match(smokeProblems({ ...ok, readyS: 41 })[0], /ready gate took 41 s/);
  assert.match(smokeProblems({ ...ok, ready: false, readyS: 40 })[0], /never passed/);
  assert.match(smokeProblems({ ...ok, consoleErrors: ["THREE.WebGLRenderer: Context Lost."] })[0], /GPU\/WebGL console error/);
  assert.match(smokeProblems({ ...ok, contextLost: 1 })[0], /context lost 1x/);
  assert.match(smokeProblems({ ...ok, foreign: ["https://x/studio/"] })[0], /did not open/);
});

test("foreignPages lists pages the run did not open", async () => {
  const { foreignPages } = await import("./measure.mjs");
  const p = (u) => ({ url: () => u });
  const mine = p("about:blank"), theirs = p("http://x/studio/");
  assert.deepEqual(foreignPages({ contexts: () => [{ pages: () => [mine, theirs] }] }, new Set([mine])), ["http://x/studio/"]);
});

test("heapGrowth: functions whose retained sampled bytes grew between two sampling profiles", async () => {
  const { heapGrowth } = await import("./checks.mjs");
  const p = (a, b) => ({ head: { callFrame: { functionName: "root" }, selfSize: 0, children: [
    { callFrame: { functionName: "a", url: "http://x/i.js", lineNumber: 0 }, selfSize: a },
    { callFrame: { functionName: "b", url: "http://x/i.js", lineNumber: 1 }, selfSize: b }] } });
  assert.deepEqual(heapGrowth(p(1e6, 5e6), p(3e6, 1e6)), [{ name: "a i.js:1", MB: 2 }]);
});

test("hitchList: frames over 20 ms with the top self-time functions of the samples inside them", async () => {
  const { hitchList } = await import("./measure.mjs");
  const cf = (functionName, lineNumber) => ({ functionName, url: "http://x/assets/index.js", lineNumber, columnNumber: 0 });
  // profile clock = page clock + 1000 ms; one sample per ms from page t=100.
  const nodes = [{ id: 1, callFrame: cf("(root)", -1) }, { id: 2, callFrame: cf("slow", 4) }, { id: 3, callFrame: cf("fast", 9) }];
  const samples = [], timeDeltas = [];
  for (let t = 100; t < 140; t++) { samples.push(t < 130 ? 2 : 3); timeDeltas.push(t === 100 ? 0 : 1000); }
  const hs = hitchList([90, 100, 140, 150], { nodes, samples, timeDeltas, startTime: 1100 * 1000 }, 1000);
  assert.equal(hs.length, 1);
  assert.equal(hs[0].frameMs, 40);
  assert.deepEqual(hs[0].top[0], { name: "slow index.js:5:1", selfMs: 30 });
  assert.equal(hs[0].top[1].name, "fast index.js:10:1");
});

test("parseArgs: --trace is a flag, --aim and --clean take values", async () => {
  const { parseArgs } = await import("./measure.mjs");
  const o = parseArgs(["--run", "x", "--url", "?a=1", "--trace", "--aim", "0.5,-0.2", "--clean", "1", "--walk", "20"]);
  assert.equal(o.trace, true);
  assert.equal(o.aim, "0.5,-0.2");
  assert.equal(o.clean, "1");
  assert.equal(o.walk, 20);
  assert.equal(parseArgs(["--run", "x", "--url", "?a=1"]).trace, false);
});

test("frameStats counts frames over 20 and 33 ms", async () => {
  const { frameStats } = await import("./measure.mjs");
  const s = frameStats([0, 10, 35, 60, 100]);
  assert.equal(s.over20, 3);
  assert.equal(s.over33, 1);
});

test("classifyFrames: long frames on the main thread with their causes", async () => {
  const { classifyFrames } = await import("./trace-frames.mjs");
  const fa = (ts) => ({ name: "FireAnimationFrame", ph: "X", pid: 1, tid: 1, ts, dur: 1000 });
  const ev = [
    { ph: "M", name: "process_name", pid: 2, args: { name: "GPU Process" } },
    fa(0), fa(10000), fa(60000), fa(70000), fa(130000), // the last interval is the harness end frame
    { name: "MajorGC", ph: "X", pid: 1, tid: 1, ts: 12000, dur: 20000 },
    { name: "CommandBufferStub::OnAsyncFlush", ph: "X", pid: 2, tid: 5, ts: 30000, dur: 10000 },
  ];
  const r = classifyFrames(ev);
  assert.equal(r.frames, 3);
  assert.equal(r.over33, 1);
  assert.equal(r.long.length, 1);
  assert.equal(r.long[0].ms, 50);
  assert.deepEqual(r.long[0].byCause, { gc: 20 });
  assert.deepEqual(r.long[0].offMain, { gpu: 10 });
});

test("parseSpots: x<N> repeats a spot under numbered names", async () => {
  const { parseSpots } = await import("./spots.mjs");
  const s = parseSpots("a ?x=1\ne ?x=2 walk=20 x3\n");
  assert.deepEqual(s.map((x) => x.name), ["a", "e", "e2", "e3"]);
  assert.deepEqual(s[3].steps, [{ w: 20 }]);
});
test("parseSteps: w and signed yaw segments; bad tokens refused", async () => {
  const { parseSpots, parseSteps, stepsSeconds } = await import("./spots.mjs");
  const s = parseSteps("w:7,yaw:+1.2,w:6,yaw:-2.0,w:7");
  assert.deepEqual(s, [{ w: 7 }, { yaw: 1.2 }, { w: 6 }, { yaw: -2 }, { w: 7 }]);
  assert.equal(stepsSeconds(s), 20);
  for (const bad of ["w:0", "yaw:1.2,w:3", "w:3,yaw:x", "w:3,,w:2", "run:3", "yaw:+1"]) assert.throws(() => parseSteps(bad), /bad step|at least one/, bad);
  assert.deepEqual(parseSpots("m ?x=1 steps=w:2,yaw:-0.5,w:1\n")[0].steps, [{ w: 2 }, { yaw: -0.5 }, { w: 1 }]);
  assert.throws(() => parseSpots("m ?x=1 steps=w:2,turn:1"), /spots line 1: bad step/);
});
test("stepsSchedule: W held across the whole sequence, yaw set absolute from the base, times from the steps string", async () => {
  const { stepsSchedule } = await import("./measure.mjs");
  const { parseSteps } = await import("./spots.mjs");
  const f = (s) => s.map((e) => (e.k === "aim" ? `${e.at} aim ${e.yaw.toFixed(2)}` : `${e.at} ${e.down ? "down" : "up"}`));
  assert.deepEqual(f(stepsSchedule(parseSteps("w:7,yaw:+1.2,w:6,yaw:-2.0,w:7"), 0.5)),
    ["0 aim 0.50", "0 down", "7000 aim 1.70", "13000 aim -0.30", "20000 up"]);
  assert.deepEqual(f(stepsSchedule([{ w: 20 }])), ["0 down", "20000 up"], "a plain walk does not re-aim the camera");
});
test("sample plays a steps= route in the page: no page.evaluate between window open and close, events at the schedule's times", async () => {
  const { sample, stepsSchedule } = await import("./measure.mjs");
  const { parseSteps } = await import("./spots.mjs");
  const lane = { ts: [], frames: [], wrapMs: 0, on: false };
  const log = [], seen = [];
  const t0 = performance.now();
  globalThis.KeyboardEvent = class { constructor(type, init) { this.type = type; this.code = init.code; } };
  globalThis.window = { __GPU_LANE__: lane, dispatchEvent: (e) => seen.push([`${e.type} ${e.code}`, performance.now() - t0]),
    __STUDIO_CHARACTER_DEBUG__: { aimCamera: (y) => seen.push([`aim ${y.toFixed(2)}`, performance.now() - t0]) } };
  const page = { evaluate: async (fn, arg) => { log.push(["evaluate", lane.on]); return fn(arg); } };
  // 1 ms per step second keeps the test fast: w:0.04 = 40 ms.
  const steps = parseSteps("w:0.04,yaw:+1.2,w:0.03");
  const r = await sample(page, 0.07, null, async (ms) => { log.push(["wait"]); await new Promise((res) => setTimeout(res, ms)); }, undefined, stepsSchedule(steps, 0.5));
  delete globalThis.window; delete globalThis.KeyboardEvent;
  assert.deepEqual(log.map((l) => l[0]), ["evaluate", "wait", "evaluate"], "only the window-open and window-read evaluates");
  assert.equal(log[2][1], false, "the read runs after the page closed the window");
  assert.deepEqual(seen.map((s) => s[0]), ["aim 0.50", "keydown KeyW", "aim 1.70", "keyup KeyW"]);
  // Page timers never fire early; under a loaded test run they fire late, so only the lower bound is tight.
  for (const [i, at] of [0, 0, 40, 70].entries()) assert.ok(seen[i][1] >= at - 2 && seen[i][1] - at < 150, `${seen[i][0]} at ${seen[i][1]} ms, want ${at}`);
  assert.equal(r.route.done, true);
  assert.deepEqual(r.route.fired.map((x) => x[0]), ["aim", "key", "aim", "key"]);
});
test("hold frames: every frame through the clean screenshot path (HUD hidden, then restored), ms names when sub-second", async () => {
  const { takeHoldShots, holdName } = await import("./measure.mjs");
  const log = [];
  const page = { evaluate: async () => { log.push("evaluate"); }, screenshot: async ({ path }) => { log.push(`shot ${path}`); } };
  const t0 = Date.now();
  const shots = await takeHoldShots(page, { s: 0.6, every: 0.2 }, (t) => holdName(t), true, t0, undefined, async () => {});
  assert.ok(shots.length >= 1);
  assert.equal(shots[0], "hold-000s");
  for (let i = 0; i < shots.length; i++) assert.deepEqual(log.slice(i * 3, i * 3 + 3), ["evaluate", `shot ${shots[i]}`, "evaluate"], "hide HUD, shoot, restore");
  assert.deepEqual([holdName(0.2), holdName(5), holdName(170), holdName(1.5)], ["hold-0200ms", "hold-005s", "hold-170s", "hold-1500ms"]);
});
test("sample: the window closes in the page, and no page.evaluate runs between its start and its end", async () => {
  const { sample } = await import("./measure.mjs");
  const lane = { ts: [], frames: [], wrapMs: 0, on: false };
  const log = [];
  globalThis.window = { __GPU_LANE__: lane };
  const page = { evaluate: async (fn, arg) => { log.push(["evaluate", lane.on]); return fn(arg); } };
  const wait = async (ms) => { log.push(["wait"]); await new Promise((r) => setTimeout(r, ms)); };
  const r = await sample(page, 0.05, null, wait);
  delete globalThis.window;
  assert.deepEqual(log.map((l) => l[0]), ["evaluate", "wait", "evaluate"]);
  assert.equal(log[2][1], false, "the page's own timer had already closed the window before the harness read it");
  assert.ok(Array.isArray(r.ts));
});
test("gen-matrix: 15 deterministic lines, coordinates from places.json", async () => {
  const { matrix, PLACES, PLACES_JSON } = await import("./spots/gen-matrix.mjs");
  const { parseSpots } = await import("./spots.mjs");
  const { readFileSync } = await import("node:fs");
  const text = readFileSync(new URL(`../../${PLACES_JSON}`, import.meta.url), "utf8");
  const out = matrix(text);
  assert.equal(out, matrix(text));
  assert.equal(out, readFileSync(new URL("./spots/matrix.txt", import.meta.url), "utf8"), "matrix.txt is the generator's output");
  const lines = out.split("\n").filter((l) => l && !l.startsWith("#"));
  assert.equal(lines.length, 15);
  const byId = new Map(JSON.parse(text).places.map((p) => [p.id, p]));
  for (const [id, short] of PLACES) {
    const [x, z] = byId.get(id).positionM;
    assert.ok(lines.includes(`${short}-t22-rain ?view=character&x=${(x / 1000).toFixed(4)}&z=${(z / 1000).toFixed(4)}&t=22&w=rain&rate=0.5 steps=w:7,yaw:+1.2,w:6,yaw:-2.0,w:7`), short);
  }
  assert.equal(parseSpots(out).length, 17);
});
test("loadTimeline: kit and all-request totals, MB before the warm gate, es:load marks; the cold token", async () => {
  const { buildLoadTimeline, loadTimelineText } = await import("./measure.mjs");
  const MB = 1048576;
  const l = buildLoadTimeline({ nowMs: 40000,
    resources: [["/a/index.js", 100, 900, 2 * MB], ["/s/kits/x.glb", 5000, 9000, 3 * MB], ["/s/kits/y.glb", 6000, 30000, 1 * MB]],
    marks: [["es:load:first-present", 1200], ["es:load:warm-gate", 20000], ["other", 1]], programs: [[250, 3], [500, 40]] });
  assert.equal(l.firstPresentS, 1.2); assert.equal(l.readyS, 20); assert.equal(l.completeS, 40);
  assert.deepEqual(l.kits, { requests: 2, MB: 4, firstStartS: 5, lastEndS: 30 });
  assert.deepEqual(l.all, { requests: 3, MB: 6, firstStartS: 0.1, lastEndS: 30 });
  assert.equal(l.kitMBBeforeReady, 3, "the kit ending after the warm gate is not counted");
  assert.deepEqual(l.marks.map((m) => m.stage), ["first-present", "warm-gate"]);
  assert.match(loadTimelineText("g", l, true), /^g \(cold\): first present 1.2, ready 20, complete 40, scene complete 30; kits 2 req 4 MB 5-30 \(3 MB before ready\).*programs 40/);
  assert.equal(buildLoadTimeline({ nowMs: 7000 }).readyS, 7, "no warm-gate mark: ready is the harness gate");
  const { parseSpots } = await import("./spots.mjs");
  assert.equal(parseSpots("g ?view=x cold\nh ?view=x")[0].cold, true);
  assert.ok(!parseSpots("h ?view=x")[0].cold);
});

test("parseSpots: name, query, --aim and walk=; comments skipped; bad lines throw", async () => {
  const { parseSpots, parseBar, spotRows, summaryTable, heapSlope } = await import("./spots.mjs");
  const s = parseSpots("# c\na ?x=1&t=2  # night\n\ne ?x=1&t=2 --aim 0.5,-0.2 walk=20\n");
  const off = { diag: [], trace: false, traceGpu: false, traceV8: false, memoryInfra: false, heapsample: false, profile: false, profileWalk: false };
  assert.deepEqual(s, [{ name: "a", query: "?x=1&t=2", aim: "", steps: [], hold: null, probes: off }, { name: "e", query: "?x=1&t=2", aim: "0.5,-0.2", steps: [{ w: 20 }], hold: null, probes: off }]);
  const { isDiagnosisSpot } = await import("./spots.mjs");
  const h = parseSpots("ch ?x=1 hold=180/10\nch5 ?x=1 hold=60\n");
  assert.deepEqual(h.map((x) => x.hold), [{ s: 180, every: 10 }, { s: 60, every: 10 }]);
  assert.equal(isDiagnosisSpot(h[0]), true, "a hold row is never a bar row");
  assert.throws(() => parseSpots("a ?x=1 hold=3m"), /cannot read/);
  assert.deepEqual(parseSpots("f ?x=1 hold=3/0.2")[0].hold, { s: 3, every: 0.2 });
  assert.throws(() => parseSpots("a ?x=1 hold=3/0"), /every must be > 0/);
  assert.throws(() => parseSpots("a ?x=1\na ?x=2"), /duplicate/);
  assert.throws(() => parseSpots("a ?x=1 walk=fast"), /cannot read/);
  assert.throws(() => parseSpots("a"), /need/);
  assert.deepEqual(parseBar("83,69"), { fps: 83, p1low: 69 });
  assert.throws(() => parseBar("83"), /--bar/);
  const bar = parseBar("83,69");
  const [ok, ...none] = spotRows("a", { settledFps: 90, p1LowFps: 70, uncappedFps: 95, p1LowUncapped: 71, frameTimes: { maxMs: 21 }, over20: 3, over33: 0, ready: true }, bar);
  assert.equal(ok.pass, true);
  assert.equal(none.length, 0);
  const [still, walk] = spotRows("e", { settledFps: 100, p1LowFps: 80, walk: { seconds: 20, settledFps: 88, p1LowFps: 51, frameTimes: { maxMs: 129 }, over20: 9, over33: 4 }, ready: true }, bar);
  assert.equal(still.pass, true, "a walk spot's static settle is its own row");
  assert.equal(walk.pass, false, "and its walk window another");
  assert.equal(walk.fps, 88);
  assert.match(summaryTable([ok, still, walk], bar), /\| a \| 90 \| 70 \| 95 \| 71 \| 21 \| 3 \| 0 \| pass \|[\s\S]*\| e \| 100 [\s\S]*e \(walk 20 s\).*FAIL[\s\S]*2 of 3 spots pass \(0 diagnosis/);
  assert.equal(heapSlope([{ tS: 0, MB: 100 }, { tS: 30, MB: 110 }, { tS: 60, MB: 120 }]), 20);
  assert.equal(heapSlope([{ tS: 0, MB: 1 }]), null);
});

test("parseArgs: --spots builds one spot list, --leak keeps the first spot, --bar defaults 83,69", async () => {
  const { parseArgs } = await import("./measure.mjs");
  const o = parseArgs(["--run", "r", "--spots", new URL("./spots/perf10.txt", import.meta.url).pathname, "--no-pod"]);
  assert.deepEqual(o.spotList.map((s) => s.name), ["a", "b", "c", "d", "e", "e2", "e3", "f", "g", "h"]);
  assert.equal(o.spotList[9].aim, "1.4,0.1");
  assert.deepEqual(o.spotList[4].steps, [{ w: 20 }]);
  assert.equal(o.shots, true);
  assert.equal(o.clean, "1");
  assert.deepEqual(o.barParsed, { fps: 83, p1low: 69 });
  assert.equal(parseArgs(["--run", "r", "--spots", new URL("./spots/perf10.txt", import.meta.url).pathname, "--leak", "60", "--no-pod"]).spotList.length, 10, "--leak keeps every spot");
  assert.throws(() => parseArgs(["--run", "r", "--url", "?a=1", "--spots", "x"]), /replaces --url/);
  const u = parseArgs(["--run", "r", "--url", "?a=1", "--walk", "5", "--aim", "1,0"]);
  assert.deepEqual(u.spotList, [{ name: "url0", query: "?a=1", aim: "1,0", steps: [{ w: 5 }], diagList: [], diagnosis: false }]);
});

test("perf10-c4: probe tokens make diagnosis rows; they print `diag` and never count toward N of M", async () => {
  const { parseArgs, probeScript } = await import("./measure.mjs");
  const { spotRows, summaryTable } = await import("./spots.mjs");
  const o = parseArgs(["--run", "r", "--spots", new URL("./spots/perf10-c4.txt", import.meta.url).pathname, "--no-pod"]);
  assert.deepEqual(o.spotList.map((s) => s.name), ["a", "b", "c", "d", "e", "e2", "e3", "f", "g", "h", "ediag", "cdiag", "adiag", "atrace", "aprof", "apaused"]);
  assert.deepEqual(o.spotList.map((s) => s.diagnosis), [...Array(10).fill(false), true, true, true, true, true, false]);
  const [ed, cd, ad] = o.spotList.slice(10);
  assert.deepEqual(ed.probes, { diag: [], trace: true, traceGpu: true, traceV8: false, memoryInfra: true, heapsample: true, profile: false, profileWalk: false });
  assert.deepEqual(ed.steps, [{ w: 20 }]);
  assert.deepEqual(cd.probes, { diag: [], trace: true, traceGpu: true, traceV8: false, memoryInfra: false, heapsample: false, profile: false, profileWalk: false });
  assert.match(ad.query, /&diag=relink,heap$/, "the spot's probes ride its query so the guarded probe wakes there only");
  assert.deepEqual(ad.diagList, ["relink", "heap"]);
  assert.deepEqual(o.spotList[0].diagList, []);
  assert.equal(o.trace, false, "a spot token never turns a global trace on");
  assert.deepEqual(o.globalDiag, []);
  // A global probe flag makes every spot a diagnosis row.
  assert.ok(parseArgs(["--run", "r", "--url", "?a=1", "--profile", "5"]).spotList[0].diagnosis);
  assert.ok(parseArgs(["--run", "r", "--url", "?a=1&diag=relink"]).spotList[0].diagnosis);
  assert.throws(() => parseArgs(["--run", "r", "--url", "?a=1&diag=nope"]), /unknown --diag probe/);
  // Guarded injection: only a page whose diag= names the probe runs it; a global probe runs everywhere.
  const guarded = probeScript("relink", "window.ran = 1;", []);
  const run = (search) => { const w = {}; new Function("window", "location", guarded)(w, { search }); return w.ran === 1; };
  assert.equal(run("?x=1"), false);
  assert.equal(run("?x=1&diag=heap,relink"), true);
  assert.equal(probeScript("relink", "S", ["relink"]), "S");
  // Rows: the diagnosis spot fails the bar but prints diag and is excluded from the count.
  const bar = { fps: 83, p1low: 69 };
  const good = { ready: true, settledFps: 90, p1LowFps: 70, frameTimes: { maxMs: 20 } };
  const rows = [...spotRows("a", good, bar), ...spotRows("adiag", { ...good, settledFps: 10, diagnosis: true }, bar)];
  assert.deepEqual(rows.map((r) => r.pass), [true, "diag"]);
  assert.match(summaryTable(rows, bar), /\| adiag \|.*\| diag \|[\s\S]*1 of 1 spots pass \(1 diagnosis rows, not judged\)/);
  // Seen to fail: a diagnosis row counted as judged would read "1 of 2".
  assert.doesNotMatch(summaryTable(rows, bar), /of 2 spots/);
});

test("heapTopAllocators: allocated bytes by function and url:line, largest first, top N", async () => {
  const { heapTopAllocators } = await import("./checks.mjs");
  const n = (fn, line, selfSize, children = []) => ({ callFrame: { functionName: fn, url: "http://x/assets/a.js", lineNumber: line - 1 }, selfSize, children });
  const prof = { head: n("(root)", 0, 0, [n("grow", 10, 3e6, [n("tiny", 5, 1e3)]), n("decode", 20, 5e6), n("grow", 10, 1e6)]) };
  assert.deepEqual(heapTopAllocators(prof, 2), [{ name: "decode a.js:20", MB: 5 }, { name: "grow a.js:10", MB: 4 }]);
});

test("relink probe: every link names type and owner, shadow depth materials are flagged", async () => {
  const { readFileSync } = await import("node:fs");
  const vm = await import("node:vm");
  class GL { shaderSource() {} attachShader() {} linkProgram() {} }
  const win = { WebGL2RenderingContext: GL };
  const ctx = vm.createContext({ window: win, performance: { now: () => 1234.5 }, Object, Array, String, WeakMap, Map, Math });
  vm.runInContext(readFileSync(new URL("./probes/relink.js", import.meta.url), "utf8"), ctx);
  const gl = new GL();
  const R = {}; R.renderBufferDirect = function () { gl.linkProgram({}); };
  const grass = { type: "Mesh", name: "grass", parent: { name: "tile", parent: { type: "Scene" } } };
  const mat = { type: "MeshStandardMaterial", name: "leaf", transparent: true, defines: { USE_X: 1 }, customProgramCacheKey: () => "k".repeat(200) };
  grass.material = mat;
  R.renderBufferDirect(null, null, null, mat, grass);
  R.renderBufferDirect(null, null, null, { type: "MeshDepthMaterial", defines: {} }, grass);
  gl.linkProgram({});
  const ev = JSON.parse(JSON.stringify(win.__DIAG__.relink().events.map((e) => e[3]))); // out of the vm realm
  assert.equal(ev.length, 3);
  assert.deepEqual([ev[0].type, ev[0].owner, ev[0].parents, ev[0].transparent, ev[0].defines, ev[0].key.length, ev[0].depth, ev[0].t], ["MeshStandardMaterial", "grass", ["tile", "Scene"], true, ["USE_X"], 80, false, 1235]);
  assert.equal(ev[1].depth, true);
  assert.equal(ev[2].owner, "(outside draw)");
  assert.ok(ev.every((e) => e.type && e.owner));
});
test("CAPTURE_RATE is the game's own speed in the studio clock's units (world min per real s = GAME_TIME_SCALE / 60)", async () => {
  const { CAPTURE_RATE } = await import("./spots.mjs");
  const { readFileSync } = await import("node:fs");
  const clock = readFileSync(new URL("../../packages/world-time/src/clock.ts", import.meta.url), "utf8");
  const scale = Number(/export const GAME_TIME_SCALE = (\d+(?:\.\d+)?);/.exec(clock)[1]);
  assert.match(clock, /GAME_RATE_MIN_PER_S = GAME_TIME_SCALE \/ 60/, "worldClock.rate is world MINUTES per real second");
  assert.equal(CAPTURE_RATE, scale / 60);
  for (const f of ["./spots/perf10-c4.txt", "./spots/matrix.txt"]) {
    const rates = [...readFileSync(new URL(f, import.meta.url), "utf8").matchAll(/[?&]rate=([\d.]+)/g)].map((m) => Number(m[1]));
    assert.ok(rates.length && rates.every((r) => r === CAPTURE_RATE), `${f}: ${rates}`);
  }
});
test("hitchContext: nearest harness action within 500 ms and the worker's overlapping gap", async () => {
  const { harnessLogger, hitchContext, hitchContextText, frameSeries } = await import("./measure.mjs");
  let now = 1000;
  const hl = harnessLogger(() => now);
  hl.origin = 0;
  await hl.wrap("screenshot:settled", async () => { now = 1050; });
  now = 5000; await hl.wrap("trace:start", async () => { now = 5010; });
  const log = hl.entries();
  assert.deepEqual(log, [{ action: "screenshot:settled", t: 1000, ms: 50 }, { action: "trace:start", t: 5000, ms: 10 }]);
  const h = [{ t: 1300, dt: 100, work: 9 }, { t: 3000, dt: 40, work: 8 }, { t: 900, dt: 20, work: 5 }];
  const c = hitchContext(h, log, [[1210, 80]]);
  assert.equal(c.length, 2, "only dt > 33");
  assert.deepEqual(c[0].harness, { action: "screenshot:settled", t: 1000, dMs: 150 });
  assert.equal(c[0].workerGap, true);
  assert.equal(c[1].harness, null); assert.equal(c[1].workerGap, false);
  assert.equal(hitchContext(h, log, null)[0].workerGap, null);
  assert.match(hitchContextText("a", { settled: c })[0], /a settled: 100 ms at 1300 .*screenshot:settled .*worker gap yes/);
  assert.deepEqual(frameSeries([{ t: 1.234, dt: 16.667, work: 5.555, gpu: null }]), { t: [1.23], dt: [16.67], work: [5.56], gpu: [null] });
});

test("groundcover sub-timers: cumulative snapshots become per-frame columns and a >= 12 ms digest (perf10 c8)", async () => {
  const { gcDeltas, frameSeries, gcFramesDigest, gcFramesText, GC_SNAP, GC_COLUMNS } = await import("./measure.mjs");
  // Cumulative snapshot in GC_SNAP order; frame 2 is a refill frame (fill started, a 14 ms React render + effect).
  const snap = (o) => GC_SNAP.map((k) => o[k] ?? 0);
  const base = { gcUseFrame: 10, gcGen: 5, gcCull: 1, refills: 3, drains: 3 };
  const frames = gcDeltas([
    { t: 0, dt: 0, work: 4, gpu: null, gcCum: snap(base) },
    { t: 16, dt: 16, work: 5, gpu: null, gcCum: snap({ ...base, gcUseFrame: 12, gcGen: 6.5, gcCull: 1.2 }) },
    { t: 40, dt: 24, work: 20, gpu: null, gcCum: snap({ ...base, gcUseFrame: 13, gcGen: 7, gcCull: 1.4, gcRender: 9, gcEffect: 5, refills: 4 }) },
    { t: 60, dt: 20, work: 13, gpu: null, gcCum: snap({ ...base, gcUseFrame: 16, gcGen: 7, gcCommit: 3, gcRanges: 2, gcCull: 1.6, gcRender: 9, gcEffect: 5, refills: 4, drains: 4, gcBytes: 4096, gcMeshes: 7 }) },
  ]);
  assert.equal(frames[0].gc, null, "the first frame has no previous snapshot");
  assert.equal(frames[0].gcCum, undefined, "the raw snapshot is dropped");
  assert.deepEqual([frames[2].gc.gcRender, frames[2].gc.gcEffect, frames[2].gc.gcRefill], [9, 5, 1]);
  assert.deepEqual([frames[3].gc.gcCommit, frames[3].gc.gcBytes, frames[3].gc.gcRefill, frames[3].gc.gcMeshes], [3, 4096, 2, 7]);
  const s = frameSeries(frames);
  for (const k of GC_COLUMNS) assert.equal(s[k].length, 4, k);
  assert.equal(s.gcGen[0], null);
  const d = gcFramesDigest(s);
  assert.deepEqual(d.frames.map((f) => f.t), [40, 60]);
  assert.equal(d.frames[0].gcMs, 15, "useFrame 1 + render 9 + effect 5 (gen and cull nest inside useFrame)");
  assert.equal(d.frames[0].otherMs, 5);
  assert.equal(d.frames[0].gc.gcCommit, undefined, "zero columns are dropped");
  assert.equal(d.totals.gcRefill, 1, "fills started, not swaps");
  assert.equal(d.totals.gcBytes, 4096);
  assert.match(gcFramesText("e walk", d)[0], /e walk: 2 frames >= 12 ms; totals .*gcRender 9/);
  assert.equal(gcFramesDigest(frameSeries([{ t: 0, dt: 0, work: 30, gpu: null, gc: null }])), null, "no gc columns, no digest");
});

test("host sampler: a worker-seen gap overlapping a steal spike is a host stall (perf-diag9 S1)", async () => {
  const { hitchContext, hitchContextText } = await import("./measure.mjs");
  const { hostSeries, hostSpikes, samplerCommand } = await import("./host-sampler.mjs");
  // pod epoch rows every 250 ms: steal jumps 6 jiffies (60 ms) in the interval ending at origin+1250, then 2 faults
  const origin = 1_700_000_000_000;
  // row: epoch, steal, majfaults, load1, runnable, cpuTotal, cpuIdle, mhzMin, mhzMax, top
  const rows = [[origin + 750, 100, 7, 1, 2, 1000, 900, 2400, 3000, "-"], [origin + 1000, 100, 7, 1.5, 3, 1100, 950, 2400, 3100, "5/node:20,6/ssh:5"],
    [origin + 1250, 106, 7, 2, 4, 1200, 1000, 2400, 3200, "-"], [origin + 1500, 106, 9, 2, 4, 1200, 1000, 2400, 3200, "-"], [origin + 1750, 107, 30, 2, 4, 1300, 1000, 2400, 3200, "-"]];
  rows.nproc = 8;
  const s = hostSeries(rows, origin);
  const { core, coreMhz, runMs, waitMs, migr, nvcsw, gpuCore, gpuCoreMhz, gpuWaitMs, throttledMs, rendererPid, rendererThreadsBusy, sibBusyMs, l3BusyPct, coreBusyMs, cpuset, governor, maxMhzDistinct, ...base } = s;
  assert.deepEqual({ ...base, top: s.top.map((x) => x.length) }, { nproc: 8, t: [1000, 1250, 1500, 1750], stealMs: [0, 60, 0, 10], majFaults: [0, 0, 2, 21],
    load1: [1.5, 2, 2, 2], runnable: [3, 4, 4, 4], busyPct: [50, 50, null, 100], mhzMin: [2400, 2400, 2400, 2400], mhzMax: [3100, 3200, 3200, 3200], top: [2, 0, 0, 0] });
  assert.deepEqual(s.top[0], [{ proc: "5/node", ms: 200 }, { proc: "6/ssh", ms: 50 }]);
  const { hostSummary, parseSamplerLine } = await import("./host-sampler.mjs");
  assert.equal(hostSummary([s, null]), "nproc 8, max load 2, max busy 100%");
  assert.deepEqual(parseSamplerLine("1 2 3 0.5 4 100 90 2400 3000 -"), [1, 2, 3, 0.5, 4, 100, 90, 2400, 3000, "-"]);
  assert.equal(parseSamplerLine("nproc 8"), null);
  const spikes = hostSpikes(s);
  assert.deepEqual(spikes, [[1000, 1250], [1500, 1750]]);
  const h = [{ t: 1300, dt: 100, work: 9 }, { t: 3000, dt: 40, work: 8 }, { t: 2600, dt: 50, work: 30 }];
  const c = hitchContext(h, [], [[1210, 80], [2955, 40]], spikes);
  assert.deepEqual(c.map((x) => x.cause), ["host", "process", "main"]);
  assert.match(hitchContextText("a", { settled: c })[0], /host spike yes; cause host/);
  assert.equal(hitchContext(h, [], [[1210, 80]])[0].cause, "process", "no --pod: never host");
  assert.equal(hostSeries(rows, null), null);
  const [cmd, args] = samplerCommand("ssh -i /tmp/k -p 2222 root@1.2.3.4");
  assert.equal(cmd, "ssh");
  assert.deepEqual(args.slice(0, 4), ["-i", "/tmp/k", "-p", "2222"]);
  const script = Buffer.from(/echo (\S+) \| base64/.exec(args.at(-1))[1], "base64").toString();
  assert.match(script, /\/proc\/stat[\s\S]*\/proc\/vmstat[\s\S]*\/proc\/loadavg[\s\S]*\/proc\/cpuinfo/);
  assert.match(script, /^echo "nproc/);
  assert.equal(args.at(-2), "root@1.2.3.4");
});

test("pageProbe does not throw on an opaque-origin page (perf-diag9 E1)", async () => {
  const { pageProbe } = await import("./measure.mjs");
  const g = globalThis, saved = {};
  const stub = {
    window: { addEventListener() {}, requestAnimationFrame: () => 0 },
    location: { protocol: "about:" },
    localStorage: { setItem() { throw new Error("SecurityError: storage denied on an opaque origin"); } },
    requestAnimationFrame: () => 0,
    // a real MessageChannel with an onmessage keeps the test process alive
    MessageChannel: class { port1 = {}; port2 = { postMessage() {} }; },
  };
  for (const k of Object.keys(stub)) { saved[k] = Object.getOwnPropertyDescriptor(g, k); Object.defineProperty(g, k, { value: stub[k], configurable: true, writable: true }); }
  try {
    assert.doesNotThrow(() => pageProbe());
    stub.location.protocol = "http:";
    stub.window = { addEventListener() {}, requestAnimationFrame: () => 0 };
    g.window = stub.window;
    assert.doesNotThrow(() => pageProbe(), "a storage throw on http is swallowed too");
  } finally {
    for (const k of Object.keys(stub)) { if (saved[k]) Object.defineProperty(g, k, saved[k]); else delete g[k]; }
  }
});

test("pageerror entries keep the stack (perf-diag9 E2)", async () => {
  const { pageErrorText } = await import("./measure.mjs");
  const e = new TypeError("Cannot read properties of undefined (reading 'isReady')");
  e.stack = `TypeError: Cannot read properties of undefined (reading 'isReady')\n    at r (index-x.js:1:200)\n    at Object.poll (index-x.js:1:900)`;
  const t = pageErrorText(e);
  assert.match(t, /^pageerror: TypeError: Cannot read .*isReady/);
  assert.match(t, /\n {4}at r \(index-x\.js:1:200\)\n {4}at Object\.poll/);
  assert.equal(pageErrorText("plain"), "pageerror: plain");
});

test("hidden source maps name minified heap and profile frames by source file:line (perf-diag9 A1)", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { loadSourceMaps, sourcePosition, decodeMappings } = await import("./source-maps.mjs");
  const { heapTopAllocators } = await import("./checks.mjs");
  const { profileTopPerFrame } = await import("./measure.mjs");
  // gen line 0: col 0 -> a.ts:1, col 10 -> a.ts:5; gen line 1: col 0 -> a.ts:6
  assert.deepEqual(decodeMappings("AAAA,UAIA;AACA"), [[[0, 0, 0, 0], [10, 0, 4, 0]], [[0, 0, 5, 0]]]);
  const dir = mkdtempSync(join(tmpdir(), "maps-"));
  mkdirSync(join(dir, "studio/assets"), { recursive: true });
  writeFileSync(join(dir, "studio/assets/index-AB.js.map"), JSON.stringify({ version: 3, sources: ["../../packages/game-core/src/a.ts"], mappings: "AAAA,UAIA;AACA" }));
  const maps = loadSourceMaps(dir);
  const url = "http://127.0.0.1:8099/elder-souls-argonia/studio/assets/index-AB.js";
  assert.equal(sourcePosition(maps, url, 0, 12), "packages/game-core/src/a.ts:5");
  assert.equal(sourcePosition(maps, url, 0, 3), "packages/game-core/src/a.ts:1");
  assert.equal(sourcePosition(maps, url, 1, 0), "packages/game-core/src/a.ts:6");
  assert.equal(sourcePosition(maps, "http://x/other.js", 0, 0), null);
  const cf = { functionName: "qp", url, lineNumber: 0, columnNumber: 11 };
  const heap = { head: { callFrame: {}, selfSize: 0, children: [{ callFrame: cf, selfSize: 285e6, children: [] }] } };
  assert.equal(heapTopAllocators(heap, 1, maps)[0].name, "qp packages/game-core/src/a.ts:5 (index-AB.js:1:12)");
  assert.equal(heapTopAllocators(heap, 1)[0].name, "qp index-AB.js:1");
  const prof = { nodes: [{ id: 1, callFrame: cf }], samples: [1, 1], timeDeltas: [0, 1000, 1000] };
  assert.equal(profileTopPerFrame(prof, 1, 1, maps)[0].at, "packages/game-core/src/a.ts:5");
});

test("profile-walk: a diag token; per-spike stacks from the samples inside each >= 12 ms frame", async () => {
  const { profileSpikes } = await import("./measure.mjs");
  const { parseSpots, isDiagnosisSpot } = await import("./spots.mjs");
  const [s] = parseSpots("ewprof ?view=character&rate=30 walk=20 profile-walk\n");
  assert.equal(s.probes.profileWalk, true);
  assert.equal(isDiagnosisSpot(s), true);
  const cf = (functionName, url, lineNumber) => ({ functionName, url, lineNumber, columnNumber: 0 });
  // profile clock starts at page 1000 ms (startTime 1000000 us, offset 0); one sample per ms
  const profile = { startTime: 1000000, nodes: [{ id: 1, callFrame: cf("(root)", "", -1) }, { id: 2, callFrame: cf("hot", "http://x/a.js", 4) }, { id: 3, callFrame: cf("cold", "http://x/b.js", 0) }],
    samples: [3, 3, 2, 2, 2, 3, 2, 2], timeDeltas: [0, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000] };
  // frames at page 1000 (work 5), 1002 (work 14: samples at 1002..1005), 1006 (work 3)
  const series = { t: [1000, 1002, 1006], work: [5, 14, 3] };
  const out = profileSpikes(profile, 0, series, {}, null);
  assert.equal(out.length, 1, "only the 14 ms frame is a spike");
  assert.deepEqual(out[0].top, [{ name: "hot", at: "http://x/a.js:5", ms: 3 }, { name: "cold", at: "http://x/b.js:1", ms: 1 }]);
  assert.equal(out[0].t, 1002);
  assert.equal(profileSpikes(profile, 0, series, { top: 1 }, null)[0].top.length, 1);
});

test("perf rounds need --pod: a --spots run with a headline row is refused unless --no-pod", async () => {
  const { parseArgs } = await import("./measure.mjs");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "spots-"));
  const head = join(dir, "head.txt"), diag = join(dir, "diag.txt");
  writeFileSync(head, "a ?view=character&rate=0.5\nbprof ?view=character&rate=0.5 profile\n");
  writeFileSync(diag, "bprof ?view=character&rate=0.5 profile\n");
  assert.throws(() => parseArgs(["--run", "r", "--spots", head]), /headline rows \(a\).*--no-pod/);
  assert.equal(parseArgs(["--run", "r", "--spots", head, "--no-pod"]).noPod, true);
  assert.equal(parseArgs(["--run", "r", "--spots", head, "--pod", "ssh -p 1 root@h"]).pod, "ssh -p 1 root@h");
  assert.doesNotThrow(() => parseArgs(["--run", "r", "--spots", diag]), "diagnosis-only files need no pod");
});

test("profileOffset: the anchor loop's first sample maps page ms to profile ms, not startTime (perf10 F36)", async () => {
  const { profileOffset, profileSpikes, ANCHOR_FN } = await import("./measure.mjs");
  const nodes = [{ id: 1, callFrame: { functionName: "(root)" } }, { id: 2, callFrame: { functionName: ANCHOR_FN } }, { id: 3, callFrame: { functionName: "hot", url: "a.js", lineNumber: 9 } }];
  // Profile starts at 1000 ms; the anchor (page 500 ms) is first sampled 185 ms later, at 1185 ms.
  const profile = { nodes, startTime: 1000_000, samples: [1, 2, 2, 1, 3, 3], timeDeltas: [0, 185_000, 1000, 1000, 98_000, 1000] };
  const off = profileOffset(profile, 500);
  assert.equal(off, 685);
  // `hot` sampled at profile 1285-1286 ms = page 600-601 ms: it lands in the frame at page 600, not 785.
  const out = profileSpikes(profile, off, { t: [600, 620], work: [15, 15] }, {}, null);
  assert.equal(out[0].top[0].name, "hot");
  assert.equal(out[1].top.length, 0);
  assert.equal(profileOffset({ ...profile, samples: [1, 1, 1, 1, 3, 3] }, 500), 500, "no anchor sample: startTime fallback");
});

test("loadTimeline: sceneCompleteS is the last arrival sign; per-URL rows keep the 40 largest and every JSON", async () => {
  const { buildLoadTimeline, loadTimelineText } = await import("./measure.mjs");
  const MB = 1048576;
  const resources = [["http://h/s/a.json", 100, 31000, 10, "fetch"], ["http://h/s/big.glb", 200, 900, 5 * MB, "fetch"]];
  for (let i = 0; i < 45; i++) resources.push([`http://h/s/k${i}.glb`, 300 + i, 400 + i, (i + 1) * 1000, "fetch"]);
  const l = buildLoadTimeline({ nowMs: 60000, resources,
    marks: [["es:load:first-present", 1200], ["es:load:settlement-first-build", 33000], ["other", 59000]], programs: [[250, 3], [34000, 40], [50000, 40]] });
  assert.equal(l.completeS, 60);
  assert.equal(l.sceneCompleteS, 34, "program count last changed at 34 s; the 59 s non-load mark and the 60 s gate do not count");
  assert.equal(l.requests.length, 41, "the 40 largest (big.glb among them) plus the JSON request");
  assert.ok(l.requests.some((r) => r.url === "/s/a.json" && r.initiatorType === "fetch" && r.endS === 31));
  assert.deepEqual(l.requests.find((r) => r.url === "/s/big.glb"), { url: "/s/big.glb", initiatorType: "fetch", startS: 0.2, endS: 0.9, MB: 5 });
  assert.match(loadTimelineText("g", l), /complete 60, scene complete 34;/);
  assert.equal(buildLoadTimeline({ nowMs: 7000, resources: [["/x.js", 0, 4000, 1, "script"]] }).sceneCompleteS, 4);
});

test("parseArgs: --smoke with --spots applies to every spot of the file", async () => {
  const { parseArgs } = await import("./measure.mjs");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const f = join(mkdtempSync(join(tmpdir(), "spots-")), "s.txt");
  writeFileSync(f, "a ?x=1&t=2\nb ?x=3&t=4\n");
  const o = parseArgs(["--smoke", "--spots", f, "--no-pod"]);
  assert.equal(o.smoke, true);
  assert.deepEqual(o.spotList.map((s) => s.name), ["a", "b"]);
  assert.equal(o.url.length, 2);
  assert.equal(o.readyTimeout, 40);
  assert.equal(o.settle, 5);
  assert.equal(o.run, "smoke");
});
