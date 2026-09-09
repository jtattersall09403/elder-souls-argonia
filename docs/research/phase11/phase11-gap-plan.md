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
  and navmesh records, and all 2,151 route pieces are implemented with focused
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
the hard `SEPARATION_M` floor (150–800 m) in `macro_plot` *necessarily*
gives R > 1. If the owner says re-solve: replace the fixed floor with a
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
report (median R 0.839). The four authored exemplars remain blueprint-pinned.

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

## What follows gap closure

Phase 11 then moves from proving the system on five authored exemplars to a
controlled province rollout. Places are taken in small packets, ordered by
region and player importance, and each packet must pass the same whole chain:
macro obligation ledger → blueprint → terrain/water delivery → compiled assets
and placements → final gates → owner walk and frame-rate reading. A packet does
not advance merely because its source file exists; every promised detail must
have named physical evidence in the published, running place. Failures feed
back into the shared compiler or rule when they expose a general gap, rather
than becoming per-place exceptions.

## Owner decisions recorded (none of these blocks implementation)

Plot evenness re-solve (B5) · Imperial gate tower / Ayleid stair block as
solid masses · Argonian records promise a shrine, not a temple · the
hostile floor · Lilmoth's four questions (drowned-quarter depth, gate
compass, stilt-house interiors, climbing) · the Round A per-place
questions in
[phase11-part6-round-a.md](phase11-part6-round-a.md).
