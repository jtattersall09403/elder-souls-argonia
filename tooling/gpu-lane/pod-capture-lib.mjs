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
    failed: r.failed ?? null, heapTop: w.heapTop?.[0] ? `${w.heapTop[0].fn} ${w.heapTop[0].selfMB} MB` : null,
    settled: Boolean(r.reads?.settled), stalled: r.stalledReads?.length ?? null, error: r.error ? r.error.split("\n")[0] : undefined,
  };
}
/** Markdown summary: one row per view from its result.json `summary` (`summariseView`). "from" names the window the rates
 * came from; "contaminated" is the view's blank-page baseline verdict. */
export function summaryTable(views, cap, prep = null) {
  const cols = ["view", "failed", "contaminated", "luma settled", "luma final", "black", "from", "fps", "low1", "GPU ms", "CPU ms", "cost ms", "uncapped fps", "calls", "tris M", "heap MB/min (post-quiet)", "top stage ms/frame", "hitches>33 (top)", "errors gpu/con/page/404", "major GCs", "alloc MB/s"];
  const rows = views.map(({ name, summary: s = {} }) => [name, s.failed, s.contaminated, s.lumaSettled, s.lumaFinal, s.blackShare, s.from, s.fps, s.low1, s.gpuMs, s.cpuMs,
    s.costMs, s.uncappedFps, s.calls, s.tris == null ? null : s.tris / 1e6, s.heapMbPerMin, s.topStage, s.hitches, s.errors, s.majorGCs, s.allocMBps].map(cell));
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
