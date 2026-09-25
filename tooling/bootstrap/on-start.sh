#!/usr/bin/env bash
# postStartCommand: runs on every codespace start. The one place that derives
# ES_TUNNEL_URL (from ES_STUDIO_PORT and the codespace name): it replaces its
# block in ~/.bashrc (read by every interactive shell, VS Code terminals
# included) and sets env.ES_TUNNEL_URL / env.ES_STUDIO_PORT in the repo's
# gitignored .claude/settings.local.json (merged, every other key kept;
# created, mode 600, when absent). It never touches $CLAUDE_CONFIG_DIR, which
# the claude-home snapshot part owns.
# Warns when rtk, which the global Claude hook calls, is missing. Before all
# that it starts the CPU watchdog (tooling/repo-standards/cpu_watchdog.sh, one
# instance per machine) and runs cache-links.sh (the mod pool, mesh cache and
# builds on /tmp).
set -euo pipefail

say() { echo "[on-start] $*"; }

# First, on any machine: the CPU watchdog (owner ruling 2026-09-25, after two
# crashes at 100 % CPU). It pauses the heaviest processes while the machine is
# saturated and clears stale ones, with no agent involved; a second start is a
# no-op (flock). A failure is reported and the start goes on.
bash "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../repo-standards/cpu_watchdog.sh" --start || say "WARNING: cpu_watchdog.sh failed to start (exit $?)"

# First, on any machine: the mod pool, mesh cache and builds onto the /tmp
# volume (a no-op where /tmp shares the dev root's volume). A failure is
# reported and the start goes on.
bash "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/cache-links.sh" || say "WARNING: cache-links.sh failed (exit $?); the mod pool stays where it is"

if [[ -z "${CODESPACE_NAME:-}" || -z "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]]; then
  say "not in a codespace (no CODESPACE_NAME); leaving ES_TUNNEL_URL alone"
  exit 0
fi
PORT="${ES_STUDIO_PORT:-8081}"
URL="https://${CODESPACE_NAME}-${PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"

BEGIN="# >>> elder-souls codespace env >>>"
END="# <<< elder-souls codespace env <<<"
# Replace the block on every start (the port or codespace name may change):
# drop any old block between the markers, then append the current one.
RC="$HOME/.bashrc"
touch "$RC"
RC_TMP="$(mktemp "$RC.XXXXXX")"
awk -v b="$BEGIN" -v e="$END" '$0==b{skip=1; next} skip&&$0==e{skip=0; next} !skip' "$RC" > "$RC_TMP"
{
  echo "$BEGIN"
  echo "export ES_STUDIO_PORT=\"$PORT\""
  echo "export ES_TUNNEL_URL=\"$URL\""
  echo "$END"
} >> "$RC_TMP"
chmod --reference="$RC" "$RC_TMP"
mv "$RC_TMP" "$RC"
say "wrote ES_TUNNEL_URL and ES_STUDIO_PORT to ~/.bashrc"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SETTINGS="$REPO/.claude/settings.local.json"
mkdir -p "$(dirname "$SETTINGS")"
python3 - "$SETTINGS" "$URL" "$PORT" <<'PY'
import json, os, sys, tempfile
path, url, port = sys.argv[1:4]
data = {}
mode = 0o600
if os.path.exists(path):
    with open(path) as f:
        data = json.load(f)
    mode = os.stat(path).st_mode & 0o777
env = data.setdefault("env", {})
if os.path.exists(path) and env.get("ES_TUNNEL_URL") == url and env.get("ES_STUDIO_PORT") == port:
    sys.exit(0)
env["ES_TUNNEL_URL"] = url
env["ES_STUDIO_PORT"] = port
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
with os.fdopen(fd, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
os.chmod(tmp, mode)
os.replace(tmp, path)
print(f"[on-start] set env.ES_TUNNEL_URL and env.ES_STUDIO_PORT in {path}")
PY

command -v rtk >/dev/null || say "WARNING: rtk is not on PATH; the global Claude hook 'rtk hook claude' will fail (the image installs it to /usr/local/bin)"
