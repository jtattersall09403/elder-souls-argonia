import numpy as np

from .landcover import (BC_ROAD, BLACK_MUD, MARSH_GRASS, MUCK, N_MATERIALS,
                        PATH, RIVER_MUD, SILT, SWAMP_GRASS, TRACK, TROP_GRASS,
                        compile_ground_control)

from .scale import RAW_M

M_PER_PX = RAW_M  # production full-res texel size (scale.py, 0015)


def _fixture(seed=1, with_roads=False):
    n = 200
    height = np.full((n, n), 3.0, dtype=np.float32)
    height[:12, :] = -1.0  # standing water strip along the top
    height[12:26, :] = np.linspace(0.1, 1.5, 14)[:, None]  # gradual shore
    region = np.full((n, n), 7, dtype=np.uint8)   # interior swamp (left)
    region[:, n // 2:] = 9                         # seasonal floodplain (right)
    rivers = np.zeros((n, n), dtype=np.uint8)
    rivers[:, 120:122] = 2                         # band-2 channel
    gy, gx = np.gradient(height, M_PER_PX)
    slope = np.hypot(gx, gy).astype(np.float32)
    roads = None
    if with_roads:
        roads = np.zeros((n, n), dtype=bool)
        roads[148:151, :] = True                   # an east-west road
    rng = np.random.default_rng(seed)
    return height, region, rivers, slope, M_PER_PX, rng, roads


def _compile(seed=1, with_roads=False):
    h, reg, riv, slope, mpp, rng, roads = _fixture(seed, with_roads)
    return compile_ground_control(h, reg, riv, slope, mpp, rng, roads=roads)


def test_control_shape_ids_and_determinism():
    mat1, c1 = _compile()
    mat2, c2 = _compile()
    assert c1.shape == (200, 200, 4) and c1.dtype == np.uint8
    assert mat1.max() < N_MATERIALS and mat1.min() >= 0
    assert np.array_equal(c1, c2) and np.array_equal(mat1, mat2)


def test_channel_water_edge_gradient():
    mat, _ = _compile()
    assert (mat[60:180, 120:122] == SILT).mean() > 0.8       # bed
    assert (mat[60:180, 126] == RIVER_MUD).mean() > 0.5      # wet waterline


def test_regional_palettes_differ_and_wetlands_not_grassy():
    mat, _ = _compile()
    swamp = mat[100:180, 10:60]     # far from border, water and channel
    plain = mat[100:180, 150:190]
    assert (swamp == MUCK).mean() > 0.15                 # swamp base is muck
    assert (plain == SWAMP_GRASS).mean() > 0.15          # floodplain grassy
    assert (swamp == TROP_GRASS).mean() < 0.02
    assert (swamp == SWAMP_GRASS).mean() < 0.05


def test_standing_water_edge_never_grass():
    # the fixture's water strip is a small fresh pool -> black-mud waterline
    # (per-water-type shoreline grammar), never grass near water
    mat, _ = _compile()
    edge = mat[12:14, 20:80]                              # first ~10 m ashore
    assert (edge == BLACK_MUD).mean() > 0.5               # pool mud waterline
    near = mat[12:18, 20:80]                              # first ~30 m ashore
    grassy = np.isin(near, [TROP_GRASS, SWAMP_GRASS, MARSH_GRASS])
    assert grassy.mean() < 0.02


def test_roads_painted_on_ground_not_water():
    mat, _ = _compile(with_roads=True)
    road = np.isin(mat[149, 10:60], [BC_ROAD, PATH, TRACK])
    assert road.mean() > 0.7                              # road on dry ground
    assert (mat[149, 120:122] == SILT).all()              # channel wins at crossing
