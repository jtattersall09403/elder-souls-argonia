#!/usr/bin/env bash
# job_guard.sh <lane> -- <command...>
#
# The one way a heavy job runs (kit builds, Blender, miners, compiles,
# preflight, npm test): owner ruling 2026-09-25, after the planner session died
# at 97 % CPU with four lanes running on the 4-core codespace. It
#   1. waits (poll 5 s, up to 30 min, then fails loudly, exit 75) until the
#      1-min load average is below nproc - 1, the volume holding the current
#      directory AND the /tmp cache volume (tooling/bootstrap/cache-links.sh
#      links the mod pool, mesh cache and kit builds there) each have more than
#      3 GB free, and the cgroup's unreclaimable memory is under memwatch.sh's
#      ceiling;
#   2. takes one of N machine-wide slots, N = max(1, floor(nproc/2) - 1)
#      (flock on /tmp/es-jobs/slot-<i>.lock, released when the job exits,
#      however it exits), re-checking the headroom once it holds one;
#   3. runs the command under memwatch.sh (killed past the memory ceiling;
#      the timings log gets a line) at low priority on the upper half of the
#      cores: `nice -n 10 ionice -c3 taskset -c <floor(nproc/2)>-<nproc-1>`
#      (cores 2-3 on the 4-core codespace), leaving the lower half to the
#      editor tunnel and the Claude CLI (owner 2026-09-25), and exits with the
#      command's code. tooling/repo-standards/cpu_watchdog.sh is the
#      machine-wide backstop behind it.
# Lines it prints start "job_guard[<lane>]". Examples:
#   bash tooling/repo-standards/job_guard.sh miner -- python3 -m worldgen.mine_mounts --jobs 2
#   bash tooling/repo-standards/job_guard.sh kits -- python3 pipeline/build_kit.py settlement-stilt-v1
# The command runs through `bash -c "$*"` (as memwatch.sh does): quote it as
# you would at a prompt.
# Rules (docs/phases/lanes/README.md): every heavy job goes through job_guard;
# a lane never runs two heavy jobs at once; the planner launches at most
# floor(nproc/2) heavy lanes.
# Overrides (tests, or a bigger machine): ES_JOB_SLOTS, ES_JOB_MIN_FREE_GB (3),
# ES_JOB_WAIT_S (1800), ES_JOB_POLL_S (5), ES_JOB_LOCK_DIR (/tmp/es-jobs),
# ES_JOB_MAX_LOAD (nproc - 1), ES_JOB_MEM_CEILING_MIB (memwatch's default;
# passed on to memwatch as its kill ceiling), ES_CACHE_ROOT (/tmp/es-cache),
# ES_JOB_CPUS (the taskset list, default the upper half of the cores).
set -uo pipefail

lane="${1:-}"
if [[ -z "$lane" || "${2:-}" != "--" || $# -lt 3 ]]; then
  echo "usage: job_guard.sh <lane> -- <command...>" >&2; exit 2
fi
shift 2
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
say() { echo "job_guard[$lane]: $*" >&2; }

cores=$(nproc)
slots="${ES_JOB_SLOTS:-$(( cores / 2 - 1 ))}"
(( slots < 1 )) && slots=1
max_load="${ES_JOB_MAX_LOAD:-$(( cores - 1 ))}"
(( max_load < 1 )) && max_load=1
min_free_kib=$(awk -v g="${ES_JOB_MIN_FREE_GB:-3}" 'BEGIN{printf "%d", g * 1000000000 / 1024}')
wait_s="${ES_JOB_WAIT_S:-1800}"
poll_s="${ES_JOB_POLL_S:-5}"
lock_dir="${ES_JOB_LOCK_DIR:-/tmp/es-jobs}"
cpus="${ES_JOB_CPUS:-$(( cores / 2 ))-$(( cores - 1 ))}"
(( cores == 1 )) && cpus="${ES_JOB_CPUS:-0}"

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
load1() { cut -d' ' -f1 /proc/loadavg; }
# The volumes a job writes to: the current directory's, and the cache volume
# the kit builds, mesh cache and mod pool are linked onto (when it exists).
vols=(.); [[ -d "${ES_CACHE_ROOT:-/tmp/es-cache}" ]] && vols+=("${ES_CACHE_ROOT:-/tmp/es-cache}")
free_kib() { df -Pk "$1" | awk 'NR==2{print $4}'; }

# Why the machine is not ready now ("" = ready).
blocked() {
  local l f m v
  l=$(load1); m=$(mem_mib)
  if awk -v l="$l" -v x="$max_load" 'BEGIN{exit !(l >= x)}'; then echo "load $l >= $max_load"; return; fi
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
          say "slot $((i + 1))/$slots, cores $cpus, load $(load1), $(( $(free_kib .) / 1024 )) MiB free, mem $(mem_mib)/${ceiling_mib} MiB: $*"
          # The slot is held by this script for the job's life; the job gets
          # no copy of the fd ({fd}>&-), so a process it leaves behind never
          # keeps the slot. memwatch logs the run with the lane in the tool line.
          MEMWATCH_LANE="$lane" nice -n 10 ionice -c3 taskset -c "$cpus" "$here/memwatch.sh" "${mw_args[@]}" "$@" {fd}>&-
          code=$?
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
