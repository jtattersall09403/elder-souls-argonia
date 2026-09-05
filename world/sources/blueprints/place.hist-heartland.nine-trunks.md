# Nine-Trunks — meso design record (Phase 11 Part 6)

`place.hist-heartland.nine-trunks` · Hist village, M3, speaking-Hist variant, D3,
fringe marsh · blueprint `place.hist-heartland.nine-trunks.json` · dossier
`world/sources/sites/dossiers/nine-trunks.{json,md}` · map
`tooling/world-generation/output/blueprint-maps/place.hist-heartland.nine-trunks.png`

This is the exemplar for the province's commonest settlement family (27 tribal
villages), so every rule below is written to generalise.

## 1. Candidate sitings

Plotted position 4937.9, 3610.9 m. The signature is a ring of trunks, so the test
that each candidate had to pass was relief measured **around that ring**,
not slope at a point: nine trunk footprints have to sit inside the ground-fit
ladder; the compiler never grades a delta of 2 m or more.

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
encloses firm ground*. `candidate.nine-trunks.bank` is the flattest and the
nearest to the road, but its shoreline runs 10 m from the centre, so the western
third of a ring would stand in water; it cannot deliver what the
place exists to provide. `candidate.nine-trunks.plot` carries 4.33 m of relief across the
ring, which puts several trunks past the no-grading limit — the macro plot chose
at map resolution and could not see it. Danger band, region class, culture
territory and landform are unchanged from the plot, so nothing derived upstream
moves.

**Note on the numbers above (redraft, 2026-09-05).** Those figures were measured
over a 66 m ring, the first draft's radius. The redrafted ring is 42 m wide
on a 21 m radius; re-measuring the knoll on that circle gives 1.78 m of relief
(2.89 m to 4.67 m, centre 3.77 m). Every ground fit falls out as a pad or a
plinth; nothing needs a dug-in flare. The ranking of the three candidates
does not change; the tighter ring makes the knoll a safer choice than it was.

## 2. High-level design (redrafted 2026-09-05)

**What changed and why the ring is now buildable.** The record's original
intent — low houses standing *between* nine trunks — was reported in the first
draft as unbuildable, because no kit held a bare trunk column. That gap is now
closed: `settlement-root-v1` carries `tropical:landscape/trees/anvilgianttrunk`,
a crownless column of 10.53 × 10.53 × 56.39 m at scale 1, base-anchored,
with `anvil_root01` as the root-flare skirt that its own author packaged with it
(`docs/research/settlement-kit-sourcing-log.md`, gap G1). At a uniform scale
of 0.45 the column measures 4.74 m across and 25.4 m tall, which is the brief the
record always described. The blueprint is therefore redrafted as the record
reads: nine trunks in a ring, low huts in the gaps between them.

**Layout intent.** One ring, one clearing, one gate. Nine trunk columns stand
on a 21 m radius at 40° spacing, so the chord between neighbours is 14.37 m and the
clear gap between trunk faces is 9.63 m (9.11 m either side of the elder trunk,
which is scaled to 0.55 and stands 5.79 m across and 31 m tall). A hut
of 5.92 × 6.47 m sits in each of those gaps with roughly 1.8 m of ground either
side, so the wall line reads as one closed mass from outside. Eight of the nine
gaps are built; the ninth, on the south-west arc facing the road, is the gate,
and holds only the stick arch. The naheesh's house is the exception: it stands
inside the ring at the foot of the elder trunk, drawn back off the wall line so
that the elder trunk is not hidden behind a gable. Root swells lie outside the
wall line on a 27.5 m radius, one per gap, along the ring — the ground-level
join that makes the tribe's argument visible from the approach.

**Districts** (one kit set each; the two-culture rule holds):

| District | Kit set | What |
|---|---|---|
| `district.nine-trunks.ring` | `argonian-mud` (`settlement-mud-v1`) | eight wall huts, the naheesh's house, the tree-minder's platform, the gate arch, the nest totem, the chime frame |
| `district.nine-trunks.pitch` | `argonian-mud` (`settlement-mud-v1`) | the rented pitch ground: two delegation shelters and a drying rack |

The ring is now a **mud** district, not a root district; that is the honest
consequence of the redraft. The trunk columns and their root flares are
*landmarks*, not parcels: no piece is attached to them and none spans
between them; no piece is asked to do work that its author never authored. The
dwellings are the mud kit's own low huts, the one set holding a
house that fits a 9.63 m gap. The interior kit rule
in `world/sources/lore/topics/material-culture.md` reads on wattle-and-daub and reed
weave inland; the huts here are mud over a stick frame; the ring's own timber
is the Hist, which is never cut. That reading is put to the owner as Q2.

**Signature feature.** Nine trunks in one ring, root-joined at ground level,
with the dwellings built in the gaps between them and no dwelling standing free of a
trunk on either side.

**What is kept.** All nine trunks are `kept` vegetation of kind `hist-tree`. Hard
clearance is a 27 m disc over the ring, the pitch ground and a corridor along the
road spur; everything out to 95 m is thinned rather than cleared, so that the
ring stays hidden until the approach reaches it.

**Sockets, variants and quest needs** are unchanged from the first draft,
with three positions moved onto the redrafted geometry: `socket.nine-trunks.root-join`
now sits on the root swell outside the eastern gap,
`socket.nine-trunks.identity-case` moves to the naheesh's house; the pitch
sockets sit on the pitch ground beside the gate.

## 3. Asset picks, on measured geometry

Sizes are the measured `widthM × depthM × heightM`
from `tooling/asset-pipeline/output/kits/*.footprints.json`, before scale.

| Object | Asset | Measured (m) | Scale | Result (m) |
|---|---|---|---|---|
| `landmark.nine-trunks.trunk-1` (elder) | `tropical:landscape/trees/anvilgianttrunk` | 10.53 × 10.53 × 56.39 | 0.55 | 5.79 wide, 31.0 tall |
| `landmark.nine-trunks.trunk-2..9` | `tropical:landscape/trees/anvilgianttrunk` | 10.53 × 10.53 × 56.39 | 0.45 | 4.74 wide, 25.4 tall |
| `landmark.nine-trunks.root-join-1..9` | `tropical:landscape/trees/anvil_root01` | 14.44 × 10.29 × 6.20 | 0.45 | 6.50 × 4.63 × 2.79 |
| `parcel.nine-trunks.house-1..8` | `mudmother:gv_meshes/argoniannest/mudhut01` | 5.92 × 6.47 × 5.09 | 1 | in a 9.63 m gap |
| `parcel.nine-trunks.naheesh-house` | `bmv:architecture/huts/exterior/hutexterior` | 11.62 × 11.62 × 7.18 | 1 | inside the ring, 11 m from the centre |
| `parcel.nine-trunks.minder-deck` | `mudmother:gv_meshes/argoniannest/argonianplatform` | 2.79 × 2.68 × 0.34 | 1 | a raised post, not a hall |
| `parcel.nine-trunks.pitch-1` / `pitch-2` | `argoniantent01` / `argoniantent02` | 8.20 × 7.00 × 5.95 / 6.14 × 5.31 × 4.26 | 1 | on the pitch ground |
| `parcel.nine-trunks.pitch-rack` | `mudmother:gv_meshes/argoniannest/fishracksmall` | 2.48 × 2.64 × 2.53 | 1 | at the pitch-ground mouth |
| `landmark.nine-trunks.gate` | `mudmother:gv_meshes/argoniannest/archwaysticks` | 5.10 × 4.61 × 2.73 | 1 | 5.10 m of a 9.63 m gap |

Every rotated footprint was tested against every other, trunk columns and root
flares included: no two objects on the site overlap. The compiler reports 14
placements, 7 unique assets, 14 unique materials and 29,847 triangles, inside the
declared budget of 700 instances and 300 colliders. The redraft costs roughly
half the triangles of the first draft, because the 14,048-triangle kiosk and the
55 m trunk-houses are gone.

## 4. Orientation and footprints

Each parcel is authored as a centre, an asset, a `yawDeg` and an `orientationWhy`; its
polygon is derived by `worldgen.blueprint_footprints --apply`. The door side
of `mudhut01` and of `hutexterior` is taken as the piece's local north face, so a
parcel's `yawDeg` is the bearing that its door faces; the same convention is
recorded on both districts in the blueprint.

| District | Orientation logic |
|---|---|
| `district.nine-trunks.ring`, wall huts | Each hut sits in the gap between two trunks and turns its long side to the ring's tangent there, so its yaw is the gap's bearing plus 180° and every door opens inward to the clearing. The ring is the stockade, so nothing opens outward. Eight gaps, eight distinct rotations: 200°, 240°, 280°, 320°, 0°, 80°, 120°, 160°. |
| `district.nine-trunks.ring`, naheesh's house | Turned to 207°, the bearing from its own centre to the gate, so that the naheesh sees an arriving delegation the length of the clearing. |
| `district.nine-trunks.ring`, tree-minder's platform | Turned to 140° to face the elder trunk across the clearing, because the post exists to watch that trunk. |
| `district.nine-trunks.ring`, landmarks | Each trunk column carries the ring's tangent as its yaw so that its bark relief runs along the wall line; each root flare carries the same tangent, so the swell lies between two trunk bases rather than across the path. The gate arch is squared to the road spur at 220°. |
| `district.nine-trunks.pitch` | The larger shelter opens down the road spur at 35°, the smaller one turns across the fall of the ground at 52° so that its canvas sheds run-off away from the road. The rack turns its open face to the approach so that what a delegation has paid for hangs in view of the next party up the road. |

Doors: nine, one per dwelling, each on the face that its reason claims. The eight
wall doors sit 3.5 m inside the ring radius on the hut's inward face; the
naheesh's door sits 5.9 m from its centre on the gate side. The validator checks
each `facingDeg` against the nearest edge of the derived polygon, so a door
cannot claim a side that the building does not have.

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

**Q1 — low huts between sourced trunk columns, or trunk-houses.** The draft is
the record as written: nine bare trunk columns from the newly sourced tropical
set, scaled to 4.7 m across and 25 m tall, with low mud huts of 5.9 × 6.5 m
filling the gaps between them. *Implication:* the village reads as a ring
of posts with a low wall of huts under it; the tallest thing on the site is a
tree rather than a house. The alternative, which was the first draft, is BM&V's
trunk-houses (`housetronc001` at 24.6 m across and 55.5 m tall, `housechamp001`
at 14.8 m and 34.4 m): trunks that have been trained into dwellings, so that the
trunks *are* the houses. That version gives the place a real skyline and a
grown-root material culture, at the cost of nine 34 m towers in a 27-village
family and roughly twice the triangles. The two readings cannot be mixed, because
a district takes one kit set.

**Q2 — a mud district inside a Hist ring.** Because the dwellings are mud-kit
huts, the ring district is `argonian-mud` rather than `argonian-root`. The trunks
stay as landmarks, so nothing is blended and nothing is jammed together.
*Implication:* the ring is materially the same as every other inland village,
and the trunks alone carry its distinctiveness. The alternative is Q1's
trunk-house version, which is the single way to make the ring itself a root-kit
district.

**Q3 — how tight the ring is.** The trunks stand 14.37 m apart along the chord,
which leaves 9.63 m between trunk faces and a clearing roughly 35 m wide.
*Implication:* tighter reads more like a stockade and hides the inside
completely, but the clearing then cannot hold the convocation crowd that the
place exists to host; wider opens the sightlines; the single-mass approach
weakens. This is the number most worth an opinion, because it becomes the
default for all 27 villages.

**Q4 — 149 m off the plotted spot.** Unchanged from the first draft: the chosen
ground is a knoll 149 m from the map plot, because the plotted ground carries
4.33 m of relief across the ring and would need grading that the rules forbid.
*Implication:* the region, the danger band and the neighbours are unchanged, but
the village now stands 160 m from the road instead of 241 m.

## 7. Catalogue record should change (not edited from here)

1. `vibe.signatureFeature` and `vibe.materials` may now stand as written. The
   redraft delivers houses between the nine trunks; the trunks carry the
   wall line either side of every hut, so the record's own language is honest
   against the geometry. One qualification: no hut is *framed into* a trunk, so
   any phrasing that promises a shared structural wall should read as houses
   filling the gaps between the trunks.
2. `assetPlan` — `vanilla-shackkit` and `fences-wattle` are coastal and should be
   dropped. The plan is `mud-mother-grove` for the huts, shelters, arch, totem
   and chime, plus the tropical trunk set for the nine columns and their root
   flares, plus `hist-tree` and `argonian-lights`.
3. `positionM` / `position` — move to 4972.9, 3755.9 (uv 0.674, 0.510) if the
   owner approves Q4; `plotFacts.distanceToRouteM` becomes 162 and
   `distanceToWaterM` becomes 32.
4. `sockets` is empty in the record while the blueprint carries nine. If the
   catalogue is meant to mirror them, the scene, evidence, station and mark
   sockets should be listed there.
5. `interior.kind` is `none`, but the blueprint declares nine interior claims —
   eight small huts and the naheesh's medium house. This should become the
   appropriate dwelling-interior kind for Phase 12.
