"""Reviewed sampling corrections within original pools or channel thalwegs.

Coarse station IDs remain stable. This repairs sampling of an existing water
body, never authorises excavating its retaining bank or moving its plane.
"""
import numpy as np
from .terrain_triangles import sample_terrain


def apply_station_overrides(points, cells, overrides, original, reference_pools, terrain_flips=None,
                            channel_context=None):
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
        if record.get('kind') == 'channel-thalweg':
            if (old.shape != (2,) or point.shape != (2,) or not np.isfinite(point).all()
                    or not np.allclose(old, result[i], atol=1e-7, rtol=0)):
                raise ValueError('Channel relocation does not match its original sampling anchor')
            context = (channel_context or {}).get(int(cell))
            if context is None:
                raise ValueError('Channel relocation requires original channel geometry')
            from .water_geometry import select_channel_anchors
            expected = select_channel_anchors(original, [context['centre']], [context['direction']],
                [context['radius']], [context['depth']], terrain_flips)[0]
            if not np.array_equal(point, expected) or np.array_equal(point, old):
                raise ValueError('Channel relocation must select the existing lateral thalweg without crossing a bank')
            if context.get('rivulet') and not context['footprint'][tuple(point.astype(int))]:
                raise ValueError('Channel relocation leaves the actual authored rivulet footprint')
            # This separate mode cannot change a real pool/sea sampling point.
            for sample in (old, point):
                y, x = np.rint(sample).astype(int)
                bed = float(sample_terrain(original, sample[:, None], terrain_flips)[0])
                if bed <= 0 or reference_pools[y, x] > bed + .01:
                    raise ValueError('Channel relocation cannot move original standing or marine water')
            result[i] = point
            continue
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
