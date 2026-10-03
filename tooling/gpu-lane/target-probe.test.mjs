// node --test tooling/gpu-lane/target-probe.test.mjs
import { test } from "node:test";
import vm from "node:vm";
import assert from "node:assert/strict";
import { installTargetProbe, recordPassDescriptor, targetsLine } from "./target-probe.mjs";

function fakeWindow(renderer) {
  class GPUTexture { constructor(label, format, sampleCount) { Object.assign(this, { label, format, sampleCount, width: 8, height: 4 }); } createView() { return {}; } }
  class GPUCanvasContext { constructor() { this.t = new GPUTexture("", "bgra8unorm", 1); } getCurrentTexture() { return this.t; } }
  const begun = [];
  class GPURenderPassEncoder { draw() {} drawIndexed() {} drawIndirect() {} drawIndexedIndirect() {} end() {} }
  class GPUCommandEncoder { beginRenderPass(d) { begun.push(d); return new GPURenderPassEncoder(); } }
  class WebGL2RenderingContext { drawArrays() {} drawElements() {} drawArraysInstanced() {} drawElementsInstanced() {} drawRangeElements() {} }
  const win = { GPUTexture, GPUCanvasContext, GPUCommandEncoder, GPURenderPassEncoder, WebGL2RenderingContext, __RENDERER__: renderer, requestAnimationFrame: (f) => setTimeout(f, 0) };
  installTargetProbe(win, recordPassDescriptor);
  return { win, begun, GPUTexture, GPUCanvasContext, GPUCommandEncoder };
}

test("target probe: beginRenderPass descriptors are recorded only while armed, with view textures, canvas, resolve and ops", () => {
  const r = { needsFrameBufferTarget: true, getRenderTarget: () => ({ id: 7, samples: 4 }) };
  const { win, begun, GPUTexture, GPUCanvasContext, GPUCommandEncoder } = fakeWindow(r);
  const msaa = new GPUTexture("fbMSAA", "rgba16float", 4), canvas = new GPUCanvasContext().getCurrentTexture();
  const d = { label: "out", colorAttachments: [{ view: msaa.createView(), resolveTarget: canvas.createView(), loadOp: "load", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }] };
  new GPUCommandEncoder().beginRenderPass(d);
  assert.equal(win.__targetProbe.passes.length, 0, "unarmed: nothing recorded");
  win.__targetProbe.armed = true;
  new GPUCommandEncoder().beginRenderPass(d);
  assert.equal(begun.length, 2, "the real beginRenderPass still runs");
  const [p] = win.__targetProbe.passes;
  assert.deepEqual(p.colour.texture, { label: "fbMSAA", format: "rgba16float", sampleCount: 4, size: [8, 4], canvas: false });
  assert.equal(p.colour.resolveTarget.canvas, true);
  assert.equal(p.colour.loadOp, "load");
  assert.equal(p.colour.storeOp, "store");
  assert.deepEqual(p.colour.clearValue, { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(p.rendererTarget, { id: 7, samples: 4 });
  assert.equal(p.needsFrameBufferTarget, true);
});

test("target probe: scene by deferBuildsInto identity (lit reads lit), MSAA skipped, per-target draws, skippedDraws delta", async () => {
  const HALF_ONE = 0x3c00, HALF_ZERO = 0;
  const rt = (id, w, h, px, extra = {}) => ({ id, width: w, height: h, samples: 0, depthBuffer: false, texture: { type: 1016, name: "" }, px, ...extra });
  const env = rt(5, 256, 256, HALF_ZERO, { depthBuffer: true }), scene = rt(2, 64, 32, HALF_ONE, { depthBuffer: true });
  const fb = rt(1, 64, 32, HALF_ONE, { samples: 4 }), mip0 = rt(3, 32, 16, HALF_ZERO), mip1 = rt(4, 16, 8, HALF_ZERO);
  const queue = { skippedDraws: 0, pending: 2, timedOut: new Set(), frameTargets: new WeakSet([scene]) };
  const r = {
    esBuildQueue: queue, _frameBufferTargets: new Map([["c", fb]]),
    setRenderTarget() {}, getRenderTarget: () => null,
    readRenderTargetPixelsAsync: async (t) => new Uint16Array([t.px, t.px, t.px, HALF_ONE]),
  };
  const { win } = fakeWindow(r);
  const gl = new win.WebGL2RenderingContext();
  // env (first non-fb target, the probe's old "scene" guess) gets more draws than the scene, so neither guess finds it
  const frame = () => { r.setRenderTarget(env); for (let i = 0; i < 9; i++) gl.drawElements(); r.setRenderTarget(scene); gl.drawElements(); gl.drawArrays(); queue.skippedDraws += 3; r.setRenderTarget(null); gl.drawArrays(); r.setRenderTarget(mip0); r.setRenderTarget(mip1); r.setRenderTarget(null); };
  const tick = setInterval(frame, 0);
  const p = await win.__targetProbe.capture();
  clearInterval(tick);
  const by = Object.fromEntries(p.targets.map((t) => [t.label, t]));
  assert.equal(p.sceneBy, "deferBuildsInto");
  assert.equal(by.scene.id, 2);
  assert.equal(by.scene.mean9, 1, "a lit scene target reads lit");
  assert.ok(by.scene.draws > 0 && by.scene.draws % 2 === 0, "draws issued into the scene target are counted");
  assert.match(by.fb.skipped, /multisampled/);
  assert.equal(by.fb.mean9, undefined, "an MSAA target is never read");
  assert.equal(by.bloom.id, 3);
  assert.ok(p.queue.skippedDraws > 0, "skipped draws in the window are reported");
  assert.equal(p.queue.skippedPerFrame, p.queue.skippedDraws / 2);
  assert.equal(p.queue.notReady, 2);
  assert.ok(p.setRenderTarget.some((x) => x.canvas && x.draws > 0));
});

test("target probe: without a queue, scene = the depth target with the most draws; a black scene reads black with no skips", async () => {
  const rt = (id, w, h, depth) => ({ id, width: w, height: h, samples: 0, depthBuffer: depth, texture: { type: 1016, name: "" } });
  const small = rt(1, 256, 256, true), big = rt(2, 64, 32, true);
  const r = { setRenderTarget() {}, getRenderTarget: () => null, readRenderTargetPixelsAsync: async () => new Uint16Array([0, 0, 0, 0x3c00]) };
  const { win } = fakeWindow(r);
  const gl = new win.WebGL2RenderingContext();
  const tick = setInterval(() => { r.setRenderTarget(small); gl.drawArrays(); r.setRenderTarget(big); for (let i = 0; i < 5; i++) gl.drawArrays(); r.setRenderTarget(null); }, 0);
  const p = await win.__targetProbe.capture();
  clearInterval(tick);
  assert.equal(p.sceneBy, "maxDraws");
  assert.equal(p.targets.find((t) => t.label === "scene").id, 2);
  assert.equal(p.targets.find((t) => t.label === "scene").mean9, 0);
  assert.match(p.queue.err, /no esBuildQueue/);
});

test("target probe: WebGPU draws count per pass until end()", () => {
  const r = { getRenderTarget: () => null };
  const { win, GPUTexture, GPUCommandEncoder } = fakeWindow(r);
  win.__targetProbe.armed = true;
  const d = { colorAttachments: [{ view: new GPUTexture("s", "rgba16float", 1).createView() }] };
  const pass = new GPUCommandEncoder().beginRenderPass(d);
  pass.draw(); pass.drawIndexed(); pass.end(); pass.draw();
  assert.equal(win.__targetProbe.passes[0].draws, 2);
});

test("targetsLine: the summary cell", () => {
  const p = { targets: [{ label: "scene", mean9: 0.41, draws: 773 }, { label: "fb", skipped: "multisampled" }, { label: "bloom", mean9: 0.02 }], canvas: { luma: 17.5 }, queue: { skippedPerFrame: 3, notReady: 2 } };
  assert.equal(targetsLine(p), "not-a-bar; scene 0.41 (773 draws) / fb skip / bloom 0.02 / canvas luma 17.5 / skipped 3.0/frame, 2 not ready notReady ? exp ? scene grid - cam nan ? vp ?");
  assert.match(targetsLine({ ...p, notReadyPipelines: { perFrame: 1 }, exposure: { toneMappingExposure: 0.0001 } }), / notReady 1 exp 0.0001 scene grid - cam nan \? vp \?$/);
  assert.equal(targetsLine({ targets: [{ label: "scene", err: "x" }] }), "not-a-bar; scene err (? draws) / fb - / bloom - / canvas luma - notReady ? exp ? scene grid - cam nan ? vp ?");
  assert.match(targetsLine({ ...p, sceneGrid: { grid: [64, 36], nan: 3, inf: 0, black: 10 } }), / scene nan 3 inf 0 black 10\/2304 cam nan \? vp \?$/);
  assert.equal(targetsLine({ err: "no target probe on the page" }), "not-a-bar; probe unread (no target probe on the page)");
  assert.equal(targetsLine(null), null);
});

test("target probe: not-ready pipelines counted per frame with material name, null pipeline and error; exposure read; isReady restored", async () => {
  const bad = { material: { name: "badMat" } }, good = { material: { name: "goodMat" } };
  const pipelines = {
    isReady: (ro) => ro !== bad,
    get: (ro) => ({ pipeline: { id: ro.material.name } }),
    backend: { get: (p) => (p.id === "badMat" ? { pipeline: null, error: new Error("boom") } : { pipeline: {} }) },
  };
  const orig = pipelines.isReady;
  const r = { _pipelines: pipelines, setRenderTarget() {}, getRenderTarget: () => null, toneMappingExposure: 0.0001, toneMapping: 4, outputColorSpace: "srgb",
    readRenderTargetPixelsAsync: async () => new Uint16Array([0, 0, 0, 0]) };
  const { win } = fakeWindow(r);
  const tick = setInterval(() => { r._pipelines.isReady(bad); r._pipelines.isReady(good); }, 0);
  const p = await win.__targetProbe.capture();
  clearInterval(tick);
  assert.ok(p.notReadyPipelines.perFrame >= 1);
  assert.equal(p.notReadyPipelines.names.length, 1);
  assert.deepEqual([p.notReadyPipelines.names[0].material, p.notReadyPipelines.names[0].pipelineNull, p.notReadyPipelines.names[0].error], ["badMat", true, "boom"]);
  assert.deepEqual(p.exposure, { toneMappingExposure: 0.0001, toneMapping: 4, outputColorSpace: "srgb" });
  assert.equal(pipelines.isReady, orig, "isReady restored after the window");
});

test("target probe: id-less targets (three RenderTarget) all seen; scene grid counts NaN, Inf and black exactly over padded rows; depth skipped with reason", async () => {
  const W = 64, H = 36, stride = 128 * 4; // rows padded like WebGPU's 256-byte alignment
  const ONE = 0x3c00, NAN = 0x7e00, INF = 0x7c00;
  const px = new Uint16Array((H - 1) * stride + W * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px.set([ONE, ONE, ONE, ONE], y * stride + x * 4);
  for (const i of [0, 100, 2303]) px[Math.floor(i / W) * stride + (i % W) * 4 + 1] = NAN;
  for (let i = 500; i < 510; i++) px.set([0, 0, 0, ONE], Math.floor(i / W) * stride + (i % W) * 4);
  px[Math.floor(1000 / W) * stride + (1000 % W) * 4] = INF;
  const mk = (w, h, depth) => ({ width: w, height: h, samples: 0, depthBuffer: depth, texture: { type: 1016, name: "" } });
  const env = mk(256, 256, true), scene = mk(W, H, true);
  const queue = { skippedDraws: 0, pending: 0, timedOut: new Set(), frameTargets: new WeakSet([scene]) };
  const r = { esBuildQueue: queue, setRenderTarget() {}, getRenderTarget: () => null,
    readRenderTargetPixelsAsync: async (t, x, y, w, h) => (t === scene && w === W && h === H ? px : new Uint16Array([ONE, ONE, ONE, ONE])) };
  const { win } = fakeWindow(r);
  const gl = new win.WebGL2RenderingContext();
  const tick = setInterval(() => { r.setRenderTarget(env); gl.drawArrays(); r.setRenderTarget(scene); gl.drawArrays(); r.setRenderTarget(null); }, 0);
  const p = await win.__targetProbe.capture();
  clearInterval(tick);
  assert.equal(p.sceneBy, "deferBuildsInto", "the second id-less target is still seen");
  const g = p.sceneGrid;
  assert.deepEqual([g.nan, g.inf, g.black, g.lit], [3, 1, 10, 2304 - 14]);
  assert.equal(g.samples.length, 8);
  assert.equal(g.meanLuma, Math.round(((2304 - 14) / (2304 - 4)) * 1e4) / 1e4);
  assert.match(g.depth.skipped, /no depthTexture/);
  assert.match(targetsLine(p), / scene nan 3 inf 1 black 10\/2304 cam nan \? vp \? held err$/);
});

test("target probe: state block reads the largest render call's camera, viewport, drawing buffer, sun; NaN flagged", async () => {
  const mat = (nan) => ({ elements: Array.from({ length: 16 }, (_, i) => (nan && i === 5 ? NaN : i)) });
  const mkCam = (nan) => ({ projectionMatrix: mat(nan), matrixWorldInverse: mat(false), near: 0.1, far: 1000 });
  const run = async (nan) => {
    let gl;
    const r = { setRenderTarget() {}, getRenderTarget: () => null, render() { gl.drawArrays(); gl.drawArrays(); }, small() {},
      getViewport: (v) => v.set(0, 0, 640, 360, 0), getScissor: (v) => v.set(1, 2, 3, 4), getScissorTest: () => false,
      getDrawingBufferSize: (v) => v.set(1280, 720) };
    const { win } = fakeWindow(r);
    gl = new win.WebGL2RenderingContext();
    const sc = { userData: { sunDirection: { x: 0, y: 1, z: NaN }, other: 1 } };
    const tick = setInterval(() => { r.render(sc, mkCam(nan)); }, 0);
    const p = await win.__targetProbe.capture();
    clearInterval(tick);
    return p;
  };
  const ok = await run(false), bad = await run(true);
  assert.equal(ok.state.camera.anyNaN, false);
  assert.equal(bad.state.camera.anyNaN, true);
  assert.deepEqual(ok.state.drawingBuffer, { w: 1280, h: 720 });
  assert.deepEqual(ok.state.viewport, { x: 0, y: 0, w: 640, h: 360 });
  assert.equal(ok.state.sun.sunDirection.anyNaN, true);
  assert.match(targetsLine(bad), / cam nan Y vp 1280x720 held err$/);
  assert.match(targetsLine(ok), / cam nan N vp 1280x720 held err$/);
});

// The page runs the STRINGIFIED function (pod-capture.mjs: `(${installTargetProbe})(window, ${recordPassDescriptor})`), so a
// module-level helper is a ReferenceError there (iter22 readState). Evaluate that exact source in a fresh context.
function pageCapture(renderer) {
  const win = { requestAnimationFrame: (f) => setTimeout(f, 0), __RENDERER__: renderer };
  const ctx = vm.createContext({ window: win, setTimeout, Promise, Number, Math, Object, Array, Boolean, String, Set, Map, WeakMap, WeakSet, Uint8Array, Uint16Array, Uint32Array });
  vm.runInContext(`(${installTargetProbe})(window, ${recordPassDescriptor});`, ctx);
  return win.__targetProbe.capture();
}
const pageRenderer = (extra = {}) => ({
  backend: {}, toneMappingExposure: 1, setRenderTarget() {}, render() {}, readRenderTargetPixelsAsync: async () => new Uint8Array(4), getViewport: (v) => v.set(0, 0, 8, 4),
  getDrawingBufferSize: (t) => t.set(8, 4), ...extra,
});

test("target probe: the injected page source (fresh vm context) returns every block, state included", async () => {
  const out = await pageCapture(pageRenderer({ esBuildQueue: { skippedDraws: 0, pending: 0, frameTargets: new Set() } }));
  for (const k of ["sceneGrid", "state", "notReadyPipelines", "exposure", "queue", "passes"]) assert.ok(k in out, `block ${k}`);
  assert.equal(out.err, undefined);
  assert.equal(out.state.camera, "unreachable");
  assert.deepEqual(JSON.parse(JSON.stringify(out.state.drawingBuffer)), { w: 8, h: 4 }); // cross-realm object
});

test("target probe: one block throwing records its error and the others still land", async () => {
  const q = { skippedDraws: 0, frameTargets: new Set(), get pending() { throw new Error("boom"); } };
  const out = await pageCapture(pageRenderer({ esBuildQueue: q }));
  assert.match(out.queue.err, /boom/);
  assert.ok(out.state.drawingBuffer && out.exposure.toneMappingExposure === 1 && out.sceneGrid && out.notReadyPipelines && out.passes);
});

test("target probe: a depth24plus depth target is never copied (WebGPU forbids it); depth32float still is", async () => {
  const run = async (format) => {
    const copies = [];
    const dt = { format };
    const scene = { width: 8, height: 4, samples: 0, depthBuffer: true, depthTexture: dt, texture: { type: 1016, name: "" } };
    const r = { esBuildQueue: { skippedDraws: 0, pending: 0, timedOut: new Set(), frameTargets: new WeakSet([scene]) }, setRenderTarget() {}, getRenderTarget: () => null,
      backend: { copyTextureToBuffer: async (t) => { copies.push(t); return new Float32Array(64).fill(0.5); } },
      readRenderTargetPixelsAsync: async () => new Uint16Array(8 * 4 * 4).fill(0x3c00) };
    const { win } = fakeWindow(r);
    const gl = new win.WebGL2RenderingContext();
    const tick = setInterval(() => { r.setRenderTarget(scene); gl.drawArrays(); r.setRenderTarget(null); }, 0);
    const p = await win.__targetProbe.capture();
    clearInterval(tick);
    return { copies, depth: p.sceneGrid.depth };
  };
  for (const f of ["depth24plus", "depth24plus-stencil8"]) {
    const o = await run(f);
    assert.equal(o.copies.length, 0, `${f}: no copyTextureToBuffer`);
    assert.equal(o.depth.depthReadback, "skipped (depth24plus not copyable)");
    assert.deepEqual([o.depth.format, o.depth.size], [f, [8, 4]]);
  }
  const ok = await run("depth32float");
  assert.equal(ok.copies.length, 1);
  assert.equal(ok.depth.mean, 0.5);
});

test("target probe: heldDraws names each draw the build queue skips (object, parents, material, attributes, pass camera, wait); empty when none", async () => {
  let t = 1000;
  const q = { skippedDraws: 0, pending: 1, twinsHeld: 6, timedOut: new Set(), running: new Set(["k-water"]), frameTargets: new WeakSet(),
    request(key) { this.skippedDraws++; } };
  const root = { name: "World", type: "Scene" }, grp = { name: "riverwalk", type: "Group", parent: root };
  const water = { name: "waterSheet", type: "Mesh", uuid: "u1", parent: grp, geometry: { attributes: { position: {}, uv: {} } } };
  const rock = { name: "rock", type: "Mesh", uuid: "u2", parent: root, geometry: { attributes: { position: {} } } };
  const mainCam = { type: "PerspectiveCamera", name: "main" }, sunCam = { type: "OrthographicCamera", name: "", isOrthographicCamera: true };
  let skipWater = true;
  const r = { esBuildQueue: q, setRenderTarget() {}, getRenderTarget: () => null, readRenderTargetPixelsAsync: async () => new Uint16Array(4),
    _renderObjectDirect(object, material, scene, camera) { if (object === water && skipWater) q.request("k-water", 1, () => {}, ""); else if (camera === sunCam && skipWater) q.request("k-rock-shadow", 1, () => {}, ""); },
    render(sc, cam) { this._renderObjectDirect(water, { type: "MeshBasicNodeMaterial", name: "water" }, sc, cam); this._renderObjectDirect(rock, { type: "MeshStandardNodeMaterial", name: "rockMat" }, sc, sunCam); } };
  const { win } = fakeWindow(r);
  win.performance = { now: () => (t += 5) };
  const orig = r._renderObjectDirect;
  const tick = setInterval(() => r.render({}, mainCam), 0);
  const p = await win.__targetProbe.capture();
  assert.equal(r._renderObjectDirect, orig, "_renderObjectDirect restored after the window");
  assert.ok(p.heldDraws.perFrame >= 1); assert.equal(p.heldDraws.twinsHeld, 6);
  const w = p.heldDraws.objects.find((o) => o.object.name === "waterSheet");
  assert.deepEqual(w.parents, [{ name: "riverwalk", type: "Group" }, { name: "World", type: "Scene" }]);
  assert.deepEqual([w.material.type, w.material.name, w.geometryAttributes.join(","), w.pass, w.camera.type, w.target, w.running, w.timedOut], ["MeshBasicNodeMaterial", "water", "position,uv", "main", "PerspectiveCamera", "canvas", true, false]);
  assert.ok(w.waitedMs > 0 && w.count >= 1);
  const s = p.heldDraws.objects.find((o) => o.object.name === "rock");
  assert.equal(s.pass, "shadow/ortho");
  // the request hook stays (one Map lookup per skipped draw); with nothing skipped the list is empty
  skipWater = false;
  const p2 = await win.__targetProbe.capture();
  clearInterval(tick);
  assert.deepEqual([p2.heldDraws.perFrame, p2.heldDraws.objects.length], [0, 0]);
});

test("targetsLine: heldDraws count and first object's name/pass/waitedMs (6a12b6c1)", () => {
  const p = { targets: [], heldDraws: { perFrame: 1, objects: [{ object: { name: "Water", type: "Mesh" }, pass: "main", waitedMs: 840 }, { object: { name: "b" }, pass: "other", waitedMs: 1 }] } };
  assert.match(targetsLine(p), / held 2 \(Water\/main\/840ms\)$/);
  assert.match(targetsLine({ targets: [], heldDraws: { err: "x" } }), / held err$/);
  assert.doesNotMatch(targetsLine({ targets: [] }), /held/);
});
