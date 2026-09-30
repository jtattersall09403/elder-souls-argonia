/**
 * The studio's renderer factory for every `<Canvas>` (decision 0107): the
 * shared node renderer from game-core, plus the dev hooks the probes and the
 * HUD read — `window.__RENDERER__` (the renderer, as before) and
 * `window.__RENDERER_BACKEND__` ("webgpu" | "webgl2", the backend it ACTUALLY
 * runs on after any fallback). `?renderer=webgl|webgpu` switches.
 */
import { backendLabel, canvasRenderer, type CanvasRendererOptions } from "@elder-souls/game-core/render/canvasRenderer";
import { STUDIO_TOOLS } from "./studioTools";
import type { DeviceLossInfo } from "./gpuRecovery";

export type StudioRendererHost = {
  __RENDERER__?: unknown;
  __RENDERER_BACKEND__?: string;
};

export function studioCanvasRenderer(
  options: Omit<CanvasRendererOptions, "onReady"> & {
    /** Device loss (gpuRecovery.ts); `disposedByUs` is true when our own teardown caused it. */
    onDeviceLost?: (info: DeviceLossInfo, disposedByUs: boolean) => void;
  } = {},
) {
  const { onDeviceLost, ...rendererOptions } = options;
  return canvasRenderer({
    ...rendererOptions,
    onReady: (renderer, backend) => {
      if (onDeviceLost) {
        // three's dispose() destroys the device, which fires `device.lost`
        // ("destroyed"): mark our own teardown so it is not "recovered".
        let disposed = false;
        const dispose = renderer.dispose.bind(renderer);
        renderer.dispose = () => { disposed = true; dispose(); };
        // WebGPU: listen on the device itself. three's backend drops a loss
        // whose reason is "destroyed" before calling renderer.onDeviceLost,
        // and Chrome reports a Dawn-internal loss with exactly that reason
        // (walk-6 probes: 3 of 3 losses never reached the recovery).
        const device = (renderer.backend as { device?: GPUDevice }).device;
        if (device) {
          void device.lost.then((info) => onDeviceLost({ reason: info.reason, message: info.message }, disposed));
        } else {
          const log = renderer.onDeviceLost.bind(renderer);
          renderer.onDeviceLost = (info) => { log(info); onDeviceLost(info, disposed); };
        }
      }
      if (!STUDIO_TOOLS) return;
      const host = window as unknown as StudioRendererHost;
      host.__RENDERER__ = renderer;
      host.__RENDERER_BACKEND__ = backendLabel(backend);
      console.info(`[studio] renderer backend: ${backendLabel(backend)}`);
    },
  });
}
