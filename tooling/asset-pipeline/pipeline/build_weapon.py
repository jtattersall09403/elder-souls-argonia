"""Host-side builder for a static Skyrim weapon GLB.

Extracts the weapon NIF (Meshes.bsa) and its referenced textures (Textures.bsa)
into a local data-root, then hands a resolved plan to headless Wine/Blender.
Bethesda source bytes stay local. The pipeline output is ignored here; the game
may version the copied runtime GLB under its explicit deployment authorization.

Usage:
    python -m pipeline.build_weapon --weapon steel-sword
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
from .build import (
    BUILD_DIR,
    TOOLCHAIN,
    _expand,
    _referenced_textures,
    to_windows,
)
from .models import ROOT

WEAPON_SCRIPT = Path(__file__).resolve().parent / "blender" / "build_weapon.py"
CONFIG = Path(__file__).resolve().parent / "config" / "weapons"


def build(weapon_id: str) -> dict:
    cfg = json.loads((CONFIG / f"{weapon_id}.json").read_text())
    work = BUILD_DIR / "weapons" / weapon_id
    data_root = work / "data-root"
    if data_root.exists():
        shutil.rmtree(data_root)
    data_root.mkdir(parents=True, exist_ok=True)

    mesh_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / "Skyrim - Meshes.bsa")
    tex_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["textureBsa"])

    nif_rel = cfg["nif"]
    mesh_bsa.extract([nif_rel], data_root)
    nif_path = data_root / nif_rel

    wanted = _referenced_textures(nif_path)
    filled, absent = [], []
    for tex in sorted(wanted):
        if tex_bsa.contains(tex):
            tex_bsa.extract([tex], data_root)
            filled.append(tex)
        else:
            absent.append(tex)
    print(f"[weapon] nif={nif_rel} textures filled={len(filled)} unresolved={len(absent)}")

    output_glb = (ROOT / cfg["output"]).resolve()
    summary_json = work / "summary.json"
    plan = {
        "nif": to_windows(nif_path),
        "drop": cfg.get("dropShapesContaining", []),
        "target_length": cfg.get("targetLengthMeters", 0.98),
        "output_glb": to_windows(output_glb),
        "summary_json": to_windows(summary_json),
    }
    plan_path = work / "weapon-plan.json"
    plan_path.write_text(json.dumps(plan, indent=2))

    env = dict(os.environ)
    env["WINEPREFIX"] = str(_expand(TOOLCHAIN["winePrefix"]))
    env["WINEDEBUG"] = "-all"
    env["BUILD_PLAN"] = to_windows(plan_path)
    cmd = [
        str(_expand(TOOLCHAIN["wine"])),
        str(_expand(TOOLCHAIN["blender"])),
        "--background",
        "--python", to_windows(WEAPON_SCRIPT),
    ]
    proc = subprocess.run(cmd, env=env, capture_output=True, text=True,
                          timeout=TOOLCHAIN.get("buildTimeoutSeconds", 900))
    for line in proc.stdout.splitlines():
        if line.startswith("[weapon]") or line.startswith("SUMMARY"):
            print("   " + line)
    if proc.returncode != 0 or not summary_json.exists():
        sys.stderr.write(proc.stdout[-3000:] + proc.stderr[-3000:])
        raise RuntimeError("weapon build failed")
    summary = json.loads(summary_json.read_text())
    print(f"[weapon] GLB -> {output_glb} ({summary.get('scale')}x, meshes {summary.get('keptMeshes')})")
    return summary


def main() -> None:
    p = argparse.ArgumentParser(description="Build a static Skyrim weapon GLB.")
    p.add_argument("--weapon", default="steel-sword")
    args = p.parse_args()
    build(args.weapon)


if __name__ == "__main__":
    main()
