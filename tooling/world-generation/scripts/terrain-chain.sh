#!/usr/bin/env bash
# The terrain rebuild chain — THE single place the stage order lives.
#
# Any worldgen change that moves the ground moves everything derived from it
# (routes, structures, chunks, water, land cover, scatter). The order below is
# the one decision 0025 records; if it changes, change it HERE and point at
# this script, so a doc and a run cannot drift apart.
#
#   ./scripts/terrain-chain.sh                 # whole chain
#   ./scripts/terrain-chain.sh --from grade_routes    # resume at a stage
#   ./scripts/terrain-chain.sh --list          # stages, in order
#
# Run from tooling/world-generation. Takes roughly ten minutes end to end.
# `grade_routes` runs twice on purpose: the first pass MEASURES the stretches
# no 30 deg bench can carry, `author_route_structures` turns them into decks,
# spans and flights, and the second pass grades again with those windows
# excluded (the ground inside them is left alone for the placed piece).
set -euo pipefail

# Stages that need paths rather than defaults. `refine_province` takes the
# vault heightfield and the hydrology pass; VAULT can be overridden.
VAULT="${VAULT:-$HOME/workspace/elder-souls-dev/elder-scrolls-asset-pipeline/skyrim-source/mod-sources/tamriel-worldspaces-118678/extracted/Argonia Worldspace/argonia-heightfield}"
declare -A STAGE_ARGS=(
  [refine_province]="$VAULT/heightfield-f32.npy|$VAULT/hydrology-pass1.npz"
)

STAGES=(
  "sculpt_province"
  "refine_province"
  "routes"
  "reroute_majors"
  "compile_minor_routes"
  "grade_routes"
  "author_route_structures"
  "grade_routes"
  "compile_chunks"
  "export_web_chunks"
  "compile_water"
  "rebake_landcover"
  "compile_scatter"
)

from=""
case "${1:-}" in
  --list) printf '%s\n' "${STAGES[@]}"; exit 0 ;;
  --from) from="${2:?--from needs a stage name}" ;;
  "") ;;
  *) echo "usage: $0 [--from <stage>] [--list]" >&2; exit 2 ;;
esac

if [[ -n "$from" ]]; then
  printf '%s\n' "${STAGES[@]}" | grep -qx "$from" \
    || { echo "unknown stage: $from" >&2; exit 2; }
fi

started=0
for stage in "${STAGES[@]}"; do
  if [[ -n "$from" && $started -eq 0 ]]; then
    [[ "$stage" == "$from" ]] && started=1 || continue
  fi
  echo "=== $stage ==="
  if [[ -n "${STAGE_ARGS[$stage]:-}" ]]; then
    IFS='|' read -r -a args <<< "${STAGE_ARGS[$stage]}"
    python3 -m "worldgen.$stage" "${args[@]}"
  else
    python3 -m "worldgen.$stage"
  fi
done
