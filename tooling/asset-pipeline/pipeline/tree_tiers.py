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

Settings per asset are CALIBRATED, not guessed: `tree_tiers_check
--calibrate` renders a ladder of leaf keeps and area gains against the
source at each tier's hand-over distance, and `--record` writes the lightest
setting that passes the silhouette bar into `treeTiers.perAsset` (null = no
setting passed within MAX_SHARE of the source; that tier is not built).

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
            "lengthShare": 0.5, "outer": 0.0},
    "far": {"leafKeep": 0.20, "gain": 0.85, "maxScale": 4.0, "barkKeep": 0.12,
            "lengthShare": 0.5, "outer": 0.0},
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
                if leaf:
                    kept, new_pos = thin_leaves(pos, tris, s["leafKeep"], s["gain"],
                                                s["maxScale"], seed + part_i,
                                                s["lengthShare"], s["outer"])
                else:
                    kept, new_pos = thin_bark(pos, tris, s["barkKeep"]), pos.astype(np.float64)
                part[tier] = int(len(kept))
                row[tier] += int(len(kept))
                if writer is None or len(kept) == 0:
                    continue
                sub = tris[kept]
                verts, remap = np.unique(sub.ravel(), return_inverse=True)
                attributes = {}
                for name, acc_i in prim["attributes"].items():
                    like = gltf["accessors"][acc_i]
                    data = new_pos[verts].astype(np.float32) if name == "POSITION" \
                        else accessor(gltf, blob, acc_i)[verts]
                    attributes[name] = writer.add(data, like, 34962, name == "POSITION")
                index_dtype = np.uint16 if len(verts) < 65536 else np.uint32
                indices = writer.add(remap.astype(index_dtype), None, 34963)
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
