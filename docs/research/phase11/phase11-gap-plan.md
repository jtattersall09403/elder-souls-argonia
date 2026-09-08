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

### B1 — Round B massing pipeline (the big one) — NOT blocked on a Round A approval

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
- **Also here**: the 2,151 route-structure pieces (`route-structures.json`)
  rendered as 3D, since they use the same placed-piece path; and the
  "bp ground" overlay retired (`BlueprintGround.tsx` says so in its header).
- **Files**: new `packages/game-core/src/settlement/` (loader, instancer,
  LOD tiers, anchoring), studio mount in `CharacterMode.tsx`/`Fly3D.tsx`,
  a compiled bundle exporter in `worldgen/export_settlement_bundle.py`.
- **Acceptance**: the checklist's 30 items answered yes with the probe or
  number that shows it; owner walks Lilmoth.
- **Alongside water?** No — it touches the studio scene files the water
  agent is editing (`CharacterMode.tsx`, `ChunkTerrain.tsx`, the water
  pipeline's overlay pass). Run after the water pass closes.

### B2 — Terrain chain rebuild with the corrected grader

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

### B3 — Derived area boundaries (districts, combat spaces)

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

### B4 — Module 97 §G still-open mechanisms

| Gap | Smallest mechanism | Files |
|---|---|---|
| G18 outdoor dressing | `compile_settlement` dressing rule per `use` (3–6 per dwelling, 6–12 per works, 97 decision 4) from a per-kit dressing vocabulary; counts reported | `compile_settlement.py`, kit configs (`dressing[]`) |
| G19 connectors | per-kit `connectors.json` (entry/exit faces, lengths, rises) checked when two pieces `abuts`/`stacksOn` | asset-pipeline measure step, `blueprint_integration` |
| G8 flood band | read the flood-band raster at each footprint; over-water share per district vs the culture band (97 B4) | `blueprint.py` warnings, `site_fields` |
| G9 dock depth | `docks[].hullClass` + depth sample 100 m off the dock | schema + `compile_settlement` |
| G11 terrainRequests | Part 6 carve job in the chunk rebuild (joins B2) | `refine_province`/`grade_routes` |
| G13 first node | integration rule: first `endsAt` on the spine after the spanned parcel is a market/deck/hall | `blueprint_integration` |

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

### B6 — One province extent

`site_fields`/`render_blueprint` use 7373.51 m (4033 samples × 1.828 m,
the true extent); `compile_society`/`province_network`/the studio use
1345 px × 5.48352 = 7375.33 m (the hydrology grid overshoots by a third of
a pixel). Every UV↔metre round trip between the blueprint and the network
layers is 1.85 m off, which is why "lanes join at 0.0 m" measured 1.85 m.
Mechanism: `PROVINCE_EXTENT_M` and `HYDRO_PX_M` in `scale.py`, every
converter imports them, a test asserts uv→px→uv round-trips within 1e-6.
Alongside water: **no** (`compile_water.py` carries the constant).

### B7 — Python tests as a CI gate

`npm test` runs no Python beyond the prose linter (added in the review).
The blueprint/integration/catalogue suites (119 blueprint tests, ~150 s)
and `grade_routes`/`plot_stats` tests run only when an agent remembers.
Mechanism: a `placement-tests` job in `.github/workflows/` (pytest over
`worldgen/test_blueprint*.py test_catalogue.py test_grade_routes.py`,
cached pip, ~3 min) and an `npm run test:placement` script. Alongside
water: yes.

### B9 — Everything the prose names is a typed link (owner 2026-09-08)

**Cause**: the quest-purpose-without-a-socket finding is one instance of a
class: prose in `why` blocks, `notes`, purposes and design records names
things (quests, named people, services, other places, routes, items,
factions, landmarks, sockets) that the typed fields do not reference, so
nothing can check that the thing exists or is delivered (engineering
standard 12: prose written against the record).

**Mechanism**: a prose-entity check in the blueprint validator and the
catalogue tests: extract every named entity from the prose surfaces (quest
titles from the quest index, NPC names from `occupants[]`/the cast roster,
place names from the catalogue, route names from the registry, faction and
item names from `world/sources/registries/`, service words from
`catalogue.SERVICES`, socket ids) and require a typed reference on the same
record: `socketRef`, `occupantRef`, `placeRef`, `routeRef`, `serviceRef`,
`itemRef`, `factionRef`. HARD where the vocabulary is closed (quests,
places, routes, services, factions), WARN where it is open (items until
Phase 13's registers exist). The reverse holds too: a typed ref with no
mention in the prose is a WARN (the record promises what it does not
describe). Apply to the five blueprints and the 800 catalogue records;
report counts by entity class. Files: `worldgen/prose_links.py` (new),
`blueprint.py` hook, `test_catalogue.py`, `lint_prose.py` (shares the
surface list), docs/text/style-guide.md (one line: name a thing only if
the record links it). Alongside water: yes.

### B8 — Smaller items (each one brief)

- **Doors on the tidal flat vs the final water** (2026-09-08): the door reachability test reads water depth; the water agent's in-flight rasters put four Pusbottom thresholds (doors 22/23/25/30) in >0.5 m of water although the committed rasters do not. When the water pass commits, re-compile all five and, where the flat is really deeper now, raise the huts' piles/threshold or move them 2–4 m landward (the solver in the Lilmoth repair record). Belongs with B2/B5 (final water first).

- **Argonian cart gate** (sourcing gap, 2026-09-07; owner 2026-09-08: run the Nexus search first thing in the gap-plan session): the only Argonian enclosure piece in the mods we hold clears 1.72 m, a footpath; Argonian places whose spine carries carts (Mazzatun, Lilmoth's estuary wall) use the Redoran or Imperial gate with the record giving the lore reason. Search the wider mod scene (Nexus) for an Argonian/marsh gate ≥ 3.5 m clear; Nexus API with the owner's key; credit + hash.
- **BM&V newcastle guardhouse** ships with no derivable door (removed from `enclosure-v1`): decide from the plugin door links whether the mod ever used it enterable; if not, it is a mass.
- **Mazzatun raiders' back way — decided, no terrain request.** The rise west of the pens is a climbable rock face, and climbing is free by default (module 00-core), so the Xit-Xaht bring the taken down it by hand. One walked way onto the shelf, through the gate; the back way is climb-only and no ground is cut (implementation lead 2026-09-07, decision 0041 Taste ledger).
- **Hut composites' doorway derivation shifted mid-session.** `bamboohut01/02-with-door` now derive a radial doorway; eleven untouched Lilmoth bamboohut02 parcels, the two kiosks and the gate lodging need `blueprint_footprints --doors` / `--orient` re-run once the interiors-index pass lands (their `interiorRef` rows are that pass's).
- **Pusbottom density.** The owner's Round A question 3 (warren as drawn, about 20 huts/ha, or opened out) has no ruling yet; the redraw keeps the count (15 huts) and only removes the grid.
- **Nine-Trunks pitch and boundary.** The pitch district is still a hand-drawn box and the boundary a compass circle (B3 covers derivation); the ring itself is now jittered.

- `door-to-way` has no outward rule: a gate lodging whose only way is
  inside the wall passes. Mechanism: a parcel with `use: gate` must have its
  door within 60° of the spanned road's OUTSIDE bearing (97 D-approach).
- `compile_society` rewrites `waterways.json` unconditionally (no marker
  like the roads' `routes-repaired-by.json`), and `route_registry.attach`
  re-keys by `(from, to)` so a renamed endpoint pair could mis-attach. Give
  waterways the same natural/published split and marker as roads.
- Lilmoth: 8 of 10 Argonian reed boardwalks are declared `straight`; module
  97 Part F says Argonians do not survey. Re-route them `terrain` unless the
  design record gives the reason (the council bench is the one allowed).
- `compile_route_structures.validate`: `riseM` is not cross-checked against
  the mesh (only the derived angle); check it against the bbox on the
  correct axis.
- `checkCredits` (standard 6) accepts a name and a mod id; it does not
  require the sha256 in the README. Add the hash requirement for every pool
  sourced after 2026-09-07 (older rows carry hashes in the sourcing log).
- `CityMarkers.tsx` grew a distance-faded label system in the review; when
  the game needs map/compass markers, extract it to `packages/game-core`
  (the data half, `cityMarkerData.ts`, already imports only contracts).
- `apps/world-studio/src/water/legacy/*` duplicates the package water
  renderer behind `?water=legacy` — the water agent's to delete at close.
- `docs/PROGRESS.md` is 210 lines against its 80-line rule; ~96 of them are
  the water pass's narrative in *Waiting on user*, which duplicates
  `water-handoff.md`. The water agent trims it at close; the Phase 11 row
  was cut in the review.
- **District boundaries are axis rectangles and three Lilmoth parcels fall
  outside their own.** `pus-cross-c`, `pus-cross-d` and `salvage-bench` sit
  across the `pusbottom` / `lighter-quay` seam at x = 3832 m, because the
  quay's working pieces and the district's huts genuinely interleave there
  and no straight line separates them. Nothing checks district containment at
  compile, so it passed. Either redraw the seam as an interlocking polygon
  pair (the boundary is a free polygon; only Lilmoth's are rectangles) or
  move the three pieces; then add the containment check to
  `blueprint_integration` so the next one cannot pass. Found in the
  2026-09-07 repair round; `hist-court`'s east edge, which was 4 m short of
  its own tavern, was extended in that round.
- **Four Pusbottom doors compile as unreachable and sap-tapping's channel is on dry ground** (found 2026-09-08 in the fence-routing pass, not caused by it — both reproduce with `fences[]` emptied). `compile_settlement` on Lilmoth: `door.…lilmoth.22/23/25/30 unreachable (land=False)` — four stilt-hut thresholds stand over water with no deck or boardwalk reaching them; on sap-tapping: `canal.sap-tapping-licensed.channel is over dry ground for 100 % of its length`. Both are compile ERRORS today. Fix: reach the four doors with the Pusbottom plank runs (or move the huts onto the flat), and re-end the sap-tapping channel on water the hydrology publishes.
- `hostile-or-clearable ≥ 55 %` sits at 55.5 % (three records of headroom):
  any hostile cut needs a matching promotion, or the owner lowers the floor.

## Owner decisions still open (recommendations in 0041 § Review 2026-09-07; all accepted by the owner 2026-09-07 except the stilt-hall interior, superseded by the plugin-derived interior mapping)

Plot evenness re-solve (B5) · Imperial gate tower / Ayleid stair block as
solid masses · Argonian records promise a shrine, not a temple · the
hostile floor · Lilmoth's four questions (drowned-quarter depth, gate
compass, stilt-house interiors, climbing) · the Round A per-place
questions in
[phase11-part6-round-a.md](phase11-part6-round-a.md).
