#!/usr/bin/env bash
# lane_keepalive.sh: keep the VM from an AWS low-CPU stop while work is live
# (owner 2026-10-02: AWS stops the instance after 1 h under 3 % CPU; a RunPod
# capture driven from here can leave the VM near idle for an hour while lanes
# are live, and a stop kills every lane and leaves pods billing).
#
# Every 60 s: if lane_status lists a live/unfinished subagent, or a
# job_guard.sh / memwatch.sh process is alive, burn ~40 % of one core for the
# next 60 s (5 % of the 8-vCPU average); else burn nothing, so the AWS stop
# still fires after the work ends. One line per state change to
# /tmp/es-jobs/keepalive.log.
#
#   nohup bash tooling/repo-standards/lane_keepalive.sh >/dev/null 2>&1 &
#   pkill -f lane_keepalive.sh        # stop it (it holds no other process)
# claude-session.sh starts it once per session start.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG="${ES_KEEPALIVE_LOG:-/tmp/es-jobs/keepalive.log}"
DUTY="${ES_KEEPALIVE_DUTY:-0.4}"
mkdir -p "$(dirname "$LOG")"

live_count() {
  local n g
  n=$(timeout 50 python3 "$REPO/tooling/repo-standards/lane_status.py" --json 2>/dev/null | python3 -c 'import json,sys
try: rs=json.load(sys.stdin)
except Exception: rs=[]
print(sum(1 for r in rs if r["state"] in ("live","unfinished") or r["state"].startswith("live (")))' 2>/dev/null | tail -1)
  [[ "$n" =~ ^[0-9]+$ ]] || n=0
  g=$(pgrep -fc '(job_guard|memwatch)\.sh' 2>/dev/null | tail -1)
  [[ "$g" =~ ^[0-9]+$ ]] || g=0
  echo $((n + g))
}

last=""
while :; do
  start=$(date +%s)
  live=$(live_count)
  state=idle; (( live > 0 )) && state=burn
  [[ "$state" != "$last" ]] && echo "$(date -u +%FT%TZ) $state (live=$live)" >> "$LOG" && last=$state
  if [[ "$state" == burn ]]; then
    # duty-cycle burn: DUTY of every 100 ms busy, the rest asleep, until 60 s
    nice -n 19 python3 -c "
import time
end=$start+60; d=$DUTY
while time.time()<end:
    t=time.time()
    while time.time()-t<0.1*d: pass
    time.sleep(0.1*(1-d))"
  else
    rest=$(( 60 - ($(date +%s) - start) )); (( rest > 0 )) && sleep "$rest"
  fi
done
