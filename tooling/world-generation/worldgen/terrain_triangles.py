"""The native anti-diagonal terrain triangles used by rendering and Rapier."""

import heapq
import numpy as np
from scipy import ndimage


TERRAIN_CONNECTIVITY = np.array([[0, 1, 1], [1, 1, 1], [1, 1, 0]])
TERRAIN_NEIGHBOURS = ((-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0))


def terrain_weights(shape, coordinates, flips=None):
    y, x = np.asarray(coordinates, dtype=float)
    y, x = np.clip(y, 0, shape[0] - 1), np.clip(x, 0, shape[1] - 1)
    iy = np.minimum(np.floor(y).astype(int), shape[0] - 2)
    ix = np.minimum(np.floor(x).astype(int), shape[1] - 2)
    fy, fx = y - iy, x - ix
    upper = fx + fy <= 1
    rows = np.array([np.where(upper, iy, iy + 1), iy + 1, iy])
    cols = np.array([np.where(upper, ix, ix + 1), ix, ix + 1])
    weights = np.array([np.where(upper, 1 - fx - fy, fx + fy - 1),
                        np.where(upper, fy, 1 - fx), np.where(upper, fx, 1 - fy)])
    if flips is not None:
        changed = flips[iy, ix]
        above = fy <= fx
        rows = np.where(changed[None, ...], np.array([iy, iy + 1, np.where(above, iy, iy + 1)]), rows)
        cols = np.where(changed[None, ...], np.array([ix, ix + 1, np.where(above, ix + 1, ix)]), cols)
        weights = np.where(changed[None, ...], np.array([1 - np.maximum(fx, fy),
                           np.minimum(fx, fy), np.abs(fx - fy)]), weights)
    return rows, cols, weights


def sample_terrain(ground, coordinates, flips=None):
    rows, cols, weights = terrain_weights(ground.shape, coordinates, flips)
    return np.sum(ground[rows, cols] * weights, axis=0)


def fill_terrain_depressions(ground, ocean, flips=None):
    """Priority flood on actual mesh edges, not a fictitious eight-edge grid."""
    filled = np.asarray(ground, dtype=np.float32).copy()
    visited = ocean.copy()
    boundary = np.zeros(ground.shape, bool)
    boundary[0, :] = boundary[-1, :] = boundary[:, 0] = boundary[:, -1] = True
    boundary |= ocean & ~ndimage.binary_erosion(ocean, structure=TERRAIN_CONNECTIVITY)
    queue = [(float(filled[y, x]), int(y), int(x)) for y, x in zip(*np.nonzero(boundary))]
    heapq.heapify(queue)
    visited[boundary] = True
    height, width = ground.shape
    while queue:
        level, y, x = heapq.heappop(queue)
        neighbours = TERRAIN_NEIGHBOURS if flips is None else ((-1, -1), (-1, 0), (-1, 1), (0, -1),
                                                               (0, 1), (1, -1), (1, 0), (1, 1))
        for dy, dx in neighbours:
            ny, nx = y + dy, x + dx
            if 0 <= ny < height and 0 <= nx < width and not visited[ny, nx]:
                if dy and dx and flips is not None and bool(flips[min(y, ny), min(x, nx)]) != (dy == dx):
                    continue
                visited[ny, nx] = True
                target = max(level, float(filled[ny, nx]))
                filled[ny, nx] = target
                heapq.heappush(queue, (target, ny, nx))
    return filled


def label_terrain_components(mask, flips=None):
    if flips is None:
        return ndimage.label(mask, structure=TERRAIN_CONNECTIVITY)
    labels, count = ndimage.label(mask)
    parent = np.arange(count + 1)
    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for a, b, enabled in ((labels[:-1, :-1], labels[1:, 1:], flips),
                           (labels[1:, :-1], labels[:-1, 1:], ~flips)):
        join = enabled & (a > 0) & (b > 0) & (a != b)
        pairs = np.unique(np.column_stack([a[join], b[join]]), axis=0)
        for left, right in pairs:
            left, right = root(left), root(right)
            parent[max(left, right)] = min(left, right)
    for i in range(1, count + 1):
        parent[i] = root(i)
    _, compact = np.unique(parent, return_inverse=True)
    return compact[labels], int(compact.max(initial=0))


def derive_channel_diagonal_flips(ground, rivers, flow_to, step=3):
    """Open only authored NW/SE low-bed connections across opposite banks.

    The existing carver's diagonal blocks can meet at low vertices while the
    fixed opposite diagonal joins two high bank vertices. These explicitly
    audited quads need a topology correction, not deeper bank excavation.
    """
    flips = np.zeros((ground.shape[0] - 1, ground.shape[1] - 1), bool)
    records = {}
    width = rivers.shape[1]
    for source in np.flatnonzero(rivers.ravel()):
        target = int(flow_to.ravel()[source])
        if target < 0 or not rivers.flat[target]:
            continue
        row, col = divmod(int(source), width)
        tr, tc = divmod(target, width)
        if tr - row != tc - col or abs(tr - row) != 1:
            continue
        start = np.array([row * step + step // 2, col * step + step // 2], float)
        end = np.array([tr * step + step // 2, tc * step + step // 2], float)
        direction = end - start
        for y in range(max(0, int(min(start[0], end[0])) - 1),
                       min(flips.shape[0], int(max(start[0], end[0])) + 2)):
            for x in range(max(0, int(min(start[1], end[1])) - 1),
                           min(flips.shape[1], int(max(start[1], end[1])) + 2)):
                offset = np.array([y + .5, x + .5]) - start
                fraction = np.clip(float(offset @ direction) / float(direction @ direction), 0, 1)
                if np.linalg.norm(offset - fraction * direction) > 1:
                    continue
                nw, ne, sw, se = map(float, (ground[y, x], ground[y, x + 1], ground[y + 1, x], ground[y + 1, x + 1]))
                if max(nw, se) + .5 >= min(ne, sw):
                    continue
                flips[y, x] = True
                index = y * flips.shape[1] + x
                records.setdefault(index, {'cellIndex': index, 'sourceCell': int(source),
                    'targetCell': target, 'originalCornersM': [round(v, 6) for v in (nw, ne, sw, se)]})
    return flips, [records[index] for index in sorted(records)]
