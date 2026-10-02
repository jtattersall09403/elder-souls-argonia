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
 * --smoke: one spot (default spot a), 60 s; exits 1 and says why on the vsync cap, a ready gate over 40 s,
 * a black frame, a GPU/WebGL error or lost context, or a tab this run did not open. Run before a baseline.
 * --census: after the ready gate, a per-draw census, matrixAutoUpdate census, heap slope and a 30 s hitch
 * list with top functions; writes census.json and census.txt beside measure.json (WebGL renderer).
 * --diag relink,heap: inject probes/<name>.js before the page's scripts (also read from a `diag=` query
 * flag); the reports land in each url entry's `diag`.
 * --trace: a Chrome trace (timeline, frame, gpu, v8.gc, blink, viz) of the settle window and of the walk;
 * url<i>-<settled|walk>.trace.json beside measure.json, its long-frame classes (trace-frames.mjs) in `trace`.
 * --aim "yaw,pitch" (radians): aim the follow camera before the settle. --clean 1: HUD-free screenshots.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { BLACK_LUMA, SPOT_A, censusText, diagList, foreignPages, heapGrowth, hitchList, meanLuma, smokeProblems } from "./checks.mjs";
import { parseHud } from "./hud-parse.mjs";
import { classifyFrames } from "./trace-frames.mjs";

export { BLACK_LUMA, SPOT_A, diagList, foreignPages, hitchList, meanLuma, smokeProblems };

const repo = resolve(new URL("../..", import.meta.url).pathname);
const probePath = (n) => new URL(`./probes/${n}.js`, import.meta.url).pathname;

export function parseArgs(argv) {
  const o = { url: [], origin: "http://127.0.0.1:8099", base: null, renderer: "webgl", settle: 10, walk: 0, shots: false,
    cdp: "127.0.0.1:9222", run: null, out: null, width: 1280, height: 720, dpr: 1, readyTimeout: 150, profile: 0,
    smoke: false, census: false, trace: false, diag: "", aim: "", clean: "" };
  const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "");
    if (k === "shots" || k === "smoke" || k === "census" || k === "trace") { o[k] = true; continue; }
    const v = argv[++i];
    if (v === undefined) throw new Error(`--${k} needs a value`);
    if (k === "url") o.url.push(v);
    else if (camel(k) in o) o[camel(k)] = typeof o[camel(k)] === "number" ? Number(v) : v;
    else throw new Error(`unknown option --${k}`);
  }
  if (o.smoke) { // one spot, 60 s: ready gate <= 40 s, 5 s settle, one screenshot for the black-frame check
    if (!o.url.length) o.url.push(SPOT_A);
    o.url.splice(1); o.run ??= "smoke"; o.readyTimeout = 40; o.settle = 5; o.shots = true;
  }
  if (!o.url.length || !o.run) throw new Error("need --run <name> and at least one --url <query>");
  o.diagList = diagList(o.diag, o.url);
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
    frames: dt.length, windowMs: r(span), over20: dt.filter((x) => x > 20).length, over33: dt.filter((x) => x > 33).length,
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
  const lane = { ts: [], frames: [], on: false, wrapMs: 0, lost: 0 };
  window.addEventListener("webglcontextlost", () => { lane.lost++; }, true);
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
 * (perf-diag2 §0). Returns {closed: how many, keep: the blank page it opened first}: closing the last
 * window exits headed Chrome, and the DevTools port with it.
 */
export async function closeOrphanPages(browser) {
  let closed = 0;
  const keep = (await browser.contexts()[0]?.newPage?.().catch(() => null)) ?? null;
  for (const ctx of browser.contexts()) {
    for (const page of ctx.pages()) {
      if (page === keep) continue;
      await page.close().catch(() => {});
      closed++;
    }
  }
  return { closed, keep };
}

/**
 * The census (--census): after the ready gate. Draw census over ~60 frames and the matrixAutoUpdate census
 * (2 s) together, then a 30 s window with rAF timestamps, a CDP CPU profile and heap readings at 0 s and 30 s
 * (plus a HeapProfiler sampling profile when the heap probe is on); hitches are frames over 20 ms.
 */
async function runCensus(page, o) {
  const cdp = await page.context().newCDPSession(page);
  const heapMB = async () => Math.round(((await cdp.send("Runtime.getHeapUsage")).usedSize / 1e6) * 100) / 100;
  const wantHeap = o.diagList.includes("heap");
  await page.evaluate(() => { window.__DIAG__.census.on = true; });
  const matrix = await page.evaluate(() => window.__DIAG__.matrixCensus(2000)).catch(() => null);
  await page.evaluate(() => { window.__DIAG__.census.on = false; });
  const draws = await page.evaluate(() => window.__DIAG__.censusReport());
  const seconds = 30;
  const startMB = await heapMB();
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  let heapBefore = null;
  if (wantHeap) {
    await cdp.send("HeapProfiler.enable");
    await cdp.send("HeapProfiler.startSampling", { samplingInterval: 32768 });
    heapBefore = (await cdp.send("HeapProfiler.getSamplingProfile")).profile;
  }
  let offsetMs = 0, profile = null, heapSampling = null;
  // The hitch window opens CENSUS_LEAD_MS after Profiler.start: starting the profiler costs one ~400 ms
  // frame of its own (perf-f6), which is the harness, not the app.
  await cdp.send("Profiler.start");
  // The profile clock starts with Profiler.start, ~ the instant before this page read.
  const pn = await page.evaluate(() => performance.now());
  await page.waitForTimeout(CENSUS_LEAD_MS);
  const w = await sample(page, seconds, async () => {
    const t0 = Date.now();
    await page.waitForTimeout(seconds * 1000);
    profile = (await cdp.send("Profiler.stop")).profile;
    offsetMs = profile.startTime / 1000 - pn;
    return { elapsedMs: Date.now() - t0 };
  });
  const endMB = await heapMB();
  if (wantHeap) heapSampling = (await cdp.send("HeapProfiler.stopSampling")).profile;
  await cdp.detach().catch(() => {});
  const hitches = hitchList(w.ts, profile, offsetMs);
  return { draws, matrix, hitchWindowS: seconds, frames: w.ts.length, hitches,
    heap: { startMB, endMB, seconds, slopeMBs: Math.round(((endMB - startMB) / seconds) * 1000) / 1000, sampledGrowth: heapSampling ? heapGrowth(heapBefore, heapSampling) : null } };
}

export const CENSUS_LEAD_MS = 2000;

/** Trace categories for --trace. */
export const TRACE_CATEGORIES = ["devtools.timeline", "disabled-by-default-devtools.timeline.frame", "gpu",
  "disabled-by-default-v8.gc", "v8", "blink", "viz", "cc", "toplevel"];

/** Start a Chrome trace on the page; the returned stop() writes <file> and returns the long-frame classes. */
async function startTrace(page, file) {
  const cdp = await page.context().newCDPSession(page);
  const ev = [];
  // Keep what the classifier reads (metadata, frame markers, GC, anything >= 0.5 ms): a full 10 s trace of
  // the studio is over 512 MB of JSON, past V8's string limit.
  const keep = (e) => e.ph === "M" || e.name === "FireAnimationFrame" || (e.dur ?? 0) >= 500 || /GC|Gc/.test(e.name);
  cdp.on("Tracing.dataCollected", (d) => { for (const e of d.value) if (keep(e)) ev.push(e); });
  const done = new Promise((r) => cdp.on("Tracing.tracingComplete", r));
  await cdp.send("Tracing.start", { traceConfig: { includedCategories: TRACE_CATEGORIES, recordMode: "recordContinuously" }, transferMode: "ReportEvents" });
  return async (profileFile) => {
    await cdp.send("Tracing.end");
    await done;
    await cdp.detach().catch(() => {});
    writeFileSync(file, JSON.stringify({ traceEvents: ev }));
    const profile = profileFile ? JSON.parse(readFileSync(profileFile, "utf8")) : null;
    return { file, events: ev.length, ...classifyFrames(ev, { profile }) };
  };
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

async function measureUrl(ctx, o, query, idx, own, browser) {
  const page = await ctx.newPage();
  own.add(page);
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
  // --aim "yaw,pitch" (radians): points the follow camera via __STUDIO_CHARACTER_DEBUG__ before the settle.
  if (o.aim) {
    const [yaw, pitch] = o.aim.split(",").map(Number);
    await page.evaluate(([y, p]) => window.__STUDIO_CHARACTER_DEBUG__?.aimCamera(y, p), [yaw, pitch]).catch(() => {});
    await page.waitForTimeout(1500);
  }
  const traces = {};
  const stopSettleTrace = o.trace ? await startTrace(page, join(o.out, `url${idx}-settled.trace.json`)) : null;
  const settle = await sample(page, o.settle);
  if (stopSettleTrace) traces.settled = await stopSettleTrace();
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
    // --clean 1: hide the HUD overlays (fixed/absolute elements without a canvas) for the screenshot only.
    if (o.clean) await page.evaluate(() => { window.__hid = [...document.querySelectorAll("body *")].filter((e) => !e.querySelector("canvas") && e.tagName !== "CANVAS" && ["fixed", "absolute"].includes(getComputedStyle(e).position)); window.__hid.forEach((e) => { e.dataset.v = e.style.visibility; e.style.visibility = "hidden"; }); }).catch(() => {});
    await page.screenshot({ path: p, type: "jpeg", quality: 75 }).catch(() => {});
    if (o.clean) await page.evaluate(() => window.__hid?.forEach((e) => { e.style.visibility = e.dataset.v; })).catch(() => {});
    screenshots.push(p);
  };
  await shot("settled");
  let walk = null;
  if (o.walk > 0) {
    const cdp = await ctx.newCDPSession(page);
    await page.mouse.click(o.width / 2, o.height / 2).catch(() => {});
    const key = { key: "w", code: "KeyW", windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87, text: "w" };
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...key });
    const stopWalkTrace = o.trace ? await startTrace(page, join(o.out, `url${idx}-walk.trace.json`)) : null;
    const w = await sample(page, o.walk, o.profile > 0 ? () => cpuProfile(page, o, Math.min(o.profile, o.walk), "walk", idx) : null);
    if (stopWalkTrace) traces.walk = await stopWalkTrace(w.extra?.file);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
    if (w.extra) profile = w.extra;
    walk = { seconds: o.walk, ...frameStats(w.ts), ...w.work, hud: parseHud(await page.evaluate(() => document.body.innerText).catch(() => "")) };
    await shot("walk");
  }
  const gpu = await gpuAdapter(page, o.renderer);
  const census = o.census ? await runCensus(page, o).catch((e) => ({ error: String(e) })) : null;
  const diag = o.diagList.length ? await page.evaluate((names) => Object.fromEntries(names.map((n) => [n, window.__DIAG__?.[n]?.() ?? null])), o.diagList).catch((e) => ({ error: String(e) })) : null;
  let smoke = null;
  if (o.smoke) {
    const png = await page.screenshot({ type: "png" });
    const rgba = await page.evaluate(async (b64) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(160, 90), g = c.getContext("2d");
      g.drawImage(bmp, 0, 0, 160, 90);
      return Array.from(g.getImageData(0, 0, 160, 90).data);
    }, png.toString("base64")).catch(() => null);
    const contextLost = await page.evaluate(() => window.__GPU_LANE__.lost).catch(() => 0);
    const r = { ready, readyS, uncappedFps: stats.uncappedFps, luma: rgba ? meanLuma(rgba) : null, consoleErrors, contextLost,
      foreign: foreignPages(browser, own) };
    smoke = { ...r, luma: r.luma == null ? null : Math.round(r.luma * 10) / 10, problems: smokeProblems(r) };
  }
  await page.close();
  return { url, query, ready, readyS, ...stats, hud, drawCalls: hud.drawCalls ?? info.calls ?? null, tris: hud.tris ?? info.tris ?? null,
    walk, profile, trace: o.trace ? traces : null, consoleErrors, http404s, memory: info.memory ?? null, gpuAdapter: gpu, screenshots, census, diag, smoke };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  mkdirSync(o.out, { recursive: true });
  const browser = await chromium.connectOverCDP(`http://${o.cdp}`);
  const { closed: orphansClosed, keep } = await closeOrphanPages(browser);
  const own = new Set(keep ? [keep] : []);
  console.log(`measure: closed ${orphansClosed} page(s) left open in Chrome by earlier runs`);
  const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: o.dpr });
  await ctx.addInitScript(pageProbe);
  if (o.census) await ctx.addInitScript({ content: readFileSync(probePath("census"), "utf8") });
  for (const n of o.diagList) await ctx.addInitScript({ content: readFileSync(probePath(n), "utf8") });
  const git = (a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" }).stdout.trim();
  const result = { schemaVersion: 1, run: o.run, gitSha: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "",
    builtAt: null, measuredAt: new Date().toISOString(), renderer: o.renderer, origin: o.origin, base: o.base,
    window: { width: o.width, height: o.height }, dpr: o.dpr, settleS: o.settle, walkS: o.walk, browser: browser.version(), orphansClosed, urls: [] };
  // builtAt: the served index.html's Last-Modified (the build that is actually being measured).
  result.builtAt = await fetch(`${o.origin}${o.base}`).then((r) => r.headers.get("last-modified")).catch(() => null);
  for (const [i, q] of o.url.entries()) {
    const r = await measureUrl(ctx, o, q, i, own, browser);
    result.urls.push(r);
    console.log(`${q}: ${r.settledFps} fps settled, uncapped ${r.uncappedFps} (work ${r.workMs?.mean} ms, wrapper ${r.wrapperMsPerFrame}), 1% low ${r.p1LowFps}, min ${r.minFps}, ready ${r.readyS} s${r.walk ? `, walk ${r.walk.settledFps}` : ""}`);
  }
  await ctx.close();
  const file = join(o.out, "measure.json");
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`measure: ${file}`);
  if (o.census) {
    const entries = result.urls.map((u) => ({ query: u.query, ready: u.ready, ...u.census }));
    writeFileSync(join(o.out, "census.json"), `${JSON.stringify({ schemaVersion: 1, run: o.run, gitSha: result.gitSha, urls: entries }, null, 2)}\n`);
    writeFileSync(join(o.out, "census.txt"), `${entries.map((e) => (e.draws ? censusText(e) : `# ${e.query}: census failed ${e.error}`)).join("\n\n")}\n`);
    console.log(`measure: ${join(o.out, "census.json")} and census.txt`);
  }
  await browser.close().catch(() => {});
  if (o.smoke) {
    const bad = result.urls.flatMap((u) => u.smoke?.problems ?? ["no smoke result"]);
    if (bad.length) { console.error(`SMOKE FAIL:\n  ${bad.join("\n  ")}`); process.exit(1); }
    console.log(`SMOKE PASS (ready ${result.urls[0].readyS} s, uncapped ${result.urls[0].uncappedFps} fps, luma ${result.urls[0].smoke.luma})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
