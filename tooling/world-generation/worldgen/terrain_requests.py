"""Compile catalogue ``terrainRequests`` into a deterministic terrain-work plan.

The catalogue describes *why* a landform is needed in ``note`` and describes
what must physically be delivered in its typed ``delivery`` contract. This
module never interprets the note: every request is resolved at its placed
catalogue position and expanded through the closed ``KIND_SPECS`` vocabulary.

The resulting operations deliberately stop short of editing a raster.  A later
``refine_province`` integration consumes their bounds, action, profile and
parameters, then emits a fulfillment manifest.  ``verify_fulfillment_manifest``
makes omission, stale work and partial execution hard failures.

Run from ``tooling/world-generation``::

    python3 -m worldgen.terrain_requests --check
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from dataclasses import dataclass
from typing import Iterable

from . import catalogue
from .scale import PROVINCE_EXTENT_M

SCHEMA_VERSION = 2
FULFILLMENT_SCHEMA_VERSION = 2

DELIVERY_FIELDS = {
    "feature", "featureCount", "depthM", "heightM", "widthM", "lengthM",
    "orientation", "bank", "current", "crossingsMin", "isletCount",
    "ledgeCount", "connectionCount", "sides", "waterRelation", "access",
    "depthClass", "heightClass", "capacity", "offsetBoatLengths",
}
ORIENTATIONS = {"north", "north-east", "east", "south-east", "south", "south-west", "west",
                "north-west", "downslope", "contour", "flow", "waterward"}
BANK_FORMS = {"natural", "firm", "hard", "shelving", "steep", "root-walled", "rock-nose"}
CURRENT_CLASSES = {"standing", "slack", "slow", "flowing", "swift", "lethal-wet-season", "tidal"}
WATER_RELATIONS = {
    "above-flood", "above-storm-water", "below-lake-bed", "channel-edge", "channel-linked",
    "flooded-to-rim", "open-water", "ringed-by-water", "standing-water", "underwater-entry",
    "water-over-threshold", "waterward-outlet",
}
ACCESS_FORMS = {"boat-landing", "causeway-only", "climb-only", "one-landing", "poling", "swimming"}
DEPTH_CLASSES = {"shallow", "navigable", "swimming", "diving", "dark-from-surface", "below-bed"}
HEIGHT_CLASSES = {"low", "flood-free", "storm-free", "tiered-roosts"}
CAPACITIES = {"person-only", "stream", "poled-skiff", "punt", "sea-going-hull", "laden-landing", "sub-house"}


@dataclass(frozen=True)
class KindSpec:
    """A prose-independent default for one closed terrain-request kind.

    ``deltaM`` is a positive magnitude. ``action`` supplies its direction.
    Profiles whose axis is not authored derive it from the named raster field;
    this is deterministic at integration time and avoids guessing an axis from
    the request's note.
    """

    action: str
    profile: str
    deltaM: float
    falloffFraction: float
    axisResolver: str
    parameters: tuple[tuple[str, object], ...] = ()


# These are implementation defaults, not numbers mined from request prose.
# Changing one is an explicit versioned terrain-policy change affecting every
# request of that kind. Radius always comes from the typed catalogue field.
KIND_SPECS: dict[str, KindSpec] = {
    "cave-mouth": KindSpec("carve", "downslope-aperture", 4.0, 0.30, "local-gradient",
                           (("floorWidthFraction", 0.24),)),
    "cliff-bench": KindSpec("carve", "contour-shelf", 2.5, 0.25, "local-contour",
                            (("shelfWidthFraction", 0.30),)),
    "cut": KindSpec("carve", "channel-link", 2.0, 0.35, "nearest-water-path",
                    (("bedWidthFraction", 0.12),)),
    "dry-rise": KindSpec("raise", "flat-top-mound", 2.5, 0.40, "none",
                         (("topRadiusFraction", 0.45),)),
    "ford": KindSpec("raise", "channel-bed-sill", 1.0, 0.25, "local-flow",
                     (("crestWidthFraction", 0.18),)),
    "gorge": KindSpec("carve", "gradient-aligned-trench", 8.0, 0.30, "local-gradient",
                      (("floorWidthFraction", 0.18),)),
    "hollow": KindSpec("carve", "radial-bowl", 2.5, 0.35, "none",
                       (("floorRadiusFraction", 0.28),)),
    "islet": KindSpec("raise", "flat-top-island", 3.0, 0.38, "none",
                      (("topRadiusFraction", 0.38),)),
    "knoll": KindSpec("raise", "rounded-mound", 4.0, 0.45, "none"),
    "levee": KindSpec("raise", "contour-embankment", 2.0, 0.30, "local-contour",
                      (("crestWidthFraction", 0.10),)),
    "narrows": KindSpec("raise", "paired-channel-banks", 2.0, 0.25, "local-flow",
                        (("openWidthFraction", 0.22),)),
    "pool": KindSpec("carve", "radial-basin", 3.0, 0.35, "none",
                     (("floorRadiusFraction", 0.32),)),
    "sinkhole": KindSpec("carve", "steep-rim-bowl", 9.0, 0.18, "none",
                         (("floorRadiusFraction", 0.16),)),
    "spring": KindSpec("carve", "spring-head-bowl", 1.5, 0.40, "local-gradient",
                       (("outletWidthFraction", 0.10),)),
    "terrace": KindSpec("carve", "contour-steps", 2.0, 0.20, "local-contour",
                        (("stepCount", 3), ("benchWidthFraction", 0.18))),
}

# These pairs ask the exact same point to be both a positive landform and a
# depression. Other combinations are allowed: real places intentionally layer
# a narrows with a pool, an islet with a landing bench, and a gorge with a cave.
CONTRADICTORY_KINDS = {
    frozenset((raised, carved))
    for raised in ("dry-rise", "knoll", "islet")
    for carved in ("sinkhole", "hollow", "gorge")
}


def _canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(value: object, length: int = 12) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()[:length]


def delivery_digest(delivery: dict) -> str:
    return hashlib.sha256(_canonical(delivery).encode("utf-8")).hexdigest()


def delivery_delta(spec: KindSpec, delivery: dict) -> float:
    explicit = delivery.get("depthM" if spec.action == "carve" else "heightM")
    if explicit is not None:
        return float(explicit)
    depth_factor = {"shallow": 0.5, "navigable": 0.85, "swimming": 1.15,
                    "diving": 1.5, "dark-from-surface": 2.0, "below-bed": 2.0}
    height_factor = {"low": 0.7, "flood-free": 1.2, "storm-free": 1.5,
                     "tiered-roosts": 1.5}
    factor = (depth_factor if spec.action == "carve" else height_factor).get(
        delivery.get("depthClass" if spec.action == "carve" else "heightClass"), 1.0)
    return spec.deltaM * factor


def _request_id(place_id: str, request: dict) -> str:
    return f"terrain-request.{place_id.removeprefix('place.')}.{request['kind']}.{_digest(request)}"


def _policy_document() -> dict:
    return {
        kind: {
            "action": spec.action, "profile": spec.profile, "deltaM": spec.deltaM,
            "falloffFraction": spec.falloffFraction, "axisResolver": spec.axisResolver,
            "parameters": dict(spec.parameters),
        }
        for kind, spec in sorted(KIND_SPECS.items())
    }


def _bounds(center_x: float, center_z: float, radius_m: float, extent_m: float) -> dict:
    return {
        "minXM": round(max(0.0, center_x - radius_m), 3),
        "minZM": round(max(0.0, center_z - radius_m), 3),
        "maxXM": round(min(extent_m, center_x + radius_m), 3),
        "maxZM": round(min(extent_m, center_z + radius_m), 3),
    }


def _request_errors(record: dict, index: int, request: object) -> list[str]:
    place_id = record.get("id", "<unknown>")
    prefix = f"{place_id}: terrainRequests[{index}]"
    if not isinstance(request, dict):
        return [f"{prefix} must be an object"]
    errors: list[str] = []
    kind = request.get("kind")
    if kind not in KIND_SPECS:
        errors.append(f"{prefix}.kind {kind!r} is unknown; expected one of {sorted(KIND_SPECS)}")
    radius = request.get("radiusM")
    if isinstance(radius, bool) or not isinstance(radius, (int, float)) \
            or not math.isfinite(radius) or radius <= 0:
        errors.append(f"{prefix}.radiusM must be a finite positive number")
    note = request.get("note")
    if not isinstance(note, str) or not note.strip():
        errors.append(f"{prefix}.note must be non-empty fulfillment evidence")
    delivery = request.get("delivery")
    if not isinstance(delivery, dict) or not delivery:
        errors.append(f"{prefix}.delivery must be a non-empty typed terrain contract")
    else:
        unknown = sorted(set(delivery) - DELIVERY_FIELDS)
        if unknown:
            errors.append(f"{prefix}.delivery has unknown fields {unknown}")
        feature = delivery.get("feature")
        if not isinstance(feature, str) or not feature or any(
                char not in "abcdefghijklmnopqrstuvwxyz0123456789-" for char in feature):
            errors.append(f"{prefix}.delivery.feature must be a non-empty kebab-case stable value")
        for field in ("featureCount", "crossingsMin", "isletCount", "ledgeCount", "connectionCount", "sides"):
            value = delivery.get(field)
            if value is not None and (isinstance(value, bool) or not isinstance(value, int) or value <= 0):
                errors.append(f"{prefix}.delivery.{field} must be a positive integer")
        for field in ("depthM", "heightM", "widthM", "lengthM", "offsetBoatLengths"):
            value = delivery.get(field)
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))
                                      or not math.isfinite(value) or value <= 0):
                errors.append(f"{prefix}.delivery.{field} must be a finite positive number")
        if delivery.get("depthM") is not None and delivery.get("heightM") is not None:
            errors.append(f"{prefix}.delivery cannot specify both depthM and heightM")
        if delivery.get("orientation") not in ORIENTATIONS | {None}:
            errors.append(f"{prefix}.delivery.orientation must be one of {sorted(ORIENTATIONS)}")
        if delivery.get("bank") not in BANK_FORMS | {None}:
            errors.append(f"{prefix}.delivery.bank must be one of {sorted(BANK_FORMS)}")
        if delivery.get("current") not in CURRENT_CLASSES | {None}:
            errors.append(f"{prefix}.delivery.current must be one of {sorted(CURRENT_CLASSES)}")
        if delivery.get("waterRelation") not in WATER_RELATIONS | {None}:
            errors.append(f"{prefix}.delivery.waterRelation must be one of {sorted(WATER_RELATIONS)}")
        if delivery.get("access") not in ACCESS_FORMS | {None}:
            errors.append(f"{prefix}.delivery.access must be one of {sorted(ACCESS_FORMS)}")
        if delivery.get("depthClass") not in DEPTH_CLASSES | {None}:
            errors.append(f"{prefix}.delivery.depthClass must be one of {sorted(DEPTH_CLASSES)}")
        if delivery.get("heightClass") not in HEIGHT_CLASSES | {None}:
            errors.append(f"{prefix}.delivery.heightClass must be one of {sorted(HEIGHT_CLASSES)}")
        if delivery.get("capacity") not in CAPACITIES | {None}:
            errors.append(f"{prefix}.delivery.capacity must be one of {sorted(CAPACITIES)}")
    extra = sorted(set(request) - {"kind", "radiusM", "delivery", "note"})
    if extra:
        errors.append(f"{prefix} has unknown fields {extra}")
    return errors


def validate_records(records: Iterable[dict]) -> list[str]:
    """Validate request inputs, identity and incompatible same-place work."""
    errors: list[str] = []
    seen_places: set[str] = set()
    seen_requests: set[str] = set()
    for record in records:
        place_id = record.get("id")
        if not isinstance(place_id, str) or not place_id:
            errors.append("terrain request belongs to a record without a stable place id")
            continue
        if place_id in seen_places:
            errors.append(f"{place_id}: duplicate catalogue record")
        seen_places.add(place_id)
        requests = record.get("terrainRequests") or []
        if not requests:
            continue
        position = record.get("position")
        if not isinstance(position, dict):
            errors.append(f"{place_id}: terrainRequests require a plotted position")
        else:
            for axis in ("u", "v"):
                value = position.get(axis)
                if isinstance(value, bool) or not isinstance(value, (int, float)) \
                        or not math.isfinite(value) or not 0.0 <= value <= 1.0:
                    errors.append(f"{place_id}: position.{axis} must be a finite number in [0, 1]")
        valid_kinds: list[str] = []
        local_payloads: set[str] = set()
        for index, request in enumerate(requests):
            request_errors = _request_errors(record, index, request)
            errors.extend(request_errors)
            if request_errors:
                continue
            payload = _canonical(request)
            if payload in local_payloads:
                errors.append(f"{place_id}: duplicate terrain request {request['kind']!r}")
            local_payloads.add(payload)
            request_id = _request_id(place_id, request)
            if request_id in seen_requests:
                errors.append(f"{place_id}: duplicate terrain request id {request_id}")
            seen_requests.add(request_id)
            valid_kinds.append(request["kind"])
        for left_index, left in enumerate(valid_kinds):
            for right in valid_kinds[left_index + 1:]:
                if frozenset((left, right)) in CONTRADICTORY_KINDS:
                    errors.append(f"{place_id}: contradictory terrain requests {left!r} and {right!r}")
    return errors


def build_plan(records: Iterable[dict], extent_m: float = PROVINCE_EXTENT_M) -> tuple[dict, list[str]]:
    """Return a byte-stable plan and validation errors without writing files."""
    records = list(records)
    errors = validate_records(records)
    if isinstance(extent_m, bool) or not isinstance(extent_m, (int, float)) \
            or not math.isfinite(extent_m) or extent_m <= 0:
        errors.append("extent_m must be a finite positive number")
    if errors:
        return {}, errors

    requests_out: list[dict] = []
    operations: list[dict] = []
    for record in sorted(records, key=lambda row: row["id"]):
        requests = record.get("terrainRequests") or []
        if not requests:
            continue
        place_id = record["id"]
        center_x = float(record["position"]["u"]) * extent_m
        center_z = float(record["position"]["v"]) * extent_m
        for request in requests:
            request_id = _request_id(place_id, request)
            operation_id = f"terrain-op.{request_id.removeprefix('terrain-request.')}"
            radius = float(request["radiusM"])
            spec = KIND_SPECS[request["kind"]]
            source_path = f"terrainRequests[{request['kind']}:{_digest(request)}]"
            requests_out.append({
                "id": request_id,
                "placeId": place_id,
                "sourcePath": source_path,
                "kind": request["kind"],
                "delivery": request["delivery"],
                "authoredNote": request["note"].strip(),
                "operationIds": [operation_id],
            })
            parameters = {
                "deltaM": delivery_delta(spec, request["delivery"]),
                "falloffFraction": spec.falloffFraction,
                **dict(spec.parameters),
                "delivery": request["delivery"],
            }
            operations.append({
                "id": operation_id,
                "requestId": request_id,
                "placeId": place_id,
                "action": spec.action,
                "profile": spec.profile,
                "centerM": [round(center_x, 3), round(center_z, 3)],
                "radiusM": radius,
                "boundsM": _bounds(center_x, center_z, radius, extent_m),
                "axisResolver": spec.axisResolver,
                "parameters": parameters,
                "fulfillmentEvidence": {"sourcePath": source_path, "authoredNote": request["note"].strip()},
            })
    requests_out.sort(key=lambda row: row["id"])
    operations.sort(key=lambda row: row["id"])
    source_rows = [{"id": row["id"], "placeId": row["placeId"], "kind": row["kind"],
                    "sourcePath": row["sourcePath"]} for row in requests_out]
    source_digest = hashlib.sha256(_canonical(source_rows).encode("utf-8")).hexdigest()
    policy_digest = hashlib.sha256(_canonical(_policy_document()).encode("utf-8")).hexdigest()
    plan_payload = {"extentM": float(extent_m), "sourceDigest": source_digest,
                    "policyDigest": policy_digest, "requests": requests_out,
                    "operations": operations}
    plan = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "terrain-request-plan",
        **plan_payload,
        "planDigest": hashlib.sha256(_canonical(plan_payload).encode("utf-8")).hexdigest(),
    }
    return plan, []


def serialise(document: dict) -> str:
    return json.dumps(document, indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def verify_fulfillment_manifest(plan: dict, manifest: dict) -> list[str]:
    """Require exact, evidenced downstream coverage of the planned work."""
    errors: list[str] = []
    if manifest.get("schemaVersion") != FULFILLMENT_SCHEMA_VERSION:
        errors.append(f"fulfillment schemaVersion must be {FULFILLMENT_SCHEMA_VERSION}")
    if manifest.get("kind") != "terrain-request-fulfillments":
        errors.append("fulfillment kind must be 'terrain-request-fulfillments'")
    if manifest.get("sourceDigest") != plan.get("sourceDigest"):
        errors.append("fulfillment sourceDigest does not match the terrain-request plan")
    if manifest.get("planDigest") != plan.get("planDigest"):
        errors.append("fulfillment planDigest does not match the exact operation policy")
    expected = {row["id"]: tuple(row["operationIds"]) for row in plan.get("requests", [])}
    actual: dict[str, dict] = {}
    rows = manifest.get("fulfillments")
    if not isinstance(rows, list):
        return errors + ["fulfillments must be a list"]
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(f"fulfillments[{index}] must be an object")
            continue
        request_id = row.get("requestId")
        if request_id in actual:
            errors.append(f"duplicate fulfillment for {request_id}")
        elif not isinstance(request_id, str):
            errors.append(f"fulfillments[{index}].requestId must be a stable id")
        else:
            actual[request_id] = row
    for request_id in sorted(set(expected) - set(actual)):
        errors.append(f"missing fulfillment for {request_id}")
    for request_id in sorted(set(actual) - set(expected)):
        errors.append(f"stale fulfillment for {request_id}")
    for request_id in sorted(set(expected) & set(actual)):
        row = actual[request_id]
        request = next(item for item in plan["requests"] if item["id"] == request_id)
        operation_ids = row.get("operationIds")
        if not isinstance(operation_ids, list) or tuple(operation_ids) != expected[request_id]:
            errors.append(f"{request_id}: operationIds do not exactly cover the plan")
        evidence = row.get("evidenceRefs")
        if not isinstance(evidence, list) or not evidence or any(not isinstance(x, str) or not x for x in evidence):
            errors.append(f"{request_id}: evidenceRefs must name produced terrain artifacts")
        operation_evidence = row.get("operationEvidence")
        if not isinstance(operation_evidence, list) or len(operation_evidence) != len(expected[request_id]):
            errors.append(f"{request_id}: operationEvidence must cover every operation exactly once")
        else:
            evidence_ids = [item.get("operationId") for item in operation_evidence
                            if isinstance(item, dict)]
            if len(evidence_ids) != len(operation_evidence) or tuple(evidence_ids) != expected[request_id]:
                errors.append(f"{request_id}: operationEvidence ids do not exactly cover the plan")
            for index, item in enumerate(operation_evidence):
                if not isinstance(item, dict):
                    continue
                claimed_digest = item.get("evidenceSha256")
                payload = {key: value for key, value in item.items() if key != "evidenceSha256"}
                actual_digest = hashlib.sha256(_canonical(payload).encode("utf-8")).hexdigest()
                if claimed_digest != actual_digest:
                    errors.append(f"{request_id}: operationEvidence[{index}] digest does not match")
                expected_ref = f"terrain-operation-evidence.{item.get('operationId')}.sha256.{claimed_digest}"
                if not isinstance(evidence, list) or index >= len(evidence) or evidence[index] != expected_ref:
                    errors.append(f"{request_id}: operationEvidence[{index}] is not bound by evidenceRefs")
                if item.get("deliverySha256") != delivery_digest(request["delivery"]):
                    errors.append(f"{request_id}: operationEvidence[{index}] delivery digest is stale")
                if item.get("coveredFields") != sorted(request["delivery"]):
                    errors.append(f"{request_id}: operationEvidence[{index}] does not cover every delivery field")
                witnesses = item.get("witnesses")
                if not isinstance(witnesses, list) or not witnesses:
                    errors.append(f"{request_id}: operationEvidence[{index}] has no terrain witnesses")
        if row.get("deliverySha256") != delivery_digest(request["delivery"]):
            errors.append(f"{request_id}: deliverySha256 does not match the typed terrain contract")
    return errors


def catalogue_records() -> list[dict]:
    return [record for region in catalogue.load_region_files() for record in region.places]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate and plan typed catalogue terrain requests")
    parser.add_argument("--check", action="store_true", help="validate the live catalogue without writing")
    args = parser.parse_args(argv)
    if not args.check:
        parser.error("only --check is supported; raster integration owns output writing")
    plan, errors = build_plan(catalogue_records())
    if errors:
        for error in errors:
            print(f"ERROR {error}")
        return 1
    print(f"terrain_requests: OK — {len(plan['requests'])} requests, "
          f"{len(plan['operations'])} typed operations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
