# 16e — Routes, grading, spans and ferries on the frozen world

**Goal.** Solve the road and lane networks once on the frozen terrain and
water, grade them as a **patch stack** that cannot cross a channel or move a
water level, author the spans that remain honestly. Check the six active ferry
services decided in `ferry-crossings.json` (the seventh is `deferred` - check whether it should be) - ferry crossings should be placed where required by the road and lane networks. Once confirmed, place them. Roads must read as roads.fn

Ruling 9 (2026-09-11): **minimal** grading as patches; prefer re-routing over grading even at the cost of length, with gradient costs that make roads zigzag up long steep slopes; a graded patch only where it causes no other issue and no circular dependency. Ruling 6: no dredging.

## Starting state (2026-09-15, written by the closing 16d agent)

- **The record reader exists** (16d, decision 0067):
  `water_report.ShippedWater.water_at(east_m, south_m)` returns the graph
  record (id, kind, levelM, season, band, widthM, depthM and the rest) merged with the
  compiled entity plus `depthM`; `reach(id)` / `body(id)` index
  `hydrology-graph.json`; `ProvinceSurvey.water_at / reach / body`
  delegate to it. `ProvinceSurvey.flood / tidal / salinity / wetlands /
  lakes / river_band` are **deleted**; `sample()["hydrology"]` carries a
  `record` block instead of `riverBand/onLake/wetland/tidal/floodBand/salinity`.
  `compile_minor_routes` and `compile_minor_waterways` therefore raise
  `AttributeError` until you port them (`test_minor_waterways.py::test_recompile_is_deterministic_and_shares_one_step_graph_per_run`
  is gated `@requires_delivered("16e")`; un-gate it as you port). Note
  `water_at`'s merged dict keeps the graph's channel design depth as
  `designDepthM` and reports the measured wet-season depth as `depthM`;
  `reach(id)` returns the raw graph record, where `depthM` is the design
  depth. The chain
  ladder is declared once in `worldgen/ladder.py`; fill the `[16e]` row.
- **The apron** (16d) draws the land beyond the border and the sea over it;
  nothing of yours touches it, but `build_border_apron` re-runs after your
  grading moves `DEFAULT_HEIGHTS` (a minute; expected).
- **The route stack is built, not blank.** All nine modules the Read list
  names exist with tests beside them (eleven route test modules). They
  already sit in the chain in the intended order:
  `reroute_lanes → reroute_majors → compile_minor_routes → grade_routes →
  author_route_structures → grade_routes (pass 2) → compile_route_structures`.
  **Both grade passes stay** (the author/compiler shared-surface guarantee,
  script lines ~134–137); both emit patches. This chunk *confirms* the
  `[16e]` ladder row; it does not invent the order.
- **Every route probe is SKIPPED today, not passing** (16b ledger §8):
  `test_sculpt::test_road_grades_stay_traversable`, seven `test_grade_routes`
  province probes and five `test_route_structure_authoring` probes skip via
  `worldgen/ladder.py`. Turning them green and removing the skips is part
  of acceptance.
- **The published route JSON is stale by construction** (`ladder.json`
  `skipped` lists every route stage; `route-structures` is a hidden layer):
  `routes.json`, `routes-minor.json`, `route-structures.json` describe the
  pre-16b ground. `rebake_landcover` already ran in 16b with no routes, so
  road paint is absent, not wrong.
- **The span pip is measured and the obvious fix is disproved**:
  `docs/phases/P-polish/backlog.md` rows ~290–334 and ~469–475 (1 m pips make
  bridges; raising `MAX_FILL_M` 6→8 is measurably wrong; 211 spanning
  structures, median 70 m). Read them before touching the grader.
- **Ferries are recorded and validated, not placed**: `ferry-crossings.json`
  holds seven services (six `active`, one `deferred`), each with `craft`,
  `operatorModel` and `policy`; `ferry_crossings.py` checks ids, catalogue
  keys, quest predicates and kit refs against `watercraft-v1`. The missing
  thing is placement in the world.
- **Travel services and rootways are blank slate**: no
  `travel-services.json` exists; the rootworm network is only a preview
  painter (`compile_society.py` ~308–318, hard-coded points) with no record
  behind it. `derive_services.py` is per-place service promises, a
  different thing.
- `warn_on_drift` exists (`carve_routes.py` ~120, called from
  `shape_province.py`); item 5 extends it.
- Water: `compile_water` appears twice in the chain script and its 16e row
  comment says "the second water compile"; that is 16c's to remove (water
  is compiled once, 0057 §1); this chunk's water stage is `patch_water`.

## Read

- README.md §3, §9 (the route rows absorbed);
  [research/phase16/audit-chain-and-terrain.md](../../research/phase16/audit-chain-and-terrain.md) §2–3.
- decision 0051 (span systems), `research/world-terrain/route-spans-and-crossing-costs.md`,
  `world/sources/sites/water-crossings.md`, `world/sources/routes/ferry-crossings.json`.
- `worldgen/routes.py`, `reroute_majors.py`, `reroute_lanes.py`,
  `compile_minor_routes.py`, `grade_routes.py`, `author_route_structures.py`,
  `compile_route_structures.py`, `routes_raster.py`, `rebake_landcover.py`.

## Deliver

1. **Routes on the frozen world**: `compile_society` / `reroute_majors` read
   the frozen base and the graph (a river is a known crossing, not a cost
   surprise); the router prefers the long way round over a long span (owner
   2026-09-09; cost the span from the graph's width and the bank fall).
   Lanes are re-lined against the graph's navigable depth, never dredged.
2. **Grading as patches**: `grade_routes` emits typed `terrain-patches`
   (bench, fill, cut) with the 16b invariants — no patch inside a channel or
   its shoulder, no level moves — and `patch_water` follows. The frozen array
   is untouched. `grade_settlement_pads` takes the same exclusion windows. Check whether those terrain patch types are sufficient. Would a 'ramp' be sensible, for example, for helping routes go up short steep terraces?
3. **Spans**: the resolution-mismatch pip (`docs/phases/P-polish/backlog.md`
   rows ~290–334: the measurement and the disproved lever) fixed in
   `author_route_structures` with a minimum sustained rise; the `MAX_FILL_M`
   lever unchanged, since the measurement showed it is the wrong lever; a `pitchDeg` on the placement record
   and honoured in the renderer so ~46 crossings become one authored arch;
   the trestle-foot ground fit confirmed; the one crossing with no pier
   sourced or re-authored as a stepped ascent; nav data emitted for decks.
4. **Ferries**: the 6 active crossings placed through the settlement chain
   (a `placeable-NPC` record type or a typed operator socket, `watercraft-v1`
   copied to the site, a hull at each berth of its declared class); the
   navigable check samples along the serving route, not a radial max.
4b. **Travel services and the root-transit network** (Phase 11's
   deliverable, homed here by decision 0061. But check whether this is the right place. 16g will create the macro plot of places and will need to solve the minor waterway network, which itself will define which places connect through fast-travel. So you should plan how much of this section to do now at 16e and what, if anything, should be done instead in 16g; update that brief and this one accordingly): the Morrowind-style
   service graph — ferrymen, boat owners, rootworm Waykeepers; talk, pay,
   arrive; no vessel simulation — as one typed record
   (`world/sources/routes/travel-services.json`: stations, operator socket,
   fares by band, the lane or rootway each hop follows), quests 20 FAST
   nodes satisfied by id. The four-station rootworm network exists only as
   hard-coded preview points in `compile_society.py`: author it here for the
   first time as a record, with Hist-node placement on the graph; delete
   the hard-coded painter when the record lands
   (a rootway is a reach chain like a lane), the `rootways` overlay
   regenerated in the same commit. Root-transit quest rewards stay with the
   packet's co-design loop (Phase 15). **"Someone to talk to" at a ferry
   means, in this chunk, an operator NPC standing at a typed socket and a
   minimal talk-to-service contract in `packages/` (a verb that opens a
   service menu from the record: the buildout register's "talk → service
   menu as a small contract"); the full dialogue system is build-out work.
5. **Paint on the published line**: `routes_raster` and `rebake_landcover`
   read the published line that the character walks; `warn_on_drift` reports the
   geometric deviation.
6. Tests shown failing first: a graded way crossing a channel; a patch
   moving a level; a span under 1 m sustained rise; a ferry with no hull;
   paint more than 5 m off the published line.


### Added by 16a (2026-09-11)

- **Routes are re-solved on the frozen water; the map's `routes`,
  `waterways` and `rootways` overlays are regenerated in the same commit.**
  Until then the 2D map's route layers describe the old water; that is
  stated in the layer's hover text until this chunk replaces them.
- **Waterways are re-derived on the graph** (owner, 2026-09-11): a boat
  lane, major or minor, follows graph reaches and bodies (channel reaches
  whose `depthM` and `widthM` float the hull class, backwater reaches across
  a body, lagoons and the sea) and never a raster class label; a lane that
  needs water the graph does not have is a sourcing gap in the plot, not a
  dredge. The published `waterways*.json` and the `waterways` overlay are
  regenerated in the same commit. 16e owns major waterways between the already-anchored major places. Minor waterways will come later at 16g. Check that the 16g brief covers this sufficiently.
- Crossings read the graph: a ford is on a reach whose `depthM` allows it, a
  bridge or ferry per decision 0051; no route may cross a
  `horizontal-backwater` reach except by ferry or span.
## Record reads (decision 0066) — deliverable 0: the code you inherit is wrong here, and fixing it is your job

Three of this chunk's modules are rows in `worldgen/record-reads-allowlist.json`
(`compile_minor_routes`, `compile_minor_waterways`, `water_crossings`;
`routes`, `reroute_lanes`, `grade_routes` and the span author read only
compiled water or none and have no row): they decide fords, bridges, lane depth and channel windows
from the coarse Phase 3 flood band and sampled rasters. That is a bug —
16c round 1's mistake in route vocabulary — not a convention to keep. Port
each to the record reader (16d's `ProvinceSurvey.water_at` / `reach` /
`body`), delete its raster reads and its allowlist row; `test_record_reads`
fails if any come back. Concretely: a crossing carries the graph `reach` id
it crosses and takes its kind (ford / bridge / ferry / forbidden on
`horizontal-backwater`) from that reach's `kind`, `depthM`, `widthM`; a
lane's floating depth is the reach or body record per hull class; the
grading exclusion window is the reach polygon (centreline ± `widthM`/2 +
shoulder). A test joins every crossing and lane hop back to its reach id
and fails on a missing id or a disagreeing kind, shown failing on today's
records first.

## Acceptance

- **The chain ladder** (plan §3): this chunk's stages are `reroute_lanes`, `reroute_majors`, `compile_minor_routes`, `grade_routes` (as patches), `author_route_structures`, `compile_route_structures`, `patch_water` over the grading patches (never a second `compile_water`: water is compiled once, 0057 §1), `ferry` placement. (`terrain_request_postconditions` is 16c's stage, per `ladder.py`.) Add them
  to the ladder in `tooling/world-generation/scripts/terrain-chain.sh` and bump `DELIVERED_THROUGH`
  to this chunk in the delivering commit; until then a plain chain run skips
  them and their published JSON is stale.

- One route solve; grading fully expressed as patches; `route-structures.md`
  reconciled; all eight cities joined; span distribution reported before and
  after.

## Owner check

**What you will see at this check** (plan §3, build only what is delivered): the ground, the water, plus the roads, tracks, bridges and ferries. No plants or buildings.


- Walk `route.road.helstrom-blackrose` from Helstrom for ten minutes: does it
  read as a road (bench, surface, no 30° scramble)?
- The Nine-Trunks viaduct `?view=character&x=4.517&z=3.608&t=12:00` and the
  Xul-Vaat walkway `x=1.203&z=5.730`: still standing, deck at road height?
- One ford (from `water-crossings.md`) and one ferry (the Drowning Gate):
  can you wade the ford; is there a boat and someone to talk to at the ferry?
- The 2D map's travel-service layer: do the ferry hops and the rootworm
  stations join places a traveller would actually want joined?
- A track junction that used to step (the-white-pans, glenbridge): smooth?

## Gotchas

- Grading is the one terrain edit with no bbox discipline today (chain
  audit risk 5) — the invariants are the point of this chunk.
- The road-suppresses-water mechanisms are deleted; do not reintroduce them.
