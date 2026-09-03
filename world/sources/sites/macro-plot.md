# Macro plot — coverage report (Phase 11 Part 3)

Seed 1103. Supply: 1172 scour sites + 2014 free-ground points. Demand: 527 live records; **527 plotted**, 0 unresolved.
Placed from the homeless batch: {'relaxed-score': 3, 'spacing-3/4': 33, 'spacing-1/2': 9, 'neighbour-zone': 11, 'region-relaxed': 2}.

| zone | live | plotted | homeless | landform wishes from recipe | top landforms |
|---|---|---|---|---|---|
| dunmer-north | 138 | 138 | 0 | 0 | any-firm-ground 62, cliff-bench 12, ridge-end 11, any-shallow-marsh 8 |
| hist-heartland | 111 | 111 | 0 | 111 | any-shallow-marsh 31, any-firm-ground 30, flood-high 7, cliff-bench 6 |
| imperial-fringe | 121 | 121 | 0 | 0 | any-firm-ground 79, ridge-end 11, ravine 5, box-canyon 4 |
| imperial-penal-south | 21 | 21 | 0 | 21 | any-firm-ground 8, islet 3, ford 2, island 2 |
| mercantile-coast | 56 | 56 | 0 | 56 | any-firm-ground 24, any-shallow-marsh 10, flood-high 6, cove 4 |
| naga-kur-deeps | 39 | 39 | 0 | 39 | any-shallow-marsh 20, flood-high 6, cove 3, any-firm-ground 2 |
| pirate-freeholds | 17 | 17 | 0 | 0 | any-firm-ground 13, anchor 1, cliff-bench 1, ridge-end 1 |
| saxhleel-coast | 24 | 24 | 0 | 0 | any-firm-ground 7, any-shallow-marsh 6, cove 3, islet 2 |

## Spacing and routes

- nearest-neighbour distance p5 / median / p95: 91 / 175 / 323 m
- same-type pairs closer than 300 m: 2
- median distance to a route: 208 m; fine-tempo records within 300 m of a route: 66 %
- route-visibility sweep (357 samples every 150 m, radius 450 m): mean 3.63 destination/landmark places in sight; dead 7 %, crowded (4+) 50 %

## Anti-sameyness quota (no type > 25 % of a zone)

- none

## Named constraints (sightline / bound), as plotted

| record | kind | to | m | line of sight |
|---|---|---|---|---|
| `place.dunmer-north.mazzatun-hist` | bound | `place.dunmer-north.mazzatun` | 204 | — |
| `place.dunmer-north.murkwater-shadowscale-ground` | bound | `place.dunmer-north.murkwater` | 317 | — |
| `place.dunmer-north.stormhold-causeway` | bound | `place.dunmer-north.stormhold` | 245 | — |
| `place.dunmer-north.ten-maur-wolk` | sightline | `place.dunmer-north.wolk-market` | 131 | True |
| `place.dunmer-north.the-first-count` | sightline | `place.dunmer-north.stormhold` | 216 | True |
| `place.dunmer-north.the-flu-cordon` | sightline | `place.dunmer-north.stillrise-village` | 496 | True |
| `place.dunmer-north.the-north-vista` | sightline | `place.dunmer-north.the-pass-station` | 574 | True |
| `place.dunmer-north.the-outer-silyanorn` | sightline | `place.dunmer-north.stormhold` | 795 | True |
| `place.dunmer-north.the-silyanorn-crown` | sightline | `place.dunmer-north.the-outer-silyanorn` | 529 | True |
| `place.dunmer-north.the-slumped-hamlet` | sightline | `place.dunmer-north.the-shut-village` | 116 | True |
| `place.dunmer-north.the-stormhold-falls-chamber` | bound | `place.dunmer-north.stormhold` | 357 | — |
| `place.dunmer-north.the-thorn-bond` | bound | `place.dunmer-north.thorn` | 397 | — |
| `place.dunmer-north.the-veterans-ridge` | sightline | `place.dunmer-north.tear-road-stage` | 637 | True |
| `place.dunmer-north.thorn-paddy-terraces` | bound | `place.dunmer-north.thorn` | 169 | — |
| `place.dunmer-north.wolk-market` | sightline | `place.dunmer-north.ten-maur-wolk` | 131 | True |
| `place.hist-heartland.rootworm-station-helstrom` | bound | `place.hist-heartland.helstrom` | 279 | — |
| `place.hist-heartland.sap-tapping-licensed` | sightline | `place.hist-heartland.harmed-hist-tapped` | 236 | True |
| `place.hist-heartland.vista-ledge-canopy-break` | sightline | `place.hist-heartland.helstrom` | 1285 | True |
| `place.imperial-fringe.ashen-tower` | sightline | `place.imperial-fringe.fort-swampmoth` | 1468 | True |
| `place.imperial-fringe.castle-giovesse` | sightline | `place.imperial-fringe.gideon` | 429 | True |
| `place.imperial-fringe.fort-swampmoth` | sightline | `place.imperial-fringe.mile-house-of-the-eagle` | 839 | True |
| `place.imperial-fringe.gideon-rootworm-terminus` | bound | `place.imperial-fringe.gideon` | 233 | — |
| `place.imperial-fringe.gideon-synod-outstation` | bound | `place.imperial-fringe.gideon` | 289 | — |
| `place.imperial-fringe.giovesse-lines` | sightline | `place.imperial-fringe.castle-giovesse` | 701 | True |
| `place.imperial-fringe.glenbridge` | sightline | `place.imperial-fringe.glenbridge-sermon-xanmeer` | 400 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | sightline | `place.imperial-fringe.glenbridge` | 400 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | bound | `place.imperial-fringe.glenbridge` | 400 | — |
| `place.imperial-fringe.hearth-house-of-the-burnt-field` | bound | `place.imperial-fringe.cartwrights-cross` | 113 | — |
| `place.imperial-fringe.ridge-runners-post` | sightline | `place.imperial-fringe.ashen-tower` | 161 | True |
| `place.imperial-fringe.slough-point-quarantine-shed` | bound | `place.imperial-fringe.slough-point` | 271 | — |
| `place.imperial-fringe.the-drowning-gate` | sightline | `place.imperial-fringe.the-embankment-that-drowned` | 269 | True |
| `place.imperial-fringe.the-embankment-that-drowned` | sightline | `place.imperial-fringe.the-drowning-gate` | 269 | True |
| `place.imperial-fringe.the-marble-field` | sightline | `place.imperial-fringe.gideon` | 369 | True |
| `place.imperial-fringe.the-ring-of-nine-wells` | sightline | `place.imperial-fringe.twyllbek-ruins` | 285 | True |
| `place.imperial-fringe.the-shut-door` | sightline | `place.imperial-fringe.the-kept-terrace` | 672 | True |
| `place.imperial-fringe.the-snowline-cell` | sightline | `place.imperial-fringe.ridge-runners-post` | 743 | True |
| `place.imperial-fringe.the-stone-talkers-watch` | sightline | `place.imperial-fringe.rockgrove` | 546 | True |
| `place.imperial-fringe.the-two-lamps-hermitage` | sightline | `place.imperial-fringe.the-lamp-at-the-ford` | 99 | True |
| `place.imperial-fringe.twyllbek-crown` | sightline | `place.imperial-fringe.twyllbek-ruins` | 633 | True |
| `place.imperial-penal-south.blackrose-prison` | bound | `place.imperial-penal-south.blackrose` | 141 | — |
| `place.mercantile-coast.soulrest-breaking-yard` | bound | `place.mercantile-coast.soulrest` | 88 | — |
| `place.saxhleel-coast.archon-harbour-hist` | bound | `place.saxhleel-coast.archon` | 220 | — |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | bound | `place.saxhleel-coast.archon` | 365 | — |

## Records placed from the homeless batch

| record | stage | site |
|---|---|---|
| `place.dunmer-north.channel-cross-village` | relaxed-score | site.scour.lake-standing-water.cliff-bench-025 |
| `place.dunmer-north.climbs-to-see` | spacing-3/4 | site.free.any-shallow-marsh-0256 |
| `place.dunmer-north.hatching-pools` | spacing-1/2 | site.free.any-shallow-marsh-0176 |
| `place.dunmer-north.keeps-the-second-island` | spacing-1/2 | site.free.any-firm-ground-0127 |
| `place.dunmer-north.murkwater` | spacing-1/2 | site.free.roadside-0556 |
| `place.dunmer-north.murkwater-shadowscale-ground` | spacing-1/2 | site.scour.lake-standing-water.ravine-089 |
| `place.dunmer-north.one-house-high` | spacing-3/4 | site.free.any-firm-ground-0253 |
| `place.dunmer-north.sings-for-the-pipes` | neighbour-zone | site.free.any-firm-ground-0364 |
| `place.dunmer-north.sits-above-the-flood` | spacing-3/4 | site.free.any-firm-ground-0280 |
| `place.dunmer-north.stands-on-the-island` | spacing-1/2 | site.free.roadside-0150 |
| `place.dunmer-north.tearmouth` | spacing-3/4 | site.free.any-firm-ground-0157 |
| `place.dunmer-north.the-diggings-ladder` | spacing-3/4 | site.free.any-shallow-marsh-0317 |
| `place.dunmer-north.the-dres-rows` | spacing-3/4 | site.free.any-firm-ground-0111 |
| `place.dunmer-north.the-gravel-six` | spacing-3/4 | site.free.any-firm-ground-0278 |
| `place.dunmer-north.the-veterans-ridge` | spacing-3/4 | site.scour.border-mountains.summit-013 |
| `place.dunmer-north.the-whispers-dig` | spacing-3/4 | site.scour.fringe-marsh.cliff-bench-076 |
| `place.dunmer-north.the-white-pans` | neighbour-zone | site.scour.ocean.cove-068 |
| `place.dunmer-north.three-ways-over-water` | spacing-3/4 | site.free.any-shallow-marsh-0417 |
| `place.dunmer-north.ties-four-ways` | neighbour-zone | site.scour.mangrove-forest.cove-045 |
| `place.dunmer-north.wolk-market` | spacing-1/2 | site.scour.firm-lowland.saddle-016 |
| `place.imperial-fringe.bog-iron-workings` | spacing-3/4 | site.scour.seasonal-floodplain.river-mouth-007 |
| `place.imperial-fringe.bonded-shed-of-the-onkobra` | spacing-3/4 | site.free.any-firm-ground-1082 |
| `place.imperial-fringe.cassian-farm` | neighbour-zone | site.free.any-firm-ground-1109 |
| `place.imperial-fringe.claywater-station` | spacing-3/4 | site.free.roadside-0382 |
| `place.imperial-fringe.hearth-house-of-the-burnt-field` | spacing-3/4 | site.scour.upland-hills.waterfall-006 |
| `place.imperial-fringe.highwater-hamlet` | spacing-3/4 | site.free.any-firm-ground-0614 |
| `place.imperial-fringe.ladder-to-the-light` | spacing-3/4 | site.free.roadside-0253 |
| `place.imperial-fringe.long-causeway` | spacing-1/2 | site.scour.lake-standing-water.isthmus-005 |
| `place.imperial-fringe.lower-onkobra-paddies` | spacing-3/4 | site.free.roadside-0200 |
| `place.imperial-fringe.red-cart-yard` | spacing-3/4 | site.free.roadside-0171 |
| `place.imperial-fringe.reedcutters-toll` | spacing-1/2 | site.free.roadside-0180 |
| `place.imperial-fringe.slough-point-quarantine-shed` | spacing-3/4 | site.free.roadside-0230 |
| `place.imperial-fringe.the-drowning-gate` | spacing-3/4 | site.free.roadside-0241 |
| `place.imperial-fringe.the-embankment-that-drowned` | spacing-3/4 | site.free.any-firm-ground-0716 |
| `place.imperial-fringe.the-old-quarters` | spacing-3/4 | site.free.roadside-0312 |
| `place.imperial-fringe.the-second-hearth` | spacing-3/4 | site.free.any-firm-ground-1085 |
| `place.imperial-fringe.the-turned-out` | relaxed-score | site.free.any-firm-ground-0798 |
| `place.imperial-fringe.the-vellum-estate` | spacing-3/4 | site.free.any-firm-ground-0528 |
| `place.imperial-penal-south.bramman-head` | region-relaxed | site.scour.fringe-marsh.water-narrows-007 |
| `place.imperial-penal-south.murkwood-verge` | relaxed-score | site.free.any-firm-ground-1331 |
| `place.imperial-penal-south.rockspring` | spacing-3/4 | site.free.any-shallow-marsh-1324 |
| `place.imperial-penal-south.west-market-town` | spacing-1/2 | site.free.roadside-0583 |
| `place.mercantile-coast.ashfield` | spacing-3/4 | site.free.roadside-0511 |
| `place.mercantile-coast.bereaved-village-murkmire` | spacing-3/4 | site.free.roadside-0459 |
| `place.mercantile-coast.hammock-village-murkmire` | spacing-3/4 | site.free.any-firm-ground-1311 |
| `place.mercantile-coast.head-of-tide` | neighbour-zone | site.free.any-firm-ground-1051 |
| `place.mercantile-coast.high-junction` | neighbour-zone | site.free.any-shallow-marsh-1326 |
| `place.mercantile-coast.mudfoot` | spacing-3/4 | site.free.any-shallow-marsh-1279 |
| `place.mercantile-coast.naga-village-oliis` | neighbour-zone | site.free.any-firm-ground-1019 |
| `place.mercantile-coast.necropolis-village-murkmire` | spacing-3/4 | site.free.roadside-0588 |
| `place.mercantile-coast.oliis-boardwalk` | spacing-3/4 | site.free.any-shallow-marsh-1255 |
| `place.mercantile-coast.oliis-tide-run` | neighbour-zone | site.free.any-shallow-marsh-1368 |
| `place.mercantile-coast.soulrest-breaking-yard` | region-relaxed | site.free.roadside-0002 |
| `place.naga-kur-deeps.drifting-village-wet-mooring` | spacing-3/4 | site.free.any-shallow-marsh-1167 |
| `place.naga-kur-deeps.drowned-village-lake-deeps` | neighbour-zone | site.scour.lake-standing-water.cove-017 |
| `place.naga-kur-deeps.portage-slipway-narrows-deeps` | neighbour-zone | site.free.any-firm-ground-1079 |
| `place.naga-kur-deeps.raft-village-lashed` | spacing-3/4 | site.scour.interior-swamp.cove-046 |
| `place.pirate-freeholds.dunmer-frontier-holding` | neighbour-zone | site.scour.border-mountains.ridge-end-073 |

## Dangling relations: 301 edges point at deferred/cut/unknown records

(Part 4 catalogue work: promote the depended-upon record or prune the edge. First 40:)

- `place.dunmer-north.bogmother`.reachedVia → `route.bogmother-causeway` (unknown id)
- `place.dunmer-north.hatching-pools`.patrols → `route.shadowfen-paths` (unknown id)
- `place.dunmer-north.hissmir`.supplies → `place.saxhleel-coast.coast-hist-less-refuge` (deferred/cut)
- `place.dunmer-north.hixinoag`.dependsOn → `route.northern-caravan` (unknown id)
- `place.dunmer-north.riverwalk`.tolls → `route.northern-trunk` (unknown id)
- `place.dunmer-north.stillrise-village`.reachedVia → `route.shadowfen-paths` (unknown id)
- `place.dunmer-north.stormhold`.tolls → `route.northern-river` (unknown id)
- `place.dunmer-north.stormhold`.reachedVia → `route.northern-river` (unknown id)
- `place.dunmer-north.stormhold`.reachedVia → `route.tear-road` (unknown id)
- `place.dunmer-north.tear-road-stage`.dependsOn → `route.tear-road` (unknown id)
- `place.dunmer-north.the-ash-holding`.reachedVia → `route.tear-road` (unknown id)
- `place.dunmer-north.the-borrowed-tomb`.reachedVia → `route.tear-road` (unknown id)
- `place.dunmer-north.the-cold-holding`.reachedVia → `route.tear-road` (unknown id)
- `place.dunmer-north.the-delta-byre`.supplies → `route.tear-road` (unknown id)
- `place.dunmer-north.the-drover-camp`.patrols → `route.tear-road` (unknown id)
- `place.dunmer-north.the-field-gate-garrison`.patrols → `route.tear-road` (unknown id)
- `place.dunmer-north.the-freed-rows`.supplies → `place.pirate-freeholds.freed-worker-shelter` (deferred/cut)
- `place.dunmer-north.the-monsoon-boom`.dependsOn → `route.tear-road` (unknown id)
- `place.dunmer-north.the-north-border-post`.patrols → `route.tear-road` (unknown id)
- `place.dunmer-north.the-north-vista`.reachedVia → `route.tear-road` (unknown id)
- `place.dunmer-north.the-opened-terrace`.reachedVia → `route.shadowfen-paths` (unknown id)
- `place.dunmer-north.the-pass-station`.dependsOn → `route.tear-road` (unknown id)
- `place.dunmer-north.the-pen-yard`.reachedVia → `route.tear-road` (unknown id)
- `place.dunmer-north.the-salt-and-shell`.dependsOn → `route.tear-road` (unknown id)
- `place.dunmer-north.the-shut-village`.reachedVia → `route.shadowfen-paths` (unknown id)
- `place.dunmer-north.the-stripped-village`.reachedVia → `route.shadowfen-paths` (unknown id)
- `place.dunmer-north.the-two-gate-bridge`.tolls → `route.tear-road` (unknown id)
- `place.dunmer-north.the-xanmeer-hold`.patrols → `route.shadowfen-paths` (unknown id)
- `place.dunmer-north.thorn`.tolls → `route.tear-road` (unknown id)
- `place.dunmer-north.thorn`.reachedVia → `route.northern-trunk` (unknown id)
- `place.dunmer-north.thorn`.reachedVia → `route.tear-road` (unknown id)
- `place.hist-heartland.artisan-chime-makers`.supplies → `place.mercantile-coast.vossa-satl-village` (deferred/cut)
- `place.hist-heartland.artisan-chime-makers`.rivals → `place.mercantile-coast.vossa-satl-village` (deferred/cut)
- `place.hist-heartland.bone-waystation-interior`.dependsOn → `place.imperial-penal-south.rose-bone-waystation` (deferred/cut)
- `place.hist-heartland.bone-waystation-interior`.dependsOn → `place.mercantile-coast.bone-waystation` (deferred/cut)
- `place.hist-heartland.helstrom`.reachedVia → `escorted boat convoy from Alten Corimont` (unknown id)
- `place.hist-heartland.helstrom`.reachedVia → `root transit (semi-public hub)` (unknown id)
- `place.imperial-fringe.ashen-tower`.patrols → `route.blackwood-road` (unknown id)
- `place.imperial-fringe.bonded-shed-of-the-onkobra`.rivals → `place.mercantile-coast.collections-bond` (deferred/cut)
- `place.imperial-fringe.cartwrights-cross`.tolls → `route.blackwood-road` (unknown id)

## Landforms used

any-firm-ground 225, any-shallow-marsh 77, ridge-end 24, flood-high 22, cliff-bench 21, summit 15, cove 14, islet 14, ravine 14, box-canyon 11, gorge 11, water-narrows 10, anchor 9, saddle 9, isthmus 7, island 6, river-mouth 6, land-bridge 5, spring-head 5, enclosed-clearing 4, ford 4, oxbow 4, waterfall 4, confluence 2, headland 2, sinkhole 2

## Homeless batch (unresolved)

- none: every live record found ground

## Tier 0–1 placements

| record | site | landform | region | why |
|---|---|---|---|---|
| `place.dunmer-north.bogmother` | site.scour.firm-lowland.summit-020 | summit | firm lowland | summit in firm lowland (danger band 2), 143 m from the nearest route; its choice #2 landform; won on landform, route, danger. |
| `place.dunmer-north.gandranen-library` | site.scour.fringe-marsh.cliff-bench-056 | cliff-bench | fringe marsh | cliff bench in fringe marsh (danger band 3), 672 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote. |
| `place.dunmer-north.gandranen-ruins` | site.scour.upland-hills.ridge-end-057 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 586 m from the nearest route; its first-choice landform; won on landform, region, remote. |
| `place.dunmer-north.hatching-pools` | site.free.any-shallow-marsh-0176 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 2), 33 m from the nearest route; at the water's edge; no free 'spring-head' site was left in the zone, so plain ground; won on region, parent, landform; placed from the homeless batch at stage 'spacing-1/2'. |
| `place.dunmer-north.hissmir` | site.free.any-firm-ground-0195 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 612 m from the nearest route; its first-choice landform; won on landform, region. |
| `place.dunmer-north.hixinoag` | site.free.roadside-0153 | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 3), 89 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region. |
| `place.dunmer-north.hutan-tzel` | site.scour.firm-lowland.cliff-bench-070 | cliff-bench | firm lowland | cliff bench in firm lowland (danger band 2), 183 m from the nearest route; at the water's edge; its choice #5 landform; won on region, landform, danger. |
| `place.dunmer-north.loriasel-caverns` | site.scour.lake-standing-water.ravine-016 | ravine | lake & standing water | ravine in lake & standing water (danger band 5), 765 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote. |
| `place.dunmer-north.mazzatun` | site.scour.upland-hills.ridge-end-066 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 246 m from the nearest route; its first-choice landform; won on landform, region, danger. |
| `place.dunmer-north.mazzatun-hist` | site.free.any-firm-ground-0308 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 319 m from the nearest route; its choice #3 landform; won on bound, landform, danger. |
| `place.dunmer-north.stillrise-village` | site.scour.firm-lowland.box-canyon-011 | box-canyon | firm lowland | box canyon in firm lowland (danger band 3), 311 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, parent. |
| `place.dunmer-north.stormhold` | anchor.stormhold | anchor | firm lowland | Owner-approved settlement anchor 'stormhold' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.ten-maur-wolk` | site.scour.fringe-marsh.box-canyon-046 | box-canyon | fringe marsh | box canyon in fringe marsh (danger band 3), 103 m from the nearest route; at the water's edge; its first-choice landform; won on landform, route, region. |
| `place.dunmer-north.thorn` | anchor.thorn | anchor | firm lowland | Owner-approved settlement anchor 'thorn' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.dunmer-north.wolk-market` | site.scour.firm-lowland.saddle-016 | saddle | firm lowland | saddle in firm lowland (danger band 3), 215 m from the nearest route; at the water's edge; won on sightline, region, parent; placed from the homeless batch at stage 'spacing-1/2'. |
| `place.hist-heartland.bereaved-mnemic` | site.scour.fringe-marsh.flood-high-036 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 186 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.cult-raid-camp-unbound` | site.scour.firm-lowland.flood-high-031 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 332 m from the nearest route; its choice #4 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.greenspring` | site.scour.fringe-marsh.flood-high-039 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 128 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.guide-camp-gate-side` | site.scour.rootland-deep-marsh.islet-024 | islet | rootland deep marsh | islet in rootland deep marsh (danger band 4), 283 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.helstrom` | anchor.helstrom | anchor | lake & standing water | Owner-approved settlement anchor 'helstrom' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.hist-heartland.heretic-stone-restarted` | site.scour.upland-hills.ridge-end-049 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 182 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.hist-agaceph-needle` | site.scour.tropical-jungle.spring-head-043 | spring-head | tropical jungle | spring head in tropical jungle (danger band 4), 625 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.hist-first-rain-trunk` | site.scour.rootland-deep-marsh.enclosed-clearing-000 | enclosed-clearing | rootland deep marsh | enclosed clearing in rootland deep marsh (danger band 5), 88 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.hist-paatru-lowcrown` | site.scour.rootland-deep-marsh.spring-head-041 | spring-head | rootland deep marsh | spring head in rootland deep marsh (danger band 4), 11 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.hist-sarpa-highflower` | site.free.any-shallow-marsh-0382 | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 652 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on region, remote, parent; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.lost-city` | site.scour.tropical-jungle.summit-019 | summit | tropical jungle | summit in tropical jungle (danger band 4), 879 m from the nearest route; its choice #4 landform; won on route, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.nightbound-lightless` | site.scour.rootland-deep-marsh.gorge-042 | gorge | rootland deep marsh | gorge in rootland deep marsh (danger band 4), 74 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.refuge-station-interior` | site.scour.rootland-deep-marsh.cliff-bench-064 | cliff-bench | rootland deep marsh | cliff bench in rootland deep marsh (danger band 5), 581 m from the nearest route; at the water's edge; its choice #3 landform; won on remote, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.root-gallery-cult-warren` | site.scour.rootland-deep-marsh.sinkhole-001 | sinkhole | rootland deep marsh | sinkhole in rootland deep marsh (danger band 4), 287 m from the nearest route; its choice #2 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.root-gallery-helstrom-underway` | site.scour.rootland-deep-marsh.ravine-070 | ravine | rootland deep marsh | ravine in rootland deep marsh (danger band 4), 27 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.root-talk-ground` | site.free.any-firm-ground-0886 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 395 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.rootworm-station-helstrom` | site.scour.firm-lowland.flood-high-024 | flood-high | firm lowland | flood high in firm lowland (danger band 5), 51 m from the nearest route; its first-choice landform; won on landform, bound, region; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.sap-collection-facility-daedric` | site.scour.rootland-deep-marsh.box-canyon-012 | box-canyon | rootland deep marsh | box canyon in rootland deep marsh (danger band 5), 358 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.sealed-xanmeer-living` | site.scour.rootland-deep-marsh.island-034 | island | rootland deep marsh | island in rootland deep marsh (danger band 5), 311 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.stone-calendar-hist-tsoko` | site.scour.firm-lowland.summit-033 | summit | firm lowland | summit in firm lowland (danger band 3), 685 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.umpholo-mission` | site.free.any-firm-ground-0990 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 506 m from the nearest route; its choice #3 landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.xal-krona-making-ground` | site.free.any-shallow-marsh-0539 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 5), 396 m from the nearest route; its choice #3 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.xal-meeruth-station` | site.free.roadside-0417 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 63 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.hist-heartland.xanmeer-fort-defences-working` | site.scour.fringe-marsh.summit-048 | summit | fringe marsh | summit in fringe marsh (danger band 3), 209 m from the nearest route; its choice #2 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-fringe.castle-giovesse` | site.scour.upland-hills.summit-025 | summit | upland hills | summit in upland hills (danger band 3), 298 m from the nearest route; its first-choice landform; won on landform, route, sightline. |
| `place.imperial-fringe.fort-swampmoth` | site.scour.upland-hills.ridge-end-022 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 626 m from the nearest route; its first-choice landform; won on landform, sightline, region. |
| `place.imperial-fringe.gideon` | anchor.gideon | anchor | firm lowland | Owner-approved settlement anchor 'gideon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-fringe.gideon-rootworm-terminus` | site.free.any-firm-ground-0642 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 233 m from the nearest route; at the water's edge; its choice #4 landform; won on bound, landform, region. |
| `place.imperial-fringe.glenbridge` | site.free.roadside-0217 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 1), 25 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, danger. |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | site.scour.border-mountains.ridge-end-033 | ridge-end | border mountains | ridge end in border mountains (danger band 3), 419 m from the nearest route; its choice #2 landform; won on landform, bound, sightline. |
| `place.imperial-fringe.orma-tactile-ruin` | site.scour.border-mountains.box-canyon-039 | box-canyon | border mountains | box canyon in border mountains (danger band 3), 967 m from the nearest route; its first-choice landform; won on landform, remote, region. |
| `place.imperial-fringe.rockgrove` | site.scour.upland-hills.ridge-end-025 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1190 m from the nearest route; its choice #2 landform; won on landform, region, remote. |
| `place.imperial-fringe.slough-point` | site.scour.firm-lowland.water-narrows-020 | water-narrows | firm lowland | water narrows in firm lowland (danger band 2), 6 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, parent. |
| `place.imperial-fringe.stonewastes` | site.scour.firm-lowland.flood-high-004 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 176 m from the nearest route; its first-choice landform; won on landform, region, route. |
| `place.imperial-fringe.the-silent-halls` | site.free.any-firm-ground-0875 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 462 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region, submerged, remote. |
| `place.imperial-fringe.the-stone-talkers-watch` | site.scour.upland-hills.ridge-end-055 | ridge-end | upland hills | ridge end in upland hills (danger band 3), 1018 m from the nearest route; its choice #2 landform; won on landform, sightline, region. |
| `place.imperial-penal-south.blackrose` | anchor.blackrose | anchor | fringe marsh | Owner-approved settlement anchor 'blackrose' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.imperial-penal-south.blackrose-drowned-hist` | site.scour.lake-standing-water.islet-033 | islet | lake & standing water | islet in lake & standing water (danger band 3), 172 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.blackrose-prison` | site.scour.firm-lowland.flood-high-000 | flood-high | firm lowland | flood high in firm lowland (danger band 2), 140 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.bramman-head` | site.scour.fringe-marsh.water-narrows-007 | water-narrows | fringe marsh | water narrows in fringe marsh (danger band 2), 23 m from the nearest route; at the water's edge; its first-choice landform; won on landform, parent, route; placed from the homeless batch at stage 'region-relaxed'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.chainbreaker-shelter` | site.free.any-firm-ground-1370 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 93 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.flu-quarantine-village` | site.scour.fringe-marsh.island-005 | island | fringe marsh | island in fringe marsh (danger band 3), 546 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lake-submerged-xanmeer` | site.scour.lake-standing-water.islet-026 | islet | lake & standing water | islet in lake & standing water (danger band 3), 642 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lilmothiit-quarry` | site.free.any-firm-ground-1330 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 348 m from the nearest route; no free 'ravine' site was left in the zone, so plain ground; won on region, water; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.longmont` | site.scour.coastal-lagoon-salt-marsh.island-004 | island | coastal lagoon & salt marsh | island in coastal lagoon & salt marsh (danger band 3), 291 m from the nearest route; at the water's edge; won on region, route; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.murkwood-verge` | site.free.any-firm-ground-1331 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 334 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, remote; placed from the homeless batch at stage 'relaxed-score'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.rose-flooded-passage` | site.scour.lake-standing-water.cove-066 | cove | lake & standing water | cove in lake & standing water (danger band 4), 491 m from the nearest route; at the water's edge; won on region, submerged, remote; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.rose-supply-town` | site.scour.fringe-marsh.ford-030 | ford | fringe marsh | ford in fringe marsh (danger band 2), 61 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.three-gate-toll` | site.scour.fringe-marsh.ford-047 | ford | fringe marsh | ford in fringe marsh (danger band 2), 106 m from the nearest route; at the water's edge; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.west-market-town` | site.free.roadside-0583 | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 66 m from the nearest route; at the water's edge; its choice #4 landform; won on route, landform, region; placed from the homeless batch at stage 'spacing-1/2'; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.alten-meerhleel` | site.scour.fringe-marsh.cove-055 | cove | fringe marsh | cove in fringe marsh (danger band 2), 31 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bramman-screen` | site.free.any-shallow-marsh-1226 | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 3), 88 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bright-throat-village` | site.free.any-firm-ground-1057 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 420 m from the nearest route; no free 'cliff-bench' site was left in the zone, so plain ground; won on region, route, above_flood; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.chasepoint` | site.free.any-firm-ground-1366 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 74 m from the nearest route; at the water's edge; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.inhabited-meer-murkmire` | site.scour.fringe-marsh.flood-high-003 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 154 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.ixtaxh-xanmeer` | site.scour.lake-standing-water.islet-004 | islet | lake & standing water | islet in lake & standing water (danger band 3), 846 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, submerged; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.lilmoth` | anchor.lilmoth | anchor | fringe marsh | Owner-approved settlement anchor 'lilmoth' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.rockpark` | site.scour.fringe-marsh.flood-high-040 | flood-high | fringe marsh | flood high in fringe marsh (danger band 3), 269 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.slaughter-memorial` | site.scour.firm-lowland.flood-high-012 | flood-high | firm lowland | flood high in firm lowland (danger band 1), 67 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.soulrest` | anchor.soulrest | anchor | fringe marsh | Owner-approved settlement anchor 'soulrest' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.mercantile-coast.teeth-of-sithis` | site.scour.tropical-jungle.summit-049 | summit | tropical jungle | summit in tropical jungle (danger band 4), 593 m from the nearest route; its first-choice landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.white-rose-prison` | site.scour.firm-lowland.flood-high-007 | flood-high | firm lowland | flood high in firm lowland (danger band 4), 167 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.xinchei-konu` | site.scour.firm-lowland.summit-046 | summit | firm lowland | summit in firm lowland (danger band 2), 28 m from the nearest route; its first-choice landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.bereaved-hist-less-since` | site.scour.rootland-deep-marsh.oxbow-015 | oxbow | rootland deep marsh | oxbow in rootland deep marsh (danger band 5), 66 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.dead-water-village` | site.free.any-shallow-marsh-1164 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 206 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.deepmire-refuge` | site.scour.interior-swamp.flood-high-029 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 568 m from the nearest route; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.ferry-stage-guide-hire` | site.free.roadside-0579 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 2), 93 m from the nearest route; at the water's edge; no free 'water-narrows' site was left in the zone, so plain ground; won on region, danger, parent; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.harmed-hist-enslaved` | site.scour.interior-swamp.flood-high-028 | flood-high | interior swamp | flood high in interior swamp (danger band 4), 27 m from the nearest route; its choice #2 landform; won on landform, region, route; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | site.scour.interior-swamp.confluence-020 | confluence | interior swamp | confluence in interior swamp (danger band 4), 420 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.naga-village-settled` | site.free.any-shallow-marsh-1212 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 207 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on region; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-gallery-blight-warren` | site.scour.rootland-deep-marsh.flood-high-026 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 544 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-whisper-village` | site.scour.lake-standing-water.enclosed-clearing-002 | enclosed-clearing | lake & standing water | enclosed clearing in lake & standing water (danger band 4), 272 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.sithis-temple-mass-sacrifice` | site.scour.rootland-deep-marsh.flood-high-023 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 491 m from the nearest route; its choice #3 landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.umbriel-stripped-undead` | site.free.any-firm-ground-1141 | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 4), 449 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.wild-hist-rogue-deeps` | site.scour.rootland-deep-marsh.flood-high-037 | flood-high | rootland deep marsh | flood high in rootland deep marsh (danger band 5), 719 m from the nearest route; its choice #2 landform; won on remote, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.pirate-freeholds.alten-corimont` | anchor.alten-corimont | anchor | firm lowland | Owner-approved settlement anchor 'alten-corimont' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.pirate-freeholds.chasecreek` | site.free.any-firm-ground-0233 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 73 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on region, danger, parent. |
| `place.pirate-freeholds.corimont-hist-less-camp` | site.free.roadside-0067 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 39 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, danger. |
| `place.pirate-freeholds.rockpoint` | site.free.any-firm-ground-0282 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 412 m from the nearest route; at the water's edge; no free 'cliff-bench' site was left in the zone, so plain ground; won on region, danger. |
| `place.saxhleel-coast.archon` | anchor.archon | anchor | mangrove forest | Owner-approved settlement anchor 'archon' (world/sources/anchors, Phase 2 gate); position kept exactly. |
| `place.saxhleel-coast.archon-harbour-hist` | site.free.any-firm-ground-0967 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 51 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, bound, parent. |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | site.free.any-firm-ground-1025 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 313 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on bound, region, parent. |
| `place.saxhleel-coast.cantemir-headland` | site.scour.tropical-jungle.cove-029 | cove | tropical jungle | cove in tropical jungle (danger band 4), 514 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, remote, danger. |
| `place.saxhleel-coast.east-estuary-rootworm-station` | site.free.roadside-0527 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 32 m from the nearest route; its first-choice landform; won on landform, region, danger. |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | site.scour.lake-standing-water.cove-040 | cove | lake & standing water | cove in lake & standing water (danger band 3), 225 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, submerged. |
| `place.saxhleel-coast.portdun-mont` | site.free.any-firm-ground-1026 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 143 m from the nearest route; at the water's edge; no free 'cliff-bench' site was left in the zone, so plain ground; won on region, danger, parent. |
| `place.saxhleel-coast.seafalls` | site.scour.tropical-jungle.water-narrows-009 | water-narrows | tropical jungle | water narrows in tropical jungle (danger band 2), 172 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, danger. |
