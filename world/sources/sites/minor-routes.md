# Minor routes — tracks, footpaths, boardwalks, causeways (Phase 11 Part 3b)

Derived from the macro plot by `worldgen.compile_minor_routes`; data in `apps/world-studio/public/province/routes-minor.json`.

- **173 paths**, 124.78 km in total: track 34, footpath 93, boardwalk 44, causeway 2
- 52 places were already on a road or landing (within 45 m)
- 2 of the paths are **unmapped** (batch 4): routed, graded and painted ground that the player's map never draws, so a rumoured place is still found by walking
- 2 places have **no land path** (boat-, guide- or root-served — a design fact to check, not a failure; longest allowed path 4.0 km):

  - `place.mercantile-coast.alten-meerhleel` — no land within the snap; boat-served
  - `place.imperial-penal-south.blackrose-drowned-hist` — no land within the snap; boat-served

- 5 settlements sit further than 4.0 km along the cheapest walkable line and keep their path anyway (a settlement is always reachable on foot): `place.imperial-fringe.lowmere-raft-town` (6.718 km), `place.imperial-fringe.swampmoth-town` (5.838 km), `place.pirate-freeholds.dunmer-frontier-holding` (5.835 km), `place.dunmer-north.crystalgate` (5.73 km), `place.dunmer-north.the-field-gate-garrison` (4.611 km)

## Longest paths

| path | kind | km |
|---|---|---|
| `place.imperial-fringe.lowmere-raft-town` | footpath | 6.718 |
| `place.imperial-fringe.swampmoth-town` | track | 5.838 |
| `place.pirate-freeholds.dunmer-frontier-holding` | track | 5.835 |
| `place.dunmer-north.crystalgate` | track | 5.73 |
| `place.dunmer-north.the-field-gate-garrison` | track | 4.611 |
| `place.pirate-freeholds.veterans-holding` | track | 3.815 |
| `place.dunmer-north.rimfield` | footpath | 3.654 |
| `place.imperial-fringe.the-stone-talkers-watch` | track | 3.317 |
| `place.dunmer-north.mazzatun` | track | 3.168 |
| `place.imperial-fringe.stonewastes` | track | 2.899 |
| `place.hist-heartland.heretic-stone-restarted` | track | 2.672 |
| `place.dunmer-north.saltmarch-village` | track | 2.653 |
| `place.dunmer-north.tearmouth` | track | 2.507 |
| `place.dunmer-north.nine-fords` | track | 2.392 |
| `place.dunmer-north.murkwater` | track | 2.391 |

## Minor waterways — channels, rivers, ferry crossings (Phase 11 Part 3c)

Derived from the macro plot by `worldgen.compile_minor_waterways` (the Phase 4 boat cost surface, land impassable); data in `apps/world-studio/public/province/waterways-minor.json`.

- **173 channels**, 59.22 km in total: channel 110, river 51, crossing 12
- 44 water-bound places already sit on a lane or navigable river (within 45 m)
- 10 water-bound places have **no boat path** (reached on foot, by root or by guide — a design fact to check, not a failure):

  - `place.dunmer-north.nine-fords` — no connected navigable water within 260 m
  - `place.dunmer-north.the-charge-pond` — no connected navigable water within 260 m
  - `place.dunmer-north.the-lightning-yard` — no connected navigable water within 260 m
  - `place.dunmer-north.the-two-gate-bridge` — no connected navigable water within 260 m
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
| `place.dunmer-north.riverwalk` | channel | 1.509 |
| `place.imperial-fringe.sink-field` | channel | 1.378 |
| `place.hist-heartland.wamasu-pond-nest` | river | 1.364 |
| `place.hist-heartland.dive-shaft-xanmeer-well` | river | 1.246 |
| `place.mercantile-coast.oliis-ferry-stage` | channel | 1.238 |
| `place.hist-heartland.stilt-channel-edge-two-poles` | channel | 1.134 |
| `place.imperial-fringe.onkobra-ferry` | river | 1.102 |
| `place.dunmer-north.the-drawdown-flats` | channel | 1.026 |
| `place.saxhleel-coast.portdun-mont` | channel | 0.956 |
| `place.mercantile-coast.xhon-mehl-shrine` | channel | 0.954 |
| `place.hist-heartland.boardwalk-branching-many-ways` | river | 0.911 |
| `place.imperial-fringe.the-drowned-furrow` | channel | 0.9 |
| `place.dunmer-north.the-drowned-terrace` | channel | 0.859 |
| `place.hist-heartland.sap-tapping-licensed` | channel | 0.855 |

### Registry entries solved by minor water geometry

- (none this run)
