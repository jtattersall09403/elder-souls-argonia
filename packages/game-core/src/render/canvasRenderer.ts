/**
 * The R3F `<Canvas gl={...}>` factory every app uses (decision 0109).
 *
 * R3F 9.7 awaits a function `gl` prop and adopts whatever renderer it
 * returns; it still applies its own defaults afterwards (shadows="percentage"
 * -> PCFShadowMap, SRGB output, ACESFilmic tone mapping, dpr), so the look
 * does not change with the backend. `defaults` are R3F's own renderer props
 * (`canvas`, `antialias: true`, `alpha: true`, `powerPreference`); a Canvas
 * that passed `gl={{ alpha: false }}` before passes the same here.
 */
import type { WebGPURenderer } from "three/webgpu";
import { activeBackend, createRenderer, requestedBackend, type RendererBackend } from "./createRenderer";

export interface CanvasRendererOptions {
  antialias?: boolean;
  alpha?: boolean;
  /** Timestamp queries for the HUD's GPU time; on by default. */
  trackTimestamp?: boolean;
  /** Called once the renderer is initialised, with the backend it actually
   * runs on (WebGPU falls back to WebGL 2 when no adapter is found). */
  onReady?: (renderer: WebGPURenderer, backend: RendererBackend) => void;
}

interface R3fDefaultProps {
  /** R3F types this with its own OffscreenCanvas stand-in; it is the page's canvas. */
  canvas: unknown;
  antialias?: boolean;
  alpha?: boolean;
}

/** The backend the current page asked for (`?renderer=webgl|webgpu`). */
export function pageBackend(): RendererBackend {
  const search = typeof location === "undefined" ? "" : location.search;
  const hasGpu = typeof navigator !== "undefined" && Boolean((navigator as { gpu?: unknown }).gpu);
  return requestedBackend(search, hasGpu);
}

/** `gl` prop for an R3F `<Canvas>`: builds the node renderer for this page. */
export function canvasRenderer(options: CanvasRendererOptions = {}) {
  return async (defaults: R3fDefaultProps): Promise<WebGPURenderer> => {
    const backend = pageBackend();
    const renderer = await createRenderer({
      canvas: defaults.canvas as HTMLCanvasElement,
      backend,
      antialias: options.antialias ?? defaults.antialias ?? true,
      alpha: options.alpha ?? defaults.alpha ?? true,
      trackTimestamp: options.trackTimestamp ?? true,
    });
    options.onReady?.(renderer, activeBackend(renderer));
    return renderer;
  };
}

/** HUD label for a backend: "webgpu" or "webgl2". */
export function backendLabel(backend: RendererBackend): string {
  return backend === "webgpu" ? "webgpu" : "webgl2";
}
