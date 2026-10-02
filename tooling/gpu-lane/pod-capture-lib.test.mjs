// node --test tooling/gpu-lane/pod-capture-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { counter, parseProfile, parseShots, screenMiddle, shotSchedule, summariseProfile } from "./pod-capture-lib.mjs";

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
