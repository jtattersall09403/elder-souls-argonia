"""apply_requests: a batch's REQUEST rows land once, under a lock, in the
target file's own JSON style; tmp dirs only."""
import json
import multiprocessing as mp

import pytest

from worldgen import apply_requests as ar


def _req(repo, pid, rows):
    p = ar.requests_path(pid, repo)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a") as f:
        for r in rows:
            f.write(json.dumps({"schemaVersion": 1, "placeId": pid, "reason": "test", **r}) + "\n")


@pytest.fixture
def repo(tmp_path, monkeypatch):
    monkeypatch.setenv("ES_JOB_LOCK_DIR", str(tmp_path / "locks"))
    recipes = {"schemaVersion": 1, "types": [{"type": "road-station", "x": 1}, {"type": "shrine"}]}
    (tmp_path / "recipes.json").write_text(json.dumps(recipes, indent=1) + "\n")
    (tmp_path / "accepted.json").write_text(json.dumps({"schemaVersion": 1, "places": []}, indent=2) + "\n")
    (tmp_path / "register.md").write_text("| Place | Row |\n|---|---|\n")
    return tmp_path


def test_batch_applies_every_op_once_and_marks_rows(repo):
    _req(repo, "place.a", [
        {"file": "accepted.json", "op": "json-append", "path": ["places"], "value": {"placeId": "place.a"}},
        {"file": "recipes.json", "op": "json-append",
         "path": ["types", {"type": "road-station"}, "builtPlaces"], "value": {"placeId": "place.a"}},
        {"file": "register.md", "op": "text-append", "value": "| place.a | r |"}])
    _req(repo, "place.b", [
        {"file": "recipes.json", "op": "json-merge", "path": ["types", {"type": "shrine"}],
         "value": {"proven": True}},
        {"file": "register.md", "op": "text-append", "value": "| place.b | r |"}])
    got = ar.apply_batch(["place.b", "place.a"], repo, now="T")
    assert got["applied"] == 5 and not got["failed"]
    recipes = json.loads((repo / "recipes.json").read_text())
    assert recipes["types"][0]["builtPlaces"] == [{"placeId": "place.a"}]
    assert recipes["types"][1] == {"type": "shrine", "proven": True}
    assert (repo / "recipes.json").read_text() == json.dumps(recipes, indent=1) + "\n"   # style kept
    assert (repo / "register.md").read_text().endswith("| place.a | r |\n| place.b | r |\n")
    assert all(r["appliedAt"] == "T" for r in ar.read_requests(ar.requests_path("place.a", repo)))
    before = {p: (repo / p).read_text() for p in ("recipes.json", "register.md", "accepted.json")}
    again = ar.apply_batch(["place.a", "place.b"], repo)
    assert again["applied"] == 0 and again["files"] == []
    assert before == {p: (repo / p).read_text() for p in before}


def test_unmarked_rows_already_present_change_nothing(repo):
    """A crash after the write and before the marking: the re-run is a no-op."""
    row = {"file": "accepted.json", "op": "json-append", "path": ["places"], "value": {"placeId": "place.a"}}
    _req(repo, "place.a", [row])
    ar.apply_batch(["place.a"], repo)
    ar.requests_path("place.a", repo).write_text("")
    _req(repo, "place.a", [row])
    got = ar.apply_batch(["place.a"], repo)
    assert got["applied"] == 0 and got["unchanged"] == 1
    assert len(json.loads((repo / "accepted.json").read_text())["places"]) == 1


def test_bad_rows_fail_and_stay_unapplied(repo):
    _req(repo, "place.a", [
        {"file": "recipes.json", "op": "json-merge", "path": ["types", {"type": "nope"}], "value": {"a": 1}},
        {"file": "../escape.md", "op": "text-append", "value": "x"},
        {"file": "register.md", "op": "text-append", "value": "| ok |"}])
    got = ar.apply_batch(["place.a"], repo)
    assert len(got["failed"]) == 2 and got["applied"] == 1
    rows = ar.read_requests(ar.requests_path("place.a", repo))
    assert [bool(r.get("appliedAt")) for r in rows] == [False, False, True]


def test_dry_run_writes_nothing(repo):
    _req(repo, "place.a", [{"file": "register.md", "op": "text-append", "value": "| a |"}])
    before = (repo / "register.md").read_text()
    assert ar.main(["--batch", "place.a", "--dry-run", "--repo", str(repo)]) == 0
    assert (repo / "register.md").read_text() == before
    assert not ar.read_requests(ar.requests_path("place.a", repo))[0].get("appliedAt")


def _integrator(repo, pids):
    ar.apply_batch(pids, repo)


def test_parallel_integrators_lose_nothing(repo):
    pids = [f"place.{i}" for i in range(12)]
    for pid in pids:
        _req(repo, pid, [{"file": "accepted.json", "op": "json-append", "path": ["places"],
                          "value": {"placeId": pid}}])
    ctx = mp.get_context("fork")
    procs = [ctx.Process(target=_integrator, args=(repo, [pid])) for pid in pids]
    for p in procs:
        p.start()
    for p in procs:
        p.join()
        assert p.exitcode == 0
    got = {r["placeId"] for r in json.loads((repo / "accepted.json").read_text())["places"]}
    assert got == set(pids)
