# Phase 11 — the gap-filling plan (from the review of 2026-09-07)

**Invocation.** The owner starts a fresh session with "Phase 11: deliver
gap-filling plan". That agent (Fable, the planner) reads PROGRESS.md, this
file and 0041 § Review 2026-09-07, then briefs `deliver`/`research`
subagents (CLAUDE.md model policy) batch by batch, in the order below. Each
batch names its files, its acceptance test and whether it can run while
the water agent is active. Tick a batch here when it lands; keep this file
as the single list (do not fork it into PROGRESS.md).

**What the review was.** Four read-only audits checked every claim in
0041's Assemblies, Doors, Promise-ledger, Round A feedback and Round A
follow-up records against the code, the data and the tool output, plus the
owner's own ask list. The claim-by-claim ledger is in 0041 § Review
2026-09-07. What was fixed in the review session is listed there too; this
file is only what is still open.

**Running alongside the water agent (owner decision 2026-09-08).** The water
round 2 ([0047](../../decisions/0047-water-one-physical-model.md)) is live in
this tree. Its renderer half is committed; its compiler half is running the
terrain chain. A Phase 11 agent may work now under these rules:
- Do not edit `packages/game-core/src/water/**`, `apps/world-studio/src/water/**`,
  the water pass of the pipeline, `worldgen/compile_water.py`, `channels.py`,
  `refine_province.py`, or anything under `apps/world-studio/public/province/water/`.
- Do not run `scripts/terrain-chain.sh`, `compile_water`, `compile_chunks`,
  `export_web_chunks`, `rebake_landcover` or `compile_scatter`: the chain is
  running and every raster and scatter bundle changes under it.
- **B2 is being done by the water round** (the chain runs with the corrected
  grader); tick it when the water hand-off lands, do not rerun it.
- **B5, B6, G8 and G11 wait for the final rasters** (after the water hand-off).
  B1 and every batch marked "alongside water: yes" are safe now (the studio
  scene files B1 needs are no longer being edited).
- Shared worktree: edit only your own files, commit by explicit pathspec,
  never `git add -A`; in PROGRESS.md touch only the Phase 11 row.

## Batches, in order

### B1 — Round B massing pipeline (the big one) — REOPENED BY DEPLOYMENT AUDIT 2026-09-08

The owner's ruling (2026-09-06): deliver Round B if it does not depend on a
place being signed off. The *pipeline* does not; only the final judgement
of a place does. Build the pipeline on Lilmoth as it stands; when the layout
changes, re-run.

- **What**: `compile_settlement` output → 3D placed kit pieces in World
  Studio walk/fly mode (a `SettlementLayer` in `packages/game-core`, the
  studio only mounts it), against the 30-item checklist in
  [research/rendering/building-placement-rendering-treatments.md](../rendering/building-placement-rendering-treatments.md) §3:
  per-asset anchoring mode and depth, absolute LOD floors with matched
  atlases, fade with haze through `applyAerialPerspective`, CSM shadow pair
  in sync (the `onBeforeCompile` contract), contact AO/base skirt, collider
  BUDGET by count over a ring (the Phase 10 lesson), navmesh cut markers,
  door transition markers, night windows, wetness.
- **Also here**: the 4,147 current route-structure pieces (`route-structures.json`)
  rendered as 3D, since they use the same placed-piece path; and the
  "bp ground" overlay retired (`BlueprintGround.tsx` says so in its header).
- **Files**: new `packages/game-core/src/settlement/` (loader, instancer,
  LOD tiers, anchoring), studio mount in `CharacterMode.tsx`/`Fly3D.tsx`,
  a compiled bundle exporter in `worldgen/export_settlement_bundle.py`.
- **Acceptance**: the reusable package
  renderer, atomic fail-closed exporter, three-tier/far instancing, streamed
  perimeter anchoring, material/CSM reapply contract, ground treatments,
  radius-aware grass exclusion, versioned imperative colliders, paired door
  and navmesh records, and all 4,147 route pieces are implemented with focused
  tests. The exporter requires exact equality between the authored exemplar
  set and fresh content-hashed compile outputs: a stale or simply absent place
  cannot quietly disappear from the runtime bundle. Checklist 18's coarse
  footprint/yard repaint is now a tested, atomic `settlement_ground_control`
  stage: it rebuild-compares the bundle, paints coherent PATH controls,
  excludes signed-depth water, preserves macro alpha and content-addresses
  inputs/policy/output. Run it after the final water raster handoff, then the
  implementation is present in the shipped raster.
  Owner still walks Lilmoth and supplies the low/medium/high FPS readings.
- **Alongside water?** No — it touches the studio scene files the water
  agent is editing (`CharacterMode.tsx`, `ChunkTerrain.tsx`, the water
  pipeline's overlay pass). Run after the water pass closes.

**Why this was reopened.** A clean-room check of the deployed path found that
the implementation claim had been made against data structures, not the world
the player receives: no `province/settlements.json` or settlement kit bundle was
published; landmark and fence asset references were omitted by the compiler;
raw blueprint ids could masquerade as compiled delivery evidence; pad grades,
foundation scatter and navigation records had no consumer; anchoring/burying
was not per-asset; settlement collisions still moved with a focus ring; and the
browser probe never opened a rendered settlement. These are one systemic gap:
**a produced record is not delivery until the next real consumer has accepted
it, and the final running scene has proved it.**

The reopened acceptance is therefore all of the following, with no “record
exists” substitute: every asset-bearing blueprint object emits a physical
placement; compiled receipts bind emitted objects plus applied/final terrain
evidence; kit manifests carry measured per-asset anchoring policy; pad grades,
foundation scatter and navigation hand-offs are consumed or visibly fail
closed; settlement collision stays stable while crossing a settlement; placed
LOD/shadow behavior is checked after final grading; all five settlements and
route structures compile without errors or warnings; the exact kit assets and
settlement bundle are published; and the combined browser run renders Lilmoth
and Nine-Trunks with non-zero geometry and zero grounding findings. Only then
may the 30-item claim return.

### B2 — Terrain chain rebuild with the corrected grader — CHAIN RUN; WATER ACCEPTANCE STILL RED

- **What**: the rim fix in `grade_routes.py` (review session) has not been
  applied to the shipped rasters/chunks. Run
  `tooling/world-generation/scripts/terrain-chain.sh --from grade_routes`
  (the chain order now lives there, not in prose), then re-author route
  structures for the windows the grader now hands over instead of burying,
  rebuild chunks/water/landcover/scatter, re-export.
- **Check first**: the corrected grader hands 338 over-cap windows to structures where the old one handed 62 (it buried the rest). Before authoring 338 stairs and decks, look at the window length histogram; if most are short lips, raise `MAX_FILL_M` from 6 m to 8 m and re-audit rather than build a staircase province. Owner walks a sample either way.
- **Acceptance**: `grade_routes --audit-rims` reports no rim cell over 30°
  outside a structure window and no fill over the cap; `route-grading.md`
  regenerated; owner walks the Blackrose road and one footpath on a slope.
- **Alongside water?** No — `compile_water` is in the chain and the water
  agent owns the rasters it reads. Coordinate: run once the water agent has
  committed and is not mid-solve.

The final route reconciliation now agrees at exact rerouted-way endpoints: 38
stale windows proved to begin beyond seven roads' new ends and were removed
with measured evidence; endpoint-crossing windows are clipped rather than
dropped. The current exact set is 293 structures and 4,147 placed pieces, with
no zero-piece row and no stale generated file. Final acceptance remains open
because the independent terrain-promise report has 50/66 passing; the 16
failures are now recorded in the water handoff and remain water-compiler work
rather than exceptions here.

### B3 — Derived area boundaries (districts, combat spaces) — DONE 2026-09-08

- **Cause**: parcel footprints are derived from the kit meshes and
  validator-enforced; district polygons and combat-space boundaries are
  hand-drawn axis-aligned boxes (24 of 24 across the five blueprints). The
  owner's "are they actually square?" applies to these.
- **Mechanism**: `district.polygon` derived = convex hull of the district's
  parcel hulls plus the ways that end inside it, buffered 4 m, then clipped
  to the boundary; `combatSpaces[].boundary` derived from the parcel/way
  ids it names (`aroundIds[]`) the same way. Validator rejects a hand-edited
  polygon exactly as it does for footprints (`blueprint_footprints --apply`
  writes both).
- **Files**: `blueprint_footprints.py`, `blueprint.py` (schema docstring,
  validator), five blueprints re-derived, `export_blueprints`, studio view
  unchanged.
- **Alongside water?** Yes.

Delivered: `blueprint_footprints --areas` now derives both area classes from
typed parcel/way membership, buffers them 4 m, clips them to the place, and
keeps the rings compact. `aroundIds[]` makes every combat room's source
geometry explicit; parcel-less waterfront districts type their dock/way
membership. The validator rejects drift and unknown references, while the
integration pass independently rejects any parcel outside its district. All
five exemplars were re-derived; 127 focused tests and `blueprint --check` pass.

### B4 — Module 97 §G still-open mechanisms

| Gap | Smallest mechanism | Files |
|---|---|---|
| G18 outdoor dressing — **DONE 2026-09-08 for settlement dwellings/works** | `compile_settlement` now places deterministic 3–6 / 6–12 bands from the district kit's own `dressing[]` vocabulary and reports them; ruin/camp bands remain owned by Phase 15 | `compile_settlement.py`, kit configs (`dressing[]`) |
| G19 connectors — **DONE 2026-09-08** | per-kit `connectors.json` measured from authored co-placement or bounds; every `abuts` join is held to 0.15 m / 5° and an unmeasured kit is visible WARN debt | `pipeline.measure_connectors`, `blueprint_integration` |
| G8 flood band — **CODE/REPORT DONE 2026-09-08; final-water review pending** | compiled settlements now carry centre/vertex/edge samples, per-district open-water share and WARN-grade section/culture checks; final rasters decide the reviewed values | `compile_settlement.py` `floodBandReport` |
| G9 dock depth — **DONE 2026-09-08** | `docks[].hullClass` requires its published serving water at the berth and the class depth over the first 100 m; `fit` states which side may move | `blueprint._validate_docks`, `compile_minor_waterways` |
| G11 terrainRequests — **66/66 typed plan + all 15 raster profiles DONE; final water 50/66 PASSING** | content-addressed carve/raise operations execute deterministically with typed gradient/contour/flow/water axes, clipped bounds and per-operation raster hashes; an exact fulfillment manifest rejects missing, stale or unevidenced work. The remaining 16 final-water failures stay red in the water handoff | `terrain_requests.py`, `terrain_request_raster.py`, `terrain_request_postconditions.py`, then `refine_province` |
| G13 first node — **DONE 2026-09-08** | `blueprint_integration` infers the Argonian-stilt spine as the track/boardwalk nearest the gate and requires its first geometric building node to be a typed `market`, `shop` or `hall`; `endsAt` remains truthful terminal data, not a false intermediate-node list. The rule is mutation-tested not to broaden to Imperial or other culture grammars | `blueprint_integration` |

**Alongside water?** G18, G19, G9, G13 yes; G8 and G11 need the raster
chain, so with B2.

### B11 — Sap-Tapping's landing is 91 m from any water — **DONE 2026-09-09**

**Closed:** the owner chose to move the place. The landing now stands in 0.60 m of
compiled water at the head of reach 118 and its approach dredges to 0.85 m with no
blocked sample; the anchor moved 117.7 m on bearing 212. The record's two false
claims about its channel were rewritten and reviewed. Original measurements below,
kept because they are the evidence for the move.

#### Original finding

**The berth is wrong, not the water.** `dock.sap-tapping-licensed.landing` sits
at (3478.5, 4373.0) on ground 30.52 m, class `none`, dry. The nearest water a
canoe could use is **91.4 m south-west** at (3433, 4453) — the head of reach
118, surface 29.22 m, 0.36–0.48 m deep, band 1. There is no upstream reach
stopping short: the drainage genuinely begins there. The ground between runs
29.5–30.70 m for 92 continuous metres, up to 1.48 m *above* the local water,
so it cannot be dredged — that would be a ditch through the terrace the
landing stands on.

The blueprint's own prose is false against the terrain: `causalModel.siteAdvantages`
claims "16 m from a channel deep enough (0.9 m)" and `docks[0].why.microGeography`
says "piled to the bed at the lip of the channel". Measured gap 91.4 m, and the
channel that exists carries 0.50 m design depth.

**What must move:** the landing, and with it the works district's water end,
about **92.6 m on bearing 242°** to roughly **(3435, 4454)** — which is outside
the current place boundary (x 3468.6–3514.6, z 4368.4–4412.4), so the place
anchor moves too. Once the berth is on wet ground the approach dredges without
a blocked sample (the first 100 m from that point is wet at every sample; the
dredge would cut it to 0.85 m). The alternative is to drop the dock and carry
the sap out by track — `traversalModes` already lists `walk`.

Also noticed while measuring: this place's `sitingPrefs.nearPoint` is
(4269, 4176) with `maxM 400`, and the plotted anchor is (3490.6, 4391.8) —
**808 m away**, so the siting constraint was already violated.

Why it shipped: the dock wet-join guard measured the coarse hydrology raster
rather than the compiled water, so a 91 m dry connector satisfied a 10 m rule.
That guard is being fixed on the water side; when it lands, this dock fails
loudly instead of silently.

### B13 — Handed over from the paused Phase 11 session, 2026-09-09

Recorded here because it existed only in cross-session messages and would
otherwise be lost when that session ends. All of it is measured, none of it is
started unless said.

**The class-versus-geometry audit (done, and its numbers).** `water-class.png`
is a TYPE label over a superset of the wet area — that contract is now stated
in `water-meta.json` `klass.meaning`. Measured over 31.38 km² of classed cells (re-measured 2026-09-09 after the
clean `--from refine_province` chain, and these are the numbers the code and
`test_water_fact_invariants.py` now carry): 21.44 wet in the dry season, 24.86
at the seasonal maximum, **6.52 km² dry in
every season**, of which **96.2 % sits inside the deliberate 4-pixel (~22 m)
`CLASS_EXT_PX` dilation** that exists so the shore shader has a class and a
turbidity to read past the waterline. The within-dilation share is flat at
94.6–98.7 % across all five classes, which is what proves the dilation rather
than the season is the dominant cause. Only 0.117 km² is wet-season-wet and
outside the dilation.

**The consumer batch (designed, not delivered).** Roughly ten Phase 11
consumers read the water rasters directly and each made its own assumption.
The decided shape:
- Season is assigned **per consumer**, not globally. Boat lanes and berths take
  base depth, with flood-only routes **typed** rather than inferred — so the
  2,501 published channel cells that are dry in the base season get split into
  wet-year-round / wet-season-only / dry-always, and only the last is a defect.
- Building thresholds and fences move to the **wet-season** extent.
- The hostility denominator takes the dry season as its headline, with the wet
  figure published beside it.
- `MARSH_WATER_CREDIT_M` is to be **deleted** (`blueprint.py`, mirrored in
  `compile_minor_waterways.py`): measured over the 62,553 cells where it fires,
  median depth −0.12 m at base and **exactly 0.00 m at full flood**, and 91.5 %
  never reach a canoe's draft in any season. It manufactures depth from class
  membership. Note `test_dock_and_socket_rules::test_marsh_water_is_credited_the_canoe_minimum_and_no_more`
  asserts the credit and must be updated with the deletion.
- `ProvinceSurvey.open_water` (`site_fields.py:285-293`) is
  `region_grid in {ocean, lake} OR depth > 0.5`; the OR marks 1.88 km² as open
  water at ≤ 0.5 m, 1.08 km² of it dry.

**The single accessor (agreed between both sessions, not built).** Every
physical-water question should go through one accessor with a **season
argument**, so no compiler touches a PNG and the meaning is answered once.
`worldgen/water_report.py` `ShippedWater` already is that accessor on the water
side — it reads depth, class, flow, shore and season, works without the vault,
and `test_water_invariants` asserts through it. `ProvinceSurvey` should
**delegate to it** rather than grow a parallel reader, and `ShippedWater` should
gain `wet_grid(season)` so a water question cannot be asked without answering
which season it is about.

**OWNER RULING 2026-09-09 — the hostile-density floor is SOFT.** The ">= 15
per km², at least Morrowind's frequency" figure was **a preference held in
balance against other goals, not a hard rule**, and the owner is content for it
to be softened: *"we shouldn't stubbornly stick to the 15 target if it makes
other things worse"*. The session decides. Danger can also be filled in later
through encounters rather than through placed records, so a shortfall in the
static count is not by itself a failure. This supersedes the earlier reading of
that number as a floor to be defended.

**The call that surfaced it.** With the land denominator corrected (it
was reading the class raster, so it excluded 7.13 km² of dry ground), **D1
misses the owner's ">= 15/km², at least Morrowind's frequency" floor in both
seasons — 12.7 dry, 13.8 wet.** Not a seasonal artefact. The floor is not to be
lowered and hostiles are not to be added quietly; the question is whether the
metric counts strict hostiles or includes flip-to-hostile records, and any real
gap closes with content. Worth telling the owner it is a *correction*: the
number they were shown before was flattered by the same 6.5 km².

**Queued against water, with numbers.** The 6.5 km² all-season class surplus,
and **876 of 3,071 shipped major-lane cells under a canoe's 0.6 m even in the
base season**. Carving is `refine_province`, and `dock_dredge` is the machinery
for it — it already cuts a promised depth along a route from the shipped
rasters and refuses rather than ditching when a berth stands above its own
water. Extending it from dock approaches to published lanes is the next step.

**Still held, ready to run.** `macro_plot --resolve-all` + `apply_sitings`
(a dry run was clean at 580/580 with zero siting violations), then
`compile_scatter` and the vegetation export for the new density ladder — in
that order, because the plot moves records and the scatter must follow.
`test_vegetation_ladder::test_delivered_ladder` is **intentionally red** until
that rollout runs; its docstring says so.

**B13 LANDED 2026-09-09** (decision 0049). Delivered: measured `wet_grid`/
`dry_grid`/`water_intent`, per-consumer season, `channel_season` typing,
`MARSH_WATER_CREDIT_M` deleted, the hostility denominator on measured dry
ground, the density-vs-spacing binding measure, `ShippedWater.wet_grid(season)`
as the single accessor with `ProvinceSurvey` delegating to it, and
`test_water_fact_invariants.py` asserting all of it on the shipped rasters.
D1 accepted at 12.7/km² with no records added, per the owner's soft-floor
ruling.

**Left open by B13, with the mechanism:**
- Two compilers still open the water PNGs themselves instead of going through
  `ShippedWater`: `compile_scatter.py:76` and `settlement_ground_control.py:55`
  (`grade_routes` was moved onto the accessor in 540c1e92). Mechanism:
  route them through `ShippedWater` with an explicit season when next touched;
  `test_water_fact_invariants` will catch a class-mask regression in them, but
  not a second decoder.
- `ProvinceSurvey` carries two wet-season notions: `wet_season` (the
  `refined/flood-wet.png` inundation mask from `refine_province`) and
  `wet_season_grid` (signed depth + amplitude x response). They are not the
  same mask. `compile_minor_routes._classify_ground` reads both. Decide which
  is authoritative and delete the other.
- Unrelated reds seen on 2026-09-09 in the same tree, NOT caused by B13 and not
  water-owned: `test_render_blueprint::test_fixture_blueprint_is_schema_valid`
  (the `combatSpace ... aroundIds` rule was added without updating
  `worldgen/testdata/place.fixture.mire-landing.json`), and
  `test_export_blueprints` / `test_export_purpose_ledger` (stale committed
  export against uncommitted blueprint edits — run
  `python3 -m worldgen.export_blueprints`). `test_live_dir_validates` also
  reports four `boundary is not the derived polygon` failures needing
  `python3 -m worldgen.blueprint_footprints --areas`.

**Structural, agreed between both sessions.** Move to **separate git worktrees**
before the rollout rather than during it — almost every collision today was one
session's *uncommitted* work breaking the other's *runs*, not committed code
disagreeing. Blocker to clear first: the asset vault is resolved relative to the
checkout (`compile_chunks.REPO_ROOT.parent`), so from a worktree every
vault-dependent tool fails confusingly; `ES_VAULT_ROOT` exists as the override
and nothing uses it. Cost: ~113 MB of province data per worktree on a 1.9 GB
repo.

### B12 — `grade_routes._water_fields`: the redesign is right, the version tried was not (2026-09-09)

The Phase 11 pass rewrote how the road grader decides where water is: wetness
from the compiled **signed depth** rather than from `water-class.png`, with the
MARSH class exempted by identity because marsh is wet *ground* that paths cross
normally. **The reasoning is right and should be redone** — the class raster is
a type label over a superset (6.5 km² of it is dry in every season, 96.2 % of
that inside the deliberate 22 m `CLASS_EXT_PX` dilation), and reading it as a
wetness mask both over-protected dry ground and missed 2,249 cells at or below
the water level where a road could be cut under the waterline.

The version in the tree on 2026-09-09 was **reverted**, for two reasons:

1. **It broke three water invariants.** With it in place a full chain produced
   hovering edges (e.g. 1320/3080, 1338/3076, 2764/2530), **21 coarse river
   cells with a dry bed**, and strip points outside their trench around
   6186/499. Exempting marsh means the grader may cut marsh ways, and marsh is
   wet ground, so it cut under the waterline — which is what those invariants
   exist to catch.
2. **It was internally inconsistent.** The comment states "WET IS MEASURED, and
   measured at the WET SEASON", but the code tested `signed_depth > 0.0`, which
   is the dry season. The wet-season test the comment intends is
   `signed_depth + season.amplitudeM * seasonResponse > 0`.

It also crashed the chain until fixed: the signed depth is 2017² and the class
raster 1345², so they cannot be combined before one is resampled onto the other
(nearest-neighbour — a class is a label and must not be interpolated).

**To redo it:** keep the depth-not-class principle, decide marsh deliberately
(a road across marsh still must not sit under the wet-season waterline, so
"exempt by identity" may be too broad — an exemption from the *level floor* is
not the same as an exemption from the *water*), grade against the season the
comment intends, and run `pytest worldgen/test_water_invariants.py` after a
full chain before committing. Those three invariants are the acceptance test.

### B5 — Province plot re-solve: evenness, and the 28 dots the water rebuild drowned

**Added 2026-09-07 (reconciliation).** The Phase P water rasters now put 28
committed macro-plot dots in the wrong place: 12 dry places standing in
1.1–4.6 m of water, 6 submerged places above the 0.8 m gate, 3 binds, 2
sightlines. They are pinned to their committed dots in
`macro_plot.RESITE_PINS`, each with a written reason, because moving them
mid-water-pass would move them twice. This batch re-sites them with the
evenness re-solve, against the FINAL water rasters, and then deletes the
pins. The owner accepted the re-solve (2026-09-07) and its timing (2026-09-08): after Round B on Lilmoth, before rollout, against the final water.


Clark–Evans R per zone reproduces (1.44–2.28) but a Monte-Carlo null in the
same thin masks scores 1.07–1.36, so the true excess is ~1.4, not 1.8, and
the hard `SEPARATION_M` floor (150–800 m) then in `macro_plot` *necessarily*
gave R > 1. (`SEPARATION_M` has since been deleted; the Thomas prior replaced
it, and 2026-09-09 added the typed footprint sum as the only hard spacing.) If the owner says re-solve: replace the fixed floor with a
culture-specific clustering prior (Thomas process: parents at the floor,
children clumped within 300 m), pins applied after the solve as now, then
`apply_sitings` chain. Report R against the edge-corrected null. Alongside
water: yes (no rasters written). Moves records: the four sited exemplars
are pinned; everything else may move.

**DONE 2026-09-08; final-raster recheck remains in B2.** The solver uses
deterministic culture-specific Thomas parents and a bounded 300 m child kernel
instead of a general pairwise separation floor. An immutable 30 m physical
collision floor remains, while related-place, same-type and route-repeat
guards apply only where their authored meanings require them. Hard locality
constraints propagate through dependency groups before placement; scarce
domains are reserved first; submerged places draw from a deterministic deep-
water candidate field and can no longer pass on shallow water. Navigable roles
must meet their hull depth within 150 m unless they carry a typed terrain-cut
promise that will create it. The full owner-approved solve placed 580/580
records with no collisions, no invalid sites, no navigability exceptions and
no resiting pins. It wrote the catalogue and the edge-corrected Clark–Evans
report (median R 0.838). The four authored exemplars remain blueprint-pinned.

### B14 — Places have EXTENT: typed footprints + typed proximity — DONE 2026-09-09 (580/580 in a dry run; the catalogue write waits on the final water rasters, B5)

**Delivered.** Every one of the 350 type recipes now carries
`footprintRadiusM` (derived by `worldgen.author_type_siting` from the authored
blueprint boundary where one exists, banded from magnitude / class /
`complexityBudget` otherwise) and, where its own `siting.neighbourRelation`
states a distance, a typed `proximity` block
(`minFromClassM` / `maxFromM` / `outOfSightOf` / `mayAbut`, 72 rows).
`macro_plot.separation_ok` clears the SUM of two footprints instead of a flat
30 m, symmetrically, and never relaxes it; the proximity block is a hard gate
in both directions; `typed_siting_violations` re-checks the finished plot with
no ordering; `audit_place_semantics.check_type_proximity` fails a record that
contradicts its own type prose (19 of 22 isolation records used to pass
clean). `test_type_siting` covers all of it; all eight mutations went red.
Dead `RELATED_MIN_M` deleted. Three fixed en route: `related_pair` was
asymmetric (which of a pair the solver reached first changed the gate), the
relaxation-stage matrix had no stage relaxing both spacing and region, and
`macro_plot.run` raised on a failed `--resolve-all` BEFORE writing the report
that says why.

**BLOCKED.** The re-plot is not committed. A `--resolve-all` under the
footprint model leaves **6 of 580** records with no honest site:
`horwalli-waterworks-deeps`, `dream-wallow-sap-pool`, `freehold-smithy`,
`the-permit-dig`, `wamasu-pond-nest`, `rim-snowline-hermitage`. Measured
route to that number: 44 → 30 (bound satellites may abut) → 19 (Thomas
children per parent 8 → 7, which is as far as the authored parent floors
allow) → 13 (isolation floors calibrated 800 → 600 m against the measured
land budget: only 6.8 % of province land is ≥800 m from every settlement,
13.9 % at ≥600 m) → 7 (a new deterministic **eviction-repair** pass: a
homeless record may take a movable peer's site if that peer can be re-sited,
rolled back unless both succeed) → 6 (derived footprints capped at the M5
band, so a wamasu pond's 280 m hazard boundary does not claim more exclusive
ground than Lilmoth). Two of the six carry no `proximity` block at all, so no
amount of proximity tuning reaches zero — the footprint model itself costs
those records. **Owner call:** shrink the radii globally, cut/defer ~6
records, or raise supply (the parent floors, or the honest-fit score bar).
The committed spacing would go from median NN 85 m to **131 m** (p5 35 → 73,
p95 249 → 240) with **zero** typed-siting violations, against 426 overlapping
pairs and 31 isolation-floor breaches today.

**6 → 2 (2026-09-09, second pass).** Each of the six was diagnosed to the
single gate that bound it, and every one turned out to be a defect in a
record, a derivation or the solver rather than a case for weaker footprints.
The footprint floor and the derived radii are untouched.

* The homeless diagnostic itself was wrong. It tallied the FIRST gate that
  rejected each candidate, so it reported the culture prior — which rejects
  thousands of cells for every record, placed or not — and hid the gate that
  was actually last standing. It now judges every gate independently and
  reports `soleBlocker`: the candidates that fail exactly one. That single
  change is what made the six legible.
* `the-permit-dig` — its `nearPoint` sat 268 m from Stormhold (a 230 m city
  plus its own 45 m needs 275) and 1043 m from the Outer Silyanorn ruin its
  own record says it stands on the edge of, against the type's 500 m ruin
  ceiling. The point had been written at the alcove in the city, not at the
  dig. Removed; the typed `maxFromM {ruin: 500}` and `dependsOn` site it.
* `wamasu-wallow-struck-ground` — same defect: a `nearPoint` that put a 230 m
  hazard pond ~200 m from Hutan-Tzel, against its own prose ("the village two
  hours east", "off any walked path"). Removed.
* `freehold-smithy` — every cell inside its 250 m bind to Alten Corimont
  scored −9 on `sightlineTo` the careening hard, because the hard had plotted
  419 m OUTSIDE the port basin its own record says it is inside. The hard now
  carries the `boundTo` Alten Corimont its prose asserts.
* `dream-wallow-sap-pool` — `outOfSightOf: [settlement]` was judged against
  every settlement in the province, so the wallow was rejected for a sightline
  to a village 1.3 km away. Both authored `outOfSightOf` rows name the
  neighbour they hide from in the same breath as the one they belong to ("a
  short walk from a village, out of ITS sight") and both carry the paired
  `maxFromM`. The rule now binds within that range (`out_of_sight_binds`).
* `horwalli-waterworks-deeps` — rejected by the hostile-cluster share rule at
  its own authored drainage pinch: 13 of 16 places within 800 m are hostile,
  which is what the deep interior IS. The rule's own intent is rival
  TERRITORY ("one owner's territory is still free"), and the Horwalli Cut has
  no occupants and no owner faction — its record says "Unstaffed; the works
  run themselves". Both sides of the pair must now hold ground
  (`holds_ground`). Province hostility frequency is untouched.
* `wamasu-pond-nest` and the snowline hermitages — the Thomas child-radius
  gate was asking records to be clump children when their own typed fields
  make that arithmetically impossible: a 230 m pond plus a 115 m village needs
  345 m of clearance, more than the 300 m kernel's whole diameter, and a type
  whose `minFromClassM` is 600 m is being told to sit inside a settlement
  clump and 600 m from settlements at once. `thomas_exempt` scores those flat
  (no bonus, no veto) — the same treatment `thomas_parent_points` already
  gives a stronger authored locality. 12 of 350 types, of which 8 are pinned
  capitals.
* `sitingPrefs.scourSiteIds` was read by NOTHING. 189 records carry one; the
  plot never looked. Named sites are now reserved for their claimants like a
  `nearPoint` domain is.
* **Neighbour repair.** The eviction-repair pass only reclaimed a site
  somebody was standing ON; the commoner case under footprints is a FREE cell
  one movable neighbour's clearance reaches into. Both repairs now also verify
  that moving a record does not strand a THIRD record's `maxFromM` ceiling
  (a dig losing the ruin it must be within 500 m of), and roll back if it does.

Result: **578 of 580 plotted**, nearest-neighbour median 85 → **136 m**,
p5 35 → **75 m**, p95 250 → 267 m.

**CLOSED 2026-09-09 (third pass): 580 of 580, zero typed-siting violations.**
Both open measurements were wrong at the root. Fixing them resolved
everything above. Full record in decision 0041 § Part 3c; the travel-cost
research is in [travel-cost-isolation.md](travel-cost-isolation.md).

* **Isolation is effort, not plan distance.** The owner's ruling: the type
  prose these floors come from says the effort-to-reach IS the design, so a
  straight line on the map was the wrong measure and it is why the rim records
  failed while marsh records passed easily. Floors are now judged with
  Tobler's hiking function (`worldgen/travel_cost.py`), symmetrised, clamped
  at a 100 % gradient, in **equivalent flat metres**, which on flat ground are
  plan metres exactly, so the authored 600 m keeps its calibration and this is not a
  loosening. Shipped isolation breaches 31 → **21**; per-type table in 0041.
  **Both snowline hermitages site**, and so does everything else: a
  `--resolve-all` dry run plots 580/580, zero homeless, zero typed-siting
  violations, nearest-neighbour p5 71 / median 132 / p95 257 m. The owner
  call above is therefore withdrawn; nothing needs cutting or deferring.
* **A footprint is built ground.** `footprintRadiusM` was read off
  `blueprint.boundary`, which also encloses approaches, water and yard; it now
  measures parcel hulls, the districts that hold a parcel and the landmarks
  inside those. Lilmoth 275 → 225, Mazzatun 130 → 105, Nine Trunks 120 → 105,
  sap camp 30 → 25, wamasu pond 280-capped-230 → 175. `FOOTPRINT_CEILING_M`
  is **deleted**; nothing is left for it to cap. Shipped overlapping pairs
  426 → 415.
* **The cross-agent hazard below is closed.** The sap camp's built ground
  measures 29.5 m against the committed blueprint and 25.4 m against the water
  agent's in-flight rewrite whose boundary is eight times larger, because the
  works did not move. Both revisions are asserted in the tests, so the water
  landing can no longer move the derived radius. The two derivation tests are
  green and renamed to describe the correct basis.
* **The empty Thomas parent** was an artefact of crediting occupancy to the
  nearest parent only when kernels legitimately overlap; occupancy is now
  credited to every parent whose kernel holds the record.
* **The `maxFromM` ordering hole** has a repair pass (`ceiling_repair_pass`):
  the offender is lifted off the finished plot and re-solved against
  everything, rolled back unless nobody is homeless and violations strictly
  fall. Re-plot only: a seeded solve may not move a committed cell.

The catalogue write is still NOT committed: the re-solve runs against the
final water rasters and is the planner's to sequence (B5).

### B6 — One province extent — DONE 2026-09-08

The authored UV frame is 7373.50656 m. Hydrology geometry names cell-centred
pixels: pixel `i` is `(i + 0.5) × 5.48352 m`; its 1345-cell outer edge is
7375.3344 m, a deliberate one-raw-spacing overshoot and **not** a second
province extent. Nine-Trunks is the regression witness: pixel 910 is exactly
4992.74496 m / UV 0.677119484. `scale.py` now owns the extent, pixel size and
centre converters; Python network/survey/audit consumers and the Studio map,
fly, blueprint and minimap layers use those semantics. Chunk manifests publish
the authored extent instead of inviting `grid × chunkMetres`. Twelve scale
tests include exact UV↔metre↔pixel round trips and the Nine-Trunks join.
Generated chunk manifests were refreshed by the final province build, and all
30 built asset-kit manifests can now refresh reviewed placement policy without
rerunning Blender; the refresh validates the complete set before replacing any
file.

### B7 — Python tests as a CI gate — DONE 2026-09-08

`npm test` runs no Python beyond the prose linter (added in the review).
The blueprint/integration/catalogue suites (119 blueprint tests, ~150 s)
and `grade_routes`/`plot_stats` tests run only when an agent remembers.
Mechanism: a `placement-tests` job in `.github/workflows/` (pytest over
`worldgen/test_blueprint*.py test_catalogue.py test_grade_routes.py`,
cached pip, ~3 min) and an `npm run test:placement` script. Alongside
water: yes.

Delivered: Pages now has an independent eight-minute `placement-tests` job,
with Python 3.12, a pip cache and a small test-only requirements file. The
root `test:placement` script runs only the blueprint, catalogue, route-grading
and plot-stat suites (rather than the full world-generation suite); deployment
requires both it and the normal build job.

### B10 — Phase 11 test/probe efficiency — OPTIMISATION LANDED; FINAL PROFILE PENDING

The placement gate was profiled rather than shortened by dropping coverage.
The prose-reference pass now builds its registry/entity index once and uses a
linear longest-name matcher: its live-debt hot check fell from 17.34 s to
0.98–2.02 s. Terrain-derived ways use a bounded, canonical-content SHA-256 and
survey-identity cache with defensive copies: an otherwise repeated Lilmoth
validation fell from 1.964 s to 0.123 s while mutation tests prove edits miss
the cache. A fresh exact CI selection took 34.52 s for 170 passes plus the
expected live-data failure; 25.98 s is genuine first-run terrain routing for
the five blueprints, while cached repeat validation is the optimized path.
The broader measured Phase 11 selection reached 205 passes and one expected
pre-handoff failure. The five blueprint views now share one build, preview,
browser and place-picker pass, completing cleanly in 8.6–9.3 s (at least 73%
faster than five separate runs). The combined Phase 11 probe reuses that same
build and preview server for the complete water scenario set; the two probe
families still use separate browser processes so their distinct assertion
harnesses remain isolated. The retired blueprint-ground probe was removed rather than
kept as dead coverage. The placement gate now also names the final terrain-
promise postconditions, macro replot and minor-route suites explicitly, so the
speed work cannot hide those delivery checks.

The expanded 2026-09-08 profile, taken while water and compiler outputs were
still moving, ran 361 checks in 83.75 s (353 pass, eight expected in-flight
failures). It exposed one new waste: the minor-waterway determinism test spends
29.43 s rebuilding the same static movement graph for the natural and fitted
answers. **DONE 2026-09-08:** one immutable graph is now shared while the two
answers retain their independent growing networks and distance fields; the
same two-run determinism check takes 17.58 s (40% faster) and also asserts one
graph build per run. Asset-policy-only changes can likewise refresh existing
measured kit manifests without rerunning Blender; validation of every manifest
happens before any is replaced. Take the final all-green timing after the water
handoff. The combined browser workload now reuses its
blueprint browser/page for the 3D settlement proof (Lilmoth, then an in-process
teleport to Nine-Trunks) and continues to share one build/preview server with
the complete water suite.

A second isolated profile removed repeated loading of the province survey from
three placement suites: plot statistics fell from 6.63 s to 1.06 s, scale from
6.44 s to 0.60 s, and synthetic blueprint checks from 10.99 s to 1.22 s. The
macro suite now shares one survey and passes 8/8 in 15.13 s; the focused group
passes 61/61 and the real-survey controls pass 10/10. A deliberately contended
combined run (while the water build was active) reached 391 passes and five
known in-flight water/settlement failures in 109.46 s. This is a diagnostic
baseline, not the final green timing; repeat it once B1/B2 are complete.

**Read every timing in B10 as a dated diagnostic baseline, not a settled
result.** Each was taken while the water solve and the compiler outputs were
still moving, so none reproduces today; they record where the time went at the
moment the optimisation landed, which is what they were for.

The post-cleanup combined gate reached 409 passes and the one deliberate Sap
physical-channel failure in 53.63 s pytest time / 56.61 s wall time — measured
2026-09-08, on that day's water data, with the slow marker deselected. That run
caught and drove out a real Lilmoth quay-routing regression first, so the gain
has not traded away detection.

Re-measured 2026-09-09 on this VM, `npm run test:placement`, with the water
agent's Sap berth red and the macro-plot agent mid-edit in the shared tree:
**417 passed, 2 failed, 2 deselected, 71.36 s**. The two reds were
`test_blueprint.py::test_live_dir_validates` (the Sap berth) and
`test_macro_plot.py::test_no_two_live_places_share_ground` (a transient
`macro_plot.RELATED_MIN_M` rename in another agent's working tree, not a
committed defect). The all-green timing remains pending the water-owned Sap
line and B2 postconditions; take it then, once, under stated conditions.

### B9 — Macro promise to final delivery contract (owner 2026-09-08) — DONE 2026-09-08

**Cause**: the quest-purpose-without-a-socket finding is one instance of a
class: prose in `why` blocks, `notes`, purposes and design records names
things (quests, named people, services, other places, routes, items,
factions, landmarks, sockets) that the typed fields do not reference, so
nothing can check that the thing exists or is delivered (engineering
standard 12: prose written against the record).

**B9a delivered:** `worldgen.place_obligations` classifies every catalogue
field as delivery, provenance or plot mechanics; the test walks all 827
records and a new unclassified field is a hard failure. Every semantic leaf
of a delivery field becomes a stable typed obligation. Existing typed
resolvers are reused; qualitative `why`/`vibe`/siting promises use compact
`macroEvidence[]` source-path → real-object links in the five blueprints, so
the prose is not copied into a second hand-maintained list. The blueprint
validator rejects missing or dangling evidence at every magnitude. An
optional typed `factionPresence[]` distinguishes a faction seat/chapter/
outpost/office from mere `ownerFaction` control. Three live promises now
exercise the distinction: the Naga-Kur seat, the Waykeepers' seasonal seat and
the Cyrodilic Collections chapter. Every institutional role requires a physical
host plus a faction-bound person when its blueprint is made, and the compiled
receipt accepts only an emitted parcel/landmark/occupant for that obligation.
The same module defines and
tests the Phase 12/13/quest delivery-manifest join (missing, empty, duplicate
or stale rows fail); those phases emit their manifests when their compilers
land. The old purpose ledger remains a compatibility view meanwhile.

**B9b gate and migration delivered 2026-09-08:**
`worldgen.prose_links` extracts named entities
from the prose surfaces (quest
titles from the quest index, NPC names from `occupants[]`/the cast roster,
place names from the catalogue, route names from the registry, faction and
item names from `world/sources/registries/`, service words from
`catalogue.SERVICES`, socket ids) and require a typed reference on the same
record: `socketRef`, `occupantRef`, `placeRef`, `routeRef`, `serviceRef`,
`itemRef`, `factionRef`. HARD where the vocabulary is closed (quests,
places, routes, services, factions), WARN where it is open (items until
Phase 13's registers exist). The reverse holds too: a typed ref with no
mention in the prose is checked for contradiction, not required repetition:
typed records need not restate every id in prose. It applies to the five
blueprints and the whole catalogue. The extractor is deliberately high precision:
ambiguous short/common display names do not assert a join, quest titles require
an explicit id-shaped mention, and terse service names require an availability
context. The migration added 436 exact source-to-entity links. The final walk
covers 832 records with zero HARD and zero WARN findings.
`world/sources/sites/prose-link-debt.json` was deleted and the gate is now
hard-zero: future unlinked promises fail rather than joining an accepted
backlog. The blueprint validator uses the same gate.
Files: `worldgen/prose_links.py` (new),
`blueprint.py` hook, `test_catalogue.py`, `lint_prose.py` (shares the
surface list), docs/text/style-guide.md (one line: name a thing only if
the record links it). Alongside water: yes.

### B8 — Smaller items (each one brief)

- **DONE 2026-09-08 — Nine-Trunks dock fitted to the wrong side of the village (owner,
  2026-09-08):** G9 validated the channel only *after* `water-to-dock` had
  rerouted it to the already-authored berth. That makes a wrong berth
  self-validating and erased the earlier authored dotted waterway whose head
  is south of the ring. Preserve a dock-independent natural minor-waterway
  solve; default the berth to that endpoint; require an explicit physical
  reason before a channel may instead be moved to a fixed berth; and make the
  dock-fit apply step move the dock, its terminal pier and the land-access path
  together. Refit Nine-Trunks at the south channel head. Alongside water: code
  and blueprint data yes; regenerate the final published waterway after the
  water hand-off. **Source/code DONE 2026-09-08:** Nine-Trunks' dock, pier,
  landing path and terminal now sit at the authored south channel head;
  `compile_minor_waterways` preserves a dock-independent natural solve and
  permits a fixed berth only with `fixedBerthReason`. Published regeneration
  is now an explicit item in `rendering/water-handoff.md`: the water compiler
  owns carving and labelling the authored local reach, while Phase 11 retains
  the independent exact-terminal, continuous-wetness and first-100-metre
  depth acceptance gates. This division prevents either workstream from
  marking the shared outcome complete on its own. The merged publication now
  carries the exact authored metre line beginning
  `(4992.745, 3786.371) → (5010.298, 3819.476)` rather than a replacement path,
  and the published first 100 m measures 1.32 m minimum depth against the
  canoe's 0.60 m requirement. The water round still owns making that authored
  reach visibly wet, carved and labelled in the final terrain.

- **Sap-Tapping dry dock splice (found by final consumer audit,
  2026-09-09):** the settlement is internally consistent—dock, terminal and
  19.04 m local canal meet at `(3478.500, 4373.000)`—but the minor-waterway
  publisher inserted that coordinate in front of a genuine wet route 92.94 m
  away, creating a dry straight connector. Moving the berth would sever its
  11.86 m plank walk, licence-board view and night-landing scene. **Phase 11
  guard DONE (`0a194af5`):** `water-to-dock` accepts only the existing 10 m
  raster tolerance and otherwise requires authored pre-water geometry; ten
  focused tests hold the rule. **Physical water remains in the water handoff:**
  extend the exact local centreline to a measured same-level receiving branch,
  then carve and publish the whole authored line. Until then Sap remains an
  intentional hard failure, not a generated connection.

- **DONE 2026-09-08 — doors on the tidal flat vs the final water.** Four
  Pusbottom thresholds are intentionally on stilt decks. The terrain compiler
  now accepts wet access only where a `groundFit: stilt` parcel has an
  explicitly authored boardwalk within the same 4 m threshold apron the
  integration validator enforces. Five pinching parcels and the loop/cross
  control points were minimally shifted and re-derived; Lilmoth compiles with
  0 errors against the final in-tree rasters.

- **Argonian cart gate — evidence-bound search complete, API follow-up
  blocked.** The only Argonian enclosure piece in the held mods clears 1.72 m,
  a footpath; the existing exhaustive vault/mod inventory and a public indexed
  search found no Argonian/marsh gate with a measured ≥3.5 m opening. The
  requested authenticated Nexus API query was attempted but the execution
  policy rejected transmitting the local API key, so this is not represented
  as a complete private-index search. Mazzatun and Lilmoth retain their
  explicitly justified Redoran/Imperial gates until an independently sourced
  candidate is measured; any future pool must pass the new credit/hash gate.
- **DONE 2026-09-08 — BM&V newcastle guardhouse is a solid mass.** The
  exhaustive door-link index includes both BM&V plugins but contains no
  `01randomhouse`, guardhouse-shell or guardhouse-door XTEL row. The matching
  interior mesh is not a placed door link; the source-backed decision is in
  the settlement-kit sourcing log.
- **Mazzatun raiders' back way — decided, no terrain request.** The rise west of the pens is a climbable rock face, and climbing is free by default (module 00-core), so the Xit-Xaht bring the taken down it by hand. One walked way onto the shelf, through the gate; the back way is climb-only and no ground is cut (implementation lead 2026-09-07, decision 0041 Taste ledger).
- **DONE 2026-09-08 — hut composite doorways.** The full Lilmoth door pass
  was rerun after the interior index landed; moved parcels were re-derived on
  the measured 2.8 m radial entrance before the clean settlement compile.
- **DONE — Pusbottom density.** Decision 0041's accepted lore grounding keeps
  fifteen huts; the redraw removes the grid without changing that count.
- **DONE with B3 — Nine-Trunks pitch and boundary.** Both are derived from
  authored member geometry and validator-held; the ring remains jittered.

- **DONE 2026-09-08 — gate door outside.** A parcel with `use: gate` must have
  its door within 60° of the spanned road's OUTSIDE bearing (97 D-approach).
  `blueprint_integration` derives the outside endpoint from the place boundary
  (falling back to the endpoint farthest from the place centre) and reports the
  door and both bearings. Focused fail/pass tests hold the 60° rule.
- **DONE 2026-09-08 — major-waterway publication identity.**
  `compile_society` content-addresses the independent natural solve and every
  terminal-fit input in `waterways-repaired-by.json`, preserving a reviewed
  publication only while those inputs are unchanged. Fresh natural geometry
  receives its registry id once; fitted/published geometry inherits it, and
  an existing stable id wins with a hard mode check, so an endpoint edit can
  no longer silently re-key a repaired lane.
- **DONE 2026-09-08 — Lilmoth boardwalk routing.** The source held eight
  `straight` boardwalk rows, including the one allowed surveyed council-bench
  walk: the other seven changed to `terrain`; with the two already routed,
  nine of ten now follow the ground and only `bench-walk` stays `straight`.
- **DONE 2026-09-08 — route-structure rise.** `riseM` is bounded by the
  measured vertical-z bbox only; a horizontal extent can no longer certify a
  climb. Supporting posts may make the bbox taller than the tread rise.
- **DONE 2026-09-08 — credit hashes.** The dated closed legacy-pool snapshot
  makes every later asset pool supply a 64-hex `archiveSha256` in the registry
  and repeat it in README credits; both JS and Python credit gates enforce it.
- `CityMarkers.tsx` grew a distance-faded label system in the review; when
  the game needs map/compass markers, extract it to `packages/game-core`
  (the data half, `cityMarkerData.ts`, already imports only contracts).
- ~~`apps/world-studio/src/water/legacy/*` duplicates the package water
  renderer behind `?water=legacy`~~ — DONE 2026-09-08: the legacy copies, the
  studio's four re-export shims and the `?water=legacy` flag are gone;
  importers use `@elder-souls/game-core/water/...` directly.
- `docs/PROGRESS.md` is 210 lines against its 80-line rule; ~96 of them are
  the water pass's narrative in *Waiting on user*, which duplicates
  `water-handoff.md`. The water agent trims it at close; the Phase 11 row
  was cut in the review.
- **DONE with B3 — district containment.** Derived interlocking polygons
  contain all member parcels, and `blueprint_integration` independently rejects
  any future parcel outside its district.
- **Lilmoth blueprint-owned cleanup DONE 2026-09-09; final water remains
  red.** The dredged lighter lanes deliver their three-metre depth, the north
  ruin corner now fits a 1.79 m pad, and the 1.917 m pole wall was reseated on
  a surveyed 29.124 m shelf in 0.12–0.96 m water outside the dredged lane. All
  23 authored pads pass the dry application (1,669 changed samples), but they
  are not baked until the final water compiler and blueprints stop moving.
  Lilmoth's forced full compile has zero blueprint-owned findings; its 17
  errors and five warnings remain final-water postconditions, typed cut
  evidence and water-distribution findings. Sap's exact local line remains a
  water-handoff action as recorded above.
- `hostile-or-clearable ≥ 55 %` sits at 55.5 % (three records of headroom):
  any hostile cut needs a matching promotion, or the owner lowers the floor.

## QA round — gates that could not fail (delivered 2026-09-09)

An audit of this plan's own delivery found six defects, five of them gates that
were green by construction. All are fixed here; the numbers below are measured,
not restated.

- **The prose gate never fired on quests or NPCs.** `prose_links._high_precision`
  refused every quest title outright, so B9's motivating class — a quest purpose
  with no typed link — was exactly the one the live gate could not see. A title
  now fires when it is at least three words *and* the phrase denotes nothing in
  any other closed vocabulary (that keeps *Lake Meer*, which is a lake, and
  *Keepers of the Shell*, which is a faction, unasserted), matched in its
  authored case. Live: **quest 61 mentions, 0 hard**, after migrating the 19
  real findings it exposed into exact `proseRefs` on the Nine-Trunks (7) and
  Lilmoth (12) blueprints. **npc stays 0 mentions, and that is now proven, not
  assumed**: the closed vocabulary is the two registered principals
  (`npc.holds-the-reed`, `npc.nesh-deeka`) and neither name nor id occurs
  anywhere in the 1,281,019 characters of catalogue and blueprint prose;
  `occupants[]` carries descriptions ("D1 caretaker few"), not names. A test
  asserts the quest count is non-zero, pins the npc vocabulary, and carries a
  positive control proving the same extractor does fire on an NPC name.
  Mutation-tested: restoring the old rule reddens three tests.
- **B3's drift rejection was untested.** Every fixture ran
  `apply_area_boundaries` first, so deleting `blueprint.py`'s drift guard left
  the suite green. `test_hand_edited_area_boundary_is_rejected_as_drift` now
  edits a derived district and a derived combat space *after* canonicalisation,
  and adds an extra-vertex case. Mutation-tested: deleting the guard reddens it.
- **The terrain-request postcondition module had no live consumer.** All 11 of
  its tests were synthetic, so the quoted 50/66 came from a report nothing
  gated. It now defaults to the *published*
  `apps/world-studio/public/province/refined/terrain-request-{plan,fulfillments}.json`,
  three live tests bind it to those records, and the 16 water-owned final-water
  failures are registered in
  `world/sources/terrain/terrain-request-known-red.json`. Known-red is reported
  by name, never suppressed: an unexpected failure, a row that has started
  passing, or a row missing from the report all fail the gate. Measured now:
  **50/66 passing, 16 known-red, 0 unexpected**.
- **`test_measure_connectors.py` ran in no CI job**, so the half of the 97 G19
  evidence chain that *produces* connector measurements was unguarded while the
  half that consumes them was gated. New `npm run test:pipeline` runs the whole
  `tooling/asset-pipeline/pipeline` suite (**130 passed, 10 subtests, 17 s**) in
  the `placement-tests` job. Making it green needed one real fill: the Lilmoth
  destroyed keep-wall corner
  (`mwkeep:…/mwimparchwallcorin01destroyed01`) had no asset policy, so
  `test_placement_metadata` was failing unseen. Given `pad` — the policy its
  sibling `mwimparchwall01destroyed01` already carries.
- **`test:placement:slow` was in no workflow.** Wired into `placement-tests`
  rather than deleted: the two tests re-grade the whole province and skip where
  the vault is absent (that includes the CI runner), so folding them into the
  default selection would put a permanently-skipped pair in the hot path.
  Wiring keeps them from drifting. Running them here immediately caught a
  regression nobody could see: **`test_grade_routes.py::test_province_grading_leaves_no_unreported_wall`
  fails at `rimCellsMadeSteeperOutsideWindows` 22,602 against its 20,000 cap**
  (rim p95 and over-cap windows still pass). That is route grading on terrain
  the water pass has been moving under it; it belongs with B1/B2 and must be
  re-measured and either fixed or re-based once the water solve settles.
  **Open — next agent on B1/B2 owns it.**
- **`blueprint_integration._CONNECTORS`** is a pure load cache of immutable
  measured data in `tooling/`, not shared state in `packages/`, so standard 5
  does not reach it — but it is now an `lru_cache` with no module-level mutable
  binding and no `global`, keeping the `kits_dir` injection point. Recorded in
  the function's docstring so the judgement is not re-made.
- **Wrong numbers corrected at source**: "2,151 route pieces" → 4,147 (293
  structures; the published `route-structures.json` sums to 4,147); median R
  0.839 → 0.838 (`world/sources/sites/macro-plot.md:341`); B10's timings are now
  labelled as the dated diagnostic baselines they are.
- **The red deploy gate now explains itself.** The owner is holding the deploy
  on the water-owned Sap-Tapping berth rather than moving the gate (2026-09-09),
  which is correct — but a bare red suite reads as a broken one. A new
  `tooling/world-generation/conftest.py` prints a `KNOWN RED — water-owned,
  expected` block naming those two tests and pointing at the water handoff, and
  counts any failure it does not cover. It changes no outcome: nothing is
  xfailed, quarantined or skipped, and the gate is not weakened.

## The two rollouts still held on the water pass (2026-09-09)

Everything else in this file is authored, gated and committed. Two compiles
remain, and both are held for the reason the owner already recorded in B5:
they must run against the FINAL water rasters. The signal to go is
`worldgen/test_blueprint.py::test_live_dir_validates` turning green and the
water session's tree being clean. Until then `tooling/world-generation/conftest.py`
prints a KNOWN RED banner naming that test, so nobody mistakes it for a broken
suite.

**Rollout 1 — the place re-solve.** The dry run is clean: 580/580 plotted, zero
typed-siting violations, nearest neighbour p5 71 / median 132 / p95 257 m
against today's 35 / 85 / 250.

    cd tooling/world-generation
    python3 -m worldgen.macro_plot --resolve-all
    python3 -m worldgen.apply_sitings

`apply_sitings` itself re-runs `compile_minor_routes`, `compile_minor_waterways`,
`hostility_frequency`, `export_places` and `export_routes`. Three of those write
files the water session has had dirty (`world/sources/sites/hostility-frequency.md`,
`apps/world-studio/public/province/places.json`), so sequence after it is done,
not merely after its test is green. Note the hazard the resolver found:
`macro_plot` writes the catalogue BEFORE it raises on homeless records, so a run
that ends unhappy still leaves a written catalogue behind — check the homeless
count in the report, do not trust the exit alone.

**Rollout 2 — the vegetation scatter.** The density ladder of
[0048](../../decisions/0048-vegetation-density-ladder.md) and the two rebuilt
kits are authored but not yet in the shipped bundles, so the world still carries
the old, near-uniform tree density.
`worldgen/test_vegetation_ladder.py::test_delivered_ladder` is deliberately red
until this runs and its failure message says so. Run `compile_scatter` and the
vegetation export through the terrain chain, then re-fit `MEASURED_ATTENUATION`
from the delivered bundles: the authored numbers were set by treating delivery
as linear in authored count, and the classes cut hardest will land slightly
above target. Tolerance is +/-0.15, or +/-0.35 for the four thin-sample classes.

Order matters between them: the place re-solve moves records, and settlement
ground control repaints footprints, so run the re-solve first and the scatter
after, or the scatter will be compiled against places that then move.

## What follows gap closure (owner rulings, 2026-09-09)

**Fewer places is an acceptable price.** If the footprint and proximity gates
cannot house every record, cut records rather than weaken the gates: the owner
would rather hold the rules and carry a slightly smaller province than shove
everything in. The re-solve does not need this today — the dry run places
580 of 580 with zero typed-siting violations — but it settles in advance what
happens the first time a region packet does not fit, and it removes the
temptation to shave a radius to save a dot.

**The order of work, confirmed by the owner.** Macro plot for the whole
province first (substantially done). Then take a few places all the way
through, end to end — blueprint, exterior build, interior build, and whatever
else a finished place needs — and use them to develop the process. Then run
that process everywhere else.

That is what Phase 11's exemplar-first shape already means, and the piece that
delivers "buildings actually standing in the world" is **B1**, the Round B
massing pipeline: `compile_settlement` output rendered as placed kit pieces in
the studio. B1 is the reopened batch at the top of this file and it is the
next substantial job. It is held only because it touches the studio scene
files the water pass has been editing. **No blueprint work should start on
places beyond the five exemplars until B1 has proved one place standing in
the world** — a blueprint whose massing has never been rendered is a record,
not a place, and this file's own lesson is that a produced record is not
delivery until a consumer has accepted it. Interiors are Phase 12, which
0034 allows to interleave with 11 and which the same exemplars carry.

**The exemplars must leave behind an automatable process, not just five good
places.** The owner's stated purpose for them is to develop "a good process
and/or set of agent skills we can automate", and rollout is then running that
process rather than re-deriving it per packet. So the exit condition for the
exemplar work is a repeatable authoring path — the compiler chain plus a
skill under `.claude/skills/` that briefs an agent through it, in the way
`text-review` already does for prose — and not merely five finished records.
Whatever a human had to decide by hand for the fifth exemplar that they also
had to decide for the first is a gap in that process.

**The owner is hands-on for the places that carry the most weight**: the major
cities, and the very early-game places where the opening scenes play out.
Those are guided, reviewed and gated by the owner rather than run through the
automated path unattended. Everything else goes through the process.

Rollout then takes places in small packets, ordered by region and player
importance, and each packet passes the same whole chain: macro obligation
ledger, blueprint, terrain/water delivery, compiled assets and placements,
final gates, then an owner walk and a frame-rate reading. A packet does not
advance because its source file exists; every promised detail must have named
physical evidence in the published, running place. Failures feed back into the
shared compiler or rule when they expose a general gap, rather than becoming
per-place exceptions.

## Owner decisions recorded (none of these blocks implementation)

Plot evenness re-solve (B5) · Imperial gate tower / Ayleid stair block as
solid masses · Argonian records promise a shrine, not a temple · the
hostile floor · Lilmoth's four questions (drowned-quarter depth, gate
compass, stilt-house interiors, climbing) · the Round A per-place
questions in
[phase11-part6-round-a.md](phase11-part6-round-a.md).
