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
import { extname, join, resolve } from "node:path";
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
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);
  for (const [prefix, root] of ROOTS) {
    if (!path.startsWith(prefix)) continue;
    let file = join(root, path.slice(prefix.length) || "index.html");
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    if (!existsSync(file)) break;
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/elder-souls-argonia/webgpu/?${query}`;

const browser = await chromium.launch({ headless: true, args: [
  "--enable-unsafe-webgpu", "--enable-features=UnsafeWebGPU", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const t0 = Date.now();
const lines = [];
page.on("console", (m) => lines.push({ t: Date.now() - t0, type: m.type(), text: m.text().slice(0, 400) }));
page.on("pageerror", (e) => lines.push({ t: Date.now() - t0, type: "pageerror", text: String(e.stack ?? e).slice(0, 600) }));
await page.addInitScript(() => {
  // Long main-thread tasks, for the load's jerkiness.
  window.__LONG_TASKS__ = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__LONG_TASKS__.push([Math.round(e.startTime), Math.round(e.duration)]); })
    .observe({ type: "longtask", buffered: true });
});
await page.goto(url, { waitUntil: "load", timeout: 120_000 }).catch((e) => lines.push({ t: Date.now() - t0, type: "goto", text: String(e) }));
await page.waitForTimeout(seconds * 1000);
const longTasks = await page.evaluate(() => window.__LONG_TASKS__).catch(() => []);
await browser.close();
server.close();

const classes = {
  rangeError: /offset is out of bounds|3D tree failed/,
  vertexBuffers: /exceeds the maximum number of vertex buffers/,
  attributeMissing: /Vertex attribute ".*" not found/,
  timestampPool: /Maximum number of queries exceeded/,
  zeroDraw: /vertex count of 0/,
  clock: /THREE\.Clock/,
};
const counts = Object.fromEntries(Object.entries(classes).map(([k, re]) => [k, lines.filter((l) => re.test(l.text)).length]));
const sorted = [...longTasks].sort((a, b) => b[1] - a[1]);
const summary = {
  url, seconds, counts,
  errors: lines.filter((l) => l.type === "error" || l.type === "pageerror").length,
  longTasks: { count: longTasks.length, totalMs: longTasks.reduce((s, x) => s + x[1], 0), top: sorted.slice(0, 10) },
  milestones: lines.filter((l) => /ground-paint|groundcover|renderer backend|first frame|ready/i.test(l.text)).slice(0, 30),
};
writeFileSync(out, JSON.stringify({ summary, lines }, null, 1));
console.log(JSON.stringify(summary, null, 1));
