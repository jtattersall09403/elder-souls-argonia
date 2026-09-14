# 16c — water once: measurement ledger (2026-09-13/14)

Evidence for Phase 16c ([brief](../../phases/16-foundation-and-places/16c-water-once.md),
decision [0063](../../decisions/0063-water-once-the-line-is-high-water.md)).
Every number is printed by `python3 -m worldgen.compile_water` (its stats
land in `water-meta.json`) or by the gate named; re-run them rather than
trust this page.

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

1. **Beds above their promise (dry gaps), 25 stations, 5 sites.**
   - 2277 E / 2815 S: the last station of a band-2 river at the sea: the
     coast bank stands 2.93 m over the level — the trench never cut the
     sea's protected collar. A 2 m dam between the river and the sea.
   - 4407–4411 E / 3922 S: two band-1 creeks at a junction, 4 stations each,
     up to 1.26 m over (the freeze gate's `reach.2355-2094` leftover: an
     approved-body rim ring crossing the channel). A 7 m dry bump.
   - 1702 E / 4367 S: a lake outlet's weir 0.18 m above the lake (one
     station). A bare lip.
   - 2454 E / 6296 S and 2389 E / 6485 S: the Blackrose lake's south outlet:
     its sill stands 0.06–0.28 m ABOVE the lake's 1.6 m for the first ~50 m,
     so the lake cannot spill and the outlet's first 20 m are dry
     (`reach.1306-3547`, 10 stations, 0.65 m at worst; the outlet's water
     hugs the graded bed from there down to the bay).
2. **Channels perched above a sheet they touch, 582 stations in 90 runs**
   (`perchedRuns` in `water-meta.json`): a river runs beside a marsh sheet
   or pond that the graph holds 0.3–1.3 m lower, with no shoulder between
   them (the carve never raises a body's bed). The compile keeps both
   levels and the wall of water between them (13,439 cells). Physically the
   two should be one level. There are three possible fixes: re-pooling those
   reaches to the sheet (a graph rule, 16a's), raising the sheet's rim as a
   patch, or accepting the walls at 90 sites.
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

## 7. Drift found (not this chunk's)

`compile_hydrology` no longer reproduces the pass on which the shaped
ground was frozen: 3 minor river cells differ (`hydrology-meta.json` 5950 → 5953),
so `shape_province` refuses with a different sha and the chain cannot run
end to end without `--from`. The frozen arrays are intact; the vault's
`hydrology-pass1.npz` was overwritten by the drifted run on 2026-09-14.
Root cause not found here; queued in the backlog for 16d's start.
