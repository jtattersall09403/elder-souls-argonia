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

# Material ids — index order of build_ground_materials.MATERIALS.
(SILT, RIVER_MUD, BANK_WET, SCUM, BLACK_MUD, PUDDLE, CLAY, MUCK, BC_MUD,
 PEAT, MUD_LEAVES, MARSH_GRASS, UNDERGROWTH, BC_MOSS, MOSS, SWAMP_GRASS,
 TROP_GRASS, GRASS_DIRT, SCRUB, JUNGLE, FOREST_FLOOR, LITTER, MOSSY_ROCK,
 BC_ROCK, SAND, SALT, DRY_CLAY, PATH, PEAT_SLOPE, TRACK) = range(30)
N_MATERIALS = 30

# Per-region palettes (regions.py class ids). Slots: base ground, damp patch
# (mid wetness), wet patch (hollows), channel/shore bank, local-high ground,
# organic litter patch. Wetland regions are mud/muck/moss-first — grass only
# survives on raised ground (owner feedback 2026-08-23: "too grassy").
# Adjacent regions share materials deliberately (Morrowind pattern).
REGION_PALETTES = {
    0:  dict(base=SAND, damp=SILT, wet=SILT, bank=SILT, high=SAND, litter=SAND),            # ocean floor
    1:  dict(base=GRASS_DIRT, damp=PEAT, wet=PEAT, bank=CLAY, high=MOSSY_ROCK, litter=MUD_LEAVES),  # border mountains
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
# Channel bed half-widths (m) by river band, matching refine_watershed.CHANNELS.
BAND_HALF_W = {1: 10.0, 2: 22.0, 3: 45.0}


def _noise(shape, sigma, rng):
    n = ndimage.gaussian_filter(rng.standard_normal(shape), sigma)
    return n / max(n.std(), 1e-9)


def _region_map(region, slot):
    out = np.zeros(region.shape, dtype=np.int16)
    for rid, p in REGION_PALETTES.items():
        out[region == rid] = p[slot]
    return out


def _warp_regions(region, m_per_px, rng):
    """Domain-warp the region raster so borders (including authored straight
    polygon edges) read as organic interdigitated ecotones."""
    shape = region.shape
    amp_px = 160.0 / m_per_px       # ~160 m broad waves
    amp2_px = 45.0 / m_per_px       # ~45 m fine fingers
    dy = _noise(shape, 24, rng) * amp_px + _noise(shape, 5, rng) * amp2_px
    dx = _noise(shape, 24, rng) * amp_px + _noise(shape, 5, rng) * amp2_px
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    return ndimage.map_coordinates(region, [yy + dy, xx + dx], order=0, mode="nearest")


def compile_ground_control(height, region, rivers, slope, m_per_px, rng,
                           salinity=None, twi=None, wetlands=None, roads=None):
    """Return (landcover material raster int16, control RGBA uint8).

    height: metres relative to sea level (water surface y=0); region: region
    class raster; rivers: river band raster (0/1/2/3); slope: rise/run;
    salinity/twi/wetlands: optional macro fields, roads: optional bool mask —
    all at the same resolution as height.
    """
    shape = height.shape
    region = _warp_regions(region, m_per_px, rng)
    mat = _region_map(region, "base")

    patch = _noise(shape, 35.0 / m_per_px, rng)   # ~35 m patches (owner: finer)
    fine = _noise(shape, 14.0 / m_per_px, rng)    # ~14 m speckle

    # Wetness patches: TWI + wetlands push ground to each region's damp/wet
    # materials; dry pans on the seasonal floodplain.
    wet_score = 0.8 * patch
    if twi is not None:
        t = np.nan_to_num(twi.astype(np.float32))
        wet_score = wet_score + (t - t.mean()) / max(t.std(), 1e-9)
    if wetlands is not None:
        wet_score = wet_score + 0.8 * wetlands.astype(np.float32)
    mat = np.where(wet_score > 0.6, _region_map(region, "damp"), mat)
    mat = np.where(wet_score > 1.5, _region_map(region, "wet"), mat)
    mat = np.where(fine > 1.1, _region_map(region, "litter"), mat)
    mat = np.where((region == 9) & (wet_score < -0.9), DRY_CLAY, mat)

    # Raised ground: local prominence (~30 m window) reads drier everywhere.
    prom = height - ndimage.gaussian_filter(height, 28.0 / m_per_px)
    marshy = np.isin(region, list(MARSHY))
    mat = np.where(prom > 0.35, _region_map(region, "high"), mat)

    # Slope: wet peat banks on marsh slopes; humid rock on steep ground.
    mat = np.where(marshy & (slope > 0.08), PEAT_SLOPE, mat)
    mat = np.where(slope > 0.16, np.where(marshy | (region == 13), BC_ROCK, MOSSY_ROCK), mat)

    # Salt flats where brackish, flat and low (noise-broken).
    if salinity is not None:
        salty = salinity > 0.45
        mat = np.where(salty & (height < 1.5) & (slope < 0.03) & (patch > 0.55), SALT, mat)
    else:
        salty = np.isin(region, [0, 3, 4])

    # Roads: Phase 4 corridors painted where they touch ground; water rules
    # come later so crossings stay unpainted (fords/ferries/bridges are
    # placed features, not textures).
    if roads is not None:
        mat = np.where(roads, PATH, mat)

    # Channel gradient (the Bethesda 3-stage water edge, scaled per band):
    # bed silt -> wet river mud waterline -> region bank material.
    for band, half_w in BAND_HALF_W.items():
        m = rivers == band
        if not m.any():
            continue
        d = ndimage.distance_transform_edt(~m) * m_per_px
        mat = np.where(d < half_w + 26.0, _region_map(region, "bank"), mat)
        mat = np.where(d < half_w + 10.0, RIVER_MUD, mat)
        mat = np.where(d < half_w, SILT, mat)

    # Standing-water gradient around every water contact (sea, lakes, carved
    # channels below y=0) — contour-following distance bands, highest
    # priority so nothing dry ever touches the waterline (owner feedback):
    # submerged silt -> scum/puddle/sand shallows -> wet bank -> mud -> muck.
    water = height < 0.05
    shore_d = ndimage.distance_transform_edt(~water) * m_per_px
    low = height < 2.5
    band2 = (~water) & (shore_d < 58.0) & low          # damp fringe
    band1 = (~water) & (shore_d < 32.0) & low          # wet mud
    band0 = (~water) & (shore_d < 13.0) & (height < 3.0)  # waterline bank
    mat = np.where(band2, _region_map(region, "damp"), mat)
    mat = np.where(band1, np.where(salty, SALT, _region_map(region, "bank")), mat)
    mat = np.where(band0, np.where(salty, SAND, BANK_WET), mat)
    shallow = (height >= -0.7) & water
    mat = np.where(shallow, np.where(salty, SAND, np.where(marshy, SCUM, PUDDLE)), mat)
    mat = np.where(height < -0.7, SILT, mat)

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
