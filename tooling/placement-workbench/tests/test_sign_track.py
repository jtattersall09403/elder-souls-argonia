"""signRule on a minor track (audit10, The Broke Column): a camp 207 m off
every trunk road carries its waymark on the Mile House track it sits on.
With no road within SIGN_ROUTE_REACH_M, the rule measures the arms against
the published tracks (`routes-minor.json`, ids `track.*`) and reads each
destination along them. Shown failing first on the roads alone (the rule
as it stood), then passing on the track, then failing on a wrong-facing arm.
The layout is The Broke Column's as published in audit10
(`fixtures/broke-column-audit10.layout.json`). Local only: the raw kit
builds and the ground window."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import rules  # noqa: E402

LAYOUT = HERE.parent / "fixtures" / "broke-column-audit10.layout.json"
TRACK = "track.imperial-fringe.mile-house-of-the-eagle"
MILE_HOUSE = "place.imperial-fringe.mile-house-of-the-eagle"


@pytest.fixture(scope="module")
def bc(applied_layout):
    return applied_layout(LAYOUT)


@pytest.fixture(scope="module")
def cat(bc):
    return wb.place_catalogue(bc.placeId)


def _sign(cat, scene):
    return rules.piece_rule("sign", cat, scene)


def test_roads_alone_cannot_measure_the_track_waymark(bc, cat, monkeypatch):
    roads = rules._published_lines("routes.json")
    monkeypatch.setattr(rules, "_sign_lines", lambda x, z: roads)
    fails = " | ".join(_sign(cat, bc.view())["failures"])
    assert "no published road or track toward" in fails and "deg off" in fails


def test_a_track_only_camp_passes(bc, cat):
    out = _sign(cat, bc.view())
    assert out["failures"] == []
    dests = {d["to"]: d for d in out["posts"]["s-post"]["destinations"]}
    assert dests[MILE_HOUSE]["bearingDeg"] == pytest.approx(270.0, abs=5)
    assert dests[TRACK]["bearingDeg"] == pytest.approx(90.0, abs=5)
    assert {d["route"] for d in dests.values()} == {TRACK}
    assert out["boards"]["s-board1"]["road"] == TRACK


def test_a_wrong_facing_arm_fails(bc, cat):
    scene = bc.view()
    board = scene.piece("s-board1")
    board.yaw = 90.0                        # its tip south, across the track
    fails = " | ".join(f for f in _sign(cat, scene)["failures"])
    assert f"the road {TRACK} runs" in fails
    assert f"the road toward {MILE_HOUSE} leaves at 270 deg" in fails
