# Ground cover: how Skyrim, the vault mods and shipped open worlds do it (16f)

Research for the 16f ring rebuild (owner ask C9: the jungle floor as dense
as before, low cover nearly everywhere else, varied, never one identical
grass, fast). Sources: `world/sources/placement/vanilla-groundcover-rules.json`
and `groundcover-rules.json` (mined GRAS/LTEX records), the vault manifests
plus the talks and docs cited inline. What it decided is in decision 0070 §9
and `world/sources/flora/groundcover.json` (schema 3).

## 1. Skyrim's own system, in numbers (vanilla `Skyrim.esm`)

- 27 GRAS records. Density 3–79 (median 14); slope min always 0, max
  28–55°; position jitter 0.41–0.97 m; height variance 0.20–0.40; colour
  variance 0.05–0.30; wave period 50–600; the water rule used in two of its
  four states, with `unitsFromWater` on the four submerged grasses.
- 68 landscape textures, **48 bind no grass (71 %)**. Every grass texture has
  a hand-authored `…NoGrass` twin (17 of the 48): bare ground is PAINTED,
  never excluded at runtime. `LTEX.GNAM` binds at most three grasses; the
  engine draws two by default (`iMaxGrassTypesPerTexure`).
- Engine settings: `iMinGrassSize` 20 (density ∝ 1/value),
  `fGrassMaxStartFadeDistance` 7000, `iGrassCellRadius` 2,
  `fGrassWindMagnitudeMin/Max` 5/125. The modding scene's grass mods sit at
  `iMinGrassSize` 60–128 for frame rate (Grass FPS Booster 120–128,
  Folkvangr 60, Cathedral/Verdant 60–80) and mismatched INIs across mods
  are the known failure.
- Correction to `shipped-world-placement-rules.md` R10: its quoted values
  (marsh 60, reach 30, forest 25; 47 textures, 20 bare) are Tropical
  Skyrim's overrides, not vanilla's (38, 14, 15; 68 and 48).

## 2. The vault mods

- Tropical Skyrim converts vanilla by number: marsh ×1.6, reach ×2.1, forest
  ×1.7 denser; tundra crushed to a fifth and held to ≤ 14–19° slopes; forest
  and rock colour variance cut (uniform jungle green), marsh raised to 0.30;
  two new "plant" records (`GrassFern01`, `GrassPlant01`) at height variance
  1.0, colour variance 0, flag 7: a big-scatter no-tint class distinct from
  grass.
- Black Marsh & Valenwood defines **no** GRAS records (rule M4 confirmed);
  its ~250 grass meshes are asset pool only (`EGrass01–58`, ~45 `ESu`
  summer herbs, ~20 `ESp` flowers, Vurt's set, the `EWp` waterside set,
  litter mats). It lives at `tooling/asset-pipeline/black-marsh-mod-source/`.
- The vault holds ~300 usable ground-cover meshes against the 34 the kit
  shipped; the 34 were mostly the same few silhouettes retextured (five
  groups of byte-identical geometry): variety was texture-only.

## 3. Shipped open worlds: the five mechanisms every one shares

| mechanism | where it is stated |
|---|---|
| **Ground type is the authority** (a material layer, a painted texture, a detail map; never a per-instance list) | UE Landscape Grass Type, Witcher 3 (GDC 2014 Gollent), Unity terrain details, Bethesda |
| **Fade is a per-species band**, not one global radius | UE `StartCullDistance`/`EndCullDistance` per variety; REDengine one culling grid per grass type; Bethesda `fGrassFadeRange` |
| **Clumping is a second noise field** with its own scale, separate from the placement jitter | Unity Noise Spread; REDengine's offline water/sunlight resource simulation; Horizon's placement graphs (GDC 2017 van Muijden) |
| **Colour is sampled from the ground** | Witcher 3's pigment map (a low-mip top-down terrain render sampled in the vertex shader with a bottom-up falloff); Unity healthy/dry interpolation; Cathedral Landscapes' matched LOD textures |
| **Shadow casting off, always; polygons near the camera, cards at distance** | UE per-variety flag; Bethesda never; Ghost of Tsushima (GDC 2021) and BotW render per-blade near and switch to cards far, which is how they hold overdraw down |

No per-frame instance or draw budget for Horizon, Ghost of Tsushima, RDR2
or BotW is quoted in any fetchable text (slides and video only); the one
hard budget we own is our own measurement in `docs/world/65-vegetation-scatter.md`.

## 4. What the ring did before 16f, against those five

One radius (75 m) and one 20 % scale fade for all species; jitter but no
clump field (the uniform carpet); no ground-colour tint; whole-ring
regeneration every 16 m; 24 of 38 land covers bare. The 16f ring (decision
0070 §9) carries per-species fade bands, a clump field, ground tint per
instance, a per-tile cache and floors per region and cover; see
`apps/world-studio/src/vegetation/README.md` for the shipped mechanisms.
