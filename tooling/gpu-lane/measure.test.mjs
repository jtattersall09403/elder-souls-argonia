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

test("heapFit: least-squares slope through a GC saw-tooth reads the underlying growth", async () => {
  const { heapFit } = await import("./checks.mjs");
  // +3 MB/s growth on top of a 0-20 MB saw-tooth (a major GC every 4 s) over 10 s; end-minus-start would read ~0.7 MB/s
  const s = []; for (let t = 0; t <= 10; t += 0.5) s.push([t, 100 + 3 * t + ((t % 4) / 4) * 20]);
  const f = heapFit(s);
  assert.ok(Math.abs(f.mbPerS - 3) < 1, `slope ${f.mbPerS}`);
  assert.equal(f.n, 21);
  assert.equal(heapFit([[0, 1]]).mbPerS, null);
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
test("driveSteps: W held across the whole sequence, yaw set absolute from the base", async () => {
  const { driveSteps } = await import("./measure.mjs");
  const calls = [];
  const io = { key: async (d) => calls.push(d ? "down" : "up"), aim: async (y) => calls.push(`aim ${y.toFixed(2)}`), wait: async (ms) => calls.push(`wait ${ms}`) };
  await driveSteps(io, [{ w: 7 }, { yaw: 1.2 }, { w: 6 }, { yaw: -2 }, { w: 7 }], 0.5);
  assert.deepEqual(calls, ["aim 0.50", "down", "wait 7000", "aim 1.70", "wait 6000", "aim -0.30", "wait 7000", "up"]);
  calls.length = 0;
  await driveSteps(io, [{ w: 20 }]);
  assert.deepEqual(calls, ["down", "wait 20000", "up"], "a plain walk does not re-aim the camera");
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
test("gen-matrix: 13 deterministic lines, coordinates from places.json", async () => {
  const { matrix, PLACES, PLACES_JSON } = await import("./spots/gen-matrix.mjs");
  const { parseSpots } = await import("./spots.mjs");
  const { readFileSync } = await import("node:fs");
  const text = readFileSync(new URL(`../../${PLACES_JSON}`, import.meta.url), "utf8");
  const out = matrix(text);
  assert.equal(out, matrix(text));
  assert.equal(out, readFileSync(new URL("./spots/matrix.txt", import.meta.url), "utf8"), "matrix.txt is the generator's output");
  const lines = out.split("\n").filter((l) => l && !l.startsWith("#"));
  assert.equal(lines.length, 13);
  const byId = new Map(JSON.parse(text).places.map((p) => [p.id, p]));
  for (const [id, short] of PLACES) {
    const [x, z] = byId.get(id).positionM;
    assert.ok(lines.includes(`${short}-t22-rain ?view=character&x=${(x / 1000).toFixed(4)}&z=${(z / 1000).toFixed(4)}&t=22&w=rain&rate=0.5 steps=w:7,yaw:+1.2,w:6,yaw:-2.0,w:7`), short);
  }
  assert.equal(parseSpots(out).length, 15);
});
test("parseSpots: name, query, --aim and walk=; comments skipped; bad lines throw", async () => {
  const { parseSpots, parseBar, spotRows, summaryTable, heapSlope } = await import("./spots.mjs");
  const s = parseSpots("# c\na ?x=1&t=2  # night\n\ne ?x=1&t=2 --aim 0.5,-0.2 walk=20\n");
  const off = { diag: [], trace: false, traceGpu: false, memoryInfra: false, heapsample: false, profile: false };
  assert.deepEqual(s, [{ name: "a", query: "?x=1&t=2", aim: "", steps: [], probes: off }, { name: "e", query: "?x=1&t=2", aim: "0.5,-0.2", steps: [{ w: 20 }], probes: off }]);
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
  const o = parseArgs(["--run", "r", "--spots", new URL("./spots/perf10.txt", import.meta.url).pathname]);
  assert.deepEqual(o.spotList.map((s) => s.name), ["a", "b", "c", "d", "e", "e2", "e3", "f", "g", "h"]);
  assert.equal(o.spotList[9].aim, "1.4,0.1");
  assert.deepEqual(o.spotList[4].steps, [{ w: 20 }]);
  assert.equal(o.shots, true);
  assert.equal(o.clean, "1");
  assert.deepEqual(o.barParsed, { fps: 83, p1low: 69 });
  assert.equal(parseArgs(["--run", "r", "--spots", new URL("./spots/perf10.txt", import.meta.url).pathname, "--leak", "60"]).spotList.length, 10, "--leak keeps every spot");
  assert.throws(() => parseArgs(["--run", "r", "--url", "?a=1", "--spots", "x"]), /replaces --url/);
  const u = parseArgs(["--run", "r", "--url", "?a=1", "--walk", "5", "--aim", "1,0"]);
  assert.deepEqual(u.spotList, [{ name: "url0", query: "?a=1", aim: "1,0", steps: [{ w: 5 }], diagList: [], diagnosis: false }]);
});

test("perf10-c4: probe tokens make diagnosis rows; they print `diag` and never count toward N of M", async () => {
  const { parseArgs, probeScript } = await import("./measure.mjs");
  const { spotRows, summaryTable } = await import("./spots.mjs");
  const o = parseArgs(["--run", "r", "--spots", new URL("./spots/perf10-c4.txt", import.meta.url).pathname]);
  assert.deepEqual(o.spotList.map((s) => s.name), ["a", "b", "c", "d", "e", "e2", "e3", "f", "g", "h", "ediag", "cdiag", "adiag", "atrace", "aprof", "apaused"]);
  assert.deepEqual(o.spotList.map((s) => s.diagnosis), [...Array(10).fill(false), true, true, true, true, true, false]);
  const [ed, cd, ad] = o.spotList.slice(10);
  assert.deepEqual(ed.probes, { diag: [], trace: true, traceGpu: true, memoryInfra: true, heapsample: true, profile: false });
  assert.deepEqual(ed.steps, [{ w: 20 }]);
  assert.deepEqual(cd.probes, { diag: [], trace: true, traceGpu: true, memoryInfra: false, heapsample: false, profile: false });
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

test("host sampler: a worker-seen gap overlapping a steal spike is a host stall (perf-diag9 S1)", async () => {
  const { hitchContext, hitchContextText } = await import("./measure.mjs");
  const { hostSeries, hostSpikes, samplerCommand } = await import("./host-sampler.mjs");
  // pod epoch rows every 250 ms: steal jumps 6 jiffies (60 ms) in the interval ending at origin+1250, then 2 faults
  const origin = 1_700_000_000_000;
  const rows = [[origin + 750, 100, 7], [origin + 1000, 100, 7], [origin + 1250, 106, 7], [origin + 1500, 106, 9], [origin + 1750, 107, 30]];
  const s = hostSeries(rows, origin);
  assert.deepEqual(s, { t: [1000, 1250, 1500, 1750], stealMs: [0, 60, 0, 10], majFaults: [0, 0, 2, 21] });
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
  assert.match(args.at(-1), /\/proc\/stat.*\/proc\/vmstat/);
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
