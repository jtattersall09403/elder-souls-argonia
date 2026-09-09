import copy
import hashlib
import json

import numpy as np
import pytest

from . import terrain_request_postconditions as post
from . import terrain_request_raster as raster
from . import terrain_requests as requests


def _documents(delivery: dict):
    records = [{
        "id": "place.test",
        "position": {"u": 0.5, "v": 0.5},
        "terrainRequests": [{"kind": "pool", "radiusM": 20,
                             "delivery": delivery, "note": "test fixture"}],
    }]
    plan, errors = requests.build_plan(records, extent_m=post.RAW_M * 40)
    assert not errors
    height = np.zeros((41, 41), dtype=np.float32)
    height_hash = hashlib.sha256(height.tobytes()).hexdigest()
    evidence_by_request = {}
    for request in plan["requests"]:
        operation = next(row for row in plan["operations"] if row["requestId"] == request["id"])
        sign = -1.0 if operation["action"] == "carve" else 1.0
        evidence = {
            "operationId": operation["id"],
            "deliverySha256": requests.delivery_digest(request["delivery"]),
            "deltaSha256": "d" * 64,
            "axis": [1.0, 0.0], "axisSource": "fixture",
            "profile": operation["profile"], "action": operation["action"],
            "coveredFields": sorted(request["delivery"]),
            "witnesses": [{"x": 20, "z": 20, "baseHeightM": -sign,
                           "appliedDeltaM": sign, "operationDeltaM": sign}],
        }
        payload = json.dumps(evidence, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        evidence["evidenceSha256"] = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        evidence_by_request[request["id"]] = evidence
    fulfillment = {
        "schemaVersion": requests.FULFILLMENT_SCHEMA_VERSION,
        "kind": "terrain-request-fulfillments",
        "sourceDigest": plan["sourceDigest"],
        "planDigest": plan["planDigest"],
        "postRefineHeightSha256": height_hash,
        "fulfillments": [{
            "requestId": row["id"], "operationIds": row["operationIds"],
            "evidenceRefs": [f"terrain-operation-evidence.{row['operationIds'][0]}.sha256."
                             f"{evidence_by_request[row['id']]['evidenceSha256']}"],
            "operationEvidence": [evidence_by_request[row["id"]]],
            "deliverySha256": requests.delivery_digest(row["delivery"]),
        } for row in plan["requests"]],
    }
    water = {
        "w_full": np.full(height.shape, 2.0, dtype=np.float32),
        "wet_full": np.ones(height.shape, dtype=bool),
        "body_full": np.ones(height.shape, dtype=np.int16),
        "chan_full": np.ones(height.shape, dtype=bool),
        "cls": np.full((14, 14), 4, dtype=np.uint8),
        "vx": np.zeros((14, 14), dtype=np.float32),
        "vz": np.zeros((14, 14), dtype=np.float32),
    }
    return plan, fulfillment, height, water, height_hash


def _report(delivery: dict, **overrides):
    plan, fulfillment, height, water, height_hash = _documents(delivery)
    return post.build_report(
        plan, overrides.get("fulfillment", fulfillment), height, water,
        artifact_hashes={"fixture": "a" * 64},
        water_height_sha256=overrides.get("water_height_sha256", height_hash),
    )


def test_measurable_depth_water_and_current_claims_pass():
    report = _report({
        "feature": "test-pool", "depthM": 1.5, "depthClass": "swimming",
        "waterRelation": "standing-water", "current": "standing",
    })
    assert report["status"] == "pass"
    assert all(row["status"] == "pass" for row in report["requests"][0]["findings"])


def test_semantic_claim_is_bound_to_surviving_operation_evidence():
    report = _report({"feature": "test-pool", "capacity": "punt"})
    finding = next(row for row in report["requests"][0]["findings"]
                   if row["field"] == "capacity")
    assert finding["status"] == "pass"
    assert "surviving terrain witnesses" in finding["detail"]
    assert report["status"] == "pass"


def test_erased_operation_witness_fails_every_execution_backed_field():
    plan, fulfillment, height, water, height_hash = _documents(
        {"feature": "test-pool", "capacity": "punt", "widthM": 8.0})
    fulfillment = copy.deepcopy(fulfillment)
    evidence = fulfillment["fulfillments"][0]["operationEvidence"][0]
    evidence["witnesses"][0]["baseHeightM"] = 0.0
    evidence.pop("evidenceSha256")
    payload = json.dumps(evidence, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    evidence["evidenceSha256"] = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    fulfillment["fulfillments"][0]["evidenceRefs"] = [
        f"terrain-operation-evidence.{evidence['operationId']}.sha256.{evidence['evidenceSha256']}"]
    report = post.build_report(plan, fulfillment, height, water,
                               artifact_hashes={"fixture": "a" * 64},
                               water_height_sha256=height_hash)
    assert report["status"] == "fail"
    by_field = {row["field"]: row for row in report["requests"][0]["findings"]}
    assert by_field["terrainSurvival"]["status"] == "fail"
    assert by_field["capacity"]["status"] == "fail"
    assert by_field["widthM"]["status"] == "fail"


def test_spatially_local_downstream_erasure_invalidates_semantic_shape_promises():
    delivery = {"feature": "divided-pool", "widthM": 20.0, "lengthM": 28.0,
                "featureCount": 3, "access": "swimming", "sides": 3}
    record = {"id": "place.test", "position": {"u": 0.5, "v": 0.5},
              "terrainRequests": [{"kind": "pool", "radiusM": 18.0,
                                    "delivery": delivery, "note": "fixture"}]}
    plan, errors = requests.build_plan([record], extent_m=40.0)
    assert not errors
    base = np.zeros((41, 41), dtype=np.float32)
    applied, fulfillment, _stats = raster.apply_plan(base, plan, 1.0)
    evidence = fulfillment["fulfillments"][0]["operationEvidence"][0]
    assert len(evidence["witnesses"]) == 64
    final = applied.copy()
    final[:, :21] = base[:, :21]  # erase one authored half, leave the other pristine
    final_hash = hashlib.sha256(final.tobytes()).hexdigest()
    water = {
        "w_full": final + 2.0, "wet_full": np.ones(final.shape, dtype=bool),
        "body_full": np.ones(final.shape, dtype=np.int16),
        "chan_full": np.ones(final.shape, dtype=bool),
        "cls": np.full((14, 14), 4, dtype=np.uint8),
        "vx": np.zeros((14, 14), dtype=np.float32),
        "vz": np.zeros((14, 14), dtype=np.float32),
    }
    report = post.build_report(plan, fulfillment, final, water,
                               artifact_hashes={"fixture": "a" * 64},
                               water_height_sha256=final_hash)
    by_field = {row["field"]: row for row in report["requests"][0]["findings"]}
    assert by_field["terrainSurvival"]["status"] == "fail"
    for field in ("widthM", "lengthM", "featureCount", "access", "sides"):
        assert by_field[field]["status"] == "fail"


def test_missing_water_to_height_provenance_is_a_hard_unsupported_failure():
    report = _report({"feature": "test-pool"}, water_height_sha256=None)
    finding = next(row for row in report["globalFindings"]
                   if row["field"] == "waterSourceHeightSha256")
    assert finding["status"] == "unsupported"
    assert report["status"] == "fail"


def test_final_report_binds_post_grade_height_not_the_refine_receipt():
    plan, fulfillment, height, water, height_hash = _documents({"feature": "test-pool"})
    fulfillment = copy.deepcopy(fulfillment)
    fulfillment["postRefineHeightSha256"] = "0" * 64
    report = post.build_report(plan, fulfillment, height, water,
                               artifact_hashes={"fixture": "a" * 64},
                               water_height_sha256=height_hash)
    finding = next(row for row in report["globalFindings"]
                   if row["field"] == "finalHeightSha256")
    assert finding["status"] == "pass"
    assert finding["measured"] == height_hash
    assert report["finalHeightSha256"] == height_hash


def test_report_digest_covers_measurements_and_input_hashes():
    first = _report({"feature": "test-pool"})
    plan, fulfillment, height, water, height_hash = _documents({"feature": "test-pool"})
    second = post.build_report(plan, fulfillment, height, water,
                               artifact_hashes={"fixture": "b" * 64},
                               water_height_sha256=height_hash)
    assert first["reportDigest"] != second["reportDigest"]


def test_requested_depth_failure_is_not_hidden_by_operation_manifest():
    report = _report({"feature": "test-pool", "depthM": 3.0})
    finding = next(row for row in report["requests"][0]["findings"]
                   if row["field"] == "depthM")
    assert finding["status"] == "fail"
    assert finding["measured"] == {"maxDepthM": 2.0}


def test_current_is_measured_only_on_final_wet_samples():
    plan, fulfillment, height, water, height_hash = _documents(
        {"feature": "test-pool", "current": "standing"})
    water["wet_full"][:] = False
    report = post.build_report(plan, fulfillment, height, water,
                               artifact_hashes={"fixture": "a" * 64},
                               water_height_sha256=height_hash)
    finding = next(row for row in report["requests"][0]["findings"]
                   if row["field"] == "current")
    assert finding["status"] == "fail"
    assert finding["measured"] == {"medianSpeedMS": 0.0, "classes": []}


def test_above_flood_uses_nearest_bounded_wet_component_outside_sculpt_radius():
    plan, fulfillment, height, water, height_hash = _documents(
        {"feature": "dry-rise", "waterRelation": "above-flood"})
    water["wet_full"][:] = False
    water["w_full"][:] = -np.inf
    # The wet component is outside the 20 m operation disc but well inside
    # the explicitly bounded context search.
    water["wet_full"][0, 0:4] = True
    water["w_full"][0, 0:4] = -2.0
    report = post.build_report(plan, fulfillment, height, water,
                               artifact_hashes={"fixture": "a" * 64},
                               water_height_sha256=height_hash)
    finding = next(row for row in report["requests"][0]["findings"]
                   if row["field"] == "waterRelation")
    assert finding["status"] == "pass"


def test_three_sided_water_does_not_require_a_false_island_contract():
    plan, fulfillment, height, water, height_hash = _documents(
        {"feature": "three-sided-rise", "waterRelation": "water-on-three-sides"})
    water["wet_full"][:] = False
    water["w_full"][:] = -np.inf
    water["wet_full"][20, 10] = True   # west
    water["wet_full"][20, 30] = True   # east
    water["wet_full"][10, 20] = True   # north; south remains the approach
    water["w_full"][water["wet_full"]] = -1.0
    report = post.build_report(plan, fulfillment, height, water,
                               artifact_hashes={"fixture": "a" * 64},
                               water_height_sha256=height_hash)
    finding = next(row for row in report["requests"][0]["findings"]
                   if row["field"] == "waterRelation")
    assert finding["status"] == "pass"
    assert finding["measured"] == {"wetSides": 3, "centreDry": True}


# --- live wiring -----------------------------------------------------------
# Everything above is synthetic. These tests bind the module to the records
# refine_province actually publishes, so the module rotting is a test failure
# rather than a silent one.

PUBLISHED_PLAN = post.PUBLISHED_DIR / "terrain-request-plan.json"
PUBLISHED_FULFILLMENT = post.PUBLISHED_DIR / "terrain-request-fulfillments.json"
PUBLISHED_STATS = post.PUBLISHED_DIR / "terrain-request-stats.json"


def _published(path):
    if not path.exists():
        pytest.skip(f"{path.name} not published yet")
    return json.loads(path.read_text(encoding="utf-8"))


def test_published_terrain_request_records_satisfy_the_real_manifest_check():
    plan = _published(PUBLISHED_PLAN)
    fulfillment = _published(PUBLISHED_FULFILLMENT)
    stats = _published(PUBLISHED_STATS)
    assert requests.verify_fulfillment_manifest(plan, fulfillment) == []
    assert {row["id"] for row in plan["operations"]} == {row["operationId"] for row in stats}


def test_known_red_register_names_only_live_published_requests():
    """The water-owned red list cannot drift away from the published plan."""
    plan = _published(PUBLISHED_PLAN)
    known_red = post.load_known_red()
    assert known_red, "the known-red register must exist and be non-empty while water is red"
    live = {row["id"] for row in plan["requests"]}
    assert set(known_red) <= live, sorted(set(known_red) - live)


def test_final_water_postconditions_are_green_apart_from_the_known_red_water_rows():
    """The real gate: rasters + published records, known-red reported not hidden."""
    from .compile_chunks import DEFAULT_HEIGHTS

    water_path = DEFAULT_HEIGHTS.parent.parent / "water-pass1.npz"
    if not (DEFAULT_HEIGHTS.exists() and water_path.exists()):
        pytest.skip("province rasters are vault-only; not available in this checkout")
    plan = _published(PUBLISHED_PLAN)
    fulfillment = _published(PUBLISHED_FULFILLMENT)
    height = np.load(DEFAULT_HEIGHTS).astype(np.float32)
    loaded = np.load(water_path)
    water = {name: loaded[name] for name in loaded.files}
    report = post.build_report(plan, fulfillment, height, water,
                              artifact_hashes={}, water_height_sha256=None)
    split = post.classify_report(report, post.load_known_red())
    assert split["unexpectedFailures"] == []
    assert split["missingFromReport"] == []
    assert split["recoveredNoLongerRed"] == [], (
        "these no longer fail — delete them from the known-red register")
    assert split["knownRed"], "the water rows must still be visibly red, not silently green"
