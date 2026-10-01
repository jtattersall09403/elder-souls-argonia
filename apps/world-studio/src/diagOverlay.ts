/**
 * `&diag=1`: the per-frame GPU churn counters (game-core render/gpuDiag) on
 * screen, plus `window.__DIAG.dump()` and a "Download diag" button that saves
 * the ring as JSON, so a session on a real GPU (the owner's machine) records
 * what was created and uploaded each frame. Off unless the query asks.
 */
import type { WebGPURenderer } from "three/webgpu";
import { createGpuDiag, type GpuDiag } from "@elder-souls/game-core/render/gpuDiag";
import { buildQueueOf } from "@elder-souls/game-core/render/shaderBuildQueue";

export function diagRequested(search: string): boolean {
  return new URLSearchParams(search).get("diag") === "1";
}

export function mountDiagOverlay(renderer: WebGPURenderer): GpuDiag {
  const device = (renderer.backend as { device?: GPUDevice }).device ?? null;
  const nodes = (renderer as unknown as { _nodes?: { _createNodeBuilderState?: (...a: never[]) => unknown } })._nodes ?? null;
  const queue = buildQueueOf(renderer);
  const diag = createGpuDiag(device, nodes, undefined, queue ? () => queue.deferred : undefined);
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(0,0,0,.72);color:#cfe;"
    + "font:11px/1.35 monospace;padding:6px 8px;white-space:pre;pointer-events:auto;border-radius:4px";
  const text = document.createElement("div");
  const button = document.createElement("button");
  button.textContent = "Download diag";
  button.style.cssText = "margin-top:4px;font:11px monospace";
  const download = () => {
    const blob = new Blob([JSON.stringify({ url: location.href, userAgent: navigator.userAgent,
      backend: device ? "webgpu" : "webgl2", ...diag.dump() })], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `diag-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  button.onclick = download;
  box.append(text, button);
  document.body.append(box);
  (window as unknown as { __DIAG?: unknown }).__DIAG = { dump: () => diag.dump(), download, diag };
  let shown = -1;
  const tick = (now: number) => {
    diag.endFrame(now);
    const sec = Math.floor(now / 1000);
    if (sec !== shown) {
      shown = sec;
      const r = diag.seconds().at(-2); // the last whole second
      if (r) {
        text.textContent = `diag ${device ? "webgpu" : "webgl2"}  ${r.fps} fps  worst ${r.ms} ms\n`
          + `per s: pipelines ${r.pipelines}  shaders ${r.shaders}  builds ${r.builds}  held back ${r.deferred}  waiting ${queue?.pending ?? 0}\n`
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
