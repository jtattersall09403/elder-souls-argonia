# Type 10: road structure or crossing (sheet written by the type's first slice, the Border road crossings below Greenspring, 16k walk 9; edited by every later slice of the type)

A route place is a stretch of a major road built as one place: its crossings,
its stairs and its road dressing, between built places or a built place and a
city. It has no catalogue record. Its record is its row in
`world/sources/routes/route-structure-exemplars.json` (the home table,
standard 18), which `worldgen.blueprint.catalogue_ids()` and
`blueprint_promises.load_record` read like a catalogue row.

- **The record row:** `id` `place.route.<slug>`, `wayId` (the province
  route), `chainageM`, `positionM`, `footprintRadiusM`, `region` (the
  territory: hist-heartland), `culture` (the kit culture: `argonian`, never
  the territory, or `place_kit_preference` returns nothing and every
  asset id resolves to the alphabetically first kit), `settingClass`
  (`wild`), `condition` (the registry's), `why` as the five causal keys (the
  `why` obligation is carried by the blueprint's `causalModel`, key for key),
  `ends`, `structures[]` (kind, id, `builtBy`: `this-place`, `route-compile`
  or a place id; a kind not on the stretch is `pending: packet` with the
  stretch that holds it), `dressingRules`, `dressingEvidence`. Every field is
  classified in `place_obligations.FIELD_POLICY`.
- **Choosing the stretch:** a stretch whose road wades a `span`-band crossing
  of `water-crossings.json` with no owning place, beside a built place, on no
  unbuilt place's ground. Since 0115 every such crossing either has a place or
  the road wades it.
- **Cultures:** the crossings are the culture's built ways (vanilla
  `dockstrent02` piled runs on an Argonian or Dunmer timber road; the
  route-structures families for stairs); the dressing is the neutral road
  furniture pool `route-dressing-v1` (DRESSING_KITS and the `neutral-route`
  kit set).
- **Lore to read:** the route's registry row (`condition`, its notes), the
  junction pins on the stretch (`junctions.json`, owner steers), the owning
  places at each end.
- **Bars:** no `breadth-bars.json` type object; the dressing densities are
  the mine's (`vanilla-roadside-dressing.json`): rocks 66.8/km at a 4.86 m
  median off the edge, clumps of 1-2, 3.5x more dressing at bends than on
  straights, cairns 1.2/km as singletons, campfires 0.28/km (47% at bends),
  signposts only at junctions of three or more roads, shrines 0.06/km. The
  province scatter already sets rocks; the slice placed 27 dressing pieces on
  0.87 km.

## The blueprint

- **Ways.** The place IS its province way: `networkTerminals[].wayId` names
  the record's `wayId` (the validator admits it for a route place). Never a
  blueprint `routes[]` row along the road: the compile then judges it as a
  street (crosses the runs, crosses water, needs a gate) and paints over the
  province paint.
- **Approaches** start at least 30 m out along the road
  (`APPROACH_STANDOFF_M`): read the route px (`routes.json`, 5.48 m cells)
  or the track px (`routes-minor.json`) for the point.
- **Crossings** are run parcels (`use: dock`, `groundFit: stilt`), laid
  with `wb.py <scene> boardwalk ... --pick 3` (never hand-laid
  `boardwalk.ops_for`: pick 0 crosses at every joint, 15 run-joint and 15
  coplanar failures). `--search 16` finds a dry end the 6-degree end rule
  accepts on a bank toe.
- **A run end at a route-compiled stair** hands over to it: `walkwayRule`
  reads the published route bundles (`province/settlements/routes/*.json`
  `route-structure` placements) and records `handover` instead of
  `bump-on-step-off` when the step-off cell lies on the stair's outline.
- **Dressing** is three `waymark` parcels, one per condition band, each
  pinned `kind: prop` (so 97 C1 admits the dressing pool), `groundFit`
  `dug-in`, its shell the band's mark (a cairn, the fire ring) and the rest
  ground members of its assembly; a footpath stub from the road reaches each
  shell (`pathReachRule`).

## Dressing by condition (road-dressing.md rule 3)

| Band | Where | Pieces |
|---|---|---|
| maintained | within 300 m of the owning place | a cairn at the track head, single rocks only, verge kept clear |
| worn (the record) | the middle and the far end | rocks clumped at bends, rubble piles, a cold fire ring on the flat at a bend, a grave mound, a cairn at each crossing head |
| decayed or broken | (not on this stretch) | tumbled walls only where the region grammar has walls; never on a hist-heartland road |

Generator: `tooling/.reports/16k/walk9/place-type-10/t10dress.py` with its
`t10spec.json` (cluster anchors, assets, offsets, per-piece slope caps,
deterministic by uid). `layout_template.py` has no type-10 class yet; the
generator is the seed for it.

## Pieces that worked, pieces that failed

- `route-dressing-v1` (vanilla, full LOD chain, kit policy `dug-in`): the
  rocks, wet rocks, piles and `landscape/rocks/cairns/rockcairn01-04`.
  `flora-province-v1` carries the same rocks with one level: a row under
  1.5 m is placeable and wins alphabetically unless the place's kit
  preference names `route-dressing-v1`.
- `clutter/burialcairn/burialcairn01-03` and `clutter/woodfires/campfire01landoff`
  have their pivot at mid-height: `direct` (an `assetPolicies` row), never
  `dug-in`, which sets the pivot on the lowest ground and buries them by
  half their height.
- Failed: the Mud Mother `argoniantotem01` and the Skyfall `rockcairn02`
  (direct fit, 2-degree limit) found no flat cell at the track head.
- Not kitted on purpose: `clutter/quest/dbbrokencart01` exists in the
  vault, but a stretch with stairs and plank crossings carries no wheeled
  traffic.

## Known failure modes

- A missing kit piece is a kit job inside the lane (lessons row in
  `build-and-publish.md`).
- The record row's `culture` must be a kit culture.
