"""place_gates: the compile's gate ids become gates; the contract-3 shape."""
from __future__ import annotations

from . import place_gates as pg
from .compile_settlement import COMPILE_GATE_IDS


def test_compile_gates_split_by_id():
    g = pg.Gates()
    settlement = {"errors": ["a: 97 C5 close", "sockets.roster: none", "b: other"],
                  "gateFailures": [{"gate": "compile.spacing", "grade": "error", "message": "a: 97 C5 close"},
                                   {"gate": "compile.firstSeen", "grade": "warn", "message": "w"}]}
    pg.compile_gates(g, settlement, "", 1.0)
    rows = {r["id"]: r for r in g.rows}
    assert set(rows) == set(COMPILE_GATE_IDS) | {"compile", "sockets"}
    assert rows["compile.spacing"]["failures"] == ["a: 97 C5 close"]
    assert rows["compile.firstSeen"]["ok"] and rows["compile.firstSeen"]["warnings"] == ["w"]
    assert rows["sockets"]["failures"] == ["sockets.roster: none"]
    assert rows["compile"]["failures"] == ["b: other"]


def test_no_compile_fails_every_compile_gate():
    g = pg.Gates()
    pg.compile_gates(g, None, "ValueError: st1", 0.0)
    assert all(not r["ok"] and "ValueError: st1" in r["failures"][0] for r in g.rows)


def test_row_shape_is_contract_3():
    row = pg.Gates().add("x", 0.123, [])
    assert set(row) == {"id", "ok", "seconds", "failures"} and row["ok"] is True


BAR = [("topShellShareMax", "0098: top shell share 0.60 > 0.5 (M1)")]
EXCEPTION = {"bar": "topShellShareMax", "reason": "no third linked Argonian shell with a usable cell",
             "on": "2026-09-27", "planner": "Fable"}


def test_variety_exception_excuses_its_bar_only():
    """Claywater residual ruling 2: `variety.exceptions[]` in the blueprint
    turns that bar's failure into a warning naming the reason; nothing else."""
    assert pg.variety_exceptions({}, BAR) == ([BAR[0][1]], [])
    failures, warnings = pg.variety_exceptions({"variety": {"exceptions": [EXCEPTION]}}, BAR)
    assert failures == [] and "no third linked Argonian shell" in warnings[0]
    other = BAR + [("shellsMin", "0098: distinct shells 2 < 3 (M1)")]
    failures, _ = pg.variety_exceptions({"variety": {"exceptions": [EXCEPTION]}}, other)
    assert failures == ["0098: distinct shells 2 < 3 (M1)"]


def test_a_malformed_or_stale_exception_fails():
    bad = {**EXCEPTION, "reason": ""}
    assert "lacks ['reason']" in pg.variety_exceptions({"variety": {"exceptions": [bad]}}, BAR)[0][0]
    wrong = {**EXCEPTION, "bar": "prettiness"}
    assert "not a 0098 bar" in pg.variety_exceptions({"variety": {"exceptions": [wrong]}}, BAR)[0][0]
    stale = pg.variety_exceptions({"variety": {"exceptions": [EXCEPTION]}}, [])[0]
    assert stale and "stale" in stale[0]


def test_the_receipt_copies_the_blueprint_exceptions(tmp_path):
    from . import close_place
    (tmp_path / "place.x.json").write_text(
        '{"blueprint": {"variety": {"exceptions": [%s]}}}' % __import__("json").dumps(EXCEPTION))
    assert close_place.variety_exceptions_of("place.x", tmp_path) == [EXCEPTION]
    assert close_place.variety_exceptions_of("place.none", tmp_path) == []
