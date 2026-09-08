"""Measured ground-contact metadata and authored placement policy for kit assets.

The Blender builder measures where a model's source pivot sits relative to its
lowest transformed bound.  It cannot measure how far a designer intends that
model to be buried or whether terrain should be sampled at one point or around
the footprint.  Those choices live in ``config/placement-policies.json`` and
are copied into every emitted asset record alongside the measured contact.

This module also provides the repository coverage gate.  It derives the used
asset set from the five authored place blueprints, authored route structures,
and any locally available compiled settlement/route outputs.  Counts are never
hard-coded, so adding a new physical ``assetRef`` without a kit asset and an
explicit reviewed policy fails the gate.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[3]
CONFIG_DIR = Path(__file__).resolve().parent / "config"
KIT_CONFIG_DIR = CONFIG_DIR / "kits"
PLACEMENT_CONFIG = CONFIG_DIR / "placement-policies.json"
BUILT_KITS_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
ANCHOR_MODES = {"streamed-origin", "streamed-perimeter"}
PLACEMENT_FIELDS = {
    "schemaVersion", "anchorMode", "groundContactOffsetM", "buryM",
    "buryCapM", "slopeBuryPerM", "evidence",
}


def normalize_asset_id(asset_id: str) -> str:
    """Return the identity used to deduplicate authored and compiled refs."""
    return asset_id.strip().replace("\\", "/").casefold()


def load_inventory(path: Path = PLACEMENT_CONFIG) -> dict[str, Any]:
    return json.loads(path.read_text())


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_policy_inventory(
    inventory: dict[str, Any], kit_config_dir: Path = KIT_CONFIG_DIR,
) -> list[str]:
    findings: list[str] = []
    policies = inventory.get("policies")
    kit_policies = inventory.get("kitPolicies")
    asset_policies = inventory.get("assetPolicies")
    if inventory.get("schemaVersion") != 1:
        findings.append("placement policy inventory schemaVersion must be 1")
    if not isinstance(policies, dict):
        return findings + ["placement policy inventory needs policies"]
    if not isinstance(kit_policies, dict):
        return findings + ["placement policy inventory needs kitPolicies"]
    if not isinstance(asset_policies, dict):
        return findings + ["placement policy inventory needs assetPolicies"]

    required = {"anchorMode", "buryM", "buryCapM", "slopeBuryPerM", "evidence"}
    for policy_id, policy in sorted(policies.items()):
        if not isinstance(policy, dict):
            findings.append(f"policy {policy_id!r} must be an object")
            continue
        missing = required - set(policy)
        if missing:
            findings.append(f"policy {policy_id!r} missing {sorted(missing)}")
            continue
        if policy["anchorMode"] not in ANCHOR_MODES:
            findings.append(f"policy {policy_id!r} has invalid anchorMode")
        for key in ("buryM", "buryCapM", "slopeBuryPerM"):
            if not _is_number(policy[key]) or policy[key] < 0:
                findings.append(f"policy {policy_id!r} has invalid {key}")
        if (_is_number(policy["buryM"]) and _is_number(policy["buryCapM"])
                and policy["buryM"] > policy["buryCapM"]):
            findings.append(f"policy {policy_id!r} buryM exceeds buryCapM")
        if not isinstance(policy["evidence"], str) or not policy["evidence"].strip():
            findings.append(f"policy {policy_id!r} needs authored evidence")

    configured_kits: set[str] = set()
    configured_assets: set[str] = set()
    for path in sorted(kit_config_dir.glob("*.json")):
        doc = json.loads(path.read_text())
        configured_kits.add(doc["id"])
        configured_assets.update(
            normalize_asset_id(row["asset"])
            for row in doc.get("assets", []) if isinstance(row.get("asset"), str)
        )
    for kit_id in sorted(configured_kits - set(kit_policies)):
        findings.append(f"kit {kit_id!r} has no authored placement policy")
    for kit_id, policy_id in sorted(kit_policies.items()):
        if policy_id not in policies:
            findings.append(f"kit {kit_id!r} names unknown policy {policy_id!r}")
    for asset_id, policy_id in sorted(asset_policies.items()):
        if asset_id != normalize_asset_id(asset_id):
            findings.append(f"asset policy key is not normalized: {asset_id!r}")
        if asset_id not in configured_assets:
            findings.append(f"asset policy {asset_id!r} is not emitted by a kit config")
        if policy_id not in policies:
            findings.append(f"asset {asset_id!r} names unknown policy {policy_id!r}")
    for section in ("expandedRefs", "nonPhysicalCompiledRefs"):
        rows = inventory.get(section, {})
        if not isinstance(rows, dict):
            findings.append(f"placement policy inventory needs object {section}")
            continue
        for asset_id, evidence in sorted(rows.items()):
            if asset_id != normalize_asset_id(asset_id):
                findings.append(f"{section} key is not normalized: {asset_id!r}")
            if not isinstance(evidence, str) or not evidence.strip():
                findings.append(f"{section} {asset_id!r} needs expansion/omission evidence")
    return findings


def _resolve_validated_policy(
    kit_id: str, asset_id: str, inventory: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    policy_id = inventory["assetPolicies"].get(normalize_asset_id(asset_id))
    if policy_id is None:
        policy_id = inventory["kitPolicies"].get(kit_id)
    if policy_id is None:
        raise ValueError(f"{kit_id}/{asset_id}: no authored placement policy")
    return policy_id, inventory["policies"][policy_id]


def resolve_policy(
    kit_id: str, asset_id: str, inventory: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any]]:
    inventory = inventory or load_inventory()
    findings = validate_policy_inventory(inventory)
    if findings:
        raise ValueError("invalid placement policy inventory: " + "; ".join(findings))
    return _resolve_validated_policy(kit_id, asset_id, inventory)


def apply_placement_metadata(
    manifest: dict[str, Any], kit_id: str,
    inventory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Attach the required contract to every asset, failing absent measurement."""
    inventory = inventory or load_inventory()
    findings = validate_policy_inventory(inventory)
    if findings:
        raise ValueError("invalid placement policy inventory: " + "; ".join(findings))
    for asset in manifest.get("assets", []):
        offset = asset.get("originOffsetM")
        if (not isinstance(offset, list) or len(offset) != 3
                or not all(_is_number(value) for value in offset)):
            raise ValueError(
                f"{kit_id}/{asset.get('id', '?')}: placement needs measured originOffsetM"
            )
        policy_id, policy = _resolve_validated_policy(kit_id, asset["id"], inventory)
        asset["placement"] = {
            "schemaVersion": 1,
            "anchorMode": policy["anchorMode"],
            # build_kit's transformed LOD0 bounds define originOffsetM = -bboxMin.
            "groundContactOffsetM": offset[2],
            "buryM": policy["buryM"],
            "buryCapM": policy["buryCapM"],
            "slopeBuryPerM": policy["slopeBuryPerM"],
            "evidence": {
                "groundContactOffsetM": "measured transformed LOD0 bounds: originOffsetM[2]",
                "policyId": policy_id,
                "fitPolicy": (
                    f"authored placement-policies.json policy {policy_id}: "
                    f"{policy['evidence']}"
                ),
            },
        }
    return manifest


def refresh_built_manifests(
    output_dir: Path = BUILT_KITS_DIR,
    inventory: dict[str, Any] | None = None,
) -> list[Path]:
    """Refresh policy-only metadata without rebuilding unchanged geometry.

    The ground contact measurement already lives in each built manifest as
    ``originOffsetM``.  Re-running Blender merely to copy a reviewed placement
    policy beside that measurement is expensive and cannot improve the data.
    Validate every candidate in memory first, then replace the manifests only
    when the whole batch is sound.
    """
    inventory = inventory or load_inventory()
    pending: list[tuple[Path, dict[str, Any]]] = []
    for path in sorted(output_dir.glob("*.kit.json")):
        document = _read_json(path)
        kit_id = document.get("kit")
        if not isinstance(kit_id, str) or not kit_id:
            raise ValueError(f"{path}: built manifest has no kit identity")
        apply_placement_metadata(document, kit_id, inventory)
        pending.append((path, document))
    for path, document in pending:
        path.write_text(json.dumps(document, indent=1) + "\n", encoding="utf-8")
    return [path for path, _document in pending]


def validate_asset_placement(asset: dict[str, Any]) -> list[str]:
    asset_id = asset.get("id", "?")
    placement = asset.get("placement")
    if not isinstance(placement, dict):
        return [f"{asset_id}: missing required placement metadata"]
    findings: list[str] = []
    missing = PLACEMENT_FIELDS - set(placement)
    if missing:
        findings.append(f"{asset_id}: placement missing {sorted(missing)}")
    if placement.get("schemaVersion") != 1:
        findings.append(f"{asset_id}: placement schemaVersion must be 1")
    if placement.get("anchorMode") not in ANCHOR_MODES:
        findings.append(f"{asset_id}: placement anchorMode is invalid")
    for key in ("groundContactOffsetM", "buryM", "buryCapM", "slopeBuryPerM"):
        if not _is_number(placement.get(key)):
            findings.append(f"{asset_id}: placement {key} must be finite")
    for key in ("buryM", "buryCapM", "slopeBuryPerM"):
        if _is_number(placement.get(key)) and placement[key] < 0:
            findings.append(f"{asset_id}: placement {key} cannot be negative")
    if (_is_number(placement.get("buryM")) and _is_number(placement.get("buryCapM"))
            and placement["buryM"] > placement["buryCapM"]):
        findings.append(f"{asset_id}: placement buryM exceeds buryCapM")
    offset = asset.get("originOffsetM")
    if (isinstance(offset, list) and len(offset) == 3 and _is_number(offset[2])
            and _is_number(placement.get("groundContactOffsetM"))
            and not math.isclose(placement["groundContactOffsetM"], offset[2], abs_tol=1e-6)):
        findings.append(
            f"{asset_id}: placement groundContactOffsetM disagrees with measured originOffsetM[2]"
        )
    evidence = placement.get("evidence")
    if (not isinstance(evidence, dict)
            or not isinstance(evidence.get("groundContactOffsetM"), str)
            or not isinstance(evidence.get("policyId"), str)
            or not isinstance(evidence.get("fitPolicy"), str)):
        findings.append(f"{asset_id}: placement evidence must name measurement and authored policy")
    return findings


@dataclass
class CoverageReport:
    used: dict[str, set[str]] = field(default_factory=dict)
    resolved: dict[str, set[str]] = field(default_factory=dict)
    expanded: dict[str, set[str]] = field(default_factory=dict)
    unresolved: dict[str, set[str]] = field(default_factory=dict)
    missing_policies: dict[str, set[str]] = field(default_factory=dict)


def _record(target: dict[str, set[str]], asset_id: str, location: str) -> None:
    target.setdefault(normalize_asset_id(asset_id), set()).add(location)


def _walk_blueprint_refs(
    value: object, location: str, physical: dict[str, set[str]],
    expanded: dict[str, set[str]], path: tuple[str, ...] = (),
) -> None:
    if isinstance(value, dict):
        ref = value.get("assetRef")
        if isinstance(ref, str):
            target = expanded if path and path[-1] == "interior" else physical
            _record(target, ref, f"{location}:{'.'.join(path + ('assetRef',))}")
        for key, child in value.items():
            _walk_blueprint_refs(child, location, physical, expanded, path + (key,))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _walk_blueprint_refs(child, location, physical, expanded, path + (str(index),))


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def collect_used_asset_coverage(
    repo_root: Path = REPO_ROOT, inventory: dict[str, Any] | None = None,
) -> CoverageReport:
    """Derive physical kit coverage from source plus available compiled outputs."""
    inventory = inventory or load_inventory()
    used: dict[str, set[str]] = {}
    expanded_candidates: dict[str, set[str]] = {}
    blueprint_dir = repo_root / "world/sources/blueprints"
    for path in sorted(blueprint_dir.glob("place.*.json")):
        doc = _read_json(path)
        _walk_blueprint_refs(
            doc.get("blueprint", doc), str(path.relative_to(repo_root)),
            used, expanded_candidates,
        )

    route_source = repo_root / "world/sources/routes/route-structures.json"
    if route_source.exists():
        for index, row in enumerate(_read_json(route_source).get("structures", [])):
            ref = row.get("pieceRef")
            if isinstance(ref, str):
                _record(
                    used, ref,
                    f"{route_source.relative_to(repo_root)}:structures.{index}.pieceRef",
                )

    settlements = repo_root / "tooling/world-generation/output/settlements"
    non_physical = inventory.get("nonPhysicalCompiledRefs", {})
    for path in sorted(settlements.glob("place.*.settlement.json")):
        for index, row in enumerate(_read_json(path).get("placements", [])):
            ref = row.get("assetId")
            if not isinstance(ref, str):
                continue
            if not row.get("kit") and normalize_asset_id(ref) in non_physical:
                continue
            if isinstance(ref, str):
                _record(used, ref, f"{path.relative_to(repo_root)}:placements.{index}.assetId")

    route_outputs = repo_root / "tooling/world-generation/output/route-structures"
    for path in sorted(route_outputs.glob("*.json")):
        for index, row in enumerate(_read_json(path).get("placements", [])):
            ref = row.get("assetId")
            if isinstance(ref, str):
                _record(used, ref, f"{path.relative_to(repo_root)}:placements.{index}.assetId")

    config_assets: dict[str, set[str]] = {}
    config_dir = repo_root / "tooling/asset-pipeline/pipeline/config/kits"
    for path in sorted(config_dir.glob("*.json")):
        doc = _read_json(path)
        for row in doc.get("assets", []):
            ref = row.get("asset")
            if isinstance(ref, str):
                _record(config_assets, ref, doc["id"])

    explicitly_expanded = inventory.get("expandedRefs", {})
    expanded = {
        key: locations for key, locations in expanded_candidates.items()
        if key in explicitly_expanded
    }
    # An interior-family ref without explicit expansion evidence is still a
    # physical promise gap, not silently excluded from the audit.
    for key, locations in expanded_candidates.items():
        if key not in explicitly_expanded:
            used.setdefault(key, set()).update(locations)

    resolved = {key: locations for key, locations in used.items() if key in config_assets}
    unresolved = {key: locations for key, locations in used.items() if key not in config_assets}
    asset_policies = inventory.get("assetPolicies", {})
    missing_policies = {
        key: locations for key, locations in resolved.items() if key not in asset_policies
    }
    return CoverageReport(
        used=used, resolved=resolved, expanded=expanded,
        unresolved=unresolved, missing_policies=missing_policies,
    )


def coverage_findings(report: CoverageReport) -> list[str]:
    findings = [
        f"unresolved physical assetRef {asset_id!r}: {sorted(locations)[0]}"
        for asset_id, locations in sorted(report.unresolved.items())
    ]
    findings += [
        f"used asset {asset_id!r} has no explicit reviewed asset policy: {sorted(locations)[0]}"
        for asset_id, locations in sorted(report.missing_policies.items())
    ]
    return findings


def _print_rows(title: str, rows: dict[str, set[str]]) -> None:
    print(f"{title}: {len(rows)}")
    for asset_id, locations in sorted(rows.items()):
        print(f"  {asset_id} ({sorted(locations)[0]})")


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check asset placement metadata coverage")
    parser.add_argument(
        "--refresh-built-manifests",
        action="store_true",
        help="copy reviewed placement policy onto existing measured kit manifests",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)
    inventory = load_inventory()
    if args.refresh_built_manifests:
        refreshed = refresh_built_manifests(inventory=inventory)
        print(f"refreshed placement metadata in {len(refreshed)} built kit manifests")
        return 0
    inventory_findings = validate_policy_inventory(inventory)
    report = collect_used_asset_coverage(inventory=inventory)
    print(f"used physical asset identities: {len(report.used)}")
    print(f"registry/kit-backed identities: {len(report.resolved)}")
    _print_rows("explicitly expanded family refs", report.expanded)
    _print_rows("unresolved physical refs", report.unresolved)
    _print_rows("used refs missing explicit asset policy", report.missing_policies)
    for finding in inventory_findings:
        print(f"inventory: {finding}")
    return 1 if inventory_findings or coverage_findings(report) else 0


if __name__ == "__main__":
    raise SystemExit(main())
