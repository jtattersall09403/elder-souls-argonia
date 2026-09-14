# 0066 — Downstream stages read the signed-off record; they never re-solve it (owner review of 16d–16j, 2026-09-14)

**Context.** 16c round 1 re-derived the water classification (the sea by
connectivity, class by salinity, floodplain sheets by distance) although the
owner had reviewed and signed the hydrology graph in 16a/16b ([0065](0065-the-compile-realises-the-graphs-classification.md)
§2 lists the six re-derivations). The owner asked whether this is one
instance of a wider class. It is. A survey of every stage below the freeze
gate on 2026-09-14 found **zero reads of `hydrology-graph.json`** in
`macro_plot`, `remeasure_plot_facts`, `audit_place_semantics`,
`compile_settlement`, `blueprint`, `grade_settlement_pads`, `routes`,
`reroute_lanes`, `reroute_majors`, `author_route_structures`, `grade_routes`,
`rebake_landcover`, `compile_scatter` and `settlement_ground_control`, while
the same modules carry 60+ reads of sea, flood, salinity and region rasters
and their own connectivity or elevation rules. Every one of those stages would
have repeated 16c's mistake in its own vocabulary.

**The class.** *A downstream stage recomputing something a reviewed record
already states.* Its forms, all seen in this repo:

1. classification from geometry (sea by connectivity, shore by elevation ≤ 0,
   "over water" by a flood raster) where the record names the kind;
2. levels or extents by re-flooding where the record gives the level and the
   extent raster;
3. reading a lossy projection (a raster class label, a land-cover PNG, a
   bounding box, a filename) where the typed record exists;
4. tuning by class where the source authors' own placements can be measured
   per asset (bury depth by `groundFit` class instead of the mesh's designed
   ground contact; see 16h);
5. re-running a frozen upstream stage on a routine build and treating its new
   output as the input (16c's `compile_hydrology` drift, 16c ledger §7);
6. gates that assert the derived value instead of joining back to the record,
   so the re-derivation passes.

**Decision.**

- **Kinds, ids, levels, seasons and names come from the record; geometry
  comes from the compiled realisation of that record.** The records are: the
  hydrology graph (0058) and its body extents raster; the frozen arrays
  (0059); the compiled water rasters and `water-meta.json` keyed by graph id
  (0063/0065); the published route lines (16e); the plot and blueprints
  (16g/16i); kit metadata mined from plugin data (0041, 16h/16i). A stage
  may sample a compiled raster for a *measurement* (depth here, slope there)
  and must take every *class* from the record by id.
- **Provenance gate, per chunk.** Every output field that names a water kind,
  a water level, a crossing, an over-water share, a shore class or a ground
  fit carries the id of the record it was read from, and a test joins the
  output back to the record and fails on any disagreement or any field
  without an id. Shown failing first on the current raster-derived code.
- **The chain runs from the freeze gate.** A plain `terrain-chain.sh` run
  starts at `apply_terrain_patches` and verifies the frozen arrays and the
  graph against `freeze.json` by hash (seconds) instead of re-executing the
  frozen stages; the frozen stages run only under `--refreeze`. The
  fingerprint skip stays for the stages below the gate. (16d deliverable 0.)
- **Designed ground contact is read from the authors** (owner 2026-09-14): a
  building, rock, landmark tree or route piece is sunk by the depth its
  makers placed it at, measured per asset from plugin placements (as the
  flora rules already are, `research/vegetation/vegetation-composition-rules.md`
  C1–C2), or from the mesh's own floor and door sill where no placements
  exist; never by a per-class table. (16h deliverable 3, 16f for rocks and
  landmark trees.)

**Applied to.** Plan §3 (a new binding bullet), briefs 16d–16j (a
"Record reads" block each, with the modules and the count of graph reads
they start from).
