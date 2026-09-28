"""Method review r3 finding G, delivered walk 3 wave 2 (lane L11): the
fresh-agent hand-off state. `wb round` writes into the place's current round
folder by default, `--waiting-on` writes waiting-on.json there, and the
`ownerOkRule` check fails an op the owner accepted (ownerOk at git HEAD)
that changed without a `cause`. No kit builds or ground needed."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import layout, paths  # noqa: E402

PLACE = "place.test.hand-off"


def test_the_default_report_dir_is_the_places_current_round_folder(tmp_path):
    root = tmp_path / "16k"
    assert wb.default_report_dir(PLACE, root) == root / PLACE / "round-1"
    (root / PLACE / "round-1").mkdir(parents=True)
    (root / PLACE / "round-1" / "summary.json").write_text("{}")
    assert wb.default_report_dir(PLACE, root) == root / PLACE / "round-2"
    (root / PLACE / "round-2").mkdir()                   # the scan output went in first
    (root / PLACE / "round-2" / "scan.json").write_text("{}")
    (root / PLACE / "round-10x").mkdir()                 # not a round folder
    assert wb.default_report_dir(PLACE, root) == root / PLACE / "round-2"


def test_reports_root_follows_the_lane(monkeypatch, tmp_path):
    monkeypatch.delenv("WB_REPORTS", raising=False)
    monkeypatch.delenv("WB_OUTPUT", raising=False)
    assert wb.reports_root() == paths.REPO_ROOT / "tooling" / ".reports" / "16k"
    monkeypatch.setenv("WB_OUTPUT", str(tmp_path / "out"))
    assert wb.reports_root() == tmp_path / "out" / "reports"
    monkeypatch.setenv("WB_REPORTS", str(tmp_path / "r"))
    assert wb.reports_root() == tmp_path / "r"


def test_round_writes_into_the_default_folder_with_waiting_on(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "OUTPUT", tmp_path / "out")
    monkeypatch.setenv("WB_REPORTS", str(tmp_path / "16k"))
    lay = tmp_path / "l.layout.json"
    lay.write_text(json.dumps({"schemaVersion": layout.SCHEMA_VERSION, "placeId": PLACE,
                               "window": {}, "ops": []}))
    monkeypatch.setattr(wb, "place_catalogue", lambda place: None)
    monkeypatch.setattr(wb, "apply_layout", lambda *a, **k: {"refused": "test"})
    place_dir = tmp_path / "16k" / PLACE
    place_dir.mkdir(parents=True)
    (place_dir / "tooling-sink.md").write_text("report")
    wb.run_round(["hand-off", str(lay), "--no-shots", "--waiting-on",
                  "tooling-sink=sink rows from the master's ground", "tooling-ring"])
    got = place_dir / "round-1"
    assert (got / "summary.json").exists() and len((got / "rounds.jsonl").read_text().splitlines()) == 1
    doc = json.loads((got / "waiting-on.json").read_text())
    assert doc["schemaVersion"] == 1 and doc["place"] == PLACE
    assert doc["waitingOn"] == [{"task": "tooling-sink", "rule": "sink rows from the master's ground",
                                 "file": "tooling-sink.md"}, {"task": "tooling-ring"}]
    # a hand-written key survives, a named task keeps its rule, a new one joins
    doc["filedNotBuilt"] = [{"gap": "g"}]
    (got / "waiting-on.json").write_text(json.dumps(doc))
    wb.write_waiting_on(got, PLACE, ["tooling-sink", "tooling-pads=pad export"])
    doc = json.loads((got / "waiting-on.json").read_text())
    assert doc["filedNotBuilt"] == [{"gap": "g"}]
    assert [r["task"] for r in doc["waitingOn"]] == ["tooling-sink", "tooling-ring", "tooling-pads"]
    assert doc["waitingOn"][0]["rule"] == "sink rows from the master's ground"
    # the next round opens round-2
    wb.run_round(["hand-off", str(lay), "--no-shots"])
    assert (place_dir / "round-2" / "summary.json").exists()


HOUSE = {"op": "place", "uid": "house", "asset": "a", "at": [1.0, 2.0], "yaw": 90}
LAMP = {"op": "mount", "child": "lamp", "parent": "house"}


def test_owner_ok_fails_an_accepted_op_changed_without_a_cause():
    head = [{**HOUSE, "ownerOk": "walk-3"}, LAMP]
    dropped = wb.owner_ok_failures(head, [dict(HOUSE), LAMP])           # the flag dropped only
    assert len(dropped) == 1 and "acceptance dropped" in dropped[0]
    moved = [{**HOUSE, "at": [1.5, 2.0], "ownerOk": "walk-3"}, LAMP]
    f = wb.owner_ok_failures(head, moved)
    assert len(f) == 1 and "place house" in f[0] and "(at)" in f[0] and "without a new `cause`" in f[0]
    caused = [{**HOUSE, "at": [1.5, 2.0], "cause": "owner walk 4: 0.5 m east"}, LAMP]
    assert wb.owner_ok_failures(head, caused) == []
    # a cause left over from the last change is no cause for the next one
    head2 = [{**HOUSE, "at": [1.5, 2.0], "cause": "owner walk 4: 0.5 m east", "ownerOk": "walk-4"}, LAMP]
    stale = [{**HOUSE, "at": [2.0, 2.0], "cause": "owner walk 4: 0.5 m east", "ownerOk": "walk-4"}, LAMP]
    assert len(wb.owner_ok_failures(head2, stale)) == 1
    gone = wb.owner_ok_failures(head, [LAMP])
    assert len(gone) == 1 and "removed since HEAD" in gone[0]
    # an op nobody accepted changes freely
    assert wb.owner_ok_failures(head, [{**HOUSE, "ownerOk": "walk-3"}, {**LAMP, "child": "lamp2"}]) == []


def test_the_layout_only_keys_never_reach_the_command_or_the_op_cache():
    assert wb.strip_op_meta({**HOUSE, "ownerOk": True, "cause": "x"}) == HOUSE
    layout.op_to_argv(wb.strip_op_meta({**HOUSE, "ownerOk": True}), wb.parser())


def _git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True,
                   env={"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
                        "GIT_COMMITTER_EMAIL": "t@t", "PATH": "/usr/bin:/bin"})


def test_owner_ok_rule_reads_the_layout_at_head(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "-q")
    lay = repo / "p.layout.json"
    lay.write_text(json.dumps({"ops": [{**HOUSE, "ownerOk": True}]}))
    _git(repo, "add", "p.layout.json")
    _git(repo, "commit", "-qm", "walked")
    monkeypatch.setattr(paths, "REPO_ROOT", repo.resolve())
    assert wb.owner_ok_rule(lay) == {"failures": [], "baseline": "HEAD", "accepted": 1}
    lay.write_text(json.dumps({"ops": [{**HOUSE, "yaw": 0, "ownerOk": True}]}))
    got = wb.owner_ok_rule(lay)
    assert len(got["failures"]) == 1 and "(yaw)" in got["failures"][0]
    # the check rows carry it under its rule name
    rows = [r for r in layout.check_failure_rows({"pieces": {"house": {}}, "nearPairs": [], "doors": {},
                                                  "ownerOk": got})]
    assert [(r["rule"], r["uids"]) for r in rows] == [("ownerOkRule", ["house"])]
    new = repo / "q.layout.json"
    new.write_text(json.dumps({"ops": []}))
    assert wb.owner_ok_rule(new)["skipped"].startswith("HEAD has no")
    assert wb.owner_ok_rule(tmp_path / "outside.json")["skipped"] == "the layout lies outside the repo"
