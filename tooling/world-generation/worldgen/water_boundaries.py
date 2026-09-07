"""Native, spill-connected water boundaries; no terrain or level retuning."""

import numpy as np
import heapq
from scipy import ndimage
from scipy.spatial import cKDTree
from .terrain_triangles import sample_terrain, TERRAIN_CONNECTIVITY, TERRAIN_NEIGHBOURS


MAX_LEVEL_OFFSET_M = 1.9  # Existing 1.4 m wet season plus 0.5 m maximum tide.
ACCESS_MIN_M, ACCESS_MAX_M = -2., 2.


def canonical_cross_section(samples):
    """Merge coincident serialized stations after decimal/Float32 rounding.

    Integer-axis and diagonal crossings can differ only by floating error.
    Preserve their highest bed/access barrier, never duplicate a mesh edge.
    """
    unique = {}
    for sample in samples:
        offset = float(np.float32(round(float(sample['offsetM']), 4)))
        if offset in unique:
            existing = unique[offset]
            existing['groundM'] = max(existing['groundM'], sample['groundM'])
            existing['accessOffsetM'] = max(existing['accessOffsetM'], sample['accessOffsetM'])
        else:
            unique[offset] = {**sample, 'offsetM': offset}
    return [unique[offset] for offset in sorted(unique)]


def hydraulic_plane_owners(basins, wet, pool_labels, pool_mask, nearest_wet):
    """A standing plane is a distinct owner even when its basin is shared."""
    from .water_geometry import body_records
    records = body_records(np.where(wet, basins, 0))
    for record in records:
        record['basinIndex'] = record['index']
    owners = basins.copy()
    next_index = int(basins.max(initial=0))
    pixels = np.flatnonzero(pool_mask)
    labels, first = np.unique(pool_labels.ravel()[pixels], return_index=True)
    lookup = np.zeros(int(pool_labels.max(initial=0)) + 1, np.uint16)
    for label, first_index in zip(labels, first):
        seed = int(pixels[first_index])
        next_index += 1
        if next_index > 65535:
            raise ValueError('Hydraulic plane identities exceed RGB support encoding')
        lookup[label] = next_index
        records.append({'index': next_index,
            'id': f'water.province.pool-cell-{seed // basins.shape[1]}-{seed % basins.shape[1]}',
            'basinIndex': int(basins.flat[seed])})
    owners[pool_mask] = lookup[pool_labels[pool_mask]]
    margin = ~wet
    owners[margin] = owners[tuple(nearest_wet[:, margin])]
    return owners, records


def spill_connected_access(ground, surface, wet, bodies, maximum_offset=MAX_LEVEL_OFFSET_M, can_flood=None,
                           terrain_flips=None):
    """Minimum stage needed to reach land through its own hydraulic domain.

    A minimax flood on actual terrain edges retains the highest intervening
    bank, including after the terrain falls away behind it. Different body
    IDs and discontinuous hydraulic heads are barriers, not values to blend.
    The search ends at physical barriers, never an arbitrary distance ring.
    """
    if not np.isfinite(maximum_offset) or maximum_offset < 0:
        raise ValueError('Maximum stage must be finite and nonnegative')
    gap = (ground - surface).astype(np.float32)
    # Unvisited terrain must remain inaccessible even above the old2m
    # encoding ceiling. Otherwise increasing peak stage wets every owner.
    inaccessible = max(ACCESS_MAX_M, maximum_offset + .1)
    access = np.where(wet, gap, inaccessible).astype(np.float32)
    edge = wet & ~ndimage.binary_erosion(wet, structure=TERRAIN_CONNECTIVITY)
    queue = [(float(access[y, x]), int(y), int(x)) for y, x in zip(*np.nonzero(edge))]
    heapq.heapify(queue)
    height, width = ground.shape
    if can_flood is None:
        can_flood = np.ones_like(wet)
    while queue:
        required, y, x = heapq.heappop(queue)
        if required > float(access[y, x]) + 1e-6:
            continue
        owner, level = bodies[y, x], surface[y, x]
        neighbours = TERRAIN_NEIGHBOURS if terrain_flips is None else ((-1, -1), (-1, 0), (-1, 1), (0, -1),
                                                                       (0, 1), (1, -1), (1, 0), (1, 1))
        for dy, dx in neighbours:
            ny, nx = y + dy, x + dx
            if not (0 <= ny < height and 0 <= nx < width) or wet[ny, nx]:
                continue
            if not can_flood[ny, nx]:
                continue
            if dy and dx and terrain_flips is not None and bool(terrain_flips[min(y, ny), min(x, nx)]) != (dy == dx):
                continue
            if bodies[ny, nx] != owner or abs(float(surface[ny, nx] - level)) > .04:
                continue
            candidate = max(required, float(gap[ny, nx]))
            if candidate <= maximum_offset + .04 and candidate < float(access[ny, nx]) - 1e-6:
                access[ny, nx] = candidate
                heapq.heappush(queue, (candidate, ny, nx))
    # Two exported-texel guard vertices keep body-ID triangle clipping away
    # from every potentially wet contour. Access, not support, clips water.
    potential = access <= maximum_offset + .04
    support = ndimage.binary_dilation(potential, structure=TERRAIN_CONNECTIVITY, iterations=4)
    return access, support


class ChannelOwnership:
    """Continuous reach ownership, independent of connected-basin identity."""

    def __init__(self, points, links, levels, owners, standing_levels=None, ground=None, terrain_flips=None,
                 marine_ground=None, pool_domain=None, maximum_offset=MAX_LEVEL_OFFSET_M):
        self.points = np.asarray(points)
        self.ends = self.points[np.maximum(links, 0)].copy()
        self.ends[np.asarray(links) < 0] = self.points[np.asarray(links) < 0]
        self.delta = self.ends - self.points
        self.length2 = np.sum(self.delta ** 2, axis=1)
        self.levels = np.asarray(levels)
        self.end_levels = self.levels[np.maximum(links, 0)].copy()
        self.end_levels[np.asarray(links) < 0] = self.levels[np.asarray(links) < 0]
        self.owners = np.asarray(owners)
        self.tree = cKDTree((self.points + self.ends) * .5)
        self.standing_levels = standing_levels
        self.ground = ground
        self.terrain_flips = terrain_flips
        self.marine_ground = marine_ground
        self.pool_domain = pool_domain
        if not np.isfinite(maximum_offset) or maximum_offset < 0:
            raise ValueError('Maximum ownership stage must be finite and nonnegative')
        self.maximum_offset = maximum_offset
        self.maximum_half_length = float(np.sqrt(self.length2).max(initial=0)) * .5

    def reachable_nearest(self, positions, minimum_heads):
        """Nearest segment portion whose peak can actually reach this ground.

        A falling segment is clipped in parameter space, not discarded when
        its unconstrained nearest point lies below the upper bank. Adaptive
        midpoint queries stop only when unseen segments cannot be nearer.
        This is a necessary ownership test; the section still checks every
        intervening terrain sill and standing-water boundary.
        """
        count = len(positions)
        segments = np.zeros(count, np.int64)
        fractions = np.zeros(count)
        pending = np.arange(count)
        k = min(8, len(self.points))
        while len(pending):
            distances, candidates = self.tree.query(positions[pending], k=k)
            if k == 1:
                distances, candidates = distances[:, None], candidates[:, None]
            offset = positions[pending, None, :] - self.points[candidates]
            t = np.clip(np.sum(offset * self.delta[candidates], axis=2) /
                        np.maximum(self.length2[candidates], 1e-12), 0, 1)
            head = self.levels[candidates]
            drop = self.end_levels[candidates] - head
            required = minimum_heads[pending, None]
            crossing = (required-head) / np.where(abs(drop) > 1e-12, drop, 1.)
            low = np.where(drop > 1e-12, np.maximum(0., crossing), 0.)
            high = np.where(drop < -1e-12, np.minimum(1., crossing), 1.)
            eligible = (low <= high) & ((abs(drop) > 1e-12) | (head >= required))
            t = np.minimum(np.maximum(t, low), high)
            residual = offset - t[:, :, None] * self.delta[candidates]
            distance2 = np.where(eligible, np.sum(residual ** 2, axis=2), np.inf)
            best = np.argmin(distance2, axis=1)
            rows = np.arange(len(pending))
            segments[pending], fractions[pending] = candidates[rows, best], t[rows, best]
            if k == len(self.points):
                segments[pending[~np.isfinite(distance2[rows, best])]] = -1
                break
            certain = distances[:, -1] - self.maximum_half_length > np.sqrt(distance2[rows, best]) + 1e-8
            pending = pending[~certain]
            k = min(k * 2, len(self.points))
        return segments, fractions

    def compatible(self, positions, source, level, anchor=None):
        positions = np.asarray(positions)
        unclaimed = np.zeros(len(positions), bool)
        if self.ground is None:
            _, candidates = self.tree.query(positions, k=min(8, len(self.points)))
            if candidates.ndim == 1:
                candidates = candidates[:, None]
            offset = positions[:, None, :] - self.points[candidates]
            t = np.clip(np.sum(offset * self.delta[candidates], axis=2) /
                        np.maximum(self.length2[candidates], 1e-12), 0, 1)
            residual = offset - t[:, :, None] * self.delta[candidates]
            best = np.argmin(np.sum(residual ** 2, axis=2), axis=1)
            rows = np.arange(len(positions))
            segment, u = candidates[rows, best], t[rows, best]
        else:
            segment, u = np.zeros(len(positions), np.int64), np.zeros(len(positions))
            bed = sample_terrain(self.ground, positions.T, self.terrain_flips)
            # Ownership of a dry contour guard is immaterial; avoid searching
            # the whole province for water that cannot reach it from here.
            possible = bed <= level + self.maximum_offset + .04
            unclaimed = ~possible
            if possible.any():
                selected, fractions = self.reachable_nearest(
                    positions[possible], bed[possible] - self.maximum_offset - .04)
                unclaimed[possible] = selected < 0
                segment[possible], u[possible] = np.maximum(selected, 0), fractions
        head = self.levels[segment] * (1 - u) + self.end_levels[segment] * u
        own = self.owners[segment] == source
        if anchor is not None:
            # One coarse reach may contain a hundred-metre waterfall. Its
            # high lip cannot claim the remote low plunge margin merely
            # because both native segments share the same authored ID.
            anchor = np.asarray(anchor)
            incident = (np.linalg.norm(self.points[segment] - anchor, axis=1) < 1e-6) | (
                        np.linalg.norm(self.ends[segment] - anchor, axis=1) < 1e-6)
            # All incident records share the solved junction head. Treat
            # their common cross section identically on both sides of a
            # record boundary; authored record IDs are not physical banks.
            own = incident
        compatible = unclaimed | own | (np.abs(head - level) <= .04)
        if self.standing_levels is not None:
            if self.ground is not None:
                base = np.floor(positions).astype(int)
                possible = np.zeros(len(positions), bool)
                for dy, dx in ((0, 0), (1, 0), (0, 1), (1, 1)):
                    cells = np.clip(base + [dy, dx], 0, np.array(self.ground.shape) - 1)
                    pool = self.standing_levels[cells[:, 0], cells[:, 1]]
                    possible |= np.isfinite(pool) & (np.abs(pool - level) > .04)
                # Most queries are outside a pool or already on its plane;
                # only genuine competing heads need geometric shoreline tests.
                if possible.any():
                    from .water_geometry import sample_standing_levels
                    pool = sample_standing_levels(self.ground, self.standing_levels, positions[possible], self.terrain_flips,
                                                  self.pool_domain)
                    compatible[possible] &= ~np.isfinite(pool) | (np.abs(pool - level) <= .04)
            else:
                pool = ndimage.map_coordinates(self.standing_levels, positions.T, order=0, mode="nearest")
                compatible &= ~np.isfinite(pool) | (np.abs(pool - level) <= .04)
        return compatible

    def standing_handoff(self, position, level):
        if self.standing_levels is None or self.ground is None:
            return False
        base = np.floor(position).astype(int)
        candidates = np.clip(base + np.array([[0, 0], [1, 0], [0, 1], [1, 1]]),
                             0, np.array(self.ground.shape) - 1)
        possible = self.standing_levels[candidates[:, 0], candidates[:, 1]]
        if not np.any(np.isfinite(possible) & (np.abs(possible - level) <= .04)):
            # Sea uses the same zero datum, not a freshwater pool label.
            from .water_geometry import sample_marine_mask
            return abs(level) <= .04 and sample_marine_mask(self.ground, self.marine_ground,
                                                           [position], self.terrain_flips)[0]
        from .water_geometry import sample_standing_levels
        pool = sample_standing_levels(self.ground, self.standing_levels, np.asarray(position)[None, :], self.terrain_flips,
                                     self.pool_domain)[0]
        return np.isfinite(pool) and abs(pool - level) <= .04


def _simplify_profile(distance, bed, access, tolerance=.005):
    """Retain extrema and bound error in both bed and spill-head functions."""
    keep = {0, len(distance) - 1}
    # Do not move the exact base-stage bank crossing while simplifying.
    for index in np.flatnonzero((access[:-1] < 0) & (access[1:] >= 0)):
        keep.update((int(index), int(index + 1)))
    ordered = sorted(keep)
    pending = list(zip(ordered, ordered[1:]))
    while pending:
        lo, hi = pending.pop()
        if hi <= lo + 1:
            continue
        t = (distance[lo + 1:hi] - distance[lo]) / (distance[hi] - distance[lo])
        error = np.maximum(np.abs(bed[lo + 1:hi] - (bed[lo] * (1 - t) + bed[hi] * t)),
                           np.abs(access[lo + 1:hi] - (access[lo] * (1 - t) + access[hi] * t)))
        where = int(np.argmax(error))
        if error[where] > tolerance:
            split = lo + 1 + where
            keep.add(split)
            pending.extend(((lo, split), (split, hi)))
    return sorted(keep)


def channel_cross_section(ground, point, normal, half_extent, level, metres_per_pixel,
                          maximum_offset=MAX_LEVEL_OFFSET_M, ownership=None, source=-1,
                          close_domain=False, diagnostics=None, terrain_flips=None):
    """Independent banks and their physically connected potential flood strips.

    Coordinates/extent are native-grid units. The returned offsets are signed
    world metres along the unit miter normal, already including miter length.
    Every margin is connected to this channel by a lateral path; a low slope
    beyond a bank only floods after the intervening bank is overtopped. This
    is deliberately NOT an unconstrained nearest-height flood fill.
    """
    if not np.isfinite(maximum_offset) or maximum_offset < 0:
        raise ValueError('Maximum stage must be finite and nonnegative')
    point, normal = np.asarray(point), np.asarray(normal)
    profiles, base_widths = [], []
    boundary_kinds = []
    for sign in (-1, 1):
        extent = max(float(half_extent), .0001 / metres_per_pixel)
        domain_end = 'requested-extent'
        if close_domain:
            limits = [(ground.shape[axis] - 1 - point[axis]) / (normal[axis] * sign)
                      if normal[axis] * sign > 0 else -point[axis] / (normal[axis] * sign)
                      for axis in (0, 1) if abs(normal[axis]) > 1e-9]
            edge_distance = max(.0001 / metres_per_pixel, min(limits, default=extent))
            extent = min(extent, edge_distance)
            # Expand the search, not the river level. Stop only at a real
            # bank, a hydraulic-owner divide, compatible standing water, or
            # the province edge. No arbitrary maximum-distance water cutoff.
            while True:
                probe_d = np.linspace(0, extent, max(2, int(np.ceil(extent * 2)) + 1))
                probe_p = point[:, None] + normal[:, None] * (probe_d * sign)
                probe_bed = sample_terrain(ground, probe_p, terrain_flips)
                if np.any(probe_bed - level > maximum_offset + .04):
                    domain_end = 'terrain-bank'
                    break
                if ownership is not None and not ownership.compatible(probe_p.T, source, level, anchor=point)[1:].all():
                    domain_end = 'reach-owner'
                    break
                if ownership is not None and ownership.standing_handoff(probe_p[:, -1], level):
                    domain_end = 'standing-handoff'
                    break
                if extent >= edge_distance - 1e-8:
                    domain_end = 'world-edge'
                    break
                extent = min(extent * 2, edge_distance)
        distance = np.linspace(0, extent, max(2, int(np.ceil(extent * 4)) + 1))
        # A ray changes terrain triangle at integer X, integer Z, or an
        # integer X+Z anti-diagonal. Include every exact breakpoint: uniform
        # sampling alone can miss a sharp sill even at a quarter-native step.
        breaks = list(distance)
        for origin, direction in ((point[0], normal[0]), (point[1], normal[1]),
                                  (sum(point), sum(normal)), (point[0] - point[1], normal[0] - normal[1])):
            direction *= sign
            if abs(direction) > 1e-9:
                end = origin + direction * extent
                integers = np.arange(np.ceil(min(origin, end)), np.floor(max(origin, end)) + 1)
                breaks.extend(((integers - origin) / direction).tolist())
        current_distance = np.unique(np.clip(breaks, 0, extent))
        positions = point[:, None] + normal[:, None] * (current_distance * sign)
        if ownership is not None:
            compatible = ownership.compatible(positions.T, source, level, anchor=point)
            incompatible = np.flatnonzero(~compatible & (current_distance > 0))
            if len(incompatible):
                domain_end = 'reach-owner'
                hi_index = int(incompatible[0])
                low, high = current_distance[hi_index - 1], current_distance[hi_index]
                for _ in range(12):
                    middle = (low + high) * .5
                    probe = point + normal * middle * sign
                    if ownership.compatible(probe[None, :], source, level, anchor=point)[0]:
                        low = middle
                    else:
                        high = middle
                current_distance = np.r_[current_distance[:hi_index], max(low, .0001 / metres_per_pixel)]
                positions = point[:, None] + normal[:, None] * (current_distance * sign)
        bed = sample_terrain(ground, positions, terrain_flips).astype(float)
        access = np.maximum.accumulate(bed - level)
        # Keep the first inaccessible sample as a dry contour guard, so the
        # potential mesh's finite outer edge cannot become a visible cutoff.
        blocked = np.flatnonzero(access > maximum_offset + .04)
        if len(blocked):
            domain_end = 'terrain-bank'
        end = int(blocked[0]) + 1 if len(blocked) else len(current_distance)
        end = max(2, end)
        d, b, a = current_distance[:end], bed[:end], access[:end]
        dry = np.flatnonzero(a >= -.0005)
        if len(dry):
            hi = int(dry[0])
            lo = max(0, hi - 1)
            fraction = np.clip((-.0005 - a[lo]) / max(a[hi] - a[lo], 1e-12), 0, 1)
            width = d[lo] + (d[hi] - d[lo]) * fraction
        else:
            width = d[-1]
        base_widths.append(float(width * metres_per_pixel))
        samples = [{"offsetM": round(float(sign * d[i] * metres_per_pixel), 4),
                    "groundM": round(float(b[i]), 6),
                    "accessOffsetM": round(float(a[i]), 6)}
                   for i in _simplify_profile(d, b, a)]
        profiles.append(samples)
        boundary_kinds.append(domain_end)
    if diagnostics is not None:
        diagnostics['boundaryKinds'] = boundary_kinds
    return canonical_cross_section(list(reversed(profiles[0])) + profiles[1][1:]), base_widths
