# Minor routes — tracks, footpaths, boardwalks, causeways (Phase 11 Part 3b)

Derived from the macro plot by `worldgen.compile_minor_routes`; data in `apps/world-studio/public/province/routes-minor.json`.

- **168 paths**, 60.61 km in total: track 35, footpath 92, boardwalk 41, causeway 0
- 55 places were already on a road or landing (within 45 m)
- 2 places have **no land path** (boat-, guide- or root-served — a design fact to check, not a failure; longest allowed path 2.6 km):

  - `place.mercantile-coast.alten-meerhleel` — no land within the snap; boat-served
  - `place.imperial-penal-south.blackrose-drowned-hist` — no land within the snap; boat-served

## Longest paths

| path | kind | km |
|---|---|---|
| `place.imperial-fringe.lowmere-raft-town` | footpath | 2.109 |
| `place.imperial-fringe.the-stone-talkers-watch` | track | 1.829 |
| `place.dunmer-north.the-field-gate-garrison` | track | 1.762 |
| `place.imperial-fringe.swampmoth-town` | track | 1.68 |
| `place.dunmer-north.crystalgate` | track | 1.088 |
| `place.pirate-freeholds.veterans-holding` | track | 1.0 |
| `place.dunmer-north.the-flu-cordon` | footpath | 0.961 |
| `place.dunmer-north.rimfield` | footpath | 0.923 |
| `place.imperial-fringe.stonewastes` | track | 0.913 |
| `place.dunmer-north.stands-on-the-island` | boardwalk | 0.909 |
| `place.dunmer-north.riverwalk` | track | 0.889 |
| `place.hist-heartland.hammock-tree-island-greenmoss` | boardwalk | 0.884 |
| `place.imperial-fringe.glenbridge` | track | 0.862 |
| `place.mercantile-coast.ixtaxh-xanmeer` | footpath | 0.86 |
| `place.naga-kur-deeps.necropolis-nightbound` | boardwalk | 0.846 |

## Minor waterways — channels, rivers, ferry crossings (Phase 11 Part 3c)

Derived from the macro plot by `worldgen.compile_minor_waterways` (the Phase 4 boat cost surface, land impassable); data in `apps/world-studio/public/province/waterways-minor.json`.

- **169 channels**, 56.15 km in total: channel 105, river 52, crossing 12
- 43 water-bound places already sit on a lane or navigable river (within 45 m)
- 12 water-bound places have **no boat path** (reached on foot, by root or by guide — a design fact to check, not a failure):

  - `place.dunmer-north.nine-fords` — no connected navigable water within 260 m
  - `place.dunmer-north.the-charge-pond` — no connected navigable water within 260 m
  - `place.dunmer-north.the-lightning-yard` — no connected navigable water within 260 m
  - `place.dunmer-north.the-slumped-hamlet` — no connected navigable water within 260 m
  - `place.dunmer-north.the-two-gate-bridge` — no connected navigable water within 260 m
  - `place.hist-heartland.alten-markmont` — no connected navigable water within 260 m
  - `place.hist-heartland.treasure-hunters-dead-camp` — no connected navigable water within 260 m
  - `place.imperial-fringe.lowmere-raft-town` — no connected navigable water within 260 m
  - `place.imperial-fringe.rufios-landing` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-black-tarn` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-second-empire-locks` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-standing-mist` — no connected navigable water within 260 m

### Longest channels

| place | class | km |
|---|---|---|
| `place.dunmer-north.murkwater` | channel | 1.818 |
| `place.dunmer-north.riverwalk` | channel | 1.516 |
| `place.imperial-fringe.sink-field` | channel | 1.396 |
| `place.hist-heartland.wamasu-pond-nest` | river | 1.371 |
| `place.hist-heartland.dive-shaft-xanmeer-well` | river | 1.252 |
| `place.mercantile-coast.oliis-ferry-stage` | channel | 1.238 |
| `place.hist-heartland.stilt-channel-edge-two-poles` | channel | 1.138 |
| `place.imperial-fringe.onkobra-ferry` | river | 1.133 |
| `place.dunmer-north.the-drawdown-flats` | channel | 1.069 |
| `place.saxhleel-coast.portdun-mont` | channel | 0.956 |
| `place.mercantile-coast.xhon-mehl-shrine` | channel | 0.954 |
| `place.imperial-fringe.the-drowned-furrow` | channel | 0.928 |
| `place.hist-heartland.boardwalk-branching-many-ways` | river | 0.906 |
| `place.dunmer-north.the-drowned-terrace` | channel | 0.858 |
| `place.mercantile-coast.mudfoot` | channel | 0.833 |

### Registry entries solved by minor water geometry

- (none this run)
