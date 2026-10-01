/**
 * Boot the BUILT WebGPU studio headless the way GitHub Pages serves /webgpu/,
 * and fail on a hang, a GPU validation error, a device loss or no frame
 * (decision 0111 "Boot check"). Run it before handing the owner a webgpu build.
 *
 *   node scripts/webgpu-boot-check.mjs [--query "view=character&x=0.331&z=3.079&t=10%3A00"]
 *     [--dist /tmp/wgb | (builds into --dist when --no-build is absent)] [--seconds 60]
 *     [--first-frame 60] [--max-task-ms 4000] [--max-gpu-stall-ms 15000] [--heap-mb 1500] [--out /tmp/webgpu-boot.json] [--profile 30]
 *     [--gpu-timing]   (GPU ms per slow submit, diagnosis only)
 *     [--alloc]        (sampled JS allocations by function: heap churn, diagnosis only)
 *     [--hang-grace 20] (s a ping still out at the end may take before it counts as a hang)
 *
 * It builds the bundle as the Pages workflow does (ES_STUDIO_BASE=/elder-souls-argonia/webgpu/,
 * VITE_ES_DATA_BASE=/elder-souls-argonia/studio/) unless --no-build, serves it with this
 * app's public/ as the data base and the character files at the site root, and loads it in
 * headless Chromium on SwiftShader's WebGPU adapter (harness-run.mjs flags).
 *
 * Headless SwiftShader drops the GPU device the moment a page PRESENTS to a WebGPU
 * canvas (a 1-frame red-clear page loses it after 1-4 frames), which read as a
 * device-loss/remount loop in walk 6. The check therefore replaces the canvas
 * context's swap chain with an offscreen texture on the same device (the page's
 * code runs unchanged; only the final present is skipped), so the device lives and
 * every validation error surfaces. `--present` keeps the real swap chain (for a
 * remote real-GPU Chrome, CHROME_CDP=ws://... connects to it instead of launching).
 *
 * Fails (exit 1) on: no frame within --first-frame s; a main-thread task longer than
 * --max-task-ms of JavaScript (the "not responding" class: a task's time minus the time it spent
 * blocked inside WebGPU calls, which is GPU back-pressure SwiftShader inflates many times over);
 * one WebGPU call blocking over --max-gpu-stall-ms; a device loss; any uncaptured GPU error;
 * any page error; JS heap over --heap-mb. SwiftShader is slow at GPU work, so frame
 * rates here are ratios only; main-thread (JS) time is the device's own order.
 */
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);
const appDir = resolve(new URL("..", import.meta.url).pathname);
const dist = resolve(arg("dist", "/tmp/webgpu-boot-dist"));
const out = resolve(arg("out", "/tmp/webgpu-boot.json"));
const query = arg("query", "view=character&x=0.331&z=3.079&t=10%3A00");
const seconds = Number(arg("seconds", "60"));
const bars = { firstFrameS: Number(arg("first-frame", "60")), maxTaskMs: Number(arg("max-task-ms", "4000")),
  maxGpuStallMs: Number(arg("max-gpu-stall-ms", "15000")),
  heapMb: Number(arg("heap-mb", "1500")) };
const present = flag("present");

if (!flag("no-build")) {
  const t = Date.now();
  const r = spawnSync("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir"], { cwd: appDir, stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, ES_STUDIO_BASE: "/elder-souls-argonia/webgpu/", VITE_ES_DATA_BASE: "/elder-souls-argonia/studio/" } });
  if (r.status !== 0) { console.error("webgpu-boot-check: build failed"); process.exit(2); }
  console.log(`built ${dist} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
}

const publicDir = join(appDir, "public");
const MIME = { ".js": "text/javascript", ".html": "text/html", ".json": "application/json", ".css": "text/css",
  ".wasm": "application/wasm", ".png": "image/png", ".ktx2": "image/ktx2", ".glb": "model/gltf-binary" };
const charDir = resolve(appDir, "../../packages/character-assets/files");
// Pages: the character files resolve against the sandbox at the site root.
const ROOTS = [["/elder-souls-argonia/webgpu/", dist], ["/elder-souls-argonia/studio/", publicDir], ["/elder-souls-argonia/", charDir]];
// The KTX2 transcoder, as packages/basis-transcoder ships it into every Pages build.
const basisDir = dirname(createRequire(import.meta.url).resolve("three/examples/jsm/libs/basis/basis_transcoder.js"));
const missing = new Set();
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);
  const basis = /\/basis\/(basis_transcoder\.(?:js|wasm))$/.exec(path);
  if (basis) { res.writeHead(200, { "Content-Type": MIME[extname(basis[1])] }); createReadStream(join(basisDir, basis[1])).pipe(res); return; }
  for (const [prefix, root] of ROOTS) {
    if (!path.startsWith(prefix)) continue;
    let file = join(root, path.slice(prefix.length) || "index.html");
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    if (!existsSync(file)) break;
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
    return;
  }
  missing.add(path);
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/elder-souls-argonia/webgpu/?${query}`;

const browser = process.env.CHROME_CDP ? await chromium.connectOverCDP(process.env.CHROME_CDP)
  : await chromium.launch({ headless: true, args: ["--enable-unsafe-webgpu", "--enable-features=UnsafeWebGPU",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const t0 = Date.now();
const lines = [];
page.on("console", (m) => lines.push({ t: Date.now() - t0, type: m.type(), text: m.text().slice(0, 400) }));
page.on("pageerror", (e) => lines.push({ t: Date.now() - t0, type: "pageerror", text: String(e.stack || e).slice(0, 600) }));
await page.addInitScript(([present, gpuTiming]) => {
  const g = { frames: 0, firstFrameMs: null, total: 0, count: 0, big: [], losses: [], destroys: [], devices: 0, errors: [], pipelines: 0, pipelineMs: 0 };
  window.__BOOT__ = g;
  const stack = () => new Error().stack.split("\n").slice(2, 12).join(" | ").slice(0, 900);
  const req = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...a) {
    const dev = await req.apply(this, a);
    const id = ++g.devices;
    dev.lost.then((i) => { g.losses.push({ id, t: Math.round(performance.now()), reason: i.reason, message: i.message }); });
    dev.addEventListener("uncapturederror", (e) => { if (g.errors.length < 50) g.errors.push([id, Math.round(performance.now()), String(e.error?.message).slice(0, 400)]); });
    return dev;
  };
  const D = GPUDevice.prototype;
  const destroy = D.destroy;
  D.destroy = function () { g.destroys.push({ t: Math.round(performance.now()), stack: stack() }); return destroy.call(this); };
  const createBuffer = D.createBuffer;
  D.createBuffer = function (d) {
    g.total += d.size; g.count += 1;
    // bytes created per call site (the first two frames outside the hook): buffer churn
    const site = new Error().stack.split("\n").slice(2, 4).map((l) => l.trim().replace(/^at /, "").replace(/\(?https?:\/\/[^/]+\/[^)]*\/([^/)]+)\)?/, "$1")).join(" < ");
    (g.bufferBy ??= {})[site] = (g.bufferBy[site] ?? 0) + d.size;
    if (d.size >= 16 * 1024 * 1024) g.big.push([Math.round(performance.now()), d.size, d.label ?? "", stack().slice(0, 300)]);
    return createBuffer.call(this, d);
  };
  // Every GPU call that holds the main thread over 100 ms: the call, its size, its label and who made it.
  g.slow = []; g.maxDispatch = null;
  const timed = (proto, name, what) => { const f = proto[name]; proto[name] = function (...a) {
    const t = performance.now(); const r = f.apply(this, a); const ms = performance.now() - t;
    if (ms > 100 && g.slow.length < 40) g.slow.push([Math.round(t), Math.round(ms), name, what(a, this), stack().slice(0, 400)]);
    return r; }; };
  timed(GPUQueue.prototype, "writeTexture", (a) => `${a[0].texture?.label ?? ""} ${a[3]?.width ?? a[3]?.[0]}x${a[3]?.height ?? a[3]?.[1]} ${a[1]?.byteLength ?? "?"} B`);
  timed(GPUQueue.prototype, "writeBuffer", (a) => `${a[0]?.label ?? ""} ${a[2]?.byteLength ?? "?"} B`);
  timed(GPUQueue.prototype, "submit", (a) => `${a[0]?.length} command buffers`);
  const dispatch = GPUComputePassEncoder.prototype.dispatchWorkgroups;
  GPUComputePassEncoder.prototype.dispatchWorkgroups = function (x, y = 1, z = 1) {
    if (!g.maxDispatch || x * y * z > g.maxDispatch[0]) g.maxDispatch = [x * y * z, x, y, z, this.label ?? "", stack().slice(0, 300)];
    return dispatch.call(this, x, y, z);
  };
  // Draw work per pipeline: vertices x instances submitted per pipeline label
  // (three names pipelines after their material), indirect draws counted apart.
  g.drawBy = {}; g.gpuSubmitMs = [];
  {
    const RP = GPURenderPassEncoder.prototype;
    const cur = new WeakMap();
    const setPipeline = RP.setPipeline;
    RP.setPipeline = function (p) { cur.set(this, String(p.label || "?").replace(/^renderPipeline_/, "").replace(/_\d+$/, "")); return setPipeline.call(this, p); };
    const add = (enc, verts, indirect) => {
      const k = cur.get(enc) ?? "?";
      const e = (g.drawBy[k] ??= [0, 0, 0]); e[0] += verts; e[1] += 1; e[2] += indirect ? 1 : 0;
    };
    const draw = RP.draw; RP.draw = function (v, i = 1, ...r) { add(this, v * i, false); return draw.call(this, v, i, ...r); };
    const drawIndexed = RP.drawIndexed; RP.drawIndexed = function (v, i = 1, ...r) { add(this, v * i, false); return drawIndexed.call(this, v, i, ...r); };
    const di = RP.drawIndirect; RP.drawIndirect = function (...a) { add(this, 0, true); return di.apply(this, a); };
    const dii = RP.drawIndexedIndirect; RP.drawIndexedIndirect = function (...a) { add(this, 0, true); return dii.apply(this, a); };
  }
  // --gpu-timing: GPU ms per submit (FIFO queue: done(k) - max(done(k-1), submit(k))).
  if (gpuTiming) {
    const submit = GPUQueue.prototype.submit;
    let lastDone = 0;
    GPUQueue.prototype.submit = function (bufs) {
      const r = submit.call(this, bufs);
      const t = performance.now();
      this.onSubmittedWorkDone().then(() => {
        const now = performance.now();
        const ms = now - Math.max(lastDone, t); lastDone = now;
        if (ms > 200 && g.gpuSubmitMs.length < 40) g.gpuSubmitMs.push([Math.round(t), Math.round(ms), bufs.map((b) => b.label).join(",").slice(0, 120)]);
      });
      return r;
    };
  }
  // A shader over the per-stage texture limit (16 on SwiftShader and many phones): its label and texture bindings.
  g.overTextures = [];
  const createShaderModule = D.createShaderModule;
  D.createShaderModule = function (d) {
    const names = [...String(d.code).matchAll(/var\s+(\w+)\s*:\s*texture_/g)].map((m) => m[1]);
    if (names.length > this.limits.maxSampledTexturesPerShaderStage && g.overTextures.length < 10)
      g.overTextures.push([d.label ?? "", names.length, names.join(" ")]);
    return createShaderModule.call(this, d);
  };
  // Synchronous pipeline creation blocks the main thread on a real GPU driver's compile.
  const createPipeline = D.createRenderPipeline;
  D.createRenderPipeline = function (d) { const t = performance.now(); const p = createPipeline.call(this, d); g.pipelines++; g.pipelineMs += performance.now() - t; return p; };
  const C = GPUCanvasContext.prototype;
  const getCurrentTexture = C.getCurrentTexture;
  const frame = () => { g.frames++; if (g.firstFrameMs === null) g.firstFrameMs = Math.round(performance.now()); };
  if (present) {
    C.getCurrentTexture = function () { frame(); return getCurrentTexture.call(this); };
  } else {
    // Offscreen swap chain: same device, same format, never presented.
    C.configure = function (c) { this.__cfg = c; };
    C.unconfigure = function () { this.__tex?.destroy(); this.__tex = null; this.__cfg = null; };
    C.getConfiguration = function () { return this.__cfg ?? null; };
    C.getCurrentTexture = function () {
      frame();
      const c = this.canvas, cfg = this.__cfg;
      if (!this.__tex || this.__tex.width !== c.width || this.__tex.height !== c.height) {
        this.__tex?.destroy();
        this.__tex = cfg.device.createTexture({ size: [c.width, c.height], format: cfg.format, label: "boot-check offscreen canvas",
          usage: (cfg.usage ?? GPUTextureUsage.RENDER_ATTACHMENT) | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      }
      return this.__tex;
    };
  }
  // Node-graph builds (three's NodeManager, 0.184 internals): count and main-thread ms per material name.
  g.builds = 0; g.buildMs = 0; g.buildBy = {};
  let r0 = undefined;
  Object.defineProperty(window, "__RENDERER__", { configurable: true, get: () => r0, set: (r) => {
    r0 = r;
    const nodes = r?._nodes;
    if (!nodes || nodes.__bootHooked) return;
    nodes.__bootHooked = true;
    const orig = nodes._createNodeBuilderState.bind(nodes);
    nodes._createNodeBuilderState = (...a) => {
      const t = performance.now();
      const out = orig(...a);
      const ms = performance.now() - t;
      g.builds++; g.buildMs += ms;
      const m = a[0]?.material;
      const k = (m?.name || m?.type || "?").replace(/\d{3,}/g, "#");
      const e = (g.buildBy[k] ??= [0, 0]); e[0] += ms; e[1] += 1;
      // a material over 16 fragment textures: what each texture is (name, size, the uniform's name)
      const tex = [];
      for (const group of out?.bindings ?? []) for (const b of group.bindings ?? []) {
        if (!b.isSampledTexture || !(b.visibility & 2)) continue;
        const t = b.texture, img = t?.image;
        tex.push(`${b.name}:${t?.name || t?.constructor?.name || "?"}${img?.width ? `@${img.width}x${img.height}${img.depth > 1 ? "x" + img.depth : ""}` : ""}`);
      }
      if (tex.length > 16 && (g.overTextureMaterials ??= []).length < 10) g.overTextureMaterials.push([k, tex.length, tex.join(" ")]);
      return out;
    };
  } });
  window.__LONG_TASKS__ = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__LONG_TASKS__.push([Math.round(e.startTime), Math.round(e.duration)]); })
    .observe({ type: "longtask", buffered: true });
}, [present, flag("gpu-timing")]);

const cdp = await page.context().newCDPSession(page);
const profileS = Number(arg("profile", "0"));
if (profileS > 0) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start"); }
let profileTop = null;
const stopProfile = async () => {
  const { profile } = await cdp.send("Profiler.stop");
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  profile.samples.forEach((id, i) => {
    const f = byId.get(id).callFrame;
    const k = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
    self.set(k, (self.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  });
  profileTop = [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, ms]) => [Math.round(ms), k]);
};
if (profileS > 0) setTimeout(() => { stopProfile().catch(() => {}); }, profileS * 1000);

if (flag("alloc")) { await cdp.send("HeapProfiler.enable"); await cdp.send("HeapProfiler.startSampling", { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
page.goto(url, { waitUntil: "load", timeout: 120_000 }).catch((e) => lines.push({ t: Date.now() - t0, type: "goto", text: String(e) }));
// Heartbeat: a CDP ping every second; its latency is how long the page's main
// thread was busy. A ping still unanswered at the end is a hang in progress.
const heap = [];
let maxPingMs = 0, pending = null, lastBoot = null;
const beat = setInterval(() => {
  if (pending) return;
  const s = Date.now();
  pending = cdp.send("Runtime.getHeapUsage").then((h) => { heap.push([s - t0, Math.round(h.usedSize / 1e6)]); })
    .then(() => page.evaluate(() => JSON.stringify(window.__BOOT__))).then((j) => { if (j) lastBoot = JSON.parse(j); })
    .catch(() => {}).finally(() => { maxPingMs = Math.max(maxPingMs, Date.now() - s); pending = null; });
}, 1000);
await new Promise((r) => setTimeout(r, seconds * 1000));
clearInterval(beat);
// A ping still out at the end gets a grace period: a SwiftShader GPU stall clears in seconds, a hang does not.
const graceS = Number(arg("hang-grace", "20"));
if (pending) await Promise.race([pending, new Promise((r) => setTimeout(r, graceS * 1000))]);
const hung = !!pending;
const hungMs = pending ? Date.now() - t0 - (heap.at(-1)?.[0] ?? 0) : 0;
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
const boot = (await withTimeout(page.evaluate(() => window.__BOOT__), 20_000)) ?? lastBoot;
let allocTop = null;
if (flag("alloc")) {
  const r = await withTimeout(cdp.send("HeapProfiler.stopSampling"), 20_000);
  if (r) {
    const self = new Map();
    const walk = (n) => { const f = n.callFrame; const k = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}`;
      self.set(k, (self.get(k) ?? 0) + n.selfSize); n.children.forEach(walk); };
    walk(r.profile.head);
    allocTop = [...self].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, b]) => [Math.round(b / 1e6), k]);
  }
}
const longTasks = (await withTimeout(page.evaluate(() => window.__LONG_TASKS__), 5_000)) ?? [];
await withTimeout(browser.close(), 10_000);
server.close();

const pageErrors = lines.filter((l) => l.type === "pageerror").map((l) => `${l.t} ${l.text.slice(0, 300)}`);
const consoleErrors = [...new Set(lines.filter((l) => l.type === "error").map((l) => l.text.slice(0, 200)))];
// A long task's JS time: its duration less the WebGPU calls inside it that blocked over 100 ms.
const gpuBlocked = boot?.slow ?? [];
const jsMs = ([t, d]) => d - gpuBlocked.filter(([s]) => s >= t && s < t + d).reduce((a, x) => a + x[1], 0);
const maxTaskMs = Math.max(0, hungMs, ...longTasks.map(jsMs));
const maxGpuStallMs = Math.max(0, ...gpuBlocked.map((x) => x[1]));
const heapPeakMb = Math.max(0, ...heap.map((h) => h[1]));
const fails = [];
if (hung) fails.push("page did not answer at the end (main thread hung)");
if (boot) {
  if (boot.firstFrameMs === null || boot.firstFrameMs > bars.firstFrameS * 1000) fails.push(`first frame ${boot.firstFrameMs ?? "never"} ms > ${bars.firstFrameS} s`);
  if (boot.losses.length) fails.push(`device lost ${boot.losses.length}x: ${boot.losses.map((l) => `${l.reason} ${l.message}`.slice(0, 120)).join("; ")}`);
  if (boot.errors.length) fails.push(`${boot.errors.length} uncaptured GPU errors, first: ${boot.errors[0][2].split("\n")[0]}`);
}
if (maxTaskMs > bars.maxTaskMs) fails.push(`main-thread JS task ${maxTaskMs} ms > ${bars.maxTaskMs} ms`);
if (maxGpuStallMs > bars.maxGpuStallMs) fails.push(`a WebGPU call blocked ${maxGpuStallMs} ms > ${bars.maxGpuStallMs} ms`);
if (pageErrors.length) fails.push(`${pageErrors.length} page errors, first: ${pageErrors[0].slice(0, 200)}`);
if (heapPeakMb > bars.heapMb) fails.push(`JS heap ${heapPeakMb} MB > ${bars.heapMb} MB`);
const summary = {
  url, seconds, bars, ok: fails.length === 0, fails,
  firstFrameMs: boot?.firstFrameMs ?? null, frames: boot?.frames ?? 0, maxTaskMs, maxGpuStallMs, maxPingMs, heapPeakMb,
  builds: boot?.builds ?? null, buildMs: boot ? Math.round(boot.buildMs) : null,
  buildsBy: boot ? Object.entries(boot.buildBy).sort((a, b) => b[1][0] - a[1][0]).slice(0, 25).map(([k, v]) => [k, Math.round(v[0]), v[1]]) : [],
  drawsBy: boot ? Object.entries(boot.drawBy).sort((a, b) => b[1][0] - a[1][0]).slice(0, 25).map(([k, v]) => [k, v[0], v[1], v[2]]) : [],
  gpuSubmitMs: boot?.gpuSubmitMs ?? [],
  overTextures: boot?.overTextures ?? [], overTextureMaterials: boot?.overTextureMaterials ?? [],
  slowGpuCalls: boot?.slow ?? [], maxDispatch: boot?.maxDispatch ?? null,
  pipelines: boot?.pipelines ?? null, pipelineMs: boot ? Math.round(boot.pipelineMs) : null,
  gpuBufferMb: boot ? Math.round(boot.total / 1e6) : null,
  bufferMbBy: boot?.bufferBy ? Object.entries(boot.bufferBy).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [Math.round(v / 1e6), k]) : [], bigBuffers: boot?.big.slice(0, 10) ?? [],
  losses: boot?.losses ?? [], destroys: boot?.destroys ?? [], gpuErrors: boot?.errors ?? [],
  longTasks: [...longTasks].sort((a, b) => b[1] - a[1]).slice(0, 10), heap: heap.filter((_, i) => i % 5 === 0),
  pageErrors: pageErrors.slice(0, 10), consoleErrors: consoleErrors.slice(0, 20), notFound: [...missing].slice(0, 40), profileTop, allocMbBy: allocTop,
};
writeFileSync(out, JSON.stringify({ summary, lines }, null, 1));
console.log(JSON.stringify({ ...summary, heap: undefined, longTasks: summary.longTasks.slice(0, 5) }, null, 1));
console.log(fails.length ? `webgpu-boot-check: FAIL\n  ${fails.join("\n  ")}` : `webgpu-boot-check: OK (first frame ${summary.firstFrameMs} ms, ${summary.frames} frames, longest JS task ${maxTaskMs} ms, longest GPU stall ${maxGpuStallMs} ms)`);
process.exit(fails.length ? 1 : 0);
