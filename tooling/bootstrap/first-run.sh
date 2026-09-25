#!/usr/bin/env bash
# first-run.sh: run once by hand from a codespace terminal (after post-create
# has finished) before kit, settlement or chain work. It builds the Wine prefix
# for Blender+PyNifly, pulls the toolchain tier (vanilla Skyrim) and the cache
# tier (raw kit GLBs, builds, mesh cache), then prints disk use and a summary.
# Idempotent: the prefix step leaves a marker in ~/.es-bootstrap/ (delete it to
# redo); vault-pull.sh skips the parts it already holds. Log:
# /workspaces/.es-bootstrap/first-run.log.
#
# The VM's ~/tools/wine-pynifly-prefix is a plain `wineboot -i` prefix: no
# DLL overrides, no winetricks, no registry tweaks, no Wine Mono or Gecko.
# PyNifly lives in the Blender tree (addons_core/io_scene_nifly, put there by
# the Dockerfile) and the pipeline's Blender scripts enable it by module name.
# So the prefix is wineboot, then one headless Blender run that proves the
# add-on loads.
# Everything runs with no display, as build_kit.py runs Blender: with a display
# wineboot would open the Wine Mono / Gecko install dialogs and wait for a
# click, so WINEDLLOVERRIDES="mscoree,mshtml=" skips both (the VM prefix has
# neither). Wine, Blender and the prefix paths come from the pipeline's
# toolchain.json; the installed paths under /opt/es-tools follow the
# Dockerfile ARGs WINE_VERSION and BLENDER_VERSION.
set -euo pipefail

SELF="$(readlink -f "${BASH_SOURCE[0]}")"
REPO="$(cd "$(dirname "$SELF")/../.." && pwd)"
TOOLCHAIN="$REPO/tooling/asset-pipeline/pipeline/config/toolchain.json"

toolchain_path() {  # toolchain_path <key>: the value with ~ expanded
  python3 -c 'import json, os, sys; print(os.path.expanduser(json.load(open(sys.argv[1]))[sys.argv[2]]))' \
    "$TOOLCHAIN" "$1"
}

wine_prefix() {  # the prefix build; run through `step`, so under its timeout
  local wine_exe blender out rc=0
  wine_exe="$(toolchain_path wine)"
  blender="$(toolchain_path blender)"
  [[ -x "$wine_exe" ]] || { echo "Wine not found at $wine_exe (toolchain.json key \"wine\"; Dockerfile ARG WINE_VERSION)" >&2; return 1; }
  [[ -f "$blender" ]] || { echo "Blender not found at $blender (toolchain.json key \"blender\"; Dockerfile ARG BLENDER_VERSION)" >&2; return 1; }
  WINE_BIN="$(dirname "$wine_exe")"  # global: the EXIT trap reads it
  export WINEPREFIX="${ES_WINE_PREFIX:-$(toolchain_path winePrefix)}" WINEDEBUG=-all WINEDLLOVERRIDES="mscoree,mshtml="
  unset DISPLAY WAYLAND_DISPLAY
  trap '"$WINE_BIN/wineserver" -k 2>/dev/null || true' EXIT
  echo "  wineboot -i into $WINEPREFIX"
  timeout 240 "$WINE_BIN/wineboot" -i
  timeout 120 "$WINE_BIN/wineserver" -w
  echo "  Blender under Wine: enabling io_scene_nifly"
  out="$(timeout 240 "$wine_exe" "$blender" \
          --background --factory-startup --python-expr \
          "import bpy; bpy.ops.preferences.addon_enable(module='io_scene_nifly'); import io_scene_nifly; print('ES_PYNIFLY_OK', io_scene_nifly.bl_info['version'])" 2>&1)" || rc=$?
  timeout 120 "$WINE_BIN/wineserver" -w || true
  if ! grep -q "ES_PYNIFLY_OK" <<<"$out"; then
    echo "$out" | tail -40 >&2
    echo "Blender under Wine did not load io_scene_nifly (exit $rc)" >&2
    return 1
  fi
  grep "ES_PYNIFLY_OK" <<<"$out"
}

if [[ "${1:-}" == --wine-prefix ]]; then wine_prefix; exit; fi

# shellcheck source-path=SCRIPTDIR source=steps.sh
source "$REPO/tooling/bootstrap/steps.sh"
steps_init first-run first-run.log
[[ -f "$HOME/.config/rclone/rclone.conf" ]] \
  || { log "FAILED: no rclone remote; post-create.sh has not finished (re-run: bash tooling/bootstrap/post-create.sh)" >&2; exit 1; }

# 15m: above the sum of the inner limits (240 + 120 + 240 + 120 s).
step wine-prefix 15m bash "$SELF" --wine-prefix
# Big downloads; rclone's own idle timeout (5 min) and retries bound a stall.
step --always vault-pull 120m bash "$REPO/tooling/bootstrap/vault-pull.sh" --tier toolchain --tier cache

log "disk use:"
df -h /workspaces "$HOME" | sort -u
bash "$REPO/tooling/bootstrap/vault-pull.sh" --free
log "ready: Wine prefix ${ES_WINE_PREFIX:-$(toolchain_path winePrefix)} (Blender loads io_scene_nifly), toolchain and cache tiers pulled. Kit, settlement and chain work can start."
