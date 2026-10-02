#!/usr/bin/env bash
# Claude Code in a tmux session that outlives the browser (owner 2026-09-26).
#
#   bash tooling/bootstrap/claude-session.sh                (or the `es` alias)
#   bash tooling/bootstrap/claude-session.sh --attach-only   (used by the VS Code task)
#
# If the tmux session `es` already exists, this script ONLY attaches to it —
# it never creates a new window or runs `claude` again, so reopening the
# folder (or re-running this script) can't start a second Claude process on
# the same conversation.
#
# If `es` does not exist, and no Claude process outside tmux already has this
# repo as its cwd, it creates the session: window `claude` runs
# `claude --continue` (a fresh `claude` when this repo has no conversation to
# continue), window `shell` is a plain shell.
#
# If `es` does not exist but a Claude process outside tmux already has this
# repo as its cwd, it refuses to start a second one: it prints where that
# process is and opens only the plain `shell` window.
#
# --attach-only: used by the VS Code folderOpen task. Attaches if `es`
# exists; otherwise prints how to start a session and exits without
# creating anything (a folder open must never start Claude by itself).
#
# --supervise: as a plain start, but window `claude` runs the supervisor
# loop (--loop): a non-zero exit or a kill (OOM) logs a line to
# tooling/.reports/session-restarts.log (time, exit code, the dmesg OOM line,
# pod ids the lane notes name that may still be billing), waits 30 s and
# relaunches `claude -c`, at most 3 times in 6 h; the 4th crash posts to the
# owner inbox and stops. Exit 0 ends the loop.
# --supervise --attach-existing: adds window `supervise` to the running `es`
# session, watching the Claude already running in this repo without touching
# it; if that process dies by an OOM kill the loop takes over there, else
# (an /exit) the watcher ends.
# Every start also launches lane_keepalive.sh once (AWS stops the VM after
# 1 h under 3 % CPU; the keepalive holds it up only while lanes are live).
#
# Closing the browser tab or losing the connection only detaches the client;
# Claude keeps running. Ctrl-b d detaches on purpose; Ctrl-b n / Ctrl-b p
# switch windows. See README § Sessions.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION="${ES_TMUX_SESSION:-es}"

ATTACH_ONLY=0; SUPERVISE=0; ATTACH_EXISTING=0; LOOP=0; WATCH_PID=""
for arg in "$@"; do
  case "$arg" in
    --attach-only) ATTACH_ONLY=1 ;;
    --supervise) SUPERVISE=1 ;;
    --attach-existing) ATTACH_EXISTING=1 ;;
    --loop) LOOP=1 ;;
    --watch=*) WATCH_PID="${arg#--watch=}" ;;
  esac
done

RESTART_LOG="$REPO/tooling/.reports/session-restarts.log"
MAX_RESTARTS="${ES_SUPERVISE_MAX:-3}"
WINDOW_S="${ES_SUPERVISE_WINDOW_S:-21600}"
PAUSE_S="${ES_SUPERVISE_PAUSE_S:-30}"
KEEPALIVE="$REPO/tooling/repo-standards/lane_keepalive.sh"

repo_claude_pid() {
  local pid
  for pid in $(pgrep -u "$USER" -x claude 2>/dev/null || true); do
    [[ "$(readlink -f "/proc/$pid/cwd" 2>/dev/null)" == "$REPO" ]] && { echo "$pid"; return; }
  done
}

oom_line() {  # the newest kernel OOM-kill line, for pid $1 when given
  { dmesg 2>/dev/null || sudo -n dmesg 2>/dev/null || journalctl -k -q --no-pager 2>/dev/null; } \
    | grep -E "Killed process ${1:-[0-9]+}( |$)" | tail -1 || true
}

pod_ids() {  # pod ids the lane notes name: a crash may leave them billing
  grep -rhoE '(pod[ _-]?id|--pod-id)[=: "]+[a-z0-9]{12,16}' "$REPO/tooling/.reports" 2>/dev/null \
    | grep -oE '[a-z0-9]{12,16}$' | sort -u | tr '\n' ' ' || true
}

ensure_keepalive() {
  pgrep -f 'lane_keepalive\.sh' >/dev/null 2>&1 && return 0
  [[ -x "$KEEPALIVE" ]] || return 0
  nohup "$KEEPALIVE" >/dev/null 2>&1 &
}

# Log one crash; 0 = relaunch, 1 = the cap is reached (owner told, stop).
crash_and_maybe_restart() {  # $1 exit code
  mkdir -p "$(dirname "$RESTART_LOG")"
  local now n pods
  now=$(date +%s)
  n=$(awk -v c=$((now - WINDOW_S)) '$2 >= c && $3 == "crash" {k++} END {print k+0}' "$RESTART_LOG" 2>/dev/null || echo 0)
  pods="$(pod_ids)"
  echo "$(date -u +%FT%TZ) $now crash exit=$1 oom=[$(oom_line)] pods-may-be-billing=[${pods:-none named; check the RunPod console}]" >> "$RESTART_LOG"
  if (( n >= MAX_RESTARTS )); then
    echo "$(date -u +%FT%TZ) $now stop after $MAX_RESTARTS restarts in $((WINDOW_S / 3600)) h" >> "$RESTART_LOG"
    python3 "$REPO/tooling/repo-standards/owner_inbox.py" --post \
      "Claude session crashed $((n + 1)) times in $((WINDOW_S / 3600)) h; supervisor stopped. RunPod pods may still be billing: ${pods:-check the console}. Log: tooling/.reports/session-restarts.log" || true
    return 1
  fi
  sleep "$PAUSE_S"
  return 0
}

if [[ "$LOOP" -eq 1 ]]; then
  cd "$REPO"
  ensure_keepalive
  if [[ -n "$WATCH_PID" ]]; then
    while kill -0 "$WATCH_PID" 2>/dev/null; do sleep 15; done
    if [[ -z "$(oom_line "$WATCH_PID")" ]]; then
      echo "claude pid $WATCH_PID ended with no OOM kill: a clean exit, supervisor done"; exit 0
    fi
    crash_and_maybe_restart 137 || exit 0
  else
    first=(claude)
    compgen -G "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/${REPO//\//-}/*.jsonl" >/dev/null && first=(claude --continue)
    set +e; "${first[@]}"; rc=$?; set -e
    (( rc == 0 )) && exit 0
    crash_and_maybe_restart "$rc" || exit 0
  fi
  while :; do
    set +e; claude -c; rc=$?; set -e
    (( rc == 0 )) && exit 0
    crash_and_maybe_restart "$rc" || exit 0
  done
fi

if [[ "$SUPERVISE" -eq 1 && "$ATTACH_EXISTING" -eq 1 ]]; then
  pid="$(repo_claude_pid)"
  [[ -n "$pid" ]] || { echo "No running Claude in $REPO to watch: start one with --supervise"; exit 1; }
  tmux has-session -t "=$SESSION" 2>/dev/null || { echo "No tmux session '$SESSION'"; exit 1; }
  tmux new-window -d -t "$SESSION:" -n supervise -c "$REPO" \
    "bash '$REPO/tooling/bootstrap/claude-session.sh' --loop --watch=$pid; exec bash -l"
  echo "supervise window added to '$SESSION', watching claude pid $pid"
  exit 0
fi

session_exists() {
  tmux has-session -t "=$SESSION" 2>/dev/null
}

attach_or_switch() {
  if [[ -n "${TMUX:-}" ]]; then
    exec tmux switch-client -t "$SESSION"
  fi
  exec tmux attach-session -t "$SESSION"
}

if session_exists; then
  attach_or_switch
fi

if [[ "$ATTACH_ONLY" -eq 1 ]]; then
  echo "No tmux session '$SESSION' yet. Run: bash tooling/bootstrap/claude-session.sh"
  exit 0
fi

# No tmux session. Check for a Claude process already running outside tmux
# with this repo as its cwd, so we never start a second one on the same
# conversation.
existing_pid=""
for pid in $(pgrep -u "$USER" -f '(^|/)claude( |$)' 2>/dev/null || true); do
  cwd_link="/proc/$pid/cwd"
  [[ -e "$cwd_link" ]] || continue
  cwd_real="$(readlink -f "$cwd_link" 2>/dev/null || true)"
  if [[ "$cwd_real" == "$REPO" ]]; then
    existing_pid="$pid"
    break
  fi
done

if [[ -n "$existing_pid" ]]; then
  echo "A Claude session is already running outside tmux (pid $existing_pid): finish or /exit it, then run this script again"
  # A DIFFERENT session name than $SESSION: this is a refusal, not the real
  # session, and it must never satisfy session_exists() on a later run — that
  # would attach to a shell-only session forever with no `claude` window,
  # even once the outside process is gone (a bug fixed 2026-09-26).
  refusal="${SESSION}-refusal"
  if ! tmux has-session -t "=$refusal" 2>/dev/null; then
    tmux start-server \; \
      set -g mouse on \; set -g history-limit 50000 \; \
      set -g status-left "[#S] " \; set -g status-left-length 20 \; set -g status-right "%H:%M %d-%b" \; \
      new-session -d -s "$refusal" -n shell -c "$REPO"
  fi
  if [[ -n "${TMUX:-}" ]]; then
    exec tmux switch-client -t "$refusal"
  fi
  exec tmux attach-session -t "$refusal"
fi

# Options go on first, in the same server call, so the first pane gets them too.
PROJECTS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/${REPO//\//-}"
CLAUDE_CMD="claude"
if compgen -G "$PROJECTS/*.jsonl" >/dev/null; then CLAUDE_CMD="claude --continue"; fi
if [[ "$SUPERVISE" -eq 1 ]]; then CLAUDE_CMD="bash '$REPO/tooling/bootstrap/claude-session.sh' --loop"; fi
ensure_keepalive

tmux start-server \; \
  set -g mouse on \; set -g history-limit 50000 \; \
  set -g status-left "[#S] " \; set -g status-left-length 20 \; set -g status-right "%H:%M %d-%b" \; \
  new-session -d -s "$SESSION" -n claude -c "$REPO" "$CLAUDE_CMD; exec bash -l" \; \
  new-window -d -t "$SESSION:" -n shell -c "$REPO"

attach_or_switch
