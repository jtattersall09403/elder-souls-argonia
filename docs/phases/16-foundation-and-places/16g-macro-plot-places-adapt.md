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

## Acceptance

- `catalogue --check`, `macro_plot`, `route_registry --check`, `quests --check`
  green; a plot review report listing every move, re-type, merge and cut with
  numbers; zero typed-siting violations; density budget per zone reported.

## Owner check

- Read the plot review report's summary (moves / re-types / merges / cuts by
  region) and the design-group list: is there any merge or cut that you reject?
- In the studio 2D map, look at the Lost City + Made Ground group and the
  lighthouse + wrecker beach pair: are they where the story needs them?
- Any city anchor moved? (None should have.)

## Gotchas

- The scorer is globally sensitive; pins are applied after the solve; the
  write-back is incremental (96 §1 seed rule).
- Every prose change goes through `text-review` in a separate agent.
