"""16k r8 rule 5 (r7 rule 6): the dressing ring stands in the scene.

`apply` compiles first, keeps the compiled settlement, loads its dressing
placements as ring pieces, then runs `check`; `export` never writes a ring
piece back; a ring container's socket is a walkRule target with the
compile's own id (`sockets.fill_socket_id`), so behind a wall it fails."""
from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import export, layout, measure, paths, rules  # noqa: E402
from workbench.scene import Piece, Scene  # noqa: E402

BP = "place.x"
BARREL = "vanilla:clutter/barrel01"
WALL = "vanilla:architecture/farmhouse/stonewall/stonewall01"


def _settlement(x=10.0, z=20.0) -> dict:
    return {"id": BP, "placements": [
        {"id": f"{BP}.parcel.a.building", "objectKind": "parcel", "assetId": "a",
         "positionM": [0.0, 1.0, 0.0], "yawDeg": 0.0},
        {"id": f"{BP}.parcel.a.dressing.1", "objectKind": "dressing", "parcelId": "parcel.a",
         "assetId": BARREL, "positionM": [x, 3.5, z], "yawDeg": 71.0, "scale": 1.0}]}


def test_the_ring_loads_as_ring_pieces_and_replaces_the_last_ring(tmp_path):
    scene = Scene(path=tmp_path / "s.json", placeId=BP)
    assert wb.load_ring(scene, _settlement()) == ["ring:parcel.a.dressing.1"]
    p = scene.piece("ring:parcel.a.dressing.1")
    assert (p.asset, p.x, p.z, p.y, p.yaw) == (BARREL, 10.0, 20.0, 3.5, 71.0)
    assert p.role == {"kind": "ring", "placementId": f"{BP}.parcel.a.dressing.1",
                      "parcel": "parcel.a"}
    wb.load_ring(scene, _settlement(x=11.0))           # a second apply: no duplicate
    assert [q.x for q in scene.pieces] == [11.0]


def test_export_never_writes_a_ring_piece(tmp_path):
    scene = Scene(path=tmp_path / "s.json", placeId=BP)
    wb.load_ring(scene, _settlement())
    scene.pieces[0].roll = 5.0                          # would refuse any exported piece
    assert export.poses(scene, 1000.0) == {"parcels": {}, "landmarks": {}, "routes": {}}


def test_compile_scene_keeps_the_compiled_settlement(tmp_path, monkeypatch):
    src = tmp_path / f"{BP}.json"
    src.write_text(json.dumps({"blueprint": {"id": BP}}))
    keep_out = tmp_path / "compiled"

    def fake(cmd, **_k):
        if "worldgen.compile_settlement" in cmd:
            out = Path(cmd[cmd.index("--out") + 1])
            (out / f"{BP}.settlement.json").write_text(json.dumps(_settlement()))
        return subprocess.CompletedProcess(cmd, 0, "", "")
    monkeypatch.setattr(subprocess, "run", fake)
    monkeypatch.setattr(export, "export", lambda *a, **k: {})
    got = wb.compile_scene(Scene(path=tmp_path / "s.json", placeId=BP), src, keep_out=keep_out)
    assert got["settlement"] == str(keep_out / f"{BP}.settlement.json")
    assert json.loads(Path(got["settlement"]).read_text())["id"] == BP


# --------------------------------------------------------------------------- #
# on the real Claywater scene (local only: raw kit builds and the ground window)
# --------------------------------------------------------------------------- #
LAYOUT = paths.BLUEPRINTS / "claywater-station.layout.json"
SCENE = paths.OUTPUT / "scenes" / "imperial-fringe-claywater-station-layout.json"


@pytest.fixture(scope="module")
def cat():
    from workbench.kits import Catalogue
    return Catalogue()


@pytest.fixture(scope="module")
def base(tmp_path_factory):
    if SCENE.exists():
        s = Scene.load(SCENE)
        if (s.layout or {}).get("sha256") == layout.sha256(LAYOUT):
            return s
    path = tmp_path_factory.mktemp("cw") / "claywater.json"
    got = wb.apply_layout(LAYOUT, str(path), compile_=False)
    assert got.get("failed") is None, got.get("failed")
    return Scene.load(path)


def test_a_ring_container_fails_reach_behind_a_wall(cat, base, tmp_path):
    scene = copy.deepcopy(base)
    scene.path = tmp_path / "scene.json"
    scene.__dict__.pop("_padMemo", None)
    for q in [q for q in scene.pieces if (q.role or {}).get("kind") == "ring"]:
        scene.remove(q.uid)
    chair = scene.piece("ahy-chair")                    # a spot walkRule reaches (0102 test)
    ring = _settlement(chair.x + 1.2, chair.z)
    ring["id"] = scene.placeId
    for p in ring["placements"]:
        p["id"] = p["id"].replace(BP, scene.placeId)
    uid, = wb.load_ring(scene, {**ring, "placements": ring["placements"][1:]})
    barrel = scene.piece(uid)
    barrel.y = measure.seat(cat, scene.ground(), barrel)["y"]
    sid = "socket:fill.parcel.a.dressing.1"            # the compile's id (fill_socket_id)
    t = next(t for t in rules.walk(cat, scene)["targets"] if t["uid"] == uid)
    assert t["id"] == sid and t["ok"], t
    for k, (dx, dz, yaw) in enumerate(((0, 2.3, 0), (0, -2.3, 0), (2.3, 0, 90), (-2.3, 0, 90))):
        wall = scene.add(Piece(f"box{k}", WALL, barrel.x + dx, barrel.z + dz, yaw))
        wall.y = measure.seat(cat, scene.ground(), wall)["y"]
    got = rules.walk(cat, scene)
    t = next(t for t in got["targets"] if t["uid"] == uid)
    assert not t["ok"] and "no route from the terminal" in t["reason"], t
    assert any(f.startswith(f"{uid}: walk to its container socket fill.parcel.a.dressing.1")
               for f in got["failures"])
