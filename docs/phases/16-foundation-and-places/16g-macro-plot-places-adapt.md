# 16g — The macro plot on the frozen world: places adapt

**Goal.** Put the province's places back on the map, on the ground the
ladder has frozen (terrain 16b, water 16c, apron 16d, roads and ferries
16e, vegetation 16f). Make every record fit that ground rather than
the other way round: re-plot, then move, re-type, rewrite, merge or cut
under the relaxed floor (ruling 11). Lay the minor networks on the new
plot (tracks on foot, waterways for boats) and re-author the travel-service
graph, which **is** the province's fast travel, with the places it joins.
Then fix the records that later phases read: the promise vocabulary
for dungeon-kind places (decision 0062), the named-NPC roster, the
stronghold reservation, the hero Hist set, the owner-guided flag and the
names of the water and the land. Nothing physical is built here: the owner's
check is the 2D map and the records.

Needs ruling 11 (the floor; given 2026-09-11). Decisions this chunk
inherits: [0057](../../decisions/0057-phase16-terrain-once-water-once-places-on-a-frozen-world.md)
(the ladder), [0062](../../decisions/0062-dungeons-are-places-interiors-are-a-late-phase.md)
(dungeons are places, promises here), [0066](../../decisions/0066-downstream-stages-read-the-signed-record-never-re-solve-it.md)
(read the record), [0068](../../decisions/0068-routes-below-the-gate-records-here-realised-in-16h.md)
and [0069](../../decisions/0069-the-road-network-is-six-legs-and-two-exits.md)
(minor networks, services and the rootworm stations are 16g's),
[0070](../../decisions/0070-vegetation-and-dressing-read-the-record.md)
(track clearance is a patch).

**The catalogue is not rebuilt.** 827 records with causal prose, purposes,
quest ties, relations and reserves already exist and the placement rules
(world 97, 96, 0041) are written and coded. This chunk *applies* them on
new ground. A record is edited only where the ground, the network or a
quest ask makes its prose or its promises false; a rule is edited only
where it is found wrong.

## What this chunk realises and what it leaves to others

16g owns the plot (`macro_plot`, `apply_sitings` and their write-back),
the minor route and waterway compilers' runs, the travel-service graph,
the catalogue schema and every catalogue field this brief names, the
hydrology names register and the NPC roster registry. It publishes the 2D
map's places, tracks, waterways and services.

It places nothing in 3D. Wreck hulls, ferry boats, landings, entrance
pieces and dungeon doors are stood up by 16h's runtime with each place in
16i, 16j and Phase 15; interiors are Phase 12's, built against the
promises fixed here; NPC statblocks are 10c's, populations 13's and 15's.
Vegetation clearance for the tracks it lays is a typed patch applied to
the published bundles (0070); the scatter is never re-run.

## Starting state (2026-09-18, written by the planning agent after 16f round 2; the closing 16g agent rewrites 16h's)

Run the `routing-audit` skill over this brief before building: 16f round 3
landed after this was written (decision 0072: the ring's tiers, the studio's
fresh-file middleware, the water's colour on alpha, denser sea-bed bands;
no stage above `compile_scatter` re-ran).

- **The ladder is built through 16f** (`terrain-chain.sh`
  `DELIVERED_THROUGH="16f"`; `[16g]="compile_minor_routes compile_minor_waterways"`).
  **`--from compile_minor_routes` runs nothing today**: `--through` defaults
  to `DELIVERED_THROUGH`, so the `[16g]` row is not enabled until you bump
  it (or pass `--through 16g`). `macro_plot` and `apply_sitings` are not
  chain stages; `export_places` is not either. **The stage order is wrong
  for this chunk**: the `[16g]` stages sit mid-list, before
  `compile_chunks`, `export_web_chunks`, `rebake_landcover`, `export_routes`,
  `paint_route_overlays`, `build_border_apron`, `compile_scatter`,
  `apply_vegetation_patches` and `compile_water_dressing`, so a
  `--from compile_minor_routes` run would rebuild the terrain tiles, the
  land-cover bake, the apron and the whole scatter for nothing.
  `travel_services` sits *before* the minor stages although its hops follow
  the minor waterways. Deliverable 0b fixes the order; do not run the chain
  before it.
- **The record-reads allowlist has seven rows; five are yours**
  (`worldgen/record-reads-allowlist.json`: `audit_place_semantics`,
  `hostility_frequency`, `macro_plot`, `site_dossier`, `terrain_scour`;
  `compile_settlement` and `settlement_ground_control` are 16h's).
  `macro_plot.py` (2,945 lines) reads `s.wetlands`/`s.flood` at ~707 and
  ~784 and measures navigable depth from the raster at ~857/~873;
  `remeasure_plot_facts.py` (165 lines) reads only the dry-season
  distance-to-water transform and no graph id at all. The water record is
  read through `ShippedWater` (`water_report.py`: `kind_index_grid`,
  `season_index_grid`, `reach_width_grid`, `river_of`, `kind_grid`,
  `reach_band_grid`) and `ProvinceSurvey` (`site_fields.py`) on the 1345
  grid; `test_record_reads.py` fails any module below the gate that
  re-derives water.
- **The scatter reads no settlement or track data** (0070). Track clearance
  is one `vegetation-clearance` patch per track in
  `world/sources/flora/vegetation-patches.json` (validator
  `vegetation_patches.load_patches`), applied by `apply_vegetation_patches`
  with a receipt in `province/vegetation/vegetation-patches-receipt.json`.
- **The travel-service graph** (`world/sources/routes/travel-services.json`):
  28 stations (20 active, 4 `placeholder` root nodes, 2 `unmatched`, 2
  `deferred` with `positionM: null`), 19 services (16 active). The one
  `unmatched` service is **`ferry.imperial-fringe.onkobra-bond`** (the far
  berth reaches 0.36 m within 30 m; small-draft needs 1.2 m). The Underway
  basin ferry no longer exists (cut with the Helstrom road, 0069). Nine
  station-run hops are `unresolved` pending the minor waterways.
  `ferry-crossings.json` does not exist (0068 folded it into the service
  graph); the crossing record is `water-crossings.json`. `province/waterways.json` has 6 lanes,
  all six with declared `gaps`.
- **The catalogue** (`world/sources/catalogue/places-*.json`, eight files,
  file-level `schemaVersion`, key `places`): 827 records, 580 with a
  position. `interior.kind`: none 345, building 155, delve 197, dungeon 95,
  warren 19, complex 16; **"dungeon-kind" means delve + dungeon + warren +
  complex = 327** (buildings excluded). 14 `interior.family` values
  (dwelling 112, root-cavern 92, civic-hall 60, flooded-cave 58,
  xanmeer-complex 34, sinkhole-ruin 25, burrow-warren 21, imperial-fort 20,
  smuggler-den 16, abandoned-plantation 15, shipwreck 12, ayleid-nedic-ruin
  11, kothringi-lilmothiit-site 4, hist-sanctum 2); `verticalRelationship`
  on 85, `interior.schemaVersion` on 12; `designGroup`, `coSitedWith`,
  `ownerGuided`, `reservedFor`, record-level `schemaVersion`: none.
  `notableNpcSlots` non-empty on 346; `densityLayer` fine-tempo 491 /
  destination 245 / landmark 91; `relations` on all, `proseRefs` on 264.
  **The schema's source of truth is `worldgen/catalogue.py`**
  (`python -m worldgen.catalogue --check`), not `packages/contracts`, which
  has no `InteriorProgram`.
- **Recipes**: `type-recipes.json` holds 350 types; the recipe `family`
  (beast-lair, tribal-village and the rest) is a different vocabulary from
  `interior.family`; `slots.satellite` is prose, not a typed slot. Interior
  kits that exist in `apps/world-studio/public/kits/`: `dungeon-root-v1`,
  `xanmeer-interior-v1`, `settlement-imperial-v1`, `imperial-keep`,
  `wrecks-v1`, `ruin-monumental-v1`, `bmv-treehouse-int`, `htbm-hut-int`,
  `mudmother-hut-int`. **No hlaalu tileset ships.** Families with no
  plausible kit today: ayleid-nedic-ruin, abandoned-plantation,
  kothringi-lilmothiit-site, smuggler-den, civic-hall.
- **Registries**: `world/sources/registries/npcs.json` key `entries`, two
  records, `status: derived`. `world/sources/hydrology/names.json` does not
  exist. `hydrology-graph.json`: 101 rivers (`name` field present, none
  filled; `strahler` on rivers, `accumKm2` on rivers and reaches), 615
  reaches (18 `vertical-fall`, 91 `sloped-rapid`), 2,280 bodies (74 of
  ≥ 1 ha). Strahler ≥ 2: 20 rivers; `accumKm2` ≥ 4: 17.
- **`world/sources/terrain/terrain-request-known-red.json`**: owner 16g,
  six requests (the-divers-landing, the-slumped-hamlet, greenspring,
  the-drowned-furrow, the-two-hundred-roofs, chasecreek); the
  postcondition gate fails on any request outside it.
- **`place_obligations.py`** (846 lines) projects obligations from authored
  blueprints only (`DELIVERY_OWNERS` phase-11-compiled / phase-12 /
  phase-13 / quests); there is no record-only path. **`verify_delivery_manifest`
  does not exist** anywhere; it is a name in comments and docs.
- **Red today and yours** (`cd tooling/world-generation && python3 -m pytest -q`
  on the seven files: 12 failed, 36 passed): `test_export_places`
  (published `places.json` stale), `test_export_blueprints`,
  `test_export_purpose_ledger` (155 vs 154 rows), `test_render_blueprint`
  (fixture `combatSpace.aroundIds`), `test_committed_water_facts` ×3 (371
  records claim a distance to water the shipped water does not support),
  `test_water_fact_invariants` ×4 (pre-graph survey keys; `209 == 580`),
  `test_audit_place_semantics` ×1 (expects the cut Alten Corimont road).
  None is in `test:placement`. Also red outside the gate:
  `test_solve_major_routes::test_a_gradable_step_costs_earthworks_and_a_cliff_is_a_wall`
  (16e's, backlog row).
- **Places that name cut roads** (0069): `places-pirate-freeholds.json` ×4
  and `places-dunmer-north.json` ×2 reference
  `route.road.alten-corimont-stormhold`; `place.mercantile-coast.white-rose-prison`
  and `place.dunmer-north.the-northern-rest` call the Helstrom road "the
  Bogmother causeway". The Soulrest–Lilmoth coast road is re-classed
  `track` in the registry and is laid by your minor-route run.
- **Hero Hist**: the catalogue carries 6 `hero-hist-grove` records, 1
  `hist-grove-capital` (Helstrom), 3 `wild-hist`, 6 `harmed-hist`;
  rootworm records: `rootworm-station-helstrom`,
  `east-estuary-rootworm-station`, `gideon-rootworm-terminus`
  (`seasonal`), three `wild-rootworm-burrow`, the four `root-node.*`
  placeholder stations.
- **Wrecks**: 12 `shipwreck`-family records; `wrecks-v1` (19 statics,
  mined ground contact, no connector templates) is built and the sea bed
  under a wreck site is already dressed (16f round 2: `underwater-v1`,
  ocean-only bands, decision 0071). Six Depths of Skyrim hulls reference
  textures the mod does not ship and the owner eyeballs them before a
  wreck is plotted (PROGRESS, waiting on user).
- **Dressing zones** (`world/sources/flora/dressing-zones.json`) are the
  authored-overlay record; nothing here writes them.
- **Memory**: one `shared_survey()` per process; the session cgroup dies
  past 12 GiB (memory `preflight-memory-cgroup`). Use `memwatch.sh` on the
  chain run.

## Read

Routed, not exhaustive. Read the section named, not the file.

- Plan: [README.md](README.md) §3 (the ladder rules), §7 rulings 6 and 11,
  §10 (the design-group seed list).
- Rules you apply: [world/97](../../world/97-placement-principles.md)
  Parts A and B in full (A4 tiers, A5 clustering, A6 extent and sightline,
  A6b proximity, A7 danger, A8 "on the road", A9 water first, A10 hostile
  share, A11 enclaves, A12 meso moves, B1–B8) and the G enforcement table;
  [world/96](../../world/96-placement-playbook.md) §1 (the seed rule, the
  write-back rule, step 8's order) and §1b (standard 13);
  [0041](../../decisions/0041-phase11-settlement-decisions.md) § "Places
  have EXTENT" and § "Part 3c" only (the round log is archived).
- Density: [0027](../../decisions/0027-morrowind-density-targets.md) (the
  18–22 / 8–12 per km² targets and the 550–750 total),
  [research/placement-settlements/morrowind-content-density.md](../../research/placement-settlements/morrowind-content-density.md)
  and the 28.2/km² measurement in
  `research/phase11/phase11-critique/coverage-density.md`.
- Siting research the review re-applies:
  [openworld-place-distribution-and-siting.md](../../research/placement-settlements/openworld-place-distribution-and-siting.md)
  §7 (the prescriptive list: approach cue, two-visible rule, five-part POI
  recipe, ≤ 25 % per template);
  [settlement-type-recipes.md](../../research/placement-settlements/settlement-type-recipes.md)
  (recipe fields, `recordScope`).
- Quests: [quests/20](../../quests/20-world-provisions.md) §11 (the sixteen
  provision tags), §12b (stronghold, Gideon wintertide station, Deepmire,
  Fort Swampmoth, toll points), §13 (`QuestWorldProvision`), the
  root-transit note and the amendment authority; [quests/25](../../quests/25-quest-place-map.md)
  §20e (the fifteen asks) and §20f (the five rules; "every provision id
  on a live record" is owed and is yours); [quests/30](../../quests/30-main-quest.md)
  §24b.5 (the stronghold); [quests/36](../../quests/36-cast-roster.md)
  lookup-only for the roster; [quests/40](../../quests/40-factions.md)
  the Waykeeper dossier for the rootworm stations.
- Dungeons: [world/70](../../world/70-dungeons-interiors.md) §47–§49 (families,
  `InteriorProgram`, `CombatSpaceBlueprint`);
  [research/placement-settlements/place-purpose-hostility-and-dungeon-balance.md](../../research/placement-settlements/place-purpose-hostility-and-dungeon-balance.md)
  §4 and §6 (the proposal the shipped `interior`/`contents` blocks came
  from); [player-purpose-spectrum.md](../../research/placement-settlements/player-purpose-spectrum.md)
  (the closed purpose vocabulary); the Phase 12 section of
  [phases/README.md](../README.md) (what the interiors phase will read).
- Travel: [world/60](../../world/60-water-traversal.md) § travel services
  and § densification (fast travel is talk-pay-arrive over the service
  graph; lanes that cross land become portage or boardwalk features, never
  dredged); [0069](../../decisions/0069-the-road-network-is-six-legs-and-two-exits.md)
  in full; the 16e ledger [§ services](../../research/phase16/16e-ledger.md)
  (the unresolved hops, the two unmatched landings, NO SERVICE crossings).
- Names and prose: [standards/text/style-guide.md](../../standards/text/style-guide.md)
  §1.3 and §1.5, `standards/text/culture-registers.md` §0, the naming
  register in `world/sources/catalogue/README.md`; the dossiers under
  `world/sources/lore/` (rivers, coasts, roads: `topics/roads-and-routes-4e201.md`
  first); the `text-review` skill.
- Downstream contracts you must not break: the NPC record shape in
  [phases/README.md](../README.md) § Phase 10b (one `NpcRecord`, typed
  empty slots), the buildout register
  [phases/buildout/README.md](../buildout/README.md) rows naming 16g (the
  prior→roster rule, the vastei tutorial scene flag, dungeon anchor sockets,
  the underwater access metadata of world 60 §44, the hero Hist power slot).
- Code: `worldgen/macro_plot.py` (seed rule ~1373–1383, pins ~2252,
  `--resolve-all` ~2711, water reads ~707/784, navigable ~930–963, the
  terrain-promise gate ~967–1002), `apply_sitings.py`, `remeasure_plot_facts.py`,
  `audit_place_semantics.py`, `site_dossier.py`, `terrain_scour.py`,
  `hostility_frequency.py`, `catalogue.py`, `place_obligations.py`,
  `travel_services.py`, `compile_minor_routes.py`, `compile_minor_waterways.py`,
  `vegetation_patches.py`, `chain_contracts.py`, `ladder.py`,
  `scripts/terrain-chain.sh`; `world/sources/catalogue/README.md`.

## Record reads (decision 0066) — deliverable 0: the code you inherit is wrong here, and fixing it is your job

Every water fact on the 827 records describes the coarse Phase 3 flood
band the owner's graph replaced: "on water", "flood band", "wet",
"navigable" and the distance to water all come from rasters or from a
transform of the dry-season image. That is a bug, not a convention. Port
`macro_plot`, `audit_place_semantics`, `site_dossier`, `terrain_scour` and
`hostility_frequency` to the record reader (`ShippedWater` and
`ProvinceSurvey.water_at / reach / body`), delete the raster reads and the
five allowlist rows, then teach `remeasure_plot_facts` to key every water
fact to a graph id. A record's water facts become
`{reachId | bodyId, kind, levelM, season, distanceM}` copied from the
record; the navigable check reads `reaches[].depthM` along the serving
lane; the plot re-solve's water costs and the "wet" predicate read the
kind and season. **Provenance gate:** a test joins every sited record's
water facts back to the graph and fails on a missing id or a disagreeing
kind, shown failing on the 827 records as they stand; `test_record_reads`
green with only 16h's two rows left.

## Deliver

Two parts, one owner check at the end (owner 2026-09-18): Part 1 is the
ground; Part 2's records are the ones 16h–16j, 12, 13 and 15 read and
are built in parallel with Part 1's later steps. A cut or merge the owner
rejects at the check re-migrates the Part 2 records built on it.

### Part 1 — the plot, the minor networks and fast travel

0b. **The chain runs your stages and nothing an earlier chunk delivered.**
   Add `apply_sitings`, `macro_plot` and `export_places` as chain stages
   (contracts declared in `chain_contracts.py`, chunk map in `ladder.py`)
   and put the `[16g]` row where it belongs: **after** `compile_water_dressing`,
   as `apply_sitings macro_plot compile_minor_routes compile_minor_waterways
   travel_services export_places`, with `travel_services` moved onto this
   row (its hops follow the minor waterways; 16e's accepted output is
   adopted with `chain_stages adopt`, not re-run to check). The stages
   that read your outputs and are owned by earlier chunks —
   `export_routes`, `paint_route_overlays` (the tracks' paint on the
   published line), `apply_vegetation_patches` (the tracks' clearance),
   `terrain_request_postconditions` (the register you empty) — are moved
   below the `[16g]` row in `STAGES`, keeping their ladder rows. **Make the
   order a gate:** `--check-contracts` fails when a stage's declared read is
   written by a later stage, shown failing on the order as it stands
   today. Then `./scripts/terrain-chain.sh --from apply_sitings --through 16g`
   runs exactly the stages named here and the ledger lists them; a stage
   that re-ran without reading a 16g output is a defect in the order. Bump
   `DELIVERED_THROUGH="16g"` in the delivering commit; the 2D map's places,
   tracks, waterways and services layers un-hide with it (`LAYER_OF`,
   `ladder.json`).
1. **Schema** (`catalogue.py`, validated by `--check`; the catalogue README
   updated in place): `designGroup` (one blueprint, one build; register
   `world/sources/catalogue/design-groups.json` with the group's anchor
   record, members, the lore reason and the recipe-allowed spread);
   `coSitedWith[]` (separate blueprints, one design pass; a typed relation:
   `sightline`, `same-water`, `approach-through`, `satellite`, `ferry-pair`,
   each with the measurement that proves it); `ownerGuided` (deliverable
   4c); `reservedFor` (4a); `histCommunion` (4b); the record-level
   `schemaVersion` (a schema change: record it in the decision, migrate the
   file-level value onto every record, keep the file-level one as the
   maximum). Tests: an unknown relation kind fails; a `designGroup` whose
   members are further apart than its register row allows fails; a
   `coSitedWith` relation whose measurement fails (a `sightline` pair the
   scour cannot see, a `same-water` pair on different body ids) fails; a
   record standing inside another record's footprint (deliverable 2) fails.
2. **The re-plot, then the review, then the seeded settle.** The owner
   ordered a province-wide re-plot on the frozen ground (ruling 1), so the
   sequence is:
   - *Re-plot by hand once*: `macro_plot --resolve-all` under the seed rule
     with **only the owner-approved city anchors pinned** (owner
     2026-09-18). The five exemplar blueprint sitings are **not** pins:
     they were chosen on the old ground, the records are re-plotted like
     any other; 16i re-authors each blueprint where its record lands
     (`apply_sitings` must not re-pin them from the stale blueprints; the
     ledger names where each of the five moved to). **A city pin is where the
     city's gate stands on its main road, not its centre** (owner
     2026-09-18). Each pinned city carries two sited points on the record:
     `gate` (on the road, at or near the pin; the road is frozen and is
     not re-solved) and `centre`, chosen thoughtfully: ground where a city
     of that footprint can actually be built (slope, water and the flood
     line measured from the record, the culture's siting grammar in the
     recipe), reachable from the gate by a street or way that the existing
     street router (`street_router`, the blueprint tooling) can actually
     find on the measured ground. The centre may be some distance from the
     gate; the record stores the found gate-to-centre way so 16h/16i build
     it rather than re-derive it. The exclusion footprint is drawn around
     the centre. A city whose local geography cannot hold its footprint on
     any centre the router can reach from the gate is an owner call,
     reported with the measurement, not moved silently. The plot review report starts from the run's `seeding`
     block.
   - *The review of every record* against the frozen world, by tool where
     the rule is coded and by reasoning where it is not: water facts from
     the graph (0), terrain promises (`terrainRequests`, 97 B7), **extent**
     (A6, 0041: every record carries an approximate footprint radius by
     magnitude band or, where a blueprint exists, measured from its built
     ground — Lilmoth 225 m — and no other record may stand inside it
     unless `boundTo`/`mayAbut` says so; the solver already scores this,
     so make it a gate: a record inside another's footprint fails).
     Places are not circles (owner 2026-09-18): the radius is the
     estimate for the many small records, where the error is metres; for
     M4 and M5 records the review authors a `footprintPolygon` on the
     record where the geography makes the circle wrong (a city along a
     shore or a ridge, a town on a river bend), sized from the recipe's
     magnitude band and shaped to the buildable ground; the gate
     checks the polygon where one exists and the radius otherwise;
     16i's built hull replaces the polygon when the blueprint exists, sightline
     (A6), proximity (A6b), danger bands (A7), "on the road"
     against the 0069 network (A8), navigable water sampled along the
     serving lane (B5 depth classes), the enclave gate (A11), the approach
     cue and the two-visible rule (siting research §7: report them; gate
     them only if the measurement is cheap and shown to fail). Every
     failing record receives one remedy — macro move, meso move
     (`apply_sitings`), re-type (a recipe the ground supports), prose
     rewrite (text-reviewed), merge into a design group, or cut (status,
     not deletion: ids are permanent) — recorded per record with the
     measurement and the lore reason. The six records naming cut roads are
     re-referenced to tracks and lanes and their prose repaired.
   - *The seeded settle*: the chain run's `macro_plot` stage (seed rule,
     incremental) places the remedied records; nothing already valid moves.
   The report is generated by a tool (`macro_plot --report`, or a small
   `plot_review.py`) into `docs/research/phase16/16g-ledger.md` § plot
   review: moves, re-types, merges, cuts and re-references by region with
   numbers; the agent adds the reasoning, not the counts.
3. **Design groups and co-siting sets.** Lost City + the Made Ground first
   (`place.hist-heartland.lost-city` + `xal-krona-making-ground`, 73 m
   apart, reached through the city after MQ29). Then reason about every
   candidate pair: the fifteen quests/25 §20e asks (applied as
   `sitingPrefs`, no hand-written positions, §20f rule 4); every
   `boundTo` pair (the typed satellite relation; the recipes'
   `slots.satellite` is prose and is not parsed); every ferry pair in the
   service graph; any two records within 150 m that name each other in
   `relations` (`visibleFrom`, `reachedVia`, `dependsOn`, `supplies`) or
   share a `proseRefs` source. Each pair: merge, co-site, or nothing, with
   the dossier reason. A group's members clear only the smaller footprint
   radius (0041 extent rule for `mayAbut`/`boundTo`).
4. **Records other phases wait on.**
   4a. *The stronghold* (quests 30 §24b.5, 20 §12b, 0028; homed here by
   0061): one reoccupied xanmeer or abandoned river station, chosen from
   the candidates the quest-place map names (`imperial-fringe.the-empty-steading`,
   `pirate-freeholds.rockpoint`) or a better-grounded record, reserved with
   `reservedFor: player-stronghold` and a design group; its terrain and
   water facts measured like any other record's; the interior is a Phase
   12 xanmeer-family or river-station job and the record's promises (Part
   2) say so, with the three phase states and four allegiance overlays the
   quest plan fixes.
   4b. *The hero Hist* (buildout register: about ten, each with a stable
   id and a power slot): confirm the set from the catalogue's
   `hero-hist-grove`, `hist-grove-capital` and `wild-hist` records against
   the dossiers, give each `histCommunion: { powerSlot, status }` (the
   powers are effect-stack data later; race-neutral); site the
   rootworm stations at the ones the lore supports (deliverable 6).
   4c. *`ownerGuided: true`* on every major city (the eight M5 records and
   Alten Corimont if the owner counts it) and on the opening-scene places
   (the prisoner tutorial in the marsh near Stormhold and Alten Corimont,
   quests 00; name the records with the quest-place map) with the
   `vasteiTutorialScene` flag on the tutorial record (buildout register);
   validated by `--check`. The settlement-build, kit-qa and later
   interior-build skills refuse to run unattended on a record that carries
   it: write that refusal into `settlement-build/SKILL.md` §0 now and add
   the test (a skill run over an owner-guided record without the owner
   flag fails).
   4d. *Wrecks and submerged ruins* are places with promises like any
   other (0062): for each of the 12 shipwreck-family records and every
   record with an underwater entrance (52), confirm the water the graph
   records is deep enough for the hull or the entrance
   (`reaches[].depthM` / body level, never the raster) and write the
   `underwaterAccess` block to world 60 §44's access-metadata list
   (surface access nodes, Argonian-immediate vs breath-gated, air pockets,
   submerged portals). A wreck on water too shallow for any `wrecks-v1`
   hull is moved or re-typed to a beached wreck. Do not plot a Depths hull
   the owner has not yet eyeballed; the report lists which six.
5. **Minor routes and waterways** on the settled plot (`compile_minor_routes`,
   `compile_minor_waterways`, ported by 16e, run here once). Tracks get
   **no grading** (owner 2026-09-15): the solver carries 16e's gradient
   cost (`GRADE_WALL` stays a wall for tracks) so a track needs none;
   the Soulrest–Lilmoth coast track is laid from the registry's `track`
   row with its stage places kept; a footpath starts only at a record
   (97 A8). The licensed camp track head moves to where the road first
   reaches the camp (`terminal.sap-tapping-licensed.track-head` `entryUV`;
   backlog row). Each track emits one `vegetation-clearance` patch (0070);
   `apply_vegetation_patches` applies them to the touched chunks only and
   the receipt names those chunks. Waterway lanes are lined on reaches and
   bodies whose recorded depth floats the lane's hull class; a lane the
   record cannot float is re-lined, its station moved, or made a portage
   or boardwalk feature (world 60 § densification); dredging is forbidden
   (ruling 6). Test: a track sample on ground over the cap fails; a lane
   sample on a reach shallower than its hull class fails; a patch clears
   inside its polygon and nothing outside.
6. **Fast travel is the travel-service graph, re-authored with the places**
   (0069; `travel_services` on this row). One graph, one validator
   (`travel_services --check`, green with no `unmatched` or `unresolved`
   active row):
   - the nine `unresolved` station-run hops follow the new minor waterways;
   - **every pinned city is on the fast-travel network** (owner
     2026-09-18): at least one boat, ferry or rootworm service lands at
     each of the eight through **a harbour station per city** on water
     joined to the boat's own water (a boat never lands at a city that is
     not on its water; 16g chooses the nearby place and the service lands
     there);
   - **connectedness over depth** (owner 2026-09-18): fast travel is
     talk-pay-arrive, not a simulated voyage, so the gate is that the
     graph is **one connected network** (every station reaches every other
     by some chain of hops, through hubs) and that every station stands
     at the edge of recorded water (or a rootway) and every hop follows a
     recorded lane, reach chain or rootway. Water depth along a hop and at
     a berth is **reported, not gated**: a hop that runs through water too
     shallow for its craft is a warning line in the ledger, never an
     `unmatched` status; the 16e berth walk still records `jettyM` and the
     depth found so 16h can place the dock; a landing on dry ground is
     still a fail. This relaxes 16e's berth rule for the whole graph and
     re-admits the Onkobra bond ferry unless the review finds a better
     reason to move it;
   - `ferry.imperial-fringe.onkobra-bond` becomes active under the
     connectedness rule (its shallow far berth is a ledger warning) unless
     the review re-sites it for a better reason; the two `positionM: null`
     stations are sited or their services retired;
   - every ferry-band lake crossing the 16e ledger marks NO SERVICE gets a
     service or a recorded reason (nobody lives there to run one);
   - **the rootworm network** authored properly: the four `placeholder`
     root nodes and `rootworm.underground-express` are re-sited at the
     hero Hist the dossiers support (the Underground Express of *The
     Argonian Account*, the Waykeeper dossier in quests 40); the Gideon
     terminus stays a seasonal wintertide stop, never a standing station
     (quests 20 §12b); the Underway stays a root-gallery story with no
     service; each station is a catalogue record with an operator roster
     slot; `root-transit.json` and the hard-coded painter are gone (16e
     said so; confirm); quests 20's root-transit note rewritten.
   - a service whose station this review moved or cut is re-derived,
     never left pointing at old ground.
   Tests: the graph is connected (shown failing on a planted island);
   every station resolves to a live record with a position at a water or
   rootway edge; every hop follows a recorded lane, reach chain or rootway; every quests 20/25
   `FAST` node resolves to a service id; the `ServiceSocket` contract in
   `packages/game-core/src/travel/` (16e) reads the re-authored graph
   unchanged.
7. **Empty `terrain-request-known-red.json`**: each of the six registered
   requests is re-sited, re-typed or dropped by the review with the
   measurement; the register dies with its last row and the postcondition
   gate keeps failing on any request outside an empty register.
8. **One density vocabulary, one number.** World 97 has no §75; its tiers
   are §A4 (beacon / destination / snack) and the 18–22 per km² gate lives
   in 0027 and the phases README. State in 97 §A4, once: `densityLayer`
   landmark = beacon, destination = destination, fine-tempo = snack; the
   18–22 (D0–D3) and 8–12 (D4–D5) gate counts **every named record of the
   three layers** (0027's province total of 550–750 only reconciles that
   way), with the recipes' `recordScope` making the count honest and A4's
   per-tier densities as sub-budgets that are reported. Then report the
   budget per zone on the settled plot in the ledger, reconcile the
   measured D0–D3 figure (28.2/km² before this chunk) against the gate;
   `test_catalogue`'s per-zone floors and ceilings read the same
   definition so "density budget per zone" can fail.
9. **The plot published and the red tests green**: `export_places` as a
   chain stage; `test_export_places`, `test_export_blueprints`,
   `test_export_purpose_ledger`, `test_render_blueprint`,
   `test_committed_water_facts`, `test_water_fact_invariants`,
   `test_audit_place_semantics` green on the record (the last rewritten
   against the 0069 network, not the cut road) and added to
   `test:placement`; `quests --check` and `route_registry --check` green;
   zero typed-siting violations on the finished plot.

### Part 2 — the records later phases build against

10. **The promise vocabulary for dungeon-kind places** (0062: Phase 12
    builds the insides against promises made here; 16j and Phase 15 author
    more, so the vocabulary is fixed now). One vocabulary, edited in place:
    world 70 §48's `InteriorProgram` is the design statement and
    `catalogue.py`'s `interior` block is the binding schema (the research
    doc's §4 proposal is reconciled to point at it, not kept as a parallel
    version). Extend the block with typed fields: `roomFunctions[]`
    (entrance, gauntlet, cache, boss, captive, shrine, workshop, barracks,
    flooded gallery, nursery, archive; extend the typed list with whatever
    else the breadth of dungeons this province needs, reasoned from the
    families and the quest provisions), a typed loop/shortcut
    requirement, traversal demands (swim length, dive depth, climb, breath
    gating), combat-space intents (world 70 §49 scale and clearances),
    **anchor sockets** (Boss / Boss-Chest / Captive and the rest of the
    buildout register's list), a `whereInInterior` class on every
    `contents` slot, a light regime, a lock class, `verticalRelationship`
    and `schemaVersion` on every record. **These are things a dungeon
    *can* promise, not must**: a captive socket on every delve is exactly
    the sameness the province must not have; no two dungeon-kind records
    may be functionally identical; a test measures it (the ≥ 3-axes
    rule of 97 A6 applied to the promise fields within 2 km).
    - *Migration*: mechanical over the 327 records, defaults from family,
      size band and purpose **only where a field is absent**, then reviewed
      by reasoning per family; buildings (155) receive only
      `schemaVersion` and `verticalRelationship`.
    - *Quest-derived promises come from the quest plan*: the per-quest
      provisions (quests 20 §11 tags, §13 fields) and the quest-place map
      are read into typed sockets and slots (evidence, scene, captive,
      boss, station, the named item or enemy type a quest needs), so a
      dungeon that a quest needs promises exactly what its brief asks; the
      owed §20f check "every provision id declared in 30/40/50 appears on
      at least one live record" is written and green; tier-0 ownership is
      respected (quests 20).
    - *Realisation recipe rule (asset-aware)*: a family→recipe table in
      `type-recipes.json` (or beside it) maps each of the 14 interior
      families to a recipe backed by something that exists — a kit in
      `apps/world-studio/public/kits/` or a sourced mod in the vault with
      source, hash and credit recorded (root-cavern / flooded-cave /
      burrow-warren / smuggler-den → `dungeon-root-v1` and its water
      plane; xanmeer-complex / hist-sanctum → `xanmeer-interior-v1`;
      imperial-fort → `imperial-keep`; shipwreck → `wrecks-v1`; dwelling /
      civic-hall / abandoned-plantation → a furnished vanilla cell under
      the 16i fit rule; sinkhole-ruin → root kit plus `ruin-monumental-v1`
      dressing). For ayleid-nedic-ruin and kothringi-lilmothiit-site the
      vault has nothing: **source first** (Nexus, the owner's key, the
      golden rule) and record it; re-type only what no mod anywhere can
      back (to a family with a recipe, or to an exterior ruin, camp,
      shrine or landmark that needs no interior; 0062 makes the dungeon
      share a lever). Tests: a record whose family has no recipe row fails;
      a promise field outside the vocabulary fails; a recipe row naming a
      kit or vault source that does not exist fails.
    - *Obligations*: generalise `place_obligations` to project
      **record-only** obligations (no blueprint required; owner
      `phase-12`) from the promise fields, exported as the expected set;
      the manifest verifier is written by the first chunk that emits a
      manifest (16i, tier A interiors) and the phases README's wording is
      corrected to say so instead of naming a module that does not exist.
11. **The prior→roster rule** (buildout register and 0062; cited as world
    92 §84, which does not yet state it — write it there): generate a
    roster record for every `notableNpcSlots` entry on every live record
    (346 places today; fewer after cuts) into
    `world/sources/registries/npcs.json` `entries`: stable id, name, race
    and sex from the demographic priors and the culture registers, faction,
    home place and slot, role, `status: generated`; a slot the cast roster
    (quests 36) already names takes that cast member, never a second
    identity. **Field names follow the 10b `NpcRecord` list** (identity,
    race and sex, faction ids, home place and socket, plus the typed empty
    slots for statblock, marks, schedules, dialogue topics, services,
    crime standing) so 10b extends the record without renaming it. Names
    obey the style guide's form caps (≤ ⅓ Verb-the-Noun, no repeated
    imagery, the per-culture forms), checked mechanically and text-reviewed
    in bulk by a separate agent. Test: every slot resolves to a record and
    every record to a live slot.
12. **Names for the water and the land** (owner 2026-09-11, because this is
    where the plot and the lore meet). Name every river of Strahler ≥ 2 or
    catchment ≥ 4 km² (about 20–25 today), every body ≥ 1 ha (74), every
    fall (18), the lagoons and bays, the peaks that a person would name
    (decide the rule and record it: prominence and visibility, not a
    height cut) and the passes that the roads use; smaller creeks and ponds
    only where a place or quest refers to them. Grounding: dossiers first,
    then UESP for the attested names (the Onkobra, the Blackwood, Oliis
    Bay and the rest must land on the right entity), extrapolated names by
    the culture registers with the same QA as place names. Storage: the
    graph entity's `name` is a text-catalogue key (`hydrology.name.<id>`),
    never a literal; `world/sources/hydrology/names.json` records the
    grounding per name (UESP page or extrapolation rule); the 2D map's
    tooltip shows the name when present. There is no Helstrom road to
    rename (0069); the two records that call it "the Bogmother causeway"
    are rewritten under deliverable 2.

### Moved out of this chunk (recorded, not parked)

- **The stilt open-water share and the quay flood-section rule scope**
  (backlog rows; plan §9 had them here) go to **16h deliverable 0**, which
  ports the reads they live in (`compile_settlement.flood_band_report`,
  97 B4/B5). The rule, decided now so 16h needs no steer: the 15–30 %
  over-water share is asked only of a district whose parcels touch a
  recorded body, reach or flood band (by id); `works-quays-flood-section`
  is asked only of a works parcel that does; a district on dry high ground is not
  in scope and its known-red rows retire with the fix. The plan's §9 row
  and the 16h brief are edited in the same commit as this brief.

## Acceptance

- **The chain ladder** (plan §3): the `[16g]` row filled and re-ordered as
  deliverable 0b says, `DELIVERED_THROUGH="16g"`, the order gate shown
  failing on the old order, one chain run `--from apply_sitings` whose
  stage list the ledger reproduces.
- `catalogue --check`, `macro_plot` (zero homeless, zero typed-siting
  violations), `route_registry --check`, `travel_services --check`,
  `quests --check`, `test_record_reads` (five rows deleted) green; the
  seven red test files green and in `test:placement`; every test this
  brief names **shown failing first** on the data as it stands; `npm run
  preflight` green.
- The ledger `docs/research/phase16/16g-ledger.md`: the plot review
  (moves / re-types / merges / cuts / re-references by region), the
  design-group and co-siting list with reasons, the density budget per
  zone against the one definition, the service graph changes, the
  family→recipe table with its sourcing outcomes, the roster and naming
  counts, every image ingested (plan §8 budget) and its verdict.
- Docs edited in place, one version of the truth: 97 §A4 (density
  mapping), 96 §1 step 8 (the stage names; `--resolve-all` as the hand
  step before the run), 92 §84 (the roster rule), 70 §48 (the vocabulary),
  60 § travel services (reads the record, not "Phase 4 lanes"), quests 20
  (root-transit note, §20f owed check closed), quests 25 §20e (asks
  applied), the catalogue README, the research §4 proposal reconciled, plan
  README §4/§9/§10 rows, PROGRESS, 16h's Starting state rewritten, a
  decision record for the non-obvious calls (schema change, density
  definition, re-plot sequence, stage re-order, the harbour-station rule,
  the rootworm set).

## Owner check

**What you will see** (plan §3, build only what is delivered): no new 3D
layer. The 2D map (`?cat=1`) shows the settled plot, the tracks, the
waterways and the service graph with hover text; the ledger and the
records carry the rest. One check, everything at once.

**The plot:**

- Read the ledger's plot review summary: moves, re-types, merges, cuts and
  re-references by region. Is there any cut or merge you reject? Say which.
- The 2D map: Lost City + the Made Ground as one group; the lighthouse +
  wrecker beach pair with their shared sightline; the stronghold site; the
  harbour station chosen for each of the eight cities; the rootworm
  stations at the hero Hist; where the five exemplar towns landed. Hover
  each: does the reason read right?
- Follow one track and one waterway lane end to end on the map: does the
  track stay on walkable ground and the lane on water a canoe floats?
- The density table per zone: any zone that feels empty or crowded on the
  map compared with its number?
- The Onkobra ferry call and the NO SERVICE crossings: agree or steer.
- Each of the eight cities: is the gate on its road where you expect,
  is the centre on buildable ground, does the found way from gate to
  centre look sane, does a boat or ferry land there? The
  ledger names any city whose geography could not hold its footprint.
- The fast-travel map: is it one joined-up network with nothing
  stranded? The ledger's shallow-water warnings are for information.

**The records:**

- The family→recipe table: any family you would rather source than re-type,
  or re-type than source?
- The promise sample the ledger shows (five dungeon-kind records of
  different families): do they read as five different places to explore?
- The names: read the river, bay and peak list; reject any that sound
  wrong for their culture. The tooltip shows them on the map.
- A dozen roster names from three cultures: same test.

## Gotchas

- The scorer is globally sensitive: the city pins go in **before** the
  deliberate `--resolve-all` (`macro_plot.py` ~2252) and the exemplar
  blueprint pins are removed first; the chain's `macro_plot` stage runs the
  incremental seed rule and must never resolve-all by itself.
- Never hand-write a position: `sitingPrefs`, `apply_sitings` and the
  solver are the only writers (96 §1, quests 25 §20f rule 4).
- A cut is a status; an id is permanent (quest engine registry, buildout
  register).
- `travel_services` now runs after the minor waterways; a hop that still
  reads the old lane file is the class 0066 forbids.
- Every prose change and every name goes through `text-review` in a
  separate agent, batched, before the commit that carries it.
- Do not plot a Depths of Skyrim hull the owner has not eyeballed.
- Two agents share the tree: commit by pathspec; the chain lock is
  honoured; never `pkill -f`; one dev server on `$ES_STUDIO_PORT`.
- Commit locally; do not push.

## Delivery plan (written 2026-09-18; the delivering agent follows it and records departures in the ledger)

The delivering agent is Fable (`deliver 16g`). Opus subagents (`deliver`
for implementation and mechanical passes, `research` for read-only
measuring and mining) run every pass below that is fully specified, **in
parallel wherever the passes touch different files** (owner 2026-09-18);
every judgement call (a remedy, a merge, a recipe, a station, a name rule,
a city centre) is Fable's. Subagents commit nothing: Fable reviews and
commits by pathspec.

**Step 0 — reconcile (Fable, first commit).** `routing-audit` over this
brief; `git status`/`git log`; PROGRESS row to `in progress`; the decision
record drafted with the calls this brief already makes.

**Step 1 — four lanes at once, different files.**
- *Lane A, reads* (`deliver`): deliverable 0 — the five modules ported to
  the record reader, the provenance test failing first,
  `remeasure_plot_facts` keyed to graph ids.
- *Lane B, chain* (`deliver`): deliverable 0b — stages added, the `[16g]`
  row re-ordered and re-homed, the order gate failing on the old order,
  `DELIVERED_THROUGH` untouched until the run.
- *Lane C, schema* (`deliver`): deliverable 1 — fields, tests, the
  design-groups register skeleton, the record-level `schemaVersion`
  migration, the catalogue README.
- *Lane D, mining* (`research`, read-only, feeds Part 2): the attested
  water and landform names from the dossiers and UESP with page citations;
  the interior-kit sourcing candidates on Nexus for ayleid-nedic-ruin and
  kothringi-lilmothiit-site; the cast-roster slots (quests 36) joined to
  `notableNpcSlots`.
Fable checks each lane; step 2 starts when lane A's `test_record_reads`
is green with two rows and lane C's `--check` passes.

**Step 2 — the re-plot (Fable).** The exemplar pins are removed and the city pins placed;
`macro_plot --resolve-all` runs once by hand; the tool-generated review report.

**Step 3 — the review, measured in parallel, decided by Fable.** One
`research` subagent per region (eight) measures every failing record in
its region against the rules in deliverable 2 and tabulates the rule that
failed and the candidate remedies with numbers; Fable decides each remedy
with the dossier reason, the eight city centres within their areas, the
design groups and co-siting pairs (3), the stronghold, the hero Hist set,
the owner-guided list, the wreck and underwater confirmations (4), the
terrain-request register (7), the density definition (8), the harbour
stations, the Onkobra call, the rootworm set and the NO SERVICE answers
(6). Prose repairs are written by a `deliver` pass from Fable's per-record
notes, then `text-review` in a separate agent. `apply_sitings` writes the
remedies back.

**Step 4 — the one chain run (Fable).** `terrain-chain.sh --from apply_sitings --through 16g`
under `memwatch.sh`: the seeded settle, the minor networks with their
clearance patches, the re-authored services, the route export and paint,
the patch application, the postconditions, the plot export. Rasters
published; the ledger's stage list checked against 0b. `DELIVERED_THROUGH`
bumped in this commit.

**Step 5 — gates (Fable, with one `deliver` pass for the seven red
files).** Tests green on the record and in `test:placement`; density per
zone in the ledger; `npm run preflight`; commit.

**Step 6 — Part 2, three lanes at once, started as soon as step 3's
remedies are decided (they run beside steps 4 and 5; the lanes touch the
catalogue's `interior` blocks, the registries and the hydrology names;
the chain run writes no part of these).**
- *Promises*: Fable designs the vocabulary and the family→recipe table and
  decides the sourcing from lane D's candidates (download, hash, credit);
  a `deliver` pass implements the schema, the migration, the
  quest-provision projection, the §20f check, the obligations
  generalisation and the tests; Fable reviews the migrated defaults per
  family.
- *Roster*: Fable writes the rule into 92 §84; a `deliver` pass builds the
  generator (the 10b field names, the form-caps checker) and generates all
  slots; `text-review` in bulk.
- *Names*: Fable writes the peak/pass rule and fixes the attested names
  from lane D onto their entities; a `deliver` pass fills `names.json`,
  the text-catalogue keys and the tooltip and generates the extrapolated
  names by register; `text-review` in bulk.

**Step 7 — close and the one owner check (Fable).** Docs reconciled (the
acceptance list); 16h's Starting state rewritten from the ledger's ending
state; PROGRESS row and Waiting-on-user refreshed; the decision record
finished; `npm run preflight`; commit by pathspec; `npm run studio`; hand
the owner the check. Not pushed.

**Order of the owner's answers.** A rejected move, cut or merge re-opens
step 3 for the named records only (a seeded re-run, not a second
resolve-all) and any Part 2 record built on it is re-migrated with it; a
rejected table, sample or name list re-opens that lane. Nothing re-runs
the chain above `apply_sitings`.
