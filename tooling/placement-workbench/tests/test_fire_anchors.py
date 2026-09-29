"""16k walk 5: the render's fire pass stands a flame proxy at every resolved
flame anchor (workbench/render.py `fire_anchors`, the runtime's rule in
game-core fx/fire/flameAnchors.ts): a mined wick through the piece's full
pose, a hanging lantern's fallback at its body, never its cord's top."""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import render  # noqa: E402
from workbench.scene import Piece, Scene  # noqa: E402

LANTERN = {"sizeM": [0.26, 0.247, 0.615], "originOffsetM": [0.129, 0.127, 0.024],
           "light": {"fixtureKind": "lantern"},
           "flames": [{"offsetM": [0.0087, 0.0933, 0.0243], "sizeM": 0.036},
                      {"offsetM": [-0.0119, 0.0652, -0.0369], "sizeM": 0.036}]}
CORD_LANTERN = {"sizeM": [0.655, 0.639, 2.236], "originOffsetM": [0.317, 0.317, 2.149],
                "anchorClass": "hanging", "light": {"fixtureKind": "lantern"}}


class _Cat:
    def __init__(self, rows):
        self.rows = rows

    def row(self, asset):
        return self.rows[asset]


def test_each_mined_wick_is_a_fire_at_the_pieces_full_pose():
    scene = Scene(path=Path("/tmp/none.json"), placeId="place.x")
    scene.add(Piece("lamp", "x:lantern", 10.0, 20.0, 90.0, 5.0, role={"layer": "light"}))
    fires = render.fire_anchors(_Cat({"x:lantern": LANTERN}), scene)
    assert len(fires) == 2 and not any(f["fallback"] for f in fires)
    # the wick is 0.0933 m above the pivot whatever the yaw
    assert abs(fires[0]["at"][2] - 5.0933) < 1e-6
    # yaw 90: the glTF x offset turns off the x axis
    assert abs(fires[0]["at"][0] - 10.0) < 0.03


def test_a_hanging_lanterns_fallback_fire_is_in_its_body_not_its_cord():
    scene = Scene(path=Path("/tmp/none.json"), placeId="place.x")
    scene.add(Piece("hung", "x:cord", 0.0, 0.0, 0.0, 12.0, role={"layer": "light"}))
    (fire,) = render.fire_anchors(_Cat({"x:cord": CORD_LANTERN}), scene)
    assert fire["fallback"]
    # base 2.149 m below the pivot, the body's centre 0.32 m above the base
    assert abs(fire["at"][2] - (12.0 - 2.149 + 0.639 / 2)) < 1e-6
