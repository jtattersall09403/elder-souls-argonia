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
import os
import shutil
import tempfile
from pathlib import Path

from .site_fields import ProvinceSurvey
from .compile_settlement import (
    blueprint_sha256, _canonical_sha256, compiled_blueprint_objects,
    compiled_terrain_objects,
)
from . import catalogue, place_obligations

SCHEMA_VERSION = 1
COLLISION_FRAME = "settlement-pivot-yup-v1"
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SETTLEMENTS = Path(__file__).resolve().parents[1] / "output" / "settlements"
DEFAULT_STRUCTURES = Path(__file__).resolve().parents[1] / "output" / "route-structures"
ROUTE_STRUCTURES_SOURCE = REPO_ROOT / "world" / "sources" / "routes" / "route-structures.json"
BLUEPRINTS = REPO_ROOT / "world" / "sources" / "blueprints"
KITS = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
OUT = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "settlements.json"
PUBLIC_KITS = REPO_ROOT / "apps" / "world-studio" / "public" / "kits"

# Ground-fit-specific measured bury. A stilt/root piece is pinned at the
# terrain line; masonry gets the deeper seat that hides a planar base. The
# slope term is applied by the runtime from streamed perimeter samples.
BURY_BY_FIT = {"direct": 0.08, "plinth": 0.25, "pad": 0.18,
               "stilt": 0.12, "dug-in": 0.35}
BURY_CAP_BY_FIT = {"direct": 0.25, "plinth": 0.90, "pad": 0.50,
                   "stilt": 0.25, "dug-in": 0.75}


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
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def _kit_assets(names: set[str], kits_dir: Path) -> tuple[dict, dict[str, dict]]:
    kits: dict[str, dict] = {}
    assets: dict[str, dict] = {}
    for name in sorted(names):
        path = kits_dir / f"{name}.kit.json"
        if not path.exists():
            raise ValueError(f"referenced kit has no measured manifest: {name}")
        manifest = _read(path)
        kits[name] = {
            "id": name,
            "glb": f"kits/{name}.glb",
            "manifest": f"kits/{name}.kit.json",
        }
        for asset in manifest.get("assets", []):
            assets.setdefault(asset["id"], {"kit": name, **asset})
    return kits, assets


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
            expected_ids = [f"{row['id']}.p{index}" for index in range(1, len(pieces) + 1)]
            if [piece["id"] for piece in pieces] != expected_ids:
                raise ValueError(f"{row['id']}: route placement id set is not contiguous")
            if any(not isinstance(piece.get("fromM"), (int, float))
                   or not isinstance(piece.get("toM"), (int, float)) for piece in pieces):
                raise ValueError(f"{row['id']}: route placements need measured chainage")
            if abs(float(pieces[0]["fromM"]) - float(row["fromM"])) > 0.02:
                raise ValueError(f"{row['id']}: route placements do not start at authored chainage")
            for before, after in zip(pieces, pieces[1:]):
                if abs(float(before["toM"]) - float(after["fromM"])) > 0.02:
                    raise ValueError(f"{row['id']}: route placement chainage has a gap")
            if float(pieces[-1]["toM"]) < float(row["toM"]) - 0.05:
                raise ValueError(f"{row['id']}: route placements do not cover authored chainage")
        docs.append(doc)
    return docs


def _metres(poly: list, survey: ProvinceSurvey) -> list[list[float]]:
    return [[round(v, 3) for v in survey.uv_to_m(float(p[0]), float(p[1]))]
            for p in poly]


def build_bundle(settlements_dir: Path = DEFAULT_SETTLEMENTS,
                 structures_dir: Path = DEFAULT_STRUCTURES,
                 blueprints_dir: Path = BLUEPRINTS,
                 kits_dir: Path = KITS,
                 route_structures_source: Path = ROUTE_STRUCTURES_SOURCE,
                 catalogue_records_by_id: dict[str, dict] | None = None,
                 terrain_evidence: tuple[dict, dict, dict] | None = None) -> dict:
    survey = ProvinceSurvey()
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

    compiled = []
    kit_names: set[str] = {"route-structures-v1"}
    for path in sorted(settlements_dir.glob("place.*.settlement.json")):
        doc = _read(path)
        if doc["id"].startswith("place.fixture."):
            continue
        if doc.get("errors"):
            raise ValueError(f"{doc['id']} has {len(doc['errors'])} compile errors; "
                             "refusing to publish stale/incomplete massing")
        flood_report = doc.get("floodBandReport")
        if not isinstance(flood_report, dict):
            raise ValueError(f"{doc['id']} has no floodBandReport; refusing unchecked section placement")
        warnings = doc.get("warnings")
        if not isinstance(warnings, list) or flood_report.get("warningCount") != len(warnings):
            raise ValueError(f"{doc['id']} warning ledger disagrees with floodBandReport")
        if warnings:
            raise ValueError(f"{doc['id']} has {len(warnings)} unclosed placement warnings; "
                             "review and resolve them before runtime export")
        bp = blueprint_by_id.get(doc["id"])
        if bp is None:
            raise ValueError(f"compiled settlement has no authored blueprint: {doc['id']}")
        expected_hash = blueprint_sha256(bp)
        if doc.get("sourceBlueprintSha256") != expected_hash:
            raise ValueError(f"{doc['id']} sourceBlueprintSha256 does not match its authored blueprint; "
                             "refusing to publish a stale successful compile")
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

    route_docs = _validated_route_docs(structures_dir, route_structures_source)
    kits, assets = _kit_assets(kit_names, kits_dir)

    settlements = []
    obligation_receipts = []
    all_compiled_objects = []
    all_placements = []
    treatments = []
    navmesh = []
    navmesh_links = []
    doors = []
    for doc, bp in compiled:
        record = catalogue_records_by_id.get(doc["id"])
        expected_objects, object_errors = compiled_blueprint_objects(
            bp, doc.get("placements", []), doc.get("doors", []), survey)
        if record is not None:
            evidence_kwargs = (dict(zip(("plan", "fulfillment", "postconditions"), terrain_evidence))
                               if terrain_evidence is not None else {})
            terrain_objects, terrain_errors = compiled_terrain_objects(record, **evidence_kwargs)
            expected_objects.extend(terrain_objects)
            expected_objects.sort(key=lambda row: row["id"])
            object_errors += terrain_errors
        if object_errors:
            raise ValueError(f"{doc['id']} compiled object set is incomplete: "
                             + "; ".join(object_errors))
        actual_objects = doc.get("compiledObjects")
        if not isinstance(actual_objects, list):
            raise ValueError(f"{doc['id']} has no compiledObjects final-delivery record")
        if actual_objects != expected_objects:
            raise ValueError(f"{doc['id']} compiledObjects do not match the exact compiler output")
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
            if delivery_errors:
                raise ValueError(f"{doc['id']} phase-11-compiled obligations are not delivered: "
                                 + "; ".join(delivery_errors))
            obligation_receipts.append(receipt)
        all_compiled_objects.extend(actual_objects)
        parcels = {p["id"]: p for p in bp.get("parcels", [])}
        ids = []
        for raw in doc.get("placements", []):
            if not raw.get("kit"):  # dock-placeholder is debug data, not geometry
                continue
            asset = assets.get(raw["assetId"])
            if asset is None:
                raise ValueError(f"{raw['id']}: asset absent from {raw['kit']} manifest")
            fit = raw.get("groundFit", "direct")
            parcel = parcels.get(raw.get("parcelId"), {})
            object_kind = raw.get("objectKind") or (
                "dressing" if "dressingFor" in raw else "parcel")
            is_dressing = object_kind == "dressing"
            footprint = [] if is_dressing else _metres(parcel.get("footprint", []), survey)
            placement = {
                "id": raw["id"], "sourceId": doc["id"],
                "kind": "settlement" if object_kind == "parcel" else object_kind,
                "assetId": raw["assetId"], "kit": raw["kit"],
                "positionM": raw["positionM"], "yawDeg": raw.get("yawDeg", 0),
                "scale": raw.get("scale", 1), "footprintM": footprint,
                "anchor": {
                    "mode": "streamed-perimeter" if footprint else "streamed-origin",
                    "groundFit": fit,
                    "originOffsetM": asset.get("originOffsetM", [0, 0, 0]),
                    "buryM": BURY_BY_FIT[fit], "buryCapM": BURY_CAP_BY_FIT[fit],
                    "slopeBuryPerM": 0.08,
                },
                "collision": _collision_contract(asset, disabled=is_dressing),
                "provenance": raw["provenance"],
            }
            ids.append(placement["id"])
            all_placements.append(placement)
            if footprint:
                treatments.append({
                    "id": f"treatment.{placement['id']}", "footprintM": footprint,
                    "contactAoWidthM": 1.5, "baseSkirtWidthM": 0.9,
                    "foundationScatterBandM": [0.0, 1.2], "farTier": False,
                })
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
        })

    route_count = 0
    for doc in route_docs:
        for raw in doc.get("placements", []):
            asset = assets.get(raw["assetId"])
            if asset is None:
                raise ValueError(f"{raw['id']}: route asset absent from manifest")
            all_placements.append({
                "id": raw["id"], "sourceId": doc["wayId"], "kind": "route-structure",
                "assetId": raw["assetId"], "kit": "route-structures-v1",
                "positionM": raw["posM"], "yawDeg": raw.get("yawDeg", 0), "scale": 1,
                "footprintM": [],
                "anchor": {"mode": "streamed-origin", "groundFit": "direct",
                           "originOffsetM": asset.get("originOffsetM", [0, 0, 0]),
                           "buryM": 0.06, "buryCapM": 0.15, "slopeBuryPerM": 0.0},
                "collision": _collision_contract(asset),
                "provenance": raw["provenance"],
            })
            route_count += 1

    all_placements.sort(key=lambda p: p["id"])
    return {
        "schemaVersion": SCHEMA_VERSION,
        "collisionFrame": COLLISION_FRAME,
        "lod": {"tiers": 3, "absoluteTriangleFloor": [120, 80],
                "distancePerFootprintDiagonal": [4.0, 12.0],
                "farMergeDistanceM": 900, "atlasMaxSize": 4096,
                "colliderRadiusM": 180, "colliderPartBudget": 256},
        "kits": kits, "settlements": settlements,
        "phase11ObligationReceipts": sorted(obligation_receipts,
                                              key=lambda receipt: receipt["placeId"]),
        "compiledObjects": sorted(all_compiled_objects, key=lambda row: row["id"]),
        "placements": all_placements, "groundTreatments": treatments,
        "navmeshCuts": navmesh, "navmeshLinks": navmesh_links, "doors": doors,
        "stats": {"settlements": len(settlements),
                  "settlementPlacements": sum(len(s["placementIds"]) for s in settlements),
                  "routeStructurePlacements": route_count},
    }


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


def _stage_assets(bundle: dict, kits_dir: Path, public_dir: Path) -> tuple[Path, list[str]]:
    """Validate and copy every asset to a private sibling before publication."""
    public_dir.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".kits-stage.", dir=public_dir.parent))
    names: list[str] = []
    try:
        for name in sorted(bundle["kits"]):
            for suffix in (".glb", ".kit.json"):
                source = kits_dir / f"{name}{suffix}"
                if not source.is_file() or source.stat().st_size <= 0:
                    raise ValueError(f"runtime kit asset is missing or empty: {source}")
                target = stage / source.name
                shutil.copy2(source, target)
                with target.open("rb") as handle:
                    os.fsync(handle.fileno())
                names.append(source.name)
        return stage, names
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def copy_assets(bundle: dict, kits_dir: Path = KITS,
                public_dir: Path = PUBLIC_KITS) -> None:
    stage, names = _stage_assets(bundle, kits_dir, public_dir)
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
    args = ap.parse_args()
    try:
        bundle = build_bundle()
        if args.copy_assets:
            copy_assets(bundle)
        _atomic_json(args.out, bundle)
    except ValueError as exc:
        print(f"export_settlement_bundle: {exc}")
        return 1
    print(f"export_settlement_bundle: {args.out} — "
          f"{bundle['stats']['settlementPlacements']} settlement + "
          f"{bundle['stats']['routeStructurePlacements']} route pieces")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
