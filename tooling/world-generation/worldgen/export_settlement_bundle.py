"""Export compiled settlements and route structures as one runtime bundle.

This is deliberately a projection of compiler output, not a second compiler.
It joins the placed references to the measured kit manifests, adds the runtime
anchoring/LOD/collision contract, and converts authored UV polygons to metres.
The browser can therefore render both settlement and route pieces through one
placed-piece path without importing authoring data.

Run from ``tooling/world-generation``::

    python3 -m worldgen.export_settlement_bundle --copy-assets

Writes one minified bundle per place and per route plus their index under
``apps/world-studio/public/province/settlements/`` (``settlement_bundles``,
S8), atomically (the old whole ``province/settlements.json`` is retired,
16k close-out 2026-09-27), and, when requested, copies only
referenced kit GLBs/manifests to ``public/kits``.
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


from .site_fields import ProvinceSurvey, shared_survey
from .compile_settlement import (
    POLICY_GROUND_FIT,
    assembly_doorways, blueprint_sha256, _canonical_sha256, compiled_blueprint_objects,
    compiled_terrain_objects, kit_connectors, kit_interiors,
)
from . import blueprint as bp_mod
from . import blueprint_footprints as fp_mod
from . import accepted_places, catalogue, place_obligations
from .atomic_write import atomic_write_bytes, atomic_write_json, publish_copy
from . import settlement_bundles

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
# 4 (16k walk 2, planner ruling yFinal): a placement may carry `yFinal: true`
# (its positionM[1] is the workbench's measured pivot height, applied verbatim
# by the runtime, never re-anchored). Additive: a v3 bundle reads as "no
# placement is final", so a --places publish over a v3 base upgrades it.
# 5 (16k walk 4): a place may carry `pools[]` (a layout `pool` op's still
# water, `pad_overlay.pool_record`) beside its `pool` ground overlay. Additive:
# a v3/v4 place has no pools; the runtime refuses pools on a bundle under 5.
SCHEMA_VERSION = 5
READABLE_SCHEMA_VERSIONS = (3, 4, 5)
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
# The budget is DERIVED on every export from the set it publishes
# (`collider_part_budget`) and written to lod.colliderPartBudget; the runtime
# reads only that published value. The fixed gate is the ceiling below.
COLLIDER_PART_HEADROOM = 1.55
# SettlementLayer.tsx TRIMESH_COLLISION_KINDS: pieces that collide as their own
# LOD0 triangles, which a bound run joins into one part
TRIMESH_COLLISION_KINDS = frozenset({"mesh", "convex"})
# planner 2026-09-27 (walk 2 D6): raised from 200 to 400 when every solid
# piece of 0.3 m x 0.3 m x 0.3 m and up gained a convex collider
# (build_kit.apply_size_collision); static colliders are cheap. A budget over
# COLLIDER_PART_WARNING prints a warning at export, so a place heading for the
# ceiling is seen before it fails.
COLLIDER_PART_CEILING = 400
COLLIDER_PART_WARNING = 250
# planner ruling 2026-09-28 (GREENSPRING3, 0052): a place with this many
# dwellings or more may reach COLLIDER_PART_CEILING_LARGE. Each dwelling
# brings its own clutter ring (0105 R33, 20 pieces within 12 m at M1), and a
# small collider is a cheap static trimesh; the ceiling still fails loudly.
COLLIDER_PART_CEILING_LARGE = 500
COLLIDER_CEILING_LARGE_DWELLINGS = 5
# planner ruling 2026-09-28 (GREENSPRING3, 0052): a placement under this size
# in plan (both axes) AND in height, at its placed scale, carries no collider
# and so counts toward no ceiling. The same 0.3 m as colliderRule
# (placement-workbench rules.COLLIDER_MIN_*_M) and build_kit's size rule
# (SIZE_COLLIDER_MIN_*_M, owner 2026-09-27).
SMALL_PIECE_MAX_PLAN_M = 0.3
SMALL_PIECE_MAX_HEIGHT_M = 0.3

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
# `out` names the province folder by its parent (bundles, index and ground
# sidecar go under out.parent/settlements/); nothing is written at `out` itself.
OUT = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "settlements.json"
PUBLIC_KITS = REPO_ROOT / "apps" / "world-studio" / "public" / "kits"
PLACE_MANIFESTS = REPO_ROOT / "tooling" / ".reports" / "16k"   # contract 1: <place-id>/manifest.json

# S8: every reader reads settlements/index.json and the per-place bundles
# (settlement_bundles.read_published / load_published in Python, the index in
# compose.mjs and yard-publish.sh, settlementIndex.ts in the browser); the
# whole file OUT is retired (16k close-out, 2026-09-27).

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
    patches from 16h part 2, not an export concern. Since 0102 a pad travels in
    the bundle as the place's `groundOverlays`, and a declared pad without one
    refuses the export; every other error is what it always was — a reason not to publish."""
    if not errors:
        return
    detail = RUNTIME_FATAL_ERROR_CLASSES.get(error_class)
    raise ValueError(f"{message}\n{detail}" if detail else message)


def _read(path: Path) -> dict:
    return json.loads(path.read_text())


def _atomic_json(path: Path, data: dict) -> None:
    """Replace a complete file; an interrupted export never leaves half JSON,
    and the file is published world-readable (atomic_write)."""
    atomic_write_json(path, data)


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
                effect_rows: dict[str, dict] | None = None,
                ) -> tuple[dict, dict[tuple[str, str], dict]]:
    """Referenced kits and their validated assets.

    ``effect_rows``, when given, is filled with each kit's `effectTextures`
    from the same single read of its manifest (`effect_contract` reads it
    there, never the file again per effect; r5 review).

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
        if effect_rows is not None:
            effect_rows[name] = manifest.get("effectTextures") or {}
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
        if key in seen or placement.get("kind") == "effect":
            continue                    # an effect draws no kit mesh
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
    """Collision parts the runtime must build for each settlement's residents.

    A bound run whose members all collide as their own triangles (`mesh`,
    `convex`) is ONE part: the runtime joins it into one trimesh, since the run
    is seated as one rigid chain (`runColliders.ts mergeRunColliders`, decision
    0101 rule 9). Any other member counts its own parts."""
    by_id = {placement["id"]: placement for placement in placements}
    kit_counts: dict[str, dict[str, int]] = {}
    totals: dict[str, int] = {}
    for settlement in settlements:
        total = 0
        runs: dict[str, list[dict]] = {}
        for placement_id in settlement["placementIds"]:
            placement = by_id.get(placement_id)
            if placement is None:
                continue
            collision = placement.get("collision") or {}
            if collision.get("kind", "none") == "none":
                continue
            run_id = (placement.get("run") or {}).get("id")
            if run_id:
                runs.setdefault(run_id, []).append(placement)
        joined = {run_id for run_id, members in runs.items() if len(members) >= 2
                  and all((m["collision"].get("kind") in TRIMESH_COLLISION_KINDS)
                          and not m["collision"].get("parts") for m in members)}
        total += len(joined)
        for placement_id in settlement["placementIds"]:
            placement = by_id.get(placement_id)
            if placement is None:
                continue
            collision = placement.get("collision") or {}
            if collision.get("kind", "none") == "none":
                continue
            if (placement.get("run") or {}).get("id") in joined:
                continue
            parts = collision.get("parts")
            # a mesh or convex piece collides as one trimesh per LOD0 primitive
            # whatever measured `parts` it carries (SettlementLayer solidFrom:
            # TRIMESH_COLLISION_KINDS never read them); only a box-kind piece
            # builds its measured parts
            if parts and collision.get("kind") not in TRIMESH_COLLISION_KINDS:
                total += max(1, len(parts))
                continue
            kit = placement["kit"]
            if kit not in kit_counts:
                kit_counts[kit] = lod0_part_counts(kit, kits_dir)
            total += max(1, kit_counts[kit].get(placement["assetId"], 1))
        totals[settlement["id"]] = total
    return totals


def dwelling_counts(settlement_ids, blueprints_dir: Path = BLUEPRINTS) -> dict[str, int]:
    """{settlement id: dwellings} as place_gates counts them (counted building
    parcels whose use is `dwelling`), read from world/sources/blueprints/<id>.json;
    a settlement with no blueprint there counts 0."""
    from . import parcel_kinds as pk
    out = {}
    for sid in settlement_ids:
        path = Path(blueprints_dir) / f"{sid}.json"
        if not path.exists():
            out[sid] = 0
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        bp = doc.get("blueprint", doc)
        out[sid] = sum(1 for parcel in pk.counted_parcels(bp, pk.kinds_of(bp), include=("building",))
                       if parcel.get("use") == "dwelling")
    return out


def collider_ceiling(dwellings: int, ceiling: int = COLLIDER_PART_CEILING) -> int:
    """The part ceiling one place is held to: COLLIDER_PART_CEILING_LARGE for a
    place of COLLIDER_CEILING_LARGE_DWELLINGS dwellings or more (planner ruling
    2026-09-28, 0052), else ``ceiling``."""
    return max(ceiling, COLLIDER_PART_CEILING_LARGE) if dwellings >= COLLIDER_CEILING_LARGE_DWELLINGS \
        else ceiling


def collider_part_budget(
    settlements: list[dict], placements: list[dict], kits_dir: Path = KITS,
    ceiling: int = COLLIDER_PART_CEILING, dwellings: dict[str, int] | None = None,
) -> tuple[int, list[str]]:
    """Decision 0052's budget for the set being published, and the ceiling gate.

    budget = round(worst resident parts x COLLIDER_PART_HEADROOM); an error for
    each place whose own round(parts x headroom) exceeds its ceiling
    (``collider_ceiling`` of its dwelling count; ``dwellings`` defaults to
    ``dwelling_counts`` over the blueprints), i.e. a place grew past what the
    runtime was sized for.
    """
    totals = resident_collision_parts(settlements, placements, kits_dir)
    if dwellings is None:
        dwellings = dwelling_counts(sorted(totals))
    worst_id, worst = max(sorted(totals.items()), key=lambda kv: kv[1], default=("", 0))
    budget = round(worst * COLLIDER_PART_HEADROOM)
    errors = []
    for sid, parts in sorted(totals.items()):
        own = round(parts * COLLIDER_PART_HEADROOM)
        n = dwellings.get(sid, 0)
        cap = collider_ceiling(n, ceiling)
        if own > cap:
            why = (f"the ceiling for a place of {COLLIDER_CEILING_LARGE_DWELLINGS} or more dwellings "
                   f"({n} here), each bringing its own clutter ring (planner ruling 2026-09-28, 0052)"
                   if cap != ceiling else f"the ceiling for a place of {n} dwelling(s)")
            errors.append(
                f"{sid}: {parts} resident collision parts x {COLLIDER_PART_HEADROOM} = "
                f"{own} exceeds the collider part ceiling of {cap}, {why}; re-measure the "
                f"runtime before raising COLLIDER_PART_CEILING")
        elif own > COLLIDER_PART_WARNING:
            print(f"warning: {sid}: collider part budget {own} is over "
                  f"{COLLIDER_PART_WARNING} (ceiling {cap}, {n} dwelling(s))", file=sys.stderr)
    return budget, errors


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


VEGETATION_CLEARANCE_SCHEMA = 2   # 16k walk 4: tiers (trees/plants `hardClear`, ground cover `groundClear`)
GROUND_PAINT_SCHEMA = 2
GROUND_PAINT_VOCAB = REPO_ROOT / "world" / "sources" / "vocab" / "ground-paint.json"


def _vegetation_clearance(place_id: str, clearance: dict, survey) -> dict:
    """The compiled record's clearance (map UV) as the bundle carries it: world
    metres, the patch id the thinning roll hashes (`apply_vegetation_patches`).

    The blueprint's authored `hardClear` is NOT carried (16k walk 4): on both
    places it is a hull round the whole place, and as a tier it cleared the
    trees and the ground cover off every open patch between the buildings.
    The tiers are derived from the geometry by `grow_clearance`; the
    authored `thinned` and `kept` carry through."""
    return {"schemaVersion": VEGETATION_CLEARANCE_SCHEMA, "id": f"patch.clearance.bundle.{place_id}",
            "hardClear": [], "groundClear": [],
            "thinned": [_metres(poly, survey) for poly in clearance.get("thinned") or []],
            "kept": [{**k, "positionM": _metres([k["positionM"]], survey)[0]}
                     if "positionM" in k else k for k in clearance.get("kept") or []]}


def ground_paint_vocab(path: Path | None = None) -> dict:
    """`world/sources/vocab/ground-paint.json`: `kinds`, way kind -> the
    terrain road paint material (the land cover's BC_ROAD / TRACK, by
    name), the soft edge, metres, and the alpha at the way's middle; `unpainted`, the built ways (stairs,
    ramps: placed pieces) that paint nothing."""
    doc = json.loads(Path(path or GROUND_PAINT_VOCAB).read_text())
    if doc.get("schemaVersion") != 2:
        raise ValueError(f"ground-paint vocab: schemaVersion {doc.get('schemaVersion')!r}, expected 2")
    return doc


RUN_OUT_M = 14.0          # a way leaving the place narrows to nothing over this length
RUN_OUT_EDGE_M = 2.0      # an end this near the place boundary leaves the place ...
RUN_OUT_ROAD_M = 1.0      # ... unless it lands this near the province road paint


def _tapered(line, half: float, ends: tuple[str, ...]):
    """``line`` (shapely) buffered by ``half``, narrowing linearly to 0.1 m
    over the last `RUN_OUT_M` at each named end ("start", "end"): a way that
    runs out into the wild fades along its length, never stops square."""
    from shapely.geometry import Point
    from shapely.ops import substring, unary_union
    length = line.length
    run = min(RUN_OUT_M, length * 0.6 / max(1, len(ends)))
    a = run if "start" in ends else 0.0
    b = length - run if "end" in ends else length
    parts = [substring(line, a, b).buffer(half, quad_segs=4)]
    for end in ends:
        s0, s1 = (0.0, a) if end == "start" else (b, length)
        n = max(2, int(run / 0.5) + 1)
        circles = []
        for k in range(n):
            s = s0 + (s1 - s0) * k / (n - 1)
            frac = (s - s0) / (s1 - s0) if end == "end" else (s1 - s) / (s1 - s0)   # 0 at the body, 1 at the tip
            circles.append(Point(line.interpolate(s)).buffer(max(0.1, half * (1.0 - frac)), quad_segs=4))
        parts += [unary_union(pair).convex_hull for pair in zip(circles, circles[1:])]
    return unary_union(parts)


ROAD_JOIN_M = 4.0         # a way end this near the province road paint is carried onto it


def _join_road(pts: list, road) -> list:
    """The way's painted centreline: an end within `ROAD_JOIN_M` of the
    province road paint (but not on it) gains a last leg to the nearest
    painted point, so the place's paint meets the road's (a network route's
    macro line and its painted texels differ by a few metres)."""
    from shapely.geometry import Point
    from shapely.ops import nearest_points
    if road is None or road.is_empty:
        return pts
    out = list(pts)
    for k in (0, -1):
        p = Point(out[k])
        d = road.distance(p)
        if RUN_OUT_ROAD_M < d <= ROAD_JOIN_M:
            q = nearest_points(road, p)[0]
            # a hair inside the road, so the join survives the road clip
            v = (q.x - p.x, q.y - p.y)
            tip = (q.x + v[0] / d * 0.3, q.y + v[1] / d * 0.3)
            out = [tip] + out if k == 0 else out + [tip]
    return out


def run_out_ends(pts: list, boundary: list, road) -> tuple[str, ...]:
    """The ends of a way (metres) that leave the place into the wild: outside
    the place boundary or within `RUN_OUT_EDGE_M` of it, and not on the
    province road paint."""
    from shapely.geometry import Point, Polygon
    if len(boundary) < 3:
        return ()
    area = Polygon(boundary).buffer(0)
    out = []
    for name, p in (("start", pts[0]), ("end", pts[-1])):
        leaves = not area.contains(Point(p)) or area.exterior.distance(Point(p)) <= RUN_OUT_EDGE_M
        if leaves and (
                road is None or road.is_empty or road.distance(Point(p)) > RUN_OUT_ROAD_M):
            out.append(name)
    return tuple(out)


def ground_paint(place_id: str, routes: list[dict], survey, vocab: dict | None = None,
                 boundary: list | None = None, road=None) -> dict:
    """Every blueprint way (the layout's path ops, `via` in map UV) as a
    `groundPaint` entry: the polyline buffered to its width plus half the
    soft edge, so the half-alpha line sits on the way's edge; the texture is
    the land cover's paint for that kind of way, `peakAlpha` its strength.
    An end that leaves the place (`run_out_ends`, against ``boundary`` in
    metres and the province ``road`` paint) narrows to nothing
    (`runOutEnds`). Deterministic: sorted by id, rounded to the millimetre.
    Refuses a way kind the vocabulary lacks."""
    from shapely.geometry import LineString
    vocab = vocab if vocab is not None else ground_paint_vocab()
    entries = []
    kinds, unpainted = vocab["kinds"], set(vocab.get("unpainted") or [])
    for route in sorted(routes, key=lambda r: r["id"]):
        kind = route.get("kind")
        pts = [survey.uv_to_m(float(u), float(v)) for u, v in route.get("via") or route.get("points") or []]
        if len(pts) < 2 or kind in unpainted:
            continue
        if kind not in kinds:
            raise ValueError(f"{place_id}: way {route['id']} kind {kind!r} has no ground paint "
                             f"(world/sources/vocab/ground-paint.json)")
        edge = float(kinds[kind]["edgeM"])
        pts = _join_road(pts, road)
        ends = run_out_ends(pts, boundary or [], road)
        half = float(route["widthM"]) / 2 + edge / 2
        poly = _tapered(LineString(pts), half, ends) if ends else LineString(pts).buffer(half, quad_segs=4)
        entries.append({"id": f"paint.{route['id']}", "routeId": route["id"], "kind": kind,
                        "texture": kinds[kind]["texture"], "edgeM": edge,
                        "peakAlpha": float(kinds[kind]["peakAlpha"]),
                        "widthM": float(route["widthM"]),
                        "centrelineM": [[round(float(x), 3), round(float(z), 3)] for x, z in pts],
                        **({"runOutEnds": list(ends)} if ends else {}),
                        "polygonM": [[round(float(x), 3), round(float(z), 3)]
                                     for x, z in list(poly.exterior.coords)[:-1]]})
    return {"schemaVersion": GROUND_PAINT_SCHEMA, "entries": entries}


def _place_ground_paint(place_id: str, bp: dict, survey) -> dict:
    """`ground_paint` for one compiled place, with its boundary in metres and
    the province road paint round its ways (the run-out ends)."""
    from shapely.geometry import MultiPoint
    routes = bp.get("routes") or []
    pts = [survey.uv_to_m(float(u), float(v)) for r in routes for u, v in r.get("via") or r.get("points") or []]
    road = province_road_paint(MultiPoint(pts).buffer(20.0).bounds) if pts else None
    return ground_paint(place_id, routes, survey, boundary=_metres(bp.get("boundary", []), survey), road=road)


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


def _flood_warnings(doc: dict) -> list:
    """The compile's flood warnings: the report's own list (16k fix 2 r3),
    else, on a compile that predates it, every warning."""
    report = doc.get("floodBandReport") or {}
    if isinstance(report.get("warnings"), list):
        return report["warnings"]
    return doc.get("warnings") if isinstance(doc.get("warnings"), list) else []


def flood_ledger_error(doc: dict) -> str | None:
    """The warning ledger compares FLOOD warnings only (16k fix 2 r3 ruling
    1): the report's count equals its own list, and every one of them is in
    the compile's warnings. A front or first-seen warning is not a flood row."""
    report = doc.get("floodBandReport") or {}
    warnings = doc.get("warnings")
    flood = _flood_warnings(doc)
    if (not isinstance(warnings, list) or report.get("warningCount") != len(flood)
            or any(w not in warnings for w in flood)):
        return f"{doc.get('id')} warning ledger disagrees with floodBandReport"
    return None


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


# Place gates by id and the date each was added (0100 decision 6). A gate added
# after a place's acceptance runs on that place in REPORT mode: its findings go
# to output/accepted-report.json and fail nothing. Every gate that existed
# when the register opened carries the register's opening date; a new
# per-place gate is added here with the date it lands.
PLACE_GATES = {
    "compile-errors": "2026-09-25",
    "unexplained-warning": "2026-09-25",
    "compiled-objects-complete": "2026-09-25",
    "obligations-delivered": "2026-09-25",
}


def _place_scope(places) -> set[str] | None:
    if places is None:
        return None
    scope = {p for p in places if p}
    if not scope:
        raise ValueError("--places names no place")
    return scope


def build_bundle(settlements_dir: Path = DEFAULT_SETTLEMENTS,
                 structures_dir: Path = DEFAULT_STRUCTURES,
                 blueprints_dir: Path = BLUEPRINTS,
                 kits_dir: Path = KITS,
                 route_structures_source: Path = ROUTE_STRUCTURES_SOURCE,
                 catalogue_records_by_id: dict[str, dict] | None = None,
                 terrain_evidence: tuple[dict, dict, dict] | None = None,
                 known_red_path: Path | None = None,
                 fixtures_ok: bool = False,
                 all_kit_assets: bool = False,
                 places=None,
                 accepted_path: Path | None = None,
                 patch_files=accepted_places.PATCH_FILES,
                 report: list | None = None) -> dict:
    """Build the bundle, or refuse. There is no waiver (16h item 6).

    Fail-closed is the rule: a stale or simply absent place must never quietly
    vanish from the world the player receives, and no reason makes a defective
    bundle a publishable one. The one thing the old `--ship-with-errors` waiver
    ever shipped over was an ungraded settlement pad; since 0102 a pad is the
    place's own `groundOverlays`, attached and gated by `export`.

    `fixtures_ok` publishes fixture records (`fixture: true`, e.g. the proving
    ground) to a studio-only target. The shipped build refuses them.

    `places` (a --places publish, 0100 decision 6) builds only the named
    places: no other place's compile is read, so no other place's errors can
    refuse, and route structures are left to the full export. The result is a
    PART bundle for `merge_bundle`, never a publication on its own.

    An accepted place (accepted-places.json) whose compiled record or own
    patches changed refuses (the freeze). A place gate added after the place's
    acceptance (`PLACE_GATES`) appends to `report` instead of refusing.
    """
    scope = _place_scope(places)
    accepted = accepted_places.load(accepted_path)
    report = [] if report is None else report

    def place_gate(gate_id: str, place_id: str, message: str) -> None:
        if accepted_places.report_only(place_id, PLACE_GATES[gate_id], accepted):
            report.append({"placeId": place_id, "gate": gate_id,
                           "gateAddedOn": PLACE_GATES[gate_id],
                           "acceptedOn": accepted[place_id]["acceptedOn"],
                           "mode": "report-only", "finding": message})
            return
        raise ValueError(message)

    survey = shared_survey()
    known_red = load_warning_known_red(known_red_path)
    if scope is not None:
        known_red = {key: row for key, row in known_red.items() if key[0] in scope}
    if catalogue_records_by_id is None:
        catalogue_records_by_id = {
            record["id"]: record
            for region_file in catalogue.load_region_files()
            for record in region_file.places
        }
    blueprint_by_id = {}
    for path in bp_mod.blueprint_paths(blueprints_dir):
        doc = _read(path)
        bp = doc.get("blueprint")
        if bp:
            blueprint_by_id[bp["id"]] = bp

    # pads are bundle overlays (0102): the export never reads a terrain pad receipt

    compiled = []
    # Route pieces are the climbs of route-structures-v1 (no water crossing is
    # built in the province data: crossings are built per place in 16k).
    kit_names: set[str] = ({"route-structures-v1"} if scope is None
                           else set())
    if scope is None:
        compiled_paths = sorted(settlements_dir.glob("place.*.settlement.json"))
    else:
        unknown = sorted(scope - set(blueprint_by_id))
        if unknown:
            raise ValueError(f"--places names places with no authored blueprint: {unknown}")
        compiled_paths = sorted(settlements_dir / f"{pid}.settlement.json" for pid in scope)
        absent = [p.name for p in compiled_paths if not p.exists()]
        if absent:
            raise ValueError(f"--places names places that are not compiled: {absent} "
                             f"(python3 -m worldgen.compile_settlement --all --places ...)")
    for path in compiled_paths:
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
            place_gate("compile-errors", doc["id"],
                       f"{doc['id']} has {len(doc['errors'])} compile errors; "
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
        elif flood_ledger_error(doc):
            raise ValueError(flood_ledger_error(doc))
        elif len(warning_keys(doc)) != len(_flood_warnings(doc)):
            raise ValueError(f"{doc['id']} raised {len(_flood_warnings(doc))} flood warnings but only "
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
    freeze = accepted_places.check_frozen(
        compiled_ids, entries=accepted, compiled_docs={doc["id"]: doc for doc, _bp in compiled},
        patch_files=patch_files)
    if freeze:
        raise ValueError("accepted places would change (0100 decision 6): " + "; ".join(freeze))
    authored_ids = set(blueprint_by_id) if scope is None else scope
    missing = sorted(authored_ids - compiled_ids)
    unexpected = sorted(compiled_ids - authored_ids)
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
        if accepted_places.report_only(key[0], PLACE_GATES["unexplained-warning"], accepted):
            place_gate("unexplained-warning", key[0],
                       f"UNEXPLAINED WARNING {key[0]} / {key[1]} / {key[2]}")
            continue
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

    route_docs = (_validated_route_docs(structures_dir, route_structures_source)
                  if scope is None else [])
    used: set[tuple[str, str]] | None = None
    if not all_kit_assets:
        used = {(p["kit"], p["assetId"]) for doc, _bp in compiled
                for p in doc.get("placements", []) if p.get("kit")}
        # A route placement names no kit: it resolves in the route kit.
        used |= {("route-structures-v1", raw["assetId"]) for doc in route_docs
                 for raw in doc.get("placements", [])}
    effect_rows: dict[str, dict] = {}
    kits, assets = _kit_assets(kit_names, kits_dir, used, effect_rows)

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
            place_gate("compiled-objects-complete", doc["id"],
                       f"{doc['id']} compiled object set is incomplete: "
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
                place_gate("obligations-delivered", doc["id"],
                           f"{doc['id']} phase-11-compiled obligations are not delivered: "
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
            if raw.get("objectKind") == "effect":
                placement = effect_contract(doc["id"], raw, effect_rows=effect_rows)
                ids.append(placement["id"])
                all_placements.append(placement)
                continue
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
                "collision": _collision_contract(asset, disabled=is_dressing,
                                                 scale=raw.get("scale", 1)),
                **_layer_contract(raw),
                **({"yFinal": True} if raw.get("yFinal") is True else {}),
                "provenance": raw["provenance"],
                **_mount_contract(raw),
                **_run_contract(raw, parcel, laid_runs),
                # a building's declared pad (0101): the compile's resolved
                # datum and polygon, carried as its ground overlay by `attach_ground_overlays` (0102)
                **({"pad": raw["pad"]} if isinstance(raw.get("pad"), dict) else {}),
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
            # the compile's vegetation clearance in world metres, applied by
            # the runtime cell build (0102 decision 1; `clearanceFilter.ts`)
            **({"vegetationClearance": _vegetation_clearance(doc["id"], doc["clearance"], survey)}
               if isinstance(doc.get("clearance"), dict) else {}),
            # the ways painted on the ground at load (16k walk 4, 0102 decision 1);
            # clipped under pads and floors by `attach_ground_overlays`
            "groundPaint": _place_ground_paint(doc["id"], bp, survey),
            **walk_routes_field(bp),
            # the place's sockets (0103 decision 5), copied as compiled
            "socketsSchemaVersion": doc.get("socketsSchemaVersion", SOCKETS_SCHEMA),
            "sockets": list(doc.get("sockets") or []),
            # 0104: promise id -> its fillers (sockets, doors, parcels), as compiled
            "promiseFills": dict(doc.get("promiseFills") or {}),
            # the layout's `pool` ops, turned into overlays and `pools[]` on
            # the frozen ground by `attach_ground_overlays` (popped there)
            **layout_pool_ops(bp),
            **({"fixtureReplay": True} if doc.get("fixtureReplay") is True else {}),
            **({"fixtureWaived": doc["fixtureWaived"]}
               if isinstance(doc.get("fixtureWaived"), list) else {}),
        })

    route_count = 0
    for doc in route_docs:
        for raw in doc.get("placements", []):
            route_kit = "route-structures-v1"
            asset = assets.get((route_kit, raw["assetId"]))
            if asset is None:
                raise ValueError(
                    f"{raw['id']}: route asset {raw['assetId']} is not in route-structures-v1")
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

    collider_budget, ceiling_errors = collider_part_budget(
        settlements, all_placements, kits_dir, COLLIDER_PART_CEILING)
    _refuse(
        "collider ceiling", ceiling_errors,
        "settlement collider part ceiling exceeded: " + "; ".join(ceiling_errors))

    lod_contract = {"tiers": 3, "absoluteTriangleFloor": [120, 80],
                    "distancePerFootprintDiagonal": [4.0, 12.0],
                    "farMergeDistanceM": 900, "atlasMaxSize": 4096,
                    "colliderRadiusM": 180,
                    "colliderPartBudget": collider_budget}

    lod_errors = lod_contract_errors(all_placements, lod_contract, kits_dir)
    _refuse(
        "lod contract", lod_errors,
        "placed asset cannot satisfy the runtime LOD contract: " + "; ".join(lod_errors))

    cap_errors = texture_cap_errors(kits, lod_contract, kits_dir)
    _refuse(
        "texture cap", cap_errors,
        "published kit texture is over the runtime cap: " + "; ".join(cap_errors))

    budget_errors = collider_budget_errors(
        settlements, all_placements, collider_budget, kits_dir)
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
        # Placed assets standing on a policy-fallback designed sink (16h item 1).
        "designedSinkGaps": designed_sink_gaps,
        "placements": all_placements, "groundTreatments": treatments,
        "navmeshCuts": navmesh, "navmeshLinks": navmesh_links, "doors": doors,
        "stats": {"settlements": len(settlements),
                  "settlementPlacements": sum(len(s["placementIds"]) for s in settlements),
                  "routeStructurePlacements": route_count},
    }


WALK_ROUTES_SCHEMA = 1
SOCKETS_SCHEMA = 1
EFFECT_ANCHOR = {"mode": "streamed-origin", "groundFit": "direct", "originOffsetM": [0, 0, 0],
                 "buryM": 0, "buryCapM": 0, "slopeBuryPerM": 0}


def effect_contract(source_id: str, raw: dict, kits_dir: Path = KITS,
                    effect_rows: dict[str, dict] | None = None) -> dict:
    """A compiled `effect` placement (an `fx:*` asset mounted on its shell,
    fix2-effects-r3 rec 2) as the runtime reads it: no kit mesh, so it is
    exempt from the kit-asset check but its kit must publish its texture
    (`effectTextures`); no footprint, no collision, mounted only.
    ``effect_rows`` (kit -> its `effectTextures`, `_kit_assets`) is what the
    export passes; without it the kit manifest is read (a lone call)."""
    if effect_rows is None:
        manifest = kits_dir / f"{raw['kit']}.kit.json"
        rows = (_read(manifest).get("effectTextures") or {}) if manifest.exists() else {}
    else:
        rows = effect_rows.get(raw["kit"]) or {}
    if raw["assetId"] not in rows:
        raise ValueError(f"{raw['id']}: effect {raw['assetId']} has no effectTextures row in "
                         f"{raw['kit']}.kit.json")
    if not raw.get("parentPlacementId"):
        raise ValueError(f"{raw['id']}: effect {raw['assetId']} is mounted only and names no parent")
    return {"id": raw["id"], "sourceId": source_id, "kind": "effect",
            "assetId": raw["assetId"], "kit": raw["kit"],
            "positionM": raw["positionM"], "yawDeg": raw.get("yawDeg", 0),
            "scale": raw.get("scale", 1), "footprintM": [],
            "anchor": dict(EFFECT_ANCHOR),
            "collision": {"frame": COLLISION_FRAME, "kind": "none"},
            "provenance": raw["provenance"],
            **_mount_contract({**raw, "anchorClass": "fx"})}


def walk_routes_field(bp: dict) -> dict:
    """The place's navmesh socket data (0102 decision 2, planner ruling 1 of
    16k fix 2 workbench round 3): the blueprint's `walkRoutes` (per walkRule
    target the route's polyline in metres, length, steepest grade, largest
    step and deepest water, written by `wb.py export --write`) copied
    unchanged onto the settlement row; {} when the blueprint carries none.
    The walk grid is never shipped. A schema this reader does not know
    refuses."""
    routes = bp.get("walkRoutes")
    if routes is None:
        return {}
    if not isinstance(routes, dict) or routes.get("schemaVersion") != WALK_ROUTES_SCHEMA:
        raise ValueError(f"{bp.get('id')}: walkRoutes schemaVersion "
                         f"{(routes or {}).get('schemaVersion')!r} is not {WALK_ROUTES_SCHEMA}")
    return {"walkRoutes": routes}


# SHARED CONTRACT (16h): the compile decides how a piece is anchored and what
# it hangs off; the export carries those fields through unchanged. A field the
# compile did not emit is absent, never defaulted here — a wrong default would
# hang a lantern in the air or float a hull.
MOUNT_FIELDS = ("anchorClass", "parentPlacementId", "mountOffsetM",
                "waterLevelM", "waterEntityId", "pitchDeg")


def _layer_contract(raw: dict) -> dict:
    """The assembly layer the compile read (compile_settlement
    ENTRANCE_LIGHT_LAYERS), passed through when present: the runtime lights a
    "light" piece (game-core settlement/lighting.ts, walk 2 D7). Optional, so
    an older bundle without it reads as "no layer"."""
    return {"layer": raw["layer"]} if raw.get("layer") else {}


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


def is_small_piece(asset: dict, scale: float = 1.0) -> bool:
    """True when the piece at ``scale`` is under SMALL_PIECE_MAX_PLAN_M in both
    plan axes and under SMALL_PIECE_MAX_HEIGHT_M tall (manifest ``sizeM``:
    [x, y] plan, [2] height); such a placement carries no collider."""
    size = asset.get("sizeM")
    if not isinstance(size, list) or len(size) != 3 or not all(_is_number(v) for v in size):
        return False
    sx, sy, sz = (float(v) * float(scale) for v in size)
    return max(sx, sy) < SMALL_PIECE_MAX_PLAN_M and sz < SMALL_PIECE_MAX_HEIGHT_M


def _collision_contract(asset: dict, *, disabled: bool = False, scale: float = 1.0) -> dict:
    disabled = disabled or is_small_piece(asset, scale)
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


def _scoped_kits(bundle: dict, places=None) -> list[str]:
    """The kits `_stage_assets` checks and stages: every kit in the bundle, or
    with `places` only those the named places' own placements use (a
    composite's parts are placements of their own, so they count). One
    lane's in-flight kit never blocks another place's publish; a place that
    uses a stale kit is still refused."""
    scope = _place_scope(places)
    if scope is None:
        return sorted(bundle["kits"])
    used = {p["kit"] for p in bundle["placements"]
            if p.get("kind") != "route-structure" and p.get("sourceId") in scope and p.get("kit")}
    return sorted(used & set(bundle["kits"]))


def _stage_assets(bundle: dict, kits_dir: Path, public_dir: Path,
                  publish_kit=None, places=None) -> tuple[Path, list[str]]:
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
    kits = _scoped_kits(bundle, places)

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
                publish_copy(source, stage / source.name)
                names.append(source.name)
        return stage, names
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def copy_assets(bundle: dict, kits_dir: Path = KITS,
                public_dir: Path = PUBLIC_KITS, publish_kit=None, places=None) -> None:
    stage, names = _stage_assets(bundle, kits_dir, public_dir, publish_kit, places)
    try:
        public_dir.mkdir(parents=True, exist_ok=True)
        for name in names:
            os.replace(stage / name, public_dir / name)
    finally:
        shutil.rmtree(stage, ignore_errors=True)


def merge_bundle(base: dict, part: dict, places) -> dict:
    """The published bundle `base` with the named places replaced by `part`.

    Every other place's rows, and the route structures, are carried from
    `base` unchanged and in the order a full export writes them (places in
    compiled-file order, each place's rows in its own order), so a --places
    publish of an unchanged place writes the bytes a full export would."""
    places = set(places)
    if (base.get("schemaVersion") not in READABLE_SCHEMA_VERSIONS
            or base.get("collisionFrame") != COLLISION_FRAME):
        raise ValueError(
            f"the published bundle is schemaVersion {base.get('schemaVersion')} / "
            f"{base.get('collisionFrame')}, this exporter reads {READABLE_SCHEMA_VERSIONS} / "
            f"{COLLISION_FRAME}: run one full export before publishing per place")

    def is_place_row(p: dict) -> bool:
        return p.get("kind") != "route-structure" and p.get("sourceId") in places

    placements = sorted([p for p in base["placements"] if not is_place_row(p)]
                        + part["placements"], key=lambda p: p["id"])
    place_of = {p["id"]: p["sourceId"] for p in placements if p.get("kind") != "route-structure"}
    for p in base["placements"]:
        place_of.setdefault(p["id"], p.get("sourceId"))
    order = sorted({s["id"] for s in base["settlements"]} | places,
                   key=lambda pid: f"{pid}.settlement.json")

    def by_place(field: str, place_key) -> list:
        groups: dict[str, list] = {}
        for row in base.get(field) or []:
            if place_key(row) not in places:
                groups.setdefault(place_key(row), []).append(row)
        for row in part.get(field) or []:
            groups.setdefault(place_key(row), []).append(row)
        ordered = order + sorted(set(groups) - set(order), key=str)
        return [row for pid in ordered for row in groups.get(pid, [])]

    of_placement = lambda row: place_of.get(row["placementId"])  # noqa: E731
    merged_kits = {**base["kits"], **part["kits"]}
    used_kits = {p["kit"] for p in placements}
    kits = {name: kit for name, kit in merged_kits.items()
            if name in used_kits or name == "route-structures-v1"}

    # A gap is judged fresh for every asset the part places; the base's
    # judgement stands for the rest. Counts are over the merged placements.
    judged = {f"{p['kit']}/{p['assetId']}" for p in part["placements"]}
    gap_keys = ({row["asset"] for row in base.get("designedSinkGaps") or []} - judged) | {
        row["asset"] for row in part.get("designedSinkGaps") or []}
    counts: dict[str, int] = {}
    for p in placements:
        key = f"{p['kit']}/{p['assetId']}"
        if key in gap_keys:
            counts[key] = counts.get(key, 0) + 1

    settlements = by_place("settlements", lambda row: row["id"])
    rank = {pid: i for i, pid in enumerate(order)}   # a full export's tie order
    return {
        **base,
        # a v3 base is upgraded: v4 only adds the optional `yFinal`
        "schemaVersion": part["schemaVersion"],
        "lod": part["lod"],
        "kits": kits,
        "settlements": settlements,
        "knownRedWarnings": sorted(
            [row for row in base.get("knownRedWarnings") or [] if row["placeId"] not in places]
            + part["knownRedWarnings"],
            key=lambda row: (row["placeId"], row["subjectId"], row["rule"])),
        "phase11ObligationReceipts": sorted(
            [r for r in base.get("phase11ObligationReceipts") or [] if r["placeId"] not in places]
            + part["phase11ObligationReceipts"], key=lambda r: r["placeId"]),
        "compiledObjects": sorted(
            [o for o in base.get("compiledObjects") or [] if o.get("placeId") not in places]
            + part["compiledObjects"],
            key=lambda o: (o["id"], rank.get(o.get("placeId"), len(rank)))),
        "designedSinkGaps": [{"asset": key, "placements": n} for key, n in sorted(counts.items())],
        "placements": placements,
        "groundTreatments": by_place(
            "groundTreatments", lambda row: place_of.get(row["id"].removeprefix("treatment."))),
        "navmeshCuts": by_place("navmeshCuts", of_placement),
        "navmeshLinks": by_place("navmeshLinks", of_placement),
        "doors": by_place("doors", lambda row: row["settlementId"]),
        "stats": {"settlements": len(settlements),
                  "settlementPlacements": sum(len(s["placementIds"]) for s in settlements),
                  "routeStructurePlacements": sum(
                      1 for p in placements if p.get("kind") == "route-structure")},
    }


BUILDING_CLEAR_M = 1.5      # a building footprint's hard clearance reaches this far past it (0102)
OTHER_CLEAR_M = 0.5         # every other placement's footprint (runs, walls, dressing, yard items)
GROUND_SIDECAR = Path("settlements") / "ground-overlays.json"   # beside the bundle, under province/


def _hole_free(poly) -> list:
    """`poly` cut into pieces with no holes (a clearance ring has none): split
    on the vertical line through the first hole's centroid until none is left,
    so a walled yard stays a few rings, not one per wall piece."""
    from shapely.geometry import LineString, Polygon
    from shapely.ops import split
    if not poly.interiors:
        return [poly]
    x = Polygon(poly.interiors[0]).centroid.x
    _, z0, _, z1 = poly.bounds
    pieces = split(poly, LineString([(x, z0 - 1.0), (x, z1 + 1.0)])).geoms
    return [q for piece in pieces if piece.geom_type == "Polygon" for q in _hole_free(piece)]


GROUND_HARD_MARGIN_M = 0.25  # ground cover dies this far past a hard surface, plus the
GROUND_EDGE_JITTER_M = 0.5   # wobble (0-0.5 m): 0.25-0.75 m, the brief's 0.5 m on average
WAY_CLEAR_M = 0.5            # trees and large plants stand back this far from a way
FRINGE_RING_M = 10.0         # the thinned ring past the tree clearance (C13: 5-15 m)


def _rings(geom) -> list[list[list[float]]]:
    """A shapely area as hole-free rings, rounded to the millimetre."""
    return [[[round(float(x), 3), round(float(z), 3)] for x, z in list(q.exterior.coords)[:-1]]
            for poly in getattr(geom, "geoms", [geom]) if not poly.is_empty
            for q in _hole_free(poly)]


def grow_clearance(site: dict, rows: list[dict], treatments: list[dict] = ()) -> None:
    """A place's vegetation clearance by tier (16k brief item 14, 16k walk 4):

    * `groundClear`, where the ground cover dies: the hard surfaces only, the
      ways (`groundPaint` polygons), every pad polygon (`groundOverlays`
      pieces) and every treatment's clearance polygons (a floor's footprint,
      a deck's contacts, every door apron), grown GROUND_HARD_MARGIN_M and
      wobbled GROUND_EDGE_JITTER_M. Ground cover survives everywhere else.
    * `hardClear`, where trees and large plants go: the same surfaces (ways
      grown WAY_CLEAR_M) plus every placement footprint, a building's grown
      BUILDING_CLEAR_M and every other one (runs, walls, dressing, yard
      items) OTHER_CLEAR_M (0102 round 2). A placement with a deck treatment
      is raised on legs and adds only its treatment's polygons.
    * `thinned`, the fringe: `hardClear` grown FRINGE_RING_M, graded over
      the same distance (`fringeFalloffM`), plus any authored thinned band.

    Every tier is written as hole-free rings (`_hole_free`)."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    from .vegetation_patches import treatment_clearance_polygons

    def valid(parts):
        return [p if p.is_valid else p.buffer(0) for p in parts if not p.is_empty]

    decks = {t["id"].removeprefix("treatment.") for t in treatments if t.get("kind") == "deck"}
    ways = valid([Polygon(e["polygonM"]) for e in (site.get("groundPaint") or {}).get("entries") or []])
    hard = valid([Polygon(piece["polygonM"]) for o in (site.get("groundOverlays") or {}).get("pads") or []
                  for piece in o["pieces"]]
                 + [Polygon(p) for t in treatments for p in treatment_clearance_polygons(t)])
    feet = valid([Polygon(r["footprintM"]).buffer(
        BUILDING_CLEAR_M if r["id"].endswith(".building") else OTHER_CLEAR_M, join_style=2)
        for r in rows if r.get("footprintM") and r["id"] not in decks])
    if not (ways or hard or feet):
        return
    clearance = site.setdefault("vegetationClearance", {
        "schemaVersion": VEGETATION_CLEARANCE_SCHEMA, "id": f"patch.clearance.bundle.{site['id']}",
        "hardClear": [], "groundClear": [], "thinned": [], "kept": []})
    clearance["schemaVersion"] = VEGETATION_CLEARANCE_SCHEMA
    ground = unary_union(ways + hard).buffer(GROUND_HARD_MARGIN_M, join_style=2)
    # the tree tier holds the ground-cover tier whole: no bush on bare ground
    trees = unary_union([ground] + [w.buffer(WAY_CLEAR_M, join_style=2) for w in ways] + hard + feet)
    clearance["groundClear"] = _rings(ground)
    clearance["groundEdgeJitterM"] = GROUND_EDGE_JITTER_M
    clearance["hardClear"] = _rings(trees)
    clearance["thinned"] = list(clearance.get("thinned") or []) + _rings(
        trees.buffer(FRINGE_RING_M, join_style=1, quad_segs=4))
    clearance["fringeFalloffM"] = FRINGE_RING_M


# The province's own painted roads (16e land cover: BC_ROAD, TRACK, PATH
# texels) are never painted again by a place (16k walk 6, owner): a place's
# paint stops at the road texels' edge and its feather meets the road's own
# blurred edge.
PROVINCE_ROAD_CODES = (30, 29, 27)          # landcover BC_ROAD, TRACK, PATH
SLIVER_CENTRE_M = 1.0      # a clipped remnant keeps only if the centreline runs this far inside it


def province_road_paint(bounds: tuple[float, float, float, float], mat=None, texel_m: float | None = None):
    """The painted province road inside ``bounds`` (minx, minz, maxx, maxz,
    metres) as one shapely geometry: the union of the land-cover road texels (the bake's own per-texel material, the
    raster `road_paint_census` reads). ``mat`` (rows = south, cols = east)
    and ``texel_m`` are injectable for tests."""
    import numpy as np
    from shapely.geometry import box
    from shapely.ops import unary_union
    if mat is None:
        from .road_paint_census import material_path
        from .scale import RAW_M
        mat, texel_m = np.load(material_path(), mmap_mode="r"), RAW_M
    t = float(texel_m)
    x0, z0, x1, z1 = bounds
    i0, j0 = max(0, int(x0 // t) - 1), max(0, int(z0 // t) - 1)
    i1, j1 = min(mat.shape[1], int(x1 // t) + 2), min(mat.shape[0], int(z1 // t) + 2)
    window = np.asarray(mat[j0:j1, i0:i1])
    jj, ii = np.nonzero(np.isin(window, PROVINCE_ROAD_CODES))
    # texel k covers [k*t - t/2, k*t + t/2] (sample centres at k*t, `metres_to_sample`)
    cells = [box((i0 + i) * t - t / 2, (j0 + j) * t - t / 2, (i0 + i) * t + t / 2, (j0 + j) * t + t / 2)
             for j, i in zip(jj.tolist(), ii.tolist())]
    # never shrunk: a province footpath is one texel wide and an inward buffer erases it
    return unary_union(cells) if cells else None


_LOAD_ROAD = object()


def clip_ground_paint(site: dict, treatments: list[dict] = (), road=_LOAD_ROAD) -> None:
    """The paint dies under pads and floors, except inside a door's apron, so
    worn ground reaches every threshold, and on the province road paint
    (`province_road_paint`; ``road`` injectable, None for none): the road is
    never painted twice. A way cut in two becomes two entries
    (`<id>.part-N`); a way wholly cut is dropped."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    from .vegetation_patches import apron_polygon
    paint = site.get("groundPaint")
    if not paint:
        return
    under = [Polygon(piece["polygonM"]) for o in (site.get("groundOverlays") or {}).get("pads") or []
             for piece in o["pieces"]]
    under += [Polygon(t["footprintM"]) for t in treatments
              if t.get("kind", "floor") == "floor" and len(t.get("footprintM") or []) >= 3]
    aprons = [Polygon(apron_polygon(*a)) for t in treatments for a in t.get("apronsM") or []]
    under = [p if p.is_valid else p.buffer(0) for p in under]
    cut = unary_union(under).difference(unary_union(aprons)) if aprons and under else unary_union(under)
    if road is _LOAD_ROAD:
        ways = unary_union([Polygon(e["polygonM"]) for e in paint["entries"]])
        road = province_road_paint(ways.buffer(5.0).bounds) if not ways.is_empty else None
    if road is not None and not road.is_empty:
        cut = cut.union(road) if not cut.is_empty else road
    if cut.is_empty:
        return
    from shapely.geometry import LineString, Point
    out = []
    for e in paint["entries"]:
        rings = _rings(Polygon(e["polygonM"]).difference(cut))
        rings = [r for r in rings if Polygon(r).area > 0.05]
        if e.get("centrelineM"):
            # a remnant the way's centre does not run through is a sliver along the road's or the
            # floor's edge (walk 6: strips beside the main road), never a piece of the way
            # (a way's END piece is kept however short: the stub inside a door's apron)
            centre = LineString(e["centrelineM"])
            ends = [Point(e["centrelineM"][0]), Point(e["centrelineM"][-1])]
            rings = [r for r in rings
                     if Polygon(r).buffer(0).intersection(centre).length >= SLIVER_CENTRE_M
                     or any(Polygon(r).buffer(0.05).contains(p) for p in ends)]
        for i, ring in enumerate(rings):
            out.append({**e, "id": e["id"] if len(rings) == 1 else f"{e['id']}.part-{i + 1}",
                        "polygonM": ring})
    paint["entries"] = out


def ground_sidecar(bundle: dict) -> dict:
    """The small file the studio reads a place's ground from
    (`province/settlements/ground-overlays.json`, schemaVersion 1): every
    place's `groundOverlays` and `vegetationClearance`, the same rows the
    bundle carries, under the bundle's own `settlements` key so one reader
    serves both."""
    return {"schemaVersion": 1,
            "settlements": [{"id": s["id"], **{k: s[k] for k in ("groundOverlays", "vegetationClearance")
                                                 if k in s}}
                            for s in bundle["settlements"]
                            if "groundOverlays" in s or "vegetationClearance" in s]}


def layout_pool_ops(bp: dict) -> dict:
    """``{"poolOps": [...]}``: the `pool` ops of the layout the blueprint was
    exported from (``authoredOn.layout``, `sockets.layout_of`), validated;
    ``{}`` when it names no layout or has none. A layout changed since the
    export refuses (the compile refuses it too), except on a fixture."""
    from . import pad_overlay
    from . import sockets as sk_mod
    layout, error = sk_mod.layout_of(bp)
    if error:
        if _is_fixture(bp):
            return {}
        raise ValueError(f"{bp['id']}: {error}")
    ops = [op for op in (layout or {}).get("ops") or [] if op.get("op") == pad_overlay.POOL_OP]
    ops += list((layout or {}).get("pools") or [])
    errors = [e for op in ops for e in pad_overlay.pool_op_errors(op)]
    uids = [op.get("uid") for op in ops]
    errors += [f"pool {u}: uid used twice" for u in sorted({u for u in uids if uids.count(u) > 1})]
    _refuse("pool ops", errors, f"{bp['id']}: malformed layout pool op: " + "; ".join(errors))
    return {"poolOps": ops} if ops else {}


def attach_ground_overlays(bundle: dict, places, survey=None) -> int:
    """Decision 0102 decision 1: every exported place carries its levelled
    ground as `groundOverlays` (schemaVersion 1, `pad_overlay`): one overlay
    per run whose rigid seat floats a member over the seat bar, measured on
    the frozen ground, and one per building that declares a pad (the
    compile's resolved datum and apron polygon). Nothing is written to the
    terrain patch set. Refuses when a declared pad of an exported place has no
    overlay. Returns the overlay count over the whole bundle."""
    from . import pad_overlay
    from .settlement_run_pads import depth_is_wet
    if survey is None:
        from .street_router import default_survey
        survey = default_survey()
        if survey is None:
            raise ValueError("ground overlays: the province survey rasters are unavailable")
    is_wet = depth_is_wet(survey.water_signed_depth_m, survey.extent_m)
    scope = _place_scope(places) if places is not None else None
    by_id = {p["id"]: p for p in bundle["placements"]}
    missing: list[str] = []
    for site in bundle["settlements"]:
        if scope is not None and site["id"] not in scope:
            continue
        rows = [by_id[i] for i in site["placementIds"] if i in by_id]
        pool_ops = site.pop("poolOps", [])
        site["groundOverlays"] = {"schemaVersion": pad_overlay.SCHEMA_VERSION,
                                  "pads": pad_overlay.apply_order(pad_overlay.place_overlays(
                                      rows, site["id"], survey.height_at, is_wet) + [
                                      pad_overlay.pool_overlay(op, site["id"], survey.height_at)
                                      for op in pool_ops])}
        site.pop("pools", None)
        if pool_ops:
            site["pools"] = [pad_overlay.pool_record(op, site["id"], survey.height_at)
                             for op in pool_ops]
        missing += [f"{site['id']}: {pid}" for pid in pad_overlay.missing_overlays(site, by_id)]
        ids = set(site["placementIds"])
        own = [t for t in bundle.get("groundTreatments") or []
               if t["id"].removeprefix("treatment.") in ids]
        grow_clearance(site, rows, own)       # from the whole ways, before the paint is cut
        clip_ground_paint(site, own)
    _refuse("ground overlays", missing,
            "declared pad with no ground overlay in the bundle (0102): " + "; ".join(missing))
    return sum(len((s.get("groundOverlays") or {}).get("pads") or []) for s in bundle["settlements"])


def place_budgets(bundle: dict, kits_dir: Path | None = None) -> dict[str, int]:
    """Each place's own collider part budget (decision 0052's formula on its
    own residents); the published budget is their max."""
    parts = resident_collision_parts(bundle["settlements"], bundle["placements"], kits_dir or KITS)
    return {pid: round(n * COLLIDER_PART_HEADROOM) for pid, n in parts.items()}


def published_base(base: Path | None, out: Path) -> dict:
    """The published record a --places publish merges into, whole-file shape:
    `base` when given (a province folder or index.json holding the bundles;
    `settlement_bundles.read_published`), else the bundles beside `out`."""
    if base is not None:
        if Path(base).exists():
            return settlement_bundles.read_published(base)
        raise ValueError(f"--places needs a published bundle to publish into; {base} does not exist")
    if (out.parent / settlement_bundles.BUNDLE_DIR / settlement_bundles.INDEX_NAME).exists():
        return settlement_bundles.load_published(out.parent)
    raise ValueError(f"--places needs a published bundle to publish into; "
                     f"{out.parent / settlement_bundles.BUNDLE_DIR / settlement_bundles.INDEX_NAME} "
                     f"does not exist (run one full export)")


def export(out: Path = OUT, copy: bool = False, places=None, base: Path | None = None,
           report_path: Path = accepted_places.REPORT_PATH, fixtures_ok: bool = False,
           all_kit_assets: bool = False, overlays: bool = False,
           manifest_root: Path | None = PLACE_MANIFESTS) -> dict:
    """Build, optionally copy the kits, and publish atomically.

    With `overlays` (the CLI sets it), every exported place carries its pads
    as `groundOverlays` and the bundle their count (`attach_ground_overlays`,
    0102); the terrain patch set is never written.

    With `places`, only those places are built and they replace their rows in
    `base` (default: the bundle at `out`); nothing else is read or judged.
    The report-mode rows of accepted places are written to `report_path`."""
    report: list[dict] = []
    bundle = build_bundle(fixtures_ok=fixtures_ok, all_kit_assets=all_kit_assets,
                          places=places, report=report)
    if places is not None:
        bundle = merge_bundle(published_base(base, out), bundle, _place_scope(places))
        # the budget is the MERGED set's (decision 0052): the part's own worst
        # case says nothing about the places carried from the base
        budget, ceiling_errors = collider_part_budget(
            bundle["settlements"], bundle["placements"], KITS, COLLIDER_PART_CEILING)
        _refuse("collider ceiling", ceiling_errors,
                "settlement collider part ceiling exceeded: " + "; ".join(ceiling_errors))
        bundle["lod"] = {**bundle["lod"], "colliderPartBudget": budget}
    bundle.pop("pendingPadGrades", None)       # retired by 0102: a pad is an overlay
    bundle.pop("settlementPadGrades", None)    # nothing reads the terrain pad receipt (r4 review)
    if overlays:
        bundle["groundOverlayCount"] = attach_ground_overlays(bundle, places)
    for site in bundle["settlements"]:
        site.pop("poolOps", None)       # no overlays measured: no pools either
    if places is not None and report_path.exists():
        # A --places publish re-judges only its own places: every other
        # accepted place's report-mode rows stand as the last export left them.
        scope = _place_scope(places)
        report = [row for row in _read(report_path).get("rows", [])
                  if row.get("placeId") not in scope] + report
    if copy:
        copy_assets(bundle, places=places)
    # settlements/index.json is the publication marker. It can never name
    # assets that have not all been validated, staged and moved into place.
    # the studio's ground reader (0102 round 2): written before the bundle,
    # the publication marker, so a published bundle never outruns its sidecar
    # compact: runtime data every studio load fetches before its first terrain decode
    atomic_write_bytes(out.parent / GROUND_SIDECAR, json.dumps(
        ground_sidecar(bundle), separators=(",", ":"), sort_keys=True).encode("utf-8") + b"\n")
    # S8: the place bundles, then the index (the runtime's marker); a --places
    # publish writes only its places' bundles and the index.
    wrote = settlement_bundles.write_published(bundle, place_budgets(bundle), out.parent,
                                               None if places is None else _place_scope(places))
    print(f"settlement bundles: {len(wrote['index']['places'])} place(s), "
          f"{len(wrote['index']['routes'])} route(s) in the index; wrote "
          f"{', '.join(wrote['written']) or 'no bundle'}"
          + (f"; removed {', '.join(wrote['removed'])}" if wrote["removed"] else ""))
    if places is not None and manifest_root is not None:
        settlement_bundles.write_manifests(_place_scope(places), bundle, manifest_root)
    _atomic_json(report_path, {"schemaVersion": 1, "kind": "accepted-place-report",
                               "about": "report-mode gate findings on accepted places "
                                        "(0100 decision 6); queue each to the polish backlog",
                               "rows": report})
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
    ap.add_argument("--places", default=None,
                    help="comma-separated place ids: build and publish only these, "
                         "carrying every other place and the routes from --base "
                         "unchanged (0100 decision 6)")
    ap.add_argument("--base", type=Path, default=None,
                    help="what a --places publish merges into: a province folder or "
                         "settlements/index.json holding the bundles (default: the "
                         "bundles beside --out)")
    ap.add_argument("--manifest-dir", type=Path, default=PLACE_MANIFESTS,
                    help="where a --places publish writes <place-id>/manifest.json "
                         "(contract 1; default tooling/.reports/16k)")
    args = ap.parse_args()
    places = None if args.places is None else [p.strip() for p in args.places.split(",")]
    try:
        bundle = export(args.out, args.copy_assets, places=places, base=args.base,
                        fixtures_ok=args.fixtures_ok, all_kit_assets=args.all_kit_assets,
                        overlays=True, manifest_root=args.manifest_dir)
    except ValueError as exc:
        print(f"export_settlement_bundle: {exc}")
        return 1
    print(f"export_settlement_bundle: {bundle.get('groundOverlayCount', 0)} ground overlay(s) "
          f"in the bundle (0102)")
    reported = json.loads(accepted_places.REPORT_PATH.read_text())["rows"]
    for row in reported:
        print(f"    REPORT-ONLY ({row['placeId']} accepted {row['acceptedOn']}, gate "
              f"{row['gate']} added {row['gateAddedOn']}): {row['finding']}")
    print(f"export_settlement_bundle: {args.out} — "
          f"{bundle['stats']['settlementPlacements']} settlement + "
          f"{bundle['stats']['routeStructurePlacements']} route pieces"
          + (f" (--places {','.join(places)})" if places else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
