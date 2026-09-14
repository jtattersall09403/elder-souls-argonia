# 16c — water once: measurement ledger (2026-09-13/14)

Evidence for Phase 16c ([brief](../../phases/16-foundation-and-places/16c-water-once.md),
decision [0063](../../decisions/0063-water-once-the-line-is-high-water.md)).
Every number is printed by `python3 -m worldgen.compile_water` (its stats
land in `water-meta.json`) or by the gate named; re-run them rather than
trust this page.

**Round 2 (2026-09-14) is a separate page:**
[16c-round-2-ledger.md](16c-round-2-ledger.md) (owner feedback, the round-2
compile numbers, the renderer changes; decisions 0064 and 0065).

## 1. The keep-list run (brief item 1 and 5)

The OLD compiler, run once on the frozen ground before the rewrite
(`/tmp/old-compile-baseline.log` of the session; the numbers below):
bodies 2,218 solved afresh; 7,161 pooled stations had their level moved by
that re-solve (max 1.84 m) and 517 had no body under them; hovering edges
123; dry stations 31; 18 cascades; strips 149 / 13.29 km; wetted-width
ratios 0.35–0.46 (cascades), median 0.40 (strips); wet 42.2 %. Nine of the
`test_water_invariants` probes were red on it (the brief's eight plus the
gorge site). The keep list (rivers on slopes, foam drift, flow floors,
caustics, underwater, interaction) is untouched code; the strip and flow
numbers above are reproduced by the new compile to the last digit.

## 2. The graph compile (`compile_water.py`, schema 3)

| Measure | value |
|---|---|
| bodies realised from the graph / dry on this ground | 2,185 / 1 (`body.286-3055`, a 364 m² mudflat whose deepest cell stands under the sea now) |
| skipped: filled by their channel (captured / promised) · by the measured twin (authored) · lost at the carve | 75 / 14 · 1 · 3 |
| body area vs the graph's record (ratio) | median 0.984, p5 0.883, p95 1.002 |
| pooled stations reconciled to their body / max move | 8,864 / 2.93 m (in-body 5,003 · over the sea 3,541 · captured 320 · lost-at-carve kept 385); 893 backed up behind an uncut bed |
| hovering edges (census) | **161** (old compiler 123; 490 before the lateral pool rule) |
| walls where two waters meet (`waterStepCells`) | 13,439 cells, all at the 582 perched stations (§4) |
| stations with a dry bed | 10 (weir sills excluded by design) |
| beds the carve left above their promise | 25 stations at 5 sites (§4) |
| strips / km · cascades | 149 / 13.29 · 18 (keyed by graph reach id) |
| entities in the id raster | 2,801 (ocean + 2,185 bodies + 615 reaches) |
| wet / visible | 42.0 % / 41.1 % |
| directional fetch, median over the sea | 19.2 km before the cap moved to 60 km (§3) |
| draw-down (m) river band 1 / 2–3 / sheets max / seasonal reaches | 0.098 / 0.14 / 0.28 / 142 reaches to their bed |
| compile time | 82 s (old: 115 s) |

Two-run identity: the compile is deterministic (no clock, no RNG); two runs
on the same inputs give byte-identical `water-pass1.npz` (checked by the
chain's stamps, which skip an unchanged stage).

**Locality.** `compile_water --footprint chain-footprint.json` compares a
compile against the previous one and fails when the water moved outside the
patches' boxes plus the lateral reach; `patch_water` stays the gate that no
patch moved a level.

## 3. The renderer (audit root causes 1–10, mechanisms 1–7)

| Defect | Fix | Proof |
|---|---|---|
| spectrum re-pitched at the old rms (RC 1) | unit-rms table × `seaRmsHeightM(wind, fetch)`; swell floor 7 m/s | `water.test.ts`: rms 0.22 m at the floor on 60 km, mean slope > 0.02 |
| still-water drift 3 cm/s (RC 2) | ripples drift downwind at 0.5–1.5 m/s; whitecap pattern at the peak band's group speed | `stillWaterDriftMS`, `whitecapDriftMS` |
| horizon blend from 1.5 km at 92 % (RC 3) | 4–12 km, 60 % max; walk grid 12 km | `horizonBlendWeight(2000) < 0.2` |
| fetch saturated at 160 m (RC 4) | the compiled directional fetch raster (`water-flow.png` B), unbounded to 60 km | fetch median 19 km → the cap |
| fixed whitecap threshold (RC 5) | coverage 2 / 6 / 12 % by wind, threshold at the crest noise's quantile | measured share within ×0.5–2 of the coverage |
| three hard discards (M 1) | coverage terms, one discard at zero | `waterMaterial.test.ts` |
| cliff guard on dFdx (M 2) | the raster's own gradient | test string |
| owner mask wider than the ribbon (M 3) | strips at the notch level, wetted-width owner cells, dissolving mask | `strip_points_sit_inside_their_trench` |
| buried floor relaxed to −2 m (M 4) | −0.35 to −0.7 m, faded over 0.2 m | `BURIED_GUARD` |
| hard sea plane past the raster (M 5) | clamp-to-edge, CPU and GLSL | `WaterData.surfaceBase` |
| walk mesh ends at 3 km (M 6) | 12 km | `CharacterMode` |
| three lighting paths (M 7) | not unified; the probe's join measure stays (9–16 % chroma, a specular-vs-diffuse difference) | owner's eye at the gorge fall |

Wet-season rise retired (owner 2026-09-13): the tide and the season only fall
from the line (`tide.ts`); `flood-wet.png` gone; the siting fields read the
compiled band.

## 4. What the ground still gets wrong — the owner's batch

Every row is a terrain edit after the freeze (a typed patch), so it is the
owner's call. None of them is hidden: the compile counts them and the gates
hold the counts.

1. **Beds above their promise (dry gaps) — approved, patched: 5 `bed-cut`
   patches, 460 samples cut, deepest cut 4.18 m; bed-over-level at all five
   sites is 0 after the patch** (the census re-run on the patched ground,
   `author_terrain_patches water-corrections --prove`). Each run (plus one
   station either side) is cut to the promised bed of the channel solution
   (`bed(t) = L − D·ramp·(1 − t²)`, a weir floored at its level), 2 m taper:
   - 2277 E / 2815 S: the coast bank 2.93 m over the level at a band-2
     river's mouth — the trench never cut the sea's protected collar
     (37 samples, 4.18 m).
   - 4407–4411 E / 3922 S: two band-1 creeks at a junction, up to 1.26 m
     over, an approved-body rim ring crossing them (43 samples, 2.49 m).
   - 1702 E / 4367 S: a lake outlet's weir lip 0.18 m above the lake
     (25 samples, 0.18 m).
   - 2454 E / 6296 S and 2389 E / 6485 S: the Blackrose lake's outlet sill
     above the lake's 1.6 m, so the lake could not spill (355 samples,
     0.95 m) — cut to the graded outlet profile (decision 0060 §2).
2. **Channels perched above a sheet they touch — approved (option b: raise
   the sheet's rim), patched: 62 `levee` patches covering 2,104 of the
   census's 2,886 perched stations in 63 perched runs (one run is unsealable
   throughout); 19,150 samples raised, the tallest 4.50 m.** Each perched station's shoulder (the water's edge out
   to edge + 6 m, both sides) is raised to `level + 0.3 m` with a 2 m outward
   taper, never inside any water width; a levee declares `driesBodyCells`
   and the invariant checks the dried body keeps its level and its deepest
   cell. After the patch the census's perched count falls from 2,886 to 988:
   1,787 of the 2,104 patched stations are sealed. What a bank cannot seal:
   - 782 stations were not attempted — 4.5 m is the carve's own largest
     shoulder cap, so a band needing more stands on a cliff edge. The rest
     have a crest more than `CREST_REACH_M` above a run neighbour's in the same
     band is a chute step; no bank the ground can grow closes either.
   - 317 patched stations are still perched: for about nine in ten the low
     dry cell lies inside ANOTHER channel's water width (a confluence or a
     parallel channel), where invariant 3 forbids a levee to raise; the rest
     have a band cell at the crest yet still more than 0.3 m under a
     neighbouring station's water surface, or their dry cell beyond the 6 m
     shoulder band (measured 286 / 25 / 2 on the previous census of the same
     rule).
   - **Body-side rim leaks** (`stats.bodyRimLeaks`): 20 realised bodies list
     414 dry ring cells standing under their own level. 11 are patched by a
     rim `levee` (`patch.levee.rim.<bodyId>`, `driesBodyCells: false`): 494
     rim cells raised to level + 0.3 m, 907 samples moved, tallest 1.87 m.
     The other 9 this rule cannot seal: every cell they list is WET in the
     frozen water raster the invariants read, so raising it would dry frozen
     water. Only a `driesBodyCells` levee may do that, never at a body's
     own level.
3. **Hovering edges, 161** (`test_water_invariants` floor 200): lateral
   sheets meeting ground a station downstream owns lower, the biggest
   2–5 m at unclassified short drops.
4. **Unrealised approved bodies** unchanged from 16b (54 waived).

## 5. Gates added, and the defect each was shown to fail on

| Gate | Failed on |
|---|---|
| `test_no_wall_of_water_except_the_recorded_perched_channels` | 34,727 step cells before reconciliation, a step census with no perched list |
| `test_entities_name_the_graph_and_their_levels` | a label raster whose bodies stood at the old compiler's re-solved levels |
| `test_the_deepest_graph_lake_is_deep_and_flat` (re-keyed from 1470/4130) | the old world's site, 17.8 m where 20 was pinned |
| `water.test.ts` sea energy / whitecaps / drift / season / tide | the 0.185 m table, 1 % caps, 3 cm/s drift, a +1.4 m rise, a tide above the line |
| `waterMaterial.test.ts` guards | three discards, dFdx cliff, bool owner |
| `ambientAir.test.ts` hover | the ground-based band (surface + hover vs bed + hover) |
| `probe-water.mjs` motion / edge / tier | to be run on the owner's build: a static sea, a dithered waterline, a forced low tier |

## 6. Absorbed backlog rows (plan §9)

- `isReady` throw: closed in an earlier round (`WaterSurface.tsx` onReady
  ref); no recurrence in the suite.
- two overland boat lanes: `reroute_lanes` (16e) re-lines them on this water;
  `test_every_published_boat_lane…` skips until that stage runs.
- class extension above its cap: the rise bound is against the line now;
  the two class gates are green with 0.5 m of grid slack.
- hero-pool sim patches: deferred to Phase 9 boats (needs hulls to disturb).
- FFT open-sea tier: not mounted; the Gerstner spectrum now carries the
  sea's energy from wind and fetch — measure again after the owner's beach
  check before adding a tier.
- algae constituent: deferred to 16f (greenwater from the vegetation data).
- `effect` category / blend materials / editor geometry: moot — no FX mesh
  ships (0047 addendum).
- caustics, mist, barcode foam: the owner's check (§7 of the brief).

## 7. Drift found closing 16c — fixed 2026-09-14

**What it was, in plain English.** The coarse river pass stopped giving the
same answer it gave on 2026-09-13, the day the shaped ground was frozen on
it: three small river cells moved, so the next stage saw a different input,
produced a different shaped ground; the freeze guard (rightly) refused
to overwrite the recorded one — the chain could only run past that stage
with `--from`.

**Why.** The owner's one routing correction (river 1223-143 runs on to the
inlet's real mouth) names where the river ends as a position typed to 10 m
(6710 E, 790 S). Turned into a grid cell that is (col 1223, row 144) — one
row south of the river's actual last cell (row 143; the river's own id,
`river.1223-143`, names that cell). The run the ground was frozen on began
the re-route at the river's last cell; the committed code began it at the
typed cell, which was never river. In flat water every route costs the
same, so a start one row over picks a different equal-cost line: 49 new
cells instead of 46, with knock-on differences in `flow_to`, `accum_km2`,
`twi`, `salinity`, `hand`, `flood` and `regions`. Not nondeterminism: two
runs of either version are byte-identical.

**Fix.** `approved_bodies.resolve_mouth`: a correction's `fromMouth` is
snapped to the river's actual last cell (a river cell whose recorded
`flow_to` is a sink, within 3 coarse cells) and must agree with the
`river16a` id, or the compile refuses. `compile_hydrology --out DIR` writes
a scratch pass for comparisons. Tests in
`worldgen/test_routing_corrections.py` (snap, id disagreement, two applies
identical).

**Proof.** The fixed pass: `riverCells.minor` 5950, `riverCellsInSeaLevelWater`
2008; `hydrology-meta.json` and all eleven committed hydro/climate rasters
byte-identical to HEAD; `shape_province` run on it without writing gives
`4d81cdf865ed315f…`, the frozen record. On 2026-09-14 the vault's
`hydrology-pass1.npz` was restored from that run (file sha `d424684d4bcb0ffc…`);
the drifted file it replaced was `9eb354788cd289d8…` (2026-09-14 00:49).
