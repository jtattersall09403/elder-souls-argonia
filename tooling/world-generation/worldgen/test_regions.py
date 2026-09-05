import numpy as np

from .hydrology import compute
from .regions import compute_regions, height_above_drainage
from .test_hydrology import _valley_world


def _hydro():
    z = _valley_world()
    return z, compute(z, metres_per_px=500.0)


def test_hand_zero_on_water_and_rises_away():
    z, hydro = _hydro()
    hand = height_above_drainage(z, hydro)
    # reference water for flooding is medium+ rivers, lakes and the sea
    water = hydro.ocean | hydro.lakes | (hydro.rivers >= 2)
    assert np.allclose(hand[water], 0.0)
    assert float(hand[~water].max()) > 1.0
    assert (hand >= 0).all()


def test_flood_soil_region_coverage():
    z, hydro = _hydro()
    reg = compute_regions(z, hydro, metres_per_px=500.0)
    land = ~hydro.ocean
    # every land cell has a soil and a region class; ocean is class 0
    assert (reg.soil[land] > 0).all() and (reg.soil[~land] == 0).all()
    assert (reg.regions[land] > 0).all() and (reg.regions[~land] == 0).all()
    # flood risk is monotone against HAND: frequent cells sit lower than none
    frequent = reg.flood == 3
    none = (reg.flood == 0) & land
    if frequent.any() and none.any():
        assert reg.hand[frequent].mean() < reg.hand[none].mean()


def _terrain_with(height, slope_deg=0.0, size=48):
    """A synthetic tile at a chosen height and slope, draining to a sea edge."""
    metres_per_px = 20.0
    rise = np.tan(np.radians(slope_deg)) * metres_per_px
    z = np.full((size, size), float(height), dtype=np.float32)
    z += np.arange(size, dtype=np.float32)[None, :] * rise
    z[:, :3] = -5.0                      # a sea edge so there is drainage
    return z, metres_per_px


def _classify(height, slope_deg):
    z, metres = _terrain_with(height, slope_deg)
    hydro = compute(z, metres_per_px=metres)
    # Authored polygons (the central jungle) are UV-space over the whole
    # raster and would swallow a synthetic tile; this tests the rules.
    regions = compute_regions(z, hydro, metres, apply_overrides=False).regions
    land = ~hydro.ocean
    interior = np.zeros_like(land)
    interior[8:-8, 8:-8] = True          # away from the sea edge and the borders
    sample = regions[land & interior]
    return int(np.bincount(sample).argmax()) if sample.size else 0


def test_low_flat_ground_reads_as_marsh_not_firm_lowland():
    """The 2026-08-30 rebalance (decision 0036 Q4): a marsh is low, flat and
    slow-draining, not only where the solve modelled standing water."""
    assert _classify(height=4.0, slope_deg=0.5) in (6, 7, 8, 9)


def test_drained_rolling_lowland_is_not_marsh():
    """The rebalance must not paint every low place green — ground that sheds
    water stays firm lowland."""
    assert _classify(height=20.0, slope_deg=12.0) not in (6, 7, 8)


def test_real_hills_and_mountains_survive_the_rebalance():
    """A 300 m hillside must never be reclassified as swamp: the province's
    terrain is genuinely high in places and the classifier must say so."""
    assert _classify(height=120.0, slope_deg=18.0) == 2
    assert _classify(height=350.0, slope_deg=28.0) in (1, 2)


def test_mangrove_forest_takes_the_sheltered_saline_fringe():
    """Phase 10 round 4: the mangal (class 14) is the flat, strongly saline,
    sheltered tidal fringe — and it extends into the adjoining shallows
    (research/world-terrain/mangrove-coastal-ecology.md §1)."""
    z, metres = _terrain_with(height=0.5, slope_deg=0.0)
    z[:, 3] = -1.0                       # a shallow nearshore strip (< 2 m deep)
    hydro = compute(z, metres_per_px=metres)
    reg = compute_regions(z, hydro, metres, apply_overrides=False)
    mang = reg.regions == 14
    assert mang.any()
    land_mang = mang & ~hydro.ocean
    assert land_mang.any()
    # every land mangrove pixel is tidal and strongly saline
    assert hydro.tidal[land_mang].all()
    assert (hydro.salinity[land_mang] >= 0.30).all()
    # and the class walks out over shallow water (the intertidal fringe)
    assert (mang & hydro.ocean).any()


def test_a_flat_terrace_high_above_the_marsh_is_not_a_hill():
    """Hills need drainage as well as height — height alone made a quarter of
    the province alpine."""
    assert _classify(height=90.0, slope_deg=0.5) != 2
