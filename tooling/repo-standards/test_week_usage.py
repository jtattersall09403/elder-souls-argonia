"""week_usage: the limit is derived from the owner's latest % reading this week (decision 0118)."""
import datetime as dt, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import week_usage  # noqa: E402

CFG = {"limitUnits": 825, "resetWeekday": 4, "resetHourUTC": 5}  # Friday 05:00 UTC


def _t(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def _rec(f, at, mid, out):
    f.write(json.dumps({"timestamp": at, "message": {"id": mid, "usage": {"output_tokens": out}}}, separators=(",", ":")) + "\n")  # transcript form


def _transcripts(tmp_path):
    with open(tmp_path / "s.jsonl", "w") as f:
        _rec(f, "2026-10-02T06:00:00Z", "a", 2_000_000)   # 10 units
        _rec(f, "2026-10-02T08:00:00Z", "b", 2_000_000)   # 10 units
        _rec(f, "2026-10-02T12:00:00Z", "c", 4_000_000)   # 20 units, after the reading
    os.utime(tmp_path / "s.jsonl", (_t("2026-10-02T13:00Z"),) * 2)
    return str(tmp_path)


def test_no_reading_is_fallback_and_nudge(tmp_path):
    s = week_usage.week_status(_t("2026-10-02T13:00Z"), _transcripts(tmp_path), dict(CFG, readings=[]),
                               cache=None, limit_cache=None)
    assert s["limit"] == 825 and s["enforce"] is False and abs(s["used"] - 40) < 1e-6


def test_reading_this_week_derives_limit_and_enforces(tmp_path):
    cfg = dict(CFG, readings=[{"at": "2026-09-30T10:00Z", "percentUsed": 90},   # last week: ignored
                              {"at": "2026-10-02T09:00Z", "percentUsed": 5}])
    s = week_usage.week_status(_t("2026-10-02T13:00Z"), _transcripts(tmp_path), cfg,
                               cache=None, limit_cache=str(tmp_path / "lim.json"))
    assert s["enforce"] is True and abs(s["limit"] - 400) < 1e-6   # 20 units by 09:00 / 5 %
    assert abs(s["share"] - 0.1) < 1e-6                              # 40 of 400


def test_reading_from_last_week_does_not_enforce(tmp_path):
    cfg = dict(CFG, readings=[{"at": "2026-09-30T10:00Z", "percentUsed": 90}])
    s = week_usage.week_status(_t("2026-10-02T13:00Z"), _transcripts(tmp_path), cfg,
                               cache=None, limit_cache=None)
    assert s["enforce"] is False and s["limit"] == 825


def test_shipped_config_has_the_owner_instruction():
    cfg = json.load(open(week_usage.CONFIG))
    assert "percentUsed" in cfg["comment"] and isinstance(cfg["readings"], list)
