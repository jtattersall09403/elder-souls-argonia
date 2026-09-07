"""Measured end fills, requiring explicit unrejected authored topology.

Diagnostic export only until between-ray ownership and native mesh acceptance.
Uses the existing coincident-section format, without changing channel heads.
"""

import numpy as np
from .water_geometry import _section_neighbours


def terminal_directions(points, links, original_count, accepted_links, authored_links, levels):
    """Open direction at true geometric ends, never at rejected continuations."""
    accepted, authored = np.asarray(accepted_links), np.asarray(authored_links)
    if accepted.shape != (original_count,) or authored.shape != accepted.shape:
        raise ValueError('Terminal fills require matching authored and accepted graphs')
    selected = accepted >= 0
    if np.any(accepted[selected] != authored[selected]):
        raise ValueError('Accepted terminal graph must be a subset of authored links')
    degree = (authored >= 0).astype(np.int64)
    np.add.at(degree, authored[authored >= 0], 1)
    keys, original = _section_neighbours(points, links, original_count, authored)
    _, remaining = _section_neighbours(points, links, original_count, accepted)
    heads = {}
    for key, level in zip(keys, levels):
        lo, hi = heads.get(key, (level, level))
        heads[key] = (min(lo, level), max(hi, level))
    result = {}
    for node in range(original_count):
        if degree[node] != 1:
            continue  # A routed hairpin can look like an end in coordinate space.
        key = keys[node]
        adjacent = original.get(key, set())
        if len(adjacent) != 1 or remaining.get(key, set()) != adjacent:
            continue
        lo, hi = heads[key]
        if not np.isfinite([lo, hi]).all() or hi - lo > 1e-4:
            continue
        outward = np.asarray(key) - np.asarray(next(iter(adjacent)))
        result[node] = outward / np.linalg.norm(outward)
    return result


def terminal_fill_records(record, path, directions, measure, emitted, sectors=8):
    """Add the open half-plane using independently terrain/owner-bounded rays.

    `measure(i, normal)` supplies the compiler's ordinary measured section at
    path position i. Keep the existing section at both joins exactly, including
    serialized offsets; adjacent sectors share their intermediate ray objects.
    """
    if not isinstance(sectors, int) or sectors < 2:
        raise ValueError('Terminal fill requires at least two angular sectors')
    records = []
    for i in (0, len(path) - 1):
        outward = directions.get(path[i])
        if outward is None:
            continue
        first = record['points'][i]
        key = (first['x'], first['y'], first['z'])
        if key in emitted:
            continue
        emitted.add(key)
        normal = np.array([first['crossSectionNormalZ'], first['crossSectionNormalX']])
        turn = np.pi if np.array([-normal[1], normal[0]]) @ outward > 0 else -np.pi
        rays = []
        for j, angle in enumerate(np.linspace(0, turn, sectors + 1)):
            desired = np.array([[np.cos(angle), -np.sin(angle)],
                                [np.sin(angle), np.cos(angle)]]) @ normal
            measured = first if j in (0, sectors) else measure(i, desired)
            actual = np.array([measured['crossSectionNormalZ'], measured['crossSectionNormalX']])
            sign = 1 if desired @ actual > 0 else -1
            ray = {**measured, 'crossSection': sorted(
                ({**sample, 'offsetM': sample['offsetM'] * sign}
                 for sample in measured['crossSection'] if sample['offsetM'] * sign >= 0),
                key=lambda sample: sample['offsetM']),
                'crossSectionNormalZ': measured['crossSectionNormalZ'] * sign,
                'crossSectionNormalX': measured['crossSectionNormalX'] * sign,
                'boundaryKinds': ['section-join', measured['boundaryKinds'][1 if sign > 0 else 0]]}
            ray.pop('fallingToNext', None)
            for field in ('seasonResponse', 'tideResponse'):
                if field in first:
                    ray[field] = first[field]
            rays.append(ray)
        for j in range(sectors):
            records.append({**record, 'id': record['id'] + f'.terminal-{i}-{j}',
                            'geometryRole': 'landing', 'points': rays[j:j + 2]})
    return records
