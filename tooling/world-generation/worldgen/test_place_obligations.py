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
           "proseRefs": [{"sourcePath": "why.pressures", "placeRef": "place.test.other"}],
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
    registry, registry_errors = po.blueprint_object_registry(bp)
    assert not registry_errors
    assert not [ref for row in rows for ref in row.phase11Evidence if ref not in registry]
    assert not [ref for row in rows for ref in row.phase11Evidence
                if ref.startswith("blueprint.")]


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
    expected = {bp["id"] for bp in blueprints}
    assert expected == po.PHASE11_EXEMPLAR_PLACE_IDS
    a, errors = po.obligation_document(_records(), blueprints,
                                        expected_place_ids=expected)
    assert not errors
    b, errors = po.obligation_document(_records(), reversed(blueprints),
                                        expected_place_ids=expected)
    assert not errors
    assert po.serialise(a) == po.serialise(b)
    assert not po.verify_phase11_document(a, expected_place_ids=expected)


def test_export_rejects_a_whole_missing_or_unexpected_place():
    blueprints = list(_blueprints())
    expected = po.PHASE11_EXEMPLAR_PLACE_IDS
    _document, errors = po.obligation_document(
        _records(), blueprints[1:], expected_place_ids=expected)
    assert any("missing expected blueprint places" in error for error in errors)
    _document, errors = po.obligation_document(
        _records(), blueprints, expected_place_ids=set(expected) - {blueprints[0]["id"]})
    assert any("unexpected blueprint places" in error for error in errors)


def test_exported_phase11_manifest_rejects_bogus_or_cross_place_evidence():
    document, errors = po.live_phase11_document()
    assert not errors
    mutant = copy.deepcopy(document)
    mutant["rows"][0]["phase11Evidence"] = ["parcel.does-not-exist"]
    assert any("unknown evidence ref" in error for error in
               po.verify_phase11_document(mutant,
                                          expected_place_ids=po.PHASE11_EXEMPLAR_PLACE_IDS))
    mutant = copy.deepcopy(document)
    row = mutant["rows"][0]
    cross_place = next(entry["id"] for entry in mutant["objectRegistry"]
                       if entry["placeId"] != row["placeId"])
    row["phase11Evidence"] = [cross_place]
    assert any("cross-place evidence" in error for error in
               po.verify_phase11_document(mutant,
                                          expected_place_ids=po.PHASE11_EXEMPLAR_PLACE_IDS))


def test_downstream_manifest_gate_rejects_missing_stale_and_empty_delivery():
    obligations = [po.Obligation("o.one", "place.x", "contents.npcs[n1]", "contents",
                                 {"value": "n1"}, ("parcel.x",), "phase-13")]
    digest = po.owner_obligations_sha256(obligations, "phase-13")
    registry = {"npc.one": {"kind": "npc", "placeId": "place.x",
                            "deliversObligationIds": ["o.one"]}}
    registry_digest = po.compiled_object_registry_sha256(registry)
    assert po.verify_delivery_manifest(obligations, {"schemaVersion": po.MANIFEST_SCHEMA_VERSION,
                                       "kind": "place-obligation-deliveries", "owner": "phase-13",
                                       "obligationsSha256": digest,
                                       "objectRegistrySha256": registry_digest,
                                       "deliveries": []},
                                       "phase-13", object_registry=registry)
    assert po.verify_delivery_manifest(obligations, {"schemaVersion": po.MANIFEST_SCHEMA_VERSION,
                                       "kind": "place-obligation-deliveries", "owner": "phase-13",
                                       "obligationsSha256": digest,
                                       "objectRegistrySha256": registry_digest, "deliveries": [
        {"obligationId": "o.one", "objectRefs": []},
        {"obligationId": "o.stale", "objectRefs": ["npc.stale"]},
    ]}, "phase-13", object_registry=registry)
    good = {"schemaVersion": po.MANIFEST_SCHEMA_VERSION,
            "kind": "place-obligation-deliveries", "owner": "phase-13",
            "obligationsSha256": digest, "objectRegistrySha256": registry_digest,
            "deliveries": [
        {"obligationId": "o.one", "objectRefs": ["npc.one"]},
    ]}
    assert not po.verify_delivery_manifest(obligations, good, "phase-13",
                                           object_registry=registry)
    changed = [po.Obligation("o.one", "place.x", "contents.npcs[n1]", "contents",
                             {"value": "a changed promise"}, ("parcel.x",), "phase-13")]
    assert any("exact current requirements" in error
               for error in po.verify_delivery_manifest(changed, good, "phase-13",
                                                        object_registry=registry))
    assert po.verify_final_delivery(obligations, [], object_registry=registry)
    assert not po.verify_final_delivery(obligations, [good], object_registry=registry)


def test_delivery_manifest_resolves_typed_refs_in_compiled_registry():
    obligations = [po.Obligation("o.one", "place.x", "contents.npcs[n1]", "contents",
                                 {"value": "n1"}, ("parcel.x",), "phase-13")]
    registry = {"npc.one": {"kind": "npc", "placeId": "place.x",
                            "deliversObligationIds": ["o.one"]}}
    manifest = {
        "schemaVersion": po.MANIFEST_SCHEMA_VERSION,
        "kind": "place-obligation-deliveries", "owner": "phase-13",
        "obligationsSha256": po.owner_obligations_sha256(obligations, "phase-13"),
        "objectRegistrySha256": po.compiled_object_registry_sha256(registry),
        "deliveries": [{"obligationId": "o.one", "objectRefs": ["npc.bogus"]}],
    }
    assert any("unknown compiled object ref" in error for error in
               po.verify_delivery_manifest(obligations, manifest, "phase-13",
                                           object_registry=registry))
    cross_registry = {"npc.one": {"kind": "npc", "placeId": "place.other",
                                  "deliversObligationIds": ["o.one"]}}
    manifest["deliveries"][0]["objectRefs"] = ["npc.one"]
    manifest["objectRegistrySha256"] = po.compiled_object_registry_sha256(cross_registry)
    assert any("cross-place object ref" in error for error in
               po.verify_delivery_manifest(obligations, manifest, "phase-13",
                                           object_registry=cross_registry))
    malformed = {"npc.one": {"placeId": "place.x"}}
    manifest["objectRegistrySha256"] = po.compiled_object_registry_sha256(malformed)
    assert any("no concrete kind" in error for error in
               po.verify_delivery_manifest(obligations, manifest, "phase-13",
                                           object_registry=malformed))


def test_named_person_cannot_be_delivered_by_an_unrelated_same_place_object():
    obligations = [po.Obligation("o.person", "place.x", "contents.npcs[n1]", "contents",
                                 {"value": "n1"}, ("occupant.n1",), "phase-13")]
    registry = {"parcel.unrelated": {
        "kind": "parcel", "placeId": "place.x",
        "deliversObligationIds": ["o.person"],
    }}
    manifest = {
        "schemaVersion": po.MANIFEST_SCHEMA_VERSION,
        "kind": "place-obligation-deliveries", "owner": "phase-13",
        "obligationsSha256": po.owner_obligations_sha256(obligations, "phase-13"),
        "objectRegistrySha256": po.compiled_object_registry_sha256(registry),
        "deliveries": [{"obligationId": "o.person", "objectRefs": ["parcel.unrelated"]}],
    }
    errors = po.verify_delivery_manifest(obligations, manifest, "phase-13",
                                         object_registry=registry)
    assert any("expected one of" in error for error in errors)
