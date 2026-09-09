# The Licensed Stage — meso design record

`place.hist-heartland.sap-tapping-licensed` · Phase 11 Part 7 · exemplar
of the **smallest** place type (a works camp, M1) and of the **tropical
jungle** vegetation class. Dossier:
`world/sources/sites/dossiers/licensed-stage-reach118.json`. Blueprint:
`place.hist-heartland.sap-tapping-licensed.json` (v2 schema: `why` blocks,
approaches, scale grounding, routed ways). Map:
`tooling/world-generation/output/blueprint-maps/place.hist-heartland.sap-tapping-licensed.png`.

## The neighbourhood

The plotted point (3550.6, 4301.8 m) sits 42.4 m up on rock/upland firm ground
in tropical jungle at danger band 4, 717 m from the Helstrom–Blackrose road
and 7.9 m above the local water table, with the nearest shore 64 m
off and the nearest channel 192 m to the south-west. Canopy closure is 1.00.

The record's own cue is decisive. The licence is **hung to be readable
from the water** and the sap leaves by canoe. The plotted point has no water
a boat can use, so the siting moved to the channel system to its north-west.

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
**(3435.6, 4480.6 m)**. The landing stands in the water at **(3423.5,
4461.8 m)**.

The layout was not translated. The anchor was chosen from the ground. The old
arrangement then carried across without rotation because the new bank runs the
same way as the old one. Two pieces moved relative to the rest. The landing is
now in the channel rather than on the bank above it. The licence board followed
it down to the poling line.

## Candidates

Dossier `licensed-stage-reach118`. Distances are to the compiled water that
ships, at the depth the berth's hull class needs (0.6 m for a canoe).

| | anchor (m) | berth (m) | berth ground | water at the berth | dredge | why it won or lost |
|---|---|---|---|---|---|---|
| **E — reach 118 head (chosen)** | 3435.6, 4480.6 | 3423.5, 4461.8 | bed at 28.75 m, under water | **0.60 m** | dredged 172 m × 12 m, 617 m³, 0.04 → **0.85 m**, nothing blocked | the only candidate with a berth standing in water deep enough for a canoe; every parcel of the camp stands on dry ground above it |
| A — north bank (the old siting) | 3490.6, 4391.8 | 3478.5, 4373.0 | dry terrace at 30.52 m | none within 104.4 m | **blocked** — 39 of 51 approach points up to 1.48 m above the water | the channel it was sited on does not exist in the compiled water |
| F — south shelf | 3434.0, 4492.0 | 3421.9, 4473.2 | 0.25 m above the surface, 11.0° bank | none within 8.0 m | n/a — the berth is dry | 8 m of mud is beyond the 3.6 × 1.83 m dock piece, so the deck would end short of the water; the camp would also stand 7.8 m above its water table, making the licence board a climb up from the water instead of a board legible from a canoe |
| G — lower bank | 3430.0, 4480.0 | 3417.9, 4461.2 | 0.39 m above the surface, 7.5° bank | none within 4.5 m | n/a — the berth is dry | the licence board falls in 0.60 m of published water; the board is meant to be read from a canoe while standing on dry bank |

**E won** because the berth is the constraint. A canoe landing has to stand
where a canoe floats: the compiled water at (3423.5, 4461.8) is 0.60 m deep on
a bed at 28.75 m. `dock_dredge` cuts the first 172 m of the serving channel
to 0.85 m with no blocked sample. Above it the terrace runs 30.7 to 31.4 m and
carries every parcel dry — stage 30.67 m, stair 31.38 m, cart 31.20 m, mule
line 31.27 m, hut 32.65 m — with the licence board on the bank lip at 28.63 m,
0.39 m above the channel's surface. Flood band 0; 0 % of the disc floods anew
in the wet season. The road is 526 m to the south-west.

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
contact 1.26 × 0.40 m — two posts and a sill) stands at (3418.0, 4463.5)
on the last dry ground before the reeds, 5.8 m down-channel of the piles and
three metres off the poling line, yaw 231, so the pane runs parallel to the
bank and its face looks straight down the channel: a canoe reads it about
three metres before it comes alongside. The posted papers are part of the
authored mesh, so no paper piece is jammed onto it. Ground delta under the
posts is 0.20 m and the lip stands 0.39 m above the channel's surface; they
are driven, so the parcel is `stilt`. The MR04 evidence socket moved
from the stage rail to this parcel.

**The hut's interior.** `mudhut01` has one measured doorway and ships with
its own interior, `mudhut01intnew`; the door sits on that doorway and opens
into that cell (see Doors and assemblies below).

**The water.** The landing (`dock.sap-tapping-licensed.landing`) is piled to
the bed at (3423.5, 4461.8), in the head of reach 118, past the reed margin:
0.60 m of compiled water on a bed at 28.75 m, which `dock_dredge` cuts to
0.85 m over the first 172 m of the channel. The plank walk runs 11.9 m from
the dry bank out to it. The published channel is 849 m long and reaches the
piles from the south-west. The reed margin is kept, not cleared.

**Clearance is minimal.** Hard clearing covers five boxes against the outlines
the pieces occupy: the stage and its stair, the stock, the hut, the mule line
with the cart and the board. The hut's box runs 5 m past its south
wall, because the doorway is on that wall and a threshold on uncleared ground
is a door the reeds close. A single thinned polygon of 648 m²
covers the rest of the camp; everything outside it stays at the region's
density. The Hist, the reed margin and two shade trees are listed as kept.

**MR04** ("Sap for Sale") anchors on four sockets: `socket.…licence`
(evidence, on the board), `socket.…tapper` (npc), `socket.…graded-stock`
(container, the cart) and `socket.…night-landing` (scene, at the water's edge
beside the plank walk, where a landing can be watched from the reeds). One
combat space, `combat.…stage-foot` (tight), carries its why: blown cover
during the night landing brings the woken crew down the stair to this ground.
The licence-revoked flip makes the same crew hostile by day.

**One variant**, `variant.…licence-revoked`, matches the catalogue's hostility
flip on `flag.hist-heartland.sap-licence-revoked`: the stage and the stock
change, the landing goes unwatched.

## Ways

Every way is authored as waypoints, a width, an end and a reason; `points` is
derived by `worldgen.street_router --apply`.

| Way | kind · width | routing | ends at | why |
|---|---|---|---|---|
| `route.…track` | track · 2.5 m | terrain | the stair | the one worn track from the road, 526 m to the south-west; past the hut's door, past the mule line, dead at the foot of the stair. 40.0 m inside the camp |
| `route.…tent-spur` | footpath · 1.2 m | terrain | the hut | 7.1 m from the track to the doorway, so the door is on a way (the id keeps the draft's name; ids are stable) |
| `boardwalk.…landing-walk` | boardwalk · 1.6 m | straight | the landing | 11.9 m of planks from a stride off the stage foot across the reeds and out over the water to the dock; straight because planks over soft ground take the shortest line |
| `canal.…channel` | channel · 6 m | terrain | the landing | 32.7 m of the poling line up the reach from the south-west — the covert extraction route |

The track's routed line runs 40.0 m inside the camp and bends twice in its
last 27 m. Nothing
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
| stair | `stockadescaffoldstairs01` | 3.58 × 3.46 | 46 | the flight's west face is laid on the stage's south face, so the climb starts landward at the head of the track |
| mule line | `horsetrough01` | 1.85 × 0.69 | 270 | the long axis lies north to south, along the track's last stretch, so the mules stand beside the path |
| stock | `handcart01` | 1.32 × 2.21 | 35 | the shafts point to the head of the track, so the cart is pulled out without turning |
| dwelling | `mudhut01` | 5.92 × 6.47 | 113 | the one doorway looks out at 225° down the spur onto the stage path; the blind back stands to the channel |
| licence board | `bmv:advertising_board` | 1.26 × 0.40 (posts) | 231 | the pane stands parallel to the bank on bearing 141, face down the poling line |
| Hist | `histtree` | 64.0 × 45.3 | 121 | the crown's long axis lies across the channel, so the deepest shade falls over the stage and the landing |
| root flare | `histroots03` | 9.56 × 2.54 | 46 | laid on the trunk-to-stage line, the line that a flare out of the root plate would follow |
| landing | dock | – | 138 | the face looks back up the plank walk, so a canoe poling up the last leg on bearing 51 comes alongside and unloads toward the camp |

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
The first node inside is the stage foot, where the plank walk leaves
for the landing.

### `approach.sap-tapping-licensed.channel-by-canoe` (boat)

The canoe comes up the reach from the **south-west**. The crown stands over the channel from a bend away. The reed margin hides
the bank until 20 m. The roof of the licence board (2.47 m, a hand above
the bank) shows over the reeds next; then the plank walk and the landing open
up; last, the stage rail and the tap lines on the trunk. The board is read
about three metres before the piles, not from the far reach, because the channel bends before it.
The threshold is the dock, which stands in the water; the first node is the board on the bank; the plank walk leads
from it to the stage foot.

### Checklist (research doc §5)

| # | Check | Answer |
|---|---|---|
| 1 | Every approach designed, with a route or direction | yes — walk from `route.…track`; boat from the south-west up the channel |
| 2 | One first-seen object per approach, a real id | yes — `landmark.…hist` on both |
| 3 | Taller than the vegetation and terrain between viewer and object, measured | yes — 53.6 m against a 42.4 m canopy; the camp itself is not the beacon. Concealment is 0.74 after the move, so the camp is in view from 26 % of nearby route points and the tree carries the approach |
| 4 | Three to five beats with an occlusion | yes — five beats each; the crown is lost under canopy, the bank is lost behind reeds |
| 5 | Last stretch bends twice | yes — two bends in the last 27 m of the track; the channel bends twice in its last 20 m before the landing |
| 6 | Centre visible from arrival, or a landmark at the bend | yes — the stair and stage from the second bend; the board from the landing |
| 7 | Threshold spanned, not passed | no, by design — a camp has no gate; the threshold is the track dying at the stair and the dock at the water. Recorded, not fixed |
| 8 | One spine, wider than the rest, no duplicated movement | yes — the track (2.5 m) is the spine; the spur is 1.2 m; the plank walk serves the water alone |
| 9 | Landmark hierarchy, no rival to the beacon | yes — the Hist; the board is the mid-place marker below the landing; nothing else is taller than 6 m |
| 10 | Every socket/service/NPC door presents to a way | yes — the hut door on the spur; the board at the plank walk; the cart and stage at the track head |
| 11 | No way ends at a blank wall | yes — track at the stair, spur at the door, walk at the dock, channel at the dock |
| 12 | Every raised level has visible ascent | yes — the stair is in frame from the last bend |
| 13 | Edge reads as an edge | yes — water and reeds north-west, closed jungle on the other three sides, the thinned ring between them |
| 14 | Building count matches population | yes — three built things and three props, three people, one household; source is the recipe |
| 15 | Approach cue in one clause | yes — "follow the one track to the great tree"; "pole up the reach to the board on the bank, then to the piles" |
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
- One worn track, ending at the one means of ascent; a spur to the hut door
  rather than a track routed past it.
- The water side is the "front": the licence board, the landing and the stage
  rail face the channel; the sleeping place faces the land.
- Kit set follows the piece: a works prop at the water's edge belongs
  to the works district; the district boundary follows it.

## Open questions for the owner

All five are answered (owner 2026-09-07, decision 0041 § Review 2026-09-07
and the Taste ledger); the answers are in the blueprint.

1. **A stacked scaffold tier — resolved.** `stacksOn` exists and the deck
   is placed on the footing (`parcel.sap-tapping-licensed.stage-deck`).
2. **The dwelling's interior — resolved by the hut.** `mudhut01` has a
   measured doorway and its own interior cell, so the walk-in-shell question
   no longer arises.
3. **Tree size — the 54 m hero Hist.** The licence is meant to be read from
   the water, so the camp is a landmark, not a hide.
4. **Hut, not tent.** A crew that comes back every season keeps a mud hut.
5. **Clearing — accepted** at the draft's figure as the first frame-rate data
   point for a place under closed canopy; the Round C walk measures it.

## Catalogue record should change (not edited from here)

- `sitingPrefs.nearPoint` is (4269, 4176) with `maxM: 400`, but this siting is
  887 m from it (it was already 808 m out before the 2026-09-09 move). The
  preference is stale and should move to the head of reach 118, or be dropped.
- `assetPlan` lists `passerelles-walkway` and `settlement-root`. Neither
  serves this place: the smallest dwelling in `settlement-root-v1` measures
  24.6 × 24.6 m and 55.6 m tall. The delivered plan is `works-v1` (stage,
  stair, mule line, stock, licence board), `settlement-mud-v1` (hut,
  dressing) and the HTBM Hist as the landmark.
- `vibe.signatureFeature` says the licence is nailed to the stage; it now
  hangs on a roofed board on the bank below the landing, still readable from
  the water.
- `sockets` is empty while `questHooks.provisions` names
  `quest.provision.mr04-anchor`. The four sockets above should be written back
  once the quest agents have finished with the file.

## Deviations from module 97 (Round A review, 2026-09-05)

- **97 C6 no longer applies here.** The band is a settlement band and this is a works camp, so the compiler does not judge it (the old 34.6/ha reading came from an M1 camp held against the M2 band over a boundary that carried the approaches). The pieces stand where the tree, the water and the track put them.
- **97 D3, no threshold spanned.** A camp has no gate; the threshold is the track dying at the stair and the dock at the water (checklist item 7).
- **97 B6, the canoe approach unmeasured.** It has no route with waypoints, so the compiler cannot run the line of sight; the checklist carries it (the Hist at 53.6 m over a 42.4 m canopy).
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

Since the 2026-09-09 move the berth stands in the water that it serves. The
compiled water publishes 0.60 m at the piles; `dock_dredge`, run against the
shipped rasters, reports **dredged** — 172 m × 12 m, 342 cells, 617 m³, a
maximum cut of 0.85 m, taking the approach from 0.04 m to 0.85 m with no
blocked sample. That cut is applied by `refine_province.carve_to_profile`, so
`blueprint --check` still reports the pre-dredge minimum of 0.12 m along the
first 100 m of the channel until the terrain chain is re-run
(`./scripts/terrain-chain.sh --from refine_province`, then
`worldgen.apply_sitings`). That rebuild belongs to the water workstream and is
already the held step in the water handoff; nothing further about this berth
is outstanding.
