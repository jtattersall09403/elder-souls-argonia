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
   must be 0, `dryCoarseRiverCells` 0, `roadCellsDeepInWater` down to the
   known fords only (roads never stand in open water), `maxDepthM` only where a
   real closed basin exists.
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
  gate out of the deploy-blocking job.
  `test_minor_waterways::test_no_berth_is_refused_in_the_published_network` is
  the only red test; everything else in CI is green.

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
   0.19 m at the camera (measured) while every texel is right. **Probe fix to
   apply** (`apps/world-studio/scripts/probe-water.mjs`, owned elsewhere): the
   registration tolerance must carry the ground's texel-scale relief. The
   probe already sends arbitrary points to `__STUDIO_WATER_PROBE__`, so sample
   ground at the four surrounding depth-texel centres (`±mpp/2` in x and z,
   `mpp` = `meta.surface.metresPerPixel`) and gate on
   `gap < 0.15 + 0.5 * (max − min)` of those four. On flat water the relief is
   ~0 and the gate stays exactly as tight as it is today.

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

The port's channel is dug because that is what a working port does — the berth
is fixed by what stands on it and the hull class is a claim the catalogue and
the quests make, so neither may be moved to make the check pass.

Measured on the shipped rasters (published water surface as the level field),
before the rebuild:

| dock / route | verdict |
| --- | --- |
| Lilmoth lighter quay / Soulrest–Lilmoth | dredged 366 m × 30 m, 26 223 m³, max cut 3.25 m, 1.18 → 3.25 m |
| Lilmoth lighter quay / Blackrose–Lilmoth | dredged 358 m × 30 m, 20 463 m³, max cut 3.25 m, 0.86 → 3.25 m |
| Sap-Tapping landing / its landing channel | **blocked, nothing cut** — 39 of 51 approach points, from the berth itself outward, stand up to 1.48 m ABOVE the local water (29.22 m); the first real route cell is 92.94 m south-west of the exact berth and the nearest final-raster canoe-depth cell is 104.39 m away |
| Wamasu Pond lane landing / its lane | **blocked, nothing cut** — 7 of 51 points stand up to 1.09 m above the water, first 20 m out |

Sap-Tapping is a missing authored-water delivery, not permission to move its
settlement geometry. The blueprint's dock, network terminal and local canal
end exactly at `[3478.500, 4373.000] (SUPERSEDED — that berth moved 2026-09-09)` m; its 11.86 m plank walk and the licence
board facing 318° depend on a canoe arriving from the north-west. The published
minor route instead replaces a wet-only A\* cell 92.94 m to the south-west with
the berth coordinate, fabricating a dry straight join: independent 2 m samples
put 47 of 52 points on that join out of the water. Moving the dock to that cell
would sever the short walk, reverse the authored reveal and move the MR04 night
landing away from the board.

**Action for the water owner:** add
`waterway.hist-heartland.sap-tapping-licensed.landing` to
`world/sources/routes/authored-minor-waterways.json`. Preserve the blueprint's
exact final centreline points
`[3462.599, 4365.853]`, `[3467.099, 4370.353]`,
`[3472.922, 4370.277]`, `[3476.099, 4373.353]`,
`[3478.500, 4373.000] (SUPERSEDED — that berth moved 2026-09-09)`; choose a measured same-level receiving branch and
extend the outward head to it, then author, carve and publish the full line as
one physical channel. Do not guess that outward head from the already-published
water route: the nearest natural channel station is about 99 m away, beyond the
authored carve's 60 m joining search. Phase 11 now refuses the 92.94 m splice
and asks for this pre-water source instead.

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
