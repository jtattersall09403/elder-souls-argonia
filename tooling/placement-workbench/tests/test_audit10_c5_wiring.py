"""audit10 c5 wiring: a climb run's members are exempt from footFloat (and
the check row's slopeRule), a run joint at the mined pair pose within its
offsetSpreadM passes though the plugin's pose crosses, and the landscape
rock folder (rocks0N) is judged as a rock."""
from __future__ import annotations

import copy

import wb
from workbench import layout, seat_rules, snap
from workbench.scene import Piece

STAIR = "kotm:argonia/mudhuts/stairs02"


def _row(**kw) -> dict:
    return {"pieces": {"st-2": {"asset": "stairs02", "anchorClass": "ground",
                                "footFloatMaxM": 0.738, **kw}},
            "nearPairs": [], "doors": {}}


def test_climb_member_has_no_foot_float():
    assert not [r for r in layout.check_failure_rows(_row(climb=True)) if r["rule"] == "footFloat"]
    assert [r["rule"] for r in layout.check_failure_rows(_row())] == ["footFloat"]


def _stairs(off=0.0):
    a = Piece(uid="st-0", asset=STAIR, x=4475.51, z=1626.41, y=2.52, yaw=268.1,
              role={"kind": "run", "id": "parcel.x.bank-stair", "index": 0})
    b = copy.copy(a)
    b.uid, b.role = "st-1", {"kind": "run", "id": "parcel.x.bank-stair", "index": 1}
    step = next(s for s in snap.evidence_steps(STAIR, STAIR) if s["joint"] == "run")
    snap._set_from_parent(b, a, step["offsetM"], step["riseM"], step["yawDeg"])
    b.x += off
    return a, b


CAT = wb.Catalogue()
CROSSING = {"contact": True, "gapM": 0.0, "penetrationM": 0.234, "intersecting": True}


def test_run_joint_at_the_mined_pose_passes():
    # crossings st-0~st-1: the plugin's own stairs02 pair crosses 0.234 m
    a, b = _stairs()
    got = wb._pair_verdict(a, b, CROSSING, CAT)
    assert got["ok"] and got["minedPair"]["offM"] <= 0.01


def test_run_joint_off_the_mined_pose_fails():
    a, b = _stairs(off=0.2)       # spread 0.085 m
    assert not wb._pair_verdict(a, b, CROSSING, CAT)["ok"]


def test_landscape_rocks_are_rocks():
    assert seat_rules.is_rock("vanilla:landscape/rocks/rocks02")
    assert seat_rules.is_rock("vanilla:landscape/rocks/wetrocks/rockm02wet")
    assert not seat_rules.is_rock("vanilla:architecture/x/hut01")
    # greenspring sp-ring3: the yard sill is skipped on a rocks02
    chk = {"pieces": {"sp-ring3": {"asset": "rocks02", "rock": True,
                                   "sillRule": "ground line 0.151 m (> 0.15)"}},
           "nearPairs": [], "doors": {}}
    assert not [r for r in layout.check_failure_rows(chk) if r["rule"] == "yardSillRule"]
