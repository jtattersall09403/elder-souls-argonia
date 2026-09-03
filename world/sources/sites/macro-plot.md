# Macro plot — coverage report (Phase 11 Part 3)

Seed 1103. Supply: 1172 scour sites + 2001 free-ground points. Demand: 566 live records; **566 plotted**, 0 unresolved.
Placed from the homeless batch: {'spacing-1/2': 18, 'spacing-3/4': 43, 'neighbour-zone': 49, 'relaxed-score': 1, 'region-relaxed': 1}.

| zone | live | plotted | homeless | landform wishes from recipe | top landforms |
|---|---|---|---|---|---|
| dunmer-north | 132 | 132 | 0 | 0 | any-firm-ground 69, ridge-end 11, cliff-bench 8, any-shallow-marsh 7 |
| hist-heartland | 111 | 111 | 0 | 0 | any-firm-ground 46, any-shallow-marsh 31, flood-high 5, summit 5 |
| imperial-fringe | 121 | 121 | 0 | 0 | any-firm-ground 80, ridge-end 11, ravine 8, box-canyon 3 |
| imperial-penal-south | 44 | 44 | 0 | 43 | any-firm-ground 17, any-shallow-marsh 9, cove 4, ford 4 |
| mercantile-coast | 60 | 60 | 0 | 60 | any-firm-ground 26, any-shallow-marsh 13, flood-high 5, islet 4 |
| naga-kur-deeps | 42 | 42 | 0 | 41 | any-shallow-marsh 24, flood-high 5, any-firm-ground 4, cove 3 |
| pirate-freeholds | 30 | 30 | 0 | 0 | any-firm-ground 23, ridge-end 2, anchor 1, gorge 1 |
| saxhleel-coast | 26 | 26 | 0 | 0 | any-shallow-marsh 11, any-firm-ground 7, flood-high 2, anchor 1 |

## Spacing and routes

- nearest-neighbour distance p5 / median / p95: 80 / 176 / 298 m
- same-type pairs closer than 300 m: 4
- median distance to a route: 206 m; fine-tempo records within 300 m of a route: 73 %
- route-visibility sweep (364 samples every 150 m, radius 450 m): mean 3.4 destination/landmark places in sight; dead 6 %, crowded (4+) 44 %

## Anti-sameyness quota (no type > 25 % of a zone)

- none

## Named constraints (sightline / bound), as plotted

| record | kind | to | m | line of sight |
|---|---|---|---|---|
| `place.dunmer-north.gandranen-library` | bound | `place.dunmer-north.gandranen-ruins` | 67 | — |
| `place.dunmer-north.mazzatun-hist` | bound | `place.dunmer-north.mazzatun` | 204 | — |
| `place.dunmer-north.murkwater-shadowscale-ground` | bound | `place.dunmer-north.murkwater` | 219 | — |
| `place.dunmer-north.stormhold-causeway` | bound | `place.dunmer-north.stormhold` | 245 | — |
| `place.dunmer-north.the-black-stage` | bound | `place.dunmer-north.stormhold-causeway` | 116 | — |
| `place.dunmer-north.the-crown-terrace` | bound | `place.dunmer-north.stands-on-the-island` | 357 | — |
| `place.dunmer-north.the-drawdown-flats` | bound | `place.dunmer-north.the-drowned-terrace` | 81 | — |
| `place.dunmer-north.the-first-count` | sightline | `place.dunmer-north.stormhold` | 431 | True |
| `place.dunmer-north.the-flu-cordon` | sightline | `place.dunmer-north.stillrise-village` | 280 | True |
| `place.dunmer-north.the-high-wrappings` | bound | `place.dunmer-north.keeps-the-second-island` | 1663 | — |
| `place.dunmer-north.the-north-vista` | sightline | `place.dunmer-north.the-pass-station` | 1013 | True |
| `place.dunmer-north.the-outer-silyanorn` | sightline | `place.dunmer-north.stormhold` | 795 | True |
| `place.dunmer-north.the-silyanorn-crown` | sightline | `place.dunmer-north.the-outer-silyanorn` | 249 | True |
| `place.dunmer-north.the-silyanorn-crown` | bound | `place.dunmer-north.the-outer-silyanorn` | 249 | — |
| `place.dunmer-north.the-slumped-hamlet` | sightline | `place.dunmer-north.the-shut-village` | 2709 | False |
| `place.dunmer-north.the-stormhold-falls-chamber` | bound | `place.dunmer-north.stormhold` | 357 | — |
| `place.dunmer-north.the-thorn-bond` | bound | `place.dunmer-north.thorn` | 413 | — |
| `place.dunmer-north.the-veterans-ridge` | sightline | `place.dunmer-north.tear-road-stage` | 1173 | True |
| `place.dunmer-north.thorn-paddy-terraces` | bound | `place.dunmer-north.thorn` | 230 | — |
| `place.hist-heartland.greenspring` | bound | `place.hist-heartland.whitewater-reach-panther` | 829 | — |
| `place.hist-heartland.miregaunt-ward-approach` | bound | `place.hist-heartland.sealed-xanmeer-living` | 359 | — |
| `place.hist-heartland.rootworm-station-helstrom` | bound | `place.hist-heartland.helstrom` | 279 | — |
| `place.hist-heartland.sap-tapping-licensed` | sightline | `place.hist-heartland.harmed-hist-tapped` | 154 | True |
| `place.hist-heartland.vista-ledge-canopy-break` | sightline | `place.hist-heartland.helstrom` | 1285 | True |
| `place.imperial-fringe.ashen-tower` | sightline | `place.imperial-fringe.fort-swampmoth` | 1344 | True |
| `place.imperial-fringe.castle-giovesse` | sightline | `place.imperial-fringe.gideon` | 386 | True |
| `place.imperial-fringe.fort-swampmoth` | sightline | `place.imperial-fringe.mile-house-of-the-eagle` | 795 | True |
| `place.imperial-fringe.gideon-rootworm-terminus` | bound | `place.imperial-fringe.gideon` | 233 | — |
| `place.imperial-fringe.gideon-synod-outstation` | bound | `place.imperial-fringe.gideon` | 63 | — |
| `place.imperial-fringe.giovesse-lines` | sightline | `place.imperial-fringe.castle-giovesse` | 63 | True |
| `place.imperial-fringe.glenbridge` | sightline | `place.imperial-fringe.glenbridge-sermon-xanmeer` | 321 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | sightline | `place.imperial-fringe.glenbridge` | 321 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | bound | `place.imperial-fringe.glenbridge` | 321 | — |
| `place.imperial-fringe.hearth-house-of-the-burnt-field` | bound | `place.imperial-fringe.cartwrights-cross` | 767 | — |
| `place.imperial-fringe.ridge-runners-post` | sightline | `place.imperial-fringe.ashen-tower` | 857 | True |
| `place.imperial-fringe.slough-point-quarantine-shed` | bound | `place.imperial-fringe.slough-point` | 125 | — |
| `place.imperial-fringe.the-drowning-gate` | sightline | `place.imperial-fringe.the-embankment-that-drowned` | 249 | False |
| `place.imperial-fringe.the-embankment-that-drowned` | sightline | `place.imperial-fringe.the-drowning-gate` | 249 | True |
| `place.imperial-fringe.the-marble-field` | sightline | `place.imperial-fringe.gideon` | 378 | True |
| `place.imperial-fringe.the-ring-of-nine-wells` | sightline | `place.imperial-fringe.twyllbek-ruins` | 714 | True |
| `place.imperial-fringe.the-shut-door` | sightline | `place.imperial-fringe.the-kept-terrace` | 728 | False |
| `place.imperial-fringe.the-snowline-cell` | sightline | `place.imperial-fringe.ridge-runners-post` | 520 | True |
| `place.imperial-fringe.the-stone-talkers-watch` | sightline | `place.imperial-fringe.rockgrove` | 546 | True |
| `place.imperial-fringe.twyllbek-crown` | sightline | `place.imperial-fringe.twyllbek-ruins` | 1222 | True |
| `place.imperial-penal-south.blackrose-prison` | bound | `place.imperial-penal-south.blackrose` | 141 | — |
| `place.imperial-penal-south.plague-cordon` | bound | `place.imperial-penal-south.rose-supply-town` | 167 | — |
| `place.imperial-penal-south.rose-flooded-passage` | bound | `place.imperial-penal-south.blackrose-prison` | 105 | — |
| `place.mercantile-coast.soulrest-breaking-yard` | bound | `place.mercantile-coast.soulrest` | 224 | — |
| `place.mercantile-coast.soulrest-quay-tradehouse` | bound | `place.mercantile-coast.soulrest` | 68 | — |
| `place.pirate-freeholds.alten-corimont` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 209 | True |
| `place.pirate-freeholds.opening-work-barge` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 137 | True |
| `place.pirate-freeholds.opening-work-camp` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 174 | True |
| `place.saxhleel-coast.archon-harbour-hist` | bound | `place.saxhleel-coast.archon` | 220 | — |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | bound | `place.saxhleel-coast.archon` | 365 | — |

## Records placed from the homeless batch

| record | stage | site |
|---|---|---|
| `place.dunmer-north.channel-cross-village` | spacing-1/2 | site.scour.lake-standing-water.saddle-009 |
| `place.dunmer-north.climbs-to-see` | spacing-3/4 | site.free.any-shallow-marsh-0341 |
| `place.dunmer-north.greylight-village` | spacing-1/2 | site.free.any-firm-ground-0024 |
| `place.dunmer-north.keeps-the-second-island` | spacing-3/4 | site.free.roadside-0131 |
| `place.dunmer-north.murkwater` | spacing-1/2 | site.free.any-firm-ground-0036 |
| `place.dunmer-north.murkwater-shadowscale-ground` | spacing-1/2 | site.free.any-firm-ground-0063 |
| `place.dunmer-north.names-the-year` | neighbour-zone | site.free.any-firm-ground-0137 |
| `place.dunmer-north.one-house-high` | spacing-3/4 | site.scour.firm-lowland.isthmus-029 |
| `place.dunmer-north.reedmoor-stilts` | spacing-3/4 | site.scour.mangrove-forest.natural-harbour-009 |
| `place.dunmer-north.riverwalk` | spacing-3/4 | site.free.roadside-0065 |
| `place.dunmer-north.sits-above-the-flood` | spacing-3/4 | site.free.any-firm-ground-0237 |
| `place.dunmer-north.stands-on-the-island` | spacing-3/4 | site.free.roadside-0141 |
| `place.dunmer-north.the-black-stage` | spacing-3/4 | site.free.any-firm-ground-0170 |
| `place.dunmer-north.the-charge-pond` | relaxed-score | site.free.roadside-0102 |
| `place.dunmer-north.the-crown-terrace` | spacing-3/4 | site.scour.fringe-marsh.cliff-bench-071 |
| `place.dunmer-north.the-diggings-ladder` | spacing-3/4 | site.free.any-shallow-marsh-0322 |
| `place.dunmer-north.the-gravel-six` | neighbour-zone | site.free.any-firm-ground-0338 |
| `place.dunmer-north.the-shut-village` | neighbour-zone | site.free.any-firm-ground-0292 |
| `place.dunmer-north.the-tide-fair` | spacing-3/4 | site.free.roadside-0522 |
| `place.dunmer-north.the-white-pans` | neighbour-zone | site.scour.ocean.cove-032 |
| `place.dunmer-north.three-ways-over-water` | spacing-3/4 | site.free.roadside-0059 |
| `place.dunmer-north.ties-four-ways` | spacing-1/2 | site.free.any-shallow-marsh-0296 |
| `place.hist-heartland.boardwalk-branching-many-ways` | spacing-3/4 | site.free.any-shallow-marsh-0452 |
| `place.hist-heartland.broken-xanmeer-subsumed` | neighbour-zone | site.free.roadside-0342 |
| `place.hist-heartland.greenspring` | neighbour-zone | site.free.any-firm-ground-0775 |
| `place.hist-heartland.hammock-tree-island-greenmoss` | spacing-3/4 | site.free.roadside-0398 |
| `place.hist-heartland.poacher-camp-sap` | neighbour-zone | site.free.any-shallow-marsh-0608 |
| `place.hist-heartland.root-gallery-collapsed-nine` | spacing-3/4 | site.free.any-shallow-marsh-0389 |
| `place.hist-heartland.root-gallery-lantern-hollow` | neighbour-zone | site.free.any-shallow-marsh-0499 |
| `place.hist-heartland.rootworm-station-helstrom` | neighbour-zone | site.scour.firm-lowland.flood-high-024 |
| `place.hist-heartland.stilt-channel-edge-uxaneet` | neighbour-zone | site.free.roadside-0320 |
| `place.hist-heartland.walkway-junction-high-crossroads` | neighbour-zone | site.free.roadside-0339 |
| `place.hist-heartland.wisp-lure-basin` | neighbour-zone | site.free.any-shallow-marsh-0497 |
| `place.imperial-fringe.bog-iron-workings` | neighbour-zone | site.scour.seasonal-floodplain.spring-head-036 |
| `place.imperial-fringe.bonded-shed-of-the-onkobra` | spacing-3/4 | site.free.roadside-0250 |
| `place.imperial-fringe.cassian-farm` | spacing-3/4 | site.free.any-firm-ground-0605 |
| `place.imperial-fringe.castle-giovesse` | spacing-3/4 | site.free.any-firm-ground-0602 |
| `place.imperial-fringe.claywater-station` | spacing-1/2 | site.free.any-firm-ground-0636 |
| `place.imperial-fringe.gideon-synod-outstation` | spacing-3/4 | site.free.any-firm-ground-0600 |
| `place.imperial-fringe.hearth-house-of-the-burnt-field` | spacing-1/2 | site.free.roadside-0285 |
| `place.imperial-fringe.hollow-arch-toll` | spacing-3/4 | site.scour.firm-lowland.spring-head-035 |
| `place.imperial-fringe.ladder-to-the-light` | spacing-3/4 | site.free.any-shallow-marsh-0997 |
| `place.imperial-fringe.long-causeway` | spacing-1/2 | site.free.any-firm-ground-0734 |
| `place.imperial-fringe.low-water-fair` | neighbour-zone | site.free.roadside-0297 |
| `place.imperial-fringe.lower-onkobra-paddies` | neighbour-zone | site.free.any-firm-ground-0638 |
| `place.imperial-fringe.lowmere-raft-town` | neighbour-zone | site.scour.lake-standing-water.box-canyon-030 |
| `place.imperial-fringe.ninefold-station` | spacing-3/4 | site.free.any-firm-ground-0640 |
| `place.imperial-fringe.onkobra-ferry` | spacing-3/4 | site.free.roadside-0166 |
| `place.imperial-fringe.red-cart-yard` | spacing-3/4 | site.free.any-firm-ground-0604 |
| `place.imperial-fringe.reedcutters-toll` | spacing-1/2 | site.free.roadside-0292 |
| `place.imperial-fringe.saddle-fair` | neighbour-zone | site.free.any-firm-ground-0361 |
| `place.imperial-fringe.slough-point` | spacing-1/2 | site.free.roadside-0213 |
| `place.imperial-fringe.slough-point-quarantine-shed` | spacing-1/2 | site.free.roadside-0212 |
| `place.imperial-fringe.the-drowned-furrow` | spacing-1/2 | site.free.any-firm-ground-0733 |
| `place.imperial-fringe.the-drowning-gate` | neighbour-zone | site.free.any-firm-ground-0491 |
| `place.imperial-fringe.the-embankment-that-drowned` | neighbour-zone | site.free.any-firm-ground-0519 |
| `place.imperial-fringe.the-empty-steading` | spacing-1/2 | site.free.any-firm-ground-0830 |
| `place.imperial-fringe.the-lake-divers-yard` | neighbour-zone | site.scour.lake-standing-water.gorge-030 |
| `place.imperial-fringe.the-old-quarters` | spacing-3/4 | site.free.roadside-0358 |
| `place.imperial-fringe.the-ravine-doors` | spacing-3/4 | site.scour.upland-hills.ravine-040 |
| `place.imperial-fringe.the-vellum-estate` | spacing-3/4 | site.free.any-firm-ground-1025 |
| `place.imperial-penal-south.bramman-head` | region-relaxed | site.scour.deep-river-corridor.land-bridge-036 |
| `place.imperial-penal-south.drawdown-flat` | neighbour-zone | site.free.any-shallow-marsh-1186 |
| `place.imperial-penal-south.lake-boardwalk-village` | spacing-3/4 | site.free.any-shallow-marsh-1315 |
| `place.imperial-penal-south.lake-ferry-stage` | neighbour-zone | site.free.roadside-0039 |
| `place.imperial-penal-south.lake-submerged-xanmeer` | spacing-3/4 | site.free.any-shallow-marsh-1247 |
| `place.imperial-penal-south.lilmothiit-quarry` | spacing-3/4 | site.scour.lake-standing-water.cove-034 |
| `place.imperial-penal-south.marsh-giant-ground-basin` | neighbour-zone | site.free.any-shallow-marsh-1051 |
| `place.imperial-penal-south.necromantic-dig` | spacing-3/4 | site.free.any-shallow-marsh-1230 |
| `place.imperial-penal-south.plague-cordon` | neighbour-zone | site.free.any-firm-ground-1255 |
| `place.imperial-penal-south.rockspring` | spacing-3/4 | site.free.any-firm-ground-1351 |
| `place.imperial-penal-south.rose-flooded-passage` | neighbour-zone | site.free.any-firm-ground-1318 |
| `place.imperial-penal-south.rose-outworks` | neighbour-zone | site.free.any-shallow-marsh-1252 |
| `place.imperial-penal-south.saltrice-village` | spacing-3/4 | site.free.any-firm-ground-1355 |
| `place.imperial-penal-south.voriplasm-vault` | neighbour-zone | site.free.roadside-0576 |
| `place.imperial-penal-south.west-market-town` | spacing-1/2 | site.free.roadside-0022 |
| `place.imperial-penal-south.wisp-lure-basin` | neighbour-zone | site.free.any-firm-ground-1340 |
| `place.mercantile-coast.ashfield` | spacing-3/4 | site.free.any-firm-ground-1239 |
| `place.mercantile-coast.bereaved-village-murkmire` | spacing-3/4 | site.free.any-firm-ground-1173 |
| `place.mercantile-coast.hammock-village-murkmire` | spacing-3/4 | site.scour.fringe-marsh.confluence-029 |
| `place.mercantile-coast.hereguard-plantation` | neighbour-zone | site.free.any-firm-ground-1217 |
| `place.mercantile-coast.insular-jungle-village` | spacing-1/2 | site.free.any-firm-ground-1112 |
| `place.mercantile-coast.keel-sakka-stilts` | neighbour-zone | site.free.any-shallow-marsh-1342 |
| `place.mercantile-coast.lilmoth-divers-yard` | neighbour-zone | site.scour.lake-standing-water.cove-008 |
| `place.mercantile-coast.naga-village-oliis` | neighbour-zone | site.free.any-firm-ground-1135 |
| `place.mercantile-coast.necropolis-village-murkmire` | spacing-3/4 | site.free.any-shallow-marsh-0974 |
| `place.mercantile-coast.oliis-boardwalk` | spacing-1/2 | site.free.roadside-0472 |
| `place.mercantile-coast.oliis-ferry-stage` | neighbour-zone | site.free.any-firm-ground-1241 |
| `place.mercantile-coast.screen-watch` | spacing-1/2 | site.free.any-shallow-marsh-1143 |
| `place.mercantile-coast.soulrest-quay-tradehouse` | neighbour-zone | site.free.roadside-0277 |
| `place.mercantile-coast.topal-salt-pans` | neighbour-zone | site.scour.ocean.natural-harbour-006 |
| `place.naga-kur-deeps.beast-keeper-crocodile` | spacing-3/4 | site.free.any-shallow-marsh-1224 |
| `place.naga-kur-deeps.bog-blight-ground-old-cordon` | neighbour-zone | site.free.any-shallow-marsh-1162 |
| `place.naga-kur-deeps.drifting-village-wet-mooring` | spacing-3/4 | site.free.any-shallow-marsh-1168 |
| `place.naga-kur-deeps.drowned-village-lake-deeps` | neighbour-zone | site.free.roadside-0425 |
| `place.naga-kur-deeps.drowning-narrows-tidal-gate` | neighbour-zone | site.free.any-shallow-marsh-1050 |
| `place.naga-kur-deeps.legendary-deep-feather-serpent` | neighbour-zone | site.free.any-shallow-marsh-1055 |
| `place.naga-kur-deeps.naga-village-raiding` | spacing-3/4 | site.scour.tropical-jungle.cove-029 |
| `place.naga-kur-deeps.poacher-camp-egg` | neighbour-zone | site.free.roadside-0582 |
| `place.naga-kur-deeps.raft-village-lashed` | spacing-3/4 | site.free.any-shallow-marsh-1209 |
| `place.naga-kur-deeps.sealed-xanmeer-vakka-deeps` | spacing-3/4 | site.free.any-shallow-marsh-1158 |
| `place.naga-kur-deeps.serpent-ground-moon-adder` | neighbour-zone | site.free.any-shallow-marsh-1191 |
| `place.naga-kur-deeps.voriplasm-chamber-breached` | spacing-1/2 | site.free.any-shallow-marsh-1159 |
| `place.naga-kur-deeps.wreck-submerged-barge` | neighbour-zone | site.free.any-shallow-marsh-1200 |
| `place.pirate-freeholds.channel-pirate-anchorage` | neighbour-zone | site.free.any-firm-ground-0223 |
| `place.pirate-freeholds.corimont-low-store` | neighbour-zone | site.free.any-firm-ground-0226 |
| `place.pirate-freeholds.freehold-naga-camp` | spacing-3/4 | site.free.any-firm-ground-0230 |
| `place.pirate-freeholds.freehold-pest-house` | neighbour-zone | site.free.roadside-0104 |
| `place.pirate-freeholds.reach-wreck` | neighbour-zone | site.free.roadside-0610 |
| `place.pirate-freeholds.rim-keystone-chamber` | neighbour-zone | site.free.any-firm-ground-0347 |
| `place.pirate-freeholds.rim-snowline-hermitage` | neighbour-zone | site.scour.border-mountains.summit-005 |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | neighbour-zone | site.scour.tropical-jungle.island-041 |

## Dangling relations: 99 edges point at deferred/cut/unknown records

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

any-firm-ground 272, any-shallow-marsh 96, ridge-end 25, flood-high 21, ravine 15, cove 13, summit 12, gorge 11, spring-head 11, island 10, islet 10, anchor 9, cliff-bench 9, saddle 8, box-canyon 7, river-mouth 7, ford 5, waterfall 5, land-bridge 4, headland 3, isthmus 3, confluence 2, natural-harbour 2, oxbow 2, water-narrows 2, any-channel-bank 1, enclosed-clearing 1

## Homeless batch (unresolved)

- none: every live record found ground

## Tier 0–1 placements

| record | site | landform | region | why |
|---|---|---|---|---|
| `place.dunmer-north.bogmother` | site.scour.firm-lowland.summit-020 | summit | firm lowland | summit in firm lowland (danger band 2), 143 m from the nearest route; its choice #2 landform; won on landform, route, region. |
| `place.dunmer-north.gandranen-library` | site.scour.lake-standing-water.cliff-bench-026 | cliff-bench | lake & standing water | cliff bench in lake & standing water (danger band 5), 1157 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, remote. |
| `place.dunmer-north.gandranen-ruins` | site.scour.lake-standing-water.saddle-029 | saddle | lake & standing water | saddle in lake & standing water (danger band 5), 1197 m from the nearest route; at the water's edge; won on region, remote, route. |
| `place.dunmer-north.hatching-pools` | site.scour.fringe-marsh.cliff-bench-076 | cliff-bench | fringe marsh | cliff bench in fringe marsh (danger band 3), 217 m from the nearest route; at the water's edge; won on region, parent, route. |
| `place.dunmer-north.hissmir` | site.scour.firm-lowland.island-019 | island | firm lowland | island in firm lowland (danger band 2), 450 m from the nearest route; at the water's edge; won on region, danger, parent. |
| `place.dunmer-north.hixinoag` | site.scour.fringe-marsh.cliff-bench-053 | cliff-bench | fringe marsh | cliff bench in fringe marsh (danger band 3), 621 m from the nearest route; at the water's edge; won on region, route, ring. |
| `place.dunmer-north.hutan-tzel` | site.scour.firm-lowland.spring-head-038 | spring-head | firm lowland | spring head in firm lowland (danger band 2), 50 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |
| `place.dunmer-north.loriasel-caverns` | site.scour.upland-hills.spring-head-015 | spring-head | upland hills | spring head in upland hills (danger band 3), 777 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, remote. |
| `place.dunmer-north.mazzatun` | site.scour.upland-hills.ridge-end-066 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 246 m from the nearest route; its first-choice landform; won on landform, region, danger. |
| `place.dunmer-north.mazzatun-hist` | site.free.any-firm-ground-0302 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 319 m from the nearest route; its choice #3 landform; won on bound, landform, danger. |
| `place.dunmer-north.stillrise-village` | site.scour.lake-standing-water.box-canyon-042 | box-canyon | lake & standing water | box canyon in lake & standing water (danger band 5), 1285 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, remote. |
| `place.dunmer-north.stormhold` | anchor.stormhold | anchor | firm lowland | Owner-approved settlement anchor 'stormhold' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.ten-maur-wolk` | site.scour.upland-hills.box-canyon-002 | box-canyon | upland hills | box canyon in upland hills (danger band 3), 416 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote. |
| `place.dunmer-north.thorn` | anchor.thorn | anchor | firm lowland | Owner-approved settlement anchor 'thorn' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.wolk-market` | site.free.roadside-0557 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 61 m from the nearest route; at the water's edge; its choice #4 landform; won on route, landform, region. |
| `place.hist-heartland.bereaved-mnemic` | site.scour.fringe-marsh.flood-high-039 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 128 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.hist-heartland.cult-raid-camp-unbound` | site.scour.firm-lowland.flood-high-031 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 332 m from the nearest route; its choice #4 landform; won on landform, region, route. |
| `place.hist-heartland.greenspring` | site.free.any-firm-ground-0775 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 5), 464 m from the nearest route; no free 'confluence' site was left in the zone, so plain ground; won on bound, region, parent; placed from the homeless batch at stage 'neighbour-zone'. |
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
| `place.hist-heartland.root-talk-ground` | site.free.any-firm-ground-0807 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 654 m from the nearest route; its choice #3 landform; won on landform, region, parent. |
| `place.hist-heartland.rootworm-station-helstrom` | site.scour.firm-lowland.flood-high-024 | flood-high | firm lowland | flood high in firm lowland (danger band 5), 51 m from the nearest route; its first-choice landform; won on landform, bound, region; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.hist-heartland.sap-collection-facility-daedric` | site.free.any-firm-ground-0915 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 684 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on remote, region, parent. |
| `place.hist-heartland.sealed-xanmeer-living` | site.free.any-firm-ground-0480 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 477 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on remote, landform, parent. |
| `place.hist-heartland.stone-calendar-hist-tsoko` | site.scour.firm-lowland.summit-033 | summit | firm lowland | summit in firm lowland (danger band 3), 685 m from the nearest route; its first-choice landform; won on landform, route, region. |
| `place.hist-heartland.umpholo-mission` | site.free.any-firm-ground-0981 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 748 m from the nearest route; its choice #3 landform; won on landform, region, remote. |
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
| `place.imperial-fringe.slough-point` | site.free.roadside-0213 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 77 m from the nearest route; no free 'ford' site was left in the zone, so plain ground; won on region, parent, landform; placed from the homeless batch at stage 'spacing-1/2'. |
| `place.imperial-fringe.stonewastes` | site.scour.upland-hills.land-bridge-000 | land-bridge | upland hills | land bridge in upland hills (danger band 3), 658 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, ring. |
| `place.imperial-fringe.the-silent-halls` | site.free.any-firm-ground-0864 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 462 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, submerged, remote. |
| `place.imperial-fringe.the-stone-talkers-watch` | site.scour.upland-hills.ridge-end-055 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1018 m from the nearest route; its choice #2 landform; won on landform, sightline, region. |
| `place.imperial-penal-south.blackrose` | anchor.blackrose | anchor | fringe marsh | Owner-approved settlement anchor 'blackrose' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-penal-south.blackrose-drowned-hist` | site.scour.lake-standing-water.islet-033 | islet | lake & standing water | islet in lake & standing water (danger band 3), 172 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.blackrose-prison` | site.scour.firm-lowland.flood-high-000 | flood-high | firm lowland | flood high in firm lowland (danger band 2), 140 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.bramman-head` | site.scour.deep-river-corridor.land-bridge-036 | land-bridge | deep river corridor | land bridge in deep river corridor (danger band 3), 604 m from the nearest route; at the water's edge; won on region, danger, parent; placed from the homeless batch at stage 'region-relaxed'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.chainbreaker-shelter` | site.free.any-firm-ground-1359 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 93 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.flu-quarantine-village` | site.scour.fringe-marsh.island-005 | island | fringe marsh | island in fringe marsh (danger band 3), 546 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lake-submerged-xanmeer` | site.free.any-shallow-marsh-1247 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 280 m from the nearest route; at the water's edge; no free 'island' site was left in the zone, so plain ground; won on submerged, parent, landform; placed from the homeless batch at stage 'spacing-3/4'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lilmothiit-quarry` | site.scour.lake-standing-water.cove-034 | cove | lake & standing water | cove in lake & standing water (danger band 3), 104 m from the nearest route; at the water's edge; won on region, danger, parent; placed from the homeless batch at stage 'spacing-3/4'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.longmont` | site.scour.fringe-marsh.river-mouth-009 | river-mouth | fringe marsh | river mouth in fringe marsh (danger band 3), 219 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.murkwood-verge` | site.free.any-firm-ground-1294 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 236 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, parent, remote; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.rose-flooded-passage` | site.free.any-firm-ground-1318 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 229 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, region; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.imperial-penal-south.rose-supply-town` | site.scour.fringe-marsh.ford-030 | ford | fringe marsh | ford in fringe marsh (danger band 2), 61 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.three-gate-toll` | site.scour.fringe-marsh.ford-047 | ford | fringe marsh | ford in fringe marsh (danger band 2), 106 m from the nearest route; at the water's edge; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.west-market-town` | site.free.roadside-0022 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 33 m from the nearest route; at the water's edge; its choice #4 landform; won on route, landform, region; placed from the homeless batch at stage 'spacing-1/2'; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.alten-meerhleel` | site.free.any-shallow-marsh-1322 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 2), 186 m from the nearest route; at the water's edge; no free 'natural-harbour' site was left in the zone, so plain ground; won on region, parent, navigable; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bramman-screen` | site.free.any-shallow-marsh-1215 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 3), 88 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bright-throat-village` | site.free.any-shallow-marsh-1121 | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 439 m from the nearest route; its choice #3 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.chasepoint` | site.free.roadside-0016 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 38 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.inhabited-meer-murkmire` | site.scour.fringe-marsh.flood-high-003 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 154 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.ixtaxh-xanmeer` | site.scour.lake-standing-water.islet-004 | islet | lake & standing water | islet in lake & standing water (danger band 3), 846 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.lilmoth` | anchor.lilmoth | anchor | firm lowland | Owner-approved settlement anchor 'lilmoth' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.rockpark` | site.scour.firm-lowland.flood-high-007 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 167 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.slaughter-memorial` | site.free.any-firm-ground-1258 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 1), 50 m from the nearest route; its choice #3 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.soulrest` | anchor.soulrest | anchor | fringe marsh | Owner-approved settlement anchor 'soulrest' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.teeth-of-sithis` | site.scour.tropical-jungle.summit-049 | summit | tropical jungle | summit in tropical jungle (danger band 4), 593 m from the nearest route; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.white-rose-prison` | site.scour.firm-lowland.flood-high-008 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 71 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.xinchei-konu` | site.scour.firm-lowland.summit-029 | summit | firm lowland | summit in firm lowland (danger band 2), 377 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.bereaved-hist-less-since` | site.free.any-firm-ground-1130 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 4), 449 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, ring; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.dead-water-village` | site.free.any-firm-ground-1115 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 633 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.deepmire-refuge` | site.scour.interior-swamp.flood-high-029 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 568 m from the nearest route; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.ferry-stage-guide-hire` | site.scour.interior-swamp.island-011 | island | interior swamp | island in interior swamp (danger band 2), 151 m from the nearest route; at the water's edge; won on region, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.harmed-hist-enslaved` | site.scour.interior-swamp.flood-high-017 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 151 m from the nearest route; its choice #2 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | site.free.any-shallow-marsh-1049 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 51 m from the nearest route; at the water's edge; no free 'confluence' site was left in the zone, so plain ground; won on region, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.naga-village-settled` | site.free.any-shallow-marsh-1210 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 135 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-gallery-blight-warren` | site.scour.rootland-deep-marsh.flood-high-026 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 544 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-whisper-village` | site.scour.rootland-deep-marsh.flood-high-023 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 491 m from the nearest route; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.sithis-temple-mass-sacrifice` | site.scour.rootland-deep-marsh.flood-high-037 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 719 m from the nearest route; its choice #3 landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.umbriel-stripped-undead` | site.free.any-shallow-marsh-1099 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 181 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.wild-hist-rogue-deeps` | site.scour.interior-swamp.island-007 | island | interior swamp | island in interior swamp (danger band 4), 639 m from the nearest route; at the water's edge; its choice #3 landform; won on remote, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.pirate-freeholds.alten-corimont` | anchor.alten-corimont | anchor | firm lowland | Owner-approved settlement anchor 'alten-corimont' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.pirate-freeholds.chasecreek` | site.free.any-firm-ground-0281 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 158 m from the nearest route; its first-choice landform; won on landform, region, parent. |
| `place.pirate-freeholds.corimont-hist-less-camp` | site.free.any-firm-ground-0276 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 412 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent. |
| `place.pirate-freeholds.opening-work-barge` | site.free.roadside-0050 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 77 m from the nearest route; no free 'any-channel-bank' site was left in the zone, so plain ground; won on sightline, region, parent. |
| `place.pirate-freeholds.opening-work-camp` | site.free.roadside-0053 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 56 m from the nearest route; its first-choice landform; won on landform, sightline, region. |
| `place.pirate-freeholds.rockpoint` | site.free.any-firm-ground-0277 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 306 m from the nearest route; no free 'cliff-bench' site was left in the zone, so plain ground; won on region, danger, landform. |
| `place.saxhleel-coast.archon` | anchor.archon | anchor | mangrove forest | Owner-approved settlement anchor 'archon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.saxhleel-coast.archon-harbour-hist` | site.free.any-firm-ground-0956 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 51 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, parent. |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | site.free.any-firm-ground-1013 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 313 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on bound, region, parent. |
| `place.saxhleel-coast.cantemir-headland` | site.free.any-firm-ground-1042 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 275 m from the nearest route; no free 'headland' site was left in the zone, so plain ground; won on region, parent, landform. |
| `place.saxhleel-coast.east-estuary-rootworm-station` | site.free.any-firm-ground-1014 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 143 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | site.scour.tropical-jungle.island-041 | island | tropical jungle | island in tropical jungle (danger band 4), 418 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, submerged; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.saxhleel-coast.portdun-mont` | site.scour.mangrove-forest.flood-high-030 | flood-high | mangrove forest | flood high in mangrove forest (danger band 2), 229 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.seafalls` | site.scour.tropical-jungle.water-narrows-009 | water-narrows | tropical jungle | water narrows in tropical jungle (danger band 2), 172 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |

## Owner-feedback checks (Part 4 step 2)

- stances: {'friendly': 80, 'wary': 97, 'hostile': 85, 'neutral': 205, 'guarded': 64, 'sanctuary': 35}
- swap pass exchanged 143 sites
- delves/combat places (D3+) with no friendly/sanctuary rest within 600 m (1200 m in D4–D5): 1

| city | purposes in 2 km | missing core purposes | hostile in 2 km | edge / hinterland / rural counts |
|---|---|---|---|---|
| stormhold | 14 | — | 18 | 11 / 58 / 115 |
| thorn | 13 | — | 14 | 8 / 54 / 62 |
| gideon | 14 | — | 24 | 16 / 76 / 112 |
| helstrom | 14 | — | 24 | 7 / 36 / 240 |
| archon | 12 | — | 10 | 5 / 32 / 74 |
| blackrose | 14 | — | 25 | 12 / 62 / 93 |
| lilmoth | 14 | — | 18 | 7 / 47 / 89 |
| soulrest | 13 | — | 10 | 7 / 30 / 78 |
| alten-corimont | 14 | — | 21 | 11 / 73 / 126 |

Rest-cadence gaps (add a rest or soften): `place.imperial-fringe.takes-the-field` (621 m)
