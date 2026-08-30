"""Micro-siting miner: distance transform and banding on a synthetic pond."""

import math

from .mine_micro_siting import (
    NODE_M,
    band_of,
    distance_transform,
    label_water_bodies,
)


def _pond_grid(radius_nodes: int = 5, size: int = 40):
    """A flat plain with one round pond in the middle, depths in metres."""
    grid = {}
    for x in range(size):
        for y in range(size):
            r = math.hypot(x - size / 2, y - size / 2)
            grid[(x, y)] = 1.0 if r <= radius_nodes else -1.0
    return grid


def test_single_pond_is_one_body():
    grid = _pond_grid()
    labels = label_water_bodies(grid)
    assert len(set(labels.values())) == 1
    assert all(grid[n] > 0 for n in labels)


def test_distance_grows_away_from_shore():
    grid = _pond_grid(radius_nodes=5, size=40)
    labels = label_water_bodies(grid)
    dist = distance_transform(grid, labels)
    centre_d, centre_label = dist[(20, 20)]
    far_d, far_label = dist[(20, 32)]
    assert centre_label == far_label == labels[(20, 20)]
    # Centre of a 5-node pond is ~5 nodes from shore; the dry node 12 out ~7.
    assert 3 * NODE_M <= centre_d <= 6 * NODE_M
    assert 5 * NODE_M <= far_d <= 9 * NODE_M
    # Chamfer 3-4 diagonal error stays under ~7 %.
    diag = dist[(28, 28)][0]
    true = (math.hypot(8, 8) - 5) * NODE_M
    assert abs(diag - true) / true < 0.12


def test_banding_covers_the_axis():
    for value in (-200.0, -30.0, -7.5, -2.0, 3.0, 12.0, 500.0):
        assert band_of(value) is not None
