"""Chunked trimesh queries, shared by worldgen and the placement workbench.

trimesh's ray caster and its closest-point query both build arrays over
every (query, candidate triangle) pair, so one call's memory grows as
queries x triangles: one ray call over a cell's ~10k join rays held 21 GiB
(KeebaHouseElder --reached, 2026-09-30), and one `on_surface` call over a
piece's surface samples held ~1.9 GiB per contact pair, times the fork pool
(place_gates greenspring, 2026-09-30). These run the same call a chunk at a
time, so the peak is bounded by the chunk; the results are the unchunked
call's (each query is independent), indices into the full input. Every
multi-query ray cast and closest-point call under tooling/ goes through
here (docs/standards/engineering.md, Memory discipline)."""
from __future__ import annotations

import numpy as np

RAY_CHUNK = 512      # rays per trimesh ray call
POINT_CHUNK = 512    # points per trimesh closest-point call


def cast_rays(mesh, origins, dirs, multiple_hits: bool = False):
    """`mesh.ray.intersects_location` in chunks of RAY_CHUNK rays: the same
    (locations, ray indices, triangle indices), ray indices into the full
    input. `dirs` may be one direction (3,) shared by every ray."""
    origins = np.asarray(origins, float).reshape(-1, 3)
    dirs = np.asarray(dirs, float)
    if dirs.ndim == 1:
        dirs = np.broadcast_to(dirs, origins.shape)
    locs, rays, tris = [np.zeros((0, 3))], [np.zeros(0, int)], [np.zeros(0, int)]
    for k in range(0, len(origins), RAY_CHUNK):
        lo_, r_, t_ = mesh.ray.intersects_location(origins[k:k + RAY_CHUNK], dirs[k:k + RAY_CHUNK],
                                                   multiple_hits=multiple_hits)
        locs.append(np.asarray(lo_, float).reshape(-1, 3))
        rays.append(np.asarray(r_, int) + k)
        tris.append(np.asarray(t_, int))
    return np.vstack(locs), np.concatenate(rays), np.concatenate(tris)


def on_surface(query, points):
    """`ProximityQuery.on_surface` (closest point, distance, triangle per
    point) in chunks of POINT_CHUNK points. `query` is a ProximityQuery or a
    Trimesh (a query is built for it)."""
    if not hasattr(query, "on_surface"):
        from trimesh.proximity import ProximityQuery
        query = ProximityQuery(query)
    points = np.asarray(points, float).reshape(-1, 3)
    if len(points) <= POINT_CHUNK:
        c, d, t = query.on_surface(points)
        return np.asarray(c, float).reshape(-1, 3), np.asarray(d, float), np.asarray(t, int)
    cs, ds, ts = [], [], []
    for k in range(0, len(points), POINT_CHUNK):
        c, d, t = query.on_surface(points[k:k + POINT_CHUNK])
        cs.append(np.asarray(c, float).reshape(-1, 3)); ds.append(np.asarray(d, float))
        ts.append(np.asarray(t, int))
    return np.vstack(cs), np.concatenate(ds), np.concatenate(ts)


def nearest_within(mesh, points, reach: float, skip=None, budget: int = 4_000_000) -> float:
    """The smallest distance from any of `points` to a triangle of `mesh`
    within `reach` (inf when none), skipping triangles where `skip` (bool
    per face) is true. One r-tree query over the points' whole box names
    the candidate triangles; each point then keeps those whose box meets its
    own +-reach box (a points x candidates test, chunked to `budget` pairs),
    and the closest point is trimesh's vectorised per-pair
    `triangles.closest_point` (`on_surface` runs a slower candidate search
    over every point first)."""
    from trimesh.triangles import closest_point
    points = np.asarray(points, float).reshape(-1, 3)
    if not len(points):
        return np.inf
    lo, hi = points.min(0) - reach, points.max(0) + reach
    cand = np.fromiter(mesh.triangles_tree.intersection(np.concatenate([lo, hi])), np.int64)
    if skip is not None:
        cand = cand[~skip[cand]]
    if not len(cand):
        return np.inf
    cand.sort()
    tris = mesh.triangles[cand]
    tlo, thi = (tris.min(1) - reach).astype(np.float32), (tris.max(1) + reach).astype(np.float32)
    p32 = points.astype(np.float32)
    chunk = max(1, budget // len(cand))
    best = np.inf
    for k in range(0, len(points), chunk):
        p, q = points[k:k + chunk], p32[k:k + chunk]
        near = (q[:, 0, None] >= tlo[None, :, 0]) & (q[:, 0, None] <= thi[None, :, 0])
        for ax in (1, 2):
            near &= (q[:, ax, None] >= tlo[None, :, ax]) & (q[:, ax, None] <= thi[None, :, ax])
        seg, ids = np.nonzero(near)
        if not len(ids):
            continue
        d = np.linalg.norm(closest_point(tris[ids], p[seg]) - p[seg], axis=1)
        best = min(best, float(d.min()))
        if best == 0.0:
            break
    return best if best <= reach else np.inf


def segments_hit(mesh, origins, dirs, lengths, chunk: int = 4096) -> np.ndarray:
    """Per segment (origin, unit dir, length): does it cross any triangle at
    0 <= t <= length? The answer of `cast_rays(..., multiple_hits=False)`
    followed by "first hit within length", without trimesh's ray candidate
    search, which clips every ray to the mesh's bounds and so tests a short
    wall probe against a room's worth of triangles (the interior walk spent
    ~50 s a cell there, walk 6). Candidates come from the triangle r-tree
    queried with each segment's own box, a chunk at a time."""
    origins = np.asarray(origins, float).reshape(-1, 3)
    dirs = np.asarray(dirs, float).reshape(-1, 3)
    lengths = np.asarray(lengths, float).reshape(-1)
    out = np.zeros(len(origins), bool)
    if not len(origins):
        return out
    tree = mesh.triangles_tree
    tris = mesh.triangles
    for k in range(0, len(origins), chunk):
        o, d, ln = origins[k:k + chunk], dirs[k:k + chunk], lengths[k:k + chunk]
        e = o + d * ln[:, None]
        lo, hi = np.minimum(o, e) - 1e-6, np.maximum(o, e) + 1e-6
        ids, counts = tree.intersection_v(lo, hi)
        seg = np.repeat(np.arange(len(o)), np.asarray(counts, np.int64))
        ids = np.asarray(ids, np.int64)
        if not len(seg):
            continue
        t = tris[ids]
        oo, dd = o[seg], d[seg]
        e1, e2 = t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]
        p = np.cross(dd, e2)
        det = np.einsum("ij,ij->i", e1, p)
        good = np.abs(det) > 1e-12
        inv = np.where(good, 1.0 / np.where(good, det, 1.0), 0.0)
        s = oo - t[:, 0]
        u = np.einsum("ij,ij->i", s, p) * inv
        q = np.cross(s, e1)
        v = np.einsum("ij,ij->i", dd, q) * inv
        dist = np.einsum("ij,ij->i", e2, q) * inv
        tol = 1e-8
        hit = good & (u >= -tol) & (v >= -tol) & (u + v <= 1 + tol) & (dist >= -tol) & (dist <= ln[seg])
        out[k + np.unique(seg[hit])] = True
    return out
