// node --test tooling/gpu-lane/target-probe.test.mjs
import { test } from "node:test";
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
  assert.equal(targetsLine(p), "not-a-bar; scene 0.41 (773 draws) / fb skip / bloom 0.02 / canvas luma 17.5 / skipped 3.0/frame, 2 not ready notReady ? exp ?");
  assert.match(targetsLine({ ...p, notReadyPipelines: { perFrame: 1 }, exposure: { toneMappingExposure: 0.0001 } }), / notReady 1 exp 0.0001$/);
  assert.equal(targetsLine({ targets: [{ label: "scene", err: "x" }] }), "not-a-bar; scene err (? draws) / fb - / bloom - / canvas luma - notReady ? exp ?");
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
