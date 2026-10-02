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

export function causeOf(e, ctx) {
  for (const [c, f] of CAUSES) if (f(e, ctx)) return c;
  return "other";
}

const r1 = (x) => Math.round(x * 10) / 10;

/** Classify long frames. `events` = traceEvents; `profile` optional CDP cpuprofile (same clock, µs). */
export function classifyFrames(events, { profile = null, overMs = 20 } = {}) {
  const fa = events.filter((e) => e.name === "FireAnimationFrame" && e.ph === "X");
  if (!fa.length) return { frames: 0, long: [] };
  const cnt = new Map();
  for (const e of fa) { const k = `${e.pid}:${e.tid}`; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  const [pid, tid] = [...cnt].sort((a, b) => b[1] - a[1])[0][0].split(":").map(Number);
  const pname = new Map(events.filter((e) => e.ph === "M" && e.name === "process_name").map((e) => [e.pid, e.args?.name ?? ""]));
  const gpuPids = new Set([...pname].filter(([, n]) => /GPU/i.test(n)).map(([p]) => p));
  const ctx = { pid, tid, gpuPids };
  const fs = fa.filter((e) => e.pid === pid && e.tid === tid).map((e) => e.ts).sort((a, b) => a - b);
  const X = events.filter((e) => e.ph === "X" && e.dur > 0 && !(e.name === "FireAnimationFrame"));
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
  const long = [];
  for (let i = 1; i < fs.length; i++) {
    const a = fs[i - 1], b = fs[i];
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
    long.push({ atS: r1((a - fs[0]) / 1e6), ms: r1((b - a) / 1000), byCause,
      top: top.sort((x, y) => y.ms - x.ms).slice(0, 8),
      js: [...self].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([name, ms]) => ({ name, ms: r1(ms) })) });
  }
  const d = fs.slice(1).map((t, i) => t - fs[i]);
  return { frames: d.length, over20: d.filter((x) => x > 20000).length, over33: d.filter((x) => x > 33000).length,
    maxMs: r1(Math.max(...d) / 1000), long };
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
