# 0078 — Places adapt to the frozen world: the plot re-solved on the record, the promises fixed with the places

**Date:** 2026-09-19 · **Phase:** 16g · **Status:** in progress (accepted
calls listed as they are made; the owner check closes it).

Chunk 16g put the province's places back on the ground the ladder froze
(16b–16f), laid the minor networks, re-authored fast travel and fixed the
records later phases read. Evidence: [16g ledger](../research/phase16/16g-ledger.md).
The non-obvious calls:

1. **The plot reads the record (0066), and the seed of every re-plot is a
   scour on the frozen ground.** Five modules were ported from the purged
   flood/wetland rasters to the record reader; `plotFacts.water` is keyed
   to a graph id on every sited record and a provenance test joins it
   back; the terrain scour was re-run on the frozen base (1,172 → 1,142
   candidate sites) because the plot's candidate pool was scoured on the
   old ground. `open_water` reads the dry season like every other physical
   mask (686 wet-season-only cells were counted as open water).
2. **The chain order is a gate.** `apply_sitings`, `macro_plot` and
   `export_places` are stages; the `[16g]` row sits after the scatter and
   `travel_services` moved onto it; `chain_contracts --check` fails a stage
   whose declared read a later stage writes, with one escape (`stale_ok`,
   printed as a warning) for the eight feedback edges earlier chunks
   left and the two the 0070 patch design intends; a read of a path the
   stage itself writes and stages that never run are excluded by rule.
   `macro_plot --resolve-all` is the hand step before a run, never a stage.
3. **Schema.** Record-level `schemaVersion` (file-level is the maximum);
   `designGroup` with a register; `coSitedWith[]` with five typed relations
   and a measurement each, checked by `co_siting --check`; `ownerGuided`,
   `vasteiTutorialScene`, `reservedFor`; `heroHist.status` on the existing
   block (there is no second `histCommunion` block); `footprintRadiusM`
   on every sited record and `footprintPolygon` on cities; `cityLayout`;
   `underwaterAccessDetail`.
4. **A city is a gate on its road and a centre on buildable ground.** The
   gate is the frozen road's terminus at the anchor; the centre is chosen
   by measurement within 320 m (dry, gentle, the recipe's water share)
   and joined to the gate by the street router's terrain line; the record's
   dot and footprint are the centre, the polygon is the hull of the
   buildable ground. Helstrom's and Alten Corimont's gates are landings.
5. **Names.** Attested names land on the entities the mining doc measured;
   one river carries Red Bramman's river and Soulrest's river; Lake
   Blackwood is the marsh-deep north-east of Gideon; bays and seas are
   named regions of the one ocean body, not entities; peaks by prominence
   (≥ 60 m, one per massif) and passes where a road crosses a saddle.
6. **The promise vocabulary** is world 70 §48; every family has a recipe
   backed by a built kit (the Ayleid and Kothringi families were already
   deliverable: nothing was sourced); defaults are derived from what each
   record already says and the sameness test is real.
7. **The opening scene is an Alten Corimont ring**, not a Stormhold one:
   three active records within 500 m of the freehold carry `ownerGuided`
   and the barge carries the tutorial flag; the stale research claim was
   corrected.
