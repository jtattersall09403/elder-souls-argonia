import { describe, expect, it } from "vitest";
import { syncCanvasDepth, type BackendLike } from "./canvasDepthSync";

function fakeBackend(depthSize: [number, number], buffer: [number, number]) {
  const target = { depthTexture: { image: { width: depthSize[0], height: depthSize[1] } } };
  const data: { descriptor?: { depthStencilAttachment?: unknown } } = {};
  let made = 0;
  const backend: BackendLike = {
    renderer: { getCanvasTarget: () => target },
    get: () => data,
    getDrawingBufferSize: () => ({ width: buffer[0], height: buffer[1] }),
    updateSize: () => { delete data.descriptor; },
    _getDefaultRenderPassDescriptor() {
      if (!data.descriptor) {
        // three makes the depth at the CURRENT drawing-buffer size
        target.depthTexture.image.width = buffer[0];
        target.depthTexture.image.height = buffer[1];
        data.descriptor = { depthStencilAttachment: { made: ++made } };
      }
      return data.descriptor;
    },
  };
  return { backend, target, data, resize: (w: number, h: number) => { buffer[0] = w; buffer[1] = h; }, made: () => made };
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
});
