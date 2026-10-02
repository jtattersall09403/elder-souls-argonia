// node --test tooling/gpu-lane/trace-frames.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ANCHOR_PREFIX, classifyFrames, joinLinks, keepTraceEvent, mainThreadStages, memoryDumps, topCause } from "./trace-frames.mjs";

const FA = (ts) => ({ ph: "X", pid: 1, tid: 1, name: "FireAnimationFrame", ts, dur: 3000 });
const stamp = (ts, pageMs) => ({ ph: "I", pid: 1, tid: 1, name: "TimeStamp", ts, args: { data: { message: ANCHOR_PREFIX + pageMs } } });
test("classifyFrames drops the window's last interval (harness end message) and gives page time", () => {
  // rAFs at 0, 16, 40 (24 ms: long), 56, then 100 ms (the harness end-of-window frame)
  const ev = [stamp(1_000_000, 50_000), ...[0, 16, 40, 56, 156].map((ms) => FA(1_000_000 + ms * 1000))];
  const r = classifyFrames(ev);
  assert.equal(r.long.length, 1);
  assert.equal(r.long[0].ms, 24);
  assert.equal(r.long[0].pageMs, 50_016); // frame start: 16 ms after the anchor
  assert.equal(r.frames, 3); assert.equal(r.maxMs, 24); assert.equal(r.over20, 1);
  assert.equal(classifyFrames([FA(0), FA(100_000)]).frames, 0); // a lone interval is the end frame
});
test("classifyFrames without an anchor has pageMs null", () => {
  assert.equal(classifyFrames([FA(0), FA(30_000), FA(60_000), FA(70_000)]).long[0].pageMs, null);
});
test("joinLinks: events within 300 ms of the frame (page time) become frame.links", () => {
  const long = [{ pageMs: 1000, ms: 50 }, { pageMs: null, ms: 40 }];
  const events = [[700, 5, "a", { type: "MeshStandardMaterial", owner: "o", key: "k" }], [1349, 2, "b", {}], [1351, 1, "c", {}], [600, 1, "d", {}]];
  joinLinks(long, events);
  assert.deepEqual(long[0].links.map((l) => l.name), ["a", "b"]);
  assert.equal(long[0].links[0].owner, "o");
  assert.equal(long[1].links, undefined);
  assert.equal(keepTraceEvent({ ph: "I", name: "TimeStamp" }), true);
});

// The relink probe in a fake page: linkProgram inside a renderBufferDirect draw of an unnamed object.
function runProbe() {
  const G = { shaderSource() {}, attachShader() {}, linkProgram() {} };
  const win = { WebGL2RenderingContext: { prototype: G } };
  const ctx = vm.createContext({ window: win, performance: { now: () => 1234.4 } });
  vm.runInContext(readFileSync(new URL("./probes/relink.js", import.meta.url), "utf8"), ctx);
  const R = vm.runInContext("({})", ctx);
  R.renderBufferDirect = () => G.linkProgram({});
  const parents = { name: "", type: "Group", parent: { name: "p2", parent: { name: "p3", parent: { name: "p4", parent: { name: "p5", parent: { name: "p6" } } } } } };
  const obj = { name: "", type: "Mesh", userData: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, parent: parents };
  R.renderBufferDirect({}, {}, {}, { type: "MeshStandardMaterial", name: "mat", uuid: "abcdef0123456789" }, obj);
  return { win, G, R };
}
test("relink probe: unnamed owner records type, userData keys (8), parents (8), material name and uuid prefix", () => {
  const { win } = runProbe();
  const e = JSON.parse(JSON.stringify(win.__DIAG__.relink().events[0][3])); // out of the vm realm
  assert.equal(e.owner, "Mesh");
  assert.deepEqual(e.detail, { objName: "", objType: "Mesh", userData: ["a", "b", "c", "d", "e", "f"], parents: ["Group", "p2", "p3", "p4", "p5", "p6"], matName: "mat", matUuid: "abcdef01" });
});
test("classifyFrames: a DevTools mojo message makes the frame `harness`, not a long frame; frames after the window end are dropped", () => {
  const mojo = { ph: "X", pid: 1, tid: 1, name: "Receive mojo message", ts: 1_040_000, dur: 48_000, args: { data: { tag: "blink.mojom.DevTools" } } };
  const ev = [stamp(1_000_000, 50_000), mojo, ...[0, 16, 30, 90, 106, 150, 166, 250, 266].map((ms) => FA(1_000_000 + ms * 1000))];
  // intervals (ms): 16, 14, 60 (holds the mojo message: harness), 16, 44 (starts at page 50_106), 16, 84 (starts at page 50_166, after the window end), 16 (end frame)
  const r = classifyFrames(ev, { windowEndPageMs: 50_160 });
  assert.equal(r.harness, 1);
  assert.deepEqual(r.long.map((f) => f.ms), [44]);
  assert.equal(r.maxMs, 44);
  assert.deepEqual(classifyFrames(ev).long.map((f) => f.ms), [44, 84], "without the window end the post-window frame stays");
});

// The relink probe: full program keys, warm (renderer.compile) vs draw links of one material.
test("relink probe: warm vs draw program keys per material uuid, first differing field", async () => {
  const G = { shaderSource() {}, attachShader() {}, linkProgram() {} };
  const win = { WebGL2RenderingContext: { prototype: G } };
  const ctx = vm.createContext({ window: win, performance: { now: () => 10 }, queueMicrotask });
  vm.runInContext(readFileSync(new URL("./probes/relink.js", import.meta.url), "utf8"), ctx);
  const R = vm.runInContext("({})", ctx);
  const pw = { id: "w" }, pd = { id: "d" };
  R.renderBufferDirect = () => G.linkProgram(pd);
  const mat = { isMaterial: true, type: "MeshBasicMaterial", name: "m", uuid: "feedbeef-0000", defines: {} };
  R.info = { programs: [{ program: pw, cacheKey: "MeshBasic,vs,fs,fog" }, { program: pd, cacheKey: "MeshBasic,vs,fs,nofog" }] };
  R.compile = () => { G.linkProgram(pw); };
  await Promise.resolve();
  R.compile({ children: [{ material: mat }] });
  R.renderBufferDirect({}, {}, {}, mat, { name: "", type: "Mesh", userData: { a: 1 }, parent: { name: "p", parent: null } });
  const rl = JSON.parse(JSON.stringify(win.__DIAG__.relink()));
  assert.equal(rl.events[0][3].warm, true);
  assert.equal(rl.events[1][3].warm, false);
  assert.equal(rl.events[0][3].progKey, "MeshBasic,vs,fs,fog");
  assert.match(rl.events[0][3].progKeyHash, /^[0-9a-f]+$/);
  const w = rl.events[0][3].progKeyHash, d = rl.events[1][3].progKeyHash;
  assert.deepEqual(rl.materials.feedbeef, { warmHashes: [w], drawHashes: [d], same: false,
    mismatches: [{ drawHash: d, nearestWarmHash: w, diffs: [{ index: 3, warm: "fog", draw: "nofog" }] }] });
});
test("relink probe keeps 400 events, not 40", () => {
  const { win, G } = runProbe();
  for (let i = 0; i < 500; i++) G.linkProgram({});
  assert.equal(win.__DIAG__.relink().events.length, 400);
});

const X = (name, ts, dur, tid = 1) => ({ ph: "X", pid: 1, tid, name, ts, dur });
test("mainThreadStages: self time, nested GC not counted twice, other threads and containers ignored", () => {
  const ev = [
    X("FireAnimationFrame", 0, 10_000), X("FireAnimationFrame", 16_000, 10_000),
    X("RunTask", 0, 30_000), // container: skipped
    X("FunctionCall", 0, 10_000), X("V8.GC_SCAVENGER", 2_000, 4_000), // js self 6, gc 4 (inside FunctionCall)
    X("FunctionCall", 16_000, 10_000),
    X("FunctionCall", 0, 50_000, 2), // another thread
  ];
  const r = mainThreadStages(ev);
  assert.equal(r.frames, 2);
  // FireAnimationFrame is js too: its 10 ms contain FunctionCall 10 ms -> 0 self; js = 6 + 10, gc = 4
  assert.deepEqual(r.totalMs, { js: 16, gc: 4 });
  assert.deepEqual(r.perFrameMs, { js: 8, gc: 2 });
});
test("mainThreadStages: no frames -> empty", () => assert.deepEqual(mainThreadStages([]), { frames: 0, totalMs: {}, perFrameMs: {} }));
test("topCause and keepTraceEvent", () => {
  assert.equal(topCause({ js: 3, gc: 9 }), "gc"); assert.equal(topCause({}), null);
  assert.equal(keepTraceEvent({ ph: "X", name: "x", dur: 100 }), false);
  assert.equal(keepTraceEvent({ ph: "X", name: "MinorGC", dur: 100 }), true);
  assert.equal(keepTraceEvent({ ph: "M", name: "process_name" }), true);
  assert.equal(keepTraceEvent({ ph: "v", name: "periodic_interval" }), true, "memory dumps survive the streaming filter");
});

test("classifyFrames: frames start to start, every rAF callback of a frame grouped (agrees with the harness rAF interval)", () => {
  // Two callbacks per frame (the harness tick at +0, the game at +2 ms for 7 ms). Frame starts 0, 16, 51, 67, 83 ms:
  // the 35 ms interval is long; its frame's main-thread work is 9 ms. Callback-to-callback it read 33 ms (C2d).
  const cb = (ms, dur) => ({ ph: "X", pid: 1, tid: 1, name: "FireAnimationFrame", ts: ms * 1000, dur: dur * 1000 });
  const ev = [0, 16, 51, 67, 83].flatMap((ms) => [cb(ms, 1), cb(ms + 2, 7)]);
  const r = classifyFrames(ev);
  assert.equal(r.frames, 3);
  assert.deepEqual(r.long.map((f) => [f.ms, f.durMs]), [[35, 9]]);
  assert.equal(r.over33, 1, "seen to fail: per-callback intervals give 33 ms here, not over 33");
});

test("memoryDumps: discardable total and root allocators per dump (hex sizes, children summed when the root has no size)", () => {
  const hex = (mb) => ({ attrs: { size: { type: "scalar", units: "bytes", value: (mb * 1048576).toString(16) } } });
  const dump = (ts, disc) => ({ ph: "v", pid: 7, ts, name: "periodic_interval", args: { dumps: { allocators: {
    discardable: hex(disc), malloc: hex(40), "malloc/allocated_objects": hex(30), "cc/image_memory": hex(12), "cc/tile_memory": hex(3),
    "cc/image_memory/cache_0": hex(99), v8: hex(200), skia: hex(5) } } } });
  const ev = [{ ph: "M", name: "process_name", pid: 7, args: { name: "Renderer" } }, dump(3e6, 120), stamp(1e6, 50_000), dump(1e6, 80)];
  const d = memoryDumps(ev, (us) => us / 1000);
  assert.deepEqual(d.map((x) => [x.pageMs, x.discardableMB]), [[1000, 80], [3000, 120]]);
  assert.equal(d[1].process, "Renderer");
  assert.deepEqual(d[1].MB, { discardable: 120, malloc: 40, skia: 5, cc: 15, v8: 200 });
  assert.deepEqual(d[1].top.map((t) => t.name), ["v8", "discardable", "malloc", "cc", "skia"]);
  const fa = [0, 16, 32, 48].map((ms) => FA(1e6 + ms * 1000));
  assert.equal(classifyFrames([...ev, ...fa]).memoryDumps.length, 2, "classifyFrames carries the dumps");
  assert.equal(classifyFrames(fa).memoryDumps, undefined);
});
