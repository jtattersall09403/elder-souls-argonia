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
   set a flood floor `floorMinM` below which no datum falls (Claywater's
   north strip: 35.8 m). The workbench export resolves the datum and writes
   it into the blueprint; nothing downstream re-solves it (0066).
3. **A padded piece is seated and judged on the patched ground**, never
   the frozen ground: the 97 B3 slope rule, the fit delta, the seat. The
   frozen terrain is never edited.
4. **Rule R1 (retaining walls).** Where the pad's fill or cut against the
   ground beyond it exceeds 0.6 m along an edge, that edge is a
   retaining-wall run from the culture's wall family
   (`settlement_run_pads.RETAINING_WALLS`; imperial: the farmhouse
   stonewall pieces and composite stonewall runs), laid as a modular run
   from the downhill edge. A culture with no wall family (Argonian mud)
   keeps its pad within 0.6 m; past that the piece moves or changes.
5. **Gates.** `wb.py check` reports `padRule` (pad-fit) on an edge over
   0.6 m that wall pieces do not cover; the compile refuses a pad with no
   datum, a delta over 2.0 m, water under it (0059 invariant 4) or a datum
   under its flood floor.
6. **One pad writer, one judge, one surface.** `settlement_run_pads.pad_patch`
   writes both the run pads and the building pads;
   `export_settlement_bundle.emit_run_pads` merges both cumulatively into
   the place's patch set. A building patch carries `hardM` 0, so the
   realised pad is exactly footprint + apron and `pad_ground` is its
   surface. `settlement_run_pads.building_pad` is the one refusal, called by
   the compile and by `wb.py check`; after the pads are resolved every
   compile read (seat, fit delta, a stacked base, assemblies, dressing) is
   on the patched ground (`PaddedSurvey`).
7. **Yard sets are a tracked record.** `world/sources/placement/yard-sets/<type>.json`
   (`schemaVersion` 1: set id, anchor, members with piece id, offset, yaw,
   optional mount) is what `wb.py group place` reads first; the gitignored
   `output/prefabs` serves only the yard fixtures. `01-road-station.json`
   holds Claywater's four sets.

## Measured (scratch scene, chunk ground)

| Case | Without a pad | With a pad |
|---|---|---|
| B1 farmhouse01-with-door, 316/3064 | survey delta 2.63 m > plinth 0.60 m | datum 37.11 m (median clamped: the survey raster, 5.48 m pixels, reads 0.4 m more fill than the chunks), fill 2.00 m, cut 1.38 m; all 4 edges need walls; red until 6 stonewall pieces laid, then `padRule` null |
| B4 kotm mudhut01, 312/3004 | 3.93 deg cell > 2.0 deg | datum 34.93 m (median), fill 0.37 m, cut 0.30 m; no edge over 0.6 m; green |
