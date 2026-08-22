"""Host-side batch builder for wearable armour.

Same shape as the arsenal builder — extract every declared NIF and its textures
into one data-root, hand a single plan to headless Wine/Blender — but the pieces
are skinned, so they are built against the production skeleton and exported with
it. Adding a piece is one entry in ``config/armour/<set>.json``.

Usage:
    python -m pipeline.build_armour
    python -m pipeline.build_armour --only steel-cuirass
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from .bsa import BSAArchive
from .build import BUILD_DIR, TOOLCHAIN, _expand, _referenced_textures, to_windows
from .models import CONFIG, ROOT

ARMOUR_SCRIPT = Path(__file__).resolve().parent / "blender" / "build_armour.py"


def resolve_set(set_id: str, only: list[str] | None) -> dict:
    config = json.loads((CONFIG / "armour" / f"{set_id}.json").read_text())
    slots = config["slots"]
    wanted = set(only or [])
    items, seen = [], set()
    for entry in config["items"]:
        item_id = entry["id"]
        if item_id in seen:
            raise ValueError(f"duplicate armour id: {item_id}")
        seen.add(item_id)
        if wanted and item_id not in wanted:
            continue
        if entry["slot"] not in slots:
            raise ValueError(f"{item_id}: unknown slot {entry['slot']}")
        items.append(dict(entry))
    missing = wanted - seen
    if missing:
        raise ValueError(f"unknown armour id(s): {sorted(missing)}")
    if not items:
        raise ValueError("no armour selected")
    return {"config": config, "items": items}


def assemble_data_root(set_id: str, items: list[dict]) -> Path:
    work = BUILD_DIR / "armour" / set_id
    data_root = work / "data-root"
    if data_root.exists():
        shutil.rmtree(data_root)
    data_root.mkdir(parents=True, exist_ok=True)

    mesh_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / "Skyrim - Meshes.bsa")
    texture_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["textureBsa"])

    wanted: set[str] = set()
    for item in items:
        if not mesh_bsa.contains(item["nif"]):
            raise KeyError(f"{item['id']}: {item['nif']} not in the mesh archive")
        mesh_bsa.extract([item["nif"]], data_root)
        item["nif_path"] = data_root / item["nif"]
        wanted |= _referenced_textures(item["nif_path"])

    filled, absent = [], []
    for texture in sorted(wanted):
        if texture_bsa.contains(texture):
            texture_bsa.extract([texture], data_root)
            filled.append(texture)
        else:
            absent.append(texture)
    print(f"[armour] pieces={len(items)} textures referenced={len(wanted)} "
          f"filled={len(filled)} unresolved={len(absent)}")
    for texture in absent:
        print(f"[armour]   UNRESOLVED texture: {texture}")
    return work


def build(set_id: str = "armour", only: list[str] | None = None,
          render_icons: bool = True) -> dict:
    resolved = resolve_set(set_id, only)
    config, items = resolved["config"], resolved["items"]
    work = assemble_data_root(set_id, items)

    rig = json.loads((CONFIG / "rigs" / f"{config['rig']}.json").read_text())
    body = json.loads((CONFIG / "bodies" / f"{config['body']}.json").read_text())
    output_dir = (ROOT / config["outputDir"]).resolve()
    icon_dir = (ROOT / config["iconDir"]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    icon_dir.mkdir(parents=True, exist_ok=True)

    summary_json = work / "summary.json"
    summary_json.unlink(missing_ok=True)
    plan_path = work / "armour-plan.json"
    plan_path.write_text(json.dumps({
        "addon": TOOLCHAIN["addon"],
        "skeleton": to_windows((ROOT / rig["skeleton"]).resolve()),
        "rig_import": rig["import"],
        "mesh_import": body["import"],
        "icon_size": config.get("iconSizePixels", 160),
        # Icons are the slow half of the build (path-traced on CPU) and only
        # change when the art does. A geometry-only rebuild can keep them.
        "render_icons": render_icons,
        "items": [{
            "id": item["id"],
            "nif": to_windows(item["nif_path"]),
            "output_glb": to_windows(output_dir / f"{item['id']}.glb"),
            "icon_png": to_windows(icon_dir / f"{item['id']}.png"),
        } for item in items],
        "summary_json": to_windows(summary_json),
    }, indent=2))

    env = dict(os.environ)
    env["WINEPREFIX"] = str(_expand(TOOLCHAIN["winePrefix"]))
    env["WINEDEBUG"] = "-all"
    env["BUILD_PLAN"] = to_windows(plan_path)
    print(f"[armour] launching headless build for {len(items)} piece(s)...")
    proc = subprocess.run(
        [str(_expand(TOOLCHAIN["wine"])), str(_expand(TOOLCHAIN["blender"])),
         "--background", "--python", to_windows(ARMOUR_SCRIPT)],
        env=env, capture_output=True, text=True,
        timeout=TOOLCHAIN.get("buildTimeoutSeconds", 900) + 30 * len(items),
    )
    completed = any(line.strip() == "SUMMARY_WRITTEN" for line in proc.stdout.splitlines())
    for line in proc.stdout.splitlines():
        if line.startswith("[armour]"):
            print("   " + line)
    if not completed or not summary_json.exists():
        sys.stderr.write(proc.stdout[-4000:] + proc.stderr[-4000:])
        raise RuntimeError("armour batch build failed")

    summary = json.loads(summary_json.read_text())
    built = summary.get("items", {})
    missing = [item["id"] for item in items if item["id"] not in built]
    if missing:
        raise RuntimeError(f"pieces missing from the build: {missing}")

    manifest = {
        "set": set_id,
        "slots": config["slots"],
        "items": {
            item["id"]: {
                "slot": item["slot"],
                "material": item["material"],
                "asset": f"{Path(config['outputDir']).name}/{item['id']}.glb",
                "icon": f"{Path(config['iconDir']).name}/{item['id']}.png",
                # Read out of the NIF, never declared: this is what the game
                # hides under the piece.
                "coversBipedSlots": built[item["id"]]["coversBipedSlots"],
                "sizeMeters": built[item["id"]]["sizeMeters"],
            }
            for item in items
        },
    }
    manifest_path = (ROOT / config["manifestOutput"]).resolve()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"[armour] manifest -> {manifest_path}")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Build wearable armour.")
    parser.add_argument("--set", default="armour")
    parser.add_argument("--only", nargs="*", default=None)
    parser.add_argument("--no-icons", action="store_true",
                        help="reuse the existing icons and rebuild geometry only")
    args = parser.parse_args()
    build(args.set, args.only, render_icons=not args.no_icons)


if __name__ == "__main__":
    main()
