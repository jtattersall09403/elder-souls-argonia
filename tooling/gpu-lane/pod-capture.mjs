/**
 * A round's measurement in ONE invocation (decision 0106 d22): every view of a views file captured in turn in ONE
 * tab of an ALREADY-RUNNING real-GPU Chrome (the RunPod pod's, over an ssh -L tunnel), navigating the same tab, over
 * raw per-tab CDP. Not playwright's connectOverCDP (it hangs on the shared pod Chrome, walk 10). One capture per Chrome.
 *
 *   node tooling/gpu-lane/pod-capture.mjs --views <views.json> --out <dir> [--pod "ssh -i <key> -p <port> root@<ip>" | --cdp http://127.0.0.1:9222]
 *     [--seconds 120] [--shots 500@60,2000] [--reads 15,30,60,120] [--profile <s>@<t>] [--settled-frames 300] [--settle-floor 60]
 *     [--window 10] [--width 1280 --height 720]
 *   node tooling/gpu-lane/pod-capture.mjs --url <url> [--compare <url>] --out <dir> [...]   (a views file of one or two views)
 *
 * --views      JSON list of {name, url, steps?, shots?, seconds?}; each view writes <out>/<name>/ (result.json, frames/, final.jpg,
 *              trace.json); <out>/result.json holds every view and <out>/summary.md the table. Example: views/webgpu10-iter6.json
 * --url/--compare  the single-URL case: views "main" (and "compare"); result.lumaRatio = main luma / compare luma per read
 * --pod        opens the CDP tunnel itself (tunnels.mjs: PID recorded, closed at exit); else --cdp (default $CHROME_CDP or :9222)
 * --seconds    capture length per view (default 120; a view's `seconds` overrides)
 * --shots      JPEG frame schedule: every <fastMs> to <fastUntilS>, then every <slowMs>; "none" for no frames (a view's `shots` overrides)
 * --reads      seconds at which to read screen-middle luma and blackShare (x 30-70 %, y 40-90 %, luma <= 3), HUD lines, heap,
 *              __RENDERER__ info, __DIAG, __STUDIO_FPS__ and __STUDIO_GPU_MS__ (default 15,30,60,120; clipped to the view's seconds)
 * --settled-frames N  after the settle gate (queue at 0 pending with geometry for 5 s, no earlier than --settle-floor s) count N renderer
 *              frames, then a full read into reads.settled (default 300). lumaRatio.settled is the comparable luma ratio.
 * --window     seconds of the cost window right after the settled read (at the end when the view never settles): per-frame
 *              main-thread work + GPU ms (measure.mjs workStats: costMs, uncappedFps, hitches) and a filtered Chrome trace
 *              (trace-frames.mjs: main-thread self ms by stage, hitches over 33 ms with their top stage). Default 10; 0 = off.
 * --profile    a CPU profile of <s> seconds starting at <t> per view (summary in result.json, raw to profile.cpuprofile)
 * steps        per view, {at, label, js, waitMs?}: at `at` s the page evaluates js (its JSON return goes to probe[label]), waits waitMs
 *              (default 2500), then a full read goes into steps[]
 *
 * Before the first view: every other page in the Chrome is closed (orphan tabs contaminate every number) and a blank-page rAF
 * rate is read: cap.capDetected is false when rAF ran above 61 fps, so fps can show headroom.
 * Per view: console (deduped), pageErrors, network (>= 400 and failed loads), http404s, gpuErrors (uncapturederror and device
 * loss), reads, settledAt, heapSlope (post-GC MB/min once GPU resource counts held 5 s), work, stages, hitches, probe, summary.
 * Exit 0 unless the tab could not be opened.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { capVerdict, counter, heapSlope, settleGate, isStalled, lumaRatios, parseProfile, onePercentLow, parseShots, parseViews, screenMiddle, stalledReads, summariseProfile, summaryTable } from "./pod-capture-lib.mjs";
import { pageProbe, workStats } from "./measure.mjs";
import { TRACE_CATEGORIES, classifyFrames, keepTraceEvent, mainThreadStages, topCause } from "./trace-frames.mjs";
import { closeTunnels, openTunnel } from "./tunnels.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const out = opt("out");
const views = opt("views") ? parseViews(readFileSync(opt("views"), "utf8"))
  : opt("url") ? parseViews(JSON.stringify([{ name: "main", url: opt("url") }, ...(opt("compare") ? [{ name: "compare", url: opt("compare") }] : [])])) : null;
if (!views || !out) { console.error("usage: pod-capture.mjs --views <json> | --url <url> [--compare <url>]  --out <dir> [flags; see header]"); process.exit(2); }
const defaultS = Number(opt("seconds", 120)), readsSpec = opt("reads", "15,30,60,120");
const prof = opt("profile") ? parseProfile(opt("profile")) : null, windowS = Number(opt("window", 10));
const W = Number(opt("width", 1280)), H = Number(opt("height", 720));
const settledFrames = Number(opt("settled-frames", 300)), settleFloor = Number(opt("settle-floor", 60));

let tunnel = null;
const closeOwn = () => { if (tunnel) closeTunnels({ pid: tunnel.pid }); tunnel = null; };
process.on("SIGINT", () => { closeOwn(); process.exit(130); });
process.on("SIGTERM", () => { closeOwn(); process.exit(143); });
const pod = opt("pod");
if (pod) tunnel = await openTunnel({ pod, purpose: "cdp-capture" });
const cdpHttp = (tunnel ? `http://127.0.0.1:${tunnel.localPort}` : opt("cdp", process.env.CHROME_CDP ?? "http://127.0.0.1:9222")).replace(/\/$/, "");

// Own window: Target.createTarget on the browser websocket, newWindow, foreground.
async function openWindow() {
  const bws = new WebSocket((await (await fetch(`${cdpHttp}/json/version`)).json()).webSocketDebuggerUrl);
  await new Promise((r, j) => { bws.onopen = r; bws.onerror = j; });
  const targetId = await new Promise((res, rej) => {
    bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) m.error ? rej(new Error(m.error.message)) : res(m.result.targetId); };
    bws.send(JSON.stringify({ id: 1, method: "Target.createTarget", params: { url: "about:blank", newWindow: true, background: false } }));
  });
  bws.close();
  return { id: targetId, webSocketDebuggerUrl: `${cdpHttp.replace(/^http/, "ws")}/devtools/page/${targetId}` };
}

// init script: perf HUD open; rAF counters; renderer/context census; GPU errors from every device; measure.mjs's per-frame work probe
const INIT = `(() => {
  try { localStorage.setItem("es.hud.perfOpen", "1"); } catch {}
  window.__GPUERR = []; window.__RAFN = 0;
  window.__RAFMS = []; let lastT = 0;
  const tick = (t) => { window.__RAFN++; if (lastT) { window.__RAFMS.push(t - lastT); if (window.__RAFMS.length > 600) window.__RAFMS.shift(); } lastT = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  window.__CTX = { canvases: [], devices: 0 };
  const seen = new WeakMap(), getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...a) {
    if (kind === "webgpu" || kind === "webgl2") {
      if (!seen.has(this)) { seen.set(this, { kind, calls: 0 }); window.__CTX.canvases.push(seen.get(this)); }
      seen.get(this).calls++;
    }
    return getContext.call(this, kind, ...a);
  };
  if (typeof GPUAdapter === "undefined") return;
  const req = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...a) {
    const d = await req.apply(this, a);
    window.__CTX.devices++;
    d.addEventListener("uncapturederror", (e) => window.__GPUERR.push(String(e.error?.message).slice(0, 300)));
    d.lost.then((i) => window.__GPUERR.push("LOST " + i.reason + " " + i.message));
    return d;
  };
})();
try { (${pageProbe})(); } catch {}`;
const READ = `(async () => {
  const r = window.__RENDERER__, i = r?.info, q = r?.esBuildQueue, pm = performance.memory;
  const frame = () => window.__RENDERER__?.info?.render?.frame ?? window.__RAFN;
  const f1 = frame(); await new Promise((res) => setTimeout(res, 1000)); const f2 = frame();
  const rafMs = (window.__RAFMS ?? []).slice(-300);
  const g = window.__STUDIO_GPU_MS__;
  return { rafMs, frames: [f1, f2], backend: window.__RENDERER_BACKEND__ ?? (r?.backend?.isWebGPUBackend ? "webgpu" : undefined),
    fps: window.__STUDIO_FPS__, gpuMs: g && { avg: g.avg, max: g.max, supported: g.supported, cpu: g.cpu, cpuMax: g.cpuMax, tris: g.tris, calls: g.calls, source: g.source },
    renderer: i && { geometries: i.memory?.geometries, textures: i.memory?.textures, triangles: i.render?.triangles, calls: i.render?.drawCalls ?? i.render?.calls },
    buildQueue: q && { pending: q.pending, twinsHeld: q.twinsHeld, skippedDraws: q.skippedDraws },
    contexts: window.__CTX && JSON.parse(JSON.stringify(window.__CTX)),
    diag: (() => { try { return window.__DIAG && JSON.parse(JSON.stringify(window.__DIAG)); } catch (e) { return String(e); } })(),
    heapMB: pm && Math.round(pm.usedJSHeapSize / 1e6), heapLimitMB: pm && Math.round(pm.jsHeapSizeLimit / 1e6),
    hud: document.body.innerText.split("\\n").filter((l) => /fps|ms|draw|tri|calls|gpu|cpu|pass|stage|skipped|pending|twin|perf|scene/i.test(l)).slice(0, 40) };
})()`;
const BLANK_RAF = `new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(n * 1000 / (performance.now() - t0)); }; requestAnimationFrame(f); })`;
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

// ---- the one tab ----
mkdirSync(out, { recursive: true });
const target = await openWindow();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 0, sink = null, traceEv = null, traceDone = null;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); return; }
  const p = m.params;
  if (m.method === "Tracing.dataCollected") { if (traceEv) for (const ev of p.value) if (keepTraceEvent(ev)) traceEv.push(ev); return; }
  if (m.method === "Tracing.tracingComplete") { traceDone?.(); return; }
  if (!sink) return;
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(p.type)) sink.cons.add(`${p.type}: ${p.args.map((a) => a.value ?? a.description).join(" ")}`);
  else if (m.method === "Runtime.exceptionThrown") sink.pageErrors.add(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text);
  else if (m.method === "Network.requestWillBeSent") sink.reqUrl.set(p.requestId, p.request.url);
  else if (m.method === "Network.responseReceived" && p.response.status >= 400) sink.network.add(`${p.response.status} ${p.response.url}`);
  else if (m.method === "Network.loadingFailed" && !p.canceled) sink.network.add(`FAILED ${sink.reqUrl.get(p.requestId) ?? p.requestId} ${p.errorText}`);
};
const send = (method, params = {}, timeoutMs = 30_000) => new Promise((res, rej) => {
  const id = ++nextId; const t = setTimeout(() => { pending.delete(id); rej(new Error(`${method} timed out`)); }, timeoutMs);
  pending.set(id, (m) => { clearTimeout(t); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression, timeoutMs = 15_000) => {
  try {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
    return r.exceptionDetails ? { err: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text } : r.result.value;
  } catch (e) { return { err: String(e.message) }; }
};
const SCREEN_MIDDLE = String(screenMiddle);
const middleOf = (b64) => evaluate(`(async () => {
  const screenMiddle = ${SCREEN_MIDDLE};
  const bm = await createImageBitmap(await (await fetch("data:image/jpeg;base64,${b64}")).blob());
  const oc = new OffscreenCanvas(bm.width, bm.height), x = oc.getContext("2d"); x.drawImage(bm, 0, 0);
  return screenMiddle(x.getImageData(0, 0, bm.width, bm.height).data, bm.width, bm.height);
})()`, 20_000);
const shoot = async (quality = 60) => (await send("Page.captureScreenshot", { format: "jpeg", quality }, 20_000)).data;
// A full read: stalled flag, 1 %-low fps of the last ~300 rAF durations (raw durations dropped), screen-middle luma
const fullRead = async () => {
  const r = await evaluate(READ);
  if (!r || r.err) return r ?? { err: "no read" };
  r.stalled = isStalled(...(r.frames ?? [])); r.low1 = onePercentLow(r.rafMs ?? []); delete r.rafMs;
  try { Object.assign(r, await middleOf(await shoot(80))); } catch (e) { r.middleErr = String(e.message); }
  return r;
};

/** The cost window: measure.mjs's per-frame work probe and a filtered trace, together, for windowS seconds. */
async function costWindow(dir, atS) {
  await evaluate(`(() => { const l = window.__GPU_LANE__; if (l) { l.frames = []; l.ts = []; l.wrapMs = 0; l.on = true; } })()`);
  traceEv = []; const done = new Promise((r) => { traceDone = r; });
  let traced = true;
  try { await send("Tracing.start", { traceConfig: { includedCategories: TRACE_CATEGORIES, recordMode: "recordContinuously" }, transferMode: "ReportEvents" }); } catch { traced = false; }
  await new Promise((r) => setTimeout(r, windowS * 1000));
  const raw = await evaluate(`(() => { const l = window.__GPU_LANE__; if (!l) return null; l.on = false;
    return { wrapMs: l.wrapMs, frames: l.frames.map((f) => ({ t: f.stamp, work: Math.max(f.end, f.msg) - f.start, gpu: f.gpu })) }; })()`, 30_000);
  let stages = null, hitches = null;
  if (traced) {
    await send("Tracing.end"); await Promise.race([done, new Promise((r) => setTimeout(r, 60_000))]);
    writeFileSync(join(dir, "trace.json"), JSON.stringify({ traceEvents: traceEv }));
    stages = mainThreadStages(traceEv);
    const c = classifyFrames(traceEv, { overMs: 33 });
    hitches = { frames: c.frames, over33: c.over33 ?? 0, maxMs: c.maxMs ?? null, list: c.long.map((f) => ({ atS: f.atS, ms: f.ms, top: topCause(f.byCause), byCause: f.byCause })) };
  }
  traceEv = null; traceDone = null;
  let work = null;
  if (raw?.frames) {
    for (let i = 0; i < raw.frames.length; i++) raw.frames[i].dt = i ? raw.frames[i].t - raw.frames[i - 1].t : 0;
    const { hitches: _h, ...w } = workStats(raw.frames);
    work = { ...w, wrapperMsPerFrame: raw.frames.length ? Math.round((raw.wrapMs / raw.frames.length) * 100) / 100 : null };
  }
  return { at: atS, seconds: windowS, work, stages, hitches };
}

async function captureView(view) {
  const dir = join(out, view.name);
  mkdirSync(join(dir, "frames"), { recursive: true });
  const totalS = view.seconds ?? defaultS;
  const shotsSpec = view.shots ?? opt("shots"), shots = shotsSpec === "none" ? [] : parseShots(shotsSpec, totalS);
  const readsAt = readsSpec.split(",").map(Number).filter((s) => s < totalS);
  const steps = [...view.steps];
  sink = { cons: counter(), pageErrors: counter(), network: counter(), reqUrl: new Map() };
  const result = { name: view.name, url: view.url, seconds: totalS, frames: 0, reads: {}, settledAt: null, probe: {}, profile: null, window: null };
  try {
    if (prof) { await send("Profiler.enable"); await send("Profiler.setSamplingInterval", { interval: 200 }); }
    const t0 = Date.now(), sec = () => (Date.now() - t0) / 1000;
    await send("Page.navigate", { url: view.url });
    const heapSamples = [];
    let si = 0, ri = 0, lastPoll = -1, zeroSince = null, profState = prof ? "wait" : "done";
    const gate = settledFrames > 0 ? settleGate(settledFrames, settleFloor) : null;
    while (sec() < totalS) {
      const s = sec();
      if (profState === "wait" && s >= prof.at) { await send("Profiler.start"); profState = "on"; }
      if (profState === "on" && s >= prof.at + prof.seconds) {
        const { profile } = await send("Profiler.stop", {}, 60_000);
        writeFileSync(join(dir, "profile.cpuprofile"), JSON.stringify(profile));
        result.profile = { at: prof.at, ...summariseProfile(profile) }; profState = "done";
      }
      if (si < shots.length && s >= shots[si]) {
        while (si < shots.length && shots[si] <= s) si++;
        try { writeFileSync(join(dir, "frames", `${String(Math.round(s * 1000)).padStart(6, "0")}.jpg`), Buffer.from(await shoot(), "base64")); result.frames++; } catch { /* busy page: skip this frame */ }
      }
      if (ri < readsAt.length && s >= readsAt[ri]) { ri++; result.reads[readsAt[ri - 1]] = { t: r1(sec()), ...(await fullRead()) }; }
      if (steps.length && s >= steps[0].at) {
        const st = steps.shift();
        const rec = { label: st.label, at: r1(s), value: await evaluate(st.js) };
        result.probe[st.label ?? `at${st.at}`] = rec.value;
        await new Promise((r) => setTimeout(r, st.waitMs ?? 2500));
        const r = await fullRead();
        rec.read = Object.fromEntries(Object.entries(r).filter(([k]) => !["hud", "diag", "contexts"].includes(k)));
        (result.steps ??= []).push(rec);
      }
      if (Math.floor(s) > lastPoll) {
        lastPoll = Math.floor(s);
        const q = await evaluate(`({ f: window.__RENDERER__?.info?.render?.frame ?? window.__RAFN, p: window.__RENDERER__?.esBuildQueue?.pending, g: window.__RENDERER__?.info?.memory?.geometries ?? 0, x: window.__RENDERER__?.info?.memory?.textures ?? 0 })`, 5_000);
        // live heap after a forced GC, every 10 s: usedJSHeapSize counts uncollected garbage (walk 10 read +140 MB/min of churn as a leak)
        let heapMB;
        if (lastPoll % 10 === 0) { await send("HeapProfiler.collectGarbage", {}, 30_000); heapMB = (await send("Runtime.getHeapUsage")).usedSize / 1e6; }
        if (q && !q.err) heapSamples.push({ s: lastPoll, heapMB, buffers: q.g, textures: q.x });
        if (gate?.feed(s, q, q?.f)) {
          result.reads.settled = { t: r1(sec()), gateAt: gate.settledAt, afterFrames: settledFrames, ...(await fullRead()) };
          if (windowS > 0 && !result.window) result.window = await costWindow(dir, r1(sec()));
        }
        if (q?.p === 0 && q.g > 0) { zeroSince ??= s; if (result.settledAt === null && s - zeroSince >= 5) result.settledAt = r1(zeroSince); } else zeroSince = null;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (windowS > 0 && !result.window) result.window = { ...(await costWindow(dir, r1(sec()))), unsettled: true };
    result.heapSlope = heapSlope(heapSamples);
    result.final = await fullRead();
    try { writeFileSync(join(dir, "final.jpg"), Buffer.from(await shoot(80), "base64")); } catch { /* final read has the luma */ }
    const g = await evaluate(`window.__GPUERR ?? []`);
    const gc = counter(); (Array.isArray(g) ? g : [JSON.stringify(g)]).forEach(gc.add);
    result.gpuErrors = gc.list();
    result.stalledReads = stalledReads(result.reads, result.final);
  } catch (e) {
    result.error = String(e.stack ?? e);
  } finally {
    Object.assign(result, { console: sink.cons.list(), pageErrors: sink.pageErrors.list(), network: sink.network.list() });
    result.http404s = result.network.filter(([k]) => k.startsWith("404 ")).length;
    sink = null;
    result.summary = summarise(result);
    writeFileSync(join(dir, "result.json"), JSON.stringify(result, null, 1));
  }
  return result;
}

function summarise(r) {
  const s = r.reads?.settled && !r.reads.settled.err ? r.reads.settled : r.final ?? {};
  const g = s.gpuMs ?? {}, w = r.window ?? {}, st = w.stages?.perFrameMs ?? {}, top = Object.entries(st)[0];
  const hitchTop = topCause(Object.fromEntries((w.hitches?.list ?? []).reduce((m, h) => (h.top ? m.set(h.top, (m.get(h.top) ?? 0) + h.ms) : m), new Map())));
  return {
    lumaSettled: r.reads?.settled?.luma ?? null, lumaFinal: r.final?.luma ?? null, blackShare: r.final?.blackShare ?? null,
    fps: s.fps ?? null, low1: s.low1 ?? null, gpuMs: g.supported ? g.avg : null, cpuMs: g.cpu ?? null,
    costMs: w.work?.costMs?.mean ?? null, uncappedFps: w.work?.uncappedFps ?? null,
    calls: g.calls ?? s.renderer?.calls ?? null, tris: g.tris ?? s.renderer?.triangles ?? null,
    heapMbPerMin: r.heapSlope?.mbPerMin ?? null, topStage: top ? `${top[0]} ${top[1]}` : null,
    hitches: w.hitches ? `${w.hitches.over33}${hitchTop ? ` (${hitchTop})` : ""}` : null,
    errors: `${r.gpuErrors?.length ?? "?"}/${r.console?.filter(([k]) => k.startsWith("error")).length ?? "?"}/${r.pageErrors?.length ?? "?"}/${r.http404s ?? "?"}`,
    settled: Boolean(r.reads?.settled), stalled: r.stalledReads?.length ?? null, error: r.error ? r.error.split("\n")[0] : undefined,
  };
}

const all = { cdp: cdpHttp, startedAt: new Date().toISOString(), cap: null, orphansClosed: 0, views: [] };
try {
  // orphan tabs keep rendering beside the measured page (walk 10: 90.8 ms frames with four open, 12.2 ms without)
  for (const t of await (await fetch(`${cdpHttp}/json/list`)).json()) {
    if (t.type === "page" && t.id !== target.id) { await fetch(`${cdpHttp}/json/close/${t.id}`).catch(() => {}); all.orphansClosed++; }
  }
  await send("Runtime.enable"); await send("HeapProfiler.enable"); await send("Page.enable"); await send("Network.enable");
  all.cap = capVerdict(Number(await evaluate(BLANK_RAF, 10_000)));
  await send("Page.addScriptToEvaluateOnNewDocument", { source: INIT });
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  for (const v of views) {
    const r = await captureView(v);
    all.views.push(r);
    console.log(`pod-capture ${v.name}: ${JSON.stringify(r.summary)}`);
  }
  const byName = Object.fromEntries(all.views.map((v) => [v.name, v]));
  if (byName.main && byName.compare) byName.main.lumaRatio = lumaRatios(byName.main.reads, byName.compare.reads, byName.main.final, byName.compare.final);
} catch (e) {
  all.error = String(e.stack ?? e);
} finally {
  ws.close();
  await fetch(`${cdpHttp}/json/close/${target.id}`).catch(() => {});
  closeOwn();
  writeFileSync(join(out, "result.json"), JSON.stringify(all, null, 1));
  writeFileSync(join(out, "summary.md"), `${summaryTable(all.views, all.cap)}\n`);
}
console.log(`pod-capture: ${all.views.length}/${views.length} views, cap detected ${all.cap?.capDetected} (blank rAF ${all.cap?.blankRafFps}), orphans closed ${all.orphansClosed}${all.error ? `, ERROR ${all.error.split("\n")[0]}` : ""} -> ${out}/summary.md`);
process.exit(0);
