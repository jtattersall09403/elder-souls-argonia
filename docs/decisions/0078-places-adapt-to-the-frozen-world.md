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
8. **The review's remedies are typed rows, and canon decides which way a
   fault is fixed** (the plan behind the rows:
   [16g-remedy-plan](../research/phase16/16g-remedy-plan.md)). Where a
   dossier or UESP page ties a place to its water or its neighbour, the
   record is pinned by typed siting (`boundTo`, `nearWater`, `nearPoint`,
   `minDepthM`) and the solver moves it; where the prose invented a river,
   a gorge or a compass bearing, the prose is rewritten against the record
   (standard 12, 0065). A dive or a hull needs its depth at the dot; a
   village with an underwater entrance keeps a dry dot and 16h places the
   entrance on the bank. City pins never move: a city whose prose and ground
   disagree is an owner call with its numbers (Blackrose's lake, the pirate
   freeholds' river, the stronghold). 239 rows, every one with the
   measurement in `why`; `plot_remedies --check` fails a row that was never
   applied or no longer holds.
9. **A harbour is a station a traveller boards.** Each of the nine cities
   names one in `harbour-stations.json`: a record at its quay or, for Gideon,
   the bond ferry's town landing (a derived station, `stationId`) because
   the rootworm terminus is a root node and nothing in Gideon's ring holds
   keel water. A road-crossing ferry's two landings join the network by
   the road they cross, so connectedness is a rule about the graph, not
   about depth (owner 2026-09-18).
10. **The rootworm network is five records**, not four placeholders:
   Helstrom's station (the hub), Gideon's terminus (a seasonal stop, never a
   standing station), the east-estuary station (the placeholder node
   1,333 m away was the same facility), Dead Water village (the naga-deeps
   terminus, with `rootworm` added to its station modes) and Stormhold. The
   remaining hero Hist stay unserved: the Underground Express is a line.
11. **The Onkobra does not extend downstream.** Its headwater's chain is the
   attested Panther and Stormhold Rivers; the four records whose id carries
   the name are pinned to the headwater and the rest are rewritten onto
   their own water.
12. **The known-red register may be empty.** Its gate asserted the register
   was non-empty for ever; it now checks rows against the live plan and
   that no request outside the register is red, so the register can die
   with its last row as deliverable 7 intended.
