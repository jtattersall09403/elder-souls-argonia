# 16a — hydrology graph measurement ledger (2026-09-11)

Evidence for Phase 16a ([brief](../../phases/16-foundation-and-places/16a-hydrology-graph-and-gates.md),
decision [0058](../../decisions/0058-the-hydrology-graph-is-the-water-record.md)).
Every number here is printed by `python3 -m worldgen.hydrology_graph report`
or by the scripts named in the section; re-run them rather than trust this page.

## 1. Which base (ruling 1's premise, measured)

| Check | Result |
|---|---|
| vault `heightfield-sculpted-f32.npy` vs `heightfield-sculpted-august-2026.npy` | byte-identical (sha `817477c4…`): the vault's "today" file IS the August array |
| today's `sculpt_province` re-run, twice, into scratch copies | identical to each other (deterministic), sha `ab76877c…` |
| today's code vs August | max 92.5 m, 6.28 % of samples differ by > 1 m, 10.6 % by > 1 cm |

So the graph is derived on today's code's output (ruling 1), whose sha is the
graph's `sourceHeightSha256`. 16b's re-freeze must reproduce it (or re-derive).

## 2. August array vs today's code — what re-freezing changes in the water

Both derived with the fixed drainage solver (0058 choice 7), so this is the
terrain difference alone.

| Measure | August array | today's code |
|---|---|---|
| rivers (all) | 99 | 100 |
| rivers reaching the sea | 31 | 30 |
| reaches | 913 | 889 |
| junctions | 198 | 200 |
| river km | 61.5 | 62.0 |
| sloped km | 13.7 | 13.6 |
| waterfalls measured | 7 | 5 |
| knickpoint proposals, band 2 | 28 | 26 |
| standing bodies | 408 | 406 |
| lakes (lowland) | 21 | 23 |
| tarns (upland) | 17 | 16 |
| marsh/swamp sheets | 130 | 129 |
| river-trapped pits | 0 | 0 |
| lost stations | 4 | 4 |
| water classes | {'blackwater': 9, 'whitewater': 60, 'clearwater': 30} | {'blackwater': 9, 'whitewater': 61, 'clearwater': 30} |

River ids shared (same mouth cell): 85; only August: 14; only today: 15.

## 3. The drainage solver defect (fixed in `hydrology.py`)

| Measure (shipped Phase 3 pass, August base) | before | after |
|---|---|---|
| residual pits in the routing surface | 223 | 0 |
| two-cell flow loops | 390 (20 on river cells) | 0 |
| land cells with no outflow, off the border | — | 0 |
| cells not reaching an outlet within 20,000 steps | — | 0 |
| `flow_to` cells changed | — | 1,787 of 1,809,025 |
| largest sea river's catchment | 6.2 km² | 12.7 km² (its upstream had been cut off at a loop) |

Mechanism: Garbrecht & Martz flat resolution added an increment larger than
the smallest real drop, lifting flat cells above the non-flat cell that drained
into them. Fix: bound the increment, then a strict-descent epsilon flood; the sea
becomes a D8 sink. The shipped rasters are untouched until 16b reruns the
pass; the graph's `drainageLoops` invariant holds it at zero.

## 4. The graph, as derived (report)

A **knickpoint** is a sudden steepening in a river's bed, the step in the
profile where a waterfall or rapid forms; "knickpoint proposal" means a spot
where the base terrain already drops 3 m or more within 20 m as a slide, so
cutting a 70-degree face there would make a waterfall.

rivers 100 · reaches 889 · junctions 200 · bodies 406

| Reach kind | count | km |
|---|---|---|
| horizontal-river | 40 | 2.0 |
| horizontal-stream | 75 | 4.0 |
| horizontal-creek | 185 | 10.5 |
| horizontal-backwater | 294 | 31.8 |
| horizontal-tidal | 6 | 0.1 |
| sloped-riffle | 62 | 1.9 |
| sloped-rapid | 195 | 8.9 |
| sloped-chute | 27 | 2.8 |
| vertical-fall | 5 | 0.0 |

| Body kind | count |
|---|---|
| ocean | 1 |
| lagoon | 9 |
| lake-lowland | 23 |
| tarn-upland | 16 |
| pond | 175 |
| pool | 52 |
| plunge-pool | 1 |
| marsh-fringe | 71 |
| marsh-deep | 51 |
| swamp | 3 |
| backswamp | 4 |
| mudflat | 0 |

## Rivers reaching the sea, largest first

| River | catchment km² | Strahler | water | mouth form | tributaries | length km |
|---|---|---|---|---|---|---|
| river.889-484 | 12.7 | 3 | whitewater | estuary | 8 | 4.9 |
| river.292-1189 | 6.8 | 2 | clearwater | estuary | 8 | 4.7 |
| river.731-1121 | 2.1 | 2 | clearwater | estuary | 1 | 0.5 |
| river.0-574 | 1.6 | 2 | whitewater | estuary | 1 | 0.9 |
| river.879-763 | 1.1 | 2 | clearwater | estuary | 4 | 1.1 |
| river.0-211 | 1.0 | 2 | whitewater | estuary | 2 | 1.5 |
| river.1153-184 | 0.8 | 1 | whitewater | estuary | 1 | 0.6 |
| river.0-127 | 0.6 | 1 | whitewater | estuary | 0 | 1.1 |
| river.865-897 | 0.5 | 1 | clearwater | estuary | 1 | 0.6 |
| river.29-842 | 0.5 | 1 | whitewater | estuary | 0 | 0.7 |
| river.1223-143 | 0.4 | 1 | whitewater | estuary | 0 | 0.6 |
| river.95-1018 | 0.3 | 1 | whitewater | estuary | 1 | 0.3 |
| river.993-377 | 0.3 | 1 | whitewater | estuary | 1 | 0.2 |
| river.950-605 | 0.2 | 1 | clearwater | estuary | 0 | 0.3 |
| river.1035-291 | 0.2 | 1 | whitewater | estuary | 0 | 0.4 |
| river.938-646 | 0.2 | 1 | blackwater | estuary | 0 | 0.6 |
| river.0-420 | 0.2 | 1 | whitewater | estuary | 0 | 0.2 |
| river.0-25 | 0.2 | 1 | whitewater | estuary | 0 | 0.0 |
| river.635-1201 | 0.2 | 1 | blackwater | estuary | 0 | 0.3 |
| river.53-1209 | 0.2 | 1 | blackwater | estuary | 0 | 0.3 |
| river.846-0 | 0.2 | 1 | whitewater | estuary | 0 | 0.3 |
| river.191-1280 | 0.2 | 1 | blackwater | estuary | 0 | 0.0 |
| river.843-1001 | 0.2 | 1 | clearwater | estuary | 0 | 0.2 |
| river.52-1091 | 0.1 | 1 | blackwater | estuary | 0 | 0.1 |
| river.894-0 | 0.1 | 1 | whitewater | estuary | 0 | 0.2 |

## Waterfalls measured on the base

| Reach | band | drop m | lip level m | plunge pool | nearest place |
|---|---|---|---|---|---|
| reach.2681-79 | 1 | 4.72 | 109.61 | body.2681-78 | Ash Holding (0.1 km) |
| reach.90-2525 | 2 | 43.95 | 43.95 | body.ocean | Leaning Watch (0.1 km) |
| reach.1393-181 | 1 | 24.74 | 24.74 | body.2442-1212 | Cut-In-The-Wall (0.0 km) |
| reach.2349-983 | 3 | 7.83 | 7.83 | body.2442-1212 | The Break (0.1 km) |
| reach.2590-659 | 1 | 122.31 | 122.31 | body.2442-1212 | The Poling Relay (0.0 km) |

## Knickpoint proposals (131; by band {'1': 105, '2': 26})

Band 2–3 only (the owner's question: falls on big rivers):

| Reach | band | catchment km² | drop m over 20 m | east m | south m | nearest place |
|---|---|---|---|---|---|---|
| reach.86-460 | 2 | 0.48 | 18.6 | 153.8 | 838.5 | Onkobra Divers' Yard (0.5 km) |
| reach.115-474 | 2 | 0.479 | 17.53 | 191.1 | 861.2 | Onkobra Divers' Yard (0.5 km) |
| reach.391-1602 | 2 | 0.603 | 17.28 | 719.7 | 2954.9 | The Stone Drop (0.1 km) |
| reach.84-666 | 2 | 1.029 | 16.22 | 106.1 | 1205.6 | Onkobra Divers' Yard (0.2 km) |
| reach.485-1501 | 2 | 0.462 | 15.62 | 877.3 | 2749.0 | Castle Giovesse (0.1 km) |
| reach.913-1021 | 2 | 0.543 | 13.52 | 1793.6 | 1831.9 | The White Throat (0.0 km) |
| reach.37-645 | 2 | 1.032 | 11.55 | 62.8 | 1176.8 | Onkobra Divers' Yard (0.3 km) |
| reach.899-898 | 2 | 0.543 | 11.41 | 1711.8 | 1716.6 | Twyllbek Crown (0.1 km) |
| reach.99-657 | 2 | 1.016 | 11.08 | 181.2 | 1201.2 | Onkobra Divers' Yard (0.2 km) |
| reach.67-437 | 2 | 0.558 | 9.86 | 23.5 | 711.7 | Onkobra Divers' Yard (0.7 km) |
| reach.767-2332 | 2 | 0.473 | 9.41 | 1488.6 | 4288.8 | The Silent Halls (0.1 km) |
| reach.107-2464 | 2 | 0.451 | 9.32 | 178.1 | 4579.6 | Leaning Watch (0.0 km) |
| reach.1027-1010 | 2 | 0.574 | 6.58 | 1944.5 | 1894.0 | The Topmost Chamber (0.0 km) |
| reach.1238-999 | 2 | 0.474 | 6.37 | 2284.1 | 1866.2 | The Monsoon Boom (0.1 km) |
| reach.1061-1506 | 2 | 0.837 | 5.59 | 1941.2 | 2751.1 | Rests-The-Walkers (0.1 km) |
| reach.1789-234 | 2 | 1.517 | 5.39 | 3270.4 | 426.9 | Cut-And-Stack (0.1 km) |
| reach.3380-466 | 2 | 0.644 | 5.05 | 6184.6 | 858.4 | The Waiting Hole (0.1 km) |
| reach.387-1581 | 2 | 0.579 | 5.0 | 707.6 | 2899.8 | The Stone Drop (0.1 km) |
| reach.1489-489 | 2 | 0.867 | 4.83 | 2720.9 | 893.2 | First-Counted (0.1 km) |
| reach.1076-1079 | 2 | 0.622 | 4.68 | 1968.8 | 2000.2 | The Quiet Pit (0.1 km) |
| reach.713-2309 | 2 | 0.456 | 4.34 | 1319.4 | 4224.9 | Door-That-Stayed-Shut (0.1 km) |
| reach.360-1688 | 2 | 0.792 | 4.02 | 648.9 | 3094.4 | Cartwright's Cross (0.1 km) |
| reach.3343-405 | 2 | 0.599 | 3.59 | 6111.1 | 740.7 | Thorn Terraces (0.1 km) |
| reach.120-644 | 2 | 1.015 | 3.2 | 202.9 | 1181.6 | Onkobra Divers' Yard (0.2 km) |
| reach.1256-1037 | 2 | 0.474 | 3.2 | 2296.0 | 1896.3 | The Monsoon Boom (0.1 km) |
| reach.1002-1003 | 2 | 0.545 | 3.07 | 1833.2 | 1834.7 | Onkobra Kwama Mine (0.1 km) |

## Lakes and tarns (≥ 1 ha)

| Body | kind | level m | area ha | max depth m | season | inflow | outflow | nearest place |
|---|---|---|---|---|---|---|---|---|
| body.1209-3032 | lake-lowland | 1.44 | 101.5 | 7.65 | perennial | 16 | reach.1187-3136 | The Chimney (0.1 km) |
| body.1571-1249 | lake-lowland | 1.14 | 11.1 | 5.27 | perennial | 4 | reach.1789-1312 | Low-Crown, the Paatru Hist (0.2 km) |
| body.200-770 | tarn-upland | 290.3 | 10.8 | 42.72 | perennial | 4 | reach.143-659 | Onkobra Divers' Yard (0.2 km) |
| body.1787-344 | lake-lowland | 7.45 | 7.3 | 8.72 | perennial | 2 | reach.1747-270 | Guar Ground (0.1 km) |
| body.1789-698 | lake-lowland | 1.09 | 7.0 | 2.49 | perennial | 2 | reach.1932-696 | Shoal Bank (0.1 km) |
| body.973-3292 | lake-lowland | 1.52 | 4.7 | 4.68 | perennial | 1 | reach.878-3292 | The Potentate's Works (0.1 km) |
| body.221-1650 | tarn-upland | 35.14 | 4.5 | 10.47 | perennial | 1 | reach.183-1668 | Bog Iron Workings (0.1 km) |
| body.1999-999 | lake-lowland | 9.08 | 4.4 | 9.83 | perennial | 0 | reach.1953-1067 | Needle-Crown, the Agaceph Hist (0.2 km) |
| body.763-3395 | lake-lowland | 1.71 | 3.9 | 2.23 | perennial | 2 | reach.748-3397 | The Sunk Barge (0.1 km) |
| body.1277-865 | lake-lowland | 29.38 | 3.6 | 7.63 | perennial | 1 | reach.1249-942 | Charge Works (0.1 km) |
| body.2435-2152 | lake-lowland | 1.44 | 3.5 | 2.02 | perennial | 7 | reach.2415-2077 | Seven-Terrace (0.2 km) |
| body.258-2581 | lake-lowland | 62.61 | 3.3 | 63.88 | perennial | 0 | - | Swampmoth Town (0.1 km) |
| body.1571-570 | lake-lowland | 8.57 | 2.8 | 9.84 | perennial | 1 | reach.1710-439 | Black Stage (0.0 km) |
| body.1373-544 | tarn-upland | 31.72 | 2.7 | 10.1 | perennial | 0 | reach.1427-504 | The Standing Bid (0.1 km) |
| body.2879-340 | tarn-upland | 229.48 | 2.7 | 32.68 | perennial | 0 | reach.2951-430 | Cold Holding (0.2 km) |
| body.805-3530 | lake-lowland | 0.93 | 2.5 | 2.57 | perennial | 1 | reach.867-3558 | Wide-Furrow (0.1 km) |
| body.1218-1116 | lake-lowland | 1.86 | 2.5 | 3.13 | perennial | 2 | reach.1196-1189 | The Tapping Camp (0.1 km) |
| body.926-2458 | lake-lowland | 1.83 | 2.4 | 2.65 | perennial | 2 | reach.976-2536 | The Basin Line (0.1 km) |
| body.1189-2027 | lake-lowland | 21.47 | 2.2 | 4.75 | perennial | 0 | - | Old Office House (0.1 km) |
| body.835-2593 | lake-lowland | 4.16 | 2.1 | 4.21 | perennial | 0 | - | Reedcutters' Bridge (0.1 km) |
| body.2768-2033 | lake-lowland | 1.87 | 2.1 | 5.48 | perennial | 1 | reach.2780-1979 | Nine-Trunks (0.1 km) |
| body.692-1779 | tarn-upland | 53.36 | 1.8 | 6.93 | perennial | 1 | reach.768-1646 | The Marble Field (0.1 km) |
| body.1178-42 | tarn-upland | 364.87 | 1.8 | 32.02 | perennial | 0 | - | The Delta Byre (0.2 km) |
| body.819-2283 | lake-lowland | 17.65 | 1.7 | 18.92 | perennial | 0 | - | The Cold Forge (0.1 km) |
| body.654-453 | tarn-upland | 482.34 | 1.6 | 17.65 | perennial | 0 | reach.564-431 | Silyanorn Diggings (0.2 km) |
| body.2508-2288 | lake-lowland | 1.24 | 1.6 | 5.01 | perennial | 0 | reach.2617-2277 | One-Chest (0.0 km) |
| body.1002-335 | tarn-upland | 393.95 | 1.6 | 44.23 | perennial | 1 | reach.1045-372 | The Drowned Terrace (0.4 km) |
| body.2436-2699 | lake-lowland | 1.52 | 1.6 | 2.32 | perennial | 1 | reach.2571-2710 | Takes-The-Wrong-Gap (0.1 km) |
| body.1072-121 | tarn-upland | 363.79 | 1.6 | 35.0 | perennial | 0 | reach.1112-140 | The Drowned Terrace (0.0 km) |
| body.1719-901 | lake-lowland | 17.32 | 1.6 | 5.77 | perennial | 0 | - | The Kept Line (0.2 km) |
| body.1954-2136 | tarn-upland | 31.71 | 1.4 | 5.43 | perennial | 0 | - | The Root Talk Ground (0.1 km) |
| body.805-583 | tarn-upland | 459.87 | 1.4 | 26.21 | perennial | 0 | - | Diggings Ladder (0.1 km) |
| body.564-1042 | tarn-upland | 407.87 | 1.3 | 19.13 | perennial | 0 | - | Onkobra Clay Pits (0.3 km) |
| body.635-1651 | tarn-upland | 74.59 | 1.2 | 13.71 | perennial | 0 | reach.664-1673 | Gideon (0.2 km) |
| body.34-1253 | tarn-upland | 235.18 | 1.1 | 35.85 | perennial | 1 | - | The Black Tarn (0.0 km) |
| body.824-179 | tarn-upland | 507.22 | 1.1 | 10.25 | perennial | 0 | reach.817-188 | The Flu Cordon (0.1 km) |
| body.2245-1351 | lake-lowland | 0.94 | 1.0 | 3.21 | perennial | 0 | - | Keeps-the-Egg (0.0 km) |
| body.1293-692 | tarn-upland | 32.64 | 1.0 | 3.22 | perennial | 2 | reach.1298-638 | Hatching Pools (0.2 km) |
| body.2455-2973 | lake-lowland | 2.25 | 1.0 | 6.38 | perennial | 0 | reach.2503-2984 | Nothing-Planted (0.3 km) |

Lost stations (coarse route climbs out by the wrong exit): 4 — sites: [{'reach': 2, 'eastM': 4881.7, 'southM': 107.4, 'stations': 2, 'band': 1}, {'reach': 33, 'eastM': 4310.9, 'southM': 1715.1, 'stations': 2, 'band': 3}]
Steep/fall stations measured for valley width: 1972, under-resolved (< 2 coarse cells wide): 1197
River-trapped depressions on the base: 0
Wet-season line: 188785 coarse cells = 5.68 km²


**Reading the numbers.** Five measured falls on the base, none on a band-3
river except The Break (7.8 m); 26 band-2 knickpoint proposals are where 16b
could cut one on a bigger river — the owner picks. "The Black Tarn" sits on a
measured `tarn-upland`, a good sign the plot and the base agree.

## 5. The wet-season line and the coarse grid (deliverable 2)

The Phase 3 wetlands + rivers + lakes overlay is declared the wet-season
high-water extent: 188,785 coarse cells, 5.68 km². Where the 1345 grid is too
coarse for small streams: of 1,972 steep and fall stations measured, 1,197
(61 %) sit in a valley narrower than two coarse cells (a wall within 5.5 m
either side). The 5.48 m raster cannot draw those; the graph's centrelines at
1.83 m stations are the fix; they are what the map layer draws. Lost
stations (the coarse route climbs out of a hollow by the wrong exit): 4 on
two reaches, 2 stations each (3.7 m) — at (4881.7 E, 107.4 S) on a band-1
creek at the north border and (4310.9 E, 1715.1 S) on a band-3 river; both
are recorded in `stats.lostSites`; at that length a full-res re-route is
16b's carve doing its ordinary job, not a separate derivation.

## 6. The "erosion pits" (ruling 2) and the thin classes (deliverable 4)

**On the frozen base there are no river-trapped depressions at all** (both
bases: 0). The pits the owner sees are made by the refine stages
(deterrace, detail noise, fluvial continuum) after the base and before the
carve. Disposition proposed: none to fill on the base; 16b's freeze gate
requires `forcedBasins == 0` after its terrain stages; any tarn the owner
wants kept is declared in the graph as a `tarn-upland` with an outflow (the
list below shows which shipped pits coincide with a measured base body). The
shipped list, for the owner to mark any to keep:

Shipped standing bodies with level >= 60 m and >= 96 cells: 107 (the chain audit's '46 erosion pits' were measured as bodies inside > 60 m terrain)

| # | east m | south m | level m | area ha | max depth m | on the frozen base | nearest place |
|---|---|---|---|---|---|---|---|
| 1 | 470 | 1214 | 287.7 | 9.99 | 40.7 | no body | Rufio's Landing (0.3 km) |
| 2 | 1153 | 796 | 480.8 | 1.59 | 16.0 | tarn-upland body.654-453 (1.6 ha) | Silyanorn Diggings (0.2 km) |
| 3 | 2116 | 70 | 361.4 | 1.52 | 28.6 | tarn-upland body.1178-42 (1.8 ha) | The Drawdown Flats (0.2 km) |
| 4 | 5322 | 629 | 218.1 | 1.50 | 21.1 | pond body.2873-266 (0.4 ha) | Cold Holding (0.2 km) |
| 5 | 1052 | 1993 | 407.8 | 1.20 | 19.0 | pond body.627-1030 (0.4 ha) | Onkobra Clay Pits (0.3 km) |
| 6 | 1371 | 620 | 527.7 | 0.75 | 17.8 | pond body.711-323 (0.3 ha) | Silyanorn Diggings (0.1 km) |
| 7 | 1946 | 1027 | 313.0 | 0.72 | 14.7 | pond body.1052-567 (0.5 ha) | Rim Hermitage (0.1 km) |
| 8 | 295 | 890 | 273.9 | 0.69 | 14.4 | pond body.173-485 (0.5 ha) | Onkobra Divers' Yard (0.5 km) |
| 9 | 4883 | 114 | 96.7 | 0.67 | 98.3 | pool body.2627-23 (0.0 ha) | Zuuk (0.1 km) |
| 10 | 6152 | 364 | 71.3 | 0.62 | 15.5 | pond body.3364-188 (0.7 ha) | The Salt Ledge (0.1 km) |
| 11 | 864 | 2425 | 241.8 | 0.61 | 15.6 | pond body.472-1322 (0.3 ha) | Ridge Runners' Post (0.1 km) |
| 12 | 1149 | 1869 | 424.4 | 0.49 | 12.5 | pond body.573-978 (0.1 ha) | Licensed Dig (0.4 km) |
| 13 | 727 | 121 | 540.8 | 0.45 | 12.4 | pond body.398-78 (0.6 ha) | Seam-Chasers (0.3 km) |
| 14 | 5265 | 500 | 232.2 | 0.44 | 18.1 | pond body.2873-266 (0.4 ha) | Cold Holding (0.1 km) |
| 15 | 1063 | 960 | 448.5 | 0.43 | 19.1 | tarn-upland body.654-453 (1.6 ha) | Silyanorn Diggings (0.3 km) |
| 16 | 1430 | 249 | 499.3 | 0.41 | 0.8 | tarn-upland body.824-179 (1.1 ha) | The Flu Cordon (0.0 km) |
| 17 | 1306 | 581 | 528.8 | 0.36 | 13.9 | pond body.711-323 (0.3 ha) | Silyanorn Diggings (0.2 km) |
| 18 | 2342 | 90 | 370.9 | 0.36 | 9.3 | pool body.1253-59 (0.0 ha) | The Delta Byre (0.0 km) |
| 19 | 965 | 1395 | 353.6 | 0.33 | 8.8 | pool body.525-732 (0.0 ha) | The Sunk Lane (0.0 km) |
| 20 | 115 | 1952 | 351.8 | 0.33 | 18.1 | pond body.61-1075 (0.4 ha) | Drowned Embankment (0.3 km) |
| 21 | 80 | 403 | 244.9 | 0.31 | 3.2 | no body | Breathes-Underneath (0.6 km) |
| 22 | 1677 | 516 | 465.8 | 0.29 | 8.9 | pond body.914-278 (0.2 ha) | The Flu Cordon (0.3 km) |
| 23 | 884 | 385 | 408.6 | 0.27 | 14.1 | pond body.483-206 (0.2 ha) | Anachronistic Library (0.1 km) |
| 24 | 2208 | 270 | 279.5 | 0.27 | 5.7 | pond body.1197-147 (0.1 ha) | The Drawdown Flats (0.1 km) |
| 25 | 4725 | 931 | 158.3 | 0.26 | 6.3 | no body | The Poling Relay (0.2 km) |
| 26 | 976 | 1806 | 418.1 | 0.25 | 6.4 | pond body.471-960 (0.1 ha) | The Old Quarters (0.3 km) |
| 27 | 828 | 1274 | 303.6 | 0.23 | 2.4 | pond body.462-681 (0.4 ha) | The Sunk Lane (0.2 km) |
| 28 | 1854 | 196 | 349.5 | 0.22 | 13.7 | tarn-upland body.1072-121 (1.6 ha) | The Drowned Terrace (0.1 km) |
| 29 | 788 | 108 | 542.8 | 0.20 | 7.5 | pond body.398-78 (0.6 ha) | Seam-Chasers (0.2 km) |
| 30 | 744 | 2061 | 332.0 | 0.18 | 14.2 | pond body.406-1130 (0.2 ha) | Onkobra Clay Pits (0.2 km) |
| 31 | 466 | 3730 | 322.0 | 0.17 | 4.6 | pond body.260-2029 (0.2 ha) | Niben Crystal Workings (0.2 km) |
| 32 | 839 | 844 | 421.9 | 0.16 | 3.4 | pond body.478-523 (0.2 ha) | Ninth Chapel (0.2 km) |
| 33 | 311 | 2458 | 245.9 | 0.16 | 18.1 | pool body.177-1309 (0.0 ha) | The Black Tarn (0.3 km) |
| 34 | 147 | 2057 | 333.5 | 0.14 | 14.2 | pond body.61-1075 (0.4 ha) | Drowned Embankment (0.2 km) |
| 35 | 865 | 948 | 417.7 | 0.14 | 2.3 | pond body.478-523 (0.2 ha) | Ninth Chapel (0.3 km) |
| 36 | 4002 | 397 | 168.6 | 0.13 | 3.2 | no body | Channel Cross (0.1 km) |
| 37 | 1012 | 1378 | 355.7 | 0.12 | 3.4 | pool body.525-732 (0.0 ha) | The Sunk Lane (0.1 km) |
| 38 | 5649 | 647 | 156.6 | 0.12 | 7.2 | pond body.3044-420 (0.1 ha) | Stands-On-The-Hammock (0.3 km) |
| 39 | 706 | 4204 | 248.5 | 0.12 | 4.2 | no body | Sabinus' Claim (0.1 km) |
| 40 | 1054 | 1368 | 366.8 | 0.12 | 7.6 | pool body.525-732 (0.0 ha) | The Sunk Lane (0.1 km) |
| 41 | 859 | 1756 | 483.8 | 0.12 | 9.8 | pond body.471-960 (0.1 ha) | The Old Quarters (0.2 km) |
| 42 | 708 | 2762 | 150.2 | 0.11 | 4.3 | no body | The Snowline Cell (0.1 km) |
| 43 | 48 | 2538 | 206.2 | 0.11 | 10.1 | pond body.27-1393 (0.1 ha) | The Black Tarn (0.2 km) |
| 44 | 350 | 3978 | 179.5 | 0.11 | 4.6 | no body | Hand-Read Halls (0.0 km) |
| 45 | 1130 | 401 | 560.6 | 0.11 | 4.0 | pond body.630-151 (0.1 ha) | Seam-Chasers (0.2 km) |
| 46 | 1047 | 1817 | 414.0 | 0.11 | 4.4 | pond body.541-980 (0.3 ha) | The Old Quarters (0.4 km) |
| 47 | 664 | 3823 | 304.4 | 0.10 | 3.2 | no body | Sour Orchard (0.2 km) |
| 48 | 1145 | 269 | 601.3 | 0.10 | 8.0 | pond body.630-151 (0.1 ha) | Seam-Chasers (0.2 km) |
| 49 | 4940 | 466 | 170.2 | 0.10 | 3.4 | pond body.2711-252 (0.1 ha) | The Jumped Claim (0.0 km) |
| 50 | 1820 | 1249 | 316.4 | 0.10 | 7.4 | pond body.995-684 (0.1 ha) | Mazzatun (0.2 km) |
| 51 | 5686 | 987 | 184.1 | 0.09 | 4.0 | no body | Stands-On-The-Hammock (0.1 km) |
| 52 | 1740 | 317 | 426.1 | 0.09 | 2.0 | pond body.949-176 (0.3 ha) | The Drowned Terrace (0.2 km) |
| 53 | 1232 | 2593 | 339.7 | 0.09 | 5.9 | pond body.603-1360 (0.1 ha) | Vanin's Signal (0.2 km) |
| 54 | 1096 | 2486 | 393.0 | 0.09 | 5.5 | pond body.603-1360 (0.1 ha) | Vanin's Signal (0.1 km) |
| 55 | 1340 | 92 | 526.2 | 0.09 | 3.4 | no body | Sings-Under-Water (0.1 km) |
| 56 | 85 | 310 | 246.5 | 0.08 | 3.0 | no body | Breathes-Underneath (0.6 km) |
| 57 | 912 | 2701 | 209.1 | 0.08 | 1.5 | pond body.501-1470 (0.1 ha) | Castle Giovesse (0.1 km) |
| 58 | 887 | 2967 | 180.1 | 0.08 | 8.4 | no body | Ashen Tower (0.1 km) |
| 59 | 2069 | 811 | 318.5 | 0.08 | 1.0 | pond body.1144-450 (0.9 ha) | Rim Hermitage (0.2 km) |
| 60 | 5180 | 740 | 247.4 | 0.07 | 4.0 | tarn-upland body.2879-340 (2.7 ha) | The Shut Village (0.2 km) |
| 61 | 755 | 1298 | 303.1 | 0.07 | 10.6 | pond body.462-681 (0.4 ha) | Rufio's Landing (0.2 km) |
| 62 | 719 | 2811 | 150.0 | 0.07 | 1.1 | no body | The Stone Drop (0.1 km) |
| 63 | 5261 | 815 | 256.1 | 0.07 | 13.5 | pool body.2877-449 (0.0 ha) | The Shut Village (0.1 km) |
| 64 | 686 | 2167 | 288.7 | 0.07 | 6.5 | pond body.406-1130 (0.2 ha) | Pass Shelter (0.2 km) |
| 65 | 5676 | 860 | 173.0 | 0.07 | 4.6 | pond body.3044-420 (0.1 ha) | Stands-On-The-Hammock (0.1 km) |
| 66 | 934 | 731 | 453.6 | 0.07 | 3.2 | no body | Ninth Chapel (0.1 km) |
| 67 | 693 | 2106 | 310.8 | 0.07 | 5.1 | pond body.406-1130 (0.2 ha) | Drowned Furrow (0.2 km) |
| 68 | 599 | 3841 | 291.9 | 0.07 | 3.1 | pond body.260-2029 (0.2 ha) | Sour Orchard (0.3 km) |
| 69 | 4716 | 746 | 180.0 | 0.06 | 3.5 | pond body.2641-407 (0.1 ha) | Rimfield (0.1 km) |
| 70 | 959 | 1327 | 349.1 | 0.06 | 2.8 | pond body.462-681 (0.4 ha) | The Sunk Lane (0.1 km) |
| 71 | 1188 | 1434 | 410.1 | 0.06 | 6.0 | pool body.665-761 (0.0 ha) | Licensed Dig (0.2 km) |
| 72 | 291 | 2275 | 327.0 | 0.06 | 5.4 | pond body.101-1182 (0.1 ha) | Drowned Embankment (0.1 km) |
| 73 | 2244 | 151 | 376.9 | 0.06 | 3.3 | tarn-upland body.1178-42 (1.8 ha) | The Delta Byre (0.1 km) |
| 74 | 1572 | 817 | 464.4 | 0.06 | 7.1 | pond body.866-443 (0.1 ha) | Silyanorn Diggings (0.2 km) |
| 75 | 328 | 493 | 352.2 | 0.06 | 3.6 | no body | Breathes-Underneath (0.4 km) |
| 76 | 174 | 917 | 262.6 | 0.05 | 3.4 | pond body.173-485 (0.5 ha) | Onkobra Divers' Yard (0.5 km) |
| 77 | 806 | 2145 | 306.7 | 0.05 | 4.5 | pond body.406-1130 (0.2 ha) | Onkobra Clay Pits (0.1 km) |
| 78 | 6085 | 379 | 74.1 | 0.05 | 8.7 | pond body.3364-188 (0.7 ha) | The Salt Ledge (0.2 km) |
| 79 | 5712 | 511 | 171.1 | 0.05 | 4.3 | no body | Waits-For-The-Promise (0.3 km) |
| 80 | 1212 | 1393 | 411.0 | 0.05 | 4.7 | pool body.665-761 (0.0 ha) | Rockgrove (0.2 km) |
| 81 | 438 | 2565 | 177.7 | 0.05 | 4.1 | pond body.169-1344 (0.2 ha) | The Snowline Cell (0.3 km) |
| 82 | 5557 | 781 | 173.9 | 0.05 | 1.0 | pond body.3044-420 (0.1 ha) | Stands-On-The-Hammock (0.2 km) |
| 83 | 1684 | 1526 | 183.6 | 0.05 | 3.1 | no body | Holds-The-Stone (0.2 km) |
| 84 | 4478 | 378 | 161.7 | 0.05 | 3.2 | no body | Crystalgate (0.1 km) |
| 85 | 476 | 2208 | 404.6 | 0.05 | 5.8 | no body | Drowned Furrow (0.0 km) |
| 86 | 646 | 1794 | 546.9 | 0.05 | 4.7 | no body | Sink Field (0.1 km) |
| 87 | 1106 | 1915 | 426.3 | 0.05 | 4.2 | pond body.541-980 (0.3 ha) | Onkobra Clay Pits (0.4 km) |
| 88 | 676 | 4071 | 261.4 | 0.05 | 3.1 | no body | Sabinus' Claim (0.2 km) |
| 89 | 923 | 2980 | 176.8 | 0.05 | 6.3 | no body | Ashen Tower (0.1 km) |
| 90 | 4827 | 742 | 253.7 | 0.04 | 9.0 | pond body.2641-407 (0.1 ha) | Rimfield (0.2 km) |
| 91 | 926 | 2357 | 267.9 | 0.04 | 0.7 | pond body.472-1322 (0.3 ha) | Onkobra Clay Pits (0.1 km) |
| 92 | 1155 | 3015 | 63.0 | 0.04 | 2.0 | tarn-upland body.635-1651 (1.2 ha) | Gideon (0.2 km) |
| 93 | 5643 | 585 | 155.6 | 0.04 | 2.0 | no body | Stands-On-The-Hammock (0.3 km) |
| 94 | 6210 | 344 | 72.4 | 0.04 | 3.4 | pond body.3364-188 (0.7 ha) | The Salt Ledge (0.1 km) |
| 95 | 824 | 1771 | 491.7 | 0.04 | 9.3 | pond body.471-960 (0.1 ha) | Sink Field (0.2 km) |
| 96 | 177 | 2166 | 305.3 | 0.04 | 6.2 | pond body.78-1125 (0.1 ha) | Drowned Embankment (0.2 km) |
| 97 | 1834 | 1203 | 329.4 | 0.04 | 4.9 | pond body.995-684 (0.1 ha) | Mazzatun (0.2 km) |
| 98 | 4027 | 17 | 146.1 | 0.04 | 5.1 | no body | Last Landing (0.2 km) |
| 99 | 647 | 511 | 376.7 | 0.04 | 6.0 | pool body.372-330 (0.0 ha) | Breathes-Underneath (0.1 km) |
| 100 | 1739 | 755 | 387.2 | 0.04 | 1.5 | tarn-upland body.1002-335 (1.6 ha) | Silyanorn Diggings (0.4 km) |
| 101 | 348 | 1652 | 413.7 | 0.04 | 3.7 | pond body.195-908 (0.1 ha) | Onkobra Divers' Yard (0.3 km) |
| 102 | 1368 | 291 | 511.6 | 0.04 | 4.7 | tarn-upland body.824-179 (1.1 ha) | The Flu Cordon (0.1 km) |
| 103 | 275 | 1428 | 292.2 | 0.04 | 3.1 | tarn-upland body.200-770 (10.8 ha) | Onkobra Divers' Yard (0.1 km) |
| 104 | 1872 | 1522 | 149.7 | 0.04 | 2.0 | pond body.1024-834 (0.5 ha) | Silver Mouth (0.1 km) |
| 105 | 25 | 950 | 219.4 | 0.04 | 5.9 | no body | Onkobra Divers' Yard (0.5 km) |
| 106 | 325 | 2388 | 258.3 | 0.04 | 9.7 | pond body.160-1250 (0.1 ha) | Drowned Embankment (0.2 km) |
| 107 | 190 | 2089 | 328.3 | 0.03 | 7.2 | pond body.61-1075 (0.4 ha) | Drowned Embankment (0.2 km) |

**Tidal delta and deep river corridor.** By the rulebook (§4.1) a delta needs
a whitewater river of major size on a sheltered coast. Today's graph: the
largest sea river (`river.889-484`, 12.7 km², whitewater) is the one delta
candidate (`mouth.form = delta`); every other sea mouth is an estuary funnel.
So the drainage implies **one** delta, not a region-wide "tidal delta" class:
16f applies the delta dressing to that mouth and the corridor classes follow
the graph's band-3 reaches (2.0 km of `horizontal-river`), not a region paint.

## 7. Gates added, and the defect each was shown to fail on

| Gate | Failed on |
|---|---|
| `hydrology_graph check` in `npm test` (repo-standards std 14) | the first derivation: 143 violations (duplicate ids from one-station flickers, 4 rivers ending in sinks, slope classes leaking) — all root-caused and fixed (0058 choices 3, 7) |
| `test_hydrology_graph.py` (10 tests) | each invariant on a corrupted copy of the shipped graph; id stability on a synthetic world derived twice |
| docs prose ratchet (`lint_prose --docs-gate`, std 8) | a hard-hit sentence appended to the style guide: rc 1 naming the file, then reverted |
| `drainageLoops == 0` | the shipped pass (390 loops) fails it |
