import numpy as np

from .landcover import (BLACK_MUD, FIELD, MARSH_GRASS, N_MATERIALS, SILT,
                        compile_ground_control)


def _fixture(seed=1):
    n = 96
    height = np.full((n, n), 3.0, dtype=np.float32)
    height[:8, :] = -1.0  # standing water strip along the top
    height[8:16, :] = np.linspace(0.1, 1.5, 8)[:, None]  # gradual shore
    region = np.full((n, n), 7, dtype=np.uint8)   # interior swamp
    region[:, n // 2:] = 9                         # seasonal floodplain
    rivers = np.zeros((n, n), dtype=np.uint8)
    rivers[:, 40:42] = 2                           # band-2 channel
    gy, gx = np.gradient(height, 11.0)
    slope = np.hypot(gx, gy).astype(np.float32)
    rng = np.random.default_rng(seed)
    return height, region, rivers, slope, 11.0, rng


def test_control_shape_ids_and_determinism():
    mat1, c1 = compile_ground_control(*_fixture())
    mat2, c2 = compile_ground_control(*_fixture())
    assert c1.shape == (96, 96, 4) and c1.dtype == np.uint8
    assert mat1.max() < N_MATERIALS and mat1.min() >= 0
    assert np.array_equal(c1, c2) and np.array_equal(mat1, mat2)


def test_channel_water_edge_gradient():
    mat, _ = compile_ground_control(*_fixture())
    assert (mat[:, 40:42] == SILT).mean() > 0.9          # bed
    assert (mat[20:80, 43:45] == BLACK_MUD).mean() > 0.5  # waterline band


def test_regional_palettes_differ():
    mat, _ = compile_ground_control(*_fixture())
    swamp = mat[40:80, 5:25]        # away from water and channel
    plain = mat[40:80, 70:90]
    assert (swamp == MARSH_GRASS).mean() > 0.3
    assert (plain == FIELD).mean() > 0.3
    assert (swamp == FIELD).mean() < 0.05


def test_standing_water_gradient():
    mat, _ = compile_ground_control(*_fixture())
    assert (mat[:4, 5:35] == SILT).mean() > 0.9           # submerged
    shore = mat[8:11, 5:35]                                # first dry rows
    assert (shore == BLACK_MUD).mean() > 0.4               # fresh waterline mud
