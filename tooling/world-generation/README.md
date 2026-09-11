# World generation tooling

Offline compilers that turn vault source data into world data. Nothing here
ships to the browser; runtime consumables are written into
`apps/world-studio/public/province/` (preview rasters, overlay PNGs, meta
JSONs) and cached full-resolution arrays stay in the vault next to the esp.

## The rebuild chain (start here after any worldgen change)

```bash
./scripts/terrain-chain.sh            # whole chain, skipping what is unchanged
./scripts/terrain-chain.sh --force    # rebuild every stage
./scripts/terrain-chain.sh --from compile_water
./scripts/terrain-chain.sh --list
```

The script is the one place the stage ORDER lives (decision 0025 points at
it). A full forced rebuild is about 5.5 minutes; a re-run with nothing changed
is under 10 seconds, because `worldgen/chain_stages.py` fingerprints each
stage's code (its module and every worldgen module it imports, walked from the
source) and the files it actually read and wrote, and prints
`skip (unchanged)` when all of them still match. The book is
`chain-stamps.json` in the vault heightfield directory; it is never committed.
Each stage prints its own seconds and the run closes with a table.

`ES_VAULT_ROOT` points the whole chain at another copy of the vault's
`argonia-heightfield` directory — a scratch copy for benchmarking, or a second
worktree building at the same time. Everything downstream follows it through
`compile_chunks.HEIGHTFIELD_DIR`. (A git worktree cannot see the sibling asset
vault at all without it, since the vault is resolved relative to the checkout.)

Two things to know before trusting a rebuild:

- **The chain is not idempotent.** `sculpt_province` reads `routes.json`,
  which `reroute_majors` rewrites five stages later, so two consecutive forced
  runs produce different terrain. The skip check deliberately ignores files
  whose last writer is a later stage, which reproduces the single-pass
  behaviour the chain has always had rather than chasing a fixed point.
- **`author_route_structures` stops the chain** whenever grading produces a
  road survivor with no authored `why` sentence. That is by design (the
  sentence is an authoring job, not a default), but it means the chain cannot
  complete on terrain that has moved until someone writes it.

## Pipeline (run from this directory)

```bash
# 1. Source extraction (rarely re-run): esp -> stitched heightfield + preview rasters
python3 -m worldgen.extract_province "<vault>/mod-sources/tamriel-worldspaces-118678/extracted/Argonia Worldspace/Argonia.esp"

# 2. Phase 3: conditioning, hydrology, flood/soil/region/climate fields + overlays
#    (also climate-air.png — R humidity / G mist / B canopy air raster for the
#    Phase 8a aerial-perspective haze shader)
python3 -m worldgen.compile_hydrology "<...>/argonia-heightfield/heightfield-f32.npy"

# 3. Phase 4: roads, boat lanes, danger, cultures + overlays (reads step 2's npz)
python3 -m worldgen.hydrology_graph derive     # Phase 16a: the typed water graph (world/sources/hydrology/)
python3 -m worldgen.compile_society "<...>/argonia-heightfield/hydrology-pass1.npz"

# 4. Ground-material library (rerun only when the palette changes): CC0
#    downloads (cached in vault) + vanilla BSA -> studio textures + manifest
python3 -m worldgen.build_ground_materials

# 4b. Phase 6b: sculpt the base terrain (orogeny + erosion in the border
#     ranges, province-wide de-terracing + micro-undulation). Rerun 2-7 after.
python3 -m worldgen.sculpt_province "<...>/argonia-heightfield/heightfield-f32.npy"

# 5. Phase 6: refine the WHOLE PROVINCE at full resolution (sculpted base,
#    detail noise, channels carved to the water profile (0047), Blackrose
#    lake, land cover 0011 w/ north zone + mountain belts + shoreline types,
#    portages 0012, flood states, exports)
python3 -m worldgen.refine_province "<...>/heightfield-f32.npy" "<...>/hydrology-pass1.npz"

# The full rebuild order (refine -> routes -> grading -> chunks -> water ->
# landcover -> scatter) lives in ONE place: ./scripts/terrain-chain.sh
# (decision 0025). `python3 -m worldgen.compile_water` alone needs the
# channels solution refine_province writes beside the refined heights.

# 6. Phase 6: chunk the refined province for collision/LOD (Phase 7 consumes)
python3 -m worldgen.compile_chunks

# 7. Phase 7: encode chunks for the browser (RG16 PNGs + web manifest into
#    apps/world-studio/public/province/chunks/ — shipped via the rasters
#    release, since CI/Pages never see the vault; see "Generated rasters live
#    in a release, not in git" below)
python3 -m worldgen.export_web_chunks

python3 -m pytest -q   # tests over the algorithmic cores

# 8. Phase 11: site survey (reads only committed repo rasters -- no vault)
python3 -m worldgen.terrain_scour                        # province candidate sites
python3 -m worldgen.export_places                        # studio places.json (re-run after catalogue edits)
python3 -m worldgen.site_dossier --anchor gideon --radius 500

# 8b. Phase 11 Part 3/4: the plot and its checks (order matters; each re-run after catalogue edits)
python3 -m worldgen.catalogue --check                    # schema v2 + cross-record + route-id validation
python3 -m worldgen.route_registry --check               # roads/lanes registry vs routes.json/waterways.json
python3 -m worldgen.macro_plot                           # positions for every live record (+ owner-feedback checks in the report)
python3 -m worldgen.compile_minor_routes                 # tracks/footpaths/boardwalks from the plot
python3 -m worldgen.compile_minor_waterways --registry   # Part 3c: canoe channels/rivers/ferry crossings (--registry solves registry entries)
python3 -m worldgen.audit_place_semantics                # prose-vs-ground contradictions (report only)
python3 -m worldgen.anchor_nudge                         # scores alternative city pins inside their tolerance circles (report only)
python3 -m worldgen.hostility_frequency                  # fights per km² / per km of route by danger band + gap points (report only)
python3 -m worldgen.lint_prose [--strict] [--md <files>] # mechanical AI-tell lint over catalogue prose (npm test gate: zero hard hits)
python3 -m worldgen.quests --check | --sync              # quest data (world/sources/quests) ↔ registry ↔ place tierOwnership
python3 -m worldgen.export_quest_index                   # regenerates docs/quests/index/*.md from the quest data
# one-shot, already applied: python3 -m worldgen.migrate_catalogue_v2

# 9. Phase 11: blueprint map (review artefact; seconds, PNG in output/)
python3 -m worldgen.render_blueprint \
    --blueprint world/sources/blueprints/<place-id>.json
```

Rerun 2 (then 3) after changing conditioning, thresholds or authored region
overrides; rerun 3 alone after changing anchors, connections, danger or
culture rules. Outputs are deterministic (fixed noise seed).

## Generated rasters live in a release, not in git

The big generated province rasters — `chunks/**.png`, `refined/*.png`,
`water/**.png` and everything under `vegetation/` (about 106 MB, 984 files) —
are rebuild output, not source. They are **gitignored**. What git carries is
`apps/world-studio/public/province/rasters-manifest.json`: the sha256 of every
file plus a combined sha, and the name of the release asset that holds them.
The set is defined once, in `tooling/province-artefact/set.json`.

- **After any chain run:** `npm run province:publish` (uploads the archive to
  the rolling `province-rasters` GitHub release and rewrites the manifest),
  then commit the manifest with the rest of the change.
- **On a fresh checkout:** `npm run province:fetch` once — it downloads the
  asset, verifies every file against the manifest before anything lands, and
  extracts in place. It is also the first step of both Pages jobs.
- **`npm test` refuses a tree whose rasters and manifest disagree.** If the
  files are missing or stale it tells you to run `npm run province:fetch`; if
  they differ from the manifest (a rebuild nobody published) it tells you to
  run `npm run province:publish`. `npm run province:check` is that gate alone.

## Dependencies

Python 3.12 with `numpy`, `scipy`, `Pillow`, `scikit-image` (>= 0.22;
`standing_water.py` uses `skimage.morphology.reconstruction`, `local_minima`
and `skimage.segmentation.watershed`), `pytest` (+ optional `pytest-xdist`).

## Tests

```
npm run test:placement        # from the repo root — the default, fast run
npm run test:placement:slow   # the held-out province-raster tests
```

Two tiers. The default run excludes `@pytest.mark.slow`, which is reserved for
tests that re-grade or re-solve a full 4033x4033 province raster
(`test_grade_routes.py`'s two province tests). They are real gates and must be
run before anything that touches grading — they are held out only so the other
~490 tests stay cheap enough to run on every change. Both scripts use
`pytest-xdist` (`-n=auto`) when it is installed and fall back to a serial run
when it is not, so a fresh checkout needs no extra dependency.

The suites lean on three process-lifetime caches, all keyed on the content or
the file signature of their inputs, so editing a source file invalidates them
and a stale result can never be served:

- `street_router.default_survey()` — one `ProvinceSurvey` (the rasters) per process.
- `street_router.local_field()` — the 1 m cost field the A* street router
  solves over, keyed on the way and the blueprint geometry it is built from.
  A blueprint's field is otherwise rebuilt from scratch for every way, in
  every test that validates it.
- `blueprint.validate_all()` — keyed on the blueprint dir's file signature
  (name + mtime + size).

`worldgen/conftest.py` warms the survey once per session and documents the
arrangement. None of it changes what any test asserts.

## Modules

- `worldgen/chain_stages.py` — the rebuild chain's stage runner: per-stage
  timing, and the code/input/output fingerprints behind `skip (unchanged)`.
- `worldgen/fastfilter.py` — `gaussian`, a drop-in `ndimage.gaussian_filter`
  for 2D rasters that splits the separable passes into bands across threads.
  Byte-identical (`test_fastfilter.py`); 3.5-4x at the sigmas the sculpt and
  the land-cover bake use.
- `worldgen/esp.py` — minimal Skyrim SE plugin reader (LAND/VHGT decoding).
- `worldgen/esp_landtex.py` — report a plugin's landscape-texture painting
  (LTEX usage counts; used to mine the BM&V worldspace, module 90 §74.1b).
- `worldgen/extract_province.py` — heightfield stitching + browser rasters.
- `worldgen/condition.py` — mild interior compression (0005) + base_terrain loader (6b).
- `worldgen/sculpt.py` / `sculpt_province.py` — Phase 6b base-terrain
  sculpting: uplift + stream-power erosion mountains (Braun & Willett),
  talus, cliff benching, pass/anchor protection, province-wide de-terracing
  and micro-undulation (research: docs/research/world-terrain/mountain-terrain-synthesis.md).
- `worldgen/hydrology.py` — ocean/sea geodesics, priority-flood + G&M flat
  resolution, noised D8 routing, rivers/lakes/watersheds, wetness, salinity.
- `worldgen/channels.py` — the ONE river-channel definition (decision 0047):
  coarse flow graph → smooth centrelines per reach (junctions pinned),
  stations every 1.83 m with width, depth, valley floor, bank barrier and
  the monotone long profile L(s) capped BANKFULL (never more than a small
  levee over the ground beside it); falls (cliffs ≥ 3 m at ≥ 50°) as steps
  landing at the next station's level, steep strips, lake-outlet weirs, lost
  stretches, fords at road crossings, captured lakes, channels whose widths
  touch sharing the lower level. `refine_province` carves the trench to it
  (`carve`: parabolic bed, chute notch, shoulder levee with per-kind caps,
  plunge bowls, brink notch, weirs) and saves the solution as
  `province-refined/channels-pass1.npz` beside `refined-height-precarve-f32.npy`;
  `compile_water` fills the same cells at the same interpolated level.
- `worldgen/standing_water.py` — sea + standing bodies by flooding the real
  full-res terrain (8-connected priority flood via
  `skimage.morphology.reconstruction`), the rounds-8-10 acceptance rules per
  flood component (every body a major road crosses capped at road + 0.3 m),
  one level of nested sub-basins (watershed catchments to their saddles),
  river-trapped hollows accepted as lakes (replayed at the carve's level by
  the compile), per-body season response, islet lowering.
- `worldgen/compile_water.py` — the water compile (schema v2): keeps the
  carve's profile (never re-solves it), floods the bodies on the shipped
  ground, W + signed depth on the 2017 grid registered to texel centres,
  bounded lateral flood (200 m, 8-connected), plunge pools, table band,
  burial, classes/flow/season, strips + cascades in `water-meta.json`,
  invariants census in `stats` (hovering edges, cliff-edge cells, dry
  stations, road/track cells in water split sea/lake/river). ~70 s. Gate:
  `worldgen/test_water_invariants.py`.
- `worldgen/regions.py` — HAND/flood, soils, ecological region classes,
  climate profiles (§33.1), authored overrides from
  `world/sources/regions/authored-overrides.json` (e.g. the jungle).
- `worldgen/routes.py` — least-cost road corridors, boat cost surface,
  cost-distance fields.
- `worldgen/routes_raster.py` — routes.json + routes-minor.json as rasters:
  the ONE source of both the road/track/footpath ground paint (consumed by
  `refine_province` and `rebake_landcover`) and the vegetation clearance
  corridors (consumed by `compile_scatter`). Widths in metres via `scale.py`.
  **Re-run `rebake_landcover` and then `compile_scatter` whenever either
  route file changes** — the minor network is derived from the plot, so a
  re-plot moves the paint.
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
