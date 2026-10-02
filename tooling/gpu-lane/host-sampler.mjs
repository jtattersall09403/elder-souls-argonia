/**
 * Host sampler (perf-diag9 S1, perf10 c6/c7): while a spot runs, the pod's /proc every 100 ms over the same ssh the lane
 * already uses (`--pod "ssh -i <key> -p <port> root@<ip>"`): cpu steal and pgmajfault, 1-min load and runnable count,
 * total CPU busy %, per-CPU MHz min/max, the top 3 processes by CPU since the previous sample, and for the renderer main
 * thread and the GPU process main thread (a process's main thread is the task whose tid equals its pid; thread comm is
 * "chrome" on the pod): which core it ran on, that core's MHz, run-queue
 * wait, migrations, involuntary switches; container CFS throttling; `nproc` and cpuset/governor/max MHz once.
 * The page runs on the pod, so the pod's epoch clock maps to page time through performance.timeOrigin with no clock skew.
 * A worker-seen gap that overlaps a steal or major-fault spike is a host stall (measure.mjs hitchContext).
 */
import { spawn } from "node:child_process";

export const HOST_SAMPLE_MS = 100;
/** USER_HZ on Linux: /proc/stat counts in 10 ms jiffies. */
const JIFFY_MS = 10;
/** A spike: summed steal over all CPUs at or above this in one sample interval, or this many major faults. */
export const HOST_SPIKE = { stealMs: 20, majFaults: 5 };
/** A frame with main-thread work at or above this (page ms) is "long" in coreCorrelation. */
export const LONG_FRAME_MS = 12;
/** Tokens THREAD_AWK appends to a sampler line. */
const THREAD_TOKENS = 14;

/**
 * One awk pass per sample over the renderer and GPU-process threads (pids found by /proc/<pid>/cmdline every 5th
 * sample, typed R/G in /tmp/hs.pids): the renderer main thread is task <pid> of the --type=renderer process whose utime+stime
 * grew most since the previous sample (state in /tmp/hs.thr), so the studio tab beats the blank keeper page; the GPU main
 * thread is task <pid> of the --type=gpu-process process. Prints 14 tokens, "-" where unreadable:
 * `rtid core mhz runNs waitNs migr nvcsw gtid gcore gmhz gwaitNs throttledUsec rendererPid rendererThreadsBusy`
 * (counters cumulative, deltas in parse; threadsBusy = threads of that renderer whose CPU grew >= 20 ms this interval).
 */
export const THREAD_AWK =String.raw`
function rd(f,  l){l="";if((getline l < f)>0){close(f);return l};close(f);return ""}
function mhzOf(c,  v){if(c=="")return "-";if(c in mhz)return mhz[c];v=rd("/sys/devices/system/cpu/cpu" c "/cpufreq/scaling_cur_freq");return v==""?"-":sprintf("%.0f",v/1000)}
FILENAME==ARGV[1]{prev[$1]=$2;next}
FILENAME==ARGV[2]{typ[$1]=$2;next}
{i=index($0,"(");s=$0;if(!match(s,/\) [A-Z] /))next;t=substr(s,1,i-2);split(substr(s,RSTART+2),f," ");n=split(FILENAME,pp,"/");p=pp[n-3]
 if(typ[p]=="R"){u=f[12]+f[13];cur[t]=u;d=(t in prev)?u-prev[t]:0;pd[p]+=d;if(d>=2)nb[p]++;if(t==p)mc[p]=f[37]}
 else if(typ[p]=="G"&&t==p){gt=t;gp=p;gc=f[37]}}
END{
 for(p in mc)if(rp==""||pd[p]>bd){bd=pd[p];rp=p}
 rt=rp;rc=mc[rp]
 while((getline l < "/proc/cpuinfo")>0){if(l~/^processor/){split(l,a,":");pc=a[2]+0}else if(l~/^cpu MHz/){split(l,a,":");mhz[pc]=sprintf("%.0f",a[2])}}close("/proc/cpuinfo")
 for(t in cur)print t,cur[t] > ARGV[1]
 r="- - - - - - -";if(rt!=""){b="/proc/" rp "/task/" rt "/";split(rd(b "schedstat"),q," ");run=(q[1]==""?"-":q[1]);wt=(q[2]==""?"-":q[2]);mg="-";nv="-"
  while((getline l < (b "sched"))>0)if(l~/nr_migrations/){split(l,a,":");mg=a[2]+0}close(b "sched")
  while((getline l < (b "status"))>0)if(l~/^nonvoluntary_ctxt_switches/){split(l,a,":");nv=a[2]+0}close(b "status")
  r=rt " " rc " " mhzOf(rc) " " run " " wt " " mg " " nv}
 g="- - - -";if(gt!=""){split(rd("/proc/" gp "/task/" gt "/schedstat"),q," ");g=gt " " gc " " mhzOf(gc) " " (q[2]==""?"-":q[2])}
 th="-";if(rd("/sys/fs/cgroup/cpu.stat")!=""){while((getline l < "/sys/fs/cgroup/cpu.stat")>0)if(l~/^throttled_usec/){split(l,a," ");th=a[2]}close("/sys/fs/cgroup/cpu.stat")}
 else{while((getline l < "/sys/fs/cgroup/cpu/cpu.stat")>0)if(l~/^throttled_time/){split(l,a," ");th=sprintf("%.0f",a[2]/1000)}close("/sys/fs/cgroup/cpu/cpu.stat")}
 print r, g, th, (rp==""?"-":rp), (rp==""?"-":nb[rp]+0)}`;

/**
 * The remote loop. First line `nproc N`, then `meta cpuset=<..|-> governor=<..|-> maxmhz=<a,b|->`; then per sample one
 * line: `epochMs stealJiffies majFaults load1 runnable cpuTotalJiffies cpuIdleJiffies mhzMin mhzMax top` + the 12
 * THREAD_AWK tokens, where top is `pid/comm:jiffies,...` (3 largest CPU deltas since the previous sample) or `-`.
 */
export const HOST_SAMPLER_SH = [
  'echo "nproc $(nproc)"',
  `echo "meta cpuset=$(cat /sys/fs/cgroup/cpuset.cpus.effective 2>/dev/null || echo -) governor=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo -) maxmhz=$(cat /sys/devices/system/cpu/cpu*/cpufreq/cpuinfo_max_freq 2>/dev/null | sort -u | awk '{printf "%s%d",(n++?",":""),$1/1000}' | grep . || echo -)"`,
  ": > /tmp/hs.prev",
  ": > /tmp/hs.thr",
  ": > /tmp/hs.pids",
  `cat > /tmp/hs.awk <<'AWK_EOF'${THREAD_AWK}\nAWK_EOF`,
  `dflt="${Array(THREAD_TOKENS).fill("-").join(" ")}"`,
  "n=0",
  "while :; do",
  "ts=$(date +%s%3N)",
  `if [ $((n % 5)) -eq 0 ]; then : > /tmp/hs.pids; fl=; for p in $(grep -la -e '--type=[r]enderer' /proc/[0-9]*/cmdline 2>/dev/null | cut -d/ -f3); do [ -d /proc/$p ] && { echo "$p R" >> /tmp/hs.pids; fl="$fl /proc/$p/task/*/stat"; }; done; for p in $(grep -la -e '--type=[g]pu-process' /proc/[0-9]*/cmdline 2>/dev/null | cut -d/ -f3); do [ -d /proc/$p ] && { echo "$p G" >> /tmp/hs.pids; fl="$fl /proc/$p/task/$p/stat"; }; done; fi`,
  "n=$((n+1))",
  `st=$(awk '/^cpu /{print $9}' /proc/stat)`,
  `mj=$(awk '/^pgmajfault /{print $2}' /proc/vmstat)`,
  `ld=$(awk '{split($4,a,"/");print $1, a[1]}' /proc/loadavg)`,
  `cp=$(awk '/^cpu /{t=0;for(i=2;i<=NF;i++)t+=$i;print t, $5+$6}' /proc/stat)`,
  `mh=$(awk '/^cpu MHz/{v=$4+0;if(mn==""||v<mn)mn=v;if(v>mx)mx=v}END{print mn+0,mx+0}' /proc/cpuinfo)`,
  `cat /proc/[0-9]*/stat 2>/dev/null | awk '{i=index($0,"(");match($0,/\\) [A-Z] /);c=substr($0,i+1,RSTART-i-1);gsub(/[ ,:]/,"_",c);split(substr($0,RSTART+2),f," ");print substr($0,1,i-2) "/" c, f[12]+f[13]}' > /tmp/hs.cur`,
  `tp=$(awk 'NR==FNR{p[$1]=$2;next}{if(($1 in p)&&$2>p[$1])print $2-p[$1],$1}' /tmp/hs.prev /tmp/hs.cur | sort -rn | head -3 | awk '{printf "%s%s:%d",(m++?",":""),$2,$1}')`,
  "mv /tmp/hs.cur /tmp/hs.prev",
  `th=$(awk -f /tmp/hs.awk /tmp/hs.thr /tmp/hs.pids $fl 2>/dev/null) || { th=""; n=0; }`,
  'echo "$ts $st $mj $ld $cp $mh ${tp:--} ${th:-$dflt}"',
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

/**
 * One sampler line -> a row array [epoch, steal, maj, load1, runnable, cpuTotal, cpuIdle, mhzMin, mhzMax, top, then
 * rtid, core, coreMhz, runNs, waitNs, migr, nvcsw, gtid, gcore, gcoreMhz, gwaitNs, throttledUsec, rendererPid, rendererThreadsBusy (numbers, null where "-")]
 * or null. A line of only the first 10 tokens parses to a 10-element row (thread columns read as null).
 */
export function parseSamplerLine(l) {
  const t = l.trim().split(/\s+/);
  if (t.length !== 10 && t.length !== 10 + THREAD_TOKENS) return null;
  const n = t.slice(0, 9).map(Number);
  if (!n.every(Number.isFinite)) return null;
  if (t.length === 10) return [...n, t[9]];
  const ex = Array.from({ length: THREAD_TOKENS }, (_, i) => (t[10 + i] == null || t[10 + i] === "-" ? null : Number(t[10 + i])));
  return ex.some((v) => v != null && !Number.isFinite(v)) ? null : [...n, t[9], ...ex];
}

/**
 * Starts the sampler; stop() kills it and returns the raw rows (cumulative counters, see parseSamplerLine) with the
 * pod's `nproc` as `rows.nproc` and the one-time `meta` ({cpuset, governor, maxMhzDistinct}).
 */
export function startHostSampler(pod, spawnFn = spawn) {
  const [cmd, args] = samplerCommand(pod);
  const child = spawnFn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
  const rows = [];
  rows.nproc = null;
  rows.meta = null;
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d;
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const l of lines) {
      const m = /^nproc (\d+)$/.exec(l.trim());
      if (m) { rows.nproc = Number(m[1]); continue; }
      const mm = /^meta cpuset=(\S+) governor=(\S+) maxmhz=(\S+)$/.exec(l.trim());
      if (mm) { rows.meta = { cpuset: mm[1] === "-" ? null : mm[1], governor: mm[2] === "-" ? null : mm[2], maxMhzDistinct: mm[3] === "-" ? null : mm[3].split(",").map(Number) }; continue; }
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
 * mhzMax, top, and the renderer main thread's core, coreMhz, runMs, waitMs, migr, nvcsw, the GPU main thread's gpuCore,
 * gpuCoreMhz, gpuWaitMs, container throttledMs, rendererPid, rendererThreadsBusy; thread deltas are null where the thread changed or a file was unreadable)
 * plus `nproc`, `cpuset`, `governor`, `maxMhzDistinct`; null without an origin. busyPct is all CPUs, non-idle share of
 * the interval's jiffies.
 */
export function hostSeries(rows, originEpochMs) {
  if (originEpochMs == null || rows.length < 2) return null;
  const dl = (a, b, k, div = 1) => (a[k] != null && b[k] != null && a[k] <= b[k] ? Math.round(((b[k] - a[k]) / div) * 100) / 100 : null);
  const same = (a, b, k) => a[k] != null && a[k] === b[k];
  const meta = rows.meta ?? {};
  const s = { nproc: rows.nproc ?? null, cpuset: meta.cpuset ?? null, governor: meta.governor ?? null, maxMhzDistinct: meta.maxMhzDistinct ?? null,
    core: [], coreMhz: [], runMs: [], waitMs: [], migr: [], nvcsw: [], gpuCore: [], gpuCoreMhz: [], gpuWaitMs: [], throttledMs: [], rendererPid: [], rendererThreadsBusy: [], t: [], stealMs: [], majFaults: [], load1: [], runnable: [], busyPct: [], mhzMin: [], mhzMax: [], top: [] };
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
    const r = rows[i], sameR = same(p, r, 10), sameG = same(p, r, 17);
    s.core.push(r[11] ?? null); s.coreMhz.push(r[12] ?? null);
    s.runMs.push(sameR ? dl(p, r, 13, 1e6) : null); s.waitMs.push(sameR ? dl(p, r, 14, 1e6) : null);
    s.migr.push(sameR ? dl(p, r, 15) : null); s.nvcsw.push(sameR ? dl(p, r, 16) : null);
    s.gpuCore.push(r[18] ?? null); s.gpuCoreMhz.push(r[19] ?? null); s.gpuWaitMs.push(sameG ? dl(p, r, 20, 1e6) : null);
    s.throttledMs.push(dl(p, r, 21, 1000));
    s.rendererPid.push(r[22] ?? null); s.rendererThreadsBusy.push(r[23] ?? null);
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

const mean = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100 : null);

/**
 * Per-frame series ({t, dt, work, gpu} page ms columns) x host series -> long (work >= LONG_FRAME_MS) vs normal frames,
 * each matched to the host sample whose interval (previous sample's t, own t] covers the frame's t: mean coreMhz, share
 * (%) of frames whose sample shows migr > 0, mean waitMs, mean throttledMs, plus the long frames as
 * `[t, work, core, coreMhz, waitMs, migr, throttledMs]` (at most 60). Null without either series.
 */
export function coreCorrelation(series, host, bar = LONG_FRAME_MS) {
  if (!series?.t?.length || !host?.t?.length) return null;
  const g = { long: [], normal: [] };
  let j = 0;
  for (let k = 0; k < series.t.length; k++) {
    const ft = series.t[k];
    while (j < host.t.length - 1 && host.t[j] < ft) j++;
    const lo = j ? host.t[j - 1] : host.t[0] - HOST_SAMPLE_MS;
    if (!(ft > lo && ft <= host.t[j])) continue;
    g[series.work[k] >= bar ? "long" : "normal"].push([k, j]);
  }
  const col = (grp, key) => grp.map(([, i]) => host[key][i]).filter((v) => v != null);
  const stat = (grp) => ({
    n: grp.length,
    coreMhz: mean(col(grp, "coreMhz")),
    migrPct: grp.length ? Math.round((1000 * grp.filter(([, i]) => host.migr[i] > 0).length) / grp.length) / 10 : null,
    waitMs: mean(col(grp, "waitMs")),
    throttledMs: mean(col(grp, "throttledMs")),
  });
  const longFrames = g.long.slice(0, 60).map(([k, i]) => [series.t[k], series.work[k], host.core[i], host.coreMhz[i], host.waitMs[i], host.migr[i], host.throttledMs[i]]);
  return { bar, long: stat(g.long), normal: stat(g.normal), longFrames };
}

/** summary.md line of a coreCorrelation (null -> null). */
export function coreCorrelationText(name, c) {
  if (!c) return null;
  const f = (v) => (v == null ? "n/a" : v);
  return `${name} core: long n=${c.long.n} mhz ${f(c.long.coreMhz)} vs ${f(c.normal.coreMhz)}, migr ${f(c.long.migrPct)}% vs ${f(c.normal.migrPct)}%, wait ${f(c.long.waitMs)} vs ${f(c.normal.waitMs)} ms, throttled ${f(c.long.throttledMs)} vs ${f(c.normal.throttledMs)} ms`;
}
