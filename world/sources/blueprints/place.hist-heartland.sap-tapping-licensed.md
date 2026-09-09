# The Licensed Stage — meso design record

`place.hist-heartland.sap-tapping-licensed` · Phase 11 Part 7 · exemplar
of the **smallest** place type (a works camp, M1) and of the **tropical
jungle** vegetation class. Dossiers:
`world/sources/sites/dossiers/licensed-stage-reach118.json` (the camp) and
`world/sources/sites/dossiers/licensed-stage-layby.json` (the landing). Blueprint:
`place.hist-heartland.sap-tapping-licensed.json` (v2 schema: `why` blocks,
approaches, scale grounding, routed ways). Map:
`tooling/world-generation/output/blueprint-maps/place.hist-heartland.sap-tapping-licensed.png`.

## The neighbourhood

The plotted point (3550.6, 4301.8 m) sits 42.4 m up on rock/upland firm ground
in tropical jungle at danger band 4, 717 m from the Helstrom–Blackrose road
and 7.9 m above the local water table, with the nearest shore 64 m
off and the nearest channel 192 m to the south-west. Canopy closure is 1.00.

The record's own cue is decisive. The sap leaves by canoe. The plotted point
has no water a boat can use, so the siting moved to the channel system to its
north-west.

## The re-siting of 2026-09-09

The camp was sited on the north bank at (3490.6, 4391.8 m) against the macro
hydrology raster, which reported a 0.9 m channel 16 m to the north-north-west.
Measured against the compiled water that ships, that channel is not there. The
berth stood on dry terrace at 30.52 m. The nearest water carrying a canoe's
0.6 m was 104.4 m away. The ground between rose up to 1.48 m **above** the
local water for 92 continuous metres, so no dredge could reach it. The berth
therefore published no connector at all and
`test_minor_waterways::test_no_berth_is_refused_in_the_published_network`
stayed red. Two claims in the record were false of the terrain under it: the
16 m to a 0.9 m channel and the landing "piled to the bed at the lip of the
channel".

The owner's call (2026-09-09) was to move the place to its water. The whole
camp moved 117.7 m to the head of **reach 118**; the anchor is now
**(3435.6, 4480.6 m)**.

The layout was not translated. The anchor was chosen from the ground. The old
arrangement then carried across without rotation because the new bank runs the
same way as the old one.

## The landing moves again, 2026-09-09

The first pass put the landing at (3423.5, 4461.8 m), in the water at the foot
of the camp. It stood in 0.60 m, which passed the berth gate. That gate was the wrong
question. The water there is a **closed pocket of 882 m²**, bounded
x 3327 to 3433 and z 4453 to 4507, its surface running 22.35 to 29.22 m,
touching nothing else. Reach 118 above it falls **6.3 % on average** — 29.2 m
over 463 m — so the pocket has no outlet a hull can take. A canoe tied at that
berth could pole 60 m and stop.

The landing therefore moved on its own, 357 m on bearing 201, to **(3309.4,
4815.0 m)** at the head of the tide. The camp did not move with it: it was
sited by the playbook against its own dossier and its parcels stand dry on
their bank. What moved is the landing, the plank walk, the poling line, the
water terminal and the night-landing scene. The licence board moved too, but
inland rather than down — see below.

The recipe asked for this. `type-recipes.json` → `sap-tapping-camp` →
`slots.satellite` reads "a smuggler's lay-by or channel mouth 200-400 m off".
357 m is inside that band. The waterRelation cue ("a covert extraction
route") is a preference; the culture zone is the record's one hard constraint,
which the camp keeps.

**The rule this sets.** A berth is chosen on the water onto which it opens,
rather than on the depth under the piles. Depth at the berth is necessary but
not sufficient. The test is the water a hull can reach from it.

## Candidates

Dossier `licensed-stage-reach118`. Distances are to the compiled water that
ships, at the depth the berth's hull class needs (0.6 m for a canoe).

| | anchor (m) | berth (m) | berth ground | water at the berth | dredge | why it won or lost |
|---|---|---|---|---|---|---|
| **E — reach 118 head (chosen)** | 3435.6, 4480.6 | 3309.4, 4815.0 | bed 0.80 m below the surface, under water | **0.84 m** as it ships (0.60 m before the dredge) | see the berth table below | the bank that the camp needs, above the water within the recipe's satellite band that a canoe can leave |
| A — north bank (the old siting) | 3490.6, 4391.8 | 3478.5, 4373.0 | dry terrace at 30.52 m | none within 104.4 m | **blocked** — 39 of 51 approach points up to 1.48 m above the water | the channel it was sited on does not exist in the compiled water |
| F — south shelf | 3434.0, 4492.0 | 3421.9, 4473.2 | 0.25 m above the surface, 11.0° bank | none within 8.0 m | n/a — the berth is dry | 8 m of mud is beyond the 3.6 × 1.83 m dock piece, so a berth here would end short of the water, which is the dead pocket in any case; the camp would also stand 7.8 m above its water table |
| G — lower bank | 3430.0, 4480.0 | 3417.9, 4461.2 | 0.39 m above the surface, 7.5° bank | none within 4.5 m | n/a — the berth is dry | two metres of gain buys nothing. The water below it is the same dead pocket. The bank measures 7.5°, too steep for piles to stand level |

**E won** on the bank, which is what an anchor selects. Its terrace runs 30.7 to
31.4 m and carries every parcel dry — stage 30.67 m, stair 31.38 m, cart
31.20 m, mule line 31.27 m, hut 32.65 m, licence board 30.81 m. Flood band 0;
0 % of the disc floods anew in the wet season. The road is 526 m to the
south-west.

### The berth, chosen separately

Distances are from the camp anchor. The recipe's satellite slot allows 200 to
400 m.

| berth (m) | from the camp | water at the berth | what a canoe can reach from it | verdict |
|---|---|---|---|---|
| **3309.4, 4815.0 (chosen)** | 357 m, bearing 201 | 0.60 m before the dredge, **0.84 m** as it ships, on a bed 0.80 m below a surface at 0.05 m; class river, flow 1.07 m/s | the head of the tide. As it ships, one body of **9221 m²** of tidal water runs z 4807 to 5165, 358 m, 0.12 to 2.04 m deep, ending **11.0 m** from the province's 19.3 km² main water across a cell that stands at the waterline. Before the dredge the same water was two pools of 5145 and 4383 m² | chosen |
| 3423.5, 4461.8 (the first pass) | 22 m | 0.60 m | an **882 m²** pocket, x 3327 to 3433, z 4453 to 4507, connected to nothing, on a reach falling 6.3 % | rejected: the depth has no destination |
| 3319.3, 4850.2 | 388 m | 0.72 m | the same tidal pool | rejected: no dry ground. Every cell from x 3300 to 3345 across that line stands under water, so the plank walk would have nowhere to start and the carry path would end in the shallows |
| 3308.8, 5009.0 | 543 m | 0.36 m | the lower pool, 11 m from the province's main water | rejected: 143 m outside the recipe's satellite band. It is the better water and the worse walk |

Before the dredge the two tidal pools and the main body were separated by
sills of **0.053 m** against a surface of 0.05 m. Three millimetres of mudflat
is not a bar, and the dredge has cut through both of them along the serving
line. What remains is 11.0 m of flat at the far end, which the tide covers and
a poled hull is dragged over at low water. That is what a tidal creek is. The
serving waterway re-solved from 849 m to **382 m** when the berth moved. It now
runs down existing water rather than a cut line, so the compiler classes it
`river`.

What the move costs: concealment falls from 0.93 to **0.74**. The camp's dot is
in view from 26 % of the 693 route points within 2 km, against 7 % on the old
terrace. Canopy closure is still 1.00 and the road is still half a kilometre
off, so the camp is not overlooked. It is less blind from the land than it was.
The record carries the new figure in place of the old one.

## Scale

Type recipe `sap-tapping-camp`: population 2–5, an elevated member
on the stage, a mule line. A licence is one stage on one tree for one season
(`hist-placement.md` §75); one stage needs a tapper on the deck and two hands
on the ground. The blueprint's `scaleGrounding` is therefore three people, one
household and **three built things**: the stage, its stair and the hut. The
mule line, the cart and the licence board are dressing. The stage's deck
is part of the stage rather than a fourth thing (97 C5b), so seven parcels
carry a `buildingsPlanned` of three. Nothing here is permanent enough to be called a building;
the count is what a season leaves standing.

## The design

**The Hist is the site.** `htbm:…/trees/histtree` stands at (3441.6, 4478.8):
measured bounds 64.0 × 45.3 m across the crown, 53.6 m tall, 17 073 triangles
— the largest Hist mesh in the vault, 11 m taller than the tallest canopy tree
in the compiled scatter. `histroots03` (9.56 × 2.54 m, 4.71 m high),
from the same author's set, lays the root flare between the trunk
and the stage.

**Two districts, two kit sets.** `district.sap-tapping-licensed.stage`
(`neutral-works`) holds the stage, its stair, the mule line, the cart
and the licence board; `district.sap-tapping-licensed.camp` (`argonian-mud`)
holds the hut. The works district was widened to the water's edge so
the board, a works-v1 piece, sits in its own set.

**The stage** is one piece, `stockadescaffoldbase3sided01` (measured hull 3.70
× 3.84 m, 9.0 m², deck at 2.73 m), on the trunk's channel face at (3434.8,
4471.8), 9.8 m off the trunk centre, with its unrailed
face to the trunk where the tap lines run. `stockadescaffoldstairs01` (3.58 ×
3.46 m, 11.6 m², 3.45 m rise) climbs to it from the landward side, at the head
of the track. Both stand on posts (`groundFit: stilt`): measured ground delta
is 1.26 m under the footing and 0.89 m under the stair; the ladder forbids
grading 2 m or more. The matching `stockadescaffoldtop3sided01` tier is placed as
`parcel.sap-tapping-licensed.stage-deck` with `stacksOn` the footing (the
field added at Round A), so the stage is footing and railed deck as the kit's
grammar stacks them; the deck declares `abuts` the stair, whose top tread
meets its rail line. The stair was moved 0.6 m landward so the two ground
hulls stop overlapping, then 1.08 m further on 2026-09-08 so that its west
face lands on the stage's south face: `abuts` is now checked as a snap
(97 C14/E3), so the flight is built into the stage. Its bearing went from 30° to 46°
with it.

**The rest is four objects.** `horsetrough01` (1.85 × 0.69 m) makes the mule
line at (3432.5, 4491.6), beside the track; `handcart01` (1.32 × 2.21 m) is
the season's graded stock at (3434.5, 4482.3), shafts to the track; one
dwelling, `mudhut01` (5.92 × 6.47 m ground, 5.09 m high; the owner chose the
permanent hut over canvas, 2026-09-07) at (3447.9, 4480.5), behind the trunk on
the flattest pad in the camp at 32.65 m, on a plinth over a 0.71 m fall; and the licence board.

**The licence board** fills the gap that the Part 6 record carried.
`bmv:advertising_board` (works-v1; 1.57 × 1.39 m plan, 2.47 m high, ground
contact 1.26 × 0.40 m — two posts and a sill) stands at (3424.0, 4483.0) on the
terrace at 30.81 m, six paces along the carry path from the stage foot, yaw 199,
so the pane stands across the path and its face looks down the line to the
water. The posted papers are part of the authored mesh, so no paper piece is
jammed onto it. The posts are driven, so the parcel is `stilt`. The MR04
evidence socket moved from the stage rail to this parcel.

**Why the board is at the tree and not at the landing.** The licence runs
against the Hist, not against the crew and not against the berth
(`hist-placement.md` §75). With the water 370 m away and the stage invisible
from it, a board on the bank down there would license nothing an inspector
could see; he lands, climbs and reads it where the tree is. It is also where
the crew read it: every load out passes it. The lay-by is left unmarked, which
is the second reason — an unsignposted landing out of sight and earshot of the
camp is the ground MR04's night landing needs. It is also what the recipe means
by a smuggler's lay-by. The engineering agrees: a works-district
parcel 370 m from the rest would drag that district's derived hull across the
whole corridor.

**The hut's interior.** `mudhut01` has one measured doorway and ships with
its own interior, `mudhut01intnew`; the door sits on that doorway and opens
into that cell (see Doors and assemblies below).

**The water is elsewhere.** The landing (`dock.sap-tapping-licensed.landing`)
is piled to the bed at (3309.4, 4815.0), 370 m of footpath south-south-west of
the stage, at the head of the tide: 0.84 m of compiled water on a bed 0.80 m
below a surface that runs dead level at 0.05 m. Five metres north of the piles
the surface climbs to 0.96 m and the creek becomes a fall, so the berth is the
head of navigation and cannot be moved further up. The plank walk runs 11.7 m
from the dry bank at 1.35 m out to the piles. The published waterway is 382 m
long and reaches them from the south. The reed margin is kept, not cleared.

**Clearance is minimal.** Hard clearing covers six boxes against the outlines
the pieces occupy: the stage and its stair, the stock, the hut, the mule line
with the cart, the licence board and the head of the plank walk at the lay-by.
The hut's box runs 5 m past its south wall, because the doorway is on that wall
and a threshold on uncleared ground is a door the reeds close. Two thinned
polygons — 648 m² over the camp and 960 m² over the lay-by — cover the rest;
everything outside them stays at the region's density, including the whole
length of the carry path, which is a worn line under untouched canopy. The
Hist, the reed margin and two shade trees are listed as kept.

**MR04** ("Sap for Sale") anchors on four sockets: `socket.…licence`
(evidence, on the board), `socket.…tapper` (npc), `socket.…graded-stock`
(container, the cart) and `socket.…night-landing` (scene, at (3315.0, 4818.0),
the water's edge beside the plank walk, where the reeds carry a watcher). The
scene is now 370 m from the beds, which is why the crew sleep through it. One
combat space, `combat.…stage-foot` (tight), carries its why: a carrier followed
up the carry path brings the woken crew down the stair to this ground.
The licence-revoked flip makes the same crew hostile by day.

**One variant**, `variant.…licence-revoked`, matches the catalogue's hostility
flip on `flag.hist-heartland.sap-licence-revoked`: the stage and the stock
change, the landing goes unwatched.

## Ways

Every way is authored as waypoints, a width, an end and a reason; `points` is
derived by `worldgen.street_router --apply`.

| Way | kind · width | routing | ends at | why |
|---|---|---|---|---|
| `route.…track` | track · 2.5 m | terrain | the stair | the one worn track from the road; past the hut's door, past the mule line, dead at the foot of the stair. 38.1 m inside the camp |
| `route.…tent-spur` | footpath · 1.2 m | terrain | the hut | 7.3 m from the track to the doorway, so the door is on a way (the id keeps the draft's name; ids are stable) |
| `route.…sap-track` | footpath · 1.2 m | terrain | — | 370.1 m from the stage foot down to the bank at the lay-by, past the licence board six paces below the stage foot. It falls 29.5 m, a mean of 8.0 %, with one 10 m pitch at 26.4 % (14.8°). A footpath and not a track because no mule carries a load down a quarter grade: the mules take the road and the canoe takes what a crewman can carry |
| `boardwalk.…landing-walk` | boardwalk · 1.6 m | straight | the landing | 11.7 m of planks from the dry bank at 1.35 m out over the mud to the dock; straight because planks over soft ground take the shortest line |
| `canal.…channel` | channel · 6 m | terrain | the landing | 23.3 m of the poling line coming up the creek from the south to the piles |

The track's routed line runs 38.1 m inside the camp and bends twice in its
last 27 m. Nothing stands on the plank walk; it starts on the bank and attaches
to the dock alone. The carry path is the only way in the blueprint that leaves
the camp's own ground, so the place boundary was cut to an L: the camp block,
a 50 m corridor down the fall, with the lay-by at the bottom.

## Orientation and footprints

Every parcel is authored as a centre, an exact asset, a bearing and a reason;
the polygon on the map is derived from the measured hull
by `worldgen.blueprint_footprints --apply`. Bearings are degrees clockwise
from north.

| Object | Asset | Hull (m) | Yaw | Why that way |
|---|---|---|---|---|
| stage | `stockadescaffoldbase3sided01` | 3.70 × 3.84 | 316 | the unrailed face looks along bearing 136 to the trunk, where the tap lines run |
| stair | `stockadescaffoldstairs01` | 3.58 × 3.46 | 46 | the flight's west face is laid on the stage's south face, so the climb starts landward at the head of the track |
| mule line | `horsetrough01` | 1.85 × 0.69 | 270 | the long axis lies north to south, along the track's last stretch, so the mules stand beside the path |
| stock | `handcart01` | 1.32 × 2.21 | 35 | the shafts point to the head of the track, so the cart is pulled out without turning |
| dwelling | `mudhut01` | 5.92 × 6.47 | 113 | the one doorway looks out at 225° down the spur onto the stage path; the blind back stands to the channel |
| licence board | `bmv:advertising_board` | 1.26 × 0.40 (posts) | 199 | the pane stands across the carry path on bearing 109, face down the line to the water, so it is read by whoever climbs from the landing before the stage comes into frame |
| Hist | `histtree` | 64.0 × 45.3 | 121 | the crown's long axis lies across the channel, so the deepest shade falls over the stage and the landing |
| root flare | `histroots03` | 9.56 × 2.54 | 46 | laid on the trunk-to-stage line, the line that a flare out of the root plate would follow |
| landing | dock | – | 65 | the face looks back up the plank walk to the bank, so a canoe poling north up the creek lies alongside the piles and unloads onto the dry side |

Two orientation facts rest on a mesh's local frame rather than on a measured
number: which face of the three-sided scaffold carries no rail, which face of
the board carries the papers. Both are read from the pieces in the studio at Round B; if any is out,
the fix is the yaw, not the layout.

## Approach and wayfinding

### `approach.sap-tapping-licensed.track-from-road` (walk)

The compiled line disagrees with the Part 6 draft about where the road is. `track.hist-heartland.sap-tapping-licensed` reaches the camp from the **west-south-west**, not from the south-east: the heartland network is cheaper to that side by the survey's own cost surface. The road is 526 m off. The line fords the channel's lower reach at about 120 m out, where the water stands 0.28 m below the bank. The blueprint follows the ground, so the worn track now meets the camp at its lower head and bends twice in the last 30 m. The path is flagged `unmapped`, because the stage is found by rumour: it is routed, graded and painted like any other way. The map never draws it.

| terminal | province route | entry off the route | way end | join bearing |
|---|---|---|---|---|
| `terminal.sap-tapping-licensed.track-head` (footpath) | `track.hist-heartland.sap-tapping-licensed` | 0.0 m | 0.0 m | 19.0° |


From the low ground to the south-west, 530 m out, the Hist's crown (53.6 m) shows
over the jungle canopy (42.4 m at its tallest; that species is 3.4 %
of the scatter): the first-seen object is the tree. The track goes
under closed canopy (closure 1.00) and the crown is lost overhead
for the whole walk. At about 30 m — the median open-space radius here is 6.7 m
— the pale trunk reads between the other trunks. At the first bend the hut's
door and the mule line appear; at the second bend, 10 m further, the stair
and the stage come into frame, with the water beyond them through the reeds.
The threshold is the point where the track dies against the lowest tread:
the stair is the visible means of ascent; it is in frame from the last bend.
The first node inside is the stage foot, where the carry path leaves
for the water.

### `approach.sap-tapping-licensed.channel-by-canoe` (boat)

The canoe comes up the creek from the **south**, off 382 m of published
waterway. The Hist's crown stands over the jungle to the north-east from a bend
away, 370 m off and 53.6 m tall against a 42.4 m canopy. The reeds hide the east
bank until 20 m. The piles and the plank walk open up at the head of the creek,
where the water ends. The bank above them is empty: nothing is built at the
lay-by and the licence hangs at the tree, so the track up is not seen until a
boat is alongside. The threshold is the dock, which stands in the water; the
first node is the head of the plank walk on the bank at 1.35 m; from there the
carry path climbs 29.5 m in 370 to the licence board. The stage stands behind
it.

The lay-by is 209 m from the Helstrom–Blackrose road and still hidden: the
dossier measures concealment 0.99 there, in view from 1 % of the 817 route
points within 2 km. The reeds and the fall between do the work.

### Checklist (research doc §5)

| # | Check | Answer |
|---|---|---|
| 1 | Every approach designed, with a route or direction | yes — walk from `route.…track`; boat from the south, up the creek to the lay-by |
| 2 | One first-seen object per approach, a real id | yes — `landmark.…hist` on both |
| 3 | Taller than the vegetation and terrain between viewer and object, measured | yes — 53.6 m against a 42.4 m canopy; the camp itself is not the beacon. From the berth the crown's top stands 84.6 m above sea level at 370 m. The ground between rises to 26.6 m at 300 m, so terrain does not cut the ray. Concealment is 0.74 at the camp and 0.99 at the lay-by |
| 4 | Three to five beats with an occlusion | yes — five beats each; the crown is lost under canopy, the bank is lost behind reeds |
| 5 | Last stretch bends twice | yes — two bends in the last 27 m of the track; the creek bends twice in its last 23 m before the piles |
| 6 | Centre visible from arrival, or a landmark at the bend | yes — the stair and stage from the second bend of the track; from the landing the crown alone |
| 7 | Threshold spanned, not passed | no, by design — a camp has no gate; the threshold is the track dying at the stair and the dock at the water. Recorded, not fixed |
| 8 | One spine, wider than the rest, no duplicated movement | yes — the track (2.5 m) is the spine; the spur and the carry path are 1.2 m; the plank walk serves the water alone |
| 9 | Landmark hierarchy, no rival to the beacon | yes — the Hist; the board is the mid-place marker at the head of the carry path; nothing else is taller than 6 m |
| 10 | Every socket/service/NPC door presents to a way | yes — the hut door on the spur; the board on the carry path; the cart and stage at the track head |
| 11 | No way ends at a blank wall | yes — track at the stair, spur at the door, carry path at the head of the plank walk, walk at the dock, channel at the dock |
| 12 | Every raised level has visible ascent | yes — the stair is in frame from the last bend |
| 13 | Edge reads as an edge | yes — the camp is closed jungle on all four sides with the thinned ring inside it; the lay-by is water and reed on one side and the fall on the other |
| 14 | Building count matches population | yes — three built things and three props, three people, one household; source is the recipe |
| 15 | Approach cue in one clause | yes — "follow the one track to the great tree"; "pole up the creek to the piles, then climb the path" |
| 16 | Any forced detour pays | yes — the 370 m climb from the landing is the camp's one secret: it is why the lay-by is unwatched and why the licence is at the tree |

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
- One worn track, ending at the one means of ascent; a spur to the hut door
  rather than a track routed past it.
- The tree side is the "front": the licence, the stage rail and the stock face
  the tree and the path; the sleeping place stands behind the trunk.
- A works camp and its water can be two places, with the ground deciding. The
  berth is chosen on the water onto which it opens and the anchor on the bank
  on which the camp can stand; a carry path joins them and the place boundary is cut to
  hold both. Nothing is built at the landing that the landing does not need.
- A licence hangs at the thing it licenses. If the water is out of sight of
  that thing, the water gets no board.

## Open questions for the owner

All five are answered (owner 2026-09-07, decision 0041 § Review 2026-09-07
and the Taste ledger); the answers are in the blueprint.

1. **A stacked scaffold tier — resolved.** `stacksOn` exists and the deck
   is placed on the footing (`parcel.sap-tapping-licensed.stage-deck`).
2. **The dwelling's interior — resolved by the hut.** `mudhut01` has a
   measured doorway and its own interior cell, so the walk-in-shell question
   no longer arises.
3. **Tree size — the 54 m hero Hist.** A traveller steers by the tree rather than by the
   camp. It is also the tree that a canoe at the lay-by sees.
4. **Hut, not tent.** A crew that comes back every season keeps a mud hut.
5. **Clearing — accepted** at the draft's figure as the first frame-rate data
   point for a place under closed canopy; the Round C walk measures it.

## Catalogue record should change (not edited from here)

- `sitingPrefs.nearPoint` is (4269, 4176) with `maxM: 400`, but this siting is
  887 m from it (it was already 808 m out before the 2026-09-09 move). The
  preference is stale and should move to the head of reach 118, or be dropped.
- `traversalModes` and `underwaterAccess` were written for a camp with its
  canoe at its foot. The canoe is now 370 m off down a footpath; the boat
  arrival is at the lay-by, not at the camp.
- `assetPlan` lists `passerelles-walkway` and `settlement-root`. Neither
  serves this place: the smallest dwelling in `settlement-root-v1` measures
  24.6 × 24.6 m and 55.6 m tall. The delivered plan is `works-v1` (stage,
  stair, mule line, stock, licence board), `settlement-mud-v1` (hut,
  dressing) and the HTBM Hist as the landmark.
- `vibe.signatureFeature` says the licence is nailed to the stage; it now
  hangs on a roofed board at the head of the carry path, six paces from the
  stage foot.
- `sockets` is empty while `questHooks.provisions` names
  `quest.provision.mr04-anchor`. The four sockets above should be written back
  once the quest agents have finished with the file.

## Deviations from module 97 (Round A review, 2026-09-05)

- **97 C6 no longer applies here.** The band is a settlement band and this is a works camp, so the compiler does not judge it (the old 34.6/ha reading came from an M1 camp held against the M2 band over a boundary that carried the approaches). The pieces stand where the tree, the water and the track put them.
- **97 D3, no threshold spanned.** A camp has no gate; the threshold is the track dying at the stair and the dock at the water (checklist item 7).
- **Four compile errors stand, none of them new here.** The track crosses the stage and stage-deck hulls, the province track meets the camp's spine 36° off its own bearing, while the walk approach's first waypoint is 292 m off that track. All four are present on the pre-move record with only the berth moved (15 errors then, 10 now), so they belong to the camp's own layout and its network stitch, not to this move. They are logged for the next placement pass.
- **97 B6, the canoe approach unmeasured.** It has no route with waypoints, so the compiler cannot run the line of sight; the checklist carries it (the Hist at 53.6 m over a 42.4 m canopy, on a ray the ground does not cut).
- **97 C12, a camp of three with no hearth.** The dressing pass (97 G18) does not exist; when it does, a fire and 4–8 pieces round it belong here.

## Doors and assemblies (stream A2, 2026-09-05)

The tapper's dwelling was `argoniantent01`, a tent shell with no doorway in any
assembly and none measurable off its geometry, so the door on it was invented.
It is now `mudhut01`, the small Argonian mud hut already used at Nine-Trunks:
it has one measured doorway and a matched interior of its own. It is also the
form that a licensed tapper working a three-month season would keep. The door sits on that
doorway. It opens into `mudhut01intnew`, the interior that the pool ships with the
hut. The hut turned from 135 deg to 45 deg in this pass: solved from the doorway
rather than eyeballed, so the hut's one opening looks straight down the
tent spur onto the stage path.
Nothing else in the camp has an inside: the stage, the stair, the mule line, the
stock cart and the licence board are all open pieces.

## Promises (97 E9, promise ledger round 2, 2026-09-06)

The Licensed Stage meets 3 of 3. Its two unmet rows were warnings. Both were
cheap to clear honestly.

`quest.provision.mr04-anchor` (MR04, the night entry into a harvest camp) is now
`socket.sap-tapping-licensed.mr04-anchor-roster`, an evidence socket on the
stage deck, which is where the roster and the cut tally are kept.

The `trade-access` reward is met by a `market` service
on `parcel.sap-tapping-licensed.stage-deck`. The stage sells its graded sap
from that deck, under the licence nailed up beside it. A deck is an open-air counter
rather than a shop, so the parcel claims no door and no interior.

## Player purposes (owner ruling 2026-09-07)

One interior, the crew's hut, at medium tier. It holds a crew who sleep through
the night landing that MR04 stages and one who wakes, a graded stock kept off
the stage where the licence does not count it, then a season's tally that does
not match what has left by canoe.

## The berth and its channel (owner review, 2026-09-08; re-sited 2026-09-09)

The landing is a `canoe` berth and a water terminal: the poling channel is
solved to the piles (`fit: water-to-dock`,
`terminal.sap-tapping-licensed.landing-channel` on
`waterway.hist-heartland.sap-tapping-licensed.landing`), so the extraction
route on which the camp depends is drawn on the province map and not only in this
record. All three sockets (the licence board, the graded stock and the
anchor roster) are answered by a quest purpose naming MR04 on the parcel on
which they stand.

The berth stands at the head of the tide and the dredge reaches it. Run in the
terrain chain against the shipped rasters, `dock_dredge` reports **dredged**:
298 m × 12 m, 790 cells, 2639 m² of bed, 1091 m³ moved, a maximum cut of 0.85 m,
taking the approach from 0.17 m to **0.85 m** with **no blocked sample**. The
water level along the whole reach is 0.053 m and the bed is cut to -0.797 m, so
the cut is one flat trench at sea level rather than a stair of pools. It ran
198 m past the 100 m promise, which is the lead-out running on until it met
water already deep enough: the dredged reach is continuous with the pool below.
296 core cells stood at or above the waterline and were not cut. They are the
mudflat between the pools, which is bank rather than bed; the rule leaves bank
uncut.

**One chain pass is not enough, and that is a finding.** `dock_dredge` runs
inside `refine_province` and cuts a 12 m trench along the poling line **as it
was published before the chain**. `compile_minor_waterways` then re-solves that
line on the terrain the trench has just changed, and the new line is not the
old one: over the first 30 m it now runs (3315, 4823), (3319, 4829),
(3326, 4834) where it used to run (3309, 4823), (3312, 4831), (3316, 4838), a
divergence of up to 9 m against a trench half-width of 6 m. Every vertex of the
new line reads 0.84 m, but one resampled point between two of them, at
(3322, 4832), falls outside the trench and reads **0.36 m**, so
`blueprint --check` fails the 97 B5/G9 depth promise on a single sample of 34.
A second `refine_province` pass cuts along the line that is now published and
closes it. This is a tool-order defect, not a placement one, and it is logged
for the water workstream.

The chain writes that cut, so the numbers above are the shipped ones:
`./scripts/terrain-chain.sh --from refine_province`, then
`worldgen.apply_sitings`.

**One tool changed with this move.** `compile_minor_waterways` classes a minor
waterway `river` when it runs down water that already exists rather than a cut
line, which the new serving reach does. `province_network.WATER_CLASSES` did not
contain `river`, so `blueprint._water_routes` reported the route absent from the
published network and `dock_dredge` never saw the approach at all. A river is
water; the set now says so.
