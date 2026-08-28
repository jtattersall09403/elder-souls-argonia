"""Unit tests for the fluvial continuum stage (Phase 8b round 3)."""

import numpy as np

from .fluvial import channel_geometry, fluvial_continuum


def _world(n=300):
    """Gentle south-sloping plain with a straight river and a wetland."""
    z = np.zeros((n, n), dtype=np.float32)
    for y in range(n):
        z[y, :] = 8.0 - 7.0 * (y / (n - 1))
    rivers = np.zeros((n, n), dtype=np.uint8)
    rivers[:, n // 2] = 3
    accum = np.zeros((n, n), dtype=np.float32)
    accum[:, n // 2] = np.linspace(0.3, 4.0, n)[:, None].ravel()[:n]
    salinity = np.zeros((n, n), dtype=np.float32)
    salinity[-12:, :] = 0.5
    wet = np.zeros((n, n), dtype=np.float32)
    wet[20:70, 20:60] = 1.0
    # some dips in the wetland to deepen
    z[30:34, 30:34] -= 0.4
    return z, rivers, accum, salinity, wet


def test_channel_geometry_monotone_and_in_range():
    w1, d1 = channel_geometry(0.11)
    w2, d2 = channel_geometry(1.0)
    w3, d3 = channel_geometry(6.0)
    assert w1 < w2 < w3 and d1 < d2 < d3
    assert 3 <= w1 <= 8 and 20 <= w3 <= 40   # game-scale tiers (research §0)
    assert 0.4 <= d1 <= 1.1 and 1.6 <= d3 <= 3.2


def test_carve_deepens_channel_and_spares_far_field():
    z, rivers, accum, salinity, wet = _world()
    rng = np.random.default_rng(7)
    before = z.copy()
    out, stats = fluvial_continuum(z.copy(), rivers, accum, salinity, wet, rng)
    n = z.shape[0]
    mid = n // 2
    # channel centreline is carved well below the original surface
    assert (before[:, mid] - out[:, mid]).mean() > 0.5
    # far field (≥ 270 m from the river, away from wetland/delta) barely moves
    far = np.abs(out[5:45, n - 55 :] - before[5:45, n - 55 :])
    assert far.max() < 0.7   # levee/floodplain adjustments only
    # wetland dip got deeper
    assert out[31, 31] < before[31, 31] - 0.15


def test_stage_is_deterministic():
    z, rivers, accum, salinity, wet = _world()
    a, _ = fluvial_continuum(z.copy(), rivers, accum, salinity, wet, np.random.default_rng(9))
    b, _ = fluvial_continuum(z.copy(), rivers, accum, salinity, wet, np.random.default_rng(9))
    assert np.array_equal(a, b)
