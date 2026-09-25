"""Export compiled settlements and route structures as one runtime bundle.

This is deliberately a projection of compiler output, not a second compiler.
It joins the placed references to the measured kit manifests, adds the runtime
anchoring/LOD/collision contract, and converts authored UV polygons to metres.
The browser can therefore render both settlement and route pieces through one
placed-piece path without importing authoring data.

Run from ``tooling/world-generation``::

    python3 -m worldgen.export_settlement_bundle --copy-assets

Writes ``apps/world-studio/public/province/settlements.json`` atomically and,
when requested, copies only referenced kit GLBs/manifests to ``public/kits``.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import struct
import sys
import tempfile
from pathlib import Path

import numpy as np

from .site_fields import ProvinceSurvey, shared_survey
from .compile_settlement import (
    POLICY_GROUND_FIT,
    assembly_doorways, blueprint_sha256, _canonical_sha256, compiled_blueprint_objects,
    compiled_terrain_objects, kit_connectors, kit_interiors,
)
from . import blueprint as bp_mod
from . import blueprint_footprints as fp_mod
from . import catalogue, place_obligations
from . import grade_settlement_pads

_ASSET_PIPELINE = Path(__file__).resolve().parents[3] / "tooling" / "asset-pipeline"
if str(_ASSET_PIPELINE) not in sys.path:
    sys.path.insert(0, str(_ASSET_PIPELINE))
# The evidence vocabulary lives once, in the manifest writer (16h K11 ruling B).
from pipeline.placement_metadata import (  # noqa: E402
    GROUND_CONTACT_EVIDENCE,
    PLACEMENT_EVIDENCE_FIELDS,
    SINK_EVIDENCE_PREFIXES,
    fit_policy_evidence,
    load_inventory,
    normalize_asset_id,
)

# 3 (16h check-in 3): run pieces carry `run` {id, index, riseM}; ground
# treatments carry `kind` (floor | deck), `apronsM` and a deck's `contactsM`.
SCHEMA_VERSION = 3
COLLISION_FRAME = "settlement-pivot-yup-v1"

# Hard ceiling on the collision parts the runtime will build for the settlement
# the player is standing in. Every placement inside the authored boundary is a
# resident (collisionResidency.ts: residency is by boundary, never by distance),
# so this must cover the WHOLE of the largest settlement or the layer refuses to
# draw anything at all.
#
# Derivation (2026-09-09): measured over the published bundle by summing, per
# settlement, max(1, collision parts) for each placement that yields a solid —
# the measured manifest proxy where present, otherwise the asset's LOD0 mesh
# primitive count read from the kit GLB (that is what SettlementLayer.solidFrom
# falls back to). Worst case Lilmoth 1033 parts (466 placements); next largest
# Mazzatun 51, Nine-Trunks 48, Wamasu Pond 28, Sap-Tapping 2.
# The old value, 256, was a bare literal never calibrated against a real
# settlement, and it silently blanked Lilmoth in the browser. See decision 0052.
#
# Rule (decision 0052): budget = round(worst shipped resident parts * 1.55).
# Re-measured 2026-09-24 on the K14 publish: the five 2026-09-09 blueprints
# are retired (owner 2026-09-23), the yard is the only compiled place and its
# worst resident case was 100 parts (budget 155; was 1601 from Lilmoth's 1033).
# Re-measured 2026-09-24 after the check-in 2 yard fixes (the stilt hut's door
# record dropped, the mud hut replaced by the bamboo hut): 91 parts, so
# round(91 * 1.55) = 141. Re-measure when a place joins or changes the bundle.
# The runtime reads only the published lod.colliderPartBudget, never its own copy.
COLLIDER_PART_BUDGET = 141

# Error classes that are FATAL AT RUNTIME: each makes the layer refuse to draw
# or throw outright, so the world the player gets is blank, not merely
# defective. On 2026-09-09 a two-tier LOD chain shipped under the old
# `--ship-with-errors` waiver, `validateLodTriangles` threw, and the studio
# rendered nothing at all (decision 0052). The waiver is gone as of 16h item 6
# — every export error refuses now — and this table stays as what it always
# really was: the sentence that tells whoever hit the gate why the runtime, not
# the exporter, is the one insisting.
RUNTIME_FATAL_ERROR_CLASSES = {
    "lod contract":
        "SettlementLayer.validateLodTriangles throws on it; the throw unwinds "
        "the whole layer build, so NOTHING draws",
    "collider budget":
        "SettlementLayer's collision-residency check refuses outright and draws "
        "no settlement geometry at all while the player is inside the boundary",
    "texture cap":
        "SettlementLayer.validateMaterialTextureCap throws on it; the throw "
        "unwinds the whole layer build, so NOTHING draws",
}

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SETTLEMENTS = Path(__file__).resolve().parents[1] / "output" / "settlements"
DEFAULT_STRUCTURES = Path(__file__).resolve().parents[1] / "output" / "route-structures"
ROUTE_STRUCTURES_SOURCE = REPO_ROOT / "world" / "sources" / "routes" / "route-structures.json"
BLUEPRINTS = REPO_ROOT / "world" / "sources" / "blueprints"
KITS = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
WARNING_KNOWN_RED = (REPO_ROOT / "world" / "sources" / "settlements"
                     / "settlement-warning-known-red.json")
OUT = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "settlements.json"
PUBLIC_KITS = REPO_ROOT / "apps" / "world-studio" / "public" / "kits"

GROUND_FITS = {"direct", "plinth", "pad", "stilt", "dug-in"}
# A piece can be deliberately used in more than one authored ground treatment.
# This is the explicit reviewed exception shelf; without a row, the manifest's
# asset policy and the compiler's authored groundFit must agree exactly.
COMPATIBLE_ASSET_GROUND_FITS = {
    "ayleidkit:igsresources/dungeons/ayleidruins/exterior/arquadblock01":
        {"direct", "dug-in"},
    "htbm:here there be monsters - curse of cipactli/architecture/ruins/xanmeer/pillar02":
        {"direct", "pad"},
    "mudmother:gv_meshes/argoniannest/argonianplatform": {"direct", "pad"},
    "mudmother:gv_meshes/argoniannest/fishracksmall": {"direct", "pad"},
    "mudmother:gv_meshes/argoniannest/mudhut01": {"pad", "plinth", "dug-in"},
    # The whole keep wall on a graded pad (Lilmoth, 16h part 1 round 4), as
    # its destroyed sibling below already stands.
    "mwkeep:tesak1243/mwimperialarchitecture/architecture/keep/exterior/walls/"
    "mwimparchwall01": {"direct", "pad"},
    "mwkeep:tesak1243/mwimperialarchitecture/architecture/keep/exterior/walls/"
    "mwimparchwall01destroyed01": {"direct", "pad"},
    "vanilla:clutter/carts/handcart01": {"pad", "plinth"},
    "vanilla:clutter/stockade/stockadescaffoldbase3sided01": {"stilt", "plinth"},
    # A span's timber trestle foot (decision 0051): the same piece that is
    # dug into a bank as settlement scaffolding stands at the route deck line
    # when it is carrying a crossing, which the route path anchors 'direct'.
    # Re-checked 2026-09-09 after the span windows were trimmed to their
    # measured obstacles: 300 placements -> 18, all still route structures, so
    # the row is still load-bearing and is kept. It is judged legal, not judged
    # good; retiring it needs the trestle's foot to be anchored on the same
    # treatment in both paths, which is a kit change, not a shelf change.
    "vanilla:clutter/stockade/stockadescaffoldbase4sided01": {"direct", "dug-in"},
    "vanilla:clutter/stockade/stockadescaffoldstairs01": {"direct", "stilt"},
    "vanilla:clutter/stockade/stockadescaffoldtop3sided01": {"stilt", "plinth"},
}


def _refuse(error_class: str, errors: list[str], message: str) -> None:
    """Raise if there is anything to raise on.

    There is no waiver any more (16h item 6, 2026-09-22). `shippedWithKnownErrors`
    let a defective bundle ship under a stated reason; in practice the one thing
    it ever waived was an ungraded settlement pad, and pads are local terrain
    patches from 16h part 2, not an export concern. A pad a parcel still wants is
    now REPORTED in the bundle receipt (`pendingPadGrades`) and blocks nothing;
    every other error is what it always was — a reason not to publish."""
    if not errors:
        return
    detail = RUNTIME_FATAL_ERROR_CLASSES.get(error_class)
    raise ValueError(f"{message}\n{detail}" if detail else message)


def _read(path: Path) -> dict:
    return json.loads(path.read_text())


def _atomic_json(path: Path, data: dict) -> None:
    """Replace a complete file; an interrupted export never leaves half JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, sort_keys=True)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        # mkstemp creates 0600; the published bundle is a world-readable
        # static asset served by Pages, so give it the mode every other
        # published file has BEFORE it takes the publication name.
        os.chmod(name, 0o644)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def _is_number(value: object) -> bool:
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value))


def _validated_asset_placement(kit: str, asset: dict) -> tuple[dict, str]:
    """Validate one measured manifest record and return its runtime anchor data."""
    asset_id = asset.get("id", "?")
    record = asset.get("placement")
    if not isinstance(record, dict):
        raise ValueError(f"{kit}/{asset_id}: manifest has no placement metadata")
    required = {"schemaVersion", "anchorMode", "groundContactOffsetM",
                "buryCapM", "evidence"}
    missing = required - set(record)
    if missing:
        raise ValueError(f"{kit}/{asset_id}: placement metadata missing {sorted(missing)}")
    if record["schemaVersion"] != 1:
        raise ValueError(f"{kit}/{asset_id}: unsupported placement metadata schema")
    if record["anchorMode"] not in {"streamed-origin", "streamed-perimeter"}:
        raise ValueError(f"{kit}/{asset_id}: invalid manifest anchorMode")
    for key in ("groundContactOffsetM", "buryCapM"):
        if not _is_number(record[key]):
            raise ValueError(f"{kit}/{asset_id}: manifest placement {key} is not finite")
    if record["buryCapM"] < 0:
        raise ValueError(f"{kit}/{asset_id}: manifest placement burial cannot be negative")
    # 16h item 1 (decision 3): the height a piece sits at is its own MEASURED
    # designed sink, never a per-class bury table. `buryM`/`slopeBuryPerM` no
    # longer exist on a manifest; an asset without a designed sink cannot be
    # exported at all, because the runtime would have nothing to place it by.
    sink = asset.get("designedSinkM")
    if not isinstance(sink, dict):
        raise ValueError(f"{kit}/{asset_id}: manifest has no designedSinkM")
    for key in ("p25", "p50", "p75"):
        if not _is_number(sink.get(key)):
            raise ValueError(f"{kit}/{asset_id}: designedSinkM {key} is not finite metres")
    sink_evidence = sink.get("evidence")
    if not isinstance(sink_evidence, str) or not sink_evidence.startswith(SINK_EVIDENCE_PREFIXES):
        raise ValueError(f"{kit}/{asset_id}: designedSinkM evidence {sink_evidence!r} "
                         "is not in placement_metadata.EVIDENCE_VOCABULARY")
    origin = asset.get("originOffsetM")
    if (not isinstance(origin, list) or len(origin) != 3
            or not all(_is_number(value) for value in origin)):
        raise ValueError(f"{kit}/{asset_id}: manifest has no measured originOffsetM")
    if not math.isclose(record["groundContactOffsetM"], origin[2], abs_tol=1e-6):
        raise ValueError(
            f"{kit}/{asset_id}: groundContactOffsetM disagrees with measured originOffsetM[2]"
        )
    evidence = record["evidence"]
    if not isinstance(evidence, dict) or any(
            not isinstance(evidence.get(field), str) for field in PLACEMENT_EVIDENCE_FIELDS):
        raise ValueError(f"{kit}/{asset_id}: manifest placement evidence is malformed")
    policy_id = evidence["policyId"]
    if evidence["groundContactOffsetM"] != GROUND_CONTACT_EVIDENCE:
        raise ValueError(f"{kit}/{asset_id}: manifest placement evidence is malformed "
                         f"(groundContactOffsetM {evidence['groundContactOffsetM']!r})")
    if policy_id not in known_policies():
        raise ValueError(f"{kit}/{asset_id}: manifest placement evidence is malformed "
                         f"(policy {policy_id!r} is not in placement-policies.json)")
    if not evidence["fitPolicy"].startswith(fit_policy_evidence(policy_id)):
        raise ValueError(f"{kit}/{asset_id}: manifest placement evidence is malformed "
                         f"(fitPolicy does not name policy {policy_id!r})")
    return {
        "schemaVersion": record["schemaVersion"],
        "mode": record["anchorMode"],
        "originOffsetM": [origin[0], origin[1], record["groundContactOffsetM"]],
        "groundContactOffsetM": record["groundContactOffsetM"],
        # The cap survives only as the ceiling on a POLICY FALLBACK sink; it
        # can no longer clamp a mined value (16h item 1).
        "buryCapM": record["buryCapM"],
        "designedSinkM": {"p25": sink["p25"], "p50": sink["p50"], "p75": sink["p75"],
                          "evidence": sink_evidence},
        "evidence": evidence,
    }, policy_id


def known_policies() -> set[str]:
    """The placement policy ids the manifest writer can emit (the inventory)."""
    return set(load_inventory().get("policies") or {})


def _validate_ground_fit(asset_id: str, ground_fit: str, policy_id: str) -> None:
    if ground_fit not in GROUND_FITS:
        raise ValueError(f"{asset_id}: unknown authored groundFit {ground_fit!r}")
    compatible = COMPATIBLE_ASSET_GROUND_FITS.get(asset_id)
    if compatible is not None and ground_fit in compatible:
        return
    if ground_fit != POLICY_GROUND_FIT[policy_id]:
        raise ValueError(
            f"{asset_id}: authored groundFit {ground_fit!r} contradicts "
            f"reviewed manifest policy {policy_id!r}"
        )


# one predicate for every fixture skip: the exporter, the place obligations
_is_fixture = bp_mod.is_fixture


def glb_structure_errors(path: Path) -> list[str]:
    """Why a GLB is not a readable binary glTF 2 container (empty list = fine).

    The runtime's loader trusts the header; a truncated or half-written kit
    fails there, in the browser, with nothing to read. Parse it here instead:
    magic, version, declared total length against the file size, and every
    chunk header inside the declared length."""
    data = path.read_bytes()
    if len(data) < 12:
        return [f"{path.name}: {len(data)} B is shorter than a GLB header"]
    magic, version, total = struct.unpack_from("<4sII", data, 0)
    errors = []
    if magic != b"glTF":
        return [f"{path.name}: magic is {magic!r}, not b'glTF'"]
    if version != 2:
        errors.append(f"{path.name}: glTF version {version}, expected 2")
    if total != len(data):
        errors.append(f"{path.name}: header declares {total} B, file is {len(data)} B")
    offset, seen = 12, []
    limit = min(total, len(data))
    while offset + 8 <= limit:
        length, chunk_type = struct.unpack_from("<II", data, offset)
        end = offset + 8 + length
        if end > limit:
            errors.append(f"{path.name}: chunk at {offset} declares {length} B, "
                          f"which runs {end - limit} B past the end of the file")
            break
        seen.append(chunk_type)
        offset = end + (-length % 4)
    if offset != limit and not errors:
        errors.append(f"{path.name}: chunk table ends at {offset}, file at {limit}")
    if 0x4E4F534A not in seen:
        errors.append(f"{path.name}: no JSON chunk")
    return errors


KIT_SIDECARS = ("connectors", "footprints", "interiors")


def kit_sidecar_errors(name: str, kits_dir: Path) -> list[str]:
    """The three measured sidecars must exist beside a referenced kit.

    The exemption is the published manifest's own record (kit_compress
    SIDECAR_EXEMPT), so there is one list, in the tool that publishes them."""
    manifest = _read(kits_dir / f"{name}.kit.json") if (kits_dir / f"{name}.kit.json").is_file() else {}
    if (manifest.get("compression") or {}).get("sidecarsExempt"):
        return []
    missing = [part for part in KIT_SIDECARS
               if not (kits_dir / f"{name}.{part}.json").is_file()]
    if not missing:
        return []
    return [f"{name}: no {', '.join(missing)} sidecar; measure it and republish "
            f"(pipeline.kit_compress --kit {name} --sidecars-only)"]


def _kit_assets(names: set[str], kits_dir: Path,
                used: set[tuple[str, str]] | None = None,
                ) -> tuple[dict, dict[tuple[str, str], dict]]:
    """Referenced kits and their validated assets.

    16h K14 (owner 2026-09-24): the shipped-kit contract
    (``_validated_asset_placement``) is checked on the ``used`` ``(kit,
    assetId)`` pairs, the assets the bundle places; ``used=None`` checks every asset of every referenced kit
    (``--all-kit-assets``, the catalogue-wide form the miner lane gates on).
    Assets outside the scope are not carried into the bundle's asset table."""
    kits: dict[str, dict] = {}
    assets: dict[tuple[str, str], dict] = {}
    for name in sorted(names):
        path = kits_dir / f"{name}.kit.json"
        if not path.exists():
            raise ValueError(f"referenced kit has no measured manifest: {name}")
        sidecar_errors = kit_sidecar_errors(name, kits_dir)
        if sidecar_errors:
            raise ValueError("referenced kit is not fully measured: "
                             + "; ".join(sidecar_errors))
        glb_errors = glb_structure_errors(kits_dir / f"{name}.glb") \
            if (kits_dir / f"{name}.glb").is_file() else [f"{name}: no GLB"]
        if glb_errors:
            raise ValueError("referenced kit GLB is not a readable glTF 2 binary: "
                             + "; ".join(glb_errors))
        manifest = _read(path)
        kits[name] = {
            "id": name,
            "glb": f"kits/{name}.glb",
            "manifest": f"kits/{name}.kit.json",
        }
        for asset in manifest.get("assets", []):
            key = (name, asset["id"])
            if used is not None and key not in used:
                continue
            anchor, policy_id = _validated_asset_placement(name, asset)
            if key in assets:
                raise ValueError(f"{name}: duplicate manifest asset id {asset['id']!r}")
            assets[key] = {"kit": name, **asset,
                           "_runtimeAnchor": anchor, "_placementPolicyId": policy_id}
    return kits, assets


def _glb_document(path: Path) -> dict:
    """Read the JSON chunk of a binary glTF without decoding any buffers."""
    data = path.read_bytes()
    offset = 12
    while offset + 8 <= len(data):
        length, chunk_type = struct.unpack_from("<II", data, offset)
        if chunk_type == 0x4E4F534A:
            return json.loads(data[offset + 8:offset + 8 + length])
        offset += 8 + length + (-length % 4)
    raise ValueError(f"{path}: no JSON chunk in GLB")


def lod_chain_triangles(kit: str, kits_dir: Path = KITS) -> dict[str, list[int]]:
    """Per-asset triangles at each LOD tier, exactly as the runtime counts them.

    Mirrors buildArchitectureKit: level comes from the node's ``lod`` extra
    (absent means 0), and a tier's triangle total is the sum over its meshes.
    """
    document = _glb_document(kits_dir / f"{kit}.glb")
    nodes = document.get("nodes", [])
    meshes = document.get("meshes", [])
    accessors = document.get("accessors", [])
    scene = document["scenes"][document.get("scene", 0)].get("nodes", [])
    chains: dict[str, list[int]] = {}

    def walk(index: int, tiers: dict[int, int]) -> None:
        node = nodes[index]
        if "mesh" in node:
            level = (node.get("extras") or {}).get("lod", 0)
            total = 0
            for primitive in meshes[node["mesh"]].get("primitives", []):
                accessor = (primitive["indices"] if "indices" in primitive
                            else primitive["attributes"]["POSITION"])
                total += accessors[accessor]["count"] // 3
            tiers[level] = tiers.get(level, 0) + total
        for child in node.get("children", []):
            walk(child, tiers)

    for index in scene:
        asset_id = (nodes[index].get("extras") or {}).get("assetId")
        if not isinstance(asset_id, str):
            continue
        tiers: dict[int, int] = {}
        walk(index, tiers)
        chains[asset_id] = [tiers.get(level, 0) for level in range(max(tiers, default=-1) + 1)]
    return chains


def lod_contract_errors(placements: list[dict], lod: dict,
                        kits_dir: Path = KITS) -> list[str]:
    """The offline form of the runtime's `validateLodTriangles` throw.

    SettlementLayer validates the LOD chain of every asset it is about to draw
    and throws when the chain is short or a tier fell below its absolute
    triangle floor. That throw only happens once the player is close enough to
    draw that one piece, so it can only be caught here: an asset that cannot
    satisfy the runtime contract must never reach a published bundle.
    """
    floor = lod["absoluteTriangleFloor"]
    chains: dict[str, dict[str, list[int]]] = {}
    errors: list[str] = []
    seen: set[tuple[str, str]] = set()
    for placement in sorted(placements, key=lambda row: row["id"]):
        key = (placement["kit"], placement["assetId"])
        if key in seen:
            continue
        seen.add(key)
        if placement["kit"] not in chains:
            chains[placement["kit"]] = lod_chain_triangles(placement["kit"], kits_dir)
        chain = chains[placement["kit"]].get(placement["assetId"])
        if chain is None:
            errors.append(f"{placement['kit']}/{placement['assetId']}: placed asset is "
                          f"not in the built kit GLB (first placement {placement['id']})")
        elif len(chain) < lod["tiers"]:
            errors.append(
                f"{placement['kit']}/{placement['assetId']}: LOD chain has "
                f"{len(chain)} tier(s), not the {lod['tiers']} the runtime requires "
                f"(first placement {placement['id']})")
        elif (chain[1] < min(chain[0], floor[0]) or chain[2] < min(chain[0], floor[1])):
            errors.append(
                f"{placement['kit']}/{placement['assetId']}: LOD triangles {chain[:3]} "
                f"fall below the absolute floor {list(floor)} "
                f"(first placement {placement['id']})")
    return errors


def texture_cap_errors(kits: dict, lod: dict, kits_dir: Path = KITS) -> list[str]:
    """The offline form of the runtime's `validateMaterialTextureCap` throw.

    Same class of defect as the LOD contract: the runtime measures the texture
    actually bound to a drawn material and throws over the cap, so an oversize
    image in a published kit is invisible until a player walks up to the one
    piece that uses it. Measured from the GLB image headers, not a manifest
    claim — the same reason the runtime reads the decoded image.
    """
    cap = lod["atlasMaxSize"]
    errors: list[str] = []
    for kit in sorted(kits):
        path = kits_dir / f"{kit}.glb"
        data = path.read_bytes()
        offset = 12
        document: dict | None = None
        binary = b""
        while offset + 8 <= len(data):
            length, chunk_type = struct.unpack_from("<II", data, offset)
            payload = data[offset + 8:offset + 8 + length]
            if chunk_type == 0x4E4F534A:
                document = json.loads(payload)
            else:
                binary = payload
            offset += 8 + length + (-length % 4)
        if document is None:
            raise ValueError(f"{path}: no JSON chunk in GLB")
        for index, image in enumerate(document.get("images", [])):
            view = document["bufferViews"][image["bufferView"]]
            start = view.get("byteOffset", 0)
            width, height = _image_size(binary[start:start + view["byteLength"]])
            if width > cap or height > cap:
                errors.append(f"{kit}: image {index} is {width}x{height}, over the "
                              f"runtime texture cap of {cap}")
    return errors


def _image_size(blob: bytes) -> tuple[int, int]:
    """PNG/JPEG/KTX2 dimensions from the header alone; no decode, no dependency."""
    # KTX2 (KHR_texture_basisu) is what the compressed kits ship since 0073 §7c:
    # 12-byte identifier, then vkFormat/typeSize, then level-0 width/height as
    # little-endian uint32 at byte 20 and 24.
    if blob[:12] == b"\xabKTX 20\xbb\r\n\x1a\n":
        width, height = struct.unpack_from("<II", blob, 20)
        return width, height
    if blob[:8] == b"\x89PNG\r\n\x1a\n":
        width, height = struct.unpack_from(">II", blob, 16)
        return width, height
    if blob[:2] == b"\xff\xd8":
        offset = 2
        while offset + 4 <= len(blob):
            if blob[offset] != 0xFF:
                break
            marker = blob[offset + 1]
            length = struct.unpack_from(">H", blob, offset + 2)[0]
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                height, width = struct.unpack_from(">HH", blob, offset + 5)
                return width, height
            offset += 2 + length
    raise ValueError(
        "kit texture is not PNG, JPEG or KTX2; size cannot be measured")


def lod0_part_counts(kit: str, kits_dir: Path = KITS) -> dict[str, int]:
    """Per-asset LOD0 primitive count — the exact part list the runtime builds.

    Mirrors buildArchitectureKit + solidFrom in packages/game-core: three.js
    makes one Mesh (one collision part) per glTF primitive, and only level 0
    meshes are used for collision.
    """
    document = _glb_document(kits_dir / f"{kit}.glb")
    nodes = document.get("nodes", [])
    meshes = document.get("meshes", [])
    scene = document["scenes"][document.get("scene", 0)].get("nodes", [])
    counts: dict[str, int] = {}

    def walk(index: int) -> int:
        node = nodes[index]
        total = 0
        if "mesh" in node and (node.get("extras") or {}).get("lod", 0) == 0:
            total += len(meshes[node["mesh"]].get("primitives", []))
        for child in node.get("children", []):
            total += walk(child)
        return total

    for index in scene:
        asset_id = (nodes[index].get("extras") or {}).get("assetId")
        if isinstance(asset_id, str):
            counts[asset_id] = walk(index)
    return counts


def resident_collision_parts(
    settlements: list[dict], placements: list[dict], kits_dir: Path = KITS,
) -> dict[str, int]:
    """Collision parts the runtime must build for each settlement's residents."""
    by_id = {placement["id"]: placement for placement in placements}
    kit_counts: dict[str, dict[str, int]] = {}
    totals: dict[str, int] = {}
    for settlement in settlements:
        total = 0
        for placement_id in settlement["placementIds"]:
            placement = by_id.get(placement_id)
            if placement is None:
                continue
            collision = placement.get("collision") or {}
            if collision.get("kind", "none") == "none":
                continue
            parts = collision.get("parts")
            if parts:
                total += max(1, len(parts))
                continue
            kit = placement["kit"]
            if kit not in kit_counts:
                kit_counts[kit] = lod0_part_counts(kit, kits_dir)
            total += max(1, kit_counts[kit].get(placement["assetId"], 1))
        totals[settlement["id"]] = total
    return totals


def collider_budget_errors(
    settlements: list[dict], placements: list[dict], budget: int,
    kits_dir: Path = KITS,
) -> list[str]:
    """The offline form of the runtime's resident-collision refusal.

    SettlementLayer refuses to draw ANY settlement geometry when the residents
    of the settlement the focus stands in exceed the part budget — a failure
    that only appears at one position in the browser. Catch it at export.
    """
    errors = []
    for settlement_id, parts in sorted(
            resident_collision_parts(settlements, placements, kits_dir).items()):
        if parts > budget:
            errors.append(
                f"{settlement_id}: {parts} resident collision parts exceed the "
                f"runtime collider part budget of {budget}; the settlement layer "
                f"would refuse to draw anything while the player stands inside it")
    return errors


def _bounds_footprint(
    asset: dict, position: list, yaw_deg: float, scale: float,
) -> list[list[float]]:
    """World-space measured bbox footprint for perimeter policies without an authored hull."""
    size = asset.get("sizeM")
    origin = asset.get("originOffsetM")
    if (not isinstance(size, list) or len(size) != 3
            or not all(_is_number(value) and value > 0 for value in size)):
        raise ValueError(f"{asset['kit']}/{asset['id']}: perimeter anchor needs measured sizeM")
    x0, z0 = -origin[0] * scale, -origin[1] * scale
    x1, z1 = (size[0] - origin[0]) * scale, (size[1] - origin[1]) * scale
    angle = math.radians(yaw_deg)
    c, s = math.cos(angle), math.sin(angle)
    return [[round(position[0] + x * c - z * s, 3),
             round(position[2] + x * s + z * c, 3)]
            for x, z in ((x0, z0), (x1, z0), (x1, z1), (x0, z1))]


def _anchor_contract(asset: dict, ground_fit: str) -> dict:
    _validate_ground_fit(asset["id"], ground_fit, asset["_placementPolicyId"])
    return {**asset["_runtimeAnchor"], "groundFit": ground_fit}


def _route_file_name(way_id: str) -> str:
    if "." not in way_id:
        raise ValueError(f"route structure way id has no namespace: {way_id}")
    return way_id.split(".", 1)[1].replace(".", "-") + ".json"


def _validated_route_docs(structures_dir: Path, source_path: Path) -> list[dict]:
    """Require the compiler shelf to cover the authored structure set exactly.

    Glob-derived publication used to mean deleting one output file simply
    deleted that route's physical structures from the runtime bundle.  The
    authoring registry is the expected-set authority; output filenames, way
    ids, embedded source rows and sourceStructureId coverage must all agree.
    """
    source = _read(source_path)
    rows = source.get("structures")
    if not isinstance(rows, list):
        raise ValueError("route structure source has no structures list")
    expected_by_way: dict[str, list[dict]] = {}
    source_ids: set[str] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) \
                or not isinstance(row.get("wayId"), str):
            raise ValueError(f"route structure source row {index} is invalid")
        if row["id"] in source_ids:
            raise ValueError(f"duplicate authored route structure id: {row['id']}")
        source_ids.add(row["id"])
        expected_by_way.setdefault(row["wayId"], []).append(row)

    expected_files = {_route_file_name(way_id): way_id for way_id in expected_by_way}
    actual_files = {path.name: path for path in structures_dir.glob("*.json")}
    missing = sorted(set(expected_files) - set(actual_files))
    unexpected = sorted(set(actual_files) - set(expected_files))
    if missing or unexpected:
        detail = []
        if missing:
            detail.append(f"missing route structure outputs: {', '.join(missing)}")
        if unexpected:
            detail.append(f"unexpected route structure outputs: {', '.join(unexpected)}")
        raise ValueError("route structure output file set is incomplete; " + "; ".join(detail))

    docs: list[dict] = []
    placement_ids: set[str] = set()
    for filename, way_id in sorted(expected_files.items()):
        doc = _read(actual_files[filename])
        if doc.get("wayId") != way_id:
            raise ValueError(f"{filename}: wayId does not match expected {way_id}")
        expected_rows = sorted(expected_by_way[way_id], key=lambda row: row["id"])
        actual_rows = doc.get("structures")
        if not isinstance(actual_rows, list) or sorted(actual_rows, key=lambda row: row.get("id", "")) != expected_rows:
            raise ValueError(f"{way_id}: compiled structure set differs from authored source")
        placements = doc.get("placements")
        if not isinstance(placements, list):
            raise ValueError(f"{way_id}: placements must be a list")
        covered: set[str] = set()
        for placement in placements:
            if not isinstance(placement, dict) or not isinstance(placement.get("id"), str):
                raise ValueError(f"{way_id}: invalid route placement")
            if placement["id"] in placement_ids:
                raise ValueError(f"duplicate route placement id: {placement['id']}")
            placement_ids.add(placement["id"])
            provenance = placement.get("provenance")
            structure_id = provenance.get("sourceStructureId") if isinstance(provenance, dict) else None
            if structure_id not in {row["id"] for row in expected_rows}:
                raise ValueError(f"{placement['id']}: placement has unknown sourceStructureId")
            covered.add(structure_id)
        absent = sorted({row["id"] for row in expected_rows} - covered)
        if absent:
            raise ValueError(f"{way_id}: authored structures have no placements: {', '.join(absent)}")
        for row in expected_rows:
            pieces = sorted(
                (placement for placement in placements
                 if placement["provenance"]["sourceStructureId"] == row["id"]),
                key=lambda placement: placement.get("fromM", float("inf")),
            )
            # The id set must be complete — a dropped piece is a hole nobody
            # would notice — but ids are not numbered in chainage order once
            # piers and towers are interleaved with the deck they carry
            # (decision 0051), so compare the set, not the sequence.
            expected_ids = {f"{row['id']}.p{index}" for index in range(1, len(pieces) + 1)}
            if {piece["id"] for piece in pieces} != expected_ids:
                raise ValueError(f"{row['id']}: route placement id set is not contiguous")
            if any(not isinstance(piece.get("fromM"), (int, float))
                   or not isinstance(piece.get("toM"), (int, float)) for piece in pieces):
                raise ValueError(f"{row['id']}: route placements need measured chainage")
            # A piece may begin BEFORE the authored start: an abutment reaches
            # back onto the bank the deck lands on, which is the whole point of
            # decision 0051's abutments and piers (3 of 543 structures do, by
            # 1.5–3.1 m). What must never happen is starting LATE — that is a
            # hole in the road where the way meets the span.
            if float(pieces[0]["fromM"]) - float(row["fromM"]) > 0.02:
                raise ValueError(f"{row['id']}: route placements start after authored chainage")
            # Overlap is not a gap. A pier, tower or abutment shares chainage
            # with the deck it carries by design (decision 0051), and 1926 of
            # the province's piece pairs overlap by 0.09–4.09 m for exactly
            # that reason. Only a positive gap is a hole in the road.
            for before, after in zip(pieces, pieces[1:]):
                if float(after["fromM"]) - float(before["toM"]) > 0.02:
                    raise ValueError(f"{row['id']}: route placement chainage has a gap")
            if float(pieces[-1]["toM"]) < float(row["toM"]) - 0.05:
                raise ValueError(f"{row['id']}: route placements do not cover authored chainage")
        docs.append(doc)
    return docs


def _metres(poly: list, survey: ProvinceSurvey) -> list[list[float]]:
    return [[round(v, 3) for v in survey.uv_to_m(float(p[0]), float(p[1]))]
            for p in poly]


def validate_applied_pad_grades(receipt: dict | None, blueprints: list[dict],
                                final_height: np.ndarray | None) -> list[str]:
    """Bind current pad parcels to the exact final terrain that will ship."""
    expected = grade_settlement_pads.pad_specs(blueprints)
    if not expected:
        return []
    if not isinstance(receipt, dict):
        return ["authored pad parcels have no applied terrain receipt"]
    if final_height is None:
        return ["authored pad parcels have no final heightfield evidence"]
    errors: list[str] = []
    if not grade_settlement_pads.already_applied(receipt, final_height, expected):
        errors.append("settlement pad receipt does not match current blueprints and final heightfield")
    actual_rows = receipt.get("pads")
    if not isinstance(actual_rows, list):
        return errors + ["settlement pad receipt has no pads list"]
    expected_identity = [(row["id"], row["sourceBlueprintSha256"]) for row in expected]
    actual_identity = [(row.get("id"), row.get("sourceBlueprintSha256"))
                       for row in actual_rows if isinstance(row, dict)]
    if actual_identity != expected_identity:
        errors.append("settlement pad receipt does not cover the exact authored pad set")
    for row in actual_rows:
        if not isinstance(row, dict):
            errors.append("settlement pad receipt contains a malformed row")
        elif row.get("postcondition") != "pass" or row.get("maxHardSurfaceErrorM", 1) > 1e-5:
            errors.append(f"{row.get('parcelId', 'unknown pad')}: final pad postcondition failed")
        elif row.get("maxFillM", grade_settlement_pads.MAX_PAD_DELTA_M + 1) \
                > grade_settlement_pads.MAX_PAD_DELTA_M \
                or row.get("maxCutM", grade_settlement_pads.MAX_PAD_DELTA_M + 1) \
                > grade_settlement_pads.MAX_PAD_DELTA_M:
            errors.append(f"{row.get('parcelId', 'unknown pad')}: pad exceeded the two-metre limit")
    return errors


def load_warning_known_red(path: Path | None = None) -> dict[tuple[str, str, str], dict]:
    """Settlement compile warnings that are named, owned and tracked.

    A register, not a suppression, exactly as
    ``terrain_request_postconditions.load_known_red``: the exporter still
    reports every row by name, and a warning outside the register, a row that
    has started passing, or a row whose place is absent from the compiled set
    all fail the export.
    """
    path = path or WARNING_KNOWN_RED
    if not path.exists():
        return {}
    document = json.loads(path.read_text(encoding="utf-8"))
    rows: dict[tuple[str, str, str], dict] = {}
    for row in document.get("warnings") or []:
        for field in ("placeId", "subjectId", "rule", "owner", "queuedIn", "why"):
            if not row.get(field):
                raise ValueError(f"{path.name}: a register row is missing '{field}' — "
                                 "every row names its owner, its reason and where it is queued")
        rows[(row["placeId"], row["subjectId"], row["rule"])] = row
    return rows


def warning_keys(doc: dict) -> list[tuple[str, str, str]]:
    """The (place, subject, rule) key of every warning the compile raised.

    Read from the compiled ``floodBandReport``'s structured rows rather than
    from the warning prose, so a key survives a change in the measured sample
    counts and disappears when the finding itself does.
    """
    report = doc.get("floodBandReport") or {}
    place_id = doc.get("id")
    keys: list[tuple[str, str, str]] = []
    for district in report.get("districts") or []:
        rule = district.get("cultureRule")
        if rule and district.get("conforms") is False:
            keys.append((place_id, district["districtId"], rule["id"]))
    for section in report.get("sectionRules") or []:
        if section.get("conforms") is False:
            keys.append((place_id, section["parcelId"], section["rule"]))
    return keys


def classify_warnings(compiled_docs: list[dict],
                      known_red: dict[tuple[str, str, str], dict]) -> dict[str, list]:
    """Split the compiled warning set against the register."""
    raised = []
    for doc in compiled_docs:
        raised.extend(warning_keys(doc))
    raised_set = set(raised)
    compiled_places = {doc.get("id") for doc in compiled_docs}
    return {
        "knownRed": sorted(raised_set & set(known_red)),
        "unexplained": sorted(raised_set - set(known_red)),
        "noLongerRed": sorted(key for key in known_red
                              if key[0] in compiled_places and key not in raised_set),
        "placeNotCompiled": sorted(key for key in known_red if key[0] not in compiled_places),
    }


def _unwaived(doc: dict, errors: list[str]) -> list[str]:
    """The errors a fixture replay's receipt does not already name.

    A replay compile (`compile_settlement --fixture-replay`) records every rule
    its layout breaks in `fixtureWaived`; the export re-derives some of the
    same checks, and each finding passes only if that exact message is in the
    receipt. On any other compile every error stands."""
    if doc.get("fixtureReplay") is not True:
        return list(errors)
    waived = {row.get("message") for row in doc.get("fixtureWaived") or []}
    return [e for e in errors if e not in waived]


def build_bundle(settlements_dir: Path = DEFAULT_SETTLEMENTS,
                 structures_dir: Path = DEFAULT_STRUCTURES,
                 blueprints_dir: Path = BLUEPRINTS,
                 kits_dir: Path = KITS,
                 route_structures_source: Path = ROUTE_STRUCTURES_SOURCE,
                 catalogue_records_by_id: dict[str, dict] | None = None,
                 terrain_evidence: tuple[dict, dict, dict] | None = None,
                 pad_grade_receipt: dict | None = None,
                 final_height: np.ndarray | None = None,
                 known_red_path: Path | None = None,
                 fixtures_ok: bool = False,
                 all_kit_assets: bool = False) -> dict:
    """Build the bundle, or refuse. There is no waiver (16h item 6).

    Fail-closed is the rule: a stale or simply absent place must never quietly
    vanish from the world the player receives, and no reason makes a defective
    bundle a publishable one. The one thing the old `--ship-with-errors` waiver
    ever shipped over was an ungraded settlement pad; a pad is a local terrain
    patch (16h part 2), so a parcel still wanting one is now reported in
    `pendingPadGrades` and blocks nothing.

    `fixtures_ok` publishes fixture records (`fixture: true`, e.g. the proving
    ground) to a studio-only target. The shipped build refuses them.
    """
    survey = shared_survey()
    known_red = load_warning_known_red(known_red_path)
    pending_pads: list[str] = []
    if catalogue_records_by_id is None:
        catalogue_records_by_id = {
            record["id"]: record
            for region_file in catalogue.load_region_files()
            for record in region_file.places
        }
    blueprint_by_id = {}
    for path in sorted(blueprints_dir.glob("place.*.json")):
        doc = _read(path)
        bp = doc.get("blueprint")
        if bp:
            blueprint_by_id[bp["id"]] = bp

    blueprint_docs = [{"blueprint": bp} for bp in blueprint_by_id.values()]
    # an absent groundFit is the kit record's and may be pad (0085): pad_specs resolves it
    if any(parcel.get("groundFit", "pad") == "pad" for bp in blueprint_by_id.values()
           for parcel in bp.get("parcels", [])):
        if pad_grade_receipt is None:
            try:
                pad_grade_receipt = _read(grade_settlement_pads.PUBLIC_RECEIPT)
            except FileNotFoundError:
                pad_grade_receipt = None
        if final_height is None:
            try:
                final_height = np.load(grade_settlement_pads.DEFAULT_HEIGHTS).astype(np.float32)
            except FileNotFoundError:
                final_height = None
        pad_errors = validate_applied_pad_grades(pad_grade_receipt, blueprint_docs, final_height)
        # A pad a parcel wants and has not got is a PENDING local terrain patch
        # (16h part 2), reported in the receipt, never a reason to refuse and
        # never a waiver.
        pending_pads = sorted(pad_errors)

    compiled = []
    # Route pieces come from TWO built kits since 2026-09-09 (decision 0051):
    # the climbs from route-structures-v1 and the crossings from route-spans-v1.
    # A placement names neither, so the kit is resolved per asset below and both
    # manifests must be loaded.
    kit_names: set[str] = {"route-structures-v1", "route-spans-v1"}
    for path in sorted(settlements_dir.glob("place.*.settlement.json")):
        doc = _read(path)
        if not fixtures_ok and _is_fixture(
                doc, catalogue_records_by_id.get(doc["id"]),
                blueprint_by_id.get(doc["id"])):
            raise ValueError(
                f"{doc['id']} is a fixture record (fixture: true, fixtureReplay: true, "
                f"or a place.fixture.* id) and the shipped build carries no fixtures: "
                f"publish it to the studio with --fixtures-ok, or drop the flag "
                f"from the record")
        if doc.get("errors"):
            raise ValueError(f"{doc['id']} has {len(doc['errors'])} compile errors; "
                             "refusing to publish stale/incomplete massing: "
                             + "; ".join(str(e) for e in doc["errors"]))
        flood_report = doc.get("floodBandReport")
        if not isinstance(flood_report, dict):
            raise ValueError(f"{doc['id']} has no floodBandReport; refusing unchecked section placement")
        warnings = doc.get("warnings")
        if doc.get("fixtureReplay") is True or (
                _is_fixture(doc, blueprint_by_id.get(doc["id"]))
                and isinstance(doc.get("fixtureWaived"), list)):
            # compile_settlement --fixture-replay moved every finding, WARN
            # grade included, into `fixtureWaived`, and a fixture blueprint
            # (the proving ground) moves its WARN-grade findings there on
            # every compile (16h part 1 round 4): nobody judges a test yard's
            # layout, and the receipt names each rule it breaks.
            if warnings != [] or not isinstance(doc.get("fixtureWaived"), list):
                raise ValueError(f"{doc['id']} is a fixture compile but still carries live "
                                 f"warnings or no fixtureWaived receipt; recompile it "
                                 f"(a replay with --fixture-replay)")
        elif not isinstance(warnings, list) or flood_report.get("warningCount") != len(warnings):
            raise ValueError(f"{doc['id']} warning ledger disagrees with floodBandReport")
        elif len(warning_keys(doc)) != len(warnings):
            raise ValueError(f"{doc['id']} raised {len(warnings)} warnings but only "
                             f"{len(warning_keys(doc))} carry a structured floodBandReport row; "
                             "an unattributable warning cannot be explained, so it blocks export")
        bp = blueprint_by_id.get(doc["id"])
        if bp is None:
            raise ValueError(f"compiled settlement has no authored blueprint: {doc['id']}")
        expected_hash = blueprint_sha256(bp)
        if doc.get("sourceBlueprintSha256") != expected_hash:
            # A stale compile is the most dangerous thing to publish: the
            # geometry shipped is not the geometry the blueprint now describes.
            raise ValueError(
                f"{doc['id']} sourceBlueprintSha256 does not match its authored "
                f"blueprint; refusing to publish a stale successful compile")
        for p in doc.get("placements", []):
            if p.get("kit"):
                kit_names.add(p["kit"])
        compiled.append((doc, bp))

    compiled_ids = {doc["id"] for doc, _bp in compiled}
    missing = sorted(set(blueprint_by_id) - compiled_ids)
    unexpected = sorted(compiled_ids - set(blueprint_by_id))
    if missing or unexpected:
        details = []
        if missing:
            details.append(f"missing compiled blueprints: {', '.join(missing)}")
        if unexpected:
            details.append(f"unexpected compiled blueprints: {', '.join(unexpected)}")
        raise ValueError("compiled settlement set does not match the authored exemplar set; "
                         + "; ".join(details))

    split = classify_warnings([doc for doc, _bp in compiled], known_red)
    for key in split["knownRed"]:
        row = known_red[key]
        print(f"  KNOWN-RED settlement warning ({row['owner']}-owned, queued in "
              f"{row['queuedIn']}): {key[0]} / {key[1]} / {key[2]}")
    blocking = []
    replayed = {doc["id"] for doc, _bp in compiled if doc.get("fixtureReplay") is True
                or (_is_fixture(doc, _bp) and isinstance(doc.get("fixtureWaived"), list))}
    for key in split["unexplained"]:
        if key[0] in replayed:
            continue    # recorded in that site's fixtureWaived, never judged
        blocking.append(f"UNEXPLAINED WARNING {key[0]} / {key[1]} / {key[2]}")
    for key in split["noLongerRed"]:
        blocking.append(f"NO LONGER RED — remove from {WARNING_KNOWN_RED.name}: "
                        f"{key[0]} / {key[1]} / {key[2]}")
    for key in split["placeNotCompiled"]:
        blocking.append(f"KNOWN-RED ROW'S PLACE IS NOT IN THE COMPILED SET: "
                        f"{key[0]} / {key[1]} / {key[2]}")
    if blocking:
        raise ValueError("settlement warnings block export: " + "; ".join(blocking))
    warning_register = [
        {"placeId": key[0], "subjectId": key[1], "rule": key[2],
         "owner": known_red[key]["owner"], "queuedIn": known_red[key]["queuedIn"],
         "why": known_red[key]["why"]}
        for key in split["knownRed"]
    ]

    route_docs = _validated_route_docs(structures_dir, route_structures_source)
    used: set[tuple[str, str]] | None = None
    if not all_kit_assets:
        used = {(p["kit"], p["assetId"]) for doc, _bp in compiled
                for p in doc.get("placements", []) if p.get("kit")}
        # A route placement names no kit: it resolves in either route kit.
        used |= {(kit, raw["assetId"]) for doc in route_docs
                 for raw in doc.get("placements", [])
                 for kit in ("route-structures-v1", "route-spans-v1")}
    kits, assets = _kit_assets(kit_names, kits_dir, used)

    settlements = []
    obligation_receipts = []
    all_compiled_objects = []
    all_placements = []
    treatments = []
    inventory = load_inventory()
    navmesh = []
    navmesh_links = []
    doors = []
    # The same kit geometry the compile bound (interiors, connectors,
    # assembly doorways), or the re-derivation can never equal it; read once
    # per run, not once per place.
    interiors, connectors, doorways = kit_interiors(), kit_connectors(), assembly_doorways()
    for doc, bp in compiled:
        record = catalogue_records_by_id.get(doc["id"])
        expected_objects, object_errors = compiled_blueprint_objects(
            bp, doc.get("placements", []), doc.get("doors", []), survey,
            interiors=interiors, connectors=connectors, assemblies=doorways)
        if record is not None:
            evidence_kwargs = (dict(zip(("plan", "fulfillment", "postconditions"), terrain_evidence))
                               if terrain_evidence is not None else {})
            terrain_notes: list[str] = []
            terrain_objects, terrain_errors = compiled_terrain_objects(
                record, notes=terrain_notes, **evidence_kwargs)
            for note in terrain_notes:
                print(f"export_settlement_bundle: {note}", file=sys.stderr)
            expected_objects.extend(terrain_objects)
            expected_objects.sort(key=lambda row: row["id"])
            object_errors += terrain_errors
        object_errors = _unwaived(doc, object_errors)
        if object_errors:
            raise ValueError(f"{doc['id']} compiled object set is incomplete: "
                             + "; ".join(object_errors))
        actual_objects = doc.get("compiledObjects")
        if not isinstance(actual_objects, list):
            raise ValueError(f"{doc['id']} has no compiledObjects final-delivery record")
        if actual_objects != expected_objects:
            raise ValueError(f"{doc['id']} compiledObjects do not match the exact "
                             f"compiler output: what is published for this place is "
                             f"not what its current blueprint compiles to")
        compiled_by_id = {obj["id"]: obj for obj in actual_objects}
        if len(compiled_by_id) != len(actual_objects):
            raise ValueError(f"{doc['id']} compiledObjects contain duplicate ids")
        if record is not None:
            obligations, obligation_errors = place_obligations.build_obligations(record, bp)
            if obligation_errors:
                raise ValueError(f"{doc['id']} current macro obligations are invalid: "
                                 + "; ".join(obligation_errors))
            receipt = doc.get("phase11ObligationReceipt")
            if not isinstance(receipt, dict):
                raise ValueError(f"{doc['id']} has no phase-11-compiled obligation receipt")
            payload = {key: receipt.get(key) for key in ("placeId", "objectRegistry", "manifest")}
            if receipt.get("receiptSha256") != _canonical_sha256(payload):
                raise ValueError(f"{doc['id']} phase-11-compiled obligation receipt is stale or corrupt")
            if payload["placeId"] != doc["id"] or not isinstance(payload["objectRegistry"], dict):
                raise ValueError(f"{doc['id']} phase-11-compiled obligation receipt has invalid identity")
            for ref, receipt_object in payload["objectRegistry"].items():
                compiled_object = compiled_by_id.get(ref)
                if compiled_object is None:
                    raise ValueError(f"{doc['id']} phase-11 receipt names non-emitted compiled object {ref!r}")
                if receipt_object.get("compiledObjectSha256") != _canonical_sha256(compiled_object):
                    raise ValueError(f"{doc['id']} phase-11 receipt hash does not match compiled object {ref!r}")
                if (receipt_object.get("kind"), receipt_object.get("placeId")) != (
                        compiled_object.get("kind"), compiled_object.get("placeId")):
                    raise ValueError(f"{doc['id']} phase-11 receipt type does not match compiled object {ref!r}")
            delivery_errors = place_obligations.verify_delivery_manifest(
                obligations, payload["manifest"], "phase-11-compiled",
                object_registry=payload["objectRegistry"])
            delivery_errors = _unwaived(doc, delivery_errors)
            if delivery_errors:
                raise ValueError(f"{doc['id']} phase-11-compiled obligations are not delivered: "
                                 + "; ".join(delivery_errors))
            obligation_receipts.append(receipt)
        all_compiled_objects.extend(actual_objects)
        parcels = {p["id"]: p for p in bp.get("parcels", [])}
        ids = []
        laid_runs: dict[str, list[dict]] = {}
        parcel_treatment: dict[str, dict] = {}
        for raw in doc.get("placements", []):
            if not raw.get("kit"):
                raise ValueError(
                    f"{raw.get('id', doc['id'])}: compiled physical placement has no built kit"
                )
            asset = assets.get((raw["kit"], raw["assetId"]))
            if asset is None:
                raise ValueError(f"{raw['id']}: asset absent from {raw['kit']} manifest")
            fit = raw.get("groundFit", "direct")
            parcel = parcels.get(raw.get("parcelId"), {})
            object_kind = raw.get("objectKind") or (
                "dressing" if "dressingFor" in raw else "parcel")
            is_dressing = object_kind == "dressing"
            # a run piece or an assembly piece carries its own outline
            # (compile_settlement); a mounted piece touches no terrain; every
            # other parcel piece is seated on its parcel's footprint
            mounted = bool(raw.get("parentPlacementId"))
            footprint = ([] if is_dressing or mounted else raw.get("footprintM")
                         or _metres(parcel.get("footprint", []), survey))
            if (asset["_runtimeAnchor"]["mode"] == "streamed-perimeter" and not footprint
                    and not mounted):
                footprint = _bounds_footprint(
                    asset, raw["positionM"], raw.get("yawDeg", 0), raw.get("scale", 1),
                )
            placement = {
                "id": raw["id"], "sourceId": doc["id"],
                # an authored assembly piece is part of its building: drawn and
                # collided as the building is
                "kind": ("settlement" if object_kind in ("parcel", "assembly")
                         else object_kind),
                "assetId": raw["assetId"], "kit": raw["kit"],
                "positionM": raw["positionM"], "yawDeg": raw.get("yawDeg", 0),
                "scale": raw.get("scale", 1), "footprintM": footprint,
                "anchor": _anchor_contract(asset, fit),
                "collision": _collision_contract(asset, disabled=is_dressing),
                "provenance": raw["provenance"],
                **_mount_contract(raw),
                **_run_contract(raw, parcel, laid_runs),
            }
            ids.append(placement["id"])
            all_placements.append(placement)
            if footprint and not is_dressing:
                # The grass exclusion reads it (the skirt, rubble and far-tier
                # fields were cut at check-in 2): a floor clears its footprint,
                # a raised deck only its contacts (check-in 3 §5).
                treatment = {"id": f"treatment.{placement['id']}",
                             "kind": _treatment_kind(asset, raw, fit, inventory),
                             "footprintM": footprint}
                treatments.append(treatment)
                parcel_treatment.setdefault(raw.get("parcelId"), treatment)
                navmesh.append({"id": f"navcut.{placement['id']}",
                                "placementId": placement["id"],
                                "polygonM": footprint, "order": 3})
                if fit == "stilt":
                    navmesh_links.append({
                        "id": f"navlink.{placement['id']}.deck-to-ground",
                        "placementId": placement["id"], "kind": "deck-to-ground",
                        "bidirectional": True,
                    })
        for door in doc.get("doors", []):
            x, z = survey.uv_to_m(*door["thresholdUV"])
            _attach_door_apron(door, x, z, parcel_treatment)
            doors.append({**door, "settlementId": doc["id"],
                          "thresholdM": [round(x, 3), round(z, 3)],
                          "interiorArrival": {"doorId": door["id"],
                                              "positionM": [0, 0, 1.5]},
                          "navmeshSides": ["exterior", "interior"]})
        settlements.append({
            "id": doc["id"], "placementIds": ids,
            "compiledObjectIds": sorted(compiled_by_id),
            "boundaryM": _metres(bp.get("boundary", []), survey),
            "budgetReport": doc.get("budgetReport"),
            "floodBandReport": doc["floodBandReport"],
            "variants": bp.get("variants", []),
            **({"fixtureReplay": True} if doc.get("fixtureReplay") is True else {}),
            **({"fixtureWaived": doc["fixtureWaived"]}
               if isinstance(doc.get("fixtureWaived"), list) else {}),
        })

    route_count = 0
    for doc in route_docs:
        for raw in doc.get("placements", []):
            for route_kit in ("route-structures-v1", "route-spans-v1"):
                asset = assets.get((route_kit, raw["assetId"]))
                if asset is not None:
                    break
            if asset is None:
                raise ValueError(
                    f"{raw['id']}: route asset {raw['assetId']} is in neither "
                    f"route-structures-v1 nor route-spans-v1")
            footprint = []
            if asset["_runtimeAnchor"]["mode"] == "streamed-perimeter":
                footprint = _bounds_footprint(
                    asset, raw["posM"], raw.get("yawDeg", 0), 1,
                )
            all_placements.append({
                "id": raw["id"], "sourceId": doc["wayId"], "kind": "route-structure",
                "assetId": raw["assetId"], "kit": route_kit,
                "positionM": raw["posM"], "yawDeg": raw.get("yawDeg", 0), "scale": 1,
                "footprintM": footprint,
                "anchor": _anchor_contract(asset, "direct"),
                "collision": _collision_contract(asset),
                "provenance": raw["provenance"],
                **_mount_contract(raw),
            })
            route_count += 1

    all_placements.sort(key=lambda p: p["id"])

    # A placed asset whose designed sink is the POLICY FALLBACK has no mined or
    # measured ground line of its own: it is a sourcing/mining GAP to be filled,
    # reported here by asset with the count it affects, never an export error
    # (16h item 1).
    fallback_counts: dict[str, int] = {}
    for placement in all_placements:
        asset = assets.get((placement["kit"], placement["assetId"]))
        if asset and str(asset["_runtimeAnchor"]["designedSinkM"]["evidence"]
                         ).startswith("policy-fallback"):
            fallback_counts[f"{placement['kit']}/{placement['assetId']}"] = \
                fallback_counts.get(f"{placement['kit']}/{placement['assetId']}", 0) + 1
    designed_sink_gaps = [{"asset": key, "placements": count}
                          for key, count in sorted(fallback_counts.items())]

    lod_contract = {"tiers": 3, "absoluteTriangleFloor": [120, 80],
                    "distancePerFootprintDiagonal": [4.0, 12.0],
                    "farMergeDistanceM": 900, "atlasMaxSize": 4096,
                    "colliderRadiusM": 180,
                    "colliderPartBudget": COLLIDER_PART_BUDGET}

    lod_errors = lod_contract_errors(all_placements, lod_contract, kits_dir)
    _refuse(
        "lod contract", lod_errors,
        "placed asset cannot satisfy the runtime LOD contract: " + "; ".join(lod_errors))

    cap_errors = texture_cap_errors(kits, lod_contract, kits_dir)
    _refuse(
        "texture cap", cap_errors,
        "published kit texture is over the runtime cap: " + "; ".join(cap_errors))

    budget_errors = collider_budget_errors(
        settlements, all_placements, COLLIDER_PART_BUDGET, kits_dir)
    _refuse(
        "collider budget", budget_errors,
        "settlement collider budget exceeded: " + "; ".join(budget_errors))

    return {
        "schemaVersion": SCHEMA_VERSION,
        "collisionFrame": COLLISION_FRAME,
        "lod": lod_contract,
        "kits": kits, "settlements": settlements,
        "knownRedWarnings": warning_register,
        "phase11ObligationReceipts": sorted(obligation_receipts,
                                              key=lambda receipt: receipt["placeId"]),
        "compiledObjects": sorted(all_compiled_objects, key=lambda row: row["id"]),
        "settlementPadGrades": pad_grade_receipt,
        # Parcels that still want a graded pad. A pad is a local terrain patch
        # (16h part 2); this is the queue, not a defect that blocks publication.
        "pendingPadGrades": pending_pads,
        # Placed assets standing on a policy-fallback designed sink (16h item 1).
        "designedSinkGaps": designed_sink_gaps,
        "placements": all_placements, "groundTreatments": treatments,
        "navmeshCuts": navmesh, "navmeshLinks": navmesh_links, "doors": doors,
        "stats": {"settlements": len(settlements),
                  "settlementPlacements": sum(len(s["placementIds"]) for s in settlements),
                  "routeStructurePlacements": route_count},
    }


# SHARED CONTRACT (16h): the compile decides how a piece is anchored and what
# it hangs off; the export carries those fields through unchanged. A field the
# compile did not emit is absent, never defaulted here — a wrong default would
# hang a lantern in the air or float a hull.
MOUNT_FIELDS = ("anchorClass", "parentPlacementId", "mountOffsetM",
                "waterLevelM", "waterEntityId", "pitchDeg")


def _mount_contract(raw: dict) -> dict:
    return {field: raw[field] for field in MOUNT_FIELDS if field in raw}


def _run_contract(raw: dict, parcel: dict, laid_runs: dict[str, list[dict]]) -> dict:
    """A modular-run piece's `run` {id, index, riseM} (16h check-in 3 §2).
    riseM is the cumulative mined rise the compile laid the piece at: the same
    `lay_pieces` over the same blueprint parcel (the compiled output was
    checked equal to what the current blueprint compiles to above). The
    runtime seats the whole run as one rigid chain on it (anchoring.ts
    anchorRun)."""
    run = raw.get("run")
    if not isinstance(run, dict):
        return {}
    pid = raw.get("parcelId")
    if pid not in laid_runs:
        laid, errors = fp_mod.lay_pieces(parcel)
        if errors:
            raise ValueError(f"{raw['id']}: its run no longer lays: " + "; ".join(errors))
        laid_runs[pid] = laid
    laid = laid_runs[pid]
    index = run.get("index")
    if not isinstance(index, int) or not 0 <= index < len(laid) or len(laid) != run.get("length"):
        raise ValueError(f"{raw['id']}: run index {index} of {run.get('length')} does not match "
                         f"the {len(laid)} pieces its parcel lays")
    return {"run": {"id": raw["id"].rsplit(".piece.", 1)[0], "index": index,
                    "riseM": float(laid[index]["riseM"])}}


#: Door apron radius (m) the groundcover keeps clear at every threshold.
DOOR_APRON_RADIUS_M = 1.5
#: A stilt/deck piece whose deck stands more than this over the ground keeps
#: the groundcover under it (owner 2026-09-25).
DECK_TREATMENT_CLEARANCE_M = 0.8


def _attach_door_apron(door: dict, x: float, z: float,
                       parcel_treatment: dict[str, dict]) -> None:
    """Every door threshold keeps a DOOR_APRON_RADIUS_M disc of groundcover
    clear, carried on its parcel's first ground treatment (check-in 3 §5)."""
    owner = parcel_treatment.get(door.get("parcelId"))
    if owner is None:
        raise ValueError(f"{door['id']}: its parcel {door.get('parcelId')!r} has no "
                         "ground treatment to carry the door apron")
    owner.setdefault("apronsM", []).append([round(x, 3), round(z, 3), DOOR_APRON_RADIUS_M])


def _deck_clearance_m(asset: dict, inventory: dict) -> float | None:
    """The deck's height over its support surface: the asset's
    ``assetPlacement`` row ``deckClearanceM``, else its placement policy's
    (placement_metadata.py: the stilt policy default 0.35 m)."""
    row = (inventory.get("assetPlacement") or {}).get(normalize_asset_id(asset["id"])) or {}
    if isinstance(row.get("deckClearanceM"), (int, float)):
        return float(row["deckClearanceM"])
    policy = (inventory.get("policies") or {}).get(asset.get("_placementPolicyId")) or {}
    value = policy.get("deckClearanceM")
    return float(value) if isinstance(value, (int, float)) else None


def _treatment_kind(asset: dict, raw: dict, fit: str, inventory: dict) -> str:
    """`deck` for a stilt/deck fit whose deck clears the ground by more than
    DECK_TREATMENT_CLEARANCE_M, else `floor` (16h check-in 3 §5)."""
    anchor_class = raw.get("anchorClass") or asset.get("anchorClass")
    if fit != "stilt" and anchor_class != "deck":
        return "floor"
    clearance = _deck_clearance_m(asset, inventory)
    return "deck" if clearance is not None and clearance > DECK_TREATMENT_CLEARANCE_M else "floor"


def _collision_contract(asset: dict, *, disabled: bool = False) -> dict:
    contract = {"frame": COLLISION_FRAME,
                "kind": "none" if disabled else asset.get("collision", "none")}
    # Asset-pipeline collision boxes are measured against the source pivot.
    # Prefer that exact proxy over rebuilding a box from render submeshes.
    box = asset.get("collisionBox")
    if not disabled and asset.get("collisionFrame") == "pivot-yup-v3" and isinstance(box, dict):
        half = box.get("halfExtentsM")
        centre = box.get("centreOffsetM")
        if (isinstance(half, list) and len(half) == 3
                and isinstance(centre, list) and len(centre) == 3):
            contract["parts"] = [{"halfExtentsM": half, "offsetM": centre}]
            contract["proxySource"] = "measured-manifest-box"
    return contract


def _stage_assets(bundle: dict, kits_dir: Path, public_dir: Path,
                  publish_kit=None) -> tuple[Path, list[str]]:
    """Validate and copy every asset to a private sibling before publication.

    16h K14 (M19 ruling 5): the GLB that ships is the PUBLISHED, compressed
    one in ``public_dir`` when its pair passes the ``kit_compress --check``
    rule (``glb_problems``); the raw ``kits_dir`` build is the measurement
    product and never reaches public/kits. A kit with no published GLB yet is
    compressed from the raw build through ``kit_compress.publish`` first. A
    published GLB that fails the rule (a raw build copied over it) is refused,
    as is a published manifest that is not the manifest this bundle was built
    from (the pair is stale against the build). Sidecars come from the build
    output, where the measurers write them."""
    from pipeline.kit_compress import glb_problems, publish
    publish_kit = publish_kit or publish
    kits = sorted(bundle["kits"])

    def sidecar_suffixes(name: str) -> list[str]:
        return [f".{part}.json" for part in KIT_SIDECARS
                if (kits_dir / f"{name}.{part}.json").is_file()]

    def require(path: Path) -> None:
        if not path.is_file() or path.stat().st_size <= 0:
            raise ValueError(f"runtime kit asset is missing or empty: {path}")

    # Every input exists before anything is published or staged.
    unpublished = [name for name in kits if not (public_dir / f"{name}.glb").is_file()]
    for name in kits:
        require(kits_dir / f"{name}.kit.json")
        if name in unpublished:
            require(kits_dir / f"{name}.glb")
        for suffix in sidecar_suffixes(name):
            require(kits_dir / f"{name}{suffix}")
    refused: list[str] = []
    for name in unpublished:
        publish_kit(name)
    for name in kits:
        glb, manifest = public_dir / f"{name}.glb", public_dir / f"{name}.kit.json"
        problems = glb_problems(name, glb, manifest)
        if not problems and _read(manifest) != _read(kits_dir / f"{name}.kit.json"):
            problems = [f"{name}: published manifest differs from the build's "
                        f"{kits_dir / (name + '.kit.json')} (stale publish)"]
        refused.extend(problems)
    if refused:
        raise ValueError("refusing to publish kits that fail kit_compress --check "
                         "(publish them with `python3 -m pipeline.kit_compress --kit "
                         "<kit>`): " + "; ".join(refused))
    public_dir.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".kits-stage.", dir=public_dir.parent))
    names: list[str] = []
    try:
        for name in kits:
            sources = [public_dir / f"{name}.glb", public_dir / f"{name}.kit.json"] + [
                kits_dir / f"{name}{suffix}" for suffix in sidecar_suffixes(name)]
            for source in sources:
                require(source)
                target = stage / source.name
                shutil.copy2(source, target)
                os.chmod(target, 0o644)
                with target.open("rb") as handle:
                    os.fsync(handle.fileno())
                names.append(source.name)
        return stage, names
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def copy_assets(bundle: dict, kits_dir: Path = KITS,
                public_dir: Path = PUBLIC_KITS, publish_kit=None) -> None:
    stage, names = _stage_assets(bundle, kits_dir, public_dir, publish_kit)
    try:
        public_dir.mkdir(parents=True, exist_ok=True)
        for name in names:
            os.replace(stage / name, public_dir / name)
    finally:
        shutil.rmtree(stage, ignore_errors=True)


def export(out: Path = OUT, copy: bool = False) -> dict:
    bundle = build_bundle()
    if copy:
        copy_assets(bundle)
    # settlements.json is the publication marker. It can never name assets
    # that have not all been validated, staged and moved into place.
    _atomic_json(out, bundle)
    return bundle


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--copy-assets", action="store_true")
    ap.add_argument("--fixtures-ok", action="store_true",
                    help="publish fixture records (`fixture: true`, the proving "
                         "ground) as well. Studio-only: the shipped build refuses "
                         "them, so this never runs against the published bundle.")
    ap.add_argument("--all-kit-assets", action="store_true",
                    help="check the shipped-kit placement contract on every asset of "
                         "every referenced kit, not only the placed ones (the miner "
                         "lane's catalogue-wide form, 16h K14)")
    args = ap.parse_args()
    try:
        bundle = build_bundle(fixtures_ok=args.fixtures_ok,
                              all_kit_assets=args.all_kit_assets)
        if args.copy_assets:
            copy_assets(bundle)
        _atomic_json(args.out, bundle)
    except ValueError as exc:
        print(f"export_settlement_bundle: {exc}")
        return 1
    pending = bundle.get("pendingPadGrades") or []
    if pending:
        print(f"export_settlement_bundle: {len(pending)} pad grade(s) pending "
              f"(local terrain patches, 16h part 2):")
        for row in pending:
            print(f"    PENDING PAD: {row}")
    print(f"export_settlement_bundle: {args.out} — "
          f"{bundle['stats']['settlementPlacements']} settlement + "
          f"{bundle['stats']['routeStructurePlacements']} route pieces")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
