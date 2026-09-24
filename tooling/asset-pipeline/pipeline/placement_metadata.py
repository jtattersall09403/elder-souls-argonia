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
PUBLISHED_KITS_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "kits"
ANCHOR_MODES = {"streamed-origin", "streamed-perimeter"}
PLACEMENT_FIELDS = {
    "schemaVersion", "anchorMode", "groundContactOffsetM", "buryCapM", "evidence",
}
DESIGNED_SINK_DIR = REPO_ROOT / "world" / "sources" / "placement"
DESIGNED_SINK_RECORD = DESIGNED_SINK_DIR / "kit-designed-sink.json"
MOUNTS_RECORD = DESIGNED_SINK_DIR / "kit-mounts-mined.json"
ANCHOR_CLASSES = {"ground", "wall", "hanging", "deck", "water", "fx"}
STATIC_SUPPORTED_SILL = "mesh-sill (plugin refs static-supported)"
PLUGIN_UNSUPPORTED_SILL = "mesh-sill (plugin-unsupported)"
EVIDENCE_VOCABULARY: tuple[tuple[str, tuple[str, ...], str], ...] = (
    # (term, the record fields it appears in, meaning); a term ending in ":"
    # is a prefix followed by an asset id. The ONE list (16h round 17 ruling 5):
    # the sink and mounts miners and the manifest writer read it from here.
    # sink = kit-designed-sink.json ``evidence`` and manifest designedSinkM.evidence;
    # anchorClassEvidence = mounts row and manifest; anchor = mounts row ``evidence``;
    # waterline = mounts row ``waterline.evidence``; source = mounts row
    # ``hangingFrom`` / ``support`` and the per-reference source counts.
    ("plugin", ("sink", "anchorClassEvidence"),
     "measured on the makers' own placements in the plugins"),
    ("mesh-sill", ("sink",), "the raw kit mesh's ground-line tell (groundLineTell), n 0"),
    (STATIC_SUPPORTED_SILL, ("sink",),
     "mesh-sill because the plugin references stand on a static or kit mesh"),
    (PLUGIN_UNSUPPORTED_SILL, ("sink",),
     "mesh-sill because the plugin references stand clear of the LAND with no contact seen"),
    ("swap:", ("sink",), "the plugin sink of a measured twin shipping the same mesh"),
    ("base:", ("sink",), "the plugin sink of the base piece of a same-shape composite"),
    ("policy-fallback", ("sink",), "no record value: the placement-policy row's fallbackSinkM"),
    ("unplaced", ("anchorClassEvidence",), "no plugin places it: ground"),
    ("category", ("anchorClassEvidence", "source"),
     "the kit category decides (an effect is fx; a door with no frame contact hangs)"),
    ("thin", ("anchor",), "1 or 2 voting references, all agreeing"),
    ("policy", ("anchor", "waterline", "sink", "anchorClassEvidence"),
     "the placement-policy row decides (anchor: votedClass keeps the vote; "
     "waterline: the row's fallbackWaterlineM, asset row else kit row; sink and "
     "anchorClassEvidence: an assetPlacement row, applied at manifest refresh "
     "ahead of the mined records)"),
    ("sink-waterline", ("anchor",),
     "no-LAND drops left n < 3 and the sink record's waterline passes the water test"),
    ("column", ("waterline", "source"),
     "the water column: waterline = cell water minus pivot, median over the defining "
     "file's water-column references (n >= 3); per reference, no contact at all"),
    ("rests-on", ("source",), "a piece lies ON the reference's top: a neighbour, never a vote"),
    ("buried", ("source",), "the pivot lies more than 2 m under the LAND: ground"),
    ("frame", ("source",), "a door hangs in the frame it touches"),
    ("crown", ("source",), "hanging from a tree crown"),
    ("arm", ("source",), "hanging from a top contact on a non-tree piece"),
    ("interior-zero", ("source",), "an interior shell on the shell datum: ground"),
)


# The manifest ``placement.evidence`` block (16h K11 ruling B): its fields, the
# fixed ground-contact line and the fitPolicy prefix. Written by
# apply_placement_metadata below; the settlement exporter
# (worldgen/export_settlement_bundle.py) validates against these, never a copy.
PLACEMENT_EVIDENCE_FIELDS: tuple[str, ...] = ("groundContactOffsetM", "policyId", "fitPolicy")
GROUND_CONTACT_EVIDENCE = "measured transformed LOD0 bounds: originOffsetM[2]"
FIT_POLICY_PREFIX = "authored placement-policies.json policy "


def fit_policy_evidence(policy_id: str, text: str = "") -> str:
    """The ``fitPolicy`` evidence line; with no ``text``, the prefix it must start with."""
    return f"{FIT_POLICY_PREFIX}{policy_id}:" + (f" {text}" if text else "")


def evidence_terms(field_name: str) -> tuple[str, ...]:
    """The vocabulary terms (prefixes end in ':') used in one record field."""
    return tuple(term for term, fields, _meaning in EVIDENCE_VOCABULARY
                 if field_name in fields)


SINK_EVIDENCE_PREFIXES = evidence_terms("sink")
ANCHOR_EVIDENCE = set(evidence_terms("anchorClassEvidence"))
ANCHOR_ROW_EVIDENCE = set(evidence_terms("anchor"))
WATERLINE_EVIDENCE = set(evidence_terms("waterline"))
REFERENCE_SOURCES = set(evidence_terms("source"))
GROUND_LINE_TELLS = {"door-sill", "floor-plane", "bottom-step", "foundation-top",
                     "stilt-foot", "post-foot", "hull-waterline", "deck-top"}

# anchorClass is DECIDED in worldgen/mine_mounts.py by mesh-to-mesh contact in
# the makers' placements (its docstring holds the rule) and copied from
# kit-mounts-mined.json here. An asset nobody ever placed is ground/unplaced.
# designedSinkM is copied from kit-designed-sink.json, which carries the plugin
# percentiles, the base piece (base:, a same-shape composite), the measured
# twin (swap:) or the mesh-sill tell for every asset
# that has one; the policy fallback applies only where the record has nothing.
# An ``assetPlacement`` row in placement-policies.json (planner ruling
# 2026-09-24) decides its asset's anchorClass, designedSinkM and waterline
# ahead of both records at manifest-refresh time, evidence "policy"; each field
# is optional and a row without one leaves the mined value.
MESH_SILL_TOLERANCE_M = 0.1


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

    required = {"anchorMode", "buryCapM", "fallbackSinkM", "evidence"}
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
        for key in ("buryCapM", "fallbackSinkM"):
            if not _is_number(policy[key]) or policy[key] < 0:
                findings.append(f"policy {policy_id!r} has invalid {key}")
        if (_is_number(policy["fallbackSinkM"]) and _is_number(policy["buryCapM"])
                and policy["fallbackSinkM"] > policy["buryCapM"]):
            findings.append(f"policy {policy_id!r} fallbackSinkM exceeds buryCapM")
        if "fallbackWaterlineM" in policy and not _is_number(policy["fallbackWaterlineM"]):
            # 16h round 18: a water-class asset's policy waterline, never its ground sink.
            findings.append(f"policy {policy_id!r} has invalid fallbackWaterlineM")
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
    placement_rows = inventory.get("assetPlacement", {})
    if not isinstance(placement_rows, dict):
        findings.append("placement policy inventory needs object assetPlacement")
        placement_rows = {}
    for asset_id, row in sorted(placement_rows.items()):
        findings += _asset_placement_row_findings(asset_id, row, configured_assets)
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


ASSET_PLACEMENT_FIELDS = ("anchorClass", "designedSinkM", "designedWaterlineM")


def _asset_placement_row_findings(
    asset_id: str, row: object, configured_assets: set[str],
) -> list[str]:
    """An ``assetPlacement`` row (planner ruling 2026-09-24): the asset's anchor
    class, designed sink and waterline decided by review, each optional, with
    its ``why``."""
    where = f"assetPlacement {asset_id!r}"
    if asset_id != normalize_asset_id(asset_id):
        return [f"{where}: key is not normalized"]
    if not isinstance(row, dict):
        return [f"{where}: row must be an object"]
    findings: list[str] = []
    if asset_id not in configured_assets:
        findings.append(f"{where}: not emitted by a kit config")
    unknown = set(row) - set(ASSET_PLACEMENT_FIELDS) - {"why"}
    if unknown:
        findings.append(f"{where}: unknown fields {sorted(unknown)}")
    if not any(key in row for key in ASSET_PLACEMENT_FIELDS):
        findings.append(f"{where}: decides nothing (needs one of {list(ASSET_PLACEMENT_FIELDS)})")
    if "anchorClass" in row and row["anchorClass"] not in ANCHOR_CLASSES:
        findings.append(f"{where}: anchorClass must be one of {sorted(ANCHOR_CLASSES)}")
    for key in ("designedSinkM", "designedWaterlineM"):
        if key in row and not _is_number(row[key]):
            findings.append(f"{where}: {key} must be finite metres")
    if "designedWaterlineM" in row and row.get("anchorClass", "water") != "water":
        findings.append(f"{where}: designedWaterlineM only belongs on anchorClass water")
    if not isinstance(row.get("why"), str) or not row["why"].strip():
        findings.append(f"{where}: needs a why")
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


def load_designed_sink(path: Path = DESIGNED_SINK_RECORD) -> dict[str, Any]:
    """``assetId -> mined sink/waterline record``; empty when never mined."""
    try:
        document = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    return document.get("assets", {}) if document.get("schemaVersion") == 1 else {}


def load_anchors(path: Path = MOUNTS_RECORD) -> dict[str, dict[str, Any]]:
    """``assetId -> {anchorClass, anchorClassEvidence, ...}`` as mined."""
    try:
        document = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    # v3 (16h round 6): meshTell on every anchor; ceiling folded into hanging.
    if document.get("schemaVersion") != 3:
        raise ValueError(
            f"{path}: mounts record schemaVersion {document.get('schemaVersion')!r} "
            "is not one this reader knows (3)")
    anchors = document.get("anchors", {})
    return anchors if isinstance(anchors, dict) else {}


def resolve_designed_sink(
    asset: dict[str, Any], policy: dict[str, Any], mined: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """``(designedSinkM, groundLineTell)`` from the record only; the policy
    fallback where the record holds no value for the asset."""
    record = mined.get(asset["id"], {})
    if "p50" in record:
        evidence = record.get("evidence", "plugin")
        return {
            "p25": record["p25"], "p50": record["p50"], "p75": record["p75"],
            "n": record["n"], "slopeTermMPerDeg": record.get("slopeTermMPerDeg"),
            "evidence": evidence,
        }, (record.get("groundLineTell") if evidence.startswith("mesh-sill") else None)
    fallback = round(float(policy["fallbackSinkM"]), 4)
    return {
        "p25": fallback, "p50": fallback, "p75": fallback, "n": 0,
        "slopeTermMPerDeg": None, "evidence": "policy-fallback",
    }, None


def resolve_anchor_class(asset: dict[str, Any],
                         anchor: dict[str, Any] | None) -> tuple[str, str]:
    """``(anchorClass, evidence)`` as mined; ground/unplaced where nothing was
    (the miner records every kit asset, so that is an asset it never saw)."""
    if isinstance(anchor, dict):
        anchor_class = anchor.get("anchorClass")
        evidence = anchor.get("anchorClassEvidence")
        if anchor_class in ANCHOR_CLASSES and evidence in ANCHOR_EVIDENCE:
            return anchor_class, evidence
    return "ground", "unplaced"


def apply_placement_metadata(
    manifest: dict[str, Any], kit_id: str,
    inventory: dict[str, Any] | None = None,
    mined: dict[str, Any] | None = None,
    anchors: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Attach the required contract to every asset, failing absent measurement."""
    inventory = inventory or load_inventory()
    mined = load_designed_sink() if mined is None else mined
    anchors = load_anchors() if anchors is None else anchors
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
        mined_record = mined.get(asset["id"], {})
        # An assetPlacement row decides ahead of the mined records (planner
        # ruling 2026-09-24): a wrong mined class or sink is fixed by a
        # reviewed row and a refresh, never a miner run. Evidence "policy".
        row = inventory.get("assetPlacement", {}).get(normalize_asset_id(asset["id"]), {})
        sink, tell = resolve_designed_sink(asset, policy, mined)
        if "designedSinkM" in row:
            value = round(float(row["designedSinkM"]), 4)
            sink, tell = {"p25": value, "p50": value, "p75": value, "n": 0,
                          "slopeTermMPerDeg": None, "evidence": "policy"}, None
        asset["designedSinkM"] = sink
        anchor_class, anchor_evidence = resolve_anchor_class(
            asset, anchors.get(asset["id"]))
        if "anchorClass" in row:
            anchor_class, anchor_evidence = row["anchorClass"], "policy"
        asset["anchorClass"] = anchor_class
        asset["anchorClassEvidence"] = anchor_evidence
        asset.pop("meshTell", None)
        if tell is not None:
            asset["groundLineTell"] = tell
        else:
            asset.pop("groundLineTell", None)
        # The sink record's waterline first; else the mounts row's (16h round
        # 17 ruling 3: its water-column references, n >= 3, else the policy
        # row's fallback). None at all: no designedWaterlineM, and
        # validate_asset_placement names it.
        waterline = row.get("designedWaterlineM")
        if not _is_number(waterline):
            waterline = (mined_record.get("waterline") or {}).get("p50")
        if not _is_number(waterline):
            waterline = ((anchors.get(asset["id"]) or {}).get("waterline") or {}).get("p50")
        if anchor_class == "water" and _is_number(waterline):
            asset["designedWaterlineM"] = waterline
        else:
            asset.pop("designedWaterlineM", None)
        asset["placement"] = {
            "schemaVersion": 1,
            "anchorMode": policy["anchorMode"],
            # build_kit's transformed LOD0 bounds define originOffsetM = -bboxMin.
            "groundContactOffsetM": offset[2],
            "buryCapM": policy["buryCapM"],
            "evidence": {
                "groundContactOffsetM": GROUND_CONTACT_EVIDENCE,
                "policyId": policy_id,
                "fitPolicy": fit_policy_evidence(policy_id, policy["evidence"]),
            },
        }
    return manifest


def refresh_built_manifests(
    output_dir: Path = BUILT_KITS_DIR,
    inventory: dict[str, Any] | None = None,
    mined: dict[str, Any] | None = None,
    anchors: dict[str, dict[str, Any]] | None = None,
    kits: set[str] | None = None,
) -> list[Path]:
    """Refresh policy-only metadata without rebuilding unchanged geometry.

    ``kits``: refresh only these kit ids (``--kit``); None = every kit.

    The ground contact measurement already lives in each built manifest as
    ``originOffsetM``.  Re-running Blender merely to copy a reviewed placement
    policy beside that measurement is expensive and cannot improve the data.
    Validate every candidate in memory first, then replace the manifests only
    when the whole batch is sound.
    """
    inventory = inventory or load_inventory()
    mined = load_designed_sink() if mined is None else mined
    anchors = load_anchors() if anchors is None else anchors
    pending: list[tuple[Path, dict[str, Any]]] = []
    for path in sorted(output_dir.glob("*.kit.json")):
        document = _read_json(path)
        kit_id = document.get("kit")
        if not isinstance(kit_id, str) or not kit_id:
            raise ValueError(f"{path}: built manifest has no kit identity")
        # Output may retain one-off historical probes after their configs are
        # removed. They are not buildable or publishable kits, and therefore
        # are outside the current policy inventory.
        if kit_id not in inventory.get("kitPolicies", {}):
            continue
        if kits is not None and kit_id not in kits:
            continue
        apply_placement_metadata(document, kit_id, inventory,
                                 mined=mined, anchors=anchors)
        pending.append((path, document))
    for path, document in pending:
        path.write_text(json.dumps(document, indent=1) + "\n", encoding="utf-8")
    return [path for path, _document in pending]


def validate_asset_placement(asset: dict[str, Any]) -> list[str]:
    asset_id = asset.get("id", "?")
    # Measured ground contact is checked whatever the policy block looks like:
    # it is the contract, and hiding it behind the policy block's early return
    # made an asset with no placement report only the older, weaker failure.
    findings = _designed_contact_findings(asset)
    placement = asset.get("placement")
    if not isinstance(placement, dict):
        return findings + [f"{asset_id}: missing required placement metadata"]
    missing = PLACEMENT_FIELDS - set(placement)
    if missing:
        findings.append(f"{asset_id}: placement missing {sorted(missing)}")
    if placement.get("schemaVersion") != 1:
        findings.append(f"{asset_id}: placement schemaVersion must be 1")
    if placement.get("anchorMode") not in ANCHOR_MODES:
        findings.append(f"{asset_id}: placement anchorMode is invalid")
    for key in ("groundContactOffsetM", "buryCapM"):
        if not _is_number(placement.get(key)):
            findings.append(f"{asset_id}: placement {key} must be finite")
    if _is_number(placement.get("buryCapM")) and placement["buryCapM"] < 0:
        findings.append(f"{asset_id}: placement buryCapM cannot be negative")
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


def _designed_contact_findings(asset: dict[str, Any]) -> list[str]:
    """Every asset must carry measured ground contact, its class, and evidence."""
    asset_id = asset.get("id", "?")
    findings: list[str] = []
    sink = asset.get("designedSinkM")
    if not isinstance(sink, dict):
        return [f"{asset_id}: missing designedSinkM"]
    for key in ("p25", "p50", "p75"):
        if not _is_number(sink.get(key)):
            findings.append(f"{asset_id}: designedSinkM {key} must be finite metres")
    if not isinstance(sink.get("n"), int) or sink["n"] < 0:
        findings.append(f"{asset_id}: designedSinkM n must be a sample count")
    slope = sink.get("slopeTermMPerDeg")
    if slope is not None and not _is_number(slope):
        findings.append(f"{asset_id}: designedSinkM slopeTermMPerDeg must be finite or null")
    evidence = sink.get("evidence")
    if not isinstance(evidence, str) or not evidence.startswith(SINK_EVIDENCE_PREFIXES):
        findings.append(f"{asset_id}: designedSinkM needs evidence from {sorted(SINK_EVIDENCE_PREFIXES)}")
    anchor_class = asset.get("anchorClass")
    if anchor_class not in ANCHOR_CLASSES:
        findings.append(f"{asset_id}: anchorClass must be one of {sorted(ANCHOR_CLASSES)}")
    anchor_evidence = asset.get("anchorClassEvidence")
    if anchor_evidence not in ANCHOR_EVIDENCE:
        findings.append(
            f"{asset_id}: anchorClassEvidence must be one of {sorted(ANCHOR_EVIDENCE)}")
    elif anchor_class in ("wall", "hanging", "deck") and anchor_evidence not in ("plugin", "policy"):
        # Contact in the makers' placements, or a reviewed assetPlacement row
        # (planner ruling 2026-09-24), is the only evidence for these.
        findings.append(
            f"{asset_id}: {anchor_class} without placement evidence (contact in "
            "the plugins or a reviewed assetPlacement row) is not allowed")
    tell = asset.get("groundLineTell")
    if isinstance(evidence, str) and evidence.startswith("mesh-sill"):
        if not isinstance(tell, dict) or tell.get("tell") not in GROUND_LINE_TELLS:
            findings.append(f"{asset_id}: mesh-sill evidence needs a groundLineTell")
        elif not (_is_number(tell.get("valueM")) and _is_number(sink.get("p50"))
                  and abs(tell["valueM"] - sink["p50"]) <= MESH_SILL_TOLERANCE_M):
            findings.append(
                f"{asset_id}: mesh-sill tell sits more than {MESH_SILL_TOLERANCE_M} m "
                "off the recorded ground line")
    elif tell is not None:
        findings.append(f"{asset_id}: groundLineTell only belongs with mesh-sill evidence")
    if anchor_class == "water":
        if not _is_number(asset.get("designedWaterlineM")):
            findings.append(f"{asset_id}: water-anchored asset needs designedWaterlineM")
    elif asset.get("designedWaterlineM") is not None:
        findings.append(f"{asset_id}: designedWaterlineM only belongs on anchorClass water")
    return findings


SETTLEMENT_BUNDLE = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "settlements.json"


def bundle_used_assets(bundle_path: Path = SETTLEMENT_BUNDLE) -> set[tuple[str, str]]:
    """``(kit, assetId)`` of every placement the published settlement bundle
    carries: the scope of the shipped-kit contract for a publish (16h K14)."""
    document = json.loads(bundle_path.read_text())
    return {(row["kit"], row["assetId"]) for row in document.get("placements", [])}


def shipped_contract_findings(
    roots: Iterable[Path] = (BUILT_KITS_DIR, PUBLISHED_KITS_DIR),
    used: set[tuple[str, str]] | None = None,
) -> list[str]:
    """``validate_asset_placement`` over the kit manifests under ``roots``.

    16h K14 (owner 2026-09-24, the yard and the miner lane are decoupled): a
    publish is held to the assets its bundle places (``used``, from
    ``bundle_used_assets``); ``used=None`` is the catalogue-wide form, every
    asset of every kit, which gates the miner lane (``--contract --catalogue``,
    or ``PLACEMENT_CONTRACT_SCOPE=catalogue`` for the test)."""
    findings: list[str] = []
    for root in roots:
        for path in sorted(Path(root).glob("*.kit.json")):
            document = json.loads(path.read_text())
            kit_id = document.get("kit") or path.name.removesuffix(".kit.json")
            for asset in document.get("assets", []):
                if used is not None and (kit_id, asset.get("id")) not in used:
                    continue
                findings += [f"{path.parent.name}/{path.name}: {finding}"
                             for finding in validate_asset_placement(asset)]
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


def _ladder_skipped(repo_root) -> set[str]:
    """Stages the last chain run skipped (apps/world-studio/public/province/ladder.json), or none."""
    path = repo_root / "apps/world-studio/public/province/ladder.json"
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return set()
    return set(doc.get("skipped", [])) if doc.get("schemaVersion") == 1 else set()


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

    # Compiled outputs count only when the ladder says their stage ran on the
    # current ground (Phase 16, plan §3): tooling/world-generation/output/ is
    # gitignored scratch, and a stale compile from an earlier build must not
    # decide the coverage on one machine and not another.
    skipped = _ladder_skipped(repo_root)
    settlements = repo_root / "tooling/world-generation/output/settlements"
    non_physical = inventory.get("nonPhysicalCompiledRefs", {})
    for path in ([] if "compile_settlement" in skipped else sorted(settlements.glob("place.*.settlement.json"))):
        for index, row in enumerate(_read_json(path).get("placements", [])):
            ref = row.get("assetId")
            if not isinstance(ref, str):
                continue
            if not row.get("kit") and normalize_asset_id(ref) in non_physical:
                continue
            if isinstance(ref, str):
                _record(used, ref, f"{path.relative_to(repo_root)}:placements.{index}.assetId")

    route_outputs = repo_root / "tooling/world-generation/output/route-structures"
    for path in ([] if "compile_route_structures" in skipped else sorted(route_outputs.glob("*.json"))):
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
    parser.add_argument(
        "--kit", action="append", metavar="ID",
        help="with --refresh-built-manifests: refresh only this kit (repeatable)",
    )
    parser.add_argument(
        "--contract", action="store_true",
        help="check the shipped-kit placement contract on the assets the published "
             "settlement bundle places (16h K14)",
    )
    parser.add_argument(
        "--catalogue", action="store_true",
        help="with --contract: every asset of every kit (the miner lane's gate)",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)
    if args.contract:
        findings = shipped_contract_findings(
            used=None if args.catalogue else bundle_used_assets())
        for finding in findings:
            print(f"contract: {finding}")
        print(f"shipped-kit contract ({'catalogue' if args.catalogue else 'bundle'}): "
              f"{len(findings)} findings")
        return 1 if findings else 0
    inventory = load_inventory()
    if args.refresh_built_manifests:
        mined = load_designed_sink()
        anchors = load_anchors()
        refreshed: list[Path] = []
        for root in (BUILT_KITS_DIR, PUBLISHED_KITS_DIR):
            refreshed += refresh_built_manifests(
                root, inventory=inventory, mined=mined, anchors=anchors,
                kits=set(args.kit) if args.kit else None)
        print(f"refreshed placement metadata in {len(refreshed)} kit manifests "
              f"({len(mined)} sink records)")
        if args.kit and not refreshed:
            print(f"no kit manifest matched --kit {args.kit}")
            return 1
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
