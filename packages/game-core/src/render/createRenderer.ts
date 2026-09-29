/**
 * One renderer for every app (decision 0111): three's WebGPURenderer, on the
 * WebGPU backend where the browser has it and on its WebGL 2 backend
 * (`forceWebGL`) otherwise or when `?renderer=webgl` asks for it. Both
 * backends run the same TSL node materials, so there is one shader code path.
 */
import { WebGPURenderer } from "three/webgpu";

export type RendererBackend = "webgpu" | "webgl";

/**
 * The backend the page asked for: `?renderer=webgl|webgpu` wins; otherwise
 * WebGPU when `navigator.gpu` exists, else WebGL 2.
 */
export function requestedBackend(
  search: string,
  hasWebGPU: boolean,
): RendererBackend {
  const asked = new URLSearchParams(search).get("renderer");
  if (asked === "webgl") return "webgl";
  if (asked === "webgpu") return hasWebGPU ? "webgpu" : "webgl";
  return hasWebGPU ? "webgpu" : "webgl";
}

export interface CreateRendererOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  backend: RendererBackend;
  antialias?: boolean;
  alpha?: boolean;
  /** Timestamp queries for the HUD's GPU time (WebGPU: timestamp-query; WebGL: EXT_disjoint_timer_query_webgl2). */
  trackTimestamp?: boolean;
  powerPreference?: GPUPowerPreference;
}

/** Create and initialise the renderer (async: WebGPU needs a device). */
export async function createRenderer(options: CreateRendererOptions): Promise<WebGPURenderer> {
  const renderer = new WebGPURenderer({
    canvas: options.canvas as HTMLCanvasElement,
    antialias: options.antialias ?? true,
    alpha: options.alpha ?? false,
    forceWebGL: options.backend === "webgl",
    trackTimestamp: options.trackTimestamp ?? false,
    powerPreference: options.powerPreference ?? "high-performance",
  });
  await renderer.init();
  return renderer;
}

/** Which backend an initialised renderer actually runs on. */
export function activeBackend(renderer: WebGPURenderer): RendererBackend {
  const backend = (renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend;
  return backend?.isWebGPUBackend ? "webgpu" : "webgl";
}
