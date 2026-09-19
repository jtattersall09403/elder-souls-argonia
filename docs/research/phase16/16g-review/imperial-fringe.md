# 16g plot review — `imperial-fringe` (measured, read-only)

Measured 2026-09-19 against `world/sources/catalogue/places-imperial-fringe.json`
(new plot) vs `git show HEAD:` (previous plot), `world/sources/hydrology/hydrology-graph.json`
+ `names.json`, `apps/world-studio/public/province/routes.json` / `waterways.json`,
`world/sources/sites/macro-plot.json`, `world/sources/routes/travel-services.json`,
one `worldgen.site_fields.shared_survey()` process. No file but this one was written.

## Summary (10 lines)

1. **The whole region was re-thrown**: 98 of 120 live records moved > 150 m; median move 622 m, 23 moved > 2 km. Ledger §2's `imperial-fringe | 116 | 709.1 | 2557.8 | 3419.6` row is VERIFIED against the live set (my median is over 120 live records, the ledger's over the 116 that moved at all).
2. **Ledger §2 density row VERIFIED exactly**: 120 live, fine-tempo 93 / landmark 12 / destination 15, and the D4–D5 density gate is genuinely `out` (13 records, 1.9/km² vs the 8–12 band).
3. **The Onkobra tie is the region's biggest lore break.** `river.352-503` ("the Onkobra River") is a **986 m headwater**; its downstream continuation carries other names. Seven records that name the Onkobra now sit 280 m–1 940 m from it (`onkobra-ferry` 1 940 m, `the-lake-divers-yard` 1 818 m, `onkobra-clay-pits` 1 709 m).
4. **Fort Swampmoth is no longer on the Blackwood Road** — 322 m from it, 300 m from Gideon (quest §12b puts it on the road as Gideon's outwork). `swampmoth-town` is 548 m off the road and 611 m from the fort it feeds.
5. **The bonded ferry is dead ground**: the Gideon–Stormhold road now touches the Onkobra centreline at (1458.6, 2977.6) where the recorded water is `body.777-1621` backswamp **0.12 m**; the two `ferry-landing.onkobra-bond.*` stations sit 1 600 m away on a 0.36 m reach. Nothing there needs a ferry.
6. **`route.boat.gideon-onkobra` has no published geometry** (`waterways.json` ships 6 lanes; this is not one), so the harbour-station lane test is unrunnable as specified; the 600 m ring is reported instead — Gideon's own water is a `pond` at 77 m, deepest 3.36 m within 150 m.
7. **The stronghold `the-empty-steading` fails its promise**: ground −8.19 m elevation, danger band 4, **no water at the dot**, nearest ≥ 0.6 m water **165.6 m** away — no own landing. One land approach (`route.road.gideon-soulrest`, 139 m) is satisfied. `place.pirate-freeholds.rockpoint` is the better site on water (39 m to 0.75 m, 44 m to 9.89 m) but has **zero** routes within 300 m.
8. **25 of 120 live records stand on slope > 30°** (`onkobra-clay-pits` 82°, `the-quiet-pit` 52°, `the-vellum-estate` 42°) — buildability, not a placement rule, but it will decide 16h.
9. **45 records' `plotFacts.water` names a body 30 m+ above or below the dot** (`castle-giovesse` +292 m, `the-cold-lights` −284 m): `distanceM` is planar, so "beside water" prose is not supported by the fact block.
10. **Two measurement defects found in the tooling**, both queued below: `macro_plot` reports 24 false `danglingRelations` for this region (route ids resolved against place ids only), and `sample().hydrology.heightAboveWaterTableM` is negative at 300 m elevation, so it cannot be used as a wetness test.

## Region counts

| measure | value |
|---|---|
| live records (status not cut/deferred) | 120 (of 128; 8 deferred) |
| densityLayer | fine-tempo 93 · landmark 12 · destination 15 |
| ledger §2 line | `imperial-fringe | 120 | 93 | 12 | 15 | 7.0 | 17.2 | 107/15.4 | 13/1.9 | out` — VERIFIED |
| moved > 150 m | 98 (median 622 m over all live; > 1 km 25; > 2 km 23) |
| A6 footprint breaches (province-wide, boundTo-exempt applied) | 2 |
| nearest-neighbour p5 / median (reviewed set) | 72.5 m / 115.7 m |

## 1. Every live record that moved > 150 m

Δlevel = dot elevation minus `plotFacts.water.levelM` (positive = the named water is below the dot).

| id | type | moved m | slope° | band/tier | nearest route m | water kind · m · Δlevel |
|---|---|---|---|---|---|---|
| `twyllbek-ruins` | barsaebic-compound | 3420 | 26 | 3/D3 | 1018 | ocean · 112.9 · 93.8 |
| `collections-dig` | dig-camp | 3366 | 24 | 3/D2 | 1081 | ocean · 59.3 · 74.0 |
| `the-old-quarters` | plague-abandoned-village | 3242 | 18 | 4/D3 | 167 | lake-lowland · 61.3 · 3.6 |
| `the-ring-of-nine-wells` | ring-complex | 3097 | 27 | 3/D3 | 756 | tarn-upland · 83.7 · 40.9 |
| `the-white-throat` | waterfall-chamber | 3078 | 9 | 3/D3 | 791 | tarn-upland · 54.0 · 70.4 |
| `the-hollow-pass-station` | mountain-pass-station | 3060 | 15 | 3/D3 | 714 | pond · 12.3 · -12.2 |
| `the-fig-poachers` | poacher-camp | 3060 | 19 | 3/D3 | 568 | sloped-rapid · 100.8 · -10.9 |
| `twyllbek-crown` | climbable-ruin-roof | 2970 | 8 | 3/D3 | 1090 | ocean · 193.9 · 124.7 |
| `the-eight-steps` | whitewater-reach | 2904 | 19 | 3/D3 | 566 | sloped-rapid · 0.0 · -31.2 |
| `dreams-in-mud` | dream-wallow | 2812 | 29 | 3/D3 | 593 | pond · 186.5 · -176.5 |
| `unfinished-culvert-line` | failed-roadworks | 2647 | 48 | 3/D4 | 1322 | pond · 54.8 · 15.8 |
| `the-broke-column` | blackguard-hideout | 2599 | 16 | 4/D3 | 167 | sloped-rapid · 32.9 · -14.1 |
| `lower-onkobra-paddies` | paddy-works | 2517 | 16 | 3/D2 | 112 | marsh-deep · 159.7 · 3.4 |
| `onkobra-clay-pits` | clay-pit-and-kiln | 2435 | 82 | 3/D1 | 924 | tarn-upland · 7.8 · -65.6 |
| `burnt-field-village` | burn-scar-village | 2301 | 19 | 3/D3 | 141 | marsh-deep · 157.1 · -8.1 |
| `low-water-fair` | market-fair-ground | 2267 | 22 | 3/D2 | 99 | pond · 27.4 · -15.2 |
| `the-hackwing-scarp` | hackwing-roost | 2231 | 52 | 3/D3 | 562 | tarn-upland · 74.6 · 74.4 |
| `slough-point` | customs-town | 2187 | 0 | 3/D2 | 872 | tarn-upland · 0.0 · -81.6 |
| `the-glass-scar` | oblivion-gate-scar | 2079 | 46 | 3/D4 | 1107 | pond · 77.5 · 22.4 |
| `takes-the-field` | blackguard-hideout | 2050 | 18 | 3/D3 | 384 | pond · 156.0 · 70.3 |
| `fenmarch-village` | hist-village | 2038 | 4 | 4/D3 | 32 | backswamp · 59.3 · -10.5 |
| `the-old-office-house` | officeholders-house | 2011 | 5 | 4/D2 | 19 | pond · 74.6 · -9.6 |
| `the-counted-dead` | mass-grave-memorial | 2007 | 29 | 4/D3 | 90 | backswamp · 5.5 · -14.2 |
| `long-causeway` | causeway | 1952 | 19 | 3/D2 | 865 | tarn-upland · 93.2 · 87.7 |
| `sabinus-claim` | prospectors-camp | 1930 | 46 | 3/D2 | 626 | pool · 44.2 · 29.9 |
| `the-vellum-estate` | estate-village | 1930 | 42 | 4/D2 | 30 | tarn-upland · 32.9 · 5.4 |
| `bone-road-waystation` | bone-repatriation-waystation | 1716 | 25 | 3/D2 | 354 | backswamp · 276.1 · 201.0 |
| `red-cart-yard` | porter-relay-yard | 1619 | 0 | 3/D2 | 35 | marsh-deep · 113.0 · -24.0 |
| `the-standing-mist` | mist-locked-hollow | 1600 | 48 | 3/D3 | 981 | pond · 59.1 · 12.9 |
| `hangs-above-the-water` | gorge-wall-dwelling | 1592 | 23 | 3/D3 | 234 | sloped-rapid · 174.9 · -64.8 |
| `fort-swampmoth` | occupied-fort | 1538 | 12 | 3/D2 | 171 | backswamp · 222.1 · 47.6 |
| `the-abandoned-survey` | survey-camp | 1487 | 10 | 3/D3 | 71 | pond · 38.8 · -14.8 |
| `ridge-runners-post` | courier-relay | 1445 | 26 | 3/D3 | 649 | sloped-rapid · 149.8 · 75.4 |
| `highwater-hamlet` | flood-high-hamlet | 1424 | 18 | 3/D3 | 38 | marsh-deep · 83.5 · -10.2 |
| `westfield-village` | grassland-field-village | 1400 | 16 | 3/D2 | 220 | backswamp · 186.5 · 35.4 |
| `the-snowline-cell` | snowline-hermitage | 1308 | 35 | 3/D3 | 1269 | pond · 186.5 · -16.0 |
| `glenbridge-sermon-xanmeer` | sithis-temple | 1307 | 21 | 3/D3 | 746 | pond · 51.7 · 7.7 |
| `swampmoth-town` | garrison-town | 1290 | 10 | 3/D2 | 548 | lake-lowland · 225.6 · 108.0 |
| `the-ledge-of-tallies` | smugglers-ledge | 1280 | 33 | 3/D3 | 70 | tarn-upland · 147.1 · -5.1 |
| `guar-holding-of-the-nine-bells` | poacher-camp | 1251 | 22 | 3/D2 | 377 | sloped-rapid · 330.7 · -248.3 |
| `xi-tsei-massacre-ground` | battlefield-ground | 1226 | 29 | 2/D3 | 40 | tarn-upland · 42.8 · 1.9 |
| `the-borrowed-house` | squatted-ruin-home | 1194 | 27 | 3/D2 | 378 | pond · 313.0 · 108.6 |
| `the-niben-crystal-workings` | gem-workings | 1167 | 31 | 2/D3 | 89 | tarn-upland · 35.1 · -6.7 |
| `stonewastes` | insular-village | 1156 | 27 | 3/D2 | 1116 | tarn-upland · 228.1 · 40.4 |
| `glenbridge` | shrine-town | 1127 | 24 | 3/D2 | 513 | pond · 298.3 · -196.2 |
| `the-silent-halls` | broken-xanmeer | 1116 | 30 | 3/D4 | 975 | tarn-upland · 0.0 · -81.0 |
| `the-sermon-road-camp` | pilgrim-camp | 1103 | 28 | 3/D2 | 345 | sloped-rapid · 197.7 · 6.7 |
| `the-road-nisswo-house` | nisswo-rest-house | 1062 | 9 | 4/D3 | 80 | marsh-deep · 60.3 · -11.2 |
| `treasure-hunters-camp-of-the-white-hill` | treasure-hunters-camp | 955 | 17 | 3/D3 | 999 | ocean · 300.6 · 122.5 |
| `the-embankment-that-drowned` | failed-roadworks | 923 | 31 | 3/D3 | 323 | pond · 108.8 · 66.4 |
| `ashen-tower` | watchtower | 891 | 6 | 3/D2 | 74 | marsh-deep · 38.8 · -16.8 |
| `the-knapping-floor-of-the-high-scree` | knapping-floor | 864 | 2 | 3/D3 | 260 | tarn-upland · 272.2 · 103.2 |
| `the-quiet-pit` | holding-pit | 844 | 52 | 3/D3 | 140 | backswamp · 177.0 · 11.8 |
| `cassian-farm` | derelict-plantation | 781 | 10 | 2/D2 | 53 | pond · 36.8 · -18.3 |
| `the-two-lamps-hermitage` | hermit-hut | 776 | 33 | 3/D3 | 250 | tarn-upland · 298.3 · 153.6 |
| `moonmarch-ground` | festival-ground | 748 | 20 | 3/D2 | 364 | sloped-rapid · 257.0 · -49.9 |
| `whispers-house-of-the-low-fen` | empty-mission | 739 | 20 | 4/D2 | 222 | sloped-rapid · 60.6 · -101.6 |
| `castle-giovesse` | ducal-ruin | 723 | 44 | 3/D4 | 271 | pond · 202.2 · 292.4 |
| `stonefoot-terrace-village` | upland-terrace-village | 695 | 28 | 3/D3 | 282 | pond · 148.2 · 81.1 |
| `marcians-terrace` | upland-terrace-village | 623 | 46 | 3/D2 | 404 | sloped-rapid · 411.3 · 79.4 |
| `lowmere-raft-town` | raft-village | 622 | 2 | 4/D4 | 9 | swamp · 38.8 · -16.4 |
| `giovesse-lines` | siege-earthworks | 618 | 41 | 3/D3 | 144 | sloped-rapid · 0.0 · -85.3 |
| `sink-field` | death-hopper-pool | 556 | 28 | 3/D3 | 1084 | pond · 65.8 · 5.7 |
| `the-sunk-lane` | sinkhole-mouth | 541 | 6 | 3/D4 | 1515 | pond · 65.8 · -0.0 |
| `rufios-landing` | crocodile-ravine | 519 | 11 | 3/D3 | 1404 | pond · 42.8 · 17.3 |
| `claywater-station` | road-station-village | 499 | 30 | 4/D2 | 20 | horizontal-channel · 5.5 · -17.2 |
| `onkobra-ferry` | ferry-stage | 494 | 19 | 3/D2 | 140 | pond · 69.8 · -1.9 |
| `the-buried-spears` | buried-weapon-cache | 490 | 19 | 2/D2 | 80 | backswamp · 44.2 · -10.6 |
| `onkobra-kwama-mine` | kwama-mine | 465 | 18 | 3/D2 | 14 | marsh-deep · 71.3 · -13.3 |
| `the-marble-field` | foreign-graveyard | 433 | 10 | 2/D3 | 58 | sloped-rapid · 42.8 · -15.5 |
| `moonrack-calcinator` | calcinator-court | 432 | 15 | 2/D2 | 19 | tarn-upland · 121.8 · 1.2 |
| `the-second-empire-locks` | second-empire-works | 423 | 7 | 4/D3 | 89 | marsh-deep · 38.8 · -18.8 |
| `silverhand-cairns` | cairn-field | 420 | 19 | 2/D2 | 114 | backswamp · 29.5 · -10.4 |
| `the-second-hearth` | rebuilt-elsewhere-footprint | 413 | 10 | 3/D2 | 29 | marsh-deep · 35.1 · -18.4 |
| `the-month-chapel` | ruined-chapel | 410 | 28 | 3/D3 | 124 | marsh-deep · 132.6 · 14.9 |
| `the-stone-talkers-watch` | hist-village | 404 | 26 | 3/D2 | 735 | pond · 59.1 · 29.7 |
| `the-kept-terrace` | tended-xanmeer | 395 | 27 | 4/D3 | 269 | pond · 51.7 · 21.4 |
| `silver-mouth` | kothringi-ruin | 385 | 23 | 3/D3 | 353 | sloped-rapid · 70.2 · 5.5 |
| `the-art-and-ash-place` | art-and-destroy-site | 361 | 8 | 2/D2 | 41 | tarn-upland · 45.2 · -11.7 |
| `nine-arch-stage` | road-stage | 353 | 12 | 3/D2 | 93 | marsh-deep · 27.4 · -17.1 |
| `the-cold-forge` | anomalous-smithy | 329 | 10 | 3/D2 | 409 | sloped-rapid · 251.2 · -57.2 |
| `reedcutters-toll` | toll-bridge | 310 | 1 | 5/D3 | 16 | marsh-deep · 5.5 · -18.5 |
| `the-turned-out` | owing-eviction-camp | 309 | 17 | 3/D3 | 178 | sloped-rapid · 76.8 · -21.3 |
| `ninefold-station` | failed-roadworks | 283 | 20 | 3/D2 | 299 | pond · 204.7 · 57.4 |
| `the-lake-divers-yard` | salvage-divers-yard | 272 | 3 | 3/D4 | 1617 | tarn-upland · 65.8 · 21.4 |
| `the-shut-door` | sealed-xanmeer | 247 | 26 | 4/D4 | 420 | pond · 137.2 · 33.1 |
| `gideon-synod-outstation` | synod-outstation | 241 | 29 | 2/D1 | 115 | tarn-upland · 49.0 · -3.1 |
| `the-cordon-stones` | plague-cordon-line | 238 | 15 | 4/D2 | 335 | sloped-rapid · 170.6 · -76.7 |
| `watch-of-the-weighed-cart` | toll-tower | 229 | 22 | 2/D2 | 147 | backswamp · 120.3 · 26.4 |
| `the-leaning-watch` | watchtower | 223 | 12 | 3/D2 | 1172 | ocean · 107.7 · 106.6 |
| `bonded-shed-of-the-onkobra` | bonded-warehouse | 219 | 10 | 2/D1 | 42 | backswamp · 120.8 · -27.1 |
| `the-back-kiln` | daril-fermentary | 207 | 2 | 2/D2 | 35 | sloped-rapid · 106.5 · -15.1 |
| `saddle-fair` | market-fair-ground | 204 | 28 | 3/D2 | 349 | sloped-rapid · 149.0 · -64.4 |
| `the-stone-drop` | safehouse-drop | 192 | 34 | 3/D3 | 399 | sloped-rapid · 5.5 · -16.7 |
| `the-last-post` | border-post | 187 | 30 | 4/D3 | 77 | sloped-rapid · 5.5 · -18.2 |
| `bog-iron-workings` | bog-iron-bloomery | 184 | 42 | 4/D3 | 182 | sloped-rapid · 11.0 · -137.6 |
| `hollow-arch-toll` | toll-bridge | 170 | 14 | 3/D2 | 35 | marsh-deep · 27.4 · -19.9 |
| `the-hollow-under-the-figs` | root-hollow-gallery | 166 | 43 | 4/D3 | 85 | sloped-rapid · 145.2 · 7.5 |

## 2. Named lists — the records the brief calls out

One row per record: measured failure first, then the numbers.

| id · type | moved m | measured — rule / lore tie |
|---|---|---|
| `the-empty-steading` · claimable-steading | 0 (homeless, held on its `nearPoint`) | **Terrain promise RED, confirmed**: water record at the dot `null`, `waterDepthM` 0.0, nearest ≥ 0.6 m water 165.6 m (`body.1001-2519` marsh-deep 1.72 m). Ground −8.19 m, slope 7.1°, danger band 4 vs `dangerTier` D3 (A7 ok, ±1). One route ≤ 300 m (`route.road.gideon-soulrest` 139.2 m) → "one land approach" MET, "own landing" FAILED. 1 472 m to Gideon. Interior `delve / abandoned-plantation / S2`, 2 entrances, `wetFraction` 0.2, swim 10 m — an interior that assumes water the ground does not have. |
| `comes-back-slowly` · withdrawal-house | 110.7 | Typed-siting violation confirmed: 407.7 m from the nearest settlement (Gideon), `maxFromM` 350. Its own prose asks for "an hour's walk from anywhere selling sap or drink" — 407 m from a city is the opposite of the prose, in both directions. Band 3 / D2 (ok). Water `reach.991-1467` horizontal-channel 50.6 m. |
| `the-quiet-pit` · holding-pit | 844.1 | Typed-siting violation confirmed: 307.9 m from Gideon, `maxFromM` 300. Also **slope 52.5°** on the dot and inside Gideon's 350 m city edge, which A7 reserves for wards/docks/works/shrines/gates. Deepest water ≤ 150 m: 0.0 m. |
| `the-two-lamps-hermitage` · hermit-hut | 776.2 | **Terrain promise RED, confirmed**: `hardConstraints` "a bench reachable only by climbing", prose "forty metres up a black wall". Measured relief within 150 m: 96.0 m above the dot, 154.8 m below it, slope 33.3° — the *wall* exists; what fails is the **bench** (no flat shelf at the dot). Nearest named water 298 m and 154 m below. |
| `the-drowned-furrow` · sunken-house | 104.2 | The only `terrain-request-known-red` row that is ours (the `the-drowned-furrow` pool request, failing `depthClass`,`waterRelation`,`current`). Still red: no water record at the dot, ground 305.8 m in **border mountains** at slope 20.8° — a drowned farm on a mountainside. `plotFacts.water` is a pond 85 m off at level 286.5 (19 m below the dot). |
| `gideon` · frontier-records-city | 138.1 | Lore ties HOLD: 76.2 m to the Onkobra, 138.3 m to the Blackwood Road, 14.7 m to `route.road.archon-gideon`. `plotFacts.water.kind` is **`pond`** (77 m) while `hardConstraints` says "river landing for the Onkobra trade" — prose/fact mismatch (standard 12). A7: `dangerTier` D0 vs ground band 2, a settlement, so |Δ| 2 > 1 — **A7 breach**. heroHist: the "impossible green crown" gardens are prose only; no separate hist record within 300 m. |
| `gideon-rootworm-terminus` · rootworm-station | 42.1 | Holds: 142.9 m from Gideon (`boundTo` maxM 450), LOS true, `status: seasonal`, `season` wintertide-only wording present in `why`. 65 m from a route. Inside Gideon's 350 m edge but it is a station (A7-permitted kind). |
| `fort-swampmoth` · occupied-fort | 1538.3 | **Lore tie BROKEN**: `hardConstraints` "on the road, astride the border road" — 322.5 m from the Blackwood Road (A8 needs ≤ 220 m; nearest route of any kind 170.6 m, `route.road.archon-gideon`). Now 299.9 m from Gideon: a fort inside the city's edge ring, not an outwork on the approach (quest §12b). Sightline to `mile-house-of-the-eagle` 669 m, true. |
| `swampmoth-town` · garrison-town | 1289.6 | **A8 breach**: `hardConstraints` "below a held fort, within its protective arc"; 611 m from `fort-swampmoth` and 548.0 m from the Blackwood Road, with **no** live record within 300 m. `plotFacts.water` is a lake 225.6 m away and **108 m below** the dot. |
| `stonewastes` · insular-village | 1156.4 | Isolation reads correctly (nearest route 1 116 m) and the "firm ground in bog" constraint is met on band 3 upland hills. Prose "the causeway runs straight at the keep for four hundred metres with bog on both sides" is unsupported: deepest water within 150 m is 0.5 m and no route or causeway is within 1 km. |
| `glenbridge` · shrine-town | 1127.1 | **Lore tie BROKEN**: `hardConstraints` "a bridged crossing" + "a landing for pilgrims" — nearest route 512.6 m, nearest water a pond 298 m away and **196 m above** the dot, deepest water ≤ 150 m 0.5 m. There is nothing to bridge and nowhere to land. `sightlineTo`/`boundTo` with `glenbridge-sermon-xanmeer` hold at 253 m, LOS true. |
| `the-abandoned-survey` · survey-camp | 1487.1 | Quest §20e MET: `boundTo` `the-vellum-estate` 403.1 m (≤ 600), LOS true; 70.9 m from the Blackwood Road (the omitted-corridor line). Relaxed placement (`neighbour-zone`). Slope 10.0°, band 3 vs D3 ok. |
| `the-vellum-estate` · estate-village | 1929.8 | **Slope 41.5°** for a "one undivided block of good land" estate — the constraint is not met by the ground. 30.3 m from the Blackwood Road. A7: band 4 vs `dangerTier` D2, a settlement → |Δ| 2 > 1, **breach**. Relaxed placement. |
| `the-broke-column` · blackguard-hideout | 2599.0 | **Lore tie BROKEN**: `hardConstraints` "overlooking the Blackwood Road at a bend" (quest §20e) — **1 286.8 m** from the Blackwood Road. It is 167.5 m from `route.road.gideon-stormhold`, i.e. it now overlooks a different road. |
| `the-hollow-under-the-figs` · root-hollow-gallery | 165.8 | Constraint "must sit below the rim break, in the lowland fringe" MET (firm lowland, 39.3 m). Slope 42.6° at the dot; gallery mouth prose ("behind a root buttress") is plausible on that face. 85 m from the Blackwood Road, band 4 vs D3 ok. |
| `moonrack-calcinator` · calcinator-court | 432.5 | `hardConstraints` "a level shelf with an open eastern horizon" — slope 15.3°, relief within 150 m 99.5 m, 75.1 m of ground **above** the dot: not a level shelf; the eastern horizon is unmeasured but the dot sits below local high ground. 19.4 m from the Blackwood Road (fine for access, wrong for a moon-timed court's isolation). |
| `bonded-shed-of-the-onkobra` · bonded-warehouse | 219.1 | **A6 breach** (206.2 m from Gideon, sum of radii 275.0, no `boundTo`). `hardConstraints` "a lockable riverside shed", "wharf access", "under 900 m of Gideon" — the last MET, the first two not: nearest water `body.777-1621` backswamp 120.8 m, deepest ≤ 150 m 2.09 m, no reach at the dot. |
| `the-marble-field` · foreign-graveyard | 432.9 | **A6 breach** (103.2 m from Gideon, sum 255.0). Recipe sightline to Gideon holds (103 m, true). |

**Not failing, listed for completeness:** `castle-giovesse` (sightline to Gideon 869 m, true), `giovesse-lines` (444 m, true), `ashen-tower` (677 m to Fort Swampmoth, true), `the-drowning-gate`/`the-embankment-that-drowned` (597 m, true), `the-ring-of-nine-wells` (273 m, true), `the-snowline-cell` (850 m, true), `the-stone-talkers-watch` (218 m, true), `twyllbek-crown` (546 m, true), `the-shut-door` (252 m, true), `collections-dig` (`boundTo` `twyllbek-ruins` 66 m), `bone-road-waystation` (`boundTo` 285 m ≤ 700; LOS false, not required), `cassian-farm` (`boundTo` Gideon 76.7 m), `the-sermon-road-camp` (`boundTo` Glenbridge 170 m). **All 16 `namedConstraintChecks` rows for this region pass.**

### Relaxed records (16, from `macro-plot.json`)

`castle-giovesse`, `claywater-station`, `giovesse-lines`, `long-causeway`, `low-water-fair`, `lowmere-raft-town`, `ninefold-station`, `onkobra-clay-pits`, `reedcutters-toll`, `ridge-runners-post`, `the-abandoned-survey`, `the-lake-divers-yard`, `the-marble-field`, `the-shut-door`, `the-snowline-cell`, `the-vellum-estate` — all `neighbour-zone` or `region-relaxed`, i.e. sited outside their own zone/region preference. Five of them also appear above as failures (`onkobra-clay-pits`, `the-lake-divers-yard`, `the-marble-field`, `the-vellum-estate`, `the-abandoned-survey`).

### `danglingRelations` — 51 rows, 24 of them FALSE

`macro_plot.py:2520-2527` resolves `relations.*` only against **place** ids, so every `route.*` reference is reported as "unknown id". 24 of this region's 51 rows name ids that DO exist in `world/sources/routes/registry.json` (`route.road.gideon-blackwood-road`, `route.road.gideon-stormhold`, `route.road.gideon-soulrest`, `route.road.archon-gideon`, `route.road.bone-road-waystation-the-counted-dead`, `route.road.cartwrights-cross-fig-market`, `route.road.glenbridge-the-road-nisswo-house`, `route.road.gideon-ridge-runners-post`). **27 are real**, all of them stale route aliases: `route.blackwood-road` (×11), `route.rim-path` (×4), `route.upland-track` (×4), `route.marsh-edge-way` (×3), `route.gideon-north-track`, `route.pilgrim-way-blackwood`, `boat:low-fen`. Defect: the check should resolve the route registry too, or the field should be typed.

## 3. A-rule sweeps

**A6 (footprint).** Province-wide, boundTo/mayAbut exempt: only two breaches, both Gideon's: `gideon`↔`the-marble-field` 103.2 m (need 255.0) and `gideon`↔`bonded-shed-of-the-onkobra` 206.2 m (need 275.0). No `proximity` block is authored on any reviewed record, so A6b is only in force via the two solver rows above.

**A7 (danger).** Three breaches: `gideon` (D0 / band 2), `the-vellum-estate` (D2 / band 4), `claywater-station` (D2 / band 4) — all `settlement` class, limit ±1. Everything else is inside its band.

**A8 (≤ 220 m for a network role).** Four records carry the `on_route` prose hint and miss it: `ridge-runners-post` 649.3 m, `swampmoth-town` 548.0 m, `the-cold-forge` 409.4 m, `ninefold-station` 299.2 m. `fort-swampmoth` misses against its *named* road (322.5 m to the Blackwood Road) while passing on the nearest road.

**B5 (hull depth, deepest recorded water within 150 m).** Station/landing/toll types: `claywater-station` 10.59 · `gideon-synod-outstation` 14.13 · `the-hollow-pass-station` 8.14 · `onkobra-ferry` 7.45 · `onkobra-field-station` 7.03 · `reedcutters-toll` 4.50 · `nine-arch-stage` 2.87 · `hollow-arch-toll` 1.56 · `gideon-rootworm-terminus` 1.20 · `red-cart-yard` 0.39 · `bone-road-waystation` 0.00. Only `onkobra-ferry` is a true water role: it has 7.45 m at 90.7 m off, so it can berth anything — **but it is 1 939.6 m from the Onkobra it is named for**.

## 4. Gideon's harbour station, and the Onkobra bond ferry

**(a) Harbour station.** The check as briefed cannot be run: `route.boat.gideon-onkobra` exists in `world/sources/routes/registry.json` (`geometryId: waterway.imperial-fringe.gideon`, "canoe channel, not a lane") but `apps/world-studio/public/province/waterways.json` publishes **six** lanes, which do not include it. Nothing in the region is within 60 m of a published lane. Reported instead: every live record within 600 m of `gideon.cityLayout.centre` (1551.0, 3069.0) with its water record and the deepest recorded water within 150 m (§ table below). The only candidates sitting on a channel/reach kind are `the-marble-field`, `gideon-rootworm-terminus`, `the-back-kiln`, `whispers-house-of-the-low-fen` (all `sloped-rapid`, ≤ 2.09 m) and `comes-back-slowly` (`horizontal-channel`, 1.23 m). **No record in the ring is a harbour, nor does any reach keel water.**

**(b) The bond ferry.** `route.road.gideon-stormhold` now runs **2.0 m** from the Onkobra centreline at road point (1458.6, 2977.6) / river point (1458.0, 2975.6) — it touches the river rather than crossing it; the recorded water there is `body.777-1621` backswamp at **0.12 m**. Along its whole length the road samples wet ground at 18 points; the deepest is 2.04 m in `body.1293-692` at (2292.1, 1200.9), 1.2 km into `dunmer-north`. The two stations `ferry-landing.onkobra-bond.town` / `.far` sit at (1609.0, 3043.4) / (1600.4, 3043.4) on `reach.878-1669` with a recorded berth of **0.36 m** against a `small-draft` 1.2 m need — `unmatched` is correct and cannot be fixed by a nudge. Nearest live records to the road's touch point on the Onkobra: `cassian-farm` 55.6 m, `gideon` 130.0 m, `bonded-shed-of-the-onkobra` 142.7 m, `watch-of-the-weighed-cart` 167.9 m. So the bonded shed and the toll tower are both within 170 m of where the road meets the river — but there is no crossing to bond, toll or ferry.

## 5. Pairs within 150 m (≤ 120 m or naming each other)

| a | b | m | names each other |
|---|---|---|---|
| `silverhand-cairns` (cairn-field) | `the-buried-spears` (buried-weapon-cache) | 52.2 | no |
| `the-art-and-ash-place` (art-and-destroy-site) | `the-buried-spears` (buried-weapon-cache) | 64.1 | no |
| `collections-dig` (dig-camp) | `twyllbek-ruins` (barsaebic-compound) | 66.0 | yes |
| `the-art-and-ash-place` (art-and-destroy-site) | `xi-tsei-massacre-ground` (battlefield-ground) | 72.5 | no |
| `cassian-farm` (derelict-plantation) | `gideon` (frontier-records-city) | 76.7 | yes |
| `hollow-arch-toll` (toll-bridge) | `the-second-hearth` (rebuilt-elsewhere-footprint) | 80.1 | no |
| `the-cold-forge` (anomalous-smithy) | `the-cordon-stones` (plague-cordon-line) | 86.7 | no |
| `the-leaning-watch` (watchtower) | `twyllbek-crown` (climbable-ruin-roof) | 87.7 | no |
| `onkobra-field-station` (field-station) | `the-ledge-of-tallies` (smugglers-ledge) | 92.6 | no |
| `keepers-lodge-of-the-lower-onkobra` (keepers-lodge) | `nine-arch-stage` (road-stage) | 95.1 | no |
| `ashen-tower` (watchtower) | `the-month-chapel` (ruined-chapel) | 97.2 | no |
| `keepers-lodge-of-the-lower-onkobra` (keepers-lodge) | `the-second-hearth` (rebuilt-elsewhere-footprint) | 97.8 | no |
| `rockgrove` (cult-raid-camp) | `the-hollow-pass-station` (mountain-pass-station) | 98.0 | yes |
| `the-abandoned-survey` (survey-camp) | `the-drowned-mule` (tradehouse) | 98.3 | no |
| `the-hollow-under-the-figs` (root-hollow-gallery) | `the-old-office-house` (officeholders-house) | 98.8 | no |
| `onkobra-clay-pits` (clay-pit-and-kiln) | `the-silent-halls` (broken-xanmeer) | 99.3 | no |
| `the-cold-lights` (bioluminescent-water) | `the-sermon-road-camp` (pilgrim-camp) | 100.8 | no |
| `the-eight-steps` (whitewater-reach) | `the-fig-poachers` (poacher-camp) | 101.1 | no |
| `moonrack-calcinator` (calcinator-court) | `onkobra-field-station` (field-station) | 102.1 | no |
| `gideon-synod-outstation` (synod-outstation) | `the-niben-crystal-workings` (gem-workings) | 103.0 | no |
| `gideon` (frontier-records-city) | `the-marble-field` (foreign-graveyard) | 103.2 | yes |
| `saddle-fair` (market-fair-ground) | `the-cordon-stones` (plague-cordon-line) | 107.8 | no |
| `bonded-shed-of-the-onkobra` (bonded-warehouse) | `the-quiet-pit` (holding-pit) | 108.4 | no |
| `hollow-arch-toll` (toll-bridge) | `red-cart-yard` (porter-relay-yard) | 109.6 | no |
| `fort-greenditch` (abandoned-fort) | `the-abandoned-survey` (survey-camp) | 110.0 | no |
| `the-kept-terrace` (tended-xanmeer) | `the-old-quarters` (plague-abandoned-village) | 110.4 | no |
| `onkobra-kwama-mine` (kwama-mine) | `red-cart-yard` (porter-relay-yard) | 112.0 | no |
| `burnt-field-village` (burn-scar-village) | `red-cart-yard` (porter-relay-yard) | 112.6 | no |
| `gideon-synod-outstation` (synod-outstation) | `moonrack-calcinator` (calcinator-court) | 112.9 | no |
| `giovesse-lines` (siege-earthworks) | `the-turned-out` (owing-eviction-camp) | 112.9 | no |
| `the-last-post` (border-post) | `the-old-office-house` (officeholders-house) | 113.3 | no |
| `claywater-station` (road-station-village) | `the-old-office-house` (officeholders-house) | 114.1 | no |
| `the-drowned-furrow` (sunken-house) | `the-standing-mist` (mist-locked-hollow) | 114.5 | no |
| `low-water-fair` (market-fair-ground) | `onkobra-ferry` (ferry-stage) | 115.7 | no |
| `silverhand-cairns` (cairn-field) | `the-art-and-ash-place` (art-and-destroy-site) | 116.3 | no |
| `the-back-kiln` (daril-fermentary) | `the-month-chapel` (ruined-chapel) | 117.8 | no |
| `ashen-tower` (watchtower) | `comes-back-slowly` (withdrawal-house) | 118.0 | no |
| `comes-back-slowly` (withdrawal-house) | `the-back-kiln` (daril-fermentary) | 133.4 | yes |
| `mile-house-of-the-eagle` (road-stage) | `moonrack-calcinator` (calcinator-court) | 137.1 | yes |
| `gideon` (frontier-records-city) | `gideon-rootworm-terminus` (rootworm-station) | 142.9 | yes |

Nothing here is a merge candidate on the numbers alone except `collections-dig`/`twyllbek-ruins` (66 m, named, already `boundTo` — leave as co-site) and `cassian-farm`/`gideon` (76.7 m, named, `boundTo` — co-site). `rockgrove`/`the-hollow-pass-station` (98 m, named) is a hostile camp on a pass station: relation, not merge. No `boundTo` pair exceeds its `maxM`.

## 6. Underwater and dive records

Every one of the 21 records carrying `underwaterAccess` sits on **dry ground at its dot** (recorded depth 0.00 m, water record `null`). Under decision 0065/0066 the dot is an anchor, not the built place, so the column that decides is the nearest recorded depth.

| id | type | access | depth AT DOT | deepest ≤150 m | m to it | verdict |
|---|---|---|---|---|---|---|
| `hangs-above-the-water` | gorge-wall-dwelling | surface-swim | 0.00 | 0.5 | 95.1 | NO WATER |
| `long-causeway` | causeway | surface-swim | 0.00 | 3.92 | 137.5 | ok |
| `lower-onkobra-paddies` | paddy-works | surface-swim | 0.00 | 0.0 | 217.8 | NO WATER |
| `lowmere-raft-town` | raft-village | surface-swim | 0.00 | 7.75 | 148.7 | ok |
| `onkobra-clay-pits` | clay-pit-and-kiln | surface-swim | 0.00 | 3.92 | 149.5 | ok |
| `onkobra-ferry` | ferry-stage | surface-swim | 0.00 | 7.45 | 90.7 | ok |
| `onkobra-field-station` | field-station | surface-swim | 0.00 | 7.03 | 149.3 | ok |
| `rufios-landing` | crocodile-ravine | surface-swim | 0.00 | 19.77 | 145.5 | ok |
| `sink-field` | death-hopper-pool | shallow-dive | 0.00 | 13.51 | 71.8 | ok |
| `the-black-tarn` | legendary-deep | deep-dive | 0.00 | 35.57 | 54.9 | ok |
| `the-cold-lights` | bioluminescent-water | shallow-dive | 0.00 | 0.5 | 139.6 | NO WATER |
| `the-drowned-furrow` | sunken-house | shallow-dive | 0.00 | 8.11 | 85.2 | ok |
| `the-drowning-gate` | monsoon-barrier | surface-swim | 0.00 | 10.59 | 149.7 | ok |
| `the-eight-steps` | whitewater-reach | surface-swim | 0.00 | 1.2 | 55.4 | ok |
| `the-embankment-that-drowned` | failed-roadworks | surface-swim | 0.00 | 2.74 | 134.6 | ok |
| `the-kept-terrace` | tended-xanmeer | surface-swim | 0.00 | 4.7 | 106.3 | ok |
| `the-lake-divers-yard` | salvage-divers-yard | surface-swim | 0.00 | 51.52 | 150.0 | ok |
| `the-second-empire-locks` | second-empire-works | shallow-dive | 0.00 | 3.97 | 134.5 | ok |
| `the-silent-halls` | broken-xanmeer | shallow-dive | 0.00 | 3.92 | 50.4 | ok |
| `the-standing-mist` | mist-locked-hollow | shallow-dive | 0.00 | 12.23 | 102.4 | ok |
| `the-white-throat` | waterfall-chamber | shallow-dive | 0.00 | 3.92 | 149.1 | ok |

Three fail outright: `lower-onkobra-paddies` (`surface-swim`, 0.00 m anywhere within 150 m — a paddy works with no water), `the-cold-lights` (`shallow-dive`, 0.50 m; also the record that sits 284 m *below* its named reach), `hangs-above-the-water` (`surface-swim`, 0.50 m, 492 m from the Onkobra it hangs above). The rest have deep water within 150 m but never at the dot, so 16h must either move the dot onto the water or place the entrance on the bank and the volume off it. No wreck records exist in this region.

## 7. The stronghold

| measure | `the-empty-steading` (imperial-fringe) | `rockpoint` (pirate-freeholds, reference only) |
|---|---|---|
| dot | 2015.2, 4466.3 | 3693.2, 1647.8 |
| moved | 0 (homeless; held on its `nearPoint` 2050, 4346, 125 m away, inside `maxM` 150) | — |
| ground | elevation **−8.19 m**, slope 7.1°, firm lowland, danger band 4 | elevation 5.59 m, slope 1.6°, firm lowland, danger band 4 |
| water at the dot | none (`record.id` null, `waterDepthM` 0.0, `wetSeasonInundated` false) | none (`shoreDistanceM` 36.2 m) |
| nearest ≥ 0.6 m (a landing) | **165.6 m** — `body.1001-2519` marsh-deep 1.72 m | **39.0 m** — `body.2039-884` marsh-deep 0.75 m |
| nearest ≥ 1.2 m (small-draft) | 165.6 m (1.72 m) | 44.3 m (9.89 m) |
| land approaches (routes ≤ 300 m) | **1** — `route.road.gideon-soulrest` 139.2 m | **0** — nearest route 302.5 m |
| distance to Gideon | 1 472.4 m | 2 570.8 m |
| danger | `dangerTier` D3 / `approachDanger` D4 on a band-4 ground | D3, no `approachDanger` |
| interior | `delve` / `abandoned-plantation` / S2, 2 entrances, `wetFraction` 0.2, swim 10 m, dark 0.5, lock hard, 4 anchor sockets | `building` / `dwelling` / S2, 1 entrance, `exteriorShell` true |
| nearest neighbours | 213.3 m `naga-kur-deeps.serpent-ground-moon-adder`, 231.2 m `hist-heartland.*` — it sits on a three-zone seam | 306.0 m `trunk-toll-bridge`, 312.8 m `corimont-low-store` |

Quest §20e wants "own landing, one land approach". `the-empty-steading` delivers the approach and not the landing; `rockpoint` delivers the landing (and a deep one) and not the approach. Neither delivers both today.

## 8. Candidate remedies (vocabulary only — nothing decided here)

| record | remedy | numbers |
|---|---|---|
| `the-empty-steading` | `meso-move` | 143 m NW to ~(1890, 4545), 20 m off the 1.72 m marsh-deep edge of `body.1001-2519`; keeps `route.road.gideon-soulrest` at ~230 m (one approach) and Gideon at ~1.5 km. Alternative `pin-by-siting`: `nearPoint` → (1890, 4550) `maxM` 80 plus `hardConstraints` += "within 40 m of a reach or body whose recorded depth ≥ 0.6 m". |
| `the-empty-steading` | `re-type` (if the move is refused) | drop the landing from the type recipe and rewrite `why.siteAdvantages`/`vibe.approach` (`prose-rewrite`: "It shows from the channel as a roofline with no smoke" → from the road). |
| `fort-swampmoth` | `pin-by-siting` | `hardConstraints` "on the road" → a typed `maxFromM: 220` against `route.road.gideon-blackwood-road`; nearest qualifying ground on that road is ~1.9 km SW of the present dot, which also restores the 1.2 km separation from Gideon that A7's hinterland rule wants. |
| `swampmoth-town` | `pin-by-siting` | `boundTo` `fort-swampmoth` `maxM` 350 (currently unbound at 611 m); it then follows the fort. |
| `the-broke-column` | `meso-move` is not enough (1 287 m) → `pin-by-siting` | `boundTo`-style constraint against `route.road.gideon-blackwood-road` `maxM` 150 at a bend; quest §20e names that road explicitly. |
| `glenbridge` | `pin-by-siting` | `hardConstraints` "a bridged crossing" needs a typed `maxFromM` ≤ 60 against a reach with recorded depth ≥ 0.6 and `maxFromM` ≤ 220 against a route; nothing within 500 m of the present dot satisfies either. Otherwise `prose-rewrite` the bridge and the pilgrim landing out of the record. |
| `bonded-shed-of-the-onkobra` | `merge` (co-site into Gideon's quay ward) or `meso-move` | it breaches A6 with Gideon by 68.8 m; a 70 m move away from the city clears the footprint but not "wharf access" (no reach within 120 m). |
| `the-marble-field` | `meso-move` | 152 m out from Gideon clears the 255 m footprint sum and keeps the sightline (currently 103 m, true). |
| `comes-back-slowly` | `pin-by-siting` | its own prose asks for isolation; raise the typed gate from `maxFromM` 350 to a `minFromClassM` settlement 600 and let the solver carry it out of Gideon's ring — this turns the violation into an intent. |
| `the-quiet-pit` | `meso-move` | 8 m to clear `maxFromM` 300 is trivially available, but slope 52.5° and the city-edge rule argue for `pin-by-siting` onto ground ≤ 15° outside 350 m. |
| `onkobra-ferry`, `onkobra-clay-pits`, `the-lake-divers-yard`, `the-eight-steps`, `lower-onkobra-paddies`, `hangs-above-the-water`, `onkobra-field-station` | `pin-by-siting` or `prose-rewrite` | either bind each to `river.352-503` (≤ 150 m for "on/beside") or rename them off the Onkobra. See § 9 — the naming register may be the thing to fix, not the seven records. |
| `the-drowned-furrow` | `re-type` or `cut` | a drowned farm at 305.8 m in border mountains cannot be realised; the known-red request stays red wherever the dot is unless the record moves to lowland. |
| `the-two-lamps-hermitage` | `meso-move` | keep the wall, find a bench: within 150 m the ground spans 250.8 m of relief, so a ≤ 10° shelf almost certainly exists; the brief's 25.7 m vs 40 m figure is a *bench* measure; the wall itself measures 96 m above / 155 m below the dot. |
| `moonrack-calcinator` | `meso-move` | onto the local high ground (75.1 m of ground sits above the dot within 150 m) to get the open eastern horizon the constraint names. |
| `the-vellum-estate`, `onkobra-clay-pits` and the other 23 records on slope > 30° | `meso-move` | A6/A7 all pass; what fails is buildability. Each needs a ≤ 20° dot within 150 m before 16h draws a footprint. |
| `stonewastes` | `prose-rewrite` | the four-hundred-metre causeway through bog is not on the ground (0.5 m of water within 150 m, no route within 1 km). |
| 27 stale route aliases in `relations` | `pin-by-siting` (data fix) | rewrite `route.blackwood-road` → `route.road.gideon-blackwood-road` etc.; and fix `macro_plot.py:2526` so route ids resolve against `world/sources/routes/registry.json` rather than being reported as unknown. |

## 9. Defects found that are not this region's placement

1. **`macro_plot` `danglingRelations` false positives** — `tooling/world-generation/worldgen/macro_plot.py:2520-2527` resolves relation targets only against place ids. 24 of this region's 51 rows are false; the noise hides the 27 real stale aliases. Queue: 16g chunk brief.
2. **`site_fields.sample().hydrology.heightAboveWaterTableM` is unusable** — it reads −9 to −14 m at dots 200–300 m above sea level (`glenbridge` −9.23 at 226 m; `the-drowned-furrow` −5.65 at 305.8 m). The refined `water_level` raster is being sampled outside any water body. Any check written on this field cannot fail correctly. Queue: `docs/phases/P-polish/backlog.md`.
3. **The Onkobra naming is a 986 m headwater.** `names.json` lands "the Onkobra River" on `river.352-503` alone (986 m, accum 0.836 km², mouth at a confluence into `river.415-513` "Wainwright's Run"). UESP `Lore:Onkobra River` describes a major Black Marsh river; the register's own `attested` rule allows one name over several ids sharing a `chain`, and no `chain` was written. Seven catalogue records place themselves on "the Onkobra" 280 m–1 940 m away. Fixing the chain is likely cheaper and more canonical than moving seven records. Queue: 16g chunk brief (naming), with the placement rows above dependent on it.
4. **`route.boat.gideon-onkobra` publishes no geometry** — in `registry.json`, absent from `waterways.json`. Any lane-relative check on Gideon (harbour stations, boat travel service edges, `gideon.relations.travelServiceEdges`) silently passes on nothing. Queue: 16g chunk brief.
5. **`plotFacts.water.distanceM` is planar only.** 45 of 120 live records name a water body 30 m or more above/below their dot (max +292 m, `castle-giovesse`). Prose that says a place sits "beside" that water is written against a fact the field cannot support (standard 12). Queue: 16g chunk brief — either add a `levelDeltaM` to the fact block or make the plot prefer water within a vertical band.
