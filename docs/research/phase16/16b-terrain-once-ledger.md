# 16b — terrain built once: measurement ledger (2026-09-11/12)

Evidence for Phase 16b ([brief](../../phases/16-foundation-and-places/16b-terrain-once.md),
decision [0059](../../decisions/0059-terrain-built-once-frozen-base-and-typed-patches.md)).
Every number is printed by the stage or gate named beside it; re-run them
rather than trust this page.

## 1. The frozen base (`world/sources/terrain/freeze.json`)

| Array | sha256 (first 16) | Stage | Seconds |
|---|---|---|---|
| `heightfield-sculpted-f32.npy` | `da63f2a09c757842` | `sculpt_province` | ~100 |
| `heightfield-shaped-f32.npy` | `8afb88d66a7002b3` | `shape_province` | ~46 |
| `refined-height-frozen-f32.npy` | `e86bb41c67facfe0` | `carve_province` | ~50 |

The vault's previous "today" sculpt was the August array (16a ledger §1).
Today's code re-froze it with three deliberate changes (sculpt-meta.json):
summit 651.4 m, uplift envelope 25.4 % of the map, mean change outside the
envelope 0.52 m; **8,525 closed depressions above 30 m and under 1 ha filled
to their spill (105,785 cells), 15 tarn-sized kept** (ruling 2); coastal
shelf steps ramped (78,783 step cells found on the raw sculpt; on the
naturalised August array the same pass moved 188k cells, 1.16 % of the
province, median 2.2 m, all within 45 m of the sea); benching from 45 m with
±40 % band spacing. The shape stage filled 188 new closed depressions it had
made above 12 m off wet ground (386 cells); fluvial: 23 oxbows, 2 deltas.

## 2. The graph on the shaped ground (`hydrology_graph report`)

| Measure | 16a (sculpt) | 16b (shaped, after the carve's reconciliation) |
|---|---|---|
| rivers | 100 | 83 |
| reaches | 678 | 489 |
| junctions | 200 | 166 |
| bodies | 407 | 2,479 (2,452 measured, 10 promised plunge pools, 1 authored, 16 terrain-stage) |
| waterfalls | 5 | 10 |
| suspect (coastal-shelf) falls | 0 | 0 |
| river-trapped depressions | 0 | 0 |
| lost stations | 4 | 0 |
| sea mouths | 30 | 38 (14 into a sea-level marsh or lagoon body) |
| surface transitions | 396 | 237 |
| bodies moved by the carve | — | 0 over 0.05 m (after the sill, backwater and neck fixes; 18 before them) |
| captured bodies (drained to the trench through them) | — | 6 |
| `check` violations | 0 | 0 (7 during the work: 5 rivers ending in a sink and 2 rising profiles, all root-caused) |

Why the body count rose: the shaped ground carries the fluvial pass's
wetland pools and the marsh detail noise, so 2,290 of the bodies are marsh
sheets under 500 m². The previously shipped water had 2,635 bodies (1,856
sheets, `water-meta.json` before this chunk), so this is the population the
province already had, now recorded. Fewer rivers because the routing sink is
now every sea-connected cell: a river ends where it meets sea-level water
instead of being routed through a lagoon and out over its spill.

## 3. The carve (`carve-meta.json`)

24,954 stations on 128 channel reaches; 137,109 cells lowered (median 0.68 m,
p90 2.28 m, max 91.1 m at a canyon cut), 21,443 raised (max 4.5 m, the steep
shoulder cap); 171,614 trench cells; 10 falls, 10 plunge basins; 2,330 islets
sunk; 0 lost stations.

## 4. The freeze gate (`python3 -m worldgen.terrain_preconditions`)

1 violation, 0 unexpected, 1 known (`freeze-gate-known.json`): `reach.59-1203`,
a 3.03 m fall whose channel runs 13 m under the shaped ground, so the face
left after the carve is a 3 m step over 5.5 m. Owner 16c.

The gate went 262 → 0 unexpected over the chunk. What it found on the way,
each fixed at the root rather than tolerated:

| Found by the gate | Root cause | Fix |
|---|---|---|
| a river rising 0.76 → 0.93 m at a lake outlet | the sill read a pool level recorded before the junction pins moved the profile | `channels.long_profile`: the sill now takes the final level of the pooled run before it |
| a river rising 0.0 → 0.6 m out of a sea-level lagoon | the coarse D8 sink was the salinity model's `ocean`, not sea-connected water | `hydrology.compute(sea=…)`: every coarse cell holding a full-res sea-connected sample sinks |
| a river rising 0.0 → 0.92 m into a lake | `_backwater` lifted a run arriving from a lower body (the sea) | a run arriving from a lower pooled run is captured, never lifted; and the profile after a lowered run is capped to it |
| a tarn spilling 0.6 m under its level | the outlet channel's shoulder cut the tarn's neck 24 m from its shore; the sill ended while both banks still stood over the lake | `BODY_NECK_M`: no cut under a body's level within 60 m; the sill ends only when the lower bank has dropped too |
| a 99 m deep "pond" at 97 m by Zuuk | a below-sea data hole in the source was called sea and exempted from the pit fill | only sea-CONNECTED water is sea (sculpt, shape, gate) |
| 19 graph bodies "left dry" by the carve | promised bowls are under the solver's acceptance size; bodies the trench runs through drain to it | the gate checks bowls directly; drained bodies are recorded `captured` |
| 262 → 30 → 7 shoulder "gaps" | the check compared against this reach's level rather than the nearest station's; it ignored the carve's `+0.5 mpp` width slack; it sampled a ring one sample wide every 5.5 m; it used the reach's mean width | nearest-station level, the carve's own band, every sample walked, the reach's widest station |

## 5. Patches (`terrain-patches-applied.json`)

56 authored (2 poling channels, 54 places' typed terrain requests); **8
applied, 48 refused**: 31 would move frozen water (dry a wet cell, leak a
body beyond the region, or dig an undeclared hollow), 8 would raise or cut a
channel bed, 8 exceed their own declared amplitude, 1 crosses a (stale)
route structure. `patch_water`: pass. The refused list is 16g's input
("places adapt"): every refused request names the invariant and the numbers.
Ruling 6 retired dock and lane dredging, so no berth is dredged; 16g/16h
re-site or re-class every berth whose hull the frozen water cannot float.

## 6. The handoff build and two-run identity

The build for the owner's walk comes from a plain `terrain-chain.sh` run: the ladder
(`DELIVERED_THROUGH=16b`) builds the frozen base, its patches, the chunks and
the land-cover bake (sea-level shorelines only) and skips every stage a later
chunk owns — the water compile (16c), routes, grading, structures and the
second water compile (16e), the scatter (16f), pads and the settlement
compile (16h). The chain writes `province/ladder.json`; the studio hides
the water, vegetation, route-structure and settlement layers it lists
(owner, 2026-09-12: build only what is delivered). A full chain run on the
same base, made before that ruling, completed 21 stages in 762 s and stopped
at the postcondition gate on the old known-red register, which was
re-authored to the five applied-but-failing requests
(`world/sources/terrain/terrain-request-known-red.json`, owner 16g).

Two-run identity: §8, filled from the second forced ground-only run.

## 7. Gates added, and the defect each was shown to fail on

| Gate | Failed on |
|---|---|
| `test_terrain_preconditions.py` (6 synthetic cases + the province) | a raised trench sill, a breached shoulder, a filled bowl, a cut rim, a missing fall face and plunge bowl, a suspect fall — and, on the province, the seven defect classes in §4 |
| `test_terrain_patches.py` (the six invariants) | an out-of-bounds sample, an over-amplitude cut, a raise in a channel and a cut by a non-channel kind, a dried body, a leaking body, an undeclared hollow, an undeclared overlap, an undeclared structure crossing; a poling channel with no receiving water is refused |
| `test_freeze.py` | replacing a recorded array with different bytes without `ES_REFREEZE` |
| `test_chain_settles.py` (+3) | promoting the roads must not move the sculpt's once-frozen corridor input; no stage above the gate reads a published network |
| `hydrology_graph check` | 7 violations during the chunk (rivers in sinks, rising profiles), 0 now |
| `carve_province` itself | 19 dry bodies, then 10, 3 depended bodies moved > 0.3 m — each a solver defect above |
| `test_landcover.py` (+3, position-seeded noise) | a window not equal to the province's crop; the pad term |
| `npm test` province-raster gate | a tree whose rasters and manifest disagree (both failure modes demonstrated) |

## 8. Gates and the ladder (audit 2026-09-12)

An audit of every gate (`npm test`, the deploy workflow, all 90 Python
suites) against the ladder found 19 probes red on the ground-only build,
every one judging a layer a later chunk owns. They now SKIP, naming the
owner, through `worldgen/ladder.py` (`requires_layer`, `requires_stage`,
reading `province/ladder.json`): water (8 `test_water_invariants`, 3
`test_committed_water_facts`, 1 `test_water_fact_invariants`, 2
`test_terrain_request_postconditions`, 2 `test_macro_plot`, 1
`test_blueprint::test_live_dir_validates`, the province half of
`test_water.py`) → 16c; routes (`test_sculpt::test_road_grades_stay_traversable`,
7 `test_grade_routes` province probes, 5 `test_route_structure_authoring`
published-structure probes) → 16e; `test_vegetation_ladder::test_delivered_ladder`
(it was green on the pre-16b bundles: false assurance) → 16f. The two
studio/game-core tests that read shipped water and vegetation skip the same
way. The deploy workflow's placement steps are blocking again (the
2026-09-09 override is gone). Three real defects the audit found are fixed:
a broken fixture of this chunk's (`test_shape_province`), the graph-size
floors in `test_hydrology_graph` (re-based on the frozen graph with the
measurement in the code), and `checkCredits` silently passing when its
summary file is missing (now a standard-10 failure). Local: `test:water`
77 passed / 27 skipped; `test:placement` 517 passed / 13 skipped; `npm test`
8/8.

