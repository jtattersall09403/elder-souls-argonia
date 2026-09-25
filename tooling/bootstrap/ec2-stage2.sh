#!/usr/bin/env bash
# ec2-stage2.sh, installed as /opt/es/stage2.sh by ec2-user-data.sh: the one
# command the owner types in the EC2 Instance Connect browser shell:
#
#   sudo -iu es bash /opt/es/stage2.sh
#
# It signs the VS Code tunnel in to GitHub (a device code to enter at
# github.com/login/device), then installs the tunnel as a systemd USER
# service of `es` (the only kind `code tunnel service install` makes on
# Linux; user-data enabled lingering, so it runs at boot with nobody logged
# in). Flags checked against `code tunnel --help` of CLI 1.139.1.
# Safe to re-run: login is skipped once signed in, the install replaces the
# service.
set -euo pipefail

NAME="${ES_TUNNEL_NAME:-es-argonia}"
[[ "$(id -un)" == es ]] || { echo "run this as es: sudo -iu es bash /opt/es/stage2.sh" >&2; exit 1; }
command -v code >/dev/null || { echo "the VS Code CLI is missing: user-data has not finished (look for /opt/es/USER-DATA-DONE)" >&2; exit 1; }

# `sudo -iu es` gives no session bus; the lingering user manager has one.
XDG_RUNTIME_DIR="/run/user/$(id -u)"
export XDG_RUNTIME_DIR
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
[[ -S "$XDG_RUNTIME_DIR/bus" ]] || { echo "no user session bus at $XDG_RUNTIME_DIR/bus: run 'sudo loginctl enable-linger es', wait 5 s, then re-run" >&2; exit 1; }

if code tunnel user show >/dev/null 2>&1; then
  echo "[stage2] the tunnel is already signed in to GitHub"
else
  echo "[stage2] Open the github.com address below, enter the code, approve."
  code tunnel user login --provider github
fi

code tunnel service install --accept-server-license-terms --name "$NAME"
sleep 5
code tunnel status || true
echo
echo "[stage2] done. Open https://vscode.dev/tunnel/$NAME"
