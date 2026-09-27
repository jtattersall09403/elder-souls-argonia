"""close_place: the slice close emits REQUEST rows that apply_requests lands;
a tmp repo root, the real Claywater compile read-only."""
import json
import shutil
from pathlib import Path

import pytest

from worldgen import accepted_places, apply_requests, close_place as cp

PID = "place.imperial-fringe.claywater-station"
REAL = Path(__file__).resolve().parents[3]
COMPILED = accepted_places.SETTLEMENTS_DIR / f"{PID}.settlement.json"
pytestmark = pytest.mark.skipif(not COMPILED.exists(), reason="Claywater's compiled record is a build output")


@pytest.fixture
def repo(tmp_path, monkeypatch):
    monkeypatch.setenv("ES_JOB_LOCK_DIR", str(tmp_path / "locks"))
    bp = tmp_path / "world/sources/blueprints"
    bp.mkdir(parents=True)
    shutil.copy(REAL / "world/sources/blueprints/claywater-station.layout.json", bp)
    (tmp_path / "world/sources/placement").mkdir(parents=True)
    (tmp_path / cp.ACCEPTED_REL).write_text(json.dumps({"schemaVersion": 1, "places": []}, indent=2) + "\n")
    (tmp_path / "world/sources/catalogue").mkdir(parents=True)
    (tmp_path / cp.RECIPES_REL).write_text(json.dumps(
        {"schemaVersion": 1, "types": [{"type": "road-station-village"}]}, indent=2) + "\n")
    reg = tmp_path / cp.CREATIVE_REL
    reg.parent.mkdir(parents=True)
    reg.write_text("| Place | Type, culture | Clutter stories | Container mix | Idle spots | Lights | "
                   "Memorable thing |\n|---|---|---|---|---|---|---|\n")
    ledger = tmp_path / "ledger.jsonl"
    for name, value in (("REPO_ROOT", tmp_path), ("BLUEPRINTS", bp), ("LEDGER", ledger),
                        ("WG_ROOT", tmp_path / "no-worldgen")):
        monkeypatch.setattr(cp, name, value)
    monkeypatch.setattr(accepted_places, "REPORT_PATH", tmp_path / "accepted-report.json")
    (tmp_path / "accepted-report.json").write_text(json.dumps({"schemaVersion": 1, "rows": [
        {"placeId": PID, "gate": "g-new", "gateAddedOn": "2026-10-01", "acceptedOn": "2026-09-30",
         "mode": "report-only", "finding": "a | finding"}]}))
    (tmp_path / "docs/phases/P-polish").mkdir(parents=True)
    (tmp_path / cp.BACKLOG_REL).write_text("# Polish backlog\n\n## Owner rulings\n\n- r1\n")
    return tmp_path


def _close_input(repo, **over):
    d = repo / cp.REPORTS / PID
    d.mkdir(parents=True, exist_ok=True)
    doc = {"schemaVersion": 1, "placeId": PID,
           "creativeRow": {"typeCulture": "road station, imperial and argonian", "clutter": "c",
                           "containers": "k", "idle": "i", "lights": "l", "memorable": "m"},
           "typeRecipe": {"grammar": "water-edge ferry station", "shells": ["farmhouse01"]}}
    doc.update(over)
    (d / "close-input.json").write_text(json.dumps(doc))


def test_close_emits_requests_that_apply_once(repo, capsys):
    _close_input(repo)
    assert cp.main(["--place", PID, "--accepted-on", "2026-09-30"]) == 0
    out = capsys.readouterr().out
    assert "register digest: SKIPPED" in out and "appended close row" in out
    assert (repo / cp.REPORTS / PID / "starting-state.md").read_text().startswith("# Starting state")
    got = apply_requests.apply_batch([PID], repo)
    assert got["applied"] == 4 and not got["failed"]
    [row] = json.loads((repo / cp.ACCEPTED_REL).read_text())["places"]
    assert row["compiledHash"] == accepted_places.compiled_hash(json.loads(COMPILED.read_text()))
    assert row["acceptedOn"] == "2026-09-30" and row["authoredOn"]
    built = json.loads((repo / cp.RECIPES_REL).read_text())["types"][0]["builtPlaces"]
    assert built[0]["yardSets"] and built[0]["interiorCells"]
    assert (repo / cp.CREATIVE_REL).read_text().rstrip().endswith("| l | m |")
    backlog = (repo / cp.BACKLOG_REL).read_text()
    assert backlog.index(cp.BACKLOG_HEADING) < backlog.index("report-mode gate `g-new`")
    assert backlog.index("- r1") < backlog.index(cp.BACKLOG_HEADING)
    # a second close adds no request, no ledger row
    assert cp.main(["--place", PID, "--accepted-on", "2026-09-30"]) == 0
    assert "0 new request row(s)" in capsys.readouterr().out
    assert len((repo / "ledger.jsonl").read_text().splitlines()) == 1


def test_close_refuses_without_the_builders_judgements(repo):
    with pytest.raises(SystemExit, match="close-input.json"):
        cp.main(["--place", PID, "--accepted-on", "2026-09-30"])
    _close_input(repo, typeRecipe={"grammar": "", "shells": []})
    with pytest.raises(SystemExit, match="typeRecipe.grammar, typeRecipe.shells"):
        cp.main(["--place", PID, "--accepted-on", "2026-09-30"])


def test_dry_run_writes_nothing(repo, capsys):
    _close_input(repo)
    assert cp.main(["--place", PID, "--accepted-on", "2026-09-30", "--dry-run"]) == 0
    assert not (repo / cp.REPORTS / PID / "requests.jsonl").exists()
    assert "4 request row(s)" in capsys.readouterr().out


def test_reacceptance_replaces_the_receipt_and_the_type_entry(repo):
    """An owner reopen then a new acceptance: one receipt, one builtPlaces entry,
    the new date (accepted_places.load refuses a place accepted twice)."""
    _close_input(repo)
    cp.main(["--place", PID, "--accepted-on", "2026-09-30"])
    apply_requests.apply_batch([PID], repo)
    cp.main(["--place", PID, "--accepted-on", "2026-10-02"])
    got = apply_requests.apply_batch([PID], repo)
    assert not got["failed"]
    entries = accepted_places.load(repo / cp.ACCEPTED_REL)
    assert entries[PID]["acceptedOn"] == "2026-10-02"
    built = json.loads((repo / cp.RECIPES_REL).read_text())["types"][0]["builtPlaces"]
    assert [b["acceptedOn"] for b in built] == ["2026-10-02"]
    _close_input(repo, creativeRow={"typeCulture": "t", "clutter": "c", "containers": "k", "idle": "i",
                                    "lights": "l", "memorable": "the new memorable thing"})
    cp.main(["--place", PID, "--accepted-on", "2026-10-03"])
    assert not apply_requests.apply_batch([PID], repo)["failed"]
    rows = [ln for ln in (repo / cp.CREATIVE_REL).read_text().splitlines() if ln.startswith("| Claywater")]
    assert len(rows) == 1 and rows[0].endswith("| the new memorable thing |")
