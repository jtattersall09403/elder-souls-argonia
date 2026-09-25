#!/usr/bin/env bash
# onCreateCommand: only fast, non-interactive installs that need no secret, so
# a Codespaces prebuild can bake them and nothing can hold the codespace in
# "Provisioning". The Wine prefix and the toolchain/cache pulls are in
# first-run.sh, run by hand from a terminal. Idempotent: each step leaves a
# marker in ~/.es-bootstrap/ and is skipped when its marker exists (delete the
# marker to redo a step). Log: /workspaces/.es-bootstrap/on-create.log.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source-path=SCRIPTDIR source=steps.sh
source "$REPO/tooling/bootstrap/steps.sh"
steps_init on-create on-create.log
cd "$REPO"

link_tools() {
  [[ -d /opt/es-tools ]] || { echo "[on-create] /opt/es-tools missing: expected in the codespace image (.devcontainer/Dockerfile builds the toolchain there)" >&2; return 1; }
  ln -sfn /opt/es-tools "$HOME/tools"
}

step tools-link  1m  link_tools
step pip         15m python3 -m pip install --no-input --no-cache-dir \
                       -r tooling/world-generation/requirements-test.txt \
                       -r tooling/asset-pipeline/requirements.txt
step npm         20m npm ci --no-audit --no-fund
# --with-deps apt-installs Chromium's libraries through sudo (passwordless
# for the codespace user; with stdin at /dev/null a password prompt would fail,
# not wait); DEBIAN_FRONTEND is exported by steps_init.
step playwright  15m npx --yes playwright install --with-deps chromium
log "done. Before kit, settlement or chain work run: bash tooling/bootstrap/first-run.sh"
