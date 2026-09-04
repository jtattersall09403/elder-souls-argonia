# Macro plot — coverage report (Phase 11 Part 3)

Seed 1103. Supply: 1172 scour sites + 2001 free-ground points. Demand: 580 live records; **580 plotted**, 0 unresolved.
Placed from the homeless batch: {'spacing-1/2': 18, 'region-relaxed': 6, 'spacing-3/4': 32, 'neighbour-zone': 67, 'relaxed-score': 3}.

| zone | live | plotted | homeless | landform wishes from recipe | top landforms |
|---|---|---|---|---|---|
| dunmer-north | 127 | 127 | 0 | 0 | any-firm-ground 67, cliff-bench 11, ridge-end 11, ravine 6 |
| hist-heartland | 116 | 116 | 0 | 0 | any-firm-ground 52, any-shallow-marsh 33, flood-high 4, summit 4 |
| imperial-fringe | 120 | 120 | 0 | 0 | any-firm-ground 79, ravine 10, ridge-end 10, gorge 5 |
| imperial-penal-south | 44 | 44 | 0 | 43 | any-firm-ground 14, any-shallow-marsh 8, cove 5, ford 5 |
| mercantile-coast | 65 | 65 | 0 | 65 | any-firm-ground 28, any-shallow-marsh 17, flood-high 5, islet 3 |
| naga-kur-deeps | 40 | 40 | 0 | 27 | any-shallow-marsh 26, flood-high 4, any-firm-ground 3, island 2 |
| pirate-freeholds | 31 | 31 | 0 | 0 | any-firm-ground 23, summit 2, anchor 1, cliff-bench 1 |
| saxhleel-coast | 37 | 37 | 0 | 0 | any-shallow-marsh 14, any-firm-ground 13, cove 2, flood-high 2 |

## Spacing and routes

- nearest-neighbour distance p5 / median / p95: 88 / 172 / 291 m
- same-type pairs closer than 300 m: 3
- median distance to a route: 208 m; fine-tempo records within 300 m of a route: 70 %
- route-visibility sweep (364 samples every 150 m, radius 450 m): mean 3.82 destination/landmark places in sight; dead 5 %, crowded (4+) 47 %

## Anti-sameyness quota (no type > 25 % of a zone)

- none

## Named constraints (sightline / bound), as plotted

| record | kind | to | m | line of sight |
|---|---|---|---|---|
| `place.dunmer-north.gandranen-library` | bound | `place.dunmer-north.gandranen-ruins` | 99 | — |
| `place.dunmer-north.mazzatun-hist` | bound | `place.dunmer-north.mazzatun` | 138 | — |
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
| `place.hist-heartland.sap-tapping-licensed` | sightline | `place.hist-heartland.harmed-hist-tapped` | 486 | True |
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
| `place.imperial-fringe.glenbridge` | sightline | `place.imperial-fringe.glenbridge-sermon-xanmeer` | 212 | False |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | sightline | `place.imperial-fringe.glenbridge` | 212 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | bound | `place.imperial-fringe.glenbridge` | 212 | — |
| `place.imperial-fringe.ridge-runners-post` | sightline | `place.imperial-fringe.ashen-tower` | 324 | True |
| `place.imperial-fringe.the-abandoned-survey` | bound | `place.imperial-fringe.the-vellum-estate` | 392 | — |
| `place.imperial-fringe.the-drowning-gate` | sightline | `place.imperial-fringe.the-embankment-that-drowned` | 485 | True |
| `place.imperial-fringe.the-embankment-that-drowned` | sightline | `place.imperial-fringe.the-drowning-gate` | 485 | True |
| `place.imperial-fringe.the-marble-field` | sightline | `place.imperial-fringe.gideon` | 398 | True |
| `place.imperial-fringe.the-ring-of-nine-wells` | sightline | `place.imperial-fringe.twyllbek-ruins` | 575 | True |
| `place.imperial-fringe.the-sermon-road-camp` | bound | `place.imperial-fringe.glenbridge` | 395 | — |
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
| `place.dunmer-north.channel-cross-village` | spacing-1/2 | site.scour.tidal-delta.river-mouth-014 |
| `place.dunmer-north.climbs-to-see` | region-relaxed | site.free.any-firm-ground-0259 |
| `place.dunmer-north.greylight-village` | spacing-3/4 | site.scour.fringe-marsh.cliff-bench-056 |
| `place.dunmer-north.reedmoor-stilts` | spacing-1/2 | site.free.any-shallow-marsh-0296 |
| `place.dunmer-north.seam-chasers` | neighbour-zone | site.scour.border-mountains.ridge-end-054 |
| `place.dunmer-north.stands-on-the-island` | spacing-3/4 | site.free.any-firm-ground-0200 |
| `place.dunmer-north.the-borrowed-tomb` | neighbour-zone | site.scour.upland-hills.ridge-end-051 |
| `place.dunmer-north.the-diggings-ladder` | neighbour-zone | site.scour.border-mountains.ridge-end-043 |
| `place.dunmer-north.the-divers-landing` | region-relaxed | site.free.any-firm-ground-0146 |
| `place.dunmer-north.the-drawdown-flats` | neighbour-zone | site.scour.border-mountains.spring-head-002 |
| `place.dunmer-north.the-drover-camp` | neighbour-zone | site.free.any-firm-ground-0290 |
| `place.dunmer-north.the-drowned-terrace` | neighbour-zone | site.scour.lake-standing-water.box-canyon-008 |
| `place.dunmer-north.the-thorn-bond` | neighbour-zone | site.free.any-firm-ground-0132 |
| `place.dunmer-north.the-tide-fair` | spacing-3/4 | site.free.any-shallow-marsh-0437 |
| `place.dunmer-north.the-veterans-ridge` | spacing-1/2 | site.free.any-firm-ground-0184 |
| `place.dunmer-north.the-white-pans` | neighbour-zone | site.scour.ocean.cove-032 |
| `place.dunmer-north.three-ways-over-water` | region-relaxed | site.free.any-shallow-marsh-0298 |
| `place.dunmer-north.ties-four-ways` | spacing-3/4 | site.free.any-shallow-marsh-0322 |
| `place.hist-heartland.air-pocket-station-basin` | neighbour-zone | site.scour.lake-standing-water.cove-003 |
| `place.hist-heartland.alten-markmont` | neighbour-zone | site.free.any-firm-ground-0307 |
| `place.hist-heartland.blackguard-hideout-raw` | neighbour-zone | site.free.any-shallow-marsh-0475 |
| `place.hist-heartland.broken-xanmeer-subsumed` | neighbour-zone | site.free.roadside-0337 |
| `place.hist-heartland.bubble-spire-collapsed` | neighbour-zone | site.free.any-firm-ground-0782 |
| `place.hist-heartland.burn-scar-village-ash` | neighbour-zone | site.free.roadside-0617 |
| `place.hist-heartland.dive-shaft-xanmeer-well` | neighbour-zone | site.scour.lake-standing-water.water-narrows-051 |
| `place.hist-heartland.dream-wallow-starblossom` | neighbour-zone | site.free.any-shallow-marsh-0582 |
| `place.hist-heartland.falling-mage-impact` | neighbour-zone | site.free.any-firm-ground-0809 |
| `place.hist-heartland.marsh-giant-ground-basin` | relaxed-score | site.free.any-firm-ground-0626 |
| `place.hist-heartland.miregaunt-ground-slow-ground` | neighbour-zone | site.free.any-shallow-marsh-0524 |
| `place.hist-heartland.naga-lay-up-second-man` | neighbour-zone | site.free.any-firm-ground-0376 |
| `place.hist-heartland.poacher-camp-sap` | neighbour-zone | site.free.any-shallow-marsh-0649 |
| `place.hist-heartland.root-gallery-collapsed-nine` | spacing-3/4 | site.free.any-shallow-marsh-0644 |
| `place.hist-heartland.root-gallery-drowned-stair` | neighbour-zone | site.scour.lake-standing-water.water-narrows-014 |
| `place.hist-heartland.root-gallery-kept-light` | spacing-3/4 | site.free.any-shallow-marsh-0642 |
| `place.hist-heartland.root-gallery-lantern-hollow` | neighbour-zone | site.free.any-shallow-marsh-0550 |
| `place.hist-heartland.sap-tapping-licensed` | spacing-1/2 | site.free.any-firm-ground-0878 |
| `place.hist-heartland.stilt-channel-edge-two-poles` | spacing-1/2 | site.scour.tidal-delta.water-narrows-013 |
| `place.hist-heartland.stilt-channel-edge-uxaneet` | neighbour-zone | site.free.any-shallow-marsh-0531 |
| `place.hist-heartland.treasure-hunters-live-camp` | neighbour-zone | site.scour.rootland-deep-marsh.cliff-bench-075 |
| `place.hist-heartland.waiting-vigil-village` | neighbour-zone | site.free.any-firm-ground-0458 |
| `place.hist-heartland.wamasu-wallow-struck-ground` | neighbour-zone | site.free.any-firm-ground-0275 |
| `place.hist-heartland.wild-hist-mad-one` | neighbour-zone | site.free.any-shallow-marsh-0375 |
| `place.hist-heartland.wisp-lure-basin` | neighbour-zone | site.free.any-shallow-marsh-0645 |
| `place.imperial-fringe.bonded-shed-of-the-onkobra` | spacing-3/4 | site.free.any-firm-ground-0517 |
| `place.imperial-fringe.bone-road-waystation` | spacing-3/4 | site.free.any-firm-ground-0440 |
| `place.imperial-fringe.castle-giovesse` | spacing-1/2 | site.free.any-firm-ground-0572 |
| `place.imperial-fringe.claywater-station` | spacing-1/2 | site.free.any-firm-ground-0594 |
| `place.imperial-fringe.gideon-synod-outstation` | spacing-3/4 | site.scour.upland-hills.gorge-051 |
| `place.imperial-fringe.giovesse-lines` | spacing-1/2 | site.free.any-firm-ground-0333 |
| `place.imperial-fringe.highwater-hamlet` | spacing-3/4 | site.free.roadside-0183 |
| `place.imperial-fringe.hollow-arch-toll` | neighbour-zone | site.free.roadside-0172 |
| `place.imperial-fringe.ladder-to-the-light` | spacing-3/4 | site.free.roadside-0227 |
| `place.imperial-fringe.long-causeway` | spacing-1/2 | site.free.any-firm-ground-0734 |
| `place.imperial-fringe.low-water-fair` | spacing-3/4 | site.scour.seasonal-floodplain.river-mouth-007 |
| `place.imperial-fringe.lower-onkobra-paddies` | spacing-3/4 | site.free.roadside-0358 |
| `place.imperial-fringe.ninefold-station` | spacing-3/4 | site.free.roadside-0249 |
| `place.imperial-fringe.onkobra-ferry` | spacing-3/4 | site.free.any-firm-ground-1047 |
| `place.imperial-fringe.red-cart-yard` | spacing-3/4 | site.free.any-firm-ground-0488 |
| `place.imperial-fringe.reedcutters-toll` | spacing-1/2 | site.free.roadside-0361 |
| `place.imperial-fringe.sink-field` | neighbour-zone | site.scour.border-mountains.saddle-047 |
| `place.imperial-fringe.the-abandoned-survey` | neighbour-zone | site.free.any-firm-ground-0638 |
| `place.imperial-fringe.the-drowned-mule` | neighbour-zone | site.free.any-firm-ground-0757 |
| `place.imperial-fringe.the-drowning-gate` | spacing-3/4 | site.scour.firm-lowland.gorge-031 |
| `place.imperial-fringe.the-embankment-that-drowned` | spacing-3/4 | site.free.any-firm-ground-0536 |
| `place.imperial-fringe.the-empty-steading` | spacing-3/4 | site.free.roadside-0236 |
| `place.imperial-fringe.the-marble-field` | neighbour-zone | site.scour.border-mountains.ridge-end-069 |
| `place.imperial-fringe.the-shut-door` | neighbour-zone | site.free.any-firm-ground-0731 |
| `place.imperial-penal-south.akaviri-works` | spacing-1/2 | site.free.any-shallow-marsh-1204 |
| `place.imperial-penal-south.basin-sinkhole` | neighbour-zone | site.free.any-firm-ground-1353 |
| `place.imperial-penal-south.blasphemer-urn-vault` | relaxed-score | site.free.roadside-0576 |
| `place.imperial-penal-south.drawdown-flat` | neighbour-zone | site.scour.lake-standing-water.islet-033 |
| `place.imperial-penal-south.drowned-gallery` | spacing-3/4 | site.scour.firm-lowland.headland-030 |
| `place.imperial-penal-south.lake-boardwalk-village` | spacing-3/4 | site.scour.mangrove-forest.ford-017 |
| `place.imperial-penal-south.lake-ferry-stage` | neighbour-zone | site.free.any-shallow-marsh-1250 |
| `place.imperial-penal-south.lake-submerged-xanmeer` | neighbour-zone | site.scour.lake-standing-water.isthmus-033 |
| `place.imperial-penal-south.lilmothiit-quarry` | spacing-1/2 | site.scour.lake-standing-water.ford-023 |
| `place.imperial-penal-south.marsh-giant-ground-basin` | neighbour-zone | site.free.any-shallow-marsh-1155 |
| `place.imperial-penal-south.murkwood-verge` | neighbour-zone | site.free.any-shallow-marsh-1076 |
| `place.imperial-penal-south.natural-dive-shaft` | neighbour-zone | site.scour.fringe-marsh.water-narrows-007 |
| `place.imperial-penal-south.plague-cordon` | neighbour-zone | site.free.any-firm-ground-1280 |
| `place.imperial-penal-south.rockspring` | spacing-1/2 | site.scour.firm-lowland.flood-high-010 |
| `place.imperial-penal-south.rose-outworks` | spacing-3/4 | site.scour.mangrove-forest.cove-036 |
| `place.imperial-penal-south.three-gate-toll` | spacing-3/4 | site.scour.fringe-marsh.isthmus-025 |
| `place.imperial-penal-south.vampiric-cloud-ground` | relaxed-score | site.scour.lake-standing-water.ford-009 |
| `place.imperial-penal-south.west-market-town` | spacing-3/4 | site.free.roadside-0578 |
| `place.imperial-penal-south.wisp-lure-basin` | neighbour-zone | site.free.any-shallow-marsh-1231 |
| `place.mercantile-coast.bereaved-village-murkmire` | spacing-3/4 | site.free.any-firm-ground-1123 |
| `place.mercantile-coast.bramman-river-ferry` | neighbour-zone | site.free.any-firm-ground-1330 |
| `place.mercantile-coast.hereguard-plantation` | neighbour-zone | site.scour.firm-lowland.flood-high-032 |
| `place.mercantile-coast.keel-sakka-stilts` | neighbour-zone | site.free.any-shallow-marsh-1342 |
| `place.mercantile-coast.necropolis-village-murkmire` | spacing-1/2 | site.free.any-shallow-marsh-1227 |
| `place.mercantile-coast.oliis-boardwalk` | spacing-3/4 | site.free.roadside-0473 |
| `place.mercantile-coast.oliis-ferry-stage` | neighbour-zone | site.free.any-firm-ground-1221 |
| `place.mercantile-coast.root-gallery-murkmire` | neighbour-zone | site.free.roadside-0468 |
| `place.mercantile-coast.screen-watch` | region-relaxed | site.free.any-firm-ground-1134 |
| `place.mercantile-coast.soulrest-quay-tradehouse` | neighbour-zone | site.free.roadside-0277 |
| `place.mercantile-coast.stripped-village-north` | neighbour-zone | site.free.any-firm-ground-1217 |
| `place.mercantile-coast.topal-salt-pans` | neighbour-zone | site.free.roadside-0035 |
| `place.mercantile-coast.whitebone-reef` | neighbour-zone | site.free.any-shallow-marsh-1192 |
| `place.mercantile-coast.xhon-mehl-shrine` | neighbour-zone | site.free.roadside-0266 |
| `place.naga-kur-deeps.bog-blight-ground-nine-stakes` | neighbour-zone | site.free.any-shallow-marsh-1226 |
| `place.naga-kur-deeps.dive-shaft-natural-deeps` | spacing-1/2 | site.free.any-shallow-marsh-1208 |
| `place.naga-kur-deeps.drowned-village-lake-deeps` | spacing-3/4 | site.free.any-shallow-marsh-1004 |
| `place.naga-kur-deeps.flooded-passage-tunnel-deeps` | neighbour-zone | site.free.any-shallow-marsh-1165 |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | spacing-3/4 | site.free.roadside-0396 |
| `place.naga-kur-deeps.legendary-deep-feather-serpent` | neighbour-zone | site.free.any-shallow-marsh-1079 |
| `place.naga-kur-deeps.miregaunt-ward-open` | neighbour-zone | site.scour.tropical-jungle.isthmus-021 |
| `place.naga-kur-deeps.naga-highway-camp-active-north` | neighbour-zone | site.free.any-shallow-marsh-1162 |
| `place.naga-kur-deeps.root-gallery-blight-warren` | spacing-3/4 | site.free.any-firm-ground-1067 |
| `place.naga-kur-deeps.sealed-xanmeer-vakka-deeps` | spacing-3/4 | site.scour.rootland-deep-marsh.flood-high-026 |
| `place.naga-kur-deeps.wreck-submerged-barge` | neighbour-zone | site.scour.fringe-marsh.cove-064 |
| `place.pirate-freeholds.freehold-naga-camp` | neighbour-zone | site.free.any-firm-ground-0070 |
| `place.pirate-freeholds.freehold-smithy` | spacing-1/2 | site.free.any-firm-ground-0204 |
| `place.pirate-freeholds.opening-work-barge` | neighbour-zone | site.free.any-firm-ground-0179 |
| `place.pirate-freeholds.opening-work-camp` | spacing-3/4 | site.free.roadside-0565 |
| `place.pirate-freeholds.rim-snowline-hermitage` | neighbour-zone | site.scour.border-mountains.summit-005 |
| `place.pirate-freeholds.rockpoint` | spacing-3/4 | site.free.any-firm-ground-0277 |
| `place.pirate-freeholds.trunk-road-tradehouse` | neighbour-zone | site.free.any-firm-ground-0202 |
| `place.pirate-freeholds.veterans-holding` | spacing-1/2 | site.scour.border-mountains.ridge-end-042 |
| `place.saxhleel-coast.archon-bonded-row` | region-relaxed | site.free.any-firm-ground-0926 |
| `place.saxhleel-coast.archon-shipyard` | region-relaxed | site.free.roadside-0509 |
| `place.saxhleel-coast.coast-hist-less-refuge` | neighbour-zone | site.free.any-shallow-marsh-0785 |
| `place.saxhleel-coast.jungle-root-hollow` | neighbour-zone | site.free.any-firm-ground-0923 |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | neighbour-zone | site.scour.tropical-jungle.cove-043 |
| `place.saxhleel-coast.pearl-lots` | spacing-1/2 | site.scour.ocean.cove-006 |
| `place.saxhleel-coast.sealed-xanmeer-wall` | neighbour-zone | site.free.any-firm-ground-0921 |

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

any-firm-ground 279, any-shallow-marsh 104, ridge-end 23, flood-high 17, ravine 17, cliff-bench 14, summit 14, cove 12, gorge 10, islet 10, saddle 10, water-narrows 10, anchor 9, spring-head 8, river-mouth 7, box-canyon 6, island 6, ford 5, isthmus 4, waterfall 4, headland 3, land-bridge 3, oxbow 2, confluence 1, enclosed-clearing 1, natural-harbour 1

## Homeless batch (unresolved)

- none: every live record found ground

## Tier 0–1 placements

| record | site | landform | region | why |
|---|---|---|---|---|
| `place.dunmer-north.bogmother` | site.scour.firm-lowland.summit-041 | summit | firm lowland | summit in firm lowland (danger band 2), 351 m from the nearest route; its choice #2 landform; won on landform, region, danger. |
| `place.dunmer-north.gandranen-library` | site.scour.border-mountains.cliff-bench-032 | cliff-bench | border mountains | cliff bench in border mountains (danger band 3), 1491 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, remote. |
| `place.dunmer-north.gandranen-ruins` | site.free.any-firm-ground-0168 | any-firm-ground | border mountains | firm ground in border mountains (danger band 3), 1393 m from the nearest route; at the water's edge; no free 'sinkhole' site was left in the zone, so plain ground; won on region, remote, water. |
| `place.dunmer-north.hatching-pools` | site.scour.firm-lowland.spring-head-037 | spring-head | firm lowland | spring head in firm lowland (danger band 2), 59 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.dunmer-north.hissmir` | site.free.any-firm-ground-0237 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 258 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.dunmer-north.hixinoag` | site.free.roadside-0133 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 31 m from the nearest route; no free 'oxbow' site was left in the zone, so plain ground; won on region, parent, landform. |
| `place.dunmer-north.hutan-tzel` | site.scour.firm-lowland.cliff-bench-067 | cliff-bench | firm lowland | cliff bench in firm lowland (danger band 2), 206 m from the nearest route; at the water's edge; its choice #5 landform; won on region, landform, danger. |
| `place.dunmer-north.loriasel-caverns` | site.scour.upland-hills.spring-head-015 | spring-head | upland hills | spring head in upland hills (danger band 3), 777 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, remote. |
| `place.dunmer-north.mazzatun` | site.scour.upland-hills.ridge-end-066 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 246 m from the nearest route; its first-choice landform; won on landform, region, danger. |
| `place.dunmer-north.mazzatun-hist` | site.scour.upland-hills.waterfall-007 | waterfall | upland hills | waterfall in upland hills (danger band 3), 219 m from the nearest route; at the water's edge; won on bound, region, danger. |
| `place.dunmer-north.stillrise-village` | site.scour.lake-standing-water.box-canyon-042 | box-canyon | lake & standing water | box canyon in lake & standing water (danger band 5), 1285 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, remote. |
| `place.dunmer-north.stormhold` | anchor.stormhold | anchor | firm lowland | Owner-approved settlement anchor 'stormhold' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.ten-maur-wolk` | site.scour.upland-hills.saddle-030 | saddle | upland hills | saddle in upland hills (danger band 3), 1132 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, remote. |
| `place.dunmer-north.the-quiet-landing` | site.free.any-firm-ground-0319 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 132 m from the nearest route; its choice #2 landform; won on landform, region, route. |
| `place.dunmer-north.the-standing-bid` | site.free.roadside-0091 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 17 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, sightline. |
| `place.dunmer-north.thorn` | anchor.thorn | anchor | firm lowland | Owner-approved settlement anchor 'thorn' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.wolk-market` | site.free.roadside-0557 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 61 m from the nearest route; at the water's edge; its choice #4 landform; won on route, landform, region. |
| `place.hist-heartland.bereaved-mnemic` | site.free.roadside-0392 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 5), 35 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, region. |
| `place.hist-heartland.cult-raid-camp-unbound` | site.scour.firm-lowland.flood-high-031 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 332 m from the nearest route; its choice #4 landform; won on landform, region, route. |
| `place.hist-heartland.greenspring` | site.free.any-firm-ground-0404 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 177 m from the nearest route; no free 'confluence' site was left in the zone, so plain ground; won on nearPoint, region, danger. |
| `place.hist-heartland.guide-camp-gate-side` | site.free.any-shallow-marsh-0556 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 286 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on bound, region, parent. |
| `place.hist-heartland.helstrom` | anchor.helstrom | anchor | lake & standing water | Owner-approved settlement anchor 'helstrom' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.hist-heartland.heretic-stone-restarted` | site.scour.upland-hills.ridge-end-049 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 182 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, route. |
| `place.hist-heartland.hist-agaceph-needle` | site.scour.tropical-jungle.spring-head-043 | spring-head | tropical jungle | spring head in tropical jungle (danger band 4), 625 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.hist-first-rain-trunk` | site.scour.rootland-deep-marsh.enclosed-clearing-000 | enclosed-clearing | rootland deep marsh | enclosed clearing in rootland deep marsh (danger band 5), 88 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent. |
| `place.hist-heartland.hist-paatru-lowcrown` | site.scour.rootland-deep-marsh.spring-head-041 | spring-head | rootland deep marsh | spring head in rootland deep marsh (danger band 4), 11 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, danger. |
| `place.hist-heartland.hist-sarpa-highflower` | site.scour.rootland-deep-marsh.cliff-bench-054 | cliff-bench | rootland deep marsh | cliff bench in rootland deep marsh (danger band 5), 572 m from the nearest route; at the water's edge; won on region, remote, parent. |
| `place.hist-heartland.lost-city` | site.free.any-firm-ground-0447 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 5), 498 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.nightbound-lightless` | site.scour.rootland-deep-marsh.gorge-007 | gorge | rootland deep marsh | gorge in rootland deep marsh (danger band 4), 420 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote. |
| `place.hist-heartland.refuge-station-interior` | site.free.any-firm-ground-0310 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 718 m from the nearest route; its choice #3 landform; won on remote, landform, region. |
| `place.hist-heartland.root-gallery-cult-warren` | site.free.any-firm-ground-1006 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 548 m from the nearest route; its choice #5 landform; won on region, remote, landform. |
| `place.hist-heartland.root-gallery-helstrom-underway` | site.free.any-shallow-marsh-0528 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 138 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on bound, region, concealment. |
| `place.hist-heartland.root-talk-ground` | site.free.any-firm-ground-0879 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 880 m from the nearest route; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.rootworm-station-helstrom` | site.scour.firm-lowland.flood-high-013 | flood-high | firm lowland | flood high in firm lowland (danger band 5), 99 m from the nearest route; its first-choice landform; won on landform, bound, region. |
| `place.hist-heartland.sap-collection-facility-daedric` | site.free.any-firm-ground-0877 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 601 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on remote, region, parent. |
| `place.hist-heartland.sealed-xanmeer-living` | site.free.any-firm-ground-0979 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 506 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, remote, parent. |
| `place.hist-heartland.stone-calendar-hist-tsoko` | site.scour.firm-lowland.summit-033 | summit | firm lowland | summit in firm lowland (danger band 3), 685 m from the nearest route; its first-choice landform; won on landform, route, region. |
| `place.hist-heartland.the-cut-circle` | site.free.any-shallow-marsh-0627 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 23 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.hist-heartland.umpholo-mission` | site.free.any-firm-ground-0949 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 809 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.xal-krona-making-ground` | site.free.any-shallow-marsh-0470 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 451 m from the nearest route; at the water's edge; no free 'box-canyon' site was left in the zone, so plain ground; won on bound, region, remote. |
| `place.hist-heartland.xal-meeruth-station` | site.scour.deep-river-corridor.confluence-000 | confluence | deep river corridor | confluence in deep river corridor (danger band 4), 6 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, nearPoint, route. |
| `place.hist-heartland.xanmeer-fort-defences-working` | site.scour.firm-lowland.summit-031 | summit | firm lowland | summit in firm lowland (danger band 4), 710 m from the nearest route; its choice #2 landform; won on landform, region, remote. |
| `place.imperial-fringe.castle-giovesse` | site.free.any-firm-ground-0572 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 87 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on sightline, region, parent; placed from the homeless batch at stage 'spacing-1/2'. |
| `place.imperial-fringe.fort-swampmoth` | site.free.any-firm-ground-0600 | any-firm-ground | upland hills | firm ground in upland hills (danger band 2), 28 m from the nearest route; its choice #5 landform; won on route, sightline, region. |
| `place.imperial-fringe.gideon` | anchor.gideon | anchor | firm lowland | Owner-approved settlement anchor 'gideon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-fringe.gideon-rootworm-terminus` | site.free.any-firm-ground-0632 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 233 m from the nearest route; at the water's edge; its choice #4 landform; won on bound, landform, region. |
| `place.imperial-fringe.glenbridge` | site.free.any-firm-ground-0790 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 717 m from the nearest route; its choice #3 landform; won on landform, region, parent. |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | site.free.any-firm-ground-0825 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 832 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on bound, sightline, region. |
| `place.imperial-fringe.orma-tactile-ruin` | site.scour.border-mountains.ravine-004 | ravine | border mountains | ravine in border mountains (danger band 3), 1274 m from the nearest route; at the water's edge; its choice #2 landform; won on remote, landform, region. |
| `place.imperial-fringe.rockgrove` | site.scour.upland-hills.ridge-end-025 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1190 m from the nearest route; its choice #2 landform; won on landform, region, remote. |
| `place.imperial-fringe.slough-point` | site.scour.firm-lowland.water-narrows-020 | water-narrows | firm lowland | water narrows in firm lowland (danger band 2), 6 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, danger. |
| `place.imperial-fringe.stonewastes` | site.scour.upland-hills.land-bridge-000 | land-bridge | upland hills | land bridge in upland hills (danger band 3), 658 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, ring. |
| `place.imperial-fringe.the-silent-halls` | site.free.any-firm-ground-0864 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 462 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, submerged, remote. |
| `place.imperial-fringe.the-stone-talkers-watch` | site.scour.upland-hills.ridge-end-055 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1018 m from the nearest route; its choice #2 landform; won on landform, sightline, region. |
| `place.imperial-penal-south.blackrose` | anchor.blackrose | anchor | fringe marsh | Owner-approved settlement anchor 'blackrose' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-penal-south.blackrose-drowned-hist` | site.scour.lake-standing-water.cove-034 | cove | lake & standing water | cove in lake & standing water (danger band 3), 104 m from the nearest route; at the water's edge; won on region, submerged, parent; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.blackrose-prison` | site.scour.firm-lowland.flood-high-000 | flood-high | firm lowland | flood high in firm lowland (danger band 2), 140 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.bramman-head` | site.scour.fringe-marsh.water-narrows-052 | water-narrows | fringe marsh | water narrows in fringe marsh (danger band 3), 344 m from the nearest route; at the water's edge; its first-choice landform; won on landform, nearPoint, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.chainbreaker-shelter` | site.free.any-firm-ground-1359 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 93 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.flu-quarantine-village` | site.scour.fringe-marsh.island-003 | island | fringe marsh | island in fringe marsh (danger band 2), 39 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lake-submerged-xanmeer` | site.scour.lake-standing-water.isthmus-033 | isthmus | lake & standing water | isthmus in lake & standing water (danger band 4), 633 m from the nearest route; at the water's edge; won on region, remote, submerged; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lilmothiit-quarry` | site.scour.lake-standing-water.ford-023 | ford | lake & standing water | ford in lake & standing water (danger band 3), 452 m from the nearest route; at the water's edge; won on nearPoint, region, danger; placed from the homeless batch at stage 'spacing-1/2'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.longmont` | site.scour.lake-standing-water.cove-004 | cove | lake & standing water | cove in lake & standing water (danger band 3), 176 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.murkwood-verge` | site.free.any-shallow-marsh-1076 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 361 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, danger, parent; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.rose-flooded-passage` | site.free.any-firm-ground-1318 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 229 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, region. |
| `place.imperial-penal-south.rose-supply-town` | site.scour.fringe-marsh.ford-030 | ford | fringe marsh | ford in fringe marsh (danger band 2), 61 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.three-gate-toll` | site.scour.fringe-marsh.isthmus-025 | isthmus | fringe marsh | isthmus in fringe marsh (danger band 3), 280 m from the nearest route; at the water's edge; its choice #4 landform; won on nearPoint, landform, region; placed from the homeless batch at stage 'spacing-3/4'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.west-market-town` | site.free.roadside-0578 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 2), 40 m from the nearest route; at the water's edge; no free 'confluence' site was left in the zone, so plain ground; won on nearPoint, route, region; placed from the homeless batch at stage 'spacing-3/4'; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.alten-meerhleel` | site.scour.ocean.natural-harbour-001 | natural-harbour | ocean | natural harbour in ocean (danger band 0), 223 m from the nearest route; at the water's edge; its first-choice landform; won on landform, parent, navigable; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bramman-screen` | site.free.any-shallow-marsh-1215 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 3), 88 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bright-throat-village` | site.free.roadside-0472 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 33 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.chasepoint` | site.free.any-firm-ground-1199 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 111 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.inhabited-meer-murkmire` | site.scour.fringe-marsh.flood-high-003 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 154 m from the nearest route; its first-choice landform; won on landform, nearPoint, sightline; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.ixtaxh-xanmeer` | site.scour.lake-standing-water.islet-004 | islet | lake & standing water | islet in lake & standing water (danger band 3), 846 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.lilmoth` | anchor.lilmoth | anchor | firm lowland | Owner-approved settlement anchor 'lilmoth' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.rockpark` | site.scour.firm-lowland.flood-high-007 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 167 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.slaughter-memorial` | site.free.any-firm-ground-1258 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 1), 50 m from the nearest route; its choice #3 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.soulrest` | anchor.soulrest | anchor | fringe marsh | Owner-approved settlement anchor 'soulrest' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.teeth-of-sithis` | site.scour.tropical-jungle.summit-049 | summit | tropical jungle | summit in tropical jungle (danger band 4), 593 m from the nearest route; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.white-rose-prison` | site.scour.firm-lowland.flood-high-008 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 71 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.xinchei-konu` | site.scour.firm-lowland.summit-029 | summit | firm lowland | summit in firm lowland (danger band 2), 377 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.bereaved-hist-less-since` | site.free.any-firm-ground-1130 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 4), 449 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.dead-water-village` | site.free.any-shallow-marsh-1168 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 361 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, nearPoint, region. |
| `place.naga-kur-deeps.deepmire-refuge` | site.scour.interior-swamp.flood-high-029 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 568 m from the nearest route; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.ferry-stage-guide-hire` | site.scour.interior-swamp.water-narrows-016 | water-narrows | interior swamp | water narrows in interior swamp (danger band 4), 33 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.harmed-hist-enslaved` | site.free.any-firm-ground-1088 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 813 m from the nearest route; its choice #3 landform; won on landform, remote, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | site.free.roadside-0396 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 23 m from the nearest route; no free 'any-channel-bank' site was left in the zone, so plain ground; won on nearPoint, region, landform; placed from the homeless batch at stage 'spacing-3/4'. |
| `place.naga-kur-deeps.naga-village-settled` | site.free.any-shallow-marsh-1224 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 3), 216 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |
| `place.naga-kur-deeps.root-gallery-blight-warren` | site.free.any-firm-ground-1067 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 444 m from the nearest route; its choice #5 landform; won on nearPoint, region, remote; placed from the homeless batch at stage 'spacing-3/4'; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-whisper-village` | site.scour.rootland-deep-marsh.flood-high-023 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 491 m from the nearest route; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.sithis-temple-mass-sacrifice` | site.scour.interior-swamp.flood-high-017 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 151 m from the nearest route; its choice #3 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.umbriel-stripped-undead` | site.free.any-shallow-marsh-1179 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 337 m from the nearest route; its choice #2 landform; won on landform, region, danger. |
| `place.naga-kur-deeps.wild-hist-rogue-deeps` | site.scour.interior-swamp.island-007 | island | interior swamp | island in interior swamp (danger band 4), 639 m from the nearest route; at the water's edge; its choice #3 landform; won on remote, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.pirate-freeholds.alten-corimont` | anchor.alten-corimont | anchor | firm lowland | Owner-approved settlement anchor 'alten-corimont' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.pirate-freeholds.chasecreek` | site.free.any-firm-ground-0281 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 158 m from the nearest route; its first-choice landform; won on landform, nearPoint, region. |
| `place.pirate-freeholds.corimont-hist-less-camp` | site.free.any-firm-ground-0276 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 412 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent. |
| `place.pirate-freeholds.opening-work-barge` | site.free.any-firm-ground-0179 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 146 m from the nearest route; no free 'any-channel-bank' site was left in the zone, so plain ground; won on bound, sightline, region; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.pirate-freeholds.opening-work-camp` | site.free.roadside-0565 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 78 m from the nearest route; its first-choice landform; won on landform, bound, sightline; placed from the homeless batch at stage 'spacing-3/4'. |
| `place.pirate-freeholds.rockpoint` | site.free.any-firm-ground-0277 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 306 m from the nearest route; no free 'cliff-bench' site was left in the zone, so plain ground; won on nearPoint, region, danger; placed from the homeless batch at stage 'spacing-3/4'. |
| `place.pirate-freeholds.upriver-hist-village` | site.free.roadside-0608 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 43 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.archon` | anchor.archon | anchor | mangrove forest | Owner-approved settlement anchor 'archon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.saxhleel-coast.archon-harbour-hist` | site.free.any-firm-ground-0956 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 51 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, parent. |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | site.free.any-firm-ground-1013 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 313 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on bound, region, parent. |
| `place.saxhleel-coast.cantemir-headland` | site.free.any-firm-ground-1092 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 362 m from the nearest route; at the water's edge; no free 'headland' site was left in the zone, so plain ground; won on region, danger, parent. |
| `place.saxhleel-coast.east-estuary-rootworm-station` | site.free.any-firm-ground-1014 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 143 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, region. |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | site.scour.tropical-jungle.cove-043 | cove | tropical jungle | cove in tropical jungle (danger band 4), 884 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.saxhleel-coast.portdun-mont` | site.scour.mangrove-forest.flood-high-030 | flood-high | mangrove forest | flood high in mangrove forest (danger band 2), 229 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.seafalls` | site.scour.tropical-jungle.water-narrows-009 | water-narrows | tropical jungle | water narrows in tropical jungle (danger band 2), 172 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |

## Owner-feedback checks (Part 4 step 2)

- stances: {'friendly': 73, 'wary': 70, 'neutral': 98, 'guarded': 41, 'hostile': 274, 'sanctuary': 24}
- swap pass exchanged 119 sites
- delves/combat places (D3+) with no friendly/sanctuary rest within 600 m (1200 m in D4–D5): 3

| city | purposes in 2 km | missing core purposes | hostile in 2 km | edge / hinterland / rural counts |
|---|---|---|---|---|
| stormhold | 14 | — | 56 | 14 / 52 / 124 |
| thorn | 13 | — | 41 | 10 / 47 / 63 |
| gideon | 14 | — | 73 | 16 / 69 / 122 |
| helstrom | 15 | — | 84 | 8 / 37 / 244 |
| archon | 14 | — | 47 | 8 / 33 / 87 |
| blackrose | 14 | — | 73 | 11 / 66 / 95 |
| lilmoth | 14 | — | 59 | 8 / 46 / 97 |
| soulrest | 12 | resource-source | 45 | 6 / 35 / 78 |
| alten-corimont | 14 | — | 73 | 12 / 66 / 137 |

Rest-cadence gaps (add a rest or soften): `place.mercantile-coast.rockpark` (666 m), `place.hist-heartland.tended-xanmeer-clan-north` (713 m), `place.imperial-fringe.sink-field` (605 m)
