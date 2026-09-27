"""A place's levelled ground as a runtime overlay (decision 0102 decision 1).

A place's `settlement-pad` grades no longer go into the frozen world through
the terrain chain: they travel in the place's bundle as `groundOverlays`
(schemaVersion 1) and the studio or game applies them when it decodes a
terrain chunk (`packages/game-core/src/terrain/heightOverlays.ts`, the
TypeScript twin of this module; the golden fixture
`packages/game-core/src/terrain/__fixtures__/ground-overlays-claywater.json` holds
the two equal).

One overlay per pad the export measures (`settlement_run_pads`, one writer):
``{id, bboxM, blendM, hardM, pieces: [{placementId, polygonM, datumM}]}``. A
building pad has one piece (its apron polygon and datum, ``hardM`` 0); a run
pad has one piece per floating member (its footprint and designed ground
line, ``hardM`` the chain's 1.5 samples of the 1.83 m frozen grid, resolved
here to metres so the runtime never needs the grid).

The maths (the retired chain grid `apply_settlement_pad`'s, per sample,
with nothing about the grid in it; the golden fixture now holds it): within ``hardM`` of a piece's polygon the
height is the piece's datum (the highest datum where two hard zones meet);
beyond, the ground is pulled toward the datum by ``1 - smoothstep`` over
``blendM`` (the larger pull wins). Overlays apply one after another, each
reading the ground the previous one left, in `apply_order`: every run pad in
id order, then every building pad in id order (planner ruling 16k r7 rule 1:
a building pad outranks a run pad where they overlap). A run pad also yields
inside every building pad's polygon: there it leaves the ground as it found
it, so a retaining run beside a hut never lifts the hut's plinth.

An overlay's ``kind`` ("building" or "run") names its owner. Bundles written
before r7 carry no ``kind``; there a building pad is the one with ``hardM`` 0
(`building_pad_patches` is the only writer of a zero hard radius).
"""

from __future__ import annotations

import math

import numpy as np

SCHEMA_VERSION = 1


def overlay_from_patch(patch: dict, default_hard_m: float) -> dict:
    """The overlay of one `settlement-pad` patch (`settlement_run_pads.pad_patch`)."""
    return {
        "id": patch["id"],
        "kind": "building" if "buildingId" in (patch.get("source") or {}) else "run",
        "bboxM": [float(v) for v in patch["bboxM"]],
        "blendM": float(patch["blendM"]),
        "hardM": float(patch.get("hardM", default_hard_m)),
        "pieces": [{"placementId": r["placementId"],
                    "polygonM": [[float(x), float(z)] for x, z in r["footprintM"]],
                    "datumM": float(r["targetM"])} for r in patch["params"]["pieces"]],
    }


def place_overlays(rows: list[dict], place_id: str, height_at, is_wet=None) -> list[dict]:
    """Every pad overlay of one place's bundle rows: the run pads measured on
    ``height_at`` (the frozen ground) and every declared building pad, in the
    order they apply."""
    from .scale import RAW_M
    from .settlement_run_pads import PAD_HARD_RADIUS_PX, building_pad_patches, run_pad_patches
    patches = run_pad_patches(rows, place_id, height_at, is_wet) + building_pad_patches(rows, place_id)
    hard = PAD_HARD_RADIUS_PX * RAW_M
    return apply_order([overlay_from_patch(p, hard) for p in patches])


def is_building(overlay: dict) -> bool:
    """A building pad (``kind`` "building"; before r7, ``hardM`` 0)."""
    kind = overlay.get("kind")
    return kind == "building" if kind else float(overlay["hardM"]) == 0.0


def apply_order(overlays: list[dict]) -> list[dict]:
    """Run pads in id order, then building pads in id order (a building pad
    outranks a run pad where they overlap)."""
    return sorted(overlays, key=lambda o: (is_building(o), o["id"]))


def _yield_polygons(overlays: list[dict]) -> list[list]:
    """The polygons a run pad yields inside: every building pad's pieces."""
    return [piece["polygonM"] for o in overlays if is_building(o) for piece in o["pieces"]]


def _segment_distance(x: float, z: float, polygon: list) -> float:
    """Metres from (x, z) to the polygon's boundary (`grade_settlement_pads`'s
    edge distance, scalar)."""
    best = math.inf
    ax, az = polygon[-1]
    for bx, bz in polygon:
        dx, dz = bx - ax, bz - az
        length2 = dx * dx + dz * dz
        if length2 == 0:
            d2 = (x - ax) ** 2 + (z - az) ** 2
        else:
            t = min(1.0, max(0.0, ((x - ax) * dx + (z - az) * dz) / length2))
            d2 = (x - (ax + t * dx)) ** 2 + (z - (az + t * dz)) ** 2
        best = min(best, d2)
        ax, az = bx, bz
    return math.sqrt(best)


def _inside(x: float, z: float, polygon: list) -> bool:
    inside = False
    ax, az = polygon[-1]
    for bx, bz in polygon:
        if (bz > z) != (az > z):
            x_cross = (ax - bx) * (z - bz) / (az - bz + 1e-300) + bx
            if x < x_cross:
                inside = not inside
        ax, az = bx, bz
    return inside


def polygon_distance(x: float, z: float, polygon: list) -> float:
    """0 inside, else metres to the boundary."""
    return 0.0 if _inside(x, z, polygon) else _segment_distance(x, z, polygon)


def overlay_one(base: float, x: float, z: float, overlay: dict, yield_to=()) -> float:
    """One overlay's height at (x, z) over the ground ``base``; a run pad
    leaves ``base`` as it is inside any polygon of ``yield_to`` (the building
    pads, `_yield_polygons`)."""
    hard = float(overlay["hardM"])
    blend = float(overlay["blendM"])
    reach = hard + blend
    x0, z0, x1, z1 = overlay["bboxM"]
    if x < x0 - reach or x > x1 + reach or z < z0 - reach or z > z1 + reach:
        return base
    if yield_to and not is_building(overlay) and any(_inside(x, z, poly) for poly in yield_to):
        return base
    hard_target = -math.inf
    pull = 0.0
    for piece in overlay["pieces"]:
        target = float(piece["datumM"])
        d = polygon_distance(x, z, piece["polygonM"])
        if d <= hard:
            hard_target = max(hard_target, target)
        t = min(1.0, max(0.0, (d - hard) / max(blend, 1e-6)))
        w = 1.0 - t * t * (3.0 - 2.0 * t)
        step = (target - base) * w
        if abs(step) > abs(pull):
            pull = step
    return hard_target if math.isfinite(hard_target) else base + pull


def overlay_height(base: float, x: float, z: float, overlays: list[dict]) -> float:
    """The padded ground at (x, z): every overlay in `apply_order` over ``base``."""
    h = float(base)
    yield_to = _yield_polygons(overlays)
    for overlay in apply_order(overlays):
        h = overlay_one(h, x, z, overlay, yield_to)
    return h


def ground(height_at, overlays: list[dict]):
    """``height_at`` with ``overlays`` applied point by point (`overlay_height`
    at the exact point): the one Python pad surface for the workbench, the
    compile and the gates (`settlement_run_pads.pad_ground`,
    `patched_height_at`)."""
    if not overlays:
        return height_at
    ordered = apply_order(overlays)
    yield_to = _yield_polygons(overlays)

    def at(x: float, z: float) -> float:
        h = float(height_at(x, z))
        for overlay in ordered:
            h = overlay_one(h, x, z, overlay, yield_to)
        return h
    return at


def _inside_many(X: np.ndarray, Z: np.ndarray, polygon: list) -> np.ndarray:
    """`_inside` over arrays, the same crossing test operation for operation."""
    inside = np.zeros(X.shape, bool)
    ax, az = polygon[-1]
    for bx, bz in polygon:
        ax, az, bx, bz = float(ax), float(az), float(bx), float(bz)
        span = (bz > Z) != (az > Z)
        x_cross = (ax - bx) * (Z - bz) / (az - bz + 1e-300) + bx
        inside ^= span & (X < x_cross)
        ax, az = bx, bz
    return inside


def _segment_distance_many(X: np.ndarray, Z: np.ndarray, polygon: list) -> np.ndarray:
    """`_segment_distance` over arrays, operation for operation."""
    best = np.full(X.shape, math.inf)
    ax, az = polygon[-1]
    for bx, bz in polygon:
        ax, az, bx, bz = float(ax), float(az), float(bx), float(bz)
        dx, dz = bx - ax, bz - az
        length2 = dx * dx + dz * dz
        if length2 == 0:
            d2 = (X - ax) ** 2 + (Z - az) ** 2
        else:
            t = np.minimum(1.0, np.maximum(0.0, ((X - ax) * dx + (Z - az) * dz) / length2))
            d2 = (X - (ax + t * dx)) ** 2 + (Z - (az + t * dz)) ** 2
        best = np.minimum(best, d2)
        ax, az = bx, bz
    return np.sqrt(best)


def overlay_many(base: np.ndarray, X: np.ndarray, Z: np.ndarray, overlay: dict,
                 yield_to=()) -> np.ndarray:
    """`overlay_one` over arrays (a new array; every point outside the
    overlay's reach keeps ``base``)."""
    out = np.array(base, dtype=np.float64, copy=True)
    hard = float(overlay["hardM"])
    blend = float(overlay["blendM"])
    reach = hard + blend
    x0, z0, x1, z1 = overlay["bboxM"]
    near = ~((X < x0 - reach) | (X > x1 + reach) | (Z < z0 - reach) | (Z > z1 + reach))
    if yield_to and not is_building(overlay):
        for poly in yield_to:
            near &= ~_inside_many(X, Z, poly)
    if not near.any():
        return out
    x, z, b = X[near], Z[near], out[near]
    hard_target = np.full(x.shape, -math.inf)
    pull = np.zeros(x.shape)
    for piece in overlay["pieces"]:
        target = float(piece["datumM"])
        poly = piece["polygonM"]
        d = np.where(_inside_many(x, z, poly), 0.0, _segment_distance_many(x, z, poly))
        hard_target = np.where(d <= hard, np.maximum(hard_target, target), hard_target)
        t = np.minimum(1.0, np.maximum(0.0, (d - hard) / max(blend, 1e-6)))
        w = 1.0 - t * t * (3.0 - 2.0 * t)
        step = (target - b) * w
        pull = np.where(np.abs(step) > np.abs(pull), step, pull)
    out[near] = np.where(np.isfinite(hard_target), hard_target, b + pull)
    return out


def ground_many(base: np.ndarray, X: np.ndarray, Z: np.ndarray, overlays: list[dict]) -> np.ndarray:
    """`ground` over arrays: ``base`` (the unpatched heights at X, Z) with
    every overlay applied in `apply_order`, each point equal to the point
    sampler's (the workbench's walk grid; r5 review)."""
    out = np.array(base, dtype=np.float64, copy=True)
    if not overlays:
        return out
    yield_to = _yield_polygons(overlays)
    for overlay in apply_order(overlays):
        out = overlay_many(out, X, Z, overlay, yield_to)
    return out


def building_overlay(overlay_id: str, polygon, datum: float, blend_m: float) -> dict:
    """The overlay of one building pad (its apron polygon at one datum,
    ``hardM`` 0), as `overlay_from_patch` builds it from the bundle's patch."""
    poly = [[float(x), float(z)] for x, z in polygon]
    xs = [x for x, _ in poly]
    zs = [z for _, z in poly]
    return {"id": overlay_id, "kind": "building", "bboxM": [min(xs), min(zs), max(xs), max(zs)],
            "blendM": float(blend_m), "hardM": 0.0,
            "pieces": [{"placementId": overlay_id, "polygonM": poly, "datumM": float(datum)}]}


def apply_grid(heights: np.ndarray, origin_m: tuple[float, float], metres_per_sample: float,
               overlays: list[dict]) -> np.ndarray:
    """A COPY of a row-major [z][x] grid with every overlay applied; sample
    (r, c) stands at origin + (c, r) * metres_per_sample."""
    out = np.array(heights, dtype=np.float64, copy=True)
    ox, oz = origin_m
    ny, nx = out.shape
    yield_to = _yield_polygons(overlays)
    for overlay in apply_order(overlays):
        reach = float(overlay["hardM"]) + float(overlay["blendM"])
        x0, z0, x1, z1 = overlay["bboxM"]
        c0 = max(int(math.floor((x0 - reach - ox) / metres_per_sample)), 0)
        c1 = min(int(math.ceil((x1 + reach - ox) / metres_per_sample)) + 1, nx)
        r0 = max(int(math.floor((z0 - reach - oz) / metres_per_sample)), 0)
        r1 = min(int(math.ceil((z1 + reach - oz) / metres_per_sample)) + 1, ny)
        for r in range(r0, r1):
            z = oz + r * metres_per_sample
            for c in range(c0, c1):
                out[r, c] = overlay_one(out[r, c], ox + c * metres_per_sample, z, overlay, yield_to)
    return out.astype(np.float32)


def missing_overlays(settlement: dict, placements_by_id: dict) -> list[str]:
    """Every declared building pad of one bundle settlement with no overlay
    piece in its `groundOverlays` (the export gate, 0102 decision 1)."""
    doc = settlement.get("groundOverlays") or {}
    covered = {piece["placementId"] for o in doc.get("pads") or [] for piece in o["pieces"]}
    return sorted(pid for pid in settlement["placementIds"]
                  if isinstance((placements_by_id.get(pid) or {}).get("pad"), dict)
                  and pid not in covered)


FIXTURE_PLACE = "place.imperial-fringe.claywater-station"
FIXTURE_PADS = ("family-hut", "polers-hut", "stable-barn", "retaining-wall-nw")


def golden_fixture(bundle: dict, height_at) -> dict:
    """Twelve points on Claywater's pads (a core, a blend-ring and an outside
    point on each of FIXTURE_PADS), the frozen ground under each and the
    padded height this module gives: the fixture the TypeScript twin reads."""
    site = next(s for s in bundle["settlements"] if s["id"] == FIXTURE_PLACE)
    overlays = site["groundOverlays"]["pads"]
    points = []
    for suffix in FIXTURE_PADS:
        o = next(o for o in overlays if o["id"].endswith("." + suffix))
        poly = o["pieces"][0]["polygonM"]
        cx = sum(x for x, _ in poly) / len(poly)
        cz = sum(z for _, z in poly) / len(poly)
        wanted = {"core": (cx, cz)}
        for vx, vz in poly:
            dx, dz = vx - cx, vz - cz
            n = math.hypot(dx, dz)
            blend = (vx + dx / n * (o["hardM"] + o["blendM"] / 2), vz + dz / n * (o["hardM"] + o["blendM"] / 2))
            if "blend" not in wanted and all(polygon_distance(*blend, p["polygonM"]) > o["hardM"]
                                             for q in overlays for p in q["pieces"]):
                wanted["blend"] = blend
            for extra in (2.0, 5.0, 10.0, 20.0):
                step = o["hardM"] + o["blendM"] + extra
                out = (vx + dx / n * step, vz + dz / n * step)
                far = all(overlay_one(0.0, *out, q) == 0.0 and overlay_one(1.0, *out, q) == 1.0
                          for q in overlays)
                if "outside" not in wanted and far:
                    wanted["outside"] = out
        for zone in ("core", "blend", "outside"):
            x, z = (round(v, 3) for v in wanted[zone])
            base = round(float(height_at(x, z)), 4)
            points.append({"pad": o["id"], "zone": zone, "x": x, "z": z, "baseM": base,
                           "expectedM": overlay_height(base, x, z, overlays)})
    return {"schemaVersion": SCHEMA_VERSION,
            "about": "Golden points for the ground overlay (decision 0102): written by "
                     "`python3 -m worldgen.pad_overlay --fixture` from the published bundle; "
                     "worldgen/test_pad_overlay.py and heightOverlays.test.ts hold both twins to it. "
                     "Rewritten 16k r7 (planner rule 1): overlays apply run pads first, then "
                     "building pads, and a run pad yields inside a building pad's polygon, so "
                     "a retaining run no longer lifts a hut's plinth (b2 stood 1.18 m off its pad); "
                     "points where a run pad met a building pad moved.",
            "placeId": FIXTURE_PLACE, "overlays": overlays, "points": points}


def main() -> None:
    import argparse
    import json
    from pathlib import Path
    repo = Path(__file__).resolve().parents[3]
    ap = argparse.ArgumentParser(description="write the ground-overlay golden fixture")
    ap.add_argument("--fixture", action="store_true", required=True)
    ap.parse_args()
    from .street_router import default_survey
    bundle = json.loads((repo / "apps/world-studio/public/province/settlements.json").read_text())
    doc = golden_fixture(bundle, default_survey().height_at)
    out = repo / "packages/game-core/src/terrain/__fixtures__/ground-overlays-claywater.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"{out}: {len(doc['points'])} points over {len(doc['overlays'])} overlays")


if __name__ == "__main__":
    main()
