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
