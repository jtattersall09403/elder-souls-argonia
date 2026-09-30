"""interior_seat (16k walk 6 fix at source): a wall piece's front is the side
its mined light is on. candlehornwall01 was mounted backwards by a
vertex-count rule that read its flat front as the back."""
from __future__ import annotations

import numpy as np

from workbench import interior_seat as seat


def _wall_horn():
    """A plate 0.3 x 0.4 m, 0.11 m deep (local z -0.02..+0.09), its flat front
    (+z) densely meshed, and a thin mounting spike out to z = -0.41 behind it."""
    g = np.linspace(-0.15, 0.15, 7)
    front = np.array([[x, y, 0.09] for x in g for y in np.linspace(0, 0.4, 9)])
    back = np.array([[x, y, -0.02] for x in (-0.15, 0.15) for y in (0.0, 0.4)])
    spike = np.array([[0, 0.2, -0.41], [0.01, 0.2, -0.41], [0, 0.21, -0.41]])
    return np.vstack([front, back, spike])


LIGHT = [0.0, 0.25, 1.1]          # the mined LIGH stands 1.1 m out of the front


def test_back_axis_is_opposite_the_mined_light():
    v = _wall_horn()
    assert np.allclose(seat.back_axis(v, LIGHT), [0, 0, -1])
    # the old rule (no light) takes the dense flat front as the back: the
    # test mesh reproduces the defect, so the light rule is what passes it
    assert np.allclose(seat.back_axis(v, None), [0, 0, 1])


def test_rear_extent_ignores_the_spike():
    assert abs(seat.rear_extent(_wall_horn(), np.array([0, 0, -1.0])) - 0.02) < 1e-9


def test_wall_piece_mounts_with_its_light_into_the_room():
    v = _wall_horn()
    for n in ([1, 0, 0], [0, 0, -1], [-0.6, 0, 0.8]):
        n = np.array(n, float)
        wall = np.array([2.0, 1.75, -3.0])
        pos, yaw = seat.wall_pose(v, LIGHT, wall, n)
        R = seat.yaw_matrix(yaw)
        light = np.asarray(pos) + R @ np.asarray(LIGHT)
        placed = v @ R.T + np.asarray(pos)
        assert (light - wall) @ n > 1.0, (n, yaw)          # flame side faces the room
        spike = placed[-3:]
        assert ((spike - wall) @ n < -0.3).all()           # spike goes into the wall
        body = placed[:-3]
        assert abs(((body - wall) @ n).min()) < 0.01       # plate back flush on the wall
