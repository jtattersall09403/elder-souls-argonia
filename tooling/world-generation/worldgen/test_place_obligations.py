"""B9a: every macro promise stays visible through final delivery."""

from __future__ import annotations

import copy
import json

import pytest

from . import blueprint as bp_mod
from . import catalogue
from . import place_obligations as po


def _records():
    return {r["id"]: r for rf in catalogue.load_region_files() for r in rf.places}


def _blueprints():
    for path in sorted(bp_mod.BLUEPRINT_DIR.glob("*.json")):
        yield json.loads(path.read_text())["blueprint"]


def test_every_catalogue_field_has_exactly_one_contract_policy():
    records = _records().values()
    assert not [e for rec in records for e in po.classify_record_fields(rec)]
    mutant = copy.deepcopy(next(iter(_records().values())))
    mutant["newPromiseNobodyClassified"] = "a faction seat"
    assert "unclassified catalogue field" in po.classify_record_fields(mutant)[0]
    assert not (po.PROVENANCE_FIELDS & po.PLOT_FIELDS)
    assert not (po.PROVENANCE_FIELDS & po.DELIVERY_FIELDS)
    assert not (po.PLOT_FIELDS & po.DELIVERY_FIELDS)


def test_provenance_and_plot_mechanics_do_not_emit_obligations():
    rec = {"id": "place.test.small", "name": "Small", "sources": ["source"],
           "provenance": "lore-implied", "confidence": "high",
           "position": {"u": 0.2, "v": 0.3}, "workflow": "authored"}
    bp = {"id": rec["id"]}
    rows, errors = po.build_obligations(rec, bp)
    assert not errors
    assert {r.sourcePath for r in rows} == set()


@pytest.mark.parametrize("bp", list(_blueprints()), ids=lambda b: b["id"])
def test_all_five_live_blueprints_bind_every_macro_obligation(bp):
    errors, rows = po.check_phase11(_records()[bp["id"]], bp)
    assert rows
    assert not errors


def test_qualitative_promise_cannot_disappear_behind_a_green_legacy_ledger():
    bp = next(b for b in _blueprints() if b["id"].endswith("nine-trunks"))
    rec = _records()[bp["id"]]
    mutant = copy.deepcopy(bp)
    mutant["macroEvidence"] = [r for r in mutant["macroEvidence"]
                                if "vibe" not in r["sourcePaths"]]
    errors, _ = po.check_phase11(rec, mutant)
    assert any("from vibe." in e for e in errors)


def test_faction_seat_is_distinct_from_ownership_and_needs_concrete_evidence():
    rec = {"id": "place.test.seat", "ownerFaction": "faction.test",
           "factionPresence": [{"factionRef": "faction.test", "role": "seat"}]}
    bp = {"id": rec["id"], "occupants": [
        {"slotId": "o.guard", "ownerFaction": "faction.test"}],
          "parcels": [{"id": "parcel.seat.hall", "use": "hall"}], "macroEvidence": []}
    errors, _ = po.check_phase11(rec, bp)
    assert any("from factionPresence" in e for e in errors)
    bp["macroEvidence"] = [{"sourcePaths": ["factionPresence"],
                            "evidenceRefs": ["o.guard", "parcel.seat.hall"]}]
    errors, rows = po.check_phase11(rec, bp)
    assert not errors
    assert any(r.sourcePath.startswith("factionPresence") for r in rows)


def test_named_macro_occupant_is_not_met_by_an_unrelated_occupant():
    rec = {
        "id": "place.test.people", "contents": {"creatures": [], "loot": [], "npcs": [
            {"slotId": "n1", "role": "quest-giver", "named": True, "registerRef": None}
        ]},
    }
    bp = {"id": rec["id"], "occupants": [{"slotId": "someone-else", "worksAt": "parcel.x"}],
          "macroEvidence": [{"sourcePaths": ["contents"], "evidenceRefs": ["someone-else"]}]}
    errors, _rows = po.check_phase11(rec, bp)
    # The legacy resolver exposes the false positive; B9a must close it.
    legacy = blueprint_promises_for(rec, bp)
    assert legacy["promise.named-npc.n1"].met
    assert any("unmet macro obligation" in e for e in errors)


def blueprint_promises_for(rec, bp):
    from .blueprint_promises import build_ledger
    return {row.id: row for row in build_ledger(bp, rec)}


def test_obligation_ids_are_stable_when_source_arrays_are_reordered():
    bp = next(_blueprints())
    rec = copy.deepcopy(_records()[bp["id"]])
    a, _ = po.build_obligations(rec, bp)
    for key in ("assetPlan", "traversalModes", "eraLayers"):
        if isinstance(rec.get(key), list):
            rec[key].reverse()
    b, _ = po.build_obligations(rec, bp)
    assert [x.id for x in a] == [x.id for x in b]


def test_interchange_document_is_byte_deterministic():
    blueprints = list(_blueprints())
    a, errors = po.obligation_document(_records(), blueprints)
    assert not errors
    b, errors = po.obligation_document(_records(), reversed(blueprints))
    assert not errors
    assert po.serialise(a) == po.serialise(b)


def test_downstream_manifest_gate_rejects_missing_stale_and_empty_delivery():
    obligations = [po.Obligation("o.one", "place.x", "contents.npcs[n1]", "contents",
                                 {"value": "n1"}, ("parcel.x",), "phase-13")]
    digest = po.owner_obligations_sha256(obligations, "phase-13")
    assert po.verify_delivery_manifest(obligations, {"schemaVersion": 1,
                                       "kind": "place-obligation-deliveries", "owner": "phase-13",
                                       "obligationsSha256": digest,
                                       "deliveries": []},
                                       "phase-13")
    assert po.verify_delivery_manifest(obligations, {"schemaVersion": 1,
                                       "kind": "place-obligation-deliveries", "owner": "phase-13",
                                       "obligationsSha256": digest, "deliveries": [
        {"obligationId": "o.one", "objectRefs": []},
        {"obligationId": "o.stale", "objectRefs": ["npc.stale"]},
    ]}, "phase-13")
    good = {"schemaVersion": 1, "kind": "place-obligation-deliveries", "owner": "phase-13",
            "obligationsSha256": digest, "deliveries": [
        {"obligationId": "o.one", "objectRefs": ["npc.one"]},
    ]}
    assert not po.verify_delivery_manifest(obligations, good, "phase-13")
    changed = [po.Obligation("o.one", "place.x", "contents.npcs[n1]", "contents",
                             {"value": "a changed promise"}, ("parcel.x",), "phase-13")]
    assert any("exact current requirements" in error
               for error in po.verify_delivery_manifest(changed, good, "phase-13"))
    assert po.verify_final_delivery(obligations, [])
    assert not po.verify_final_delivery(obligations, [good])
