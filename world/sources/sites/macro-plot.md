# Macro plot — coverage report (Phase 11 Part 3)

Seed 1103. Supply: 1185 scour sites + 3057 free-ground points. Demand: 580 live records; **567 plotted**, 13 unresolved.
Placed from the homeless batch: {'neighbour-zone': 9, 'spacing-1/2-region-relaxed': 4, 'region-relaxed': 1}.

| zone | live | plotted | homeless | landform wishes from recipe | top landforms |
|---|---|---|---|---|---|
| dunmer-north | 127 | 126 | 1 | 0 | any-firm-ground 70, ravine 9, ridge-end 7, any-shallow-marsh 6 |
| hist-heartland | 116 | 116 | 0 | 0 | any-firm-ground 59, any-shallow-marsh 25, flood-high 4, open-water 4 |
| imperial-fringe | 120 | 118 | 2 | 0 | any-firm-ground 79, local-tie 6, ravine 5, ridge-end 5 |
| imperial-penal-south | 44 | 39 | 5 | 43 | any-firm-ground 19, open-water 6, any-shallow-marsh 4, flood-high 2 |
| mercantile-coast | 65 | 63 | 2 | 65 | any-firm-ground 27, any-shallow-marsh 13, flood-high 5, open-water 5 |
| naga-kur-deeps | 40 | 39 | 1 | 27 | any-shallow-marsh 26, open-water 6, any-firm-ground 5, islet 1 |
| pirate-freeholds | 31 | 31 | 0 | 0 | any-firm-ground 21, cliff-bench 4, anchor 1, box-canyon 1 |
| saxhleel-coast | 37 | 35 | 2 | 0 | any-firm-ground 17, any-shallow-marsh 8, flood-high 3, anchor 1 |

## Spacing and routes

- nearest-neighbour distance p5 / median / p95: 74 / 124 / 263 m
- same-type pairs closer than 300 m: 1
- median distance to a route: 261 m; fine-tempo records within 300 m of a route: 58 %
- route-visibility sweep (359 samples every 150 m, radius 450 m): mean 3.84 destination/landmark places in sight; dead 10 %, crowded (4+) 48 %

## Anti-sameyness quota (no type > 25 % of a zone)

- none

## Named constraints (sightline / bound / water), as plotted

| record | kind | to | m | line of sight |
|---|---|---|---|---|
| `place.dunmer-north.bogmother` | sightline | `place.dunmer-north.the-black-stage` | 99 | True |
| `place.dunmer-north.bogmother` | bound | `place.dunmer-north.stormhold` | 461 | — |
| `place.dunmer-north.feeds-the-north` | minDepth | `None` | 4.4 | — |
| `place.dunmer-north.gandranen-library` | bound | `place.dunmer-north.gandranen-ruins` | 71 | — |
| `place.dunmer-north.hatching-pools` | bound | `place.dunmer-north.stormhold` | 122 | — |
| `place.dunmer-north.loriasel-caverns` | minDepth | `None` | 7.7 | — |
| `place.dunmer-north.mazzatun-hist` | bound | `place.dunmer-north.mazzatun` | 126 | — |
| `place.dunmer-north.murkwater-shadowscale-ground` | bound | `place.dunmer-north.murkwater` | 51 | — |
| `place.dunmer-north.stormhold-causeway` | bound | `place.dunmer-north.stormhold` | 249 | — |
| `place.dunmer-north.the-black-stage` | bound | `place.dunmer-north.stormhold-causeway` | 209 | — |
| `place.dunmer-north.the-charge-pond` | minDepth | `None` | 9.6 | — |
| `place.dunmer-north.the-diggings-ladder` | bound | `place.dunmer-north.silyanorn-diggings` | 194 | — |
| `place.dunmer-north.the-divers-landing` | bound | `place.dunmer-north.the-drowned-terrace` | 233 | — |
| `place.dunmer-north.the-divers-landing` | minDepth | `None` | 13.3 | — |
| `place.dunmer-north.the-drawdown-flats` | bound | `place.dunmer-north.the-drowned-terrace` | 247 | — |
| `place.dunmer-north.the-first-count` | sightline | `place.dunmer-north.stormhold` | 265 | True |
| `place.dunmer-north.the-flu-cordon` | sightline | `place.dunmer-north.stillrise-village` | 192 | True |
| `place.dunmer-north.the-outer-silyanorn` | sightline | `place.dunmer-north.stormhold` | 1257 | True |
| `place.dunmer-north.the-pen-yard` | sightline | `place.dunmer-north.the-dres-rows` | 99 | True |
| `place.dunmer-north.the-pen-yard` | bound | `place.dunmer-north.the-dres-rows` | 99 | — |
| `place.dunmer-north.the-shoal-bank` | minDepth | `None` | 7.6 | — |
| `place.dunmer-north.the-silyanorn-crown` | sightline | `place.dunmer-north.the-outer-silyanorn` | 143 | True |
| `place.dunmer-north.the-silyanorn-crown` | bound | `place.dunmer-north.the-outer-silyanorn` | 143 | — |
| `place.dunmer-north.the-slumped-hamlet` | sightline | `place.dunmer-north.the-shut-village` | 194 | True |
| `place.dunmer-north.the-slumped-hamlet` | nearWater | `body.2879-340` | 12.3 | — |
| `place.dunmer-north.the-standing-bid` | sightline | `place.dunmer-north.stormhold` | 102 | True |
| `place.dunmer-north.the-standing-bid` | bound | `place.dunmer-north.stormhold` | 102 | — |
| `place.dunmer-north.the-stormhold-falls-chamber` | bound | `place.dunmer-north.stormhold` | 262 | — |
| `place.dunmer-north.the-tear-wreck` | minDepth | `None` | 3.2 | — |
| `place.dunmer-north.the-thorn-bond` | bound | `place.dunmer-north.thorn` | 181 | — |
| `place.dunmer-north.the-thorn-bond` | minDepth | `None` | 1.2 | — |
| `place.dunmer-north.the-two-hundred-roofs` | minDepth | `None` | 3.8 | — |
| `place.dunmer-north.the-veterans-ridge` | sightline | `place.dunmer-north.tear-road-stage` | 911 | True |
| `place.dunmer-north.thorn-paddy-terraces` | bound | `place.dunmer-north.thorn` | 128 | — |
| `place.dunmer-north.waits-for-the-trial` | sightline | `place.dunmer-north.hissmir` | 133 | True |
| `place.dunmer-north.waits-for-the-trial` | bound | `place.dunmer-north.hissmir` | 133 | — |
| `place.hist-heartland.air-pocket-station-basin` | minDepth | `None` | 3.1 | — |
| `place.hist-heartland.bereaved-mnemic` | bound | `place.hist-heartland.walkway-junction-high-crossroads` | 96 | — |
| `place.hist-heartland.bubble-spire-collapsed` | bound | `place.hist-heartland.bubble-spire-open-helstrom` | 388 | — |
| `place.hist-heartland.guide-camp-far-shelter` | bound | `place.hist-heartland.guide-camp-gate-side` | 830 | — |
| `place.hist-heartland.guide-camp-gate-side` | bound | `place.hist-heartland.helstrom` | 71 | — |
| `place.hist-heartland.miregaunt-ward-approach` | bound | `place.hist-heartland.sealed-xanmeer-living` | 113 | — |
| `place.hist-heartland.root-gallery-drowned-stair` | minDepth | `None` | 3.2 | — |
| `place.hist-heartland.root-gallery-helstrom-underway` | bound | `place.hist-heartland.helstrom` | 232 | — |
| `place.hist-heartland.rootworm-station-helstrom` | bound | `place.hist-heartland.helstrom` | 92 | — |
| `place.hist-heartland.sap-tapping-licensed` | sightline | `place.hist-heartland.harmed-hist-tapped` | 445 | True |
| `place.hist-heartland.vista-ledge-canopy-break` | sightline | `place.hist-heartland.helstrom` | 1427 | True |
| `place.hist-heartland.wamasu-pond-nest` | minDepth | `None` | 9.5 | — |
| `place.hist-heartland.xal-krona-making-ground` | bound | `place.hist-heartland.lost-city` | 49 | — |
| `place.imperial-fringe.ashen-tower` | sightline | `place.imperial-fringe.fort-swampmoth` | 261 | True |
| `place.imperial-fringe.bonded-shed-of-the-onkobra` | bound | `place.imperial-fringe.gideon` | 50 | — |
| `place.imperial-fringe.bone-road-waystation` | bound | `place.imperial-fringe.the-counted-dead` | 613 | — |
| `place.imperial-fringe.cassian-farm` | bound | `place.imperial-fringe.gideon` | 882 | — |
| `place.imperial-fringe.castle-giovesse` | sightline | `place.imperial-fringe.gideon` | 300 | True |
| `place.imperial-fringe.collections-dig` | bound | `place.imperial-fringe.twyllbek-ruins` | 244 | — |
| `place.imperial-fringe.fort-swampmoth` | sightline | `place.imperial-fringe.mile-house-of-the-eagle` | 126 | True |
| `place.imperial-fringe.gideon-rootworm-terminus` | bound | `place.imperial-fringe.gideon` | 264 | — |
| `place.imperial-fringe.gideon-synod-outstation` | bound | `place.imperial-fringe.gideon` | 405 | — |
| `place.imperial-fringe.giovesse-lines` | sightline | `place.imperial-fringe.castle-giovesse` | 444 | True |
| `place.imperial-fringe.glenbridge` | sightline | `place.imperial-fringe.glenbridge-sermon-xanmeer` | 93 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | sightline | `place.imperial-fringe.glenbridge` | 93 | True |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | bound | `place.imperial-fringe.glenbridge` | 93 | — |
| `place.imperial-fringe.lower-onkobra-paddies` | nearWater | `river.352-503` | 32.0 | — |
| `place.imperial-fringe.onkobra-clay-pits` | nearWater | `river.352-503` | 170.3 | — |
| `place.imperial-fringe.onkobra-ferry` | nearWater | `river.352-503` | 29.5 | — |
| `place.imperial-fringe.onkobra-field-station` | nearWater | `river.352-503` | 17.3 | — |
| `place.imperial-fringe.ridge-runners-post` | sightline | `place.imperial-fringe.ashen-tower` | 123 | True |
| `place.imperial-fringe.swampmoth-town` | bound | `place.imperial-fringe.fort-swampmoth` | 330 | — |
| `place.imperial-fringe.the-abandoned-survey` | bound | `place.imperial-fringe.the-vellum-estate` | 442 | — |
| `place.imperial-fringe.the-drowning-gate` | sightline | `place.imperial-fringe.the-embankment-that-drowned` | 186 | True |
| `place.imperial-fringe.the-embankment-that-drowned` | sightline | `place.imperial-fringe.the-drowning-gate` | 186 | True |
| `place.imperial-fringe.the-marble-field` | sightline | `place.imperial-fringe.gideon` | 909 | True |
| `place.imperial-fringe.the-ring-of-nine-wells` | sightline | `place.imperial-fringe.twyllbek-ruins` | 654 | True |
| `place.imperial-fringe.the-sermon-road-camp` | bound | `place.imperial-fringe.glenbridge` | 154 | — |
| `place.imperial-fringe.the-shut-door` | sightline | `place.imperial-fringe.the-kept-terrace` | 367 | True |
| `place.imperial-fringe.the-snowline-cell` | sightline | `place.imperial-fringe.ridge-runners-post` | 200 | True |
| `place.imperial-fringe.twyllbek-crown` | sightline | `place.imperial-fringe.twyllbek-ruins` | 534 | True |
| `place.imperial-penal-south.akaviri-works` | bound | `place.imperial-penal-south.lilmothiit-quarry` | 334 | — |
| `place.imperial-penal-south.blackrose-drowned-hist` | nearWater | `body.1290-3508` | 0.0 | — |
| `place.imperial-penal-south.blackrose-drowned-hist` | minDepth | `None` | 3.7 | — |
| `place.imperial-penal-south.blackrose-prison` | bound | `place.imperial-penal-south.blackrose` | 185 | — |
| `place.imperial-penal-south.bramman-head` | minDepth | `None` | 3.6 | — |
| `place.imperial-penal-south.drowned-gallery` | bound | `place.imperial-penal-south.blackrose-prison` | 362 | — |
| `place.imperial-penal-south.flu-quarantine-village` | bound | `place.imperial-penal-south.blackrose` | 81 | — |
| `place.imperial-penal-south.lake-divers-yard` | nearWater | `body.1290-3508` | 11.0 | — |
| `place.imperial-penal-south.natural-dive-shaft` | nearWater | `body.1290-3508` | 12.3 | — |
| `place.imperial-penal-south.natural-dive-shaft` | minDepth | `None` | 3.7 | — |
| `place.imperial-penal-south.necromantic-dig` | bound | `place.imperial-penal-south.blackrose-prison` | 189 | — |
| `place.imperial-penal-south.plague-cordon` | bound | `place.imperial-penal-south.rose-supply-town` | 99 | — |
| `place.imperial-penal-south.rebellion-earthworks` | bound | `place.imperial-penal-south.akaviri-works` | 148 | — |
| `place.imperial-penal-south.rockspring` | bound | `place.imperial-penal-south.bramman-head` | 367 | — |
| `place.imperial-penal-south.rose-flooded-passage` | bound | `place.imperial-penal-south.blackrose-prison` | 245 | — |
| `place.imperial-penal-south.rose-outworks` | bound | `place.imperial-penal-south.blackrose-prison` | 404 | — |
| `place.imperial-penal-south.voriplasm-vault` | bound | `place.imperial-penal-south.bramman-head` | 270 | — |
| `place.mercantile-coast.alessian-hull` | minDepth | `None` | 24.2 | — |
| `place.mercantile-coast.bereaved-village-murkmire` | bound | `place.mercantile-coast.bog-blight-ground-murkmire` | 70 | — |
| `place.mercantile-coast.inhabited-meer-murkmire` | sightline | `place.mercantile-coast.soulrest` | 415 | True |
| `place.mercantile-coast.keshu-grove` | bound | `place.mercantile-coast.lilmoth` | 1411 | — |
| `place.mercantile-coast.lilmoth-divers-yard` | bound | `place.mercantile-coast.lilmoth` | 257 | — |
| `place.mercantile-coast.lilmoth-divers-yard` | minDepth | `None` | 20.8 | — |
| `place.mercantile-coast.oliis-boardwalk` | bound | `place.mercantile-coast.oliis-ferry-stage` | 2391 | — |
| `place.mercantile-coast.oliis-drake-deep` | bound | `place.mercantile-coast.oliis-air-station` | 462 | — |
| `place.mercantile-coast.oliis-drake-deep` | nearWater | `body.ocean` | 57.2 | — |
| `place.mercantile-coast.oliis-drake-deep` | minDepth | `None` | 12.4 | — |
| `place.mercantile-coast.oliis-ferry-stage` | minDepth | `None` | 24.6 | — |
| `place.mercantile-coast.pusbottom-barge` | bound | `place.mercantile-coast.lilmoth` | 253 | — |
| `place.mercantile-coast.quinrawl-anchorage` | minDepth | `None` | 6.1 | — |
| `place.mercantile-coast.sacked-customs-suburb` | sightline | `place.mercantile-coast.lilmoth` | 91 | True |
| `place.mercantile-coast.sacked-customs-suburb` | bound | `place.mercantile-coast.lilmoth` | 91 | — |
| `place.mercantile-coast.screen-watch` | sightline | `place.mercantile-coast.bramman-screen` | 359 | True |
| `place.mercantile-coast.screen-watch` | bound | `place.mercantile-coast.bramman-screen` | 359 | — |
| `place.mercantile-coast.soulrest-breaking-yard` | bound | `place.mercantile-coast.soulrest` | 164 | — |
| `place.mercantile-coast.soulrest-divers-yard` | bound | `place.mercantile-coast.soulrest` | 210 | — |
| `place.mercantile-coast.soulrest-quay-tradehouse` | bound | `place.mercantile-coast.soulrest` | 53 | — |
| `place.mercantile-coast.wraxu-stacks` | sightline | `place.mercantile-coast.wraxu-frieze` | 258 | True |
| `place.mercantile-coast.wraxu-stacks` | bound | `place.mercantile-coast.wraxu-frieze` | 258 | — |
| `place.naga-kur-deeps.drifting-village-wet-mooring` | bound | `place.naga-kur-deeps.leviathan-bone-field` | 160 | — |
| `place.naga-kur-deeps.root-whisper-village` | bound | `place.naga-kur-deeps.sealed-xanmeer-vakka-deeps` | 532 | — |
| `place.naga-kur-deeps.sinkhole-mouth-deeps` | minDepth | `None` | 1.2 | — |
| `place.pirate-freeholds.alten-corimont` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 101 | True |
| `place.pirate-freeholds.careening-hard` | bound | `place.pirate-freeholds.alten-corimont` | 168 | — |
| `place.pirate-freeholds.corimont-crosstrees` | bound | `place.pirate-freeholds.alten-corimont` | 101 | — |
| `place.pirate-freeholds.freehold-market` | bound | `place.pirate-freeholds.alten-corimont` | 46 | — |
| `place.pirate-freeholds.freehold-smithy` | sightline | `place.pirate-freeholds.careening-hard` | 326 | True |
| `place.pirate-freeholds.freehold-smithy` | bound | `place.pirate-freeholds.alten-corimont` | 209 | — |
| `place.pirate-freeholds.kothringi-river-ruin` | bound | `place.pirate-freeholds.alten-corimont` | 203 | — |
| `place.pirate-freeholds.opening-work-barge` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 458 | True |
| `place.pirate-freeholds.opening-work-barge` | bound | `place.pirate-freeholds.opening-work-camp` | 190 | — |
| `place.pirate-freeholds.opening-work-barge` | minDepth | `None` | 2.4 | — |
| `place.pirate-freeholds.opening-work-camp` | sightline | `place.pirate-freeholds.corimont-crosstrees` | 300 | True |
| `place.pirate-freeholds.opening-work-camp` | bound | `place.pirate-freeholds.opening-work-barge` | 190 | — |
| `place.pirate-freeholds.reach-wreck` | minDepth | `None` | 8.8 | — |
| `place.pirate-freeholds.rim-keystone-chamber` | bound | `place.pirate-freeholds.rim-pass-station` | 411 | — |
| `place.pirate-freeholds.veterans-holding` | sightline | `place.pirate-freeholds.trunk-toll-bridge` | 743 | True |
| `place.saxhleel-coast.archon-bonded-row` | bound | `place.saxhleel-coast.archon` | 243 | — |
| `place.saxhleel-coast.archon-bonded-row` | nearWater | `body.2834-2585` | 24.5 | — |
| `place.saxhleel-coast.archon-harbour-hist` | bound | `place.saxhleel-coast.archon` | 181 | — |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.archon` | 443 | True |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.padomaic-wrecker-beach` | 1157 | True |
| `place.saxhleel-coast.archon-lighthouse` | sightline | `place.saxhleel-coast.gap-reef` | 337 | True |
| `place.saxhleel-coast.archon-lighthouse` | bound | `place.saxhleel-coast.archon` | 443 | — |
| `place.saxhleel-coast.archon-sacked-quarter` | bound | `place.saxhleel-coast.archon` | 129 | — |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | bound | `place.saxhleel-coast.archon` | 154 | — |
| `place.saxhleel-coast.coast-hist-less-refuge` | bound | `place.saxhleel-coast.archon` | 624 | — |
| `place.saxhleel-coast.contested-bank` | bound | `place.saxhleel-coast.quay-tradehouse` | 289 | — |
| `place.saxhleel-coast.contested-bank` | minDepth | `None` | 3.1 | — |
| `place.saxhleel-coast.deep-bank` | minDepth | `None` | 21.2 | — |
| `place.saxhleel-coast.east-estuary-rootworm-station` | bound | `place.saxhleel-coast.archon` | 233 | — |
| `place.saxhleel-coast.estuary-keepers-lodge` | bound | `place.saxhleel-coast.archon-lighthouse` | 810 | — |
| `place.saxhleel-coast.gap-reef` | sightline | `place.saxhleel-coast.archon-lighthouse` | 337 | True |
| `place.saxhleel-coast.gap-reef` | bound | `place.saxhleel-coast.archon-lighthouse` | 337 | — |
| `place.saxhleel-coast.gap-reef` | minDepth | `None` | 3.1 | — |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | minDepth | `None` | 6.0 | — |
| `place.saxhleel-coast.oliis-coast-lay-by` | bound | `place.saxhleel-coast.archon` | 281 | — |
| `place.saxhleel-coast.outer-reef` | minDepth | `None` | 9.6 | — |
| `place.saxhleel-coast.padomaic-wrecker-beach` | sightline | `place.saxhleel-coast.archon-lighthouse` | 1157 | True |
| `place.saxhleel-coast.padomaic-wrecker-beach` | bound | `place.saxhleel-coast.archon-lighthouse` | 1157 | — |
| `place.saxhleel-coast.pearl-lots` | minDepth | `None` | 2.9 | — |
| `place.saxhleel-coast.quarantine-village-lagoon` | bound | `place.saxhleel-coast.archon` | 619 | — |

## Records placed from the homeless batch

| record | stage | site |
|---|---|---|
| `place.dunmer-north.the-slumped-hamlet` | neighbour-zone | site.scour.border-mountains.ford-033 |
| `place.imperial-fringe.glenbridge` | neighbour-zone | site.free.any-firm-ground-0317 |
| `place.imperial-fringe.lower-onkobra-paddies` | neighbour-zone | site.free.roadside-0266 |
| `place.imperial-fringe.onkobra-ferry` | neighbour-zone | site.local.onkobra-ferry-e1 |
| `place.imperial-fringe.swampmoth-town` | spacing-1/2-region-relaxed | site.local.swampmoth-town-1 |
| `place.imperial-fringe.the-quiet-pit` | neighbour-zone | site.local.the-quiet-pit-2 |
| `place.imperial-penal-south.lake-divers-yard` | region-relaxed | site.scour.firm-lowland.saddle-071 |
| `place.imperial-penal-south.natural-dive-shaft` | neighbour-zone | site.local.natural-dive-shaft-e169 |
| `place.imperial-penal-south.plague-cordon` | neighbour-zone | site.free.roadside-0107 |
| `place.naga-kur-deeps.deepmire-refuge` | neighbour-zone | site.free.any-firm-ground-1006 |
| `place.naga-kur-deeps.root-whisper-village` | spacing-1/2-region-relaxed | site.free.any-firm-ground-1091 |
| `place.saxhleel-coast.archon-bonded-row` | spacing-1/2-region-relaxed | site.free.any-firm-ground-1021 |
| `place.saxhleel-coast.archon-lighthouse` | spacing-1/2-region-relaxed | site.scour.mangrove-forest.flood-high-033 |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | neighbour-zone | site.free.any-firm-ground-0995 |

## Dangling relations: 1 edges point at deferred/cut/unknown records

(Part 4 catalogue work: promote the depended-upon record or prune the edge. First 40:)

- `place.mercantile-coast.bright-throat-village`.visibleFrom → `Oliis Bay` (unknown id)

## Landforms used

any-firm-ground 297, any-shallow-marsh 83, open-water 28, flood-high 16, ravine 15, ridge-end 13, cliff-bench 10, saddle 10, anchor 9, cove 8, local-tie 8, islet 7, box-canyon 6, gorge 6, island 6, spring-head 6, waterfall 6, summit 5, water-narrows 5, enclosed-clearing 4, ford 4, isthmus 4, pinned (Part 6 meso siting) 4, headland 3, land-bridge 1, natural-harbour 1, oxbow 1, river-mouth 1

## Homeless batch (unresolved)

- `place.saxhleel-coast.archon-shipyard` (tier 0)
- `place.imperial-fringe.the-stone-talkers-watch` (tier 1)
- `place.imperial-penal-south.longmont` (tier 1)
- `place.imperial-penal-south.three-gate-toll` (tier 1)
- `place.imperial-penal-south.west-market-town` (tier 1)
- `place.dunmer-north.the-field-gate-garrison` (tier 2)
- `place.imperial-penal-south.lake-boardwalk-village` (tier 2)
- `place.imperial-penal-south.lake-drowned-village` (tier 2)
- `place.imperial-fringe.the-empty-steading` (tier 3)
- `place.mercantile-coast.keel-sakka-stilts` (tier 3)
- `place.mercantile-coast.whitebone-reef` (tier 3)
- `place.naga-kur-deeps.wreck-submerged-barge` (tier 3)
- `place.saxhleel-coast.mangrove-reef` (tier 4)

## Tier 0–1 placements

| record | site | landform | region | why |
|---|---|---|---|---|
| `place.dunmer-north.bogmother` | committed.bogmother | saddle | firm lowland | saddle in firm lowland (danger band 4), 327 m from the nearest route; at the water's edge; won on bound, region, parent. |
| `place.dunmer-north.gandranen-library` | committed.gandranen-library | cliff-bench | border mountains | cliff bench in border mountains (danger band 3), 1491 m from the nearest route; its first-choice landform; won on culture-clump, landform, bound. |
| `place.dunmer-north.gandranen-ruins` | committed.gandranen-ruins | any-firm-ground | border mountains | firm ground in border mountains (danger band 3), 1421 m from the nearest route; at the water's edge; no free 'sinkhole' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.dunmer-north.hatching-pools` | committed.hatching-pools | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 44 m from the nearest route; no free 'spring-head' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.dunmer-north.hissmir` | committed.hissmir | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 419 m from the nearest route; its first-choice landform; won on culture-clump, landform, region. |
| `place.dunmer-north.hixinoag` | committed.hixinoag | any-firm-ground | seasonal floodplain | firm ground in seasonal floodplain (danger band 3), 47 m from the nearest route; no free 'oxbow' site was left in the zone, so plain ground; won on culture-clump, region, ring. |
| `place.dunmer-north.hutan-tzel` | committed.hutan-tzel | cliff-bench | firm lowland | cliff bench in firm lowland (danger band 3), 230 m from the nearest route; at the water's edge; its choice #5 landform; won on culture-clump, region, landform. |
| `place.dunmer-north.loriasel-caverns` | committed.loriasel-caverns | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 653 m from the nearest route; no free 'sinkhole' site was left in the zone, so plain ground; won on culture-clump, region, remote; needs 1 m of water. |
| `place.dunmer-north.mazzatun` | committed.mazzatun | pinned (Part 6 meso siting) | upland hills | Pinned by the Part 6 meso siting (world/sources/blueprints/place.dunmer-north.mazzatun.json): The rock shelf at the ridge end: 68 m x 42 m of ground between 198.3 m and 209 m, falling ~8.5 m north to south in three readable steps, flood band 0, 4.1 m above the water table, a headwater stream along its southern lip and a 55 m escarpment on the east. 85 m from Tsono-Xuhil and 296 m from the Gideon-Stormhold road. Every parcel measured on this ground fits the slope ladder at plinth, pad or dug-in; none needs a graded pad over 2 m. |
| `place.dunmer-north.mazzatun-hist` | committed.mazzatun-hist | ridge-end | upland hills | ridge end in upland hills (danger band 3), 253 m from the nearest route; won on culture-clump, bound, region. |
| `place.dunmer-north.stillrise-village` | committed.stillrise-village | island | seasonal floodplain | island in seasonal floodplain (danger band 3), 508 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, remote. |
| `place.dunmer-north.stormhold` | anchor.stormhold | anchor | firm lowland | Owner-approved settlement anchor 'stormhold' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.dunmer-north.ten-maur-wolk` | committed.ten-maur-wolk | box-canyon | upland hills | box canyon in upland hills (danger band 3), 1146 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote. |
| `place.dunmer-north.the-quiet-landing` | committed.the-quiet-landing | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 97 m from the nearest route; its choice #2 landform; won on landform, culture-clump, route. |
| `place.dunmer-north.the-standing-bid` | committed.the-standing-bid | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 12 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, bound. |
| `place.dunmer-north.thorn` | anchor.thorn | anchor | firm lowland | Owner-approved settlement anchor 'thorn' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.dunmer-north.wolk-market` | committed.wolk-market | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 86 m from the nearest route; its choice #4 landform; won on route, landform, region. |
| `place.hist-heartland.bereaved-mnemic` | committed.bereaved-mnemic | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 23 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.hist-heartland.cult-raid-camp-unbound` | committed.cult-raid-camp-unbound | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 544 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.hist-heartland.greenspring` | committed.greenspring | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 93 m from the nearest route; no free 'confluence' site was left in the zone, so plain ground; won on culture-clump, nearPoint, region. |
| `place.hist-heartland.guide-camp-gate-side` | committed.guide-camp-gate-side | islet | rootland deep marsh | islet in rootland deep marsh (danger band 5), 246 m from the nearest route; at the water's edge; won on culture-clump, bound, region. |
| `place.hist-heartland.helstrom` | anchor.helstrom | anchor | rootland deep marsh | Owner-approved settlement anchor 'helstrom' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.hist-heartland.heretic-stone-restarted` | committed.heretic-stone-restarted | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 377 m from the nearest route; at the water's edge; no free 'ridge-end' site was left in the zone, so plain ground; won on culture-clump, region, danger. |
| `place.hist-heartland.hist-agaceph-needle` | committed.hist-agaceph-needle | island | rootland deep marsh | island in rootland deep marsh (danger band 5), 359 m from the nearest route; at the water's edge; its choice #4 landform; won on landform, region, parent. |
| `place.hist-heartland.hist-first-rain-trunk` | committed.hist-first-rain-trunk | open-water | rootland deep marsh | open water in rootland deep marsh (danger band 5), 510 m from the nearest route; at the water's edge; won on culture-clump, region, remote. |
| `place.hist-heartland.hist-paatru-lowcrown` | committed.hist-paatru-lowcrown | spring-head | tropical jungle | spring head in tropical jungle (danger band 4), 258 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, landform, region. |
| `place.hist-heartland.hist-sarpa-highflower` | committed.hist-sarpa-highflower | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 117 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, parent. |
| `place.hist-heartland.lost-city` | committed.lost-city | enclosed-clearing | rootland deep marsh | enclosed clearing in rootland deep marsh (danger band 5), 501 m from the nearest route; at the water's edge; its first-choice landform; won on landform, region, remote. |
| `place.hist-heartland.nightbound-lightless` | committed.nightbound-lightless | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 4), 20 m from the nearest route; at the water's edge; no free 'gorge' site was left in the zone, so plain ground; won on culture-clump, region, danger. |
| `place.hist-heartland.refuge-station-interior` | committed.refuge-station-interior | flood-high | firm lowland | flood high in firm lowland (danger band 4), 215 m from the nearest route; its first-choice landform; won on landform, region, route. |
| `place.hist-heartland.root-gallery-cult-warren` | committed.root-gallery-cult-warren | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 398 m from the nearest route; its choice #5 landform; won on culture-clump, region, landform. |
| `place.hist-heartland.root-gallery-helstrom-underway` | committed.root-gallery-helstrom-underway | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 221 m from the nearest route; at the water's edge; no free 'flood-high' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.hist-heartland.root-talk-ground` | committed.root-talk-ground | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 378 m from the nearest route; its choice #3 landform; won on culture-clump, landform, region. |
| `place.hist-heartland.rootworm-station-helstrom` | committed.rootworm-station-helstrom | flood-high | firm lowland | flood high in firm lowland (danger band 5), 136 m from the nearest route; its first-choice landform; won on culture-clump, landform, bound. |
| `place.hist-heartland.sap-collection-facility-daedric` | committed.sap-collection-facility-daedric | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 449 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, remote, region. |
| `place.hist-heartland.sealed-xanmeer-living` | committed.sealed-xanmeer-living | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 456 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, remote. |
| `place.hist-heartland.stone-calendar-hist-tsoko` | committed.stone-calendar-hist-tsoko | summit | firm lowland | summit in firm lowland (danger band 5), 151 m from the nearest route; its first-choice landform; won on landform, culture-clump, route. |
| `place.hist-heartland.the-cut-circle` | committed.the-cut-circle | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 585 m from the nearest route; its choice #2 landform; won on culture-clump, landform, region. |
| `place.hist-heartland.umpholo-mission` | committed.umpholo-mission | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 76 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, parent; site exchanged in the swap pass with place.hist-heartland.dream-wallow-sap-pool (+0.66). |
| `place.hist-heartland.xal-krona-making-ground` | committed.xal-krona-making-ground | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 5), 510 m from the nearest route; no free 'box-canyon' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.hist-heartland.xal-meeruth-station` | committed.xal-meeruth-station | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 106 m from the nearest route; no free 'river-mouth' site was left in the zone, so plain ground; won on nearPoint, route, region; placed from the homeless batch at stage 'neighbour-repair'. |
| `place.hist-heartland.xanmeer-fort-defences-working` | committed.xanmeer-fort-defences-working | summit | firm lowland | summit in firm lowland (danger band 5), 98 m from the nearest route; its choice #2 landform; won on landform, region, route. |
| `place.imperial-fringe.castle-giovesse` | committed.castle-giovesse | summit | firm lowland | summit in firm lowland (danger band 3), 172 m from the nearest route; its first-choice landform; won on landform, culture-clump-yielded, route; placed from the homeless batch at stage 'spacing-1/2-region-relaxed'. |
| `place.imperial-fringe.fort-swampmoth` | committed.fort-swampmoth | any-firm-ground | upland hills | firm ground in upland hills (danger band 2), 93 m from the nearest route; its choice #5 landform; won on nearPoint, route, region; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.imperial-fringe.gideon` | anchor.gideon | anchor | firm lowland | Owner-approved settlement anchor 'gideon' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.imperial-fringe.gideon-rootworm-terminus` | committed.gideon-rootworm-terminus | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 74 m from the nearest route; its choice #4 landform; won on culture-clump, bound, landform. |
| `place.imperial-fringe.glenbridge` | site.free.any-firm-ground-0317 | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 593 m from the nearest route; its choice #3 landform; won on culture-clump, nearPoint, landform; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.imperial-fringe.glenbridge-sermon-xanmeer` | committed.glenbridge-sermon-xanmeer | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 547 m from the nearest route; no free 'summit' site was left in the zone, so plain ground; won on culture-clump, bound, region. |
| `place.imperial-fringe.orma-tactile-ruin` | committed.orma-tactile-ruin | box-canyon | upland hills | box canyon in upland hills (danger band 3), 806 m from the nearest route; at the water's edge; its first-choice landform; won on landform, remote, region. |
| `place.imperial-fringe.rockgrove` | committed.rockgrove | box-canyon | firm lowland | box canyon in firm lowland (danger band 3), 944 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, remote. |
| `place.imperial-fringe.slough-point` | committed.slough-point | open-water | firm lowland | open water in firm lowland (danger band 3), 875 m from the nearest route; at the water's edge; won on culture-clump, region, navigable. |
| `place.imperial-fringe.stonewastes` | committed.stonewastes | any-firm-ground | upland hills | firm ground in upland hills (danger band 3), 677 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on region, parent, landform; site exchanged in the swap pass with place.imperial-fringe.westfield-village (+1.27). |
| `place.imperial-fringe.the-silent-halls` | committed.the-silent-halls | enclosed-clearing | firm lowland | enclosed clearing in firm lowland (danger band 4), 114 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, landform, region. |
| `place.imperial-penal-south.blackrose` | anchor.blackrose | anchor | fringe marsh | Owner-approved settlement anchor 'blackrose' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.imperial-penal-south.blackrose-drowned-hist` | site.local.blackrose-drowned-hist-ew388 | open-water | seasonal floodplain | open water in seasonal floodplain (danger band 2), 61 m from the nearest route; at the water's edge; won on submerged, danger, parent; bound to body.1290-3508 within 30 m; needs 3 m of water; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.blackrose-prison` | committed.blackrose-prison | flood-high | firm lowland | flood high in firm lowland (danger band 2), 181 m from the nearest route; its first-choice landform; won on landform, bound, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.bramman-head` | committed.bramman-head | river-mouth | tidal delta | river mouth in tidal delta (danger band 2), 350 m from the nearest route; at the water's edge; won on nearPoint, parent, route; placed from the homeless batch at stage 'region-relaxed'; needs 1.2 m of water; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.chainbreaker-shelter` | committed.chainbreaker-shelter | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 3), 241 m from the nearest route; its first-choice landform; won on landform, culture-clump, region; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.flu-quarantine-village` | committed.flu-quarantine-village | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 33 m from the nearest route; its choice #3 landform; won on culture-clump, bound, landform; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lake-submerged-xanmeer` | committed.lake-submerged-xanmeer | open-water | lake & standing water | open water in lake & standing water (danger band 5), 283 m from the nearest route; at the water's edge; won on region, submerged, culture-clump; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.lilmothiit-quarry` | committed.lilmothiit-quarry | open-water | lake & standing water | open water in lake & standing water (danger band 3), 88 m from the nearest route; at the water's edge; won on nearPoint, region, danger; placed from the homeless batch at stage 'region-relaxed'; landform wishes taken from the type recipe (record had none). |
| `place.imperial-penal-south.murkwood-verge` | committed.murkwood-verge | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 2), 292 m from the nearest route; its choice #3 landform; won on landform, parent, culture-clump; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.imperial-penal-south.blasphemer-urn-vault (+0.73). |
| `place.imperial-penal-south.rose-flooded-passage` | committed.rose-flooded-passage | open-water | lake & standing water | open water in lake & standing water (danger band 3), 345 m from the nearest route; at the water's edge; won on bound, region, danger. |
| `place.imperial-penal-south.rose-supply-town` | committed.rose-supply-town | any-shallow-marsh | fringe marsh | shallow marsh in fringe marsh (danger band 2), 5 m from the nearest route; at the water's edge; no free 'ridge-end' site was left in the zone, so plain ground; won on culture-clump, nearPoint, route; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.alten-meerhleel` | committed.alten-meerhleel | any-shallow-marsh | coastal lagoon & salt marsh | shallow marsh in coastal lagoon & salt marsh (danger band 2), 38 m from the nearest route; at the water's edge; no free 'natural-harbour' site was left in the zone, so plain ground; won on region, parent, navigable; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bramman-screen` | committed.bramman-screen | isthmus | mangrove forest | isthmus in mangrove forest (danger band 3), 85 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.bright-throat-village` | committed.bright-throat-village | any-shallow-marsh | mangrove forest | shallow marsh in mangrove forest (danger band 3), 93 m from the nearest route; at the water's edge; its choice #3 landform; won on landform, region, parent; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.mercantile-coast.lighter-flotilla (+1.31). |
| `place.mercantile-coast.chasepoint` | committed.chasepoint | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 27 m from the nearest route; its first-choice landform; won on landform, route, region; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.mercantile-coast.hammock-village-murkmire (+0.77). |
| `place.mercantile-coast.inhabited-meer-murkmire` | committed.inhabited-meer-murkmire | summit | interior swamp | summit in interior swamp (danger band 3), 341 m from the nearest route; its choice #2 landform; won on landform, nearPoint, region; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.ixtaxh-xanmeer` | committed.ixtaxh-xanmeer | cove | lake & standing water | cove in lake & standing water (danger band 3), 364 m from the nearest route; at the water's edge; its choice #5 landform; won on region, submerged, landform; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.lilmoth` | anchor.lilmoth | anchor | firm lowland | Owner-approved settlement anchor 'lilmoth' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.mercantile-coast.rockpark` | committed.rockpark | flood-high | firm lowland | flood high in firm lowland (danger band 4), 768 m from the nearest route; its first-choice landform; won on culture-clump, landform, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.slaughter-memorial` | committed.slaughter-memorial | any-firm-ground | fringe marsh | firm ground in fringe marsh (danger band 2), 252 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, landform, region; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.soulrest` | anchor.soulrest | anchor | fringe marsh | Owner-approved settlement anchor 'soulrest' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.mercantile-coast.teeth-of-sithis` | committed.teeth-of-sithis | flood-high | fringe marsh | flood high in fringe marsh (danger band 2), 144 m from the nearest route; its choice #3 landform; won on landform, culture-clump, route; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.white-rose-prison` | committed.white-rose-prison | flood-high | firm lowland | flood high in firm lowland (danger band 4), 1027 m from the nearest route; its first-choice landform; won on landform, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.mercantile-coast.xinchei-konu` | committed.xinchei-konu | saddle | firm lowland | saddle in firm lowland (danger band 3), 895 m from the nearest route; at the water's edge; its choice #5 landform; won on culture-clump, region, landform; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.bereaved-hist-less-since` | committed.bereaved-hist-less-since | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 3), 299 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on region, culture-clump, danger; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.naga-kur-deeps.naga-village-settled (+1.25). |
| `place.naga-kur-deeps.dead-water-village` | site.free.any-shallow-marsh-1169 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 470 m from the nearest route; its choice #2 landform; won on landform, culture-clump, nearPoint. |
| `place.naga-kur-deeps.deepmire-refuge` | site.free.any-firm-ground-1006 | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 202 m from the nearest route; no free 'flood-high' site was left in the zone, so plain ground; won on nearPoint, danger, parent; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.ferry-stage-guide-hire` | committed.ferry-stage-guide-hire | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 33 m from the nearest route; at the water's edge; no free 'water-narrows' site was left in the zone, so plain ground; won on region, parent, culture-clump; landform wishes taken from the type recipe (record had none); site exchanged in the swap pass with place.naga-kur-deeps.refugee-camp-raid (+0.80). |
| `place.naga-kur-deeps.harmed-hist-enslaved` | committed.harmed-hist-enslaved | any-shallow-marsh | rootland deep marsh | shallow marsh in rootland deep marsh (danger band 4), 66 m from the nearest route; at the water's edge; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on culture-clump, region, danger; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | committed.horwalli-waterworks-deeps | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 845 m from the nearest route; its choice #3 landform; won on nearPoint, landform, culture-clump; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.naga-kur-deeps.naga-village-settled` | site.free.any-shallow-marsh-1205 | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 196 m from the nearest route; its choice #2 landform; won on culture-clump, landform, region. |
| `place.naga-kur-deeps.root-gallery-blight-warren` | committed.root-gallery-blight-warren | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 1110 m from the nearest route; its choice #5 landform; won on culture-clump, nearPoint, region; placed from the homeless batch at stage 'neighbour-zone'; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.root-whisper-village` | site.free.any-firm-ground-1091 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 931 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump-yielded, bound, landform; placed from the homeless batch at stage 'spacing-1/2-region-relaxed'; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.sithis-temple-mass-sacrifice` | committed.sithis-temple-mass-sacrifice | open-water | rootland deep marsh | open water in rootland deep marsh (danger band 5), 1086 m from the nearest route; at the water's edge; won on culture-clump, region, remote; landform wishes taken from the type recipe (record had none). |
| `place.naga-kur-deeps.umbriel-stripped-undead` | committed.umbriel-stripped-undead | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 49 m from the nearest route; its choice #2 landform; won on landform, region, culture-clump. |
| `place.naga-kur-deeps.wild-hist-rogue-deeps` | committed.wild-hist-rogue-deeps | any-shallow-marsh | interior swamp | shallow marsh in interior swamp (danger band 4), 710 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on remote, region, danger; landform wishes taken from the type recipe (record had none). |
| `place.pirate-freeholds.alten-corimont` | anchor.alten-corimont | anchor | firm lowland | Owner-approved settlement anchor 'alten-corimont' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.pirate-freeholds.chasecreek` | committed.chasecreek | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 12 m from the nearest route; its first-choice landform; won on culture-clump, landform, nearPoint. |
| `place.pirate-freeholds.corimont-hist-less-camp` | committed.corimont-hist-less-camp | land-bridge | firm lowland | land bridge in firm lowland (danger band 3), 419 m from the nearest route; at the water's edge; won on region, parent, route. |
| `place.pirate-freeholds.opening-work-barge` | committed.opening-work-barge | cliff-bench | firm lowland | cliff bench in firm lowland (danger band 3), 78 m from the nearest route; at the water's edge; won on bound, region, parent; needs 0.6 m of water. |
| `place.pirate-freeholds.opening-work-camp` | committed.opening-work-camp | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 20 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, region. |
| `place.pirate-freeholds.rockpoint` | committed.rockpoint | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 4), 303 m from the nearest route; no free 'cliff-bench' site was left in the zone, so plain ground; won on culture-clump, nearPoint, region; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.pirate-freeholds.upriver-hist-village` | committed.upriver-hist-village | any-firm-ground | firm lowland | firm ground in firm lowland (danger band 3), 366 m from the nearest route; at the water's edge; its first-choice landform; won on landform, culture-clump, region. |
| `place.saxhleel-coast.archon` | anchor.archon | anchor | tropical jungle | Owner-approved settlement anchor 'archon' (world/sources/anchors, Phase 2 gate); the anchor pixel is the city gate on the main road, and the record sits at the solved city centre (cityLayout, owner rule 2026-09-18). |
| `place.saxhleel-coast.archon-harbour-hist` | committed.archon-harbour-hist | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 82 m from the nearest route; at the water's edge; its choice #2 landform; won on culture-clump, landform, bound. |
| `place.saxhleel-coast.archon-shadowscale-sanctuary` | site.free.any-firm-ground-0995 | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 4), 342 m from the nearest route; no free 'enclosed-clearing' site was left in the zone, so plain ground; won on bound, nearPoint, culture-clump; placed from the homeless batch at stage 'neighbour-zone'. |
| `place.saxhleel-coast.cantemir-headland` | committed.cantemir-headland | flood-high | mangrove forest | flood high in mangrove forest (danger band 3), 27 m from the nearest route; at the water's edge; its choice #3 landform; won on culture-clump, nearPoint, landform. |
| `place.saxhleel-coast.east-estuary-rootworm-station` | committed.east-estuary-rootworm-station | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 2), 27 m from the nearest route; at the water's edge; its first-choice landform; won on landform, bound, culture-clump. |
| `place.saxhleel-coast.lagoon-submerged-xanmeer` | committed.lagoon-submerged-xanmeer | open-water | lake & standing water | open water in lake & standing water (danger band 4), 423 m from the nearest route; at the water's edge; won on culture-clump, region, submerged; placed from the homeless batch at stage 'neighbour-zone'; needs 6 m of water. |
| `place.saxhleel-coast.portdun-mont` | committed.portdun-mont | any-firm-ground | tropical jungle | firm ground in tropical jungle (danger band 3), 39 m from the nearest route; its choice #3 landform; won on landform, region, parent. |
| `place.saxhleel-coast.seafalls` | committed.seafalls | water-narrows | tropical jungle | water narrows in tropical jungle (danger band 3), 46 m from the nearest route; at the water's edge; its choice #2 landform; won on landform, region, route. |

## Owner-feedback checks (Part 4 step 2)

- stances: {'friendly': 69, 'wary': 66, 'hostile': 270, 'neutral': 97, 'guarded': 41, 'sanctuary': 24}
- swap pass exchanged 0 sites
- delves/combat places (D3+) with no friendly/sanctuary rest within 600 m (1200 m in D4–D5): 2

| city | purposes in 2 km | missing core purposes | hostile in 2 km | edge / hinterland / rural counts |
|---|---|---|---|---|
| stormhold | 14 | — | 56 | 7 / 47 / 123 |
| thorn | 13 | — | 36 | 7 / 41 / 79 |
| gideon | 14 | — | 80 | 13 / 59 / 148 |
| helstrom | 14 | — | 83 | 4 / 32 / 263 |
| archon | 14 | — | 56 | 7 / 29 / 95 |
| blackrose | 14 | — | 66 | 14 / 42 / 118 |
| lilmoth | 14 | — | 63 | 11 / 31 / 111 |
| soulrest | 14 | — | 40 | 7 / 22 / 80 |
| alten-corimont | 14 | — | 67 | 11 / 60 / 143 |

Rest-cadence gaps (add a rest or soften): `place.dunmer-north.the-crystal-prospectors` (641 m), `place.dunmer-north.the-guar-ground` (945 m)

## Clustering — Clark-Evans R per zone (97 A5 / G3)

R = 1 is random in the zone's own shape. Even spacing (R > 1) is ACCEPTED where the typed footprint, proximity and isolation gates require it (owner steer 2026-09-09, reversing the earlier 'R < 1 everywhere' target); what is still wanted is that the settled zones stay the most clustered, because that is where lore puts hamlet clumps. Reported, not gated. Median R 1.123; Evener than random: dunmer-north, imperial-fringe, imperial-penal-south, mercantile-coast, naga-kur-deeps, pirate-freeholds, saxhleel-coast.

| zone | plotted | land km² | mean NN m | same-mask null m | R |
|---|---:|---:|---:|---:|---:|
| dunmer-north | 126 | 7.56 | 150.5 | 137.3 | **1.096** |
| hist-heartland | 116 | 8.98 | 149.1 | 174.7 | **0.853** |
| imperial-fringe | 118 | 6.96 | 142.1 | 131.0 | **1.085** |
| imperial-penal-south | 39 | 0.93 | 134.4 | 104.1 | **1.291** |
| mercantile-coast | 63 | 3.51 | 157.6 | 144.8 | **1.088** |
| naga-kur-deeps | 39 | 2.6 | 198.0 | 176.2 | **1.123** |
| pirate-freeholds | 31 | 0.8 | 134.2 | 96.5 | **1.391** |
| saxhleel-coast | 35 | 1.72 | 161.9 | 132.3 | **1.224** |
