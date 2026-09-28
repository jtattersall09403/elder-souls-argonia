#!/usr/bin/env bash
# install_hooks.sh: link the tracked git hooks in tooling/repo-standards/hooks/
# into this checkout's hooks dir, and add the nightly backup to the user's
# crontab (once; only where cron runs). Idempotent and quiet; the SessionStart
# hook in .claude/settings.json runs it every session.
#   pre-push     -> tooling/bootstrap/backup_changed.sh in the background
#   post-commit  -> owner_inbox.py --from-progress --if-changed (PROGRESS.md commits)
#   crontab      17 3 * * * <repo>/tooling/bootstrap/backup_changed.sh
# A hook file that is not our link is left alone and reported.
set -uo pipefail
repo="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
hooks_dir="$(git -C "$repo" rev-parse --git-path hooks 2>/dev/null)" || exit 0
[[ "$hooks_dir" = /* ]] || hooks_dir="$repo/$hooks_dir"
mkdir -p "$hooks_dir"
for src in "$repo"/tooling/repo-standards/hooks/*; do
  name="$(basename "$src")"; dst="$hooks_dir/$name"
  [[ "$name" == *.* ]] && continue   # a Claude hook script (preflight_guard.py), not a git hook
  if [[ -L "$dst" && "$(readlink -f "$dst")" == "$src" ]]; then continue; fi
  if [[ -e "$dst" || -L "$dst" ]]; then echo "install_hooks: $dst exists and is not ours; left alone" >&2; continue; fi
  ln -sfn "$src" "$dst"
done
line="17 3 * * * $repo/tooling/bootstrap/backup_changed.sh"
if command -v crontab >/dev/null 2>&1 && pgrep -x cron >/dev/null 2>&1; then
  if ! crontab -l 2>/dev/null | grep -qF "$repo/tooling/bootstrap/backup_changed.sh"; then
    { crontab -l 2>/dev/null; echo "$line"; } | crontab -
  fi
fi
exit 0
