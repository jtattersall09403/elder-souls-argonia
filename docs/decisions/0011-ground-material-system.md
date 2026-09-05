# 0011 — Two-level ground-material system (land cover × regional palette)

**Date**: 2026-08-23 · **Status**: accepted (owner feedback at the Phase 6
gate: draft splat too coarse and too vanilla-Skyrim; supersedes the flat
6-channel province-wide palette in the pass-1 splat compiler)

## Decision

Terrain ground texturing is restructured on the Bethesda pattern (research:
[skyrim-morrowind-landscape-texture-granularity](../research/rendering/skyrim-morrowind-landscape-texture-granularity.md)):

1. **Semantic land-cover raster (micro).** Worldgen compiles a per-texel land
   cover class from fields it already produces (region class, TWI wetness,
   HAND, salinity, tidal, flood, soil, slope, river band, distance-to-water/
   channel — plus roads from the route graph, fields/settlement ground in
   Phase 11). Classes are things like: channel bed, waterline mud band,
   riverbank, wet mud flat, reed bed, salt flat, tidal sand, hummock top,
   peat bank/slope, moss/root mat, leaf litter, firm grass, scrub, path/road,
   rock. The **water-edge gradient gets 3–4 dedicated classes** (highest-value
   granularity per research). This raster is the source of truth for
   materials and, later, footsteps, groundcover spawning and encounters
   (LTEX→grass pattern).
2. **Per-region material palette (macro).** Each region class (plan §16
   `RegionGrammar.materialPalette`) maps land-cover classes to **concrete
   materials** from a global library (~40–60 textures province-wide, ~6–10
   active locally): "firm grass" in the northern transition resolves to a
   different texture than in the southern jungle. Palettes blend (never
   hard-switch) at region borders; hue/value are matched within each palette.
3. **Runtime representation**: offline-compiled `(id0, id1, blend)` control
   map + KTX2 texture arrays (512² albedo+normal), hex-tiling, world tint
   colormap, distance detail fade — the BotW/Terrain3D architecture; constant
   shader cost at any material count
   ([webgl-terrain-many-material-splatting](../research/rendering/webgl-terrain-many-material-splatting.md)).
4. **Texture sources**: primarily CC0 PBR (ambientCG, Poly Haven) for the
   Black Marsh mud/wetland surfaces + open-permission Skyrim mods (A
   Cathedralist's PBR Landscape, Cathedral Landscapes) + the retained vanilla
   wet/mossy set, some hue-shifted
   ([black-marsh-ground-texture-sources](../research/rendering/black-marsh-ground-texture-sources.md)).
   Owner rulings 2026-08-23: **Project Rainforest approved** (provenance
   caveat accepted; use it wherever an agent judges it the best fit, with CC0
   + open mods tried first). **Vanaheimr – Marsh rejected** — cold-climate
   set; Black Marsh is canonically hot/humid tropical swamp (binding
   statement added to module 50 §33.1).

## Why

The pass-1 splat gave every region one fixed 6-channel mix province-wide.
Skyrim varies ~6 textures per ~32 m quad from a 68-texture library with
region-branded families; Morrowind's Bitter Coast alone has ~15+ ground
surfaces (mud/muck/scum/bank grades). Granularity lives in *local selection
from a regionally-bound palette*, not in more global channels — and vanilla
Skyrim's palette can't read as Black Marsh whatever the granularity.
