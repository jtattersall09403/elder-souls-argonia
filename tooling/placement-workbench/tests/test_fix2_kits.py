"""16k fix round 2, lane kits: the woven paddock fence (Claywater fw1-fw3).

(5) a family abuts pair whose members do not include the piece pair ranks
below the piece's own pairs: fencewoven01 snaps at its own 3.88 m, never
fencewoven02's 2.05 m. (6) the run-joint bar is the plugin's p90 per piece,
and an along-run overlap check catches the collinear double-up the slide
metric cannot see. Local only: needs the raw kit builds."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import measure, paths, snap  # noqa: E402
from workbench.kits import Catalogue  # noqa: E402
from workbench.scene import Piece  # noqa: E402

FW1 = "vanilla:architecture/farmhouse/fencewoven01"
FW2 = "vanilla:architecture/farmhouse/fencewoven02"


@pytest.fixture(scope="module")
def cat():
    return Catalogue()


def _pair(asset: str, step_m: float) -> tuple[Piece, Piece]:
    a, b = Piece("fw1", asset, 300.0, 3000.0, 0.0, 30.0), Piece("fw2", asset, 0.0, 0.0, 0.0, 30.0)
    a.role = {"kind": "run", "id": "r", "index": 0}
    b.role = {"kind": "run", "id": "r", "index": 1}
    snap._set_from_parent(b, a, [step_m, 0.0], 0.0, 0.0)
    return a, b


def test_fencewoven01_snaps_at_its_own_step_not_the_family_top():
    # Claywater's op: fw2 east face to fw1 west face, terminal faces allowed
    a, b = Piece("fw1", FW1, 357.5, 3085.0, 90.0, 30.0), Piece("fw2", FW1, 357.5, 3081.0, 90.0, 30.0)
    got = snap.snap_evidence(b, a, child_face="+x", parent_face="-x", allow_terminal=True)
    assert got["used"]["kind"] == "piece"
    assert math.hypot(b.x - a.x, b.z - a.z) == pytest.approx(3.9, abs=0.1)


def test_fencewoven02_keeps_its_own_2_05_step():
    a, b = Piece("a", FW2, 300.0, 3000.0, 0.0, 30.0), Piece("b", FW2, 0.0, 0.0, 0.0, 30.0)
    snap.snap_evidence(b, a, child_face="+x", parent_face="-x", allow_terminal=True)
    assert math.hypot(b.x - a.x, b.z - a.z) == pytest.approx(2.14, abs=0.02)


def test_run_joint_bar_passes_the_plugin_joint_and_fails_the_double_up(cat):
    # at the mined 3.88 m step the fencewoven01 joint is a pass
    a, b = _pair(FW1, 3.88)
    got = measure.contact(cat, a, b)
    verdict = wb._pair_verdict(a, b, got, cat)
    assert verdict["relation"] == "run-joint" and verdict["ok"], (got, verdict)
    # at Claywater's 2.09 m the panels double half their length: fails on overlap
    a, b = _pair(FW1, 2.09)
    got = measure.contact(cat, a, b)
    verdict = wb._pair_verdict(a, b, got, cat)
    assert verdict["alongRunOverlapM"] > 1.9
    assert not verdict["ok"]


def test_fencewoven02_plugin_joint_passes_its_own_bar(cat):
    # the plugin's commonest fencewoven02 joint (2.05 m, count 33) failed the
    # flat 0.05 m bar; the p90 bar (0.12) passes it
    a, b = Piece("a", FW2, 300.0, 3000.0, 0.0, 30.0), Piece("b", FW2, 0.0, 0.0, 0.0, 30.0)
    a.role = {"kind": "run", "id": "r", "index": 0}
    b.role = {"kind": "run", "id": "r", "index": 1}
    snap._set_from_parent(b, a, [2.05, 0.05], 0.0, 359.22)
    got = measure.contact(cat, a, b)
    assert wb._pair_verdict(a, b, got, cat)["ok"], got


def test_the_abuts_miner_reproduces_the_fence_run_joint_bars():
    """Round 6 ruling K3: `mine_abuts.run_joint_bars` over the record's
    fencewoven self-pairs, through the shared `slide_penetration` metric,
    gives the round-2 bars (fencewoven01 0.17 / 0.34, fencewoven02 0.12 /
    0.24), and the record carries them for wb.py to read."""
    paths.bridge()
    from worldgen import blueprint_footprints as fp
    from worldgen import mine_abuts
    from worldgen.mine_mounts import MeshLibrary
    abuts = fp.abuts_record()
    sub = {"pairs": [p for p in abuts["pairs"] if "fencewoven" in p["parent"]]}
    got = mine_abuts.run_joint_bars(sub, MeshLibrary())
    want = {FW1: (0.17, 0.34), FW2: (0.12, 0.24)}
    for asset, (pen, overlap) in want.items():
        assert got[asset]["penetrationM"] == pytest.approx(pen, abs=0.006), got
        assert got[asset]["alongRunOverlapM"] == pytest.approx(overlap, abs=0.006), got
        assert (abuts.get("runJointBars") or {}).get(asset) == got[asset]
