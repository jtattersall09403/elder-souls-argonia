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
/** Markdown summary: one row per view from its result.json `summary`. fps and low1 name the read they came from
 * (window = the cost window after the settled read, settled, final); "window fps" is that window's own wall-clock rate
 * beside its cost ms; "contaminated" is the view's blank-page baseline verdict. */
export function summaryTable(views, cap, prep = null) {
  const cols = ["view", "contaminated", "luma settled", "luma final", "black", "fps (from)", "low1 (from)", "GPU ms", "CPU ms", "cost ms (from)", "window fps", "uncapped fps", "calls", "tris M", "heap MB/min", "top stage ms/frame", "hitches>33 (top)", "errors gpu/con/page/404"];
  const from = (v, f) => (v == null ? null : `${cell(v)} (${f ?? "-"})`);
  const rows = views.map(({ name, summary: s = {} }) => [name, s.contaminated, s.lumaSettled, s.lumaFinal, s.blackShare, from(s.fps, s.fpsFrom), from(s.low1, s.low1From), s.gpuMs, s.cpuMs,
    from(s.costMs, s.costFrom), s.windowFps, s.uncappedFps, s.calls, s.tris == null ? null : s.tris / 1e6, s.heapMbPerMin, s.topStage, s.hitches, s.errors].map(cell));
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
