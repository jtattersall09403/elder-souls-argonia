"""Reviewed relocation of a dry sampling anchor onto its original pool shore.

Coarse station IDs remain stable. This repairs sampling of an existing water
body, never authorises excavating its retaining bank or moving its plane.
"""
import numpy as np
from .terrain_triangles import sample_terrain


def apply_station_overrides(points, cells, overrides, original, reference_pools, terrain_flips=None):
    result = np.asarray(points, float).copy()
    if not overrides:
        return result
    if reference_pools is None:
        raise ValueError('Station relocation requires immutable original pool evidence')
    lookup = {int(cell): i for i, cell in enumerate(cells)}
    for cell, record in sorted(overrides.items()):
        if int(cell) not in lookup:
            raise ValueError('Station relocation names no authored channel')
        i = lookup[int(cell)]
        old = np.asarray(record['previous'], float)
        point = np.asarray(record['point'], float)
        head = float(record['poolHeadM'])
        if (old.shape != (2,) or point.shape != (2,) or not np.isfinite(point).all()
                or not np.isfinite(head) or not np.allclose(old, result[i], atol=1e-7, rtol=0)):
            raise ValueError('Station relocation does not match its original sampling anchor')
        if (np.linalg.norm(point - old) > 2. + 1e-7 or not np.array_equal(point, np.rint(point))
                or np.any(point < 0) or np.any(point >= np.array(original.shape))):
            raise ValueError('Station relocation must use a native vertex within two original grid intervals')
        y, x = point.astype(int)
        old_bed = float(sample_terrain(original, old[:, None], terrain_flips)[0])
        if (old_bed < head - .01 or not np.isfinite(reference_pools[y, x])
                or abs(float(reference_pools[y, x]) - head) > .0001
                or original[y, x] >= head - .015):
            raise ValueError('Station relocation must move originally dry ground into the same original pool')
        result[i] = point
    return result
