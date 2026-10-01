"""wb.py round --walk N (decision 0118): a fix round is timed as the run
<place>#walk-N, so build_ledger --report sees a fix round over target again
(method review r6: no run row after 09-29, the review trigger went blind)."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "repo-standards"))
import build_ledger as bl  # noqa: E402
import wb  # noqa: E402

PLACE = "place.test.somewhere"


def test_walk_opens_once_ends_and_reports_over_target(tmp_path, monkeypatch):
    monkeypatch.setattr(bl, "place_type", lambda _pid: "settlement")
    clocks, ledger = str(tmp_path / "clocks"), str(tmp_path / "ledger.jsonl")
    t0 = 1_800_000_000.0
    assert "opened" in wb.walk_clock(PLACE, 4, at=t0, clock_dir=clocks, ledger=ledger)
    assert "already open" in wb.walk_clock(PLACE, 4, at=t0 + 300, clock_dir=clocks, ledger=ledger)
    assert "ended" in wb.walk_clock(PLACE, 4, end=True, at=t0 + 25 * 60, clock_dir=clocks, ledger=ledger)
    rows = bl.read_rows(ledger)
    assert len(rows) == 1 and rows[0]["runId"] == f"{PLACE}#walk-4" and rows[0]["path"] == "fix-round"
    assert rows[0]["wallMin"] == {"fix-round": 25.0}
    rep = bl.report(rows)
    assert f"{PLACE}#walk-4 fix-round 25.0 min > 10" in rep
    # ending a walk that is not open writes nothing
    assert "no open" in wb.walk_clock(PLACE, 5, end=True, at=t0 + 3000, clock_dir=clocks, ledger=ledger)
    assert len(bl.read_rows(ledger)) == 1
