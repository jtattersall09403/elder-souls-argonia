"""Judge a texture variant before the kit rebuild: before/after stills.

    python3 -m pipeline.render_variant --kit settlement-mud-v1 \
        --variant 'histtree:skyfall/sleeping tree overhaul/ancient-sleeping-tree-sick' \
        [--variant <companion variant> ...] [--companions companions.json] \
        [--ground-z -0.675] --out <dir>

Derives each named variant's textures from the kit's last build data root
(`build/kits/<kit>/data-root`, the base textures as the build landed them)
with the recipe in the kit config (`texture_variants`), then renders the
FIRST variant's base asset from the raw kit GLB twice per view, as built and
with the derived images swapped in (blender/render_variant_compare.py).
Companion variants (flowers) contribute their swaps too. Iterating a recipe
is seconds of derive plus one render, never a kit build.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from . import texture_variants
from .build import BUILD_DIR, TOOLCHAIN, _expand
from .build_kit import CONFIG, to_windows

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = Path(__file__).parent / "blender" / "render_variant_compare.py"
DEFAULT_VIEWS = [[35.0, 12.0], [215.0, 24.0], [300.0, 4.0, 0.55, 0.3]]


def derive_swaps(kit: dict, variant_ids: list[str], out: Path) -> tuple[dict, dict]:
    """({image stem: windows png}, {variant id: its entry})."""
    entries = {e["asset"]: e for e in kit["assets"]}
    data_root = BUILD_DIR / "kits" / kit["id"] / "data-root"
    swaps, chosen = {}, {}
    for variant in variant_ids:
        entry = entries.get(variant)
        if entry is None or not entry.get("variantOf"):
            raise SystemExit(f"{variant}: not a variant entry in {kit['id']}")
        chosen[variant] = entry
        for texture, recipe in sorted(entry["textureVariants"].items()):
            key = texture_variants.texture_key(texture)
            dst = out / "textures" / texture_variants.variant_path(key, recipe)
            texture_variants.derive(data_root / key, dst, recipe, seed=key)
            swaps[Path(key).stem] = to_windows(dst)
    return swaps, chosen


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--kit", required=True)
    ap.add_argument("--variant", action="append", required=True)
    ap.add_argument("--companions", type=Path, default=None,
                    help="JSON list of {id, atM, scale, keepInVariant}")
    ap.add_argument("--ground-z", type=float, default=0.0,
                    help="ground line in the base's frame, metres above the pivot")
    ap.add_argument("--res", type=int, default=640)
    ap.add_argument("--samples", type=int, default=24)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    kit = json.loads((CONFIG / f"{args.kit}.json").read_text())
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    swaps, chosen = derive_swaps(kit, args.variant, out)
    plan = {"base": chosen[args.variant[0]]["variantOf"], "views": DEFAULT_VIEWS,
            "res": args.res, "samples": args.samples, "swaps": swaps,
            "groundZ": args.ground_z,
            "companions": json.loads(args.companions.read_text()) if args.companions else []}
    glb = REPO_ROOT / "tooling/asset-pipeline/output/kits" / f"{args.kit}.glb"
    env = dict(os.environ)
    env.update({"WINEPREFIX": str(_expand(TOOLCHAIN["winePrefix"])), "WINEDEBUG": "-all",
                "KIT_GLB": to_windows(glb), "OUTDIR": to_windows(out),
                "PLAN": json.dumps(plan)})
    cmd = [str(_expand(TOOLCHAIN["wine"])), str(_expand(TOOLCHAIN["blender"])),
           "--background", "--python", to_windows(SCRIPT)]
    proc = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=3600)
    for line in proc.stdout.splitlines():
        if line.startswith("[variant]"):
            print("   " + line)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout[-4000:] + proc.stderr[-4000:])
        raise SystemExit("render failed")


if __name__ == "__main__":
    main()
