/**
 * Host sampler (perf-diag9 S1, perf10 c6): while a spot runs, the pod's /proc every 250 ms over the same ssh the lane
 * already uses (`--pod "ssh -i <key> -p <port> root@<ip>"`): cpu steal and pgmajfault, 1-min load and runnable count,
 * total CPU busy %, per-CPU MHz min/max, and the top 3 processes by CPU since the previous sample; `nproc` once.
 * The page runs on the pod, so the pod's epoch clock maps to page time through performance.timeOrigin with no clock skew.
 * A worker-seen gap that overlaps a steal or major-fault spike is a host stall (measure.mjs hitchContext).
 */
import { spawn } from "node:child_process";

export const HOST_SAMPLE_MS = 250;
/** USER_HZ on Linux: /proc/stat counts in 10 ms jiffies. */
const JIFFY_MS = 10;
/** A spike: summed steal over all CPUs at or above this in one 250 ms interval, or this many major faults. */
export const HOST_SPIKE = { stealMs: 20, majFaults: 5 };

/**
 * The remote loop. First line `nproc N`; then per sample one line:
 * `epochMs stealJiffies majFaults load1 runnable cpuTotalJiffies cpuIdleJiffies mhzMin mhzMax top`
 * where top is `pid/comm:jiffies,...` (3 largest CPU deltas since the previous sample) or `-`.
 */
export const HOST_SAMPLER_SH = [
  'echo "nproc $(nproc)"',
  ": > /tmp/hs.prev",
  "while :; do",
  "ts=$(date +%s%3N)",
  `st=$(awk '/^cpu /{print $9}' /proc/stat)`,
  `mj=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)`,
  `ld=$(awk '{split($4,a,"/");print $1, a[1]}' /proc/loadavg)`,
  `cp=$(awk '/^cpu /{t=0;for(i=2;i<=NF;i++)t+=$i;print t, $5+$6}' /proc/stat)`,
  `mh=$(awk '/^cpu MHz/{v=$4+0;if(mn==""||v<mn)mn=v;if(v>mx)mx=v}END{print mn+0,mx+0}' /proc/cpuinfo)`,
  `cat /proc/[0-9]*/stat 2>/dev/null | awk '{i=index($0,"(");match($0,/\\) [A-Z] /);c=substr($0,i+1,RSTART-i-1);gsub(/[ ,:]/,"_",c);split(substr($0,RSTART+2),f," ");print substr($0,1,i-2) "/" c, f[12]+f[13]}' > /tmp/hs.cur`,
  `tp=$(awk 'NR==FNR{p[$1]=$2;next}{if(($1 in p)&&$2>p[$1])print $2-p[$1],$1}' /tmp/hs.prev /tmp/hs.cur | sort -rn | head -3 | awk '{printf "%s%s:%d",(n++?",":""),$2,$1}')`,
  "mv /tmp/hs.cur /tmp/hs.prev",
  'echo "$ts $st $mj $ld $cp $mh ${tp:--}"',
  `sleep ${HOST_SAMPLE_MS / 1000}`,
  "done",
].join("\n");

/** "ssh -i k -p 1 root@h" -> [cmd, argv] running the sampler on the pod (script sent base64, so no quoting survives the remote shell). */
export function samplerCommand(pod) {
  const parts = pod.trim().split(/\s+/);
  if (parts[0] !== "ssh" || parts.length < 2) throw new Error(`--pod wants "ssh [opts] user@host", got ${pod}`);
  const remote = `echo ${Buffer.from(HOST_SAMPLER_SH).toString("base64")} | base64 -d | sh`;
  return [parts[0], [...parts.slice(1, -1), "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes", parts.at(-1), remote]];
}

/** One sampler line -> a row array [epoch, steal, maj, load1, runnable, cpuTotal, cpuIdle, mhzMin, mhzMax, top] or null. */
export function parseSamplerLine(l) {
  const t = l.trim().split(/\s+/);
  if (t.length !== 10) return null;
  const n = t.slice(0, 9).map(Number);
  return n.every(Number.isFinite) ? [...n, t[9]] : null;
}

/**
 * Starts the sampler; stop() kills it and returns the raw rows (cumulative counters, see parseSamplerLine) with the
 * pod's `nproc` as `rows.nproc`.
 */
export function startHostSampler(pod, spawnFn = spawn) {
  const [cmd, args] = samplerCommand(pod);
  const child = spawnFn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
  const rows = [];
  rows.nproc = null;
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d;
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const l of lines) {
      const m = /^nproc (\d+)$/.exec(l.trim());
      if (m) { rows.nproc = Number(m[1]); continue; }
      const r = parseSamplerLine(l);
      if (r) rows.push(r);
    }
  });
  child.on("error", () => {});
  // a spot that throws never reaches stop(): the sampler must not outlive (or hold open) the harness
  const kill = () => child.kill();
  process.once("exit", kill);
  child.unref?.(); child.stdout.unref?.();
  return { stop: () => { process.off("exit", kill); kill(); return rows; } };
}

/**
 * Raw rows -> per-interval series in page ms ({t: interval end, stealMs, majFaults, load1, runnable, busyPct, mhzMin,
 * mhzMax, top}) plus `nproc`; null without an origin. busyPct is all CPUs, non-idle share of the interval's jiffies.
 */
export function hostSeries(rows, originEpochMs) {
  if (originEpochMs == null || rows.length < 2) return null;
  const s = { nproc: rows.nproc ?? null, t: [], stealMs: [], majFaults: [], load1: [], runnable: [], busyPct: [], mhzMin: [], mhzMax: [], top: [] };
  for (let i = 1; i < rows.length; i++) {
    const [, st, mj, ld, rn, tot, idle, mn, mx, top] = rows[i], p = rows[i - 1];
    s.t.push(Math.round((rows[i][0] - originEpochMs) * 100) / 100);
    s.stealMs.push((st - p[1]) * JIFFY_MS);
    s.majFaults.push(mj - p[2]);
    s.load1.push(ld);
    s.runnable.push(rn);
    s.busyPct.push(tot > p[5] ? Math.round((1000 * ((tot - p[5]) - (idle - p[6]))) / (tot - p[5])) / 10 : null);
    s.mhzMin.push(mn);
    s.mhzMax.push(mx);
    s.top.push(top === "-" ? [] : top.split(",").map((x) => { const k = x.lastIndexOf(":"); return { proc: x.slice(0, k), ms: Number(x.slice(k + 1)) * JIFFY_MS }; }));
  }
  return s;
}

/** summary.md host line: nproc, max load, max busy % over a run's per-spot host series (nulls skipped). */
export function hostSummary(seriesList) {
  const all = seriesList.filter(Boolean);
  if (!all.length) return "n/a";
  const max = (k) => Math.max(...all.flatMap((s) => s[k].filter((v) => v != null)), 0);
  return `nproc ${all[0].nproc ?? "n/a"}, max load ${max("load1")}, max busy ${max("busyPct")}%`;
}

/** Spike intervals [startPageMs, endPageMs] of a host series (an interval spans the previous sample to its own). */
export function hostSpikes(series, bar = HOST_SPIKE) {
  if (!series) return null;
  const out = [];
  for (let i = 0; i < series.t.length; i++) {
    if (series.stealMs[i] >= bar.stealMs || series.majFaults[i] >= bar.majFaults) {
      out.push([i ? series.t[i - 1] : series.t[i] - HOST_SAMPLE_MS, series.t[i]]);
    }
  }
  return out;
}
