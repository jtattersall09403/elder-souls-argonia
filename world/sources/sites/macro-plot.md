# Macro plot — coverage report (Phase 11 Part 3)

Seed 1103. Supply: 1172 scour sites + 1998 free-ground points. Demand: 580 live records; **580 plotted**, 0 unresolved.
Placed from the homeless batch: none.

| zone | live | plotted | homeless | landform wishes from recipe | top landforms |
|---|---|---|---|---|---|
| dunmer-north | 127 | 127 | 0 | 0 | any-firm-ground 67, cliff-bench 11, ridge-end 10, ravine 6 |
| hist-heartland | 116 | 116 | 0 | 0 | any-firm-ground 50, any-shallow-marsh 33, flood-high 4, summit 4 |
| imperial-fringe | 120 | 120 | 0 | 0 | any-firm-ground 79, ravine 10, ridge-end 10, gorge 5 |
| imperial-penal-south | 44 | 44 | 0 | 43 | any-firm-ground 14, any-shallow-marsh 8, cove 5, ford 5 |
| mercantile-coast | 65 | 65 | 0 | 65 | any-firm-ground 28, any-shallow-marsh 17, flood-high 5, islet 3 |
| naga-kur-deeps | 40 | 40 | 0 | 27 | any-shallow-marsh 25, flood-high 4, any-firm-ground 3, island 2 |
| pirate-freeholds | 31 | 31 | 0 | 0 | any-firm-ground 23, summit 2, anchor 1, cliff-bench 1 |
| saxhleel-coast | 37 | 37 | 0 | 0 | any-firm-ground 14, any-shallow-marsh 13, cove 2, flood-high 2 |

## Spacing and routes

- nearest-neighbour distance p5 / median / p95: 86 / 170 / 292 m
- same-type pairs closer than 300 m: 3
- median distance to a route: 206 m; fine-tempo records within 300 m of a route: 70 %
- route-visibility sweep (364 samples every 150 m, radius 450 m): mean 3.82 destination/landmark places in sight; dead 5 %, crowded (4+) 47 %

## Anti-sameyness quota (no type > 25 % of a zone)

- none

## Named constraints (sightline / bound), as plotted

| record | kind | to | m | line of sight |
|---|---|---|---|---|
| `place.dunmer-north.gandranen-library` | bound | `place.dunmer-north.gandranen-ruins` | 99 | — |
| `place.dunmer-north.mazzatun-hist` | bound | `place.dunmer-north.mazzatun` | 85 | — |
| `place.dunmer-north.murkwater-shadowscale-ground` | bound | `place.dunmer-north.murkwater` | 219 | — |
| `place.dunmer-north.stormhold-causeway` | bound | `place.dunmer-north.stormhold` | 245 | — |
| `place.dunmer-north.the-black-stage` | bound | `place.dunmer-north.stormhold-causeway` | 64 | — |
| `place.dunmer-north.the-diggings-ladder` | bound | `place.dunmer-north.silyanorn-diggings` | 187 | — |
| `place.dunmer-north.the-divers-landing` | bound | `place.dunmer-north.the-drowned-terrace` | 116 | — |
| `place.dunmer-north.the-drawdown-flats` | bound | `place.dunmer-north.the-drowned-terrace` | 148 | — |
| `place.dunmer-north.the-first-count` | sightline | `place.dunmer-north.stormhold` | 334 | True |
| `place.dunmer-north.the-flu-cordon` | sightline | `place.dunmer-north.stillrise-village` | 280 | True |
| `place.dunmer-north.the-outer-silyanorn` | sightline | `place.dunmer-north.stormhold` | 357 | True |
| `place.dunmer-north.the-pen-yard` | sightline | `place.dunmer-north.the-dres-rows` | 214 | True |
| `place.dunmer-north.the-pen-yard` | bound | `place.dunmer-north.the-dres-rows` | 214 | — |
| `place.dunmer-north.the-silyanorn-crown` | sightline | `place.dunmer-north.the-outer-silyanorn` | 147 | True |
| `place.dunmer-north.the-silyanorn-crown` | bound | `place.dunmer-north.the-outer-silyanorn` | 147 | — |
| `place.dunmer-north.the-slumped-hamlet` | sightline | `place.dunmer-north.the-shut-village` | 162 | True |
| `place.dunmer-north.the-standing-bid` | sightline | `place.dunmer-north.stormhold` | 497 | True |
| `place.dunmer-north.the-standing-bid` | bound | `place.dunmer-north.stormhold` | 497 | — |
| `place.dunmer-north.the-stormhold-falls-chamber` | bound | `place.dunmer-north.stormhold` | 410 | — |
| `place.dunmer-north.the-stripped-village` | bound | `place.dunmer-north.the-field-gate-garrison` | 920 | — |
| `place.dunmer-north.the-thorn-bond` | bound | `place.dunmer-north.thorn` | 143 | — |
| `place.dunmer-north.the-veterans-ridge` | sightline | `place.dunmer-north.tear-road-stage` | 812 | True |
| `place.dunmer-north.thorn-paddy-terraces` | bound | `place.dunmer-north.thorn` | 230 | — |
| `place.dunmer-north.waits-for-the-trial` | sightline | `place.dunmer-north.hissmir` | 154 | True |
| `place.dunmer-north.waits-for-the-trial` | bound | `place.dunmer-north.hissmir` | 154 | — |
| `place.hist-heartland.bereaved-mnemic` | bound | `place.hist-heartland.walkway-junction-high-crossroads` | 1553 | — |
| `place.hist-heartland.guide-camp-far-shelter` | bound | `place.hist-heartland.guide-camp-gate-side` | 887 | — |
| `place.hist-heartland.guide-camp-gate-side` | bound | `place.hist-heartland.helstrom` | 293 | — |
| `place.hist-heartland.miregaunt-ward-approach` | bound | `place.hist-heartland.sealed-xanmeer-living` | 1303 | — |
| `place.hist-heartland.root-gallery-helstrom-underway` | bound | `place.hist-heartland.helstrom` | 139 | — |
| `place.hist-heartland.rootworm-station-helstrom` | bound | `place.hist-heartland.helstrom` | 235 | — |
| `place.hist-heartland.sap-tapping-licensed` | sightline | `place.hist-heartland.harmed-hist-tapped` | 393 | False |
| `place.hist-heartland.vista-ledge-canopy-break` | sightline | `place.hist-heartland.helstrom` | 1285 | True |
| `place.hist-heartland.xal-krona-making-ground` | bound | `place.hist-heartland.lost-city` | 61 | — |
| `place.imperial-fringe.ashen-tower` | sightline | `place.imperial-fringe.fort-swampmoth` | 462 | True |
| `place.imperial-fringe.bone-road-waystation` | bound | `place.imperial-fringe.the-counted-dead` | 478 | — |
| `place.imperial-fringe.cassian-farm` | bound | `place.imperial-fringe.gideon` | 869 | — |
| `place.imperial-fringe.castle-giovesse` | sightline | `place.imperial-fringe.gideon` | 383 | True |
| `place.imperial-fringe.collections-dig` | bound | `place.imperial-fringe.twyllbek-ruins` | 135 | — |
| `place.imperial-fringe.fort-swampmoth` | sightline | `place.imperial-fringe.mile-house-of-the-eagle` | 103 | True |
| `place.imperial-fringe.gideon-rootworm-terminus` | bound | `place.imperial-fringe.gideon` | 233 | — |
| `place.imperial-fringe.gideon-synod-outstation` | bound | `place.imperial-fringe.gideon` | 213 | — |
| `place.imperial-fringe.giovesse-lines` | sightline | `place.imperial-fringe.castle-giovesse` | 1295 | True |
| `place.imperial-fringe.glenbridge` | sightline | `place.imperial-fringe.glenbridge-sermon-xanmeer` | 230 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | sightline | `place.imperial-fringe.glenbridge` | 230 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | bound | `place.imperial-fringe.glenbridge` | 230 | — |
| `place.imperial-fringe.ridge-runners-post` | sightline | `place.imperial-fringe.ashen-tower` | 324 | True |
| `place.imperial-fringe.the-abandoned-survey` | bound | `place.imperial-fringe.the-vellum-estate` | 392 | — |
| `place.imperial-fringe.the-drowning-gate` | sightline | `place.imperial-fringe.the-embankment-that-drowned` | 485 | True |
| `place.imperial-fringe.the-embankment-that-drowned` | sightline | `place.imperial-fringe.the-drowning-gate` | 485 | True |
| `place.imperial-fringe.the-marble-field` | sightline | `place.imperial-fringe.gideon` | 398 | True |
| `place.imperial-fringe.the-ring-of-nine-wells` | sightline | `place.imperial-fringe.twyllbek-ruins` | 575 | True |
| `place.imperial-fringe.the-sermon-road-camp` | bound | `place.imperial-fringe.glenbridge` | 447 | — |
| `place.imperial-fringe.the-shut-door` | sightline | `place.imperial-fringe.the-kept-terrace` | 756 | True |
| `place.imperial-fringe.the-snowline-cell` | sightline | `place.imperial-fringe.ridge-runners-post` | 389 | True |
| `place.imperial-fringe.the-stone-talkers-watch` | sightline | `place.imperial-fringe.rockgrove` | 546 | True |
| `place.imperial-fringe.twyllbek-crown` | sightline | `place.imperial-fringe.twyllbek-ruins` | 1408 | True |
| `place.imperial-penal-south.akaviri-works` | bound | `place.imperial-penal-south.lilmothiit-quarry` | 414 | — |
| `place.imperial-penal-south.blackrose-prison` | bound | `place.imperial-penal-south.blackrose` | 141 | — |
| `place.imperial-penal-south.drowned-gallery` | bound | `place.imperial-penal-south.blackrose-prison` | 439 | — |
| `place.imperial-penal-south.flu-quarantine-village` | bound | `place.imperial-penal-south.blackrose` | 380 | — |
| `place.imperial-penal-south.natural-dive-shaft` | bound | `place.imperial-penal-south.basin-sinkhole` | 437 | — |
| `place.imperial-penal-south.necromantic-dig` | bound | `place.imperial-penal-south.blackrose-prison` | 330 | — |
| `place.imperial-penal-south.plague-cordon` | bound | `place.imperial-penal-south.rose-supply-town` | 154 | — |
| `place.imperial-penal-south.prison-born-refuge` | bound | `place.imperial-penal-south.longmont` | 751 | — |
| `place.imperial-penal-south.rockspring` | bound | `place.imperial-penal-south.bramman-head` | 337 | — |
| `place.imperial-penal-south.rose-flooded-passage` | bound | `place.imperial-penal-south.blackrose-prison` | 105 | — |
| `place.imperial-penal-south.rose-outworks` | bound | `place.imperial-penal-south.blackrose-prison` | 228 | — |
| `place.imperial-penal-south.voriplasm-vault` | bound | `place.imperial-penal-south.bramman-head` | 386 | — |
| `place.mercantile-coast.inhabited-meer-murkmire` | sightline | `place.mercantile-coast.soulrest` | 688 | True |
| `place.mercantile-coast.oliis-boardwalk` | bound | `place.mercantile-coast.oliis-ferry-stage` | 1077 | — |
| `place.mercantile-coast.oliis-drake-deep` | bound | `place.mercantile-coast.oliis-air-station` | 344 | — |
| `place.mercantile-coast.pusbottom-barge` | bound | `place.mercantile-coast.lilmoth` | 290 | — |
| `place.mercantile-coast.sacked-customs-suburb` | sightline | `place.mercantile-coast.lilmoth` | 632 | True |
| `place.mercantile-coast.sacked-customs-suburb` | bound | `place.mercantile-coast.lilmoth` | 632 | — |
| `place.mercantile-coast.screen-watch` | bound | `place.mercantile-coast.bramman-screen` | 638 | — |
| `place.mercantile-coast.soulrest-breaking-yard` | bound | `place.mercantile-coast.soulrest` | 224 | — |
| `place.mercantile-coast.soulrest-divers-yard` | bound | `place.mercantile-coast.soulrest` | 152 | — |
| `place.mercantile-coast.soulrest-quay-tradehouse` | bound | `place.mercantile-coast.soulrest` | 68 | — |
| `place.mercantile-coast.wraxu-stacks` | sightline | `place.mercantile-coast.wraxu-frieze` | 642 | True |
| `place.mercantile-coast.wraxu-stacks` | bound | `place.mercantile-coast.wraxu-frieze` | 642 | — |
| `place.naga-kur-deeps.drifting-village-wet-mooring` | bound | `place.naga-kur-deeps.leviathan-bone-field` | 560 | — |
| `place.pirate-freeholds.alten-corimont` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 154 | True |
| `place.pirate-freeholds.corimont-crosstrees` | bound | `place.pirate-freeholds.alten-corimont` | 154 | — |
| `place.pirate-freeholds.freehold-market` | bound | `place.pirate-freeholds.alten-corimont` | 88 | — |
| `place.pirate-freeholds.freehold-smithy` | sightline | `place.pirate-freeholds.careening-hard` | 456 | True |
| `place.pirate-freeholds.freehold-smithy` | bound | `place.pirate-freeholds.alten-corimont` | 57 | — |
| `place.pirate-freeholds.kothringi-river-ruin` | bound | `place.pirate-freeholds.alten-corimont` | 247 | — |
| `place.pirate-freeholds.opening-work-barge` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 123 | True |
| `place.pirate-freeholds.opening-work-barge` | bound | `place.pirate-freeholds.alten-corimont` | 181 | — |
| `place.pirate-freeholds.opening-work-camp` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 97 | True |
| `place.pirate-freeholds.opening-work-camp` | bound | `place.pirate-freeholds.opening-work-barge` | 100 | — |
| `place.pirate-freeholds.rim-keystone-chamber` | bound | `place.pirate-freeholds.rim-pass-station` | 338 | — |
| `place.pirate-freeholds.veterans-holding` | sightline | `place.pirate-freeholds.trunk-toll-bridge` | 665 | True |
| `place.saxhleel-coast.archon-bonded-row` | bound | `place.saxhleel-coast.archon` | 249 | — |
| `place.saxhleel-coast.archon-harbour-hist` | bound | `place.saxhleel-coast.archon` | 220 | — |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.archon` | 94 | True |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.padomaic-wrecker-beach` | 839 | True |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.outer-reef` | 563 | True |
| `place.saxhleel-coast.archon-lighthouse` | bound | `place.saxhleel-coast.archon` | 94 | — |
| `place.saxhleel-coast.archon-sacked-quarter` | bound | `place.saxhleel-coast.archon` | 288 | — |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | bound | `place.saxhleel-coast.archon` | 365 | — |
| `place.saxhleel-coast.archon-shipyard` | bound | `place.saxhleel-coast.archon` | 293 | — |
| `place.saxhleel-coast.coast-hist-less-refuge` | bound | `place.saxhleel-coast.archon` | 746 | — |
| `place.saxhleel-coast.contested-bank` | bound | `place.saxhleel-coast.quay-tradehouse` | 66 | — |
| `place.saxhleel-coast.east-estuary-rootworm-station` | bound | `place.saxhleel-coast.archon` | 242 | — |
| `place.saxhleel-coast.estuary-keepers-lodge` | bound | `place.saxhleel-coast.archon-lighthouse` | 453 | — |
| `place.saxhleel-coast.gap-reef` | sightline | `place.saxhleel-coast.archon-lighthouse` | 879 | True |
| `place.saxhleel-coast.gap-reef` | bound | `place.saxhleel-coast.archon-lighthouse` | 879 | — |
| `place.saxhleel-coast.mangrove-reef` | bound | `place.saxhleel-coast.tide-street-village` | 148 | — |
| `place.saxhleel-coast.oliis-coast-lay-by` | bound | `place.saxhleel-coast.archon` | 715 | — |
| `place.saxhleel-coast.padomaic-wrecker-beach` | sightline | `place.saxhleel-coast.archon-lighthouse` | 839 | True |
| `place.saxhleel-coast.padomaic-wrecker-beach` | bound | `place.saxhleel-coast.archon-lighthouse` | 839 | — |
| `place.saxhleel-coast.quarantine-village-lagoon` | bound | `place.saxhleel-coast.archon` | 530 | — |

## Records placed from the homeless batch

| record | stage | site |
|---|---|---|

## Dangling relations: 98 edges point at deferred/cut/unknown records

(Part 4 catalogue work: promote the depended-upon record or prune the edge. First 40:)

- `place.dunmer-north.hatching-pools`.patrols → `route.road.alten-corimont-stormhold` (unknown id)
- `place.dunmer-north.riverwalk`.tolls → `route.road.stormhold-thorn` (unknown id)
- `place.dunmer-north.stormhold`.tolls → `route.boat.stormhold-alten-corimont` (unknown id)
- `place.dunmer-north.the-drover-camp`.patrols → `route.road.thorn-tear-road` (unknown id)
- `place.dunmer-north.the-field-gate-garrison`.patrols → `route.road.thorn-tear-road` (unknown id)
- `place.dunmer-north.the-north-border-post`.patrols → `route.road.thorn-tear-road` (unknown id)
- `place.dunmer-north.the-two-gate-bridge`.tolls → `route.road.thorn-tear-road` (unknown id)
- `place.dunmer-north.the-xanmeer-hold`.patrols → `route.road.alten-corimont-stormhold` (unknown id)
- `place.dunmer-north.thorn`.tolls → `route.road.thorn-tear-road` (unknown id)
- `place.hist-heartland.bone-waystation-interior`.patrols → `route.track.hist-heartland.poling-stages` (unknown id)
- `place.hist-heartland.guide-camp-far-shelter`.patrols → `route.track.hist-heartland.basin-guide-crossing` (unknown id)
- `place.hist-heartland.guide-camp-gate-side`.patrols → `route.track.hist-heartland.basin-guide-crossing` (unknown id)
- `place.hist-heartland.helstrom`.reachedVia → `escorted boat convoy from Alten Corimont` (unknown id)
- `place.hist-heartland.helstrom`.reachedVia → `root transit (semi-public hub)` (unknown id)
- `place.hist-heartland.necropolis-dead-tenders`.patrols → `route.track.hist-heartland.poling-stages` (unknown id)
- `place.hist-heartland.nisswo-rest-house-interior`.patrols → `route.track.hist-heartland.helstrom-pilgrim-way` (unknown id)
- `place.hist-heartland.pilgrim-camp-hist-tsoko`.patrols → `route.track.hist-heartland.helstrom-pilgrim-way` (unknown id)
- `place.hist-heartland.pilgrim-camp-sap-road`.patrols → `route.track.hist-heartland.helstrom-pilgrim-way` (unknown id)
- `place.hist-heartland.porter-relay-poling`.patrols → `route.track.hist-heartland.poling-stages` (unknown id)
- `place.hist-heartland.refuge-station-interior`.patrols → `route.track.hist-heartland.basin-guide-crossing` (unknown id)
- `place.hist-heartland.root-gallery-helstrom-underway`.patrols → `route.track.hist-heartland.helstrom-underway` (unknown id)
- `place.hist-heartland.rootworm-station-helstrom`.patrols → `route.track.hist-heartland.helstrom-underway` (unknown id)
- `place.hist-heartland.stilt-channel-edge-uxaneet`.patrols → `route.track.hist-heartland.poling-stages` (unknown id)
- `place.hist-heartland.tended-xanmeer-pilgrim-way`.patrols → `route.track.hist-heartland.helstrom-pilgrim-way` (unknown id)
- `place.hist-heartland.wisp-lure-basin`.patrols → `route.track.hist-heartland.basin-guide-crossing` (unknown id)
- `place.imperial-fringe.ashen-tower`.patrols → `route.road.gideon-blackwood-road` (unknown id)
- `place.imperial-fringe.bone-road-waystation`.patrols → `route.road.bone-road-waystation-the-counted-dead` (unknown id)
- `place.imperial-fringe.cartwrights-cross`.patrols → `route.road.cartwrights-cross-fig-market` (unknown id)
- `place.imperial-fringe.cartwrights-cross`.tolls → `route.road.gideon-blackwood-road` (unknown id)
- `place.imperial-fringe.cartwrights-cross`.tolls → `route.road.gideon-stormhold` (unknown id)
- `place.imperial-fringe.castle-giovesse`.reachedVia → `route.gideon-north-track` (unknown id)
- `place.imperial-fringe.claywater-station`.dependsOn → `route.blackwood-road` (unknown id)
- `place.imperial-fringe.fort-greenditch`.patrols → `route.road.gideon-blackwood-road` (unknown id)
- `place.imperial-fringe.fort-swampmoth`.dependsOn → `route.blackwood-road` (unknown id)
- `place.imperial-fringe.fort-swampmoth`.patrols → `route.road.gideon-blackwood-road` (unknown id)
- `place.imperial-fringe.fort-swampmoth`.tolls → `route.road.gideon-blackwood-road` (unknown id)
- `place.imperial-fringe.gideon`.reachedVia → `route.blackwood-road` (unknown id)
- `place.imperial-fringe.giovesse-lines`.patrols → `route.road.gideon-stormhold` (unknown id)
- `place.imperial-fringe.glenbridge`.patrols → `route.road.glenbridge-the-road-nisswo-house` (unknown id)
- `place.imperial-fringe.glenbridge`.reachedVia → `route.pilgrim-way-blackwood` (unknown id)

## Landforms used

any-firm-ground 278, any-shallow-marsh 102, ridge-end 22, flood-high 17, ravine 17, cliff-bench 14, summit 14, cove 12, gorge 10, islet 10, saddle 10, water-narrows 10, anchor 9, spring-head 8, river-mouth 7, box-canyon 6, island 6, ford 5, isthmus 4, pinned (Part 6 meso siting) 4, waterfall 4, headland 3, land-bridge 3, oxbow 2, confluence 1, enclosed-clearing 1, natural-harbour 1

## Homeless batch (unresolved)

- none: every live record found ground

## Tier 0–1 placements

| record | site | landform | region | why |
|---|---|---|---|---|
| `place.dunmer-north.bogmother` | committed.bogmother | summit | firm lowland | summit in firm lowland (danger band 2), 351 m from the nearest route; its choice #2 landform; won on landform, region, danger. |
| `place.dunmer-north.gandranen-library` | committed.gandranen-library | cliff-bench | border mountains | cliff bench in border mountains (danger band 3), 1491 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, remote. |
| `place.dunmer-north.gandranen-ruins` | committed.gandranen-ruins | any-firm-ground | border mountains | firm ground in border mountains (danger band 3), 1393 m from the nearest route; at the water's edge; no free 'sinkhole' site was left in the zone, so plain ground; won on region, remote, water. |
| `place.dunmer-north.hatching-pools` | committed.hatching-pools | spring-head | firm lowland | spring head in firm lowland (danger band 2), 59 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.dunmer-north.hissmir` | committed.hissmir | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 258 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.dunmer-north.hixinoag` | committed.hixinoag | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 31 m from the nearest route; no free 'oxbow' site was left in the zone, so plain ground; won on region, parent, landform; site exchanged in the swap pass with place.dunmer-north.the-last-stone-course (+1.21). |
| `place.dunmer-north.hutan-tzel` | committed.hutan-tzel | cliff-bench | firm lowland | cliff bench in firm lowland (danger band 2), 206 m from the nearest route; at the water's edge; its choice #5 landform; won on region, landform, danger. |
| `place.dunmer-north.loriasel-caverns` | committed.loriasel-caverns | spring-head | upland hills | spring head in upland hills (danger band 3), 777 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, remote. |
| `place.dunmer-north.mazzatun` | committed.mazzatun | pinned (Part 6 meso siting) | upland hills | Pinned by the Part 6 meso siting (world/sources/blueprints/place.dunmer-north.mazzatun.json): The rock shelf at the ridge end: 68 m x 42 m of ground between 198.3 m and 209 m, falling ~8.5 m north to south in three readable steps, flood band 0, 4.1 m above the water table, a headwater stream along its southern lip and a 55 m escarpment on the east. 85 m from Tsono-Xuhil and 296 m from the Gideon-Stormhold road. Every parcel measured on this ground fits the slope ladder at plinth, pad or dug-in; none needs a graded pad over 2 m. |
| `place.dunmer-north.mazzatun-hist` | committed.mazzatun-hist | waterfall | upland hills | waterfall in upland hills (danger band 3), 219 m from the nearest route; at the water's edge; won on bound, region, danger. |
| `place.dunmer-north.stillrise-village` | committed.stillrise-village | box-canyon | lake & standing water | box canyon in lake & standing water (danger band 5), 1285 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, remote. |
| `place.dunmer-north.stormhold` | anchor.stormhold | anchor | firm lowland | Owner-approved settlement anchor 'stormhold' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.ten-maur-wolk` | committed.ten-maur-wolk | saddle | upland hills | saddle in upland hills (danger band 3), 1132 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, remote. |
| `place.dunmer-north.the-quiet-landing` | committed.the-quiet-landing | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 132 m from the nearest route; its choice #2 landform; won on landform, region, route. |
| `place.dunmer-north.the-standing-bid` | committed.the-standing-bid | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 17 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, sightline. |
| `place.dunmer-north.thorn` | anchor.thorn | anchor | firm lowland | Owner-approved settlement anchor 'thorn' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.wolk-market` | committed.wolk-market | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 61 m from the nearest route; at the water's edge; its choice #4 landform; won on route, landform, region. |
| `place.hist-heartland.bereaved-mnemic` | committed.bereaved-mnemic | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 5), 35 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, region. |
| `place.hist-heartland.cult-raid-camp-unbound` | committed.cult-raid-camp-unbound | flood-high | firm lowland | flood high in firm lowland (danger band 4), 332 m from the nearest route; its choice #4 landform; won on landform, region, route. |
| `place.hist-heartland.greenspring` | committed.greenspring | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 177 m from the nearest route; no free 'confluence' site was left in the zone, so plain ground; won on nearPoint, region, danger; site exchanged in the swap pass with place.hist-heartland.rootworm-burrow-dead (+0.56). |
| `place.hist-heartland.guide-camp-gate-side` | committed.guide-camp-gate-side | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 286 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on bound, region, parent. |
| `place.hist-heartland.helstrom` | anchor.helstrom | anchor | lake & standing water | Owner-approved settlement anchor 'helstrom' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.hist-heartland.heretic-stone-restarted` | committed.heretic-stone-restarted | ridge-end | upland hills | ridge end in upland hills (danger band 3), 182 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, route. |
| `place.hist-heartland.hist-agaceph-needle` | committed.hist-agaceph-needle | spring-head | tropical jungle | spring head in tropical jungle (danger band 4), 625 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.hist-first-rain-trunk` | committed.hist-first-rain-trunk | enclosed-clearing | rootland deep marsh | enclosed clearing in rootland deep marsh (danger band 5), 88 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent. |
| `place.hist-heartland.hist-paatru-lowcrown` | committed.hist-paatru-lowcrown | spring-head | rootland deep marsh | spring head in rootland deep marsh (danger band 4), 11 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, danger. |
| `place.hist-heartland.hist-sarpa-highflower` | committed.hist-sarpa-highflower | cliff-bench | rootland deep marsh | cliff bench in rootland deep marsh (danger band 5), 572 m from the nearest route; at the water's edge; won on region, remote, parent; site exchanged in the swap pass with place.hist-heartland.wild-hist-mad-one (+0.31). |
| `place.hist-heartland.lost-city` | committed.lost-city | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 5), 498 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.nightbound-lightless` | committed.nightbound-lightless | gorge | rootland deep marsh | gorge in rootland deep marsh (danger band 4), 420 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote. |
| `place.hist-heartland.refuge-station-interior` | committed.refuge-station-interior | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 718 m from the nearest route; its choice #3 landform; won on remote, landform, region. |
| `place.hist-heartland.root-gallery-cult-warren` | committed.root-gallery-cult-warren | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 548 m from the nearest route; its choice #5 landform; won on region, remote, landform. |
| `place.hist-heartland.root-gallery-helstrom-underway` | committed.root-gallery-helstrom-underway | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 138 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on bound, region, concealment. |
| `place.hist-heartland.root-talk-ground` | committed.root-talk-ground | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 880 m from the nearest route; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.rootworm-station-helstrom` | committed.rootworm-station-helstrom | flood-high | firm lowland | flood high in firm lowland (danger band 5), 99 m from the nearest route; its first-choice landform; won on landform, bound, region. |
| `place.hist-heartland.sap-collection-facility-daedric` | committed.sap-collection-facility-daedric | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 601 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on remote, region, parent; site exchanged in the swap pass with place.hist-heartland.umpholo-mission (+1.17). |
| `place.hist-heartland.sealed-xanmeer-living` | committed.sealed-xanmeer-living | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 506 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, remote, parent; site exchanged in the swap pass with place.hist-heartland.mist-locked-hollow-basin (+0.74). |
| `place.hist-heartland.stone-calendar-hist-tsoko` | committed.stone-calendar-hist-tsoko | summit | firm lowland | summit in firm lowland (danger band 3), 685 m from the nearest route; its first-choice landform; won on landform, route, region. |
| `place.hist-heartland.the-cut-circle` | committed.the-cut-circle | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 23 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.hist-heartland.umpholo-mission` | committed.umpholo-mission | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 809 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote; site exchanged in the swap pass with place.hist-heartland.sap-collection-facility-daedric (+1.17). |
| `place.hist-heartland.xal-krona-making-ground` | committed.xal-krona-making-ground | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 451 m from the nearest route; at the water's edge; no free 'box-canyon' site was left in the zone, so plain ground; won on bound, region, remote. |
| `place.hist-heartland.xal-meeruth-station` | committed.xal-meeruth-station | confluence | deep river corridor | confluence in deep river corridor (danger band 4), 6 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, nearPoint, route. |
| `place.hist-heartland.xanmeer-fort-defences-working` | committed.xanmeer-fort-defences-working | summit | firm lowland | summit in firm lowland (danger band 4), 710 m from the nearest route; its choice #2 landform; won on landform, region, remote. |
| `place.imperial-fringe.castle-giovesse` | committed.castle-giovesse | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 87 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on sightline, region, parent; placed from the homeless batch at stage 'spacing-1/2'. |
| `place.imperial-fringe.fort-swampmoth` | committed.fort-swampmoth | any-firm-ground | upland hills | firm ground in upland hills (danger band 2), 28 m from the nearest route; its choice #5 landform; won on route, sightline, region. |
| `place.imperial-fringe.gideon` | anchor.gideon | anchor | firm lowland | Owner-approved settlement anchor 'gideon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-fringe.gideon-rootworm-terminus` | committed.gideon-rootworm-terminus | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 233 m from the nearest route; at the water's edge; its choice #4 landform; won on bound, landform, region. |
| `place.imperial-fringe.glenbridge` | committed.glenbridge | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 646 m from the nearest route; its choice #3 landform; won on landform, sightline, region. |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | committed.glenbridge-sermon-xanmeer | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 832 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on bound, sightline, region. |
| `place.imperial-fringe.orma-tactile-ruin` | committed.orma-tactile-ruin | ravine | border mountains | ravine in border mountains (danger band 3), 1274 m from the nearest route; at the water's edge; its choice #2 landform; won on remote, landform, region; site exchanged in the swap pass with place.imperial-fringe.the-sunk-lane (+0.57). |
| `place.imperial-fringe.rockgrove` | committed.rockgrove | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1190 m from the nearest route; its choice #2 landform; won on landform, region, remote. |
| `place.imperial-fringe.slough-point` | committed.slough-point | water-narrows | firm lowland | water narrows in firm lowland (danger band 2), 6 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, danger. |
| `place.imperial-fringe.stonewastes` | committed.stonewastes | land-bridge | upland hills | land bridge in upland hills (danger band 3), 658 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, ring. |
| `place.imperial-fringe.the-silent-halls` | committed.the-silent-halls | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 462 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, submerged, remote. |
| `place.imperial-fringe.the-stone-talkers-watch` | committed.the-stone-talkers-watch | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1018 m from the nearest route; its choice #2 landform; won on landform, sightline, region. |
| `place.imperial-penal-south.blackrose` | anchor.blackrose | anchor | fringe marsh | Owner-approved settlement anchor 'blackrose' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-penal-south.blackrose-drowned-hist` | committed.blackrose-drowned-hist | cove | lake & standing water | cove in lake & standing water (danger band 3), 104 m from the nearest route; at the water's edge; won on region, submerged, parent; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.imperial-penal-south.drawdown-flat (+0.46). |
| `place.imperial-penal-south.blackrose-prison` | committed.blackrose-prison | flood-high | firm lowland | flood high in firm lowland (danger band 2), 140 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.bramman-head` | committed.bramman-head | water-narrows | fringe marsh | water narrows in fringe marsh (danger band 3), 344 m from the nearest route; at the water's edge; its first-choice landform; won on landform, nearPoint, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.chainbreaker-shelter` | committed.chainbreaker-shelter | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 93 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.flu-quarantine-village` | committed.flu-quarantine-village | island | fringe marsh | island in fringe marsh (danger band 2), 39 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lake-submerged-xanmeer` | committed.lake-submerged-xanmeer | isthmus | lake & standing water | isthmus in lake & standing water (danger band 4), 633 m from the nearest route; at the water's edge; won on region, remote, submerged; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.imperial-penal-south.lilmothiit-quarry (+0.75). |
| `place.imperial-penal-south.lilmothiit-quarry` | committed.lilmothiit-quarry | ford | lake & standing water | ford in lake & standing water (danger band 3), 452 m from the nearest route; at the water's edge; won on nearPoint, region, danger; placed from the homeless batch at stage 'spacing-1/2'; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.imperial-penal-south.lake-submerged-xanmeer (+0.75). |
| `place.imperial-penal-south.longmont` | committed.longmont | cove | lake & standing water | cove in lake & standing water (danger band 3), 176 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.imperial-penal-south.ledgered-blackguards (+0.51). |
| `place.imperial-penal-south.murkwood-verge` | committed.murkwood-verge | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 361 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, danger, parent; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.imperial-penal-south.wisp-lure-basin (+0.39). |
| `place.imperial-penal-south.rose-flooded-passage` | committed.rose-flooded-passage | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 229 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, region. |
| `place.imperial-penal-south.rose-supply-town` | committed.rose-supply-town | ford | fringe marsh | ford in fringe marsh (danger band 2), 61 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.three-gate-toll` | committed.three-gate-toll | isthmus | fringe marsh | isthmus in fringe marsh (danger band 3), 280 m from the nearest route; at the water's edge; its choice #4 landform; won on nearPoint, landform, region; placed from the homeless batch at stage 'spacing-3/4'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.west-market-town` | committed.west-market-town | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 2), 40 m from the nearest route; at the water's edge; no free 'confluence' site was left in the zone, so plain ground; won on nearPoint, route, region; placed from the homeless batch at stage 'spacing-3/4'; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.alten-meerhleel` | committed.alten-meerhleel | natural-harbour | ocean | natural harbour in ocean (danger band 0), 223 m from the nearest route; at the water's edge; its first-choice landform; won on landform, parent, navigable; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.mercantile-coast.topal-salt-pans (+0.89). |
| `place.mercantile-coast.bramman-screen` | committed.bramman-screen | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 3), 88 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bright-throat-village` | committed.bright-throat-village | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 33 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.mercantile-coast.glowfen-murkmire (+0.30). |
| `place.mercantile-coast.chasepoint` | committed.chasepoint | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 111 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.mercantile-coast.ashfield (+0.80). |
| `place.mercantile-coast.inhabited-meer-murkmire` | committed.inhabited-meer-murkmire | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 154 m from the nearest route; its first-choice landform; won on landform, nearPoint, sightline; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.ixtaxh-xanmeer` | committed.ixtaxh-xanmeer | islet | lake & standing water | islet in lake & standing water (danger band 3), 846 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.lilmoth` | anchor.lilmoth | anchor | firm lowland | Owner-approved settlement anchor 'lilmoth' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.rockpark` | committed.rockpark | flood-high | firm lowland | flood high in firm lowland (danger band 4), 167 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.mercantile-coast.white-rose-prison (+0.62). |
| `place.mercantile-coast.slaughter-memorial` | committed.slaughter-memorial | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 1), 50 m from the nearest route; its choice #3 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.soulrest` | anchor.soulrest | anchor | fringe marsh | Owner-approved settlement anchor 'soulrest' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.teeth-of-sithis` | committed.teeth-of-sithis | summit | tropical jungle | summit in tropical jungle (danger band 4), 593 m from the nearest route; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.white-rose-prison` | committed.white-rose-prison | flood-high | firm lowland | flood high in firm lowland (danger band 4), 71 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.mercantile-coast.rockpark (+0.62). |
| `place.mercantile-coast.xinchei-konu` | committed.xinchei-konu | summit | firm lowland | summit in firm lowland (danger band 2), 377 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.bereaved-hist-less-since` | committed.bereaved-hist-less-since | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 4), 449 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.naga-kur-deeps.beast-keeper-crocodile (+0.48). |
| `place.naga-kur-deeps.dead-water-village` | committed.dead-water-village | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 361 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, nearPoint, region; site exchanged in the swap pass with place.naga-kur-deeps.naga-highway-camp-active-north (+1.42). |
| `place.naga-kur-deeps.deepmire-refuge` | committed.deepmire-refuge | flood-high | interior swamp | flood high in interior swamp (danger band 4), 568 m from the nearest route; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.ferry-stage-guide-hire` | committed.ferry-stage-guide-hire | water-narrows | interior swamp | water narrows in interior swamp (danger band 4), 33 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.harmed-hist-enslaved` | committed.harmed-hist-enslaved | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 813 m from the nearest route; its choice #3 landform; won on landform, remote, danger; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.naga-kur-deeps.sealed-xanmeer-vakka-deeps (+1.27). |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | committed.horwalli-waterworks-deeps | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 23 m from the nearest route; no free 'any-channel-bank' site was left in the zone, so plain ground; won on nearPoint, region, landform; placed from the homeless batch at stage 'spacing-3/4'. |
| `place.naga-kur-deeps.naga-village-settled` | committed.naga-village-settled | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 3), 216 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger; site exchanged in the swap pass with place.naga-kur-deeps.naga-village-raiding (+0.33). |
| `place.naga-kur-deeps.root-gallery-blight-warren` | committed.root-gallery-blight-warren | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 444 m from the nearest route; its choice #5 landform; won on nearPoint, region, remote; placed from the homeless batch at stage 'spacing-3/4'; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-whisper-village` | committed.root-whisper-village | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 491 m from the nearest route; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.sithis-temple-mass-sacrifice` | committed.sithis-temple-mass-sacrifice | flood-high | interior swamp | flood high in interior swamp (danger band 4), 151 m from the nearest route; its choice #3 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.umbriel-stripped-undead` | committed.umbriel-stripped-undead | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 337 m from the nearest route; its choice #2 landform; won on landform, region, danger; site exchanged in the swap pass with place.naga-kur-deeps.raft-village-lashed (+0.97). |
| `place.naga-kur-deeps.wild-hist-rogue-deeps` | committed.wild-hist-rogue-deeps | island | interior swamp | island in interior swamp (danger band 4), 639 m from the nearest route; at the water's edge; its choice #3 landform; won on remote, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.pirate-freeholds.alten-corimont` | anchor.alten-corimont | anchor | firm lowland | Owner-approved settlement anchor 'alten-corimont' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.pirate-freeholds.chasecreek` | committed.chasecreek | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 158 m from the nearest route; its first-choice landform; won on landform, nearPoint, region. |
| `place.pirate-freeholds.corimont-hist-less-camp` | committed.corimont-hist-less-camp | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 412 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent. |
| `place.pirate-freeholds.opening-work-barge` | committed.opening-work-barge | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 146 m from the nearest route; no free 'any-channel-bank' site was left in the zone, so plain ground; won on bound, sightline, region; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.pirate-freeholds.opening-work-camp` | committed.opening-work-camp | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 78 m from the nearest route; its first-choice landform; won on landform, bound, sightline; placed from the homeless batch at stage 'spacing-3/4'. |
| `place.pirate-freeholds.rockpoint` | committed.rockpoint | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 306 m from the nearest route; no free 'cliff-bench' site was left in the zone, so plain ground; won on nearPoint, region, danger; placed from the homeless batch at stage 'spacing-3/4'; site exchanged in the swap pass with place.pirate-freeholds.corimont-low-store (+0.49). |
| `place.pirate-freeholds.upriver-hist-village` | committed.upriver-hist-village | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 43 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.archon` | anchor.archon | anchor | mangrove forest | Owner-approved settlement anchor 'archon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.saxhleel-coast.archon-harbour-hist` | committed.archon-harbour-hist | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 51 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, parent. |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | committed.archon-shadowscale-sanctuary | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 313 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on bound, region, parent. |
| `place.saxhleel-coast.cantemir-headland` | committed.cantemir-headland | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 362 m from the nearest route; at the water's edge; no free 'headland' site was left in the zone, so plain ground; won on region, danger, parent; site exchanged in the swap pass with place.saxhleel-coast.mangrove-air-pocket (+1.71). |
| `place.saxhleel-coast.east-estuary-rootworm-station` | committed.east-estuary-rootworm-station | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 143 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, region. |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | committed.lagoon-submerged-xanmeer | cove | tropical jungle | cove in tropical jungle (danger band 4), 884 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.saxhleel-coast.portdun-mont` | committed.portdun-mont | flood-high | mangrove forest | flood high in mangrove forest (danger band 2), 229 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.seafalls` | committed.seafalls | water-narrows | tropical jungle | water narrows in tropical jungle (danger band 2), 172 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |

## Owner-feedback checks (Part 4 step 2)

- stances: {'friendly': 73, 'wary': 70, 'hostile': 274, 'neutral': 98, 'guarded': 41, 'sanctuary': 24}
- swap pass exchanged 0 sites
- delves/combat places (D3+) with no friendly/sanctuary rest within 600 m (1200 m in D4–D5): 3

| city | purposes in 2 km | missing core purposes | hostile in 2 km | edge / hinterland / rural counts |
|---|---|---|---|---|
| stormhold | 14 | — | 56 | 14 / 52 / 124 |
| thorn | 13 | — | 41 | 10 / 47 / 63 |
| gideon | 14 | — | 73 | 16 / 69 / 121 |
| helstrom | 15 | — | 85 | 8 / 37 / 243 |
| archon | 14 | — | 46 | 8 / 34 / 86 |
| blackrose | 14 | — | 72 | 11 / 66 / 95 |
| lilmoth | 14 | — | 58 | 8 / 47 / 96 |
| soulrest | 12 | resource-source | 46 | 6 / 36 / 77 |
| alten-corimont | 14 | — | 73 | 12 / 66 / 137 |

Rest-cadence gaps (add a rest or soften): `place.hist-heartland.tended-xanmeer-clan-north` (713 m), `place.imperial-fringe.sink-field` (605 m), `place.mercantile-coast.rockpark` (666 m)

## Clustering — Clark-Evans R per zone (97 A5 / G3)

R < 1 (clustered); hand-placed worlds measure about 0.5 (97 A5). Reported, not gated. Median R 1.782; over target: dunmer-north, hist-heartland, imperial-fringe, imperial-penal-south, mercantile-coast, naga-kur-deeps, pirate-freeholds, saxhleel-coast.

| zone | plotted | land km² | mean NN m | expected m | R |
|---|---:|---:|---:|---:|---:|
| dunmer-north | 127 | 7.55 | 175.4 | 121.9 | **1.439** |
| hist-heartland | 116 | 8.87 | 246.4 | 138.3 | **1.782** |
| imperial-fringe | 120 | 6.92 | 178.8 | 120.1 | **1.489** |
| imperial-penal-south | 44 | 0.87 | 149.1 | 70.4 | **2.119** |
| mercantile-coast | 65 | 3.4 | 195.7 | 114.3 | **1.711** |
| naga-kur-deeps | 40 | 2.5 | 270.5 | 124.9 | **2.165** |
| pirate-freeholds | 31 | 0.77 | 161.6 | 79.0 | **2.046** |
| saxhleel-coast | 37 | 1.71 | 169.4 | 107.4 | **1.578** |
