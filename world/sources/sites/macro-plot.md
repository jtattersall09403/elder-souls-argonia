# Macro plot — coverage report (Phase 11 Part 3)

Seed 1103. Supply: 1172 scour sites + 2982 free-ground points. Demand: 580 live records; **580 plotted**, 0 unresolved.
Placed from the homeless batch: {'neighbour-zone': 75, 'region-relaxed': 6, 'relaxed-score': 1}.

| zone | live | plotted | homeless | landform wishes from recipe | top landforms |
|---|---|---|---|---|---|
| dunmer-north | 127 | 127 | 0 | 0 | any-firm-ground 71, ravine 11, cliff-bench 9, open-water 7 |
| hist-heartland | 116 | 116 | 0 | 0 | any-firm-ground 53, any-shallow-marsh 32, open-water 7, summit 4 |
| imperial-fringe | 120 | 120 | 0 | 0 | any-firm-ground 92, ravine 5, ridge-end 5, box-canyon 4 |
| imperial-penal-south | 44 | 44 | 0 | 43 | any-firm-ground 14, any-shallow-marsh 8, open-water 5, island 4 |
| mercantile-coast | 65 | 65 | 0 | 65 | any-firm-ground 29, any-shallow-marsh 16, cove 5, open-water 4 |
| naga-kur-deeps | 40 | 40 | 0 | 27 | any-shallow-marsh 22, any-firm-ground 4, open-water 4, water-narrows 3 |
| pirate-freeholds | 31 | 31 | 0 | 0 | any-firm-ground 22, isthmus 2, anchor 1, open-water 1 |
| saxhleel-coast | 37 | 37 | 0 | 0 | any-firm-ground 14, any-shallow-marsh 13, open-water 2, anchor 1 |

## Spacing and routes

- nearest-neighbour distance p5 / median / p95: 35 / 85 / 249 m
- same-type pairs closer than 300 m: 4
- median distance to a route: 149 m; fine-tempo records within 300 m of a route: 69 %
- route-visibility sweep (482 samples every 150 m, radius 450 m): mean 3.88 destination/landmark places in sight; dead 12 %, crowded (4+) 47 %

## Anti-sameyness quota (no type > 25 % of a zone)

- none

## Named constraints (sightline / bound), as plotted

| record | kind | to | m | line of sight |
|---|---|---|---|---|
| `place.dunmer-north.gandranen-library` | bound | `place.dunmer-north.gandranen-ruins` | 111 | — |
| `place.dunmer-north.mazzatun-hist` | bound | `place.dunmer-north.mazzatun` | 39 | — |
| `place.dunmer-north.murkwater-shadowscale-ground` | bound | `place.dunmer-north.murkwater` | 272 | — |
| `place.dunmer-north.stormhold-causeway` | bound | `place.dunmer-north.stormhold` | 245 | — |
| `place.dunmer-north.the-black-stage` | bound | `place.dunmer-north.stormhold-causeway` | 113 | — |
| `place.dunmer-north.the-diggings-ladder` | bound | `place.dunmer-north.silyanorn-diggings` | 368 | — |
| `place.dunmer-north.the-divers-landing` | bound | `place.dunmer-north.the-drowned-terrace` | 242 | — |
| `place.dunmer-north.the-drawdown-flats` | bound | `place.dunmer-north.the-drowned-terrace` | 165 | — |
| `place.dunmer-north.the-first-count` | sightline | `place.dunmer-north.stormhold` | 96 | True |
| `place.dunmer-north.the-flu-cordon` | sightline | `place.dunmer-north.stillrise-village` | 210 | True |
| `place.dunmer-north.the-outer-silyanorn` | sightline | `place.dunmer-north.stormhold` | 1275 | True |
| `place.dunmer-north.the-pen-yard` | sightline | `place.dunmer-north.the-dres-rows` | 51 | True |
| `place.dunmer-north.the-pen-yard` | bound | `place.dunmer-north.the-dres-rows` | 51 | — |
| `place.dunmer-north.the-silyanorn-crown` | sightline | `place.dunmer-north.the-outer-silyanorn` | 143 | True |
| `place.dunmer-north.the-silyanorn-crown` | bound | `place.dunmer-north.the-outer-silyanorn` | 143 | — |
| `place.dunmer-north.the-slumped-hamlet` | sightline | `place.dunmer-north.the-shut-village` | 152 | True |
| `place.dunmer-north.the-standing-bid` | sightline | `place.dunmer-north.stormhold` | 255 | True |
| `place.dunmer-north.the-standing-bid` | bound | `place.dunmer-north.stormhold` | 255 | — |
| `place.dunmer-north.the-stormhold-falls-chamber` | bound | `place.dunmer-north.stormhold` | 261 | — |
| `place.dunmer-north.the-stripped-village` | bound | `place.dunmer-north.the-field-gate-garrison` | 459 | — |
| `place.dunmer-north.the-thorn-bond` | bound | `place.dunmer-north.thorn` | 35 | — |
| `place.dunmer-north.the-veterans-ridge` | sightline | `place.dunmer-north.tear-road-stage` | 802 | True |
| `place.dunmer-north.thorn-paddy-terraces` | bound | `place.dunmer-north.thorn` | 197 | — |
| `place.dunmer-north.waits-for-the-trial` | sightline | `place.dunmer-north.hissmir` | 94 | True |
| `place.dunmer-north.waits-for-the-trial` | bound | `place.dunmer-north.hissmir` | 94 | — |
| `place.hist-heartland.bereaved-mnemic` | bound | `place.hist-heartland.walkway-junction-high-crossroads` | 693 | — |
| `place.hist-heartland.bubble-spire-collapsed` | bound | `place.hist-heartland.bubble-spire-open-helstrom` | 112 | — |
| `place.hist-heartland.guide-camp-far-shelter` | bound | `place.hist-heartland.guide-camp-gate-side` | 882 | — |
| `place.hist-heartland.guide-camp-gate-side` | bound | `place.hist-heartland.helstrom` | 139 | — |
| `place.hist-heartland.miregaunt-ward-approach` | bound | `place.hist-heartland.sealed-xanmeer-living` | 239 | — |
| `place.hist-heartland.root-gallery-helstrom-underway` | bound | `place.hist-heartland.helstrom` | 92 | — |
| `place.hist-heartland.rootworm-station-helstrom` | bound | `place.hist-heartland.helstrom` | 235 | — |
| `place.hist-heartland.sap-tapping-licensed` | sightline | `place.hist-heartland.harmed-hist-tapped` | 251 | True |
| `place.hist-heartland.vista-ledge-canopy-break` | sightline | `place.hist-heartland.helstrom` | 1109 | True |
| `place.hist-heartland.xal-krona-making-ground` | bound | `place.hist-heartland.lost-city` | 55 | — |
| `place.imperial-fringe.ashen-tower` | sightline | `place.imperial-fringe.fort-swampmoth` | 171 | True |
| `place.imperial-fringe.bone-road-waystation` | bound | `place.imperial-fringe.the-counted-dead` | 617 | — |
| `place.imperial-fringe.cassian-farm` | bound | `place.imperial-fringe.gideon` | 201 | — |
| `place.imperial-fringe.castle-giovesse` | sightline | `place.imperial-fringe.gideon` | 369 | True |
| `place.imperial-fringe.collections-dig` | bound | `place.imperial-fringe.twyllbek-ruins` | 238 | — |
| `place.imperial-fringe.fort-swampmoth` | sightline | `place.imperial-fringe.mile-house-of-the-eagle` | 92 | True |
| `place.imperial-fringe.gideon-rootworm-terminus` | bound | `place.imperial-fringe.gideon` | 395 | — |
| `place.imperial-fringe.gideon-synod-outstation` | bound | `place.imperial-fringe.gideon` | 38 | — |
| `place.imperial-fringe.giovesse-lines` | sightline | `place.imperial-fringe.castle-giovesse` | 317 | True |
| `place.imperial-fringe.glenbridge` | sightline | `place.imperial-fringe.glenbridge-sermon-xanmeer` | 87 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | sightline | `place.imperial-fringe.glenbridge` | 87 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | bound | `place.imperial-fringe.glenbridge` | 87 | — |
| `place.imperial-fringe.ridge-runners-post` | sightline | `place.imperial-fringe.ashen-tower` | 760 | True |
| `place.imperial-fringe.the-abandoned-survey` | bound | `place.imperial-fringe.the-vellum-estate` | 362 | — |
| `place.imperial-fringe.the-drowning-gate` | sightline | `place.imperial-fringe.the-embankment-that-drowned` | 341 | True |
| `place.imperial-fringe.the-embankment-that-drowned` | sightline | `place.imperial-fringe.the-drowning-gate` | 341 | True |
| `place.imperial-fringe.the-marble-field` | sightline | `place.imperial-fringe.gideon` | 453 | True |
| `place.imperial-fringe.the-ring-of-nine-wells` | sightline | `place.imperial-fringe.twyllbek-ruins` | 111 | True |
| `place.imperial-fringe.the-sermon-road-camp` | bound | `place.imperial-fringe.glenbridge` | 527 | — |
| `place.imperial-fringe.the-shut-door` | sightline | `place.imperial-fringe.the-kept-terrace` | 447 | True |
| `place.imperial-fringe.the-snowline-cell` | sightline | `place.imperial-fringe.ridge-runners-post` | 1132 | True |
| `place.imperial-fringe.the-stone-talkers-watch` | sightline | `place.imperial-fringe.rockgrove` | 99 | True |
| `place.imperial-fringe.twyllbek-crown` | sightline | `place.imperial-fringe.twyllbek-ruins` | 39 | True |
| `place.imperial-penal-south.akaviri-works` | bound | `place.imperial-penal-south.lilmothiit-quarry` | 694 | — |
| `place.imperial-penal-south.blackrose-prison` | bound | `place.imperial-penal-south.blackrose` | 363 | — |
| `place.imperial-penal-south.drowned-gallery` | bound | `place.imperial-penal-south.blackrose-prison` | 366 | — |
| `place.imperial-penal-south.flu-quarantine-village` | bound | `place.imperial-penal-south.blackrose` | 644 | — |
| `place.imperial-penal-south.natural-dive-shaft` | bound | `place.imperial-penal-south.basin-sinkhole` | 311 | — |
| `place.imperial-penal-south.necromantic-dig` | bound | `place.imperial-penal-south.blackrose-prison` | 443 | — |
| `place.imperial-penal-south.plague-cordon` | bound | `place.imperial-penal-south.rose-supply-town` | 126 | — |
| `place.imperial-penal-south.prison-born-refuge` | bound | `place.imperial-penal-south.longmont` | 351 | — |
| `place.imperial-penal-south.rockspring` | bound | `place.imperial-penal-south.bramman-head` | 398 | — |
| `place.imperial-penal-south.rose-flooded-passage` | bound | `place.imperial-penal-south.blackrose-prison` | 212 | — |
| `place.imperial-penal-south.rose-outworks` | bound | `place.imperial-penal-south.blackrose-prison` | 251 | — |
| `place.imperial-penal-south.voriplasm-vault` | bound | `place.imperial-penal-south.bramman-head` | 585 | — |
| `place.mercantile-coast.inhabited-meer-murkmire` | sightline | `place.mercantile-coast.soulrest` | 688 | True |
| `place.mercantile-coast.oliis-boardwalk` | bound | `place.mercantile-coast.oliis-ferry-stage` | 96 | — |
| `place.mercantile-coast.oliis-drake-deep` | bound | `place.mercantile-coast.oliis-air-station` | 242 | — |
| `place.mercantile-coast.pusbottom-barge` | bound | `place.mercantile-coast.lilmoth` | 498 | — |
| `place.mercantile-coast.sacked-customs-suburb` | sightline | `place.mercantile-coast.lilmoth` | 32 | True |
| `place.mercantile-coast.sacked-customs-suburb` | bound | `place.mercantile-coast.lilmoth` | 32 | — |
| `place.mercantile-coast.screen-watch` | bound | `place.mercantile-coast.bramman-screen` | 541 | — |
| `place.mercantile-coast.soulrest-breaking-yard` | bound | `place.mercantile-coast.soulrest` | 224 | — |
| `place.mercantile-coast.soulrest-divers-yard` | bound | `place.mercantile-coast.soulrest` | 152 | — |
| `place.mercantile-coast.soulrest-quay-tradehouse` | bound | `place.mercantile-coast.soulrest` | 36 | — |
| `place.mercantile-coast.wraxu-stacks` | sightline | `place.mercantile-coast.wraxu-frieze` | 38 | True |
| `place.mercantile-coast.wraxu-stacks` | bound | `place.mercantile-coast.wraxu-frieze` | 38 | — |
| `place.naga-kur-deeps.drifting-village-wet-mooring` | bound | `place.naga-kur-deeps.leviathan-bone-field` | 329 | — |
| `place.pirate-freeholds.alten-corimont` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 195 | True |
| `place.pirate-freeholds.corimont-crosstrees` | bound | `place.pirate-freeholds.alten-corimont` | 195 | — |
| `place.pirate-freeholds.freehold-market` | bound | `place.pirate-freeholds.alten-corimont` | 34 | — |
| `place.pirate-freeholds.freehold-smithy` | sightline | `place.pirate-freeholds.careening-hard` | 208 | True |
| `place.pirate-freeholds.freehold-smithy` | bound | `place.pirate-freeholds.alten-corimont` | 48 | — |
| `place.pirate-freeholds.kothringi-river-ruin` | bound | `place.pirate-freeholds.alten-corimont` | 321 | — |
| `place.pirate-freeholds.opening-work-barge` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 48 | True |
| `place.pirate-freeholds.opening-work-barge` | bound | `place.pirate-freeholds.alten-corimont` | 147 | — |
| `place.pirate-freeholds.opening-work-camp` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 45 | True |
| `place.pirate-freeholds.opening-work-camp` | bound | `place.pirate-freeholds.opening-work-barge` | 36 | — |
| `place.pirate-freeholds.rim-keystone-chamber` | bound | `place.pirate-freeholds.rim-pass-station` | 486 | — |
| `place.pirate-freeholds.veterans-holding` | sightline | `place.pirate-freeholds.trunk-toll-bridge` | 675 | True |
| `place.saxhleel-coast.archon-bonded-row` | bound | `place.saxhleel-coast.archon` | 40 | — |
| `place.saxhleel-coast.archon-harbour-hist` | bound | `place.saxhleel-coast.archon` | 103 | — |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.archon` | 38 | True |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.padomaic-wrecker-beach` | 959 | True |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.outer-reef` | 714 | True |
| `place.saxhleel-coast.archon-lighthouse` | bound | `place.saxhleel-coast.archon` | 38 | — |
| `place.saxhleel-coast.archon-sacked-quarter` | bound | `place.saxhleel-coast.archon` | 81 | — |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | bound | `place.saxhleel-coast.archon` | 381 | — |
| `place.saxhleel-coast.archon-shipyard` | bound | `place.saxhleel-coast.archon` | 142 | — |
| `place.saxhleel-coast.coast-hist-less-refuge` | bound | `place.saxhleel-coast.archon` | 839 | — |
| `place.saxhleel-coast.contested-bank` | bound | `place.saxhleel-coast.quay-tradehouse` | 102 | — |
| `place.saxhleel-coast.east-estuary-rootworm-station` | bound | `place.saxhleel-coast.archon` | 164 | — |
| `place.saxhleel-coast.estuary-keepers-lodge` | bound | `place.saxhleel-coast.archon-lighthouse` | 776 | — |
| `place.saxhleel-coast.gap-reef` | sightline | `place.saxhleel-coast.archon-lighthouse` | 540 | True |
| `place.saxhleel-coast.gap-reef` | bound | `place.saxhleel-coast.archon-lighthouse` | 540 | — |
| `place.saxhleel-coast.mangrove-reef` | bound | `place.saxhleel-coast.tide-street-village` | 335 | — |
| `place.saxhleel-coast.oliis-coast-lay-by` | bound | `place.saxhleel-coast.archon` | 889 | — |
| `place.saxhleel-coast.padomaic-wrecker-beach` | sightline | `place.saxhleel-coast.archon-lighthouse` | 959 | True |
| `place.saxhleel-coast.padomaic-wrecker-beach` | bound | `place.saxhleel-coast.archon-lighthouse` | 959 | — |
| `place.saxhleel-coast.quarantine-village-lagoon` | bound | `place.saxhleel-coast.archon` | 530 | — |

## Records placed from the homeless batch

| record | stage | site |
|---|---|---|
| `place.dunmer-north.channel-cross-village` | neighbour-zone | site.free.any-firm-ground-0305 |
| `place.dunmer-north.climbs-to-see` | region-relaxed | site.scour.fringe-marsh.cliff-bench-076 |
| `place.dunmer-north.reedmoor-stilts` | neighbour-zone | site.free.roadside-0777 |
| `place.dunmer-north.seam-chasers` | neighbour-zone | site.scour.border-mountains.ravine-075 |
| `place.dunmer-north.silyanorn-diggings` | region-relaxed | site.scour.lake-standing-water.gorge-037 |
| `place.dunmer-north.the-diggings-ladder` | region-relaxed | site.scour.upland-hills.ravine-088 |
| `place.dunmer-north.the-divers-landing` | region-relaxed | site.free.any-firm-ground-0007 |
| `place.dunmer-north.the-drawdown-flats` | neighbour-zone | site.free.open-water-0018 |
| `place.dunmer-north.the-drover-camp` | neighbour-zone | site.scour.firm-lowland.cliff-bench-070 |
| `place.dunmer-north.the-drowned-terrace` | neighbour-zone | site.free.open-water-0016 |
| `place.dunmer-north.the-tide-fair` | neighbour-zone | site.free.open-water-0189 |
| `place.dunmer-north.the-white-pans` | neighbour-zone | site.scour.ocean.cove-063 |
| `place.dunmer-north.thorn-paddy-terraces` | neighbour-zone | site.free.roadside-0283 |
| `place.hist-heartland.alten-markmont` | neighbour-zone | site.free.any-firm-ground-0276 |
| `place.hist-heartland.blackguard-hideout-raw` | neighbour-zone | site.free.roadside-0590 |
| `place.hist-heartland.broken-xanmeer-subsumed` | neighbour-zone | site.free.roadside-0198 |
| `place.hist-heartland.bubble-spire-collapsed` | neighbour-zone | site.free.roadside-0556 |
| `place.hist-heartland.burn-scar-village-ash` | neighbour-zone | site.free.any-firm-ground-0482 |
| `place.hist-heartland.dream-wallow-starblossom` | neighbour-zone | site.free.roadside-0653 |
| `place.hist-heartland.harmed-hist-tapped` | neighbour-zone | site.free.any-firm-ground-0909 |
| `place.hist-heartland.marsh-giant-ground-basin` | neighbour-zone | site.free.any-shallow-marsh-0683 |
| `place.hist-heartland.miregaunt-ground-slow-ground` | neighbour-zone | site.scour.rootland-deep-marsh.ford-051 |
| `place.hist-heartland.naga-lay-up-second-man` | neighbour-zone | site.free.any-firm-ground-0397 |
| `place.hist-heartland.poacher-camp-sap` | neighbour-zone | site.scour.rootland-deep-marsh.islet-047 |
| `place.hist-heartland.root-gallery-collapsed-nine` | neighbour-zone | site.free.any-shallow-marsh-0735 |
| `place.hist-heartland.root-gallery-drowned-stair` | neighbour-zone | site.free.any-firm-ground-0481 |
| `place.hist-heartland.root-gallery-lantern-hollow` | neighbour-zone | site.free.any-shallow-marsh-0415 |
| `place.hist-heartland.rootworm-burrow-dead` | neighbour-zone | site.free.roadside-0189 |
| `place.hist-heartland.serpent-ground-giant-snake` | neighbour-zone | site.free.any-firm-ground-0945 |
| `place.hist-heartland.standing-curiosity-unexplained` | neighbour-zone | site.free.roadside-0347 |
| `place.hist-heartland.stilt-channel-edge-two-poles` | neighbour-zone | site.free.any-shallow-marsh-0407 |
| `place.hist-heartland.stilt-channel-edge-uxaneet` | neighbour-zone | site.free.any-shallow-marsh-0530 |
| `place.hist-heartland.wamasu-pond-nest` | neighbour-zone | site.free.any-shallow-marsh-0491 |
| `place.hist-heartland.wamasu-wallow-struck-ground` | neighbour-zone | site.free.any-firm-ground-0277 |
| `place.hist-heartland.wisp-lure-basin` | neighbour-zone | site.free.roadside-0963 |
| `place.imperial-fringe.castle-giovesse` | neighbour-zone | site.free.any-firm-ground-0633 |
| `place.imperial-fringe.gideon-rootworm-terminus` | relaxed-score | site.free.any-firm-ground-0542 |
| `place.imperial-fringe.giovesse-lines` | neighbour-zone | site.free.any-firm-ground-0661 |
| `place.imperial-fringe.low-water-fair` | neighbour-zone | site.free.any-firm-ground-0568 |
| `place.imperial-fringe.red-cart-yard` | neighbour-zone | site.free.roadside-0397 |
| `place.imperial-fringe.reedcutters-toll` | neighbour-zone | site.free.any-firm-ground-0697 |
| `place.imperial-fringe.the-abandoned-survey` | neighbour-zone | site.scour.upland-hills.summit-025 |
| `place.imperial-fringe.the-embankment-that-drowned` | neighbour-zone | site.free.roadside-0524 |
| `place.imperial-fringe.the-empty-steading` | neighbour-zone | site.free.any-firm-ground-0863 |
| `place.imperial-fringe.the-lake-divers-yard` | region-relaxed | site.free.any-firm-ground-0243 |
| `place.imperial-penal-south.basin-sinkhole` | neighbour-zone | site.free.roadside-0902 |
| `place.imperial-penal-south.drawdown-flat` | neighbour-zone | site.scour.lake-standing-water.islet-036 |
| `place.imperial-penal-south.lake-submerged-xanmeer` | neighbour-zone | site.scour.lake-standing-water.cove-066 |
| `place.imperial-penal-south.marsh-giant-ground-basin` | neighbour-zone | site.free.any-shallow-marsh-1124 |
| `place.imperial-penal-south.murkwood-verge` | neighbour-zone | site.free.any-shallow-marsh-1149 |
| `place.imperial-penal-south.natural-dive-shaft` | neighbour-zone | site.free.open-water-0630 |
| `place.imperial-penal-south.plague-cordon` | neighbour-zone | site.free.any-firm-ground-1330 |
| `place.imperial-penal-south.wisp-lure-basin` | neighbour-zone | site.free.open-water-0521 |
| `place.mercantile-coast.head-of-tide` | neighbour-zone | site.free.roadside-0791 |
| `place.mercantile-coast.lighter-flotilla` | neighbour-zone | site.scour.ocean.cove-067 |
| `place.mercantile-coast.oliis-boardwalk` | neighbour-zone | site.free.any-shallow-marsh-1190 |
| `place.mercantile-coast.oliis-ferry-stage` | neighbour-zone | site.free.any-firm-ground-1191 |
| `place.mercantile-coast.screen-watch` | neighbour-zone | site.free.roadside-0911 |
| `place.mercantile-coast.soulrest-breaking-yard` | neighbour-zone | site.scour.tidal-delta.river-mouth-011 |
| `place.naga-kur-deeps.bog-blight-ground-old-cordon` | neighbour-zone | site.free.any-shallow-marsh-0965 |
| `place.naga-kur-deeps.dive-shaft-natural-deeps` | neighbour-zone | site.free.open-water-0544 |
| `place.naga-kur-deeps.flooded-passage-tunnel-deeps` | neighbour-zone | site.free.open-water-0558 |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | neighbour-zone | site.free.any-firm-ground-0837 |
| `place.naga-kur-deeps.legendary-deep-feather-serpent` | neighbour-zone | site.free.open-water-0526 |
| `place.naga-kur-deeps.miregaunt-ward-open` | neighbour-zone | site.free.any-firm-ground-1083 |
| `place.naga-kur-deeps.naga-highway-camp-active-north` | neighbour-zone | site.free.roadside-0710 |
| `place.naga-kur-deeps.root-gallery-blight-warren` | neighbour-zone | site.free.any-firm-ground-1032 |
| `place.naga-kur-deeps.wreck-submerged-barge` | neighbour-zone | site.scour.lake-standing-water.water-narrows-037 |
| `place.pirate-freeholds.careening-hard` | neighbour-zone | site.free.roadside-0174 |
| `place.pirate-freeholds.freehold-naga-camp` | neighbour-zone | site.free.roadside-0885 |
| `place.pirate-freeholds.freehold-smithy` | neighbour-zone | site.free.any-firm-ground-0230 |
| `place.pirate-freeholds.rim-snowline-hermitage` | neighbour-zone | site.scour.border-mountains.saddle-041 |
| `place.pirate-freeholds.trunk-road-tradehouse` | neighbour-zone | site.free.any-firm-ground-0158 |
| `place.saxhleel-coast.archon-bonded-row` | region-relaxed | site.free.roadside-0533 |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | neighbour-zone | site.free.roadside-0539 |
| `place.saxhleel-coast.cantemir-headland` | neighbour-zone | site.free.any-firm-ground-0979 |
| `place.saxhleel-coast.coast-hist-less-refuge` | neighbour-zone | site.free.any-shallow-marsh-0786 |
| `place.saxhleel-coast.jungle-root-hollow` | neighbour-zone | site.free.any-firm-ground-0880 |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | neighbour-zone | site.free.open-water-0469 |
| `place.saxhleel-coast.mangrove-reef` | neighbour-zone | site.scour.mangrove-forest.isthmus-058 |
| `place.saxhleel-coast.pearl-lots` | neighbour-zone | site.free.any-shallow-marsh-0848 |
| `place.saxhleel-coast.sealed-xanmeer-wall` | neighbour-zone | site.free.any-firm-ground-1035 |

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

any-firm-ground 299, any-shallow-marsh 95, open-water 31, ravine 17, ridge-end 13, cliff-bench 12, summit 12, cove 10, flood-high 10, anchor 9, island 9, saddle 8, islet 7, isthmus 6, water-narrows 6, box-canyon 5, ford 5, spring-head 5, pinned (Part 6 meso siting) 4, gorge 3, headland 3, land-bridge 3, waterfall 3, river-mouth 2, confluence 1, enclosed-clearing 1, oxbow 1

## Homeless batch (unresolved)

- none: every live record found ground

## Tier 0–1 placements

| record | site | landform | region | why |
|---|---|---|---|---|
| `place.dunmer-north.bogmother` | site.free.roadside-0226 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 79 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, region, danger. |
| `place.dunmer-north.gandranen-library` | site.scour.lake-standing-water.cliff-bench-025 | cliff-bench | lake & standing water | cliff bench in lake & standing water (danger band 5), 1213 m from the nearest route; at the water's edge; its first-choice landform; won on landform, culture-clump, bound. |
| `place.dunmer-north.gandranen-ruins` | site.free.any-firm-ground-0041 | any-firm-ground | border mountains | firm ground in border mountains (danger band 3), 1260 m from the nearest route; at the water's edge; no free 'sinkhole' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.dunmer-north.hatching-pools` | site.free.any-firm-ground-0035 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 265 m from the nearest route; no free 'spring-head' site was left in the zone, so plain ground; won on culture-clump, region, parent. |
| `place.dunmer-north.hissmir` | site.free.any-firm-ground-0272 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 121 m from the nearest route; at the water's edge; its first-choice landform; won on landform, culture-clump, region. |
| `place.dunmer-north.hixinoag` | site.free.any-firm-ground-0177 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 3), 82 m from the nearest route; at the water's edge; no free 'oxbow' site was left in the zone, so plain ground; won on culture-clump, region, landform. |
| `place.dunmer-north.hutan-tzel` | site.scour.fringe-marsh.cliff-bench-053 | cliff-bench | fringe marsh | cliff bench in fringe marsh (danger band 3), 621 m from the nearest route; at the water's edge; its choice #5 landform; won on culture-clump, region, landform. |
| `place.dunmer-north.loriasel-caverns` | site.free.any-firm-ground-0024 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 1197 m from the nearest route; no free 'sinkhole' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.dunmer-north.mazzatun` | pinned.mazzatun | pinned (Part 6 meso siting) | upland hills | Pinned by the Part 6 meso siting (world/sources/blueprints/place.dunmer-north.mazzatun.json): The rock shelf at the ridge end: 68 m x 42 m of ground between 198.3 m and 209 m, falling ~8.5 m north to south in three readable steps, flood band 0, 4.1 m above the water table, a headwater stream along its southern lip and a 55 m escarpment on the east. 85 m from Tsono-Xuhil and 296 m from the Gideon-Stormhold road. Every parcel measured on this ground fits the slope ladder at plinth, pad or dug-in; none needs a graded pad over 2 m. |
| `place.dunmer-north.mazzatun-hist` | site.free.open-water-0143 | open-water | upland hills | open water in upland hills (danger band 3), 251 m from the nearest route; at the water's edge; won on culture-clump, bound, region. |
| `place.dunmer-north.stillrise-village` | site.scour.lake-standing-water.box-canyon-042 | box-canyon | lake & standing water | box canyon in lake & standing water (danger band 5), 1285 m from the nearest route; at the water's edge; its choice #4 landform; won on culture-clump, landform, region. |
| `place.dunmer-north.stormhold` | anchor.stormhold | anchor | firm lowland | Owner-approved settlement anchor 'stormhold' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.ten-maur-wolk` | site.free.any-firm-ground-0022 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 1107 m from the nearest route; at the water's edge; no free 'box-canyon' site was left in the zone, so plain ground; won on region, remote, landform. |
| `place.dunmer-north.the-quiet-landing` | site.free.roadside-0225 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 88 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, route. |
| `place.dunmer-north.the-standing-bid` | site.free.roadside-0378 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 82 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, culture-clump. |
| `place.dunmer-north.thorn` | anchor.thorn | anchor | firm lowland | Owner-approved settlement anchor 'thorn' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.wolk-market` | site.free.any-firm-ground-0154 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 49 m from the nearest route; at the water's edge; its choice #4 landform; won on culture-clump, route, landform. |
| `place.hist-heartland.bereaved-mnemic` | site.free.roadside-0203 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 5 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, culture-clump. |
| `place.hist-heartland.cult-raid-camp-unbound` | site.free.roadside-0196 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 66 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, culture-clump, danger. |
| `place.hist-heartland.greenspring` | site.free.roadside-0190 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 58 m from the nearest route; at the water's edge; no free 'confluence' site was left in the zone, so plain ground; won on culture-clump, nearPoint, region. |
| `place.hist-heartland.guide-camp-gate-side` | site.free.any-shallow-marsh-0527 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 137 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.hist-heartland.helstrom` | anchor.helstrom | anchor | lake & standing water | Owner-approved settlement anchor 'helstrom' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.hist-heartland.heretic-stone-restarted` | site.scour.upland-hills.ridge-end-049 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 182 m from the nearest route; at the water's edge; its first-choice landform; won on landform, culture-clump, region. |
| `place.hist-heartland.hist-agaceph-needle` | site.free.roadside-0555 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 5 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, danger. |
| `place.hist-heartland.hist-first-rain-trunk` | site.free.roadside-0202 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 0 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, danger. |
| `place.hist-heartland.hist-paatru-lowcrown` | site.free.any-firm-ground-0915 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 817 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.hist-heartland.hist-sarpa-highflower` | site.scour.rootland-deep-marsh.island-033 | island | rootland deep marsh | island in rootland deep marsh (danger band 5), 113 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, culture-clump, region. |
| `place.hist-heartland.lost-city` | site.free.open-water-0241 | open-water | lake & standing water | open water in lake & standing water (danger band 5), 593 m from the nearest route; at the water's edge; won on culture-clump, region, remote. |
| `place.hist-heartland.nightbound-lightless` | site.scour.tropical-jungle.ford-059 | ford | tropical jungle | ford in tropical jungle (danger band 4), 861 m from the nearest route; at the water's edge; won on region, remote, culture-clump. |
| `place.hist-heartland.refuge-station-interior` | site.free.any-firm-ground-0418 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 5), 537 m from the nearest route; its choice #3 landform; won on culture-clump, remote, landform. |
| `place.hist-heartland.root-gallery-cult-warren` | site.free.any-firm-ground-0806 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 495 m from the nearest route; its choice #5 landform; won on region, remote, landform. |
| `place.hist-heartland.root-gallery-helstrom-underway` | site.free.any-shallow-marsh-0555 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 5 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.hist-heartland.root-talk-ground` | site.free.any-firm-ground-0781 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 146 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, landform, region. |
| `place.hist-heartland.rootworm-station-helstrom` | site.scour.firm-lowland.flood-high-013 | flood-high | firm lowland | flood high in firm lowland (danger band 5), 99 m from the nearest route; its first-choice landform; won on landform, bound, region. |
| `place.hist-heartland.sap-collection-facility-daedric` | site.free.any-firm-ground-0908 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 236 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, parent. |
| `place.hist-heartland.sealed-xanmeer-living` | site.free.any-firm-ground-0940 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 226 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.hist-heartland.stone-calendar-hist-tsoko` | site.scour.firm-lowland.summit-050 | summit | firm lowland | summit in firm lowland (danger band 3), 93 m from the nearest route; its first-choice landform; won on landform, culture-clump, region. |
| `place.hist-heartland.the-cut-circle` | site.free.roadside-0840 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 88 m from the nearest route; its choice #2 landform; won on culture-clump, landform, region. |
| `place.hist-heartland.umpholo-mission` | site.free.any-firm-ground-0913 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 861 m from the nearest route; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.xal-krona-making-ground` | site.free.any-firm-ground-0419 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 5), 625 m from the nearest route; at the water's edge; no free 'box-canyon' site was left in the zone, so plain ground; won on culture-clump, bound, remote. |
| `place.hist-heartland.xal-meeruth-station` | site.free.roadside-0945 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 33 m from the nearest route; at the water's edge; no free 'river-mouth' site was left in the zone, so plain ground; won on culture-clump, nearPoint, route. |
| `place.hist-heartland.xanmeer-fort-defences-working` | site.scour.firm-lowland.summit-026 | summit | firm lowland | summit in firm lowland (danger band 5), 458 m from the nearest route; its choice #2 landform; won on landform, culture-clump, route. |
| `place.imperial-fringe.castle-giovesse` | site.free.any-firm-ground-0633 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 287 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on sightline, region, parent; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.imperial-fringe.fort-swampmoth` | site.free.roadside-0489 | any-firm-ground | upland hills | firm ground in upland hills (danger band 2), 20 m from the nearest route; its choice #5 landform; won on culture-clump, route, sightline. |
| `place.imperial-fringe.gideon` | anchor.gideon | anchor | firm lowland | Owner-approved settlement anchor 'gideon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-fringe.gideon-rootworm-terminus` | site.free.any-firm-ground-0542 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 27 m from the nearest route; its choice #4 landform; won on bound, landform, region; placed from the homeless batch at stage 'relaxed-score'. |
| `place.imperial-fringe.glenbridge` | site.free.roadside-0408 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 84 m from the nearest route; its choice #3 landform; won on culture-clump, landform, region. |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | site.free.roadside-0406 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 75 m from the nearest route; at the water's edge; no free 'summit' site was left in the zone, so plain ground; won on culture-clump, bound, sightline. |
| `place.imperial-fringe.orma-tactile-ruin` | site.scour.border-mountains.box-canyon-045 | box-canyon | border mountains | box canyon in border mountains (danger band 3), 808 m from the nearest route; its first-choice landform; won on culture-clump, landform, remote. |
| `place.imperial-fringe.rockgrove` | site.scour.upland-hills.box-canyon-028 | box-canyon | upland hills | box canyon in upland hills (danger band 3), 826 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, landform, region. |
| `place.imperial-fringe.slough-point` | site.free.roadside-0625 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 25 m from the nearest route; at the water's edge; no free 'ford' site was left in the zone, so plain ground; won on culture-clump, region, danger. |
| `place.imperial-fringe.stonewastes` | site.free.any-firm-ground-0792 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 385 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on region, parent, landform. |
| `place.imperial-fringe.the-silent-halls` | site.free.any-firm-ground-0861 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 186 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, submerged, danger. |
| `place.imperial-fringe.the-stone-talkers-watch` | site.free.any-firm-ground-0270 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 764 m from the nearest route; at the water's edge; its choice #4 landform; won on culture-clump, landform, sightline. |
| `place.imperial-penal-south.blackrose` | anchor.blackrose | anchor | fringe marsh | Owner-approved settlement anchor 'blackrose' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-penal-south.blackrose-drowned-hist` | site.scour.fringe-marsh.island-003 | island | fringe marsh | island in fringe marsh (danger band 2), 39 m from the nearest route; at the water's edge; its first-choice landform; won on landform, submerged, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.blackrose-prison` | site.scour.fringe-marsh.island-013 | island | fringe marsh | island in fringe marsh (danger band 2), 177 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.bramman-head` | site.scour.lake-standing-water.ford-009 | ford | lake & standing water | ford in lake & standing water (danger band 3), 190 m from the nearest route; at the water's edge; its choice #5 landform; won on culture-clump, nearPoint, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.chainbreaker-shelter` | site.free.any-firm-ground-1346 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 113 m from the nearest route; its first-choice landform; won on culture-clump, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.flu-quarantine-village` | site.free.roadside-0028 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 33 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, bound, landform; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lake-submerged-xanmeer` | site.scour.lake-standing-water.cove-066 | cove | lake & standing water | cove in lake & standing water (danger band 4), 491 m from the nearest route; at the water's edge; its choice #5 landform; won on culture-clump, region, submerged; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lilmothiit-quarry` | site.free.any-firm-ground-1099 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 437 m from the nearest route; no free 'ravine' site was left in the zone, so plain ground; won on culture-clump, nearPoint, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.longmont` | site.free.any-shallow-marsh-1242 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 422 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.murkwood-verge` | site.free.any-shallow-marsh-1149 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 375 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, parent; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.rose-flooded-passage` | site.scour.firm-lowland.island-009 | island | firm lowland | island in firm lowland (danger band 2), 297 m from the nearest route; won on bound, region, culture-clump. |
| `place.imperial-penal-south.rose-supply-town` | site.free.any-firm-ground-1331 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 71 m from the nearest route; at the water's edge; no free 'ridge-end' site was left in the zone, so plain ground; won on culture-clump, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.three-gate-toll` | site.free.any-shallow-marsh-1291 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 2), 173 m from the nearest route; at the water's edge; no free 'ford' site was left in the zone, so plain ground; won on nearPoint, region, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.west-market-town` | site.scour.fringe-marsh.ford-030 | ford | fringe marsh | ford in fringe marsh (danger band 2), 61 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, nearPoint; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.alten-meerhleel` | site.scour.fringe-marsh.cove-027 | cove | fringe marsh | cove in fringe marsh (danger band 3), 202 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bramman-screen` | site.free.any-shallow-marsh-1300 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 2), 38 m from the nearest route; its choice #4 landform; won on culture-clump, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bright-throat-village` | site.free.any-shallow-marsh-1335 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 23 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.chasepoint` | site.free.any-firm-ground-1250 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 30 m from the nearest route; at the water's edge; its first-choice landform; won on culture-clump, landform, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.inhabited-meer-murkmire` | site.scour.fringe-marsh.flood-high-003 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 154 m from the nearest route; its first-choice landform; won on culture-clump, landform, nearPoint; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.ixtaxh-xanmeer` | site.scour.lake-standing-water.islet-004 | islet | lake & standing water | islet in lake & standing water (danger band 3), 846 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.lilmoth` | anchor.lilmoth | anchor | firm lowland | Owner-approved settlement anchor 'lilmoth' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.rockpark` | site.free.any-firm-ground-1236 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 33 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, culture-clump, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.slaughter-memorial` | site.free.roadside-0479 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 33 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.soulrest` | anchor.soulrest | anchor | fringe marsh | Owner-approved settlement anchor 'soulrest' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.teeth-of-sithis` | site.scour.tropical-jungle.summit-049 | summit | tropical jungle | summit in tropical jungle (danger band 4), 593 m from the nearest route; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.white-rose-prison` | site.free.any-firm-ground-1067 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 449 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on region, remote, landform; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.xinchei-konu` | site.free.any-firm-ground-1349 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 73 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on culture-clump, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.bereaved-hist-less-since` | site.free.any-shallow-marsh-1158 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 124 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.dead-water-village` | site.free.roadside-0736 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 3), 8 m from the nearest route; its choice #2 landform; won on culture-clump, landform, nearPoint. |
| `place.naga-kur-deeps.deepmire-refuge` | site.scour.interior-swamp.flood-high-028 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 27 m from the nearest route; its first-choice landform; won on landform, culture-clump, region; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.ferry-stage-guide-hire` | site.scour.interior-swamp.water-narrows-016 | water-narrows | interior swamp | water narrows in interior swamp (danger band 4), 33 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.harmed-hist-enslaved` | site.free.any-shallow-marsh-0933 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 33 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | site.free.any-firm-ground-0837 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 5), 589 m from the nearest route; its choice #3 landform; won on nearPoint, landform, culture-clump; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.naga-kur-deeps.naga-village-settled` | site.free.any-shallow-marsh-1101 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 598 m from the nearest route; its choice #2 landform; won on landform, region, parent. |
| `place.naga-kur-deeps.root-gallery-blight-warren` | site.free.any-firm-ground-1032 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 747 m from the nearest route; its choice #5 landform; won on culture-clump, nearPoint, region; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-whisper-village` | site.free.any-shallow-marsh-1152 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 530 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.sithis-temple-mass-sacrifice` | site.free.any-shallow-marsh-0966 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 365 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on region, culture-clump, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.umbriel-stripped-undead` | site.free.any-shallow-marsh-1153 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 522 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, region. |
| `place.naga-kur-deeps.wild-hist-rogue-deeps` | site.scour.rootland-deep-marsh.flood-high-037 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 719 m from the nearest route; its choice #2 landform; won on remote, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.pirate-freeholds.alten-corimont` | anchor.alten-corimont | anchor | firm lowland | Owner-approved settlement anchor 'alten-corimont' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.pirate-freeholds.chasecreek` | site.free.any-firm-ground-0283 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 244 m from the nearest route; its first-choice landform; won on landform, nearPoint, culture-clump. |
| `place.pirate-freeholds.corimont-hist-less-camp` | site.free.roadside-0094 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 3), 20 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, culture-clump. |
| `place.pirate-freeholds.opening-work-barge` | site.scour.firm-lowland.oxbow-016 | oxbow | firm lowland | oxbow in firm lowland (danger band 3), 6 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, bound. |
| `place.pirate-freeholds.opening-work-camp` | site.free.roadside-0893 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 39 m from the nearest route; at the water's edge; its first-choice landform; won on culture-clump, landform, bound. |
| `place.pirate-freeholds.rockpoint` | site.free.any-firm-ground-0279 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 217 m from the nearest route; no free 'cliff-bench' site was left in the zone, so plain ground; won on nearPoint, region, danger. |
| `place.pirate-freeholds.upriver-hist-village` | site.free.roadside-0092 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 63 m from the nearest route; at the water's edge; its first-choice landform; won on culture-clump, landform, region. |
| `place.saxhleel-coast.archon` | anchor.archon | anchor | mangrove forest | Owner-approved settlement anchor 'archon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.saxhleel-coast.archon-harbour-hist` | site.free.any-firm-ground-0953 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 16 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, bound. |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | site.free.roadside-0539 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 93 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on bound, region, parent; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.saxhleel-coast.cantemir-headland` | site.free.any-firm-ground-0979 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 775 m from the nearest route; no free 'headland' site was left in the zone, so plain ground; won on culture-clump, region, remote; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.saxhleel-coast.east-estuary-rootworm-station` | site.free.roadside-0536 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 93 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, culture-clump. |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | site.free.open-water-0469 | open-water | tropical jungle | open water in tropical jungle (danger band 4), 626 m from the nearest route; at the water's edge; won on region, remote, submerged; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.saxhleel-coast.portdun-mont` | site.scour.mangrove-forest.flood-high-030 | flood-high | mangrove forest | flood high in mangrove forest (danger band 2), 229 m from the nearest route; at the water's edge; its first-choice landform; won on landform, culture-clump, region. |
| `place.saxhleel-coast.seafalls` | site.free.any-firm-ground-1006 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 785 m from the nearest route; no free 'waterfall' site was left in the zone, so plain ground; won on culture-clump, region, landform. |

## Owner-feedback checks (Part 4 step 2)

- stances: {'friendly': 73, 'wary': 70, 'guarded': 41, 'hostile': 274, 'neutral': 98, 'sanctuary': 24}
- swap pass exchanged 119 sites
- delves/combat places (D3+) with no friendly/sanctuary rest within 600 m (1200 m in D4–D5): 2

| city | purposes in 2 km | missing core purposes | hostile in 2 km | edge / hinterland / rural counts |
|---|---|---|---|---|
| stormhold | 14 | — | 58 | 13 / 47 / 122 |
| thorn | 12 | — | 40 | 14 / 43 / 69 |
| gideon | 14 | — | 74 | 15 / 62 / 134 |
| helstrom | 14 | — | 87 | 11 / 22 / 268 |
| archon | 14 | — | 47 | 7 / 40 / 83 |
| blackrose | 14 | — | 70 | 8 / 74 / 91 |
| lilmoth | 14 | — | 57 | 10 / 44 / 116 |
| soulrest | 13 | — | 37 | 6 / 25 / 81 |
| alten-corimont | 14 | — | 71 | 12 / 50 / 149 |

Rest-cadence gaps (add a rest or soften): `place.hist-heartland.tended-xanmeer-pilgrim-way` (932 m), `place.hist-heartland.mass-grave-flu-memorial` (771 m)

## Clustering — Clark-Evans R per zone (97 A5 / G3)

R < 1 (clustered); hand-placed worlds measure about 0.5 (97 A5). Reported, not gated. Median R 0.839; over target: imperial-penal-south, pirate-freeholds.

| zone | plotted | land km² | mean NN m | same-mask null m | R |
|---|---:|---:|---:|---:|---:|
| dunmer-north | 127 | 7.56 | 110.0 | 136.1 | **0.808** |
| hist-heartland | 116 | 8.94 | 113.6 | 177.5 | **0.64** |
| imperial-fringe | 120 | 6.91 | 110.2 | 131.5 | **0.838** |
| imperial-penal-south | 44 | 0.88 | 104.3 | 92.7 | **1.125** |
| mercantile-coast | 65 | 3.38 | 110.5 | 141.0 | **0.784** |
| naga-kur-deeps | 40 | 2.49 | 139.8 | 166.6 | **0.839** |
| pirate-freeholds | 31 | 0.77 | 117.2 | 95.4 | **1.229** |
| saxhleel-coast | 37 | 1.72 | 113.7 | 125.9 | **0.903** |
