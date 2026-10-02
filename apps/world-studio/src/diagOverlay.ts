/**
 * `&diag=1`: the per-frame GPU churn counters (game-core render/gpuDiag) on
 * screen, plus `window.__DIAG.dump()` and a "Download diag" button that saves
 * the ring as JSON, so a session on a real GPU (the owner's machine) records
 * what was created and uploaded each frame. Off unless the query asks.
 */
import { Vector2 } from "three";
import type { WebGPURenderer } from "three/webgpu";
import { createGpuDiag, type GpuDiag } from "@elder-souls/game-core/render/gpuDiag";
import { buildQueueOf } from "@elder-souls/game-core/render/shaderBuildQueue";
import { pipelineCompilesOf } from "@elder-souls/game-core/render/asyncPipelines";
import { kitDecoderBuilds } from "@elder-souls/game-core/assets/kitLoader";
import { staticRefreshOf } from "@elder-souls/game-core/render/staticRefresh";

export function diagRequested(search: string): boolean {
  return new URLSearchParams(search).get("diag") === "1";
}

export function mountDiagOverlay(renderer: WebGPURenderer): GpuDiag {
  const device = (renderer.backend as { device?: GPUDevice }).device ?? null;
  const nodes = (renderer as unknown as { _nodes?: { _createNodeBuilderState?: (...a: never[]) => unknown } })._nodes ?? null;
  const queue = buildQueueOf(renderer);
  const compiles = pipelineCompilesOf(renderer);
  const diag = createGpuDiag(device, nodes, undefined, queue ? () => queue.skippedDraws : undefined);
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(0,0,0,.72);color:#cfe;"
    + "font:11px/1.35 monospace;padding:6px 8px;white-space:pre;pointer-events:auto;border-radius:4px";
  const text = document.createElement("div");
  const button = document.createElement("button");
  button.textContent = "Download diag";
  button.style.cssText = "margin-top:4px;font:11px monospace";
  const download = () => {
    const blob = new Blob([JSON.stringify({ url: location.href, userAgent: navigator.userAgent,
      backend: device ? "webgpu" : "webgl2", kitDecoderBuilds: kitDecoderBuilds(renderer), ...diag.dump() })], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `diag-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  button.onclick = download;
  box.append(text, button);
  document.body.append(box);
  (window as unknown as { __DIAG?: unknown }).__DIAG = {
    dump: () => diag.dump(), kitDecoderBuilds: () => kitDecoderBuilds(renderer), download, diag,
    /** Every size the canvas pass depends on (walk 10: the 300x150 canvas depth); a getter, so pod-capture's JSON read carries it. */
    get sizes() { return canvasSizes(renderer); },
    /** The last GPU buffer destroys with their stacks (walk 10: "[Buffer] used in submit while destroyed"). */
    get bufferDestroys() { return bufferDestroys.slice(); },
    /** Node refreshes run and static draws skipped since start (render/staticRefresh.ts); diff two reads for per-frame counts. */
    get staticRefresh() { const c = staticRefreshOf(renderer); return c ? { ...c } : null; },
  };
  traceBufferDestroys();
  let shown = -1;
  const tick = (now: number) => {
    diag.endFrame(now);
    const sec = Math.floor(now / 1000);
    if (sec !== shown) {
      shown = sec;
      const r = diag.seconds().at(-2); // the last whole second
      if (r) {
        text.textContent = `diag ${device ? "webgpu" : "webgl2"}  ${r.fps} fps  worst ${r.ms} ms\n`
          + `per s: pipelines ${r.pipelines}  shaders ${r.shaders}  builds ${r.builds}  skipped draws ${r.skippedDraws}/s (total ${queue?.skippedDraws ?? 0})  builds pending ${queue?.pending ?? 0}  pipelines compiling ${compiles?.pending ?? 0}\n`
          + `buffers +${r.buffers} (${(r.bufferBytes / 1e6).toFixed(1)} MB) -${r.bufferDestroys}  textures +${r.textures} -${r.textureDestroys}\n`
          + `bind groups ${r.bindGroups}  write ${(r.writeBytes / 1e6).toFixed(1)} MB  tex write ${(r.textureWriteBytes / 1e6).toFixed(1)} MB\n`
          + `submits ${r.submits}  draws/frame ${Math.round(r.draws / Math.max(1, r.fps))}`;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return diag;
}

/** The renderer's drawing buffer, the canvas element and the canvas depth texture, side by side. */
function canvasSizes(renderer: WebGPURenderer) {
  const r = renderer as unknown as {
    getDrawingBufferSize(v: Vector2): Vector2;
    getPixelRatio(): number; domElement: HTMLCanvasElement;
    getCanvasTarget?: () => { depthTexture: { image: { width: number; height: number } } };
  };
  const d = r.getDrawingBufferSize(new Vector2());
  return {
    drawing: [d.x, d.y], pixelRatio: r.getPixelRatio(),
    canvas: [r.domElement.width, r.domElement.height],
    depthImage: r.getCanvasTarget ? [r.getCanvasTarget().depthTexture.image.width, r.getCanvasTarget().depthTexture.image.height] : null,
  };
}

const bufferDestroys: { t: number; size: number; usage: number; label: string; stack: string }[] = [];

/** Diag only: record every GPUBuffer.destroy with a short stack, so a submit-while-destroyed error names its owner. */
function traceBufferDestroys(): void {
  const proto = (globalThis as { GPUBuffer?: { prototype: { destroy(): void } } }).GPUBuffer?.prototype;
  if (!proto) return;
  const destroy = proto.destroy;
  proto.destroy = function (this: GPUBuffer) {
    bufferDestroys.push({ t: Math.round(performance.now()), size: this.size, usage: this.usage, label: this.label,
      stack: (new Error().stack ?? "").split("\n").slice(2, 9).join(" | ") });
    if (bufferDestroys.length > 60) bufferDestroys.shift();
    destroy.call(this);
  };
}
