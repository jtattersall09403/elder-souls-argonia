// node --test tooling/gpu-lane/pod-capture-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { onePercentLow, parseSteps, counter, heapSlope, isStalled, lumaRatios, parseProfile, parseShots, screenMiddle, shotSchedule, stalledReads, summariseProfile } from "./pod-capture-lib.mjs";

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
