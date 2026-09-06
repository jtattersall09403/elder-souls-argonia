"""Small explicit geometry records for cascades and raster-limited channels."""

import numpy as np
from scipy import ndimage


def compile_features(ground, surface, support, bodies, points, links, levels, radius,
                     original_count, original_links, cell_indices, coarse_width,
                     bands, metres_per_pixel, max_cascades=256,
                     ground_detail=None, detail_scale=1, body_detail=None):
    ribbons, cascades = [], []
    ground = np.asarray(ground)
    detail = ground if ground_detail is None else ground_detail
    detailed_bodies = bodies if body_detail is None else body_detail

    def sample(field, point, order=1):
        return float(ndimage.map_coordinates(field, np.asarray(point)[:, None],
                                            order=order, mode="nearest")[0])

    def vertex(index, previous, following):
        point = points[index]
        incoming = point - points[previous]
        outgoing = points[following] - point
        in_length, out_length = np.hypot(*incoming), np.hypot(*outgoing)
        incoming = incoming / in_length if in_length > 1e-9 else outgoing / max(out_length, 1e-9)
        outgoing = outgoing / out_length if out_length > 1e-9 else incoming
        direction = incoming + outgoing
        perpendicular = np.array([-direction[1], direction[0]]) / max(np.hypot(*direction), 1e-9)
        if np.hypot(*perpendicular) < 1e-6:
            perpendicular = np.array([-outgoing[1], outgoing[0]])
        correction = min(2., 1 / max(.5, float(perpendicular @ np.array([-outgoing[1], outgoing[0]]))))
        # Match the runtime's exact shared-miter cross-section. Testing an
        # un-mitered width then doubling it at a bend can cross a dry bank.
        half_width = float(radius[index]) * correction
        # Clip the explicit ribbon to its actual banks, not its semantic
        # maximum width. This prevents a sheet hanging above a side slope.
        for sign in (-1, 1):
            previous_distance = 0.0
            for distance in np.linspace(0, half_width,
                                        max(2, int(np.ceil(half_width * detail_scale * 4)) + 1))[1:]:
                bed = sample(detail, (point + perpendicular * sign * distance) * detail_scale)
                if bed >= levels[index] - 0.0005:
                    low, high = previous_distance, distance
                    for _ in range(12):
                        middle = (low + high) * 0.5
                        if sample(detail, (point + perpendicular * sign * middle) * detail_scale) >= levels[index] - 0.0005:
                            high = middle
                        else:
                            low = middle
                    half_width = min(half_width, low)
                    break
                previous_distance = distance
        return {"x": round(float(point[1] * metres_per_pixel), 4),
                "y": round(float(levels[index]), 4),
                "z": round(float(point[0] * metres_per_pixel), 4),
                "groundM": round(sample(detail, point * detail_scale), 6),
                "halfWidthM": max(0.0001, round(half_width / correction * metres_per_pixel, 4))}

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
        bad = False
        for a, b in zip(path, path[1:]):
            for fraction in (0.0, 0.25, 0.5, 0.75, 1.0):
                point = points[a] * (1 - fraction) + points[b] * fraction
                bed = sample(detail, point * detail_scale)
                expected = float(levels[a] * (1 - fraction) + levels[b] * fraction)
                if bed > 0 and (sample(surface, point) - bed < 0.05 or
                                abs(sample(surface, point) - expected) > 0.04 or
                                sample(support, point, order=0) < 0.5):
                    bad = True
                    break
            if bad:
                break
        drop = float(abs(levels[source] - levels[target]))
        distance_m = float(np.hypot(*(points[source] - points[target])) * metres_per_pixel)
        is_cascade = drop >= 0.8 and drop / max(distance_m, 0.1) >= 0.25
        if not bad and not is_cascade:
            continue
        vertices = [vertex(index, path[max(i - 1, 0)], path[min(i + 1, len(path) - 1)])
                    for i, index in enumerate(path)]
        if levels[source] < levels[target]:
            vertices.reverse()
        cell = int(cell_indices[source])
        key = f"cell-{cell // coarse_width}-{cell % coarse_width}"
        body_index = int(sample(detailed_bodies, points[source] * detail_scale, order=0))
        if not body_index:
            for index in path:
                body_index = int(sample(detailed_bodies, points[index] * detail_scale, order=0))
                if body_index:
                    break
        if bad:
            ribbons.append({"id": f"water-ribbon.province.{key}", "bodyIndex": body_index,
                            "riverBand": int(bands[source]), "points": vertices})
        if is_cascade:
            high, low = vertices[0], vertices[-1]
            dx, dz = low["x"] - high["x"], low["z"] - high["z"]
            length = max(float(np.hypot(dx, dz)), 1e-6)
            cascades.append({"id": f"waterfall.province.{key}", "bodyIndex": body_index,
                "riverBand": int(bands[source]),
                "lip": {k: high[k] for k in ("x", "y", "z")},
                "plunge": {k: low[k] for k in ("x", "y", "z")},
                "direction": {"x": round(dx / length, 6), "z": round(dz / length, 6)},
                "widthM": round(2 * min(high["halfWidthM"], low["halfWidthM"]), 4),
                "dropM": round(drop, 4)})
    # Highest-energy sites get explicit airborne effects; smaller rapids
    # remain the continuous surface/foam treatment. Stable tie-break by ID.
    cascades.sort(key=lambda feature: (-feature["dropM"] * feature["widthM"], feature["id"]))
    for ribbon in ribbons:
        vertices = ribbon["points"]
        if any(b["y"] > a["y"] + 0.0002 for a, b in zip(vertices, vertices[1:])):
            raise ValueError(f'Non-monotone exported reach: {ribbon["id"]}')
        if any(point["groundM"] > point["y"] + 0.001 for point in vertices):
            raise ValueError(f'Exported reach is below its native bed: {ribbon["id"]}')
    return ribbons, sorted(cascades[:max_cascades], key=lambda feature: feature["id"])
