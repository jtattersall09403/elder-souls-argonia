# Mazzatun — meso design record (Phase 11 Part 6, Round A draft)

`place.dunmer-north.mazzatun` · heretic-stone-village · M3 · D3 (approach D4)
· dossier `world/sources/sites/dossiers/mazzatun.{json,md}`
· map `tooling/world-generation/output/blueprint-maps/place.dunmer-north.mazzatun.png`

Exemplar brief: a **stone kit on sloping ground**. The slope ladder (direct ·
plinth · pad · never grade at Δ ≥ 2 m → stilt, dug-in or re-site) is what this
record has to prove; the terrace scheme is a Part 6 decision recorded as
grade patches the compiler emits, never as raster edits.

## 1. The ground, and why the plotted point could not be used

The dossier over the plotted neighbourhood reports 369 m of relief inside a
400 m disc, a slope median of 28.6° and only 4.87 ha (10%) buildable. The plot
itself sits on the face of that relief.

| Candidate | positionM | Height | Slope | Δ across the core | Flood | Route | To the Hist | Verdict |
|---|---|---|---|---|---|---|---|---|
| `candidate.mazzatun.shelf` — the rock shelf | 1985.0, 1341.0 | 202.6 m | 20.6° (raster) | 1.9 m over 30 × 20 m; 6.5 m over 70 × 45 m | band 0, 4.1 m above the water table | 296 m to the Gideon–Stormhold road | 85 m, 55 m above it | **chosen** |
| `candidate.mazzatun.plot` — the plotted point | 1993.3, 1455.9 | 201.2 m | 46.9° | 24.0 m over 30 × 20 m | band 0 | 243 m | 138 m | rejected |
| `candidate.mazzatun.gorge` — the Hist's own floor | 2070.0, 1341.0 | 148.2 m | 32.1° | 6.5 m at best within 170 m | water depth 0.10 m, −0.12 m above the water table, river band 1 | 219 m | 0 m | rejected |

`candidate.mazzatun.plot` fails the ladder outright: Δ is over 2 m under every footprint
tested; the ladder forbids grading at that delta, so the answer is
to re-site rather than to flatten a hillside. `candidate.mazzatun.gorge` is the channel floor —
the sample returns standing water and a negative height above the water table,
so a stone works cannot stand there, however well it would suit the lore.

`candidate.mazzatun.shelf` is a real bench measured at 1 m spacing: **68 m east–west by 42 m
north–south**, between 198.3 m and 209.0 m, falling roughly 8.5 m from its
northern edge to its southern lip in three readable steps, with a headwater
stream along that southern lip (shore distance 3–8 m at z ≈ 1352–1360) and a
55 m escarpment on its eastern side dropping to the gorge where Tsono-Xuhil
stands. Every claim above was measured with `ProvinceSurvey.height_at` and
`sample`, not read off the region map.

The shelf also satisfies the record's siting preferences literally: ridge-end
landform, upland hills region, danger band 3, a stone source in its own
southern lip with a haul water along it, plus a neighbour relation of "raids its
neighbours for labour" served by a single haul road climbing from the east.

## 2. Districts — one kit set each

| District | Kit set | Ground | What it is |
|---|---|---|---|
| `district.mazzatun.pens` | `argonian-mud` (settlement-mud-v1) | upper step, 205–209 m | Mud shells, an oven, a rack and a fence for the taken labourers. They are not Xit-Xaht, so they are not permitted stone; the pens are the part of Mazzatun built the way the rest of the province builds. Overlooked from the works below. |
| `district.mazzatun.works` | `argonian-stone` (ruin-monumental-v1 + xanmeer-interior-v1) | middle step, 198–206 m | The half-built quarter: courses, frontage, the statue court, the watch column, the ceremonial stair, the stair-throat and the conduit head at the eastern lip. |
| `district.mazzatun.staging` | `neutral-works` (works-v1) | lower step and stream lip, 190–203 m | Block face, kiln, scaffold staging, hoist, haul gate and cart. |

The two-culture rule is kept by district, never blended.
Within `ruin-monumental-v1` there is a second, finer rule the kit's own description
imposes: it packages two authors' work (the IGS Ayleid exterior set and Here
There Be Monsters' xanmeer set). Those are different grids by different hands,
so this blueprint keeps them in **separate parcels that never abut** — the IGS
blocks, spans and stairs carry the terracing, the courses and the stairways,
and the one xanmeer piece still used, `pillar02`, carries the conduit head.

## 3. Terrace scheme

Seventeen of twenty-nine parcels sit at **pad** (Δ 0.00–1.75 m); twelve
at **dug-in**. Nothing is graded above 2 m and nothing is stilted:
this is dry rock, not marsh.

- **Pads** are the compiler's grade patches — target height taken from the
  maximum sample under the footprint, a 2.5× falloff ring, 0.7° residual tilt
  against shadow acne, base buried 0.25 m. They are data, applied at chunk
  rebuild; no raster in this repository is edited.
- **Dug-in** is the answer wherever the piece is itself a ground-working thing:
  the retaining blocks (`parcel.mazzatun.terrace-wall-a`, `parcel.mazzatun.terrace-wall-c`), the ceremonial
  stair throat and the flight beside it, the quarry face, the haul gate's
  footings, the watch column's base, the frontage dais and the statue court. Each is cut into its riser rather than
  standing on a flattened shelf.
- **The three risers are polygon geometry, not terrain.** The riser between the
  pens and the works is held by `parcel.mazzatun.terrace-wall-a` (`arquadblock01`, 6.37 ×
  6.37 × 1.82 m); the riser between the works and the staging yard
  by `parcel.mazzatun.terrace-wall-c` (`arquadblock02`, same extents). Heightfields cannot
  express a vertical, so a terrace wall is always a placed block course
  ray-sampled onto the terrain, never a cliff painted into the height grid.

## 3b. Orientation and footprints

Every parcel is authored as **where** (`centreUV`), **which piece**
(`assetRef`), **which way** (`yawDeg`, degrees clockwise from north) and **why
that way** (`orientationWhy`). The footprint is derived from the measured hull
and cannot be hand-edited. Orientation is read off the ground: the contour
bearing at each parcel's centre comes from four height samples 4 m apart, and
the fall line is its perpendicular.

| Terrace | Orientation logic | Bearings found |
|---|---|---|
| Pens (upper step, 206–208 m) | shells turned so the doorway wall — the flat panel on the shell's local southern face — looks downhill at the works; the fence and the racks run along the contour | fall 157–188°, contour 82–113° |
| Works (middle step, 198–206 m) | every course, retaining block and frontage runs **along the riser**, that is along the contour; the stair throat, the flight beside it and the statue court are set on the fall line, so the climb is short and the statues face whoever climbs | contour 74–108°, fall 165–196° |
| Staging (lower step and stream lip, 197–204 m) | the gate and the cart line up on the haul road, the cutting floor opens along the block face, the scaffold bays are squared to the courses that they serve and the hoist beam overhangs the fall | road 62°, contour 95–133° |

Two parcels are deliberately off their terrace's logic; both say so:
`parcel.mazzatun.pen-c` is swung across the slope with its door to the west,
behind the rise and out of sight of the works. `parcel.mazzatun.tower` is
turned to the haul gate and the escarpment lip rather than to any contour.

The tower's door sits on the edge that it faces: at the foot of the sunk stair
throat, on the piece's downhill face, bearing 165°, threshold taken from the
outline's own downhill vertex. It passes the compiler's reachability check.
The pens keep their door sides recorded in `notes` — the flat panel on the
shell's local southern face — without doors of their own, because the
catalogue record's `entranceCount` is 1; three pen interiors are a change
to that record, listed in §8.

## 4. Layout intent, signature and sockets

The city reads from the east, which is the only approach: the haul road climbs
the escarpment, passes the **haul gate** (`walkwaycwallgate02`, 14.9 × 5.2 ×
10.0 m, dug-in footings) into the staging yard, then turns up the **ceremonial
stair** onto the works terrace, then up again to the pens. Three steps on one
processional line. Each step is a different material.

**The signature feature is the conduit run.** Amber tubes leave Tsono-Xuhil
on the gorge floor at 148 m, climb 55 m of escarpment, crest the lip
at `landmark.mazzatun.conduit-head` (`pillar02`, 1.72 × 1.72 × 9.31 m, the tallest thin thing
on the lip), pass through `parcel.mazzatun.conduit-column` (`arcolumn02`, 4.16 × 4.16 × 5.14 m)
and run west into the works along the causeway. The point the record makes is
made by geometry alone: the sap climbs *away* from the tree and into the
labour. It is authored as `canal.mazzatun.conduit`, a 1.2 m channel of six points.

**The stair-throat** is `parcel.mazzatun.stair-throat` (`arspiralstairs01`, 9.2 × 9.2 ×
3.5 m, dug-in, Δ 1.77 m) on the works terrace — a cut stair down into the root
cavern under the ridge, which is where the record's S3 root-cavern interior and
`scene.mazzatun.the-conduit-room` sit. It carries the blueprint's single door,
matching the record's `entranceCount: 1`. Putting it on the terrace rather than
at the tree's feet keeps it reachable: the escarpment is a 38° average grade
and a door at its foot would fail reachability every compile.

Sockets, all placed on parcels:

| Record socket | Blueprint socket | Where |
|---|---|---|
| `scene.mazzatun.the-conduit-room` | `socket.mazzatun.conduit-room` | `parcel.mazzatun.stair-throat` |
| `evidence.mazzatun.the-half-cut-blocks` | `socket.mazzatun.half-cut-blocks` | `parcel.mazzatun.half-cut-blocks` (`arrubblepile03`, 10.2 × 7.9 × 8.4 m) |
| `station.mazzatun.shaper` | `socket.mazzatun.shaper` | `parcel.mazzatun.tower` (`ararchcolumn02`, 1.9 × 6.3 × 12.4 m) |
| `marks.mazzatun.xit-xaht-mark` | `socket.mazzatun.xit-xaht-mark` | `parcel.mazzatun.statue-court` (`arstatuebase01`, 11.83 × 11.83 × 3.68 m) |
| LV29, the carver | `socket.mazzatun.carver` | `parcel.mazzatun.cutting-floor` |
| LV30, the walkway keeper | `socket.mazzatun.walkway-keeper` | `parcel.mazzatun.scaffold-stair` |
| LV28, the rite | `socket.mazzatun.conduit-head` | the lip at 2016, 1342 |
| LV26, the sibling Hist | `socket.mazzatun.hist-overlook` | the lip at 2016, 1346, looking down on the crown |

Clearance: a hard clear over the whole built shelf (1948–2018 by 1318–1360 m),
a thinned ring 10 m wider on each side, with three kept features: Tsono-Xuhil
itself, a shade tree on the western edge and the reed bed on the stream lip.

## 5. Asset picks (measured, never named)

Every pick is made on the measured ground hull
in `tooling/asset-pipeline/output/kits/<kit>.footprints.json`; the parcel's
polygon is that hull, rotated by the authored yaw
(`worldgen.blueprint_footprints --apply`). Δ is the compiler's own measure:
the height range over every vertex of the real outline plus the centre.

| Parcel | District | Asset | Measured ground hull (m) | Height (m) | Yaw | Δ (m) | Fit |
|---|---|---|---|---|---|---|---|
| `parcel.mazzatun.conduit-column` | works | `arcolumn02` | 4.2 × 4.2 | 5.1 | 271.4° | 1.14 | pad |
| `parcel.mazzatun.conduit-pillar` | works | `pillar02` | 1.7 × 1.7 | 9.3 | 271.4° | 0.91 | pad |
| `parcel.mazzatun.course-e1` | works | `arbridge03` | 9.7 × 7.0 | 9.0 | 81.8° | 3.77 | dug-in |
| `parcel.mazzatun.course-n1` | works | `arbridge01` | 12.8 × 7.0 | 8.9 | 352.5° | 1.75 | pad |
| `parcel.mazzatun.course-n2` | works | `arquadblock01` | 6.4 × 6.4 | 1.8 | 6.7° | 1.15 | pad |
| `parcel.mazzatun.course-w1` | works | `arblock03` | 2.7 × 2.7 | 0.9 | 319.5° | 2.51 | dug-in |
| `parcel.mazzatun.cutting-floor` | staging | `mineoreiron01` | 7.2 × 7.3 | 1.7 | 42.8° | 2.13 | dug-in |
| `parcel.mazzatun.gate-frontage` | works | `arsteppeddias01` | 9.3 × 9.3 | 1.2 | 344.1° | 4.01 | dug-in |
| `parcel.mazzatun.great-stair` | works | `arplatwallstair02` | 3.6 × 3.6 | 0.9 | 353.6° | 1.25 | dug-in |
| `parcel.mazzatun.half-cut-blocks` | works | `arrubblepile03` | 10.2 × 7.9 | 8.4 | 76.0° | 1.73 | pad |
| `parcel.mazzatun.haul-cart` | staging | `handcart01` | 1.3 × 2.2 | 1.4 | 233.7° | 1.06 | pad |
| `parcel.mazzatun.haul-gate` | staging | `walkwaycwallgate02` | 14.9 × 5.2 | 10.0 | 62.0° | 6.67 | dug-in |
| `parcel.mazzatun.hoist` | staging | `minescaffoldbasesupportw01` | 3.7 × 3.8 | 2.7 | 208.2° | 1.72 | pad |
| `parcel.mazzatun.kiln` | staging | `smelter01` | 2.8 × 3.1 | 2.6 | 18.4° | 1.41 | pad |
| `parcel.mazzatun.pen-a` | pens | `mudhut01` | 5.9 × 6.5 | 5.1 | 7.6° | 1.06 | pad |
| `parcel.mazzatun.pen-b` | pens | `mudhut01` | 5.9 × 6.5 | 5.1 | 336.8° | 1.29 | pad |
| `parcel.mazzatun.pen-c` | pens | `mudhut01` | 5.9 × 6.5 | 5.1 | 90.0° | 1.90 | dug-in |
| `parcel.mazzatun.pen-fence` | pens | `argonianfence01` | 1.6 × 0.3 | 1.7 | 1.3° | 0.00 | pad |
| `parcel.mazzatun.pen-oven` | pens | `carapaceoven` | 3.5 × 2.3 | 1.4 | 137.7° | 1.16 | pad |
| `parcel.mazzatun.pen-rack` | pens | `fishracksmall` | 2.5 × 2.6 | 2.5 | 325.7° | 1.31 | pad |
| `parcel.mazzatun.scaffold-a` | staging | `stockadescaffoldbase4sided01` | 3.7 × 3.8 | 2.7 | 320.5° | 1.00 | pad |
| `parcel.mazzatun.scaffold-b` | staging | `stockadescaffoldbase4sided01` | 3.7 × 3.8 | 2.7 | 12.1° | 1.35 | pad |
| `parcel.mazzatun.scaffold-c` | staging | `stockadescaffoldbase2sided01` | 3.7 × 3.8 | 2.7 | 9.2° | 0.21 | pad |
| `parcel.mazzatun.scaffold-stair` | staging | `stockadescaffoldstairs01` | 3.6 × 3.5 | 3.5 | 341.2° | 0.32 | pad |
| `parcel.mazzatun.stair-throat` | works | `arspiralstairs01` | 9.2 × 9.2 | 3.5 | 345.4° | 1.77 | dug-in |
| `parcel.mazzatun.statue-court` | works | `arstatuebase01` | 11.8 × 11.9 | 3.8 | 341.4° | 2.29 | dug-in |
| `parcel.mazzatun.terrace-wall-a` | works | `arquadblock01` | 6.4 × 6.4 | 1.8 | 353.2° | 2.27 | dug-in |
| `parcel.mazzatun.terrace-wall-c` | works | `arquadblock02` | 6.4 × 6.4 | 1.8 | 5.2° | 1.04 | dug-in |
| `parcel.mazzatun.tower` | works | `ararchcolumn02` | 1.9 × 6.3 | 12.4 | 76.5° | 1.57 | dug-in |

Budget, declared and measured: 29 instances against a ceiling of 80. The
compile reports **0 errors**.

The scaffold parcels follow `works-v1`'s own `snapLogic`: a
`stockadescaffoldbase<n>sided01` footing carries a matching
`stockadescaffoldtop<n>sided01` deck, decks join by `bridge01/02`, and
`stairs01` climbs them. Side counts are kept consistent per platform — the
four-sided bases stand alone, the two-sided base abuts the terrace wall, where
a railing would be redundant.

### 5b. Five picks that the real outlines forced out

The re-authoring measured what each piece actually is; five earlier picks
did not survive it.

| Was | Now | Why |
|---|---|---|
| `wallstraight`, `wallcorner01` (HTBM xanmeer) | `arbridge01`, `arbridge03`, `arquadblock01`, `arblock03` | their measured hulls sit 449 m and 1,788 m from the pivot, so no outline can be attributed to a placed position — the same defect as `nodeAmbiguous` |
| `blockslargepile` (HTBM) | `arrubblepile03` | hull 656 m off the pivot |
| `arstatuewall01` | `arsteppeddias01` | hull 8.8 m off the pivot, which put the compiler's height sample off the terrace and Δ at 3.84 m |
| `arstairscenter01`, `arstairsside01` | `arspiralstairs01`, `arplatwallstair02` | hulls 19.0 m and 16.1 m off the pivot |
| `artower01` | `ararchcolumn02` | hull 4.6 m off the pivot; the arch column stands 12.4 m, so the watch post keeps its height |

Only pieces whose hull sits within about 2 m of the pivot are now used, which
is the honest reading of "the outline is where the building is". The four wall
courses are therefore an arched span, a second span, a corner block and one
laid block: a course rising, not a finished wall — which is what the place is.

## 6. Lore

- **UESP Lore:Mazzatun**, **Lore:Xit-Xaht**, **Lore:Duskfall**, **Lore:Hist
  Sap**, **Online:Tsono-Xuhil**, **Online:The Ruins of Mazzatun**, as recorded
  in `world/sources/lore/tribes.md` §Xit-Xaht,
  `topics/hist-and-sap.md` §Amber Plasm, `topics/hist-placement.md` §Mad,
  `topics/history-timeline.md` §Duskfall, `regions/shadowfen.md`,
  `regions/secondary-settlements.md` and
  `extrapolation/settlement-register.md` §Mazzatun.
- Fixed by the sources and honoured here: the tribe never stopped building in stone
  under a Hist it bound with sap; it raided neighbours for slave labour (the
  Su-Zahleel were taken wholesale), which is what `district.mazzatun.pens` is; the Hist weeps
  Amber Plasm, which is chaotic creatia leaking through it, which is what the
  conduits carry; the elders put Tsono-Xuhil into a convalescent sleep at the
  end of the Second Era. The catalogue's extrapolation — three and a half
  centuries later, the seep has resumed and the work has restarted, is owner
  question Q8 option B, already settled
  in `extrapolation/owner-questions.md`.
- The "Puzzle City" epithet (cramped walls, twisted halls, dead ends) is an
  **interior** property. It belongs to the root-cavern
  behind `door.dunmer-north.mazzatun.1` in Phase 12, not to this exterior, which is
  three open terraces by design.
- `docs/research/xanmeer-mesoamerican-reference.md` §2 supplies the precinct
  form followed here: a plaza composition on stepped platforms with a
  processional axis, not a lone monument.

## 7. Open questions for the owner

Re-read 2026-09-05 against the measured outlines, which changed two of the four.

1. **A finished pyramid, or a building site?** *Unchanged, and now harder.* The
   three pyramid statics measure 34 × 22 m, 68 × 65 m and 69 × 65 m; the shelf
   is 68 × 42 m, so even the smallest swallows the terrace and leaves no room
   for the scaffolds, the block face or the pens — the things that say "still
   being built". The re-authoring adds a second reason: the flat wall pieces
   that would have made a finished frontage are unusable (§5b), so a "finished"
   Mazzatun would have to be one giant static and nothing else. This draft
   therefore builds the works from spans, blocks, a dais, stairs and a column:
   courses rising. The alternative is the 34 m static here and everything else
   pushed onto worse ground, or a move of about 220 m east onto a valley flat,
   which breaks the record's ridge-end landform.
2. **How far below the city should the tree be?** *Unchanged.* Tsono-Xuhil sits
   85 m east and 55 m below, so the approach looks down onto the crown rather
   than into a city built around a tree. Either keep it, so that the conduits
   climbing 55 m of cliff become the strongest image here, or move the tree up
   to the stream head at the southern lip, at the cost of the waterfall
   landform on which its own record was won.
3. **How visible should the pens be?** *Answered in the geometry, and it is now
   both.* Two shells are turned downhill with their doorway walls to the works,
   so arrival shows people in mud huts working for people in stone; the third
   is swung across the slope behind the northern rise, out of sight until the
   climb. The statement and the reveal are both on the ground; the split
   is authored in `orientationWhy`. Confirm, or make all three one way.
4. **Should the haul road be walkable, or a winch?** *Sharpened.* The gate and
   the cart are now authored on the road's own bearing of 62°, so the approach
   is a straight run through the gate with no turn under load — which reads as
   a road, not a winch. The hoist beam still overhangs the fall over the block
   face. If the winch reading is wanted instead, the gate parcel loses its
   reason and should be re-authored facing the stair.

## 8. Notes for the catalogue and kit records (not edited from here)

- `place.dunmer-north.mazzatun.positionM` should move from `[1993.3, 1455.9]`
  to `[1985.0, 1341.0]` (uv `0.269207, 0.181867`), with `plotFacts` re-measured:
  distance to route 296 m, distance to water 8 m, elevation 202.6 m.
  `whySiteWon` should record that the plotted point was re-sited on ground
  measurement rather than graded.
- The record carries no `terrainRequests`. It should gain one: a **rock-shelf
  / bare upland ground** request over the built area (1948–2018 by 1318–1360 m)
  with a trodden haul line down the eastern escarpment, so the ground material
  reads as quarried rather than as jungle floor under a stone city.
- `sitingPrefs.hardConstraints` should gain "a shelf of at least 60 × 40 m
  of ground at under 15° of local fall", which is what this siting actually needed
  and what the next stone place will need too.
- If the pens are to be enterable, `entranceCount` must rise from 1 to 4. The
  three shells are already oriented for it: each `notes` line names the door
  side; `parcel.mazzatun.pen-c` was re-sited so a west-facing threshold
  stands on walkable ground rather than on a 56° riser.
- `assetPlan` lists `pyramid-statics`. If open question 1 is answered in favour
  of the building-site reading, that entry should become
  `xanmeer-frontage-statics`, because no pyramid static fits this ground.
- `tooling/asset-pipeline/pipeline/config/kits/ruin-monumental-v1.json` says
  the kit "is for RUINS only and must never mix with a settlement kit".
  Mazzatun is the sources' single live exception — a settlement being built in stone
  now — and the `argonian-stone` kit set exists for it. The kit description
  should name that exception so the next agent does not read the rule as a
  prohibition and quietly re-site the place.

## 9. Open items on the compiler (found while building this, not faked around)

- **Yaw is randomised, not authored.** `compile_settlement` sets each
  placement's yaw from a seeded quarter-turn and ignores the parcel footprint's
  orientation. For a terraced stone city where a wall course must run along a
  riser, orientation is load-bearing. **Delivered 2026-09-05:** `yawDeg` and `orientationWhy` are required on every
  parcel, the compiler honours them and no longer snaps to a grid; every
  one of these 29 parcels now carries an authored bearing with a reason taken
  from the ground (§3b). The square-margin footprints are gone: the polygon is
  the measured hull.
- **Door reachability uses the coarse slope raster.** The shelf reads 39–45°
  in `slope_grid` while its measured fall is about 11° over 40 m, so a door
  on genuinely walkable ground fails the 30° test unless its parcel is a pad.
  `parcel.mazzatun.stair-throat` was a pad partly for that reason; it is dug-in now
  and its door still passes. **Done the same day:** the
  check now measures the local gradient from four height samples 2 m
  around the threshold instead of reading the raster cell.
