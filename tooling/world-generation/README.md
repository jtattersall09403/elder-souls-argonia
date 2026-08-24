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
python3 -m worldgen.compile_hydrology "<...>/argonia-heightfield/heightfield-f32.npy"

# 3. Phase 4: roads, boat lanes, danger, cultures + overlays (reads step 2's npz)
python3 -m worldgen.compile_society "<...>/argonia-heightfield/hydrology-pass1.npz"

# 4. Ground-material library (rerun only when the palette changes): CC0
#    downloads (cached in vault) + vanilla BSA -> studio textures + manifest
python3 -m worldgen.build_ground_materials

# 5. Phase 6: refine the WHOLE PROVINCE at ~5.5 m/sample (de-terracing,
#    detail noise, channels, Blackrose lake, land cover 0011 w/ north zone +
#    mountain belts + shoreline types, portages 0012, flood states, exports)
python3 -m worldgen.refine_province "<...>/heightfield-f32.npy" "<...>/hydrology-pass1.npz"

# 6. Phase 6: chunk the refined province for collision/LOD (Phase 7 consumes)
python3 -m worldgen.compile_chunks

python3 -m pytest -q   # tests over the algorithmic cores
```

Rerun 2 (then 3) after changing conditioning, thresholds or authored region
overrides; rerun 3 alone after changing anchors, connections, danger or
culture rules. Outputs are deterministic (fixed noise seed).

## Modules

- `worldgen/esp.py` — minimal Skyrim SE plugin reader (LAND/VHGT decoding).
- `worldgen/esp_landtex.py` — report a plugin's landscape-texture painting
  (LTEX usage counts; used to mine the BM&V worldspace, module 90 §74.1b).
- `worldgen/extract_province.py` — heightfield stitching + browser rasters.
- `worldgen/condition.py` — owner-chosen strong interior compression (0005).
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
  consumes; ×5 applied at geometry time).
- `worldgen/build_ground_materials.py` — ground-texture library builder
  (CC0 ambientCG/Poly Haven + vanilla BSA; luminance-normalised 512px PNGs
  + materials.json).
- `worldgen/compile_hydrology.py`, `worldgen/compile_society.py`,
  `worldgen/refine_province.py` — the compile entry points above.
