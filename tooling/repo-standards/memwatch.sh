#!/usr/bin/env bash
# Run a command under a memory watchdog: poll the cgroup's UNRECLAIMABLE
# memory (anon + shmem + kernel from memory.stat; file cache is reclaimed
# before the kernel ever kills) every half second, record the peak, and kill
# the command's whole process group if it passes the ceiling (default 9 GiB)
# — BEFORE the kernel kills the editor session with it (2026-09-16:
# preflight's parallel gates took the 12 GiB cgroup down three times).
# memory.current is the wrong signal: on 2026-09-17 it read 5.2 GiB idle of
# which 3.1 GiB was file cache from the province rasters.
#   memwatch.sh [--ceiling-gib N] <command...>
set -uo pipefail
ceiling_gib=9
if [[ "${1:-}" == "--ceiling-gib" ]]; then ceiling_gib="$2"; shift 2; fi
ceiling=$(( ceiling_gib * 1024 * 1024 * 1024 ))
stat=/sys/fs/cgroup/memory.stat
used() { awk '$1=="anon"||$1=="shmem"||$1=="kernel"{s+=$2} END{print s+0}' "$stat" 2>/dev/null || echo 0; }
setsid bash -c "$*" &
pid=$!
peak=0
while kill -0 "$pid" 2>/dev/null; do
  now=$(used)
  (( now > peak )) && peak=$now
  if (( now > ceiling )); then
    echo "memwatch: cgroup unreclaimable $((now / 1048576)) MiB > ceiling $((ceiling / 1048576)) MiB — killing" >&2
    kill -TERM -- -"$pid" 2>/dev/null; sleep 2; kill -KILL -- -"$pid" 2>/dev/null
    echo "memwatch: peak $((peak / 1048576)) MiB (KILLED)"; exit 137
  fi
  sleep 0.5
done
wait "$pid"; code=$?
echo "memwatch: peak $((peak / 1048576)) MiB, exit $code"
exit $code
