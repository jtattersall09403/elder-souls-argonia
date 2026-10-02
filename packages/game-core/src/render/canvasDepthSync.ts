/**
 * Keeps the canvas's depth buffer the size of the canvas (16k walk 9, the
 * black WebGPU night).
 *
 * three 0.184's WebGPU backend caches the canvas render-pass descriptor,
 * depth view included, and drops it only on the renderer's resize event,
 * which it ignores while the renderer is not yet initialised. A descriptor
 * made while the drawing buffer was still the canvas default (300x150) then
 * outlives the resize: every pass drawn straight to the canvas fails
 * validation ("depth stencil attachment size (300, 150) does not match ...
 * (945, 540)") and its whole command buffer is dropped, so the frame shows
 * nothing but what other passes drew (RTX 3070 pod, Riverwalk t=22: 50
 * errors from the first frame, 10 draw calls a frame, black but for rain;
 * the same build on the next boot drew 974 calls). The install checks, before
 * three hands out the cached descriptor, that the depth texture it was made
 * with still matches the drawing buffer, and drops it when not.
 *
 * Size alone is not enough (walk 10, Riverwalk night rain, 13,759 errors):
 * `copyFramebufferToTexture` with a depth destination calls
 * `textureUtils.getDepthBuffer` directly, which re-makes the canvas depth
 * texture at the new size and sets its `image` to match, while the cached
 * descriptor keeps the view of the old (300x150, now destroyed) texture. So
 * the install also remembers which GPU depth texture each descriptor was made
 * with and drops the descriptor when the canvas depth texture is another one.
 */

interface SizeLike { width: number; height: number }

interface DepthTextureLike { image: { width: number; height: number } }

/** The parts of three's WebGPUBackend this install touches (0.184 internals). */
export interface BackendLike {
  renderer: { getCanvasTarget(): { depthTexture: DepthTextureLike } };
  get(target: object): { descriptor?: { depthStencilAttachment?: unknown }; texture?: unknown };
  getDrawingBufferSize(): SizeLike;
  updateSize(): void;
  _getDefaultRenderPassDescriptor(): unknown;
}

/** The GPU depth texture each cached canvas descriptor was made with. */
type MadeWith = WeakMap<object, unknown>;

/** True when a cached canvas descriptor's depth no longer matches the drawing buffer or the live depth texture. */
export function canvasDepthStale(backend: BackendLike, madeWith?: MadeWith): boolean {
  const target = backend.renderer.getCanvasTarget();
  const descriptor = backend.get(target).descriptor;
  if (!descriptor?.depthStencilAttachment) return false;
  const { width, height } = backend.getDrawingBufferSize();
  const image = target.depthTexture.image;
  if (image.width !== width || image.height !== height) return true;
  return madeWith !== undefined && madeWith.has(descriptor)
    && madeWith.get(descriptor) !== backend.get(target.depthTexture).texture;
}

/** Install on a WebGPU backend (no-op on the WebGL 2 fallback, which has no such cache). */
export function syncCanvasDepth(backend: object): void {
  const b = backend as Partial<BackendLike>;
  if (typeof b._getDefaultRenderPassDescriptor !== "function") return;
  const full = b as BackendLike;
  const original = full._getDefaultRenderPassDescriptor.bind(full);
  const madeWith: MadeWith = new WeakMap();
  full._getDefaultRenderPassDescriptor = () => {
    if (canvasDepthStale(full, madeWith)) full.updateSize();
    const descriptor = original();
    const target = full.renderer.getCanvasTarget();
    if (descriptor && typeof descriptor === "object" && !madeWith.has(descriptor)) {
      madeWith.set(descriptor, full.get(target.depthTexture).texture);
    }
    return descriptor;
  };
}
