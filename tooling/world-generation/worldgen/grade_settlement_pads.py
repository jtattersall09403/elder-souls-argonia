"""Apply authored settlement pad fits to the final route-graded heightfield.

Blueprint parcels marked ``groundFit: pad`` promise a small, engineered base:
the ground delta under the measured footprint is at most two metres, the pad
uses the highest sampled ground as its datum, and a 0.7 degree residual tilt
prevents a perfectly coplanar building/ground join. The settlement compiler
has long emitted that promise as data; this stage is the terrain consumer.

The terrain chain runs this after its last route grade and before chunks and
final water. The stage writes an applied, content-addressed receipt beside the
refined terrain and in the public refined directory. It fails rather than
grading a footprint that exceeds the two-metre pad limit.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import tempfile
from pathlib import Path

import numpy as np

from .compile_chunks import DEFAULT_HEIGHTS, REPO_ROOT
from .scale import AUTHORED_UV_EXTENT_M, RAW_M

SCHEMA_VERSION = 1
KIND = "settlement-pad-grades"
MAX_PAD_DELTA_M = 2.0
FALLOFF_RATIO = 2.5
RESIDUAL_TILT_DEG = 0.7
BLUEPRINT_DIR = REPO_ROOT / "world" / "sources" / "blueprints"
PUBLIC_RECEIPT = (REPO_ROOT / "apps" / "world-studio" / "public" / "province"
                  / "refined" / "settlement-pad-grades.json")


def _canonical(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"),
                       ensure_ascii=False) + "\n").encode("utf-8")


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _points_in_polygon(x: np.ndarray, z: np.ndarray,
                       polygon: list[tuple[float, float]]) -> np.ndarray:
    inside = np.zeros(np.broadcast_shapes(x.shape, z.shape), dtype=bool)
    ax, az = polygon[-1]
    for bx, bz in polygon:
        crosses = ((bz > z) != (az > z))
        x_cross = (ax - bx) * (z - bz) / (az - bz + 1e-300) + bx
        inside ^= crosses & (x < x_cross)
        ax, az = bx, bz
    return inside


def _distance_to_polygon(x: np.ndarray, z: np.ndarray,
                         polygon: list[tuple[float, float]]) -> np.ndarray:
    distance2 = np.full(np.broadcast_shapes(x.shape, z.shape), np.inf,
                        dtype=np.float64)
    ax, az = polygon[-1]
    for bx, bz in polygon:
        dx, dz = bx - ax, bz - az
        length2 = dx * dx + dz * dz
        if length2 == 0:
            candidate = (x - ax) ** 2 + (z - az) ** 2
        else:
            t = np.clip(((x - ax) * dx + (z - az) * dz) / length2, 0.0, 1.0)
            candidate = (x - (ax + t * dx)) ** 2 + (z - (az + t * dz)) ** 2
        distance2 = np.minimum(distance2, candidate)
        ax, az = bx, bz
    return np.sqrt(distance2)


def _sample(height: np.ndarray, x_m: float, z_m: float, metres_per_sample: float) -> float:
    """Bilinear height sample in the terrain vertex registration."""
    col = np.clip(x_m / metres_per_sample, 0.0, height.shape[1] - 1.0)
    row = np.clip(z_m / metres_per_sample, 0.0, height.shape[0] - 1.0)
    c0, r0 = int(math.floor(col)), int(math.floor(row))
    c1, r1 = min(c0 + 1, height.shape[1] - 1), min(r0 + 1, height.shape[0] - 1)
    tx, tz = col - c0, row - r0
    return float((height[r0, c0] * (1 - tx) + height[r0, c1] * tx) * (1 - tz)
                 + (height[r1, c0] * (1 - tx) + height[r1, c1] * tx) * tz)


def pad_specs(documents: list[dict], *, extent_m: float = AUTHORED_UV_EXTENT_M) -> list[dict]:
    """Extract the complete, stable set of pad parcels from blueprint docs."""
    specs: list[dict] = []
    for document in documents:
        blueprint = document.get("blueprint", document)
        place_id = blueprint.get("id")
        if not isinstance(place_id, str):
            raise ValueError("blueprint has no id")
        source_sha = _sha(_canonical(document))
        for parcel in blueprint.get("parcels", []):
            if parcel.get("groundFit") != "pad":
                continue
            raw = parcel.get("footprint")
            if not isinstance(raw, list) or len(raw) < 3:
                raise ValueError(f"{parcel.get('id')}: pad footprint needs at least three points")
            polygon = [(float(point[0]) * extent_m, float(point[1]) * extent_m)
                       for point in raw]
            specs.append({
                "id": f"pad-grade.{place_id}.{parcel['id']}",
                "placeId": place_id,
                "parcelId": parcel["id"],
                "sourceBlueprintSha256": source_sha,
                "footprintM": polygon,
                "tiltBearingDeg": float(parcel.get("yawDeg", 0.0)),
                "falloffRatio": FALLOFF_RATIO,
                "residualTiltDeg": RESIDUAL_TILT_DEG,
            })
    return sorted(specs, key=lambda row: row["id"])


def apply_pad_grades(height: np.ndarray, specs: list[dict], *,
                     metres_per_sample: float = RAW_M) -> tuple[np.ndarray, list[dict]]:
    """Return a graded copy and per-pad applied evidence.

    Every target is measured from the same input surface, so nearby pads do
    not feed their result into one another. Stable id order resolves feather
    overlap; authored hard footprints must not overlap and are rejected.
    """
    if height.ndim != 2 or not np.issubdtype(height.dtype, np.floating):
        raise ValueError("heightfield must be a 2D floating-point array")
    if metres_per_sample <= 0:
        raise ValueError("metres_per_sample must be positive")
    source = height.astype(np.float32, copy=True)
    result = source.copy()
    hard_owner = np.zeros(height.shape, dtype=np.int32)
    receipts: list[dict] = []

    for ordinal, spec in enumerate(sorted(specs, key=lambda row: row["id"]), start=1):
        polygon = [(float(x), float(z)) for x, z in spec["footprintM"]]
        cx = sum(x for x, _ in polygon) / len(polygon)
        cz = sum(z for _, z in polygon) / len(polygon)
        sampled = [_sample(source, x, z, metres_per_sample) for x, z in polygon]
        sampled.append(_sample(source, cx, cz, metres_per_sample))
        measured_delta = max(sampled) - min(sampled)
        if measured_delta > MAX_PAD_DELTA_M + 1e-6:
            raise ValueError(f"{spec['parcelId']}: measured delta {measured_delta:.3f} m "
                             f"exceeds {MAX_PAD_DELTA_M:.1f} m pad limit")
        target_height = max(sampled)
        radius = max(math.hypot(x - cx, z - cz) for x, z in polygon)
        falloff_m = max(metres_per_sample, radius * (float(spec["falloffRatio"]) - 1.0))
        reach = falloff_m + metres_per_sample
        min_col = max(0, int(math.floor((min(x for x, _ in polygon) - reach) / metres_per_sample)))
        max_col = min(height.shape[1] - 1,
                      int(math.ceil((max(x for x, _ in polygon) + reach) / metres_per_sample)))
        min_row = max(0, int(math.floor((min(z for _, z in polygon) - reach) / metres_per_sample)))
        max_row = min(height.shape[0] - 1,
                      int(math.ceil((max(z for _, z in polygon) + reach) / metres_per_sample)))
        xs = np.arange(min_col, max_col + 1, dtype=np.float64) * metres_per_sample
        zs = np.arange(min_row, max_row + 1, dtype=np.float64) * metres_per_sample
        x_grid, z_grid = xs[None, :], zs[:, None]
        inside = _points_in_polygon(x_grid, z_grid, polygon)
        owners = hard_owner[min_row:max_row + 1, min_col:max_col + 1]
        if np.any(inside & (owners != 0)):
            raise ValueError(f"{spec['parcelId']}: hard pad footprint overlaps another pad")
        owners[inside] = ordinal

        distance = _distance_to_polygon(x_grid, z_grid, polygon)
        weight = np.where(inside, 1.0, np.clip(1.0 - distance / falloff_m, 0.0, 1.0))
        weight = weight * weight * (3.0 - 2.0 * weight)
        bearing = math.radians(float(spec["tiltBearingDeg"]))
        along = ((x_grid - cx) * math.sin(bearing)
                 + (z_grid - cz) * math.cos(bearing))
        vertex_along = [(x - cx) * math.sin(bearing) + (z - cz) * math.cos(bearing)
                        for x, z in polygon]
        plane = target_height + math.tan(math.radians(float(spec["residualTiltDeg"]))) * (
            along - max(vertex_along))
        source_view = source[min_row:max_row + 1, min_col:max_col + 1]
        desired_delta = np.clip(plane - source_view, -MAX_PAD_DELTA_M, MAX_PAD_DELTA_M)
        candidate = source_view + desired_delta * weight
        view = result[min_row:max_row + 1, min_col:max_col + 1]
        changed = weight > 0.0
        view[changed] = candidate[changed].astype(np.float32)

        hard_error = np.abs(view[inside] - plane[inside]) if np.any(inside) else np.array([0.0])
        delta = view - source_view
        max_error = float(hard_error.max(initial=0.0))
        receipts.append({
            **{key: spec[key] for key in ("id", "placeId", "parcelId",
                                          "sourceBlueprintSha256", "tiltBearingDeg",
                                          "falloffRatio", "residualTiltDeg")},
            "targetHeightM": round(float(target_height), 6),
            "measuredDeltaM": round(float(measured_delta), 6),
            "falloffM": round(float(falloff_m), 6),
            "changedSamples": int(np.count_nonzero(np.abs(delta) > 1e-6)),
            "maxFillM": round(float(max(0.0, delta.max(initial=0.0))), 6),
            "maxCutM": round(float(max(0.0, -delta.min(initial=0.0))), 6),
            "maxHardSurfaceErrorM": round(max_error, 7),
            "postcondition": "pass" if max_error <= 1e-5 else "fail",
        })
    return result, receipts


def _pad_set_sha(rows: list[dict]) -> str:
    return _sha(_canonical([{
        "id": row["id"],
        "sourceBlueprintSha256": row["sourceBlueprintSha256"],
    } for row in rows]))


def build_receipt(source: np.ndarray, result: np.ndarray, rows: list[dict]) -> dict:
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": KIND,
        "inputHeightSha256": _sha(source.astype(np.float32, copy=False).tobytes()),
        "outputHeightSha256": _sha(result.astype(np.float32, copy=False).tobytes()),
        "padSetSha256": _pad_set_sha(rows),
        "pads": rows,
    }
    return {**payload, "receiptSha256": _sha(_canonical(payload))}


def already_applied(receipt: dict, height: np.ndarray, specs: list[dict]) -> bool:
    """True only for this exact terrain and current authored pad set."""
    payload = {key: receipt.get(key) for key in (
        "schemaVersion", "kind", "inputHeightSha256", "outputHeightSha256",
        "padSetSha256", "pads")}
    return (receipt.get("receiptSha256") == _sha(_canonical(payload))
            and receipt.get("kind") == KIND
            and receipt.get("outputHeightSha256") == _sha(
                height.astype(np.float32, copy=False).tobytes())
            and receipt.get("padSetSha256") == _pad_set_sha(specs))


def _atomic_npy(path: Path, value: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            np.save(handle, value)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(value, indent=2, sort_keys=True).encode("utf-8") + b"\n"
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("heights", nargs="?", type=Path, default=DEFAULT_HEIGHTS)
    parser.add_argument("--blueprints", type=Path, default=BLUEPRINT_DIR)
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    documents = [json.loads(path.read_text())
                 for path in sorted(args.blueprints.glob("place.*.json"))]
    specs = pad_specs(documents)
    source = np.load(args.heights).astype(np.float32)
    vault_receipt = args.receipt or args.heights.with_name("settlement-pad-grades.json")
    try:
        existing = json.loads(vault_receipt.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        existing = None
    if isinstance(existing, dict) and already_applied(existing, source, specs):
        if not args.dry_run:
            _atomic_json(PUBLIC_RECEIPT, existing)
        print(f"settlement pads: {len(specs)} already applied")
        return 0
    result, rows = apply_pad_grades(source, specs)
    receipt = build_receipt(source, result, rows)
    if not args.dry_run:
        _atomic_npy(args.heights, result)
        _atomic_json(vault_receipt, receipt)
        _atomic_json(PUBLIC_RECEIPT, receipt)
    print(f"settlement pads: {len(rows)} applied, "
          f"{sum(row['changedSamples'] for row in rows)} changed samples")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
