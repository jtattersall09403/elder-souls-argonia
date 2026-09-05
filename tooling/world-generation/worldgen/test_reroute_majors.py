"""Major-road repair: the over-cap stretches are re-solved, not cut deeper."""

from __future__ import annotations

import numpy as np

from worldgen import reroute_majors as rm


def ridge_world(n: int = 60) -> np.ndarray:
    """A flat western plain and an eastern tableland that rises away from the
    north edge. Crossing the tableland's western face head-on is a cliff;
    going north first, stepping across where the face is still low, and
    climbing the tableland's own gentle back is walkable — which is exactly
    the switchback-or-contour choice the repair has to make.
    """
    rows = np.arange(n)[:, None].astype(np.float64)
    face = np.clip((rows - 2.0) / 30.0, 0.0, 1.0) * 14.0
    h = np.zeros((n, n), dtype=np.float64)
    h[:, 31:] = face
    h[:, 30] = face[:, 0] * 0.5
    return h


def straight(n: int = 60):
    return [[x, 30] for x in range(5, n - 5)]


def test_segment_gradients_see_inside_a_decimated_segment():
    h = ridge_world()
    fine = rm.segment_gradients([[29, 30], [30, 30], [31, 30]], h, 5.5)
    coarse = rm.segment_gradients([[29, 30], [31, 30]], h, 5.5)
    assert fine.max() > 20.0
    # the decimated polyline hides nothing: the segment takes its worst step
    assert coarse.max() > 20.0


def test_steep_runs_merge_and_pad():
    deg = np.array([1.0, 30.0, 1.0, 1.0, 30.0, 1.0, 1.0, 1.0, 1.0, 1.0])
    assert rm.steep_runs(deg, 8.0, pad=2) == [(0, 7)]
    assert rm.steep_runs(np.zeros(5), 8.0) == []


def test_repair_takes_the_saddle_instead_of_the_ridge():
    h = ridge_world()
    cost = np.ones_like(h)
    px = straight()
    before = rm.segment_gradients(px, h, 5.5).max()
    assert before > 20.0
    new, edits = rm.repair(px, "road", cost, h, 5.5)
    after = rm.segment_gradients(new, h, 5.5).max()
    assert edits and after <= rm.GRADIENT_CAP_DEG["road"]
    assert new[0] == list(px[0]) and new[-1] == list(px[-1]), "the ends never move"
    assert len(new) > len(px), "going round is longer than going over"


def test_repair_is_deterministic_and_leaves_a_walkable_line_alone():
    h = ridge_world()
    cost = np.ones_like(h)
    a, _ = rm.repair(straight(), "road", cost, h, 5.5)
    b, _ = rm.repair(straight(), "road", cost, h, 5.5)
    assert a == b
    flat = [[x, 1] for x in range(5, 25)]
    same, edits = rm.repair(flat, "road", cost, h, 5.5)
    assert same == flat and edits == []
