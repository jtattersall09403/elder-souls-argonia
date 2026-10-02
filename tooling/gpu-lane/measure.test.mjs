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
  assert.deepEqual(s.url, [SPOT_A]);
  assert.equal(s.run, "smoke");
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
