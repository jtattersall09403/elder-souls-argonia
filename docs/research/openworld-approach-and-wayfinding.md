# Approach and wayfinding — designing a place from the walking player's eye

**What this doc is for.** Owner directive, 2026-09-05: *a place is judged from
the ground, never from the air*. Every settlement, camp, ruin and dungeon in
this province is met by a player on foot (or in a small boat), arriving from a
particular direction, at a particular height, with a particular thing on the
horizon. This document collects what shipped open worlds and the wayfinding
literature know about **staging that arrival** and about **finding one's way
once inside**, and it ends in §5 with the checklist an agent runs before an
owner round.

**Already covered elsewhere; do not duplicate.**

| Question | Live doc |
|---|---|
| How many places, how far apart, tiers, pull, "gravity", the chained reveal | [openworld-place-distribution-and-siting.md](openworld-place-distribution-and-siting.md) §1 — **this doc extends §1, it does not restate it** |
| Regional distinctiveness, silhouette-at-thumbnail test | same doc §2 |
| Kit anatomy, snap grids, village layout *algorithms*, exemplar-first | [kit-level-design-and-layout-generation.md](kit-level-design-and-layout-generation.md) §3, §5 |
| Measured building spacing, street widths, chamber sizes | [mined-interior-assembly-and-settlement-form.md](mined-interior-assembly-and-settlement-form.md) |
| Building on slopes: grade, plinth, stilt | [openworld-place-distribution-and-siting.md](openworld-place-distribution-and-siting.md) §4 |

Evidence tags: **[doc]** = developer or academic primary source; **[lore]** =
credible secondary analysis or community measurement; **[inf]** = our inference.

---

## 1. Staging the approach

### 1.1 The weenie, and why it must be earned

The oldest term in the trade is Walt Disney's *weenie*: a tall, lit,
silhouette-defining object placed at the end of a sightline so that guests walk
towards it without being told to. Scott Rogers imports the term wholesale into
game level design in *Level Up! The Guide to Great Video Game Design*
(Wiley), and Christopher Totten's *An Architectural Approach to Level Design*
(CRC Press) gives the same object its architectural reading — a **focal
element** terminating a vista. **[doc]**

The Level Design Book is blunter and more useful about the mechanism: a
landmark works by **local contrast**, not by size — "a tall thing only seems
special if it is surrounded by short things"
([composition](https://book.leveldesignbook.com/process/blockout/massing/composition)).
It also insists that a landmark must be *relevant and useful*, not decorative:
a spire the player can neither reach nor use stops being read as information
after the first two failures. **[doc]**

Elden Ring is the purest modern demonstration. The Erdtree is visible from
almost anywhere in the Lands Between and anchors the player's sense of place
however far they wander; each region then carries a second-order beacon of its
own — the Academy across Liurnia's water, the Divine Towers, the forts — so
that orientation survives at two scales at once
([analysis](https://www.kokutech.com/blog/gamedev/design-patterns/world-building/elden-ring);
Miyazaki at DICE 2023 conceded the studio "put a little more effort into
directly guiding players" for the open world,
[coverage](https://www.mmorpg.com/news/hidetaka-miyazaki-talks-elden-rings-open-world-lessons-from-playtests-multiplayer-and-accessibility-2000124213)). **[lore]**

**[inf] Rule.** Every place of magnitude M3 or above owns exactly one
first-seen object, recorded as `approaches[].firstSeen`. It is a landmark or a
parcel id, never "the town". If two objects compete for the horizon on the same
approach, the place has no silhouette.

### 1.2 The reveal is a sequence, not a moment

BotW's field team designed reveals as chains — a hill crest shows a bridge, the
bridge hides a tower, the tower's approach uncovers the castle (CEDEC 2017,
Fujibayashi & Yonezu,
[translation](https://gist.github.com/idbrii/e39fe96279aa1670319bfa521d907399)),
and critical paths were deliberately curved so the destination is never
continuously in view. **[doc]** The Radiator Blog reading of the same talk
names the effect: triangles occlude *gradually*, so the world arrives in
instalments
([spatial composition and flow in BotW](https://www.blog.radiator.debacle.us/2017/10/open-world-level-design-spatial.html)). **[lore]**

The practical form is the **S-curve approach**: the last 200–400 m of the way
bends at least twice, so the place is seen, lost, and re-found at a nearer
scale. Straight final approaches burn the reveal in one frame and turn the
remaining walk into dead time. A curve also buys the silhouette a second
reading against a different backdrop, which is how players commit a shape to
memory ([landmark literature review, Frontiers/PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8324579/):
landmarks *on route* and *at decision points* are the effective ones). **[doc]**

**[inf] Rule.** `approaches[].sequence` is written as an ordered sentence of
three to five beats — what reads on the horizon, what occludes it, what is seen
next, what the gate is, what the centre is. A sequence with one beat is a
missing design, not a short one.

### 1.3 Gateway and threshold

Totten's central borrowing from architecture is the **threshold**: a
compression before a release, which is how a building or a town announces that
the outside has ended. **[doc]** Bethesda's towns state it with a physical
gate; Morrowind states it with a bridge or a gatehouse arch; RDR2 states it
with a name-board, a fence line and a change of ground material at the town
limit. The common property is that the threshold is **spanned, not passed** —
the way goes *through* a piece of geometry.

Our schema encodes this: a parcel may carry `spans: <way id>`, and the
integration pass checks that the gate piece actually crosses its way. A gate
standing *beside* the road is the single most common and most embarrassing
placement bug in this class (§3).

### 1.4 Denial and reward, and the cost of a detour

Theme-park practice ("denial and reward"), BotW's own rule of thumb and the
Souls tradition all agree on one thing: **an approach that costs effort must
pay at the point where the effort ends**. A climb pays at the summit, a swim
pays at the island, a detour around a cliff pays with the view that the detour
bought. The corollary matters more for us: **an approach that costs a detour
and gives no view is a design fault**, because the player reads the cost as the
world's carelessness rather than as a choice.

### 1.5 Light and sound as beacons

The Level Design Book's signposting ladder ranks the certainty of each cue:
static barriers 95–98 %, breadcrumb trails ~80 %, lighting and colour ~40 %,
composition and sightlines ~35 %, ambient sound ~15 %
([wayfinding](https://book.leveldesignbook.com/process/blockout/wayfinding)). **[doc]**
The numbers are indicative, but the *ordering* is the useful part: light is
about twice as reliable a beacon as sound, and both are far weaker than
geometry. Under a closed canopy at dusk — our default condition in much of
Black Marsh — light is often the only cue with any range at all, which is why a
marsh settlement's beacon should be a **lit** thing (a brazier tower, a lantern
line down a causeway, a lit Xanmeer face) rather than merely a tall one.

Sound is a confirmation cue, not a direction cue: it tells a player who is
already close that they have arrived, and it is what makes a hidden entrance
forgivable.

### 1.6 Marker-free direction

Morrowind's directions are diegetic and landmark-based, which imposes a hard
constraint recorded already in the sibling doc §1.3: **every approach must be
describable in one clause**. A journal line reading "follow the south bank to
the three carved posts, then inland" only works if those posts exist, are
unique on that bank, and are visible from the bank. Our `approaches[].firstSeen`
and the catalogue's approach cue are the same fact viewed from two directions,
and both are written at placement time, never retrofitted.

---

## 2. Wayfinding inside the place

### 2.1 Lynch's five elements, applied to a blueprint

Kevin Lynch, *The Image of the City* (MIT Press, 1960), gives the vocabulary
every subsequent wayfinding literature uses: **paths, edges, districts, nodes,
landmarks**, with *legibility* as the property of an environment that lets a
person build an accurate mental map and *imageability* as the property of an
object that makes it stick. Lynch's own caution is the one designers forget:
the five elements are raw materials, and the work is in their **interrelation**
— paths penetrate districts, edges bound them, nodes activate junctions,
landmarks punctuate. **[doc]** The framework has been applied directly to game
space by Eskidemir & Kubat, "The visual structure of fictional space in video
games" (ISUF 2021,
[PDF](https://strathprints.strath.ac.uk/80383/1/Eskidemir_Kubat_ISUF_2021_The_visual_structure_of_fictional_space_in_video.pdf)),
who read the *Watch Dogs: Legion* map through the five elements and found
developers preserved real inter-landmark *distances* while compressing travel
time roughly fourfold. **[doc]** A game-based wayfinding study in *URBAN DESIGN
International* (2025,
[Springer](https://link.springer.com/article/10.1057/s41289-025-00290-7))
confirms the operative mechanism: **global landmarks reduce cognitive load**,
and their absence, not layout complexity as such, is what makes an environment
hard.

The mapping onto our blueprint fields is exact, and it is why the schema looks
the way it does:

| Lynch | Blueprint |
|---|---|
| Paths | `ways[]` (street, causeway, boardwalk, channel), each with its `why` |
| Edges | `fences[]`, the water line, the clearance ring, a district boundary |
| Districts | `districts[]`, one kit set each — the kit set *is* the district's common character |
| Nodes | the junction, the market, the dock head, the gate — a landmark or a way's `endsAt` |
| Landmarks | `landmarks[]`, plus `approaches[].firstSeen` |

### 2.2 A readable hierarchy of ways

The Level Design Book's circulation chapter warns that a large map with no
clear hierarchy of routes "will function like a maze", and that width itself
reads as rank — wider feels primary, narrower feels secondary
([circulation](https://book.leveldesignbook.com/process/layout/flow/circulation)). **[doc]**
The classic wayfinding heuristics are the same: limit the choices at each
decision point, give a survey view early, and put the cue *at* the decision
point rather than between them.

**[inf] Rule.** A place has one spine, at most three secondary ways per
district, and the spine is measurably wider than the rest. Two ways of equal
width running parallel between the same two nodes are a duplicated path — cut
one, or make one narrow and give it a reason (a back lane behind the stilt
row).

### 2.3 Sightline to the centre, and the door one wants

Two tests do most of the work.

- **From the gate, the centre is visible.** Not the whole place — the *node*
  the player is meant to reach first (the market, the well, the Hist court, the
  dock head). If the spine bends such that the centre never appears, the bend
  needs a landmark at its elbow.
- **The door one wants is on the way.** Every building that carries a quest
  socket, a service or a named NPC must present its **door to a way**, and that
  door must be visible from that way's walking line. This is the field
  `orientationWhy` exists to force: "door to the quay", "front to the market
  square". A shop whose entrance faces the swamp behind it is unfindable
  without a marker, and we are building for a world that leans on diegetic
  direction.

Bethesda's own convention is a hierarchy of door prominence: inns and shops sit
on the spine with signs and lit porches; dwellings sit off it; the seat of
authority sits at the end of the spine and is entered last.

### 2.4 Dead ends, verticality, edges

Dead ends are legitimate and useful — negative reinforcement is how a player
learns the shape of a place — but the shipped rule is that **a dead end pays or
it is cut**. A cul-de-sac ending in a shrine, a view, a container, a corpse or
a locked door with a story is content; a cul-de-sac ending in a wall is a bug
the player blames on themselves for two seconds and on the game thereafter.

Verticality needs its own cue because a player standing at ground level cannot
see an upper level's affordances. The readable pattern is a **visible means of
ascent from the node below it**: the stair, ladder, ramp or causeway that
reaches a raised platform must be visible from the point where the player first
wants to go up. Our stilt and platform kits make this the commonest layout
failure in the province, and the check is cheap: from the way, is the ascent in
frame?

Edges want honesty. A water line, a palisade or a clearance ring should read as
a boundary from inside as well as outside; a "town edge" that is merely where
the parcels stopped reads as an unfinished level.

---

## 3. The classic gotchas

Each is a defect an agent can produce without noticing, because each is
invisible in a top-down map and obvious to a walking player.

1. **Floating or buried buildings.** The piece's ground hull does not meet the
   terrain across its footprint, because the centre was sampled and the corners
   were not. Sample the footprint ring, then choose grade, plinth or stilt (the
   siting doc §4).
2. **Doors facing away from the street.** The door's `facingDeg` is checked
   against the footprint outline, but nothing yet checks that the door faces a
   *way* — that is a human check on the list in §5.
3. **A path that stops at a wall.** A way whose `endsAt` names nothing, or
   whose last waypoint sits inside a parcel footprint.
4. **A gate beside the road.** The arch, gatehouse or bridge that does not
   `span` its way. Equally: a wall with a hole beside its gate.
5. **Duplicated paths.** Two ways serving the same movement between the same
   nodes, so neither reads as the spine.
6. **A layout that only reads from the air.** Radial symmetry, axis-aligned
   rows, a plan whose logic is legible on the map and invisible at eye level.
   The tell is a design record that explains the shape rather than the walk.
7. **The sea of sameness.** One kit, one storey height, one orientation, no
   local contrast — so no object can serve as a landmark, because everything is
   equally tall. Contrast is the mechanism; sameness disables it.
8. **Scale that lies.** Nine buildings for a stated population of two hundred,
   or forty for a fishing hamlet. `scaleGrounding` exists for exactly this, and
   the validator enforces ±25 % against `buildingsPlanned`.
9. **An approach with no landmark.** A place first seen at 80 m, as a wall of
   roofs. There was nothing to walk *towards*.
10. **An entrance hidden from the main road.** Especially in dense vegetation,
    where the trodden corridor and the entrance were placed by different
    passes.
11. **A cliff that forces a detour and gives nothing.** The cost was charged
    and the reward was not paid (§1.4).
12. **A silhouette lost in the canopy.** The beacon is 9 m and the trees are
    14 m. Height must be measured against the *vegetation* at the approach, not
    against the ground.
13. **Everything visible at once.** No occlusion on the approach, so the reveal
    happens in one frame and the last three minutes of walking are spent
    looking at the destination.
14. **Interiors implied and not owned.** A door on a piece whose kit has no
    interior, or a named shop with no `interior` block — a promise the geometry
    cannot keep (engineering standard 12).

---

## 4. Bethesda's and Morrowind's own settlement conventions

Bethesda's modular kit craft is documented by Joel Burgess and Nate Purkeypile,
"Skyrim's Modular Approach to Level Design" (GDC 2013,
[transcript](http://blog.joelburgess.com/2013/04/skyrims-modular-level-design-gdc-2013.html))
and Burgess's "Iterative Level Design Process" (GDC 2014,
[transcript](http://blog.joelburgess.com/2014/07/gdc-2014-transcript-iterative-level.html)). **[doc]**
The *settlement* conventions below are read off the shipped worlds
(UESP place pages) rather than stated in a talk, so they are **[lore]** — but
they are consistent enough across the games to be treated as a house pattern.

- **The town meets the road.** Every Skyrim hold capital's main gate stands on
  the road, with its outworks — stables, wagon, mill, guard post, graveyard —
  strung along the last stretch of that road. The player never reaches a town
  wall without having been walked along it.
- **The market sits at the first junction inside the gate.** Whiterun's market
  and Markarth's stalls are within sight of their gates; commerce is the first
  node, so the first thing a stranger meets is the thing a stranger needs.
- **Authority takes the high point, and is entered last.** Dragonsreach crowns
  Whiterun's three terraces; Understone Keep sits at the head of Markarth's
  canyon; the Blue Palace terminates Solitude's spine. The seat of power is the
  place's silhouette *and* the end of its main path — one object doing Lynch's
  landmark and node duty together.
- **Second-order landmarks punctuate the middle.** The Gildergreen at
  Whiterun's mid-terrace node, the Skyforge above Jorrvaskr; each marks a
  decision point rather than the destination.
- **Villages are one street.** Riverwood, Rorikstead and Ivarstead are a single
  through-way with the road entering at one end and leaving at the other, an
  industry (mill, farm, ferry) as the reason for the place, and no side lanes.
- **Morrowind, Balmora** ([UESP: Morrowind:Balmora](https://en.uesp.net/wiki/Morrowind:Balmora)):
  the town is split by the Odai, its two banks joined by bridges — an *edge*
  running through the middle, which is what makes it memorable. The road from
  Seyda Neen arrives from the south, the silt-strider port is the arrival node,
  and status climbs westward and upward to the Hlaalu council manors, so the
  plan states its class structure as topography.
- **Morrowind, Ald'ruhn** ([UESP: Morrowind:Ald'ruhn](https://en.uesp.net/wiki/Morrowind:Aldruhn)):
  the entire settlement is organised around Skar, the shell of a colossal dead
  crab, visible across the Ashlands. It is the beacon, the district and the
  reason in one object — the strongest single illustration in the series that a
  place's identity is a **shape on the horizon with a story inside it**.

**[inf] What we take.** Road-meets-gate; commerce at the first node; authority
high and last; a second landmark at the middle decision point; one street for
small places; and — the Ald'ruhn lesson — a signature that is simultaneously
the silhouette, the reason and the destination, used **once** in the province.

---

## 5. The pre-Round-A checklist

An agent runs this against the blueprint and writes the answers into the design
record before requesting an owner round. Every item is yes/no and every item
names the field that carries the evidence. A "no" is either fixed or recorded
as an open question with a reason.

| # | Check | Field |
|---|---|---|
| 1 | Every approach a walking or boating player can use is designed (≥2 for M3+), each with a route or a direction | `approaches[].mode`, `.fromRouteId`/`.fromDirection` |
| 2 | Each approach names exactly one first-seen object, and it is a real id | `approaches[].firstSeen` |
| 3 | That object is taller than the vegetation and terrain between it and the viewer, measured, not assumed | `approaches[].sequence`, dossier heights |
| 4 | The sequence has three to five beats and includes at least one occlusion (seen, lost, re-found) | `approaches[].sequence` |
| 5 | The last stretch of the approach bends at least twice, or the record says why a straight run is right here | `ways[].via`, `approaches[].notes` |
| 6 | From each approach's arrival point, the centre node is visible, or a landmark stands at the bend that hides it | `approaches[].wayfinding`, `landmarks[]` |
| 7 | The threshold is spanned, not passed: the gate, arch or bridge crosses its way | parcel `spans` |
| 8 | The place has one spine, wider than the rest, and no two ways duplicate the same movement | `ways[].kind`, `.why`, `.endsAt` |
| 9 | There is a landmark hierarchy: one beacon, one or two mid-place markers at decision points, and no rival to the beacon | `landmarks[]` |
| 10 | Every quest-socket, service or named-NPC building presents its door to a way, and the door is visible from that way | `sockets[]`, parcel `yawDeg` + `orientationWhy`, door `facingDeg` |
| 11 | No way ends at a blank wall; every dead end pays with something the record names | `ways[].endsAt`, `why.playerPurpose` |
| 12 | Every raised level has its means of ascent visible from the node below | parcel `groundFit`, `why.microGeography` |
| 13 | The edge of the place reads as an edge from inside as well as outside | `fences[]`, clearance, water line |
| 14 | Building count matches the stated population within ±25 %, and the record says which lore source set the population | `scaleGrounding` |
| 15 | Every approach cue is describable in one clause a signpost or a journal line could carry | `approaches[].wayfinding` |
| 16 | Any detour the ground forces (a cliff, a channel, a flooded flat) pays with a view, a find or a shortcut | `approaches[].notes`, `why.playerPurpose` |

---

## Sources

- Kevin Lynch, *The Image of the City*, MIT Press, 1960 — paths, edges,
  districts, nodes, landmarks; legibility and imageability.
- Christopher W. Totten, *An Architectural Approach to Level Design*, CRC Press
  — thresholds, focal elements, prospect and refuge in game space.
- Scott Rogers, *Level Up! The Guide to Great Video Game Design*, Wiley — the
  "weenie" imported from Disney Imagineering.
- Joel Burgess & Nate Purkeypile, "Skyrim's Modular Approach to Level Design",
  GDC 2013 — [transcript](http://blog.joelburgess.com/2013/04/skyrims-modular-level-design-gdc-2013.html).
- Joel Burgess, "The Iterative Level Design Process Used to Ship Fallout 3 and
  Skyrim", GDC 2014 — [transcript](http://blog.joelburgess.com/2014/07/gdc-2014-transcript-iterative-level.html).
- Hidemaro Fujibayashi & Makoto Yonezu, "Field Level Design in *Breath of the
  Wild*", CEDEC 2017 — [translation](https://gist.github.com/idbrii/e39fe96279aa1670319bfa521d907399).
- Robert Yang, *The Level Design Book* —
  [composition](https://book.leveldesignbook.com/process/blockout/massing/composition),
  [wayfinding](https://book.leveldesignbook.com/process/blockout/wayfinding),
  [circulation](https://book.leveldesignbook.com/process/layout/flow/circulation).
- Radiator Blog, "Open world level design: spatial composition and flow in
  BotW" — [article](https://www.blog.radiator.debacle.us/2017/10/open-world-level-design-spatial.html).
- Eskidemir & Kubat, "The visual structure of fictional space in video games",
  ISUF 2021 — [PDF](https://strathprints.strath.ac.uk/80383/1/Eskidemir_Kubat_ISUF_2021_The_visual_structure_of_fictional_space_in_video.pdf).
- "The influence of urban configuration on wayfinding propensity: a video
  game-based study", *URBAN DESIGN International*, 2025 —
  [Springer](https://link.springer.com/article/10.1057/s41289-025-00290-7).
- "Landmarks in wayfinding: a review of the existing literature" —
  [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8324579/).
- UESP: [Morrowind:Balmora](https://en.uesp.net/wiki/Morrowind:Balmora),
  [Morrowind:Ald'ruhn](https://en.uesp.net/wiki/Morrowind:Aldruhn),
  [Skyrim:Whiterun](https://en.uesp.net/wiki/Skyrim:Whiterun),
  [Skyrim:Markarth](https://en.uesp.net/wiki/Skyrim:Markarth).
- Elden Ring landmark reading —
  [Kokutech](https://www.kokutech.com/blog/gamedev/design-patterns/world-building/elden-ring);
  Miyazaki at DICE 2023 —
  [coverage](https://www.mmorpg.com/news/hidetaka-miyazaki-talks-elden-rings-open-world-lessons-from-playtests-multiplayer-and-accessibility-2000124213).
