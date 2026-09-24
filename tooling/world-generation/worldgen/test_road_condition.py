"""A major road's ground cover follows its state of repair.

The registry authors a `condition` per route (and optional `conditionSections`
windows along its chainage); `routes_raster.condition_raster` rasterises it
and the scatter thins the groundcover by it (owner 2026-09-16). The ground
bake does NOT paint by it: the owner cut the condition paint on 2026-09-23
(16f ledger), so the bake reads the raster only as a road mask.
"""

import numpy as np

from .landcover import compile_ground_control
from .scale import RAW_M
from .scatter import (ROUTE_CONDITION_SHIFT, ROUTE_THIN,
                      ROUTE_THIN_KEEP_BY_CONDITION, Layer, route_allows)

N = 200


def test_bool_roads_still_read_as_worn():
    """The apron and the older fixtures hand the bake a bool mask; it paints
    exactly what the condition raster paints (condition is not paint)."""
    height = np.full((N, N), 3.0, dtype=np.float32)
    region = np.full((N, N), 7, dtype=np.uint8)
    slope = np.zeros((N, N), dtype=np.float32)
    bool_roads = np.zeros((N, N), dtype=bool)
    bool_roads[67:74, :] = True
    mat_bool, _, _ = compile_ground_control(height, region, slope, RAW_M,
                                            water=None, seed=1, roads=bool_roads)
    int_roads = np.where(bool_roads, np.int8(2), np.int8(0))
    mat_int, _, _ = compile_ground_control(height, region, slope, RAW_M,
                                           water=None, seed=1, roads=int_roads)
    assert np.array_equal(mat_bool, mat_int)


def test_groundcover_keep_share_rises_with_decay():
    layer = Layer(species="t3", tier="T3")
    rolls = np.linspace(0.0, 1.0, 1001)
    shares = []
    for cond in (1, 2, 3, 4):
        corridor = ROUTE_THIN | (cond << ROUTE_CONDITION_SHIFT)
        shares.append(float(np.mean([route_allows(layer, corridor, float(r))
                                     for r in rolls])))
    assert shares == sorted(shares), shares
    assert shares[-1] > shares[0]
    assert ROUTE_THIN_KEEP_BY_CONDITION[4] == 1.0
