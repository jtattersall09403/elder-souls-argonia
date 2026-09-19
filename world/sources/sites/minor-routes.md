# Minor routes — tracks, footpaths, boardwalks, causeways (Phase 11 Part 3b)

Derived from the macro plot by `worldgen.compile_minor_routes`; data in `apps/world-studio/public/province/routes-minor.json`.

- **175 paths**, 192.48 km in total: track 54, footpath 115, boardwalk 5, causeway 1
- 44 places were already on a road or landing (within 45 m)
- 2 of the paths are **unmapped** (batch 4): routed, graded and painted ground that the player's map never draws, so a rumoured place is still found by walking
- 2 places have **no land path** (boat-, guide- or root-served — a design fact to check, not a failure; longest allowed path 4.0 km):

  - `place.imperial-fringe.the-hollow-pass-station` — cheapest land path 6.0 km
  - `place.imperial-fringe.the-pass-shelter` — cheapest land path 4.0 km

- 11 settlements sit further than 4.0 km along the cheapest walkable line and keep their path anyway (a settlement is always reachable on foot): `place.imperial-fringe.gideon` (24.371 km), `place.imperial-fringe.bone-road-waystation` (18.058 km), `place.dunmer-north.the-pen-yard` (11.051 km), `place.mercantile-coast.soulrest` (9.799 km), `place.imperial-fringe.lowmere-raft-town` (7.04 km), `place.dunmer-north.the-veterans-ridge` (6.292 km), `place.dunmer-north.crystalgate` (6.069 km), `place.pirate-freeholds.dunmer-frontier-holding` (5.559 km), `place.dunmer-north.stormhold` (5.071 km), `place.imperial-fringe.cartwrights-cross` (4.226 km), `place.dunmer-north.stormhold` (4.176 km)

## Longest paths

| path | kind | km |
|---|---|---|
| `place.imperial-fringe.gideon` | footpath | 24.371 |
| `place.imperial-fringe.bone-road-waystation` | track | 18.058 |
| `place.dunmer-north.the-pen-yard` | track | 11.051 |
| `place.mercantile-coast.soulrest` | track | 9.799 |
| `place.imperial-fringe.lowmere-raft-town` | footpath | 7.04 |
| `place.dunmer-north.the-veterans-ridge` | track | 6.292 |
| `place.dunmer-north.crystalgate` | track | 6.069 |
| `place.pirate-freeholds.dunmer-frontier-holding` | track | 5.559 |
| `place.dunmer-north.stormhold` | causeway | 5.071 |
| `place.imperial-fringe.cartwrights-cross` | track | 4.226 |
| `place.dunmer-north.stormhold` | track | 4.176 |
| `place.imperial-fringe.marcians-terrace` | footpath | 3.369 |
| `place.pirate-freeholds.veterans-holding` | track | 3.14 |
| `place.dunmer-north.mazzatun` | track | 2.957 |
| `place.dunmer-north.murkwater` | track | 2.824 |

## Minor waterways — channels, rivers, ferry crossings (Phase 11 Part 3c)

Derived from the macro plot by `worldgen.compile_minor_waterways` (the Phase 4 boat cost surface, land impassable); data in `apps/world-studio/public/province/waterways-minor.json`.

- **132 channels**, 54.93 km in total: channel 116, river 6, crossing 10
- 49 water-bound places already sit on a lane or navigable river (within 45 m)
- **When each lane has its water**: 86 carry a hull all year, 0 only in the wet season and 46 run over ground that the water bake finds dry in every season (144 cells). That last group is a defect. Those lanes are drawn but cannot be poled; each carries `"season": "dry"` in the JSON. The worst of them are listed below. The fix is to carve the bed or to withdraw the lane.
- 66 lanes cross ground the record cannot float their hull on: 25 portages and 172 decked runs, typed on the lane in `features[]`. Nothing is dredged to close them.
- 27 water-bound places have **no boat path** (reached on foot, by root or by guide — a design fact to check, not a failure):

  - `place.dunmer-north.boom-keepers-lodge` — no connected navigable water within 260 m
  - `place.dunmer-north.ten-thousand-nests` — no connected navigable water within 260 m
  - `place.dunmer-north.the-charge-pond` — no connected navigable water within 260 m
  - `place.dunmer-north.the-divers-landing` — no connected navigable water within 260 m
  - `place.dunmer-north.the-drawdown-flats` — no connected navigable water within 260 m
  - `place.dunmer-north.the-drowned-terrace` — no connected navigable water within 260 m
  - `place.dunmer-north.the-last-landing` — no connected navigable water within 260 m
  - `place.dunmer-north.the-lightning-yard` — no connected navigable water within 260 m
  - `place.dunmer-north.the-pilots-rest` — no connected navigable water within 260 m
  - `place.dunmer-north.went-down-slowly` — no connected navigable water within 260 m
  - `place.hist-heartland.cut-and-carried` — no connected navigable water within 260 m
  - `place.hist-heartland.legendary-deep-medusa-wood` — no connected navigable water within 260 m
  - `place.hist-heartland.maturity-trial-chukka-sei` — no connected navigable water within 260 m
  - `place.hist-heartland.root-gallery-cult-warren` — no connected navigable water within 260 m
  - `place.hist-heartland.treasure-hunters-dead-camp` — no connected navigable water within 260 m
  - `place.hist-heartland.walkway-junction-high-crossroads` — no connected navigable water within 260 m
  - `place.imperial-fringe.fig-market` — no connected navigable water within 260 m
  - `place.imperial-fringe.rufios-landing` — no connected navigable water within 260 m
  - `place.imperial-fringe.sink-field` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-black-tarn` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-drowned-furrow` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-standing-mist` — no connected navigable water within 260 m
  - `place.imperial-fringe.watch-of-the-weighed-cart` — no connected navigable water within 260 m
  - `place.naga-kur-deeps.horwalli-waterworks-deeps` — no connected navigable water within 260 m
  - `place.naga-kur-deeps.naga-village-settled` — no connected navigable water within 260 m
  - `place.naga-kur-deeps.raft-village-lashed` — no connected navigable water within 260 m
  - `place.naga-kur-deeps.root-gallery-blight-warren` — no connected navigable water within 260 m

### Lanes drawn over dry ground

| place | class | km | cells dry in every season |
|---|---|---:|---:|
| `place.naga-kur-deeps.ferry-stage-guide-hire` | channel | 0.913 | 22 |
| `place.hist-heartland.nine-trunks` | channel | 0.115 | 17 |
| `place.hist-heartland.submerged-xanmeer-topmost` | channel | 0.48 | 10 |
| `place.imperial-fringe.fenmarch-village` | channel | 0.647 | 10 |
| `place.dunmer-north.feeds-the-north` | channel | 0.446 | 9 |
| `place.hist-heartland.sap-tapping-licensed` | channel | 0.213 | 6 |
| `place.dunmer-north.the-white-pans` | channel | 0.51 | 5 |
| `place.imperial-fringe.the-silent-halls` | channel | 0.324 | 4 |
| `place.saxhleel-coast.banner-stack` | channel | 0.483 | 4 |
| `place.dunmer-north.nine-fords` | channel | 0.085 | 3 |
| _…36 more_ | | | |

### Longest channels

| place | class | km |
|---|---|---|
| `place.dunmer-north.riverwalk` | channel | 2.121 |
| `place.imperial-fringe.slough-point` | channel | 2.096 |
| `place.dunmer-north.hissmir` | channel | 2.061 |
| `place.mercantile-coast.moonmarch` | channel | 1.875 |
| `place.dunmer-north.murkwater` | channel | 1.82 |
| `place.hist-heartland.alten-markmont` | channel | 1.392 |
| `place.hist-heartland.stilt-channel-edge-uxaneet` | channel | 1.099 |
| `place.mercantile-coast.mudfoot` | channel | 1.068 |
| `place.hist-heartland.treasure-hunters-live-camp` | channel | 0.998 |
| `place.hist-heartland.mist-locked-hollow-basin` | channel | 0.964 |
| `place.naga-kur-deeps.ferry-stage-guide-hire` | channel | 0.913 |
| `place.naga-kur-deeps.portage-slipway-narrows-deeps` | channel | 0.907 |
| `place.hist-heartland.dive-shaft-xanmeer-well` | channel | 0.904 |
| `place.hist-heartland.porter-relay-poling` | channel | 0.84 |
| `place.dunmer-north.the-tide-fair` | channel | 0.834 |

### Registry entries solved by minor water geometry

- (none this run)
