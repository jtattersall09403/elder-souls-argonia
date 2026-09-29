/**
 * The harness scene contract (decision 0109, lane-common.md): one file per
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
  /** Mean luma (0-255) of the read-back last frame; ~0 means nothing drew. */
  meanLuma?: number;
  /** Fraction of pixels differing from the corner (background) pixel. */
  drawnFraction?: number;
}
