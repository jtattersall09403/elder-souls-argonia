"""16h K10: the abuts record's joint kinds, single-use pieces and family spread."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from . import compile_settlement as cs
from .mine_abuts import (RECORD, derive_single_use, joint_kind, kit_rows, rederive,
                         single_use, terminal_faces)

#: K10 ruling A: a family pair whose members disagree by more than this is
#: not one joint; the family key is claiming too much.
FAMILY_SPREAD_LIMIT_M = 0.3
_KEEP = "mwkeep:tesak1243/mwimperialarchitecture/architecture/keep/exterior/walls/"


def family_spread_violations(section: dict, limit: float = FAMILY_SPREAD_LIMIT_M) -> list[str]:
    return [f"{p['parentPiece']}{p['parentFace']}>{p['childPiece']}{p['childFace']} "
            f"spread {p['offsetSpreadM']}"
            for p in section.get("familyPairs") or [] if p["offsetSpreadM"] > limit]


def test_joint_kind_splits_a_run_from_a_back_to_back_wall():
    assert joint_kind("+x", "-x", (7.27, 0.0)) == "run"
    assert joint_kind("-y", "+y", (0.0, -3.64)) == "run"
    # the Imperial curtain wall set back to back (K8): face to face
    assert joint_kind("+y", "+y", (0.0, 2.81)) == "double"
    # opposite faces, but the offset runs across them: not a run
    assert joint_kind("+x", "-x", (0.2, 3.6)) == "double"
    # opposite faces, offset pointing back through the parent: not a run
    assert joint_kind("+x", "-x", (-7.27, 0.0)) == "double"


def test_terminal_faces_read_run_joints_only():
    rows = [{"joint": "run", "refs": (("s", 0, "a", "+x"), ("s", 1, "a", "-x"))},
            {"joint": "double", "refs": (("s", 0, "a", "+y"), ("s", 2, "a", "+y"))}]
    # ref 0 abuts on +x only (the double +y is ignored): its run ends at -x
    assert terminal_faces(rows) == {"a": {"+x": 1, "-x": 1}}


def test_single_use_needs_no_run_joint_in_the_whole_family():
    runs = [{"parent": "k:dir/wall01", "child": "k:dir/wall02", "joint": "run"}]
    no_pairs = ["k:dir/wall03destroyed01", "k:dir/stair01", "k:cave/doorcaveb"]
    # wall03destroyed01 belongs to a family with a run joint: it stays an end
    assert single_use(no_pairs, runs, []) == ["k:cave/doorcaveb", "k:dir/stair01"]


def test_single_use_covers_unplaced_structural_pieces_of_runless_families():
    """K11 ruling C: family with no run joint AND placed-no-pairs or unplaced."""
    runs = [{"parent": "k:dir/wall01", "child": "k:dir/wall02", "joint": "run"}]
    kits = {"k:dir/wall01": {"category": "architecture"},
            "k:dir/wall02": {"category": "architecture"},
            "k:dir/wall03destroyed01": {"category": "architecture"},  # unplaced, run family
            "k:troncons/passesc128h64d01": {"category": "architecture"},  # unplaced stair
            "k:cave/doorcaveb": {"category": "dungeon-kit"},  # unplaced cave mouth
            "k:flora/fern01": {"category": "plant"},  # unplaced, not structural
            "k:sign/signpost01": {"category": "misc"}}  # placed no pairs
    placed = {"k:dir/wall01": 4, "k:dir/wall02": 4, "k:sign/signpost01": 2}
    got = derive_single_use(runs, [], ["k:sign/signpost01"], placed, kits)
    assert got == ["k:cave/doorcaveb", "k:sign/signpost01", "k:troncons/passesc128h64d01"]
    # the rule as K10 wrote it (placed-no-pairs only) misses both yard pieces
    assert single_use(["k:sign/signpost01"], runs, []) == ["k:sign/signpost01"]


def test_the_record_single_use_is_the_derived_set():
    section = json.loads(RECORD.read_text()).get("abuts") or {}
    if not section:
        pytest.skip("abuts not mined")
    kits = kit_rows()
    if not kits:
        pytest.skip("no raw kits built")
    assert section["singleUse"] == rederive(section, kits)["singleUse"]
    assert set(section["placedNoPairs"]) <= set(section["placedAssets"])


def test_a_run_piece_with_an_unmet_end_stays_flagged_whatever_single_use_says():
    abuts = {
        "familyPairs": [
            {"parent": _KEEP + "mwimparchwall", "child": _KEEP + "mwimparchwall",
             "parentPiece": "mwimparchwall", "childPiece": "mwimparchwall",
             "parentFace": "+x", "childFace": "-x", "joint": "run", "relScale": 1.0,
             "offsetM": [7.27, 0.0, 0.0], "yawDeg": 0.0, "count": 8}],
        "endFaces": {_KEEP + "mwimparchwall01": {"+x": 8, "-x": 8}},
        "placedAssets": {_KEEP + "mwimparchwall01": 9},
        "placedNoPairs": [],
        "singleUse": derive_single_use([], [{
            "parent": _KEEP + "mwimparchwall", "child": _KEEP + "mwimparchwall",
            "joint": "run"}], [], {_KEEP + "mwimparchwall01": 9},
            {_KEEP + "mwimparchwall01": {"category": "architecture"}}),
    }
    assert abuts["singleUse"] == []
    shelf = SimpleNamespace(by_asset={})
    out = cs.open_modular_ends([_piece("a", _KEEP + "mwimparchwall01", 0.0)], shelf, abuts)
    assert [(r["face"], r["reason"]) for r in out] == \
        [("+x", "faces-nothing"), ("-x", "faces-nothing")]


def test_the_family_spread_check_can_fail():
    bad = {"familyPairs": [{"parentPiece": "a", "childPiece": "b", "parentFace": "+x",
                            "childFace": "-x", "offsetSpreadM": 0.31}]}
    assert family_spread_violations(bad) == ["a+x>b-x spread 0.31"]


def test_no_family_pair_in_the_record_spreads_past_the_limit():
    section = json.loads(RECORD.read_text()).get("abuts") or {}
    if not section:
        pytest.skip("abuts not mined")
    assert family_spread_violations(section) == []


def test_record_pairs_carry_their_joint_kind():
    section = json.loads(RECORD.read_text()).get("abuts") or {}
    if not section:
        pytest.skip("abuts not mined")
    for p in (section.get("pairs") or []) + (section.get("familyPairs") or []):
        assert p["joint"] == joint_kind(p["parentFace"], p["childFace"], p["offsetM"]), p
    ends = {f for faces in section["endFaces"].values() for f in faces}
    assert ends <= {"+x", "-x", "+y", "-y"}
    # the Whiterun farm fence rail set face to face along y (-x/-x, 3.64 m, n 17)
    # is a double joint, never a run (brief 16h miner lane item 5)
    rail = "vanilla:architecture/whiterun/wrfarmfence/wrfencestr01"
    self_pairs = [p for p in section["pairs"] if p["parent"] == p["child"] == rail]
    assert [(p["parentFace"], p["childFace"], p["joint"]) for p in self_pairs] == [
        ("-x", "-x", "double")]
    assert "-x" in section["doubleFaces"][rail]


def _piece(pid: str, asset: str, x: float) -> dict:
    return {"id": pid, "assetId": asset, "objectKind": "parcel",
            "positionM": [x, 0.0, 0.0], "yawDeg": 0.0, "scale": 1.0}


def test_open_ends_skip_the_back_face_and_single_use_pieces():
    abuts = {
        "familyPairs": [
            {"parent": _KEEP + "mwimparchwall", "child": _KEEP + "mwimparchwall",
             "parentPiece": "mwimparchwall", "childPiece": "mwimparchwall",
             "parentFace": "+x", "childFace": "-x", "joint": "run", "relScale": 1.0,
             "offsetM": [7.27, 0.0, 0.0], "yawDeg": 0.0, "count": 8},
            {"parent": _KEEP + "mwimparchwall", "child": _KEEP + "mwimparchwall",
             "parentPiece": "mwimparchwall", "childPiece": "mwimparchwall",
             "parentFace": "+y", "childFace": "+y", "joint": "double", "relScale": 1.0,
             "offsetM": [0.0, 2.81, 0.0], "yawDeg": 180.0, "count": 4}],
        "endFaces": {_KEEP + "mwimparchwall01": {"+x": 8, "-x": 8}},
        "placedAssets": {_KEEP + "mwimparchwall01": 9, "k:cave/doorcaveb": 2},
        "placedNoPairs": ["k:cave/doorcaveb"],
        "singleUse": ["k:cave/doorcaveb"],
    }
    placements = [_piece("a", _KEEP + "mwimparchwall01", 0.0),
                  _piece("b", _KEEP + "mwimparchwall01", 7.27),
                  _piece("c", "k:cave/doorcaveb", 40.0)]
    shelf = SimpleNamespace(by_asset={"k:cave/doorcaveb": {"category": "architecture"}})
    out = cs.open_modular_ends(placements, shelf, abuts)
    assert [(r["placementId"], r["face"], r["reason"]) for r in out] == \
        [("a", "-x", "faces-nothing"), ("b", "+x", "faces-nothing")]
    assert cs.single_use_pieces(placements, abuts) == \
        [{"placementId": "c", "assetId": "k:cave/doorcaveb"}]
