/**
 * Capture one studio URL on an ALREADY-RUNNING real-GPU Chrome (the RunPod pod's, reached through
 * the ssh -L tunnel on 127.0.0.1:9222) over raw per-tab CDP: a new target, its own websocket, the
 * target closed at the end. Not playwright's connectOverCDP (it hangs on the shared pod Chrome,
 * walk 10). One capture at a time per Chrome.
 *
 *   node tooling/gpu-lane/pod-capture.mjs --url <url> --out <dir> [--seconds 120] [--cdp http://127.0.0.1:9222]
 *     [--shots 500@60,2000] [--reads 15,30,60,120] [--profile <s>@<t>] [--fps-reads N] [--steps <json>] [--width 1280 --height 720] [--compare <url>]
 *
 * --url        page to load (e.g. http://127.0.0.1:8199/elder-souls-argonia/webgpu/?view=character&x=..&z=..&t=12&diag=1)
 * --out        directory for result.json, frames/<ms>.jpg and final.jpg (created)
 * --seconds    capture length (default 120)
 * --cdp        DevTools HTTP endpoint (default $CHROME_CDP or http://127.0.0.1:9222)
 * --shots      JPEG frame schedule: every <fastMs> to <fastUntilS>, then every <slowMs> (default 500@60,2000); "none" for no frames
 * --reads      seconds at which to read screen-middle luma and blackShare (x 30-70 %, y 40-90 %, luma <= 3, the
 *              boot-check's black-view window), the HUD lines, performance.memory, __RENDERER__ info, __DIAG,
 *              __STUDIO_FPS__ and __STUDIO_GPU_MS__ (default 15,30,60,120; clipped to --seconds)
 * --profile    a CPU profile of <s> seconds starting at <t>; the summary goes in result.json, the raw profile to profile.cpuprofile
 * --fps-reads  after the capture, N further reads of fps / GPU ms 2 s apart (default 0)
 * --steps     JSON file: a list of {at, label, js, waitMs?}; at each `at` second the page evaluates js, waits waitMs (default 2500),
 *              then records a full read (with screen-middle luma) into result.steps; sorted by `at`
 * --settled-frames N  after the settle gate (queue at 0 pending with geometry for 5 s, no earlier than 20 s; a build without
 *              a queue counts as 0 pending) count N renderer frames, then a full read into reads.settled (default 300; 0 = off).
 *              lumaRatio.settled is the comparable luma ratio; the fixed-second reads drift with streaming.
 * --compare   after the main capture, capture this URL with the same schedule into <out>/compare/; result.json gets lumaRatio
 *              (main luma / compare luma per read and final)
 *
 * The tab opens in its own window (Target.createTarget newWindow). Every read samples the renderer frame counter twice 1 s apart
 * (__RENDERER__.info.render.frame, else an rAF counter the init script installs) and carries `stalled: true` when it did not
 * advance; its luma/fps are reported but flagged, and result.stalledReads lists them.
 *
 * result.json: console (error/warning, deduped with counts), pageErrors, network (>=400 and failed loads),
 * gpuErrors (uncapturederror and device loss, hooked in requestDevice; the hook skips documents without
 * GPU globals), reads, settledAt (first second the build queue sat at 0 pending with geometry loaded for
 * 5 s), heapSlope ({ quietAt, mbPerMin, seconds }: least-squares post-GC heap MB/min (a forced GC every 10 s) from the first second
 * geometry and texture counts held still for 5 s; null under 20 quiet seconds), fpsReads, profile, frames. Exit 0 unless the tab could not be opened.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { counter, heapSlope, settleGate, isStalled, lumaRatios, parseProfile, onePercentLow, parseShots, parseSteps, screenMiddle, stalledReads, summariseProfile } from "./pod-capture-lib.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const url = opt("url"), out = opt("out");
if (!url || !out) { console.error("usage: pod-capture.mjs --url <url> --out <dir> [flags; see header]"); process.exit(2); }
const totalS = Number(opt("seconds", 120)), cdpHttp = opt("cdp", process.env.CHROME_CDP ?? "http://127.0.0.1:9222").replace(/\/$/, "");
const shotsSpec = opt("shots"), shots = shotsSpec === "none" ? [] : parseShots(shotsSpec, totalS);
const steps = opt("steps") ? parseSteps(readFileSync(opt("steps"), "utf8")) : [];
const readsAt = opt("reads", "15,30,60,120").split(",").map(Number).filter((s) => s < totalS); // a read at --seconds is result.final
const prof = opt("profile") ? parseProfile(opt("profile")) : null, fpsReads = Number(opt("fps-reads", 0));
const W = Number(opt("width", 1280)), H = Number(opt("height", 720));
const compareUrl = opt("compare"), settledFrames = Number(opt("settled-frames", 300));

// Own window per capture tab: Target.createTarget on the browser websocket, newWindow, foreground.
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

async function capture(url, out) {
mkdirSync(join(out, "frames"), { recursive: true });
const target = await openWindow();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 0; const pending = new Map();
const cons = counter(), pageErrors = counter(), network = counter(), reqUrl = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); return; }
  const p = m.params;
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(p.type)) cons.add(`${p.type}: ${p.args.map((a) => a.value ?? a.description).join(" ")}`);
  else if (m.method === "Runtime.exceptionThrown") pageErrors.add(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text);
  else if (m.method === "Network.requestWillBeSent") reqUrl.set(p.requestId, p.request.url);
  else if (m.method === "Network.responseReceived" && p.response.status >= 400) network.add(`${p.response.status} ${p.response.url}`);
  else if (m.method === "Network.loadingFailed" && !p.canceled) network.add(`FAILED ${reqUrl.get(p.requestId) ?? p.requestId} ${p.errorText}`);
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

// init script: perf HUD open; GPU errors from every device (skipped where the document has no WebGPU)
const INIT = `(() => {
  try { localStorage.setItem("es.hud.perfOpen", "1"); } catch {}
  window.__GPUERR = []; window.__RAFN = 0;
  window.__RAFMS = []; let lastT = 0;
  const tick = (t) => { window.__RAFN++; if (lastT) { window.__RAFMS.push(t - lastT); if (window.__RAFMS.length > 600) window.__RAFMS.shift(); } lastT = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  // renderers: getContext calls per canvas and GPU devices requested (one renderer per canvas = 1 and 1)
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
})();`;
const SCREEN_MIDDLE = String(screenMiddle);
const READ = `(async () => {
  const r = window.__RENDERER__, i = r?.info, q = r?.esBuildQueue, pm = performance.memory;
  const frame = () => window.__RENDERER__?.info?.render?.frame ?? window.__RAFN;
  const f1 = frame(); await new Promise((res) => setTimeout(res, 1000)); const f2 = frame();
  const rafMs = (window.__RAFMS ?? []).slice(-300);
  return { rafMs, frames: [f1, f2], backend: window.__RENDERER_BACKEND__ ?? (r?.backend?.isWebGPUBackend ? "webgpu" : undefined),
    fps: window.__STUDIO_FPS__, gpuMs: window.__STUDIO_GPU_MS__ && JSON.parse(JSON.stringify(window.__STUDIO_GPU_MS__)),
    renderer: i && { geometries: i.memory?.geometries, textures: i.memory?.textures, triangles: i.render?.triangles, calls: i.render?.drawCalls ?? i.render?.calls },
    buildQueue: q && { pending: q.pending, twinsHeld: q.twinsHeld, skippedDraws: q.skippedDraws },
    contexts: window.__CTX && JSON.parse(JSON.stringify(window.__CTX)),
    diag: (() => { try { return window.__DIAG && JSON.parse(JSON.stringify(window.__DIAG)); } catch (e) { return String(e); } })(),
    heapMB: pm && Math.round(pm.usedJSHeapSize / 1e6), heapLimitMB: pm && Math.round(pm.jsHeapSizeLimit / 1e6),
    hud: document.body.innerText.split("\\n").filter((l) => /fps|ms|draw|tri|calls|gpu|cpu|pass|stage|skipped|pending|twin|perf|scene/i.test(l)).slice(0, 40) };
})()`;
// 1 %-low fps of the last ~300 rAF frame durations (the settle window), kept beside fps; the raw durations are dropped
const noteLow1 = (r) => { if (r && !r.err) { r.low1 = onePercentLow(r.rafMs ?? []); delete r.rafMs; } };
const middleOf = (b64) => evaluate(`(async () => {
  const screenMiddle = ${SCREEN_MIDDLE};
  const bm = await createImageBitmap(await (await fetch("data:image/jpeg;base64,${b64}")).blob());
  const oc = new OffscreenCanvas(bm.width, bm.height), x = oc.getContext("2d"); x.drawImage(bm, 0, 0);
  return screenMiddle(x.getImageData(0, 0, bm.width, bm.height).data, bm.width, bm.height);
})()`, 20_000);
const shoot = async (quality = 60) => (await send("Page.captureScreenshot", { format: "jpeg", quality }, 20_000)).data;

const result = { url, cdp: cdpHttp, seconds: totalS, frames: 0, reads: {}, settledAt: null, fpsReads: [], profile: null };
try {
  await send("Runtime.enable"); await send("HeapProfiler.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: INIT });
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  if (prof) { await send("Profiler.enable"); await send("Profiler.setSamplingInterval", { interval: 200 }); }
  const t0 = Date.now(), sec = () => (Date.now() - t0) / 1000;
  await send("Page.navigate", { url });
  const heapSamples = [];
  let si = 0, ri = 0, lastPoll = -1, zeroSince = null, gate = settledFrames > 0 ? settleGate(settledFrames) : null, profState = prof ? "wait" : "done";
  while (sec() < totalS) {
    const s = sec();
    if (profState === "wait" && s >= prof.at) { await send("Profiler.start"); profState = "on"; }
    if (profState === "on" && s >= prof.at + prof.seconds) {
      const { profile } = await send("Profiler.stop", {}, 60_000);
      writeFileSync(join(out, "profile.cpuprofile"), JSON.stringify(profile));
      result.profile = { at: prof.at, ...summariseProfile(profile) }; profState = "done";
    }
    if (si < shots.length && s >= shots[si]) {
      while (si < shots.length && shots[si] <= s) si++;
      try { writeFileSync(join(out, "frames", `${String(Math.round(s * 1000)).padStart(6, "0")}.jpg`), Buffer.from(await shoot(), "base64")); result.frames++; } catch { /* busy page: skip this frame */ }
    }
    if (ri < readsAt.length && s >= readsAt[ri]) {
      ri++;
      const r = await evaluate(READ); r.stalled = isStalled(...(r.frames ?? [])); noteLow1(r);
      try { Object.assign(r, await middleOf(await shoot(80))); } catch (e) { r.middleErr = String(e.message); }
      result.reads[readsAt[ri - 1]] = { t: Math.round(sec() * 10) / 10, ...r };
    }
    if (steps.length && s >= steps[0].at) {
      const st = steps.shift();
      const rec = { label: st.label, at: Math.round(s * 10) / 10 };
      try { rec.value = await evaluate(st.js); } catch (e) { rec.err = String(e.message); }
      await new Promise((r) => setTimeout(r, st.waitMs ?? 2500));
      const r = await evaluate(READ); r.stalled = isStalled(...(r.frames ?? [])); noteLow1(r);
      try { Object.assign(r, await middleOf(await shoot(80))); } catch (e) { r.middleErr = String(e.message); }
      rec.read = { middle: r.middle ?? r.luma ?? null, ...Object.fromEntries(Object.entries(r).filter(([k]) => !["hud", "diag", "contexts"].includes(k))) };
      (result.steps ??= []).push(rec);
    }
    if (Math.floor(s) > lastPoll) {
      lastPoll = Math.floor(s);
      const q = await evaluate(`({ f: window.__RENDERER__?.info?.render?.frame ?? window.__RAFN, p: window.__RENDERER__?.esBuildQueue?.pending, g: window.__RENDERER__?.info?.memory?.geometries ?? 0, x: window.__RENDERER__?.info?.memory?.textures ?? 0 })`, 5_000);
      // live heap after a forced GC, every 10 s: usedJSHeapSize counts uncollected garbage (walk 10 read
      // +140 MB/min of churn as a leak while the post-GC heap held at ~222 MB)
      let heapMB;
      if (lastPoll % 10 === 0) { await send("HeapProfiler.collectGarbage", {}, 30_000); heapMB = (await send("Runtime.getHeapUsage")).usedSize / 1e6; }
      if (q && !q.err) heapSamples.push({ s: lastPoll, heapMB, buffers: q.g, textures: q.x });
      if (gate?.feed(s, q, q?.f)) {
        const r = await evaluate(READ); r.stalled = isStalled(...(r.frames ?? [])); noteLow1(r);
        try { Object.assign(r, await middleOf(await shoot(80))); } catch (e) { r.middleErr = String(e.message); }
        result.reads.settled = { t: Math.round(sec() * 10) / 10, gateAt: gate.settledAt, afterFrames: settledFrames, ...r };
      }
      if (q?.p === 0 && q.g > 0) { zeroSince ??= s; if (result.settledAt === null && s - zeroSince >= 5) result.settledAt = Math.round(zeroSince * 10) / 10; } else zeroSince = null;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  for (let k = 0; k < fpsReads; k++) {
    result.fpsReads.push(await evaluate(`({ fps: window.__STUDIO_FPS__, gpuMs: window.__STUDIO_GPU_MS__ && JSON.parse(JSON.stringify(window.__STUDIO_GPU_MS__)), perf: document.body.innerText.split("\\n").find((l) => /^perf/.test(l)) })`));
    await new Promise((r) => setTimeout(r, 2000));
  }
  result.heapSlope = heapSlope(heapSamples);
  result.final = await evaluate(READ); result.final.stalled = isStalled(...(result.final.frames ?? [])); noteLow1(result.final);
  try { const b64 = await shoot(80); writeFileSync(join(out, "final.jpg"), Buffer.from(b64, "base64")); Object.assign(result.final, await middleOf(b64)); } catch (e) { result.final.middleErr = String(e.message); }
  const g = await evaluate(`window.__GPUERR ?? []`);
  const gc = counter(); (Array.isArray(g) ? g : [JSON.stringify(g)]).forEach(gc.add);
  result.gpuErrors = gc.list();
  result.stalledReads = stalledReads(result.reads, result.final);
} catch (e) {
  result.error = String(e.stack ?? e);
} finally {
  Object.assign(result, { console: cons.list(), pageErrors: pageErrors.list(), network: network.list() });
  writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 1));
  ws.close();
  await fetch(`${cdpHttp}/json/close/${target.id}`).catch(() => {});
}
return result;
}

const result = await capture(url, out);
if (compareUrl) {
  const cmp = await capture(compareUrl, join(out, "compare"));
  result.lumaRatio = lumaRatios(result.reads, cmp.reads, result.final, cmp.final);
  result.compare = { url: compareUrl, stalledReads: cmp.stalledReads };
  writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 1));
}
const last = result.final ?? {};
console.log(`pod-capture: ${result.frames} frames, settledAt ${result.settledAt}, middle luma ${last.luma} blackShare ${last.blackShare}, fps ${last.fps}, heap ${result.heapSlope?.mbPerMin} MB/min from ${result.heapSlope?.quietAt}s, gpuErrors ${result.gpuErrors?.length ?? "?"}, stalled reads [${(result.stalledReads ?? []).join(",")}], console ${result.console.length}, pageErrors ${result.pageErrors.length}, network ${result.network.length}${result.error ? `, ERROR ${result.error.split("\n")[0]}` : ""} -> ${out}/result.json`);
process.exit(0);
