# 0063 — Water once: the compile realises the graph, the line is high water, the sea's energy is the wind's (Phase 16c, 2026-09-13)

Amended by [0065](0065-the-compile-realises-the-graphs-classification.md).

Amends [0047](0047-water-one-physical-model.md) (the runtime's season and
fetch arithmetic) and [0049](0049-water-is-measured-and-has-a-season.md)
(the season's direction); keeps [0058](0058-the-hydrology-graph-is-the-water-record.md)
and [0060](0060-rivers-reach-the-coast-profiles-are-graded.md) whole.
Evidence: [research/phase16/16c-water-once-ledger.md](../research/phase16/16c-water-once-ledger.md).

**Decisions.**

1. **The compile realises the graph and solves nothing.**
   `worldgen/compile_water.py` reads `hydrology-graph.json` and the channel
   solution the carve cut (`channels-pass1.npz`): the sea at 0, every body
   flooded from its deepest cell to its recorded level (less half the
   record's rounding, so the spill cell stays dry and no flood ever crosses
   a saddle), every reach at its profile, a promised plunge pool and a
   captured body filled by their channel, the authored lake by its measured
   twin. No priority flood of the province, no acceptance rules, no
   placement cap. Every wet texel names its graph entity (`water-id.png`,
   `meta.entities[]`), so ids are stable across compiles and a later system
   (fauna, quests, boats) asks "which lake is this" and gets the graph's
   answer.
2. **A river through a body is the body** (16a rule, now realised): inside
   a body's extent the body's level and id own every cell; the channel's
   level is forgotten there and the body's kind names the class raster.
3. **The pooled runs are reconciled with the bodies the ground holds.**
   The profile was solved before the carve; the carve then re-measured,
   captured, joined to the sea or lost bodies it was pooled in (0059's
   extension rule). A pooled station now takes the level of its body, the sea's 0 over the
   sea, the channel's level through a captured body — never under its own natural level. Inside the run the
   water backs up behind the highest bed the trench never cut (a drained
   basin's protected collar), so the river crosses a drained floor as a pool
   behind a sill, not a dry gap. The weir below a lake that sits a hand lower keeps
   its level: a bare sill, counted, never a dry stretch.
4. **A lateral sheet is one pool.** The bounded flood from a field station
   over lower ground beside its trench relaxes to the lowest river level it
   connects to and dries where the ground then stands above it; the old
   per-cell staircase left hovering risers of up to 10 m down long valleys.
5. **The compiled level is the HIGH-WATER line** (owner 2026-09-13: the
   water on the 2D map is the height of the wet season and, where relevant,
   the tide; 16b carved for those extents). Nothing rises above it. The
   season only draws the water down — `level = W − amplitude · response ·
   (1 − s) / 2` for the season scalar s in [−1, 1] — by the graph's
   `drySeasonLevelM` for a body (marsh sheets 0.28 m, lakes centimetres), by
   0.1–0.14 m for a perennial reach, to its bed for a seasonal reach; a
   river's draw-down ramps to its receiving body's over the last 60 m so no
   step opens at a mouth. The tide falls from the line (0 to −2 × amplitude
   at springs) and returns to it. The 8b `flood-wet.png` (+1.4 m flood of
   the ground) is retired; the siting fields read the compiled band instead.
   The owner is open to retiring seasons altogether; the model is now one
   raster channel and one scalar, so that is a one-line change if chosen.
6. **The sea's energy is the wind's and the fetch's** (ruling 7). The band
   table is unit-rms; the rms height is JONSWAP's fetch-limited growth under
   the Pierson–Moskowitz cap for the weather's wind, never under a swell
   floor of 7 m/s (the open sea is never glassy: swell arrives from storms
   beyond the province; this floor is the owner's calm-sea knob), on the
   compiled DIRECTIONAL fetch (`water-flow.png` B: the open water upwind of
   every cell along the prevailing SE trade, 60 km beyond the province,
   unbounded by the 160 m surf band). The surf's energy is the same fetch: a
   windward beach breaks, a lee shore and a pond lap. Whitecaps cover 2 % of
   the sea at the floor, 6 % at 12 m/s, 12 % in a squall, thresholded on the
   measured crest-noise quantile; the still-water ripples and the whitecap
   pattern drift downwind at their own speeds. The horizon blend starts at
   4 km and never exceeds 60 %; the walk-mode grid reaches 12 km.
7. **Edges are coverage, never a discard on an unsampled target.** The
   buried guard fades over 0.2 m at a floor tight at every distance (−0.35
   to −0.7 m), the cliff guard reads the raster's own gradient (a step is a
   sheet's, never a far-grid ramp), the owner mask dissolves over its
   dilation; the raster clamps to its edge texel beyond the province (a sea
   border carries the sea, a land border buried ground: no hard plane). A
   strip stands at the notch level where the wetted edge meets the parabolic
   bed, so the ribbon touches the bed and the field draws nothing beside it.
8. **What the ground still gets wrong is counted, never hidden.** The
   compile's census names, station by station, the beds the carve left
   above their promise (25 stations at 5 sites), the channels perched above
   a sheet they touch (582 stations: a 16b shoulder cannot seal against a
   body) and the hovering edges that remain (161, all lateral sheets meeting
   ground a station downstream owns lower). They are the owner's call
   (terrain patches after the freeze) and the gates hold them at their
   measured floor so a regression fails.
9. **Life over the water reads the water.** The ambient air's midges and
   dragonflies hover from the compiled water surface plus a hover height
   (`airHoverFloorY`, the vertex stage's `esAirFloor`), never from the bed.

**Non-obvious choices.** Realising the graph rather than trusting the
carve's copy of the solution alone (choice 3) was forced by the record:
8,864 pooled stations carried levels of bodies the carve had moved; the old
compiler hid this by re-flooding the province. The draw-down season (5)
replaces a rise that made every river mouth a step in the wet season (a
river's 0.7 m rise against the sea's 0). The directional fetch (6) makes the
lee of a headland calm and a pond flat without a single tuned distance.
The FX-mesh backlog rows (`effect` category, blend materials, editor
geometry) close as moot: no effects mesh ships — the falls are our shader
and the vanilla textures (0047 addendum).
