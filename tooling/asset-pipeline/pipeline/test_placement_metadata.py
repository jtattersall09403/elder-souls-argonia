import json
import os
from pathlib import Path

import numpy as np
import pytest

from .placement_metadata import (
    BUILT_KITS_DIR,
    PUBLISHED_KITS_DIR,
    REPO_ROOT,
    SETTLEMENT_BUNDLE,
    apply_placement_metadata,
    bundle_used_assets,
    collect_used_asset_coverage,
    coverage_findings,
    load_anchors,
    load_inventory,
    normalize_asset_id,
    refresh_built_manifests,
    resolve_anchor_class,
    shipped_contract_findings,
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


def test_a_water_policy_row_carries_its_own_waterline_fallback():
    """16h round 18 ruling 3: the rows that seat water-class assets carry
    fallbackWaterlineM (never read from fallbackSinkM); a bad value fails."""
    import copy
    inventory = load_inventory()
    assert {policy_id: row.get("fallbackWaterlineM")
            for policy_id, row in inventory["policies"].items()
            if "fallbackWaterlineM" in row} == {
        "water-zero": 0.0, "stilt": 0.12, "pad": 0.18, "dug-in": 0.35}
    broken = copy.deepcopy(inventory)
    broken["policies"]["pad"]["fallbackWaterlineM"] = "0.18"
    assert "policy 'pad' has invalid fallbackWaterlineM" in validate_policy_inventory(broken)


def test_build_metadata_combines_measured_contact_with_authored_policy():
    manifest = {"assets": [_asset()]}
    apply_placement_metadata(manifest, "settlement-mud-v1")

    assert manifest["assets"][0]["placement"] == {
        "schemaVersion": 1,
        "anchorMode": "streamed-perimeter",
        "groundContactOffsetM": 0.539,
        "buryCapM": 0.5,
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
        "mudmother:gv_meshes/argoniannest/mudhut01: missing designedSinkM",
        "mudmother:gv_meshes/argoniannest/mudhut01: missing required placement metadata",
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
    # The expanded interior families are the ones the published settlement
    # bundle's compiled objects claim (read from the product, not from the
    # source walk the report makes), so the set follows the shipped places:
    # empty on the yard alone, dungeon-root-v1 when a root dungeon ships.
    bundle = json.loads(SETTLEMENT_BUNDLE.read_text())
    claimed = {normalize_asset_id(ref)
               for obj in bundle.get("compiledObjects", [])
               for ref in [((obj.get("spec") or {}).get("interior") or {}).get("assetRef")]
               if isinstance(ref, str)}
    assert set(report.expanded) == claimed
    assert all("unresolved physical assetRef" in row for row in coverage_findings(report))


def test_a_compiled_placement_outside_the_kit_registry_is_unresolved(tmp_path):
    """The can-fail case for the coverage above: a compiled settlement that
    places an asset no kit config lists is reported, never silently counted."""
    out = tmp_path / "tooling/world-generation/output/settlements"
    out.mkdir(parents=True)
    (out / "place.test.settlement.json").write_text(json.dumps({"placements": [
        {"kit": "kit", "assetId": "known:asset"},
        {"kit": "kit", "assetId": "stray:asset"}]}))
    config_dir = tmp_path / "tooling/asset-pipeline/pipeline/config/kits"
    config_dir.mkdir(parents=True)
    (config_dir / "kit.json").write_text(json.dumps({
        "id": "kit", "assets": [{"asset": "known:asset"}]}))
    report = collect_used_asset_coverage(tmp_path, inventory={
        "assetPolicies": {"known:asset": {}}, "expandedRefs": {},
        "nonPhysicalCompiledRefs": {}})
    assert set(report.unresolved) == {"stray:asset"}
    assert set(report.resolved) == {"known:asset"}
    assert any("stray:asset" in row for row in coverage_findings(report))


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


# --- Phase 16h: designed ground contact, mounts and anchor class ------------- #

def _kit_manifests():
    for root in (BUILT_KITS_DIR, PUBLISHED_KITS_DIR):
        for path in sorted(root.glob("*.kit.json")):
            yield path, json.loads(path.read_text())


def test_every_shipped_kit_asset_carries_measured_ground_contact():
    """No asset may reach the compile with class-table burial and no evidence."""
    missing = [
        f"{path.name}:{asset.get('id')}"
        for path, document in _kit_manifests()
        for asset in document.get("assets", [])
        if not isinstance(asset.get("designedSinkM"), dict)
        or not isinstance(asset["designedSinkM"].get("evidence"), str)
        or not isinstance(asset.get("anchorClass"), str)
    ]
    assert missing == []


def test_shipped_kit_assets_satisfy_the_placement_contract():
    """16h K14: scoped to the assets the published settlement bundle places
    (a publish's gate); ``PLACEMENT_CONTRACT_SCOPE=catalogue`` checks every
    asset of every kit (the miner lane's gate)."""
    catalogue = os.environ.get("PLACEMENT_CONTRACT_SCOPE") == "catalogue"
    used = None if catalogue else bundle_used_assets()
    assert catalogue or used
    assert shipped_contract_findings(used=used) == []


def test_the_scoped_contract_skips_unplaced_assets_and_the_catalogue_form_does_not(tmp_path):
    bad = {"id": "k:bad", "originOffsetM": [0, 0, 0]}
    (tmp_path / "k.kit.json").write_text(json.dumps({"kit": "k", "assets": [bad]}))
    assert shipped_contract_findings([tmp_path], used={("k", "k:other")}) == []
    assert shipped_contract_findings([tmp_path], used={("k", "k:bad")})
    assert shipped_contract_findings([tmp_path], used=None)


def _measured(**updates):
    asset = _asset()
    asset["anchorClass"] = "ground"
    asset["anchorClassEvidence"] = "unplaced"
    asset["designedSinkM"] = {
        "p25": 0.1, "p50": 0.2, "p75": 0.3, "n": 12,
        "slopeTermMPerDeg": 0.01, "evidence": "plugin",
    }
    asset.update(updates)
    return asset


def test_mesh_sill_off_the_recorded_ground_line_fails():
    asset = _measured(
        designedSinkM={"p25": -0.4, "p50": -0.4, "p75": -0.4, "n": 0,
                       "slopeTermMPerDeg": None, "evidence": "mesh-sill"},
        groundLineTell={"type": "mesh", "tell": "floor-plane", "valueM": -0.75},
    )
    apply_placement_metadata_free = validate_asset_placement(asset)
    assert any("off the recorded ground line" in finding
               for finding in apply_placement_metadata_free)


def test_a_hanging_mesh_placed_on_the_ground_stays_ground_anchored():
    """The old geometry-only rule called bridges and water lilies "wall"."""
    asset = _measured(sizeM=[6.0, 2.0, 1.2], originOffsetM=[3.0, 1.0, 1.15],
                      anchorClassEvidence="plugin")
    assert [finding for finding in validate_asset_placement(asset)
            if "anchorClass" in finding] == []


def test_a_wall_asset_without_placement_evidence_fails():
    """Wall, hanging and deck come only from contact in the makers' placements."""
    for anchor_class in ("wall", "hanging", "deck"):
        asset = _measured(anchorClass=anchor_class, anchorClassEvidence="unplaced")
        assert any("without placement evidence" in finding
                   for finding in validate_asset_placement(asset))
        placed = _measured(anchorClass=anchor_class, anchorClassEvidence="plugin")
        assert [finding for finding in validate_asset_placement(placed)
                if "anchorClass" in finding or "placement evidence" in finding] == []


def test_anchor_class_is_read_from_the_mined_record_not_re_derived():
    asset = _measured(sizeM=[0.4, 0.4, 1.2], originOffsetM=[0.2, 0.2, 1.15])
    assert resolve_anchor_class(asset, {"anchorClass": "hanging",
                                        "anchorClassEvidence": "plugin"}) == ("hanging", "plugin")
    assert resolve_anchor_class(asset, None) == ("ground", "unplaced")


def test_load_anchors_reads_schema_3_and_refuses_the_older_ones(tmp_path):
    """schemaVersion 3 (16h round 6) classes by mesh contact and folds ceiling
    into hanging; a v1/v2 record's classes mean something else."""
    anchors = {"a:b/c": {"anchorClass": "hanging", "anchorClassEvidence": "plugin"}}
    path = tmp_path / "v3.json"
    path.write_text(json.dumps({"schemaVersion": 3, "anchors": anchors}))
    assert load_anchors(path) == anchors
    for version in (1, 2):
        path = tmp_path / f"v{version}.json"
        path.write_text(json.dumps({"schemaVersion": version, "anchors": anchors}))
        with pytest.raises(ValueError, match="schemaVersion"):
            load_anchors(path)


def test_water_anchored_asset_needs_its_designed_waterline():
    asset = _measured(anchorClass="water")
    assert any("needs designedWaterlineM" in finding
               for finding in validate_asset_placement(asset))


def _deck_on_legs(rise: float, width: float):
    """A ``width`` square deck slab 0.1 m thick on four 0.2 m legs ``rise`` long."""
    trimesh = pytest.importorskip("trimesh")
    half = width / 2
    parts = [trimesh.creation.box(extents=(width, width, 0.1),
                                  transform=trimesh.transformations.translation_matrix(
                                      (0, 0, rise - 0.05)))]
    for x in (-half + 0.1, half - 0.1):
        for y in (-half + 0.1, half - 0.1):
            parts.append(trimesh.creation.box(
                extents=(0.2, 0.2, rise - 0.1),
                transform=trimesh.transformations.translation_matrix((x, y, (rise - 0.1) / 2))))
    mesh = trimesh.util.concatenate(parts)
    return np.asarray(mesh.vertices), np.asarray(mesh.faces)


def test_a_stilt_fit_is_seated_by_its_deck_never_its_leg_tips():
    """16h round 13 (owner 2026-09-23): a stilt-fit dock on 3 m legs seats its
    deck top 0.35 m above the support; without the stilt fit the legs decide;
    a table (0.8 m, 1.2 m wide) in a stilt kit keeps its feet."""
    from .mesh_ground_line import ground_line_tell
    asset = {"id": "vanilla:test/dock01", "category": "architecture"}
    vertices, faces = _deck_on_legs(3.0, 4.0)
    tell = ground_line_tell(vertices, asset, stilt=True, triangles=(vertices, faces))
    assert (tell["tell"], tell["valueM"], tell["deckTopM"]) == ("deck-top", 2.65, 3.0), tell
    assert ground_line_tell(vertices, asset)["valueM"] == 0.0
    vertices, faces = _deck_on_legs(0.8, 1.2)
    assert ground_line_tell(vertices, asset, stilt=True,
                            triangles=(vertices, faces))["tell"] != "deck-top"


def test_the_category_word_architecture_is_not_a_door():
    """"arch" in the category ``architecture`` made every flush piece a door sill."""
    from .mesh_ground_line import ground_line_tell
    vertices, _faces = _deck_on_legs(0.05, 4.0)
    slab = {"id": "vanilla:test/slab01", "category": "architecture"}
    assert ground_line_tell(vertices, slab)["tell"] == "floor-plane"
    assert ground_line_tell(vertices, {**slab, "id": "vanilla:test/archgate01"})["tell"] == "door-sill"


def test_a_water_class_takes_the_mounts_row_waterline_when_the_sink_has_none():
    """16h round 17 ruling 3: the sink record's waterline first, else the
    mounts row's (water column, else policy); neither, no designedWaterlineM."""
    anchor = {"anchorClass": "water", "anchorClassEvidence": "plugin",
              "waterline": {"p50": 0.42, "n": 5, "evidence": "column"}}
    asset = _asset()
    apply_placement_metadata({"assets": [asset]}, "settlement-mud-v1", mined={},
                             anchors={asset["id"]: anchor})
    assert asset["designedWaterlineM"] == 0.42
    sink = {asset["id"]: {"waterline": {"p50": 0.1, "n": 9}}}
    apply_placement_metadata({"assets": [asset]}, "settlement-mud-v1", mined=sink,
                             anchors={asset["id"]: anchor})
    assert asset["designedWaterlineM"] == 0.1


def test_every_recorded_evidence_string_is_in_the_one_vocabulary():
    """16h round 17 ruling 5: the sink and mounts miners read the vocabulary
    from here and every evidence string in both records is in it."""
    import sys
    from .placement_metadata import (
        ANCHOR_ROW_EVIDENCE, DESIGNED_SINK_RECORD, EVIDENCE_VOCABULARY, MOUNTS_RECORD,
        REFERENCE_SOURCES, SINK_EVIDENCE_PREFIXES, WATERLINE_EVIDENCE)
    assert all(len(row) == 3 and row[2] for row in EVIDENCE_VOCABULARY)
    sys.path.insert(0, str(REPO_ROOT / "tooling" / "world-generation"))
    from worldgen import mine_designed_sink, mine_mounts
    assert mine_designed_sink.SINK_EVIDENCE_PREFIXES == SINK_EVIDENCE_PREFIXES
    assert mine_mounts.WATERLINE_EVIDENCE == WATERLINE_EVIDENCE
    sink = json.loads(DESIGNED_SINK_RECORD.read_text())["assets"]
    assert mine_designed_sink.evidence_findings(sink) == []
    anchors = json.loads(MOUNTS_RECORD.read_text())["anchors"]
    wrong = [(asset_id, key, row[key]) for asset_id, row in anchors.items()
             for key, allowed in (("evidence", ANCHOR_ROW_EVIDENCE),
                                  ("hangingFrom", REFERENCE_SOURCES),
                                  ("support", REFERENCE_SOURCES))
             if key in row and row[key] not in allowed]
    assert wrong == []


# --- assetPlacement rows (planner ruling 2026-09-24) ------------------------ #
_MUDHUT = "mudmother:gv_meshes/argoniannest/mudhut01"


def _with_rows(rows):
    import copy
    inventory = copy.deepcopy(load_inventory())
    inventory["assetPlacement"] = rows
    return inventory


def test_an_asset_placement_row_overrides_the_mined_class_sink_and_waterline():
    """A reviewed row decides at refresh time, ahead of both records."""
    inventory = _with_rows({_MUDHUT: {"anchorClass": "water", "designedSinkM": 0.4,
                                      "designedWaterlineM": -0.35, "why": "test"}})
    assert validate_policy_inventory(inventory) == []
    mined = {_MUDHUT: {"p25": 0.1, "p50": 0.2, "p75": 0.3, "n": 5,
                       "slopeTermMPerDeg": None, "evidence": "plugin",
                       "waterline": {"p50": -1.0}}}
    anchors = {_MUDHUT: {"anchorClass": "deck", "anchorClassEvidence": "plugin"}}
    asset = apply_placement_metadata({"assets": [_asset()]}, "settlement-mud-v1",
                                     inventory, mined=mined, anchors=anchors)["assets"][0]
    assert (asset["anchorClass"], asset["anchorClassEvidence"]) == ("water", "policy")
    assert asset["designedSinkM"] == {"p25": 0.4, "p50": 0.4, "p75": 0.4, "n": 0,
                                      "slopeTermMPerDeg": None, "evidence": "policy"}
    assert asset["designedWaterlineM"] == -0.35
    assert validate_asset_placement(asset) == []


def test_a_row_without_a_class_leaves_the_mined_class():
    inventory = _with_rows({_MUDHUT: {"designedSinkM": 0.4, "why": "test"}})
    anchors = {_MUDHUT: {"anchorClass": "hanging", "anchorClassEvidence": "plugin"}}
    asset = apply_placement_metadata({"assets": [_asset()]}, "settlement-mud-v1",
                                     inventory, mined={}, anchors=anchors)["assets"][0]
    assert (asset["anchorClass"], asset["anchorClassEvidence"]) == ("hanging", "plugin")
    assert asset["designedSinkM"]["p50"] == 0.4
    # a hanging row with policy evidence passes the contract; one with neither fails
    policy_hung = apply_placement_metadata(
        {"assets": [_asset()]}, "settlement-mud-v1",
        _with_rows({_MUDHUT: {"anchorClass": "hanging", "why": "door on its frame"}}),
        mined={}, anchors={})["assets"][0]
    assert validate_asset_placement(policy_hung) == []
    policy_hung["anchorClassEvidence"] = "unplaced"
    assert any("hanging without placement evidence" in f
               for f in validate_asset_placement(policy_hung))


def test_a_bad_asset_placement_row_fails_the_inventory():
    bad = _with_rows({_MUDHUT: {"anchorClass": "ground", "designedWaterlineM": -0.3},
                      "not:emitted/anywhere": {"anchorClass": "roof", "why": "x"}})
    findings = " | ".join(validate_policy_inventory(bad))
    assert "designedWaterlineM only belongs on anchorClass water" in findings
    assert f"assetPlacement {_MUDHUT!r}: needs a why" in findings
    assert "not emitted by a kit config" in findings and "anchorClass must be one of" in findings


def test_a_per_kit_refresh_touches_one_manifest(tmp_path):
    for kit in ("settlement-mud-v1", "docks-v1"):
        (tmp_path / f"{kit}.kit.json").write_text(
            json.dumps({"kit": kit, "assets": [_asset()]}))
    before = (tmp_path / "docks-v1.kit.json").read_text()
    assert refresh_built_manifests(tmp_path, mined={}, anchors={},
                                   kits={"settlement-mud-v1"}) == [
        tmp_path / "settlement-mud-v1.kit.json"]
    assert (tmp_path / "docks-v1.kit.json").read_text() == before
    assert "placement" in json.loads((tmp_path / "settlement-mud-v1.kit.json").read_text())["assets"][0]
