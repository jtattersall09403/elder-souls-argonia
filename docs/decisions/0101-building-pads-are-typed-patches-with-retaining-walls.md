# 0101 — Building pads are typed patches with retaining walls; yard sets are a tracked record

**Date:** 2026-09-26. **Status:** accepted (planner architecture, 16k slice
1c, carrying 16h item 13 "pads as patches"). Extends
[0059](0059-terrain-built-once-frozen-base-and-typed-patches.md) (patches
are typed, the terrain is frozen) and
[0100](0100-one-place-skill-whole-layout-authoring-lessons-store-and-the-acceptance-freeze.md)
(one layout file per place). Evidence: `tooling/.reports/16k/pads.md`,
`tooling/.reports/claywater-site-evidence.md`.

## What was wrong

Claywater Station's two hardest sites could not be built. The farmhouse
with door at 316/3064 measured a 2.63 m survey delta against the plinth
fit's 0.60 m; the KotM mud hut at 312/3004 stood on a 3.93 deg footprint
cell against the pad fit's 2.0 deg. Only modular runs had pads
(`settlement_run_pads`); a building had no way to level its own ground, and
nothing said what holds up the edge of a levelled building.

## Decisions

1. **A building may declare a pad.** A `place` op (layout or CLI
   `--pad`) carries `pad: {apronM?, datumM?, floorMinM?}`. The pad is a
   typed patch of kind `settlement-pad` over the footprint grown by the
   apron (default 1.5 m), graded to one datum; its stable id ends with the
   parcel id.
2. **The datum** is the median chunk-ground height under the pad, clamped
   so fill and cut are each at most `MAX_PAD_DELTA_M` = 2.0 m on the chunks
   and on the survey raster the compile judges; a place may
   set a flood floor `floorMinM` below which no datum falls. For a
   culture with no retaining-wall family (rule R1, e.g. Argonian mud) the
   floor is the local high-water line itself (16c: the map's water is the
   high-water line), rounded up to the next 0.1 m, never a margin above it:
   a margin pushes the pad's edges over R1's 0.6 m where no wall may hold
   them (Claywater's north strip: line 35.24 m, floor 35.3 m; planner
   2026-09-26). The workbench export resolves the datum and writes
   it into the blueprint; nothing downstream re-solves it (0066).
3. **A padded piece is seated and judged on the patched ground**, never
   the frozen ground: the 97 B3 slope rule, the fit delta, the seat. The
   frozen terrain is never edited. This holds for **every** piece whose
   footprint touches a pad, not only the one that declares it: 97 B3
   reads the patched surface's own slope under the part of the footprint
   on a pad, never the 5.48 m analysis grid, whose cells still read the
   frozen ground there, and the grid under the part off every pad
   (`settlement_run_pads.padded_slope_deg`, read through `pad_slope_deg`
   by `compile_settlement.footprint_max_slope_deg` on `PaddedSurvey`, the
   workbench's `PaddedGround` and the yard gate's patched survey; planner
   ruling 7a, 2026-09-26: a barrel on B1's apron read 11° on the grid).
4. **Rule R1 (retaining walls).** Where the pad's fill or cut against the
   ground beyond it exceeds 0.6 m along an edge, that edge is a
   retaining-wall run from the culture's wall family
   (`settlement_run_pads.RETAINING_WALLS`; imperial: the farmhouse
   stonewall pieces and composite stonewall runs), laid as a modular run
   from the downhill edge. A culture with no wall family (Argonian mud)
   keeps its pad within 0.6 m; past that the piece moves or changes.
   A piece of the wall family carries no 97 B3 footing-slope rule
   (`compile_settlement.is_retaining_wall`, beside `SLOPE_EXEMPT_KITS`): it
   stands where the ground steps by more than the limit by construction
   and is not a floor. Every other rule still judges it (the fit delta,
   the run's mined pairs, R1's cover; planner ruling 7b, 2026-09-26). Its
   yard-gate sill is measured on the pad side against the padded ground
   (rule 10).
5. **97 C6 is measured per district, under the column the place is built.** The built ground is the union of the district hulls, each buffered by half the column's maximum building spacing, and the band is the `densityPerHa` of the `breadth-bars.json` column its counted buildings fall in (`blueprint.density_column`, `district_hull_area_ha`; planner ruling 2026-09-26: Claywater read 7.5/ha on one hull spanning road and ford, 14.3/ha under the hamlet column).
6. **Gates.** `wb.py check` reports `padRule` (pad-fit) on an edge over
   0.6 m that wall pieces do not cover; the compile refuses a pad with no
   datum, a delta over 2.0 m, water under it (0059 invariant 4) or a datum
   under its flood floor.
7. **One pad writer, one judge, one surface.** `settlement_run_pads.pad_patch`
   writes both the run pads and the building pads;
   `export_settlement_bundle.emit_run_pads` merges both cumulatively into
   the place's patch set. A building patch carries `hardM` 0, so the
   realised pad is exactly footprint + apron and `pad_ground` is its
   surface. `settlement_run_pads.building_pad` is the one refusal, called by
   the compile and by `wb.py check`; after the pads are resolved every
   compile read (seat, fit delta, a stacked base, assemblies, dressing) is
   on the patched ground (`PaddedSurvey`).
8. **Yard sets are a tracked record.** `world/sources/placement/yard-sets/<type>.json`
   (`schemaVersion` 1: set id, anchor, members with piece id, offset, yaw,
   optional mount) is what `wb.py group place` reads first; the gitignored
   `output/prefabs` serves only the yard fixtures. `01-road-station.json`
   holds Claywater's four sets.

9. **A bound run collides as one part** (planner ruling 2026-09-26). A run is
   seated as one rigid chain (259b200a), so the runtime joins its members'
   LOD0 triangles into one trimesh (`game-core/src/settlement/runColliders.ts`)
   and the export counts it once (`export_settlement_bundle.
   resident_collision_parts`); a run of measured proxy boxes keeps one part
   per piece. Claywater Station: 148 resident parts per piece, 113 joined
   (x 1.55 = 175, under the 200 ceiling, which stays).
10. **Beached craft and retaining-wall sills** (planner rulings 3 and 4,
   2026-09-26). A retaining wall's yard-gate sill is measured on the pad side
   against the padded ground: its top course must meet the pad, so the sill
   is how far its placed top falls short of the pad
   (`settlement_run_pads.retaining_sill_m`). A hull
   or cleat placed `beached` (layout field) is judged on its base contact
   (float <= 0.3 m), the bank's slope (<= 20 deg) and a wet cell within 1.5 m
   of its outline (`wb.py` `_beached`), in place of 97 B3, the fit delta and
   the sill.
## Measured (scratch scene, chunk ground)

| Case | Without a pad | With a pad |
|---|---|---|
| B1 farmhouse01-with-door, 316/3064 | survey delta 2.63 m > plinth 0.60 m | datum 37.11 m (median clamped: the survey raster, 5.48 m pixels, reads 0.4 m more fill than the chunks), fill 2.00 m, cut 1.38 m; all 4 edges need walls; red until 6 stonewall pieces laid, then `padRule` null |
| B4 kotm mudhut01, 312/3004 | 3.93 deg cell > 2.0 deg | datum 34.93 m (median), fill 0.37 m, cut 0.30 m; no edge over 0.6 m; green |
