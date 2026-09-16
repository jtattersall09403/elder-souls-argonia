# 16e ledger — routes, grading, spans and ferries on the frozen world

Delivered 2026-09-15 (decision [0068](../../decisions/0068-routes-below-the-gate-records-here-realised-in-16h.md);
brief [16e](../../phases/16-foundation-and-places/16e-routes-grading-spans-ferries.md)).
Numbers are from the delivering chain run (`terrain-chain.sh --through 16e`)
unless a row says otherwise. Nothing above 16e's ladder row ran.

## 1. What changed, in one table

| Before (2026-09-14) | After |
|---|---|
| Major roads solved above the freeze gate on the Phase 3 water classes, then repaired stretch by stretch (`reroute_majors`) | `solve_major_routes`: solved once, below the gate, on the natural array and the water record; gradient, river-bed, bank, marsh, crossing and junction costs; `reroute_majors` deleted |
| `grade_routes` (1,082 lines) snapshotted and rewrote the heightfield in two passes | `grade_routes` rewritten (one pass, a patch author); `apply_route_patches` writes the graded array from the natural one; `patch_water --graded` proves the water |
| 272 structures, 211 of them spans, median span 70 m, 69 % longer than vanilla's longest bridge | see §4 |
| crossings decided by an in-memory re-run of the old water compile, labelled lake/river by a body mask | `derive_crossings` on the record: entity id and kind on every row, band from width AND depth, marsh never a ferry |
| `ferry-crossings.json` + `root-transit.json` + no boat services | one `travel-services.json`: ferries, boat services, the rootworm placeholder; berths found where the hull floats; `travel_services --check` |
| no way to use a ferry | `packages/game-core/src/travel/travelServices.ts`: talk, pay, arrive; the studio marker and menu |
| the 2D map's route overlays painted above the gate (never updated) | `paint_route_overlays` below the gate; four hover layers (spans, grades, crossings, services) |
| 91,890 stale road texels painted from files the ladder never produced | the bake paints only ladder-produced lines; `road_paint_census --check` |
| three modules re-deriving water (allowlist rows) | ported; rows deleted; `test_record_reads` green |

## 2. The roads (owner asks, 2026-09-15)

| Road | Length km | Over-cap on the analysis grid (m) | Note |
|---|---:|---:|---|
| alten-corimont-stormhold | 3.81 | 0 | |
| archon-gideon | 7.59 | 8 | through the crossroads junction; southern high ground |
| blackrose-lilmoth | 2.11 | 0 | |
| gideon-blackwood-road | 3.56 | 29 | the Drowning Gate tarn crossing (ferry) |
| gideon-soulrest | 6.77 | 8 | |
| gideon-stormhold | 6.62 | 8 | |
| helstrom-blackrose | 6.10 | 0 | through the crossroads junction |
| soulrest-blackrose | 3.18 | 0 | |
| stormhold-thorn | 10.99 | 164 | out of the river bed; one dry 200 m fall remains (§4) |
| thorn-tear-road | 1.71 | 19 | the Tear pass: a stepped ascent, as before |
| coast-road (track class, solved with the majors) | 4.85 | 0 | |

- Stormhold–Thorn: 4 channel samples over 11 km (was a river bed for much of its length).
- Archon–Gideon: 18 standing-body samples, all at the Drowning Gate side; the marsh count is in the crossings table.
- The crossroads `junction.hist-heartland.crossroads`: **round 1 claimed it was honoured and was wrong** — `road_points` fed the survey's (row, col) to the solver as (col, row), so the pin sat transposed; found on 2026-09-16 when the owner placed the pins below, fixed with a test that would have caught it. The owner also corrected the position to 3470 E, 3290 S.
- The sea is a wall for a road; a city anchor on the waterfront is always enterable.

### 2b. Round 2, 2026-09-16 (owner walk of the 2D map)

- **Roads attract roads.** Each road was solved alone, so two roads heading the same way ran side by side (Blackrose, 2.9 E 1.74 S, 0.74 E 6.22 S). `solve_major_routes` now solves longest first and prices a built road's cells at 0.35 of the ground cost for the roads after it, so later roads merge onto earlier ones and split later.
- **Pins** (`junctions.json`, `kind: pin`, one road each) carry the owner's steers: Stormhold–Thorn north-east across the major river (3603 E, 230 S) and along the lowland north of the heartland marsh (4283 E, 1409 S); Gideon–Stormhold at the foot of the western mountains (1864 E, 2577 S) and the north-western ones (1694 E, 1563 S); the Lilmoth approach from the north-west (3477 E, 6235 S); the Soulrest approach from the north (521 E, 6427 S). Pins are chosen by measurement inside the owner's described box: dry within 30 m, gentle, on the intended side of the river.
- **Gideon's anchor** moved 90 m east off the tarn's shore (dry, 1.4°), inside its tolerance; recorded on the anchor.
- The stale minor tracks and channels the 2D map still drew (16g's, skipped on this ground) are hidden until their stage runs; the Blackrose lake placeholder overlay is removed; the four route sub-layers are always visible with spans and crossings on by default; the map zooms.

### 2c. The lore audit (owner ask, 2026-09-16)

Every major route was checked against the source books (dossier
`world/sources/lore/topics/roads-and-routes-4e201.md`). Two are attested by
name (the Blackwood Road at Gideon; the Tear road at Thorn); the rest are
project extrapolation the registry already flagged. The sources reach
Helstrom and Alten Corimont by water and root, not by road. Every route now
carries a 4E 201 `condition` (worn / decayed / broken) with its reason for
the span author, the painter and 16f's dressing to read. Three registry
defects fixed (a citation to a page that does not exist, a road named after
a ruin a province away, a coast road mis-tiered as attested). Three
load-bearing calls are the owner's (dossier § Open calls).

## 3. Grading (the natural array is untouched)

| Measure | Value |
|---|---:|
| route-grade patches kept | 154 |
| patches absorbed (shared corridors, junctions) | 97 |
| road length graded (m) | 6,281 |
| amplitude median / max (m) | 0.88 / 2.98 |
| structure windows handed to the span author | 29 |
| `patch_water --graded` | pass, 0 problems |

Every patch was proved on a scratch window through the chain's own
invariants before it was written; a patch never moves recorded water or
its 22 m shore band (the first preflight caught three water invariants
tripped by rims graded down, which is how the band became invariant 7);
walkable channel banks and marsh edges (at most 30°) stayed natural and
are listed per way in `world/sources/sites/route-grading.md`. The lanes
the record cannot float are DECLARED on the lane record as gaps owned by
16g, which the water gate reads: two overland runs
(`route.boat.soulrest-lilmoth` 204 m, `route.boat.stormhold-alten-corimont`
144 m) and the stretches shallower than the 0.6 m canoe line (several lanes,
listed in `province/waterways.json` `gaps`). Ruling 6 stands: never dredged;
the plot re-sites a station or re-lines the lane on water the record has.

## 4. Spans and crossings

- Crossings on the record: 151 (major: 27 fords, 22 spans, 1 ferry-band, the Drowning Gate tarn at 411 m; minor: 66 / 28 / 7, on the stale minor lines 16g re-solves).
- Structures (round 2): 29 (17 bridges, 7 stepped ascents, 3 lip-steps, 2 boardwalk decks); span lengths in metres, sorted: 2, 6, 8, 8, 8, 8, 8, 8, 9, 12, 12, 12, 15, 15, 20, 26, 44, 45, 200. Was: 272 structures, 211 spans, median 70 m.
- **One span over 52 m remains and is a red:** `route.road.stormhold-thorn` at 5,363 E, 1,606 S (studio `x=5.36&z=1.61`), a 200 m bridge over a DRY hollow (a 15 m fall over 475 m, 44° at its worst; no crossing record under it). The router took the hollow because every detour cost more on the analysis grid; the grader could not fill it (over 6 m). The honest fixes are a routing one: an authored line for that stretch (`authored-routes.json`) or a junction pin that steers the road round the hollow, chosen on the 2D map by the owner, then one re-solve. Left for the owner check.
- The 220 m stone viaduct over the fen is gone: marsh crossings are boardwalk decks and the deep marsh now costs the router 16× dry ground, so `soulrest-blackrose` goes round.

## 5. Ferries and services

| Service | Outcome |
|---|---|
| ferry.hist-heartland.underway-basin | **unmatched** after the final solve: `helstrom-blackrose` no longer walks into the basin (the marsh cost sends it round), so the nearest crossing is a 4.7 m ford and its water floats no canoe. The premise on the record ("the surface route crosses the deep basin") is a 16g plot call: keep the Underway story with a re-sited ferry, or retire the service |
| ferry.imperial-fringe.drowning-gate | matched; berths 2.40 / 2.04 m, jetties 1 / 1 m |
| ferry.imperial-fringe.onkobra-bond | **unmatched** after round 2: the pinned Gideon–Stormhold road no longer crosses the lower Onkobra by the bonded shed, so no road crossing matches within 400 m; a 16g plot call with the Underway one (re-site the customs ferry where the roads now cross, or retire it) |
| 4 station-run ferries | carried; 9 hops `unresolved` (no registry lane joins the pair: the minor waterways 16g solves) |
| 12 boat services | one per registry lane between stations declaring `boat`; `FAST boat.corimont_helstrom` resolves |
| rootworm.underground-express | `placeholder`; re-authored at the hero Hist nodes in 16g |

## 6. Gates added, each shown failing first

| Gate | Failed first on |
|---|---|
| `test_record_reads` with the three rows deleted | the modules' own raster reads (the rows were the evidence) |
| `test_terrain_patches` route-grade: invariant 7 | a hand-moved pond bed under a graded road |
| `test_terrain_patches` route-grade: a cut trench on a plain | the hollow that the cut would close (lifted to its spill) |
| `test_solve_major_routes`: a fall walls the line, a ford cell admits it, the junction is on the line | the synthetic wall and via |
| `test_grade_routes`: a cliff step is a window, a lip is a patch, wet cells never move, walkable banks stay natural | the synthetic ground |
| `test_derive_crossings`: a 15 m crossing 3 m deep is a span, marsh is never a ferry | the old span-only band |
| `test_travel_services`: an unmatched crossing, a berth that never floats, a dangling station, a FAST node | the stubs; on the real record the Underway basin ferry |
| `test_road_paint_census --check` | 91,890 stale texels on the 16d build |
| `travelServices.test.ts`: refusal, unavailable, free-for-a-friend, cannot pay, arrive, an unknown predicate throws | the stub graph |
| `test_sculpt::test_road_grades_stay_traversable` (un-skipped) | ran red on the old network (16b), green on the solved one with structure-carried stretches excluded |

## 7. Left for the owner and for later chunks

- 16g: minor routes and waterways (never graded); the rootworm stations; the unresolved station-run hops; any ferry-band lake crossing with NO SERVICE.
- 16h: draws the route structures, landings (`piece`, `jettyM`) and hulls (`water` anchor class); the `route-structures` layer is hidden until then.
