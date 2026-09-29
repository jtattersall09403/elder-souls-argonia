"""Helpers for an agent's script under `wb.py bpy` (runs INSIDE headless
Blender 3.2.2; imports bpy, so never import it from the workbench itself).

Frames: 3D points and directions are Blender's = the workbench's wb frame
(x east, y NORTH, z up; province z south is -y). `ground_height` takes
province (x, z) as every wb.py command does. Objects: every scene piece's
top object is named by its uid and every object of its tree carries a
`wb_uid` property; the ground mesh is 'ground', the water 'water'.

    import bpy_api as api                  # (also passed in as `api`)
    api.ground_height(4743.0, 1877.0)       # padded ground under a point
    api.ray_cast((x, y, z), (0, 0, 1), filter={"hist"})
    api.RESULT["answer"] = ...             # written to the --out JSON
"""
from __future__ import annotations

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

RESULT: dict = {}
"""What the script leaves here is written to the caller's --out JSON."""
ARGS: list = []
"""The script's own arguments (`wb.py bpy ... --args A B`)."""


def objects_by_uid() -> dict[str, list]:
    """{uid: [mesh objects of that piece]} for every posed piece."""
    out: dict[str, list] = {}
    for obj in bpy.data.objects:
        uid = obj.get("wb_uid")
        if uid is not None and obj.type == "MESH":
            out.setdefault(uid, []).append(obj)
    return out


def _meshes(names) -> list:
    """Mesh objects for a uid, 'ground', 'water', or an iterable of them."""
    if isinstance(names, str):
        names = [names]
    by = objects_by_uid()
    out = []
    for n in names:
        if n in by:
            out += by[n]
        elif n in ("ground", "water") and bpy.data.objects.get(n) is not None:
            out.append(bpy.data.objects[n])
        else:
            raise KeyError(f"no piece or mesh {n!r} in the scene")
    return out


def _world_verts(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    mesh = ev.to_mesh()
    try:
        return [ev.matrix_world @ v.co for v in mesh.vertices], \
            [tuple(p.vertices) for p in mesh.polygons]
    finally:
        ev.to_mesh_clear()


_BVH: dict = {}


def _bvh(obj) -> BVHTree:
    """The object's world-space BVH, built once per launch (the scene does
    not move unless the script moves it: call `forget()` after it does)."""
    if obj.name not in _BVH:
        verts, polys = _world_verts(obj)
        _BVH[obj.name] = BVHTree.FromPolygons(verts, polys)
    return _BVH[obj.name]


def forget() -> None:
    """Drop the cached BVHs (after the script moves or edits an object)."""
    _BVH.clear()


def ray_cast(origin, direction, filter=None, distance: float = 1.0e4):
    """The first hit from ``origin`` along ``direction`` (wb frame): {uid,
    object, point, normal, distance} or None. ``filter``: a uid, 'ground',
    'water', or a set of them to hit only those; None hits everything."""
    o, d = Vector(origin), Vector(direction).normalized()
    if filter is None:
        dg = bpy.context.evaluated_depsgraph_get()
        ok, loc, nor, _i, obj, _m = bpy.context.scene.ray_cast(dg, o, d, distance=distance)  # noqa
        if not ok:
            return None
        return {"uid": obj.get("wb_uid") or obj.name, "object": obj.name, "point": tuple(loc),
                "normal": tuple(nor), "distance": (loc - o).length}
    best = None
    for obj in _meshes(filter):
        loc, nor, _i, dist = _bvh(obj).ray_cast(o, d, distance)
        if loc is not None and (best is None or dist < best["distance"]):
            best = {"uid": obj.get("wb_uid") or obj.name, "object": obj.name, "point": tuple(loc),
                    "normal": tuple(nor), "distance": dist}
    return best


def ground_height(x: float, z: float) -> float | None:
    """The padded ground's height at province (x, z), read off the 'ground'
    mesh (a 0.5 m grid of the workbench's own padded heights)."""
    hit = ray_cast((x, -z, 1.0e4), (0.0, 0.0, -1.0), filter="ground", distance=2.0e4)
    return None if hit is None else hit["point"][2]


def bounds(uid: str) -> tuple[tuple, tuple]:
    """((minx, miny, minz), (maxx, maxy, maxz)) of the piece's world mesh."""
    pts = [v for obj in _meshes(uid) for v in _world_verts(obj)[0]]
    return (tuple(min(p[i] for p in pts) for i in range(3)),
            tuple(max(p[i] for p in pts) for i in range(3)))


def lowest_point(uid: str) -> tuple:
    """The piece's lowest world vertex (wb frame)."""
    pts = [v for obj in _meshes(uid) for v in _world_verts(obj)[0]]
    return tuple(min(pts, key=lambda p: p[2]))


def contacts(uid: str, other: str) -> dict:
    """{gapM, overlaps}: the least distance from either piece's vertices to
    the other's surface (0 when their triangles cross) and the number of
    crossing triangle pairs. `other` may be 'ground' or 'water'."""
    a = [(_bvh(o), _world_verts(o)[0]) for o in _meshes(uid)]
    b = [(_bvh(o), _world_verts(o)[0]) for o in _meshes(other)]
    overlaps = sum(len(ta.overlap(tb)) for ta, _ in a for tb, _ in b)
    gap = float("inf")
    for (ta, va), (tb, vb) in ((x, y) for x in a for y in b):
        for v in va:
            hit = tb.find_nearest(v)
            if hit[0] is not None:
                gap = min(gap, hit[3])
        for v in vb:
            hit = ta.find_nearest(v)
            if hit[0] is not None:
                gap = min(gap, hit[3])
    return {"gapM": 0.0 if overlaps else round(gap, 4), "overlaps": overlaps}
