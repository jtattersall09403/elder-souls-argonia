/**
 * The R3F `<Canvas gl={...}>` factory every app uses (decision 0111).
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
  /** Timestamp queries from the first frame; off by default, since
   * `FrameSegments.attach` turns them on when a collector that resolves
   * them is bound. */
  trackTimestamp?: boolean;
  /** Called once the renderer is initialised, with the backend it actually
   * runs on (WebGPU falls back to WebGL 2 when no adapter is found). */
  /** Node-material builds in flight (createRenderer); 0 skips the build queue (studio `?buildq=0`). */
  shaderBuildsInFlight?: number;
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

/**
 * One renderer per canvas while it lives. R3F 9.7's `configure` awaits the
 * `gl` function and runs again on every `<Canvas>` render, so a re-render
 * during that await created a SECOND renderer on the same canvas (walk 10,
 * Riverwalk night rain): R3F sized one, the frame loop drew with the other,
 * still at the canvas default 300x150 (scene target 270x135, bloom mips from
 * 150x75), and its canvas depth (300x150) failed every canvas pass against
 * the 1265x720 swap chain. Concurrent calls for one canvas now share one
 * promise; the entry goes when that renderer is disposed.
 */
const pending = new WeakMap<object, Promise<WebGPURenderer>>();

/** `gl` prop for an R3F `<Canvas>`: builds the node renderer for this page. */
export function canvasRenderer(options: CanvasRendererOptions = {}) {
  return (defaults: R3fDefaultProps): Promise<WebGPURenderer> => {
    const canvas = defaults.canvas as object;
    const made = pending.get(canvas);
    if (made) return made;
    const promise = (async () => {
      const backend = pageBackend();
      const renderer = await createRenderer({
        canvas: canvas as HTMLCanvasElement,
        backend,
        antialias: options.antialias ?? defaults.antialias ?? true,
        alpha: options.alpha ?? defaults.alpha ?? true,
        trackTimestamp: options.trackTimestamp ?? false,
        shaderBuildsInFlight: options.shaderBuildsInFlight,
      });
      const dispose = renderer.dispose.bind(renderer);
      renderer.dispose = () => { if (pending.get(canvas) === promise) pending.delete(canvas); dispose(); };
      options.onReady?.(renderer, activeBackend(renderer));
      return renderer;
    })();
    pending.set(canvas, promise);
    promise.catch(() => { if (pending.get(canvas) === promise) pending.delete(canvas); });
    return promise;
  };
}

/** HUD label for a backend: "webgpu" or "webgl2". */
export function backendLabel(backend: RendererBackend): string {
  return backend === "webgpu" ? "webgpu" : "webgl2";
}
