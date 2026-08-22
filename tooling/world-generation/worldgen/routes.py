"""Phase 4 macro transport: least-cost road corridors between anchor cities.

Roads are computed as Dijkstra least-cost paths over a terrain-derived cost
surface, so they hug dry ground, seek the cheapest water crossings and climb
through passes — pass-1 corridors for the owner-required major-city network,
not final geometry (the Phase 11 route compiler refines them).
"""

from __future__ import annotations

import heapq

import numpy as np

NEIGHBOR_OFFSETS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

# Relative per-metre traversal costs for road building.
COST_WETLAND = 3.0
COST_FLOOD_FREQUENT = 2.0
COST_MOUNTAIN = 3.0        # z above 40 m
COST_RIVER_CROSSING = 8.0  # medium+ river cell (bridge/ford)
COST_OPEN_WATER = 25.0     # lake or sea cell (ferry/causeway)
SLOPE_FACTOR = 30.0


def cost_surface(z: np.ndarray, slope: np.ndarray, ocean: np.ndarray, lakes: np.ndarray,
                 rivers: np.ndarray, wetlands: np.ndarray, flood: np.ndarray) -> np.ndarray:
    cost = 1.0 + slope * SLOPE_FACTOR
    cost = np.where(wetlands, cost * COST_WETLAND, cost)
    cost = np.where(flood == 3, cost * COST_FLOOD_FREQUENT, cost)
    cost = np.where(z > 40.0, cost * COST_MOUNTAIN, cost)
    cost = np.where(rivers >= 2, cost * COST_RIVER_CROSSING, cost)
    cost = np.where(ocean | lakes, cost * COST_OPEN_WATER, cost)
    return cost.astype(np.float64)


def routes_from(cost: np.ndarray, source: tuple[int, int],
                targets: list[tuple[int, int]], metres_per_px: float):
    """Dijkstra from source (x, y); returns {target: (path_xy, length_m)} with
    length as accumulated cost-free ground distance along the path."""
    h, w = cost.shape
    dist = np.full((h, w), np.inf)
    prev = np.full((h, w), -1, dtype=np.int64)
    sx, sy = source
    dist[sy, sx] = 0.0
    heap = [(0.0, sy, sx)]
    remaining = {t for t in targets}
    while heap and remaining:
        d, y, x = heapq.heappop(heap)
        if d > dist[y, x]:
            continue
        remaining.discard((x, y))
        for dy, dx in NEIGHBOR_OFFSETS:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w:
                step = np.hypot(dy, dx) * 0.5 * (cost[y, x] + cost[ny, nx])
                nd = d + step
                if nd < dist[ny, nx]:
                    dist[ny, nx] = nd
                    prev[ny, nx] = y * w + x
                    heapq.heappush(heap, (nd, ny, nx))
    out = {}
    for tx, ty in targets:
        if not np.isfinite(dist[ty, tx]):
            out[(tx, ty)] = ([], 0.0)
            continue
        path = []
        cur = ty * w + tx
        while cur >= 0:
            path.append((cur % w, cur // w))
            cur = prev[cur // w, cur % w]
        path.reverse()
        length_m = sum(
            np.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]) * metres_per_px
            for i in range(len(path) - 1)
        )
        out[(tx, ty)] = (path, length_m)
    return out
