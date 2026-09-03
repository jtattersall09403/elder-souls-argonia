# Macro plot — coverage report (Phase 11 Part 3)

Seed 1103. Supply: 1172 scour sites + 2001 free-ground points. Demand: 527 live records; **527 plotted**, 0 unresolved.
Placed from the homeless batch: {'spacing-3/4': 38, 'spacing-1/2': 19, 'neighbour-zone': 43, 'region-relaxed': 1}.

| zone | live | plotted | homeless | landform wishes from recipe | top landforms |
|---|---|---|---|---|---|
| dunmer-north | 138 | 138 | 0 | 0 | any-firm-ground 65, ridge-end 14, cliff-bench 10, ravine 8 |
| hist-heartland | 111 | 111 | 0 | 111 | any-firm-ground 39, any-shallow-marsh 30, flood-high 6, cliff-bench 4 |
| imperial-fringe | 121 | 121 | 0 | 0 | any-firm-ground 75, ridge-end 10, ravine 6, gorge 4 |
| imperial-penal-south | 21 | 21 | 0 | 21 | any-firm-ground 7, flood-high 3, islet 3, cove 2 |
| mercantile-coast | 56 | 56 | 0 | 56 | any-firm-ground 24, any-shallow-marsh 12, flood-high 4, islet 4 |
| naga-kur-deeps | 39 | 39 | 0 | 39 | any-shallow-marsh 23, flood-high 5, any-firm-ground 3, cove 2 |
| pirate-freeholds | 17 | 17 | 0 | 0 | any-firm-ground 11, ridge-end 2, anchor 1, cliff-bench 1 |
| saxhleel-coast | 24 | 24 | 0 | 0 | any-firm-ground 8, any-shallow-marsh 8, cove 2, water-narrows 2 |

## Spacing and routes

- nearest-neighbour distance p5 / median / p95: 87 / 187 / 305 m
- same-type pairs closer than 300 m: 4
- median distance to a route: 225 m; fine-tempo records within 300 m of a route: 65 %
- route-visibility sweep (364 samples every 150 m, radius 450 m): mean 3.09 destination/landmark places in sight; dead 5 %, crowded (4+) 34 %

## Anti-sameyness quota (no type > 25 % of a zone)

- none

## Named constraints (sightline / bound), as plotted

| record | kind | to | m | line of sight |
|---|---|---|---|---|
| `place.dunmer-north.mazzatun-hist` | bound | `place.dunmer-north.mazzatun` | 330 | — |
| `place.dunmer-north.murkwater-shadowscale-ground` | bound | `place.dunmer-north.murkwater` | 1007 | — |
| `place.dunmer-north.stormhold-causeway` | bound | `place.dunmer-north.stormhold` | 245 | — |
| `place.dunmer-north.ten-maur-wolk` | sightline | `place.dunmer-north.wolk-market` | 131 | True |
| `place.dunmer-north.the-first-count` | sightline | `place.dunmer-north.stormhold` | 431 | True |
| `place.dunmer-north.the-flu-cordon` | sightline | `place.dunmer-north.stillrise-village` | 280 | True |
| `place.dunmer-north.the-north-vista` | sightline | `place.dunmer-north.the-pass-station` | 938 | True |
| `place.dunmer-north.the-outer-silyanorn` | sightline | `place.dunmer-north.stormhold` | 1034 | True |
| `place.dunmer-north.the-silyanorn-crown` | sightline | `place.dunmer-north.the-outer-silyanorn` | 693 | True |
| `place.dunmer-north.the-slumped-hamlet` | sightline | `place.dunmer-north.the-shut-village` | 3214 | False |
| `place.dunmer-north.the-stormhold-falls-chamber` | bound | `place.dunmer-north.stormhold` | 357 | — |
| `place.dunmer-north.the-thorn-bond` | bound | `place.dunmer-north.thorn` | 143 | — |
| `place.dunmer-north.the-veterans-ridge` | sightline | `place.dunmer-north.tear-road-stage` | 1246 | True |
| `place.dunmer-north.thorn-paddy-terraces` | bound | `place.dunmer-north.thorn` | 230 | — |
| `place.dunmer-north.wolk-market` | sightline | `place.dunmer-north.ten-maur-wolk` | 131 | True |
| `place.hist-heartland.rootworm-station-helstrom` | bound | `place.hist-heartland.helstrom` | 279 | — |
| `place.hist-heartland.sap-tapping-licensed` | sightline | `place.hist-heartland.harmed-hist-tapped` | 760 | True |
| `place.hist-heartland.vista-ledge-canopy-break` | sightline | `place.hist-heartland.helstrom` | 1285 | True |
| `place.imperial-fringe.ashen-tower` | sightline | `place.imperial-fringe.fort-swampmoth` | 653 | True |
| `place.imperial-fringe.castle-giovesse` | sightline | `place.imperial-fringe.gideon` | 429 | True |
| `place.imperial-fringe.fort-swampmoth` | sightline | `place.imperial-fringe.mile-house-of-the-eagle` | 922 | True |
| `place.imperial-fringe.gideon-rootworm-terminus` | bound | `place.imperial-fringe.gideon` | 233 | — |
| `place.imperial-fringe.gideon-synod-outstation` | bound | `place.imperial-fringe.gideon` | 276 | — |
| `place.imperial-fringe.giovesse-lines` | sightline | `place.imperial-fringe.castle-giovesse` | 619 | True |
| `place.imperial-fringe.glenbridge` | sightline | `place.imperial-fringe.glenbridge-sermon-xanmeer` | 133 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | sightline | `place.imperial-fringe.glenbridge` | 133 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | bound | `place.imperial-fringe.glenbridge` | 133 | — |
| `place.imperial-fringe.hearth-house-of-the-burnt-field` | bound | `place.imperial-fringe.cartwrights-cross` | 406 | — |
| `place.imperial-fringe.ridge-runners-post` | sightline | `place.imperial-fringe.ashen-tower` | 920 | True |
| `place.imperial-fringe.slough-point-quarantine-shed` | bound | `place.imperial-fringe.slough-point` | 73 | — |
| `place.imperial-fringe.the-drowning-gate` | sightline | `place.imperial-fringe.the-embankment-that-drowned` | 1453 | True |
| `place.imperial-fringe.the-embankment-that-drowned` | sightline | `place.imperial-fringe.the-drowning-gate` | 1453 | True |
| `place.imperial-fringe.the-marble-field` | sightline | `place.imperial-fringe.gideon` | 369 | True |
| `place.imperial-fringe.the-ring-of-nine-wells` | sightline | `place.imperial-fringe.twyllbek-ruins` | 575 | True |
| `place.imperial-fringe.the-shut-door` | sightline | `place.imperial-fringe.the-kept-terrace` | 1002 | True |
| `place.imperial-fringe.the-snowline-cell` | sightline | `place.imperial-fringe.ridge-runners-post` | 1270 | True |
| `place.imperial-fringe.the-stone-talkers-watch` | sightline | `place.imperial-fringe.rockgrove` | 546 | True |
| `place.imperial-fringe.the-two-lamps-hermitage` | sightline | `place.imperial-fringe.the-lamp-at-the-ford` | 1158 | True |
| `place.imperial-fringe.twyllbek-crown` | sightline | `place.imperial-fringe.twyllbek-ruins` | 333 | True |
| `place.imperial-penal-south.blackrose-prison` | bound | `place.imperial-penal-south.blackrose` | 141 | — |
| `place.mercantile-coast.soulrest-breaking-yard` | bound | `place.mercantile-coast.soulrest` | 224 | — |
| `place.saxhleel-coast.archon-harbour-hist` | bound | `place.saxhleel-coast.archon` | 220 | — |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | bound | `place.saxhleel-coast.archon` | 365 | — |

## Records placed from the homeless batch

| record | stage | site |
|---|---|---|
| `place.dunmer-north.channel-cross-village` | spacing-3/4 | site.scour.lake-standing-water.saddle-059 |
| `place.dunmer-north.draws-the-herds` | spacing-3/4 | site.free.any-firm-ground-0217 |
| `place.dunmer-north.greylight-village` | spacing-1/2 | site.free.roadside-0133 |
| `place.dunmer-north.hatching-pools` | spacing-3/4 | site.free.roadside-0549 |
| `place.dunmer-north.keeps-the-second-island` | spacing-1/2 | site.free.any-firm-ground-0177 |
| `place.dunmer-north.murkwater` | spacing-1/2 | site.free.roadside-0540 |
| `place.dunmer-north.murkwater-shadowscale-ground` | spacing-1/2 | site.free.any-firm-ground-0046 |
| `place.dunmer-north.names-the-year` | neighbour-zone | site.free.any-firm-ground-0093 |
| `place.dunmer-north.one-house-high` | spacing-3/4 | site.free.any-firm-ground-0247 |
| `place.dunmer-north.reedmoor-stilts` | spacing-3/4 | site.scour.mangrove-forest.island-021 |
| `place.dunmer-north.riverwalk` | spacing-1/2 | site.free.any-shallow-marsh-0225 |
| `place.dunmer-north.saltmarch-village` | neighbour-zone | site.free.any-firm-ground-0058 |
| `place.dunmer-north.sings-for-the-pipes` | neighbour-zone | site.scour.seasonal-floodplain.saddle-052 |
| `place.dunmer-north.sits-above-the-flood` | spacing-3/4 | site.free.roadside-0564 |
| `place.dunmer-north.stands-on-the-island` | spacing-1/2 | site.free.roadside-0071 |
| `place.dunmer-north.the-diggings-ladder` | spacing-3/4 | site.scour.mangrove-forest.island-023 |
| `place.dunmer-north.the-divers-landing` | spacing-3/4 | site.scour.lake-standing-water.saddle-009 |
| `place.dunmer-north.the-field-gate-garrison` | neighbour-zone | site.scour.border-mountains.ridge-end-056 |
| `place.dunmer-north.the-gravel-six` | spacing-3/4 | site.free.any-firm-ground-0303 |
| `place.dunmer-north.the-shut-village` | neighbour-zone | site.free.roadside-0188 |
| `place.dunmer-north.the-thorn-bond` | neighbour-zone | site.free.any-firm-ground-0132 |
| `place.dunmer-north.the-white-pans` | spacing-3/4 | site.scour.ocean.cove-068 |
| `place.dunmer-north.three-ways-over-water` | spacing-3/4 | site.free.roadside-0059 |
| `place.dunmer-north.wolk-market` | spacing-1/2 | site.scour.firm-lowland.saddle-016 |
| `place.hist-heartland.blackguard-hideout-raw` | neighbour-zone | site.scour.rootland-deep-marsh.island-033 |
| `place.hist-heartland.boardwalk-branching-many-ways` | neighbour-zone | site.free.roadside-0390 |
| `place.hist-heartland.broken-xanmeer-subsumed` | neighbour-zone | site.free.roadside-0409 |
| `place.hist-heartland.hammock-tree-island-greenmoss` | spacing-3/4 | site.free.any-firm-ground-0345 |
| `place.hist-heartland.legendary-deep-medusa-wood` | neighbour-zone | site.free.any-shallow-marsh-0273 |
| `place.hist-heartland.miregaunt-ward-approach` | neighbour-zone | site.free.any-shallow-marsh-0470 |
| `place.hist-heartland.poacher-camp-sap` | neighbour-zone | site.free.any-shallow-marsh-0400 |
| `place.hist-heartland.root-gallery-collapsed-nine` | neighbour-zone | site.free.any-shallow-marsh-0524 |
| `place.hist-heartland.root-gallery-drowned-stair` | neighbour-zone | site.free.any-firm-ground-0806 |
| `place.hist-heartland.root-gallery-lantern-hollow` | neighbour-zone | site.free.any-shallow-marsh-0444 |
| `place.hist-heartland.rootworm-station-helstrom` | neighbour-zone | site.scour.firm-lowland.flood-high-024 |
| `place.hist-heartland.sap-tapping-licensed` | spacing-1/2 | site.free.any-shallow-marsh-0684 |
| `place.hist-heartland.stilt-channel-edge-uxaneet` | neighbour-zone | site.scour.interior-swamp.cove-011 |
| `place.imperial-fringe.bog-iron-workings` | spacing-3/4 | site.free.any-firm-ground-0728 |
| `place.imperial-fringe.bonded-shed-of-the-onkobra` | spacing-3/4 | site.free.roadside-0374 |
| `place.imperial-fringe.cartwrights-cross` | neighbour-zone | site.free.any-firm-ground-0791 |
| `place.imperial-fringe.cassian-farm` | spacing-1/2 | site.free.roadside-0249 |
| `place.imperial-fringe.claywater-station` | spacing-1/2 | site.free.any-firm-ground-0368 |
| `place.imperial-fringe.comes-back-slowly` | neighbour-zone | site.free.any-firm-ground-0696 |
| `place.imperial-fringe.fig-market` | spacing-1/2 | site.free.any-firm-ground-1044 |
| `place.imperial-fringe.glenbridge` | neighbour-zone | site.free.any-firm-ground-0894 |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | neighbour-zone | site.free.any-firm-ground-0858 |
| `place.imperial-fringe.guar-holding-of-the-nine-bells` | neighbour-zone | site.free.any-firm-ground-0793 |
| `place.imperial-fringe.hearth-house-of-the-burnt-field` | spacing-3/4 | site.free.any-firm-ground-0700 |
| `place.imperial-fringe.highwater-hamlet` | spacing-3/4 | site.free.roadside-0237 |
| `place.imperial-fringe.ladder-to-the-light` | spacing-3/4 | site.free.any-shallow-marsh-0415 |
| `place.imperial-fringe.lower-onkobra-paddies` | spacing-3/4 | site.free.any-firm-ground-0490 |
| `place.imperial-fringe.lowmere-raft-town` | spacing-1/2 | site.free.roadside-0256 |
| `place.imperial-fringe.moonmarch-ground` | neighbour-zone | site.free.any-firm-ground-0538 |
| `place.imperial-fringe.nine-arch-stage` | spacing-3/4 | site.free.roadside-0219 |
| `place.imperial-fringe.ninth-milestone-house` | neighbour-zone | site.free.any-firm-ground-0385 |
| `place.imperial-fringe.open-door-at-the-saddle` | neighbour-zone | site.free.roadside-0287 |
| `place.imperial-fringe.red-cart-yard` | spacing-1/2 | site.scour.firm-lowland.waterfall-041 |
| `place.imperial-fringe.reedcutters-toll` | spacing-1/2 | site.free.roadside-0292 |
| `place.imperial-fringe.saddle-fair` | neighbour-zone | site.scour.upland-hills.ravine-024 |
| `place.imperial-fringe.slough-point-quarantine-shed` | neighbour-zone | site.free.roadside-0208 |
| `place.imperial-fringe.swampmoth-town` | spacing-3/4 | site.scour.upland-hills.land-bridge-000 |
| `place.imperial-fringe.the-drowned-furrow` | spacing-3/4 | site.scour.firm-lowland.gorge-031 |
| `place.imperial-fringe.the-drowning-gate` | neighbour-zone | site.free.any-firm-ground-1071 |
| `place.imperial-fringe.the-embankment-that-drowned` | neighbour-zone | site.scour.border-mountains.ridge-end-040 |
| `place.imperial-fringe.the-empty-steading` | spacing-3/4 | site.free.any-firm-ground-0638 |
| `place.imperial-fringe.the-lake-divers-yard` | spacing-1/2 | site.scour.lake-standing-water.box-canyon-010 |
| `place.imperial-fringe.the-old-quarters` | spacing-3/4 | site.free.any-firm-ground-0520 |
| `place.imperial-fringe.the-second-hearth` | spacing-1/2 | site.free.any-firm-ground-0546 |
| `place.imperial-fringe.the-vellum-estate` | spacing-1/2 | site.free.any-firm-ground-0488 |
| `place.imperial-fringe.watch-of-the-weighed-cart` | spacing-3/4 | site.free.any-firm-ground-0662 |
| `place.imperial-fringe.westfield-village` | spacing-3/4 | site.free.roadside-0289 |
| `place.imperial-penal-south.bramman-head` | region-relaxed | site.scour.deep-river-corridor.land-bridge-036 |
| `place.imperial-penal-south.lake-submerged-xanmeer` | neighbour-zone | site.scour.lake-standing-water.islet-033 |
| `place.imperial-penal-south.lilmothiit-quarry` | neighbour-zone | site.free.any-firm-ground-1339 |
| `place.imperial-penal-south.rockspring` | spacing-1/2 | site.scour.firm-lowland.flood-high-010 |
| `place.imperial-penal-south.west-market-town` | spacing-3/4 | site.free.any-firm-ground-1255 |
| `place.mercantile-coast.ashroot-village` | spacing-3/4 | site.free.any-firm-ground-0982 |
| `place.mercantile-coast.bereaved-village-murkmire` | spacing-3/4 | site.free.any-firm-ground-1300 |
| `place.mercantile-coast.hammock-village-murkmire` | spacing-3/4 | site.free.any-firm-ground-1340 |
| `place.mercantile-coast.head-of-tide` | spacing-3/4 | site.free.any-firm-ground-0990 |
| `place.mercantile-coast.hereguard-plantation` | neighbour-zone | site.free.any-firm-ground-1355 |
| `place.mercantile-coast.hist-village-keel-sakka` | spacing-3/4 | site.free.any-firm-ground-1090 |
| `place.mercantile-coast.keel-sakka-stilts` | neighbour-zone | site.free.any-shallow-marsh-1170 |
| `place.mercantile-coast.naga-village-oliis` | spacing-3/4 | site.free.any-firm-ground-1173 |
| `place.mercantile-coast.necropolis-village-murkmire` | spacing-3/4 | site.free.roadside-0499 |
| `place.mercantile-coast.oliis-boardwalk` | spacing-3/4 | site.free.any-shallow-marsh-1315 |
| `place.mercantile-coast.screen-watch` | spacing-1/2 | site.free.roadside-0035 |
| `place.mercantile-coast.stripped-village-north` | neighbour-zone | site.free.roadside-0500 |
| `place.mercantile-coast.topal-salt-pans` | neighbour-zone | site.scour.ocean.natural-harbour-006 |
| `place.naga-kur-deeps.beast-keeper-crocodile` | spacing-3/4 | site.free.any-shallow-marsh-1209 |
| `place.naga-kur-deeps.dive-shaft-natural-deeps` | spacing-3/4 | site.scour.lake-standing-water.cove-008 |
| `place.naga-kur-deeps.drifting-village-wet-mooring` | spacing-3/4 | site.free.any-shallow-marsh-1168 |
| `place.naga-kur-deeps.drowned-village-lake-deeps` | neighbour-zone | site.free.roadside-0041 |
| `place.naga-kur-deeps.legendary-deep-feather-serpent` | neighbour-zone | site.free.any-shallow-marsh-1191 |
| `place.naga-kur-deeps.naga-village-raiding` | neighbour-zone | site.free.any-shallow-marsh-1108 |
| `place.naga-kur-deeps.portage-slipway-narrows-deeps` | neighbour-zone | site.free.any-firm-ground-1137 |
| `place.naga-kur-deeps.raft-village-lashed` | spacing-3/4 | site.free.roadside-0425 |
| `place.naga-kur-deeps.voriplasm-chamber-breached` | neighbour-zone | site.free.any-shallow-marsh-1162 |
| `place.pirate-freeholds.freehold-market` | neighbour-zone | site.free.any-firm-ground-0281 |
| `place.pirate-freeholds.rim-keystone-chamber` | neighbour-zone | site.free.any-firm-ground-0230 |
| `place.pirate-freeholds.rim-snowline-hermitage` | neighbour-zone | site.scour.border-mountains.summit-005 |

## Dangling relations: 83 edges point at deferred/cut/unknown records

(Part 4 catalogue work: promote the depended-upon record or prune the edge. First 40:)

- `place.dunmer-north.bogmother`.reachedVia → `route.bogmother-causeway` (unknown id)
- `place.dunmer-north.hatching-pools`.patrols → `route.road.alten-corimont-stormhold` (unknown id)
- `place.dunmer-north.hixinoag`.dependsOn → `route.northern-caravan` (unknown id)
- `place.dunmer-north.riverwalk`.tolls → `route.road.stormhold-thorn` (unknown id)
- `place.dunmer-north.stillrise-village`.reachedVia → `route.shadowfen-paths` (unknown id)
- `place.dunmer-north.stormhold`.tolls → `route.boat.stormhold-alten-corimont` (unknown id)
- `place.dunmer-north.stormhold`.reachedVia → `route.northern-river` (unknown id)
- `place.dunmer-north.stormhold`.reachedVia → `route.tear-road` (unknown id)
- `place.dunmer-north.tear-road-stage`.dependsOn → `route.tear-road` (unknown id)
- `place.dunmer-north.the-ash-holding`.reachedVia → `route.tear-road` (unknown id)
- `place.dunmer-north.the-borrowed-tomb`.reachedVia → `route.tear-road` (unknown id)
- `place.dunmer-north.the-cold-holding`.reachedVia → `route.tear-road` (unknown id)
- `place.dunmer-north.the-delta-byre`.supplies → `route.tear-road` (unknown id)
- `place.dunmer-north.the-drover-camp`.patrols → `route.road.thorn-tear-road` (unknown id)
- `place.dunmer-north.the-field-gate-garrison`.patrols → `route.road.thorn-tear-road` (unknown id)
- `place.dunmer-north.the-monsoon-boom`.dependsOn → `route.tear-road` (unknown id)
- `place.dunmer-north.the-north-border-post`.patrols → `route.road.thorn-tear-road` (unknown id)
- `place.dunmer-north.the-north-vista`.reachedVia → `route.tear-road` (unknown id)
- `place.dunmer-north.the-opened-terrace`.reachedVia → `route.shadowfen-paths` (unknown id)
- `place.dunmer-north.the-pass-station`.dependsOn → `route.tear-road` (unknown id)
- `place.dunmer-north.the-pen-yard`.reachedVia → `route.tear-road` (unknown id)
- `place.dunmer-north.the-salt-and-shell`.dependsOn → `route.tear-road` (unknown id)
- `place.dunmer-north.the-shut-village`.reachedVia → `route.shadowfen-paths` (unknown id)
- `place.dunmer-north.the-stripped-village`.reachedVia → `route.shadowfen-paths` (unknown id)
- `place.dunmer-north.the-two-gate-bridge`.tolls → `route.road.thorn-tear-road` (unknown id)
- `place.dunmer-north.the-xanmeer-hold`.patrols → `route.road.alten-corimont-stormhold` (unknown id)
- `place.dunmer-north.thorn`.tolls → `route.road.thorn-tear-road` (unknown id)
- `place.dunmer-north.thorn`.reachedVia → `route.northern-trunk` (unknown id)
- `place.dunmer-north.thorn`.reachedVia → `route.tear-road` (unknown id)
- `place.hist-heartland.helstrom`.reachedVia → `escorted boat convoy from Alten Corimont` (unknown id)
- `place.hist-heartland.helstrom`.reachedVia → `root transit (semi-public hub)` (unknown id)
- `place.imperial-fringe.ashen-tower`.patrols → `route.road.gideon-blackwood-road` (unknown id)
- `place.imperial-fringe.cartwrights-cross`.tolls → `route.road.gideon-blackwood-road` (unknown id)
- `place.imperial-fringe.cartwrights-cross`.tolls → `route.road.gideon-stormhold` (unknown id)
- `place.imperial-fringe.castle-giovesse`.reachedVia → `route.gideon-north-track` (unknown id)
- `place.imperial-fringe.claywater-station`.dependsOn → `route.blackwood-road` (unknown id)
- `place.imperial-fringe.fort-swampmoth`.dependsOn → `route.blackwood-road` (unknown id)
- `place.imperial-fringe.fort-swampmoth`.tolls → `route.road.gideon-blackwood-road` (unknown id)
- `place.imperial-fringe.gideon`.reachedVia → `route.blackwood-road` (unknown id)
- `place.imperial-fringe.glenbridge`.reachedVia → `route.pilgrim-way-blackwood` (unknown id)

## Landforms used

any-firm-ground 232, any-shallow-marsh 81, ridge-end 27, flood-high 19, cliff-bench 16, ravine 15, gorge 13, islet 13, summit 13, cove 10, anchor 9, island 9, saddle 9, box-canyon 8, spring-head 8, water-narrows 8, land-bridge 7, waterfall 7, river-mouth 5, ford 4, oxbow 4, sinkhole 3, enclosed-clearing 2, isthmus 2, any-channel-bank 1, headland 1, natural-harbour 1

## Homeless batch (unresolved)

- none: every live record found ground

## Tier 0–1 placements

| record | site | landform | region | why |
|---|---|---|---|---|
| `place.dunmer-north.bogmother` | site.scour.firm-lowland.summit-020 | summit | firm lowland | summit in firm lowland (danger band 2), 143 m from the nearest route; its choice #2 landform; won on landform, route, danger. |
| `place.dunmer-north.gandranen-library` | site.scour.fringe-marsh.cliff-bench-053 | cliff-bench | fringe marsh | cliff bench in fringe marsh (danger band 3), 621 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote. |
| `place.dunmer-north.gandranen-ruins` | site.scour.upland-hills.ridge-end-032 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 939 m from the nearest route; its first-choice landform; won on landform, region, remote. |
| `place.dunmer-north.hatching-pools` | site.free.roadside-0549 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 3), 16 m from the nearest route; at the water's edge; no free 'spring-head' site was left in the zone, so plain ground; won on region, parent, landform; placed from the homeless batch at stage 'spacing-3/4'. |
| `place.dunmer-north.hissmir` | site.free.any-firm-ground-0137 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 402 m from the nearest route; its first-choice landform; won on landform, region, parent. |
| `place.dunmer-north.hixinoag` | site.free.any-firm-ground-0320 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 63 m from the nearest route; at the water's edge; no free 'oxbow' site was left in the zone, so plain ground; won on region, landform, parent. |
| `place.dunmer-north.hutan-tzel` | site.scour.firm-lowland.spring-head-038 | spring-head | firm lowland | spring head in firm lowland (danger band 2), 50 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |
| `place.dunmer-north.loriasel-caverns` | site.scour.upland-hills.spring-head-015 | spring-head | upland hills | spring head in upland hills (danger band 3), 777 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, remote. |
| `place.dunmer-north.mazzatun` | site.scour.upland-hills.ridge-end-066 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 246 m from the nearest route; its first-choice landform; won on landform, region, danger. |
| `place.dunmer-north.mazzatun-hist` | site.free.any-firm-ground-0220 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 389 m from the nearest route; its choice #3 landform; won on bound, landform, danger. |
| `place.dunmer-north.stillrise-village` | site.scour.lake-standing-water.box-canyon-042 | box-canyon | lake & standing water | box canyon in lake & standing water (danger band 5), 1285 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, remote, parent. |
| `place.dunmer-north.stormhold` | anchor.stormhold | anchor | firm lowland | Owner-approved settlement anchor 'stormhold' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.ten-maur-wolk` | site.scour.fringe-marsh.box-canyon-046 | box-canyon | fringe marsh | box canyon in fringe marsh (danger band 3), 103 m from the nearest route; at the water's edge; its first-choice landform; won on landform, route, region. |
| `place.dunmer-north.thorn` | anchor.thorn | anchor | firm lowland | Owner-approved settlement anchor 'thorn' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.wolk-market` | site.scour.firm-lowland.saddle-016 | saddle | firm lowland | saddle in firm lowland (danger band 3), 215 m from the nearest route; at the water's edge; won on sightline, region, parent; placed from the homeless batch at stage 'spacing-1/2'. |
| `place.hist-heartland.bereaved-mnemic` | site.scour.fringe-marsh.flood-high-036 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 186 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.cult-raid-camp-unbound` | site.scour.firm-lowland.flood-high-031 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 332 m from the nearest route; its choice #4 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.greenspring` | site.scour.fringe-marsh.flood-high-039 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 128 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.guide-camp-gate-side` | site.scour.rootland-deep-marsh.islet-001 | islet | rootland deep marsh | islet in rootland deep marsh (danger band 5), 722 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.helstrom` | anchor.helstrom | anchor | lake & standing water | Owner-approved settlement anchor 'helstrom' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.hist-heartland.heretic-stone-restarted` | site.scour.upland-hills.ridge-end-049 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 182 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.hist-agaceph-needle` | site.scour.tropical-jungle.spring-head-043 | spring-head | tropical jungle | spring head in tropical jungle (danger band 4), 625 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.hist-first-rain-trunk` | site.scour.rootland-deep-marsh.island-034 | island | rootland deep marsh | island in rootland deep marsh (danger band 5), 311 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.hist-paatru-lowcrown` | site.scour.rootland-deep-marsh.spring-head-041 | spring-head | rootland deep marsh | spring head in rootland deep marsh (danger band 4), 11 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.hist-sarpa-highflower` | site.scour.rootland-deep-marsh.spring-head-042 | spring-head | rootland deep marsh | spring head in rootland deep marsh (danger band 5), 126 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.lost-city` | site.scour.tropical-jungle.summit-019 | summit | tropical jungle | summit in tropical jungle (danger band 4), 879 m from the nearest route; its choice #4 landform; won on route, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.nightbound-lightless` | site.scour.rootland-deep-marsh.gorge-007 | gorge | rootland deep marsh | gorge in rootland deep marsh (danger band 4), 420 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.refuge-station-interior` | site.scour.rootland-deep-marsh.cliff-bench-064 | cliff-bench | rootland deep marsh | cliff bench in rootland deep marsh (danger band 5), 581 m from the nearest route; at the water's edge; its choice #3 landform; won on remote, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.root-gallery-cult-warren` | site.free.any-firm-ground-0948 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 652 m from the nearest route; its choice #5 landform; won on region, remote, landform; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.root-gallery-helstrom-underway` | site.scour.rootland-deep-marsh.ravine-015 | ravine | rootland deep marsh | ravine in rootland deep marsh (danger band 3), 17 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.root-talk-ground` | site.scour.rootland-deep-marsh.enclosed-clearing-000 | enclosed-clearing | rootland deep marsh | enclosed clearing in rootland deep marsh (danger band 5), 88 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.rootworm-station-helstrom` | site.scour.firm-lowland.flood-high-024 | flood-high | firm lowland | flood high in firm lowland (danger band 5), 51 m from the nearest route; its first-choice landform; won on landform, bound, region; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.sap-collection-facility-daedric` | site.free.any-shallow-marsh-0390 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 323 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, remote, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.sealed-xanmeer-living` | site.free.any-shallow-marsh-0425 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 445 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, remote, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.stone-calendar-hist-tsoko` | site.scour.firm-lowland.summit-033 | summit | firm lowland | summit in firm lowland (danger band 3), 685 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.umpholo-mission` | site.free.any-firm-ground-0478 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 4), 499 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.xal-krona-making-ground` | site.free.any-shallow-marsh-0531 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 5), 396 m from the nearest route; its choice #3 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.xal-meeruth-station` | site.free.roadside-0327 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 56 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.xanmeer-fort-defences-working` | site.scour.fringe-marsh.summit-048 | summit | fringe marsh | summit in fringe marsh (danger band 3), 209 m from the nearest route; its choice #2 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-fringe.castle-giovesse` | site.scour.upland-hills.summit-025 | summit | upland hills | summit in upland hills (danger band 3), 298 m from the nearest route; its first-choice landform; won on landform, route, sightline. |
| `place.imperial-fringe.fort-swampmoth` | site.scour.upland-hills.ridge-end-022 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 626 m from the nearest route; its first-choice landform; won on landform, sightline, region. |
| `place.imperial-fringe.gideon` | anchor.gideon | anchor | firm lowland | Owner-approved settlement anchor 'gideon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-fringe.gideon-rootworm-terminus` | site.free.any-firm-ground-0632 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 233 m from the nearest route; at the water's edge; its choice #4 landform; won on bound, landform, region. |
| `place.imperial-fringe.glenbridge` | site.free.any-firm-ground-0894 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 1064 m from the nearest route; its choice #3 landform; won on landform, region, parent; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | site.free.any-firm-ground-0858 | any-firm-ground | border mountains | firm ground in border mountains (danger band 3), 1105 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on bound, sightline, danger; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.imperial-fringe.orma-tactile-ruin` | site.scour.border-mountains.box-canyon-039 | box-canyon | border mountains | box canyon in border mountains (danger band 3), 967 m from the nearest route; its first-choice landform; won on landform, remote, region. |
| `place.imperial-fringe.rockgrove` | site.scour.upland-hills.ridge-end-025 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1190 m from the nearest route; its choice #2 landform; won on landform, region, remote. |
| `place.imperial-fringe.slough-point` | site.scour.firm-lowland.water-narrows-020 | water-narrows | firm lowland | water narrows in firm lowland (danger band 2), 6 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, parent. |
| `place.imperial-fringe.stonewastes` | site.free.any-firm-ground-0440 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 456 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on region, parent, landform. |
| `place.imperial-fringe.the-silent-halls` | site.free.any-firm-ground-0864 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 462 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, submerged, remote. |
| `place.imperial-fringe.the-stone-talkers-watch` | site.scour.upland-hills.ridge-end-055 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1018 m from the nearest route; its choice #2 landform; won on landform, sightline, region. |
| `place.imperial-penal-south.blackrose` | anchor.blackrose | anchor | fringe marsh | Owner-approved settlement anchor 'blackrose' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-penal-south.blackrose-drowned-hist` | site.scour.lake-standing-water.islet-038 | islet | lake & standing water | islet in lake & standing water (danger band 3), 256 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.blackrose-prison` | site.scour.firm-lowland.flood-high-000 | flood-high | firm lowland | flood high in firm lowland (danger band 2), 140 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.bramman-head` | site.scour.deep-river-corridor.land-bridge-036 | land-bridge | deep river corridor | land bridge in deep river corridor (danger band 3), 604 m from the nearest route; at the water's edge; won on region, danger, parent; placed from the homeless batch at stage 'region-relaxed'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.chainbreaker-shelter` | site.free.any-firm-ground-1359 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 93 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.flu-quarantine-village` | site.scour.fringe-marsh.island-005 | island | fringe marsh | island in fringe marsh (danger band 3), 546 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lake-submerged-xanmeer` | site.scour.lake-standing-water.islet-033 | islet | lake & standing water | islet in lake & standing water (danger band 3), 172 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lilmothiit-quarry` | site.free.any-firm-ground-1339 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 285 m from the nearest route; no free 'ravine' site was left in the zone, so plain ground; won on region, parent, landform; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.longmont` | site.scour.lake-standing-water.cove-052 | cove | lake & standing water | cove in lake & standing water (danger band 3), 110 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.murkwood-verge` | site.scour.firm-lowland.flood-high-018 | flood-high | firm lowland | flood high in firm lowland (danger band 3), 392 m from the nearest route; its choice #2 landform; won on landform, route, remote; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.rose-flooded-passage` | site.scour.lake-standing-water.cove-066 | cove | lake & standing water | cove in lake & standing water (danger band 4), 491 m from the nearest route; at the water's edge; won on region, submerged, remote; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.rose-supply-town` | site.scour.fringe-marsh.ford-030 | ford | fringe marsh | ford in fringe marsh (danger band 2), 61 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.three-gate-toll` | site.scour.fringe-marsh.ford-047 | ford | fringe marsh | ford in fringe marsh (danger band 2), 106 m from the nearest route; at the water's edge; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.west-market-town` | site.free.any-firm-ground-1255 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 23 m from the nearest route; at the water's edge; its choice #4 landform; won on route, landform, region; placed from the homeless batch at stage 'spacing-3/4'; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.alten-meerhleel` | site.free.any-shallow-marsh-1322 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 2), 186 m from the nearest route; at the water's edge; no free 'natural-harbour' site was left in the zone, so plain ground; won on region, parent, navigable; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bramman-screen` | site.free.any-shallow-marsh-1215 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 3), 88 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bright-throat-village` | site.free.any-shallow-marsh-1121 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 439 m from the nearest route; no free 'cliff-bench' site was left in the zone, so plain ground; won on region, parent, landform; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.chasepoint` | site.free.roadside-0016 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 38 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.inhabited-meer-murkmire` | site.scour.fringe-marsh.flood-high-040 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 269 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.ixtaxh-xanmeer` | site.scour.lake-standing-water.islet-004 | islet | lake & standing water | islet in lake & standing water (danger band 3), 846 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.lilmoth` | anchor.lilmoth | anchor | firm lowland | Owner-approved settlement anchor 'lilmoth' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.rockpark` | site.free.any-firm-ground-1017 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 714 m from the nearest route; its choice #2 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.slaughter-memorial` | site.free.any-firm-ground-1258 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 1), 50 m from the nearest route; its choice #3 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.soulrest` | anchor.soulrest | anchor | fringe marsh | Owner-approved settlement anchor 'soulrest' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.teeth-of-sithis` | site.scour.tropical-jungle.summit-049 | summit | tropical jungle | summit in tropical jungle (danger band 4), 593 m from the nearest route; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.white-rose-prison` | site.scour.firm-lowland.flood-high-007 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 167 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.xinchei-konu` | site.scour.firm-lowland.summit-029 | summit | firm lowland | summit in firm lowland (danger band 2), 377 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.bereaved-hist-less-since` | site.free.any-firm-ground-1130 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 4), 449 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, ring; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.dead-water-village` | site.free.any-firm-ground-0984 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 774 m from the nearest route; its choice #3 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.deepmire-refuge` | site.scour.interior-swamp.flood-high-029 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 568 m from the nearest route; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.ferry-stage-guide-hire` | site.free.any-shallow-marsh-1250 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 2), 113 m from the nearest route; at the water's edge; no free 'water-narrows' site was left in the zone, so plain ground; won on region, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.harmed-hist-enslaved` | site.scour.rootland-deep-marsh.flood-high-037 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 719 m from the nearest route; its choice #2 landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | site.free.roadside-0251 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 71 m from the nearest route; at the water's edge; no free 'confluence' site was left in the zone, so plain ground; won on region, danger, water; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.naga-village-settled` | site.free.any-shallow-marsh-1247 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 280 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-gallery-blight-warren` | site.scour.rootland-deep-marsh.flood-high-026 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 544 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-whisper-village` | site.scour.lake-standing-water.enclosed-clearing-002 | enclosed-clearing | lake & standing water | enclosed clearing in lake & standing water (danger band 4), 272 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.sithis-temple-mass-sacrifice` | site.scour.rootland-deep-marsh.flood-high-023 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 491 m from the nearest route; its choice #3 landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.umbriel-stripped-undead` | site.scour.interior-swamp.flood-high-017 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 151 m from the nearest route; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.wild-hist-rogue-deeps` | site.scour.interior-swamp.island-007 | island | interior swamp | island in interior swamp (danger band 4), 639 m from the nearest route; at the water's edge; its choice #3 landform; won on remote, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.pirate-freeholds.alten-corimont` | anchor.alten-corimont | anchor | firm lowland | Owner-approved settlement anchor 'alten-corimont' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.pirate-freeholds.chasecreek` | site.free.any-firm-ground-0178 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 354 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, parent, route. |
| `place.pirate-freeholds.corimont-hist-less-camp` | site.free.any-firm-ground-0276 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 412 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent. |
| `place.pirate-freeholds.rockpoint` | site.scour.seasonal-floodplain.cliff-bench-002 | cliff-bench | seasonal floodplain | cliff bench in seasonal floodplain (danger band 3), 52 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.archon` | anchor.archon | anchor | mangrove forest | Owner-approved settlement anchor 'archon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.saxhleel-coast.archon-harbour-hist` | site.free.any-firm-ground-0956 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 51 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, parent. |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | site.free.any-firm-ground-1013 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 313 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on bound, region, parent. |
| `place.saxhleel-coast.cantemir-headland` | site.free.any-firm-ground-1039 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 709 m from the nearest route; no free 'headland' site was left in the zone, so plain ground; won on remote, danger, parent. |
| `place.saxhleel-coast.east-estuary-rootworm-station` | site.free.any-firm-ground-1014 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 143 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | site.scour.tropical-jungle.water-narrows-040 | water-narrows | tropical jungle | water narrows in tropical jungle (danger band 4), 782 m from the nearest route; at the water's edge; won on remote, submerged, danger. |
| `place.saxhleel-coast.portdun-mont` | site.free.any-firm-ground-1069 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 213 m from the nearest route; at the water's edge; no free 'cliff-bench' site was left in the zone, so plain ground; won on region, parent, ring. |
| `place.saxhleel-coast.seafalls` | site.scour.tropical-jungle.water-narrows-009 | water-narrows | tropical jungle | water narrows in tropical jungle (danger band 2), 172 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |

## Owner-feedback checks (Part 4 step 2)

- stances: {'friendly': 77, 'wary': 97, 'hostile': 68, 'guarded': 51, 'neutral': 209, 'sanctuary': 25}
- swap pass exchanged 132 sites
- delves/combat places (D3+) with no friendly/sanctuary rest within 600 m (1200 m in D4–D5): 1

| city | purposes in 2 km | missing core purposes | hostile in 2 km | edge / hinterland / rural counts |
|---|---|---|---|---|
| stormhold | 13 | — | 16 | 12 / 56 / 107 |
| thorn | 13 | — | 11 | 7 / 58 / 52 |
| gideon | 13 | — | 20 | 16 / 78 / 105 |
| helstrom | 12 | — | 24 | 4 / 32 / 230 |
| archon | 12 | — | 14 | 4 / 27 / 73 |
| blackrose | 13 | — | 15 | 6 / 48 / 86 |
| lilmoth | 12 | resource-source | 10 | 6 / 34 / 77 |
| soulrest | 12 | — | 7 | 4 / 30 / 62 |
| alten-corimont | 13 | — | 22 | 6 / 71 / 127 |

Rest-cadence gaps (add a rest or soften): `place.dunmer-north.the-wild-mouth` (1409 m)
