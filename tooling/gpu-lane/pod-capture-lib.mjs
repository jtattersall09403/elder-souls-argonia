import { targetsLine } from "./target-probe.mjs";
import { readFileSync } from "node:fs";
import { topCause } from "./trace-frames.mjs";
import { sourcePosition } from "./source-maps.mjs";
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

/** The view's shot schedule (seconds): its own `shots`, else every 10 s when it sets `seconds`, else the run's `--shots`. */
export function viewShots(view, runSpec, totalS) {
  if (view.long) return parseShots("10000@0,10000", view.long);
  const spec = view.shots ?? (view.seconds !== undefined ? "10000@0,10000" : runSpec);
  return spec === "none" ? [] : parseShots(spec, totalS);
}

/** Shot time of second `s` after navigation: from navigation, or from the shot settle gate (`settleAt`, null = not yet
 * open -> -1) when the view sets `shotsFrom: "settle"` (diag19 D5: counting from a gate at ~45 s left 0-2 frames). */
export const shotTime = (view, s, settleAt, firstAt = null, poseAt = null) => (view.long ? (firstAt == null ? -1 : s - firstAt)
  : view.shotsFrom === "settle" ? (settleAt == null ? -1 : s - settleAt) : s - (poseAt ?? 0));
/** c10 harness2: the frame schedule counts from the pose gate's first satisfied time (`poseAt`), never page start. A view whose
 * pose gate never passed (poseAt null: timed out) writes its frames anyway and is marked `framesBeforePose`. */
export const framesBeforePose = (view, poseAt) => !view.plain && poseAt === null;
/** Seconds the last `/kits/*.glb` finished arriving (resource timing entries, ms from timeOrigin); null when none. */
export function kitsArrivedS(entries) {
  const ends = (entries ?? []).filter((e) => /\/kits\/[^?]*\.glb(\?|$)/i.test(e.name) && Number.isFinite(e.responseEnd)).map((e) => e.responseEnd);
  return ends.length ? Math.round(Math.max(...ends) / 100) / 10 : null;
}
/** Shader-side load: kits arrived -> last pipeline build. `lastBuildS` is the load probe's last createRenderPipeline/
 * createComputePipeline/createShaderModule end (builds.last; the probe keeps count and last only, no per-build events, so
 * the count after kitsArrivedS is not measured: buildsAfterKits stays null). Pages with no build queue (dev) are n/a. */
export function buildsAfterKits(entries, loadTimelineOut, hasBuildQueue) {
  const kitsArrivedS_ = kitsArrivedS(entries), lastBuildS = loadTimelineOut?.builds?.last ?? null;
  if (!hasBuildQueue) return { kitsArrivedS: kitsArrivedS_, lastBuildS: null, buildsAfterKitsS: null, buildsAfterKits: null, na: true };
  const d = Number.isFinite(kitsArrivedS_) && Number.isFinite(lastBuildS) ? Math.round((lastBuildS - kitsArrivedS_) * 10) / 10 : null;
  return { kitsArrivedS: kitsArrivedS_, lastBuildS, buildsAfterKitsS: d, buildsAfterKits: null, na: false };
}
/** A view's run length: `long` views run `long` s past their first frame (pose + ready), else `seconds` (or the run's). */
export const viewEndS = (view, totalS, firstAt) => (view.long ? (firstAt == null ? Infinity : firstAt + view.long) : totalS);
/** Query parameters a capture URL may never carry: `scenario` (visualScenarios.ts; with it CombatRuntime passes
 * SkyrimFighter its visualProbe and every skinned mesh runs computeBoundingBox each frame, SkyrimFighter.tsx ~1288),
 * and `visualScenario` / `validation` (EnemyActor's probe flag). parseViews fails the view set on one. */
export const FORBIDDEN_CAPTURE_PARAMS = ["scenario", "visualScenario", "validation"];

/** The page's visible text, read for the world clock (the studio exposes no clock global; the TimePanel prints HH:MM). */
export const HUD_TEXT_JS = `document.body.innerText`;
export const CLOCK_SOURCE = "hud-text HH:MM (sky/TimePanel)";
/** The in-game time of day in the page text: the first stand-alone HH:MM -> { hhmm, minute }, or null. */
export function hudClock(text) {
  const m = /(?:^|[\s>])([01]?\d|2[0-3]):([0-5]\d)(?=$|[\s<])/m.exec(String(text ?? ""));
  return m ? { hhmm: `${m[1].padStart(2, "0")}:${m[2]}`, minute: +m[1] * 60 + +m[2] } : null;
}
/** First and last clocked frame -> { first, last, clockAdvancing } (null when fewer than two frames carry a clock). */
export function clockVerdict(frameClocks) {
  const c = (frameClocks ?? []).filter((f) => f?.clock);
  if (c.length < 2) return { first: c[0]?.clock.hhmm ?? null, last: c[0]?.clock.hhmm ?? null, clockAdvancing: null };
  const a = c[0].clock, b = c[c.length - 1].clock;
  return { first: a.hhmm, last: b.hhmm, clockAdvancing: a.minute !== b.minute };
}
/** final.jpg's own luma: the read's screen-middle numbers replaced by those decoded from the bytes written as final.jpg. */
export function withFinalJpgLuma(final, middle) {
  return { ...final, luma: middle?.luma ?? null, blackShare: middle?.blackShare ?? null, lumaSource: "final.jpg" };
}

/** "--profile 10@60" -> { seconds: 10, at: 60 } */
export function parseProfile(spec) {
  const m = /^(\d+(?:\.\d+)?)@(?:(\d+(?:\.\d+)?)|settle\+(\d+(?:\.\d+)?))$/.exec(spec ?? "");
  if (!m) throw new Error(`--profile wants <seconds>@<startS> or <seconds>@settle+<s>, got ${spec}`);
  return m[2] !== undefined ? { seconds: +m[1], at: +m[2], from: "nav" } : { seconds: +m[1], at: +m[3], from: "settle" };
}

/** A view's `heapsample: "<s>@settle+<S>"` (or "<s>@<t>"): the --profile grammar, one parser (parseProfile). */
export function parseHeapSample(spec) {
  try { return parseProfile(spec); } catch { throw new Error(`heapsample wants <seconds>@<startS> or <seconds>@settle+<s>, got ${spec}`); }
}

/** The heap sampling summary cell: top 5 allocators of heapTopAllocators rows ({name, MB}), null when none. */
export function heapAllocLine(rows) {
  return rows?.length ? rows.slice(0, 5).map((h) => `${h.name} ${h.MB} MB${h.callers?.length ? ` [${h.callers.map((c) => `${c.MB} MB < ${c.chain}`).join(" | ")}]` : ""}`).join("; ") : null;
}

/** Page JS: the vegetation DEV handle's rung split and the renderer's per-frame triangle counters, null-safe (a dist built
 * without the handle, or a WebGPU renderer without info.render, reads null for what is absent). */
export const VEG_READ_JS = `(() => { const v = window.__STUDIO_VEGETATION_DEBUG__, r = window.__RENDERER__?.info?.render;
  const num = (x) => (Number.isFinite(x) ? x : null);
  const render = r ? Object.fromEntries(Object.entries(r).filter(([k, x]) => /tri|call/i.test(k) && Number.isFinite(x))) : null;
  return { veg: v ? { trianglesByRung: v.trianglesByRung ?? null, triangles: num(v.triangles), instances: num(v.instances), draws: num(v.draws) } : null, render }; })()`;

/** "veg tris by rung" cell: near/mid/far/card in M, the vegetation total and the renderer's per-frame triangles (M) with
 * any other per-pass triangle counters renderer.info.render carries. null with no handle and no renderer counters. */
export function vegRungLine(read) {
  const M = (x) => (Number.isFinite(x) ? Math.round(x / 1e4) / 100 : "-");
  const rung = read?.veg?.trianglesByRung, render = read?.render ?? null;
  if (!rung && !render) return null;
  const parts = [];
  if (rung) parts.push(`near ${M(rung.near)} / mid ${M(rung.mid)} / far ${M(rung.far)} / card ${M(rung.card)} M`, `veg total ${M(read.veg.triangles)} M`);
  const tri = render ? Object.entries(render).filter(([k]) => /tri/i.test(k)) : [];
  if (tri.length) parts.push(`render ${tri.map(([k, x]) => `${k} ${M(x)}`).join(", ")} M`);
  return parts.join("; ") || null;
}

/** Page JS: every resource timing entry so far (the per-URL fetch timeline). */
export const RESOURCES_READ_JS = `(() => performance.getEntriesByType("resource").map((e) => ({ name: e.name, initiatorType: e.initiatorType, transferSize: e.transferSize, encodedBodySize: e.encodedBodySize, startTime: Math.round(e.startTime), responseEnd: Math.round(e.responseEnd) })))()`;

const resourceKind = (name) => { const m = /\.(glb|gltf|ktx2|png|jpe?g|webp|json|wasm|js|css|bin|mp3|ogg)$/i.exec(String(name).split(/[?#]/)[0]); return m ? m[1].toLowerCase().replace("jpeg", "jpg").replace("gltf", "glb") : "other"; };

/** Resource entries -> { requests, MB, byKind: {kind: {n, MB}}, top: top 3 by bytes [{name, MB}] }; bytes are the encoded body
 * (transferSize 0 on a cache hit or a cross-origin entry without timing headers falls back to encodedBodySize). */
export function resourceSummary(entries, { untilMs = Infinity } = {}) {
  const rows = (entries ?? []).filter((e) => e && e.responseEnd <= untilMs).map((e) => ({ name: e.name, kind: resourceKind(e.name), bytes: e.transferSize > 0 ? e.transferSize : (e.encodedBodySize ?? 0) }));
  const byKind = {};
  for (const r of rows) { const k = (byKind[r.kind] ??= { n: 0, MB: 0 }); k.n++; k.MB += r.bytes / 1e6; }
  for (const k of Object.values(byKind)) k.MB = Math.round(k.MB * 100) / 100;
  return { requests: rows.length, MB: Math.round(rows.reduce((a, r) => a + r.bytes, 0) / 1e4) / 100, byKind,
    top: [...rows].sort((a, b) => b.bytes - a.bytes).slice(0, 3).map((r) => ({ name: r.name.split("/").slice(-2).join("/").split("?")[0], MB: Math.round(r.bytes / 1e4) / 100 })) };
}

/** "fetch before ready" cell: N req / MB, bytes by kind, top 3 by bytes; null when the read never happened. */
export function resourceLine(sum) {
  if (!sum) return null;
  const kinds = ["glb", "ktx2", "png", "json"].map((k) => `${k} ${sum.byKind?.[k]?.n ?? 0}/${sum.byKind?.[k]?.MB ?? 0} MB`).join(", ");
  return `${sum.requests} req / ${sum.MB} MB (${kinds}); top3 ${sum.top.map((t) => `${t.name} ${t.MB}`).join(", ") || "-"}`;
}

/** The view second a --profile starts at: nav form `at`; settle form `at` seconds after the view settled (settledAt, the
 * build queue empty 5 s; a plain view or no settle gate: readyS), null while that has not happened. */
export function profileStartS(prof, settledAt, readyS) {
  if (prof.from !== "settle") return prof.at;
  const anchor = settledAt ?? readyS;
  return anchor === null || anchor === undefined ? null : anchor + prof.at;
}

/** CPU profile -> top self and total time by function (ms). With `maps` (source-maps.mjs loadSourceMaps over a dist
 * built with ES_GPU_LANE_SOURCEMAP=1), `selfTopSrc`: the top 15 self functions named by source file:line. */
export function summariseProfile(profile, n = 30, maps = null) {
  const out = summariseProfileRaw(profile, n);
  if (!maps?.size) return out;
  const self = new Map();
  const nodes = new Map(profile.nodes.map((x) => [x.id, x.callFrame]));
  profile.samples.forEach((id, i) => {
    const c = nodes.get(id), dt = profile.timeDeltas[i] ?? 0;
    const k = `${c.functionName || "(anon)"} @ ${sourcePosition(maps, c.url, c.lineNumber, c.columnNumber) ?? `${c.url.split("/").pop()}:${c.lineNumber + 1}`}`;
    self.set(k, (self.get(k) ?? 0) + dt);
  });
  return { ...out, selfTopSrc: [...self].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([f, us]) => [f, Math.round(us / 1000)]) };
}

function summariseProfileRaw(profile, n) {
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
    if (v.shotsFrom !== undefined && v.shotsFrom !== "settle") throw new Error(`views[${i}]: "shotsFrom" must be "settle"`);
    if (v.long !== undefined && !(Number.isFinite(v.long) && v.long > 0)) throw new Error(`views[${i}]: "long" must be seconds > 0`);
    const q = new URLSearchParams(v.url.split("?")[1]?.split("#")[0] ?? "");
    const bad = FORBIDDEN_CAPTURE_PARAMS.filter((k) => q.has(k));
    if (bad.length) throw new Error(`views[${i}] ${v.name}: url sets ${bad.join(", ")} (per-frame validation work, SkyrimFighter computeBoundingBox): never in a capture`);
    if (v.readyFlag !== undefined && !(typeof v.readyFlag === "string" && /^[A-Za-z_$][\w$]*$/.test(v.readyFlag))) throw new Error(`views[${i}]: "readyFlag" must be a global name`);
    if (v.heapsample !== undefined) parseHeapSample(v.heapsample);
    const pin = pinWeather(v.url, v.plain);
    return { ...v, url: pin.url, ...(pin.added ? { weatherPinAdded: true } : {}), steps: v.steps ? parseSteps(JSON.stringify(v.steps)) : [] };
  });
}

/** webgpu diag20 E7: a studio view (`view=` in its query, not plain) whose URL names no weather (`w=`, App.tsx
 * parseWeatherParam) drifts with the world's weather (iter28 night views turned to rain). Such a URL gets `w=clear`
 * appended and `added: true` (pod-capture prints a warning line and the view's result carries weatherPinAdded). */
export function pinWeather(url, plain = false) {
  const q = String(url).split("?")[1] ?? "";
  const p = new URLSearchParams(q.split("#")[0]);
  if (plain || !p.has("view") || p.has("w")) return { url, added: false };
  const [head, hash] = String(url).split("#");
  return { url: `${head}${head.includes("?") ? "&" : "?"}w=clear${hash !== undefined ? `#${hash}` : ""}`, added: true };
}

/** webgpu c10 (E8): the pose a first frame waits for, from the view's URL (`x`, `z` km -> metres) and its `aim`
 * ([yawRad, pitchRad], the follow camera's convention) or the URL's `yaw`/`pitch` (fly camera, compass degrees, pitch
 * negative down). Character views gate the follow camera's focus (camera + its forward over the horizontal arm) within
 * POSE_TOL_M of (x, z), and its yaw within POSE_TOL_DEG of aim[0] when the view aims; the view pitch is recorded but not
 * gated (followCamera's look target sits above the pivot, so the camera's pitch is never the orbit pitch). Fly views gate
 * yaw/pitch when the URL sets them (position recorded only). null = no gate (a plain view, or nothing to compare). */
export const POSE_TOL_M = 1, POSE_TOL_DEG = 1, POSE_FRAMES = 3;
export function poseTarget(url, aim = null) {
  const q = new URLSearchParams(String(url).split("?")[1]?.split("#")[0] ?? "");
  const x = Number(q.get("x")), z = Number(q.get("z"));
  if (!q.has("x") || !q.has("z") || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (q.get("view") === "character") return { character: true, x: Math.round(x * 1e6) / 1e3, z: Math.round(z * 1e6) / 1e3, yaw: aim ? aim[0] * 180 / Math.PI : null, pitch: aim?.[1] !== undefined ? aim[1] * 180 / Math.PI : null };
  const yaw = q.has("yaw") ? Number(q.get("yaw")) || 0 : null, pitch = q.has("pitch") ? Number(q.get("pitch")) || 0 : null;
  return yaw === null && pitch === null ? null : { character: false, x: Math.round(x * 1e6) / 1e3, z: Math.round(z * 1e6) / 1e3, yaw, pitch };
}
/** One frame's camera {p: position, f: unit forward} against poseTarget -> residuals (m, degrees) and ok. `arm` is the
 * follow camera's arm (__STUDIO_CHARACTER_DEBUG__.cameraArm), `playerY` the player's body y (the pivot is ~1 m above).
 * Self-contained: stringified into the page by installPoseProbe. */
export function poseResidual(cam, t, arm = null, playerY = null) {
  const [px, py, pz] = cam.p, [fx, fy, fz] = cam.f, deg = 180 / Math.PI, hl = Math.hypot(fx, fz) || 1;
  const ang = (a, b) => (a === null || b === null ? null : Math.round(Math.abs(((a - b + 540) % 360) - 180) * 100) / 100);
  let posM, yaw, pitch, gateYaw = t.yaw, gatePitch = null;
  if (t.character) {
    const a = Number.isFinite(arm) && arm > 0 ? arm : 0, dy = Number.isFinite(playerY) ? py - (playerY + 1) : 0;
    const h = Math.sqrt(Math.max(0, a * a - dy * dy));
    posM = Math.hypot(px + (fx / hl) * h - t.x, pz + (fz / hl) * h - t.z);
    yaw = Math.atan2(-fx, -fz) * deg; pitch = Math.asin(Math.max(-1, Math.min(1, -fy))) * deg;
  } else {
    posM = Math.hypot(px - t.x, pz - t.z);
    yaw = Math.atan2(fx, -fz) * deg; pitch = Math.asin(Math.max(-1, Math.min(1, fy))) * deg; gatePitch = t.pitch;
  }
  const yawDeg = ang(yaw, t.yaw), pitchDeg = ang(pitch, t.pitch);
  const ok = (!t.character || posM <= 1) && (gateYaw === null || yawDeg <= 1) && (gatePitch === null || pitchDeg <= 1);
  return { ok, posM: Math.round(posM * 100) / 100, yawDeg, pitchDeg, cam: cam.p.map((v) => Math.round(v * 10) / 10), yaw: Math.round(yaw * 10) / 10, pitch: Math.round(pitch * 10) / 10 };
}
/** Page side of the pose gate: wraps `__RENDERER__.render` (classic WebGLRenderer and WebGPURenderer alike) and scores
 * every perspective-camera render that is not a shadow pass with `residual` against the target the harness set
 * (`__poseProbe.setTarget`); a rAF frame is at the pose when any of its renders is. Ready after `need` consecutive
 * frames at the pose; stops scoring then. */
export function installPoseProbe(win, residual, need = 3) {
  const P = { target: null, ok: 0, frames: 0, at: null, residual: null, last: null };
  // a frame passes when ANY perspective non-shadow render of it is at the pose: the scene camera may render into a
  // composer target (classic post) and a water reflection camera beside it is never at the pose; the verdict of
  // rAF frame n is closed by the first scored render of a later frame
  let cur = -1, curBest = null;
  const close = () => {
    if (!curBest) return;
    P.frames++; P.last = curBest; P.ok = curBest.ok ? P.ok + 1 : 0;
    if (P.ok >= need) { P.at = win.performance.now() / 1000; P.residual = curBest; }
    curBest = null;
  };
  const score = (r, cam) => {
    if (!P.target || P.at !== null || !cam?.matrixWorld || !cam.isPerspectiveCamera) return;
    const rt = typeof r.getRenderTarget === "function" ? r.getRenderTarget() : null;
    if (rt && /shadow/i.test(String(rt.texture?.name ?? ""))) return;
    const f = win.__RAFN ?? 0;
    if (f !== cur) { close(); cur = f; if (P.at !== null) return; }
    const e = cam.matrixWorld.elements, l = Math.hypot(e[8], e[9], e[10]) || 1, d = win.__STUDIO_CHARACTER_DEBUG__;
    let arm = null, py = null; try { arm = d?.cameraArm?.() ?? null; py = d?.playerY?.() ?? null; } catch { /* not mounted */ }
    const res = residual({ p: [e[12], e[13], e[14]], f: [-e[8] / l, -e[9] / l, -e[10] / l] }, P.target, arm, py);
    if (!curBest || (res.ok && !curBest.ok) || (res.ok === curBest.ok && res.posM < curBest.posM)) curBest = res;
  };
  const hook = () => {
    const r = win.__RENDERER__;
    if (!r || typeof r.render !== "function") return false;
    const rr = r.render;
    r.render = function (scene, camera, ...a) { const v = rr.call(this, scene, camera, ...a); try { score(this, camera); } catch { /* never breaks the frame */ } return v; };
    return true;
  };
  win.__poseProbe = { setTarget(t) { P.target = t; P.ok = 0; }, hasTarget: () => P.target !== null,
    read: () => ({ ready: P.at !== null, at: P.at, residual: P.residual, last: P.last, frames: P.frames }) };
  if (!hook() && typeof win.setInterval === "function") { const id = win.setInterval(() => { if (hook()) win.clearInterval(id); }, 100); }
}
/** Harness poll: sets the target once, then answers the probe's read ({ready, residual, last, frames}). */
export const poseReadyJs = (target) => `(() => { const p = window.__poseProbe; if (!p) return { ready: false, err: "no pose probe" }; if (!p.hasTarget()) p.setTarget(${JSON.stringify(target)}); return p.read(); })()`;

/** webgpu diag20 E8 dev hooks, read once per view at the end of the cost window: castShadow objects no caster layer carries
 * (WorldSky's debug handle `__STUDIO_SKY_DEBUG__.castersMissingLayer()`: name, owner, kind each; expect none) and the
 * RenderWarmGate state (CharacterMode __STUDIO_WARM__: open reason "stable" or "cap", frames). */
export const DEV_HOOKS_JS = `(() => { let casters = null; try { const f = window.__STUDIO_SKY_DEBUG__?.castersMissingLayer; casters = typeof f === "function" ? f() : null; } catch (e) { casters = "err " + String(e).slice(0, 60); } const w = window.__STUDIO_WARM__; return { castersMissingLayer: casters, warm: w ? { open: w.open, reason: w.reason, frames: w.frames } : null }; })()`;

/** Names shown in the summary cell before "+N more". */
const DEV_HOOKS_NAMES_MAX = 8;

/** One summary cell from DEV_HOOKS_JS's answer: the missing casters by name [owner, kind]. */
export function devHooksLine(d) {
  if (!d) return null;
  const m = d.castersMissingLayer;
  let c;
  if (m === null || m === undefined) c = "casters ?";
  else if (typeof m === "string") c = `casters ${m}`;
  else if (m.length === 0) c = "casters missing layer 0";
  else {
    const names = m.slice(0, DEV_HOOKS_NAMES_MAX).map((x) => `${x.name} [${x.owner}, ${x.kind}]`).join(", ");
    c = `casters missing layer ${m.length} (expect 0): ${names}${m.length > DEV_HOOKS_NAMES_MAX ? ` +${m.length - DEV_HOOKS_NAMES_MAX} more` : ""}`;
  }
  const w = d.warm ? `warm ${d.warm.open ? d.warm.reason : "not open"} @${d.warm.frames}f` : "warm ?";
  return `${c}; ${w}`;
}

/** rAF rate of a blank page (frames per second) -> the cap verdict. Above 61 fps the vsync / frame-rate cap is off and
 * fps readings can show headroom; at or under it every fps near 60 means "at least 60". */
export function capVerdict(blankRafFps) {
  if (!Number.isFinite(blankRafFps)) return { blankRafFps: null, capDetected: null };
  return { blankRafFps: Math.round(blankRafFps * 10) / 10, capDetected: blankRafFps <= 61 };
}

/** A view URL that repeats a query key (the page takes one of them, so the view is not the one asked for). Returns the key or null. */
export function repeatedQueryKey(url) {
  const q = String(url).split("#")[0].split("?")[1];
  if (!q) return null;
  const seen = new Set();
  for (const kv of q.split("&")) {
    const k = decodeURIComponent(kv.split("=")[0]);
    if (!k) continue;
    if (seen.has(k)) return k;
    seen.add(k);
  }
  return null;
}

/** HH:MM game-clock text in the page body -> minute of day, or null when none is shown. */
export function clockMinute(text) {
  const m = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(String(text ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** True when both clock readings exist and the game clock did not advance between the first and the last frame. */
export function clockStalled(first, last) {
  return Number.isFinite(first) && Number.isFinite(last) && first === last;
}

/** Twin pairs: view names `<x>-off` with a `<x>-on` partner -> [[off, on]]. */
export function twinPairs(names) {
  const set = new Set(names);
  return names.filter((n) => n.endsWith("-off") && set.has(`${n.slice(0, -4)}-on`)).map((n) => [n, `${n.slice(0, -4)}-on`]);
}

/** An "off" twin whose last frame is byte-identical to its "on" twin (same encoder and size: pixel-identical) switched nothing off. */
export function twinIdentical(offJpg, onJpg) {
  return Boolean(offJpg && onJpg && offJpg.length === onJpg.length && Buffer.compare(offJpg, onJpg) === 0);
}

const cell = (x) => (x === null || x === undefined ? "-" : typeof x === "number" ? String(Math.round(x * 100) / 100) : String(x));
/** The "gpu segments" cell: `label avg/max` per GPU segment, ms. Native WebGPU pages report nothing unless the view's URL
 * carries `gputiming=1` (the timestamp queries are off while the HUD perf section is closed); the cell then reads
 * "off (no gputiming=1)". Nothing is added to the URL here. */
export function segmentsCell(g) {
  const seg = g?.segments;
  if (!Array.isArray(seg)) return null;
  if (!seg.length) return g.supported ? "none yet" : "off (no gputiming=1)";
  return seg.map((x) => `${x.label} ${r1c(x.avg)}/${r1c(x.max)}`).join("; ");
}
const r1c = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : "?");
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
    contaminated: r.contaminated ? `CONTAMINATED${r.contaminationReasons?.length ? ` (${r.contaminationReasons.join("; ")})` : ""}` : r.contaminated ?? null, vramStartMiB: r.vramStartMiB ?? null, lumaSettled: r.reads?.settled?.luma ?? null, lumaFinal: r.final?.luma ?? null, blackShare: r.final?.blackShare ?? null,
    from, fps: wk?.wallFps ?? null, low1: wk?.low1 ?? null, gpuMs: wk?.gpuFrameMs?.mean ?? null, cpuMs: wk?.workMs?.mean ?? null,
    costMs: wk?.costMs?.mean ?? null, uncappedFps: wk?.uncappedFps ?? null,
    calls: g.calls ?? s.renderer?.calls ?? null, tris: trisInvalid(r) ? "tris invalid (cull read-back)" : g.tris ?? s.renderer?.triangles ?? null,
    heapMbPerMin: r.heapSlope?.mbPerMin ?? null,
    gpuSegments: segmentsCell(g),
    majorGCs: w.heap?.majorGCs ?? null, allocMBps: w.heap?.allocMBps ?? null, topStage: top ? `${top[0]} ${top[1]}` : null,
    hitches: w.hitches ? `${w.hitches.over33}${hitchTop ? ` (${hitchTop})` : ""}` : null,
    errors: `${r.gpuErrors?.length ?? "?"}/${r.console?.filter(([k]) => k.startsWith("error")).length ?? "?"}/${r.pageErrors?.length ?? "?"}/${r.http404s ?? "?"}`,
    failed: r.failed ?? null, heapTop: w.heapTop?.length ? w.heapTop.slice(0, 3).map((h) => `${h.fn} ${h.selfMB} MB`).join("; ") : null,
    cpuTop: w.cpuTop?.top?.length ? w.cpuTop.top.slice(0, 5).map((f) => `${f.fn.replace(/ \S*\/([^/ ]+)$/, " $1")} ${f.msPerFrame ?? f.selfMs}`).join("; ") : null,
    gpuProbe: r.gpuErrorProbe ? gpuProbeLine(r.gpuErrorProbe) : null,
    nanProbe: r.nanProbe ? nanProbeLine(r.nanProbe) : null,
    targets: r.targetProbe ? targetsLine(r.targetProbe) : null,
    clock: r.clock ? `${r.clock.first ?? "?"}->${r.clock.last ?? "?"} ${r.clock.clockAdvancing === null ? "?" : r.clock.clockAdvancing ? "advancing" : "STOPPED"}` : null,
    clockStopped: r.clock?.clockAdvancing === false && /[?&]rate=(?!0(&|$))/.test(r.url ?? ""),
    drawCensus: w.drawCensus ? drawCensusLine(w.drawCensus, wk?.workMs?.mean ?? null) : null,
    load: r.loadTimeline ? loadLine(r.loadTimeline) : null,
    devHooks: devHooksLine(r.devHooks),
    heapAllocTop5: heapAllocLine(r.heapSample?.topAllocated),
    vegTrisByRung: vegRungLine(s.vegRead),
    fetchBeforeReady: resourceLine(r.resources?.atReady),
    profileSrc: r.profile?.selfTopSrc?.length ? `${r.profile.from === "settle" ? `settle+${r.profile.atSpec}` : r.profile.at} s: ${r.profile.selfTopSrc.map(([f, ms]) => `${f} ${ms}`).join("; ")}` : null,
    weatherPinAdded: r.weatherPinAdded ?? false,
    readyGate: readyGateLine(r),
    programErrors: r.errors?.length ? `${r.errors.length}: ${r.errors.slice(0, 3).map((e) => `${e.by ? `${e.by.perfTag ?? "-"}/${e.by.name || "?"}/${e.by.materialType ?? "?"}` : "?"} [${(e.attributes ?? []).length} attrs]`).join("; ")}` : "0",
    shotErrors: r.shotErrors?.length ? r.shotErrors[0] : null,
    settled: Boolean(r.reads?.settled), stalled: r.stalledReads?.length ?? null, error: r.error ? r.error.split("\n")[0] : undefined,
  };
}
/** Markdown summary: one row per view from its result.json `summary` (`summariseView`). "from" names the window the rates
 * came from; "contaminated" is the view's blank-page baseline verdict. */
export function summaryTable(views, cap, prep = null) {
  const cols = ["view", "failed", "load s", "contaminated", "luma settled", "luma final", "black", "from", "fps", "low1", "GPU ms", "CPU ms", "cost ms", "uncapped fps", "gpu segments avg/max ms", "calls", "tris M", "heap MB/min (post-quiet)", "top stage ms/frame", "hitches>33 (top)", "errors gpu/con/page/404", "major GCs", "alloc MB/s", "cpu top5 ms/frame", "gpu-error probe", "nan probe", "draw census", "targets", "ready gate", "program errors", "shot error", "clock", "dev hooks", "profile self top15 (source)", "heap alloc top5", "veg tris by rung", "fetch before ready"];
  const rows = views.map(({ name, summary: s = {} }) => [name, s.failed, s.load, s.contaminated, s.lumaSettled, s.lumaFinal, s.blackShare, s.from, s.fps, s.low1, s.gpuMs, s.cpuMs,
    s.costMs, s.uncappedFps, s.gpuSegments, s.calls, s.tris == null || typeof s.tris === "string" ? s.tris : s.tris / 1e6, s.heapMbPerMin, s.topStage, s.hitches, s.errors, s.majorGCs, s.allocMBps, s.cpuTop, s.gpuProbe, s.nanProbe, s.drawCensus, s.targets, s.readyGate, s.programErrors, s.shotErrors, s.clock, s.devHooks, s.profileSrc, s.heapAllocTop5, s.vegTrisByRung, s.fetchBeforeReady].map(cell));
  const stopped = views.filter((v) => v.summary?.clockStopped).map((v) => v.name);
  const unpinned = views.filter((v) => v.summary?.weatherPinAdded).map((v) => v.name);
  return [...(unpinned.length ? [`WEATHER UNPINNED in the views file (w=clear added; diag20 E7): ${unpinned.join(", ")}`] : []), `cap detected: ${cell(cap?.capDetected)} (blank-page rAF ${cell(cap?.blankRafFps)} fps)`, ...(prep ? [prepLine(prep)] : []), ...(stopped.length ? [`CLOCK STOPPED (rate= set, first and last frame show the same time): ${stopped.join(", ")}`] : []), "",
    `| ${cols.join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`),
    ...views.flatMap((v) => trisPassTable(v.name, v.window?.drawCensus))].join("\n");
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

/** The dist a view is served from, by its URL's base (build-dist.sh names): /elder-souls-argonia/<studio|webgpu|harness>/
 * -> dev | webgpu | harness; null for a URL no dist serves (a plain page). */
export function distNameOf(url) {
  const m = /\/elder-souls-argonia\/(studio|webgpu|harness)\//.exec(String(url ?? ""));
  return m ? (m[1] === "studio" ? "dev" : m[1]) : null;
}

/** pod-capture's prep (diag13 D1: a capture served a dist built before the fixes it was meant to measure). Per dist name:
 * keyOf(name) (build-dist.sh --key, the one key logic) against srchashOf(name) (dist-<name>/.srchash, null when absent);
 * different -> build(name) once (it throws on failure: the capture stops), else step "build:<name>" fresh; then sync(name)
 * (pod-sync.sh, which skips when the pod's copy hash is equal and returns {skipped}). Rows are THIS run's only, each timed;
 * totalS is their wall sum. now() in ms. */
export function prepDists({ names, head, keyOf, srchashOf, build, sync = null, now = Date.now }) {
  const t0 = now(), steps = [], dists = {};
  const step = (name, fn) => { const t = now(); const r = fn() ?? {}; steps.push({ step: name, seconds: Math.round((now() - t) / 100) / 10, ...r }); return r; };
  for (const n of names) {
    const key = keyOf(n), had = srchashOf(n);
    const stale = had !== key;
    step(`build:${n}`, () => (stale ? (build(n), {}) : { fresh: true }));
    dists[n] = { key, built: stale };
    if (sync) step(`sync:${n}`, () => sync(n));
  }
  return { head, dists, steps, totalS: Math.round((now() - t0) / 100) / 10 };
}

/** The summary's first lines: HEAD, the key per dist, this run's prep rows and the total. */
export function prepLine(prep) {
  if (!prep) return null;
  if (prep.error) return `prep: FAILED ${prep.error}`;
  const keys = Object.entries(prep.dists ?? {}).map(([n, d]) => `${n} ${String(d.key).slice(0, 12)}`).join(", ");
  return [`HEAD ${prep.head ?? "?"}; source key ${keys || "-"}`,
    `prep: ${prep.steps.map((s) => `${s.step} ${s.fresh ? "fresh" : s.skipped ? "skip" : `${s.seconds} s`}`).join(", ")}; total ${prep.totalS} s`].join("\n");
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
 * canvas is the one marked `data-render-canvas` by the studio, else the renderer's own canvas `__RENDERER__.domElement`
 * (a classic WebGLRenderer dev page marks none: c10, dev twins saved no frame), never picked by size (walk-10 vol smoke 2: the largest
 * canvas was the 2D province preview map, so the game canvas was hidden) nor by probing getContext (that claims a
 * canvas that has no context yet: the preview map then gets null for "2d" and the studio crashes). Every element that
 * neither is nor holds it is hidden (the HUD, the minimap, the 2D preview page), html and body get overflow hidden.
 * Returns {ok, hidden, before, after, err?}: before/after are the canvas's layout (client) and drawing-buffer sizes; ok
 * is false when no render canvas is marked or either size changed (the caller fails loudly). */
export const HUD_HIDE_JS = `(() => { const dom = window.__RENDERER__?.domElement; const main = document.querySelector("canvas[data-render-canvas]") ?? (dom?.tagName === "CANVAS" && dom.isConnected !== false ? dom : null); if (!main) return { ok: false, hidden: 0, err: "no canvas[data-render-canvas] and no __RENDERER__.domElement" }; const size = () => [main.clientWidth, main.clientHeight, main.width, main.height]; const before = size(); window.__hid = [...document.querySelectorAll("body *")].filter((e) => e !== main && !e.contains(main)); window.__hid.forEach((e) => { e.dataset.v = e.style.visibility; e.style.visibility = "hidden"; }); window.__ovf = [document.documentElement, document.body].map((e) => { const v = e.style.overflow; e.style.overflow = "hidden"; return v; }); const after = size(); const same = before.every((v, i) => v === after[i]); return { ok: same, hidden: window.__hid.length, before, after, ...(same ? {} : { err: "render canvas size changed on hide" }) }; })()`;
/** One frame for the record (every frame and final.jpg of pod-capture): with `clean`, HUD_HIDE_JS around the screenshot
 * only, and a hide that fails throws (the caller records it in result.shotErrors). io = {evaluate(js), shoot(quality)}
 * -> base64 JPEG. */
export async function captureFrame(io, clean, quality = 60) {
  if (!clean) return io.shoot(quality);
  const hide = await io.evaluate(HUD_HIDE_JS);
  if (!hide?.ok) { await io.evaluate(HUD_SHOW_JS); throw new Error(`clean: ${JSON.stringify(hide)}`); }
  try { return await io.shoot(quality); } finally { await io.evaluate(HUD_SHOW_JS); }
}
export const HUD_SHOW_JS =`(() => { window.__hid?.forEach((e) => { e.style.visibility = e.dataset.v; }); window.__hid = null; if (window.__ovf) [document.documentElement, document.body].forEach((e, i) => { e.style.overflow = window.__ovf[i]; }); window.__ovf = null; return true; })()`;

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
 * destroyedInSubmit: every buffer gets an id and an 8-frame creation stack at createBuffer, destroy() records a 12-frame
 * stack and time (last 4096 kept), bind groups remember their buffers, and each command encoder (render/compute passes,
 * bundles via executeBundles) the buffer ids it bound; at Queue.submit a command buffer that bound a destroyed buffer
 * gives a record (encoder label; per buffer id/label/size/usage, the call that bound it (`via`: bind group label, vertex slot, index, drawIndexedIndirect, copy..., clearBuffer), creation and
 * destroy stacks, ms destroy->submit): the first 5, plus the first of each new encoder label (20 labels).
 * destroyedInSubmitSeen counts every such submit, destroyedInSubmitErrors Dawn's "used in submit while destroyed" errors.
 * Self-contained: it is stringified into the page. */
export function installGpuErrorProbe(win) {
  const P = (win.__gpuErrorProbe = { dumps: [], errors: [], threeHooked: false, threeNote: "renderer not seen yet", draws: 0 });
  const MAX_SLOTS = 16, now = () => (win.performance ? Math.round(win.performance.now()) : 0);
  const shaderCode = new WeakMap(), pipelines = new WeakMap(), destroyed = new WeakSet(), bindGroups = new WeakMap(), passes = new WeakMap();
  const labelled = new Set();
  let curRO = null; // the render object of the backend.draw call in progress (null outside one)
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
    try { bgBufs.set(g, { label: d.label ?? "", bufs: Array.from(d.entries ?? [], (e) => e.resource?.buffer).filter(Boolean) }); } catch {}
    try { bindGroups.set(g, { label: d.label ?? "", entries: Array.from(d.entries ?? [], (e) => ({ binding: e.binding, kind: e.resource?.buffer ? `buffer ${e.resource.buffer.label ?? ""} size ${e.resource.buffer.size}` : (e.resource?.constructor?.name ?? typeof e.resource) })) }); } catch {}
    return g;
  });
  // destroyed-in-submit: who destroyed a buffer a submitted command buffer still uses. Buffer info rides a WeakMap (lives
  // as long as the buffer); destroy records sit in a Map bounded to MAX_DESTROYED (oldest dropped); per encoder the ids
  // its passes and bundles bound (one Map per encoder, collected with it). Checked at Queue.submit, where Dawn rejects it.
  const MAX_DESTROYED = 4096, MAX_DIS = 5, MAX_DIS_LABELS = 20;
  const stack = (n) => String(new Error().stack ?? "").split("\n").slice(3, 3 + n).map((l) => l.trim());
  const bufMeta = new WeakMap(), destroyedById = new Map(), bgBufs = new WeakMap(), encUse = new WeakMap(), passEnc = new WeakMap(), cbUse = new WeakMap(), bundleUse = new WeakMap();
  let nextBufId = 1;
  P.destroyedInSubmit = []; P.destroyedInSubmitSeen = 0; P.destroyedInSubmitErrors = 0;
  const disLabels = new Set();
  const meta = (b) => { let m = bufMeta.get(b); if (!m) { m = { id: nextBufId++, label: b.label ?? "", size: b.size, usage: b.usage, createStack: null }; bufMeta.set(b, m); } return m; };
  wrap(Dev, "createBuffer", (f) => function (d) { const b = f.call(this, d); try { bufMeta.set(b, { id: nextBufId++, label: d?.label ?? b.label ?? "", size: d?.size ?? b.size, usage: d?.usage ?? b.usage, createStack: stack(8) }); } catch {} return b; });
  wrap(win.GPUBuffer?.prototype, "destroy", (f) => function () {
    destroyed.add(this);
    try {
      const m = meta(this);
      destroyedById.delete(m.id); destroyedById.set(m.id, { t: now(), stack: stack(12), meta: m });
      if (destroyedById.size > MAX_DESTROYED) destroyedById.delete(destroyedById.keys().next().value);
    } catch {}
    return f.call(this);
  });
  const useOf = (enc) => { let u = encUse.get(enc); if (!u) { u = { label: enc.label ?? "", used: new Map() }; encUse.set(enc, u); } return u; };
  const noteBuf = (u, b, via) => { if (u && b) { const id = meta(b).id; if (!u.used.has(id)) u.used.set(id, via); } };
  const noteGroup = (u, g) => { const bg = u && g ? bgBufs.get(g) : null; if (bg) for (const b of bg.bufs) noteBuf(u, b, bg.label); };
  wrap(Dev, "createCommandEncoder", (f) => function (d) { const e = f.call(this, d); try { encUse.set(e, { label: d?.label ?? e.label ?? "", used: new Map() }); } catch {} return e; });
  wrap(Dev, "createRenderBundleEncoder", (f) => function (d) { const e = f.call(this, d); try { passEnc.set(e, { label: d?.label ?? e.label ?? "", used: new Map() }); } catch {} return e; });
  wrap(win.GPUCommandEncoder?.prototype, "beginComputePass", (f) => function (d) { const p = f.call(this, d); try { passEnc.set(p, useOf(this)); } catch {} return p; });
  wrap(win.GPUCommandEncoder?.prototype, "finish", (f) => function (d) { const cb = f.call(this, d); try { cbUse.set(cb, useOf(this)); } catch {} return cb; });
  for (const C of [win.GPURenderPassEncoder, win.GPUComputePassEncoder, win.GPURenderBundleEncoder]) {
    const pr = C?.prototype;
    wrap(pr, "setBindGroup", (f) => function (i, g, ...a) { try { noteGroup(passEnc.get(this), g); } catch {} return f.call(this, i, g, ...a); });
    wrap(pr, "setVertexBuffer", (f) => function (slot, b, ...a) { try { noteBuf(passEnc.get(this), b, `vertex slot ${slot}`); } catch {} return f.call(this, slot, b, ...a); });
    wrap(pr, "setIndexBuffer", (f) => function (b, ...a) { try { noteBuf(passEnc.get(this), b, "index"); } catch {} return f.call(this, b, ...a); });
  }
  for (const C of [win.GPURenderPassEncoder, win.GPURenderBundleEncoder]) for (const k of ["drawIndirect", "drawIndexedIndirect"])
    wrap(C?.prototype, k, (f) => function (b, ...a) { try { noteBuf(passEnc.get(this), b, k); } catch {} return f.call(this, b, ...a); });
  wrap(win.GPUComputePassEncoder?.prototype, "dispatchWorkgroupsIndirect", (f) => function (b, ...a) { try { noteBuf(passEnc.get(this), b, "dispatchWorkgroupsIndirect"); } catch {} return f.call(this, b, ...a); });
  const CE = win.GPUCommandEncoder?.prototype;
  wrap(CE, "copyBufferToBuffer", (f) => function (src, ...a) { try { const u = useOf(this); noteBuf(u, src, "copyBufferToBuffer src"); noteBuf(u, a.find((x) => x && typeof x === "object"), "copyBufferToBuffer dst"); } catch {} return f.call(this, src, ...a); });
  wrap(CE, "copyBufferToTexture", (f) => function (src, ...a) { try { noteBuf(useOf(this), src?.buffer, "copyBufferToTexture"); } catch {} return f.call(this, src, ...a); });
  wrap(CE, "copyTextureToBuffer", (f) => function (src, dst, ...a) { try { noteBuf(useOf(this), dst?.buffer, "copyTextureToBuffer"); } catch {} return f.call(this, src, dst, ...a); });
  wrap(CE, "resolveQuerySet", (f) => function (qs, first, count, dst, ...a) { try { noteBuf(useOf(this), dst, "resolveQuerySet"); } catch {} return f.call(this, qs, first, count, dst, ...a); });
  wrap(CE, "clearBuffer", (f) => function (b, ...a) { try { noteBuf(useOf(this), b, "clearBuffer"); } catch {} return f.call(this, b, ...a); });
  wrap(win.GPURenderBundleEncoder?.prototype, "finish", (f) => function (d) { const bun = f.call(this, d); try { bundleUse.set(bun, passEnc.get(this)); } catch {} return bun; });
  wrap(win.GPURenderPassEncoder?.prototype, "executeBundles", (f) => function (list) {
    try { const u = passEnc.get(this); for (const bun of list ?? []) { const bu = bundleUse.get(bun); if (u && bu) for (const [id, via] of bu.used) if (!u.used.has(id)) u.used.set(id, `bundle ${bu.label} ${via}`); } } catch {}
    return f.call(this, list);
  });
  wrap(win.GPUQueue?.prototype, "submit", (f) => function (cbs) {
    try {
      for (const cb of cbs ?? []) {
        const u = cbUse.get(cb);
        if (!u) continue;
        let hits = null;
        for (const [id, via] of u.used) { const d = destroyedById.get(id); if (d) (hits ??= []).push({ id, via, d }); }
        if (!hits) continue;
        P.destroyedInSubmitSeen++;
        const fresh = !disLabels.has(u.label) && disLabels.size < MAX_DIS_LABELS;
        if (P.destroyedInSubmit.length >= MAX_DIS && !fresh) continue;
        disLabels.add(u.label);
        const t = now();
        P.destroyedInSubmit.push({ t, encoder: u.label, pass: P.encoderPasses[u.label] ?? null, buffers: hits.map(({ id, via, d }) => ({ id, label: d.meta.label, size: d.meta.size, usage: d.meta.usage,
          via, createStack: d.meta.createStack, destroyStack: d.stack, msDestroyToSubmit: t - d.t })) });
      }
    } catch {}
    return f.call(this, cbs);
  });
  wrap(win.GPUAdapter?.prototype, "requestDevice", (f) => async function (...a) {
    const d = await f.apply(this, a);
    d.addEventListener?.("uncapturederror", (e) => {
      const msg = String(e.error?.message ?? e.message);
      if (msg.includes("used in submit while destroyed")) P.destroyedInSubmitErrors++;
      if (P.errors.length < 5) P.errors.push({ t: now(), message: msg.slice(0, 600) });
    });
    return d;
  });
  // pass identity per encoder label, once per label (first 40): attachment formats/sizes of its first render pass, the
  // label of the first pipeline set in it and the camera of the backend.draw in progress then
  P.encoderPasses = {};
  const viewTex = new WeakMap(), MAX_ENC_PASSES = 40;
  let encPassCount = 0;
  wrap(win.GPUTexture?.prototype, "createView", (f) => function (...a) { const v = f.apply(this, a); try { viewTex.set(v, this); } catch {} return v; });
  const attInfo = (v) => { const t = v ? viewTex.get(v) : null; return t ? { label: t.label ?? "", format: t.format ?? null, size: [t.width, t.height], sampleCount: t.sampleCount ?? 1 } : v ? { label: "?" } : null; };
  const passIdentity = (d) => ({ passLabel: d?.label ?? "", colour: Array.from(d?.colorAttachments ?? [], (c) => (c ? attInfo(c.view) : null)),
    depth: d?.depthStencilAttachment ? attInfo(d.depthStencilAttachment.view) : null, firstPipeline: null, camera: null });
  wrap(win.GPUCommandEncoder?.prototype, "beginRenderPass", (f) => function (d) {
    const pass = f.call(this, d);
    let idRec = null;
    try {
      const u = useOf(this); passEnc.set(pass, u);
      if (encPassCount < MAX_ENC_PASSES && !Object.hasOwn(P.encoderPasses, u.label)) { idRec = P.encoderPasses[u.label] = passIdentity(d); encPassCount++; }
    } catch {}
    passes.set(pass, { pipeline: null, info: null, vb: new Array(MAX_SLOTS).fill(null), vbOff: new Array(MAX_SLOTS).fill(0), vbSize: new Array(MAX_SLOTS).fill(0),
      ib: null, ibFormat: null, groups: new Array(8).fill(null), label: d?.label ?? "", idRec });
    return pass;
  });
  const cameraOf = (ro) => { const c = ro?.camera; return c ? { type: c.type ?? null, name: c.name ?? "", ortho: Boolean(c.isOrthographicCamera), array: Boolean(c.isArrayCamera), object: ro.object?.name ?? null } : null; };
  const RP = win.GPURenderPassEncoder?.prototype;
  wrap(RP, "setPipeline", (f) => function (p) {
    const s = passes.get(this);
    if (s) {
      s.pipeline = p; s.info = pipelines.get(p) ?? null;
      if (s.idRec) { try { s.idRec.firstPipeline = s.info?.label ?? p?.label ?? ""; s.idRec.camera = cameraOf(curRO); } catch {} s.idRec = null; }
    }
    return f.call(this, p);
  });
  wrap(RP, "setVertexBuffer", (f) => function (slot, buf, off, size) { const s = passes.get(this); if (s && slot < MAX_SLOTS) { s.vb[slot] = buf ?? null; s.vbOff[slot] = off ?? 0; s.vbSize[slot] = size ?? -1; } return f.call(this, slot, buf, off, size); });
  wrap(RP, "setIndexBuffer", (f) => function (buf, fmt, off, size) { const s = passes.get(this); if (s) { s.ib = buf; s.ibFormat = fmt; } return f.call(this, buf, fmt, off, size); });
  wrap(RP, "setBindGroup", (f) => function (i, g, ...a) { const s = passes.get(this); if (s && i < 8) s.groups[i] = g ?? null; return f.call(this, i, g, ...a); });
  const bufInfo = (b) => (b ? { label: b.label ?? "", size: b.size, usage: b.usage, destroyed: destroyed.has(b) } : null);
  // object and pipeline tied in one record: the render object of THIS backend.draw call, the pipeline bound in the pass
  // when its GPU draw ran, and the pipeline three selected for it (backend.get(ro.pipeline).pipeline)
  const tuple = (ro, s) => {
    const t = { sameCall: Boolean(ro), passPipelineLabel: s.info?.label ?? null };
    if (!ro) return t;
    try { t.materialName = ro.material?.name ?? null; } catch {}
    try { t.cacheKey = typeof ro.getCacheKey === "function" ? String(ro.getCacheKey()) : null; } catch (e) { t.cacheKey = `err ${e.message}`; }
    try { const gp = win.__RENDERER__?.backend?.get?.(ro.pipeline)?.pipeline; t.threePipelineLabel = gp ? (pipelines.get(gp)?.label ?? gp.label ?? "") : null; t.threePipelineIsBound = gp ? gp === s.pipeline : null; } catch (e) { t.threePipelineLabel = `err ${e.message}`; }
    return t;
  };
  const threeSide = () => {
    const ro = curRO;
    if (!ro) return { note: `no backend.draw in progress (${P.threeNote})` };
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
      vertexWGSL: shaderCode.get(s.info.module) ?? null, tuple: tuple(curRO, s), three: threeSide() });
  };
  for (const k of ["draw", "drawIndexed", "drawIndirect", "drawIndexedIndirect"]) wrap(RP, k, (f) => function (a0, a1, a2, a3, a4) { check(this, k, a0, a1, a2, a3, a4); return f.call(this, a0, a1, a2, a3, a4); });
  // three side: wrap backend.draw once the studio exposes the renderer (window.__RENDERER__)
  const hook = () => {
    const be = win.__RENDERER__?.backend;
    if (!be || typeof be.draw !== "function") return false;
    const draw = be.draw;
    be.draw = function (ro, info) { const prev = curRO; curRO = ro; try { return draw.call(this, ro, info); } finally { curRO = prev; } };
    P.threeHooked = true; P.threeNote = "backend.draw wrapped";
    return true;
  };
  if (!hook() && typeof win.setInterval === "function") { const id = win.setInterval(() => { if (hook()) win.clearInterval(id); }, 250); }
}

/** `--probe-nan` (diagnosis only; never a bar row). Installed by the init script before the app's scripts, it wraps the
 * WebGPU upload paths on `win` and scans every CPU write for a non-finite float: GPUQueue.writeBuffer (bytes as Float32),
 * GPUQueue.writeTexture (*16float formats as half floats, *32float as Float32; other formats skipped) and mapped ranges
 * (mappedAtCreation or mapAsync WRITE; each getMappedRange scanned as Float32 at unmap). Skipped: INDEX, INDIRECT and
 * MAP_READ buffers and integer typed-array writes. Early exit at the first bad value of a write; one record per
 * buffer/texture (its first hit), at most 40: frame (GPUQueue.submit count so far), ms since timeOrigin, label, size,
 * usage, byte offset and float index, value, 8 neighbouring floats, stack (12 frames), and, for a three.js uniform buffer
 * (written inside `__RENDERER__.backend.updateBinding`), the binding name and the uniforms whose offset covers the bad
 * float. Inside `renderer._bindings.updateForRender(renderObject)` the hit also names its OWNER (looked up on a hit only):
 * `owner` = the object (name, type, uuid, userData keys, 3 parent names), material (name, type, uuid), the render context
 * (width, height, label, its target) and, for the uniform, `node` (name, class, value class and Vector/Matrix/Color
 * components); a `render` group adds `camera` (type, name, uuid, aspect, fov, near, far, zoom, view offset, ortho bounds,
 * isArrayCamera) and `renderer` (current target size/depth/label/samples, viewport, drawing-buffer size). Binding writes keep
 * the first record per (group, uniform, owner uuid), other writes one per buffer/texture, at most 60. `persistent` lists
 * every owner (group + uuid) whose LAST write in the run was still non-finite, with its name and bad-write count, so
 * start-up NaNs are told apart from values that stay bad. `badPerFrame[f]` counts bad writes per submit for the first
 * 600; `scanned` / `bytes` are the scan totals. `layout` (D4): createShaderModule / createComputePipeline / createBindGroup
 * and compute-pass setPipeline/setBindGroup are wrapped; for the first hit buffer a compute pass bound it gives
 * {pipelineLabel, group, binding, bufferLabel, byteOffset, wgslStruct (the var<uniform> line + its struct, members in offset
 * order), wgsl (the module source, 20 kB)}; null with no hit, `{err}` when no compute pass bound a hit buffer. Mapped ranges and writeBuffer into STORAGE-not-UNIFORM buffers whose hit has a subnormal float among its 8 neighbours or whose non-finite share is over 0.5 % are packed integer data: counted in `packedSkipped`, never recorded. Self-contained: it is stringified into the page. */
export function installNanProbe(win) {
  const P = (win.__nanProbe = { records: [], badPerFrame: [], scanned: 0, bytes: 0, bad: 0, packedSkipped: 0, frame: 0, threeHooked: false, persistent: [] });
  const MAX = 60, FRAMES = 600, INDEX = 0x10, INDIRECT = 0x100, MAP_READ = 0x1;
  const hit = new WeakSet(), maps = new WeakMap();
  let curBinding = null, curRO = null;
  const seen = new Set(), owners = new Map(); // owners: group|uuid -> { name, group, bad, lastBad }
  const now = () => (win.performance ? Math.round(win.performance.now()) : 0);
  const wrap = (proto, name, make) => { if (proto && typeof proto[name] === "function") proto[name] = make(proto[name]); };
  const half = (h) => { const e = (h >> 10) & 31, m = h & 1023, s = h & 0x8000 ? -1 : 1; return e === 31 ? (m ? NaN : s * Infinity) : s * (e ? 2 ** (e - 15) * (1 + m / 1024) : 2 ** -14 * (m / 1024)); };
  const name = (v) => (Number.isNaN(v) ? "NaN" : v > 0 ? "Inf" : "-Inf");
  const skipUsage = (u) => Boolean((u ?? 0) & (INDEX | INDIRECT | MAP_READ));
  // returns the first bad index or -1; vals(i) reads element i
  const scan = (n, vals, bytesPer) => {
    P.scanned++; P.bytes += n * bytesPer;
    for (let i = 0; i < n; i++) { const v = vals(i); if (v !== v || v === Infinity || v === -Infinity) return i; }
    return -1;
  };
  const unifsAt = (b, fi) => (b.uniforms ?? []).filter((u) => { const o = u.offset, n = u.itemSize ?? 1; return typeof o === "number" && fi >= o && fi < o + Math.max(n, 1); });
  const uniformsAt = (b, fi) => { try { return unifsAt(b, fi).map((u) => u.name ?? u.nodeUniform?.name ?? "?"); } catch (e) { return [`err ${e.message}`]; } };
  const nums = (a) => Array.from(a ?? [], (x) => (Number.isFinite(x) ? x : name(x)));
  const comps = (v) => {
    if (!v || typeof v !== "object") return undefined;
    if (v.isMatrix4 || v.isMatrix3 || v.isMatrix2) return nums(v.elements);
    if (v.isColor) return nums([v.r, v.g, v.b]);
    if (v.isVector2 || v.isVector3 || v.isVector4 || v.isQuaternion) return nums(["x", "y", "z", "w"].filter((k) => k in v).map((k) => v[k]));
    return undefined;
  };
  const nodeOf = (u) => {
    const nu = u?.nodeUniform, node = nu?.node, v = node ? node.value : nu?.value;
    return { uniform: u?.name ?? nu?.name ?? null, name: node?.name ?? nu?.name ?? null, class: node?.constructor?.name ?? null,
      valueType: v === null ? "null" : typeof v, valueClass: v && typeof v === "object" ? v.constructor?.name ?? null : null,
      value: typeof v === "number" ? (Number.isFinite(v) ? v : name(v)) : comps(v) };
  };
  const tgt = (t) => (t ? { width: t.width ?? null, height: t.height ?? null, depth: t.depth ?? null, label: t.texture?.name || t.label || null, samples: t.samples ?? null, isCubeRenderTarget: Boolean(t.isCubeRenderTarget) } : null);
  const camOf = (c) => (c ? { type: c.type ?? null, name: c.name ?? "", uuid: c.uuid ?? null, aspect: c.aspect ?? null, fov: c.fov ?? null, near: c.near ?? null, far: c.far ?? null, zoom: c.zoom ?? null,
    view: c.view ? { ...c.view } : null, ortho: c.isOrthographicCamera ? { left: c.left, right: c.right, top: c.top, bottom: c.bottom } : null, isArrayCamera: Boolean(c.isArrayCamera) } : null);
  const ownerKey = (group, ro) => { const isRender = group === "render", o = isRender ? ro.camera : ro.object; return { uuid: o?.uuid ?? null, name: o?.name || o?.type || "?" }; };
  const ownerInfo = (ro, group) => {
    const o = ro.object, m = ro.material, ctx = ro.context, out = {};
    try {
      const parents = []; for (let p = o?.parent; p && parents.length < 3; p = p.parent) parents.push(p.name || p.type || "?");
      out.object = o ? { name: o.name ?? "", type: o.type ?? null, uuid: o.uuid ?? null, userData: Object.keys(o.userData ?? {}), parents } : null;
      out.material = m ? { name: m.name ?? "", type: m.type ?? null, uuid: m.uuid ?? null } : null;
      out.context = ctx ? { width: ctx.width ?? null, height: ctx.height ?? null, label: ctx.label ?? null, target: tgt(ctx.renderTarget) } : null;
      if (group === "render") {
        out.camera = camOf(ro.camera);
        const r = win.__RENDERER__, V = (k) => { try { const v = r[k](); return v ? nums([v.x, v.y, v.z, v.w].filter((x) => x !== undefined)) : null; } catch { return null; } };
        out.renderer = r ? { target: tgt(r.getRenderTarget?.()), viewport: V("getViewport"), drawingBuffer: V("getDrawingBufferSize") } : null;
      }
    } catch (e) { out.err = e.message; }
    return out;
  };
  // every binding write inside updateForRender updates its owner's last state (map lookup only; details on a hit)
  const noteOwner = (bad) => {
    if (!curRO || !curBinding) return null;
    const group = curBinding.name ?? "?", k = ownerKey(group, curRO), key = `${group}|${k.uuid}`;
    let e = owners.get(key);
    if (!e) { if (!bad) return null; owners.set(key, (e = { group, uuid: k.uuid, name: k.name, bad: 0, lastBad: false })); }
    e.lastBad = bad; if (bad) e.bad++;
    return k;
  };
  const record = (target, kind, byteBase, idx, vals, n, bytesPer, extra) => {
    P.bad++;
    if (P.frame < FRAMES) P.badPerFrame[P.frame] = (P.badPerFrame[P.frame] ?? 0) + 1;
    const own = kind === "writeBuffer" ? noteOwner(true) : null;
    const fi = (byteBase + idx * bytesPer) / 4;
    let dk = null;
    if (own) { let un = "?"; try { un = uniformsAt(curBinding, fi).join("+"); } catch {} dk = `${curBinding.name}|${un}|${own.uuid}`; }
    if ((dk ? seen.has(dk) : hit.has(target)) || P.records.length >= MAX) return;
    if (dk) seen.add(dk); else hit.add(target);
    const v = vals(idx), near = [];
    for (let i = Math.max(0, idx - 4); i < Math.min(n, idx + 4); i++) { const x = vals(i); near.push(Number.isFinite(x) ? x : name(x)); }
    const r = { kind, frame: P.frame, t: now(), label: target.label ?? "", size: target.size ?? null, usage: target.usage ?? null,
      byteOffset: byteBase + idx * bytesPer, floatIndex: idx, value: name(v), near, stack: String(new Error().stack ?? "").split("\n").slice(1, 13).map((l) => l.trim()), ...extra };
    if (curBinding && kind === "writeBuffer") {
      r.group = curBinding.name ?? null; r.uniforms = uniformsAt(curBinding, fi);
      if (curRO) { r.owner = ownerInfo(curRO, r.group); try { r.owner.node = unifsAt(curBinding, fi).map(nodeOf); } catch (e) { r.owner.node = [`err ${e.message}`]; } }
    } else if (kind === "writeBuffer") r.mapping = P.threeHooked ? "not inside backend.updateBinding (stack only)" : "renderer not hooked (stack only)";
    P.records.push(r);
    if (kind === "writeBuffer" && hitBufs.length < 60 && !hitBufs.some(([b]) => b === target)) hitBufs.push([target, r.byteOffset]);
  };
  // D4 layout: which compute pipeline binds a hit buffer, at what group/binding, and that binding's WGSL uniform struct.
  // Read lazily (the bind happens after the first write), emitted once for the first hit buffer a compute pass bound.
  const modCode = new WeakMap(), pipeInfo = new WeakMap(), bgBufs = new WeakMap(), bufBind = new WeakMap(), hitBufs = [];
  let curPipe = null;
  const D = win.GPUDevice?.prototype;
  wrap(D, "createShaderModule", (f) => function (desc) { const m = f.call(this, desc); try { modCode.set(m, String(desc?.code ?? "")); } catch {} return m; });
  wrap(D, "createComputePipeline", (f) => function (desc) { const pl = f.call(this, desc); try { pipeInfo.set(pl, { label: desc?.label ?? pl?.label ?? "", module: desc?.compute?.module }); } catch {} return pl; });
  wrap(D, "createBindGroup", (f) => function (desc) { const bg = f.call(this, desc); try { bgBufs.set(bg, (desc?.entries ?? []).filter((e) => e?.resource?.buffer || e?.resource?.usage !== undefined).map((e) => [e.resource.buffer ?? e.resource, e.binding])); } catch {} return bg; });
  const CP = win.GPUComputePassEncoder?.prototype;
  wrap(CP, "setPipeline", (f) => function (pl) { curPipe = pl; return f.call(this, pl); });
  wrap(CP, "setBindGroup", (f) => function (index, bg, ...a) {
    try { const info = curPipe && pipeInfo.get(curPipe); if (info) for (const [buf, binding] of bgBufs.get(bg) ?? []) if (!bufBind.has(buf)) bufBind.set(buf, { info, group: index, binding }); } catch {}
    return f.call(this, index, bg, ...a);
  });
  const wgslStruct = (code, g, b) => {
    const m = new RegExp(`(?:@binding\\(\\s*${b}\\s*\\)\\s*@group\\(\\s*${g}\\s*\\)|@group\\(\\s*${g}\\s*\\)\\s*@binding\\(\\s*${b}\\s*\\))\\s*var<\\s*uniform\\s*>\\s*(\\w+)\\s*:\\s*(\\w+)`).exec(code);
    if (!m) return null;
    const st = new RegExp(`struct\\s+${m[2]}\\s*\\{[^}]*\\}`).exec(code);
    return `var<uniform> ${m[1]} : ${m[2]};\n${st ? st[0] : "(struct not found)"}`;
  };
  Object.defineProperty(P, "layout", { enumerable: true, get: () => {
    for (const [buf, byteOffset] of hitBufs) {
      const bb = bufBind.get(buf); if (!bb) continue;
      const code = modCode.get(bb.info.module) ?? "";
      return { pipelineLabel: bb.info.label, group: bb.group, binding: bb.binding, bufferLabel: buf.label ?? "", byteOffset, wgslStruct: wgslStruct(code, bb.group, bb.binding), wgsl: code.slice(0, 20000) };
    }
    return hitBufs.length ? { err: "no compute pass bound a hit buffer" } : null;
  } });
  // packed integer data read as floats: mapped ranges, and writeBuffer into STORAGE-not-UNIFORM buffers, are packed when a
  // float within 4 of the hit is subnormal or over 0.5 % of the range is non-finite
  const packedHit = (target, kind, n, vals, idx) => {
    const u = target.usage ?? 0;
    if (!(kind === "mapped" || (kind === "writeBuffer" && (u & 0x80) && !(u & 0x40)))) return false;
    for (let i = Math.max(0, idx - 4); i < Math.min(n, idx + 4); i++) { const x = Math.abs(vals(i)); if (x > 0 && x < 1.1754943508222875e-38) return true; }
    let bad = 0; for (let i = 0; i < n; i++) { const x = vals(i); if (x !== x || x === Infinity || x === -Infinity) bad++; }
    return bad / n > 0.005;
  };
  const scanBytes = (target, kind, buf, byteStart, byteLen, byteBase, extra) => {
    const n = byteLen >> 2;
    if (n <= 0) return;
    const f = byteStart % 4 === 0 ? new Float32Array(buf, byteStart, n) : new Float32Array(buf.slice(byteStart, byteStart + n * 4));
    const vals = (i) => f[i], i = scan(n, vals, 4);
    if (i >= 0 && packedHit(target, kind, n, vals, i)) { P.packedSkipped++; return; }
    if (i >= 0) record(target, kind, byteBase, i, vals, n, 4, extra);
    else if (kind === "writeBuffer") noteOwner(false);
  };
  Object.defineProperty(P, "persistent", { enumerable: true, get: () => [...owners.values()].filter((e) => e.lastBad).map(({ group, uuid, name: n, bad }) => ({ group, uuid, name: n, bad })) });
  const isInt = (d) => /^(Int8|Int16|Int32|Uint16|Uint32|BigInt64|BigUint64)Array$/.test(d?.constructor?.name ?? "");
  const Q = win.GPUQueue?.prototype;
  wrap(Q, "submit", (f) => function (...a) { P.frame++; return f.apply(this, a); });
  wrap(Q, "writeBuffer", (f) => function (buffer, bufferOffset, data, dataOffset, size) {
    try {
      if (!skipUsage(buffer?.usage) && !isInt(data)) {
        const view = ArrayBuffer.isView(data), bpe = view ? (data.BYTES_PER_ELEMENT ?? 1) : 1;
        const ab = view ? data.buffer : data, start = (view ? data.byteOffset : 0) + (dataOffset ?? 0) * bpe;
        const len = size != null ? size * bpe : (view ? data.byteLength : data.byteLength) - (dataOffset ?? 0) * bpe;
        scanBytes(buffer, "writeBuffer", ab, start, len, bufferOffset ?? 0, {});
      }
    } catch {}
    return f.call(this, buffer, bufferOffset, data, dataOffset, size);
  });
  wrap(Q, "writeTexture", (f) => function (dest, data, layout, sz) {
    try {
      const tex = dest?.texture, fmt = String(tex?.format ?? "");
      const is16 = /16float$/.test(fmt), is32 = /32float$/.test(fmt);
      if (tex && (is16 || is32)) {
        const view = ArrayBuffer.isView(data), ab = view ? data.buffer : data, start = (view ? data.byteOffset : 0) + (layout?.offset ?? 0);
        const len = (view ? data.byteLength : data.byteLength) - (layout?.offset ?? 0);
        const extra = { format: fmt, width: tex.width, height: tex.height };
        if (is32) scanBytes(tex, "writeTexture", ab, start, len, 0, extra);
        else {
          const n = len >> 1, h = start % 2 === 0 ? new Uint16Array(ab, start, n) : new Uint16Array(ab.slice(start, start + n * 2));
          const vals = (i) => half(h[i]), i = scan(n, vals, 2);
          if (i >= 0) record(tex, "writeTexture", 0, i, vals, n, 2, extra);
        }
      }
    } catch {}
    return f.call(this, dest, data, layout, sz);
  });
  const B = win.GPUBuffer?.prototype;
  wrap(B, "getMappedRange", (f) => function (off, size) {
    const r = f.call(this, off, size);
    try { if (!skipUsage(this.usage)) { let l = maps.get(this); if (!l) maps.set(this, (l = [])); l.push([r, off ?? 0]); } } catch {}
    return r;
  });
  wrap(B, "unmap", (f) => function () {
    try { const l = maps.get(this); if (l) { maps.delete(this); for (const [ab, off] of l) scanBytes(this, "mapped", ab, 0, ab.byteLength, off, {}); } } catch {}
    return f.call(this);
  });
  const hook = () => {
    const be = win.__RENDERER__?.backend;
    if (!be || typeof be.updateBinding !== "function") return false;
    const orig = be.updateBinding;
    be.updateBinding = function (binding) { const prev = curBinding; curBinding = binding; try { return orig.call(this, binding); } finally { curBinding = prev; } };
    const bs = win.__RENDERER__._bindings;
    if (bs && typeof bs.updateForRender === "function") {
      const ofr = bs.updateForRender;
      bs.updateForRender = function (ro) { const prev = curRO; curRO = ro; try { return ofr.call(this, ro); } finally { curRO = prev; } };
    }
    P.threeHooked = true;
    return true;
  };
  if (!hook() && typeof win.setInterval === "function") { const id = win.setInterval(() => { if (hook()) win.clearInterval(id); }, 250); }
}

/** One summary line from a view's nan-probe.json. */
export function nanProbeLine(p) {
  if (!p || p.err) return `not-a-bar; probe unread${p?.err ? ` (${String(p.err).slice(0, 60)})` : ""}`;
  const totals = `${p.scanned ?? 0} writes, ${Math.round((p.bytes ?? 0) / 1e6 * 10) / 10} MB scanned, packed-skipped ${p.packedSkipped ?? 0}`;
  const r = p.records?.[0];
  if (!r) return `not-a-bar; clean (${totals})`;
  const where = r.group ? `${r.group}.${(r.uniforms ?? []).join("+") || "?"}` : "stack only";
  return `not-a-bar; ${p.bad} bad writes, first f${r.frame} ${r.label || "(unlabelled)"}/${where} ${r.value} (${p.records.length} records; persistent ${p.persistent?.length ?? 0}; ${totals})`;
}

/** One summary line from a view's gpu-error-probe.json: the first dump's missing slot, pipeline label and three object name. */
export function gpuProbeLine(p) {
  if (!p || p.err) return `not-a-bar; probe unread${p?.err ? ` (${String(p.err).slice(0, 60)})` : ""}`;
  const d = p.dumps?.[0];
  const r = p.destroyedInSubmit?.[0], b = r?.buffers?.[0];
  const dis = r ? `; destroyed-in-submit ${p.destroyedInSubmitSeen} (errors ${p.destroyedInSubmitErrors ?? 0}) enc ${r.encoder} buf ${b?.label || `#${b?.id}`} via ${b?.via} destroyed by ${b?.destroyStack?.[0] ?? "?"}` : "";
  if (!d) return `not-a-bar; no unset slot in ${p.draws ?? 0} draws; ${p.errors?.length ?? 0} errors${dis}`;
  return `not-a-bar; slot ${d.missing.join(",")} missing ${d.pipeline.label} obj ${d.three?.object?.name ?? d.three?.note ?? "?"} mat ${d.tuple?.materialName ?? "?"} three-pipeline ${d.tuple?.threePipelineLabel ?? "?"} (${p.dumps.length} dumps)${dis}`;
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
  const C = { on: false, frames: 0, draws: new Float64Array(N), refresh: new Float64Array(N), drawMs: 0, roMs: 0, renderMs: 0, renderCalls: 0, renderDepth: 0, roExMs: 0, roStack: [], refMatrix: new Map(), refStatic: [0, 0], roCreated: 0, roDisposed: 0, byTarget: new Map(), keptZero: 0,
    kinds: { plain: 0, instanced: 0, indirect: 0, zero: 0 }, perFrame: new Float64Array(MAXF), created: { pipelines: 0, shaders: 0, labels: [] },
    hooked: { draw: false, renderObjectDirect: false, needsRefresh: false, render: false, renderObjects: false, renderBufferDirect: false }, otherNames: new Map() };
  // c10: triangles per draw (the renderer's own info.render.triangles delta around the draw: three counts every pass of
  // the frame there) per pass and per perfTag (userData.perfTag, else the category), userData.esIndirect draws in their
  // own columns (native counts an indirect draw at its instance capacity, not the culled count)
  const passTris = new Map(), tagTris = new Map();
  const triRow = (m, k) => { let e = m.get(k); if (!e && m.size < 40) { e = { draws: 0, tris: 0, indirectDraws: 0, indirectTris: 0 }; m.set(k, e); } return e; };
  const trisNow = () => { const t = win.__RENDERER__?.info?.render?.triangles; return Number.isFinite(t) ? t : 0; };
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
  // per render target (texture name, else "rt", else "screen"; at most 16 tags): inclusive ms, objects, draws by category, kept-zero
  const entry = (r) => {
    const rt = typeof r.getRenderTarget === "function" ? r.getRenderTarget() : null;
    const tag = rt ? String(rt.texture?.name || "rt") : "screen";
    let e = C.byTarget.get(tag);
    if (!e && C.byTarget.size < 16) { e = { ms: 0, exMs: 0, n: 0, draws: new Float64Array(N), keptZero: 0 }; C.byTarget.set(tag, e); }
    return e;
  };
  // per pass (webgpu diag20 E8): main (screen), shadow<k> (an orthographic camera into a target, k by first sight of its
  // camera: one per CSM cascade), reflection (a perspective camera into a target named reflect/mirror/water), rt:<tag>
  // (any other target); at most 16 passes: objects (_renderObjectDirect) and draws (backend.draw) per frame
  const shadowIdx = new Map(), byPass = new Map();
  const passOf = (r, cam) => {
    const rt = typeof r?.getRenderTarget === "function" ? r.getRenderTarget() : null;
    if (!rt) return "main";
    const tag = String(rt.texture?.name || "rt");
    if (cam?.isOrthographicCamera || /shadow/i.test(tag)) {
      const id = cam?.uuid ?? tag;
      if (!shadowIdx.has(id) && shadowIdx.size < 8) shadowIdx.set(id, shadowIdx.size);
      return shadowIdx.has(id) ? `shadow${shadowIdx.get(id)}` : "shadow+";
    }
    return /reflect|mirror|water/i.test(tag) ? "reflection" : /bloom|blur|post|composer|lumin|tonemap/i.test(tag) ? `post:${tag.slice(0, 20)}` : `rt:${tag.slice(0, 24)}`;
  };
  const pass = (r, cam) => {
    const k = passOf(r, cam);
    let e = byPass.get(k);
    if (!e && byPass.size < 16) { e = { objects: 0, draws: 0 }; byPass.set(k, e); }
    return e;
  };
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
  // inclusive: nested render() calls (a pass rendering inside a render) count as calls, their time once
  const hookRender = (r) => {
    if (typeof r.render !== "function") return;
    const rr = r.render;
    r.render = function (...a) {
      if (!C.on) return rr.apply(this, a);
      C.renderCalls++; const top = C.renderDepth++ === 0, fr = C.roStack[C.roStack.length - 1], t = now();
      if (fr) fr.rd++;
      try { return rr.apply(this, a); } finally {
        C.renderDepth--; const dt = now() - t;
        if (top) C.renderMs += dt;
        if (fr && --fr.rd === 0) fr.nested += dt;
      }
    };
    C.hooked.render = true;
  };
  // one draw, from either renderer: ro = {object, material, geometry, camera}
  const account = (ro, dt, tris) => {
    C.drawMs += dt; frameDraws++;
    const ci = cat(ro), kz = ci === 0 && ro.object?.userData?.esKept === 0, te = entry(win.__RENDERER__);
    C.draws[ci]++; if (kz) C.keptZero++;
    if (te) { te.draws[ci]++; if (kz) te.keptZero++; }
    const pk = passOf(win.__RENDERER__, ro.camera), pe = pass(win.__RENDERER__, ro.camera); if (pe) pe.draws++;
    const o = ro.object ?? {}, g = ro.geometry ?? {}, ind = o.userData?.esIndirect === true, tr = Math.max(0, tris);
    for (const e of [triRow(passTris, pk), triRow(tagTris, String(o.userData?.perfTag ?? CATS[ci]))]) {
      if (!e) continue;
      if (ind) { e.indirectDraws++; e.indirectTris += tr; } else { e.draws++; e.tris += tr; }
    }
    if (g.indirect) C.kinds.indirect++; else if (o.isInstancedMesh || (o.count ?? 1) > 1) C.kinds.instanced++; else C.kinds.plain++;
    if ((o.isInstancedMesh && o.count === 0) || g.drawRange?.count === 0) C.kinds.zero++;
  };
  // classic WebGLRenderer (dev twins): no backend; every draw (main, shadow maps, render targets) goes through
  // renderer.renderBufferDirect(camera, scene, geometry, material, object, group)
  const hookClassic = (r) => {
    const rbd = r.renderBufferDirect;
    r.renderBufferDirect = function (camera, scene, geometry, material, object, ...rest) {
      if (!C.on) return rbd.call(this, camera, scene, geometry, material, object, ...rest);
      const t = now(), t0 = trisNow();
      try { return rbd.call(this, camera, scene, geometry, material, object, ...rest); } finally { account({ object, material, geometry, camera }, now() - t, trisNow() - t0); }
    };
    C.hooked.renderBufferDirect = true;
  };
  const hook = () => {
    const r = win.__RENDERER__, be = r?.backend;
    if (r && !be && typeof r.renderBufferDirect === "function") { hookClassic(r); hookRender(r); return true; }
    if (!be || typeof be.draw !== "function") return false;
    const draw = be.draw;
    be.draw = function (ro, info) {
      if (!C.on) return draw.call(this, ro, info);
      const t = now(), t0 = trisNow();
      try { return draw.call(this, ro, info); } finally { account(ro, now() - t, trisNow() - t0); }
    };
    C.hooked.draw = true;
    if (typeof r._renderObjectDirect === "function") {
      const rod = r._renderObjectDirect;
      // tagged by the render target bound (its texture name, else "rt", else "screen"; at most 16 tags)
      r._renderObjectDirect = function (...a) {
        if (!C.on) return rod.apply(this, a);
        const t = now(), fr = { nested: 0, rd: 0 };
        C.roStack.push(fr);
        try { return rod.apply(this, a); } finally {
          C.roStack.pop();
          // exclusive = inclusive minus the render() calls nested inside it (CSM shadow maps render inside the first receiver's updateBefore)
          const dt = now() - t, ex = dt - fr.nested; C.roMs += dt; C.roExMs += ex;
          const e = entry(this);
          if (e) { e.ms += dt; e.exMs += ex; e.n++; }
          const pe = pass(this, a[3]); if (pe) pe.objects++;
        }
      };
      C.hooked.renderObjectDirect = true;
    }
    hookRender(r);
    const nodes = r._nodes;
    if (nodes && typeof nodes.needsRefresh === "function") {
      const nr = nodes.needsRefresh;
      // per pass x category x esStatic (userData.esStatic === true) as well as per category
      nodes.needsRefresh = function (ro, ...a) {
        const v = nr.call(this, ro, ...a);
        if (v && C.on) {
          const ci = cat(ro), st = ro.object?.userData?.esStatic === true ? 0 : 1; C.refresh[ci]++; C.refStatic[st]++;
          const k = `${passOf(win.__RENDERER__, ro.camera)}|${CATS[ci]}`;
          let e = C.refMatrix.get(k);
          if (!e && C.refMatrix.size < 200) { e = [0, 0]; C.refMatrix.set(k, e); }
          if (e) e[st]++;
        }
        return v;
      };
      C.hooked.needsRefresh = true;
    }
    // RenderObject churn: creations through renderer._objects.createRenderObject and disposals through the returned object's onDispose (null-safe)
    const objs = r._objects;
    if (objs && typeof objs.createRenderObject === "function") {
      const cro = objs.createRenderObject;
      objs.createRenderObject = function (...a) {
        const ro = cro.apply(this, a);
        if (C.on) C.roCreated++;
        if (ro && typeof ro.onDispose === "function") { const od = ro.onDispose; ro.onDispose = function (...b) { if (C.on) C.roDisposed++; return od.apply(this, b); }; }
        return ro;
      };
      C.hooked.renderObjects = true;
    }
    return true;
  };
  win.__drawCensus = {
    state: C, categories: CATS,
    start() { C.draws.fill(0); C.refresh.fill(0); C.drawMs = 0; C.roMs = 0; C.roExMs = 0; C.refMatrix.clear(); C.refStatic = [0, 0]; C.roCreated = 0; C.roDisposed = 0; C.renderMs = 0; C.renderCalls = 0; C.byTarget.clear(); C.keptZero = 0; C.frames = 0; frameDraws = 0; C.otherNames.clear(); byPass.clear(); shadowIdx.clear(); passTris.clear(); tagTris.clear();
      C.kinds = { plain: 0, instanced: 0, indirect: 0, zero: 0 }; C.created = { pipelines: 0, shaders: 0, labels: [] }; C.on = true; },
    stop() { C.on = false; const f = Math.max(C.frames, 1), r2 = (x) => Math.round(x * 100) / 100;
      const triTable = (m) => Object.fromEntries([...m].sort((a, b) => (b[1].tris + b[1].indirectTris) - (a[1].tris + a[1].indirectTris)).map(([k, v]) => [k, { drawsPerFrame: r2(v.draws / f), trisPerFrame: Math.round(v.tris / f), indirectDrawsPerFrame: r2(v.indirectDraws / f), indirectTrisPerFrame: Math.round(v.indirectTris / f) }]));
      const i = win.__RENDERER__?.info, ir = i?.render ?? {};
      return { ...drawCensusResult(C, CATS), byPass: Object.fromEntries([...byPass].sort((a, b) => b[1].objects - a[1].objects).map(([k, v]) => [k, { objectsPerFrame: r2(v.objects / f), drawsPerFrame: r2(v.draws / f) }])),
        trisByPass: triTable(passTris), trisByTag: triTable(tagTris),
        rendererInfo: i ? { renderer: win.__RENDERER__.backend ? (win.__RENDERER__.backend.isWebGPUBackend ? "WebGPURenderer/webgpu" : "WebGPURenderer/webgl2") : "WebGLRenderer",
          calls: ir.calls ?? ir.drawCalls ?? null, triangles: ir.triangles ?? null, frame: ir.frame ?? null, geometries: i.memory?.geometries ?? null, textures: i.memory?.textures ?? null, programs: Array.isArray(i.programs) ? i.programs.length : null } : null }; },
  };
  // refreshes per frame by pass, then by category, each [static, dynamic]; and per pass totals
  function refreshSplit(c, f, r2) {
    const byPassTag = {}, byPassTotal = {};
    for (const [k, v] of c.refMatrix) {
      const [p, t] = k.split("|"); (byPassTag[p] ??= {})[t] = { static: r2(v[0] / f), dynamic: r2(v[1] / f) };
      const e = (byPassTotal[p] ??= { static: 0, dynamic: 0 }); e.static += v[0] / f; e.dynamic += v[1] / f;
    }
    for (const e of Object.values(byPassTotal)) { e.static = r2(e.static); e.dynamic = r2(e.dynamic); }
    return { refreshByPass: byPassTotal, refreshByPassTag: byPassTag };
  }
  function drawCensusResult(c, cats) {
    const f = Math.max(c.frames, 1), r2 = (x) => Math.round(x * 100) / 100, total = c.draws.reduce((a, b) => a + b, 0);
    const per = Array.from(c.perFrame.subarray(0, Math.min(c.frames, MAXF))).sort((a, b) => a - b);
    const byCat = (arr) => Object.fromEntries(cats.map((k, i) => [k, r2(arr[i] / f)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]));
    return { frames: c.frames, hooked: { ...c.hooked }, drawsPerFrame: r2(total / f), drawsMax: per.length ? per[per.length - 1] : null,
      byCategory: byCat(c.draws), keptZeroPerFrame: r2(c.keptZero / f),
      byTarget: Object.fromEntries([...c.byTarget].sort((a, b) => b[1].draws.reduce((x, y) => x + y, 0) - a[1].draws.reduce((x, y) => x + y, 0)).map(([k, v]) => [k, { drawsPerFrame: r2(v.draws.reduce((x, y) => x + y, 0) / f), keptZeroPerFrame: r2(v.keptZero / f), ...byCat(v.draws) }])), kindsPerFrame: Object.fromEntries(Object.entries(c.kinds).map(([k, v]) => [k, r2(v / f)])),
      refreshesPerFrame: r2(c.refresh.reduce((a, b) => a + b, 0) / f), refreshByCategory: byCat(c.refresh),
      refreshByStatic: { static: r2(c.refStatic[0] / f), dynamic: r2(c.refStatic[1] / f) }, ...refreshSplit(c, f, r2),
      renderObjectChurn: { createdPerFrame: r2(c.roCreated / f), disposedPerFrame: r2(c.roDisposed / f) },
      drawMsPerFrame: r2(c.drawMs / f), renderObjectMsPerFrame: r2(c.roMs / f), renderObjectExclMsPerFrame: r2(c.roExMs / f), renderMsPerFrame: r2(c.renderMs / f), renderCallsPerFrame: r2(c.renderCalls / f),
      renderObjectByTarget: Object.fromEntries([...c.byTarget].sort((a, b) => b[1].ms - a[1].ms).map(([k, v]) => [k, { msPerFrame: r2(v.ms / f), us: r2((v.ms * 1000) / v.n), exclMsPerFrame: r2(v.exMs / f), exclUs: r2((v.exMs * 1000) / v.n) }])),
      usPerDraw: total ? r2((c.drawMs * 1000) / total) : null, usPerRenderObject: total ? r2((c.roMs * 1000) / total) : null, usPerRenderObjectExcl: total ? r2((c.roExMs * 1000) / total) : null,
      createdInWindow: { pipelines: c.created.pipelines, shaders: c.created.shaders, labels: c.created.labels.slice() },
      otherTop: [...c.otherNames].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, r2(v / f)]) };
  }
  if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(tick);
  if (!hook() && typeof win.setInterval === "function") { const id = win.setInterval(() => { if (hook()) win.clearInterval(id); }, 250); }
}

/** One summary cell from a view's draw-census.json (plus the window's work ms per frame, measure.mjs workStats): draws over
 * all passes, Renderer.render inclusive ms/frame, _renderObjectDirect inclusive us per object, backend.draw alone, and
 * work minus render() (everything outside rendering). */
export function drawCensusLine(c, workMs = null) {
  if (!c || c.err) return `not-a-bar; census unread${c?.err ? ` (${String(c.err).slice(0, 60)})` : ""}`;
  const top = Object.entries(c.byCategory ?? {}).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ");
  const cw = c.createdInWindow ?? {};
  const tgt = Object.entries(c.byTarget ?? {}).slice(0, 3).map(([k, v]) => `${k} ${v.drawsPerFrame}`).join(", ");
  const rp = Object.entries(c.refreshByPass ?? {}).map(([k, v]) => `${k} ${Math.round((v.static + v.dynamic) * 100) / 100}`).join(" ");
  const rs = c.refreshByStatic, refs = rp || rs ? ` (${rp}${rs ? `${rp ? "; " : ""}esStatic ${rs.static}, dynamic ${rs.dynamic}` : ""})` : "";
  const churn = c.renderObjectChurn ? `RenderObject +${c.renderObjectChurn.createdPerFrame}/-${c.renderObjectChurn.disposedPerFrame} per frame, ` : "";
  const outside = Number.isFinite(workMs) && Number.isFinite(c.renderMsPerFrame) ? Math.round((workMs - c.renderMsPerFrame) * 100) / 100 : "?";
  return `not-a-bar; ${c.drawsPerFrame} draws (all passes), render() ${c.renderMsPerFrame ?? "?"} ms/frame (${c.renderCallsPerFrame ?? "?"} calls), renderObject ${c.usPerRenderObject ?? "?"} us incl (${c.renderObjectMsPerFrame} ms/frame)${c.usPerRenderObjectExcl != null ? `, ${c.usPerRenderObjectExcl} us excl (${c.renderObjectExclMsPerFrame} ms/frame)` : ""}, backend.draw ${c.usPerDraw ?? "?"} us, work - render() ${outside} ms; ${c.refreshesPerFrame} refreshes${refs}, ${churn}${(cw.pipelines ?? 0) + (cw.shaders ?? 0)} created in window; keptZero ${c.keptZeroPerFrame ?? "?"}; ${top}; targets ${tgt || "?"}; passes ${Object.entries(c.byPass ?? {}).map(([k, v]) => `${k} ${v.objectsPerFrame}/${v.drawsPerFrame}`).join(", ") || "?"} (objects/draws per frame)`;
}

/** summary.md per-pass (then per-perfTag) triangle table of one view's draw census (c10: canopy-08 native 9.5 M vs its
 * WebGL2 backend 6.6 M): draws and tris per frame, esIndirect draws and tris in their own columns. [] without a census. */
export function trisPassTable(name, c) {
  if (!c?.trisByPass || !Object.keys(c.trisByPass).length) return [];
  const M = (x) => (Math.round(x / 1e4) / 100).toFixed(2);
  const rows = (t, kind) => Object.entries(t).map(([k, v]) => `| ${kind} ${k} | ${v.drawsPerFrame} | ${M(v.trisPerFrame)} | ${v.indirectDrawsPerFrame} | ${M(v.indirectTrisPerFrame)} |`);
  const ri = c.rendererInfo;
  return ["", `### ${name}: triangles per frame by pass and perfTag (${ri ? `${ri.renderer}, info.render calls ${ri.calls} tris ${ri.triangles == null ? "?" : M(ri.triangles)} M, programs ${ri.programs ?? "?"}` : "renderer ?"})`,
    "| pass / tag | draws | tris M | esIndirect draws | esIndirect tris M |", "|---|---|---|---|---|", ...rows(c.trisByPass, "pass"), ...rows(c.trisByTag ?? {}, "tag")];
}

/** WebGL2 program failures (c10: "VALIDATE_STATUS false ... Attribute location out of range" on the webgpu WebGL2 backend).
 * Installed by the init script on every capture page (cheap: no added GL query). Remembers, per linked program, what was
 * being drawn or pipelined when it linked (the WebGL backend's createRenderPipeline(renderObject) or draw, or a classic
 * WebGLRenderer's renderBufferDirect object); three's error log queries VALIDATE_STATUS / the info log of the failing
 * program, so a console.error matching the failure is paired with that program: its vertex attributes (`in` declarations
 * of its vertex shader, location when declared) and the object (perfTag, name, type) and material (name, type).
 * window.__programErrors (at most 20) -> result.errors. Self-contained: stringified into the page. */
export function installProgramErrorProbe(win) {
  const E = [], ctxOf = new WeakMap(), GL = win.WebGL2RenderingContext?.prototype;
  let cur = null, lastProg = null;
  win.__programErrors = E;
  const desc = (o) => { if (!o) return null; const ob = o.object ?? {}, m = o.material ?? {}; return { perfTag: ob.userData?.perfTag ?? null, name: String(ob.name ?? ""), type: ob.type ?? null, instanced: Boolean(ob.isInstancedMesh), material: String(m.name ?? ""), materialType: m.type ?? null }; };
  const attrs = (gl, prog) => {
    try {
      const vs = (gl.getAttachedShaders(prog) ?? []).find((sh) => gl.getShaderParameter(sh, 0x8b4f) === 0x8b31);
      const src = vs ? gl.getShaderSource(vs) ?? "" : "";
      return [...src.matchAll(/^\s*(?:layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*)?in\s+\w+\s+(\w+)\s*;/gm)].map((m) => (m[1] === undefined ? m[2] : `${m[1]}:${m[2]}`));
    } catch (e) { return [`err ${String(e).slice(0, 60)}`]; }
  };
  const wrap = (proto, name, make) => { if (proto && typeof proto[name] === "function") proto[name] = make(proto[name]); };
  wrap(GL, "linkProgram", (f) => function (prog) { if (prog) ctxOf.set(prog, desc(cur)); return f.call(this, prog); });
  wrap(GL, "getProgramParameter", (f) => function (prog, pname) { if (pname === 0x8b83 || pname === 0x8b82) lastProg = { gl: this, prog }; return f.call(this, prog, pname); });
  wrap(GL, "getProgramInfoLog", (f) => function (prog) { lastProg = { gl: this, prog }; return f.call(this, prog); });
  const ce = win.console?.error;
  if (typeof ce === "function") {
    win.console.error = function (...a) {
      try {
        const msg = a.map((x) => (typeof x === "string" ? x : String(x?.message ?? x))).join(" ");
        if (E.length < 20 && /VALIDATE_STATUS false|Attribute location out of range|Shader Error|Program Info Log/.test(msg)) {
          const p = lastProg;
          E.push({ kind: "webgl-program", message: msg.slice(0, 300), attributes: p ? attrs(p.gl, p.prog) : null, by: p ? ctxOf.get(p.prog) ?? null : null });
        }
      } catch { /* never breaks the page's log */ }
      return ce.apply(this, a);
    };
  }
  const hook = () => {
    const r = win.__RENDERER__;
    if (!r) return false;
    const be = r.backend, set = (o) => { cur = o; };
    if (be && typeof be.createRenderPipeline === "function") { const f = be.createRenderPipeline; be.createRenderPipeline = function (ro, ...a) { set(ro); return f.call(this, ro, ...a); }; }
    if (be && typeof be.draw === "function") { const f = be.draw; be.draw = function (ro, ...a) { set(ro); return f.call(this, ro, ...a); }; }
    if (!be && typeof r.renderBufferDirect === "function") { const f = r.renderBufferDirect; r.renderBufferDirect = function (camera, scene, geometry, material, object, ...a) { set({ object, material }); return f.call(this, camera, scene, geometry, material, object, ...a); }; }
    return true;
  };
  if (!hook() && typeof win.setInterval === "function") { const id = win.setInterval(() => { if (hook()) win.clearInterval(id); }, 250); }
}

/** The ready-gate summary cell: pose gate (time, residual m / yaw deg, consecutive frames), build-queue pending and
 * streaming quiet (the last geometry/texture count change) as the harness saw them. */
export function readyGateLine(r) {
  const p = r.pose, res = p?.residual ?? p?.last;
  const pose = r.poseAt == null ? (r.poseTimedOut ? `pose TIMED OUT (last ${res ? `${res.posM} m, yaw ${res.yawDeg ?? "-"} deg` : "?"})` : "pose -")
    : `pose ${r.poseAt} s${res ? ` (${res.posM} m, yaw ${res.yawDeg ?? "-"} deg, pitch ${res.pitchDeg ?? "-"} deg)` : ""}`;
  const q = r.final?.buildQueue?.pending, lh = r.loadHarness ?? {};
  return `${pose}; ready ${r.readyS ?? "-"} s; queue pending ${q ?? "n/a"}${lh.queueEmpty != null ? ` (empty from ${lh.queueEmpty} s)` : ""}; streaming quiet ${lh.streamQuiet ?? "-"} s`
    + (r.framesBeforePose ? "; FRAMES BEFORE POSE (pose gate never passed)" : "")
    + (r.kitsArrivedS === undefined ? "" : r.loadAfterKits?.na ? `; kits arrived ${r.kitsArrivedS ?? "-"} s; builds after kits n/a (no build queue)`
      : `; kits arrived ${r.kitsArrivedS ?? "-"} s, last build ${r.lastBuildS ?? "-"} s, builds after kits ${r.buildsAfterKitsS ?? "-"} s`);
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

/** Load timeline probe (always on, every view, both backends; a few counters per call, never a per-draw cost). Wraps
 * shader/pipeline creation (GPUDevice createRenderPipeline(+Async)/createComputePipeline(+Async)/createShaderModule,
 * WebGL/WebGL2 compileShader/linkProgram) into count, total ms and the end time of the last one; the first present is
 * the first GPUQueue.submit or WebGL draw call; KTX2 transcodes are the KTX2Loader worker round trips
 * (postMessage {type: "transcode", id} to the worker's reply with that id). Times are performance.now(), so seconds from
 * navigation start (timeOrigin). Raises the resource timing buffer so the end read sees every fetch.
 * Self-contained: it is stringified into the page. */
export function installLoadTimeline(win) {
  const t = { firstPresent: null, builds: { count: 0, ms: 0, last: null }, transcode: { count: 0, ms: 0, last: null, workers: 0 }, longTasks: [] };
  win.__loadTimeline = t;
  // main-thread tasks over 50 ms (buffered: the boot tasks before this observer ran too), first 200
  try {
    if (typeof win.PerformanceObserver !== "function") t.longTasksUnobservable = "no PerformanceObserver";
    else new win.PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (t.longTasks.length < 200) t.longTasks.push({ start: Math.round(e.startTime), ms: Math.round(e.duration), name: e.name ?? "",
        attribution: Array.from(e.attribution ?? [], (a) => [a.name, a.containerType, a.containerName || a.containerSrc || a.containerId].filter(Boolean).join(" ")).join("; ") });
    }).observe({ type: "longtask", buffered: true });
  } catch (e) { t.longTasksUnobservable = String(e?.message ?? e).slice(0, 120); }
  try { win.performance.setResourceTimingBufferSize(100000); } catch { /* old browser: 250 entries */ }
  const now = () => win.performance.now();
  const present = () => { if (t.firstPresent === null) t.firstPresent = now(); };
  const end = (t0) => { const e = now(); t.builds.count++; t.builds.ms += e - t0; t.builds.last = e; };
  const timed = (proto, name, isAsync) => {
    const f = proto?.[name]; if (typeof f !== "function") return;
    proto[name] = function (...a) {
      const t0 = now(), r = f.apply(this, a);
      if (isAsync && r && typeof r.then === "function") r.then(() => end(t0), () => end(t0)); else end(t0);
      return r;
    };
  };
  if (typeof win.GPUDevice !== "undefined") {
    for (const n of ["createRenderPipeline", "createComputePipeline", "createShaderModule"]) timed(win.GPUDevice.prototype, n, false);
    for (const n of ["createRenderPipelineAsync", "createComputePipelineAsync"]) timed(win.GPUDevice.prototype, n, true);
    const sub = win.GPUQueue?.prototype.submit;
    if (sub) win.GPUQueue.prototype.submit = function (...a) { present(); return sub.apply(this, a); };
  }
  for (const C of [win.WebGLRenderingContext, win.WebGL2RenderingContext]) {
    if (!C) continue;
    timed(C.prototype, "compileShader", false); timed(C.prototype, "linkProgram", false);
    for (const n of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      const f = C.prototype[n]; if (f) C.prototype[n] = function (...a) { present(); return f.apply(this, a); };
    }
  }
  const W = win.Worker; if (!W) return;
  const pm = W.prototype.postMessage, seen = new WeakSet(), open = new Map();
  W.prototype.postMessage = function (msg, ...a) {
    if (msg && msg.type === "transcode") {
      if (!seen.has(this)) {
        seen.add(this); t.transcode.workers++;
        this.addEventListener("message", (e) => {
          const d = e.data, t0 = d && d.type === "transcode" ? open.get(d.id) : undefined;
          if (t0 === undefined) return;
          open.delete(d.id); const e1 = now(); t.transcode.count++; t.transcode.ms += e1 - t0; t.transcode.last = e1;
        });
      }
      open.set(msg.id, now());
    }
    return pm.call(this, msg, ...a);
  };
}
/** The page side of the load timeline read: the probe's counters plus the asset fetches from resource timing
 * (kits, terrain, textures, meshes, data: count, bytes, last responseEnd). */
export const LOAD_TIMELINE_READ_JS = `(() => {
  const t = window.__loadTimeline ?? null;
  const asset = /\\/(kits|terrain|textures|data|places|world|water|veg)[\\/]|\\.(ktx2|glb|gltf|bin|png|jpe?g|webp|json|basis|wasm)(\\?|$)/i;
  const rs = performance.getEntriesByType("resource").filter((e) => asset.test(e.name));
  return { probe: t && JSON.parse(JSON.stringify(t)), fetch: { count: rs.length, bytes: rs.reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0), last: rs.reduce((m, e) => Math.max(m, e.responseEnd), 0) || null } };
})()`;
/** Owner bar (2026-10-02): navigation to a complete scene in under 10 s on the pod, both backends. */
export const LOAD_BAR_S = 10;
/** A view's load timeline from the page read (`LOAD_TIMELINE_READ_JS`, ms from timeOrigin) and the harness's own per-second
 * polls (seconds from Page.navigate): `streamFirst` the first frame with geometries, `streamQuiet` the last second the
 * renderer's geometry or texture count changed, `queueEmpty` the start of the final stretch at 0 pending builds.
 * complete = max(streamQuiet, queueEmpty, last pipeline build); a missing stage leaves complete null (never complete). */
export function loadTimeline(page, harness, bar = LOAD_BAR_S) {
  const s = (ms) => (Number.isFinite(ms) ? Math.round(ms / 100) / 10 : null), p = page?.probe ?? null;
  const out = {
    present: s(p?.firstPresent),
    fetch: { at: s(page?.fetch?.last), count: page?.fetch?.count ?? null, mb: page?.fetch ? Math.round(page.fetch.bytes / 1e5) / 10 : null },
    transcode: p ? { count: p.transcode.count, ms: Math.round(p.transcode.ms), last: s(p.transcode.last) } : { unobservable: "no load-timeline probe on the page" },
    builds: p ? { count: p.builds.count, ms: Math.round(p.builds.ms), last: s(p.builds.last) } : null,
    longTasks: p?.longTasks ? p.longTasks.map((x) => ({ at: s(x.start), ms: x.ms, name: x.name, attribution: x.attribution })) : null,
    bootLongestTask: null,
    streamFirst: harness?.streamFirst ?? null, streamQuiet: harness?.streamQuiet ?? null, queueEmpty: harness?.queueEmpty ?? null,
  };
  if (out.longTasks?.length) out.bootLongestTask = out.longTasks.reduce((m, x) => (x.ms > m.ms ? x : m));
  if (p?.longTasksUnobservable) out.longTasksUnobservable = p.longTasksUnobservable;
  if (p && p.transcode.workers === 0) out.transcode.unobservable = "no KTX2 transcode worker started (no KTX2 texture on this view, or a loader that does not post {type: transcode})";
  const parts = [out.streamQuiet, out.queueEmpty, out.builds?.last];
  out.complete = parts.every((x) => Number.isFinite(x)) ? Math.max(...parts) : null;
  out.barS = bar;
  out.barFail = out.complete === null || out.complete > bar;
  return out;
}
/** The summary cell: "complete X (fetch a, transcode b/n, builds c/n last d, stream e, present f)", BAR FAIL over the bar. */
export function loadLine(t) {
  if (!t) return null;
  const c = (x) => (x === null || x === undefined ? "-" : String(x));
  const tc = t.transcode?.unobservable && !t.transcode.count ? "unobs" : `${c(t.transcode?.ms)}ms/${c(t.transcode?.count)}`;
  return `${t.barFail ? "BAR FAIL " : ""}complete ${c(t.complete)} (fetch ${c(t.fetch?.at)}, transcode ${tc}, builds ${c(t.builds?.ms)}ms/${c(t.builds?.count)} last ${c(t.builds?.last)}, stream ${c(t.streamFirst)}-${c(t.streamQuiet)}, present ${c(t.present)})`;
}

/** diag22 C1 pre-capture data check: the loader's KIT_PARTS_SCHEMA_VERSION (read from the dist's own kitParts.ts source)
 * against the schemaVersion of one kits/<kit>/parts/index.json as the pod serves it. fetchText(url) returns the body or
 * throws. {ok, loader, served, url, why?}: not ok on a mismatch, an unreadable index or a loader with no constant. */
export async function kitSchemaCheck({ loaderSrc, url, fetchText }) {
  const m = /KIT_PARTS_SCHEMA_VERSION\s*=\s*(\d+)/.exec(String(loaderSrc ?? ""));
  const loader = m ? Number(m[1]) : null;
  if (loader === null) return { ok: false, loader, served: null, url, why: "no KIT_PARTS_SCHEMA_VERSION in the loader source" };
  let served = null;
  try {
    const body = await fetchText(url);
    if (/^\s*</.test(body)) return { ok: false, loader, served, url, why: `index is HTML, not kit data (the server has no such file): ${url}` };
    served = JSON.parse(body).schemaVersion ?? null;
  } catch (e) { return { ok: false, loader, served, url, why: `index unreadable: ${String(e.message).slice(0, 120)}` }; }
  return served === loader ? { ok: true, loader, served, url } : { ok: false, loader, served, url, why: `served schemaVersion ${served} != loader ${loader} (pod data not from the build's tree: pod-sync.sh --data)` };
}

/** Kits the page loads whatever the view: the vegetation layers (Groundcover, the flora layer) read these by id. */
export const PAGE_FIXED_KITS = ["flora-province-v1", "groundcover-province-v1"];

/** Every kit the page will load, as the page finds them: `province/settlements/index.json` (places and routes), each
 * bundle's `kits[id].parts`, plus PAGE_FIXED_KITS. `fetchMany(urls)` resolves a Map url -> body string or an Error.
 * Returns { kits: Map id -> parts url, problems: [string] } (an index or bundle that is unreadable or HTML). */
export async function pageKitIndexes({ dataBase, fetchMany }) {
  const problems = [];
  const kits = new Map(PAGE_FIXED_KITS.map((id) => [id, `${dataBase}kits/${id}/parts/index.json`]));
  const readJson = (url, body) => {
    if (body instanceof Error || body === undefined) { problems.push(`${url}: ${String(body?.message ?? "not fetched").slice(0, 120)}`); return null; }
    if (/^\s*</.test(body)) { problems.push(`${url}: HTML, not data`); return null; }
    try { return JSON.parse(body); } catch (e) { problems.push(`${url}: ${String(e.message).slice(0, 80)}`); return null; }
  };
  const indexUrl = `${dataBase}province/settlements/index.json`;
  const index = readJson(indexUrl, (await fetchMany([indexUrl])).get(indexUrl));
  const bundleUrls = [...(index?.places ?? []), ...(index?.routes ?? [])].map((e) => `${dataBase}province/${e.bundle}`);
  const bodies = bundleUrls.length ? await fetchMany(bundleUrls) : new Map();
  for (const url of bundleUrls) {
    const bundle = readJson(url, bodies.get(url));
    for (const [id, ref] of Object.entries(bundle?.kits ?? {})) if (typeof ref?.parts === "string") kits.set(id, `${dataBase}${ref.parts}`);
  }
  return { kits, problems };
}

/** The pre-capture kit check over EVERY kit the page loads (pageKitIndexes): each parts index must be JSON at the
 * loader's KIT_PARTS_SCHEMA_VERSION. Returns { ok, checked, failed: [{kit, url, why}], problems }. smoke2 (c11): five
 * kits with no parts index placed nothing while the one-sentinel check passed. */
export async function pageKitCheck({ loaderSrc, dataBase, fetchMany }) {
  const { kits, problems } = await pageKitIndexes({ dataBase, fetchMany });
  const bodies = await fetchMany([...kits.values()]);
  const failed = [];
  for (const [kit, url] of kits) {
    const body = bodies.get(url);
    const c = await kitSchemaCheck({ loaderSrc, url, fetchText: async () => { if (body instanceof Error || body === undefined) throw body ?? new Error("not fetched"); return body; } });
    if (!c.ok) failed.push({ kit, url, why: c.why });
  }
  return { ok: failed.length === 0 && problems.length === 0, checked: kits.size, failed, problems };
}

/** fetchMany here: every URL in parallel, each with timeoutMs; a non-2xx reply is an Error. */
export function localFetchMany(timeoutMs = 5000) {
  return async (urls) => new Map(await Promise.all(urls.map(async (u) => {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(timeoutMs) }); return [u, r.ok ? await r.text() : new Error(`HTTP ${r.status}`)]; } catch (e) { return [u, e]; }
  })));
}

/** fetchMany through one shell command (the pod over ssh): `run(script)` -> stdout. One round trip per list, the
 * curls in parallel, each body marked with its status and URL (parseShellFetch). */
export function shellFetchMany(run, timeoutS = 5) {
  return async (urls) => {
    const list = urls.map((u) => `'${u.replace(/'/g, "'\\''")}'`).join(" ");
    const script = `d=$(mktemp -d); i=0; for u in ${list}; do i=$((i+1)); (curl -s -m ${timeoutS} -o "$d/$i" -w '%{http_code}' "$u" > "$d/$i.c") & done; wait; `
      + `i=0; for u in ${list}; do i=$((i+1)); printf '\\n@@KIT@@ %s %s\\n' "$(cat "$d/$i.c")" "$u"; cat "$d/$i" 2>/dev/null; done; rm -rf "$d"`;
    return parseShellFetch(await run(script), urls);
  };
}

/** shellFetchMany's output as a Map url -> body or Error (a URL with no block is "no reply"). */
export function parseShellFetch(out, urls) {
  const m = new Map(urls.map((u) => [u, new Error("no reply")]));
  for (const p of String(out).split(/\n@@KIT@@ /).slice(1)) {
    const nl = p.indexOf("\n");
    const head = (nl < 0 ? p : p.slice(0, nl)).split(" ");
    m.set(head.slice(1).join(" "), head[0] === "200" ? (nl < 0 ? "" : p.slice(nl + 1)) : new Error(`HTTP ${head[0]}`));
  }
  return m;
}

/** Renderer processes from CDP SystemInfo.getProcessInfo, sampled twice dtS apart: [{pid, cpuPct}] (cpuTime is
 * cumulative seconds). */
export function rendererCpu(first, second, dtS) {
  const t0 = new Map((first ?? []).filter((p) => p.type === "renderer").map((p) => [p.id, p.cpuTime]));
  return (second ?? []).filter((p) => p.type === "renderer").map((p) => ({ pid: p.id, cpuPct: t0.has(p.id) && dtS > 0 ? Math.round(((p.cpuTime - t0.get(p.id)) / dtS) * 100) : null }));
}

/** diag22 C3: a view's start state against the run's post-launch baseline. contaminated when the pod GPU holds more than
 * vramMiB over the baseline (a previous page's memory still resident) or a renderer burns over cpuPct (a runaway page). */
export function startContamination({ vramStartMiB, vramBaselineMiB, renderers }, { vramMiB = 1024, cpuPct = 50 } = {}) {
  const reasons = [];
  if (Number.isFinite(vramStartMiB) && Number.isFinite(vramBaselineMiB) && vramStartMiB - vramBaselineMiB > vramMiB) reasons.push(`VRAM ${vramStartMiB} MiB > baseline ${vramBaselineMiB} + ${vramMiB}`);
  for (const r of renderers ?? []) if (r.cpuPct > cpuPct) reasons.push(`renderer ${r.pid} at ${r.cpuPct}% CPU`);
  return { contaminated: reasons.length > 0, reasons };
}

/** Poll check() (async, true = done) every stepMs until it holds or timeoutMs passes; resolves whether it held. */
export async function waitFor(check, { timeoutMs = 10_000, stepMs = 500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now } = {}) {
  const end = now() + timeoutMs;
  for (;;) {
    if (await check().catch(() => false)) return true;
    if (now() >= end) return false;
    await sleep(stepMs);
  }
}

/** diag22 C3 close path: after closeTarget/disposeBrowserContext, the view's renderer processes (pids not alive before the
 * view opened) must exit within timeoutMs; survivors are killed (kill(pids)), checked again, and a survivor of that asks
 * the caller to restart Chrome. listRenderers() -> pids. Returns {survivors, killed, restart}. */
export async function reapViewRenderers({ before, listRenderers, kill, timeoutMs = 10_000, sleep, now }) {
  const pre = new Set(before ?? []);
  let left = [];
  const gone = async () => { left = (await listRenderers()).filter((p) => !pre.has(p)); return left.length === 0; };
  if (await waitFor(gone, { timeoutMs, sleep, now })) return { survivors: [], killed: [], restart: false };
  const killed = [...left];
  await kill(killed).catch(() => {});
  const ok = await waitFor(gone, { timeoutMs: 3000, sleep, now });
  return { survivors: ok ? [] : left, killed, restart: !ok };
}

/** diag22 C4: renderer.info counts an esIndirect draw at the last kept GPU-cull read-back (mesh.count); when the window
 * saw GPU errors (failed buffers, so failed read-backs) on a page with indirect draws, that count is stale and the
 * view's tris are invalid. hasIndirect: census indirect draws > 0, or a webgpu backend with no census. */
export function trisInvalid(r) {
  const c = r.window?.drawCensus, errs = r.gpuErrors?.length ?? 0;
  if (!errs) return false;
  if (c && !c.err) return Object.values(c.trisByPass ?? {}).some((v) => v.indirectDrawsPerFrame > 0);
  const b = r.final?.backend ?? r.reads?.settled?.backend;
  return b === "webgpu";
}
