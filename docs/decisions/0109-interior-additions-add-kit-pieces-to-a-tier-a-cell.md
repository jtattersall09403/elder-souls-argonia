# 0109 — Interior additions: a builder may add kit pieces to a tier A cell

Planner ruling, 2026-09-29 (16k walk 5, interior lighting). Extends 0103
decision 3 (a tier A cell is copied verbatim) and follows 0104 (one home per
fact).

## Why

Seven King of the Murkmire tier A cells (KeebaHouseFisher, -Crafter,
-SnailMinder, -Elder, LilmothGlassworksOverseerHouse,
LilmothIronworksOverseerHouse, LilmothPlantationStorehouse) read dim. Their
author lit them for Skyrim, where the cell's directional-ambient cube does
most of the work; we do not import that cube, and the plugin places few
lights with small radii (2.5–4.6 m). Raising the ambient fill passes the
dark bar but leaves the room flat (0–4 % source-led, § 7 of
`doors-interiors-sockets.md`). The room needs more sources, and before this
record no builder could add a fixture to an interior cell:
`kit-interiors/substitutions/<cell>.json` only stands in for a missing refId.

## Decision

1. **Home.** `world/sources/placement/kit-interiors/additions/<cellId>.json`
   is the one home of a cell's additions: `{schemaVersion: 1, cellId,
   additions: [{id, assetId, pos: [x, y, z], rotZDeg, zone, why}]}`. `id` is
   stable, `<cellId>:add:<slug>`; `pos` is metres in the cell's own frame
   (the placements' frame); `zone` is one of bed, table, hearth, work, door,
   store, shrine; `why` is one line, the resident's reason.
2. **Additions only add.** An addition places a published interior kit piece.
   It never moves or removes a plugin reference; a missing plugin piece is a
   substitution, never an addition.
3. **Export.** `worldgen/export_interior_bundle.py` (`load_additions`) reads
   the file after the substitutions and appends each addition to
   `placements[]` with `source: "addition"`, sorted by id. It refuses an
   `assetId` in no published kit, a duplicate or foreign id, an unknown zone,
   a missing `why` and a `pos` outside the box around the plugin placements'
   bounding spheres. Additions stand outside the `refCount` sum and out of the
   absent-master placement votes (R45). The lighting rule
   (`interior_light.apply_light_rule`) then runs over them like any placement:
   a piece whose kit manifest carries a `light` gets it.
4. **Lighting design rule** (for the builder who writes the file): every
   living zone (bed, table, hearth, work, door) has a flame fixture within
   2 m, and there is at least one lit fixture per 12 m² of walkable floor.
   Prefer the plugin's own fixture kinds (candles, candle-horns, lanterns),
   placed where a resident would put them: on the table, beside the bed, on
   the hearth wall, and inside by the door. Verify with `light_balance`
   source-led ≥ 70 % and the `render-interior` readers (readable, warm, lit
   by its sources).

No cell's additions are authored with this record; they are designed once
the interior kits carry their mined lights.

## Addendum 2026-10-01: daylight through windows (owner, walk 9)

Supersedes decision 0103 R11 ("window glows are emissive only"). By night a
cell has only its natural sources (fires, candles, record lights) over
`INTERIOR_NIGHT_AMBIENT` (15 %) of its ambient cube and template
directional. By day those rise with the sun (`daylightShare`: sin(altitude)
/ sin 30 deg, clamped 0..1, times the weather: the drawn sky rig's
`directFactor` takes it down to `WINDOW_OVERCAST_SHARE` 0.5 under full
overcast), every window pane glows the drawn rig's sun colour and each pane
is a light of that colour (`WINDOW_LIGHT_CANDELA` 4 cd, 4 m) held as a
reserved light in the scene's fixture light field (decision 0108's cap, no
PointLight per pane). A pane is a material its NIF really emits (kit manifest
`emissiveMaterials`, `nif_blocks.emitting_shapes`) on a window piece; the
light sits at the pane geometry's centre. Code: `interiorLoader.ts`
`InteriorDaylight`; the host (`InteriorDoors.tsx`) feeds it each frame.
