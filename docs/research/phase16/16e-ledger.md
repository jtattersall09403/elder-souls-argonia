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

### 2d. Round 3, 2026-09-16 (owner walk of the 2D map; decision [0069](../../decisions/0069-the-road-network-is-six-legs-and-two-exits.md))

**The road set.** Helstrom–Blackrose and Alten Corimont–Stormhold are cut
(the sources reach both by water and root); the coast road is a `track` for
16g; the crossroads junction and the Underway basin ferry go with the
Helstrom road. Eight major roads remain: the six city legs and the two
attested exits.

**Root cause of the wandering and the bumps.** The router walled every
step over the 8° cap between neighbouring analysis cells (a 1 m step cost
×335 and a 2 m step ×1,300; 40 % of the province's cells have such a step
to a neighbour), so the lines ran kilometres round 1–2 m terraces and kept
the bumps they could not avoid; the cell's own steepness then multiplied
the step's. Now (`routes.grade_factor` with `gradable_m`, `GRADE_OVER`):
a step a route-grade patch can take is earthworks ADDED to the ground
cost; only a rise over `GRADABLE_STEP_M` (5 m in one 5.48 m step) is a
wall; the cell steepness term is mild; deep marsh costs ×6, not ×16. The
lines, before → after:

| Road | Round 2 km | Round 3 km | Over-cap on the grid, m |
|---|---:|---:|---:|
| stormhold-thorn | 10.99 | 8.80 | 410 |
| gideon-stormhold | 6.62 | 4.50 | 19 |
| archon-gideon | 7.59 | 6.24 | 0 |
| gideon-soulrest | 6.77 | 5.86 | 8 |
| soulrest-blackrose | 3.18 | 3.01 | 0 |
| blackrose-lilmoth | 2.11 | 1.64 | 27 |
| gideon-blackwood-road | 3.56 | 2.50 | 165 |
| thorn-tear-road | 1.71 | 1.25 | 78 |

**Steers.** Stormhold–Thorn: the round-2 north-of-the-river pins are gone;
eight pins hold it on the flat south-west of river.889-484 (south of the
lake east of Stormhold), across the river once at 4496 E 1601 S (a 34 m
bridge), then east along the mountain foot and up the east coast strip to
Thorn: 8.8 km, 5 channel samples, no swing through the coastal swamp.
Gideon–Stormhold: a pin at 1733 E 2846 S takes it over the stream
(reach.949-1591, ford) and north. Soulrest and Lilmoth: the pins became
**approach pins** (a straight 30 m corridor for the final leg): the plain
pin was honoured and the road still looped round to the flat side.

**Crossings and spans.** Crossings are derived for the major roads only
(46: 22 river, 5 lake, 19 marsh; 25 span band, 21 ford), on every flowing
reach or standing body the line meets whatever the compiled depth reads at
that texel. A river running through a marsh body is the marsh's own
crossing (owner 2026-09-16: the boardwalk over the fen crosses the river in
it at the same level), so the Thorn road crosses the fen on one deck.
Spans are authored FROM the crossing record bank to bank (8 bridges, 18
decks); a dry over-cap window is a flight (7 stairs, 7 stepped ascents),
never a bridge: round 2 had 25 bridges of 29 spans over dry ground.
`author_route_structures` is a pure function of the ground, the roads and
the crossings (the prior-window carry, the obstacle trimming and the
SpanWater season logic are gone: 1,248 → 748 lines).

**Grading.** Roughness is a choke point (`ROUGH_M` 0.5 m off a 40 m running
median); patches are authored one after another on one scratch array and
overlapping ones declare their order (26 of 118 were being dropped as
"absorbed" in round 2, 11 of them next to a neighbour on the same road).
A road's first and last 60 m (`ANCHOR_CLEAR_M`) are never patched: that
ground is the settlement pad's (16h). A patch at Thorn's waterfront
anchor had lifted a water-class cell 2 m above its water. The numbers in
§3 are from the final run. What is still over the cap on the graded ground and why, per
road (samples at 1.83 m): the structure windows carry most of it (Thorn
344 of 519), the 22 m water shore band where no patch may move the ground
carries the next share (Thorn 90, Blackwood 105, Gideon–Stormhold 86).
6–70 samples per road sit outside both: a backlog row.

**Reds for the owner.** Four stepped ascents over 380 m stand where the
router took a long climb the grader cannot take (Blackwood road 518 m at
`x=1.02&z=3.22`, Stormhold–Thorn 434 m at `x=5.39&z=1.54` and 461 m at
`x=6.07&z=1.01`, the Tear pass 388 m at `x=6.42&z=0.62`); a pin round the
climb or an authored line is the honest fix, chosen on the map.

**Round 3b (owner, same day).** The four long flights were gentle slopes:
the grader's refused windows (a run in a shore band, a channel shoulder or a
new hollow) were 100–500 m long with a gentle overall grade and one or two
wrinkles; the author built a flight over the whole window. Now a
flight is authored only over the steep runs (15° or steeper) inside the
window, so a gentle window gets a short flight at its wrinkle or nothing;
the owner keeps long flights where the ground is genuinely steep. The
tooltip is `position: fixed` in page coordinates and flips near the
window's right and bottom edges, so the map's clipping box never cuts it
off. The travel-service graph is 16g's to re-author with the places it
re-plots, with harbour stations for cities not on joined water (0069).

**The map.** One tooltip (the map's own, outside the zoom transform so it
never scales), fed by the routes layer's hover; spans and flights as
recoloured stretches of the road line; the `services` crash (a station
with `null` berth numbers) fixed and tested; the Blackrose lake
placeholder (a dashed ellipse `hydrology_graph.write_layers` drew for the
declared, then-undug lake) removed from the code; its box in the two
committed overlay images is repainted from the water record (the images are
only regenerated by the 16a derive; see the vault note below).

**Vault note (defect, mine, 2026-09-16).** Re-running `hydrology_graph
derive` to redraw the overlays overwrote the vault's
`hydrology-graph-solution.npz` and `hydrology-graph-bodies.npz` (not in
git; read by `patch_water`, `terrain_patches`, `terrain_preconditions` and
`compile_water`). The solution file was restored byte-identical from the
carve's copy (`province-refined/channels-pass1.npz`). The body rasters
could not be: the re-derive differs from the frozen graph (57 small bodies
fewer, 54 levels moved by up to 1.25 m; the graph's inputs moved after the
freeze). Two candidates were measured against the chain's own gate: the
re-derive passes `patch_water` (natural, 119 patches, 0 problems) and
`patch_water --graded` (0 problems); a rebuild from the frozen compile's
`water-pass1.npz` extents fails the natural gate on two levee patches. The
re-derive is installed; the rebuild sits beside it as
`hydrology-graph-bodies.rebuilt-2026-09-16.npz`. Consequence: a routine
run that reaches `compile_water` would realise body extents from a raster
missing 57 bodies the record lists, so **before the next such run the
rasters must be regenerated under `--refreeze` or the graph's inputs
reconciled** (backlog row; the owner decides when). Nothing in 16e's
ladder reads them.

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
