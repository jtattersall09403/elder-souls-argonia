/**
 * Subsystem harness page (dev only; decision 0109). Owner ruling: no
 * full-studio headless probes; one small page per subsystem instead.
 *
 *   harness.html?sys=<name>&renderer=webgl|webgpu&w=512&h=288
 *
 * Loads ./scenes/<name>.ts, creates the renderer through the shared
 * `createRenderer`, builds the scene, `compileAsync`s every program, renders
 * three frames (calling `frame(t)` before each), then publishes
 * `window.__HARNESS__` (types.ts `HarnessResult`). Console errors and
 * warnings raised while it runs are captured into the result as well, so a
 * shader that fails to compile on one backend reads as `ok: false`.
 */
import { activeBackend, createRenderer, requestedBackend } from "@elder-souls/game-core/render/createRenderer";
import type { HarnessResult, HarnessScene } from "./types";

declare global {
  interface Window {
    __HARNESS__?: HarnessResult;
    __HARNESS_SCENES__?: string[];
  }
}

const modules = import.meta.glob<{ default: HarnessScene }>("./scenes/*.ts");
const sceneNames = Object.keys(modules).map((p) => p.replace(/^\.\/scenes\//, "").replace(/\.ts$/, ""));
window.__HARNESS_SCENES__ = sceneNames;

const params = new URLSearchParams(window.location.search);
const sys = params.get("sys") ?? "";
const width = Number(params.get("w")) || 512;
const height = Number(params.get("h")) || 288;

const errors: string[] = [];
const warnings: string[] = [];
const text = (args: unknown[]) => args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ").slice(0, 600);
const origError = console.error.bind(console);
const origWarn = console.warn.bind(console);
console.error = (...args: unknown[]) => { errors.push(text(args)); origError(...args); };
console.warn = (...args: unknown[]) => { warnings.push(text(args)); origWarn(...args); };
window.addEventListener("error", (e) => errors.push(String(e.message)));
/**
 * Headless Chromium's SwiftShader WebGPU drops the GPU instance as soon as a
 * page PRESENTS to a WebGPU canvas (`getCurrentTexture` on a configured
 * context): every later `popErrorScope` rejects "Instance dropped in
 * popErrorScope" and every `mapAsync` aborts, so validation errors are lost
 * and nothing can be read back (reproduced with raw WebGPU, no three.js;
 * configure alone, or rendering to a texture, is fine). The harness therefore
 * never presents: every frame renders into an output RenderTarget (tone
 * mapped + sRGB like the canvas), which is read back and shown on a 2D
 * canvas for the screenshot. ENV_NOISE only guards against a scene that
 * presents on its own.
 */
const ENV_NOISE = /Instance dropped in popErrorScope/;
const envNoise: string[] = [];
window.addEventListener("unhandledrejection", (e) => {
  const msg = `unhandled: ${String(e.reason)}`;
  if (ENV_NOISE.test(msg)) { envNoise.push(msg); e.preventDefault(); } else errors.push(msg);
});

/** The WebGPU adapter the renderer's device came from (GPUDevice.adapterInfo). */
function adapterInfo(renderer: unknown): string | null {
  const device = (renderer as { backend?: { device?: { adapterInfo?: Record<string, string> } } })
    .backend?.device;
  const info = device?.adapterInfo;
  if (!info) return null;
  return [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(" / ")
    || "adapter (empty info)";
}

async function main(): Promise<HarnessResult> {
  const result: HarnessResult = {
    done: true, ok: false, sys, backend: "none", adapter: null,
    errors, warnings, envNoise, calls: 0, triangles: 0, compileMs: 0, frameMs: 0,
  };
  const load = modules[`./scenes/${sys}.ts`];
  if (!load) {
    errors.push(`unknown sys "${sys}"; scenes: ${sceneNames.join(", ")}`);
    return result;
  }
  const canvas = document.createElement("canvas");
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  document.body.appendChild(canvas);
  const hasGpu = Boolean((navigator as { gpu?: unknown }).gpu);
  const renderer = await createRenderer({
    canvas, backend: requestedBackend(window.location.search, hasGpu), antialias: false,
  });
  // The game's output settings (R3F's Canvas defaults, which every app keeps).
  const THREE = await import("three");
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const backend = activeBackend(renderer);
  result.backend = backend;
  result.adapter = adapterInfo(renderer);
  // Counters accumulate over the whole frame; three's own loop would reset
  // them on every animation frame before they are read.
  renderer.info.autoReset = false;

  // Render into an output target, never the canvas (see ENV_NOISE above).
  const { RenderTarget } = await import("three/webgpu");
  const target = new RenderTarget(width, height, { depthBuffer: true });
  renderer.setOutputRenderTarget(target);
  renderer.setRenderTarget(target);

  const { default: harnessScene } = await load();
  const built = await harnessScene.build({ renderer, backend, width, height });
  const t0 = performance.now();
  if (params.get("compile") !== "0") await renderer.compileAsync(built.scene, built.camera);
  result.compileMs = Math.round(performance.now() - t0);

  const f0 = performance.now();
  for (let i = 0; i < 3; i++) {
    built.frame?.(i / 30);
    renderer.info.reset();
    renderer.render(built.scene, built.camera);
    // Let the GPU finish each frame so errors surface before the next one.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  result.frameMs = Math.round((performance.now() - f0) / 3);
  // The last frame, read back and shown on a 2D canvas in place of the
  // live one, on BOTH backends so the two screenshots come from the same
  // path. Mean luma and the fraction of pixels unlike the corner pixel land
  // in the result: "drew something" is a number.
  const px = new Uint8Array((await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height)).buffer);
  renderer.setRenderTarget(null);
  renderer.setOutputRenderTarget(null);
  target.dispose();
  const shown = document.createElement("canvas");
  shown.width = width; shown.height = height;
  const image = new ImageData(width, height);
  const rowBytes = width * 4;
  let luma = 0;
  for (let y = 0; y < height; y++) {
    // WebGL reads bottom-up; WebGPU's texture copy is top-down.
    const src = (backend === "webgl" ? height - 1 - y : y) * rowBytes;
    image.data.set(px.subarray(src, src + rowBytes), y * rowBytes);
  }
  for (let i = 0; i < px.length; i += 4) luma += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  result.meanLuma = Math.round((luma / (width * height)) * 10) / 10;
  let differ = 0;
  // Top-left corner on both backends (image rows are already top-down).
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 12) differ++;
  }
  result.drawnFraction = Math.round((differ / (width * height)) * 1000) / 1000;
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
  shown.getContext("2d")!.putImageData(image, 0, 0);
  canvas.replaceWith(shown);
  result.calls = renderer.info.render.drawCalls;
  result.triangles = renderer.info.render.triangles;
  result.ok = errors.length === 0;
  return result;
}

main()
  .then((r) => { window.__HARNESS__ = r; })
  .catch((e) => {
    errors.push(`harness failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    window.__HARNESS__ = {
      done: true, ok: false, sys, backend: "none", adapter: null,
      errors, warnings, envNoise, calls: 0, triangles: 0, compileMs: 0, frameMs: 0,
    };
  });
