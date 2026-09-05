"""Host-side batch builder for RIGGED bows (skin + the bow's own draw clips).

Vanilla bows are skinned to a seven-bone bow skeleton and animated by their own
clips (`meshes/weapons/bow/animations/bow_*.hkx` on `meshes/weapons/bow/
character assets/skeleton.hkx`, both in Skyrim - Animations.bsa). The static
arsenal build flattens that; this one keeps it, so a drawn bow bends and its
string comes back to the hand. Items are the arsenal's bows; the output is one
GLB per bow under output/bow-rigs plus a manifest with the clip durations.

Usage:
    python -m pipeline.build_bow_rigs                 # every bow in the arsenal
    python -m pipeline.build_bow_rigs --only iron-longbow
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from .bsa import BSAArchive
from .build import BUILD_DIR, TOOLCHAIN, _expand, to_windows
from .build_weapons import assemble_data_root, resolve_set
from .models import ROOT

SCRIPT = Path(__file__).resolve().parent / "blender" / "build_bow_rigs.py"
CONFIG = Path(__file__).resolve().parent / "config"

BOW_CLASSES = {"shortbow", "longbow", "warbow"}
BOW_SKELETON = "meshes/weapons/bow/character assets/skeleton.hkx"
#: Semantic clip name -> archive path. The runtime scrubs DRAW by draw fraction
#: and plays RELEASE once; DRAWN is the held pose, IDLE the rest pose.
BOW_CLIPS = {
    "BOW_RIG_DRAW": "meshes/weapons/bow/animations/bow_drawlight.hkx",
    "BOW_RIG_DRAW_HEAVY": "meshes/weapons/bow/animations/bow_drawheavy.hkx",
    "BOW_RIG_DRAWN": "meshes/weapons/bow/animations/bow_idledrawn.hkx",
    "BOW_RIG_RELEASE": "meshes/weapons/bow/animations/bow_release.hkx",
}


def glb_position_extents(path: Path) -> list[float]:
    """Union of every mesh primitive's POSITION min/max, per axis (x, y, z)."""
    data = path.read_bytes()
    json_length = int.from_bytes(data[12:16], "little")
    doc = json.loads(data[20:20 + json_length])
    low = [float("inf")] * 3
    high = [float("-inf")] * 3
    for mesh in doc.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            accessor = doc["accessors"][primitive["attributes"]["POSITION"]]
            for axis in range(3):
                low[axis] = min(low[axis], accessor["min"][axis])
                high[axis] = max(high[axis], accessor["max"][axis])
    return [high[axis] - low[axis] for axis in range(3)]


def build(only: list[str] | None = None) -> dict:
    resolved = resolve_set("arsenal", only)
    config = resolved["config"]
    items = [item for item in resolved["items"] if item["itemClass"] in BOW_CLASSES]
    if not items:
        raise ValueError("no bows selected")
    work = assemble_data_root("bow-rigs", items)

    anim_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["animationBsa"])
    anim_root = work / "animations"
    anim_root.mkdir(parents=True, exist_ok=True)
    for path in [BOW_SKELETON, *BOW_CLIPS.values()]:
        if not anim_bsa.contains(path):
            raise KeyError(f"{path} not in the animation archive")
        anim_bsa.extract([path], anim_root)

    rig = json.loads((CONFIG / "rigs" / "skyrim-humanoid.json").read_text())
    body = json.loads((CONFIG / "bodies" / "male.json").read_text())
    output_dir = (ROOT / "output" / "bow-rigs").resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_json = work / "summary.json"
    summary_json.unlink(missing_ok=True)
    plan = {
        "addon": TOOLCHAIN["addon"],
        "skeleton": to_windows(anim_root / BOW_SKELETON),
        "rig_import": rig["import"],
        "mesh_import": body["import"],
        "clips": {semantic: to_windows(anim_root / path) for semantic, path in BOW_CLIPS.items()},
        "drop": config.get("dropShapesContaining", []),
        "items": [{
            "id": item["id"],
            "nif": to_windows(item["nif_path"]),
            "target_length": item["target_length"],
            "output_glb": to_windows(output_dir / f"{item['id']}.glb"),
        } for item in items],
        "summary_json": to_windows(summary_json),
    }
    plan_path = work / "bow-rigs-plan.json"
    plan_path.write_text(json.dumps(plan, indent=2))

    env = dict(os.environ)
    env["WINEPREFIX"] = str(_expand(TOOLCHAIN["winePrefix"]))
    env["WINEDEBUG"] = "-all"
    env["BUILD_PLAN"] = to_windows(plan_path)
    print(f"[bow-rigs] launching headless build for {len(items)} bow(s)...")
    proc = subprocess.run(
        [str(_expand(TOOLCHAIN["wine"])), str(_expand(TOOLCHAIN["blender"])),
         "--background", "--python", to_windows(SCRIPT)],
        env=env, capture_output=True, text=True,
        timeout=TOOLCHAIN.get("buildTimeoutSeconds", 900) + 45 * len(items),
    )
    completed = any(line.strip() == "SUMMARY_WRITTEN" for line in proc.stdout.splitlines())
    for line in proc.stdout.splitlines():
        if line.startswith("[bow-rigs]"):
            print("   " + line)
    if not completed or not summary_json.exists():
        sys.stderr.write(proc.stdout[-6000:] + proc.stderr[-4000:])
        raise RuntimeError("bow rig batch build failed")
    summary = json.loads(summary_json.read_text())
    for warning in summary.get("warnings", []):
        print(f"[bow-rigs] WARNING {warning}")
    built = summary.get("items", {})
    missing = [item["id"] for item in items if item["id"] not in built]
    if missing:
        raise RuntimeError(f"bows missing from the build: {missing}")

    # The runtime scale is measured on the exported GLB itself: a skinned mesh
    # renders where its joints put it, which at rest is its own POSITION
    # accessor, whatever units Blender and the exporter settled on between them.
    for item in items:
        extents = glb_position_extents(output_dir / f"{item['id']}.glb")
        longest = max(extents)
        scale = item["target_length"] / longest if longest else 1.0
        built[item["id"]]["scale"] = round(scale, 6)
        built[item["id"]]["sizeMeters"] = [round(e * scale, 5) for e in extents]

    manifest_path = (ROOT / "output" / "bow-rigs.items.json").resolve()
    manifest = {"set": "bow-rigs", "clips": list(BOW_CLIPS), "items": {}}
    if only and manifest_path.exists():
        manifest["items"] = dict(json.loads(manifest_path.read_text()).get("items", {}))
    for item in items:
        manifest["items"][item["id"]] = {
            "asset": f"bow-rigs/{item['id']}.glb",
            "scale": built[item["id"]]["scale"],
            "sizeMeters": built[item["id"]]["sizeMeters"],
            "clipDurations": built[item["id"]]["clipDurations"],
            "drawOnsets": built[item["id"]]["drawOnsets"],
        }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"[bow-rigs] manifest -> {manifest_path}")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Build rigged bows with their draw clips.")
    parser.add_argument("--only", nargs="*", default=None)
    args = parser.parse_args()
    build(args.only)


if __name__ == "__main__":
    main()
