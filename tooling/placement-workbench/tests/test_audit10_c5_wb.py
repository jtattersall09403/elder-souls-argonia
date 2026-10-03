"""audit10 c5 workbench fixes: the yard sill is skipped on a rock,
`mount --socket` stands a board on its post's mined arm socket, and
`wb check` reports a run member with no seat instead of raising."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

import wb
from workbench import layout, measure, pads, rules
from workbench.scene import Piece

ROCK = "vanilla:landscape/rocks/rockcairn01"
POST = "vanilla:clutter/roadsignpost"
SOCKETS = (1.922, 2.033, 2.51, 2.787, 2.885)


def _check(asset: str, sill: str) -> dict:
    return {"pieces": {"sp-ring3": {"asset": asset.rsplit("/", 1)[-1], "sillRule": sill}},
            "nearPairs": [], "doors": {}}


def test_rock_skips_the_yard_sill():
    # sp-ring3 (greenspring c5): yard sill 0.151 m over the 0.15 bar
    rows = layout.check_failure_rows(_check(ROCK, "ground line 0.151 m (> 0.15)"))
    assert not [r for r in rows if r["rule"] == "yardSillRule"]


def test_built_piece_keeps_the_yard_sill():
    rows = layout.check_failure_rows(_check("vanilla:architecture/x/hut01",
                                            "ground line 0.151 m (> 0.15)"))
    assert [r["rule"] for r in rows] == ["yardSillRule"]


def _pieces():
    post = Piece(uid="r-post", asset=POST, x=0.0, z=0.0, y=10.0)
    board = Piece(uid="r-board1", asset="vanilla:clutter/roadsignmedium01l", x=0.0, z=0.0, y=11.0)
    return post, board


def test_socket_puts_the_board_on_the_mined_height(monkeypatch):
    monkeypatch.setattr(rules, "post_arm_heights", lambda a: SOCKETS)
    post, board = _pieces()
    post.scale = 1.1
    wb._on_socket(board, post, 2.51)
    assert (board.y - post.y) / post.scale == pytest.approx(2.51)
    assert board.role["mountPair"]["heightBy"] == "socket"


def test_socket_off_the_mined_set_is_refused(monkeypatch):
    monkeypatch.setattr(rules, "post_arm_heights", lambda a: SOCKETS)
    post, board = _pieces()
    with pytest.raises(ValueError, match="not a mined arm socket"):
        wb._on_socket(board, post, 2.269)


def test_check_row_reports_a_member_with_no_seat(monkeypatch):
    def no_seat(cat, g, p):
        raise ValueError(f"{p.uid}: water-class piece stands on no recorded water")
    monkeypatch.setattr(measure, "seat", no_seat)
    monkeypatch.setattr(pads, "ground_for", lambda *a, **k: None)
    monkeypatch.setattr(measure, "float_under", lambda *a, **k: {})
    monkeypatch.setattr(measure, "deck_seated", lambda row: False)
    cat = SimpleNamespace(row=lambda a: {"anchorClass": "ground", "piled": True})
    cs = SimpleNamespace(is_quay_run=lambda row: False)
    p = Piece(uid="rw-pile3", asset="vanilla:docks/dockpiling01", x=0.0, z=0.0, y=1.0)
    p.role = {"kind": "run"}
    r = wb._check_row(cat, None, p, {}, cs)
    assert r["runtimeY"] is None and "no recorded water" in r["seatError"]
