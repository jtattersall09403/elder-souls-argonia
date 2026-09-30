"""What holds each piece of an interior cell up, on the actual geometry
(16k walk 6). Shared by the exporter's settle pass and `wb.py audit-interior`.

* ``contact_gaps``: per placement, the distance from its surface to the
  nearest surface of any OTHER piece (floor, table, wall, beam, ceiling,
  hook), from its vertices plus a deterministic grid on its faces
  (``SAMPLE_M`` steps, at most ``GRID_MAX`` a side), against only the other
  pieces' triangles within ``REACH_M`` of its box (standard 6: no random
  sampling). A piece
  within ``SUPPORT_M`` of another rests on it, hangs from it or is mounted on
  it; one rule covers a table on the floor, a lantern on its beam, a window
  in its wall. ``inf`` when nothing lies within ``REACH_M``.
* ``down_gaps``: per placement, how far its underside lies above the first
  surface of another piece straight below (rays from its lowest points).
* ``settle``: the exporter pass. A plugin clutter or furniture piece that
  touches nothing but has a surface 0-``SETTLE_MAX_M`` below its underside is
  lowered onto it (Skyrim's havok does this at load; the plugin stores the
  pre-settle pose). Returns the build evidence rows ``{id, dropM}``.
"""
from __future__ import annotations

import numpy as np

from .mesh_query import RAY_CHUNK, nearest_within

SAMPLE_M = 0.03     # grid step on a piece's faces
GRID_MAX = 24       # grid steps a side at most per face
MAX_POINTS = 8000   # probe points per piece at most (even stride)
SUPPORT_M = 0.05
REACH_M = 0.30
SETTLE_MAX_M = 0.12
SETTLE_CATEGORIES = frozenset({"clutter", "furniture", "item", "container"})
PROBE = 0.03


def _piece_points(tris: np.ndarray) -> np.ndarray:
    """Deterministic points on one piece: every vertex plus a barycentric
    grid on each face, ``k`` steps a side where ``k`` = longest edge /
    SAMPLE_M (1..GRID_MAX), so a long face is probed along its length."""
    edge = np.linalg.norm(tris - np.roll(tris, 1, axis=1), axis=2).max(axis=1)
    k = np.clip(np.ceil(edge / SAMPLE_M), 1, GRID_MAX).astype(int)
    out = [tris.reshape(-1, 3)]
    for kk in np.unique(k):
        if kk < 2:
            continue
        a, b = np.meshgrid(np.arange(kk + 1), np.arange(kk + 1), indexing="ij")
        m = (a + b) <= kk
        w = np.stack([a[m], b[m], kk - a[m] - b[m]], 1) / kk      # (P, 3)
        t = tris[k == kk]
        out.append(np.einsum("pj,fjc->fpc", w, t).reshape(-1, 3))
    pts = np.unique(np.round(np.vstack(out), 5), axis=0)
    if len(pts) > MAX_POINTS:
        pts = pts[np.linspace(0, len(pts) - 1, MAX_POINTS).astype(int)]
    return pts


def contact_gaps(mesh, owner, n: int, only=None) -> np.ndarray:
    """Per placement, the gap to the nearest other piece (inf past REACH_M):
    its deterministic points against only the other pieces' triangles
    near each point (mesh_query.nearest_within)."""
    tris_all = mesh.triangles
    out = np.full(n, np.inf)
    order = np.argsort(owner, kind="stable")
    bounds = np.searchsorted(owner[order], np.arange(n + 1))
    for i in (range(n) if only is None else only):
        f = order[bounds[i]:bounds[i + 1]]
        if len(f):
            pts, mine = _piece_points(tris_all[f]), owner == i
            # a touching piece is answered from the SUPPORT_M boxes (few
            # candidates; any nearer triangle lies in them too, so it is the
            # exact minimum); only a loose one pays for the REACH_M boxes
            g = nearest_within(mesh, pts, SUPPORT_M, skip=mine)
            out[i] = g if np.isfinite(g) else nearest_within(mesh, pts, REACH_M, skip=mine)
    return out


def all_hits(mesh, o: np.ndarray, d: np.ndarray):
    """(ray index, triangle index, distance) of every triangle each ray
    crosses (`intersects_id`: `intersects_location` merges a coplanar floor
    hit into the piece's own bottom face)."""
    rs, ts = [np.zeros(0, int)], [np.zeros(0, int)]
    for k in range(0, len(o), RAY_CHUNK):
        t_, r_ = mesh.ray.intersects_id(o[k:k + RAY_CHUNK], d[k:k + RAY_CHUNK], multiple_hits=True)
        rs.append(np.asarray(r_, int) + k)
        ts.append(np.asarray(t_, int))
    ri, ti = np.concatenate(rs), np.concatenate(ts)
    n = mesh.face_normals[ti]
    den = np.einsum("ij,ij->i", n, d[ri])
    num = np.einsum("ij,ij->i", n, mesh.triangles[ti][:, 0] - o[ri])
    with np.errstate(divide="ignore", invalid="ignore"):
        dist = np.where(np.abs(den) > 1e-9, num / den, 0.0)
    return ri, ti, dist


def down_gaps(mesh, owner, idx) -> dict[int, float]:
    """Per placement in `idx`: the smallest drop from its lowest points to
    another piece below (inf when nothing is below)."""
    origins, who = [], []
    for i in idx:
        f = np.where(owner == i)[0]
        if not len(f):
            continue
        v = mesh.vertices[mesh.faces[f].ravel()]
        low = v[v[:, 1] < v[:, 1].min() + 0.01]
        if len(low) > 12:
            low = low[np.linspace(0, len(low) - 1, 12).astype(int)]
        origins.append(low + [0, PROBE, 0])
        who.append(np.full(len(low), i))
    out = {i: np.inf for i in idx}
    if not origins:
        return out
    o, w = np.vstack(origins), np.concatenate(who)
    d = np.tile([0.0, -1.0, 0.0], (len(o), 1))
    ri, ti, dist = all_hits(mesh, o, d)
    for r, t, g in zip(ri, ti, dist - PROBE):
        if owner[t] != w[r] and g > -0.01:
            out[w[r]] = min(out[w[r]], max(float(g), 0.0))
    return out


def settle(bundle: dict, mesh, owner) -> list[dict]:
    """Lower each unsupported plugin clutter/furniture piece onto the surface
    0-SETTLE_MAX_M below it; returns the evidence rows. Mutates positionM."""
    pl = bundle["placements"]
    cand = [i for i, p in enumerate(pl) if p.get("source") != "addition"
            and p.get("category") in SETTLE_CATEGORIES]
    gaps = contact_gaps(mesh, owner, len(pl), only=cand)
    loose = [i for i in cand if gaps[i] > SUPPORT_M]
    rows = []
    for i, g in sorted(down_gaps(mesh, owner, loose).items()):
        if 0.0 < g <= SETTLE_MAX_M:
            pl[i]["positionM"][1] = round(pl[i]["positionM"][1] - g, 4)
            rows.append({"id": pl[i]["id"], "dropM": round(g, 3)})
    return rows
