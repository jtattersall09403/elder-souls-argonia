# Nine-Trunks — design record (Phase 11 Part 7, Round A redraft)

`place.hist-heartland.nine-trunks` · Hist village, M3, speaking-Hist variant, D3,
fringe marsh · blueprint `place.hist-heartland.nine-trunks.json` · dossier
`world/sources/sites/dossiers/nine-trunks.{json,md}` · map
`tooling/world-generation/output/blueprint-maps/place.hist-heartland.nine-trunks.png`

This is the exemplar for the province's commonest settlement family (27 tribal
villages). Section 7 lists the rules which generalise.

## 1. Candidate sitings (unchanged from Part 6)

Plotted position 4937.9, 3610.9 m. The signature is a ring of trunks, so each
candidate was tested on relief measured **round the ring**, not on slope at a
point; the compiler never grades a delta of 2 m or more.

| | `candidate.nine-trunks.knoll` (chosen) | `candidate.nine-trunks.bank` | `candidate.nine-trunks.plot` |
|---|---|---|---|
| positionM | 4972.9, 3755.9 | 4912.9, 3785.9 | 4937.9, 3610.9 |
| distance from the plot | 149 m | 177 m | 0 m |
| relief across the ring | **1.5 m** (21 m radius; 2.17 m on the first draft's 66 m ring) | 1.66 m | 4.33 m |
| height above the water table | **4.77 m** | 3.04 m | 3.04 m |
| shoreline | 40 m | 10 m | 49 m |
| road (Archon–Gideon) | 162 m | 105 m | 241 m |
| flood band / wet-season inundation | 0 / no | 0 / no | 0 / no |

The bank candidate would stand a third of the ring in water; the plotted
candidate carries relief past the no-grading limit. The knoll is the one site
at which the ring encloses firm ground, which is the record's stated site
advantage.

Measured on the chosen ring (`street_router` survey): trunk footings run
from 3.5 m (south) to 5.0 m (west and north-west); the clearing floor is 3.8–4.3 m;
the poleable water is a pool 58–65 m west-north-west of the centre with its
surface about 1.2 m and its eastern bank at 3.4 m.

## 2. High-level design

**One ring, one clearing, one gate, one spine.** Nine trunk columns stand on a
21 m radius at 40° spacing (chord 14.37 m, clear gap between trunk faces
9.63 m). A mud hut of 5.92 × 6.47 m sits in each of eight gaps, leaving 1.9 m
each side to the trunk face; that 1.9 m is closed with a woven panel, so
the wall line is unbroken. The ninth gap, south-west at 220°, holds the stick
arch and is the gate; both approaches arrive at it. Inside, the naheesh's
round house stands at the foot of the elder trunk (north), drawn 8.5 m off the
centre so that the trunk rises clear of its roof; the path from the arch runs
straight across the clearing to its door. A trodden ring walk at 15.5 m radius
reaches every door in the wall. Eight root swells lie outside the wall on a
27.5 m radius, one per built gap; the gate gap has none, which is the gap the
tribes cite when they count nine trees.

**Ground.** The knoll carries 1.5 m of fall from north-west to south. Every hut
sits on a pad or a plinth (5.0 m west, 3.5 m south); the arch on a pad; the
round house and the deck on the level 4.0 m northern floor. No grading.

**Districts** (one kit set each; the two-culture rule holds):

| District | Kit set | What |
|---|---|---|
| `district.nine-trunks.ring` | `argonian-mud` (`settlement-mud-v1`) | eight huts, the round house, the minder's deck, the arch, the nest totem, the chime frame, eighteen woven gap panels |
| `district.nine-trunks.pitch` | `argonian-mud` (`settlement-mud-v1`) | two open shelters, a drying rack, the two runs of the pitch line |

The trunk columns and root swells are *landmarks* from the tropical set; no
piece is attached to them and no piece spans between two trunks.

**Households and uses.** From the type recipe (3–8 villagers, one elevated
member on the tree-minder's platform) and the M3 band of the settlement
register, the village holds eight resident villagers in five households and
takes the top of the recipe band because it is rich on rent. By gap bearing:

| Gap | Parcel | Use |
|---|---|---|
| 20° | `hut-family-east` | tribe family, egg-tenders |
| 60°, 100°, 140° | `guest-hut-1..3` | rented to delegations; two of the three stand empty eleven months (Water Without Ceremony) |
| 180° | `store-hut` | the recipe's food and reagent cache, as a hut because there are guests to feed |
| 220° | `gate` | the arch, `spans` the spur |
| 260° | `hut-pitch-taker` | the pitch-rights taker's household |
| 300° | `hut-family-west` | tribe family, the boat household |
| 340° | `hut-tree-minder` | the tree-minder |
| inside | `naheesh-house`, `minder-deck` | the round house; the watcher's platform |
| outside | `pitch-1`, `pitch-2`, `pitch-rack` | the rented pitch ground |

`scaleGrounding`: population 8, households 5, buildingsPlanned 14, parcels 14.
Guests are counted only in the convocation variant: up to twelve, in four
rented huts and two pitches.

## 3. Asset picks, on measured geometry

Sizes are the measured `widthM × depthM × heightM`
from `tooling/asset-pipeline/output/kits/*.footprints.json`, before scale.

| Object | Asset | Measured (m) | Scale | Result |
|---|---|---|---|---|
| `landmark.nine-trunks.trunk-1` (elder) | `tropical:landscape/trees/anvilgianttrunk` | 10.53 × 10.53 × 56.39 | 0.55 | 5.8 wide, 31 tall |
| `trunk-2..9` | same | same | 0.45 | 4.7 wide, 25 tall |
| `root-join-1..8` | `tropical:landscape/trees/anvil_root01` | 14.44 × 10.29 × 6.20 | 0.45 | 6.5 × 4.6 × 2.8 |
| eight huts | `mudmother:gv_meshes/argoniannest/mudhut01` | 5.92 × 6.47 × 5.09; hull 5.91 × 6.47; matched interior `mudhut01intnew`, doorway side 180° local | 1 | in a 9.63 m gap, 1.9 m each side |
| `naheesh-house` | `bmv:architecture/huts/exterior/hutexterior` | round hull 9.6 m wide, 7.18 m high, shell of 101 square metres | 1 | inside the ring |
| `minder-deck` | `mudmother:…/argonianplatform` | 2.79 × 2.68 × 0.34 | 1 | no interior, no door |
| `gate` | `mudmother:…/archwaysticks` | 5.10 × 4.61 × 2.73; hull centred 9.6 m from the mesh origin | 1 | the parcel's `centreUV` is the mesh origin, so it is set back from the ring so that the hull lands on it |
| `pitch-1`, `pitch-2` | `mudmother:…/argoniantent02` | 6.14 × 5.31 × 4.26; interior none | 1 | open shelters, no door |
| `pitch-rack` | `mudmother:…/fishracksmall` | 2.48 × 2.64 × 2.53 | 1 | at the mouth of the pitch ground |
| gap panels (×18) | `mudmother:…/argonianfence01` | 1.58 × 0.29 × 1.70 | 1 | one panel per 1.9 m side gap |
| pitch line (×2) | `mudmother:…/snakefence01` | 0.22 × 2.12 × 1.75 | 1 | two runs with a 10 m opening |

The closed tent `argoniantent01` was dropped: the interiors index reads it as a
shell, so the validator demands a door; a canvas cannot honour an interior
claim. The compiler reports 15 placements, 0 errors, inside the budget.

## 4. Orientation, doors and footprints

Each parcel is a centre, an asset, a `yawDeg` and an `orientationWhy`; the
polygon is derived by `blueprint_footprints --apply`. The interiors index gives
`mudhut01` its doorway on the **local 180° side**, so a hut whose `yawDeg`
equals its gap bearing has its door facing `bearing + 180°`, which is inward.
The first draft had this the wrong way round (yaw = bearing + 180, doors
facing out through the stockade); the index caught it.

Doors: nine. Eight hut doors face the clearing and stand 2.2–2.4 m from the
ring walk; the round house's door faces 209°, the bearing of the arch; the
talk path ends on its threshold. The deck, the arch, the shelters and the rack
have no interior and so no door. Interior claims: the eight huts carry the
matched `mudhut01intnew`; the round house is a shell and claims
`dungeon-root-v1` (open question Q2).

## 5. Ways, fences and integration

| Way | Kind · width | Routing | Ends at | Length |
|---|---|---|---|---|
| `route.nine-trunks.spur` | track 3.0 m | terrain | gate | 160 m, five bends over 20° |
| `route.nine-trunks.ring-walk` | footpath 1.5 m | arc, 15.5 m radius | gate | 98 m |
| `route.nine-trunks.talk-path` | footpath 1.5 m | terrain | gate → round house | 23 m |
| `route.nine-trunks.landing-path` | footpath 1.5 m | terrain | gate | 51 m, rises 3.4 → 4.1 m |
| `route.nine-trunks.pitch-path` | footpath 1.5 m | terrain | pitch-1 | 18 m |
| `boardwalk.nine-trunks.pier` | pier 1.8 m | straight | dock | 9 m, bank 3.4 m to water 1.2 m |
| `fence.nine-trunks.plug-<bearing>-l/r` (×18) | fence 0.3 m | straight | — | 1.4–1.65 m each |
| `fence.nine-trunks.pitch-line-south/north` | fence 0.3 m | straight | — | 15 m and 12 m |

What the integration checks changed against the first draft: the dock moved
from dry ground 36 m south-west (the first draft's "landing" stood at 3.9 m
on land) to the pool 65 m west-north-west, with a pier and a landing path in place
of a boardwalk drawn over dry ground; the gate became a parcel with `spans`, so
the spur is checked to pass through its footprint; the ring walk radius was set
so its buffer clears every hut hull (inner faces at 17.8 m) and the round house
(outer edge at 13.3 m); the eight doors were turned inward, which is what put
them within reach of a way. `compile_settlement` runs all six checks: 0 errors.

## 6. Approach and wayfinding

### `approach.nine-trunks.road-spur` (walk, from the Archon–Gideon road)

`terminal.nine-trunks.gate-head` sits on `track.hist-heartland.nine-trunks`
where the arch stands over it; the compiled track leaves the Archon–Gideon road
116 m south-west of the ring and `route.nine-trunks.spur` is that same line
named where the village keeps it, from the boundary to the arch (entry on the
route 0.0 m, way end 0.0 m, join bearing 11.2° off the track's, arch 6.8° off
square). The spur is no longer a second track drawn beside the compiled one.

The track leaves the road 116 m south-west of the ring at 3.8 m. From the fork
the elder trunk's top reads above the canopy: the trunk is 31 m tall on 4.0 m
ground; the mangrove canopy between (`mangrovereachtree0gkb3`) measures
10.6 m tall, closure 0.31; the ground at the fork is level with the knoll
within half a metre, so the upper 15 m of the elder trunk and the tops of the
25 m ring trunks stand clear. The spur then drops into low ground at 1.7–2.4 m
for its middle 65 m and the canopy closes the view (**lost**). It climbs
onto the pitch shelf at 3.0 m, 50 m from the ring; from there the whole ring
reads as one grey wall: nine columns with hut roofs and panels between them
(**re-found**). The pitch line and the rack are on the left hand, the ledger
station at the arch ahead. The arch is the single gap in the wall; the chime
frame hangs just inside it, to the right. Through the arch the talk path runs
23 m straight to the round house door, with the elder trunk rising behind the
roof: the threshold and the first node in one view.

### `approach.nine-trunks.landing` (boat, from the west up the pool)

From the water the nine trunks stand above the reeds (`vurt_reeds`, 0.7 m)
like the teeth of a comb; the elder trunk is the tallest tooth and marks the
north end of the ring. As the boat noses to the pier the eastern bank, 2 m above
the water, with its mangroves, takes the trunks one by one (**lost**). From the
pier head the western huts and the wall read together above the bank; the
landing path rises under a metre over 51 m, bends round the water-side trunk
(240°); the arch opens on the left hand (**re-found**). The first node
inside is the same: the talk path and the round house door.

### The checklist (research §5)

| # | Check | Answer |
|---|---|---|
| 1 | Every approach designed, ≥2 for M3 | **yes** — road spur (walk, `fromRouteId`) and landing (boat, `fromDirection`) |
| 2 | One first-seen object, a real id | **yes** — `landmark.nine-trunks.trunk-1` on both |
| 3 | Taller than what stands between viewer and object, measured | **yes** — 31 m trunk on 4.0 m ground against 10.6 m mangroves; from the water, 25–31 m against 0.7 m reeds and 10.6 m bank mangroves |
| 4 | Three to five beats with an occlusion | **yes** — trunk / lost in the low ground / wall / arch / door; comb / lost behind the bank / wall / arch |
| 5 | Last stretch bends twice | **yes** — the spur has five bends over 20°, the landing path four |
| 6 | Centre visible from arrival, or a landmark at the bend | **yes** — the round house door is seen through the arch from the pitch shelf; from the landing the water-side trunk marks the bend |
| 7 | Threshold spanned | **yes** — `parcel.nine-trunks.gate` `spans` `route.nine-trunks.spur`, checked |
| 8 | One spine, no duplicated movement | **yes** — the spur (3 m) is the spine outside, the talk path inside; the ring walk serves doors, the landing path serves the pier; way-overlap passes |
| 9 | Landmark hierarchy | **partly** — beacon: the elder trunk at 31 m; mid-place: the arch and the chime frame. The eight 25 m trunks are the beacon's near-rivals; the 6 m difference is what separates them; Q3 asks whether it is enough |
| 10 | Quest and service doors present to a way and are visible from it | **yes** — every socketed parcel's door faces the ring walk or the talk path; the pitch sockets sit on the spur side of the arch |
| 11 | No way ends at a blank wall | **yes** — spur → arch; talk path → the naheesh's door; landing path → arch; pitch path → the first shelter; pier → dock |
| 12 | Every raised level shows its ascent | **yes** — the deck is 0.34 m; nothing else is raised |
| 13 | The edge reads from inside and outside | **yes** — trunks, huts and panels make one closed wall; the root swells outside and the ring walk inside both follow it |
| 14 | Building count within ±25 % of the stated population, lore source named | **yes** — 14 parcels against 14 planned; `scaleGrounding` cites the type recipe and the settlement register |
| 15 | Each cue fits one signpost clause | **yes** — "keep the tallest trunk ahead; the arch is the one gap in the wall"; "from the pier, climb towards the gap in the trunks" |
| 16 | Forced detours pay | **yes** — the spur's dip into low ground buys the wall's re-appearance from the pitch shelf; the landing path's bend round the trunk buys the arch opening on the left |

## 7. Rules which generalise to the 27 tribal villages

1. **The Hist is a landmark, the huts are parcels.** Trunks and roots are placed
   at a uniform scale from the tropical trunk set; nothing is attached to them.
   The huts stand in the gaps and the wall line is closed with woven panels.
2. **Gap arithmetic.** Ring radius R and N trunks give chord 2R·sin(π/N); the
   clear gap is the chord less the trunk width; a `mudhut01` needs 5.92 m plus
   at least 1.5 m each side for a panel. With R = 21 m and N = 9 the gap is
   9.63 m. A smaller village uses fewer trunks on a smaller radius, not
   smaller gaps.
3. **Doors inward.** Hut `yawDeg` = gap bearing; the mud hut's doorway is on
   its local 180° side, so the door faces the clearing. The ring is the
   stockade and no door faces out.
4. **One gap is the gate, and it is a parcel which `spans` the approach.** The
   gate gap faces the road spur; a water approach lands so that its path
   reaches the same gate.
5. **Ring walk + spine.** A footpath arc at R − 5.5 m reaches every hut door
   within 2.5 m; a straight path from the gate to the office-holder's door is
   the spine and the first thing read through the arch.
6. **The office-holder's house is inside the ring, off centre, at the foot of
   the elder trunk**, drawn far enough in that the ring walk's buffer clears it.
7. **Size from the recipe.** 3–8 villagers in 3–5 households; the count of
   huts is households plus rented or store huts; every hut has a use named
   in its `why`. Guests are a variant, not the baseline.
8. **A rented or hosting village keeps its guests outside the stockade** on a
   pitch ground along the approach, marked with a snake-fence line.
9. **Combat spaces are the fighting floor inside the ring, the gate, and the
   guest ground** — each tied to a quest shape that can put a fight there.
10. **Approaches are staged with the ring's own height**: a 25–31 m trunk
    stands above a 10 m canopy from 150 m; the approach dips to lose it and
    climbs to re-find the whole wall at about 50 m.

## 8. Lore grounding

- Hist village form, the tree-minder and the naheesh who carries the Root Talk:
  `world/sources/lore/topics/hist-placement.md`; UESP `Lore:Hist`, `Lore:Argonian`.
- Population: `world/sources/catalogue/type-recipes.json` → `hist-village`
  (3–8 villagers, the elevated watcher, the unguarded cache, the uxith);
  `world/sources/lore/extrapolation/settlement-register.md` M3 band 12–35.
- The uxith and its egg-tenders: `world/sources/lore/topics/hist-and-sap.md`.
- Chimes at the threshold, totems of wood and plumage:
  `world/sources/lore/topics/material-culture.md`.
- Quest provisions: LH37, LH51, LH52, LH53 (`world/sources/quests/local-hist-heartland.json`),
  MQ19 (`docs/quests/50-side-quests.md` §44b): the pitch ground and ledger,
  the eastern root join and felling scene, the baggage under the first
  shelter, the two empty rented huts, the round house and the minder's deck.

## 9. Open questions for the owner

**Q1 — eight villagers in a fourteen-structure village.** The recipe's 3–8
villagers and the register's M3 band (12–35) disagree; this record takes the
recipe for residents and reaches the M3 band only with guests. If the owner
prefers the register, two guest huts become family huts and the population
becomes 12–14 with no change to the drawing.

**Q2 — the round house interior.** `hutexterior` is a shell in its kit; the
blueprint claims `dungeon-root-v1` (the grown-root interior family) for the
naheesh's hall. A mud-walled hall from a root-cavern kit is a compromise. The
alternative is to make the naheesh's house a ninth `mudhut01` (30 m², matched
interior) and lose the hall; the hearing of MQ19 would then be held in the
clearing.

**Q3 — the beacon's rivals.** The elder trunk at 31 m stands 6 m over its eight
neighbours. From the road that difference reads; from the water, where the ring
is seen edge-on, the comb may read as one height. A scale of 0.6 (34 m) would
make the difference unmistakable at the cost of a taller tree than the brief.

**Q4 — ring radius, as before.** 21 m is the number which becomes the default
for 27 villages; tighter reads more like a stockade and holds a smaller crowd.

## 10. Catalogue record should change (not edited from here)

1. `vibe.signatureFeature` and `vibe.materials`: honest against the geometry
   with one qualification — huts fill the gaps and woven panels close them; no
   hut is framed into a trunk.
2. `assetPlan`: drop `vanilla-shackkit` and `fences-wattle`; the plan is
   `mud-mother-grove`, the tropical trunk set, `hist-tree`, `argonian-lights`.
3. `plotFacts.distanceToWaterM` should read about 60 (the pool west-north-west),
   not 29.5; `entrance: gate` stands.
4. `sockets` is empty while the blueprint carries nine.
5. `interior.kind` is `none` while the blueprint declares nine interior claims.

## 11. Deviations from module 97 (Round A review, 2026-09-05)

- **97 C6, 3.3 buildings/ha against 7–16/ha.** The blueprint boundary (4.26 ha) carries the spur, the pool, the pier and the pitch ground; the built ring itself is 0.14 ha with fourteen structures. Nearest-neighbour spacing, the rule behind the band, is met exactly: hut centres sit on a 14.4 m chord (97 C5, p50 13–16 m). The band should be measured over the built hull, not the boundary.
- **97 C7, work 7 % and civic 21 %.** Fourteen parcels make each one 7 %; a Hist village's three civic pieces (round house, minder's deck, arch) and its one work piece (the rack) are what the type recipe names. Hamlet counts are too small for a percentage band.
- **97 C10 and Part F, argonian-mud enclosure (pens only).** The ring of trunks, huts and woven panels is a closed wall by design: it is the catalogue's signature feature and the reason the tribe counts nine trees. The panels are the mud kit's own fence piece. Owner check whether a closed ring is the village's edge or an enclosure the grammar forbids.
- **97 D2, the elder trunk (31 m) against the region's 36.1 m canopy.** The compiler compares against the palette's tallest species; the sightline measured in §6 crosses mangroves of 10.6 m; the trunk clears them by 20 m. The local canopy on the ray, not the regional maximum, is the honest test.
- **97 C7, the uxith.** The egg-tending place is the east family hut, not a separate structure; the recipe allows it, the principle's wording does not say.
