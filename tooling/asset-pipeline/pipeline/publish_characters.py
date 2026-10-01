"""Publish the character GLBs (race bodies, first-person bow arms) to
`packages/character-assets/files/` compressed the way the kits ship:
KTX2/UASTC textures and meshopt geometry through `kit_compress.compress`.

    python3 -m pipeline.publish_characters            # every build present in output/
    python3 -m pipeline.publish_characters --check    # verify the shipped set only

The raw Blender export under `output/` stays the measurement product
(support envelopes, hurtbox, neck-seam measure read its plain accessors);
what ships is the compressed copy, so the 2048² body textures stay
block-compressed in VRAM instead of RGBA8. Colour maps go ETC1S, normal and
attribute maps UASTC: all-UASTC made the 40 GLBs 146 MB against 64 MB of
JPEG/PNG (argonian-male 3.40 -> 12.05 MB); this policy ships it at 3.23 MB.
The shipped roster
(`packages/game-core/src/actors/generated/races.json`) records the sha256 of
the SHIPPED file, which `packages/character-assets/verify.mjs` checks.
`build_races` and `build_first_person` call `publish()` as their last step.
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


def sources() -> list[tuple[Path, Path]]:
    """(raw, shipped) pairs: every race body and first-person arm in output/."""
    pairs = [(raw, FILES / "races" / raw.name) for raw in sorted((OUTPUT / "races").glob("*.glb"))]
    pairs += [(raw, FILES / raw.name) for raw in sorted(OUTPUT.glob("rig-skyrim-first-person.bow.*.glb"))]
    return pairs


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


def publish(names: set[str] | None = None) -> list[dict]:
    rows = []
    for raw, shipped in sources():
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
    return rows


def write_roster_hashes() -> None:
    """The shipped roster's sha256 per build is the shipped file's."""
    roster = json.loads(SHIPPED_ROSTER.read_text())
    for build in roster["builds"].values():
        build["sha256"] = hashlib.sha256((FILES / build["asset"]).read_bytes()).hexdigest()
    SHIPPED_ROSTER.write_text(json.dumps(roster, indent=2) + "\n")


def check() -> list[str]:
    problems = []
    for raw, shipped in sources():
        facts = kit_compress.describe(shipped)
        if facts["images"] and not facts["texturesCompressed"]:
            problems.append(f"{shipped.name}: images ship as {facts['imageMimeTypes']}")
        problems += structure_problems(raw, shipped)
    return problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", nargs="*", default=None, help="raw GLB stems")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        problems = check()
        print("\n".join(problems) or "[characters] shipped set compressed, structure kept")
        raise SystemExit(1 if problems else 0)
    publish(set(args.only) if args.only else None)


if __name__ == "__main__":
    main()
