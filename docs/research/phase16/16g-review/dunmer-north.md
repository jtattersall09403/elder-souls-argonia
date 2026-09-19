# 16g review — `dunmer-north` (measured, not decided)

Measured 2026-09-19 on the committed tree (working copy) against
`world/sources/sites/macro-plot.json`, the frozen hydrology graph and
`worldgen.site_fields.ProvinceSurvey`. Previous positions are `HEAD`.
127 live sited records; 112 moved more than 150 m (region median 977 m).

## Reconciliation

| live doc | what it already says | this file |
|---|---|---|
| `docs/research/phase16/16g-ledger.md` §2 | province move table, fifteen largest moves, "Reasoning: _(to be written by hand)_" | supplies the per-record measurement for this region; the ledger's dunmer-north row (122 moved, median 977.2, max 5344.1) is CONFIRMED (112 over 150 m of 127 live) |
| `world/sources/sites/macro-plot.md` / `.json` | homeless / typedSitingViolations / relaxed / dangling / namedConstraintChecks | CONFIRMED: no homeless and no typed-siting violation in this region; 20 relaxed, 10 dangling, 25 named-constraint rows |
| `world/sources/terrain/terrain-request-known-red.json` | 3 dunmer-north known-red requests | CONFIRMED still red after the re-solve; two of the three moved far enough that the red is now a *different* failure (below) |
| `docs/research/phase16/16g-ledger.md` §"Named waters" | `Charge Pond` nearest body `body.2673-71`, 371 m | SUPERSEDED: the record is now 3.7 km away in the border mountains, 41.8 m from a **seasonal sloped-rapid** at 382 m |

Single doc to edit: **`docs/research/phase16/16g-ledger.md` §2** (its reasoning
rows). No new doc beyond this measurement annex.

## Summary — what needs a decision (10 lines)

1. **`hatching-pools` left Shadowfen.** Hero Hist 2/10, canon "Central
   Shadowfen" (`shadowfen.md:67`), was 772 m from Stormhold, now 4377 m at the
   far east coast, 66 m from the ocean, on a hard constraint of "warm spring-fed
   shallow pools, screened on every side". Decide: pin-by-siting back to
   Stormhold's hinterland, or rewrite the prose that ties it to Shadowfen.
2. **The Bogmother causeway is a causeway to nowhere.** `bogmother` sits 4249 m
   **east** of Stormhold; the dossier records it south-west with a stone causeway from
   Stormhold (`shadowfen.md:69`). `stormhold-causeway` + `the-black-stage` (its
   "last span") sit at Stormhold, 4.2 km from their destination.
3. **`the-charge-pond` promise is unbuildable where it now stands** (pool 0.7 m
   vs 3.0 m asked): the dot is on a *seasonal* rapid at 382 m in the border
   mountains, 1653 m from any route, with an underwater-entry interior.
4. **Five underwater-entry / wreck records stand on water under 1.0 m**
   (`feeds-the-north` 0.0 m on the ocean shore, `the-tear-wreck` 0.0 m 194 m
   from a tarn, `the-shoal-bank` 0.72 m, `the-divers-landing` 0.0 m,
   `the-charge-pond` 0.0 m). Only `the-drowned-terrace` (24.6 m) reads.
5. **Thorn has no harbour water.** Every lane-side record at Thorn measures
   ≤ 1.2 m within 100 m; `the-thorn-bond` (boat station) measures 0.0 m —
   below canoe class (0.6 m). Stormhold's city dot is 1.2 m but its causeway
   shoulder 70 m off is 9.27 m.
6. **Ten relations point at routes that do not exist**, including the cut
   `route.road.alten-corimont-stormhold` (2 records), `route.road.thorn-tear-road`
   (4), `route.road.stormhold-thorn`, `route.boat.stormhold-alten-corimont` and
   `route.track.bogmother-causeway`.
7. **Two `boundTo` targets have no position**: `the-crown-terrace` →
   `stands-on-the-hammock` (not in the region file), `the-pass-station` →
   `the-two-gate-bridge` (the station itself is unsited).
8. **Two cart/porter stations are off the network**: `the-field-gate-garrison`
   843 m and `the-last-landing` 1212 m from the nearest route (A8 ≤ 220 m).
9. **Four A7 danger mismatches ≥ 2 bands**, worst `the-thousand-birds` (D2 on
   band 0) and `channel-cross-village` (D2 on band 4).
10. **`the-northern-rest` prose names the Bogmother causeway road**; it is
    268 m from any route and 3301 m from where it was.

## A. Named-list and terrain-promise records

| id | type | moved m | measurement | fails |
|---|---|---|---|---|
| `the-charge-pond` | wamasu-pond | 3747 | dot [792,491]; water `reach.430-268` **sloped-rapid, seasonal**, 41.8 m, level 382.08; recorded depth at dot 0.0; border mountains; route 1653 m; danger D4 vs band 3 | B7 promise (3.0 m pool), A9 (a held still pond asked, a seasonal rapid given), underwater entry with no water |
| `the-divers-landing` | salvage-divers-yard | 651 | `body.1002-335` Dravanen Tarn 27.4 m; depth at dot 0.0; bound to `the-drowned-terrace` 58 m (max 300, ok) | known-red `depthClass`; A6b clearance −32 m; "deep water two boat-lengths out" not at the dot |
| `the-slumped-hamlet` | subsidence-hamlet | 365 | `body.2879-340` Rethanen Tarn 142.6 m; prose "a rebuilt hamlet in sight of it" — nearest live neighbour 227 m (`the-field-gate-garrison`) | known-red `waterRelation` |
| `the-two-hundred-roofs` | plague-abandoned-village | 3450 | now 158 m from `body.ocean`; prose "good high ground **on the channel network**"; boat station; max depth within 100 m **0.0** | known-red `waterRelation` still red; B5 (boat mode, no water) |
| `stormhold` | terraced-river-city | 62 | `reach.1472-491` 98.9 m, head-of-navigation claim; max depth 100 m **1.20**; A6b −171 m vs its own falls chamber | B5 keel 3.0 not met at the city dot (9.27 m 70 m west at `body.1373-544`) |
| `thorn` | field-margin-city | 60 | `reach.3385-271` **seasonal**, 71.5 m; max depth 100 m **0.50**; "river access down to the coast" | B5 canoe 0.6 not met; prose river claim on a seasonal rapid |
| `hatching-pools` | hatchery-village | **4728** | [7043.6,1187.2]; 66 m from `body.ocean`; 4377 m from Stormhold (was 772); route 526 m; danger D2 vs band 3 | LORE (the dossier puts it in central Shadowfen); "warm spring-fed shallows, screened on every side" now a sea shore |
| `murkwater-shadowscale-ground` | shadowscale-ground | 436 | bound-check 223 m to `murkwater`; `body.3708-816` marsh-fringe 24.5 m; 8 live records within 300 m | "screened hollow, the village heard nothing" vs 8 neighbours in sight |
| `mazzatun` | heretic-stone-village | 0 | unmoved [1985,1341]; upland hills, 203 m elevation, `reach.1078-739` sloped-chute 109.7 m | prose "deep in the north-east **swamp**" on upland-hills ground; A6b −14 m vs its Hist |
| `mazzatun-hist` | harmed-hist | 116 | bound 126 m (max 150, ok); `body.1024-834` pond 83.7 m | "at the city's centre" — 126 m from it; A6b −14 m |
| `the-wild-mouth` | wild-rootworm-burrow | 2418 | `body.2899-881` lagoon 126.6 m; "dry root ground"; route 86.7 m; 8 records within 300 m | prose "two kilometres off the Waykeepers' line" unverified against the new route set |
| `the-north-root-gallery` | root-hollow-gallery | 210 | `reach.2695-106` 12.3 m, seasonal; "roots over rock"; route 1139 m | none measured beyond remoteness |
| `the-northern-rest` | nisswo-rest-house | 3301 | route 268 m; `reachedVia route.track.bogmother-causeway` dangling; 306 m from `body.3234-806` | A8-equivalent ("on a pilgrim route"); prose names a dead road |

## B. Underwater / wreck depth check

Threshold: hull ≥ 1.5 m, dive entrance ≥ 1.0 m. Depth = `recorded_depth_m` at the dot.

| id | family/entrance | water kind (distance) | depth at dot | max depth ≤100 m | verdict |
|---|---|---|---|---|---|
| `the-drowned-terrace` | xanmeer-complex / underwater-entry | tarn-upland, 0 m | **24.60** | — | PASS |
| `the-shoal-bank` | **shipwreck** / underwater-entry | marsh-deep, 5.5 m | 0.72 | 12.61 | FAIL hull 1.5 (dot), dive 1.0 |
| `the-tear-wreck` | **shipwreck** / underwater-entry | tarn-upland, **194.5 m** | 0.00 | — | FAIL both; the wreck is on dry ground |
| `feeds-the-north` | flooded-cave / underwater-entry | ocean, 5.5 m | 0.00 | 106.36 | FAIL at the dot (swim 45 m, dive 10 m promised) |
| `loriasel-caverns` | ayleid-nedic / underwater-entry | tarn-upland, 16.5 m | 0.36 | — | FAIL dive 1.0 (dive 16 m promised) |
| `the-divers-landing` | flooded-cave / underwater-entry | tarn-upland, 27.4 m | 0.00 | — | FAIL dive 1.0 |
| `the-charge-pond` | flooded-cave / underwater-entry | sloped-rapid, 41.8 m | 0.00 | — | FAIL dive 1.0 |
| `dry-under-water` | flooded-cave / underwater-entry | **unsited (no positionM)** | — | — | cannot measure |

## C. A6b, A7, A8, boundTo, sightline

A6b = nearest-neighbour distance minus the sum of both footprint radii (negative = footprints overlap).

| id | moved | flag | measurement |
|---|---|---|---|
| `stormhold` / `the-stormhold-falls-chamber` | 62 / 391 | A6b −171 | 84 m apart, radii 230+25 |
| `stormhold` / `stormhold-causeway` | 62 / 258 | A6b −176 | 98.9 m, 230+45 |
| `thorn` / `thorn-paddy-terraces` | 60 / 53 | A6b −219 | 56.1 m, 230+45 |
| `thorn` / `the-thorn-bond` | 60 / 91 | A6b −217 | 58.1 m, 230+45 |
| `hissmir` / `waits-for-the-trial` | 779 / 744 | A6b −94 | 90.8 m, 140+45 |
| `the-north-holding-pit` / `wolk-market` | 4220 / 1259 | A6b −111 | 69.4 m, 40+140 |
| `gandranen-ruins` / `gandranen-library` | 653 / 644 | A6b −33 | 57.2 m, 45+45 |
| `the-divers-landing` / `the-drowned-terrace` | 651 / 472 | A6b −32 | 58.3 m, 45+45 |
| `mazzatun` / `mazzatun-hist` | 0 / 116 | A6b −14 | 125.8 m, 105+35 |
| `the-thousand-birds` | 521 | A7 | D2 on danger band **0** |
| `channel-cross-village` | 1464 | A7 | D2 on band **4** |
| `reedmoor-stilts` | 3591 | A7 | D1 on band 3 |
| `riverwalk` | 3289 | A7 | D1 on band 3 |
| `the-diggings-ladder` | 551 | A7 | D1 on band 3 |
| `the-field-gate-garrison` | 628 | A8 | cart station, **843 m** from the nearest route |
| `the-last-landing` | 1086 | A8 | head-of-navigation with porter mode, **1212 m** |
| `the-ash-causeway` | 778 | A8 | causeway **466 m** from any route |
| `channel-cross-village` | 1464 | A8 (water role) | 413 m from a road; boat/pilot station, 12.3 m from marsh-deep, 3.78 m depth — reads as a water station, not a road one |
| `the-crown-terrace` | 321 | boundTo | target `stands-on-the-hammock` has no record/position (max 200 m) |
| `the-pass-station` | unsited | boundTo | itself unsited; target `the-two-gate-bridge` (max 2200 m) |

All other `boundTo` pairs pass: `gandranen-library` 57/150, `mazzatun-hist`
126/150, `the-diggings-ladder` 226/400, `the-divers-landing` 58/300,
`the-pen-yard` 340/700, `the-silyanorn-crown` 221/250, `the-standing-bid`
157/600, `the-stripped-village` 865/1200, `waits-for-the-trial` 91/450.
All three region sightline checks in `namedConstraintChecks` report
`lineOfSight: true` (`the-first-count` → `stormhold` 1499 m; `the-flu-cordon` →
`stormhold` 1690 m; and the third at 1288 m) — re-measured with
`line_of_sight(eye_a=1.7, eye_b=8.0)`: all true.

## D. Dead route references (dangling) and the Bogmother chain

| record | field | target | state |
|---|---|---|---|
| `hatching-pools` | patrols | `route.road.alten-corimont-stormhold` | cut to a track in 16e (0069) |
| `the-xanmeer-hold` | patrols | `route.road.alten-corimont-stormhold` | cut |
| `the-drover-camp`, `the-field-gate-garrison`, `the-north-border-post`, `the-two-gate-bridge`, `thorn` | patrols / tolls | `route.road.thorn-tear-road` | not in `routes.json` (live ids: archon-gideon, blackrose-lilmoth, gideon-blackwood-road, gideon-soulrest, gideon-stormhold, soulrest-blackrose, stormhold-thorn, thorn-tear-road **absent**) |
| `riverwalk` | tolls | `route.road.stormhold-thorn` | id exists as `route.road.stormhold-thorn` in routes.json — the dangle is on the **route.road.** prefix the plot checked; re-check the id form |
| `stormhold` | tolls | `route.boat.stormhold-alten-corimont` | lane exists in `waterways.json`, not in `routes.json` — the checker reads roads only |
| `the-northern-rest` | reachedVia | `route.track.bogmother-causeway` | no such track anywhere |

Bogmother chain geometry: `stormhold` [2684,792] → `stormhold-causeway`
[2585.5,801.1] (99 m) → `the-black-stage` [2434.1,943.7] (259 m further, prose:
"the last two hundred metres" of the causeway) → `bogmother` [6840.7,1675.2],
**4249 m east-south-east of Stormhold**. `channel-cross-village` ("the junction
of the trunk channel and the Bogmother feeder") is 4.0 km from Bogmother;
`the-causeway-hearth` ("mid-point of an exposed crossing") is `deferred` and
unsited. The dossier (`world/sources/lore/regions/shadowfen.md:69`) puts Bogmother
**south-west of Stormhold** at the end of a stone causeway. HEAD had the same
break (was 4272 m), so this is inherited, not caused by the re-solve.

## E. Harbour stations

Stormhold centre [2684,792]; Thorn centre [6248,616]. "Lane-side" = within 60 m
of a `waterways.json` lane pixel; none of Thorn's candidates qualify, so the
nearest few are listed with their lane distance.

| city | id | d(centre) | nearest lane | lane m | water kind (m) | max depth ≤100 m |
|---|---|---|---|---|---|---|
| stormhold | `the-delta-byre` | 525 | `route.boat.stormhold-alten-corimont` | **29** | lake-lowland (29.5) | **12.61** |
| stormhold | `the-stormhold-falls-chamber` | 84 | same | **29** | sloped-rapid (35.1) | 2.35 |
| stormhold | `stormhold` (city, boat+rootworm) | 0 | same | **30** | sloped-rapid (98.9) | 1.20 |
| stormhold | `stormhold-causeway` | 99 | same | 69 | tarn-upland (97.2) | **9.27** |
| stormhold | `the-standing-bid` (tradehouse) | 157 | same | 82 | tarn-upland (5.5) | **9.27** |
| stormhold | `the-black-stage` (ferry-stage) | 292 | same | 233 | tarn-upland (33.4) | 9.27 |
| thorn | `thorn-paddy-terraces` | 56 | `route.boat.archon-thorn` | 62 | sloped-rapid (58.3) | 1.20 |
| thorn | `thorn` (city, boat+cart) | 0 | same | 64 | sloped-rapid (71.5) | **0.50** |
| thorn | `the-ninth-chapel` | 324 | same | 79 | sloped-rapid (73.8) | 1.20 |
| thorn | `stands-on-the-island` | 471 | same | 86 | marsh-fringe (5.5) | **106.36** |
| thorn | `the-thorn-bond` (boat station) | 58 | same | 118 | sloped-rapid (132.1) | **0.00** |

Reading: Stormhold **has** a lane-side deep-water candidate — `the-standing-bid`
and `stormhold-causeway` both stand 70–100 m from the city over `body.1373-544`
(Velasen Tarn) at 9.27 m, keel class. Thorn has **none**: its only deep water
within 600 m is the marsh-fringe at `stands-on-the-island` (471 m out, 106 m
deep — that number is the ocean sheet reached inside the window, so treat it as
"open water within 100 m", not a berth depth).

## F. Co-sited pairs (≤150 m and naming each other, plus every boundTo pair)

| a | b | m | link | reads as |
|---|---|---|---|---|
| `stormhold` | `the-stormhold-falls-chamber` | 84 | b.dependsOn | same-water / approach-through (the falls under the city) |
| `stormhold` | `stormhold-causeway` | 99 | b.dependsOn, a.supplies | approach-through |
| `thorn` | `thorn-paddy-terraces` | 56 | four-way | satellite (the city's fields) |
| `thorn` | `the-thorn-bond` | 58 | a.dependsOn, a.supplies | ferry-pair (the bond is Thorn's landing) |
| `gandranen-library` | `gandranen-ruins` | 57 | boundTo + dependsOn | **merge candidate**: one Barsaebic ruin, two records |
| `hissmir` | `waits-for-the-trial` | 91 | boundTo + reachedVia | satellite (pilgrim camp at the trial village) |
| `mazzatun` | `mazzatun-hist` | 126 | boundTo, mutual dependsOn | one design — the Hist is "at the city's centre" |
| `the-divers-landing` | `the-drowned-terrace` | 58 | boundTo + supplies | ferry-pair / same-water |
| `the-north-holding-pit` | `wolk-market` | 69 | a.reachedVia | approach-through (pit behind the market) |
| `stormhold` | `the-standing-bid` | 157 | boundTo | satellite |
| `the-outer-silyanorn` | `the-silyanorn-crown` | 221 | boundTo + visibleFrom | sightline set |
| `silyanorn-diggings` | `the-diggings-ladder` | 226 | boundTo, no relation edge | co-siting asserted by siting only — **dangling design link** |
| `the-dres-rows` | `the-pen-yard` | 340 | boundTo, no relation edge | same |
| `the-field-gate-garrison` | `the-stripped-village` | 865 | boundTo, no relation edge | same |

No pair shares a `proseRefs.sourcePath` in this region.

## G. Density

Ledger §2 has no per-zone density line for `dunmer-north`; its move table is
the only regional row. Measured live counts by `densityLayer`: **fine-tempo 78,
destination 34, landmark 15** (127 total), matching `byZone.dunmer-north.byLayer`
in `macro-plot.json` exactly. Province spacing for reference: nearest-neighbour
p5 67 m, median 127 m, p95 267 m.

## H. Candidate remedies (measured options, not decisions)

| record | options |
|---|---|
| `hatching-pools` | `pin-by-siting`: `boundTo {place: place.dunmer-north.stormhold, maxM: 1200}` + `landformClasses ["spring-head","any-shallow-marsh"]` (its HEAD dot [2322,1434] was 772 m from Stormhold and is still free); or `prose-rewrite` dropping "Central Shadowfen" and the spring claim — a hero Hist recorded as CANON_EXPLICIT makes that the weaker option |
| `bogmother` + `stormhold-causeway` + `the-black-stage` + `the-causeway-hearth` | `pin-by-siting`: `bogmother boundTo {place: stormhold, maxM: 2500}` with `sightlineTo: stormhold` so the causeway chain lands; or `prose-rewrite` the three causeway records to a local Stormhold crossing and let Bogmother be reached by water (which breaks `shadowfen.md:69`) |
| `the-charge-pond` | `meso-move` 42 m onto the pond it names — none within 100 m (max depth 0.0); `re-type` to a rapid-side lair recipe; or `pin-by-siting` `landformClasses ["pool","spring-head"]` + a `waterRelation` of `body` class so the solver must take a held body (nearest held body `body.2673-71`, 371 m in the ledger's named-water row, now 3.7 km away) |
| `the-tear-wreck` | `meso-move` ≤150 m is not enough (194.5 m to water): `pin-by-siting` `waterRelation` on `body.1072-121` (Aralen Tarn) with `boundTo` on it, or `re-type` to a beached-hull recipe that needs no depth |
| `feeds-the-north`, `the-shoal-bank`, `loriasel-caverns`, `the-divers-landing` | `meso-move` of 20–60 m onto the deep cell each already touches (12.61 / 12.61 / — / — m within 100 m); for `loriasel-caverns` and `the-divers-landing` no cell ≥1.0 m exists within 100 m → `pin-by-siting` a depth-class hard constraint, or `prose-rewrite` the dive distances (16 m / 4 m) |
| `thorn` harbour | `pin-by-siting` on `the-thorn-bond`: `boundTo {place: thorn, maxM: 250}` plus a `waterRelation` requiring ≥1.2 m, targeting the marsh-fringe at `stands-on-the-island`; or `prose-rewrite` Thorn's "river access down to the coast" to a lighter/portage claim |
| ten dangling route refs | `prose-rewrite`/data edit to the live ids (`route.road.gideon-stormhold`, `route.road.stormhold-thorn`, `route.boat.stormhold-alten-corimont` as a lane) and delete `route.road.thorn-tear-road` and `route.track.bogmother-causeway` references |
| `the-field-gate-garrison`, `the-last-landing`, `the-ash-causeway` | `meso-move` cannot close 843/1212/466 m → `pin-by-siting` `landformClasses ["roadside"]` (the solver has roadside sites free), or drop the cart/porter mode (`prose-rewrite` + `travelStation.modes`) |
| A7 pairs (`the-thousand-birds` D2/band0, `channel-cross-village` D2/band4, `reedmoor-stilts`/`riverwalk`/`the-diggings-ladder` D1/band3) | either retune `dangerTier` to the band the frozen world gives, or `pin-by-siting` `regionClasses` so the solver may only take matching-band ground |
| `the-crown-terrace`, `the-pass-station` | `pin-by-siting` to an existing record (their boundTo targets are missing/unsited) or `cut` the boundTo |
| `gandranen-library` + `gandranen-ruins` | `merge` into one design group (57 m, overlapping footprints, one recorded ruin) |
| city footprint overlaps (`stormhold`, `thorn` and their satellites) | no remedy needed if A6b exempts `boundTo` satellites of a city anchor — otherwise `pin-by-siting` a minimum-separation of 250 m, which moves the falls chamber and the bond off their subjects |

## Appendix — every live record that moved more than 150 m (112 of 127, id · metres)

`breathes-underneath` 5344 · `feeds-the-north` 5318 · `the-ninth-chapel` 5280 · `hutan-tzel` 4851  
`the-salt-ledge` 4765 · `hatching-pools` 4727 · `the-shell-ground` 4466 · `andalen-plantation` 4384  
`the-north-holding-pit` 4220 · `the-permit-dig` 4172 · `nine-marks` 3998 · `the-tide-fair` 3950  
`the-whispers-dig` 3907 · `the-monsoon-boom` 3844 · `the-bone-stage-north` 3820 · `the-charge-pond` 3747  
`the-sump-hamlet` 3683 · `the-empty-socket` 3591 · `reedmoor-stilts` 3590 · `the-crystal-prospectors` 3579  
`the-turning-stone` 3462 · `the-two-hundred-roofs` 3450 · `the-north-vista` 3432 · `the-bound-urns` 3428  
`cut-and-stack` 3409 · `nine-stone-bench` 3330 · `let-upper-floor` 3305 · `the-northern-rest` 3301  
`riverwalk` 3289 · `the-north-border-post` 3146 · `the-drover-camp` 3026 · `the-opened-terrace` 2932  
`crystalgate` 2921 · `rimfield` 2874 · `names-the-year` 2840 · `the-moon-court` 2815  
`sings-for-the-pipes` 2760 · `the-wild-mouth` 2417 · `the-borrowed-tomb` 2154 · `the-freed-rows` 1853  
`the-pilots-rest` 1793 · `ten-thousand-nests` 1750 · `the-tear-wreck` 1670 · `tearmouth` 1666  
`tunnel-rat-gallery` 1646 · `the-first-count` 1587 · `dreams-by-the-ash` 1566 · `branchmont` 1517  
`channel-cross-village` 1464 · `the-veterans-ridge` 1396 · `buried-blades` 1388 · `wolk-market` 1258  
`the-guar-ground` 1250 · `hixinoag` 1226 · `greylight-village` 1200 · `boom-keepers-lodge` 1191  
`waits-for-the-promise` 1142 · `the-north-cut` 1098 · `the-last-landing` 1085 · `the-wamasu-shrine` 1071  
`the-delta-byre` 998 · `the-terrace-watch` 956 · `the-lightning-yard` 948 · `the-xanmeer-hold` 941  
`the-dres-rows` 935 · `the-pen-yard` 910 · `the-flu-cordon` 883 · `the-high-wrappings` 879  
`the-charge-works` 832 · `hissmir` 779 · `the-ash-causeway` 777 · `the-outer-silyanorn` 775  
`stillrise-village` 774 · `waits-for-the-trial` 743 · `the-fish-boon-ground` 705 · `gandranen-ruins` 652  
`the-divers-landing` 650 · `gandranen-library` 643 · `the-field-gate-garrison` 628 · `stands-on-the-island` 588  
`cut-in-the-wall` 586 · `silyanorn-diggings` 564 · `the-drawdown-flats` 550 · `the-diggings-ladder` 550  
`nine-fords` 533 · `the-silyanorn-crown` 531 · `the-thousand-birds` 521 · `seam-chasers` 494  
`the-shoal-bank` 474 · `the-drowned-terrace` 472 · `murkwater-shadowscale-ground` 436 · `the-black-stage` 423  
`ten-maur-wolk` 409 · `the-salt-and-shell` 404 · `went-down-slowly` 399 · `loriasel-caverns` 396  
`the-stormhold-falls-chamber` 391 · `the-white-pans` 378 · `the-slumped-hamlet` 364 · `climbs-to-see` 344  
`draws-the-herds` 333 · `three-ways-over-water` 333 · `the-crown-terrace` 321 · `the-ash-holding` 304  
`zuuk` 301 · `the-stripped-village` 297 · `the-two-gate-bridge` 278 · `saltmarch-village` 269  
`murkwater` 258 · `stormhold-causeway` 257 · `the-north-root-gallery` 210 · `hackwing-wall` 179  
