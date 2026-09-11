"""Finding and measuring a neck opening. Geometry only — nothing here moves art.

A vanilla cuirass **embeds the neck-bearing body part inside itself**, and that
loop is a bit-for-bit copy of the matching body's: identical for male and
female, for ``_0`` and ``_1``, to the last bit (decision 0056). So there is no
seam to close. Load the wearer's sex, blend to the wearer's weight, and the
head meets the collar exactly.

What this module is for is proving that, on the geometry that was actually
exported. ``build_armour.py`` finds each cuirass's neck ring here and asserts it
is no wider than the reference body's, for both sexes and both weights. A ring
wider than the neck it is worn on leaves an annulus with nothing behind it —
the white ring at the base of the neck the owner reported, which is the scene's
clear colour.

0055 used these same primitives to *snap* a collar onto a lifted copy of the
male weight-zero neck. That mutation is retired: it deformed authored art to
compensate for loading the wrong version of it, and being derived from the male
reference it could not see that every female build was still open. The finder
survives as the check.

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
    or a hem, which is how an earlier build measured the wrong loop.
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


def ring_profile(obj, ring, axis):
    """A ring's mean height and its mean radius **about the neck axis**.

    Measured about the neck's own axis rather than the ring's centroid, so the
    number is directly comparable with ``neck_axis``'s radius. Measuring each
    about its own centre compares two different things, and would report a
    collar as wider than the neck it is a bit-for-bit copy of.
    """
    points = [obj.matrix_world @ obj.data.vertices[i].co for i in ring]
    centre = sum(points, Vector()) / len(points)
    radius = sum((point - axis).xy.length for point in points) / len(points)
    return centre, radius


def polyline_radius(segments):
    points = [point for segment in segments for point in segment[:2]]
    centre = sum(points, Vector()) / len(points)
    return max((point - centre).length for point in points)


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
    collar out of that, and picking wrong measures a strap and calls it a seam.

    A collar is identified by the one thing only a collar does: it **encircles
    the neck**. Nothing here moves a vertex: the ring it returns is measured,
    and the measurement is the gate. Three geometric tests, no names anywhere:

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
