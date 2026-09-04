# Minor routes — tracks, footpaths, boardwalks, causeways (Phase 11 Part 3b)

Derived from the macro plot by `worldgen.compile_minor_routes`; data in `apps/world-studio/public/province/routes-minor.json`.

- **175 paths**, 62.87 km in total: track 31, footpath 102, boardwalk 42, causeway 0
- 49 places were already on a road or landing (within 45 m)
- 0 places have **no land path** (boat-, guide- or root-served — a design fact to check, not a failure; longest allowed path 2.6 km):


## Longest paths

| path | kind | km |
|---|---|---|
| `place.imperial-fringe.lowmere-raft-town` | footpath | 2.148 |
| `place.imperial-fringe.the-stone-talkers-watch` | track | 1.829 |
| `place.imperial-fringe.westfield-village` | track | 1.789 |
| `place.dunmer-north.the-field-gate-garrison` | track | 1.762 |
| `place.dunmer-north.crystalgate` | track | 1.742 |
| `place.dunmer-north.the-divers-landing` | footpath | 1.703 |
| `place.imperial-fringe.marcians-terrace` | footpath | 1.406 |
| `place.dunmer-north.the-veterans-ridge` | track | 1.395 |
| `place.pirate-freeholds.veterans-holding` | track | 1.243 |
| `place.dunmer-north.rimfield` | footpath | 1.119 |
| `place.pirate-freeholds.corimont-hist-less-camp` | boardwalk | 1.024 |
| `place.pirate-freeholds.dunmer-frontier-holding` | track | 1.0 |
| `place.imperial-fringe.stonewastes` | track | 0.913 |
| `place.dunmer-north.the-flu-cordon` | footpath | 0.912 |
| `place.dunmer-north.riverwalk` | track | 0.889 |

## Minor waterways — channels, rivers, ferry crossings (Phase 11 Part 3c)

Derived from the macro plot by `worldgen.compile_minor_waterways` (the Phase 4 boat cost surface, land impassable); data in `apps/world-studio/public/province/waterways-minor.json`.

- **155 channels**, 56.25 km in total: channel 96, river 45, crossing 14
- 49 water-bound places already sit on a lane or navigable river (within 45 m)
- 14 water-bound places have **no boat path** (reached on foot, by root or by guide — a design fact to check, not a failure):

  - `place.dunmer-north.the-charge-pond` — no connected navigable water within 260 m
  - `place.dunmer-north.the-lightning-yard` — no connected navigable water within 260 m
  - `place.dunmer-north.the-slumped-hamlet` — no connected navigable water within 260 m
  - `place.dunmer-north.the-two-gate-bridge` — no connected navigable water within 260 m
  - `place.hist-heartland.alten-markmont` — no connected navigable water within 260 m
  - `place.hist-heartland.root-gallery-cult-warren` — no connected navigable water within 260 m
  - `place.imperial-fringe.lower-onkobra-paddies` — no connected navigable water within 260 m
  - `place.imperial-fringe.rufios-landing` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-black-tarn` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-embankment-that-drowned` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-lake-divers-yard` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-standing-mist` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-white-throat` — no connected navigable water within 260 m
  - `place.imperial-fringe.watch-of-the-weighed-cart` — no connected navigable water within 260 m

### Longest channels

| place | class | km |
|---|---|---|
| `place.dunmer-north.riverwalk` | channel | 1.516 |
| `place.naga-kur-deeps.naga-village-settled` | channel | 1.375 |
| `place.hist-heartland.wamasu-pond-nest` | river | 1.371 |
| `place.mercantile-coast.oliis-ferry-stage` | channel | 1.273 |
| `place.hist-heartland.dive-shaft-xanmeer-well` | river | 1.252 |
| `place.dunmer-north.the-drowned-terrace` | channel | 1.127 |
| `place.mercantile-coast.bright-throat-village` | channel | 1.071 |
| `place.hist-heartland.stilt-channel-edge-two-poles` | channel | 1.04 |
| `place.pirate-freeholds.rockpoint` | river | 1.016 |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | channel | 0.982 |
| `place.hist-heartland.treasure-hunters-live-camp` | river | 0.976 |
| `place.saxhleel-coast.portdun-mont` | channel | 0.956 |
| `place.imperial-fringe.the-drowned-furrow` | channel | 0.928 |
| `place.dunmer-north.the-drawdown-flats` | channel | 0.924 |
| `place.hist-heartland.boardwalk-branching-many-ways` | river | 0.906 |

### Registry entries solved by minor water geometry

- (none this run)
