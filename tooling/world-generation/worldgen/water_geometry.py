"""Geometry operations for the water compiler, independent of asset paths.

Heights are interpolated along channel segments, never across river banks.
Dry-land coverage is a separate field: absent water has no height to average.
"""

from collections import deque
import heapq

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree


def sample_standing_levels(ground, pool_levels, points):
    """Continue an exact pool plane to its real subpixel shoreline.

Nearest-label sampling wrongly made a wet midpoint into a dry bank whenever
the nearest terrain corner was above the pool. Select a physically connected
corner's exact level; never average different standing-water elevations.
"""
    points = np.asarray(points)
    bed = ndimage.map_coordinates(ground, points.T, order=1, mode="nearest")
    base = np.floor(points).astype(int)
    result = np.full(len(points), -np.inf, np.float32)
    for dy, dx in ((0, 0), (0, 1), (1, 0), (1, 1)):
        corners = np.minimum(base + (dy, dx), np.array(ground.shape) - 1)
        level = pool_levels[corners[:, 0], corners[:, 1]]
        connected = np.isfinite(level) & (level > bed + .01)
        for fraction in (.25, .5, .75):
            between = corners * (1 - fraction) + points * fraction
            path_bed = ndimage.map_coordinates(ground, between.T, order=1, mode="nearest")
            connected &= path_bed < level
        result = np.where(connected, np.maximum(result, level), result)
    return result


def body_records(bodies):
    """Body indices resolve to native-grid identities at every export tier."""
    values, seeds = np.unique(bodies, return_index=True)
    width = bodies.shape[1]
    return [{"index": int(value),
             "id": f"water.province.cell-{int(seed // width)}-{int(seed % width)}"}
            for value, seed in zip(values, seeds) if value]


def downhill_graph(levels, links):
    """Orient the existing channel corridors by their actual surface level.

Terrain refinement can reverse an old coarse drainage link. Reversing its
current is valid; raising an entire upstream river to a now-unrelated ridge
is not. At junctions choose the steepest available descending branch.
"""
    levels = np.asarray(levels)
    result = np.full(len(levels), -1, np.int64)
    best_drop = np.zeros(len(levels))
    for source, target in enumerate(links):
        if target < 0:
            continue
        high, low = (source, target) if levels[source] > levels[target] else (target, source)
        drop = levels[high] - levels[low]
        if drop > best_drop[high]:
            best_drop[high] = drop
            result[high] = low
    # Backwater flattens the surface, not the drainage connection. Preserve
    # authored direction on accepted flat reaches unless a descending branch
    # has already provided a physically stronger outlet.
    for source, target in enumerate(links):
        if target >= 0 and result[source] < 0 and abs(levels[source] - levels[target]) <= 1e-5:
            result[source] = target
    return result


def monotone_backwater(levels, downstream):
    """Smallest raise-only solution W[upstream] >= W[downstream].

Use graph order, not elevation order: tied elevations and confluences must
    settle in one deterministic pass. Closed drainage cycles form one level
    pool; old float32 hydrology contains tied two-cell drainage cycles.
"""
    result = np.asarray(levels, dtype=np.float32).copy()
    downstream = np.asarray(downstream, dtype=np.int64)
    incoming = np.bincount(downstream[downstream >= 0], minlength=len(result))
    queue = deque(np.flatnonzero(incoming == 0).tolist())
    order = []
    while queue:
        index = queue.popleft()
        order.append(index)
        target = downstream[index]
        if target >= 0:
            incoming[target] -= 1
            if incoming[target] == 0:
                queue.append(int(target))
    remaining = incoming > 0
    for seed in np.flatnonzero(remaining):
        if not remaining[seed]:
            continue
        cycle = []
        index = int(seed)
        while remaining[index]:
            remaining[index] = False
            cycle.append(index)
            index = downstream[index]
        result[cycle] = np.max(result[cycle])
    for index in reversed(order):
        target = downstream[index]
        if target >= 0:
            result[index] = max(result[index], result[target])
    return result


def channel_surface(ground, points, downstream, levels, radius, active=None):
    """Project each ribbon pixel onto its nearest channel segment.

The water level is linear along that segment and constant perpendicular to
it. Four candidate segment midpoints resolve bends without raster terraces.
Returns surface, ribbon mask and nearest segment indices for flow/semantics.
"""
    shape = ground.shape
    surface = np.full(shape, np.nan, np.float32)
    owner = np.full(shape, -1, np.int32)
    if not len(points) or (active is not None and not np.any(active)):
        return surface, np.zeros(shape, bool), owner
    points = np.asarray(points, np.float64)
    ends = points[np.maximum(downstream, 0)].copy()
    ends[downstream < 0] = points[downstream < 0]
    delta = ends - points
    length2 = np.sum(delta * delta, axis=1)
    end_levels = levels[np.maximum(downstream, 0)].copy()
    end_levels[downstream < 0] = levels[downstream < 0]
    seeds = np.zeros(shape, bool)
    ij = np.rint(points).astype(int)
    active_indices = np.arange(len(points)) if active is None else np.flatnonzero(active)
    seeds[ij[active_indices, 0], ij[active_indices, 1]] = True
    distance = ndimage.distance_transform_edt(~seeds)
    pixels = np.column_stack(np.nonzero(distance <= float(np.max(radius)) + 3))
    tree = cKDTree(((points + ends) * 0.5)[active_indices])
    # Bound peak memory on the full province; no order-dependent blending.
    for start in range(0, len(pixels), 100000):
        batch = pixels[start:start + 100000]
        _, candidates = tree.query(batch, k=min(4, len(active_indices)))
        if candidates.ndim == 1:
            candidates = candidates[:, None]
        candidates = active_indices[candidates]
        offset = batch[:, None, :] - points[candidates]
        t = np.clip(np.sum(offset * delta[candidates], axis=2) /
                    np.maximum(length2[candidates], 1e-12), 0, 1)
        residual = offset - t[:, :, None] * delta[candidates]
        d2 = np.sum(residual * residual, axis=2)
        best = np.argmin(d2, axis=1)
        rows = np.arange(len(batch))
        segment = candidates[rows, best]
        inside = d2[rows, best] <= (radius[segment] + 0.5) ** 2
        y, x = batch[inside].T
        segment = segment[inside]
        u = t[rows, best][inside]
        surface[y, x] = levels[segment] * (1 - u) + end_levels[segment] * u
        owner[y, x] = segment
    return surface, np.isfinite(surface), owner


def refine_channel_stations(ground, points, downstream, levels, radius, minimum_depth=0.2, pool_levels=None,
                            routing_ground=None):
    """Resolve sub-station bed obstructions as narrow longitudinal riffles.

The source drainage grid is three terrain pixels apart. A native sample on
each segment prevents a straight chord cutting through the bed at a crest.
Only channel-centre constraints change; cross-sections remain level.
"""
    refined_points = [np.asarray(point) for point in points]
    refined_levels = list(levels)
    refined_radius = list(radius)
    refined_downstream = list(downstream)
    owners = list(range(len(points)))
    for source, target in enumerate(downstream):
        if target < 0:
            continue
        path = lowest_spill_path(ground if routing_ground is None else routing_ground, points[source], points[target],
                                 max_deviation=min(float(radius[source]), float(radius[target]), 2.0))
        # A diagonal between two sea vertices can cross a high dry corner
        # under bilinear terrain. Take the existing orthogonal sea corridor
        # when one exists; never draw a sea-to-rock-to-sea hump or excavate
        # a headland merely to preserve the coarse diagonal.
        coastal_path = [path[0]]
        for a, b in zip(path, path[1:]):
            cells = np.rint([a, b]).astype(int)
            if np.all(cells[0] != cells[1]) and np.all(ground[cells[:, 0], cells[:, 1]] < 0):
                midpoint = (a + b) * .5
                middle_bed = float(ndimage.map_coordinates(ground, midpoint[:, None], order=1)[0])
                if middle_bed >= 0:
                    corners = [np.array([a[0], b[1]]), np.array([b[0], a[1]])]
                    wet_corners = [corner for corner in corners if ground[tuple(np.rint(corner).astype(int))] < 0]
                    if wet_corners:
                        coastal_path.append(min(wet_corners, key=lambda corner: ground[tuple(np.rint(corner).astype(int))]))
            coastal_path.append(b)
        path = np.asarray(coastal_path)
        samples = [path[0]]
        for a, b in zip(path, path[1:]):
            steps = max(1, int(np.ceil(np.hypot(*(b - a)))))
            samples.extend(a + (b - a) * step / steps for step in range(1, steps + 1))
        samples = np.asarray(samples)
        distances = np.r_[0, np.cumsum(np.linalg.norm(np.diff(samples, axis=0), axis=1))]
        total = max(float(distances[-1]), 1e-6)
        previous = source
        for step in range(1, len(samples) - 1):
            fraction = distances[step] / total
            point = samples[step]
            bed = float(ndimage.map_coordinates(ground, point[:, None], order=1, mode="nearest")[0])
            level = (0.0 if bed < 0 else max(
                float(levels[source] * (1 - fraction) + levels[target] * fraction),
                bed + minimum_depth))
            if pool_levels is not None:
                pool = float(ndimage.map_coordinates(pool_levels, point[:, None], order=0, mode="nearest")[0])
                if np.isfinite(pool) and pool > bed + 0.01:
                    level = pool
            index = len(refined_points)
            refined_points.append(point)
            refined_levels.append(level)
            refined_radius.append(radius[source] * (1 - fraction) + radius[target] * fraction)
            refined_downstream[previous] = index
            refined_downstream.append(target)
            owners.append(source)
            previous = index
    return (np.asarray(refined_points), np.asarray(refined_downstream),
            np.asarray(refined_levels, np.float32), np.asarray(refined_radius), np.asarray(owners))


def lowest_spill_path(ground, start, end, max_deviation=2.0):
    """Trace the existing carved corridor rather than cutting a bed chord.

The search is confined to a two-native-pixel strip around the original
reach. Minimise the highest bed obstruction, then distance. No terrain edits.
"""
    start, end = np.asarray(start, float), np.asarray(end, float)
    origin = tuple(np.rint(start).astype(int))
    destination = tuple(np.rint(end).astype(int))
    if origin == destination:
        return np.asarray([start, end])
    delta = end - start
    length2 = max(float(delta @ delta), 1e-9)
    low = np.floor(np.minimum(start, end) - max_deviation).astype(int)
    high = np.ceil(np.maximum(start, end) + max_deviation).astype(int)
    best = {origin: (float(ground[origin]), 0.0)}
    previous = {}
    queue = [(float(ground[origin]), 0.0, *origin)]
    while queue:
        head, distance, y, x = heapq.heappop(queue)
        cell = (y, x)
        if best.get(cell) != (head, distance):
            continue
        if cell == destination:
            path = [cell]
            while path[-1] != origin:
                path.append(previous[path[-1]])
            result = np.asarray(path[::-1], float)
            result[0], result[-1] = start, end
            return result
        for dy, dx in ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)):
            ny, nx = y + dy, x + dx
            if not (max(low[0], 0) <= ny <= min(high[0], ground.shape[0] - 1) and
                    max(low[1], 0) <= nx <= min(high[1], ground.shape[1] - 1)):
                continue
            offset = np.array([ny, nx]) - start
            t = np.clip(float(offset @ delta) / length2, 0, 1)
            residual = offset - delta * t
            if float(residual @ residual) > max_deviation ** 2 + 1e-6:
                continue
            candidate = (max(head, float(ground[ny, nx])), distance + np.hypot(dy, dx))
            neighbour = (ny, nx)
            if candidate < best.get(neighbour, (np.inf, np.inf)):
                best[neighbour] = candidate
                previous[neighbour] = cell
                heapq.heappush(queue, (*candidate, ny, nx))
    return np.asarray([start, end])


def condition_channel_profiles(ground, points, links, levels, radius, original_count,
                               original_links, pool_levels=None, bank_ground=None):
    """Globally monotone reaches with shared junctions and measured bank caps.

Each coarse reach keeps one endpoint-to-endpoint flow direction. Native bed
bumps pond its upstream section; they never become new flow-dividing humps.
If the necessary head exceeds a bank or a pinned standing pool, the offending
reach is returned as an explicit terrain mismatch and excluded from water.
"""
    levels = np.asarray(levels, np.float32).copy()
    bank_ground = ground if bank_ground is None else bank_ground
    bed = ndimage.map_coordinates(ground, points.T, order=1, mode="nearest")
    directions = points[np.maximum(links, 0)] - points
    directions[links < 0] = 0
    for source, target in enumerate(links):
        if target >= 0 and np.hypot(*directions[target]) < 1e-9:
            directions[target] = points[target] - points[source]
    lengths = np.maximum(np.linalg.norm(directions, axis=1), 1e-9)
    perpendicular = np.column_stack([-directions[:, 1], directions[:, 0]]) / lengths[:, None]
    banks = []
    for sign in (-1, 1):
        bank = np.full(len(points), -np.inf)
        # Sample the whole actual cross-section. Three far-bank samples
        # skipped narrow intervening crests and falsely rejected contained
        # channels (the final audited case missed a59.84m crest as54.15m).
        for offset in np.arange(.25, float(np.max(radius, initial=0)) * 2 + .25, .25):
            distance = np.minimum(radius * 2, offset)
            sample_points = points + perpendicular * (distance * sign)[:, None]
            bank = np.maximum(bank, ndimage.map_coordinates(bank_ground, sample_points.T, order=1, mode="nearest"))
        banks.append(bank)
    # Desired band depth is not a hard floor: a riffle may become shallow.
    # Solve the feasible interval between actual bed clearance and banks.
    lower = bed + 0.03
    cap = np.maximum(lower, np.minimum(banks[0], banks[1]) - 0.03)
    if pool_levels is not None:
        pool = sample_standing_levels(ground, pool_levels, points)
        pinned = np.isfinite(pool) & (pool > bed + 0.01)
        levels[pinned] = pool[pinned]
        lower[pinned] = pool[pinned]
        cap[pinned] = pool[pinned]
    levels[bed < 0] = 0
    lower[bed < 0] = 0
    cap[bed < 0] = 0
    edges, edge_owner = [], []
    reach_paths = {}
    node_owner = np.full(len(points), -1, np.int64)
    node_owner[:original_count] = np.arange(original_count)
    for source in range(original_count):
        target = original_links[source]
        if target < 0:
            continue
        path = [source]
        cursor = links[source]
        while cursor != target and cursor >= 0:
            if cursor in path:
                raise ValueError("Native channel path cycles before reaching its endpoint")
            path.append(int(cursor))
            cursor = links[cursor]
        path.append(int(target))
        reach_paths[source] = path.copy()
        for node in path[1:-1]:
            node_owner[node] = source
        if levels[source] < levels[target]:
            path.reverse()
        for upstream, downstream in zip(path, path[1:]):
            edges.append((upstream, downstream))
            edge_owner.append(source)
    # Routed native paths can meet between coarse stations. Those crossings
    # are real junctions and must have one height, never overlapping sheets.
    same_position = {}
    for node, point in enumerate(points):
        key = tuple(np.round(point, 6))
        anchor = same_position.setdefault(key, node)
        if anchor != node:
            owner = int(node_owner[node])
            if owner >= 0:
                edges.extend(((anchor, node), (node, anchor)))
                edge_owner.extend((owner, owner))
    edges = np.asarray(edges, np.int64).reshape(-1, 2)
    edge_owner = np.asarray(edge_owner, np.int64)
    rejected = np.zeros(original_count, bool)
    conflicts = {}

    def solve(keep, initial, reverse=False, provenance=False):
        predecessors = [[] for _ in levels]
        for upstream, downstream in edges[keep]:
            if reverse:
                upstream, downstream = downstream, upstream
            predecessors[downstream].append(upstream)
        result = np.asarray(initial, np.float32).copy()
        origin = np.arange(len(points))
        heap = [(-float(value), index) for index, value in enumerate(result)]
        heapq.heapify(heap)
        while heap:
            negative, downstream = heapq.heappop(heap)
            value = -negative
            if value < result[downstream]:
                continue
            for upstream in predecessors[downstream]:
                if result[upstream] < value:
                    result[upstream] = value
                    origin[upstream] = origin[downstream]
                    heapq.heappush(heap, (-value, int(upstream)))
        return (result, origin) if provenance else result

    while True:
        keep = ~rejected[edge_owner]
        minimum, origin = solve(keep, lower, provenance=True)
        # Preserve at least half of the3cm hydraulic film. A3cm bank
        # tolerance previously consumed the entire clearance and allowed
        # an interior flowing node to settle on a1mm numerical contact.
        impossible = minimum > cap + 0.015
        if not impossible.any():
            break
        # Cut at the first bank that cannot contain the downstream head.
        # This avoids condemning every tributary upstream of one bad crest.
        bad_edges = keep & impossible[edges[:, 0]] & ~impossible[edges[:, 1]]
        if not bad_edges.any():
            raise ValueError("Unresolved channel bank constraint")
        successors = [[] for _ in levels]
        for upstream, downstream in edges[keep]:
            successors[upstream].append(downstream)
        for edge in np.flatnonzero(bad_edges):
            source = int(edge_owner[edge])
            node = int(edges[edge, 0])
            rejected[source] = True
            # All downstream obstructions above this receiving head need
            # conditioning, not merely today's highest one. Repairing a
            # single maximum walked centimetre-scale work along kilometres
            # of otherwise valid channel one full-province pass at a time.
            constrained_nodes = {node}
            queue = [node]
            while queue:
                current = queue.pop()
                for following in successors[current]:
                    if following not in constrained_nodes and minimum[following] > cap[node] + .015:
                        constrained_nodes.add(int(following))
                        queue.append(int(following))
            conflicts[source] = {"node": node, "requiredLevelM": float(minimum[node]),
                "bankCapM": float(cap[node]), "requiredRaiseM": float(minimum[node] - lower[node]),
                "obstructionNode": int(origin[node]),
                "obstructionBedM": float(bed[origin[node]]),
                # Flow-connected pools sit 8cm above their terrain sill.
                # Breaching only4cm below a receiving pool re-created4cm
                # of excess head on every priority-flood/repair iteration.
                "bedTargetM": float(cap[node] - 0.09),
                "pathNodes": reach_paths[source], "drainageNodes": sorted(constrained_nodes)}
    maximum = -solve(keep, -cap, reverse=True)
    target = np.minimum(np.maximum(levels, minimum), maximum)
    result = solve(keep, target)
    # The bank-feasibility epsilon must not become negative physical depth.
    # Remove sub-millimetre numerical contacts by backwatering the graph,
    # never by raising isolated vertices (which would reintroduce humps).
    result = solve(keep, np.maximum(result, np.where(bed < 0, 0, bed + 0.001)))
    active = np.zeros(len(points), bool)
    # Raster only the accepted directed segments; shared endpoints remain.
    valid_original = original_links.copy()
    valid_original[rejected] = -1
    for source in range(original_count):
        target = valid_original[source]
        if target < 0:
            continue
        cursor = source
        while cursor != target and cursor >= 0:
            active[cursor] = True
            cursor = links[cursor]
    if len(edges) and np.any(result[edges[keep, 0]] + 1e-5 < result[edges[keep, 1]]):
        raise ValueError("Conditioned channel contains an uphill flow segment")
    if np.any(result[active] < bed[active] - 0.001):
        raise ValueError("Conditioned channel lies below corrected native terrain")
    return result, active, valid_original, conflicts


def repair_channel_beds(original, corrected, points, conflicts, max_lowering=1.0,
                        exceptional_sources=()):
    """Breach small existing-channel sills, without changing either bank.

Only the native corners supporting a routed channel-centre sample may move.
The total bound is relative to immutable original terrain, not each iteration.
Pinned pool levels are not bed obstructions and cannot justify digging a hole.
"""
    changed = 0
    for source, conflict in conflicts.items():
        target = conflict["bedTargetM"]
        nodes = list(conflict.get("pathNodes", []))
        nodes.extend(conflict.get("drainageNodes", []))
        if abs(conflict["requiredLevelM"] - conflict["obstructionBedM"] - 0.03) <= 0.002:
            nodes.append(conflict["obstructionNode"])
        # A pinned pool can require breaching its actual channel sill, but
        # its deep floor is never lowered merely to reduce the pool's head.
        for node in set(nodes):
            point = points[node]
            # Exception authority is spatially local to the audited reach,
            # never inherited by remote tributaries in its drainage graph.
            limit = (5.0 if source in exceptional_sources and
                     np.max(np.abs(point - points[source])) <= 6 else max_lowering)
            current_bed = float(ndimage.map_coordinates(corrected, point[:, None], order=1)[0])
            if current_bed <= target:
                continue
            y, x = np.floor(point).astype(int)
            cells = {(min(y + dy, corrected.shape[0] - 1), min(x + dx, corrected.shape[1] - 1))
                     for dy in (0, 1) for dx in (0, 1)
                     if (1 - abs(point[0] - (y + dy))) * (1 - abs(point[1] - (x + dx))) > 1e-6}
            cells = sorted(cells)
            weights = np.array([(1 - abs(point[0] - cell[0])) * (1 - abs(point[1] - cell[1])) for cell in cells])
            remaining = np.array([max(0., float(corrected[cell] - original[cell]) + limit) for cell in cells])
            required = current_bed - target
            if float(weights @ remaining) < required - 1e-6:
                continue
            low, high = 0., float(np.max(remaining))
            for _ in range(30):
                middle = (low + high) * .5
                if float(weights @ np.minimum(remaining, middle)) < required:
                    low = middle
                else:
                    high = middle
            for cell, reduction in zip(cells, np.minimum(remaining, high)):
                value = float(corrected[cell]) - reduction
                if value < corrected[cell] - 1e-5:
                    corrected[cell] = value
                    changed += 1
    return changed


def repair_channel_films(original, corrected, points, links, levels, active, max_lowering=3.0):
    """Give flowing interior nodes a visible film without moving pool planes.

Terminal spring/shore tapers remain real shorelines. Interior millimetre-only
    contacts would be discarded by rendering, so lower only their native support
    corners enough for a12mm film, under the same cumulative routine repair cap.
"""
    incoming = np.zeros(len(points), bool)
    outgoing = active & (links >= 0)
    incoming[links[outgoing]] = True
    interior = outgoing & incoming
    bed = ndimage.map_coordinates(corrected, points.T, order=1, mode="nearest")
    thin = np.flatnonzero(interior & (levels - bed < .01))
    constraints = {int(node): {"requiredLevelM": float(bed[node] + .03),
        "obstructionBedM": float(bed[node]), "obstructionNode": int(node),
        "bedTargetM": float(levels[node] - .012), "pathNodes": [int(node)]} for node in thin}
    return repair_channel_beds(original, corrected, points, constraints, max_lowering=max_lowering)


def extend_surface(surface, ground, max_distance=24):
    """Extend physical water heights beneath banks without depressing edges.

The support raster, not a fabricated buried elevation, ends the surface.
Keeping a finite extrapolation outside support makes interpolation safe;
support is tested independently by both physics and rendering.
"""
    wet = np.isfinite(surface) & (surface > ground + 0.01)
    if not wet.any():
        return np.zeros_like(ground), np.zeros_like(wet), np.zeros(ground.shape, np.uint16)
    distance, nearest = ndimage.distance_transform_edt(~wet, return_indices=True)
    level = surface[tuple(nearest)].astype(np.float32)
    # Preserve dry bank samples inside authored ribbons: they hold the same
    # transverse plane and are what makes a subpixel shoreline find its level.
    authored = np.isfinite(surface)
    level[authored] = surface[authored]
    support = distance <= max_distance
    labels, count = ndimage.label(wet, structure=np.ones((3, 3)))
    if count > 65535:
        raise ValueError("Water body raster exceeds its 16-bit identity budget")
    bodies = labels[tuple(nearest)].astype(np.uint16)
    bodies[~support] = 0
    return level, support, bodies
