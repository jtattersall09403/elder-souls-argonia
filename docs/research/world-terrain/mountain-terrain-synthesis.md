# Mountain relief, erosion and character-scale naturalness (Phase 6b research)

Research for plan §86 Phase 6b (decision 0015). Two questions: (1) how do we
make dramatic-but-plausible mountains by editing an existing heightmap; (2)
how do we de-terrace and add micro-relief province-wide without erasing
authored/simulated water features or making everything mushy.

## Geology: is high drama plausible next to tropical swamp?

Yes — real analogues are common and instructive:

- **Mount Kinabalu, Borneo** (4,095 m within ~50 km of coastal swamp): granite
  pluton rising from tropical lowland; cloud forest banding with altitude.
- **New Guinea's central ranges** (3–4 km peaks above sago swamp plains):
  young orogeny + extreme tropical rainfall → the steepest large-scale
  dissection on Earth; deep V-valleys, knife ridges, waterfall gorges.
- **Venezuelan tepuis / SE-Asian karst towers**: sheer vertical walls rising
  from rainforest — the geological licence for cliff bands and near-vertical
  faces (structural benching: resistant strata form cliffs, weak strata form
  vegetated ledges).
- Key mechanism for us: **orographic rainfall on tropical mountains produces
  extreme fluvial erosion** — dendritic valley networks, gorges, knickpoint
  waterfalls feeding lowland rivers. Valley floors ARE river valleys by
  construction, which is exactly the hydrology-first rule (§33).
- Black Marsh fit: border ranges W/NW toward Morrowind/Cyrodiil are canon;
  climatology module already allows montane/cloud-forest cooling with
  altitude, never frost at the marsh floor (§33.1, owner 2026-08-23).

## Technique: mountain synthesis on an existing heightmap

The proven pipeline (graphics literature + terrain tools like World Machine):

1. **Uplift + stream-power erosion** — [Cordonnier et al. 2016, *Large Scale
   Terrain Generation from Tectonic Uplift and Fluvial Erosion*, CGF](https://www.cs.purdue.edu/cgvlab/www/resources/papers/Cordonnier-Computer_Graphics_Forum-2016-Large_Scale_Terrain_Generation_from_Tectonic_Uplift_and_Fluvial_.pdf):
   iterate `z += dt·(U − K·A^m·S^n)` (U = uplift field, A = drainage area,
   S = slope; m≈0.5, n≈1). Erosion is drainage-driven, so dendritic valleys,
   ridges and watersheds emerge with plausible drainage for free. The fast
   solver is [Braun & Willett's O(n) implicit scheme](https://doi.org/10.1016/j.geomorph.2012.10.008):
   process cells in downstream-to-upstream order along the D8 flow tree and
   solve each cell implicitly against its receiver — unconditionally stable,
   large dt, no CFL trouble. Our `hydrology.py` already has priority-flood +
   D8 routing to build that tree. See also
   [Tzathas et al. 2024 (analytical erosion)](https://hal.science/hal-04525371)
   — an option if simulation is too slow, but at our grid sizes the implicit
   solver is expected to run in seconds-to-minutes in numpy.
2. **Thermal erosion for talus/scree**: move material downslope where slope
   exceeds the repose angle; cap transfer at half the height difference per
   step or the scheme oscillates and *creates* terraces
   ([Jákó & Tóth 2011](https://old.cescg.org/CESCG-2011/papers/TUBudapest-Jako-Balazs.pdf),
   [Olsen 2004 via A. Paris' write-up](https://aparis69.github.io/public_html/posts/terrain_erosion.html)).
   Gives realistic straight talus aprons under crags; also softens erosion's
   rawest V-notches into walkable lower valley walls.
3. **Structural benching** for cliff bands: quantise height through a
   *rotated/warped strata function* only where (slope high ∧ in mountain
   mask), with noise on band edges — resistant-stratum cliffs separated by
   walkable ledges (the tepui/karst look; doubles as POI shelves and BotW
   climb targets). Apply after erosion so benches read as exhumed strata.
4. **Uplift mask authoring**: amplitude field over the existing border-belt
   ridges (distance/elevation-weighted from the source prior's own ridge
   lines, so canon macro-shape survives), zero outside mask + smooth margin.

## Technique: de-terracing + micro-undulation (province-wide naturalness)

- The source LAND heights are quantised (VHGT 8-bit deltas): visible
  step-terracing on gentle gradients at ×1/×1 on foot.
- **Feature-preserving smoothing, not Gaussian/median.** The reference method
  is FPDEMS ([Lindsay et al. 2019, *LiDAR DEM Smoothing and the Preservation
  of Drainage Features*, Remote Sensing](https://www.mdpi.com/2072-4292/11/16/1926)):
  smooth via surface *normals* with a threshold angle (~10–20°) and kernel
  ~11–21 cells — flattens quantisation steps into planes while keeping real
  breaks-in-slope (channel banks, scarps, gullies). Median filters can
  *introduce* terracing on DEMs; plain Gaussian blurs the features we must
  keep. Practical numpy approximation: threshold-guided iterative smoothing
  that only moves a cell toward its neighbourhood plane when the local
  normal deviation is below the threshold angle (quantisation steps qualify;
  real cliffs/banks don't), weighted by region class.
- **Region-weighted application** (owner directive 2026-08-24): marsh and
  floodplain → smooth strongly (they are depositional, naturally smooth);
  rolling firm lowland/upland → moderate smoothing + gentle 20–80 m
  undulation octaves (real countryside undulates); mountains → little/no
  smoothing, crag + talus + benches instead. Micro-undulation extends the
  existing per-region `NOISE_AMP` machinery in `refine_province.py`.
- **Feature protection is by pipeline order**: naturalness runs on the base
  terrain BEFORE hydrology re-solves and BEFORE `refine_province` carves
  channels / the authored Blackrose lake + feeders / portage + canoe
  channels. Carving comes after → cannot be erased. Probes assert carved
  depth along solved river courses and portages afterwards, and river-course
  stability vs the approved waterways.

## Architecture decision for the pipeline

Run sculpting ONCE at full resolution as a new authoritative base-terrain
stage (`worldgen.sculpt_province`: condition → orogeny → naturalness →
`heightfield-sculpted-f32.npy` in the vault). `compile_hydrology` and
`refine_province` then consume the sculpted field instead of re-conditioning
raw heights. One base terrain, no cross-resolution divergence between what
hydrology solves on and what the player walks on. If full-res (4033²)
erosion proves too slow, fall back to eroding at hydrology resolution and
upsampling the *delta* with ridge-aligned detail noise — decide on measured
runtime, not guesswork.

## Rendering note (6b.3)

Near-vertical faces stretch planar-projected ground textures. Standard fix:
**triplanar projection** blended in by slope in the splat shader; pairs with
slope-band material assignment (cliff strata on faces, scree on talus
aprons, montane floor on benches). Belt thresholds in `landcover.py`
(18/45/70 m) rescale to the post-orogeny height range.
