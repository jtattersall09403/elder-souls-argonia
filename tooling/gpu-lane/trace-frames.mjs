/**
 * Long-frame classifier for a Chrome trace (measure.mjs --trace): every rAF interval over `overMs` on
 * the renderer main thread (the thread with the most FireAnimationFrame events), with the trace
 * events that overlap it sorted into causes, and the CPU-profile functions sampled inside it.
 *
 *   node tooling/gpu-lane/trace-frames.mjs <dir>/url0-settled.trace.json [--profile <.cpuprofile>] [--over 20]
 *
 * Causes (first match wins per event; an event counts toward a frame only for the ms it overlaps):
 * gc (V8/Blink GC), shader (compile/link, program cache), upload (texture/buffer upload, image decode),
 * gpu (any other event in the GPU process), timer (TimerFire), js (FunctionCall/EvaluateScript/
 * v8.callFunction on the main thread), raster/compositor (viz, cc), other.
 */
import { readFileSync } from "node:fs";

const CAUSES = [
  ["gc", (e) => /GC|Gc|Scavenge|MarkCompact|Sweep/.test(e.name)],
  ["shader", (e) => /Shader|LinkProgram|CompileProgram|ProgramCache|ProgramBinary/.test(e.name)],
  ["upload", (e) => /TexImage|TexSubImage|TexStorage|BufferData|BufferSubData|Upload|Decode/.test(e.name)],
  ["gpu", (e, ctx) => ctx.gpuPids.has(e.pid)],
  ["timer", (e) => e.name === "TimerFire"],
  ["js", (e, ctx) => e.pid === ctx.pid && e.tid === ctx.tid && /FunctionCall|EvaluateScript|v8\.callFunction|RunMicrotasks|FireAnimationFrame/.test(e.name)],
  ["compositor", (e) => /^(viz|cc)\.|Display|DrawFrame|BeginFrame|Commit|SwapBuffers|Present/.test(e.name) || /viz|cc/.test(e.cat ?? "")],
];

const CONTAINERS = /^(ThreadControllerImpl::RunTask|Receive mojo message|ThreadPool_RunTask|Scheduler::RunTask|RunTask|SequenceManager.*|TaskGraphRunner::RunTask|ThreadPool_RunTask|SimpleWatcher::OnHandleReady|MessagePipe.*|V8\.GC_.*_BACKGROUND.*)$/;

export function causeOf(e, ctx) {
  for (const [c, f] of CAUSES) if (f(e, ctx)) return c;
  return "other";
}

const r1 = (x) => Math.round(x * 10) / 10;

/** Two rAF callbacks closer than this (µs, previous end to next start) are the same frame. */
export const FRAME_GAP_US = 1000;

/** Trace categories every gpu-lane trace records (measure.mjs --trace, pod-capture.mjs per view). */
export const TRACE_CATEGORIES = ["devtools.timeline", "disabled-by-default-devtools.timeline.frame", "gpu",
  "disabled-by-default-v8.gc", "v8", "blink", "viz", "cc", "toplevel"];

/** Extra categories for `measure.mjs --trace-gpu` (GPU service, device and ANGLE; names Chrome does not know are ignored). */
export const GPU_TRACE_CATEGORIES = ["disabled-by-default-gpu.service", "disabled-by-default-gpu.device", "gpu.angle", "disabled-by-default-angle"];

/** `--trace-gpu`: a streamed event of one of the GPU categories, any duration (kept in a side list; only those
 * inside long frames reach the file, see `gpuEventsInSpans`). */
export const isGpuCategoryEvent = (e) => e.ph === "X" && (e.dur ?? 0) > 0 && /gpu|angle/.test(e.cat ?? "");

/** The events of GPU processes (`gpuPids`) that overlap any `[from, to]` µs span, of any duration. */
export const gpuEventsInSpans = (events, gpuPids, spans) => events.filter((e) => gpuPids.has(e.pid) && e.ph === "X" && spans.some(([a, b]) => e.ts < b && e.ts + e.dur > a));

/** `memory-infra` spot token: Chrome's own periodic light memory dumps, configured before the window opens (no CDP
 * call inside it). Goes in Tracing.start's traceConfig beside includedCategories. */
export const MEMORY_INFRA_CATEGORY = "disabled-by-default-memory-infra";
export const MEMORY_DUMP_CONFIG = { triggers: [{ mode: "light", periodic_interval_ms: 2000 }] };

/** The allocators a memory dump row lists (root names; `cc` holds the image decode cache). */
export const DUMP_ALLOCATORS = ["discardable", "malloc", "partition_alloc", "skia", "cc", "gpu", "v8", "blink_gc"];

/**
 * Per memory dump (ph "v" events) per process: MB of each root allocator in DUMP_ALLOCATORS (its own `size`, else the
 * sum of its direct children), the discardable total and the top 5 allocators. `toPage` maps trace µs to page ms.
 * Sizes are hex strings in the trace. Returns [{ts, pageMs, pid, process, discardableMB, MB: {name: MB}, top}] by time.
 */
export function memoryDumps(events, toPage = () => null) {
  const pname = new Map(events.filter((e) => e.ph === "M" && e.name === "process_name").map((e) => [e.pid, e.args?.name ?? ""]));
  const size = (a) => { const v = a?.attrs?.size?.value; return v == null ? null : parseInt(v, 16); };
  const out = [];
  for (const e of events) {
    const al = e.ph === "v" ? e.args?.dumps?.allocators : null;
    if (!al) continue;
    const MB = {};
    for (const root of DUMP_ALLOCATORS) {
      let b = size(al[root]);
      if (b == null) {
        const kids = Object.keys(al).filter((k) => k.startsWith(`${root}/`) && !k.slice(root.length + 1).includes("/"));
        if (kids.length) b = kids.reduce((s, k) => s + (size(al[k]) ?? 0), 0);
      }
      if (b != null) MB[root] = r1(b / 1048576);
    }
    out.push({ ts: e.ts, pageMs: toPage(e.ts), pid: e.pid, process: pname.get(e.pid) ?? "", discardableMB: MB.discardable ?? 0, MB,
      top: Object.entries(MB).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([name, mb]) => ({ name, MB: mb })) });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** Keep only what the classifier reads (metadata, memory dumps, frame markers, GC, anything >= 0.5 ms): a full 10 s trace of
 * the studio is over 512 MB of JSON, past V8's string limit. Filter while streaming, never after. */
export const keepTraceEvent = (e) => e.ph === "M" || e.ph === "v" || e.name === "FireAnimationFrame" || e.name === "TimeStamp" || (e.dur ?? 0) >= 500 || /GC|Gc/.test(e.name);

/**
 * Main-thread SELF ms per cause over the whole trace, and per frame (frames = FireAnimationFrame count on the main
 * thread). Self time: an event's duration less its nested children on the same thread, so nested causes are not
 * counted twice. Task containers are skipped (their children become top level).
 */
export function mainThreadStages(events) {
  const fa = events.filter((e) => e.name === "FireAnimationFrame" && e.ph === "X");
  if (!fa.length) return { frames: 0, totalMs: {}, perFrameMs: {} };
  const cnt = new Map();
  for (const e of fa) { const k = `${e.pid}:${e.tid}`; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  const [key, frames] = [...cnt].sort((a, b) => b[1] - a[1])[0];
  const [pid, tid] = key.split(":").map(Number);
  const ctx = { pid, tid, gpuPids: new Set() };
  const X = events.filter((e) => e.ph === "X" && e.dur > 0 && e.pid === pid && e.tid === tid && !CONTAINERS.test(e.name))
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const total = {}, stack = [];
  const close = (n) => { total[n.cause] = (total[n.cause] ?? 0) + Math.max(0, n.dur - n.child); };
  for (const e of X) {
    while (stack.length && stack.at(-1).end <= e.ts) close(stack.pop());
    const parent = stack.at(-1);
    if (parent) parent.child += Math.min(e.dur, parent.end - e.ts);
    stack.push({ end: e.ts + e.dur, dur: e.dur, child: 0, cause: causeOf(e, ctx) });
  }
  while (stack.length) close(stack.pop());
  const totalMs = {}, perFrameMs = {};
  for (const [c, us] of Object.entries(total).sort((a, b) => b[1] - a[1])) { totalMs[c] = r1(us / 1000); perFrameMs[c] = Math.round(us / 1000 / frames * 100) / 100; }
  return { frames, totalMs, perFrameMs };
}

/** The cause with the most ms in a classified long frame's byCause. */
export const topCause = (byCause) => Object.entries(byCause ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

/** The page-time anchor: measure.mjs runs `console.timeStamp(ANCHOR_PREFIX + performance.now())` just after the trace starts. */
export const ANCHOR_PREFIX = "gpulane-anchor:";

/** Put on each long frame the relink events within `windowMs` of it (page ms). `events` = the probe's `[t, ms, name, info]` rows. */
export function joinLinks(long, events, windowMs = 300) {
  for (const f of long) {
    if (f.pageMs == null) continue;
    f.links = (events ?? []).filter(([t]) => t >= f.pageMs - windowMs && t <= f.pageMs + f.ms + windowMs)
      .map(([t, ms, name, info]) => ({ t, ms, name, type: info?.type, owner: info?.owner, key: info?.key }));
  }
  return long;
}

/**
 * Classify long frames. `events` = traceEvents; `profile` optional CDP cpuprofile (same clock, µs);
 * `windowEndPageMs` = the page time of the last in-window rAF (measure.mjs): a long frame starting after it
 * is the trace flush (Tracing.end), not the game, and is dropped. A frame holding a blink.mojom.DevTools
 * mojo message is the harness's own CDP call: classed `harness` (counted, never listed, not in the stats).
 */
export function classifyFrames(events, { profile = null, overMs = 20, windowEndPageMs = null, gpuAnyDur = false } = {}) {
  const fa = events.filter((e) => e.name === "FireAnimationFrame" && e.ph === "X");
  if (!fa.length) return { frames: 0, long: [] };
  const cnt = new Map();
  for (const e of fa) { const k = `${e.pid}:${e.tid}`; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  const [pid, tid] = [...cnt].sort((a, b) => b[1] - a[1])[0][0].split(":").map(Number);
  const pname = new Map(events.filter((e) => e.ph === "M" && e.name === "process_name").map((e) => [e.pid, e.args?.name ?? ""]));
  const gpuPids = new Set([...pname].filter(([, n]) => /GPU/i.test(n)).map(([p]) => p));
  const ctx = { pid, tid, gpuPids };
  // Frames are measured start to start, like the harness's rAF intervals (perf-diag6 C2d): Chrome emits one
  // FireAnimationFrame per rAF callback, and the callbacks of one frame run back to back, so a callback that starts
  // within FRAME_GAP_US of the previous one's end belongs to the same frame. fs = frame starts, fe = frame ends.
  const fs = [], fe = [];
  for (const e of fa.filter((x) => x.pid === pid && x.tid === tid).sort((a, b) => a.ts - b.ts)) {
    if (fs.length && e.ts <= fe.at(-1) + FRAME_GAP_US) fe[fe.length - 1] = Math.max(fe.at(-1), e.ts + e.dur);
    else { fs.push(e.ts); fe.push(e.ts + e.dur); }
  }
  // Generic task wrappers contain the events that say what ran; counting them would double every cause.
  const X = events.filter((e) => e.ph === "X" && e.dur > 0 && e.name !== "FireAnimationFrame" && !CONTAINERS.test(e.name));
  let samples = [];
  if (profile) {
    const N = new Map(profile.nodes.map((n) => [n.id, n]));
    let t = profile.startTime;
    samples = profile.samples.map((id, i) => {
      t += profile.timeDeltas[i] ?? 0;
      const cf = N.get(id)?.callFrame ?? {};
      return { t, dt: (profile.timeDeltas[i + 1] ?? 0) / 1000, fn: `${cf.functionName || "(anon)"} ${(cf.url ?? "").replace(/^.*\//, "") || "(native)"}:${(cf.lineNumber ?? -1) + 1}:${(cf.columnNumber ?? -1) + 1}` };
    });
  }
  // The last interval of a window ends at the rAF after the harness's own end-of-window message ("Receive mojo
  // message", 29-47 ms): the harness, never the game, so it is dropped from the list and the stats.
  const anchor = events.map((e) => e.name === "TimeStamp" && String(e.args?.data?.message ?? "").startsWith(ANCHOR_PREFIX)
    ? { ts: e.ts, pageMs: Number(String(e.args.data.message).slice(ANCHOR_PREFIX.length)) } : null).find(Boolean);
  const toPage = (us) => anchor && Number.isFinite(anchor.pageMs) ? r1(anchor.pageMs + (us - anchor.ts) / 1000) : null;
  const devtools = events.filter((e) => e.ph === "X" && e.name === "Receive mojo message" && /blink\.mojom\.DevTools/.test(JSON.stringify(e.args ?? {})));
  const isHarness = (a, b) => devtools.some((e) => Math.min(b, e.ts + e.dur) - Math.max(a, e.ts) >= 500);
  const long = [], harnessAt = new Set(), skipAt = new Set();
  for (let i = 1; i < fs.length - 1; i++) {
    const a = fs[i - 1], b = fs[i];
    if (windowEndPageMs != null && toPage(a) != null && toPage(a) > windowEndPageMs) { skipAt.add(i); continue; }
    if (isHarness(a, b)) { harnessAt.add(i); skipAt.add(i); continue; }
    if (b - a <= overMs * 1000) continue;
    const byCause = {}, top = [];
    for (const e of X) {
      const ov = Math.min(b, e.ts + e.dur) - Math.max(a, e.ts);
      if (ov < 500) continue;
      const c = causeOf(e, ctx);
      byCause[c] = r1((byCause[c] ?? 0) + ov / 1000);
      top.push({ cause: c, name: e.name, thread: e.pid === pid && e.tid === tid ? "main" : `${pname.get(e.pid) ?? e.pid}/${e.tid}`, ms: r1(ov / 1000) });
    }
    const self = new Map();
    for (const s of samples) if (s.t >= a && s.t < b) self.set(s.fn, (self.get(s.fn) ?? 0) + s.dt);
    const entry = { atS: r1((a - fs[0]) / 1e6), pageMs: toPage(a), ms: r1((b - a) / 1000), durMs: r1((fe[i - 1] - a) / 1000), spanUs: [a, b], byCause,
      top: top.sort((x, y) => y.ms - x.ms).slice(0, 8),
      js: [...self].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([name, ms]) => ({ name, ms: r1(ms) })) };
    // --trace-gpu: the five longest GPU-process events overlapping the frame, of any duration.
    if (gpuAnyDur) entry.gpuTop = X.filter((e) => gpuPids.has(e.pid) && e.ts < b && e.ts + e.dur > a)
      .sort((x, y) => y.dur - x.dur).slice(0, 5).map((e) => ({ name: e.name, cat: e.cat, ms: r1(e.dur / 1000), args: JSON.stringify(e.args ?? {}).slice(0, 200) }));
    long.push(entry);
  }
  const d = fs.slice(1, -1).map((t, i) => t - fs[i]).filter((_, i) => !skipAt.has(i + 1));
  if (!d.length) return { frames: 0, long: [] };
  const dumps = events.some((e) => e.ph === "v") ? { memoryDumps: memoryDumps(events, toPage) } : {};
  return { frames: d.length, over20: d.filter((x) => x > 20000).length, over33: d.filter((x) => x > 33000).length,
    maxMs: r1(Math.max(...d) / 1000), harness: harnessAt.size, long, ...dumps };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const t = JSON.parse(readFileSync(a[0], "utf8"));
  const p = opt("--profile");
  const r = classifyFrames(t.traceEvents ?? t, { profile: p ? JSON.parse(readFileSync(p, "utf8")) : null, overMs: Number(opt("--over") ?? 20) });
  console.log(`frames ${r.frames}, >20 ms ${r.over20}, >33 ms ${r.over33}, max ${r.maxMs} ms`);
  for (const f of r.long) console.log(JSON.stringify(f));
}
