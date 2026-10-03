"""Coplanar overlapping surfaces between pieces: the z-fighting measure
(16k walk 6; the Claywater stable, the farmhouse interior corner and an
earlier pair at one height and position all flickered in the studio).

    wb.py coplanar [--cell CELL ...] [--place PLACE_ID ...] [--all-cells] [--out JSON]

A hit is a pair of triangles from DIFFERENT pieces whose planes agree within
`ANGLE_DEG` and `OFFSET_M` (facing the same way or facing each other) and
whose overlap, summed per piece pair, exceeds `AREA_M2`. A declared decal
material (the kit manifest's `decalMaterials`: blood, hay scatter, ground
paint) is exempt against the surface it lies on ONLY where the runtime that
draws it gives decals their polygonOffset (`decals_biased`: the loader source
calls `applySettlementDecal`); the interior loader did not, and the
DawnstarBrinasHouse corner flickered with hay scatter flush on the floor
(16k walk 6). Decal on decal is always a hit.

`separate` is the exporter's pass: every hit between two pieces of one cell
is taken apart by moving the later piece (by id) `NUDGE_M` along the shared
normal, deterministically, with `coplanarFixed` evidence rows. Shared by
`export_interior_bundle` and `wb.py coplanar` / `audit-interior`.

Cost: broad phase on piece boxes, then per box pair only the triangles inside
the shared box, bucketed by quantised (normal, offset) in the pair's local
frame, then an exact test on bucket neighbours and a vectorised shapely
overlap. Kits load once per run (one trimesh scene per kit, freed after its
assets are cut out). Targets: < 5 s a cell or place, peak < 1.5 GiB.
"""
from __future__ import annotations

import itertools
import json
import math
import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[3]
ASSET_PIPELINE = REPO_ROOT / "tooling" / "asset-pipeline"
RAW_KITS = ASSET_PIPELINE / "output" / "kits"
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
GAME_CORE = REPO_ROOT / "packages" / "game-core" / "src"
#: the runtime that draws each kind of bundle; its decals are exempt only if it
#: applies the decal depth bias
RUNTIME = {"cell": GAME_CORE / "interior" / "interiorLoader.ts",
           "place": GAME_CORE / "settlement" / "SettlementLayer.tsx"}
NUDGE_M = 0.005

ANGLE_DEG = 2.0
OFFSET_M = 0.002
AREA_M2 = 0.01
PAIR_CHUNK = 4_000_000  # candidate triangle pairs per block (memory standard)
MIN_TRI_M2 = 1e-5
NORMAL_BIN = 0.06      # coarse bins, neighbours searched: never misses at a bin edge
OFFSET_BIN = 0.01
DECAL, DOUBLE = 1, 2


def _euler(rotation_deg) -> np.ndarray:
    p, y, r = (math.radians(float(v)) for v in rotation_deg)
    y = -y
    cx, sx, cy, sy, cz, sz = math.cos(p), math.sin(p), math.cos(y), math.sin(y), math.cos(r), math.sin(r)
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return ry @ rx @ rz


class KitGeometry:
    """LOD0 triangles + a per-triangle decal flag per (kit, asset), from the RAW
    kit build (the published GLBs are meshopt-compressed). Only the asked-for
    assets are kept: a kit's GLB is parsed again only when a later cell asks
    for an asset not yet cached, and the scene is freed before returning."""

    def __init__(self, kits_dir: Path = RAW_KITS):
        self.dir = kits_dir
        self.cache: dict[tuple[str, str], tuple[np.ndarray, np.ndarray] | None] = {}

    def load(self, kit: str, assets: set[str]) -> None:
        assets = {a for a in assets if (kit, a) not in self.cache}
        if not assets:
            return
        import trimesh
        if str(ASSET_PIPELINE) not in sys.path:
            sys.path.insert(0, str(ASSET_PIPELINE))
        from pipeline.interiors_index import LOD_SUFFIXES, _resolve_node, glb_asset_id_nodes
        manifest = json.loads((self.dir / f"{kit}.kit.json").read_text())
        scene = trimesh.load(self.dir / f"{kit}.glb", process=False)
        names = set(scene.graph.nodes)
        by_id = glb_asset_id_nodes(self.dir / f"{kit}.glb")
        for asset in manifest["assets"]:
            if asset["id"] not in assets:
                continue
            node = _resolve_node(asset, names, by_id)
            decals = {m.lower() for m in asset.get("decalMaterials") or []}
            self.cache[(kit, asset["id"])] = _triangles(scene, node, decals, LOD_SUFFIXES) if node else None
        for asset in assets:                   # not in the manifest: no geometry
            self.cache.setdefault((kit, asset), None)
        del scene

    def get(self, kit: str, asset: str):
        return self.cache.get((kit, asset))


def _triangles(scene, root, decals: set[str], lod_suffixes):
    import trimesh
    graph = scene.graph
    children = graph.transforms.children
    inverse = np.linalg.inv(graph.get(root)[0])
    stack, tris, flags = [root], [], []
    while stack:
        node = stack.pop()
        if node != root and node.endswith(lod_suffixes):
            continue
        stack.extend(children.get(node, []))
        matrix, geometry = graph.get(node)
        mesh = scene.geometry.get(geometry) if geometry else None
        if mesh is None or not len(getattr(mesh, "faces", ())):
            continue
        mat = getattr(getattr(mesh, "visual", None), "material", None)
        name = (getattr(mat, "name", None) or "").lower()
        pts = trimesh.transform_points(mesh.vertices, inverse @ matrix)[mesh.faces]
        tris.append(pts)
        flags.append(np.full(len(pts), (DECAL if name and name in decals else 0)
                             | (DOUBLE if getattr(mat, "doubleSided", False) else 0), np.uint8))
    if not tris:
        return None
    return np.vstack(tris).astype(np.float64), np.concatenate(flags)


def pieces_from_bundle(placements: list[dict], geo: KitGeometry) -> list[dict]:
    """Placements in the game frame (an interior cell's `rotationDeg`, or a
    place's `yawDeg`/`pitchDeg`) as world triangles with a decal mask."""
    by_kit: dict[str, set[str]] = {}
    for p in placements:
        by_kit.setdefault(p["kit"], set()).add(p["assetId"])
    for kit, assets in sorted(by_kit.items()):
        geo.load(kit, assets)
    out = []
    for index, p in enumerate(placements):
        got = geo.get(p["kit"], p["assetId"])
        if got is None:
            continue
        tris, flags = got
        rot = p.get("rotationDeg") or [p.get("pitchDeg") or 0.0, p.get("yawDeg") or 0.0, 0.0]
        m = _euler(rot) * float(p.get("scale", 1.0))
        world = (tris.reshape(-1, 3) @ m.T + np.asarray(p["positionM"], float)).reshape(-1, 3, 3)
        out.append({"index": index, "id": p["id"],
                    "pose": (tuple(p["positionM"]), tuple(rot), float(p.get("scale", 1.0))), "kit": p["kit"], "assetId": p["assetId"],
                    "source": p.get("source") or "plugin", "tris": world, "decal": (flags & DECAL) > 0,
                    "double": (flags & DOUBLE) > 0,
                    "lo": world.reshape(-1, 3).min(0), "hi": world.reshape(-1, 3).max(0)})
    return out


def _planes(t: np.ndarray, origin: np.ndarray):
    n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    area = np.linalg.norm(n, axis=1) / 2
    ok = area > MIN_TRI_M2
    n = n[ok] / (2 * area[ok, None])
    # canonical sign: largest component positive (so facing pairs share a plane key)
    s = np.sign(n[np.arange(len(n)), np.abs(n).argmax(1)])
    n = n * s[:, None]
    d = np.einsum("ij,ij->i", n, t[ok, 0] - origin)
    return np.where(ok)[0], n, d, s


def _keys(n, d):
    return np.column_stack([np.floor(n / NORMAL_BIN), np.floor(d / OFFSET_BIN)]).astype(np.int64)


def _in_box(t, lo, hi):
    return ((t.max(1) >= lo) & (t.min(1) <= hi)).all(1)


def pair_hits(a: dict, b: dict, decal_exempt: bool = True) -> dict | None:
    lo = np.maximum(a["lo"], b["lo"]) - OFFSET_M
    hi = np.minimum(a["hi"], b["hi"]) + OFFSET_M
    if (lo > hi).any():
        return None
    origin = (lo + hi) / 2
    ia = np.where(_in_box(a["tris"], lo, hi))[0]
    ib = np.where(_in_box(b["tris"], lo, hi))[0]
    if not len(ia) or not len(ib):
        return None
    ka, na, da, sa = _planes(a["tris"][ia], origin)
    kb, nb, db, sb = _planes(b["tris"][ib], origin)
    ia, ib = ia[ka], ib[kb]
    if not len(ia) or not len(ib):
        return None
    buckets: dict[tuple, list[int]] = {}
    for j, key in enumerate(map(tuple, _keys(nb, db))):
        buckets.setdefault(key, []).append(j)
    cos_tol = math.cos(math.radians(ANGLE_DEG))
    offs = list(itertools.product((-1, 0, 1), repeat=4))
    ukeys, inv = np.unique(_keys(na, da), axis=0, return_inverse=True)
    inv = inv.ravel()
    order = np.argsort(inv, kind="stable")
    starts = np.searchsorted(inv[order], np.arange(len(ukeys) + 1))
    # triangles relative to the overlap box, float32 (mm-exact at cell scale)
    TA = (a["tris"][ia] - origin).astype(np.float32)
    TB = (b["tris"][ib] - origin).astype(np.float32)

    def candidates():
        """(ci, cj) pair blocks of at most PAIR_CHUNK (memory standard:
        never the whole A x B product at once)."""
        for u, key in enumerate(map(tuple, ukeys)):
            js = np.asarray([j for o in offs for j in buckets.get(
                (key[0] + o[0], key[1] + o[1], key[2] + o[2], key[3] + o[3]), ())], int)
            if not len(js):
                continue
            members = order[starts[u]:starts[u + 1]]
            step = max(1, PAIR_CHUNK // len(js))
            for k in range(0, len(members), step):
                m = members[k:k + step]
                yield np.repeat(m, len(js)), np.tile(js, len(m))

    import shapely
    kept = []   # (ci, cj, area, dist, dA, dB) per block, in pair order
    for ci, cj in candidates():
        ok = (np.einsum("ij,ij->i", na[ci], nb[cj]) >= cos_tol) & (np.abs(da[ci] - db[cj]) < OFFSET_M)
        ci, cj = ci[ok], cj[ok]
        ta_, tb_ = TA[ci], TB[cj]
        ok = ((ta_.max(1) >= tb_.min(1) - OFFSET_M) & (tb_.max(1) >= ta_.min(1) - OFFSET_M)).all(1)
        ci, cj = ci[ok], cj[ok]
        del ta_, tb_
        # every vertex of b's triangle within OFFSET_M of a's plane (the exact test)
        tb = TB[cj]
        dist = np.abs(np.einsum("ikj,ij->ik", tb, na[ci]) - da[ci, None]).max(1)
        # a declared decal is exempt against the surface under it; decal on decal is a hit
        dA, dB = a["decal"][ia[ci]], b["decal"][ib[cj]]
        # opposite normals on one plane are a resting contact (a chest's underside
        # on the floor): each hides the other's back face, nothing flickers unless
        # one material draws both sides
        same = sa[ci] == sb[cj]
        both = a["double"][ia[ci]] | b["double"][ib[cj]]
        exempt = (dA ^ dB) if decal_exempt else np.zeros(len(ci), bool)
        ok = (dist < OFFSET_M) & ~exempt & (same | both)
        ci, cj, tb, dist, dA, dB = ci[ok], cj[ok], tb[ok], dist[ok], dA[ok], dB[ok]
        if not len(ci):
            continue
        # project onto a's plane: two axes orthogonal to its normal
        n0 = na[ci]
        ref = np.where(np.abs(n0[:, :1]) < 0.9, [[1.0, 0, 0]], [[0, 1.0, 0]])
        u = np.cross(n0, ref)
        u /= np.linalg.norm(u, axis=1)[:, None]
        v = np.cross(n0, u)

        def poly(t):
            xy = np.stack([np.einsum("ikj,ij->ik", t, u), np.einsum("ikj,ij->ik", t, v)], -1)
            return shapely.polygons(np.concatenate([xy, xy[:, :1]], 1))

        area = shapely.area(shapely.intersection(poly(TA[ci]), poly(tb)))
        kept.append((ci, cj, area, dist, dA, dB))
    if not kept:
        return None
    ci, cj, area, dist, dA, dB = (np.concatenate(x) for x in zip(*kept))
    keep = area > 1e-6
    if not keep.any():
        return None
    total = float(area.sum())
    if total <= AREA_M2:
        return None
    best = int(np.argmax(area))
    facing = "same" if sa[ci[best]] == sb[cj[best]] else "each-other"
    centre = a["tris"][ia[ci[best]]].mean(0)
    decal = bool(dA[best] and dB[best])
    return {"overlapM2": round(total, 4), "facing": facing, "decalOnDecal": decal,
            "normal": [round(float(x), 3) for x in na[ci[best]] * sa[ci[best]]],
            "atM": [round(float(x), 3) for x in centre],
            "maxOffsetM": round(float(dist[keep].max()), 4)}


def _area(p: dict) -> float:
    t = p["tris"]
    return float(np.linalg.norm(np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]), axis=1).sum() / 2)


def suggest(a: dict, b: dict, hit: dict) -> str:
    if a["assetId"] == b["assetId"] and np.allclose(a["lo"], b["lo"], atol=0.01) and np.allclose(a["hi"], b["hi"], atol=0.01):
        return f"duplicate: drop {b['id']} (the same asset in the same pose)"
    small = min((a, b), key=_area)
    if hit["decalOnDecal"]:
        return f"decal on decal: drop {small['id']} or move it clear of the other"
    other = b if small is a else a
    return (f"sink or offset {small['id']} ({small['assetId']}) by its designed sink, or at least "
            f"0.005 m off {other['id']}; drop it if it only repeats the surface")


def decals_biased(kind: str) -> bool:
    """True when the runtime drawing a `kind` bundle ("cell" / "place")
    applies the decal polygonOffset, read off its source."""
    return "applySettlementDecal(" in RUNTIME[kind].read_text()


def _pose_key(p: dict) -> tuple:
    return (p["id"], p["pose"])


def find(pieces: list[dict], decal_exempt: bool = True, memo: dict | None = None) -> list[dict]:
    """Every coplanar pair. `memo` (separate's passes) keeps each pair's
    result keyed on both pieces' poses, so a pass re-tests only moved pairs."""
    lo = np.array([p["lo"] for p in pieces]) if pieces else np.zeros((0, 3))
    hi = np.array([p["hi"] for p in pieces]) if pieces else np.zeros((0, 3))
    rows = []
    for i in range(len(pieces)):
        near = np.where((lo[i + 1:] <= hi[i] + OFFSET_M).all(1) & (hi[i + 1:] >= lo[i] - OFFSET_M).all(1))[0] + i + 1
        for j in near:
            if memo is None:
                hit = pair_hits(pieces[i], pieces[j], decal_exempt)
            else:
                key = (_pose_key(pieces[i]), _pose_key(pieces[j]))
                if key not in memo:
                    memo[key] = pair_hits(pieces[i], pieces[j], decal_exempt)
                hit = memo[key]
            if hit:
                a, b = pieces[i], pieces[j]
                rows.append({"a": {k: a[k] for k in ("id", "kit", "assetId", "source")},
                             "b": {k: b[k] for k in ("id", "kit", "assetId", "source")},
                             **hit, "fix": suggest(a, b, hit)})
    return sorted(rows, key=lambda r: -r["overlapM2"])


def measure_cell(cell: str, geo: KitGeometry, interiors_dir: Path | None = None) -> dict:
    bundle = json.loads(((interiors_dir or PROVINCE / "interiors") / f"{cell}.json").read_text())
    pieces = pieces_from_bundle(bundle["placements"], geo)
    return {"cell": cell, "pieces": len(pieces), "hits": find(pieces, decals_biased("cell"))}


def measure_place(place: str, geo: KitGeometry) -> dict:
    bundle = json.loads((PROVINCE / "settlements" / f"{place}.json").read_text())
    pl = [p for p in bundle["placements"] if p.get("kit") and p.get("assetId") and p.get("positionM")]
    pieces = pieces_from_bundle(pl, geo)
    return {"place": place, "pieces": len(pieces), "hits": find(pieces, decals_biased("place"))}


def bundle_mesh(pieces: list[dict]):
    """(trimesh of the pieces, per-face placement index): the settle pass's
    mesh, built from the same triangles the coplanar pass reads."""
    import trimesh
    tris = np.vstack([p["tris"] for p in pieces])
    owner = np.concatenate([np.full(len(p["tris"]), p["index"]) for p in pieces])
    mesh = trimesh.Trimesh(vertices=tris.reshape(-1, 3), faces=np.arange(len(tris) * 3).reshape(-1, 3),
                           process=False)
    return mesh, owner


def drop_duplicates(bundle: dict) -> list[dict]:
    """Drop every placement that repeats another's kit, asset, position,
    rotation and scale exactly (a plugin that stored one piece twice): the
    lowest id stays. Mutates placements; returns the `drops` evidence rows.
    Deterministic: grouped on the rounded pose, kept by id order."""
    pl = bundle["placements"]
    keep: dict[tuple, str] = {}
    gone: list[dict] = []
    for p in sorted(pl, key=lambda q: q["id"]):
        key = (p["kit"], p["assetId"], tuple(round(float(x), 3) for x in p["positionM"]),
               tuple(round(float(x) % 360.0, 2) for x in p.get("rotationDeg") or ()),
               p.get("yawDeg"), p.get("pitchDeg"), round(float(p.get("scale", 1.0)), 4))
        if key in keep:
            gone.append({"refId": p["id"].rsplit(".", 1)[-1], "reason": "duplicate-pose",
                         "assetId": p["assetId"], "duplicateOf": keep[key],
                         "positionM": p["positionM"]})
        else:
            keep[key] = p["id"]
    ids = {g["refId"] for g in gone}
    bundle["placements"] = [p for p in pl if p["id"].rsplit(".", 1)[-1] not in ids]
    return gone


def separate(bundle: dict, geo: KitGeometry, passes: int = 8) -> list[dict]:
    """Take every coplanar pair of the cell apart along the shared normal (a's
    front face). The mover is the piece not yet held as another's anchor
    (else the later id); a piece that stacks on one already moved goes one
    `NUDGE_M` further per level (stack depth), so a chain of overlapping
    pieces (a fence run, stairs on a nudged floor) never swings back onto
    its neighbour. Mutates positionM; returns the evidence rows
    {id, against, nudgeM, overlapM2}. Deterministic: id order, no randomness."""
    pl = bundle["placements"]
    by_id = {q["id"]: q for q in pl}
    exempt = decals_biased("cell")
    depth: dict[str, int] = {}
    anchors: set[str] = set()
    rows: list[dict] = []
    memo: dict = {}
    for _ in range(passes):
        pieces = sorted(pieces_from_bundle(pl, geo), key=lambda p: p["id"])
        hits = find(pieces, exempt, memo)
        if not hits:
            break
        moved: set[str] = set()
        for h in sorted(hits, key=lambda r: (r["a"]["id"], r["b"]["id"])):
            ida, idb = h["a"]["id"], h["b"]["id"]
            later, earlier = max(ida, idb), min(ida, idb)
            # the one already held or already moved stays; else the later id moves
            stays = lambda q: q in anchors or q in depth  # noqa: E731
            mover, anchor = (earlier, later) if stays(later) and not stays(earlier) else (later, earlier)
            if mover in moved or anchor in moved:
                continue
            moved.add(mover)
            anchors.add(anchor)
            level = depth.get(anchor, 0) + 1
            depth[mover] = max(depth.get(mover, 0), level)
            sign = 1.0 if mover == idb else -1.0
            step = [round(sign * NUDGE_M * level * n, 4) for n in h["normal"]]
            p = by_id[mover]
            p["positionM"] = [round(float(x) + d, 4) for x, d in zip(p["positionM"], step)]
            rows.append({"id": mover, "against": anchor, "nudgeM": step, "overlapM2": h["overlapM2"]})
    return rows
