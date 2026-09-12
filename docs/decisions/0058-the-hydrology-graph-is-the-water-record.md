# 0058 — The hydrology graph is the water record (Phase 16a, 2026-09-11)

**Decision.** The province's water is derived **once**, from the frozen base
terrain and the coarse hydrology pass, into a typed graph with stable ids —
`world/sources/hydrology/hydrology-graph.json`, schema in
[its README](../../world/sources/hydrology/README.md) — and every later stage
reads it: the terrain stage builds to its `terrainPrecondition`s, the water
compile puts water at its levels, the scatter reads channel membership from
its reaches, routes and places read its bodies and seasons. No stage
re-floods the terrain to find a level (this re-rules 0047's "the level is the
flood of the real terrain" for terrain-moving consumers; also 0049's "measure
the shipped raster" for the same set, per plan §7 rulings 3–5).

**Why a projection of the existing solvers, not a new model.** The carve's
`channels.solve` and `standing_water.solve_bodies` already hold the reach
topology and the bodies in memory; the audit's finding was that nothing
exported them, ids were emit-order counters and the season was runtime
arithmetic. Deriving the graph *from* those solvers keeps decision 0047's one
definition (the trench and the water are the same curve) while adding what
was missing: rivers end to end, kinds, junctions, seasons, preconditions,
geography-keyed ids. A second model would have been a second source of truth.

**Non-obvious choices.**

1. **Derived on today's code's sculpt, not the August array.** The vault's
   `heightfield-sculpted-f32.npy` is byte-identical to the August array;
   today's `sculpt_province` reproduces itself exactly across two runs but
   differs from August (max 92.5 m, 6.3 % of samples by > 1 m). Ruling 1
   re-freezes on today's code, so the graph is solved on that base (the
   scratch run's sha is recorded in `sourceHeightSha256`); 16b's re-freeze
   must reproduce that sha or re-derive. The August-vs-today diff is in the
   ledger.
2. **No placement cap.** `solve_bodies` is called with `with_placement=False`:
   a lake is not rejected because a place was plotted in it. Places adapt to
   the frozen water (plan §3), never the reverse.
3. **Reach kinds from the reach's own profile.** Station-level slope classes
   flicker; runs shorter than ~11 m are merged and the kind is then taken
   from the merged run's water-level profile, so "sloped means slope >= 0.035"
   is true of every record by construction and the gate can say so.
4. **Ids keyed to cells.** Rivers by mouth coarse cell, reaches and junctions
   by the full-res cell of their first station, bodies by deepest cell. A
   change upstream renumbers nothing downstream.
5. **Falls into a lake, a lagoon or the sea use that body as their plunge
   body**; a fall onto dry ground promises a `plunge-pool` body with the
   carve's bowl law, `origin: "promised"`, for 16b to dig.
6. **Blackwater reads the marsh region classes as well as the soil raster.**
   The soil raster calls 5 % of the province peat or soft marsh, so no river
   reached the rulebook's 50 % on soil alone; on marsh region + peat soil, 9
   of 100 rivers are blackwater, 61 whitewater, 30 clearwater.
7. **The drainage solver was fixed at the root** (`hydrology.py`): the flat
   resolution could raise a flat cell above the non-flat cell that drained
   into it, leaving 223 residual pits and 390 two-cell flow loops (20 on river
   cells; three rivers ended on dry ground and their catchments were lost:
   the largest sea river measured 6.2 km² before and 12.7 km² after). The
   increment is now bounded by the smallest real drop, a strict-descent pass
   follows; the sea is a D8 sink. `drainageLoops == 0` is a graph
   invariant. The shipped Phase 3 rasters are unchanged until 16b re-runs
   the pass.

8. **Owner review 2026-09-11, folded in.** (a) No waterfall is ever cut to
   add one: only real relief makes a fall, so the knickpoint proposals were
   dropped; a fall off a low bank into sea-level water is flagged
   `coastal-terrace-step` for 16b to smooth. (b) Seasons flow downstream:
   once perennial, a river stays perennial to its mouth, so no river dries
   in the middle. (c) One flat kind, `horizontal-channel`, with the size as
   `band`; every reach carries a `surface` (channel / strip / fall / body)
   and a channel or strip shorter than 30 m is absorbed by its neighbour, so
   the renderer's seams stay few and semantic. (d) Lore-required water the
   base lacks is declared in `authored-bodies.json` (the Blackrose lake) and
   dug by 16b. (e) A river through a body is the body (16c rule).

**What it replaces.** The anonymous per-compile depression population of
0045 (as the *record*; the flood solver still finds the bodies, once), the
`reach-N`/`fall-N`/`strip-N` emit-order ids of the water compile (16c
re-points `compile_water` at the graph); also the runtime-only season.

**Gate.** `python3 -m worldgen.hydrology_graph check` runs in `npm test`
(repo-standards, standard 14); `worldgen/test_hydrology_graph.py` shows every
invariant failing on a corrupted copy of the shipped graph and proves id
stability across two derivations of a synthetic world.

**Addendum (Phase 16b, 2026-09-11, decision 0059).** The "frozen base" the
graph is derived from is the SHAPED ground (`heightfield-shaped-f32.npy`),
not the raw sculpt: a profile solved on the sculpt sat above valleys the
fluvial pass had lowered and the carve would have built the river a dyke.
`derive` also saves the solvers' outputs so the carve realises exactly the
curve the graph names. The carve re-measures the bodies afterwards (rims
move under levees), with `preCarve` recording the solve-time level.
The routing sink is every sea-connected cell (0059 choice 3).
