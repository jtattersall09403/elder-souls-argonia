# 0066 — Downstream stages read the signed-off record; they never re-solve it (owner review of 16d–16j, 2026-09-14)

**Context.** 16c round 1 re-derived the water classification (the sea by
connectivity, class by salinity, floodplain sheets by distance) although the
owner had reviewed and signed the hydrology graph in 16a/16b ([0065](0065-the-compile-realises-the-graphs-classification.md)
§2 lists the six re-derivations). The owner asked whether this is one
instance of a wider class. It is. A survey of every stage below the freeze
gate on 2026-09-14 found **zero reads of `hydrology-graph.json`** below the
gate; the stages that still read the pre-graph Phase 3 water masks or
re-derive water are listed in the appendix. Every one of those would have
repeated 16c's mistake in its own vocabulary.

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
  fit carries the id of its source record. A test joins the output back to
  that record and fails on any disagreement. A field carrying no id at all
  fails it too. Shown failing first on the current raster-derived code.
- **The chain runs from the freeze gate.** A plain `terrain-chain.sh` run
  starts at `apply_terrain_patches` and verifies the frozen arrays and the
  graph against `freeze.json` by hash (seconds) instead of re-executing the
  frozen stages; the frozen stages run only under `--refreeze`. The
  fingerprint skip stays for the stages below the gate. (16d deliverable 0.)
- **Designed ground contact is read from the authors** (owner 2026-09-14): a
  building, rock, landmark tree or route piece is sunk to the depth chosen
  by its makers, measured per asset from plugin placements (as the
  flora rules already are, `research/vegetation/vegetation-composition-rules.md`
  C1–C2), or from the mesh's own floor and door sill where no placements
  exist; never by a per-class table. (16h deliverable 3, 16f for rocks and
  landmark trees.)

- **Mechanically enforced.** `worldgen/test_record_reads.py` (in
  `npm run test:placement`) fails any module below the gate that opens a
  water raster or a pre-graph classification itself unless it is a row in
  `worldgen/record-reads-allowlist.json` owned by the chunk that ports it.
  A row whose module is clean fails too; thirteen rows on 2026-09-14,
  shown failing on a planted read. The record reader is
  `site_fields.ProvinceSurvey` once 16d gives it graph-keyed accessors and
  deletes its Phase 3 `flood` / `tidal` / `salinity` fields.

**Applied to.** Plan §3 (a new binding bullet), briefs 16d–16j (a
"Record reads" block each, stating that the inherited code is wrong and
naming the modules to port as deliverable 0).

## Appendix — the survey, per stage (2026-09-14)

| Stage | What it reads | Verdict |
| --- | --- | --- |
| `compile_society.py` | Phase-3 ocean/lakes/rivers/wetlands/flood/tidal (:161-205); no compiled water | Runs ABOVE the graph by design: fine |
| `reroute_lanes.py` (:89,130-144), `reroute_majors.py` (:252, via `ProvinceSurvey`'s compiled stack), `grade_routes.py` (:434-466), `author_route_structures.py` (:98-110), `settlement_ground_control.py` (:314-323), `terrain_request_postconditions.py` (:566), `hostility_frequency.py` (:134-141), `scatter.py` / `composition.py` (`ScatterFields.depth_m`), `compile_route_structures`, `grade_settlement_pads`, `compile_chunks`, `export_web_chunks`, `rederive_blueprints`, `export_settlement_bundle`, `build_palettes` | Compiled water only, or no water reads | Fine |
| `compile_minor_routes.py` | Phase-3 flood and rivers→`river_band` (:177,179) mixed with measured `wet_grid`/`open_water` (:175,181) | Reads pre-graph water masks → 16e |
| `rebake_landcover.py` | Phase-3 rivers, twi, wetlands (:88-93); compiled level `w2` only (:82-96) | Reads pre-graph water masks → 16f |
| `landcover.py` | Own wet mask `rel < 0.05` (:184), own lake test by component area (:282-286), river bands from the Phase-3 rivers raster (:262-272), salt/fresh from Phase-3 salinity (:250-251,:288), mangrove coast from Phase-3 wetlands (:299), bed material from `rivers == 0` distance (:326-332) | Re-derives water → 16f |
| `compile_scatter.py` | Sea taken as `hydro-regions.png` class 0 (:99-115) for `coast_m`; compiled surface read correctly (:76-84) | Re-derives the sea → 16f |
| `compile_settlement.py` | `floodBand` from Phase-3 flood (:596-597; contract at :757) beside compiled `openWater`/`wet_season` | Reads pre-graph water masks → 16g/16h |
| `site_fields.py` | Carrier: hydro-flood/rivers/lakes/wetlands/tidal/salinity PNGs (:147-162, written by `compile_hydrology.py`:107-134 from the Phase-3 pass); its compiled side (:186-215) is clean; `water_intent` (:364-373) unions region classes 0/12, fenced to identity-only uses | Reads pre-graph water masks → 16g |
| `site_dossier.py` | Inherits `river_band`/flood/wetlands/tidal/lakes from the survey (:148-187) | → 16g |
| `water_crossings.py` (not a chain stage; `ferry_crossings.py`:98 and `author_route_structures.py`:99 bind to it) | Re-runs the water compile in memory from `hydrology-pass1.npz` (:96-104) and labels crossings lake/river by its own body mask (:157) | Re-derives water → 16e |
| `reclassify_regions.py` / `report_regions.py` | Every Phase-3 key | Fine for their job, but the region raster they produce is what `compile_scatter` and `site_fields` then treat as sea/lake truth |

Mechanical gap: `water_report.ShippedWater` loaded meta, surface, shore,
owner, class and flow but never `water-id.png`, so no stage could key to a
graph entity; fixed 2026-09-14 (ids + entities on `ShippedWater`).
