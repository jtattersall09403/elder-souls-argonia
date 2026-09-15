# 0065 — The water compile realises the graph's classification; steep water is bankfull; a sheet holds only where the ground holds it (Phase 16c round 2, 2026-09-14)

Amends [0063](0063-water-once-the-line-is-high-water.md) items 1, 4, 7 and 8;
keeps [0058](0058-the-hydrology-graph-is-the-water-record.md) and
[0060](0060-rivers-reach-the-coast-profiles-are-graded.md) whole. Falls are
[0064](0064-waterfalls-are-the-vanilla-kit.md). Evidence:
[research/phase16/16c-round-2-ledger.md](../research/phase16/16c-round-2-ledger.md).

**Decisions.**

1. **The compile derives no classification of its own.** Owner ruling
   2026-09-14: "the compiler shouldn't be re-deriving classification and it
   should be using the graph". The hydrology graph the owner co-authored and
   checked in 16a/16b is the canonical water record (0058), so
   `worldgen/compile_water.py` now reads every kind, level, season, tidal
   flag, altitude band and river water class from the graph and computes
   no such value itself. 0063 item 1 said the compile "solves nothing"; round 1 was
   still re-deriving the classification behind that, which is what this
   record closes.

2. **What round 1 re-derived, and what each one did.**
   - (a) **"The sea" by connectivity.** `standing_water.sea_mask` took every
     below-0 cell connected to the ocean. Once the carve had cut outlet
     channels below 0, that swallowed 17 graph bodies (1.32 km²), among them
     the 1.07 km² swamp `body.1209-3032` the graph records at 0.84 m: drawn
     at 0, with 3,541 pooled river stations dropped to 0 with it. This is the
     "inland pool rising and falling like the ocean" the owner stood in at
     1.83 km E 4.84 km S.
   - (b) **The sea's class from salinity.** Fresh sea cells came out as LAKE,
     the class whose standing-wave blend makes a surface rise, fall and foam
     in unison: the whole-sea pulse the owner saw.
   - (c) **The open-sea fetch bonus** granted over that same sea mask, so an
     inland swamp measured a 58 km fetch and carried ocean swell.
   - (d) **Captured bodies skipped.** 75 bodies with a channel through them
     were left to their channel; 16 of those were then drawn as sea.
   - (e) **Salinity from the Phase 3 field, written on every cell.** The
     runtime reads salinity as the tide response, so inland water carried a
     tide.
   - (f) **Floodplain sheets up to 400 m beside every river**, at the river's
     level, whatever the 2D map showed. This is the source of the "hovering
     shards": 4,240 wet texels standing over half a metre above a dry
     neighbour's ground (1,309 of them over two metres), each drawn as a
     plate in the air off a bank.

3. **What the compile does now.** The sea is the graph's ocean: its coarse
   ocean seed grown only through cells no other entity owns, so a body's
   flood or a channel corridor standing above the sea stops the growth.
   Sea-level bodies (lagoons, sea-level marsh joined to the sea) are the
   sea's flood, labelled with their own graph id. Captured bodies take
   their recorded level, not their channel's. The extents are the
   graph's own: `hydrology-graph-bodies.npz` in the vault, the flood the
   derive solved on the shaped ground (per-cell level and the ocean mask, the
   same data the 2D map's hover tooltip shows). The compile reads a body's
   extent as the connected cells of that raster around its deepest cell, at
   the record's `levelM`; a cell of the extent where the frozen ground now
   stands above the level is counted as dry. Only a promised plunge pool
   (the channel's bowl) and the few bodies whose deepest cell the raster does
   not hold (about 15, listed in `stats.bodies.floodedInBox`) are flooded,
   inside their graph box. The sea's class is coast or estuary and never lake; a lagoon
   is estuary. Fetch is measured inside the sea and inside inland water
   separately. Salinity is written only on the ocean, lagoons and tidal
   reaches. Turbidity is the region's silt scaled by the graph: upland and
   montane bodies, plus whitewater or clearwater reaches above the lowland,
   take ×0.35; clearwater lowland reaches ×0.6 (owner: "higher altitude
   water should feel clearer when you're in it").

4. **Steep water is bankfull.** A steep station's drawn level is the profile
   level L across the trench's full width. This follows 0063 §5. The line is
   high water; at high water a mountain stream fills the channel that the
   carve cut for it. The round-1 notch rule (a thin flow at the bottom of the
   notch, over a discharge-derived wetted width) is retired; the owner saw
   "a small ribbon of water hugging the base of its channel": broken into
   pieces where the ground stood proud of it, dipping below the lip above
   each fall, too thin to wade. `wettedWidthM` and `wettedHalfWidthM`
   keep their names and now equal the trench width.

5. **A sheet holds only where the ground holds it.** Amends 0063 item 4.
   Lateral sheets beside rivers are compiled only inside the map's wet-season
   line (the graph's own wetline rule: Phase 3 wetlands in pieces of 10 or
   more coarse cells). A sheet cell standing over a lower dry neighbour
   drains and is dried, repeatedly, until the sheet rests on ground that
   holds it; a sheet piece under 6 cells is dried outright. A river's level
   ramps down to a lower receiving body's level over its last 40 m, never
   under the bed plus 0.15 m, so a riffle meets its lake at the lake's level
   (0.11 km E 3.04 km S was a 0.52 m wall).

6. **The perched census is general.** Amends 0063 item 8, which counted only
   channels perched above a sheet. A free channel station whose bank stands
   more than 0.3 m over lower dry ground is perched, beside a marsh or beside
   plain ground alike. Measured on the frozen ground, 46 % of the free
   lowland stations have a shoulder under their level 3 m out, 2,600 of them
   by over a metre; the round-1 sheets were hiding it. The owner's option (b)
   for the 90 sites (raise the rim as a patch) is therefore applied to every
   such bank, as a typed `levee` patch on the 16b patch machinery, authored
   from the census by `worldgen.author_terrain_patches`. The five approved
   dry-bed fixes are `bed-cut` patches.

7. **The plunge bowl is the pool's water.** The owner raster never stamps a
   plunge bowl as fall footprint or as strip; the field draws the pool
   surface. Round 1 stamped it, so the pool had no surface when seen from
   outside it.

8. **Seasons stay as the draw-down** (owner 2026-09-14: "keep your
   recommendation"; 0063 item 5 stands). The owner's season check site moves:
   1.50/5.28 has no graph body under it and is dry ground at the line, which
   is why the toggle changed nothing there. The site is now the seasonal
   swamp sheet `body.1703-3069` at 3.11 km E 5.61 km S, level 1.41 m, dry
   season 1.13 m.

**Non-obvious choices.** A body's extent is read from the graph rather than
re-flooded, because the carve only cuts outlets and plunge bowls: the extent
measured on the shaped ground is still the extent on the frozen ground. A
re-flood on the carved ground leaks out through every outlet the carve cut,
which is exactly how round 1 lost 17 bodies to the sea.
