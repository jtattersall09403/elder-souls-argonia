#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/analyticalplatform/workspace/elder-scrolls-asset-pipeline"
TOOLS="/home/analyticalplatform/tools"

WINE="$TOOLS/wine-11.13-amd64-wow64/bin/wine"
WINEPATH="$TOOLS/wine-11.13-amd64-wow64/bin/winepath"
BLENDER="$TOOLS/blender-4.4.3-windows-x64/blender.exe"

export WINEPREFIX="$TOOLS/wine-pynifly-prefix"
export WINEDEBUG=-all

ASSETS="$ROOT/skyrim-source/extracted/dunmer-source/meshes/actors/character/character assets"

export SKEL="$($WINEPATH -w "$ROOT/skyrim-source/extracted/hkx-skeleton/skeleton.hkx")"

export BODY="$($WINEPATH -w "$ASSETS/malebody_1.nif")"
export HANDS="$($WINEPATH -w "$ASSETS/malehands_1.nif")"
export FEET="$($WINEPATH -w "$ASSETS/malefeet_1.nif")"
export HEAD="$($WINEPATH -w "$ASSETS/malehead.nif")"
export EYES="$($WINEPATH -w "$ASSETS/eyesmale.nif")"
export MOUTH="$($WINEPATH -w "$ASSETS/mouth/mouthhuman.nif")"

export RACE_TRI="$($WINEPATH -w "$ROOT/skyrim-source/extracted/racemorphs/meshes/actors/character/character assets/maleheadraces.tri")"

export ROLL="$($WINEPATH -w "$ROOT/skyrim-source/extracted/animation-tests/sneakrun_forwardroll.hkx")"

export OUT="$($WINEPATH -w "$ROOT/output/proof-rebuilt-dunmer-roll.blend")"

SCRIPT="$($WINEPATH -w "$ROOT/prototypes/pynifly/rebuild_proof.py")"

timeout 120s \
  "$WINE" "$BLENDER" \
  --background \
  --python "$SCRIPT" \
  2>&1 | sed -n '/SUMMARY_BEGIN/,/SUMMARY_END/p'
