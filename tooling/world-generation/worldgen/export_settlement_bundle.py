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
from .compile_settlement import blueprint_sha256

SCHEMA_VERSION = 1
COLLISION_FRAME = "settlement-pivot-yup-v1"
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SETTLEMENTS = Path(__file__).resolve().parents[1] / "output" / "settlements"
DEFAULT_STRUCTURES = Path(__file__).resolve().parents[1] / "output" / "route-structures"
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


def _metres(poly: list, survey: ProvinceSurvey) -> list[list[float]]:
    return [[round(v, 3) for v in survey.uv_to_m(float(p[0]), float(p[1]))]
            for p in poly]


def build_bundle(settlements_dir: Path = DEFAULT_SETTLEMENTS,
                 structures_dir: Path = DEFAULT_STRUCTURES,
                 blueprints_dir: Path = BLUEPRINTS,
                 kits_dir: Path = KITS) -> dict:
    survey = ProvinceSurvey()
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

    route_docs = [_read(p) for p in sorted(structures_dir.glob("*.json"))]
    kits, assets = _kit_assets(kit_names, kits_dir)

    settlements = []
    all_placements = []
    treatments = []
    navmesh = []
    navmesh_links = []
    doors = []
    for doc, bp in compiled:
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
            is_dressing = "dressingFor" in raw
            footprint = [] if is_dressing else _metres(parcel.get("footprint", []), survey)
            placement = {
                "id": raw["id"], "sourceId": doc["id"],
                "kind": "dressing" if is_dressing else "settlement",
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
                "collision": {"frame": COLLISION_FRAME,
                              "kind": "none" if is_dressing else asset.get("collision", "none")},
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
            "boundaryM": _metres(bp.get("boundary", []), survey),
            "budgetReport": doc.get("budgetReport"),
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
                "collision": {"frame": COLLISION_FRAME,
                              "kind": asset.get("collision", "none")},
                "provenance": raw["provenance"],
            })
            route_count += 1

    all_placements.sort(key=lambda p: p["id"])
    return {
        "schemaVersion": SCHEMA_VERSION,
        "collisionFrame": COLLISION_FRAME,
        "lod": {"tiers": 3, "absoluteTriangleFloor": [120, 80],
                "distancePerFootprintDiagonal": [4.0, 12.0],
                "farMergeDistanceM": 900, "atlasMaxSize": 4096},
        "kits": kits, "settlements": settlements,
        "placements": all_placements, "groundTreatments": treatments,
        "navmeshCuts": navmesh, "navmeshLinks": navmesh_links, "doors": doors,
        "stats": {"settlements": len(settlements),
                  "settlementPlacements": sum(len(s["placementIds"]) for s in settlements),
                  "routeStructurePlacements": route_count},
    }


def copy_assets(bundle: dict, kits_dir: Path = KITS,
                public_dir: Path = PUBLIC_KITS) -> None:
    public_dir.mkdir(parents=True, exist_ok=True)
    for name in sorted(bundle["kits"]):
        for suffix in (".glb", ".kit.json"):
            source = kits_dir / f"{name}{suffix}"
            if not source.exists():
                raise ValueError(f"runtime kit asset is missing: {source}")
            shutil.copy2(source, public_dir / source.name)


def export(out: Path = OUT, copy: bool = False) -> dict:
    bundle = build_bundle()
    _atomic_json(out, bundle)
    if copy:
        copy_assets(bundle)
    return bundle


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--copy-assets", action="store_true")
    args = ap.parse_args()
    try:
        bundle = build_bundle()
        _atomic_json(args.out, bundle)
        if args.copy_assets:
            copy_assets(bundle)
    except ValueError as exc:
        print(f"export_settlement_bundle: {exc}")
        return 1
    print(f"export_settlement_bundle: {args.out} — "
          f"{bundle['stats']['settlementPlacements']} settlement + "
          f"{bundle['stats']['routeStructurePlacements']} route pieces")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
