/**
 * The harness scene contract (decision 0111, lane-common.md): one file per
 * ported subsystem under ./scenes/, default-exporting a HarnessScene that
 * builds the subsystem's REAL materials from the package code in a small
 * scene lit like the game at noon (unless the subsystem is about night).
 */
import type * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";

export interface HarnessContext {
  renderer: WebGPURenderer;
  backend: "webgpu" | "webgl";
  width: number;
  height: number;
}

export interface HarnessBuilt {
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** Advance animated uniforms to `tSeconds` before each rendered frame. */
  frame?(tSeconds: number): void;
}

export interface HarnessScene {
  name: string;
  /** Dark by design (e.g. night): exempt from the runner's blackFraction bar. */
  expectDark?: boolean;
  build(ctx: HarnessContext): Promise<HarnessBuilt> | HarnessBuilt;
}

/** What the page publishes on `window.__HARNESS__` for scripts/harness-run.mjs. */
export interface HarnessResult {
  done: boolean;
  ok: boolean;
  sys: string;
  backend: "webgpu" | "webgl" | "none";
  /** The WebGPU adapter's vendor/architecture/description, when there is one. */
  adapter: string | null;
  errors: string[];
  warnings: string[];
  /** Known headless-SwiftShader noise (main.ts ENV_NOISE), never a shader fault. */
  envNoise: string[];
  calls: number;
  triangles: number;
  compileMs: number;
  frameMs: number;
  /** Distinct shader stages (vertex + fragment programs; WGSL modules on
   * WebGPU) the renderer holds after the three frames. */
  programs?: number;
  /** Distinct render pipelines (linked GL programs on WebGL) after the frames. */
  pipelines?: number;
  /** Main-thread ms inside backend.createRenderPipeline (WebGL: blocking link). */
  pipelineMs?: number;
  /** WebGL: KHR_parallel_shader_compile present (compileAsync links off the main thread). */
  parallelCompile?: boolean;
  /** Node graphs built (NodeBuilder runs) during compileAsync and the frames. */
  builds?: number;
  /** Node graphs built or programs created after the two warm-up frames
   * (frame 3 on; frame 2 builds the CSM cascades' shadow programs once). Any
   * above 0 is a material that recompiles every frame (on WebGL, synchronously
   * on the main thread): the page fails the scene. */
  rebuildsAfterWarmup?: number;
  /** Mean luma (0-255) of the read-back last frame; ~0 means nothing drew. */
  meanLuma?: number;
  /** Fraction of pixels differing from the corner (background) pixel. */
  drawnFraction?: number;
  /** Fraction of pixels a mesh covered (alpha > 0 when re-rendered with no
   * background over a transparent clear). */
  coveredFraction?: number;
  /** Fraction of covered pixels with luma < 3: a
   * NaN or unlit surface renders black. The runner fails a run above
   * BLACK_FRACTION_MAX unless the scene sets `expectDark`. */
  blackFraction?: number;
  expectDark?: boolean;
}
