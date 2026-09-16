# 16g — The macro plot on the frozen world: places adapt

**Goal.** Re-validate every catalogue record against the frozen terrain,
water, routes and vegetation and make the places fit the world rather than
the world fit the places: move at macro or meso level, re-type, rewrite, merge
or cut, under the relaxed floor. Introduce design groups (places built as one)
and co-siting sets (designed together), including (importantly) the Lost City + the Made
Ground.

Needs ruling 11 (the floor).

## Starting state (2026-09-16, written by the closing 16f agent; the closing 16g agent rewrites 16h's)

- **The ladder is built through 16f** (`terrain-chain.sh` `DELIVERED_THROUGH="16f"`;
  the `[16f]` row is `compile_scatter apply_vegetation_patches
  compile_water_dressing`; `[16g]` is `compile_minor_routes
  compile_minor_waterways`). **One run per chunk, from your own first stage
  (`--from compile_minor_routes`), nothing above it** (owner 2026-09-16;
  plan §3). `compile_water` is skipped on every routine run; a stage whose
  accepted outputs lack a stamp at its position is recorded with
  `python3 -m worldgen.chain_stages adopt <NN-stage> <stage>`, never re-run.
  `--check-contracts` runs before every stage: a stage you add declares its
  reads in `worldgen/chain_contracts.py` or the run refuses.
- **The scatter reads no settlement or track data** (decision 0070). Your
  minor routes clear vegetation by emitting one `vegetation-clearance`
  patch per track into `world/sources/flora/vegetation-patches.json`
  (schema in the file; validator `vegetation_patches.load_patches`) and
  running `apply_vegetation_patches` (position-addressed rolls, a receipt in
  `province/vegetation/vegetation-patches-receipt.json`); `compile_scatter`
  is never re-run for a track. The runtime ring reads the published copy.
- **The water record is read through `ShippedWater`** (`water_report.py`:
  `kind_index_grid`, `season_index_grid`, `reach_width_grid`, `river_of`,
  `kind_grid`, `reach_band_grid`) and `ProvinceSurvey` (`site_fields.py`)
  on the 1345 grid; `test_record_reads.py` fails any module below the gate
  that re-derives water; your four allowlist rows (`audit_place_semantics`,
  `hostility_frequency`, `macro_plot`, `site_dossier`, `terrain_scour`) are
  the last ones: delete each as you port it.
- **The travel-service graph is yours** (0069): `travel-services.json`
  stations join places you re-plot; two stations carry `positionM: null`
  (deferred); a boat service lands at a harbour station on joined water.
- **Wrecks are places** (0062): `wrecks-v1` (19 statics, mined ground
  contact, no connector templates anywhere) is built; each wreck record's
  water depth is confirmed here (3d) and 16h stands it up. Six Depths hulls
  reference textures the mod does not ship: the owner eyeballs them first.
- **Dressing zones** (`world/sources/flora/dressing-zones.json`, overlays in
  `worldgen/dressing_zones.py`) are the authored-overlay record; the delta
  overlay is keyed to `river.889-484`'s reaches and `body.2822-1398`.
- **Red today and yours**: `test_export_places`, `test_export_blueprints`,
  `test_export_purpose_ledger`, `test_render_blueprint`,
  `test_committed_water_facts` (3), `test_water_fact_invariants` (4),
  `test_audit_place_semantics` (1) — all read the stale plot or the
  pre-graph survey keys; none is in `test:placement`. Also
  `test_solve_major_routes::test_a_gradable_step_costs_earthworks_and_a_cliff_is_a_wall`
  (16e's, backlog row) is red outside the gate.
- 827 records in eight `places-*.json` files, 580 sited; the promise schema
  facts and the `terrain-request-known-red.json` ownership from the
  2026-09-13 note still hold (see git history of this section).

## Read

- README.md §3, §10; `world/97` Parts A–B (macro, meso); `world/96` §1 (the
  seed and write-back rules); decision 0041 § Places have EXTENT and § Part 3c;
  `docs/quests/25-quest-place-map.md` §20e–f; `world/sources/catalogue/README.md`
  and `type-recipes.json`; `research/placement-settlements/openworld-place-distribution-and-siting.md`.
- `worldgen/macro_plot.py` (the seed rule, terrain-promise gate, the
  navigable check), `apply_sitings.py`, `remeasure_plot_facts.py`,
  `audit_place_semantics.py`, `catalogue.py`.

## Deliver

1. **Schema**: `designGroup` (one blueprint, one build) and `coSitedWith[]`
   (separate blueprints, one design pass, a typed relation: `sightline`,
   `same-water`, `approach-through`, `satellite`, `ferry-pair`) on catalogue
   records, validated by `catalogue --check`; the register
   `world/sources/catalogue/design-groups.json`.
2. **The review of all records** against the frozen world: water facts
   re-measured from the graph (teach `remeasure_plot_facts.py`, 165 lines
   and raster-only today, to key water facts to graph reach and body ids), terrain promises, sightlines, navigable water sampled along
   the serving route. Every failing record receives a remedy: macro move, meso
   move (`apply_sitings`), re-type (a recipe the ground supports), prose
   rewrite (text-reviewed), merge into a design group, or cut — recorded per
   record with the measurement and the province's density budget recomputed
   per zone.
3. **Design groups**: Lost City + the Made Ground first; then every pair the
   quest-place map's §20e asks name, every `type-recipes.json` satellite slot,
   every ferry pair and any two records within 150 m that name each other
   in `relations` (`visibleFrom`, `reachedVia`, `dependsOn`, `supplies`) or
   share a `proseRefs` source path (there is no `prose_links` record field;
   `prose_links.py` is a module). Reason about each: merge, co-site, or nothing, with the
   lore reason (dossiers first).
3b. **The stronghold site** (quests 30 §24b.5,
   decision 0028; homed here by 0061): one reoccupied xanmeer or abandoned
   river station, reserved as a catalogue record with
   `reservedFor: player-stronghold` and a design group, its terrain and
   water facts measured like any other record's. Its interior is a Phase 12
   dungeon-family job; this chunk reserves the ground and the lore reason.
3c. **The promise vocabulary for dungeon-kind places** (decision 0062: the
   insides are built in Phase 12 against promises made here, so the
   vocabulary must be right before 16j and Phase 15 author more). Extend
   world 70 §48's `InteriorProgram` (the catalogue `interior` block and
   `packages/contracts`, one vocabulary edited in place) with typed fields,
   migrated mechanically over all 327 dungeon-kind records with defaults
   from family, size band and purpose **only where a field is absent**
   (85 already carry `verticalRelationship`, 12 `interior.schemaVersion`;
   `schemaVersion` is file-level today; moving it per record is a
   schema change to decide and record), then reviewed: `roomFunctions[]` (entrance, gauntlet, cache,
   boss, captive, shrine and the rest of the typed list - plus anything else you think should be on it in order to enable the breadth of dungeon experiences our game should have - you can extend the typed list), a typed loop/shortcut requirement, traversal
   demands (swim length, dive depth, climb, breath gating), combat-space
   intents (world 70 §49 scale and clearances), **anchor sockets**
   (Boss / Boss-Chest / Captive, the buildout register's pull-in), a
   `whereInInterior` class on every `contents` slot, a light regime and a
   lock class, `verticalRelationship` and `schemaVersion` on every record.
   **Realisation recipe rule (asset-aware):** every family maps to a recipe
   backed by a kit that exists (`dungeon-root-v1` modular cave and its
   water plane; `xanmeer-interior-v1`; imperial and hlaalu tilesets; a
   verbatim vanilla cell); a record whose family has no recipe is re-typed
   here (to a family that has one, or to an exterior ruin, camp, shrine or
   landmark that needs no interior), never promised. **Quest-derived
   promises come from the quest plan**: the per-quest provisions in
   `docs/quests/20-world-provisions.md` and the quest-place map (25) are
   read into the vocabulary as typed sockets and slots (evidence, scene,
   captive, boss, station, the named item or enemy type a quest needs, whatever else might be required - you must check), so
   a dungeon that a quest needs promises exactly what its brief asks; the
   per-packet co-design loop (quests 90 §65b) adds local-quest promises the
   same way in 16j and Phase 15. Generalise
   `place_obligations` to project **record-only** obligations (no blueprint
   required, owner `interiors`) so `verify_delivery_manifest` can later
   hold Phase 12 to every promise. Tests: a record with a family and no
   recipe fails; a promise field outside the vocabulary fails. By the way we've referenced 'captive' above a lot, do not take this to mean that every dungeon must have a captive! same for othe other promises too, these are things that they *can* have, what they actually *do* have is to be authored (including the quest tie ins as described above); we want a broad variety of dungeons across the province and no two that are functionally identical.
3f. **The prior→roster rule** (world 92 §84; homed here by the buildout
   register and 0062): generate the named-NPC roster records for every
   `notableNpcSlots` entry (346 places; `npcs.json` holds two today) into
   `world/sources/registries/npcs.json` — identity, race and sex, faction,
   home place and slot, `status: generated` — as the seed 10c gives
   statblocks to and 13/15 populate. Test: every slot resolves to a record.
3e. **`ownerGuided: true`** as a typed catalogue field on every major city
   and on the opening-scene places (the prisoner tutorial in the marsh
   near Stormhold and Alten Corimont, quests 00; name the exact records
   with the quest-place map), validated by `catalogue --check`; the
   settlement-build, kit-qa and (later) interior-build skills **refuse to
   run unattended on a record that carries it**. Test: a skill run over an
   owner-guided record without the owner flag fails.
3d. **Wrecks and submerged ruins** are catalogue places with promises like
   any other (decision 0062); confirm each sits on water the graph says is
   deep enough and record its `underwaterAccess`.
4. **The plot re-solve** (`macro_plot --resolve-all` under the seed rule, pins
   kept) — once, on the frozen world; the two backlog-red records
   (dive-shaft, Giovesse lines) resolved by the review, not the solver.
5. **Minor routes and waterways** solved on the new plot (their vegetation
   clearance is a `vegetation-clearance` patch emitted per track into
   `world/sources/flora/vegetation-patches.json` and applied by 16f's
   `apply_vegetation_patches` to the touched chunks only; the scatter is
   never re-run for a track, owner 2026-09-16) (`compile_minor_routes`
   and `compile_minor_waterways`, ported by 16e and on this chunk's ladder
   row; run once). Minor routes get **no grading** (owner 2026-09-15), so
   the solver carries the same gradient cost as 16e's major router and a
   track never needs one. The licensed camp track head moved to where the
   road reaches the camp. Then `travel_services` re-run (16e's stage): minor-station hops
   follow the new minor waterways; the four rootworm stations 16e carries
   as `status: placeholder` are re-authored here at the hero Hist nodes this
   chunk places (the Hist communion slot, buildout register), with the
   quests 20 root-transit note updated; a service whose station this review
   moves or cuts is re-derived, never left pointing at old ground.
6a. **The Underway basin ferry** (`ferry.hist-heartland.underway-basin`,
   `status: unmatched` since 16e): the Helstrom–Blackrose road no longer
   enters the basin, so the record's premise ("the surface route crosses the
   deep basin") is false. Decide with the plot: re-site the ferry where a
   road or a station meets the basin, or retire the service and keep the
   Underway as the root gallery alone; either way `travel_services --check`
   must be green with no `unmatched` active service. The lanes with declared
   `gaps` in `province/waterways.json` (overland or shallower than a canoe)
   are the same kind of call: re-site the station or re-line the lane on
   water the record has; never dredge (ruling 6).
6b. **Empty `terrain-request-known-red.json`**: every registered request
   is re-sited, re-typed or dropped; the register dies with its last row.
6c. **One density vocabulary**: state in world 97 §75 how the catalogue's
   `densityLayer` (fine-tempo / destination / landmark) maps onto 97's
   tiers (snack / destination / beacon) and which of them the 18–22 per km²
   gate counts, so "density budget per zone reported" can fail.
6. Rule-scope fixes the backlog owed: the stilt open-water share and the
   quay flood-section rule scoped by measured ground (which district kinds,
   which uses), with the known-red rows retired.
7. Tests shown failing first: a record standing in water its type forbids; a
   design group whose members are further apart than the recipe allows; a
   co-siting relation whose measurement (sightline, same water) fails.


### Added by 16a (2026-09-11) — naming the water and the land

Rivers, streams, lakes, tarns, falls, bays, ridges and other landforms
people would name get **names, not just ids** (owner, 2026-09-11), in this
chunk because it is where the plot and the lore meet:

1. Name every river of Strahler order ≥ 2 or catchment ≥ 4 km², every body
   of ≥ 1 ha, every waterfall, the lagoons and bays, the mountain
   peaks (make sensible choices about what constitutes a 'peak that should have a name') and the mountain passes the routes use. Smaller creeks and ponds are named
   only where a place or quest refers to them.
1b. `route.road.helstrom-blackrose` is misnamed "the Bogmother causeway" (the ruin and the attested causeway are south-west of Stormhold; dossier `world/sources/lore/topics/roads-and-routes-4e201.md`): rename it here and rewrite the catalogue prose that repeats the name (`place.mercantile-coast.white-rose-prison` § founding, `place.dunmer-north.the-northern-rest` § siteAdvantages), text-reviewed together.
2. Grounding: the lore dossiers first (`world/sources/lore/`), then UESP for
   established names (the Onkobra, the Blackwood, Oliis Bay and the rest
   exist in the source books and must land on the right entity); extrapolated names follow the
   culture registers and the same QA the place names went through
   (`docs/standards/text/`, the `text-review` skill in a separate agent).
3. Storage: text-catalogue keys on the graph entities' `name` fields
   (`river.<id>` → `hydrology.name.<id>`), never literals; a register
   `world/sources/hydrology/names.json` records the grounding per name
   (UESP page or extrapolation rule). The studio tooltip shows the name
   when present.
## Record reads (decision 0066) — deliverable 0: the code you inherit is wrong here, and fixing it is your job

`macro_plot`, `audit_place_semantics`, `site_dossier`, `terrain_scour` and
`hostility_frequency` are rows in `worldgen/record-reads-allowlist.json`
(`remeasure_plot_facts` reads no water at all, which is its own defect):
"on water", "flood band", "wet" and "navigable" all come from the coarse
Phase 3 flood band, so every water fact on the 827 records describes a
guess the owner's graph replaced. That is a bug, not a convention. Port
each to the record reader, delete the reads and the rows. A record's water
facts become `{reachId | bodyId, kind, levelM, season}` copied from the
record; the navigable check reads `reaches[].depthM` along the serving
route; the plot re-solve's water costs read the record. A test joins every
record's water facts back to the graph and fails on a missing id or
disagreeing kind, shown failing on the 827 records as they stand.

## Acceptance

- **The chain ladder** (plan §3): the order is declared once in
  `worldgen/ladder.py` (all nine chunks, since 16d) and the empty `[16g]`
  row exists in `tooling/world-generation/scripts/terrain-chain.sh`; this
  chunk fills it (the plot re-solve's `macro_plot`/`apply_sitings` stages)
  and bumps `DELIVERED_THROUGH`.

- `catalogue --check`, `macro_plot`, `route_registry --check`, `quests --check`
  green; a plot review report listing every move, re-type, merge and cut with
  numbers; zero typed-siting violations; density budget per zone reported.

## Owner check

**What you will see at this check** (plan §3, build only what is delivered): no new layer: the 2D plot review and the place records.


- Read the plot review report's summary (moves / re-types / merges / cuts by
  region) and the design-group list: is there any merge or cut that you reject?
- In the studio 2D map, look at the Lost City + Made Ground group and the
  lighthouse + wrecker beach pair: are they where the story needs them?
- Any city anchor moved? (None should have.)

## Gotchas

- The scorer is globally sensitive; pins are placed **before** a deliberate
  resolve-all (`macro_plot.py` ~2252); the write-back is incremental (96 §1
  seed rule).
- Every prose change goes through `text-review` in a separate agent.
