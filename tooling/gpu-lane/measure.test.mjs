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

test("closeOrphanPages closes every page in every existing context and counts them", async () => {
  const { closeOrphanPages } = await import("./measure.mjs");
  const closed = [];
  const page = (id) => ({ close: async () => { closed.push(id); if (id === "b") throw new Error("gone"); } });
  const browser = { contexts: () => [{ pages: () => [page("a"), page("b")] }, { pages: () => [] }, { pages: () => [page("c")] }] };
  assert.equal(await closeOrphanPages(browser), 3);
  assert.deepEqual(closed, ["a", "b", "c"]);
  assert.equal(await closeOrphanPages({ contexts: () => [] }), 0);
});
