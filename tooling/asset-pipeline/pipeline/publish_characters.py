"""Publish the character-assets GLBs (race bodies, first-person bow arms and
the equipment sets: weapons, armour, arrows, quivers, bow rigs, clutter,
lights) to `packages/character-assets/files/` compressed the way the kits
ship: KTX2 textures and meshopt geometry through `kit_compress.compress`.

    python3 -m pipeline.publish_characters                    # every build present in output/
    python3 -m pipeline.publish_characters --folders weapons  # one equipment folder
    python3 -m pipeline.publish_characters --check            # verify the shipped set only

The raw Blender export under `output/` stays the measurement product
(support envelopes, hurtbox, neck-seam measure read its plain accessors);
what ships is the compressed copy, so textures stay block-compressed in VRAM
instead of RGBA8 and the browser decodes no JPEG/PNG. Colour maps go ETC1S,
normal and attribute maps UASTC: all-UASTC made the 40 body GLBs 146 MB
against 64 MB of JPEG/PNG (argonian-male 3.40 -> 12.05 MB); this policy
ships it at 3.23 MB. The shipped roster
(`packages/game-core/src/actors/generated/races.json`) and the equipment
manifests that record a hash (armour, lights) record the sha256 of the
SHIPPED file, which `packages/character-assets/verify.mjs` checks.
`build_races`, `build_first_person`, `build_weapons`, `build_armour` and
`build_bow_rigs` call `publish()` as their last step; `--check` runs in the
pipeline tests (`test_publish_characters.py`).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

from . import kit_compress

REPO_ROOT = kit_compress.REPO_ROOT
OUTPUT = REPO_ROOT / "tooling/asset-pipeline/output"
FILES = REPO_ROOT / "packages/character-assets/files"
SHIPPED_ROSTER = REPO_ROOT / "packages/game-core/src/actors/generated/races.json"
POLICY = {**kit_compress.DEFAULT_POLICY, "color": "etc1s", "enabled": True}
# Equipment folders: output/<folder>/*.glb ships as files/<folder>/*.glb.
EQUIPMENT = ("weapons", "armour", "arrows", "quivers", "bow-rigs", "clutter", "lights")
# Generated equipment manifests that record the shipped GLB's sha256.
HASHED_MANIFESTS = REPO_ROOT / "packages/game-core/src/equipment/generated"


def sources(folders: tuple[str, ...] | None = None) -> list[tuple[Path, Path]]:
    """(raw, shipped) pairs: every race body, first-person arm and equipment
    GLB in output/ (or only the named equipment folders)."""
    pairs = []
    if folders is None:
        pairs += [(raw, FILES / "races" / raw.name) for raw in sorted((OUTPUT / "races").glob("*.glb"))]
        pairs += [(raw, FILES / raw.name) for raw in sorted(OUTPUT.glob("rig-skyrim-first-person.bow.*.glb"))]
    for folder in folders or EQUIPMENT:
        pairs += [(raw, FILES / folder / raw.name) for raw in sorted((OUTPUT / folder).glob("*.glb"))]
    return pairs


def shipped_glbs() -> list[Path]:
    """Every GLB that ships from character-assets, raw build present or not."""
    return sorted(FILES.rglob("*.glb"))


def structure(glb: Path) -> dict:
    """Names the runtime binds by: nodes, skins and their joints, morph targets,
    materials. gltfpack must keep every one of them (-kn -km -ke)."""
    gltf = kit_compress.read_gltf_json(glb)
    nodes = gltf.get("nodes", [])
    named = lambda i: nodes[i].get("name")
    return {
        "nodes": sorted(n.get("name") or "" for n in nodes if n.get("name")),
        "skins": sorted(tuple(named(j) for j in s["joints"]) for s in gltf.get("skins", [])),
        "morphs": sorted(
            (named(i), tuple(gltf["meshes"][n["mesh"]].get("extras", {}).get("targetNames", [])),
             tuple(len(p.get("targets", [])) for p in gltf["meshes"][n["mesh"]]["primitives"]))
            for i, n in enumerate(nodes) if "mesh" in n),
        "materials": sorted(m.get("name", "") for m in gltf.get("materials", [])),
        # gltfpack drops alphaCutoff when it is the glTF default (0.5).
        "alpha": sorted((m.get("name", ""), m.get("alphaMode", "OPAQUE"),
                         m.get("alphaCutoff", 0.5) if m.get("alphaMode") == "MASK" else None)
                        for m in gltf.get("materials", [])),
    }


def structure_problems(raw: Path, shipped: Path) -> list[str]:
    a, b = structure(raw), structure(shipped)
    return [f"{shipped.name}: {key} differ after gltfpack" for key in a if a[key] != b[key]]


def publish(names: set[str] | None = None, folders: tuple[str, ...] | None = None) -> list[dict]:
    rows = []
    for raw, shipped in sources(folders):
        if names and raw.stem not in names:
            continue
        record = kit_compress.compress(raw, shipped, POLICY)
        problems = structure_problems(raw, shipped)
        if problems:
            raise RuntimeError("; ".join(problems))
        rows.append({"file": shipped.relative_to(FILES).as_posix(), "before": record["bytesBefore"],
                     "after": record["bytesAfter"], "images": record["images"], "sha256": record["sha256"]})
        print(f"[characters] {rows[-1]['file']}: {record['bytesBefore']} -> {record['bytesAfter']} B, "
              f"{record['images']} images, structure kept")
    write_roster_hashes()
    write_equipment_hashes()
    return rows


def _sha(asset: str) -> str:
    return hashlib.sha256((FILES / asset).read_bytes()).hexdigest()


def write_roster_hashes() -> None:
    """The shipped roster's sha256 per build is the shipped file's."""
    roster = json.loads(SHIPPED_ROSTER.read_text())
    for build in roster["builds"].values():
        build["sha256"] = _sha(build["asset"])
    SHIPPED_ROSTER.write_text(json.dumps(roster, indent=2) + "\n")


def write_equipment_hashes() -> None:
    """Armour (`sha256[sex]`) and lights (`sha256`) record the shipped file's hash."""
    for name in ("armour.items.json", "lights.items.json"):
        path = HASHED_MANIFESTS / name
        manifest = json.loads(path.read_text())
        for item in manifest["items"].values():
            if isinstance(item.get("assets"), dict):
                item["sha256"] = {sex: _sha(asset) for sex, asset in item["assets"].items()}
            elif "sha256" in item:
                item["sha256"] = _sha(item["asset"])
        path.write_text(json.dumps(manifest, indent=2) + "\n")


def uncompressed(glbs: list[Path]) -> list[str]:
    """Shipped GLBs whose images are not KTX2 or whose geometry is not meshopt."""
    problems = []
    for glb in glbs:
        facts = kit_compress.describe(glb)
        if facts["images"] and not facts["texturesCompressed"]:
            problems.append(f"{glb.relative_to(FILES)}: images ship as {facts['imageMimeTypes']}")
        elif not facts["meshesCompressed"] and facts["meshes"]:
            problems.append(f"{glb.relative_to(FILES)}: geometry is not meshopt-compressed")
    return problems


def check() -> list[str]:
    """Every shipped GLB is compressed (no raw build needed); where the raw
    build is present, gltfpack kept its structure."""
    problems = uncompressed(shipped_glbs())
    for raw, shipped in sources():
        if shipped.exists():
            problems += structure_problems(raw, shipped)
    return problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", nargs="*", default=None, help="raw GLB stems")
    parser.add_argument("--folders", nargs="*", choices=EQUIPMENT, default=None,
                        help="publish only these equipment folders")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        problems = check()
        print("\n".join(problems) or "[characters] shipped set compressed, structure kept")
        raise SystemExit(1 if problems else 0)
    publish(set(args.only) if args.only else None, tuple(args.folders) if args.folders else None)


if __name__ == "__main__":
    main()
