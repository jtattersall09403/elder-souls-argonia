"""R5, beached craft (planner ruling 4, 2026-09-26): a hull or cleat placed
`beached` is judged on its base contact with the bank, the bank's slope and
its reach to the water line, not on 97 B3. Claywater's canoe (pad fit, 8.76
degree bank, keel 0.83 m off the ground) failed B3 as a floor. Fakes only."""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import measure, paths  # noqa: E402
from workbench.scene import Piece  # noqa: E402

paths.bridge()
from worldgen import compile_settlement as cs  # noqa: E402

CANOE = "canoe:actors/sfss/canoe/canoe1"


class _Bank:
    """A bank sloping at `slope` degrees with water east of x = `water_x`."""

    def __init__(self, slope=8.76, water_x=4.0):
        self.slope, self.water_x = slope, water_x

    def footprint_max_slope_deg(self, poly):
        return self.slope

    def depth(self, x, z):
        return 0.5 if x > self.water_x else -0.5


def _canoe(monkeypatch, float_m):
    monkeypatch.setattr(measure, "footprint_province",
                        lambda cat, p: [(p.x - 3, p.z - 0.6), (p.x + 3, p.z - 0.6),
                                        (p.x + 3, p.z + 0.6), (p.x - 3, p.z + 0.6)])
    monkeypatch.setattr(measure, "float_under", lambda cat, g, p: {"footFloatMaxM": float_m})
    return Piece("canoe", CANOE, 0.0, 0.0, 90.0, y=35.0, beached=True)


def test_the_canoe_fails_b3_as_a_floor():
    pad_row = {"kit": "settlement-mud-v1", "id": CANOE, "placement": {"evidence": {"policyId": "pad"}}}
    assert cs.fit_slope_failure(pad_row, 8.76)


def test_a_beached_canoe_passes_on_its_keel_bank_and_reach(monkeypatch):
    got = wb._beached(None, _Bank(), _canoe(monkeypatch, 0.2))
    assert got["ok"] and got["beachedRule"] is None


def test_a_beached_canoe_fails_off_the_bank_far_from_water_or_on_a_cliff(monkeypatch):
    assert "off the bank" in wb._beached(None, _Bank(), _canoe(monkeypatch, 0.83))["beachedRule"]
    assert "no water" in wb._beached(None, _Bank(water_x=6.0), _canoe(monkeypatch, 0.2))["beachedRule"]
    assert "deg" in wb._beached(None, _Bank(slope=25.0), _canoe(monkeypatch, 0.2))["beachedRule"]


def test_an_unseated_beached_piece_fails(monkeypatch):
    p = _canoe(monkeypatch, 0.2)
    p.y = None
    assert "not seated" in wb._beached(None, _Bank(), p)["beachedRule"]
