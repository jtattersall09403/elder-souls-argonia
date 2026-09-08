import copy
import hashlib

import numpy as np

from . import terrain_request_postconditions as post
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
    fulfillment = {
        "schemaVersion": requests.FULFILLMENT_SCHEMA_VERSION,
        "kind": "terrain-request-fulfillments",
        "sourceDigest": plan["sourceDigest"],
        "planDigest": plan["planDigest"],
        "finalHeightSha256": height_hash,
        "fulfillments": [{
            "requestId": row["id"], "operationIds": row["operationIds"],
            "evidenceRefs": ["terrain-raster.fixture"],
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


def test_unsupported_semantic_claim_fails_closed_with_blocker():
    report = _report({"feature": "test-pool", "capacity": "punt"})
    finding = next(row for row in report["requests"][0]["findings"]
                   if row["field"] == "capacity")
    assert finding["status"] == "unsupported"
    assert "clearance" in finding["detail"]
    assert report["status"] == "fail"


def test_missing_water_to_height_provenance_is_a_hard_unsupported_failure():
    report = _report({"feature": "test-pool"}, water_height_sha256=None)
    finding = next(row for row in report["globalFindings"]
                   if row["field"] == "waterSourceHeightSha256")
    assert finding["status"] == "unsupported"
    assert report["status"] == "fail"


def test_stale_fulfillment_height_hash_fails():
    plan, fulfillment, height, water, height_hash = _documents({"feature": "test-pool"})
    fulfillment = copy.deepcopy(fulfillment)
    fulfillment["finalHeightSha256"] = "0" * 64
    report = post.build_report(plan, fulfillment, height, water,
                               artifact_hashes={"fixture": "a" * 64},
                               water_height_sha256=height_hash)
    finding = next(row for row in report["globalFindings"]
                   if row["field"] == "finalHeightSha256")
    assert finding["status"] == "fail"
    assert finding["measured"]["actual"] == height_hash


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
