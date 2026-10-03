"""audit10 c6 (crossings stair dry run): a climb run's walkway, the mined
stairs02 joint under coplanarRule, and a `move --dy` that reseat_after_pads
would erase. Fixtures are the stairs02 flight (0.29 m treads), not the place."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import walkway  # noqa: E402
from workbench.scene import Piece, Scene  # noqa: E402

RISE, TREAD, N = 0.29, 0.24, 12          # stairs02's tread rise; 12 treads = 3.48 m


def _flight():
    import trimesh
    import numpy as np
    w = walkway._World.__new__(walkway._World)
    boxes = [trimesh.creation.box(bounds=[[-0.8, -(k + 1) * TREAD, 0.0], [0.8, -k * TREAD, RISE * (k + 1)]])
             for k in range(N)]
    w.mesh = trimesh.util.concatenate(boxes)
    w.face_uid = np.concatenate([np.full(len(b.faces), 0) for b in boxes])
    w.uids = ["st"]
    return w


class _Bank:
    """Flat at 0 below the bank; the bank top from ``z0`` on."""

    def __init__(self, z0, top):
        self.z0, self.top = z0, top

    def height(self, x, z, source="chunks"):
        return self.top if z >= self.z0 else 0.0

    def water_level(self, x, z):
        return None


def test_a_flight_landing_on_its_top_walks_clear():
    row = walkway.walk_line(_flight(), _Bank(N * TREAD, N * RISE), [(0, -0.5), (0, N * TREAD + 0.8)],
                            0.45, 0.3, start_y=0.0)
    assert row["blocks"] == [] and row["largestStepM"] <= 0.45


def test_a_flight_buried_in_its_bank_is_one_ground_block_not_the_treads_ahead():
    """The dry run read 12 rows: 'ground 0.76/3.05-3.16 m rise' interleaved
    with 'st-2 across the way', the body cast from the last footing the
    walker froze on. The ground over the treads is the one defect."""
    row = walkway.walk_line(_flight(), _Bank(2.0, 3.6), [(0, -0.5), (0, N * TREAD + 0.8)],
                            0.45, 0.3, start_y=0.0)
    assert [(b["kind"], b["uid"]) for b in row["blocks"]] == [("block", "ground")]
    assert row["blocks"][0]["maxRiseM"] >= row["blocks"][0]["riseM"]


def test_dy_on_a_piece_reseat_settles_again_fails_and_on_a_run_member_does_not():
    import wb
    rock = Piece("rk", "vanilla:landscape/rocks/rocks03", 0, 0, y=1.0, settledBy="settle:piled:chunks")
    deck = Piece("rb", "vanilla:architecture/docks/dockstrent02", 0, 0, y=1.0,
                 settledBy="settle:piled:chunks", role={"kind": "run", "id": "r", "index": 0})
    padded = Piece("h", "x", 0, 0, y=1.0, settledBy="settle:streamed-perimeter:chunks",
                   role={"kind": "parcel"}, pad={})
    sc = Scene.__new__(Scene)
    sc.pieces = [rock, deck, padded]
    got = wb.dy_erased_rule(sc, [(66, "rk", 0.25), (33, "rb", -0.2), (62, "h", -0.15)])
    assert len(got["failures"]) == 1
    assert got["failures"][0].startswith("rk: op 66 `move --dy 0.25`") and "reseat_after_pads" in got["failures"][0]


def test_the_mined_stairs02_joint_is_not_coplanar_but_the_pieces_are_judged_against_others():
    from workbench import paths
    if not (paths.RAW_KITS).exists():
        pytest.skip("raw kit builds absent (local only)")
    import wb
    from workbench import rules
    from workbench.kits import Catalogue
    a = "kotm:argonia/mudhuts/stairs02"
    run = {"kind": "run", "id": "parcel.x.stair"}
    st0 = Piece("st-0", a, 4475.51, 1626.41, yaw=268.1, y=2.52, role={**run, "index": 0})
    st1 = Piece("st-1", a, 4475.561909784142, 1628.879636688728, yaw=268.1, y=5.44,
                role={**run, "index": 1}, settledBy="evidence-snap:st-0")
    sc = Scene.__new__(Scene)
    sc.pieces = [st0, st1]
    cat = Catalogue()
    assert wb.mined_run_joint(st0, st1) is not None
    assert rules.coplanar(cat, sc, mined_joint=wb.mined_run_joint)["failures"] == []
    # the same overlap between two pieces that are not run neighbours still fails
    lone = Piece("lone", a, st1.x, st1.z, yaw=st1.yaw, y=st1.y)
    sc.pieces = [st0, lone]
    assert any("lone" in f for f in rules.coplanar(cat, sc, mined_joint=wb.mined_run_joint)["failures"])


def test_a_stair_top_end_on_the_lip_reads_the_ground_ahead_not_the_drop_it_climbed():
    """The crossings stair's walked top end, 0.8 m onto a flat bank top, read
    50.6 deg not-flat from the 7.8 m drop behind it (the stair's own climb)."""
    bank = _Bank(0.0, 7.8)
    assert walkway._slope_deg(bank, 0.0, 0.8) > 12.0
    assert walkway._slope_deg(bank, 0.0, 0.8, forward=(0.0, 1.0)) == 0.0
    # the drop AHEAD of an end is still judged
    assert walkway._slope_deg(bank, 0.0, 0.8, forward=(0.0, -1.0)) > 12.0


def test_a_climb_member_ends_at_its_mesh_not_its_lowest_band():
    """stairs02's footprint is its lowest 1.5 m: the flight's top end read
    2.0 m short of the top tread, on the bank face under the lip."""
    from workbench import paths
    if not (paths.RAW_KITS).exists():
        pytest.skip("raw kit builds absent (local only)")
    import math
    from workbench import rules
    from workbench.kits import Catalogue
    cat = Catalogue()
    p = Piece("st-2", "kotm:argonia/mudhuts/stairs02", 4475.55, 1629.35, yaw=268.1, y=8.15)
    foot, mesh = rules._ends(cat, p), rules._ends(cat, p, climb=True)
    assert math.dist(*mesh) > 3.3 > math.dist(*foot) + 1.5
