#!/usr/bin/env bash
# job_guard.sh <lane> [--budget <min>] -- <command...>
#
# --budget (decision 0106): a hard wall-clock stop in whole minutes; at the
# budget the job is killed (exit 124) after a checkpoint line lands in
# tooling/.reports/budget/<lane>.checkpoint (ES_BUDGET_DIR overrides).
#
# The one way a heavy job runs (kit builds, Blender, miners, compiles,
# preflight, npm test): owner ruling 2026-09-25, after the planner session died
# at 97 % CPU with four lanes running on the 4-core codespace. It
#   1. waits (poll 5 s, up to 30 min, then fails loudly, exit 75) until the
#      volume holding the current
#      directory AND the /tmp cache volume (tooling/bootstrap/cache-links.sh
#      links the mod pool, mesh cache and kit builds there) each have more than
#      3 GB free, and the cgroup's unreclaimable memory is under memwatch.sh's
#      ceiling;
#   2. takes one of N machine-wide slots, N = max(1, floor((nproc-1)/2)) (3 on
#      the 8-vCPU EC2 box, method review C1 2026-09-27: admission is by slot,
#      no longer by the load average, and each slot owns a share of the pool,
#      ES_JOB_CORES = floor(pool cores / N), 2 on EC2)
#      (flock on /tmp/es-jobs/slot-<i>.lock, released when the job exits,
#      however it exits), re-checking the headroom once it holds one;
#   3. runs the command under memwatch.sh (killed past the memory ceiling;
#      the timings log gets a line with the job's own peak) at low priority
#      on the heavy-job core pool: `nice -n 10 ionice -c3 taskset -c 1-<nproc-1>`
#      (cores 1-7 on the EC2 box; 2-7 until speed lane 2, 2026-09-27: the
#      6-core pin was a 75 % machine ceiling and the contention behind the
#      slow suites), every slot pinned to the whole pool (shared, the kernel
#      balances), leaving core 0 and nice 0 priority to the planner, the
#      agents, the editor tunnel and the dev server (owner 2026-09-25), with
#      ES_JOB_CORES and PYTEST_XDIST_AUTO_NUM_WORKERS=ES_JOB_CORES exported
#      (`-n auto` would otherwise start one pytest worker per pool core in
#      every slot; build_kit and preflight size their pools to it too, and
#      the workbench's check/scan pool,
#      tooling/placement-workbench/workbench/parallel.py, takes the pool
#      cores idle at fork time up to 7 with it as the floor), and exits with
#      the command's code. tooling/repo-standards/cpu_watchdog.sh is the
#      machine-wide backstop behind it.
# Lines it prints start "job_guard[<lane>]". Examples:
#   bash tooling/repo-standards/job_guard.sh miner -- python3 -m worldgen.mine_mounts --jobs 2
#   bash tooling/repo-standards/job_guard.sh kits -- python3 pipeline/build_kit.py settlement-stilt-v1
# The command's arguments reach it unchanged (walk 3 L3 rec 2: `-k "a or b"`
# was split into words): several arguments are quoted one by one (printf %q)
# into the one string memwatch.sh runs with `bash -c`, so each stays one
# argument; a single argument is a shell line, run as written (pipes, `&&`,
# `$VAR`: `job_guard.sh L -- "cd x && make | tee log"`).
# A job_guard inside a guarded job runs its command inline (ES_JOB_GUARD names
# the outer lane), so a script may guard itself: tooling/repo-standards
# `npm test` does (test.sh).
# Rules (docs/phases/lanes/README.md): every heavy job goes through job_guard;
# a lane never runs two heavy jobs at once; the planner launches at most one
# heavy lane per slot.
# Overrides (tests, or a bigger machine): ES_JOB_SLOTS, ES_JOB_MIN_FREE_GB (3),
# ES_JOB_WAIT_S (1800), ES_JOB_POLL_S (5), ES_JOB_LOCK_DIR (/tmp/es-jobs),
# ES_JOB_MAX_LOAD (unset: no load gate), ES_JOB_LOADAVG_FILE (tests), ES_JOB_CORES, ES_JOB_MEM_CEILING_MIB (memwatch's default;
# passed on to memwatch as its kill ceiling), ES_CACHE_ROOT (/tmp/es-cache),
# ES_JOB_CPUS (the taskset list, default the pool 1-<nproc-1>; on a 2- or
# 3-core machine the last core, on one core core 0), PYTEST_XDIST_AUTO_NUM_WORKERS
# (ES_JOB_CORES; an explicit value is kept).
set -uo pipefail

lane="${1:-}"
budget_min=""
# --budget <min> (decision 0106): the job is killed at its budget after a
# checkpoint line is written to tooling/.reports/budget/<lane>.checkpoint.
if [[ "${2:-}" == "--budget" ]]; then
  budget_min="${3:-}"
  [[ "$budget_min" =~ ^[0-9]+(\.[0-9]+)?$ ]] && awk -v m="$budget_min" 'BEGIN{exit !(m > 0)}' \
    || { echo "job_guard: --budget needs minutes > 0" >&2; exit 2; }
  set -- "$1" "${@:4}"
fi
if [[ -z "$lane" || "${2:-}" != "--" || $# -lt 3 ]]; then
  echo "usage: job_guard.sh <lane> [--budget <min>] -- <command...>" >&2; exit 2
fi
shift 2
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# memwatch.sh runs `bash -c "$*"`: one argument is a shell line as written;
# several are quoted one by one so each reaches the command unchanged
if (( $# == 1 )); then run_line="$1"; else run_line="$(printf '%q ' "$@")"; run_line="${run_line% }"; fi
say() { echo "job_guard[$lane]: $*" >&2; }
# Nested (a guarded job whose own script guards itself, e.g. preflight ->
# repo-standards `npm test`): the outer job already holds a slot and the
# watchdog exemption, so run inline; taking a second slot could deadlock.
if [[ -n "${ES_JOB_GUARD:-}" ]]; then
  say "inside job_guard[$ES_JOB_GUARD]: running in its slot"
  exec bash -c "$run_line"
fi
export ES_JOB_GUARD="$lane"

cores=$(nproc)
# Admission is by SLOT (method review C1, 2026-09-27): max(1, floor((nproc-1)/2))
# slots, 3 on the 8-vCPU box, each a share of the pool's cores. The 1-min load
# average no longer gates admission: it counts every lane's work, so it
# starved admitted-sized jobs behind unguarded ones; ES_JOB_MAX_LOAD brings the
# load check back when set.
slots="${ES_JOB_SLOTS:-$(( (cores - 1) / 2 ))}"
(( slots < 1 )) && slots=1
max_load="${ES_JOB_MAX_LOAD:-}"
min_free_kib=$(awk -v g="${ES_JOB_MIN_FREE_GB:-3}" 'BEGIN{printf "%d", g * 1000000000 / 1024}')
wait_s="${ES_JOB_WAIT_S:-1800}"
poll_s="${ES_JOB_POLL_S:-5}"
lock_dir="${ES_JOB_LOCK_DIR:-/tmp/es-jobs}"
if (( cores >= 4 )); then pool="1-$(( cores - 1 ))"
elif (( cores >= 2 )); then pool="$(( cores - 1 ))"
else pool=0; fi
cpus="${ES_JOB_CPUS:-$pool}"
# The slot's share of the pool: every pool inside the job sizes itself to it
# (ES_JOB_CORES: pytest-xdist through PYTEST_XDIST_AUTO_NUM_WORKERS, which it
# reads for `-n auto`; build_kit's kit jobs and Blender threads; preflight's
# pytest workers), so three admitted jobs share the pool instead of each
# starting one worker per pool core.
pool_cores=$(taskset -c "$cpus" nproc 2>/dev/null || echo "$cores")
export ES_JOB_CORES="${ES_JOB_CORES:-$(( pool_cores / slots > 0 ? pool_cores / slots : 1 ))}"
export PYTEST_XDIST_AUTO_NUM_WORKERS="${PYTEST_XDIST_AUTO_NUM_WORKERS:-$ES_JOB_CORES}"

# memwatch.sh's ceiling: 75 % of cgroup memory.max, else of MemTotal.
mw_args=()
if [[ -n "${ES_JOB_MEM_CEILING_MIB:-}" ]]; then
  ceiling_mib="$ES_JOB_MEM_CEILING_MIB"
  # The same ceiling kills the job: memwatch must not admit-then-kill.
  mw_args=(--ceiling-gib "$(awk -v m="$ceiling_mib" 'BEGIN{printf "%.3f", m / 1024}')")
else
  limit=$(cat /sys/fs/cgroup/memory.max 2>/dev/null || echo max)
  [[ "$limit" =~ ^[0-9]+$ ]] || limit=$(awk '$1=="MemTotal:"{printf "%d", $2 * 1024}' /proc/meminfo)
  ceiling_mib=$(( limit * 3 / 4 / 1048576 ))
fi
mem_mib() {  # unreclaimable: anon + shmem + kernel (memwatch.sh's measure)
  local stat=/sys/fs/cgroup/memory.stat
  if [[ -r "$stat" ]]; then
    awk '$1=="anon"||$1=="shmem"||$1=="kernel"{s+=$2} END{printf "%d", (s+0)/1048576}' "$stat"
  else
    awk '$1=="MemTotal:"{t=$2} $1=="MemAvailable:"{a=$2} END{printf "%d", (t-a)/1024}' /proc/meminfo
  fi
}
load1() { cut -d' ' -f1 "${ES_JOB_LOADAVG_FILE:-/proc/loadavg}"; }
# The volumes a job writes to: the current directory's, and the cache volume
# the kit builds, mesh cache and mod pool are linked onto (when it exists).
vols=(.); [[ -d "${ES_CACHE_ROOT:-/tmp/es-cache}" ]] && vols+=("${ES_CACHE_ROOT:-/tmp/es-cache}")
free_kib() { df -Pk "$1" | awk 'NR==2{print $4}'; }

# Why the machine is not ready now ("" = ready).
blocked() {
  local l f m v
  l=$(load1); m=$(mem_mib)
  if [[ -n "$max_load" ]] && awk -v l="$l" -v x="$max_load" 'BEGIN{exit !(l >= x)}'; then echo "load $l >= $max_load"; return; fi
  for v in "${vols[@]}"; do
    f=$(free_kib "$v")
    if (( f <= min_free_kib )); then echo "free disk $(( f / 1024 )) MiB on $(df -P "$v" | awk 'NR==2{print $6}') <= ${ES_JOB_MIN_FREE_GB:-3} GB"; return; fi
  done
  if (( m >= ceiling_mib )); then echo "unreclaimable memory ${m} MiB >= ceiling ${ceiling_mib} MiB"; return; fi
  echo ""
}

mkdir -p "$lock_dir" 2>/dev/null; chmod 1777 "$lock_dir" 2>/dev/null || true
start=$(date +%s); last_msg=0
while :; do
  why=$(blocked)
  if [[ -z "$why" ]]; then
    for (( i = 0; i < slots; i++ )); do
      exec {fd}>>"$lock_dir/slot-$i.lock" || continue
      if flock -n "$fd"; then
        why=$(blocked)   # headroom may have gone while we waited for the slot
        if [[ -z "$why" ]]; then
          printf '%s %s pid %s: %s\n' "$(date -u +%FT%TZ)" "$lane" "$$" "$*" > "$lock_dir/slot-$i.lock"
          say "slot $((i + 1))/$slots, cores $cpus (share $ES_JOB_CORES), load $(load1), $(( $(free_kib .) / 1024 )) MiB free, mem $(mem_mib)/${ceiling_mib} MiB: $*"
          # The slot is held by this script for the job's life; the job gets
          # no copy of the fd ({fd}>&-), so a process it leaves behind never
          # keeps the slot. memwatch logs the run with the lane in the tool line.
          if [[ -n "$budget_min" ]]; then
            began=$(date +%s)
            MEMWATCH_LANE="$lane" timeout --kill-after=30 "${budget_min}m" nice -n 10 ionice -c3 taskset -c "$cpus" "$here/memwatch.sh" "${mw_args[@]}" "$run_line" {fd}>&-
            code=$?
            # the budget, not the job's own 124 or an OOM kill: the wall reached it
            if (( code == 124 || code == 137 )) && awk -v e="$(( $(date +%s) - began ))" -v m="$budget_min" 'BEGIN{exit !(e >= m * 60 - 1)}'; then
              ckdir="${ES_BUDGET_DIR:-$here/../.reports/budget}"; mkdir -p "$ckdir"
              printf '%s BUDGET %s min reached, job killed (0106): %s\n' "$(date -u +%FT%TZ)" "$budget_min" "$*" >> "$ckdir/$lane.checkpoint"
              say "BUDGET ${budget_min} min reached: killed; checkpoint line in $ckdir/$lane.checkpoint. Write what is green and the next step, and return."
            fi
          else
            MEMWATCH_LANE="$lane" nice -n 10 ionice -c3 taskset -c "$cpus" "$here/memwatch.sh" "${mw_args[@]}" "$run_line" {fd}>&-
            code=$?
          fi
          : > "$lock_dir/slot-$i.lock"
          exit "$code"
        fi
        exec {fd}>&-
        break
      fi
      exec {fd}>&-
    done
    [[ -z "$why" ]] && why="all $slots slot(s) busy ($(cat "$lock_dir"/slot-*.lock 2>/dev/null | cut -d' ' -f2 | sort | tr '\n' ' '))"
  fi
  now=$(date +%s)
  if (( now - start >= wait_s )); then
    say "FAILED: waited $(( now - start )) s and the machine never had room: $why. Not run: $*"
    exit 75
  fi
  if (( now - last_msg >= 60 )); then say "waiting: $why"; last_msg=$now; fi
  sleep "$poll_s"
done
