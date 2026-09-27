"""The promise ledger record and the promise gate (decision 0104 decisions
3-5), the door-type reader (decision 4) and the locked writer (decision 9)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from worldgen import blueprint_promises as bpr
from worldgen import door_types, promise_gate as pg
from worldgen.atomic_write import locked_write_text, write_lock

CLAYWATER = "place.imperial-fringe.claywater-station"


def _ledger(*rows: dict) -> dict:
    return {"schemaVersion": 1, "placeId": "place.r.p", "generator": "test", "derivedFrom": [],
            "promises": [{"id": r["id"], "kind": r.get("kind", "service"), "text": "t",
                          "source": {"file": "f", "path": "p"}, "unfilled": r.get("unfilled")}
                         for r in rows]}


BP = {"id": "place.r.p", "parcels": [{"id": "parcel.p.inn"}], "doors": [{"id": "door.r.p.1"}]}


def test_every_row_filled_passes():
    bp = {**BP, "parcels": [{"id": "parcel.p.inn", "fills": ["promise.p.service-lodging"]}]}
    sockets = [{"id": "socket.p.npc-keeper", "fills": ["promise.p.occupant-keeper"]}]
    ledger = _ledger({"id": "promise.p.service-lodging"}, {"id": "promise.p.occupant-keeper"})
    assert pg.promise_gate_errors(bp, ledger, sockets) == []
    assert pg.fills_index(bp, sockets) == {"promise.p.occupant-keeper": ["socket.p.npc-keeper"],
                                           "promise.p.service-lodging": ["parcel.p.inn"]}


def test_an_unfilled_row_fails_and_a_valid_reason_excuses_it():
    ledger = _ledger({"id": "promise.p.safe-interior", "kind": "safeInterior"})
    assert [e.split(":")[0] for e in pg.promise_gate_errors(BP, ledger)] == ["promises.unfilled"]
    ledger["promises"][0]["unfilled"] = {"reason": "later-phase-system", "note": "Phase 12 cell"}
    assert pg.promise_gate_errors(BP, ledger) == []


def test_a_bad_reason_an_unknown_fill_and_a_double_state_fail():
    ledger = _ledger({"id": "promise.p.a", "unfilled": {"reason": "later", "note": "n"}},
                     {"id": "promise.p.b", "unfilled": {"reason": "gpu-judgement", "note": "n"}})
    bp = {**BP, "doors": [{"id": "door.r.p.1", "fills": ["promise.p.b", "promise.p.nope"]}]}
    rules = sorted(e.split(":")[0] for e in pg.promise_gate_errors(bp, ledger))
    assert rules == ["promises.both", "promises.reason", "promises.unknown"]


def test_no_ledger_no_gate():
    assert pg.promise_gate_errors(BP, None) == []


def test_claywater_fails_today_with_no_fills():
    """Shown failing on the real place: the ledger landed before the fills,
    so every one of its rows is unfilled until the place lane adds them."""
    ledger = pg.load_ledger(CLAYWATER)
    bp = json.loads((pg.LAYOUT_DIR / f"{CLAYWATER}.json").read_text())["blueprint"]
    sockets = pg.layout_sockets(pg.layouts()[CLAYWATER])
    errs = pg.promise_gate_errors(bp, ledger, sockets)
    unfilled = [e for e in errs if e.startswith("promises.unfilled")]
    assert len(unfilled) == len(ledger["promises"]) - len(pg.fills_index(bp, sockets))
    assert unfilled, "Claywater now fills every promise: drop this test, the integrity pin is 0"


def test_the_ledger_record_is_generated_deterministically():
    rec = bpr.load_record(CLAYWATER)
    services = json.loads((bpr.REPO_ROOT / bpr.TRAVEL_SERVICES_REL).read_text())
    a, b = bpr.ledger_rows(rec, services), bpr.ledger_rows(rec, services)
    assert a == b and [r["id"] for r in a] == sorted(r["id"] for r in a)
    ids = {r["id"] for r in a}
    assert {"promise.claywater-station.service-ferry", "promise.claywater-station.post-poler",
            "promise.claywater-station.occupant-landing-s-poler", "promise.claywater-station.safe-interior",
            "promise.claywater-station.operator-ferry-imperial-fringe-drowning-gate"} <= ids
    committed = pg.load_ledger(CLAYWATER)
    strip = lambda rows: [{k: v for k, v in r.items() if k != "unfilled"} for r in rows]  # noqa: E731
    assert strip(committed["promises"]) == strip(a), (
        "the committed ledger is stale: run `blueprint_promises --id "
        f"{CLAYWATER} --write`")


def test_a_regeneration_keeps_the_builders_unfilled_blocks():
    rec = bpr.load_record(CLAYWATER)
    prev = {"promises": [{"id": "promise.claywater-station.safe-interior",
                          "unfilled": {"reason": "later-phase-system", "note": "n"}}]}
    doc = bpr.ledger_record(rec, {"services": []}, prev)
    row = next(r for r in doc["promises"] if r["id"] == "promise.claywater-station.safe-interior")
    assert row["unfilled"] == {"reason": "later-phase-system", "note": "n"}


def test_door_type_reads_the_xtel_record():
    shells = frozenset({"vanilla:architecture/farmhouse/farmhouse01"})
    assert door_types.door_type({"interiorClaim": {"interiorLoadDoorRef": "00013CC1"}}, None, shells) == "load"
    assert door_types.door_type({}, "vanilla:architecture/farmhouse/farmhouse01", shells) == "load"
    assert door_types.door_type({}, "kotm:argonia/mudhuts/mudhut01", shells) == "swing"


def test_the_write_lock_serialises_writers(tmp_path, monkeypatch):
    import subprocess
    import sys
    monkeypatch.setenv("ES_JOB_LOCK_DIR", str(tmp_path / "locks"))
    target = tmp_path / "doc.json"
    locked_write_text(target, "one\n")
    assert target.read_text() == "one\n" and oct(target.stat().st_mode & 0o777) == "0o644"
    holder = subprocess.Popen(
        [sys.executable, "-c",
         "import sys, time; from worldgen.atomic_write import write_lock\n"
         f"with write_lock({str(target)!r}):\n print('held', flush=True); time.sleep(3)"],
        cwd=Path(__file__).resolve().parents[1], stdout=subprocess.PIPE, text=True)
    try:
        assert holder.stdout.readline().strip() == "held"
        with pytest.raises(TimeoutError):          # another process holds it
            with write_lock(target, wait_s=0.3):
                pass
    finally:
        holder.wait(10)
    with write_lock(target):                       # re-entry inside one process passes
        locked_write_text(target, "two\n")
    assert target.read_text() == "two\n"
    assert [p.name for p in tmp_path.iterdir() if p.name.startswith(".doc.json")] == []
