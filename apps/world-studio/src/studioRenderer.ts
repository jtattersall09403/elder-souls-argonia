/**
 * The studio's renderer factory for every `<Canvas>` (decision 0107): the
 * shared node renderer from game-core, plus the dev hooks the probes and the
 * HUD read — `window.__RENDERER__` (the renderer, as before) and
 * `window.__RENDERER_BACKEND__` ("webgpu" | "webgl2", the backend it ACTUALLY
 * runs on after any fallback). `?renderer=webgl|webgpu` switches.
 */
import { backendLabel, canvasRenderer, type CanvasRendererOptions } from "@elder-souls/game-core/render/canvasRenderer";
import { STUDIO_TOOLS } from "./studioTools";

export type StudioRendererHost = {
  __RENDERER__?: unknown;
  __RENDERER_BACKEND__?: string;
};

export function studioCanvasRenderer(options: Omit<CanvasRendererOptions, "onReady"> = {}) {
  return canvasRenderer({
    ...options,
    onReady: (renderer, backend) => {
      if (!STUDIO_TOOLS) return;
      const host = window as unknown as StudioRendererHost;
      host.__RENDERER__ = renderer;
      host.__RENDERER_BACKEND__ = backendLabel(backend);
      console.info(`[studio] renderer backend: ${backendLabel(backend)}`);
    },
  });
}
