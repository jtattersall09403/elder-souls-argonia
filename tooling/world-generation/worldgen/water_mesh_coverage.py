"""Batched native-vertex coverage of actual exported channel triangles.

Uses the renderer's Float32 positions and barycentric tolerances. Evaluates
the supplied terrain at native vertices, not interpolated raster-proxy beds.
Geometry omissions remain omissions: this does not invent a channel surface.
"""

import numpy as np
from .water_coverage import stage_samples


def raster_channel_triangles(positions, access, responses, ground, targets,
                             metres_per_pixel, stage=None, tile_size=64, into=None):
    """Return geometry presence and low/base/maximum wet bits at target vertices.

    Inputs are N×3×3 XYZ positions, N×3 access, N×3×2 tide/season responses.
    Calls may cover only some exported records: false never proves the absence
    of water from records omitted by the caller. Union results across batches.
    Scratch memory is bounded by tile_size², including for very wide triangles.
    """
    p = np.asarray(positions, np.float32).astype(np.float64)
    a = np.asarray(access, np.float32).astype(np.float64)
    r = np.asarray(responses, np.float32).astype(np.float64)
    if p.ndim != 3 or p.shape[1:] != (3, 3) or a.shape != p.shape[:2] or r.shape != (*p.shape[:2], 2):
        raise ValueError('Invalid exported channel triangle attributes')
    if not all(np.isfinite(v).all() for v in (p, a, r)) or np.any((r < 0) | (r > 1)):
        raise ValueError('Channel triangles require finite attributes and valid responses')
    if ground.ndim != 2 or targets.shape != ground.shape or targets.dtype != np.bool_:
        raise ValueError('Channel targets must be a boolean native terrain grid')
    if not np.isfinite(ground[targets]).all():
        raise ValueError('Target terrain must be finite')
    if not np.isfinite(metres_per_pixel) or metres_per_pixel <= 0 or tile_size < 1:
        raise ValueError('Invalid native grid spacing or tile size')
    stages = tuple(stage_samples(stage).values())
    xs = (np.arange(ground.shape[1]) * metres_per_pixel).astype(np.float32).astype(np.float64)
    zs = (np.arange(ground.shape[0]) * metres_per_pixel).astype(np.float32).astype(np.float64)
    present, wet = into if into is not None else (np.zeros(ground.shape, bool), np.zeros(ground.shape, np.uint8))
    if present.shape != ground.shape or wet.shape != ground.shape or present.dtype != np.bool_ or wet.dtype != np.uint8:
        raise ValueError('Invalid coverage accumulation grids')
    for index, (v0, v1, v2) in enumerate(p):
        det = (v1[2] - v2[2]) * (v0[0] - v2[0]) + (v2[0] - v1[0]) * (v0[2] - v2[2])
        if abs(det) < 1e-9:
            continue  # Same projected-degeneracy rule as ChannelRibbonSampler.
        lo, hi = p[index].min(axis=0), p[index].max(axis=0)
        guard = (hi - lo) * 2e-7 + 1e-10
        x0, x1 = np.searchsorted(xs, [lo[0] - guard[0], hi[0] + guard[0]], side='left')
        z0, z1 = np.searchsorted(zs, [lo[2] - guard[2], hi[2] + guard[2]], side='left')
        for y in range(z0, min(z1 + 1, len(zs)), tile_size):
            for x in range(x0, min(x1 + 1, len(xs)), tile_size):
                yy, xx = np.nonzero(targets[y:min(y + tile_size, z1 + 1), x:min(x + tile_size, x1 + 1)])
                if not len(yy):
                    continue
                yy, xx = yy + y, xx + x
                dx, dz = xs[xx] - v2[0], zs[yy] - v2[2]
                u = ((v1[2] - v2[2]) * dx + (v2[0] - v1[0]) * dz) / det
                v = ((v2[2] - v0[2]) * dx + (v0[0] - v2[0]) * dz) / det
                w = 1 - u - v
                inside = (u >= -1e-7) & (v >= -1e-7) & (w >= -1e-7)
                yy, xx = yy[inside], xx[inside]
                weights = np.column_stack((u[inside], v[inside], w[inside]))
                present[yy, xx] = True
                head, barrier = weights @ p[index, :, 1], weights @ a[index]
                response = weights @ r[index]
                for bit, (tide, season) in enumerate(stages):
                    offset = response[:, 0] * tide + response[:, 1] * season
                    covered = (head + offset - ground[yy, xx] > .004) & (barrier <= offset + .001)
                    wet[yy[covered], xx[covered]] |= 1 << bit
    return present, wet


def audit_mesh_archive(directory, ground, targets, stage=None):
    """Hash-check exported batches and accumulate their native target coverage."""
    import hashlib
    import json
    from pathlib import Path
    from .water_coverage import require_compiled_stage
    directory = Path(directory)
    manifest = json.loads((directory / 'manifest.json').read_text())
    if manifest.get('schemaVersion') != 1:
        raise ValueError('Unsupported channel audit mesh version')
    require_compiled_stage(stage, manifest['stageRange'])
    coverage = (np.zeros(ground.shape, bool), np.zeros(ground.shape, np.uint8))
    for batch in manifest['batches']:
        arrays = {}
        for key, spec in batch['files'].items():
            content = (directory / spec['path']).read_bytes()
            if hashlib.sha256(content).hexdigest() != spec['sha256']:
                raise ValueError('Channel audit mesh hash mismatch')
            arrays[key] = np.frombuffer(content, dtype='<f4')
        n = batch['triangles']
        raster_channel_triangles(arrays['positions'].reshape(n, 3, 3), arrays['access'].reshape(n, 3),
                                 arrays['responses'].reshape(n, 3, 2), ground, targets,
                                 manifest['metresPerPixel'], stage=stage, into=coverage)
    return coverage, manifest
