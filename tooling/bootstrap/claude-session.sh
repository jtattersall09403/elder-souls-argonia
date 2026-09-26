#!/usr/bin/env bash
# Claude Code in a tmux session that outlives the browser (owner 2026-09-26).
#
#   bash tooling/bootstrap/claude-session.sh    (or the `es` alias)
#
# Attaches to the session `es` if it exists, else creates it: window `claude`
# runs `claude --continue` (a fresh `claude` when this repo has no
# conversation to continue), window `shell` is a plain shell. Closing the browser tab or losing
# the connection only detaches the client; Claude keeps running. Ctrl-b d
# detaches on purpose; Ctrl-b n / Ctrl-b p switch windows. See README § Sessions.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION="${ES_TMUX_SESSION:-es}"

# `--continue` only when this repo has a conversation to continue (transcripts
# live under $CLAUDE_CONFIG_DIR/projects/<repo path with / as ->/).
PROJECTS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/${REPO//\//-}"
CLAUDE_CMD="claude"
if compgen -G "$PROJECTS/*.jsonl" >/dev/null; then CLAUDE_CMD="claude --continue"; fi

# Options go on first, in the same server call, so the first pane gets them too.
if ! tmux has-session -t "=$SESSION" 2>/dev/null; then
  tmux start-server \; \
    set -g mouse on \; set -g history-limit 50000 \; \
    set -g status-left "[#S] " \; set -g status-left-length 20 \; set -g status-right "%H:%M %d-%b" \; \
    new-session -d -s "$SESSION" -n claude -c "$REPO" "$CLAUDE_CMD; exec bash -l" \; \
    new-window -d -t "$SESSION:" -n shell -c "$REPO"
fi

if [[ -n "${TMUX:-}" ]]; then
  exec tmux switch-client -t "$SESSION"
fi
exec tmux attach-session -t "$SESSION"
