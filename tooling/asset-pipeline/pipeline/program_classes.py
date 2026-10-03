"""Bake the distinct shader-program classes of every published kit part.

The studio links one program per distinct (material, vertex layout) the kit
draws; linked only when a part's meshes arrive, the last links landed 3.3 s
after the last mesh fetch (perf10 perf-diag23 Q2). This step reads ONLY the
glTF JSON chunk of each published part (kit_compress.published_gltf; no mesh
or texture is decoded) and writes `public/kits/program-classes.json`: one row
per distinct program-deciding descriptor, sorted, deterministic. The runtime
(packages/game-core/src/settlement/kitProgramWarm.ts) builds each row's
material through the same GLTFLoader material factory and the same
settlement preparation, and links it at boot, before any part arrives.

What decides a program, and so what a row carries: the glTF alpha mode and
side, which texture slots are present (and their UV set), the material
extensions (the loader picks the material class from them), the material
extras the runtime reads (`RUNTIME_EXTRAS`), and the primitive's vertex
layout (COLOR_0 width: vertex colours and vertex alpha; TEXCOORD_n; normals;
tangents). Values that are uniforms (factors, cutoff, gain) are not read.

Run: `python3 -m pipeline.program_classes [--check]`. `placement_metadata
--refresh-built-manifests` re-bakes it after every refresh.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .kit_compress import PUBLIC_KITS, parts_index_path, published_gltf

SCHEMA_VERSION = 1
OUTPUT_NAME = "program-classes.json"
# Material extras a runtime material path reads (settlement/materials.ts:
# decal, additive, water; the env-map patch: esEnv). Anything else in extras
# is NIF provenance or a uniform value and never changes a program.
RUNTIME_EXTRAS = ("additive", "decal", "esEnv", "water")
TEXTURE_SLOTS = (
    ("baseColorTexture", "map"),
    ("metallicRoughnessTexture", "metalnessMap"),
    ("normalTexture", "normalMap"),
    ("occlusionTexture", "aoMap"),
    ("emissiveTexture", "emissiveMap"),
)
# Kits the vegetation renderer draws with its own instanced materials
# (buildFloraKit, impostors), never the settlement path.
VEGETATION_PREFIXES = ("flora-", "groundcover-")
_COLOR_WIDTH = {"VEC3": 3, "VEC4": 4}


def output_path(public_dir: Path | None = None) -> Path:
    return (public_dir or PUBLIC_KITS) / OUTPUT_NAME


def family_of(kit_id: str) -> str:
    return "vegetation" if kit_id.startswith(VEGETATION_PREFIXES) else "kit"


def _slots(material: dict) -> list[str]:
    pbr = material.get("pbrMetallicRoughness", {})
    out = []
    for gltf_key, slot in TEXTURE_SLOTS:
        ref = pbr.get(gltf_key) if gltf_key in ("baseColorTexture", "metallicRoughnessTexture") \
            else material.get(gltf_key)
        if ref is None:
            continue
        uv = ref.get("texCoord", 0)
        out.append(slot if uv == 0 else f"{slot}@{uv}")
    return out


def descriptor(material: dict, primitive: dict, accessors: list[dict], family: str) -> dict:
    """The program-deciding fields of one material drawn on one primitive."""
    attributes = primitive.get("attributes", {})
    colour = attributes.get("COLOR_0")
    extras = material.get("extras") or {}
    return {
        "family": family,
        "alphaMode": material.get("alphaMode", "OPAQUE"),
        "doubleSided": bool(material.get("doubleSided", False)),
        "slots": _slots(material),
        "extensions": sorted(material.get("extensions", {})),
        "extras": {k: extras[k] for k in RUNTIME_EXTRAS if k in extras},
        "color": _COLOR_WIDTH.get(accessors[colour]["type"], 0) if colour is not None else 0,
        "uvs": sorted(int(k.split("_")[1]) for k in attributes if k.startswith("TEXCOORD_")),
        "normal": "NORMAL" in attributes,
        "tangent": "TANGENT" in attributes,
    }


def bake(public_dir: Path | None = None) -> dict:
    root = public_dir or PUBLIC_KITS
    rows: dict[str, dict] = {}
    uses: dict[str, int] = {}
    for kit_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        if not parts_index_path(kit_dir.name, root).exists():
            continue
        gltf = published_gltf(kit_dir.name, root)
        family = family_of(kit_dir.name)
        for mesh in gltf["meshes"]:
            for primitive in mesh.get("primitives", []):
                index = primitive.get("material")
                material = gltf["materials"][index] if index is not None else {}
                row = descriptor(material, primitive, gltf["accessors"], family)
                key = json.dumps(row, sort_keys=True)
                rows[key] = row
                uses[key] = uses.get(key, 0) + 1
    classes = [dict(rows[k], uses=uses[k]) for k in sorted(rows)]
    return {"schemaVersion": SCHEMA_VERSION, "classes": classes}


def render(document: dict) -> str:
    return json.dumps(document, sort_keys=True, separators=(",", ":")) + "\n"


def write(public_dir: Path | None = None) -> Path:
    path = output_path(public_dir)
    path.write_text(render(bake(public_dir)), encoding="utf-8")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--check", action="store_true", help="exit 1 when the published file is stale")
    parser.add_argument("--public-dir", type=Path, default=None)
    args = parser.parse_args(argv)
    text = render(bake(args.public_dir))
    path = output_path(args.public_dir)
    if args.check:
        fresh = path.exists() and path.read_text(encoding="utf-8") == text
        print(f"{path}: {'fresh' if fresh else 'STALE'}")
        return 0 if fresh else 1
    path.write_text(text, encoding="utf-8")
    print(f"wrote {path} ({len(json.loads(text)['classes'])} classes, {len(text.encode())} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
