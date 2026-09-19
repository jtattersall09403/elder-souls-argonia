# 16g review — imperial-penal-south (measured, not decided)

Measured 2026-09-19 on the shipped files (`places-imperial-penal-south.json`,
`macro-plot.json`, `hydrology-graph.json`, `routes.json`, `waterways.json`,
`travel-services.json`) with one `shared_survey()` process. `positionM` is
[east, south] metres. No file outside this one was touched.

## Summary (10 lines)

1. 44 live records (73 total, 29 cut/deferred); **37 moved > 150 m**, max 1638.8 m
   (`ledgered-blackguards`); only 3 stood still (the two homeless + `lake-ferry-stage`).
2. **The lake broke away from the lake records.** Blackrose Lake (`body.1290-3508`)
   touches exactly ONE live dot (`intact-fort`, 0 m). The city is 109 m off it; the
   nine `lake-*`/"in the lake" records sit 121–832 m away and their `plotFacts.water`
   names a different body in every case.
3. **Eight records' nearest water is `body.ocean`** (`longmont`, `lake-boardwalk-village`,
   `manned-toll-tower`, `rockspring`, `rose-supply-town`, `plague-cordon`,
   `prison-born-refuge`, `basin-sinkhole`, `murkwood-verge`, `rose-bone-waystation`)
   while their prose says lake, feeder channel or levee. `manned-toll-tower` stands on
   106.36 m of recorded ocean depth.
4. **Six compass claims are now wrong**: `longmont` and `flu-quarantine-village`
   (said west/north-west of the city, now east/south-east), `murkwood-verge`
   (north-east, now south-west), `vampiric-cloud-ground` (north, now due west),
   `basin-sinkhole` (western feeder country, now the far east), `marsh-giant-ground-basin`
   (north-east, now north-west).
5. **Two hard constraints fail on their own number**: `rose-outworks`
   ("300–700 m outside the prison") is 98.2 m from it; `lilmothiit-quarry`
   ("within 400 m of Blackrose") is 479 m.
6. **A6 footprint breaches (unbound pairs)**: `akaviri-works`/`rebellion-earthworks`
   −72.7 m, `plague-cordon`/`rose-supply-town` −136.6 m, `bramman-head`/`voriplasm-vault`
   −45.6 m, `blackrose`/`necromantic-dig` −107.3 m.
7. **A7**: Blackrose's 1.2 km hinterland holds 43 hostile or D4+ records, five of them
   D4 lairs inside 600 m and `necromantic-dig` (D4, hostile camp) 168 m from the centre,
   inside the ≤350 m city edge. Two settlements sit two danger bands off their ground.
8. **A8**: seven network-role records are beyond 220 m from both a route and a lane;
   `travel-services.json` runs two lanes (`route.boat.blackrose-lake-ferry`,
   `route.boat.soulrest-blackrose`) that **do not exist in `waterways.json`**, and
   `station.imperial-penal-south.lake-boardwalk-village` is 561 m from its place
   (it sits on `wisp-lure-basin`'s current dot).
9. **Homelessness is not a footprint problem**: 5673 free in-zone cells satisfy
   `akaviri-works`' `maxFrom works 300`, 4425 satisfy `necromantic-dig`'s
   `maxFrom ruin 500`. Both records' catalogue `proximity` block is `null` while the
   solver reads the typed table — the block is not written back.
10. Zone density 44 live / 0.934 km² = **47/km²**; **95.2 % of that land is D0–D3**
    (D2 50.3 %, D3 40.0 %) and **4.8 % is D4–D5**.

## 1. Moves over 150 m (all 37)

| id | type | moved m |
|---|---|---|
| `ledgered-blackguards` | blackguard-hideout | 1638.8 |
| `plague-cordon` | plague-cordon-line | 1265.6 |
| `wisp-lure-basin` | wisp-lure | 1237.6 |
| `rose-supply-town` | garrison-town | 1214.3 |
| `manned-toll-tower` | toll-tower | 1175.6 |
| `prison-born-refuge` | hist-less-refuge | 1155.4 |
| `natural-dive-shaft` | dive-shaft | 1152.8 |
| `longmont` | stilt-village | 1096.6 |
| `lake-divers-yard` | salvage-divers-yard | 1093.7 |
| `murkwood-verge` | murkwood-verge | 957.2 |
| `lake-submerged-xanmeer` | submerged-xanmeer | 952.0 |
| `rebellion-earthworks` | siege-earthworks | 899.3 |
| `drowned-gallery` | tunnel-rat-gallery | 848.7 |
| `basin-sinkhole` | sinkhole-mouth | 844.6 |
| `flu-quarantine-village` | quarantine-village | 799.8 |
| `blasphemer-urn-vault` | urn-vault | 766.4 |
| `vampiric-cloud-ground` | battlefield-ground | 738.2 |
| `flu-mass-grave` | mass-grave-memorial | 659.1 |
| `voriplasm-vault` | voriplasm-chamber | 586.7 |
| `lake-boardwalk-village` | boardwalk-village | 563.7 |
| `lake-drowned-village` | drowned-village | 482.4 |
| `scandal-holding-pit` | holding-pit | 476.1 |
| `rose-outworks` | holding-pit | 457.8 |
| `intact-fort` | abandoned-fort | 391.8 |
| `blackrose-prison` | reoccupied-prison | 373.1 |
| `saltrice-village` | drowned-village | 314.2 |
| `blackrose` | island-confluence-city | 309.7 |
| `three-gate-toll` | toll-road-town | 307.3 |
| `blackrose-drowned-hist` | drowned-hist | 302.8 |
| `marsh-giant-ground-basin` | marsh-giant-ground | 287.8 |
| `kothringi-ruin-basin` | kothringi-ruin | 264.1 |
| `rose-flooded-passage` | flooded-passage | 242.8 |
| `drawdown-flat` | drawdown-flat | 237.4 |
| `rockspring` | flood-high-hamlet | 225.0 |
| `bramman-head` | head-of-navigation | 208.4 |
| `feeder-portage` | portage-slipway | 178.3 |
| `lilmothiit-quarry` | lilmothiit-substratum | 169.3 |

Under 150 m: `chainbreaker-shelter` 147.7, `rose-bone-waystation` 123.8,
`cordon-cellars` 91.6, `west-market-town` 82.2, `akaviri-works` / `necromantic-dig` /
`lake-ferry-stage` 0.0.

## 2. Failing rows (one per record)

Columns: id · type · moved m · what fails, with the measurement. `lake` = metres to
`body.1290-3508`'s cell extent; `bram` = metres to `river.292-1189`'s reach cells;
`road` / `lane` = nearest `routes.json` / `waterways.json` geometry.

| id · type · moved | measured failure |
|---|---|
| `blackrose` island-confluence-city 309.7 | (1) prose "built **in a lake** where three rivers converge", constraint "island in standing water": lake 109.0 m away — > 150 m for an "in" claim. (2) `plotFacts.water` = `body.1151-3381` **marsh-fringe** 7.8 m, not lake; depth at the dot 0.00 m, max within 150 m 3.70 m. (3) nearest neighbour `necromantic-dig` 167.7 m vs footprints 230+45 = **−107.3 m**; A7 city-edge (≤350 m) holds a hostile D4 camp. (5) road 32.0 m ✓, lane 295.0 m. (8) 3 records within 300 m. |
| `necromantic-dig` dig-camp 0.0 (HOMELESS) | (1) "four hundred metres from the Rose's foundations": 580.4 m to `blackrose-prison`; `boundTo maxM 450` breached by 130.4 m and `line_of_sight` **false**. (3) 167.7 m from `blackrose` = −107.3 m footprint; typed `maxFrom ruin 500` is satisfied here (nearest ruin ≤500) but the record is homeless on culture-clump 1081 / separation 2 / score 9 (`macro-plot.json`). Catalogue `proximity` is `null`. (4) D4 on band 3 (tol 2 ✓). (5) road 131.7 m ✓. |
| `akaviri-works` second-empire-works 0.0 (HOMELESS) | (3) typed `maxFrom works 300` fails at the current dot: nearest `works` 754 m. 12.3 m from `rebellion-earthworks` (footprints 45+40) = **−72.7 m**; 85.6 m from `blackrose-drowned-hist` = −0.6 m. `boundTo lilmothiit-quarry` 105.9 m ≤ 700 ✓ LOS true. (1) "on the quarry road between the Robbed City and the Rose": road 94.4 m ✓, 383 m to `blackrose`. (2) water `body.973-3292` marsh-fringe 0.0 m, dot depth 4.78 m — a dry stone-handling yard standing in 4.8 m of recorded water. Catalogue `proximity` `null`. |
| `rose-outworks` holding-pit 457.8 | (1) hard constraint "on the Rose causeway approach, **300–700 m outside the prison**": measured **98.2 m** to `blackrose-prison` — fails the floor by 201.8 m. (5) road 439.3 m, lane 441.4 m — both > 220 m for a causeway-approach role. (8) 12 records within 300 m, the densest dot in the zone. |
| `lilmothiit-quarry` lilmothiit-substratum 169.3 | (1) hard constraint "**within 400 m of Blackrose** — the city stands on it": measured **479.0 m**. (2) water swamp 50.6 m, dot depth 0.0 ✓ for an exposed substratum. |
| `blackrose-drowned-hist` drowned-hist 302.8 | (1) "Blackrose's Hist stands **in the lake**… it grew on the island's old shore": lake 496.3 m, `blackrose` 391 m. (2) water `body.973-3292` marsh-fringe, not lake. Prose "**six metres** of water over its crown" vs recorded depth **4.78 m** at the dot (7.75 m max within 150 m); `underwaterAccess: shallow-dive` ≥1.0 ✓. |
| `drowned-gallery` tunnel-rat-gallery 848.7 | (1) quests 25 §20e: "under the levee toward the Rose, head shaft **in the lake bed**": lake 203.2 m. (2) water marsh-fringe `body.1183-3666`. (3) `boundTo blackrose-prison` 66.0 m ≤ 450 ✓ LOS true (shared ground, smaller radius clears). Dive depth 1.93 m ≥ 1.0 ✓. (5) road 355.2 m, lane 396.0 m. |
| `lake-submerged-xanmeer` submerged-xanmeer 952.0 | (1) "on the **lake's** old floor": lake 602.3 m; water is `body.877-3568` **lagoon**. (2) prose "**eighteen metres down**, terraces to within six metres of the surface" vs recorded depth **3.32 m** — the record cannot be dived as written. |
| `lake-drowned-village` drowned-village 482.4 | (1) "the **lake** level rose": lake 412.3 m; water `body.1209-3032` **swamp**. (2) "five to eight metres of clear cold **lake** water" vs 7.75 m swamp depth — depth ✓, identity wrong. (5) road 233.4 m, lane 251.5 m. |
| `lake-boardwalk-village` boardwalk-village 563.7 | (1) "a boardwalk out from the shore **into the lake**": lake 343.2 m. (2) `plotFacts.water` = **`body.ocean`** 5.5 m, level 0.0. (4) D1 on **band 3** ground, lived-in tolerance 1 → **A7 breach**. (5) lane 90.1 m ✓, road 274.8 m. |
| `longmont` stilt-village 1096.6 | (1) "Blackrose's **north-western** neighbour… the lake's north-west shore": the dot [2700.6, 6829.7] is **south-east** of the city [2123.0, 6215.0], 843 m away; lake 352.7 m. (2) water **`body.ocean`** 49.7 m, dot depth 0.0 vs "poleable all year" (canoe 0.6 m, B5). (3) `prison-born-refuge` is `boundTo` it at 89.3 m ✓. (5) road 482.1 m, lane 287.9 m — both > 220 m for "last stop before the city's toll gates". |
| `manned-toll-tower` toll-tower 1175.6 | (1) "the **western channel** where the feeder enters the lake… the channel passes **within thirty metres**": nearest water is **`body.ocean`** at 0.0 m with recorded depth **106.36 m**; lake 461.0 m. (5) lane 134.3 m, road 592.7 m — a hull-counting tower is 134 m off any lane. (4) D1 on band 0 ✓. |
| `rockspring` flood-high-hamlet 225.0 | (1) "Blackrose's north-western neighbour, on a natural levee **on the western feeder**": water is **`body.ocean`** 19.8 m; Bramman 105.0 m, lake 580.3 m. (3) `boundTo bramman-head` 342.0 m ≤ 400 ✓ LOS true. (5) road 327.4 m. |
| `bramman-head` head-of-navigation 208.4 | (1) "**Bramman's** water meets the **Blackrose lakes** here": Bramman 299.0 m, lake 324.0 m — both > 150 m for a confluence claim. (2) water marsh-fringe 76.4 m. (6) "just enough depth for a laden hull": depth at the dot **0.00 m**; the only deep water within 150 m is the 106.36 m ocean cell — B5 small-draft 1.2 m is not met on the record's own body. (3) 49.4 m from `voriplasm-vault` vs 65+30 = **−45.6 m**. (5) road 423.4 m, lane 501.3 m. |
| `west-market-town` inland-market-town 82.2 | (1) "where the eastern feeder… meets the **lake system**": lake 236.9 m. (2) water **mudflat** `body.1496-3444`, level 0.54 m. (6) "enough water for laden hulls in every season but the driest": depth at the dot 0.00 m on a mudflat — B5 small-draft 1.2 m unmet. (5) road 3.9 m ✓, lane 11.7 m ✓. |
| `three-gate-toll` toll-road-town 307.3 | (1) "the confluence of the three western waters… a hull must come past the **quay**": Bramman 186.3 m, lake 832.6 m. (4) D1 on **band 3** → **A7 breach** (tolerance 1). (5) road 594.1 m, lane 633.3 m — a toll town off both networks. (6) depth at the dot 0.00 m, max within 150 m 3.93 m. |
| `flu-quarantine-village` quarantine-village 799.8 | (1) "on the **Lake road west of the city**, at the last narrows before the lake": the dot [2428.6, 6184.8] is **east** of Blackrose; lake 106.6 m ✓. (3) `boundTo blackrose` 307.1 m ≤ 800 ✓ LOS true. (5) road 149.0 m ✓, lane 86.1 m. |
| `murkwood-verge` murkwood-verge 957.2 | (1) "**north-east of Blackrose**, off every road": the dot [1708.1, 6610.4] is **south-west**, 573 m away. (2) water **`body.ocean`** 11.0 m vs "deep marsh, never firm lowland or coast". (4) D5 on band 3, road 548.0 m ✓ (D5_MIN_ROUTE 200 m). |
| `vampiric-cloud-ground` battlefield-ground 738.2 | (1) "the open ground **north of the city**": the dot [1609.4, 6215.6] is **due west**, 514 m. (2) water `body.930-3449` **lagoon** 61.3 m vs "where an army could deploy". (5) road 233.0 m. |
| `basin-sinkhole` sinkhole-mouth 844.6 | (1) "a collapse in the **western feeder country**": the dot [2892.6, 6758.4] is the zone's **south-east** corner, 942 m from the city. (2) constraint "standing water at the base" vs `body.ocean` 19.8 m, depth 0.00 m. (5) road 490.8 m. |
| `marsh-giant-ground-basin` marsh-giant-ground 287.8 | (1) "the **north-east** marsh, on the Murkwood side of the lake": the dot [1560.1, 5809.8] is **north-west**; lake 801.5 m. (3) 153.5 m from `necropolis-village-murkmire` vs 30+45 ✓. (4) D4 on band 4 ✓. |
| `rose-supply-town` garrison-town 1214.3 | (1) "**on the causeway road** at the last firm ground": road **726.7 m** (A8 fail), lane 77.7 m. (2) water **`body.ocean`** 19.8 m vs "a barge landing". (3) 33.4 m from `plague-cordon` vs 140+30 = **−136.6 m**. (4) D2 on band 3 ✓. |
| `rose-bone-waystation` bone-repatriation-waystation 123.8 | (1) "a station **on the causeway road**": road **705.3 m** (A8 fail), lane 282.4 m. (2) water **`body.ocean`** 66.3 m. (8) 5 records within 300 m. |
| `plague-cordon` plague-cordon-line 1265.6 | (1) "from the hills **to the water**, six kilometres of stone": water `body.ocean` 29.5 m ✓ but the line is now 1277 m from Blackrose, whose cordon it is. (3) −136.6 m against `rose-supply-town`. (5) road 736.3 m, lane 104.7 m. |
| `prison-born-refuge` hist-less-refuge 1155.4 | (3) `boundTo longmont` 89.3 m ≤ 600 ✓ LOS true, footprints 65+115 = −90.7 m (bound, clears the smaller ✓). Typed `maxFrom settlement 400` ✓ (89.3 m). (1) "an **island** in the marsh two hours off the causeway": water `body.ocean` 62.5 m. (5) road 567.0 m, lane 225.0 m. |
| `ledgered-blackguards` blackguard-hideout 1638.8 | (1) "a water-house on a settled back channel with a **clear view of the toll quay**": nearest toll record `scandal-holding-pit` 900 m, `three-gate-toll` 1505 m. (2) water `body.1169-2801` **marsh-deep** 39.5 m ✓ for boat access. (4) D3 on **band 5** (camp tol 2 ✓, at the limit). (5) road 314.1 m, lane 1162.3 m. (8) **no record within 300 m** — the only fully isolated dot in the zone. |
| `blasphemer-urn-vault` urn-vault 766.4 | (3) typed `minFrom settlement 150` fails (nearest settlement < 150 m). (1) "**deliberately far from any burial ground**": `flu-mass-grave` is 71.5 m away (footprints 35+35 = +1.5 m clearance). (2) water marsh-fringe 125.0 m, "dry, sealed" ✓. |
| `flu-mass-grave` mass-grave-memorial 659.1 | (1) "where **Blackrose** buried the Knahaten dead": 685 m from the city. (3) 71.5 m from the urn vault it is meant to be far from. (5) road 617.0 m. |
| `rebellion-earthworks` siege-earthworks 899.3 | (1) "thrown up **around the city**… commanding all three approaches": 372 m from `blackrose`, road 87.1 m ✓. (2) constraint "**dry ground** with a view of the target" vs recorded depth **4.78 m** at the dot. (3) −72.7 m against `akaviri-works`. |
| `scandal-holding-pit` holding-pit 476.1 | (1) "beneath the counting **quay**, eleven steps from where the debt is recorded": 280 m from `blackrose`, no toll or counting-house record within 300 m. (2) water marsh-fringe 5.5 m; "drainage is the cruelty" needs wet ground ✓. |
| `voriplasm-vault` voriplasm-chamber 586.7 | (1) constraint "**under a ruined works**": nearest `works`-class record `drowned-gallery` 115+ m; nearest ruin `bramman-head` is a transit record at 49.4 m. (3) −45.6 m footprint against `bramman-head`. (2) depth 0.28 m vs "damp, enclosed" ✓. |
| `intact-fort` abandoned-fort 391.8 | Clean on A8 (road 3.9 m) and the water tie (`body.1284-3448` swamp 0.0 m, lake 0.0 m — the only live record actually on Blackrose Lake). (2) prose "commands the narrows and the **road**" ✓; recorded depth 3.76 m under a standing fort is the one measurement to check. |
| `kothringi-ruin-basin` kothringi-ruin 264.1 | (1) "on the **Blackrose river terrace**… a river terrace with a landing": Bramman 221.9 m, lake 647.0 m; water swamp 0.0 m, depth 7.75 m — a river terrace standing in 7.75 m of water. (4) D3 on band 4 ✓. |
| `saltrice-village` drowned-village 314.2 | (2) water `reach.1249-3511` horizontal-channel 0.0 m, depth 1.80 m ✓ for `shallow-dive`; "flood-fed and drained, sluiced" reads against a perennial channel. (5) road 351.8 m. |
| `rose-flooded-passage` flooded-passage 242.8 | (3) constraint "**part of** `blackrose-prison`": 298 m from the prison's dot and no `boundTo` block. Dive depth 3.76 m ≥ 1.0 ✓. |
| `drawdown-flat` drawdown-flat 237.4 | (1) "the **lake's** shallow north-eastern arm… four square kilometres": lake 385.0 m; the zone's whole land area is 0.93 km². (2) water swamp `body.1209-3032` level 0.84 m, `seasonResponse` on the lake is 0.0 — nothing draws down. |
| `natural-dive-shaft` dive-shaft 1152.8 | (1) "a karst shaft **in the lake floor**": lake 155.5 m, water swamp. Dive depth 7.75 m ≥ 1.0 ✓. (3) 77.6 m from `wisp-lure-basin` (+2.6 m clearance). |
| `wisp-lure-basin` wisp-lure 1237.6 | (1) "**directly beside the floating road**, on the fen side": road **216.2 m**, lane 161.8 m. (4) D4 on band 3 ✓. |
| `feeder-portage` portage-slipway 178.3 | (1) "a two-hundred-metre sill… at a shoaling sill in a confined channel": water marsh-fringe 19.8 m, not a channel; Bramman 311.3 m. (6) depth at the dot 0.00 m. |
| `lake-divers-yard` salvage-divers-yard 1093.7 | (1) "on the shore nearest the **deep hole where the wrecks concentrate**": nearest wreck record `wreck-submerged-barge` 892 m from Blackrose, > 400 m from this yard; lake 172.7 m. (2) dive depth 1.93 m ≥ 1.5 m hull ✓ but "five to eight metres" of wreck water is not within 150 m (max 1.93 m). |
| `lake-ferry-stage` ferry-stage 0.0 | (5) road 182.7 m ✓, lane 211.1 m ✓ (both under 220). (6) "firm shelving shore… standing for a stone slip": depth at the dot 0.00 m, max within 150 m **2.12 m** — meets small-draft 1.2 m, fails keel 3.0 m. Serves a lane that has no geometry (§4). |
| `cordon-cellars` bonded-warehouse 91.6 | (1) "cut into a **levee bank** above the flood maximum, on the cordon line": lake 53.6 m, water marsh-fringe 61.3 m level 3.54 m ✓ dry. (3) 97.7 m from `intact-fort` (+7.7 m). |
| `chainbreaker-shelter` freed-worker-shelter 147.7 | (1) "outside the toll line, **on water**, with two exits": water `reach.1129-3733` horizontal-channel **58.3 m away**, dot depth 0.00 m — not on water. (5) road 543.4 m, lane 238.5 m. |
| `blackrose-prison` reoccupied-prison 373.1 | (1) "marsh on every side and **one causeway**": road 345.1 m, lane 400.8 m; 430 m from the city. (2) water marsh-fringe 0.0 m, depth 1.93 m under the walls. (4) D4, hostility `guarded`, 430 m from the city centre — inside the 1.2 km hinterland rule. |

## 3. The two homeless records: where their `proximity` block IS satisfiable

Free = in the `imperial-penal-south` culture-land mask and outside every live record's
footprint + 45 m. Cell 5.48 m.

| id | typed gate (`author_type_siting`) | free cells satisfying it | area | danger of those cells |
|---|---|---|---|---|
| `akaviri-works` | `maxFromM {works: 300}`, `mayAbut [works]` | **5673** | 0.171 km² | D0 101 · D1 154 · D2 3875 · D3 1543 · D4–5 0 |
| `necromantic-dig` | `maxFromM {ruin: 500}` | **4425** | 0.133 km² | D0 55 · D2 2068 · D3 1494 · D4 662 · D5 146 |

Sample free dots (east, south) — `akaviri-works`: (2525.2, 6237.5), (2064.5, 6506.2),
(2393.6, 6544.6), (2283.9, 6588.4), (2503.2, 6670.7).
`necromantic-dig`: (2508.7, 5941.4), (2075.5, 6517.2), (2152.3, 6599.4), (1845.2, 6292.3).
Province-wide the counts are 129 260 and 492 407 cells. So the blocker is not extent or
proximity: `macro-plot.json` gives culture clump 255/1081, separation 45/2, score 18/9 as
the sole blockers. Both records ship `sitingPrefs.proximity: null` while the solver reads
the typed table — the derived block is not written back to the catalogue.

## 4. (a) Blackrose's harbour station and the lake ferry

Live records within 600 m of `cityLayout.centre` [2123.0, 6215.0] that are at a lane's
water edge (lane ≤ 60 m) **and** carry a lake/reach/body `plotFacts.water.kind`:
**none**. The closest lane approach inside the ring is `intact-fort` at 69.9 m
(`route.boat.blackrose-lilmoth`, swamp, dot depth 3.76 m), then `natural-dive-shaft`
85.0 m (swamp, 7.75 m) and `flu-quarantine-village` 86.1 m (swamp, 0.00 m). The city's
own dot is 295.0 m from the nearest lane. `station.imperial-penal-south.blackrose` is
placed at [2359.5, 6415.0] — 4 m from `cityLayout.gate`, 325 m from the centre.

`route.boat.blackrose-lake-ferry` is served by two services in `travel-services.json`
(`boat.lake-ferry-stage-blackrose`, and the `swamp-rowboat-ferry` run
blackrose → `lake-ferry-stage` → `lake-boardwalk-village`, whose later hops are
`"unresolved": true`). Its stations:

| station | sited at | its place is at | offset |
|---|---|---|---|
| `station.imperial-penal-south.blackrose` | [2359.5, 6415.0] | [2123.0, 6215.0] | 325 m (= the city gate) |
| `station.imperial-penal-south.lake-ferry-stage` | [2634.8, 6489.7] | [2634.8, 6489.7] | 0 m ✓ |
| `station.imperial-penal-south.lake-boardwalk-village` | [2552.6, 6067.5] | [2856.3, 6542.4] | **561 m stale** — and that position is `wisp-lure-basin`'s current dot |

`waterways.json` ships six lanes: `soulrest-lilmoth`, `lilmoth-archon`, `archon-thorn`,
`stormhold-alten-corimont`, `blackrose-lilmoth`, `alten-corimont-helstrom`.
**`route.boat.blackrose-lake-ferry` and `route.boat.soulrest-blackrose` have no geometry
at all** (`soulrest-blackrose` exists only as a *road*), so both services and the
`lake-ferry-stage` lane tie are un-drawable as shipped.

## 5. (b) Pairs within 150 m that name each other, and every `boundTo`

| pair | m | footprint sum | relation | note |
|---|---|---|---|---|
| `blackrose-prison` — `drowned-gallery` | 66.0 | 110 | `boundTo` (≤450) ✓ LOS true | bound, clears smaller radius |
| `blackrose-prison` — `rose-outworks` | 98.2 | 105 | `boundTo` (≤500) ✓ LOS true | but breaks the "300–700 m" hard constraint |
| `akaviri-works` — `lilmothiit-quarry` | 105.9 | 100 | `boundTo` (≤700) ✓ LOS true | clear |
| `longmont` — `prison-born-refuge` | 89.3 | 180 | `boundTo` (≤600) ✓ LOS true | bound |
| `bramman-head` — `voriplasm-vault` | 49.4 | 95 | `boundTo` (≤600) ✓ LOS true | **−45.6 m**; vault's "under a ruined works" points at a transit record |
| `plague-cordon` — `rose-supply-town` | 33.4 | 170 | named, not bound | **−136.6 m** |
| `drowned-gallery` — `lake-divers-yard` | 144.3 | 90 | named | clear |
| `rockspring` — `bramman-head` | 342.0 | — | `boundTo` (≤400) ✓ LOS true | outside 150 m |
| `flu-quarantine-village` — `blackrose` | 307.1 | — | `boundTo` (≤800) ✓ LOS true | outside 150 m |
| `necromantic-dig` — `blackrose-prison` | 580.4 | — | `boundTo` (≤450) **FAIL**, LOS **false** | the only broken bound |
| `akaviri-works` — `rebellion-earthworks` | 12.3 | 85 | no relation | **−72.7 m**; neither names the other |
| `blackrose-drowned-hist` — `rebellion-earthworks` | 81.5 | 80 | no relation, 1 shared `proseRefs` | +1.5 m |
| `lilmothiit-quarry` — `rebellion-earthworks` | 118.1 | 95 | no relation, 1 shared `proseRefs` | clear |
| `blackrose` — `necromantic-dig` | 167.7 | 275 | no relation | **−107.3 m** |

No `sightlineTo` block exists on any record in this zone (`namedConstraintChecks` carries
no `imperial-penal-south` sightline row).

## 6. (c) Zone density line (ledger §2)

44 live records on **0.9345 km²** of `imperial-penal-south` culture-land
(31 077 cells × 5.4835 m) = **47.1 records/km²**, matching the ledger figure.
Danger of that land: **D0 2.8 % · D1 2.1 % · D2 50.3 % · D3 40.0 % · D4 4.3 % · D5 0.5 %**
— **95.2 % D0–D3, 4.8 % D4–D5**. Twelve live records carry D4 or D5 (27 % of the roster)
on the 4.8 % of the zone's land that is D4–D5, and nine of those twelve stand on D2/D3
ground.

## 7. Candidate remedies (vocabulary only — not decided)

| record | candidates |
|---|---|
| `blackrose` | `pin-by-siting`: `hardConstraints` "island in standing water at a confluence" → require `body.1290-3508` contact (the lake's cell extent is [2200, 6292]–[2513, 6530]); or `prose-rewrite` the founding sentence to the marsh-fringe body it actually sits in. |
| `necromantic-dig` | `meso-move` to (2075.5, 6517.2) or (2152.3, 6599.4) — both free, both inside `maxFrom ruin 500`, and ~130 m from `blackrose-prison`'s ring; or `pin-by-siting` raising `boundTo.maxM` to 600 and rewriting "four hundred metres". |
| `akaviri-works` | `pin-by-siting` with `mayAbut ["works"]` honoured at (2064.5, 6506.2) (free, inside `maxFrom works 300`); or `merge` with `rebellion-earthworks` (12.3 m apart, both Imperial siege-era stone). |
| `rose-outworks` | `meso-move` outward to 300–700 m from `blackrose-prison`, e.g. along the causeway toward (2283.9, 6588.4); or `prose-rewrite` the "300–700 m" figure to the measured 98 m. |
| `lilmothiit-quarry` | `pin-by-siting` "within 400 m of Blackrose" as a typed `maxFromM {settlement: 400}`; or `prose-rewrite` to "within half a kilometre". |
| `longmont`, `murkwood-verge`, `vampiric-cloud-ground`, `basin-sinkhole`, `flu-quarantine-village`, `marsh-giant-ground-basin` | `prose-rewrite` the compass word to the measured bearing, or `pin-by-siting` a sector constraint relative to `place.imperial-penal-south.blackrose`. |
| the 10 `body.ocean` records | `pin-by-siting` a `waterRelation` naming a lake/reach entity; or `prose-rewrite` lake/feeder/levee language to coast language. `manned-toll-tower` additionally needs `re-type` or a move off the 106.36 m ocean cell. |
| `lake-submerged-xanmeer` | `prose-rewrite` "eighteen metres" to the 3.32 m the record carries, or `meso-move` onto a body whose `maxDepthM` ≥ 18. |
| `bramman-head`, `west-market-town`, `three-gate-toll`, `feeder-portage`, `chainbreaker-shelter` | `pin-by-siting` onto a reach with ≥1.2 m recorded depth within 100 m (B5 small-draft), or `prose-rewrite` the hull claim to canoe/pole traffic (0.6 m). |
| `plague-cordon` / `rose-supply-town` | `meso-move` the cordon line 140 m clear of the town's 140 m footprint, or `co-site` them as one design group (the town sits on the line it enforces). |
| `blasphemer-urn-vault` / `flu-mass-grave` | `meso-move` the vault ≥150 m from the grave to honour "far from any burial ground", or `prose-rewrite` that clause. |
| `ledgered-blackguards` | `meso-move` toward `scandal-holding-pit` or `three-gate-toll` for the "clear view of the toll quay", or `prose-rewrite` to a back-channel with no quay. |
| lanes / stations | `route.boat.blackrose-lake-ferry` and `route.boat.soulrest-blackrose` need geometry in `waterways.json` or their services `cut`; `station.imperial-penal-south.lake-boardwalk-village` needs its position re-derived from the moved place. |
