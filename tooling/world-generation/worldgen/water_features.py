"""Small explicit geometry records for cascades and raster-limited channels."""

import numpy as np
from scipy import ndimage
from .water_boundaries import ChannelOwnership, channel_cross_section, MAX_LEVEL_OFFSET_M
from .terrain_triangles import sample_terrain
from .water_geometry import shared_section_normals, flat_landing_normals
from .water_channel_response import channel_path_response


def base_width(vertex):
    """Actual connected bank-to-bank span, including asymmetric channels."""
    section = vertex['crossSection']
    centre = next(i for i, sample in enumerate(section) if sample['offsetM'] == 0)
    width = 0.
    for ray in (section[centre::-1], section[centre:]):
        end = abs(ray[-1]['offsetM'])
        for a, b in zip(ray, ray[1:]):
            if b['accessOffsetM'] >= 0:
                fraction = max(0., -a['accessOffsetM']) / max(b['accessOffsetM'] - a['accessOffsetM'], 1e-12)
                end = abs(a['offsetM'] + fraction * (b['offsetM'] - a['offsetM']))
                break
        width += end
    return width


def compile_features(ground, surface, support, bodies, points, links, levels, radius,
                     original_count, original_links, cell_indices, coarse_width,
                     bands, metres_per_pixel, max_cascades=256,
                     ground_detail=None, detail_scale=1, body_detail=None, standing_detail=None, all_channels=False,
                     terrain_flips=None, season_response=None, tide_response=None, orientation_levels=None,
                     marine_ground=None, wetland_rivulets=None, pool_domain=None, maximum_offset=MAX_LEVEL_OFFSET_M,
                     source_filter=None, seasonal_sources=(), stage=None,
                     season_response_anchors=None, tide_response_anchors=None):
    seasonal_sources = frozenset(seasonal_sources)
    if seasonal_sources:
        from .water_stage import stage_range
        stage = stage_range(stage)
        if stage['tidalAmplitudeM'] + stage['seasonalAmplitudeM'] > maximum_offset + 1e-6:
            raise ValueError('Seasonal export stage exceeds the section ownership domain')
        if wetland_rivulets is None or any(not 0 <= i < original_count or not wetland_rivulets[i]
                                          for i in seasonal_sources):
            raise ValueError('Seasonal base-dry export is restricted to authored wetland rivulets')
        if season_response is None or tide_response is None:
            raise ValueError('Seasonal export requires actual stage response coefficients')
    ribbons, cascades = [], []
    intent = levels if orientation_levels is None else orientation_levels
    ground = np.asarray(ground)
    detail = ground if ground_detail is None else ground_detail
    detailed_bodies = bodies if body_detail is None else body_detail
    owners = np.arange(len(points))
    for source in range(original_count):
        cursor = links[source]
        while cursor >= original_count:
            owners[cursor] = source
            cursor = links[cursor]
    accepted_segments = np.zeros(len(points), bool)
    accepted_vertices = np.zeros(len(points), bool)
    for source, target in enumerate(original_links):
        if target < 0:
            continue
        cursor = source
        seen = set()
        while cursor != target and cursor >= 0:
            if cursor in seen:
                raise ValueError('Native channel path cycles before reaching its endpoint')
            seen.add(cursor)
            accepted_segments[cursor] = accepted_vertices[cursor] = True
            cursor = links[cursor]
        if cursor != target:
            raise ValueError('Native channel path ends before its endpoint')
        accepted_vertices[target] = True
    ownership_links = np.where(accepted_segments, links, -1)
    ownership = ChannelOwnership(np.asarray(points) * detail_scale, ownership_links, levels, owners,
                                 standing_detail, detail, terrain_flips, marine_ground, pool_domain,
                                 maximum_offset=maximum_offset, active=accepted_vertices)
    shared_normals = shared_section_normals(points, links, original_count, original_links)
    landing_normals = flat_landing_normals(points, links, original_count, original_links, levels)
    landing_caps = []
    shared_profiles = {}

    def sample(field, point, order=1):
        if field is detail:
            return float(sample_terrain(field, np.asarray(point)[:, None], terrain_flips)[0])
        return float(ndimage.map_coordinates(field, np.asarray(point)[:, None],
                                            order=order, mode="nearest")[0])

    def vertex(index, previous, following, source, section_normal=None):
        point = points[index]
        incoming = point - points[previous]
        outgoing = points[following] - point
        in_length, out_length = np.hypot(*incoming), np.hypot(*outgoing)
        incoming = incoming / in_length if in_length > 1e-9 else outgoing / max(out_length, 1e-9)
        outgoing = outgoing / out_length if out_length > 1e-9 else incoming
        direction = incoming + outgoing
        # Native arrays are (Z,X), runtime normals are (-dZ,+dX) in (X,Z).
        # The sign was immaterial for symmetric strips, but swapping it now
        # would put the broad measured bank on the opposite side of a river.
        perpendicular = np.array([direction[1], -direction[0]]) / max(np.hypot(*direction), 1e-9)
        if np.hypot(*perpendicular) < 1e-6:
            perpendicular = np.array([outgoing[1], -outgoing[0]])
        shared = shared_normals[index] if section_normal is None else section_normal
        if shared is not None:
            perpendicular = shared if shared @ perpendicular >= 0 else -shared
        correction = min(2., 1 / max(.5, float(perpendicular @ np.array([outgoing[1], -outgoing[0]]))))
        cache_key = (*point, round(float(levels[index]), 4), *perpendicular) if shared is not None else None
        cached = shared_profiles.get(cache_key) if cache_key is not None else None
        if cached is None:
            closure = {}
            cross_section, widths = channel_cross_section(
                detail, point * detail_scale, perpendicular,
                float(radius[index]) * 2 * correction * detail_scale,
                round(float(levels[index]), 4), metres_per_pixel / detail_scale, ownership=ownership, source=source,
                close_domain=True, diagnostics=closure, terrain_flips=terrain_flips, maximum_offset=maximum_offset)
            if cache_key is not None:
                shared_profiles[cache_key] = (cross_section, widths, closure)
        else:
            cross_section, widths, closure = cached
        # Keep native world coordinates until the runtime's single Float32
        # conversion. Decimal rounding first can move a landing by a full ULP
        # to the opposite side of its matching terrain vertex.
        return {"x": float(point[1] * metres_per_pixel),
                "y": round(float(levels[index]), 4),
                "z": float(point[0] * metres_per_pixel),
                "groundM": round(sample(detail, point * detail_scale), 6),
                "halfWidthM": max(0.0001, round(min(widths) / correction, 4)),
                "crossSectionNormalX": float(perpendicular[1]),
                "crossSectionNormalZ": float(perpendicular[0]),
                "crossSection": cross_section, **closure}

    for source in range(original_count):
        if source_filter is not None and source not in source_filter:
            continue
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
        bad = all_channels
        for a, b in ([] if all_channels else zip(path, path[1:])):
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
        if not all_channels and not bad and not is_cascade:
            continue
        if intent[source] < intent[target]:
            path.reverse()
        vertices = [vertex(index, path[max(i - 1, 0)], path[min(i + 1, len(path) - 1)], source)
                    for i, index in enumerate(path)]
        reach_bed_drop = vertices[0]['groundM'] - vertices[-1]['groundM']
        for first, second in zip(vertices, vertices[1:]):
            run = np.hypot(second['x'] - first['x'], second['z'] - first['z'])
            if reach_bed_drop >= 2 and first['groundM'] - second['groundM'] >= run > 1e-6:
                # All actual falling intervals, independent of the bounded
                # decorative cascade catalogue. The next point is the
                # independently solved landing/continuation, not an air
                # volume beneath a raised horizontal water plane.
                first['fallingToNext'] = True
        for field, values, anchors in (('seasonResponse', season_response, season_response_anchors),
                                       ('tideResponse', tide_response, tide_response_anchors)):
            if values is not None:
                response = channel_path_response(points, path, values, anchors)
                for point, value in zip(vertices, response):
                    point[field] = float(value)
        cell = int(cell_indices[source])
        key = f"cell-{cell // coarse_width}-{cell % coarse_width}"
        body_index = int(sample(detailed_bodies, points[source] * detail_scale, order=0))
        if not body_index:
            for index in path:
                body_index = int(sample(detailed_bodies, points[index] * detail_scale, order=0))
                if body_index:
                    break
        if bad or all_channels:
            ribbons.append({"id": f"water-ribbon.province.{key}", "bodyIndex": body_index,
                            "riverBand": int(bands[source]), "points": vertices,
                            "hydrologyRegime": ('shallow-wetland-rivulet' if wetland_rivulets is not None and
                                                wetland_rivulets[source] else 'banked-river')})
            if source in seasonal_sources:
                ribbons[-1]['baseMayBeDry'] = True
            for i, (first, second) in enumerate(zip(vertices, vertices[1:])):
                normal = landing_normals[path[i]]
                if normal is None or abs(first['y'] - second['y']) > 1e-4:
                    continue
                old_normal = np.array([first['crossSectionNormalZ'], first['crossSectionNormalX']])
                if abs(float(normal @ old_normal)) > 1 - 1e-8:
                    continue
                receiving = vertex(path[i], path[max(i - 1, 0)], path[i + 1], source, normal)
                for field in ('seasonResponse', 'tideResponse'):
                    if field in first:
                        receiving[field] = first[field]
                # The bisector already covers the downstream side. Fill only
                # the upstream sector between it and the incoming-flow plane.
                forward = np.array([old_normal[1], -old_normal[0]])
                if forward @ (points[path[i + 1]] - points[path[i]]) < 0:
                    forward = -forward
                receiving_normal = np.array([receiving['crossSectionNormalZ'], receiving['crossSectionNormalX']])
                side = -1 if forward @ receiving_normal > 0 else 1
                cap_points = []
                for point in (first, receiving):
                    cap = {**point, 'crossSection': [sample for sample in point['crossSection']
                                                     if sample['offsetM'] * side >= 0]}
                    cap.pop('fallingToNext', None)
                    cap['boundaryKinds'] = list(point['boundaryKinds'])
                    cap['boundaryKinds'][0 if side > 0 else 1] = 'section-join'
                    cap_points.append(cap)
                landing_caps.append({**ribbons[-1], 'id': ribbons[-1]['id'] + f'.landing-{i}',
                                     'geometryRole': 'landing', 'points': cap_points})
        if is_cascade:
            high, low = vertices[0], vertices[-1]
            dx, dz = low["x"] - high["x"], low["z"] - high["z"]
            length = max(float(np.hypot(dx, dz)), 1e-6)
            cascades.append({"id": f"waterfall.province.{key}", "bodyIndex": body_index,
                "riverBand": int(bands[source]),
                "lip": {k: high[k] for k in ("x", "y", "z")},
                "plunge": {k: low[k] for k in ("x", "y", "z")},
                "direction": {"x": round(dx / length, 6), "z": round(dz / length, 6)},
                "widthM": max(.0001, round(min(base_width(high), base_width(low)), 4)),
                "dropM": round(drop, 4)})
    ribbons.extend(landing_caps)
    # Highest-energy sites get explicit airborne effects; smaller rapids
    # remain the continuous surface/foam treatment. Stable tie-break by ID.
    cascades.sort(key=lambda feature: (-feature["dropM"] * feature["widthM"], feature["id"]))
    for ribbon in ribbons:
        vertices = ribbon["points"]
        if any(b["y"] > a["y"] + 0.0002 for a, b in zip(vertices, vertices[1:])):
            raise ValueError(f'Non-monotone exported reach: {ribbon["id"]}')
        seasonal = ribbon.get('baseMayBeDry', False)
        if seasonal and any(not np.isfinite(point[key]) or not 0 <= point[key] <= 1
                            for point in vertices for key in ('seasonResponse', 'tideResponse')):
            raise ValueError('Seasonal response coefficients must be between zero and one')
        if seasonal and any(point['y'] + stage['seasonalAmplitudeM']*point['seasonResponse']
                            + stage['tidalAmplitudeM']*point['tideResponse'] <= point['groundM'] + .004
                            for point in vertices):
            raise ValueError(f'Seasonal peak remains below its native bed wet threshold: {ribbon["id"]}')
        if any(point["groundM"] > point["y"] + .001 + (
            stage['seasonalAmplitudeM']*point['seasonResponse'] + stage['tidalAmplitudeM']*point['tideResponse']
            if seasonal else 0.) for point in vertices):
            raise ValueError(f'Exported reach is below its native bed: {ribbon["id"]}')
    return ribbons, sorted(cascades[:max_cascades], key=lambda feature: feature["id"])
