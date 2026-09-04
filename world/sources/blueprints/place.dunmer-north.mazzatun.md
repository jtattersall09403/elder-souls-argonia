# Mazzatun — meso design record (Phase 11 Part 6, Round A draft)

`place.dunmer-north.mazzatun` · heretic-stone-village · M3 · D3 (approach D4)
· dossier `world/sources/sites/dossiers/mazzatun.{json,md}`
· map `tooling/world-generation/output/blueprint-maps/place.dunmer-north.mazzatun.png`

Exemplar brief: a **stone kit on sloping ground**. The slope ladder (direct ·
plinth · pad · never grade at Δ ≥ 2 m → stilt, dug-in or re-site) is what this
record has to prove, and the terrace scheme is a Part 6 decision recorded as
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
tested, and the ladder forbids grading at that delta, so the answer is to
re-site rather than to flatten a hillside. `candidate.mazzatun.gorge` is the channel floor —
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
southern lip and a haul water along it, and a neighbour relation of "raids its
neighbours for labour" served by a single haul road climbing from the east.

## 2. Districts — one kit set each

| District | Kit set | Ground | What it is |
|---|---|---|---|
| `district.mazzatun.pens` | `argonian-mud` (settlement-mud-v1) | upper step, 205–209 m | Mud shells, an oven, a rack and a fence for the taken labourers. They are not Xit-Xaht, so they are not permitted stone; the pens are the one part of Mazzatun built the way the rest of the province builds. Overlooked from the works below. |
| `district.mazzatun.works` | `argonian-stone` (ruin-monumental-v1 + xanmeer-interior-v1) | middle step, 198–206 m | The half-built quarter: courses, frontage, the statue court, the tower, the ceremonial stair, the stair-throat and the conduit head at the eastern lip. |
| `district.mazzatun.staging` | `neutral-works` (works-v1) | lower step and stream lip, 190–203 m | Block face, kiln, scaffold staging, hoist, haul gate and cart. |

The two-culture rule is kept by district, never blended. Within
`ruin-monumental-v1` there is a second, finer rule the kit's own description
imposes: it packages two authors' work (the IGS Ayleid exterior set and Here
There Be Monsters' xanmeer set). Those are different grids by different hands,
so this blueprint keeps them in **separate parcels that never abut** — the IGS
blocks and stairs carry the terracing and the stairways, the xanmeer walls,
corner and pillar carry the frontage and the conduit head.

## 3. Terrace scheme

Eighteen of twenty-nine parcels sit at **pad** (Δ 0.6–2.0 m); eleven at
**dug-in** (Δ ≥ 2.0 m). Nothing is graded above 2 m and nothing is stilted:
this is dry rock, not marsh.

- **Pads** are the compiler's grade patches — target height taken from the
  maximum sample under the footprint, a 2.5× falloff ring, 0.7° residual tilt
  against shadow acne, base buried 0.25 m. They are data, applied at chunk
  rebuild; no raster in this repository is edited.
- **Dug-in** is the answer wherever the piece is itself a ground-working thing:
  the retaining blocks (`parcel.mazzatun.terrace-wall-a`, `parcel.mazzatun.terrace-wall-c`), the ceremonial
  stair, the quarry face, the block pile, the haul gate's footings, the tower's
  base, the statue court's platform. Each is cut into its riser rather than
  standing on a flattened shelf.
- **The three risers are polygon geometry, not terrain.** The riser between the
  pens and the works is held by `parcel.mazzatun.terrace-wall-a` (`arquadblock01`, 6.37 ×
  6.37 × 1.82 m); the riser between the works and the staging yard by
  `parcel.mazzatun.terrace-wall-c` (`arquadblock02`, same extents). Heightfields cannot
  express a vertical, so a terrace wall is always a placed block course
  ray-sampled onto the terrain, never a cliff painted into the height grid.

## 4. Layout intent, signature and sockets

The city reads from the east, which is the only approach: the haul road climbs
the escarpment, passes the **haul gate** (`walkwaycwallgate02`, 14.9 × 5.2 ×
10.0 m, dug-in footings) into the staging yard, then turns up the **ceremonial
stair** onto the works terrace, then up again to the pens. Three steps, one
processional line, and each step is a different material.

**The signature feature is the conduit run.** Amber tubes leave Tsono-Xuhil on
the gorge floor at 148 m, climb 55 m of escarpment, crest the lip at
`landmark.mazzatun.conduit-head` (`pillar02`, 1.72 × 1.72 × 9.31 m, the tallest thin thing on
the lip), pass through `parcel.mazzatun.conduit-column` (`arcolumn02`, 4.16 × 4.16 × 5.14 m)
and run west into the works along the causeway. The point the record makes is
made by geometry alone: the sap climbs *away* from the tree and into the
labour. It is authored as `canal.mazzatun.conduit`, a 1.2 m channel of six points.

**The stair-throat** is `parcel.mazzatun.stair-throat` (`arstairscenter01`, 3.64 × 7.31 ×
4.75 m, pad, Δ 1.91 m) on the works terrace — a cut stair down into the root
cavern under the ridge, which is where the record's S3 root-cavern interior and
`scene.mazzatun.the-conduit-room` sit. It carries the blueprint's single door,
matching the record's `entranceCount: 1`. Putting it on the terrace rather than
at the tree's feet keeps it reachable: the escarpment is a 38° average grade
and a door at its foot would fail reachability every compile.

Sockets, all placed on parcels:

| Record socket | Blueprint socket | Where |
|---|---|---|
| `scene.mazzatun.the-conduit-room` | `socket.mazzatun.conduit-room` | `parcel.mazzatun.stair-throat` |
| `evidence.mazzatun.the-half-cut-blocks` | `socket.mazzatun.half-cut-blocks` | `parcel.mazzatun.half-cut-blocks` (`blockslargepile`, 22.9 × 4.66 × 3.21 m) |
| `station.mazzatun.shaper` | `socket.mazzatun.shaper` | `parcel.mazzatun.tower` (`artower01`, 6.55 × 6.55 × 23.16 m) |
| `marks.mazzatun.xit-xaht-mark` | `socket.mazzatun.xit-xaht-mark` | `parcel.mazzatun.statue-court` (`arstatuebase01`, 11.83 × 11.83 × 3.68 m) |
| LV29, the carver | `socket.mazzatun.carver` | `parcel.mazzatun.cutting-floor` |
| LV30, the walkway keeper | `socket.mazzatun.walkway-keeper` | `parcel.mazzatun.scaffold-stair` |
| LV28, the rite | `socket.mazzatun.conduit-head` | the lip at 2016, 1342 |
| LV26, the sibling Hist | `socket.mazzatun.hist-overlook` | the lip at 2016, 1346, looking down on the crown |

Clearance: a hard clear over the whole built shelf (1948–2018 by 1318–1360 m),
a thinned ring 10 m wider on each side, and three kept features — Tsono-Xuhil
itself, a shade tree on the western edge and the reed bed on the stream lip.

## 5. Asset picks (measured, never named)

Sizes are `sizeM` from the built kit manifests, in metres, `[x, y, height]`.
Δ is measured across the authored footprint's four corners and its centroid.

| Parcel | District | Asset | Footprint (m) | Height (m) | Δ (m) | Fit |
|---|---|---|---|---|---|---|
| `parcel.mazzatun.conduit-column` | d.works | `arcolumn02` | 5.2 × 5.2 | 202.1 | 1.14 | pad |
| `parcel.mazzatun.conduit-pillar` | d.works | `pillar02` | 2.7 × 2.7 | 198.1 | 0.91 | pad |
| `parcel.mazzatun.course-e1` | d.works | `wallstraight` | 8.3 × 2.9 | 202.1 | 3.54 | dug-in |
| `parcel.mazzatun.course-n1` | d.works | `wallstraight` | 8.3 × 2.9 | 206.0 | 1.64 | pad |
| `parcel.mazzatun.course-n2` | d.works | `wallcorner01` | 7.9 × 7.7 | 203.0 | 1.77 | pad |
| `parcel.mazzatun.course-w1` | d.works | `wallstraight` | 8.3 × 2.9 | 203.9 | 2.51 | dug-in |
| `parcel.mazzatun.cutting-floor` | d.staging | `mineoreiron01` | 8.2 × 8.3 | 199.0 | 2.33 | dug-in |
| `parcel.mazzatun.gate-frontage` | d.works | `arstatuewall01` | 14.0 × 3.6 | 203.3 | 1.95 | pad |
| `parcel.mazzatun.great-stair` | d.works | `arstairsside01` | 5.5 × 13.9 | 203.6 | 3.22 | dug-in |
| `parcel.mazzatun.half-cut-blocks` | d.works | `blockslargepile` | 23.9 × 5.7 | 201.4 | 3.63 | dug-in |
| `parcel.mazzatun.haul-cart` | d.staging | `handcart01` | 2.3 × 3.2 | 196.6 | 1.06 | pad |
| `parcel.mazzatun.haul-gate` | d.staging | `walkwaycwallgate02` | 15.9 × 6.2 | 199.1 | 2.21 | dug-in |
| `parcel.mazzatun.hoist` | d.staging | `minescaffoldbasesupportw01` | 4.7 × 4.8 | 204.4 | 1.72 | pad |
| `parcel.mazzatun.kiln` | d.staging | `smelter01` | 5.3 × 6.8 | 200.2 | 1.57 | pad |
| `parcel.mazzatun.pen-a` | d.pens | `mudhut01` | 6.9 × 7.5 | 207.9 | 1.94 | pad |
| `parcel.mazzatun.pen-b` | d.pens | `mudhut01` | 6.9 × 7.5 | 205.9 | 1.78 | pad |
| `parcel.mazzatun.pen-c` | d.pens | `mudhut01` | 6.9 × 7.5 | 206.7 | 4.57 | dug-in |
| `parcel.mazzatun.pen-fence` | d.pens | `argonianfence01` | 2.6 × 1.3 | 207.2 | 1.71 | pad |
| `parcel.mazzatun.pen-oven` | d.pens | `carapaceoven` | 4.5 × 3.3 | 207.1 | 1.16 | pad |
| `parcel.mazzatun.pen-rack` | d.pens | `fishracksmall` | 3.5 × 3.6 | 206.8 | 1.31 | pad |
| `parcel.mazzatun.scaffold-a` | d.staging | `stockadescaffoldbase4sided01` | 4.7 × 4.8 | 205.1 | 1.29 | pad |
| `parcel.mazzatun.scaffold-b` | d.staging | `stockadescaffoldbase4sided01` | 4.7 × 4.8 | 197.6 | 1.35 | pad |
| `parcel.mazzatun.scaffold-c` | d.staging | `stockadescaffoldbase2sided01` | 4.7 × 4.8 | 199.4 | 1.87 | pad |
| `parcel.mazzatun.scaffold-stair` | d.staging | `stockadescaffoldstairs01` | 4.6 × 4.5 | 198.6 | 1.04 | pad |
| `parcel.mazzatun.stair-throat` | d.works | `arstairscenter01` | 4.6 × 8.3 | 204.4 | 1.91 | pad |
| `parcel.mazzatun.statue-court` | d.works | `arstatuebase01` | 12.8 × 12.8 | 204.4 | 2.18 | dug-in |
| `parcel.mazzatun.terrace-wall-a` | d.works | `arquadblock01` | 7.4 × 7.4 | 205.0 | 2.39 | dug-in |
| `parcel.mazzatun.terrace-wall-c` | d.works | `arquadblock02` | 7.4 × 7.4 | 202.2 | 2.09 | dug-in |
| `parcel.mazzatun.tower` | d.works | `artower01` | 7.5 × 7.5 | 202.6 | 2.54 | dug-in |

Footprints are authored 1 m larger than the measured extent in each axis, so a
parcel still holds its piece under any of the four yaws the compiler may
choose (see the open items below).

The scaffold parcels follow `works-v1`'s own `snapLogic`: a
`stockadescaffoldbase<n>sided01` footing carries a matching
`stockadescaffoldtop<n>sided01` deck, decks join by `bridge01/02`, and
`stairs01` climbs them. Side counts are kept consistent per platform — the
four-sided bases stand alone, the two-sided base abuts the terrace wall where a
railing would be redundant.

Budget, declared and measured: 29 instances, 24 unique assets, 58 unique
materials, 33,433 triangles, 29 colliders, against a declared ceiling of 80
instances, 60 materials, 128 MB of texture and 80 colliders. Compiles with **0
errors**.

## 6. Lore

- **UESP Lore:Mazzatun**, **Lore:Xit-Xaht**, **Lore:Duskfall**, **Lore:Hist
  Sap**, **Online:Tsono-Xuhil**, **Online:The Ruins of Mazzatun**, as recorded
  in `world/sources/lore/tribes.md` §Xit-Xaht,
  `topics/hist-and-sap.md` §Amber Plasm, `topics/hist-placement.md` §Mad,
  `topics/history-timeline.md` §Duskfall, `regions/shadowfen.md`,
  `regions/secondary-settlements.md` and
  `extrapolation/settlement-register.md` §Mazzatun.
- Fixed by canon and honoured here: the tribe never stopped building in stone
  under a Hist it bound with sap; it raided neighbours for slave labour (the
  Su-Zahleel were taken wholesale), which is what `district.mazzatun.pens` is; the Hist weeps
  Amber Plasm, which is chaotic creatia leaking through it, which is what the
  conduits carry; the elders put Tsono-Xuhil into a convalescent sleep at the
  end of the Second Era. The catalogue's extrapolation — three and a half
  centuries on, the seep has resumed and the work has restarted — is owner
  question Q8 option B, already settled in
  `extrapolation/owner-questions.md`.
- The "Puzzle City" epithet (cramped walls, twisted halls, dead ends) is an
  **interior** property. It belongs to the root-cavern behind
  `door.dunmer-north.mazzatun.1` in Phase 12, not to this exterior, which is
  three open terraces by design.
- `docs/research/xanmeer-mesoamerican-reference.md` §2 supplies the precinct
  form followed here: a plaza composition on stepped platforms with a
  processional axis, not a lone monument.

## 7. Open questions for the owner

1. **A finished pyramid, or a building site?** The vault's only pyramid
   statics measure 34 × 22 m, 68 × 65 m and 69 × 65 m on the ground. The shelf
   is 68 × 42 m in total, so even the smallest one swallows the whole terrace
   and leaves no room for the scaffolds, the block face or the pens — which are
   the things that say "still being built". This draft therefore builds the
   works from wall, corner, block, column, stair and tower pieces: courses
   rising, not a monument standing. The alternative is to put the 34 m pyramid
   here and push everything else off the shelf onto worse ground, or to move
   Mazzatun about 220 m east onto the wide flat at roughly 33 m elevation,
   which has room but is a valley floor rather than a defensible ridge end and
   would break the record's ridge-end landform. Which reading do you want?
2. **How far below the city should the tree be?** Tsono-Xuhil's own record
   places it on the river 85 m east of the shelf and 55 m *below* it, so the
   player looks down on a grey crown from the lip rather than standing in a
   city built around a tree, which is how the lore describes Mazzatun. Options:
   (a) keep it, and the conduits climbing 55 m of cliff become the strongest
   image in the place; (b) move the tree up onto the stream head at the shelf's
   southern lip, roughly 30 m from the works, so the city genuinely encircles
   it, at the cost of the waterfall landform its own record won on. This is a
   change to the sibling record, so it needs your call before anyone edits it.
3. **How visible should the pens be?** They currently sit on the top step,
   directly overlooking the works, so the first thing the player sees on
   arrival is people in mud huts working for people in stone. The alternative
   is to tuck them behind the northern rise, out of sight until the player
   climbs, which makes the discovery a reveal rather than a statement. The
   first is blunter; the second rewards exploring.
4. **Should the haul road be walkable, or a winch?** The only approach climbs
   55 m of escarpment in about 90 m of horizontal distance. Either we cut a
   switchback road into it, which reads as a lot of engineering for a tribe of
   builders and is arguably right, or the road stops at the gorge and the
   stone goes up by hoist while the player climbs — which uses the climbing
   system and makes the place feel genuinely closed off.

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
- `sitingPrefs.hardConstraints` should gain "a shelf of at least 60 × 40 m of
  ground at under 15° of local fall", which is what this siting actually needed
  and what the next stone place will need too.
- `assetPlan` lists `pyramid-statics`. If open question 1 is answered in favour
  of the building-site reading, that entry should become
  `xanmeer-frontage-statics`, because no pyramid static fits this ground.
- `tooling/asset-pipeline/pipeline/config/kits/ruin-monumental-v1.json` says
  the kit "is for RUINS only and must never mix with a settlement kit".
  Mazzatun is canon's single live exception — a settlement being built in stone
  now — and the `argonian-stone` kit set exists for it. The kit description
  should name that exception so the next agent does not read the rule as a
  prohibition and quietly re-site the place.

## 9. Open items on the compiler (found while building this, not faked around)

- **Yaw is randomised, not authored.** `compile_settlement` sets each
  placement's yaw from a seeded quarter-turn and ignores the parcel footprint's
  orientation. For a terraced stone city where a wall course must run along a
  riser, orientation is load-bearing. This draft defends against it by
  authoring square-margin footprints, but the real fix is a `facingDeg` on the
  parcel, honoured by the compiler. **Done the same day:** parcels now carry an
  optional `yawDeg` (degrees clockwise from north) that the compiler honours;
  this blueprint's parcels should set it at Round B.
- **Door reachability uses the coarse slope raster.** The shelf reads 39–45° in
  `slope_grid` while its measured fall is about 11° over 40 m, so a door on
  genuinely walkable ground fails the 30° test unless its parcel is a pad.
  `parcel.mazzatun.stair-throat` is a pad partly for that reason. **Done the same day:** the
  check now measures the local gradient from four height samples 2 m around
  the threshold instead of reading the raster cell.
