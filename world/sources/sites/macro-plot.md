# Macro plot — coverage report (Phase 11 Part 3)

Seed 1103. Supply: 1172 scour sites + 2001 free-ground points. Demand: 572 live records; **572 plotted**, 0 unresolved.
Placed from the homeless batch: {'spacing-1/2': 15, 'spacing-3/4': 38, 'neighbour-zone': 62, 'region-relaxed': 4, 'relaxed-score': 3}.

| zone | live | plotted | homeless | landform wishes from recipe | top landforms |
|---|---|---|---|---|---|
| dunmer-north | 126 | 126 | 0 | 0 | any-firm-ground 66, ravine 9, ridge-end 9, any-shallow-marsh 7 |
| hist-heartland | 112 | 112 | 0 | 0 | any-firm-ground 46, any-shallow-marsh 31, flood-high 5, summit 5 |
| imperial-fringe | 117 | 117 | 0 | 0 | any-firm-ground 74, ridge-end 12, ravine 7, gorge 5 |
| imperial-penal-south | 44 | 44 | 0 | 43 | any-firm-ground 18, any-shallow-marsh 6, cove 4, flood-high 3 |
| mercantile-coast | 65 | 65 | 0 | 65 | any-firm-ground 27, any-shallow-marsh 15, flood-high 6, cove 3 |
| naga-kur-deeps | 41 | 41 | 0 | 30 | any-shallow-marsh 25, flood-high 5, any-firm-ground 4, cove 1 |
| pirate-freeholds | 31 | 31 | 0 | 0 | any-firm-ground 23, ridge-end 2, anchor 1, cliff-bench 1 |
| saxhleel-coast | 36 | 36 | 0 | 0 | any-firm-ground 14, any-shallow-marsh 12, cove 3, river-mouth 2 |

## Spacing and routes

- nearest-neighbour distance p5 / median / p95: 79 / 171 / 297 m
- same-type pairs closer than 300 m: 2
- median distance to a route: 203 m; fine-tempo records within 300 m of a route: 68 %
- route-visibility sweep (364 samples every 150 m, radius 450 m): mean 3.96 destination/landmark places in sight; dead 4 %, crowded (4+) 50 %

## Anti-sameyness quota (no type > 25 % of a zone)

- none

## Named constraints (sightline / bound), as plotted

| record | kind | to | m | line of sight |
|---|---|---|---|---|
| `place.dunmer-north.gandranen-library` | bound | `place.dunmer-north.gandranen-ruins` | 291 | — |
| `place.dunmer-north.mazzatun-hist` | bound | `place.dunmer-north.mazzatun` | 204 | — |
| `place.dunmer-north.murkwater-shadowscale-ground` | bound | `place.dunmer-north.murkwater` | 346 | — |
| `place.dunmer-north.stormhold-causeway` | bound | `place.dunmer-north.stormhold` | 245 | — |
| `place.dunmer-north.the-black-stage` | bound | `place.dunmer-north.stormhold-causeway` | 189 | — |
| `place.dunmer-north.the-divers-landing` | bound | `place.dunmer-north.the-drowned-terrace` | 484 | — |
| `place.dunmer-north.the-drawdown-flats` | bound | `place.dunmer-north.the-drowned-terrace` | 187 | — |
| `place.dunmer-north.the-first-count` | sightline | `place.dunmer-north.stormhold` | 216 | True |
| `place.dunmer-north.the-flu-cordon` | sightline | `place.dunmer-north.stillrise-village` | 280 | True |
| `place.dunmer-north.the-north-vista` | sightline | `place.dunmer-north.the-pass-station` | 824 | True |
| `place.dunmer-north.the-outer-silyanorn` | sightline | `place.dunmer-north.stormhold` | 795 | True |
| `place.dunmer-north.the-pass-station` | bound | `place.dunmer-north.the-two-gate-bridge` | 762 | — |
| `place.dunmer-north.the-pen-yard` | sightline | `place.dunmer-north.the-dres-rows` | 136 | True |
| `place.dunmer-north.the-pen-yard` | bound | `place.dunmer-north.the-dres-rows` | 136 | — |
| `place.dunmer-north.the-silyanorn-crown` | sightline | `place.dunmer-north.the-outer-silyanorn` | 189 | True |
| `place.dunmer-north.the-silyanorn-crown` | bound | `place.dunmer-north.the-outer-silyanorn` | 189 | — |
| `place.dunmer-north.the-slumped-hamlet` | sightline | `place.dunmer-north.the-shut-village` | 162 | True |
| `place.dunmer-north.the-standing-bid` | sightline | `place.dunmer-north.stormhold` | 497 | True |
| `place.dunmer-north.the-standing-bid` | bound | `place.dunmer-north.stormhold` | 497 | — |
| `place.dunmer-north.the-stormhold-falls-chamber` | bound | `place.dunmer-north.stormhold` | 410 | — |
| `place.dunmer-north.the-stripped-village` | bound | `place.dunmer-north.the-field-gate-garrison` | 189 | — |
| `place.dunmer-north.the-thorn-bond` | bound | `place.dunmer-north.thorn` | 143 | — |
| `place.dunmer-north.the-veterans-ridge` | sightline | `place.dunmer-north.tear-road-stage` | 1039 | True |
| `place.dunmer-north.thorn-paddy-terraces` | bound | `place.dunmer-north.thorn` | 230 | — |
| `place.dunmer-north.waits-for-the-trial` | sightline | `place.dunmer-north.hissmir` | 154 | True |
| `place.dunmer-north.waits-for-the-trial` | bound | `place.dunmer-north.hissmir` | 154 | — |
| `place.hist-heartland.bereaved-mnemic` | bound | `place.hist-heartland.walkway-junction-high-crossroads` | 1016 | — |
| `place.hist-heartland.greenspring` | bound | `place.hist-heartland.whitewater-reach-panther` | 247 | — |
| `place.hist-heartland.miregaunt-ward-approach` | bound | `place.hist-heartland.sealed-xanmeer-living` | 824 | — |
| `place.hist-heartland.rootworm-station-helstrom` | bound | `place.hist-heartland.helstrom` | 235 | — |
| `place.hist-heartland.sap-tapping-licensed` | sightline | `place.hist-heartland.harmed-hist-tapped` | 334 | True |
| `place.hist-heartland.vista-ledge-canopy-break` | sightline | `place.hist-heartland.helstrom` | 1285 | True |
| `place.hist-heartland.xal-krona-making-ground` | bound | `place.hist-heartland.lost-city` | 61 | — |
| `place.imperial-fringe.ashen-tower` | sightline | `place.imperial-fringe.fort-swampmoth` | 813 | True |
| `place.imperial-fringe.cassian-farm` | bound | `place.imperial-fringe.gideon` | 872 | — |
| `place.imperial-fringe.castle-giovesse` | sightline | `place.imperial-fringe.gideon` | 383 | True |
| `place.imperial-fringe.collections-dig` | bound | `place.imperial-fringe.twyllbek-ruins` | 172 | — |
| `place.imperial-fringe.fort-swampmoth` | sightline | `place.imperial-fringe.mile-house-of-the-eagle` | 963 | False |
| `place.imperial-fringe.gideon-rootworm-terminus` | bound | `place.imperial-fringe.gideon` | 233 | — |
| `place.imperial-fringe.gideon-synod-outstation` | bound | `place.imperial-fringe.gideon` | 63 | — |
| `place.imperial-fringe.giovesse-lines` | sightline | `place.imperial-fringe.castle-giovesse` | 542 | True |
| `place.imperial-fringe.glenbridge` | sightline | `place.imperial-fringe.glenbridge-sermon-xanmeer` | 324 | False |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | sightline | `place.imperial-fringe.glenbridge` | 324 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | bound | `place.imperial-fringe.glenbridge` | 324 | — |
| `place.imperial-fringe.ridge-runners-post` | sightline | `place.imperial-fringe.ashen-tower` | 439 | True |
| `place.imperial-fringe.the-abandoned-survey` | bound | `place.imperial-fringe.the-vellum-estate` | 283 | — |
| `place.imperial-fringe.the-drowning-gate` | sightline | `place.imperial-fringe.the-embankment-that-drowned` | 816 | True |
| `place.imperial-fringe.the-embankment-that-drowned` | sightline | `place.imperial-fringe.the-drowning-gate` | 816 | True |
| `place.imperial-fringe.the-marble-field` | sightline | `place.imperial-fringe.gideon` | 453 | True |
| `place.imperial-fringe.the-ring-of-nine-wells` | sightline | `place.imperial-fringe.twyllbek-ruins` | 657 | True |
| `place.imperial-fringe.the-sermon-road-camp` | bound | `place.imperial-fringe.glenbridge` | 545 | — |
| `place.imperial-fringe.the-shut-door` | sightline | `place.imperial-fringe.the-kept-terrace` | 945 | True |
| `place.imperial-fringe.the-snowline-cell` | sightline | `place.imperial-fringe.ridge-runners-post` | 424 | True |
| `place.imperial-fringe.the-stone-talkers-watch` | sightline | `place.imperial-fringe.rockgrove` | 546 | True |
| `place.imperial-fringe.twyllbek-crown` | sightline | `place.imperial-fringe.twyllbek-ruins` | 1408 | True |
| `place.imperial-penal-south.akaviri-works` | bound | `place.imperial-penal-south.lilmothiit-quarry` | 800 | — |
| `place.imperial-penal-south.blackrose-prison` | bound | `place.imperial-penal-south.blackrose` | 141 | — |
| `place.imperial-penal-south.drowned-gallery` | bound | `place.imperial-penal-south.blackrose-prison` | 105 | — |
| `place.imperial-penal-south.flu-quarantine-village` | bound | `place.imperial-penal-south.blackrose` | 380 | — |
| `place.imperial-penal-south.natural-dive-shaft` | bound | `place.imperial-penal-south.basin-sinkhole` | 312 | — |
| `place.imperial-penal-south.necromantic-dig` | bound | `place.imperial-penal-south.blackrose-prison` | 330 | — |
| `place.imperial-penal-south.plague-cordon` | bound | `place.imperial-penal-south.rose-supply-town` | 135 | — |
| `place.imperial-penal-south.prison-born-refuge` | bound | `place.imperial-penal-south.longmont` | 482 | — |
| `place.imperial-penal-south.rockspring` | bound | `place.imperial-penal-south.bramman-head` | 352 | — |
| `place.imperial-penal-south.rose-flooded-passage` | bound | `place.imperial-penal-south.blackrose-prison` | 117 | — |
| `place.imperial-penal-south.rose-outworks` | bound | `place.imperial-penal-south.blackrose-prison` | 439 | — |
| `place.imperial-penal-south.voriplasm-vault` | bound | `place.imperial-penal-south.bramman-head` | 315 | — |
| `place.mercantile-coast.oliis-drake-deep` | bound | `place.mercantile-coast.oliis-air-station` | 344 | — |
| `place.mercantile-coast.pusbottom-barge` | bound | `place.mercantile-coast.lilmoth` | 290 | — |
| `place.mercantile-coast.soulrest-breaking-yard` | bound | `place.mercantile-coast.soulrest` | 224 | — |
| `place.mercantile-coast.soulrest-divers-yard` | bound | `place.mercantile-coast.soulrest` | 152 | — |
| `place.mercantile-coast.soulrest-quay-tradehouse` | bound | `place.mercantile-coast.soulrest` | 132 | — |
| `place.mercantile-coast.wraxu-stacks` | sightline | `place.mercantile-coast.wraxu-frieze` | 642 | True |
| `place.mercantile-coast.wraxu-stacks` | bound | `place.mercantile-coast.wraxu-frieze` | 642 | — |
| `place.pirate-freeholds.alten-corimont` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 361 | True |
| `place.pirate-freeholds.freehold-market` | bound | `place.pirate-freeholds.alten-corimont` | 88 | — |
| `place.pirate-freeholds.freehold-smithy` | sightline | `place.pirate-freeholds.careening-hard` | 450 | True |
| `place.pirate-freeholds.freehold-smithy` | bound | `place.pirate-freeholds.alten-corimont` | 181 | — |
| `place.pirate-freeholds.kothringi-river-ruin` | bound | `place.pirate-freeholds.alten-corimont` | 247 | — |
| `place.pirate-freeholds.opening-work-barge` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 306 | True |
| `place.pirate-freeholds.opening-work-barge` | bound | `place.pirate-freeholds.alten-corimont` | 57 | — |
| `place.pirate-freeholds.opening-work-camp` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 331 | True |
| `place.pirate-freeholds.opening-work-camp` | bound | `place.pirate-freeholds.opening-work-barge` | 47 | — |
| `place.pirate-freeholds.rim-keystone-chamber` | bound | `place.pirate-freeholds.rim-pass-station` | 359 | — |
| `place.saxhleel-coast.archon-bonded-row` | bound | `place.saxhleel-coast.archon` | 435 | — |
| `place.saxhleel-coast.archon-harbour-hist` | bound | `place.saxhleel-coast.archon` | 220 | — |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.archon` | 94 | True |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.padomaic-wrecker-beach` | 662 | True |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.outer-reef` | 563 | True |
| `place.saxhleel-coast.archon-lighthouse` | bound | `place.saxhleel-coast.archon` | 94 | — |
| `place.saxhleel-coast.archon-sacked-quarter` | bound | `place.saxhleel-coast.archon` | 420 | — |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | bound | `place.saxhleel-coast.archon` | 365 | — |
| `place.saxhleel-coast.archon-shipyard` | bound | `place.saxhleel-coast.archon` | 373 | — |
| `place.saxhleel-coast.padomaic-wrecker-beach` | sightline | `place.saxhleel-coast.archon-lighthouse` | 662 | True |
| `place.saxhleel-coast.padomaic-wrecker-beach` | bound | `place.saxhleel-coast.archon-lighthouse` | 662 | — |
| `place.saxhleel-coast.quarantine-village-lagoon` | bound | `place.saxhleel-coast.archon` | 530 | — |

## Records placed from the homeless batch

| record | stage | site |
|---|---|---|
| `place.dunmer-north.channel-cross-village` | spacing-1/2 | site.scour.tidal-delta.river-mouth-014 |
| `place.dunmer-north.climbs-to-see` | spacing-3/4 | site.free.any-shallow-marsh-0409 |
| `place.dunmer-north.greylight-village` | spacing-3/4 | site.scour.fringe-marsh.cliff-bench-056 |
| `place.dunmer-north.murkwater` | spacing-3/4 | site.free.any-firm-ground-0151 |
| `place.dunmer-north.murkwater-shadowscale-ground` | spacing-3/4 | site.free.roadside-0075 |
| `place.dunmer-north.reedmoor-stilts` | spacing-1/2 | site.scour.mangrove-forest.cove-045 |
| `place.dunmer-north.seam-chasers` | neighbour-zone | site.scour.border-mountains.ridge-end-001 |
| `place.dunmer-north.stands-on-the-island` | spacing-3/4 | site.free.roadside-0524 |
| `place.dunmer-north.the-diggings-ladder` | neighbour-zone | site.free.any-shallow-marsh-0437 |
| `place.dunmer-north.the-divers-landing` | region-relaxed | site.free.any-firm-ground-0008 |
| `place.dunmer-north.the-drawdown-flats` | neighbour-zone | site.scour.border-mountains.spring-head-008 |
| `place.dunmer-north.the-drowned-terrace` | neighbour-zone | site.scour.lake-standing-water.box-canyon-018 |
| `place.dunmer-north.the-monsoon-boom` | neighbour-zone | site.free.any-firm-ground-0198 |
| `place.dunmer-north.the-pen-yard` | neighbour-zone | site.free.any-firm-ground-0062 |
| `place.dunmer-north.the-shell-ground` | relaxed-score | site.scour.lake-standing-water.saddle-029 |
| `place.dunmer-north.the-shut-village` | neighbour-zone | site.scour.lake-standing-water.saddle-034 |
| `place.dunmer-north.the-slumped-hamlet` | neighbour-zone | site.scour.border-mountains.ridge-end-046 |
| `place.dunmer-north.the-thorn-bond` | neighbour-zone | site.free.any-firm-ground-0132 |
| `place.dunmer-north.the-tide-fair` | spacing-3/4 | site.free.any-shallow-marsh-0296 |
| `place.dunmer-north.the-white-pans` | neighbour-zone | site.scour.ocean.cove-032 |
| `place.dunmer-north.three-ways-over-water` | neighbour-zone | site.free.any-shallow-marsh-0273 |
| `place.dunmer-north.ties-four-ways` | spacing-3/4 | site.free.any-shallow-marsh-0322 |
| `place.hist-heartland.blackguard-hideout-raw` | neighbour-zone | site.scour.rootland-deep-marsh.island-033 |
| `place.hist-heartland.broken-xanmeer-subsumed` | neighbour-zone | site.free.roadside-0397 |
| `place.hist-heartland.bubble-spire-collapsed` | neighbour-zone | site.free.any-firm-ground-0813 |
| `place.hist-heartland.burn-scar-village-ash` | neighbour-zone | site.free.roadside-0617 |
| `place.hist-heartland.dive-shaft-xanmeer-well` | neighbour-zone | site.scour.lake-standing-water.water-narrows-051 |
| `place.hist-heartland.dream-wallow-starblossom` | neighbour-zone | site.free.any-shallow-marsh-0528 |
| `place.hist-heartland.greenspring` | spacing-1/2 | site.free.any-firm-ground-0352 |
| `place.hist-heartland.miregaunt-ward-approach` | spacing-3/4 | site.free.any-firm-ground-0431 |
| `place.hist-heartland.pilgrim-camp-sap-road` | neighbour-zone | site.scour.firm-lowland.enclosed-clearing-004 |
| `place.hist-heartland.poacher-camp-sap` | neighbour-zone | site.free.any-shallow-marsh-0450 |
| `place.hist-heartland.root-gallery-collapsed-nine` | neighbour-zone | site.free.roadside-0337 |
| `place.hist-heartland.root-gallery-drowned-stair` | neighbour-zone | site.scour.lake-standing-water.water-narrows-014 |
| `place.hist-heartland.root-gallery-lantern-hollow` | neighbour-zone | site.free.any-shallow-marsh-0430 |
| `place.hist-heartland.sap-tapping-licensed` | neighbour-zone | site.free.any-firm-ground-0884 |
| `place.hist-heartland.stilt-channel-edge-two-poles` | neighbour-zone | site.scour.firm-lowland.cove-048 |
| `place.hist-heartland.stilt-channel-edge-uxaneet` | neighbour-zone | site.free.any-shallow-marsh-0502 |
| `place.hist-heartland.submerged-xanmeer-topmost` | neighbour-zone | site.free.roadside-0613 |
| `place.hist-heartland.treasure-hunters-dead-camp` | neighbour-zone | site.scour.rootland-deep-marsh.cliff-bench-064 |
| `place.hist-heartland.treasure-hunters-live-camp` | neighbour-zone | site.free.any-shallow-marsh-0524 |
| `place.hist-heartland.wild-hist-mad-one` | neighbour-zone | site.free.any-shallow-marsh-0375 |
| `place.imperial-fringe.ashen-tower` | spacing-3/4 | site.scour.border-mountains.ridge-end-039 |
| `place.imperial-fringe.bonded-shed-of-the-onkobra` | spacing-3/4 | site.free.roadside-0374 |
| `place.imperial-fringe.castle-giovesse` | spacing-1/2 | site.free.any-firm-ground-0572 |
| `place.imperial-fringe.claywater-station` | spacing-3/4 | site.free.roadside-0290 |
| `place.imperial-fringe.fort-greenditch` | spacing-1/2 | site.free.any-firm-ground-0599 |
| `place.imperial-fringe.fort-swampmoth` | spacing-3/4 | site.scour.border-mountains.ridge-end-069 |
| `place.imperial-fringe.gideon-synod-outstation` | spacing-3/4 | site.free.any-firm-ground-0600 |
| `place.imperial-fringe.giovesse-lines` | spacing-1/2 | site.free.roadside-0163 |
| `place.imperial-fringe.ladder-to-the-light` | spacing-3/4 | site.free.roadside-0229 |
| `place.imperial-fringe.low-water-fair` | spacing-3/4 | site.scour.seasonal-floodplain.river-mouth-007 |
| `place.imperial-fringe.lower-onkobra-paddies` | spacing-3/4 | site.free.any-firm-ground-0636 |
| `place.imperial-fringe.ninefold-station` | spacing-3/4 | site.scour.interior-swamp.cliff-bench-045 |
| `place.imperial-fringe.red-cart-yard` | spacing-3/4 | site.free.roadside-0250 |
| `place.imperial-fringe.ridge-runners-post` | spacing-3/4 | site.free.any-firm-ground-0511 |
| `place.imperial-fringe.the-abandoned-survey` | spacing-3/4 | site.free.any-firm-ground-0663 |
| `place.imperial-fringe.the-drowned-mule` | neighbour-zone | site.free.roadside-0291 |
| `place.imperial-fringe.the-drowning-gate` | spacing-3/4 | site.free.any-firm-ground-0491 |
| `place.imperial-fringe.the-embankment-that-drowned` | spacing-3/4 | site.free.any-firm-ground-0667 |
| `place.imperial-fringe.the-empty-steading` | spacing-1/2 | site.scour.firm-lowland.flood-high-004 |
| `place.imperial-fringe.the-glass-scar` | relaxed-score | site.scour.border-mountains.ridge-end-034 |
| `place.imperial-fringe.the-ravine-doors` | spacing-3/4 | site.free.any-firm-ground-1020 |
| `place.imperial-fringe.the-snowline-cell` | spacing-3/4 | site.scour.border-mountains.box-canyon-040 |
| `place.imperial-fringe.the-turned-out` | spacing-1/2 | site.free.any-firm-ground-0539 |
| `place.imperial-fringe.the-vellum-estate` | spacing-3/4 | site.free.roadside-0219 |
| `place.imperial-penal-south.basin-sinkhole` | neighbour-zone | site.free.any-firm-ground-1353 |
| `place.imperial-penal-south.drawdown-flat` | neighbour-zone | site.scour.lake-standing-water.islet-036 |
| `place.imperial-penal-south.drowned-gallery` | neighbour-zone | site.free.any-firm-ground-1318 |
| `place.imperial-penal-south.lake-boardwalk-village` | spacing-3/4 | site.scour.mangrove-forest.ford-017 |
| `place.imperial-penal-south.lake-submerged-xanmeer` | neighbour-zone | site.scour.lake-standing-water.cove-005 |
| `place.imperial-penal-south.marsh-giant-ground-basin` | neighbour-zone | site.free.any-shallow-marsh-1186 |
| `place.imperial-penal-south.murkwood-verge` | spacing-1/2 | site.free.any-shallow-marsh-1027 |
| `place.imperial-penal-south.natural-dive-shaft` | region-relaxed | site.free.any-firm-ground-1351 |
| `place.imperial-penal-south.plague-cordon` | neighbour-zone | site.free.roadside-0578 |
| `place.imperial-penal-south.rebellion-earthworks` | neighbour-zone | site.free.roadside-0031 |
| `place.imperial-penal-south.rockspring` | spacing-1/2 | site.scour.firm-lowland.flood-high-010 |
| `place.imperial-penal-south.rose-flooded-passage` | spacing-3/4 | site.free.any-firm-ground-1317 |
| `place.imperial-penal-south.rose-outworks` | spacing-3/4 | site.scour.firm-lowland.headland-030 |
| `place.imperial-penal-south.vampiric-cloud-ground` | spacing-3/4 | site.free.roadside-0033 |
| `place.imperial-penal-south.west-market-town` | spacing-3/4 | site.free.any-firm-ground-1281 |
| `place.imperial-penal-south.wisp-lure-basin` | neighbour-zone | site.free.any-shallow-marsh-1076 |
| `place.mercantile-coast.bereaved-village-murkmire` | spacing-3/4 | site.free.roadside-0500 |
| `place.mercantile-coast.hereguard-plantation` | neighbour-zone | site.free.any-firm-ground-1217 |
| `place.mercantile-coast.keel-sakka-stilts` | neighbour-zone | site.free.any-shallow-marsh-1342 |
| `place.mercantile-coast.lilmoth-divers-yard` | neighbour-zone | site.scour.mangrove-forest.cove-030 |
| `place.mercantile-coast.necropolis-village-murkmire` | spacing-3/4 | site.free.any-shallow-marsh-1026 |
| `place.mercantile-coast.oliis-boardwalk` | neighbour-zone | site.free.any-shallow-marsh-1170 |
| `place.mercantile-coast.oliis-ferry-stage` | neighbour-zone | site.free.roadside-0270 |
| `place.mercantile-coast.root-gallery-murkmire` | spacing-3/4 | site.free.any-firm-ground-1111 |
| `place.mercantile-coast.screen-watch` | spacing-1/2 | site.free.roadside-0502 |
| `place.mercantile-coast.soulrest-quay-tradehouse` | neighbour-zone | site.free.any-firm-ground-1287 |
| `place.mercantile-coast.stripped-village-north` | neighbour-zone | site.free.any-firm-ground-1197 |
| `place.mercantile-coast.topal-salt-pans` | neighbour-zone | site.scour.ocean.natural-harbour-001 |
| `place.naga-kur-deeps.bog-blight-ground-nine-stakes` | neighbour-zone | site.free.any-shallow-marsh-1155 |
| `place.naga-kur-deeps.bog-blight-ground-old-cordon` | spacing-3/4 | site.scour.rootland-deep-marsh.flood-high-026 |
| `place.naga-kur-deeps.dive-shaft-natural-deeps` | spacing-1/2 | site.scour.lake-standing-water.land-bridge-029 |
| `place.naga-kur-deeps.drowned-village-lake-deeps` | neighbour-zone | site.free.any-shallow-marsh-1200 |
| `place.naga-kur-deeps.drowning-narrows-tidal-gate` | neighbour-zone | site.free.any-shallow-marsh-1104 |
| `place.naga-kur-deeps.flooded-passage-tunnel-deeps` | neighbour-zone | site.free.any-shallow-marsh-1165 |
| `place.naga-kur-deeps.legendary-deep-feather-serpent` | neighbour-zone | site.free.any-shallow-marsh-1132 |
| `place.naga-kur-deeps.miregaunt-ward-open` | neighbour-zone | site.free.any-firm-ground-0953 |
| `place.naga-kur-deeps.naga-highway-camp-active-north` | neighbour-zone | site.free.any-shallow-marsh-1209 |
| `place.naga-kur-deeps.necropolis-nightbound` | spacing-3/4 | site.free.any-shallow-marsh-1224 |
| `place.naga-kur-deeps.sealed-xanmeer-vakka-deeps` | neighbour-zone | site.scour.rootland-deep-marsh.flood-high-023 |
| `place.naga-kur-deeps.wreck-submerged-barge` | neighbour-zone | site.scour.fringe-marsh.cove-001 |
| `place.pirate-freeholds.channel-pirate-anchorage` | neighbour-zone | site.free.any-firm-ground-0182 |
| `place.pirate-freeholds.freehold-naga-camp` | neighbour-zone | site.scour.border-mountains.ravine-036 |
| `place.pirate-freeholds.freehold-smithy` | spacing-3/4 | site.free.any-firm-ground-0179 |
| `place.pirate-freeholds.opening-work-barge` | spacing-3/4 | site.free.any-firm-ground-0204 |
| `place.pirate-freeholds.opening-work-camp` | spacing-1/2 | site.free.roadside-0049 |
| `place.pirate-freeholds.rim-snowline-hermitage` | neighbour-zone | site.free.any-firm-ground-0099 |
| `place.pirate-freeholds.trunk-road-tradehouse` | neighbour-zone | site.free.roadside-0064 |
| `place.saxhleel-coast.archon-bonded-row` | region-relaxed | site.free.any-firm-ground-1042 |
| `place.saxhleel-coast.archon-glowgill-byre` | spacing-1/2 | site.free.any-shallow-marsh-0724 |
| `place.saxhleel-coast.archon-shipyard` | region-relaxed | site.free.roadside-0508 |
| `place.saxhleel-coast.coast-hist-less-refuge` | spacing-3/4 | site.free.any-shallow-marsh-0785 |
| `place.saxhleel-coast.jungle-root-hollow` | neighbour-zone | site.free.any-firm-ground-0847 |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | neighbour-zone | site.scour.tropical-jungle.cove-043 |
| `place.saxhleel-coast.mangrove-reef` | relaxed-score | site.free.any-shallow-marsh-0689 |
| `place.saxhleel-coast.pearl-lots` | spacing-1/2 | site.scour.ocean.cove-006 |
| `place.saxhleel-coast.sealed-xanmeer-wall` | neighbour-zone | site.free.any-firm-ground-1091 |

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

any-firm-ground 272, any-shallow-marsh 97, ridge-end 24, flood-high 21, ravine 18, cove 15, cliff-bench 11, summit 11, gorge 10, spring-head 10, anchor 9, islet 9, saddle 8, water-narrows 8, box-canyon 7, island 7, river-mouth 7, headland 5, ford 4, land-bridge 4, waterfall 4, oxbow 3, confluence 2, enclosed-clearing 2, isthmus 2, any-channel-bank 1, natural-harbour 1

## Homeless batch (unresolved)

- none: every live record found ground

## Tier 0–1 placements

| record | site | landform | region | why |
|---|---|---|---|---|
| `place.dunmer-north.bogmother` | site.scour.firm-lowland.summit-041 | summit | firm lowland | summit in firm lowland (danger band 2), 351 m from the nearest route; its choice #2 landform; won on landform, region, danger. |
| `place.dunmer-north.gandranen-library` | site.scour.lake-standing-water.cliff-bench-026 | cliff-bench | lake & standing water | cliff bench in lake & standing water (danger band 5), 1157 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, remote. |
| `place.dunmer-north.gandranen-ruins` | site.free.any-firm-ground-0168 | any-firm-ground | border mountains | firm ground in border mountains (danger band 3), 1393 m from the nearest route; at the water's edge; no free 'sinkhole' site was left in the zone, so plain ground; won on remote, landform, water. |
| `place.dunmer-north.hatching-pools` | site.scour.firm-lowland.spring-head-045 | spring-head | firm lowland | spring head in firm lowland (danger band 2), 66 m from the nearest route; at the water's edge; its first-choice landform; won on landform, danger, parent. |
| `place.dunmer-north.hissmir` | site.free.any-firm-ground-0237 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 258 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.dunmer-north.hixinoag` | site.free.roadside-0141 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 85 m from the nearest route; at the water's edge; no free 'oxbow' site was left in the zone, so plain ground; won on region, parent, landform. |
| `place.dunmer-north.hutan-tzel` | site.scour.firm-lowland.spring-head-038 | spring-head | firm lowland | spring head in firm lowland (danger band 2), 50 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |
| `place.dunmer-north.loriasel-caverns` | site.scour.upland-hills.spring-head-015 | spring-head | upland hills | spring head in upland hills (danger band 3), 777 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, remote. |
| `place.dunmer-north.mazzatun` | site.scour.upland-hills.ridge-end-066 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 246 m from the nearest route; its first-choice landform; won on landform, region, danger. |
| `place.dunmer-north.mazzatun-hist` | site.free.any-firm-ground-0302 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 319 m from the nearest route; its choice #3 landform; won on bound, landform, danger. |
| `place.dunmer-north.stillrise-village` | site.scour.lake-standing-water.box-canyon-042 | box-canyon | lake & standing water | box canyon in lake & standing water (danger band 5), 1285 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, remote. |
| `place.dunmer-north.stormhold` | anchor.stormhold | anchor | firm lowland | Owner-approved settlement anchor 'stormhold' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.ten-maur-wolk` | site.scour.upland-hills.saddle-030 | saddle | upland hills | saddle in upland hills (danger band 3), 1132 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, remote. |
| `place.dunmer-north.the-quiet-landing` | site.free.any-firm-ground-0319 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 132 m from the nearest route; its choice #2 landform; won on landform, region, route. |
| `place.dunmer-north.the-standing-bid` | site.free.roadside-0091 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 17 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, sightline. |
| `place.dunmer-north.thorn` | anchor.thorn | anchor | firm lowland | Owner-approved settlement anchor 'thorn' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.wolk-market` | site.free.roadside-0557 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 61 m from the nearest route; at the water's edge; its choice #4 landform; won on route, landform, region. |
| `place.hist-heartland.bereaved-mnemic` | site.free.any-firm-ground-0345 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 4), 454 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, region. |
| `place.hist-heartland.cult-raid-camp-unbound` | site.scour.firm-lowland.flood-high-031 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 332 m from the nearest route; its choice #4 landform; won on landform, region, route. |
| `place.hist-heartland.greenspring` | site.free.any-firm-ground-0352 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 154 m from the nearest route; no free 'confluence' site was left in the zone, so plain ground; won on bound, region, danger; placed from the homeless batch at stage 'spacing-1/2'. |
| `place.hist-heartland.guide-camp-gate-side` | site.scour.rootland-deep-marsh.enclosed-clearing-000 | enclosed-clearing | rootland deep marsh | enclosed clearing in rootland deep marsh (danger band 5), 88 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, parent. |
| `place.hist-heartland.helstrom` | anchor.helstrom | anchor | lake & standing water | Owner-approved settlement anchor 'helstrom' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.hist-heartland.heretic-stone-restarted` | site.scour.upland-hills.ridge-end-049 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 182 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, route. |
| `place.hist-heartland.hist-agaceph-needle` | site.scour.tropical-jungle.spring-head-043 | spring-head | tropical jungle | spring head in tropical jungle (danger band 4), 625 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.hist-first-rain-trunk` | site.scour.rootland-deep-marsh.island-034 | island | rootland deep marsh | island in rootland deep marsh (danger band 5), 311 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, parent. |
| `place.hist-heartland.hist-paatru-lowcrown` | site.scour.rootland-deep-marsh.spring-head-041 | spring-head | rootland deep marsh | spring head in rootland deep marsh (danger band 4), 11 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, danger. |
| `place.hist-heartland.hist-sarpa-highflower` | site.scour.rootland-deep-marsh.spring-head-042 | spring-head | rootland deep marsh | spring head in rootland deep marsh (danger band 5), 126 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, parent. |
| `place.hist-heartland.lost-city` | site.free.any-firm-ground-0447 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 5), 498 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.nightbound-lightless` | site.scour.rootland-deep-marsh.gorge-007 | gorge | rootland deep marsh | gorge in rootland deep marsh (danger band 4), 420 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote. |
| `place.hist-heartland.refuge-station-interior` | site.free.any-firm-ground-0310 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 718 m from the nearest route; its choice #3 landform; won on remote, landform, region. |
| `place.hist-heartland.root-gallery-cult-warren` | site.free.any-firm-ground-0842 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 873 m from the nearest route; its choice #5 landform; won on region, remote, landform. |
| `place.hist-heartland.root-gallery-helstrom-underway` | site.scour.rootland-deep-marsh.ravine-015 | ravine | rootland deep marsh | ravine in rootland deep marsh (danger band 3), 17 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, danger. |
| `place.hist-heartland.root-talk-ground` | site.free.roadside-0383 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 89 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, parent, landform. |
| `place.hist-heartland.rootworm-station-helstrom` | site.scour.firm-lowland.flood-high-013 | flood-high | firm lowland | flood high in firm lowland (danger band 5), 99 m from the nearest route; its first-choice landform; won on landform, bound, region. |
| `place.hist-heartland.sap-collection-facility-daedric` | site.free.any-firm-ground-0915 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 684 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on remote, region, parent. |
| `place.hist-heartland.sealed-xanmeer-living` | site.free.any-shallow-marsh-0400 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 280 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, danger, parent. |
| `place.hist-heartland.stone-calendar-hist-tsoko` | site.scour.firm-lowland.summit-033 | summit | firm lowland | summit in firm lowland (danger band 3), 685 m from the nearest route; its first-choice landform; won on landform, route, region. |
| `place.hist-heartland.the-cut-circle` | site.free.any-shallow-marsh-0627 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 23 m from the nearest route; at the water's edge; its first-choice landform; won on landform, danger, route. |
| `place.hist-heartland.umpholo-mission` | site.free.any-firm-ground-0981 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 748 m from the nearest route; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.xal-krona-making-ground` | site.free.any-shallow-marsh-0470 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 451 m from the nearest route; at the water's edge; no free 'box-canyon' site was left in the zone, so plain ground; won on bound, region, remote. |
| `place.hist-heartland.xal-meeruth-station` | site.scour.deep-river-corridor.confluence-000 | confluence | deep river corridor | confluence in deep river corridor (danger band 4), 6 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, route, region. |
| `place.hist-heartland.xanmeer-fort-defences-working` | site.scour.firm-lowland.summit-031 | summit | firm lowland | summit in firm lowland (danger band 4), 710 m from the nearest route; its choice #2 landform; won on landform, region, remote. |
| `place.imperial-fringe.castle-giovesse` | site.free.any-firm-ground-0572 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 87 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on sightline, region, parent; placed from the homeless batch at stage 'spacing-1/2'. |
| `place.imperial-fringe.fort-swampmoth` | site.scour.border-mountains.ridge-end-069 | ridge-end | border mountains | ridge end in border mountains (danger band 3), 217 m from the nearest route; its first-choice landform; won on landform, sightline, parent; placed from the homeless batch at stage 'spacing-3/4'. |
| `place.imperial-fringe.gideon` | anchor.gideon | anchor | firm lowland | Owner-approved settlement anchor 'gideon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-fringe.gideon-rootworm-terminus` | site.free.any-firm-ground-0632 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 233 m from the nearest route; at the water's edge; its choice #4 landform; won on bound, landform, region. |
| `place.imperial-fringe.glenbridge` | site.free.any-firm-ground-0790 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 717 m from the nearest route; its choice #3 landform; won on landform, region, parent. |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | site.free.any-firm-ground-0758 | any-firm-ground | border mountains | firm ground in border mountains (danger band 3), 630 m from the nearest route; at the water's edge; no free 'summit' site was left in the zone, so plain ground; won on bound, sightline, danger. |
| `place.imperial-fringe.orma-tactile-ruin` | site.scour.border-mountains.ravine-004 | ravine | border mountains | ravine in border mountains (danger band 3), 1274 m from the nearest route; at the water's edge; its choice #2 landform; won on remote, landform, region. |
| `place.imperial-fringe.rockgrove` | site.scour.upland-hills.ridge-end-025 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1190 m from the nearest route; its choice #2 landform; won on landform, region, remote. |
| `place.imperial-fringe.slough-point` | site.scour.firm-lowland.water-narrows-020 | water-narrows | firm lowland | water narrows in firm lowland (danger band 2), 6 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, danger. |
| `place.imperial-fringe.stonewastes` | site.scour.upland-hills.land-bridge-000 | land-bridge | upland hills | land bridge in upland hills (danger band 3), 658 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, ring. |
| `place.imperial-fringe.the-silent-halls` | site.free.any-firm-ground-0864 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 462 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, submerged, remote. |
| `place.imperial-fringe.the-stone-talkers-watch` | site.scour.upland-hills.ridge-end-055 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1018 m from the nearest route; its choice #2 landform; won on landform, sightline, region. |
| `place.imperial-penal-south.blackrose` | anchor.blackrose | anchor | fringe marsh | Owner-approved settlement anchor 'blackrose' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-penal-south.blackrose-drowned-hist` | site.scour.lake-standing-water.islet-033 | islet | lake & standing water | islet in lake & standing water (danger band 3), 172 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.blackrose-prison` | site.scour.firm-lowland.flood-high-000 | flood-high | firm lowland | flood high in firm lowland (danger band 2), 140 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.bramman-head` | site.scour.lake-standing-water.ford-009 | ford | lake & standing water | ford in lake & standing water (danger band 3), 190 m from the nearest route; at the water's edge; its choice #5 landform; won on landform, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.chainbreaker-shelter` | site.free.any-firm-ground-1359 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 93 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.flu-quarantine-village` | site.scour.fringe-marsh.island-003 | island | fringe marsh | island in fringe marsh (danger band 2), 39 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lake-submerged-xanmeer` | site.scour.lake-standing-water.cove-005 | cove | lake & standing water | cove in lake & standing water (danger band 3), 557 m from the nearest route; at the water's edge; its choice #5 landform; won on region, remote, submerged; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lilmothiit-quarry` | site.scour.deep-river-corridor.land-bridge-036 | land-bridge | deep river corridor | land bridge in deep river corridor (danger band 3), 604 m from the nearest route; at the water's edge; won on region, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.longmont` | site.free.any-shallow-marsh-1230 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 424 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.murkwood-verge` | site.free.any-shallow-marsh-1027 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 416 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, danger, parent; placed from the homeless batch at stage 'spacing-1/2'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.rose-flooded-passage` | site.free.any-firm-ground-1317 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 214 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, region; placed from the homeless batch at stage 'spacing-3/4'. |
| `place.imperial-penal-south.rose-supply-town` | site.scour.fringe-marsh.ford-030 | ford | fringe marsh | ford in fringe marsh (danger band 2), 61 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.three-gate-toll` | site.free.roadside-0020 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 35 m from the nearest route; no free 'ford' site was left in the zone, so plain ground; won on route, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.west-market-town` | site.free.any-firm-ground-1281 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 92 m from the nearest route; at the water's edge; its choice #4 landform; won on route, landform, region; placed from the homeless batch at stage 'spacing-3/4'; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.alten-meerhleel` | site.free.roadside-0035 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 2), 33 m from the nearest route; at the water's edge; no free 'natural-harbour' site was left in the zone, so plain ground; won on region, parent, landform; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bramman-screen` | site.free.any-shallow-marsh-1215 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 3), 88 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bright-throat-village` | site.free.any-shallow-marsh-1121 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 439 m from the nearest route; its choice #3 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.chasepoint` | site.free.roadside-0016 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 38 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.inhabited-meer-murkmire` | site.scour.fringe-marsh.flood-high-003 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 154 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.ixtaxh-xanmeer` | site.scour.lake-standing-water.islet-004 | islet | lake & standing water | islet in lake & standing water (danger band 3), 846 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.lilmoth` | anchor.lilmoth | anchor | firm lowland | Owner-approved settlement anchor 'lilmoth' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.rockpark` | site.free.any-firm-ground-1018 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 594 m from the nearest route; its choice #2 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.slaughter-memorial` | site.free.any-firm-ground-1258 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 1), 50 m from the nearest route; its choice #3 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.soulrest` | anchor.soulrest | anchor | fringe marsh | Owner-approved settlement anchor 'soulrest' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.teeth-of-sithis` | site.scour.tropical-jungle.summit-049 | summit | tropical jungle | summit in tropical jungle (danger band 4), 593 m from the nearest route; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.white-rose-prison` | site.scour.firm-lowland.flood-high-007 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 167 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.xinchei-konu` | site.scour.firm-lowland.summit-029 | summit | firm lowland | summit in firm lowland (danger band 2), 377 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.bereaved-hist-less-since` | site.free.any-firm-ground-1130 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 4), 449 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.dead-water-village` | site.free.roadside-0426 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 88 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, nearPoint, region. |
| `place.naga-kur-deeps.deepmire-refuge` | site.scour.interior-swamp.flood-high-029 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 568 m from the nearest route; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.ferry-stage-guide-hire` | site.free.any-shallow-marsh-1162 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 255 m from the nearest route; at the water's edge; no free 'water-narrows' site was left in the zone, so plain ground; won on region, parent, landform; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.harmed-hist-enslaved` | site.scour.interior-swamp.flood-high-017 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 151 m from the nearest route; its choice #2 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | site.free.any-firm-ground-0775 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 5), 464 m from the nearest route; its choice #3 landform; won on landform, region, remote. |
| `place.naga-kur-deeps.naga-village-settled` | site.free.any-shallow-marsh-1148 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 183 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |
| `place.naga-kur-deeps.root-gallery-blight-warren` | site.free.any-firm-ground-0983 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 857 m from the nearest route; its choice #5 landform; won on region, remote, landform; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-whisper-village` | site.scour.rootland-deep-marsh.oxbow-015 | oxbow | rootland deep marsh | oxbow in rootland deep marsh (danger band 5), 66 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.sithis-temple-mass-sacrifice` | site.scour.interior-swamp.flood-high-038 | flood-high | interior swamp | flood high in interior swamp (danger band 3), 259 m from the nearest route; its choice #3 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.umbriel-stripped-undead` | site.free.any-shallow-marsh-1099 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 181 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |
| `place.naga-kur-deeps.wild-hist-rogue-deeps` | site.scour.interior-swamp.island-007 | island | interior swamp | island in interior swamp (danger band 4), 639 m from the nearest route; at the water's edge; its choice #3 landform; won on remote, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.pirate-freeholds.alten-corimont` | anchor.alten-corimont | anchor | firm lowland | Owner-approved settlement anchor 'alten-corimont' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.pirate-freeholds.chasecreek` | site.free.any-firm-ground-0281 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 158 m from the nearest route; its first-choice landform; won on landform, region, parent. |
| `place.pirate-freeholds.corimont-hist-less-camp` | site.free.any-firm-ground-0276 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 412 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent. |
| `place.pirate-freeholds.opening-work-barge` | site.free.any-firm-ground-0204 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 51 m from the nearest route; at the water's edge; no free 'any-channel-bank' site was left in the zone, so plain ground; won on bound, sightline, region; placed from the homeless batch at stage 'spacing-3/4'. |
| `place.pirate-freeholds.opening-work-camp` | site.free.roadside-0049 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 32 m from the nearest route; its first-choice landform; won on landform, bound, sightline; placed from the homeless batch at stage 'spacing-1/2'. |
| `place.pirate-freeholds.rockpoint` | site.scour.firm-lowland.summit-027 | summit | firm lowland | summit in firm lowland (danger band 3), 330 m from the nearest route; won on region, route, danger. |
| `place.pirate-freeholds.upriver-hist-village` | site.free.roadside-0608 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 43 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.archon` | anchor.archon | anchor | mangrove forest | Owner-approved settlement anchor 'archon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.saxhleel-coast.archon-harbour-hist` | site.free.any-firm-ground-0956 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 51 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, parent. |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | site.free.any-firm-ground-1013 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 313 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on bound, region, parent. |
| `place.saxhleel-coast.cantemir-headland` | site.free.any-firm-ground-0951 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 633 m from the nearest route; at the water's edge; no free 'headland' site was left in the zone, so plain ground; won on region, remote, danger. |
| `place.saxhleel-coast.east-estuary-rootworm-station` | site.free.any-firm-ground-1014 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 143 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | site.scour.tropical-jungle.cove-043 | cove | tropical jungle | cove in tropical jungle (danger band 4), 884 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.saxhleel-coast.portdun-mont` | site.scour.mangrove-forest.flood-high-030 | flood-high | mangrove forest | flood high in mangrove forest (danger band 2), 229 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.seafalls` | site.scour.tropical-jungle.water-narrows-009 | water-narrows | tropical jungle | water narrows in tropical jungle (danger band 2), 172 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |

## Owner-feedback checks (Part 4 step 2)

- stances: {'friendly': 73, 'wary': 68, 'neutral': 90, 'guarded': 39, 'hostile': 278, 'sanctuary': 24}
- swap pass exchanged 132 sites
- delves/combat places (D3+) with no friendly/sanctuary rest within 600 m (1200 m in D4–D5): 2

| city | purposes in 2 km | missing core purposes | hostile in 2 km | edge / hinterland / rural counts |
|---|---|---|---|---|
| stormhold | 14 | — | 54 | 13 / 50 / 116 |
| thorn | 12 | — | 41 | 11 / 44 / 65 |
| gideon | 15 | — | 71 | 18 / 67 / 117 |
| helstrom | 14 | — | 84 | 8 / 33 / 242 |
| archon | 14 | — | 48 | 6 / 39 / 81 |
| blackrose | 14 | — | 76 | 14 / 66 / 90 |
| lilmoth | 14 | — | 65 | 8 / 47 / 99 |
| soulrest | 13 | — | 47 | 6 / 33 / 80 |
| alten-corimont | 14 | — | 72 | 12 / 68 / 130 |

Rest-cadence gaps (add a rest or soften): `place.hist-heartland.tended-xanmeer-clan-north` (726 m), `place.dunmer-north.the-high-wrappings` (620 m)
