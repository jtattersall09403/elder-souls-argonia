// node --test tooling/gpu-lane/pod-capture-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { onePercentLow, parseSteps, counter, heapSlope, isStalled, lumaRatios, parseProfile, parseShots, screenMiddle, shotSchedule, stalledReads, summariseProfile , settleGate, parseViews, browserStoppedAnswering, podSetupCommand, aimJs, HUD_HIDE_JS, HUD_SHOW_JS } from "./pod-capture-lib.mjs";

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
  assert.match(t[4], /^\| A \| - \| 40\.12 \| - \| - \| 59 \(-\) \|.*\| 0\.94 \|/);
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
test("HUD hide hides fixed overlays without a canvas and show restores them", () => {
  const el = (position, canvas = false) => ({ style: { visibility: "" }, dataset: {}, tagName: "DIV", position, querySelector: () => canvas });
  const hud = el("fixed"), wrap = el("absolute", true), flow = el("static");
  const window = {}, document = { querySelectorAll: () => [hud, wrap, flow] }, getComputedStyle = (e) => ({ position: e.position });
  const run = (js) => new Function("window", "document", "getComputedStyle", `return ${js}`)(window, document, getComputedStyle);
  assert.equal(run(HUD_HIDE_JS), 1); assert.equal(hud.style.visibility, "hidden"); assert.equal(wrap.style.visibility, "");
  run(HUD_SHOW_JS); assert.equal(hud.style.visibility, "");
});
