"""audit10 c5 rules: padClearRule never judges a pad-owning PROP (it seats
on the graded surface since a37072f3: camp y-fire, Greenspring
b-fam2-fire), the climb predicate the run pads use is the one the workbench
reads, and signRule's board half judges each arm against the route of the
destination it is matched to (The Broke Column, s-board2 read 17 deg off the
nearest way at its first fork site). Each failed on the code before the fix."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import measure, rules  # noqa: E402


def _piece(uid, pad=None, y=1.0, role=None):
    return SimpleNamespace(uid=uid, pad=pad, y=y, role=role)


def test_pad_clear_skips_a_pad_owning_prop(monkeypatch):
    scene = SimpleNamespace(pieces=[_piece("b-fam2", {"datumM": 1.0}),
                                    _piece("b-fam2-fire", {"datumM": 1.0}),
                                    _piece("y-fire", {"apronM": 0.6})])
    monkeypatch.setattr(measure, "is_prop", lambda cat, p: p.uid.endswith("fire"))
    assert rules.pad_clear_targets(None, scene) == ["b-fam2"]


def test_climb_uids_reads_the_round_25_stair():
    """stairs02 x3 at pivots 2.52 / 5.44 / 8.36: a climb; a level boardwalk is not."""
    stair = [_piece(f"st-{i}", y=y, role={"kind": "run", "id": "bank-stair", "index": i})
             for i, y in enumerate((2.52, 5.44, 8.36))]
    walk = [_piece(f"lw{i:02d}", y=0.35, role={"kind": "run", "id": "the-long-walk", "index": i})
            for i in range(14)]
    assert rules.climb_uids(SimpleNamespace(pieces=stair + walk)) == {"st-0", "st-1", "st-2"}


LAYOUT = HERE.parent.parents[1] / "world/sources/blueprints/the-broke-column.layout.json"


@pytest.fixture(scope="module")
def bc(applied_layout):
    return applied_layout(LAYOUT)


def test_a_board_is_judged_on_its_own_destination_route(bc, monkeypatch):
    """At the fork the nearest way read 53 deg for s-board2 (17 deg off its
    36 deg arm); its matched destination's route (Swampmoth Town, 35.5 deg)
    is the one it must follow."""
    import wb
    cat = wb.place_catalogue(bc.placeId)
    monkeypatch.setattr(rules, "_road_bearing",
                        lambda scene, x, z: (53.0, 2.0, "track.imperial-fringe.mile-house-of-the-eagle"))
    out = rules.piece_rule("sign", cat, bc.view())
    row = out["boards"]["s-board2"]
    assert not [f for f in out["failures"] if f.startswith("s-board2:")], out["failures"]
    assert row["offDeg"] <= 1.0 and "mile-house" not in row["road"]
