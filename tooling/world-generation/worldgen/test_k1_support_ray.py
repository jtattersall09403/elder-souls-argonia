"""16k fix 2 round 5 ruling K1: a hanging parent is told from a support by a
ray cast straight down from the child's contact points (mine_mounts
`supported_from_below`)."""
from __future__ import annotations

import numpy as np
import trimesh

from .mine_mounts import supported_from_below


def _box():
    return trimesh.creation.box(extents=(1.0, 1.0, 1.0))   # z from -0.5 to 0.5


def test_a_child_standing_on_the_parent_top_is_supported():
    on_top = np.array([[0.1, 0.1, 0.51], [-0.2, 0.0, 0.52], [0.0, -0.3, 0.5]])
    assert supported_from_below(on_top, _box(), 1.0)


def test_a_child_hanging_under_the_parent_is_not_supported():
    # contact points on the child's top, touching the parent's underside
    under = np.array([[0.1, 0.1, -0.51], [-0.2, 0.0, -0.52], [0.0, -0.3, -0.5]])
    assert not supported_from_below(under, _box(), 1.0)


def test_a_child_beside_a_raised_parent_edge_is_not_supported():
    # the contact sits past the parent's side: the ray falls clear of it
    beside = np.array([[0.52, 0.0, 0.2], [0.53, 0.1, 0.1], [0.52, -0.1, 0.0]])
    assert not supported_from_below(beside, _box(), 1.0)


def test_a_side_contact_on_the_parent_top_is_support():
    """Round 6 ruling K1 (0085): the down-ray meets the parent, so a side
    patch is support from below (shelf item, table candle)."""
    from .mine_mounts import at_base, hung_from
    child = np.array([[-0.1, -0.1, 0.5], [0.1, 0.1, 1.0]])
    foot = np.array([[0.0, 0.0, 0.5], [0.05, 0.0, 0.5]])
    assert at_base(foot, child) and supported_from_below(foot, _box(), 1.0)
    assert not hung_from(np.array([[0.0, 0.0, 0.5]]), child, 1.0)
    # a fence end touching its neighbour down its whole side is no foot
    assert not at_base(np.array([[0.1, 0.0, 0.5], [0.1, 0.0, 0.95]]), child)


def test_a_child_touching_a_hook_only_at_its_top_hangs_from_it():
    """Round 6 ruling K1: a pheasant on a wall hook touches it only at the
    top of its own height and hangs below: hung. A sconce touching its wall
    down its whole back is not."""
    from .mine_mounts import hung_from
    pheasant = np.array([[-0.1, -0.1, 0.0], [0.1, 0.1, 0.6]])
    assert hung_from(np.array([[0.0, 0.1, 0.58], [0.0, 0.1, 0.55]]), pheasant, 1.0)
    assert not hung_from(np.array([[0.0, 0.1, 0.05], [0.0, 0.1, 0.58]]), pheasant, 1.0)


def test_a_waterline_below_the_mesh_is_not_water():
    """Round 6 ruling K1: candlehorntable01's waterline (-2.33 m, n 4) lies
    far under its lowest point (0.0): never water; a dock post reaching
    6.2 m down into 1.6 m-deep water is."""
    from .mine_mounts import is_water
    candle = {"evidence": "mesh-sill", "iqrM": 0.0,
              "waterline": {"p50": -2.3275, "n": 4, "iqrM": 0.0412}}
    assert is_water(candle) and not is_water(candle, 0.0)
    dock = {"evidence": "mesh-sill", "waterline": {"p50": -1.593, "n": 5, "iqrM": 0.0}}
    assert is_water(dock, -6.233)
