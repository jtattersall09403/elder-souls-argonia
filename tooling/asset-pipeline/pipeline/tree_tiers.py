"""Part-aware mid and far mesh tiers for the heavy trees (vegetation round 13).

Kit post-pass on the finished GLB, like `trunk_solids` and `vet_kit`: for every
asset the kit config lists under `treeTiers.assets`, it writes two new mesh
levels under the asset's root node (`extras.lod` 1 = mid, 2 = far; the baked
card stays at lod 3), and records them on the manifest row as `lodTiers`.

No decimation (owner, binding; decision 0075 §6): a collapse simplifier
deletes alpha-tested leaf cards by geometric error and scrambles their UVs.
Every tier is built from the source's own parts, whole:

* A part is LEAF when its base-colour texture is an alpha-tested card (more
  than `LEAF_ALPHA_SHARE` of its texels under the cutoff), else BARK.
* Leaf parts are thinned the SpeedTree way: the part's welded islands (the
  leaf cards and fronds, 2-16 triangles each) are clustered by k-means on
  their area-weighted centroids into `keep x islands` clusters; each cluster
  keeps ONE island (the one nearest the cluster centre) and scales it about
  its own centroid by `sqrt(cluster area / kept area) ** gain`, capped at
  `maxScale`, so the cluster's leaf area survives on fewer cards. The kept
  cards are the source's own cards, with the source's own texture and UVs.
* Bark parts keep their welded islands (trunk, limbs, twigs) largest first
  (bounding-box diagonal) until `barkKeep` of the bark triangles are kept;
  the trunk and main limbs survive, the twigs inside the canopy go.
* Bark tubes (`barkTube: 1`, round 13b, NOT SHIPPED on any asset yet): a
  bark island of TUBE_MIN_TRIS or more is rebuilt as a swept
  `barkSides`-gon along its ring skeleton (`tube_skeleton`: geodesic bands
  from the island's lowest vertex, rings circle-fitted, collinear rings
  merged within `barkTol` m), frames parallel-transported, UVs generated at
  the source's texel density; `tube_fits` (`barkFit`) keeps the source
  island where the rebuild strays. It passes the silhouette bar on the
  mangroves at 54-68 % but FAILED the image judge (round13b.md): a cone over
  gkb2's root flare, breaks where gkb9's abutting trunk islands meet, square
  stubby roots, and dark bands where generated UVs sample a bark atlas.
  `barkTube: 2` (round 13c, `tube_runs`) rebuilds only the straight ring
  runs inside each island and keeps flares, forks and collars as source,
  normals and vertex colours blended across the join. Either mode ships
  only with an image-judge PASS (`tree_tiers_check.record`).

Settings per asset are CALIBRATED, not guessed: `tree_tiers_check
--calibrate` renders a ladder of leaf keeps and area gains against the
source at each tier's hand-over distance, and `--record` writes the lightest
setting that passes the silhouette bar into `treeTiers.perAsset` (null = no
setting passed within the share cap, `tree_tiers_check.max_share`: kit
`treeTiers.maxShare`, asset `treeTiers.maxShareByAsset`; that tier is not built).

Materials: each tier primitive gets its OWN glTF material, a copy of the
source material (same name and textures, extras `esTier`), because the runtime swaps an
alpha-tested part back to its base geometry when a level shares the base's
material (`floraKit.ts`, 0075 §6); a copy is a distinct three.js material.
Textures and images are shared, so a tier adds geometry bytes only.

Validation lives in `pipeline/tree_tiers_check.py` (coverage IoU from eight
azimuths at the hand-over distance, contact sheets for the image judge).

    python3 -m pipeline.tree_tiers --kit flora-province-v1            # write
    python3 -m pipeline.tree_tiers --kit flora-province-v1 --dry      # counts
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import struct
from pathlib import Path

import numpy as np

PIPELINE_DIR = Path(__file__).resolve().parent
REPO_ROOT = PIPELINE_DIR.parents[2]
CONFIG = PIPELINE_DIR / "config" / "kits"

#: A base-colour texture with more than this share of texels under the alpha
#: cutoff is a leaf/frond card atlas; bark is opaque (0-2 %).
LEAF_ALPHA_SHARE = 0.10
MID_LEVEL, FAR_LEVEL = 1, 2
TIER_METHOD = "part-aware-rebuild-v1"

#: Defaults per tier; a kit's `treeTiers.<tier>` overrides them.
DEFAULT_TIERS = {
    "mid": {"leafKeep": 0.28, "gain": 0.85, "maxScale": 2.6, "barkKeep": 0.35,
            "lengthShare": 0.5, "outer": 0.0, "barkTube": 0, "barkSides": 6, "barkTol": 0.05, "barkFit": 2.5},
    "far": {"leafKeep": 0.20, "gain": 0.85, "maxScale": 4.0, "barkKeep": 0.12,
            "lengthShare": 0.5, "outer": 0.0, "barkTube": 0, "barkSides": 5, "barkTol": 0.12, "barkFit": 2.5},
}

_CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8,
       5122: np.int16, 5120: np.int8}
_NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
_CT_OF = {np.dtype(v): k for k, v in _CT.items()}


# --- GLB in and out -----------------------------------------------------------

def load_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    jlen, = struct.unpack_from("<I", data, 12)
    gltf = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    blen, = struct.unpack_from("<I", data, off)
    return gltf, data[off + 8:off + 8 + blen]


def save_glb(path: Path, gltf: dict, blob: bytes) -> None:
    gltf["buffers"] = [{"byteLength": len(blob)}]
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    blob = blob + b"\0" * (-len(blob) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(blob), 0x004E4942) + blob
    path.write_bytes(out)


def accessor(gltf: dict, blob: bytes, index: int) -> np.ndarray:
    acc = gltf["accessors"][index]
    view = gltf["bufferViews"][acc["bufferView"]]
    dtype = np.dtype(_CT[acc["componentType"]])
    n = _NC[acc["type"]]
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride") or dtype.itemsize * n
    raw = np.frombuffer(blob, np.uint8, count=stride * (acc["count"] - 1) + dtype.itemsize * n,
                        offset=start)
    rows = np.lib.stride_tricks.as_strided(raw, (acc["count"], dtype.itemsize * n), (stride, 1))
    out = rows.copy().view(dtype).reshape(acc["count"], n)
    if acc.get("normalized"):
        out = out.astype(np.float32)   # kept as stored; normalisation re-applied on write
    return out if n > 1 else out[:, 0]


class BlobWriter:
    """Appends accessors to a GLB's single buffer (4-byte aligned views)."""

    def __init__(self, gltf: dict, blob: bytes):
        self.gltf, self.parts, self.length = gltf, [blob], len(blob)

    def add(self, array: np.ndarray, like: dict | None = None, target: int | None = None,
            with_bounds: bool = False) -> int:
        array = np.ascontiguousarray(array)
        pad = -self.length % 4
        if pad:
            self.parts.append(b"\0" * pad)
            self.length += pad
        data = array.tobytes()
        view = {"buffer": 0, "byteOffset": self.length, "byteLength": len(data)}
        if target:
            view["target"] = target
        self.gltf["bufferViews"].append(view)
        self.parts.append(data)
        self.length += len(data)
        n = 1 if array.ndim == 1 else array.shape[1]
        acc = {"bufferView": len(self.gltf["bufferViews"]) - 1,
               "componentType": _CT_OF[array.dtype], "count": int(array.shape[0]),
               "type": {1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4"}[n]}
        if like and like.get("normalized"):
            acc["normalized"] = True
        if with_bounds:
            acc["min"] = [float(v) for v in array.min(axis=0)]
            acc["max"] = [float(v) for v in array.max(axis=0)]
        self.gltf["accessors"].append(acc)
        return len(self.gltf["accessors"]) - 1

    def blob(self) -> bytes:
        return b"".join(self.parts)


# --- geometry -------------------------------------------------------------------

def welded_islands(pos: np.ndarray, tris: np.ndarray) -> np.ndarray:
    """Island label per triangle: triangles sharing a welded (1e-4 m) vertex."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    _, weld = np.unique(np.round(pos.astype(np.float64), 4), axis=0, return_inverse=True)
    weld = weld.ravel()
    w = weld[tris]
    n = int(weld.max()) + 1
    rows = np.concatenate([w[:, 0], w[:, 1]])
    cols = np.concatenate([w[:, 1], w[:, 2]])
    _, label = connected_components(coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n)),
                                    directed=False)
    _, island = np.unique(label[w[:, 0]], return_inverse=True)
    return island.ravel()


def island_facts(pos: np.ndarray, tris: np.ndarray, island: np.ndarray):
    """Per island: area (m^2), area-weighted centroid, bbox diagonal (m)."""
    p = pos.astype(np.float64)[tris]
    area = 0.5 * np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1)
    cen = p.mean(axis=1)
    k = int(island.max()) + 1
    a = np.bincount(island, area, k)
    c = np.stack([np.bincount(island, area * cen[:, j], k) for j in range(3)], 1)
    c = c / np.maximum(a, 1e-12)[:, None]
    lo = np.full((k, 3), np.inf)
    hi = np.full((k, 3), -np.inf)
    flat = p.reshape(-1, 3)
    owner = np.repeat(island, 3)
    for j in range(3):
        np.minimum.at(lo[:, j], owner, flat[:, j])
        np.maximum.at(hi[:, j], owner, flat[:, j])
    diag = np.linalg.norm(hi - lo, axis=1)
    return a, c, diag


def kmeans(points: np.ndarray, weights: np.ndarray, k: int, seed: int, iters: int = 25):
    """Deterministic weighted k-means (farthest-point seeded). Returns labels."""
    n = len(points)
    if k >= n:
        return np.arange(n)
    rng = np.random.default_rng(seed)
    centres = [points[rng.integers(n)]]
    d2 = np.sum((points - centres[0]) ** 2, axis=1)
    for _ in range(1, k):
        i = int(np.argmax(d2))
        centres.append(points[i])
        d2 = np.minimum(d2, np.sum((points - points[i]) ** 2, axis=1))
    centres = np.array(centres)
    from scipy.spatial import cKDTree
    for _ in range(iters):
        _, label = cKDTree(centres).query(points)
        w = np.bincount(label, weights, k)
        moved = np.stack([np.bincount(label, weights * points[:, j], k) for j in range(3)], 1)
        keep = w > 0
        centres[keep] = moved[keep] / w[keep][:, None]
    _, label = cKDTree(centres).query(points)
    return label


def thin_leaves(pos, tris, keep, gain, max_scale, seed, length_share=0.5, outer=0.0):
    """(kept triangle indices, new positions) for one leaf part.

    A kept card grows by `scale` in area terms (`scale ** 2`), split between
    its long axis (`scale ** (2 * length_share)`) and its cross axes: a
    willow strand widens more than it lengthens, so the canopy's hanging
    hem stays where the source's tips are."""
    island = welded_islands(pos, tris)
    area, cen, _ = island_facts(pos, tris, island)
    n = len(area)
    k = max(1, int(round(n * keep)))
    label = kmeans(cen, np.maximum(area, 1e-9), k, seed)
    new_pos = pos.astype(np.float64).copy()
    kept_islands = []
    moved_vertices = set()
    # "Outer" preference: the canopy's outline is made by its outermost cards
    # (the inner ones are hidden behind them from every side), so a cluster
    # keeps, among its members, the card furthest out of the canopy's
    # ellipsoid when `outer` is 1, the one nearest the cluster centre at 0.
    span = np.maximum(cen.max(axis=0) - cen.min(axis=0), 1e-6) / 2
    middle = (cen.max(axis=0) + cen.min(axis=0)) / 2
    radial = np.linalg.norm((cen - middle) / span, axis=1)
    for cluster in np.unique(label):
        members = np.nonzero(label == cluster)[0]
        centre = np.average(cen[members], axis=0, weights=np.maximum(area[members], 1e-9))
        near = np.sqrt(np.sum((cen[members] - centre) ** 2, axis=1))
        near = near / max(near.max(), 1e-9)
        pick = members[np.argmin((1 - outer) * near - outer * radial[members])]
        scale = min(max_scale, (area[members].sum() / max(area[pick], 1e-9)) ** (0.5 * gain))
        kept_islands.append(pick)
        tri_ids = np.nonzero(island == pick)[0]
        verts = np.unique(tris[tri_ids])
        verts = np.array([v for v in verts if v not in moved_vertices], dtype=np.int64)
        moved_vertices.update(verts.tolist())
        local = new_pos[verts] - cen[pick]
        if len(verts) >= 3:
            _, _, axes = np.linalg.svd(local - local.mean(axis=0), full_matrices=False)
        else:
            axes = np.eye(3)
        factors = np.array([scale ** (2 * length_share)] + [scale ** (2 * (1 - length_share))] * 2)
        coords = local @ axes.T
        new_pos[verts] = cen[pick] + (coords * factors[:len(axes)]) @ axes
    kept = np.isin(island, np.array(kept_islands))
    return np.nonzero(kept)[0], new_pos


def thin_bark(pos, tris, keep):
    """Kept triangle indices for one bark part: largest islands first."""
    island = welded_islands(pos, tris)
    _, _, diag = island_facts(pos, tris, island)
    counts = np.bincount(island)
    order = np.argsort(-diag, kind="stable")
    budget = keep * len(tris)
    chosen, total = [], 0
    for isl in order:
        if total >= budget and chosen:
            break
        chosen.append(isl)
        total += counts[isl]
    return np.nonzero(np.isin(island, np.array(chosen)))[0]


def _dp_keep(points: np.ndarray, radius: np.ndarray, tol: float) -> list[int]:
    """Douglas-Peucker over a chain of ring centres (and radii): the indices
    of the rings kept so every dropped ring's centre lies within `tol` of the
    straight line between its kept neighbours and its radius within `tol` of
    their interpolation. Collinear rings of an even taper merge."""
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j - i < 2:
            continue
        a, b = points[i], points[j]
        ab = b - a
        L = float(np.dot(ab, ab))
        mid = points[i + 1:j]
        t = np.clip(((mid - a) @ ab) / L, 0, 1) if L > 1e-12 else np.zeros(len(mid))
        off = np.linalg.norm(mid - (a + t[:, None] * ab), axis=1)
        dr = np.abs(radius[i + 1:j] - (radius[i] + t * (radius[j] - radius[i])))
        err = np.maximum(off, dr)
        k = int(np.argmax(err))
        if err[k] > tol:
            keep.add(i + 1 + k)
            stack += [(i, i + 1 + k), (i + 1 + k, j)]
    return sorted(keep)


def tube_skeleton(pos: np.ndarray, tris: np.ndarray, tol: float, detail: dict | None = None):
    """The ring skeleton of one welded bark island: rings are the connected
    pieces of geodesic-distance bands from the island's lowest vertex (one
    band = 2 median edge lengths), each ring a centre and a mean radius; a
    ring joins the rings of the next band it shares a mesh edge with. Chains
    of rings are then merged where collinear (`_dp_keep`, `tol` metres).
    Returns (centres (n,3), clamped radii (n,), kept edges [(parent, child)],
    kept ring ids (sorted)). With
    `detail` (a dict), also fills it with `weld` (source vertex -> welded
    vertex), `ring` (welded vertex -> ring, -1 unused) and `chains` (every
    ring chain between branch points and ends, before the merge)."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components, dijkstra
    # Weld first: UV seams split the source's vertices, the tube is one surface.
    p, weld = np.unique(np.round(pos.astype(np.float64), 4), axis=0, return_inverse=True)
    tris = weld.ravel()[tris]
    e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    e = np.unique(np.sort(e, axis=1), axis=0)
    length = np.linalg.norm(p[e[:, 0]] - p[e[:, 1]], axis=1)
    n = len(p)
    graph = coo_matrix((np.maximum(length, 1e-9), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    used = np.unique(tris)
    seed = int(used[np.argmin(p[used, 1])])
    dist = dijkstra(graph, directed=False, indices=seed)
    step = 2.0 * float(np.median(length))
    band = np.full(n, -1)
    band[used] = np.floor(dist[used] / step).astype(int)
    same = band[e[:, 0]] == band[e[:, 1]]
    ring_graph = coo_matrix((np.ones(int(same.sum())), (e[same, 0], e[same, 1])), shape=(n, n))
    _, ring = connected_components(ring_graph, directed=False)
    ring_ids, ring_of = np.unique(ring[used], return_inverse=True)
    lookup = np.full(n, -1)
    lookup[used] = ring_of.ravel()
    k = len(ring_ids)
    count = np.bincount(lookup[used], minlength=k).astype(np.float64)
    centre = np.stack([np.bincount(lookup[used], p[used, j], k) for j in range(3)], 1) / count[:, None]
    ring_band = np.zeros(k, int)
    ring_band[lookup[used]] = band[used]
    # A band can cut one cross-section into fragments (a slanted cut across
    # a fork or a hollow); fragments of one band whose extents overlap are
    # one ring.
    extent = np.zeros(k)
    np.maximum.at(extent, lookup[used], np.linalg.norm(p[used] - centre[lookup[used]], axis=1))
    union = np.arange(k)

    def find(i):
        while union[i] != i:
            union[i] = union[union[i]]
            i = union[i]
        return i
    for bnd in np.unique(ring_band):
        members = np.nonzero(ring_band == bnd)[0]
        for ii, x in enumerate(members):
            for y in members[ii + 1:]:
                if np.linalg.norm(centre[x] - centre[y]) < 0.75 * (extent[x] + extent[y]):
                    union[find(x)] = find(y)
    roots_of = np.array([find(i) for i in range(k)])
    if len(np.unique(roots_of)) < k:
        _, merged = np.unique(roots_of, return_inverse=True)
        lookup[used] = merged.ravel()[lookup[used]]
        k = int(merged.max()) + 1
        count = np.bincount(lookup[used], minlength=k).astype(np.float64)
        centre = np.stack([np.bincount(lookup[used], p[used, j], k) for j in range(3)], 1) / count[:, None]
        ring_band = np.zeros(k, int)
        ring_band[lookup[used]] = band[used]
    cross = ~same & (band[e[:, 0]] >= 0) & (band[e[:, 1]] >= 0)
    a, b = lookup[e[cross, 0]], lookup[e[cross, 1]]
    swap = ring_band[a] > ring_band[b]
    a, b = np.where(swap, b, a), np.where(swap, a, b)
    links = {(int(x), int(y)) for x, y in zip(a, b) if ring_band[y] == ring_band[x] + 1}
    children: dict[int, list[int]] = {}
    parent: dict[int, int] = {}
    for x, y in sorted(links):
        if y in parent:          # a ring reached from two rings: keep the nearer
            if np.linalg.norm(centre[x] - centre[y]) >= np.linalg.norm(centre[parent[y]] - centre[y]):
                continue
            children[parent[y]].remove(y)
        parent[y] = x
        children.setdefault(x, []).append(y)
    # Radius: mean distance of the ring's vertices from its centre, measured
    # across the local tube direction (parent to child).
    direction = np.zeros((k, 3))
    for y, x in parent.items():
        direction[y] += centre[y] - centre[x]
        direction[x] += centre[y] - centre[x]
    direction /= np.maximum(np.linalg.norm(direction, axis=1), 1e-9)[:, None]
    rel = p[used] - centre[lookup[used]]
    along = np.sum(rel * direction[lookup[used]], axis=1)
    perp = np.linalg.norm(rel - along[:, None] * direction[lookup[used]], axis=1)
    radius = np.bincount(lookup[used], perp, k) / count
    # Where a band front wraps round a tube it cuts an open arc, whose
    # centroid sits off the axis: a circle fitted across the tube (Kasa
    # least squares) recovers the axis and radius; a fit wilder than the
    # ring's own extent falls back to the centroid.
    order_v = np.argsort(lookup[used], kind="stable")
    starts = np.searchsorted(lookup[used][order_v], np.arange(k + 1))
    for r in range(k):
        vs = used[order_v[starts[r]:starts[r + 1]]]
        if len(vs) < 5:
            continue
        d = direction[r]
        x = np.eye(3)[int(np.argmin(np.abs(d)))]
        x = x - np.dot(x, d) * d
        x /= np.linalg.norm(x)
        y = np.cross(d, x)
        q = p[vs] - centre[r]
        u, v = q @ x, q @ y
        A = np.stack([u, v, np.ones_like(u)], 1)
        sol, *_ = np.linalg.lstsq(A, u * u + v * v, rcond=None)
        cu, cv = sol[0] / 2, sol[1] / 2
        rad2 = sol[2] + cu * cu + cv * cv
        ext = float(np.max(np.hypot(u, v)))
        if rad2 > 0 and np.sqrt(rad2) < 1.5 * ext and np.hypot(cu, cv) < ext:
            centre[r] = centre[r] + cu * x + cv * y
            radius[r] = float(np.sqrt(rad2))
    # Chains between branch points and ends, each merged where collinear.
    roots = [r for r in range(k) if r not in parent]
    keep_edges, kept = [], set()
    for r in roots:
        stack = [(r, [r])]
        while stack:
            node, chain = stack.pop()
            kids = children.get(node, [])
            if len(kids) == 1:
                stack.append((kids[0], chain + [kids[0]]))
                continue
            if detail is not None:
                detail.setdefault("chains", []).append(list(chain))
            idx = _dp_keep(centre[chain], radius[chain], tol)
            nodes = [chain[i] for i in idx]
            kept.update(nodes)
            keep_edges += list(zip(nodes[:-1], nodes[1:]))
            for kid in kids:
                stack.append((kid, [node, kid]))
    # A ring where several tubes meet (a root flare, a fork) is fitted round
    # all of them: clamp it to 1.25 x its widest neighbour, or it draws a
    # cone over the flare.
    neighbours: dict[int, list[int]] = {}
    for a_, b_ in keep_edges:
        neighbours.setdefault(a_, []).append(b_)
        neighbours.setdefault(b_, []).append(a_)
    if detail is not None:
        detail.update(weld=weld.ravel(), ring=lookup, radius=radius.copy())
    clamped = radius.copy()
    for nd, ns in neighbours.items():
        if len(ns) > 2:
            clamped[nd] = min(radius[nd], 1.25 * max(radius[m] for m in ns))
    return centre, clamped, keep_edges, sorted(kept)


def corner_radius(radius: float, sides: int) -> float:
    """Corner radius of a regular `sides`-gon with the same mean width as a
    circle of `radius`: a convex outline's mean width is perimeter / pi, so
    the perimeters match, 2 n R sin(pi / n) = 2 pi r (x1.11 at 4 sides,
    x1.05 at 6; corners on r / cos(pi / n) would circumscribe the circle)."""
    return float(radius) * (np.pi / sides) / np.sin(np.pi / sides)


def rebuild_tubes(pos, tris, attrs: dict, sides: int, tol: float):
    """A bark island rebuilt as swept `sides`-gon tubes along its ring
    skeleton (`tube_skeleton`): the same trunk or root, fewer rings round and
    along. Frames are parallel-transported down the skeleton (no twist); UVs
    wrap a whole number of times round and run along at the source's own
    texel density; other attributes come from the nearest source vertex.
    `pos`/`attrs` are the island's own vertices (tube_bark passes them
    island-local), so the nearest vertex is never a neighbouring island's.
    Every returned vertex is referenced by a triangle.
    Returns ({name: array}, triangles)."""
    from scipy.spatial import cKDTree
    centre, radius, edges, nodes = tube_skeleton(pos, tris, tol)
    p = pos.astype(np.float64)
    uv = attrs.get("TEXCOORD_0")
    e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]]])
    dp = np.linalg.norm(p[e[:, 0]] - p[e[:, 1]], axis=1)
    density = 1.0
    if uv is not None:
        du = np.linalg.norm(uv[e[:, 0]].astype(np.float64) - uv[e[:, 1]], axis=1)
        ok = dp > 1e-6
        density = float(np.median(du[ok] / dp[ok])) if ok.any() else 1.0
    children: dict[int, list[int]] = {}
    parent: dict[int, int] = {}
    for a, b in edges:
        children.setdefault(a, []).append(b)
        parent[b] = a
    direction = {}
    for nd in nodes:
        d = np.zeros(3)
        if nd in parent:
            d += centre[nd] - centre[parent[nd]]
        for c in children.get(nd, []):
            d += centre[c] - centre[nd]
        norm = np.linalg.norm(d)
        direction[nd] = d / norm if norm > 1e-9 else np.array([0.0, 1.0, 0.0])
    ref, vcoord = {}, {}
    order = [nd for nd in nodes if nd not in parent]
    for r in order:
        d = direction[r]
        axis = np.eye(3)[int(np.argmin(np.abs(d)))]
        ref[r] = axis - np.dot(axis, d) * d
        ref[r] /= np.linalg.norm(ref[r])
        vcoord[r] = 0.0
    queue = list(order)
    while queue:
        nd = queue.pop(0)
        for c in children.get(nd, []):
            d = direction[c]
            v = ref[nd] - np.dot(ref[nd], d) * d
            ref[c] = v / max(np.linalg.norm(v), 1e-9)
            vcoord[c] = vcoord[nd] + float(np.linalg.norm(centre[c] - centre[nd])) * density
            queue.append(c)
    wraps = max(1, int(round(2 * np.pi * float(np.median(radius[nodes])) * density)))
    angles = np.linspace(0, 2 * np.pi, sides + 1)
    ring_start, out_pos, out_nrm, out_uv = {}, [], [], []
    at = 0
    for nd in nodes:
        d = direction[nd]
        x = ref[nd]
        y = np.cross(d, x)
        r = corner_radius(radius[nd], sides)
        offs = np.cos(angles)[:, None] * x + np.sin(angles)[:, None] * y
        ring_start[nd] = at
        at += sides + 1
        out_pos.append(centre[nd] + r * offs)
        out_nrm.append(offs)
        out_uv.append(np.stack([angles / (2 * np.pi) * wraps, np.full(sides + 1, vcoord[nd])], 1))
    # At a fork each child tube starts from its own ring, square to that
    # child (the shared ring, tilted to the mean of all branches, pinches
    # them).
    fork_start = {}
    for a, kids in children.items():
        if len(kids) < 2 and a in parent:
            continue
        for c in kids:
            d = centre[c] - centre[a]
            d /= max(np.linalg.norm(d), 1e-9)
            v = ref[a] - np.dot(ref[a], d) * d
            v /= max(np.linalg.norm(v), 1e-9)
            w = np.cross(d, v)
            r = corner_radius(radius[a], sides)
            offs = np.cos(angles)[:, None] * v + np.sin(angles)[:, None] * w
            fork_start[(a, c)] = at
            at += sides + 1
            out_pos.append(centre[a] + r * offs)
            out_nrm.append(offs)
            out_uv.append(np.stack([angles / (2 * np.pi) * wraps,
                                    np.full(sides + 1, vcoord[a])], 1))
    faces = []
    for a, b in edges:
        sa, sb = fork_start.get((a, b), ring_start[a]), ring_start[b]
        for j in range(sides):
            faces += [(sa + j, sb + j, sb + j + 1), (sa + j, sb + j + 1, sa + j + 1)]
    new_pos = np.concatenate(out_pos) if out_pos else np.zeros((0, 3))
    faces = np.array(faces, dtype=np.int64).reshape(-1, 3)
    # A root's own ring is superseded by its per-child start rings, and a
    # lone ring has no faces: drop every vertex no face uses.
    out_nrm = [np.concatenate(out_nrm)] if out_nrm else [np.zeros((0, 3))]
    out_uv = [np.concatenate(out_uv)] if out_uv else [np.zeros((0, 2))]
    used_v, faces = np.unique(faces.ravel(), return_inverse=True)
    faces = faces.reshape(-1, 3)
    new_pos, out_nrm, out_uv = new_pos[used_v], [out_nrm[0][used_v]], [out_uv[0][used_v]]
    # Winding: outward normals, as the source's.
    if len(faces):
        f = new_pos[faces]
        fn = np.cross(f[:, 1] - f[:, 0], f[:, 2] - f[:, 0])
        vn = np.concatenate(out_nrm)[faces[:, 0]]
        if np.sum(np.sum(fn * vn, axis=1)) < 0:
            faces = faces[:, [0, 2, 1]]
    _, nearest = cKDTree(p).query(new_pos) if len(new_pos) else (None, np.zeros(0, int))
    out = {}
    for name, data in attrs.items():
        if name == "POSITION":
            out[name] = new_pos.astype(np.float32)
        elif name == "NORMAL":
            out[name] = np.concatenate(out_nrm).astype(np.float32)
        elif name == "TEXCOORD_0":
            out[name] = np.concatenate(out_uv).astype(data.dtype)
        else:
            out[name] = data[nearest]
    return out, faces


def _surface_samples(pos: np.ndarray, tris: np.ndarray, per_tri: int = 6) -> np.ndarray:
    """Deterministic points on a triangle surface (fixed barycentric set)."""
    bary = np.array([[1 / 3, 1 / 3, 1 / 3], [.6, .2, .2], [.2, .6, .2], [.2, .2, .6],
                     [.5, .5, 0], [0, .5, .5], [.5, 0, .5]])[:per_tri + 1]
    f = pos.astype(np.float64)[tris]
    return np.einsum("bk,tkj->tbj", bary, f).reshape(-1, 3)


def tube_fits(pos, tris, new_pos, new_tris, tol: float, fit: float = 2.5) -> bool:
    """The rebuilt island stands where the source did: every sample of each
    surface lies within `fit x (tol + median source edge)` of the
    other's samples, at the 98th percentile both ways (`fit`, the
    setting `barkFit`, scales the limit). A cone over a root
    flare fails one way, a fork broken off fails the other."""
    from scipy.spatial import cKDTree
    if len(new_tris) == 0:
        return False
    a = _surface_samples(pos, tris)
    b = _surface_samples(new_pos, new_tris)
    edge = float(np.median(np.linalg.norm(pos[tris[:, 0]].astype(np.float64)
                                          - pos[tris[:, 1]], axis=1)))
    limit = fit * (tol + edge)
    return (np.percentile(cKDTree(b).query(a)[0], 98) <= limit
            and np.percentile(cKDTree(a).query(b)[0], 98) <= limit)


#: A bark island with fewer triangles than this keeps its source geometry
#: (a root stub or twig: rebuilding it saves nothing).
TUBE_MIN_TRIS = 60


#: Runs mode (`barkTube: 2`, round 13c): a straight run is rebuilt only
#: inside a collar of RUN_COLLAR rings and COLLAR_RADII radii from each
#: end; shorter chains stay source.
RUN_COLLAR = 2
COLLAR_RADII = 3.0


def _smooth_attrs(p: np.ndarray, attrs: dict, new_pos: np.ndarray, k: int = 6) -> dict:
    """Attributes other than POSITION/TEXCOORD_0 for new vertices, blended
    from the k nearest source vertices (inverse distance): the rebuilt
    tube's normals and vertex colours (Skyrim's baked AO) continue the
    source's across the join instead of copying one dark vertex."""
    from scipy.spatial import cKDTree
    kk = min(k, len(p))
    d, idx = cKDTree(p).query(new_pos, k=kk)
    d, idx = d.reshape(len(new_pos), kk), idx.reshape(len(new_pos), kk)
    w = 1.0 / np.maximum(d, 1e-4)
    w /= w.sum(1, keepdims=True)
    out = {}
    for name, data in attrs.items():
        if name in ("POSITION", "TEXCOORD_0"):
            continue
        blend = np.einsum("nk,nkc->nc", w, data[idx].astype(np.float64))
        if name == "NORMAL":
            blend /= np.maximum(np.linalg.norm(blend, axis=1, keepdims=True), 1e-9)
        if np.issubdtype(data.dtype, np.integer):
            blend = np.rint(blend)
        out[name] = blend.astype(data.dtype)
    return out


def tube_runs(pos, tris, attrs: dict, sides: int, tol: float, fit: float = 2.5):
    """One welded bark island with only its STRAIGHT RING RUNS rebuilt
    (round 13c): every skeleton chain between branch points of at least
    2 x RUN_COLLAR + 2 rings has its inner rings' triangles replaced by a
    swept `sides`-gon from ring RUN_COLLAR - 1 to ring -RUN_COLLAR (merged
    within `tol`), which starts and ends inside the kept source collar, so
    the join overlaps instead of opening a crack. Flares, forks, junctions
    and the root-trunk collar stay source geometry. A run whose rebuild
    fails `tube_fits` against the triangles it replaces keeps its source.
    Normals and vertex colours are blended from the source (`_smooth_attrs`)."""
    detail: dict = {}
    centre, _, _, _ = tube_skeleton(pos, tris, tol, detail)
    radius = detail["radius"]
    ring_of_vertex = detail["ring"][detail["weld"]]          # source vertex -> ring
    tri_ring = ring_of_vertex[tris]
    p = pos.astype(np.float64)
    uv = attrs.get("TEXCOORD_0")
    e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]]])
    dp = np.linalg.norm(p[e[:, 0]] - p[e[:, 1]], axis=1)
    density = 1.0
    if uv is not None:
        du = np.linalg.norm(uv[e[:, 0]].astype(np.float64) - uv[e[:, 1]], axis=1)
        ok = dp > 1e-6
        density = float(np.median(du[ok] / dp[ok])) if ok.any() else 1.0
    drop = np.zeros(len(tris), bool)
    pieces = []
    angles = np.linspace(0, 2 * np.pi, sides + 1)
    for chain in detail.get("chains", []):
        # collar: at least RUN_COLLAR rings and COLLAR_RADII x the run's
        # radius along it from each end (a band front cut slantwise across
        # the tube reaches that far up the far side)
        along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(centre[chain], axis=0), axis=1))])
        reach = COLLAR_RADII * float(np.median(radius[chain]))
        lo = max(RUN_COLLAR, int(np.searchsorted(along, reach)))
        hi = min(len(chain) - RUN_COLLAR, int(np.searchsorted(along, along[-1] - reach, "right")))
        if hi - lo < 2:
            continue
        inner = np.array(chain[lo:hi])
        replaced = np.all(np.isin(tri_ring, inner), axis=1) & ~drop
        if not replaced.any():
            continue
        span = chain[lo - 1:hi + 1]
        idx = _dp_keep(centre[span], radius[span], tol)
        nodes = [span[i] for i in idx]
        c = centre[nodes]
        d = np.gradient(c, axis=0) if len(c) > 1 else np.array([[0, 1.0, 0]])
        d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
        axis = np.eye(3)[int(np.argmin(np.abs(d[0])))]
        x = axis - np.dot(axis, d[0]) * d[0]
        x /= np.linalg.norm(x)
        # v continues the source's v at the run's first ring
        first = np.isin(ring_of_vertex, [nodes[0]])
        v0 = float(np.mean(uv[first, 1])) if uv is not None and first.any() else 0.0
        vv = v0 + np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))]) * density
        wraps = max(1, int(round(2 * np.pi * float(np.median(radius[nodes])) * density)))
        ring_pos, ring_nrm, ring_uv = [], [], []
        for i in range(len(nodes)):
            x = x - np.dot(x, d[i]) * d[i]
            x /= max(np.linalg.norm(x), 1e-9)
            y = np.cross(d[i], x)
            offs = np.cos(angles)[:, None] * x + np.sin(angles)[:, None] * y
            r = corner_radius(radius[nodes[i]], sides)
            ring_pos.append(c[i] + r * offs)
            ring_nrm.append(offs)
            ring_uv.append(np.stack([angles / (2 * np.pi) * wraps, np.full(sides + 1, vv[i])], 1))
        new_pos = np.concatenate(ring_pos)
        faces = []
        for i in range(len(nodes) - 1):
            a, b = i * (sides + 1), (i + 1) * (sides + 1)
            for j in range(sides):
                faces += [(a + j, b + j, b + j + 1), (a + j, b + j + 1, a + j + 1)]
        faces = np.array(faces, np.int64).reshape(-1, 3)
        if len(faces) == 0 or len(faces) >= int(replaced.sum()):
            continue
        f = new_pos[faces]
        fn = np.cross(f[:, 1] - f[:, 0], f[:, 2] - f[:, 0])
        if np.sum(fn * np.concatenate(ring_nrm)[faces[:, 0]]) < 0:
            faces = faces[:, [0, 2, 1]]
        if not tube_fits(pos, tris[replaced], new_pos, faces, tol, fit):
            continue
        built = _smooth_attrs(p, attrs, new_pos)
        built["POSITION"] = new_pos.astype(np.float32)
        if uv is not None:
            built["TEXCOORD_0"] = np.concatenate(ring_uv).astype(uv.dtype)
        pieces.append(({k: built[k] for k in attrs}, faces))
        drop |= replaced
    keep = tris[~drop]
    verts, remap = np.unique(keep.ravel(), return_inverse=True)
    pieces.insert(0, ({k: v[verts] for k, v in attrs.items()}, remap.reshape(-1, 3)))
    out_attrs = {k: [] for k in attrs}
    out_tris, base = [], 0
    for a, t in pieces:
        for k in attrs:
            out_attrs[k].append(a[k])
        out_tris.append(t + base)
        base += len(a["POSITION"])
    return {k: np.concatenate(v) for k, v in out_attrs.items()}, np.concatenate(out_tris)


def tube_bark(pos, tris, attrs: dict, sides: int, tol: float, keep: float, fit: float = 2.5,
              runs: bool = False):
    """One bark part as tubes: islands of TUBE_MIN_TRIS or more are rebuilt
    (`rebuild_tubes`); the small ones are kept whole, largest first, up to
    `keep` of their triangles. Returns ({name: array}, triangles)."""
    island = welded_islands(pos, tris)
    counts = np.bincount(island)
    big = np.nonzero(counts >= TUBE_MIN_TRIS)[0]
    small_mask = ~np.isin(island, big)
    pieces = []
    if small_mask.any():
        sub = np.nonzero(small_mask)[0]
        kept_local = thin_bark(pos, tris[sub], keep) if keep < 1 else np.arange(len(sub))
        chosen = tris[sub[kept_local]]
        if len(chosen):
            verts, remap = np.unique(chosen.ravel(), return_inverse=True)
            pieces.append(({k: v[verts] for k, v in attrs.items()}, remap.reshape(-1, 3)))
    for isl in big:
        sel = tris[island == isl]
        verts, remap = np.unique(sel.ravel(), return_inverse=True)
        local = {k: v[verts] for k, v in attrs.items()}
        local_tris = remap.reshape(-1, 3)
        if runs:
            pieces.append(tube_runs(local["POSITION"], local_tris, local, sides, tol, fit))
            continue
        built, built_tris = rebuild_tubes(local["POSITION"], local_tris, local, sides, tol)
        if tube_fits(local["POSITION"], local_tris, built["POSITION"], built_tris, tol, fit):
            pieces.append((built, built_tris))
        else:                     # a flare or fork the skeleton misreads: keep the source
            pieces.append((local, local_tris))
    out_attrs = {k: [] for k in attrs}
    out_tris, base = [], 0
    for a, t in pieces:
        for k in attrs:
            out_attrs[k].append(a[k])
        out_tris.append(t + base)
        base += len(a["POSITION"])
    if not out_tris:
        return {k: v[:0] for k, v in attrs.items()}, np.zeros((0, 3), np.int64)
    return {k: np.concatenate(v) for k, v in out_attrs.items()}, np.concatenate(out_tris)


# --- the kit pass -------------------------------------------------------------

def image_alpha_share(gltf: dict, blob: bytes, material_index: int, cache: dict) -> float:
    """Share of the material's base-colour texels under the alpha cutoff."""
    if material_index in cache:
        return cache[material_index]
    from PIL import Image
    mat = gltf["materials"][material_index]
    tex = ((mat.get("pbrMetallicRoughness") or {}).get("baseColorTexture") or {}).get("index")
    share = 0.0
    if tex is not None:
        image = gltf["images"][gltf["textures"][tex]["source"]]
        view = gltf["bufferViews"][image["bufferView"]]
        raw = blob[view.get("byteOffset", 0):view.get("byteOffset", 0) + view["byteLength"]]
        im = Image.open(io.BytesIO(raw))
        if im.mode in ("RGBA", "LA"):
            alpha = np.asarray(im.getchannel("A"), dtype=np.float32) / 255.0
            share = float(np.mean(alpha < mat.get("alphaCutoff", 0.5)))
    cache[material_index] = share
    return share


def asset_roots(gltf: dict) -> dict[str, int]:
    scene = gltf["scenes"][gltf.get("scene", 0)]
    return {(gltf["nodes"][r].get("extras") or {}).get("assetId"): r
            for r in scene["nodes"] if (gltf["nodes"][r].get("extras") or {}).get("assetId")
            and "mesh" not in gltf["nodes"][r]}


def base_primitives(gltf: dict, root: int):
    """(node index, primitive) for every level-0, non-card mesh under `root`."""
    out = []
    for child in gltf["nodes"][root].get("children", []):
        node = gltf["nodes"][child]
        extras = node.get("extras") or {}
        if "mesh" not in node or extras.get("lod") or extras.get("billboard"):
            continue
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            out.append((child, prim))
    return out


def tier_settings(kit: dict, asset_id: str | None = None) -> dict:
    """Tier settings: defaults, then the kit's `treeTiers.<tier>`, then the
    asset's calibrated row `treeTiers.perAsset.<id>.<tier>`. A tier whose
    per-asset row is null is not built for that asset (it failed the bar at
    every setting `tree_tiers_check --calibrate` tried)."""
    cfg = kit.get("treeTiers") or {}
    row = (cfg.get("perAsset") or {}).get(asset_id or "", {})
    out = {}
    for t in DEFAULT_TIERS:
        if t in row and row[t] is None:
            out[t] = None
            continue
        out[t] = {**DEFAULT_TIERS[t], **(cfg.get(t) or {}), **(row.get(t) or {})}
    return out


def build_tiers(gltf: dict, blob: bytes, asset_ids: list[str], settings,
                writer: BlobWriter | None) -> dict:
    """Compute (and when `writer` is given, append) both tiers per asset.
    Returns {assetId: {"source": n, "mid": n, "far": n, "parts": [...]}}."""
    roots = asset_roots(gltf)
    alpha_cache: dict = {}
    report = {}
    for asset_id in asset_ids:
        if asset_id not in roots:
            raise KeyError(f"tree_tiers: {asset_id} is not in the GLB")
        root = roots[asset_id]
        chosen = settings(asset_id) if callable(settings) else settings
        seed = int(hashlib.sha1(asset_id.encode()).hexdigest()[:8], 16)
        prims = base_primitives(gltf, root)
        row = {"source": 0, "mid": 0, "far": 0, "parts": []}
        tier_nodes = {"mid": [], "far": []}
        for part_i, (node_i, prim) in enumerate(prims):
            pos = accessor(gltf, blob, prim["attributes"]["POSITION"])
            idx = accessor(gltf, blob, prim["indices"]).astype(np.int64)
            tris = idx.reshape(-1, 3)
            leaf = image_alpha_share(gltf, blob, prim["material"], alpha_cache) > LEAF_ALPHA_SHARE
            row["source"] += len(tris)
            part = {"material": gltf["materials"][prim["material"]].get("name"),
                    "kind": "leaf" if leaf else "bark", "source": len(tris)}
            for tier in ("mid", "far"):
                s = chosen[tier]
                if s is None:
                    part[tier] = 0
                    continue
                kept = None
                if leaf:
                    kept, new_pos = thin_leaves(pos, tris, s["leafKeep"], s["gain"],
                                                s["maxScale"], seed + part_i,
                                                s["lengthShare"], s["outer"])
                elif s.get("barkTube"):
                    source = {name: accessor(gltf, blob, acc_i)
                              for name, acc_i in prim["attributes"].items()}
                    built, built_tris = tube_bark(pos, tris, source, int(s["barkSides"]),
                                                  s["barkTol"], s["barkKeep"],
                                                  s.get("barkFit", 2.5),
                                                  runs=int(s["barkTube"]) == 2)
                    part[tier] = int(len(built_tris))
                    row[tier] += int(len(built_tris))
                    if writer is None or len(built_tris) == 0:
                        continue
                    kept, new_pos = None, None
                else:
                    kept, new_pos = thin_bark(pos, tris, s["barkKeep"]), pos.astype(np.float64)
                if kept is not None:
                    part[tier] = int(len(kept))
                    row[tier] += int(len(kept))
                    if writer is None or len(kept) == 0:
                        continue
                    verts, remap = np.unique(tris[kept].ravel(), return_inverse=True)
                    built = {name: (new_pos[verts].astype(np.float32) if name == "POSITION"
                                    else accessor(gltf, blob, acc_i)[verts])
                             for name, acc_i in prim["attributes"].items()}
                    built_tris = remap.reshape(-1, 3)
                attributes = {}
                for name, acc_i in prim["attributes"].items():
                    like = gltf["accessors"][acc_i]
                    attributes[name] = writer.add(np.ascontiguousarray(built[name]), like, 34962,
                                                  name == "POSITION")
                n_verts = len(built["POSITION"])
                index_dtype = np.uint16 if n_verts < 65536 else np.uint32
                indices = writer.add(built_tris.ravel().astype(index_dtype), None, 34963)
                material = copy.deepcopy(gltf["materials"][prim["material"]])
                # Same name as the source material (kit_lod_audit matches parts
                # by material name); `esTier` makes it a distinct material.
                material.setdefault("extras", {})["esTier"] = tier
                gltf["materials"].append(material)
                new_prim = {"attributes": attributes, "indices": indices,
                            "material": len(gltf["materials"]) - 1}
                if "mode" in prim:
                    new_prim["mode"] = prim["mode"]
                gltf["meshes"].append({"name": f"es|tier_{tier}_{part_i}",
                                       "primitives": [new_prim]})
                source_name = gltf["nodes"][node_i].get("name", "part")
                gltf["nodes"].append({
                    "name": f"{source_name}|{tier}"[:120],
                    "mesh": len(gltf["meshes"]) - 1,
                    "extras": {"lod": MID_LEVEL if tier == "mid" else FAR_LEVEL,
                               "assetId": asset_id, "esTier": tier,
                               "tierMethod": TIER_METHOD},
                })
                tier_nodes[tier].append(len(gltf["nodes"]) - 1)
            row["parts"].append(part)
        if writer is not None:
            gltf["nodes"][root].setdefault("children", []).extend(
                tier_nodes["mid"] + tier_nodes["far"])
        report[asset_id] = row
    return report


def manifest_rows(report: dict, settings_for) -> dict:
    rows = {}
    for asset_id, row in report.items():
        chosen = settings_for(asset_id)
        out = {"method": TIER_METHOD}
        for tier, level in (("mid", MID_LEVEL), ("far", FAR_LEVEL)):
            if chosen[tier] is None:
                continue
            out[tier] = {"level": level, "triangles": row[tier],
                         "share": round(row[tier] / row["source"], 3),
                         "settings": chosen[tier]}
        rows[asset_id] = out
    return rows


def apply(glb: Path, manifest: dict, kit: dict) -> dict:
    """The build post-pass: write the tiers into `glb`, `lodTiers` into the
    manifest rows. Returns the report ({} when the kit lists no trees)."""
    ids = list((kit.get("treeTiers") or {}).get("assets") or [])
    if not ids:
        return {}
    gltf, blob = load_glb(glb)
    if any((n.get("extras") or {}).get("esTier") for n in gltf["nodes"]):
        raise RuntimeError(f"{glb.name} already carries tree tiers; rebuild the kit first")
    settings_for = lambda asset_id: tier_settings(kit, asset_id)  # noqa: E731
    writer = BlobWriter(gltf, blob)
    report = build_tiers(gltf, blob, ids, settings_for, writer)
    save_glb(glb, gltf, writer.blob())
    rows = manifest_rows(report, settings_for)
    for asset in manifest.get("assets", []):
        if asset.get("id") in rows:
            asset["lodTiers"] = rows[asset["id"]]
        else:
            asset.pop("lodTiers", None)
    return report


def preview(glb: Path, asset_ids: list[str], out_dir: Path, kit: dict,
            overrides: dict | None = None, variants: dict | None = None) -> dict:
    """One small GLB per asset holding its source and tier levels side by side
    in the scene (one root per label: `source`, `mid`, `far`, or each
    `variants` label), for the headless check renders. The kit GLB is not
    touched. `variants`: {label: (tier, settings)} replaces mid/far.
    Returns {assetId: {label: triangles, "source": n}}."""
    gltf0, blob0 = load_glb(glb)
    out_dir.mkdir(parents=True, exist_ok=True)
    reports = {}
    for asset_id in asset_ids:
        base = tier_settings(kit, asset_id)
        for tier, values in (overrides or {}).items():
            base[tier] = {**(base[tier] or DEFAULT_TIERS[tier]), **values}
        runs = variants or {t: (t, base[t]) for t in ("mid", "far") if base[t] is not None}
        gltf = copy.deepcopy(gltf0)
        writer = BlobWriter(gltf, blob0)
        root = asset_roots(gltf)[asset_id]
        levels = {"source": [c for c in gltf["nodes"][root]["children"]
                             if not (gltf["nodes"][c].get("extras") or {}).get("lod")
                             and not (gltf["nodes"][c].get("extras") or {}).get("billboard")]}
        counts = {}
        for label, (tier, settings) in runs.items():
            other = "far" if tier == "mid" else "mid"
            before = len(gltf["nodes"])
            row = build_tiers(gltf, blob0, [asset_id], {tier: settings, other: None},
                              writer)[asset_id]
            counts["source"], counts[label] = row["source"], row[tier]
            levels[label] = list(range(before, len(gltf["nodes"])))
            gltf["nodes"][root]["children"] = [c for c in gltf["nodes"][root]["children"]
                                               if c < before or c not in levels[label]]
        new_roots = []
        for label, children in levels.items():
            gltf["nodes"].append({"name": label, "children": children})
            new_roots.append(len(gltf["nodes"]) - 1)
        gltf["scenes"] = [{"nodes": new_roots}]
        gltf["scene"] = 0
        sub, sub_blob = compact(gltf, writer.blob())
        safe = asset_id.replace(":", "__").replace("/", "_")
        save_glb(out_dir / f"{safe}.glb", sub, sub_blob)
        reports[asset_id] = counts
    return reports


def compact(gltf: dict, blob: bytes) -> tuple[dict, bytes]:
    """A copy of `gltf` holding only what the scene reaches."""
    out = {"asset": gltf["asset"], "scene": 0, "nodes": [], "meshes": [], "materials": [],
           "textures": [], "images": [], "samplers": gltf.get("samplers", []),
           "accessors": [], "bufferViews": [], "buffers": []}
    parts, length = [], 0
    maps = {k: {} for k in ("nodes", "meshes", "materials", "textures", "images",
                            "accessors", "bufferViews")}

    def view(i):
        nonlocal length
        if i in maps["bufferViews"]:
            return maps["bufferViews"][i]
        v = dict(gltf["bufferViews"][i])
        data = blob[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
        pad = -length % 4
        parts.append(b"\0" * pad)
        length += pad
        v["byteOffset"] = length
        parts.append(data)
        length += len(data)
        out["bufferViews"].append(v)
        maps["bufferViews"][i] = len(out["bufferViews"]) - 1
        return maps["bufferViews"][i]

    def acc(i):
        if i not in maps["accessors"]:
            a = dict(gltf["accessors"][i])
            a["bufferView"] = view(a["bufferView"])
            out["accessors"].append(a)
            maps["accessors"][i] = len(out["accessors"]) - 1
        return maps["accessors"][i]

    def image(i):
        if i not in maps["images"]:
            im = dict(gltf["images"][i])
            im["bufferView"] = view(im["bufferView"])
            out["images"].append(im)
            maps["images"][i] = len(out["images"]) - 1
        return maps["images"][i]

    def texture(i):
        if i not in maps["textures"]:
            t = dict(gltf["textures"][i])
            t["source"] = image(t["source"])
            out["textures"].append(t)
            maps["textures"][i] = len(out["textures"]) - 1
        return maps["textures"][i]

    def material(i):
        if i not in maps["materials"]:
            m = copy.deepcopy(gltf["materials"][i])
            for holder, key in ((m.get("pbrMetallicRoughness") or {}, "baseColorTexture"),
                                (m, "normalTexture"), (m, "emissiveTexture"),
                                (m, "occlusionTexture")):
                if key in holder:
                    holder[key]["index"] = texture(holder[key]["index"])
            out["materials"].append(m)
            maps["materials"][i] = len(out["materials"]) - 1
        return maps["materials"][i]

    def mesh(i):
        if i not in maps["meshes"]:
            m = copy.deepcopy(gltf["meshes"][i])
            for p in m["primitives"]:
                p["attributes"] = {k: acc(v) for k, v in p["attributes"].items()}
                if "indices" in p:
                    p["indices"] = acc(p["indices"])
                if "material" in p:
                    p["material"] = material(p["material"])
            out["meshes"].append(m)
            maps["meshes"][i] = len(out["meshes"]) - 1
        return maps["meshes"][i]

    def node(i):
        n = copy.deepcopy(gltf["nodes"][i])
        if "mesh" in n:
            n["mesh"] = mesh(n["mesh"])
        n["children"] = [node(c) for c in n.get("children", [])]
        if not n["children"]:
            n.pop("children")
        out["nodes"].append(n)
        return len(out["nodes"]) - 1

    out["scenes"] = [{"nodes": [node(r) for r in gltf["scenes"][gltf.get("scene", 0)]["nodes"]]}]
    return out, b"".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--kit", required=True)
    parser.add_argument("--assets", help="comma list (default: the config's treeTiers.assets)")
    parser.add_argument("--dry", action="store_true", help="triangle counts only")
    parser.add_argument("--set", action="append", default=[],
                        help="override, e.g. far.leafKeep=0.08 (--dry only)")
    args = parser.parse_args()
    kit = json.loads((CONFIG / f"{args.kit}.json").read_text())
    glb = (REPO_ROOT / kit["output"]).resolve()
    ids = args.assets.split(",") if args.assets else list((kit.get("treeTiers") or {}).get("assets") or [])
    overrides: dict = {}
    for item in args.set:
        key, value = item.split("=")
        tier, field = key.split(".")
        overrides.setdefault(tier, {})[field] = float(value)
    if args.dry:
        gltf, blob = load_glb(glb)

        def settings_for(asset_id):
            chosen = tier_settings(kit, asset_id)
            for tier, values in overrides.items():
                chosen[tier] = {**(chosen[tier] or DEFAULT_TIERS[tier]), **values}
            return chosen
        report = build_tiers(gltf, blob, ids, settings_for, None)
        for asset_id, row in report.items():
            print(f"{asset_id}: source {row['source']}  mid {row['mid']} "
                  f"({row['mid'] / row['source']:.0%})  far {row['far']} "
                  f"({row['far'] / row['source']:.0%})  "
                  + "  ".join(f"{p['kind']}:{p['source']}->{p['mid']}/{p['far']}"
                              for p in row["parts"]))
        return
    manifest_path = glb.with_suffix(".kit.json")
    manifest = json.loads(manifest_path.read_text())
    report = apply(glb, manifest, kit)
    from .build_kit import apply_lod_levels
    apply_lod_levels(glb, manifest)
    manifest_path.write_text(json.dumps(manifest, indent=1) + "\n")
    for asset_id, row in report.items():
        print(f"[kit] tree tiers {asset_id}: {row['source']} -> mid {row['mid']}, far {row['far']}")


if __name__ == "__main__":
    main()
