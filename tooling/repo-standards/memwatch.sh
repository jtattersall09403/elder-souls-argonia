#!/usr/bin/env bash
# RULE (owner 2026-09-25): a heavy job (kit build, Blender, miner, compile,
# preflight, npm test) never calls memwatch.sh directly: it runs through
#   bash tooling/repo-standards/job_guard.sh <lane> -- <command...>
# which waits for CPU, disk and memory headroom, takes one of
# max(1, floor(nproc/2) - 1) machine-wide slots, then calls this script with
# MEMWATCH_LANE=<lane> (printed in every line below). A lane never runs two
# heavy jobs at once; the planner launches at most floor(nproc/2) heavy lanes
# (docs/phases/lanes/README.md).
#
# Run a command under a memory watchdog: poll the cgroup's UNRECLAIMABLE
# memory (anon + shmem + kernel from memory.stat; file cache is reclaimed
# before the kernel ever kills) every half second, record the peak, and kill
# the command's whole process group if it passes the ceiling (default 75% of
# the machine's limit: 3/4 of the cgroup limit or MemTotal (≈22 GiB on the
# 30 GiB EC2 box; was 9 GiB on the 12 GiB cgroup) — BEFORE the kernel kills the editor session with it (2026-09-16:
# preflight's parallel gates took the 12 GiB cgroup down three times).
# memory.current is the wrong signal: on 2026-09-17 it read 5.2 GiB idle of
# which 3.1 GiB was file cache from the province rasters.
#   memwatch.sh [--ceiling-gib N] <command...>     (N may be decimal, e.g. 11.75)
# TWO figures (2026-09-26): the ceiling above is MACHINE-wide (on the EC2 box
# /sys/fs/cgroup is the root cgroup, so it holds every lane), and it is what
# kills; the JOB's own figure is its process tree's Pss_Anon + Pss_Shmem (a fork pool's shared pages once),
# sampled every 0.5 s by own_memory.py. The last line reads
#   memwatch[lane]: own peak X GiB · machine peak Y GiB, exit N
# and per-job targets read the own peak (the placement suite's logged
# "12.7 GiB" was the machine; its own peak was 3.8 GiB).
# Every run, killed or not, appends one JSON line (tool, args, wall s, machine
# GiB at start and at peak, own peak GiB, exit) to output/tool-timings.jsonl
# (MEMWATCH_TIMINGS_LOG overrides); `python3 tooling/repo-standards/tool_timings.py`
# ranks it (16h ledger §6 D).
set -uo pipefail
# The body is one brace group so bash parses it whole before running: a commit that
# edits this file under a running job (d6ecbe55) cannot splice old and new text.
{
ceiling_gib=""
if [[ "${1:-}" == "--ceiling-gib" ]]; then ceiling_gib="${2:-}"; shift 2; fi
if [[ -z "$ceiling_gib" ]]; then
  # Default: 75% of the limit the kernel enforces on us. cgroup v2 memory.max
  # reads "max" when unlimited; then the machine's MemTotal is the limit.
  limit_bytes=$(cat /sys/fs/cgroup/memory.max 2>/dev/null || echo max)
  if [[ ! "$limit_bytes" =~ ^[0-9]+$ ]]; then
    limit_bytes=$(awk '$1=="MemTotal:"{printf "%d", $2 * 1024}' /proc/meminfo 2>/dev/null)
  fi
  if [[ ! "${limit_bytes:-}" =~ ^[0-9]+$ ]] || (( limit_bytes <= 0 )); then
    echo "memwatch: cannot read the machine's memory limit; pass --ceiling-gib N" >&2
    exit 2
  fi
  ceiling_mib=$(( limit_bytes * 3 / 4 / 1048576 ))
else
  # Accept decimals: bash has no float arithmetic, so convert GiB -> MiB (integer,
  # truncated) here and compare in MiB throughout. An unparseable argument used to
  # abort the arithmetic line and leave the command running UNWATCHED — now it is
  # rejected before anything runs.
  if [[ ! "$ceiling_gib" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    echo "memwatch: --ceiling-gib must be a non-negative number (got '${ceiling_gib}')" >&2
    exit 2
  fi
  ceiling_mib=$(awk -v g="$ceiling_gib" 'BEGIN{printf "%d", g * 1024}')
  if (( ceiling_mib <= 0 )); then
    echo "memwatch: --ceiling-gib must be at least 0.001 (got '${ceiling_gib}')" >&2
    exit 2
  fi
fi
if [[ $# -eq 0 ]]; then echo "memwatch: no command given" >&2; exit 2; fi
stat=/sys/fs/cgroup/memory.stat
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
start=$(date +%s.%N)
# Log the run; a logging failure never changes the command's exit code.
log_run() {
  local wall; wall=$(awk -v a="$start" -v b="$(date +%s.%N)" 'BEGIN{printf "%.3f", b - a}')
  python3 "$here/tool_timings.py" --record "$wall" "$start_mib" "$peak" "$1" "$PWD" --own-mib "$(own_peak)" "${cmd[@]}" 2>/dev/null || true
}
# The job's own peak (MiB) as own_memory.py last wrote it; 0 before its first sample.
own_file=$(mktemp "${TMPDIR:-/tmp}/memwatch-own.XXXXXX")
own_peak() { local v; v=$(cat "$own_file" 2>/dev/null); [[ "$v" =~ ^[0-9]+$ ]] && echo "$v" || echo 0; }
gib() { awk -v m="$1" 'BEGIN{printf "%.2f", m / 1024}'; }
finish() {  # $1 = exit code, $2 = suffix
  kill "$own_pid" 2>/dev/null; wait "$own_pid" 2>/dev/null
  echo "$tag: own peak $(gib "$(own_peak)") GiB · machine peak $(gib "$peak") GiB, exit $1$2"
  report "end $(date -u +%FT%TZ) exit $1$2 ownPeakMiB $(own_peak) machinePeakMiB $peak$(scope_line)"
  log_run "$1"; rm -f "$own_file" "$own_file.tmp"
}
# MEMWATCH_REPORT (job_guard's per-job log, 2026-09-30): the child's pid at
# start and, at exit, its own peak, the machine peak and, inside job_guard's
# capped scope (MEMWATCH_SCOPE=1), the scope's memory.peak and OOM-kill count.
report() { [[ -n "${MEMWATCH_REPORT:-}" ]] && echo "$1" >> "$MEMWATCH_REPORT" 2>/dev/null; return 0; }
scope_line() {
  [[ -n "${MEMWATCH_SCOPE:-}" ]] || return 0
  local cg; cg="/sys/fs/cgroup$(awk -F: '$1=="0"{print $3}' /proc/self/cgroup 2>/dev/null)"
  local pk oom
  pk=$(cat "$cg/memory.peak" 2>/dev/null); oom=$(awk '$1=="oom_kill"{print $2}' "$cg/memory.events" 2>/dev/null)
  [[ "$pk" =~ ^[0-9]+$ ]] && printf ' scopePeakMiB %d' $(( pk / 1048576 ))
  [[ -n "$oom" ]] && printf ' oomKills %s' "$oom"
  [[ "${oom:-0}" != 0 ]] && printf ' (KILLED AT THE CAP)'
  return 0
}
cmd=("$@")
tag="memwatch${MEMWATCH_LANE:+[$MEMWATCH_LANE]}"
# MiB of unreclaimable memory, integer.
used() { python3 "$(dirname "${BASH_SOURCE[0]}")/own_memory.py" --machine 2>/dev/null || echo 0; }
start_mib=$(used)
# A preflight (or any nested memwatch) under this one keeps its own ceilings
# below this one, so its inner gate is killed and reported first.
export MEMWATCH_OUTER_CEILING_MIB="$ceiling_mib"
setsid bash -c "$*" &
pid=$!
# 1-min load average every MEMWATCH_LOAD_S seconds (default 60) into the job log,
# so an audit sees CPU saturation beside memory (walk-6 process audit).
load1() { cut -d' ' -f1 "${ES_JOB_LOADAVG_FILE:-/proc/loadavg}" 2>/dev/null; }
load_every=${MEMWATCH_LOAD_S:-60}; next_load=$(( SECONDS + load_every ))
report "child pid $pid (process group $pid) started $(date -u +%FT%TZ) load1 $(load1)"
python3 "$here/own_memory.py" --watch "$pid" "$own_file" 0.5 &
own_pid=$!
peak=$start_mib
while kill -0 "$pid" 2>/dev/null; do
  now=$(used)
  (( now > peak )) && peak=$now
  if (( SECONDS >= next_load )); then
    report "load1 $(load1) at $(date -u +%FT%TZ) machineMiB $now"; next_load=$(( SECONDS + load_every ))
  fi
  if (( now > ceiling_mib )); then
    echo "$tag: machine unreclaimable ${now} MiB > ceiling ${ceiling_mib} MiB — killing (own tree $(gib "$(own_peak)") GiB at peak)" >&2
    kill -TERM -- -"$pid" 2>/dev/null; sleep 2; kill -KILL -- -"$pid" 2>/dev/null
    finish 137 " (KILLED)"; exit 137
  fi
  sleep 0.5
done
wait "$pid"; code=$?
finish "$code" ""
exit $code
}
