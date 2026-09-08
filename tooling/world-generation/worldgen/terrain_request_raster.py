"""Apply typed terrain-request plans to an in-memory heightfield.

This is the deliberately prose-blind execution half of :mod:`terrain_requests`.
It validates the content-addressed plan before changing anything, resolves any
requested local axis from raster data, and applies the closed profile
vocabulary.  The caller owns file I/O and where in the terrain chain this runs.
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any

import numpy as np

from . import terrain_requests as tr
from .scale import RAW_M, SOURCE_GRID_SAMPLES, TERRAIN_SUPPORT_EXTENT_M


class TerrainRequestRasterError(ValueError):
    """The plan or raster cannot be executed without guessing."""


def _validate_raster_registration(shape: tuple[int, int], mps: float,
                                  authored_extent_m: float) -> None:
    """Distinguish production terrain support from the authored UV frame."""
    tolerance = max(1e-6, mps * 1e-6)
    raster_extents = ((shape[1] - 1) * mps, (shape[0] - 1) * mps)
    production = shape == (SOURCE_GRID_SAMPLES, SOURCE_GRID_SAMPLES) \
        and abs(mps - RAW_M) <= tolerance
    expected = TERRAIN_SUPPORT_EXTENT_M if production else authored_extent_m
    if any(abs(value - expected) > tolerance for value in raster_extents):
        label = "terrain support" if production else "plan coordinate extent"
        raise TerrainRequestRasterError(
            f"raster support {raster_extents} does not match {label} {expected}")


def _canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(value: object) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


WITNESS_SAMPLES = 64


def _witness_candidates(delta: np.ndarray, x0: int, z0: int) -> list[tuple[int, int, float]]:
    """Return up to 64 spatially distributed, high-signal terrain samples.

    Selecting only the 64 largest values clusters witnesses on the feature's
    centre and lets a later stage erase an end, side, or repeated lobe without
    detection.  Row-major spatial strata cover the whole affected footprint;
    the strongest sample in each stratum avoids fragile near-zero boundaries.
    """
    affected = np.flatnonzero(np.abs(delta).ravel() > 1e-9)
    if not affected.size:
        return []
    rows: list[tuple[int, int, float]] = []
    for stratum in np.array_split(affected, min(WITNESS_SAMPLES, int(affected.size))):
        magnitudes = np.abs(delta).ravel()[stratum]
        flat_index = int(stratum[int(np.argmax(magnitudes))])
        z, x = np.unravel_index(flat_index, delta.shape)
        rows.append((z0 + int(z), x0 + int(x), float(delta[z, x])))
    return sorted(rows, key=lambda row: (-abs(row[2]), row[0], row[1]))


def _smoothstep01(value: np.ndarray) -> np.ndarray:
    value = np.clip(value, 0.0, 1.0)
    return value * value * (3.0 - 2.0 * value)


def _plateau(distance: np.ndarray, inner: float) -> np.ndarray:
    return 1.0 - _smoothstep01((distance - inner) / max(1e-6, 1.0 - inner))


def _normalise(x: float, z: float) -> tuple[float, float]:
    length = math.hypot(x, z)
    if not math.isfinite(length) or length < 1e-9:
        return 1.0, 0.0
    return x / length, z / length


def _local_downslope(height: np.ndarray, x: int, z: int, mps: float) -> tuple[float, float]:
    """Return a stable local downslope vector, with east as the flat fallback."""
    x0, x1 = max(0, x - 2), min(height.shape[1] - 1, x + 2)
    z0, z1 = max(0, z - 2), min(height.shape[0] - 1, z + 2)
    dx = float(height[z, x1] - height[z, x0]) / max(mps, (x1 - x0) * mps)
    dz = float(height[z1, x] - height[z0, x]) / max(mps, (z1 - z0) * mps)
    return _normalise(-dx, -dz)


def _nearest_wet_axis(
    wet: np.ndarray, x: int, z: int, fallback: tuple[float, float]
) -> tuple[tuple[float, float], str]:
    """Find the exact nearest wet sample without allocating a province distance field."""
    height, width = wet.shape
    maximum = max(width, height)
    radius = 8
    while True:
        x0, x1 = max(0, x - radius), min(width, x + radius + 1)
        z0, z1 = max(0, z - radius), min(height, z + radius + 1)
        local_z, local_x = np.nonzero(wet[z0:z1, x0:x1])
        if local_x.size:
            local_x = local_x.astype(np.int64) + x0
            local_z = local_z.astype(np.int64) + z0
            distance2 = (local_x - x) ** 2 + (local_z - z) ** 2
            order = np.lexsort((local_x, local_z, distance2))
            target_x, target_z = int(local_x[order[0]]), int(local_z[order[0]])
            full_coverage = x0 == 0 and z0 == 0 and x1 == width and z1 == height
            # Outside an unclipped square the nearest possible sample is more
            # than ``radius`` away.  A corner hit can be farther than that, so
            # keep expanding until the current winner is provably global.
            if full_coverage or int(distance2[order[0]]) <= radius * radius:
                if target_x != x or target_z != z:
                    return _normalise(target_x - x, target_z - z), "nearest-water-path"
                return fallback, "local-gradient-fallback"
        if x0 == 0 and z0 == 0 and x1 == width and z1 == height:
            return fallback, "local-gradient-fallback"
        radius = min(maximum, radius * 2)


def _resolve_axis(
    operation: dict, height: np.ndarray, mps: float,
    flow: np.ndarray | None, wet: np.ndarray | None,
) -> tuple[tuple[float, float], str]:
    cx = int(np.clip(round(float(operation["centerM"][0]) / mps), 0, height.shape[1] - 1))
    cz = int(np.clip(round(float(operation["centerM"][1]) / mps), 0, height.shape[0] - 1))
    downslope = _local_downslope(height, cx, cz, mps)
    resolver = operation["axisResolver"]
    orientation = operation["parameters"]["delivery"].get("orientation")
    bearings = {
        "east": (1.0, 0.0), "south-east": (math.sqrt(0.5), math.sqrt(0.5)),
        "south": (0.0, 1.0), "south-west": (-math.sqrt(0.5), math.sqrt(0.5)),
        "west": (-1.0, 0.0), "north-west": (-math.sqrt(0.5), -math.sqrt(0.5)),
        "north": (0.0, -1.0), "north-east": (math.sqrt(0.5), -math.sqrt(0.5)),
    }
    if orientation in bearings:
        return bearings[orientation], "authored-orientation"
    if orientation == "downslope":
        return downslope, "authored-downslope"
    if orientation == "contour":
        return (-downslope[1], downslope[0]), "authored-contour"
    if orientation == "flow":
        resolver = "local-flow"
    elif orientation == "waterward":
        resolver = "nearest-water-path"
    if resolver == "none":
        return (1.0, 0.0), "none"
    if resolver == "local-gradient":
        return downslope, "local-gradient"
    if resolver == "local-contour":
        return (-downslope[1], downslope[0]), "local-contour"
    if resolver == "local-flow":
        if flow is not None:
            radius = max(1, int(round(float(operation["radiusM"]) * 0.15 / mps)))
            z0, z1 = max(0, cz - radius), min(height.shape[0], cz + radius + 1)
            x0, x1 = max(0, cx - radius), min(height.shape[1], cx + radius + 1)
            local = flow[z0:z1, x0:x1]
            vector = np.mean(local.reshape(-1, 2), axis=0, dtype=np.float64)
            if float(np.linalg.norm(vector)) >= 1e-9:
                return _normalise(float(vector[0]), float(vector[1])), "local-flow"
        return downslope, "local-gradient-fallback"
    if resolver == "nearest-water-path":
        if wet is not None and np.any(wet):
            return _nearest_wet_axis(wet, cx, cz, downslope)
        return downslope, "local-gradient-fallback"
    raise TerrainRequestRasterError(f"{operation['id']}: unknown axisResolver {resolver!r}")


def _profile_weight(profile: str, x: np.ndarray, z: np.ndarray, parameters: dict) -> np.ndarray:
    """Evaluate one compact-support profile in radius-normalised coordinates."""
    delivery = parameters["delivery"]
    # Authored dimensions are full feature dimensions within the request's
    # compact support. Shorter requested features contract rather than bleed
    # beyond radius; categorical hydraulic constraints change cross-section.
    radius_m = float(parameters["radiusM"])
    length_scale = min(1.0, float(delivery.get("lengthM", 2.0 * radius_m)) / (2.0 * radius_m))
    capacity_scale = {"person-only": 0.12, "stream": 0.18, "poled-skiff": 0.28,
                      "laden-landing": 0.32, "punt": 0.38, "sub-house": 0.42,
                      "sea-going-hull": 0.58}.get(delivery.get("capacity"), 1.0)
    access_scale = {"climb-only": 0.16, "causeway-only": 0.22,
                    "one-landing": 0.28, "boat-landing": 0.34,
                    "poling": 0.42, "swimming": 0.52}.get(delivery.get("access"), 1.0)
    width_scale = min(1.0, float(delivery.get("widthM", 2.0 * radius_m)) / (2.0 * radius_m)) \
        * capacity_scale * access_scale
    bank_scale = {"hard": 0.72, "root-walled": 0.72, "rock-nose": 0.78,
                  "firm": 0.86, "steep": 0.82, "natural": 1.0, "shelving": 1.18}.get(
                      delivery.get("bank"), 1.0)
    current_scale = {"lethal-wet-season": 0.65, "swift": 0.75, "flowing": 0.9,
                     "tidal": 0.95, "slow": 1.1, "slack": 1.2,
                     "standing": 1.25}.get(delivery.get("current"), 1.0)
    offset = float(delivery.get("offsetBoatLengths", 0.0)) * 8.0 / radius_m
    length_scale = min(length_scale, max(1e-6, 1.0 - abs(offset)))
    x = (x - offset) / max(length_scale, 1e-6)
    z = z / max(width_scale * bank_scale * current_scale, 1e-6)
    r = np.hypot(x, z)
    inside = r <= 1.0
    falloff = float(parameters["falloffFraction"])
    inner = 1.0 - falloff

    if profile == "rounded-mound":
        weight = np.maximum(0.0, 1.0 - r * r) ** 2
    elif profile == "flat-top-mound":
        weight = _plateau(r, float(parameters["topRadiusFraction"])) ** 0.75
    elif profile == "flat-top-island":
        edge = _plateau(r, float(parameters["topRadiusFraction"]))
        weight = edge * (0.88 + 0.12 * np.maximum(0.0, 1.0 - r))
    elif profile == "radial-bowl":
        weight = _plateau(r, float(parameters["floorRadiusFraction"]))
    elif profile == "radial-basin":
        floor = float(parameters["floorRadiusFraction"])
        weight = _plateau(r, floor) ** 1.35
    elif profile == "steep-rim-bowl":
        base = _plateau(r, float(parameters["floorRadiusFraction"]))
        weight = np.sqrt(base)
    elif profile == "downslope-aperture":
        forward = np.clip((x + 0.20) / 1.20, 0.0, 1.0)
        half_width = float(parameters["floorWidthFraction"]) * (0.55 + 0.75 * forward)
        weight = _plateau(np.abs(z) / np.maximum(half_width, 1e-6), 0.28) \
            * _plateau(np.abs(x - 0.32) / 0.72, 0.55)
    elif profile == "contour-shelf":
        width = float(parameters["shelfWidthFraction"])
        cross = _plateau(np.abs(z - 0.12) / max(width, 1e-6), 0.45)
        weight = cross * _plateau(np.abs(x), 0.62)
    elif profile == "one-sided-cliff-bench":
        # ``x`` points downhill. Keep a broad, level shelf at and behind the
        # authored centre, then shed the requested height over a short forward
        # face. This is distinct from ``contour-shelf``, which only cuts a
        # standing natural wall; an explicitly elevated bench must create the
        # wall when the macro solve could not supply one.
        width = float(parameters["shelfWidthFraction"])
        face_start = float(parameters["faceStartFraction"])
        face_end = float(parameters["faceEndFraction"])
        lateral = _plateau(np.abs(z) / max(width, 1e-6), 0.30)
        face = 1.0 - _smoothstep01((x - face_start) / max(face_end - face_start, 1e-6))
        weight = lateral * face
    elif profile == "channel-link":
        bed = float(parameters["bedWidthFraction"])
        cross = _plateau(np.abs(z) / max(bed, 1e-6), 0.20)
        along = _plateau(np.abs(x - 0.36) / 0.64, 0.78)
        weight = cross * along
    elif profile == "channel-bed-sill":
        crest = float(parameters["crestWidthFraction"])
        weight = _plateau(np.abs(x) / max(crest, 1e-6), 0.18) \
            * _plateau(np.abs(z), 0.62)
    elif profile == "gradient-aligned-trench":
        floor = float(parameters["floorWidthFraction"])
        weight = _plateau(np.abs(z) / max(floor, 1e-6), 0.32) \
            * _plateau(np.abs(x), 0.76)
    elif profile == "contour-embankment":
        crest = float(parameters["crestWidthFraction"])
        weight = _plateau(np.abs(z) / max(crest, 1e-6), 0.15) \
            * _plateau(np.abs(x), 0.72)
    elif profile == "paired-channel-banks":
        opening = float(parameters["openWidthFraction"])
        bank_offset = min(0.82, opening + 0.24)
        bank_width = max(0.10, (1.0 - opening) * 0.24)
        banks = np.maximum(
            _plateau(np.abs(z - bank_offset) / bank_width, 0.18),
            _plateau(np.abs(z + bank_offset) / bank_width, 0.18),
        )
        weight = banks * _plateau(np.abs(x), 0.66)
    elif profile == "spring-head-bowl":
        bowl = _plateau(r / 0.48, 0.38)
        outlet = _plateau(np.abs(z) / float(parameters["outletWidthFraction"]), 0.12) \
            * _plateau(np.abs(x - 0.46) / 0.54, 0.74)
        weight = np.maximum(bowl, outlet * 0.72)
    elif profile == "contour-steps":
        count = int(parameters["stepCount"])
        bench = float(parameters["benchWidthFraction"])
        across = np.clip((z + 1.0) * 0.5, 0.0, 1.0)
        steps = np.floor(across * count + 1e-9) / count
        # Narrow softened joins distinguish real benches from a smooth ramp.
        phase = np.mod(across * count, 1.0)
        joins = _smoothstep01(np.minimum(phase, 1.0 - phase) / max(bench, 1e-6))
        weight = steps * (0.76 + 0.24 * joins) * _plateau(np.abs(x), 0.66)
    else:
        raise TerrainRequestRasterError(f"unknown terrain profile {profile!r}")
    # The kind policy's common falloff is an outer radial envelope.  Profile
    # parameters shape the authored feature inside it; this envelope guarantees
    # every operation meets unchanged terrain continuously at its radius.
    weight *= _plateau(r, inner)
    along_count = max(int(delivery.get(name, 1)) for name in ("crossingsMin", "ledgeCount"))
    across_count = max(int(delivery.get(name, 1)) for name in
                       ("featureCount", "isletCount", "connectionCount", "sides"))
    # Crossings/ledges repeat along the resolved axis; distinct channels,
    # islets and connected features repeat across it. Zero-valued joins make
    # cardinality geometric rather than a metadata-only promise.
    if along_count > 1:
        phase = (x + 1.0) * 0.5 * along_count
        weight *= np.sin(np.pi * np.clip(np.mod(phase, 1.0), 0.0, 1.0)) ** 2
    if across_count > 1:
        phase = (z + 1.0) * 0.5 * across_count
        weight *= np.sin(np.pi * np.clip(np.mod(phase, 1.0), 0.0, 1.0)) ** 2
    return np.where(inside, np.clip(weight, 0.0, 1.0), 0.0)


def _validate_plan(plan: dict) -> None:
    errors: list[str] = []
    if plan.get("schemaVersion") != tr.SCHEMA_VERSION:
        errors.append(f"plan schemaVersion must be {tr.SCHEMA_VERSION}")
    if plan.get("kind") != "terrain-request-plan":
        errors.append("plan kind must be 'terrain-request-plan'")
    payload_keys = ("extentM", "sourceDigest", "policyDigest", "requests", "operations")
    if all(key in plan for key in payload_keys):
        payload = {key: plan[key] for key in payload_keys}
        if _digest(payload) != plan.get("planDigest"):
            errors.append("planDigest does not match the exact operation document")
    else:
        errors.append("plan is missing content-addressed payload fields")

    requests = plan.get("requests")
    operations = plan.get("operations")
    extent = plan.get("extentM")
    if isinstance(extent, bool) or not isinstance(extent, (int, float)) \
            or not math.isfinite(extent) or extent <= 0:
        errors.append("plan extentM must be finite and positive")
    if not isinstance(requests, list) or not isinstance(operations, list):
        errors.append("plan requests and operations must be lists")
    else:
        source_rows = [{"id": row.get("id"), "placeId": row.get("placeId"),
                        "kind": row.get("kind"), "sourcePath": row.get("sourcePath")}
                       for row in requests if isinstance(row, dict)]
        if len(source_rows) != len(requests) or _digest(source_rows) != plan.get("sourceDigest"):
            errors.append("sourceDigest does not match the exact request rows")
        policy_document = {
            kind: {
                "action": spec.action, "profile": spec.profile, "deltaM": spec.deltaM,
                "falloffFraction": spec.falloffFraction, "axisResolver": spec.axisResolver,
                "parameters": dict(spec.parameters),
            }
            for kind, spec in sorted(tr.KIND_SPECS.items())
        }
        if _digest(policy_document) != plan.get("policyDigest"):
            errors.append("policyDigest does not match the executable terrain policy")
        operation_ids = [row.get("id") for row in operations if isinstance(row, dict)]
        if len(operation_ids) != len(operations) or len(set(operation_ids)) != len(operation_ids):
            errors.append("operation ids must be present and unique")
        expected = [operation_id for request in requests if isinstance(request, dict)
                    for operation_id in request.get("operationIds", [])]
        missing = sorted(set(expected) - set(operation_ids))
        stale = sorted(set(operation_ids) - set(expected))
        if missing:
            errors.append(f"missing planned operations {missing}")
        if stale:
            errors.append(f"stale unreferenced operations {stale}")
        if len(expected) != len(operation_ids):
            errors.append("request operationIds must cover every operation exactly once")
        for operation in operations:
            if not isinstance(operation, dict):
                continue
            kind = next((request.get("kind") for request in requests
                         if isinstance(request, dict) and request.get("id") == operation.get("requestId")), None)
            spec = tr.KIND_SPECS.get(kind)
            if spec is None:
                errors.append(f"{operation.get('id')}: request kind is missing or unknown")
                continue
            request = next((row for row in requests if isinstance(row, dict)
                            and row.get("id") == operation.get("requestId")), {})
            delivery = request.get("delivery", {})
            expected_parameters = {
                "deltaM": tr.delivery_delta(spec, delivery),
                "falloffFraction": spec.falloffFraction, **dict(spec.parameters),
                "delivery": delivery,
            }
            if (operation.get("action"), operation.get("profile"), operation.get("axisResolver")) != \
                    (spec.action, spec.profile, spec.axisResolver):
                errors.append(f"{operation.get('id')}: operation policy does not match kind {kind!r}")
            if operation.get("parameters") != expected_parameters:
                errors.append(f"{operation.get('id')}: operation parameters do not match kind {kind!r}")
            center = operation.get("centerM")
            radius = operation.get("radiusM")
            if not isinstance(center, list) or len(center) != 2 or any(
                    isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
                    for v in center):
                errors.append(f"{operation.get('id')}: centerM must contain two finite coordinates")
            if isinstance(radius, bool) or not isinstance(radius, (int, float)) \
                    or not math.isfinite(radius) or radius <= 0:
                errors.append(f"{operation.get('id')}: radiusM must be finite and positive")
            if isinstance(center, list) and len(center) == 2 and isinstance(radius, (int, float)) \
                    and not isinstance(radius, bool) and math.isfinite(radius) and radius > 0 \
                    and isinstance(extent, (int, float)) and not isinstance(extent, bool) \
                    and math.isfinite(extent) and extent > 0:
                expected_bounds = {
                    "minXM": round(max(0.0, float(center[0]) - float(radius)), 3),
                    "minZM": round(max(0.0, float(center[1]) - float(radius)), 3),
                    "maxXM": round(min(float(extent), float(center[0]) + float(radius)), 3),
                    "maxZM": round(min(float(extent), float(center[1]) + float(radius)), 3),
                }
                if operation.get("boundsM") != expected_bounds:
                    errors.append(f"{operation.get('id')}: boundsM does not match center, radius and extent")
    if errors:
        raise TerrainRequestRasterError("; ".join(errors))


def apply_plan(
    height_m: np.ndarray,
    plan: dict,
    metres_per_sample: float,
    *,
    flow_vectors: np.ndarray | None = None,
    wet_mask: np.ndarray | None = None,
) -> tuple[np.ndarray, dict, list[dict[str, Any]]]:
    """Apply every plan operation and return ``(height, manifest, stats)``.

    ``flow_vectors[..., 0:2]`` are +X/+Z vectors.  Raster rows increase toward
    +Z, matching province UV convention.  No input array is mutated.
    """
    _validate_plan(plan)
    height = np.asarray(height_m)
    if height.ndim != 2 or not np.issubdtype(height.dtype, np.floating) or not np.all(np.isfinite(height)):
        raise TerrainRequestRasterError("height_m must be a finite 2D floating-point raster")
    if isinstance(metres_per_sample, bool) or not isinstance(metres_per_sample, (int, float)) \
            or not math.isfinite(metres_per_sample) or metres_per_sample <= 0:
        raise TerrainRequestRasterError("metres_per_sample must be finite and positive")
    mps = float(metres_per_sample)
    extent = float(plan["extentM"])
    _validate_raster_registration(height.shape, mps, extent)

    flow = None if flow_vectors is None else np.asarray(flow_vectors)
    if flow is not None and (flow.shape != height.shape + (2,) or not np.all(np.isfinite(flow))):
        raise TerrainRequestRasterError("flow_vectors must be finite and have shape height_m.shape + (2,)")
    wet = None if wet_mask is None else np.asarray(wet_mask)
    if wet is not None and (wet.shape != height.shape or wet.dtype.kind != "b"):
        raise TerrainRequestRasterError("wet_mask must be boolean and match height_m.shape")

    # Compose compatible layered operations deliberately. Positive landforms
    # establish their mass first; cuts, shelves and pools are then cut into
    # that finished mass. Summing every delta against the original raster made
    # an islet and its landing ledge cancel one another while still claiming
    # that both operations had run.
    result = height.astype(np.result_type(height.dtype, np.float32), copy=True)
    stats: list[dict[str, Any]] = []
    witness_records: dict[str, list[dict[str, float | int]]] = {}
    operations = sorted(plan["operations"], key=lambda row: (row["action"] != "raise", row["id"]))
    for operation in operations:
        (axis_x, axis_z), axis_source = _resolve_axis(operation, result, mps, flow, wet)
        center_x, center_z = map(float, operation["centerM"])
        radius = float(operation["radiusM"])
        x0 = max(0, int(math.floor((center_x - radius) / mps)))
        x1 = min(height.shape[1] - 1, int(math.ceil((center_x + radius) / mps)))
        z0 = max(0, int(math.floor((center_z - radius) / mps)))
        z1 = min(height.shape[0] - 1, int(math.ceil((center_z + radius) / mps)))
        world_x = np.arange(x0, x1 + 1, dtype=np.float64) * mps - center_x
        world_z = np.arange(z0, z1 + 1, dtype=np.float64) * mps - center_z
        dx, dz = np.meshgrid(world_x, world_z)
        along = (dx * axis_x + dz * axis_z) / radius
        across = (-dx * axis_z + dz * axis_x) / radius
        profile_parameters = {**operation["parameters"], "radiusM": radius}
        weight = _profile_weight(operation["profile"], along, across, profile_parameters)
        sign = -1.0 if operation["action"] == "carve" else 1.0
        delta = sign * float(operation["parameters"]["deltaM"]) * weight
        before = result[z0:z1 + 1, x0:x1 + 1].copy()
        result[z0:z1 + 1, x0:x1 + 1] += delta.astype(result.dtype, copy=False)
        affected = np.abs(delta) > 1e-9
        delta_hash = hashlib.sha256(np.ascontiguousarray(delta, dtype="<f4").tobytes()).hexdigest()
        witnesses = []
        for z, x, individual_delta in _witness_candidates(delta, x0, z0):
            local_z, local_x = z - z0, x - x0
            witnesses.append({
                "x": x, "z": z,
                "baseHeightM": round(float(before[local_z, local_x]), 6),
                "appliedDeltaM": round(float(result[z, x] - before[local_z, local_x]), 6),
                "operationDeltaM": round(individual_delta, 6),
            })
        witness_records[operation["id"]] = witnesses
        values = delta[affected]
        stats.append({
            "operationId": operation["id"],
            "requestId": operation["requestId"],
            "profile": operation["profile"],
            "action": operation["action"],
            "axis": [round(axis_x, 9), round(axis_z, 9)],
            "axisSource": axis_source,
            "delivery": operation["parameters"]["delivery"],
            "deliverySha256": _digest(operation["parameters"]["delivery"]),
            "sampleBounds": {"minX": x0, "minZ": z0, "maxX": x1, "maxZ": z1},
            "affectedSamples": int(np.count_nonzero(affected)),
            "minDeltaM": float(np.min(values)) if values.size else 0.0,
            "maxDeltaM": float(np.max(values)) if values.size else 0.0,
            "meanAbsDeltaM": float(np.mean(np.abs(values))) if values.size else 0.0,
            "deltaSha256": delta_hash,
        })

    if not np.all(np.isfinite(result)):
        raise TerrainRequestRasterError("terrain operations produced non-finite heights")
    evidence_by_operation = {}
    stats_by_operation = {row["operationId"]: row for row in stats}
    for operation in plan["operations"]:
        operation_id = operation["id"]
        witnesses = witness_records[operation_id]
        evidence = {
            "operationId": operation_id,
            "deliverySha256": _digest(operation["parameters"]["delivery"]),
            "deltaSha256": stats_by_operation[operation_id]["deltaSha256"],
            "axis": stats_by_operation[operation_id]["axis"],
            "axisSource": stats_by_operation[operation_id]["axisSource"],
            "profile": operation["profile"],
            "action": operation["action"],
            "coveredFields": sorted(operation["parameters"]["delivery"]),
            "witnesses": witnesses,
        }
        evidence["evidenceSha256"] = _digest(evidence)
        evidence_by_operation[operation_id] = evidence
    manifest = {
        "schemaVersion": tr.FULFILLMENT_SCHEMA_VERSION,
        "kind": "terrain-request-fulfillments",
        "sourceDigest": plan["sourceDigest"],
        "planDigest": plan["planDigest"],
        "fulfillments": [
            {
                "requestId": request["id"],
                "operationIds": request["operationIds"],
                "evidenceRefs": [f"terrain-operation-evidence.{operation_id}.sha256."
                                 f"{evidence_by_operation[operation_id]['evidenceSha256']}"
                                 for operation_id in request["operationIds"]],
                "operationEvidence": [evidence_by_operation[operation_id]
                                      for operation_id in request["operationIds"]],
                "deliverySha256": tr.delivery_digest(request["delivery"]),
            }
            for request in plan["requests"]
        ],
    }
    manifest_errors = tr.verify_fulfillment_manifest(plan, manifest)
    if manifest_errors:
        raise TerrainRequestRasterError("invalid generated fulfillment manifest: " + "; ".join(manifest_errors))
    return result, manifest, stats
