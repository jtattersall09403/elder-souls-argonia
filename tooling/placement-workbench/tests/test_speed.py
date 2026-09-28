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
from workbench import layout, opcache, parallel, paths, rules, scan  # noqa: E402

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
    assert set(by) <= set(rules.FIX_HINTS)
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


# ------------------------------------------------------------ speed lane 3B
def test_the_pool_takes_the_job_slot_share(monkeypatch):
    """Method review C1: under job_guard the pool is the slot's share
    (ES_JOB_CORES), never one worker per pool core; WB_WORKERS overrides."""
    monkeypatch.delenv("WB_WORKERS", raising=False)
    monkeypatch.delenv("PYTEST_XDIST_WORKER", raising=False)
    monkeypatch.setenv("ES_JOB_CORES", "2")
    monkeypatch.setattr(parallel, "idle_cores", lambda: 1)
    assert parallel.workers() == 2                         # the share is the floor
    monkeypatch.setattr(parallel, "idle_cores", lambda: 5)
    assert parallel.workers() == 5                         # idle pool cores above it (L8 rec 1)
    monkeypatch.setattr(parallel, "idle_cores", lambda: 9)
    assert parallel.workers() == parallel.MAX_WORKERS
    # two xdist workers in a 2-core slot: one pool worker each, not two
    monkeypatch.setenv("PYTEST_XDIST_WORKER", "gw0")
    monkeypatch.setenv("PYTEST_XDIST_WORKER_COUNT", "2")
    assert parallel.workers() == 1
    monkeypatch.delenv("PYTEST_XDIST_WORKER")
    monkeypatch.setenv("WB_WORKERS", "3")
    assert parallel.workers() == 3
    monkeypatch.delenv("WB_WORKERS")
    monkeypatch.delenv("ES_JOB_CORES")
    assert parallel.workers() == max(1, min(parallel.MAX_WORKERS, len(parallel.cores())))


def test_idle_cores_counts_pool_cores_from_proc_stat(monkeypatch):
    samples = iter([{1: (0, 0), 2: (0, 0), 3: (0, 0)}, {1: (90, 100), 2: (10, 100), 3: (50, 100)}])
    monkeypatch.setattr(parallel, "_cpu_times", lambda: next(samples))
    monkeypatch.setattr(parallel, "cores", lambda: [1, 2, 3])
    assert parallel.idle_cores(0.0) == 2                   # core 2 is busy


def test_the_vectorised_pad_samples_are_the_worldgen_samples():
    """`pads.footprint_samples_xy` is `settlement_run_pads.footprint_samples`,
    point for point and in order, on rotated and axis-aligned pads."""
    from workbench import pads
    srp = pads._srp()
    for poly in ([(0.0, 0.0), (7.3, 0.0), (7.3, 4.1), (0.0, 4.1)],
                 [(10.2, 3.1), (15.9, 7.7), (12.4, 12.1), (6.7, 7.5)],
                 srp.pad_polygon([(1, 1), (6, 2), (5, 7), (0, 6)], 1.0, {"w": 3.5})):
        X, Z = pads.footprint_samples_xy(poly)
        assert list(zip(X.tolist(), Z.tolist())) == srp.footprint_samples(poly)


@local
def test_check_only_judges_the_named_pieces(applied):
    """`check --only U` returns the full check's rows, near pairs and
    per-piece rule rows and failures for U only; the graph rules whole."""
    from workbench import rules
    from workbench.scene import Scene
    scene = Scene.load(applied["tmp"] / "scenes" / "speed-b.json")
    cat = wb.place_catalogue(scene.placeId)
    full = wb.check_scene(cat, scene, serial=True, use_cache=False)
    uids = [p.uid for p in scene.pieces if p.y is not None][:3]
    only = wb.check_scene(cat, scene, only=",".join(uids), use_cache=False)
    assert only["only"] == sorted(uids) and set(only["pieces"]) == set(uids)
    assert only["pieces"] == {u: full["pieces"][u] for u in uids}
    assert only["nearPairs"] == [p for p in full["nearPairs"] if p["a"] in uids or p["b"] in uids]
    for key in rules.PIECE_RULES:
        rk = {"sill": "doors", "sign": "boards"}.get(key, "pieces")
        assert only[key][rk] == {k: v for k, v in full[key][rk].items()
                                 if k.removeprefix("door:").split(".")[0] in uids}, key
        assert only[key]["failures"] == [f for f in full[key]["failures"]
                                          if f.removeprefix("door:").split(":")[0].split(".")[0]
                                          in uids], key
    for key in wb.GRAPH_RULES + ("doors",):
        assert only[key] == full[key], key
    with pytest.raises(ValueError):
        wb.check_scene(cat, scene, only="no-such-piece")


def _compile_parts(out: Path, place: str, summary: dict) -> dict:
    c = summary["compile"]
    return {"compile": {k: c.get(k) for k in ("exitCode", "summary", "errors", "warnings",
                                              "fixtureWaived", "stage", "failed")},
            "derived": (out / "apply" / f"{place}.blueprint.json").read_text(),
            "settlements": {f.name: f.read_text() for f in
                            sorted((out / "apply" / f"{place}.compiled").glob("*.json"))}}


@local
def test_an_unchanged_export_restores_the_compile(tmp_path, monkeypatch):
    """The compile cache (`opcache.compile_key`): a cached apply restores the
    derived blueprint, the compiled settlement and the compile's verdict of a
    full one, byte for byte; a changed record re-runs it."""
    monkeypatch.setattr(paths, "OUTPUT", tmp_path)
    place = json.loads(FIXTURE.read_text())["placeId"]
    full = wb.apply_layout(FIXTURE, "speed-d", full=True)
    ref = _compile_parts(tmp_path, place, full)
    cached = wb.apply_layout(FIXTURE, "speed-d")
    assert cached["compile"].get("cached") is True and "cached" not in full["compile"]
    assert _compile_parts(tmp_path, place, cached) == ref
    monkeypatch.setitem(opcache._DATA_KEY, "key", "a record moved")
    again = wb.apply_layout(FIXTURE, "speed-d")
    assert "cached" not in again["compile"] and _compile_parts(tmp_path, place, again) == ref


@local
def test_opcache_verify_runs_every_hit_and_catches_a_bad_entry(tmp_path, monkeypatch):
    """WB_OPCACHE_VERIFY=1: each op-cache hit is run fresh and compared; a
    stored entry that no longer matches the op fails the apply (without the
    flag the bad entry would be restored silently)."""
    monkeypatch.setattr(paths, "OUTPUT", tmp_path)
    wb.apply_layout(FIXTURE, "speed-v", compile_=False, full=True)
    hits = wb.apply_layout(FIXTURE, "speed-v", compile_=False)["opCache"]["restored"]
    monkeypatch.setenv("WB_OPCACHE_VERIFY", "1")
    ok = wb.apply_layout(FIXTURE, "speed-v", compile_=False)
    assert ok["failed"] is None and ok["opCache"]["restored"] == 0
    assert hits > 0 and ok["opCache"]["verified"] == hits
    store = opcache.cache_dir(tmp_path / "scenes" / "speed-v.json") / "ops.json"
    doc = json.loads(store.read_text())
    key, entry = next((k, e) for k, e in doc["entries"].items() if e["diff"]["pieces"])
    uid = next(iter(entry["diff"]["pieces"]))
    entry["diff"]["pieces"][uid]["x"] += 1.0            # a stale entry
    store.write_text(json.dumps(doc))
    bad = wb.apply_layout(FIXTURE, "speed-v", compile_=False)
    assert bad["failed"] and "WB_OPCACHE_VERIFY" in bad["failed"]["error"]
    assert "diff" in bad["failed"]["error"]


@local
def test_a_scene_view_is_a_private_copy_that_keeps_the_pad_memo(applied):
    from workbench import pads
    from workbench.scene import Scene
    base = Scene.load(applied["tmp"] / "scenes" / "speed-b.json")
    cat = wb.place_catalogue(base.placeId)
    g = pads.ground_for(cat, base, None)
    view = base.view()
    assert pads.ground_for(cat, view, None) is g                # the memo carried over
    p = view.pieces[0]
    p.x += 1.0
    p.role["touched"] = True
    assert base.pieces[0].x == p.x - 1.0 and "touched" not in base.pieces[0].role
    assert view.__dict__["_padMemo"] is not base.__dict__["_padMemo"]


def test_the_walk_table_links_the_deployed_studio(monkeypatch):
    """Method review r3 F12: the owner opens the walk table on the phone after
    the session; the dev tunnel is dead by then."""
    monkeypatch.setenv("ES_TUNNEL_URL", "http://127.0.0.1:9/tunnel/")
    url = wb.walktable_base_url()
    assert url.startswith("https://") and "github.io" in url and "tunnel" not in url
