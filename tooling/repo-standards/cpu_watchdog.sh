#!/usr/bin/env bash
# cpu_watchdog.sh [--start | --status | --stop | --foreground]
#
# The machine's CPU watchdog (owner ruling 2026-09-25, after the second
# codespace crash at 100 % CPU): a daemon that pauses the heaviest processes
# while the whole machine is above 85 % CPU, continues them one at a time once
# it has calmed, and kills stale `rtk` filters and orphaned Blender / miner /
# kit-build / test workers, with no agent involved. The logic and every
# threshold are in cpu_watchdog.py (its docstring); this wrapper starts it.
#   --start (default)  start it detached (nohup, setsid) unless one is running;
#                      one instance per machine: flock on /tmp/es-jobs/watchdog.lock
#   --status           running or not, last machine CPU, the stopped list
#   --stop             SIGTERM the daemon (it continues everything it stopped)
#   --foreground       run in this terminal (tests)
# tooling/bootstrap/on-start.sh runs `--start` on every codespace start.
# Log: /tmp/es-jobs/watchdog.log (ES_WD_DIR moves the directory).
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dir="${ES_WD_DIR:-/tmp/es-jobs}"
py="$here/cpu_watchdog.py"
mkdir -p "$dir" 2>/dev/null; chmod 1777 "$dir" 2>/dev/null || true

running() { ! flock -n "$dir/watchdog.lock" true 2>/dev/null; }

case "${1:---start}" in
  --status) exec python3 "$py" --status ;;
  --foreground) exec python3 "$py" ;;
  --stop)
    pid=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("pid",""))' "$dir/watchdog.state.json" 2>/dev/null)
    if running && [[ -n "$pid" ]]; then kill -TERM "$pid" && echo "cpu_watchdog: sent SIGTERM to $pid"; else echo "cpu_watchdog: not running"; fi ;;
  --start)
    if running; then echo "cpu_watchdog: already running (log $dir/watchdog.log)"; exit 0; fi
    nohup setsid nice -n 0 python3 "$py" >>"$dir/watchdog.log" 2>&1 </dev/null &
    echo "cpu_watchdog: started pid $! (log $dir/watchdog.log)" ;;
  *) echo "usage: cpu_watchdog.sh [--start|--status|--stop|--foreground]" >&2; exit 2 ;;
esac
