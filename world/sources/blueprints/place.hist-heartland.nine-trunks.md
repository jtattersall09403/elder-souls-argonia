# Nine-Trunks — meso design record (Phase 11 Part 6)

`place.hist-heartland.nine-trunks` · Hist village, M3, speaking-Hist variant, D3,
fringe marsh · blueprint `place.hist-heartland.nine-trunks.json` · dossier
`world/sources/sites/dossiers/nine-trunks.{json,md}` · map
`tooling/world-generation/output/blueprint-maps/place.hist-heartland.nine-trunks.png`

This is the exemplar for the province's commonest settlement family (27 tribal
villages), so every rule below is written to generalise.

## 1. Candidate sitings

Plotted position 4937.9, 3610.9 m. The signature is a ring roughly 66 m across,
so the test each candidate had to pass was relief measured **around that ring**,
not slope at a point: nine trunk footprints have to sit inside the ground-fit
ladder, and the compiler never grades a delta of 2 m or more.

| | `candidate.nine-trunks.knoll` (chosen) | `candidate.nine-trunks.bank` | `candidate.nine-trunks.plot` |
|---|---|---|---|
| positionM | 4972.9, 3755.9 | 4912.9, 3785.9 | 4937.9, 3610.9 |
| distance from the plot | 149 m | 177 m | 0 m |
| relief across the 66 m ring | **2.17 m** | 1.66 m | 4.33 m |
| ground slope at centre | 2.58° | 1.31° | 1.31° |
| height above the water table | **4.77 m** | 3.04 m | 3.04 m |
| shoreline | 40 m | 10 m | 49 m |
| poleable water | 32 m | 20 m | 66 m |
| road (Archon–Gideon) | 162 m | 105 m | 241 m |
| flood band / wet-season inundation | 0 / no | 0 / no | 0 / no |
| region · soil · danger band | fringe marsh · firm lowland · 3 | fringe marsh · firm lowland · 3 | fringe marsh · firm lowland · 3 |

**Why the knoll won.** The record's stated site advantage is that *the ring
encloses firm ground*. `candidate.nine-trunks.bank` is the flattest and the nearest to the road,
but its shoreline runs 10 m from the centre, so the western third of a 33 m ring
would stand in water; it cannot deliver the one thing the place is for.
`candidate.nine-trunks.plot` carries 4.33 m of relief across the ring, which puts several trunks
past the no-grading limit — the macro plot chose at map resolution and could not
see it. The knoll gives 2.17 m across the whole ring, which the compiler resolves
as one dug-in flare (the elder trunk, delta 2.27 m over its 24.6 m footprint),
six pads and four plinths, with water inside poling reach and the road close
enough for the catalogue's `discovery: road`. Danger band, region class, culture
territory and landform are unchanged from the plot, so nothing derived upstream
moves.

## 2. High-level design

**Layout intent.** One ring, one clearing, one gate. The nine trunks stand on a
33 m radius at 40° spacing, so adjacent crowns overlap and the ring reads as a
single closed mass from outside — the approach the record asks for ("a single
mass until you are inside it, then it opens"). The gate is the one gap kept
open, on the south-south-west arc facing the road; the road spur runs 160 m from
the Archon–Gideon road to it. The landing sits 40 m west on the channel, with a
short path in through the ring wall. Everything a visitor is meant to see on the
way in — the rented pitch ground — lies **outside** the ring on the road side,
which is the whole social point: guests pay before they are let in.

**Districts** (one kit set each; two-culture rule respected):

| District | Kit set | What |
|---|---|---|
| `district.nine-trunks.ring` | `argonian-root` (`settlement-root-v1`, `dungeon-root-v1`) | the nine trunk-houses, the ring walkway at balcony height, the tree-minder's deck, the nest, the chime frame, the root joins |
| `district.nine-trunks.pitch` | `argonian-mud` (`settlement-mud-v1`) | the rented pitch ground: the delegations' own coastal canvas and their drying rack |

The interior kit rule (`world/sources/lore/topics/material-culture.md` §
`settlement-root-v1`) forbids wattle-and-daub and reed weave inland *without a
stated reason*. The stated reason here is diegetic and is the place's whole
premise: the canvas is not the village's, it is borrowed, brought up from
Shadowfen and the coast by delegations and struck again each year. It therefore
stands outside the ring, never in it, and it is the only foreign material on the
site. This is recorded as owner question Q2 below.

**Signature feature.** Nine trunks in one ring, root-joined at ground level, with
the dwellings *in* the trunks rather than between them — see §4, this is where
the geometry forced a change.

**What is kept.** All nine trunks are `kept` vegetation of kind `hist-tree`: the
ring is the Hist and is never cleared or thinned. A reed bed is kept at the
landing. Hard clearance is the 27 m inner clearing, the pitch ground and a 20 m
corridor along the road spur; everything out to 95 m is thinned rather than
cleared, so the ring stays hidden until the approach reaches it (dossier: the
site sees 30% of its surroundings and is seen from 14% of nearby route points).

**Sockets and quest needs.** Nine sockets, each on ground a quest can use:

- LH51 *Pitch-Rights* — `socket.nine-trunks.pitch-ledger` (station) and `socket.nine-trunks.pitch-taker` (npc) on
  the pitch ground, at the gate, where the rent is argued in public.
- LH52 *One Tree or Nine* — `socket.nine-trunks.root-join` (evidence) on the first root swell and
  `socket.nine-trunks.felling-claim` (scene) inside the ring facing the disputed trunk. The
  dispute is literally the geometry: nine footprints, one joined canopy.
- LH53 *Under the Overflow* — `socket.nine-trunks.delegation-baggage` (container) inside the
  larger pitch shelter.
- LH37 *Water Without Ceremony* — `socket.nine-trunks.empty-pitches` (mark) on the two pitches
  the tribes who now camp at Greenspring left standing empty.
- MQ19 *The Child of Two Hist* — `socket.nine-trunks.tree-minder` (npc) on the tree-minder's deck.
- `quest.provision.identity-case` — `socket.nine-trunks.identity-case` (evidence) in the elder
  trunk, the naheesh's house.
- The catalogue's `l1` provisions cache — `socket.nine-trunks.guest-cache` (container) in the
  clearing, "what a village keeps for guests it half-trusts".

**Variants.** `variant.nine-trunks.convocation` (the one month: pitches full, chimes raised, the
boat hourly) and `variant.nine-trunks.off-season` (the other eleven: pitches struck, chimes stacked,
boat on request). Two of the three slots used.

## 3. Asset picks, on measured geometry

All sizes are `sizeM` [x, y, height] in metres from
`tooling/asset-pipeline/output/kits/*.kit.json`.

| Parcel(s) | Asset | Size (m) | Tris | Ground fit (measured Δ) |
|---|---|---|---|---|
| `parcel.nine-trunks.trunk-1` (elder) | `bmv:architecture/citebosmer/houses/housetronc001` | 24.63 × 24.63 × 55.55 | 5516 | dug-in (2.27) |
| `parcel.nine-trunks.trunk-2..9` | `bmv:architecture/citebosmer/houses/housechamp001` | 14.78 × 14.36 × 34.37 | 4490 | pad ×6 (0.68–1.20), plinth ×2 (0.26, 0.33) |
| `parcel.nine-trunks.minder-deck` | `bmv:architecture/citebosmer/passerelles/kiosque/kiosk01` | 8.57 × 8.57 × 20.74 | 14048 | plinth (0.51) |
| `parcel.nine-trunks.pitch-1` | `mudmother:gv_meshes/argoniannest/argoniantent01` | 8.20 × 7.00 × 5.96 | 2388 | plinth (0.60) |
| `parcel.nine-trunks.pitch-2` | `mudmother:gv_meshes/argoniannest/argoniantent02` | 6.14 × 5.31 × 4.26 | 1509 | pad (1.07) |
| `parcel.nine-trunks.pitch-rack` | `mudmother:gv_meshes/argoniannest/fishracksmall` | 2.48 × 2.65 × 2.53 | 1136 | plinth (0.19) |
| `landmark.nine-trunks.root-join-1..9` | `htbm:…/trees/histroots02` / `histroots03` | 14.43 × 10.30 × 6.20 / 9.56 × 2.54 × 4.71 | 1494 / 666 | landmark |
| `landmark.nine-trunks.gate` | `mudmother:gv_meshes/argoniannest/archwaysticks` | 5.10 × 4.60 × 2.73 | 422 | landmark |
| `landmark.nine-trunks.uxith` | `mudmother:gv_meshes/argoniannest/argoniantotem01` | 0.75 × 0.49 × 1.95 | 836 | landmark |
| `landmark.nine-trunks.chime-frame` | `mudmother:gv_meshes/argoniannest/argonianbonechime01` | 2.18 × 0.38 × 1.41 | 5132 | landmark |

Ring arithmetic, all from those numbers: at a 33 m radius the trunk centres are
22.6 m apart along the chord. Elder-to-neighbour clear gap is
22.6 − (24.63 + 14.78)/2 = **2.9 m**; neighbour-to-neighbour is
22.6 − 14.78 = **7.8 m**. The clearing inside the trunk faces is about 51 m
across. The ring walkway spans balcony to balcony over those gaps: per the kit's
own `snapLogic`, a run is a sum of `passl<len>` pieces (512 units = 7.28 m,
64 units = 0.91 m), so a 7.8 m span is one `passl512h64` plus one `passl64`
(8.19 m) trimmed at the balcony caps — no piece is invented and no form crosses
its accessory family.

**Budget.** Declared 700 instances / 36 unique materials / 40 texture MB / 300
colliders. The compiler reports 14 placements, 7 unique assets, 33 unique
materials, 60,517 triangles, within budget. The trunks and the deck carry most of
it; `kiosk01` alone is 14,048 triangles, which is the one thing to watch when
this grammar is repeated across 27 villages.

## 4. The geometry problem, and what changed

The catalogue's signature reads: *"Houses built between the nine trunks with the
trunks as their corner posts. No building here has four walls of its own."*
Measured against the kits, that composition **cannot be built honestly**. There
is no wall or roof panel in any kit authored to span from one trunk to another,
and there is no bare mid-size trunk column authored to stand alone and take
attachments: `settlement-root-v1` has only `treegiant01` (130 × 110 × 206 m, a
whole host tree) and `treegiantrootbase01` (41.6 × 21.3 × 44.0 m, a root flare),
and `housechamplianestronc` is an accessory liana drop for `housechamp001`, not a
free-standing trunk. Jamming a mud hut into a gap and calling the trunk its
corner post is exactly the composition the 2026-09-04 ruling forbids.

The nearest honest composition — and, on reflection, the better one — is to make
the trunks **and** the houses the same objects. `settlement-root-v1` packages
BM&V's tree-city as its authors built it: `housetronc001` and `housechamp001` are
trunks that have been trained into dwellings, each with its own door, window,
balcony and liana family. Nine of them in a ring gives nine trunks, nine houses,
and no building with four walls of its own — because every wall is trunk. It is
also the interior building idiom as `material-culture.md` states it: "the
interior does not *build* a house, it *trains* one." The root joins between them
are `htbm:…/histroots02`/`03`, packaged into the same kit set, so the
ground-level "one tree" reading uses pieces already combined by our own kit
build rather than by a reviewer's guess.

**Sourcing gap, reported not faked:** no kit contains a bare Hist trunk column
(roughly 3–8 m across, 15–30 m tall) that stands alone and accepts attachments.
Every village that wants trunks *without* houses in them — a grove, a stake-field
edge, a ruined ring — currently has to use a whole tree or a house form. That is
a real gap for the 27-village rollout and is owner question Q1.

## 5. Lore grounding

- Hist village form, the tree-minder's post and the naheesh who carries the Root
  Talk: `world/sources/lore/topics/hist-placement.md` § tribal Hist table and the
  Helstrom / Root Talk convocation row (owner decision Q2); UESP `Lore:Hist`,
  `Lore:Argonian`.
- The interior grown-root kit, the ban on wattle and reed inland, chimes at every
  threshold, totems of wood, mud and plumage:
  `world/sources/lore/topics/material-culture.md` § kit table and §
  `settlement-root-v1`.
- The nest (`uxith`) and its egg-tenders: `world/sources/lore/topics/hist-and-sap.md`.
- Type slots — the tree-minder's platform, chime frames, an unguarded food and
  reagent cache, the stake-field satellite 200–300 m off:
  `world/sources/catalogue/type-recipes.json` → `hist-village`.

## 6. Open questions for the owner

**Q1 — the trunks are houses, not scenery.** The record says houses were built
*between* nine trunks. No kit has a piece that spans between two trunks, so the
blueprint instead makes each trunk a house grown into it (nine of them in a ring).
*Implication:* the place still reads as nine trunks and a stockade, and no
building has four walls of its own, but the houses are 34 m tall and one is 56 m,
so the village has a real skyline instead of a low ring of huts. If you would
rather have low huts, we would need to source a stand-alone Hist trunk mesh from
the mod scene, which is a sourcing job and a delay.

**Q2 — foreign canvas outside the gate.** The rented pitch ground uses coastal
tent pieces from a different building culture, on the reasoning that the tents
belong to the visiting delegations and are carried in and struck each year.
*Implication:* the contrast makes the convocation instantly readable and gives the
pitch-rights quests something to point at, at the cost of one small patch of
non-interior material on the site. The alternative is renting bare prepared
decks from the interior kit — purer, but the "borrowed canvas" line in the
record goes.

**Q3 — how tight the ring is.** The trunks sit 22.6 m apart, which leaves 2.9 m
between the elder trunk and its neighbours and 7.8 m elsewhere, and gives a 51 m
clearing inside. *Implication:* tighter reads more like a stockade and makes the
inside feel enclosed and cramped, but the clearing gets too small for the
convocation crowd the place exists to host; wider opens the sightlines and the
"single mass" approach weakens. This is the number most worth an opinion, because
it becomes the default for all 27 villages.

**Q4 — 149 m off the plotted spot.** The chosen ground is a knoll 149 m from
where the map plot put the village, because the plotted ground has 4.33 m of
relief across the ring and would need grading we do not allow. *Implication:*
nothing else moves — same region, same danger, same neighbours — but the village
is now 160 m from the road instead of 241 m, so it is noticeably easier to
stumble on from the highway.

## 7. Catalogue record should change (not edited from here)

1. `vibe.signatureFeature` — "Houses built between the nine trunks with the
   trunks as their corner posts" is not buildable. Proposed: "Nine trunks trained
   into nine houses, standing in one ring. No building here has four walls of its
   own, because every wall is trunk." `playerPurpose.hook` needs the same change.
2. `vibe.materials` — "houses framed between the trunks using bark and root grown
   between them as walls" should become the trained-trunk idiom, and the
   "delegation shelters of borrowed canvas" line should say explicitly that the
   canvas is the visitors' own and stands outside the ring (it is currently the
   only thing licensing a second kit set here).
3. `assetPlan` — `vanilla-shackkit` and `fences-wattle` are coastal and should be
   dropped; the plan is `settlement-root` plus `hist-tree`, `argonian-props`,
   `totems-ritual` and `argonian-lights`, with `mud-mother-grove` retained only
   for the visiting delegations' canvas.
4. `positionM` / `position` — move to 4972.9, 3755.9 (uv 0.674, 0.510) if the
   owner approves Q4; `plotFacts.distanceToRouteM` becomes 162 and
   `distanceToWaterM` becomes 32.
5. `sockets` is empty in the record while the blueprint now carries nine. If the
   catalogue is meant to mirror them, the four scene/evidence/station/mark
   sockets above should be listed there.
6. `interior.kind` is `none`, but nine trunk-houses have doors and the blueprint
   declares nine interior claims. This should become the appropriate
   dwelling-interior kind for Phase 12.
