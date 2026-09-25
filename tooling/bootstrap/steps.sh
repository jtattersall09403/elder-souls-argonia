# shellcheck shell=bash
# steps.sh: the step runner on-create.sh and first-run.sh share (source it).
#
#   steps_init <tag> <log-name>   every later line of the script goes to stdout
#                                 and to /workspaces/.es-bootstrap/<log-name>
#                                 (ES_BOOTSTRAP_LOG_DIR overrides; falls back to
#                                 ~/.es-bootstrap when that is not writable), and
#                                 the non-interactive environment is exported
#   step [--always] <name> <timeout> <command...>
#                                 runs the command (a program or a function of
#                                 the calling script) under `timeout`, stdin from
#                                 /dev/null, logging start, end, exit code and
#                                 seconds; skipped when ~/.es-bootstrap/<name>.done
#                                 exists (delete it to redo; --always never skips
#                                 and writes no marker). A failure or a timeout
#                                 stops the script with a line naming the step.
#   log <message>                 one timestamped line

log() { echo "[$STEP_TAG $(date -u +%FT%TZ)] $*"; }

steps_init() {  # steps_init <tag> <log-name>
  STEP_TAG="$1"
  MARK="$HOME/.es-bootstrap"
  mkdir -p "$MARK"
  local dir="${ES_BOOTSTRAP_LOG_DIR:-/workspaces/.es-bootstrap}"
  if ! { mkdir -p "$dir" 2>/dev/null && [[ -w "$dir" ]]; }; then dir="$MARK"; fi
  STEP_LOG="$dir/$2"
  exec > >(tee -a "$STEP_LOG") 2>&1
  # Nothing here may wait for a person: no TTY exists during onCreateCommand.
  export DEBIAN_FRONTEND=noninteractive PIP_NO_INPUT=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    GIT_TERMINAL_PROMPT=0 npm_config_yes=true
  log "start; log: $STEP_LOG"
}

step() {  # step [--always] <name> <timeout> <command...>
  local always=0
  if [[ "$1" == --always ]]; then always=1; shift; fi
  local name="$1" limit="$2"; shift 2
  if (( ! always )) && [[ -f "$MARK/$name.done" ]]; then
    log "$name: already done ($(cat "$MARK/$name.done")); delete $MARK/$name.done to redo"
    return 0
  fi
  log "$name: start (timeout $limit)"
  local t0=$SECONDS rc=0
  if declare -F "$1" >/dev/null; then
    # A shell function: `timeout` runs programs only, so it runs in a child
    # bash that gets every function this script defined.
    timeout --kill-after=30s "$limit" bash -c "$(declare -f); set -euo pipefail; $(printf '%q ' "$@")" </dev/null || rc=$?
  else
    timeout --kill-after=30s "$limit" "$@" </dev/null || rc=$?
  fi
  log "$name: end, exit $rc, $((SECONDS - t0)) s"
  if (( rc == 124 || rc == 137 )); then
    log "FAILED: step '$name' timed out after $limit" >&2
    exit 1
  elif (( rc != 0 )); then
    log "FAILED: step '$name' exited $rc" >&2
    exit "$rc"
  fi
  (( always )) || date -u +%FT%TZ > "$MARK/$name.done"
}
