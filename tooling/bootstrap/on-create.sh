#!/usr/bin/env bash
# onCreateCommand: everything that needs no secret, so a Codespaces prebuild
# can bake it. Idempotent: each step leaves a marker in ~/.es-bootstrap/ and is
# skipped when its marker exists (delete the marker to redo a step).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MARK="$HOME/.es-bootstrap"
mkdir -p "$MARK"

step() {  # step <name> <command...>
  local name="$1"; shift
  if [[ -f "$MARK/$name.done" ]]; then
    echo "[on-create] $name: already done"
    return 0
  fi
  echo "[on-create] $name"
  "$@"
  date -u +%FT%TZ > "$MARK/$name.done"
}

link_tools() {
  [[ -d /opt/es-tools ]] || { echo "[on-create] /opt/es-tools missing: the image did not build the toolchain" >&2; return 1; }
  ln -sfn /opt/es-tools "$HOME/tools"
}

pip_install() {
  python3 -m pip install --no-cache-dir \
    -r "$REPO/tooling/world-generation/requirements-test.txt" \
    -r "$REPO/tooling/asset-pipeline/requirements.txt"
}

npm_install() {
  (cd "$REPO" && npm ci)
}

playwright_install() {
  (cd "$REPO" && npx playwright install --with-deps chromium)
}

# The VM's ~/tools/wine-pynifly-prefix is a plain `wineboot -i` prefix: no
# DLL overrides, no winetricks, no registry tweaks. PyNifly lives in the
# Blender tree (addons_core/io_scene_nifly, put there by the Dockerfile) and
# the pipeline's Blender scripts enable it by module name. So the prefix is
# wineboot, then one headless Blender run that enables the add-on, which also
# writes Blender's AppData the same way the VM's first run did.
# Wine, Blender and the prefix paths come from the pipeline's toolchain.json;
# the installed paths under /opt/es-tools follow the Dockerfile ARGs
# WINE_VERSION and BLENDER_VERSION, so a version bump changes both files.
toolchain_path() {  # toolchain_path <key>: the value with ~ expanded
  python3 -c 'import json, os, sys; print(os.path.expanduser(json.load(open(sys.argv[1]))[sys.argv[2]]))' \
    "$REPO/tooling/asset-pipeline/pipeline/config/toolchain.json" "$1"
}

wine_prefix() {
  local wine_exe blender prefix wine
  wine_exe="$(toolchain_path wine)"
  blender="$(toolchain_path blender)"
  prefix="$(toolchain_path winePrefix)"
  [[ -x "$wine_exe" ]] || { echo "[on-create] Wine not found at $wine_exe (toolchain.json key \"wine\"; Dockerfile ARG WINE_VERSION)" >&2; return 1; }
  [[ -f "$blender" ]] || { echo "[on-create] Blender not found at $blender (toolchain.json key \"blender\"; Dockerfile ARG BLENDER_VERSION)" >&2; return 1; }
  wine="$(dirname "$wine_exe")"
  export WINEPREFIX="$prefix" WINEDEBUG=-all
  xvfb-run -a "$wine/wineboot" -i
  "$wine/wineserver" -w
  local out
  out="$(xvfb-run -a "$wine_exe" "$blender" \
          --background --factory-startup --python-expr \
          "import bpy; bpy.ops.preferences.addon_enable(module='io_scene_nifly'); import io_scene_nifly; print('ES_PYNIFLY_OK', io_scene_nifly.bl_info['version'])" 2>&1)" || true
  "$wine/wineserver" -w
  if ! grep -q "ES_PYNIFLY_OK" <<<"$out"; then
    echo "$out" | tail -40 >&2
    echo "[on-create] Blender under Wine did not load io_scene_nifly" >&2
    return 1
  fi
  grep "ES_PYNIFLY_OK" <<<"$out"
}

step tools-link   link_tools
step pip          pip_install
step npm          npm_install
step playwright   playwright_install
step wine-prefix  wine_prefix
echo "[on-create] done"
