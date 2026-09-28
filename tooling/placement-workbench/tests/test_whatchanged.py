"""0105 R35 (method review r5 finding G): the packet's "What changed" lines
come from the layout diff, each piece named by its manifest displayName; a
piece with none is counted, never given a name from memory."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from workbench import whatchanged as wc  # noqa: E402

NAMES = {"stable": "Riften stable", "wall": "stone wall end"}


def test_lines_follow_the_diff_and_name_from_the_manifest():
    head = [{"op": "place", "uid": "stable", "asset": "stable", "at": [10.0, 10.0], "yaw": 200.0},
            {"op": "place", "uid": "barn", "asset": "barn", "at": [0.0, 0.0], "yaw": 0.0},
            {"op": "bind", "uid": "x"}]
    now = [{"op": "place", "uid": "stable", "asset": "stable", "at": [12.9, 10.0], "yaw": 238.0},
           {"op": "place", "uid": "w4", "asset": "wall", "at": [1.0, 2.0], "yaw": 0.0},
           {"op": "bind", "uid": "x", "to": "y"}]
    got = wc.changes(head, now, NAMES)
    assert got["lines"] == [
        "Riften stable (stable): moved 2.9 m east; turned 38 degrees clockwise.",
        "Added stone wall end (w4) at [1.0, 2.0].",
        "Removed barn (barn)."]
    assert got["unnamed"] == ["barn"]


def test_a_swap_names_both_and_an_unchanged_layout_says_nothing():
    head = [{"op": "place", "uid": "hist", "asset": "stable", "at": [0, 0], "yaw": 0}]
    now = [{"op": "place", "uid": "hist", "asset": "wall", "at": [0, 0], "yaw": 0}]
    assert wc.changes(head, now, NAMES)["lines"] == ["Riften stable (hist): replaced Riften stable with stone wall end."]
    assert wc.changes(now, now, NAMES) == {"lines": [], "unnamed": []}


def test_move_swap_and_remove_ops_report_the_piece_they_change():
    """Review 2026-09-28: a new `remove` op printed "Added remove", a `swap`
    "Added <asset>", and a `move` nothing."""
    head = [{"op": "place", "uid": "stable", "asset": "stable", "at": [10.0, 10.0], "yaw": 0.0},
            {"op": "place", "uid": "rack", "asset": "wall", "at": [0.0, 0.0], "yaw": 0.0}]
    now = head + [{"op": "move", "uid": "stable", "dx": 3.0},
                  {"op": "swap", "uid": "stable", "asset": "wall"},
                  {"op": "remove", "uid": "rack"}]
    got = wc.changes(head, now, NAMES)
    assert got["lines"] == ["Riften stable (stable): replaced Riften stable with stone wall end; moved 3.0 m east.",
                            "Removed stone wall end (rack)."]
    # a move in the piece's own frame, as wb.cmd_move: forward at yaw 0 is
    # north (-z), at yaw 90 east (+x)
    fwd = head + [{"op": "move", "uid": "stable", "forward": 2.0}]
    assert [round(v, 6) for v in wc.piece_states(fwd)["stable"]["at"]] == [10.0, 8.0]
    east = [{**head[0], "yaw": 90.0}, {"op": "move", "uid": "stable", "forward": 2.0}]
    assert [round(v, 6) for v in wc.piece_states(east)["stable"]["at"]] == [12.0, 10.0]

