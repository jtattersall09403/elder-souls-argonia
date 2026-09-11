import numpy as np

from .landcover import (BC_ROAD, BLACK_MUD, MARSH_GRASS, MUCK, N_MATERIALS,
                        PATH, RIVER_MUD, SILT, SWAMP_GRASS, TRACK, TROP_GRASS,
                        compile_ground_control)

from .position_noise import normal_field
from .rebake_landcover import WINDOW_PAD_M, _bake
from .scale import RAW_M

M_PER_PX = RAW_M  # production full-res texel size (scale.py, 0015)


def _fixture(seed=1, with_roads=False, n=200):
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
    return height, region, rivers, slope, M_PER_PX, seed, roads


def _compile(seed=1, with_roads=False):
    h, reg, riv, slope, mpp, seed, roads = _fixture(seed, with_roads)
    return compile_ground_control(h, reg, riv, slope, mpp, seed=seed, roads=roads)


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


def _mountain_fixture(seed=3):
    """A concave mountain flank: a near-vertical upper face relaxing into a
    debris apron, exactly the profile the Phase 6b thermal pass produces."""
    n = 200
    y = np.arange(n, dtype=np.float32)
    # slope steepens with height: crest face far above SCREE_MAX_TAN, foot
    # inside the repose window, toe below it
    prof = 600.0 * np.exp(-(y / 70.0) ** 1.6)
    height = np.repeat(prof[:, None], n, axis=1).astype(np.float32)
    region = np.full((n, n), 1, dtype=np.uint8)      # border mountains
    rivers = np.zeros((n, n), dtype=np.uint8)
    gy, gx = np.gradient(height, M_PER_PX)
    slope = np.hypot(gx, gy).astype(np.float32)
    return compile_ground_control(height, region, rivers, slope, M_PER_PX, seed=seed)


def test_scree_paints_the_debris_apron_not_the_crag_face():
    from .landcover import MOUNTAIN_ROCK, SCREE, SCREE_MAX_TAN
    from scipy import ndimage
    mat, _ = _mountain_fixture()
    h = np.repeat((600.0 * np.exp(-(np.arange(200, dtype=np.float32) / 70.0) ** 1.6))[:, None], 200, axis=1)
    gy, gx = np.gradient(h, M_PER_PX)
    slope_lf = ndimage.gaussian_filter(np.hypot(gx, gy).astype(np.float32), 22.0 / M_PER_PX / 3.0)
    assert (mat == SCREE).mean() > 0.02                    # apron exists
    # nothing above the angle debris can rest at is scree
    assert (mat[slope_lf > SCREE_MAX_TAN * 1.3] == SCREE).mean() < 0.02
    # the steepest ground keeps bare mountain slab
    assert (mat[slope_lf > SCREE_MAX_TAN * 1.3] == MOUNTAIN_ROCK).mean() > 0.5


def test_normal_field_window_equals_the_global_field():
    whole = normal_field((600, 600), 12, "patch-broad")
    win = normal_field((300, 300), 12, "patch-broad", origin=(120, 80))
    assert np.allclose(win, whole[120:420, 80:380], atol=1e-4)


def test_normal_field_salts_give_different_fields():
    a = normal_field((128, 128), 6, "wear")
    b = normal_field((128, 128), 6, "macro")
    assert not np.allclose(a, b)


def _world(n=400):
    """A synthetic province: water strip, shore, channel, two regions."""
    height, region, rivers, slope, mpp, seed, roads = _fixture(n=n)
    fields = dict(
        regions=region,
        rivers=rivers,
        salinity=np.zeros((n, n), dtype=np.float32),
        twi=np.zeros((n, n), dtype=np.float32),
        wetlands=np.zeros((n, n), dtype=bool),
        v_frac=np.broadcast_to(
            (np.arange(n, dtype=np.float32) / n)[:, None], (n, n)).copy(),
    )
    water = np.zeros((n, n), dtype=np.float32)
    roads = np.zeros((n, n), dtype=bool)
    roads[300:303, :] = True
    minor = np.zeros((n, n), dtype=np.int8)
    return height, fields, water, roads, minor


def test_rebake_window_matches_global():
    """A padded window bakes exactly what the whole-province bake gives it.

    The window is kept clear of the fixture's water strip: the lake-area
    label and the nearest-wet-cell lookup are global by nature and no pad
    covers them (see rebake_landcover's docstring).
    """
    n = 400
    h, fields, water, roads, minor = _world(n)
    _, whole = _bake(h, fields, water, roads, minor, (0, 0))

    pad = int(np.ceil(WINDOW_PAD_M / M_PER_PX))
    y0, y1, x0, x1 = 200, 320, 160, 280
    py0, py1 = max(0, y0 - pad), min(n, y1 + pad)
    px0, px1 = max(0, x0 - pad), min(n, x1 + pad)
    sl = (slice(py0, py1), slice(px0, px1))
    _, part = _bake(h[sl], {k: v[sl] for k, v in fields.items()}, water[sl],
                    roads[sl], minor[sl], (py0, px0))
    inner = (slice(y0 - py0, y1 - py0), slice(x0 - px0, x1 - px0))
    assert np.array_equal(part[inner], whole[y0:y1, x0:x1])
