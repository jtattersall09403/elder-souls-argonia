# Mazzatun — meso design record (Phase 11 Part 7, Round A re-authoring)

`place.dunmer-north.mazzatun` · heretic-stone-village · M3 · D3 (approach D4) · dossier `world/sources/sites/dossiers/mazzatun.{json,md}` · map `tooling/world-generation/output/blueprint-maps/place.dunmer-north.mazzatun.png`

Exemplar brief: a **stone kit on sloping ground**, designed from the walking player's eye. The city is met twice: from below, up 52 m of escarpment beside the amber conduit, then from above, down the ridge shoulder into the pens. The v2 schema is filled in full: a `why` on every district, parcel and landmark, ways authored as waypoints and routed over the ground, the risers and the pen fence as `fences[]`, a door on every piece the kit index says has an inside, four combat spaces with their reasons, two approaches and a scale grounding. `blueprint --check`, `compile_settlement` (27 placements, 0 errors) and `render_blueprint` all pass on the committed file.

## 1. The ground and the siting

The dossier over the plotted point reports 369 m of relief in a 400 m disc, a slope median of 28.6° and 4.87 ha (10 %) buildable; the plot itself sits on a 47° face. Three candidates were measured with `ProvinceSurvey.height_at`:

| Candidate | positionM | Height | Δ across the core | Water | Verdict |
|---|---|---|---|---|---|
| `candidate.mazzatun.shelf` — the rock shelf | 1985, 1341 | 202.6 m | 1.9 m over 30 × 20 m; 6.5 m over 70 × 45 m | band 0, 4.1 m above the table | **chosen** |
| `candidate.mazzatun.plot` — the plotted point | 1993, 1456 | 201.2 m | 24.0 m over 30 × 20 m | band 0 | rejected: Δ ≥ 2 m under every footprint; the ladder forbids grading there |
| `candidate.mazzatun.gorge` — the Hist's own floor | 2070, 1341 | 148.2 m | 6.5 m at best within 170 m | in the channel, −0.12 m above the table | rejected: a stone works cannot stand in a river |

The shelf is 68 m east–west by 42 m north–south between 198 and 209 m, falling about 8.5 m north to south in three readable steps, with a headwater stream along its southern lip and a 55 m escarpment on its east dropping to the gorge in which Tsono-Xuhil stands. The blueprint boundary is wider than the shelf (1860–2085 by 1280–1400 m) because it now carries the two approach ways.

## 2. Scale grounding

| Field | Value | Source |
|---|---|---|
| population | 38–48 | UESP Lore:Xit-Xaht (a tribe that raided its neighbours for slave labour under a Hist it bound); `extrapolation/settlement-register.md` §Mazzatun (stirring, building restarted); the record's occupants (few D3 builders, few taken labourers, one D4 shaper) |
| households | 9 | six Xit-Xaht households of the work gang and the shaper, three pens |
| buildingsPlanned | 27 | the parcel count; validator tolerance ±25 % |
| npcsPlanned | 12 | `occupants[]`: shaper, two builders, carver, three taken labourers, walkway keeper, gate watch plus the record's sap-tenders |

The Xit-Xaht live underground, in the twisted halls that earned the place its epithet, so the exterior carries no dwellings of theirs; the interior behind the stair-throat is where the thirty of the tribe sleep. The taken labourers, twelve to fifteen, are housed in three mud shells of 30 m². The other twenty-three structures are the works.

## 3. Districts and the terrace rules

| District | Kit set | Ground | Parcels |
|---|---|---|---|
| `district.mazzatun.pens` | `argonian-mud` | upper step, 205–209 m, z 1317–1332 | three shells, oven, rack |
| `district.mazzatun.works` | `argonian-stone` | middle step, 198–206 m, z 1332–1349, reaching down to the half-cut blocks | courses n1, n2, w1, e1, statue wall, stair-throat, great stair, pens stair, tower, conduit column and pillar, half-cut blocks |
| `district.mazzatun.staging` | `neutral-works` | lower step and stream lip, 196–203 m, z 1349–1364 | gate, cart, kiln, scaffolds a/b/c, scaffold stair, cutting floor, hoist |

The terrace rules, each of them visible in the data:

1. **Every course runs along a riser; every stair runs on the fall line.** The arched bays, the corner block, the statue wall and the frontage dais have contour bearings (74–108°) in their `yawDeg`; the two stairs and the stair-throat are set at 0° and 353.6°, on the fall.
2. **The risers are built, not painted.** Heightfields cannot hold a vertical, so the two risers are `fences[]` of kind `wall` with the quad-block asset: `fence.mazzatun.riser-upper-{west,east}` at z 1332.5 (either side of the pens stair) and `fence.mazzatun.riser-lower-{west,east}` at z 1349.5 (either side of the great stair). Buildings on a riser stand on the course.
3. **The slope ladder is obeyed by measurement.** Ten parcels are pads (Δ < 2 m) and seventeen are dug-in; nothing is graded above 2 m and nothing is stilted. The compiler's own Δ pushed six parcels from pad to dug-in this round (course-n1, pen-b, half-cut blocks, scaffolds a/b/c), which is the permitted downward relaxation of the ladder.
4. **The pens are mud and the works are stone**, by district, never blended; the IGS Ayleid pieces and the Here There Be Monsters xanmeer pieces stand in separate parcels and never abut (tower to course-e1: 0.33 m, the closest).
5. **Authority is high and last.** The tower (shaper's station) stands at the lip at the far end of the terrace track; the pens are higher still, which is the point: the labour is above the masters and looks down at their stone, while the masters look up into the pens from the court.

## 4. Ways — authored as waypoints, routed over the ground

| Way | Kind, width | Routing | Length | Climb | Steepest 3 m segment | Ends at |
|---|---|---|---|---|---|---|
| `route.mazzatun.haul` | road 3.0 | terrain, 4 via | 204 m | 148 → 200 m | 34° | the Hist landmark; the gate |
| `route.mazzatun.gateway` | road 3.0 | straight | 5.7 m | — | — | the gate (which `spans` it) |
| `route.mazzatun.yard` | road 3.0 | terrain | 13 m | — | 2° | the gate; the great stair |
| `route.mazzatun.terrace` | track 2.2 | terrain, 4 via | 47 m | 201 → 202 m | 13° | the frontage dais; the tower |
| `route.mazzatun.pens-stair-link` | footpath 1.5 | straight | 8 m | 204 → 202 m | 13° | the pens stair |
| `route.mazzatun.pen-lane` | footpath 1.6 | terrain, 4 via | 48 m | 206 → 204 m | 11° | the rack; the east pen |
| `route.mazzatun.shoulder` | footpath 1.5 | terrain, 4 via | 146 m | 242 → 206 m | 42° | the rack |

**Did the road climb?** Yes. The router was given the foot at the Hist court (2062, 1352; 158 m), two hairpin waypoints on the face (2040, 1300 and 2020, 1345) and the gate; it found a 204 m line for a 52 m climb: 14° on average, with thirteen segments over 20° and the worst 3 m stretch at 34°. The terrain raster is stepped at 1 m, so single-metre risers of 2–4 m appear along it; those are cut steps in a haul road, not a fault in the line. The previous draft's Q4 (road or winch) is answered: a road for carts and gangs, with the hoist kept for lifting blocks out of the cut, not for people.

The spine is the haul road, authored in three collinear pieces because the router keeps ways out of parcels: a terrain-routed climb that ends at the gate's outer face, a straight passage through the gate that the gate `spans`, then a terrain-routed yard road from the inner face to the foot of the great stair. `way-overlap` accepts it (the pieces meet end to end). The middle step has one way, the terrace track; the upper step has one, the pen lane.

The conduit is not a path. It is `fence.mazzatun.conduit`, kind `wall`, asset `histroots03` (hollowed root, the record's stated material), an arc of seven waypoints from the Hist up the face to the head, over the gate's north end on the two xanmeer pillars and into the throat — 81 m for 55 m of climb. The schema has no `conduit` kind; see §11.

## 5. Fences

| Fence | Kind | Asset | Line |
|---|---|---|---|
| `fence.mazzatun.riser-upper-west` / `-east` | wall | `arquadblock01` | z 1332.5, 31 m + 8 m, split at the pens stair |
| `fence.mazzatun.riser-lower-west` / `-east` | wall | `arquadblock02` | z 1349.5, 17 m + 9 m, split at the great stair |
| `fence.mazzatun.pen` | fence | `argonianfence01` | north of the pens at z 1319 and down the east side to the east course: 60 m |
| `fence.mazzatun.conduit` | wall | `histroots03` | Hist → lip → over the gate → throat, 81 m |

The compiler does not yet place fence or wall pieces; these are map and data until it does; the record says so in `assetConstraints`.

## 6. Doors and interiors

The kit index (`blueprint_interiors --report`) says which pieces have an inside; every one of them has a door; the report ends "0 problem(s)".

| Door | Parcel | Piece | Interior (derived) | Faces | Reached from |
|---|---|---|---|---|---|
| `door.dunmer-north.mazzatun.1` | `stair-throat` | `arstairscenter01`, covered flight, 23 m² | tileset → `xanmeer-interior-v1`, small | 180°, the downhill end | terrace track, 3 m |
| `.2` | `pen-a` | `mudhut01` | matched `mudhut01intnew`, small | 188° | pen lane |
| `.3` | `pen-b` | `mudhut01` | matched `mudhut01intnew`, small | 157° | pen lane |
| `.4` | `pen-c` | `mudhut01` | matched `mudhut01intnew`, small | 270°, away from the works | pen lane end |
| `.5` | `haul-gate` | `walkwaycwallgate02` | tileset → `vanilla-farmhouse-int`, medium | 246°, inner face beside the opening | gateway road, 3.6 m |

Three pieces of the last draft had an inside and no door, or a door and no inside; each is resolved by geometry rather than by exception: the stair throat moves from the open spiral stair (no roof, so no interior) to the covered central flight, which has one; the spiral stair becomes the great stair up from the yard; the Ayleid column carrying the conduit (17 m² of inside nobody would enter) becomes a xanmeer `pillar05`; the eastern arched bay changes from `arbridge03` (enclosed) to `arbridge01` (open-sided, as the north bay already was); the statue court moves from `arstatuebase01` (110 m² of inside) to the carved `arstatuewall01`, which is open to the sky. The gate keeps its inside as the gatehouse where the watch sits.

The record's `entranceCount: 1` is the stair-throat, the one entrance to the S3 interior. The pens and the gatehouse are separate small interiors and are listed as a catalogue change in §12.

## 7. Combat spaces

| Space | Clearance | Why |
|---|---|---|
| `combat.mazzatun.court` | open | LV28's stone rite is put to a visitor before the statue wall; refusal flips the place hostile and the watch comes down the terrace |
| `combat.mazzatun.yard` | cluttered | LV29's quarrel between the carver and the overseers among the scaffolds; the first fight inside the gate after the flip |
| `combat.mazzatun.pens` | cluttered | a night fight when the labourer who remembers is taken to be held harder (LV28) |
| `combat.mazzatun.gate-road` | tight | the flip closes the gate; the watch fights on the road head with the drop behind the defender |

## 8. Approach and wayfinding

### Part 1 — per approach

#### `approach.mazzatun.haul-road` (walk, from `route.mazzatun.haul`)

The walker stands at the Hist court on the gorge floor at 158 m, beside a grey crown that is wrong for a Hist. The conduit-head pillar (`pillar02`, 9.3 m, base at 198 m) reads first: a thin thing on the lip 40 m up and 46 m off, with the amber line running down the face from it to the tree's roots. The sightline to the lip is 41° above level; the road corridor over the face is hard-cleared (the second `hardClear` polygon), because a 15 m cedar at mid-face would otherwise stand across it. The watch column (12.4 m, set 8 m back from the lip) shows beside the pillar from here; the amber and its position over the road are what single the pillar out. The first hairpin at (2040, 1300) turns the walker away and the face hides the lip; the second at (2020, 1345) turns back and the gate wall — 15 m of timber with a walkway, 10 m high — comes across the road with the pillar at its outer end. Through the gate the yard opens: 13 m of road ending at the foot of the great stair, with the cart, the scaffold stair and the block face to the right. At the stair head the carved figures of the statue wall face the climber, the throat door is 10 m to the right beside the amber run; the column stands at the far end of the track. The climb pays at the lip: `socket.mazzatun.hist-overlook` looks back down onto the crown of Tsono-Xuhil.

#### `approach.mazzatun.shoulder` (walk, from `route.mazzatun.shoulder`, north-west)

From the ridge shoulder at 240 m the shelf lies 35 m below. The tower reads first: the tallest built thing on the shelf (top at 215 m), standing at the far lip against the void of the gorge with the grey crown behind it; the pens' shells (tops at 212 m) sit under the sightline and the shelf is hard-cleared, so nothing on it competes. The path drops behind the western rise and the column is lost; the rack and the woven fence appear at the foot of the path; then the three shells and their lane, with the column at the far end of the lane above the pens stair. The threshold is the rack: the shoulder path becomes the lane there. The first node is the pens themselves, so this approach meets the taken before the tribe. The pens stair drops onto the terrace track beside the throat door.

### Part 2 — the checklist

| # | Check | Answer |
|---|---|---|
| 1 | Every approach designed (≥2 for M3+) | Yes: two, each with a `fromRouteId` |
| 2 | One first-seen object each, a real id | Yes: `landmark.mazzatun.conduit-head`; `parcel.mazzatun.tower` |
| 3 | Taller than the vegetation and terrain in the way | Yes, with the face corridor hard-cleared (§8 Part 1 gives the numbers) |
| 4 | Three to five beats with an occlusion | Yes: five beats each; the hairpin and the western rise occlude |
| 5 | Last stretch bends at least twice | Yes: two hairpins on the road, two bends on the shoulder path |
| 6 | Centre visible from arrival, or a landmark at the bend | Yes: the great stair is in line with the gate; the column ends the lane |
| 7 | Threshold spanned, not passed | Yes: `haul-gate` spans `route.mazzatun.gateway`, checked by integration |
| 8 | One spine, wider, no duplicated movement | Yes: the 3 m road; the track and lanes are 1.5–2.2 m; `way-overlap` passes |
| 9 | Landmark hierarchy, no rival to the beacon | Yes with a caveat: the 12.4 m column shows beside the 9.3 m pillar from the road; the amber distinguishes them (§11, Q6) |
| 10 | Socket buildings present doors to a way | Yes: throat 3 m from the track, pens on the lane, gatehouse on the gateway; the open pieces stand beside their ways |
| 11 | No dead end at a blank wall | Yes: the track ends at the dais (the view) and the tower (the station); the lane ends at the rack and the east pen |
| 12 | Ascent visible from the node below | Yes: the great stair from the gate; the pens stair from the track beside the throat |
| 13 | Edge reads from inside and out | Yes: gate wall and lip east, fence north and east of the pens, stream lip south; west is the shelf running out, marked by the single block |
| 14 | Buildings match population ±25 % | Yes: 27 planned, 27 authored |
| 15 | Approach cue in one clause | Yes: "follow the amber up the face to the gate"; "keep the column ahead and the fence on the left" |
| 16 | Forced detours pay | Yes: the climb pays with the overlook socket at the lip |

## 9. Asset picks (measured hulls, never names)

| Parcel | District | Asset | Hull (m) | Height (m) | Yaw | Fit |
|---|---|---|---|---|---|---|
| `pen-a` / `pen-b` / `pen-c` | pens | `mudhut01` | 5.9 × 6.5 | 5.1 | 7.6° / 336.8° / 90° | pad / dug-in / dug-in |
| `pen-oven` | pens | `carapaceoven` | 3.5 × 2.3 | 1.4 | 137.7° | pad |
| `pen-rack` | pens | `fishracksmall` | 2.5 × 2.6 | 2.5 | 325.7° | pad |
| `pens-stair` | works | `arstairs01` | 5.7 × 5.7 | 2.0 | 0° | dug-in |
| `course-w1` | works | `arblock03` | 2.7 × 2.7 | 0.9 | 319.5° | dug-in |
| `course-n2` | works | `arquadblock01` | 6.4 × 6.4 | 1.8 | 6.7° | pad |
| `course-n1` / `course-e1` | works | `arbridge01` | 12.8 × 7.0 | 8.9 | 352.5° / 81.8° | dug-in |
| `gate-frontage` | works | `arsteppeddias01` | 9.3 × 9.3 | 1.2 | 344.1° | dug-in |
| `statue-court` | works | `arstatuewall01` | 13.0 × 2.6 | 7.8 | 0° | dug-in |
| `stair-throat` | works | `arstairscenter01` | 3.6 × 7.3 | 4.8 | 0° | dug-in |
| `great-stair` | works | `arspiralstairs01` | 9.2 × 9.2 | 3.5 | 353.6° | dug-in |
| `tower` | works | `ararchcolumn02` | 1.9 × 6.3 | 12.4 | 76.5° | dug-in |
| `conduit-pillar` | works | `pillar02` | 1.7 × 1.7 | 9.3 | 271.4° | pad |
| `conduit-column` | works | `pillar05` | 1.0 × 1.0 | 3.1 | 271.4° | pad |
| `half-cut-blocks` | works | `arrubblepile03` | 10.2 × 7.9 | 8.4 | 76° | dug-in |
| `haul-gate` | staging | `walkwaycwallgate02` | 14.9 × 5.2 | 10.0 | 66° | dug-in |
| `haul-cart` | staging | `handcart01` | 1.3 × 2.2 | 1.4 | 233.7° | pad |
| `kiln` | staging | `smelter01` | 2.8 × 3.1 | 2.6 | 18.4° | pad |
| `scaffold-a` / `scaffold-b` | staging | `stockadescaffoldbase4sided01` | 3.7 × 3.8 | 2.7 | 320.5° / 12.1° | dug-in |
| `scaffold-c` | staging | `stockadescaffoldbase2sided01` | 3.7 × 3.8 | 2.7 | 9.2° | dug-in |
| `scaffold-stair` | staging | `stockadescaffoldstairs01` | 3.6 × 3.5 | 3.5 | 341.2° | pad |
| `cutting-floor` | staging | `mineoreiron01` | 7.2 × 7.3 | 1.7 | 42.8° | dug-in |
| `hoist` | staging | `minescaffoldbasesupportw01` | 3.7 × 3.8 | 2.7 | 208.2° | pad |

Pieces with an off-centre pivot (`arstairscenter01`, `arstatuewall01`, `arstairs01`, `arsteppeddias01`, `arrubblepile03`) were authored by where the hull should stand; `centreUV` was back-solved from the measured hull centroid.

## 10. Lore

UESP Lore:Mazzatun, Lore:Xit-Xaht, Lore:Duskfall, Lore:Hist Sap, Online:Tsono-Xuhil, as recorded in `world/sources/lore/tribes.md` §Xit-Xaht, `topics/hist-and-sap.md` §Amber Plasm, `topics/history-timeline.md` §Duskfall and `extrapolation/settlement-register.md` §Mazzatun. Fixed by the sources and honoured here: the tribe never stopped building in stone under a Hist it bound with sap; it raided its neighbours for slave labour (the Su-Zahleel were taken wholesale), which is the pens and the shoulder path; the Hist weeps Amber Plasm, which the conduits carry; the elders put Tsono-Xuhil to sleep at the end of the Second Era. The "Puzzle City" epithet (cramped walls, twisted halls, dead ends) is an interior property and belongs to Phase 12 behind `door.dunmer-north.mazzatun.1`.

## 11. Open questions for the owner

1. **A finished pyramid, or a building site?** Unchanged. The pyramid statics measure 34 × 22 m and larger; the shelf is 68 × 42 m, so any of them swallows the terrace. This draft builds courses rising.
2. **How far below the city should the tree be?** Unchanged. 85 m east and 55 m below; the routed road now makes the climb concrete at 204 m.
3. **Is the routed haul road acceptable as a cart road?** 14° on average with short 30–34° steps. If not, the alternative is a longer third traverse to the south along the stream lip, at the cost of the gate's position.
4. **The conduit as a `wall`.** The schema's fence kinds are fence, wall, palisade and hedge; the compiler places none of them yet. A `conduit` kind (a raised line on posts, with an asset per span) would let the compiler dress the record's signature feature honestly. Until then it is a line on the map.
5. **Which interior kit for the throat?** The kit index derives `xanmeer-interior-v1` for the Ayleid pieces, so the door claims it; the catalogue record says `root-cavern`. Either the record changes to a xanmeer interior with root dressing, or the throat needs a piece whose derived interior is `dungeon-root-v1`; none of the exterior kits has one.
6. **Two tall things on the lip.** From the road the 12.4 m column shows beside the 9.3 m pillar. The amber run makes the pillar the followed object, but if a single silhouette is wanted the column should move 15 m west along the terrace, off the lip.
7. **How visible should the pens be?** Two shells face the works, one faces away; the split is authored in `orientationWhy`. Confirm, or make all three one way.

## 12. Notes for the catalogue and kit records (not edited from here)

- `positionM` should move from `[1993.3, 1455.9]` to `[1985.0, 1341.0]`; `plotFacts` re-measured (route 296 m, water 8 m, elevation 202.6 m).
- `interior.entranceCount` stays 1 for the S3 interior if the pens and the gatehouse are recorded as separate small interiors; otherwise it rises to 5. The blueprint carries five doors either way.
- `interior.family` `root-cavern` versus the derived `xanmeer-interior-v1` (Q5).
- `assetPlan` lists `pyramid-statics`; under the building-site reading it should read `xanmeer-frontage-statics`.
- A `terrainRequests` entry for bare rock over 1946–2022 by 1316–1364 m and a trodden corridor down the face along the routed road.
- `sitingPrefs.hardConstraints` should gain "a shelf of at least 60 × 40 m at under 15° of local fall".
- `ruin-monumental-v1`'s kit description ("RUINS only") should name Mazzatun as the one live exception for which the `argonian-stone` kit set exists.

## 13. What the integration checks caught this round

Running `compile_settlement` on the first v2 draft returned ten errors; each was a real defect in the layout rather than in the tools: six pads whose measured Δ was over 2 m (now dug in); the kiln placed in the stone district with a vanilla piece (moved to the staging district); the gateway drawn through the gate without ending at it (it now `endsAt` the gate, so the passage may touch it and the gate may span it); the terrace track's buffer clipping the gate wall's north end, because the wall's ends had been reasoned from the wrong sign of its yaw (the via was moved north); the pen lane's buffer clipping the middle pen's corner (the via was moved uphill); and the gatehouse door falling on a water pixel of the 5.5 m hydrology raster at the stream lip (the door moved to the north side of the opening). The final compile is 27 placements, 0 errors, budget OK.
