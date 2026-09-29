"""`wb.py render-interior` (workbench/interior_render.py): the non-Blender
half on a synthetic bundle: the runtime's placement matrix, the room bounds,
the three cameras from the bounds and the door, the light list at the
runtime's intensity, and the fires the interior loader burns."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import interior_render as ir  # noqa: E402

WALL = {"sizeM": [10.0, 8.0, 4.0], "originOffsetM": [5.0, 4.0, 0.0]}      # x, north, up
CANDLE = {"sizeM": [0.1, 0.1, 0.3], "originOffsetM": [0.05, 0.05, 0.0],
          "flames": [{"offsetM": [0.0, 0.3, 0.0], "sizeM": 0.05}]}
LAMP = {"sizeM": [0.3, 0.3, 0.6], "originOffsetM": [0.15, 0.15, 0.0],
        "light": {"fixtureKind": "lantern"}}
ROWS = {"k:wall": WALL, "k:candle": CANDLE, "k:lamp": LAMP}


def _p(pid, asset, pos, yaw=0.0, cat="misc"):
    return {"id": pid, "assetId": asset, "kit": "k", "positionM": pos,
            "rotationDeg": [0.0, yaw, 0.0], "scale": 1.0, "category": cat}


BUNDLE = {
    "arrivalMarker": {"positionM": [0.0, 0.0, 3.0], "yawDeg": 0.0},
    "exitDoor": {"positionM": [0.0, 0.0, 4.0], "yawDeg": 180.0},
    "placements": [_p("wall", "k:wall", [0.0, 0.0, 0.0], cat="architecture"),
                   _p("candle", "k:candle", [2.0, 1.0, -1.0]),
                   _p("lamp", "k:lamp", [-3.0, 0.0, -2.0])],
    "lights": [{"refId": "L1", "positionM": [1.0, 2.0, -3.0], "radiusM": 5.0,
                "colorRGB": [255, 128, 0], "fade": 2.0}],
    "ambient": {"colorRGB": [255, 255, 255], "intensity": 2.0},
    "lighting": {"directionalRGB": [0, 0, 0]},
}


def row_of(p):
    return ROWS.get(p["assetId"])


def test_placement_matrix_is_the_runtimes_yaw_clockwise_from_north():
    m = ir.placement_matrix(_p("x", "k:wall", [1.0, 2.0, 3.0], yaw=90.0))
    # yaw 90 (east): the asset's forward (-z, north) turns to +x (east)
    assert np.allclose(m[:3, :3] @ [0.0, 0.0, -1.0], [1.0, 0.0, 0.0], atol=1e-9)
    assert np.allclose(m[:3, 3], [1.0, 2.0, 3.0])
    # Blender frame: game (x, y up, z south) -> (x, -z, y)
    b = ir.blender_matrix(np.eye(4) @ m)
    assert np.allclose(b[:3, 3], [1.0, -3.0, 2.0])


def test_room_bounds_are_the_architecture_boxes():
    lo, hi = ir.room_bounds(BUNDLE, row_of)
    assert np.allclose(lo, [-5.0, 0.0, -4.0]) and np.allclose(hi, [5.0, 4.0, 4.0])


def test_cameras_stand_in_the_doorway_and_two_opposite_corners():
    lo, hi = ir.room_bounds(BUNDLE, row_of)
    cams = {c["name"]: c for c in ir.cameras(BUNDLE, lo, hi)}
    assert list(cams) == ["doorway", "corner-a", "corner-b"]
    door = cams["doorway"]["eyeGame"]
    # stepped from the door toward the arrival marker, at eye height
    assert np.allclose(door, [0.0, ir.EYE_M, 4.0 - ir.DOOR_STEP_M])
    a, b = np.array(cams["corner-a"]["eyeGame"]), np.array(cams["corner-b"]["eyeGame"])
    assert a[0] < 0 < b[0] and a[2] < 0 < b[2]            # opposite plan corners
    assert np.allclose((a + b)[[0, 2]] / 2, [0.0, 0.0])
    # each camera looks at the room centre (Blender -Z toward the target)
    m = np.array(cams["doorway"]["matrix"])
    to_target = np.array(cams["doorway"]["targetBlender"]) - m[:3, 3]
    assert np.dot(-m[:3, 2], to_target / np.linalg.norm(to_target)) > 0.999


def test_light_list_is_the_records_at_the_runtimes_intensity():
    (light,) = ir.light_list(BUNDLE)
    assert light["at"] == [1.0, 3.0, 2.0]
    assert math.isclose(light["intensity"], 2.0 * math.pi)
    assert light["radiusM"] == 5.0 and light["decay"] == 2.0
    assert light["colour"][0] == 1.0 and 0.2 < light["colour"][1] < 0.23   # sRGB -> linear
    amb = ir.ambient_of(BUNDLE)
    assert np.allclose(amb["ambient"], [2.0 * math.pi] * 3)


def test_fires_are_mined_wicks_and_a_lit_fixtures_fallback():
    fires, cards = ir.fire_list(BUNDLE, row_of)
    by = {f["id"]: f for f in fires}
    assert not by["candle"]["fallback"]
    assert np.allclose(by["candle"]["at"], [2.0, 1.0, 1.3])        # wick 0.3 m up
    assert by["lamp"]["fallback"]
    assert np.allclose(by["lamp"]["at"], [-3.0, 2.0, 0.6])         # top centre
    assert cards == []


def test_stand_ins_and_swing_doors_draw_as_the_loader_draws_them():
    bundle = dict(BUNDLE, substitutions=[{
        "id": "sub", "refId": "1", "standInAsset": "k:candle", "kit": "k",
        "standInCategory": "clutter", "positionM": [1.0, 0.0, 1.0],
        "rotationDeg": [0.0, 0.0, 0.0], "scale": 1.0}],
        doors=[{"doorType": "load", "interiorLoadDoorRef": "2", "loadDoor": {}},
               {"doorType": "swing", "id": "sw", "assetId": "k:wall", "kit": "k",
                "positionM": [0.0, 0.0, 0.0], "rotationDeg": [0.0, 0.0, 0.0], "scale": 1.0}])
    drawn = {p["id"]: p for p in ir.drawn_placements(bundle)}
    assert drawn["sub"]["assetId"] == "k:candle" and drawn["sub"]["category"] == "clutter"
    assert drawn["sw"]["assetId"] == "k:wall" and len(drawn) == 5      # the load door draws nothing

    class Cat:
        def raw_glb(self, asset):
            return (Path(f"/kits/{asset}.glb"), asset)
    pieces, missing = ir.pieces(bundle, Cat())
    assert {p["uid"] for p in pieces} == set(drawn) and not missing
    fires, _ = ir.fire_list(bundle, row_of)
    assert "sub" in {f["id"] for f in fires}                            # a stand-in candle burns
