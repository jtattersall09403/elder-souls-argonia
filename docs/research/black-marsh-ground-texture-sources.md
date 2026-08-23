# Black Marsh ground texture sources — vetted shortlist (researched 2026-08-23)

Which tileable ground diffuses/normals to build the Black Marsh terrain
palette from, replacing/augmenting the vanilla-only set. Facts verified via
the Nexus API (archive content listings) + permission blocks from live pages.
Grounds decision 0011. Companions:
[skyrim-morrowind-landscape-texture-granularity.md](skyrim-morrowind-landscape-texture-granularity.md),
[webgl-terrain-many-material-splatting.md](webgl-terrain-many-material-splatting.md).

## Ranked acquisition shortlist

1. **ambientCG (CC0)** — https://ambientcg.com — full PBR, up to 8K, zero
   permissions. Verified IDs: `Ground050` (**mud with standing puddles** —
   algae-shallows base), `Ground051` (dark mud — closest literal "black marsh"
   mud), `Ground026`/`Ground025` (wet clay riverbank), `Ground083` (river
   mud), `Ground024` (peaty forest mud), `Ground037` (damp earth+grass —
   hummock ground), `Ground040/041/042` (mud + leaf litter), `Ground054`
   (mud-sand tidal transition), `Moss001–004`, `Footsteps001` (trodden mud),
   `ScatteredLeaves001/008/009` (overlays).
2. **Poly Haven (CC0)** — https://polyhaven.com/textures — complements #1 with
   jungle floor and tidal ground. Verified slugs: `mud_forest` (leaves+mud+
   sticks — best single "jungle floor over black mud"), `brown_mud_03` (wet
   soil w/ footprints), `aerial_mud_1` (rutted boat-landing mud),
   `forest_leaves_02/03`, `leaves_forest_ground`, `brown_mud_leaves_01`,
   `low_tide_rocks`, `coral_mud_01`, `damp_sand`,
   `mud_cracked_dry_riverbed_002` (dry-season bank clay).
3. **A Cathedralist's PBR Landscape** — [SSE 137333](https://www.nexusmods.com/skyrimspecialedition/mods/137333)
   — **open permissions**; full TruePBR landscape set (728 files, 2K–4K,
   diffuse+normal+rmaos+parallax) incl. the whole frozenmarsh/river/moss
   family. Best PBR-ready Skyrim-styled marsh source. Credit DrJacopo
   (Cathedral) + Faultier per its credits.
4. **Cathedral Landscapes** — [SSE 21954](https://www.nexusmods.com/skyrimspecialedition/mods/21954)
   — share-alike ("free to use so long as you share with open permissions");
   verified 4K frozenmarshgrass/dirtslopes + 2K riverbottom/rivermud/
   riverbededge/reachmoss/fallforestleaves/coastbeach.
5. **Project Rainforest SE (BASE loose files)** — [SSE 20636](https://www.nexusmods.com/skyrimspecialedition/mods/20636)
   — credit-only open, non-commercial; **113 ground DDS re-painting the
   entire vanilla landscape set tropical under vanilla filenames** (~1K).
   **Owner ruling 2026-08-23: approved — use it wherever it's the best fit**
   (provenance caveat — credits include LorSakyamuni's TW3 Landscape Resource
   and Vurt's SFO — was accepted). **INGESTED 2026-08-23**: archive cached in
   the vault (`mod-sources/project-rainforest-20636/`), tropical
   riverbottom/rivermud/fieldgrass02/fielddirtgrass01/frozenmarshgrass01/
   pineforest01/fallforestleaves01/coastbeach01/dirtpath01 in the ground
   library.
6. **Vanilla Skyrim wet/mossy set (keep, some with hue shifts)** — see below.
7. **Landscape – Aendemika of Vvardenfell** — [Morrowind 59713](https://www.nexusmods.com/morrowind/mods/59713)
   — credit-only; renews 73 textures incl. **Bitter Coast swamp mud, muck,
   moss, swamp soil, undergrowth** — most lore-adjacent open swamp set.
   **INGESTED 2026-08-23** (promoted above the Skyrim mods in practice: the
   BC set carries the swamp water-edge vocabulary): vault
   `mod-sources/aendemika-59713/`; bank/scum/muck/mud/moss/undergrowth/
   grass/scrub/rock in the ground library.
8. ~~**Vanaheimr – Marsh** — [SSE 121602](https://www.nexusmods.com/skyrimspecialedition/mods/121602)~~
   — **rejected by owner 2026-08-23: it's a cold-climate marsh set, and Black
   Marsh is canonically hot/humid tropical swamp** (binding statement in
   world module 50 §33.1). Permission ask not pursued.

## Black Marsh & Valenwood (ModDB) — INGESTED 2026-08-23

[BM&V](https://www.moddb.com/mods/black-marsh-valenwood) (owner-directed
top-priority source; module 90 §74.1b has the mining record). Its
`TEXTUREPACK/landscape/` is a full vanilla-named 512px repaint — dark, mossy,
moody, the mod's art-directed swamp look; roads/dirt-cliffs at 1024. 16
winners form the **`bmv-v1` material set** (default; A/B vs `aendemika-v1`
in the studio HUD). Its `Terrain/*` folders are LOD tiles — ignore. Grass
billboard families (EGrass, V_reeds, bittercoastgrass01) catalogued for
Phase 13 groundcover. Archives + manifest live gitignored under
`tooling/asset-pipeline/black-marsh-mod-source/`.

## Vanilla Skyrim textures that remain suitable (owner: don't write vanilla off)

- **Keep as-is**: `frozenmarshgrass01` (hummocky marsh grass w/ waterlogged
  gaps — warm-tint to read subtropical), `frozenmarshdirtslopes01` (dark wet
  peat bank), `riverbottom01`, `rivermud01` (channel beds, waterlogged flats),
  `reachmoss01`/`reachmossyrocks01` (moss carpet / mossy stone — hummock tops,
  root ground), `coastbeach01/02` + `coastoceanfloor01` (salt-marsh fringe).
- **Keep with tint**: `fallforestleaves01` (leaf litter, hue-shift
  autumn-yellow → brown-green jungle).
- **Sleepers**: `cavebaseground01` (wet dark cave floor = serviceable black
  mud), `dirt02` (dark loam).
- **Replace/push wetter**: `fieldgrass02` (temperate meadow — weakest current
  choice for Black Marsh interior).
- Cold-only: `frozenmarshice01/02`; `frozenmarshlichen01` only if recoloured
  toward algae.

## Ruled out (don't re-research)

- **Closed permissions**: Skyrim 202X (SSE 2347), Septentrional Landscapes
  (SSE 29842), Tamrielic Textures (SSE 32973), Tropical Skyrim LE (33017 —
  use Project Rainforest instead), Bitter Coast Redux (MW 45708), Vivid
  Landscapes (nothing swamp-specific anyway).
- **Beyond Skyrim**: no Black Marsh terrain released anywhere (project
  pre-release; only trailers/showcases); Bruma's ground textures are 512px
  Jerall-mountain biome and BS forbids redistribution. Nil.
- **Eye of Argonia** (Project Tamriel Black Marsh, MW engine): design-stage,
  heightmap only — nothing to download yet. Recheck in a year.
- **Morthal-area "swamp" mods** (The Marshlands 23062, Quaint Hjaalmarch
  92735, Detailed Landscapes Morthal 93198): worldspace/flora edits, no
  ground diffuses. "Bog Standard" does not exist.
- **HD Remastered Landscapes (SSE 94835)**: great leaf-litter/mud content but
  photoreal packs of unverified provenance — only if permissions check out.

## Practical recommendation (adopted in 0011)

Build the palette primarily from CC0 PBR (#1/#2 — best legal position, full
PBR for our renderer), use #3/#4 where art direction should match remaining
Bethesda assets, keep the vanilla wet/mossy set with tint shifts, treat #5/#7
as references/gap-fillers with credits. Nexus downloads via the API key (see
memory/asset-pipeline notes); record every acquired source in
docs/CREDITS.md.
