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
 *     [--ready-timeout 150] [--profile <s>] [--out tooling/.reports/gpu-lane/<run>/]
 *
 * --profile <s>: a CDP CPU profile of <s> seconds (during the walk when --walk is set, else after the
 * settle window); the .cpuprofile lands beside measure.json and its summary in the url entry.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { parseHud } from "./hud-parse.mjs";

const repo = resolve(new URL("../..", import.meta.url).pathname);

export function parseArgs(argv) {
  const o = { url: [], origin: "http://127.0.0.1:8099", base: null, renderer: "webgl", settle: 10, walk: 0, shots: false,
    cdp: "127.0.0.1:9222", run: null, out: null, width: 1280, height: 720, dpr: 1, readyTimeout: 150, profile: 0 };
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

/**
 * Ready = the world has stopped arriving around the player. The studio exposes no "loaded" flag, so ALL of:
 * at least `minMs` since navigation (`startT`, default the first sample); fps published; no "Loading"
 * line; HUD tris within `tol` over the last `stableMs`; and the HUD CPU 'pre' and 'gc' stages (line 5)
 * under `quietMs` ms in every sample of that window. `samples` are {t, tris, fps, loading, pre, gc},
 * oldest first; pre/gc are null when the HUD line is absent (counts as not quiet).
 */
export function isReady(samples, { stableMs = 5000, tol = 0.02, minMs = 20000, quietMs = 2, startT } = {}) {
  const last = samples[samples.length - 1];
  if (!last || !(last.fps > 0) || last.loading || !(last.tris > 0)) return false;
  if (last.t - (startT ?? samples[0].t) < minMs) return false;
  if (last.t - samples[0].t < stableMs) return false;
  const win = samples.filter((s) => s.t >= last.t - stableMs);
  if (win.some((s) => s.loading || !(s.tris > 0) || typeof s.pre !== "number" || typeof s.gc !== "number" || !(s.pre < quietMs) || !(s.gc < quietMs))) return false;
  const tris = win.map((s) => s.tris);
  return (Math.max(...tris) - Math.min(...tris)) / Math.max(...tris) <= tol;
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
  const r = r2;
  return {
    frames: dt.length, windowMs: r(span),
    settledFps: r((dt.length * 1000) / span),
    minFps: r(1000 / sorted[sorted.length - 1]),
    p1LowFps: r(1000 / (worst.reduce((a, b) => a + b, 0) / worst.length)),
    frameTimes: { meanMs: r(span / dt.length), p50Ms: r(q(0.5)), p95Ms: r(q(0.95)), p99Ms: r(q(0.99)), maxMs: r(sorted[sorted.length - 1]) },
  };
}

const r2 = (x) => Math.round(x * 100) / 100;
const quant = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/**
 * Cap-free frame cost. `frames` are {t, dt, work, gpu} per rAF frame: `work` = main-thread ms from the
 * frame's first rAF callback to the later of its last callback's end and a MessageChannel task posted
 * from the first one; `gpu` = the HUD GPU total (a 60-frame mean, null when unsupported). Cost =
 * max(work, gpu); uncappedFps = 1000 / mean(cost); p1LowUncapped = 1000 / p99(cost). Hitches: dt > 33 ms.
 */
export function workStats(frames, hitchMs = 33) {
  const f = frames.filter((x) => x.work > 0);
  if (!f.length) return { workMs: null, uncappedFps: null, p1LowUncapped: null, hitches: [] };
  const stat = (a) => {
    const s = a.slice().sort((x, y) => x - y);
    return { mean: r2(a.reduce((x, y) => x + y, 0) / a.length), p50: r2(quant(s, 0.5)), p99: r2(quant(s, 0.99)), max: r2(s[s.length - 1]) };
  };
  const cost = f.map((x) => Math.max(x.work, x.gpu ?? 0));
  const cs = stat(cost);
  const gpus = f.map((x) => x.gpu).filter((g) => g != null);
  return {
    workFrames: f.length, workMs: stat(f.map((x) => x.work)), gpuFrameMs: gpus.length ? stat(gpus) : null, costMs: cs,
    uncappedFps: r2(1000 / cs.mean), p1LowUncapped: r2(1000 / cs.p99),
    hitches: frames.filter((x) => x.dt > hitchMs).map((x) => ({ t: r2(x.t), dt: r2(x.dt), work: r2(x.work), gpu: x.gpu })),
  };
}

/** Summarise a CDP Profiler profile: top functions by self time and self time by source file. */
export function profileSummary(profile, top = 40) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const { samples = [], timeDeltas = [] } = profile;
  for (let i = 0; i < samples.length; i++) {
    const dt = (timeDeltas[i + 1] ?? 0) / 1000; // the delta AFTER a sample is how long it held
    self.set(samples[i], (self.get(samples[i]) ?? 0) + dt);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const fns = new Map(), files = new Map();
  for (const [id, ms] of self) {
    const cf = byId.get(id)?.callFrame ?? {};
    const file = cf.url ? cf.url.replace(/^.*\//, "") : `(${cf.functionName || "native"})`;
    const key = `${cf.functionName || "(anon)"} ${file}:${(cf.lineNumber ?? -1) + 1}:${(cf.columnNumber ?? -1) + 1}`;
    fns.set(key, (fns.get(key) ?? 0) + ms);
    files.set(file, (files.get(file) ?? 0) + ms);
  }
  const rank = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, ms]) => ({ name: k, selfMs: r2(ms), pct: r2((100 * ms) / (total || 1)) }));
  return { totalMs: r2(total), topSelf: rank(fns, top), byFile: rank(files, 30) };
}

// Installed before the page's own scripts: a rAF timestamp recorder, the per-frame work-time
// wrapper and the GPU adapter read.
function pageProbe() {
  const lane = { ts: [], frames: [], on: false, wrapMs: 0 };
  Object.defineProperty(window, "__GPU_LANE__", { value: lane });
  // Every rAF callback is wrapped; the callbacks of one frame share `stamp`.
  const now = performance.now.bind(performance);
  const raf = window.requestAnimationFrame.bind(window);
  const ch = new MessageChannel();
  let cur = null;
  ch.port1.onmessage = () => { if (cur) cur.msg = now(); };
  window.requestAnimationFrame = (cb) => raf((stamp) => {
    const w0 = now();
    if (!cur || cur.stamp !== stamp) {
      if (cur && lane.on) lane.frames.push(cur);
      const g = window.__STUDIO_GPU_MS__;
      cur = { stamp, start: w0, end: w0, msg: 0, gpu: g?.supported ? g.avg : null };
      ch.port2.postMessage(0);
    }
    lane.wrapMs += now() - w0;
    try { cb(stamp); } finally { const c1 = now(); cur.end = c1; lane.wrapMs += now() - c1; }
  });
  const tick = (t) => { if (lane.on) lane.ts.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  localStorage.setItem("es.hud.perfOpen", "1");
}

/**
 * Close every page already open in the attached Chrome before this run opens its own: orphan studio
 * tabs from an earlier run keep rendering beside the measured page and contaminate every number
 * (perf-diag2 §0). Returns how many it closed.
 */
export async function closeOrphanPages(browser) {
  let closed = 0;
  for (const ctx of browser.contexts()) {
    for (const page of ctx.pages()) {
      await page.close().catch(() => {});
      closed++;
    }
  }
  return closed;
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

async function sample(page, seconds, during) {
  await page.evaluate(() => { const l = window.__GPU_LANE__; l.ts = []; l.frames = []; l.wrapMs = 0; l.on = true; });
  const extra = during ? await during() : null;
  await page.waitForTimeout(Math.max(0, seconds * 1000 - (extra?.elapsedMs ?? 0)));
  const raw = await page.evaluate(() => {
    const l = window.__GPU_LANE__; l.on = false;
    return { ts: l.ts, wrapMs: l.wrapMs, frames: l.frames.map((f) => ({ t: f.stamp, work: Math.max(f.end, f.msg) - f.start, gpu: f.gpu })) };
  });
  for (let i = 0; i < raw.frames.length; i++) raw.frames[i].dt = i ? raw.frames[i].t - raw.frames[i - 1].t : 0;
  return { ts: raw.ts, extra,
    work: { ...workStats(raw.frames), wrapperMsPerFrame: raw.frames.length ? r2(raw.wrapMs / raw.frames.length) : null } };
}

async function cpuProfile(page, o, seconds, tag, idx) {
  const cdp = await page.context().newCDPSession(page);
  const t0 = Date.now();
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await cdp.send("Profiler.start");
  await page.waitForTimeout(seconds * 1000);
  const { profile } = await cdp.send("Profiler.stop");
  await cdp.detach().catch(() => {});
  const file = join(o.out, `url${idx}-${tag}.cpuprofile`);
  writeFileSync(file, JSON.stringify(profile));
  return { elapsedMs: Date.now() - t0, file, seconds, ...profileSummary(profile) };
}

async function measureUrl(ctx, o, query, idx) {
  const page = await ctx.newPage();
  const consoleErrors = [], http404s = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 400)); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 400)}`));
  page.on("response", (r) => { if (r.status() === 404) http404s.push(r.url()); });
  const url = `${o.origin}${o.base}${query.startsWith("?") ? query : `?${query}`}`;
  const t0 = Date.now();
  const loaded = await page.goto(url, { timeout: o.readyTimeout * 1000, waitUntil: "load" }).then(() => true)
    .catch((e) => { consoleErrors.push(`goto: ${e}`); return false; });
  if (!loaded) throw new Error(`site not reachable at ${url} (is serve.mjs running on the pod?)`);
  // Ready: see isReady (the world has stopped arriving; streaming never lets the network go quiet).
  let ready = false;
  const samples = [];
  while (Date.now() - t0 < o.readyTimeout * 1000) {
    const s = await page.evaluate(() => {
      const text = document.body.innerText;
      const m = /(?:^|\n)tris ([\d.]+)M/.exec(text);
      return { fps: window.__STUDIO_FPS__ ?? 0, tris: m ? Number(m[1]) * 1e6 : 0, loading: text.includes("Loading"), text };
    }).catch(() => ({ fps: 0, tris: 0, loading: true, text: "" }));
    const { text, ...rest } = s;
    const st = parseHud(text).cpuByStage;
    samples.push({ t: Date.now(), ...rest, pre: st ? (st.pre?.avg ?? 0) : null, gc: st ? (st.gc?.avg ?? 0) : null });
    if (isReady(samples, { startT: t0 })) { ready = true; break; }
    await page.waitForTimeout(500);
  }
  const readyS = Math.round((Date.now() - t0) / 100) / 10;
  const settle = await sample(page, o.settle);
  const stats = { ...frameStats(settle.ts), ...settle.work };
  let profile = null;
  if (o.profile > 0 && !(o.walk > 0)) profile = await cpuProfile(page, o, o.profile, "settled", idx);
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
    const w = await sample(page, o.walk, o.profile > 0 ? () => cpuProfile(page, o, Math.min(o.profile, o.walk), "walk", idx) : null);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
    if (w.extra) profile = w.extra;
    walk = { seconds: o.walk, ...frameStats(w.ts), ...w.work, hud: parseHud(await page.evaluate(() => document.body.innerText).catch(() => "")) };
    await shot("walk");
  }
  const gpu = await gpuAdapter(page, o.renderer);
  await page.close();
  return { url, query, ready, readyS, ...stats, hud, drawCalls: hud.drawCalls ?? info.calls ?? null, tris: hud.tris ?? info.tris ?? null,
    walk, profile, consoleErrors, http404s, memory: info.memory ?? null, gpuAdapter: gpu, screenshots };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  mkdirSync(o.out, { recursive: true });
  const browser = await chromium.connectOverCDP(`http://${o.cdp}`);
  const orphansClosed = await closeOrphanPages(browser);
  console.log(`measure: closed ${orphansClosed} page(s) left open in Chrome by earlier runs`);
  const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: o.dpr });
  await ctx.addInitScript(pageProbe);
  const git = (a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" }).stdout.trim();
  const result = { schemaVersion: 1, run: o.run, gitSha: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "",
    builtAt: null, measuredAt: new Date().toISOString(), renderer: o.renderer, origin: o.origin, base: o.base,
    window: { width: o.width, height: o.height }, dpr: o.dpr, settleS: o.settle, walkS: o.walk, browser: browser.version(), orphansClosed, urls: [] };
  // builtAt: the served index.html's Last-Modified (the build that is actually being measured).
  result.builtAt = await fetch(`${o.origin}${o.base}`).then((r) => r.headers.get("last-modified")).catch(() => null);
  for (const [i, q] of o.url.entries()) {
    const r = await measureUrl(ctx, o, q, i);
    result.urls.push(r);
    console.log(`${q}: ${r.settledFps} fps settled, uncapped ${r.uncappedFps} (work ${r.workMs?.mean} ms, wrapper ${r.wrapperMsPerFrame}), 1% low ${r.p1LowFps}, min ${r.minFps}, ready ${r.readyS} s${r.walk ? `, walk ${r.walk.settledFps}` : ""}`);
  }
  await ctx.close();
  const file = join(o.out, "measure.json");
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`measure: ${file}`);
  await browser.close().catch(() => {});
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
