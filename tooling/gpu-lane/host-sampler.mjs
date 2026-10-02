/**
 * Host sampler (perf-diag9 S1): while a spot runs, the pod's /proc/stat cpu steal and /proc/vmstat pgmajfault every
 * 250 ms over the same ssh the lane already uses (`--pod "ssh -i <key> -p <port> root@<ip>"`). The page runs on the
 * pod, so the pod's epoch clock maps to page time through performance.timeOrigin with no clock skew.
 * A worker-seen gap that overlaps a steal or major-fault spike is a host stall (measure.mjs hitchContext).
 */
import { spawn } from "node:child_process";

export const HOST_SAMPLE_MS = 250;
/** USER_HZ on Linux: /proc/stat counts in 10 ms jiffies. */
const JIFFY_MS = 10;
/** A spike: summed steal over all CPUs at or above this in one 250 ms interval, or this many major faults. */
export const HOST_SPIKE = { stealMs: 20, majFaults: 5 };

export const HOST_SAMPLER_SH =
  `while :; do echo "$(date +%s%3N) $(awk '/^cpu /{print $9}' /proc/stat) $(awk '/^pgmajfault /{print $2}' /proc/vmstat)"; sleep ${HOST_SAMPLE_MS / 1000}; done`;

/** "ssh -i k -p 1 root@h" -> [cmd, argv] running the sampler on the pod. */
export function samplerCommand(pod) {
  const parts = pod.trim().split(/\s+/);
  if (parts[0] !== "ssh" || parts.length < 2) throw new Error(`--pod wants "ssh [opts] user@host", got ${pod}`);
  return [parts[0], [...parts.slice(1, -1), "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes", parts.at(-1), HOST_SAMPLER_SH]];
}

/** Starts the sampler; stop() kills it and returns the raw rows [[epochMs, stealJiffies, majFaults]] (cumulative). */
export function startHostSampler(pod, spawnFn = spawn) {
  const [cmd, args] = samplerCommand(pod);
  const child = spawnFn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
  const rows = [];
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d;
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const l of lines) {
      const r = l.trim().split(/\s+/).map(Number);
      if (r.length === 3 && r.every(Number.isFinite)) rows.push(r);
    }
  });
  child.on("error", () => {});
  // a spot that throws never reaches stop(): the sampler must not outlive (or hold open) the harness
  const kill = () => child.kill();
  process.once("exit", kill);
  child.unref?.(); child.stdout.unref?.();
  return { stop: () => { process.off("exit", kill); kill(); return rows; } };
}

/** Raw rows -> per-interval series in page ms ({t: interval end, stealMs, majFaults}); null without an origin. */
export function hostSeries(rows, originEpochMs) {
  if (originEpochMs == null || rows.length < 2) return null;
  const s = { t: [], stealMs: [], majFaults: [] };
  for (let i = 1; i < rows.length; i++) {
    s.t.push(Math.round((rows[i][0] - originEpochMs) * 100) / 100);
    s.stealMs.push((rows[i][1] - rows[i - 1][1]) * JIFFY_MS);
    s.majFaults.push(rows[i][2] - rows[i - 1][2]);
  }
  return s;
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
