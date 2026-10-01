/**
 * One renderer for every app (decision 0111): three's WebGPURenderer, on the
 * WebGPU backend where the browser has it and on its WebGL 2 backend
 * (`forceWebGL`) otherwise or when `?renderer=webgl` asks for it. Both
 * backends run the same TSL node materials, so there is one shader code path.
 */
import { WebGPURenderer } from "three/webgpu";
import { budgetShaderBuilds, SHADER_BUILD_BUDGET_MS } from "./shaderBuildBudget";
import { trimTextureWrites } from "./writeTextureSpan";

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
  /** Node-material build ms per frame before unbuilt objects wait a frame (shaderBuildBudget.ts); 0 = unbudgeted (harness scenes). */
  shaderBuildBudgetMs?: number;
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
  shareInstancedPrograms(renderer);
  trimTextureWrites(renderer);
  budgetShaderBuilds(renderer, options.shaderBuildBudgetMs ?? SHADER_BUILD_BUDGET_MS);
  return renderer;
}

/**
 * Makes every InstancedMesh read its instance matrices from an instanced
 * vertex attribute, as the classic renderer did, so meshes with the same
 * material share one program (lane L18).
 *
 * three 0.184's `InstanceNode` puts the matrices of any InstancedMesh whose
 * `count * 64` bytes fit the uniform-buffer limit into a uniform buffer named
 * after the node id and sized by the count (`NodeBuffer_2542 { mat4
 * buffer2542[37]; }`), so every such mesh compiled its own vertex program:
 * 167 programs for the 176 draws of the settlement-day harness scene. On the
 * WebGL backend each new program links synchronously on the main thread
 * (15 ms to 2 s under SwiftShader), and the studio's thousands of instanced
 * meshes never reached their first painted frame. A limit below zero sends
 * every mesh down InstanceNode's interleaved-attribute path (RangeNode, the
 * only other reader of the limit, makes the same choice).
 */
export function shareInstancedPrograms(renderer: WebGPURenderer): void {
  const backend = (renderer as unknown as { backend: { capabilities: { getUniformBufferLimit(): number } } }).backend;
  backend.capabilities.getUniformBufferLimit = () => -1;
}

/** Which backend an initialised renderer actually runs on. */
export function activeBackend(renderer: WebGPURenderer): RendererBackend {
  const backend = (renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend;
  return backend?.isWebGPUBackend ? "webgpu" : "webgl";
}
