"""walkRule inside a tier A interior bundle (owner ruling B, interiors round 2).

A cell can have several storeys, so the grid is LAYERED: every 0.5 m column
(the workbench's `CELL_M`) holds every upward surface a vertical ray finds
over the cell's placed pieces (floors, stairs and ramps as walkable decks,
table tops), and a surface is a node when the character fits over it (no
geometry within the capsule's height above). Neighbouring nodes join when
the height change is within the character's step (``CHARACTER_FLOAT_HEIGHT``,
the workbench's rule for a change of surface) or, on one piece, within the
slope limit (``SLOPE_MAX_DEG``: a ramp or a stair's run); and when no wall
stands between them (horizontal rays at knee and chest height). The
character numbers are read from ``characterPhysics.ts`` through the
workbench's own reader, never copied.

From every arrival marker, every ``idle`` and ``container`` socket must be
reached (planner ruling 5, interiors round 3): a socket on host furniture
(an idle socket's bench or bed, a container) when a reached node lies within
``HOSTED_IDLE_REACH_M`` in plan (it is used from the floor beside it), every
other socket when a reached node stands in its own walk cell; both within ``SOCKET_RISE_M`` in
height. An unreached socket is a
failure, with the nearest reached node's distance.

Geometry comes from the RAW kit build (``tooling/asset-pipeline/output/kits``:
the published GLBs are meshopt-compressed and trimesh cannot read them), each
asset placed by the bundle's transform (game frame; ``Euler(pitch, -yaw,
roll, 'YXZ')``).
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[3]
RAW_KITS = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
#: A socket on host furniture (a bench, a bed, a chair; a chest, whose own
#: cell is its lid) is reached when a reached walk cell lies within this of it
#: in plan; every other socket (a bare idle marker) needs a reached node in its
#: own walk cell (planner ruling 5, interiors round 3). "Of it" is the host
#: piece's own plan box (planner ruling 6, interiors round 4): measured from
#: the socket's pivot, a table with its bench (half-width 1.55 m) or a double
#: bed could never be reached from the floor beside it, since the piece
#: itself covers every walk cell within 1.0 m of its centre.
HOSTED_IDLE_REACH_M = 1.0
SOCKET_RISE_M = 1.2
KNEE_M, CHEST_M = 0.5, 1.2
START_REACH_M = 1.5


def _workbench_rules():
    wb = REPO_ROOT / "tooling" / "placement-workbench"
    if str(wb) not in sys.path:
        sys.path.insert(0, str(wb))
    from workbench import rules
    return rules


def character() -> dict:
    """{capsuleRadiusM, stepM, heightM, cellM, slopeMaxDeg}: the workbench's
    walkRule numbers; the capsule's full height is read from the same file."""
    rules = _workbench_rules()
    ch = rules.character()
    text = rules.PHYSICS_TS.read_text()
    import re
    half = float(re.search(r"CHARACTER_CAPSULE_HALF_HEIGHT = ([0-9.]+);", text).group(1))
    return {"capsuleRadiusM": ch["capsuleRadiusM"], "stepM": ch["stepM"],
            "heightM": 2 * (half + ch["capsuleRadiusM"]) + ch["stepM"],
            "cellM": rules.CELL_M, "slopeMaxDeg": rules.SLOPE_MAX_DEG}


def euler_matrix(rotation_deg) -> np.ndarray:
    """``Euler(pitch, -yaw, roll, 'YXZ')`` (three.js, right-handed)."""
    p, y, r = (math.radians(float(v)) for v in rotation_deg)
    y = -y
    cx, sx, cy, sy, cz, sz = math.cos(p), math.sin(p), math.cos(y), math.sin(y), math.cos(r), math.sin(r)
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return ry @ rx @ rz


def bundle_mesh(bundle: dict, kits_dir: Path = RAW_KITS):
    """(trimesh of every placement in the game frame, per-face placement
    index, [asset ids with no geometry])."""
    import json

    import trimesh
    sys.path.insert(0, str(REPO_ROOT / "tooling" / "asset-pipeline"))
    from pipeline.interiors_index import _resolve_node, asset_triangles, glb_asset_id_nodes
    tris_by_asset: dict[str, np.ndarray | None] = {}
    for kit in sorted({p["kit"] for p in bundle["placements"]}):
        manifest = json.loads((kits_dir / f"{kit}.kit.json").read_text())
        scene = trimesh.load(kits_dir / f"{kit}.glb", process=False)
        names = set(scene.graph.nodes)
        by_id = glb_asset_id_nodes(kits_dir / f"{kit}.glb")
        wanted = {p["assetId"] for p in bundle["placements"] if p["kit"] == kit}
        for asset in manifest["assets"]:
            if asset["id"] in wanted:
                node = _resolve_node(asset, names, by_id)
                tris_by_asset[asset["id"]] = asset_triangles(scene, node) if node else None
    chunks, owner, missing = [], [], []
    for i, p in enumerate(bundle["placements"]):
        tris = tris_by_asset.get(p["assetId"])
        if tris is None or not len(tris):
            missing.append(p["assetId"])
            continue
        m = euler_matrix(p["rotationDeg"]) * float(p.get("scale", 1.0))
        world = tris.reshape(-1, 3) @ m.T + np.asarray(p["positionM"], dtype=float)
        chunks.append(world.reshape(-1, 3, 3))
        owner.append(np.full(len(tris), i))
    tris = np.vstack(chunks)
    mesh = trimesh.Trimesh(vertices=tris.reshape(-1, 3), faces=np.arange(len(tris) * 3).reshape(-1, 3),
                           process=False)
    return mesh, np.concatenate(owner), sorted(set(missing))


RAY_CHUNK = 512  # rays per trimesh call: its pure-numpy caster tests every ray
# against every triangle its (unbounded) ray box meets, so one call over a
# cell's ~10k join rays held 21 GiB (KeebaHouseElder --reached, 2026-09-30)


def cast_rays(mesh, origins, dirs, multiple_hits: bool):
    """`mesh.ray.intersects_location` in chunks of RAY_CHUNK rays (same
    returns, ray indices into the full input)."""
    origins, dirs = np.asarray(origins, float), np.asarray(dirs, float)
    locs, rays, tris = [np.zeros((0, 3))], [np.zeros(0, int)], [np.zeros(0, int)]
    for k in range(0, len(origins), RAY_CHUNK):
        lo_, r_, t_ = mesh.ray.intersects_location(origins[k:k + RAY_CHUNK], dirs[k:k + RAY_CHUNK],
                                                   multiple_hits=multiple_hits)
        locs.append(np.asarray(lo_).reshape(-1, 3)); rays.append(np.asarray(r_, int) + k)
        tris.append(np.asarray(t_, int))
    return np.vstack(locs), np.concatenate(rays), np.concatenate(tris)


def walk_mesh(mesh, face_owner, starts: list, targets: list[dict], ch: dict | None = None,
              want_reached: bool = False, nodes_only: bool = False) -> dict:
    """The layered walk (see the module docstring). `starts` are
    ``[x, y, z]`` points; `targets` are ``{id, positionM}``. `want_reached`
    adds ``reachedPositions`` (every node reached from a start); `nodes_only`
    returns every roofed standable node as ``positions`` and skips the joins (the
    cheap floor sample of ``interior_light``)."""
    from scipy.sparse import csr_matrix
    from scipy.sparse.csgraph import connected_components
    ch = ch or character()
    cell = ch["cellM"]
    lo, hi = mesh.bounds
    xs = np.arange(lo[0] + cell / 2, hi[0], cell)
    zs = np.arange(lo[2] + cell / 2, hi[2], cell)
    gx, gz = np.meshgrid(xs, zs)
    origins = np.column_stack([gx.ravel(), np.full(gx.size, hi[1] + 1.0), gz.ravel()])
    dirs = np.tile([0.0, -1.0, 0.0], (len(origins), 1))
    locs, ray_idx, tri_idx = cast_rays(mesh, origins, dirs, multiple_hits=True)
    normals = mesh.face_normals[tri_idx]
    per_ray: dict[int, list] = {}
    for loc, r, t, n in zip(locs, ray_idx, tri_idx, normals):
        per_ray.setdefault(int(r), []).append((float(loc[1]), int(t), float(n[1])))
    nodes = []          # (iz, ix, y, piece)
    for r, hits in per_ray.items():
        hits.sort()
        ys = [h[0] for h in hits]
        for k, (y, t, ny) in enumerate(hits):
            if ny < math.cos(math.radians(ch["slopeMaxDeg"] + 15.0)):
                continue  # not a floor-like face (walls, undersides)
            above = [yy for yy in ys[k + 1:] if yy > y + 0.05]
            if above and above[0] < y + ch["heightM"]:
                continue
            if nodes_only and not above:
                continue  # open to the sky: a roof top, never a room floor
            iz, ix = divmod(r, len(xs))
            nodes.append((iz, ix, y, int(face_owner[t])))
    if not nodes:
        return {"nodes": 0, "failures": ["no walkable surface in the cell"], "targets": []}
    if nodes_only:
        return {"nodes": len(nodes), "positions": [[float(xs[ix]), y, float(zs[iz])]
                                                   for iz, ix, y, _p in nodes]}
    by_col: dict[tuple[int, int], list[int]] = {}
    for i, (iz, ix, _y, _p) in enumerate(nodes):
        by_col.setdefault((iz, ix), []).append(i)
    pairs = []
    for i, (iz, ix, y, piece) in enumerate(nodes):
        for dz, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
            for j in by_col.get((iz + dz, ix + dx), ()):
                yj, pj = nodes[j][2], nodes[j][3]
                run = cell * math.hypot(dx, dz)
                dh = abs(yj - y)
                if dh > ch["stepM"] and not (pj == piece and math.degrees(math.atan2(dh, run))
                                            <= ch["slopeMaxDeg"]):
                    continue
                pairs.append((i, j))
    # walls between the two nodes: horizontal rays at knee and chest height
    ok = []
    if pairs:
        a = np.array([[xs[nodes[i][1]], nodes[i][2], zs[nodes[i][0]]] for i, _ in pairs])
        b = np.array([[xs[nodes[j][1]], nodes[j][2], zs[nodes[j][0]]] for _, j in pairs])
        blocked = np.zeros(len(pairs), bool)
        for h in (KNEE_M, CHEST_M):
            o = a + [0.0, h, 0.0]
            d = (b + [0.0, h, 0.0]) - o
            length = np.linalg.norm(d, axis=1)
            d = d / length[:, None]
            hit_locs, hit_rays, _ = cast_rays(mesh, o, d, multiple_hits=False)
            for loc, r in zip(hit_locs, hit_rays):
                if np.linalg.norm(loc - o[r]) <= length[r] + ch["capsuleRadiusM"]:
                    blocked[r] = True
        ok = [pr for pr, bl in zip(pairs, blocked) if not bl]
    n = len(nodes)
    rows = [i for i, _ in ok] + [j for _, j in ok]
    cols = [j for _, j in ok] + [i for i, _ in ok]
    graph = csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n))
    _count, label = connected_components(graph, directed=False)
    pos = np.array([[xs[ix], y, zs[iz]] for iz, ix, y, _p in nodes])

    def nearest(pt, reach_xz, rise):
        d = np.hypot(pos[:, 0] - pt[0], pos[:, 2] - pt[2])
        ok_ = (d <= reach_xz) & (np.abs(pos[:, 1] - pt[1]) <= rise)
        return None if not ok_.any() else int(np.argmin(np.where(ok_, d, np.inf)))

    out = {"nodes": n, "edges": len(ok), "grid": [len(xs), len(zs)], "character": ch,
           "starts": [], "targets": [], "failures": []}
    reach_labels = set()
    for s in starts:
        k = nearest(s, START_REACH_M, SOCKET_RISE_M)
        out["starts"].append({"positionM": [round(v, 3) for v in s], "node": k})
        if k is None:
            out["failures"].append(f"arrival marker {[round(v, 2) for v in s]} stands on no "
                                   f"walkable surface within {START_REACH_M} m")
        else:
            reach_labels.add(int(label[k]))
    reached_mask = np.isin(label, list(reach_labels)) if reach_labels else np.zeros(n, bool)
    for t in targets:
        p = t["positionM"]
        d = np.hypot(pos[:, 0] - p[0], pos[:, 2] - p[2])
        rise_ok = np.abs(pos[:, 1] - p[1]) <= SOCKET_RISE_M
        if t.get("host"):
            # furniture (a bench, a bed, a chest) is used from beside it
            # (ruling 5, interiors round 3), measured from its own plan box
            # when the bundle gives one (ruling 6, round 4)
            near = (_box_distance(pos, t["hostBox"]) if t.get("hostBox") else d) \
                <= HOSTED_IDLE_REACH_M
            near = near & rise_ok
        else:
            # every other socket needs its own walk cell
            own = ((np.abs(pos[:, 0] - p[0]) <= cell / 2) & (np.abs(pos[:, 2] - p[2]) <= cell / 2))
            near = own & rise_ok
        hit = bool((near & reached_mask).any())
        row = {"id": t["id"], "ok": hit}
        if not hit:
            dd = np.where(reached_mask, np.hypot(d, pos[:, 1] - p[1]), np.inf)
            row["nearestReachedM"] = None if not np.isfinite(dd.min()) else round(float(dd.min()), 2)
            out["failures"].append(f"{t['id']}: unreachable from the arrival marker(s); nearest "
                                   f"reached surface {row['nearestReachedM']} m away")
        out["targets"].append(row)
    if want_reached:
        out["reachedPositions"] = pos[reached_mask].round(3).tolist()
    return out


def host_box(mesh, owner, index: int, yaw_deg: float) -> dict | None:
    """The host placement's plan box in its own frame: ``{centre [x, z],
    yawRad, lo [u, v], hi [u, v]}``; of the two senses of the yaw, the one
    giving the tighter box (the frame the piece was modelled in)."""
    verts = mesh.triangles[owner == index].reshape(-1, 3) if len(owner) else None
    if verts is None or not len(verts):
        return None
    c = verts[:, [0, 2]].mean(axis=0)
    best = None
    for sign in (1.0, -1.0):
        a = sign * math.radians(yaw_deg)
        local = _to_local(verts[:, [0, 2]], c, a)
        lo, hi = local.min(axis=0), local.max(axis=0)
        area = float(np.prod(hi - lo))
        if best is None or area < best[0]:
            best = (area, {"centre": c.tolist(), "yawRad": a, "lo": lo.tolist(), "hi": hi.tolist()})
    return best[1]


def _to_local(xz: np.ndarray, centre, angle: float) -> np.ndarray:
    ca, sa = math.cos(angle), math.sin(angle)
    d = xz - np.asarray(centre)
    return np.column_stack([d[:, 0] * ca - d[:, 1] * sa, d[:, 0] * sa + d[:, 1] * ca])


def _box_distance(pos: np.ndarray, box: dict) -> np.ndarray:
    """Plan distance from every node to the host's box (0 inside it)."""
    local = _to_local(pos[:, [0, 2]], box["centre"], box["yawRad"])
    lo, hi = np.asarray(box["lo"]), np.asarray(box["hi"])
    gap = np.maximum(np.maximum(lo - local, local - hi), 0.0)
    return np.hypot(gap[:, 0], gap[:, 1])


def walk_bundle(bundle: dict, kits_dir: Path = RAW_KITS) -> dict:
    mesh, owner, missing = bundle_mesh(bundle, kits_dir)
    starts = [d["arrivalMarker"]["positionM"] for d in bundle.get("doors") or []] or \
        [bundle["arrivalMarker"]["positionM"]]
    index = {p["id"]: i for i, p in enumerate(bundle["placements"])}
    targets = []
    for s in bundle.get("sockets") or []:
        if s.get("kind") not in ("idle", "container"):
            continue
        i = index.get(s.get("host"))
        box = (host_box(mesh, owner, i, float(bundle["placements"][i]["rotationDeg"][1]))
               if i is not None else None)
        targets.append({**s, "hostBox": box} if box else s)
    out = walk_mesh(mesh, owner, starts, targets)
    out["assetsWithoutGeometry"] = missing
    return out
