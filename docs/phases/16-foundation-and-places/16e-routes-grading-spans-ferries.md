# 16e — Routes, grading, spans and ferries on the frozen world

**Goal.** Solve the major road and lane networks once, below the freeze, on
the frozen terrain and water; grade only the short stretches that the best
line still cannot avoid, as a **patch stack** that can never cross a channel
or move a water level; decide every water crossing from the hydrology graph
(ford, span or ferry) and author the few spans that remain honestly; record
the province's travel services (ferrymen, boat owners, rootworm Waykeepers)
as one typed graph with a working talk-pay-arrive contract; paint the roads
on the line the character walks. Roads must read as roads.

**The sequence is one way (owner, 2026-09-15).** Frozen ground and water →
the major roads solved between the placed anchors by a router whose costs
make it avoid steep ground, river beds and marsh and zigzag up long slopes by
itself → the short choke points the best line still had to take (a terrace
lip, a bench, a fill) found along those lines and patched locally → the road
surface painted on the lines. Nothing in this chunk rebuilds or changes
anything above it (16a–16d): no refreeze, no re-carve, no water re-solve.
Minor routes come later, after the macro plot (16g); they get **no grading**.

**What this chunk realises physically and what it leaves to 16h (owner
steer, 2026-09-15).** 16e owns every *record* and every *compiled placement*
of the route layer: the lines, the grading patches, the crossing decisions,
the span records and their placed pieces, the ferry landings, berths and
operator sockets, the service graph. It does **not** own drawing those pieces
correctly in 3D. The settlement runtime that draws every placed piece is
fixed in 16h (yaw sign, real colliders, per-asset designed ground contact,
mount rule); a bridge or a ferry hull drawn by today's runtime lands 93° off
and sunk to the highest ground sample. So the `route-structures` studio layer
stays hidden until 16h's stage delivers, ferry hulls and landings are placed
through 16h's renderable kinds (with a `water` anchor class for a hull);
each exemplar's and packet's ferries are built with the place (16i, 16j). At
this chunk's check the owner walks graded roads and fords, uses a ferry
through its landing socket; spans, graded sections and services are judged
on the 2D map, where each carries its own hover text.

Ruling 9 (2026-09-11): **minimal** grading as patches; prefer re-routing over
grading even at the cost of length, with gradient costs that make roads zigzag
up long steep slopes; a graded patch only where it causes no other issue and
no circular dependency. Ruling 6: no dredging.

## Owner asks on the roads (2026-09-15) — acceptance checks, not suggestions

- `route.road.stormhold-thorn` runs along the bed of a river for much of its
  length. A river bed (any reach polygon) is a wall to the router except at
  a recorded crossing.
- `route.road.archon-gideon` spends more time in marsh than the ground requires; it
  should take the higher ground to the south. Marsh bodies cost enough that
  a dry detour wins.
- The crossroads of the Gideon–Archon and Helstrom–Blackrose roads sits on
  dry, slightly higher ground at about **3.20 E, 3.59 S** (studio
  `x=3.20&z=3.59`). A typed junction record fixes it there and both roads
  pass through it.
- The cost model is improved, not patched per road: the three asks are the
  worked examples for costs that hold province-wide; the ledger shows
  the before/after line of every major road.

## Starting state (2026-09-15, written by the closing 16d agent; corrected by the 16e review the same day)

- **The record reader exists** (16d, decision 0067):
  `water_report.ShippedWater.water_at(east_m, south_m)` returns the graph
  record (id, kind, levelM, season, band, widthM, depthM and the rest) merged
  with the compiled entity; `reach(id)` / `body(id)` index
  `hydrology-graph.json`; `ProvinceSurvey.water_at / reach / body` delegate
  to it. `ProvinceSurvey.flood / tidal / salinity / wetlands / lakes /
  river_band` are **deleted**; `sample()["hydrology"]` carries a `record`
  block. `compile_minor_routes` and `compile_minor_waterways` therefore raise
  `AttributeError` until ported
  (`test_minor_waterways.py::test_recompile_is_deterministic_and_shares_one_step_graph_per_run`
  is gated `@requires_delivered("16e")`; un-gate it as you port). `water_at`'s
  merged dict keeps the graph's channel design depth as `designDepthM` and
  reports the measured wet-season depth as `depthM`; `reach(id)` returns the
  raw graph record, where `depthM` is the design depth. The graph: 615
  reaches (313 `horizontal-backwater`, 137 `horizontal-channel`, 91
  `sloped-rapid`, 39 `sloped-riffle`, 18 `vertical-fall`, 14 `sloped-chute`,
  3 `horizontal-tidal`), 2,280 bodies, 101 rivers; every reach carries
  `centreline`, `widthM`, `depthM`, `season`, `band`, `levelFromM/ToM`.
- **The major roads were solved ABOVE the freeze gate; that solve is
  now history.** `compile_society` (roads and anchor-to-anchor lanes on the
  Phase 3 pass) is one of the six frozen rungs; its roads fed the danger and
  culture fields and the sculpt's uplift suppression along
  `carve-inputs/sculpt-corridors.json`. None of that is touched: the frozen
  ground keeps the gentler sculpted corridors, which is harmless; the
  danger and culture fields stay as frozen (16g re-validates places
  against them). The roads themselves are re-solved **below the gate** by
  this chunk on the frozen ground (owner 2026-09-15), replacing the
  `reroute_majors` repair-in-place approach (317 lines: gradient-walled
  Dijkstra inside a widening box, honouring `authored-routes.json`, which
  ships empty and already accepts a seed or a waypoint list). Its cost and
  box machinery is the seed of the new solver. The route registry
  (`world/sources/routes/registry.json`) holds the edge list: 11 roads and
  trunks (`alten-corimont-stormhold`, `archon-gideon`, `blackrose-lilmoth`,
  `gideon-blackwood-road`, `gideon-soulrest`, `gideon-stormhold`,
  `helstrom-blackrose`, `soulrest-blackrose`, `stormhold-thorn`,
  `thorn-tear-road`, the coast road) and 14 lanes and channels. 16b left
  `test_sculpt.py::test_road_grades_stay_traversable` red on the old network
  (one segment at 1.11 rise/run); it skips today under `@requires_stage`.
- **Old road paint survives in places.** `rebake_landcover` ran in 16b with
  no routes, yet the owner stands on road texture at 0.08 km E, 2.97 km S
  (2026-09-15), on the old Blackwood Road line. The paint is
  `landcover.BC_ROAD / TRACK / PATH` (codes 30 / 29 / 27) encoded into
  `province/refined/ground-control.png` by `compile_ground_control`; how
  the texel at that spot (`[10, 15, 52, 199]`) decodes to road is the first
  thing to find, then which bake left it there. Every remaining road
  texel is repainted as whatever the land-cover rule puts there without a
  road, before the new lines are painted.
- **The route stack is built, not blank.** Nine modules with eleven test
  files sit in the chain in the order `reroute_lanes → reroute_majors →
  compile_minor_routes → grade_routes → author_route_structures → grade_routes
  (pass 2) → compile_route_structures`. `compile_minor_waterways` (927 lines)
  is **not a chain stage today**; `water_crossings` (304 lines) is a tool the
  span author and the ferry validator import, not a stage. `reroute_lanes`
  appears **twice** in `STAGES` (after `compile_water` and again after
  `export_web_chunks`). One entry is enough: water is compiled once and no
  stage between the two entries moves it, so the second entry re-lines lanes
  on water that has not changed and goes. (The earlier note that
  `compile_water` appeared twice was 16c's; 16c removed it.)
- **The grader writes the heightfield, not patches.** `grade_routes` (1,082
  lines) snapshots `refined-height-ungraded-f32.npy` and rewrites
  `refined-height-f32.npy` in place; `MAX_FILL_M = 6`, `MAX_SHOULDER_M = 70`,
  per-class `GRADIENT_CAP_DEG`, `WATER_CLEARANCE_M = 0.15`, a wet-sample
  exclusion read from the compiled water rasters. It has never worked well
  and the owner has released it for a full rewrite (2026-09-15); its
  profile maths and class caps are the parts worth keeping. The typed patch machinery is
  16b's: `terrain-patches.json` holds 166 patches of four kinds (`levee` 105,
  `terrain-request` 54, `bed-cut` 5, `poling-channel` 2),
  `test_terrain_patches.py` proves the six invariants (bounds, amplitude,
  channels, water, overlap order, structures crossed undeclared),
  `patch_water` re-floods only a patch's window.
- **Every route probe is SKIPPED today, not passing** (16b ledger §8): the
  `test_sculpt` road probe, seven `test_grade_routes` province probes and five
  `test_route_structure_authoring` probes skip via `worldgen/ladder.py`.
  Turning them green and removing the skips is part of acceptance.
- **The published route JSON is stale by construction** (`ladder.json`
  `skipped` lists every route stage; `route-structures` is a hidden layer):
  `routes.json`, `routes-minor.json`, `waterways*.json`,
  `route-structures.json` (272 structures: 67 lip-steps, 55 bridges, 54
  stepped ascents, 54 stairs, 42 decks; 211 of them spanning, median 70 m)
  and `water-crossings.json` (115 crossings, measured by an in-memory re-run
  of the OLD water compile) describe the pre-16b ground and water.
- **The 2D map's `routes`, `waterways` and `rootways` overlays are painted by
  `compile_society`**, above the gate (`soc-routes.png`, `soc-waterways.png`,
  `soc-rootways.png`), so they can never show the re-solved lines. The
  studio's `RoutesLayer.tsx` also draws the published JSON lines as SVG with
  click details and already shows route structures with a `<title>` hover
  (`structureLabel`); it reads `routes-index.json` from `export_routes`.
- **The span pip is measured and the obvious fix is disproved**:
  `docs/phases/P-polish/backlog.md` rows ~290–334 and ~469–475 (1 m pips on a
  5.48 m grid make bridges; raising `MAX_FILL_M` 6→8 is measurably wrong; 69 %
  of spans are longer than vanilla's longest whole bridge because the router
  never knew a span was expensive). Read them before touching the grader or
  the author.
- **Ferries are recorded and validated, not placed**: `ferry-crossings.json`
  (schema 1) holds seven services (six `active`, one `deferred` because both
  of its stages are `status: deferred` catalogue records), each with
  `craft`, `landings`, `operator`, `fare`, `refusedIf`, `text` and a lore
  `why`; its `policy` block fixes the bands (ford < 20 m, span 20–70 m, ferry
  ≥ 70 m; depth never decides, nothing is deeper than 1.48 m). `ferry_crossings.py`
  checks every reference and binds `measured` to `water-crossings.json`, so it
  goes red the moment crossings are re-derived on the graph: expected.
  `watercraft-v1` (45 pieces, built, deployed to `public/kits`), `docks-v1`
  (49) and `route-spans-v1` (22) exist; the ferry `craft` table names pieces in
  them by measured size.
- **Travel services have no record; the rootworm network has a placeholder
  one.** No `travel-services.json` exists. `world/sources/anchors/root-transit.json`
  holds four stations and three edges (`confidence: AGENT_AUTHORED`, "pass-1
  placeholder"), read only by `compile_society`'s schematic painter
  (`compile_society.py` ~294–318). 102 catalogue records carry
  `travelStation.modes` (boat 74, porter 22, guide 17, ferry 17, cart 14,
  pilot 7, lighter 7, rootworm 6). The registry's lanes include
  `route.boat.alten-corimont-helstrom`, the one quests 25 names as a `FAST`
  node. `packages/text-catalogue` already holds the `text.ferry.*` strings.
  Hull classes are `dock_spec.HULL_CLASS_DEPTH_M` (canoe 0.6, small-draft
  1.2, keeled 3.0).
- `warn_on_drift` exists (`carve_routes.py` ~120, called from
  `shape_province.py`); it reported drift between the carved corridor and
  the published line; with the roads re-solved below the gate that
  drift is expected and meaningless, so retire it. The apron (16d) re-runs after
  grading moves `DEFAULT_HEIGHTS` (a minute; a below-gate stage, expected).
  The chain ladder is declared once in `worldgen/ladder.py`; the `[16e]` row
  in `terrain-chain.sh` is empty.

## Read

- README.md §3, §9 (the route rows absorbed);
  [research/phase16/audit-chain-and-terrain.md](../../research/phase16/audit-chain-and-terrain.md) §2–3;
  decision 0066 appendix (the route rows).
- decision 0051 (span systems), `research/world-terrain/route-spans-and-crossing-costs.md`,
  `world/sources/sites/water-crossings.md`, `world/sources/routes/ferry-crossings.json`
  (its `policy` and `operatorModel` blocks are the authored judgement this
  chunk keeps), `world/sources/anchors/root-transit.json`, `registry.json`.
- `world/10` §4 (travel edges, the Morrowind transport graph), `world/60` §45
  (boat classes; services are world content, one's own craft is Phase 9's),
  `docs/phases/buildout/README.md` (the talk-to-service row), `docs/quests/25`
  §FAST rows, `docs/quests/85` (the closed predicate vocabulary).
- `worldgen/routes.py`, `reroute_majors.py`, `reroute_lanes.py`,
  `compile_minor_routes.py`, `compile_minor_waterways.py`, `grade_routes.py`,
  `author_route_structures.py`, `compile_route_structures.py`,
  `routes_raster.py`, `water_crossings.py`, `ferry_crossings.py`,
  `water_report.py` (the reader), `apply_terrain_patches.py` and
  `test_terrain_patches.py` (the invariants), `dock_spec.py`;
  `apps/world-studio/src/routes/RoutesLayer.tsx`, `routesData.ts`.

## Record reads (decision 0066) — deliverable 0: the code you inherit is wrong here, and fixing it is your job

Three of this chunk's modules are rows in `worldgen/record-reads-allowlist.json`
(`compile_minor_routes`, `compile_minor_waterways`, `water_crossings`); they
decide fords, lane depth, channel windows and "lake or river" from the coarse
Phase 3 flood band, sampled rasters or an in-memory re-run of the old water
compile. That is the 16c round-1 mistake in route vocabulary, not a
convention. Port each to the record reader, delete its raster reads and its
allowlist row; `test_record_reads` fails if any come back. Concretely:

- a **crossing** is where a published line enters a water entity's compiled
  extent (the `water-id.png` raster realises the record, 0065; there is no
  polygon helper and none is needed); it carries the entity id it crosses and
  takes its band from the record and the measurement: `ford` only under 20 m
  wide AND no deeper than the small-draft line (1.2 m), `span` under 70 m,
  `ferry` beyond; a `horizontal-backwater` reach and a standing body are
  priced as ferry water by the router, a `vertical-fall` or chute is never
  crossed;
- a **lane's** floating depth is the reach or body record per hull class
  (`HULL_CLASS_DEPTH_M`), base season, never a raster class;
- the **router's water costs and walls** and the **grading exclusion window**
  (the reach polygon plus its shoulder together with every body's extent)
  are read from the record.

A test joins every crossing, lane hop and grading window back to its graph
id and fails on a missing id or a disagreeing kind, shown failing on today's
records first. Where a module samples a raster it is for a measurement (a
depth, a height), which 0066 allows.

## Deliver

1. **The major roads solved below the gate, on the frozen ground.** A new
   stage `solve_major_routes` replaces `reroute_majors` in the chain (its
   gradient-walled Dijkstra, box search and authored-override contract are
   reused; the module is renamed, not duplicated). It reads the registry's
   road edges, the anchored major places and the two exit-road gates, then costs
   on the frozen ground (`refined-height-ungraded`, never a graded array)
   and the graph: per-step gradient cost steep enough that the line zigzags
   up a long slope on its own; every reach polygon a wall except where a
   recorded crossing is allowed, costed from the reach's `widthM` and bank
   fall so a ford is cheap, a span dear and a `horizontal-backwater` reach
   passable only by ferry; marsh, swamp and backswamp bodies costed so a dry
   detour wins; a typed **junction record**
   (`world/sources/routes/junctions.json`: id, position, the roads that meet
   there, a lore reason) through which both roads must run, the
   Gideon–Archon × Helstrom–Blackrose crossroads at 3.20 E, 3.59 S first.
   Coincident corridors merge onto one polyline as today. Routes keep their
   registry ids; eight cities stay joined (00-core acceptance); the three
   owner asks above pass; the ledger shows every road's old and new line and
   its over-cap metres before grading.
2. **Lanes on the record.** `reroute_lanes` runs **once**, after
   `compile_water`, re-lining the major boat lanes on graph reaches and
   bodies whose recorded depth floats the lane's hull class all year, never
   dredged (ruling 6); a lane that needs water the graph does not have is a
   sourcing gap in the plot, written to 16g's review. `compile_minor_routes`
   and `compile_minor_waterways` are **ported** here (deliverable 0, their
   allowlist rows and gated tests) but **run in 16g**, after the plot
   re-solve, on the 16g ladder row: minor routes and waterways are 16g's.
   Since minor routes get no grading, 16g's run must carry the same
   gradient cost so a track never needs one.
3. **Grading rewritten as a patch author, majors only.** `grade_routes` is
   rewritten from scratch as a pure function with one job. Its inputs are
   the solved lines, the graph and the router's own ground: 16b's
   patched frozen array, never overwritten. It finds every choke point
   along each road where the ground still breaks the class gradient cap;
   for each it decides from the measured shape whether a small local patch
   fixes it (inside `MAX_FILL_M` and the shoulder budget) or a structure
   must (the span author's stair, lip-step or short crossing); then it emits
   all the patches at once as one new kind, **`route-grade`**: a chainage window on
   one road carrying the graded longitudinal profile (cut and fill against
   the ungraded ground), the flat width and the shoulder. The patches live
   in their own file, `world/sources/terrain/route-grade-patches.json`
   (same schema), applied after every place patch. Two roads sharing a
   corridor grade the same ground once: the first patch wins and absorbs
   the later one (a profile proved on the natural ground cannot be
   re-proved on ground already moved). The structure windows go to the
   author as its input in the same pass; no second grading pass exists. A
   small `apply_route_patches` stage applies them through the same patch
   application function 16b's stage uses and writes the graded array as a
   separate file that every downstream stage reads; the ungraded array is
   never touched, so no snapshot is needed and the router cannot see its
   own grading. `patch_water --graded` then proves none moved a level, a
   body's extent or a channel. No separate bench, fill, cut or ramp kinds:
   a ramp *is* the profile at the cap over a short lip. A run on a
   channel's bank or a body's edge, where 16b's invariants let no patch
   move the ground, stays **natural** when it is walkable (at most 30°: a
   ford's approach, a marsh edge) and is reported as a bank; steeper, it is
   a window for the span author. The invariants gain a
   seventh: no `route-grade` inside recorded water or its 22 m shore band
   (the band that the water shader reads, so a graded road can neither lower a
   body's rim nor change the shore's ground), nor inside a channel's
   shoulder; a ford's approach ramp stops at the band's outer edge. Grading never
   re-runs `apply_terrain_patches`, the water compile or anything above it;
   the exclusion-window function lives in one module that 16h's
   `grade_settlement_pads` consumes unchanged. The old module's profile
   maths (`grade_profile`, the slope-feasible envelope) and class caps are
   reused; its raster reads, snapshot logic, report and pass-2 machinery
   are not carried over. Expected outcome under ruling 9 and the new router: far fewer and shorter graded windows than
   the old 112 over-cap stretches; the ledger reports count, total length
   and cut/fill volume.
4. **Spans, few and short.** With the router charging for spans and the
   grader absorbing pips, a long viaduct is a routing failure to fix in the
   router's costs, never a structure to build. The rewritten grader's choke-point finder absorbs a sub-metre pip as a
   patch by construction (the old grader let it through because its wet
   exclusion and smoothing skipped the sample; the backlog measurement is
   the regression test); the author keeps a minimum sustained rise and
   length so a 0.5 m bump over 18 m of causeway is never a span; `MAX_FILL_M` unchanged (the measurement showed it is the wrong
   lever). The author reads the crossing record: a ferry-band crossing gets
   no structure (the service record answers it, or the report says NO
   SERVICE for 16g), a marsh crossing gets a boardwalk deck, a river or
   lake crossing in the span band a bridge, a ford nothing. The remaining
   spans are short crossings and terrace steps built
   under decision 0051's rules on the graded ground; the trestle-foot ground
   fit confirmed; the one crossing with no pier sourced or re-authored as a
   stepped ascent. Each structure emits a typed `walkSurface` (deck
   centreline with heights, width, step height) in its placement JSON for
   16h's step rules and 10b's navmesh; `route-structures.md` reconciled;
   the span-length distribution reported before and after; any span
   over vanilla's longest whole bridge (52 m) is a red the ledger has to
   explain. The `route-structures` studio 3D layer is hidden until the
   ladder reaches 16h (a `SHOWN_FROM` map beside `LAYER_OF` in the chain
   script; `ladder.json` lists it under `hiddenLayers`).
5. **Crossings and ferries on the record.** `water_crossings` becomes the
   chain stage `derive_crossings` on the graph (deliverable 0) and
   `water-crossings.md` is regenerated. Every crossing on the major network
   is a `ford`, a `span` or a `ferry` by the bands; the ferry decision keeps
   the authored judgement in `ferry-crossings.json` (someone lives there, has
   a motive, would be poorer if the crossing were free). For each active
   ferry: landings re-sited where the way meets the recorded water's edge,
   each berth found by walking from the landing into the water to the
   first point that floats the declared hull class (within 30 m; the walk's
   length is recorded as `jettyM`, the dock length 16h places; a landing that never
   floats its hull demotes the service to `unmatched` with the reason: no
   dredging, ruling 6), the operator socket typed (`ferry-slot.*`
   becomes a roster slot 16g's prior→roster rule generates an NPC record
   for). The seventh service stays `deferred`: it depends on two deferred
   catalogue records, which is 16g's plot call; say so on the record.
   Landings, hulls and the operator body are placed by 16h's renderable
   kinds and 16i/16j with each place; nothing physical is placed here.
6. **The travel-service graph, one record.** `world/sources/routes/travel-services.json`
   is the province's one Morrowind-style service graph (talk, pay, arrive;
   no vessel simulation); `ferry-crossings.json` folds into it as its
   `ferry` services (one graph, one validator; `ferry_crossings.py`'s checks
   move to `travel_services.py --check`; the `policy` and `operatorModel`
   prose moves with them). A service has a kind (`ferry | boat | rootworm`;
   `guide | cart | porter` are in the vocabulary, populated per packet in
   Phase 15), stations (catalogue ids or `ferry-landing.*` ids), an operator
   socket, fares by band, `available`/`refusedIf` predicates from quests 85,
   `text.*` ids and the lane, reach chain or rootway of each hop. It holds:
   the six active ferries; a `boat` service per registry lane between
   stations declaring `boat` (the `FAST boat.corimont_helstrom` node
   satisfied by id); the four rootworm stations and three edges of
   `root-transit.json` carried over as `status: placeholder`.
   **When the rootworm network is properly authored:** in 16g, where the
   plot and the lore meet: the stations are re-sited at the hero Hist trees
   16g places, grounded in the dossiers (the Underground Express of *The
   Argonian Account*, the Waykeeper dossier in quests 40) and the plot review;
   its quest ties (LQ07, TG06, the MQ Waykeeper reward track) are finalised
   in the packet co-design loop (16j for the trial packet, Phase 15 per
   packet). `root-transit.json` is deleted here with the hard-coded painter.
   Tests: every station resolves; every hop follows a recorded lane or
   reach chain; every quests 20/25 `FAST` node resolves to a service id.
7. **Talk-to-service contract in `packages/`.** The buildout register's
   "talk → service menu as a small contract": a typed `ServiceSocket` on the
   service record; a verb that, at a socket, opens a service menu from the
   record (destinations, fare, refusal text from the text catalogue),
   evaluates `available`/`refusedIf` through the typed predicate vocabulary,
   takes the fare and moves the character to the destination station. No
   dialogue system, no NPC mesh: the studio draws the socket as a dev-only
   marker with a prompt, so a ferry can be used at this chunk's check before
   16h draws its hull and 16i stands its operator there. Test: a refusal
   predicate refuses; a paid trip arrives at the destination's position.
8. **Paint, overlays and the 2D map.** `routes_raster` and `rebake_landcover`
   read the published lines the character walks and paint the road surface
   on them, after every surviving old road texel has been repainted as the
   land-cover rule's ground (a census of `BC_ROAD / TRACK / PATH` texels in
   the shipped raster, 0.08 E 2.97 S first, the count in the ledger and a
   test that no road texel lies more than 5 m from a published line). A
   `paint_route_overlays` stage below the gate regenerates `soc-routes.png`,
   `soc-waterways.png` and `soc-rootways.png` from the published JSON so the
   map's `routes`, `waterways` and `rootways` layers show the re-solved
   networks; the "describes the old water" hover text goes;
   `compile_society`'s painter and `warn_on_drift` are deleted. In
   `RoutesLayer.tsx` four layers can be switched on separately: **spans** (one
   marker style per kind: bridge, deck, trestle, stair, stepped ascent,
   lip-step; hover shows id, kind, family, length, rise carried, pieces,
   the crossing's reach id and band, the authored `why`), **graded
   sections** (the `route-grade` patches drawn along the road; hover shows
   the road, chainage, length, max gradient before and after, cut and fill
   depth), **crossings** (ford, span or ferry with its reach id and depth)
   and **travel services** (hops and stations with kind, fare and
   operator). Every value on a hover comes from the published record it
   names, never recomputed in the browser.
9. **Tests shown failing first**: a graded road crossing a channel; a patch
   moving a level; a span under the sustained-rise floor; a crossing with no
   reach id or a ford on water too deep for its band; a ferry berth whose
   recorded depth does not float its hull; a hop on no recorded lane; paint
   more than 5 m off the published line (this also catches old road
   texels); a road with a sample inside a reach
   polygon away from its recorded crossing; a junction that a named road misses.

## Acceptance

- **The chain ladder** (plan §3): this chunk's stages, in order, are
  `reroute_lanes` (once, after `compile_water`), `solve_major_routes`,
  `grade_routes` (the rewritten author: patches and structure windows in
  one pass), `apply_route_patches`, `patch_water_graded` (the water proof
  over the grading; never a second `compile_water` or
  `apply_terrain_patches`), `derive_crossings`, `author_route_structures`,
  `compile_route_structures`, `travel_services`, `export_routes`,
  `paint_route_overlays`. The second `reroute_lanes` entry and
  `reroute_majors` are removed; `compile_minor_routes` and
  `compile_minor_waterways` sit on the `[16g]` row. Fill the `[16e]` row in
  `terrain-chain.sh`, confirm `worldgen/ladder.py`'s `OWNER` map and bump
  `DELIVERED_THROUGH` in the delivering commit.
- **One way, proven cheaply**: a second plain chain run after delivery
  prints `skip (unchanged)` for every stage above this chunk's row and
  re-runs nothing above it (no byte-identical two-run proof is required; the
  network is frozen when the owner accepts it).
- One route solve; grading fully expressed as patches with the frozen array
  untouched; every skipped route probe green with its skip removed; all eight
  cities joined; the allowlist rows for this chunk's modules deleted; the
  provenance gate green.
- The ledger `docs/research/phase16/16e-ledger.md` (numbers before and after:
  each road's line and over-cap metres, patch count, length and volume, span
  distribution, crossing bands, services), a decision record for the
  non-obvious calls, 16f's Starting state rewritten, the backlog rows
  absorbed here struck.

## Owner check

**What you will see at this check** (plan §3, build only what is delivered):
the ground, the water and the apron, plus the roads and fords on the ground
and the ferries usable through their landing marker. Bridges, ferry boats and
landings are drawn when 16h has fixed the runtime that draws them; here they
are on the 2D map with hover information. No tracks, plants or buildings.

- The 2D map's `routes` layer first: does `stormhold-thorn` stay out of the
  river; does `archon-gideon` take the southern high ground; is the
  crossroads at `x=3.20&z=3.59` on dry ground with both roads through it?
- Walk `route.road.helstrom-blackrose` from Helstrom (`?view=character&x=3.47&z=2.81&t=12:00`)
  for ten minutes: does it read as a road (a bench, a surface, no 30°
  scramble; a zigzag where the hill is long)?
- Two more roads of your choosing: same question.
- The 2D map's `graded sections` layer: are there few, are they short; does
  each hover explain itself? Walk one.
- The 2D map's `spans` layer: is every span a short crossing or a terrace
  step, with no long viaduct left? Hover a bridge and a stair.
- Two river fords: on the Gideon–Stormhold road (`?view=character&x=2.278&z=1.747&t=12:00`,
  12 m wide, 1.1 m deep) and on the Blackwood road west of Gideon
  (`x=0.313&z=3.030`, 13 m, 0.65 m): can you wade it; does the road ramp
  down to the water's edge and up the far bank?
- One ferry, the Drowning Gate east landing (`?view=character&x=0.350&z=3.044&t=12:00`):
  walk to the pole with the label, press E: does the menu open; does paying
  take you to the west landing (`x=0.525&z=3.191`); does a refusal read
  right? (The Onkobra bond ferry at `x=1.334&z=3.080` is the other live one.
  The Underway basin ferry is `unmatched`: the road no longer enters the
  basin, a 16g call.)
- The one span over 52 m: Stormhold–Thorn at chainage 8.6 km crosses a dry
  hollow on a 200 m bridge (`x=5.9&z=1.0` on the 2D `spans` layer): steer
  it with an authored line or a junction, or accept it.
- The 2D map's `travel services` layer: do the ferry hops, the boat services
  and the four placeholder rootworm stations join places a traveller would
  want joined? (The rootworm stations move in 16g.)

## Gotchas

- Grading is the one terrain edit with no bbox discipline today (chain audit
  risk 5): the invariants are the point of this chunk.
- The road-suppresses-water mechanisms are deleted; do not reintroduce them.
- The router reads the ungraded snapshot, never the graded array: a router
  that sees its own grading re-routes next run (the `carve_routes` cycle
  one rung lower).
- Nothing above this chunk's ladder row runs again: not `compile_society`
  (a refreeze, an owner act), not `apply_terrain_patches`, not
  `compile_water`.
- `ferry_crossings.py`'s green today is on stale water; do not keep the old
  `measured` values to keep it green.

## Delivery plan (2026-09-15, for owner approval)

Fable plans, decides and judges; `deliver` subagents (Opus, low effort) do
the mechanical passes under a brief that names files, mechanism, numbers and
checks; `research` subagents measure. Each step is minutes to a couple of
hours of agent time; the chunk is one session with one owner check at the
end. Every step commits by pathspec after `npm run preflight`.

0. **Reconcile before building** (Fable, at the start). `routing-audit`
   over this brief; PROGRESS row to `in progress`; the three docs that still
   home the rootworm re-authoring or ferry placement in 16e corrected
   (phases README Phase 11 table row and Phase 9 scope note, quests 20
   root-transit note, decision 0061 §4 addendum) and the plan README §4 row;
   decision 0068 written for the calls this brief fixes (majors re-solved
   below the gate on the frozen ground; records and placements here,
   physical realisation in 16h; one service graph; rootworm re-authoring at
   16g with the Hist placement; minor routes ungraded).
1. **Deliverable 0, the ports** (one `deliver` subagent per module, in
   parallel): `compile_minor_routes`, `compile_minor_waterways`,
   `water_crossings → derive_crossings` onto `ShippedWater`; allowlist rows
   deleted; the provenance join test written red-first on today's records.
   Fable reviews the diffs for re-derivation that survived.
2. **The router** (Fable, low effort: the cost model is the design-heavy
   step): `solve_major_routes` from `reroute_majors`'s machinery; gradient,
   river-wall, crossing, marsh and junction costs; the junction record; the
   three owner asks as tests; every road's before/after line in the ledger.
3. **The patch kind** (Fable designs `route-grade` and the seventh
   invariant; a `deliver` subagent implements it with its red-first test).
4. **The grader rewritten** (Fable, low effort): the choke-point finder,
   the patch-or-structure decision, the patches emitted at once,
   `apply_route_patches`; the profile maths kept; the exclusion-window
   module; the road probe green with its skip removed.
5. **Spans** (`deliver` under Fable's numbers): the sustained-rise floor,
   `walkSurface`, the pier-less crossing, the trestle foot;
   `route-structures.md` regenerated; distribution before and after; any
   span over 52 m sent back to step 2; the `SHOWN_FROM` hiding rule.
6. **Crossings, ferries and the service graph** (Fable authors the schema
   and the merge; `deliver` writes `travel_services.py --check`, migrates
   `ferry-crossings.json` and `root-transit.json`, deletes the painter;
   every `why` and policy sentence carried verbatim, then `text-review` in a
   separate agent on anything new).
7. **The talk-to-service contract** (Fable, low effort: a `packages/`
   contract with a studio slice): types, the verb, the predicate evaluation,
   the arrive, the dev-only marker, the two tests.
8. **Paint, overlays and the map layers** (`deliver`): the old-road-texel
   census and repaint (decode the raster, count, repaint, test), then
   `routes_raster` on the published line, `paint_route_overlays`, the four switchable layers
   with hovers in `RoutesLayer.tsx`, hover text removed, `warn_on_drift`
   deleted.
9. **The chain** (Fable): the `[16e]` row, `DELIVERED_THROUGH="16e"`, the
   stage removals and moves, a plain run through 16e, the one-way check, the
   apron re-run confirmed, rasters published, every skipped route probe
   un-skipped and green.
10. **Close** (Fable): the ledger with its numbers, decision 0068 finalised,
    16f's Starting state rewritten, backlog rows struck, PROGRESS updated,
    the owner check above handed over with the re-measured URLs. Nothing is
    pushed.

Steps 1, 2, 3 and 8 run in parallel from the start; 4 waits for 2 and 3; 5
waits for 4; 6 waits for 1 and 2; 7 waits for 6; 9 waits for all.
