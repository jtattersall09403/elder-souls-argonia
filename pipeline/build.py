"""Host-side build orchestrator for a game-ready character GLB.

Runs on the Linux host (any Python 3.10+, no third-party deps) and:

  1. resolves the declarative character config into a flat BuildPlan;
  2. assembles a deterministic build data-root (curated race tree + every
     NIF-referenced texture filled from Skyrim - Textures.bsa, without
     overwriting the race's own overrides);
  3. extracts the manifest's animation HKX from Skyrim - Animations.bsa;
  4. hands a resolved, path-translated plan to headless Wine/Blender + PyNifly;
  5. validates the emitted GLB and writes the runtime animation manifest.

Bethesda source data never leaves the local machine: the data-root and the
emitted GLB live under gitignored build/ and output/ paths.

Usage:
    python -m pipeline.build --character dunmer-combat
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from .bsa import BSAArchive
from .models import ROOT, BuildPlan, resolve_character

BLENDER_SCRIPT = Path(__file__).resolve().parent / "blender" / "build_character.py"
TOOLCHAIN = json.loads((Path(__file__).resolve().parent / "config" / "toolchain.json").read_text())
BUILD_DIR = ROOT / "build"

_TEXTURE_REF = re.compile(rb"textures\\[^\x00]{3,160}?\.dds", re.IGNORECASE)


def _expand(path: str) -> Path:
    return Path(os.path.expanduser(path))


def to_windows(path: Path) -> str:
    """Translate an absolute host path to its Wine Z: drive equivalent."""
    return "Z:" + str(path).replace("/", "\\")


# ---------------------------------------------------------------------------
# Data-root assembly
# ---------------------------------------------------------------------------

def _referenced_textures(nif: Path) -> set[str]:
    data = nif.read_bytes()
    return {
        m.group(0).decode("latin1").replace("\\", "/").lower()
        for m in _TEXTURE_REF.finditer(data)
    }


def assemble_data_root(plan: BuildPlan) -> Path:
    """Copy the curated race tree, then fill missing NIF textures from the BSA."""
    dest = BUILD_DIR / plan.character_id / "data-root"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(plan.data_root, dest)

    texture_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["textureBsa"])
    wanted: set[str] = set()
    for mesh in plan.meshes:
        wanted |= _referenced_textures(mesh.file)

    missing = [t for t in sorted(wanted) if not (dest / t).exists()]
    filled, absent = [], []
    for tex in missing:
        if texture_bsa.contains(tex):
            texture_bsa.extract([tex], dest)
            filled.append(tex)
        else:
            absent.append(tex)
    print(f"[data-root] textures referenced={len(wanted)} filled={len(filled)} "
          f"already-present={len(wanted) - len(missing)} unresolved={len(absent)}")
    for tex in absent:
        print(f"[data-root]   UNRESOLVED texture: {tex}")
    return dest


def assemble_animations(plan: BuildPlan) -> dict[str, Path]:
    """Return semantic -> host HKX path, extracting from the BSA as needed."""
    anim_dir = BUILD_DIR / plan.character_id / "anims"
    anim_dir.mkdir(parents=True, exist_ok=True)
    animation_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["animationBsa"])

    resolved: dict[str, Path] = {}
    for spec in plan.animations:
        override = plan.anim_local_overrides.get(spec.source)
        if override and Path(override).exists():
            resolved[spec.semantic] = Path(override)
            continue
        archive_path = f"{plan.anim_source_dir}/{spec.source}.hkx"
        dest = anim_dir / f"{spec.source}.hkx"
        if not dest.exists():
            if not animation_bsa.contains(archive_path):
                raise KeyError(f"{spec.semantic}: {archive_path} not in animation BSA")
            data = animation_bsa.read(archive_path)
            dest.write_bytes(data)
        resolved[spec.semantic] = dest
    print(f"[anims] resolved {len(resolved)} semantic animations")
    return resolved


# ---------------------------------------------------------------------------
# Blender invocation
# ---------------------------------------------------------------------------

def write_blender_plan(plan: BuildPlan, data_root: Path, anims: dict[str, Path]) -> Path:
    """Serialise a Windows-path plan the in-Blender script consumes verbatim."""
    plan_path = BUILD_DIR / plan.character_id / "blender-plan.json"
    payload = {
        "addon": TOOLCHAIN["addon"],
        "expected_bones": plan.expected_bones,
        "root_bone": plan.root_bone,
        "sockets": plan.sockets,
        "skeleton": to_windows(plan.skeleton),
        "rig_import": plan.rig_import,
        "data_root_win": to_windows(data_root),
        "meshes": [
            {"name": m.name,
             "file": to_windows(data_root / m.file.relative_to(plan.data_root))}
            for m in plan.meshes
        ],
        "mesh_import": plan.mesh_import,
        "morph": {**plan.morph, "tri": to_windows(Path(plan.morph["tri"]))},
        "material_overrides": [
            {**ov, "replaceWith": to_windows(data_root / ov["replaceWith"])}
            for ov in plan.material_overrides
        ],
        "animations": [
            {
                "semantic": s.semantic,
                "looping": s.looping,
                "root_motion": s.root_motion,
                "playback_rate": s.playback_rate,
                "hkx": to_windows(anims[s.semantic]),
            }
            for s in plan.animations
        ],
        "output_glb": to_windows(plan.output_glb),
        "summary_json": to_windows(BUILD_DIR / plan.character_id / "blender-summary.json"),
    }
    plan_path.write_text(json.dumps(payload, indent=2))
    return plan_path


def run_blender(plan_path: Path) -> dict:
    env = dict(os.environ)
    env["WINEPREFIX"] = str(_expand(TOOLCHAIN["winePrefix"]))
    env["WINEDEBUG"] = "-all"
    env["BUILD_PLAN"] = to_windows(plan_path)
    cmd = [
        str(_expand(TOOLCHAIN["wine"])),
        str(_expand(TOOLCHAIN["blender"])),
        "--background",
        "--python", to_windows(BLENDER_SCRIPT),
    ]
    print("[blender] launching headless build...")
    proc = subprocess.run(
        cmd, env=env, capture_output=True, text=True,
        timeout=TOOLCHAIN.get("buildTimeoutSeconds", 900),
    )
    for line in proc.stdout.splitlines():
        if line.startswith("[build]") or line.startswith("SUMMARY"):
            print("   " + line)
    summary_path = ROOT / "build" / (plan_path.parent.name) / "blender-summary.json"
    if proc.returncode != 0 or not summary_path.exists():
        sys.stderr.write(proc.stdout[-4000:])
        sys.stderr.write(proc.stderr[-4000:])
        raise RuntimeError("Blender build failed; see output above")
    return json.loads(summary_path.read_text())


# ---------------------------------------------------------------------------
# Runtime manifest
# ---------------------------------------------------------------------------

def write_runtime_manifest(plan: BuildPlan, summary: dict) -> None:
    durations = summary.get("durations", {})
    root_deltas = summary.get("rootMotionDeltas", {})
    # bbox is Blender Z-up; glTF is exported Y-up so the up-axis maps Z -> height.
    bbox = summary.get("bboxSize", [0, 0, 0])
    height = bbox[2] if len(bbox) == 3 and bbox[2] else 1.0
    recommended_scale = round(plan.target_height / height, 5) if height else 1.0
    manifest = {
        "character": plan.character_id,
        "source": "Skyrim vanilla (regenerated from source; not redistributed)",
        "rig": {
            "rootBone": plan.root_bone,
            "sockets": plan.sockets,
            "recommendedScale": recommended_scale,
            "targetHeightMeters": plan.target_height,
        },
        "animations": {
            s.semantic: {
                "looping": s.looping,
                "rootMotion": s.root_motion,
                "playbackRate": s.playback_rate,
                "sourceDuration": durations.get(s.semantic),
                "rootMotionDelta": root_deltas.get(s.semantic),
                "provenance": s.provenance,
            }
            for s in plan.animations
        },
    }
    plan.output_manifest.parent.mkdir(parents=True, exist_ok=True)
    plan.output_manifest.write_text(json.dumps(manifest, indent=2))
    print(f"[manifest] wrote {plan.output_manifest}")


def build(character_id: str) -> dict:
    plan = resolve_character(character_id)
    (BUILD_DIR / plan.character_id).mkdir(parents=True, exist_ok=True)
    data_root = assemble_data_root(plan)
    anims = assemble_animations(plan)
    plan_path = write_blender_plan(plan, data_root, anims)
    summary = run_blender(plan_path)
    write_runtime_manifest(plan, summary)
    print(f"[build] GLB -> {plan.output_glb}")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a game-ready character GLB from Skyrim source.")
    parser.add_argument("--character", default="dunmer-combat", help="character config id")
    args = parser.parse_args()
    build(args.character)


if __name__ == "__main__":
    main()
