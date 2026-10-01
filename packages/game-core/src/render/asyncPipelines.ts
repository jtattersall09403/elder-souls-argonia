import type { WebGPURenderer } from "three/webgpu";

/**
 * Render pipelines compile off the queue (walk 9, the real-GPU timeline).
 *
 * three creates a draw's pipeline with the synchronous `createRenderPipeline`
 * the first frame it is drawn. The call returns at once in JS, but the GPU
 * process compiles the shader before it runs anything after it, so a frame
 * with new pipelines stalls the queue for the whole compile: on an RTX 3070
 * pod, Riverwalk's first 50 s ran at under one frame a second with the main
 * thread idle (pod run 2, 2026-10-01). Through `createRenderPipelineAsync`
 * the driver compiles on its own threads; the draw waits (three's
 * `Pipelines.isReady`) while every other draw keeps drawing. This routes the
 * renderer's per-draw pipeline step down three's own async path (the one
 * `compileAsync` uses); the promises are only counted, for the diagnostics.
 */
export interface PipelineCompiles {
  /** pipelines compiling now */
  pending: number;
  /** pipelines compiled so far */
  done: number;
}

interface PipelinesInternals {
  getForRender(renderObject: object, promises?: { push(p: Promise<unknown>): void } | null): unknown;
  updateForRender(renderObject: object): void;
}

export function compilePipelinesAsync(renderer: WebGPURenderer): PipelineCompiles {
  const pipelines = (renderer as unknown as { _pipelines: PipelinesInternals })._pipelines;
  const state: PipelineCompiles = { pending: 0, done: 0 };
  const sink = {
    push(p: Promise<unknown>) {
      state.pending++;
      void p.finally(() => { state.pending--; state.done++; });
    },
  };
  pipelines.updateForRender = (renderObject: object) => { pipelines.getForRender(renderObject, sink); };
  Object.defineProperty(renderer, "esPipelineCompiles", { value: state, configurable: true });
  return state;
}

/** The counters installed on `renderer`, if any. */
export function pipelineCompilesOf(renderer: object): PipelineCompiles | null {
  return (renderer as { esPipelineCompiles?: PipelineCompiles }).esPipelineCompiles ?? null;
}
