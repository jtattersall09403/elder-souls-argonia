# 16a — The hydrology graph, the gate policy and the docs hygiene

**Goal.** Derive the province's water **once** as a typed record with stable
ids — rivers end to end, reaches of kind horizontal / sloped / vertical,
junctions, bodies with a kind, an altitude band and a stored season — and put
it on the studio's 2D map for the owner to review **before any terrain moves**.
Alongside: the gate policy every later chunk obeys, the visual-ingestion
proposal (plan §8) confirmed with the owner and the docs split that stops
every settlement agent reading 2,700 lines of round log.

No terrain, water raster, route or place changes in this chunk. It needs no
owner ruling to start; it produces the evidence for rulings 1–6.

## Read

- [README.md](README.md) §2–3, §7 (this plan) and decision 0057.
- [research/phase16/audit-hydrology-data-model.md](../../research/phase16/audit-hydrology-data-model.md)
  in full — §7 is the proposed contract, §8 the re-rulings.
- [research/world-terrain/tropical-fluvial-geomorphology.md](../../research/world-terrain/tropical-fluvial-geomorphology.md)
  §1.2, §3, §5, §6 — the taxonomy rulebook, written and never implemented.
- `worldgen/hydrology.py`, `channels.py` (`build_reaches`, the fall and strip
  thresholds), `standing_water.py`, `hydrology_intent.py`; `world/50` §33–36.

## Deliver

1. **`worldgen/hydrology_graph.py`** (+ `derive` CLI) producing
   `world/sources/hydrology/hydrology-graph.json`, schema v1 per the audit
   §7, derived from `hydrology-pass1.npz` + the base heightfield (see gotcha
   on which heightfield). Ids keyed to geography (mouth cell, deepest cell),
   never emit order. Rivers ordered headwater → mouth; tributaries linked at
   junctions; reach kinds from the geomorphology rulebook by slope and
   accumulation; falls = the existing cliff rule (≥ 3 m at ≥ 70° face);
   plunge pools as `plunge-pool` bodies sized from the drop (the
   `channels.py:1145` law) and linked by `causedBy`; lakes split
   `tarn-upland` / `lake-lowland` by altitude band with `outflow` links;
   marsh bodies typed from the wetland taxonomy; `season` stored per reach
   and body from the rim-minus-level rule that today runs at runtime.
2. **The wet-season line.** The Phase 3 wetlands + rivers + lakes overlay is
   declared the wet-season high-water extent (owner, B1). Measure where the
   1345 grid is too coarse for streams (the `lostStations` sites, gorges of
   1–2 samples) and derive those reaches on the full-res terrain; report the
   count and the sites.
3. **Terrain preconditions per feature** — for every reach and body, the
   ground the carve must produce (trench depth and width, bowl depth, lip
   notch, tarn bowl, weir) as a machine-readable `terrainPrecondition` so
   16b builds to it and the freeze gate checks it.
4. **The 46 erosion pits and the thin classes**, each listed by site with a
   proposed disposition (fill / keep as tarn with outflow / keep as sink),
   for ruling 2; the tidal-delta and deep-river-corridor question answered
   from the graph (how much delta the drainage actually implies).
5. **Studio layers** in the 2D map: rivers coloured by kind, junctions,
   bodies by kind, season (perennial vs seasonal), falls and pools, the
   wet-season line — reading the committed JSON, no runtime change beyond
   the layer. `?layer=hydrograph` URLs in the owner check.
6. **`worldgen/test_hydrology_graph.py`**: every river reaches the sea, a
   lake or a declared sink; every reach's downstream level ≤ upstream; every
   fall has a plunge body; ids stable across two derivations; no reach is
   both `sloped` and flat; every body has a season. Each test shown failing
   on a deliberately corrupted graph before commit (memory: gates that
   cannot fail keep appearing).
7. **Gate policy** (one page, `docs/engineering-standards.md` standard 14):
   a gate reads shipped data, not fixtures; a gate is shown failing on a
   real or injected defect in the commit that adds it; probes report and
   assert separately; the six-image ingestion budget of plan §8. Confirm the
   §8 proposal with the owner in the check below.
8. **Docs hygiene**: split decision 0041 (live rule sections stay; the round
   log 1052–2416 → `docs/research/archive/phase11-rounds/0041-round-log.md`
   with a provenance README); close `phase11-gap-plan.md` to a one-screen
   summary that points here; refresh the water handoff's state table to a
   "closed 2026-09-09, superseded by Phase 16" header; make `lint_prose
   --md` run over `docs/**` in `npm test` and clear the hits it finds in the
   files this chunk touches (the playbook's 31 and PROGRESS's are the known
   ones). Update `world/50` §33–36 and `world/60` §38's `WaterBody` to the
   graph's vocabulary.

## Acceptance

- `hydrology-graph.json` committed, schema-versioned, `python3 -m
  worldgen.hydrology_graph --check` green, tests above green and each proven
  failable.
- Owner has reviewed the map layers and given rulings 1–6 (plan §7).
- `npm test`, `npm run typecheck` green; the docs lint gate is in `npm test`.

## Owner check (plain English, one per bullet)

- Open the studio 2D map with `?layer=hydrograph`: do the rivers run
  source to sea as single named lines, with side streams joining them?
- Toggle the season layer: does what stays wet in the dry season match your
  sense of the map (main rivers, the big lakes, the coast; not every puddle)?
- Look at the falls and pools layer: are the waterfall sites where you would
  expect them and are any big rivers missing a fall you want? (Today 16
  falls exist, none on a major river — say if you want knickpoints cut on
  major rivers in 16b; that is ruling 1's re-sculpt.)
- The pit list (deliverable 4): mark any you want kept as mountain lakes.
- The §8 ingestion budget and kit loop: approve or amend.

## Gotchas

- Derive on the base the owner chooses in ruling 1; until then derive on
  the August array *and* today's sculpt and report the diff in rivers and
  bodies — that diff is the evidence ruling 1 needs.
- Do not touch `channels.py`'s carve or `compile_water`; 16b and 16c
  re-point them at the graph. This chunk only produces and reviews the graph.
- Names for rivers are lore work (dossiers first, UESP second); ship ids
  now, names as text-catalogue keys later, never literals.
