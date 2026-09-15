#!/usr/bin/env bash
# The terrain build chain — THE single place the stage order lives.
#
# It BUILDS ON the frozen ground; it does not rebuild it. No flag below except
# --refreeze can re-run the six rungs above the freeze gate.
#
# THE FREEZE GATE (decision 0066, owner 2026-09-14: layers are added onto what
# is built, never rebuilt from the sculpt). A routine run does NOT re-execute
# the six rungs above the gate. It starts at `apply_terrain_patches`, and
# before it `verify_freeze` checks the three frozen arrays against
# world/sources/terrain/freeze.json and hydrology-graph.json against its
# recorded source and content shas (seconds), refusing on any mismatch. The
# rungs above the gate are rebuilt only under `--refreeze`, which walks the
# whole chain and re-records the shas (the owner walks the result). The order
# below is the one decision 0059 (Phase 16b) records; if it changes, change it
# HERE and point at this script, so a doc and a run cannot drift apart.
#
#   ./scripts/terrain-chain.sh                 # verify_freeze, then build from apply_terrain_patches down, skipping what is unchanged
#   ./scripts/terrain-chain.sh --force         # re-run every stage BELOW the gate, ignoring the unchanged-stage skip (the frozen rungs still do not run)
#   ./scripts/terrain-chain.sh --from grade_routes    # resume at a stage
#   ./scripts/terrain-chain.sh --list          # stages, in order
#   ./scripts/terrain-chain.sh --refreeze      # let the frozen base be re-derived (rare, deliberate)
#   ./scripts/terrain-chain.sh --through 16b  # build only the stages delivered up to a chunk (default: DELIVERED_THROUGH)
#   ./scripts/terrain-chain.sh --full          # every stage the LADDER hides, whatever chunk owns it (still not the frozen rungs)
#   ./scripts/terrain-chain.sh --steal-lock    # take a lock a dead run left
#
# Run from tooling/world-generation. A forced re-run of everything below the
# gate is roughly ten minutes; a run with nothing changed is seconds; a
# --refreeze, which rebuilds the frozen ground itself, is the rare deliberate
# case the owner walks afterwards.
#
# THE LADDER (Phase 16b, decision 0059): terrain once, water once, places on a
# frozen world.
#
#   sculpt_province      the mountains, benching, naturalness, coastal banks, pits  -> FROZEN (sha recorded)
#   compile_hydrology    the coarse pass: routing sink = every sea-connected cell
#   compile_society      roads, lanes, danger, cultures on that pass
#   shape_province       valleys, detail noise, the Blackrose lake, portages, fluvial -> FROZEN
#   hydrology_graph      the water solved ONCE on the shaped ground: rivers, reaches, bodies, promises
#   carve_province       trenches, weirs, plunge bowls cut to the graph            -> FROZEN
#   ---- the freeze gate: a run CHECKS the six rungs above by hash
#        (`python3 -m worldgen.verify_freeze`) and starts below it;
#        test_terrain_preconditions.py reads the frozen array and the graph ----
#   apply_terrain_patches   the typed patches (poling channels, terrain requests; pads and grading later)
#   patch_water             proves no patch moved a water level or a body's extent
#   compile_water           the water realised ONCE from the graph on the natural ground (16c)
#   reroute_lanes ... compile_scatter   the rest on that water
#
# The three frozen arrays are content-addressed in world/sources/terrain/freeze.json.
# A stage that would overwrite a recorded array with different content REFUSES
# unless ES_REFREEZE=1 (`--refreeze`); `--allow-sculpt` is kept as an alias.
# A re-freeze is a decision someone takes (the owner walks the result), never
# something a routine rebuild does to itself.
#
# THE LADDER (owner, 2026-09-12: build only what is delivered). Phase 16 fixes
# the chain one chunk at a time, and a stage a later chunk still owns is the
# OLD code: known to be wrong on the frozen world, and some of it moves the
# ground under the chunks being walked. So each chunk lists the stages it has
# delivered, cumulative from 16b, and a plain run builds `--through`
# DELIVERED_THROUGH and skips the rest, printing them. When a chunk lands, its
# agent adds its stages below and bumps DELIVERED_THROUGH in the same commit
# (docs/phases/16-foundation-and-places/README.md §3). Published JSON a
# skipped stage would have written (routes, structures, settlements, pad
# receipts) is STALE against the current ground and is not judged at that
# chunk's check. `--full` runs everything.
#
# NO FEEDBACK EDGES ABOVE THE GATE. The sculpt reads its road corridors from a
# once-frozen input (`carve-inputs/sculpt-corridors.json`), the shape stage
# reads the frozen `carve-inputs/` networks, the graph reads the shaped ground,
# the carve reads the graph. Below the gate the old admitted edge remains:
# `reroute_lanes` repairs the published lanes on this run's water and the
# next run's `shape_province` would carve for them only after a deliberate
# `carve_routes --promote`.
#
# INCREMENTAL. Each stage is run through `worldgen.chain_stages`, which
# fingerprints the stage's code (its module and every worldgen module it
# imports) and the files it read and wrote last time, and prints
# `skip (unchanged)` instead of running when all three still match. The
# frozen stages therefore skip on every routine run; a patch edit re-runs
# `apply_terrain_patches` (cheap: it restarts from the frozen array) and the
# per-tile stages below it redo only the tiles inside `chain-footprint.json`
# — `compile_chunks --footprint`, `export_web_chunks --changed`,
# `compile_scatter --footprint` all measure the change themselves and widen
# a footprint that under-reports. The book lives in `chain-stamps.json` in
# the vault heightfield directory. `--force` ignores it.
#
# `ES_VAULT_ROOT` points the whole chain at a different copy of the vault's
# `argonia-heightfield` directory (a scratch copy for benchmarking, a second
# worktree building at the same time). VAULT below follows it.
#
# AFTER A RUN: `npm run province:publish` uploads the generated rasters to the
# release artefact and rewrites `rasters-manifest.json`; commit that with the
# JSON the chain changed. `npm test` refuses a tree whose rasters and manifest
# disagree.
#
# THE LOCK. Two agents share this working tree and both run this script. Two
# chains writing the heights and the water rasters at the same time silently
# produce a province that is neither run's output, so a run takes
# `chain.lock` in the vault heightfield directory (beside `chain-stamps.json`)
# and releases it from the EXIT trap, including on failure. A second run
# started meanwhile waits for nothing: it exits 3 saying who holds the lock.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

VAULT="${VAULT:-${ES_VAULT_ROOT:-$HOME/workspace/elder-souls-dev/elder-scrolls-asset-pipeline/skyrim-source/mod-sources/tamriel-worldspaces-118678/extracted/Argonia Worldspace/argonia-heightfield}}"
FOOTPRINT_FILE="$VAULT/province-refined/chain-footprint.json"
declare -A STAGE_ARGS=(
  [sculpt_province]="$VAULT/heightfield-f32.npy"
  [compile_hydrology]="$VAULT/heightfield-f32.npy"
  [compile_society]="$VAULT/hydrology-pass1.npz"
  [shape_province]="$VAULT/heightfield-f32.npy|$VAULT/hydrology-pass1.npz"
  [hydrology_graph]="derive"
  # The per-tile stages read the changed region apply_terrain_patches wrote;
  # each one also diffs against its own snapshot, so a re-frozen base recuts
  # everything and a one-patch edit recuts one tile.
  [compile_chunks]="--footprint|$FOOTPRINT_FILE"
  [export_web_chunks]="--changed"
  # The vegetation bundles are downstream of the ground: without --out the
  # scatter compiler only reports, and the committed bundles stay stale after
  # the terrain moves.
  [compile_scatter]="--out|$REPO_ROOT/apps/world-studio/public/province/vegetation|--footprint|$FOOTPRINT_FILE"
  # The bundle is only delivery once the kit GLBs it names are in the site the
  # browser fetches; without this the runtime asks for meshes that are not there.
  [compile_settlement]="--all"
  [export_settlement_bundle]="--copy-assets"
)

# The six rungs above the freeze gate (decision 0066). A routine run checks
# them with `worldgen.verify_freeze` and skips them; only `--refreeze` rebuilds.
ABOVE_GATE=(sculpt_province compile_hydrology compile_society shape_province hydrology_graph carve_province)

STAGES=(
  "sculpt_province"
  "compile_hydrology"
  "compile_society"
  "shape_province"
  "hydrology_graph"
  "carve_province"
  "apply_terrain_patches"
  "patch_water"
  "compile_water"
  # The published boat lanes are re-solved against the water this run just
  # compiled, on measured depth. It runs after BOTH water solves and writes
  # nothing when there is nothing to fix. Its repaired line is carved for only
  # after a deliberate `carve_routes --promote` (see the header).
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
  "compile_route_structures"
  # Settlement pads still grade the ground here (16h turns them into typed
  # patches, plan chunk 16h); until then they are the one edit below the gate
  # that is not yet a patch, and `patch_water` runs before them on purpose.
  "grade_settlement_pads"
  "compile_chunks"
  "export_web_chunks"
  # Water is compiled ONCE (16c, 0057 §1): the entry above grading is the
  # shipped one; `reroute_lanes` re-lines the boat lanes on it (16e).
  "reroute_lanes"
  "terrain_request_postconditions"
  "rebake_landcover"
  # The beyond-border apron (16d) reads the province's border chunks and the
  # land-cover bake it just wrote, and runs in seconds: the 670 MB heightmap
  # decode lives in `extract_apron_source` (run once by hand, never here).
  "build_border_apron"
  # The settlement ground paint sits BETWEEN the land-cover bake and the
  # scatter, and it has to: `rebake_landcover` rewrites `ground-control.png`
  # from scratch, `compile_scatter` reads it and the settlement clearance.
  "rederive_blueprints"
  "compile_settlement"
  "export_settlement_bundle"
  "settlement_ground_control"
  "compile_scatter"
)

DELIVERED_THROUGH="16d"
declare -A LADDER=(
  # 16b: the frozen base and its patches, the chunks and the land-cover bake
  # (sea-level shorelines only: no water is compiled on this ladder). The
  # owner walks the painted ground with nothing on it.
  [16b]="sculpt_province compile_hydrology compile_society shape_province hydrology_graph carve_province apply_terrain_patches patch_water compile_chunks export_web_chunks rebake_landcover"
  # 16c (delivered 2026-09-13): the water compiled once from the graph, and
  # the request postconditions that read it.
  [16c]="compile_water terrain_request_postconditions"
  # 16d (delivered 2026-09-15): the beyond-border apron, rings 0-2 and their
  # paint, from the all-Tamriel heightmap crops and the frozen ground.
  [16d]="build_border_apron"
  # 16e: routes, grading as patches, spans, ferries; patch_water over the
  # grading patches; reroute_lanes on the compiled water (never a second
  # water compile: water is compiled once, 0057 §1).
  [16e]=""
  # 16f: vegetation on the frozen water.
  [16f]="compile_scatter"
  # 16h: pads as patches, the settlement compile and publish.
  [16h]=""
  # 16g: the plot re-solve; 16i: exemplars; 16j: the trial packet (stage names
  # are written by the chunk that delivers them).
  [16g]=""
  [16i]=""
  [16j]=""
)
# The chunk ORDER has one home, worldgen/ladder.py (the tests skip by it too);
# bash reads it so the two can never disagree (16d, decision 0067).
LADDER_ORDER=($(PYTHONPATH="$REPO_ROOT/tooling/world-generation" python3 -c 'from worldgen.ladder import LADDER_ORDER; print(*LADDER_ORDER)'))
for chunk in "${LADDER_ORDER[@]}"; do
  [[ -v "LADDER[$chunk]" ]] || { echo "ladder.py names chunk $chunk but LADDER has no row for it" >&2; exit 2; }
done
for chunk in "${!LADDER[@]}"; do
  printf '%s\n' "${LADDER_ORDER[@]}" | grep -qx "$chunk" || { echo "LADDER row $chunk is not in ladder.py's LADDER_ORDER" >&2; exit 2; }
done
# The studio layer each stage produces. A skipped stage's layer is HIDDEN by
# the studio (it reads province/ladder.json, written at the end of every run):
# a layer is shown only if it was rebuilt on the current ground.
declare -A LAYER_OF=(
  [export_settlement_bundle]="settlements"
  [compile_route_structures]="route-structures"
  [compile_scatter]="vegetation"
  [compile_water]="water"
  [build_border_apron]="apron"
)
RAN_STAGES=()
SKIPPED_STAGES=()

from=""
from=""
force=""
steal=""
through="$DELIVERED_THROUGH"
full=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) printf '%s\n' "${STAGES[@]}"; exit 0 ;;
    --force) force="--force"; shift ;;
    --refreeze|--allow-sculpt) export ES_REFREEZE=1; shift ;;
    --through) through="${2:?--through needs a chunk id (16b, 16c, ...)}"; shift 2 ;;
    --ground-only) through="16b"; shift ;;
    --full) full=1; shift ;;
    --steal-lock) steal=1; shift ;;
    --from) from="${2:?--from needs a stage name}"; shift 2 ;;
    *) echo "usage: $0 [--from <stage>] [--force] [--refreeze] [--through <chunk>|--full] [--steal-lock] [--list]" >&2; exit 2 ;;
  esac
done

# The stages enabled through the requested chunk (cumulative).
ENABLED=""
if [[ -z "$full" ]]; then
  found=""
  for chunk in "${LADDER_ORDER[@]}"; do
    ENABLED="$ENABLED ${LADDER[$chunk]}"
    [[ "$chunk" == "$through" ]] && { found=1; break; }
  done
  [[ -n "$found" ]] || { echo "unknown chunk: $through (ladder: ${LADDER_ORDER[*]})" >&2; exit 2; }
  echo "Ladder: building through $through (delivered: $DELIVERED_THROUGH). Stages a later chunk owns are skipped."
fi
# Stages read this to know what else ran (rebake_landcover: is there compiled water on this ladder?).
export CHAIN_ENABLED="${ENABLED:-all}"

# ---------------------------------------------------------------- the lock
LOCK="$VAULT/chain.lock"
mkdir -p "$VAULT"
if [[ -n "$steal" ]]; then
  rm -f "$LOCK"
fi
if ! (set -o noclobber; printf 'pid=%s host=%s started=%s\n' \
        "$$" "$(hostname)" "$(date -Is)" > "$LOCK") 2>/dev/null; then
  held=$(( $(date +%s) - $(stat -c %Y "$LOCK") ))
  # shellcheck disable=SC2016
  holder=$(sed -n 's/.*pid=\([0-9]*\).*/\1/p' "$LOCK")
  started=$(sed -n 's/.*started=\([^ ]*\).*/\1/p' "$LOCK")
  echo "Waiting: another session is already running the terrain chain in this tree." >&2
  echo "  Process $holder started at $started and has held it for $((held / 60))m $((held % 60))s." >&2
  echo "  A full run takes about ten minutes. Nothing is broken; try again when it finishes." >&2
  echo "  If that run died and left the lock behind (no process $holder), take it with:" >&2
  echo "    $0 --steal-lock ${*:-}" >&2
  exit 3
fi
trap 'rm -f "$LOCK"' EXIT

if [[ -n "$from" ]]; then
  printf '%s\n' "${STAGES[@]}" | grep -qx "$from" \
    || { echo "unknown stage: $from" >&2; exit 2; }
  if [[ -z "${ES_REFREEZE:-}" ]] && printf '%s\n' "${ABOVE_GATE[@]}" | grep -qx "$from"; then
    echo "$from is above the freeze gate; pass --refreeze to rebuild the frozen rungs (they are re-recorded in freeze.json and the owner walks the result)" >&2
    exit 2
  fi
fi

# The freeze gate: check what is built instead of rebuilding it (decision 0066).
if [[ -z "${ES_REFREEZE:-}" ]]; then
  echo "=== verify_freeze ==="
  python3 -m worldgen.verify_freeze
else
  echo "=== verify_freeze === skipped (--refreeze: the frozen rungs will be rebuilt and re-recorded)"
fi

CHAIN_TIMES="$(mktemp)"
export CHAIN_TIMES
# Printed from the EXIT trap, so a chain that stops on a failing stage still
# shows what ran and what it cost.
summary() {
  local status=$?
  printf '\n%-26s %9s  %s\n' "stage" "seconds" "state"
  local total=0
  while IFS='|' read -r name seconds state; do
    printf '%-26s %9s  %s\n' "$name" "$seconds" "$state"
    total=$(python3 -c "print(f'{$total + $seconds:.1f}')")
  done < "$CHAIN_TIMES"
  printf '%-26s %9s\n' "total" "$total"
  rm -f "$CHAIN_TIMES"
  if [[ "$status" -eq 0 ]]; then
    echo "Next: npm run province:publish (then commit rasters-manifest.json with the chain's JSON)."
  else
    echo "CHAIN FAILED (exit $status): the stage above the table stopped it; nothing after it ran. Do NOT publish." >&2
  fi
}
trap 'summary; rm -f "$LOCK"' EXIT

started=0
index=0
for stage in "${STAGES[@]}"; do
  index=$((index + 1))
  # `grade_routes` and `reroute_lanes` appear twice with different inputs,
  # so the stamp is keyed by position as well as name.
  key=$(printf '%02d-%s' "$index" "$stage")
  if [[ -n "$from" && $started -eq 0 ]]; then
    if [[ "$stage" == "$from" ]]; then
      started=1
    else
      # a stage before the start is not run here; if the ladder would skip it
      # anyway, record it as skipped so ladder.json hides its layer as a plain
      # run would (a `--from` run must never un-hide a stale layer)
      if [[ -z "$full" ]] && ! printf '%s\n' $ENABLED | grep -qx "$stage"; then SKIPPED_STAGES+=("$stage"); fi
      continue
    fi
  fi
  if [[ -z "${ES_REFREEZE:-}" ]] && printf '%s\n' "${ABOVE_GATE[@]}" | grep -qx "$stage"; then
    echo "=== $stage === skipped (above the freeze gate; --refreeze to rebuild)"
    SKIPPED_STAGES+=("$stage")
    continue
  fi
  if [[ -z "$full" ]] && ! printf '%s\n' $ENABLED | grep -qx "$stage"; then
    echo "=== $stage === skipped (ladder: not delivered through $through)"
    SKIPPED_STAGES+=("$stage")
    continue
  fi
  RAN_STAGES+=("$stage")
  echo "=== $stage ==="
  args=()
  if [[ -n "${STAGE_ARGS[$stage]:-}" ]]; then
    IFS='|' read -r -a args <<< "${STAGE_ARGS[$stage]}"
  fi
  python3 -m worldgen.chain_stages run $force "$key" "$stage" "${args[@]}"
done

# The ladder record the studio reads (province/ladder.json): what ran, what
# was skipped, and which layers are therefore hidden as not rebuilt.
hidden=()
for stage in "${SKIPPED_STAGES[@]}"; do
  [[ -n "${LAYER_OF[$stage]:-}" ]] && hidden+=("${LAYER_OF[$stage]}")
done
python3 - "$through" "${full:+full}" "$(printf '%s ' "${RAN_STAGES[@]}")" "$(printf '%s ' "${SKIPPED_STAGES[@]}")" "$(printf '%s ' "${hidden[@]}")" <<'PY'
import json, sys
from pathlib import Path
through, full, ran, skipped, hidden = sys.argv[1:6]
doc = {"schemaVersion": 1,
       "about": "Written by scripts/terrain-chain.sh: the Phase 16 ladder this build was made through. A studio layer whose producing stage was skipped is hidden: it was not rebuilt on this ground (plan 16 §3).",
       "through": "full" if full else through,
       "ran": sorted(set(ran.split())), "skipped": sorted(set(skipped.split())),
       "hiddenLayers": sorted(set(hidden.split()))}
out = Path(__file__).resolve() if False else Path.cwd() / "../../apps/world-studio/public/province/ladder.json"
out = out.resolve(); out.write_text(json.dumps(doc, indent=1) + "\n")
print(f"ladder.json: through {doc['through']}, hidden layers: {doc['hiddenLayers'] or 'none'}")
PY
