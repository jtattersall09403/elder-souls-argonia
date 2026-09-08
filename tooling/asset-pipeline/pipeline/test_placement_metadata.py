import json
from pathlib import Path

import pytest

from .placement_metadata import (
    REPO_ROOT,
    apply_placement_metadata,
    collect_used_asset_coverage,
    coverage_findings,
    load_inventory,
    normalize_asset_id,
    refresh_built_manifests,
    validate_asset_placement,
    validate_policy_inventory,
)
from .vet_kit import vet


def _asset(**updates):
    asset = {
        "id": "mudmother:gv_meshes/argoniannest/mudhut01",
        "sizeM": [5.9, 6.4, 5.1],
        "originOffsetM": [2.9, 3.0, 0.539],
    }
    asset.update(updates)
    return asset


def test_policy_inventory_covers_every_buildable_kit_without_a_hidden_default():
    assert validate_policy_inventory(load_inventory()) == []


def test_build_metadata_combines_measured_contact_with_authored_policy():
    manifest = {"assets": [_asset()]}
    apply_placement_metadata(manifest, "settlement-mud-v1")

    assert manifest["assets"][0]["placement"] == {
        "schemaVersion": 1,
        "anchorMode": "streamed-perimeter",
        "groundContactOffsetM": 0.539,
        "buryM": 0.18,
        "buryCapM": 0.5,
        "slopeBuryPerM": 0.08,
        "evidence": {
            "groundContactOffsetM": "measured transformed LOD0 bounds: originOffsetM[2]",
            "policyId": "pad",
            "fitPolicy": (
                "authored placement-policies.json policy pad: Reviewed graded-pad "
                "policy matching authored blueprint groundFit and the Phase 11 "
                "settlement grounding contract."
            ),
        },
    }
    assert validate_asset_placement(manifest["assets"][0]) == []


def test_build_metadata_refuses_to_invent_a_ground_contact_measurement():
    with pytest.raises(ValueError, match="measured originOffsetM"):
        apply_placement_metadata(
            {"assets": [_asset(originOffsetM=None)]}, "settlement-mud-v1",
        )


def test_policy_refresh_reuses_measured_manifest_without_rebuilding_geometry(tmp_path):
    manifest = tmp_path / "settlement-mud-v1.kit.json"
    document = {"kit": "settlement-mud-v1", "assets": [_asset()]}
    manifest.write_text(json.dumps(document))

    assert refresh_built_manifests(tmp_path) == [manifest]
    refreshed = json.loads(manifest.read_text())
    assert refreshed["assets"][0]["sizeM"] == document["assets"][0]["sizeM"]
    assert refreshed["assets"][0]["placement"]["groundContactOffsetM"] == 0.539
    assert validate_asset_placement(refreshed["assets"][0]) == []


def test_policy_refresh_ignores_retired_probe_output(tmp_path):
    manifest = tmp_path / "retired-probe.kit.json"
    original = {"kit": "retired-probe", "assets": [_asset()]}
    manifest.write_text(json.dumps(original))

    assert refresh_built_manifests(tmp_path) == []
    assert json.loads(manifest.read_text()) == original


def test_vet_fails_absent_and_stale_placement_metadata(tmp_path):
    manifest = tmp_path / "sample.kit.json"
    manifest.write_text(json.dumps({"assets": [_asset()]}))
    assert vet(str(manifest)) == [
        "mudmother:gv_meshes/argoniannest/mudhut01: missing required placement metadata"
    ]

    asset = _asset()
    apply_placement_metadata({"assets": [asset]}, "settlement-mud-v1")
    asset["placement"]["groundContactOffsetM"] = 99
    manifest.write_text(json.dumps({"assets": [asset]}))
    assert any("disagrees with measured" in finding for finding in vet(str(manifest)))


def test_repository_used_asset_coverage_is_dynamic_and_explicit():
    report = collect_used_asset_coverage(REPO_ROOT)

    # Do not freeze the historical count: source and available compiled output
    # determine it.  Every resolvable identity must have an asset-level review.
    assert report.resolved
    assert report.missing_policies == {}
    # Exact zero means a newly introduced unresolved physical assetRef cannot
    # quietly join a reviewed exception list.
    assert report.unresolved == {}
    assert set(report.expanded) == {"dungeon-root-v1"}
    assert all("unresolved physical assetRef" in row for row in coverage_findings(report))


def test_asset_identity_normalization_deduplicates_case_and_path_separators():
    assert normalize_asset_id("  Vanilla:Clutter\\Barrel01 ") == (
        "vanilla:clutter/barrel01"
    )


def test_unlisted_interior_family_is_not_silently_excluded(tmp_path):
    blueprint_dir = tmp_path / "world/sources/blueprints"
    blueprint_dir.mkdir(parents=True)
    (blueprint_dir / "place.fixture.json").write_text(json.dumps({
        "blueprint": {
            "parcels": [{"interior": {"assetRef": "unknown-family"}}],
        },
    }))
    config_dir = tmp_path / "tooling/asset-pipeline/pipeline/config/kits"
    config_dir.mkdir(parents=True)
    (config_dir / "kit.json").write_text(json.dumps({
        "id": "kit", "assets": [{"asset": "known:asset"}],
    }))

    report = collect_used_asset_coverage(tmp_path, inventory={
        "assetPolicies": {}, "expandedRefs": {}, "nonPhysicalCompiledRefs": {},
    })
    assert set(report.unresolved) == {"unknown-family"}
    assert report.expanded == {}
