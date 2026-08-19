"""Validate an emitted character GLB without a 3D engine.

Parses the glTF JSON chunk directly and asserts the structural contract:
one skinned armature, the complete set of semantic animations, and no
unresolved (magenta / missing) materials.

Usage:
    python -m pipeline.validate --character dunmer-combat
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

from .models import resolve_character


def read_gltf_json(glb: Path) -> dict:
    data = glb.read_bytes()
    magic, version, _length = struct.unpack("<4sII", data[:12])
    if magic != b"glTF":
        raise ValueError(f"{glb} is not a GLB")
    offset = 12
    chunk_len, chunk_type = struct.unpack("<II", data[offset:offset + 8])
    if chunk_type != 0x4E4F534A:  # 'JSON'
        raise ValueError("first chunk is not JSON")
    return json.loads(data[offset + 8: offset + 8 + chunk_len])


def validate(character_id: str) -> bool:
    plan = resolve_character(character_id)
    glb = plan.output_glb
    if not glb.exists():
        print(f"FAIL: GLB not found at {glb}")
        return False

    gltf = read_gltf_json(glb)
    ok = True

    def check(cond: bool, label: str) -> None:
        nonlocal ok
        print(("  PASS " if cond else "  FAIL ") + label)
        ok = ok and cond

    skins = gltf.get("skins", [])
    check(len(skins) == 1, f"exactly one skin/armature (got {len(skins)})")

    meshes = gltf.get("meshes", [])
    check(len(meshes) >= 6, f"character meshes present (got {len(meshes)})")

    joints = len(skins[0]["joints"]) if skins else 0
    check(joints == plan.expected_bones, f"skin joints == {plan.expected_bones} (got {joints})")

    anim_names = {a.get("name") for a in gltf.get("animations", [])}
    expected = {s.semantic for s in plan.animations}
    missing = sorted(expected - anim_names)
    extra = sorted(anim_names - expected)
    check(not missing, f"all {len(expected)} semantic animations present"
          + (f"; MISSING {missing}" if missing else ""))
    if extra:
        print(f"  note: extra animations in GLB: {extra}")

    # Material soundness: every material resolves a base colour (texture or factor).
    images = gltf.get("images", [])
    textures = gltf.get("textures", [])
    bad_materials = []
    for mat in gltf.get("materials", []):
        pbr = mat.get("pbrMetallicRoughness", {})
        has_texture = "baseColorTexture" in pbr
        has_factor = "baseColorFactor" in pbr
        if not has_texture and not has_factor:
            bad_materials.append(mat.get("name", "?"))
    check(not bad_materials, "all materials have a base colour"
          + (f"; BAD {bad_materials}" if bad_materials else ""))
    check(len(images) > 0, f"embedded textures present (got {len(images)} images, {len(textures)} textures)")

    # No external image URIs (must be embedded for a portable GLB).
    external = [img.get("uri") for img in images if img.get("uri") and not img["uri"].startswith("data:")]
    check(not external, "all images embedded (no external URIs)"
          + (f"; EXTERNAL {external}" if external else ""))

    print(f"\n{'OK' if ok else 'FAILED'}: {glb.name} "
          f"({joints} joints, {len(meshes)} meshes, {len(anim_names)} anims, {len(images)} textures)")
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a built character GLB.")
    parser.add_argument("--character", default="dunmer-combat")
    args = parser.parse_args()
    if not validate(args.character):
        sys.exit(1)


if __name__ == "__main__":
    main()
