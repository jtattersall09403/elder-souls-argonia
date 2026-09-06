"""Deterministic, residual-only alternatives inside an authored channel corridor.

These are candidate generators, not hydraulic authority. A caller must retain
only candidates that pass the full bank/longitudinal solve with no new failures.
The immutable native saddle and the existing corridor are hard constraints.
"""
import heapq
import numpy as np
from .terrain_triangles import sample_terrain


def route_peak(ground, path, terrain_flips=None):
    path = np.asarray(path, float)
    probes = np.vstack([path, (path[:-1] + path[1:]) * .5])
    return float(np.max(sample_terrain(ground, probes.T, terrain_flips)))


def validate_route_override(ground, previous, candidate, start, end, deviation, terrain_flips=None):
    path = np.asarray(candidate, float)
    if path.ndim != 2 or path.shape[1] != 2 or len(path) < 2 or not np.isfinite(path).all():
        raise ValueError('Invalid channel routing override')
    if not np.allclose(path[[0, -1]], [start, end], atol=1e-7, rtol=0):
        raise ValueError('Routing override changes authored anchors')
    if np.any(path < 0) or np.any(path >= np.asarray(ground.shape)):
        raise ValueError('Routing override leaves terrain')
    delta = np.asarray(end) - start
    offset = path - start
    fraction = np.clip(offset @ delta / max(float(delta @ delta), 1e-9), 0, 1)
    if np.max(np.linalg.norm(offset - fraction[:, None] * delta, axis=1)) > deviation + 1e-6:
        raise ValueError('Routing override leaves authored corridor')
    if np.any(np.max(np.abs(np.diff(path, axis=0)), axis=1) > 1 + 1e-6):
        raise ValueError('Routing override skips native terrain edges')
    if route_peak(ground, path, terrain_flips) > route_peak(ground, previous, terrain_flips) + 1e-5:
        raise ValueError('Routing override crosses a higher original bank/saddle')
    return path


def bank_aware_route(ground, previous, radius, depth, deviation=2., terrain_flips=None):
    """Minimise bank deficit, then distance, below the old immutable saddle.

Two separate scalar searches avoid the non-isotonic lexicographic-max trap:
a later high obstruction must not erase the ordering of earlier path costs.
Actual shared-section bank feasibility is deliberately left to the conditioner.
"""
    previous = np.asarray(previous, float)
    start, end = previous[[0, -1]]
    origin, destination = tuple(np.rint(start).astype(int)), tuple(np.rint(end).astype(int))
    if origin == destination:
        return previous.copy()
    peak = route_peak(ground, previous, terrain_flips)
    delta = end - start
    length2 = max(float(delta @ delta), 1e-9)
    low = np.maximum(0, np.floor(np.minimum(start, end) - deviation).astype(int))
    high = np.minimum(np.asarray(ground.shape) - 1, np.ceil(np.maximum(start, end) + deviation).astype(int))
    vertices = []
    for y in range(low[0], high[0] + 1):
        for x in range(low[1], high[1] + 1):
            offset = np.array([y, x]) - start
            t = np.clip(float(offset @ delta) / length2, 0, 1)
            if np.linalg.norm(offset - delta * t) <= deviation + 1e-6:
                vertices.append((y, x))
    allowed = set(vertices)
    edges = {}
    distances = np.minimum(2 * radius, np.arange(.25, 2 * radius + .25, .25))
    for vertex in vertices:
        choices = []
        for dy, dx in ((-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)):
            other = (vertex[0] + dy, vertex[1] + dx)
            if other not in allowed:
                continue
            edge = np.asarray([vertex, other], float)
            if route_peak(ground, edge, terrain_flips) > peak + 1e-5:
                continue
            normal = np.array([-dx, dy], float) / np.hypot(dy, dx)
            probes = np.vstack([edge, edge.mean(axis=0)])
            deficit = 0.
            for point in probes:
                bed = float(sample_terrain(ground, point[:, None], terrain_flips)[0])
                banks = [np.max(sample_terrain(ground,
                    point[:, None] + sign * normal[:, None] * distances, terrain_flips)) for sign in (-1, 1)]
                deficit = max(deficit, bed + depth + .005 - min(banks))
            choices.append((other, deficit, float(np.hypot(dy, dx))))
        edges[vertex] = choices
    best = {origin: 0.}
    queue = [(0., origin)]
    while queue:
        cost, vertex = heapq.heappop(queue)
        if cost != best.get(vertex):
            continue
        if vertex == destination:
            break
        for other, deficit, _ in edges.get(vertex, []):
            candidate = max(cost, deficit)
            if candidate < best.get(other, np.inf):
                best[other] = candidate
                heapq.heappush(queue, (candidate, other))
    if destination not in best:
        return previous.copy()
    bound = best[destination]
    best, parents, queue = {origin: 0.}, {}, [(0., origin)]
    while queue:
        distance, vertex = heapq.heappop(queue)
        if distance != best.get(vertex):
            continue
        if vertex == destination:
            path = [vertex]
            while path[-1] != origin:
                path.append(parents[path[-1]])
            path = np.asarray(path[::-1], float)
            path[0], path[-1] = start, end
            return validate_route_override(ground, previous, path, start, end, deviation, terrain_flips)
        for other, deficit, step in edges.get(vertex, []):
            candidate = distance + step
            if deficit <= bound + 1e-9 and candidate < best.get(other, np.inf):
                best[other], parents[other] = candidate, vertex
                heapq.heappush(queue, (candidate, other))
    return previous.copy()
