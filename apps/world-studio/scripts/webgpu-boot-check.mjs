/**
 * Boot the BUILT WebGPU studio headless the way GitHub Pages serves /webgpu/, on the smallest
 * scene that exercises the failure classes (decision 0111 §4), and fail on a main-thread freeze,
 * a GPU validation error, a device loss or no complete frame. Run it before handing the owner a
 * webgpu build; NEVER in preflight or CI (planner ruling 2026-10-01).
 *
 *   node scripts/webgpu-boot-check.mjs [--force] [--place <placeId>] [--query "view=character&x=..&z=.."]
 *     [--no-build --dist <dir>] [--out <file>] [--profile <s>] [--alloc] [--gpu-timing] [--present]
 *
 * Cheap by design, not by a cut-off:
 * - It runs only when its inputs change: a SHA-256 of the renderer and shader sources (INPUTS
 *   below: the WebGPU render package, the fog, fire, water and ground shader sources, the sky,
 *   three's version) is stored with the last result in tmp/webgpu-boot/last.json; an unchanged
 *   hash with a green last result prints that result's line and exits 0 (`--force` reruns).
 *   It runs once per batch that touched those files, by the lane, before the packet, and the
 *   packet quotes its line.
 * - The scene is small: ONE place (the server lists only --place in the settlement index, default
 *   Claywater Station), a 480x270 viewport at dpr 0.5, the low quality tier (the lowest that still
 *   runs the froxel volumetrics), data from disk (public/).
 * - It stops at the FIRST COMPLETE FRAME: a frame has drawn and neither the GPU pipeline-creation
 *   counter (node builds that need a pipeline; trivial cached node builds are not waited for) nor
 *   the in-flight request count has changed for 3 s of wall time (every pipeline and
 *   asset the scene needs exists), then waits for the GPU queue and reads the uncaptured
 *   validation errors. It reports its own wall time.
 * - TARGET_S is that wall time as measured (see 0111 §4). A run over TARGET_S is a DEFECT, fixed by
 *   shrinking the scene or the method (and a lessons row), never by raising TARGET_S. A page that
 *   never completes a frame is failed as a hang at HANG_FACTOR x TARGET_S.
 *
 * Headless SwiftShader drops the GPU device the moment a page PRESENTS to a WebGPU canvas, so the
 * check replaces the canvas context's swap chain with an offscreen texture on the same device (the
 * page's code runs unchanged; only the final present is skipped). `--present` keeps the real swap
 * chain (for a remote real-GPU Chrome, CHROME_CDP=ws://... connects to it instead of launching).
 *
 * Fails (exit 1) on: no complete frame; a JS task over MAX_TASK_MS (task time minus time blocked
 * inside WebGPU calls, which is GPU back-pressure SwiftShader inflates many times over); any
 * uncaptured GPU error; a device loss; any page error; JS heap over HEAP_MB; wall time over TARGET_S.
 * SwiftShader runs GPU work on the CPU: frame rates are ratios, main-thread JS time is the device's.
 */
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);
const appDir = resolve(new URL("..", import.meta.url).pathname);
const repo = resolve(appDir, "../..");
const dist = resolve(arg("dist", "/tmp/webgpu-boot-dist"));
const out = resolve(arg("out", "/tmp/webgpu-boot.json"));
const place = arg("place", "place.imperial-fringe.claywater-station");
const query = arg("query", "view=character&x=0.331&z=3.079&t=10%3A00") + "&q=low&dpr=0.5";
/** Measured wall time of a green run on the EC2 VM (0111 §4); over it is a defect, never a reason to raise it. */
const TARGET_S = 135;
const HANG_FACTOR = 2;
const STABLE_MS = 3000;
const MAX_TASK_MS = 4000;
const HEAP_MB = 1500;
const present = flag("present");

// Inputs: a change to any of these can change a shader, a pipeline or the first frames' JS.
const INPUTS = ["packages/game-core/src/render", "packages/game-core/src/air", "packages/game-core/src/fx/fire",
  "packages/game-core/src/water/render", "packages/game-core/src/interior", "apps/world-studio/src/sky",
  "apps/world-studio/src/groundMaterial.ts", "apps/world-studio/src/studioRenderer.ts",
  "apps/world-studio/src/character/CharacterMode.tsx", "apps/world-studio/src/vegetation",
  "apps/world-studio/scripts/webgpu-boot-check.mjs", "node_modules/three/package.json"];
const files = (p) => statSync(p).isDirectory() ? readdirSync(p).sort().flatMap((f) => files(join(p, f))) : [p];
const hash = createHash("sha256");
for (const f of INPUTS.flatMap((p) => existsSync(join(repo, p)) ? files(join(repo, p)) : []).filter((f) => !/\.test\.tsx?$/.test(f))) {
  hash.update(f.slice(repo.length)); hash.update(readFileSync(f));
}
const inputHash = hash.digest("hex").slice(0, 16);
const lastDir = join(appDir, "tmp/webgpu-boot");
const lastFile = join(lastDir, "last.json");
const last = existsSync(lastFile) ? JSON.parse(readFileSync(lastFile, "utf8")) : null;
if (!flag("force") && last?.inputHash === inputHash && last.ok) {
  console.log(`webgpu-boot-check: SKIP (inputs ${inputHash} unchanged) ${last.line}`);
  process.exit(0);
}
const wall0 = Date.now();

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
  if (path.endsWith("/province/settlements/index.json")) {
    const index = JSON.parse(readFileSync(join(publicDir, "province/settlements/index.json"), "utf8"));
    index.places = index.places.filter((p) => p.id === place); index.routes = [];
    if (!index.places.length) { console.error(`webgpu-boot-check: ${place} is not in the settlement index`); process.exit(2); }
    res.writeHead(200, { "Content-Type": MIME[".json"] }); res.end(JSON.stringify(index)); return;
  }
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
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const t0 = Date.now();
const lines = [];
page.on("console", (m) => lines.push({ t: Date.now() - t0, type: m.type(), text: m.text().slice(0, 400) }));
let inflight = 0;
page.on("request", () => { inflight++; });
page.on("requestfinished", () => { inflight--; });
page.on("requestfailed", () => { inflight--; });
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
  // every other WebGPU call too: under Dawn's wire any call can block on a full
  // command buffer while the GPU process works (a 20 s stall on SwiftShader sat
  // in a call the three above did not time, and was charged to JS)
  for (const P of [GPUDevice, GPUQueue, GPUCommandEncoder, GPURenderPassEncoder, GPUComputePassEncoder, GPUBuffer, GPUCanvasContext]) {
    for (const k of Object.getOwnPropertyNames(P.prototype)) {
      const d = Object.getOwnPropertyDescriptor(P.prototype, k);
      if (k === "constructor" || typeof d.value !== "function" || (P === GPUQueue && ["writeTexture", "writeBuffer", "submit"].includes(k))) continue;
      timed(P.prototype, k, () => P.name);
    }
  }
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
      g.builds++; g.buildMs += ms; g.lastBuildFrame = g.frames;
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
let maxPingMs = 0, pending = null, lastBoot = null, lastLong = [];
const beat = setInterval(() => {
  if (pending) return;
  const s = Date.now();
  pending = cdp.send("Runtime.getHeapUsage").then((h) => { heap.push([s - t0, Math.round(h.usedSize / 1e6)]); })
    .then(() => page.evaluate(() => JSON.stringify([window.__BOOT__, window.__LONG_TASKS__])))
    .then((j) => { if (!j) return; const [bt, lt] = JSON.parse(j); if (bt) lastBoot = bt; if (lt) lastLong = lt; })
    .catch(() => {}).finally(() => { maxPingMs = Math.max(maxPingMs, Date.now() - s); pending = null; });
}, 1000);
// Wait for the first complete frame: a frame has drawn, and the node-build counter and the
// in-flight request count have been stable for STABLE_MS of wall time, read by successful pings.
let completeMs = null;
const hangAt = Date.now() + HANG_FACTOR * TARGET_S * 1000;
let stableSince = Date.now(), seenBuilds = -1, seenPing = null;
while (Date.now() < hangAt) {
  await new Promise((r) => setTimeout(r, 500));
  if (!lastBoot || lastBoot === seenPing) continue; // no fresh reading since the last look
  seenPing = lastBoot;
  if (flag("trace")) console.error(`t=${Math.round((Date.now() - t0) / 1000)}s builds=${lastBoot.builds} pipelines=${lastBoot.pipelines} frames=${lastBoot.frames} inflight=${inflight}`);
  if (lastBoot.pipelines !== seenBuilds || inflight > 0 || lastBoot.frames === 0) { seenBuilds = lastBoot.pipelines; stableSince = Date.now(); continue; }
  if (Date.now() - stableSince >= STABLE_MS) { completeMs = Date.now() - t0; break; }
}
// let the GPU finish what was submitted, so every validation error has been raised
await Promise.race([page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {}),
  new Promise((r) => setTimeout(r, 15_000))]);
clearInterval(beat);
// A ping still out at the end gets a grace period: a SwiftShader GPU stall clears in seconds, a hang does not.
const graceS = 20;
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
// the heartbeat's last copy when the page is too busy to answer at the end (an empty list read as 0 ms)
const longTasks = (await withTimeout(page.evaluate(() => window.__LONG_TASKS__), 5_000)) ?? lastLong;
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
const wallS = Math.round((Date.now() - wall0) / 100) / 10;
const fails = [];
if (hung) fails.push("page did not answer at the end (main thread hung)");
if (completeMs === null) fails.push(`no complete frame in ${HANG_FACTOR * TARGET_S} s (hang)`);
if (boot) {
  if (boot.losses.length) fails.push(`device lost ${boot.losses.length}x: ${boot.losses.map((l) => `${l.reason} ${l.message}`.slice(0, 120)).join("; ")}`);
  if (boot.errors.length) fails.push(`${boot.errors.length} uncaptured GPU errors, first: ${boot.errors[0][2].split("\n")[0]}`);
}
if (maxTaskMs > MAX_TASK_MS) fails.push(`main-thread JS task ${maxTaskMs} ms > ${MAX_TASK_MS} ms`);
if (pageErrors.length) fails.push(`${pageErrors.length} page errors, first: ${pageErrors[0].slice(0, 200)}`);
if (heapPeakMb > HEAP_MB) fails.push(`JS heap ${heapPeakMb} MB > ${HEAP_MB} MB`);
if (wallS > TARGET_S) fails.push(`wall time ${wallS} s > target ${TARGET_S} s: shrink the scene or the method (lessons row), never the target`);
const summary = {
  url, place, inputHash, wallS, targetS: TARGET_S, completeFrameMs: completeMs, ok: fails.length === 0, fails,
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
const line = fails.length ? `webgpu-boot-check: FAIL in ${wallS} s (inputs ${inputHash})\n  ${fails.join("\n  ")}`
  : `webgpu-boot-check: OK in ${wallS} s of ${TARGET_S} s (inputs ${inputHash}; first frame ${summary.firstFrameMs} ms, complete frame ${completeMs} ms, ${summary.frames} frames, longest JS task ${maxTaskMs} ms, 0 GPU errors)`;
mkdirSync(lastDir, { recursive: true });
writeFileSync(lastFile, JSON.stringify({ inputHash, ok: fails.length === 0, line, at: new Date().toISOString() }, null, 1));
console.log(line);
process.exit(fails.length ? 1 : 0);
