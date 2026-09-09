# Minor routes — tracks, footpaths, boardwalks, causeways (Phase 11 Part 3b)

Derived from the macro plot by `worldgen.compile_minor_routes`; data in `apps/world-studio/public/province/routes-minor.json`.

- **180 paths**, 123.31 km in total: track 38, footpath 109, boardwalk 31, causeway 2
- 45 places were already on a road or landing (within 45 m)
- 2 of the paths are **unmapped** (batch 4): routed, graded and painted ground that the player's map never draws, so a rumoured place is still found by walking
- 2 places have **no land path** (boat-, guide- or root-served — a design fact to check, not a failure; longest allowed path 4.0 km):

  - `place.imperial-fringe.onkobra-clay-pits` — cheapest land path 4.5 km
  - `place.dunmer-north.the-ninth-chapel` — cheapest land path 4.8 km

- 3 settlements sit further than 4.0 km along the cheapest walkable line and keep their path anyway (a settlement is always reachable on foot): `place.dunmer-north.the-field-gate-garrison` (5.748 km), `place.dunmer-north.channel-cross-village` (4.7 km), `place.imperial-fringe.marcians-terrace` (4.659 km)

## Longest paths

| path | kind | km |
|---|---|---|
| `place.dunmer-north.the-field-gate-garrison` | track | 5.748 |
| `place.dunmer-north.channel-cross-village` | track | 4.7 |
| `place.imperial-fringe.marcians-terrace` | footpath | 4.659 |
| `place.dunmer-north.crystalgate` | track | 3.951 |
| `place.pirate-freeholds.veterans-holding` | track | 3.811 |
| `place.imperial-fringe.the-pass-shelter` | footpath | 3.807 |
| `place.imperial-fringe.the-stone-talkers-watch` | track | 3.747 |
| `place.dunmer-north.the-divers-landing` | footpath | 3.393 |
| `place.dunmer-north.the-veterans-ridge` | track | 3.225 |
| `place.imperial-fringe.swampmoth-town` | track | 3.213 |
| `place.dunmer-north.mazzatun` | track | 3.201 |
| `place.imperial-fringe.westfield-village` | track | 2.832 |
| `place.dunmer-north.saltmarch-village` | track | 2.76 |
| `place.dunmer-north.the-flu-cordon` | footpath | 2.729 |
| `place.pirate-freeholds.dunmer-frontier-holding` | track | 2.655 |


## Minor waterways — channels, rivers, ferry crossings (Phase 11 Part 3c)

Derived from the macro plot by `worldgen.compile_minor_waterways` (the Phase 4 boat cost surface, land impassable); data in `apps/world-studio/public/province/waterways-minor.json`.

- **135 channels**, 41.77 km in total: channel 87, river 39, crossing 9
- 71 water-bound places already sit on a lane or navigable river (within 45 m)
- **When each lane has its water**: 99 carry a hull all year, 4 only in the wet season and 32 run over ground that the water bake finds dry in every season (205 cells). That last group is a defect. Those lanes are drawn but cannot be poled; each carries `"season": "dry"` in the JSON. The worst of them are listed below. The fix is to carve the bed or to withdraw the lane.
- 21 water-bound places have **no boat path** (reached on foot, by root or by guide — a design fact to check, not a failure):

  - `place.dunmer-north.loriasel-caverns` — no connected navigable water within 260 m
  - `place.dunmer-north.the-charge-pond` — no connected navigable water within 260 m
  - `place.dunmer-north.the-divers-landing` — no connected navigable water within 260 m
  - `place.dunmer-north.the-drowned-terrace` — no connected navigable water within 260 m
  - `place.dunmer-north.the-pilots-rest` — no connected navigable water within 260 m
  - `place.dunmer-north.the-slumped-hamlet` — no connected navigable water within 260 m
  - `place.hist-heartland.root-gallery-cult-warren` — no connected navigable water within 260 m
  - `place.hist-heartland.root-gallery-kept-light` — no connected navigable water within 260 m
  - `place.imperial-fringe.fig-market` — no connected navigable water within 260 m
  - `place.imperial-fringe.gideon` — no connected navigable water within 260 m
  - `place.imperial-fringe.onkobra-clay-pits` — no connected navigable water within 260 m
  - `place.imperial-fringe.onkobra-field-station` — no connected navigable water within 260 m
  - `place.imperial-fringe.sink-field` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-black-tarn` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-drowned-furrow` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-embankment-that-drowned` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-standing-mist` — no connected navigable water within 260 m
  - `place.mercantile-coast.long-bar-wreckers` — no connected navigable water within 260 m
  - `place.naga-kur-deeps.ferry-stage-guide-hire` — no connected navigable water within 260 m
  - `place.naga-kur-deeps.root-gallery-blight-warren` — no connected navigable water within 260 m
  - `place.saxhleel-coast.archon-glowgill-byre` — no connected navigable water within 260 m

### Lanes drawn over dry ground

| place | class | km | cells dry in every season |
|---|---|---:|---:|
| `place.naga-kur-deeps.dead-water-village` | channel | 0.794 | 37 |
| `place.hist-heartland.cut-and-carried` | channel | 0.44 | 16 |
| `place.hist-heartland.drawdown-flat-exposed` | channel | 0.691 | 15 |
| `place.hist-heartland.drowning-narrows-current` | channel | 0.691 | 15 |
| `place.dunmer-north.hissmir` | channel | 1.802 | 13 |
| `place.dunmer-north.tearmouth` | channel | 1.131 | 13 |
| `place.dunmer-north.the-quiet-landing` | channel | 0.68 | 13 |
| `place.hist-heartland.waterfall-chamber-root-fall` | river | 0.615 | 11 |
| `place.dunmer-north.boom-keepers-lodge` | channel | 0.164 | 8 |
| `place.dunmer-north.hutan-tzel` | channel | 0.848 | 7 |
| _…22 more_ | | | |

### Longest channels

| place | class | km |
|---|---|---|
| `place.dunmer-north.hissmir` | channel | 1.802 |
| `place.dunmer-north.tearmouth` | channel | 1.131 |
| `place.hist-heartland.necropolis-dead-tenders` | channel | 1.086 |
| `place.naga-kur-deeps.naga-village-settled` | river | 1.019 |
| `place.mercantile-coast.lighter-flotilla` | channel | 0.99 |
| `place.dunmer-north.the-two-gate-bridge` | channel | 0.916 |
| `place.mercantile-coast.oliis-ferry-stage` | channel | 0.89 |
| `place.hist-heartland.stilt-channel-edge-uxaneet` | river | 0.853 |
| `place.dunmer-north.hutan-tzel` | channel | 0.848 |
| `place.dunmer-north.feeds-the-north` | channel | 0.829 |
| `place.mercantile-coast.oliis-boardwalk` | channel | 0.807 |
| `place.dunmer-north.hixinoag` | channel | 0.794 |
| `place.naga-kur-deeps.dead-water-village` | channel | 0.794 |
| `place.hist-heartland.drawdown-flat-exposed` | channel | 0.691 |
| `place.hist-heartland.drowning-narrows-current` | channel | 0.691 |

### Registry entries solved by minor water geometry

- (none this run)
