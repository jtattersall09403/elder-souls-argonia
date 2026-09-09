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
#   ./scripts/terrain-chain.sh --footprint     # force the LOCAL edit fast path
#   ./scripts/terrain-chain.sh --full          # force the whole chain
#   ./scripts/terrain-chain.sh --allow-sculpt  # let the sculpt re-run (rare)
#   ./scripts/terrain-chain.sh --steal-lock    # take a lock a dead run left
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
# THE LOCAL-EDIT FAST PATH, and when it is chosen. A plain run TAKES IT BY
# DEFAULT when it can prove it applies: `chain_stages local-carve-only` compares
# every input and output of the recorded `refine_province` against disk, and
# says yes only when the sole change is one of the two bounded carves below,
# with the terrain code untouched and a carve snapshot on disk. Anything else —
# a changed module, a changed hydrology, no previous full run — takes the whole
# chain. `--footprint` forces the fast path and `--full` forbids it, and both
# print which path they took and why.
#
# The fast path applies when the ONLY thing you changed is one of the two
# carves that touch a bounded patch of ground:
#
#   * a blueprint dock's hullClass / position / networkTerminals entry
#     (worldgen/dock_dredge.py), or
#   * a line in world/sources/routes/authored-minor-waterways.json
#     (worldgen/authored_waterways.py).
#
# It skips `refine_province` (which re-derives the whole 4033 x 4033 province
# for a 172 m dredge), `reroute_majors` and `compile_minor_routes`, and instead
# runs `recarve_local`: it restarts from the snapshot refine leaves at the
# local-carve boundary, re-applies just those carves, and reports the changed
# region. `compile_chunks`, `export_web_chunks` and `compile_scatter` then redo
# only the tiles that intersect it. Everything else runs exactly as it does in
# the full chain, in the same order, so grading, structures, pads and both
# water solves see the same ground they always did.
#
# A HAND-AUTHORED ROUTE LINE (world/sources/routes/authored-routes.json) is
# deliberately NOT on that list. It moves route geometry, and the fast path
# elides both route solves, so the guard would have nothing to check. It would
# also buy nothing: the solves cost 13.2 s and 11.4 s, a route edit has to run
# both either way, and a plain run already skips the frozen sculpt and
# `refine_province` on the stamp book. Change a road line, run this script
# normally.
#
# It is NOT valid for anything else, and it will not pretend otherwise:
# `recarve_local` checks the snapshot against the refined heightfield outside
# the last footprint and EXITS if anything upstream moved. Anything touching
# the sculpt, the hydrology, the region or climate fields, the fluvial pass,
# the typed terrain requests, the channel solve, the route networks or the
# grader must take the slow path. When in doubt, take the slow path: it is six
# minutes, and a wrong province is not.
#
# `compile_water` (a province-wide flood solve) and `rebake_landcover` (one
# province-wide control raster off one rng stream) are whole-province in both
# modes and are the floor on the fast path's cost — see their module docs.
#
# THE LOCK. Two agents share this working tree and both run this script. Two
# chains writing `refined-height-f32.npy` and the water rasters at the same
# time silently produce a province that is neither run's output, so a run
# takes `chain.lock` in the vault heightfield directory (beside
# `chain-stamps.json`) and releases it from the EXIT trap, including on
# failure. A second run says who holds the lock and how long they have had it,
# and stops. If a run died hard and left the lock behind, `--steal-lock` takes
# it; nothing else does, on purpose.
#
# `grade_routes` runs twice on purpose: the first pass MEASURES the stretches
# no 30 deg bench can carry, `author_route_structures` turns them into decks,
# spans and flights, and the second pass grades again with those windows
# excluded (the ground inside them is left alone for the placed piece).
# `compile_water` also runs twice: first straight after the carve, so the
# grader sees THIS run's channels and lakes (every wet sample is a crossing it
# leaves alone, no fill into open water) and the `water/natural` snapshot is
# this run's pre-grading water; then last, on the graded ground that ships.
# `grade_settlement_pads` runs after the final route grade: parcel integration
# keeps roads out of building footprints, then pads become part of the exact
# surface consumed by chunks, final water and terrain postconditions.
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
  # The bundle is only delivery once the kit GLBs it names are in the site the
  # browser fetches; without this the runtime asks for meshes that are not there.
  [compile_settlement]="--all"
  [export_settlement_bundle]="--copy-assets"
)

STAGES=(
  "sculpt_province"
  "refine_province"
  "compile_water"
  # The published boat lanes are re-solved against the water this run just
  # compiled, on measured depth rather than the hydrology pass's type labels
  # (which called a headland 5.28 m above the sea "tidal" and sent a lane over
  # it). It runs after BOTH water solves and writes nothing when there is
  # nothing to fix. It is a feedback edge: the carve that DREDGES a lane runs
  # earlier, in refine_province, so a lane repaired here is served by the next
  # run's carve. One pass repairs the line; a second serves it.
  "reroute_lanes"
  "reroute_majors"
  "compile_minor_routes"
  "grade_routes"
  "author_route_structures"
  "grade_routes"
  # The pieces are compiled HERE, between the second grade and the pads: the
  # author runs between the two grades and its windows are grading-exempt, so
  # pass 2 leaves the ground inside them alone, and this is the last point at
  # which the author and the compiler provably see the same surface.
  # `grade_settlement_pads` reads no structure spans, so it can move ground
  # under a structure - compiling after it would reintroduce exactly the
  # author/compiler divergence this stage exists to prevent.
  "compile_route_structures"
  "grade_settlement_pads"
  "compile_chunks"
  "export_web_chunks"
  "compile_water"
  "reroute_lanes"
  "terrain_request_postconditions"
  "rebake_landcover"
  # The settlement ground paint sits BETWEEN the land-cover bake and the
  # scatter, and it has to. `rebake_landcover` rewrites `ground-control.png`
  # from scratch, so paint applied before it is wiped; `compile_scatter` READS
  # `ground-control.png` (compile_scatter.py:117) and reads the settlement
  # clearance, so paint applied after it is not in the bundles the world
  # streams and the trees grow through the floors. Publishing the bundle first
  # is what gives the paint stage something to read.
  # The exporter refuses a compile whose source blueprint or terrain has moved
  # under it, and rightly - but nothing produced that compile, so a blueprint
  # edit or a re-carve left the world unbuildable until somebody ran five
  # commands by hand. It belongs here, after the final water and the land cover
  # and immediately before the publish that consumes it.
  # Ways are waypoints plus `routing: terrain`, and footprints, districts and
  # doors are derived from the placed pieces — all of them read the shipped
  # rasters, so a re-carve makes every one of them drift and compile_settlement
  # refuses. Nothing re-derived them, so it was a command a person had to
  # remember after every rebuild.
  "rederive_blueprints"
  "compile_settlement"
  "export_settlement_bundle"
  "settlement_ground_control"
  "compile_scatter"
)

# The fast path's stage list: the same chain with the province-wide re-derive
# and the route solves elided, and the per-tile stages given the footprint.
FOOTPRINT_FILE="$VAULT/province-refined/chain-footprint.json"
FOOTPRINT_STAGES=(
  "recarve_local"
  "compile_water"
  "grade_routes"
  "author_route_structures"
  "grade_routes"
  # The pieces are compiled HERE, between the second grade and the pads: the
  # author runs between the two grades and its windows are grading-exempt, so
  # pass 2 leaves the ground inside them alone, and this is the last point at
  # which the author and the compiler provably see the same surface.
  # `grade_settlement_pads` reads no structure spans, so it can move ground
  # under a structure - compiling after it would reintroduce exactly the
  # author/compiler divergence this stage exists to prevent.
  "compile_route_structures"
  "grade_settlement_pads"
  "compile_chunks"
  "export_web_chunks"
  "compile_water"
  "reroute_lanes"
  "terrain_request_postconditions"
  "rebake_landcover"
  # The settlement ground paint sits BETWEEN the land-cover bake and the
  # scatter, and it has to. `rebake_landcover` rewrites `ground-control.png`
  # from scratch, so paint applied before it is wiped; `compile_scatter` READS
  # `ground-control.png` (compile_scatter.py:117) and reads the settlement
  # clearance, so paint applied after it is not in the bundles the world
  # streams and the trees grow through the floors. Publishing the bundle first
  # is what gives the paint stage something to read.
  # The exporter refuses a compile whose source blueprint or terrain has moved
  # under it, and rightly - but nothing produced that compile, so a blueprint
  # edit or a re-carve left the world unbuildable until somebody ran five
  # commands by hand. It belongs here, after the final water and the land cover
  # and immediately before the publish that consumes it.
  # Ways are waypoints plus `routing: terrain`, and footprints, districts and
  # doors are derived from the placed pieces — all of them read the shipped
  # rasters, so a re-carve makes every one of them drift and compile_settlement
  # refuses. Nothing re-derived them, so it was a command a person had to
  # remember after every rebuild.
  "rederive_blueprints"
  "compile_settlement"
  "export_settlement_bundle"
  "settlement_ground_control"
  "compile_scatter"
)

from=""
force=""
allow_sculpt=""
footprint=""
full=""
steal=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) printf '%s\n' "${STAGES[@]}"; exit 0 ;;
    --force) force="--force"; shift ;;
    --footprint) footprint=1; shift ;;
    --full) full=1; shift ;;
    --allow-sculpt) allow_sculpt=1; shift ;;
    --steal-lock) steal=1; shift ;;
    --from) from="${2:?--from needs a stage name}"; shift 2 ;;
    *) echo "usage: $0 [--from <stage>] [--force] [--footprint|--full] [--allow-sculpt] [--steal-lock] [--list]" >&2; exit 2 ;;
  esac
done

# The default is the fast path WHEN IT APPLIES. `--full`, `--force` and
# `--from` are all explicit statements that this run is not a local carve, so
# none of them auto-select it.
if [[ -z "$footprint" && -z "$full" && -z "$force" && -z "$from" ]]; then
  if why=$(ES_VAULT_ROOT="$VAULT" python3 -m worldgen.chain_stages local-carve-only); then
    echo "Fast path: $why. (--full forces the whole chain.)"
    footprint=1
  else
    echo "Full chain: $why."
  fi
fi

if [[ -n "$footprint" ]]; then
  STAGES=("${FOOTPRINT_STAGES[@]}")
  # The footprint file is written by recarve_local at the head of this run.
  STAGE_ARGS[compile_chunks]="--footprint|$FOOTPRINT_FILE"
  STAGE_ARGS[export_web_chunks]="--changed"
  STAGE_ARGS[compile_scatter]="--out|$REPO_ROOT/apps/world-studio/public/province/vegetation|--footprint|$FOOTPRINT_FILE"
  # Every stage here reads ground the previous one just moved; the stamp book
  # cannot see that a skipped refine changed the world, so the fast path never
  # skips on stamps.
  force="--force"
fi

# ---------------------------------------------------------------- the lock
LOCK="$VAULT/chain.lock"
mkdir -p "$VAULT"
if [[ -n "$steal" ]]; then
  rm -f "$LOCK"
fi
if ! (set -o noclobber; printf 'pid=%s host=%s started=%s mode=%s\n' \
        "$$" "$(hostname)" "$(date -Is)" "${footprint:+footprint}${footprint:-full}" \
        > "$LOCK") 2>/dev/null; then
  held=$(( $(date +%s) - $(stat -c %Y "$LOCK") ))
  # shellcheck disable=SC2016
  holder=$(sed -n 's/.*pid=\([0-9]*\).*/\1/p' "$LOCK")
  started=$(sed -n 's/.*started=\([^ ]*\).*/\1/p' "$LOCK")
  mode=$(sed -n 's/.*mode=\([^ ]*\).*/\1/p' "$LOCK")
  echo "Waiting: another session is already running the terrain chain in this tree." >&2
  echo "  Process $holder started a $mode run at $started and has held it for $((held / 60))m $((held % 60))s." >&2
  echo "  A full run takes about 8 minutes. Nothing is broken; try again when it finishes." >&2
  echo "  If that run died and left the lock behind (no process $holder), take it with:" >&2
  echo "    $0 --steal-lock ${*:-}" >&2
  exit 3
fi
trap 'rm -f "$LOCK"' EXIT

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
# Chained onto the lock's trap: the lock is released whatever happens, and the
# timings still print for a chain that stopped on a failing stage.
trap 'summary; rm -f "$LOCK"' EXIT

started=0
index=0
for stage in "${STAGES[@]}"; do
  index=$((index + 1))
  # `grade_routes` appears twice with different inputs, so the stamp is keyed
  # by position as well as name — and the fast path's positions are its own,
  # so its stamps live under an `fp-` prefix and cannot be mistaken for the
  # full chain's. A full run after a fast one therefore rebuilds from the
  # sculpt down, which is the conservative answer and the right one.
  key=$(printf '%s%02d-%s' "${footprint:+fp-}" "$index" "$stage")
  if [[ -n "$from" && $started -eq 0 ]]; then
    [[ "$stage" == "$from" ]] && started=1 || continue
  fi
  # THE SCULPT IS FROZEN. `sculpt_province` re-derives the base terrain the
  # owner approved at the Phase 6b walk gate, and a `--force` run once replaced
  # it and cost the project a day. It is not a stage a routine rebuild may take
  # on its own initiative — and it WILL try, because it reads `routes.json`,
  # which `reroute_majors` rewrites five stages later, so its fingerprint is
  # stale after almost every run (polish backlog: the chain's feedback edge).
  # Re-sculpting is a deliberate act; `--allow-sculpt` is how you say so.
  if [[ "$stage" == "sculpt_province" && -z "$allow_sculpt" ]]; then
    echo "=== $stage === SKIPPED: the sculpted base is frozen (--allow-sculpt to re-derive it)"
    continue
  fi
  echo "=== $stage ==="
  args=()
  if [[ -n "${STAGE_ARGS[$stage]:-}" ]]; then
    IFS='|' read -r -a args <<< "${STAGE_ARGS[$stage]}"
  fi
  python3 -m worldgen.chain_stages run $force "$key" "$stage" "${args[@]}"
done
