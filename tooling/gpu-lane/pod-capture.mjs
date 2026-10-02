/**
 * Capture one studio URL on an ALREADY-RUNNING real-GPU Chrome (the RunPod pod's, reached through
 * the ssh -L tunnel on 127.0.0.1:9222) over raw per-tab CDP: a new target, its own websocket, the
 * target closed at the end. Not playwright's connectOverCDP (it hangs on the shared pod Chrome,
 * walk 10). One capture at a time per Chrome.
 *
 *   node tooling/gpu-lane/pod-capture.mjs --url <url> --out <dir> [--seconds 120] [--cdp http://127.0.0.1:9222]
 *     [--shots 500@60,2000] [--reads 15,30,60,120] [--profile <s>@<t>] [--fps-reads N] [--width 1280 --height 720]
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
 *
 * result.json: console (error/warning, deduped with counts), pageErrors, network (>=400 and failed loads),
 * gpuErrors (uncapturederror and device loss, hooked in requestDevice; the hook skips documents without
 * GPU globals), reads, settledAt (first second the build queue sat at 0 pending with geometry loaded for
 * 5 s), fpsReads, profile, frames. Exit 0 unless the tab could not be opened.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { counter, parseProfile, parseShots, screenMiddle, summariseProfile } from "./pod-capture-lib.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const url = opt("url"), out = opt("out");
if (!url || !out) { console.error("usage: pod-capture.mjs --url <url> --out <dir> [flags; see header]"); process.exit(2); }
const totalS = Number(opt("seconds", 120)), cdpHttp = opt("cdp", process.env.CHROME_CDP ?? "http://127.0.0.1:9222").replace(/\/$/, "");
const shotsSpec = opt("shots"), shots = shotsSpec === "none" ? [] : parseShots(shotsSpec, totalS);
const readsAt = opt("reads", "15,30,60,120").split(",").map(Number).filter((s) => s < totalS); // a read at --seconds is result.final
const prof = opt("profile") ? parseProfile(opt("profile")) : null, fpsReads = Number(opt("fps-reads", 0));
const W = Number(opt("width", 1280)), H = Number(opt("height", 720));
mkdirSync(join(out, "frames"), { recursive: true });

const target = await (await fetch(`${cdpHttp}/json/new?about:blank`, { method: "PUT" })).json();
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
  window.__GPUERR = [];
  if (typeof GPUAdapter === "undefined") return;
  const req = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...a) {
    const d = await req.apply(this, a);
    d.addEventListener("uncapturederror", (e) => window.__GPUERR.push(String(e.error?.message).slice(0, 300)));
    d.lost.then((i) => window.__GPUERR.push("LOST " + i.reason + " " + i.message));
    return d;
  };
})();`;
const SCREEN_MIDDLE = String(screenMiddle);
const READ = `(async () => {
  const r = window.__RENDERER__, i = r?.info, q = r?.esBuildQueue, pm = performance.memory;
  return { backend: window.__RENDERER_BACKEND__ ?? (r?.backend?.isWebGPUBackend ? "webgpu" : undefined),
    fps: window.__STUDIO_FPS__, gpuMs: window.__STUDIO_GPU_MS__ && JSON.parse(JSON.stringify(window.__STUDIO_GPU_MS__)),
    renderer: i && { geometries: i.memory?.geometries, textures: i.memory?.textures, triangles: i.render?.triangles, calls: i.render?.drawCalls ?? i.render?.calls },
    buildQueue: q && { pending: q.pending, twinsHeld: q.twinsHeld, skippedDraws: q.skippedDraws },
    diag: (() => { try { return window.__DIAG && JSON.parse(JSON.stringify(window.__DIAG)); } catch (e) { return String(e); } })(),
    heapMB: pm && Math.round(pm.usedJSHeapSize / 1e6), heapLimitMB: pm && Math.round(pm.jsHeapSizeLimit / 1e6),
    hud: document.body.innerText.split("\\n").filter((l) => /fps|ms|draw|tri|calls|gpu|cpu|pass|stage|skipped|pending|twin|perf|scene/i.test(l)).slice(0, 40) };
})()`;
const middleOf = (b64) => evaluate(`(async () => {
  const screenMiddle = ${SCREEN_MIDDLE};
  const bm = await createImageBitmap(await (await fetch("data:image/jpeg;base64,${b64}")).blob());
  const oc = new OffscreenCanvas(bm.width, bm.height), x = oc.getContext("2d"); x.drawImage(bm, 0, 0);
  return screenMiddle(x.getImageData(0, 0, bm.width, bm.height).data, bm.width, bm.height);
})()`, 20_000);
const shoot = async (quality = 60) => (await send("Page.captureScreenshot", { format: "jpeg", quality }, 20_000)).data;

const result = { url, cdp: cdpHttp, seconds: totalS, frames: 0, reads: {}, settledAt: null, fpsReads: [], profile: null };
try {
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: INIT });
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  if (prof) { await send("Profiler.enable"); await send("Profiler.setSamplingInterval", { interval: 200 }); }
  const t0 = Date.now(), sec = () => (Date.now() - t0) / 1000;
  await send("Page.navigate", { url });
  let si = 0, ri = 0, lastPoll = -1, zeroSince = null, profState = prof ? "wait" : "done";
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
      const r = await evaluate(READ);
      try { Object.assign(r, await middleOf(await shoot(80))); } catch (e) { r.middleErr = String(e.message); }
      result.reads[readsAt[ri - 1]] = { t: Math.round(sec() * 10) / 10, ...r };
    }
    if (Math.floor(s) > lastPoll) {
      lastPoll = Math.floor(s);
      const q = await evaluate(`({ p: window.__RENDERER__?.esBuildQueue?.pending, g: window.__RENDERER__?.info?.memory?.geometries ?? 0 })`, 5_000);
      if (q?.p === 0 && q.g > 0) { zeroSince ??= s; if (result.settledAt === null && s - zeroSince >= 5) result.settledAt = Math.round(zeroSince * 10) / 10; } else zeroSince = null;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  for (let k = 0; k < fpsReads; k++) {
    result.fpsReads.push(await evaluate(`({ fps: window.__STUDIO_FPS__, gpuMs: window.__STUDIO_GPU_MS__ && JSON.parse(JSON.stringify(window.__STUDIO_GPU_MS__)), perf: document.body.innerText.split("\\n").find((l) => /^perf/.test(l)) })`));
    await new Promise((r) => setTimeout(r, 2000));
  }
  result.final = await evaluate(READ);
  try { const b64 = await shoot(80); writeFileSync(join(out, "final.jpg"), Buffer.from(b64, "base64")); Object.assign(result.final, await middleOf(b64)); } catch (e) { result.final.middleErr = String(e.message); }
  const g = await evaluate(`window.__GPUERR ?? []`);
  const gc = counter(); (Array.isArray(g) ? g : [JSON.stringify(g)]).forEach(gc.add);
  result.gpuErrors = gc.list();
} catch (e) {
  result.error = String(e.stack ?? e);
} finally {
  Object.assign(result, { console: cons.list(), pageErrors: pageErrors.list(), network: network.list() });
  writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 1));
  ws.close();
  await fetch(`${cdpHttp}/json/close/${target.id}`).catch(() => {});
}
const last = result.final ?? {};
console.log(`pod-capture: ${result.frames} frames, settledAt ${result.settledAt}, middle luma ${last.luma} blackShare ${last.blackShare}, fps ${last.fps}, gpuErrors ${result.gpuErrors?.length ?? "?"}, console ${result.console.length}, pageErrors ${result.pageErrors.length}, network ${result.network.length}${result.error ? `, ERROR ${result.error.split("\n")[0]}` : ""} -> ${out}/result.json`);
process.exit(0);
