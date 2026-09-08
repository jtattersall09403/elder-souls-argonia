"""The threaded blur and the threaded BFS must not move a single byte.

Both are pure speed-ups of code the whole terrain chain runs on: if either
ever disagrees with the routine it replaced, the province quietly changes
shape. These tests are the guard.
"""

from __future__ import annotations

import numpy as np
import pytest
from scipy import ndimage

from .fastfilter import gaussian
from .hydrology import _bfs_distance


@pytest.mark.parametrize("dtype", [np.float32, np.float64])
@pytest.mark.parametrize("sigma", [1.5, 5.0, 14.0, 40.0, 120.0])
def test_gaussian_matches_scipy_exactly(dtype, sigma):
    # Not square, so a row split and a column split cannot accidentally agree.
    a = np.random.default_rng(7).standard_normal((1400, 1451)).astype(dtype)
    assert np.array_equal(ndimage.gaussian_filter(a, sigma), gaussian(a, sigma))


def test_gaussian_falls_back_on_small_and_odd_input():
    a = np.random.default_rng(1).standard_normal((40, 40))
    assert np.array_equal(ndimage.gaussian_filter(a, 3.0), gaussian(a, 3.0))
    cube = np.random.default_rng(1).standard_normal((8, 8, 8))
    assert np.array_equal(ndimage.gaussian_filter(cube, 1.0), gaussian(cube, 1.0))


def _dilating_bfs(mask, sources):
    """The whole-array dilation loop `_bfs_distance` replaced."""
    dist = np.full(mask.shape, np.inf)
    frontier = sources & mask
    dist[frontier] = 0
    step = 0
    structure = np.ones((3, 3), dtype=bool)
    while frontier.any():
        step += 1
        frontier = ndimage.binary_dilation(frontier, structure=structure) & mask & np.isinf(dist)
        dist[frontier] = step
    return dist


@pytest.mark.parametrize("seed", range(4))
def test_bfs_distance_matches_the_dilation_loop(seed):
    rng = np.random.default_rng(seed)
    mask = rng.random((150, 180)) > 0.3
    sources = rng.random((150, 180)) > 0.99
    assert np.array_equal(_dilating_bfs(mask, sources), _bfs_distance(mask, sources))


def test_bfs_distance_with_no_reachable_source_is_all_inf():
    mask = np.zeros((20, 20), dtype=bool)
    sources = np.ones((20, 20), dtype=bool)
    assert np.isinf(_bfs_distance(mask, sources)).all()
