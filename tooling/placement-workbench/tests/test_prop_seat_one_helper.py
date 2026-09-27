"""Claywater walk-2 residual (P-residual item 4): the group settle and
propSeatRule seat a prop with ONE helper (`measure.prop_seat`). The Claywater
spit pots (spitpotopenloose01, plugin designed sink -0.117 m) were seated by
the runtime's mean-ground seat with their foot 0.018 m in the air, which
propSeatRule then failed (bar 0.01 m); a layout `move --dy` was re-settled
away. Written failing first. Local only: needs the raw kit builds and the
frozen ground window."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import pads, rules  # noqa: E402
from workbench.scene import Piece  # noqa: E402

LAYOUT = HERE.parent / "fixtures" / "claywater-walk2.layout.json"
PLACE = "place.imperial-fringe.claywater-station"
POT = "vanilla:clutter/woodfires/spitpotopenloose01"
# the two pots' plan poses in the walk-2 round-4 scene
POSES = {"t-ahy-pot": (312.9, 2991.5, 0.0), "t-b5-ahy-pot": (326.6565, 2965.9293, 135.0)}


@pytest.fixture(scope="module")
def cat():
    return wb.place_catalogue(PLACE)


def test_settled_spit_pots_pass_prop_seat(applied_layout, cat):
    scene = applied_layout(LAYOUT).view()
    declared = pads.scene_pads(cat, scene)
    for uid, (x, z, yaw) in POSES.items():
        p = Piece(uid, POT, x, z, yaw)
        p.role = {"kind": "assembly", "layer": "clutter", "on": "ground"}
        scene.add(p)
        wb._settle(cat, scene, p, declared_pads=declared)
    got = rules.prop_seat(cat, scene, uids=list(POSES))
    fails = [f for f in got["failures"] if any(u in f for u in POSES)]
    assert not fails, fails
    for uid in POSES:
        row = got["pieces"][uid]
        assert 0.0 <= row["gapM"] <= rules.PROP_FLOAT_MAX_M, row



STAIR = "vanilla:architecture/farmhouse/walkway/walkwaystairs8"


def test_stair_replaces_the_wall_where_it_crosses_the_pad_edge(applied_layout, cat):
    """Residual ruling 1: b2's west wall stops short of its stair (w4/w5
    removed); the stair, hung on b2 by template t0749 (its walk-2 residual
    pose), covers the pad edge it stands on, so padRule passes; without the
    stair the same edge is unretained. Written failing first."""
    scene = applied_layout(LAYOUT).view()
    for uid in ("b2w-w4", "b2w-w5"):
        scene.pieces.remove(scene.piece(uid))
    b2 = scene.piece("b2")
    pad = pads.scene_pads(cat, scene)["b2"]
    assert pads.pad_fit(cat, scene, b2, pad)["padRule"] is not None     # no stair: open
    stair = Piece("b2-stair", STAIR, 332.1060, 3097.4614, 328.55)
    stair.y = b2.y + 1.38
    stair.settledBy = "template:vanilla:t0749:b2"
    stair.role = {"kind": "assembly", "layer": "steps", "on": "ground"}
    scene.add(stair)
    assert pads.pad_fit(cat, scene, b2, pad)["padRule"] is None
