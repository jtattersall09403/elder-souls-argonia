# 16g plot review — `hist-heartland` (measured, read-only)

Measured 2026-09-19 against `world/sources/catalogue/places-hist-heartland.json`
(new plot) vs `git show HEAD:` (previous plot), the frozen survey
(`worldgen.site_fields.shared_survey`), `world/sources/hydrology/hydrology-graph.json`,
`apps/world-studio/public/province/{routes,waterways}.json`. 116 live records
(117 authored; `flood-high-single-rise` is `deferred`). No decisions taken here.

## What needs a decision (10 lines)

1. **Helstrom's boat gate stands on dry land.** `cityLayout.gate` [3462.8, 2799.3] is 3.9 m from the lane end of `route.boat.alten-corimont-helstrom`, and the last 40 m of that lane sits at depth **0.00 m** (shore 15.1 m). No live record within 600 m of `cityLayout.centre` is a berth of any hull class (B5): the only record at the lane edge is `poacher-camp-sap` (9 m from the lane, dry). Helstrom has no road (by owner ruling) and now no landing either.
2. **`lost-city` is `entrance: underwater-entry` on dry ground** — depth 0.00 m, nearest water 21.9 m (`body.1475-2118`, marsh-deep, maxDepth 2.38 m). Either the entrance field or the dot is wrong.
3. **`group.lost-city` is 186.5 m apart** against the register's 120 m; the catalogue's own `boundTo.maxM` says **220** — two live numbers for one fact. The ground between is continuous danger-5 marsh, dry except a 0.4–0.7 m wet band at t≈0.5–0.67; 254 dry sample cells lie within 100 m of `lost-city`, so a `maxM: 100` bind is satisfiable.
4. **The rootworm network does not meet its own lore.** Of the ten power-slot hero Hist, only `gideon` (143 m) and `archon-harbour-hist` (110 m) have a station; the three heartland hero Hist are 471–1148 m from the nearest station and Helstrom's own hero-grove capital has its station at 92 m. `rootway.*` placeholders (helstrom↔north-shadowfen / naga-deeps / east-estuary) have no station at either far end except east-estuary.
5. **16 dangling `patrols` relations** all point at five `route.track.hist-heartland.*` ids that do not exist — the region's whole minor-track layer is unbuilt.
6. **Five records claim water the dot does not have** (`beast-keeper-lizard-steed`, `hammock-tree-island-greenmoss`, `legendary-deep-medusa-wood`, `xal-krona-making-ground` all dry with "flooded/drowned" prose; `sinkhole-mouth-basin` 263 m from its water).
7. **Two interior records key their water to `body.ocean`** (`beast-keeper-lizard-steed` 21.9 m, `burn-scar-village-ash` 117.7 m) — a sea sheet under heartland prose.
8. **`greenspring` (known-red) is still red**: its patch was APPLIED, but the graph's water is 93.2 m away, so `waterRelation: channel-edge` is undelivered.
9. **A7:** eight records sit ≥2 danger bands from their tier, `helstrom` worst (D1 on band 5).
10. **A8:** 21 of 45 fine-tempo records are >220 m from both road and lane (median route distance province-wide 244 m).

## 1. Report lists for this region

| list | count | content |
|---|---|---|
| `homeless[]` | **0** | none |
| `typedSitingViolations` | **0** | none |
| `relaxedRecords` | 18 | 3 `region-relaxed` (`bubble-spire-collapsed`, `bubble-spire-open-helstrom`, `stilt-channel-edge-two-poles`), 1 `relaxed-score` (`platform-ladder-tower-watch`), 14 `neighbour-zone` |
| `danglingRelations` | 16 | see §5 |
| `namedConstraintChecks` | 10 | all pass their catalogue `maxM`; see §4 |
| `clarkEvans` | R 0.86 | n 116, area 8.98 km², mean NN 150.2 m vs expected 174.7 (nullSd 13.8) — clumpier than random |
| spacing | p5 67 m · median 127 m · p95 267 m | one same-type-within-sight pair: `root-gallery-helstrom-underway` ↔ `root-gallery-kept-light`, 299 m |

`relaxedRecords` (region): `bubble-spire-collapsed`, `bubble-spire-open-helstrom`, `burn-scar-village-ash`, `dream-wallow-starblossom`, `hammock-tree-island-greenmoss`, `miregaunt-ground-slow-ground`, `naga-lay-up-second-man`, `platform-ladder-tower-watch`, `poacher-camp-sap`, `root-gallery-drowned-stair`, `root-gallery-kept-light`, `root-gallery-lantern-hollow`, `rootworm-burrow-dead`, `rootworm-burrow-live`, `stilt-channel-edge-two-poles`, `treasure-hunters-live-camp`, `whitewater-reach-panther`, `xal-meeruth-station`.

## 2. Named-list records — measured rows

id prefix `place.hist-heartland.` dropped. "band/tier" = survey danger band at the dot / record `dangerTier`.

| id | type | moved m | band/tier | pf.water (kind, dist) | dot depth | road m | lane m | finding |
|---|---|---|---|---|---|---|---|---|
| `lost-city` | sealed-xanmeer | 2598.8 | 5/D4 | marsh-deep 21.9 | **dry** | 1044 | 1310 | `underwater-entry` on dry ground; design-group split 186.5 m |
| `xal-krona-making-ground` | making-ground | 2781.0 | 5/D4 | marsh-deep 38.4 | **dry** | 1170 | 1477 | prose says "flooded pool"; dry dot; bound 187 m |
| `hist-agaceph-needle` | hero-hist-grove | 1481.6 | 3/D2 | — | dry | 341 | 855 | hero Hist 6/10; 728 m to nearest station (`gideon-rootworm-terminus`), 806 m to Helstrom |
| `hist-paatru-lowcrown` | hero-hist-grove | 1253.8 | 4/D3 | sloped-riffle 0.0 | 0.48 | 651 | 469 | hero Hist 7/10; 471 m to `rootworm-station-helstrom` |
| `hist-sarpa-highflower` | hero-hist-grove | 1289.6 | 4/D3 | — | dry | 455 | 391 | hero Hist 8/10; 632 m to station |
| `sealed-xanmeer-living` | sealed-xanmeer | 0 (unmoved) | 4/D4 | — | dry | 604 | 1088 | hero Hist 9/10; 1148 m to station — the farthest power slot from any station |
| `hist-first-rain-trunk` | hero-hist-grove (reserve) | 1224.1 | 3/D3 | — | dry | 213 | 1279 | reserve, no power slot; 918 m to `east-estuary-rootworm-station` |
| `helstrom` | hist-grove-capital | 275.9 | **5/D1** | marsh-deep 17.3 | dry | 811.6 | 179.1 | A7 gap 4 bands; 276 m from its own anchor; footprint 230 m overlaps two neighbours (§4) |
| `root-talk-ground` | convocation-ground | 1809.6 | 5/D4 | horizontal-channel 49.0 | dry | 388 | 570 | prose names Helstrom; 613 m to anchor / 723 m to the plotted city |
| `rootworm-station-helstrom` | rootworm-station | 0 | 5/D4 | marsh-deep 98.7 | dry | 775.5 | 131.9 | bound 92 m (max 300) ok; footprint overlap with `helstrom` −182.6 m |
| `root-gallery-helstrom-underway` | root-hollow-gallery | 570.0 | 5/D3 | marsh-deep 118.1 | dry | 654 | 404 | bound 312 m (max 350) ok; 543 m from the Helstrom anchor named in its id |
| `rootworm-burrow-live` | wild-rootworm-burrow | 2362.3 | 4/D4 | marsh-deep 39.5 | dry | 285 | 1015 | ok |
| `rootworm-burrow-dead` | wild-rootworm-burrow | 2578.0 | 5/D4 | marsh-deep 69.8 | dry | 292 | 466 | ok |
| `guide-camp-gate-side` | guide-camp | 493.4 | 5/D4 | marsh-deep 5.5 | dry | 743.3 | 271.8 | bound to `helstrom` 94 m (max 300) ok; footprint overlap −180.8 m |
| `guide-camp-far-shelter` | guide-camp | 645.7 | 5/D5 | marsh-deep 5.5 | dry | 410.7 | 1073.0 | bound to gate-side 814 m (max 900) ok; the pair's guide leg crosses band-5 ground both ends |
| `hist-less-refuge-wild` | hist-less-refuge | 909.2 | 5/D4 | marsh-deep — | dry | 790 (road) | 502 (lane) | **off every route: PASS** (min 502 m). Sightline: no LOS to `helstrom` (354 m) — PASS; but **LOS true to `nightbound-lightless` at 417 m** and to `cut-and-carried` (990 m), `necropolis-dead-tenders` (1039 m), `boardwalk-branching-many-ways` (1042 m) |
| `nine-trunks` | hist-village | 0 | 3/D3 | marsh-fringe 56.5 | dry | **15.3** | 571.6 | on the Archon–Gideon road; A8 fine |
| `sap-tapping-licensed` | sap-tapping-camp | 0 | 4/D3 | sloped-rapid 16.5 | dry | 766.9 | 1678.8 | sightline to `harmed-hist-tapped` 892 m, LOS **true** (report says so; re-measured) — but **no track head exists**: `lane-terminals.json` holds only `lilmoth`; `terminal.sap-tapping-licensed.track-head` is absent |
| `greenspring` | hist-village | 0 | 3/D3 | marsh-deep 93.2 | dry | 96.9 | 426.6 | known-red `waterRelation`; patch APPLIED, water still 93.2 m off (shore 99.8 m) |

## 3. Water, depth and entrances

Every `entrance == "underwater-entry"` record, plus wrecks (none typed `wreck` in this region):

| id | recorded kind | depth at dot | gate | verdict |
|---|---|---|---|---|
| `air-pocket-station-basin` | pond | **0.60 m** | ≥1.0 dive | **FAIL** (0.40 m short) |
| `root-gallery-drowned-stair` | backswamp | **0.84 m** | ≥1.0 dive | **FAIL** (0.16 m short) |
| `wamasu-pond-nest` | marsh-deep | **0.84 m** | ≥1.0 dive | **FAIL** |
| `submerged-xanmeer-topmost` | pool | 3.12 m | ≥1.0 | PASS |
| `lost-city` | (none at dot) | **0.00 m** | ≥1.0 | **FAIL — dry** |

Terrain requests in the region: `greenspring` APPLIED but undelivered (known-red, registered);
`drowning-narrows-current` and `waterfall-chamber-root-fall` were **refused** at patch time
("new depression, makesWater not declared", `province/refined/terrain-patches-applied.json`)
and are therefore correctly outside the known-red register — but both records still carry the
request and neither dot has the feature: `drowning-narrows-current` sits at 81.5 m elevation,
158.7 m from a 528 m² lagoon; `waterfall-chamber-root-fall` sits on a `sloped-riffle` at 0 m
distance (its fall chamber is not cut).

`plotFacts.water.kind` vs prose water claim, mismatches only:

| id | prose says | plotFacts | measured |
|---|---|---|---|
| `beast-keeper-lizard-steed` | "flooded" | `body.ocean` / ocean | dot dry, sea sheet 21.9 m |
| `burn-scar-village-ash` | "reach" | `body.ocean` / ocean | dry, 117.7 m |
| `hammock-tree-island-greenmoss` | "flooded spring" | backswamp 5.5 m | dry |
| `legendary-deep-medusa-wood` | "drowned" | marsh-fringe 0.0 m | dry |
| `xal-krona-making-ground` | "flooded pool" | marsh-deep 38.4 m | dry |
| `sinkhole-mouth-basin` | "channel, marsh" | marsh-deep **263.2 m** | dry |
| `bioluminescent-glowfen` | "fall" | lagoon 240.4 m | dry |
| `bone-waystation-interior` | "river bank" | marsh-deep 114.1 m | dry |
| `drowning-narrows-current` | "narrows, reach" | lagoon 162.4 m | dry |
| `greenspring` | "channel bank" claim | marsh-deep 93.2 m | dry |
| `dream-wallow-sap-pool` | "pool" | swamp 100.7 m | dry |
| `mass-grave-flu-memorial` | "reach" | swamp 130.0 m | dry |
| `root-gallery-cult-warren` | "reach" | marsh-deep 90.4 m | dry |
| `sap-touched-miredancer` | "pool" | backswamp 120.4 m | dry |
| `serpent-ground-giant-snake` | "reach" | marsh-fringe 140.6 m | dry |

## 4. A6 / A6b / A7 / A8 / B5 / binds

**A6 footprint overlap (negative clearance, whole province checked):** only three, all around Helstrom.

| pair | dist | footprints | clearance |
|---|---|---|---|
| `helstrom` (230 m) ↔ `rootworm-station-helstrom` (45 m) | 92.4 m | 275 | **−182.6 m** |
| `helstrom` ↔ `guide-camp-gate-side` (45 m) | 94.2 m | 275 | **−180.8 m** |

**A7** (|band − tier| ≥ 2): `helstrom` D1/band5 (**4**), `beast-offering-flood-staying` D3/5, `officeholder-grave-singer-house` D3/5, `root-gallery-helstrom-underway` D3/5, `tended-xanmeer-clan-north` D3/5, `waterfall-chamber-root-fall` D3/5, `legendary-deep-medusa-wood` D5/band3, `root-gallery-deep-throat` D5/band3. 63 more records differ by a single band.

**A8** (network-role ≤ 220 m from a route): the 21 fine-tempo records >220 m from both road and lane —
`broken-xanmeer-subsumed` 494/411, `climbable-ruin-roof-terrace` 713/666, `hammock-crown-ancestor` 248/847,
`hermit-hut-exile-warden` 951/299, `hermit-hut-mad-basin` 250/1749, `miregaunt-ground-slow-ground` 403/899,
`naga-lay-up-second-man` 507/267, `pilgrim-camp-sap-road` 281/799, `porter-relay-poling` 448/418,
`root-gallery-lantern-hollow` 608/359, `sap-tapping-licensed` 767/1679, `serpent-ground-giant-snake` 426/852,
`standing-curiosity-unexplained` 325/856, `stilt-channel-edge-two-poles` 511/453, `stilt-channel-edge-uxaneet` 536/523,
`tended-xanmeer-pilgrim-way` 336/650, `walkway-junction-high-crossroads` 233/644, `wamasu-pond-nest` 571/334,
`wamasu-wallow-struck-ground` 326/925, `waterfall-chamber-root-fall` 242/546, `whitewater-reach-panther` 381/387.
Those with `travelStation` are the sharp ones: `porter-relay-poling`, both `stilt-channel-edge-*`, both `guide-camp-*`.

**B5 hull depth for `travelStation` records** (depth measured at the dot):

| id | modes | nearest lane | depth at dot | class reachable |
|---|---|---|---|---|
| `helstrom` | boat, porter, guide | 179.1 m | dry | **none** |
| `stilt-channel-edge-uxaneet` | boat, porter | 523.4 m | 0.84 m | below canoe 0.6? PASS canoe only |
| `porter-relay-poling` | boat, porter | 418.1 m | 0.96 m | canoe only |
| `stilt-channel-edge-two-poles` | boat | 452.5 m | dry | **none** |
| `boardwalk-branching-many-ways` | boat, porter | 828.6 m | dry | **none** |
| `necropolis-dead-tenders` | boat | 847.0 m | dry | **none** |
| `xal-meeruth-station` | boat | 104.4 m | dry | **none** |
| `alten-markmont` | boat | 717.1 m | dry | **none** |
| `bubble-spire-open-helstrom` / `rootworm-station-helstrom` | rootworm | n/a | dry | n/a |
| `guide-camp-gate-side` / `-far-shelter` | guide | 271.8 / 1073.0 m | dry | n/a |

No heartland boat station reaches keel (3.0 m) or small-draft (1.2 m); six reach nothing at all.

**Binds and sightlines** (all catalogue `boundTo.maxM` pass):

| record | bind/sightline | dist | max | verdict |
|---|---|---|---|---|
| `xal-krona-making-ground` → `lost-city` | bound | 187 | **220 in catalogue / 120 in the register** | passes one number, fails the other |
| `bubble-spire-collapsed` → `bubble-spire-open-helstrom` | bound | 402 | 500 | ok |
| `bereaved-mnemic` → `walkway-junction-high-crossroads` | bound | 1419 | 2000 | ok |
| `guide-camp-far-shelter` → `guide-camp-gate-side` | bound | 814 | 900 | ok |
| `guide-camp-gate-side` → `helstrom` | bound | 94 | 300 | ok (but footprint overlap) |
| `miregaunt-ward-approach` → `sealed-xanmeer-living` | bound | 82 | 300 | ok |
| `root-gallery-helstrom-underway` → `helstrom` | bound | 312 | 350 | ok |
| `rootworm-station-helstrom` → `helstrom` | bound | 92 | 300 | ok (footprint overlap) |
| `sap-tapping-licensed` → `harmed-hist-tapped` | sightline | 892 | — | LOS true |
| `vista-ledge-canopy-break` → `helstrom` | sightline | 1279 | — | LOS true |

## 5. Dangling relations (16, all `patrols` to non-existent tracks)

Missing ids: `route.track.hist-heartland.poling-stages` (4 records), `.basin-guide-crossing` (4),
`.helstrom-pilgrim-way` (4), `.helstrom-underway` (2); plus `helstrom.reachedVia` holding two prose
strings ("escorted boat convoy from Alten Corimont", "root transit (semi-public hub)") where ids belong.

## 6. Helstrom's harbour station (brief item a)

`cityLayout.centre` [3190.0, 2816.0]; `cityLayout.gate` [3462.84, 2799.34] (272.8 m east of centre).
Lane `route.boat.alten-corimont-helstrom` ends at [3465.6, 2802.1], **3.9 m from the gate**.
Depth along its last eight samples: 0.24, 0, 0, 0, 0, 0, 0, 0 m. Shore distance at the gate 15.1 m.

Live records within 600 m of `centre` that stand at a lane edge (lane ≤ 60 m) with a reach/lake/body water kind:

| id | dist to centre | lane dist | pf.kind | depth |
|---|---|---|---|---|
| `poacher-camp-sap` | 383 m | **9 m** | marsh-deep | dry |

(no other record qualifies). For context, the rest within 600 m: `helstrom` 0 m / lane 179 m, `rootworm-station-helstrom` 92 / 132,
`guide-camp-gate-side` 94 / 272, `root-gallery-helstrom-underway` 312 / 404, `hist-less-refuge-wild` 354 / 502,
`root-gallery-drowned-stair` 449 (lane 134, depth 0.84 m), `root-gallery-kept-light` 440 / 606,
`canopy-crossing-rope-basin` 538 / 184, `hist-paatru-lowcrown` 542 / 469 (depth 0.48 m).

## 7. The rootworm network (brief item b)

`travel-services.json` `rootways[]` are three placeholders from `root-node.helstrom` to
`north-shadowfen`, `naga-deeps`, `east-estuary`. Live `rootworm-station` records province-wide:
`rootworm-station-helstrom` [3276.4, 2848.7], `imperial-fringe.gideon-rootworm-terminus` [1689.5, 3104.3],
`saxhleel-coast.east-estuary-rootworm-station` [5149.0, 4584.3].

| hero Hist | slot | nearest station | m | to Helstrom m | on a placeholder axis? |
|---|---|---|---|---|---|
| `dunmer-north.stormhold` | 1/10 | rootworm-station-helstrom | 2140 | 2086 | yes — the north-shadowfen axis, **no station** |
| `dunmer-north.hatching-pools` | 2/10 | east-estuary-rootworm-station | 3890 | 4184 | no |
| `mercantile-coast.lilmoth` | 3/10 | east-estuary-rootworm-station | 2332 | 3533 | no |
| `imperial-fringe.gideon` | 4/10 | gideon-rootworm-terminus | **143** | 1658 | no (off-axis but served) |
| `saxhleel-coast.archon-harbour-hist` | 5/10 | east-estuary-rootworm-station | **110** | 2655 | yes — east-estuary |
| `hist-heartland.hist-agaceph-needle` | 6/10 | gideon-rootworm-terminus | 728 | 806 | no |
| `hist-heartland.hist-paatru-lowcrown` | 7/10 | rootworm-station-helstrom | 471 | 542 | helstrom node |
| `hist-heartland.hist-sarpa-highflower` | 8/10 | rootworm-station-helstrom | 632 | 654 | helstrom node |
| `hist-heartland.sealed-xanmeer-living` | 9/10 | rootworm-station-helstrom | 1148 | 1065 | no |
| `naga-kur-deeps.dead-water-village` | 10/10 | east-estuary-rootworm-station | 2100 | 2907 | yes — naga-deeps axis, **no station** (and this record is `homeless` in the report, so its position is the stale one) |
| `mercantile-coast.keshu-grove` (reserve) | — | gideon-rootworm-terminus | 3298 | 4221 | no |
| `hist-heartland.hist-first-rain-trunk` (reserve) | — | east-estuary-rootworm-station | 918 | 1851 | no |

Two of the three placeholder far ends (`north-shadowfen` at Stormhold, `naga-deeps` at Dead Water) have no station record at all.

## 8. Near pairs, co-siting, density (brief items c, d)

Pairs < 150 m that name each other in `relations`: `guide-camp-gate-side` ↔ `helstrom` (94 m);
`helstrom` ↔ `rootworm-station-helstrom` (92 m). No pair < 150 m shares a `proseRefs.sourcePath`
(only 22 of 116 records carry `proseRefs` at all). Both near pairs are also the A6 overlap pairs:
they are co-siting candidates inside Helstrom's 230 m footprint (city districts), not merges.

Two-visible / approach cue (report only): every record but two has at least one neighbour within
300 m (46 records have six or more). The two isolates are `blackguard-hideout-raw` and
`falling-mage-impact` — appropriate for a hideout and a crash site.

**Density.** Ledger §2 line for the region: 109 moved, median 1253.8 m, p90 3012.1 m, max 4694.0 m
(my count of moves > 150 m is **104**; the ledger's 109 counts moves above its own smaller floor).
Live 116 by `densityLayer`: destination 46, fine-tempo 45, landmark 25 — matching the report's `byZone`.

## 9. Every live record moved > 150 m (104)

| id | type | moved m | layer | region class | band/tier | road m | lane m | pf.water |
|---|---|---|---|---|---|---|---|---|
| `cut-and-carried` | hist-village | 4694.0 | destination | firm lowland | D4/D3 | 92.4 | 1099.6 | marsh-deep 54.8 |
| `necropolis-dead-tenders` | necropolis-village | 4602.6 | destination | firm lowland | D4/D3 | 287.9 | 847.0 | backswamp 88.4 |
| `treasure-hunters-live-camp` | treasure-hunters-camp | 3846.2 | fine-tempo | rootland deep marsh | D5/D4 | 87.2 | 1817.4 | marsh-deep 0.0 |
| `wisp-lure-basin` | wisp-lure | 3613.0 | fine-tempo | rootland deep marsh | D5/D5 | 163.6 | 2057.1 | marsh-deep 0.0 |
| `root-gallery-collapsed-nine` | root-hollow-gallery | 3482.0 | fine-tempo | interior swamp | D5/D4 | 256.6 | 101.5 | marsh-deep 0.0 |
| `fenlord-tomb-deep` | fenlord-tomb | 3445.0 | destination | firm lowland | D5/D5 | 358.3 | 1385.7 | marsh-deep 29.5 |
| `marsh-giant-ground-basin` | marsh-giant-ground | 3413.8 | fine-tempo | rootland deep marsh | D5/D4 | 159.0 | 2113.4 | marsh-deep 34.7 |
| `submerged-xanmeer-topmost` | submerged-xanmeer | 3249.0 | destination | lake & standing water | D4/D4 | 266.3 | 695.9 | pool 0.0 |
| `umbriel-stripped-quiet` | umbriel-stripped-village | 3208.6 | destination | fringe marsh | D3/D4 | 343.3 | 670.5 | marsh-fringe 24.5 |
| `hammock-tree-island-greenmoss` | hammock-village | 3104.5 | fine-tempo | seasonal floodplain | D4/D3 | 134.6 | 1196.3 | backswamp 5.5 |
| `serpent-ground-giant-snake` | serpent-ground | 3028.0 | fine-tempo | firm lowland | D3/D4 | 425.7 | 852.4 | marsh-fringe 140.6 |
| `dream-wallow-starblossom` | dream-wallow | 3008.2 | fine-tempo | rootland deep marsh | D5/D4 | 33.3 | 843.5 | marsh-deep 214.1 |
| `drawdown-flat-exposed` | drawdown-flat | 2958.1 | fine-tempo | firm lowland | D3/D3 | 46.7 | 1089.3 | sloped-rapid 131.6 |
| `xal-krona-making-ground` | marsh-giant-ground | 2781.0 | landmark | rootland deep marsh | D5/D5 | 418.6 | 1442.7 | marsh-deep 38.4 |
| `cult-raid-camp-unbound` | cult-raid-camp | 2756.2 | landmark | firm lowland | D3/D4 | 517.1 | 720.6 | marsh-fringe 114.1 |
| `canopy-crossing-rope-basin` | canopy-crossing | 2691.8 | fine-tempo | rootland deep marsh | D5/D4 | 971.2 | 183.7 | marsh-deep 76.8 |
| `root-gallery-drowned-stair` | root-hollow-gallery | 2678.4 | fine-tempo | lake & standing water | D5/D4 | 1063.4 | 133.7 | backswamp 0.0 |
| `platform-ladder-tower-watch` | platform-ladder-tower | 2611.3 | destination | rootland deep marsh | D4/D3 | 513.7 | 432.8 | marsh-deep 27.4 |
| `broken-xanmeer-subsumed` | broken-xanmeer | 2604.5 | fine-tempo | coastal lagoon & salt marsh | D3/D4 | 494.1 | 410.8 | marsh-fringe 24.5 |
| `lost-city` | sealed-xanmeer | 2598.8 | landmark | seasonal floodplain | D5/D5 | 278.7 | 1286.6 | marsh-deep 21.9 |
| `stone-calendar-hist-tsoko` | stone-calendar | 2590.4 | landmark | firm lowland | D3/D3 | 650.2 | 704.7 | marsh-fringe 87.7 |
| `rootworm-burrow-dead` | wild-rootworm-burrow | 2578.0 | fine-tempo | rootland deep marsh | D5/D4 | 791.1 | 151.2 | marsh-deep 69.8 |
| `rootworm-burrow-live` | wild-rootworm-burrow | 2362.3 | destination | firm lowland | D4/D4 | 550.3 | 654.7 | marsh-deep 39.5 |
| `canopy-crossing-root-high` | canopy-crossing | 2356.7 | fine-tempo | upland hills | D3/D3 | 28.7 | 810.5 | ocean 102.4 |
| `pilgrim-camp-sap-road` | pilgrim-camp | 2299.0 | fine-tempo | firm lowland | D3/D4 | 280.5 | 798.5 | marsh-fringe 66.9 |
| `heretic-stone-restarted` | heretic-stone-village | 2285.2 | landmark | upland hills | D3/D4 | 263.6 | 551.1 | marsh-deep 191.5 |
| `bioluminescent-glowfen` | bioluminescent-water | 2234.2 | destination | upland hills | D3/D3 | 213.3 | 721.1 | lagoon 240.4 |
| `artisan-chime-makers` | artisan-village | 2034.4 | destination | firm lowland | D4/D3 | 325.0 | 87.1 | marsh-deep 34.7 |
| `refuge-station-interior` | refuge-station | 2017.2 | landmark | firm lowland | D4/D4 | 670.9 | 217.5 | marsh-deep 117.4 |
| `nisswo-rest-house-interior` | nisswo-rest-house | 1967.5 | destination | firm lowland | D4/D3 | 90.5 | 925.2 | lake-lowland 31.0 |
| `collapsing-pinnacle-interior` | collapsing-pinnacle | 1961.9 | destination | firm lowland | D4/D4 | 464.7 | 1453.0 | marsh-deep 50.6 |
| `dive-shaft-xanmeer-well` | dive-shaft | 1916.2 | destination | lake & standing water | D5/D5 | 334.7 | 1356.0 | marsh-deep 0.0 |
| `sap-touched-miredancer` | root-hollow-gallery | 1904.0 | destination | firm lowland | D5/D4 | 179.2 | 1242.5 | backswamp 120.4 |
| `bone-waystation-interior` | bone-repatriation-waystation | 1859.5 | destination | firm lowland | D3/D3 | 81.9 | 995.3 | marsh-deep 114.1 |
| `memorial-stone-personal-guide` | memorial-stone | 1823.5 | fine-tempo | firm lowland | D4/D4 | 118.2 | 997.0 | sloped-rapid 74.6 |
| `bereaved-mnemic` | bereaved-village | 1821.6 | landmark | fringe marsh | D3/D4 | 266.4 | 331.7 | lagoon 22.6 |
| `vista-ledge-canopy-break` | vista-ledge | 1815.1 | destination | firm lowland | D4/D4 | 152.8 | 952.5 | lake-lowland 108.6 |
| `root-talk-ground` | convocation-ground | 1809.6 | landmark | rootland deep marsh | D5/D4 | 788.3 | 347.1 | horizontal-channel 49.0 |
| `dream-wallow-sap-pool` | dream-wallow | 1783.3 | destination | tropical jungle | D4/D4 | 250.7 | 1181.9 | swamp 100.7 |
| `hackwing-roost-wild` | hackwing-roost | 1674.5 | fine-tempo | firm lowland | D4/D3 | 219.5 | 32.4 | marsh-deep 12.3 |
| `mass-grave-flu-memorial` | mass-grave-memorial | 1650.3 | fine-tempo | firm lowland | D3/D3 | 75.0 | 1068.0 | swamp 130.0 |
| `nightbound-lightless` | nightbound-village | 1594.0 | landmark | rootland deep marsh | D5/D4 | 506.5 | 862.1 | marsh-deep 23.3 |
| `daril-fermentary-interior` | daril-fermentary | 1564.7 | destination | rootland deep marsh | D5/D4 | 364.3 | 1352.5 | marsh-deep 5.5 |
| `beast-offering-flood-staying` | beast-offering-shrine | 1499.2 | fine-tempo | interior swamp | D5/D3 | 384.6 | 24.9 | marsh-deep 7.8 |
| `hist-agaceph-needle` | hero-hist-grove | 1481.6 | landmark | rootland deep marsh | D5/D4 | 514.3 | 975.8 | marsh-deep 0.0 |
| `poacher-camp-sap` | poacher-camp | 1457.9 | fine-tempo | rootland deep marsh | D5/D4 | 970.4 | 8.7 | marsh-deep 5.5 |
| `burn-scar-village-ash` | burn-scar-village | 1449.7 | fine-tempo | firm lowland | D3/D4 | 85.8 | 813.7 | ocean 117.7 |
| `hammock-crown-ancestor` | hammock-crown-terrace | 1420.9 | fine-tempo | firm lowland | D4/D4 | 248.4 | 847.3 | marsh-deep 122.6 |
| `walkway-junction-high-crossroads` | walkway-junction | 1415.4 | fine-tempo | rootland deep marsh | D5/D4 | 233.1 | 644.3 | marsh-deep 51.7 |
| `mist-locked-hollow-basin` | mist-locked-hollow | 1376.5 | fine-tempo | rootland deep marsh | D5/D4 | 90.5 | 1945.6 | marsh-deep 5.5 |
| `boardwalk-branching-many-ways` | boardwalk-village | 1375.2 | fine-tempo | rootland deep marsh | D5/D4 | 79.3 | 828.6 | marsh-deep 35.1 |
| `tended-xanmeer-pilgrim-way` | tended-xanmeer | 1321.5 | fine-tempo | firm lowland | D4/D3 | 335.8 | 650.2 | marsh-deep 45.2 |
| `hist-sarpa-highflower` | hero-hist-grove | 1289.6 | landmark | rootland deep marsh | D5/D4 | 855.9 | 232.3 | marsh-deep 11.0 |
| `root-gallery-lantern-hollow` | root-hollow-gallery | 1271.7 | fine-tempo | rootland deep marsh | D5/D4 | 608.1 | 359.3 | backswamp 55.9 |
| `hist-paatru-lowcrown` | hero-hist-grove | 1253.8 | landmark | rootland deep marsh | D5/D4 | 307.0 | 469.2 | sloped-riffle 0.0 |
| `hist-first-rain-trunk` | hero-hist-grove | 1224.1 | landmark | interior swamp | D4/D4 | 128.2 | 750.0 | swamp 46.9 |
| `urn-vault-blasphemers` | urn-vault | 1208.5 | destination | firm lowland | D3/D4 | 388.8 | 651.2 | pond 89.3 |
| `bog-blight-ground-stakes` | bog-blight-ground | 1205.2 | destination | fringe marsh | D3/D4 | 69.9 | 571.0 | swamp 165.3 |
| `hermit-hut-mad-basin` | hermit-hut | 1078.6 | fine-tempo | rootland deep marsh | D5/D5 | 249.9 | 1749.3 | marsh-deep 83.5 |
| `root-gallery-cult-warren` | root-hollow-gallery | 1048.4 | landmark | rootland deep marsh | D5/D4 | 485.5 | 1458.1 | marsh-deep 90.4 |
| `blackguard-hideout-raw` | blackguard-hideout | 1029.4 | fine-tempo | mangrove forest | D3/D4 | 947.1 | 35.8 | ocean 12.3 |
| `sap-collection-facility-daedric` | sap-collection-facility | 968.6 | landmark | rootland deep marsh | D5/D5 | 381.2 | 1335.5 | marsh-deep 98.9 |
| `waterfall-chamber-root-fall` | waterfall-chamber | 932.3 | fine-tempo | rootland deep marsh | D5/D3 | 241.6 | 545.6 | sloped-riffle 0.0 |
| `hist-less-refuge-wild` | hist-less-refuge | 909.2 | destination | firm lowland | D5/D4 | 789.8 | 501.7 | marsh-deep 19.8 |
| `insular-hereditary-watch` | insular-village | 825.8 | destination | rootland deep marsh | D5/D4 | 882.7 | 30.3 | marsh-deep 11.0 |
| `hermit-hut-exile-warden` | hermit-hut | 794.3 | fine-tempo | fringe marsh | D3/D4 | 951.0 | 298.9 | ocean 17.3 |
| `sleeping-in-the-ring` | broken-xanmeer | 779.4 | destination | fringe marsh | D3/D3 | 14.0 | 597.1 | marsh-fringe 55.9 |
| `root-gallery-kept-light` | root-hollow-gallery | 765.7 | destination | rootland deep marsh | D5/D4 | 695.0 | 606.4 | marsh-deep 5.5 |
| `standing-curiosity-unexplained` | standing-curiosity | 743.5 | fine-tempo | firm lowland | D3/D4 | 324.8 | 856.0 | marsh-fringe 147.1 |
| `barsaebic-sub-city` | barsaebic-compound | 719.5 | destination | fringe marsh | D3/D4 | 434.7 | 571.4 | horizontal-channel 7.8 |
| `the-cut-circle` | cult-raid-camp | 703.1 | destination | fringe marsh | D3/D3 | 37.8 | 563.5 | marsh-fringe 12.3 |
| `harmed-hist-tapped` | harmed-hist | 656.9 | destination | firm lowland | D5/D4 | 362.7 | 1372.2 | sloped-rapid 27.4 |
| `guide-camp-far-shelter` | guide-camp | 645.7 | destination | rootland deep marsh | D5/D5 | 410.7 | 1073.0 | marsh-deep 5.5 |
| `umpholo-mission` | empty-mission | 615.1 | landmark | fringe marsh | D3/D4 | 536.2 | 601.1 | marsh-fringe 21.9 |
| `xanmeer-fort-defences-working` | inhabited-xanmeer-fort | 597.4 | landmark | firm lowland | D4/D4 | 151.4 | 820.6 | marsh-deep 42.8 |
| `maturity-trial-chukka-sei` | maturity-trial-ground | 580.0 | destination | fringe marsh | D4/D4 | 38.9 | 545.9 | marsh-deep 148.1 |
| `root-gallery-helstrom-underway` | root-hollow-gallery | 570.0 | landmark | firm lowland | D5/D3 | 863.6 | 404.4 | marsh-deep 118.1 |
| `duskfall-unmade-site` | duskfall-horizon-site | 559.7 | destination | firm lowland | D3/D4 | 750.7 | 441.5 | pool 81.5 |
| `guide-camp-gate-side` | guide-camp | 493.4 | landmark | rootland deep marsh | D5/D4 | 743.3 | 271.8 | marsh-deep 5.5 |
| `officeholder-tree-minder-house` | officeholders-house | 493.3 | destination | firm lowland | D3/D3 | 13.2 | 652.6 | marsh-fringe 245.2 |
| `sinkhole-mouth-basin` | sinkhole-mouth | 470.5 | destination | upland hills | D3/D4 | 121.7 | 605.8 | marsh-deep 263.2 |
| `beast-keeper-lizard-steed` | wamasu-pond | 458.8 | destination | fringe marsh | D3/D3 | 398.0 | 476.9 | ocean 21.9 |
| `wild-hist-sleeper` | wild-hist | 430.9 | destination | tropical jungle | D4/D4 | 419.6 | 1101.3 | swamp 7.8 |
| `squatted-ruin-home-hollow` | squatted-ruin-home | 426.0 | fine-tempo | firm lowland | D4/D3 | 52.7 | 942.2 | marsh-deep 133.5 |
| `air-pocket-station-basin` | air-pocket-station | 397.9 | destination | lake & standing water | D3/D4 | 434.3 | 596.4 | pond 0.0 |
| `climbable-ruin-roof-terrace` | climbable-ruin-roof | 385.1 | fine-tempo | firm lowland | D3/D4 | 712.5 | 666.3 | marsh-deep 109.7 |
| `drowning-narrows-current` | drowning-narrows | 359.8 | fine-tempo | upland hills | D3/D4 | 108.6 | 738.3 | lagoon 162.4 |
| `stilt-channel-edge-two-poles` | stilt-village | 319.0 | fine-tempo | fringe marsh | D3/D3 | 510.6 | 452.5 | marsh-fringe 24.5 |
| `officeholder-grave-singer-house` | officeholders-house | 290.0 | fine-tempo | firm lowland | D5/D3 | 147.8 | 650.0 | sloped-riffle 74.6 |
| `waiting-vigil-village` | plague-abandoned-village | 285.3 | destination | fringe marsh | D3/D4 | 640.0 | 644.4 | lagoon 5.5 |
| `wamasu-pond-nest` | wamasu-pond | 285.3 | fine-tempo | fringe marsh | D4/D5 | 570.5 | 333.7 | marsh-deep 0.0 |
| `helstrom` | hist-grove-capital | 275.9 | landmark | rootland deep marsh | D5/D1 | 811.6 | 179.1 | marsh-deep 17.3 |
| `bubble-spire-open-helstrom` | bubble-spire-exit | 243.0 | destination | fringe marsh | D3/D3 | 52.7 | 630.1 | marsh-fringe 71.5 |
| `whitewater-reach-panther` | whitewater-reach | 219.9 | fine-tempo | firm lowland | D4/D3 | 380.9 | 386.6 | marsh-deep 32.9 |
| `voriplasm-chamber-sealed` | voriplasm-chamber | 198.7 | destination | lake & standing water | D3/D4 | 519.5 | 518.2 | lagoon 0.0 |
| `alten-markmont` | foreign-trading-station | 198.6 | destination | firm lowland | D4/D4 | 694.1 | 717.1 | marsh-deep 74.6 |
| `tended-xanmeer-clan-north` | tended-xanmeer | 197.4 | destination | firm lowland | D5/D3 | 52.7 | 720.7 | marsh-deep 138.8 |
| `wild-hist-mad-one` | wild-hist | 183.9 | destination | firm lowland | D5/D5 | 381.6 | 1695.6 | marsh-deep 103.0 |
| `miregaunt-ward-approach` | miregaunt-ward | 180.3 | destination | firm lowland | D5/D5 | 370.6 | 1029.1 | marsh-deep 28.0 |
| `falling-mage-impact` | fallen-flier | 171.7 | landmark | tropical jungle | D4/D4 | 718.8 | 1372.1 | swamp 47.2 |
| `bubble-spire-collapsed` | bubble-spire-exit | 171.2 | fine-tempo | tropical jungle | D4/D4 | 204.6 | 818.1 | swamp 24.5 |
| `stilt-channel-edge-uxaneet` | stilt-village | 164.9 | fine-tempo | interior swamp | D5/D4 | 535.9 | 523.4 | marsh-deep 0.0 |
| `root-gallery-deep-throat` | root-hollow-gallery | 159.4 | destination | firm lowland | D3/D5 | 408.4 | 778.9 | marsh-fringe 100.8 |
| `legendary-deep-medusa-wood` | legendary-deep | 151.7 | destination | fringe marsh | D3/D5 | 624.5 | 600.5 | marsh-fringe 0.0 |
## 10. Candidate remedies (vocabulary only — no decision taken)

| record | failure measured | candidates |
|---|---|---|
| `helstrom` + gate | lane ends on 0.00 m ground 3.9 m from the gate; no berth record | `pin-by-siting` on a new/renamed berth record: `boundTo {place: helstrom, maxM: 300}` + `hardConstraints: ["at the water edge of route.boat.alten-corimont-helstrom", "recorded depth ≥ 0.6 m"]` — the nearest lane sample with depth ≥ 0.24 m is [3427, 2769], 421 m from centre; OR `meso-move` `poacher-camp-sap` (9 m from the lane, 383 m from centre) is a poacher's camp, not a berth, so `re-type` it to `landing`/`porter-relay-yard` is the alternative; OR `prose-rewrite` Helstrom's approach to "poled in over marsh, no quay" and drop the boat mode from its `travelStation` |
| `helstrom` A7 | D1 on band 5 | `prose-rewrite` (the city's safety is its own, the ground around it is not) or re-tier to D2 — needs the region's danger policy, not a plot move |
| `helstrom` footprints | −182.6 / −180.8 m overlap | co-site: mark `rootworm-station-helstrom` and `guide-camp-gate-side` as districts of `helstrom` (`merge` into `cityLayout`) rather than moving them |
| `lost-city` | `underwater-entry` on dry ground, water 21.9 m | `meso-move` 21.9 m onto `body.1475-2118` (maxDepth 2.38 m) — but that sinks the making-ground bind; or `prose-rewrite`+field change to a dry sealed entrance |
| `group.lost-city` | 186.5 m vs 120 m register (220 m in catalogue) | `pin-by-siting` `boundTo {place: lost-city, maxM: 100}` — 254 dry cells within 100 m exist, e.g. [2704.5, 3930.6]-ish dry band; OR reconcile the two live numbers (decide 120 or 220) |
| `xal-krona-making-ground` | "flooded pool" on dry ground | `prose-rewrite` the founding sentence, or `meso-move` 38.4 m to `marsh-deep` |
| `air-pocket-station-basin`, `root-gallery-drowned-stair`, `wamasu-pond-nest` | dive entrance in 0.60–0.84 m | `meso-move` to the deepest cell of the same body (all < 150 m), or `re-type`/`prose-rewrite` the entrance to a wade |
| `greenspring` | known-red `waterRelation`, water 93.2 m | `meso-move` 93–100 m to the marsh edge (within 150 m, no re-patch needed), or drop the request and `prose-rewrite` the "channel bank" claim |
| `drowning-narrows-current` | request refused; dot 158.7 m from a 528 m² lagoon at 81.5 m elevation | `meso-move` to a graph narrows, or `re-type` off `narrows`, or `cut` the terrain request |
| `waterfall-chamber-root-fall` | request refused; no chamber cut; D3 on band 5 | `meso-move` to an existing fall reach, or `prose-rewrite` to a riffle-side root hollow |
| `sap-tapping-licensed` | no `terminal.sap-tapping-licensed.track-head` anywhere; 767 m from a road | `pin-by-siting` (author the terminal) or `meso-move` toward the Archon–Gideon road |
| 16 dangling `patrols` | five `route.track.hist-heartland.*` ids do not exist | author the tracks, or `prose-rewrite`/strip the relations — a plot move cannot fix it |
| `beast-keeper-lizard-steed`, `burn-scar-village-ash` | water keyed to `body.ocean` inland | `prose-rewrite`, or `meso-move` to a named interior body |
| `sinkhole-mouth-basin` | prose water 263.2 m away | `meso-move` (>150 m, so a re-plot) or `prose-rewrite` |
| 21 fine-tempo records > 220 m from any route | A8 | mostly `pin-by-siting` (`maxFromM` against the nearest route) — but several are types whose whole point is being off the road (`hermit-hut-*`, `blackguard-hideout-raw`): the decision is which of the 21 carry a network role |
| hero-Hist stations | 3 of 10 slots served | `pin-by-siting` new `rootworm-station` records bound to `sealed-xanmeer-living`, `hist-sarpa-highflower`, `hist-agaceph-needle`, `stormhold`, `dead-water-village`; or `prose-rewrite` the Underground Express as a three-node line |
