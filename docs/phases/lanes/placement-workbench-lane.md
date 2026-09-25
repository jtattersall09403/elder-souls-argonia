# Placement workbench lane (decision 0087; Opus lead)

An agent places kit pieces the way a person does in Blender or the
Creation Kit: in a 3D scene, placing, snapping, settling on the frozen
ground, measuring every contact, rendering and looking, iterating, then
exporting the poses as the blueprint record. The compile realises that
record unchanged and the existing gates verify it. The mined records
(`kit-designed-sink.json`, `kit-mounts-mined.json`, the abuts section of
`kit-assemblies-mined.json`) are evidence the agent queries, never rules
that place (owner 2026-09-24).

**Status (2026-09-25):** rounds 1–4 delivered. The round-4 recommendation
below was adopted by [0099](../../decisions/0099-places-are-built-in-a-loop-until-the-skill-is-proven.md) §5 and
[0100](../../decisions/0100-one-place-skill-whole-layout-authoring-lessons-store-and-the-acceptance-freeze.md) §1–2: every place is authored in
the workbench from one layout file, and the `placement-workbench` skill is
the `place-build` skill's tool manual. Since 16k slice 1b (lane A:
`wb.py apply`, render rounds, export provenance) the workbench is changed
by 16k slice lanes; no lane round is open.

## Folders

- **Owns:** `tooling/placement-workbench/**`, this brief and its row in
  [README.md](README.md), `docs/research/placement-workbench/**` (not yet
  created); `.claude/skills/placement-workbench/`, one decision
  record, the second yard fixture under `world/sources/blueprints/` and
  `world/sources/sites/`, one root `package.json` script, the lane's row in
  `docs/PROGRESS.md` (index-blob).
- **Never touches:** the combat-sandbox, stats-lab and sound lanes'
  folders; any other file under the 16k slice's pathspec.

## Rounds

1. **The workbench**: a CLI over a scene file; pieces from the raw kit
   builds with their manifests; the frozen ground for a km window; place,
   snap, settle, measure, render, describe, export.
2. **The skill**: the procedure an agent follows to build a place in it.
3. **The proof**: a second yard (`place.fixture.proving-ground-b`) built
   only with the workbench, the skill and Sonnet views.
4. **The write-up**: the decision record, this lane's state, the
   original-vs-workbench comparison for the owner.

| Round | State | Commit | Record | Proof |
|---|---|---|---|---|
| 4 | delivered 2026-09-25 | (this commit) | the table and recommendation below | measured on both published yards with the workbench's own contact and seat measures |
| 3 | delivered 2026-09-25 (redone in the codespace; the VM's blueprint and builder report were lost) | (this commit) | [place.fixture.proving-ground-b](../../../world/sources/blueprints/place.fixture.proving-ground-b.json), [site](../../../world/sources/sites/proving-ground-b.json) | yard B compiled with 0 errors (18 placements) and published; 39 workbench tests; the tool gaps below fixed |
| 2 | delivered 2026-09-24 | (this commit) | [skill](../../../.claude/skills/placement-workbench/SKILL.md), [0097](../../decisions/0097-placement-is-authored-in-a-workbench-and-the-pose-record-is-the-output.md) | the building-assembly chapter; the round-3 builder's nine tool gaps fixed (penetration by the smallest separating slide, `snap --settle`, terminal faces, every doorway, backlight, `probe`, quay reach); pitch, roll, mirror, `attach`, `swap`, `group`, `openings`, `signature`; the `assembly` field compiled and exported; 22 tests |
| 1 | delivered 2026-09-24 | 046017f2 | [tooling README](../../../tooling/placement-workbench/README.md) | 14 tests on answers written first (one expectation amended: `-with-door` composites bake their door leaf, so a doorway is closed mesh); place/settle 0.7 s, snap 1.3-1.8 s, measure 1.3 s, render 10-14 s |

### Round 3: the tool gaps, fixed at the root

The first compile of the exported yard refused eight things `check` had
passed; the published gates then refused two sills and the stage's reach.
The shared cause was one: `check` re-implemented a subset of the compile's
rules. It now calls the compile's and the gate's own functions, and
`wb.py compile` runs the real compile on the scene's poses.

| Gap | Root fix (`tooling/placement-workbench/`) |
|---|---|
| check vs compile: fit delta, a hull's seabed slope, the gate's sill | `wb.py` `_fit_rules` / `_sill` (the compile's `FIT_MAX`, `fit_slope_failure`, the gate's `SILL_LIMIT_M`) in `check`, `probe`, `site`; `wb.py compile` |
| check vs mount | `check` names each near pair `mounted` / `run-joint` / `unrelated` and judges it on that bar (`_pair_verdict`) |
| stage reach | `settle` slides a quay run with the compile's `anchor_quay_run`; `check` reports `compileShiftM`, the 97 C5 clearance and `publishedTipToHullM` |
| snap ignoring `terminates` | the child's broken end is refused like the parent's (`snap.py`) |
| radial farmhouse door | `doors` gives the wall's outward bearing and flags a record facing 27 deg off it; `render front` faces the measured doorway |
| map heights | `map --heights`; `site` lists every pose the rules pass |
| hull water | `check` measures the gate's 2.5 m halo at 1 m depth (`_hull_water`) |
| run settle | each run piece is seated and slope-checked on its own outline; all eight yard-B run pieces sit at `yOffRuntimeM` 0 |
| stilt sink 6.7-7.0 m | not a tool gap: the planner's stilt datum (cbf94703, deck 3.46 m) now puts the legs 3.6-3.9 m into the ground, which `check` reports |

### Round 4: workbench-authored yard B against the compile-authored proving ground

| | Yard B (workbench) | Proving ground (compile) |
|---|---|---|
| Placements | 18 (5-piece wall run, farmhouse, stilt house, bamboo hut, 3-piece boardwalk, stage, raft, cave, post, sign, wall, sconce) | 16 (4-piece wall run, the same kinds, one boardwalk piece, a stair) |
| Contacts measured while authoring | every one, on every `check` (1.9 s): 18 seats, 9 near pairs, 3 doors, the hull ring, the quay reach; plus the compile's verdict (`wb.py compile`, 6.4 s) | none per pair: the compile solves the poses and the gates judge the published result |
| Published wall joints (workbench measure) | gap 0.000, penetration 0.013-0.014 m (4 joints) | gap 0.000, penetration 0.013 m (3 joints) |
| Defects found before publishing | 8 compile refusals, 2 gate sills (0.179, 0.186 m), a 19.8 m quay slide, a published tip 0.517 m: all fixed | found after publishing, by the gates and the owner's check-in 2 (stilt datum, hut, boardwalk height, cave sill, quay bank) |
| Open | boardwalk joint 2 penetrates 0.081 m: HTBM's own 15-deg joint (0.313 m at the plugin's own rise); both of its -x steps turn | stilt-house door leaf 6.256 m off its doorway (`test_proving_ground`); its C5 clearance holds only on the pre-slide pose (0.13 m published, 1.16 m authored) |
| Agent time | about 80 min in the codespace (27 min cut, then 55 min), plus the lost VM run | not measured; 16h part 1's fix rounds and check-in 2 |
| What it cannot do | scale to a catalogue without an agent turn per piece; keep a quay pose to the centimetre (the compile slides it 0.025 m); read dark close-ups (one reader view came back black) | see a contact before the owner walks it; try a variant cheaply; catch a rule the gates do not hold |

**Recommendation (round 4; adopted by 0099 §5 and 0100 §1–2, where the
prefab question moved to the loop's exit per type, 0099 §3):** author every hand-built place in the workbench, 16i's places
first as then planned, with `wb.py compile` as the inner loop and `check` before every
render. For 16j's catalogue rollout, use workbench prefabs (`group save` /
`group place`) per building type rather than a fresh layout per place;
the per-piece turn cost is the limit, not the tool's accuracy.

## Findings for other owners

Measured in round 3 (owner: 16h, `compile_settlement` / the exporter):

- **Publishing yard B moves the collider budget.** Decision 0052's rule
  sets the budget at round(worst resident parts x 1.55); yard B holds 98
  parts against the first yard's 91, so both mirrors of the rule now read
  152 against the constant 141:
  `export_settlement_bundle.py:79` `COLLIDER_PART_BUDGET` (tested at
  `test_export_settlement_bundle.py:882`, `settlementCollision.test.ts:142`).
  Yard B is under 141, so no gate refuses the bundle; only the equality
  tests are red until the constant is re-derived.
- **The compile never keeps a quay pose.** `anchor_quay_run` walks a grid
  anchored on the current tip and returns the half-step line, so every
  pose slides by at least 0.025 m and a slid pose slides back
  (`compile_settlement.py:1848-1900`). Yard B authors the pre-image; its
  pose test allows half a step.
- **97 C5 is judged on the pose before the quay slide.**
  `blueprint_integration.py:455` measures the authored footprints; the first
  yard's stage is 1.16 m from its raft as authored and 0.13 m as published.
  Together with the yard gate's tip reach (0.5 m) the two leave a window of
  a few centimetres for a raft in line with its stage.
- **The farmhouse doorway's recorded facing is a bearing, not a wall
  facing.** The interiors record gives 207 deg for a doorway in the south
  wall (outward 180 deg, measured); the exported door takes 207 because the
  validator matches the record (`blueprint_integration.match_entrance`).

Measured in round 1:

- **Mounted children are seated mirrored at runtime.** On the published yard
  the huntsman sign's plugin pose (its mined pair on the post, post yaw 180)
  is 1.28 m from where the runtime draws it, turned 180 deg; the sconce is
  drawn on the other face of its wall, turned 180 deg. Two causes that
  cancel only for pieces symmetric about the parent's plane:
  `compile_settlement.mount_children` maps the mined north offset to
  runtime +z (south), and `anchoring.ts mountedTransform` applies the
  child's absolute yaw after the parent's rotation. Owner: 16h.
- **A run's pieces are seated on the whole run's footprint.**
  `export_settlement_bundle` gives every piece of a `pieces` parcel the
  parcel's union footprint as its `footprintM`, so the runtime seats each
  wall piece on the mean ground of the whole run. Owner: 16h.
