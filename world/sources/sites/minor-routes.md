# Minor routes — tracks, footpaths, boardwalks, causeways (Phase 11 Part 3b)

Derived from the macro plot by `worldgen.compile_minor_routes`; data in `apps/world-studio/public/province/routes-minor.json`.

- **164 paths**, 111.73 km in total: track 42, footpath 95, boardwalk 25, causeway 2
- 61 places were already on a road or landing (within 45 m)
- 2 of the paths are **unmapped** (batch 4): routed, graded and painted ground that the player's map never draws, so a rumoured place is still found by walking
- 2 places have **no land path** (boat-, guide- or root-served — a design fact to check, not a failure; longest allowed path 4.0 km):

  - `place.dunmer-north.the-divers-landing` — cheapest land path 4.5 km
  - `place.dunmer-north.the-flu-cordon` — cheapest land path 5.3 km

- 1 settlements sit further than 4.0 km along the cheapest walkable line and keep their path anyway (a settlement is always reachable on foot): `place.imperial-fringe.swampmoth-town` (4.972 km)

## Longest paths

| path | kind | km |
|---|---|---|
| `place.imperial-fringe.swampmoth-town` | track | 4.972 |
| `place.pirate-freeholds.veterans-holding` | track | 3.817 |
| `place.dunmer-north.branchmont` | track | 3.368 |
| `place.imperial-fringe.stonefoot-terrace-village` | footpath | 3.349 |
| `place.dunmer-north.mazzatun` | track | 3.286 |
| `place.dunmer-north.the-veterans-ridge` | track | 3.232 |
| `place.dunmer-north.silyanorn-diggings` | footpath | 3.156 |
| `place.imperial-fringe.bone-road-waystation` | footpath | 3.132 |
| `place.imperial-fringe.the-stone-talkers-watch` | track | 3.001 |
| `place.dunmer-north.saltmarch-village` | track | 2.927 |
| `place.dunmer-north.stands-on-the-island` | track | 2.884 |
| `place.dunmer-north.the-field-gate-garrison` | track | 2.743 |
| `place.imperial-fringe.marcians-terrace` | footpath | 2.743 |
| `place.hist-heartland.heretic-stone-restarted` | track | 2.661 |
| `place.pirate-freeholds.dunmer-frontier-holding` | track | 2.657 |

## Minor waterways — channels, rivers, ferry crossings (Phase 11 Part 3c)

Derived from the macro plot by `worldgen.compile_minor_waterways` (the Phase 4 boat cost surface, land impassable); data in `apps/world-studio/public/province/waterways-minor.json`.

- **127 channels**, 40.55 km in total: channel 76, river 41, crossing 10
- 74 water-bound places already sit on a lane or navigable river (within 45 m)
- 26 water-bound places have **no boat path** (reached on foot, by root or by guide — a design fact to check, not a failure):

  - `place.dunmer-north.hixinoag` — no connected navigable water within 260 m
  - `place.dunmer-north.loriasel-caverns` — no connected navigable water within 260 m
  - `place.dunmer-north.reedmoor-stilts` — no connected navigable water within 260 m
  - `place.dunmer-north.ten-thousand-nests` — no connected navigable water within 260 m
  - `place.dunmer-north.the-charge-pond` — no connected navigable water within 260 m
  - `place.dunmer-north.the-divers-landing` — no connected navigable water within 260 m
  - `place.dunmer-north.the-drowned-terrace` — no connected navigable water within 260 m
  - `place.dunmer-north.the-monsoon-boom` — no connected navigable water within 260 m
  - `place.dunmer-north.the-slumped-hamlet` — no connected navigable water within 260 m
  - `place.hist-heartland.bioluminescent-glowfen` — no connected navigable water within 260 m
  - `place.hist-heartland.hermit-hut-mad-basin` — no connected navigable water within 260 m
  - `place.hist-heartland.mist-locked-hollow-basin` — no connected navigable water within 260 m
  - `place.hist-heartland.root-gallery-cult-warren` — no connected navigable water within 260 m
  - `place.hist-heartland.root-gallery-kept-light` — no connected navigable water within 260 m
  - `place.imperial-fringe.fenmarch-village` — no connected navigable water within 260 m
  - `place.imperial-fringe.hangs-above-the-water` — no connected navigable water within 260 m
  - `place.imperial-fringe.onkobra-field-station` — no connected navigable water within 260 m
  - `place.imperial-fringe.reedcutters-toll` — no connected navigable water within 260 m
  - `place.imperial-fringe.sink-field` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-black-tarn` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-drowned-furrow` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-second-empire-locks` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-white-throat` — no connected navigable water within 260 m
  - `place.mercantile-coast.mudfoot` — no connected navigable water within 260 m
  - `place.naga-kur-deeps.horwalli-waterworks-deeps` — no connected navigable water within 260 m
  - `place.naga-kur-deeps.root-gallery-blight-warren` — no connected navigable water within 260 m

### Longest channels

| place | class | km |
|---|---|---|
| `place.dunmer-north.tearmouth` | channel | 2.084 |
| `place.mercantile-coast.keel-sakka-stilts` | channel | 1.055 |
| `place.naga-kur-deeps.leviathan-bone-field` | river | 0.963 |
| `place.mercantile-coast.oliis-ferry-stage` | channel | 0.889 |
| `place.mercantile-coast.lighter-flotilla` | channel | 0.874 |
| `place.dunmer-north.hutan-tzel` | channel | 0.869 |
| `place.hist-heartland.stilt-channel-edge-uxaneet` | river | 0.853 |
| `place.mercantile-coast.oliis-boardwalk` | channel | 0.807 |
| `place.hist-heartland.necropolis-dead-tenders` | channel | 0.784 |
| `place.naga-kur-deeps.naga-village-settled` | river | 0.726 |
| `place.hist-heartland.lost-city` | channel | 0.696 |
| `place.dunmer-north.the-pilots-rest` | channel | 0.67 |
| `place.hist-heartland.drowning-narrows-current` | channel | 0.668 |
| `place.dunmer-north.the-drawdown-flats` | channel | 0.663 |
| `place.hist-heartland.xal-krona-making-ground` | channel | 0.649 |

### Registry entries solved by minor water geometry

- (none this run)
