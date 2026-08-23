# How Skyrim & Morrowind achieve granular ground texturing (researched 2026-08-23)

Why this exists: the Phase 6 draft render textured the whole basin from 6
province-wide splat channels and the owner judged it far too coarse. This doc
records how Bethesda actually structures landscape texture granularity, to
ground our redesign (decision 0011). Companion docs:
[webgl-terrain-many-material-splatting.md](webgl-terrain-many-material-splatting.md),
[black-marsh-ground-texture-sources.md](black-marsh-ground-texture-sources.md).

## Headline finding

Bethesda's **global** texture budget is small (~50–60 landscape diffuses / 68
LTEX records for all of Skyrim; ~110 for Morrowind) — but the **local
selection** varies constantly. Skyrim lets every ~32 m quad pick its own ~6
textures from the global library; Morrowind assigns one texture per ~4.8 m
square from ~110. Six channels *province-wide* was our real limitation, not
six channels per se.

## Skyrim engine mechanics (Creation Engine)

- Each exterior cell's LAND record splits into **4 quadrants**; each quadrant
  has one base texture (BTXT) + up to 8 alpha-blended layers (ATXT/VTXT),
  practical limit **~6 textures per quad** (CK wiki warns more render black).
  So the texture budget is per-~32 m patch, not per-region.
  ([UESP LAND format](https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/LAND),
  [CK wiki: Landscape](https://ck.uesp.net/wiki/Landscape))
- An **LTEX** record bundles diffuse+normal (TXST), footstep/impact material,
  Havok friction, and **a list of grass records that auto-spawn on ground
  painted with that texture** (GNAM). Semantic ground type drives groundcover —
  one paint stroke changes diffuse *and* vegetation.
  ([UESP LTEX](https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/LTEX))
- The **region system** (REGN) holds per-region texture lists with
  parent/child blend hierarchies conditioned on density, slope, height —
  procedural generation stamps regional defaults, artists hand-paint detail.
  ([CK wiki: Region](https://ck.uesp.net/wiki/Region)). Practical modder
  guidance: ~5–6 textures per region setting for generation, hand-paint the
  rest ([Hoddminir region generation](http://hoddminir.blogspot.com/2021/02/region-generation-part-i-landscape.html)).

## Skyrim's vanilla taxonomy: biome-prefixed families, not generic materials

Bethesda shipped no generic "grass/dirt/rock" — every biome has its own branded
family with matching companions and a **dedicated grass↔dirt transition
texture**:

| Semantic slot | Examples per region family |
|---|---|
| Grass | Tundra01/02 (Whiterun), FieldGrass01/02, ReachGrass01, FallForestGrass01 (Rift), FrozenMarshGrass01 (Hjaalmarch), VolcanicAshGrass01, CoastBeachGrass01, GrassSnow01 |
| Grass↔dirt transition | TundraMoss01, FieldDirtGrass01, ReachMoss01, FrozenMarshLichen01 |
| Dirt | Dirt01/02, ReachDirt01, FallForestDirt01, FrozenMarshDirtSlopes01, VolcanicAsh01–03 |
| Rock | TundraRocks01, Rocks01, ReachMossyRocks01, FallForestRocks01, SnowRocks01 |
| Floor/litter | FallForestLeaves01, PineForest01–03 |
| Path/road | DirtPath01, DirtSnowPath01 (shared cross-region) |
| **Water edge (3-stage gradient)** | **RiverBedEdge (waterline band) → RiverMud (exposed wet mud) → RiverBottom (submerged)**; plus CoastBeach01/02, CoastOceanFloor01, MineralPoolTerrace |

Sources: coverage lists of landscape replacers —
[ATHEUZZ Landscapes PBR](https://www.nexusmods.com/skyrimspecialedition/mods/133389),
[Green Skyrim](https://www.nexusmods.com/skyrim/mods/72950),
[Tamrielic Textures](https://www.nexusmods.com/skyrimspecialedition/mods/32973).

**Hjaalmarch marsh** (closest vanilla Black Marsh analogue) uses ~7–8 textures
for one marsh: FrozenMarshGrass01 + Lichen01 + DirtSlopes01 + Ice01 + the
shared river family, with LTEX-bound reeds/tufts growing out of shallow water.
Water transitions are painted RiverBedEdge/RiverMud bands + vertex-colour
darkening — and vanilla is full of hard seams masked only by palette-hue
matching ([Landscape Seam Fixes](https://www.nexusmods.com/skyrimspecialedition/mods/59687)).

## Morrowind: coarser tech, stronger regional branding

One texture index per ~4.8 m square, no alpha layers, engine auto-blends
adjacent squares ([UESP Morrowind LAND](https://en.uesp.net/wiki/Morrowind_Mod:Mod_File_Format/LAND)).
Its regional distinctiveness comes from **library branding**: `Tx_BC_*` Bitter
Coast, `Tx_AI_*` Ascadian Isles, `Tx_WG_*` West Gash… A single town cell uses
8–10 region-branded textures including *two road types per region*. **Bitter
Coast alone has ~15+ ground surfaces** — mud graded as mud / muck / scum
(stagnant film) / bank (waterline), plus dirt, grass, moss, scrub ×2,
undergrowth, rocks ×4, road. Ascadian farmland distinguishes tilled-field dirt
from plain dirt from dirt road. Adjacent regions deliberately share/bleed a few
textures so borders blend.

## Implications adopted in decision 0011

1. **Regionalise the palette (macro)**: keep ~6–10 active materials per
   region, but bind semantic slot → concrete texture per region; blend
   palettes (don't hard-switch) at borders.
2. **Spend granularity on the water-edge gradient (micro)** — both games
   dedicate 3–4 surfaces to it; for Black Marsh it's the highest-value axis.
3. **Ship pre-made transition textures** per region (half-A-half-B diffuses).
4. **Paths/roads are their own material everywhere** — strongest single
   anti-carpet signal; Morrowind even splits main vs dirt road per region.
5. **Bind groundcover to ground type** (LTEX→grass pattern) so vegetation and
   texture always agree.
6. **Match hue/value within each regional palette** — that's what hides
   imperfect blends in the originals; add slope-conditioned rock/slope
   variants for free variation.

Target consistent with both games: **global library of ~40–60 semantic ground
textures**, any local area using ~6–8 of them.
