import json

import numpy as np
import pytest

from . import grade_settlement_pads as pads


def _doc(*, raised_corner: bool = False) -> dict:
    return {
        "schemaVersion": 1,
        "blueprint": {
            "id": "place.test.pad",
            "parcels": [{
                "id": "parcel.test.pad",
                "groundFit": "pad",
                "footprint": [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]],
                "yawDeg": 90 if raised_corner else 0,
            }],
        },
    }


def test_pad_is_applied_with_bounded_feather_and_receipt():
    height = np.zeros((41, 41), dtype=np.float32)
    height[:, :] = np.linspace(0.0, 1.0, 41, dtype=np.float32)[None, :]
    specs = pads.pad_specs([_doc()], extent_m=40.0)
    result, rows = pads.apply_pad_grades(height, specs, metres_per_sample=1.0)

    assert rows[0]["postcondition"] == "pass"
    assert rows[0]["measuredDeltaM"] == pytest.approx(0.4)
    assert 0 < rows[0]["changedSamples"] < result.size
    assert rows[0]["maxFillM"] <= pads.MAX_PAD_DELTA_M
    assert rows[0]["maxCutM"] <= pads.MAX_PAD_DELTA_M
    assert result[0, 0] == pytest.approx(height[0, 0], abs=1e-6)
    assert result[13, 20] < result[27, 20]
    receipt = pads.build_receipt(height, result, rows)
    payload = {key: receipt[key] for key in receipt if key != "receiptSha256"}
    assert receipt["receiptSha256"] == pads._sha(pads._canonical(payload))


def test_pad_grading_is_byte_deterministic_and_receipt_prevents_reapplication():
    rng = np.random.default_rng(41)
    height = rng.uniform(10.0, 10.2, (41, 41)).astype(np.float32)
    specs = pads.pad_specs([_doc(raised_corner=True)], extent_m=40.0)
    first, rows_a = pads.apply_pad_grades(height, specs, metres_per_sample=1.0)
    repeat, rows_b = pads.apply_pad_grades(height, specs, metres_per_sample=1.0)
    assert first.tobytes() == repeat.tobytes()
    assert json.dumps(rows_a, sort_keys=True) == json.dumps(rows_b, sort_keys=True)
    receipt = pads.build_receipt(height, first, rows_a)
    assert pads.already_applied(receipt, first, specs)
    changed = json.loads(json.dumps(specs))
    changed[0]["sourceBlueprintSha256"] = "changed"
    assert not pads.already_applied(receipt, first, changed)


def test_pad_over_two_metres_fails_without_mutating_input():
    height = np.zeros((41, 41), dtype=np.float32)
    height[:, 28:] = 3.0
    before = height.copy()
    specs = pads.pad_specs([_doc()], extent_m=40.0)
    with pytest.raises(ValueError, match="exceeds 2.0 m pad limit"):
        pads.apply_pad_grades(height, specs, metres_per_sample=1.0)
    assert np.array_equal(height, before)


def test_hard_pad_footprints_may_not_overlap():
    doc = _doc()
    duplicate = json.loads(json.dumps(doc))
    duplicate["blueprint"]["id"] = "place.test.other"
    duplicate["blueprint"]["parcels"][0]["id"] = "parcel.test.other"
    specs = pads.pad_specs([doc, duplicate], extent_m=40.0)
    with pytest.raises(ValueError, match="overlaps another pad"):
        pads.apply_pad_grades(np.zeros((41, 41), np.float32), specs,
                              metres_per_sample=1.0)
