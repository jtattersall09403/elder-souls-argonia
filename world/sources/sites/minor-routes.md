# Minor routes — tracks, footpaths, boardwalks, causeways (Phase 11 Part 3b)

Derived from the macro plot by `worldgen.compile_minor_routes`; data in `apps/world-studio/public/province/routes-minor.json`.

- **163 paths**, 57.65 km in total: track 31, footpath 96, boardwalk 36, causeway 0
- 56 places were already on a road or landing (within 45 m)
- 1 places have **no land path** (boat-, guide- or root-served — a design fact to check, not a failure; longest allowed path 2.6 km):

  - `place.imperial-penal-south.lake-divers-yard` — no land within the snap; boat-served

## Longest paths

| path | kind | km |
|---|---|---|
| `place.imperial-fringe.lowmere-raft-town` | footpath | 2.423 |
| `place.imperial-fringe.the-stone-talkers-watch` | track | 1.829 |
| `place.dunmer-north.the-field-gate-garrison` | track | 1.762 |
| `place.imperial-fringe.marcians-terrace` | footpath | 1.417 |
| `place.pirate-freeholds.veterans-holding` | track | 1.416 |
| `place.dunmer-north.the-veterans-ridge` | track | 1.346 |
| `place.dunmer-north.channel-cross-village` | track | 1.126 |
| `place.pirate-freeholds.dunmer-frontier-holding` | track | 1.0 |
| `place.dunmer-north.rimfield` | footpath | 0.968 |
| `place.dunmer-north.the-flu-cordon` | footpath | 0.961 |
| `place.imperial-fringe.stonewastes` | track | 0.913 |
| `place.imperial-penal-south.prison-born-refuge` | footpath | 0.909 |
| `place.imperial-fringe.swampmoth-town` | track | 0.834 |
| `place.imperial-fringe.westfield-village` | track | 0.822 |
| `place.imperial-penal-south.flu-quarantine-village` | footpath | 0.787 |

## Minor waterways — channels, rivers, ferry crossings (Phase 11 Part 3c)

Derived from the macro plot by `worldgen.compile_minor_waterways` (the Phase 4 boat cost surface, land impassable); data in `apps/world-studio/public/province/waterways-minor.json`.

- **148 channels**, 53.78 km in total: channel 83, river 56, crossing 9
- 54 water-bound places already sit on a lane or navigable river (within 45 m)
- 10 water-bound places have **no boat path** (reached on foot, by root or by guide — a design fact to check, not a failure):

  - `place.dunmer-north.the-charge-pond` — no connected navigable water within 260 m
  - `place.dunmer-north.the-slumped-hamlet` — no connected navigable water within 260 m
  - `place.dunmer-north.the-two-gate-bridge` — no connected navigable water within 260 m
  - `place.dunmer-north.the-two-hundred-roofs` — no connected navigable water within 260 m
  - `place.hist-heartland.alten-markmont` — no connected navigable water within 260 m
  - `place.hist-heartland.xal-krona-making-ground` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-black-tarn` — no connected navigable water within 260 m
  - `place.imperial-fringe.the-lake-divers-yard` — no connected navigable water within 260 m
  - `place.imperial-fringe.watch-of-the-weighed-cart` — no connected navigable water within 260 m
  - `place.mercantile-coast.oliis-drake-deep` — no connected navigable water within 260 m

### Longest channels

| place | class | km |
|---|---|---|
| `place.mercantile-coast.quinrawl-anchorage` | channel | 1.532 |
| `place.hist-heartland.wamasu-pond-nest` | river | 1.371 |
| `place.hist-heartland.submerged-xanmeer-topmost` | river | 1.252 |
| `place.mercantile-coast.bramman-river-ferry` | channel | 1.118 |
| `place.mercantile-coast.bright-throat-village` | channel | 1.071 |
| `place.naga-kur-deeps.sinkhole-mouth-deeps` | channel | 0.982 |
| `place.saxhleel-coast.portdun-mont` | channel | 0.956 |
| `place.dunmer-north.tearmouth` | channel | 0.932 |
| `place.naga-kur-deeps.drowned-village-lake-deeps` | river | 0.92 |
| `place.hist-heartland.boardwalk-branching-many-ways` | river | 0.906 |
| `place.hist-heartland.root-gallery-cult-warren` | channel | 0.885 |
| `place.dunmer-north.the-tear-wreck` | channel | 0.875 |
| `place.dunmer-north.the-drowned-terrace` | channel | 0.857 |
| `place.hist-heartland.drawdown-flat-exposed` | channel | 0.853 |
| `place.mercantile-coast.mudfoot` | channel | 0.833 |

### Registry entries solved by minor water geometry

- (none this run)
