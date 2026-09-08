"""G11: typed, exhaustive terrain requests and downstream fulfillment."""

from __future__ import annotations

import copy
import hashlib
import json

from . import terrain_requests as tr


def _record(place_id: str = "place.test.landform", requests: list[dict] | None = None) -> dict:
    return {
        "id": place_id,
        "position": {"u": 0.25, "v": 0.75},
        "terrainRequests": requests if requests is not None else [
            {"kind": "sinkhole", "radiusM": 40,
             "delivery": {"feature": "collapse-throat", "depthM": 12},
             "note": "A required collapse."}
        ],
    }


def _good_manifest(plan: dict) -> dict:
    evidence_by_request = {}
    for row in plan["requests"]:
        operation = next(item for item in plan["operations"] if item["requestId"] == row["id"])
        evidence = {
            "operationId": operation["id"],
            "deliverySha256": tr.delivery_digest(row["delivery"]),
            "deltaSha256": "d" * 64, "axis": [1.0, 0.0], "axisSource": "fixture",
            "profile": operation["profile"], "action": operation["action"],
            "coveredFields": sorted(row["delivery"]),
            "witnesses": [{"x": 0, "z": 0, "baseHeightM": 0.0,
                           "appliedDeltaM": -1.0, "operationDeltaM": -1.0}],
        }
        payload = json.dumps(evidence, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        evidence["evidenceSha256"] = hashlib.sha256(payload.encode()).hexdigest()
        evidence_by_request[row["id"]] = evidence
    return {
        "schemaVersion": tr.FULFILLMENT_SCHEMA_VERSION,
        "kind": "terrain-request-fulfillments",
        "sourceDigest": plan["sourceDigest"],
        "planDigest": plan["planDigest"],
        "fulfillments": [
            {"requestId": row["id"], "operationIds": row["operationIds"],
             "evidenceRefs": [f"terrain-operation-evidence.{row['operationIds'][0]}.sha256."
                              f"{evidence_by_request[row['id']]['evidenceSha256']}"],
             "operationEvidence": [evidence_by_request[row["id"]]],
             "deliverySha256": tr.delivery_digest(row["delivery"])}
            for row in plan["requests"]
        ],
    }


def test_live_catalogue_is_exhaustively_planned():
    records = tr.catalogue_records()
    source = [(record["id"], request) for record in records
              for request in record.get("terrainRequests") or []]
    plan, errors = tr.build_plan(records)
    assert not errors
    # The current authored baseline: 53 placed records make 65 requests.
    assert len({place_id for place_id, _ in source}) == 53
    assert len(source) == len(plan["requests"]) == len(plan["operations"]) == 65
    assert {row["placeId"] for row in plan["requests"]} == {place_id for place_id, _ in source}
    assert {row["requestId"] for row in plan["operations"]} == {row["id"] for row in plan["requests"]}


def test_plan_has_explicit_stable_bounded_operations_and_typed_defaults():
    plan, errors = tr.build_plan([_record()], extent_m=1000.0)
    assert not errors
    operation = plan["operations"][0]
    assert operation["id"].startswith("terrain-op.test.landform.sinkhole.")
    assert operation["action"] == "carve"
    assert operation["profile"] == "steep-rim-bowl"
    assert operation["centerM"] == [250.0, 750.0]
    assert operation["boundsM"] == {"minXM": 210.0, "minZM": 710.0,
                                    "maxXM": 290.0, "maxZM": 790.0}
    assert operation["parameters"]["deltaM"] == 12.0
    # IDs depend on semantic content, not array order.
    second = {"kind": "cave-mouth", "radiusM": 20,
              "delivery": {"feature": "aperture"}, "note": "An aperture."}
    forward, _ = tr.build_plan([_record(requests=_record()["terrainRequests"] + [second])])
    reverse, _ = tr.build_plan([_record(requests=[second] + _record()["terrainRequests"])])
    assert tr.serialise(forward) == tr.serialise(reverse)


def test_every_catalogue_kind_has_exactly_one_implementation_policy():
    assert set(tr.KIND_SPECS) == set(tr.catalogue.TERRAIN_REQUEST_KINDS)
    assert {spec.action for spec in tr.KIND_SPECS.values()} <= {"carve", "raise"}
    assert all(spec.deltaM > 0 and 0 < spec.falloffFraction < 1
               for spec in tr.KIND_SPECS.values())


def test_unknown_kind_missing_geometry_and_duplicate_are_rejected():
    requests = [
        {"kind": "volcano", "radiusM": 20, "delivery": {"feature": "cone"}, "note": "No."},
        {"kind": "pool", "delivery": {"feature": "pool"}, "note": "No radius."},
        {"kind": "sinkhole", "radiusM": 40, "delivery": {"feature": "hole"}, "note": "Same."},
        {"kind": "sinkhole", "radiusM": 40, "delivery": {"feature": "hole"}, "note": "Same."},
    ]
    record = _record(requests=requests)
    record.pop("position")
    _plan, errors = tr.build_plan([record])
    assert any("unknown" in error for error in errors)
    assert any("radiusM" in error for error in errors)
    assert any("plotted position" in error for error in errors)
    assert any("duplicate terrain request" in error for error in errors)


def test_opposing_landforms_at_one_anchor_are_rejected_but_layered_work_is_not():
    opposing = _record(requests=[
        {"kind": "dry-rise", "radiusM": 40, "delivery": {"feature": "rise"}, "note": "Raise it."},
        {"kind": "sinkhole", "radiusM": 40, "delivery": {"feature": "hole"}, "note": "Lower it."},
    ])
    _plan, errors = tr.build_plan([opposing])
    assert any("contradictory" in error for error in errors)
    layered = _record(requests=[
        {"kind": "narrows", "radiusM": 40, "delivery": {"feature": "pinch"}, "note": "Pinch the banks."},
        {"kind": "pool", "radiusM": 80, "delivery": {"feature": "pool"}, "note": "Deep water beside the crossing."},
    ])
    _plan, errors = tr.build_plan([layered])
    assert not errors


def test_fulfillment_manifest_must_cover_exact_source_and_operations_with_evidence():
    plan, errors = tr.build_plan([_record()])
    assert not errors
    good = _good_manifest(plan)
    assert not tr.verify_fulfillment_manifest(plan, good)

    missing = copy.deepcopy(good)
    missing["fulfillments"] = []
    assert any("missing fulfillment" in error
               for error in tr.verify_fulfillment_manifest(plan, missing))

    stale = copy.deepcopy(good)
    stale["fulfillments"].append({"requestId": "terrain-request.stale", "operationIds": [],
                                  "evidenceRefs": ["heightfield-region.stale"],
                                  "deliverySha256": "stale"})
    assert any("stale fulfillment" in error
               for error in tr.verify_fulfillment_manifest(plan, stale))

    partial = copy.deepcopy(good)
    partial["fulfillments"][0]["operationIds"] = []
    partial["fulfillments"][0]["evidenceRefs"] = []
    failures = tr.verify_fulfillment_manifest(plan, partial)
    assert any("operationIds" in error for error in failures)
    assert any("evidenceRefs" in error for error in failures)

    wrong_contract = copy.deepcopy(good)
    wrong_contract["fulfillments"][0]["deliverySha256"] = "stale-contract"
    assert any("deliverySha256" in error
               for error in tr.verify_fulfillment_manifest(plan, wrong_contract))


def test_manifest_is_invalidated_when_source_request_changes():
    plan, _ = tr.build_plan([_record()])
    manifest = _good_manifest(plan)
    changed = _record()
    changed["terrainRequests"][0]["radiusM"] = 41
    changed_plan, errors = tr.build_plan([changed])
    assert not errors
    assert any("sourceDigest" in error
               for error in tr.verify_fulfillment_manifest(changed_plan, manifest))


def test_delivery_contract_is_typed_content_addressed_and_not_inferred_from_note():
    missing = _record()
    missing["terrainRequests"][0].pop("delivery")
    _plan, errors = tr.build_plan([missing])
    assert any("delivery" in error for error in errors)

    invalid = _record()
    invalid["terrainRequests"][0]["delivery"] = {"feature": "hole", "depthM": "deep"}
    _plan, errors = tr.build_plan([invalid])
    assert any("depthM" in error for error in errors)

    original, _ = tr.build_plan([_record()])
    changed = _record()
    changed["terrainRequests"][0]["delivery"]["depthM"] = 13
    changed_plan, errors = tr.build_plan([changed])
    assert not errors
    assert changed_plan["operations"][0]["parameters"]["deltaM"] == 13
    assert changed_plan["planDigest"] != original["planDigest"]


def test_manifest_is_bound_to_the_exact_operation_policy():
    plan, _ = tr.build_plan([_record()])
    manifest = _good_manifest(plan)
    changed_plan = copy.deepcopy(plan)
    changed_plan["planDigest"] = "new-policy-digest"
    assert any("planDigest" in error
               for error in tr.verify_fulfillment_manifest(changed_plan, manifest))
