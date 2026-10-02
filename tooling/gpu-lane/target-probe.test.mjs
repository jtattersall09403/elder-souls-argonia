// node --test tooling/gpu-lane/target-probe.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { installTargetProbe, recordPassDescriptor, targetsLine, canvasNine } from "./target-probe.mjs";

function fakeWindow(renderer) {
  class GPUTexture { constructor(label, format, sampleCount) { Object.assign(this, { label, format, sampleCount, width: 8, height: 4 }); } createView() { return {}; } }
  class GPUCanvasContext { constructor() { this.t = new GPUTexture("", "bgra8unorm", 1); } getCurrentTexture() { return this.t; } }
  const begun = [];
  class GPUCommandEncoder { beginRenderPass(d) { begun.push(d); return {}; } }
  const win = { GPUTexture, GPUCanvasContext, GPUCommandEncoder, __RENDERER__: renderer, requestAnimationFrame: (f) => setTimeout(f, 0) };
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

test("target probe: capture labels fb / scene / bloom and decodes half-float pixels", async () => {
  const HALF_ONE = 0x3c00, HALF_ZERO = 0;
  const rt = (id, w, h, px) => ({ id, width: w, height: h, samples: 0, texture: { type: 1016, name: "" }, px });
  const fb = rt(1, 64, 32, HALF_ZERO), scene = rt(2, 64, 32, HALF_ONE), mip0 = rt(3, 32, 16, HALF_ZERO), mip1 = rt(4, 16, 8, HALF_ZERO);
  const r = {
    _frameBufferTargets: new Map([["c", fb]]),
    setRenderTarget() {}, getRenderTarget: () => null,
    readRenderTargetPixelsAsync: async (t) => new Uint16Array([t.px, t.px, t.px, HALF_ONE]),
  };
  const { win } = fakeWindow(r);
  const frame = () => { r.setRenderTarget(scene); r.setRenderTarget(null); r.setRenderTarget(mip0); r.setRenderTarget(mip1); r.setRenderTarget(null); };
  const tick = setInterval(frame, 0);
  const p = await win.__targetProbe.capture();
  clearInterval(tick);
  const by = Object.fromEntries(p.targets.map((t) => [t.label, t]));
  assert.equal(by.fb.mean9, 0);
  assert.equal(by.scene.mean9, 1);
  assert.equal(by.scene.id, 2);
  assert.equal(by.bloom.id, 3);
  assert.ok(p.setRenderTarget.length > 0);
});

test("targetsLine: the summary cell", () => {
  const p = { targets: [{ label: "scene", mean9: 0.41 }, { label: "fb", mean9: 0.4 }, { label: "bloom", mean9: 0.02 }], canvas: { mean9: 0.003 } };
  assert.equal(targetsLine(p), "not-a-bar; scene 0.41 / fb 0.40 / bloom 0.02 / canvas 0.003");
  assert.equal(targetsLine({ targets: [{ label: "scene", err: "x" }] }), "not-a-bar; scene err / fb - / bloom - / canvas -");
  assert.equal(targetsLine({ err: "no target probe on the page" }), "not-a-bar; probe unread (no target probe on the page)");
  assert.equal(targetsLine(null), null);
});

test("canvasNine: centre and 9-point mean of screenshot luma", () => {
  const w = 4, h = 4, d = new Uint8ClampedArray(w * h * 4);
  d.set([255, 255, 255, 255], (2 * w + 2) * 4); // the centre point (0.5, 0.5) -> (2, 2)
  assert.deepEqual(canvasNine(d, w, h), { centre: 1, mean9: 0.1111 });
});
