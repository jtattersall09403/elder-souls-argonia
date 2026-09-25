"""Whole-layout authoring (decision 0100 decisions 2, 3 and 6): `apply`,
`replay`, the render round, export provenance.

The first block needs only the parser (fast, CI-safe). The second needs the
raw kit builds and the published province rasters (local, like the other
workbench tests): the golden round trip on the yard-B layout
(`fixtures/yard-b.layout.json`), provenance and the stale-ground refusal,
and the render round with the Blender subprocess mocked.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import layout, paths  # noqa: E402

FIXTURE = HERE.parent / "fixtures" / "yard-b.layout.json"
YARD_B_SCENE = paths.OUTPUT / "scenes" / "yard-b.json"
SPACED = "htbm:here there be monsters - curse of cipactli/architecture/villages/kothringi/tamu_wooddock01"
local = pytest.mark.skipif(not paths.RAW_KITS.exists(), reason="raw kit builds absent")
# yard B's scene was seated before a kit record changed under this piece:
# settlement-stilt-v1 was rebuilt in cbf94703 (the bamboo hut fix) after the
# log's last `move mud --resettle`, so today's seat is 2.9 mm lower on the
# same (byte-identical) ground. Only y, only this piece.
KIT_DRIFT_Y_M = {"mud": 0.005}


# ---------------------------------------------------------------- parser only
def test_op_round_trips_through_the_cli_names():
    ap = wb.parser()
    ops = [
        {"op": "place", "uid": "bw1", "asset": SPACED, "at": [4372.0, 6032.0], "yaw": 15.0,
         "settle": True},
        {"op": "snap", "child": "bw2", "child_face": "east", "parent": "bw1",
         "parent_face": "east", "by": "evidence", "pick": 1, "settle": True},
        {"op": "mount", "child": "sign", "parent": "post", "along": 0.5},
        {"op": "group", "action": "place", "name": "hut", "at": [1.0, 2.0], "prefix": "b2-"},
        {"op": "path", "action": "add", "id": "route.x.way", "points": [[1.0, 2.0], [3.0, 4.5]],
         "width": 4.3, "kind": "road"},
        {"op": "bind", "uid": "roof", "kind": "assembly", "id": "parcel.x.house",
         "layer": "roof", "on": "parent", "evidence": "measured"},
        {"op": "note", "uid": "bw1", "text": "a note with spaces"},
    ]
    for op in ops:
        assert layout.argv_to_op(layout.op_to_argv(op, ap), ap) == op


def test_op_aliases_and_refusals():
    ap = wb.parser()
    assert layout.op_to_argv({"op": "path add", "id": "r", "points": [[1, 2], [3, 4]]}, ap)[:3] \
        == ["path", "add", "r"]
    with pytest.raises(ValueError, match="not a layout op"):
        layout.op_to_argv({"op": "check"}, ap)
    with pytest.raises(ValueError, match="unknown argument"):
        layout.op_to_argv({"op": "remove", "uid": "a", "at": [1, 2]}, ap)
    with pytest.raises(ValueError, match="needs 'asset'"):
        layout.op_to_argv({"op": "place", "uid": "a", "at": [1, 2]}, ap)


def test_legacy_log_line_rejoins_a_spaced_asset_and_new_lines_are_shlex():
    line = f"place bw2 {SPACED} --at 4375 6032"
    assert layout.log_tokens(line) == ["place", "bw2", SPACED, "--at", "4375", "6032"]
    assert layout.log_tokens("note bw1 moved it off the road") == \
        ["note", "bw1", "moved it off the road"]
    import shlex
    tokens = ["place", "bw2", SPACED, "--at", "1.5", "2.0"]
    assert layout.log_tokens(shlex.join(tokens)) == tokens
    assert layout.log_tokens("note bw1 it's off the road") == ["note", "bw1", "it's off the road"]
    assert layout.log_tokens(shlex.join(["note", "bw1", "it's off"])) == ["note", "bw1", "it's off"]


def test_a_trial_piece_placed_and_removed_is_dropped_unless_another_read_it():
    ops = [{"op": "place", "uid": "d1", "asset": "a", "at": [0, 0]},
           {"op": "snap", "child": "d1", "child_face": "west", "parent": "gate",
            "parent_face": "east"},
           {"op": "remove", "uid": "d1"},
           {"op": "place", "uid": "d1", "asset": "b", "at": [0, 0]}]
    assert layout.drop_removed(ops) == ops[3:]
    read = [ops[0], {"op": "snap", "child": "x", "child_face": "west", "parent": "d1",
                     "parent_face": "east"}, ops[2]]
    assert layout.drop_removed(read) == read


def test_check_failures_name_every_bar():
    check = {"pieces": {
        "a": {"slopeRule": "too steep", "anchorClass": "ground", "footFloatMaxM": 0.5},
        "b": {"anchorClass": "water", "hullWater": {"ok": False, "minDepthM": 0.4}},
        "c": {"anchorClass": "ground", "footFloatMaxM": 0.1}},
        "nearPairs": [{"a": "a", "b": "c", "relation": "unrelated", "ok": False, "gapM": 0.0,
                       "penetrationM": 0.2, "intersecting": True}],
        "doors": {"c": {"best": {"pathDistanceM": 6.0}}}}
    got = layout.check_failures(check)
    assert len(got) == 5
    assert any("too steep" in g for g in got) and any("floats" in g for g in got)
    assert any("hull water" in g for g in got) and any("a~c" in g for g in got)
    assert any("from a way" in g for g in got)


def test_digest_stays_within_twenty_lines():
    summary = {"placeId": "p", "opsRun": 3, "opsTotal": 3, "elapsedS": 1.0, "groundReused": True,
               "groundS": 0.1, "scene": "s", "failed": None, "summaryPath": "x",
               "ops": [{"index": i, "warnings": ["w"] * 5} for i in range(3)],
               "check": {"pieces": 1, "nearPairs": 0, "doors": 0, "failures": ["f"] * 30},
               "compile": {"exitCode": 1, "errors": [{"msg": "e"}] * 9, "warnings": [],
                           "s": 1.0, "summary": None}}
    assert len(wb.digest(summary)) <= 20


def test_fixture_layout_is_a_valid_layout():
    doc = layout.load(FIXTURE)
    ap = wb.parser()
    for op in doc["ops"]:
        layout.op_to_argv(op, ap)
    assert doc["placeId"] == "place.fixture.proving-ground-b"


# ------------------------------------------------------- local: kits + ground
def _poses(scene_path: Path) -> dict:
    return {p["uid"]: p for p in json.loads(scene_path.read_text())["pieces"]}


def _same(a: dict, b: dict, y_tol: dict | None = None) -> list[str]:
    bad = []
    for uid, p in a.items():
        q = b.get(uid)
        if q is None:
            bad.append(f"{uid}: missing")
            continue
        dyaw = abs((p["yaw"] - q["yaw"] + 180) % 360 - 180)
        dy = abs((p["y"] or 0.0) - (q["y"] or 0.0))
        if max(abs(p["x"] - q["x"]), abs(p["z"] - q["z"])) > 1e-3 or dyaw > 0.01 \
                or abs(p["pitch"] - q["pitch"]) > 0.01 or dy > (y_tol or {}).get(uid, 1e-3):
            bad.append(f"{uid}: ({p['x']:.3f},{p['z']:.3f},{p['y']},{p['yaw']}) != "
                       f"({q['x']:.3f},{q['z']:.3f},{q['y']},{q['yaw']})")
    return bad + [f"{u}: extra" for u in set(b) - set(a)]


@pytest.fixture(scope="module")
def applied(tmp_path_factory):
    """The fixture applied twice into a scratch OUTPUT (the real
    output/apply summary is untouched)."""
    tmp = tmp_path_factory.mktemp("apply")
    old = paths.OUTPUT
    paths.OUTPUT = tmp
    try:
        first = wb.apply_layout(FIXTURE, "golden-a", compile_=False)
        replayed = layout.replay(wb.Scene.load(layout.scene_path("golden-a")), wb.parser())
        (tmp / "replayed.layout.json").write_text(json.dumps(replayed))
        second = wb.apply_layout(tmp / "replayed.layout.json", "golden-b", compile_=False)
    finally:
        paths.OUTPUT = old
    return {"tmp": tmp, "first": first, "second": second, "replayed": replayed,
            "a": tmp / "scenes" / "golden-a.json", "b": tmp / "scenes" / "golden-b.json"}


@local
def test_apply_runs_every_op_and_writes_one_summary(applied):
    s = applied["first"]
    assert s["failed"] is None and s["opsRun"] == s["opsTotal"] == len(layout.load(FIXTURE)["ops"])
    assert s["layoutSha256"] == layout.sha256(FIXTURE) and Path(s["summaryPath"]).exists()
    assert s["check"]["pieces"] == 18


@local
def test_replay_of_an_applied_scene_is_the_layout_and_reapplies_identically(applied):
    assert applied["replayed"]["ops"] == layout.load(FIXTURE)["ops"]
    assert applied["replayed"]["window"] == layout.load(FIXTURE)["window"]
    assert _same(_poses(applied["a"]), _poses(applied["b"]), {}) == []


@local
@pytest.mark.skipif(not YARD_B_SCENE.exists(), reason="yard-b scene absent (gitignored)")
def test_golden_yard_b_layout_reproduces_the_yard_b_scene(applied):
    assert _same(_poses(YARD_B_SCENE), _poses(applied["a"]), KIT_DRIFT_Y_M) == []


@local
def test_a_failing_op_stops_the_apply_with_its_index(tmp_path, monkeypatch):
    doc = layout.load(FIXTURE)
    doc["ops"] = doc["ops"][:2] + [{"op": "move", "uid": "nosuch", "dx": 1.0}] + doc["ops"][2:]
    bad = tmp_path / "bad.layout.json"
    bad.write_text(json.dumps(doc))
    monkeypatch.setattr(paths, "OUTPUT", tmp_path)
    s = wb.apply_layout(bad, "bad", compile_=False)
    assert s["failed"]["index"] == 2 and "nosuch" in s["failed"]["error"]
    assert s["opsRun"] == 2 and "check" not in s


@local
def test_export_records_provenance_and_apply_refuses_stale_ground(applied, tmp_path,
                                                                  monkeypatch):
    from workbench import export, ground
    scene = wb.Scene.load(applied["a"])
    bp_src = paths.BLUEPRINTS / "place.fixture.proving-ground-b.json"
    bp = tmp_path / bp_src.name
    shutil.copy(bp_src, bp)
    export.export(scene, bp, write=True)
    got = json.loads(bp.read_text())["blueprint"]["authoredOn"]
    win = layout.load(FIXTURE)["window"]
    centre = (win["centreKm"][0] * 1000, win["centreKm"][1] * 1000)
    assert got["ground"]["sha256"] == ground.current_provenance(centre, win["halfM"])["sha256"]
    assert got["layout"] == {"path": "tooling/placement-workbench/fixtures/yard-b.layout.json",
                             "sha256": layout.sha256(FIXTURE)}
    assert got["wbSchemaVersion"] == 1
    kits = {wb.Catalogue().row(p.asset)["kit"] for p in scene.pieces}
    assert set(got["kits"]) == kits and all(len(h) == 64 for h in got["kits"].values())
    # the same ground: apply proceeds past the check
    monkeypatch.setattr(paths, "BLUEPRINTS", tmp_path)
    assert layout.stale_ground("place.fixture.proving-ground-b", win) is None
    # a chunk file changed under the authored place: refused, named
    doc = json.loads(bp.read_text())
    doc["blueprint"]["authoredOn"]["ground"]["sha256"] = "0" * 64
    first = sorted(doc["blueprint"]["authoredOn"]["ground"]["chunks"])[0]
    doc["blueprint"]["authoredOn"]["ground"]["chunks"][first] = "0" * 64
    bp.write_text(json.dumps(doc))
    monkeypatch.setattr(paths, "OUTPUT", tmp_path)
    s = wb.apply_layout(FIXTURE, "stale", compile_=False)
    assert "authored on other ground" in s["refused"] and first in s["refused"]
    assert not (tmp_path / "scenes" / "stale.json").exists()
    s = wb.apply_layout(FIXTURE, "stale", compile_=False, allow_stale_ground=True)
    assert s["failed"] is None


@local
def test_render_round_is_one_launch_with_a_manifest_and_no_leaked_work_dir(applied, tmp_path,
                                                                          monkeypatch):
    """Blender mocked: the job it would get is checked, blank PNGs stand in."""
    import subprocess
    from PIL import Image
    from workbench import render
    calls = []

    def fake_run(cmd, env=None, **_kw):
        job = json.loads(Path(env["JOB"]).read_text())
        calls.append(job)
        for shot in job["shots"]:
            Image.new("RGB", tuple(shot["res"]), "grey").save(shot["out"])
        return subprocess.CompletedProcess(cmd, 0, "[wb-render] done\n", "")

    monkeypatch.setattr(render.subprocess, "run", fake_run)
    monkeypatch.setattr(paths, "OUTPUT", tmp_path)
    scene = wb.Scene.load(applied["a"])
    cat = wb.Catalogue()
    out = render.render_round(cat, scene, "auto", res=256, samples=1)
    parcels = [p for p in scene.pieces if p.role.get("kind") == "parcel"]
    assert len(calls) == 1 and len(calls[0]["shots"]) == 1 + len(parcels) + 2
    manifest = json.loads(Path(out["manifest"]).read_text())
    views = [s["view"] for s in manifest["shots"]]
    assert views == ["top"] + ["front"] * len(parcels) + ["iso", "iso"]
    isos = [s["bearingDeg"] for s in manifest["shots"] if s["view"] == "iso"]
    assert abs((isos[0] - isos[1]) % 360 - 180) < 1e-6
    # the house front looks AT its best doorway (the door record `check` gives)
    house = next(s for s in manifest["shots"] if s["view"] == "front" and s["focus"][0] == "house")
    assert house["bearingDeg"] == pytest.approx((house["doorFacingDeg"] + 180) % 360, abs=0.1)
    assert all(Path(s["png"]).exists() for s in manifest["shots"])
    assert not list(tmp_path.glob("wb-render-*"))
    assert Path(out["dir"]).name == "round-1"
    again = render.render_round(cat, scene, "top,iso:90", res=128, samples=1)
    assert Path(again["dir"]).name == "round-2" and len(calls[1]["shots"]) == 2
