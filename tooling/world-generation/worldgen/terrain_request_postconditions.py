"""Verify typed terrain requests against the *final* terrain and water solve.

This is deliberately a postcondition gate, not a second fulfillment manifest.
The raster application manifest proves that an operation ran; this module asks
whether the requested physical state survived every downstream terrain and
water stage.  It never treats a timestamp, a nearby pixel, or an authored note
as proof.

Measured thresholds (metres unless stated otherwise):

* wet/open water: signed depth > 0.05; underwater entry > 1.2;
* shallow 0.05..1.5, navigable >= 0.6, swimming >= 1.2, diving >= 3,
  dark-from-surface >= 6, below-bed >= 1.2 inside a standing-water body;
* flooded-to-rim: water reaches within 0.35 of the support's dry rim;
* flood/storm-free: centre ground is respectively 1.4/2.0 above the highest
  connected water level in the request support;
* current: standing <= 0.05 m/s, slack <= 0.15, slow 0.05..0.5.  ``tidal``
  additionally requires coast/estuary class. Seasonal lethality is bound to
  its deliberately constricted terrain profile and final survival witnesses;
  it is not misreported as a measurement from the dry-season velocity raster.
* channel edge/link: final compiler channel cells must occur in the support;
  an edge also needs both wet and dry samples within one full-resolution cell.

Semantic feature identity, construction/access/capacity, material bank forms,
and geometric counts/dimensions are proved by content-addressed operation
evidence.  Each operation records its exact typed fields, resolved axis,
profile/delta hash, and high-signal before/application witnesses.  This gate
then requires the signed terrain signal to survive in the final raster; an
operation manifest by itself is never treated as proof.
The final water artifact must also declare the SHA-256 of its input terrain;
until the water compiler supplies that provenance, freshness is unsupported.

Run after the final ``compile_water`` and before downstream rebakes::

    python3 -m worldgen.terrain_request_postconditions
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
from scipy import ndimage

from .compile_chunks import DEFAULT_HEIGHTS
from .scale import RAW_M
from .terrain_requests import delivery_digest, verify_fulfillment_manifest

SCHEMA_VERSION = 1
WET_MIN_M = 0.05
FLOOD_CLEARANCE_M = 1.4
STORM_CLEARANCE_M = 2.0
RIM_TOLERANCE_M = 0.35
WATER_CONTEXT_M = 150.0
LOW_RISE_MAX_M = 5.0
DEPTH_MINIMUMS = {
    "navigable": 0.6, "swimming": 1.2, "diving": 3.0,
    "dark-from-surface": 6.0, "below-bed": 1.2,
}
CLASS_NAMES = ("none", "coast", "estuary", "river", "lake", "marsh")
EXECUTION_EVIDENCE_FIELDS = {
    "access", "bank", "capacity", "connectionCount", "crossingsMin",
    "featureCount", "isletCount", "ledgeCount", "lengthM",
    "offsetBoatLengths", "orientation", "sides", "widthM",
}
SURVIVAL_MIN_RATIO = 0.20
SURVIVAL_MIN_FRACTION = 0.80


def _canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _json_digest(value: object) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def _file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _array_digest(array: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(array).tobytes()).hexdigest()


def _finding(field: str, status: str, detail: str, measured: object = None) -> dict:
    row = {"field": field, "status": status, "detail": detail}
    if measured is not None:
        row["measured"] = measured
    return row


def _support(operation: dict, shape: tuple[int, int], mps: float) -> tuple[slice, slice, np.ndarray]:
    cx, cz = map(float, operation["centerM"])
    radius = float(operation["radiusM"])
    x0 = max(0, int(math.floor((cx - radius) / mps)))
    x1 = min(shape[1] - 1, int(math.ceil((cx + radius) / mps)))
    z0 = max(0, int(math.floor((cz - radius) / mps)))
    z1 = min(shape[0] - 1, int(math.ceil((cz + radius) / mps)))
    x = np.arange(x0, x1 + 1) * mps
    z = np.arange(z0, z1 + 1) * mps
    mask = (x[None, :] - cx) ** 2 + (z[:, None] - cz) ** 2 <= radius ** 2
    return slice(z0, z1 + 1), slice(x0, x1 + 1), mask


def _coarse_values(array: np.ndarray, operation: dict, full_shape: tuple[int, int], mask: np.ndarray,
                   zs: slice, xs: slice) -> np.ndarray:
    # compile_water coarse texel i samples full-resolution cell 3i+1.
    zz, xx = np.nonzero(mask)
    full_z = zz + int(zs.start)
    full_x = xx + int(xs.start)
    coarse_z = np.clip(np.rint((full_z - 1) / 3).astype(int), 0, array.shape[0] - 1)
    coarse_x = np.clip(np.rint((full_x - 1) / 3).astype(int), 0, array.shape[1] - 1)
    return array[coarse_z, coarse_x]


def _nearest_wet_component_levels(operation: dict, height: np.ndarray,
                                  water: dict) -> np.ndarray:
    """Water levels from the nearest contiguous wet component in bounded context."""
    expanded = dict(operation)
    expanded["radiusM"] = float(operation["radiusM"]) + WATER_CONTEXT_M
    zs, xs, mask = _support(expanded, height.shape, RAW_M)
    local_wet = water["wet_full"][zs, xs].astype(bool) & mask
    if not np.any(local_wet):
        return np.empty(0, dtype=np.float32)
    labels, _ = ndimage.label(local_wet)
    cx = int(round(float(operation["centerM"][0]) / RAW_M)) - int(xs.start)
    cz = int(round(float(operation["centerM"][1]) / RAW_M)) - int(zs.start)
    wet_z, wet_x = np.nonzero(local_wet)
    nearest = int(np.argmin((wet_x - cx) ** 2 + (wet_z - cz) ** 2))
    component = labels[wet_z[nearest], wet_x[nearest]]
    return water["w_full"][zs, xs][labels == component]


def _execution_findings(request: dict, evidence: list[dict], height: np.ndarray) -> list[dict]:
    delivery = request["delivery"]
    findings: list[dict] = []
    if not evidence:
        return [_finding("operationEvidence", "fail", "no content-addressed operation evidence")]
    covered: set[str] = set()
    ratios: list[float] = []
    retained = 0
    witness_count = 0
    axes = []
    for operation in evidence:
        if not isinstance(operation, dict):
            continue
        operation_fields = operation.get("coveredFields")
        if isinstance(operation_fields, list) and all(isinstance(field, str) for field in operation_fields):
            covered.update(operation_fields)
        axes.append({"operationId": operation.get("operationId"), "axis": operation.get("axis"),
                     "axisSource": operation.get("axisSource"), "profile": operation.get("profile")})
        witnesses = operation.get("witnesses")
        for witness in witnesses if isinstance(witnesses, list) else []:
            if not isinstance(witness, dict):
                continue
            try:
                x, z = int(witness["x"]), int(witness["z"])
                base = float(witness["baseHeightM"])
                intended = float(witness["operationDeltaM"])
                applied = float(witness["appliedDeltaM"])
            except (KeyError, TypeError, ValueError):
                continue
            if not all(math.isfinite(value) for value in (base, intended, applied)) \
                    or not (0 <= z < height.shape[0] and 0 <= x < height.shape[1]) \
                    or abs(intended) < 1e-6:
                continue
            application_ratio = applied * math.copysign(1.0, intended) / abs(intended)
            if application_ratio < SURVIVAL_MIN_RATIO:
                continue
            observed = float(height[z, x]) - base
            ratio = observed * math.copysign(1.0, intended) / abs(intended)
            ratios.append(ratio)
            retained += ratio >= SURVIVAL_MIN_RATIO
            witness_count += 1
    missing = sorted(set(delivery) - covered)
    if missing:
        findings.append(_finding("operationEvidence", "fail",
                                 f"typed fields absent from operation evidence: {missing}"))
    fraction = retained / witness_count if witness_count else 0.0
    median_ratio = float(np.median(ratios)) if ratios else 0.0
    survives = not missing and witness_count > 0 and fraction >= SURVIVAL_MIN_FRACTION \
        and median_ratio >= SURVIVAL_MIN_RATIO
    findings.append(_finding(
        "terrainSurvival", "pass" if survives else "fail",
        f"at least {SURVIVAL_MIN_FRACTION:.0%} of witnesses and median signed signal must retain "
        f">= {SURVIVAL_MIN_RATIO:.0%} of the operation",
        {"witnessSamples": witness_count, "retainedFraction": round(fraction, 3),
         "medianSignedRatio": round(median_ratio, 3)}))
    status = "pass" if survives else "fail"
    for field in sorted(set(delivery) & EXECUTION_EVIDENCE_FIELDS):
        findings.append(_finding(field, status,
                                 "typed value is bound to resolved operation geometry and surviving terrain witnesses",
                                 {"value": delivery[field], "operations": axes}))
    return findings


def _request_findings(request: dict, operation: dict, height: np.ndarray, water: dict,
                      evidence: list[dict]) -> list[dict]:
    zs, xs, mask = _support(operation, height.shape, RAW_M)
    ground = height[zs, xs][mask]
    level = water["w_full"][zs, xs][mask]
    wet = water["wet_full"][zs, xs][mask].astype(bool)
    depth = level - ground
    wet_depth = depth[wet]
    max_depth = float(wet_depth.max()) if wet_depth.size else 0.0
    centre_x = int(round(float(operation["centerM"][0]) / RAW_M))
    centre_z = int(round(float(operation["centerM"][1]) / RAW_M))
    centre_x = int(np.clip(centre_x, 0, height.shape[1] - 1))
    centre_z = int(np.clip(centre_z, 0, height.shape[0] - 1))
    centre_ground = float(height[centre_z, centre_x])
    findings: list[dict] = _execution_findings(request, evidence, height)
    delivery = request["delivery"]

    # ``feature`` is an identity carried exactly by the request/operation and
    # its delivery digest. It is not promoted into a claim that pixels alone
    # can distinguish (e.g. one named pool from another).
    survival = next((row["status"] for row in findings if row["field"] == "terrainSurvival"), "fail")
    findings.append(_finding("feature", survival,
                             "feature identity is bound to the kind-specific profile and surviving witnesses",
                             delivery["feature"]))

    if "depthM" in delivery:
        target = float(delivery["depthM"])
        ok = max_depth + 0.05 >= target
        findings.append(_finding("depthM", "pass" if ok else "fail",
                                 f"maximum wet depth must be >= {target:.2f} m",
                                 {"maxDepthM": round(max_depth, 3)}))
    if "depthClass" in delivery:
        name = delivery["depthClass"]
        if name == "shallow":
            count = int(np.count_nonzero((wet_depth > WET_MIN_M) & (wet_depth <= 1.5)))
            ok, measured = count > 0, {"shallowSamples": count}
        elif name == "below-bed":
            body = water.get("body_full")
            if body is None:
                findings.append(_finding("depthClass", "unsupported",
                                         "below-bed requires final standing-water body labels", name))
                ok = None
            else:
                body_here = body[zs, xs][mask] > 0
                value = float(depth[body_here].max()) if np.any(body_here) else 0.0
                ok, measured = value >= DEPTH_MINIMUMS[name], {"maxBodyDepthM": round(value, 3)}
        else:
            value = DEPTH_MINIMUMS[name]
            ok, measured = max_depth >= value, {"maxDepthM": round(max_depth, 3), "minimumM": value}
        if ok is not None:
            findings.append(_finding("depthClass", "pass" if ok else "fail",
                                     f"final water must satisfy {name!r} depth", measured))

    water_levels = level[wet]
    relation = delivery.get("waterRelation")
    if relation in {"open-water", "standing-water", "underwater-entry", "water-over-threshold"}:
        minimum = 1.2 if relation == "underwater-entry" else WET_MIN_M
        ok = max_depth >= minimum
        if relation == "standing-water":
            body = water.get("body_full")
            ok = ok and body is not None and bool(np.any((body[zs, xs][mask] > 0) & wet))
        findings.append(_finding("waterRelation", "pass" if ok else "fail",
                                 f"{relation} requires final wet depth >= {minimum:.2f} m",
                                 {"maxDepthM": round(max_depth, 3)}))
    elif relation == "below-lake-bed":
        body = water.get("body_full")
        if body is None:
            findings.append(_finding("waterRelation", "unsupported",
                                     "below-lake-bed requires final standing-water body labels", relation))
        else:
            selected = (body[zs, xs][mask] > 0) & wet
            value = float(depth[selected].max()) if np.any(selected) else 0.0
            findings.append(_finding("waterRelation", "pass" if value >= 1.2 else "fail",
                                     "below-lake-bed requires >= 1.2 m depth in a labelled body",
                                     {"maxBodyDepthM": round(value, 3)}))
    elif relation in {"channel-edge", "channel-linked", "waterward-outlet"}:
        channel = water.get("chan_full")
        if channel is None:
            findings.append(_finding("waterRelation", "unsupported",
                                     "channel relation requires final channel labels", relation))
        else:
            channel_here = channel[zs, xs][mask].astype(bool)
            ok = bool(np.any(channel_here & wet))
            if relation == "channel-edge" and ok:
                local_wet = water["wet_full"][zs, xs].astype(bool)
                edge = local_wet & ~ndimage.binary_erosion(local_wet)
                ok = bool(np.any(edge[mask] & channel_here)) and bool(np.any(~local_wet[mask]))
            findings.append(_finding("waterRelation", "pass" if ok else "fail",
                                     f"{relation} requires a final labelled wet channel in support",
                                     {"wetChannelSamples": int(np.count_nonzero(channel_here & wet))}))
    elif relation == "flooded-to-rim":
        dry_ground = ground[~wet]
        gap = float(dry_ground.min() - water_levels.max()) if dry_ground.size and water_levels.size else math.inf
        ok = abs(gap) <= RIM_TOLERANCE_M
        findings.append(_finding("waterRelation", "pass" if ok else "fail",
                                 f"wet level must reach dry rim within {RIM_TOLERANCE_M:.2f} m",
                                 {"rimGapM": round(gap, 3) if math.isfinite(gap) else None}))
    elif relation == "ringed-by-water":
        local_wet = water["wet_full"][zs, xs].astype(bool)
        centre = (centre_z - int(zs.start), centre_x - int(xs.start))
        dry = ~local_wet
        labels, _ = ndimage.label(dry)
        label = labels[centre] if 0 <= centre[0] < labels.shape[0] and 0 <= centre[1] < labels.shape[1] else 0
        touches_edge = label == 0 or np.any(labels[0] == label) or np.any(labels[-1] == label) \
            or np.any(labels[:, 0] == label) or np.any(labels[:, -1] == label)
        ok = bool(label and not touches_edge and np.any(local_wet & mask))
        findings.append(_finding("waterRelation", "pass" if ok else "fail",
                                 "centre dry component must be enclosed by water inside support"))
    elif relation == "water-on-three-sides":
        local_wet = water["wet_full"][zs, xs].astype(bool) & mask
        zz, xx = np.indices(local_wet.shape)
        cx = centre_x - int(xs.start)
        cz = centre_z - int(zs.start)
        dx, dz = xx - cx, zz - cz
        sides = (
            local_wet & (dx >= np.abs(dz)),
            local_wet & (-dx >= np.abs(dz)),
            local_wet & (dz >= np.abs(dx)),
            local_wet & (-dz >= np.abs(dx)),
        )
        wet_sides = sum(bool(np.any(side)) for side in sides)
        centre_dry = not bool(water["wet_full"][centre_z, centre_x])
        ok = centre_dry and wet_sides >= 3
        findings.append(_finding("waterRelation", "pass" if ok else "fail",
                                 "dry centre must have final water on at least three sides",
                                 {"wetSides": wet_sides, "centreDry": centre_dry}))
    elif relation in {"above-flood", "above-storm-water"}:
        clearance = FLOOD_CLEARANCE_M if relation == "above-flood" else STORM_CLEARANCE_M
        contextual_levels = water_levels if water_levels.size else _nearest_wet_component_levels(
            operation, height, water)
        if not contextual_levels.size:
            findings.append(_finding("waterRelation", "fail", "no final connected water in bounded context"))
        else:
            value = centre_ground - float(contextual_levels.max())
            findings.append(_finding("waterRelation", "pass" if value >= clearance else "fail",
                                     f"centre ground clearance must be >= {clearance:.2f} m",
                                     {"clearanceM": round(value, 3)}))

    height_class = delivery.get("heightClass")
    if height_class in {"flood-free", "storm-free"}:
        clearance = FLOOD_CLEARANCE_M if height_class == "flood-free" else STORM_CLEARANCE_M
        contextual_levels = water_levels if water_levels.size else _nearest_wet_component_levels(
            operation, height, water)
        value = centre_ground - float(contextual_levels.max()) if contextual_levels.size else None
        ok = value is not None and value >= clearance
        findings.append(_finding("heightClass", "pass" if ok else "fail",
                                 f"centre ground clearance must be >= {clearance:.2f} m",
                                 {"clearanceM": round(value, 3) if value is not None else None}))
    elif height_class == "low":
        median = float(np.median(ground))
        rise = centre_ground - median
        findings.append(_finding("heightClass", "pass" if 0 <= rise <= LOW_RISE_MAX_M else "fail",
                                 f"low rise must sit 0..{LOW_RISE_MAX_M:.1f} m above support median",
                                 {"relativeHeightM": round(rise, 3)}))
    elif height_class == "tiered-roosts":
        findings.append(_finding("heightClass", survival,
                                 "tiered-roost profile is bound to surviving operation witnesses", height_class))
    if "heightM" in delivery:
        rise = centre_ground - float(np.min(ground))
        target = float(delivery["heightM"])
        findings.append(_finding("heightM", "pass" if rise + 0.05 >= target else "fail",
                                 f"centre-to-support-minimum relief must be >= {target:.2f} m",
                                 {"relativeHeightM": round(rise, 3)}))

    current = delivery.get("current")
    if current:
        if current == "lethal-wet-season":
            findings.append(_finding("current", survival,
                                     "seasonal hydraulic shaping is bound to surviving operation witnesses",
                                     current))
        else:
            velocity = np.hypot(water["vx"], water["vz"])
            speeds = _coarse_values(velocity, operation, height.shape, mask, zs, xs)
            classes = _coarse_values(water["cls"], operation, height.shape, mask, zs, xs)
            selected = wet
            if relation in {"channel-edge", "channel-linked", "waterward-outlet"} \
                    and water.get("chan_full") is not None:
                selected &= water["chan_full"][zs, xs][mask].astype(bool)
            speeds = speeds[selected]
            classes = classes[selected]
            speed = float(np.median(speeds)) if speeds.size else 0.0
            ranges = {
                "standing": (0.0, 0.05), "slack": (0.0, 0.15),
                "slow": (0.05, 0.5), "flowing": (0.15, 1.0), "swift": (0.5, 3.0),
            }
            if current in ranges:
                lo, hi = ranges[current]
                ok = bool(speeds.size) and lo <= speed <= hi
            elif current == "tidal":
                ok = bool(speeds.size) and bool(np.any(np.isin(classes, (1, 2))))
            else:
                findings.append(_finding("current", "unsupported",
                                         "current class has no documented final-state threshold", current))
                ok = None
            if ok is not None:
                findings.append(_finding("current", "pass" if ok else "fail",
                                         f"final current must satisfy {current!r}",
                                         {"medianSpeedMS": round(speed, 3),
                                          "classes": sorted({CLASS_NAMES[int(v)] for v in classes})}))
    return findings


def build_report(plan: dict, fulfillment: dict, height: np.ndarray, water: dict,
                 *, artifact_hashes: dict[str, str], water_height_sha256: str | None = None) -> dict:
    """Return a deterministic, content-addressed report; never write here."""
    global_findings: list[dict] = []
    for error in verify_fulfillment_manifest(plan, fulfillment):
        global_findings.append(_finding("fulfillment", "fail", error))
    final_height_hash = _array_digest(height)
    # The fulfillment is deliberately written at request-application time;
    # later route grading is allowed to change the terrain. This final-stage
    # report itself binds the post-grade raster, then independently checks the
    # operation witnesses survived and the final water used this exact raster.
    global_findings.append(_finding("finalHeightSha256", "pass",
                                    "postcondition report binds the exact final terrain raster",
                                    final_height_hash))
    if water_height_sha256 != final_height_hash:
        global_findings.append(_finding(
            "waterSourceHeightSha256", "unsupported" if water_height_sha256 is None else "fail",
            "final water must declare the exact SHA-256 of the terrain it was solved from",
            {"claimed": water_height_sha256, "actual": final_height_hash}))
    else:
        global_findings.append(_finding("waterSourceHeightSha256", "pass",
                                        "final water is bound to the exact final terrain hash"))

    required_water = {"w_full", "wet_full", "cls", "vx", "vz"}
    missing = sorted(required_water - set(water))
    if missing:
        global_findings.append(_finding("waterArtifacts", "fail", f"missing final arrays {missing}"))
        request_results: list[dict] = []
    elif water["w_full"].shape != height.shape or water["wet_full"].shape != height.shape:
        global_findings.append(_finding("waterRegistration", "fail",
                                        "full-resolution water and terrain shapes differ"))
        request_results = []
    else:
        operations = {row["requestId"]: row for row in plan.get("operations", [])}
        fulfillment_rows = {row.get("requestId"): row for row in fulfillment.get("fulfillments", [])
                            if isinstance(row, dict)}
        request_results = []
        for request in plan.get("requests", []):
            operation = operations.get(request["id"])
            if operation is None:
                findings = [_finding("operation", "fail", "request has no unique planned operation")]
            else:
                evidence = fulfillment_rows.get(request["id"], {}).get("operationEvidence", [])
                if not isinstance(evidence, list):
                    evidence = []
                findings = _request_findings(request, operation, height, water, evidence)
            request_results.append({
                "requestId": request["id"], "placeId": request["placeId"],
                "deliverySha256": delivery_digest(request["delivery"]),
                "status": "pass" if all(row["status"] == "pass" for row in findings) else "fail",
                "findings": findings,
            })
    payload = {
        "planDigest": plan.get("planDigest"), "sourceDigest": plan.get("sourceDigest"),
        "finalHeightSha256": final_height_hash,
        "artifactSha256": artifact_hashes, "thresholdsSha256": _json_digest({
            "wetMinM": WET_MIN_M, "floodClearanceM": FLOOD_CLEARANCE_M,
            "stormClearanceM": STORM_CLEARANCE_M, "rimToleranceM": RIM_TOLERANCE_M,
            "depthMinimumsM": DEPTH_MINIMUMS, "survivalMinRatio": SURVIVAL_MIN_RATIO,
            "survivalMinFraction": SURVIVAL_MIN_FRACTION,
        }),
        "globalFindings": global_findings, "requests": request_results,
    }
    passed = all(row["status"] == "pass" for row in global_findings) \
        and all(row["status"] == "pass" for row in request_results)
    return {"schemaVersion": SCHEMA_VERSION, "kind": "terrain-request-postconditions",
            "status": "pass" if passed else "fail", **payload,
            "reportDigest": _json_digest(payload)}


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=True, ensure_ascii=False)
            handle.write("\n")
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
    vault = DEFAULT_HEIGHTS.parent
    water_default = vault.parent / "water-pass1.npz"
    parser = argparse.ArgumentParser(description="Verify final typed terrain-request postconditions")
    parser.add_argument("--plan", type=Path, default=vault / "terrain-request-plan.json")
    parser.add_argument("--fulfillment", type=Path, default=vault / "terrain-request-fulfillments.json")
    parser.add_argument("--height", type=Path, default=DEFAULT_HEIGHTS)
    parser.add_argument("--water", type=Path, default=water_default)
    parser.add_argument("--out", type=Path, default=vault / "terrain-request-postconditions.json")
    args = parser.parse_args(argv)
    paths = {"plan": args.plan, "fulfillment": args.fulfillment,
             "height": args.height, "water": args.water}
    try:
        plan = json.loads(args.plan.read_text())
        fulfillment = json.loads(args.fulfillment.read_text())
        height = np.load(args.height).astype(np.float32)
        loaded = np.load(args.water)
        water = {name: loaded[name] for name in loaded.files}
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        parser.error(str(error))
    # The compiler currently has no source-height field. Support either an
    # NPZ scalar once added or a sibling provenance JSON without guessing.
    water_height_hash = None
    if "source_height_sha256" in water:
        water_height_hash = str(np.asarray(water["source_height_sha256"]).item())
    provenance_path = args.water.with_suffix(".provenance.json")
    if water_height_hash is None and provenance_path.exists():
        provenance = json.loads(provenance_path.read_text())
        water_height_hash = provenance.get("sourceHeightSha256")
        paths["waterProvenance"] = provenance_path
    report = build_report(plan, fulfillment, height, water,
                          artifact_hashes={name: _file_digest(path) for name, path in paths.items()},
                          water_height_sha256=water_height_hash)
    _atomic_json(args.out, report)
    failures = sum(row["status"] != "pass" for row in report["globalFindings"]) \
        + sum(row["status"] != "pass" for request in report["requests"]
              for row in request["findings"])
    print(f"terrain request postconditions: {report['status']} — "
          f"{len(report['requests'])} requests, {failures} non-passing findings; {args.out}")
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
