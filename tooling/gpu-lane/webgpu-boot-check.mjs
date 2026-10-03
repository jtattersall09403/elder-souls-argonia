/**
 * Boot the BUILT WebGPU studio headless the way GitHub Pages serves /webgpu/, on the smallest
 * scene that exercises the failure classes (decision 0111 §4), and fail on a main-thread freeze,
 * a GPU validation error, a device loss or no complete frame. Run it before handing the owner a
 * webgpu build; NEVER in preflight or CI (planner ruling 2026-10-01).
 *
 *   node tooling/gpu-lane/webgpu-boot-check.mjs [--force] [--place <placeId>|all] [--query "view=character&x=..&z=.."]
 *     [--hold <s>] [--no-build --dist <dir>] [--out <file>] [--profile <s>] [--alloc] [--gpu-timing] [--present]
 *
 * `--place all` builds once and checks every built place in the settlement index (fixtures
 * excluded), two at a time, each at its own centre with `--hold 60`; each place keeps its own
 * cached result, keyed on the renderer sources AND that place's bundle and kit GLB bytes, so a
 * kit republish re-runs exactly the places that load it. `--hold <s>` keeps the scene running after
 * the first complete frame, turning the view two full circles, and fails if any GPU error appears or the page stalls (walk 8: one
 * stride-3 vertex buffer invalidates the whole render pass, so every building vanishes while a
 * far-tier merge is in the frame); it records the draws per frame once a second.
 *
 * Cheap by design, not by a cut-off:
 * - It runs only when its inputs change: a SHA-256 of the renderer and shader sources (INPUTS
 *   below: the WebGPU render package, the settlement layer, the fog, fire, water and ground
 *   shader sources, the sky, three's version) plus the place's bundle and kit GLBs is stored
 *   with the last result in tmp/webgpu-boot/<place>.json; an unchanged
 *   hash with a green last result prints that result's line and exits 0 (`--force` reruns).
 *   It runs once per batch that touched those files, by the lane, before the packet, and the
 *   packet quotes its line.
 * - The scene: the whole published settlement index (every place, as the owner loads it; `--only`
 *   lists just --place) seen from --place's centre (default Claywater Station), a 480x270 viewport at dpr 0.5, the low quality tier (the lowest that still
 *   runs the froxel volumetrics), data from disk (public/).
 * - It stops at the FIRST COMPLETE FRAME: a frame has drawn, no node build is queued or running,
 *   no pipeline is compiling, and neither the pipeline and node-build counters nor the in-flight
 *   request count has changed for 3 s of wall time (every pipeline and asset the scene needs exists), then waits for the GPU queue and reads the uncaptured
 *   validation errors. It reports its own wall time.
 * - TARGET_S is that wall time as measured (see 0111 §4). A run over TARGET_S is a DEFECT, fixed by
 *   shrinking the scene or the method (and a lessons row), never by raising TARGET_S. A page that
 *   never completes a frame is failed as a hang at HANG_FACTOR x TARGET_S.
 *
 * The churn record (walk 9): `series` holds cumulative counters once a second (frames, pipelines,
 * shader modules, node builds, buffers, textures, bind groups, MB written, draws, skipped draws (cumulative; read buildsWaiting for a backlog)
 * for an unbuilt material, builds waiting) and `steady` their rates over the hold; during the hold it
 * also records which objects waited for a build and which uploaded new geometry, the node-build ms
 * per material (`nodeBuild`), and a JS stack when the page stops answering (`hangStacks`).
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
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { dataPublicDir, pagesRoots, staticHandler } from "../../apps/world-studio/scripts/lib/webgpu-static.mjs";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);
const repo = resolve(new URL("../..", import.meta.url).pathname);
const appDir = join(repo, "apps/world-studio");
const dist = resolve(arg("dist", "/tmp/webgpu-boot-dist"));
const out = resolve(arg("out", "/tmp/webgpu-boot.json"));
const place = arg("place", "place.imperial-fringe.claywater-station");
const holdS = Number(arg("hold", "0"));
/** Measured wall time of a green run on the EC2 VM (0111 §4); over it is a defect, never a reason to raise it. */
const TARGET_S = 135;
const HANG_FACTOR = 2;
const STABLE_MS = 3000;
const MAX_TASK_MS = 4000;
const HEAP_MB = 1500;
const present = flag("present");

// Inputs: a change to any of these can change a shader, a pipeline or the first frames' JS.
const INPUTS = ["packages/game-core/src/render", "packages/game-core/src/settlement", "packages/game-core/src/air", "packages/game-core/src/fx/fire",
  "packages/game-core/src/water/render", "packages/game-core/src/interior", "apps/world-studio/src/sky",
  "apps/world-studio/src/groundMaterial.ts", "apps/world-studio/src/studioRenderer.ts",
  "apps/world-studio/src/character/CharacterMode.tsx", "apps/world-studio/src/vegetation",
  "tooling/gpu-lane/webgpu-boot-check.mjs", "apps/world-studio/scripts/lib/webgpu-static.mjs", "node_modules/three/package.json"];
const files = (p) => statSync(p).isDirectory() ? readdirSync(p).sort().flatMap((f) => files(join(p, f))) : [p];
const hash = createHash("sha256");
for (const f of INPUTS.flatMap((p) => existsSync(join(repo, p)) ? files(join(repo, p)) : []).filter((f) => !/\.test\.tsx?$/.test(f))) {
  hash.update(f.slice(repo.length)); hash.update(readFileSync(f));
}
const publicDir = dataPublicDir();
const settlementIndex = JSON.parse(readFileSync(join(publicDir, "province/settlements/index.json"), "utf8"));
const lastDir = join(appDir, "tmp/webgpu-boot");

if (place === "all") {
  // one build, then every built place as its own run (its own cache entry), two at a time
  if (!flag("no-build")) build();
  const ids = settlementIndex.places.map((p) => p.id).filter((id) => !id.startsWith("place.fixture."));
  const pass = argv.filter((a, i) => !["--place", "--dist", "--out", "--query"].includes(argv[i - 1] ?? "")
    && !["--place", "--dist", "--out", "--query", "--no-build"].includes(a));
  const run = (id) => new Promise((done) => {
    const child = spawn(process.execPath, [new URL(import.meta.url).pathname, ...pass, "--place", id, "--no-build", "--dist", dist,
      "--out", out.replace(/\.json$/, `.${id}.json`), ...(argv.includes("--hold") ? [] : ["--hold", "60"])], { stdio: ["ignore", "pipe", "inherit"] });
    let text = ""; child.stdout.on("data", (d) => { text += d; });
    child.on("close", (code) => done({ id, code, line: text.trim().split("\n").filter((l) => l.startsWith("webgpu-boot-check")).at(-1) ?? "" }));
  });
  const results = [];
  for (let i = 0; i < ids.length; i += 2) results.push(...await Promise.all(ids.slice(i, i + 2).map(run)));
  for (const r of results) console.log(`${r.id}: ${r.line}`);
  process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
}

const entry = settlementIndex.places.find((p) => p.id === place);
if (!entry) { console.error(`webgpu-boot-check: ${place} is not in the settlement index`); process.exit(2); }
const query = arg("query", `view=character&x=${(entry.positionM[0] / 1000).toFixed(3)}&z=${(entry.positionM[1] / 1000).toFixed(3)}&t=10%3A00`)
  + "&q=low&dpr=0.5";
// the place's own data: its bundle and every kit's parts index (it names each
// part's bytes and the packed GLB's sha256, so a kit republish re-runs it)
const kitParts = new Map();
for (const p of flag("only") ? [entry] : settlementIndex.places) {
  for (const kit of Object.values(JSON.parse(readFileSync(join(publicDir, "province", p.bundle), "utf8")).kits ?? {})) kitParts.set(kit.parts, kit);
}
for (const kit of [...kitParts.values()].sort((a, b) => a.parts.localeCompare(b.parts))) {
  const f = join(publicDir, kit.parts);
  hash.update(kit.parts); if (existsSync(f)) hash.update(readFileSync(f));
}
for (const p of flag("only") ? [entry] : settlementIndex.places) hash.update(p.sha256 ?? p.id);
hash.update(query); hash.update(String(holdS)); hash.update(String(flag("only")));
const inputHash = hash.digest("hex").slice(0, 16);
const lastFile = join(lastDir, `${place}.json`);
const last = existsSync(lastFile) ? JSON.parse(readFileSync(lastFile, "utf8")) : null;
if (!flag("force") && last?.inputHash === inputHash && last.ok) {
  console.log(`webgpu-boot-check: SKIP (inputs ${inputHash} unchanged) ${last.line}`);
  process.exit(0);
}
const wall0 = Date.now();

function build() {
  const t = Date.now();
  const r = spawnSync("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir"], { cwd: appDir, stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, ES_STUDIO_BASE: "/elder-souls-argonia/webgpu/", VITE_ES_DATA_BASE: "/elder-souls-argonia/studio/" } });
  if (r.status !== 0) { console.error("webgpu-boot-check: build failed"); process.exit(2); }
  console.log(`built ${dist} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
}
if (!flag("no-build")) build();

const missing = new Set();
const server = createServer(staticHandler(pagesRoots(dist, publicDir), {
  onMissing: (path) => missing.add(path),
  // the whole published world by default, as the owner loads it: the other places stand at
  // far-merge distance from this one (walk 8's stride-3 buffers were far merges of Greenspring
  // and Claywater seen from Riverwalk; a one-place index never built one). --only: just --place.
  intercept: (path, res) => {
    if (!flag("only") || !path.endsWith("/province/settlements/index.json")) return false;
    const index = { ...settlementIndex, places: [entry], routes: [] };
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(index)); return true;
  },
}));
// WEBGPU_BOOT_PORT: a fixed port, for a remote Chrome reaching this server through `ssh -R <port>:127.0.0.1:<port>`
await new Promise((r) => server.listen(Number(process.env.WEBGPU_BOOT_PORT ?? 0), "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/elder-souls-argonia/webgpu/?${query}`;

const browser = process.env.CHROME_CDP ? await chromium.connectOverCDP(process.env.CHROME_CDP)
  : await chromium.launch({ headless: true, args: ["--enable-unsafe-webgpu", "--enable-features=UnsafeWebGPU",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const [vw, vh] = arg("size", "480x270").split("x").map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const t0 = Date.now();
const lines = [];
page.on("console", (m) => lines.push({ t: Date.now() - t0, type: m.type(), text: m.text().slice(0, 400) }));
let inflight = 0;
page.on("request", () => { inflight++; });
page.on("requestfinished", () => { inflight--; });
page.on("requestfailed", () => { inflight--; });
page.on("pageerror", (e) => lines.push({ t: Date.now() - t0, type: "pageerror", text: String(e.stack || e).slice(0, 600) }));
await page.addInitScript(([present, gpuTiming, light]) => {
  try { localStorage.setItem("es.hud.perfOpen", "1"); } catch { /* the HUD's perf block open, read into `hud` */ }
  const g = { frames: 0, firstFrameMs: null, total: 0, count: 0, big: [], losses: [], destroys: [], devices: 0, errors: [], pipelines: 0, pipelineMs: 0,
    asyncPipelines: 0, computePipelines: 0, shaderModules: 0, textures: 0, bindGroups: 0, writeBytes: 0, bufferDestroys: 0 };
  window.__BOOT__ = g;
  // documents without WebGPU (about:blank, a non-secure frame, a remote Chrome's first tab) have no GPU globals
  if (typeof GPUAdapter === "undefined") return;
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
  // churn counters, read once a second into the steady-state series (a settled scene creates none)
  for (const [name, key] of [["createRenderPipelineAsync", "asyncPipelines"], ["createComputePipeline", "computePipelines"],
    ["createComputePipelineAsync", "computePipelines"], ["createBindGroup", "bindGroups"]]) {
    const f = D[name]; D[name] = function (...a) { g[key]++; return f.apply(this, a); };
  }
  const bufDestroy = GPUBuffer.prototype.destroy;
  GPUBuffer.prototype.destroy = function () { g.bufferDestroys++; return bufDestroy.call(this); };
  const wb = GPUQueue.prototype.writeBuffer;
  // bytes actually written (a typed array's size and offset are in elements) and, during the hold, by call site
  const site = () => new Error().stack.split("\n").slice(3, 11).map((l) => l.trim().replace(/^at /, "").replace(/\(?https?:\/\/[^/]+\/[^)]*\/([^/)]+)\)?/, "$1")).join(" < ");
  g.site = site;
  GPUQueue.prototype.writeBuffer = function (b, o, data, dataOffset = 0, size, ...r) {
    const el = data?.BYTES_PER_ELEMENT ?? 1;
    const n = (size ?? ((data?.byteLength ?? 0) / el - dataOffset)) * el;
    g.writeBytes += n;
    // one call in 64 is traced (a stack per call slowed the page to a crawl on a real GPU); counts are scaled back
    if (!light && g.hold && (g.wbN = (g.wbN ?? 0) + 1) % 64 === 0) { const k = site(); const e = ((g.writeByHold ??= {})[k] ??= [0, 0]); e[0] += n * 64; e[1] += 64; }
    return wb.call(this, b, o, data, dataOffset, size, ...r);
  };
  const createBuffer = D.createBuffer;
  D.createBuffer = function (d) {
    g.total += d.size; g.count += 1;
    // bytes created per call site (the first two frames outside the hook): buffer churn
    const site = new Error().stack.split("\n").slice(2, 4).map((l) => l.trim().replace(/^at /, "").replace(/\(?https?:\/\/[^/]+\/[^)]*\/([^/)]+)\)?/, "$1")).join(" < ");
    (g.bufferBy ??= {})[site] = (g.bufferBy[site] ?? 0) + d.size;
    if (!light && g.hold) { const k = g.site(); const e = ((g.bufferByHold ??= {})[k] ??= [0, 0]); e[0] += d.size; e[1]++; }
    if (d.size >= 16 * 1024 * 1024) g.big.push([Math.round(performance.now()), d.size, d.label ?? "", stack().slice(0, 300)]);
    return createBuffer.call(this, d);
  };
  // Texture bytes resident, by format (mips counted): what the tab's GPU memory holds beside buffers.
  g.texBytes = {};
  const BPP = (f) => /^(bc1|bc4|etc2-rgb8|eac-r11)/.test(f) ? 0.5 : /^(bc|astc-4x4|etc2|eac)/.test(f) ? 1
    : /^(r8|stencil8)/.test(f) ? 1 : /^(rg8|r16|depth16)/.test(f) ? 2 : /^(rgba16|rg32|depth32float-stencil8)/.test(f) ? 8
    : /^rgba32/.test(f) ? 16 : 4;
  const live = new WeakMap();
  const createTexture = D.createTexture;
  D.createTexture = function (d) {
    g.textures++;
    const t = createTexture.call(this, d);
    const [w, h = 1, l = 1] = Array.isArray(d.size) ? d.size : [d.size.width, d.size.height ?? 1, d.size.depthOrArrayLayers ?? 1];
    const mips = d.mipLevelCount ?? 1;
    let bytes = 0; for (let m = 0; m < mips; m++) bytes += Math.max(1, w >> m) * Math.max(1, h >> m) * (d.dimension === "3d" ? Math.max(1, l >> m) : l);
    bytes *= BPP(d.format) * (d.sampleCount ?? 1);
    const key = `${d.format} ${w}x${h}${l > 1 ? "x" + l : ""}${mips > 1 ? " mips" : ""} ${d.label ?? ""}`.trim();
    g.texBytes[d.format] = (g.texBytes[d.format] ?? 0) + bytes; (g.texBy ??= {})[key] = (g.texBy[key] ?? 0) + bytes;
    live.set(t, [d.format, bytes, key]);
    const destroy = t.destroy; t.destroy = function () {
      const e = live.get(this); if (e) { g.texBytes[e[0]] -= e[1]; g.texBy[e[2]] -= e[1]; live.delete(this); } return destroy.call(this); };
    return t;
  };
  // Every GPU call that holds the main thread over 100 ms: the call, its size, its label and who made it.
  g.slow = []; g.maxDispatch = null;
  const timed = (proto, name, what) => { const f = proto[name]; proto[name] = function (...a) {
    const t = performance.now(); const r = f.apply(this, a); const ms = performance.now() - t;
    if (ms > 100 && g.slow.length < 40) g.slow.push([Math.round(t), Math.round(ms), name, what(a, this), stack().slice(0, 400)]);
    return r; }; };
  // --light: none of the per-call timing and stack wrappers (they cost a real GPU most of its frame
  // rate: pod run 5, performance.now 25 % of the main thread); counters and the series stay
  if (!light) {
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
      g.curDraws = (g.curDraws ?? 0) + 1;
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
    g.shaderModules++;
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
  const frame = () => {
    g.frames++; if (g.firstFrameMs === null) g.firstFrameMs = Math.round(performance.now());
  };
  // draws in the last whole animation frame (read by --hold): every pass, not just the canvas pass
  // Draws per frame by layer and pass (three's renderObject, one call per object per pass): the
  // settlement layer's own draws apart from the rest, so a batching change is measured on its layer.
  g.layerDraws = {}; g.curLayerDraws = {};
  const layerOf = (o) => {
    for (let p = o; p; p = p.parent) {
      if (p.userData?.esSettlementBatch || p.userData?.esSettlementLodAuthority || p.userData?.esSettlementFarMerge) return "settlement";
      if (p.parent && p.parent.isScene) return p.name || p.type;
    }
    return o.name || o.type;
  };
  const hookRenderObject = () => {
    const r = window.__RENDERER__;
    if (!r || r.__layerHooked || typeof r.renderObject !== "function") return;
    r.__layerHooked = true;
    const ro = r.renderObject;
    r.renderObject = function (object, scene, camera, ...rest) {
      const rt = this.getRenderTarget?.();
      const pass = camera?.isOrthographicCamera ? "shadow" : rt ? "target" : "canvas";
      const k = `${pass}:${layerOf(object)}`;
      g.curLayerDraws[k] = (g.curLayerDraws[k] ?? 0) + 1;
      return ro.call(this, object, scene, camera, ...rest);
    };
  };
  const tick = () => { hookRenderObject(); g.layerDraws = g.curLayerDraws; g.curLayerDraws = {}; g.lastFrameDraws = g.curDraws ?? 0; g.curDraws = 0; g.skippedDraws = window.__RENDERER__?.esBuildQueue?.skippedDraws ?? 0; g.buildsWaiting = window.__RENDERER__?.esBuildQueue?.pending ?? 0; g.pipelinesCompiling = window.__RENDERER__?.esPipelineCompiles?.pending ?? 0; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
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
    // --hold turns the view a full circle (window.__SPIN__): a pipeline is only built for what is
    // in the frustum, so a fixed camera never meets the far-tier merges behind it (walk 8).
    if (r && !r.__spinHooked) {
      r.__spinHooked = true;
      const render = r.render.bind(r);
      r.render = (scene, camera, ...rest) => {
        const spin = window.__SPIN__;
        if (!spin || !camera?.isCamera) return render(scene, camera, ...rest);
        const q = camera.quaternion.clone();
        camera.rotateOnWorldAxis(camera.up.clone().set(0, 1, 0), 2 * Math.PI * ((performance.now() - spin.t0) / spin.periodMs % 1));
        camera.updateMatrixWorld();
        try { return render(scene, camera, ...rest); } finally { camera.quaternion.copy(q); camera.updateMatrixWorld(); }
      };
    }
    // During the hold: which objects get NEW vertex buffers (first upload or a rebuilt geometry),
    // keyed by the object's name path; `geoms` counts distinct geometries, so a rebuild shows as
    // geoms > the object count it should have.
    if (r && r.backend && !r.backend.__churnHooked) {
      r.backend.__churnHooked = true;
      let curObj = null;
      const rod = r._renderObjectDirect.bind(r);
      // unbuilt objects during the hold: calls, distinct objects, how many got their state, by name
      const seenUnbuilt = new WeakSet();
      r._renderObjectDirect = (object, ...rest) => {
        curObj = object;
        let ro = null;
        if (g.hold && !light) {
          const [material, scene, camera, lightsNode, , clippingContext, passId] = rest;
          ro = r._objects.get(object, material, scene, camera, lightsNode, r._currentRenderContext, clippingContext, passId);
          if (r._nodes.get(ro).nodeBuilderState !== undefined || r._nodes.nodeBuilderCache.has(r._nodes.getForRenderCacheKey(ro))) ro = null;
        }
        try { return rod(object, ...rest); } finally {
          curObj = null;
          if (ro) {
            const u = (g.unbuilt ??= { calls: 0, distinct: 0, built: 0, by: {} });
            u.calls++;
            if (!seenUnbuilt.has(object)) {
              seenUnbuilt.add(object); u.distinct++; const k = path(object) + " | " + (rest[0]?.name || rest[0]?.type); u.by[k] = (u.by[k] ?? 0) + 1;
              // why it missed the cache: how many distinct keys, materials, passes and lights behind one name
              const w = ((u.why ??= {})[k] ??= { keys: [], mats: [], passes: [], lights: [], inst: object.isInstancedMesh ? 1 : 0, count: object.count });
              for (const [list, v] of [[w.keys, String(ro.initialCacheKey).slice(-24)], [w.mats, rest[0]?.id], [w.passes, String(rest[6])], [w.lights, rest[3]?.id]])
                if (!list.includes(v) && list.length < 12) list.push(v);
            }
            if (r._nodes.get(ro).nodeBuilderState !== undefined) u.built++;
          }
        }
      };
      // node-graph build time per material (NodeBuilder.build: the JS cost of a first draw)
      const cnb = r._nodes._createNodeBuilder?.bind(r._nodes);
      if (cnb) r._nodes._createNodeBuilder = (ro, material, ...more) => {
        const nb = cnb(ro, material, ...more);
        const k = (material?.name || material?.type || "?").replace(/\d{3,}/g, "#");
        // what multiplies builds: per material object, how many render contexts and how many builds
        const mk = material?.uuid ?? "?";
        const ctx = String(ro?.context?.id ?? "?"), cam = ro?.camera?.type ?? "?";
        const pm = ((g.buildPerMaterial ??= {})[mk] ??= { n: 0, ctx: [], cams: [], name: k, where: (() => {
          // the layer that drew it: the outermost named group under the scene
          let o = ro?.object, at = "?"; while (o?.parent) { if (o.name) at = o.name; o = o.parent; } return at.replace(/\d{3,}/g, "#");
        })() });
        pm.n++; if (!pm.ctx.includes(ctx)) pm.ctx.push(ctx); if (!pm.cams.includes(cam)) pm.cams.push(cam);
        const note = (ms) => { const e = ((g.nodeBuild ??= {})[k] ??= [0, 0]); e[0] += ms; e[1]++; g.nodeBuildMs = (g.nodeBuildMs ?? 0) + ms; g.nodeBuildN = (g.nodeBuildN ?? 0) + 1; };
        const build = nb.build.bind(nb);
        nb.build = (...x) => { const t = performance.now(); try { return build(...x); } finally { note(performance.now() - t); } };
        // buildAsync: wall ms from start to end (it yields between stages), counted the same way
        const buildAsync = nb.buildAsync.bind(nb);
        nb.buildAsync = async (...x) => { const t = performance.now(); try { return await buildAsync(...x); } finally { note(performance.now() - t); } };
        return nb;
      };
      const path = (o) => { const n = []; for (let x = o; x && n.length < 4; x = x.parent) n.push(x.name || x.type); return n.join(" < "); };
      const ca = r.backend.createAttribute.bind(r.backend);
      r.backend.createAttribute = (attr, ...rest) => {
        if (g.hold && curObj && !light) {
          const k = path(curObj); const e = ((g.newGeomByHold ??= {})[k] ??= [0, 0, 0, []]);
          e[0] += attr.array?.byteLength ?? 0; e[1]++;
          const uuid = curObj.geometry?.uuid;
          if (uuid && !e[3].includes(uuid) && e[3].length < 400) { e[3].push(uuid); e[2]++; }
        }
        return ca(attr, ...rest);
      };
    }
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
      if (g.hold) { const h = ((g.buildByHold ??= {})[k] ??= [0, 0]); h[0] += ms; h[1] += 1; }
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
}, [present, flag("gpu-timing"), flag("light")]);

const cdp = await page.context().newCDPSession(page);
// --profile <s> [--profile-from <s>]: a CPU profile of <s> seconds starting <from> s after navigation
const profileS = Number(arg("profile", "0"));
const profileFrom = Number(arg("profile-from", "0"));
const startProfile = async () => { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start"); };
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
let profileDone = Promise.resolve();
if (profileS > 0) {
  profileDone = new Promise((done) => setTimeout(() => {
    startProfile().then(() => new Promise((r) => setTimeout(r, profileS * 1000))).then(stopProfile)
      .catch((e) => { profileTop = [[0, `profile failed: ${String(e).slice(0, 200)}`]]; }).finally(done);
  }, profileFrom * 1000));
}

if (flag("alloc")) { await cdp.send("HeapProfiler.enable"); await cdp.send("HeapProfiler.startSampling", { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
// --shots <dir>: a screenshot every 500 ms for the first 60 s, then every 2 s (a real-GPU timeline:
// what appears, vanishes, reappears); each file is named by its ms since navigation.
const shotsDir = arg("shots", null);
let shooting = !!shotsDir;
if (shotsDir) {
  mkdirSync(shotsDir, { recursive: true });
  (async () => {
    while (shooting) {
      const t = Date.now() - t0;
      await page.screenshot({ path: join(shotsDir, `${String(t).padStart(6, "0")}.jpg`), type: "jpeg", quality: 70, timeout: 10_000 }).catch(() => {});
      const next = (t < 60_000 ? 500 : 2000) - (Date.now() - t0 - t);
      if (next > 0) await new Promise((r) => setTimeout(r, next));
    }
  })();
}
page.goto(url, { waitUntil: "load", timeout: 120_000 }).catch((e) => lines.push({ t: Date.now() - t0, type: "goto", text: String(e) }));
// Heartbeat: a CDP ping every second; its latency is how long the page's main
// thread was busy. A ping still unanswered at the end is a hang in progress.
const heap = [];
// Per-second churn series (cumulative counters): frames, render pipelines (sync+async), shader
// modules, node builds, buffers created and destroyed, MB created, textures, bind groups, MB written,
// draws in the last frame. After the first complete frame every column but frames, bind groups and
// MB written must stay flat: a rising one is per-frame material, geometry or target churn.
const series = [];
const SERIES_COLS = ["t", "frames", "pipelines", "shaders", "builds", "buffers", "bufDestroys", "bufMb", "textures", "bindGroups", "writeMb", "draws", "skippedDrawsTotal", "buildsWaiting", "pipelinesCompiling"];
const seriesRow = (t, b) => [Math.round(t / 100) / 10, b.frames, b.pipelines + b.asyncPipelines, b.shaderModules, b.builds, b.count, b.bufferDestroys,
  Math.round(b.total / 1e5) / 10, b.textures, b.bindGroups, Math.round(b.writeBytes / 1e5) / 10, b.lastFrameDraws ?? 0, b.skippedDraws ?? 0, b.buildsWaiting ?? 0, b.pipelinesCompiling ?? 0];
let pendingSince = 0, maxPingMs = 0, pending = null, lastBoot = null, lastLong = [];
// A ping out over 10 s: pause the page once and keep the JS stack it was stuck in (what hung).
const hangStacks = [];
let pausing = false;
cdp.on("Debugger.paused", (e) => {
  hangStacks.push(e.callFrames.slice(0, 25).map((f) => `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.location.lineNumber + 1}`));
  cdp.send("Debugger.resume").catch(() => {});
});
const beat = setInterval(() => {
  if (pending && !pausing && hangStacks.length < 3 && Date.now() - pendingSince > 10_000) {
    pausing = true;
    cdp.send("Debugger.enable").then(() => cdp.send("Debugger.pause")).catch(() => {}).finally(() => { setTimeout(() => { pausing = false; }, 5000); });
  }
  if (pending) return;
  pendingSince = Date.now();
  const s = Date.now();
  pending = cdp.send("Runtime.getHeapUsage").then((h) => { heap.push([s - t0, Math.round(h.usedSize / 1e6)]); })
    // the counters only, never the hold's per-object tables (stringifying those every second
    // starved the ping while builds ran: "only 9 readings in 60 s"); the whole record is read at the end
    .then(() => page.evaluate(() => { const b = window.__BOOT__; return b && JSON.stringify([{
      frames: b.frames, firstFrameMs: b.firstFrameMs, total: b.total, count: b.count, bufferDestroys: b.bufferDestroys,
      pipelines: b.pipelines, asyncPipelines: b.asyncPipelines, shaderModules: b.shaderModules, builds: b.builds,
      textures: b.textures, bindGroups: b.bindGroups, writeBytes: b.writeBytes, lastFrameDraws: b.lastFrameDraws, layerDraws: b.layerDraws,
      skippedDraws: b.skippedDraws, buildsWaiting: b.buildsWaiting, pipelinesCompiling: b.pipelinesCompiling,
      errors: b.errors, losses: b.losses, slow: b.slow, big: b.big, destroys: b.destroys, buildBy: {}, drawBy: {},
    }, window.__LONG_TASKS__]); }))
    .then((j) => { if (!j) return; const [bt, lt] = JSON.parse(j); if (bt) { lastBoot = bt; series.push(seriesRow(s - t0, bt)); } if (lt) lastLong = lt; })
    .catch(() => {}).finally(() => { maxPingMs = Math.max(maxPingMs, Date.now() - s); pending = null; });
}, 1000);
// Wait for the first complete frame: a frame has drawn, and the node-build counter and the
// in-flight request count have been stable for STABLE_MS of wall time, read by successful pings.
let completeMs = null;
const measureAtS = Number(arg("measure-at", "0"));
let measuredEarlyMs = null;
const hangAt = Date.now() + HANG_FACTOR * TARGET_S * 1000;
let stableSince = Date.now(), seenBuilds = -1, seenPing = null;
while (Date.now() < hangAt) {
  await new Promise((r) => setTimeout(r, 500));
  // --measure-at <s>: a structural measurement (draws by layer, --eval) need not wait for every
  // build; the run still fails on no complete frame, the hold and eval run from here
  if (measureAtS > 0 && Date.now() - t0 >= measureAtS * 1000) { measuredEarlyMs = Date.now() - t0; break; }
  if (!lastBoot || lastBoot === seenPing) continue; // no fresh reading since the last look
  seenPing = lastBoot;
  if (flag("trace")) console.error(`t=${Math.round((Date.now() - t0) / 1000)}s builds=${lastBoot.builds} pipelines=${lastBoot.pipelines} frames=${lastBoot.frames} inflight=${inflight}`);
  // stable = no new pipeline (sync or async), no node build waiting or compiling, nothing in flight
  const made = lastBoot.pipelines + (lastBoot.asyncPipelines ?? 0) + lastBoot.builds;
  if (made !== seenBuilds || inflight > 0 || lastBoot.frames === 0 || lastBoot.buildsWaiting > 0 || lastBoot.pipelinesCompiling > 0) {
    seenBuilds = made; stableSince = Date.now(); continue;
  }
  if (Date.now() - stableSince >= STABLE_MS) { completeMs = Date.now() - t0; break; }
}
if (measuredEarlyMs !== null) completeMs = measuredEarlyMs;
// --eval <file>: run the file's body as an async function in the page after the first complete frame
// (a probe or an experiment on the live renderer); its return value lands in the summary as `evalResult`
let evalResult = null;
if (arg("eval", null) && completeMs !== null) {
  const body = readFileSync(resolve(arg("eval")), "utf8");
  evalResult = await page.evaluate(`(async () => { ${body} })()`).catch((e) => `eval failed: ${String(e).slice(0, 300)}`);
}
// the studio's own HUD perf lines (fps, GPU per pass, CPU per stage), read at the named moments
const hud = [];
const readHud = async (when) => {
  const text = await withTimeout(page.evaluate(() => document.body.innerText).catch(() => ""), 10_000) ?? "";
  hud.push([when, Math.round((Date.now() - t0) / 1000), ...text.split("\n").filter((l) => /^(perf|veg:|gpu by pass|cpu by stage|tris|settlement)/.test(l))]);
};
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
if (completeMs !== null) await readHud("complete");
// --walk <s>: walk the character forward (W, sprinting) for half of it and back (S) for the rest, before
// the hold: new ground, tiles and materials stream in as on the owner's walk
const walkS = Number(arg("walk", "0"));
if (walkS > 0 && completeMs !== null) {
  await page.evaluate(() => { window.__BOOT__.hold = true; }).catch(() => {});
  for (const key of ["KeyW", "KeyS"]) {
    await page.keyboard.down(key); await page.keyboard.down("Space");
    await new Promise((r) => setTimeout(r, walkS * 500));
    await page.keyboard.up("Space"); await page.keyboard.up(key);
    await readHud(key === "KeyW" ? "walked out" : "walked back");
  }
}
// --hold: keep the scene running and sample the draws per frame once a second
const holdDraws = [];
if (holdS > 0 && completeMs !== null) {
  // two full turns over the hold
  await page.evaluate((ms) => { window.__SPIN__ = { t0: performance.now(), periodMs: ms }; window.__BOOT__.hold = true; }, holdS * 500).catch(() => {});
  const until = Date.now() + holdS * 1000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1000));
    if (lastBoot && lastBoot !== seenPing) { seenPing = lastBoot; holdDraws.push([Math.round((Date.now() - t0) / 1000), lastBoot.lastFrameDraws ?? 0, lastBoot.errors?.length ?? 0, lastBoot.layerDraws ?? {}]); }
  }
}
if (holdS > 0 && completeMs !== null) await readHud("hold end");
// let the GPU finish what was submitted, so every validation error has been raised
await Promise.race([page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {}),
  new Promise((r) => setTimeout(r, 15_000))]);
clearInterval(beat);
shooting = false;
if (profileS > 0) await Promise.race([profileDone, new Promise((r) => setTimeout(r, 30_000))]);
// A ping still out at the end gets a grace period: a SwiftShader GPU stall clears in seconds, a hang does not.
const graceS = 20;
if (pending) await Promise.race([pending, new Promise((r) => setTimeout(r, graceS * 1000))]);
const hung = !!pending;
const hungMs = pending ? Date.now() - t0 - (heap.at(-1)?.[0] ?? 0) : 0;
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
// Black view (walk 10: a 4-sample bloom composite resolved a stale MSAA buffer over the frame, 0 GPU
// errors): the share of near-black pixels (luma <= 3) in the screen's middle (x 30-70 %, y 40-90 %,
// clear of the HUD). Measured on the pod: black frames 0.97-1.0, a rainy night 0.84, noon 0.0.
const BLACK_SHARE_MAX = 0.95;
const blackShare = completeMs === null ? null : await withTimeout((async () => {
  const jpg = (await page.screenshot({ type: "jpeg", quality: 80, timeout: 10_000 })).toString("base64");
  return page.evaluate(async (d) => {
    const bm = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${d}`)).blob());
    const oc = new OffscreenCanvas(bm.width, bm.height); const x = oc.getContext("2d"); x.drawImage(bm, 0, 0);
    const x0 = Math.floor(bm.width * 0.3), y0 = Math.floor(bm.height * 0.4);
    const a = x.getImageData(x0, y0, Math.floor(bm.width * 0.7) - x0, Math.floor(bm.height * 0.9) - y0).data;
    let dark = 0; for (let i = 0; i < a.length; i += 4) if (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2] <= 3) dark++;
    return Math.round((dark / (a.length / 4)) * 1000) / 1000;
  }, jpg);
})().catch(() => null), 20_000); // a screenshot timeout on a loaded box leaves blackShare unmeasured, never kills the report
await withTimeout(browser.close(), 10_000);
server.close();

// churn per second over the hold (after the first complete frame): the steady state's verdict
function steadyChurn() {
  const from = series.find((r) => completeMs !== null && r[0] * 1000 >= completeMs), to = series.at(-1);
  if (!from || !to || to[0] - from[0] < 5) return null;
  const s = to[0] - from[0], d = (i) => Math.round(((to[i] - from[i]) / s) * 10) / 10;
  return { seconds: Math.round(s), fps: d(1), pipelinesPerS: d(2), shadersPerS: d(3), buildsPerS: d(4), buffersPerS: d(5),
    bufferMbPerS: d(7), texturesPerS: d(8), bindGroupsPerS: d(9), writeMbPerS: d(10), heldBackPerS: d(12) };
}
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
if (completeMs === null || measuredEarlyMs !== null) fails.push(`no complete frame in ${measuredEarlyMs !== null ? `${measureAtS} s (--measure-at)` : `${HANG_FACTOR * TARGET_S} s (hang)`}`);
if (boot) {
  if (boot.losses.length) fails.push(`device lost ${boot.losses.length}x: ${boot.losses.map((l) => `${l.reason} ${l.message}`.slice(0, 120)).join("; ")}`);
  if (boot.errors.length) fails.push(`${boot.errors.length} uncaptured GPU errors, first: ${boot.errors[0][2].split("\n")[0]}`);
}
if (holdS > 0) {
  // A vanish is an invalid pass: any GPU error during the hold (already a fail below) is it. The
  // draws per frame are reported, not judged: they legitimately swing with shadow-cascade
  // updates and async pipeline compiles (124..229 on a healthy run, 2026-10-01).
  if (holdDraws.length < holdS / 4) fails.push(`hold: only ${holdDraws.length} readings in ${holdS} s (page stalled)`);
}
if (blackShare !== null && blackShare > BLACK_SHARE_MAX) fails.push(`black view: ${Math.round(blackShare * 100)} % of the screen middle is near-black (> ${BLACK_SHARE_MAX * 100} %)`);
if (maxTaskMs > MAX_TASK_MS) fails.push(`main-thread JS task ${maxTaskMs} ms > ${MAX_TASK_MS} ms`);
if (pageErrors.length) fails.push(`${pageErrors.length} page errors, first: ${pageErrors[0].slice(0, 200)}`);
if (heapPeakMb > HEAP_MB) fails.push(`JS heap ${heapPeakMb} MB > ${HEAP_MB} MB`);
if (wallS - holdS - walkS > TARGET_S) fails.push(`wall time ${wallS} s (less the ${holdS} s hold) > target ${TARGET_S} s: shrink the scene or the method (lessons row), never the target`);
const summary = {
  url, place, inputHash, wallS, targetS: TARGET_S, completeFrameMs: completeMs, blackShare, ok: fails.length === 0, fails,
  holdDraws, seriesCols: SERIES_COLS, series, steady: steadyChurn(), firstFrameMs: boot?.firstFrameMs ?? null, frames: boot?.frames ?? 0, maxTaskMs, maxGpuStallMs, maxPingMs, heapPeakMb,
  builds: boot?.builds ?? null, buildMs: boot ? Math.round(boot.buildMs) : null,
  buildsBy: boot ? Object.entries(boot.buildBy ?? {}).sort((a, b) => b[1][0] - a[1][0]).slice(0, 25).map(([k, v]) => [k, Math.round(v[0]), v[1]]) : [],
  drawsBy: boot ? Object.entries(boot.drawBy ?? {}).sort((a, b) => b[1][0] - a[1][0]).slice(0, 25).map(([k, v]) => [k, v[0], v[1], v[2]]) : [],
  gpuSubmitMs: boot?.gpuSubmitMs ?? [],
  overTextures: boot?.overTextures ?? [], overTextureMaterials: boot?.overTextureMaterials ?? [],
  slowGpuCalls: boot?.slow ?? [], maxDispatch: boot?.maxDispatch ?? null,
  pipelines: boot?.pipelines ?? null, pipelineMs: boot ? Math.round(boot.pipelineMs) : null,
  gpuBufferMb: boot ? Math.round(boot.total / 1e6) : null,
  gpuTextureTop: boot?.texBy ? Object.entries(boot.texBy).filter(([, v]) => v > 1e6).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [Math.round(v / 1e5) / 10, k]) : [],
  gpuTextureMbBy: boot?.texBytes ? Object.entries(boot.texBytes).filter(([, v]) => v > 1e5).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v / 1e6)]) : [],
  holdWritesBy: boot?.writeByHold ? Object.entries(boot.writeByHold).sort((a, b) => b[1][0] - a[1][0]).slice(0, 12).map(([k, v]) => [Math.round(v[0] / 1e5) / 10, v[1], k]) : [],
  holdBuildsBy: boot?.buildByHold ? Object.entries(boot.buildByHold).sort((x, y) => y[1][1] - x[1][1]).slice(0, 15).map(([k, v]) => [k, Math.round(v[0]), v[1]]) : [],
  holdUnbuilt: boot?.unbuilt ? { ...boot.unbuilt, by: Object.entries(boot.unbuilt.by).sort((x, y) => y[1] - x[1]).slice(0, 15),
    why: Object.entries(boot.unbuilt.why ?? {}).sort((x, y) => (boot.unbuilt.by[y[0]] ?? 0) - (boot.unbuilt.by[x[0]] ?? 0)).slice(0, 8) } : null,
  buildsPerMaterial: boot?.buildPerMaterial ? (() => {
    const v = Object.values(boot.buildPerMaterial); const hist = {};
    for (const m of v) hist[`${m.n} builds / ${m.ctx.length} contexts`] = (hist[`${m.n} builds / ${m.ctx.length} contexts`] ?? 0) + 1;
    const cams = {}; for (const m of v) for (const c of m.cams) cams[c] = (cams[c] ?? 0) + 1;
    // every material by name with its build count: the census a build-sharing change is judged on
    const names = Object.entries(boot.buildPerMaterial).map(([, m]) => [`${m.where} | ${m.name}`, m.n]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    return { materials: v.length, hist, cams, names };
  })() : null,
  nodeBuild: boot?.nodeBuildN ? { n: boot.nodeBuildN, ms: Math.round(boot.nodeBuildMs), top: Object.entries(boot.nodeBuild).sort((x, y) => y[1][0] - x[1][0]).slice(0, 15).map(([k, v]) => [k, Math.round(v[0]), v[1]]) } : null,
  holdNewGeometryBy: boot?.newGeomByHold ? Object.entries(boot.newGeomByHold).sort((x, y) => y[1][0] - x[1][0]).slice(0, 15).map(([k, v]) => [Math.round(v[0] / 1e5) / 10, v[1], v[2], k]) : [],
  holdBuffersBy: boot?.bufferByHold ? Object.entries(boot.bufferByHold).sort((a, b) => b[1][1] - a[1][1]).slice(0, 12).map(([k, v]) => [Math.round(v[0] / 1e5) / 10, v[1], k]) : [],
  bufferMbBy: boot?.bufferBy ? Object.entries(boot.bufferBy).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [Math.round(v / 1e6), k]) : [], bigBuffers: boot?.big.slice(0, 10) ?? [],
  losses: boot?.losses ?? [], destroys: boot?.destroys ?? [], gpuErrors: boot?.errors ?? [],
  longTasks: [...longTasks].sort((a, b) => b[1] - a[1]).slice(0, 10), heap: heap.filter((_, i) => i % 5 === 0),
  hud, evalResult, hangStacks, pageErrors: pageErrors.slice(0, 10), consoleErrors: consoleErrors.slice(0, 20), notFound: [...missing].slice(0, 40), profileTop, allocMbBy: allocTop,
};
writeFileSync(out, JSON.stringify({ summary, lines }, null, 1));
console.log(JSON.stringify({ ...summary, heap: undefined, series: undefined, longTasks: summary.longTasks.slice(0, 5) }, null, 1));
const line = fails.length ? `webgpu-boot-check: FAIL in ${wallS} s (inputs ${inputHash})\n  ${fails.join("\n  ")}`
  : `webgpu-boot-check: OK in ${wallS} s of ${TARGET_S} s (inputs ${inputHash}; first frame ${summary.firstFrameMs} ms, complete frame ${completeMs} ms, ${summary.frames} frames, longest JS task ${maxTaskMs} ms, 0 GPU errors)`;
mkdirSync(lastDir, { recursive: true });
writeFileSync(lastFile, JSON.stringify({ inputHash, ok: fails.length === 0, line, at: new Date().toISOString() }, null, 1));
console.log(line);
process.exit(fails.length ? 1 : 0);
