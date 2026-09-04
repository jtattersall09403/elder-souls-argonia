"""Semantic land cover -> ground-material control map (decision 0011).

Two-level ground texturing on the Bethesda pattern (research:
docs/research/skyrim-morrowind-landscape-texture-granularity.md):

- **micro**: each texel gets a semantic land-cover treatment derived from the
  hydrology fields — a contour-following water-edge gradient around every
  water contact (submerged silt -> scum/puddle shallows -> wet bank ->
  mud -> muck fringe), channel bank gradients per river band, damp/wet/litter
  patches, hummocks, peat slopes, salt flats, dry pans, and roads where the
  Phase 4 corridors touch ground.
- **macro**: each ecological region class carries a palette mapping those
  slots to concrete materials from the global library built by
  build_ground_materials.py (Bitter Coast swamp set, Project Rainforest
  tropical set, CC0 PBR, retained vanilla). Region borders are domain-warped
  so ecotones interdigitate instead of following authored straight edges.

Output is a BotW/Terrain3D-style control map (id0, id1, blend, macro-mottle)
consumed by the studio's texture-array shader (Fly3D). The land-cover raster
is the future source of truth for footsteps, groundcover and encounters too.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage

from .scale import TUNE, TUNE_A, TUNE_S
from .sculpt import TALUS_FULL_TAN, TALUS_TAN

# Material ids — index order of build_ground_materials.MATERIALS.
(SILT, RIVER_MUD, BANK_WET, SCUM, BLACK_MUD, PUDDLE, CLAY, MUCK, BC_MUD,
 PEAT, MUD_LEAVES, MARSH_GRASS, UNDERGROWTH, BC_MOSS, MOSS, SWAMP_GRASS,
 TROP_GRASS, GRASS_DIRT, SCRUB, JUNGLE, FOREST_FLOOR, LITTER, MOSSY_ROCK,
 BC_ROCK, SAND, SALT, DRY_CLAY, PATH, PEAT_SLOPE, TRACK, BC_ROAD,
 MOUNTAIN_ROCK, BEACH_SAND, SEABED_SAND, PEBBLES, OCEAN_FLOOR,
 DIRT_CLIFF, SCREE) = range(38)
N_MATERIALS = 38

# Per-region palettes (regions.py class ids). Slots: base ground, damp patch
# (mid wetness), wet patch (hollows), channel/shore bank, local-high ground,
# organic litter patch. Wetland regions are mud/muck/moss-first — grass only
# survives on raised ground (owner feedback 2026-08-23: "too grassy").
# Adjacent regions share materials deliberately (Morrowind pattern).
REGION_PALETTES = {
    0:  dict(base=SAND, damp=SILT, wet=SILT, bank=SILT, high=SAND, litter=SAND),            # ocean floor
    1:  dict(base=GRASS_DIRT, damp=PEAT, wet=PEAT, bank=CLAY, high=MOUNTAIN_ROCK, litter=MUD_LEAVES),  # border mountains
    2:  dict(base=TROP_GRASS, damp=GRASS_DIRT, wet=PEAT, bank=CLAY, high=SCRUB, litter=LITTER),     # upland hills
    3:  dict(base=PUDDLE, damp=BC_MUD, wet=SCUM, bank=BANK_WET, high=MARSH_GRASS, litter=SALT),     # tidal delta
    4:  dict(base=MARSH_GRASS, damp=PUDDLE, wet=SCUM, bank=BANK_WET, high=SCRUB, litter=SALT),      # lagoon & salt marsh
    5:  dict(base=SWAMP_GRASS, damp=MUD_LEAVES, wet=BC_MUD, bank=CLAY, high=SCRUB, litter=LITTER),  # deep river corridor
    6:  dict(base=BC_MOSS, damp=MUCK, wet=BLACK_MUD, bank=BC_MUD, high=MOSS, litter=UNDERGROWTH),   # rootland deep marsh
    7:  dict(base=MUCK, damp=BC_MUD, wet=BLACK_MUD, bank=BANK_WET, high=MARSH_GRASS, litter=UNDERGROWTH),  # interior swamp
    8:  dict(base=MARSH_GRASS, damp=MUCK, wet=BC_MUD, bank=BANK_WET, high=SWAMP_GRASS, litter=UNDERGROWTH),  # fringe marsh
    9:  dict(base=SWAMP_GRASS, damp=MUD_LEAVES, wet=PUDDLE, bank=CLAY, high=TROP_GRASS, litter=LITTER),      # seasonal floodplain
    10: dict(base=SCRUB, damp=GRASS_DIRT, wet=MUD_LEAVES, bank=CLAY, high=SCRUB, litter=LITTER),    # raised hammock
    11: dict(base=TROP_GRASS, damp=MARSH_GRASS, wet=MUCK, bank=CLAY, high=SCRUB, litter=GRASS_DIRT),  # firm lowland
    12: dict(base=SILT, damp=SILT, wet=SILT, bank=BANK_WET, high=SCRUB, litter=SILT),               # lake bed
    13: dict(base=JUNGLE, damp=BLACK_MUD, wet=BLACK_MUD, bank=BC_MUD, high=FOREST_FLOOR, litter=LITTER),  # tropical jungle
}
MARSHY = {3, 4, 6, 7, 8, 12}          # regions where wet-ground micro rules dominate
# Channel bed half-widths (m) by river band, matching the refine CHANNELS.
BAND_HALF_W = {1: 10.0 * TUNE, 2: 22.0 * TUNE, 3: 45.0 * TUNE}

# Northern palette zone (owner 2026-08-23: the northern half — including the
# second big river basin around Helstrom's approaches — must feel distinct
# from the south while staying coherent). Climatology (docs/research/
# black-marsh-climatology.md): the north grades drier and duller toward
# Deshaan — so northern swamps read as peat/moss blackwater bog, firm ground
# as olive grass-dirt, versus the south's green muck-and-scum marsh. Shared
# vocabulary (same material library) keeps the world coherent.
NORTH_PALETTES = {
    2:  dict(base=GRASS_DIRT, damp=MUD_LEAVES, wet=PEAT, bank=CLAY, high=SCRUB, litter=LITTER),
    5:  dict(base=GRASS_DIRT, damp=MUD_LEAVES, wet=BC_MUD, bank=CLAY, high=SCRUB, litter=LITTER),
    6:  dict(base=MOSS, damp=PEAT, wet=BLACK_MUD, bank=PEAT, high=BC_MOSS, litter=UNDERGROWTH),
    7:  dict(base=PEAT, damp=MUCK, wet=BLACK_MUD, bank=BC_MUD, high=MOSS, litter=BC_MOSS),
    8:  dict(base=SWAMP_GRASS, damp=PEAT, wet=BC_MUD, bank=CLAY, high=GRASS_DIRT, litter=MOSS),
    9:  dict(base=GRASS_DIRT, damp=SWAMP_GRASS, wet=PUDDLE, bank=CLAY, high=GRASS_DIRT, litter=LITTER),
    11: dict(base=GRASS_DIRT, damp=SWAMP_GRASS, wet=PEAT, bank=CLAY, high=SCRUB, litter=MUD_LEAVES),
}
NORTH_V = 0.45              # province v-fraction where the northern zone ends
# Metre/area literals in this module were tuned at x3 and convert via
# scale.TUNE/TUNE_A so the approved control map survives rescales (0015).
LAKE_MIN_KM2 = 0.15 * TUNE_A  # fresh water bigger than this shores like a lake
# Mountain elevation belts (region 1; climatology: foothill forest ->
# low cloud-forest belt -> crag; montane cooling allowed, never frost).
# Phase 6b: belts rescaled to the sculpted ranges (summits ~650 m; foothill
# tropical forest -> cloud-forest belt -> crag, climatology exception 33.1).
MONT_FOREST_M, MONT_CLOUD_M, MONT_CRAG_M = 100.0, 280.0, 440.0
# Scree/talus aprons (Phase 10 B4). NOT a new slope threshold: the Phase 6b
# sculpt already decided where debris lies — its thermal passes relax mountain
# faces to the repose angle (sculpt.TALUS_TAN) and, at full res after
# benching, to sculpt.TALUS_FULL_TAN. Ground resting inside that angular
# window is therefore debris-mantled; anything steeper is a structural bench
# riser or crag face and stays bare slab. These are TRUE rise/run (the sculpt
# runs in metres), so they take no TUNE_S.
SCREE_MIN_TAN = 0.8 * TALUS_TAN     # below this the slope holds soil/vegetation
SCREE_MAX_TAN = TALUS_FULL_TAN      # above this loose debris cannot rest


def _noise(shape, sigma, rng):
    n = ndimage.gaussian_filter(rng.standard_normal(shape, dtype=np.float32), sigma)
    return (n / max(n.std(), 1e-9)).astype(np.float32)


def _region_map(region, slot):
    out = np.zeros(region.shape, dtype=np.int16)
    for rid, p in REGION_PALETTES.items():
        out[region == rid] = p[slot]
    return out


def _warp_regions(region, m_per_px, rng):
    """Domain-warp the region raster so borders (including authored straight
    polygon edges) read as organic interdigitated ecotones."""
    shape = region.shape
    amp_px = 160.0 * TUNE / m_per_px       # ~160 m broad waves
    amp2_px = 45.0 * TUNE / m_per_px       # ~45 m fine fingers
    dy = _noise(shape, 24, rng) * amp_px + _noise(shape, 5, rng) * amp2_px
    dx = _noise(shape, 24, rng) * amp_px + _noise(shape, 5, rng) * amp2_px
    yy = np.arange(shape[0], dtype=np.float32)[:, None] + dy
    xx = np.arange(shape[1], dtype=np.float32)[None, :] + dx
    del dy, dx
    return ndimage.map_coordinates(region, [yy, xx], order=0, mode="nearest")


def compile_ground_control(height, region, rivers, slope, m_per_px, rng,
                           salinity=None, twi=None, wetlands=None, roads=None,
                           minor_routes=None, v_frac=None, water_level=None):
    """Return (landcover material raster int16, control RGBA uint8).

    height: metres relative to sea level (water surface y=0); region: region
    class raster; rivers: river band raster (0/1/2/3); slope: rise/run;
    salinity/twi/wetlands: optional macro fields, roads: optional bool mask;
    minor_routes: optional int8 raster of minor-route surface classes
    (routes_raster.MINOR_TRACK / MINOR_PATH) — the Part 3b tracks and
    footpaths, painted narrower and duller than the trunk roads;
    v_frac: optional 0(north)..1(south) province-latitude raster enabling the
    northern palette zone — all at the same resolution as height.
    water_level: optional LOCAL water-surface height raster (Phase 8b
    compile_water W): when given, every water-relative rule (beds, waterline
    bands, shallows) uses height-above-local-water, so mountain tarns, high
    rivers and marsh pools get silt/mud beds and shore grammar instead of
    reading as dry mossy land (owner 8b round 2). Absolute-elevation rules
    (mountain belts, salt flats) still use `height`.
    """
    shape = height.shape
    rel = height if water_level is None else (height - water_level).astype(np.float32)
    region = _warp_regions(region, m_per_px, rng)

    # Palette zone: northern regions bind land-cover slots to different
    # materials (NORTH_PALETTES); the boundary is noise-blended so the two
    # halves interdigitate over ~1.5 km instead of switching on a line.
    if v_frac is not None:
        north = (v_frac + 0.06 * _noise(shape, 260.0 * TUNE / m_per_px, rng)) < NORTH_V
    else:
        north = np.zeros(shape, dtype=bool)

    def rmap(slot):
        out = _region_map(region, slot)
        if north.any():
            out_n = out.copy()
            for rid, p in NORTH_PALETTES.items():
                if slot in p:
                    out_n[region == rid] = p[slot]
            out = np.where(north, out_n, out)
        return out

    mat = rmap("base")

    # Landform-scale slope for material rules (micro-relief bumps must not
    # paint slope bands — they striped the basin, owner report 2026-08-23).
    slope_lf = ndimage.gaussian_filter(slope, 22.0 * TUNE / m_per_px)

    # Multi-scale patchiness (owner 2026-08-23: uniform ~35 m blobs read as
    # camouflage). Fine-grained variation only where the ground is "doing
    # something" — near water, channels and on slopes; calm interior ground
    # gets broad coherent patches instead.
    water = rel < 0.05
    shore_d = (ndimage.distance_transform_edt(~water) * m_per_px).astype(np.float32)
    chan_d = np.full(shape, 1e9, dtype=np.float32)
    for band in BAND_HALF_W:
        m = rivers == band
        if m.any():
            chan_d = np.minimum(chan_d, (ndimage.distance_transform_edt(~m) * m_per_px).astype(np.float32))
    activity = np.clip(
        np.clip(1.0 - shore_d / (130.0 * TUNE), 0, 1)
        + np.clip(1.0 - chan_d / (110.0 * TUNE), 0, 1)
        + np.clip(slope_lf / (0.05 * TUNE_S), 0, 1), 0, 1).astype(np.float32)
    broad = _noise(shape, 200.0 * TUNE / m_per_px, rng)  # ~200 m stable patches
    patch = _noise(shape, 35.0 * TUNE / m_per_px, rng)   # ~35 m active patches
    fine = _noise(shape, 14.0 * TUNE / m_per_px, rng)    # ~14 m speckle
    patch_mix = broad + patch * (0.25 + 0.75 * activity)

    # Wetness patches: TWI + wetlands push ground to each region's damp/wet
    # materials; dry pans on the seasonal floodplain.
    wet_score = 0.8 * patch_mix
    if twi is not None:
        t = np.nan_to_num(twi.astype(np.float32))
        wet_score = wet_score + (t - t.mean()) / max(t.std(), 1e-9)
    if wetlands is not None:
        wet_score = wet_score + 0.8 * wetlands.astype(np.float32)
    mat = np.where(wet_score > 0.6, rmap("damp"), mat)
    mat = np.where(wet_score > 1.5, rmap("wet"), mat)
    mat = np.where(fine > 1.05 + 0.55 * (1.0 - activity), rmap("litter"), mat)
    mat = np.where((region == 9) & (wet_score < -0.9), DRY_CLAY, mat)

    # Mountain elevation belts (region 1; climatology §33.1): foothill forest
    # -> cloud-forest moss belt -> crag, with noise-wobbled belt edges. The
    # cloud belt sits low (small coastal-adjacent ranges) per the research.
    mont = region == 1
    if mont.any():
        belt_wob = 28.0 * _noise(shape, 320.0 * TUNE / m_per_px, rng)  # 6b: wobble scaled to the taller belts
        mat = np.where(mont & (height > MONT_FOREST_M + belt_wob), FOREST_FLOOR, mat)
        mat = np.where(mont & (height > MONT_CLOUD_M + belt_wob), BC_MOSS, mat)
        mat = np.where(mont & (height > MONT_CRAG_M + belt_wob), MOUNTAIN_ROCK, mat)

    # Raised ground: local prominence (~30 m window) reads drier everywhere.
    prom = height - ndimage.gaussian_filter(height, 28.0 * TUNE / m_per_px)
    marshy = np.isin(region, list(MARSHY))
    mat = np.where(prom > 0.35, rmap("high"), mat)

    # Slope: wet peat banks on marsh slopes; steep ground gets its region's
    # rock — tropical slab in the mountains/uplands, root-bound dirt cliffs
    # in the lowlands (owner round 5: the cold mossy-rock cobbles were being
    # slapped on every steep surface, INCLUDING underwater channel walls;
    # steep ground below the waterline keeps its bed material instead).
    above_water = rel > -0.2
    mat = np.where(marshy & (slope_lf > 0.07 * TUNE_S) & above_water, PEAT_SLOPE, mat)
    steep_rock = np.where(np.isin(region, (1, 2)), MOUNTAIN_ROCK,
                          np.where(marshy | (region == 13), BC_ROCK, DIRT_CLIFF))
    mat = np.where((slope_lf > 0.14 * TUNE_S) & above_water, steep_rock, mat)

    # Scree/talus aprons over that rock (Phase 10 B4): mountain and upland
    # ground that sits inside the sculpt's debris-repose window (above) AND on
    # the accumulation side of the slope — prom < 0 is the gully floors, slope
    # feet and hollows debris runs INTO, so spurs and ridge crests keep their
    # bare slab and the mountainsides stop reading as one texture. Broken by
    # the broad noise field so aprons are patchy, not a slope-band stripe.
    repose = (slope_lf >= SCREE_MIN_TAN) & (slope_lf <= SCREE_MAX_TAN)
    scree = (np.isin(region, (1, 2)) & above_water & repose
             & (prom < 0.0) & (broad > -0.9))
    mat = np.where(scree, SCREE, mat)

    # Salt flats where brackish, flat and low (noise-broken).
    if salinity is not None:
        salty = salinity > 0.45
        mat = np.where(salty & (height < 1.5) & (slope_lf < 0.03 * TUNE_S) & (patch > 0.55), SALT, mat)
    else:
        salty = np.isin(region, [0, 3, 4])

    # Channel gradient (the Bethesda 3-stage water edge, scaled per band):
    # bed silt -> wet river mud waterline -> bank. Streams (band 1) bank in
    # mossy pebbles; bigger rivers use the regional bank material — part of
    # the per-water-type shoreline grammar (owner 2026-08-23).
    channel_bed = np.zeros(shape, dtype=bool)
    for band, half_w in BAND_HALF_W.items():
        m = rivers == band
        if not m.any():
            continue
        d = (ndimage.distance_transform_edt(~m) * m_per_px).astype(np.float32)
        bank_mat = np.full(shape, BANK_WET, dtype=np.int16) if band == 1 else rmap("bank")
        mat = np.where(d < half_w + 26.0 * TUNE, bank_mat, mat)
        mat = np.where(d < half_w + 10.0 * TUNE, RIVER_MUD, mat)
        mat = np.where(d < half_w, SILT, mat)
        channel_bed |= d < half_w

    # Standing-water gradient around every water contact — contour-following
    # distance bands, highest priority so nothing dry ever touches a
    # waterline. Each WATER TYPE gets its own progression (owner 2026-08-23):
    #   sea coast (salty):  sand beach -> salt/sand -> damp fringe;
    #                       rocky cove where the shore is steep;
    #   lake (big fresh):   wet pebble bank -> regional bank mud -> damp;
    #   swamp pool (small): black mud -> muck -> damp (no pebble bank);
    # shallows likewise: sea sand / lake puddle-mud / marsh-pool scum.
    _, (iy, ix) = ndimage.distance_transform_edt(~water, return_indices=True)
    near_salty = salty[iy, ix] if isinstance(salty, np.ndarray) else np.full(shape, bool(salty))
    lblw, _n = ndimage.label(water)
    areas = np.bincount(lblw.ravel())
    big = np.zeros_like(areas, dtype=bool)
    big[areas * (m_per_px ** 2) / 1e6 >= LAKE_MIN_KM2] = True
    near_big = big[lblw[iy, ix]]
    rocky = ndimage.gaussian_filter(slope_lf, 20.0 * TUNE / m_per_px) > 0.045 * TUNE_S
    low = rel < 2.5
    band2 = (~water) & (shore_d < 58.0 * TUNE) & low          # damp fringe
    band1 = (~water) & (shore_d < 32.0 * TUNE) & low          # wet mud / salt / rock
    band0 = (~water) & (shore_d < 13.0 * TUNE) & (rel < 3.0)  # waterline
    mat = np.where(band2, rmap("damp"), mat)
    # Coast typing (research: tropical-shoreline-materials Part D):
    # sheltered muddy wetland coast = mangrove country (mud, never sand);
    # exposed sediment coast = dry BEACH sand above the wet swash line;
    # very flat saline ground keeps its salt pans; steep salty = rocky cove.
    # mangrove mud coasts: lagoons and saline WETLAND fringes — but NOT the
    # delta mouth bars, which are sand (owner round 5 + research Part D)
    mangrove = np.isin(region, (4,)) | (wetlands if isinstance(wetlands, np.ndarray) else False)
    flat_pan = slope_lf < 0.012 * TUNE_S
    b1_salty = np.where(mangrove, BC_MUD, np.where(flat_pan, SALT, BEACH_SAND))
    b1 = np.where(near_salty, b1_salty, np.where(near_big, rmap("bank"), MUCK))
    mat = np.where(band1, b1, mat)
    b0 = np.where(near_salty, np.where(mangrove, BLACK_MUD, SAND),
                  np.where(near_big, BANK_WET, BLACK_MUD))
    mat = np.where(band0, b0, mat)
    # rocky coves only where mountain spurs actually meet the sea — never on
    # low sandy delta bars (owner round 5: cobbles on sand islands)
    cove = rocky & np.isin(region, (1, 2, 10, 11)) & (height > 1.5)
    mat = np.where((band0 | band1) & near_salty & cove, BC_ROCK, mat)
    # freshwater gravel bars on brisk upland reaches (research §1.2) — only
    # in genuinely mountainous/upland regions where gravel supply exists
    upland_gravel = (~near_salty) & (slope_lf > 0.02 * TUNE_S) & np.isin(region, (1, 2))
    shallow = (rel >= -0.7) & water
    sh = np.where(near_salty, np.where(mangrove, SILT, SEABED_SAND),
                  np.where(upland_gravel, PEBBLES,
                           np.where(near_big & ~marshy, PUDDLE, SCUM)))
    mat = np.where(shallow, sh, mat)
    mat = np.where(band0 & upland_gravel & ~near_salty, PEBBLES, mat)
    # deep beds by water type (owner rounds 4-5): the pebbly riverbed
    # texture belongs to RIVERS only — swamp and lake beds are soft mud,
    # the sea floor rippled sand, mountain water gravel
    deep = rel < -0.7
    river_bed = ndimage.distance_transform_edt(rivers == 0) * m_per_px < 40.0
    mat = np.where(deep, RIVER_MUD, mat)                              # lakes/ponds default
    mat = np.where(deep & np.isin(region, (6, 7, 8, 13, 4)), BLACK_MUD, mat)  # swamp beds
    mat = np.where(deep & river_bed, SILT, mat)                       # true riverbed
    mat = np.where(deep & near_salty, OCEAN_FLOOR, mat)
    mat = np.where(deep & np.isin(region, (1, 2)), PEBBLES, mat)

    # Roads LAST so the wet fringes can't swallow them (they previously ran
    # before the shore bands and vanished — owner report): Phase 4 corridors
    # are all major-city trunk roads (§88); built road surface degrading to
    # dirt path / churned mud by wear noise + ground wetness. Painted only on
    # dry ground — crossings over water/channel beds stay unpainted
    # (bridges/ferries/boardwalks are placed features, Phase 11+).
    if roads is not None:
        wear = _noise(shape, 120.0 * TUNE / m_per_px, rng)   # ~120 m wear stretches
        road_mat = np.full(shape, BC_ROAD, dtype=np.int16)
        road_mat[wear > 0.55] = PATH
        road_mat[(wet_score > 1.2) & (wear > 0.3)] = TRACK
        mat = np.where(roads & ~water & ~channel_bed, road_mat, mat)

    # Minor routes (Part 3b): a track is a cart-width worn dirt surface, a
    # footpath a single-texel trodden strip; boardwalks paint nothing (they
    # are placed assets over water — vegetation clearance only). Painted
    # after the trunk roads so a track joining a road cannot overwrite it,
    # and on dry ground only, same rule as above.
    if minor_routes is not None:
        dry = ~water & ~channel_bed
        mat = np.where((minor_routes == 1) & dry, TRACK, mat)
        mat = np.where((minor_routes == 2) & dry, PATH, mat)
        if roads is not None:
            mat = np.where(roads & dry, road_mat, mat)

    # Control map: blur each material's mask a little and keep the top two per
    # texel -> (id0, id1, blend), tracked incrementally so a full-res compile
    # never holds a (H, W, 30) stack. Hardware-filterable never; the shader
    # does texelFetch + manual bilinear (see Fly3D).
    w0 = np.zeros(shape, dtype=np.float32)
    w1 = np.zeros(shape, dtype=np.float32)
    id0 = np.zeros(shape, dtype=np.uint8)
    id1 = np.zeros(shape, dtype=np.uint8)
    for i in range(N_MATERIALS):
        m = mat == i
        if not m.any():
            continue
        b = ndimage.gaussian_filter(m.astype(np.float32), 1.5)
        m0 = b > w0
        m1 = (~m0) & (b > w1)
        id1[m0] = id0[m0]
        w1[m0] = w0[m0]
        id0[m0] = i
        w0[m0] = b[m0]
        id1[m1] = i
        w1[m1] = b[m1]
    blend = w1 / np.maximum(w0 + w1, 1e-6)
    macro = _noise(shape, 40, rng).clip(-2, 2) / 4 + 0.5
    control = np.stack([
        id0, id1,
        (blend * 255).astype(np.uint8),
        (macro * 255).astype(np.uint8),
    ], -1).astype(np.uint8)
    return mat.astype(np.int16), control
