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


def test_claywater_fills_every_promise():
    """The live place: since walk 2 its sockets, doors and parcels fill every
    row of its ledger (the ledger landed first, when all 14 were unfilled)."""
    ledger = pg.load_ledger(CLAYWATER)
    bp = json.loads((pg.LAYOUT_DIR / f"{CLAYWATER}.json").read_text())["blueprint"]
    sockets = pg.layout_sockets(pg.layouts()[CLAYWATER])
    assert len(ledger["promises"]) == 14
    errs = pg.promise_gate_errors(bp, ledger, sockets)
    assert [e for e in errs if e.startswith("promises.unfilled")] == []


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


def test_door_type_reads_the_claim_before_the_shell():
    """Planner ruling 2026-09-27 (T2 rec 4): tier A or a reserved load pool is
    `load` whatever the shell; an open-fronted building with no interior (the
    stable's reserved pool) has no door; no claim falls to the XTEL record.
    Failing first: Claywater's door 4 (open stable on farmhouse02, which has an
    XTEL elsewhere) read `load`, door 3 (mudhut reserved for Phase 12) `swing`."""
    shells = frozenset({"vanilla:architecture/farmhouse/farmhouse02"})
    stable = {"interiorClaim": {"tier": "reserved", "pool": "stable"}}
    assert door_types.door_type(stable, "vanilla:architecture/farmhouse/farmhouse02", shells) is None
    hut = {"interiorClaim": {"tier": "reserved", "pool": "kotm-mudhut"}}
    # decision 0114: no plugin gives mudhut01 a load door, so it is hollow (no
    # prompt); a reserved door on a linked shell is load (the closed line)
    assert door_types.door_type(hut, "kotm:argonia/mudhuts/mudhut01", shells) == "hollow"
    assert door_types.door_type(hut, "vanilla:architecture/farmhouse/farmhouse02", shells) == "load"
    tier_a = {"interiorClaim": {"tier": "A", "cellId": "KeebaHouseFisher"}}
    assert door_types.door_type(tier_a, "kotm:argonia/mudhuts/mudhut01", shells) == "load"
    assert door_types.door_type({}, "kotm:argonia/mudhuts/mudhut01", shells) == "swing"


def test_claim_stamps_door_type_and_drops_an_open_front_door(monkeypatch):
    from worldgen import blueprint_interiors as bi
    results = {"p-a": {"tier": "A", "cellId": "C", "plugin": "P", "why": "w",
                       "doors": [{"refId": "0001", "arrivalMarker": {"positionM": [0, 0, 0], "yawDeg": 0}}]},
               "p-hut": {"tier": "reserved", "pool": "kotm-mudhut", "why": "w"},
               "p-stable": {"tier": "reserved", "pool": "stable", "why": "open stable"}}
    monkeypatch.setattr(bi, "claim_for_parcel", lambda parcel, *a, **k: results[parcel["id"]])
    monkeypatch.setattr(bi, "game_marker", lambda m: m)
    bp = {"parcels": [{"id": pid, "assetRef": "x:shell"} for pid in results],
          "doors": [{"id": f"door.{pid}", "parcelId": pid} for pid in results]}
    rows = bi.claim_doors(bp, lib={}, links={})
    assert {r["door"]: r["doorType"] for r in rows} == {
        "door.p-a": "load", "door.p-hut": "hollow", "door.p-stable": None}   # x:shell is unlinked (0114)
    assert [d["id"] for d in bp["doors"]] == ["door.p-a", "door.p-hut"]
    assert [d["doorType"] for d in bp["doors"]] == ["load", "hollow"]


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
