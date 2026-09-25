#!/usr/bin/env bash
# idle-stop.sh: power the EC2 dev machine off once it has been idle for
# ES_IDLE_MINUTES (default 90) in a row. Run as root by es-idle-stop.timer
# every 10 minutes (ec2-user-data.sh installs both). A stopped EBS instance
# costs only its disk; the owner starts it again from the console.
#
# The machine is BUSY when any one of these holds (else idle):
#   slot     a job_guard slot is held: a /tmp/es-jobs/slot-*.lock that flock
#            cannot take (job_guard.sh holds it with flock for the job's life)
#   load     the 1-minute load average is >= ES_IDLE_LOAD (default 0.5)
#   tunnel   the `code tunnel` process tree holds more established TCP
#            connections than ES_IDLE_TUNNEL_BASELINE (default 1: the host's
#            own link to the tunnel relay, which is up with no client). NOT
#            measured on EC2 yet: read the tunnel= counts in the log with
#            vscode.dev open and closed on day 1 and set the baseline in
#            /etc/es/idle.env if the default is wrong.
# The first idle check writes the time to /var/lib/es/idle-since; any busy
# check deletes it. Idle time runs from the latest of that time, the boot and
# the newest Claude transcript write (*.jsonl under $ES_IDLE_CLAUDE_DIR,
# default /workspaces/.claude-home/projects: a working agent writes every
# turn), so the machine powers off ES_IDLE_MINUTES after the last of them.
# Every check logs one line to /var/log/es-idle.log.
#   idle-stop.sh --dry-run   check and log, never power off
set -uo pipefail

# shellcheck source=/dev/null
[[ -r /etc/es/idle.env ]] && . /etc/es/idle.env
MINUTES="${ES_IDLE_MINUTES:-90}"
MAX_LOAD="${ES_IDLE_LOAD:-0.5}"
BASELINE="${ES_IDLE_TUNNEL_BASELINE:-1}"
LOCKS="${ES_JOB_LOCK_DIR:-/tmp/es-jobs}"
CLAUDE_DIR="${ES_IDLE_CLAUDE_DIR:-/workspaces/.claude-home/projects}"
STATE="${ES_IDLE_STATE:-/var/lib/es/idle-since}"
LOG="${ES_IDLE_LOG:-/var/log/es-idle.log}"
DRY=0; [[ "${1:-}" == --dry-run ]] && DRY=1

log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
mkdir -p "$(dirname "$STATE")" "$(dirname "$LOG")"

busy=()

held=0
for f in "$LOCKS"/slot-*.lock; do
  [[ -e "$f" ]] || continue
  flock -n "$f" true 2>/dev/null || held=$((held + 1))
done
(( held > 0 )) && busy+=("slot:$held")

load=$(cut -d' ' -f1 /proc/loadavg)
awk -v l="$load" -v m="$MAX_LOAD" 'BEGIN{exit !(l >= m)}' && busy+=("load:$load")

# pids of every `code tunnel` process and its descendants (the server it
# spawns), then their established TCP connections.
tunnel_pids() {
  local roots all p
  # comm `code`: the tunnel service runs `code --verbose --cli-data-dir <dir>
  # tunnel service internal-run`, so the args need not start `code tunnel`.
  roots=$(pgrep -x code || true)
  all="$roots"
  while [[ -n "$roots" ]]; do
    p=""
    for r in $roots; do p+=" $(pgrep -P "$r" || true)"; done
    roots=$(echo "$p" | xargs)
    all+=" $roots"
  done
  echo "$all" | xargs -n1 2>/dev/null | sort -u
}
tunnel=0
pids=$(tunnel_pids)
if [[ -n "$pids" ]]; then
  pat=$(echo "$pids" | awk '{printf "%spid=%s,", (NR>1?"|":""), $1}')
  tunnel=$(ss -Htnp state established 2>/dev/null | grep -cE "$pat" || true)
  (( tunnel > BASELINE )) && busy+=("tunnel:$tunnel")
fi

now=$(date +%s)
if (( ${#busy[@]} )); then
  rm -f "$STATE"
  log "busy ${busy[*]} (load=$load tunnel=$tunnel)"
  exit 0
fi
[[ -s "$STATE" ]] || echo "$now" > "$STATE"
since=$(cat "$STATE")
boot=$(( now - $(cut -d. -f1 /proc/uptime) ))
claude=0
[[ -d "$CLAUDE_DIR" ]] && claude=$(find "$CLAUDE_DIR" -name '*.jsonl' -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | cut -d. -f1)
last=$since
for t in "$boot" "${claude:-0}"; do (( t > last )) && last=$t; done
idle_min=$(( (now - last) / 60 ))
if (( idle_min < MINUTES )); then
  log "idle for ${idle_min} min of ${MINUTES} (load=$load tunnel=$tunnel claude_age=$(( (now - ${claude:-0}) / 60 )) min)"
  exit 0
fi
if (( DRY )); then
  log "idle for ${idle_min} min: would power off (--dry-run)"
  exit 0
fi
log "idle for ${idle_min} min: powering off"
rm -f "$STATE"
systemctl poweroff
