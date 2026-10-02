#!/usr/bin/env node
/**
 * Measure the built studio in a Chrome reached over DevTools (the RunPod pod through `ssh -L 9222`,
 * or a local Chrome): per URL, wait for the first complete frame, then sample requestAnimationFrame
 * timestamps in-page for --settle seconds (optionally a held-W walk after it), read the perf HUD and
 * write ONE measure.json per run. README.md beside this file has the pod loop and how to read it.
 *
 *   node tooling/gpu-lane/measure.mjs --run <name> --url "?view=character&x=..&z=..&t=22&w=rain" [--url ...]
 *     [--origin http://127.0.0.1:8099] [--base /elder-souls-argonia/studio/] [--renderer webgl|webgpu]
 *     [--settle 10] [--walk <s>] [--shots] [--cdp 127.0.0.1:9222] [--width 1280 --height 720 --dpr 1]
 *     [--ready-timeout 240] [--out tooling/.reports/gpu-lane/<run>/]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { parseHud } from "./hud-parse.mjs";

const repo = resolve(new URL("../..", import.meta.url).pathname);

export function parseArgs(argv) {
  const o = { url: [], origin: "http://127.0.0.1:8099", base: null, renderer: "webgl", settle: 10, walk: 0, shots: false,
    cdp: "127.0.0.1:9222", run: null, out: null, width: 1280, height: 720, dpr: 1, readyTimeout: 240 };
  const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "");
    if (k === "shots") { o.shots = true; continue; }
    const v = argv[++i];
    if (v === undefined) throw new Error(`--${k} needs a value`);
    if (k === "url") o.url.push(v);
    else if (camel(k) in o) o[camel(k)] = typeof o[camel(k)] === "number" ? Number(v) : v;
    else throw new Error(`unknown option --${k}`);
  }
  if (!o.url.length || !o.run) throw new Error("need --run <name> and at least one --url <query>");
  if (!["webgl", "webgpu"].includes(o.renderer)) throw new Error("--renderer is webgl or webgpu");
  o.base ??= o.renderer === "webgpu" ? "/elder-souls-argonia/webgpu/" : "/elder-souls-argonia/studio/";
  o.out = resolve(o.out ?? join(repo, "tooling/.reports/gpu-lane", o.run));
  return o;
}

/** Frame-time stats from rAF timestamps (ms). 1 % low = fps of the mean of the slowest 1 % of frames. */
export function frameStats(ts) {
  const dt = [];
  for (let i = 1; i < ts.length; i++) dt.push(ts[i] - ts[i - 1]);
  if (!dt.length) return { frames: 0, settledFps: 0, minFps: 0, p1LowFps: 0, frameTimes: null };
  const sorted = dt.slice().sort((a, b) => a - b);
  const span = ts[ts.length - 1] - ts[0];
  const worst = sorted.slice(Math.max(0, sorted.length - Math.max(1, Math.ceil(sorted.length / 100))));
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const r = (x) => Math.round(x * 100) / 100;
  return {
    frames: dt.length, windowMs: r(span),
    settledFps: r((dt.length * 1000) / span),
    minFps: r(1000 / sorted[sorted.length - 1]),
    p1LowFps: r(1000 / (worst.reduce((a, b) => a + b, 0) / worst.length)),
    frameTimes: { meanMs: r(span / dt.length), p50Ms: r(q(0.5)), p95Ms: r(q(0.95)), p99Ms: r(q(0.99)), maxMs: r(sorted[sorted.length - 1]) },
  };
}

// Installed before the page's own scripts: a rAF timestamp recorder and the GPU adapter read.
function pageProbe() {
  const lane = { ts: [], on: false };
  Object.defineProperty(window, "__GPU_LANE__", { value: lane });
  const tick = (t) => { if (lane.on) lane.ts.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  localStorage.setItem("es.hud.perfOpen", "1");
}

async function gpuAdapter(page, renderer) {
  return page.evaluate(async (renderer) => {
    if (renderer === "webgpu" && navigator.gpu) {
      const a = await navigator.gpu.requestAdapter();
      const i = a?.info ?? (await a?.requestAdapterInfo?.());
      return i ? { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description } : null;
    }
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext ? { vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) } : null;
  }, renderer).catch((e) => ({ error: String(e) }));
}

async function sample(page, seconds) {
  await page.evaluate(() => { window.__GPU_LANE__.ts = []; window.__GPU_LANE__.on = true; });
  await page.waitForTimeout(seconds * 1000);
  return page.evaluate(() => { window.__GPU_LANE__.on = false; return window.__GPU_LANE__.ts; });
}

async function measureUrl(ctx, o, query, idx) {
  const page = await ctx.newPage();
  const consoleErrors = [], http404s = [];
  let inflight = 0, lastNet = Date.now();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 400)); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 400)}`));
  page.on("request", () => { inflight++; lastNet = Date.now(); });
  const done = () => { inflight = Math.max(0, inflight - 1); lastNet = Date.now(); };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  page.on("response", (r) => { if (r.status() === 404) http404s.push(r.url()); });
  const url = `${o.origin}${o.base}${query.startsWith("?") ? query : `?${query}`}`;
  const t0 = Date.now();
  await page.goto(url, { timeout: o.readyTimeout * 1000, waitUntil: "load" }).catch((e) => consoleErrors.push(`goto: ${e}`));
  // First complete frame: the studio's frame probe has published an fps, the HUD has its tris line,
  // and the network has been quiet for 3 s.
  let ready = false;
  while (Date.now() - t0 < o.readyTimeout * 1000) {
    const s = await page.evaluate(() => ({ fps: window.__STUDIO_FPS__ ?? 0, tris: /\ntris [\d.]+M/.test(document.body.innerText) }))
      .catch(() => ({ fps: 0, tris: false }));
    if (s.fps > 0 && s.tris && inflight === 0 && Date.now() - lastNet > 3000) { ready = true; break; }
    await page.waitForTimeout(500);
  }
  const readyS = Math.round((Date.now() - t0) / 100) / 10;
  const stats = frameStats(await sample(page, o.settle));
  const hudText = await page.evaluate(() => document.body.innerText).catch(() => "");
  const hud = parseHud(hudText);
  const info = await page.evaluate(() => {
    const g = window.__STUDIO_GPU_MS__;
    const m = performance.memory;
    return { tris: g?.tris ?? null, calls: g?.calls ?? null,
      memory: m ? { usedJSHeapSize: m.usedJSHeapSize, totalJSHeapSize: m.totalJSHeapSize, jsHeapSizeLimit: m.jsHeapSizeLimit } : null };
  }).catch(() => ({}));
  const screenshots = [];
  const shot = async (tag) => {
    if (!o.shots) return;
    const p = join(o.out, `url${idx}-${tag}.jpg`);
    await page.screenshot({ path: p, type: "jpeg", quality: 75 }).catch(() => {});
    screenshots.push(p);
  };
  await shot("settled");
  let walk = null;
  if (o.walk > 0) {
    const cdp = await ctx.newCDPSession(page);
    await page.mouse.click(o.width / 2, o.height / 2).catch(() => {});
    const key = { key: "w", code: "KeyW", windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87, text: "w" };
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...key });
    const ts = await sample(page, o.walk);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
    walk = { seconds: o.walk, ...frameStats(ts), hud: parseHud(await page.evaluate(() => document.body.innerText).catch(() => "")) };
    await shot("walk");
  }
  const gpu = await gpuAdapter(page, o.renderer);
  await page.close();
  return { url, query, ready, readyS, ...stats, hud, drawCalls: hud.drawCalls ?? info.calls ?? null, tris: hud.tris ?? info.tris ?? null,
    walk, consoleErrors, http404s, memory: info.memory ?? null, gpuAdapter: gpu, screenshots };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  mkdirSync(o.out, { recursive: true });
  const browser = await chromium.connectOverCDP(`http://${o.cdp}`);
  const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: o.dpr });
  await ctx.addInitScript(pageProbe);
  const git = (a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" }).stdout.trim();
  const result = { schemaVersion: 1, run: o.run, gitSha: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "",
    builtAt: null, measuredAt: new Date().toISOString(), renderer: o.renderer, origin: o.origin, base: o.base,
    window: { width: o.width, height: o.height }, dpr: o.dpr, settleS: o.settle, walkS: o.walk, browser: browser.version(), urls: [] };
  // builtAt: the served index.html's Last-Modified (the build that is actually being measured).
  result.builtAt = await fetch(`${o.origin}${o.base}`).then((r) => r.headers.get("last-modified")).catch(() => null);
  for (const [i, q] of o.url.entries()) {
    const r = await measureUrl(ctx, o, q, i);
    result.urls.push(r);
    console.log(`${q}: ${r.settledFps} fps settled, 1% low ${r.p1LowFps}, min ${r.minFps}, ready ${r.readyS} s${r.walk ? `, walk ${r.walk.settledFps}` : ""}`);
  }
  await ctx.close();
  const file = join(o.out, "measure.json");
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`measure: ${file}`);
  await browser.close().catch(() => {});
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
