# Audit — the terrain chain's cycles, local patches, the border and cliffs (2026-09-11)

Read-only audit for the Phase 16 plan. Evidence is `file:line` on the tree at
`34bec0ed`; the stage order is `tooling/world-generation/scripts/terrain-chain.sh`.

## 1. The dependency graph and its feedback edges

`chain_stages` records outputs by observing mtimes and **exempts files whose
last writer is a later stage** (`chain_stages.py:16-33`): the stamp book knows
the chain has cycles and ignores them by design.

| Stage | Reads | Writes |
|---|---|---|
| `sculpt_province` | vault heightfield; **`routes.json`** (`sculpt.py:94`, `corridor_and_anchor_mask` `:118`) | `heightfield-sculpted-f32.npy` |
| `refine_province` | sculpted base, `hydrology-pass1.npz`, frozen `carve-inputs/` (`refine_province.py:476-479`), catalogue terrain requests (`:539-548`), **blueprints via `dock_dredge`** (`:171-177`), `authored-minor-waterways.json`, published `waterways.json` (`:375`) | refined height, `channels-pass1.npz`, pre-local snapshot, `ground-control.png`, flood states |
| `compile_water` ×2 | refined terrain + channels (`compile_water.py:5-18`) | `province/water/*`, `sourceHeightSha256` (`:771-815`) |
| `reroute_lanes` ×2 | compiled depth + `waterways.json` | rewrites `waterways.json` in place |
| `reroute_majors` | rasters + `routes.json` | rewrites `routes.json` in place |
| `compile_minor_routes` | routes, waterways, the plot (`:199-200`) | `routes-minor.json` |
| `grade_routes` ×2 | `refined-height-ungraded-f32.npy` snapshot + routes (`grade_routes.py:28-31`) | refined height (a diff on the snapshot), stretch export |
| `author_route_structures` / `compile_route_structures` | stretches, graded height, kit json | `route-structures.json`, compiled pieces |
| `grade_settlement_pads` | **blueprints** (`grade_settlement_pads.py:35,283`), graded height | refined height, pad receipts |
| `compile_chunks` / `export_web_chunks` | refined height (`--footprint`) | chunks + a province-wide gradient texture (`export_web_chunks.py:19,59-71`) |
| `rebake_landcover` | height + `water-pass1.npz` | `ground-control.png` (province-wide, one rng stream, `rebake_landcover.py:11-27`) |
| `rederive_blueprints` | shipped rasters | rewrites blueprint derived geometry (`rederive_blueprints.py:1-18`) |
| settlement compile/export/paint, `compile_scatter` | blueprints, `ground-control.png` (`compile_scatter.py:117`) | placements, bundles, paint, vegetation |

Feedback edges (file → why):

1. `sculpt` ← `routes.json` ← `reroute_majors` — corridor suppression; live, hard-skipped behind `--allow-sculpt` (`terrain-chain.sh:318-327`; STILL OPEN in `carve_routes.py:41-49`).
2. refine carve ← routes — fixed 2026-09-09 by the frozen `carve-inputs/` promoted by `carve_routes --promote` (before it, two identical runs moved 147 of 1,809 files).
3. `reroute_lanes` — admitted two-run edge: the dredge runs earlier in refine, "one pass repairs the line; a second serves it" (`terrain-chain.sh:104-110`).
4. `dock_dredge` ← blueprints — terrain cut inside refine to satisfy a place's berth (`dock_dredge.py:21-30`).
5. `authored_waterways` ← `authored-minor-waterways.json` — place-serving channels carved in refine.
6. `terrainRequests` ← catalogue — applied inside refine, re-checked against the final raster by a separate stage: a two-pass loop by construction.
7. `grade_settlement_pads` after both grades — moves ground under structures (the script's own comment).
8. `compile_water` twice — the grader needs this run's water; the shipped water needs the graded ground.
9. `rederive_blueprints` — the ground moves, so every derived footprint, district and door drifts and the settlement compile refuses.
10. `grade_routes` twice around `author_route_structures`.

Places feed terrain at 4–7, terrain feeds places at 9, routes feed terrain at 1–2. That is the circularity.

## 2. What "terrain once, water once" needs

- **A — base terrain freeze**: sculpt + refine *minus everything place-derived* (deterrace, channel carve from the hydrology graph, lake, portages, fluvial continuum, plunge bowls, benching, detail noise; `refine_province.py:498-560`). Edge 1 closes by swapping `sculpt.py:94` for `carve_routes.carve_source` in the same commit that re-freezes the sculpt.
- **B — water once**: `compile_water` runs once on A; `body_levels`, `body_sheet`, `sea_full` (`compile_water.py:784-790`) become read-only facts. `reroute_lanes` stays as a lane *repair*; a lane that cannot be sailed is re-lined or the promise is lowered — the boat adapts to the water.
- **C — routes, grading, structures**: grading already writes a diff on an immutable snapshot; it must be forbidden from crossing a channel rather than re-solving water.
- **D — places macro → meso → micro** reading frozen A+B only; `rederive_blueprints` becomes a one-off.
- **E — local terrain patches**: the only place a place may move ground. Dock dredges, pads, authored poling channels and typed terrain requests are the four genuinely place-dependent edits; all four are already implemented as bounded carves (two of them are exactly what `recarve_local.py:1-30` re-applies), so they move out of `refine_province` and become stage-E patches with the water solved in B as the receiving level.

## 3. Local terrain patches on frozen terrain

The mechanism half exists: `footprint.py:1-30` (half-open sample boxes, widen-only), `recarve_local.py` (restart from `refined-height-prelocal-f32.npy`, exit if anything upstream moved), `compile_chunks --footprint` (`compile_chunks.py:19-31`), `export_web_chunks --changed` (`:16-22`), `compile_scatter --footprint`. Measured: one dock edit costs 313 s on the fast path against 438 s for the full chain, because the floor is province-wide work: `compile_water` (priority flood), `rebake_landcover` (38 s, one global rng stream, "NOT INCREMENTAL, on purpose"), the province-wide gradient texture, plus both grades, structures, pads, `rederive_blueprints` and `compile_settlement`.

- `compile_water` **can** be local under the frozen model only: re-flood a bbox at the already-decided level and assert no body gains or loses boundary connectivity.
- `rebake_landcover` can be tiled once its global rng becomes position-seeded noise and the global distance transforms are cached from the freeze; the rng change moves the shipped paint once.

Proposed `world/sources/terrain/terrain-patches.json` (schema v1, ids stable, applied in id order from `refined-height-frozen-f32.npy`, so patches are re-appliable and removable like grading):

```
{ "id": "patch.pad.lilmoth-market", "kind": "raise-pad|flatten-to-plane|cut-channel|lower-bowl",
  "reason": "…", "bboxM": [x0,z0,x1,z1], "blendRadiusM": 6.0,
  "datum": {"mode": "max-sampled|level", "valueM": …}, "tiltDeg": 0.7,
  "maxDeltaM": 2.0, "source": {"blueprint": "place.…", "parcel": "…"} }
```

Invariants (fail, never clamp): no sample inside a channel cell or its shoulder; no water level or body extent changes (re-flood the bbox and assert equality); `|Δh| ≤ maxDeltaM`; no overlapping bboxes without declared order; Δh exactly zero outside bbox ⊕ blend; no crossing of a route-structure window or graded way without declaring it.

## 4. Beyond-border land

**The "northern border is 100 % below sea level" claim is false.** Measured from the committed preview rasters (`provinceMap.ts:61-63` decode, row 0 = north):

| Edge | base raster fraction above 0 m | refined raster |
|---|---|---|
| North row | 1.000 (mean 30.8 m, max 119 m) | 0.997 (mean 214 m, max 654 m) |
| West column | 0.602 | 0.611 |
| NW corner block | 1.000 | 1.000 |
| South row | 0.000 | 0.000 |
| East column | 0.004 | 0.003 |

South and east are the ocean; north is the mountain belt; the earlier agent inverted the axes.

**No neighbour worldspace ESPs exist in the vault**: `tamriel-worldspaces-118678` holds only `Argonia.esp`; the "126×126, −62..63" figure is our own `meta.json` `cellRange`, misattributed to Morrowind. What does exist is `mod-sources/all-tamriel-heightmap-573/…/TamrielBeta_10_2016_01_prepped.png` (20480 × 16384, 16-bit). Registered by normalised cross-correlation: 8 full-res px per cell (~7.3 m/px), match at full-res (11960, 17752), **r = 0.826** over the whole province; land-only fit ≈ 0.0152 m/unit − 50 m (r 0.63). The strips north, west and north-west of the match are 100 % land (p50 ≈ 8 / 28 / 18 m).

Recommendation: **stitch the neighbour slice from the all-Tamriel heightmap** (canon-shaped, C0-joinable by fitting scale/offset on the shared border ring, one offline stage); extrapolate only beyond that raster's edge. Runtime per `beyond-border-distant-lands.md:26-40`: one static low-res mesh per mode, no shadows, shared haze uniforms, no colliders; the boundary wall message in `packages/text-catalogue`. Gotchas: credit mod 573 in the root README in the same change; the 671 MB PNG never enters the repo.

## 5. Cliffs

Shaping: `sculpt.bench` (`sculpt.py:218-231`, band 26 m, only above `BENCH_MIN_Z` 110 m, `:72-74`), `crag` ridged noise (`:234-241`), talus at `TALUS_TAN 0.78` (`:59`), then region detail noise (`refine_province.py:505`). A heightfield is single-valued: **no overhang or undercut is representable**, and a face is limited by the 1.828 m sample pitch. Materials: `landcover.py:230-232` paints `MOUNTAIN_ROCK` above slope 0.14 in regions 1/2 else dirt cliff; scree `:90-97, 240`; slots `mountain_rock = mountains/mountainslab01.dds` at 16 m, `trop_rocks = rocks01.dds` at 12 m (`build_ground_materials.py:113-137`). The studio shader is already triplanar (`apps/world-studio/src/groundMaterial.ts:174-183`), normals from a province-wide gradient map (`:63-67`).

Unused Tropical Skyrim vertical-face candidates (`tropical-skyrim-33017/extracted/textures/landscape/`): `mountains/mountainslab02.dds` (+`_n`), `dirtcliffs/dirtcliffs01.dds` (+`_n`), `dirtcliffs/dirtcliffsroots01.dds` (rejected once as ground tiling, `build_ground_materials.py:129-131`; valid on a side projection), `rocks01`, `reachmossyrocks01`, `tundrarocks01`, `fallforestrocks01`, `rocksedgetrim01_n`.

A cliff pass, in increasing payoff: (1) heightfield — lower `BENCH_MIN_Z`, noise-varied band spacing (a re-sculpt, so a freeze decision; never overhangs); (2) material — a dedicated cliff slot sampled only on the triplanar side projections with its own tile and normal map (the biggest win, no rebuild); (3) placement — rock scatter on cliff bands, **which is how Skyrim does cliffs** (71 meshes under `meshes/landscape/rocks/` incl. `rockcliff01..08.nif`, 20 under `landscape/mountains/`, Tropical Skyrim retextures them); **no rock kit is built yet** — a kit-build job.

## 6. Freeze state

The sculpt is frozen in practice, not reproducibly: hard-skipped, and today's code no longer reproduces the August array (max 67.8 m, 5.8 % of samples > 1 m); `heightfield-sculpted-august-2026.npy` is the durable copy. Carve inputs are frozen and committed (`carve-inputs/`, `carve_routes --promote`, `test_chain_settles.py`). The byte-identical two-run test has never been run; the fast path is measured, not proven identical. 46 erosion pits (34,933 samples) inside > 60 m terrain render as deep mountain lakes via `forcedBasins`.

A re-freeze needs: (a) which sculpt is the base; (b) pits filled or accepted; (c) `sculpt.py:94` → `carve_routes.carve_source` in the same commit; (d) hydrology + society re-solve and a re-plot; (e) `chain-manifest.sh` zero differences across two forced runs.

## 7. Proposed stage order

1. `sculpt_province` (corridor mask from frozen carve inputs) — once, content-addressed
2. `compile_hydrology` → `derive_hydrology_graph` (Phase 16a)
3. `refine_province_base` — no blueprints, no dredges, no authored waterways, no terrain requests → `refined-height-frozen-f32.npy` + sha
4. **FREEZE GATE** — hash recorded, owner sign-off
5. `compile_water` — once; levels and bodies become read-only facts
6. `compile_society` / `reroute_majors` / `compile_minor_routes` on frozen A+B
7. `grade_routes` → `author_route_structures` → `grade_routes` → `compile_route_structures` (a patch stack on the frozen base)
8. `macro_plot` → meso → micro, reading frozen A+B only
9. `apply_terrain_patches` (pads, dock dredges, poling channels, typed requests)
10. `patch_water` — bounded re-flood inside each bbox at the frozen levels; fails if a level or extent would move
11. `compile_chunks --footprint` → `export_web_chunks --changed`
12. `terrain_request_postconditions`
13. `rebake_landcover` (tiled once position-seeded)
14. `rederive_blueprints` → `compile_settlement` → `export_settlement_bundle` → `settlement_ground_control` → `compile_scatter`
15. `build_border_apron` — independent after step 4

## 8. Owner decisions to re-rule

1. Re-freeze the sculpt: today's code or the August array (blocks everything).
2. Fill or accept the 46 erosion pits before the freeze.
3. Decision 0025's chain order is superseded by the partition above (→ 0057).
4. 0047 addendum: water is solved once and read-only to places; a place that cannot be served adapts; only a typed patch may touch the bed.
5. Whether a dock dredge or pad may be a post-freeze patch at all, or hull classes are decided from the frozen water (stricter, cheaper).
6. `rebake_landcover`'s rng → position-seeded noise (moves the shipped paint once).
7. Backdrop apron: stitched all-Tamriel slice (recommended) vs procedural; credit line for mod 573.
8. Cliff pass scope: material-only vs material + re-sculpted benching.

## 9. Ranked risks

1. Freezing a base nobody can reproduce (the sculpt drift; `--allow-sculpt` has destroyed it twice).
2. A patch silently moving a water level — the invariant must fail, never clamp, and be shown failing before it is trusted.
3. `rebake_landcover` tiling reshuffles paint the owner has reviewed.
4. Dock promises become unsatisfiable when the dredge leaves refine — the two remedies `dock_dredge.py:9-20` forbids today become the only remedies; a design conflict, not a coding one.
5. Grading is an unpatched terrain edit with no bbox discipline; it needs the same invariants.
6. `sculpt.py:94` cannot be fixed without a re-sculpt, so risk 1 and the last live cycle are one decision.
7. The fast path saves less than it looks (313 vs 438 s): justify the model on correctness and decidability, not rebuild cost.
8. The apron's height calibration is a global fit; fit on the shared ring or a step remains at the border.
