"""Semantic land cover -> ground-material control map (decision 0011).

Two-level ground texturing on the Bethesda pattern (research:
docs/research/skyrim-morrowind-landscape-texture-granularity.md):

- **micro**: each texel gets a semantic land-cover treatment derived from the
  hydrology fields (height vs water, channel bands, wetness, salinity/tidal,
  slope, local prominence) — waterline mud, riverbank, reed bed, hummock,
  peat slope, litter patch, dry pan…
- **macro**: each ecological region class carries a palette mapping those
  slots to concrete materials from the global library built by
  build_ground_materials.py — "grass" resolves differently per region, so
  the north of the province doesn't share the south's carpet.

Output is a BotW/Terrain3D-style control map (id0, id1, blend, macro-mottle)
consumed by the studio's texture-array shader (Fly3D). The land-cover raster
is the future source of truth for footsteps, groundcover and encounters too.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage

# Material ids — index order of build_ground_materials.MATERIALS (append-only).
(SILT, BLACK_MUD, PUDDLE, CLAY, PEAT, MUD_LEAVES, MARSH_GRASS, HUMMOCK,
 FIELD, MOSS, ROCK, JUNGLE, LITTER, SAND, SALT, TRACK, PEAT_SLOPE,
 DRY_CLAY) = range(18)
N_MATERIALS = 18

# Per-region palettes (regions.py class ids). Slots: base ground, damp patch
# (mid wetness), wet patch (hollows), channel bank, local-high ground,
# organic litter patch. Adjacent regions share materials deliberately
# (Morrowind pattern) so borders blend.
REGION_PALETTES = {
    0:  dict(base=SAND, damp=SILT, wet=SILT, bank=SILT, high=SAND, litter=SAND),          # ocean floor
    1:  dict(base=FIELD, damp=PEAT, wet=PEAT, bank=CLAY, high=ROCK, litter=MUD_LEAVES),   # border mountains
    2:  dict(base=FIELD, damp=MUD_LEAVES, wet=PEAT, bank=CLAY, high=HUMMOCK, litter=LITTER),  # upland hills
    3:  dict(base=PUDDLE, damp=BLACK_MUD, wet=BLACK_MUD, bank=BLACK_MUD, high=MARSH_GRASS, litter=SALT),  # tidal delta
    4:  dict(base=MARSH_GRASS, damp=PUDDLE, wet=BLACK_MUD, bank=BLACK_MUD, high=HUMMOCK, litter=SALT),    # lagoon & salt marsh
    5:  dict(base=FIELD, damp=MUD_LEAVES, wet=BLACK_MUD, bank=CLAY, high=HUMMOCK, litter=LITTER),  # deep river corridor
    6:  dict(base=MOSS, damp=PEAT, wet=BLACK_MUD, bank=PEAT, high=MOSS, litter=MUD_LEAVES),   # rootland deep marsh
    7:  dict(base=MARSH_GRASS, damp=PEAT, wet=BLACK_MUD, bank=PEAT, high=HUMMOCK, litter=PEAT),  # interior swamp
    8:  dict(base=MARSH_GRASS, damp=PEAT, wet=BLACK_MUD, bank=CLAY, high=FIELD, litter=MUD_LEAVES),   # fringe marsh
    9:  dict(base=FIELD, damp=MUD_LEAVES, wet=PUDDLE, bank=CLAY, high=FIELD, litter=LITTER),    # seasonal floodplain
    10: dict(base=HUMMOCK, damp=MUD_LEAVES, wet=PEAT, bank=CLAY, high=HUMMOCK, litter=LITTER),  # raised hammock
    11: dict(base=FIELD, damp=MARSH_GRASS, wet=PEAT, bank=CLAY, high=HUMMOCK, litter=LITTER),  # firm lowland
    12: dict(base=SILT, damp=SILT, wet=SILT, bank=BLACK_MUD, high=BLACK_MUD, litter=SILT),    # lake bed
    13: dict(base=JUNGLE, damp=BLACK_MUD, wet=BLACK_MUD, bank=BLACK_MUD, high=LITTER, litter=LITTER),  # tropical jungle
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


def compile_ground_control(height, region, rivers, slope, m_per_px, rng,
                           salinity=None, twi=None, wetlands=None):
    """Return (landcover material raster int16, control RGBA uint8).

    height: metres relative to sea level (water surface y=0); region: region
    class raster; rivers: river band raster (0/1/2/3); slope: rise/run;
    salinity/twi/wetlands: optional macro fields at the same resolution.
    """
    shape = height.shape
    mat = _region_map(region, "base")

    patch = _noise(shape, 6, rng)     # ~65 m patches
    fine = _noise(shape, 2.5, rng)    # ~27 m speckle

    # Wetness patches: TWI (or its noise stand-in) + wetlands mask push ground
    # to each region's damp/wet materials; dry pans on the seasonal floodplain.
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

    # Raised ground: local prominence over ~5 px reads drier everywhere
    # (hummocks in marsh, grassy/rocky knolls on firm ground).
    prom = height - ndimage.gaussian_filter(height, 5)
    marshy = np.isin(region, list(MARSHY))
    mat = np.where(prom > 0.35, _region_map(region, "high"), mat)

    # Slope: humid rock on steep ground; wet peat banks on marsh slopes.
    mat = np.where(marshy & (slope > 0.08), PEAT_SLOPE, mat)
    mat = np.where(slope > 0.16, ROCK, mat)

    # Salt flats where brackish, flat and low (noise-broken).
    if salinity is not None:
        salty = salinity > 0.45
        mat = np.where(salty & (height < 1.5) & (slope < 0.03) & (patch > 0.55), SALT, mat)
    else:
        salty = np.isin(region, [0, 3, 4])

    # Channel gradient (the Bethesda 3-stage water edge, scaled per band):
    # bed -> waterline black mud -> bank (region's bank material).
    bed = np.zeros(shape, dtype=bool)
    waterline = np.zeros(shape, dtype=bool)
    bank = np.zeros(shape, dtype=bool)
    for band, half_w in BAND_HALF_W.items():
        m = rivers == band
        if not m.any():
            continue
        d = ndimage.distance_transform_edt(~m) * m_per_px
        bed |= d < half_w
        waterline |= d < half_w + 12.0
        bank |= d < half_w + 34.0
    mat = np.where(bank, _region_map(region, "bank"), mat)
    mat = np.where(waterline, BLACK_MUD, mat)
    mat = np.where(bed, SILT, mat)

    # Standing-water gradient (sea, lakes, carved beds below y=0): submerged
    # silt; algae/puddle shallows (tidal sand where brackish); a waterline
    # mud band on the first metre of shore.
    submerged = height < -0.25
    shallow = (height >= -0.25) & (height < 0.05)
    water = height < 0.05
    shore_d = ndimage.distance_transform_edt(~water) * m_per_px
    shoreband = (~water) & (shore_d < 26.0) & (height < 1.2)
    mat = np.where(shoreband, np.where(salty, SAND, BLACK_MUD), mat)
    mat = np.where(shallow, np.where(salty, SAND, PUDDLE), mat)
    mat = np.where(submerged, SILT, mat)

    # Control map: blur each material's mask a little and keep the top two per
    # texel -> (id0, id1, blend). Hardware-filterable never; the shader does
    # texelFetch + manual bilinear (see Fly3D).
    stack = np.zeros((*shape, N_MATERIALS), dtype=np.float32)
    for i in range(N_MATERIALS):
        m = mat == i
        if m.any():
            stack[..., i] = ndimage.gaussian_filter(m.astype(np.float32), 1.2)
    id0 = stack.argmax(-1).astype(np.uint8)
    w0 = np.take_along_axis(stack, id0[..., None].astype(np.int64), -1)[..., 0]
    np.put_along_axis(stack, id0[..., None].astype(np.int64), -1.0, -1)
    id1 = stack.argmax(-1).astype(np.uint8)
    w1 = np.maximum(np.take_along_axis(stack, id1[..., None].astype(np.int64), -1)[..., 0], 0.0)
    blend = w1 / np.maximum(w0 + w1, 1e-6)
    macro = _noise(shape, 40, rng).clip(-2, 2) / 4 + 0.5
    control = np.stack([
        id0, id1,
        (blend * 255).astype(np.uint8),
        (macro * 255).astype(np.uint8),
    ], -1).astype(np.uint8)
    return mat.astype(np.int16), control
