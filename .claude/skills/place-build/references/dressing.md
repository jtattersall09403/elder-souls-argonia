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
place's pool has a published sign family.

| Pool (place id region) | Bracket post | Boards in a kit | Not yet in a kit (vault) |
|---|---|---|---|
| `imperial-fringe` (settlement-imperial-v1) | `vanilla:clutter/signage/whiterun/signwrpost01` | `signwrstables01` (stable, mined on the post), `signwrgeneralgoods` (trader, lodging; on the wall by `mount --like` its `wrhousestores01` pair, R97), `signwrdrunkenhuntsman01` (a named inn: not used) | `signwrblacksmith01`, `signwralchemyshop01` |
| Argonian pools (`hist-heartland`, Murkmire, `dunmer-north` Argonian places) | the shell's wall | KotM `argonia/blackwood/sign` (wordless sun board), settlement-mud-v1 | hung with `mount <board> <shell> --like plugin-static:architecture/riften/rtblacksmith01city.nif --twin vanilla:clutter/signage/riften/signrtblacksmith01 --hook-only` (R99; the twin's hook band matches within 1 cm) |
| Junction signpost (any pool on a road) | `vanilla:clutter/signage/roadsigns/roadsignpost` (works-v1) | `bmv:roadsign{small,medium,large}01{l,r}` | the vanilla named arms (Skyrim town names; never used) |
| Dock | `vanilla:architecture/docks/dockcolstrsign01`, `dockcolstrsignrope01` (docks-v1) | as listed | |

The rule passes and lists a pool with no family in its row, so the gap
stays visible without blocking the place.

## 4. What our places still lack (walk-8 review)

Each row is a 16k checklist row ("Yard dressing breadth, walk 8").

| Lack | Supplies it | In a kit |
|---|---|---|
| hand cart, vendor cart | `vanilla:clutter/carts/handcart01/02`, `vendorcartstatic01` | works-v1 |
| rain barrel | `vanilla:clutter/largerainbarrel01` | works-v1 |
| hide rack, herb drying rack | `vanilla:clutter/common/tanningrack01`, `wrherbdryingrack01` | works-v1 |
| notice board | `bmv:advertising_board` | works-v1 |
| awning | htbm `orcawninghalf01` | settlement-stilt-v1 |
| chicken nest | `vanilla:plants/chickennest01` | settlement-imperial-v1 |
| Argonian shrine at a shrine parcel | mudmother `sithisshrine` | settlement-mud-v1 (Riverwalk's shrine parcel places no shrine piece) |
| washing or bunting line | `kotm:argonia/clutter/buntingline01` | interior-kotm-v1 (untested outdoors) |
| animal pen | fences only (`fencewoven01/02`, `argonianfence*`, `wovenfence01`) | kits hold the fence; no mined pen assembly |
| graves | `clutter/tombstones/tombstone01-03`, `burialcairn01-03` | vault only |
| market stall | `riften/rtmarketstall01`, `solitude/smarketstall01-03` | vault only |
| chopping block, beehive, outdoor table | `clutter/chopping block/choppingblock01`, `beehive01`, `exteriorwoodentable01` | vault only |
| bird perch | none | sourcing gap |
| fish rack at Greenspring and Riverwalk; hay and a well at the Argonian places | as Claywater uses | in kits |

Road dressing between places is the type-10 slice's job: see
`docs/research/placement-settlements/road-dressing.md`.
