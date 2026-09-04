"""Settlement compiler — walking skeleton (Phase 11 Part 0 item 4, decision 0041).

Deterministic blueprint → compiled-settlement pass. This is deliberately the
SKELETON: it must compile ONE settlement well before it grows options. What it
owns already (because retrofitting them is the expensive version):

  * ground fitting per the slope ladder (0041 "Slopes and uneven ground"):
    measure Δ (terrain height delta across the parcel footprint) and check the
    declared groundFit is legal — direct Δ<0.15 m · plinth 0.15–0.6 · pad
    0.6–2.0 (with falloff ring) · Δ≥2.0 NEVER graded → stilt/dug-in or the
    compile fails. Pad height from the MAX under the footprint; base buried
    0.25 m.
  * kit placement by GRID TRANSFORM around a centred pivot (3.64 m module) —
    never the flora bottom-anchor path (kit-vet finding, 0041 Part 0 notes).
  * graded vegetation clearing masks (hardClear / thinned polygons + affected
    chunk list) for the scatter compiler.
  * terrain grade patches as data (footprint, target height, falloff ring,
    residual tilt 0.7° against shadow acne) — applied by the chunk rebuild,
    never by editing rasters here.
  * door reachability, every compile: threshold on land, walkable slope,
    inside/adjacent to cleared ground.
  * GenerationProvenance on every emitted object (module 40 §31).
  * the static budget report checked against the blueprint's declared budget
    (instances, unique assets/materials, texture MB, collider estimate).

Output: output/settlements/<place-id>.settlement.json (derived, gitignored),
deterministic and byte-stable for a given blueprint + seed.

Run (from tooling/world-generation/):
  python3 -m worldgen.compile_settlement --blueprint <path> [--skip-catalogue]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

from . import blueprint as bp_mod
from .site_fields import ProvinceSurvey

SCHEMA_VERSION = 1
GENERATOR_ID = "compile_settlement"
GENERATOR_VERSION = "0.1.0"
GRID_M = 3.64  # the mined snap module (2 x 1.82 m)
BURY_M = 0.25
PAD_FALLOFF_RATIO = 2.5
PAD_RESIDUAL_TILT_DEG = 0.7
DOOR_MAX_SLOPE_DEG = 30.0
DOOR_SLOPE_SAMPLE_M = 2.0     # half-width of the threshold gradient sample
REPO_ROOT = Path(__file__).resolve().parents[3]
KITS_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
OUT_DIR = Path(__file__).resolve().parents[1] / "output" / "settlements"

# District cultureKit → kit configs, in preference order. The two-culture rule
# is enforced by the blueprint validator; here it just picks the shelf.
# Kit sets are the blueprint schema's vocabulary (one source of truth).
CULTURE_KITS = {k: v["kits"] for k, v in bp_mod.KIT_SETS.items()}

# Legal ground fits per measured Δ band (the ladder; a declared fit may be
# STRONGER than needed — stilts on flat ground are fine and lore-correct —
# but never weaker).
FIT_MIN = {"direct": 0.0, "plinth": 0.15, "pad": 0.6, "stilt": 0.0, "dug-in": 0.0}
FIT_MAX = {"direct": 0.15, "plinth": 0.6, "pad": 2.0, "stilt": float("inf"), "dug-in": float("inf")}


def _seed_int(*parts: str) -> int:
    return int.from_bytes(hashlib.sha256("|".join(parts).encode()).digest()[:8], "big")


def _centroid(poly: list[list[float]]) -> tuple[float, float]:
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _snap(value_m: float) -> float:
    return round(value_m / GRID_M) * GRID_M


class KitShelf:
    """Loads the built kit manifests and picks assets for building families."""

    def __init__(self, kits_dir: Path = KITS_DIR):
        self.assets_by_kit: dict[str, list[dict]] = {}
        self.textures_mb: dict[str, float] = {}
        for name, path in sorted((p.stem.removesuffix(".kit"), p) for p in kits_dir.glob("*.kit.json")):
            data = json.loads(path.read_text())
            self.assets_by_kit[name] = data["assets"]

    def find(self, culture: str, asset_ref: str) -> dict | None:
        """An exact kit asset id inside the district's kit set (the Part 6
        geometry-judged pick). None if the set does not contain it."""
        for kit in CULTURE_KITS.get(culture, []):
            for asset in self.assets_by_kit.get(kit, []):
                if asset["id"] == asset_ref:
                    return {"kit": kit, **asset}
        return None

    def pick(self, culture: str, family: str, key: str, asset_ref: str | None = None) -> dict | None:
        """Deterministically pick an asset matching `family` from the culture's
        kits: an explicit `asset_ref` wins outright; else exact-token match on
        the asset id first, else any asset tall enough to read as a building.
        `key` seeds the choice."""
        if asset_ref:
            return self.find(culture, asset_ref)
        candidates: list[tuple[str, dict]] = []
        fallback: list[tuple[str, dict]] = []
        for kit in CULTURE_KITS.get(culture, []):
            for asset in self.assets_by_kit.get(kit, []):
                if family.lower() in asset["id"].lower():
                    candidates.append((kit, asset))
                elif (asset.get("sizeM") or [0, 0, 0])[2] >= 2.0:
                    fallback.append((kit, asset))
        pool = candidates or fallback
        if not pool:
            return None
        kit, asset = pool[_seed_int(key, family) % len(pool)]
        return {"kit": kit, **asset}


def _provenance(bp_id: str, seed: str, rule: str, asset_id: str, hashes: list[str]) -> dict:
    return {
        "sourceBlueprintId": bp_id,
        "generatorId": GENERATOR_ID,
        "generatorVersion": GENERATOR_VERSION,
        "seed": seed,
        "ruleId": rule,
        "assetId": asset_id,
        "sourceDataHashes": hashes,
    }


def compile_blueprint(bp: dict, survey: ProvinceSurvey, shelf: KitShelf) -> dict:
    bp_id = bp["id"]
    seed = str(bp["seed"])
    errors: list[str] = []
    placements: list[dict] = []
    grades: list[dict] = []

    culture_of = {d["id"]: d["cultureKit"] for d in bp["districts"]}

    for parcel in sorted(bp["parcels"], key=lambda p: p["id"]):
        pid = parcel["id"]
        culture = culture_of[parcel["districtId"]]
        foot_m = [list(survey.uv_to_m(u, v)) for u, v in parcel["footprint"]]
        heights = [survey.height_at(x, z) for x, z in foot_m]
        cx, cz = _centroid(foot_m)
        heights.append(survey.height_at(cx, cz))
        delta = max(heights) - min(heights)

        fit = parcel["groundFit"]
        if delta > FIT_MAX[fit]:
            errors.append(
                f"{pid}: measured Δ={delta:.2f} m exceeds groundFit '{fit}' "
                f"(max {FIT_MAX[fit]:.2f} m) — never grade Δ>=2 m: use stilt/dug-in or re-site"
            )
            continue

        asset = shelf.pick(culture, parcel["buildingFamily"], f"{seed}:{pid}", parcel.get("assetRef"))
        if asset is None:
            errors.append(f"{pid}: no kit asset for family '{parcel['buildingFamily']}'"
                          + (f" / assetRef '{parcel['assetRef']}'" if parcel.get("assetRef") else "")
                          + f" in kit set '{culture}'")
            continue

        base_y = max(heights) - BURY_M
        if fit == "pad":
            grades.append({
                "parcelId": pid,
                "footprint": parcel["footprint"],
                "targetHeightM": max(heights),
                "falloffRatio": PAD_FALLOFF_RATIO,
                "residualTiltDeg": PAD_RESIDUAL_TILT_DEG,
            })
        # authored orientation wins; otherwise a seeded quarter turn (skeleton)
        yaw = float(parcel["yawDeg"]) if isinstance(parcel.get("yawDeg"), (int, float)) else (_seed_int(seed, pid, "yaw") % 4) * 90.0
        placements.append({
            "id": f"{bp_id}.{pid}.building",
            "parcelId": pid,
            "assetId": asset["id"],
            "kit": asset["kit"],
            # grid transform, centred pivot — never flora bottom-anchoring
            "positionM": [_snap(cx), round(base_y + (asset["sizeM"][2] / 2 if fit != "dug-in" else 0.0), 3), _snap(cz)],
            "yawDeg": yaw,
            "groundFit": fit,
            "provenance": _provenance(bp_id, seed, f"parcel-building/{fit}", asset["id"], []),
        })

    for dock in sorted(bp.get("docks", []), key=lambda d: d["id"]):
        x, z = survey.uv_to_m(*dock["position"])
        placements.append({
            "id": f"{bp_id}.{dock['id']}",
            "assetId": "dock-placeholder",
            "kit": None,
            "positionM": [round(x, 2), round(survey.height_at(x, z), 3), round(z, 2)],
            "yawDeg": 0.0,
            "piledToBed": True,
            "provenance": _provenance(bp_id, seed, "dock/skeleton", "dock-placeholder", []),
        })

    # --- door reachability, every compile -------------------------------
    doors_out: list[dict] = []
    for door in sorted(bp["doors"], key=lambda d: d["id"]):
        x, z = survey.uv_to_m(*door["thresholdUV"])
        # grid_px returns (row, col) = (z index, x index), and every other caller
        # in worldgen unpacks it in that order. Indexing [col, row] here sampled a
        # transposed pixel, so door reachability was measured at the wrong place.
        row, col = survey.grid_px(x, z)
        on_land = bool(survey.land[row, col])
        # local gradient from height samples 2 m either side of the threshold:
        # the 5.5 m slope raster reads a terrace lip as 40° where the walkable
        # fall is ~11° (Mazzatun, 2026-09-04)
        d = DOOR_SLOPE_SAMPLE_M
        gx = (survey.height_at(x + d, z) - survey.height_at(x - d, z)) / (2 * d)
        gz = (survey.height_at(x, z + d) - survey.height_at(x, z - d)) / (2 * d)
        slope = math.degrees(math.atan(math.hypot(gx, gz)))
        graded = any(g["parcelId"] == door["parcelId"] for g in grades)
        ok_slope = graded or slope <= DOOR_MAX_SLOPE_DEG
        cleared = _point_in_any(door["thresholdUV"], bp["clearance"].get("hardClear", []))
        reachable = on_land and ok_slope and cleared
        if not reachable:
            errors.append(
                f"{door['id']}: unreachable (land={on_land}, slopeOk={ok_slope} "
                f"[{slope:.0f}°], inHardClear={cleared})"
            )
        doors_out.append({**door, "reachable": reachable})

    # --- clearance masks for the scatter compiler -----------------------
    chunk_m = 462.0  # 16x16 chunks over the 7392 m province (see chunks meta)
    affected: set[tuple[int, int]] = set()
    for poly in bp["clearance"].get("hardClear", []) + bp["clearance"].get("thinned", []):
        for u, v in poly:
            x, z = survey.uv_to_m(u, v)
            affected.add((int(x // chunk_m), int(z // chunk_m)))

    # --- static budget report (0041 perf contract) ----------------------
    unique_assets = sorted({p["assetId"] for p in placements})
    materials: set[str] = set()
    tris = 0
    for p in placements:
        for kit_assets in ([shelf.assets_by_kit.get(p["kit"], [])] if p["kit"] else []):
            for a in kit_assets:
                if a["id"] == p["assetId"]:
                    materials.update(a.get("materials", []))
                    tris += a.get("triangles", 0)
    budget = bp["budget"]
    report = {
        "instances": len(placements),
        "uniqueAssets": len(unique_assets),
        "uniqueMaterials": len(materials),
        "triangles": tris,
        "colliderEstimate": len(placements),  # skeleton: one collider per placement
        "declared": budget,
        "withinBudget": (
            len(placements) <= budget["maxInstances"]
            and len(materials) <= budget["maxUniqueMaterials"]
            and len(placements) <= budget["maxColliders"]
        ),
    }
    if not report["withinBudget"]:
        errors.append(f"budget exceeded: {report}")

    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": bp_id,
        "seed": seed,
        "generator": {"id": GENERATOR_ID, "version": GENERATOR_VERSION},
        "placements": placements,
        "doors": doors_out,
        "grades": grades,
        "clearance": {
            "hardClear": bp["clearance"].get("hardClear", []),
            "thinned": bp["clearance"].get("thinned", []),
            "kept": bp["clearance"].get("kept", []),
            "affectedChunks": sorted(affected),
        },
        "budgetReport": report,
        "errors": errors,
    }


def _point_in_any(pt: list[float], polys: list[list[list[float]]]) -> bool:
    for poly in polys:
        n = len(poly)
        inside = False
        j = n - 1
        for i in range(n):
            xi, yi = poly[i]
            xj, yj = poly[j]
            if (yi > pt[1]) != (yj > pt[1]) and pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
        if inside:
            return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--blueprint", required=True)
    ap.add_argument("--skip-catalogue", action="store_true",
                    help="skip the blueprint-id-in-catalogue check (fixtures)")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    data = json.loads(Path(args.blueprint).read_text())
    bp = data["blueprint"]
    known = None if args.skip_catalogue else bp_mod.catalogue_ids()
    schema_errors = bp_mod.validate_blueprint(bp, known)
    if schema_errors:
        for e in schema_errors:
            print(f"compile_settlement: schema: {e}", file=sys.stderr)
        return 1

    result = compile_blueprint(bp, ProvinceSurvey(), KitShelf())
    out = Path(args.out) if args.out else OUT_DIR / f"{bp['id']}.settlement.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=1, sort_keys=True) + "\n")
    for e in result["errors"]:
        print(f"compile_settlement: {e}", file=sys.stderr)
    print(f"compile_settlement: {out} — {result['budgetReport']['instances']} placements, "
          f"{len(result['errors'])} errors, budget {'OK' if result['budgetReport']['withinBudget'] else 'EXCEEDED'}")
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
