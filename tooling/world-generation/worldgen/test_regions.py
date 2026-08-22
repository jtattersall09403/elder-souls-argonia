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
    water = hydro.ocean | hydro.lakes | (hydro.rivers > 0)
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
