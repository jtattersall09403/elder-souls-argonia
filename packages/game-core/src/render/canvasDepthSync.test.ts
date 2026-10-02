import { describe, expect, it } from "vitest";
import { syncCanvasDepth, type BackendLike } from "./canvasDepthSync";

function fakeBackend(depthSize: [number, number], buffer: [number, number]) {
  const target = { depthTexture: { image: { width: depthSize[0], height: depthSize[1] } } };
  const data: { descriptor?: { depthStencilAttachment?: unknown } } = {};
  const depthData: { texture?: unknown } = {};
  let made = 0;
  let gpu = 0;
  // three's textureUtils.getDepthBuffer: re-makes the GPU depth at the drawing-buffer size when the image differs
  const getDepthBuffer = () => {
    const img = target.depthTexture.image;
    if (depthData.texture === undefined || img.width !== buffer[0] || img.height !== buffer[1]) {
      img.width = buffer[0]; img.height = buffer[1];
      depthData.texture = { gpu: ++gpu };
    }
    return depthData.texture;
  };
  const backend: BackendLike = {
    renderer: { getCanvasTarget: () => target },
    get: (o: object) => (o === target ? data : depthData),
    getDrawingBufferSize: () => ({ width: buffer[0], height: buffer[1] }),
    updateSize: () => { delete data.descriptor; },
    _getDefaultRenderPassDescriptor() {
      if (!data.descriptor) {
        data.descriptor = { depthStencilAttachment: { view: getDepthBuffer(), made: ++made } };
      }
      return data.descriptor;
    },
  };
  return { backend, target, data, getDepthBuffer, resize: (w: number, h: number) => { buffer[0] = w; buffer[1] = h; }, made: () => made };
}

describe("syncCanvasDepth", () => {
  it("drops a canvas descriptor made at the default size once the canvas has grown (resize event missed)", () => {
    const f = fakeBackend([0, 0], [300, 150]);
    syncCanvasDepth(f.backend);
    f.backend._getDefaultRenderPassDescriptor();
    expect(f.target.depthTexture.image.width).toBe(300);
    f.resize(945, 540); // three ignored the resize event: nothing cleared the cache
    f.backend._getDefaultRenderPassDescriptor();
    expect(f.target.depthTexture.image).toEqual({ width: 945, height: 540 });
    expect(f.made()).toBe(2);
  });

  it("keeps the cached descriptor while the sizes agree", () => {
    const f = fakeBackend([0, 0], [945, 540]);
    syncCanvasDepth(f.backend);
    f.backend._getDefaultRenderPassDescriptor();
    f.backend._getDefaultRenderPassDescriptor();
    expect(f.made()).toBe(1);
  });

  it("drops the descriptor when a depth copy re-made the canvas depth behind it (walk 10 night rain)", () => {
    const f = fakeBackend([0, 0], [300, 150]);
    syncCanvasDepth(f.backend);
    f.backend._getDefaultRenderPassDescriptor();
    f.resize(1265, 720);
    const live = f.getDepthBuffer(); // copyFramebufferToTexture: image now 1265x720, descriptor still holds the 300x150 view
    const d = f.backend._getDefaultRenderPassDescriptor() as { depthStencilAttachment: { view: unknown } };
    expect(d.depthStencilAttachment.view).toBe(live);
    expect(f.made()).toBe(2);
  });
});
