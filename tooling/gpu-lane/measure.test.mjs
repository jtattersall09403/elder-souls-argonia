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

test("isReady: tris stable within 2 % for 5 s, no loading line", async () => {
  const { isReady } = await import("./measure.mjs");
  const at = (t, tris, extra = {}) => ({ t, tris, fps: 60, loading: false, ...extra });
  const steady = [0, 1000, 2000, 3000, 4000, 5000].map((t) => at(t, 3.2e6 + t));
  assert.equal(isReady(steady), true);
  assert.equal(isReady(steady.slice(0, 5)), false, "under 5 s of samples");
  assert.equal(isReady([...steady.slice(0, 5), at(5000, 4.0e6)]), false, "still streaming");
  assert.equal(isReady([...steady.slice(0, 5), at(5000, 3.2e6, { loading: true })]), false, "loading line");
  assert.equal(isReady([...steady.slice(0, 5), at(5000, 3.2e6, { fps: 0 })]), false, "no fps yet");
});
