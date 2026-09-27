# Placement workbench

An agent places kit pieces the way a person does in Blender or the Creation
Kit: in a 3D scene over the frozen ground, placing, snapping, settling,
measuring every contact, rendering and looking, then exporting the poses as
the blueprint record the compile realises unchanged. Lane brief:
[docs/phases/lanes/placement-workbench-lane.md](../../docs/phases/lanes/placement-workbench-lane.md).

    python3 tooling/placement-workbench/wb.py --help
    python3 tooling/placement-workbench/wb.py apply fixtures/yard-b.layout.json

`apply` and `export` refuse a place whose catalogue record is `ownerGuided`
unless `--owner-guided "<the owner's go-ahead>"` is passed.

A place is authored as ONE layout file (decision 0100): the ordered
workbench operations for the whole place. `apply` rebuilds the scene from
it in one process and judges it (`check` + `compile`); the scene file is
derived state. `fixtures/yard-b.layout.json` is the standing example.

| File | What it is |
|---|---|
| `wb.py` | The CLI: one command per call (or a whole layout with `apply`; `replay` turns a scene's log into a layout), the scene JSON is the whole state, JSON out, a `[wb] <cmd> <s>` timing line on stderr. `check` judges every piece on the compile's own ground rules (fit slope, fit delta, the yard gate's sill), every near pair on its relation's bar (mounted, run joint, unrelated) and every quay on the compile's slide, the 97 C5 clearance and its published reach; `compile` runs the real derive passes and compile on the scene's poses in a temporary copy (6 s) and names the pieces behind each refusal; `site` lists the poses that pass those rules; `map --heights` prints the ground in metres. |
| `workbench/layout.py` | The layout file (`schemaVersion` 1: `placeId`, `window`, `ops`): op <-> CLI tokens by the parser's own argument names (a `bind ... --on parent` op may name `host`, the piece its mount hangs it on: the export writes it as the member's `host` and the compile parents it there; a `socket` op may be kind `station` with `stationClass` or `sign` with `pointsTo[]`, and any socket may carry `fills: [promise ids]`, 0104; blueprint doors take `doorType` load|swing and `fills`, parcels `fills`), the log replay (a trial piece placed and removed is dropped), the stale-ground refusal, the `check` bars `apply` lists as failures. A `place` op may carry `"pad": {"apronM"?, "datumM"?, "floorMinM"?}` (decision 0101; `workbench/pads.py`: patched ground, rule R1 `padRule`). |
| `fixtures/yard-b.layout.json` | Yard B as a layout: `apply` reproduces the yard-B scene's poses within 1 mm / 0.01 deg (the golden test). Migrated from the scene log by hand where the log had lost the edits (house, sconce wall, cave, stage, hull). |
| `workbench/scene.py` | Scene and piece poses; the one frame table (province x east / z south; workbench = Blender = kit frame turned by yaw). |
| `workbench/ground.py` | The ground window, extracted once per scene: the studio's lod1 chunks (what the runtime seats on) and the compile's survey (height, slope, wet, depth, water level). |
| `workbench/kits.py` | Published manifest rows and sidecars; meshes from the raw kit builds via `mine_mounts.MeshLibrary`, cached as npz. |
| `workbench/measure.py` | Exact gap and crossing (FCL), penetration by separation, contact patch (the miner's `patch_class`), the runtime's seat height, foot float, doors to paths. |
| `workbench/snap.py` | Snap by the mined abuts evidence (skipping faces the plugins end runs on), snap face to face by geometry, mount on a mined mount pair, attach by a mined template; the runtime's mounted pose for comparison. |
| `workbench/assembly.py` | Building assemblies: `group place` reads the tracked yard sets in `world/sources/placement/yard-sets/<type>.json` first (0101), the gitignored `output/prefabs` only for the yard fixtures; groups saved as prefabs, variant swap, the front-face and openings check, the repetition signature. |
| `workbench/rules.py` | The walk-packet checks as `check` rules (decision 0102): `walkRule` (a route from the road terminal to every unsealed doorway record and doorless parcel on the padded ground: 30 deg slope everywhere, the controller's 0.18 m step only where ground meets a deck or deck meets deck, water at most 0.7 m deep; the bound doorway never sealed; `walk_routes` for the navmesh socket: routes only, never the grid), `floorEdgeRule` (underside within 1.0 m of the base only), `pathReachRule` (bound doors and declared openings), `propSeatRule` (a prop within 0.01 m above and 0.05 m below its seat; a no-evidence prop may sink up to the ground's rise under its foot, cap 0.15 m), the 16k walk-2 rules `roadSurfaceRule` (no footprint on the road paint as drawn), `sillRule` (a threshold within 0.20 m of the walk surface or a stair top), `signRule` (a board's arm on the road bearing, its centre 1.7–2.4 m up, a `sign` socket with one `pointsTo` per board), `berthReachRule` (a way from dry ground to every hull; idle and npc sockets out of the water), `colliderRule` (a 0.3 m piece has a manifest collider), the beached profile and the walktable's measured column. Every bar is a constant in the table at the top of the file. |
| `workbench/pads.py` | Building pads (decision 0101): the declared pad resolved on a pose (datum, fill, cut over the footprint + apron), the patched ground a padded piece is seated and checked on (pads applied in the bundle overlay ids' order, as the runtime applies them), rule R1 (`padRule`). The math is `worldgen.settlement_run_pads`. |
| `workbench/describe.py` | The per-asset descriptor (bounds, floors, walls, openings, doorways, symmetry, connectors, the mined evidence), cached with `schemaVersion`. |
| `workbench/render.py`, `blender/render_scene.py` | Renders (top, front, side, back, iso, turntable, cutaway) with Linux Blender 3.2.2, Cycles CPU; scale bar, labels and outlines drawn from the camera projection. `render --shots auto` is a render round in ONE launch (top, a front per parcel on its door side, two opposite isos) into `output/renders/<scene>/round-N/` with a `manifest.json`; the launch's work dir is removed after every render. |
| `workbench/export.py` | Poses into a blueprint's parcels, runs (`pieces` with `atM`), a shell's `assembly`, landmarks and routes; a mounted member's own `mountPair` field; `--write` writes `walkRoutes` and records `authoredOn` (sha256 of the ground window's chunk files, of every kit manifest used and of the layout file; the workbench schemaVersion). |
| `tests/` | The round-1 answers (`expected_round1.json`, written before the code), the round-3 fixes and yard B's gates (`test_proving_ground_b.py`: the published record is the scene's poses, every run joint is contact), and the layout tooling (`test_layout.py`: op round trips, the yard-B golden apply and replay, provenance and the stale-ground refusal, the render round with Blender mocked) as pytest. Local only: they need the raw kit builds. |

Output (scenes, ground windows, mesh and descriptor caches, renders) goes to
`output/`, which git ignores. `WB_OUTPUT=<dir>` moves the per-run state
(scenes, apply summaries, caches, renders, ground windows) for a parallel
lane or an audit; the mesh and descriptor caches stay shared.
`WB_BLUEPRINTS=<dir>` reads a trial blueprint (a WIP edit on a copy) in
place of `world/sources/blueprints/`.

## Apply cache

`apply` keeps a per-scene cache under `output/apply/<scene>/cache/`
(`workbench/opcache.py`). `ops.json`: each op's effect (pieces added or
changed, paths, log lines, warnings) keyed by the op's JSON, the content of
every piece it names (uid, child, parent, host) as the scene stands when it
runs, each named asset's manifest row, footprint row and mesh (by content),
the yard set it places, the scene's pad and run-pad overlays when the op
seats anything, and a global key: the CONTENT of the workbench,
world-generation and pipeline sources and of the placement records and
yard sets, the place, and the window's chunk sha256s. No key reads an
mtime. An op changes only the pieces it names and the pieces it adds, so
its snapshot is O(named). An unchanged op is
restored; an op whose input moved (its parent, a pad) is re-derived.
`pairs.json`: `check`'s near-pair contacts keyed by both pieces' content.
`apply --full` re-derives everything (and refreshes the cache); deleting the
directory is always safe. `export --write` refuses a scene whose last
apply restored any op from the cache (`output/apply/<scene>/derived.json`):
run `apply --full` (or `round --full`) once before the export. A/B on
Claywater, one-op edit, three runs in alternating order: cached apply
4.8-4.9 s, `--full` 7.6-7.7 s (ops 0.5 s vs 1.7 s), so the cache
is the default (`APPLY_CACHE_DEFAULT` in wb.py; `--cache` / `--full`). The compile's derive passes and
`compile_settlement` run in-process (`WB_COMPILE_SUBPROCESS=1` restores the
subprocesses). Proof (Claywater HEAD and walk-2 WIP layouts, 2026-09-27):
scene, derived blueprint, compiled settlement and check byte-identical to a
full apply, including after a one-op edit and after a pad move
(`tests/test_speed.py` holds the yard-B version).

## Round

    python3 tooling/placement-workbench/wb.py round [SCENE] LAYOUT [--plan | --no-shots]
        [--walktable] [--full | --cache] [--report-dir DIR]

`apply` + `check` + `compile`, then `render --shots auto` (or with
`--plan` the 2D plan render of the blueprint this apply derived,
no Blender) in ONE process: catalogue, ground, survey, road paint and kit
records load once and the compile's passes run in-process. `--walktable`
adds the owner-walk table, which reads the PUBLISHED bundle: use it after
publish, not per round. Writes `output/apply/<scene>/summary.json`:
timings; failed op and op warnings; `byRule` (count, the rule's fix hint
from `layout.FIX_HINTS`, uids, failure texts) and `byUid`; `info`; the
compile's errors and warnings; the plan PNGs or the shot manifest. Each
round appends one line to `output/apply/<scene>/rounds.jsonl` (load,
apply ops, check, compile, plan, shots, total seconds; failures);
`--report-dir` copies both into the round's report folder. The apply
summary `output/apply/<placeId>.json` is still written.

## Edit

    python3 tooling/placement-workbench/wb.py edit LAYOUT --uid UID [--op KIND]
        --set at=[312.5,3001] yaw=90 pad.apronM=1.5 [--unset settle]

Edits the first op naming UID (as uid, child or name; `--op` picks the
kind) in place and prints the op before and after, keeping the file's
form. Values are JSON when they parse; dotted keys reach into a dict.

## Check

`check` runs its per-piece rows, near-pair chunks and each scene rule
(walk, floorEdge, pathReach, propSeat, roadSurface, sill, sign,
berthReach, collider, doors) as tasks in one fork pool over every core but
0 (`workbench/parallel.py`, `WB_WORKERS=1` for serial); results come back
in task order, so the output is the serial loop's key for key. Near pairs
whose two pieces are unchanged come from the pair cache. `check --only
UID,..` re-measures those pieces' pairs even on a hit; `--serial`,
`--full` (ignore the cache). The scene rules still run whole (they are
scene loops in `rules.py`).

## Scan

    python3 tooling/placement-workbench/wb.py SCENE scan SPEC.json [--out FILE]

Site feasibility before editing (`workbench/scan.py`). The spec lists
buildings: `{id, asset | group, centre, radius, step, yaws | yawStep,
pad?, landingBearing?, skip?, parcel?, limit?, verify?}` (`skip`: the
building's own uids, so its old pad and pieces are not in the way). Every
pose on the disc is measured in the pool on the scene's padded ground
without the skipped pieces: pad legality (0101 + batter) and worst pad
edge, or the fit rules; road-paint, path and piece overlap; water depth
1 m past the outline along `landingBearing`; designed sink; for the listed
poses, the free room per world side. The first `verify` legal poses are
placed on a copy of the scene and judged by `padRule`, `roadSurfaceRule`
and `sillRule` themselves. Prior art: `tooling/.reports/16k/walk2/P-*-scan*.py`.

Dependencies beyond the world-generation set: `python-fcl` (exact
mesh-mesh distance and crossing, used through `trimesh.collision`), listed
in `requirements.txt`; Blender 3.2.2 for Linux at `~/tools/blender-3.2.2-linux-x64/`.
