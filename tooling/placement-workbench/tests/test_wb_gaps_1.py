"""16k walk 2 workbench gaps (wb-gaps-1, from P-final.md and round-2
waiting-on.json): (1) a piled deck's walk box is its mesh's plan bounds, not
the footprint rectangle, on the two Claywater landing docks; (2) `scan`
lays a snapped pair (the stable's stall halves st1 + st2) as one candidate;
(3) `round --report-dir` writes one ledger row per round; (4) a bare scene
name resolves under output/scenes/ for every command, a missing one is an
error. Each was written failing first against the code before the fix.
Local only: the scene needs the raw kit builds and the frozen ground window."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import layout, measure, pads, paths, rules  # noqa: E402
from workbench.scene import Piece, Scene  # noqa: E402

LAYOUT = HERE.parent / "fixtures" / "claywater-walk2.layout.json"
PLACE = "place.imperial-fringe.claywater-station"
DOCK = "vanilla:architecture/docks/dockstrent02"
STALL_L = ("mwkeep:tesak1243/mwimperialarchitecture/architecture/keep/exterior/stables/"
           "mwimparchstableendl01")
STALL_R = ("mwkeep:tesak1243/mwimperialarchitecture/architecture/keep/exterior/stables/"
           "mwimparchstableendr01")


@pytest.fixture(scope="module")
def cat():
    return wb.place_catalogue(PLACE)


@pytest.fixture
def scene(applied_layout, cat):
    s = applied_layout(LAYOUT)
    pads.ground_for(cat, s, None)
    return s.view()


def _docks(cat, scene):
    """The two landing docks as the round-2 layout lays them (land-dock1
    placed, land-dock2 snapped to it by the mined run joint, pick 3)."""
    a = Piece("land-dock1", DOCK, 336.76, 3001.89, 116.7)
    b = Piece("land-dock2", DOCK, 343.22779818713735, 3005.23251202099, 116.7)
    g = pads.ground_for(cat, scene, None)
    for p in (a, b):
        p.y = measure.seat(cat, g, p)["y"]
        p.walkable = True
        scene.add(p)
    return a, b, g


def test_piled_deck_walk_box_is_the_mesh_plan_box_across_the_dock_joint(scene, cat):
    """dockstrent02: footprint 6.3 m long, mesh 7.74 m; the two docks' meshes
    overlap at the joint, but the footprint boxes left a 0.98 m hole that
    read the water below (32.3 m against a 35.59 m deck)."""
    a, b, g = _docks(cat, scene)
    assert measure.contact(cat, a, b)["gapM"] <= 0.0             # the meshes meet
    deck = rules._piled_deck_y(cat, a)
    ts = np.linspace(0.0, 1.0, 41)
    line = [(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) for t in ts]
    got = [rules._surface_m(cat, scene, g, x, z) for x, z in line]
    assert min(got) == pytest.approx(deck, abs=1e-6), got
    grid = rules.WalkGrid(cat, scene)
    for x, z in line:
        c = grid.cell(x, z)
        assert grid.H[c] == pytest.approx(deck, abs=1e-6), (x, z)
        assert not grid.deep[c], (x, z)


def test_scan_lays_a_snapped_pair_as_one_candidate(scene, cat):
    """st1 + st2 (the stall halves, st2 snapped west face to st1's east by
    geometry, as the layout does): one candidate lays both, where the
    layout's snap op put st2."""
    from workbench import scan, snap
    spec = {"id": "stall", "asset": STALL_L, "centre": [375.0, 3098.0], "radius": 0.0,
            "step": 1.0, "yaws": [120.0], "skip": ["st1", "st2"], "verify": 1,
            "pair": {"asset": STALL_R, "childFace": "west", "parentFace": "east",
                     "by": "geometry"}}
    members = scan._members(cat, {**spec, "_join": scan.pair_join(cat, spec)}, 375.0, 3098.0, 120.0)
    assert [m.asset for m in members] == [STALL_L, STALL_R]
    # the same join the `snap` op makes on the anchor at this pose
    parent = Piece("p", STALL_L, 375.0, 3098.0, 120.0, scale=cat.placed_scale(STALL_L))
    parent.y = 35.0
    child = Piece("c", STALL_R, 376.3, 3098.05, 90.0, scale=cat.placed_scale(STALL_R))
    snap.snap_geometry(cat, child, parent, snap.face("west"), snap.face("east"))
    assert (members[1].x, members[1].z) == pytest.approx((child.x, child.z), abs=0.01)
    assert members[1].yaw == pytest.approx(child.yaw % 360.0, abs=0.01)
    got = scan.scan(cat, scene, {"buildings": [spec]}, lambda c, g, p: {"ok": True},
                    serial=True)["buildings"][0]
    assert got["pair"]["asset"] == STALL_R and got["measured"] == 1
    single = scan.scan(cat, scene, {"buildings": [{k: v for k, v in spec.items() if k != "pair"}]},
                       lambda c, g, p: {"ok": True}, serial=True)["buildings"][0]
    # the pair's outline is the union: at least the anchor's own road paint
    assert got["top"][0]["roadPaintM2"] >= single["top"][0]["roadPaintM2"]
    assert got["verified"] == [] or len(got["verified"][0]["uids"]) == 2


def test_round_report_dir_gets_one_ledger_row_per_round(tmp_path, monkeypatch):
    """Two rounds on one scene, each into its own report folder: each folder's
    rounds.jsonl holds that round's row only (round 2's copy once repeated
    round 1's, so the ledger double counted)."""
    monkeypatch.setattr(paths, "OUTPUT", tmp_path / "out")
    lay = tmp_path / "l.layout.json"
    lay.write_text(json.dumps({"schemaVersion": layout.SCHEMA_VERSION, "placeId": PLACE,
                               "window": {}, "ops": []}))
    monkeypatch.setattr(wb, "place_catalogue", lambda place: None)
    monkeypatch.setattr(wb, "apply_layout", lambda *a, **k: {"refused": "test"})
    for n in (1, 2):
        wb.run_round(["gaps-scene", str(lay), "--no-shots", "--report-dir",
                      str(tmp_path / f"round-{n}")])
    assert len((paths.OUTPUT / "apply" / "gaps-scene" / "rounds.jsonl")
               .read_text().splitlines()) == 2
    for n in (1, 2):
        assert len((tmp_path / f"round-{n}" / "rounds.jsonl").read_text().splitlines()) == 1
        assert (tmp_path / f"round-{n}" / "summary.json").exists()


def test_a_bare_scene_name_resolves_under_output_scenes(tmp_path, monkeypatch, capsys):
    """`wb.py NAME list` reads output/scenes/NAME.json; a missing NAME is an
    error that writes nothing (it once opened an empty scene in the cwd)."""
    monkeypatch.setattr(paths, "OUTPUT", tmp_path / "out")
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    monkeypatch.chdir(cwd)
    s = Scene(path=paths.OUTPUT / "scenes" / "gaps.json", placeId="")
    s.add(Piece("only", STALL_L, 1.0, 2.0, 0.0))
    s.save()
    monkeypatch.setattr(wb, "place_catalogue", lambda place: None)
    assert wb.main(["gaps", "list"]) == 0
    assert "only" in capsys.readouterr().out
    with pytest.raises(SystemExit):
        wb.main(["no-such-scene", "note", "x", "y"])
    assert os.listdir(cwd) == []
    assert not (paths.OUTPUT / "scenes" / "no-such-scene.json").exists()
