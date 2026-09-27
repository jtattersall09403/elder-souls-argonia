"""The speed lane's workbench mechanisms (owner 2026-09-27): the op cache
restores exactly what a full apply derives, a one-op edit re-derives only
what depends on it, the pooled check returns the serial check key for key,
the round summary groups every failure, and the scan grid and ranking."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import wb  # noqa: E402
from workbench import layout, opcache, parallel, paths, scan  # noqa: E402

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "yard-b.layout.json"
local = pytest.mark.skipif(not paths.RAW_KITS.exists(), reason="needs the raw kit builds")


def _state(scene_path: Path) -> str:
    doc = json.loads(scene_path.read_text())
    return json.dumps({k: doc[k] for k in ("pieces", "paths", "log")}, sort_keys=True)


def test_pool_returns_results_in_task_order():
    tasks = [(pow, (k, 2)) for k in range(9)]
    assert parallel.run(tasks, 3) == [k * k for k in range(9)]
    assert parallel.run(tasks, 1) == [k * k for k in range(9)]
    assert parallel.chunks(list(range(7)), 3) == [[0, 1, 2], [3, 4], [5, 6]]
    assert 0 not in parallel.cores() or parallel.cores() == [0]


def test_failure_rows_are_check_failures_with_rule_and_uids():
    check = {"pieces": {
        "a": {"slopeRule": "too steep", "anchorClass": "ground", "footFloatMaxM": 0.5},
        "b": {"anchorClass": "water", "hullWater": {"ok": False, "minDepthM": 0.4}},
        "c": {"anchorClass": "ground", "footFloatMaxM": 0.1, "sillRule": "off"}},
        "nearPairs": [{"a": "a", "b": "c", "relation": "unrelated", "ok": False, "gapM": 0.0,
                       "penetrationM": 0.2, "intersecting": True}],
        "doors": {"c": {"best": {"pathDistanceM": 6.0}}},
        "sill": {"failures": ["door:c.1: sill 0.40 m stands +0.40 m off"]},
        "walk": {"failures": ["socket:x: unreached"]}}
    rows = layout.check_failure_rows(check)
    assert [r["text"] for r in rows] == layout.check_failures(check)
    by = {r["rule"]: r["uids"] for r in rows}
    assert by["slopeRule"] == ["a"] and by["yardSillRule"] == ["c"]
    assert by["unrelatedPair"] == ["a", "c"] and by["sillRule"] == ["c"] and by["walkRule"] == []
    assert set(by) <= set(layout.FIX_HINTS)
    summary = wb.round_summary({"check": {"full": check}, "compile": {"exitCode": 0}})
    assert summary["failures"] == len(rows) and summary["byRule"]["footFloat"]["count"] == 1
    assert summary["byRule"]["walkRule"]["uids"] == ["(place)"] and "c" in summary["byUid"]


def test_edit_sets_and_unsets_an_op_by_piece_id(tmp_path):
    f = tmp_path / "l.json"
    doc = {"schemaVersion": 1, "placeId": "p", "window": {}, "ops": [
        {"op": "place", "uid": "b1", "asset": "a", "at": [1.0, 2.0], "pad": {"apronM": 1.0}},
        {"op": "bind", "uid": "b1", "kind": "parcel", "id": "parcel.x"}]}
    f.write_text(json.dumps(doc, indent=1))
    got = wb.edit_layout(f, "b1", None, ["at=[3.5, 2]", "pad.apronM=1.5", "yaw=90"], ["settle"])
    assert got["index"] == 0 and got["otherOpsNamingIt"] == [1]
    op = json.loads(f.read_text())["ops"][0]
    assert op["at"] == [3.5, 2] and op["pad"] == {"apronM": 1.5} and op["yaw"] == 90
    assert not f.read_text().endswith("\n")          # the file's own form kept
    wb.edit_layout(f, "b1", "bind", ["id=parcel.y"], [])
    assert json.loads(f.read_text())["ops"][1]["id"] == "parcel.y"
    with pytest.raises(ValueError):
        wb.edit_layout(f, "nobody", None, ["x=1"], [])


def test_scan_grid_is_the_disc_times_the_yaws():
    got = scan.grid({"centre": [0.0, 0.0], "radius": 2.0, "step": 1.0, "yawStep": 90})
    assert len(got) == 13 * 4 and (0.0, 0.0, 270.0) in got and (2.0, 0.0, 0.0) in got


@pytest.fixture(scope="module")
def applied(tmp_path_factory):
    """Yard B applied full, again from the cache, then edited by one op
    (a prop moved 0.3 m) both from the cache and full, in a scratch OUTPUT."""
    tmp = tmp_path_factory.mktemp("speed")
    old = paths.OUTPUT
    paths.OUTPUT = tmp
    try:
        full = wb.apply_layout(FIXTURE, "speed-a", compile_=False, full=True)
        cached = wb.apply_layout(FIXTURE, "speed-a", compile_=False)
        doc = json.loads(FIXTURE.read_text())
        i = max(k for k, o in enumerate(doc["ops"]) if o["op"] == "place" and o.get("settle"))
        doc["ops"][i]["at"][0] += 0.3
        edited = tmp / "edited.layout.json"
        edited.write_text(json.dumps(doc))
        inc = wb.apply_layout(edited, "speed-a", compile_=False)
        scene_inc = _state(tmp / "scenes" / "speed-a.json")
        ref = wb.apply_layout(edited, "speed-b", compile_=False, full=True)
        scene_ref = _state(tmp / "scenes" / "speed-b.json")
    finally:
        paths.OUTPUT = old
    return {"full": full, "cached": cached, "inc": inc, "ref": ref,
            "scene_inc": scene_inc, "scene_ref": scene_ref, "tmp": tmp}


@local
def test_the_op_cache_restores_what_a_full_apply_derives(applied):
    f, c = applied["full"], applied["cached"]
    assert c["opCache"]["restored"] == c["opsTotal"] and c["opCache"]["derived"] == 0
    assert json.dumps(f["check"]["full"], sort_keys=True) == json.dumps(c["check"]["full"],
                                                                         sort_keys=True)
    assert c["check"]["pool"]["pairsRestored"] == c["check"]["pool"]["pairs"]


@local
def test_a_one_op_edit_re_derives_only_what_depends_on_it(applied):
    inc, ref = applied["inc"], applied["ref"]
    assert applied["scene_inc"] == applied["scene_ref"]
    assert json.dumps(inc["check"]["full"], sort_keys=True) == json.dumps(ref["check"]["full"],
                                                                           sort_keys=True)
    assert 1 <= inc["opCache"]["derived"] < inc["opsTotal"] // 2


@local
def test_inserted_removed_and_path_edits_replay_as_a_full_apply(tmp_path, monkeypatch):
    """An op inserted before unchanged ops, then removed again, and a path
    edited before an unchanged path op: the cached apply is the full one
    (review 2026-09-27: a cached op carries only its own delta)."""
    monkeypatch.setattr(paths, "OUTPUT", tmp_path)
    base = json.loads(FIXTURE.read_text())
    last = max(k for k, o in enumerate(base["ops"]) if o["op"] == "place" and o.get("settle"))
    extra = {**base["ops"][last], "uid": "speed-extra"}
    extra["at"] = [extra["at"][0] + 1.5, extra["at"][1]]
    first_path = next(k for k, o in enumerate(base["ops"]) if o["op"] == "path")
    inserted = {**base, "ops": base["ops"][:1] + [extra] + base["ops"][1:]}
    moved = json.loads(json.dumps(base))
    moved["ops"][first_path]["points"][0][1] += 1.0
    wb.apply_layout(FIXTURE, "speed-c", compile_=False)
    for k, doc in enumerate((inserted, base, moved)):
        f = tmp_path / f"v{k}.layout.json"
        f.write_text(json.dumps(doc))
        inc = wb.apply_layout(f, "speed-c", compile_=False)
        wb.apply_layout(f, f"speed-ref{k}", compile_=False, full=True)
        assert _state(tmp_path / "scenes" / "speed-c.json") == \
            _state(tmp_path / "scenes" / f"speed-ref{k}.json"), k
        assert inc["opCache"]["restored"] > 0, (k, inc["opCache"])


@local
def test_the_pooled_check_is_the_serial_check(applied):
    from workbench.scene import Scene
    scene = Scene.load(applied["tmp"] / "scenes" / "speed-b.json")
    cat = wb.place_catalogue(scene.placeId)
    serial = wb.check_scene(cat, scene, serial=True, use_cache=False)
    pooled = wb.check_scene(cat, scene, use_cache=False)
    assert json.dumps(serial, sort_keys=True) == json.dumps(pooled, sort_keys=True)
