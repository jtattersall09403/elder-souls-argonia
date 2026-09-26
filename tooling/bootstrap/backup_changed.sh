#!/usr/bin/env bash
# backup_changed.sh: the automatic incremental backup to R2. It runs
# snapshot-vault.sh's default mode (every part in its catalogue, each skipped
# when its sourceFingerprint, the sorted path+size+mtime list of its files,
# matches the manifest), so the part list, the fingerprint and the upload path
# exist once, in snapshot-vault.sh and lib.sh. On top it adds:
#   - one run at a time (flock on /tmp/es-backup.lock; a second run says
#     "already running" and exits 0);
#   - the heavy slot (tooling/repo-standards/job_guard.sh);
#   - a log per run in tooling/.reports/backup/<UTC>.log and a summary in
#     tooling/.reports/backup/last.json {started, finished, partsChecked,
#     partsUploaded, bytes, failures};
#   - the manifest itself uploaded to <prefix>manifest.json, so a restore
#     never needs git;
#   - the manifest committed by pathspec when it changed, only when nobody
#     else has staged changes (else it stays modified and the log says so).
# Secrets never reach the bucket: lib.sh es_drop_secrets filters every part's
# file list (test_backup_changed.py proves it).
# Triggers: the pre-push hook and a nightly crontab line, both installed by
# tooling/repo-standards/install_hooks.sh. tooling/bootstrap/README.md § Backups.
#
# Usage:
#   backup_changed.sh             upload the parts whose files changed
#   backup_changed.sh --dry-run   list the parts that would upload, upload nothing
#   backup_changed.sh --check     exit 1 if any part differs from the manifest
# Env: ES_BACKUP_LOCK (lock file), ES_BACKUP_NO_GUARD=1 (skip job_guard: tests),
# plus everything snapshot-vault.sh reads (RCLONE, ES_DEVROOT, ...).
set -uo pipefail

HERE="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$HERE/lib.sh"
es_paths
# cron starts with a bare environment: the Claude config dir is the one the
# toolchain exports (install-toolchain.sh), not ~/.claude.
if [[ -z "${CLAUDE_CONFIG_DIR:-}" && -d "$DEVROOT/.claude-home" ]]; then export CLAUDE_CONFIG_DIR="$DEVROOT/.claude-home"; fi
export PATH="$HOME/.local/bin:$PATH"

MODE=run
case "${1:-}" in
  "") ;;
  --dry-run) MODE=dry ;;
  --check) MODE=check ;;
  -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
  *) echo "unknown argument: $1" >&2; exit 2 ;;
esac

LOCK="${ES_BACKUP_LOCK:-/tmp/es-backup.lock}"
exec 9>"$LOCK"
if ! flock -n 9; then echo "backup_changed: already running"; exit 0; fi

REPORTS="$REPO/tooling/.reports/backup"
mkdir -p "$REPORTS"
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOGF="$REPORTS/$(date -u +%Y-%m-%dT%H%M%SZ)${MODE/run/}.log"
SNAP=(bash "$HERE/snapshot-vault.sh")
[[ "$MODE" == run ]] || SNAP+=(--dry-run)
if [[ -z "${ES_BACKUP_NO_GUARD:-}" ]]; then
  SNAP=(bash "$REPO/tooling/repo-standards/job_guard.sh" backup -- "${SNAP[@]}")
fi
"${SNAP[@]}" >"$LOGF" 2>&1
rc=$?

if [[ "$MODE" != run ]]; then
  mapfile -t would < <(sed -nE 's/^\[[0-9:]+\] would upload ([^ ]+) .*/\1/p' "$LOGF")
  for id in "${would[@]}"; do echo "would upload $id"; done
  echo "backup_changed: ${#would[@]} part(s) differ from the manifest (log $LOGF)"
  (( rc == 0 )) || { echo "backup_changed: snapshot-vault.sh --dry-run exited $rc" >&2; exit 2; }
  [[ "$MODE" == check && ${#would[@]} -gt 0 ]] && exit 1
  exit 0
fi

say() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >> "$LOGF"; }
failures=$( { sed -nE 's/^\[[0-9:]+\] (FAIL|refuse) ([^ :]+).*/\2/p' "$LOGF"
              sed -nE 's/^\[[0-9:]+\] refuse: interrupted vault-pull of: (.*)\(re-run.*/\1/p' "$LOGF" | tr ' ' '\n' | sed '/^$/d; s/^/interrupted-pull:/'
            } | sort -u | paste -sd' ' -)
(( rc == 0 )) || [[ -n "$failures" ]] || failures="snapshot-vault.sh exit $rc"

# The manifest to the bucket (a restore reads it there without git).
if (( rc == 0 )); then
  read -r BUCKET PREFIX < <(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["bucket"], d["prefix"])' "$MANIFEST")
  RC_BIN="${RCLONE:-rclone}"
  if "$RC_BIN" copyto "$MANIFEST" "r2:$BUCKET/${PREFIX}manifest.json" >> "$LOGF" 2>&1; then
    say "manifest uploaded to r2:$BUCKET/${PREFIX}manifest.json"
  else
    say "FAIL manifest upload"; failures="${failures:+$failures }manifest"
  fi
fi

# Commit the manifest by pathspec, never over someone else's staged work.
rel="${MANIFEST#"$REPO"/}"
if git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1 && ! git -C "$REPO" diff --quiet -- "$rel" 2>/dev/null; then
  if git -C "$REPO" diff --cached --quiet; then
    if git -C "$REPO" commit -q -m "Vault snapshot manifest (auto-backup $(date -u +%Y-%m-%d))" -- "$rel" >> "$LOGF" 2>&1; then
      say "manifest committed: $(git -C "$REPO" rev-parse --short HEAD)"
    else
      say "manifest commit failed; left modified"
    fi
  else
    say "manifest changed but the index holds someone else's staged changes: left modified, not committed"
  fi
fi

python3 - "$LOGF" "$REPORTS/last.json" "$STARTED" "$failures" <<'PY'
import datetime, json, re, sys
log, out, started, failures = sys.argv[1:5]
text = open(log, encoding="utf-8", errors="replace").read()
checked = set(re.findall(r"^\[[\d:]+\] (?:skip|start|refuse|FAIL) ([^ :]+)", text, re.M))
done = re.findall(r"^\[[\d:]+\] done ([^ :]+): (\d+) bytes", text, re.M)
summary = {
    "started": started,
    "finished": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "partsChecked": len(checked | {d[0] for d in done}),
    "partsUploaded": len(done),
    "bytes": sum(int(b) for _, b in done),
    "failures": failures.split() if failures else [],
    "log": log,
}
json.dump(summary, open(out, "w"), indent=2)
print("backup_changed: %(partsUploaded)d of %(partsChecked)d part(s) uploaded, %(bytes)d bytes, failures %(failures)s" % summary)
PY
[[ -z "$failures" ]]
