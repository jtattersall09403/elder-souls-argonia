"""Measure each kit asset's REAL ground footprint from its geometry.

Owner ruling 2026-09-05 (decision 0041, "geometry, never labels"): a blueprint
parcel must show the building's actual outline, not an axis-aligned square. This
module is the measurement half of that: it reads the built kits in
``tooling/asset-pipeline/output/kits/`` and writes, per kit,
``<kit>.footprints.json`` — the 2D convex hull of each asset's ground contact,
in METRES, in the asset's own local frame, centred on the pivot the settlement
compiler places.

Frames and conventions (the gotchas):

  * kits are authored in Blender (Z-up), so ``kit.json``'s ``sizeM`` is
    ``[x, y, z]`` with **z = height**; the exported GLB is glTF **Y-up**, so in
    the GLB the same box reads ``[x, z, y]``. We measure in the GLB frame:
    ground plane is **(x, z)**, height is **y**. Footprint points are ``[x, z]``.
  * the **pivot** is the asset root node's origin — the Blender object origin,
    which ``kit.json`` records indirectly as ``originOffsetM = -bboxMin``. It is
    NOT the ground contact point (a stilt house's origin sits ~8 m above its
    pile feet). ``compile_settlement`` places this node origin at the parcel
    centre, so a hull expressed in this frame drops straight onto the map.
  * an asset root's GLB node name is the manifest's ``node`` field verbatim
    (``es|<hash>|<id tail>``); if that misses, the node is found through the
    GLB's own ``extras.assetId``. LOD children are suffixed ``__lod1`` /
    ``__lod2`` and are excluded so the hull is measured on LOD0 only.

What is measured, per asset:

  * ``footprintM`` — hull of the vertices in the lowest ``groundBandM`` (1.5 m)
    of the piece: what actually touches the ground.
  * ``planOutlineM`` — hull of ALL vertices projected down: the full plan
    outline. For stilt pieces the ground band is only the piles, so the plan
    outline is the silhouette a blueprint should draw; both are always recorded
    and the consumer chooses.
  * ``widthM`` / ``depthM`` / ``heightM`` — the plan-outline extents and the
    piece height; ``areaM2`` is the ground-band hull area.

Assets that genuinely share one GLB node are emitted with ``nodeAmbiguous:
true`` — their numbers describe a node shared with siblings, so they are not a
safe basis for a parcel pick. (This used to fire on 234 assets because long
names were truncated to Blender's 63-character limit; kits now carry short
unique node names, so it should be zero.)

Degenerate ground bands (flat cards, pieces whose lowest 1.5 m is collinear)
fall back to the plan outline and are flagged ``groundBandDegenerate: true``.

Deterministic: assets sorted by id, coordinates rounded to 2 dp, hulls emitted
counter-clockwise starting at the lexicographically smallest vertex.

Run (from the repo root):
  python3 -m pipeline.measure_footprints            # all kits
  python3 -m pipeline.measure_footprints --kit settlement-stilt-v1
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
KITS_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
SCHEMA_VERSION = 1
GROUND_BAND_M = 1.5
SKIP_PREFIXES = ("probe-", "flora-", "groundcover-")
NODE_PREFIX = "es|"
LOD_SUFFIXES = ("__lod1", "__lod2", "__lod3")


# --------------------------------------------------------------------------- #
# geometry helpers (kept dependency-light and deterministic)
# --------------------------------------------------------------------------- #
def convex_hull_2d(points: list[tuple[float, float]]) -> list[list[float]]:
    """Monotone-chain hull, counter-clockwise, canonical start vertex."""
    pts = sorted(set((round(x, 4), round(y, 4)) for x, y in points))
    if len(pts) < 3:
        return [[x, y] for x, y in pts]

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list[tuple[float, float]] = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list[tuple[float, float]] = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    if len(hull) < 3:
        return [[x, y] for x, y in pts[:2]]
    start = min(range(len(hull)), key=lambda i: hull[i])
    hull = hull[start:] + hull[:start]
    return [[round(x, 2), round(y, 2)] for x, y in hull]


def polygon_area(poly: list[list[float]]) -> float:
    if len(poly) < 3:
        return 0.0
    a = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0


# --------------------------------------------------------------------------- #
# measurement
# --------------------------------------------------------------------------- #
def _asset_vertices(scene, root_node: str):
    """Vertices of an asset's LOD0 subtree, in the asset root node's frame."""
    import numpy as np
    import trimesh

    graph = scene.graph
    children = graph.transforms.children
    root_matrix, _ = graph.get(root_node)
    inverse = np.linalg.inv(root_matrix)

    stack = [root_node]
    chunks = []
    while stack:
        node = stack.pop()
        if node != root_node and node.endswith(LOD_SUFFIXES):
            continue
        stack.extend(children.get(node, []))
        matrix, geometry = graph.get(node)
        if geometry is None:
            continue
        mesh = scene.geometry.get(geometry)
        if mesh is None or not hasattr(mesh, "vertices") or len(mesh.vertices) == 0:
            continue
        chunks.append(trimesh.transform_points(mesh.vertices, inverse @ matrix))
    if not chunks:
        return None
    return np.vstack(chunks)


def glb_asset_id_nodes(glb_path: Path) -> dict[str, str]:
    """Map ``extras.assetId`` -> glTF node name, read from the GLB directly.

    The exporter always writes the full semantic id into each asset root's
    ``extras.assetId`` (three.js sanitises node names, so the runtime looks
    assets up by that extra). Reading it here means even a kit built before the
    short-node-name change resolves exactly, with no prefix guessing. Only LOD0
    roots are mapped: LOD copies carry the same ``assetId`` but also a ``lod``
    extra, and billboard cards carry ``billboard``.

    Stdlib GLB parse: 12-byte header, then chunks of (uint32 length, uint32
    type, payload); the first chunk is the JSON.
    """
    import struct

    data = glb_path.read_bytes()
    if data[:4] != b"glTF":
        return {}
    offset = 12
    chunk_len, chunk_type = struct.unpack_from("<II", data, offset)
    if chunk_type != 0x4E4F534A:  # 'JSON'
        return {}
    gltf = json.loads(data[offset + 8 : offset + 8 + chunk_len].decode("utf-8"))
    out: dict[str, str] = {}
    for node in gltf.get("nodes", []):
        extras = node.get("extras") or {}
        asset_id = extras.get("assetId")
        name = node.get("name")
        if not asset_id or not name:
            continue
        if "lod" in extras or extras.get("billboard"):
            continue
        out.setdefault(asset_id, name)
    return out


def _resolve_node(asset: dict, node_names: set[str],
                  by_asset_id: dict[str, str]) -> str | None:
    """Manifest asset -> GLB node name.

    The GLB's own ``extras.assetId`` index wins, because it is the one link the
    exporter cannot corrupt. The manifest ``node`` is the fallback: for kits
    built before the short-name change it holds an untruncated Blender name
    that may nonetheless MATCH a truncated GLB node belonging to a sibling, so
    trusting it first re-created the very collision this resolver fixes.
    """
    mapped = by_asset_id.get(asset["id"])
    if mapped and mapped in node_names:
        return mapped
    node = asset.get("node") or ""
    for candidate in (node, NODE_PREFIX + node):
        if candidate and candidate in node_names:
            return candidate
    return None


def measure_kit(kit_name: str, kits_dir: Path = KITS_DIR) -> dict:
    import trimesh

    manifest = json.loads((kits_dir / f"{kit_name}.kit.json").read_text())
    scene = trimesh.load(kits_dir / f"{kit_name}.glb", process=False)
    node_names = set(scene.graph.nodes)

    by_asset_id = glb_asset_id_nodes(kits_dir / f"{kit_name}.glb")
    ordered = sorted(manifest["assets"], key=lambda a: a["id"])
    resolved = {a["id"]: _resolve_node(a, node_names, by_asset_id) for a in ordered}
    shared: dict[str, int] = {}
    for node in resolved.values():
        if node is not None:
            shared[node] = shared.get(node, 0) + 1

    assets: dict[str, dict] = {}
    for asset in ordered:
        node = resolved[asset["id"]]
        if node is None:
            continue
        verts = _asset_vertices(scene, node)
        if verts is None or len(verts) == 0:
            continue
        # GLB frame: y is up, ground plane is (x, z).
        plan = convex_hull_2d([(float(v[0]), float(v[2])) for v in verts])
        low = float(verts[:, 1].min())
        high = float(verts[:, 1].max())
        band = verts[verts[:, 1] <= low + GROUND_BAND_M]
        foot = convex_hull_2d([(float(v[0]), float(v[2])) for v in band])
        degenerate = len(foot) < 3 or polygon_area(foot) <= 0.0
        if degenerate:
            foot = plan
        xs = [p[0] for p in plan] or [0.0]
        zs = [p[1] for p in plan] or [0.0]
        record = {
            "footprintM": foot,
            "planOutlineM": plan,
            "areaM2": round(polygon_area(foot), 2),
            "widthM": round(max(xs) - min(xs), 2),
            "depthM": round(max(zs) - min(zs), 2),
            "heightM": round(high - low, 2),
            "groundBandM": GROUND_BAND_M,
        }
        if degenerate:
            record["groundBandDegenerate"] = True
        if shared[node] > 1:
            # Export-name truncation collapsed several manifest assets onto one
            # GLB node, so this measurement cannot be attributed to one piece.
            # Flagged, never silently trusted: do not pick these on geometry
            # until the kit build gives them distinct node names.
            record["nodeAmbiguous"] = True
        assets[asset["id"]] = record

    return {
        "schemaVersion": SCHEMA_VERSION,
        "kit": manifest.get("kit", kit_name),
        "metresPerUnit": manifest.get("metresPerUnit"),
        "assets": assets,
    }


def kit_names(kits_dir: Path = KITS_DIR) -> list[str]:
    names = []
    for path in sorted(kits_dir.glob("*.kit.json")):
        name = path.name.removesuffix(".kit.json")
        if name.startswith(SKIP_PREFIXES):
            continue
        if not (kits_dir / f"{name}.glb").exists():
            continue
        names.append(name)
    return names


def write_kit(kit_name: str, kits_dir: Path = KITS_DIR) -> Path:
    data = measure_kit(kit_name, kits_dir)
    out = kits_dir / f"{kit_name}.footprints.json"
    out.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--kit", action="append", default=None,
                    help="kit name (repeatable); default every non-probe/flora kit")
    ap.add_argument("--kits-dir", default=str(KITS_DIR))
    args = ap.parse_args()

    kits_dir = Path(args.kits_dir)
    names = args.kit or kit_names(kits_dir)
    for name in names:
        out = write_kit(name, kits_dir)
        count = len(json.loads(out.read_text())["assets"])
        print(f"measure_footprints: {out.name} — {count} assets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
