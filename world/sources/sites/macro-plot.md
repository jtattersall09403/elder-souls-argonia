# Macro plot — coverage report (Phase 11 Part 3)

Seed 1103. Supply: 1172 scour sites + 2961 free-ground points. Demand: 580 live records; **580 plotted**, 0 unresolved.
Placed from the homeless batch: {'region-relaxed': 17, 'neighbour-zone': 77, 'relaxed-score': 14, 'spacing-1/2-region-relaxed': 2}.

| zone | live | plotted | homeless | landform wishes from recipe | top landforms |
|---|---|---|---|---|---|
| dunmer-north | 127 | 127 | 0 | 0 | any-firm-ground 78, open-water 8, ridge-end 8, gorge 7 |
| hist-heartland | 116 | 116 | 0 | 0 | any-firm-ground 57, any-shallow-marsh 37, open-water 9, summit 3 |
| imperial-fringe | 120 | 120 | 0 | 0 | any-firm-ground 94, ridge-end 7, ravine 5, box-canyon 4 |
| imperial-penal-south | 44 | 44 | 0 | 43 | any-firm-ground 11, any-shallow-marsh 10, cove 4, island 4 |
| mercantile-coast | 65 | 65 | 0 | 65 | any-firm-ground 30, any-shallow-marsh 15, open-water 7, flood-high 5 |
| naga-kur-deeps | 40 | 40 | 0 | 27 | any-shallow-marsh 25, open-water 4, any-firm-ground 3, water-narrows 2 |
| pirate-freeholds | 31 | 31 | 0 | 0 | any-firm-ground 23, open-water 2, ridge-end 2, anchor 1 |
| saxhleel-coast | 37 | 37 | 0 | 0 | any-firm-ground 16, any-shallow-marsh 13, open-water 2, anchor 1 |

## Spacing and routes

- nearest-neighbour distance p5 / median / p95: 75 / 133 / 261 m
- same-type pairs closer than 300 m: 4
- median distance to a route: 191 m; fine-tempo records within 300 m of a route: 63 %
- route-visibility sweep (482 samples every 150 m, radius 450 m): mean 3.58 destination/landmark places in sight; dead 9 %, crowded (4+) 42 %

## Anti-sameyness quota (no type > 25 % of a zone)

- none

## Named constraints (sightline / bound), as plotted

| record | kind | to | m | line of sight |
|---|---|---|---|---|
| `place.dunmer-north.gandranen-library` | bound | `place.dunmer-north.gandranen-ruins` | 68 | — |
| `place.dunmer-north.mazzatun-hist` | bound | `place.dunmer-north.mazzatun` | 39 | — |
| `place.dunmer-north.murkwater-shadowscale-ground` | bound | `place.dunmer-north.murkwater` | 270 | — |
| `place.dunmer-north.stormhold-causeway` | bound | `place.dunmer-north.stormhold` | 200 | — |
| `place.dunmer-north.the-black-stage` | bound | `place.dunmer-north.stormhold-causeway` | 198 | — |
| `place.dunmer-north.the-diggings-ladder` | bound | `place.dunmer-north.silyanorn-diggings` | 386 | — |
| `place.dunmer-north.the-divers-landing` | bound | `place.dunmer-north.the-drowned-terrace` | 242 | — |
| `place.dunmer-north.the-drawdown-flats` | bound | `place.dunmer-north.the-drowned-terrace` | 165 | — |
| `place.dunmer-north.the-first-count` | sightline | `place.dunmer-north.stormhold` | 303 | True |
| `place.dunmer-north.the-flu-cordon` | sightline | `place.dunmer-north.stillrise-village` | 97 | True |
| `place.dunmer-north.the-outer-silyanorn` | sightline | `place.dunmer-north.stormhold` | 1275 | True |
| `place.dunmer-north.the-pen-yard` | sightline | `place.dunmer-north.the-dres-rows` | 93 | True |
| `place.dunmer-north.the-pen-yard` | bound | `place.dunmer-north.the-dres-rows` | 93 | — |
| `place.dunmer-north.the-silyanorn-crown` | sightline | `place.dunmer-north.the-outer-silyanorn` | 143 | True |
| `place.dunmer-north.the-silyanorn-crown` | bound | `place.dunmer-north.the-outer-silyanorn` | 143 | — |
| `place.dunmer-north.the-slumped-hamlet` | sightline | `place.dunmer-north.the-shut-village` | 152 | True |
| `place.dunmer-north.the-standing-bid` | sightline | `place.dunmer-north.stormhold` | 255 | True |
| `place.dunmer-north.the-standing-bid` | bound | `place.dunmer-north.stormhold` | 255 | — |
| `place.dunmer-north.the-stormhold-falls-chamber` | bound | `place.dunmer-north.stormhold` | 261 | — |
| `place.dunmer-north.the-stripped-village` | bound | `place.dunmer-north.the-field-gate-garrison` | 1140 | — |
| `place.dunmer-north.the-thorn-bond` | bound | `place.dunmer-north.thorn` | 142 | — |
| `place.dunmer-north.the-veterans-ridge` | sightline | `place.dunmer-north.tear-road-stage` | 1004 | True |
| `place.dunmer-north.thorn-paddy-terraces` | bound | `place.dunmer-north.thorn` | 124 | — |
| `place.dunmer-north.waits-for-the-trial` | sightline | `place.dunmer-north.hissmir` | 68 | True |
| `place.dunmer-north.waits-for-the-trial` | bound | `place.dunmer-north.hissmir` | 68 | — |
| `place.hist-heartland.bereaved-mnemic` | bound | `place.hist-heartland.walkway-junction-high-crossroads` | 714 | — |
| `place.hist-heartland.bubble-spire-collapsed` | bound | `place.hist-heartland.bubble-spire-open-helstrom` | 125 | — |
| `place.hist-heartland.guide-camp-far-shelter` | bound | `place.hist-heartland.guide-camp-gate-side` | 842 | — |
| `place.hist-heartland.guide-camp-gate-side` | bound | `place.hist-heartland.helstrom` | 139 | — |
| `place.hist-heartland.miregaunt-ward-approach` | bound | `place.hist-heartland.sealed-xanmeer-living` | 222 | — |
| `place.hist-heartland.root-gallery-helstrom-underway` | bound | `place.hist-heartland.helstrom` | 92 | — |
| `place.hist-heartland.rootworm-station-helstrom` | bound | `place.hist-heartland.helstrom` | 235 | — |
| `place.hist-heartland.sap-tapping-licensed` | sightline | `place.hist-heartland.harmed-hist-tapped` | 1256 | True |
| `place.hist-heartland.vista-ledge-canopy-break` | sightline | `place.hist-heartland.helstrom` | 1257 | True |
| `place.hist-heartland.xal-krona-making-ground` | bound | `place.hist-heartland.lost-city` | 73 | — |
| `place.imperial-fringe.ashen-tower` | sightline | `place.imperial-fringe.fort-swampmoth` | 749 | True |
| `place.imperial-fringe.bone-road-waystation` | bound | `place.imperial-fringe.the-counted-dead` | 294 | — |
| `place.imperial-fringe.cassian-farm` | bound | `place.imperial-fringe.gideon` | 823 | — |
| `place.imperial-fringe.castle-giovesse` | sightline | `place.imperial-fringe.gideon` | 453 | True |
| `place.imperial-fringe.collections-dig` | bound | `place.imperial-fringe.twyllbek-ruins` | 128 | — |
| `place.imperial-fringe.fort-swampmoth` | sightline | `place.imperial-fringe.mile-house-of-the-eagle` | 856 | True |
| `place.imperial-fringe.gideon-rootworm-terminus` | bound | `place.imperial-fringe.gideon` | 389 | — |
| `place.imperial-fringe.gideon-synod-outstation` | bound | `place.imperial-fringe.gideon` | 300 | — |
| `place.imperial-fringe.giovesse-lines` | sightline | `place.imperial-fringe.castle-giovesse` | 917 | True |
| `place.imperial-fringe.glenbridge` | sightline | `place.imperial-fringe.glenbridge-sermon-xanmeer` | 93 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | sightline | `place.imperial-fringe.glenbridge` | 93 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | bound | `place.imperial-fringe.glenbridge` | 93 | — |
| `place.imperial-fringe.ridge-runners-post` | sightline | `place.imperial-fringe.ashen-tower` | 491 | True |
| `place.imperial-fringe.the-abandoned-survey` | bound | `place.imperial-fringe.the-vellum-estate` | 84 | — |
| `place.imperial-fringe.the-drowning-gate` | sightline | `place.imperial-fringe.the-embankment-that-drowned` | 965 | True |
| `place.imperial-fringe.the-embankment-that-drowned` | sightline | `place.imperial-fringe.the-drowning-gate` | 965 | True |
| `place.imperial-fringe.the-marble-field` | sightline | `place.imperial-fringe.gideon` | 218 | True |
| `place.imperial-fringe.the-ring-of-nine-wells` | sightline | `place.imperial-fringe.twyllbek-ruins` | 465 | True |
| `place.imperial-fringe.the-sermon-road-camp` | bound | `place.imperial-fringe.glenbridge` | 82 | — |
| `place.imperial-fringe.the-shut-door` | sightline | `place.imperial-fringe.the-kept-terrace` | 447 | True |
| `place.imperial-fringe.the-snowline-cell` | sightline | `place.imperial-fringe.ridge-runners-post` | 371 | True |
| `place.imperial-fringe.the-stone-talkers-watch` | sightline | `place.imperial-fringe.rockgrove` | 219 | True |
| `place.imperial-fringe.twyllbek-crown` | sightline | `place.imperial-fringe.twyllbek-ruins` | 341 | True |
| `place.imperial-penal-south.akaviri-works` | bound | `place.imperial-penal-south.lilmothiit-quarry` | 251 | — |
| `place.imperial-penal-south.blackrose-prison` | bound | `place.imperial-penal-south.blackrose` | 363 | — |
| `place.imperial-penal-south.drowned-gallery` | bound | `place.imperial-penal-south.blackrose-prison` | 434 | — |
| `place.imperial-penal-south.flu-quarantine-village` | bound | `place.imperial-penal-south.blackrose` | 568 | — |
| `place.imperial-penal-south.necromantic-dig` | bound | `place.imperial-penal-south.blackrose-prison` | 266 | — |
| `place.imperial-penal-south.plague-cordon` | bound | `place.imperial-penal-south.rose-supply-town` | 94 | — |
| `place.imperial-penal-south.prison-born-refuge` | bound | `place.imperial-penal-south.longmont` | 190 | — |
| `place.imperial-penal-south.rockspring` | bound | `place.imperial-penal-south.bramman-head` | 134 | — |
| `place.imperial-penal-south.rose-flooded-passage` | bound | `place.imperial-penal-south.blackrose-prison` | 212 | — |
| `place.imperial-penal-south.rose-outworks` | bound | `place.imperial-penal-south.blackrose-prison` | 52 | — |
| `place.imperial-penal-south.voriplasm-vault` | bound | `place.imperial-penal-south.bramman-head` | 380 | — |
| `place.mercantile-coast.inhabited-meer-murkmire` | sightline | `place.mercantile-coast.soulrest` | 688 | True |
| `place.mercantile-coast.oliis-boardwalk` | bound | `place.mercantile-coast.oliis-ferry-stage` | 96 | — |
| `place.mercantile-coast.oliis-drake-deep` | bound | `place.mercantile-coast.oliis-air-station` | 1112 | — |
| `place.mercantile-coast.pusbottom-barge` | bound | `place.mercantile-coast.lilmoth` | 135 | — |
| `place.mercantile-coast.sacked-customs-suburb` | sightline | `place.mercantile-coast.lilmoth` | 65 | True |
| `place.mercantile-coast.sacked-customs-suburb` | bound | `place.mercantile-coast.lilmoth` | 65 | — |
| `place.mercantile-coast.screen-watch` | bound | `place.mercantile-coast.bramman-screen` | 859 | — |
| `place.mercantile-coast.soulrest-breaking-yard` | bound | `place.mercantile-coast.soulrest` | 224 | — |
| `place.mercantile-coast.soulrest-divers-yard` | bound | `place.mercantile-coast.soulrest` | 152 | — |
| `place.mercantile-coast.soulrest-quay-tradehouse` | bound | `place.mercantile-coast.soulrest` | 132 | — |
| `place.mercantile-coast.wraxu-stacks` | sightline | `place.mercantile-coast.wraxu-frieze` | 568 | True |
| `place.mercantile-coast.wraxu-stacks` | bound | `place.mercantile-coast.wraxu-frieze` | 568 | — |
| `place.naga-kur-deeps.drifting-village-wet-mooring` | bound | `place.naga-kur-deeps.leviathan-bone-field` | 294 | — |
| `place.pirate-freeholds.alten-corimont` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 45 | True |
| `place.pirate-freeholds.careening-hard` | bound | `place.pirate-freeholds.alten-corimont` | 147 | — |
| `place.pirate-freeholds.corimont-crosstrees` | bound | `place.pirate-freeholds.alten-corimont` | 45 | — |
| `place.pirate-freeholds.freehold-market` | bound | `place.pirate-freeholds.alten-corimont` | 107 | — |
| `place.pirate-freeholds.freehold-smithy` | sightline | `place.pirate-freeholds.careening-hard` | 176 | True |
| `place.pirate-freeholds.freehold-smithy` | bound | `place.pirate-freeholds.alten-corimont` | 57 | — |
| `place.pirate-freeholds.kothringi-river-ruin` | bound | `place.pirate-freeholds.alten-corimont` | 342 | — |
| `place.pirate-freeholds.opening-work-barge` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 163 | True |
| `place.pirate-freeholds.opening-work-barge` | bound | `place.pirate-freeholds.alten-corimont` | 189 | — |
| `place.pirate-freeholds.opening-work-camp` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 190 | True |
| `place.pirate-freeholds.opening-work-camp` | bound | `place.pirate-freeholds.opening-work-barge` | 116 | — |
| `place.pirate-freeholds.rim-keystone-chamber` | bound | `place.pirate-freeholds.rim-pass-station` | 206 | — |
| `place.pirate-freeholds.veterans-holding` | sightline | `place.pirate-freeholds.trunk-toll-bridge` | 675 | True |
| `place.saxhleel-coast.archon-bonded-row` | bound | `place.saxhleel-coast.archon` | 246 | — |
| `place.saxhleel-coast.archon-harbour-hist` | bound | `place.saxhleel-coast.archon` | 266 | — |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.archon` | 182 | True |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.padomaic-wrecker-beach` | 521 | True |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.outer-reef` | 1154 | True |
| `place.saxhleel-coast.archon-lighthouse` | bound | `place.saxhleel-coast.archon` | 182 | — |
| `place.saxhleel-coast.archon-sacked-quarter` | bound | `place.saxhleel-coast.archon` | 81 | — |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | bound | `place.saxhleel-coast.archon` | 336 | — |
| `place.saxhleel-coast.archon-shipyard` | bound | `place.saxhleel-coast.archon` | 142 | — |
| `place.saxhleel-coast.coast-hist-less-refuge` | bound | `place.saxhleel-coast.archon` | 840 | — |
| `place.saxhleel-coast.contested-bank` | bound | `place.saxhleel-coast.quay-tradehouse` | 149 | — |
| `place.saxhleel-coast.east-estuary-rootworm-station` | bound | `place.saxhleel-coast.archon` | 281 | — |
| `place.saxhleel-coast.estuary-keepers-lodge` | bound | `place.saxhleel-coast.archon-lighthouse` | 782 | — |
| `place.saxhleel-coast.gap-reef` | sightline | `place.saxhleel-coast.archon-lighthouse` | 596 | True |
| `place.saxhleel-coast.gap-reef` | bound | `place.saxhleel-coast.archon-lighthouse` | 596 | — |
| `place.saxhleel-coast.mangrove-reef` | bound | `place.saxhleel-coast.tide-street-village` | 194 | — |
| `place.saxhleel-coast.oliis-coast-lay-by` | bound | `place.saxhleel-coast.archon` | 505 | — |
| `place.saxhleel-coast.padomaic-wrecker-beach` | sightline | `place.saxhleel-coast.archon-lighthouse` | 521 | True |
| `place.saxhleel-coast.padomaic-wrecker-beach` | bound | `place.saxhleel-coast.archon-lighthouse` | 521 | — |
| `place.saxhleel-coast.quarantine-village-lagoon` | bound | `place.saxhleel-coast.archon` | 641 | — |

## Records placed from the homeless batch

| record | stage | site |
|---|---|---|
| `place.dunmer-north.channel-cross-village` | region-relaxed | site.free.any-firm-ground-0071 |
| `place.dunmer-north.climbs-to-see` | region-relaxed | site.scour.fringe-marsh.cliff-bench-076 |
| `place.dunmer-north.cut-and-stack` | neighbour-zone | site.free.roadside-0111 |
| `place.dunmer-north.reedmoor-stilts` | region-relaxed | site.free.open-water-0197 |
| `place.dunmer-north.seam-chasers` | region-relaxed | site.scour.border-mountains.gorge-014 |
| `place.dunmer-north.silyanorn-diggings` | region-relaxed | site.scour.border-mountains.saddle-051 |
| `place.dunmer-north.stands-on-the-island` | region-relaxed | site.free.any-firm-ground-0186 |
| `place.dunmer-north.the-borrowed-tomb` | neighbour-zone | site.free.any-firm-ground-0070 |
| `place.dunmer-north.the-diggings-ladder` | region-relaxed | site.scour.upland-hills.ravine-088 |
| `place.dunmer-north.the-divers-landing` | region-relaxed | site.free.any-firm-ground-0007 |
| `place.dunmer-north.the-drawdown-flats` | neighbour-zone | site.free.open-water-0015 |
| `place.dunmer-north.the-drover-camp` | neighbour-zone | site.free.any-firm-ground-0273 |
| `place.dunmer-north.the-drowned-terrace` | neighbour-zone | site.free.open-water-0013 |
| `place.dunmer-north.the-flu-cordon` | neighbour-zone | site.scour.lake-standing-water.cliff-bench-025 |
| `place.dunmer-north.the-monsoon-boom` | neighbour-zone | site.free.any-firm-ground-0336 |
| `place.dunmer-north.the-pen-yard` | neighbour-zone | site.free.any-firm-ground-0267 |
| `place.dunmer-north.the-tide-fair` | region-relaxed | site.free.any-firm-ground-0043 |
| `place.dunmer-north.the-white-pans` | neighbour-zone | site.scour.ocean.cove-063 |
| `place.dunmer-north.the-wild-mouth` | neighbour-zone | site.free.any-firm-ground-0249 |
| `place.dunmer-north.thorn-paddy-terraces` | neighbour-zone | site.free.roadside-0751 |
| `place.dunmer-north.three-ways-over-water` | region-relaxed | site.scour.fringe-marsh.isthmus-050 |
| `place.dunmer-north.tunnel-rat-gallery` | relaxed-score | site.free.any-firm-ground-0235 |
| `place.hist-heartland.alten-markmont` | neighbour-zone | site.free.any-firm-ground-0250 |
| `place.hist-heartland.broken-xanmeer-subsumed` | neighbour-zone | site.free.roadside-0714 |
| `place.hist-heartland.bubble-spire-collapsed` | neighbour-zone | site.free.roadside-0547 |
| `place.hist-heartland.dream-wallow-starblossom` | neighbour-zone | site.free.roadside-0864 |
| `place.hist-heartland.hammock-tree-island-greenmoss` | neighbour-zone | site.free.any-firm-ground-0482 |
| `place.hist-heartland.harmed-hist-tapped` | neighbour-zone | site.free.any-shallow-marsh-0902 |
| `place.hist-heartland.miregaunt-ground-slow-ground` | neighbour-zone | site.free.any-shallow-marsh-0492 |
| `place.hist-heartland.naga-lay-up-second-man` | neighbour-zone | site.free.any-firm-ground-0398 |
| `place.hist-heartland.root-gallery-collapsed-nine` | neighbour-zone | site.free.any-shallow-marsh-0864 |
| `place.hist-heartland.root-gallery-drowned-stair` | neighbour-zone | site.free.open-water-0462 |
| `place.hist-heartland.root-gallery-lantern-hollow` | neighbour-zone | site.free.any-shallow-marsh-0468 |
| `place.hist-heartland.rootworm-burrow-dead` | neighbour-zone | site.free.any-firm-ground-0865 |
| `place.hist-heartland.stilt-channel-edge-two-poles` | neighbour-zone | site.free.any-shallow-marsh-0408 |
| `place.hist-heartland.stilt-channel-edge-uxaneet` | neighbour-zone | site.free.any-shallow-marsh-0531 |
| `place.hist-heartland.treasure-hunters-live-camp` | relaxed-score | site.scour.firm-lowland.headland-031 |
| `place.imperial-fringe.castle-giovesse` | neighbour-zone | site.scour.border-mountains.ridge-end-033 |
| `place.imperial-fringe.giovesse-lines` | neighbour-zone | site.free.roadside-0521 |
| `place.imperial-fringe.low-water-fair` | region-relaxed | site.free.any-firm-ground-0515 |
| `place.imperial-fringe.lowmere-raft-town` | neighbour-zone | site.scour.lake-standing-water.islet-023 |
| `place.imperial-fringe.onkobra-ferry` | relaxed-score | site.free.any-firm-ground-1021 |
| `place.imperial-fringe.red-cart-yard` | neighbour-zone | site.free.roadside-0415 |
| `place.imperial-fringe.reedcutters-toll` | region-relaxed | site.free.roadside-0440 |
| `place.imperial-fringe.the-abandoned-survey` | neighbour-zone | site.free.any-firm-ground-0490 |
| `place.imperial-fringe.the-embankment-that-drowned` | relaxed-score | site.scour.border-mountains.ridge-end-079 |
| `place.imperial-fringe.the-empty-steading` | neighbour-zone | site.free.any-firm-ground-0901 |
| `place.imperial-fringe.the-lake-divers-yard` | region-relaxed | site.free.any-firm-ground-0243 |
| `place.imperial-fringe.the-marble-field` | neighbour-zone | site.free.any-firm-ground-0632 |
| `place.imperial-fringe.the-sermon-road-camp` | neighbour-zone | site.free.any-firm-ground-0576 |
| `place.imperial-fringe.the-stone-talkers-watch` | neighbour-zone | site.free.any-firm-ground-0245 |
| `place.imperial-fringe.the-vellum-estate` | neighbour-zone | site.free.any-firm-ground-0491 |
| `place.imperial-penal-south.akaviri-works` | relaxed-score | site.scour.lake-standing-water.islet-021 |
| `place.imperial-penal-south.basin-sinkhole` | neighbour-zone | site.free.any-shallow-marsh-1328 |
| `place.imperial-penal-south.chainbreaker-shelter` | neighbour-zone | site.free.any-firm-ground-1329 |
| `place.imperial-penal-south.drawdown-flat` | neighbour-zone | site.scour.lake-standing-water.islet-036 |
| `place.imperial-penal-south.lake-boardwalk-village` | region-relaxed | site.free.any-shallow-marsh-1224 |
| `place.imperial-penal-south.lake-divers-yard` | neighbour-zone | site.scour.lake-standing-water.cove-066 |
| `place.imperial-penal-south.lake-submerged-xanmeer` | neighbour-zone | site.scour.interior-swamp.island-007 |
| `place.imperial-penal-south.ledgered-blackguards` | relaxed-score | site.free.any-firm-ground-1313 |
| `place.imperial-penal-south.lilmothiit-quarry` | relaxed-score | site.scour.lake-standing-water.isthmus-033 |
| `place.imperial-penal-south.marsh-giant-ground-basin` | neighbour-zone | site.free.any-shallow-marsh-1123 |
| `place.imperial-penal-south.murkwood-verge` | neighbour-zone | site.free.any-shallow-marsh-1148 |
| `place.imperial-penal-south.natural-dive-shaft` | neighbour-zone | site.free.open-water-0503 |
| `place.imperial-penal-south.necromantic-dig` | neighbour-zone | site.scour.interior-swamp.flood-high-038 |
| `place.imperial-penal-south.plague-cordon` | neighbour-zone | site.free.roadside-0029 |
| `place.imperial-penal-south.scandal-holding-pit` | neighbour-zone | site.free.any-shallow-marsh-1175 |
| `place.imperial-penal-south.voriplasm-vault` | relaxed-score | site.scour.lake-standing-water.cove-028 |
| `place.imperial-penal-south.wisp-lure-basin` | neighbour-zone | site.free.roadside-0019 |
| `place.mercantile-coast.bog-blight-ground-murkmire` | neighbour-zone | site.free.any-shallow-marsh-1183 |
| `place.mercantile-coast.hammock-crown-murkmire` | relaxed-score | site.free.roadside-0064 |
| `place.mercantile-coast.head-of-tide` | neighbour-zone | site.free.roadside-0784 |
| `place.mercantile-coast.hereguard-plantation` | spacing-1/2-region-relaxed | site.scour.firm-lowland.flood-high-002 |
| `place.mercantile-coast.high-junction` | neighbour-zone | site.free.roadside-0721 |
| `place.mercantile-coast.keel-sakka-stilts` | neighbour-zone | site.free.roadside-0813 |
| `place.mercantile-coast.lighter-flotilla` | neighbour-zone | site.free.open-water-0497 |
| `place.mercantile-coast.oliis-boardwalk` | neighbour-zone | site.free.any-shallow-marsh-1187 |
| `place.mercantile-coast.oliis-ferry-stage` | neighbour-zone | site.free.any-firm-ground-1188 |
| `place.mercantile-coast.root-gallery-murkmire` | neighbour-zone | site.free.any-firm-ground-1038 |
| `place.mercantile-coast.screen-watch` | spacing-1/2-region-relaxed | site.free.any-shallow-marsh-1206 |
| `place.mercantile-coast.soulrest-breaking-yard` | neighbour-zone | site.scour.tidal-delta.river-mouth-011 |
| `place.mercantile-coast.xhon-mehl-shrine` | neighbour-zone | site.free.any-firm-ground-1091 |
| `place.naga-kur-deeps.bog-blight-ground-nine-stakes` | neighbour-zone | site.free.roadside-0445 |
| `place.naga-kur-deeps.dive-shaft-natural-deeps` | neighbour-zone | site.free.open-water-0506 |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | neighbour-zone | site.free.roadside-0705 |
| `place.naga-kur-deeps.legendary-deep-feather-serpent` | relaxed-score | site.free.any-shallow-marsh-1045 |
| `place.naga-kur-deeps.maturity-trial-kaju-kill` | relaxed-score | site.free.any-shallow-marsh-0991 |
| `place.naga-kur-deeps.miregaunt-ward-open` | neighbour-zone | site.free.any-firm-ground-1082 |
| `place.naga-kur-deeps.naga-highway-camp-active-north` | relaxed-score | site.scour.rootland-deep-marsh.isthmus-031 |
| `place.naga-kur-deeps.naga-highway-camp-active-south` | neighbour-zone | site.free.any-shallow-marsh-1120 |
| `place.naga-kur-deeps.root-gallery-blight-warren` | neighbour-zone | site.free.any-firm-ground-1056 |
| `place.naga-kur-deeps.sealed-xanmeer-vakka-deeps` | relaxed-score | site.free.any-shallow-marsh-1022 |
| `place.naga-kur-deeps.serpent-ground-moon-adder` | relaxed-score | site.scour.interior-swamp.cove-039 |
| `place.naga-kur-deeps.wreck-submerged-barge` | neighbour-zone | site.free.open-water-0588 |
| `place.pirate-freeholds.corimont-hiring-yard` | neighbour-zone | site.free.roadside-0923 |
| `place.pirate-freeholds.corimont-low-store` | neighbour-zone | site.free.any-firm-ground-0182 |
| `place.pirate-freeholds.dunmer-frontier-holding` | neighbour-zone | site.scour.upland-hills.ridge-end-049 |
| `place.pirate-freeholds.freehold-market` | neighbour-zone | site.free.any-firm-ground-0229 |
| `place.pirate-freeholds.freehold-naga-camp` | neighbour-zone | site.free.roadside-0880 |
| `place.pirate-freeholds.freehold-smithy` | neighbour-zone | site.free.any-firm-ground-0206 |
| `place.pirate-freeholds.half-chartered-anchorage` | neighbour-zone | site.free.roadside-0155 |
| `place.pirate-freeholds.opening-work-camp` | neighbour-zone | site.free.roadside-0163 |
| `place.pirate-freeholds.reach-wreck` | neighbour-zone | site.free.open-water-0156 |
| `place.pirate-freeholds.rim-keystone-chamber` | neighbour-zone | site.scour.upland-hills.ravine-066 |
| `place.pirate-freeholds.rim-snowline-hermitage` | neighbour-zone | site.free.any-firm-ground-0126 |
| `place.pirate-freeholds.trunk-road-tradehouse` | neighbour-zone | site.free.open-water-0173 |
| `place.saxhleel-coast.archon-bonded-row` | region-relaxed | site.free.roadside-0829 |
| `place.saxhleel-coast.archon-glowgill-byre` | region-relaxed | site.scour.tropical-jungle.cove-043 |
| `place.saxhleel-coast.jungle-root-hollow` | neighbour-zone | site.free.any-firm-ground-0880 |
| `place.saxhleel-coast.pearl-lots` | region-relaxed | site.scour.mangrove-forest.islet-031 |

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

any-firm-ground 312, any-shallow-marsh 102, open-water 37, ridge-end 17, cove 11, ravine 11, anchor 9, flood-high 9, gorge 8, islet 7, island 6, saddle 6, box-canyon 5, cliff-bench 5, isthmus 5, summit 5, pinned (Part 6 meso siting) 4, headland 3, water-narrows 3, waterfall 3, enclosed-clearing 2, ford 2, land-bridge 2, oxbow 2, river-mouth 2, any-channel-bank 1, spring-head 1

## Homeless batch (unresolved)

- none: every live record found ground

## Tier 0–1 placements

| record | site | landform | region | why |
|---|---|---|---|---|
| `place.dunmer-north.bogmother` | site.scour.firm-lowland.summit-041 | summit | firm lowland | summit in firm lowland (danger band 2), 351 m from the nearest route; its choice #2 landform; won on landform, region, danger. |
| `place.dunmer-north.gandranen-library` | site.scour.border-mountains.cliff-bench-035 | cliff-bench | border mountains | cliff bench in border mountains (danger band 3), 1584 m from the nearest route; its first-choice landform; won on culture-clump, landform, bound. |
| `place.dunmer-north.gandranen-ruins` | site.free.any-firm-ground-0090 | any-firm-ground | border mountains | firm ground in border mountains (danger band 3), 1655 m from the nearest route; no free 'sinkhole' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.dunmer-north.hatching-pools` | site.free.any-firm-ground-0272 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 32 m from the nearest route; at the water's edge; no free 'spring-head' site was left in the zone, so plain ground; won on region, danger, parent. |
| `place.dunmer-north.hissmir` | site.free.any-firm-ground-0087 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 510 m from the nearest route; its first-choice landform; won on landform, culture-clump, region. |
| `place.dunmer-north.hixinoag` | site.free.any-firm-ground-0212 | any-firm-ground | border mountains | firm ground in border mountains (danger band 3), 497 m from the nearest route; no free 'oxbow' site was left in the zone, so plain ground; won on culture-clump, parent, landform. |
| `place.dunmer-north.hutan-tzel` | site.scour.fringe-marsh.cliff-bench-053 | cliff-bench | fringe marsh | cliff bench in fringe marsh (danger band 3), 621 m from the nearest route; at the water's edge; its choice #5 landform; won on culture-clump, region, landform. |
| `place.dunmer-north.loriasel-caverns` | site.scour.border-mountains.ridge-end-002 | ridge-end | border mountains | ridge end in border mountains (danger band 3), 1494 m from the nearest route; won on culture-clump, remote, route. |
| `place.dunmer-north.mazzatun` | pinned.mazzatun | pinned (Part 6 meso siting) | upland hills | Pinned by the Part 6 meso siting (world/sources/blueprints/place.dunmer-north.mazzatun.json): The rock shelf at the ridge end: 68 m x 42 m of ground between 198.3 m and 209 m, falling ~8.5 m north to south in three readable steps, flood band 0, 4.1 m above the water table, a headwater stream along its southern lip and a 55 m escarpment on the east. 85 m from Tsono-Xuhil and 296 m from the Gideon-Stormhold road. Every parcel measured on this ground fits the slope ladder at plinth, pad or dug-in; none needs a graded pad over 2 m. |
| `place.dunmer-north.mazzatun-hist` | site.free.open-water-0145 | open-water | upland hills | open water in upland hills (danger band 3), 251 m from the nearest route; at the water's edge; won on culture-clump, bound, region. |
| `place.dunmer-north.stillrise-village` | site.scour.lake-standing-water.box-canyon-042 | box-canyon | lake & standing water | box canyon in lake & standing water (danger band 5), 1285 m from the nearest route; at the water's edge; its choice #4 landform; won on culture-clump, landform, region. |
| `place.dunmer-north.stormhold` | anchor.stormhold | anchor | firm lowland | Owner-approved settlement anchor 'stormhold' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.ten-maur-wolk` | site.free.any-firm-ground-0054 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 1144 m from the nearest route; no free 'box-canyon' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.dunmer-north.the-quiet-landing` | site.free.any-firm-ground-0319 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 82 m from the nearest route; its choice #2 landform; won on landform, route, region. |
| `place.dunmer-north.the-standing-bid` | site.free.roadside-0373 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 82 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, culture-clump. |
| `place.dunmer-north.thorn` | anchor.thorn | anchor | firm lowland | Owner-approved settlement anchor 'thorn' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.wolk-market` | site.free.roadside-0105 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 0 m from the nearest route; at the water's edge; its choice #4 landform; won on culture-clump, route, landform. |
| `place.hist-heartland.bereaved-mnemic` | site.free.open-water-0282 | open-water | seasonal floodplain | open water in seasonal floodplain (danger band 5), 179 m from the nearest route; at the water's edge; won on bound, region, parent. |
| `place.hist-heartland.cult-raid-camp-unbound` | site.free.roadside-0712 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 93 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, danger. |
| `place.hist-heartland.greenspring` | site.free.roadside-0188 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 58 m from the nearest route; no free 'confluence' site was left in the zone, so plain ground; won on culture-clump, nearPoint, region. |
| `place.hist-heartland.guide-camp-gate-side` | site.free.any-shallow-marsh-0528 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 137 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.hist-heartland.helstrom` | anchor.helstrom | anchor | lake & standing water | Owner-approved settlement anchor 'helstrom' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.hist-heartland.heretic-stone-restarted` | site.free.any-firm-ground-0750 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 54 m from the nearest route; at the water's edge; no free 'ridge-end' site was left in the zone, so plain ground; won on culture-clump, region, danger. |
| `place.hist-heartland.hist-agaceph-needle` | site.free.any-shallow-marsh-0375 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 659 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.hist-heartland.hist-first-rain-trunk` | site.free.any-firm-ground-0944 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 808 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, remote, danger. |
| `place.hist-heartland.hist-paatru-lowcrown` | site.free.any-shallow-marsh-0445 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 499 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.hist-heartland.hist-sarpa-highflower` | site.free.any-shallow-marsh-0608 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 78 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, parent. |
| `place.hist-heartland.lost-city` | site.scour.fringe-marsh.enclosed-clearing-003 | enclosed-clearing | fringe marsh | enclosed clearing in fringe marsh (danger band 3), 447 m from the nearest route; its first-choice landform; won on culture-clump, landform, region. |
| `place.hist-heartland.nightbound-lightless` | site.free.any-shallow-marsh-0312 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 503 m from the nearest route; no free 'gorge' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.hist-heartland.refuge-station-interior` | site.free.any-firm-ground-0307 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 276 m from the nearest route; its choice #3 landform; won on landform, region, danger. |
| `place.hist-heartland.root-gallery-cult-warren` | site.free.any-firm-ground-0913 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 861 m from the nearest route; its choice #5 landform; won on region, remote, landform. |
| `place.hist-heartland.root-gallery-helstrom-underway` | site.free.any-shallow-marsh-0556 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 5 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.hist-heartland.root-talk-ground` | site.free.any-firm-ground-0806 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 495 m from the nearest route; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.rootworm-station-helstrom` | site.scour.firm-lowland.flood-high-013 | flood-high | firm lowland | flood high in firm lowland (danger band 5), 99 m from the nearest route; its first-choice landform; won on landform, bound, region. |
| `place.hist-heartland.sap-collection-facility-daedric` | site.free.any-firm-ground-0877 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 876 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on remote, region, parent. |
| `place.hist-heartland.sealed-xanmeer-living` | site.free.any-shallow-marsh-0389 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 330 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, culture-clump, danger. |
| `place.hist-heartland.stone-calendar-hist-tsoko` | site.scour.firm-lowland.summit-038 | summit | firm lowland | summit in firm lowland (danger band 5), 444 m from the nearest route; its first-choice landform; won on culture-clump, landform, route. |
| `place.hist-heartland.the-cut-circle` | site.free.any-shallow-marsh-0658 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 575 m from the nearest route; at the water's edge; its first-choice landform; won on landform, culture-clump, region. |
| `place.hist-heartland.umpholo-mission` | site.free.any-firm-ground-0481 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 451 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, landform, region. |
| `place.hist-heartland.xal-krona-making-ground` | site.free.any-shallow-marsh-0659 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 414 m from the nearest route; at the water's edge; no free 'box-canyon' site was left in the zone, so plain ground; won on culture-clump, bound, remote. |
| `place.hist-heartland.xal-meeruth-station` | site.free.roadside-0940 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 33 m from the nearest route; at the water's edge; no free 'river-mouth' site was left in the zone, so plain ground; won on culture-clump, nearPoint, route. |
| `place.hist-heartland.xanmeer-fort-defences-working` | site.scour.firm-lowland.summit-026 | summit | firm lowland | summit in firm lowland (danger band 5), 458 m from the nearest route; its choice #2 landform; won on landform, culture-clump, route. |
| `place.imperial-fringe.castle-giovesse` | site.scour.border-mountains.ridge-end-033 | ridge-end | border mountains | ridge end in border mountains (danger band 3), 419 m from the nearest route; its choice #2 landform; won on landform, sightline, culture-clump; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.imperial-fringe.fort-swampmoth` | site.free.roadside-0520 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 27 m from the nearest route; at the water's edge; its choice #5 landform; won on route, sightline, region. |
| `place.imperial-fringe.gideon` | anchor.gideon | anchor | firm lowland | Owner-approved settlement anchor 'gideon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-fringe.gideon-rootworm-terminus` | site.free.roadside-0393 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 64 m from the nearest route; its choice #4 landform; won on bound, landform, region. |
| `place.imperial-fringe.glenbridge` | site.free.any-firm-ground-0547 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 11 m from the nearest route; its choice #3 landform; won on culture-clump, landform, region. |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | site.free.roadside-0613 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 32 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on culture-clump, bound, sightline. |
| `place.imperial-fringe.orma-tactile-ruin` | site.scour.border-mountains.box-canyon-045 | box-canyon | border mountains | box canyon in border mountains (danger band 3), 808 m from the nearest route; its first-choice landform; won on landform, remote, region. |
| `place.imperial-fringe.rockgrove` | site.scour.upland-hills.box-canyon-028 | box-canyon | upland hills | box canyon in upland hills (danger band 3), 826 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, landform, region. |
| `place.imperial-fringe.slough-point` | site.scour.firm-lowland.water-narrows-020 | water-narrows | firm lowland | water narrows in firm lowland (danger band 2), 6 m from the nearest route; at the water's edge; its choice #4 landform; won on culture-clump, landform, region. |
| `place.imperial-fringe.stonewastes` | site.free.any-firm-ground-0698 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 295 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on region, parent, landform. |
| `place.imperial-fringe.the-silent-halls` | site.free.any-firm-ground-0862 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 128 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, submerged, culture-clump. |
| `place.imperial-fringe.the-stone-talkers-watch` | site.free.any-firm-ground-0245 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 648 m from the nearest route; its choice #4 landform; won on landform, sightline, region; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.imperial-penal-south.blackrose` | anchor.blackrose | anchor | fringe marsh | Owner-approved settlement anchor 'blackrose' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-penal-south.blackrose-drowned-hist` | site.free.open-water-0547 | open-water | lake & standing water | open water in lake & standing water (danger band 3), 671 m from the nearest route; at the water's edge; won on region, submerged, water; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.blackrose-prison` | site.scour.fringe-marsh.island-013 | island | fringe marsh | island in fringe marsh (danger band 2), 177 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.bramman-head` | site.scour.lake-standing-water.cove-017 | cove | lake & standing water | cove in lake & standing water (danger band 3), 153 m from the nearest route; at the water's edge; won on culture-clump, nearPoint, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.chainbreaker-shelter` | site.free.any-firm-ground-1329 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 22 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.flu-quarantine-village` | site.free.any-firm-ground-1344 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 50 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, bound, landform; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lake-submerged-xanmeer` | site.scour.interior-swamp.island-007 | island | interior swamp | island in interior swamp (danger band 4), 639 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lilmothiit-quarry` | site.scour.lake-standing-water.isthmus-033 | isthmus | lake & standing water | isthmus in lake & standing water (danger band 4), 633 m from the nearest route; at the water's edge; won on nearPoint, region, parent; placed from the homeless batch at stage 'relaxed-score'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.longmont` | site.free.any-firm-ground-1197 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 3), 482 m from the nearest route; no free 'any-shallow-marsh' site was left in the zone, so plain ground; won on culture-clump, region, ring; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.murkwood-verge` | site.free.any-shallow-marsh-1148 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 375 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, parent; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.rose-flooded-passage` | site.scour.firm-lowland.island-009 | island | firm lowland | island in firm lowland (danger band 2), 297 m from the nearest route; won on bound, region, culture-clump. |
| `place.imperial-penal-south.rose-supply-town` | site.scour.fringe-marsh.ford-047 | ford | fringe marsh | ford in fringe marsh (danger band 2), 106 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.three-gate-toll` | site.free.any-shallow-marsh-1307 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 2), 0 m from the nearest route; at the water's edge; no free 'ford' site was left in the zone, so plain ground; won on culture-clump, nearPoint, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.west-market-town` | site.scour.fringe-marsh.ford-030 | ford | fringe marsh | ford in fringe marsh (danger band 2), 61 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, nearPoint; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.alten-meerhleel` | site.free.any-shallow-marsh-1315 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 2), 190 m from the nearest route; at the water's edge; no free 'natural-harbour' site was left in the zone, so plain ground; won on region, parent, navigable; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bramman-screen` | site.free.roadside-0796 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 2), 93 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bright-throat-village` | site.free.any-shallow-marsh-1332 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 23 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.chasepoint` | site.free.any-firm-ground-1283 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 165 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.inhabited-meer-murkmire` | site.scour.fringe-marsh.flood-high-003 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 154 m from the nearest route; its first-choice landform; won on culture-clump, landform, nearPoint; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.ixtaxh-xanmeer` | site.free.open-water-0576 | open-water | lake & standing water | open water in lake & standing water (danger band 3), 71 m from the nearest route; at the water's edge; won on region, submerged, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.lilmoth` | anchor.lilmoth | anchor | firm lowland | Owner-approved settlement anchor 'lilmoth' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.rockpark` | site.free.any-firm-ground-1067 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 418 m from the nearest route; its choice #2 landform; won on landform, culture-clump, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.slaughter-memorial` | site.scour.firm-lowland.flood-high-032 | flood-high | firm lowland | flood high in firm lowland (danger band 2), 47 m from the nearest route; its first-choice landform; won on landform, region, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.soulrest` | anchor.soulrest | anchor | fringe marsh | Owner-approved settlement anchor 'soulrest' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.teeth-of-sithis` | site.free.any-firm-ground-1133 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 451 m from the nearest route; at the water's edge; no free 'summit' site was left in the zone, so plain ground; won on culture-clump, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.white-rose-prison` | site.scour.firm-lowland.flood-high-007 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 167 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.xinchei-konu` | site.free.any-firm-ground-1092 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 397 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on culture-clump, region, landform; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.bereaved-hist-less-since` | site.free.any-firm-ground-1124 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 4), 449 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.dead-water-village` | site.free.any-shallow-marsh-1157 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 124 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, nearPoint. |
| `place.naga-kur-deeps.deepmire-refuge` | site.free.any-shallow-marsh-1192 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 204 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on region, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.ferry-stage-guide-hire` | site.scour.interior-swamp.water-narrows-005 | water-narrows | interior swamp | water narrows in interior swamp (danger band 4), 109 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.harmed-hist-enslaved` | site.free.any-shallow-marsh-0967 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 309 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, parent, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | site.free.roadside-0705 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 27 m from the nearest route; at the water's edge; no free 'any-channel-bank' site was left in the zone, so plain ground; won on culture-clump, nearPoint, region; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.naga-kur-deeps.naga-village-settled` | site.free.any-shallow-marsh-1094 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 187 m from the nearest route; its choice #2 landform; won on culture-clump, landform, region. |
| `place.naga-kur-deeps.root-gallery-blight-warren` | site.free.any-firm-ground-1056 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 689 m from the nearest route; its choice #5 landform; won on nearPoint, region, remote; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-whisper-village` | site.free.any-shallow-marsh-1151 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 530 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, remote, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.sithis-temple-mass-sacrifice` | site.free.any-shallow-marsh-1193 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 317 m from the nearest route; at the water's edge; no free 'summit' site was left in the zone, so plain ground; won on culture-clump, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.umbriel-stripped-undead` | site.free.any-shallow-marsh-1121 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 8 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |
| `place.naga-kur-deeps.wild-hist-rogue-deeps` | site.scour.rootland-deep-marsh.enclosed-clearing-001 | enclosed-clearing | rootland deep marsh | enclosed clearing in rootland deep marsh (danger band 5), 55 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.pirate-freeholds.alten-corimont` | anchor.alten-corimont | anchor | firm lowland | Owner-approved settlement anchor 'alten-corimont' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.pirate-freeholds.chasecreek` | site.free.any-firm-ground-0284 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 244 m from the nearest route; its first-choice landform; won on landform, nearPoint, culture-clump. |
| `place.pirate-freeholds.corimont-hist-less-camp` | site.free.any-firm-ground-0179 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 76 m from the nearest route; its first-choice landform; won on landform, region, parent. |
| `place.pirate-freeholds.opening-work-barge` | site.free.roadside-0172 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 11 m from the nearest route; no free 'any-channel-bank' site was left in the zone, so plain ground; won on bound, sightline, region. |
| `place.pirate-freeholds.opening-work-camp` | site.free.roadside-0163 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 93 m from the nearest route; its first-choice landform; won on landform, bound, culture-clump; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.pirate-freeholds.rockpoint` | site.free.any-firm-ground-0280 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 217 m from the nearest route; no free 'cliff-bench' site was left in the zone, so plain ground; won on nearPoint, region, danger. |
| `place.pirate-freeholds.upriver-hist-village` | site.free.roadside-0092 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 63 m from the nearest route; its first-choice landform; won on culture-clump, landform, region. |
| `place.saxhleel-coast.archon` | anchor.archon | anchor | mangrove forest | Owner-approved settlement anchor 'archon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.saxhleel-coast.archon-harbour-hist` | site.free.roadside-0531 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 93 m from the nearest route; its choice #2 landform; won on culture-clump, landform, bound. |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | site.free.any-firm-ground-1037 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 55 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on bound, region, parent. |
| `place.saxhleel-coast.cantemir-headland` | site.free.any-shallow-marsh-0661 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 25 m from the nearest route; at the water's edge; no free 'headland' site was left in the zone, so plain ground; won on culture-clump, region, parent. |
| `place.saxhleel-coast.east-estuary-rootworm-station` | site.free.any-firm-ground-0921 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 11 m from the nearest route; at the water's edge; its first-choice landform; won on landform, culture-clump, bound. |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | site.free.any-shallow-marsh-0690 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 3), 307 m from the nearest route; at the water's edge; no free 'island' site was left in the zone, so plain ground; won on region, submerged, remote. |
| `place.saxhleel-coast.portdun-mont` | site.free.roadside-0820 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 39 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, culture-clump, region. |
| `place.saxhleel-coast.seafalls` | site.free.any-firm-ground-1063 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 219 m from the nearest route; at the water's edge; no free 'waterfall' site was left in the zone, so plain ground; won on culture-clump, region, navigable. |

## Owner-feedback checks (Part 4 step 2)

- stances: {'friendly': 73, 'wary': 70, 'guarded': 41, 'hostile': 274, 'neutral': 98, 'sanctuary': 24}
- swap pass exchanged 81 sites
- delves/combat places (D3+) with no friendly/sanctuary rest within 600 m (1200 m in D4–D5): 1

| city | purposes in 2 km | missing core purposes | hostile in 2 km | edge / hinterland / rural counts |
|---|---|---|---|---|
| stormhold | 15 | — | 61 | 9 / 48 / 132 |
| thorn | 13 | — | 41 | 7 / 46 / 75 |
| gideon | 14 | — | 78 | 13 / 57 / 145 |
| helstrom | 15 | — | 88 | 4 / 27 / 265 |
| archon | 14 | — | 49 | 8 / 31 / 88 |
| blackrose | 14 | — | 77 | 7 / 63 / 112 |
| lilmoth | 14 | — | 53 | 6 / 41 / 114 |
| soulrest | 13 | — | 40 | 4 / 32 / 88 |
| alten-corimont | 14 | — | 70 | 13 / 63 / 145 |

Rest-cadence gaps (add a rest or soften): `place.naga-kur-deeps.drifting-village-wet-mooring` (605 m)

## Clustering — Clark-Evans R per zone (97 A5 / G3)

R = 1 is random in the zone's own shape. Even spacing (R > 1) is ACCEPTED where the typed footprint, proximity and isolation gates require it (owner steer 2026-09-09, reversing the earlier 'R < 1 everywhere' target); what is still wanted is that the settled zones stay the most clustered, because that is where lore puts hamlet clumps. Reported, not gated. Median R 1.124; Evener than random: dunmer-north, imperial-fringe, imperial-penal-south, mercantile-coast, pirate-freeholds, saxhleel-coast.

| zone | plotted | land km² | mean NN m | same-mask null m | R |
|---|---:|---:|---:|---:|---:|
| dunmer-north | 127 | 7.76 | 152.7 | 135.9 | **1.124** |
| hist-heartland | 116 | 9.38 | 163.3 | 175.6 | **0.93** |
| imperial-fringe | 120 | 7.12 | 149.0 | 132.3 | **1.126** |
| imperial-penal-south | 44 | 1.15 | 131.6 | 104.7 | **1.257** |
| mercantile-coast | 65 | 3.63 | 149.3 | 146.9 | **1.016** |
| naga-kur-deeps | 40 | 2.77 | 170.8 | 181.8 | **0.939** |
| pirate-freeholds | 31 | 0.79 | 135.7 | 97.4 | **1.392** |
| saxhleel-coast | 37 | 1.78 | 144.1 | 128.5 | **1.121** |
