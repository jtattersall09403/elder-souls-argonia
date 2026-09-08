"""Focused execution tests for the G11 typed terrain-request raster engine."""

from __future__ import annotations

import copy
import hashlib
import json

import numpy as np
import pytest

from . import terrain_request_raster as raster
from . import terrain_requests as tr
from .scale import (AUTHORED_UV_EXTENT_M, RAW_M, SOURCE_GRID_SAMPLES,
                    TERRAIN_SUPPORT_EXTENT_M)


EXTENT = 40.0
MPS = 1.0


def _record(kind: str, index: int, *, u: float = 0.5, v: float = 0.5,
            radius: float = 8.0) -> dict:
    return {
        "id": f"place.test.{index:02d}.{kind}",
        "position": {"u": u, "v": v},
        "terrainRequests": [{"kind": kind, "radiusM": radius,
                              "delivery": {"feature": kind}, "note": f"Test {kind}."}],
    }


def _plan(records: list[dict]) -> dict:
    plan, errors = tr.build_plan(records, extent_m=EXTENT)
    assert not errors
    return plan


def _height() -> np.ndarray:
    z, x = np.mgrid[0:41, 0:41]
    return (100.0 + x * 0.12 - z * 0.21 + np.sin(x / 5.0) * 0.03).astype(np.float32)


def _rehash_plan(plan: dict) -> None:
    payload = {key: plan[key] for key in
               ("extentM", "sourceDigest", "policyDigest", "requests", "operations")}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    plan["planDigest"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def test_production_registration_uses_real_terrain_support_not_a_magic_overhang():
    raster._validate_raster_registration(
        (SOURCE_GRID_SAMPLES, SOURCE_GRID_SAMPLES), RAW_M, AUTHORED_UV_EXTENT_M)
    assert (SOURCE_GRID_SAMPLES - 1) * RAW_M == TERRAIN_SUPPORT_EXTENT_M
    with pytest.raises(raster.TerrainRequestRasterError, match="raster support"):
        raster._validate_raster_registration(
            (SOURCE_GRID_SAMPLES - 1, SOURCE_GRID_SAMPLES), RAW_M,
            AUTHORED_UV_EXTENT_M)


def test_all_fifteen_profiles_execute_with_distinct_signed_footprints_and_exact_manifest():
    records = [_record(kind, index) for index, kind in enumerate(sorted(tr.KIND_SPECS))]
    plan = _plan(records)
    wet = np.zeros((41, 41), dtype=bool)
    wet[:, 3] = True
    flow = np.zeros((41, 41, 2), dtype=np.float32)
    flow[..., 1] = 1.0

    result, manifest, stats = raster.apply_plan(
        _height(), plan, MPS, flow_vectors=flow, wet_mask=wet)

    assert result.shape == (41, 41)
    assert np.all(np.isfinite(result))
    assert len(stats) == len(tr.KIND_SPECS) == 15
    assert len({row["profile"] for row in stats}) == 15
    assert len({row["deltaSha256"] for row in stats}) == 15
    assert all(row["affectedSamples"] > 0 and row["meanAbsDeltaM"] > 0 for row in stats)
    for row in stats:
        if row["action"] == "carve":
            assert row["minDeltaM"] < 0 and row["maxDeltaM"] <= 0
        else:
            assert row["maxDeltaM"] > 0 and row["minDeltaM"] >= 0
    assert not tr.verify_fulfillment_manifest(plan, manifest)
    assert {row["requestId"] for row in manifest["fulfillments"]} == {
        row["id"] for row in plan["requests"]
    }
    sources = {row["axisSource"] for row in stats}
    assert {"none", "local-gradient", "local-contour", "local-flow",
            "nearest-water-path"} <= sources


def test_edge_operation_is_clipped_and_never_wraps_to_opposite_edge():
    plan = _plan([_record("dry-rise", 0, u=0.0, v=0.0, radius=10.0)])
    source = np.zeros((41, 41), dtype=np.float32)
    result, _manifest, stats = raster.apply_plan(source, plan, MPS)

    assert stats[0]["sampleBounds"] == {"minX": 0, "minZ": 0, "maxX": 10, "maxZ": 10}
    assert result[0, 0] > 0
    assert np.all(result[11:, :] == 0)
    assert np.all(result[:, 11:] == 0)
    assert result[-1, -1] == 0


def test_application_is_deterministic_does_not_mutate_inputs_and_falls_back_without_fields():
    plan = _plan([_record("ford", 0), _record("cut", 1), _record("narrows", 2)])
    source = _height()
    untouched = source.copy()

    first, first_manifest, first_stats = raster.apply_plan(source, plan, MPS)
    second, second_manifest, second_stats = raster.apply_plan(source, plan, MPS)

    np.testing.assert_array_equal(source, untouched)
    np.testing.assert_array_equal(first, second)
    assert first_manifest == second_manifest
    assert first_stats == second_stats
    assert {row["axisSource"] for row in first_stats} == {"local-gradient-fallback"}


def test_synthetic_raster_cannot_claim_an_unmodelled_two_sample_overhang():
    plan = _plan([_record("knoll", 0)])
    source = _height()[:-2, :-2]
    with pytest.raises(raster.TerrainRequestRasterError, match="plan coordinate extent"):
        raster.apply_plan(source, plan, MPS)


@pytest.mark.parametrize("mutation, expected", [
    ("missing", "missing planned operations"),
    ("stale", "stale unreferenced operations"),
])
def test_missing_and_stale_operations_fail_before_raster_application(mutation: str, expected: str):
    plan = _plan([_record("knoll", 0)])
    if mutation == "missing":
        plan["operations"] = []
    else:
        stale = copy.deepcopy(plan["operations"][0])
        stale["id"] = "terrain-op.stale"
        plan["operations"].append(stale)
    _rehash_plan(plan)
    source = _height()
    untouched = source.copy()

    with pytest.raises(raster.TerrainRequestRasterError, match=expected):
        raster.apply_plan(source, plan, MPS)
    np.testing.assert_array_equal(source, untouched)


def test_changed_operation_document_and_bad_raster_contracts_fail_closed():
    plan = _plan([_record("pool", 0)])
    stale_policy = copy.deepcopy(plan)
    stale_policy["operations"][0]["parameters"]["deltaM"] += 1.0
    with pytest.raises(raster.TerrainRequestRasterError, match="planDigest"):
        raster.apply_plan(_height(), stale_policy, MPS)

    with pytest.raises(raster.TerrainRequestRasterError, match="raster support"):
        raster.apply_plan(np.zeros((40, 41), dtype=np.float32), plan, MPS)
    with pytest.raises(raster.TerrainRequestRasterError, match="flow_vectors"):
        raster.apply_plan(_height(), plan, MPS, flow_vectors=np.zeros((41, 41, 3)))
    with pytest.raises(raster.TerrainRequestRasterError, match="wet_mask"):
        raster.apply_plan(_height(), plan, MPS, wet_mask=np.zeros((41, 41), dtype=np.uint8))


def test_flow_and_nearest_water_axes_are_resolved_from_supplied_fields():
    plan = _plan([_record("ford", 0), _record("cut", 1)])
    flow = np.zeros((41, 41, 2), dtype=np.float32)
    flow[..., 1] = 4.0
    wet = np.zeros((41, 41), dtype=bool)
    wet[20, 4] = True

    _result, _manifest, stats = raster.apply_plan(
        _height(), plan, MPS, flow_vectors=flow, wet_mask=wet)
    by_profile = {row["profile"]: row for row in stats}
    assert by_profile["channel-bed-sill"]["axis"] == [0.0, 1.0]
    assert by_profile["channel-bed-sill"]["axisSource"] == "local-flow"
    assert by_profile["channel-link"]["axis"] == [-1.0, 0.0]
    assert by_profile["channel-link"]["axisSource"] == "nearest-water-path"


@pytest.mark.parametrize("field,left,right", [
    ("depthM", 3.0, 7.0),
    ("widthM", 5.0, 11.0),
    ("lengthM", 7.0, 13.0),
    ("featureCount", 1, 3),
    ("bank", "hard", "shelving"),
    ("current", "swift", "slack"),
])
def test_typed_delivery_mutations_change_raster_and_fulfillment(field: str, left: object, right: object):
    record = _record("pool", 0, radius=8.0)
    record["terrainRequests"][0]["delivery"][field] = left
    first_plan = _plan([record])
    first, first_manifest, first_stats = raster.apply_plan(_height(), first_plan, MPS)

    changed = copy.deepcopy(record)
    changed["terrainRequests"][0]["delivery"][field] = right
    second_plan = _plan([changed])
    second, second_manifest, second_stats = raster.apply_plan(_height(), second_plan, MPS)

    assert first_plan["planDigest"] != second_plan["planDigest"]
    assert first_manifest["fulfillments"][0]["deliverySha256"] != \
        second_manifest["fulfillments"][0]["deliverySha256"]
    assert first_stats[0]["deltaSha256"] != second_stats[0]["deltaSha256"]
    assert not np.array_equal(first, second)


def test_authored_orientation_overrides_derived_axis():
    record = _record("cliff-bench", 0)
    record["terrainRequests"][0]["delivery"]["orientation"] = "south"
    _result, _manifest, stats = raster.apply_plan(_height(), _plan([record]), MPS)
    assert stats[0]["axis"] == [0.0, 1.0]
    assert stats[0]["axisSource"] == "authored-orientation"


def test_note_is_explanation_only_and_never_drives_raster_geometry():
    first_record = _record("pool", 0)
    second_record = copy.deepcopy(first_record)
    second_record["terrainRequests"][0]["note"] = "Different rationale, identical terrain contract."
    first, _manifest, _stats = raster.apply_plan(_height(), _plan([first_record]), MPS)
    second, _manifest, _stats = raster.apply_plan(_height(), _plan([second_record]), MPS)
    np.testing.assert_array_equal(first, second)
