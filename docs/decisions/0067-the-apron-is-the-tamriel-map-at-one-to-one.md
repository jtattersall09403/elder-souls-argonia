# 0067 — The land beyond the border is the all-Tamriel map at 1:1, the near ring is chunks, the sea covers it (16d, 2026-09-15)

**Context.** Ruling 8 (2026-09-11) chose a stitched apron from Transbot9's
all-Tamriel heightmap on condition of a smooth join. The chain audit had
registered the province to that map at "8 px per cell, r = 0.83, match
(11960, 17752)" and a seven-round plan was built on fitting scale and offset
to that window. Measured on 2026-09-15 with a whole-map cross-correlation at
scale factors 1–5, that registration is a macro-shape false match on an
island off Morrowind (a second island scores the same). At factor 4 the
match is r = 0.9966: **the Argonia worldspace is a 1:1 cut of the map**
(32 px per cell; the province's south-west sample at PNG row 3393, col
11788; the PNG is stored south-up like the ESP heightfield; metres =
0.017093·u − 91.745, rmse 3.0 m against the raw ESP heightfield). The map
ends 16.4 km north, 6.2 km south, 21.5 km west and 8.5 km east of the
border; beyond it is Morrowind's coast, Cyrodiil's lowlands round Topal Bay
and open sea. The aerial haze is opaque by ~10 km (`climate-vis` visibility
p95 2 km).

**Decisions.**

1. **The apron is the map continued, unfitted.** `h_apron = canon + Δ·w(d)`
   with Δ the province edge minus the map at the same cell and `w` a
   1.2 km smoothstep, so the join ends inside the near ring: the sculpt's
   extra northern relief falls to Morrowind's coast as an escarpment. (A 6 km
   blend extruded our coastline and mountain edge for kilometres.) No scale search, no per-side rule, no
   extrapolation past the map, no fade (the haze is the fade). "Reach ~60 km"
   (owner 2026-09-14) is superseded by the map's own extent.
2. **The innermost 468 m is ordinary terrain chunks** (68 tiles, LOD 1/2/4,
   drawn by `ChunkTerrain` under the same LOD rule as the province), with
   the shared edge copied from the province chunk at every LOD and the
   outer edge linearised between the next ring's knots, so the border seam is
   a chunk seam and closes exactly in every view. Two coarser square tiles
   (29.25 m to 1.17 km, 116.98 m to the map's edge) follow, each with a
   masked interior and knot-linearised edges. A single-pitch ring with a deep
   skirt (the earlier plan) hides the seam in one direction only.
3. **Beyond the province the water is the open sea at y = 0 over the apron
   ground**, in the shader's `esSurfaceAt` and its CPU twin, with the
   coast's class attributes and no current. The edge-texel clamp (16c) was
   right for the sea and wrong for the five upland waters and three rapids on
   the west and north edges, which it carried outward as ribbons; it stays
   only for a build without the apron.
4. **The paint is the province's rules on the apron's ground**
   (`compile_ground_control` on height, region, slope and latitude
   only, at 7.31 m near and 116.98 m far); within 100 m of the border the
   control ids are dithered to the province's own edge texels and the tint
   and gradient blended, so the border shows no colour change by
   construction.
5. **The record reader** lives on `water_report.ShippedWater`
   (`water_at / reach / body`, delegated by `ProvinceSurvey`), two-argument,
   returning the graph record with the compiled depth; the six pre-graph
   survey fields are deleted outright and the tests their consumers break are
   gated by the chunk that ports each module (16e, 16g, 16h).
6. **The chunk ladder has one declaration** (`worldgen/ladder.py`); the chain
   script reads it; an unknown chunk raises.
7. **The boundary** is four fixed cuboid colliders outside the built ground
   (`PROVINCE_BOUNDARY` in contracts, `packages/game-core/src/boundary/`)
   and one catalogue line; unclimbable by construction; 9c excludes them.

**Evidence.** The 16d brief's Starting state (the measurements); the manifest's
`report` block in `docs/research/phase16/16d-ledger.md`; the ladder,
purge and apron commits of 2026-09-15.

**Supersedes.** The chain audit §4 registration paragraph; the "Plan for us"
in `research/world-terrain/beyond-border-distant-lands.md`; the 2026-09-14
owner decisions on reach and on Opus for the water part.
