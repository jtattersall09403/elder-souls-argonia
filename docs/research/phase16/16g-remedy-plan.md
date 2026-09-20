# 16g remedy plan (the reasoning behind `world/sources/sites/plot-remedies.json`)

Written 2026-09-19 by the planning agent from the eight review packs
(`16g-review/*.md`, condensed by a read-only agent) after the second re-plot
on corrected heights. The packs are the measurements; this file is the
decisions; `plot-remedies.json` is the machine record (`why` on every row
quotes the measurement). Ledger §2's reasoning rows point here.

## Principles applied

1. **Canon ties move the record; invented flourishes move the prose.** Where
   a dossier or UESP page fixes a place to its water or its neighbour
   (Blackrose in its lake, the hatching pools in central Shadowfen, Bogmother
   south-west of Stormhold, the Keel-Sakka village up its river, Lilmoth's
   satellites under Lilmoth, Keshu's grove in Murkmire, Root-Whisper below
   its xanmeer, the Onkobra records on the Onkobra), the record is pinned by
   typed siting (`boundTo`, `nearWater`, `nearPoint`, `minDepthM`) and the
   solver moves it. Where the prose invented a river, a lake, a gorge or a
   compass bearing the ground never had, the prose is rewritten against the
   record (standard 12, decision 0065: the graph is the classification).
2. **A dive or a hull needs depth at the dot; a village needs water at its
   edge.** Reefs, banks, wrecks, shafts, drowned stairs and submerged ruins
   are pinned with `minDepthM` (dive 1.0, hull 1.5, the quest depths where a
   quest names one). Villages and stations with an underwater entrance keep
   their dry dot: 16h places the entrance on the bank and the volume off it
   (imperial-fringe pack).
3. **Owner-approved city pins do not move.** A city whose prose and ground
   disagree is an owner call, reported with the measurement (three below).
4. **A dangling road reference is re-pointed at the 0069 successor or
   dropped**, never left; `re-reference` gains `null` = drop the edge.
5. **Nothing is parked.** Every flagged record has a row, a rewrite, or an
   owner-call line with its numbers.

## Owner calls (recorded, not decided here)

- **Pirate freeholds zone water identity.** All 21 records key their water to
  `body.2442-1212` (a 143 ha marsh sheet, level 0.0, cultured dunmer-north)
  while every prose line and the Alten Corimont dossier say river. Alten
  Corimont's pin is owner-approved; the honest fix is (b) re-solve the zone
  onto the Onkobra reach that carries `route.boat.alten-corimont-helstrom`
  with the dependants following by `boundTo`; the cheap fix is (a) rewrite
  the 21 to marsh language. Recommendation: (b). Until the call, only the
  zone's non-water faults are remedied.
  2026-09-20 owner: zone stays; prose adjusted to side-channels and backwaters
  of the river country (13 sentences across 8 records touched).
- **Blackrose "built in a lake".** Centre 109 m from the lake body; the
  gate is on its road. Recommendation: move the centre (not the gate) onto
  the lake shore in 16h's city pass; the harbour station meanwhile is
  `place.imperial-penal-south.intact-fort` (0 m from the lake, 69.9 m from
  the lane, 3.76 m).
  2026-09-20 owner: the centre goes on the island in the middle of the lake,
  in 16h's city pass (not the shore).
  2026-09-20 owner: the lake is `body.1284-3448`, the id the compiled water
  record carries. The graph's `body.1290-3508` is marked
  `realisedBy: body.1284-3448` and never compiles, so every remedy row and
  the attested name "Blackrose Lake" now sit on `body.1284-3448`.
- **The stronghold.** `the-empty-steading` (approach, no landing) vs
  `rockpoint` (landing, no approach, §20e sightline false). Decision taken
  here, reversible: the Empty Steading, pinned to the 1.72 m marsh edge
  40 m off with the Gideon–Soulrest road at ~230 m; `reservedFor:
  player-stronghold`. Rockpoint keeps its record. `xal-meeruth-station` is
  the named alternative if the owner rejects both.
  2026-09-20: Empty Steading cut with the homeless 13 (owner rule); stronghold
  is Rockpoint.
- **Opening ring danger.** `opening-work-camp` has no D4/D5 *place* within
  250 m but band-4 *ground* on 22 of 24 bearings. Read here as places, not
  ground bands; no move.

## Harbour station per city (`world/sources/routes/harbour-stations.json`)

| city | placeId | why |
|---|---|---|
| stormhold | `place.dunmer-north.stormhold-causeway` | 99 m from centre, 69 m from the lane, Velasen Tarn 9.27 m |
| thorn | `place.dunmer-north.the-thorn-bond` | pinned this round to ≥1.2 m within 250 m of Thorn; Thorn's single boat station |
| helstrom | `place.hist-heartland.helstrom` | the lane `alten-corimont-helstrom` ends at the gate on 0.0 m; `compile_minor_waterways` re-lines the lane to its last floating sample (≈421 m out) and the station reads the lane end |
| gideon | station `ferry-landing.onkobra-bond.town` (a `stationId` row: a ferry landing is a derived station, not a record) | a harbour is a station a traveller boards while the rootworm terminus is a root node, so the gate refused it; the bond ferry lands here and joins Gideon by the Blackwood Road (the road edge). No keel water in Gideon's ring |
| blackrose | `place.imperial-penal-south.intact-fort` | owner-call row above |
| lilmoth | `place.mercantile-coast.lilmoth` (socket `dock.lilmoth.lighter-quay`, 3902,6366 on `body.ocean`) | the quay is the city's own socket |
| soulrest | `place.mercantile-coast.soulrest-divers-yard` | 210 m, lane 101 m, 2.15 m — the only harbour depth inside 600 m |
| archon | `place.saxhleel-coast.quay-tradehouse` | 281 m, lane 32 m; keel water on the lagoon sample 5.16 m at 287 m |
| alten-corimont | `place.pirate-freeholds.half-chartered-anchorage` | Galonen Lake 7.56 m |

## Rootworm network (`travel-services.json` rootways)

Five nodes, each a catalogue record with roster slots: `rootworm-station-helstrom`
(hub), `gideon-rootworm-terminus` (seasonal wintertide stop, quests 20
§12b), `east-estuary-rootworm-station` (the placeholder node
`root-node.east-estuary` 1333 m away is the same facility: node re-sited onto
the station), `dead-water-village` (the naga-deeps terminus, lore's
terminus, 3 slots; the placeholder node re-sited onto it once it is sited),
`stormhold` (north-shadowfen terminus, the city's own slot). Hero Hist slots
6–9 stay unserved: the Underground Express is a line, not a bus route; the
dossiers name no station at them.

## Remedies by region (the rows in `plot-remedies.json`)

Notation: pin = `pin-by-siting`; all ids carry their `place.<zone>.` prefix
in the JSON. `(deliver computes)` = the delivering agent measures the value
under the stated rule and records it in `why`.

### dunmer-north
- `hatching-pools` pin `boundTo stormhold 1200`, swamp landform classes (the recipe's marsh side).
- `bogmother` pin `boundTo stormhold 2500`, `sightlineTo [the-black-stage]`.
- `the-northern-rest` re-reference `route.track.bogmother-causeway` → the registry's Bogmother track id.
- `the-two-hundred-roofs` pin `minDepthM 0.6` (a boat station on water); drop its known-red request.
- `mazzatun` pin swamp landform classes (the dossier has it as a swamp city).
- `murkwater-shadowscale-ground` prose `sitingNote`: a screened hollow among neighbours, not an empty one.
- `the-thorn-bond` pin `boundTo thorn 250`, `minDepthM 1.2`.
- `the-slumped-hamlet` pin `nearWater body.2879-340 60`; drop its known-red request.
- `the-crown-terrace`, `the-pass-station` pin `boundTo` re-pointed at the live record their `why.founding` names (deliver reads it), else drop the bind.
- `the-field-gate-garrison`, `the-last-landing`, `the-ash-causeway` pin `nearPoint` on the nearest 0069 road point, maxM 150.
- `gandranen-library` + `gandranen-ruins` merge `group.gandranen` (anchor the ruins).
- `the-divers-landing` pin `boundTo the-drowned-terrace 300`, `minDepthM 1.0`; drop its request.
- `the-tear-wreck`, `the-shoal-bank` pin `minDepthM 1.5`.
- `feeds-the-north`, `loriasel-caverns`, `the-charge-pond` pin `minDepthM 1.0`.
- re-reference `route.road.alten-corimont-stormhold` → its registry track id on `hatching-pools`, `the-xanmeer-hold`; `route.road.thorn-tear-road` → the registry's Tear exit id on `the-drover-camp`, `the-field-gate-garrison`, `the-north-border-post`, `the-two-gate-bridge`, `thorn`.

### hist-heartland
- `lost-city` meso-move onto the ≥1.0 m cell of `body.1475-2118` (deliver computes, ≤150 m).
- `group.lost-city` re-bound at `maxM 100` (register and catalogue both 100).
- `xal-krona-making-ground` meso-move 38 m onto the marsh-deep edge.
- `beast-keeper-lizard-steed`, `burn-scar-village-ash`, `sinkhole-mouth-basin`, `hammock-tree-island-greenmoss`, `legendary-deep-medusa-wood`, `bioluminescent-glowfen`, `bone-waystation-interior`, `drowning-narrows-current`, `greenspring`, `dream-wallow-sap-pool`, `mass-grave-flu-memorial`, `root-gallery-cult-warren`, `sap-touched-miredancer`, `serpent-ground-giant-snake` prose: the water clause rewritten to the recorded kind and distance (`plotFacts.water`). `greenspring` additionally drops its applied-but-undelivered request.
- `air-pocket-station-basin`, `root-gallery-drowned-stair`, `wamasu-pond-nest` pin `minDepthM 1.0`.
- `helstrom` merge `group.helstrom` with `rootworm-station-helstrom`, `guide-camp-gate-side` (districts of the city; spread 100 m).

### imperial-fringe
- Onkobra naming chain: extend the attested name over the chain from `river.352-503` to the coast in the names register; then pin `nearWater <nearest chain reach> 150` on any of the seven Onkobra records still > 300 m from the chain (deliver measures).
- `fort-swampmoth` pin `nearPoint` on the Blackwood Road at the first point ≥ 350 m outside Gideon's edge, maxM 150; `swampmoth-town` pin `boundTo fort-swampmoth 350`.
- `the-broke-column` pin `nearPoint` at the Blackwood Road's sharpest bend within 2 km of Gideon, maxM 150.
- `glenbridge` pin `nearPoint` at the nearest road water crossing (`crossing.*` on a Gideon road), maxM 150.
- `gideon` prose `hardConstraints`-derived founding line: "river landing" → the pond and the Onkobra chain 77 m off.
- `comes-back-slowly` meso-move to 340 m from Gideon on its bearing; `the-quiet-pit` meso-move to 360 m.
- `bonded-shed-of-the-onkobra` merge `group.gideon` (Gideon's quay ward; prose "riverside" → "waterside").
- `the-marble-field` meso-move 149 m outward keeping LOS to Gideon.
- `stonewastes` prose the causeway/bog sentence to the ground; `moonrack-calcinator` meso-move onto the local high cell within 150 m.
- 27 stale aliases re-referenced by registry name match; unresolvable ones dropped (`null`); the checker fixed to resolve route and lane ids.
- `the-drowned-furrow` re-type to the same family's upland recipe; if none, cut. Its request drops with it.
- `the-stone-talkers-watch` (homeless) pin `nearPoint` at its last dot, maxM 800.
- `the-empty-steading` pin `nearPoint 1890,4550 80`, `nearWater body.1001-2519 40`; `field reservedFor player-stronghold`.
- `lower-onkobra-paddies` pin `nearWater <Onkobra chain reach> 60`; `the-cold-lights` pin `nearWater <its named reach> 60`, `minDepthM 1.0`; `hangs-above-the-water` pin `nearWater <Onkobra chain reach> 40`.

### imperial-penal-south
- `blackrose-drowned-hist` pin `nearWater body.1284-3448 0`, `minDepthM 5.0`; `lake-submerged-xanmeer` prose eighteen → the recorded 3.3 m; `lake-drowned-village` pin `nearWater body.1284-3448 0`, `minDepthM 5.0`; `lake-boardwalk-village`, `lake-divers-yard`, `west-market-town` pin `nearWater body.1284-3448 60`; `natural-dive-shaft` pin `nearWater body.1284-3448 30`, `minDepthM 1.0`; `three-gate-toll` pin `nearWater body.1284-3448 80`; `bramman-head` pin `minDepthM 1.2`.
- `drawdown-flat` prose (no four-square-kilometre arm exists).
- `rose-outworks` pin `nearPoint` 320 m outside the prison on its bearing, maxM 60; `lilmothiit-quarry` meso-move 80 m toward Blackrose.
- `longmont`, `flu-quarantine-village`, `murkwood-verge`, `vampiric-cloud-ground`, `basin-sinkhole`, `marsh-giant-ground-basin` prose the compass word.
- `rockspring`, `plague-cordon`, `prison-born-refuge`, `rose-bone-waystation`, `longmont`, `basin-sinkhole`, `murkwood-verge`, `manned-toll-tower` prose lake/feeder → the recorded body; `manned-toll-tower` additionally pin `nearPoint` on the road nearest Blackrose's gate, maxM 100; `rose-supply-town` pin `nearPoint` on the causeway road, maxM 150; `plague-cordon` merge `group.rose-cordon` with it (`boundTo rose-supply-town 60`); `rose-bone-waystation` pin `nearPoint` on the same road, maxM 150.
- `blasphemer-urn-vault` meso-move 150 m from `flu-mass-grave`; `ledgered-blackguards` pin `boundTo three-gate-toll 250`, `sightlineTo [three-gate-toll]`; `chainbreaker-shelter` meso-move onto the channel edge.
- `akaviri-works` + `rebellion-earthworks` merge `group.blackrose-siege-works`.
- `necromantic-dig` meso-move to 2075.5,6517.2; `rose-flooded-passage` pin `boundTo blackrose-prison 300`.

### mercantile-coast
- `lilmoth-divers-yard` pin `boundTo lilmoth 500`, `nearPoint 3853,6404 150`, `minDepthM 1.0`; `lighter-flotilla` pin `nearPoint 3880,6380 400`; `keel-sakka-stilts` pin `nearWater river.720-1110 150`; `oliis-ferry-stage` pin `nearPoint 3760,6300 400`, `minDepthM 1.2` (`oliis-boardwalk` follows by its bind); `alessian-hull` pin `nearPoint 3814,5920 600`, `minDepthM 8.0` (if homeless: the deepest cell within the radius, prose the number); `whitebone-reef` pin `nearWater body.ocean 30`; `keshu-grove` pin `boundTo lilmoth 1500` (Soulrest is 3 km off, so this clears its 800 m).
- `alten-meerhleel` prose the direction; `pusbottom-barge` meso-move onto ≥0.6 m water; `white-rose-prison` prose off the cut road and its `route.road.helstrom-blackrose` edge dropped; `inhabited-meer-murkmire` prose the road name to `gideon-soulrest`.
- `bereaved-village-murkmire` pin `boundTo bog-blight-ground-murkmire 400`.
- `root-gallery-murkmire` pin `nearPoint` 1400 m from Soulrest on its bearing, maxM 300.
- `screen-watch` meso-move ≤150 m toward `bramman-screen` with LOS; `soulrest-breaking-yard` pin `boundTo soulrest 200`, `nearPoint` on the 2.15 m shelf (pack :278-281), maxM 60.
- `lilmoth` field `terrainRequests []` (the quay socket is already on ocean); `oliis-drake-deep` pin `nearWater body.ocean 0`, `minDepthM 6.0` and its request dropped.
- `villa-cellars` meso-move 11 m onto ocean; `glowfen-murkmire` meso-move 23 m onto its swamp; `quinrawl-anchorage` pin `minDepthM 1.5`.
- 7 prose-name relations re-referenced to `names.json`/registry ids or dropped.

### naga-kur-deeps
- `root-whisper-village` pin `boundTo sealed-xanmeer-vakka-deeps 450`; prose "between the twin xanmeers" → "below Vakka-Bok".
- `deepmire-refuge` pin `nearPoint 2525,4476 100`; prose the 40 m plateau → the ridge eight metres over the flood.
- `harmed-hist-enslaved` prose the sixty metres to the flooded passage.
- `dead-water-village`, `sinkhole-mouth-deeps` pin `nearPoint` at their HEAD dot, maxM 600 (`sinkhole-mouth-deeps` also `minDepthM 1.0`).
- `wreck-submerged-barge` pin `minDepthM 4.0`; `dive-shaft-natural-deeps`, `drowning-narrows-tidal-gate`, `drifting-village-wet-mooring` meso-move onto ≥1.0 m water.

### pirate-freeholds (non-water faults only; zone call above)
- `dres-holding-pens` pin `nearPoint` on the trunk road, maxM 60; `rim-smugglers-ledge-north` pin `scourSiteIds` a cliff-bench site on the border wall; `rim-pass-station` prose 226 → 153 m; `rim-keystone-chamber`, `reoccupied-fort`, `freehold-smithy`, `corimont-hiring-yard` prose; `freehold-naga-camp` meso-move 40 m SW; `opening-work-barge` pin `boundTo opening-work-camp 200`, `minDepthM 0.6`; `chasecreek` meso-move to its shore cell and its request dropped; `reach-wreck` pin `minDepthM 6.5` (homeless → deepest within radius, prose the number).

### saxhleel-coast
- `archon-shipyard`, `archon-bonded-row` pin `nearWater body.2834-2585 40`, `minDepthM 1.5`; `mangrove-reef` pin `nearWater body.ocean 20`, `minDepthM 1.0`; `archon`, `seafalls`, `banner-stack`, `estuary-keepers-lodge` prose the water to lagoon/swamp as recorded.
- `coast-hist-less-refuge` pin `nearPoint` 700 m from Archon on its bearing, maxM 200; `jungle-root-hollow`, `terrace-village-ridge`, `archon-shadowscale-sanctuary`, `cantemir-headland` pin `nearPoint` 1300 m from Archon on their bearings, maxM 300.
- `archon-lighthouse` (homeless) pin `nearPoint 5122,4823 300`, `sightlineTo [padomaic-wrecker-beach, gap-reef]`; `padomaic-wrecker-beach` meso-move to the tidal reach edge ~4615,5478 if ≤150 m, else pin `nearPoint` there maxM 100.
- `lagoon-submerged-xanmeer` pin `minDepthM 6.0` (quest 25 §212).
- `umbriel-shore-memorial` prose: the Undaunted-Wayfarer coast marker, not the province memorial at Deepmire.
- `oliis-coast-lay-by` pin `nearPoint` on the nearest route within 1.2 km, maxM 150.
- `gap-reef`, `outer-reef`, `contested-bank`, `deep-bank`, `pearl-lots` pin `minDepthM 1.0`.
- `estuary-ferry-stage`, `jungle-ferry-stage` cut (no position, no lane); their services retired with the reason; Archon's `route.boat.archon-estuary` edges re-referenced to `route.boat.lilmoth-archon`.

## Departures found while authoring (the record wins over the plan)

- **The Onkobra name does not extend.** Walking `river.352-503` downstream
  reaches reaches already attested as the Panther River and the Stormhold
  River and the north-east coast, so the headwater stays the Onkobra. The
  four records whose id carries the name are pinned to it (`nearWater
  river.352-503 200`); `the-eight-steps` and `hangs-above-the-water` are
  rewritten onto their own reaches; `the-lake-divers-yard` never named the
  river; Gideon's founding line names its pond alone.
- **Prose rows only where the current record contradicts the sentence.**
  Ten plan-listed records read true on the re-plotted record (the pack's
  water table was measured on the previous plot) and were not changed:
  `beast-keeper-lizard-steed`, `bioluminescent-glowfen`,
  `drowning-narrows-current`, `hammock-tree-island-greenmoss`,
  `sinkhole-mouth-basin`, `dream-wallow-sap-pool`, `mass-grave-flu-memorial`,
  `root-gallery-cult-warren`, `sap-touched-miredancer`,
  `serpent-ground-giant-snake`, plus `freehold-smithy`,
  `corimont-hiring-yard`, `plague-cordon`, `umbriel-shore-memorial`.
- **Numbers from measurement, not from the plan:** `lake-submerged-xanmeer`
  3.6 m (recorded depth at the dot); `harmed-hist-enslaved` 24.5 m;
  `rim-pass-station` 183 m (published height at its dot); compass words
  measured against Blackrose at 2123, 6215.
- **Moves over 150 m became pins** (`nearPoint`, maxM 60): `comes-back-slowly`
  (841 m), `the-quiet-pit` (269 m), `necromantic-dig` (188 m),
  `blasphemer-urn-vault` (586 m), `padomaic-wrecker-beach` (846 m, maxM 100),
  `drowning-narrows-tidal-gate` (180 m). `lost-city` moved 30 m onto
  `body.2442-1212` (1.08 m): no cell of `body.1475-2118` carries 1.0 m within
  400 m. `the-marble-field`'s pin loses its line of sight to Gideon (recorded).
- `the-drowned-furrow` re-typed to `ducal-ruin` (the upland recipe of its own
  family) rather than cut. `the-stone-talkers-watch` has no last dot anywhere;
  it is pinned near `rockgrove`, which its own neighbour relation names.
- `nearWater.maxM 0` is outside the catalogue's 10–1500 m band; the three
  "in the lake" rows carry 10 m with `minDepthM` holding the intent.
- The 49 unresolved reference strings were alias forms (`boat:`, `road:`,
  `rootworm:`, prose names); 27 resolved through one shared resolver
  (`worldgen/route_reference.py`), 22 dropped. `re-reference` now reaches
  `reachedVia`.
- `dead-water-village` gains `rootworm` in its station modes (a `field` row;
  the allowlist gained `travelStation`).

## Numeric prose after the chain

Sentences that quote a distance or depth of a record this plan moves
(`archon-shadowscale-sanctuary`'s third of a kilometre, the two homeless-fallback
depths, the Bogmother causeway's "last two hundred metres") are re-measured
after the chain run and rewritten in the same session; the text-review pass
runs after that rewrite.

## Tooling defects fixed alongside

- `macro_plot` `danglingRelations` resolves route and lane ids (was: place ids only; 24 false rows hid 27 real ones).
- `plot_remedies` `re-reference` accepts `null` (drop the edge); `field` allowlist gains `terrainRequests` (deliverable 7 owns the register).
- Queued to the polish backlog: `heightAboveWaterTableM` reads negative at 200–300 m elevation; `air-pocket-station-deeps` shows two depths for one dot (graded bake 1.6 vs recorded 7.75); `plotFacts.water.distanceM` is planar.
