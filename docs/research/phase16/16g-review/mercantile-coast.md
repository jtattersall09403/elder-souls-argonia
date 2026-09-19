# 16g review — `mercantile-coast`, measured

Read-only measurement of the re-solved macro plot (`world/sources/sites/macro-plot.json`,
catalogue `world/sources/catalogue/places-mercantile-coast.json`) against HEAD
(`git show HEAD:...`), the frozen water record
(`world/sources/hydrology/hydrology-graph.json` + `names.json`), the anchors, the
routes/lanes and docs/world/97-placement-principles.md Part A/B. Every number was
measured in one `worldgen.site_fields.shared_survey()` process. Remedies are
candidates with numbers; nothing here is decided.

## Summary (10 lines)

1. **The Lilmoth family has been thrown onto the Soulrest side of the province.**
   `lilmoth-divers-yard` (4055 m), `lighter-flotilla`, `keel-sakka-stilts`,
   `oliis-ferry-stage`, `oliis-boardwalk`, `alessian-hull` now sit 2.1–3.4 km from
   the thing their founding names, while Lilmoth itself did not move.
2. 48 live records moved > 150 m; 24 of them moved > 2 km. The zone's ledger line
   is 60 moved, median 535.1 m, p90 3040.1 m, max 4055.2 m — the max is
   `lilmoth-divers-yard`.
3. The **"Oliis" set is split across the province**: `oliis-air-station`,
   `oliis-drake-deep`, `oliis-reef-harvest`, `naga-village-oliis` are 0.3–1.4 km
   from Lilmoth (right bay); `oliis-ferry-stage`/`oliis-boardwalk` are 3.3 km away
   beside Soulrest (wrong bay).
4. Named-water ties broken: `keel-sakka-stilts` is 2232 m from the Keel-Sakka
   river (`river.720-1110`) and stands on `body.ocean`; `alessian-hull` ("eight to
   fifteen metres of salt water, on the reef line") stands on dry ground 310 m
   from swamp and 2952 m from its own `whitebone-reef`.
5. Terrain promises still red: `lilmoth` (`cut:depthClass no-water`,
   `cut:waterRelation no-wet-channel` — the lighter channel is not in the frozen
   water) and `oliis-drake-deep` (dot depth 1.87 m against a 40 m sinkhole and a
   6 m dark pool).
6. `bog-blight-ground-murkmire`'s shipped `nearPoint` breach is **749 m against a
   400 m cap** — worse than the 438.7 m the plot reports, so the plot's number and
   the shipped record disagree.
7. B5: `oliis-ferry-stage` berths in 1.11 m where a ferry needs 1.2 m; every other
   `travelStation` either reaches ≥ 1.2 m inside 150 m or sits on `body.ocean`.
   Lilmoth's authored lighter berth does have ocean water (record 106.36 m) but
   lies ~83 m **outside** the city's `footprintPolygon`.
8. A7: four records deviate ≥ 2 danger bands from their ground
   (`oliis-ferry-stage`, `mudfoot`, `sunkfoot`, `cold-light`). D4
   `root-gallery-murkmire` sits 1126 m from Soulrest — inside the 1.2 km
   no-D4 hinterland.
9. Footprint (A6) clears everywhere except the four boundTo/city pairs that are
   allowed to abut; the only unexplained one is `oliis-ferry-stage` /
   `oliis-boardwalk` at 96 m against a 160 m sum, which their `boundTo` covers.
10. Seven `danglingRelations` in the zone are prose names ("Oliis Bay", "coast
    road", "the Soulrest river") used as ids — a vocabulary fix, not a move.

Live records 65 · by densityLayer: destination 35, fine-tempo 22, landmark 8.
Status counts over all 140 rows: deferred 75, active 49, abandoned 6, drowned 5,
ruined 5.

## 1. Records that moved > 150 m (live, all listed)

`to` is the new `positionM` [east, south].

| id | type | moved m | to |
|---|---|---|---|
| `lilmoth-divers-yard` | salvage-divers-yard | 4055 | 398, 5486 |
| `topal-salt-pans` | salt-pans | 3199 | 918, 7060 |
| `villa-cellars` | flooded-passage | 3180 | 3366, 6612 |
| `wraxu-stacks` | bird-colony | 3056 | 686, 6106 |
| `ashfield` | derelict-plantation | 3050 | 606, 5240 |
| `coast-road-stage` | road-stage | 3047 | 658, 6007 |
| `keshu-grove` | hero-hist-grove | 3039 | 765, 6270 |
| `wraxu-frieze` | art-and-destroy-site | 2877 | 318, 6575 |
| `high-junction` | platform-ladder-tower | 2869 | 754, 7047 |
| `keel-sakka-stilts` | stilt-village | 2823 | 1538, 6824 |
| `insular-jungle-village` | burn-scar-village | 2800 | 3562, 4872 |
| `oliis-air-station` | air-pocket-grotto | 2745 | 3512, 6024 |
| `oliis-drake-deep` | sea-drake-deep | 2721 | 3265, 5075 |
| `hammock-crown-murkmire` | hammock-crown-terrace | 2681 | 392, 6822 |
| `hammock-village-murkmire` | plague-abandoned-village | 2661 | 1352, 6819 |
| `pilgrim-xanmeer` | tended-xanmeer | 2645 | 3304, 6221 |
| `quinrawl-anchorage` | pirate-anchorage | 2519 | 858, 5985 |
| `bereaved-village-murkmire` | bereaved-village | 2518 | 765, 5651 |
| `oliis-reef-harvest` | pearl-and-shell-bed | 2392 | 3276, 6643 |
| `alessian-hull` | wreck | 2375 | 908, 5108 |
| `long-bar-wreckers` | wrecker-beach | 2308 | 3123, 6342 |
| `glowfen-murkmire` | bioluminescent-water | 2270 | 712, 6199 |
| `teeba-enoo-court` | placation-court | 2068 | 3408, 6780 |
| `ixtaxh-xanmeer` | submerged-xanmeer | 1996 | 935, 5898 |
| `tempering-ground` | shadowscale-ground | 1591 | 398, 6671 |
| `hereguard-plantation` | estate-village | 1110 | 1045, 5201 |
| `mirtis-plantation` | derelict-plantation | 803 | 3244, 6336 |
| `chasepoint` | road-station-village | 725 | 748, 5865 |
| `mudfoot` | stilt-village | 680 | 1012, 5741 |
| `teeth-of-sithis` | sithis-temple | 607 | 3594, 5108 |
| `alten-meerhleel` | port-town | 463 | 3660, 6736 |
| `bog-blight-ground-murkmire` | bog-blight-ground | 436 | 3616, 6040 |
| `naga-village-oliis` | naga-highway-camp | 396 | 3414, 4889 |
| `soulrest-breaking-yard` | shipyard | 357 | 570, 6366 |
| `sealed-meer-murkmire` | sealed-xanmeer | 353 | 3265, 4965 |
| `rockpark` | plague-abandoned-village | 334 | 644, 4976 |
| `root-gallery-murkmire` | root-hollow-gallery | 324 | 880, 5355 |
| `cold-light` | lighthouse | 251 | 3452, 6885 |
| `inhabited-meer-murkmire` | inhabited-xanmeer-fort | 238 | 968, 6556 |
| `xinchei-konu` | stone-calendar | 232 | 792, 5130 |
| `head-of-tide` | head-of-navigation | 217 | 499, 6904 |
| `xhon-mehl-shrine` | beast-offering-shrine | 217 | 606, 5629 |
| `ashroot-village` | hist-village | 214 | 3869, 5563 |
| `moonmarch` | foreign-trading-station | 214 | 3951, 5760 |
| `pusbottom-barge` | vice-den | 205 | 3653, 6294 |
| `screen-watch` | mangrove-platform-village | 199 | 3995, 6002 |
| `bramman-river-ferry` | ferry-stage | 185 | 918, 6923 |
| `lighter-flotilla` | houseboat-flotilla | 154 | 513, 5519 |

Reference dots: `lilmoth` 3597, 6325 (61 m from its anchor, unmoved);
`soulrest` 528, 6424 (106 m from its anchor, unmoved).

## 2. Failing records, one row each

Distances: `dL` = to the Lilmoth record, `dS` = to the Soulrest record; water
kind is `plotFacts.water.kind`; depth is `survey.recorded_depth_m` at the dot.

| id · type · moved | rule / tie broken, measured | remedy candidates |
|---|---|---|
| `lilmoth-divers-yard` · salvage-divers-yard · 4055 | (1) `why.founding` (salvage from underneath **Lilmoth**): dL **3308 m** (> 400). Hard constraint "beside drowned ground" holds (on `body.ocean`, dist 0). (2) prose = under Lilmoth, water kind `ocean` at the wrong bay. (3) NN `lighter-flotilla` 120 m, no footprint breach. (5) lane 1051 m. | `pin-by-siting`: add `boundTo {place: place.mercantile-coast.lilmoth, maxM: 500}` and `nearPoint {x: 3597, z: 6325, maxM: 500}` (the HEAD dot 4417, 6023 is 837 m from Lilmoth and already too far) · or `meso-move` to the quay shelf beside `dock.lilmoth.diving-stair` (uv 0.5225, 0.8685 → 3853, 6404) |
| `lighter-flotilla` · houseboat-flotilla · 154 | (1) founding (Lilmoth is built over shallow water, goods are lightered ashore; the crews keep moorings between the anchorage and the quay): dL **3188 m**. (2) hard "sheltered saltwater with a reef or bar" vs water `ocean` at 12.3 m — salt is right, the bay is not. (6) `travelStation` lighter/boat: dot 0.0 m, deepest inside 150 m 106.36 m (`body.ocean`) — passes 0.6 m only off the dot. | `pin-by-siting`: `nearPoint {x: 3880, z: 6380, maxM: 400}` (Lilmoth roadstead, between `dock.lilmoth.lighter-quay` 3902, 6366 and the lane end) · `merge` with `lilmoth-divers-yard` is NOT proposed (different trades, 120 m apart) |
| `keel-sakka-stilts` · stilt-village · 2823 | (1) founding (the first village **up the Keel-Sakka river from Lilmoth**): nearest named Keel-Sakka reach `river.720-1110` is **2232 m**; dL **2119 m**. (2) hard "built over water at the highest seasonal level, piled to the bed" vs `plotFacts.water` `body.ocean` — it is over the sea, not the river. (4) D1 on ground band 0. (6) boat station: depth 106.36 m, lane 293 m. | `pin-by-siting`: `nearPoint` on the Keel-Sakka reach 200 m above its mouth (`river.731-1121` mouth is 464 m from Lilmoth) with `maxM: 150`, region classes to the channel set · `re-type` only if the owner wants a sea-stilt village, which loses the lore tie |
| `oliis-ferry-stage` · ferry-stage · 0 (unmoved, its neighbours left) | (1) name + hard "at a water narrows the coast road must cross" and the Oliis tie: dL **3273 m**, dS 525 m — it is on the Soulrest estuary, not Oliis Bay. (5) nearest road 403 m > 220 (A8, network role); nearest lane 623 m. (6) B5 ferry needs 1.2 m; dot depth **1.11 m** (deepest inside 150 m 106.36 m). (4) D1 on ground band 3 (Δ2). | `re-type`/`prose-rewrite` to a Soulrest-estuary crossing and rename off "Oliis" · OR `pin-by-siting` back to Oliis Bay: `nearPoint {x: 3760, z: 6300, maxM: 400}` with `boundTo` to `oliis-boardwalk` kept (they are 96 m apart and move together) |
| `oliis-boardwalk` · boardwalk-village · — | Same displacement: dL 3355 m, dS 528 m; lane 617 m; `boundTo oliis-ferry-stage` 96 m (holds). Depth 106.36 m on `body.ocean`. | move with `oliis-ferry-stage` (single `pin-by-siting` on the bound pair) |
| `alessian-hull` · wreck · 2375 | (1) hard (on the reef line, in eight to fifteen metres of salt water) — the dot is **dry** (depth 0.0, nearest water `swamp` `body.611-2937` at **310 m**); "within a boat-hour of `soulrest`" holds (1370 m); `relations.dependsOn whitebone-reef` is **2952 m** away (quests/25 §20e wants the same salvage ground). (2) prose says 11 m of salt water, record says fresh swamp 310 m off. (8) `xinchei-konu` 117 m. | `pin-by-siting`: put it on the reef — `nearPoint` on `whitebone-reef` (3814, 5920) `maxM: 600` plus `regionClasses` ocean-only; the reef itself needs §3 first · `cut` is not needed: the quest provision `quest.provision.wreck-eye-lens` rides on it |
| `whitebone-reef` · reef · 0 | (1) hard (a submerged bar in navigable water across the bay mouth): `plotFacts.water` is **`swamp` `body.1209-3032`, level 0.84 m**, not sea; depth record 7.75 m. dL 460 m. (2) a coral/shell reef on interior swamp is a prose/record mismatch. | `pin-by-siting` onto `body.ocean` at the Oliis Bay mouth (ocean water is 291 m south-east of the dot) · or `prose-rewrite` to a shell bar in the estuary if the owner prefers the dot |
| `oliis-drake-deep` · sea-drake-deep · 2721 | terrainPromise: requests a 40 m `bay-floor-sinkhole` and a `dark-from-surface` pool; measured depth at the dot **1.87 m** (needs ≥ 6.0 pool, 40 sinkhole). (1) hard "deep standing salt water over a bay floor" vs `plotFacts.water` `swamp`, dL 1293 m, open water 1287 m away. (3) `sealed-meer-murkmire` 110 m. (7) `boundTo oliis-air-station` 980 m ≤ 1200, LoS true. | `pin-by-siting` onto deep ocean inside 1200 m of `oliis-air-station` (3512, 6024) — the ocean body carries 106 m and satisfies both promises without a cut · `cut` the sinkhole request if it moves onto real ocean |
| `lilmoth` · rebuilt-stilt-city · 0 | typedSiting `terrainPromise cut:depthClass no-water` + `cut:waterRelation no-wet-channel`: the `lighter-quay-channel` cut (12 × 100 m, navigable, tidal) is not in the frozen water — deepest water inside 150 m of the centre is **0.49 m**, `plotFacts.water` `marsh-fringe` 128.4 m off. The authored `dock.lilmoth.lighter-quay` (uv 0.529192, 0.863633 → **3902, 6366**) does stand on `body.ocean` but is ~83 m outside `footprintPolygon` (max east 3819). (3) `pusbottom-barge` 63 m and `sacked-customs-suburb` 67 m are inside the polygon — both carry `boundTo lilmoth`, so A6 is satisfied. (10) `danglingRelations`: `reachedVia` "Oliis Bay", "the north-gate road". | `prose-rewrite` the promise note to the water that exists (the lane already ends at the ocean berth) · or keep the cut and let the 16g water pass realise it · `pin-by-siting` not proposed: the city is on its anchor |
| `bog-blight-ground-murkmire` · bog-blight-ground · 436 | typedSiting `maxFromM sacred 438.7 > 400`; the **shipped** `sitingPrefs.nearPoint` (4365, 6059) is **749 m** from the dot (3616, 6040) against `maxM 400` — the plot's 438.7 and the record disagree. Hard "on the pole-ground the bereaved village of Sees-No-Root buries in": `bereaved-village-murkmire` is now at 765, 5651 — **2850 m** away. | `pin-by-siting`: one `nearPoint` on the re-sited `bereaved-village-murkmire`, `maxM 400` · or `meso-move` ≤ 150 m only after the bereaved village is fixed — the two must be solved as a pair |
| `bereaved-village-murkmire` · bereaved-village · 2518 | see above: it carries the grave-pole field `bog-blight-ground-murkmire` claims; the pair is now 2850 m apart. | `pin-by-siting` on the pair (co-site within 400 m) |
| `white-rose-prison` · prison-ruin · 0 | (1) hard (within 400 m of the Bogmother causeway, `route.road.helstrom-blackrose`) — that road is **cut**: nearest route of any kind is `route.road.gideon-soulrest` at **1025 m**. Its prose names a causeway that no longer exists. (4) D4 on band 4, fine. | `prose-rewrite` the hard constraint and the founding sentence off the cut road (Helstrom is reached by water and root, owner 2026-09-16) · then `pin-by-siting` to the marsh-ringed ground it does have |
| `alten-meerhleel` · port-town · 463 | (1) founding (an outsider-facing port **north-west of Lilmoth**): the dot is 63 m **east** and 411 m **south** of Lilmoth — south-south-east, dL 416 m. quests/20 §12b depends on the record. (2) water `ocean` at 27.4 m — the port water is right. (3) footprint 140 m, no breach; lane 99 m; road 357 m > 220 (A8 for a port is satisfied by the lane). | `prose-rewrite` the direction ("below the city on the bay's south shore"), or `pin-by-siting` `nearPoint` north-west of Lilmoth on ocean within 700 m |
| `pusbottom-barge` · vice-den · 205 | quests/25 §20e: the barge moored off the sunken quarter, on the **water side of the stilts**. The dot is **dry** (depth 0.0) with `marsh-fringe` water 81.5 m away; hard constraint "a mooring is half the type" is unmet. dL 63 m (inside the polygon, `boundTo` holds, LoS true). | `meso-move` ≤ 150 m onto the water east of the city (the 1.04 m marsh-fringe cells on the polygon's west edge, or the ocean berth at 3902, 6366) — a mooring must sit on water |
| `keshu-grove` · hero-hist-grove · 3039 | (1) Keshu the Black Fin is Murkmire's hero; the grove now sits **282 m from Soulrest** (dS 282, dL 2833) — inside the city's social ring, clearing Soulrest's 230 m + 45 m footprint by 7 m. `heroHist` status `reserve`. Hard "spring or still water at the root" vs `swamp` at 22.6 m (acceptable). (8) `glowfen-murkmire` 89 m. | `pin-by-siting` back into the Murkmire hinterland (`minFromClassM {city: 800}`) — a reserve hero grove on a city's doorstep reads as city dressing · `meso-move` cannot fix 282 m |
| `root-gallery-murkmire` · root-hollow-gallery · 324 | A7: D4 lair **1126 m** from Soulrest — inside the 1.2 km no-D4-lair hinterland. | `pin-by-siting` `minFromClassM {city: 1300}` · or `re-type` down to D3 |
| `mudfoot` · stilt-village · 680 | A7: D2 on ground band **4** (Δ2, lived-in class allows ±1). (5) road 38 m. (6) boat station: deepest inside 150 m **1.37 m** ≥ 1.2 (passes). | `pin-by-siting` onto band ≤ 3 ground within 300 m · or `re-type` the danger to D3 with a stated reason |
| `sunkfoot` · drowned-village · 0 | A7: D2 on band **0** (Δ2). Depth 106.36 m on `body.ocean`, lane 112 m — the water is right. | `re-type` danger to D1, or `prose-rewrite` the hazard that justifies D2 |
| `cold-light` · lighthouse · 251 | A7: D2 on band **0** (Δ2). Lane 120 m, road 526 m; on `body.ocean`. | as `sunkfoot` |
| `oliis-air-station` · air-pocket-grotto · 2745 | (1) "Oliis" tie holds (dL 313 m) but the dot is `swamp` (`body.1209-3032`) at depth 7.75 m, not bay water; it is 313 m from the city centre — inside Lilmoth's 1.2 km hinterland with `dangerTier` D3 (allowed: not hostile, not D4). (7) bound pair with `oliis-drake-deep` holds. | `prose-rewrite` to an estuary grotto, or move with `oliis-drake-deep` onto bay water |
| `screen-watch` · mangrove-platform-village · 199 | (7) `boundTo bramman-screen` 899 m against `maxM 900` — passes by 1 m; **line of sight is false** (eye 1.7/8.0) for a watch post whose job is to see the screen. (5) `travelStation` boat/pilot: dot depth 0.0, road 536 m, lane 349 m. | `meso-move` ≤ 150 m onto ground with LoS to `bramman-screen` (3995, 6002 → toward the screen), which also cuts the 899 m to ~800 m |
| `soulrest-breaking-yard` · shipyard · 357 | Hard "a deep shelving launch": depth at the dot **0.33 m**, water `marsh-fringe` 5.5 m off. (3) 71 m from Soulrest against a 295 m footprint sum — allowed only if `mayAbut`/`boundTo`; the plot records it as a `bound` check, the shipped `sitingPrefs` carries **no** `boundTo` block. | `pin-by-siting`: add the missing `boundTo {place: soulrest, maxM: 200}` so the abutment is typed, plus `nearPoint` on the ≥ 1.2 m shelf (the 2.15 m cells at `soulrest-divers-yard`, 210 m from the city) |
| `inhabited-meer-murkmire` · inhabited-xanmeer-fort · 238 | Hard (within sight of the **Soulrest-Blackrose road**, not on it): nearest route is `route.road.gideon-soulrest` at **399 m**; `nearPoint` (1203.6, 6588.4) is 239 m — inside its 250 m cap. The road it names is not the road nearest it. | `prose-rewrite` the road name to the one it watches, or `pin-by-siting` onto the Soulrest–Blackrose line |
| `topal-salt-pans` · salt-pans · 3199 | (1) "Topal" ties it to Topal Bay (`sea.topal-bay`, the south-west water off Soulrest); the dot 918, 7060 is on `body.ocean` at the south coast, 746 m from Soulrest — tie holds. (4) D1 on band 0. Listed for the 3.2 km move only; no failure found. | none |
| `head-of-tide` · head-of-navigation · 217 | (5) A8 network role: road **373 m** > 220 (lane 35 m). (1) `reachedVia "the Soulrest river"` is a dangling id. (6) boat station: dot 0.0 m, 106.36 m inside 150 m. | `pin-by-siting` within 220 m of the coast track once `route.track.mercantile-coast.coast-road` is solved · `prose-rewrite` the relation to the graph id |
| `coast-road-stage`, `high-junction`, `chasepoint`, `mudfoot`, `wraxu-stacks`, `glowfen-murkmire` | all sit ≤ 102 m from `route.road.gideon-soulrest` — A8 fine — but all six moved ~3 km **onto the Gideon–Soulrest road**, which is why the zone's east side emptied. Reported, not a failure. | none individually; see §5 |
| `hull-hall`, `oliis-wreck`, `sunken-causeway` | `deferred`, no `positionM`. `hull-hall` hard `on, in or beside water`; `oliis-wreck` `aground on a tidal flat, dry at low water`. Nothing to measure. | leave deferred |

## 3. Underwater entries, wrecks and dive depths

Depth is the record depth at the dot (`survey.recorded_depth_m`); kind is
`survey.water_at`. Dive needs ≥ 1.0 m, a hull ≥ 1.5 m.

| id | type | depth m | water at the dot | verdict |
|---|---|---|---|---|
| `alessian-hull` | wreck | 0.0 | dry; `swamp` 310 m off | FAIL (needs 8–15 m salt) |
| `oliis-wreck` | wreck | — | deferred, no dot | n/a |
| `hull-hall` | wreck | — | deferred, no dot | n/a |
| `ixtaxh-xanmeer` | submerged-xanmeer | 1.37 | `swamp` | dive OK (≥ 1.0) |
| `lilmoth-divers-yard` | salvage-divers-yard | 106.36 | `body.ocean` | depth OK, place wrong (§2) |
| `soulrest-divers-yard` | salvage-divers-yard | 2.15 | `marsh-fringe` | OK |
| `oliis-air-station` | air-pocket-grotto | 7.75 | `swamp` | depth OK |
| `oliis-drake-deep` | sea-drake-deep | 1.87 | `swamp` | FAIL vs 6.0/40 promise |
| `whitebone-reef` | reef | 7.75 | `swamp` | depth OK, salt wrong |
| `oliis-reef-harvest` | pearl-and-shell-bed | 106.36 | `body.ocean` | OK |
| `sunkfoot` | drowned-village | 106.36 | `body.ocean` | OK |
| `villa-cellars` | flooded-passage | 0.0 | dry; `ocean` 11 m off | FAIL for a flooded passage |
| `quinrawl-anchorage` | pirate-anchorage | 1.37 | `swamp` | hull 1.5 m NOT met; canoe/boat OK |
| `glowfen-murkmire` | bioluminescent-water | 0.0 | dry; `swamp` 22.6 m off | FAIL (water is the type) |
| `xhon-mehl-shrine` | beast-offering-shrine | 0.0 | `horizontal-channel` 11 m off | marginal |
| `head-of-tide`, `bramman-river-ferry`, `oliis-boardwalk`, `keel-sakka-stilts` | water roles | 0.0 / 0.0 / 106.36 / 106.36 | see §4 | see §4 |

Remedies for the three water-identity FAILs (`villa-cellars`, `glowfen-murkmire`,
`quinrawl-anchorage` hull class): `meso-move` ≤ 150 m onto the wet cell each is
11–23 m from — all three are within one meso step of their own water.

## 4. Travel stations, B5 hull depths, A8 route distance

`max150` is the deepest published record depth within 150 m.

| id | modes | need m | dot m | max150 m | lane m | road m | verdict |
|---|---|---|---|---|---|---|---|
| `lilmoth` | boat, lighter | 1.2 | 0.0 | **0.49** | 244 | 29 | FAIL at the centre; the authored berth (3902, 6366) is on `body.ocean` |
| `soulrest` | boat, ferry | 1.2 | 0.0 | **0.71** | 108 | 3 | FAIL at the centre; `soulrest-divers-yard` 210 m off reaches 2.15 m |
| `oliis-ferry-stage` | ferry, boat | 1.2 | **1.11** | 106.36 | 623 | 403 | FAIL on the dot, passes 100 m off; A8 road 403 > 220 |
| `alten-meerhleel` | boat, lighter | 1.2 | 0.0 | 106.36 | 99 | 357 | PASS (ocean inside 150 m) |
| `bramman-river-ferry` | ferry, guide | 1.2 | 0.0 | 106.36 | 159 | 562 | PASS |
| `bright-throat-village` | boat | 1.2 | 0.0 | 106.36 | 14 | 560 | PASS |
| `head-of-tide` | boat, porter | 1.2 | 0.0 | 106.36 | 35 | 373 | PASS on depth; A8 road 373 > 220 |
| `keel-sakka-stilts` | boat | 1.2 | 106.36 | 106.36 | 293 | 809 | PASS on depth, wrong water (§2) |
| `lighter-flotilla` | lighter, boat | 0.6 | 0.0 | 106.36 | 1012 | 435 | PASS on depth; 1012 m off the lane |
| `moonmarch` | boat | 1.2 | 0.0 | **2.36** | 551 | 651 | PASS |
| `mudfoot` | boat | 1.2 | 0.0 | **1.37** | 933 | 38 | PASS (0.17 m of margin) |
| `oliis-boardwalk` | boat | 1.2 | 106.36 | 106.36 | 617 | 462 | PASS |
| `quinrawl-anchorage` | boat | 1.2 | 1.37 | 1.37 | 644 | 101 | PASS for a boat, FAIL for a keel (3.0) |
| `screen-watch` | boat, pilot | 1.2 | 0.0 | 106.36 | 349 | 536 | PASS |

## 5. Harbour stations (a)

Live records within 600 m of each `cityLayout.centre`, ordered by distance.
"lane" is the nearest waterway lane; `wk` is `plotFacts.water.kind`.

### Lilmoth (centre 3597, 6325)

| id | m from centre | lane m (lane) | wk (dist m) | depth m | station? |
|---|---|---|---|---|---|
| `pusbottom-barge` | 63 | 225 soulrest-lilmoth | marsh-fringe (81.5) | 0.0 | no |
| `sacked-customs-suburb` | 67 | 233 soulrest-lilmoth | marsh-fringe (119.8) | 0.0 | no |
| `bog-blight-ground-murkmire` | 286 | 431 | swamp (5.5) | 0.0 | no |
| `pilgrim-xanmeer` | 311 | 413 blackrose-lilmoth | marsh-fringe (16.5) | 0.0 | no |
| `oliis-air-station` | 313 | 516 | swamp (0.0) | 7.75 | no |
| `mirtis-plantation` | 354 | 285 | marsh-fringe (5.5) | 0.0 | no |
| `villa-cellars` | 369 | **28** blackrose-lilmoth | ocean (11.0) | 0.0 | no |
| `slaughter-memorial` | 404 | 398 | marsh-fringe (32.0) | 0.0 | no |
| `alten-meerhleel` | 416 | **99** | ocean (27.4) | 0.0 | **yes** |
| `bramman-screen` | 432 | **31** soulrest-lilmoth | ocean (7.8) | 0.0 | no |
| `oliis-reef-harvest` | 452 | **4** | ocean (0.0) | 106.36 | no |
| `whitebone-reef` | 460 | 455 | swamp (0.0) | 7.75 | no |
| `long-bar-wreckers` | 474 | 240 | marsh-fringe (11.0) | 0.0 | no |
| `teeba-enoo-court` | 493 | **14** | ocean (0.0) | 106.36 | no |
| `screen-watch` | 513 | 349 lilmoth-archon | swamp (5.5) | 0.0 | yes |
| `sunkfoot` | 523 | **112** | ocean (0.0) | 106.36 | no |
| `hist-less-fringe` | 552 | 288 | marsh-fringe (39.9) | 0.0 | no |
| `cold-light` | 578 | **120** | ocean (0.0) | 106.36 | no |

Standing at a lane's water edge (lane ≤ 60 m, water kind ocean/reach/lagoon):
`oliis-reef-harvest` (4 m, 106.36 m), `teeba-enoo-court` (14 m, 106.36 m),
`villa-cellars` (28 m, dry dot), `bramman-screen` (31 m, dry dot). Only
`alten-meerhleel` among Lilmoth's near records is a declared `travelStation`.

**Lilmoth's own quay (b).** `travelStation` modes boat + lighter; the blueprint
socket `station.lilmoth.lighter-quay` sits in `district.lilmoth.lighter-quay`,
whose ten boundary points measure 0.0 m depth at seven of them (16–42 m from
water) and **106.36 m (`body.ocean`)** at the three seaward points (3808, 6436 /
3827, 6436 / 3908, 6368). `dock.lilmoth.lighter-quay` at 3902, 6366 is on one of
those ocean cells, so **the water at the quay side is ≥ 0.6 m — the answer is
yes** — but the berth lies ~83 m outside the city's `footprintPolygon`. The
polygon's own wet cells (west edge, 1.04 m marsh-fringe) are the only water
inside the city.

### Soulrest (centre 528, 6424)

| id | m from centre | lane m | wk (dist m) | depth m | station? |
|---|---|---|---|---|---|
| `soulrest-quay-tradehouse` | 53 | 59 | marsh-fringe (66.0) | 0.0 | no |
| `soulrest-breaking-yard` | 71 | 173 | marsh-fringe (5.5) | 0.33 | no |
| `soulrest-divers-yard` | 210 | 101 | marsh-fringe (0.0) | **2.15** | no |
| `wraxu-frieze` | 258 | **31** | ocean (19.8) | 0.0 | no |
| `tempering-ground` | 279 | 69 | horizontal-channel (60.3) | 0.0 | no |
| `keshu-grove` | 282 | 361 | swamp (22.6) | 0.0 | no |
| `glowfen-murkmire` | 291 | 386 | swamp (22.6) | 0.0 | no |
| `wraxu-stacks` | 355 | 458 | swamp (46.5) | 0.0 | no |
| `hammock-crown-murkmire` | 421 | **29** | ocean (16.5) | 0.0 | no |
| `coast-road-stage` | 437 | 543 | marsh-fringe (81.5) | 0.0 | no |
| `inhabited-meer-murkmire` | 459 | 452 | swamp (103.5) | 0.0 | no |
| `head-of-tide` | 481 | **35** | ocean (23.3) | 0.0 | **yes** |
| `oliis-ferry-stage` | 525 | 623 | marsh-fringe (0.0) | **1.11** | **yes** |
| `oliis-boardwalk` | 528 | 617 | ocean (0.0) | 106.36 | **yes** |
| `quinrawl-anchorage` | 549 | 644 | swamp (0.0) | 1.37 | **yes** |

Soulrest's only measured harbour depth inside 600 m is `soulrest-divers-yard`
(2.15 m, 101 m off the lane). The city's own `travelStation` (boat + ferry)
reaches only **0.71 m** within 150 m of the centre.

## 6. Pairs (b): boundTo, and live pairs within 150 m

All `sitingPrefs.boundTo` / `sightlineTo` pairs in the zone, with line of sight
at eye 1.7 / 8.0 m:

| a | field | b | m | maxM | LoS | footprint sum | verdict |
|---|---|---|---|---|---|---|---|
| `oliis-boardwalk` | boundTo | `oliis-ferry-stage` | 96 | 2000 | true | 160 | holds (abutting pair) |
| `oliis-drake-deep` | boundTo | `oliis-air-station` | 980 | 1200 | true | 75 | holds |
| `pusbottom-barge` | boundTo | `lilmoth` | 63 | 500 | true | 270 | holds |
| `sacked-customs-suburb` | boundTo + sightlineTo | `lilmoth` | 67 | 700 | true | 290 | holds |
| `screen-watch` | boundTo | `bramman-screen` | 899 | 900 | **false** | 95 | 1 m of margin, no sightline |
| `soulrest-divers-yard` | boundTo | `soulrest` | 210 | 500 | true | 275 | holds |
| `soulrest-quay-tradehouse` | boundTo | `soulrest` | 53 | 200 | true | 275 | holds |
| `wraxu-stacks` | boundTo + sightlineTo | `wraxu-frieze` | 596 | 1800 | true | 50 | holds |

`soulrest-breaking-yard` and `inhabited-meer-murkmire` appear in the plot's
`namedConstraintChecks` as a bound / sightline pair but carry **no typed block**
in the shipped record — the plot checked something the catalogue does not state.
Remedy: `pin-by-siting` (add the block) so the check has a record behind it.

Live pairs within 150 m (32). Those that name each other in `relations`:

| a | b | m | action |
|---|---|---|---|
| `bramman-river-ferry` | `topal-salt-pans` | 137 | co-site (relation) — a ferry stage and salt pans share the shore honestly |
| `lilmoth` | `sacked-customs-suburb` | 67 | nothing (boundTo, inside the polygon by design) |
| `oliis-boardwalk` | `oliis-ferry-stage` | 96 | nothing (boundTo) |
| `soulrest` | `soulrest-breaking-yard` | 71 | co-site (relation) — needs the typed `boundTo` above |
| `soulrest` | `soulrest-quay-tradehouse` | 53 | nothing (boundTo) |

The other 27 pairs do not name each other and share no `proseRefs`; the closest
unrelated ones are `lilmoth`/`pusbottom-barge` 63 m (covered by `boundTo`),
`bramman-screen`/`teeba-enoo-court` 86 m, `glowfen-murkmire`/`keshu-grove` 89 m,
`pilgrim-xanmeer`/`slaughter-memorial` 94 m, `oliis-reef-harvest`/`villa-cellars`
95 m. None breaches a footprint sum; all are reported, none proposed for merge.

## 7. Zone density (c)

16g ledger §2 line for this zone: **moved 60 · median 535.1 m · p90 3040.1 m ·
max 4055.2 m** (the max is `lilmoth-divers-yard`, confirmed here at 4055 m).

Live records 65, by `densityLayer`: destination 35, fine-tempo 22, landmark 8.
All 140 rows by status: deferred 75, active 49, abandoned 6, drowned 5, ruined 5.

## 8. Known-red terrain requests — not this region's

`world/sources/terrain/terrain-request-known-red.json` holds no
`mercantile-coast` row. The four the brief asked about belong elsewhere:
`the-divers-landing` and `the-slumped-hamlet` and `the-two-hundred-roofs` are
`place.dunmer-north.*`; `chasecreek` is `place.pirate-freeholds.chasecreek`.
They are that region's reviewers' rows, not ours. The two live red promises here
are the `lilmoth` cut and the `oliis-drake-deep` pool/sinkhole (§2). Neither
is registered in that file — the postcondition gate should be expected to fail
on them unless 16g re-sites or drops them.

## 9. Relations that name prose, not ids (`danglingRelations`, 7)

| from | field | to |
|---|---|---|
| `bramman-screen` | reachedVia | "Topal Bay" (→ `sea.topal-bay`) |
| `bright-throat-village` | visibleFrom | "Oliis Bay" (→ `sea.oliis-bay`) |
| `head-of-tide` | reachedVia | "the Soulrest river" |
| `lilmoth` | reachedVia | "Oliis Bay" (→ `sea.oliis-bay`), "the north-gate road" (→ `terminal.lilmoth.land-gate`) |
| `soulrest` | reachedVia | "Southern Sea lanes" (→ `route.boat.soulrest-lilmoth`), "coast road" (→ `route.track.mercantile-coast.coast-road`) |

Remedy for all seven: `prose-rewrite` into ids from `names.json` / the route
registry; none needs a move.

## 10. Relaxed records (14) and what they cost

`macro-plot.json.relaxedRecords` for this zone: `bog-blight-ground-murkmire`
(spacing-1/2-region-relaxed), `screen-watch` (same), `bramman-river-ferry`,
`head-of-tide`, `high-junction`, `mudfoot`, `oliis-boardwalk`,
`oliis-drake-deep`, `oliis-ferry-stage`, `sacked-customs-suburb`
(neighbour-zone), `hammock-village-murkmire`, `inhabited-meer-murkmire`
(relaxed-score), `soulrest-breaking-yard`, `topal-salt-pans` (region-relaxed).
Eight of the fourteen are among the failures in §2 — the relaxation stage is
where the Lilmoth/Oliis identities were traded away, so a fix that pins those
records by siting removes most of this list at the same time.
