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
# Closing the browser tab or losing the connection only detaches the client;
# Claude keeps running. Ctrl-b d detaches on purpose; Ctrl-b n / Ctrl-b p
# switch windows. See README § Sessions.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION="${ES_TMUX_SESSION:-es}"

ATTACH_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --attach-only) ATTACH_ONLY=1 ;;
  esac
done

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

tmux start-server \; \
  set -g mouse on \; set -g history-limit 50000 \; \
  set -g status-left "[#S] " \; set -g status-left-length 20 \; set -g status-right "%H:%M %d-%b" \; \
  new-session -d -s "$SESSION" -n claude -c "$REPO" "$CLAUDE_CMD; exec bash -l" \; \
  new-window -d -t "$SESSION:" -n shell -c "$REPO"

attach_or_switch
