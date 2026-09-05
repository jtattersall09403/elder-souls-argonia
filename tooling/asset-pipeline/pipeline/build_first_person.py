"""Host-side builder for the first-person bow rig (arms layer).

Vanilla Skyrim draws the player's own hands from a separate first-person
skeleton with its own arm meshes and clip set (`meshes/actors/character/
_1stperson/...`). This builds that rig for BOWS ONLY (owner 2026-09-05): the
first-person skeleton, the male first-person body and hands, and the bow
clips listed below, into one GLB plus a manifest the runtime reads.

Usage:
    python -m pipeline.build_first_person
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from .bsa import BSAArchive
from .build import BUILD_DIR, TOOLCHAIN, _expand, _referenced_textures, to_windows
from .models import ROOT

SCRIPT = Path(__file__).resolve().parent / "blender" / "build_first_person.py"
CONFIG = Path(__file__).resolve().parent / "config"

SKELETON = ROOT / "skyrim-source/extracted/hkx-skeleton/skeletonfirst.hkx"
MESHES = [
    ("body", "meshes/actors/character/character assets/1stpersonmalebody_1.nif"),
    ("hands", "meshes/actors/character/character assets/1stpersonmalehands_1.nif"),
]
CLIP_DIR = "meshes/actors/character/_1stperson/animations"
#: Semantic -> first-person HKX. The runtime's bow states map onto these.
CLIPS = {
    "FP_BOW_IDLE": "bow_idleheld",
    "FP_BOW_DRAW": "bow_drawlight",
    "FP_BOW_DRAWN": "bow_idledrawn",
    "FP_BOW_RELEASE": "bow_release",
    "FP_BOW_EQUIP": "bow_equip",
    "FP_BOW_WALK": "bow_walkforward",
    "FP_BOW_WALK_BACK": "bow_walkbackward",
    "FP_BOW_STRAFE_LEFT": "bow_walkleft",
    "FP_BOW_STRAFE_RIGHT": "bow_walkright",
    "FP_BOW_RUN": "bow_runforward",
    "FP_BOWDRAWN_WALK": "bowdrawn_walkforward",
    "FP_BOWDRAWN_WALK_BACK": "bowdrawn_walkbackward",
    "FP_BOWDRAWN_STRAFE_LEFT": "bowdrawn_walkleft",
    "FP_BOWDRAWN_STRAFE_RIGHT": "bowdrawn_walkright",
}


def build() -> dict:
    work = BUILD_DIR / "first-person-bow"
    data_root = work / "data-root"
    data_root.mkdir(parents=True, exist_ok=True)
    mesh_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / "Skyrim - Meshes.bsa")
    texture_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["textureBsa"])
    anim_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["animationBsa"])
    if not SKELETON.exists():
        raise FileNotFoundError(SKELETON)

    wanted: set[str] = set()
    meshes = []
    for name, path in MESHES:
        if not mesh_bsa.contains(path):
            raise KeyError(f"{path} not in the mesh archive")
        mesh_bsa.extract([path], data_root)
        meshes.append({"name": name, "file": to_windows(data_root / path)})
        wanted |= _referenced_textures(data_root / path)
    unresolved = []
    for texture in sorted(wanted):
        if texture_bsa.contains(texture):
            texture_bsa.extract([texture], data_root)
        else:
            unresolved.append(texture)
    print(f"[first-person] textures referenced={len(wanted)} unresolved={len(unresolved)}")
    for texture in unresolved:
        print(f"[first-person]   UNRESOLVED texture: {texture}")

    clips = {}
    for semantic, source in CLIPS.items():
        archive_path = f"{CLIP_DIR}/{source}.hkx"
        if not anim_bsa.contains(archive_path):
            raise KeyError(f"{archive_path} not in the animation archive")
        anim_bsa.extract([archive_path], data_root)
        clips[semantic] = to_windows(data_root / archive_path)

    rig = json.loads((CONFIG / "rigs" / "skyrim-humanoid.json").read_text())
    body = json.loads((CONFIG / "bodies" / "male.json").read_text())
    output_glb = (ROOT / "output" / "rig-skyrim-first-person.bow.glb").resolve()
    summary_json = work / "summary.json"
    summary_json.unlink(missing_ok=True)
    plan = {
        "addon": TOOLCHAIN["addon"],
        "skeleton": to_windows(SKELETON),
        "rig_import": rig["import"],
        "mesh_import": body["import"],
        "meshes": meshes,
        "clips": clips,
        "output_glb": to_windows(output_glb),
        "summary_json": to_windows(summary_json),
    }
    plan_path = work / "plan.json"
    plan_path.write_text(json.dumps(plan, indent=2))

    env = dict(os.environ)
    env["WINEPREFIX"] = str(_expand(TOOLCHAIN["winePrefix"]))
    env["WINEDEBUG"] = "-all"
    env["BUILD_PLAN"] = to_windows(plan_path)
    print("[first-person] launching headless build...")
    proc = subprocess.run(
        [str(_expand(TOOLCHAIN["wine"])), str(_expand(TOOLCHAIN["blender"])),
         "--background", "--python", to_windows(SCRIPT)],
        env=env, capture_output=True, text=True,
        timeout=TOOLCHAIN.get("buildTimeoutSeconds", 900),
    )
    completed = any(line.strip() == "SUMMARY_WRITTEN" for line in proc.stdout.splitlines())
    for line in proc.stdout.splitlines():
        if line.startswith("[first-person]"):
            print("   " + line)
    if not completed or not summary_json.exists() or not output_glb.exists():
        sys.stderr.write(proc.stdout[-6000:] + proc.stderr[-4000:])
        raise RuntimeError("first-person build failed")
    summary = json.loads(summary_json.read_text())
    for warning in summary.get("warnings", []):
        print(f"[first-person] WARNING {warning}")

    manifest = {
        "schemaVersion": 1,
        "asset": "rig-skyrim-first-person.bow.glb",
        "source": "Skyrim vanilla _1stperson skeleton, 1stpersonmalebody/hands, bow_* first-person clips (locally regenerated authorized runtime build)",
        "bones": {"camera": "Camera1st [Cam1]", "weapon": "WEAPON", "shield": "SHIELD", "rightHand": "NPC R Hand [RHnd]", "leftHand": "NPC L Hand [LHnd]"},
        "restMeasures": summary.get("restMeasures", {}),
        "armatureScale": summary.get("armatureScale"),
        "clips": {semantic: {"source": source, "durationSeconds": summary["durations"].get(semantic)}
                  for semantic, source in CLIPS.items()},
    }
    manifest_path = (ROOT / "output" / "rig-skyrim-first-person.bow.json").resolve()
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"[first-person] GLB -> {output_glb}")
    print(f"[first-person] manifest -> {manifest_path}")
    return summary


if __name__ == "__main__":
    build()
