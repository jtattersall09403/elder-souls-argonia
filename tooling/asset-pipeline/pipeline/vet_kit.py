"""Vet a built kit's manifest for assets that will place badly.

Owner round-3 defect (2026-08-30): tramaroot arches floated mid-air and one
grass carried its geometry ~83 m from its origin. Both were knowable from the
kit manifest alone — BEFORE choosing the model for a palette:

  * pivot not at the base: the manifest records ``originOffsetM = -bboxMin``
    (build_kit.py), so ``originOffsetM[2]`` is the origin's height ABOVE the
    model's bottom (z-up source space). Far from zero means a
    place-at-terrain-height compiler buries it (positive) or floats it
    (negative). The runtime bottom-anchors from these numbers (floraKit.ts),
    but a large offset is still a smell worth eyeballing.
  * degenerate bbox: a near-zero dimension = a flat card posing as a mesh.
  * far-flung bounds: |offset| far beyond the size = stray geometry the
    builder's drop_strays missed.

Usage:  python3 -m pipeline.vet_kit output/kits/flora-province-v1.kit.json
Exit code 1 if any asset is flagged (fine to run in CI or by hand when
shortlisting species for a palette).
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import numpy as np

from .placement_metadata import validate_asset_placement

from .trunk_solids import accessor, load_glb

#: Downward-facing = triangle normal within ~72 deg of straight down.
_DOWN_DOT = 0.3
#: Footprint raster resolution for the underside test.
_FOOT_GRID = 32
#: Fraction of the footprint a rock's underside must cover to count closed.
_UNDERSIDE_CLOSED = 0.6
#: Horizontal directions sampled for the open-back test.
_YAW_STEPS = 16
#: A direction with less than this share of the face area is a hole...
_OPEN_SHARE = 0.02
#: ...and only if the direction facing it carries at least this much.
_FACING_SHARE = 0.15


def _lod0_triangles(gltf, blob, binoff, root_node) -> np.ndarray:
    """Every LOD0 triangle of one asset, as an (n, 3, 3) array of GLB-space
    (Y-up) vertices. Billboard cards and decimated levels are skipped: they
    are impostors, not the shape the placer has to sit on the ground."""
    tris: list[np.ndarray] = []
    for child_index in root_node.get("children", []):
        node = gltf["nodes"][child_index]
        extras = node.get("extras", {})
        if extras.get("lod") or extras.get("billboard") or "mesh" not in node:
            continue
        translation = np.array(node.get("translation", [0.0, 0.0, 0.0]))
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            pos = accessor(gltf, blob, binoff,
                           prim["attributes"]["POSITION"]).astype("f8")
            pos = pos + translation
            if "indices" in prim:
                idx = accessor(gltf, blob, binoff, prim["indices"]).ravel()
            else:
                idx = np.arange(len(pos))
            tris.append(pos[idx.reshape(-1, 3).astype("i8")])
    return np.concatenate(tris) if tris else np.empty((0, 3, 3))


def _face_normals(tris: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Unit face normals and triangle areas."""
    a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]
    cross = np.cross(b - a, c - a)
    norm = np.linalg.norm(cross, axis=1)
    area = 0.5 * norm
    unit = np.zeros_like(cross)
    ok = norm > 1e-12
    unit[ok] = cross[ok] / norm[ok, None]
    return unit, area


def _underside_closed(tris: np.ndarray, normals: np.ndarray) -> float:
    """Share of the asset's ground footprint covered by downward-facing
    geometry, rasterised on a 32x32 grid.

    A boulder authored to stand free has a closed bottom; a cliff-face shell
    authored to be embedded in a hillside has none, and reads as a hollow
    tent when a scatter pass stands it on open ground (owner round 4).
    """
    if not len(tris):
        return 0.0
    y = tris[:, :, 1]
    low, high = float(y.min()), float(y.max())
    band = low + 0.1 * max(high - low, 1e-6)
    base = tris[(y.max(axis=1) <= band)]
    footprint = base if len(base) else tris
    xz = footprint[:, :, [0, 2]].reshape(-1, 2)
    lo, hi = xz.min(axis=0), xz.max(axis=0)
    span = np.maximum(hi - lo, 1e-6)
    down = tris[normals[:, 1] < -_DOWN_DOT][:, :, [0, 2]]
    if not len(down):
        return 0.0
    grid = np.zeros((_FOOT_GRID, _FOOT_GRID), dtype=bool)
    centres = (np.arange(_FOOT_GRID) + 0.5) / _FOOT_GRID
    gx = lo[0] + centres * span[0]
    gz = lo[1] + centres * span[1]
    for tri in down:
        (x0, z0), (x1, z1), (x2, z2) = tri
        i0 = max(0, int(np.searchsorted(gx, min(x0, x1, x2)) - 1))
        i1 = min(_FOOT_GRID, int(np.searchsorted(gx, max(x0, x1, x2)) + 1))
        j0 = max(0, int(np.searchsorted(gz, min(z0, z1, z2)) - 1))
        j1 = min(_FOOT_GRID, int(np.searchsorted(gz, max(z0, z1, z2)) + 1))
        if i0 >= i1 or j0 >= j1:
            continue
        px, pz = np.meshgrid(gx[i0:i1], gz[j0:j1], indexing="ij")
        d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2)
        if abs(d) < 1e-12:
            continue
        w0 = ((z1 - z2) * (px - x2) + (x2 - x1) * (pz - z2)) / d
        w1 = ((z2 - z0) * (px - x2) + (x0 - x2) * (pz - z2)) / d
        inside = (w0 >= 0) & (w1 >= 0) & (w0 + w1 <= 1)
        grid[i0:i1, j0:j1] |= inside
    return float(grid.mean())


def _open_back_yaw(normals: np.ndarray, area: np.ndarray) -> float | None:
    """Bearing of the direction the asset has no face area pointing in, where
    the opposite direction carries plenty: the signature of an open-backed
    shell (a cliff face authored to be buried in the hill).

    Bearing is in the asset's local frame, degrees from +Z toward +X.
    """
    total = float(area.sum())
    if total <= 0.0:
        return None
    yaws = np.arange(_YAW_STEPS) * (360.0 / _YAW_STEPS)
    rad = np.radians(yaws)
    dirs = np.stack([np.sin(rad), np.zeros_like(rad), np.cos(rad)], axis=1)
    # `>=` with a float nudge, not `>`: a wall exactly 45 deg off a sampled
    # bearing (every axis-aligned mesh) would otherwise count for neither of
    # its two neighbouring bins and read as a hole in a closed box.
    cos45 = np.cos(np.radians(45.0)) - 1e-9
    shares = np.array([
        float(area[(normals @ d) >= cos45].sum()) / total for d in dirs])
    half = _YAW_STEPS // 2
    opposites = np.roll(shares, -half)
    open_bin = (shares < _OPEN_SHARE) & (opposites > _FACING_SHARE)
    if not open_bin.any() or open_bin.all():
        return None
    # A hole usually spans SEVERAL neighbouring bearings; its direction is the
    # middle of that run, not whichever end the scan met first. Rotate so a
    # run never straddles the wrap, then take the strongest run's midpoint.
    start = int(np.argmax(~open_bin))
    rolled = np.roll(open_bin, -start)
    rolled_opp = np.roll(opposites, -start)
    best: tuple[float, float] | None = None
    i = 0
    while i < _YAW_STEPS:
        if not rolled[i]:
            i += 1
            continue
        j = i
        while j < _YAW_STEPS and rolled[j]:
            j += 1
        strength = float(rolled_opp[i:j].max())
        centre = (start + (i + j - 1) / 2.0) % _YAW_STEPS
        if best is None or strength > best[0]:
            best = (strength, centre * (360.0 / _YAW_STEPS))
        i = j
    return None if best is None else round(best[1], 1)


def measure_geometry(manifest_path: Path) -> dict[str, dict]:
    """Per-asset shape facts the placement passes need but the kit build does
    not record: is the bottom closed, is there an open back, and how far the
    pivot sits above the mesh base."""
    manifest = json.loads(Path(manifest_path).read_text())
    glb_path = Path(manifest_path).with_suffix("").with_suffix(".glb")
    gltf, blob, binoff = load_glb(glb_path)
    roots = {}
    for node in gltf["nodes"]:
        asset_id = (node.get("extras") or {}).get("assetId")
        if asset_id and "children" in node:
            roots[asset_id] = node
    out: dict[str, dict] = {}
    for asset in manifest["assets"]:
        root = roots.get(asset["id"])
        if root is None:
            continue
        tris = _lod0_triangles(gltf, blob, binoff, root)
        normals, area = _face_normals(tris)
        coverage = _underside_closed(tris, normals)
        out[asset["id"]] = {
            "undersideClosed": bool(coverage >= _UNDERSIDE_CLOSED),
            "undersideCoverage": round(coverage, 3),
            "openBackYawDeg": _open_back_yaw(normals, area),
            "pivotAboveBaseM": round(
                float(asset.get("originOffsetM", [0.0, 0.0, 0.0])[2]), 3),
        }
    return out


def record_geometry(manifest_path: Path) -> dict[str, dict]:
    """Write `measure_geometry` back into the kit manifest (build post-pass,
    beside sizeM/originOffsetM)."""
    path = Path(manifest_path)
    manifest = json.loads(path.read_text())
    measured = measure_geometry(path)
    for asset in manifest["assets"]:
        asset.update(measured.get(asset["id"], {}))
    path.write_text(json.dumps(manifest, indent=1) + "\n")
    return measured


def _vet_glb_materials(glb_path: Path) -> list[str]:
    """Flag levels whose materials will render as untextured/solid slabs.

    Owner round-3 defect: `_lod_flat` cards rendered as solid grey rectangles
    (their shared atlas was resized to mush / the wrong atlas won) and the
    giant mushroom drew flat grey at every level (a referenced texture that no
    archive ships). Both are visible in the exported GLB itself: a billboard
    primitive must have a baseColorTexture AND alphaMode MASK; any primitive
    without a baseColorTexture is an untextured slab in the world.
    """
    data = glb_path.read_bytes()
    if data[:4] != b"glTF":
        return [f"{glb_path.name}: not a GLB"]
    json_len = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + json_len])
    nodes = gltf.get("nodes", [])
    materials = gltf.get("materials", [])
    meshes = gltf.get("meshes", [])
    findings: list[str] = []

    def walk(index: int):
        yield index
        for child in nodes[index].get("children", []):
            yield from walk(child)

    for root_index in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        root = nodes[root_index]
        asset_id = (root.get("extras") or {}).get("assetId", root.get("name"))
        for node_index in walk(root_index):
            node = nodes[node_index]
            if "mesh" not in node:
                continue
            extras = node.get("extras") or {}
            level = extras.get("lod", 0)
            is_card = bool(extras.get("billboard"))
            for prim in meshes[node["mesh"]].get("primitives", []):
                mat = materials[prim["material"]] if "material" in prim else {}
                pbr = mat.get("pbrMetallicRoughness", {})
                has_texture = "baseColorTexture" in pbr
                if not has_texture:
                    findings.append(
                        f"{asset_id}: lod{level}{' (flat card)' if is_card else ''} "
                        f"material {mat.get('name', '?')!r} has NO texture — "
                        "renders as a solid slab"
                    )
                elif is_card and mat.get("alphaMode") != "MASK":
                    findings.append(
                        f"{asset_id}: flat-card material {mat.get('name', '?')!r} "
                        f"is {mat.get('alphaMode', 'OPAQUE')}, not MASK — "
                        "card renders as an opaque rectangle"
                    )
    return sorted(set(findings))


def vet(manifest_path: str) -> list[str]:
    with open(manifest_path) as f:
        manifest = json.load(f)
    findings: list[str] = []
    # The manifest's outputGlb sits next to it under output/kits/.
    glb = Path(manifest_path).with_suffix("").with_suffix(".glb")
    if glb.exists():
        findings += _vet_glb_materials(glb)
    for asset in manifest["assets"]:
        findings += validate_asset_placement(asset)
        sx, sy, sz = asset["sizeM"]
        ox, oy, oz = asset.get("originOffsetM", [0.0, 0.0, 0.0])
        # oz = origin height above the model's bottom (originOffsetM = -bboxMin)
        if oz > max(0.25 * sz, 0.5) or oz < -0.05:
            findings.append(
                f"{asset['id']}: pivot {oz:+.2f} m above base "
                f"(sizeZ {sz:.2f}) — buries or floats unless bottom-anchored"
            )
        if min(sx, sy, sz) < 0.02:
            findings.append(f"{asset['id']}: degenerate bbox {asset['sizeM']} — flat card")
        if max(abs(ox), abs(oy), abs(oz)) > 2 * max(sx, sy, sz) + 2:
            findings.append(
                f"{asset['id']}: bounds far from origin (offset {asset.get('originOffsetM')}) "
                "— stray geometry?"
            )
    return findings


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "output/kits/flora-province-v1.kit.json"
    findings = vet(path)
    for line in findings:
        print(line)
    print(f"{len(findings)} finding(s) in {path}")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
