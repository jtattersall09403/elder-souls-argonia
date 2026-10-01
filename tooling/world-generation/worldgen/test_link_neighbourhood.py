"""`link_neighbourhood.door_frame`: a ref's offset in its load door's frame."""

import math
from types import SimpleNamespace

from .esp_index import UNITS_PER_METRE as U
from .link_neighbourhood import door_frame


def _door(heading_deg):
    return SimpleNamespace(pos=(100 * U, 200 * U, 10 * U), rot=(0.0, 0.0, math.radians(heading_deg)))


def test_a_door_facing_north_keeps_world_axes():
    assert door_frame(_door(0.0), (105 * U, 197 * U, 12 * U)) == (5.0, -3.0, 2.0)


def test_a_door_turned_east_turns_the_frame_with_it():
    # a ref 5 m east of a door facing east (heading 90) stands straight ahead
    x, y, z = door_frame(_door(90.0), (105 * U, 200 * U, 10 * U))
    assert (round(x, 2), round(y, 2), z) == (0.0, 5.0, 0.0)
