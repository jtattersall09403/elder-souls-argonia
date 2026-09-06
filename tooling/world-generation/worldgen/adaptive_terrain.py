"""Crack-free native-height terrain LOD with explicit water-bank accuracy.

Native leaves retain the renderer/Rapier anti-diagonal. Coarse leaves use
native-height perimeter vertices and a centre fan, with every neighbouring
leaf corner inserted into their edges. Chunk boundaries remain native so
independently selected LODs stitch without Gaussian height discrepancies.
No water level or original terrain sample is moved by this operation.
"""

import numpy as np


def adaptive_terrain(heights, protected_cells, max_step=4, flipped_cells=None, max_error_m=None):
    """Return local (x, height, z) lattice vertices and upward triangle indices.

    protected_cells has one Boolean per native quad, not per height sample.
    Caller supplies already decoded/corrected physical heights and scales
    local x/z by native metres-per-sample when exporting world geometry.
    Without max_error_m every protected cell remains native. With an explicit
    budget, only the protected domain may use error-bounded coarser leaves;
    unrelated dry leaves retain the existing max_step policy. The bound is
    in lattice coordinates; an exporter must also account for world Float32
    coordinate roundoff before advertising a final rendered error limit.
    """
    heights = np.asarray(heights)
    protected = np.asarray(protected_cells, dtype=bool)
    nz, nx = np.array(heights.shape) - 1
    if protected.shape != (nz, nx):
        raise ValueError("Protected terrain mask must describe every native quad")
    flipped = np.zeros((nz, nx), bool) if flipped_cells is None else np.asarray(flipped_cells, dtype=bool)
    if flipped.shape != (nz, nx):
        raise ValueError("Flipped terrain mask must describe every native quad")
    protected = protected | flipped
    if max_step not in (1, 2, 4, 8):
        raise ValueError("Terrain LOD step must be 1, 2, 4 or 8")
    if nx % max_step or nz % max_step or not np.isfinite(heights).all():
        raise ValueError("Terrain dimensions must align and heights must be finite")
    if max_error_m is not None and (not np.isfinite(max_error_m) or max_error_m < 0):
        raise ValueError("Terrain approximation error must be finite and non-negative")
    # Prefix sum makes recursive protection tests constant cost.
    sums = np.pad(protected.astype(np.int32), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    leaves = []

    def exceeds_error(x, z, size):
        native = heights[z:z + size + 1, x:x + size + 1].astype(np.float64)
        tx = np.arange(size + 1, dtype=np.float64)[None, :] / size
        tz = np.arange(size + 1, dtype=np.float64)[:, None] / size
        a, b, c, d = native[0, 0], native[0, -1], native[-1, 0], native[-1, -1]
        coarse = np.where(tx + tz <= 1, a * (1 - tx - tz) + b * tx + c * tz,
                          d * (tx + tz - 1) + b * (1 - tz) + c * (1 - tx))
        domain = protected[z:z + size, x:x + size]
        checked = np.zeros((size + 1, size + 1), bool)
        checked[:-1, :-1] |= domain
        checked[1:, :-1] |= domain
        checked[:-1, 1:] |= domain
        checked[1:, 1:] |= domain
        # Any perimeter sample can become a future stitching vertex. Check
        # all of those and the fan centre even outside the protected domain,
        # so an unchecked dry peak cannot tilt a fan through a water bank.
        checked[0, :] = checked[-1, :] = True
        checked[:, 0] = checked[:, -1] = True
        checked[size // 2, size // 2] = True
        # Native/coarse anti-diagonals intersect only at native vertices;
        # audited opposite diagonals are always forced native below. Thus
        # this is the exact pre-stitch L-infinity error. A stitch fan uses
        # native-height boundary/centre vertices within the same coarse
        # half-plane, adding at most this error again. Half-budget admission
        # therefore bounds the final mesh everywhere, not just at samples.
        return np.max(np.abs(native - coarse)[checked]) > max_error_m * 0.5

    def split(x, z, size):
        count = sums[z + size, x + size] - sums[z, x + size] - sums[z + size, x] + sums[z, x]
        edge = x == 0 or z == 0 or x + size == nx or z + size == nz
        needs_detail = count if max_error_m is None else (count and size > 1 and (
            np.any(flipped[z:z + size, x:x + size]) or exceeds_error(x, z, size)))
        if size > 1 and (needs_detail or edge):
            half = size // 2
            for dz, dx in ((0, 0), (0, half), (half, 0), (half, half)):
                split(x + dx, z + dz, half)
        else:
            leaves.append((x, z, size))

    for z in range(0, nz, max_step):
        for x in range(0, nx, max_step):
            split(x, z, max_step)
    # Registry of all leaf corners. Per-edge queries inspect at most9 native
    # positions, independent of province size (no global pairwise stitching).
    corners = set()
    for x, z, size in leaves:
        corners.update(((x, z), (x + size, z), (x, z + size), (x + size, z + size)))
    vertices, indices, by_point = [], [], {}

    def vertex(x, z):
        key = (x, z)
        if key not in by_point:
            by_point[key] = len(vertices)
            vertices.append((x, float(heights[z, x]), z))
        return by_point[key]

    for x, z, size in leaves:
        if size == 1:
            a, b = vertex(x, z), vertex(x + 1, z)
            c, d = vertex(x, z + 1), vertex(x + 1, z + 1)
            indices.extend(((a, c, d), (a, d, b)) if flipped[z, x] else ((a, c, b), (b, c, d)))
            continue
        perimeter = []
        # Counterclockwise in x/z gives +Y for the chosen fan ordering.
        for dx, dz, sx, sz in ((0, 0, 0, 1), (0, size, 1, 0),
                               (size, size, 0, -1), (size, 0, -1, 0)):
            for offset in range(size):
                point = (x + dx + sx * offset, z + dz + sz * offset)
                if point in corners:
                    perimeter.append(vertex(*point))
        if len(perimeter) == 4:
            # No neighbour inserted an edge corner: an ordinary two-triangle
            # quad is already crack-free. A centre fan here would double all
            # untouched dryland LOD geometry for no topological benefit.
            a, c, d, b = perimeter
            indices.extend(((a, c, b), (b, c, d)))
            continue
        centre = vertex(x + size // 2, z + size // 2)
        for i, a in enumerate(perimeter):
            indices.append((centre, a, perimeter[(i + 1) % len(perimeter)]))
    return np.asarray(vertices, np.float32), np.asarray(indices, np.uint32)
