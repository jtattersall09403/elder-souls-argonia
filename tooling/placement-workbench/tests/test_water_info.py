"""Walk 6 (R86): a piece standing in water is reported, never failed. Whether a
jetty post, a fish trap or a wreck is meant to stand in water is the
builder's call, recorded as `wet` on its `place` op (place-build step 2)."""
from __future__ import annotations

import wb  # noqa: E402
from workbench import layout, rules  # noqa: E402
from workbench.scene import Piece  # noqa: E402

ROW = {"sizeM": [1.0, 1.0, 2.0], "originOffsetM": [0.0, 0.0, 0.0]}


class _Water:
    def __init__(self, depth, level):
        self._d, self._l = depth, level

    def depth(self, x, z):
        return self._d

    def water_level(self, x, z):
        return self._l


def test_in_water_is_information_not_a_failure():
    p = Piece(uid="post", asset="a", x=0.0, z=0.0, yaw=0.0, y=-1.0, wet=True)
    out = wb._water_at(_Water(1.08, 0.0), p, ROW)
    assert out == {"waterDepthM": 1.08, "wet": True, "waterLevelM": 0.0, "topOverWaterM": 1.0}
    assert not any(k.endswith("Rule") for k in out)


def test_dry_piece_reports_zero_depth():
    p = Piece(uid="crate", asset="a", x=0.0, z=0.0, yaw=0.0, y=0.0)
    assert wb._water_at(_Water(0.0, None), p, ROW) == {"waterDepthM": 0.0, "wet": False}


def test_no_submerged_rule_left():
    assert "submergedRule" not in open(layout.__file__).read()
    assert "submergedRule" not in open(rules.__file__).read()
