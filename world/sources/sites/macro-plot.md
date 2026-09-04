# Macro plot — coverage report (Phase 11 Part 3)

Seed 1103. Supply: 1172 scour sites + 2001 free-ground points. Demand: 557 live records; **557 plotted**, 0 unresolved.
Placed from the homeless batch: {'spacing-1/2': 12, 'spacing-3/4': 29, 'neighbour-zone': 69, 'relaxed-score': 1}.

| zone | live | plotted | homeless | landform wishes from recipe | top landforms |
|---|---|---|---|---|---|
| dunmer-north | 125 | 125 | 0 | 0 | any-firm-ground 61, cliff-bench 12, ridge-end 9, ravine 8 |
| hist-heartland | 112 | 112 | 0 | 0 | any-firm-ground 41, any-shallow-marsh 33, flood-high 5, summit 5 |
| imperial-fringe | 115 | 115 | 0 | 0 | any-firm-ground 72, ridge-end 10, ravine 6, gorge 5 |
| imperial-penal-south | 44 | 44 | 0 | 43 | any-firm-ground 15, any-shallow-marsh 9, ford 5, cove 3 |
| mercantile-coast | 64 | 64 | 0 | 64 | any-firm-ground 29, any-shallow-marsh 12, flood-high 6, cove 4 |
| naga-kur-deeps | 41 | 41 | 0 | 40 | any-shallow-marsh 23, flood-high 7, any-firm-ground 4, cove 2 |
| pirate-freeholds | 31 | 31 | 0 | 0 | any-firm-ground 23, ridge-end 2, anchor 1, cliff-bench 1 |
| saxhleel-coast | 25 | 25 | 0 | 0 | any-shallow-marsh 9, any-firm-ground 7, river-mouth 2, anchor 1 |

## Spacing and routes

- nearest-neighbour distance p5 / median / p95: 82 / 177 / 300 m
- same-type pairs closer than 300 m: 3
- median distance to a route: 214 m; fine-tempo records within 300 m of a route: 71 %
- route-visibility sweep (364 samples every 150 m, radius 450 m): mean 3.7 destination/landmark places in sight; dead 5 %, crowded (4+) 50 %

## Anti-sameyness quota (no type > 25 % of a zone)

- none

## Named constraints (sightline / bound), as plotted

| record | kind | to | m | line of sight |
|---|---|---|---|---|
| `place.dunmer-north.gandranen-library` | bound | `place.dunmer-north.gandranen-ruins` | 67 | — |
| `place.dunmer-north.mazzatun-hist` | bound | `place.dunmer-north.mazzatun` | 204 | — |
| `place.dunmer-north.murkwater-shadowscale-ground` | bound | `place.dunmer-north.murkwater` | 230 | — |
| `place.dunmer-north.stormhold-causeway` | bound | `place.dunmer-north.stormhold` | 245 | — |
| `place.dunmer-north.the-black-stage` | bound | `place.dunmer-north.stormhold-causeway` | 64 | — |
| `place.dunmer-north.the-crown-terrace` | bound | `place.dunmer-north.stands-on-the-island` | 560 | — |
| `place.dunmer-north.the-drawdown-flats` | bound | `place.dunmer-north.the-drowned-terrace` | 4283 | — |
| `place.dunmer-north.the-first-count` | sightline | `place.dunmer-north.stormhold` | 216 | True |
| `place.dunmer-north.the-flu-cordon` | sightline | `place.dunmer-north.stillrise-village` | 280 | True |
| `place.dunmer-north.the-north-vista` | sightline | `place.dunmer-north.the-pass-station` | 775 | True |
| `place.dunmer-north.the-outer-silyanorn` | sightline | `place.dunmer-north.stormhold` | 795 | True |
| `place.dunmer-north.the-silyanorn-crown` | sightline | `place.dunmer-north.the-outer-silyanorn` | 249 | True |
| `place.dunmer-north.the-silyanorn-crown` | bound | `place.dunmer-north.the-outer-silyanorn` | 249 | — |
| `place.dunmer-north.the-slumped-hamlet` | sightline | `place.dunmer-north.the-shut-village` | 3523 | False |
| `place.dunmer-north.the-standing-bid` | sightline | `place.dunmer-north.stormhold` | 853 | True |
| `place.dunmer-north.the-stormhold-falls-chamber` | bound | `place.dunmer-north.stormhold` | 410 | — |
| `place.dunmer-north.the-thorn-bond` | bound | `place.dunmer-north.thorn` | 78 | — |
| `place.dunmer-north.the-veterans-ridge` | sightline | `place.dunmer-north.tear-road-stage` | 1246 | True |
| `place.dunmer-north.thorn-paddy-terraces` | bound | `place.dunmer-north.thorn` | 230 | — |
| `place.hist-heartland.greenspring` | bound | `place.hist-heartland.whitewater-reach-panther` | 230 | — |
| `place.hist-heartland.miregaunt-ward-approach` | bound | `place.hist-heartland.sealed-xanmeer-living` | 172 | — |
| `place.hist-heartland.rootworm-station-helstrom` | bound | `place.hist-heartland.helstrom` | 442 | — |
| `place.hist-heartland.sap-tapping-licensed` | sightline | `place.hist-heartland.harmed-hist-tapped` | 480 | True |
| `place.hist-heartland.vista-ledge-canopy-break` | sightline | `place.hist-heartland.helstrom` | 1285 | True |
| `place.imperial-fringe.ashen-tower` | sightline | `place.imperial-fringe.fort-swampmoth` | 748 | True |
| `place.imperial-fringe.castle-giovesse` | sightline | `place.imperial-fringe.gideon` | 386 | True |
| `place.imperial-fringe.fort-swampmoth` | sightline | `place.imperial-fringe.mile-house-of-the-eagle` | 692 | True |
| `place.imperial-fringe.gideon-rootworm-terminus` | bound | `place.imperial-fringe.gideon` | 233 | — |
| `place.imperial-fringe.gideon-synod-outstation` | bound | `place.imperial-fringe.gideon` | 230 | — |
| `place.imperial-fringe.giovesse-lines` | sightline | `place.imperial-fringe.castle-giovesse` | 63 | True |
| `place.imperial-fringe.glenbridge` | sightline | `place.imperial-fringe.glenbridge-sermon-xanmeer` | 321 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | sightline | `place.imperial-fringe.glenbridge` | 321 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | bound | `place.imperial-fringe.glenbridge` | 321 | — |
| `place.imperial-fringe.ridge-runners-post` | sightline | `place.imperial-fringe.ashen-tower` | 401 | True |
| `place.imperial-fringe.the-drowning-gate` | sightline | `place.imperial-fringe.the-embankment-that-drowned` | 736 | False |
| `place.imperial-fringe.the-embankment-that-drowned` | sightline | `place.imperial-fringe.the-drowning-gate` | 736 | True |
| `place.imperial-fringe.the-marble-field` | sightline | `place.imperial-fringe.gideon` | 378 | True |
| `place.imperial-fringe.the-ring-of-nine-wells` | sightline | `place.imperial-fringe.twyllbek-ruins` | 657 | True |
| `place.imperial-fringe.the-shut-door` | sightline | `place.imperial-fringe.the-kept-terrace` | 945 | True |
| `place.imperial-fringe.the-snowline-cell` | sightline | `place.imperial-fringe.ridge-runners-post` | 517 | True |
| `place.imperial-fringe.the-stone-talkers-watch` | sightline | `place.imperial-fringe.rockgrove` | 546 | True |
| `place.imperial-fringe.twyllbek-crown` | sightline | `place.imperial-fringe.twyllbek-ruins` | 1222 | True |
| `place.imperial-penal-south.blackrose-prison` | bound | `place.imperial-penal-south.blackrose` | 141 | — |
| `place.imperial-penal-south.plague-cordon` | bound | `place.imperial-penal-south.rose-supply-town` | 154 | — |
| `place.imperial-penal-south.rose-flooded-passage` | bound | `place.imperial-penal-south.blackrose-prison` | 105 | — |
| `place.mercantile-coast.soulrest-breaking-yard` | bound | `place.mercantile-coast.soulrest` | 224 | — |
| `place.mercantile-coast.soulrest-quay-tradehouse` | bound | `place.mercantile-coast.soulrest` | 68 | — |
| `place.pirate-freeholds.alten-corimont` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 107 | True |
| `place.pirate-freeholds.opening-work-barge` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 370 | True |
| `place.pirate-freeholds.opening-work-camp` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 272 | True |
| `place.saxhleel-coast.archon-harbour-hist` | bound | `place.saxhleel-coast.archon` | 220 | — |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | bound | `place.saxhleel-coast.archon` | 365 | — |

## Records placed from the homeless batch

| record | stage | site |
|---|---|---|
| `place.dunmer-north.channel-cross-village` | spacing-1/2 | site.scour.lake-standing-water.gorge-053 |
| `place.dunmer-north.climbs-to-see` | spacing-3/4 | site.free.roadside-0549 |
| `place.dunmer-north.greylight-village` | spacing-3/4 | site.free.any-firm-ground-0292 |
| `place.dunmer-north.murkwater` | spacing-1/2 | site.scour.rootland-deep-marsh.cliff-bench-004 |
| `place.dunmer-north.murkwater-shadowscale-ground` | spacing-1/2 | site.free.any-firm-ground-0120 |
| `place.dunmer-north.names-the-year` | neighbour-zone | site.free.roadside-0539 |
| `place.dunmer-north.reedmoor-stilts` | spacing-1/2 | site.free.any-shallow-marsh-0437 |
| `place.dunmer-north.riverwalk` | neighbour-zone | site.scour.mangrove-forest.natural-harbour-009 |
| `place.dunmer-north.stands-on-the-island` | spacing-3/4 | site.free.roadside-0141 |
| `place.dunmer-north.the-crown-terrace` | spacing-3/4 | site.free.roadside-0132 |
| `place.dunmer-north.the-diggings-ladder` | neighbour-zone | site.free.roadside-0522 |
| `place.dunmer-north.the-dres-rows` | spacing-3/4 | site.scour.firm-lowland.cliff-bench-050 |
| `place.dunmer-north.the-drowned-terrace` | neighbour-zone | site.scour.lake-standing-water.box-canyon-008 |
| `place.dunmer-north.the-shut-village` | neighbour-zone | site.free.any-firm-ground-0176 |
| `place.dunmer-north.the-thorn-bond` | neighbour-zone | site.free.roadside-0149 |
| `place.dunmer-north.the-tide-fair` | spacing-3/4 | site.scour.mangrove-forest.cove-045 |
| `place.dunmer-north.the-white-pans` | neighbour-zone | site.scour.ocean.cove-013 |
| `place.dunmer-north.three-ways-over-water` | neighbour-zone | site.free.any-shallow-marsh-0273 |
| `place.dunmer-north.ties-four-ways` | spacing-1/2 | site.free.roadside-0540 |
| `place.hist-heartland.blackguard-hideout-raw` | neighbour-zone | site.scour.rootland-deep-marsh.ravine-082 |
| `place.hist-heartland.boardwalk-branching-many-ways` | neighbour-zone | site.free.any-shallow-marsh-0608 |
| `place.hist-heartland.broken-xanmeer-subsumed` | neighbour-zone | site.free.any-shallow-marsh-0389 |
| `place.hist-heartland.burn-scar-village-ash` | neighbour-zone | site.free.any-firm-ground-0715 |
| `place.hist-heartland.dive-shaft-xanmeer-well` | neighbour-zone | site.free.any-shallow-marsh-0446 |
| `place.hist-heartland.greenspring` | spacing-3/4 | site.scour.firm-lowland.confluence-019 |
| `place.hist-heartland.miregaunt-ward-approach` | spacing-3/4 | site.free.any-firm-ground-0431 |
| `place.hist-heartland.pilgrim-camp-sap-road` | neighbour-zone | site.free.roadside-0342 |
| `place.hist-heartland.poacher-camp-sap` | neighbour-zone | site.scour.rootland-deep-marsh.islet-047 |
| `place.hist-heartland.root-gallery-collapsed-nine` | spacing-3/4 | site.free.roadside-0231 |
| `place.hist-heartland.root-gallery-drowned-stair` | neighbour-zone | site.scour.lake-standing-water.water-narrows-014 |
| `place.hist-heartland.root-gallery-lantern-hollow` | neighbour-zone | site.free.roadside-0337 |
| `place.hist-heartland.rootworm-station-helstrom` | neighbour-zone | site.free.any-firm-ground-0552 |
| `place.hist-heartland.sap-tapping-licensed` | neighbour-zone | site.free.any-firm-ground-0922 |
| `place.hist-heartland.stilt-channel-edge-two-poles` | neighbour-zone | site.free.any-shallow-marsh-0627 |
| `place.hist-heartland.stilt-channel-edge-uxaneet` | neighbour-zone | site.free.roadside-0320 |
| `place.hist-heartland.submerged-xanmeer-topmost` | neighbour-zone | site.scour.lake-standing-water.water-narrows-051 |
| `place.hist-heartland.treasure-hunters-dead-camp` | neighbour-zone | site.scour.rootland-deep-marsh.cliff-bench-064 |
| `place.hist-heartland.treasure-hunters-live-camp` | neighbour-zone | site.free.any-shallow-marsh-0496 |
| `place.hist-heartland.walkway-junction-high-crossroads` | neighbour-zone | site.free.roadside-0625 |
| `place.hist-heartland.wild-hist-mad-one` | neighbour-zone | site.free.any-shallow-marsh-0450 |
| `place.imperial-fringe.bog-iron-workings` | neighbour-zone | site.free.roadside-0222 |
| `place.imperial-fringe.castle-giovesse` | spacing-3/4 | site.free.any-firm-ground-0602 |
| `place.imperial-fringe.claywater-station` | spacing-3/4 | site.free.any-firm-ground-0606 |
| `place.imperial-fringe.fenmarch-village` | spacing-1/2 | site.free.roadside-0172 |
| `place.imperial-fringe.gideon-synod-outstation` | spacing-3/4 | site.free.any-firm-ground-0598 |
| `place.imperial-fringe.hollow-arch-toll` | spacing-3/4 | site.free.roadside-0213 |
| `place.imperial-fringe.ladder-to-the-light` | spacing-3/4 | site.free.roadside-0229 |
| `place.imperial-fringe.lower-onkobra-paddies` | spacing-3/4 | site.free.roadside-0250 |
| `place.imperial-fringe.lowmere-raft-town` | neighbour-zone | site.scour.lake-standing-water.gorge-017 |
| `place.imperial-fringe.onkobra-ferry` | spacing-3/4 | site.free.roadside-0166 |
| `place.imperial-fringe.red-cart-yard` | spacing-3/4 | site.scour.firm-lowland.waterfall-048 |
| `place.imperial-fringe.reedcutters-toll` | spacing-1/2 | site.free.any-firm-ground-0734 |
| `place.imperial-fringe.saddle-fair` | neighbour-zone | site.free.any-firm-ground-0759 |
| `place.imperial-fringe.slough-point` | spacing-1/2 | site.free.roadside-0358 |
| `place.imperial-fringe.the-drowning-gate` | neighbour-zone | site.free.any-firm-ground-0491 |
| `place.imperial-fringe.the-embankment-that-drowned` | neighbour-zone | site.free.any-firm-ground-0639 |
| `place.imperial-fringe.the-empty-steading` | spacing-3/4 | site.free.roadside-0236 |
| `place.imperial-fringe.the-lake-divers-yard` | neighbour-zone | site.scour.lake-standing-water.gorge-030 |
| `place.imperial-penal-south.basin-sinkhole` | neighbour-zone | site.free.any-firm-ground-1351 |
| `place.imperial-penal-south.bramman-head` | spacing-3/4 | site.scour.deep-river-corridor.land-bridge-036 |
| `place.imperial-penal-south.drawdown-flat` | neighbour-zone | site.scour.lake-standing-water.islet-033 |
| `place.imperial-penal-south.drowned-gallery` | spacing-3/4 | site.scour.lake-standing-water.isthmus-024 |
| `place.imperial-penal-south.lake-boardwalk-village` | spacing-3/4 | site.free.any-shallow-marsh-1315 |
| `place.imperial-penal-south.lake-ferry-stage` | neighbour-zone | site.scour.lake-standing-water.ford-009 |
| `place.imperial-penal-south.lake-submerged-xanmeer` | spacing-1/2 | site.scour.interior-swamp.islet-020 |
| `place.imperial-penal-south.lilmothiit-quarry` | relaxed-score | site.scour.lake-standing-water.ford-023 |
| `place.imperial-penal-south.marsh-giant-ground-basin` | neighbour-zone | site.free.any-shallow-marsh-1051 |
| `place.imperial-penal-south.murkwood-verge` | spacing-1/2 | site.free.any-shallow-marsh-1078 |
| `place.imperial-penal-south.natural-dive-shaft` | neighbour-zone | site.scour.lake-standing-water.cove-052 |
| `place.imperial-penal-south.necromantic-dig` | neighbour-zone | site.free.any-firm-ground-1338 |
| `place.imperial-penal-south.plague-cordon` | neighbour-zone | site.free.any-firm-ground-1280 |
| `place.imperial-penal-south.rockspring` | spacing-3/4 | site.scour.firm-lowland.flood-high-018 |
| `place.imperial-penal-south.rose-flooded-passage` | neighbour-zone | site.free.any-firm-ground-1318 |
| `place.imperial-penal-south.rose-outworks` | spacing-3/4 | site.free.any-firm-ground-1298 |
| `place.imperial-penal-south.voriplasm-vault` | neighbour-zone | site.free.any-shallow-marsh-1075 |
| `place.imperial-penal-south.west-market-town` | spacing-3/4 | site.free.roadside-0578 |
| `place.mercantile-coast.bereaved-village-murkmire` | spacing-3/4 | site.free.roadside-0500 |
| `place.mercantile-coast.keel-sakka-stilts` | neighbour-zone | site.free.any-shallow-marsh-1342 |
| `place.mercantile-coast.lilmoth-divers-yard` | neighbour-zone | site.scour.lake-standing-water.cove-008 |
| `place.mercantile-coast.necropolis-village-murkmire` | spacing-3/4 | site.free.any-shallow-marsh-1004 |
| `place.mercantile-coast.oliis-boardwalk` | neighbour-zone | site.free.any-shallow-marsh-1264 |
| `place.mercantile-coast.oliis-ferry-stage` | neighbour-zone | site.free.any-firm-ground-1241 |
| `place.mercantile-coast.oliis-reef-harvest` | neighbour-zone | site.scour.mangrove-forest.cove-030 |
| `place.mercantile-coast.root-gallery-murkmire` | neighbour-zone | site.free.any-firm-ground-1111 |
| `place.mercantile-coast.screen-watch` | spacing-1/2 | site.free.roadside-0502 |
| `place.mercantile-coast.sealed-meer-murkmire` | neighbour-zone | site.free.any-firm-ground-0989 |
| `place.mercantile-coast.soulrest-divers-yard` | neighbour-zone | site.scour.lake-standing-water.cove-066 |
| `place.mercantile-coast.soulrest-quay-tradehouse` | neighbour-zone | site.free.roadside-0277 |
| `place.mercantile-coast.stripped-village-north` | neighbour-zone | site.scour.firm-lowland.flood-high-008 |
| `place.mercantile-coast.topal-salt-pans` | neighbour-zone | site.scour.ocean.natural-harbour-006 |
| `place.naga-kur-deeps.bog-blight-ground-old-cordon` | neighbour-zone | site.free.any-shallow-marsh-1159 |
| `place.naga-kur-deeps.dive-shaft-natural-deeps` | spacing-1/2 | site.scour.lake-standing-water.cove-024 |
| `place.naga-kur-deeps.drowned-village-lake-deeps` | neighbour-zone | site.free.any-shallow-marsh-1099 |
| `place.naga-kur-deeps.drowning-narrows-tidal-gate` | neighbour-zone | site.free.any-shallow-marsh-1226 |
| `place.naga-kur-deeps.legendary-deep-feather-serpent` | neighbour-zone | site.free.any-shallow-marsh-1076 |
| `place.naga-kur-deeps.miregaunt-ward-open` | neighbour-zone | site.free.any-shallow-marsh-1079 |
| `place.naga-kur-deeps.naga-highway-camp-active-south` | neighbour-zone | site.scour.fringe-marsh.water-narrows-038 |
| `place.naga-kur-deeps.sealed-xanmeer-vakka-deeps` | spacing-3/4 | site.scour.rootland-deep-marsh.flood-high-037 |
| `place.naga-kur-deeps.sinkhole-mouth-deeps` | neighbour-zone | site.free.any-firm-ground-0775 |
| `place.naga-kur-deeps.wreck-submerged-barge` | neighbour-zone | site.free.any-shallow-marsh-1200 |
| `place.pirate-freeholds.freehold-naga-camp` | neighbour-zone | site.scour.border-mountains.ravine-036 |
| `place.pirate-freeholds.half-chartered-anchorage` | neighbour-zone | site.scour.firm-lowland.gorge-058 |
| `place.pirate-freeholds.opening-work-barge` | neighbour-zone | site.free.any-firm-ground-0202 |
| `place.pirate-freeholds.opening-work-camp` | neighbour-zone | site.free.roadside-0052 |
| `place.pirate-freeholds.reach-wreck` | spacing-3/4 | site.free.roadside-0103 |
| `place.pirate-freeholds.rim-keystone-chamber` | neighbour-zone | site.free.any-firm-ground-0347 |
| `place.pirate-freeholds.rim-snowline-hermitage` | neighbour-zone | site.scour.border-mountains.summit-004 |
| `place.pirate-freeholds.rockpoint` | spacing-3/4 | site.free.roadside-0107 |
| `place.pirate-freeholds.trunk-road-tradehouse` | neighbour-zone | site.free.any-firm-ground-0154 |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | neighbour-zone | site.scour.tropical-jungle.island-041 |
| `place.saxhleel-coast.sealed-xanmeer-wall` | neighbour-zone | site.free.any-firm-ground-1066 |

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

any-firm-ground 252, any-shallow-marsh 92, flood-high 22, ridge-end 22, ravine 17, cliff-bench 14, cove 14, summit 14, islet 11, gorge 10, saddle 10, spring-head 10, water-narrows 10, anchor 9, box-canyon 8, ford 6, island 6, river-mouth 5, headland 4, waterfall 4, any-channel-bank 3, confluence 3, isthmus 3, land-bridge 3, natural-harbour 2, oxbow 2, enclosed-clearing 1

## Homeless batch (unresolved)

- none: every live record found ground

## Tier 0–1 placements

| record | site | landform | region | why |
|---|---|---|---|---|
| `place.dunmer-north.bogmother` | site.scour.firm-lowland.summit-041 | summit | firm lowland | summit in firm lowland (danger band 2), 351 m from the nearest route; its choice #2 landform; won on landform, region, danger. |
| `place.dunmer-north.gandranen-library` | site.scour.lake-standing-water.cliff-bench-026 | cliff-bench | lake & standing water | cliff bench in lake & standing water (danger band 5), 1157 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, remote. |
| `place.dunmer-north.gandranen-ruins` | site.scour.lake-standing-water.saddle-029 | saddle | lake & standing water | saddle in lake & standing water (danger band 5), 1197 m from the nearest route; at the water's edge; won on region, remote, route. |
| `place.dunmer-north.hatching-pools` | site.scour.fringe-marsh.cliff-bench-076 | cliff-bench | fringe marsh | cliff bench in fringe marsh (danger band 3), 217 m from the nearest route; at the water's edge; won on region, parent, route. |
| `place.dunmer-north.hissmir` | site.free.any-firm-ground-0237 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 258 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.dunmer-north.hixinoag` | site.scour.fringe-marsh.cliff-bench-053 | cliff-bench | fringe marsh | cliff bench in fringe marsh (danger band 3), 621 m from the nearest route; at the water's edge; won on region, parent, route. |
| `place.dunmer-north.hutan-tzel` | site.scour.firm-lowland.spring-head-038 | spring-head | firm lowland | spring head in firm lowland (danger band 2), 50 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |
| `place.dunmer-north.loriasel-caverns` | site.scour.upland-hills.spring-head-015 | spring-head | upland hills | spring head in upland hills (danger band 3), 777 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, remote. |
| `place.dunmer-north.mazzatun` | site.scour.upland-hills.ridge-end-066 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 246 m from the nearest route; its first-choice landform; won on landform, region, danger. |
| `place.dunmer-north.mazzatun-hist` | site.free.any-firm-ground-0302 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 319 m from the nearest route; its choice #3 landform; won on bound, landform, danger. |
| `place.dunmer-north.stillrise-village` | site.scour.lake-standing-water.box-canyon-042 | box-canyon | lake & standing water | box canyon in lake & standing water (danger band 5), 1285 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, remote. |
| `place.dunmer-north.stormhold` | anchor.stormhold | anchor | firm lowland | Owner-approved settlement anchor 'stormhold' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.ten-maur-wolk` | site.scour.upland-hills.saddle-030 | saddle | upland hills | saddle in upland hills (danger band 3), 1132 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, remote. |
| `place.dunmer-north.the-quiet-landing` | site.free.any-firm-ground-0319 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 132 m from the nearest route; its choice #2 landform; won on landform, region, route. |
| `place.dunmer-north.the-standing-bid` | site.free.any-firm-ground-0068 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 45 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, sightline, region. |
| `place.dunmer-north.thorn` | anchor.thorn | anchor | firm lowland | Owner-approved settlement anchor 'thorn' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.wolk-market` | site.free.roadside-0101 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 20 m from the nearest route; at the water's edge; its choice #4 landform; won on route, landform, region. |
| `place.hist-heartland.bereaved-mnemic` | site.scour.fringe-marsh.flood-high-039 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 128 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.hist-heartland.cult-raid-camp-unbound` | site.scour.firm-lowland.flood-high-031 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 332 m from the nearest route; its choice #4 landform; won on landform, region, route. |
| `place.hist-heartland.greenspring` | site.scour.firm-lowland.confluence-019 | confluence | firm lowland | confluence in firm lowland (danger band 3), 43 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, region; placed from the homeless batch at stage 'spacing-3/4'. |
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
| `place.hist-heartland.root-gallery-cult-warren` | site.free.any-firm-ground-0915 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 684 m from the nearest route; at the water's edge; its choice #5 landform; won on region, remote, landform. |
| `place.hist-heartland.root-gallery-helstrom-underway` | site.scour.rootland-deep-marsh.ravine-015 | ravine | rootland deep marsh | ravine in rootland deep marsh (danger band 3), 17 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, danger. |
| `place.hist-heartland.root-talk-ground` | site.free.any-firm-ground-0875 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 395 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, parent. |
| `place.hist-heartland.rootworm-station-helstrom` | site.free.any-firm-ground-0552 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 5), 115 m from the nearest route; at the water's edge; its choice #4 landform; won on bound, landform, region; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.hist-heartland.sap-collection-facility-daedric` | site.free.any-firm-ground-0981 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 748 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on remote, region, parent. |
| `place.hist-heartland.sealed-xanmeer-living` | site.free.any-shallow-marsh-0430 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 5), 286 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, danger, remote. |
| `place.hist-heartland.stone-calendar-hist-tsoko` | site.scour.firm-lowland.summit-033 | summit | firm lowland | summit in firm lowland (danger band 3), 685 m from the nearest route; its first-choice landform; won on landform, route, region. |
| `place.hist-heartland.the-cut-circle` | site.free.any-shallow-marsh-0657 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 573 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.hist-heartland.umpholo-mission` | site.free.any-firm-ground-0842 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 873 m from the nearest route; its choice #3 landform; won on landform, region, remote. |
| `place.hist-heartland.xal-krona-making-ground` | site.scour.rootland-deep-marsh.box-canyon-012 | box-canyon | rootland deep marsh | box canyon in rootland deep marsh (danger band 5), 358 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.hist-heartland.xal-meeruth-station` | site.scour.deep-river-corridor.confluence-000 | confluence | deep river corridor | confluence in deep river corridor (danger band 4), 6 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, route, region. |
| `place.hist-heartland.xanmeer-fort-defences-working` | site.scour.firm-lowland.summit-031 | summit | firm lowland | summit in firm lowland (danger band 4), 710 m from the nearest route; its choice #2 landform; won on landform, region, remote. |
| `place.imperial-fringe.castle-giovesse` | site.free.any-firm-ground-0602 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 128 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on sightline, region, parent; placed from the homeless batch at stage 'spacing-3/4'. |
| `place.imperial-fringe.fort-swampmoth` | site.scour.upland-hills.ridge-end-022 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 626 m from the nearest route; its first-choice landform; won on landform, sightline, region. |
| `place.imperial-fringe.gideon` | anchor.gideon | anchor | firm lowland | Owner-approved settlement anchor 'gideon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-fringe.gideon-rootworm-terminus` | site.free.any-firm-ground-0632 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 233 m from the nearest route; at the water's edge; its choice #4 landform; won on bound, landform, region. |
| `place.imperial-fringe.glenbridge` | site.free.roadside-0207 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 49 m from the nearest route; its choice #3 landform; won on landform, region, danger. |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | site.free.roadside-0363 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 49 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on bound, sightline, region. |
| `place.imperial-fringe.orma-tactile-ruin` | site.scour.border-mountains.box-canyon-039 | box-canyon | border mountains | box canyon in border mountains (danger band 3), 967 m from the nearest route; its first-choice landform; won on landform, remote, region. |
| `place.imperial-fringe.rockgrove` | site.scour.upland-hills.ridge-end-025 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1190 m from the nearest route; its choice #2 landform; won on landform, region, remote. |
| `place.imperial-fringe.slough-point` | site.free.roadside-0358 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 3), 27 m from the nearest route; at the water's edge; no free 'ford' site was left in the zone, so plain ground; won on region, parent, landform; placed from the homeless batch at stage 'spacing-1/2'. |
| `place.imperial-fringe.stonewastes` | site.scour.upland-hills.land-bridge-000 | land-bridge | upland hills | land bridge in upland hills (danger band 3), 658 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, ring. |
| `place.imperial-fringe.the-silent-halls` | site.free.any-firm-ground-0864 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 462 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, submerged, remote. |
| `place.imperial-fringe.the-stone-talkers-watch` | site.scour.upland-hills.ridge-end-055 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1018 m from the nearest route; its choice #2 landform; won on landform, sightline, region. |
| `place.imperial-penal-south.blackrose` | anchor.blackrose | anchor | fringe marsh | Owner-approved settlement anchor 'blackrose' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-penal-south.blackrose-drowned-hist` | site.scour.lake-standing-water.islet-021 | islet | lake & standing water | islet in lake & standing water (danger band 3), 527 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.blackrose-prison` | site.scour.firm-lowland.flood-high-000 | flood-high | firm lowland | flood high in firm lowland (danger band 2), 140 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.bramman-head` | site.scour.deep-river-corridor.land-bridge-036 | land-bridge | deep river corridor | land bridge in deep river corridor (danger band 3), 604 m from the nearest route; at the water's edge; won on region, danger, parent; placed from the homeless batch at stage 'spacing-3/4'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.chainbreaker-shelter` | site.free.any-firm-ground-1339 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 285 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.flu-quarantine-village` | site.scour.fringe-marsh.island-005 | island | fringe marsh | island in fringe marsh (danger band 3), 546 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lake-submerged-xanmeer` | site.scour.interior-swamp.islet-020 | islet | interior swamp | islet in interior swamp (danger band 4), 372 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; placed from the homeless batch at stage 'spacing-1/2'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lilmothiit-quarry` | site.scour.lake-standing-water.ford-023 | ford | lake & standing water | ford in lake & standing water (danger band 3), 452 m from the nearest route; at the water's edge; won on region, danger, parent; placed from the homeless batch at stage 'relaxed-score'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.longmont` | site.free.any-shallow-marsh-1337 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 276 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.murkwood-verge` | site.free.any-shallow-marsh-1078 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 701 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, remote, danger; placed from the homeless batch at stage 'spacing-1/2'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.rose-flooded-passage` | site.free.any-firm-ground-1318 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 229 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, region; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.imperial-penal-south.rose-supply-town` | site.scour.fringe-marsh.ford-030 | ford | fringe marsh | ford in fringe marsh (danger band 2), 61 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.three-gate-toll` | site.scour.fringe-marsh.ford-047 | ford | fringe marsh | ford in fringe marsh (danger band 2), 106 m from the nearest route; at the water's edge; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.west-market-town` | site.free.roadside-0578 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 2), 40 m from the nearest route; at the water's edge; no free 'confluence' site was left in the zone, so plain ground; won on route, region, parent; placed from the homeless batch at stage 'spacing-3/4'; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.alten-meerhleel` | site.free.roadside-0581 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 87 m from the nearest route; at the water's edge; no free 'natural-harbour' site was left in the zone, so plain ground; won on region, parent, landform; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bramman-screen` | site.free.any-shallow-marsh-1215 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 3), 88 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bright-throat-village` | site.free.any-shallow-marsh-1121 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 439 m from the nearest route; its choice #3 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.chasepoint` | site.free.any-firm-ground-1019 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 466 m from the nearest route; its first-choice landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.inhabited-meer-murkmire` | site.scour.fringe-marsh.flood-high-003 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 154 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.ixtaxh-xanmeer` | site.scour.lake-standing-water.islet-004 | islet | lake & standing water | islet in lake & standing water (danger band 3), 846 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.lilmoth` | anchor.lilmoth | anchor | firm lowland | Owner-approved settlement anchor 'lilmoth' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.rockpark` | site.free.any-firm-ground-1340 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 225 m from the nearest route; its choice #2 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.slaughter-memorial` | site.free.any-firm-ground-1258 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 1), 50 m from the nearest route; its choice #3 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.soulrest` | anchor.soulrest | anchor | fringe marsh | Owner-approved settlement anchor 'soulrest' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.teeth-of-sithis` | site.scour.tropical-jungle.summit-049 | summit | tropical jungle | summit in tropical jungle (danger band 4), 593 m from the nearest route; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.white-rose-prison` | site.scour.firm-lowland.flood-high-007 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 167 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.xinchei-konu` | site.scour.firm-lowland.summit-029 | summit | firm lowland | summit in firm lowland (danger band 2), 377 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.bereaved-hist-less-since` | site.scour.interior-swamp.flood-high-028 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 27 m from the nearest route; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.dead-water-village` | site.free.any-firm-ground-0986 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 473 m from the nearest route; its choice #3 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.deepmire-refuge` | site.scour.interior-swamp.flood-high-029 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 568 m from the nearest route; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.ferry-stage-guide-hire` | site.scour.fringe-marsh.cove-001 | cove | fringe marsh | cove in fringe marsh (danger band 2), 61 m from the nearest route; at the water's edge; won on region, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.harmed-hist-enslaved` | site.free.roadside-0251 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 71 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, danger, landform; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | site.free.any-shallow-marsh-1158 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 525 m from the nearest route; at the water's edge; no free 'confluence' site was left in the zone, so plain ground; won on region, remote, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.naga-village-settled` | site.scour.rootland-deep-marsh.flood-high-023 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 491 m from the nearest route; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-gallery-blight-warren` | site.scour.rootland-deep-marsh.flood-high-026 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 544 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-whisper-village` | site.free.any-shallow-marsh-1162 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 255 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.sithis-temple-mass-sacrifice` | site.scour.interior-swamp.flood-high-038 | flood-high | interior swamp | flood high in interior swamp (danger band 3), 259 m from the nearest route; its choice #3 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.umbriel-stripped-undead` | site.scour.interior-swamp.flood-high-017 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 151 m from the nearest route; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.wild-hist-rogue-deeps` | site.scour.interior-swamp.island-007 | island | interior swamp | island in interior swamp (danger band 4), 639 m from the nearest route; at the water's edge; its choice #3 landform; won on remote, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.pirate-freeholds.alten-corimont` | anchor.alten-corimont | anchor | firm lowland | Owner-approved settlement anchor 'alten-corimont' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.pirate-freeholds.chasecreek` | site.free.any-firm-ground-0281 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 158 m from the nearest route; its first-choice landform; won on landform, region, parent. |
| `place.pirate-freeholds.corimont-hist-less-camp` | site.free.any-firm-ground-0276 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 412 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent. |
| `place.pirate-freeholds.opening-work-barge` | site.free.any-firm-ground-0202 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 436 m from the nearest route; no free 'any-channel-bank' site was left in the zone, so plain ground; won on sightline, region, parent; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.pirate-freeholds.opening-work-camp` | site.free.roadside-0052 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 37 m from the nearest route; at the water's edge; its first-choice landform; won on landform, sightline, region; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.pirate-freeholds.rockpoint` | site.free.roadside-0107 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 71 m from the nearest route; no free 'cliff-bench' site was left in the zone, so plain ground; won on route, region, danger; placed from the homeless batch at stage 'spacing-3/4'. |
| `place.pirate-freeholds.upriver-hist-village` | site.free.roadside-0608 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 43 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.archon` | anchor.archon | anchor | mangrove forest | Owner-approved settlement anchor 'archon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.saxhleel-coast.archon-harbour-hist` | site.free.any-firm-ground-0956 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 51 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, parent. |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | site.free.any-firm-ground-1013 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 313 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on bound, region, parent. |
| `place.saxhleel-coast.cantemir-headland` | site.free.any-shallow-marsh-0853 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 318 m from the nearest route; no free 'headland' site was left in the zone, so plain ground; won on region, parent, landform. |
| `place.saxhleel-coast.east-estuary-rootworm-station` | site.free.any-firm-ground-1014 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 143 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | site.scour.tropical-jungle.island-041 | island | tropical jungle | island in tropical jungle (danger band 4), 418 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, submerged; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.saxhleel-coast.portdun-mont` | site.scour.mangrove-forest.flood-high-030 | flood-high | mangrove forest | flood high in mangrove forest (danger band 2), 229 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.seafalls` | site.scour.tropical-jungle.water-narrows-009 | water-narrows | tropical jungle | water narrows in tropical jungle (danger band 2), 172 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |

## Owner-feedback checks (Part 4 step 2)

- stances: {'friendly': 72, 'wary': 65, 'hostile': 271, 'neutral': 87, 'guarded': 37, 'sanctuary': 25}
- swap pass exchanged 134 sites
- delves/combat places (D3+) with no friendly/sanctuary rest within 600 m (1200 m in D4–D5): 0

| city | purposes in 2 km | missing core purposes | hostile in 2 km | edge / hinterland / rural counts |
|---|---|---|---|---|
| stormhold | 14 | — | 56 | 14 / 50 / 120 |
| thorn | 13 | — | 38 | 12 / 42 / 61 |
| gideon | 14 | — | 75 | 17 / 69 / 117 |
| helstrom | 14 | — | 84 | 9 / 37 / 234 |
| archon | 13 | — | 42 | 5 / 31 / 78 |
| blackrose | 15 | — | 75 | 12 / 65 / 87 |
| lilmoth | 14 | — | 62 | 6 / 45 / 93 |
| soulrest | 14 | — | 44 | 7 / 30 / 79 |
| alten-corimont | 14 | — | 70 | 9 / 69 / 134 |
