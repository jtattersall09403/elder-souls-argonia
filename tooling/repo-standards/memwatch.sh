#!/usr/bin/env bash
# Run a command under a memory watchdog: poll the cgroup's UNRECLAIMABLE
# memory (anon + shmem + kernel from memory.stat; file cache is reclaimed
# before the kernel ever kills) every half second, record the peak, and kill
# the command's whole process group if it passes the ceiling (default 9 GiB)
# — BEFORE the kernel kills the editor session with it (2026-09-16:
# preflight's parallel gates took the 12 GiB cgroup down three times).
# memory.current is the wrong signal: on 2026-09-17 it read 5.2 GiB idle of
# which 3.1 GiB was file cache from the province rasters.
#   memwatch.sh [--ceiling-gib N] <command...>     (N may be decimal, e.g. 11.75)
set -uo pipefail
ceiling_gib=9
if [[ "${1:-}" == "--ceiling-gib" ]]; then ceiling_gib="${2:-}"; shift 2; fi
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
if [[ $# -eq 0 ]]; then echo "memwatch: no command given" >&2; exit 2; fi
stat=/sys/fs/cgroup/memory.stat
# MiB of unreclaimable memory, integer.
used() { awk '$1=="anon"||$1=="shmem"||$1=="kernel"{s+=$2} END{printf "%d", (s+0)/1048576}' "$stat" 2>/dev/null || echo 0; }
setsid bash -c "$*" &
pid=$!
peak=0
while kill -0 "$pid" 2>/dev/null; do
  now=$(used)
  (( now > peak )) && peak=$now
  if (( now > ceiling_mib )); then
    echo "memwatch: cgroup unreclaimable ${now} MiB > ceiling ${ceiling_mib} MiB — killing" >&2
    kill -TERM -- -"$pid" 2>/dev/null; sleep 2; kill -KILL -- -"$pid" 2>/dev/null
    echo "memwatch: peak ${peak} MiB (KILLED)"; exit 137
  fi
  sleep 0.5
done
wait "$pid"; code=$?
echo "memwatch: peak ${peak} MiB, exit $code"
exit $code
