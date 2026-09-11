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
7. **Gate policy** (one page, `docs/standards/engineering.md` standard 14):
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

## Status — delivered 2026-09-11, owner check pending

Every item under Deliver is done. The evidence is
[research/phase16/16a-hydrology-graph-ledger.md](../../research/phase16/16a-hydrology-graph-ledger.md),
choices in decision 0058. Two findings change the questions for the owner:
the vault's "today" sculpt IS the August array (ruling 1 therefore means a
re-freeze on today's code's different output; the graph is derived on that).
The base terrain has **no** river-trapped pits — the pits are made by the
refine stages, so ruling 2 becomes "16b must not create them" plus any tarn
the owner wants declared. The 2D map's hillshade is still the August terrain
until 16b; the graph lines drawn over it are from today's code's base.

## Owner feedback of 2026-09-11 — every item and where it went

The owner asked for a mechanism that guarantees nothing from a feedback
list is dropped: this table is it; the same pattern applies to every
later chunk (one row per item, a status, a pointer).

| Item | Status | Where |
|---|---|---|
| Old map overlays retired or regenerated automatically, not from memory | scheduled | 16b (hydro + hydrograph PNGs regenerated at the freeze), 16c (flood layers from graph levels; river layers collapse), 16e (route layers) |
| Rulings 1 and 2: anything for the owner? | handled, nothing to decide | 0058 choices 1 and 7; 16b inherits the base and the `forcedBasins == 0` gate; no pit kept as a lake unless the owner names one |
| Do not create waterfalls artificially; few falls | done | proposals removed; 4 real falls + 1 flagged terrace step (16b smooths it) |
| Pit list: spell out what is needed | nothing needed | default: none kept; the list stays in the ledger §6 for reference only |
| Roads redrawn on the new water | scheduled | 16e (routes re-solved, overlays regenerated in the same commit) |
| Plain-English hover text for categories | done | legend chips and layer boxes show `about` text from `hydrograph-meta.json` |
| Flow-direction arrowheads | done | white arrowheads every 160 m on `hydrograph-rivers` |
| The "waterfall" at 4.29 E 1.80 S | explained + scheduled | a −0.05 m to 13.5 m step in the source data beside a lagoon; flagged `coastal-terrace-step`; 16b smooths such banks |
| Blackrose lake missing from bodies | done | declared in `authored-bodies.json`; drawn as an outlined ellipse; 16b digs it and carves its three feeders |
| Rivers dry in the middle in the season layer | done | seasons flow downstream; seasonal only above a river's first perennial point |
| Direction check on the map | owner | re-check with the arrows |
| Rivers flowing through bodies: one elegant rule | scheduled | 16c: a river through a body is the body (no ribbon inside the extent, flow continues on the body surface) |
| Names for rivers, lakes, landforms | scheduled | 16g deliverable "naming the water and the land" |
| Structured, readable tooltips | done | grouped label/value sections |
| Keep water-type transitions few and semantic | done | one flat kind + size band; `surface` per reach; 30 m seam rule; `surfaceTransitions` in stats and a gate on avoidable short runs |
| A way to make sure every list item is addressed | done | this table; the pattern is now part of every chunk's report |
| Blackrose ellipse looks artificial; island missing | left to 16b, shown honestly | dashed outline + island ring = "declared, not dug"; 16b shapes the organic shore and raises the island (precondition `authored-bowl`) |
| No mudflats or lagoons on the map | lagoons drawn; mudflats explained | the 9 lagoons (sea-level water winding inland) now draw in their colour; mudflats are a tidal shore state 16c exposes, not bodies, so 0 is by design |
| Triangle arrowheads ambiguous | done | open chevrons pointing downstream |
| The rogue "waterfall" at 4.29 E 1.80 S | explained | it sits where the river meets the head of the 123 ha lagoon (now visible); the base has a 7.8 m step there; too abrupt for a rapid by the rule, but a source-terrain terrace, flagged for 16b to smooth into a rapid |
| Waterways (major and minor) should follow the graph's rivers and sea | scheduled | 16e: lanes re-derived on graph reaches and bodies, overlay regenerated in the same commit |
| Lagoons unnamed in the hover | done | lagoons carry a hover box; painted sea names itself as the ocean body |
| Wet-season line full of tiny specks | fixed at the root | the raw coarse lake mask (3,781 pieces, most one cell) is no longer part of the line; wetland pieces under 10 cells dropped; hover says when a pixel is inside the extent |

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
