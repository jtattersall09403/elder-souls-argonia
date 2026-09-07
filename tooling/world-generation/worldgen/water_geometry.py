"""Geometry operations for the water compiler, independent of asset paths.

Heights are interpolated along channel segments, never across river banks.
Dry-land coverage is a separate field: absent water has no height to average.
"""

from collections import deque
import heapq

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from .terrain_triangles import sample_terrain, terrain_weights, label_terrain_components


def connected_marine_terrain(ground, ocean_seeds, terrain_flips=None):
    """Negative terrain is marine only through an authored sea connection."""
    labels, count = label_terrain_components(ground < 0, terrain_flips)
    marine = np.zeros(count + 1, bool)
    marine[np.unique(labels[np.asarray(ocean_seeds, bool) & (ground < 0)])] = True
    marine[0] = False
    return marine[labels]


def sample_marine_mask(ground, marine, points, terrain_flips=None):
    bed = sample_terrain(ground, np.asarray(points).T, terrain_flips)
    if marine is None:
        return bed < 0
    rows, cols, weights = terrain_weights(ground.shape, np.asarray(points).T, terrain_flips)
    return (bed < 0) & np.any(marine[rows, cols] & (weights > 1e-9), axis=0)


def shared_section_normals(points, links, original_count, original_links):
    """One geometric cross-section normal across degree-two record joins."""
    keys = [tuple(np.round(point, 6)) for point in points]
    neighbours = {}
    for source in range(original_count):
        target = original_links[source]
        if target < 0:
            continue
        node = source
        while node != target:
            following = int(links[node])
            if following < 0:
                raise ValueError('Broken native channel graph')
            a, b = keys[node], keys[following]
            if a != b:
                neighbours.setdefault(a, set()).add(b)
                neighbours.setdefault(b, set()).add(a)
            node = following
    normals = {}
    for key, adjacent in neighbours.items():
        if len(adjacent) != 2:
            continue
        a, b = (np.array(other) - np.array(key) for other in sorted(adjacent))
        direction = b / np.linalg.norm(b) - a / np.linalg.norm(a)
        length = np.linalg.norm(direction)
        if length > 1e-6:
            normals[key] = np.array([direction[1], -direction[0]]) / length
    return [normals.get(key) for key in keys]


def select_channel_anchors(ground, centres, directions, radii, depths, terrain_flips=None):
    """Find an existing lateral thalweg, without crossing an intervening bank.

    Routing is derived once from immutable terrain. Longitudinal movement
    remains below three quarters of a native sample; only the semantic
    channel halfwidth replaces the old arbitrary one-pixel lateral limit.
    """
    centres, directions = np.asarray(centres), np.asarray(directions, float)
    radii, depths = np.asarray(radii, float), np.asarray(depths, float)
    directions = directions / np.maximum(np.linalg.norm(directions, axis=1), 1)[:, None]
    maximum = int(np.ceil(np.max(radii, initial=1)))
    offsets = np.array([(y, x) for y in range(-maximum, maximum + 1)
                        for x in range(-maximum, maximum + 1)])
    distance = np.linalg.norm(offsets, axis=1)
    positions = np.clip(centres[None] + offsets[:, None], 0, np.array(ground.shape) - 1)
    bed = sample_terrain(ground, [positions[:, :, 0], positions[:, :, 1]], terrain_flips)
    permitted = (abs(offsets @ directions.T) <= .75 + 1e-9) & (distance[:, None] <= radii + 1e-9)
    ranked = np.where(permitted, bed + distance[:, None] * 1e-6, np.inf)
    old_ranked = np.where(np.max(abs(offsets), axis=1)[:, None] <= 1, ranked, np.inf)
    old = np.argmin(old_ranked, axis=0)
    selected = positions[old, np.arange(len(centres))].copy()
    for station in np.flatnonzero(np.min(ranked, axis=0) < old_ranked[old, np.arange(len(centres))] - .02):
        current = selected[station].copy()
        head = float(bed[old[station], station] + depths[station])
        for candidate in np.argsort(ranked[:, station]):
            if ranked[candidate, station] >= old_ranked[old[station], station] - .02:
                break
            target = positions[candidate, station]
            fractions = np.linspace(0, 1, max(2, int(np.ceil(np.linalg.norm(target - current) * 4)) + 1))
            # Include actual native diagonal creases, not just uniform probes.
            for origin, delta in ((current[0], target[0] - current[0]),
                                  (current[1], target[1] - current[1]),
                                  (sum(current), sum(target - current)),
                                  (current[0] - current[1], (target - current)[0] - (target - current)[1])):
                if abs(delta) > 1e-9:
                    crossings = np.arange(np.ceil(min(origin, origin + delta)), np.floor(max(origin, origin + delta)) + 1)
                    fractions = np.r_[fractions, (crossings - origin) / delta]
            probes = current[:, None] * (1 - fractions) + target[:, None] * fractions
            if np.max(sample_terrain(ground, probes, terrain_flips)) <= head + 1e-6:
                selected[station] = target
                break
    return selected


def sample_standing_levels(ground, pool_levels, points, terrain_flips=None, pool_domain=None):
    """Continue an exact pool plane to its real subpixel shoreline.

Nearest-label sampling wrongly made a wet midpoint into a dry bank whenever
the nearest terrain corner was above the pool. Select a physically connected
corner's exact level; never average different standing-water elevations.
"""
    points = np.asarray(points)
    bed = sample_terrain(ground, points.T, terrain_flips)
    rows, cols, weights = terrain_weights(ground.shape, points.T, terrain_flips)
    result = np.full(len(points), -np.inf, np.float32)
    potential = None if pool_domain is None else sample_terrain(pool_domain[1], points.T, terrain_flips)
    for corner in range(3):
        level = pool_levels[rows[corner], cols[corner]]
        # Only positive-weight vertices of the actual native triangle own
        # this point. Searching all four neighbouring corners previously
        # pinned a dry/outlet vertex to a different pool across its boundary.
        # Along a real triangle edge, linear terrain has no hidden saddle.
        connected = (np.isfinite(level) & (weights[corner] > 1e-9) &
                     (level > bed + .01) & (level > ground[rows[corner],cols[corner]]))
        if pool_domain is not None:
            # Corner presence cannot project a pool downhill past its spill.
            connected &= potential >= pool_domain[0][rows[corner],cols[corner]]-1e-5
        result = np.where(connected, np.maximum(result, level), result)
    return result


def contain_pool_freeboards(pool_levels, pool_labels, filled, points, conflicts, minimum_head=.015,
                            immutable_labels=()):
    """Reduce only optional whole-pool flow head, never its physical sill.

    The nominal80mm flowing-pool head is not permission to spill sideways
    through a lower bank. A measured bank cap can reduce that freeboard while
    preserving a single standing plane and a positive outlet clearance.
    """
    updates = {}
    for conflict in conflicts.values():
        if conflict.get('obstructionPinned') is False:
            continue
        required = conflict['requiredLevelM']
        if required <= conflict['obstructionBedM'] + .032:
            continue
        base = np.floor(points[conflict['obstructionNode']]).astype(int)
        for offset in ((0, 0), (0, 1), (1, 0), (1, 1)):
            cell = tuple(np.clip(base + offset, 0, np.array(pool_levels.shape) - 1))
            old = float(pool_levels[cell])
            label = int(pool_labels[cell])
            if label in immutable_labels:continue
            cap = float(conflict['bankCapM'])
            if label and np.isfinite(old) and abs(old - required) <= .0001 and cap < old:
                if cap >= float(filled[cell]) + minimum_head:
                    updates[label] = min(updates.get(label, old), cap)
    changes = []
    for label, level in sorted(updates.items()):
        mask = pool_labels == label
        old = float(np.max(pool_levels[mask]))
        pool_levels[mask] = level
        changes.append({'poolLabel': label, 'fromM': old, 'toM': float(np.float32(level))})
    return changes


def body_records(bodies):
    """Body indices resolve to native-grid identities at every export tier."""
    values, seeds = np.unique(bodies, return_index=True)
    width = bodies.shape[1]
    return [{"index": int(value),
             "id": f"water.province.cell-{int(seed // width)}-{int(seed % width)}"}
            for value, seed in zip(values, seeds) if value]


def downhill_graph(levels, links, orientation_levels=None):
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
    intent = levels if orientation_levels is None else np.asarray(orientation_levels)
    for source, target in enumerate(links):
        if target < 0 or abs(levels[source] - levels[target]) > 1e-5:
            continue
        high, low = (target, source) if intent[source] < intent[target] else (source, target)
        if result[high] < 0:
            result[high] = low
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
                            routing_ground=None, terrain_flips=None, marine_ground=None, routing_overrides=None,
                            pool_domain=None):
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
    depths = np.broadcast_to(np.asarray(minimum_depth, dtype=float), (len(points),))
    for source, target in enumerate(downstream):
        if target < 0:
            continue
        path = lowest_spill_path(ground if routing_ground is None else routing_ground, points[source], points[target],
                                 max_deviation=min(float(radius[source]), float(radius[target]), 2.0), terrain_flips=terrain_flips)
        routing = ground if routing_ground is None else routing_ground
        wider = min(float(radius[source]), float(radius[target]))
        if wider > 2:
            candidate = lowest_spill_path(routing, points[source], points[target], wider, terrain_flips)
            maximum = lambda p: float(np.max(sample_terrain(routing, np.vstack([p, (p[:-1] + p[1:]) * .5]).T, terrain_flips)))
            if maximum(candidate) < maximum(path) - .02:
                path = candidate
        if pool_levels is not None:
            endpoint_pool = sample_standing_levels(ground, pool_levels, points[[source, target]], terrain_flips, pool_domain)
            if np.all(np.isfinite(endpoint_pool)) and abs(endpoint_pool[0] - endpoint_pool[1]) <= .0001:
                # Two points in one actual pool need no artificial chord
                # over an intervening mound. Search the authored channel's
                # full semantic width, accepting only an already-wet route.
                wider = 2 * min(float(radius[source]), float(radius[target]))
                if wider > 2:
                    candidate = lowest_spill_path(ground if routing_ground is None else routing_ground,
                        points[source], points[target], max_deviation=wider, terrain_flips=terrain_flips,
                        allowed=lambda y,x: abs(float(pool_levels[y,x])-endpoint_pool[0]) <= .0001)
                    probes = np.vstack([candidate, (candidate[:-1] + candidate[1:]) * .5])
                    candidate_pools = sample_standing_levels(ground, pool_levels, probes, terrain_flips, pool_domain)
                    if (np.all(sample_terrain(ground, probes.T, terrain_flips) < endpoint_pool.min() - .015)
                            and np.all(abs(candidate_pools-endpoint_pool[0]) <= .0001)):
                        path = candidate
        if routing_overrides and source in routing_overrides:
            from .water_route_alternatives import validate_route_override
            path = validate_route_override(routing, path, routing_overrides[source],
                points[source], points[target], min(float(radius[source]), float(radius[target])), terrain_flips)
        # A diagonal between two sea vertices can cross a high dry corner
        # under bilinear terrain. Take the existing orthogonal sea corridor
        # when one exists; never draw a sea-to-rock-to-sea hump or excavate
        # a headland merely to preserve the coarse diagonal.
        coastal_path = [path[0]]
        for a, b in zip(path, path[1:]):
            cells = np.rint([a, b]).astype(int)
            sea_endpoints = (ground[cells[:, 0], cells[:, 1]] < 0 if marine_ground is None else
                             marine_ground[cells[:, 0], cells[:, 1]])
            if np.all(cells[0] != cells[1]) and np.all(sea_endpoints):
                midpoint = (a + b) * .5
                middle_bed = float(sample_terrain(ground, midpoint[:, None], terrain_flips)[0])
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
        sample_beds = sample_terrain(ground, samples.T, terrain_flips)
        marine_samples = sample_marine_mask(ground, marine_ground, samples, terrain_flips)
        pool_samples = (sample_standing_levels(ground, pool_levels, samples, terrain_flips, pool_domain)
                        if pool_levels is not None else np.full(len(samples),-np.inf))
        distances = np.r_[0, np.cumsum(np.linalg.norm(np.diff(samples, axis=0), axis=1))]
        total = max(float(distances[-1]), 1e-6)
        previous = source
        for step in range(1, len(samples) - 1):
            fraction = distances[step] / total
            point = samples[step]
            bed = float(sample_beds[step])
            level = (0.0 if marine_samples[step] else max(
                float(levels[source] * (1 - fraction) + levels[target] * fraction),
                bed + depths[source] * (1 - fraction) + depths[target] * fraction))
            if pool_levels is not None:
                pool = float(pool_samples[step])
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


def channel_depth_targets(points, links, original_links, depths):
    result = np.empty(len(points), np.float32)
    count = len(original_links)
    result[:count] = depths
    for source, target in enumerate(original_links):
        if target < 0:
            continue
        path = [source]
        cursor = links[source]
        while cursor != target and cursor >= 0:
            path.append(int(cursor))
            cursor = links[cursor]
        path.append(int(target))
        distance = np.r_[0., np.cumsum(np.linalg.norm(np.diff(points[path], axis=0), axis=1))]
        fraction = distance / max(distance[-1], 1e-9)
        result[path[1:-1]] = depths[source] * (1 - fraction[1:-1]) + depths[target] * fraction[1:-1]
    return result


def lowest_spill_path(ground, start, end, max_deviation=2.0, terrain_flips=None, allowed=None):
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
            if allowed is not None and not allowed(ny,nx):
                continue
            # NW/SE is not a terrain edge: its chord crosses the mesh's
            # anti-diagonal midpoint. Account for that real saddle before
            # choosing a supposedly unobstructed shortest diagonal.
            flipped = terrain_flips is not None and terrain_flips[min(y, ny), min(x, nx)]
            off_edge = dy and dx and bool(flipped) != (dy == dx)
            if allowed is not None and off_edge:
                # A same-pool path cannot shortcut across a foreign outlet
                # triangle merely because its bare terrain is lower.
                continue
            saddle = (float(ground[y, nx]) + float(ground[ny, x])) * .5 if off_edge else -np.inf
            candidate = (max(head, float(ground[ny, nx]), saddle), distance + np.hypot(dy, dx))
            neighbour = (ny, nx)
            if candidate < best.get(neighbour, (np.inf, np.inf)):
                best[neighbour] = candidate
                previous[neighbour] = cell
                heapq.heappush(queue, (*candidate, ny, nx))
    return np.asarray([start, end])


def condition_channel_profiles(ground, points, links, levels, radius, original_count,
                               original_links, pool_levels=None, bank_ground=None, terrain_flips=None,
                               orientation_levels=None, diagnostics=None, minimum_depth=.03, strict_banks=False,
                               metres_per_pixel=1., allow_freefall=False, marine_ground=None, pool_domain=None):
    """Globally monotone reaches with shared junctions and measured bank caps.

Each coarse reach keeps one endpoint-to-endpoint flow direction. Native bed
bumps pond its upstream section; they never become new flow-dividing humps.
If the necessary head exceeds a bank or a pinned standing pool, the offending
reach is returned as an explicit terrain mismatch and excluded from water.
"""
    levels = np.asarray(levels, np.float32).copy()
    intent = levels.copy() if orientation_levels is None else np.asarray(orientation_levels)
    bank_ground = ground if bank_ground is None else bank_ground
    bed = sample_terrain(ground, points.T, terrain_flips)
    marine = sample_marine_mask(ground, marine_ground, points, terrain_flips)
    directions = points[np.maximum(links, 0)] - points
    directions[links < 0] = 0
    for source, target in enumerate(links):
        if target >= 0 and np.hypot(*directions[target]) < 1e-9:
            directions[target] = points[target] - points[source]
    lengths = np.maximum(np.linalg.norm(directions, axis=1), 1e-9)
    perpendicular = np.column_stack([-directions[:, 1], directions[:, 0]]) / lengths[:, None]
    shared_normals = shared_section_normals(points, links, original_count, original_links)
    for index, normal in enumerate(shared_normals):
        if normal is not None:
            perpendicular[index] = normal
    along_bank = np.column_stack([-directions[:, 1], directions[:, 0]]) / lengths[:, None]
    correction = np.minimum(2., 1 / np.maximum(.5, abs(np.sum(perpendicular * along_bank, axis=1))))
    bank_radius = np.asarray(radius) * correction
    from .water_bank_sections import bank_crest_heights
    banks = [bank_crest_heights(bank_ground, points, perpendicular*sign, bank_radius, terrain_flips)
             for sign in (-1, 1)]
    # The compiler supplies semantic channel depth; legacy callers retain
    # their shallow-film default. Real pinned pools keep their own plane.
    depth_targets = np.broadcast_to(np.asarray(minimum_depth, float), bed.shape).copy()
    lower = bed + depth_targets
    # Bank containment is a physical crest constraint, not a fixed3cm air
    # freeboard. Requiring that arbitrary gap rejected a real pool13.9mm
    # below its bank and invited needless floor excavation. Retain5mm for
    # PNG/Float32 quantisation; dynamic stages use explicit spill access.
    cap = np.minimum(banks[0], banks[1]) - 0.005
    if not strict_banks:
        cap = np.maximum(lower, cap)
    pinned = np.zeros(len(points), bool)
    if pool_levels is not None:
        pool = sample_standing_levels(ground, pool_levels, points, terrain_flips, pool_domain)
        pinned = np.isfinite(pool) & (pool > bed + 0.01)
        levels[pinned] = pool[pinned]
        lower[pinned] = pool[pinned]
        cap[pinned] = pool[pinned]
    if strict_banks and np.any(pinned):
        # A real pool outlet starts at its shallow sill, not an instantaneous
        # full-depth trench. Taper over two native intervals only; ordinary
        # reaches retain their semantic depth, including long flat channels.
        distances = np.where(pinned, 0., np.inf)
        sources = np.flatnonzero(links >= 0)
        targets = links[sources]
        lengths = np.linalg.norm(points[sources]-points[targets], axis=1)
        for _ in range(4):
            previous = distances.copy()
            np.minimum.at(distances, sources, previous[targets]+lengths)
            np.minimum.at(distances, targets, previous[sources]+lengths)
        near = ~pinned & (distances < 2.)
        depth_targets[near] = np.maximum(.015, depth_targets[near]*distances[near]/2.)
        lower[near] = bed[near]+depth_targets[near]
    levels[marine] = 0
    lower[marine] = 0
    cap[marine] = 0
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
        if intent[source] < intent[target]:
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
    falling = np.zeros(len(points), bool)
    if allow_freefall and len(edges):
        upstream, downstream = edges.T
        run = np.linalg.norm(points[upstream] - points[downstream], axis=1) * metres_per_pixel
        reach_drop = np.abs(bed[:original_count] - bed[np.maximum(original_links, 0)])
        free_segments = ((run > 1e-6) & (bed[upstream] - bed[downstream] >= run)
                         & (reach_drop[edge_owner] >= 2.))
        falling[upstream[free_segments]] = True
        falling &= ~pinned & ~marine
        # A gravity-driven sheet crossing a real cliff has no retaining
        # lateral bank. Its incident head and landing remain separate;
        # measuring the ravine below as its bank would demand excavation
        # through the cliff instead of producing a falling curtain.
        cap[falling] = np.maximum(cap[falling], lower[falling])
    rejected = np.zeros(original_count, bool)
    conflicts = {}
    if strict_banks:
        for node in np.flatnonzero(lower > cap + .0001):
            owners_here = np.unique(edge_owner[np.any(edges == node, axis=1)])
            for owner in owners_here:
                source = int(owner)
                rejected[source] = True
                conflict = {'node': int(node), 'requiredLevelM': float(lower[node]),
                    'bankCapM': float(cap[node]), 'requiredRaiseM': 0.,
                    'obstructionNode': int(node), 'obstructionBedM': float(bed[node]),
                    'obstructionPinned': False, 'nodeBankCaps': {int(node): float(cap[node])},
                    'bedTargetM': float(cap[node] - depth_targets[node] - .01),
                    'pathNodes': [int(node)], 'drainageNodes': [int(node)], 'localBankConstraint': True}
                previous = conflicts.get(source)
                if previous:
                    nodes = previous['drainageNodes'] + [int(node)]
                    caps = {**previous['nodeBankCaps'], **conflict['nodeBankCaps']}
                    if previous['bankCapM'] < conflict['bankCapM']:
                        conflict = previous
                    conflict['pathNodes'] = conflict['drainageNodes'] = sorted(set(nodes))
                    conflict['nodeBankCaps'] = caps
                conflicts[source] = conflict

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
        # Feasibility tolerance is numerical only, never permission to
        # replace physical banks with a minimum-depth surface mound.
        used = np.zeros(len(points), bool)
        used[edges[keep].ravel()] = True
        impossible = (minimum > cap + 0.0001) & used
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
                    if following not in constrained_nodes and minimum[following] > cap[node] + .0001:
                        constrained_nodes.add(int(following))
                        queue.append(int(following))
            conflicts[source] = {"node": node, "requiredLevelM": float(minimum[node]),
                "bankCapM": float(cap[node]), "requiredRaiseM": float(minimum[node] - lower[node]),
                "obstructionNode": int(origin[node]),
                "obstructionBedM": float(bed[origin[node]]),
                "obstructionPinned": bool(pinned[origin[node]]),
                # Flow-connected pools sit 8cm above their terrain sill.
                # Breaching only4cm below a receiving pool re-created4cm
                # of excess head on every priority-flood/repair iteration.
                "bedTargetM": float(cap[node] - (depth_targets[origin[node]] + .01 if strict_banks else .09)),
                "pathNodes": reach_paths[source], "drainageNodes": sorted(constrained_nodes)}
    from .water_reach_acceptance import restore_feasible_reaches
    keep, restored = restore_feasible_reaches(edges, edge_owner, keep, lower, cap, minimum)
    if restored:
        rejected[restored] = False
        for source in restored:
            conflicts.pop(source, None)
        minimum, origin = solve(keep, lower, provenance=True)
    if diagnostics is not None:
        negative_maximum, maximum_origin = solve(keep, -cap, reverse=True, provenance=True)
        maximum = -negative_maximum
        diagnostics.update(bed=bed, measuredBankCap=np.minimum(banks[0], banks[1]) - .005,
                           bankCap=cap, minimum=minimum, maximum=maximum,
                           maximumOrigin=maximum_origin, minimumOrigin=origin,
                           depthTargets=depth_targets, pinned=pinned | marine, falling=falling,
                           bankNormals=perpendicular, bankRadius=bank_radius)
    else:
        maximum = -solve(keep, -cap, reverse=True)
    target = np.minimum(np.maximum(levels, minimum), maximum)
    result = solve(keep, target)
    # The bank-feasibility epsilon must not become negative physical depth.
    # Remove sub-millimetre numerical contacts by backwatering the graph,
    # never by raising isolated vertices (which would reintroduce humps).
    result = solve(keep, np.maximum(result, np.where(marine, 0, bed + 0.001)))
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


def coupled_bank_lowering(current_bed, weights, remaining, bank_heights, coefficients, depth):
    """Exact first feasible common corner reduction on a bounded ray.

    Corner budgets create linear intervals. Within each, feasibility changes
    only where a sampled bank crosses bed + depth + containment clearance.
    Checking all such roots handles either bank's changing maximum and even
    non-monotone fractional-corner influence without iterative trial digging.
    """
    boundaries = np.unique(np.r_[0., remaining])
    def clearance(amount):
        reduction = np.minimum(remaining, amount)
        bed = current_bed - float(weights @ reduction)
        return bank_heights - coefficients @ reduction - bed - depth - .015
    for lo, hi in zip(boundaries, boundaries[1:]):
        first, last = clearance(lo), clearance(hi)
        delta = last - first
        moving = abs(delta) > 1e-12
        roots = lo - first[moving] * (hi - lo) / delta[moving]
        candidates = np.unique(np.r_[lo, roots[(roots >= lo) & (roots <= hi)], hi])
        for candidate in candidates:
            if np.min(np.max(clearance(candidate).reshape(2, -1), axis=1)) >= -1e-9:
                return min(float(candidate) + 1e-6, float(boundaries[-1]))
    return None


def bounded_bank_correction(current_bed, weights, remaining, bank_heights, coefficients, depth):
    """Preserve banks by choosing unequal supporting-corner cuts if needed.

    A common reduction is cheap and normally sufficient, but not a proof of
    infeasibility: one corner may support the bank more than the centre.
    For the exceptional case, each surviving pair of bank crests is a tiny
    linear feasibility problem (at most three native triangle corners).
    """
    amount = coupled_bank_lowering(current_bed, weights, remaining, bank_heights, coefficients, depth)
    if amount is not None:
        return np.minimum(remaining, amount)
    from scipy.optimize import linprog
    constants = bank_heights - current_bed - depth - .015
    influence = weights[None, :] - coefficients
    half = len(constants) // 2
    candidates = []
    for indices in (range(half), range(half, 2 * half)):
        possible = [i for i in indices if constants[i] + np.maximum(influence[i], 0) @ remaining >= -1e-9]
        # Componentwise dominance over the nonnegative correction box.
        kept = []
        for i in possible:
            if any(constants[j] >= constants[i] - 1e-12 and np.all(influence[j] >= influence[i] - 1e-12)
                   and (constants[j] > constants[i] + 1e-12 or np.any(influence[j] > influence[i] + 1e-12) or j < i)
                   for j in possible if j != i):
                continue
            kept.append(i)
        candidates.append(kept)
    best = None
    for first in candidates[0]:
        for second in candidates[1]:
            indices = [first, second]
            solved = linprog(np.ones(len(weights)), A_ub=-influence[indices], b_ub=constants[indices],
                             bounds=list(zip(np.zeros(len(weights)), remaining)), method='highs')
            if solved.success and (best is None or solved.fun < np.sum(best)):
                best = solved.x
    return best


def repair_channel_beds(original, corrected, points, conflicts, max_lowering=1.0,
                        exceptional_sources=(), terrain_flips=None, depth_targets=None, pinned=None,
                        links=None, radius=None, bank_normals=None, indexed_limits=None,
                        retaining_lower_bounds=None):
    """Condition routed bed support, respecting the resulting actual banks.

Only the native corners supporting a routed channel-centre sample may move.
The total bound is relative to immutable original terrain, not each iteration.
Pinned pool levels are not bed obstructions and cannot justify digging a hole.
Shared support corners can change nearby bank interpolation, which the coupled
solver measures explicitly; this is not a claim of mathematically minimal cuts.
"""
    changed = 0
    for source, conflict in conflicts.items():
        if conflict.get('obstructionPinned'):
            # The obstruction is a fixed pool head, not a high bed sill.
            # Excavating its upstream retaining bank cannot lower that head;
            # it only creates a new outlet and an endless moving-bank loop.
            continue
        target = conflict["bedTargetM"]
        nodes = list(conflict.get("pathNodes", []))
        nodes.extend(conflict.get("drainageNodes", []))
        if abs(conflict["requiredLevelM"] - conflict["obstructionBedM"] - 0.03) <= 0.002:
            nodes.append(conflict["obstructionNode"])
        # A pinned pool can require breaching its actual channel sill, but
        # its deep floor is never lowered merely to reduce the pool's head.
        for node in set(nodes):
            if pinned is not None and pinned[node]:
                continue
            if depth_targets is not None:
                target = float(conflict.get('nodeBankCaps', {}).get(node, conflict['bankCapM']) - depth_targets[node] - .01)
            point = points[node]
            # Exception authority is spatially local to the audited reach,
            # never inherited by remote tributaries in its drainage graph.
            limit = (5.0 if source in exceptional_sources and
                     np.max(np.abs(point - points[source])) <= 6 else max_lowering)
            current_bed = float(sample_terrain(corrected, point[:, None], terrain_flips)[0])
            if current_bed <= target:
                continue
            rows, cols, raw_weights = terrain_weights(corrected.shape, point[:, None], terrain_flips)
            weighted_cells = [(int(y), int(x), float(weight))
                              for y, x, weight in zip(rows[:, 0], cols[:, 0], raw_weights[:, 0]) if weight > 1e-6]
            cells = [(y, x) for y, x, _ in weighted_cells]
            weights = np.array([weight for _, _, weight in weighted_cells])
            remaining = np.array([max(0., float(corrected[cell] - original[cell]) +
                (indexed_limits.get(cell[0]*original.shape[1]+cell[1], limit) if indexed_limits else limit))
                for cell in cells])
            if retaining_lower_bounds is not None:
                remaining=np.minimum(remaining,[max(0.,float(corrected[cell]-retaining_lower_bounds[cell]))
                                                for cell in cells])
            required = current_bed - target
            if conflict.get('localBankConstraint') and links is not None and radius is not None:
                # Lowering a centre's supporting corner also changes bank
                # interpolation through that triangle. Solve those coupled
                # linear functions together, not a stale bank target that
                # recedes on every full-province iteration.
                following = int(links[node])
                previous = np.flatnonzero(np.asarray(links) == node)
                direction = (points[following] - point if following >= 0 else
                             point - points[previous[0]] if len(previous) else np.array([0., 0.]))
                length = np.linalg.norm(direction)
                if length <= 1e-9:
                    continue
                normal = np.array([-direction[1], direction[0]]) / length
                if bank_normals is not None:
                    normal = bank_normals[node]
                distance = np.minimum(float(radius[node]) * 2,
                    np.arange(.25, float(radius[node]) * 2 + .25, .25))
                positions = np.concatenate([point[:, None] + normal[:, None] * distance * sign for sign in (-1, 1)], axis=1)
                br, bc, bw = terrain_weights(corrected.shape, positions, terrain_flips)
                initial_bank = sample_terrain(corrected, positions, terrain_flips).astype(float)
                coefficients = np.array([np.sum(bw * ((br == y) & (bc == x)), axis=0) for y, x in cells]).T
                reductions = bounded_bank_correction(current_bed, weights, remaining,
                    initial_bank, coefficients, depth_targets[node])
                if reductions is None:
                    continue
                for cell, reduction in zip(cells, reductions):
                    value = np.float32(float(corrected[cell]) - reduction)
                    if value < corrected[cell] - 1e-5:
                        corrected[cell] = value
                        changed += 1
                continue
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
                value = np.float32(float(corrected[cell]) - reduction)
                if value < corrected[cell] - 1e-5:
                    corrected[cell] = value
                    changed += 1
    return changed


def repair_channel_films(original, corrected, points, links, levels, active, max_lowering=3.0, terrain_flips=None):
    """Give flowing interior nodes a visible film without moving pool planes.

Terminal spring/shore tapers remain real shorelines. Interior millimetre-only
    contacts would be discarded by rendering, so lower only their native support
    corners enough for a20mm film, under the same cumulative routine repair cap.
"""
    incoming = np.zeros(len(points), bool)
    outgoing = active & (links >= 0)
    incoming[links[outgoing]] = True
    interior = outgoing & incoming
    bed = sample_terrain(corrected, points.T, terrain_flips)
    thin = np.flatnonzero(interior & (levels - bed < .015))
    constraints = {int(node): {"requiredLevelM": float(bed[node] + .03),
        "obstructionBedM": float(bed[node]), "obstructionNode": int(node),
        "bedTargetM": float(levels[node] - .020), "pathNodes": [int(node)]} for node in thin}
    return repair_channel_beds(original, corrected, points, constraints, max_lowering=max_lowering, terrain_flips=terrain_flips)


def extend_surface(surface, ground, max_distance=24, preserve_owner_domain=False, return_nearest=False, terrain_flips=None,
                   margin_sources=None):
    """Extend physical water heights beneath banks without depressing edges.

The support raster, not a fabricated buried elevation, ends the surface.
Keeping a finite extrapolation outside support makes interpolation safe;
support is tested independently by both physics and rendering.
An explicit margin_sources mask restricts dry extrapolation to renderable
standing planes; wet flowing cores keep their original level and identity.
"""
    wet = np.isfinite(surface) & (surface > ground + 0.01)
    if not wet.any():
        result = (np.zeros_like(ground), np.zeros_like(wet), np.zeros(ground.shape, np.uint16))
        return (*result, np.indices(ground.shape)) if return_nearest else result
    seeds = wet
    restricted_margins = False
    if margin_sources is not None:
        if np.shape(margin_sources) != ground.shape:
            raise ValueError('Margin sources must match the native water grid')
        selected = wet & np.asarray(margin_sources, bool)
        if selected.any():
            seeds = selected
            restricted_margins = True
    distance, nearest = ndimage.distance_transform_edt(~seeds, return_indices=True)
    if restricted_margins:
        # Flowing cores retain their own heads/identities. Only the dry
        # raster margin changes source; native ribbons own flowing banks.
        y, x = np.nonzero(wet)
        nearest[0, y, x], nearest[1, y, x] = y, x
    level = surface[tuple(nearest)].astype(np.float32)
    # Preserve dry bank samples inside authored ribbons: they hold the same
    # transverse plane and are what makes a subpixel shoreline find its level.
    authored = wet if restricted_margins else np.isfinite(surface)
    level[authored] = surface[authored]
    support = wet | (distance <= max_distance)
    labels, count = label_terrain_components(wet, terrain_flips)
    if count > 65535:
        raise ValueError("Water body raster exceeds its 16-bit identity budget")
    bodies = labels[tuple(nearest)].astype(np.uint16)
    if not preserve_owner_domain:
        bodies[~support] = 0
    result = (level, support, bodies)
    return (*result, nearest) if return_nearest else result
