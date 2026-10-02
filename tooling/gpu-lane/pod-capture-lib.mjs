import { readFileSync } from "node:fs";
import { topCause } from "./trace-frames.mjs";
/** Pure parts of pod-capture.mjs (unit-tested in pod-capture-lib.test.mjs). */

/**
 * Screen-middle luma and black share of an RGBA buffer, the same window and threshold
 * webgpu-boot-check.mjs fails a black view on: x 30-70 %, y 40-90 % (clear of the HUD), luma <= 3.
 * Self-contained so pod-capture passes its source into the page (`String(screenMiddle)`).
 */
export function screenMiddle(data, width, height) {
  const x0 = Math.floor(width * 0.3), x1 = Math.floor(width * 0.7), y0 = Math.floor(height * 0.4), y1 = Math.floor(height * 0.9);
  let sum = 0, dark = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * width + x) * 4, l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += l; if (l <= 3) dark++; n++;
  }
  return n ? { luma: Math.round((sum / n) * 100) / 100, blackShare: Math.round((dark / n) * 1000) / 1000 } : { luma: null, blackShare: null };
}

/** Counting dedupe: add(key) per occurrence; list() is [[key, count]] most frequent first. */
export function counter(maxLen = 300) {
  const m = new Map();
  return {
    add(k) { k = String(k).slice(0, maxLen); m.set(k, (m.get(k) ?? 0) + 1); },
    list() { return [...m].sort((a, b) => b[1] - a[1]); },
  };
}

/**
 * Frame times in seconds: every `fastMs` up to `fastUntilS`, then every `slowMs` up to `totalS` (inclusive).
 * Parsed from "--shots 500@60,2000@120" by parseShots.
 */
export function shotSchedule({ fastMs = 500, fastUntilS = 60, slowMs = 2000, totalS = 120 } = {}) {
  const out = [];
  for (let t = 0; t < Math.min(fastUntilS, totalS) * 1000; t += fastMs) out.push(t / 1000);
  for (let t = Math.min(fastUntilS, totalS) * 1000; t <= totalS * 1000; t += slowMs) out.push(t / 1000);
  return out;
}

export function parseShots(spec, totalS) {
  const m = /^(\d+)@(\d+(?:\.\d+)?),(\d+)$/.exec(spec ?? "");
  if (!spec) return shotSchedule({ totalS });
  if (!m) throw new Error(`--shots wants <fastMs>@<fastUntilS>,<slowMs>, got ${spec}`);
  return shotSchedule({ fastMs: +m[1], fastUntilS: +m[2], slowMs: +m[3], totalS });
}

/** "--profile 10@60" -> { seconds: 10, at: 60 } */
export function parseProfile(spec) {
  const m = /^(\d+(?:\.\d+)?)@(\d+(?:\.\d+)?)$/.exec(spec ?? "");
  if (!m) throw new Error(`--profile wants <seconds>@<startS>, got ${spec}`);
  return { seconds: +m[1], at: +m[2] };
}

/** CPU profile -> top self and total time by function (ms). */
export function summariseProfile(profile, n = 30) {
  const nodes = new Map(profile.nodes.map((x) => [x.id, x])), parent = new Map();
  profile.nodes.forEach((x) => (x.children ?? []).forEach((c) => parent.set(c, x.id)));
  const key = (x) => `${x.callFrame.functionName || "(anon)"} @ ${x.callFrame.url.split("/").pop()}:${x.callFrame.lineNumber}:${x.callFrame.columnNumber}`;
  const self = new Map(), total = new Map();
  profile.samples.forEach((id, i) => {
    const dt = profile.timeDeltas[i] ?? 0, k = key(nodes.get(id));
    self.set(k, (self.get(k) ?? 0) + dt);
    const seen = new Set();
    for (let c = id; c; c = parent.get(c)) { const kk = key(nodes.get(c)); if (!seen.has(kk)) { seen.add(kk); total.set(kk, (total.get(kk) ?? 0) + dt); } }
  });
  const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([f, us]) => [f, Math.round(us / 1000)]);
  return { totalMs: Math.round((profile.endTime - profile.startTime) / 1000), selfTop: top(self, n), totalTop: top(total, 15) };
}

/**
 * Heap slope in MB/min over the samples taken after the GPU resource counts went quiet.
 * samples: [{ s, heapMB, buffers, textures }] one per second. The window starts at the first second
 * from which buffers and textures held unchanged for `quietS` seconds (walk 10: a slope read while the
 * world still streams in measured load, not a leak). Least squares; null until `minS` quiet seconds exist.
 */
export function heapSlope(samples, { quietS = 5, minS = 20 } = {}) {
  let quietAt = null;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    let j = i;
    while (j + 1 < samples.length && samples[j + 1].buffers === a.buffers && samples[j + 1].textures === a.textures) j++;
    if (samples[j].s - a.s >= quietS) { quietAt = a.s; break; }
    i = j;
  }
  if (quietAt === null) return { quietAt: null, mbPerMin: null, seconds: 0 };
  const w = samples.filter((x) => x.s >= quietAt && Number.isFinite(x.heapMB));
  const seconds = w.length ? w.at(-1).s - w[0].s : 0;
  if (seconds < minS) return { quietAt, mbPerMin: null, seconds };
  const n = w.length, ms = w.reduce((t, x) => t + x.s, 0) / n, mh = w.reduce((t, x) => t + x.heapMB, 0) / n;
  const num = w.reduce((t, x) => t + (x.s - ms) * (x.heapMB - mh), 0), den = w.reduce((t, x) => t + (x.s - ms) ** 2, 0);
  return { quietAt, mbPerMin: Math.round((num / den) * 60 * 10) / 10, seconds };
}

/** A read is stalled when the renderer frame counter did not advance over the 1 s between its two samples (or is unreadable). */
export function isStalled(a, b) {
  return !(Number.isFinite(a) && Number.isFinite(b) && b > a);
}

/** Keys of the reads (incl. "final") marked `stalled: true`. */
export function stalledReads(reads, final) {
  const keys = Object.keys(reads).filter((k) => reads[k]?.stalled);
  return final?.stalled ? [...keys, "final"] : keys;
}

/** Per-read luma ratio main/compare, keyed like the reads (plus "final"); null when either luma is missing or compare is 0. */
export function lumaRatios(mainReads, compareReads, mainFinal, compareFinal) {
  const ratio = (m, c) => (Number.isFinite(m?.luma) && Number.isFinite(c?.luma) && c.luma > 0 ? Math.round((m.luma / c.luma) * 1000) / 1000 : null);
  const out = {};
  for (const k of Object.keys(mainReads)) out[k] = ratio(mainReads[k], compareReads?.[k]);
  out.final = ratio(mainFinal, compareFinal);
  return out;
}

/** The settled read: once the build queue has sat at 0 pending (a build with no queue counts as 0) with geometry
 * loaded for 5 s, and at least floorS seconds after navigation, count n renderer frames and then read. Luma read at a
 * frame count after this gate compares like with like across builds; fixed seconds did not (walk 10: ratios 0.05-3.7).
 * feed(s, {p, g}, frame) returns true once, on the poll where the read is due. */
export function settleGate(n = 300, floorS = 20) {
  let zeroSince = null, f0 = null, done = false;
  return {
    get settledAt() { return zeroSince !== null && f0 !== null ? Math.round(zeroSince * 10) / 10 : null; },
    feed(s, q, frame) {
      if (done) return false;
      if (f0 === null) {
        if ((q?.p ?? 0) === 0 && q?.g > 0) zeroSince ??= s; else zeroSince = null;
        if (zeroSince !== null && s - zeroSince >= 5 && s >= floorS && Number.isFinite(frame)) f0 = frame;
        return false;
      }
      if (Number.isFinite(frame) && frame - f0 >= n) { done = true; return true; }
      return false;
    },
  };
}

/** The shot settle gate (default on for every non-plain view; a view's `settle: false` turns it off, `settle: {seconds,
 * lumaTol, lumaFloor, fpsTol, minS, timeoutS}` tunes it): no frame for the record is taken before `minS` after navigation
 * (a steady start can precede the transient) and then until, over the last `seconds` of 1 s samples, the fps median
 * of the window's second half sits within fpsTol x median of its first half's (drift), and the screen-middle luma's
 * p10-p90 spread is within max(lumaTol x median, lumaFloor) luma units, or until `timeoutS` after navigation (then
 * `timedOut`). Robust statistics, not (max - min) / mean: walk 10 vol r1 timed out 20 of 21 views on one-read fps
 * hitches and on dark frames (luma 1.7, where 4 % is 0.07 units); an exposure ramp or an fps step still holds the gate
 * shut. Shot times count from the gate. */
export const SHOT_SETTLE_DEFAULT = { seconds: 8, lumaTol: 0.04, lumaFloor: 1.5, fpsTol: 0.15, minS: 30, timeoutS: 120 };
const median = (v) => { const a = [...v].sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
export function shotSettle(cfg = {}) {
  const c = { ...SHOT_SETTLE_DEFAULT, ...cfg }, xs = [];
  let at = null, timedOut = false;
  const steady = () => {
    const h = xs.length >> 1, f = xs.map((x) => x.fps), l = xs.map((x) => x.luma).sort((a, b) => a - b);
    const fm = median(f), drift = Math.abs(median(f.slice(xs.length - h)) - median(f.slice(0, h)));
    const q = (p) => { const i = p * (l.length - 1), k = Math.floor(i); return l[k] + (l[Math.min(k + 1, l.length - 1)] - l[k]) * (i - k); };
    return fm > 0 && drift <= c.fpsTol * fm && q(0.9) - q(0.1) <= Math.max(c.lumaTol * median(l), c.lumaFloor);
  };
  return {
    get at() { return at; }, get timedOut() { return timedOut; }, config: c,
    feed(s, fps, luma) {
      if (at !== null) return true;
      if (Number.isFinite(fps) && Number.isFinite(luma)) xs.push({ s, fps, luma });
      while (xs.length && xs[0].s < s - c.seconds) xs.shift();
      if (s >= c.minS && xs.length >= 4 && s - xs[0].s >= c.seconds - 1 && steady()) at = s;
      else if (s >= c.timeoutS) { at = s; timedOut = true; }
      return at !== null;
    },
  };
}

/** Parse a --steps JSON file: array of {at: number, js: string, label?, waitMs?}, returned sorted by `at`. Throws on a bad shape. */
export function parseSteps(text) {
  const a = JSON.parse(text);
  if (!Array.isArray(a)) throw new Error("steps: expected a JSON array");
  a.forEach((s, i) => {
    if (!s || typeof s !== "object") throw new Error(`steps[${i}]: expected an object`);
    if (typeof s.at !== "number" || !Number.isFinite(s.at)) throw new Error(`steps[${i}]: "at" must be a number`);
    if (typeof s.js !== "string" || !s.js) throw new Error(`steps[${i}]: "js" must be a non-empty string`);
    if (s.waitMs !== undefined && typeof s.waitMs !== "number") throw new Error(`steps[${i}]: "waitMs" must be a number`);
  });
  return [...a].sort((x, y) => x.at - y.at);
}

/** fps of the mean of the slowest 1 % of frame durations (ms), at least one frame; null for no frames. */
export function onePercentLow(frameMs) {
  if (!frameMs?.length) return null;
  const k = Math.max(1, Math.ceil(frameMs.length * 0.01));
  const worst = [...frameMs].sort((a, b) => b - a).slice(0, k);
  return Math.round((1000 / (worst.reduce((s, v) => s + v, 0) / k)) * 10) / 10;
}

/**
 * Parse a --views JSON file: [{name, url, steps?, shots?, seconds?}]. `steps` is an inline list in the --steps
 * schema ({at, label, js, waitMs?}), returned sorted. Names must be unique and path-safe (each is a subdirectory).
 */
export function parseViews(text) {
  const a = JSON.parse(text);
  if (!Array.isArray(a) || !a.length) throw new Error("views: expected a non-empty JSON array");
  const seen = new Set();
  return a.map((v, i) => {
    if (!v || typeof v !== "object") throw new Error(`views[${i}]: expected an object`);
    if (typeof v.name !== "string" || !/^[\w.-]+$/.test(v.name)) throw new Error(`views[${i}]: "name" must be [A-Za-z0-9_.-]+`);
    if (seen.has(v.name)) throw new Error(`views[${i}]: duplicate name ${v.name}`);
    seen.add(v.name);
    if (typeof v.url !== "string" || !/^https?:\/\//.test(v.url)) throw new Error(`views[${i}]: "url" must be an http(s) URL`);
    if (v.seconds !== undefined && !(v.seconds > 0)) throw new Error(`views[${i}]: "seconds" must be > 0`);
    if (v.plain !== undefined && typeof v.plain !== "boolean") throw new Error(`views[${i}]: "plain" must be true or false`);
    if (v.clean !== undefined && typeof v.clean !== "boolean") throw new Error(`views[${i}]: "clean" must be true or false`);
    if (v.aim !== undefined && !(Array.isArray(v.aim) && v.aim.length >= 1 && v.aim.length <= 2 && v.aim.every(Number.isFinite)))
      throw new Error(`views[${i}]: "aim" must be [yawRad] or [yawRad, pitchRad]`);
    if (v.settle !== undefined && v.settle !== false && !(v.settle && typeof v.settle === "object" && Object.entries(v.settle).every(([k, x]) => k in SHOT_SETTLE_DEFAULT && x > 0)))
      throw new Error(`views[${i}]: "settle" must be false or {seconds, lumaTol, lumaFloor, fpsTol, minS, timeoutS} (each > 0)`);
    if (v.readyFlag !== undefined && !(typeof v.readyFlag === "string" && /^[A-Za-z_$][\w$]*$/.test(v.readyFlag))) throw new Error(`views[${i}]: "readyFlag" must be a global name`);
    return { ...v, steps: v.steps ? parseSteps(JSON.stringify(v.steps)) : [] };
  });
}

/** rAF rate of a blank page (frames per second) -> the cap verdict. Above 61 fps the vsync / frame-rate cap is off and
 * fps readings can show headroom; at or under it every fps near 60 means "at least 60". */
export function capVerdict(blankRafFps) {
  if (!Number.isFinite(blankRafFps)) return { blankRafFps: null, capDetected: null };
  return { blankRafFps: Math.round(blankRafFps * 10) / 10, capDetected: blankRafFps <= 61 };
}

const cell = (x) => (x === null || x === undefined ? "-" : typeof x === "number" ? String(Math.round(x * 100) / 100) : String(x));
/** A view's summary from its result.json fields. Rates come from the cost window (it starts after the settled read;
 * `from` is "window", or "unsettled" when the view ended before the settled read): fps is the window's wall-clock frame
 * rate, GPU and CPU ms the window's per-frame means (measure.mjs workStats gpuFrameMs, workMs), low1 its frame intervals.
 * Never one read at timeout (walk 10 vol r1 read vol=off "slower" from such a read; its window was faster). Heap MB/min
 * is the post-quiet long-run slope (`heapSlope`, forced-GC samples after GPU resource counts held 5 s), never a 10 s fit
 * over the GC sawtooth (r1: +451 and -241 MB/min from the same views whose long-run slope was 0-14). */
export function summariseView(r) {
  const w = r.window ?? {}, wk = w.work ?? null, st = w.stages?.perFrameMs ?? {}, top = Object.entries(st)[0];
  const from = wk ? (w.unsettled ? "unsettled" : "window") : null;
  const hitchTop = topCause(Object.fromEntries((w.hitches?.list ?? []).reduce((m, h) => (h.stage ? m.set(h.stage, (m.get(h.stage) ?? 0) + h.ms) : m), new Map())));
  const s = (r.reads?.settled && !r.reads.settled.err ? r.reads.settled : r.final) ?? {}, g = s.gpuMs ?? {};
  return {
    contaminated: r.contaminated ?? null, lumaSettled: r.reads?.settled?.luma ?? null, lumaFinal: r.final?.luma ?? null, blackShare: r.final?.blackShare ?? null,
    from, fps: wk?.wallFps ?? null, low1: wk?.low1 ?? null, gpuMs: wk?.gpuFrameMs?.mean ?? null, cpuMs: wk?.workMs?.mean ?? null,
    costMs: wk?.costMs?.mean ?? null, uncappedFps: wk?.uncappedFps ?? null,
    calls: g.calls ?? s.renderer?.calls ?? null, tris: g.tris ?? s.renderer?.triangles ?? null,
    heapMbPerMin: r.heapSlope?.mbPerMin ?? null,
    majorGCs: w.heap?.majorGCs ?? null, allocMBps: w.heap?.allocMBps ?? null, topStage: top ? `${top[0]} ${top[1]}` : null,
    hitches: w.hitches ? `${w.hitches.over33}${hitchTop ? ` (${hitchTop})` : ""}` : null,
    errors: `${r.gpuErrors?.length ?? "?"}/${r.console?.filter(([k]) => k.startsWith("error")).length ?? "?"}/${r.pageErrors?.length ?? "?"}/${r.http404s ?? "?"}`,
    failed: r.failed ?? null, heapTop: w.heapTop?.length ? w.heapTop.slice(0, 3).map((h) => `${h.fn} ${h.selfMB} MB`).join("; ") : null,
    cpuTop: w.cpuTop?.top?.length ? w.cpuTop.top.slice(0, 5).map((f) => `${f.fn.replace(/ \S*\/([^/ ]+)$/, " $1")} ${f.msPerFrame ?? f.selfMs}`).join("; ") : null,
    gpuProbe: r.gpuErrorProbe ? gpuProbeLine(r.gpuErrorProbe) : null,
    drawCensus: w.drawCensus ? drawCensusLine(w.drawCensus, wk?.workMs?.mean ?? null) : null,
    settled: Boolean(r.reads?.settled), stalled: r.stalledReads?.length ?? null, error: r.error ? r.error.split("\n")[0] : undefined,
  };
}
/** Markdown summary: one row per view from its result.json `summary` (`summariseView`). "from" names the window the rates
 * came from; "contaminated" is the view's blank-page baseline verdict. */
export function summaryTable(views, cap, prep = null) {
  const cols = ["view", "failed", "contaminated", "luma settled", "luma final", "black", "from", "fps", "low1", "GPU ms", "CPU ms", "cost ms", "uncapped fps", "calls", "tris M", "heap MB/min (post-quiet)", "top stage ms/frame", "hitches>33 (top)", "errors gpu/con/page/404", "major GCs", "alloc MB/s", "cpu top5 ms/frame", "gpu-error probe", "draw census"];
  const rows = views.map(({ name, summary: s = {} }) => [name, s.failed, s.contaminated, s.lumaSettled, s.lumaFinal, s.blackShare, s.from, s.fps, s.low1, s.gpuMs, s.cpuMs,
    s.costMs, s.uncappedFps, s.calls, s.tris == null ? null : s.tris / 1e6, s.heapMbPerMin, s.topStage, s.hitches, s.errors, s.majorGCs, s.allocMBps, s.cpuTop, s.gpuProbe, s.drawCensus].map(cell));
  return [`cap detected: ${cell(cap?.capDetected)} (blank-page rAF ${cell(cap?.blankRafFps)} fps)`, ...(prep ? [prepLine(prep)] : []), "",
    `| ${cols.join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

/** A view's blank-page baseline (fresh browser context, 5 s after the previous view closed, before navigating) against
 * the run's first blank rAF: contaminated when rAF fell under 0.95 x the first (the GPU process still busy or short of
 * memory) or the live heap after a forced GC is over 50 MB (the isolate kept a previous page). */
export function contaminationVerdict(baseline, firstRafFps, { rafShare = 0.95, heapMB = 50 } = {}) {
  const reasons = [];
  if (Number.isFinite(baseline?.rafFps) && Number.isFinite(firstRafFps) && baseline.rafFps < rafShare * firstRafFps) reasons.push(`blank rAF ${baseline.rafFps} < ${rafShare} x ${firstRafFps}`);
  if (Number.isFinite(baseline?.heapMB) && baseline.heapMB > heapMB) reasons.push(`heap ${baseline.heapMB} MB > ${heapMB}`);
  return { contaminated: reasons.length > 0, reasons };
}

/** Prep timings (build-dist.sh, pod-sync.sh append {step, seconds, at, skipped?} JSON lines; `at` = epoch s at the step's
 * end) -> per step seconds and the wall time from the first step's start to the first capture (epoch s). */
export function prepSummary(jsonl, firstCaptureAt) {
  const steps = String(jsonl).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (!steps.length) return null;
  const start = Math.min(...steps.map((s) => s.at - s.seconds));
  return { steps, toFirstCaptureS: Number.isFinite(firstCaptureAt) ? Math.round(firstCaptureAt - start) : null };
}

/** One line for summary.md. */
export function prepLine(prep) {
  if (!prep) return null;
  return `prep: ${prep.steps.map((s) => `${s.step} ${s.skipped ? "skip" : `${s.seconds} s`}`).join(", ")}; start to first capture ${prep.toFirstCaptureS ?? "-"} s`;
}

/** True when a CDP error means the browser or its page stopped answering (a timeout, a dropped socket), the case
 * pod-capture recovers from by restarting Chrome; a protocol error with an answer is not. */
export function browserStoppedAnswering(error) {
  return /timed out|page closed|browser closed|socket|ECONNREFUSED|fetch failed/i.test(String(error ?? ""));
}

/** After a view: restart the pod Chrome when a timed-out view's target is still listed (`targetStuck`), when the
 * view could not open its browser context or page (failed or timed out: later ones would too, webgpu diag8 T6b), or
 * when the error says the browser stopped answering and a ping agrees (`alive` false). */
export function needsChromeRestart(result, alive) {
  if (result?.targetStuck) return true;
  const error = String(result?.error ?? "");
  if (/createBrowserContext|createTarget/.test(error)) return true;
  return Boolean(error) && browserStoppedAnswering(error) && !alive;
}

/** The shell command that restarts the pod's Chrome: pod-setup.sh (idempotent, it owns Chrome) over the --pod ssh,
 * host-key check off as pod-sync.sh does. */
export function podSetupCommand(pod, mode, script = "/root/site/tooling/gpu-lane/pod-setup.sh") {
  const parts = pod.trim().split(/\s+/), host = parts.pop();
  return `${parts.join(" ")} -o StrictHostKeyChecking=no ${host} bash ${script} ${mode}`;
}

/** Page JS that hides everything but the render canvas for a screenshot, and HUD_SHOW_JS restores it. The render
 * canvas is the one marked `data-render-canvas` by the studio, never picked by size (walk-10 vol smoke 2: the largest
 * canvas was the 2D province preview map, so the game canvas was hidden) nor by probing getContext (that claims a
 * canvas that has no context yet: the preview map then gets null for "2d" and the studio crashes). Every element that
 * neither is nor holds it is hidden (the HUD, the minimap, the 2D preview page), html and body get overflow hidden.
 * Returns {ok, hidden, before, after, err?}: before/after are the canvas's layout (client) and drawing-buffer sizes; ok
 * is false when no render canvas is marked or either size changed (the caller fails loudly). */
export const HUD_HIDE_JS = `(() => { const main = document.querySelector("canvas[data-render-canvas]"); if (!main) return { ok: false, hidden: 0, err: "no canvas[data-render-canvas]" }; const size = () => [main.clientWidth, main.clientHeight, main.width, main.height]; const before = size(); window.__hid = [...document.querySelectorAll("body *")].filter((e) => e !== main && !e.contains(main)); window.__hid.forEach((e) => { e.dataset.v = e.style.visibility; e.style.visibility = "hidden"; }); window.__ovf = [document.documentElement, document.body].map((e) => { const v = e.style.overflow; e.style.overflow = "hidden"; return v; }); const after = size(); const same = before.every((v, i) => v === after[i]); return { ok: same, hidden: window.__hid.length, before, after, ...(same ? {} : { err: "render canvas size changed on hide" }) }; })()`;
export const HUD_SHOW_JS = `(() => { window.__hid?.forEach((e) => { e.style.visibility = e.dataset.v; }); window.__hid = null; if (window.__ovf) [document.documentElement, document.body].forEach((e, i) => { e.style.overflow = window.__ovf[i]; }); window.__ovf = null; return true; })()`;

/** Page JS that aims the studio's follow camera (CharacterMode __STUDIO_CHARACTER_DEBUG__.aimCamera; FollowCamera puts
 * the camera at player + (sin yaw, cos yaw) x distance, so it looks along (-sin yaw, -cos yaw): yaw 0 looks toward -z,
 * +pi/2 toward -x; pitch > 0 raises the camera, clamped to the follow camera's limits). True once aimed, false while
 * the debug hook is not there yet. */
export function aimJs([yaw, pitch]) {
  const args = pitch === undefined ? `${yaw}` : `${yaw}, ${pitch}`;
  return `(() => { const d = window.__STUDIO_CHARACTER_DEBUG__; if (!d?.aimCamera) return false; d.aimCamera(${args}); return true; })()`;
}

/** The PIDs above `pid` (it included) up to, not including, PID 1, read from /proc/<pid>/stat (`readStat` for tests).
 * pod-capture exits when any of them dies, so a capture under job_guard never outlives the agent that launched it. */
export function ancestorPids(pid, readStat = (p) => readFileSync(`/proc/${p}/stat`, "utf8")) {
  const out = [];
  for (let p = pid, n = 0; p > 1 && n < 64; n++) {
    out.push(p);
    try { p = Number(readStat(p).replace(/^.*\) /s, "").split(" ")[1]); } catch { break; }
  }
  return out;
}

/** A CDP HeapProfiler sampling profile -> the top `n` functions by self size (summed over call sites), MB, bundle position. */
export function heapTop(profile, n = 25) {
  const by = new Map();
  const walk = (node) => {
    const c = node.callFrame ?? {};
    const k = `${c.functionName || "(anonymous)"} ${c.url ?? ""}:${(c.lineNumber ?? -1) + 1}:${(c.columnNumber ?? -1) + 1}`;
    if (node.selfSize) by.set(k, (by.get(k) ?? 0) + node.selfSize);
    for (const ch of node.children ?? []) walk(ch);
  };
  if (profile?.head) walk(profile.head);
  return [...by].sort((a, b) => b[1] - a[1]).slice(0, n).map(([fn, b]) => ({ fn, selfMB: Math.round(b / 1e4) / 100 }));
}

/** Studio views whose URL has no `rate=` run a paused world clock, so their numbers are not game-speed measurements
 * (diag10 T9). Returns the names of the non-plain views lacking it; pod-capture refuses them unless --allow-paused. */
export function pausedClockViews(views) {
  return views.filter((v) => !v.plain && !/[?&]rate=/.test(v.url)).map((v) => v.name);
}

/** True when the view asks for the WebGPU backend: `renderer=webgpu` in its URL, or `expectBackend: "webgpu"`. */
export const wantsWebGPU = (view) => view.expectBackend === "webgpu" || /[?&]renderer=webgpu(&|$)/.test(view.url);

/** The backend a view's page reported (settled read, else final, else any read), or null when none did. */
export function reportedBackend(r) {
  const reads = [r.reads?.settled, r.final, ...Object.values(r.reads ?? {})];
  return reads.find((x) => x && typeof x.backend === "string")?.backend ?? null;
}

/** diag10 D5: a view that asked WebGPU but whose page ran another backend (no adapter after a Chrome start) is never a
 * measurement. Returns "no-webgpu" when it must be retried (first try) or recorded failed, else null. */
export function backendFailure(view, r) {
  if (!wantsWebGPU(view) || r.failed) return null;
  const b = reportedBackend(r);
  return b && b !== "webgpu" ? "no-webgpu" : null;
}

/** `--probe-gpu-errors` (diagnosis only; never a bar row). Installed by the init script before the app's scripts, it wraps
 * the WebGPU API on `win` and, before every draw of a render pass, compares the vertex slots the bound pipeline needs
 * (0..vertex.buffers.length-1) with the slots set in that pass. The first mismatch of each of at most 3 pipeline labels
 * is dumped into win.__gpuErrorProbe.dumps: pipeline label and vertex layout, the set slots (buffer label, size,
 * destroyed), the missing slots, bind groups, index buffer, draw kind and args, the vertex WGSL, and the three.js render
 * object being drawn (win.__RENDERER__.backend.draw is wrapped once the studio exposes the renderer). The first 5
 * uncapturederror messages land in win.__gpuErrorProbe.errors with their time. Per draw: O(slots), no allocation.
 * Self-contained: it is stringified into the page. */
export function installGpuErrorProbe(win) {
  const P = (win.__gpuErrorProbe = { dumps: [], errors: [], threeHooked: false, threeNote: "renderer not seen yet", draws: 0 });
  const MAX_SLOTS = 16, now = () => (win.performance ? Math.round(win.performance.now()) : 0);
  const shaderCode = new WeakMap(), pipelines = new WeakMap(), destroyed = new WeakSet(), bindGroups = new WeakMap(), passes = new WeakMap();
  const labelled = new Set();
  let lastRO = null;
  const wrap = (proto, name, make) => { if (proto && typeof proto[name] === "function") proto[name] = make(proto[name]); };
  const Dev = win.GPUDevice?.prototype;
  wrap(Dev, "createShaderModule", (f) => function (d) { const m = f.call(this, d); try { shaderCode.set(m, d.code); } catch {} return m; });
  const pipeInfo = (d) => {
    const v = d?.vertex ?? {};
    return { label: d?.label ?? "", entryPoint: v.entryPoint ?? null, module: v.module ?? null,
      buffers: Array.from(v.buffers ?? [], (b) => (b ? { arrayStride: b.arrayStride, stepMode: b.stepMode ?? "vertex",
        attributes: Array.from(b.attributes ?? [], (a) => ({ shaderLocation: a.shaderLocation, format: a.format, offset: a.offset })) } : null)) };
  };
  wrap(Dev, "createRenderPipeline", (f) => function (d) { const p = f.call(this, d); try { pipelines.set(p, pipeInfo(d)); } catch {} return p; });
  wrap(Dev, "createRenderPipelineAsync", (f) => function (d) { return f.call(this, d).then((p) => { try { pipelines.set(p, pipeInfo(d)); } catch {} return p; }); });
  wrap(Dev, "createBindGroup", (f) => function (d) {
    const g = f.call(this, d);
    try { bindGroups.set(g, { label: d.label ?? "", entries: Array.from(d.entries ?? [], (e) => ({ binding: e.binding, kind: e.resource?.buffer ? `buffer ${e.resource.buffer.label ?? ""} size ${e.resource.buffer.size}` : (e.resource?.constructor?.name ?? typeof e.resource) })) }); } catch {}
    return g;
  });
  wrap(win.GPUBuffer?.prototype, "destroy", (f) => function () { destroyed.add(this); return f.call(this); });
  wrap(win.GPUAdapter?.prototype, "requestDevice", (f) => async function (...a) {
    const d = await f.apply(this, a);
    d.addEventListener?.("uncapturederror", (e) => { if (P.errors.length < 5) P.errors.push({ t: now(), message: String(e.error?.message ?? e.message).slice(0, 600) }); });
    return d;
  });
  wrap(win.GPUCommandEncoder?.prototype, "beginRenderPass", (f) => function (d) {
    const pass = f.call(this, d);
    passes.set(pass, { pipeline: null, info: null, vb: new Array(MAX_SLOTS).fill(null), vbOff: new Array(MAX_SLOTS).fill(0), vbSize: new Array(MAX_SLOTS).fill(0),
      ib: null, ibFormat: null, groups: new Array(8).fill(null), label: d?.label ?? "" });
    return pass;
  });
  const RP = win.GPURenderPassEncoder?.prototype;
  wrap(RP, "setPipeline", (f) => function (p) { const s = passes.get(this); if (s) { s.pipeline = p; s.info = pipelines.get(p) ?? null; } return f.call(this, p); });
  wrap(RP, "setVertexBuffer", (f) => function (slot, buf, off, size) { const s = passes.get(this); if (s && slot < MAX_SLOTS) { s.vb[slot] = buf ?? null; s.vbOff[slot] = off ?? 0; s.vbSize[slot] = size ?? -1; } return f.call(this, slot, buf, off, size); });
  wrap(RP, "setIndexBuffer", (f) => function (buf, fmt, off, size) { const s = passes.get(this); if (s) { s.ib = buf; s.ibFormat = fmt; } return f.call(this, buf, fmt, off, size); });
  wrap(RP, "setBindGroup", (f) => function (i, g, ...a) { const s = passes.get(this); if (s && i < 8) s.groups[i] = g ?? null; return f.call(this, i, g, ...a); });
  const bufInfo = (b) => (b ? { label: b.label ?? "", size: b.size, usage: b.usage, destroyed: destroyed.has(b) } : null);
  const threeSide = () => {
    const ro = lastRO;
    if (!ro) return { note: P.threeNote };
    const t = {};
    const safe = (k, fn) => { try { t[k] = fn(); } catch (e) { t[k] = `err ${e.message}`; } };
    const o = ro.object, g = ro.geometry, m = ro.material, be = win.__RENDERER__?.backend;
    safe("object", () => ({ name: o.name, type: o.type, id: o.id, isBatchedMesh: Boolean(o.isBatchedMesh), isInstancedMesh: Boolean(o.isInstancedMesh), count: o.count, userDataKeys: Object.keys(o.userData ?? {}) }));
    safe("geometry", () => ({ id: g.id, attributes: Object.fromEntries(Object.entries(g.attributes ?? {}).map(([k, a]) => [k, { id: a.id, itemSize: a.itemSize, array: a.array?.constructor?.name, count: a.count, isInstancedBufferAttribute: Boolean(a.isInstancedBufferAttribute), isInterleaved: Boolean(a.isInterleavedBufferAttribute), version: a.version }])) }));
    safe("material", () => ({ name: m.name, id: m.id, type: m.type, version: m.version, customProgramCacheKey: typeof m.customProgramCacheKey === "function" ? String(m.customProgramCacheKey()) : null }));
    safe("cacheKey", () => (typeof ro.getCacheKey === "function" ? String(ro.getCacheKey()) : null));
    safe("attributes", () => (typeof ro.getAttributes === "function" ? ro.getAttributes().map((a) => a?.name ?? a?.constructor?.name ?? "?") : null));
    safe("vertexBuffers", () => (typeof ro.getVertexBuffers === "function" ? ro.getVertexBuffers().map((b) => {
      const d = be?.get?.(b);
      return { name: b?.name ?? "", id: b?.id ?? b?.uuid ?? null, ctor: b?.constructor?.name, isInstanced: Boolean(b?.isInstancedBufferAttribute || b?.isInstancedInterleavedBuffer), hasGpuBuffer: Boolean(d?.buffer), gpuBuffer: bufInfo(d?.buffer) };
    }) : null));
    return t;
  };
  const check = (pass, kind, a0, a1, a2, a3, a4) => {
    P.draws++;
    const s = passes.get(pass);
    if (!s || !s.info) return;
    const req = s.info.buffers.length;
    let gap = false;
    for (let i = 0; i < req && i < MAX_SLOTS; i++) if (s.info.buffers[i] && !s.vb[i]) { gap = true; break; }
    if (!gap || labelled.has(s.info.label) || labelled.size >= 3) return;
    labelled.add(s.info.label);
    const missing = [], set = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      if (s.vb[i]) set.push({ slot: i, offset: s.vbOff[i], size: s.vbSize[i], buffer: bufInfo(s.vb[i]) });
      else if (i < req && s.info.buffers[i]) missing.push(i);
    }
    const isIndirect = kind === "drawIndirect" || kind === "drawIndexedIndirect";
    P.dumps.push({ t: now(), drawIndex: P.draws, pass: s.label, kind, args: isIndirect ? { indirectBuffer: bufInfo(a0), offset: a1 } : [a0, a1, a2, a3, a4].filter((x) => x !== undefined),
      pipeline: { label: s.info.label, entryPoint: s.info.entryPoint, buffers: s.info.buffers }, missing, set,
      indexBuffer: s.ib ? { ...bufInfo(s.ib), format: s.ibFormat } : null,
      bindGroups: s.groups.map((g, i) => (g ? { group: i, ...(bindGroups.get(g) ?? { label: g.label ?? "" }) } : null)).filter(Boolean),
      vertexWGSL: shaderCode.get(s.info.module) ?? null, three: threeSide() });
  };
  for (const k of ["draw", "drawIndexed", "drawIndirect", "drawIndexedIndirect"]) wrap(RP, k, (f) => function (a0, a1, a2, a3, a4) { check(this, k, a0, a1, a2, a3, a4); return f.call(this, a0, a1, a2, a3, a4); });
  // three side: wrap backend.draw once the studio exposes the renderer (window.__RENDERER__)
  const hook = () => {
    const be = win.__RENDERER__?.backend;
    if (!be || typeof be.draw !== "function") return false;
    const draw = be.draw;
    be.draw = function (ro, info) { lastRO = ro; return draw.call(this, ro, info); };
    P.threeHooked = true; P.threeNote = "backend.draw wrapped";
    return true;
  };
  if (!hook() && typeof win.setInterval === "function") { const id = win.setInterval(() => { if (hook()) win.clearInterval(id); }, 250); }
}

/** One summary line from a view's gpu-error-probe.json: the first dump's missing slot, pipeline label and three object name. */
export function gpuProbeLine(p) {
  if (!p || p.err) return `not-a-bar; probe unread${p?.err ? ` (${String(p.err).slice(0, 60)})` : ""}`;
  const d = p.dumps?.[0];
  if (!d) return `not-a-bar; no unset slot in ${p.draws ?? 0} draws; ${p.errors?.length ?? 0} errors`;
  return `not-a-bar; slot ${d.missing.join(",")} missing ${d.pipeline.label} obj ${d.three?.object?.name ?? d.three?.note ?? "?"} (${p.dumps.length} dumps)`;
}

/** `--draw-census` (diagnosis only; never a bar row). Installed by the init script before the app's scripts. Between
 * win.__drawCensus.start() and .stop() (the harness's cost window) it counts, per rAF frame, three/webgpu's draws by
 * category, by kind (plain / instanced / indirect) and zero-instance draws, by wrapping `__RENDERER__.backend.draw`
 * (WebGPUBackend and WebGLBackend share it); the time inside that wrapper and inside `Renderer._renderObjectDirect`;
 * the node refreshes (`renderer._nodes.needsRefresh` answered true) by category; and every pipeline or shader created
 * (GPUDevice createRenderPipeline(+Async)/createComputePipeline(+Async)/createShaderModule, WebGL2 compileShader/linkProgram)
 * with the labels of the first 20. stop() returns per-frame means (drawCensusResult). Per draw: one category lookup cached
 * per object in a WeakMap, two performance.now() reads, integer adds into preallocated arrays. Self-contained: stringified
 * into the page. */
export function installDrawCensus(win) {
  const CATS = ["veg-gpucull", "groundcover", "vegetation", "impostor", "settlement-merge", "terrain", "ground-paint", "water", "sky", "fixture", "fire-fx", "air", "character", "other"];
  const N = CATS.length, MAXF = 4096, now = () => win.performance.now();
  const C = { on: false, frames: 0, draws: new Float64Array(N), refresh: new Float64Array(N), drawMs: 0, roMs: 0,
    kinds: { plain: 0, instanced: 0, indirect: 0, zero: 0 }, perFrame: new Float64Array(MAXF), created: { pipelines: 0, shaders: 0, labels: [] },
    hooked: { draw: false, renderObjectDirect: false, needsRefresh: false }, otherNames: new Map() };
  const catOf = new WeakMap();
  const classify = (ro) => {
    const o = ro.object ?? {}, m = ro.material ?? {}, g = ro.geometry ?? {}, u = o.userData ?? {};
    const on = String(o.name ?? ""), mn = String(m.name ?? ""), n = `${on} ${mn}`;
    if (g.indirect || g.attributes?.esSlot || g.userData?.esSlot != null || u.esGpuCull) return 0;
    if (/groundcover/i.test(n)) return 1;
    if (/es-impostor|impostor|card/i.test(n)) return 3;
    if (/veg|tree|grass|bush|fern|plant/i.test(n)) return 2;
    if (u.esSettlementBatch) return 4;
    if (/ground-paint/.test(n) || m.userData?.esGroundPaint) return 6;
    if (/es-ground|terrain/i.test(n)) return 5;
    if (/water|falls|bubbles|ripple/i.test(n)) return 7;
    if (/sky|sun|moon|star|cloud/i.test(n)) return 8;
    if (/fixture|settlement-light|lantern|window-frame/i.test(n) || u.esFixtureLightsPerObject) return 9;
    if (/fire|flame|ember|smoke/i.test(n)) return 10;
    if (/^air:|weather:/.test(n)) return 11;
    if (o.isSkinnedMesh || u.esPlayerShow || u.esPlayerFade || /NPC|Hair/.test(n)) return 12;
    const k = `${o.type ?? "?"}:${on.slice(0, 24)}|${m.type ?? "?"}:${mn.slice(0, 24)}`;
    if (C.otherNames.size < 30 || C.otherNames.has(k)) C.otherNames.set(k, (C.otherNames.get(k) ?? 0) + 1);
    return 13;
  };
  const cat = (ro) => { const o = ro.object; if (!o || typeof o !== "object") return classify(ro); let c = catOf.get(o); if (c === undefined) { c = classify(ro); catOf.set(o, c); } return c; };
  const created = (kind, label) => { if (!C.on) return; C.created[kind]++; if (C.created.labels.length < 20) C.created.labels.push(`${kind}:${label ?? ""}`); };
  const wrap = (proto, name, make) => { if (proto && typeof proto[name] === "function") proto[name] = make(proto[name]); };
  const Dev = win.GPUDevice?.prototype;
  for (const k of ["createRenderPipeline", "createComputePipeline"]) wrap(Dev, k, (f) => function (d) { created("pipelines", d?.label); return f.call(this, d); });
  for (const k of ["createRenderPipelineAsync", "createComputePipelineAsync"]) wrap(Dev, k, (f) => function (d) { created("pipelines", d?.label); return f.call(this, d); });
  wrap(Dev, "createShaderModule", (f) => function (d) { created("shaders", d?.label); return f.call(this, d); });
  const GL = win.WebGL2RenderingContext?.prototype;
  wrap(GL, "compileShader", (f) => function (sh) { created("shaders", "gl"); return f.call(this, sh); });
  wrap(GL, "linkProgram", (f) => function (pr) { created("pipelines", "gl"); return f.call(this, pr); });
  let frameDraws = 0;
  const tick = () => { if (C.on) { if (C.frames < MAXF) C.perFrame[C.frames] = frameDraws; C.frames++; } frameDraws = 0; win.requestAnimationFrame(tick); };
  const hook = () => {
    const r = win.__RENDERER__, be = r?.backend;
    if (!be || typeof be.draw !== "function") return false;
    const draw = be.draw;
    be.draw = function (ro, info) {
      if (!C.on) return draw.call(this, ro, info);
      const t = now();
      try { return draw.call(this, ro, info); } finally {
        C.drawMs += now() - t; frameDraws++;
        C.draws[cat(ro)]++;
        const o = ro.object ?? {}, g = ro.geometry ?? {};
        if (g.indirect) C.kinds.indirect++; else if (o.isInstancedMesh || (o.count ?? 1) > 1) C.kinds.instanced++; else C.kinds.plain++;
        if ((o.isInstancedMesh && o.count === 0) || g.drawRange?.count === 0) C.kinds.zero++;
      }
    };
    C.hooked.draw = true;
    if (typeof r._renderObjectDirect === "function") {
      const rod = r._renderObjectDirect;
      r._renderObjectDirect = function (...a) { if (!C.on) return rod.apply(this, a); const t = now(); try { return rod.apply(this, a); } finally { C.roMs += now() - t; } };
      C.hooked.renderObjectDirect = true;
    }
    const nodes = r._nodes;
    if (nodes && typeof nodes.needsRefresh === "function") {
      const nr = nodes.needsRefresh;
      nodes.needsRefresh = function (ro, ...a) { const v = nr.call(this, ro, ...a); if (v && C.on) C.refresh[cat(ro)]++; return v; };
      C.hooked.needsRefresh = true;
    }
    return true;
  };
  win.__drawCensus = {
    state: C, categories: CATS,
    start() { C.draws.fill(0); C.refresh.fill(0); C.drawMs = 0; C.roMs = 0; C.frames = 0; frameDraws = 0; C.otherNames.clear();
      C.kinds = { plain: 0, instanced: 0, indirect: 0, zero: 0 }; C.created = { pipelines: 0, shaders: 0, labels: [] }; C.on = true; },
    stop() { C.on = false; return drawCensusResult(C, CATS); },
  };
  function drawCensusResult(c, cats) {
    const f = Math.max(c.frames, 1), r2 = (x) => Math.round(x * 100) / 100, total = c.draws.reduce((a, b) => a + b, 0);
    const per = Array.from(c.perFrame.subarray(0, Math.min(c.frames, MAXF))).sort((a, b) => a - b);
    const byCat = (arr) => Object.fromEntries(cats.map((k, i) => [k, r2(arr[i] / f)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]));
    return { frames: c.frames, hooked: { ...c.hooked }, drawsPerFrame: r2(total / f), drawsMax: per.length ? per[per.length - 1] : null,
      byCategory: byCat(c.draws), kindsPerFrame: Object.fromEntries(Object.entries(c.kinds).map(([k, v]) => [k, r2(v / f)])),
      refreshesPerFrame: r2(c.refresh.reduce((a, b) => a + b, 0) / f), refreshByCategory: byCat(c.refresh),
      drawMsPerFrame: r2(c.drawMs / f), renderObjectMsPerFrame: r2(c.roMs / f),
      usPerDraw: total ? r2((c.drawMs * 1000) / total) : null, usPerRenderObject: total ? r2((c.roMs * 1000) / total) : null,
      createdInWindow: { pipelines: c.created.pipelines, shaders: c.created.shaders, labels: c.created.labels.slice() },
      otherTop: [...c.otherNames].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, r2(v / f)]) };
  }
  if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(tick);
  if (!hook() && typeof win.setInterval === "function") { const id = win.setInterval(() => { if (hook()) win.clearInterval(id); }, 250); }
}

/** One summary cell from a view's draw-census.json (plus the window's CPU ms, the frame-CPU reference). */
export function drawCensusLine(c, cpuMs = null) {
  if (!c || c.err) return `not-a-bar; census unread${c?.err ? ` (${String(c.err).slice(0, 60)})` : ""}`;
  const top = Object.entries(c.byCategory ?? {}).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ");
  const cw = c.createdInWindow ?? {};
  return `not-a-bar; ${c.drawsPerFrame} draws, ${c.usPerDraw ?? "?"} us/draw (${c.drawMsPerFrame} of ${cpuMs ?? "?"} ms CPU), ${c.refreshesPerFrame} refreshes, ${(cw.pipelines ?? 0) + (cw.shaders ?? 0)} created in window; ${top}`;
}

/** CPU profile (Profiler.stop) over the cost window -> self ms per frame per function (url:line:col), top n, with the
 * profile's sampled total. frames: frames in the window (the work probe's count); null leaves per-frame out. */
export function cpuTop(profile, frames, n = 25) {
  const nodes = new Map(profile.nodes.map((x) => [x.id, x.callFrame]));
  const self = new Map();
  let total = 0;
  profile.samples.forEach((id, i) => {
    const dt = profile.timeDeltas[i] ?? 0, c = nodes.get(id);
    total += dt;
    const k = `${c.functionName || "(anon)"} ${c.url || "(native)"}:${c.lineNumber}:${c.columnNumber}`;
    self.set(k, (self.get(k) ?? 0) + dt);
  });
  const per = (us) => (frames > 0 ? Math.round(us / 1000 / frames * 1000) / 1000 : null);
  return { frames: frames ?? null, sampledMs: Math.round(total / 1000), top: [...self].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([fn, us]) => ({ fn, selfMs: Math.round(us / 100) / 10, msPerFrame: per(us) })) };
}
