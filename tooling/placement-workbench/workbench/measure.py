"""Measurements on posed pieces: contact, gap and penetration between two
meshes; ground under a footprint; float; the runtime's seat height.

Contact reuses the miner's own geometry (`worldgen.mine_mounts`):
`CONTACT_M` (0.03 m), `patch_class` (under / side / top by the contact
patch's mean normal) and `ProximityQuery` on the parent's real surface.
The sample set is the miner's seeded surface points PLUS every vertex, so
a face-to-face or corner contact is measured at its exact points.

Penetration is measured, not estimated from normals (open kit meshes have
no inside): when FCL says the triangles cross, A is slid along the mean
outward normal of B's surface at the contact points until they no longer
cross (bisection to 1 mm); that distance is `penetrationM`.
"""
from __future__ import annotations

import math

import numpy as np

from . import paths
from .kits import Catalogue, fit_of, sink_of
from .scene import Piece, plan_to_province

SURFACE_SAMPLES = 4000
PENETRATION_REACH_M = 0.5
PROP_FLOAT_MAX_M = 0.01      # propSeatRule: a prop's foot at most this above the ground
"""Penetration beyond this is reported as None (deeply crossing)."""


def _mm():
    paths.bridge()
    from worldgen import mine_mounts
    return mine_mounts


def samples(mesh) -> tuple[np.ndarray, np.ndarray]:
    """(points, outward normals) in the kit frame: seeded surface samples and
    every vertex (vertex normals); `worldgen.slide_penetration.samples`."""
    return _sp().samples(mesh, SURFACE_SAMPLES)


def _transform4(piece: Piece) -> np.ndarray:
    a, b = piece.matrix()
    t = np.eye(4)
    t[:3, :3] = a
    t[:3, 3] = b
    return t


def _rigid4(piece: Piece) -> np.ndarray:
    """The pose without its scale: FCL (trimesh's CollisionManager) takes a
    rigid transform and silently drops a scale, so a scaled piece is added
    as a pre-scaled mesh on this transform (walk 2 round 4: the BM&V landing
    at plugin scale 2.0 read 9.7 m run-joint gaps at unit scale)."""
    t = _transform4(piece)
    t[:3, :3] = t[:3, :3] / float(piece.scale or 1.0)
    return t


def _fcl_mesh(cat: Catalogue, piece: Piece):
    m = cat.mesh(piece.asset)
    return m if float(piece.scale or 1.0) == 1.0 else m.copy().apply_scale(float(piece.scale))


def _one_way(cat: Catalogue, a: Piece, b: Piece) -> dict:
    """A's surface samples against B's surface, in B's kit frame: contact
    points (within CONTACT_M), the contact patch class on A, and B's mean
    outward normal (world) at those points."""
    from trimesh.proximity import ProximityQuery
    mm = _mm()
    ma, mb = cat.mesh(a.asset), cat.mesh(b.asset)
    pa, na = samples(ma)
    ta, tb = _transform4(a), _transform4(b)
    world = pa @ ta[:3, :3].T + ta[:3, 3]
    local = (world - tb[:3, 3]) @ np.linalg.inv(tb[:3, :3]).T
    low, high = mb.bounds
    reach = mm.CONTACT_M / b.scale
    near = np.all((local >= low - reach) & (local <= high + reach), axis=1)
    out = {"contactPoints": 0, "patch": None, "normalOfB": None}
    if not near.any():
        return out
    _closest, dist, tri = ProximityQuery(mb).on_surface(local[near])
    hit = dist * b.scale <= mm.CONTACT_M
    out["contactPoints"] = int(hit.sum())
    if hit.any():
        # the patch's normal class in the WORLD frame (A's normals turned)
        out["patch"] = mm.patch_class(na[near][hit] @ (ta[:3, :3] / a.scale).T)
        nb = mb.face_normals[tri[hit]].mean(axis=0) @ (tb[:3, :3] / b.scale).T
        if np.linalg.norm(nb) > 1e-6:
            out["normalOfB"] = nb / np.linalg.norm(nb)
    return out


def _min_separation(manager, a: Piece, b: Piece, ab_: dict, ba_: dict):
    """The smallest slide that clears the crossing, over the candidate
    directions (B's contact normal and the reverse of A's, the horizontal
    line between the pivots, and up), both ways each: the same answer
    whichever piece is named first. (metres, direction label) or (None,
    None) past PENETRATION_REACH_M on every direction. The metric lives in
    `worldgen.slide_penetration`, shared with the abuts miner's run-joint
    bars (16k fix 2 round 6 ruling K3)."""
    sp = _sp()
    ta, tb = _rigid4(a), _rigid4(b)
    return sp.min_separation(manager, ta, sp.candidate_directions(
        ta, tb, ab_["normalOfB"], ba_["normalOfB"]), PENETRATION_REACH_M)


def _sp():
    paths.bridge()
    from worldgen import slide_penetration
    return slide_penetration


def contact(cat: Catalogue, a: Piece, b: Piece) -> dict:
    """Gap / intersection / contact between two posed pieces.

    `gapM`: the EXACT smallest distance between the two triangle meshes
    (FCL via python-fcl), 0 when they touch or cross. `intersecting`: FCL's
    exact triangle-crossing test. `penetrationM`: when they cross, the
    smallest slide that clears them over a set of candidate directions
    (`separatesAlong` names it; None: more than 0.5 m every way). `contact`: gapM <=
    CONTACT_M (0.03 m, the miner's threshold). `patchOfA`/`patchOfB`: where
    on each piece the contact lies (under: it stands on the other; side: it
    abuts or leans; top: the other rests on or hangs it)."""
    import trimesh
    if a.y is None or b.y is None:
        raise ValueError("both pieces need a height: settle or set y first")
    mm = _mm()
    manager = trimesh.collision.CollisionManager()
    manager.add_object("b", _fcl_mesh(cat, b), transform=_rigid4(b))
    manager.add_object("a", _fcl_mesh(cat, a), transform=_rigid4(a))
    intersecting = bool(manager.in_collision_internal())
    gap = 0.0 if intersecting else float(manager.min_distance_internal())
    ab_ = _one_way(cat, a, b)
    ba_ = _one_way(cat, b, a)
    pen, along = 0.0, None
    if intersecting:
        pen, along = _min_separation(manager, a, b, ab_, ba_)
    return {
        "a": a.uid, "b": b.uid,
        "gapM": round(gap, 4), "intersecting": intersecting,
        "penetrationM": None if pen is None else round(pen, 3),
        "separatesAlong": along,
        "contact": gap <= mm.CONTACT_M,
        "contactPointsAonB": ab_["contactPoints"], "contactPointsBonA": ba_["contactPoints"],
        "patchOfA": ab_["patch"], "patchOfB": ba_["patch"],
    }


# --------------------------------------------------------------------------
# ground
# --------------------------------------------------------------------------
def ground_delta(cat: Catalogue, g, p: Piece, cs, authored_fit: str | None = None) -> dict:
    """The compile's ground-delta rule on this pose: the survey delta over
    the outline's vertices and centre against the `groundFit` max
    (`authored_fit`, the blueprint's override, else the manifest policy's,
    `cs.record_ground_fit`). The one reader for `wb._fit_rules` and the
    group scan's members (`scan.measure_pose` / `verify`)."""
    poly = footprint_province(cat, p)
    heights = [g.survey_height(x, z) for x, z in poly] + [g.survey_height(p.x, p.z)]
    delta = max(heights) - min(heights)
    fit = authored_fit or cs.record_ground_fit(cat.row(p.asset))
    if fit is None:
        limit = float("inf")
        why = "no groundFit: the kit record names none, so the compile refuses the parcel"
    else:
        limit = cs.FIT_MAX[fit]
        why = (None if delta <= limit else
               f"survey delta {delta:.2f} m exceeds groundFit '{fit}' (max {limit:.2f} m)")
    return {"groundFit": fit, "surveyDeltaM": round(delta, 3),
            "deltaMaxM": None if math.isinf(limit) else limit, "deltaRule": why}


def footprint_province(cat: Catalogue, piece: Piece) -> list[tuple[float, float]]:
    """The piece's footprint polygon in province metres: the measured
    `footprintM` outline, else the manifest bounds (the exporter's
    `_bounds_footprint`), turned and placed as the compile does."""
    outline = cat.footprint(piece.asset)
    if not outline:
        row = cat.row(piece.asset)
        size, off = row["sizeM"], row["originOffsetM"]
        outline = [(-off[0], -(size[1] - off[1])), (size[0] - off[0], -(size[1] - off[1])),
                   (size[0] - off[0], off[1]), (-off[0], off[1])]
    return [plan_to_province((piece.x, piece.z), piece.yaw,
                             (float(p[0]) * piece.scale, float(p[1]) * piece.scale))
            for p in outline]


def seat(cat: Catalogue, ground, piece: Piece, source: str = "chunks") -> dict:
    """The runtime's own seat height for this pose (`anchoring.ts`
    `anchorPlacement` / `waterPlacementY`): ground pieces on the MEAN of the
    samples (lowest for dug-in) minus designedSinkM.p50 x scale; water pieces
    at the recorded level minus designedWaterlineM x scale."""
    row = cat.row(piece.asset)
    klass = row.get("anchorClass") or "ground"
    fit = fit_of(row)
    paths.bridge()
    from worldgen.compile_settlement import is_quay_run
    if row.get("piled") and not is_quay_run(row):      # a quay run slides by the compile's rule
        levels = [ground.water_level(x, z) for x, z in
                  [(piece.x, piece.z), *footprint_province(cat, piece)]]
        levels = [v for v in levels if v is not None]
        level = max(levels) if levels else None
        if level is not None:
            # lessons L65 (planner ruling 2026-09-27, round 4): a piled deck
            # seats by its DECK at the water surface + its deck rise; the
            # piles sink into the bed however deep
            rise = float(row.get("deckRiseM", 0.3))
            top = (row.get("groundLineTell") or {}).get("deckTopM")   # the deck over the pivot
            deck = float(top) * piece.scale if isinstance(top, (int, float)) else 0.0
            ring = footprint_province(cat, piece)
            hs = [ground.height(x, z, source) for x, z in ring]
            y = level + rise - deck
            return {"y": y, "mode": "piled", "fit": fit, "anchorClass": klass, "source": source,
                    "waterLevelM": level, "deckRiseM": rise, "deckAbovePivotM": deck,
                    "groundLineM": sum(hs) / len(hs), "terrainMinM": min(hs),
                    "terrainMaxM": max(hs), "deltaM": max(hs) - min(hs),
                    "designedSinkM": None, "samples": len(hs), "runtimeGapM": 0.0}
    if klass == "water":
        level = ground.water_level(piece.x, piece.z)
        if level is None:
            raise ValueError(f"{piece.uid}: water-class piece stands on no recorded water")
        line = row.get("designedWaterlineM")
        if not isinstance(line, (int, float)):
            raise ValueError(f"{piece.uid}: {piece.asset} has no designedWaterlineM")
        return {"y": level - float(line) * piece.scale, "mode": "water", "waterLevelM": level,
                "designedWaterlineM": line, "anchorClass": klass, "fit": fit}
    mode = (row.get("placement") or {}).get("anchorMode", "streamed-perimeter")
    samples_xz = (footprint_province(cat, piece) if mode == "streamed-perimeter"
                  else [(piece.x, piece.z)])
    heights = [ground.height(x, z, source) for x, z in samples_xz]
    if piece.pad is not None and hasattr(ground, "floor_lift"):
        # the pad's own building rests on its datum, which the overlay grades
        # PAD_FLOOR_CLEARANCE_M under (pad_overlay; Claywater walk 5 z-fight)
        heights = [h + ground.floor_lift(x, z) for h, (x, z) in zip(heights, samples_xz)]
    lo, hi = min(heights), max(heights)
    line = lo if fit == "dug-in" else sum(heights) / len(heights)
    sink = sink_of(row) * piece.scale
    # the ONE seat, shared with the compile (place-diag P1)
    paths.bridge()
    from worldgen.compile_settlement import placement_world_y
    y = placement_world_y(heights, sink_of(row), piece.scale, fit)
    pivot_to_base = float(row["originOffsetM"][2]) * piece.scale
    return {"y": y, "mode": mode, "fit": fit, "anchorClass": klass, "source": source,
            "groundLineM": line, "terrainMinM": lo, "terrainMaxM": hi,
            "deltaM": hi - lo, "designedSinkM": sink, "samples": len(heights),
            "runtimeGapM": max(0.0, y - pivot_to_base - lo)}


def is_prop(cat: Catalogue, piece: Piece) -> bool:
    """A dressing piece seated by `prop_seat`: a ground piece that is no
    parcel's building, run member or landmark, owns no pad, and is neither
    piled nor beached (those keep their own seat rules). Any class but `water`
    settled with no parent is a prop: propSeatRule judges every unparented
    piece but a water one by `prop_seat` (`rules.prop_seat_piece`), so the
    settle selects the same set (L7b 2026-09-28: haymound01, `deck` 221 /
    `ground` 193 after the mounts re-mine, was settled by `seat` 0.028 m
    above the seat the rule judged)."""
    row = cat.row(piece.asset)
    return ((piece.role or {}).get("kind") not in ("parcel", "run", "landmark")
            and piece.pad is None and not piece.beached and not row.get("piled")
            and (row.get("anchorClass") or "ground") != "water")


def prop_seat(cat: Catalogue, ground, piece: Piece, source: str = "chunks") -> dict:
    """THE seat of a dressing prop, shared by the settle (`wb._settle`, group
    settle and the post-pad reseat) and propSeatRule (Claywater walk-2
    residual 4): the runtime's seat (`seat`), lowered onto the ground when it
    leaves the prop's lowest foot point more than PROP_FLOAT_MAX_M in the air
    (a plugin designed sink measured on other ground). The exported
    `yMeasured` carries the result, so the runtime stands the prop there."""
    got = seat(cat, ground, piece, source)
    if got.get("mode") in ("piled", "water"):
        return got
    before = piece.y
    piece.y = got["y"]
    try:
        fl = float_under(cat, ground, piece)
    finally:
        piece.y = before
    lift = fl["footFloatMinM"]
    if lift > PROP_FLOAT_MAX_M:
        got = {**got, "y": got["y"] - lift, "runtimeSeatY": got["y"], "footDropM": round(lift, 4)}
    return got


def footing_slope_deg(ground, piece, poly) -> float:
    """The 97 B3 footing slope of a pose: a dressing piece (not a parcel's
    building or a run member) inside a building pad's reach (pad + blend)
    reads the padded surface (`PaddedGround.dressing_slope_deg`, planner
    ruling 2026-09-27 walk 2 round 3); everything else the analysis grid.
    The one reader for `check`'s slopeRule and `measure`/`describe`."""
    if (piece.role or {}).get("kind") not in ("parcel", "run") and hasattr(ground, "dressing_slope_deg"):
        got = ground.dressing_slope_deg(poly)
        if got is not None:
            return got
    return ground.footprint_max_slope_deg(poly)


def ground_report(cat: Catalogue, ground, piece: Piece) -> dict:
    """Ground under the footprint: heights (both samplers), delta, the
    compile's slope over touched cells (97 B3), wet share, and the float of
    the piece's own foot band over the chunk terrain (needs y)."""
    poly = footprint_province(cat, piece)
    ch = [ground.chunk_height(x, z) for x, z in poly]
    sv = [ground.survey_height(x, z) for x, z in poly]
    wet = sum(ground.wet(x, z) for x, z in poly)
    out = {"footprintVertices": len(poly),
           "chunks": {"min": min(ch), "max": max(ch), "mean": sum(ch) / len(ch)},
           "survey": {"min": min(sv), "max": max(sv), "mean": sum(sv) / len(sv)},
           "deltaM": max(ch) - min(ch),
           "maxSlopeDeg": footing_slope_deg(ground, piece, poly),
           "wetVertices": wet}
    if piece.y is not None:
        out.update(float_under(cat, ground, piece))
    return out


def float_under(cat: Catalogue, ground, piece: Piece) -> dict:
    """How far the piece's own foot band (the miner's `footprint` origins:
    foot-band vertices, CONTACT_M above the lowest point) stands over the
    streamed terrain. Positive float = air under the foot; negative = buried;
    `groundRiseM` the ground's highest minus lowest height under the foot."""
    mm = _mm()
    mesh = cat.mesh(piece.asset)
    verts = np.asarray(mesh.vertices)
    foot = mm.footprint(verts)
    foot[:, 2] -= mm.CONTACT_M
    world = piece.world_points(foot)
    under = np.array([ground.chunk_height(p[0], -p[1]) for p in world])
    diffs = world[:, 2] - under
    return {"footFloatMaxM": round(float(diffs.max()), 4),
            "footFloatMinM": round(float(diffs.min()), 4),
            "footFloatMeanM": round(float(diffs.mean()), 4),
            "footSamples": int(len(diffs)),
            # the ground's rise under the foot: highest minus lowest ground
            # height at the foot samples (propSeatRule's burial allowance)
            "groundRiseM": round(float(under.max() - under.min()), 4)}


FACING_TOLERANCE_DEG = 15.0
"""A doorway's recorded facing further than this from its wall's outward
direction is flagged (`facingOffOutwardDeg`)."""


def outward_deg(cat: Catalogue, asset: str, plan_xz) -> float | None:
    """The bearing (deg, clockwise from north, piece frame at yaw 0) the
    doorway looks out along: from the threshold to the nearest point of the
    piece's plan outline (from the outline out, when the threshold lies
    outside it). None when the piece has no measured outline."""
    from shapely.geometry import Point, Polygon
    outline = cat.footprint(asset)
    if not outline or len(outline) < 3:
        return None
    poly = Polygon([(float(p[0]), float(p[1])) for p in outline])
    pt = Point(float(plan_xz[0]), float(plan_xz[1]))
    edge = poly.exterior.interpolate(poly.exterior.project(pt))
    dx, dz = edge.x - pt.x, edge.y - pt.y
    if not poly.contains(pt):
        dx, dz = -dx, -dz
    if math.hypot(dx, dz) < 1e-6:
        return None
    return math.degrees(math.atan2(dx, -dz)) % 360.0


def door_report(cat: Catalogue, scene, piece: Piece) -> dict | None:
    """Every measured doorway of the piece (the compile's own
    `piece_doorways`) in the province frame, each with its distance to the
    nearest scene path centreline (97 C9: within 4 m); `best` is the doorway
    the compile would most likely bind (the one nearest a path)."""
    from shapely.geometry import LineString, Point
    rows = []
    lines = [(LineString(p["pointsM"]), p["id"]) for p in scene.paths if len(p["pointsM"]) >= 2]
    member = (piece.role or {}).get("kind") in ("run", "assembly")
    for d in cat.doorways(piece.asset):
        if member and d.get("source") == "assembly":
            # a door the plugins co-place WITH a run or assembly member (BM&V
            # bridge01's doorframe01, a walkway stair's farmhouse door) belongs
            # to the building the piece serves; the piece itself has no
            # threshold (planner ruling 2026-09-27, walk 2 lane P: the landing
            # spans read +3.6 to +4.6 m sills from them)
            continue
        ox, oz = d["offsetInPieceM"]
        x, z = plan_to_province((piece.x, piece.z), piece.yaw,
                                (ox * piece.scale, oz * piece.scale))
        near = min(((line.distance(Point(x, z)), pid) for line, pid in lines), default=None)
        out_deg = outward_deg(cat, piece.asset, (ox, oz))
        row = {"thresholdM": [round(x, 3), round(z, 3)], "source": d["source"],
               "facingDeg": None if d["sideDeg"] is None
               else round((piece.yaw + float(d["sideDeg"])) % 360, 1),
               "outwardDeg": None if out_deg is None else round((piece.yaw + out_deg) % 360, 1),
               "nearestPath": near and near[1],
               "pathDistanceM": None if near is None else round(near[0], 2)}
        if row["facingDeg"] is not None and row["outwardDeg"] is not None:
            off = abs((row["facingDeg"] - row["outwardDeg"] + 180) % 360 - 180)
            if off > FACING_TOLERANCE_DEG:
                # the record's sideDeg is the doorway's BEARING from the pivot
                # (radial records), not the way its wall faces
                row["facingOffOutwardDeg"] = round(off, 1)
        rows.append(row)
    if not rows:
        return None
    best = min(rows, key=lambda r: r["pathDistanceM"] if r["pathDistanceM"] is not None else 1e9)
    return {"best": best, "doorways": rows}
