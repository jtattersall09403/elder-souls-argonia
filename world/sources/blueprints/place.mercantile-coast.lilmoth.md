# Lilmoth — meso design record (Phase 11 Part 7, Round A re-author)

`place.mercantile-coast.lilmoth` · major city, rebuilt-stilt-city, M5, D1, mercantile coast · blueprint `place.mercantile-coast.lilmoth.json` · dossier `world/sources/sites/dossiers/lilmoth.{json,md}` · map `tooling/world-generation/output/blueprint-maps/place.mercantile-coast.lilmoth.png`

This is the exemplar **city**, re-authored to the full v2 schema after the owner's Round A findings. Every district is fully parcelled (61 parcels, 43 doors, 21 ways, 9 landmarks, 3 docks); every district, parcel, landmark and dock carries a plain-English `why` block; every way is authored as waypoints with a `why` and routed over the ground; every building with an inside has a door; three approaches are designed from the walking (or boating) player's eye. `blueprint --check` passes, `compile_settlement` reports 64 placements, 0 errors and 43 of 43 doors reachable; the prose linter shows no hard hit on any Lilmoth id.

## 1. The ground, and the three candidates

The approved anchor is 3610.8, 6384.7 m (uv 0.4897, 0.8659). The site was re-surveyed at 10 m for this round. The numbers below supersede the Part 6 section, which over-read the eastern bench.

| Ground | Where (x, z m) | Height | What it takes |
|---|---|---|---|
| The crest | 3600–3670, 6290–6370 | 19–23 m | the Hist court |
| The bench | 3690–3765, 6280–6320 | 11–13 m | the council crown |
| The bluff | 3765–3795, 6300–6335 | 13 → 3 m over 30 m | the stair |
| The tidal flat | 3775–3860, 6330–6440 | −1 to 3 m, flood band 1 | Pusbottom and the quay |
| The south flat | 3690–3790, 6440–6485 | 1.5–3 m | the shore quarter |
| The shelf and plateau | 3870–4000, 6340–6420 | 1 m at 3888, 4 m at 3925, 10 m at 3946, 12 m at 3968 | the drowned quarter and the roadstead |
| The gate saddle | 3575–3620, 6375–6400 | 14–16 m, pond at 3550–3560 | the north gate |

The published road from Blackrose arrives from the west-north-west, its last points 3564, 6366 → 3586, 6388 → 3608, 6382. The previous draft invented a road from due north; this one ties the gate to the road that exists. The city calls it the north gate because the road is the road north to Blackrose (Lore:Lilmoth puts Blackrose Prison north of the gate).

The three candidates of Part 6 stand as recorded in `siting` (`candidate.lilmoth.east-face` chosen for its tiers, its shallow shelf and the reveal off the rise; the south-east embayment rejected because water deep enough for a hull would delete the lightering; the south lagoon rejected because it cannot drown anything). The east face is also the only candidate on which the published road ends.

## 2. The v2 design

Seven districts, one kit set each.

| District | Kit set | Ground | Parcels | What it is |
|---|---|---|---|---|
| `north-gate` (the Blackrose gate) | imperial | 13–16 m saddle | 6 | the arch across the road, its tower, two curtain stubs, the rubble of the south tower; named for the road it faces (owner 2026-09-07), the id keeps the survey name |
| `hist-court` | argonian-stilt | 19–23 m crest | 6 | the third Hist inside a ring of poles open to the east, two tenders' lodges, the vigil awning |
| `council-crown` | argonian-stilt (declares `routing: straight`) | 11–13 m bench | 9 | hall, record room, strongroom, market deck, elders' house, council floor, factor's house, tariff bell |
| `pusbottom` | argonian-stilt | −1 to 3 m flat | 16 | the tall block and fifteen huts hung off a loop walkway that bends with the bluff foot, and a skewed cross lane; spacing and offsets vary hut by hut |
| `lighter-quay` | argonian-stilt | 0–2 m shore | 9 | the deck, the lamp, the licence house, the lighter shed, the divers' shed, the salvage bench, the smith, the boatwright and the roofed dues board (`bmv:advertising_board`, works-v1) on the east side of the quay lane, facing the licence house door |
| `shore-quarter` | argonian-stilt | 1.5–3 m south flat | 8 | seven fishers' huts staggered either side of a bending lane, the boat awning at its end, behind the pole wall; the fishers' path climbs from here to the gate yard |
| `drowned-quarter` | neutral-underwater | 1–15 m of water | 7 | the ridge, two villa blocks, two floors, the hall, the shrine |

**The walk.** Gate yard → the track over the southern shoulder of the crest, the Hist court on the left hand → the council bench, with the market deck on the right and the hall on the left → the bell on the lip → the bluff stair → the Pusbottom junction → the spine across the north of Pusbottom → the quay deck → the pier → the lighter berth. Cargo runs the other way, up. Authority (the council) is high and is reached before the quay, as the record's tiers require; commerce (the upper market) is the first node inside the court.

**Ways (22).** The Imperial road is two straight `road` ways meeting at the arch (`gate-road` ends at the arch from outside, `gate-yard` starts at it and runs to the lantern), because the integration pass forbids a way to cross a building except at an end: a gate is therefore two roads and one arch that `spans` the outer one. The spine is a terrain-routed `track` over the crest, a straight `boardwalk` along the bench (the council's surveyed line, the one straight line in the Argonian city), a straight `stair` down the bluff and a terrain-routed `boardwalk` to the deck. Pusbottom's loop and cross lane are plank runs, straight from pile to pile between their bends, so they follow the bluff foot and the shallows rather than a ruler (owner-eye review 2026-09-07: the first draft's two parallel lanes and three columns of huts at 15 m read as a grid). The shore lane is terrain-routed over the wet flat. The fishers' path (`route.lilmoth.fishers-path`, footpath, terrain-routed) leaves the gate yard at the lantern and drops 13 m down the southern slope to the boat awning at the west end of the shore lane, 120 m of walking where the loop and the lane cost 500. From the gate the fishers' roofs are in view below. It swings west of the gate lodging, which stands across the straight line (added 2026-09-07; the way `endsAt` the awning from the 2026-09-07 repair). Two piers leave the quay (the lighter pier to the berth, the divers' pier to the stair). One `channel` runs from the pier head to the roadstead over 4–10 m of water. Four `fences`, routed over the ground in the same pass as the streets (owner ruling 2026-09-08). The two Imperial curtains stay `straight` with the survey named on the entry, because a legion curtain is set from an instrument and the ground is cut to it: the standing west curtain (`mwimparchwall01`, 52.3 m, seven 7.28 m modules) and the broken north curtain along the shoulder (`mwimparchwall01destroyed01`, 111.2 m). The Hist court ring is routed: 77.5 m of driven poles on the 20–22 m crest, twelve vertices where the authored arc had ten, still open to the spine on the east. The Argonian pole wall facing the estuary is routed too; it now stands in the water, where the lore puts it. See below.

**Why the previous canal lines went.** The old draft drew a 14 m "channel" from the quay into the sea and two boardwalks that ran under the deck. The channel survives as `canal.lilmoth.lighter-channel`, a dredged navigation line from the pier head to the roadstead, with its `why`; nothing else runs into the sea.

**Combat spaces (4, each with a quest or a flip).** The gate yard (the hunted flip closes the gate), the quay deck (Cargo Off the Ledger, A Body in the Lot, the guarded flip), the Pusbottom lanes (Pusbottom Remembers, the vault heist; tight class), the drowned hall (The Second Room, Short of Divers; submerged).

**Sockets.** All seventeen catalogue sockets are placed and, except the Hist court scene (the tree's, at the vigil awning), bound to a parcel: council floor and council-standing mark on the stone ring; council-hall station on the hall; tariff roll in the record room; pre-rebuild plan in the strongroom; slaughter list in the Pusbottom hut of that name; lighter-quay station on the deck; north-gate station on the arch; diving-stair station on the divers' shed; upper-market station on the deck; the dive scene and the cleared mark on the drowned hall.

## 3. Size grounding

`scaleGrounding`: population 190–230, 26 households, 53 buildings planned, 70 named residents. Lore source: the settlement register (M5, rebuilt smaller); the owner's binding decision of 2026-08-24 (smaller, lower, over a mass grave); module 95's M5 quest band (35–60 quests, of which 37 name Lilmoth). No UESP source gives a headcount, so the count is built up: 28 dwellings (two tenders' lodges, two houses on the bench, the tall block and fifteen more huts in Pusbottom, seven fishers' huts and the lodging at the gate) hold 26 households at about five to a household, which is 130; the council, patrol, tenders, licence and salvage staff and the crews housed on the quay add another 60 to 100 people. Morrowind's ratio is the check: Balmora has about 40 buildings; Lilmoth at 53 placed structures is a third larger, which is the right size for a major city rebuilt smaller than the one that it replaced. 61 parcels count against the plan of 53 (the two wall stubs are excluded by the validator), within the ±25 % band.

## 4. Asset picks, orientation and footprints

Every parcel is centre + exact asset + yaw + reason; footprints are derived by `blueprint_footprints`. Heights are the measured ground under the derived hull (min–max, Δ). None of the Argonian pieces is square: the bamboo huts measure 8.16 × 8.22 m but their hull is the rounded wall ring; the two platforms are plain rectangles because they are decks; their `why.what` says so.

| Parcel | District | Asset | Size (m) | Centre (x, z) | Yaw | Ground under hull | Fit |
|---|---|---|---|---|---|---|---|
| `gate-arch` | north-gate | `mwimparchwallgate01` | 7.3 × 3.6 × 13.1 | 3590, 6390 | 58.7° | 15.0–15.5 (Δ 0.5) | pad |
| `gate-tower` | north-gate | `mwimparchguardtower01` | 6.1 × 6.1 × 13.1 | 3586, 6384 | 58.7° | 12.7–15.5 (Δ 2.9) | dug-in |
| `wall-stub-north` | north-gate | `mwimparchwall01destroyed01` | 6.9 × 3.5 × 13.1 | 3583, 6379 | 58.7° | 12.7–13.3 (Δ 0.6) | pad |
| `wall-stub-south` | north-gate | `mwimparchwall01destroyed01` | 6.9 × 3.5 × 13.1 | 3594, 6396 | 58.7° | 15.4–15.4 (Δ 0.0) | pad |
| `fallen-south-tower` | north-gate | `mwimparchrubblepile01` | 11.1 × 10.7 × 3.4 | 3582, 6404 | 129.2° | 13.0–15.8 (Δ 2.8) | dug-in |
| `minder-lodge` | hist-court | `bamboohut01` | 8.2 × 8.2 × 5.8 | 3608, 6327 | 252.2° | 19.8–21.2 (Δ 1.3) | stilt |
| `second-tender-lodge` | hist-court | `bamboohut02` | 8.2 × 8.2 × 5.8 | 3640, 6300 | 192.3° | 17.2–19.8 (Δ 2.6) | stilt |
| `vigil-awning` | hist-court | `orcawninghalf01` | 8.2 × 5.0 × 5.8 | 3652, 6348 | 315° | 21.5–22.5 (Δ 1.0) | stilt |
| `council-hall` | council-crown | `stilthouseext` | 11.3 × 17.8 × 10.8 | 3721, 6297 | 342.3° | 11.4–12.5 (Δ 1.2) | stilt |
| `record-room` | council-crown | `bamboohut01` | 8.2 × 8.2 × 5.8 | 3699, 6307 | 229.7° | 11.1–11.8 (Δ 0.7) | stilt |
| `strongroom` | council-crown | `bamboohut02` | 8.2 × 8.2 × 5.8 | 3722, 6284 | 147.7° | 10.5–11.3 (Δ 0.8) | stilt |
| `upper-market-deck` | council-crown | `stilthouseplatform` | 11.3 × 17.8 × 11.2 | 3713, 6321 | 260° | 12.6–13.9 (Δ 1.3) | stilt |
| `elders-house` | council-crown | `bamboohut02` | 8.2 × 8.2 × 5.8 | 3738, 6314 | 27.2° | 12.1–12.5 (Δ 0.4) | stilt |
| `council-floor` | council-crown | `rune circle` | 8.1 × 9.0 × 3.3 | 3753, 6311 | 74° | 9.9–12.0 (Δ 2.1) | dug-in |
| `factor-house` | council-crown | `bamboohut01` | 8.2 × 8.2 × 5.8 | 3745, 6300 | 229.7° | 11.7–12.4 (Δ 0.6) | stilt |
| `tariff-bell` | council-crown | `kiosk01` | 8.6 × 8.6 × 20.7 | 3766, 6302 | 15.9° | 9.1–10.0 (Δ 0.9) | stilt |
| `pus-tower` | pusbottom | `stilthouseext` | 11.3 × 17.8 × 10.8 | 3787, 6340 | 8° | 0.7–4.2 (Δ 3.4) | stilt |
| `pus-vault-house` … `pus-south-b` (15 huts) | pusbottom | `bamboohut01`/`02` alternating | 8.2 × 8.2 × 5.8 | on the loop and cross lane at 6.8 m from the centreline | 250°–299° (west side), 71°–108° (east side), 104°–143° (cross lane), 14°/350° (south lane) | −0.8–2.1 (Δ 0.0–1.4) | stilt |
| `quay-deck` | lighter-quay | `stilthouseplatform` | 11.3 × 17.8 × 11.2 | 3852, 6368 | 0° | −1.4–−0.3 (Δ 1.0) | stilt |
| `quay-lamp` | lighter-quay | `kiosk01` | 8.6 × 8.6 × 20.7 | 3852, 6338 | 24° | 0.1–1.4 (Δ 1.2) | stilt |
| `licence-house` | lighter-quay | `bamboohut02` | 8.2 × 8.2 × 5.8 | 3840, 6330 | 148.4° | 1.7–2.3 (Δ 0.6) | stilt |
| `lighter-shed` | lighter-quay | `bamboohut01` | 8.2 × 8.2 × 5.8 | 3840, 6346 | 148.3° | 1.3–1.7 (Δ 0.3) | stilt |
| `divers-shed` | lighter-quay | `bamboohut01` | 8.2 × 8.2 × 5.8 | 3836, 6400 | 354.4° | −0.9–−0.4 (Δ 0.5) | stilt |
| `salvage-bench` | lighter-quay | `bamboohut02` | 8.2 × 8.2 × 5.8 | 3825, 6422 | 132.5° | −1.1–−0.6 (Δ 0.5) | stilt |
| `fisher-a` … `fisher-g` (7 huts) | shore-quarter | `bamboohut01`/`02` | 8.2 × 8.2 × 5.8 | two rows at 6463 and 6449, x 3716–3761 | 341°–17° (south row), 172°–199° (north row) | 1.2–2.5 (Δ 0.2–0.5) | stilt |
| `boat-awning` | shore-quarter | `orcawninghalf01` | 8.2 × 5.0 × 5.8 | 3700, 6456 | 233° | 2.3–2.5 (Δ 0.1) | stilt |
| `drowned-ridge` | drowned-quarter | `arblockfreehollow` | 7.3 × 7.3 × 4.5 | 3888, 6350 | 24° | −1.9–−0.8 (Δ 1.2) | dug-in |
| `villa-north-block` | drowned-quarter | `arblockfreehollow` | 7.3 × 7.3 × 4.5 | 3925, 6347 | 24° | −3.8–−1.2 (Δ 2.6) | dug-in |
| `villa-floor-north` | drowned-quarter | `aruniquerubblewalkablefl05` | 3.9 × 3.1 × 0.8 | 3945, 6350 | 24° | −6.6–−4.7 | dug-in |
| `villa-floor-south` | drowned-quarter | `aruniquerubblewalkablefl01` | 6.0 × 7.5 × 1.3 | 3920, 6394 | 24° | −9.6–−7.7 | dug-in |
| `drowned-villa-hall` | drowned-quarter | `arblockfreehollow` | 7.3 × 7.3 × 4.5 | 3946, 6392 | 24° | −10.8–−9.6 | dug-in |
| `villa-collapsed-block` | drowned-quarter | `arblockfreehollow` | 7.3 × 7.3 × 4.5 | 3905, 6412 | 45° | −9.6–−8.2 | dug-in |
| `xhon-mehl-shrine` | drowned-quarter | `arblockfreehollow` | 7.3 × 7.3 × 4.5 | 3968, 6402 | 264° | −15.3–−12.5 | dug-in |

Orientation logic per district:

- **North gate.** The Imperial work is set to the road rather than to the compass. The four standing pieces form one chain. All of them carry 58.7°, square to the road's 59° bearing; each is then laid so that its own joining face sits on the next piece's face, measured from the kit's geometry by `pipeline.measure_connectors` and checked by the `abuts-snap` rule (97 C14/E3). Running from the country inward: the north curtain stub's east face on the tower's west face, the tower's east face on the arch's western pier and the south curtain stub's west face on the arch's eastern pier. The moves that closed those three joints were 0.18 m, 0.29 m and 0.13 m. The gap reported on 2026-09-08 was a hand's width of daylight at each joint. The south stub also gave up its old 71.9°, because the Imperial set joins a flanking curtain to its gate; the piece was exchanged for the mirror segment (`mwimparchwall01destroyed01`, as on the north side) whose show face falls outward at the gate's own bearing. The rubble of the south tower is not part of the chain. The kit has no authored joint from a rubble heap to a wall, so the rubble lies further down its own fall line.
- **Hist court.** Both lodges are turned to face the trunk (108° from the west, 186° from the north); the awning's open side faces the tree; the ring is open toward the spine.
- **Council crown.** Declared a surveyed line: the bench walkway is the one straight walkway in the city, and the block is laid out on it. Each doored piece was then turned by `blueprint_footprints --orient` so that its own shipped doorway looks at the walk it is entered from (the hall to its plank landing at 342.3°, the bell kiosk to the bench walk at 15.9°), which is why the yaws are no longer one shared pair.
- **Pusbottom.** Each hut stands 4.9–6.1 m off its lane at its own spacing (12–19 m to its nearest neighbour) and is canted between 38° one way and 60° the other off the door line, as each household set its own piles; no bearing is shared by more than two huts (97 C8). The hut composites' doorway is radial (any side is a way in), so the door is placed on the lane side and the body is turned freely.
- **Shore quarter.** Three huts north of the lane and four south of it, staggered so no two face each other, each canted its own way; the doors look at the lane.
- **Drowned quarter.** The old street grid at 24°, a slumped block at 45°, the shrine opening west (264°) toward the stair.

The two pieces ruled out in Part 6 stay ruled out (`composite:quay/stone-quay- with-stilt-house`, a two-culture weld; `settlement-mud-v1`, the wrong Argonian building culture). The drowned pieces are all `arblockfreehollow` (interior "none"): the two broken variants of the block are "shell" in the interiors index and would demand a door under water, so they are not used.

**Ground fit.** Every Argonian piece is `stilt`, which the ground confirms (Δ up to 3.4 m under the tall block, 2.6 m under the second tender's lodge). The Imperial masonry sank: tower and rubble `dug-in` (Δ 3.0, 2.8), arch and stubs `pad`. The council floor's stones are set into the 2.1 m fall at the south edge of the bench (`dug-in`). Compile grades three pads (arch, both stubs), all under 2 m.

**Doors and interiors.** 43 doors. The bamboo huts are matched to their HTBM interiors (`bamboohut01_int`/`02_int`, medium); the two kiosks and the guard tower carry their index tilesets (`dungeon-root-v1`, `vanilla-imperial-int`); the two `stilthouseext` shells name `settlement-stilt-v1` as the kit from which Phase 12 dresses them, because no stilt-house interior tileset exists yet (owner question 3). Every door threshold lies within 4 m of a way, on land, inside a hard-clear polygon and on ground under 30° — the compiler proves all 43.

**Budget.** 64 placements, 18 unique assets, 113 unique materials, 390k triangles, within the declared budget (2400 instances, 125 materials, 260 MB, 1800 colliders). Materials, not instances, remain the tight constraint.

## 5. Approach and wayfinding

### 5.1 By the gate road, on foot (`approach.lilmoth.gate-road`)

First seen: `landmark.lilmoth.third-hist`. From the road on the flat west of the pond (3450, 6340; ground 2.3 m) the crown of the Hist reads over the crest at 46.8 m above sea level (22.4 m ground + 24.4 m tree), 190 m away and 44 m above the walker; bare-terrain line of sight from that point, from 3520, 6370 and from the first waypoint of the gate road (3575, 6377) is clear (measured with the survey, eye 1.7 m). The compile's B6 check confirms it from the road's first waypoint. Canopy: the flora kit's tallest firm-lowland tree is 36 m; on the 2–7 m flats along the road that puts treetops at 38–43 m above sea level, so the crown clears them by 4–9 m; the road corridor itself is cleared by the province route pass. As the road bends round the pond (3550–3560, 6355–6365) the gate tower (13 m on 15 m ground, top 28 m) and the standing curtain (13 m) hide the tree; the arch and the tower are what is seen, at 40–60 m. The road holds its own bearing of 59° through the gate: `terminal.lilmoth.land-gate` sits on `route.road.blackrose-lilmoth` where the arch stands over it, the gate road runs the last 20 m up to it on that bearing and the gate yard carries it 28 m further to the lantern, so the Blackwood road and the city's first street are one line. The arch stands across that line at yaw 58.7°, its opening square to the carriageway, with the tower built onto its western pier and a curtain stub onto each end of the run. The road ends at the lantern; the track climbs the shoulder (15 → 19 m over 30 m) and the tree comes back on the left hand behind its ring of poles. At the top of the shoulder (3668, 6348; 18 m) the bell kiosk shows ahead (top 30 m) and the bay opens beyond it. First node inside: the gate yard at the lantern; second: the court opening; third: the market deck at the head of the bench walkway. Last 200 m: two bends (round the pond, over the shoulder).

### 5.2 By lighter from the roadstead (`approach.lilmoth.roadstead`)

First seen: `parcel.lilmoth.tariff-bell`. From a lighter at the roadstead (4040, 6368) the bell kiosk on the lip of the bench reads first, its lamp 30 m above the water, with the quay lamp (top 22 m) below and inshore and the Hist crown (47 m) behind and higher — three lit tiers stacked, which is the catalogue's own approach line. Line of sight to all three from the roadstead is clear over open water. Along the channel (14 m wide, 4–10 m deep, 86 m long) the ridge block breaks the water 40 m north of the line and hides the lamp for a moment; then the pier head, the deck and the sheds along the quay lane come into view under the bluff. Threshold: coming alongside at the pier head (`dock.lilmoth.lighter-quay`). First node: the quay deck. The way up is the quay lane past the licence house to the lantern at the stair foot, then the bluff stair to the bell.

### 5.3 Along the shore from the south, on foot (`approach.lilmoth.shore`)

First seen: `parcel.lilmoth.tariff-bell`. From the south flat (3720, 6560; ground 1.1 m) the bell stands over the bluff 260 m away with the Hist crown behind it; line of sight to bell, tall block and Hist is clear over bare terrain. The `thinned` clearance polygon is extended down the shore corridor (3690–3810, 6480–6580) so the bell reads through thinned trees rather than a closed canopy. The high junction tower (a separate place at 3773, 6496) is the mid-way mark, 15 m outside the pole wall. The pole wall and the fishers' roofs hide the bluff foot as the walker comes up the shore; the shore lane appears between the last fisher's hut and the pole wall; at the corner of Pusbottom the tall block and the lanes are seen close under the bell. First node: the south-west corner of the loop; the stair to the bell is at the far end of the west lane. At the boat awning the fishers' path forks up the slope to the gate yard, the short way to the market and the road.

### 5.4 The checklist (research §5)

| # | Check | Answer |
|---|---|---|
| 1 | Every approach designed (≥2 for M3+), each with a route or a direction | Yes: three, one with `fromRouteId`, two with `fromDirection`. |
| 2 | Each names one real first-seen id | Yes: the Hist landmark; the tariff-bell parcel twice. |
| 3 | First-seen taller than the vegetation and terrain in the way, measured | Yes for the road (crown 46.8 m ASL vs 38–43 m treetops, LOS measured) and the bay (open water). For the shore, yes only with the thinned corridor added this round; without it a 36 m tree on the flat would top the bell (30 m ASL). |
| 4 | Sequence of 3–5 beats with an occlusion | Yes: road (tree, tower hides it, arch, tree returns, bell); bay (bell, ridge hides the lamp, pier head); shore (bell, roofs hide the foot, lane, block). |
| 5 | Last stretch bends twice, or the record says why straight | Road: two bends. Bay: the lighter takes the dredged straight line, as it must. Shore: the lane bends at the wet patch and at the loop corner. |
| 6 | From each arrival point the centre node is visible, or a landmark marks the bend | Gate yard → bell visible (measured); deck → bell visible up the bluff; loop corner → bell over the block. |
| 7 | Threshold spanned, not passed | Yes: `gate-arch` spans `route.lilmoth.gate-road`, checked by the integration pass. |
| 8 | One spine, wider than the rest; no duplicated movement | Roads 4.3 m, spine track and boardwalks 3 m, quay lane 2.5 m, loop and lanes 2 m, footpaths 1.5 m; overlap check passes. |
| 9 | Landmark hierarchy | Beacon: the Hist (road) and the bell (water, shore); mid-place: the gate lantern, the quay lantern, the roadstead mark; no rival to the beacon. |
| 10 | Every socketed or service building presents its door to a way | Yes: 43 doors, each within 4 m of its way, all reachable. |
| 11 | No way ends at a blank wall | Every way `endsAt` a deck, a door, a dock or the tree; the roads meet at the arch and the lantern. |
| 12 | Every raised level has its ascent visible from below | The bluff stair leaves from the bell's foot and lands at the loop junction under the tall block; the quay lane runs to its foot. |
| 13 | The edge reads as an edge from inside | West: the standing curtain. North: the broken curtain. East: the water. South: the pole wall and the reed fringe. |
| 14 | Building count matches population within ±25 %, source stated | 59 counted parcels against 53 planned; sources in §3. |
| 15 | Approach cue describable in one clause | "Keep the pond on the left and go through the arch"; "steer for the upper lamp"; "walk the shore to the pole wall". |
| 16 | Any forced detour pays | The pond forces the road round the gate and pays with the view of the tower and curtain; the bluff forces the stair and pays with the bell's view over the quay; the channel forces the swimmer round the ridge and pays with the ridge itself. |

### 5.5 Network terminal

| terminal | province route | entry off the route | way end | join bearing | gate off square |
|---|---|---|---|---|---|
| `terminal.lilmoth.land-gate` (road) | `route.road.blackrose-lilmoth` | 0.4 m | 0.0 m | 2.2° | 2.2° |

The three boat lanes that name Lilmoth (`route.boat.soulrest-lilmoth`,
`route.boat.lilmoth-archon`, `route.boat.blackrose-lilmoth`) once ended at the
plotted dot inland of the gate yard, 295 m from the head of the compiled
lighter channel. `world/sources/routes/lane-terminals.json` now names the
berth those lanes serve, so `compile_society` runs all three to the lighter
quay at 0.529192, 0.863633 and the blueprint declares a terminal on each:
`terminal.lilmoth.lighter-quay-soulrest`, `-archon` and `-blackrose`, all three
continued inside the city by `boardwalk.lilmoth.lighter-pier`. The pier carries
the cargo up to the quay deck and the quay lane takes it into the city.

## 6. What the integration checks made me change

- A single road through the arch fails `parcel-on-way`; the gate is now two roads meeting at the arch, the outer one spanned.
- Two boardwalks ran under the old quay deck; now every way that reaches the deck `endsAt` it; the deck is the node.
- Two quay doors were 4.3 m from the lane; the row was moved 1 m.
- Three Imperial pieces were `pad` over Δ ≥ 2 m; they are `dug-in`, which is also what happened to Imperial masonry here.
- **Repair round, 2026-09-07.** The door-orientation pass had turned buildings without re-running the way clearance behind them; twenty-two compile errors followed. The bench walk stays the surveyed straight line and the four pieces it clipped stepped off it instead: the council hall 4.2 m north (the strongroom moved 4.0 m north behind it to keep clear), the guild hall 4.3 m south, the market deck and the council floor 0.8 m each; the factor's house came 1.5 m in so its door reaches the walk. Everywhere else the way moved and the buildings stood still: the spine track now bends in past the trader's door and out again round the tavern, the fishers' path swings west of the gate lodging, the shore lane starts clear of the south corner hut, the Pusbottom loop runs north of the divers' shed. The council landing `endsAt` the hall on which it lands; the fishers' path `endsAt` the boat awning. In the salvage corner the diver's hut moved 4.8 m off the shed in which it was standing. Two huts, `pus-cross-d` and `pus-south-b`, had their thresholds over open water: each moved about 4 m onto the water's edge so the doorstep is on dry ground with the hut still on its piles.
- **Two defects the repair found and fixed.** `compile_settlement`'s asset resolver read the district's kit set directly instead of `blueprint.kits_for_district`, so it refused the works notice board that the 97 C1a dressing rule had already admitted (the dues board). And `blueprint_footprints --orient` derives a threshold by casting from the pivot to the *stored* footprint, so running it before `--apply` has rewritten that footprint leaves the door a few tens of centimetres out: the order is `--apply`, then `--orient`, then the compile.
- **Still out, queued in the gap plan.** Four parcels sit outside their own district rectangle: `pus-cross-c`, `pus-cross-d` and `salvage-bench` across the Pusbottom/lighter-quay seam at x = 3832, and nothing separates the two there because the quay's working pieces and the district's huts genuinely interleave. `hist-court`'s east edge was 4 m short of its own tavern and has been extended to 3676. The seam is a district-boundary question, not a placement one; it is queued in the Phase 11 gap plan.
- The module 97 checks landed during this round: the council crown declares its surveyed line (C8), Pusbottom and the shore quarter carry per-hut yaws with no bearing shared by more than two (C8), the gate pieces declare `abuts` (C5), roads are 4.3 m (C3). Remaining WARN: civic is 16 % of classified parcels against a 5–10 % band — a capital with a council floor, a hall, a bell, a gate and a Hist court is meant to be over that band.

## 7. Lore grounding

- Stilt-and-platform fabric, ninety per cent Argonian, over sunken Imperial villas; Imperial walls on most of the circuit and Argonian walls facing the estuary (here the pole wall); large ships cannot dock and lighter their cargo; Pusbottom as the criminal quarter; the city's own Hist despite no native tribe; the sunken shrine to Xhon-Mehl the Fisher; elders including retired Shadowscales as judges — all `world/sources/lore/lilmoth.md`, from UESP Lore:Lilmoth.
- Rebuilt but not restored, smaller and lower, over its own mass grave, with the Old Imperial quarter left drowned and Pusbottom repopulated — owner decision 2026-08-24.
- The third Hist, walled and open, with a rotating minder and a second tender always present: `lore/topics/hist-placement.md` §4. The ring of poles is open on one side and both lodges stand outside it, so the rule is legible as architecture.
- Bethesda's conventions (research §4): the town meets the road; commerce at the first node inside the court; authority high and reached before the quay; a second landmark at each decision point.

## 8. Open questions for the owner

1. **The gate's compass — answered.** It is the Blackrose gate, named for the road it faces (owner 2026-09-07); no spur. The ids keep `north-gate`.
2. **How deep is the drowned quarter?** Measured now: the ridge in 1 m, the villa hall in 10 m, the shrine in 12–15 m, all within 130 m of the quay. That is a swim-down from the stair, not a boat trip; the earlier "6.6 m plateau" was a mis-read. Is 12–15 m the right depth for the shrine dive with the breath system as planned? **Answered:** 1–15 m under the player's own walkway is right; the expeditionary dive belongs to a wreck place (owner 2026-09-07).
3. **Stilt-house interiors.** The two `stilthouseext` shells (council hall, tall block) have no interior tileset in any kit; the blueprint names `settlement-stilt-v1` so Phase 12 dresses them from HTBM's hut interiors. Source a stilt-house interior, or accept hut-interior dressing at hall scale? **Answered:** superseded by the plugin-derived interior mapping (taste ledger, 2026-09-07); the interior links are being rewritten by that pass.
4. **Climbing.** The tiers are 9–20 m apart with one stair. Route all vertical movement through the stair and the piles (a gated city) or let the climbing system take the piles and house sides freely? This is the decision that most changes how Lilmoth plays and it is hard to reverse once quest gates are authored. **Answered:** climbing is free on the piles and house sides; no quest gate may assume the stair (owner 2026-09-07).
5. **A notice board — resolved.** works-v1 is built and measured (`works-v1.kit.json`, `works-v1.footprints.json` carry `bmv:advertising_board`, 1.57 × 1.39 m, 2.47 m high); `parcel.lilmoth.dues-board` stands at 3849, 6327 opposite the licence house door, in the `lighter-quay` district.

6. **Should Pusbottom's fifteen huts be thinned? — resolved, keep them.** The count comes from the scale grounding (26 households, register M5) and that grounding still holds, so the answer to a thin quarter is a purpose per door and not a smaller quarter (owner ruling 2026-09-07). Each hut now carries a typed `playerPurpose[]`, and the district reads as the criminal economy the lore gives it: a fence, a safehouse, a brokerage, a stash, a diver's cache, a bunk let by the night, the stakes for the dice barge. See the Player purposes section below.

## 9. Catalogue record should change (not edited from here)

- `underwaterAccess` is `"none"`; the record's own sockets, traversal modes and three quests turn on the dive. It should say the drowned quarter is divable, 1–15 m.
- `relations.visibleFrom` is empty; the dossier reports Blackrose 1.3 km west and Soulrest 3.1 km west from this ground.
- `assetPlan` lists `bmv-stilthouse` and `vanilla-shackkit` but not the HTBM Black Marsh village set, the source of the dwellings, the platform and the Argonian boardwalk.
- `vibe.approach` says "from the north road"; the road that exists arrives from the west-north-west (question 1).
- Satellite places inside or against this ground: `high-junction` (3773, 6496) stands 15 m outside the pole wall; `slaughter-memorial` (3452, 6238) is on the road 200 m before the gate, so the city carries no second memorial; the divers' yard and the shrine exist as catalogue places of their own (`lilmoth-divers-yard`, `xhon-mehl-shrine`) as well as parcels here; one of the two should be the record.

## 10. Deviations from module 97 (Round A review, 2026-09-05)

- **97 C7, closed 2026-09-07.** The earlier draft ran civic at 20 % against the 5–10 % band. The trade and service buildings added since (smith, boatwright, tavern, apothecary, trader, guild hall, gate lodging) and the re-classing of the gate pieces as `gate` rather than `civic` moved the mix to 65 % dwelling, 21 % work, 7 % civic and 7 % storage over 43 classified buildings — inside every band, so the check no longer fires.
- **97 C4, the market between gate and Hist.** The walk runs gate → Hist court (passed on the left hand) → market deck at the head of the bench, so commerce is the first node on the bench rather than a deck between the gate and the tree. The Hist stands on the crest because C2 puts it on the highest dry ground; the crest is the ground nearest the gate; the two rules cannot both hold on this site. Owner check.
- **Part F, argonian-stilt enclosure (none).** The pole wall facing the estuary is the lore's own detail (Lore:Lilmoth: Argonian walls facing the estuary); it stands. **Where it stands was decided from the survey on 2026-09-08.** The first draft ran it along the bank, so it lay across the shoreline with the water on both sides of it in places. The lore calls the wall the city's estuary face, and the first draft drew it on the land behind that face. Read off the depth raster, the tidal flat off the fishers' quarter drops to about 1.3 m within 11 m of the waterline and to 3.5 m within 22 m, so there is a narrow shelf into which a pole can be driven, and no more: `fence.lilmoth.estuary-pole-wall` is now a `pole-wall` with `waterOk.maxDepthM` 1.1, routed 50.2 m from (3818, 6443) to (3802, 6481) with 100 of its 102 sampled metres in water at 0.60–1.08 m, on ground 0.5–0.9 m below the water surface. It weaves seaward of the Pusbottom stilt huts rather than through them (the router's parcel cost, checked hard by the validator), and the fishers' quarter now reads from the water as the lore describes it: a line of poles standing out of the flat with the huts behind it.
- **97 B4, dwellings in the flood band.** Pusbottom's fifteen huts stand on the −1 to 3 m flat, in flood band 1, on stilts. That is the quarter's name and its lore (the low criminal quarter, repopulated after the rebuild); the over-water share is not measured yet (97 G8).
- **97 C12, outdoor dressing.** No dressing pass exists (97 G18); nothing here is authored beyond the board.

## Doors and assemblies (stream A2, 2026-09-05)

Thirty-two of Lilmoth's dwellings and sheds were bare HTBM bamboo huts whose
doors sat on whichever wall faced the street. They now use
`composite:stilt/bamboohut01-with-door` and `...bamboohut02-with-door`: the same
huts carrying the `bamboohutdoor01` that their own author fitted to them, seven
and nine placements deep in the mined assemblies. Each hut's doorway sits on its
local 299.6 deg side, which is fixed, so the parcels were turned instead of the
doors. Every one of the thirty-two now carries a yaw derived from the way its
door serves. Its `orientationWhy` names that way. Some are canted a few degrees
off their neighbours, because aiming a whole lane at one street read as a
surveyed grid, which module 97 C8 refuses. Footprints did not change:
the composite measures the same 6.5 x 6.7 m as the bare hut.

Four of the five doors that came off in the first pass are back. Gaps G5 to G7
are closed. The council hall and the Pus-house tower now use the composite
`composite:stilt/stilthouse-with-door`, which packages the BM&V stilt hall
together with the `stilthousedooranim` its own folder ships; each carries one
door on the hall's 225 deg open front, linked to the `vanilla-farmhouse-int`
interior kit. Their outlines did not change, because the composite measures the
same 17.8 x 11.3 m as the bare shell. The tariff bell and the quay lamp now use
`composite:stilt/kiosk-with-access`, the Bosmer kiosk with the two access
thresholds its author measured into the ring. Both doors sit on the 179 deg
`door-piece` gap and open into `dungeon-root-v1`. The kiosks are the exception: their
interior kit is not the district's own. A lamp tower is a stair under a
platform, so the root tileset is the nearest interior that we hold.

The north gate tower keeps no door. That is now the measured answer rather than
a gap: `mwimparchguardtower01` re-measures as a solid prop with nothing inside
it, so the parcel's `interior` is `none` and its record calls the tower a mass
read from the road. The Imperial keep pieces that ARE buildings do carry leaf
doorways, so a gatehouse with rooms in it has a piece to use later.

Two thresholds needed ground under them. A door has to fall within four metres
of the way onto which it opens. The hall and the tower are big enough that their
open fronts stood eight and ten metres off the nearest walk, so each gained a
short plank landing: `boardwalk.lilmoth.council-landing` off the council walkway,
`boardwalk.lilmoth.pus-tower-landing` off the Pusbottom loop. The tariff bell
turned 0.6 deg, to 80.4, so that its access gap looks back down the walkway
rather than across the bench.

Two sheds moved. The composite fixes the side that carries the door. For the
divers' shed and the salvage bench that side looked at open water, so both were
turned to face the deck behind them. The salvage bench then stepped 3.5 m west,
clear of the loop walk that its hull would otherwise have crossed.

## Promises (97 E9, promise ledger round 2, 2026-09-06)

The catalogue record is the promise; `worldgen.blueprint_promises` reads it
back off the blueprint. Lilmoth now meets 46 of 46. What was built to meet it:

| Promise | Realised by | Piece | Interior |
|---|---|---|---|
| `lodging` | `parcel.lilmoth.gate-lodging` (north gate, imperial kit) | `composite:farmhouse/farmhouse01-with-door` | `vanilla-farmhouse-int` |
| `trader` | `parcel.lilmoth.spine-trader` (Hist court, on the spine) | `composite:stilt/bamboohut02-with-door` | `bamboohut02_int` |
| `apothecary` | `parcel.lilmoth.spine-apothecary` (court approach) | `composite:stilt/bamboohut01-with-door` | `bamboohut01_int` |
| `tavern` | `parcel.lilmoth.spine-tavern` (the spine bend) | `composite:stilt/stilthouse-with-door` | `vanilla-farmhouse-int` |
| `guild-hall` | `parcel.lilmoth.bench-guild-hall` (council bench) | `composite:stilt/stilthouse-with-door` | `vanilla-farmhouse-int` |
| `smith` | `parcel.lilmoth.quay-smith` (quay lane, landward) | `composite:stilt/bamboohut02-with-door` | `bamboohut02_int` |
| `boatwright` | `parcel.lilmoth.quay-boatwright` (quay lane, water side) | `composite:stilt/bamboohut01-with-door` | `bamboohut01_int` |
| `council` | `parcel.lilmoth.council-hall`, which already stood | as built | `vanilla-farmhouse-int` |
| `licence-office` | `parcel.lilmoth.licence-house`, which already stood | as built | `bamboohut02_int` |

Two short footpaths were run to doors that the street could not reach:
`route.lilmoth.gate-lodging-path` and `route.lilmoth.tavern-path`. The declared
material ceiling moved from 110 to 125, because the imperial lodging brings the
farmhouse set into a city that had none.

**Promise removed.** `temple` was dropped from the record by rule R3
in `worldgen.derive_services` rather than by hand. Sacred ground in Lilmoth is the
third Hist court together with the sunken shrine to Xhon-Mehl
(`world/sources/lore/lilmoth.md`). An Argonian temple in the sources is a Hist
chamber or a Sithis site, never a hall that a traveller enters for a service
(`world/sources/lore/topics/hist-placement.md`,
`world/sources/lore/topics/sithis-nisswo-shadowscales.md`). The rule now drops
`temple` for argonian records at every magnitude and leaves `shrine`, which
also rewrote Stormhold, Thorn, Helstrom and Archon.

Named people were given addresses: the council factor works at the council hall
and lives at the factor house; the tree-minder works at the vigil awning and
lives at the minder lodge; the An-Xileel agent works at the tavern and
sleeps in the Pusbottom agent room. The quay merchants, the licence clerk, the dive-master
and the second tender were addressed at the same time.

Four quest provisions were given objects: `socket.lilmoth.pusbottom-vault`
(container, at the Pusbottom vault house), `socket.lilmoth.tidal-palace`
(scene, in the drowned villa hall), `socket.lilmoth.lq08-anchor-three-floors`
(scene, at the sinking tower that LQ08 turns on) and
`socket.lilmoth.mq32-epilogue-sockets` (scene, on the council floor). The
Oliis ferry stage is now served by `travel.lilmoth.ferry-oliis`.

## Player purposes (owner ruling 2026-09-07)

Forty-three parcels here carry a door, and each of them now carries a typed
`playerPurpose[]` (vocabulary and tiers: `worldgen/player_purpose.py`, evidence
in [player-purpose-spectrum.md](../../../docs/research/placement-settlements/player-purpose-spectrum.md)).
Seventeen are major-tier at their best entry, twenty-six medium, none
flavour-only. That is 40 % major, which is the ceiling the validator sets for any settlement.

Where the purposes come from:

- **Pusbottom** is canon's criminal quarter, so the sixteen doors under the
  bluff are a criminal economy rather than sixteen households. The Owing
  brokerage prices deeds and debts; one hut is the district's fence; one is a
  safehouse with a locked back room; a porter keeps a stash of cargo that never
  reached the shed; a diver keeps untagged salvage and sells the way down into
  the drowned hall; the runner takes stakes for the dice barge; a bunk is let by
  the night to whoever works the night shift. The quest hooks that
  already existed are part of that economy: the vault, the slaughter list, the
  agent, the broker, the lot family and the sorter.
- **The shore quarter** trades on the water: a canoe hired at dawn, dried fish
  and a salting bench, the dates of the offering season, the two places the
  pole wall can be crossed, a bed on the drier side of the lane.
- **The quay** is the working city: licences, lines and weights, the shed where
  cargo waits, the bench where lots are tagged, a forge, a boatwright.
- **The crown** is authority: the factor, the record room, the strongroom, the
  bell that can be rung.

## Berths and quest sockets (owner review, 2026-09-08)

**Berths.** All three docks are water terminals now, each with the hull class
it serves and a `networkTerminals[]` entry that names the route ending at it:
the lighter quay (`keeled`, 3.8 m at the piles and 3.8 m along the approach)
takes the three boat lanes and the lane-terminal entry that ends them there;
the diving stair (`small-draft`, 1.4 m) takes the channel through the flooded
rows; the roadstead tender (`keeled`, 9.6 m) takes the dredged channel out to
the plateau edge. All three keep their authored positions: the published water
already reached them, so the compiler re-ended the channels on the berths
(`fit: water-to-dock`) rather than moving the piles.

**Sockets and purposes.** Every purpose that names a quest now carries the
socket at which the player meets it, and every socket bound to a building is
answered by a purpose on that building. Seven sockets were added for
quest-giver doors that had none: the retired rota at the elders' house, the
factor at home, the Rockpark broker, the An-Xileel agent, the licensed-lot
family, the sixth speaker at the fisher's door and the lamp stair. Lilmoth
carries 24 sockets.
