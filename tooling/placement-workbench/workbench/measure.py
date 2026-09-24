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
"""Penetration beyond this is reported as None (deeply crossing)."""


def _mm():
    paths.bridge()
    from worldgen import mine_mounts
    return mine_mounts


def samples(mesh) -> tuple[np.ndarray, np.ndarray]:
    """(points, outward normals) in the kit frame: seeded surface samples and
    every vertex (vertex normals)."""
    import trimesh
    pts, faces = trimesh.sample.sample_surface(mesh, SURFACE_SAMPLES, seed=0)
    verts = np.asarray(mesh.vertices)
    return (np.vstack([np.asarray(pts), verts]),
            np.vstack([np.asarray(mesh.face_normals[faces]), np.asarray(mesh.vertex_normals)]))


def _transform4(piece: Piece) -> np.ndarray:
    a, b = piece.matrix()
    t = np.eye(4)
    t[:3, :3] = a
    t[:3, 3] = b
    return t


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


def _separation(manager, a: Piece, direction) -> float | None:
    """How far A slides along `direction` before its triangles stop crossing
    B's (bisection to 1 mm); None past PENETRATION_REACH_M."""
    base = _transform4(a)

    def crossing(t: float) -> bool:
        m = base.copy()
        m[:3, 3] = base[:3, 3] + direction * t
        manager.set_transform("a", m)
        return bool(manager.in_collision_internal())

    if crossing(PENETRATION_REACH_M):
        return None
    lo, hi = 0.0, PENETRATION_REACH_M
    while hi - lo > 1e-3:
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if crossing(mid) else (lo, mid)
    manager.set_transform("a", base)
    return hi


def contact(cat: Catalogue, a: Piece, b: Piece) -> dict:
    """Gap / intersection / contact between two posed pieces.

    `gapM`: the EXACT smallest distance between the two triangle meshes
    (FCL via python-fcl), 0 when they touch or cross. `intersecting`: FCL's
    exact triangle-crossing test. `penetrationM`: when they cross, how far A
    must slide out along B's contact normal to clear it (None: more than
    0.5 m, or no contact patch to give a direction). `contact`: gapM <=
    CONTACT_M (0.03 m, the miner's threshold). `patchOfA`/`patchOfB`: where
    on each piece the contact lies (under: it stands on the other; side: it
    abuts or leans; top: the other rests on or hangs it)."""
    import trimesh
    if a.y is None or b.y is None:
        raise ValueError("both pieces need a height: settle or set y first")
    mm = _mm()
    manager = trimesh.collision.CollisionManager()
    manager.add_object("b", cat.mesh(b.asset), transform=_transform4(b))
    manager.add_object("a", cat.mesh(a.asset), transform=_transform4(a))
    intersecting = bool(manager.in_collision_internal())
    gap = 0.0 if intersecting else float(manager.min_distance_internal())
    ab_ = _one_way(cat, a, b)
    ba_ = _one_way(cat, b, a)
    pen = 0.0
    if intersecting:
        pen = None if ab_["normalOfB"] is None else _separation(manager, a, ab_["normalOfB"])
    return {
        "a": a.uid, "b": b.uid,
        "gapM": round(gap, 4), "intersecting": intersecting,
        "penetrationM": None if pen is None else round(pen, 3),
        "contact": gap <= mm.CONTACT_M,
        "contactPointsAonB": ab_["contactPoints"], "contactPointsBonA": ba_["contactPoints"],
        "patchOfA": ab_["patch"], "patchOfB": ba_["patch"],
    }


# --------------------------------------------------------------------------
# ground
# --------------------------------------------------------------------------
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
    lo, hi = min(heights), max(heights)
    line = lo if fit == "dug-in" else sum(heights) / len(heights)
    sink = sink_of(row) * piece.scale
    y = line - sink
    pivot_to_base = float(row["originOffsetM"][2]) * piece.scale
    return {"y": y, "mode": mode, "fit": fit, "anchorClass": klass, "source": source,
            "groundLineM": line, "terrainMinM": lo, "terrainMaxM": hi,
            "deltaM": hi - lo, "designedSinkM": sink, "samples": len(heights),
            "runtimeGapM": max(0.0, y - pivot_to_base - lo)}


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
           "maxSlopeDeg": ground.footprint_max_slope_deg(poly),
           "wetVertices": wet}
    if piece.y is not None:
        out.update(float_under(cat, ground, piece))
    return out


def float_under(cat: Catalogue, ground, piece: Piece) -> dict:
    """How far the piece's own foot band (the miner's `footprint` origins:
    foot-band vertices, CONTACT_M above the lowest point) stands over the
    streamed terrain. Positive float = air under the foot; negative = buried."""
    mm = _mm()
    mesh = cat.mesh(piece.asset)
    verts = np.asarray(mesh.vertices)
    foot = mm.footprint(verts)
    foot[:, 2] -= mm.CONTACT_M
    world = piece.world_points(foot)
    diffs = np.array([p[2] - ground.chunk_height(p[0], -p[1]) for p in world])
    return {"footFloatMaxM": round(float(diffs.max()), 4),
            "footFloatMinM": round(float(diffs.min()), 4),
            "footFloatMeanM": round(float(diffs.mean()), 4),
            "footSamples": int(len(diffs))}


def door_report(cat: Catalogue, scene, piece: Piece) -> dict | None:
    """The piece's measured entrance in the province frame and its distance
    to the nearest scene path centreline (97 C9: within 4 m)."""
    ent = (cat.interiors(piece.asset) or {}).get("entrance") or {}
    off = ent.get("offsetM")
    if not off:
        return None
    x, z = plan_to_province((piece.x, piece.z), piece.yaw,
                            (off[0] * piece.scale, off[1] * piece.scale))
    facing = None if ent.get("sideDeg") is None else (piece.yaw + float(ent["sideDeg"])) % 360
    best = None
    from shapely.geometry import LineString, Point
    for path in scene.paths:
        line = LineString(path["pointsM"])
        d = line.distance(Point(x, z))
        if best is None or d < best[0]:
            best = (d, path["id"])
    return {"thresholdM": [round(x, 3), round(z, 3)], "facingDeg": facing,
            "kind": ent.get("kind"), "nearestPath": best and best[1],
            "pathDistanceM": None if best is None else round(best[0], 2)}
