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
