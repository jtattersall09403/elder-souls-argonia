#!/usr/bin/env python3
"""Measure the head-to-collar relationship on the SHIPPED armour GLBs.

Decision 0056: a piece of armour ships one GLB per sex, carrying its
maximum-weight geometry with the minimum-weight one as a morph target, and the
runtime blends it to the wearer's own body weight. So there is no single
"the cuirass" to measure — there is a cuirass *as worn by this build*, and that
is what this script measures: it reads the wearer's `bodyWeight` out of the
roster, blends the piece to it exactly as the runtime does, and then asks
whether a hole remains.

It reads the shipped files directly — `packages/character-assets/files/armour/`
and `.../races/`, plus `races.json` — so it measures what the game loads, not
what the pipeline believed it wrote. No Blender, no pipeline import: glTF JSON
plus accessors.

Method, matching `pipeline/blender/neck_seam.py`:

* a body's neck ring is its **highest open boundary** component (wrists, ankles
  and hem are all below it);
* a cuirass collar is an open boundary component that **encircles the neck**:
  concentric with the neck axis within a third of the neck radius, within one
  and a half radii in height, half to twice the neck's girth, and closing a
  full turn with no angular gap over 90°. Where several qualify, the innermost
  (nearest the neck polyline) is the collar, as in the build;
* the verdict is a **line of sight**, because the white ring is one: from every
  rim vertex a ray is cast horizontally outwards from the neck axis, the
  direction a camera looks at a neck from, and the wearer's own skin is
  intersected. CLOSED means skin stands in front of every rim vertex, so the
  backdrop cannot be reached through the join. OPEN reports how far the worst
  vertex protrudes, in millimetres.

Two radii are reported beside it as diagnostics, not as the test: how far
inside *this wearer's* neck the rim sits and how far above their neck ring it
ends — decision 0055's own pair, now taken per build rather than against the
narrowest neck in the roster. A ring that encircles nothing is UNKNOWN:
geometry cannot say whether such a piece leaves a hole, only a picture can.

Usage: python3 tooling/asset-pipeline/scripts/measure-neck-seam.py [--json out]
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
ARMOUR_DIR = REPO / "packages/character-assets/files/armour"
RACES_DIR = REPO / "packages/character-assets/files/races"
# The GLBs carry Blender source units (pynifly's 0.1 of a Bethesda unit), the
# same units decision 0055's table was measured in. One of them is 0.142240 m,
# so a 1.94-unit-tall Nord stands 1.94 m. Only used to report millimetres.
METRES_PER_UNIT = 0.142240
MM = 1000.0 * METRES_PER_UNIT

CUIRASSES = ["iron", "steel", "studded", "daedric", "dwarven", "ebony",
             "elven", "glass", "orcish"]

COMPONENT_TYPES = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
                   5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
TYPE_COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


# ---------------------------------------------------------------- glTF reading

def read_glb(path: Path):
    data = path.read_bytes()
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise ValueError("%s is not a GLB" % path)
    offset, gltf, binary = 12, None, b""
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8:offset + 8 + chunk_length]
        if chunk_type == 0x4E4F534A:
            gltf = json.loads(chunk)
        elif chunk_type == 0x004E4942:
            binary = chunk
        offset += 8 + chunk_length + (-chunk_length % 4)
    return gltf, binary


def accessor(gltf, binary, index):
    acc = gltf["accessors"][index]
    fmt, size = COMPONENT_TYPES[acc["componentType"]]
    count = TYPE_COUNTS[acc["type"]]
    if "bufferView" not in acc:
        # glTF allows an accessor with no view: every element is zero. The
        # exporter writes one for a morph target on a mesh the pair does not
        # move, and reading it as a missing buffer loses the whole measurement.
        return [(0,) * count] * acc["count"]
    view = gltf["bufferViews"][acc["bufferView"]]
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride") or size * count
    out = []
    for i in range(acc["count"]):
        out.append(struct.unpack_from("<" + fmt * count, binary, base + i * stride))
    return out


def node_matrices(gltf):
    """World matrix per node, walking the scene graph from its roots."""
    nodes = gltf.get("nodes", [])
    identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

    def local(node):
        if "matrix" in node:
            return list(node["matrix"])
        t = node.get("translation", [0, 0, 0])
        r = node.get("rotation", [0, 0, 0, 1])
        s = node.get("scale", [1, 1, 1])
        x, y, z, w = r
        rot = [
            1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
            2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
            2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
            0, 0, 0, 1,
        ]
        m = [rot[c * 4 + r_] * s[c] for c in range(3) for r_ in range(4)]
        return m[0:4] + m[4:8] + m[8:12] + [t[0], t[1], t[2], 1]

    def multiply(a, b):  # column-major, a applied after b
        out = [0.0] * 16
        for c in range(4):
            for r_ in range(4):
                out[c * 4 + r_] = sum(a[k * 4 + r_] * b[c * 4 + k] for k in range(4))
        return out

    world = {}

    def walk(index, parent):
        m = multiply(parent, local(nodes[index]))
        world[index] = m
        for child in nodes[index].get("children", []):
            walk(child, m)

    roots = set(range(len(nodes)))
    for node in nodes:
        for child in node.get("children", []):
            roots.discard(child)
    for index in sorted(roots):
        walk(index, identity)
    return world


def apply(m, p):
    x, y, z = p
    return (m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14])


def meshes(path: Path, influence: float = 0.0):
    """Every primitive as (positions, triangle indices), in world space.

    Skinned meshes are read in their **bind pose** — the rest positions the
    exporter wrote — which is the pose both the armour and the body were
    authored in.

    ``influence`` blends each primitive towards its first morph target, exactly
    as the runtime does: an armour GLB carries its maximum-weight geometry with
    the minimum-weight one as a target, and the wearer sets
    ``morphTargetInfluences = 1 - weight`` (decision 0056). Measuring the basis
    for every wearer is measuring a mesh nobody is wearing.
    """
    gltf, binary = read_glb(path)
    world = node_matrices(gltf)
    out = []
    for index, node in enumerate(gltf.get("nodes", [])):
        if "mesh" not in node:
            continue
        # glTF ignores a skinned mesh node's own transform: its vertices are
        # already in the skin's space and are posed by the joints. Applying it
        # anyway lifts the body metres into the air.
        matrix = ([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
                  if "skin" in node else world[index])
        for primitive in gltf["meshes"][node["mesh"]].get("primitives", []):
            if primitive.get("mode", 4) != 4 or "POSITION" not in primitive["attributes"]:
                continue
            raw = accessor(gltf, binary, primitive["attributes"]["POSITION"])
            targets = primitive.get("targets") or []
            if influence and targets and "POSITION" in targets[0]:
                delta = accessor(gltf, binary, targets[0]["POSITION"])
                raw = [tuple(raw[i][axis] + influence * delta[i][axis] for axis in range(3))
                       for i in range(len(raw))]
            points = [apply(matrix, p) for p in raw]
            if "indices" not in primitive:
                continue
            flat = [i[0] for i in accessor(gltf, binary, primitive["indices"])]
            triangles = [tuple(flat[i:i + 3]) for i in range(0, len(flat) - 2, 3)]
            out.append((points, triangles))
    return out


# ------------------------------------------------------------------- geometry

def boundary_components(points, triangles, tolerance=1e-6):
    """Open-edge components, welded by position.

    Welding matters: the exporter splits vertices on normals and UVs, so a
    closed seam looks open if edges are matched by index. The build ran on
    Blender's own merged mesh, so this is the equivalent.
    """
    key = {}
    weld = []
    for point in points:
        k = (round(point[0] / tolerance), round(point[1] / tolerance),
             round(point[2] / tolerance))
        if k not in key:
            key[k] = len(key)
        weld.append(key[k])
    representative = {}
    for index, point in enumerate(points):
        representative.setdefault(weld[index], point)

    uses = {}
    for a, b, c in triangles:
        for start, end in ((a, b), (b, c), (c, a)):
            edge = tuple(sorted((weld[start], weld[end])))
            if edge[0] == edge[1]:
                continue
            uses[edge] = uses.get(edge, 0) + 1
    open_edges = [edge for edge, count in uses.items() if count == 1]
    neighbours = {}
    for start, end in open_edges:
        neighbours.setdefault(start, set()).add(end)
        neighbours.setdefault(end, set()).add(start)
    components, unseen = [], set(neighbours)
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
        components.append([representative[i] for i in component])
    return components


def profile(points, axis=None):
    """Centre, mean radius about `axis` (or its own centre), and widest gap."""
    n = len(points)
    centre = (sum(p[0] for p in points) / n, sum(p[1] for p in points) / n,
              sum(p[2] for p in points) / n)
    about = axis or centre
    radii = [math.hypot(p[0] - about[0], p[2] - about[2]) for p in points]
    angles = sorted(math.atan2(p[2] - centre[2], p[0] - centre[0]) for p in points)
    gaps = [angles[i] - angles[i - 1] for i in range(1, len(angles))]
    gaps.append(angles[0] + 2 * math.pi - angles[-1])
    return {
        "centre": centre,
        "meanRadius": sum(radii) / n,
        "maxRadius": max(radii),
        "minHeight": min(p[1] for p in points),
        "maxHeight": max(p[1] for p in points),
        "meanHeight": centre[1],
        "widestGap": max(gaps),
        "vertices": n,
        "points": points,
    }


def radius_at(ring, angle, axis):
    """The ring's radius about `axis` at one bearing, interpolated round it.

    A neck is not a circle — it is wider front to back than side to side — so
    comparing a collar's *mean* radius with a neck's *mean* radius (which is
    what decision 0055 reported) can hide a rim standing proud at the sides
    while the means agree. This is the per-bearing comparison that cannot.
    """
    samples = sorted(
        (math.atan2(p[2] - axis[2], p[0] - axis[0]),
         math.hypot(p[0] - axis[0], p[2] - axis[2]),
         p[1])
        for p in ring["points"]
    )
    for index, (bearing, _radius, _height) in enumerate(samples):
        if bearing >= angle:
            break
    else:
        index = 0
    previous = samples[index - 1]
    current = samples[index]
    span = (current[0] - previous[0]) % (2 * math.pi)
    fraction = 0.0 if span <= 1e-9 else ((angle - previous[0]) % (2 * math.pi)) / span
    fraction = max(0.0, min(1.0, fraction))
    return (previous[1] + (current[1] - previous[1]) * fraction,
            previous[2] + (current[2] - previous[2]) * fraction)


def ray_triangle(origin, direction, a, b, c):
    """Möller–Trumbore: the ray parameter of a hit, or None."""
    e1 = [b[i] - a[i] for i in range(3)]
    e2 = [c[i] - a[i] for i in range(3)]
    p = [direction[1] * e2[2] - direction[2] * e2[1],
         direction[2] * e2[0] - direction[0] * e2[2],
         direction[0] * e2[1] - direction[1] * e2[0]]
    determinant = sum(e1[i] * p[i] for i in range(3))
    if abs(determinant) < 1e-12:
        return None
    inverse = 1.0 / determinant
    t_vector = [origin[i] - a[i] for i in range(3)]
    u = sum(t_vector[i] * p[i] for i in range(3)) * inverse
    if u < 0.0 or u > 1.0:
        return None
    q = [t_vector[1] * e1[2] - t_vector[2] * e1[1],
         t_vector[2] * e1[0] - t_vector[0] * e1[2],
         t_vector[0] * e1[1] - t_vector[1] * e1[0]]
    v = sum(direction[i] * q[i] for i in range(3)) * inverse
    if v < 0.0 or u + v > 1.0:
        return None
    return sum(e2[i] * q[i] for i in range(3)) * inverse


def skin_clearance(collar, skin, axis, band=0.35):
    """Is every rim vertex hidden behind skin, and by how much?

    The white ring is a line of sight, so this is measured as one: from each rim
    vertex a horizontal ray is cast straight outwards from the neck axis — the
    direction a camera looks at a neck from — and the body's own triangles are
    intersected. A hit means skin stands in front of that vertex and the
    backdrop cannot be reached through it.

    The returned margin is the worst vertex: **positive** is how far outside the
    rim the covering skin sits, **negative** is how far the rim protrudes beyond
    the skin it was meant to hide behind. Unlike decision 0055's comparison of
    two mean radii, this works for a high collar, where it is the head rather
    than the neck ring that has to do the hiding.

    ``skin`` is ``[(points, triangles), ...]``.
    """
    low = min(p[1] for p in collar["points"]) - band
    high = max(p[1] for p in collar["points"]) + band
    near = []
    for points, triangles in skin:
        for tri in triangles:
            a, b, c = (points[i] for i in tri)
            if not (low <= a[1] <= high or low <= b[1] <= high or low <= c[1] <= high):
                continue
            near.append((a, b, c))
    if not near:
        return None
    worst = None
    for point in collar["points"]:
        offset = [point[0] - axis[0], 0.0, point[2] - axis[2]]
        length = math.hypot(offset[0], offset[2])
        if length <= 1e-9:
            continue
        direction = [offset[0] / length, 0.0, offset[2] / length]
        outward = [t for t in (ray_triangle(point, direction, *tri) for tri in near)
                   if t is not None and t > 1e-5]
        if outward:
            margin = min(outward)
        else:
            # Nothing in front of it. How far it protrudes is how far back the
            # skin is: the nearest hit looking the other way.
            inward = [t for t in (ray_triangle(point, [-d for d in direction], *tri)
                                  for tri in near)
                      if t is not None and t > 1e-5]
            margin = -min(inward) if inward else -length
        if worst is None or margin < worst:
            worst = margin
    return worst


def clearance(collar, neck):
    """Worst per-bearing radial and vertical margin of a rim against a neck.

    Radial margin is positive when the rim is **inside** the neck at that
    bearing, which is the only thing that puts skin between the rim and the
    camera. Vertical margin is positive when the rim is above the neck ring
    there, i.e. buried in the head's own neck.
    """
    axis = neck["centre"]
    worst_radial = None
    worst_vertical = None
    for point in collar["points"]:
        angle = math.atan2(point[2] - axis[2], point[0] - axis[0])
        neck_radius, neck_height = radius_at(neck, angle, axis)
        radial = neck_radius - math.hypot(point[0] - axis[0], point[2] - axis[2])
        vertical = point[1] - neck_height
        if worst_radial is None or radial < worst_radial:
            worst_radial = radial
        if worst_vertical is None or vertical < worst_vertical:
            worst_vertical = vertical
    return worst_radial, worst_vertical


def neck_ring(path: Path):
    """A body's neck: the highest open boundary of its **skin** mesh.

    The skin is the primitive with the most vertices, as in `build_armour.py`'s
    `load_reference_body`. Searching every primitive instead finds the eyelash
    and hair cards, which sit above the neck and are not it.

    glTF is Y-up, so "highest" is +Y here where the Blender module used +Z.
    """
    primitives = meshes(path)
    if not primitives:
        return None
    points, triangles = max(primitives, key=lambda p: len(p[0]))
    best = None
    for component in boundary_components(points, triangles):
        if len(component) < 8:
            continue
        ring = profile(component)
        if best is None or ring["meanHeight"] > best["meanHeight"]:
            best = ring
    return best


def collar_ring(path: Path, neck, influence: float = 0.0):
    """The cuirass's collar, or None. Same encirclement test as the build.

    ``influence`` blends the piece to the wearer first; a collar measured on the
    unblended basis is a collar nobody but a maximum-weight wearer has.
    """
    centre, radius = neck["centre"], neck["meanRadius"]
    qualifying, near = [], []
    for points, triangles in meshes(path, influence):
        for component in boundary_components(points, triangles):
            if len(component) < 8:
                continue
            ring = profile(component, axis=centre)
            own = ring["centre"]
            offset = math.hypot(own[0] - centre[0], own[2] - centre[2])
            encircles = (
                abs(own[1] - centre[1]) <= radius * 1.5
                and offset <= radius / 3.0
                and radius * 0.5 <= ring["meanRadius"] <= radius * 2.0
                and ring["widestGap"] < math.pi / 2.0
            )
            if encircles:
                qualifying.append(ring)
            elif offset <= radius:
                near.append({
                    "vertices": ring["vertices"],
                    "offset": round(offset, 4),
                    "radius": round(ring["meanRadius"], 4),
                    "widestGapDegrees": round(math.degrees(ring["widestGap"])),
                })
    if not qualifying:
        near.sort(key=lambda r: r["offset"])
        return None, near[:6]
    # The innermost qualifying ring is the collar; outer concentric rings are
    # the piece's own authored layers. "Innermost" is ranked by distance to the
    # neck itself, as `build_armour.py` ranks it — not by radius, which on glass
    # promotes a decorative ring standing 40 mm higher than the stitched rim.
    def to_neck(ring):
        return sum(
            min(math.dist(point, neck_point) for neck_point in neck["points"])
            for point in ring["points"]
        ) / ring["vertices"]

    qualifying.sort(key=to_neck)
    return qualifying[0], near[:6]


# ----------------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, default=None)
    parser.add_argument("--builds", type=int, default=3,
                        help="how many builds per sex to measure each cuirass on")
    arguments = parser.parse_args()

    roster = json.loads((REPO / "packages/game-core/src/actors/generated/races.json")
                        .read_text())
    weights = {b: entry.get("bodyWeight") for b, entry in roster["builds"].items()}

    bodies = {"male": {}, "female": {}}
    skins = {"male": {}, "female": {}}
    for path in sorted(RACES_DIR.glob("*.glb")):
        race, sex = path.stem.rsplit("-", 1)
        ring = neck_ring(path)
        # Every surface the build wears, head included: what the rim has to hide
        # behind is the whole skin, not only the neck ring.
        skins[sex][race] = meshes(path)
        if ring is None:
            print("!! %s has no open neck boundary" % path.name, file=sys.stderr)
            continue
        bodies[sex][race] = ring

    report = {"schemaVersion": 2, "metresPerUnit": METRES_PER_UNIT,
              "bodies": {}, "cuirasses": {}}
    rows = []
    for sex in ("male", "female"):
        rings = bodies[sex]
        report["bodies"][sex] = {
            "builds": len(rings),
            "narrowestNeckRadius": round(min(r["meanRadius"] for r in rings.values()), 6),
            "widestNeckRadius": round(max(r["meanRadius"] for r in rings.values()), 6),
            "unit": "source units of %.6f m" % METRES_PER_UNIT,
        }
        # The widest and narrowest wearers plus the middle one: the blend is
        # linear, so the extremes bound it and a sample between them shows the
        # bound is not an artefact of the ends.
        ordered = sorted(rings, key=lambda race: weights.get("%s-%s" % (race, sex)) or 0.0)
        picks = [ordered[0], ordered[len(ordered) // 2], ordered[-1]][:arguments.builds]
        print("%-6s %2d builds | measuring on %s" % (sex, len(rings), ", ".join(picks)))

        for cuirass in CUIRASSES:
            path = ARMOUR_DIR / ("%s-cuirass-%s.glb" % (cuirass, sex))
            for race in picks:
                build = "%s-%s" % (race, sex)
                weight = weights.get(build)
                if weight is None:
                    print("!! %s publishes no bodyWeight" % build, file=sys.stderr)
                    return 1
                neck = rings[race]
                # Blended to this wearer before anything is measured. That is
                # the whole of decision 0056: the piece a weight-20 Nord woman
                # wears is not the piece a weight-100 Khajiit woman wears.
                influence = 1.0 - weight / 100.0
                collar, near = collar_ring(path, neck, influence)
                if collar is None:
                    rows.append({"cuirass": cuirass, "sex": sex, "build": build,
                                 "bodyWeight": weight, "state": "UNKNOWN",
                                 "nearMisses": near})
                    continue
                # The verdict, and it is a line of sight rather than a pair of
                # radii: from every rim vertex, cast straight outwards from the
                # neck axis and ask whether the wearer's own skin stands in
                # front of it. Positive is skin in front — no path to the
                # backdrop. Negative is the rim protruding past the skin, and
                # its size is the hole.
                margin = skin_clearance(collar, skins[sex][race], neck["centre"])
                if margin is None:
                    rows.append({"cuirass": cuirass, "sex": sex, "build": build,
                                 "bodyWeight": weight, "state": "UNKNOWN"})
                    continue
                radial, vertical = clearance(collar, neck)
                # A rim that lies *on* the neck is the best case there is, and
                # the ray cannot see it: a ray leaving a vertex coincident with
                # the surface hits nothing in front of it and then reports the
                # far wall of the neck behind it, hundreds of millimetres away.
                # Most vanilla cuirasses embed the body's neck-bearing part and
                # copy its loop bit-for-bit, so this is the common case, not an
                # edge one. Coincidence is read off the two radii instead.
                coincident = abs(radial * MM) < 0.5 and abs(vertical * MM) < 0.5
                if coincident:
                    margin = 0.0
                rows.append({
                    "cuirass": cuirass, "sex": sex, "build": build,
                    "bodyWeight": weight,
                    "state": "CLOSED" if margin >= 0 else "OPEN",
                    "rimOnNeck": coincident,
                    "skinMarginMm": round(margin * MM, 2),
                    "insideOwnNeckMm": round(radial * MM, 2),
                    "aboveOwnNeckRingMm": round(vertical * MM, 2),
                    "collarVertices": collar["vertices"],
                })

    print()
    print("| Cuirass | Sex | Build | weight | State | rim vs this wearer's skin "
          "| inside own neck | above own neck ring |")
    print("| --- | --- | --- | ---: | --- | ---: | ---: | ---: |")
    for row in rows:
        report["cuirasses"].setdefault(row["cuirass"], {}).setdefault(
            row["sex"], {})[row["build"]] = row
        if row["state"] == "UNKNOWN":
            print("| %s | %s | %s | %g | UNKNOWN | no ring encircles the neck | — | — |"
                  % (row["cuirass"], row["sex"], row["build"], row["bodyWeight"]))
            continue
        print("| %s | %s | %s | %g | %s | %+.2f mm | %+.2f mm | %+.2f mm |" % (
            row["cuirass"], row["sex"], row["build"], row["bodyWeight"], row["state"],
            row["skinMarginMm"], row["insideOwnNeckMm"], row["aboveOwnNeckRingMm"]))

    if arguments.json:
        arguments.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
