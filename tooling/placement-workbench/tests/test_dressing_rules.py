"""seatFacingRule and socketCoherenceRule (16k walk 8) on synthetic geometry."""
from types import SimpleNamespace

import numpy as np
import trimesh

from workbench import dressing_rules as dr
from workbench.scene import Piece


class _Cat:
    def __init__(self, meshes):
        self.meshes = meshes

    def mesh(self, asset):
        return self.meshes[asset]


def _chair():
    seat = trimesh.creation.box((0.6, 0.6, 0.45))
    seat.apply_translation((0, 0, 0.225))
    back = trimesh.creation.box((0.6, 0.08, 0.55))
    back.apply_translation((0, -0.26, 0.72))          # the back at kit -y: sits facing +y
    return trimesh.util.concatenate([seat, back])


def _hut():
    m = trimesh.creation.box((6, 6, 3))
    m.apply_translation((0, 0, 1.5))
    return m


def _scene(chair_yaw):
    cat = _Cat({"m:chair": _chair(), "m:hut": _hut()})
    hut = Piece("hut", "m:hut", 0.0, 0.0, y=0.0, role={"kind": "parcel", "id": "parcel.x.hut"})
    chair = Piece("chair", "m:chair", 0.0, -4.0, yaw=chair_yaw, y=0.0)   # 1 m north of the north wall
    return cat, SimpleNamespace(pieces=[hut, chair], paths=[])


def test_kit_forward_is_measured_from_the_back():
    assert dr._off(dr._kit_forward(_Cat({"c": _chair()}), "c"), 0.0) < 1.0


def test_chair_facing_the_wall_fails_and_turned_away_passes():
    cat, scene = _scene(180.0)                         # faces south, into the hut
    out = dr.seat_facing(cat, scene)
    assert not out["ok"] and out["failures"][0].startswith("chair: seat faces 180")
    dr._kit_forward.cache_clear()
    cat, scene = _scene(0.0)                           # faces north, away from the wall
    assert dr.seat_facing(cat, scene)["ok"]


def test_wall_normal_points_out_of_the_face_toward_the_point():
    from workbench import snap
    n, d = snap._wall_normal(_hut(), np.array([0.0, 4.0, 1.0]))   # 1 m north of the north wall
    assert abs(n[0]) < 1e-6 and abs(n[1] - 1.0) < 1e-6 and abs(d - 1.0) < 1e-6
