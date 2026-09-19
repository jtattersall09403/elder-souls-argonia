# Macro plot — coverage report (Phase 11 Part 3)

Seed 1103. Supply: 1185 scour sites + 3057 free-ground points. Demand: 580 live records; **579 plotted**, 1 unresolved.
Placed from the homeless batch: {'region-relaxed': 24, 'neighbour-zone': 79, 'eviction-repair': 1, 'relaxed-score': 2, 'neighbour-repair': 1, 'spacing-1/2-region-relaxed': 4}.

| zone | live | plotted | homeless | landform wishes from recipe | top landforms |
|---|---|---|---|---|---|
| dunmer-north | 127 | 127 | 0 | 0 | any-firm-ground 70, ravine 9, ridge-end 8, any-shallow-marsh 5 |
| hist-heartland | 116 | 116 | 0 | 0 | any-firm-ground 60, any-shallow-marsh 26, flood-high 4, open-water 4 |
| imperial-fringe | 120 | 119 | 1 | 0 | any-firm-ground 83, ravine 7, ridge-end 6, box-canyon 4 |
| imperial-penal-south | 44 | 44 | 0 | 43 | any-firm-ground 21, open-water 10, any-shallow-marsh 3, flood-high 2 |
| mercantile-coast | 65 | 65 | 0 | 65 | any-firm-ground 28, any-shallow-marsh 14, flood-high 5, open-water 5 |
| naga-kur-deeps | 40 | 40 | 0 | 27 | any-shallow-marsh 27, open-water 8, any-firm-ground 3, islet 1 |
| pirate-freeholds | 31 | 31 | 0 | 0 | any-firm-ground 22, cliff-bench 3, anchor 1, box-canyon 1 |
| saxhleel-coast | 37 | 37 | 0 | 0 | any-firm-ground 19, any-shallow-marsh 9, flood-high 3, anchor 1 |

## Spacing and routes

- nearest-neighbour distance p5 / median / p95: 75 / 125 / 264 m
- same-type pairs closer than 300 m: 1
- median distance to a route: 280 m; fine-tempo records within 300 m of a route: 55 %
- route-visibility sweep (359 samples every 150 m, radius 450 m): mean 3.87 destination/landmark places in sight; dead 10 %, crowded (4+) 45 %

## Anti-sameyness quota (no type > 25 % of a zone)

- none

## Named constraints (sightline / bound / water), as plotted

| record | kind | to | m | line of sight |
|---|---|---|---|---|
| `place.dunmer-north.gandranen-library` | bound | `place.dunmer-north.gandranen-ruins` | 71 | — |
| `place.dunmer-north.mazzatun-hist` | bound | `place.dunmer-north.mazzatun` | 126 | — |
| `place.dunmer-north.murkwater-shadowscale-ground` | bound | `place.dunmer-north.murkwater` | 51 | — |
| `place.dunmer-north.stormhold-causeway` | bound | `place.dunmer-north.stormhold` | 249 | — |
| `place.dunmer-north.the-black-stage` | bound | `place.dunmer-north.stormhold-causeway` | 209 | — |
| `place.dunmer-north.the-diggings-ladder` | bound | `place.dunmer-north.silyanorn-diggings` | 194 | — |
| `place.dunmer-north.the-divers-landing` | bound | `place.dunmer-north.the-drowned-terrace` | 233 | — |
| `place.dunmer-north.the-drawdown-flats` | bound | `place.dunmer-north.the-drowned-terrace` | 247 | — |
| `place.dunmer-north.the-first-count` | sightline | `place.dunmer-north.stormhold` | 265 | True |
| `place.dunmer-north.the-flu-cordon` | sightline | `place.dunmer-north.stillrise-village` | 192 | True |
| `place.dunmer-north.the-outer-silyanorn` | sightline | `place.dunmer-north.stormhold` | 1257 | True |
| `place.dunmer-north.the-pen-yard` | sightline | `place.dunmer-north.the-dres-rows` | 99 | True |
| `place.dunmer-north.the-pen-yard` | bound | `place.dunmer-north.the-dres-rows` | 99 | — |
| `place.dunmer-north.the-silyanorn-crown` | sightline | `place.dunmer-north.the-outer-silyanorn` | 143 | True |
| `place.dunmer-north.the-silyanorn-crown` | bound | `place.dunmer-north.the-outer-silyanorn` | 143 | — |
| `place.dunmer-north.the-slumped-hamlet` | sightline | `place.dunmer-north.the-shut-village` | 194 | True |
| `place.dunmer-north.the-standing-bid` | sightline | `place.dunmer-north.stormhold` | 102 | True |
| `place.dunmer-north.the-standing-bid` | bound | `place.dunmer-north.stormhold` | 102 | — |
| `place.dunmer-north.the-stormhold-falls-chamber` | bound | `place.dunmer-north.stormhold` | 262 | — |
| `place.dunmer-north.the-stripped-village` | bound | `place.dunmer-north.the-field-gate-garrison` | 861 | — |
| `place.dunmer-north.the-thorn-bond` | bound | `place.dunmer-north.thorn` | 146 | — |
| `place.dunmer-north.the-veterans-ridge` | sightline | `place.dunmer-north.tear-road-stage` | 911 | True |
| `place.dunmer-north.thorn-paddy-terraces` | bound | `place.dunmer-north.thorn` | 128 | — |
| `place.dunmer-north.waits-for-the-trial` | sightline | `place.dunmer-north.hissmir` | 133 | True |
| `place.dunmer-north.waits-for-the-trial` | bound | `place.dunmer-north.hissmir` | 133 | — |
| `place.hist-heartland.bereaved-mnemic` | bound | `place.hist-heartland.walkway-junction-high-crossroads` | 96 | — |
| `place.hist-heartland.bubble-spire-collapsed` | bound | `place.hist-heartland.bubble-spire-open-helstrom` | 388 | — |
| `place.hist-heartland.guide-camp-far-shelter` | bound | `place.hist-heartland.guide-camp-gate-side` | 814 | — |
| `place.hist-heartland.guide-camp-gate-side` | bound | `place.hist-heartland.helstrom` | 102 | — |
| `place.hist-heartland.miregaunt-ward-approach` | bound | `place.hist-heartland.sealed-xanmeer-living` | 113 | — |
| `place.hist-heartland.root-gallery-helstrom-underway` | bound | `place.hist-heartland.helstrom` | 232 | — |
| `place.hist-heartland.rootworm-station-helstrom` | bound | `place.hist-heartland.helstrom` | 92 | — |
| `place.hist-heartland.sap-tapping-licensed` | sightline | `place.hist-heartland.harmed-hist-tapped` | 445 | True |
| `place.hist-heartland.vista-ledge-canopy-break` | sightline | `place.hist-heartland.helstrom` | 1427 | True |
| `place.hist-heartland.xal-krona-making-ground` | bound | `place.hist-heartland.lost-city` | 49 | — |
| `place.imperial-fringe.ashen-tower` | sightline | `place.imperial-fringe.fort-swampmoth` | 224 | True |
| `place.imperial-fringe.bone-road-waystation` | bound | `place.imperial-fringe.the-counted-dead` | 613 | — |
| `place.imperial-fringe.cassian-farm` | bound | `place.imperial-fringe.gideon` | 882 | — |
| `place.imperial-fringe.castle-giovesse` | sightline | `place.imperial-fringe.gideon` | 300 | True |
| `place.imperial-fringe.collections-dig` | bound | `place.imperial-fringe.twyllbek-ruins` | 244 | — |
| `place.imperial-fringe.fort-swampmoth` | sightline | `place.imperial-fringe.mile-house-of-the-eagle` | 541 | True |
| `place.imperial-fringe.gideon-rootworm-terminus` | bound | `place.imperial-fringe.gideon` | 264 | — |
| `place.imperial-fringe.gideon-synod-outstation` | bound | `place.imperial-fringe.gideon` | 405 | — |
| `place.imperial-fringe.giovesse-lines` | sightline | `place.imperial-fringe.castle-giovesse` | 444 | True |
| `place.imperial-fringe.glenbridge` | sightline | `place.imperial-fringe.glenbridge-sermon-xanmeer` | 93 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | sightline | `place.imperial-fringe.glenbridge` | 93 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | bound | `place.imperial-fringe.glenbridge` | 93 | — |
| `place.imperial-fringe.ridge-runners-post` | sightline | `place.imperial-fringe.ashen-tower` | 123 | True |
| `place.imperial-fringe.the-abandoned-survey` | bound | `place.imperial-fringe.the-vellum-estate` | 442 | — |
| `place.imperial-fringe.the-drowning-gate` | sightline | `place.imperial-fringe.the-embankment-that-drowned` | 186 | True |
| `place.imperial-fringe.the-embankment-that-drowned` | sightline | `place.imperial-fringe.the-drowning-gate` | 186 | True |
| `place.imperial-fringe.the-marble-field` | sightline | `place.imperial-fringe.gideon` | 821 | True |
| `place.imperial-fringe.the-ring-of-nine-wells` | sightline | `place.imperial-fringe.twyllbek-ruins` | 654 | True |
| `place.imperial-fringe.the-sermon-road-camp` | bound | `place.imperial-fringe.glenbridge` | 154 | — |
| `place.imperial-fringe.the-shut-door` | sightline | `place.imperial-fringe.the-kept-terrace` | 367 | True |
| `place.imperial-fringe.the-snowline-cell` | sightline | `place.imperial-fringe.ridge-runners-post` | 200 | True |
| `place.imperial-fringe.twyllbek-crown` | sightline | `place.imperial-fringe.twyllbek-ruins` | 534 | True |
| `place.imperial-penal-south.akaviri-works` | bound | `place.imperial-penal-south.lilmothiit-quarry` | 334 | — |
| `place.imperial-penal-south.blackrose-prison` | bound | `place.imperial-penal-south.blackrose` | 185 | — |
| `place.imperial-penal-south.drowned-gallery` | bound | `place.imperial-penal-south.blackrose-prison` | 362 | — |
| `place.imperial-penal-south.flu-quarantine-village` | bound | `place.imperial-penal-south.blackrose` | 81 | — |
| `place.imperial-penal-south.necromantic-dig` | bound | `place.imperial-penal-south.blackrose-prison` | 309 | — |
| `place.imperial-penal-south.plague-cordon` | bound | `place.imperial-penal-south.rose-supply-town` | 54 | — |
| `place.imperial-penal-south.prison-born-refuge` | bound | `place.imperial-penal-south.longmont` | 99 | — |
| `place.imperial-penal-south.rockspring` | bound | `place.imperial-penal-south.bramman-head` | 340 | — |
| `place.imperial-penal-south.rose-flooded-passage` | bound | `place.imperial-penal-south.blackrose-prison` | 245 | — |
| `place.imperial-penal-south.rose-outworks` | bound | `place.imperial-penal-south.blackrose-prison` | 448 | — |
| `place.imperial-penal-south.voriplasm-vault` | bound | `place.imperial-penal-south.bramman-head` | 354 | — |
| `place.mercantile-coast.inhabited-meer-murkmire` | sightline | `place.mercantile-coast.soulrest` | 415 | True |
| `place.mercantile-coast.oliis-boardwalk` | bound | `place.mercantile-coast.oliis-ferry-stage` | 1334 | — |
| `place.mercantile-coast.oliis-drake-deep` | bound | `place.mercantile-coast.oliis-air-station` | 557 | — |
| `place.mercantile-coast.pusbottom-barge` | bound | `place.mercantile-coast.lilmoth` | 253 | — |
| `place.mercantile-coast.sacked-customs-suburb` | sightline | `place.mercantile-coast.lilmoth` | 91 | True |
| `place.mercantile-coast.sacked-customs-suburb` | bound | `place.mercantile-coast.lilmoth` | 91 | — |
| `place.mercantile-coast.screen-watch` | bound | `place.mercantile-coast.bramman-screen` | 899 | — |
| `place.mercantile-coast.soulrest-breaking-yard` | bound | `place.mercantile-coast.soulrest` | 124 | — |
| `place.mercantile-coast.soulrest-divers-yard` | bound | `place.mercantile-coast.soulrest` | 210 | — |
| `place.mercantile-coast.soulrest-quay-tradehouse` | bound | `place.mercantile-coast.soulrest` | 53 | — |
| `place.mercantile-coast.wraxu-stacks` | sightline | `place.mercantile-coast.wraxu-frieze` | 258 | True |
| `place.mercantile-coast.wraxu-stacks` | bound | `place.mercantile-coast.wraxu-frieze` | 258 | — |
| `place.naga-kur-deeps.drifting-village-wet-mooring` | bound | `place.naga-kur-deeps.leviathan-bone-field` | 160 | — |
| `place.pirate-freeholds.alten-corimont` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 101 | True |
| `place.pirate-freeholds.careening-hard` | bound | `place.pirate-freeholds.alten-corimont` | 168 | — |
| `place.pirate-freeholds.corimont-crosstrees` | bound | `place.pirate-freeholds.alten-corimont` | 101 | — |
| `place.pirate-freeholds.freehold-market` | bound | `place.pirate-freeholds.alten-corimont` | 46 | — |
| `place.pirate-freeholds.freehold-smithy` | sightline | `place.pirate-freeholds.careening-hard` | 326 | True |
| `place.pirate-freeholds.freehold-smithy` | bound | `place.pirate-freeholds.alten-corimont` | 209 | — |
| `place.pirate-freeholds.kothringi-river-ruin` | bound | `place.pirate-freeholds.alten-corimont` | 203 | — |
| `place.pirate-freeholds.opening-work-barge` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 125 | True |
| `place.pirate-freeholds.opening-work-barge` | bound | `place.pirate-freeholds.alten-corimont` | 52 | — |
| `place.pirate-freeholds.opening-work-camp` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 300 | True |
| `place.pirate-freeholds.opening-work-camp` | bound | `place.pirate-freeholds.opening-work-barge` | 181 | — |
| `place.pirate-freeholds.rim-keystone-chamber` | bound | `place.pirate-freeholds.rim-pass-station` | 411 | — |
| `place.pirate-freeholds.veterans-holding` | sightline | `place.pirate-freeholds.trunk-toll-bridge` | 743 | True |
| `place.saxhleel-coast.archon-bonded-row` | bound | `place.saxhleel-coast.archon` | 184 | — |
| `place.saxhleel-coast.archon-harbour-hist` | bound | `place.saxhleel-coast.archon` | 181 | — |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.archon` | 254 | True |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.padomaic-wrecker-beach` | 386 | True |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.outer-reef` | 996 | True |
| `place.saxhleel-coast.archon-lighthouse` | bound | `place.saxhleel-coast.archon` | 254 | — |
| `place.saxhleel-coast.archon-sacked-quarter` | bound | `place.saxhleel-coast.archon` | 129 | — |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | bound | `place.saxhleel-coast.archon` | 222 | — |
| `place.saxhleel-coast.archon-shipyard` | bound | `place.saxhleel-coast.archon` | 243 | — |
| `place.saxhleel-coast.coast-hist-less-refuge` | bound | `place.saxhleel-coast.archon` | 624 | — |
| `place.saxhleel-coast.contested-bank` | bound | `place.saxhleel-coast.quay-tradehouse` | 243 | — |
| `place.saxhleel-coast.east-estuary-rootworm-station` | bound | `place.saxhleel-coast.archon` | 233 | — |
| `place.saxhleel-coast.estuary-keepers-lodge` | bound | `place.saxhleel-coast.archon-lighthouse` | 878 | — |
| `place.saxhleel-coast.gap-reef` | sightline | `place.saxhleel-coast.archon-lighthouse` | 253 | True |
| `place.saxhleel-coast.gap-reef` | bound | `place.saxhleel-coast.archon-lighthouse` | 253 | — |
| `place.saxhleel-coast.mangrove-reef` | bound | `place.saxhleel-coast.tide-street-village` | 196 | — |
| `place.saxhleel-coast.oliis-coast-lay-by` | bound | `place.saxhleel-coast.archon` | 891 | — |
| `place.saxhleel-coast.padomaic-wrecker-beach` | sightline | `place.saxhleel-coast.archon-lighthouse` | 386 | True |
| `place.saxhleel-coast.padomaic-wrecker-beach` | bound | `place.saxhleel-coast.archon-lighthouse` | 386 | — |
| `place.saxhleel-coast.quarantine-village-lagoon` | bound | `place.saxhleel-coast.archon` | 619 | — |

## Records placed from the homeless batch

| record | stage | site |
|---|---|---|
| `place.dunmer-north.channel-cross-village` | region-relaxed | site.scour.lake-standing-water.ford-019 |
| `place.dunmer-north.hackwing-wall` | neighbour-zone | site.scour.firm-lowland.cliff-bench-012 |
| `place.dunmer-north.seam-chasers` | region-relaxed | site.free.any-firm-ground-0095 |
| `place.dunmer-north.silyanorn-diggings` | neighbour-zone | site.scour.upland-hills.saddle-041 |
| `place.dunmer-north.stands-on-the-island` | region-relaxed | site.free.any-firm-ground-0191 |
| `place.dunmer-north.stormhold-causeway` | region-relaxed | site.free.any-firm-ground-0204 |
| `place.dunmer-north.the-black-stage` | eviction-repair | site.scour.upland-hills.ravine-075 |
| `place.dunmer-north.the-borrowed-tomb` | neighbour-zone | site.scour.upland-hills.ridge-end-068 |
| `place.dunmer-north.the-charge-works` | region-relaxed | site.free.any-firm-ground-0048 |
| `place.dunmer-north.the-diggings-ladder` | neighbour-zone | site.scour.upland-hills.ravine-087 |
| `place.dunmer-north.the-divers-landing` | region-relaxed | site.free.any-firm-ground-0010 |
| `place.dunmer-north.the-drawdown-flats` | neighbour-zone | site.free.open-water-0031 |
| `place.dunmer-north.the-drover-camp` | neighbour-zone | site.free.any-firm-ground-0015 |
| `place.dunmer-north.the-drowned-terrace` | neighbour-zone | site.free.open-water-0002 |
| `place.dunmer-north.the-monsoon-boom` | neighbour-zone | site.free.any-firm-ground-0106 |
| `place.dunmer-north.the-pen-yard` | neighbour-zone | site.free.open-water-0266 |
| `place.dunmer-north.the-shut-village` | region-relaxed | site.free.any-firm-ground-0165 |
| `place.dunmer-north.the-slumped-hamlet` | region-relaxed | site.scour.border-mountains.ford-033 |
| `place.dunmer-north.the-whispers-dig` | neighbour-zone | site.free.open-water-0038 |
| `place.dunmer-north.the-white-pans` | neighbour-zone | site.scour.ocean.cove-062 |
| `place.dunmer-north.thorn-paddy-terraces` | neighbour-zone | site.free.any-firm-ground-0170 |
| `place.dunmer-north.three-ways-over-water` | region-relaxed | site.free.any-shallow-marsh-0342 |
| `place.hist-heartland.boardwalk-branching-many-ways` | neighbour-zone | site.free.any-shallow-marsh-0732 |
| `place.hist-heartland.bubble-spire-collapsed` | neighbour-zone | site.free.roadside-0015 |
| `place.hist-heartland.hammock-tree-island-greenmoss` | neighbour-zone | site.free.any-firm-ground-0285 |
| `place.hist-heartland.miregaunt-ground-slow-ground` | neighbour-zone | site.free.any-shallow-marsh-0506 |
| `place.hist-heartland.naga-lay-up-second-man` | neighbour-zone | site.scour.firm-lowland.flood-high-035 |
| `place.hist-heartland.pilgrim-camp-sap-road` | relaxed-score | site.free.any-firm-ground-0471 |
| `place.hist-heartland.platform-ladder-tower-watch` | neighbour-zone | site.free.any-shallow-marsh-0444 |
| `place.hist-heartland.root-gallery-drowned-stair` | neighbour-zone | site.free.any-firm-ground-0886 |
| `place.hist-heartland.root-gallery-kept-light` | neighbour-zone | site.free.any-shallow-marsh-0557 |
| `place.hist-heartland.root-gallery-lantern-hollow` | neighbour-zone | site.free.any-shallow-marsh-0414 |
| `place.hist-heartland.stilt-channel-edge-two-poles` | region-relaxed | site.free.any-firm-ground-0474 |
| `place.hist-heartland.xal-meeruth-station` | neighbour-repair | site.free.any-firm-ground-0446 |
| `place.imperial-fringe.ashen-tower` | neighbour-zone | site.free.roadside-0145 |
| `place.imperial-fringe.bone-road-waystation` | neighbour-zone | site.free.any-firm-ground-0910 |
| `place.imperial-fringe.castle-giovesse` | spacing-1/2-region-relaxed | site.scour.firm-lowland.summit-028 |
| `place.imperial-fringe.claywater-station` | neighbour-zone | site.free.roadside-0152 |
| `place.imperial-fringe.fort-swampmoth` | neighbour-zone | site.scour.border-mountains.ridge-end-014 |
| `place.imperial-fringe.giovesse-lines` | spacing-1/2-region-relaxed | site.free.any-firm-ground-0609 |
| `place.imperial-fringe.long-causeway` | neighbour-zone | site.free.any-firm-ground-0648 |
| `place.imperial-fringe.low-water-fair` | region-relaxed | site.free.any-firm-ground-0833 |
| `place.imperial-fringe.lowmere-raft-town` | neighbour-zone | site.scour.lake-standing-water.water-narrows-001 |
| `place.imperial-fringe.ninefold-station` | neighbour-zone | site.free.any-firm-ground-1029 |
| `place.imperial-fringe.onkobra-clay-pits` | neighbour-zone | site.scour.border-mountains.ravine-051 |
| `place.imperial-fringe.onkobra-ferry` | neighbour-zone | site.free.any-firm-ground-0802 |
| `place.imperial-fringe.reedcutters-toll` | region-relaxed | site.free.any-shallow-marsh-0942 |
| `place.imperial-fringe.ridge-runners-post` | neighbour-zone | site.free.roadside-0143 |
| `place.imperial-fringe.the-embankment-that-drowned` | neighbour-zone | site.scour.firm-lowland.gorge-017 |
| `place.imperial-fringe.the-empty-steading` | neighbour-zone | site.free.any-firm-ground-0837 |
| `place.imperial-fringe.the-lake-divers-yard` | region-relaxed | site.free.any-firm-ground-0222 |
| `place.imperial-fringe.the-snowline-cell` | neighbour-zone | site.scour.upland-hills.ravine-027 |
| `place.imperial-penal-south.akaviri-works` | region-relaxed | site.free.any-firm-ground-1246 |
| `place.imperial-penal-south.basin-sinkhole` | neighbour-zone | site.free.any-firm-ground-1319 |
| `place.imperial-penal-south.bramman-head` | neighbour-zone | site.free.any-firm-ground-1273 |
| `place.imperial-penal-south.drawdown-flat` | neighbour-zone | site.free.any-shallow-marsh-1210 |
| `place.imperial-penal-south.lake-divers-yard` | neighbour-zone | site.scour.mangrove-forest.cove-038 |
| `place.imperial-penal-south.lilmothiit-quarry` | region-relaxed | site.free.open-water-0882 |
| `place.imperial-penal-south.marsh-giant-ground-basin` | neighbour-zone | site.free.any-shallow-marsh-1161 |
| `place.imperial-penal-south.murkwood-verge` | neighbour-zone | site.free.any-firm-ground-1322 |
| `place.imperial-penal-south.plague-cordon` | neighbour-zone | site.free.roadside-0104 |
| `place.imperial-penal-south.rockspring` | neighbour-zone | site.free.any-firm-ground-1316 |
| `place.imperial-penal-south.rose-supply-town` | neighbour-zone | site.free.any-shallow-marsh-1278 |
| `place.imperial-penal-south.saltrice-village` | neighbour-zone | site.free.any-firm-ground-1321 |
| `place.imperial-penal-south.scandal-holding-pit` | relaxed-score | site.free.open-water-1029 |
| `place.imperial-penal-south.three-gate-toll` | neighbour-zone | site.free.any-firm-ground-1294 |
| `place.imperial-penal-south.voriplasm-vault` | neighbour-zone | site.scour.fringe-marsh.water-narrows-004 |
| `place.imperial-penal-south.wisp-lure-basin` | neighbour-zone | site.scour.fringe-marsh.water-narrows-000 |
| `place.mercantile-coast.bog-blight-ground-murkmire` | neighbour-zone | site.free.open-water-0850 |
| `place.mercantile-coast.bramman-river-ferry` | neighbour-zone | site.free.any-firm-ground-1347 |
| `place.mercantile-coast.hammock-crown-murkmire` | neighbour-zone | site.free.any-firm-ground-1328 |
| `place.mercantile-coast.head-of-tide` | neighbour-zone | site.scour.firm-lowland.flood-high-009 |
| `place.mercantile-coast.inhabited-meer-murkmire` | neighbour-zone | site.scour.interior-swamp.summit-035 |
| `place.mercantile-coast.keel-sakka-stilts` | neighbour-zone | site.free.open-water-0933 |
| `place.mercantile-coast.lighter-flotilla` | neighbour-zone | site.free.any-shallow-marsh-1341 |
| `place.mercantile-coast.lilmoth-divers-yard` | neighbour-zone | site.free.open-water-0928 |
| `place.mercantile-coast.mudfoot` | region-relaxed | site.free.any-shallow-marsh-1176 |
| `place.mercantile-coast.necropolis-village-murkmire` | region-relaxed | site.scour.firm-lowland.flood-high-046 |
| `place.mercantile-coast.oliis-boardwalk` | neighbour-zone | site.free.any-shallow-marsh-1357 |
| `place.mercantile-coast.oliis-drake-deep` | neighbour-zone | site.scour.interior-swamp.cove-035 |
| `place.mercantile-coast.oliis-ferry-stage` | neighbour-zone | site.free.any-shallow-marsh-1201 |
| `place.mercantile-coast.screen-watch` | spacing-1/2-region-relaxed | site.free.any-shallow-marsh-1216 |
| `place.mercantile-coast.soulrest-breaking-yard` | region-relaxed | site.free.any-firm-ground-1287 |
| `place.mercantile-coast.sunkfoot` | spacing-1/2-region-relaxed | site.free.any-shallow-marsh-1264 |
| `place.mercantile-coast.topal-salt-pans` | region-relaxed | site.free.any-firm-ground-1221 |
| `place.naga-kur-deeps.dive-shaft-natural-deeps` | neighbour-zone | site.free.any-shallow-marsh-1162 |
| `place.naga-kur-deeps.harmed-hist-enslaved` | neighbour-zone | site.free.any-shallow-marsh-1030 |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | neighbour-zone | site.free.any-firm-ground-0952 |
| `place.naga-kur-deeps.maturity-trial-kaju-kill` | neighbour-zone | site.free.any-shallow-marsh-1062 |
| `place.naga-kur-deeps.miregaunt-ward-open` | neighbour-zone | site.free.any-firm-ground-1094 |
| `place.naga-kur-deeps.naga-highway-camp-active-north` | neighbour-zone | site.free.any-shallow-marsh-0977 |
| `place.naga-kur-deeps.necropolis-nightbound` | neighbour-zone | site.free.any-shallow-marsh-0839 |
| `place.naga-kur-deeps.portage-slipway-narrows-deeps` | neighbour-zone | site.free.roadside-0215 |
| `place.naga-kur-deeps.root-gallery-blight-warren` | neighbour-zone | site.free.any-firm-ground-1014 |
| `place.naga-kur-deeps.wreck-submerged-barge` | neighbour-zone | site.free.open-water-0968 |
| `place.pirate-freeholds.corimont-low-store` | neighbour-zone | site.free.roadside-0399 |
| `place.pirate-freeholds.flu-cairn-field` | neighbour-zone | site.free.any-firm-ground-0294 |
| `place.pirate-freeholds.freehold-naga-camp` | neighbour-zone | site.free.any-firm-ground-0107 |
| `place.pirate-freeholds.freehold-smithy` | neighbour-zone | site.free.roadside-0393 |
| `place.pirate-freeholds.half-chartered-anchorage` | neighbour-zone | site.free.any-firm-ground-0136 |
| `place.pirate-freeholds.rim-smugglers-ledge-north` | region-relaxed | site.scour.firm-lowland.cliff-bench-000 |
| `place.pirate-freeholds.rim-snowline-hermitage` | neighbour-zone | site.scour.border-mountains.cliff-bench-010 |
| `place.pirate-freeholds.rockpoint` | neighbour-zone | site.free.any-firm-ground-0327 |
| `place.pirate-freeholds.trunk-road-tradehouse` | neighbour-zone | site.free.any-firm-ground-0326 |
| `place.saxhleel-coast.archon-bonded-row` | region-relaxed | site.free.roadside-0006 |
| `place.saxhleel-coast.archon-glowgill-byre` | region-relaxed | site.free.roadside-0012 |
| `place.saxhleel-coast.archon-shipyard` | region-relaxed | site.free.any-firm-ground-1021 |
| `place.saxhleel-coast.coast-hist-less-refuge` | neighbour-zone | site.free.any-firm-ground-0823 |
| `place.saxhleel-coast.jungle-root-hollow` | neighbour-zone | site.free.any-firm-ground-0959 |
| `place.saxhleel-coast.pearl-lots` | region-relaxed | site.free.any-firm-ground-1124 |
| `place.saxhleel-coast.quarantine-village-lagoon` | neighbour-zone | site.scour.lake-standing-water.ford-002 |

## Dangling relations: 99 edges point at deferred/cut/unknown records

(Part 4 catalogue work: promote the depended-upon record or prune the edge. First 40:)

- `place.dunmer-north.hatching-pools`.patrols → `route.road.alten-corimont-stormhold` (unknown id)
- `place.dunmer-north.riverwalk`.tolls → `route.road.stormhold-thorn` (unknown id)
- `place.dunmer-north.stormhold`.tolls → `route.boat.stormhold-alten-corimont` (unknown id)
- `place.dunmer-north.the-drover-camp`.patrols → `route.road.thorn-tear-road` (unknown id)
- `place.dunmer-north.the-field-gate-garrison`.patrols → `route.road.thorn-tear-road` (unknown id)
- `place.dunmer-north.the-north-border-post`.patrols → `route.road.thorn-tear-road` (unknown id)
- `place.dunmer-north.the-northern-rest`.reachedVia → `route.track.bogmother-causeway` (unknown id)
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

## Landforms used

any-firm-ground 306, any-shallow-marsh 85, open-water 33, ravine 17, flood-high 16, ridge-end 15, anchor 9, cliff-bench 9, cove 9, saddle 9, box-canyon 6, gorge 6, islet 6, spring-head 6, summit 6, waterfall 6, headland 5, island 5, water-narrows 5, enclosed-clearing 4, ford 4, isthmus 4, pinned (Part 6 meso siting) 4, land-bridge 2, oxbow 1, river-mouth 1

## Homeless batch (unresolved)

- `place.imperial-fringe.the-stone-talkers-watch` (tier 1)

## Tier 0–1 placements

| record | site | landform | region | why |
|---|---|---|---|---|
| `place.dunmer-north.bogmother` | site.scour.firm-lowland.summit-040 | summit | firm lowland | summit in firm lowland (danger band 2), 204 m from the nearest route; its choice #2 landform; won on landform, region, route. |
| `place.dunmer-north.gandranen-library` | site.scour.border-mountains.cliff-bench-030 | cliff-bench | border mountains | cliff bench in border mountains (danger band 3), 1491 m from the nearest route; its first-choice landform; won on culture-clump, landform, bound. |
| `place.dunmer-north.gandranen-ruins` | site.free.any-firm-ground-0177 | any-firm-ground | border mountains | firm ground in border mountains (danger band 3), 1421 m from the nearest route; at the water's edge; no free 'sinkhole' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.dunmer-north.hatching-pools` | site.scour.firm-lowland.spring-head-044 | spring-head | firm lowland | spring head in firm lowland (danger band 2), 45 m from the nearest route; at the water's edge; its first-choice landform; won on landform, culture-clump, region. |
| `place.dunmer-north.hissmir` | site.free.any-firm-ground-0148 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 419 m from the nearest route; its first-choice landform; won on culture-clump, landform, region. |
| `place.dunmer-north.hixinoag` | site.free.any-firm-ground-0254 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 3), 47 m from the nearest route; no free 'oxbow' site was left in the zone, so plain ground; won on culture-clump, region, ring. |
| `place.dunmer-north.hutan-tzel` | site.scour.firm-lowland.cliff-bench-028 | cliff-bench | firm lowland | cliff bench in firm lowland (danger band 3), 230 m from the nearest route; at the water's edge; its choice #5 landform; won on culture-clump, region, landform. |
| `place.dunmer-north.loriasel-caverns` | site.free.any-firm-ground-0252 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 653 m from the nearest route; no free 'sinkhole' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.dunmer-north.mazzatun` | pinned.mazzatun | pinned (Part 6 meso siting) | upland hills | Pinned by the Part 6 meso siting (world/sources/blueprints/place.dunmer-north.mazzatun.json): The rock shelf at the ridge end: 68 m x 42 m of ground between 198.3 m and 209 m, falling ~8.5 m north to south in three readable steps, flood band 0, 4.1 m above the water table, a headwater stream along its southern lip and a 55 m escarpment on the east. 85 m from Tsono-Xuhil and 296 m from the Gideon-Stormhold road. Every parcel measured on this ground fits the slope ladder at plinth, pad or dug-in; none needs a graded pad over 2 m. |
| `place.dunmer-north.mazzatun-hist` | site.scour.upland-hills.ridge-end-070 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 253 m from the nearest route; won on culture-clump, bound, region. |
| `place.dunmer-north.stillrise-village` | site.scour.seasonal-floodplain.island-018 | island | seasonal floodplain | island in seasonal floodplain (danger band 3), 508 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, remote. |
| `place.dunmer-north.stormhold` | anchor.stormhold | anchor | firm lowland | Owner-approved settlement anchor 'stormhold' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.dunmer-north.ten-maur-wolk` | site.scour.upland-hills.box-canyon-016 | box-canyon | upland hills | box canyon in upland hills (danger band 3), 1146 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote. |
| `place.dunmer-north.the-quiet-landing` | site.free.any-firm-ground-0334 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 97 m from the nearest route; its choice #2 landform; won on landform, culture-clump, route. |
| `place.dunmer-north.the-standing-bid` | site.free.roadside-0576 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 12 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, bound. |
| `place.dunmer-north.thorn` | anchor.thorn | anchor | firm lowland | Owner-approved settlement anchor 'thorn' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.dunmer-north.wolk-market` | site.free.roadside-0306 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 86 m from the nearest route; its choice #4 landform; won on route, landform, region. |
| `place.hist-heartland.bereaved-mnemic` | site.free.roadside-0065 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 23 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.hist-heartland.cult-raid-camp-unbound` | site.free.any-firm-ground-0849 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 544 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.hist-heartland.greenspring` | site.free.any-firm-ground-0396 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 93 m from the nearest route; no free 'confluence' site was left in the zone, so plain ground; won on culture-clump, nearPoint, region. |
| `place.hist-heartland.guide-camp-gate-side` | site.free.any-shallow-marsh-0562 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 273 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.hist-heartland.helstrom` | anchor.helstrom | anchor | rootland deep marsh | Owner-approved settlement anchor 'helstrom' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.hist-heartland.heretic-stone-restarted` | site.free.any-firm-ground-0788 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 377 m from the nearest route; at the water's edge; no free 'ridge-end' site was left in the zone, so plain ground; won on culture-clump, region, danger. |
| `place.hist-heartland.hist-agaceph-needle` | site.scour.rootland-deep-marsh.island-055 | island | rootland deep marsh | island in rootland deep marsh (danger band 5), 359 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, parent. |
| `place.hist-heartland.hist-first-rain-trunk` | site.free.open-water-0468 | open-water | rootland deep marsh | open water in rootland deep marsh (danger band 5), 510 m from the nearest route; at the water's edge; won on culture-clump, region, remote. |
| `place.hist-heartland.hist-paatru-lowcrown` | site.scour.tropical-jungle.spring-head-036 | spring-head | tropical jungle | spring head in tropical jungle (danger band 4), 258 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, landform, region. |
| `place.hist-heartland.hist-sarpa-highflower` | site.free.any-shallow-marsh-0659 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 117 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, parent. |
| `place.hist-heartland.lost-city` | site.scour.rootland-deep-marsh.enclosed-clearing-002 | enclosed-clearing | rootland deep marsh | enclosed clearing in rootland deep marsh (danger band 5), 501 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote. |
| `place.hist-heartland.nightbound-lightless` | site.free.roadside-0297 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 4), 20 m from the nearest route; at the water's edge; no free 'gorge' site was left in the zone, so plain ground; won on culture-clump, region, danger. |
| `place.hist-heartland.refuge-station-interior` | site.scour.firm-lowland.flood-high-030 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 215 m from the nearest route; its first-choice landform; won on landform, region, route. |
| `place.hist-heartland.root-gallery-cult-warren` | site.free.any-firm-ground-0810 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 398 m from the nearest route; its choice #5 landform; won on culture-clump, region, landform. |
| `place.hist-heartland.root-gallery-helstrom-underway` | site.free.any-shallow-marsh-0510 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 221 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.hist-heartland.root-talk-ground` | site.free.any-firm-ground-0814 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 378 m from the nearest route; its choice #3 landform; won on culture-clump, landform, region. |
| `place.hist-heartland.rootworm-station-helstrom` | site.scour.firm-lowland.flood-high-051 | flood-high | firm lowland | flood high in firm lowland (danger band 5), 136 m from the nearest route; its first-choice landform; won on culture-clump, landform, bound. |
| `place.hist-heartland.sap-collection-facility-daedric` | site.free.any-firm-ground-0816 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 449 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, remote, region. |
| `place.hist-heartland.sealed-xanmeer-living` | site.free.any-firm-ground-0815 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 456 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.hist-heartland.stone-calendar-hist-tsoko` | site.scour.firm-lowland.summit-026 | summit | firm lowland | summit in firm lowland (danger band 5), 151 m from the nearest route; its first-choice landform; won on landform, culture-clump, route. |
| `place.hist-heartland.the-cut-circle` | site.free.any-firm-ground-0520 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 585 m from the nearest route; its choice #2 landform; won on culture-clump, landform, region. |
| `place.hist-heartland.umpholo-mission` | site.free.roadside-0200 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 76 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, parent. |
| `place.hist-heartland.xal-krona-making-ground` | site.free.any-shallow-marsh-0586 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 510 m from the nearest route; no free 'box-canyon' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.hist-heartland.xal-meeruth-station` | site.free.any-firm-ground-0446 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 106 m from the nearest route; no free 'river-mouth' site was left in the zone, so plain ground; won on nearPoint, route, region; placed from the homeless batch at stage 'neighbour-repair'. |
| `place.hist-heartland.xanmeer-fort-defences-working` | site.scour.firm-lowland.summit-030 | summit | firm lowland | summit in firm lowland (danger band 5), 98 m from the nearest route; its choice #2 landform; won on landform, region, route. |
| `place.imperial-fringe.castle-giovesse` | site.scour.firm-lowland.summit-028 | summit | firm lowland | summit in firm lowland (danger band 3), 172 m from the nearest route; its first-choice landform; won on landform, culture-clump-yielded, route; placed from the homeless batch at stage 'spacing-1/2-region-relaxed'. |
| `place.imperial-fringe.fort-swampmoth` | site.scour.border-mountains.ridge-end-014 | ridge-end | border mountains | ridge end in border mountains (danger band 3), 267 m from the nearest route; its first-choice landform; won on landform, region, parent; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.imperial-fringe.gideon` | anchor.gideon | anchor | firm lowland | Owner-approved settlement anchor 'gideon' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.imperial-fringe.gideon-rootworm-terminus` | site.free.roadside-0261 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 74 m from the nearest route; its choice #4 landform; won on culture-clump, bound, landform. |
| `place.imperial-fringe.glenbridge` | site.free.any-firm-ground-0317 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 593 m from the nearest route; its choice #3 landform; won on culture-clump, landform, region. |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | site.free.any-firm-ground-0348 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 547 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.imperial-fringe.orma-tactile-ruin` | site.scour.upland-hills.box-canyon-019 | box-canyon | upland hills | box canyon in upland hills (danger band 3), 806 m from the nearest route; at the water's edge; its first-choice landform; won on landform, remote, region. |
| `place.imperial-fringe.rockgrove` | site.scour.firm-lowland.box-canyon-005 | box-canyon | firm lowland | box canyon in firm lowland (danger band 3), 944 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote. |
| `place.imperial-fringe.slough-point` | site.free.open-water-0650 | open-water | firm lowland | open water in firm lowland (danger band 3), 875 m from the nearest route; at the water's edge; won on culture-clump, region, navigable. |
| `place.imperial-fringe.stonewastes` | site.free.any-firm-ground-0903 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 677 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on region, parent, landform. |
| `place.imperial-fringe.the-silent-halls` | site.scour.firm-lowland.enclosed-clearing-001 | enclosed-clearing | firm lowland | enclosed clearing in firm lowland (danger band 4), 114 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, landform, region. |
| `place.imperial-penal-south.blackrose` | anchor.blackrose | anchor | fringe marsh | Owner-approved settlement anchor 'blackrose' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.imperial-penal-south.blackrose-drowned-hist` | site.free.open-water-0904 | open-water | lake & standing water | open water in lake & standing water (danger band 3), 70 m from the nearest route; at the water's edge; won on culture-clump, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.blackrose-prison` | site.scour.firm-lowland.flood-high-042 | flood-high | firm lowland | flood high in firm lowland (danger band 2), 181 m from the nearest route; its first-choice landform; won on landform, bound, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.bramman-head` | site.free.any-firm-ground-1273 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 326 m from the nearest route; at the water's edge; no free 'water-narrows' site was left in the zone, so plain ground; won on nearPoint, region, danger; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.chainbreaker-shelter` | site.free.any-firm-ground-1353 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 241 m from the nearest route; its first-choice landform; won on landform, culture-clump, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.flu-quarantine-village` | site.free.roadside-0352 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 33 m from the nearest route; its choice #3 landform; won on culture-clump, bound, landform; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lake-submerged-xanmeer` | site.free.open-water-0735 | open-water | lake & standing water | open water in lake & standing water (danger band 5), 283 m from the nearest route; at the water's edge; won on region, submerged, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lilmothiit-quarry` | site.free.open-water-0882 | open-water | lake & standing water | open water in lake & standing water (danger band 3), 88 m from the nearest route; at the water's edge; won on nearPoint, region, danger; placed from the homeless batch at stage 'region-relaxed'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.longmont` | site.free.any-firm-ground-1335 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 285 m from the nearest route; no free 'any-shallow-marsh' site was left in the zone, so plain ground; won on region, ring; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.murkwood-verge` | site.free.any-firm-ground-1322 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 292 m from the nearest route; its choice #3 landform; won on landform, parent, culture-clump; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.rose-flooded-passage` | site.free.open-water-0996 | open-water | lake & standing water | open water in lake & standing water (danger band 3), 345 m from the nearest route; at the water's edge; won on bound, region, danger. |
| `place.imperial-penal-south.rose-supply-town` | site.free.any-shallow-marsh-1278 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 2), 5 m from the nearest route; at the water's edge; no free 'ridge-end' site was left in the zone, so plain ground; won on route, region, danger; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.three-gate-toll` | site.free.any-firm-ground-1294 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 594 m from the nearest route; no free 'ford' site was left in the zone, so plain ground; won on nearPoint, region, parent; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.west-market-town` | site.free.any-firm-ground-1253 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 0 m from the nearest route; at the water's edge; its choice #4 landform; won on culture-clump, nearPoint, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.alten-meerhleel` | site.free.any-shallow-marsh-1325 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 2), 38 m from the nearest route; at the water's edge; no free 'natural-harbour' site was left in the zone, so plain ground; won on region, parent, navigable; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bramman-screen` | site.scour.mangrove-forest.isthmus-017 | isthmus | mangrove forest | isthmus in mangrove forest (danger band 3), 85 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bright-throat-village` | site.free.roadside-0615 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 93 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.chasepoint` | site.free.roadside-0325 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 27 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.inhabited-meer-murkmire` | site.scour.interior-swamp.summit-035 | summit | interior swamp | summit in interior swamp (danger band 3), 341 m from the nearest route; its choice #2 landform; won on landform, nearPoint, region; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.ixtaxh-xanmeer` | site.scour.lake-standing-water.cove-001 | cove | lake & standing water | cove in lake & standing water (danger band 3), 364 m from the nearest route; at the water's edge; its choice #5 landform; won on region, submerged, landform; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.lilmoth` | anchor.lilmoth | anchor | firm lowland | Owner-approved settlement anchor 'lilmoth' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.mercantile-coast.rockpark` | site.scour.firm-lowland.flood-high-038 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 768 m from the nearest route; its first-choice landform; won on culture-clump, landform, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.slaughter-memorial` | site.free.any-firm-ground-1237 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 252 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.soulrest` | anchor.soulrest | anchor | fringe marsh | Owner-approved settlement anchor 'soulrest' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.mercantile-coast.teeth-of-sithis` | site.scour.fringe-marsh.flood-high-006 | flood-high | fringe marsh | flood high in fringe marsh (danger band 2), 144 m from the nearest route; its choice #3 landform; won on landform, culture-clump, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.white-rose-prison` | site.scour.firm-lowland.flood-high-037 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 1027 m from the nearest route; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.xinchei-konu` | site.scour.firm-lowland.saddle-054 | saddle | firm lowland | saddle in firm lowland (danger band 3), 895 m from the nearest route; at the water's edge; its choice #5 landform; won on culture-clump, region, landform; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.bereaved-hist-less-since` | site.free.any-shallow-marsh-1225 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 3), 299 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on region, culture-clump, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.dead-water-village` | site.free.any-shallow-marsh-1193 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 401 m from the nearest route; its choice #2 landform; won on landform, nearPoint, culture-clump. |
| `place.naga-kur-deeps.deepmire-refuge` | site.free.open-water-0747 | open-water | interior swamp | open water in interior swamp (danger band 4), 160 m from the nearest route; at the water's edge; won on region, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.ferry-stage-guide-hire` | site.free.roadside-0339 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 33 m from the nearest route; at the water's edge; no free 'water-narrows' site was left in the zone, so plain ground; won on region, parent, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.harmed-hist-enslaved` | site.free.any-shallow-marsh-1030 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 4), 66 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, danger; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | site.free.any-firm-ground-0952 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 845 m from the nearest route; its choice #3 landform; won on nearPoint, landform, culture-clump; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.naga-kur-deeps.naga-village-settled` | site.free.any-shallow-marsh-1205 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 196 m from the nearest route; its choice #2 landform; won on culture-clump, landform, region. |
| `place.naga-kur-deeps.root-gallery-blight-warren` | site.free.any-firm-ground-1014 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 1110 m from the nearest route; its choice #5 landform; won on culture-clump, nearPoint, region; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-whisper-village` | site.free.any-shallow-marsh-1084 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 575 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.sithis-temple-mass-sacrifice` | site.free.open-water-0701 | open-water | rootland deep marsh | open water in rootland deep marsh (danger band 5), 1086 m from the nearest route; at the water's edge; won on culture-clump, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.umbriel-stripped-undead` | site.free.any-shallow-marsh-1107 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 49 m from the nearest route; its choice #2 landform; won on landform, region, culture-clump. |
| `place.naga-kur-deeps.wild-hist-rogue-deeps` | site.free.any-shallow-marsh-1137 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 710 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on remote, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.pirate-freeholds.alten-corimont` | anchor.alten-corimont | anchor | firm lowland | Owner-approved settlement anchor 'alten-corimont' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.pirate-freeholds.chasecreek` | site.free.roadside-0406 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 12 m from the nearest route; its first-choice landform; won on culture-clump, landform, nearPoint. |
| `place.pirate-freeholds.corimont-hist-less-camp` | site.scour.firm-lowland.land-bridge-008 | land-bridge | firm lowland | land bridge in firm lowland (danger band 3), 419 m from the nearest route; at the water's edge; won on region, parent, route. |
| `place.pirate-freeholds.opening-work-barge` | site.free.roadside-0391 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 80 m from the nearest route; no free 'any-channel-bank' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.pirate-freeholds.opening-work-camp` | site.free.roadside-0396 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 20 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, region. |
| `place.pirate-freeholds.rockpoint` | site.free.any-firm-ground-0327 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 303 m from the nearest route; no free 'cliff-bench' site was left in the zone, so plain ground; won on culture-clump, nearPoint, region; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.pirate-freeholds.upriver-hist-village` | site.free.any-firm-ground-0291 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 366 m from the nearest route; at the water's edge; its first-choice landform; won on landform, culture-clump, region. |
| `place.saxhleel-coast.archon` | anchor.archon | anchor | tropical jungle | Owner-approved settlement anchor 'archon' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.saxhleel-coast.archon-harbour-hist` | site.free.any-firm-ground-0996 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 82 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, bound. |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | site.free.any-firm-ground-1020 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 318 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on bound, region, parent. |
| `place.saxhleel-coast.cantemir-headland` | site.scour.mangrove-forest.flood-high-022 | flood-high | mangrove forest | flood high in mangrove forest (danger band 3), 27 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, landform, region. |
| `place.saxhleel-coast.east-estuary-rootworm-station` | site.free.roadside-0002 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 27 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, culture-clump. |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | site.free.any-shallow-marsh-0701 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 3), 295 m from the nearest route; at the water's edge; no free 'island' site was left in the zone, so plain ground; won on region, submerged, remote. |
| `place.saxhleel-coast.portdun-mont` | site.free.roadside-0008 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 39 m from the nearest route; its choice #3 landform; won on landform, region, parent. |
| `place.saxhleel-coast.seafalls` | site.scour.tropical-jungle.water-narrows-030 | water-narrows | tropical jungle | water narrows in tropical jungle (danger band 3), 46 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, route. |

## Owner-feedback checks (Part 4 step 2)

- stances: {'friendly': 73, 'wary': 69, 'guarded': 41, 'hostile': 274, 'neutral': 98, 'sanctuary': 24}
- swap pass exchanged 81 sites
- delves/combat places (D3+) with no friendly/sanctuary rest within 600 m (1200 m in D4–D5): 4

| city | purposes in 2 km | missing core purposes | hostile in 2 km | edge / hinterland / rural counts |
|---|---|---|---|---|
| stormhold | 14 | — | 56 | 6 / 46 / 125 |
| thorn | 13 | — | 35 | 7 / 41 / 80 |
| gideon | 14 | — | 80 | 7 / 64 / 151 |
| helstrom | 14 | — | 84 | 3 / 33 / 259 |
| archon | 13 | — | 58 | 9 / 29 / 95 |
| blackrose | 14 | — | 70 | 13 / 53 / 115 |
| lilmoth | 14 | — | 64 | 10 / 35 / 115 |
| soulrest | 14 | — | 38 | 8 / 26 / 86 |
| alten-corimont | 14 | — | 66 | 12 / 58 / 144 |

Rest-cadence gaps (add a rest or soften): `place.mercantile-coast.hist-village-keel-sakka` (688 m), `place.dunmer-north.the-guar-ground` (945 m), `place.imperial-fringe.vanins-signal` (642 m), `place.dunmer-north.the-crystal-prospectors` (641 m)

## Clustering — Clark-Evans R per zone (97 A5 / G3)

R = 1 is random in the zone's own shape. Even spacing (R > 1) is ACCEPTED where the typed footprint, proximity and isolation gates require it (owner steer 2026-09-09, reversing the earlier 'R < 1 everywhere' target); what is still wanted is that the settled zones stay the most clustered, because that is where lore puts hamlet clumps. Reported, not gated. Median R 1.122; Evener than random: dunmer-north, imperial-fringe, imperial-penal-south, mercantile-coast, naga-kur-deeps, pirate-freeholds, saxhleel-coast.

| zone | plotted | land km² | mean NN m | same-mask null m | R |
|---|---:|---:|---:|---:|---:|
| dunmer-north | 127 | 7.56 | 150.5 | 136.4 | **1.103** |
| hist-heartland | 116 | 8.98 | 149.5 | 174.7 | **0.856** |
| imperial-fringe | 119 | 6.96 | 147.7 | 131.7 | **1.122** |
| imperial-penal-south | 44 | 0.93 | 127.4 | 98.5 | **1.293** |
| mercantile-coast | 65 | 3.51 | 157.0 | 142.0 | **1.105** |
| naga-kur-deeps | 40 | 2.6 | 187.7 | 174.6 | **1.075** |
| pirate-freeholds | 31 | 0.8 | 136.0 | 96.5 | **1.41** |
| saxhleel-coast | 37 | 1.72 | 146.8 | 128.4 | **1.143** |
