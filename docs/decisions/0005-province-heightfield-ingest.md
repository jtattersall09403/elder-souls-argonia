# 0005 — Province heightfield ingest and provisional scale

**Date:** 2026-08-22 · **Status:** accepted (rescale factor still open)

## What was ingested

Tamriel Worldspaces **Argonia.esp** (Nexus SSE mod 118678, file 498168; hash in
`world/sources/README.md`), parsed by our own minimal TES5 reader
(`tooling/world-generation/worldgen/esp.py`) — no Bethesda tooling needed.

Facts extracted:

- 15,876 LAND cells, full 126×126 block (cells −62..63 on both axes);
- stitched grid 4033×4033 samples, 1.83 m/sample at raw Skyrim scale
  (0.01428 m/unit, 4096-unit cells) → **7.37 km × 7.37 km** raw extent;
- heights −85.7 m … +121.9 m; worldspace default water level = 0 exactly,
  matching our sea-level convention (decision 0003); 37% of samples below sea
  level (open sea east/south + interior depressions);
- relief matches lore maps: border mountains west/northwest, central-southern
  upland, lowland marsh basin through the middle, coast east and south.

Float32 grid + meta cached in the vault next to the esp; downsampled preview
rasters (1345², 8-bit and 16-bit PNG) committed to
`apps/world-studio/public/province/`.

## Open: horizontal rescale

7.4 km is Skyrim-map scale, far below the province feel the master plan wants.
The heightfield is a **shape prior, not a scale authority**: a horizontal
scale multiplier (candidates ×3–×6) will be chosen at the start of Phase 3
hydrology, informed by owner feedback on travel-time feel. Until then no code
may bake in a metres-per-sample constant outside the generated meta files.

## Also decided

The All Tamriel Heightmap Beta06 archive is downloaded and registered as a
cross-border context source, but the dedicated Argonia worldspace is the
primary macro prior (finer local detail, already clipped to the province).
