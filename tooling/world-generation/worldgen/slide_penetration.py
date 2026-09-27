"""The slide-penetration metric, shared by the placement workbench's contact
check (`tooling/placement-workbench/workbench/measure.py`) and the abuts
miner's run-joint bars (`mine_abuts.run_joint_bars`), so the bar a run joint
is judged on is measured the way the plugins' own joints were (16k fix 2
round 6 ruling K3).

Everything takes trimesh meshes and 4x4 transforms in one z-up frame.
`min_separation`: the smallest slide that clears two crossing meshes over a
set of candidate directions (bisection to 1 mm; None past `reach`).
`along_run_overlap`: how far the two meshes' bounds overlap along the plan
line joining their pivots, the collinear double-up the slide metric cannot
see (a 4.1 m panel stepped 2.09 m slides clear sideways in 0.1 m)."""
from __future__ import annotations

import math

import numpy as np

PENETRATION_REACH_M = 0.5
"""Penetration beyond this is reported as None (deeply crossing)."""


def manager(mesh_a, ta: np.ndarray, mesh_b, tb: np.ndarray):
    """A trimesh CollisionManager holding "a" and "b" at their transforms."""
    import trimesh
    m = trimesh.collision.CollisionManager()
    m.add_object("b", mesh_b, transform=tb)
    m.add_object("a", mesh_a, transform=ta)
    return m


def separation(m, ta: np.ndarray, direction: np.ndarray,
               reach: float = PENETRATION_REACH_M) -> float | None:
    """How far "a" slides along `direction` before its triangles stop crossing
    "b" (bisection to 1 mm); None past `reach`. Leaves "a" at `ta`."""
    def crossing(t: float) -> bool:
        moved = ta.copy()
        moved[:3, 3] = ta[:3, 3] + direction * t
        m.set_transform("a", moved)
        return bool(m.in_collision_internal())

    try:
        if crossing(reach):
            return None
        lo, hi = 0.0, reach
        while hi - lo > 1e-3:
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if crossing(mid) else (lo, mid)
        return hi
    finally:
        m.set_transform("a", ta)


def candidate_directions(ta: np.ndarray, tb: np.ndarray, normal_of_b=None,
                         normal_of_a=None) -> dict[str, np.ndarray]:
    """B's contact normal, the reverse of A's, the horizontal line between the
    pivots (B to A) and up: the directions `min_separation` tries both ways."""
    out = {}
    if normal_of_b is not None:
        out["normal"] = np.asarray(normal_of_b, dtype=float)
    if normal_of_a is not None:
        out["normal-of-a"] = -np.asarray(normal_of_a, dtype=float)
    d = np.array([ta[0, 3] - tb[0, 3], ta[1, 3] - tb[1, 3], 0.0])
    if np.linalg.norm(d) > 1e-6:
        out["pivots"] = d / np.linalg.norm(d)
    out["up"] = np.array([0.0, 0.0, 1.0])
    return out


def min_separation(m, ta: np.ndarray, directions: dict[str, np.ndarray],
                   reach: float = PENETRATION_REACH_M) -> tuple[float | None, str | None]:
    """(metres, direction label) of the smallest clearing slide over the
    candidate directions, both ways each; (None, None) past `reach` on
    every one."""
    best: tuple[float | None, str | None] = (None, None)
    for name, direction in directions.items():
        for sign, label in ((1.0, name), (-1.0, f"-{name}")):
            got = separation(m, ta, sign * direction, reach)
            if got is not None and (best[0] is None or got < best[0]):
                best = (got, label)
    return best


SURFACE_SAMPLES = 4000
"""Seeded surface samples per mesh (plus every vertex) for the contact normal."""
CONTACT_M = 0.03
"""A sample within this of the other mesh is in contact (the miner's contact)."""


def samples(mesh, count: int = SURFACE_SAMPLES) -> tuple[np.ndarray, np.ndarray]:
    """(points, outward normals) in the mesh frame: seeded surface samples and
    every vertex (vertex normals)."""
    import trimesh
    pts, faces = trimesh.sample.sample_surface(mesh, count, seed=0)
    return (np.vstack([np.asarray(pts), np.asarray(mesh.vertices)]),
            np.vstack([np.asarray(mesh.face_normals[faces]), np.asarray(mesh.vertex_normals)]))


def contact_normal(points_a: np.ndarray, mesh_b, tb: np.ndarray, scale_b: float = 1.0,
                   contact_m: float = CONTACT_M) -> tuple[np.ndarray | None, np.ndarray, np.ndarray]:
    """(B's mean outward normal in the shared frame, or None; the mask of
    `points_a` (shared frame) within `contact_m` of B; the hit triangles).
    `tb` carries B's scale, `scale_b` it alone (distances in B's frame)."""
    from trimesh.proximity import ProximityQuery
    rot = tb[:3, :3]
    local = (points_a - tb[:3, 3]) @ np.linalg.inv(rot).T
    low, high = mesh_b.bounds
    reach = contact_m / scale_b
    near = np.all((local >= low - reach) & (local <= high + reach), axis=1)
    hit = np.zeros(len(points_a), dtype=bool)
    if not near.any():
        return None, hit, np.zeros(0, dtype=int)
    _closest, dist, tri = ProximityQuery(mesh_b).on_surface(local[near])
    close = dist * scale_b <= contact_m
    hit[np.flatnonzero(near)[close]] = True
    if not close.any():
        return None, hit, tri[close]
    nb = mesh_b.face_normals[tri[close]].mean(axis=0) @ (rot / scale_b).T
    norm = float(np.linalg.norm(nb))
    return (nb / norm if norm > 1e-6 else None), hit, tri[close]


def penetration(mesh_a, ta: np.ndarray, mesh_b, tb: np.ndarray,
                reach: float = PENETRATION_REACH_M) -> tuple[bool, float | None, str | None]:
    """(intersecting, penetration m or None, direction label) of two crossing
    meshes at unit scale, over the workbench check's candidate directions:
    each one's contact normal at the other's samples, the pivot line, up."""
    m = manager(mesh_a, ta, mesh_b, tb)
    if not m.in_collision_internal():
        return False, 0.0, None
    pa, _ = samples(mesh_a)
    pb, _ = samples(mesh_b)
    nb, _, _ = contact_normal(pa @ ta[:3, :3].T + ta[:3, 3], mesh_b, tb)
    na, _, _ = contact_normal(pb @ tb[:3, :3].T + tb[:3, 3], mesh_a, ta)
    pen, along = min_separation(m, ta, candidate_directions(ta, tb, nb, na), reach)
    return True, pen, along


def _corners(mesh, t: np.ndarray) -> np.ndarray:
    lo, hi = mesh.bounds
    c = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1])
                  for z in (lo[2], hi[2])])
    return c @ t[:3, :3].T + t[:3, 3]


def along_run_overlap(mesh_a, ta: np.ndarray, mesh_b, tb: np.ndarray) -> float:
    """How far the two meshes' bounds overlap along the plan line joining
    their pivots (metres; negative = a gap; inf when the pivots coincide)."""
    ax = np.array([tb[0, 3] - ta[0, 3], tb[1, 3] - ta[1, 3]])
    length = float(np.linalg.norm(ax))
    if length < 1e-6:
        return math.inf
    ax /= length
    spans = []
    for mesh, t in ((mesh_a, ta), (mesh_b, tb)):
        proj = _corners(mesh, t)[:, :2] @ ax
        spans.append((float(proj.min()), float(proj.max())))
    return min(spans[0][1], spans[1][1]) - max(spans[0][0], spans[1][0])


def weighted_quantile(values, weights, q: float) -> float:
    """The count-weighted q-quantile (lower value at the step, as the
    round-2 fence bars were taken)."""
    order = np.argsort(values)
    v = np.asarray(values, dtype=float)[order]
    w = np.asarray(weights, dtype=float)[order]
    cum = np.cumsum(w) / w.sum()
    return float(v[min(int(np.searchsorted(cum, q)), len(v) - 1)])
