/**
 * A round's measurement in ONE invocation (decision 0106 d22): every view of a views file captured in turn, each in its
 * OWN fresh browser context (Target.createBrowserContext: new renderer process, no bfcache, its memory freed by
 * disposeBrowserContext after the view; iter6 reused one tab and the heap climbed 1.6 -> 8.5 GB), of an ALREADY-RUNNING
 * real-GPU Chrome (the RunPod pod's, over an ssh -L tunnel), over raw CDP. Not playwright's connectOverCDP (it hangs on
 * the shared pod Chrome, walk 10). One capture per Chrome; views run sequentially, never in parallel tabs.
 *
 *   node tooling/gpu-lane/pod-capture.mjs --views <views.json> --out <dir> [--pod "ssh -i <key> -p <port> root@<ip>" | --cdp http://127.0.0.1:9222]
 *     [--seconds 120] [--shots 500@60,2000] [--reads 15,30,60,120] [--profile <s>@<t>] [--settled-frames 300] [--settle-floor 60]
 *     [--window 10] [--width 1280 --height 720] [--prep /tmp/<lane>/prep-times.jsonl] [--ready-timeout 90] [--capture-timeout 180]
 *     [--heap-profile]
 *   node tooling/gpu-lane/pod-capture.mjs --url <url> [--compare <url>] --out <dir> [...]   (a views file of one or two views)
 *
 * --views      JSON list of {name, url, steps?, shots?, seconds?, plain?, clean?, aim?, settle?, readyFlag?} (url any http(s) URL; plain: a non-studio
 *              page, no settle gate, runs its seconds; clean: HUD, minimap and scrollbar hidden around frames and final.jpg; settle: shots
 *              count from the shot settle gate (fps and luma steady, pod-capture-lib shotSettle; default on, false = off); aim: [yaw, pitch?] rad
 *              through aimCamera before the first frame; readyFlag: a window global the page sets truthy when its first frame is drawn,
 *              no shot before it (or --ready-timeout), conventions at pod-capture-lib aimJs); each view writes <out>/<name>/ (result.json, frames/, final.jpg,
 *              trace.json); <out>/result.json holds every view and <out>/summary.md the table. Example: views/webgpu10-iter7.json
 * --url/--compare  the single-URL case: views "main" (and "compare"); result.lumaRatio = main luma / compare luma per read
 * --pod        opens the CDP tunnel itself (tunnels.mjs: PID recorded, closed at exit); else --cdp (default $CHROME_CDP or :9222)
 *              With --pod, a Chrome that stops answering (a CDP timeout, then a failed Browser.getVersion) is restarted with
 *              pod-setup.sh <--chrome-mode, default webgpu> over the ssh, and the run continues; that view gets recovered: true
 *              (rerun when its page never opened). A forced GC that times out turns the view's later GCs off (gcOff).
 * --seconds    capture length per view (default 120; a view's `seconds` overrides)
 * --shots      JPEG frame schedule: every <fastMs> to <fastUntilS>, then every <slowMs>; "none" for no frames (a view's `shots` overrides)
 * --reads      seconds at which to read screen-middle luma and blackShare (x 30-70 %, y 40-90 %, luma <= 3), HUD lines, heap,
 *              __RENDERER__ info, __DIAG, __STUDIO_FPS__ and __STUDIO_GPU_MS__ (default 15,30,60,120; clipped to the view's seconds)
 * --settled-frames N  after the settle gate (queue at 0 pending with geometry for 5 s, no earlier than --settle-floor s) count N renderer
 *              frames, then a full read into reads.settled (default 300). lumaRatio.settled is the comparable luma ratio.
 * --window     seconds of the cost window right after the settled read (at the end when the view never settles): per-frame
 *              main-thread work + GPU ms (measure.mjs workStats: costMs, uncappedFps, hitches) and a filtered Chrome trace
 *              (trace-frames.mjs: main-thread self ms by stage, hitches over 33 ms with their top stage). Default 10; 0 = off.
 * --prep       prep timings appended by build-dist.sh and pod-sync.sh (JSON lines); result.json `prep` and a summary line
 *              carry each step and the wall time from the first step's start to the first capture
 * --ready-timeout  s from navigation until the studio renders (frames advancing, geometries > 0; not for plain views); past it the view fails
 *              with failed "not-ready" and lastState (last read: HUD, renderer, console tail). Default 90.
 * --capture-timeout  s FLOOR of the per-view limit from its context opening to its result: the limit is max(this, ready-timeout + the
 *              view's seconds + window + profile + 60 s slack) (viewDeadlineS); past it the view fails with "capture-timeout"
 *              (the partial result is kept). Default 180. Either way the context is disposed and
 *              the run moves on. <out>/result.json and summary.md are rewritten after every view, so a killed run keeps its rows.
 * --heap-profile  (or a view's heapProfile: true) HeapProfiler sampling (32 KiB interval) over the cost window: the top 25
 *              allocating functions by self size (bundle url:line:col; the dist ships no sourcemaps) -> result heapTop and heap.json
 * Orphan guard: the process records its ancestor PIDs at start and exits (tunnel closed) within 5 s of any of them dying,
 *              so a capture never outlives the agent that ran it. With --pod it first asks the pod for its Chrome
 *              (curl 127.0.0.1:9222/json/version over ssh, 5 s); when it is not there it restarts it with pod-setup.sh as
 *              below, and exits 3 ("pod Chrome down after pod-setup.sh") only if it is still down.
 * --cpu-profile  V8 CPU profile (200 us sampling) over each view's cost window: self ms per function (bundle url:line:col)
 *              per window frame, top 25 -> window.cpuTop and window.cpuprofile, top 5 in the summary row. Compare its numbers
 *              only against other --cpu-profile runs (the sampler costs main-thread time).
 * --allow-paused  run studio views whose URL lacks rate= (paused world clock); without it such a views file exits 2 naming them
 * WebGPU check: after every browser (re)connect (--chrome-mode webgpu) navigator.gpu.requestAdapter() is polled on a blank page
 *              for up to 20 s (result adapterWaits). A view asking WebGPU (url renderer=webgpu, or expectBackend: "webgpu")
 *              whose page reports another backend is retried once after an adapter re-check, then fails "no-webgpu".
 * --profile    a CPU profile of <s> seconds starting at <t> per view (summary in result.json, raw to profile.cpuprofile)
 * steps        per view, {at, label, js, waitMs?}: at `at` s the page evaluates js (its JSON return goes to probe[label]), waits waitMs
 *              (default 2500), then a full read goes into steps[]
 *
 * Before the first view: every other page in the Chrome is closed (orphan tabs contaminate every number); one blank sentinel
 * page in the default context keeps the browser alive between views. Per view, on its fresh about:blank, after 5 s: the
 * baseline {rafFps (blank-page rAF), heapMB (live heap after a forced GC)} -> result.baseline and result.contaminated
 * (pod-capture-lib contaminationVerdict against the first view's blank rAF, which is also cap: capDetected is false when
 * rAF ran above 61 fps, so fps can show headroom).
 * Summary (pod-capture-lib summariseView): fps, low1, GPU/CPU/cost ms from the cost window after the settled read (`from`
 * window|unsettled), heap MB/min the post-quiet long-run slope.
 * Per view: console (deduped), pageErrors, network (>= 400 and failed loads), http404s, gpuErrors (uncapturederror and device
 * loss), reads, settledAt, heapSlope (post-GC MB/min once GPU resource counts held 5 s), work, stages, hitches, probe, summary.
 * Exit 0 unless the tab could not be opened.
 */
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { viewDeadlineS, HUD_HIDE_JS, HUD_SHOW_JS, aimJs, ancestorPids, browserStoppedAnswering, needsChromeRestart, capVerdict, contaminationVerdict, podSetupCommand, counter, heapSlope, heapTop, settleGate, shotSettle, isStalled, lumaRatios, parseProfile, onePercentLow, parseShots, parseViews, prepSummary, screenMiddle, stalledReads, summariseProfile, summariseView, summaryTable, pausedClockViews, backendFailure, cpuTop } from "./pod-capture-lib.mjs";
import { pageProbe, workStats } from "./measure.mjs";
import { heapFit } from "./checks.mjs";
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
const readyTimeoutS = Number(opt("ready-timeout", 90)), captureTimeoutS = Number(opt("capture-timeout", 180));
const heapProfileAll = args.includes("--heap-profile"), cpuProfile = args.includes("--cpu-profile");
// a studio view without rate= runs a paused clock: not a game-speed measurement (diag10 T9)
const paused = pausedClockViews(views);
if (paused.length && !args.includes("--allow-paused")) { console.error(`pod-capture: views without rate= (paused clock): ${paused.join(", ")}; add rate=0.5 or pass --allow-paused`); process.exit(2); }

const CDP_TIMEOUT_MS = 30_000;          // a CDP call that does not answer in this long has stopped answering
const GC_TIMEOUT_MS = 10_000;           // a forced GC on a busy page; one timeout turns the view's forced GCs off
const HEAP_SAMPLE_EVERY_S = 10;         // post-GC heap sample interval during a view
const PING_TIMEOUT_MS = 10_000;         // Browser.getVersion health check between views
const CHROME_RESTART_TIMEOUT_MS = 180_000; // pod-setup.sh restart of the pod Chrome
const ADAPTER_WAIT_MS = 20_000;         // after every (re)connect, navigator.gpu.requestAdapter() must answer within this
const chromeMode = opt("chrome-mode", "webgpu");

let tunnel = null;
const closeOwn = () => { if (tunnel) closeTunnels({ pid: tunnel.pid }); tunnel = null; };
process.on("SIGINT", () => { closeOwn(); process.exit(130); });
process.on("SIGTERM", () => { closeOwn(); process.exit(143); });
// orphan guard (iter7: a capture outlived its agent by 1.5 h): exit when any ancestor process is gone
let openPage = null; // the view page currently open, closed by the orphan guard
const ancestors = ancestorPids(process.ppid);
setInterval(() => {
  const gone = ancestors.find((p) => { try { process.kill(p, 0); return false; } catch (e) { return e.code !== "EPERM"; } });
  if (!gone) return;
  console.error(`pod-capture: ancestor ${gone} gone, closing the view and exiting`);
  // the open view would keep rendering in the pod Chrome; finished views are already on disk
  Promise.race([closeViewPage(openPage), new Promise((r) => setTimeout(r, 3000))]).finally(() => { closeOwn(); process.exit(129); });
}, 5000).unref();
const pod = opt("pod");
if (pod) {
  const [sshBin, ...sshArgs] = pod.split(/\s+/);
  const chromeUp = () => {
    try { return execFileSync(sshBin, [...sshArgs.slice(0, -1), "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5", sshArgs.at(-1), "curl -s -m 3 127.0.0.1:9222/json/version"], { timeout: 8000, encoding: "utf8" }).includes("webSocketDebuggerUrl"); } catch { return false; }
  };
  // a pod Chrome that is down at start is restarted the same way as mid-run (pod-setup.sh), once
  if (!chromeUp()) {
    console.log(`pod-capture: pod Chrome down at start; restarting it (pod-setup.sh ${chromeMode})`);
    try { execSync(podSetupCommand(pod, chromeMode), { stdio: "inherit", timeout: CHROME_RESTART_TIMEOUT_MS }); } catch { /* checked below */ }
    if (!chromeUp()) { console.error(`pod Chrome down after pod-setup.sh: run POD_SSH="${pod}" bash tooling/gpu-lane/pod-sync.sh --check <lane>`); process.exit(3); }
  }
  tunnel = await openTunnel({ pod, purpose: "cdp-capture" });
}
const cdpHttp = (tunnel ? `http://127.0.0.1:${tunnel.localPort}` : opt("cdp", process.env.CHROME_CDP ?? "http://127.0.0.1:9222")).replace(/\/$/, "");

const all = { cdp: cdpHttp, startedAt: new Date().toISOString(), cap: null, orphansClosed: 0, recoveries: 0, adapterWaits: [], firstCaptureAt: null, prep: null, views: [] };
// The browser websocket (Target.*), open for the whole run; reopened after a Chrome restart (recoverChrome).
let bws = null, bNext = 0; const bPending = new Map();
async function connectBrowser() {
  bws = new WebSocket((await (await fetch(`${cdpHttp}/json/version`)).json()).webSocketDebuggerUrl);
  await new Promise((r, j) => { bws.onopen = r; bws.onerror = j; });
  bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { bPending.get(m.id)?.(m); bPending.delete(m.id); } };
  bws.onclose = () => { for (const f of bPending.values()) f({ error: { message: "browser closed" } }); bPending.clear(); };
  if (chromeMode === "webgpu") all.adapterWaits.push(await waitAdapter());
}
// about:blank is not a secure context (no navigator.gpu): the probe runs on the first view's origin, which is (http://localhost via the tunnel).
const ADAPTER_PROBE_JS = `(async () => { const gpuPresent = typeof navigator.gpu !== "undefined"; try { return { gpuPresent, adapter: Boolean(await navigator.gpu?.requestAdapter()) }; } catch { return { gpuPresent, adapter: false }; } })()`;
const adapterPage = () => `${new URL(views[0].url).origin}/`;
/** diag10 D5: right after a pod Chrome start the GPU process had no WebGPU adapter yet and the first view silently ran
 * WebGL2. Poll requestAdapter() on a throwaway page of the served origin until it answers (ADAPTER_WAIT_MS). */
async function waitAdapter() {
  const t0 = Date.now();
  let targetId = null, pws = null, id = 0, last = { gpuPresent: false, adapter: false };
  const page = adapterPage();
  try {
    ({ targetId } = await bsend("Target.createTarget", { url: page, background: true }));
    pws = new WebSocket(pageWs(targetId));
    await new Promise((r, j) => { pws.onopen = r; pws.onerror = j; });
    const waiting = new Map();
    pws.onmessage = (e) => { const m = JSON.parse(e.data); waiting.get(m.id)?.(m); waiting.delete(m.id); };
    const ev = () => new Promise((res) => {
      const k = ++id, t = setTimeout(() => res(false), 5000);
      waiting.set(k, (m) => { clearTimeout(t); res(m.result?.result?.value === true); });
      pws.send(JSON.stringify({ id: k, method: "Runtime.evaluate", params: { expression: ADAPTER_PROBE_JS, awaitPromise: true, returnByValue: true } }));
    });
    while (Date.now() - t0 < ADAPTER_WAIT_MS) {
      const r = await ev();
      if (r.adapter) return { ok: true, ms: Date.now() - t0, page, ...r };
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { ok: false, ms: Date.now() - t0, page, ...last };
  } catch (e) { return { ok: false, ms: Date.now() - t0, page, ...last, error: String(e.message) }; }
  finally { try { pws?.close(); } catch { /* gone */ } if (targetId) await bsend("Target.closeTarget", { targetId }).catch(() => {}); }
}
const bsend = (method, params = {}, timeoutMs = CDP_TIMEOUT_MS) => new Promise((res, rej) => {
  const id = ++bNext; const t = setTimeout(() => { bPending.delete(id); rej(new Error(`${method} timed out`)); }, timeoutMs);
  bPending.set(id, (m) => { clearTimeout(t); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
  bws.send(JSON.stringify({ id, method, params }));
});
const browserAlive = () => bsend("Browser.getVersion", {}, PING_TIMEOUT_MS).then(() => true, () => false);
/** The pod Chrome stopped answering (walk 10 vol r1: a forced GC timed out, then every createBrowserContext did):
 * restart it with pod-setup.sh over the --pod ssh (it owns Chrome; the CDP tunnel survives), reconnect, reopen the
 * sentinel. Without --pod there is nothing to restart and the run stops. */
async function recoverChrome() {
  if (!pod) throw new Error("Chrome stopped answering and there is no --pod to restart it");
  try { bws.close(); } catch { /* already closed */ }
  console.log(`pod-capture: Chrome stopped answering; restarting it (pod-setup.sh ${chromeMode})`);
  execSync(podSetupCommand(pod, chromeMode), { stdio: "inherit", timeout: CHROME_RESTART_TIMEOUT_MS });
  await connectBrowser();
  sentinel = (await bsend("Target.createTarget", { url: "about:blank", background: true })).targetId;
  all.recoveries++;
}
const pageWs = (targetId) => `${cdpHttp.replace(/^http/, "ws")}/devtools/page/${targetId}`;
await connectBrowser();

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

// ---- the view's page: openViewPage() points ws/send at a fresh target in a fresh browser context ----
mkdirSync(out, { recursive: true });
let ws = null, nextId = 0, sink = null, traceEv = null, traceDone = null;
const pending = new Map();
const onPageMessage = (e) => {
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
/** A fresh browser context and its about:blank page, attached, domains on, init script and device metrics set. */
async function openViewPage() {
  const { browserContextId } = await bsend("Target.createBrowserContext", { disposeOnDetach: false });
  const { targetId } = await bsend("Target.createTarget", { url: "about:blank", browserContextId, newWindow: true, background: false });
  ws = new WebSocket(pageWs(targetId));
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = onPageMessage;
  await send("Runtime.enable"); await send("HeapProfiler.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: INIT });
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  return (openPage = { targetId, browserContextId });
}
async function closeViewPage(page) {
  if (!page) return;
  if (page === openPage) openPage = null;
  try { ws?.close(); } catch { /* already closed */ }
  ws = null; for (const f of pending.values()) f({ error: { message: "page closed" } }); pending.clear();
  await bsend("Target.closeTarget", { targetId: page.targetId }).catch(() => {});
  await bsend("Target.disposeBrowserContext", { browserContextId: page.browserContextId }).catch(() => {});
}
/** A timed-out view (webgpu diag8 T6b: closeTarget and disposeBrowserContext blocked behind a busy renderer, and
 * every later createBrowserContext timed out): crash its renderer (Page.crash never replies), close it, and report
 * whether its target is still listed in /json/list (true = stuck: the caller restarts the pod Chrome). */
async function killViewPage(page) {
  if (!page) return false;
  try { ws?.send(JSON.stringify({ id: ++nextId, method: "Page.crash" })); } catch { /* socket already gone */ }
  await new Promise((r) => setTimeout(r, 1000));
  await Promise.race([closeViewPage(page), new Promise((r) => setTimeout(r, 15_000))]);
  try {
    const list = await (await fetch(`${cdpHttp}/json/list`, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) })).json();
    return list.some((t) => t.id === page.targetId);
  } catch { return true; }
}
/** The blank page's baseline: 5 s quiet, then its rAF rate and the live heap after a forced GC. */
async function baseline() {
  await new Promise((r) => setTimeout(r, 5000));
  const rafFps = r1(Number(await evaluate(BLANK_RAF, 10_000)));
  let heapMB = null;
  try { await send("HeapProfiler.collectGarbage", {}, GC_TIMEOUT_MS); heapMB = r1((await send("Runtime.getHeapUsage")).usedSize / 1e6); } catch { /* left null */ }
  return { rafFps, heapMB };
}
let aborted = false; // set while a timed-out view's body unwinds, so it can never reach the next view's page
const send = (method, params = {}, timeoutMs = CDP_TIMEOUT_MS) => new Promise((res, rej) => {
  if (aborted || !ws) { rej(new Error(`${method}: view aborted`)); return; }
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
/** A frame for the record: with the view's `clean`, the HUD is hidden around the screenshot only. */
const frameShot = async (view, quality) => {
  if (!view.clean) return shoot(quality);
  const hide = await evaluate(HUD_HIDE_JS);
  if (!hide?.ok) { await evaluate(HUD_SHOW_JS); throw new Error(`clean: ${JSON.stringify(hide)}`); }
  try { return await shoot(quality); } finally { await evaluate(HUD_SHOW_JS); }
};
// A full read: stalled flag, 1 %-low fps of the last ~300 rAF durations (raw durations dropped), screen-middle luma
const fullRead = async () => {
  const r = await evaluate(READ);
  if (!r || r.err) return r ?? { err: "no read" };
  r.stalled = isStalled(...(r.frames ?? [])); r.low1 = onePercentLow(r.rafMs ?? []); delete r.rafMs;
  try { Object.assign(r, await middleOf(await shoot(80))); } catch (e) { r.middleErr = String(e.message); }
  return r;
};

/** The cost window: measure.mjs's per-frame work probe and a filtered trace, together, for windowS seconds. */
async function costWindow(dir, atS, heapProfile = false) {
  // every allocation sampled, collected or not, so the profile total is the allocation rate (diag7 c9: gc hitches)
  if (heapProfile) await send("HeapProfiler.startSampling", { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }).catch(() => { heapProfile = false; });
  await evaluate(`(() => { const t0 = performance.now(); window.__HEAPS = []; clearInterval(window.__HEAPI);
    window.__HEAPI = setInterval(() => window.__HEAPS.push([(performance.now() - t0) / 1000, (performance.memory?.usedJSHeapSize ?? NaN) / 1e6]), 500); })()`);
  await evaluate(`(() => { const l = window.__GPU_LANE__; if (l) { l.frames = []; l.ts = []; l.wrapMs = 0; l.on = true; } })()`);
  traceEv = []; const done = new Promise((r) => { traceDone = r; });
  let traced = true;
  try { await send("Tracing.start", { traceConfig: { includedCategories: TRACE_CATEGORIES, recordMode: "recordContinuously" }, transferMode: "ReportEvents" }); } catch { traced = false; }
  // --cpu-profile (diag10 D2): V8 sampling profile at 200 us over the window; off while a --profile span is running
  let cpu = cpuProfile;
  if (cpu) { try { await send("Profiler.enable"); await send("Profiler.setSamplingInterval", { interval: 200 }); await send("Profiler.start"); } catch { cpu = false; } }
  await new Promise((r) => setTimeout(r, windowS * 1000));
  let cpuProf = null;
  if (cpu) { try { cpuProf = (await send("Profiler.stop", {}, 60_000)).profile; writeFileSync(join(dir, "window.cpuprofile"), JSON.stringify(cpuProf)); } catch (e) { cpuProf = { error: String(e.message) }; } }
  const raw = await evaluate(`(() => { const l = window.__GPU_LANE__; if (!l) return null; l.on = false;
    return { wrapMs: l.wrapMs, frames: l.frames.map((f) => ({ t: f.stamp, work: Math.max(f.end, f.msg) - f.start, gpu: f.gpu })) }; })()`, 30_000);
  const heapLine = heapFit(await evaluate(`(() => { clearInterval(window.__HEAPI); return window.__HEAPS ?? []; })()`));
  let stages = null, hitches = null, majorGCs = null;
  if (traced) {
    await send("Tracing.end"); await Promise.race([done, new Promise((r) => setTimeout(r, 60_000))]);
    writeFileSync(join(dir, "trace.json"), JSON.stringify({ traceEvents: traceEv }));
    stages = mainThreadStages(traceEv);
    majorGCs = traceEv.filter((e) => e.name === "MajorGC" && e.ph !== "E").length;
    const c = classifyFrames(traceEv, { overMs: 33 });
    hitches = { frames: c.frames, over33: c.over33 ?? 0, maxMs: c.maxMs ?? null, list: c.long.map((f) => ({ atS: f.atS, ms: f.ms, stage: topCause(f.byCause), byCause: f.byCause })) };
  }
  traceEv = null; traceDone = null;
  let heap = null, allocMBps = null;
  if (heapProfile) {
    try {
      const { profile } = await send("HeapProfiler.stopSampling", {}, 60_000);
      heap = heapTop(profile, 25);
      allocMBps = r1(heapTop(profile, Infinity).reduce((a, f) => a + f.selfMB, 0) / windowS);
      writeFileSync(join(dir, "heap.json"), JSON.stringify({ allocMBps, top: heap }, null, 1));
    } catch (e) { heap = { error: String(e.message) }; }
  }
  let work = null;
  if (raw?.frames) {
    for (let i = 0; i < raw.frames.length; i++) raw.frames[i].dt = i ? raw.frames[i].t - raw.frames[i - 1].t : 0;
    const { hitches: _h, ...w } = workStats(raw.frames);
    const dts = raw.frames.slice(1).map((f) => f.dt).filter((d) => d > 0);
    work = { ...w, wrapperMsPerFrame: raw.frames.length ? Math.round((raw.wrapMs / raw.frames.length) * 100) / 100 : null,
      wallFps: r1(raw.frames.length / windowS), low1: onePercentLow(dts) };
  }
  const cpuTopRes = !cpuProf ? null : cpuProf.error ? { error: cpuProf.error } : cpuTop(cpuProf, raw?.frames?.length ?? null, 25);
  return { at: atS, seconds: windowS, work, stages, cpuTop: cpuTopRes, hitches, heapTop: heap, heap: { fitMBPerMin: heapLine.mbPerMin, samples: heapLine.n, majorGCs, allocMBps } };
}

async function captureView(view) {
  const dir = join(out, view.name);
  mkdirSync(join(dir, "frames"), { recursive: true });
  const totalS = view.seconds ?? defaultS;
  const shotsSpec = view.shots ?? opt("shots"), shots = shotsSpec === "none" ? [] : parseShots(shotsSpec, totalS);
  const readsAt = readsSpec.split(",").map(Number).filter((s) => s < totalS);
  const steps = [...view.steps];
  sink = { cons: counter(), pageErrors: counter(), network: counter(), reqUrl: new Map() };
  const result = { name: view.name, url: view.url, seconds: totalS, frames: 0, reads: {}, settledAt: null, readyS: null, probe: {}, profile: null, window: null, baseline: null, contaminated: null };
  const ctl = { page: null };
  const body = viewBody(view, dir, totalS, shots, readsAt, steps, result, ctl);
  let timer;
  const limit = new Promise((r) => { timer = setTimeout(() => r("timeout"), viewDeadlineS(totalS, { readyS: readyTimeoutS, windowS, profileS: prof ? prof.seconds : 0, floorS: captureTimeoutS }) * 1000); });
  try {
    if (await Promise.race([body.then(() => "done"), limit]) === "timeout") {
      result.failed = "capture-timeout";
      aborted = true;
      result.targetStuck = await killViewPage(ctl.page); ctl.page = null;
      await Promise.race([body.catch(() => {}), new Promise((r) => setTimeout(r, 70_000))]); // the body unwinds (every await is bounded)
    }
  } catch (e) {
    result.error = String(e.stack ?? e);
  } finally {
    clearTimeout(timer);
    aborted = false;
    Object.assign(result, { console: sink.cons.list(), pageErrors: sink.pageErrors.list(), network: sink.network.list() });
    result.http404s = result.network.filter(([k]) => k.startsWith("404 ")).length;
    sink = null;
    result.summary = summariseView(result);
    writeFileSync(join(dir, "result.json"), JSON.stringify(result, null, 1));
    await closeViewPage(ctl.page);
  }
  return result;
}

async function viewBody(view, dir, totalS, shots, readsAt, steps, result, ctl) {
  {
    ctl.page = await openViewPage();
    result.baseline = await baseline();
    all.cap ??= capVerdict(result.baseline.rafFps);
    Object.assign(result.baseline, contaminationVerdict(result.baseline, all.cap.blankRafFps));
    result.contaminated = result.baseline.contaminated;
    all.firstCaptureAt ??= Date.now() / 1000;
    if (prof) { await send("Profiler.enable"); await send("Profiler.setSamplingInterval", { interval: 200 }); }
    const t0 = Date.now(), sec = () => (Date.now() - t0) / 1000;
    await send("Page.navigate", { url: view.url });
    const heapSamples = [];
    let si = 0, ri = 0, lastPoll = -1, zeroSince = null, profState = prof ? "wait" : "done";
    // plain views (a non-studio page: no HUD, no build queue) skip the settle gate and the ready limit, and run their seconds
    const gate = settledFrames > 0 && !view.plain ? settleGate(settledFrames, settleFloor) : null;
    const heapProfile = Boolean(view.heapProfile ?? heapProfileAll);
    let lastFrame = null, settleFrame = null;
    // shots wait for the shot settle gate (frame rate and luma steady; pod-capture-lib shotSettle); plain views and settle: false skip it
    const shotGate = view.plain || view.settle === false ? null : shotSettle(view.settle === true ? {} : view.settle);
    if (shotGate) result.shotSettle = { config: shotGate.config, at: null, timedOut: false };
    let flagPoll = -1;
    if (view.readyFlag) result.readyFlag = { name: view.readyFlag, at: null, timedOut: false };
    while (sec() < totalS) {
      if (aborted) return;
      const s = sec();
      if (!view.plain && result.readyS === null && s > readyTimeoutS) {
        result.failed = "not-ready";
        const last = await fullRead();
        result.lastState = { atS: r1(s), read: last, consoleTail: sink.cons.list().slice(-10), pageErrors: sink.pageErrors.list().slice(-5) };
        return;
      }
      if (profState === "wait" && s >= prof.at) { await send("Profiler.start"); profState = "on"; }
      if (profState === "on" && s >= prof.at + prof.seconds) {
        const { profile } = await send("Profiler.stop", {}, 60_000);
        writeFileSync(join(dir, "profile.cpuprofile"), JSON.stringify(profile));
        result.profile = { at: prof.at, ...summariseProfile(profile) }; profState = "done";
      }
      // `aim`: the camera is aimed once the studio's debug hook exists, and no frame is taken before it is
      if (view.aim && !result.aimedAt) { if ((await evaluate(aimJs(view.aim), 5_000)) === true) result.aimedAt = r1(sec()); }
      // `readyFlag`: no frame for the record before the page sets that global truthy (a harness scene's first compiled draw;
      // walk 10 vol r1: fire harness frames 1-3 black), or `--ready-timeout` passes (then `readyFlag.timedOut`)
      if (view.readyFlag && result.readyFlag.at === null && !result.readyFlag.timedOut && Math.floor(s * 2) > flagPoll) {
        flagPoll = Math.floor(s * 2);
        if ((await evaluate(`Boolean(window[${JSON.stringify(view.readyFlag)}])`, 5_000)) === true) result.readyFlag.at = r1(sec());
        else if (s > readyTimeoutS) result.readyFlag.timedOut = true;
      }
      const flagOpen = !view.readyFlag || result.readyFlag.at !== null || result.readyFlag.timedOut;
      // shot times count from the shot settle gate, else from the ready flag, else from navigation
      const shotT = shotGate ? (shotGate.at === null ? -1 : s - shotGate.at) : view.readyFlag && result.readyFlag.at !== null ? s - result.readyFlag.at : s;
      if (si < shots.length && flagOpen && shotT >= shots[si] && (!view.aim || result.aimedAt)) {
        while (si < shots.length && shots[si] <= shotT) si++;
        try { writeFileSync(join(dir, "frames", `${String(Math.round(s * 1000)).padStart(6, "0")}.jpg`), Buffer.from(await frameShot(view), "base64")); result.frames++; } catch { /* busy page: skip this frame */ }
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
        // A GC that times out is not a failed view: the page is busy, not gone; later samples are skipped
        // (walk 10 vol r1: an uncaught GC timeout ended a 380 s view and its page was never released).
        let heapMB;
        if (!result.gcOff && lastPoll % HEAP_SAMPLE_EVERY_S === 0) {
          try { await send("HeapProfiler.collectGarbage", {}, GC_TIMEOUT_MS); heapMB = (await send("Runtime.getHeapUsage")).usedSize / 1e6; }
          catch (e) { result.gcOff = `${r1(s)} s: ${e.message}`; }
        }
        if (q && !q.err) heapSamples.push({ s: lastPoll, heapMB, buffers: q.g, textures: q.x });
        if (result.readyS === null && q && !q.err && q.g > 0 && lastFrame !== null && q.f > lastFrame) result.readyS = r1(s);
        if (shotGate && shotGate.at === null && (!view.aim || result.aimedAt) && q && !q.err && Number.isFinite(q.f)) {
          const fps = settleFrame ? (q.f - settleFrame.f) / (s - settleFrame.s) : NaN;
          settleFrame = { f: q.f, s };
          let luma = NaN;
          try { luma = (await middleOf(await shoot(30))).luma; } catch { /* busy page: no sample */ }
          if (shotGate.feed(s, fps, luma)) Object.assign(result.shotSettle, { at: r1(shotGate.at), timedOut: shotGate.timedOut });
        }
        if (q && !q.err) lastFrame = q.f;
        if (gate?.feed(s, q, q?.f)) {
          result.reads.settled = { t: r1(sec()), gateAt: gate.settledAt, afterFrames: settledFrames, ...(await fullRead()) };
          if (windowS > 0 && !result.window) result.window = await costWindow(dir, r1(sec()), heapProfile);
        }
        if (q?.p === 0 && q.g > 0) { zeroSince ??= s; if (result.settledAt === null && s - zeroSince >= 5) result.settledAt = r1(zeroSince); } else zeroSince = null;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (windowS > 0 && !result.window) result.window = { ...(await costWindow(dir, r1(sec()), heapProfile)), unsettled: true };
    result.heapSlope = heapSlope(heapSamples);
    result.final = await fullRead();
    try { writeFileSync(join(dir, "final.jpg"), Buffer.from(await frameShot(view, 80), "base64")); } catch { /* final read has the luma */ }
    const g = await evaluate(`window.__GPUERR ?? []`);
    const gc = counter(); (Array.isArray(g) ? g : [JSON.stringify(g)]).forEach(gc.add);
    result.gpuErrors = gc.list();
    result.stalledReads = stalledReads(result.reads, result.final);
  }
}

const writeAll = () => {
  if (opt("prep")) { try { all.prep = prepSummary(readFileSync(opt("prep"), "utf8"), all.firstCaptureAt); } catch (e) { all.prep = { error: String(e.message) }; } }
  writeFileSync(join(out, "result.json"), JSON.stringify(all, null, 1));
  writeFileSync(join(out, "summary.md"), `${summaryTable(all.views, all.cap, all.prep?.steps ? all.prep : null)}\n`);
};
let sentinel = null;
try {
  sentinel = (await bsend("Target.createTarget", { url: "about:blank", background: true })).targetId;
  // orphan tabs keep rendering beside the measured page (walk 10: 90.8 ms frames with four open, 12.2 ms without)
  for (const t of await (await fetch(`${cdpHttp}/json/list`)).json()) {
    if (t.type === "page" && t.id !== sentinel) { await fetch(`${cdpHttp}/json/close/${t.id}`).catch(() => {}); all.orphansClosed++; }
  }
  for (const v of views) {
    if (!(await browserAlive())) await recoverChrome();
    let r = await captureView(v);
    if (needsChromeRestart(r, r.error && browserStoppedAnswering(r.error) ? await browserAlive() : true)) {
      await recoverChrome();
      // a view that never opened its page is run again on the fresh Chrome; one that ran keeps its partial result
      if (/createBrowserContext|createTarget/.test(r.error)) r = await captureView(v);
      r.recovered = true;
      writeFileSync(join(out, v.name, "result.json"), JSON.stringify(r, null, 1));
    }
    // diag10 D5: a WebGPU view that ran another backend is retried once after an adapter re-check, then failed "no-webgpu"
    if (backendFailure(v, r)) {
      const wait = await waitAdapter();
      all.adapterWaits.push({ ...wait, before: v.name });
      const retry = await captureView(v);
      r = backendFailure(v, retry) ? { ...retry, failed: "no-webgpu", retried: true } : { ...retry, retried: true };
      r.summary = summariseView(r);
      writeFileSync(join(out, v.name, "result.json"), JSON.stringify(r, null, 1));
    }
    all.views.push(r);
    writeAll();
    console.log(`pod-capture ${v.name}: ${JSON.stringify(r.summary)}`);
  }
  const byName = Object.fromEntries(all.views.map((v) => [v.name, v]));
  if (byName.main && byName.compare) byName.main.lumaRatio = lumaRatios(byName.main.reads, byName.compare.reads, byName.main.final, byName.compare.final);
} catch (e) {
  all.error = String(e.stack ?? e);
} finally {
  if (sentinel) await bsend("Target.closeTarget", { targetId: sentinel }).catch(() => {});
  bws.close();
  closeOwn();
  writeAll();
}
console.log(`pod-capture: ${all.views.length}/${views.length} views, ${all.recoveries} Chrome restarts, cap detected ${all.cap?.capDetected} (blank rAF ${all.cap?.blankRafFps}), orphans closed ${all.orphansClosed}, contaminated ${all.views.filter((v) => v.contaminated).map((v) => v.name).join(",") || "none"}${all.error ? `, ERROR ${all.error.split("\n")[0]}` : ""} -> ${out}/summary.md`);
process.exit(0);
