# The Licensed Stage — meso design record

`place.hist-heartland.sap-tapping-licensed` · Phase 11 Part 7 · exemplar
of the **smallest** place type (a works camp, M1) and of the **tropical
jungle** vegetation class. Dossier:
`world/sources/sites/dossiers/licensed-stage.json`. Blueprint:
`place.hist-heartland.sap-tapping-licensed.json` (v2 schema: `why` blocks,
approaches, scale grounding, routed ways). Map:
`tooling/world-generation/output/blueprint-maps/place.hist-heartland.sap-tapping-licensed.png`.

## The neighbourhood

The plotted point (3550.6, 4301.8 m) sits 42.4 m up on rock/upland firm ground
in tropical jungle at danger band 4, 717 m from the Helstrom–Blackrose road
and 7.9 m above the local water table, with the nearest shore 64 m
off and the nearest channel 192 m to the south-west. Canopy closure is 1.00;
the compiled scatter runs 462 plants/ha over 25 species; the tallest of them,
the Anvil canopy composite, stands 42.4 m. The median open-space radius is 6.7
m, so nothing at ground level is visible from the land side until roughly
thirty metres.

The record's own cue is decisive: the licence is **hung to be readable
from the water**. The plotted point has no water a boat can use, so the siting
moved to the channel system to its north-west, inside the 250 m envelope.

## Candidates

| | position (m) | slope | above water table | flood | shore | channel depth | canopy | road |
|---|---|---|---|---|---|---|---|---|
| **A — north bank (chosen)** | 3490.6, 4391.8 | 1.12° | 3.09 m | band 0 | 16.3 m | **0.90 m** at 16 m, bearing 330 | 0.92 | 615 m |
| C — east shelf | 3580.6, 4361.8 | 2.75° | 3.98 m | band 0 | 10.3 m | 0.40 m at 10 m | 0.99 | 712 m |
| D — west flat | 3460.6, 4376.8 | 0.90° | 0.32 m | band 0 | 10.3 m | 0.40 m at 14 m | 0.77 | 601 m |

**A won.** Its water carries a loaded canoe: 0.9 m at the bank and 1.4 m
at the landing point, against 0.4 m — a wading margin — at both rivals.
A licence read from the water needs a boat beneath it. A is 3.1 m above
the water table in flood band 0, so the season's graded stock never stands
in wet-season water; its height delta is 3.9 m across a 20 m box but 1.6 m
across the eighteen metres that the pieces occupy; the compiler measures every
parcel on its own outline. Canopy closure 0.92 keeps the camp hidden
from the land side. The terrace is bounded by channel to the north-west, reed
margin to the west and unbroken jungle east and north, which leaves a single
walkable approach, the track from the south-east, as the catalogue's cue
requires.

C was rejected on water depth alone, despite being the most concealed
and the closest to the plot (67 m). D was rejected because 0.32 m above
the water table puts the stock in the wet season's way; also because at canopy
0.77 on an open bank the camp is legible from both directions rather
than from one track.

## Scale

Type recipe `sap-tapping-camp`: population 2–5, an elevated member
on the stage, a mule line. A licence is one stage on one tree for one season
(`hist-placement.md` §75); one stage needs a tapper on the deck and two hands
on the ground. The blueprint's `scaleGrounding` is therefore three people, one
household, three NPCs and **six pieces**: stage, stair, mule line, cart, tent
and licence board. Nothing here is permanent enough to be called a building;
the count is what a season leaves standing.

## The design

**The Hist is the site.** `htbm:…/trees/histtree` stands at (3496.6, 4390.0):
measured bounds 64.0 × 45.3 m across the crown, 53.6 m tall, 17 073 triangles
— the largest Hist mesh in the vault, 11 m taller than the tallest canopy tree
in the compiled scatter. `histroots03` (9.56 × 2.54 m, 4.71 m high),
from the same author's set, lays the root flare between the trunk
and the stage.

**Two districts, two kit sets.** `district.sap-tapping-licensed.stage`
(`neutral-works`) holds the stage, its stair, the mule line, the cart
and the licence board; `district.sap-tapping-licensed.camp` (`argonian-mud`)
holds the tent. The works district was widened to the water's edge so
the board, a works-v1 piece, sits in its own set.

**The stage** is one piece, `stockadescaffoldbase3sided01` (measured hull 3.70
× 3.84 m, 9.0 m², deck at 2.73 m), on the trunk's channel face at (3489.8,
4383.0), 9.8 m off the trunk centre and 9 m from the water, with its unrailed
face to the trunk where the tap lines run. `stockadescaffoldstairs01` (3.58 ×
3.46 m, 11.6 m², 3.45 m rise) climbs to it from the landward side, at the head
of the track. Both stand on posts (`groundFit: stilt`): measured ground delta
is 2.27 m under the footing and 2.08 m under the stair; the ladder forbids
grading 2 m or more. The matching `stockadescaffoldtop3sided01` tier is
**not placed**: the compiler sets every parcel on the ground
and the integration pass fails two parcels that share a footprint, so
a stacked piece cannot yet be expressed. That is a tooling gap (a `stacksOn`
field), recorded below, not a design choice.

**The rest is four objects.** `horsetrough01` (1.85 × 0.69 m) makes the mule
line at (3492.0, 4390.0), beside the track; `handcart01` (1.32 × 2.21 m) is
the season's graded stock at (3488.0, 4390.5), shafts to the track; one
dwelling, `argoniantent01` (8.20 × 7.00 m ground, 43 m² plan, 5.95 m high)
at (3504.0, 4394.0), behind the trunk on the flattest pad in the camp,
on a plinth over a 1.5 m fall; and the licence board.

**The licence board** fills the gap that the Part 6 record carried.
`bmv:advertising_board` (works-v1; 1.57 × 1.39 m plan, 2.47 m high, ground
contact 1.26 × 0.40 m — two posts and a sill) stands at (3484.2, 4375.0)
on the last dry ground before the reeds, 2.3 m clear of the plank walk, yaw
318, so the pane runs parallel to the bank and its face looks straight
down the poling line. The posted papers are part of the authored mesh, so no
paper piece is jammed onto it. Ground delta under the posts is 0.44 m; they
are driven, so the parcel is `stilt`. The MR04 evidence socket moved
from the stage rail to this parcel.

**The tent's interior.** The kit index measures `argoniantent01` as a *shell*
(79 % of its ring is wall, roof overhead, 3.76 m headroom, 43 m² — size class
medium) with an open front wider than 5 m rather than a doorway. The blueprint
therefore carries one door on the open end, `facingDeg` 225, naming
`settlement-mud-v1` as the interior kit: the interior is the shell's own
volume dressed from the mud kit, not a separate cell. Whether Phase 12 accepts
a walk-in shell as an "interior" is an owner question below.

**The water.** The landing (`dock.sap-tapping-licensed.landing`) is piled
in 1.4 m of water at (3478.5, 4373.0), past the reed margin. The channel way
runs to it from the north-west over published water. The reed margin is kept,
not cleared.

**Clearance is minimal.** Hard clearing covers four boxes — the stage and its
stair, the tent, the mule line with the cart and the board —
against the outlines the pieces occupy. A single thinned polygon of 648 m²
covers the rest of the camp; everything outside it stays at the region's
density. The Hist, the reed margin and two shade trees are listed as kept.

**MR04** ("Sap for Sale") anchors on four sockets: `socket.…licence`
(evidence, on the board), `socket.…tapper` (npc), `socket.…graded-stock`
(container, the cart) and `socket.…night-landing` (scene, at the water's edge
beside the plank walk, where a landing can be watched from the reeds). One
combat space, `combat.…stage-foot` (tight), carries its why: blown cover
during the night landing brings the woken crew down the stair to this ground,
and the licence-revoked flip makes the same crew hostile by day.

**One variant**, `variant.…licence-revoked`, matches the catalogue's hostility
flip on `flag.hist-heartland.sap-licence-revoked`: the stage and the stock
change, the landing goes unwatched.

## Ways

Every way is authored as waypoints, a width, an end and a reason; `points` is
derived by `worldgen.street_router --apply`.

| Way | kind · width | routing | ends at | why |
|---|---|---|---|---|
| `route.…track` | track · 1.2 m | terrain | the stair | the one worn track from the road, 615 m to the south-east; past the tent's open end, past the mule line, dead at the foot of the stair |
| `route.…tent-spur` | footpath · 0.8 m | terrain | the tent | three strides from the track to the open end, so the door is on a way |
| `boardwalk.…landing-walk` | boardwalk · 1.6 m | straight | the landing | 12 m of planks from a stride off the stage foot across the reeds to the dock; straight because planks over soft ground take the shortest line |
| `canal.…channel` | channel · 6 m | terrain | the landing | the poling line up the 0.9 m water from the north-west — the covert extraction route |

The track's routed line (3503, 4412) → (3503, 4406) → (3499, 4402) → (3496,
4402) → (3494, 4400) → (3494, 4386) bends twice in its last 27 m. Nothing
stands on the plank walk; the walk starts a stride off the footing
and attaches to the dock alone.

## Orientation and footprints

Every parcel is authored as a centre, an exact asset, a bearing and a reason;
the polygon on the map is derived from the measured hull
by `worldgen.blueprint_footprints --apply`. Bearings are degrees clockwise
from north.

| Object | Asset | Hull (m) | Yaw | Why that way |
|---|---|---|---|---|
| stage | `stockadescaffoldbase3sided01` | 3.70 × 3.84 | 316 | the unrailed face looks along bearing 136 to the trunk, where the tap lines run |
| stair | `stockadescaffoldstairs01` | 3.58 × 3.46 | 30 | the flight sits on bearing 300 to the stage, so the climb starts landward at the head of the track |
| mule line | `horsetrough01` | 1.85 × 0.69 | 253 | the long axis lies on bearing 343, along the track, so the mules stand beside the path |
| stock | `handcart01` | 1.32 × 2.21 | 29 | the shafts point to the head of the track, so the cart is pulled out without turning |
| dwelling | `argoniantent01` | 8.20 × 7.00 | 135 | the open end looks down the track on bearing 225; the blind back stands to the channel |
| licence board | `bmv:advertising_board` | 1.26 × 0.40 (posts) | 318 | the pane stands parallel to the bank, face down the poling line |
| Hist | `histtree` | 64.0 × 45.3 | 121 | the crown's long axis lies across the channel, so the deepest shade falls over the stage and the landing |
| root flare | `histroots03` | 9.56 × 2.54 | 46 | laid on the trunk-to-stage line, the line that a flare out of the root plate would follow |
| landing | dock | – | 138 | a poled canoe comes alongside with the channel's run and unloads toward the plank walk |

Three orientation facts rest on a mesh's local frame rather than on a measured
number: which face of the three-sided scaffold carries no rail, which end
of the tent is the open one, which face of the board carries the papers. All
three are read from the pieces in the studio at Round B; if any is out,
the fix is the yaw, not the layout.

## Approach and wayfinding

### `approach.sap-tapping-licensed.track-from-road` (walk)

From the Helstrom–Blackrose road, 615 m out, the Hist's crown (53.6 m) shows
over the jungle canopy (42.4 m at its tallest; that species is 3.4 %
of the scatter): the first-seen object is the tree. The track goes
under closed canopy (closure 0.92) and the crown is lost overhead
for the whole walk. At about 30 m — the median open-space radius here is 6.7 m
— the pale trunk reads between the other trunks. At the first bend the tent's
open end and the mule line appear; at the second bend, 10 m further, the stair
and the stage come into frame, with the water beyond them through the reeds.
The threshold is the point where the track dies against the lowest tread:
the stair is the visible means of ascent; it is in frame from the last bend.
The first node inside is the stage foot, where the plank walk leaves
for the landing.

### `approach.sap-tapping-licensed.channel-by-canoe` (boat)

The crown stands over the channel from a bend away. The reed margin hides
the bank until 20 m. The roof of the licence board (2.47 m, a hand above
the bank) shows over the reeds next; then the plank walk and the landing open
up; last, the stage rail and the tap lines on the trunk. The board is read
at the landing, not from the far reach, because the channel bends before it.
The threshold is the dock; the first node is the board; the plank walk leads
from it to the stage foot.

### Checklist (research doc §5)

| # | Check | Answer |
|---|---|---|
| 1 | Every approach designed, with a route or direction | yes — walk from `route.…track`; boat from the north-west up the channel |
| 2 | One first-seen object per approach, a real id | yes — `landmark.…hist` on both |
| 3 | Taller than the vegetation and terrain between viewer and object, measured | yes — 53.6 m against a 42.4 m canopy; the camp itself is not the beacon and is hidden until 30 m |
| 4 | Three to five beats with an occlusion | yes — five beats each; the crown is lost under canopy, the bank is lost behind reeds |
| 5 | Last stretch bends twice | yes — two bends in the last 27 m of the track; the channel bends once before the landing |
| 6 | Centre visible from arrival, or a landmark at the bend | yes — the stair and stage from the second bend; the board from the landing |
| 7 | Threshold spanned, not passed | no, by design — a camp has no gate; the threshold is the track dying at the stair and the dock at the water. Recorded, not fixed |
| 8 | One spine, wider than the rest, no duplicated movement | yes — the track (1.2 m) is the spine; the spur is 0.8 m; the plank walk serves the water alone |
| 9 | Landmark hierarchy, no rival to the beacon | yes — the Hist; the board is the mid-place marker at the landing; nothing else is taller than 6 m |
| 10 | Every socket/service/NPC door presents to a way | yes — the tent door on the spur; the board at the plank walk; the cart and stage at the track head |
| 11 | No way ends at a blank wall | yes — track at the stair, spur at the door, walk at the dock, channel at the dock |
| 12 | Every raised level has visible ascent | yes — the stair is in frame from the last bend |
| 13 | Edge reads as an edge | yes — water and reeds north-west, closed jungle on the other three sides, the thinned ring between them |
| 14 | Building count matches population | yes — six pieces, three people, one household; source is the recipe |
| 15 | Approach cue in one clause | yes — "follow the one track to the great tree"; "pole up the channel to the board at the water's edge" |
| 16 | Any forced detour pays | yes — the plank walk over the reeds ends at the board and the canoe |

## Lore

- `world/sources/lore/topics/hist-and-sap.md` — a Hist's sap is its soul; sap
  is a controlled substance whose legitimate, criminal and atrocious uses are
  all recorded in the sources; smuggling it is the province's most
  lore-appropriate crime (Lore:Hist Sap).
- `world/sources/lore/topics/hist-placement.md` §75 — a tribal Hist has
  a **tree-minder**; tapping is licensed against the tree,
  not against the crew. Enslaved and tapped trees (Haj Uxith, the Blackwood
  Company's Leyawiin tree) are the counter-example against which this place is
  defined, which is why it is kept correct.
- Type recipe `world/sources/catalogue/type-recipes.json#sap-tapping-camp` —
  population 2–5, elevated member on the stage, a mule line, a covert
  extraction route and a track worn from one direction only.

## Rules this camp sets for the type

- A camp's beacon is its tree, never its structures; the structures are hidden
  until the open-space radius allows.
- One worn track, ending at the one means of ascent; a spur to the tent door
  rather than a track routed past it.
- The water side is the "front": the licence board, the landing and the stage
  rail face the channel; the sleeping place faces the land.
- Kit set follows the piece: a works prop at the water's edge belongs
  to the works district; the district boundary follows it.

## Open questions for the owner

1. **A stacked scaffold tier.** The works kit's own rule stacks `top3sided01`
   on `base3sided01`, but the compiler places every parcel on the ground
   and the integration pass forbids two parcels on one footprint. The stage
   ships as the footing alone (a deck at 2.73 m with three railed sides).
   Adding a `stacksOn: <parcel id>` field (skip the overlap check; base
   the piece on the parent's deck height) would let this and every other
   stacked kit combination be authored. Is that worth a tooling round
   before Round B?
2. **A walk-in tent as an interior.** The tent is a shell with an open front;
   the door names `settlement-mud-v1` as its interior kit, meaning the shell's
   own volume dressed, no separate cell. If Phase 12 wants every door to lead
   to a cell, the tent should drop its door and be `interior: none` instead.
3. **How big should the tree be?** 53.6 m against a 42.4 m canopy makes
   the camp findable from the road, which undercuts "unseen until thirty
   metres". The alternative in the vault is 22 m tall, hidden in the canopy,
   reading as a large tree rather than a Hist. Beacon or discovery?
4. **Tent or hut?** The tent reads as seasonal, which matches a one-season
   licence; the same kit's round mud hut (5.93 × 6.47 m) reads as a crew that
   comes back every year.
5. **How much jungle should come down?** The draft clears the pieces' own
   ground plus a 648 m² thinned ring. The Round C walk gives a frame-rate
   number against it.

## Catalogue record should change (not edited from here)

- `sitingPrefs.nearPoint` is (4269, 4176) with `maxM: 400`, but this siting is
  807 m from it. The preference is stale and should move to the channel system
  under the place, or be dropped.
- `assetPlan` lists `passerelles-walkway` and `settlement-root`. Neither
  serves this place: the smallest dwelling in `settlement-root-v1` measures
  24.6 × 24.6 m and 55.6 m tall. The delivered plan is `works-v1` (stage,
  stair, mule line, stock, licence board), `settlement-mud-v1` (tent,
  dressing) and the HTBM Hist as the landmark.
- `vibe.signatureFeature` says the licence is nailed to the stage; it now
  hangs on a roofed board at the landing, still readable from the water.
- `sockets` is empty while `questHooks.provisions` names
  `quest.provision.mr04-anchor`. The four sockets above should be written back
  once the quest agents have finished with the file.

