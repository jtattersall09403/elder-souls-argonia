"""16k walk 4 lane WB (owner 2026-09-28): `mount --hang` (R53), the four seat
rules (`workbench/seat_rules.py`: burial, hanging, fixtureSeat, landing), the
signRule arms extension and `wb.py bpy`. Each rule is shown FAILING on the
Claywater and Greenspring layouts as they stood at HEAD 2026-09-28
(`fixtures/*-walk4.layout.json`, Claywater's compiled pivots frozen in
`fixtures/claywater-walk4.compiled.json`), then passing on the fix the
PLACES lane makes. Local only: the raw kit builds and the ground window."""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import paths, rules, seat_rules, snap  # noqa: E402
from workbench.scene import Piece  # noqa: E402
from worldgen.pad_overlay import PAD_FLOOR_CLEARANCE_M  # noqa: E402

FIX = HERE.parent / "fixtures"
CLAYWATER = FIX / "claywater-walk4.layout.json"
GREENSPRING = FIX / "greenspring-walk4.layout.json"
COMPILED = FIX / "claywater-walk4.compiled.json"
APPROVED = "reader-approved r1"
MM_TREE = "mudmother:gv_meshes/argoniannest/histtree"
MM_LANTERN = "mudmother:gv_meshes/argoniannest/argonianlanterns03"
FLOWER = "histtree:skyfall/sleeping tree overhaul/histflower01"
LANTERN = "kotm:argonia/clutter/townlantern04"   # no saxhleellantern is in any published kit


@pytest.fixture(scope="module")
def cw(applied_layout):
    return applied_layout(CLAYWATER)


@pytest.fixture(scope="module")
def gs(applied_layout):
    return applied_layout(GREENSPRING)


@pytest.fixture(scope="module")
def cat(cw):
    return wb.place_catalogue(cw.placeId)


@pytest.fixture
def compiled(monkeypatch):
    monkeypatch.setattr(seat_rules, "compiled_y", lambda s: seat_rules.compiled_from(s, COMPILED))


@pytest.fixture
def no_compile(monkeypatch):
    monkeypatch.setattr(seat_rules, "compiled_y", lambda s: {})


# ---------------------------------------------------------------- mount --hang

def test_hang_reproduces_the_mined_mud_mother_lanterns_within_0_1_m(gs, cat):
    """R53: the three plugin poses of argonianlanterns03 on the Mud Mother
    Hist tree (kit-mounts-mined points) come back from the ray within 0.1 m."""
    scene = gs.view()
    tree = scene.add(Piece(uid="mm-tree", asset=MM_TREE, x=4800.0, z=1900.0, yaw=30.0, scale=0.77))
    tree.y = 20.0
    for k in range(3):
        child = scene.add(Piece(uid=f"mm-l{k}", asset=MM_LANTERN, x=tree.x, z=tree.z))
        snap.mount(child, tree, point=k)
        mined = (child.x, child.z, child.y)
        child.y = None
        snap.hang_mount(cat, scene, child, tree, APPROVED, min_h=-100.0, max_h=100.0)
        off = math.dist(mined, (child.x, child.z, child.y))
        assert off <= 0.1, (k, off)


def test_hang_seats_a_flower_and_a_lantern_on_the_greenspring_hist(gs, cat):
    scene = gs.view()
    hist = scene.piece("hist")
    got = {}
    for uid, asset, bearing in (("hang-flower", FLOWER, 240.0), ("hang-lantern", LANTERN, 60.0)):
        child = scene.add(Piece(uid=uid, asset=asset, x=hist.x, z=hist.z))
        pair = snap.hang_mount(cat, scene, child, hist, APPROVED, max_h=12.0, along_m=6.0,
                               bearing_deg=bearing)["pair"]
        got[uid] = pair["hitOverGroundM"]
        assert 1.8 <= pair["hitOverGroundM"] <= 12.0
        assert child.role["mountPair"]["on"] == "branch"
        assert rules.piece_rule("hanging", cat, scene, [uid])["failures"] == []
    assert got["hang-flower"] > 5.0 and got["hang-lantern"] > 5.0, got


def test_hang_finds_no_branch_in_the_default_band_on_the_sick_hist(gs, cat):
    """The sick Hist's lowest branches stand over 4 m (only roots below):
    the default 1.8-4.0 m band refuses by name rather than guess."""
    scene = gs.view()
    hist = scene.piece("hist")
    child = scene.add(Piece(uid="hang-x", asset=LANTERN, x=hist.x, z=hist.z))
    with pytest.raises(ValueError, match="1.8-4.0 m over the ground"):
        snap.hang_mount(cat, scene, child, hist, APPROVED, along_m=6.0, bearing_deg=240.0)


def test_hang_needs_the_render_round_approval(gs, cat):
    scene = gs.view()
    child = scene.add(Piece(uid="hang-y", asset=LANTERN, x=4743.0, z=1877.0))
    with pytest.raises(ValueError, match="reader-approved"):
        snap.hang_mount(cat, scene, child, scene.piece("hist"), None, max_h=12.0)


def test_mount_hang_cli_flags_reach_the_layout_op():
    from workbench import layout
    op = {"op": "mount", "child": "c", "parent": "p", "hang": True, "unmined": APPROVED,
          "max_h": 12.0, "bearing": 240.0, "along": 6.0}
    argv = layout.op_to_argv(op, wb.parser())
    a = wb.parser().parse_args(["s", *argv])
    assert (a.hang, a.max_h, a.bearing, a.along, a.unmined) == (True, 12.0, 240.0, 6.0, APPROVED)


# ---------------------------------------------------------------- burialRule

def test_burial_fails_the_claywater_stable_at_both_seats(cw, cat, compiled):
    """At HEAD the stable's op carried a pad and no `settle` (y None): judged
    at the runtime seat, and at the HEAD compile's 34.83 m. A `place` op with
    a pad now settles (walk 4 COMPILE lane), so the view un-settles it. The
    pad grades PAD_FLOOR_CLEARANCE_M under its datum (R75, 017b4cf4), so the
    runtime seat's base stands that much less under the graded ground than
    the designed 0.91 m (0.88 m; 0.91 m again with the clearance at 0)."""
    scene = cw.view()
    scene.piece("stable").y = None
    out = rules.piece_rule("burial", cat, scene, ["stable"])
    text = " ".join(out["failures"])
    row = out["pieces"]["stable"]
    assert row["judgedAt"] == "runtime-seat" and abs(row["baseDepthM"] - (0.91 - PAD_FLOOR_CLEARANCE_M)) < 0.01
    assert abs(row["compiledBaseDepthM"] - 3.48) < 0.05 and "last compile" in text
    # the runtime seat itself is the designed pose (planner ruling 1,
    # CLAYWATER2): the assetPlacement row's 0.91 m burial allows it
    assert row["designedBaseDepthM"] == pytest.approx(0.91, abs=0.01)
    assert len(out["failures"]) == 1, out["failures"]


def test_a_place_op_with_a_pad_settles_the_stable_on_its_pad(cw, cat, no_compile):
    """WB rec 2: the stable's op (pad, no `settle`) now has a height on its
    37.4 m pad and every rule judges that pose (no longer a runtime-seat
    guess). Its base still stands 0.91 m under the pad there: rtstables01's
    sink is a policy 0 while its pivot is 0.91 m over its base (queued to the
    sink record, deliver-COMPILE.md)."""
    p = cw.piece("stable")
    assert p.y == pytest.approx(37.4, abs=0.02)
    out = rules.piece_rule("burial", cat, cw.view(), ["stable"])
    assert out["pieces"]["stable"]["judgedAt"] == "pose"


def test_burial_passes_once_the_stable_stands_on_its_pad(cw, cat, no_compile):
    scene = cw.view()
    p = scene.piece("stable")
    p.y = 37.4 + float(cat.row(p.asset)["originOffsetM"][2])     # base on the 37.4 m datum
    assert rules.piece_rule("burial", cat, scene, ["stable"])["failures"] == []


def test_burial_judges_the_stable_floor_on_its_pad_by_the_recorded_sink(cw, cat, no_compile):
    """Planner ruling 1 (CLAYWATER2): the stall floor on the 37.40 m pad and
    the 0.91 m foundation buried, as Riften buries it. The assetPlacement
    row (evidence "policy") designs that burial; 0.3 m deeper still fails."""
    scene = cw.view()
    p = scene.piece("stable")
    p.y = 37.4
    out = rules.piece_rule("burial", cat, scene, ["stable"])
    row = out["pieces"]["stable"]
    assert out["failures"] == [] and row["sinkEvidence"] == "policy"
    assert row["allowM"] == pytest.approx(0.91, abs=0.01)
    p.y = 37.1
    assert rules.piece_rule("burial", cat, scene, ["stable"])["failures"]


# ---------------------------------------------------------------- hangingRule

def test_hanging_fails_the_greenspring_flowers_standing_on_the_ground(gs, cat):
    fails = rules.piece_rule("hanging", cat, gs.view())["failures"]
    named = sorted(f.split(":", 1)[0] for f in fails)
    assert named == ["b-minder-flower", "sh-flower1", "sh-flower2", "sp-flower"], fails


def test_hanging_class_reads_the_mined_record_and_the_geometry(cat):
    assert "mined hanging" in seat_rules.hanging_class(cat, MM_LANTERN)
    assert "host's frame" in seat_rules.hanging_class(cat, FLOWER)
    assert seat_rules.hanging_class(cat, "mudmother:gv_meshes/argoniannest/argoniancandle01") is None


def test_hanging_passes_once_the_flower_hangs(gs, cat):
    scene = gs.view()
    p = scene.piece("sp-flower")
    snap.hang_mount(cat, scene, p, scene.piece("hist"), APPROVED, max_h=12.0, along_m=6.0,
                    bearing_deg=240.0)
    fails = rules.piece_rule("hanging", cat, scene)["failures"]
    assert not any(f.startswith("sp-flower:") for f in fails)


# ---------------------------------------------------------------- landingRule

def test_landing_fails_the_compiled_claywater_stage(cw, cat, compiled):
    out = seat_rules.landing(cat, cw.view())
    row = out["runs"]["parcel.claywater-station.landing-stage"]
    assert row["deckOverWaterM"] == pytest.approx(0.35, abs=0.01)
    assert row["compiledDeckOverWaterM"] == pytest.approx(3.36, abs=0.05)
    assert row["compiledLandDropM"] == pytest.approx(3.06, abs=0.05)
    assert len(out["failures"]) == 2


def test_landing_passes_where_the_compile_seats_it_as_the_workbench(cw, cat, no_compile):
    out = seat_rules.landing(cat, cw.view())
    assert out["failures"] == [], out


def test_landing_fails_a_deck_lifted_off_the_water(cw, cat, no_compile):
    scene = cw.view()
    for u in ("land-dock1", "land-dock2"):
        scene.piece(u).y += 1.25
    fails = seat_rules.landing(cat, scene)["failures"]
    assert any("over the water" in f for f in fails) and any("no step" in f for f in fails)


def test_landing_builds_each_member_mesh_once_per_pose(cw, cat, compiled, monkeypatch):
    """Review 5536a1d9: the deck probes reuse one world mesh (and its ray BVH)
    per member and pose, instead of a copy per probe per end per pose; the
    result is unchanged."""
    expected = seat_rules.landing(cat, cw.view())
    built = []
    real = rules._world_mesh
    monkeypatch.setattr(rules, "_world_mesh", lambda c, p: built.append(p.uid) or real(c, p))
    assert seat_rules.landing(cat, cw.view()) == expected
    deck = [u for u in built if u.startswith("land-dock")]
    assert sorted(deck) == ["land-dock1", "land-dock2"], built


# ---------------------------------------------------------------- fixtureSeatRule

def test_fixture_seat_fails_a_lantern_sunk_into_the_ground_then_passes(cw, cat, no_compile):
    scene = cw.view()
    assert rules.piece_rule("fixtureSeat", cat, scene)["failures"] == []
    scene.piece("isy-lamp").y -= 0.2
    fails = rules.piece_rule("fixtureSeat", cat, scene, ["isy-lamp"])["failures"]
    assert fails and "under the ground" in fails[0]


def test_fixture_seat_reads_a_deck_over_the_ground(cw, cat, no_compile):
    """A light seated on the ground under a deck is sunk into the deck: the
    surface is the highest within 0.6 m over its base (the landing's deck
    stands 0.27 m over the bank 34 % along land-dock1)."""
    from workbench import measure, pads
    scene = cw.view()
    a, b = rules._ends(cat, scene.piece("land-dock1"))
    x, z = a[0] + (b[0] - a[0]) * 0.34, a[1] + (b[1] - a[1]) * 0.34
    lamp = scene.add(Piece(uid="t-lamp", asset=scene.piece("isy-lamp").asset, x=x, z=z))
    lamp.role = {"layer": "light"}
    lamp.y = measure.seat(cat, pads.ground_for(cat, scene, None), lamp)["y"]
    out = rules.piece_rule("fixtureSeat", cat, scene, ["t-lamp"])
    assert out["pieces"]["t-lamp"]["on"] == "land-dock1"
    assert out["failures"] and "under the land-dock1 surface" in out["failures"][0]
    lamp.y += out["pieces"]["t-lamp"]["surfaceM"] - out["pieces"]["t-lamp"]["baseM"]
    assert rules.piece_rule("fixtureSeat", cat, scene, ["t-lamp"])["failures"] == []


# ---------------------------------------------------------------- signRule arms

def test_sign_fails_two_level_parallel_arms_at_the_well(cw, cat):
    out = rules.piece_rule("sign", cat, cw.view())
    text = " | ".join(out["failures"])
    assert "0.00 m apart in height" in text and "point the same way" in text
    dests = {d["to"]: d["bearingDeg"] for d in out["posts"]["p1"]["destinations"]}
    assert dests["place.imperial-fringe.gideon"] == pytest.approx(135.0, abs=5)
    assert dests["route.road.gideon-blackwood-road"] == pytest.approx(315.0, abs=5)


def test_sign_passes_arms_apart_and_pointing_their_ways(cw, cat):
    scene = cw.view()
    post = scene.piece("p1")
    a, b = scene.piece("p1-board"), scene.piece("p1-board2")
    wb.designer_yaw(a, post, 225.0)          # tip +x: 225 + 90 = 315, toward Blackwood
    wb.designer_yaw(b, post, 45.0)           # 135, toward Gideon
    b.y += 0.3
    fails = [f for f in rules.piece_rule("sign", cat, scene)["failures"] if f.startswith("p1")]
    assert not any("apart in height" in f or "same way" in f or "leaves at" in f for f in fails), fails


def test_board_tip_is_the_mesh_point_not_the_handedness(cw, cat):
    """Walk-4 SIGN lane: roadsignmedium01l and 01r differ only in which side
    of the post they hang (mesh y +0.12..0.15 against -0.15..-0.12); both
    tips are the mesh's +x point (x 0.585, height span 0.00 m against
    0.27 m at the post end). So the same yaw points both the same way and
    yaws 225/45 point 315/135 (headless Blender on the round-16 scene: far
    corners 301/149, the tip 0.13 m off the post axis)."""
    scene = cw.view()
    a, b = scene.piece("p1-board"), scene.piece("p1-board2")
    assert a.asset.endswith("01l") and b.asset.endswith("01r")
    a.yaw = b.yaw = 45.0
    assert rules.board_tip_bearing(cat, a) == pytest.approx(135.0)
    assert rules.board_tip_bearing(cat, b) == pytest.approx(135.0)
    a.yaw, b.yaw = 225.0, 45.0
    assert rules.board_tip_bearing(cat, a) == pytest.approx(315.0)
    assert rules.board_tip_bearing(cat, b) == pytest.approx(135.0)


# ---------------------------------------------------------------- wb.py bpy

@pytest.mark.skipif(not paths.LINUX_BLENDER.exists(), reason="no Linux Blender")
def test_bpy_runs_a_script_on_the_whole_scene(gs, cat, tmp_path):
    from workbench import bpy_run
    out = tmp_path / "bpy.json"
    got = bpy_run.run(cat, gs, HERE.parent / "blender" / "examples" / "branch_survey.py", out,
                      ["hist", "sh-candle1"], None)
    r = got["result"]
    assert r["pieces"] == len([p for p in gs.pieces if p.y is not None and cat.raw_glb(p.asset)])
    assert r["branches"] and r["contact"]["gapM"] <= 0.05
    assert json.loads(out.read_text())["result"]["tree"] == "hist"


def test_the_host_frame_class_names_every_hist_flower(gs):
    """WB rec 4: histflower01/02 and their -sick forms are authored in the Hist
    tree's frame (mesh 5.85/6.01 m over the pivot); the rule names `attach`."""
    cat = wb.place_catalogue(gs.placeId)
    for v in ("histflower01", "histflower01-sick", "histflower02", "histflower02-sick"):
        why = seat_rules.hanging_class(cat, f"histtree:skyfall/sleeping tree overhaul/{v}")
        assert why and why.startswith("authored in its host's frame"), v
    fails = rules.piece_rule("hanging", cat, gs.view(), ["sh-flower1"])["failures"]
    assert fails and "histflower02-sick" in fails[0] and "attach it at its host's pivot" in fails[0]


def test_the_unmined_plan_cap_spares_a_hanging_piece(cat):
    """WB rec 5 (planner confirmed): histflower01 is 1.16 m across, over the
    0.6 m unmined plan cap, and hangs with its render-round approval."""
    assert snap.unmined_refusal(cat, FLOWER, 1.0, APPROVED, hanging=True) is None
    assert snap.unmined_refusal(cat, FLOWER, 1.0, APPROVED) is not None


# ---------------------------------------------------------------- rockSeatRule (CLAYWATER2)

CAIRN = "histtree:skyfall/sleeping tree overhaul/rockcairn03"


def test_a_rim_stone_seats_on_its_lowest_three_contacts(gs, cat):
    """Planner ruling 5 (0075 rock seating): a cairn on the Greenspring bank
    passes at rock_seat_y (three spread contacts), fails 0.2 m higher (too few
    contacts) and fails 0.4 m lower (embedded past 0.3 m); its fit's slope
    and delta rules no longer apply (layout.check_failure_rows)."""
    from workbench import layout
    scene = gs.view()
    g = rules._ground(cat, scene)
    stone = scene.add(Piece(uid="rim-x", asset=CAIRN, x=4717.93, z=1868.81, yaw=20.0))
    stone.y = float(g.chunk_height(stone.x, stone.z)) + 1.0
    stone.y = seat_rules.rock_seat_y(cat, g, stone)
    assert rules.piece_rule("rockSeat", cat, scene, ["rim-x"])["failures"] == []
    seat = stone.y
    stone.y = seat + 0.2
    assert "fewer than 3 contacts" in " ".join(
        rules.piece_rule("rockSeat", cat, scene, ["rim-x"])["failures"])
    stone.y = seat - 0.4
    assert "embedded" in " ".join(rules.piece_rule("rockSeat", cat, scene, ["rim-x"])["failures"])
    rows = layout.check_failure_rows({"pieces": {"rim-x": {
        "asset": CAIRN.rsplit("/", 1)[-1], "slopeRule": "4.3 deg > 2.0", "deltaRule": "0.5 m",
        "anchorClass": "ground", "footFloatMaxM": 0.4}}, "nearPairs": [], "doors": {}})
    assert not [r for r in rows if r["rule"] in ("slopeRule", "deltaRule", "footFloat")]


def test_a_stand_over_its_cook_fire_is_a_plugin_abut():
    """Planner ruling 3: cookingstand01 over campfire01burning is a pair the
    plugins place touching (mounts anchor abuts), so its crossing passes."""
    assert wb.plugin_abut_n("vanilla:clutter/woodfires/cookingstand01",
                            "vanilla:clutter/woodfires/campfire01burning") >= 1
    assert wb.plugin_abut_n("vanilla:clutter/woodfires/cookingstand01", CAIRN) == 0


def test_the_brazier_flame_mounts_at_its_plugin_scale(cw, cat):
    """Planner ruling 2: the mined pair (impbrazier01, band n 116) seats the
    flame 0.318 m over the brazier pivot at 0.8 of its scale."""
    scene = cw.view()
    brazier = scene.piece("isy-fire")
    flame = scene.add(Piece(uid="flame-x", asset="vanilla:effects/fxfirewithembers01",
                            x=brazier.x, z=brazier.z))
    pair = snap.mount(flame, brazier)["pair"]
    assert pair["childScaleInParent"] == pytest.approx(0.8)
    assert flame.scale == pytest.approx(0.8 * brazier.scale)
    assert flame.y - brazier.y == pytest.approx(0.318, abs=0.01)
