# Dressing: facing, sockets, signs and what a place still lacks

Read at step 1 (§ Dressing groups of the design brief) and step 2 (the
layout's dressing ops). The yard sets come from
`world/sources/placement/yard-sets/<type>.json` (0101); this file holds the
rules every placed prop obeys on top of them. The three `check` rules named
here live in `tooling/placement-workbench/workbench/dressing_rules.py`.

## 1. Facing (`seatFacingRule`, R94)

A prop that someone uses from one side faces where that person stands.
The check reads a seat's front from its mesh (the back is the top 30 % of
its height; the sitter faces from the back through the centre), never
from its name or from +y.

| Prop | Faces | Bar |
|---|---|---|
| chair, stool with a back, bench with a back | the table when one is within 1.5 m; else, within 2 m of a building, away from that wall; else toward the nearest way within 15 m | ±45° (±90° toward a way); `seatFacingRule` |
| backless bench or stool | its long side along the wall or table | reader |
| cooking spit, cooking stand, oven mouth | the cook's side, toward the open yard or the door it serves, never the wall | reader |
| lantern on a post or a bracket | its arm out over the way it lights | reader; R89 keeps it out of the door |
| hanging shop or inn board | out from the wall on its bracket, so the board is read from the street both ways | `serviceSignRule` places it; reader judges the turn |
| road-sign arm | onto the road it names | `signRule` (R68) |

A yard set's member facing is relative to the set's yaw. When the set
turns, read the seat again: a `move <uid> --yaw` after the `group place`
fixes one member (Claywater `b5-ahy-chair`, walk 8). Never rebuild the set
for a single member.

## 2. Idle sockets mark a thing (`socketCoherenceRule`, R95)

An `idle` socket is where a Phase 13 person will stand doing the activity.
It is invisible in the game and shows only in the studio's socket overlay,
labelled `idle · <activity> · <building>`. So every socket stands at the
thing it names, hosted on that piece's uid where one exists.

| Activity | Stands at |
|---|---|
| `sit` | within 1 m of a seat |
| `cook` | within 2 m of a fire, cooking stand, spit, pot or hearth |
| `fish`, `pole` | within 3 m of water, or hosted on a dock, boat or deck |
| `sleep` | in an interior cell (`interiorCell` + host), or under a building's roof |
| `work-at`, `tend` | within 2 m of a workplace, crop, pen or shrine prop, or on an open building's floor |
| `stand` | anywhere walkable (walkRule reaches it) |

A socket that marks nothing is moved onto its prop, or its activity is
corrected (drying fish at a rack is `work-at`, not `fish`). It is dropped
only when the roster keeps a work and a home socket for every slot.

## 3. Signs by use (`serviceSignRule`, R96)

Skyrim hangs a trade's board on the wall beside the door (a bracket post
only for the stable), never over the opening, and stands a signpost only at
road junctions, with one arm per destination. A board with a mined wall pair
on another building is hung with `wb.py mount <board> <host> --like <that
building>` (R97). A parcel whose `services` hold `lodging`,
`trader`, `stable` or `smith` carries its board within 4 m of its walls,
mounted by the mined pair (`wb.py mount <board> <post>`), wherever the
place's pool has a published sign family. A board new to the pool first gets
its `assetPolicies` row (`direct`, with its `assetPolicyEvidence` reason) and,
when it has an `assetPlacement` anchorClass, its mounts record row
(`mine_mounts --assets <board> --merge`); `wb.py mount` refuses it until both
are there.

| Pool (place id region) | Bracket post | Boards in a kit | Not yet in a kit (vault) |
|---|---|---|---|
| `imperial-fringe` (settlement-imperial-v1) | `vanilla:clutter/signage/whiterun/signwrpost01` | `signwrstables01` (stable, mined on the post), `signwrgeneralgoods` (trader, lodging; on the wall by `mount --like` its `wrhousestores01` pair, R97), `signwrdrunkenhuntsman01` (a named inn: not used) | `signwrblacksmith01`, `signwralchemyshop01` |
| Argonian pools (`hist-heartland`, Murkmire, `dunmer-north` Argonian places) | the shell's wall | KotM `argonia/blackwood/sign` (wordless sun board), settlement-mud-v1 | hung with `mount <board> <shell> --like plugin-static:architecture/riften/rtblacksmith01city.nif --twin vanilla:clutter/signage/riften/signrtblacksmith01 --hook-only` (R99; the twin's hook band matches within 1 cm) |
| Junction signpost (any pool on a road) | `vanilla:clutter/signage/roadsigns/roadsignpost` (works-v1) | `bmv:roadsign{small,medium,large}01{l,r}` | the vanilla named arms (Skyrim town names; never used) |
| Dock | `vanilla:architecture/docks/dockcolstrsign01`, `dockcolstrsignrope01` (docks-v1) | as listed | |

The rule passes and lists a pool with no family in its row, so the gap
stays visible without blocking the place.

## 4. Yard dressing by type (walk-8 review, placed walk 9)

Each row is a 16k checklist row ("Yard dressing breadth, walk 8"). A new
place of the type takes the row's piece unless its record or ground gives
a reason, written in the brief. Uids in the layouts are `d9-*`.

**Before a piece enters this table or a layout, read its licence**: the
kit manifest row's `settingClass` (`wb.py - describe`, or
`world/sources/placement/kit-setting-class.json`). An outdoor piece over
1.2 m needs `exterior` among its settings (R1, R14), and its classes must
meet the place's pool (R9: a village takes town, village or camp). A piece
its own plugin never places ("evidence": "unplaced") is licensed nowhere,
unless a reviewed `settingLicence` row in placement-policies.json licenses
it for a setting class (R1): the row's `when` names the place types,
record services, culture and record terms, or parcel uses it stands in,
and `setting.class` judges each placement on its own parcel. Walk 8's
table named five pieces that fail R1 (the Sithis shrine, the small fish
rack, the herb rack, the rain butt and the clutter hide rack); walk 9
found it only at `place_gates`, after placing and rendering them.

| Item | Piece | Kit | Placed (walk 9) |
|---|---|---|---|
| hand cart, vendor cart | `vanilla:clutter/carts/handcart01/02`, `vendorcartstatic01` | works-v1 | Claywater (`isy-cart`, walk 3) |
| rain barrel | `vanilla:clutter/barrel01` (exterior village, 76 outdoor refs in Skyrim.esm) under an eave. Never `largerainbarrel01`: its mesh is 4.0 x 4.4 x 5.5 m, a cistern on a trestle that Skyrim.esm stands only indoors. Vanilla has no small open barrel (the mesh listing holds `barrel01`, `barrel02` and the cistern); the open KotM barrels (`loliceptresource/barrel/rugopenbarrel`, 1.4 m) are placed by no plugin and carry no sink row | works-v1 | Riverwalk family house |
| hide rack | `vanilla:furniture/tanningrackmarker` (the furniture Skyrim places outdoors). Never `clutter/common/tanningrack01`: same rack, but no plugin places it, so R1 licenses it nowhere | works-v1 | Claywater stable yard |
| herb drying rack | none outdoors. `wrherbdryingrack01` (1.04 x 1.82 x 0.76 m) is a slatted frame on four corner chains, hooks 0.70 m over the frame, with no hang point on its pivot axis. The mounts miner (re-run per asset, walk 9) finds 7 refs, all indoors: 4 standing, 3 hung, abutting only interior loft and roof statics (`wrintloftmid01`, `whintwoodroofmidtop02`). It needs a flat ceiling across all four hooks, and no exterior piece in the pool gives one | works-v1 | dropped |
| notice board | `bmv:advertising_board` (roofed, on a stone pedestal), a modder's resource no plugin places; its `settingLicence` row admits it at a road station or a place with trade or a travel service | works-v1 | Claywater, in the station-house yard by the outdoor table (beside the door it blocked the walk to the sack); Greenspring, beside the lodge door; Riverwalk, beside the crews-house door |
| chopping block | `vanilla:clutter/chopping block/choppingblock01` | works-v1 | Claywater woodpile |
| outdoor table | `vanilla:clutter/exteriorwoodenfurniture/exteriorwoodentable01` (a log trestle with rope; the only exterior-licensed table) with `farmbench01` | works-v1, settlement-imperial-v1 | Claywater, beside the well |
| beehive | `kotm:argonia/clutter/beehive` (two hives on a bench; placed outdoors at RootWhisperVillage). Never vanilla `beehive01`: the burnable Goldenglow hive carries its burning state in its NIF, so the fire layer mines a fire onto it | works-v1 | Greenspring east hut |
| chicken nest | `vanilla:plants/chickennest01` (collider convex, walk 9) | settlement-imperial-v1 | Greenspring east hut (one: see the collider note below the table) |
| graves | `vanilla:clutter/burialcairn/burialcairn02` (a low cairn; licensed keep and town, so a village may take it). Never `burialcairn01`/`03` in a village: licensed keep, ruin and wild only (R9). Burial runs through the Hist (`argonia-4e201-state.md:165-167`) | works-v1 | Greenspring, north-west of the Hist (one) |
| Sithis shrine | mudmother `sithisshrine` (placed only inside 00MudHut01); its `settingLicence` row admits it outdoors where the record's culture is Argonian and the record names a Sithis or dead-cult provision. `argoniantotem01` (exterior) is the generic shrine piece | settlement-mud-v1, dungeon-root-v1 | not placed, by the licence: none of the three records names Sithis or a dead cult, so `setting.class` refuses it at all three. Riverwalk's shrine parcel and Greenspring's Hist shrine carry totems |
| wind chime | histtree `windchimehavok` (2.24 m: a cord from a top pivot, the chimes 1.9 m below it) hangs (`mount --hang`), never stands: its base stood 0.62 m in the ground | settlement-mud-v1 | Greenspring, from a Hist branch 7.7 m up; Riverwalk, from the crews house's deck edge 3.1 m up (the totems are 1.95 m tall, too short to hang it clear of the ground) |
| market stall | `vanilla:architecture/riften/rtmarketstall01` (counter and canopy; exterior town) | works-v1 | Riverwalk crews path (the record's trader) |
| fish rack | `vanilla:clutter/deadanimals/fishrack01`, `fishrack02` (exterior). Never mudmother `fishracksmall` outdoors: placed only inside 00MudHut01 | works-v1 | Claywater (walk 3), Greenspring family hut, Riverwalk islet |
| awning | htbm `orcawning01`, a hide canopy on three log posts, at **scale 0.65** as HTBM places all 3 of its refs (3.5 x 3.2 m, 3.2 m tall; licensed exterior by HTBM's own cells), at a stilt parcel's yard; its posts are sunk 0.59 m by its `assetPlacement` row (sink 0: the sink miner drops every non-unit-scale ref). `orcawninghalf01` (8.2 x 5.0 m lean-to) | settlement-stilt-v1 | Riverwalk, the family house and the crews house; the crews-house awning hangs the wind chime |
| washing line | htbm `farmhouseline` (2.5 x 1.3 x 2.3 m: two forked log posts with a rope slung between, no washing on it; no plugin places it), licensed at a domestic parcel by its `settingLicence` row; sink 0 by its `assetPlacement` row. KotM `buntingline01` (a 6.9 m line between two eaves) still needs a two-end hang (backlog row) | works-v1 | Claywater family hut; Greenspring family hut; Riverwalk family house |
| animal pen | fences only (`fencewoven01/02`, `argonianfence*`, `wovenfence01`); no mined pen assembly | kits hold the fence | not placed: no place's record keeps stock |
| hay, well | `haymound01`, `genericwell01` | settlement-imperial-v1, works-v1 | Claywater only: Greenspring draws from its spring, Riverwalk from the river |

**Dressing counts against the collider ceiling.** A mesh or convex piece
collides as one part per LOD0 primitive (`export_settlement_bundle.lod0_part_counts`):
the notice board is 8 parts, the beehive 7, a burial cairn 4, a chicken nest
2. Greenspring's walk-9 dressing took it to 326 parts x 1.55 = 505, over its
ceiling of 500, and the bundle export refused it; a second cairn and a
second nest came out (320 parts). Before adding dressing to a large place,
read its parts in the last bundle export's warning line.

A bird perch exists nowhere (register row G14: the vault listing and a
Nexus search found no static), so it is not a lack.

Road dressing between places is the type-10 slice's job: see
`docs/research/placement-settlements/road-dressing.md`.
