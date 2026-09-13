# 16g — The macro plot on the frozen world: places adapt

**Goal.** Re-validate every catalogue record against the frozen terrain,
water, routes and vegetation and make the places fit the world rather than
the world fit the places: move at macro or meso level, re-type, rewrite, merge
or cut, under the relaxed floor. Introduce design groups (places built as one)
and co-siting sets (designed together), starting with Lost City + the Made
Ground.

Needs ruling 11 (the floor).

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
2. **The review of all 827 records** against the frozen world: water facts
   re-measured from the graph (`remeasure_plot_facts` reads graph ids, not
   only rasters), terrain promises, sightlines, navigable water sampled along
   the serving route. Every failing record receives one remedy: macro move, meso
   move (`apply_sitings`), re-type (a recipe the ground supports), prose
   rewrite (text-reviewed), merge into a design group, or cut — recorded per
   record with the measurement and the province's density budget recomputed
   per zone.
3. **Design groups**: Lost City + the Made Ground first; then every pair the
   quest-place map's §20e asks name, every `type-recipes.json` satellite slot,
   every ferry pair and any two records within 150 m whose `prose_links`
   name each other. Reason about each: merge, co-site, or nothing, with the
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
   the `interior` block with typed fields, migrated mechanically over all
   327 dungeon-kind records with defaults from family, size band and
   purpose, then reviewed: `roomFunctions[]` (entrance, gauntlet, cache,
   boss, captive, shrine and the rest of the typed list), a typed loop/shortcut requirement, traversal
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
   landmark that needs no interior), never promised. Generalise
   `place_obligations` to project **record-only** obligations (no blueprint
   required, owner `interiors`) so `verify_delivery_manifest` can later
   hold Phase 12 to every promise. Tests: a record with a family and no
   recipe fails; a promise field outside the vocabulary fails.
3d. **Wrecks and submerged ruins** are catalogue places with promises like
   any other (decision 0062); confirm each sits on water the graph says is
   deep enough and record its `underwaterAccess`.
4. **The plot re-solve** (`macro_plot --resolve-all` under the seed rule, pins
   kept) — once, on the frozen world; the two backlog-red records
   (dive-shaft, Giovesse lines) resolved by the review, not the solver.
5. **Minor routes and waterways** re-derived from the new plot (16e's stage,
   re-run once), the licensed camp track head moved to where the road reaches
   the camp.
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
   of ≥ 1 ha, every waterfall, the lagoons and bays, plus the mountain
   masses and passes the routes use. Smaller creeks and ponds are named
   only where a place or quest refers to them.
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
## Acceptance

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

- The scorer is globally sensitive; pins are applied after the solve; the
  write-back is incremental (96 §1 seed rule).
- Every prose change goes through `text-review` in a separate agent.
