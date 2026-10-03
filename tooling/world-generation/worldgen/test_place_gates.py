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


def test_flame_anchor_gate_reads_the_vitest(monkeypatch):
    import subprocess
    from types import SimpleNamespace
    line = ('      "kotm.p1 (mudmother:argonianlanterns03) flame fallback at [0.000, 0.187, 0.000] '
            'sits in the upper half of a hanging piece (its cord), not its body",')
    calls = []

    def fake(cmd, **kw):
        calls.append((cmd, kw["cwd"], kw["env"].get(pg.FLAME_ANCHOR_ONLY_ENV)))
        return SimpleNamespace(returncode=calls.__len__() - 1, stdout=" Tests  1 passed | 17 skipped" if len(calls) == 1 else line, stderr="")
    monkeypatch.setattr(subprocess, "run", fake)
    g = pg.Gates()
    bp = {"doors": [{"interiorClaim": {"tier": "A", "cellId": "KeebaHouseFisher"}},
                    {"interiorClaim": {"tier": "B", "cellId": "Elsewhere"}}]}
    pg.flame_anchor_gate(g, "place.x.claywater", bp)  # exit 0: green
    pg.flame_anchor_gate(g, "place.x.claywater", bp)  # exit 1: the anchor line is the failure
    # only the gated place and its tier-A cells are checked (review 2026-09-30)
    assert {c[2] for c in calls} == {"place.x.claywater,KeebaHouseFisher"}
    calls.clear()
    monkeypatch.setattr(subprocess, "run", lambda cmd, **kw: SimpleNamespace(returncode=0, stdout="Tests  18 skipped", stderr=""))
    pg.flame_anchor_gate(g, "place.x.claywater", {})  # exit 0 but nothing ran: red, never a silent pass
    assert [r["ok"] for r in g.rows] == [True, False, False]
    assert g.rows[1]["failures"] == [line.strip().strip('",')]


def test_flame_anchor_gate_fails_an_unpublished_place(monkeypatch):
    """A gated place with no published bundle reads nothing: red, naming it
    (review 2026-09-30), never a green over zero flames."""
    import subprocess
    from types import SimpleNamespace
    line = '      "place.x.claywater: has no published bundle to check",'
    monkeypatch.setattr(subprocess, "run", lambda cmd, **kw: SimpleNamespace(returncode=1, stdout=line, stderr=""))
    g = pg.Gates()
    pg.flame_anchor_gate(g, "place.x.claywater", {})
    assert g.rows[0]["ok"] is False
    assert g.rows[0]["failures"] == ["place.x.claywater: has no published bundle to check"]


def test_kits_fresh_gate_fails_a_stale_publish(tmp_path, monkeypatch):
    """16k walk 9: the exporter's publish refusal runs as gate kits.fresh."""
    from . import export_settlement_bundle  # noqa: F401  (puts pipeline on the path)
    import pipeline.kit_compress as kc
    monkeypatch.setattr(kc, "published_problems", lambda name, public_dir=None: [])
    monkeypatch.setattr(kc, "parts_problems", lambda name, raw=None, public_dir=None: [])
    built, public = tmp_path / "built", tmp_path / "public"
    built.mkdir(), public.mkdir()
    (built / "k.kit.json").write_text('{"assets": [1]}')
    (public / "k.kit.json").write_text('{"assets": [1]}')
    settlement = {"placements": [{"kit": "k"}]}
    g = pg.Gates()
    pg.kits_fresh_gate(g, settlement, built, public)
    (public / "k.kit.json").write_text('{"assets": []}')
    pg.kits_fresh_gate(g, settlement, built, public)
    pg.kits_fresh_gate(g, None, built, public)
    assert [r["ok"] for r in g.rows] == [True, False, False]
    assert "stale publish" in g.rows[1]["failures"][0]


def test_collider_ceiling_gate_fails_a_place_over_the_ceiling(monkeypatch):
    """16k walk 9: the exporter's collider part ceiling runs as gate
    collider.ceiling on one place's runtime placements, under 5 s."""
    import json
    import time
    from pathlib import Path
    from . import export_settlement_bundle as esb
    pid = "place.dunmer-north.riverwalk"
    path = esb.DEFAULT_SETTLEMENTS / f"{pid}.settlement.json"
    bp_path = Path(esb.BLUEPRINTS) / f"{pid}.json"
    if not path.exists():
        import pytest
        pytest.skip("Riverwalk is not compiled on this machine")
    doc = json.loads(path.read_text(encoding="utf-8"))
    bp = json.loads(bp_path.read_text(encoding="utf-8"))["blueprint"]
    g = pg.Gates()
    t = time.perf_counter()
    pg.collider_ceiling_gate(g, doc, bp)
    assert time.perf_counter() - t < 5
    monkeypatch.setattr(esb, "COLLIDER_PART_CEILING", 1)
    monkeypatch.setattr(esb, "COLLIDER_PART_CEILING_LARGE", 1)
    pg.collider_ceiling_gate(g, doc, bp)
    pg.collider_ceiling_gate(g, None, bp)
    assert [r["ok"] for r in g.rows] == [True, False, False]
    assert "exceeds the collider part ceiling of 1" in g.rows[1]["failures"][0]


def test_tier_a_doors_is_the_one_rule():
    bp = {"doors": [{"id": "d1", "interiorClaim": {"tier": "A", "cellId": "C1"}},
                    {"id": "d2", "interiorClaim": {"tier": "B", "cellId": "C2"}},
                    {"id": "d3", "interiorClaim": {"tier": "A"}},
                    {"id": "d4", "interiorClaim": {"tier": "A", "cellId": "C1"}}]}
    assert [(d["id"], c) for d, c in pg.tier_a_doors(bp)] == [("d1", "C1"), ("d4", "C1")]
    assert pg.tier_a_cells(bp) == ["C1"]


def test_apply_cmd_carries_the_layouts_owner_go_ahead():
    from pathlib import Path
    plain = pg.apply_cmd({"placeId": "p"}, Path("l.json"), "s", True)
    assert "--owner-guided" not in plain
    guided = pg.apply_cmd({"placeId": "p", "ownerGoAhead": "owner 2026-10-01"}, Path("l.json"), "s", False)
    assert guided[-2:] == ["--owner-guided", "owner 2026-10-01"] and "--no-compile" in guided
