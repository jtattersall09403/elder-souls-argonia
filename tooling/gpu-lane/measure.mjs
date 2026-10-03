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
 *     [--pod "ssh -i <key> -p <port> root@<ip>"] [--maps <built site dir>]
 *
 * --pod: host sampler (host-sampler.mjs) beside workerGaps (a --spots run with a headline row needs --pod or --no-pod); --maps: hidden source maps (source-maps.mjs, A1).
 * --profile <s>: a CDP CPU profile of <s> seconds (during the walk when --walk is set, else after the
 * settle window); the .cpuprofile lands beside measure.json and its summary in the url entry.
 * --smoke: one spot (default spot a; with --spots, every spot of the file), 60 s; exits 1 and says why on the vsync cap, a ready gate over 40 s,
 * a black frame, a GPU/WebGL error or lost context, or a tab this run did not open. Run before a baseline.
 * --census: after the ready gate, a per-draw census, matrixAutoUpdate census, heap slope and a 30 s hitch
 * list with top functions; writes census.json and census.txt beside measure.json (WebGL renderer).
 * --diag relink,heap: inject probes/<name>.js before the page's scripts (also read from a `diag=` query
 * flag); the reports land in each url entry's `diag`.
 * --trace: a Chrome trace (timeline, frame, gpu, v8.gc, blink, viz) of the settle window and of the walk;
 * url<i>-<settled|walk>.trace.json beside measure.json, its long-frame classes (trace-frames.mjs) in `trace`.
 * --aim "yaw,pitch" (radians): aim the follow camera before the settle. --clean 1: HUD-free screenshots.
 * --spots <file>: ONE invocation measures every spot of the file (one line each: `<name> <?query> [--aim yaw,pitch]
 * [walk=<s>] [diag=<probes>] [trace] [trace-gpu] [memory-infra] [heapsample] [profile] [profile-walk]`, spots/perf10-c4.txt) in ONE tab (the same page navigates spot to spot, ready gate per spot), takes a
 * clean settled screenshot of each (<run dir>/<name>-settled.jpg) and writes summary.md: settled fps, p1Low,
 * uncapped, p1LowUncapped, max ms, over20, over33 and pass against --bar fps,p1low (default 83,69). A spot with a
 * probe token, a `diag=` query, or any global --diag/--trace/--profile/--census is a diagnosis row: pass reads `diag`
 * and it is not counted (README "Probe rules").
 * --leak <s> [--leak-every 15]: ONE long capture at the first spot: post-GC heap samples (HeapProfiler.collectGarbage)
 * every --leak-every s, the slope in MB/min and the top growing allocation sites (sampling heap profile, first
 * vs last post-GC sample) in leak.json / leak.txt. Snapshots are not diffed: the studio heap is over 1 GB,
 * past V8's string limit for a snapshot.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { BLACK_LUMA, FRAME_PROBES, INPAGE_PROBES, SPOT_A, censusText, diagList, foreignPages, heapFit, heapGrowth, heapTopAllocators, hitchList, meanLuma, smokeProblems, viewProblem } from "./checks.mjs";
import { parseHud } from "./hud-parse.mjs";
import { coreCorrelation, coreCorrelationText, hostSeries, hostSpikes, hostSummary, startHostSampler } from "./host-sampler.mjs";
import { loadSourceMaps, sourcePosition } from "./source-maps.mjs";
import { ANCHOR_PREFIX, GPU_TRACE_CATEGORIES, MEMORY_DUMP_CONFIG, MEMORY_INFRA_CATEGORY, TRACE_CATEGORIES, V8_TRACE_CATEGORIES, classifyFrames, isV8Event, gpuEventsInSpans, isGpuCategoryEvent, joinLinks, keepTraceEvent } from "./trace-frames.mjs";
import { CAPTURE_RATE, heapSlope, isDiagnosisSpot, parseBar, parseSpots, spotRows, stepsSeconds, summaryTable } from "./spots.mjs";

export { BLACK_LUMA, SPOT_A, diagList, foreignPages, hitchList, meanLuma, smokeProblems, viewProblem };

// Open harness defects (decision 0119): print the README rows so no pod job starts blind.
try { const _m = readFileSync(new URL("./README.md", import.meta.url), "utf8").match(/## Open harness defects[^\n]*\n([\s\S]*?)\n## /);
  if (_m && import.meta.url === `file://${process.argv[1]}`) console.error("OPEN HARNESS DEFECTS (fix before this run):\n" + _m[1].split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Defect")).join("\n"));
} catch { /* print only */ }
const repo = resolve(new URL("../..", import.meta.url).pathname);
const probePath = (n) => new URL(`./probes/${n}.js`, import.meta.url).pathname;

/** A --spots run with a headline (non-diagnosis) row records host steal/faults only with --pod: refused unless --no-pod is explicit. */
export function podRefusal(o) {
  if (!o.spots || o.pod || o.noPod) return null;
  const head = (o.spotList ?? []).filter((s) => !s.diagnosis).map((s) => s.name);
  return head.length ? `--spots run has headline rows (${head.join(", ")}) and no --pod: the host steal/fault sampler would be off. Pass --pod "ssh ..." or --no-pod` : null;
}

export function parseArgs(argv) {
  const o = { url: [], origin: "http://127.0.0.1:8099", base: null, renderer: "webgl", settle: 10, walk: 0, shots: false,
    cdp: "127.0.0.1:9222", run: null, out: null, width: 1280, height: 720, dpr: 1, readyTimeout: 150, profile: 0,
    smoke: false, noPod: false, census: false, trace: false, traceGpu: false, diag: "", aim: "", clean: "", spots: "", bar: "83,69", leak: 0, leakEvery: 15, pod: "", maps: "" };
  const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "");
    if (k === "shots" || k === "smoke" || k === "census" || k === "trace" || k === "no-pod") { o[camel(k)] = true; continue; }
    if (k === "trace-gpu") { o.traceGpu = o.trace = true; continue; }
    const v = argv[++i];
    if (v === undefined) throw new Error(`--${k} needs a value`);
    if (k === "url") o.url.push(v);
    else if (camel(k) in o) o[camel(k)] = typeof o[camel(k)] === "number" ? Number(v) : v;
    else throw new Error(`unknown option --${k}`);
  }
  if (o.smoke) { // one spot, 60 s: ready gate <= 40 s, 5 s settle, one screenshot for the black-frame check
    if (!o.url.length && !o.spots) o.url.push(`${SPOT_A}&rate=${CAPTURE_RATE}`); // the studio clock at the game's own speed (spots.mjs CAPTURE_RATE; paused without rate=)
    o.clean ||= "1";
    if (!o.spots) o.url.splice(1);
    o.run ??= "smoke"; o.readyTimeout = 40; o.settle = 5; o.shots = true;
  }
  if (o.spots) { // one line per spot; each spot carries its own aim and walk; HUD-free screenshots of every spot
    if (o.url.length) throw new Error("--spots replaces --url");
    o.spotList = parseSpots(readFileSync(resolve(o.spots), "utf8"));
    o.url = o.spotList.map((s) => s.query); o.shots = true; o.clean ||= "1";
  } else o.spotList = o.url.map((q, i) => ({ name: `url${i}`, query: q, aim: o.aim, steps: o.walk > 0 ? [{ w: o.walk }] : [] }));
  if (o.smoke) for (const sp of o.spotList) if (!/[?&]shadercheck=/.test(sp.query)) sp.query += "&shadercheck=1"; // smoke reads shader link errors; the studio default is off (perf)
  o.barParsed = parseBar(o.bar);
  if (!o.url.length || !o.run) throw new Error("need --run <name> and at least one --url <query> (or --spots <file>)");
  // Global probes (--diag) load on every spot; a spot's own probes (its `diag=` token or query flag) only on it.
  o.globalDiag = diagList(o.diag);
  for (const s of o.spotList) {
    const own = s.probes?.diag ?? [];
    // The navigated query carries the spot's own probes, so the guarded in-page probe wakes on this spot only.
    if (own.length && !/[?&]diag=/.test(s.query)) s.query = `${s.query}&diag=${own.join(",")}`;
    s.diagList = [...new Set([...o.globalDiag, ...diagList(own.join(","), [s.query])])];
    s.diagnosis = isDiagnosisSpot(s, { diag: o.globalDiag, trace: o.trace, profile: o.profile, census: o.census });
  }
  o.url = o.spotList.map((s) => s.query);
  o.diagList = [...new Set(o.spotList.flatMap((s) => s.diagList))];
  const refusal = podRefusal(o);
  if (refusal) throw new Error(refusal);
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

/**
 * The ready gate's triangle count: the exact whole-frame figure the HUD keeps (CharacterMode's
 * `__STUDIO_GPU_MS__.tris`), the HUD text only when that is absent. The text rounds to 0.1 M, so a small
 * interior read "tris 0.0M" and never got ready (perf-diag23 Q3).
 */
export function readyTris(exact, text) {
  if (typeof exact === "number" && Number.isFinite(exact)) return exact;
  const m = /(?:^|\n)tris ([\d.]+)M/.exec(text ?? "");
  return m ? Number(m[1]) * 1e6 : 0;
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
export function profileSummary(profile, top = 40, maps = null) {
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
    const src = sourcePosition(maps, cf.url, cf.lineNumber ?? -1, cf.columnNumber ?? -1);
    const at = `${file}:${(cf.lineNumber ?? -1) + 1}:${(cf.columnNumber ?? -1) + 1}`;
    const key = `${cf.functionName || "(anon)"} ${src ? `${src} (${at})` : at}`;
    fns.set(key, (fns.get(key) ?? 0) + ms);
    files.set(file, (files.get(file) ?? 0) + ms);
  }
  const rank = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, ms]) => ({ name: k, selfMs: r2(ms), pct: r2((100 * ms) / (total || 1)) }));
  return { totalMs: r2(total), topSelf: rank(fns, top), byFile: rank(files, 30) };
}

// Installed before the page's own scripts: a rAF timestamp recorder, the per-frame work-time
// wrapper and the GPU adapter read.
export function pageProbe() {
  const lane = { ts: [], frames: [], on: false, wrapMs: 0, lost: 0 };
  window.addEventListener("webglcontextlost", () => { lane.lost++; }, true);
  // A rejected promise nobody handles throws no pageerror: log it as a console error so consoleErrors carries it.
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    console.error(`unhandledrejection: ${String(r?.message ?? r).slice(0, 400)}${typeof r?.stack === "string" ? `\n${r.stack.split("\n").slice(1, 13).join("\n")}` : ""}`);
  });
  Object.defineProperty(window, "__GPU_LANE__", { value: lane });
  // Load timeline (decision 0120 "Measure before building"): every resource entry kept, a mark at the first rAF
  // frame, and renderer.info.programs length every 250 ms through the dev hook __RENDERER__ for the first 150 s.
  try { performance.setResourceTimingBufferSize(20000); } catch {}
  lane.programs = [];
  window.requestAnimationFrame(() => { try { performance.mark("es:load:first-present"); } catch {} });
  let progAt = -Infinity;
  const sampleProgs = (t) => { // from the rAF tick below: no timer of its own
    if (t > 150000 || t - progAt < 250) return;
    progAt = t;
    const n = window.__RENDERER__?.info?.programs?.length;
    if (n != null) lane.programs.push([Math.round(t), n]);
  };
  // Every rAF callback is wrapped; the callbacks of one frame share `stamp`.
  const now = performance.now.bind(performance);
  const raf = window.requestAnimationFrame.bind(window);
  const ch = new MessageChannel();
  let cur = null;
  ch.port1.onmessage = () => { if (cur) cur.msg = now(); };
  // The groundcover's cumulative refill timers (GroundcoverPerf.tf), snapshotted as each frame closes; the window
  // read differences consecutive snapshots into per-frame values (GC_COLUMNS order).
  const gcSnap = () => {
    const f = window.__STUDIO_GROUNDCOVER_DEBUG__?.perf?.tf;
    return f ? [f.useFrameMs, f.genMs, f.commitMs, f.swapMs, f.rangesMs, f.fillMs, f.allocMs, f.statsMs, f.renderMs,
      f.effectMs, f.cullMs, f.bytes, f.refills, f.drains, f.meshes, f.allocs] : null;
  };
  window.requestAnimationFrame = (cb) => raf((stamp) => {
    const w0 = now();
    if (!cur || cur.stamp !== stamp) {
      if (cur && lane.on) { cur.gc = gcSnap(); lane.frames.push(cur); }
      const g = window.__STUDIO_GPU_MS__;
      cur = { stamp, start: w0, end: w0, msg: 0, gpu: g?.supported ? g.avg : null };
      ch.port2.postMessage(0);
    }
    lane.wrapMs += now() - w0;
    try { cb(stamp); } finally { const c1 = now(); cur.end = c1; lane.wrapMs += now() - c1; }
  });
  const tick = (t) => { if (lane.on) lane.ts.push(t); sampleProgs(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  // about:blank between spots has an opaque origin: storage throws there (perf-diag9 E1)
  if (location.protocol.startsWith("http")) try { localStorage.setItem("es.hud.perfOpen", "1"); } catch {}
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
  const pn = await profileAnchor(page);
  await page.waitForTimeout(CENSUS_LEAD_MS);
  await page.evaluate(() => { const t0 = performance.now(); window.__HEAPS = []; window.__HEAPI = setInterval(() => window.__HEAPS.push([(performance.now() - t0) / 1000, (performance.memory?.usedJSHeapSize ?? NaN) / 1e6]), 500); });
  const w = await sample(page, seconds, async () => {
    const t0 = Date.now();
    await nodeWait(seconds * 1000);
    profile = (await cdp.send("Profiler.stop")).profile;
    offsetMs = profileOffset(profile, pn);
    return { elapsedMs: Date.now() - t0 };
  });
  const endMB = await heapMB();
  const fit = heapFit(await page.evaluate(() => { clearInterval(window.__HEAPI); return window.__HEAPS; }));
  if (wantHeap) heapSampling = (await cdp.send("HeapProfiler.stopSampling")).profile;
  await cdp.detach().catch(() => {});
  const hitches = hitchList(w.ts, profile, offsetMs);
  return { draws, matrix, hitchWindowS: seconds, frames: w.ts.length, hitches,
    heap: { startMB, endMB, seconds, slopeMBs: fit.mbPerS, fitSamples: fit.n, sampledGrowth: heapSampling ? heapGrowth(heapBefore, heapSampling) : null } };
}

export const CENSUS_LEAD_MS = 2000;

/**
 * --leak <s>: ONE long capture on the page already settled at the first spot. A post-GC heap reading
 * (HeapProfiler.collectGarbage, then Runtime.getHeapUsage) every o.leakEvery s; a sampling heap profile
 * started at the first reading and read at the last, so the sites listed are the ones whose retained
 * bytes grew between the first and last post-GC reading.
 */
async function runLeak(page, o) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  const reading = async (t0) => {
    await cdp.send("HeapProfiler.collectGarbage");
    return { tS: Math.round((Date.now() - t0) / 100) / 10, MB: Math.round(((await cdp.send("Runtime.getHeapUsage")).usedSize / 1e6) * 100) / 100 };
  };
  const t0 = Date.now();
  const first = await reading(t0);
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 32768 });
  const before = (await cdp.send("HeapProfiler.getSamplingProfile")).profile;
  const samples = [first];
  while (Date.now() - t0 < o.leak * 1000) {
    await page.waitForTimeout(Math.min(o.leakEvery * 1000, Math.max(0, o.leak * 1000 - (Date.now() - t0))));
    samples.push(await reading(t0));
  }
  await cdp.send("HeapProfiler.collectGarbage");
  const after = (await cdp.send("HeapProfiler.getSamplingProfile")).profile;
  await cdp.send("HeapProfiler.stopSampling").catch(() => {});
  await cdp.detach().catch(() => {});
  return { seconds: o.leak, everyS: o.leakEvery, samples, slopeMBPerMin: heapSlope(samples),
    grewMB: r2(samples[samples.length - 1].MB - samples[0].MB), topGrowing: heapGrowth(before, after, 20) };
}

export function leakText(l) {
  return [`leak capture ${l.seconds} s, post-GC heap every ${l.everyS} s: ${l.samples.map((s) => `${s.tS}s ${s.MB} MB`).join(", ")}`,
    `slope ${l.slopeMBPerMin} MB/min (grew ${l.grewMB} MB)`, "top growing allocation sites (retained MB, first to last):",
    ...l.topGrowing.map((g) => `  ${g.MB}\t${g.name}`)].join("\n");
}

/** Post-GC JS heap: HeapProfiler.collectGarbage, then Runtime.getHeapUsage. Call only outside a stats window. */
async function postGcHeap(page, hl) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("HeapProfiler.enable");
    await hl.wrap("collectGarbage", () => cdp.send("HeapProfiler.collectGarbage"));
    return { postGcMB: r2((await cdp.send("Runtime.getHeapUsage")).usedSize / 1e6) };
  } finally { await cdp.detach().catch(() => {}); }
}

/** Start a Chrome trace on the page; the returned stop() writes <file> and returns the long-frame classes. */
async function startTrace(page, file, { gpu = false, memoryInfra = false, v8 = false } = {}, hl) {
  const cdp = await page.context().newCDPSession(page);
  const ev = [], gpuEv = [], v8Ev = [];
  cdp.on("Tracing.dataCollected", (d) => { for (const e of d.value) { if (v8 && isV8Event(e)) v8Ev.push(e); if (keepTraceEvent(e)) ev.push(e); else if (gpu && isGpuCategoryEvent(e)) gpuEv.push(e); } });
  const done = new Promise((r) => cdp.on("Tracing.tracingComplete", r));
  const includedCategories = [...TRACE_CATEGORIES, ...(gpu ? GPU_TRACE_CATEGORIES : []), ...(memoryInfra ? [MEMORY_INFRA_CATEGORY] : []), ...(v8 ? V8_TRACE_CATEGORIES : [])];
  // memory-infra: Chrome dumps on its own timer (MEMORY_DUMP_CONFIG), set here, before the window opens.
  await hl.wrap("trace:start", () => cdp.send("Tracing.start", { traceConfig: { includedCategories, recordMode: "recordContinuously",
    ...(memoryInfra ? { memoryDumpConfig: MEMORY_DUMP_CONFIG } : {}) }, transferMode: "ReportEvents" }));
  // The anchor fires inside one rAF, once tracing has started, so it lands on the renderer main thread.
  await hl.wrap("evaluate:trace-anchor", () => page.evaluate((p) => new Promise((r) => requestAnimationFrame(() => { console.timeStamp(p + performance.now()); r(); })), ANCHOR_PREFIX).catch(() => {}));
  return async (profileFile, windowEndPageMs = null) => {
    await hl.wrap("trace:stop", async () => { await cdp.send("Tracing.end"); await done; });
    await cdp.detach().catch(() => {});
    const profile = profileFile ? JSON.parse(readFileSync(profileFile, "utf8")) : null;
    const res = classifyFrames(gpu ? [...ev, ...gpuEv] : ev, { profile, windowEndPageMs, gpuAnyDur: gpu, v8Events: v8 ? v8Ev : null });
    // --trace-gpu: GPU-process events of any duration are written only inside long frames, to keep the file small.
    const gpuPids = new Set(ev.filter((e) => e.ph === "M" && e.name === "process_name" && /GPU/i.test(e.args?.name ?? "")).map((e) => e.pid));
    const extra = gpu ? gpuEventsInSpans(gpuEv, gpuPids, (res.long ?? []).map((f) => f.spanUs)) : [];
    writeFileSync(file, JSON.stringify({ traceEvents: [...ev, ...extra] }));
    return { file, events: ev.length + extra.length, ...res };
  };
}

/**
 * `heapsample` spot token: a HeapProfiler sampling profile over the walk window, objects collected by major and minor
 * GC included, so it names the allocation churn behind a GC frame. Started before the window opens; the returned
 * stop(file) runs after it closes, writes the profile and returns its top 25 allocators by allocated MB.
 */
async function startHeapSample(page, hl, maps = null) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await hl.wrap("heapsample:start", () => cdp.send("HeapProfiler.startSampling", { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }));
  return async (file) => {
    const { profile } = await hl.wrap("heapsample:stop", () => cdp.send("HeapProfiler.stopSampling"));
    await cdp.detach().catch(() => {});
    writeFileSync(file, JSON.stringify(profile));
    return { file, topAllocated: heapTopAllocators(profile, 25, maps) };
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

const nodeWait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One stats window. The page records the whole window into its own buffer and closes it with its own
 * timer; the harness waits on the Node side and reads the buffer once after the window ended, so no
 * CDP round-trip (a 45-52 ms main-thread message) lands inside it (perf-diag4 D2). `during` (the CPU
 * profile, the driver) may only send its start/stop at the window's edges or the scenario's own input.
 */
/** Every capture frame (settled, walk, hold) goes through here: --clean hides the HUD overlays (fixed/absolute
 * elements without a canvas) for the screenshot only. */
export async function cleanShot(page, p, clean) {
  if (clean) await page.evaluate(() => { window.__hid = [...document.querySelectorAll("body *")].filter((e) => !e.querySelector("canvas") && e.tagName !== "CANVAS" && ["fixed", "absolute"].includes(getComputedStyle(e).position)); window.__hid.forEach((e) => { e.dataset.v = e.style.visibility; e.style.visibility = "hidden"; }); }).catch(() => {});
  await page.screenshot({ path: p, type: "jpeg", quality: 75 }).catch(() => {});
  if (clean) await page.evaluate(() => window.__hid?.forEach((e) => { e.style.visibility = e.dataset.v; })).catch(() => {});
}
/** Hold frame name from its time after the ready gate: whole seconds `hold-005s`, else milliseconds `hold-0200ms`. */
export function holdName(tS) {
  const ms = Math.round(tS * 1000);
  return ms % 1000 === 0 ? `hold-${String(ms / 1000).padStart(3, "0")}s` : `hold-${String(ms).padStart(4, "0")}ms`;
}
/** hold = {s, every}: one cleanShot every `every` s from tReady until tReady + s; returns the paths. */
export async function takeHoldShots(page, hold, pathAt, clean, tReady = Date.now(), hl = harnessLogger(), wait = nodeWait) {
  const shots = [];
  for (let k = 0; Date.now() - tReady < hold.s * 1000; k++) {
    const p = pathAt(Math.round(k * hold.every * 1000) / 1000);
    await hl.wrap("screenshot:hold", () => cleanShot(page, p, clean));
    shots.push(p);
    await wait(Math.max(0, Math.min(tReady + (k + 1) * hold.every * 1000, tReady + hold.s * 1000) - Date.now()));
  }
  return shots;
}
export async function sample(page, seconds, during, wait = nodeWait, hl = harnessLogger(), schedule = null) {
  // The heartbeat Worker ticks every 5 ms on its own thread and keeps its gaps over 20 ms (page time) to itself
  // until read once after the window: a gap the main thread AND the worker both saw is a process/host stall.
  // `schedule` (stepsSchedule) is the walk's route: page timers play it from the window open, W as a synthetic
  // KeyboardEvent on window (input.ts reads event.code), turns through aimCamera; `route` lists what fired when.
  await hl.wrap("evaluate:window-open", () => page.evaluate(([ms, sched]) => {
    const l = window.__GPU_LANE__; l.ts = []; l.frames = []; l.wrapMs = 0; l.on = true;
    l.route = sched ? { done: false, fired: [] } : null;
    if (sched) {
      const s0 = performance.now(), route = l.route;
      sched.forEach((e, i) => setTimeout(() => {
        if (e.k === "aim") window.__STUDIO_CHARACTER_DEBUG__?.aimCamera(e.yaw);
        else window.dispatchEvent(new KeyboardEvent(e.down ? "keydown" : "keyup", { key: "w", code: "KeyW", bubbles: true }));
        route.fired.push([e.k, e.k === "aim" ? e.yaw : e.down, Math.round(performance.now() - s0)]);
        if (i === sched.length - 1) route.done = true;
      }, e.at));
    }
    l.hb = typeof Worker === "function" ? new Worker(URL.createObjectURL(new Blob([`let last = performance.now(); const gaps = [];
      const id = setInterval(() => { const n = performance.now(); if (n - last > 20) gaps.push([last + performance.timeOrigin, n - last]); last = n; }, 5);
      onmessage = () => { clearInterval(id); postMessage(gaps); };`]))) : null;
    setTimeout(() => { l.on = false; }, ms);
  }, [seconds * 1000, schedule]));
  const t0 = Date.now();
  const extra = during ? await during() : null;
  await wait(Math.max(0, seconds * 1000 - (Date.now() - t0)) + 150);
  const raw = await hl.wrap("evaluate:window-read", () => page.evaluate(async () => {
    const l = window.__GPU_LANE__;
    const hb = l.hb; l.hb = null;
    const workerGaps = hb ? await new Promise((r) => { hb.onmessage = (e) => { hb.terminate(); r(e.data.map(([s, ms]) => [s - performance.timeOrigin, ms])); }; hb.postMessage(0); }) : null;
    return { ts: l.ts, wrapMs: l.wrapMs, workerGaps, route: l.route, frames: l.frames.map((f) => ({ t: f.stamp, work: Math.max(f.end, f.msg) - f.start, gpu: f.gpu, gcCum: f.gc })) };
  }));
  for (let i = 0; i < raw.frames.length; i++) raw.frames[i].dt = i ? raw.frames[i].t - raw.frames[i - 1].t : 0;
  gcDeltas(raw.frames);
  const workerGaps = raw.workerGaps?.map(([s, ms]) => [r2(s), r2(ms)]) ?? null;
  return { ts: raw.ts, extra, route: raw.route ?? null, series: frameSeries(raw.frames), workerGaps,
    work: { ...workStats(raw.frames), wrapperMsPerFrame: raw.frames.length ? r2(raw.wrapMs / raw.frames.length) : null } };
}

/** Order of pageProbe's gcSnap array: the cumulative GroundcoverPerf.tf fields as series columns. */
export const GC_SNAP = ["gcUseFrame", "gcGen", "gcCommit", "gcSwap", "gcRanges", "gcFill", "gcAlloc", "gcStats", "gcRender",
  "gcEffect", "gcCull", "gcBytes", "refills", "drains", "gcMeshes", "gcAllocs"];
/** The ms sub-timers, and those that are not nested in another (their sum is the groundcover's main-thread ms). */
export const GC_MS = ["gcUseFrame", "gcGen", "gcCommit", "gcSwap", "gcRanges", "gcFill", "gcAlloc", "gcStats", "gcRender", "gcEffect", "gcCull"];
export const GC_TOP = ["gcUseFrame", "gcFill", "gcStats", "gcRender", "gcEffect"];
/** Per-frame series columns from the groundcover: GC_MS, then gcBytes, gcRefill (1 a fill started, 2 a commit
 * drain finished: the fill swapped in), gcMeshes, gcAllocs. */
export const GC_COLUMNS = [...GC_MS, "gcBytes", "gcRefill", "gcMeshes", "gcAllocs"];

/** In place: each frame's `gcCum` snapshot (or null) becomes `gc` {column: this frame's value} against the previous
 * frame's snapshot; the first frame and a frame with no snapshot get null. */
export function gcDeltas(frames) {
  let prev = null;
  for (const f of frames) {
    const c = f.gcCum ?? null;
    delete f.gcCum;
    f.gc = null;
    if (c && prev) {
      const d = Object.fromEntries(GC_SNAP.map((k, i) => [k, c[i] - prev[i]]));
      f.gc = { ...Object.fromEntries(GC_MS.map((k) => [k, d[k]])), gcBytes: d.gcBytes,
        gcRefill: (d.refills > 0 ? 1 : 0) | (d.drains > 0 ? 2 : 0), gcMeshes: d.gcMeshes, gcAllocs: d.gcAllocs };
    }
    prev = c;
  }
  return frames;
}

/** The per-frame series of a stats window as compact column arrays (page ms, 0.01 ms): {t, dt, work, gpu} plus the
 * GC_COLUMNS when the page published groundcover timers (null per frame where it did not). */
export function frameSeries(frames) {
  const s = { t: frames.map((f) => r2(f.t)), dt: frames.map((f) => r2(f.dt)), work: frames.map((f) => r2(f.work)), gpu: frames.map((f) => f.gpu ?? null) };
  if (frames.some((f) => f.gc)) for (const k of GC_COLUMNS) s[k] = frames.map((f) => (f.gc ? r2(f.gc[k]) : null));
  return s;
}

/**
 * The groundcover digest of a window series: `frames` lists every frame with work >= minWork ms, its GC_COLUMNS
 * values (zeros dropped), `gcMs` (the sum of the non-nested GC_TOP timers) and `otherMs` = work - gcMs; `totals` sums
 * each column over the window. Null when the series carries no groundcover columns.
 */
export function gcFramesDigest(series, minWork = 12) {
  if (!series?.gcGen) return null;
  const totals = Object.fromEntries(GC_COLUMNS.map((k) => [k, 0]));
  const frames = [];
  for (let i = 0; i < series.t.length; i++) {
    if (series.gcGen[i] == null) continue;
    for (const k of GC_COLUMNS) totals[k] += k === "gcRefill" ? (series[k][i] & 1) : series[k][i];
    if (!(series.work[i] >= minWork)) continue;
    const gc = Object.fromEntries(GC_COLUMNS.filter((k) => series[k][i]).map((k) => [k, series[k][i]]));
    const gcMs = r2(GC_TOP.reduce((a, k) => a + series[k][i], 0));
    frames.push({ t: series.t[i], work: series.work[i], gcMs, otherMs: r2(series.work[i] - gcMs), gc });
  }
  for (const k of GC_COLUMNS) totals[k] = r2(totals[k]);
  return { minWork, frames, totals };
}

/** summary.md lines for one window's gcFrames digest. */
export function gcFramesText(label, d) {
  if (!d) return [];
  const tot = Object.entries(d.totals).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ");
  return [`- ${label}: ${d.frames.length} frames >= ${d.minWork} ms; totals ${tot || "0"} (gcRefill = fills started)`,
    ...d.frames.map((f) => `  - t ${f.t} work ${f.work} gc ${f.gcMs} other ${f.otherMs}: ${Object.entries(f.gc).map(([k, v]) => `${k} ${v}`).join(", ")}`)];
}

/**
 * Every harness CDP/page action of one spot, timed on the Node clock and mapped to page time through the page's
 * performance.timeOrigin (`origin`, epoch ms, read after the goto; Chrome and Node share the host clock).
 * wrap(action, fn) runs fn and logs it; entries() gives [{action, t (page ms), ms}].
 */
export function harnessLogger(nowMs = Date.now) {
  const raw = [];
  const hl = {
    origin: null,
    async wrap(action, fn) { const a = nowMs(); try { return await fn(); } finally { raw.push([action, a, nowMs()]); } },
    entries: () => raw.map(([action, a, b]) => ({ action, t: hl.origin == null ? null : r2(a - hl.origin), ms: b - a })),
  };
  return hl;
}

/**
 * Per hitch over `overMs` (dt; the gap is [t - dt, t] page ms): the nearest harness action within `nearMs` of the gap
 * ({action, t, dMs}, null when none) and whether the heartbeat worker saw a gap overlapping it (null: no worker data).
 * `hostSpikes` ([start, end] page ms from host-sampler.mjs, null without --pod): `cause` is "host" for a worker-seen
 * gap overlapping a pod steal/major-fault spike, "process" for any other worker-seen gap, "main" when the worker ran.
 */
export function hitchContext(hitches, harnessLog, workerGaps, hostSpikes = null, overMs = 33, nearMs = 500) {
  return hitches.filter((h) => h.dt > overMs).map((h) => {
    const a = h.t - h.dt, b = h.t;
    let harness = null;
    for (const e of harnessLog) {
      if (e.t == null) continue;
      const d = Math.max(0, e.t - b, a - (e.t + e.ms));
      if (d <= nearMs && (!harness || d < harness.dMs)) harness = { action: e.action, t: e.t, dMs: r2(d) };
    }
    const workerGap = workerGaps == null ? null : workerGaps.some(([s, ms]) => s < b && s + ms > a);
    const hostSpike = hostSpikes == null ? null : hostSpikes.some(([s, e]) => s < b && e > a);
    const cause = workerGap == null ? null : !workerGap ? "main" : hostSpike ? "host" : "process";
    return { t: h.t, dt: h.dt, work: h.work, harness, workerGap, hostSpike, cause };
  });
}

/** summary.md lines for one spot's hitch contexts ({settled, walk} -> lists). */
export function hitchContextText(name, ctx) {
  return Object.entries(ctx).filter(([, l]) => l?.length).flatMap(([phase, l]) => l.map((h) =>
    `- ${name} ${phase}: ${h.dt} ms at ${h.t} (work ${h.work}); harness ${h.harness ? `${h.harness.action} at ${h.harness.t} (${h.harness.dMs} ms away)` : "none within 500 ms"}; worker gap ${h.workerGap == null ? "n/a" : h.workerGap ? "yes" : "no"}; host spike ${h.hostSpike == null ? "n/a" : h.hostSpike ? "yes" : "no"}; cause ${h.cause ?? "n/a"}`));
}

/** Starts a CDP CPU profile (sampling `intervalUs`); the returned stop(file) ends it, writes the
 * .cpuprofile and returns the raw profile with the file. Every CDP send is at the call or the stop. */
/**
 * Clock anchor for a running CPU profile (perf10 F36): the page runs a named busy loop for ANCHOR_BUSY_MS and returns
 * the performance.now() it began at; profileOffset finds the loop's first sample, so the page-to-profile mapping is
 * read off the samples' own clock. `profile.startTime/1000 - performance.now()` read after Profiler.start was ~185 ms
 * off (tooling/.reports/16k/walk10/perf-diag18-q.md "Measurement defect").
 */
export const ANCHOR_FN = "__gpuLaneProfileAnchor__";
export const ANCHOR_BUSY_MS = 5;
function profileAnchor(page) {
  return page.evaluate(`(function ${ANCHOR_FN}() { const t = performance.now(); while (performance.now() - t < ${ANCHOR_BUSY_MS}); return t; })()`);
}

/** offsetMs (profile ms - page ms) from the anchor loop's first sample; startTime when the loop was never sampled. */
export function profileOffset(profile, anchorPn) {
  const ids = new Set(profile.nodes.filter((n) => n.callFrame?.functionName === ANCHOR_FN).map((n) => n.id));
  const { samples = [], timeDeltas = [] } = profile;
  let t = profile.startTime;
  for (let i = 0; i < samples.length; i++) {
    t += timeDeltas[i] ?? 0;
    if (ids.has(samples[i])) return t / 1000 - anchorPn;
  }
  return profile.startTime / 1000 - anchorPn;
}

async function startCpuProfile(page, intervalUs, hl) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: intervalUs });
  await hl.wrap("profiler:start", () => cdp.send("Profiler.start"));
  return async (file) => {
    const { profile } = await hl.wrap("profiler:stop", () => cdp.send("Profiler.stop"));
    await cdp.detach().catch(() => {});
    writeFileSync(file, JSON.stringify(profile));
    return profile;
  };
}

async function cpuProfile(page, o, seconds, tag, name, hl) {
  const t0 = Date.now();
  const stop = await startCpuProfile(page, 500, hl);
  await nodeWait(seconds * 1000);
  const file = join(o.out, `${name}-${tag}.cpuprofile`);
  const profile = await stop(file);
  return { elapsedMs: Date.now() - t0, file, seconds, ...profileSummary(profile, 40, o.sourceMaps) };
}

/**
 * `profile-walk` spikes: for every frame of a window series ({t, work} page ms) whose rAF work is >= minWork ms, the top
 * `top` self-time functions of the profile samples inside the frame's span [t_i, t_i+1) (last frame: t + work), as
 * {t, work, top: [{name, at, ms}]}. `offsetMs` = profileOffset(profile, anchor page ms), the mapping hitchList uses.
 */
export function profileSpikes(profile, offsetMs, series, { minWork = 12, top = 8 } = {}, maps = null) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const { samples = [], timeDeltas = [] } = profile;
  const smp = [];
  let t = profile.startTime / 1000 - offsetMs;
  for (let i = 0; i < samples.length; i++) {
    t += (timeDeltas[i] ?? 0) / 1000;
    smp.push({ t, id: samples[i], dt: (timeDeltas[i + 1] ?? 0) / 1000 });
  }
  const out = [];
  for (let i = 0; i < series.t.length; i++) {
    if (!(series.work[i] >= minWork)) continue;
    const a = series.t[i], b = i + 1 < series.t.length ? series.t[i + 1] : a + series.work[i];
    const self = new Map();
    for (const s of smp) {
      if (s.t < a || s.t >= b) continue;
      const cf = byId.get(s.id)?.callFrame ?? {};
      const key = `${cf.functionName || "(anon)"}\t${sourcePosition(maps, cf.url, cf.lineNumber ?? -1, cf.columnNumber ?? -1) ?? `${cf.url || "(native)"}:${(cf.lineNumber ?? -1) + 1}`}`;
      self.set(key, (self.get(key) ?? 0) + s.dt);
    }
    out.push({ t: r2(a), work: r2(series.work[i]), top: [...self].sort((x, y) => y[1] - x[1]).slice(0, top).map(([k, ms]) => {
      const [name, at] = k.split("\t");
      return { name, at, ms: r2(ms) };
    }) });
  }
  return out;
}

/** `profile` spot token: the top `top` functions by self time over a stats window, as
 * {name, at: "<url>:<line>", msPerFrame} with `frames` the window's frame count. */
export function profileTopPerFrame(profile, frames, top = 25, maps = null) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const { samples = [], timeDeltas = [] } = profile;
  for (let i = 0; i < samples.length; i++) {
    const cf = byId.get(samples[i])?.callFrame ?? {};
    const key = `${cf.functionName || "(anon)"}\t${sourcePosition(maps, cf.url, cf.lineNumber ?? -1, cf.columnNumber ?? -1) ?? `${cf.url || "(native)"}:${(cf.lineNumber ?? -1) + 1}`}`;
    self.set(key, (self.get(key) ?? 0) + (timeDeltas[i + 1] ?? 0) / 1000);
  }
  const n = Math.max(1, frames);
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, ms]) => {
    const [name, at] = k.split("\t");
    return { name, at, msPerFrame: Math.round((ms / n) * 1000) / 1000 };
  });
}

/**
 * The in-page route of a `steps=` sequence: [{at (ms from the window open), k: "aim", yaw} | {at, k: "key", down}].
 * W goes down at the first w segment and up at the end. aimCamera is absolute, so a sequence with a yaw step first
 * sets the camera to baseYaw (the spot's --aim yaw, else 0) and each yaw step sets baseYaw + the running sum; the
 * character turns with the camera. sample() hands it to the page as the window opens and page timers play it (no
 * CDP call or page.evaluate inside the window, README "Probe rules" 4).
 */
export function stepsSchedule(steps, baseYaw = 0) {
  const out = [];
  let yaw = baseYaw, t = 0, held = false;
  if (steps.some((s) => s.yaw !== undefined)) out.push({ at: 0, k: "aim", yaw });
  for (const s of steps) {
    if (s.yaw !== undefined) { yaw += s.yaw; out.push({ at: t, k: "aim", yaw }); continue; }
    if (!held) { out.push({ at: t, k: "key", down: true }); held = true; }
    t += s.w * 1000;
  }
  if (held) out.push({ at: t, k: "key", down: false });
  return out;
}

/**
 * `loadTimeline` of a spot from one in-page read just after the harness ready gate ({nowMs, resources [[url, startMs,
 * responseEndMs, encodedBytes, initiatorType]], marks [[name, ms]], programs [[ms, n]]}); every time is seconds from
 * navigation. readyS = the page's warm gate (`es:load:warm-gate` mark, else the harness gate); completeS = the
 * moment the harness gate (`isReady`: 20 s floor, HUD tris within 2 %, no "Loading" line, CPU pre/gc quiet; it reads
 * no build queue) passed; sceneCompleteS = the last sign of the scene still arriving: max(last resource responseEnd,
 * last program-count change, `es:load:settlement-first-build`, last `es:load:*` mark); kits = URLs containing
 * `/kits/`; `requests` = per-URL rows (path, initiatorType, startS, endS, MB) for the 40 largest plus every JSON
 * request, by start time.
 */
export function buildLoadTimeline({ nowMs, resources = [], marks = [], programs = [] }) {
  const s = (ms) => (ms == null ? null : Math.round(ms) / 1000);
  const mb = (b) => Math.round((b / 1048576) * 100) / 100;
  const mark = (n) => marks.find(([m]) => m === n)?.[1] ?? null;
  const readyMs = mark("es:load:warm-gate") ?? nowMs;
  const sum = (rs) => ({ requests: rs.length, MB: mb(rs.reduce((a, r) => a + (r[3] || 0), 0)),
    firstStartS: rs.length ? s(Math.min(...rs.map((r) => r[1]))) : null, lastEndS: rs.length ? s(Math.max(...rs.map((r) => r[2]))) : null });
  const kits = resources.filter((r) => r[0].includes("/kits/"));
  const loadMarks = marks.filter(([n]) => n.startsWith("es:load:"));
  let programsChangedMs = null;
  programs.forEach(([t, n], i) => { if (i === 0 || n !== programs[i - 1][1]) programsChangedMs = t; });
  const sceneCompleteMs = Math.max(0, ...resources.map((r) => r[2]), ...loadMarks.map(([, t]) => t), programsChangedMs ?? 0);
  const row = (r) => ({ url: new URL(r[0], "http://x").pathname, initiatorType: r[4] ?? "", startS: s(r[1]), endS: s(r[2]), MB: mb(r[3] || 0) });
  const isJson = (r) => /\.json(\?|$)/.test(r[0]);
  const keep = new Set([...[...resources].sort((a, b) => (b[3] || 0) - (a[3] || 0)).slice(0, 40), ...resources.filter(isJson)]);
  return { firstPresentS: s(mark("es:load:first-present")), readyS: s(readyMs), completeS: s(nowMs), sceneCompleteS: s(sceneCompleteMs),
    requests: [...keep].sort((a, b) => a[1] - b[1]).map(row),
    kits: sum(kits), all: sum(resources), kitMBBeforeReady: mb(kits.filter((r) => r[2] <= readyMs).reduce((a, r) => a + (r[3] || 0), 0)),
    marks: marks.filter(([n]) => n.startsWith("es:load:")).map(([stage, t]) => ({ stage: stage.slice(8), t: s(t) })),
    programs: programs.map(([t, n]) => [s(t), n]) };
}

/** One summary.md line for a spot's loadTimeline. */
export function loadTimelineText(name, l, cold = false) {
  const tag = `${name}${cold ? " (cold)" : ""}`;
  if (!l || l.error) return `${tag}: no load timeline${l?.error ? ` (${l.error})` : ""}`;
  const k = l.kits, a = l.all;
  return `${tag}: first present ${l.firstPresentS}, ready ${l.readyS}, complete ${l.completeS}, scene complete ${l.sceneCompleteS}; kits ${k.requests} req ${k.MB} MB ${k.firstStartS}-${k.lastEndS} (${l.kitMBBeforeReady} MB before ready); all ${a.requests} req ${a.MB} MB; programs ${l.programs.at(-1)?.[1] ?? "n/a"}; ${l.marks.map((m) => `${m.stage} ${m.t}`).join(", ")}`;
}

/** A pageerror entry with its stack kept (perf-diag9 E2: the message alone could not name the throwing caller). */
export function pageErrorText(e) {
  const msg = String(e).slice(0, 400);
  const stack = typeof e?.stack === "string" ? e.stack.split("\n").filter((l) => /^\s+at /.test(l)).slice(0, 12).join("\n") : "";
  return stack ? `pageerror: ${msg}\n${stack}` : `pageerror: ${msg}`;
}

async function measureUrl(page, ctx, o, spot, idx, own, browser) {
  const { query, name } = spot;
  const consoleErrors = [], http404s = [];
  const onConsole = (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 400)); };
  const onPageError = (e) => consoleErrors.push(pageErrorText(e));
  const onResponse = (r) => { if (r.status() === 404) http404s.push(r.url()); };
  // Requests still open (perf10 c12: the resource list shows only finished ones, so a hung fetch was invisible).
  const open = new Map();
  const onRequest = (r) => open.set(r, Date.now());
  const onRequestDone = (r) => open.delete(r);
  page.on("console", onConsole); page.on("pageerror", onPageError); page.on("response", onResponse);
  page.on("request", onRequest); page.on("requestfinished", onRequestDone); page.on("requestfailed", onRequestDone);
  const inFlight = () => [...open].map(([r, t]) => [r.url().slice(0, 200), Math.round((Date.now() - t) / 100) / 10]).sort((a, b) => b[1] - a[1]);
  const expectedView = new URLSearchParams(query.startsWith("?") ? query : `?${query}`).get("view");
  let viewStall = null;
  const url = `${o.origin}${o.base}${query.startsWith("?") ? query : `?${query}`}`;
  if (idx > 0) await page.goto("about:blank").catch(() => {}); // drop the previous world (and its GPU memory) before the next spot
  // `cold` spot token: an empty HTTP cache before the navigation, as the owner's first visit.
  if (spot.cold) { const cdp = await ctx.newCDPSession(page); await cdp.send("Network.clearBrowserCache"); await cdp.detach().catch(() => {}); }
  const hl = harnessLogger();
  const t0 = Date.now();
  const loaded = await hl.wrap("goto", () => page.goto(url, { timeout: o.readyTimeout * 1000, waitUntil: "load" })).then(() => true)
    .catch((e) => { consoleErrors.push(`goto: ${e}`); return false; });
  if (!loaded) throw new Error(`site not reachable at ${url} (is serve.mjs running on the pod?)`);
  hl.origin = await page.evaluate(() => performance.timeOrigin).catch(() => null);
  const host = o.pod ? startHostSampler(o.pod) : null; // --pod: steal/major faults on the pod beside workerGaps (S1)
  // Ready: see isReady (the world has stopped arriving; streaming never lets the network go quiet).
  let ready = false;
  const samples = [];
  while (Date.now() - t0 < o.readyTimeout * 1000) {
    const s = await hl.wrap("evaluate:ready-poll", () => page.evaluate(() => {
      const text = document.body.innerText;
      const el = document.querySelector("[data-es-view]");
      const marks = performance.getEntriesByType("mark").filter((e) => e.name.startsWith("es:load:"));
      const v = { view: el?.getAttribute("data-es-view") ?? null, shown: !!el?.checkVisibility?.(), canvas: !!el?.querySelector("canvas"),
        lastMark: marks.length ? marks[marks.length - 1].name : null };
      return { fps: window.__STUDIO_FPS__ ?? 0, exact: window.__STUDIO_GPU_MS__?.tris, loading: text.includes("Loading"), text, v };
    })).catch(() => ({ fps: 0, exact: undefined, loading: true, text: "", v: null }));
    const { text, v, exact, ...polled } = s;
    const rest = { ...polled, tris: readyTris(exact, text) };
    // Fail fast when the page is not in the view its URL asked for (checks.mjs viewProblem names the stage).
    viewStall = v ? viewProblem({ ...v, inFlight: inFlight() }, expectedView, Math.round((Date.now() - t0) / 100) / 10) : null;
    if (viewStall) { consoleErrors.push(viewStall); break; }
    const st = parseHud(text).cpuByStage;
    samples.push({ t: Date.now(), ...rest, pre: st ? (st.pre?.avg ?? 0) : null, gc: st ? (st.gc?.avg ?? 0) : null });
    if (isReady(samples, { startT: t0 })) { ready = true; break; }
    await page.waitForTimeout(500);
  }
  const readyS = Math.round((Date.now() - t0) / 100) / 10;
  const tReady = Date.now();
  const inFlightAtReady = inFlight().slice(0, 20);
  const loadTimeline = await hl.wrap("evaluate:load-timeline", () => page.evaluate(() => ({
    nowMs: performance.now(),
    resources: performance.getEntriesByType("resource").map((e) => [e.name, e.startTime, e.responseEnd, e.encodedBodySize, e.initiatorType]),
    marks: performance.getEntriesByType("mark").map((e) => [e.name, e.startTime]),
    programs: window.__GPU_LANE__?.programs ?? [] }))).then(buildLoadTimeline).catch((e) => ({ error: String(e) }));
  // --aim "yaw,pitch" (radians): points the follow camera via __STUDIO_CHARACTER_DEBUG__ before the settle.
  if (spot.aim) {
    const [yaw, pitch] = spot.aim.split(",").map(Number);
    await hl.wrap("evaluate:aim", () => page.evaluate(([y, p]) => window.__STUDIO_CHARACTER_DEBUG__?.aimCamera(y, p), [yaw, pitch])).catch(() => {});
    await page.waitForTimeout(1500);
  }
  // `hold=<s>[/<every>]` spot token, after the aim so every hold frame has the settled shot's camera: the settle
  // window opens <s> s after the ready gate; until then one cleanShot every <every> s (holdName), before any stats window.
  const holdShots = spot.hold ? await takeHoldShots(page, spot.hold, (t) => join(o.out, `${name}-${holdName(t)}.jpg`), o.clean, tReady, hl) : [];
  const traces = {};
  const P = spot.probes ?? {};
  const doTrace = o.trace || !!P.trace, traceOpt = { gpu: o.traceGpu || !!P.traceGpu, memoryInfra: !!P.memoryInfra, v8: !!P.traceV8 };
  const stopSettleTrace = doTrace ? await startTrace(page, join(o.out, `${name}-settled.trace.json`), traceOpt, hl) : null;
  // `profile` token: started before the settled window, stopped after it (no CDP inside it).
  const stopSettleProfile = P.profile ? await startCpuProfile(page, 200, hl) : null;
  const settle = await sample(page, o.settle, null, nodeWait, hl);
  let profile = null;
  if (stopSettleProfile) {
    const file = join(o.out, `${name}-settled.cpuprofile`);
    profile = { file, intervalUs: 200, frames: settle.ts.length,
      topSelfPerFrame: profileTopPerFrame(await stopSettleProfile(file), settle.ts.length, 25, o.sourceMaps) };
  }
  if (stopSettleTrace) traces.settled = await stopSettleTrace(null, settle.ts.at(-1));
  const stats = { ...frameStats(settle.ts), ...settle.work };
  const walkS = stepsSeconds(spot.steps);
  if (!profile && o.profile > 0 && !(walkS > 0)) profile = await cpuProfile(page, o, o.profile, "settled", name, hl);
  const hudText = await hl.wrap("evaluate:hud", () => page.evaluate(() => document.body.innerText)).catch(() => "");
  const hud = parseHud(hudText);
  const info = await page.evaluate(() => {
    const g = window.__STUDIO_GPU_MS__;
    const m = performance.memory;
    return { tris: g?.tris ?? null, calls: g?.calls ?? null,
      memory: m ? { usedJSHeapSize: m.usedJSHeapSize, totalJSHeapSize: m.totalJSHeapSize, jsHeapSizeLimit: m.jsHeapSizeLimit } : null };
  }).catch(() => ({}));
  const screenshots = [...holdShots];
  const shot = async (tag) => {
    if (!o.shots) return;
    const p = join(o.out, `${name}-${tag}.jpg`);
    await hl.wrap(`screenshot:${tag}`, () => shotNow(p));
    screenshots.push(p);
  };
  const shotNow = (p) => cleanShot(page, p, o.clean);
  await shot("settled");
  let walk = null, heapsample = null, profileWalk = null;
  if (P.profileWalk && !(walkS > 0)) profileWalk = { error: "profile-walk needs a walk spot (walk=<s> or steps=)" };
  if (P.heapsample && !(walkS > 0)) heapsample = { error: "heapsample needs a walk spot (walk=<s> or steps=)" };
  if (walkS > 0) {
    await page.mouse.click(o.width / 2, o.height / 2).catch(() => {});
    const stopWalkTrace = doTrace ? await startTrace(page, join(o.out, `${name}-walk.trace.json`), traceOpt, hl) : null;
    // `profile-walk`: started just before the window opens, stopped just after it (no CDP inside it).
    const stopWalkProfile = P.profileWalk ? await startCpuProfile(page, 200, hl) : null;
    const walkPn = stopWalkProfile ? await profileAnchor(page) : 0;
    const stopHeap = P.heapsample ? await startHeapSample(page, hl, o.sourceMaps) : null;
    // One window (stats, trace, profile) spans the whole sequence; the page plays the route (stepsSchedule).
    const w = await sample(page, walkS, o.profile > 0 ? () => cpuProfile(page, o, Math.min(o.profile, walkS), "walk", name, hl) : null, nodeWait, hl,
      stepsSchedule(spot.steps, spot.aim ? Number(spot.aim.split(",")[0]) : 0));
    if (stopWalkProfile) {
      const file = join(o.out, `${name}-walk.cpuprofile`);
      const prof = await stopWalkProfile(file);
      profileWalk = { file, intervalUs: 200, frames: w.ts.length, topSelfPerFrame: profileTopPerFrame(prof, w.ts.length, 25, o.sourceMaps),
        spikes: profileSpikes(prof, profileOffset(prof, walkPn), w.series, {}, o.sourceMaps) };
    }
    if (stopHeap) heapsample = await stopHeap(join(o.out, `${name}-walk.heapsample.json`));
    if (stopWalkTrace) traces.walk = await stopWalkTrace(w.extra?.file, w.ts.at(-1));
    if (w.extra) profile = w.extra;
    walk = { seconds: walkS, steps: spot.steps, route: w.route,...frameStats(w.ts), ...w.work, series: w.series, gcFrames: gcFramesDigest(w.series), workerGaps: w.workerGaps,
      hud: parseHud(await hl.wrap("evaluate:hud", () => page.evaluate(() => document.body.innerText)).catch(() => "")) };
    await shot("walk");
  }
  const gpu = await gpuAdapter(page, o.renderer);
  const census = o.census ? await runCensus(page, o).catch((e) => ({ error: String(e) })) : null;
  const diag = spot.diagList?.length ? await page.evaluate(async (names) => { const r = {}; for (const n of names) r[n] = (await window.__DIAG__?.[n]?.()) ?? null; return r; }, spot.diagList.filter((n) => INPAGE_PROBES.includes(n))).catch((e) => ({ error: String(e) })) : null;
  // `heap` has no in-page probe: one post-GC reading after every stats window has closed (never inside one).
  if (diag && spot.diagList.includes("heap")) diag.heap = await postGcHeap(page, hl).catch((e) => ({ error: String(e) }));
  // Page-time join: relink events within 300 ms of each long frame go on the frame as `links`.
  for (const t of Object.values(traces)) joinLinks(t.long ?? [], diag?.relink?.events);
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
      foreign: foreignPages(browser, own), viewStall };
    smoke = { ...r, luma: r.luma == null ? null : Math.round(r.luma * 10) / 10, problems: smokeProblems(r) };
  }
  page.off("console", onConsole); page.off("pageerror", onPageError); page.off("response", onResponse);
  page.off("request", onRequest); page.off("requestfinished", onRequestDone); page.off("requestfailed", onRequestDone);
  const harnessLog = hl.entries();
  const hostSamples = host ? hostSeries(host.stop(), hl.origin) : null;
  const spikes = hostSpikes(hostSamples);
  const coreCorr = coreCorrelation(settle.series, hostSamples);
  if (walk) walk.coreCorrelation = coreCorrelation(walk.series, hostSamples);
  const hitchCtx = { settled: hitchContext(settle.work.hitches ?? [], harnessLog, settle.workerGaps, spikes),
    ...(walk ? { walk: hitchContext(walk.hitches ?? [], harnessLog, walk.workerGaps, spikes) } : {}) };
  return { name, url, query, ready, readyS, cold: !!spot.cold, loadTimeline, ...stats, series: settle.series, gcFrames: gcFramesDigest(settle.series), workerGaps: settle.workerGaps, hostSamples, hostSpikes: spikes, coreCorrelation: coreCorr, harnessLog, hitchContext: hitchCtx, hud, drawCalls: hud.drawCalls ?? info.calls ?? null, tris: hud.tris ?? info.tris ?? null,
    walk, profile, profileWalk, trace: doTrace ? traces : null, heapsample, diagnosis: !!spot.diagnosis, consoleErrors, viewStall, inFlightAtReady, http404s, memory: info.memory ?? null, gpuAdapter: gpu, screenshots, census, diag, smoke };
}

/**
 * The init script of in-page probe `n`: as is when it is a global probe (--diag), else guarded so it runs only on a
 * page whose query `diag=` names it (the one tab navigates spot to spot; the probe-off spots load none of it).
 */
export function probeScript(n, src, globalDiag = []) {
  if (globalDiag.includes(n)) return src;
  return `if ((new URLSearchParams(location.search).get("diag") ?? "").split(",").includes(${JSON.stringify(n)})) {\n${src}\n}`;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  o.sourceMaps = loadSourceMaps(o.maps); // --maps <dir>: hidden source maps of the measured build (A1)
  mkdirSync(o.out, { recursive: true });
  const browser = await chromium.connectOverCDP(`http://${o.cdp}`);
  const { closed: orphansClosed, keep } = await closeOrphanPages(browser);
  const own = new Set(keep ? [keep] : []);
  console.log(`measure: closed ${orphansClosed} page(s) left open in Chrome by earlier runs`);
  const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: o.dpr });
  await ctx.addInitScript(pageProbe);
  if (o.census) await ctx.addInitScript({ content: readFileSync(probePath("census"), "utf8") });
  if (o.diagList.some((n) => FRAME_PROBES.includes(n))) await ctx.addInitScript({ content: readFileSync(probePath("capture-lib"), "utf8") });
  for (const n of o.diagList.filter((n) => INPAGE_PROBES.includes(n))) await ctx.addInitScript({ content: probeScript(n, readFileSync(probePath(n), "utf8"), o.globalDiag) });
  const git = (a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" }).stdout.trim();
  // The sha pod-sync.sh stamped beside the synced data (the pod tree is no git repo); null off the pod.
  const syncStamp = () => { try { return readFileSync(join(process.env.ES_DATA_PUBLIC ?? "/root/site/public", ".sync-sha"), "utf8").trim() || null; } catch { return null; } };
  const result = { schemaVersion: 1, run: o.run, gitSha: syncStamp() ?? git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "",
    builtAt: null, measuredAt: new Date().toISOString(), renderer: o.renderer, origin: o.origin, base: o.base,
    window: { width: o.width, height: o.height }, dpr: o.dpr, settleS: o.settle, walkS: o.walk, browser: browser.version(), orphansClosed, urls: [] };
  // builtAt: the served index.html's Last-Modified (the build that is actually being measured).
  result.builtAt = await fetch(`${o.origin}${o.base}`).then((r) => r.headers.get("last-modified")).catch(() => null);
  const page = await ctx.newPage(); // ONE tab for every spot
  own.add(page);
  for (const [i, spot] of o.spotList.entries()) {
    const q = spot.query;
    const r = await measureUrl(page, ctx, o, spot, i, own, browser);
    result.urls.push(r);
    console.log(`${spot.name} ${q}: ${r.settledFps} fps settled, uncapped ${r.uncappedFps} (work ${r.workMs?.mean} ms, wrapper ${r.wrapperMsPerFrame}), 1% low ${r.p1LowFps}, min ${r.minFps}, ready ${r.readyS} s${r.walk ? `, walk ${r.walk.settledFps}` : ""}`);
    if (i === 0 && o.leak > 0) { // the ONE long capture, on the first spot's settled page; the remaining spots measure normally after it
      const leak = await runLeak(page, o);
      writeFileSync(join(o.out, "leak.json"), `${JSON.stringify(leak, null, 2)}\n`);
      writeFileSync(join(o.out, "leak.txt"), `${leakText(leak)}\n`);
      console.log(leakText(leak));
    }
  }
  await page.close().catch(() => {});
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
  const rows = result.urls.flatMap((u) => spotRows(u.name, u, o.barParsed));
  const table = summaryTable(rows, o.barParsed);
  const gcLines = result.urls.flatMap((u) => [...gcFramesText(`${u.name} settled`, u.gcFrames), ...gcFramesText(`${u.name} walk`, u.walk?.gcFrames)]);
  const hitchLines = result.urls.flatMap((u) => hitchContextText(u.name, u.hitchContext ?? {}));
  const coreLines = result.urls.flatMap((u) => [coreCorrelationText(`${u.name} settled`, u.coreCorrelation), coreCorrelationText(`${u.name} walk`, u.walk?.coreCorrelation)].filter(Boolean));
  const loadLines = result.urls.map((u) => loadTimelineText(u.name, u.loadTimeline, u.cold));
  writeFileSync(join(o.out, "summary.md"), `# ${o.run}\n\nhost sampler: ${o.pod ? `on (${hostSummary(result.urls.map((u) => u.hostSamples))})` : "off"}\n\n## Load (s from navigation)\n\n${loadLines.join("\n")}\n\n${coreLines.length ? `${coreLines.join("\n")}\n\n` : ""}${table}\n\n## Hitches over 33 ms: nearest harness action (500 ms) and heartbeat worker\n\n${hitchLines.join("\n") || "none"}\n${gcLines.length ? `\n## Groundcover sub-timers on frames over 12 ms (ms; gcRefill 1 fill started, 2 swapped in)\n\n${gcLines.join("\n")}\n` : ""}`);
  writeFileSync(join(o.out, "summary.json"), `${JSON.stringify({ schemaVersion: 1, run: o.run, bar: o.barParsed, rows }, null, 2)}\n`);
  console.log(`\n${table}\nmeasure: ${join(o.out, "summary.md")}`);
  await browser.close().catch(() => {});
  if (o.smoke) {
    const bad = result.urls.flatMap((u) => u.smoke?.problems ?? ["no smoke result"]);
    if (bad.length) { console.error(`SMOKE FAIL:\n  ${bad.join("\n  ")}`); process.exit(1); }
    for (const u of result.urls) console.log(`SMOKE PASS ${u.name} (ready ${u.readyS} s, uncapped ${u.uncappedFps} fps, luma ${u.smoke.luma})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
