"""Closing the neck seam: boundary snap plus weight copy.

Skyrim ships the head, the body and every cuirass as separately authored
meshes, and nothing in the vanilla data reconciles their neck openings. Left
alone the openings do not meet and the scene's clear colour shows through the
join — the white ring the owner reported at the base of an enemy's neck.

The technique here is the one the character build already uses to stitch a
generated FaceGen head onto the weight-blended body:

1. take the body's **highest open boundary** as the authoritative neck
   polyline (its lower openings are the wrists, ankles and hem);
2. move every vertex of the other mesh's neck ring onto the nearest point of
   that polyline, which also handles the two rings having different vertex
   counts;
3. give each moved vertex the *interpolated skin weights* of the body edge it
   landed on.

Step 3 is not optional. Matching positions only closes the bind pose; the neck
is blended between the Neck and Spine2 bones, so a ring that carries different
weights parts again on the first idle breath. A bind-pose-only fix is not a fix.

This module is the shared implementation. ``build_armour.py`` imports it.
``build_character.py`` still carries its own copy of ``mesh_boundary``,
``closest_point_on_segments`` and ``vertex_weights``; folding it onto this
module is a mechanical follow-up, deliberately not done in the same change as
the armour fix so the character roster does not move underneath it.
"""

import math

from mathutils import Vector


def mesh_boundary(obj):
    """Return open edges and their connected vertex components."""
    edge_uses = {}
    for polygon in obj.data.polygons:
        vertices = list(polygon.vertices)
        for index, start in enumerate(vertices):
            edge = tuple(sorted((start, vertices[(index + 1) % len(vertices)])))
            edge_uses[edge] = edge_uses.get(edge, 0) + 1
    edges = [edge for edge, uses in edge_uses.items() if uses == 1]
    neighbours = {}
    for start, end in edges:
        neighbours.setdefault(start, set()).add(end)
        neighbours.setdefault(end, set()).add(start)
    components = []
    unseen = set(neighbours)
    while unseen:
        pending = [unseen.pop()]
        component = set(pending)
        while pending:
            current = pending.pop()
            for neighbour in neighbours[current]:
                if neighbour in unseen:
                    unseen.remove(neighbour)
                    component.add(neighbour)
                    pending.append(neighbour)
        components.append(component)
    return edges, components


def closest_point_on_segments(point, segments):
    """Nearest point on a polyline, with the segment and the fraction along it."""
    closest = None
    closest_distance = float("inf")
    closest_segment = None
    closest_fraction = 0.0
    for start, end, start_index, end_index in segments:
        along = end - start
        length_squared = along.length_squared
        fraction = 0.0 if length_squared <= 1e-12 else max(
            0.0, min(1.0, (point - start).dot(along) / length_squared)
        )
        candidate = start + along * fraction
        distance = (point - candidate).length
        if distance < closest_distance:
            closest = candidate
            closest_distance = distance
            closest_segment = (start_index, end_index)
            closest_fraction = fraction
    return closest, closest_distance, closest_segment, closest_fraction


def vertex_weights(obj, index):
    weights = {}
    for group in obj.vertex_groups:
        try:
            weight = group.weight(index)
        except RuntimeError:
            continue
        if weight > 1e-8:
            weights[group.name] = weight
    return weights


def neck_polyline(body):
    """The body's neck as world-space segments, plus its vertex set.

    The highest open boundary is the neck: the wrists, ankles and hem are all
    below it. Choosing the smallest or lowest component instead picks the mouth
    or a hem, which is how an earlier build snapped the wrong loop.
    """
    edges, components = mesh_boundary(body)
    if not components:
        return [], set()
    matrix = body.matrix_world
    vertices = max(components, key=lambda component: sum(
        (matrix @ body.data.vertices[index].co).z for index in component
    ) / len(component))
    segments = [
        (matrix @ body.data.vertices[start].co,
         matrix @ body.data.vertices[end].co,
         start, end)
        for start, end in edges
        if start in vertices and end in vertices
    ]
    return segments, vertices


def raise_polyline(segments, amount):
    """The same polyline lifted along +Z, keeping its body vertex indices.

    The collar is snapped to this rather than to the neck itself, and that
    offset is the whole reason one armour GLB can be worn by ten builds.

    Skyrim morphs a body between ``_0`` and ``_1`` by the wearer's NAM7 weight,
    so across the roster the neck ring is a *range*: measured on the shipped
    builds, radius 0.522 to 0.573 (Nord) and height 11.166 to 11.187.
    A collar snapped flush onto any single one of those rings meets that build
    and misses the other nine, and a rim that misses leaves a band with nothing
    behind it — the white ring, which is the scene's clear colour.

    So the collar is not butted against the neck, it is **overlapped into** it:
    taken from the weight-zero body it is narrower than every neck in the
    roster, and lifted it ends above every neck ring. Its rim then sits inside
    the neck with skin in front of it from every viewing angle, and there is no
    line of sight to the backdrop for any build. Overlap is what Skyrim's own
    armour does; a flush seam is only achievable per wearer, which is the
    weight-morphed armour the pipeline does not build yet.
    """
    lift = Vector((0.0, 0.0, amount))
    return [(start + lift, end + lift, start_index, end_index)
            for start, end, start_index, end_index in segments]


def ring_profile(obj, ring, axis):
    """A ring's mean height and its mean radius **about the neck axis**.

    Measured about the neck's own axis rather than the ring's centroid, so the
    number is directly comparable with ``neck_axis``'s radius. Measuring each
    about its own centre compares two different things and reports a collar as
    wider than the neck it was just snapped onto.
    """
    points = [obj.matrix_world @ obj.data.vertices[i].co for i in ring]
    centre = sum(points, Vector()) / len(points)
    radius = sum((point - axis).xy.length for point in points) / len(points)
    return centre, radius


def polyline_radius(segments):
    points = [point for segment in segments for point in segment[:2]]
    centre = sum(points, Vector()) / len(points)
    return max((point - centre).length for point in points)


def snap_ring(obj, ring, body, segments, skip_groups=()):
    """Snap one boundary ring onto the neck polyline and copy its skin weights.

    Returns ``(before, after)``: the world-space distance of every ring vertex
    to the polyline, measured on the same geometry before and after the move.
    """
    to_object = obj.matrix_world.inverted()
    before, targets = [], {}
    for index in sorted(ring):
        point = obj.matrix_world @ obj.data.vertices[index].co
        target, distance, segment, fraction = closest_point_on_segments(point, segments)
        if target is None or segment is None:
            continue
        before.append(distance)
        targets[index] = (target, segment, fraction)

    for index, (target, segment, fraction) in targets.items():
        obj.data.vertices[index].co = to_object @ target
        start_weights = vertex_weights(body, segment[0])
        end_weights = vertex_weights(body, segment[1])
        interpolated = {
            name: start_weights.get(name, 0.0) * (1.0 - fraction)
                + end_weights.get(name, 0.0) * fraction
            for name in set(start_weights) | set(end_weights)
        }
        total = sum(interpolated.values())
        if total <= 1e-8:
            raise RuntimeError("body neck vertex has no skin weights")
        for group in obj.vertex_groups:
            if group.name in skip_groups or group.name.startswith("SBP_"):
                continue
            try:
                group.remove([index])
            except RuntimeError:
                pass
        for name, weight in interpolated.items():
            group = obj.vertex_groups.get(name)
            if group is None:
                group = obj.vertex_groups.new(name=name)
            group.add([index], weight / total, "REPLACE")

    obj.data.update()
    after = [
        closest_point_on_segments(obj.matrix_world @ obj.data.vertices[index].co, segments)[1]
        for index in targets
    ]
    return before, after


def neck_axis(segments):
    """Centre and radius of the neck polyline, about the world Z axis."""
    points = [point for segment in segments for point in segment[:2]]
    centre = sum(points, Vector()) / len(points)
    radius = sum((point - centre).xy.length for point in points) / len(points)
    return centre, radius


def find_collar_rings(obj, segments, minimum_vertices=8):
    """Boundary rings of ``obj`` that are this mesh's neck opening.

    Bethesda's cuirasses are not clean single shells: a vanilla mesh has
    *hundreds* of open boundary components — trim strips, straps, decorative
    plates, glow cards. "Near the neck" is nowhere near enough to pick the
    collar out of that, and picking wrong drags authored art onto the neck.

    A collar is identified by the one thing only a collar does: it **encircles
    the neck**. Three geometric tests, no names anywhere:

    - it is a real ring, not a sliver (``minimum_vertices``);
    - it is concentric with the neck, at the neck's height, and of comparable
      girth — its centre is within a third of the neck radius of the neck's
      axis and within one and a half radii in Z, and its own mean radius is
      between half and twice the neck's. The waist hem is concentric too, and
      is excluded by both its height and its girth;
    - it goes all the way round: sorted by angle about the axis, its largest
      angular gap is under 90°. A decorative strip alongside the collar fails
      this outright however close it lies.

    Returns ``(rings, rejected)``; ``rejected`` carries the near misses only,
    as measured evidence for a piece that turns out to have no collar at all.
    """
    centre, radius = neck_axis(segments)
    _edges, components = mesh_boundary(obj)
    rings, rejected = [], []
    for component in components:
        points = [obj.matrix_world @ obj.data.vertices[i].co for i in component]
        own_centre = sum(points, Vector()) / len(points)
        offset = (own_centre - centre).xy.length
        own_radius = sum((point - own_centre).xy.length for point in points) / len(points)
        angles = sorted(math.atan2((p - own_centre).y, (p - own_centre).x) for p in points)
        gaps = [angles[i] - angles[i - 1] for i in range(1, len(angles))]
        gaps.append(angles[0] + 2.0 * math.pi - angles[-1])
        widest_gap = max(gaps)
        encircles = (
            len(component) >= minimum_vertices
            and abs(own_centre.z - centre.z) <= radius * 1.5
            and offset <= radius / 3.0
            and radius * 0.5 <= own_radius <= radius * 2.0
            and widest_gap < math.pi / 2.0
        )
        if encircles:
            rings.append(component)
        elif offset <= radius and len(component) >= minimum_vertices:
            rejected.append((len(component), round(float(offset), 4),
                             round(float(own_radius), 4),
                             round(math.degrees(widest_gap))))
    return rings, rejected
