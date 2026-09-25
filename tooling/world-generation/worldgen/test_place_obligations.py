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
        bp = json.loads(path.read_text())["blueprint"]
        if not bp_mod.is_fixture(bp):
            yield bp


# The 2026-09-09 exemplar blueprints were retired by the owner 2026-09-23 and
# the only shipped blueprint is the yard fixture, which owes the catalogue
# nothing. The manifest machinery below is therefore exercised on two real
# catalogue records, each with a small blueprint written here that links every
# qualitative root to one parcel. It binds most, not all, obligations, so the
# tests assert the error they cause, never a clean baseline.
SYNTHETIC_PLACES = ("place.hist-heartland.nine-trunks", "place.hist-heartland.sap-tapping-licensed")


def _synthetic(place_id):
    rec = _records()[place_id]
    slug = place_id.rsplit(".", 1)[-1]
    ref = f"parcel.{slug}.evidence"
    rows, _ = po.build_obligations(rec, {"id": place_id})
    roots = sorted({r.sourcePath.split(".", 1)[0].split("[", 1)[0] for r in rows}
                   & po.QUALITATIVE_ROOTS)
    return {"id": place_id, "parcels": [{"id": ref}],
            "macroEvidence": [{"sourcePaths": roots, "evidenceRefs": [ref]}]}


def _synthetic_document():
    blueprints = [_synthetic(pid) for pid in SYNTHETIC_PLACES]
    document, _errors = po.obligation_document(
        _records(), blueprints, expected_place_ids=set(SYNTHETIC_PLACES))
    return blueprints, document


def test_every_catalogue_field_has_exactly_one_contract_policy():
    records = _records().values()
    assert not [e for rec in records for e in po.classify_record_fields(rec)]
    mutant = copy.deepcopy(next(iter(_records().values())))
    mutant["newPromiseNobodyClassified"] = "a faction seat"
    assert "unclassified catalogue field" in po.classify_record_fields(mutant)[0]
    assert not (po.PROCESS_FIELDS & po.DELIVERY_FIELDS)
    assert not (po.PROVENANCE_FIELDS & po.PLOT_FIELDS)
    assert not (po.PROVENANCE_FIELDS & po.DELIVERY_FIELDS)
    assert not (po.PLOT_FIELDS & po.DELIVERY_FIELDS)
    assert set(po.DELIVERY_OWNER_BY_ROOT) == po.DELIVERY_FIELDS
    assert set(po.DELIVERY_OWNER_BY_ROOT.values()) <= po.DELIVERY_OWNERS


def test_new_id_bearing_blueprint_section_cannot_promote_itself_to_evidence():
    bp = {"id": "place.test.promotion",
          "designNotes": {"id": "landmark.promotion.not-authored"}}
    registry, errors = po.blueprint_object_registry(bp)
    assert "landmark.promotion.not-authored" not in registry
    assert any("has no evidence-promotion policy" in error for error in errors)

    bp = {"id": "place.test.promotion",
          "parcels": [{"id": "landmark.promotion.wrong-container"}]}
    registry, errors = po.blueprint_object_registry(bp)
    assert "landmark.promotion.wrong-container" not in registry
    assert any("expected one of ['parcel']" in error for error in errors)


def test_provenance_and_plot_mechanics_do_not_emit_obligations():
    rec = {"id": "place.test.small", "name": "Small", "sources": ["source"],
           "provenance": "lore-implied", "confidence": "high",
           "proseRefs": [{"sourcePath": "why.pressures", "placeRef": "place.test.other"}],
           "position": {"u": 0.2, "v": 0.3}, "workflow": "authored"}
    bp = {"id": rec["id"]}
    rows, errors = po.build_obligations(rec, bp)
    assert not errors
    assert {r.sourcePath for r in rows} == set()


def test_ownerGuided_is_a_process_flag_and_owes_nothing():
    """MUTATION: classify ownerGuided as delivery again — green on a record
    that owes a builder an obligation for how the owner works on it."""
    rec = {"id": "place.test.guided", "name": "Guided", "sources": ["source"],
           "provenance": "lore-implied", "confidence": "high",
           "workflow": "authored", "ownerGuided": True}
    rows, errors = po.build_obligations(rec, {"id": rec["id"]})
    assert not errors
    assert not [r for r in rows if r.sourcePath.startswith("ownerGuided")]


@pytest.mark.parametrize("bp", list(_blueprints()), ids=lambda b: b["id"])
def test_every_live_blueprint_binds_every_macro_obligation(bp):
    errors, rows = po.check_phase11(_records()[bp["id"]], bp)
    assert rows
    assert not errors
    registry, registry_errors = po.blueprint_object_registry(bp)
    assert not registry_errors
    assert not [ref for row in rows for ref in row.phase11Evidence if ref not in registry]
    assert not [ref for row in rows for ref in row.phase11Evidence
                if ref.startswith("blueprint.")]


def test_qualitative_promise_cannot_disappear_behind_a_green_legacy_ledger():
    bp = _synthetic(SYNTHETIC_PLACES[0])
    rec = _records()[bp["id"]]
    before, _ = po.check_phase11(rec, bp)
    assert not any("from vibe." in e for e in before)
    mutant = copy.deepcopy(bp)
    mutant["macroEvidence"][0]["sourcePaths"].remove("vibe")
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
    bp["macroEvidence"] = [{"sourcePaths": ["factionPresence[faction.test:seat]"],
                            "evidenceRefs": ["o.guard", "parcel.seat.hall"]}]
    errors, rows = po.check_phase11(rec, bp)
    assert not errors
    assert any(r.sourcePath.startswith("factionPresence") for r in rows)


@pytest.mark.parametrize("role", ["seat", "chapter", "outpost", "office"])
def test_every_institutional_faction_role_needs_host_and_person(role):
    rec = {"id": "place.test.presence",
           "factionPresence": [{"factionRef": "faction.test", "role": role}]}
    bp = {"id": rec["id"],
          "landmarks": [{"id": "landmark.presence.sign"}],
          "occupants": [{"slotId": "occupant.presence.agent",
                         "ownerFaction": "faction.test"}],
          "macroEvidence": [{"sourcePaths": [f"factionPresence[faction.test:{role}]"],
                             "evidenceRefs": ["landmark.presence.sign"]}]}
    errors, _ = po.check_phase11(rec, bp)
    assert any("faction-bound occupant" in error for error in errors)
    bp["macroEvidence"][0]["evidenceRefs"].append("occupant.presence.agent")
    errors, _ = po.check_phase11(rec, bp)
    assert not errors


def test_territorial_presence_does_not_invent_an_institution():
    rec = {"id": "place.test.territory",
           "factionPresence": [{"factionRef": "faction.test", "role": "territory"}]}
    bp = {"id": rec["id"], "landmarks": [{"id": "landmark.border"}],
          "macroEvidence": [{"sourcePaths": ["factionPresence[faction.test:territory]"],
                             "evidenceRefs": ["landmark.border"]}]}
    errors, _ = po.check_phase11(rec, bp)
    assert not errors


def test_broad_faction_evidence_cannot_satisfy_an_unrelated_semantic_leaf():
    rec = {"id": "place.test.presences", "factionPresence": [
        {"factionRef": "faction.one", "role": "seat"},
        {"factionRef": "faction.two", "role": "office"},
    ]}
    bp = {
        "id": rec["id"],
        "parcels": [{"id": "parcel.presences.hall", "use": "hall"}],
        "occupants": [
            {"slotId": "occupant.one", "ownerFaction": "faction.one"},
            {"slotId": "occupant.two", "ownerFaction": "faction.two"},
        ],
        "macroEvidence": [{
            "sourcePaths": ["factionPresence"],
            "evidenceRefs": ["parcel.presences.hall", "occupant.one", "occupant.two"],
        }],
    }
    errors, _rows = po.check_phase11(rec, bp)
    assert any("faction seat faction.one needs" in error for error in errors)
    assert any("faction office faction.two needs" in error for error in errors)
    assert any("from factionPresence[faction.one:seat]" in error for error in errors)
    assert any("from factionPresence[faction.two:office]" in error for error in errors)


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
    bp = _synthetic(SYNTHETIC_PLACES[0])
    rec = copy.deepcopy(_records()[bp["id"]])
    a, _ = po.build_obligations(rec, bp)
    reversed_keys = 0
    for key in ("assetPlan", "traversalModes", "eraLayers"):
        if isinstance(rec.get(key), list) and len(rec[key]) > 1:
            rec[key].reverse()
            reversed_keys += 1
    assert reversed_keys, "the record reorders nothing; the test would be vacuous"
    b, _ = po.build_obligations(rec, bp)
    assert [x.id for x in a] == [x.id for x in b]


def test_interchange_document_is_byte_deterministic():
    blueprints = [_synthetic(pid) for pid in SYNTHETIC_PLACES]
    expected = set(SYNTHETIC_PLACES)
    a, _ = po.obligation_document(_records(), blueprints, expected_place_ids=expected)
    b, _ = po.obligation_document(_records(), reversed(blueprints), expected_place_ids=expected)
    assert a["rows"]
    assert po.serialise(a) == po.serialise(b)


def test_the_live_expected_set_is_derived_not_listed():
    """16k S3: the expected set is the accepted places plus the live
    blueprints, so an accepted place whose blueprint is gone is reported
    missing, and the live gate passes on the tree as it stands."""
    live = list(_blueprints())
    assert po.live_expected_place_ids(live, accepted=[]) == {bp["id"] for bp in live}
    gone = "place.mercantile-coast.lilmoth"
    expected = po.live_expected_place_ids(live, accepted=[gone])
    _document, errors = po.obligation_document(_records(), live, expected_place_ids=expected)
    assert any("missing expected blueprint places" in e and gone in e for e in errors)
    _document, errors = po.live_phase11_document()
    assert errors == [], errors


def test_export_rejects_a_whole_missing_or_unexpected_place():
    blueprints = [_synthetic(pid) for pid in SYNTHETIC_PLACES]
    expected = set(SYNTHETIC_PLACES)
    _document, errors = po.obligation_document(
        _records(), blueprints[1:], expected_place_ids=expected)
    assert any("missing expected blueprint places" in error for error in errors)
    _document, errors = po.obligation_document(
        _records(), blueprints, expected_place_ids=set(expected) - {blueprints[0]["id"]})
    assert any("unexpected blueprint places" in error for error in errors)
    promoted = {"id": "place.test.new-blueprint"}
    promoted_records = dict(_records(), **{promoted["id"]: {"id": promoted["id"]}})
    _document, errors = po.obligation_document(
        promoted_records, [*blueprints, promoted], expected_place_ids=expected)
    assert any("unexpected blueprint places" in error and promoted["id"] in error
               for error in errors)


def test_exported_phase11_manifest_rejects_bogus_or_cross_place_evidence():
    _blueprints_, document = _synthetic_document()
    expected = set(SYNTHETIC_PLACES)
    baseline = po.verify_phase11_document(document, expected_place_ids=expected)
    assert not any("unknown evidence ref" in e or "cross-place evidence" in e for e in baseline)
    mutant = copy.deepcopy(document)
    mutant["rows"][0]["phase11Evidence"] = ["parcel.does-not-exist"]
    assert any("unknown evidence ref" in error for error in
               po.verify_phase11_document(mutant, expected_place_ids=expected))
    mutant = copy.deepcopy(document)
    row = mutant["rows"][0]
    cross_place = next(entry["id"] for entry in mutant["objectRegistry"]
                       if entry["placeId"] != row["placeId"])
    row["phase11Evidence"] = [cross_place]
    assert any("cross-place evidence" in error for error in
               po.verify_phase11_document(mutant, expected_place_ids=expected))


def test_phase11_manifest_cannot_reassign_a_promise_to_a_convenient_owner():
    _blueprints_, document = _synthetic_document()
    expected_places = set(SYNTHETIC_PLACES)
    baseline = po.verify_phase11_document(document, expected_place_ids=expected_places)
    assert not any("does not match" in e and "owner" in e for e in baseline)
    mutant = copy.deepcopy(document)
    row = mutant["rows"][0]
    expected = row["deliveryOwner"]
    row["deliveryOwner"] = next(owner for owner in po.DELIVERY_OWNERS if owner != expected)
    mutant["obligationsSha256"] = po._document_rows_sha256(mutant["rows"])
    errors = po.verify_phase11_document(mutant, expected_place_ids=expected_places)
    assert any("does not match" in error and "owner" in error for error in errors)


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


def test_owner_manifest_and_object_claims_must_cover_each_other_exactly():
    obligations = [po.Obligation("o.one", "place.x", "contents.npcs[n1]", "contents",
                                 {"value": "n1"}, ("occupant.one",), "phase-13")]
    registry = {
        "occupant.one": {"kind": "occupant", "placeId": "place.x",
                         "deliversObligationIds": ["o.one"]},
        "occupant.two": {"kind": "occupant", "placeId": "place.x",
                         "deliversObligationIds": ["o.one"]},
    }
    manifest = {
        "schemaVersion": po.MANIFEST_SCHEMA_VERSION,
        "kind": "place-obligation-deliveries", "owner": "phase-13",
        "obligationsSha256": po.owner_obligations_sha256(obligations, "phase-13"),
        "objectRegistrySha256": po.compiled_object_registry_sha256(registry),
        "deliveries": [{"obligationId": "o.one", "objectRefs": ["occupant.one"]}],
    }
    errors = po.verify_delivery_manifest(
        obligations, manifest, "phase-13", object_registry=registry)
    assert any("do not exactly match object claims" in error for error in errors)

    registry["occupant.two"]["deliversObligationIds"] = ["o.unknown"]
    manifest["objectRegistrySha256"] = po.compiled_object_registry_sha256(registry)
    errors = po.verify_delivery_manifest(
        obligations, manifest, "phase-13", object_registry=registry)
    assert any("claims unknown obligation" in error for error in errors)


def test_delivery_contract_rejects_an_unowned_or_misowned_semantic_root():
    wrong = [po.Obligation("o.one", "place.x", "contents.npcs[n1]", "contents",
                           {"value": "n1"}, ("occupant.one",), "phase-12")]
    registry = {"occupant.one": {
        "kind": "occupant", "placeId": "place.x", "deliversObligationIds": ["o.one"]}}
    manifest = {
        "schemaVersion": po.MANIFEST_SCHEMA_VERSION,
        "kind": "place-obligation-deliveries", "owner": "phase-12",
        "obligationsSha256": po.owner_obligations_sha256(wrong, "phase-12"),
        "objectRegistrySha256": po.compiled_object_registry_sha256(registry),
        "deliveries": [{"obligationId": "o.one", "objectRefs": ["occupant.one"]}],
    }
    errors = po.verify_delivery_manifest(wrong, manifest, "phase-12",
                                         object_registry=registry)
    assert any("owner 'phase-12' does not match 'phase-13'" in error for error in errors)


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


def test_faction_presence_cannot_be_delivered_by_an_unrelated_object_kind():
    obligations = [po.Obligation(
        "o.presence", "place.x", "factionPresence[seat].role", "factionPresence",
        {"value": "seat"}, ("district.x",), "phase-11-compiled")]
    registry = {"district.x": {
        "kind": "district", "placeId": "place.x",
        "deliversObligationIds": ["o.presence"],
    }}
    manifest = {
        "schemaVersion": po.MANIFEST_SCHEMA_VERSION,
        "kind": "place-obligation-deliveries", "owner": "phase-11-compiled",
        "obligationsSha256": po.owner_obligations_sha256(
            obligations, "phase-11-compiled"),
        "objectRegistrySha256": po.compiled_object_registry_sha256(registry),
        "deliveries": [{"obligationId": "o.presence", "objectRefs": ["district.x"]}],
    }
    errors = po.verify_delivery_manifest(
        obligations, manifest, "phase-11-compiled", object_registry=registry)
    assert any("expected one of" in error for error in errors)


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


# --- record-only obligations: the 16g interior promises (world 70 §48) -----

def _dungeon_record_for_projection():
    return {
        "id": "place.testreg.root-hollow",
        "interior": {
            "kind": "delve", "family": "root-cavern", "sizeBand": "S1",
            "roomFunctions": ["root-throat", "gallery", "cache"],
            "combatSpaces": [{"scale": "smallGroup", "footing": "dry", "clearance": "tight"}],
            "anchorSockets": [{"id": "socket.root-hollow.cache", "kind": "cache",
                               "whereInInterior": "hidden"}],
        },
        "contents": {
            "creatures": [{"slotId": "c1", "role": "apex-ambusher", "registerRef": None,
                           "whereInInterior": "deep"}],
            "npcs": [], "loot": [],
        },
    }


def test_a_record_with_no_blueprint_still_projects_its_interior_promises():
    rows = po.record_obligations(_dungeon_record_for_projection())
    paths = {row.sourcePath for row in rows}
    assert "interior.roomFunctions[cache]" in paths
    assert "interior.anchorSockets[socket.root-hollow.cache]" in paths
    assert "interior.combatSpaces[smallGroup:dry:tight]" in paths
    assert "contents.creatures[c1].whereInInterior" in paths
    assert {row.deliveryOwner for row in rows} == {"phase-12"}


def test_record_obligation_ids_are_stable_and_unique():
    rec = _dungeon_record_for_projection()
    first = [row.id for row in po.record_obligations(rec)]
    second = [row.id for row in po.record_obligations(copy.deepcopy(rec))]
    assert first == second == sorted(first)
    assert len(first) == len(set(first))


def test_a_record_with_no_interior_projects_nothing():
    assert po.record_obligations({"id": "place.testreg.x", "interior": {"kind": "none"}}) == []


def test_an_unlocated_contents_slot_is_not_projected():
    rec = _dungeon_record_for_projection()
    del rec["contents"]["creatures"][0]["whereInInterior"]
    paths = {row.sourcePath for row in po.record_obligations(rec)}
    assert not any(p.startswith("contents.") for p in paths)


def test_every_live_dungeon_record_projects_something():
    records = _records()
    thin = [rid for rid, rec in records.items()
            if (rec.get("interior") or {}).get("kind") in catalogue.DUNGEON_KINDS
            and rec.get("status") not in ("cut", "deferred")
            and not po.record_obligations(rec)]
    assert thin == [], f"{len(thin)} dungeon-kind records project no obligation: {thin[:5]}"


def test_the_document_carries_record_only_places():
    records = _records()
    place_id = next(rid for rid, rec in records.items()
                    if (rec.get("interior") or {}).get("kind") in catalogue.DUNGEON_KINDS
                    and rid not in po.live_expected_place_ids(_blueprints()))
    document, errors = po.obligation_document(
        records, list(_blueprints()),
        expected_place_ids=po.live_expected_place_ids(_blueprints()),
        record_only_place_ids=[place_id])
    assert document["recordOnlyPlaceIds"] == [place_id]
    assert any(row["placeId"] == place_id for row in document["rows"])
    assert not [e for e in errors if place_id in e]


def test_a_record_only_place_that_is_also_blueprinted_is_rejected():
    records = _records()
    place_id = "place.mercantile-coast.lilmoth"
    _document, errors = po.obligation_document(
        records, list(_blueprints()),
        expected_place_ids={place_id},
        record_only_place_ids=[place_id])
    assert any("both blueprinted and record-only" in e for e in errors), errors
