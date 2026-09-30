"""Chunked trimesh ray casts, shared by worldgen and the placement workbench.

trimesh's pure-numpy caster tests every ray against every triangle its
(unbounded) ray box meets, so one call's memory grows as rays x triangles:
one call over a cell's ~10k join rays held 21 GiB (KeebaHouseElder
--reached, 2026-09-30). `cast_rays` makes the same call RAY_CHUNK rays at a
time, so the peak is bounded by the chunk, not the whole input. Every
multi-ray `intersects_location` under tooling/ goes through it."""
from __future__ import annotations

import numpy as np

RAY_CHUNK = 512  # rays per trimesh call


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
