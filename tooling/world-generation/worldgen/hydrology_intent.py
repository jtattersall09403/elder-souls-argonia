"""Compile typed terrain promises into pre-water hydrology intent.

This layer deliberately runs before terrain refinement and water publication.
It consumes only authored catalogue requests, named water-target geometry and
authored minor-waterway centrelines; it never reads a water raster or a
generated route.  Consumers can therefore carve the intent first and then use
the resulting terrain to compile water without a terrain/water circularity.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Iterable

from . import catalogue, terrain_requests
from .scale import PROVINCE_EXTENT_M

SCHEMA_VERSION = 1
AUTHORED_WATERWAYS_PATH = (
    catalogue.REPO_ROOT / "world" / "sources" / "routes" / "authored-minor-waterways.json"
)
WATER_KINDS = {"pool", "spring", "cut"}
WATER_RELATIONS = {"channel-linked", "channel-edge", "waterward-outlet"}
WATER_FIELDS = {"depthM", "depthClass", "current"}
ORIENTATION_VECTOR = {
    "north": (0.0, -1.0), "north-east": (math.sqrt(0.5), -math.sqrt(0.5)),
    "east": (1.0, 0.0), "south-east": (math.sqrt(0.5), math.sqrt(0.5)),
    "south": (0.0, 1.0), "south-west": (-math.sqrt(0.5), math.sqrt(0.5)),
    "west": (-1.0, 0.0), "north-west": (-math.sqrt(0.5), -math.sqrt(0.5)),
}


def _canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(value: object) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def is_water_bearing(request: dict) -> bool:
    delivery = request.get("delivery") or {}
    return (request.get("kind") in WATER_KINDS
            or delivery.get("waterRelation") in WATER_RELATIONS
            or any(field in delivery for field in WATER_FIELDS))


def _point(value: object, label: str, errors: list[str]) -> list[float] | None:
    if not isinstance(value, list) or len(value) != 2 or any(
            isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
            for v in value):
        errors.append(f"{label} must be [finite xM, finite zM]")
        return None
    return [round(float(value[0]), 3), round(float(value[1]), 3)]


def normalise_water_targets(rows: Iterable[dict]) -> tuple[dict[str, dict], list[str]]:
    """Validate named, pre-existing water geometry supplied by the caller."""
    out: dict[str, dict] = {}
    errors: list[str] = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(f"waterTargets[{index}] must be an object")
            continue
        target_id = row.get("id")
        if not isinstance(target_id, str) or not target_id:
            errors.append(f"waterTargets[{index}].id must be non-empty")
            continue
        if target_id in out:
            errors.append(f"duplicate water target {target_id}")
            continue
        points: list[list[float]] = []
        for point_index, value in enumerate(row.get("pointsM") or []):
            point = _point(value, f"water target {target_id}.pointsM[{point_index}]", errors)
            if point is not None:
                points.append(point)
        if not points:
            errors.append(f"water target {target_id} has no absolute geometry")
            continue
        out[target_id] = {"id": target_id, "pointsM": points,
                          "geometryDigest": _digest(points)}
    return out, errors


def _nearest_on_segment(point: list[float], a: list[float], b: list[float]) -> list[float]:
    dx, dz = b[0] - a[0], b[1] - a[1]
    denom = dx * dx + dz * dz
    if denom <= 1e-12:
        return list(a)
    t = max(0.0, min(1.0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / denom))
    return [round(a[0] + t * dx, 3), round(a[1] + t * dz, 3)]


def nearest_target_point(point: list[float], target: dict) -> tuple[list[float], float]:
    points = target["pointsM"]
    candidates = list(points)
    candidates.extend(_nearest_on_segment(point, a, b) for a, b in zip(points, points[1:]))
    candidates.sort(key=lambda p: (math.dist(point, p), p[0], p[1]))
    return candidates[0], math.dist(point, candidates[0])


def _axis_line(center: list[float], radius_m: float, delivery: dict) -> list[list[float]]:
    orientation = delivery.get("orientation")
    vector = ORIENTATION_VECTOR.get(orientation, (1.0, 0.0))
    length = float(delivery.get("lengthM", radius_m))
    half = min(radius_m, length / 2.0)
    return [[round(center[0] - vector[0] * half, 3), round(center[1] - vector[1] * half, 3)],
            [round(center[0] + vector[0] * half, 3), round(center[1] + vector[1] * half, 3)]]


def _radial_geometry(center: list[float], radius_m: float) -> dict:
    radius = min(radius_m, max(1.0, radius_m * 0.45))
    ring = [[round(center[0] + math.cos(i * math.tau / 16) * radius, 3),
             round(center[1] + math.sin(i * math.tau / 16) * radius, 3)]
            for i in range(16)]
    ring.append(list(ring[0]))
    return {"type": "radial-water-body", "centerM": center,
            "radiusM": round(radius, 3), "ringM": ring}


def compile_intents(records: Iterable[dict], water_targets: Iterable[dict],
                    bindings: dict[str, list[str]],
                    extent_m: float = PROVINCE_EXTENT_M) -> tuple[dict, list[str]]:
    """Return content-addressed absolute hydrology intent and hard errors.

    ``bindings`` maps the stable terrain-request id emitted by
    :mod:`terrain_requests` to named water target ids. A connection promise is
    invalid when its targets are absent, unknown, count-mismatched or beyond
    the request's authored radius/length reach.
    """
    records = list(records)
    plan, errors = terrain_requests.build_plan(records, extent_m)
    targets, target_errors = normalise_water_targets(water_targets)
    errors = list(errors) + target_errors
    if errors:
        return {}, errors
    operations = {row["requestId"]: row for row in plan["operations"]}
    intents: list[dict] = []
    known_request_ids = {row["id"] for row in plan["requests"]}
    extra_bindings = sorted(set(bindings) - known_request_ids)
    if extra_bindings:
        errors.append(f"bindings name unknown terrain requests {extra_bindings}")
    for request in plan["requests"]:
        if not is_water_bearing(request):
            continue
        request_id = request["id"]
        operation = operations[request_id]
        delivery = request["delivery"]
        center = list(operation["centerM"])
        radius = float(operation["radiusM"])
        relation = delivery.get("waterRelation")
        declared_count = delivery.get("connectionCount")
        needs_connection = declared_count is not None or relation in WATER_RELATIONS
        target_ids = bindings.get(request_id, [])
        if needs_connection and not target_ids:
            errors.append(f"{request_id}: water connection is underspecified; bind a named target")
            continue
        expected_count = int(declared_count) if declared_count is not None else (1 if needs_connection else 0)
        if len(target_ids) != expected_count:
            errors.append(f"{request_id}: promises {expected_count} connection(s) but binds {len(target_ids)}")
            continue
        if len(set(target_ids)) != len(target_ids):
            errors.append(f"{request_id}: duplicate water target bindings")
            continue
        connections: list[dict] = []
        lines: list[list[list[float]]] = []
        reach = max(radius, float(delivery.get("lengthM", 0.0)))
        for target_id in target_ids:
            target = targets.get(target_id)
            if target is None:
                errors.append(f"{request_id}: bound water target {target_id!r} does not exist")
                continue
            target_point, distance = nearest_target_point(center, target)
            if distance > reach + 1e-6:
                errors.append(f"{request_id}: target {target_id} is {distance:.1f} m away, beyond {reach:.1f} m reach")
                continue
            connections.append({"targetId": target_id, "atM": target_point,
                                "targetGeometryDigest": target["geometryDigest"]})
            lines.append([center, target_point])
        if len(connections) != len(target_ids):
            continue
        geometry = (_radial_geometry(center, radius)
                    if request["kind"] in {"pool", "spring"} and not connections
                    else {"type": "water-centreline", "linesM": lines or [_axis_line(center, radius, delivery)]})
        payload = {
            "requestId": request_id, "placeId": request["placeId"], "kind": request["kind"],
            "delivery": delivery, "geometry": geometry, "connections": connections,
            "boundsM": operation["boundsM"],
        }
        intents.append({"id": f"hydrology-intent.{_digest(payload)[:20]}",
                        **payload, "contentDigest": _digest(payload)})
    intents.sort(key=lambda row: row["id"])
    if errors:
        return {}, errors
    body = {"extentM": float(extent_m), "terrainPlanDigest": plan["planDigest"],
            "waterTargetDigest": _digest([targets[key] for key in sorted(targets)]),
            "intents": intents}
    return {"schemaVersion": SCHEMA_VERSION, "kind": "pre-water-hydrology-intent",
            **body, "documentDigest": _digest(body)}, []


def load_authored_minor_waterways(path: Path = AUTHORED_WATERWAYS_PATH,
                                  extent_m: float = PROVINCE_EXTENT_M) -> tuple[list[dict], list[str]]:
    """Load authored absolute centrelines without consulting published water."""
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [], [f"cannot load authored minor waterways: {exc}"]
    errors: list[str] = []
    out: list[dict] = []
    seen: set[str] = set()
    for index, row in enumerate(document.get("waterways") or []):
        route_id = row.get("id")
        if not isinstance(route_id, str) or not route_id or route_id in seen:
            errors.append(f"waterways[{index}].id must be unique and non-empty")
            continue
        seen.add(route_id)
        points: list[list[float]] = []
        for point_index, value in enumerate(row.get("pointsM") or []):
            point = _point(value, f"{route_id}.pointsM[{point_index}]", errors)
            if point is not None:
                if not 0 <= point[0] <= extent_m or not 0 <= point[1] <= extent_m:
                    errors.append(f"{route_id}.pointsM[{point_index}] lies outside the province")
                points.append(point)
        if len(points) < 2:
            errors.append(f"{route_id} needs at least two authored points")
            continue
        terminal = _point(row.get("terminalM"), f"{route_id}.terminalM", errors)
        if terminal is None or math.dist(points[-1], terminal) > 0.01:
            errors.append(f"{route_id} must end exactly at its authored terminal")
            continue
        target_ids = row.get("connectsTo")
        if not isinstance(target_ids, list) or not target_ids or any(
                not isinstance(value, str) or not value for value in target_ids):
            errors.append(f"{route_id}.connectsTo must name at least one water target")
            continue
        payload = {"id": route_id, "pointsM": points, "terminalM": terminal,
                   "terminalId": row.get("terminalId"), "connectsTo": target_ids,
                   "source": row.get("source")}
        out.append({**payload, "contentDigest": _digest(payload)})
    return sorted(out, key=lambda row: row["id"]), errors

