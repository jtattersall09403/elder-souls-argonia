#!/usr/bin/env bash
# The terrain rebuild chain — THE single place the stage order lives.
#
# Any worldgen change that moves the ground moves everything derived from it
# (routes, structures, chunks, water, land cover, scatter). The order below is
# the one decision 0025 records; if it changes, change it HERE and point at
# this script, so a doc and a run cannot drift apart.
#
#   ./scripts/terrain-chain.sh                 # whole chain, skipping what is unchanged
#   ./scripts/terrain-chain.sh --force         # rebuild every stage regardless
#   ./scripts/terrain-chain.sh --from grade_routes    # resume at a stage
#   ./scripts/terrain-chain.sh --list          # stages, in order
#
# Run from tooling/world-generation. A full forced rebuild is roughly six
# minutes; a re-run with nothing changed is seconds.
#
# INCREMENTAL. Each stage is run through `worldgen.chain_stages`, which
# fingerprints the stage's code (its module and every worldgen module it
# imports) and the files it read and wrote last time, and prints
# `skip (unchanged)` instead of running when all three still match. Change
# only the water compiler and only the water stage and its dependants re-run;
# the sculpt and the refine are left alone. The book lives in
# `chain-stamps.json` in the vault heightfield directory. `--force` ignores it.
#
# `ES_VAULT_ROOT` points the whole chain at a different copy of the vault's
# `argonia-heightfield` directory (a scratch copy for benchmarking, a second
# worktree building at the same time). VAULT below follows it.
#
# `grade_routes` runs twice on purpose: the first pass MEASURES the stretches
# no 30 deg bench can carry, `author_route_structures` turns them into decks,
# spans and flights, and the second pass grades again with those windows
# excluded (the ground inside them is left alone for the placed piece).
# `compile_water` also runs twice: first straight after the carve, so the
# grader sees THIS run's channels and lakes (every wet sample is a crossing it
# leaves alone, no fill into open water) and the `water/natural` snapshot is
# this run's pre-grading water; then last, on the graded ground that ships.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# Stages that need paths rather than defaults. `sculpt_province` and
# `refine_province` take the vault heightfield (and the hydrology pass).
VAULT="${VAULT:-${ES_VAULT_ROOT:-$HOME/workspace/elder-souls-dev/elder-scrolls-asset-pipeline/skyrim-source/mod-sources/tamriel-worldspaces-118678/extracted/Argonia Worldspace/argonia-heightfield}}"
declare -A STAGE_ARGS=(
  [sculpt_province]="$VAULT/heightfield-f32.npy"
  [refine_province]="$VAULT/heightfield-f32.npy|$VAULT/hydrology-pass1.npz"
  # The vegetation bundles are downstream of the ground: without --out the
  # scatter compiler only reports, and the committed bundles stay stale after
  # the terrain moves.
  [compile_scatter]="--out|$REPO_ROOT/apps/world-studio/public/province/vegetation"
)

STAGES=(
  "sculpt_province"
  "refine_province"
  "compile_water"
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
force=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) printf '%s\n' "${STAGES[@]}"; exit 0 ;;
    --force) force="--force"; shift ;;
    --from) from="${2:?--from needs a stage name}"; shift 2 ;;
    *) echo "usage: $0 [--from <stage>] [--force] [--list]" >&2; exit 2 ;;
  esac
done

if [[ -n "$from" ]]; then
  printf '%s\n' "${STAGES[@]}" | grep -qx "$from" \
    || { echo "unknown stage: $from" >&2; exit 2; }
fi

CHAIN_TIMES="$(mktemp)"
export CHAIN_TIMES
# Printed from the EXIT trap, so a chain that stops on a failing stage still
# shows what ran and what it cost.
summary() {
  printf '\n%-26s %9s  %s\n' "stage" "seconds" "state"
  local total=0
  while IFS='|' read -r name seconds state; do
    printf '%-26s %9s  %s\n' "$name" "$seconds" "$state"
    total=$(python3 -c "print(f'{$total + $seconds:.1f}')")
  done < "$CHAIN_TIMES"
  printf '%-26s %9s\n' "total" "$total"
  rm -f "$CHAIN_TIMES"
}
trap summary EXIT

started=0
index=0
for stage in "${STAGES[@]}"; do
  index=$((index + 1))
  # `grade_routes` appears twice with different inputs, so the stamp is keyed
  # by position as well as name.
  key=$(printf '%02d-%s' "$index" "$stage")
  if [[ -n "$from" && $started -eq 0 ]]; then
    [[ "$stage" == "$from" ]] && started=1 || continue
  fi
  echo "=== $stage ==="
  args=()
  if [[ -n "${STAGE_ARGS[$stage]:-}" ]]; then
    IFS='|' read -r -a args <<< "${STAGE_ARGS[$stage]}"
  fi
  python3 -m worldgen.chain_stages run $force "$key" "$stage" "${args[@]}"
done
