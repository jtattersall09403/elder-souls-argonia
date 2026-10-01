"""floorEdgeRule skips a doorless furniture, clutter or container parcel piece
(16k walk 9, Bog Iron Workings): the smelter holds its works yard's pad, and
its pour spout 0.84 m over its base was judged a floor edge. A doorless
architecture piece and any piece with a doorway are still judged."""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import rules  # noqa: E402


class _Cat:
    def __init__(self, category, doorways):
        self._category, self._doorways = category, doorways

    def doorways(self, asset):
        return self._doorways

    def row(self, asset):
        return {"category": self._category, "originOffsetM": [0.0, 0.0, 0.0]}


class _Piece:
    uid, asset = "bl-furnace", "vanilla:furniture/smeltermarker"


def test_a_doorless_machine_has_no_floor_edge():
    got, failures = rules.floor_edge_piece(_Cat("furniture", []), None,
                                           {"g": None, "wall_zone": None},
                                           _Piece(), lambda p: "direct")
    assert failures == [] and "no floor edge" in got["bl-furnace"]["note"]


def test_architecture_and_doored_pieces_are_still_judged(monkeypatch):
    called = []
    monkeypatch.setattr(rules, "_perimeter", lambda *a: called.append(1) or [])
    monkeypatch.setattr(rules, "underside", lambda *a: [])
    monkeypatch.setattr(rules.measure, "footprint_province", lambda *a: [])

    class P(_Piece):
        y, scale = 0.0, 1.0

    for cat in (_Cat("architecture", []), _Cat("furniture", [{"sideDeg": 0}])):
        rules.floor_edge_piece(cat, None, {"g": None, "wall_zone": None}, P(), lambda p: "direct")
    assert len(called) == 2
