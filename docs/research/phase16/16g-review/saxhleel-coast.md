# 16g plot review — `saxhleel-coast` (measured, 2026-09-19)

Read-only measurement pass over the re-solved macro plot. Every number here
was taken on the shipped files with one `worldgen.site_fields.shared_survey`
process; proposals use the review vocabulary only and decide nothing.

## Summary (10 lines)

1. **Region-wide datum mismatch dominates every "clears the water" test.** All
   37 live dots read 13–20 m BELOW their water record's level
   (`heightAboveWaterTableM` between −13.7 and −20.2), and so do all nine province
   anchors (archon −11.75, lilmoth −14.92, gideon −10.18). Province median
   height is −14.4 m against records whose `levelM` is 0.0.
2. The lighthouse terrain promise ("islet clearance −19.99 < 2.0") is that
   mismatch, not a siting fault: **no** islet/headland/cliff-bench candidate
   within 1.5 km of Archon's gate clears the recorded level by ≥2 m (best
   −16.87 m). The clearance gate cannot pass anywhere on this coast.
3. `archon-lighthouse` is homeless (soleBlocker culture clump 1386) and kept
   its HEAD dot (moved 0.0 m): a lagoon cell, shore −7.3 m (in the water),
   measured depth 0.96 m, record depth 6.53 m, 32.3 m off the Lilmoth lane.
4. **Its quest sightline fails**: lighthouse ↔ `padomaic-wrecker-beach`
   margin −1.502 m (blocked at t = 0.88), both ways. `outer-reef` (+1.502)
   and `gap-reef` (+0.962) pass.
5. `route.boat.archon-estuary` **does not exist** in `waterways.json` (six
   lanes; only `lilmoth-archon` and `archon-thorn` touch Archon). Archon's
   `travelServiceEdges` names it. Two `reachedVia` rows are dangling.
6. **Prose/record water mismatch on 17 live records**: prose naming the
   estuary/coast/sea sits on `plotFacts.water.kind` `swamp` or
   `marsh-fringe`, including `archon` itself (swamp, level 3.76).
7. **10 of 12 live dive/underwater records have 0.00 m water at the dot**;
   only `tide-street-village` (2.52 m) and `mangrove-air-pocket` (1.08 m)
   meet the ≥1.0 m dive floor. No live wreck exists (all deferred).
8. **A7 city-hinterland breach**: a D4 lair (`jungle-root-hollow`, 347 m) and
   four D3 records sit inside Archon's 1.2 km hinterland; five records sit
   INSIDE the city footprint polygon.
9. Ferry: the only water near Archon deep enough for a crossing is the lagoon
   `body.2834-2585` ("Drops-Away-Quickly", 5.16 m at 287 m from the centre);
   the `archon-thorn` ocean run is 0.60 m (canoe). Both ferry stages are
   `positionM: null`.
10. `root-node.east-estuary` [4424.1, 3465.5] is **1333 m** from
    `east-estuary-rootworm-station` and 1245 m from Archon.

Zone density line (16g ledger §2): saxhleel-coast moved 36 records, median
445.0 m, p90 1266.7 m, max 1800.2 m — the smallest median of the eight
registers bar pirate-freeholds.

## 0. The datum finding (read before any row below)

| probe | value |
|---|---|
| province height grid min / median / max | −106.35 / **−14.45** / 653.95 m |
| all nine anchors `heightAboveWaterTableM` | −9.21 to −18.12 |
| `archon` dot | elev −16.00, water record `body.2727-2523` swamp, levelM 3.76 |
| `archon-lighthouse` dot | elev −19.98, `water_at` = lagoon levelM 0.0, depth 0.96 |
| best islet within 1.5 km of the gate | `site.scour.mangrove-forest.islet-047`, elev −16.87 |

`water_at` returns **null (dry)** on dots 17 m below an ocean/lagoon level of
0.0, so the water compile does not believe the ground is flooded: the height
raster this survey reads and the water records are on different datums. Any
"ground clears the recorded level by ≥ N m" promise is therefore untestable
today. *Proposal: none of the record-level remedies below can fix it — it is a
compile/datum question for the chunk owner.*

## 1. Records that moved > 150 m (all 36) and the listed records

`moved` is against `git show HEAD:world/sources/catalogue/places-saxhleel-coast.json`.
`DT/sv` = record `dangerTier` vs `survey.danger` band. `poly` = distance to
Archon's `footprintPolygon` (negative = inside).

| id | type | moved m | DT/sv | water kind · dist | depth at dot | nearest neighbour | poly m | route m | measured fault |
|---|---|---|---|---|---|---|---|---|---|
| `cantemir-headland` | cantemiric-velothi-site | 1800.2 | D4/4 | swamp · 16.5 | 0.00 | shadowscale 192 | 312.5 | 575.4 | prose "shore" on a swamp at levelM 20.96; D4 in Archon's 1.2 km hinterland (540 m) |
| `shell-beast-shallows` | shell-beast-ground | 1760.9 | D3/**0** | ocean · 0.0 | 0.36 | tide-run-delta 71.4 | 491.5 | 633.7 | A7 danger gap 3 |
| `oliis-coast-lay-by` | smugglers-lay-by | 1401.9 | D2/3 | ocean · 7.8 | 0.00 | keepers-lodge 179 | 664.0 | 900.7 | A8: prose names Archon/the lane; boundTo Archon 891 m (≤900 passes); 900.7 m from any route |
| `wall-hist-village` | submerged-xanmeer | 1277.6 | D3/3 | marsh-fringe · 33.4 | 0.00 | keepers-lodge 105.6 | 597.7 | 912.5 | drowned village on dry ground (deep-dive access, 0 m water) |
| `sealed-xanmeer-wall` | climbable-ruin-roof | 1255.7 | D4/4 | swamp · 34.7 | 0.00 | wall-hist-village 131.7 | 648.9 | 996.5 | — |
| `archon-glowgill-byre` | guar-byre | 1250.4 | D2/2 | ocean · 15.5 | 0.00 | rootworm-station 197.9 | 186.1 | 162.9 | `underwater-entry` with 0.00 m water |
| `owing-hiring-camp` | owing-eviction-camp | 1149.8 | D3/3 | ocean · 5.5 | 0.84 | pearl-lots 194 | 354.5 | 331.2 | — |
| `estuary-keepers-lodge` | keepers-lodge | 1137.2 | D3/3 | marsh-fringe · 39.9 | 0.00 | wall-hist-village 105.6 | 610.4 | 898.3 | boundTo lighthouse 736 m OK; "channel/estuary" prose on a marsh fringe |
| `lagoon-submerged-xanmeer` | submerged-xanmeer | 991.2 | D4/4 | swamp · 5.5 | 0.00 | wild-hist-sleeper 111.1 | 660.0 | 383.3 | **quest 25 §212**: prose says six metres of water over the top terrace; `water_at` is null (dry) and the neighbouring body level is 1.46 m, so the tower has no water to clear |
| `gap-reef` | reef | 867.6 | D3/3 | ocean · 12.3 | 0.00 | tide-run-delta 87.9 | 581.5 | 702.0 | reef with `underwater-entry`, 0.00 m water; sightline to lighthouse OK (+0.96) |
| `coast-hist-less-refuge` | hist-less-refuge | 812.1 | D3/4 | swamp · **157.1** | 0.00 | archon **90.3** | **−137.1** | 261.1 | A6/A7: a D3 refuge 90 m from the city centre and inside its polygon |
| `banner-stack` | sea-stack | 791.6 | D3/4 | swamp · 5.5 | 0.00 | lagoon-xanmeer 220.5 | 464.1 | 354.9 | "seaward" prose on a swamp at levelM 1.34 |
| `archon-shadowscale-sanctuary` | shadowscale-ground | 665.7 | D3/4 | swamp · 29.5 | 0.00 | root-hollow 98.9 | 120.6 | 411.8 | boundTo Archon 348 m ≤400 OK, but its prose claims the nearest boat lane is a third of a kilometre away, against 593.5 m measured; A7 hinterland |
| `archon-bonded-row` | bonded-warehouse | 578.0 | D1/3 | swamp · 12.3 | 0.00 | archon 222.4 | −3.0 | 364.2 | "harbour/quay" prose, 315 m from the Lilmoth lane |
| `jungle-root-hollow` | root-hollow-gallery | 502.7 | D4/4 | swamp · 50.6 | 0.00 | shadowscale 98.9 | 117.2 | 473.1 | **A7: D4 lair 347 m from the city centre** (hinterland ≤1.2 km) |
| `contested-bank` | fishing-bank | 475.1 | D2/2 | ocean · 11.0 | 0.00 | harbour-hist 79.5 | 37.0 | 46.8 | boundTo quay-tradehouse 106 m ≤600 OK; deep-dive on 0 m water |
| `quay-tradehouse` | tradehouse | 467.9 | D2/2 | ocean · 17.3 | 0.00 | **lighthouse 22.0** | 71.1 | 151.6 | A6: 22 m to the lighthouse, a footprint-sum breach (45 + 45) |
| `umbriel-shore-memorial` | mass-grave-memorial | 458.4 | D2/2 | ocean · 5.5 | 0.00 | quarantine-village 289.2 | 907.3 | 771.3 | quests 20 §190/§206 puts the province's Umbriel memorial at Deepmire; this record is the UW faction's coast anchor (25 §163) — doc tension, not a measurement fault |
| `outer-reef` | reef | 431.6 | D3/3 | ocean · 11.0 | 0.00 | quarantine-village 133.4 | 620.0 | 624.3 | `underwater-entry`/argonian-depth on 0 m water |
| `padomaic-wrecker-beach` | wrecker-beach | 371.5 | D3/3 | horizontal-tidal · 12.3 | 0.00 | keepers-lodge 112.5 | 710.7 | **1007.5** | **quest 25 §201 broken**: sightline to the lighthouse margin −1.502 m |
| `mangrove-air-pocket` | air-pocket-grotto | 357.1 | D3/4 | swamp · 0.0 | 1.08 (rec 2.72) | bubble-spire 115.6 | 586.2 | 246.6 | dive floor met |
| `seafalls` | head-of-navigation | 342.1 | D2/3 | swamp · 5.5 | 0.00 | lighthouse 154.8 | 183.9 | 326.9 | head of navigation with no navigable record under it |
| `deep-bank` | fishing-bank | 310.4 | D3/3 | ocean · 29.5 | 0.00 | pearl-lots 263.8 | 804.0 | 487.6 | argonian-depth on 0 m water |
| `tide-run-delta` | tide-timed-run | 307.1 | D3/3 | ocean · 7.8 | 0.00 | shell-beast 71.4 | 556.6 | 705.0 | A6: 71 m to `shell-beast-shallows` (30 + 30) |
| `quarantine-village-lagoon` | quarantine-village | 305.2 | D2/**0** | ocean · 0.0 | 0.24 | outer-reef 133.4 | 622.8 | 568.9 | A7 gap 2; boundTo Archon 847 ≤1800 OK |
| `archon-shipyard` | shipyard | 277.6 | D1/3 | swamp · 79.8 | 0.00 | hist-less-refuge 148.1 | −37.7 | 135.9 | A7 gap 2 on a lived-in class (±1); 392 m from the nearest lane for a shipyard |
| `pearl-lots` | pearl-and-shell-bed | 253.1 | D1/**0** | ocean · 0.0 | 0.36 (rec 106.36) | quarantine-village 142.2 | 546.3 | 426.9 | deep-dive on 0.36 m |
| `tide-street-village` | drowned-village | 253.0 | D3/4 | swamp · 5.5 | **2.52** | root-hollow 179.6 | 258.6 | 648.6 | drowned-village correctly wet |
| `archon` | legal-harbour-city | 247.2 | D0/2 | **swamp** · 71.5 | 0.00 | hist-less-refuge 90.3 | — | 187.3 | prose: estuary mouth / deep water at the quay line; record is a swamp at levelM 3.76, 245.6 m from both lanes |
| `mangrove-reef` | reef | 241.5 | D2/3 | swamp · 5.5 | 0.00 | tide-street-village 221.9 | 218.3 | 601.9 | a reef on a swamp record |
| `portdun-mont` | cliff-shelf-village | 231.8 | D2/3 | ocean · 19.8 | 0.00 | dusk-bird-colony 179.7 | 471.6 | 690.3 | ferry partner of Archon (`ferry:archon-portdun-mont`) 690 m off any route |
| `archon-harbour-hist` | hero-hist-grove | 229.8 | D0/2 | ocean · 16.5 | 0.00 | contested-bank 79.5 | −37.8 | 79.9 | hero Hist 5/10; inside the polygon (boundTo Archon 181 ≤400, may abut) |
| `east-estuary-rootworm-station` | rootworm-station | 225.2 | D2/2 | swamp · 5.5 | 0.72 | harbour-hist 110.2 | 8.2 | 22.0 | boundTo Archon 233 ≤400 OK; 50.5 m from the Thorn lane (step off a boat — holds); 1333 m from `root-node.east-estuary` |
| `archon-sacked-quarter` | sacked-colonial-quarter | 193.9 | D2/2 | swamp · 35.1 | 0.00 | archon 128.9 | −97.0 | 80.0 | inside the polygon (bound 300, may abut) |
| `terrace-village-ridge` | subsidence-hamlet | 189.4 | D3/4 | swamp · 132.6 | 0.00 | shipyard 162.1 | 108.6 | 232.3 | A7: D3 at 334 m from the centre |
| `dusk-bird-colony` | bird-colony | 17.3 | D2/3 | ocean · 5.5 | 0.00 | shell-beast 97.6 | 398.9 | 562.2 | — |
| `archon-lighthouse` | lighthouse | **0.0 (homeless)** | D2/2 | lagoon · 0.0 | 0.96 (rec 6.53) | quay-tradehouse 22.0 | 85.3 | 172.8 | homeless; in the water (shore −7.3); A6 22 m to the tradehouse; §20e sightline to the beach fails |

Deferred rows in the brief's list: `mangrove-wreck`, `jungle-ferry-stage`,
`estuary-ferry-stage` carry `positionM: null` — nothing to measure.

## 2. The lighthouse: every candidate within 1.5 km of the gate

Landform islet/headland/cliff-bench, `world/sources/sites/candidate-sites.json`.
`clear` = site elevation − water level at the site. **None reaches +2.0 m.**

| site | landform | worldM | elev m | water level | clear m | gate m | nearest lane | LOS→beach margin |
|---|---|---|---|---|---|---|---|---|
| `site.scour.mangrove-forest.islet-047` | islet | 5294.3, 4449.9 | −16.87 | 0.00 | −16.87 | 237.2 | archon-thorn 42.7 | −1.791 |
| `site.scour.tropical-jungle.islet-029` | islet | 4499.2, 4055.1 | −16.18 | 1.34 | −17.52 | 889.4 | archon-thorn 885.5 | −21.126 |
| `site.scour.tropical-jungle.islet-041` | islet | 4367.6, 3698.6 | −16.61 | 1.54 | −18.15 | 1237.8 | archon-thorn 1179.3 | −20.954 |
| `site.scour.tropical-jungle.islet-048` | islet | 4477.3, 3835.7 | −16.84 | 1.46 | −18.30 | 1062.3 | archon-thorn 1054.7 | −21.969 |
| `site.scour.tropical-jungle.islet-011` | islet | 4773.4, 3857.7 | −15.55 | 4.01 | −19.56 | 880.3 | archon-thorn 770.4 | −12.331 |

No headland and no cliff-bench candidate exists within 1.5 km of the gate.
`islet-047` is already taken by `archon-glowgill-byre` (region-relaxed).

Sightlines from the HEAD lighthouse dot [5122.3, 4822.8], eye 8.0 m:

| to | margin m | clear |
|---|---|---|
| `padomaic-wrecker-beach` (847 m) | **−1.502** | no (both directions) |
| `outer-reef` (867 m) | +1.502 | yes |
| `gap-reef` (542 m) | +0.962 | yes |
| nearest point of `route.boat.lilmoth-archon` (32.3 m — the legal channel) | +2.691 | yes |
| nearest lagoon gap: the lighthouse **sits in** lagoon `body.2834-2585` ("Drops-Away-Quickly", 1724 m², max 6.53 m, joined to the sea) | — | — |

Quest 25 §200 ("see both the legal channel and the smugglers' gap from one
spot") is satisfied for the channel and the reefs; §201 (the beach in sight)
is not.

## 3. Archon's harbour station, the ferry stages, the root node

**(a) Live records within 600 m of `cityLayout.centre` [4917.0, 4609.0] at a
lane's water edge (lane ≤60 m, water kind reach/lagoon/ocean):**

| id | m from centre | lane · m | water kind | depth at dot | record depth |
|---|---|---|---|---|---|
| `archon-lighthouse` | 296.4 | lilmoth-archon 32.3 | lagoon | 0.96 | 6.53 |
| `quay-tradehouse` | 281.0 | lilmoth-archon 32.3 | ocean | 0.00 | 0.00 |
| `east-estuary-rootworm-station` | 233.3 | archon-thorn 50.5 | swamp | 0.72 | 0.00 |
| `contested-bank` | 260.8 | lilmoth-archon 25.4 | ocean | 0.00 | 0.00 |
| `archon-glowgill-byre` | 409.5 | archon-thorn 42.7 | ocean | 0.00 | 0.00 |
| `seafalls` | 411.4 | lilmoth-archon 52.2 | swamp | 0.00 | 0.00 |

The station record `station.saxhleel.archon` is at [5161.5, 4645.3] — the gate,
not the centre, 245.6 m from both lanes.

**(b) Ferry water near Archon.** Distinct water records touched by lanes
within 2.5 km of the centre: `body.2834-2585` lagoon **5.16 m** at
[5154.5, 4770.7] (287 m from the centre, on `lilmoth-archon`) and `body.ocean`
**0.60 m** at [5176.4, 4633.6] (261 m, on `archon-thorn`). So by B5 a
keel berth (≥3.0 m) exists only in the lagoon; the Thorn run is canoe water.
There is **no** `route.boat.archon-estuary` lane, so "a ferry crossing on the
estuary lane" has no lane beneath it. Live hosts available for a stage:
`quay-tradehouse` (32.3 m, lagoon side), `east-estuary-rootworm-station`
(50.5 m, 0.72 m canoe), `seafalls` (52.2 m).

**(c) Root node.** `root-node.east-estuary` [4424.1, 3465.5] (status
`placeholder`) → `east-estuary-rootworm-station` **1333.1 m**,
`archon-harbour-hist` 1378.5 m, `archon` 1245.2 m. TG06 stages at the
east-estuary end, so the node and the station are the same facility 1.3 km
apart.

**(d) Pairs within 150 m.** 21 pairs; only two name each other in `relations`
(`archon`↔`archon-sacked-quarter` 128.9 m, `archon`↔`coast-hist-less-refuge`
90.3 m) and **no** pair shares `proseRefs` (no live record in this register
carries any). `boundTo` distances, all inside their `maxM`:
bonded-row 222/350 · harbour-hist 181/400 · sacked-quarter 129/300 ·
shadowscale 348/400 · shipyard 190/450 · hist-less-refuge 90/900 ·
contested-bank→quay-tradehouse 106/600 · rootworm-station 233/400 ·
keepers-lodge→lighthouse 736/900 · gap-reef→lighthouse 542/1200 ·
mangrove-reef→tide-street-village 222/500 · lay-by 891/900 ·
quarantine-village 847/1800.

## 4. Proposals (vocabulary only; nothing decided)

| record | remedy | numbers |
|---|---|---|
| `archon-lighthouse` | `pin-by-siting` | `scourSiteIds: ["site.scour.mangrove-forest.islet-047"]` (237 m from the gate, 42.7 m off a lane) **and** drop the ≥2 m clearance promise until the datum question is settled; or `meso-move` ≤150 m south-east to regain the beach sightline (the blockage is at t = 0.88, i.e. on the beach's own rise — a 1.5 m tower-height increase to eye 9.6 m also clears it) |
| `padomaic-wrecker-beach` | `meso-move` | target the 12.3 m-distant tidal reach edge at ~[4615, 5478]; the failure is 1.5 m of ground at t ≈ 0.88 |
| `quay-tradehouse` / `archon-lighthouse` (22.0 m) | `pin-by-siting` or `merge` | A6 needs 90 m; `proximity.mayAbut` between tradehouse and lighthouse, or move the tradehouse 70 m toward the gate |
| `coast-hist-less-refuge` | `pin-by-siting` | `proximity.minFromClassM {city: 600}`; it is 90 m from Archon's centre and 137 m inside the polygon, against its own "refuge" prose |
| `jungle-root-hollow` | `pin-by-siting` | A7 hinterland: `minFromClassM {city: 1200}` (now 347 m) |
| `cantemir-headland`, `terrace-village-ridge`, `archon-shadowscale-sanctuary` | `pin-by-siting` | same hinterland floor; shadowscale's prose also claims a 0.33 km lane distance against 593.5 m measured (or `prose-rewrite` that sentence) |
| `archon`, `archon-shipyard`, `archon-bonded-row`, `banner-stack`, `mangrove-reef`, `seafalls`, `estuary-keepers-lodge` | `prose-rewrite` or `pin-by-siting` | their prose names estuary/sea/quay/reef water while `plotFacts.water.kind` is swamp/marsh-fringe; Archon's own record is 245.6 m from either lane with a swamp at levelM 3.76 |
| `lagoon-submerged-xanmeer` | `pin-by-siting` | quest 25 §212 needs standing water over the terraces: the nearest body is `body.2458-2102` at levelM 1.46, 5.5 m away; the dot itself reads 0.00 m deep |
| the ten dry dive records (`gap-reef`, `outer-reef`, `mangrove-reef`, `contested-bank`, `deep-bank`, `pearl-lots`, `wall-hist-village`, `archon-glowgill-byre`, `oliis-coast-lay-by`, `quarantine-village-lagoon`) | `pin-by-siting` or `re-type` | dive floor 1.0 m / hull 1.5 m; all read 0.00–0.36 m at the dot |
| `shell-beast-shallows`, `pearl-lots`, `quarantine-village-lagoon` | `prose-rewrite` of `dangerTier` (A7) | D3/D1/D2 against survey band 0 |
| `estuary-ferry-stage`, `jungle-ferry-stage` | `cut` or `pin-by-siting` | no estuary lane exists; the only ≥1.2 m water near Archon is the lagoon at [5154.5, 4770.7] |
| Archon's `travelServiceEdges` / `reachedVia` | `prose-rewrite` (record edit) | `route.boat.archon-estuary` is not in `waterways.json`; `route.boat.lilmoth-archon` and `route.road.archon-gideon` are flagged dangling by the solver |
| `root-node.east-estuary` vs `east-estuary-rootworm-station` | `merge` | 1333 m apart for one facility |
| `umbriel-shore-memorial` | `prose-rewrite` | reconcile with quests 20 §190/§206 (the province's Umbriel memorial is Deepmire) |
