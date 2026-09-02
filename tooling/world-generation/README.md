# World generation tooling

Offline compilers that turn vault source data into world data. Nothing here
ships to the browser; runtime consumables are written into
`apps/world-studio/public/province/` (preview rasters, overlay PNGs, meta
JSONs) and cached full-resolution arrays stay in the vault next to the esp.

## Pipeline (run from this directory)

```bash
# 1. Source extraction (rarely re-run): esp -> stitched heightfield + preview rasters
python3 -m worldgen.extract_province "<vault>/mod-sources/tamriel-worldspaces-118678/extracted/Argonia Worldspace/Argonia.esp"

# 2. Phase 3: conditioning, hydrology, flood/soil/region/climate fields + overlays
#    (also climate-air.png — R humidity / G mist / B canopy air raster for the
#    Phase 8a aerial-perspective haze shader)
python3 -m worldgen.compile_hydrology "<...>/argonia-heightfield/heightfield-f32.npy"

# 3. Phase 4: roads, boat lanes, danger, cultures + overlays (reads step 2's npz)
python3 -m worldgen.compile_society "<...>/argonia-heightfield/hydrology-pass1.npz"

# 4. Ground-material library (rerun only when the palette changes): CC0
#    downloads (cached in vault) + vanilla BSA -> studio textures + manifest
python3 -m worldgen.build_ground_materials

# 4b. Phase 6b: sculpt the base terrain (orogeny + erosion in the border
#     ranges, province-wide de-terracing + micro-undulation). Rerun 2-7 after.
python3 -m worldgen.sculpt_province "<...>/argonia-heightfield/heightfield-f32.npy"

# 5. Phase 6: refine the WHOLE PROVINCE at full resolution (sculpted base,
#    detail noise, channels, Blackrose lake, land cover 0011 w/ north zone +
#    mountain belts + shoreline types, portages 0012, flood states, exports)
python3 -m worldgen.refine_province "<...>/heightfield-f32.npy" "<...>/hydrology-pass1.npz"

# 6. Phase 6: chunk the refined province for collision/LOD (Phase 7 consumes)
python3 -m worldgen.compile_chunks

# 7. Phase 7: encode chunks for the browser (RG16 PNGs + web manifest into
#    apps/world-studio/public/province/chunks/ — committed, since CI/Pages
#    never see the vault)
python3 -m worldgen.export_web_chunks

python3 -m pytest -q   # tests over the algorithmic cores

# 8. Phase 11: site survey (reads only committed repo rasters -- no vault)
python3 -m worldgen.terrain_scour                        # province candidate sites
python3 -m worldgen.site_dossier --anchor gideon --radius 500

# 9. Phase 11: blueprint map (review artefact; seconds, PNG in output/)
python3 -m worldgen.render_blueprint \
    --blueprint world/sources/blueprints/<place-id>.json
```

Rerun 2 (then 3) after changing conditioning, thresholds or authored region
overrides; rerun 3 alone after changing anchors, connections, danger or
culture rules. Outputs are deterministic (fixed noise seed).

## Modules

- `worldgen/esp.py` — minimal Skyrim SE plugin reader (LAND/VHGT decoding).
- `worldgen/esp_landtex.py` — report a plugin's landscape-texture painting
  (LTEX usage counts; used to mine the BM&V worldspace, module 90 §74.1b).
- `worldgen/extract_province.py` — heightfield stitching + browser rasters.
- `worldgen/condition.py` — mild interior compression (0005) + base_terrain loader (6b).
- `worldgen/sculpt.py` / `sculpt_province.py` — Phase 6b base-terrain
  sculpting: uplift + stream-power erosion mountains (Braun & Willett),
  talus, cliff benching, pass/anchor protection, province-wide de-terracing
  and micro-undulation (research: docs/research/mountain-terrain-synthesis.md).
- `worldgen/hydrology.py` — ocean/sea geodesics, priority-flood + G&M flat
  resolution, noised D8 routing, rivers/lakes/watersheds, wetness, salinity.
- `worldgen/regions.py` — HAND/flood, soils, ecological region classes,
  climate profiles (§33.1), authored overrides from
  `world/sources/regions/authored-overrides.json` (e.g. the jungle).
- `worldgen/routes.py` — least-cost road corridors, boat cost surface,
  cost-distance fields.
- `worldgen/society.py` — fixed danger (depth-into-marsh model, decision
  0004/0007) and lore-grounded culture territories.
- `worldgen/refine_province.py` — Phase 6 province-wide refinement
  (de-terracing, detail noise, channel carving, authored Blackrose lake per
  Lore:Blackrose, portages 0012, flood states, land-cover + tint exports).
- `worldgen/landcover.py` — semantic land cover × per-region material
  palettes -> ground-control map (decision 0011).
- `worldgen/compile_chunks.py` — chunked terrain + AA'd LOD pyramid +
  collision grids for the refined province (Phase 6 deliverable; Phase 7
  consumes; scale.py vertical scale applied at geometry time).
- `worldgen/export_web_chunks.py` — re-encodes the vault chunks as
  16-bit-quantised RG PNGs + `chunks-web-manifest.json` for the studio's
  character mode (Rapier heightfields + chunked render meshes).
- `worldgen/build_ground_materials.py` — ground-texture library builder
  (CC0 ambientCG/Poly Haven + vanilla BSA; luminance-normalised 512px PNGs
  + materials.json).
- `worldgen/site_fields.py` — Phase 11 site-survey loader: decodes every
  published province raster (hydrology, society, climate, water, refined
  height) back into arrays on one aligned 1345 grid, and adds the survey
  primitives (aspect, viewshed, line of sight, effort-to-reach, mined-form
  analogue, authored-land area). Reads **committed repo data only**, so it
  works without the asset vault. Composes `compile_scatter.ProvinceFields`.
- `worldgen/site_dossier.py` — one-command dossier for a coordinate + radius
  (JSON + digest) into `world/sources/sites/dossiers/`. Every Phase 11 siting
  proposal cites one (decision 0041 Part 0 item 1).
- `worldgen/terrain_scour.py` — the same machinery province-wide: 24 landform
  detectors over the rasters, greedy spacing harvest, five-axis scoring, into
  `world/sources/sites/candidate-sites.json` (0041 Part 0 item 2).
- `worldgen/render_blueprint.py` — the blueprint map: top-down annotated
  diagram (districts, ways, parcels by ground fit, docks, doors with facing,
  landmarks, sockets, water, contours) over a real terrain hillshade crop,
  with legend and budget title block, into `output/blueprint-maps/`
  (gitignored — renders are derived). Fixture + tests in
  `worldgen/testdata/` (0041 Part 0 item 5).
- `worldgen/compile_hydrology.py`, `worldgen/compile_society.py`,
  `worldgen/refine_province.py` — the compile entry points above.
