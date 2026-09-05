# Minor routes — tracks, footpaths, boardwalks, causeways (Phase 11 Part 3b)

Derived from the macro plot by `worldgen.compile_minor_routes`; data in `apps/world-studio/public/province/routes-minor.json`.

- **173 paths**, 123.3 km in total: track 33, footpath 95, boardwalk 42, causeway 3
- 50 places were already on a road or landing (within 45 m)
- 2 places have **no land path** (boat-, guide- or root-served — a design fact to check, not a failure; longest allowed path 4.0 km):

  - `place.mercantile-coast.alten-meerhleel` — no land within the snap; boat-served
  - `place.imperial-penal-south.blackrose-drowned-hist` — no land within the snap; boat-served

- 5 settlements sit further than 4.0 km along the cheapest walkable line and keep their path anyway (a settlement is always reachable on foot): `place.imperial-fringe.lowmere-raft-town` (6.834 km), `place.imperial-fringe.swampmoth-town` (5.843 km), `place.pirate-freeholds.dunmer-frontier-holding` (5.839 km), `place.dunmer-north.crystalgate` (5.734 km), `place.dunmer-north.the-field-gate-garrison` (4.616 km)

## Longest paths

| path | kind | km |
|---|---|---|
| `place.imperial-fringe.lowmere-raft-town` | footpath | 6.834 |
| `place.imperial-fringe.swampmoth-town` | track | 5.843 |
| `place.pirate-freeholds.dunmer-frontier-holding` | track | 5.839 |
| `place.dunmer-north.crystalgate` | track | 5.734 |
| `place.dunmer-north.the-field-gate-garrison` | track | 4.616 |
| `place.pirate-freeholds.veterans-holding` | track | 3.829 |
| `place.dunmer-north.rimfield` | footpath | 3.654 |
| `place.imperial-fringe.the-stone-talkers-watch` | track | 3.321 |
| `place.dunmer-north.mazzatun` | track | 2.959 |
| `place.imperial-fringe.stonewastes` | track | 2.823 |
| `place.dunmer-north.saltmarch-village` | track | 2.656 |
| `place.hist-heartland.heretic-stone-restarted` | track | 2.646 |
| `place.dunmer-north.tearmouth` | track | 2.51 |
| `place.dunmer-north.nine-fords` | track | 2.442 |
| `place.dunmer-north.murkwater` | track | 2.394 |


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
