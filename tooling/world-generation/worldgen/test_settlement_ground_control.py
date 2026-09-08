"""Synthetic coverage for the settlement ground-control postprocessor."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import numpy as np
from PIL import Image

from .settlement_ground_control import (
    BUILT_GROUND_MATERIAL_ID,
    open_water_from_surface,
    paint_ground_control,
    process_files,
)


def _control(height: int = 8, width: int = 8) -> np.ndarray:
    value = np.zeros((height, width, 4), dtype=np.uint8)
    value[..., 0] = 6
    value[..., 1] = 10
    value[..., 2] = 77
    value[..., 3] = np.arange(height * width, dtype=np.uint8).reshape(height, width)
    return value


def _square(x0: float, z0: float, x1: float, z1: float) -> list[tuple[float, float]]:
    return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]


def test_world_x_maps_to_columns_and_southward_z_maps_to_rows():
    control = _control()
    result, _stats = paint_ground_control(
        control, np.zeros((8, 8), dtype=bool), [_square(5, 1, 7, 3)],
        extent_m=7, yard_apron_m=0, edge_blend_m=0.1)
    changed = result[..., 0] == BUILT_GROUND_MATERIAL_ID
    assert np.array_equal(np.argwhere(changed), np.array([
        [1, 5], [1, 6], [1, 7], [2, 5], [2, 6], [2, 7],
        [3, 5], [3, 6], [3, 7]]))


def test_polygon_and_apron_clip_cleanly_at_province_boundary():
    result, stats = paint_ground_control(
        _control(5, 5), np.zeros((5, 5), dtype=bool), [_square(-2, -2, 1, 1)],
        extent_m=4, yard_apron_m=1, edge_blend_m=0.1)
    changed = result[..., 0] == BUILT_GROUND_MATERIAL_ID
    assert changed[0, 0]
    assert changed[0, 1]
    assert changed[1, 0]
    assert changed[1, 1]  # diagonal centre remains within the one-metre apron
    assert not changed[2, 2]
    assert stats["candidateTexels"] == 8


def test_open_water_is_never_painted():
    water = np.zeros((6, 6), dtype=bool)
    water[2, 3] = True
    result, stats = paint_ground_control(
        _control(6, 6), water, [_square(1, 1, 5, 5)],
        extent_m=5, yard_apron_m=0, edge_blend_m=0.1)
    assert result[2, 3, 0] == 6
    assert result[2, 2, 0] == BUILT_GROUND_MATERIAL_ID
    assert stats["openWaterExcludedTexels"] == 1


def test_edge_uses_old_primary_as_secondary_and_preserves_macro_alpha():
    control = _control(7, 7)
    alpha = control[..., 3].copy()
    result, stats = paint_ground_control(
        control, np.zeros((7, 7), dtype=bool), [_square(2, 2, 5, 5)],
        extent_m=6, yard_apron_m=0, edge_blend_m=1.5)
    # Centre is fully built; an adjacent texel is a partial old-ground edge.
    assert tuple(result[3, 3, :3]) == (BUILT_GROUND_MATERIAL_ID, 6, 0)
    assert result[3, 1, 0] == BUILT_GROUND_MATERIAL_ID
    assert result[3, 1, 1] == 6
    assert 0 < result[3, 1, 2] < 255
    assert np.array_equal(result[..., 3], alpha)
    assert stats["coreTexels"] > 0 and stats["edgeTexels"] > 0


def test_existing_path_primary_has_stale_weight_reasserted():
    control = _control(5, 5)
    control[2, 2, :3] = (BUILT_GROUND_MATERIAL_ID, 6, 219)
    result, _stats = paint_ground_control(
        control, np.zeros((5, 5), dtype=bool), [_square(1, 1, 3, 3)],
        extent_m=4, yard_apron_m=0, edge_blend_m=0.1)
    assert tuple(result[2, 2, :3]) == (BUILT_GROUND_MATERIAL_ID, 6, 0)


def test_water_surface_signed_depth_decoding_and_registration():
    # 2x2 vertex samples span a 4 m extent; the north-east sample is wet.
    surface = np.zeros((2, 2, 3), dtype=np.uint8)
    surface[..., 2] = 50  # depth = -1 m under the synthetic encoding
    surface[0, 1, 2] = 200  # depth = +2 m
    meta = {"surface": {"size": 2, "metresPerPixel": 4,
                        "depthMinM": -2, "depthSpanM": 4}}
    actual = open_water_from_surface(surface, meta, (4, 4), extent_m=4)
    expected = np.zeros((4, 4), dtype=bool)
    expected[0:2, 2:4] = True
    assert np.array_equal(actual, expected)


def _write_inputs(root: Path) -> tuple[dict, list[Path]]:
    bundle = {
        "schemaVersion": 1,
        "groundTreatments": [{"id": "treatment.test", "footprintM":
                              [[1, 1], [3, 1], [3, 3], [1, 3]]}],
    }
    bundle_path = root / "settlements.json"
    control_path = root / "ground-control.png"
    water_path = root / "water-surface.png"
    meta_path = root / "water-meta.json"
    provenance_path = root / "ground-control.settlements.json"
    bundle_path.write_text(json.dumps(bundle))
    Image.fromarray(_control(4, 4), "RGBA").save(control_path)
    surface = np.zeros((2, 2, 3), dtype=np.uint8)
    Image.fromarray(surface, "RGB").save(water_path)
    meta_path.write_text(json.dumps({"surface": {"size": 2, "metresPerPixel": 4,
                                                  "depthMinM": -2, "depthSpanM": 4}}))
    return bundle, [bundle_path, control_path, water_path, meta_path, provenance_path]


def test_content_addressed_manifest_and_atomic_stale_failure(tmp_path):
    bundle, paths = _write_inputs(tmp_path)
    bundle_path, control_path, water_path, meta_path, provenance_path = paths
    result = process_files(bundle_path, control_path, water_path, meta_path,
                           provenance_path, expected_bundle=copy.deepcopy(bundle), extent_m=4)
    assert len(result["inputs"]["settlementBundleSha256"]) == 64
    assert len(result["policySha256"]) == 64
    assert len(result["outputSha256"]) == 64
    assert json.loads(provenance_path.read_text())["coverage"]["treatmentCount"] == 1

    old_control = control_path.read_bytes()
    old_provenance = provenance_path.read_bytes()
    stale_expected = copy.deepcopy(bundle)
    stale_expected["groundTreatments"][0]["footprintM"][0] = [0, 0]
    try:
        process_files(bundle_path, control_path, water_path, meta_path,
                      provenance_path, expected_bundle=stale_expected, extent_m=4)
    except ValueError as exc:
        assert "stale settlement bundle" in str(exc)
    else:
        raise AssertionError("stale bundle should fail")
    assert control_path.read_bytes() == old_control
    assert provenance_path.read_bytes() == old_provenance


def test_missing_bundle_fails_without_touching_outputs(tmp_path):
    _bundle, paths = _write_inputs(tmp_path)
    bundle_path, control_path, water_path, meta_path, provenance_path = paths
    bundle_path.unlink()
    old_control = control_path.read_bytes()
    try:
        process_files(bundle_path, control_path, water_path, meta_path, provenance_path)
    except ValueError as exc:
        assert "missing settlement bundle" in str(exc)
    else:
        raise AssertionError("missing bundle should fail")
    assert control_path.read_bytes() == old_control
    assert not provenance_path.exists()
