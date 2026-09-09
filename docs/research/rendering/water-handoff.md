# Continue water work — resume point (water round 2, decision 0047)

Read after `CLAUDE.md` and [decision 0047](../../decisions/0047-water-one-physical-model.md)
(root causes, the data contract v2, the vanilla-asset merge addendum). This
file is the resume document: **everything a fresh agent needs to pick the
round up after a cut-off.** Keep it short and current.

**Keep-current rule (owner 2026-09-08).** The lead commits and pushes after every
agent report or landed step and refreshes the state table below in the same
commit; delivery agents append to the "Resume log" sections in
[water-quality.md](water-quality.md) after each fix. A fresh agent must be able to
continue from the repo alone at any moment, with nothing to be explained.

## State at the last update (2026-09-08, evening UTC; refreshed with every push)

| Piece | Where | Status |
| --- | --- | --- |
| Runtime: signed-depth wetness with tide/season lift, terrain-cut shoreline with vertical fade, whitewater strips, along-flow undulation + flecks | `packages/game-core/src/water/**` | done, committed |
| Waterfalls: cliff-only falls, piece-stacked bodies on the traced path with the vanilla textures and Bethesda's measured layer speeds, crest wrap, side strips, plunge base quads, lip alignment guard | `render/WaterfallSheets.ts`, `PlungeBase.ts`, `whitewaterStreaks.ts`, `kits/waterfall-fx-textures/` | done, committed |
| Waterfall mist cards, basin ground-mist discs, skirts | `render/WaterfallMist.ts` (+ test) | done, committed `4be351a` |
| Numeric waterfall fit checks in the probe (fall/foam luminance band, ≤ 25 % join steps, submerged, frame rate with vs without the falls layer) | `apps/world-studio/scripts/probe-water.mjs` | done, committed `287e474`; not yet re-run on the final data |
| Water Pro transfers: flow-advected foam energy field, depth-range shore froth, JONSWAP spectrum + standing waves (CPU twin), rain rings, sparkle + crest SSS, horizon blend, meniscus, 8192 s time fold, swept-path contacts, one foam texture family | `render/FoamField.ts`, `waves.ts`, `waterMaterial.ts`, study §6 | done, committed |
| Terrain chain 13.7 → 5.5 min, unchanged rerun 11 s, per-stage timings, stage skipping | `scripts/terrain-chain.sh`, `worldgen/chain_stages.py`, `fastfilter.py` | done (idempotency gap queued in the backlog) |
| Vegetation rollout recorded; palettes widened 39 → 65 species | decision 0036 addendum, `build_palettes.py` | done; bundles rebuild with the chain |
| Dev-loop speed: parallel workspace gates + incremental `tsc` landed `e7e34ac` — `npm run typecheck` 93 s → ~10 s, `npm test` 36 s → ~15 s | root `package.json`, `tooling/repo-standards/run-workspaces.mjs` | done, committed |
| Probe boots once and teleports between sites (a fresh browser context per site costs 4–5 min of software-GL shader compilation on every flyover site) | `App.tsx`, `Fly3D.tsx`, `probe-water.mjs` | in progress |
| Studio: the character spawned at the waterline instead of on the ground below it (the owner's "spawn on sand, not in water" at the beach) | `character/spawnHeight.ts` (+ test), `CharacterMode.tsx` | fixed, uncommitted |
| Research: Water Pro study, waterfalls from measured NIFs, vault asset audit | `docs/research/rendering/` | done |
| **Compiler: one physical model on full-res terrain** | `channels.py`, `compile_water.py`, carve in `refine_province.py`, `test_water_invariants.py` | in progress — see below |

## How to resume the compiler (the critical path)

1. `cd tooling/world-generation && python3 -m pytest -q worldgen/test_water_invariants.py worldgen/test_water.py`
   — the failing tests ARE the to-do list. Each encodes an owner-visible
   defect. Fix root causes in `channels.py` / `compile_water.py` / the
   carve; never loosen a test without a numeric reason written in the test.
2. Read the "Resume log" at the bottom of [water-quality.md](water-quality.md).
   Watch `stats` in `water-meta.json`: `hoveringEdges`
   must be 0, `dryCoarseRiverCells` 0, `maxDepthM` only where a real closed
   basin exists.

   **`roadCellsDeepInWater` is NO LONGER a number to drive down** (owner
   ruling 2026-09-09) — do not try, and do not re-add what was removed to
   achieve it. Two mechanisms used to hold it near zero by suppressing the
   water rather than crossing it: `standing_water` capped or deleted any pool a
   way touched at 0.30 m, and `channels` cut a bridged river section to a 0.30 m
   ford. So the pipeline built a bridge over a river and then flattened the
   river to ankle depth underneath it. Both are deleted.

   What the honest number now shows is CONTENT: 57 water crossings province-
   wide, 45 on lakes and 12 on rivers, the river ones 16–108 m wide and
   1.2–2.0 m deep. Note that the shipped figure was always dominated by
   something these mechanisms never touched — 5,511 of 6,198 cells are SEA, the
   route solver's ferry crossings.

   **The real gap behind it:** a water crossing can never become a built
   structure today. `author_route_structures.author()` takes no water input at
   all, and `grade_routes` excludes every wet sample from the stretches it
   emits, so a river crossing is invisible to the piece author. There is no
   `ford`, `ferry` or `causeway` kind in `compile_route_structures.KIND_ROLE`,
   and the longest deck piece runs 13.3 m. Those 57 crossings need authoring —
   as ferries, declared fords, or spans from a kit that can reach across
   them — and that is the job, not driving a statistic down.
3. Rebuild: `./scripts/terrain-chain.sh --from refine_province` (never let
   `sculpt_province` re-run — polish backlog; `compile_water` runs twice by
   design — before grading so the road grader sees the channels, and last on
   the graded ground that ships), then `python3 -m worldgen.apply_sitings`,
   then `python3 -m pytest -q -n auto` and `npm run test:placement`.
4. Data contract v2 is frozen (0047 § Decision): the runtime is coded to it.

### Owner decisions, 2026-09-09

- **Sap-Tapping's landing moves to the water** (not a dug channel, not dropped).
  The berth stands 104.4 m from any water carrying a canoe's 0.6 m, on ground up
  to 1.48 m above it, so it cannot be dredged. The landing and the place anchor
  move about 92.6 m on bearing 242 degrees to the head of reach 118 at
  ~(3435, 4454), where the approach is wet at every sample and dredges to
  0.85 m. The place's plotted anchor was already 808 m from its own
  `sitingPrefs.nearPoint`, so the re-siting is chosen by the playbook rather
  than by translating the old dot.
- **The deploy is held** until that berth is fixed, rather than moving the debt
  gate out of the deploy-blocking job. `test_blueprint::test_live_dir_validates`
  (and, on some builds,
  `test_minor_waterways::test_no_berth_is_refused_in_the_published_network`)
  carries it. The current full red list is in the next section and in the
  workflow's own comment — keep the two in step.

### The water suites now gate the deploy, and the boat lanes come ashore (2026-09-09)

**The acceptance suite gated nothing.** `worldgen/test_water_invariants.py` and
`worldgen/test_water.py` were in none of the four commands
`.github/workflows/deploy-pages.yml` runs, so the whole water contract — rivers
reach the sea, no cell hovers, a fall is a cliff, a lane carries a hull — had
never blocked a deploy. Both are now `npm run test:water`, wired into the
**Python** job (they import numpy/scipy; the Node build job has neither, which
is what broke the prose linter last time). Cost: **9.8 s** with the vault, 1.3 s
without. Its province half skips on a bare runner exactly as
`test:placement:slow` does, so the real measurement happens on a machine that
has the world; `test_water.py`'s synthetic worlds and the new
`test_reroute_lanes.py` run for real on the runner.

**Three published lane stretches ran overland**, and the cause was the one
found five times over: `compile_society` builds its boat cost from the Phase 3
hydrology pass — `ocean`, `lakes`, `rivers`, `tidal`, `wetlands` — every one a
*type label*, never a depth. `tidal` and `wetlands` are cheap in
`routes.boat_cost_surface`, so the solver cut a headland whose cells are
labelled `tidal` while standing metres above the sea. At 3120 E / 6860 S:
`hydrology-pass1.npz` says `tidal=True`, the compiled signed depth says
**−5.28 m**.

`worldgen/reroute_lanes.py` is the water counterpart of `reroute_majors`: it
re-solves only the overland stretches of the **published** `waterways.json`,
on the compiled signed depth read through `water_report.ShippedWater`, inside a
local box, keeping every id, class and declared berth.
`waterways-natural.json` — the siting seam — is untouched, so no committed
record re-plots. Passable is *wet*, not *deep enough*: a shallow is dredged
(`dock_dredge.dredge_lanes`) and dry ground is not, so shallows are dearer but
crossable and dry ground is a wall. The repaired line is exact metres in a new
`pointsM` (the poling channels' existing convention, now honoured for lanes in
`province_network.load_network`); `px` stays the coarse studio trail. Re-running
it with nothing to fix rewrites nothing (verified: identical md5).

Measured, `route.boat.soulrest-lilmoth`:

| stretch | before | after |
| --- | --- | --- |
| 3054 E / 6926 S | 576 m overland, up to 5.76 m above its water | gone — longest remaining hop on that stretch 12 m |
| 3545 E / 6682 S | 178 m | gone |
| 3778 E / 6536 S | 16 m | gone |

Lane length 4514 → 4544 m (+0.7 %); the line moves 8.9 m on average and 71 m at
most. Every other hop on the lane is unchanged and ≤ 82 m, inside the range of
the province's declared portages (11–89 m).

**Open, and an owner call.** `route.boat.blackrose-lilmoth` still crosses
**122 m** of dry ground at 3142 E / 6026 S and `reroute_lanes` reports it
`unsolved` rather than inventing a line. It is not a beach: it is a class-5
marsh flat standing 0.05–0.93 m above a level-0 water table, with **no standing
water in either season**, and the nearest wet detour is 4 226 m for a 316 m
gap. Blackrose's own lane terminal reads −1.68 m on the shipped rasters, so the
lane cannot be re-solved against water the compiler has not delivered yet. Two
honest answers, both yours: declare the carry (it is 37 % longer than the
province's longest existing portage, and `LANE_PORTAGE_MAX_M = 100` was read
off those), or make the flat water in the carve. Re-measure after the chain run
before deciding — the marsh may close.

`test_no_extension_cell_stands_above_its_own_water` is red at **80 942 cells
(2.434 km²)**, and the claim that a chain run clears it is VERIFIED, not
trusted: the shipped `water-meta.json` `klass` block carries no `extPx` /
`extRiseM`, so the class raster on disk was baked by `2eaac9a4`, before
`e7bbd279` added `CLASS_EXT_RISE_M`. The next `compile_water` re-bakes it under
the cap.

### Closed 2026-09-08 late evening

The round's own work is delivered and measured — the evidence, one row per
owner item, is [water-round2-evidence.md](water-round2-evidence.md). What is
left is a handover, not a loose end:

1. **The authored local hydrology placement half is now done (`16b1860`).**
   `compile_minor_waterways` publishes the exact authored metre-space line and
   terminal rather than its own A\* substitute. The independent consumer check
   now measures Nine-Trunks at the south-of-ring dock: exact terminal, 1.32 m
   minimum over the first 100 m against the 0.6 m canoe promise. Do not move
   this berth or replace the authored line.

   **The physical-water half remains the next water job.** On the current final
   rasters, `terrain-request-postconditions.json` has 50/66 passing and 16
   non-passing requests. The remaining failures are final water identity,
   wetness, depth or current delivery (plus survival at the two Reedcutters /
   Onkobra operations), not blueprint-placement work. The independent dock
   consumer adds two concrete witnesses: the Sap-Tapping landing falls to
   0.00 m over its first 100 m (needs 0.6 m), and Lilmoth's lighter quay falls
   to 1.20 m on Soulrest–Lilmoth and 0.84 m on Blackrose–Lilmoth (needs 3.0 m).
   Nine-Trunks and Wamasu Pond now pass. Nine-Trunks' complete settlement
   compile also leaves two honest flood-band warnings: both guest huts have
   57/57 natural-flood-band samples but 0/57 open-water and 0/57 wet-season
   samples. Preserve the authored ring and require final raised-pad evidence;
   do not move or relabel the huts to silence the finding. Keep these failures
   red until the physical compiler makes the authored cuts wet, labelled, deep and correctly
   current-bearing; do not lower hull classes or move fixed berths to hide them.
2. **The falls' shape** — partly closed 2026-09-09, three named things left.
   Their light was wrong (the aerial-haze feeds, at a tenth of the sky) and
   the sheet was a slab: flat 0.89–0.91 alpha across its middle, with the
   streak noise that breaks up the strips moving it by 2 %. Both fixed — the
   profile is derived from critical flow over the lip and the margins fizz
   with the strips' own whiteness law — and the falls take shadow now (0.43 of
   open sun at a quarter visibility). All five fall probe sites pass. What
   remains is in the polish backlog with its measurements: the crest is a
   straight terrain edge because that is the compiler's lip geometry; how wide
   a fall is *drawn* is an owner call (the compiled width is right to ×1.00
   against the stream feeding every fall); and the warm ivory is the world's
   midday sun at the owner's locked `warmthBias = 1.0`, not the falls' albedo.
3. ~~One hovering cell remains~~ **closed 2026-09-09.** `hoveringEdges` is 0
   with no pinned site. The cell at 113 E / 1201 S was not one flood step
   short: it is 6.74 m from a steep station (inside a 7.05 m half-width) and
   its dry 4-neighbour is 8.17 m out, outside every band, with the same
   river's next stretch 4 m further down that wall — claiming it starts a
   smear down the chute. A chute is drawn by the strip ribbon, not the field
   raster, so `compile_water.strip_corridor` excuses the ground each ribbon is
   drawn over, exactly as `sheet_corridor` does for a brink.
   `stats.stripEdgeCells` is its **marginal** yield over the sheet corridor
   and reads 1 province-wide. The shipped rasters are byte-identical to the
   previous compile: only the census and the gate moved.
4. ~~`fall-20m-under` reports `|still − ground − depth| = 0.21 m`~~ **not a
   compiler defect, 2026-09-09.** The shipped depth is exact at that site: at
   all four texel centres around the camera (2173.9 E / 268.4 S) the B channel
   equals W − ground within a quantum, pinned by
   `test_site_2174_268_depth_matches_w_minus_ground_at_the_texel_centres`. The
   probe compares a *bilinear* sample of the 3.66 m depth texture against
   ground read from the 1.83 m terrain, and bilinear filtering only commutes
   with a linear ground. In fall-20m's plunge bowl the ground crosses 274.89 →
   277.41 m across that one texel quad, so the two arithmetics differ by
   0.19 m at the camera (measured) while every texel is right. **Probe fix APPLIED 2026-09-09.**
   `apps/world-studio/scripts/probe-water.mjs` now samples ground at the four
   depth-texel centres around the camera (`±mpp/2`, `mpp` from the new
   `surfaceMetresPerPixel` field on the probe summary) and gates on
   `gap < 0.15 + 0.5 * (max − min)`. On flat water the relief is ~0 and the gate
   is exactly as tight as before. The falls' frame-rate ratio, which sat beside
   it in the polish backlog, now REPORTS instead of asserting below 5 fps —
   under software GL those sites run at 1.3–2.0 fps, where the window holds too
   few frames for a ratio to be a measurement (it gave x1.37 and x0.89 on
   consecutive unchanged runs).

5. **The class raster's extension is now DERIVED, not chosen (2026-09-09).**
   `CLASS_EXT_PX` was a hard-coded 4 px. The right number comes from what the
   ground shader actually samples past the waterline: `SURFACE_WETNESS_GLSL`
   gates its wet-shore band on `esWetShore < 22.0` m and reads the class raster
   bilinearly, so it needs a class out to 22.0 m plus a half-texel halo
   (`mpp·√½` = 3.88 m) — 4.72 px, so **5 px (27.42 m)**. Four was too NARROW,
   not too generous: measured on the shipped bake, 3 311 dry cells (0.100 km²)
   INSIDE the shader's own 22 m band carried no class at all, and 15 869 more
   (0.477 km²) in the halo. `compile_water` now computes the radius from
   `CLASS_SHADER_BAND_M`, so it moves if the shader's band moves, and publishes
   `klass.extPx` / `klass.extM` / `klass.extShaderBandM` / `klass.extRiseM` in
   the meta so the shipped contract and the code cannot drift apart.

   The radius was never what made 6.50 km² of the raster dry all year, though.
   Most of that is marsh and river margin that floods for months — the world
   working. The defect was the **2.72 km² standing more than 2 m above any
   water at any season** (polish backlog), and the cause is that the dilation is
   purely LATERAL: on a steep bank 5 px of it runs metres uphill. The extension
   now carries a second bound, `CLASS_EXT_RISE_M = 2.0`, measured against the
   seasonal MAXIMUM of the water that gives the cell its class, so a marsh
   margin keeps its label and a bank does not. Two invariants hold it:
   `test_class_covers_the_band_the_shore_shader_reads` and
   `test_no_extension_cell_stands_above_its_own_water`. What the cap cannot
   reach — 1 577 cells classed by the WET mask's own block-max on a steep
   bank — is a resolution problem and is queued in the polish backlog.

**CI is green and the round is deployed** (`04e78dd`, 2026-09-09 00:40 UTC).
Two breakages found by CI on the way there, both fixed: the prose linter
reached the route-structure sentences by importing a numpy-dependent module,
which the Node build job cannot do, and the re-carve produced short over-cap
windows no piece fits, so 38 structures shipped to the studio with zero
pieces. Four settlement tests that need the gitignored asset-kit build output
now skip on a clean checkout instead of failing it.

### How the compiler got there (2026-09-08 evening)

- **Phase 11 authored local hydrology is now part of the water compiler
  hand-off.** The plot/blueprint side owns the promise and the exact authored
  geometry; the water compiler owns making it real water. Start from
  `worldgen/hydrology_intent.py` and
  `world/sources/routes/authored-minor-waterways.json`: connect each typed
  water-bearing terrain request and authored local centreline to a named
  physical reach *before* the final water publication. Do not let
  `compile_minor_waterways` invent this geometry from the already-published
  water, because that recreates the circular validation that hid the
  Nine-Trunks defect. Acceptance is deliberately end-to-end: the authored
  line is carved and wet continuously, receives the promised water class and
  depth, joins a named natural reach, and retains its exact terminal after the
  final grading pass. Nine-Trunks is the regression witness: its centreline
  must end exactly at `[4992.745, 3786.371]`, the berth and landing path must
  meet that terminal south of the nine-tree ring, and the first 100 m from the
  berth must remain continuously at least 0.6 m deep. The Phase 11 blueprint
  and terrain-postcondition gates remain the independent consumer-side proof.

- **Hanging river terminus — fixed.** `build_reaches` stopped a river at its
  last *river* cell, so the one outlet whose coast is a 35 m cliff (reach 111,
  world 166 E / 4619 S) left its clifftop level over cells hanging above the
  shore. A sea-draining terminus is now extended down `flow_to` to the first
  ocean cell. `hoveringEdges` 1 → 0.
- **A fall may land in a body.** A run was refused when *any* station in it was
  pooled, which refused six measured cliffs whose water lands in a lake or the
  sea. The plunge station alone may now be pooled — that is what a plunge pool
  is. The lip and the interior may not.
- **A fall must be a cliff, not a long ramp.** `_fall_runs` grew a run from
  segments at ≥ 27° and accepted it on a ≥ 50° *mean*, so a whole 51°
  mountainside qualified: `fall-7` (225.9 m) and `fall-17` (26.7 m) were
  sheets thrown down a slope. Measured on the shipped profiles, the other 18
  cascades each accumulate 5.6–132 m of face at ≥ 70° and those two accumulate
  **zero**, so the run threshold rises to 70° and the invariant now asserts it.
- **Chain: the structures stage must reconcile.** `compile_minor_routes` on the
  re-carved ground dropped `track.dunmer-north.the-diggings-ladder`, and
  `author_route_structures` died on the first orphaned entry in
  `route-structures.json` with a bare `KeyError` — which left the second
  grading pass without its decks, so the grader cut a 51° hillside at
  1944 E / 211 S and broke two water invariants there. The stage now drops
  structures whose way is gone (reporting each) and collects every unauthored
  `why` survivor into one failure instead of raising on the first.

## The waterfall fit pass — DONE (2026-09-08, `4be351a` / `287e474`)

Mist cards, basin ground-mist discs and skirts are built and wired
(`render/WaterfallMist.ts`), and the probe's fit checks are numeric: fall body
luminance within ×0.6–1.6 of adjacent foam, no > 25 % luminance step across
the lip or plunge joins under the layer toggles, correct from underwater,
frame rate with the falls layer ≥ 0.9 × the same page without it. A fit site
names the PLUNGE it looks at in metres and resolves the nearest compiled
cascade, because cascade ids are renumbered by every compile. The checks
passed on the 2026-09-08 11:33 data and must be re-run on the final data.

## Dock approaches are DREDGED, not demoted (2026-09-09, awaiting the rebuild)

`worldgen/dock_dredge.py` (rule written out in its module docstring; unit
tests in `worldgen/test_dock_dredge.py`, no vault needed) closes the physical
half of the dock promise. It reads every `docks[]` entry and its water
`networkTerminals[]` from the blueprints, takes the serving route's geometry
from the published network, and where the first `DOCK_DEPTH_SAMPLE_M` does not
already carry `HULL_CLASS_DEPTH_M[hullClass]` it cuts a channel along that
route: hull-sized width, sloped sides, bed at the LOCAL water level minus the
promise (levels are read per sample and made non-increasing outward, because a
100 m marsh or tidal reach crosses a gradient and one number would leave a
sill), run on past the promise until it meets water already deep enough so the
reach fills from the open water. It only ever cuts, and it never touches a cell
standing at or above the waterline. Called once from `carve_to_profile` after
`authored_waterways.carve_authored`; its rows land in `stats["dockApproaches"]`.

**And along whole published lanes, 2026-09-09.** A dock's promise is only its
first 100 m; the six published `route.boat.*` lanes are promises too, and 876 of
3 071 shipped lane cells carried less than a canoe's 0.6 m in the base season.
`dock_dredge.dredge_lanes` applies the same machinery to the whole line (rows in
`stats["laneChannels"]`): 986 shallow samples with water over them are cut to
0.6 m, an above-water run up to `LANE_PORTAGE_MAX_M` (100 m, the ceiling read
off the province's own declared portages, which run 11-89 m) is REPORTED as a
portage and never touched, and a longer one is `blocked` — see the polish
backlog for the two lanes that trip it, which are lane geometry and not water.

The port's channel is dug because that is what a working port does — the berth
is fixed by what stands on it and the hull class is a claim the catalogue and
the quests make, so neither may be moved to make the check pass.

Measured on the shipped rasters (published water surface as the level field),
before the rebuild:

| dock / route | verdict |
| --- | --- |
| Lilmoth lighter quay / Soulrest–Lilmoth | dredged 366 m × 30 m, 26 223 m³, max cut 3.25 m, 1.18 → 3.25 m |
| Lilmoth lighter quay / Blackrose–Lilmoth | dredged 358 m × 30 m, 20 463 m³, max cut 3.25 m, 0.86 → 3.25 m |
| Sap-Tapping landing / its landing channel | **blocked, nothing cut** — RE-MEASURED 2026-09-09 against the moved berth at `[3309.400, 4815.000]`: 18 of 51 approach points stand above the water, minimum depth −1.32 m. The berth itself is fine (0.60 m); the fault is the published route's first segment, a straight 199.7 m join from the berth to the first real water cell. **Fixed at source:** the creek is now authored (below) |
| Wamasu Pond lane landing / its lane | **PASSES, 2026-09-09** — re-measured against the current blueprint: 0 of 51 points above water, minimum 0.84 m over the first 100 m against a 0.6 m canoe promise. The old row predates the rebuild |

Sap-Tapping is a missing authored-water delivery, not permission to move its
settlement geometry. The blueprint's dock, network terminal and local canal
end exactly at `[3309.400, 4815.000]` (the berth has moved twice since the
table above was written); its 11.86 m plank walk and the licence board facing
318° depend on a canoe arriving from the north-west. The published minor route
instead joins the berth to its first real water cell 199.7 m to the south with
one straight segment, fabricating a dry join: 18 of the first 51 approach
samples are out of the water. Moving the dock to that cell would sever the short
walk, reverse the authored reveal and move the MR04 night landing away from the
board.

**DONE 2026-09-09.** `waterway.hist-heartland.sap-tapping-licensed.landing` is
authored in `world/sources/routes/authored-minor-waterways.json`. Its last three
points ARE the blueprint's `canal.sap-tapping-licensed.channel` via list
unchanged (`[3308.0, 4838.0]`, `[3308.5, 4828.0]`, `[3309.4, 4815.0]`), so the
11.86 m plank walk, the licence board at 318 degrees and the MR04 night landing
keep the canoe arriving as authored. The outward head is a MEASURED same-level
receiving branch at `[3310.218, 5013.765]`, not a guess and not the published
route's own water: the straight join the minor route uses crosses a ridge
topping 2.42 m above the water, while the authored line's highest ground is
+0.05 m and the water stands at ONE level (0.05 m) from the berth to the branch,
so the whole 213 m channel is a cut of at most 0.85 m — a tidal creek, not an
excavation. It is carved and published as one physical channel by
`authored_waterways.carve_authored` on the next chain run.

Wamasu Pond remains a separate thin-geometry finding. It currently PASSES
`_validate_docks` only through
`MARSH_WATER_CREDIT_M` — an open-water marsh cell is credited the canoe
minimum whatever its signed depth — so the geometry there is thinner than the
gate reads.

## Then: close-out (in this order)

1. One full chain on the finished compiler; `npm test`, `npm run typecheck`,
   `pytest -n auto`, `npm run test:placement`; one probe run
   (`npm run build -w @elder-souls/world-studio` then
   `node apps/world-studio/scripts/probe-water.mjs`).
2. Write the owner's evidence ledger: one row per item in the owner's round-2
   message (the items are listed below because that file is temporary) with
   the measurement that proves it and the studio URL to look at.
3. PROGRESS.md Phase P row + *Waiting on user* checklist (URLs, plain English);
   tick B2 and unblock B5/B6/G8/G11 in `research/phase11/phase11-gap-plan.md`;
   review the water-driven place moves (gap plan B5) against the final rasters.
4. Deploy (push; check the Pages action) and hand off.

### The owner's round-2 items (verbatim intent, for the ledger)

1. Old hovering-water site dry mud — `view=character&x=4.57&z=3.87&t=10:00`; plus micro-jagged shore edges everywhere (root cause fix, not per site).
2. Lowland river continuous, flat to both banks, visible flow, foam drifting downstream — `x=1.85&z=4.89` (edge failure seen at 1.87/4.92).
3. Marsh: level rises/falls with `&wet=1` / `&wet=-1` without floating plates or domed blobs — `x=1.50&z=5.28&t=09:00` (failures at 1.51/5.30).
4. Former dry bed now a swimmable river, no holes, surface alive — `x=2.66&z=0.90`.
5. River above the waterfall full, no uphill belts, no holes — `x=2.47&z=0.30`; zigzag trenches under upland streams gone.
6. Waterfall lands in a deep pool, one coherent fall aligned with the bed, no flat sheet on the cliff face — `x=2.53&z=0.32` (fly: 2.60 E 0.41 S alt 238 NW 331°).
7. Deep basin lake keeps passing; the hovering patch south of it at 1.59/4.25 gone.
8. "Big waterfall" sites at fly `x=1.827&z=2.093` and `x=1.816&z=1.810` are slopes: must render as steep streams, not falls, no belts.
9. Mountain stream `orbit x=1.75&z=1.74`: white water following the slope, no floating patches.
10. Sea calm and storm keep passing (`orbit x=6.16&z=5.07`, `&w=storm`); underwater keeps passing; caustics keep passing.
11. Beach `x=6.10&z=1.64`: spawn on sand not in water; foam on the water's edge like a real beach.
12. Mountain lake `orbit x=0.38&z=1.44`: a lake, flat, clean edges, no belts or "lego" rivers.
13. Interaction and speed keep passing.
14. Tests/probes must fail on real defects and be cheap; vegetation rollout recorded and regional variety widened; the two place/bridge decisions reviewed.

## Verification quick reference

`npm test`, `npm run typecheck`; `pytest worldgen/test_water.py worldgen/test_water_invariants.py`;
browser: `probe-water.mjs` (14 sites, screenshots in `apps/world-studio/artifacts/`, never ingest them — hand them to the owner), `shot-deployed.mjs`.
