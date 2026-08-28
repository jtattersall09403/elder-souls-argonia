# Tropical shoreline & bed materials — taxonomy, texture inventory, gaps, assignment spec

Research for painting tropical-correct sea floors, riverbeds and shores (replacing mossy-rock/temperate
defaults). Consumer: the landcover compiler. Province context: ~7.4 km Black Marsh — monsoonal wetlands,
mangrove coast on Topal Bay (sheltered) and the Padomaic (more exposed), big muddy rivers, Lake Blackrose,
rocky border-mountain streams. Palette: 32 tiling materials per set in
`apps/world-studio/public/textures/ground/{bmv-v1,aendemika-v1}/materials.json` (identical ids/names across sets).

## Part A — real-world tropical shoreline/bed taxonomy

Key physical principle: **wave exposure sorts sediment**. Exposed shores keep only sand and coarser (mud is
winnowed away); sheltered shores accumulate mud; tropical sheltered muddy intertidal is normally colonised by
mangroves ([Coastal Wiki: Characteristics of sedimentary shores](https://www.coastalwiki.org/wiki/Characteristics_of_sedimentary_shores),
[Springer: Mangroves, Geomorphology](https://link.springer.com/rwe/10.1007/978-3-319-93806-6_204)).
Secondary controls: river discharge (delivers fine sediment → deltas/mudflats), slope (flat = depositional flats,
steep = rock/gravel), salinity (mangrove vs freshwater swamp), depth/light (seagrass).

| # | Type | Occurs when (rules over our data fields) | Ground look | Typical shore→land transition |
|---|------|------------------------------------------|-------------|-------------------------------|
| A1 | Exposed sandy beach | High wave exposure/fetch, moderate slope, salty, away from big river mouths ([Coastal Wiki: sandy coastlines](https://www.coastalwiki.org/wiki/Classification_of_sandy_coastlines)) | Pale-tan dry sand above waterline; darker wet sand band in swash zone | subtidal sand → wet sand → dry sand → low dune/beach ridge → coastal scrub ([Wikipedia: Beach](https://en.wikipedia.org/wiki/Beach)) |
| A2 | Sheltered muddy/tidal flat | Low exposure (bay interior, behind headlands/bars), very low slope (<1%), tidal, salty | Wide glistening grey-brown mud, drainage channels, algal film patches | subtidal silt → bare mudflat → mangrove/salt marsh ([Wikipedia: Mudflat](https://en.wikipedia.org/wiki/Mudflat)) |
| A3 | Mangrove fringe | Upper intertidal of A2: sheltered + muddy + brackish-to-salty; never on exposed coasts | Dark organic mud, wet, root-riddled; leaf litter on higher ground | mudflat → mangrove mud (trees/roots as meshes) → brackish marsh → swamp forest |
| A4 | River-mouth delta/bar | Near mouth of high-discharge river; low exposure to moderate | Interleaved wet sand bars and mud; rippled wet sand where currents run | channel mud → wet sand bar → mudflat/mangrove on flanks ([Wikipedia: River delta](https://en.wikipedia.org/wiki/River_delta)) |
| A5 | Rocky headland/cove | High exposure + steep slope, or hard substrate (border mountains meeting sea) | Bare wave-washed rock, wet dark at waterline; pocket coves collect pebbles/coarse sand | rock platform → pebble/sand pocket beach → cliff/scrub ([Wikipedia: Headlands and bays](https://en.wikipedia.org/wiki/Headlands_and_bays), [Shore platform](https://en.wikipedia.org/wiki/Shore_platform)) |
| A6 | Estuarine brackish bank | Tidal reach of rivers: brackish salinity, low exposure, muddy | Slick clay/mud banks, undercut, grass-topped; scum lines at high-water mark | channel silt → wet clay bank → marsh grass → floodplain ([Wikipedia: Estuary](https://en.wikipedia.org/wiki/Estuary)) |
| A7 | Freshwater sand/gravel bar | Fresh, moderate-to-high gradient streams (mountain fringe); point bars on meanders | Clean rounded pebbles/gravel, coarse sand patches; cracked clay when dry-season exposed | channel gravel → bar → wet bank → riparian forest ([Wikipedia: Point bar](https://en.wikipedia.org/wiki/Point_bar)) |
| A8 | Swamp/peat bed | Fresh, stagnant, near-zero slope, interior wetland | Black organic muck, peat, surface scum, submerged leaf litter | open-water silt → scum/muck margin → peat → swamp-forest floor ([Wikipedia: Peat swamp forest](https://en.wikipedia.org/wiki/Peat_swamp_forest)) |
| A9 | Lake shore (Blackrose) | Fresh, large fetch but no tide; exposure varies by side of lake | Silt bed; windward shores slightly sandier/firmer, leeward muddy with reeds | silt bed → wet bank → marsh grass/reed belt → floodplain |
| A10 | Seagrass/shallow shelf bed | Subtidal 0.5–10 m, sheltered-to-moderate exposure, salty, clear water, sandy-muddy bed | Rippled pale sand with green seagrass patches | seagrass meadow → bare rippled sand → beach or mudflat above ([Wikipedia: Seagrass](https://en.wikipedia.org/wiki/Seagrass)) |

Delta/mudflat vs beach at river mouths: high mud supply + shelter → A2/A4; if the mouth faces an exposed coast,
waves rework the sediment into flanking sandy barriers (A1). Mangroves (A3) require prior wave attenuation by
flats or bars — never paint mangrove mud on outer exposed shores.

## Part B — existing texture inventory (both sets, shared 32-id palette)

Sets: `bmv-v1` ("Black Marsh & Valenwood mix", default) and `aendemika-v1` ("Aendemika BC + Rainforest + CC0").
Same ids/names/tileM; sources differ per set (BMV = Black Marsh & Valenwood mod, PR = Project Rainforest SE,
AoV = Aendemika of Vvardenfell). avgColor below from bmv-v1.

| id | name | tileM | avgColor | source (bmv-v1 / aendemika-v1 if different) | shoreline suitability |
|----|------|-------|----------|---------------------------------------------|------------------------|
| 0 | water_silt | 7 | 50,54,29 | BMV riverbottom / PR riverbottom | A8/A9 bed, deep channel bed |
| 1 | river_mud | 6 | 58,57,33 | BMV rivermud / PR rivermud | A2 flat, A4 channel, A6 bed |
| 2 | bank_wet | 6 | 48,57,50 | BMV riverbededge / AoV Tx_BC_bank | A6/A9 wet bank, water's-edge band |
| 3 | scum | 7 | 56,58,29 | AoV Tx_BC_scum | A8 margins, stagnant shallows, A2 algal film |
| 4 | black_mud | 6 | 59,49,35 | ambientCG Ground051 | **A3 mangrove mud** (best fit), A8 |
| 5 | puddle_mud | 8 | 71,61,46 | ambientCG Ground050 | A2 mudflat with standing water |
| 6 | clay_bank | 6 | 81,66,50 | ambientCG Ground026 | A6 brackish clay bank |
| 7 | muck | 7 | 58,52,39 | AoV Tx_BC_muck_01 | A3/A8 organic muck |
| 8 | bc_mud | 6 | 58,53,43 | AoV Tx_BC_mud | generic mud filler |
| 9 | peat | 7 | 58,56,49 | ambientCG Ground024 | A8 peat |
| 10 | mud_leaves | 7 | 64,59,41 | BMV fallforestdirt01 / ambientCG Ground040 | A3 upper fringe, A8 submerged litter |
| 11 | marsh_grass | 8 | 89,70,14 | BMV fieldgrass01 / PR frozenmarshgrass01 | A6/A9 upper-bank marsh |
| 12–21 | (undergrowth…leaf_litter) | 7–8 | greens/browns | AoV/BMV/PR vegetation & forest floors | inland; used above the shore transition only |
| 22 | mossy_rock | 14 | 52,60,43 | BMV reachmossyrocks01 / Skyrim | inland wet rock; **currently mispainted on coasts — stop** |
| 23 | bc_rock | 10–12 | 66,66,22 | BMV rocksgrasswater01 / AoV Tx_BC_rock_01 | A5 lower rocky shore (grassy-rock look) |
| 24 | tidal_sand | 8 | 75,72,60 | BMV coastbeach01 / PR coastbeach01 | A1 **wet** sand band, A4 bars — dark, damp look |
| 25 | salt_flat | 9 | 90,80,63 | ambientCG Ground054 | A2 upper salt-crust flat (supratidal) |
| 26 | dry_clay | 7 | 89,74,60 | Poly Haven mud_cracked_dry_riverbed_002 | A7 dry-season exposed bed |
| 27 | dirt_path | 6 | 98,64,40 | PR dirtpath01 | roads only |
| 28 | peat_slope | 8 | 50,47,37 | BMV reachdirt01 / Skyrim frozenmarshdirtslopes01 | A8 slopes |
| 29 | track_mud | 6 | 60,54,50 | Poly Haven aerial_mud_1 | roads only |
| 30 | bc_road | 6 | 77,78,66 | BMV road / AoV mainroad | roads only |
| 31 | mountain_rock | 16 | 59,64,61 | BMV mountainslab01 / Skyrim mountainslab01 | A5 headland rock, cliffs |

**Gaps — no suitable existing texture:**

1. **Dry beach sand** (A1 backshore): tidal_sand(24) is dark/damp; nothing reads as pale dry tropical sand.
2. **Shallow rippled seabed sand** (A10, and A1 subtidal): no clean rippled underwater sand.
3. **Pebbles/gravel** (A7 bars, A5 pocket coves): no rounded-pebble or gravel texture at all.
4. **Seagrass bed** (A10): no texture; best done as seabed-sand paint + seagrass clumps via the grass/mesh layer,
   but a green-mottled seabed tile would help at distance.
5. (Minor) **Mangrove root mat**: roots should be meshes, not paint — black_mud(4) is an acceptable ground; no new texture required.

## Part C — sourcing candidates for the gaps (no downloads yet)

| Gap | Candidates (preferred first) |
|-----|------------------------------|
| Dry beach sand | CC0: Poly Haven [coast_sand_04](https://polyhaven.com/a/coast_sand_04) (damp-compacted fine sand w/ shell debris — very tropical-shore), [coast_sand_05](https://polyhaven.com/a/coast_sand_05), [sand_01](https://polyhaven.com/a/sand_01) (clean dry). Nexus: Better Coasts 4K ([SE 94789](https://www.nexusmods.com/skyrimspecialedition/mods/94789), itself built from Poly Haven CC0 — prefer going to Poly Haven direct) |
| Wet/rippled beach sand band | CC0: Poly Haven [aerial_beach_01](https://polyhaven.com/a/aerial_beach_01) (wind/water ripples), [aerial_beach_02](https://polyhaven.com/a/aerial_beach_02) (flat wet sand, moist dark patches — ideal swash zone), [aerial_sand](https://polyhaven.com/a/aerial_sand) |
| Shallow rippled seabed sand | CC0: Poly Haven [aerial_beach_01](https://polyhaven.com/a/aerial_beach_01) reads well underwater; ambientCG [Ground037](https://ambientcg.com/view?id=Ground037) / [Ground048](https://ambientcg.com/view?id=Ground048) (rippled sand; verify previews via [ambientcg.com/list?q=sand](https://ambientcg.com/list?q=sand)). Nexus: YXZ Realistic Coast and Riverbed ([SE 188235](https://www.nexusmods.com/skyrimspecialedition/mods/188235)), Coast and Marsh HD ([SE 82898](https://www.nexusmods.com/skyrimspecialedition/mods/82898)) |
| Pebbles/gravel bar | CC0: Poly Haven [ganges_river_pebbles](https://polyhaven.com/a/ganges_river_pebbles) (rounded river pebbles — best fit), [river_small_rocks](https://polyhaven.com/a/river_small_rocks), [coast_sand_rocks_02](https://polyhaven.com/a/coast_sand_rocks_02) (sand+rock mix for A5 coves); ambientCG [Rocks022](https://ambientcg.com/view?id=Rocks022), [Gravel023](https://ambientcg.com/view?id=Gravel023) |
| Seagrass bed (distant read) | No good CC0 tiling texture found; do it as seabed sand + grass-system seagrass clumps. Asset reference for clump meshes/textures: Tamrielic Grass ([SE 46217](https://www.nexusmods.com/skyrimspecialedition/mods/46217), adds kelp/underwater plants); Tropical Skyrim ([LE 33017](https://www.nexusmods.com/skyrim/mods/33017)) as a fallback tropical-asset pool |

All Poly Haven / ambientCG assets are CC0 — same pipeline as existing ids 4/5/6/9/25/26/29 (downscale to 512²,
add avgColor, record source). Palette impact: 4 new slots (ids 32–35) — `beach_sand_dry`, `beach_sand_wet`
(or reuse 24), `seabed_sand`, `pebbles`.

## Part D — assignment spec for the landcover compiler

Data fields assumed per shoreline sample: `waveExposure` [0–1, from fetch/orientation], `slope` [%],
`salinity` [0 fresh–1 sea], `riverMouthDist` [m to nearest big-river mouth], `discharge` of that river,
`depth` [m below waterline, negative above], `tidal` [bool: sea/bay vs lake]. Distances/bands in metres from waterline.
Evaluate rules top-down, first match wins; `pebbles`, `beach_sand_*`, `seabed_sand` are new ids (Part C), rest existing.

| Coast type | Rule | Paint (by depth/height band) |
|-----------|------|------------------------------|
| Rocky headland (A5) | salinity>0.5 & (slope>25% or substrate=rock) | mountain_rock(31); band −2..0 m bc_rock(23); pocket cove (exposure<0.4 within 60 m of headland): pebbles + tidal_sand(24) |
| Exposed sandy beach (A1) | salinity>0.5 & waveExposure>0.6 & slope 2–15% & riverMouthDist>400 | seabed_sand −6..−0.5 m → beach_sand_wet/tidal_sand(24) −0.5..+0.5 m → beach_sand_dry +0.5..+8 m → scrub(18)/trop_grass(16) above |
| River-mouth delta/bar (A4) | salinity>0.3 & riverMouthDist<400 & discharge high | river_mud(1) in channel; tidal_sand(24) + beach_sand_wet on bars; flanks fall through to A2/A3 |
| Sheltered mudflat (A2) | salinity>0.5 & waveExposure<0.4 & slope<1% | water_silt(0) below −1 m → river_mud(1)/puddle_mud(5) −1..+0.3 m, scum(3) mottling near drain lines → salt_flat(25) +0.3..+1 m where unvegetated |
| Mangrove fringe (A3) | as A2, band +0..+1.5 m (upper intertidal), salinity>0.3 | black_mud(4) with muck(7) variation; mud_leaves(10) at +1..+2 m; mangrove trees/roots as meshes on this paint |
| Seagrass shelf (A10) | salinity>0.5 & waveExposure 0.2–0.6 & depth 0.5–8 m & slope<3% | seabed_sand base; seagrass clumps via grass system at density ∝ shelter; bc_moss(13) mottling acceptable interim |
| Estuarine bank (A6) | salinity 0.1–0.5 (tidal river reach) | river_mud(1) bed → bank_wet(2) −0.3..+0.3 m → clay_bank(6) +0.3..+1.5 m → marsh_grass(11) above |
| Freshwater sand/gravel bar (A7) | salinity<0.1 & channel gradient>0.5% (mountain fringe) or point-bar inside meander | pebbles in channel & bars; tidal_sand(24) patches on bar tops; dry_clay(26) on dry-season margins; bank_wet(2) edge |
| Lowland river bed (default fresh) | salinity<0.1, low gradient | water_silt(0) deep → river_mud(1) shallow → bank_wet(2) edge → marsh_grass(11)/undergrowth(12) |
| Swamp/peat bed (A8) | interior wetland, stagnant (no channel flow) | water_silt(0) bed; scum(3) where depth<0.4 m; muck(7)/black_mud(4) margin 0..+0.5 m → peat(9) → swamp forest floors |
| Lake Blackrose shore (A9) | lake body; exposure from across-lake fetch | bed water_silt(0); windward (fetch>2 km): tidal_sand(24) band −1..+1 m; leeward: river_mud(1) + scum(3) → bank_wet(2) → marsh_grass(11) reed belt |

Hard constraints: **never** mossy_rock(22) below +1 m on any coast; mangrove paint (black_mud) only where
waveExposure<0.4; beach_sand_dry only above waterline; all bands should dither/noise-blend over 2–4 m, not hard edges.
