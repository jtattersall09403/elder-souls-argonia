"""Exact piecewise-linear native terrain crests along channel bank rays."""
import numpy as np
from .terrain_triangles import sample_terrain


def bank_section_distances(point, normal, radius):
    end = float(radius) * 2
    start = min(.25, end)
    values = [start, end]
    for origin, direction in ((point[0], normal[0]), (point[1], normal[1]),
                              (sum(point), sum(normal)), (point[0]-point[1], normal[0]-normal[1])):
        if abs(direction) <= 1e-12:
            continue
        first, last = origin + direction*start, origin + direction*end
        integers = np.arange(np.ceil(min(first, last)), np.floor(max(first, last))+1)
        values.extend(((integers-origin)/direction).tolist())
    return np.unique(np.clip(values, start, end))


def bank_crest_heights(ground, points, normals, radii, terrain_flips=None):
    """Vectorised exact maxima, avoiding a Python loop over native stations.

    Both diagonal families are included; redundant knots on the unused
    diagonal cannot change the maximum of a linear terrain segment.
    """
    points, normals = np.asarray(points), np.asarray(normals)
    end = np.asarray(radii)*2
    start = np.minimum(.25, end)
    result = np.maximum(sample_terrain(ground, (points+normals*start[:, None]).T, terrain_flips),
                        sample_terrain(ground, (points+normals*end[:, None]).T, terrain_flips))
    coordinates = ((points[:, 0], normals[:, 0]), (points[:, 1], normals[:, 1]),
                   (points.sum(axis=1), normals.sum(axis=1)),
                   (points[:, 0]-points[:, 1], normals[:, 0]-normals[:, 1]))
    for origin, direction in coordinates:
        moving = abs(direction) > 1e-12
        sign = np.sign(direction)
        first = np.where(direction > 0, np.ceil(origin+direction*start),
                         np.floor(origin+direction*start))
        for step in range(int(np.ceil(np.max(abs(direction)*(end-start), initial=0)))+1):
            distance = (first+sign*step-origin)/np.where(moving, direction, 1.)
            selected = np.flatnonzero(moving & (distance >= start-1e-9) & (distance <= end+1e-9))
            if not len(selected):
                continue
            d = np.clip(distance[selected], start[selected], end[selected])
            p = points[selected] + normals[selected]*d[:, None]
            result[selected] = np.maximum(result[selected], sample_terrain(ground, p.T, terrain_flips))
    return result
