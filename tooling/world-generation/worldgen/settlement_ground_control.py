"""Paint compiled settlement yards into the province ground-control raster.

This is a deliberately separate, last-mile postprocessor.  The terrain/water
chain owns the base control map; after that chain and the settlement exporter
both succeed, this module applies the bundle's exact ``groundTreatments``.

The control encoding is the one produced by :mod:`worldgen.landcover`:
``R = primary material id, G = secondary id, B = secondary weight, A = macro
mottle``.  Settlement ground uses the existing PATH material as its
trodden/built primary.  At the outside transition the previous primary becomes
the secondary and its weight rises smoothly.  Alpha is never modified.

The coarse yard apron is 5.5 m (three 1.83 m full-resolution texels), followed
by one 1.83 m transition texel.  These are intentionally too coarse for the
wall-foot treatment, which remains bundle-driven geometry. Raster texel size
is always derived from the image dimensions and canonical province extent;
``refined/meta.json`` describes a different raster and must not be used.

Run, after exporting a fresh settlement bundle::

    python3 -m worldgen.settlement_ground_control

The output PNG and a content-addressed provenance/coverage manifest are
written by atomic replacement.  The command rebuilds the settlement bundle in
memory first and refuses a missing or stale exported bundle.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
import tempfile
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image

from .landcover import PATH
from .scale import PROVINCE_EXTENT_M

SCHEMA_VERSION = 1
KIND = "settlement-ground-control"
YARD_APRON_M = 5.5
EDGE_BLEND_M = 1.83
BUILT_GROUND_MATERIAL_ID = PATH

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_BUNDLE = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "settlements.json"
DEFAULT_CONTROL = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "refined" / "ground-control.png"
DEFAULT_WATER_SURFACE = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water" / "water-surface.png"
DEFAULT_WATER_META = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water" / "water-meta.json"
DEFAULT_PROVENANCE = DEFAULT_CONTROL.with_name("ground-control.settlements.json")


def _canonical(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"),
                       ensure_ascii=False) + "\n").encode("utf-8")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _read_bytes(path: Path, label: str) -> bytes:
    try:
        return path.read_bytes()
    except FileNotFoundError as exc:
        raise ValueError(f"missing {label}: {path}") from exc


def _json_bytes(data: bytes, label: str) -> dict:
    try:
        value = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"invalid {label}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a JSON object")
    return value


def _validated_treatments(bundle: dict) -> list[list[tuple[float, float]]]:
    if bundle.get("schemaVersion") != 1:
        raise ValueError("settlement bundle schemaVersion must be 1")
    rows = bundle.get("groundTreatments")
    if not isinstance(rows, list) or not rows:
        raise ValueError("settlement bundle has no groundTreatments")
    polygons: list[list[tuple[float, float]]] = []
    ids: set[str] = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"groundTreatments[{index}] must be an object")
        treatment_id = row.get("id")
        if not isinstance(treatment_id, str) or not treatment_id or treatment_id in ids:
            raise ValueError(f"groundTreatments[{index}] needs a unique stable id")
        ids.add(treatment_id)
        raw = row.get("footprintM")
        if not isinstance(raw, list) or len(raw) < 3:
            raise ValueError(f"{treatment_id}: footprintM needs at least three points")
        polygon: list[tuple[float, float]] = []
        for point in raw:
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError(f"{treatment_id}: every footprint point must be [x, z]")
            x, z = point
            if (isinstance(x, bool) or isinstance(z, bool)
                    or not isinstance(x, (int, float)) or not isinstance(z, (int, float))
                    or not math.isfinite(x) or not math.isfinite(z)):
                raise ValueError(f"{treatment_id}: footprint coordinates must be finite numbers")
            polygon.append((float(x), float(z)))
        polygons.append(polygon)
    return polygons


def _points_in_polygon(x: np.ndarray, z: np.ndarray,
                       polygon: list[tuple[float, float]]) -> np.ndarray:
    """Even/odd containment at texel centres; boundary proximity is handled
    by the segment-distance pass below, so its exact inclusion is immaterial."""
    inside = np.zeros(np.broadcast_shapes(x.shape, z.shape), dtype=bool)
    px, pz = polygon[-1]
    for qx, qz in polygon:
        crosses = ((qz > z) != (pz > z))
        x_cross = (px - qx) * (z - qz) / (pz - qz + 1e-300) + qx
        inside ^= crosses & (x < x_cross)
        px, pz = qx, qz
    return inside


def _distance_to_polygon(x: np.ndarray, z: np.ndarray,
                         polygon: list[tuple[float, float]]) -> np.ndarray:
    distance2 = np.full(np.broadcast_shapes(x.shape, z.shape), np.inf, dtype=np.float64)
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
    distance = np.sqrt(distance2)
    distance[_points_in_polygon(x, z, polygon)] = 0.0
    return distance


def settlement_coverage(shape: tuple[int, int],
                        polygons: Iterable[list[tuple[float, float]]],
                        *, extent_m: float = PROVINCE_EXTENT_M,
                        yard_apron_m: float = YARD_APRON_M,
                        edge_blend_m: float = EDGE_BLEND_M) -> tuple[np.ndarray, np.ndarray]:
    """Return union distance and affected mask without allocating a province
    sized coordinate mesh per polygon.  World X maps to columns and southward
    world Z maps to rows."""
    height, width = shape
    if height <= 0 or width <= 0 or extent_m <= 0 or yard_apron_m < 0 or edge_blend_m <= 0:
        raise ValueError("invalid raster extent or treatment widths")
    metres_x = extent_m / width
    metres_z = extent_m / height
    reach = yard_apron_m + edge_blend_m
    union_distance = np.full(shape, np.inf, dtype=np.float32)
    for polygon in polygons:
        min_x = max(0, math.floor((min(p[0] for p in polygon) - reach) / metres_x))
        max_x = min(width - 1, math.floor((max(p[0] for p in polygon) + reach) / metres_x))
        min_z = max(0, math.floor((min(p[1] for p in polygon) - reach) / metres_z))
        max_z = min(height - 1, math.floor((max(p[1] for p in polygon) + reach) / metres_z))
        if min_x > max_x or min_z > max_z:
            continue
        xs = (np.arange(min_x, max_x + 1, dtype=np.float64) + 0.5) * metres_x
        zs = (np.arange(min_z, max_z + 1, dtype=np.float64) + 0.5) * metres_z
        distance = _distance_to_polygon(xs[None, :], zs[:, None], polygon)
        target = union_distance[min_z:max_z + 1, min_x:max_x + 1]
        np.minimum(target, distance, out=target)
    return union_distance, union_distance <= reach


def paint_ground_control(control: np.ndarray, open_water: np.ndarray,
                         polygons: Iterable[list[tuple[float, float]]],
                         *, extent_m: float = PROVINCE_EXTENT_M,
                         yard_apron_m: float = YARD_APRON_M,
                         edge_blend_m: float = EDGE_BLEND_M) -> tuple[np.ndarray, dict]:
    """Pure deterministic paint operation used by the CLI and unit tests."""
    if control.dtype != np.uint8 or control.ndim != 3 or control.shape[2] != 4:
        raise ValueError("ground control must be an HxWx4 uint8 raster")
    if open_water.shape != control.shape[:2] or open_water.dtype != np.bool_:
        raise ValueError("open-water mask must be bool and match ground control")
    distance, candidate = settlement_coverage(
        control.shape[:2], polygons, extent_m=extent_m,
        yard_apron_m=yard_apron_m, edge_blend_m=edge_blend_m)
    paintable = candidate & ~open_water
    changed = paintable & (control[..., 0] != BUILT_GROUND_MATERIAL_ID)
    result = control.copy()
    previous_primary = result[..., 0].copy()
    # Reassert the whole treatment, including pixels already PATH but carrying
    # a stale edge weight from an earlier paint. Only replace the secondary
    # with the old primary where the primary actually changes.
    result[..., 0][paintable] = BUILT_GROUND_MATERIAL_ID
    result[..., 1][changed] = previous_primary[changed]
    weight = np.clip((distance - yard_apron_m) / edge_blend_m, 0.0, 1.0)
    result[..., 2][paintable] = np.rint(weight[paintable] * 255.0).astype(np.uint8)
    stats = {
        "candidateTexels": int(candidate.sum()),
        "paintedTexels": int(paintable.sum()),
        "changedTexels": int(changed.sum()),
        "openWaterExcludedTexels": int((candidate & open_water).sum()),
        "coreTexels": int((paintable & (distance <= yard_apron_m)).sum()),
        "edgeTexels": int((paintable & (distance > yard_apron_m)).sum()),
    }
    return result, stats


def open_water_from_surface(surface: np.ndarray, meta: dict,
                            target_shape: tuple[int, int],
                            *, extent_m: float = PROVINCE_EXTENT_M) -> np.ndarray:
    """Decode current wetness from water-surface B and nearest-sample it at
    target texel centres using the water raster's documented registration."""
    if surface.dtype != np.uint8 or surface.ndim != 3 or surface.shape[2] < 3:
        raise ValueError("water surface must be an RGB/RGBA uint8 raster")
    spec = meta.get("surface")
    if not isinstance(spec, dict):
        raise ValueError("water meta has no surface contract")
    size = spec.get("size")
    mpp = spec.get("metresPerPixel")
    depth_min = spec.get("depthMinM", 0.0)
    depth_span = spec.get("depthSpanM", 25.5)
    if size != surface.shape[0] or surface.shape[0] != surface.shape[1]:
        raise ValueError("water surface dimensions do not match water meta")
    if not isinstance(mpp, (int, float)) or mpp <= 0:
        raise ValueError("water surface metresPerPixel must be positive")
    if abs(float(mpp) * int(size) - extent_m) > float(mpp) + 1e-6:
        raise ValueError("water surface extent does not match canonical province extent")
    depth = surface[..., 2].astype(np.float32) / 255.0 * float(depth_span) + float(depth_min)
    wet = depth > 0.0
    height, width = target_shape
    xs = np.clip(np.floor((np.arange(width) + 0.5) * (extent_m / width) / float(mpp)).astype(int),
                 0, surface.shape[1] - 1)
    zs = np.clip(np.floor((np.arange(height) + 0.5) * (extent_m / height) / float(mpp)).astype(int),
                 0, surface.shape[0] - 1)
    return wet[np.ix_(zs, xs)]


def _png_bytes(array: np.ndarray) -> bytes:
    stream = io.BytesIO()
    Image.fromarray(array, mode="RGBA").save(stream, format="PNG", optimize=False)
    return stream.getvalue()


def _stage_write(path: Path, data: bytes) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        return temporary
    except Exception:
        if os.path.exists(temporary):
            os.unlink(temporary)
        raise


def _publish_with_marker(content_path: Path, content: bytes,
                         marker_path: Path, marker: bytes) -> None:
    """Publish two staged files with the content-addressed marker last.

    The old marker is invalidated before content changes. A process death can
    therefore leave either the previous consistent pair, no marker, or the new
    consistent pair—never an old marker falsely certifying new bytes.
    """
    staged_content = _stage_write(content_path, content)
    staged_marker = _stage_write(marker_path, marker)
    invalidated_marker: str | None = None
    try:
        if marker_path.exists():
            fd, invalidated_marker = tempfile.mkstemp(
                prefix=f".{marker_path.name}.invalid.", dir=marker_path.parent)
            os.close(fd)
            os.unlink(invalidated_marker)
            os.replace(marker_path, invalidated_marker)
        os.replace(staged_content, content_path)
        staged_content = ""
        os.replace(staged_marker, marker_path)
        staged_marker = ""
        if invalidated_marker and os.path.exists(invalidated_marker):
            os.unlink(invalidated_marker)
    finally:
        for temporary in (staged_content, staged_marker):
            if temporary and os.path.exists(temporary):
                os.unlink(temporary)


def process_files(bundle_path: Path, control_path: Path, water_surface_path: Path,
                  water_meta_path: Path, provenance_path: Path, *,
                  expected_bundle: dict | None = None,
                  extent_m: float = PROVINCE_EXTENT_M) -> dict:
    """Validate all inputs and build both outputs before replacing either.

    ``expected_bundle`` is the freshly rebuilt exporter projection.  The CLI
    always supplies it; tests and other callers may supply an equivalent
    expected document without touching repository sources.
    """
    bundle_bytes = _read_bytes(bundle_path, "settlement bundle")
    bundle = _json_bytes(bundle_bytes, "settlement bundle")
    polygons = _validated_treatments(bundle)
    if expected_bundle is not None and _canonical(bundle) != _canonical(expected_bundle):
        raise ValueError("stale settlement bundle: it differs from the current compiler projection")

    control_bytes = _read_bytes(control_path, "ground-control raster")
    water_bytes = _read_bytes(water_surface_path, "water-surface raster")
    water_meta_bytes = _read_bytes(water_meta_path, "water metadata")
    try:
        control = np.asarray(Image.open(io.BytesIO(control_bytes)).convert("RGBA"), dtype=np.uint8)
        surface = np.asarray(Image.open(io.BytesIO(water_bytes)).convert("RGB"), dtype=np.uint8)
    except Exception as exc:
        raise ValueError("invalid input raster") from exc
    water_meta = _json_bytes(water_meta_bytes, "water metadata")
    open_water = open_water_from_surface(surface, water_meta, control.shape[:2], extent_m=extent_m)
    painted, stats = paint_ground_control(control, open_water, polygons, extent_m=extent_m)
    output_bytes = _png_bytes(painted)
    policy = {
        "builtGroundMaterialId": BUILT_GROUND_MATERIAL_ID,
        "yardApronM": YARD_APRON_M,
        "edgeBlendM": EDGE_BLEND_M,
        "provinceExtentM": extent_m,
        "registration": "texel centres; world x=east/column, z=south/row",
        "waterRule": "water-surface decoded signed depth > 0",
    }
    provenance = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": KIND,
        "inputs": {
            "settlementBundleSha256": _sha256(bundle_bytes),
            "groundControlSha256": _sha256(control_bytes),
            "waterSurfaceSha256": _sha256(water_bytes),
            "waterMetaSha256": _sha256(water_meta_bytes),
        },
        "policy": policy,
        "policySha256": _sha256(_canonical(policy)),
        "outputSha256": _sha256(output_bytes),
        "coverage": {**stats, "treatmentCount": len(polygons)},
    }
    provenance_bytes = _canonical(provenance)
    # Nothing on disk changes until every input, paint and manifest operation
    # above has completed successfully. The hash marker is replaced last and
    # is absent during the publication window, so consumers can fail closed.
    _publish_with_marker(control_path, output_bytes, provenance_path, provenance_bytes)
    return provenance


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, default=DEFAULT_BUNDLE)
    parser.add_argument("--ground-control", type=Path, default=DEFAULT_CONTROL)
    parser.add_argument("--water-surface", type=Path, default=DEFAULT_WATER_SURFACE)
    parser.add_argument("--water-meta", type=Path, default=DEFAULT_WATER_META)
    parser.add_argument("--provenance", type=Path, default=DEFAULT_PROVENANCE)
    args = parser.parse_args()
    try:
        # Import lazily: the pure raster helpers stay cheap and isolated in
        # tests, while the production command proves the exported bundle is
        # exactly the current compiler projection rather than trusting mtime.
        from .export_settlement_bundle import build_bundle
        expected = build_bundle()
        result = process_files(args.bundle, args.ground_control, args.water_surface,
                               args.water_meta, args.provenance,
                               expected_bundle=expected)
    except ValueError as exc:
        print(f"settlement_ground_control: {exc}")
        return 1
    coverage = result["coverage"]
    print("settlement_ground_control: "
          f"{coverage['paintedTexels']} painted, "
          f"{coverage['openWaterExcludedTexels']} water-excluded -> {args.ground_control}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
