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
its own plugin never places ("evidence": "unplaced") is licensed nowhere.
Walk 8's table named five pieces that fail this (the Sithis shrine, the
small fish rack, the herb rack, the rain butt and the clutter hide rack);
walk 9 found it only at `place_gates`, after placing and rendering them.

| Item | Piece | Kit | Placed (walk 9) |
|---|---|---|---|
| hand cart, vendor cart | `vanilla:clutter/carts/handcart01/02`, `vendorcartstatic01` | works-v1 | Claywater (`isy-cart`, walk 3) |
| rain butt | none outdoors: `vanilla:clutter/largerainbarrel01` is a 5.5 m barrel on a timber trestle that Skyrim.esm places only indoors (LiarsRetreat01, DruadachRedoubt01), so R1 refuses it outside | works-v1 | not placed: no exterior-licensed rain butt in the vault |
| hide rack | `vanilla:furniture/tanningrackmarker` (the furniture Skyrim places outdoors). Never `clutter/common/tanningrack01`: same rack, but no plugin places it, so R1 licenses it nowhere | works-v1 | Claywater stable yard |
| herb drying rack | none outdoors: `wrherbdryingrack01` (8 refs) and KotM `hangingfoodrack01` are hung indoors; `wrintcastleherbrack01` is a castle interior | - | not placed |
| notice board | `bmv:advertising_board` (roofed) is a modder's resource BM&V's plugin never places: R1 licenses it nowhere | works-v1 | not placed: planner ruling asked (resource-only pieces under R1) |
| chopping block | `vanilla:clutter/chopping block/choppingblock01` | works-v1 | Claywater woodpile |
| outdoor table | `vanilla:clutter/exteriorwoodenfurniture/exteriorwoodentable01` (a log trestle with rope; the only exterior-licensed table) with `farmbench01` | works-v1, settlement-imperial-v1 | Claywater, beside the well |
| beehive | `kotm:argonia/clutter/beehive` (two hives on a bench; placed outdoors at RootWhisperVillage). Never vanilla `beehive01`: the burnable Goldenglow hive carries its burning state in its NIF, so the fire layer mines a fire onto it | works-v1 | Greenspring east hut |
| chicken nest | `vanilla:plants/chickennest01` (collider convex, walk 9) | settlement-imperial-v1 | Greenspring east hut (two) |
| graves | `vanilla:clutter/burialcairn/burialcairn02` (a low cairn; licensed keep and town, so a village may take it). Never `burialcairn01`/`03` in a village: licensed keep, ruin and wild only (R9). Burial runs through the Hist (`argonia-4e201-state.md:165-167`) | works-v1 | Greenspring, north-west of the Hist (two) |
| Argonian shrine | none outdoors: mudmother `sithisshrine` is placed only inside 00MudHut01 (R1); `argoniantotem01` (exterior) is the shrine piece | - | not added: Riverwalk's shrine parcel and Greenspring's Hist shrine already carry totems |
| market stall | `vanilla:architecture/riften/rtmarketstall01` (counter and canopy; exterior town) | works-v1 | Riverwalk crews path (the record's trader) |
| fish rack | `vanilla:clutter/deadanimals/fishrack01`, `fishrack02` (exterior). Never mudmother `fishracksmall` outdoors: placed only inside 00MudHut01 | works-v1 | Claywater (walk 3), Greenspring family hut, Riverwalk islet |
| awning | none: htbm `orcawninghalf01` (8.2 x 5.0 x 5.8 m) and `orcawning01` (5.3 x 4.9 x 5.8 m) are pavilions on log posts, not awnings; the market stall carries its own canopy | - | not placed |
| washing or bunting line | KotM `buntingline01` (interior-kotm-v1: a 6.9 m line strung between two eaves, no mined pair; one-end `mount --hang` only) and htbm `farmhouseline` (a line on two posts, unplaced by its plugin, R1) | - | not placed: backlog row (two-end hang); R1 ruling asked for `farmhouseline` |
| animal pen | fences only (`fencewoven01/02`, `argonianfence*`, `wovenfence01`); no mined pen assembly | kits hold the fence | not placed: no place's record keeps stock |
| hay, well | `haymound01`, `genericwell01` | settlement-imperial-v1, works-v1 | Claywater only: Greenspring draws from its spring, Riverwalk from the river |
| bird perch | none (G14: vault and Nexus searched, NO SOURCE FOUND) | - | - |

Road dressing between places is the type-10 slice's job: see
`docs/research/placement-settlements/road-dressing.md`.
