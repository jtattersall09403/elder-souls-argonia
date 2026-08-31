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
