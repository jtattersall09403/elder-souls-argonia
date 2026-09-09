# Minor routes — tracks, footpaths, boardwalks, causeways (Phase 11 Part 3b)

Derived from the macro plot by `worldgen.compile_minor_routes`; data in `apps/world-studio/public/province/routes-minor.json`.

- **165 paths**, 115.52 km in total: track 34, footpath 90, boardwalk 40, causeway 1
- 60 places were already on a road or landing (within 45 m)
- 2 of the paths are **unmapped** (batch 4): routed, graded and painted ground that the player's map never draws, so a rumoured place is still found by walking
- 2 places have **no land path** (boat-, guide- or root-served — a design fact to check, not a failure; longest allowed path 4.0 km):

  - `place.dunmer-north.the-divers-landing` — cheapest land path 4.5 km
  - `place.dunmer-north.the-flu-cordon` — cheapest land path 5.0 km

- 1 settlements sit further than 4.0 km along the cheapest walkable line and keep their path anyway (a settlement is always reachable on foot): `place.imperial-fringe.swampmoth-town` (4.92 km)

## Longest paths

| path | kind | km |
|---|---|---|
| `place.imperial-fringe.swampmoth-town` | track | 4.92 |
| `place.pirate-freeholds.veterans-holding` | track | 3.815 |
| `place.dunmer-north.branchmont` | track | 3.662 |
| `place.imperial-fringe.stonefoot-terrace-village` | footpath | 3.373 |
| `place.dunmer-north.mazzatun` | track | 3.322 |
| `place.imperial-fringe.bone-road-waystation` | footpath | 3.264 |
| `place.dunmer-north.the-veterans-ridge` | track | 3.232 |
| `place.dunmer-north.stands-on-the-island` | track | 3.178 |
| `place.imperial-fringe.the-stone-talkers-watch` | track | 3.024 |
| `place.dunmer-north.saltmarch-village` | track | 2.917 |
| `place.dunmer-north.silyanorn-diggings` | footpath | 2.863 |
| `place.imperial-fringe.marcians-terrace` | footpath | 2.743 |
| `place.dunmer-north.the-field-gate-garrison` | track | 2.677 |
| `place.dunmer-north.hatching-pools` | track | 2.66 |
| `place.hist-heartland.heretic-stone-restarted` | track | 2.658 |

## Minor waterways — channels, rivers, ferry crossings (Phase 11 Part 3c)

Derived from the macro plot by `worldgen.compile_minor_waterways` (the Phase 4 boat cost surface, land impassable); data in `apps/world-studio/public/province/waterways-minor.json`.

- **139 channels**, 55.11 km in total: channel 88, river 40, crossing 11
- 73 water-bound places already sit on a lane or navigable river (within 45 m)
- 14 water-bound places have **no boat path** (reached on foot, by root or by guide — a design fact to check, not a failure):

  - `place.dunmer-north.hixinoag` — no connected navigable water within 260 m
  - `place.dunmer-north.loriasel-caverns` — no connected navigable water within 260 m
  - `place.dunmer-north.reedmoor-stilts` — no connected navigable water within 260 m
  - `place.dunmer-north.ten-thousand-nests` — no connected navigable water within 260 m
  - `place.dunmer-north.the-charge-pond` — no connected navigable water within 260 m
  - `place.dunmer-north.the-monsoon-boom` — no connected navigable water within 260 m
  - `place.dunmer-north.the-slumped-hamlet` — no connected navigable water within 260 m
  - `place.hist-heartland.hermit-hut-mad-basin` — no connected navigable water within 260 m
  - `place.hist-heartland.root-gallery-kept-light` — no connected navigable water within 260 m
  - `place.imperial-fringe.fenmarch-village` — no connected navigable water within 260 m
  - `place.imperial-fringe.hangs-above-the-water` — no connected navigable water within 260 m
  - `place.imperial-fringe.reedcutters-toll` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-black-tarn` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-white-throat` — no connected navigable water within 260 m

- **1 REFUSED berths** — the compiled water cannot carry the hull the blueprint promises, so no connector is published for them at all (`test_minor_waterways` is red until each is authored or fixed):

  - `dock.sap-tapping-licensed.landing` — needs 0.6 m, the water publishes -3.00 m at the berth; nearest water that deep 104.4 m away

### Longest channels

| place | class | km |
|---|---|---|
| `place.dunmer-north.tearmouth` | channel | 2.027 |
| `place.imperial-fringe.the-second-empire-locks` | channel | 1.313 |
| `place.dunmer-north.the-divers-landing` | channel | 1.199 |
| `place.hist-heartland.lost-city` | river | 1.174 |
| `place.hist-heartland.xal-krona-making-ground` | river | 1.127 |
| `place.naga-kur-deeps.maturity-trial-kaju-kill` | channel | 1.118 |
| `place.mercantile-coast.oliis-ferry-stage` | channel | 1.067 |
| `place.hist-heartland.cut-and-carried` | river | 1.059 |
| `place.mercantile-coast.keel-sakka-stilts` | channel | 1.05 |
| `place.saxhleel-coast.portdun-mont` | channel | 1.024 |
| `place.dunmer-north.the-drowned-terrace` | channel | 1.004 |
| `place.hist-heartland.root-gallery-cult-warren` | channel | 0.993 |
| `place.naga-kur-deeps.horwalli-waterworks-deeps` | channel | 0.993 |
| `place.hist-heartland.bioluminescent-glowfen` | channel | 0.99 |
| `place.hist-heartland.dive-shaft-xanmeer-well` | channel | 0.99 |

### Registry entries solved by minor water geometry

- (none this run)
