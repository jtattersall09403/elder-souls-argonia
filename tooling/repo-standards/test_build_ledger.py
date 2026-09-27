"""build_ledger.py: rows from the three sources, idempotent, locked, reported
against the 16k § Build cost targets."""
import json
import multiprocessing as mp
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_ledger as bl  # noqa: E402

TYPES = {"place.a": "road-station", "place.b": "road-station", "place.c": "shrine"}


def _rounds(path, totals):
    path.write_text("".join(json.dumps({"at": f"t{i}", "layoutSha256": "L", "loadS": 1.0, "checkS": 30.0, "compileS": 12.0,
                                        "shotsS": None, "totalS": t}) + "\n" for i, t in enumerate(totals)))
    return str(path)


def _append(row, ledger):
    return bl.append(row, str(ledger), place_type_of=TYPES.get)


def test_rounds_row_sums_stages_and_is_idempotent(tmp_path):
    ledger = tmp_path / "ledger.jsonl"
    src = _rounds(tmp_path / "rounds.jsonl", [600.0, 1200.0])
    assert _append(bl.row_from_rounds(src, "place.a"), ledger)
    assert not _append(bl.row_from_rounds(src, "place.a"), ledger)
    [row] = bl.read_rows(str(ledger))
    assert row["rounds"] == 2 and row["wallMin"]["total"] == 30.0 and row["wallMin"]["check"] == 1.0
    assert "shots" not in row["wallMin"]
    assert row["type"] == "road-station" and row["path"] == "new-type"
    assert row["turns"] is None and row["cpuMin"] is None and row["defects"] is None
    assert len(row["skillSha"]) == 40 and len(row["workbenchSha"]) == 40


def test_path_is_template_after_a_close_of_the_type(tmp_path):
    ledger = tmp_path / "ledger.jsonl"
    close = tmp_path / "close.json"
    close.write_text(json.dumps({"schemaVersion": 1, "placeId": "place.a", "type": "road-station"}))
    _append(bl.row_from_close(str(close)), ledger)
    _append(bl.row_from_rounds(_rounds(tmp_path / "b.jsonl", [60.0]), "place.b"), ledger)
    _append(bl.row_from_rounds(_rounds(tmp_path / "c.jsonl", [60.0]), "place.c"), ledger)
    paths = {r["placeId"]: r["path"] for r in bl.read_rows(str(ledger)) if r["source"] == "rounds"}
    assert paths == {"place.b": "template", "place.c": "new-type"}


def test_gates_row(tmp_path):
    ledger = tmp_path / "ledger.jsonl"
    g = tmp_path / "place-gates.json"
    g.write_text(json.dumps({"schemaVersion": 1, "placeId": "place.a", "startedAt": "t", "wallS": 90.0,
                             "ok": False, "gates": [{"id": "g1", "ok": False, "seconds": 30.0,
                                                     "failures": ["x"]}]}))
    _append(bl.row_from_gates(str(g)), ledger)
    [row] = bl.read_rows(str(ledger))
    assert row["wallMin"] == {"gates": 1.5, "gate:g1": 0.5} and row["gatesOk"] is False


def test_report_lists_runs_over_target(tmp_path):
    ledger = tmp_path / "ledger.jsonl"
    _append(bl.row_from_rounds(_rounds(tmp_path / "a.jsonl", [3000.0]), "place.a"), ledger)  # 50 > 40
    row = bl.row_from_rounds(_rounds(tmp_path / "c.jsonl", [300.0]), "place.c")
    row["path"] = "fix-round"                                                              # 5 < 10
    _append(row, ledger)
    out = bl.report(bl.read_rows(str(ledger)))
    assert "over target: 1" in out and "place.a#1 new-type 50.0 min > 40" in out
    assert "fix-round: n=1 median 5.0" in out


def _writer(ledger, i, tmp):
    for j in range(10):
        src = tmp / f"r{i}-{j}.jsonl"
        src.write_text(json.dumps({"at": f"w{j}", "layoutSha256": "L", "totalS": 60.0}) + "\n")
        src = str(src)
        bl.append(bl.row_from_rounds(src, f"place.{i}"), ledger, place_type_of=lambda _: "t")


def test_concurrent_appends_keep_every_row(tmp_path):
    ledger = str(tmp_path / "ledger.jsonl")
    # spawn, not fork: a forked child inherits every audit hook the test process
    # installed (sys.addaudithook cannot be undone); chain_stages.run leaves one
    # whose audit dir is gone, so a forked child's first open() raised
    # FileNotFoundError when test_chain_stages ran earlier in the same worker.
    ctx = mp.get_context("spawn")
    procs = [ctx.Process(target=_writer, args=(ledger, i, tmp_path)) for i in range(6)]
    for p in procs:
        p.start()
    for p in procs:
        p.join()
        assert p.exitcode == 0
    assert len(bl.read_rows(ledger)) == 60


def test_a_grown_rounds_file_counts_only_the_new_rounds(tmp_path):
    """wb.py appends to one rounds.jsonl for a scene's life: session 2's append
    must not count session 1's rounds again (review 2026-09-27)."""
    ledger = tmp_path / "ledger.jsonl"
    src = tmp_path / "rounds.jsonl"
    _append(bl.row_from_rounds(_rounds(src, [1200.0]), "place.a"), ledger)
    _append(bl.row_from_rounds(_rounds(src, [1200.0, 1200.0]), "place.a"), ledger)
    rows = bl.read_rows(str(ledger))
    assert [r["rounds"] for r in rows] == [1, 1]
    assert bl.runs(rows)[0]["minutes"] == 40.0


def test_type_comes_from_the_real_catalogue_record():
    assert bl.place_type("place.imperial-fringe.claywater-station") == "road-station-village"


def test_each_fix_round_is_its_own_run_judged_alone(tmp_path):
    """Three walks, three 5-minute fix rounds: three runs under the 10-minute
    target, never one 15-minute run (review 2026-09-27)."""
    ledger = tmp_path / "ledger.jsonl"
    src = tmp_path / "rounds.jsonl"
    _append(bl.row_from_rounds(_rounds(src, [1200.0]), "place.a"), ledger)            # the build
    for n in range(3):
        _rounds(src, [1200.0] + [300.0] * (n + 1))
        row = bl.row_from_rounds(str(src), "place.a")
        row["path"] = "fix-round"
        bl.append(row, str(ledger), place_type_of=TYPES.get, start_run=True)
    rs = bl.runs(bl.read_rows(str(ledger)))
    assert [(r["runId"], r["path"], r["minutes"]) for r in rs] == [
        ("place.a#1", "new-type", 20.0), ("place.a#2", "fix-round", 5.0),
        ("place.a#3", "fix-round", 5.0), ("place.a#4", "fix-round", 5.0)]
    assert "over target: 0" in bl.report(bl.read_rows(str(ledger)))


def test_a_runs_path_is_fixed_when_it_starts(tmp_path):
    """B's build starts as new-type; its partner A closes mid-build; B's later
    rows stay in the same new-type run (review 2026-09-27)."""
    ledger = tmp_path / "ledger.jsonl"
    _append(bl.row_from_rounds(_rounds(tmp_path / "b1.jsonl", [1500.0]), "place.b"), ledger)
    close = tmp_path / "close.json"
    close.write_text(json.dumps({"schemaVersion": 1, "placeId": "place.a", "type": "road-station"}))
    _append(bl.row_from_close(str(close)), ledger)
    src = tmp_path / "b2.jsonl"
    src.write_text(json.dumps({"at": "later", "layoutSha256": "L2", "totalS": 1500.0}) + "\n")
    _append(bl.row_from_rounds(str(src), "place.b"), ledger)
    [run] = [r for r in bl.runs(bl.read_rows(str(ledger))) if r["placeId"] == "place.b"]
    assert (run["path"], run["minutes"]) == ("new-type", 50.0)
    assert "place.b#1 new-type 50.0 min > 40" in bl.report(bl.read_rows(str(ledger)))


def _rows_with_place(path, place, totals):
    path.write_text("".join(json.dumps({"at": f"p{i}", "layoutSha256": "L", "placeId": place,
                                        "totalS": t}) + "\n" for i, t in enumerate(totals)))
    return str(path)


def test_rounds_rows_carry_the_place_so_append_needs_no_place(tmp_path):
    """wb.py writes placeId on every rounds row (speed-lane-3A rec 8); an old
    row without one still takes --place."""
    ledger = tmp_path / "ledger.jsonl"
    src = _rows_with_place(tmp_path / "r.jsonl", "place.a", [600.0])
    assert bl.main(["append", "--from-rounds", src, "--ledger", str(ledger), "--type", "t"]) == 0
    [row] = bl.read_rows(str(ledger))
    assert row["placeId"] == "place.a" and row["wallMin"]["total"] == 10.0
    old = _rounds(tmp_path / "old.jsonl", [60.0])
    with pytest.raises(SystemExit):
        bl.main(["append", "--from-rounds", old, "--ledger", str(ledger)])
    assert bl.main(["append", "--from-rounds", old, "--place", "place.b", "--type", "t",
                    "--ledger", str(ledger)]) == 0
    mixed = tmp_path / "mixed.jsonl"
    mixed.write_text(open(src).read() + json.dumps({"at": "z", "layoutSha256": "L",
                                                    "placeId": "place.c", "totalS": 1.0}) + "\n")
    with pytest.raises(SystemExit):
        bl.main(["append", "--from-rounds", str(mixed), "--ledger", str(ledger)])


def _stage(tmp_path, *args):
    return bl.main(["stage", "--ledger", str(tmp_path / "ledger.jsonl"),
                    "--clock-dir", str(tmp_path / "clocks"), "--type", "road-station", *args])


def test_stage_events_record_wall_minutes_per_stage(tmp_path):
    """start/end pairs become one `stage` row each; starting a stage ends the
    open one; the run's minutes add stages, rounds and gates."""
    assert _stage(tmp_path, "--place", "place.a", "--stage", "orient", "--start",
                  "--at", "2026-09-27T10:00:00Z") == 0
    assert _stage(tmp_path, "--place", "place.a", "--stage", "survey-and-scans", "--start",
                  "--at", "2026-09-27T10:12:00Z") == 0                      # ends orient: 12
    assert _stage(tmp_path, "--place", "place.a", "--stage", "survey-and-scans", "--end",
                  "--at", "2026-09-27T10:27:00Z") == 0                      # 15
    assert _stage(tmp_path, "--place", "place.a", "--stage", "readers", "--end") == 2   # none open
    rows = bl.read_rows(str(tmp_path / "ledger.jsonl"))
    assert [(r["source"], r["stage"], r["wallMin"]) for r in rows] == [
        ("stage", "orient", {"orient": 12.0}), ("stage", "survey-and-scans", {"survey-and-scans": 15.0})]
    assert {r["runId"] for r in rows} == {"place.a#1"} and rows[0]["path"] == "new-type"
    [run] = bl.runs(rows)
    assert run["minutes"] == 27.0


def test_a_fix_round_stage_starts_its_own_run(tmp_path):
    _stage(tmp_path, "--place", "place.a", "--stage", "orient", "--start", "--at", "2026-09-27T10:00:00Z")
    _stage(tmp_path, "--place", "place.a", "--stage", "orient", "--end", "--at", "2026-09-27T10:30:00Z")
    _stage(tmp_path, "--place", "place.a", "--stage", "orient", "--start", "--start-run",
           "--path", "fix-round", "--at", "2026-09-28T09:00:00Z")
    _stage(tmp_path, "--place", "place.a", "--stage", "orient", "--end", "--at", "2026-09-28T09:04:00Z")
    rs = bl.runs(bl.read_rows(str(tmp_path / "ledger.jsonl")))
    assert [(r["runId"], r["path"], r["minutes"]) for r in rs] == [
        ("place.a#1", "new-type", 30.0), ("place.a#2", "fix-round", 4.0)]


def test_report_counts_a_hand_row_as_the_runs_stopwatch(tmp_path):
    """Greenspring's hand row (total 64, gates 2 inside it) is the run's
    minutes; its gates rows are not added on top."""
    ledger = tmp_path / "ledger.jsonl"
    g = tmp_path / "place-gates.json"
    g.write_text(json.dumps({"schemaVersion": 1, "placeId": "place.a", "wallS": 12.0, "ok": True,
                             "gates": []}))
    _append(bl.row_from_gates(str(g)), ledger)
    hand = {"schemaVersion": 1, "source": "hand", "placeId": "place.a", "runId": "place.a#1",
            "path": "new-type", "type": "road-station", "wallMin": {"gates": 2, "total": 64}}
    with open(ledger, "a") as f:
        f.write(json.dumps(hand) + "\n")
    rows = bl.read_rows(str(ledger))
    [run] = bl.runs(rows)
    assert run["minutes"] == 64.0 and run["hand"]
    out = bl.report(rows)
    assert "place.a#1 new-type 64.0 min > 40" in out
    assert "place.a#1 new-type 64.0 min target 40 over by 24.0 (hand)" in out


def test_rounds_inside_a_stage_are_not_counted_twice(tmp_path):
    """A round run inside layout-to-compile is part of that stage's wall; one
    after the stages still counts."""
    _stage(tmp_path, "--place", "place.a", "--stage", "layout-to-compile", "--start",
           "--at", "2026-09-27T10:00:00Z")
    ledger = tmp_path / "ledger.jsonl"
    inside = tmp_path / "in.jsonl"
    inside.write_text(json.dumps({"at": "2026-09-27T10:05:00Z", "layoutSha256": "L", "placeId": "place.a",
                                  "totalS": 120.0}) + "\n")
    bl.main(["append", "--from-rounds", str(inside), "--ledger", str(ledger), "--type", "t"])
    _stage(tmp_path, "--place", "place.a", "--stage", "layout-to-compile", "--end",
           "--at", "2026-09-27T10:20:00Z")
    after = tmp_path / "after.jsonl"
    after.write_text(json.dumps({"at": "2026-09-27T10:30:00Z", "layoutSha256": "L2", "placeId": "place.a",
                                 "totalS": 60.0}) + "\n")
    bl.main(["append", "--from-rounds", str(after), "--ledger", str(ledger), "--type", "t"])
    [run] = bl.runs(bl.read_rows(str(ledger)))
    assert run["minutes"] == 21.0
