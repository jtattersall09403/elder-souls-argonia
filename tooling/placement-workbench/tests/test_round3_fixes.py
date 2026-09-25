"""Round 3 tool gaps, fixed at the root (lane doc § Rounds, round 3). The
answers were written before the fixes:

* a mined abuts step joining on the CHILD's terminal face (a broken wall
  end) is refused like one on the parent's;
* a doorway reports the bearing its wall looks out along, and flags a
  recorded facing that is really the doorway's bearing from the pivot (the
  farmhouse: recorded 207, wall 180);
* `check` measures the water round a floating piece on the yard gate's own
  halo and depth;
* `site` returns only poses that pass the fit's slope rule;
* the compile's own verdicts are the workbench's (the second pass, when the
  first yard-B compile refused eight things `check` had passed): the ground
  delta per fit, the slope rule on a hull's seabed, the yard gate's sill,
  the compile's slide of a quay run and the 97 C5 clearance, and
  `wb.py compile`, which runs the real compile on the scene's poses;
* `check` names what each near pair is (mounted, run joint, unrelated) and
  judges it on that relation's bar.

Local only, like test_workbench.py: needs the raw kit builds.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import ground, measure, paths, snap  # noqa: E402
from workbench.kits import Catalogue  # noqa: E402
from workbench.scene import Piece, Scene  # noqa: E402

pytestmark = pytest.mark.skipif(not paths.RAW_KITS.exists(), reason="raw kit builds absent")

KEEP = "mwkeep:tesak1243/mwimperialarchitecture/architecture/keep/exterior/walls/"
FARMHOUSE = "composite:farmhouse/farmhouse01-with-door"
RAFT = "ferryraft:snt/ferry/ferryraft01"
STILT = "composite:stilt/stilthouse-with-door"


@pytest.fixture(scope="module")
def cat():
    return Catalogue()


@pytest.fixture(scope="module")
def scene(tmp_path_factory):
    """Yard B's ground: open fringe falling east to the sea."""
    tmp = tmp_path_factory.mktemp("wb3")
    stem = tmp / "ground"
    ground.extract((4320.0, 6010.0), 150.0, stem)
    return Scene(path=tmp / "scene.json", groundStem=str(stem))


def test_a_step_on_the_childs_broken_end_is_refused():
    gate = Piece("gate", KEEP + "mwimparchwallgate01", 0.0, 0.0, 0.0, 0.0)
    broken = Piece("d1", KEEP + "mwimparchwall01destroyed01", 0.0, 0.0, 0.0)
    assert "-x" in snap.terminal_faces(broken.asset)
    with pytest.raises(ValueError, match=r"child \['-x'\]"):
        snap.snap_evidence(broken, gate, "-x", "+x")
    got = snap.snap_evidence(broken, gate, "-x", "+x", allow_terminal=True)
    assert got["childTerminalFaces"] == ["-x"]
    # its sound end joins the gate's other side
    got = snap.snap_evidence(broken, gate, "+x", "-x")
    assert got["skippedTerminalSteps"] == 0


def test_the_farmhouse_door_looks_out_of_its_south_wall(cat, scene):
    house = Piece("house", FARMHOUSE, 4226.0, 6014.0, 0.0)
    got = measure.door_report(cat, scene, house)["best"]
    assert got["outwardDeg"] == 180.0
    assert got["facingDeg"] == 207.0 and got["facingOffOutwardDeg"] == 27.0
    turned = Piece("house", FARMHOUSE, 4226.0, 6014.0, 90.0)
    assert measure.door_report(cat, scene, turned)["best"]["outwardDeg"] == 270.0


def test_the_raft_off_yard_bs_stage_has_a_metre_of_water_all_round(cat, scene):
    g = scene.ground()
    afloat = wb._hull_water(cat, g, Piece("hull", RAFT, 4420.16, 6036.0, 90.0))
    assert afloat["ok"] and afloat["minDepthM"] >= 1.0 and afloat["cells"] >= 1
    beached = wb._hull_water(cat, g, Piece("hull", RAFT, 4380.0, 6012.0, 90.0))
    assert not beached["ok"]


def test_every_sited_pose_passes_the_slope_rule(cat, scene):
    paths.bridge()
    from types import SimpleNamespace

    from worldgen import compile_settlement as cs
    args = SimpleNamespace(asset=STILT, yaw=0.0, step=6.0, half=24.0, centre=[4310.0, 6030.0],
                           clear=3.0, limit=5)
    got = wb.cmd_site(args, scene, cat)
    assert got["legal"] >= 1
    for row in got["best"]:
        p = Piece("s", STILT, row["at"][0], row["at"][1], 0.0)
        slope = scene.ground().footprint_max_slope_deg(measure.footprint_province(cat, p))
        assert cs.fit_slope_failure(cat.row(STILT), slope) is None


HOUSE_OLD = (4226.0, 6014.0)       # round 3's first pose: compile refused delta 1.08 m
HOUSE_SILL = (4230.0, 6004.0)      # second pose: delta 0.33 m, gate sill 0.18 m
HOUSE_OK = (4223.0, 5997.0)
QUAY = "composite:docks/quay-run-2"


def _rules(cat, scene, asset, at, yaw=0.0):
    paths.bridge()
    from worldgen import compile_settlement as cs
    return wb._fit_rules(cat, scene.ground(), Piece("t", asset, at[0], at[1], yaw), cs)


def test_the_compiles_delta_and_the_gates_sill_are_checked(cat, scene):
    got = _rules(cat, scene, FARMHOUSE, HOUSE_OLD)
    assert got["groundFit"] == "plinth" and got["deltaRule"] and not got["ok"]
    got = _rules(cat, scene, FARMHOUSE, HOUSE_SILL)
    assert got["deltaRule"] is None and got["sillRule"] and got["sillM"] > 0.15
    assert _rules(cat, scene, FARMHOUSE, HOUSE_OK)["ok"]


def test_a_hulls_seabed_is_held_to_its_fits_slope_limit(cat, scene):
    got = _rules(cat, scene, RAFT, (4420.16, 6036.0), 90.0)
    assert got["slopeRule"] and not got["ok"]          # the compile refused 4.90 deg


def test_settle_slides_a_quay_run_as_the_compile_does(cat, scene):
    stage = scene.add(Piece("stage", QUAY, 4407.12, 6047.0, 270.0))
    with pytest.raises(ValueError, match="stands on no recorded water"):
        wb._settle(cat, scene, stage)                   # the compile slides it 19.8 m ashore
    stage.x, stage.z, stage.yaw = 4405.9, 6047.9, 320.0
    got = wb._settle(cat, scene, stage)
    assert abs(got["quayShiftM"]) <= 0.05
    assert abs(wb._quay_anchor(cat, stage)["shiftM"]) <= 0.025 + 1e-9
    scene.remove("stage")


def test_a_mounted_pair_is_judged_on_contact_not_the_joint_bar():
    post = Piece("post", "vanilla:clutter/signage/whiterun/signwrpost01", 0, 0, 0)
    sign = Piece("sign", "vanilla:clutter/signage/whiterun/signwrdrunkenhuntsman01", 0, 0, 0)
    sign.settledBy = "mount:post"
    got = wb._pair_verdict(post, sign, {"contact": True, "gapM": 0.0, "penetrationM": 0.083,
                                        "intersecting": True})
    assert got == {"relation": "mounted", "ok": True}
    a, b = Piece("a", KEEP + "mwimparchwalltower01", 0, 0, 0), Piece("b", KEEP + "mwimparchwallgate01", 0, 0, 0)
    a.role = {"kind": "run", "id": "r", "index": 0}
    b.role = {"kind": "run", "id": "r", "index": 1}
    over = {"contact": True, "gapM": 0.0, "penetrationM": 0.081, "intersecting": True}
    assert wb._pair_verdict(a, b, over) == {"relation": "run-joint", "ok": False}
    b.role = {}
    assert wb._pair_verdict(a, b, over) == {"relation": "unrelated", "ok": False}


def test_compile_reports_the_compiles_refusals_by_piece(tmp_path):
    """The real compile on a scene: the farmhouse where round 3 first put it
    is refused on its delta, and the error names the scene piece."""
    from types import SimpleNamespace
    yard = paths.OUTPUT / "scenes" / "yard-b.json"
    if not yard.exists():
        pytest.skip("the yard-B workbench scene (gitignored output) is not on this machine")
    scene = Scene.load(yard)
    scene.path = tmp_path / "scene.json"
    scene.piece("house").x, scene.piece("house").z = HOUSE_OLD
    got = wb.cmd_compile(SimpleNamespace(blueprint=None), scene, Catalogue())
    assert got["exitCode"] == 1
    assert any("imperial-house" in e["msg"] and "Δ=" in e["msg"] and e["uids"] == ["house"]
               for e in got["errors"])


def test_an_authored_ground_fit_is_judged_as_the_compile_judges_it(cat, scene):
    paths.bridge()
    from worldgen import compile_settlement as cs
    p = Piece("t", FARMHOUSE, *HOUSE_OK, 0.0)
    assert wb._fit_rules(cat, scene.ground(), p, cs)["ok"]                  # plinth, 0.41 m
    got = wb._fit_rules(cat, scene.ground(), p, cs, authored_fit="direct")
    assert got["groundFit"] == "direct" and got["deltaRule"] and not got["ok"]


def test_a_stilt_standing_in_water_has_a_sill(cat, scene):
    paths.bridge()
    from worldgen import compile_settlement as cs
    row = cat.row(STILT)
    dry = wb._sill(cat, scene.ground(), Piece("s", STILT, 4314.0, 6029.0, 0.0), row, cs)
    assert dry["sillM"] == 0.0 and dry["sillRule"] is None
    wet = wb._sill(cat, scene.ground(), Piece("s", STILT, 4425.0, 6050.0, 0.0), row, cs)
    assert wet["sillM"] > 0.15 and wet["sillRule"]


def test_the_window_refuses_a_point_outside_it(scene):
    g = scene.ground()
    x, z = g.meta["centreM"]
    far = g.meta["halfM"] + 50.0
    for sample in (g.depth, g.wet, g.survey_height):
        with pytest.raises(ValueError, match="outside the scene's ground window"):
            sample(x + far, z)
    with pytest.raises(ValueError, match="outside the scene's ground window"):
        g.footprint_max_slope_deg([(x + far, z), (x + far + 2, z), (x + far + 2, z + 2)])


def test_check_reports_a_quay_with_no_bank_instead_of_aborting(cat, scene):
    paths.bridge()
    from worldgen import compile_settlement as cs
    p = Piece("stage", QUAY, 4200.0, 5900.0, 90.0)              # inland, no bank in reach
    got = wb._quay_reach(cat, scene, scene.ground(), p, cat.row(QUAY), cs)
    assert "no bank" in got["bankError"]


def test_an_assembly_member_on_its_shell_is_a_mounted_pair():
    shell = Piece("shell", FARMHOUSE, 0, 0, 0)
    shell.role = {"kind": "parcel", "id": "parcel.x.house"}
    window = Piece("win", KEEP + "mwimparchwallgate01", 0, 0, 0)
    window.role = {"kind": "assembly", "id": "parcel.x.house", "on": "parent", "layer": "window"}
    over = {"contact": True, "gapM": 0.0, "penetrationM": 0.01, "intersecting": True}
    assert wb._pair_verdict(shell, window, over) == {"relation": "mounted", "ok": True}
