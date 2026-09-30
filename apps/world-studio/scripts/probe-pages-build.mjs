/**
 * Load a BUILT studio bundle the way GitHub Pages serves the /webgpu/ site
 * and record its console: errors, warnings and the load timeline.
 *
 *   node scripts/probe-pages-build.mjs --dist /tmp/wgb --out /tmp/probe.json \
 *     [--query "view=character&x=4.75&z=1.86&ex=1&mats=bmv-v1&t=10%3A00&d=8-17"] [--seconds 150]
 *
 * Build the bundle first as the Pages workflow does:
 *   ES_STUDIO_BASE=/elder-souls-argonia/webgpu/ VITE_ES_DATA_BASE=/elder-souls-argonia/studio/ \
 *     npx vite build --outDir /tmp/wgb
 * The data base is served from this app's public/ (the studio's rasters and
 * kits), the bundle from --dist. Headless SwiftShader WebGPU (harness-run.mjs
 * flags): slow, so the timings are ratios, not the owner's M2.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const dist = resolve(arg("dist", "/tmp/wgb"));
const out = resolve(arg("out", "/tmp/probe-pages-build.json"));
const query = arg("query", "view=character&x=4.75&z=1.86&ex=1&mats=bmv-v1&t=10%3A00&d=8-17");
const seconds = Number(arg("seconds", "150"));
const publicDir = resolve(new URL("..", import.meta.url).pathname, "public");

const MIME = { ".js": "text/javascript", ".html": "text/html", ".json": "application/json", ".css": "text/css",
  ".wasm": "application/wasm", ".png": "image/png", ".ktx2": "image/ktx2", ".glb": "model/gltf-binary" };
const charDir = resolve(publicDir, "../../../packages/character-assets/files");
// Pages: the character files resolve against the sandbox at the site root.
const ROOTS = [["/elder-souls-argonia/webgpu/", dist], ["/elder-souls-argonia/studio/", publicDir],
  ["/elder-souls-argonia/", charDir]];
// The KTX2 transcoder, as packages/basis-transcoder ships it into every
// Pages build: served at any `<base>/basis/` the loader resolves.
const basisDir = dirname(createRequire(import.meta.url).resolve("three/examples/jsm/libs/basis/basis_transcoder.js"));
const missing = new Set();
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);
  const basis = /\/basis\/(basis_transcoder\.(?:js|wasm))$/.exec(path);
  if (basis) {
    res.writeHead(200, { "Content-Type": MIME[extname(basis[1])] });
    createReadStream(join(basisDir, basis[1])).pipe(res);
    return;
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

const browser = await chromium.launch({ headless: true, env: { ...process.env, CHROME_LOG_FILE: process.env.PROBE_CHROME_LOG ?? "" }, args: [
  ...(process.env.PROBE_EXTRA_ARGS ? process.env.PROBE_EXTRA_ARGS.split(" ") : []), ...(process.env.PROBE_CHROME_LOG ? ["--enable-logging", "--v=0"] : []), "--enable-unsafe-webgpu", "--enable-features=UnsafeWebGPU", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const t0 = Date.now();
const lines = [];
page.on("console", (m) => lines.push({ t: Date.now() - t0, type: m.type(), text: m.text().slice(0, 400) }));
page.on("pageerror", (e) => lines.push({ t: Date.now() - t0, type: "pageerror",
  text: (String(e.stack || "") || `${e.name}: ${e.message}` || String(e)).slice(0, 600) }));
await page.addInitScript(() => {
  // GPU buffer ledger: every createBuffer's size and label, the running total,
  // the device limits and any device loss.
  const g = { total: 0, count: 0, big: [], lost: null, losses: [], destroys: [], devices: 0, limits: null, errors: [] };
  window.__GPU_BUFFERS__ = g;
  const stack = () => new Error().stack.split("\n").slice(2, 16).join(" | ").slice(0, 1500);
  if (self.GPUAdapter) {
    // One id per requestDevice, so several devices are told apart; every loss
    // is logged with its device id and every JS destroy()/unconfigure() with its stack.
    const req = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (...a) {
      const dev = await req.apply(this, a);
      const id = ++g.devices;
      dev.__probeId = id;
      console.warn(`[probe] device ${id} created`);
      dev.lost.then((i) => {
        const e = { id, t: Math.round(performance.now()), reason: i.reason, message: i.message };
        g.losses.push(e); if (!g.lost) g.lost = e;
        console.warn(`[probe] GPU device lost: ${i.reason} ${i.message} (device ${id})`);
      });
      dev.addEventListener?.("uncapturederror", (e) => { if (g.errors.length < 20) g.errors.push([id, Math.round(performance.now()), String(e.error?.message).slice(0, 300)]); });
      return dev;
    };
  }
  if (self.GPUDevice) {
    const destroy = GPUDevice.prototype.destroy;
    GPUDevice.prototype.destroy = function () {
      const d = { id: this.__probeId, t: Math.round(performance.now()), stack: stack() };
      g.destroys.push(d); g.destroyedBy = d;
      console.warn(`[probe] device.destroy() called (device ${d.id}) ${d.stack}`);
      return destroy.call(this);
    };
    const create = GPUDevice.prototype.createBuffer;
    GPUDevice.prototype.createBuffer = function (d) {
      if (!g.limits) g.limits = { maxBufferSize: this.limits.maxBufferSize, maxStorage: this.limits.maxStorageBufferBindingSize };
      g.total += d.size; g.count += 1;
      if (d.size >= 16 * 1024 * 1024) g.big.push([Math.round(performance.now()), d.size, d.label ?? "", new Error().stack.split("\n").slice(2, 6).join(" | ").slice(0, 400)]);
      return create.call(this, d);
    };
  }
  if (self.GPUCanvasContext) {
    const unconf = GPUCanvasContext.prototype.unconfigure;
    GPUCanvasContext.prototype.unconfigure = function () {
      console.warn(`[probe] context.unconfigure() called ${stack()}`);
      return unconf.call(this);
    };
  }
  // Long main-thread tasks, for the load's jerkiness.
  window.__LONG_TASKS__ = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__LONG_TASKS__.push([Math.round(e.startTime), Math.round(e.duration)]); })
    .observe({ type: "longtask", buffered: true });
});
// --profile N: a CPU profile of the first N seconds, top self-time functions.
const profileS = Number(arg("profile", "0"));
const cdp = profileS > 0 ? await page.context().newCDPSession(page) : null;
if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start"); }
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
  profileTop = [...self].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, ms]) => [Math.round(ms), k]);
};
if (cdp) setTimeout(() => { stopProfile().catch(() => {}); }, profileS * 1000);
await page.goto(url, { waitUntil: "load", timeout: 120_000 }).catch((e) => lines.push({ t: Date.now() - t0, type: "goto", text: String(e) }));
// GPU process watch: a new gpu-process pid means the old one died (a
// crash or an OOM kill), which Chrome reports to the page as a device lost.
const bcdp = await browser.newBrowserCDPSession();
const gpuPids = [];
const gpuTimer = setInterval(() => { bcdp.send("SystemInfo.getProcessInfo").then(({ processInfo }) => {
  for (const p of processInfo) if (p.type === "GPU" && !gpuPids.some((x) => x[1] === p.id)) gpuPids.push([Date.now() - t0, p.id]);
}).catch(() => {}); }, 500);
await page.waitForTimeout(seconds * 1000);
clearInterval(gpuTimer);
const longTasks = await page.evaluate(() => window.__LONG_TASKS__).catch(() => []);
const gpuBuffers = await page.evaluate(() => window.__GPU_BUFFERS__).catch(() => null);
await browser.close();
server.close();

const classes = {
  rangeError: /offset is out of bounds|3D tree failed/,
  vertexBuffers: /exceeds the maximum number of vertex buffers/,
  attributeMissing: /Vertex attribute ".*" not found/,
  timestampPool: /Maximum number of queries exceeded/,
  zeroDraw: /vertex count of 0/,
  clock: /THREE\.Clock/,
  ktx2: /\.ktx2|KTX2|transcoder/i,
};
const counts = Object.fromEntries(Object.entries(classes).map(([k, re]) => [k, lines.filter((l) => re.test(l.text)).length]));
// A loss the page caused (reason "destroyed" with no JS destroy() is a
// dropped device, a destroy() is teardown) is a real bug, never headless noise:
// only a loss whose reason is not "destroyed" cuts the error list.
const lostAt = lines.find((l) => l.text.startsWith("[probe] GPU device lost") && !/lost: destroyed/.test(l.text))?.t ?? Infinity;
const errLines = lines.filter((l) => l.type === "error" || l.type === "pageerror");
const known = (l) => Object.values(classes).some((re) => re.test(l.text));
const sorted = [...longTasks].sort((a, b) => b[1] - a[1]);
const summary = {
  url, seconds, counts, gpuBuffers, gpuProcesses: gpuPids,
  deviceEvents: lines.filter((l) => l.text.startsWith("[probe] ")).map((l) => `${l.t} ${l.text.slice(0, 300)}`), profileTop,
  notFound: [...missing].slice(0, 40),
  errors: errLines.length,
  afterDeviceLoss: errLines.filter((l) => l.t >= lostAt).length,
  unclassified: errLines.filter((l) => l.t < lostAt && !known(l)).map((l) => `${l.t} ${l.text.slice(0, 200)}`),
  longTasks: { count: longTasks.length, totalMs: longTasks.reduce((s, x) => s + x[1], 0), top: sorted.slice(0, 10) },
  milestones: lines.filter((l) => /ground-paint|groundcover|renderer backend|first frame|ready/i.test(l.text)).slice(0, 30),
};
writeFileSync(out, JSON.stringify({ summary, lines }, null, 1));
console.log(JSON.stringify(summary, null, 1));
