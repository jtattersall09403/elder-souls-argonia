"""wb.py mount refuses a mounted asset whose records do not carry the mount
(preflight 2026-10-01: three signs placed with no policy row, and a twin-hook
sign whose mounts record still said ground)."""

from wb import mount_records_problem

SIGN = "kotm:argonia/blackwood/sign"


def test_no_policy_row_is_refused():
    assert "no assetPolicies row" in mount_records_problem(SIGN, {"assetPolicies": {}}, {})


def test_record_disagreeing_with_placement_is_refused():
    pol = {"assetPolicies": {SIGN: "direct"}, "assetPlacement": {SIGN: {"anchorClass": "hanging"}}}
    msg = mount_records_problem(SIGN, pol, {SIGN: {"anchorClass": "ground", "anchorClassEvidence": "unplaced"}})
    assert "--merge" in msg


def test_twin_row_in_record_passes():
    pol = {"assetPolicies": {SIGN: "direct"}, "assetPlacement": {SIGN: {"anchorClass": "hanging"}}}
    assert mount_records_problem(SIGN, pol, {SIGN: {"anchorClass": "hanging",
                                                    "anchorClassEvidence": "policy"}}) is None
