"""A major road's vegetation and ground cover follow its state of repair.

The registry authors a `condition` per route (and optional `conditionSections`
windows along its chainage); `routes_raster.condition_raster` rasterises it,
the ground bake paints by it and the scatter thins the groundcover by it
(owner 2026-09-16). What these tests hold is the ORDER: the worse the repair,
the more of the surrounding ground and cover has taken the road back.
"""

import json

import numpy as np
import pytest
from PIL import Image

from .landcover import BC_ROAD, PATH, TRACK, compile_ground_control
from .routes_raster import (PROVINCE, REGISTRY_PATH, _condition_lines,
                            major_ways)
from .scale import RAW_M
from .scatter import (ROUTE_CONDITION_SHIFT, ROUTE_THIN,
                      ROUTE_THIN_KEEP_BY_CONDITION, Layer, route_allows)

ROAD_MATERIALS = (BC_ROAD, PATH, TRACK)
N = 200
BAND_ROWS = {1: 30, 2: 70, 3: 110, 4: 150}   # condition -> centreline row


def _bake(seed=1):
    """A flat, dry 200x200 control bake with one straight road per condition."""
    height = np.full((N, N), 3.0, dtype=np.float32)      # dry everywhere
    region = np.full((N, N), 7, dtype=np.uint8)
    slope = np.zeros((N, N), dtype=np.float32)
    roads = np.zeros((N, N), dtype=np.int8)
    for cond, row in BAND_ROWS.items():
        roads[row - 3:row + 4, :] = cond                 # ~13 m stripe
    mat, _control, _prov = compile_ground_control(
        height, region, slope, RAW_M, water=None, seed=seed, roads=roads)
    return mat


def _non_road_share(mat, rows):
    sel = mat[rows]
    return float((~np.isin(sel, ROAD_MATERIALS)).mean())


def test_worse_repair_means_less_road_surface():
    # Averaged over several seeds: the wear field runs in ~120 m stretches, so
    # any single band on a 200-texel fixture can sit wholly inside one wet or
    # dry stretch and say nothing about the rule.
    seeds = range(1, 7)
    bakes = [_bake(s) for s in seeds]
    shares = {c: float(np.mean([_non_road_share(m, r) for m in bakes]))
              for c, r in BAND_ROWS.items()}
    ordered = [shares[c] for c in (1, 2, 3, 4)]
    assert ordered == sorted(ordered), shares
    assert shares[1] < 0.05, shares
    assert shares[4] > 0.8, shares


def test_bool_roads_still_read_as_worn():
    """The apron and the older fixtures hand the bake a bool mask."""
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


def test_shipped_road_lines_follow_their_authored_condition():
    """The same order on the SHIPPED control map and the real registry.

    FAILING FIRST (2026-09-16): today's published control map was baked before
    condition existed, so its road texels carry no condition paint at all
    (measured non-road share: worn 0.094, decayed 0.048, broken 0.046 — the
    order is meaningless noise). It turns green when the chain re-bakes the
    ground with `rebake_landcover`; until then it is the evidence that the
    shipped map has not been re-baked.
    """
    control_png = PROVINCE / "refined" / "ground-control.png"
    routes_json = PROVINCE / "routes.json"
    if not (control_png.exists() and routes_json.exists()
            and REGISTRY_PATH.exists()):
        pytest.skip("shipped province rasters not present")
    mat = np.asarray(Image.open(control_png).convert("RGBA"))[..., 0]
    step = int(round(mat.shape[0] / 1345))
    lines = _condition_lines(mat.shape, step, (0, 0), None, None)
    shares = {}
    for cond, line in lines.items():
        if line.any():
            shares[cond] = float((~np.isin(mat[line], ROAD_MATERIALS)).mean())
    seen = [shares[c] for c in sorted(shares)]
    assert seen == sorted(seen), shares
