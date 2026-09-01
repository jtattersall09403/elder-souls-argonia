"""Render a candidate contact sheet from a built kit, for choosing species.

    python3 -m pipeline.render_sheet --kit probe-tall-tropical \
        --assets a,b,c --out output/sheets/tall-tropical

Numbers (height, crown width, triangles) come free in the kit manifest; this
covers the half a manifest cannot: what the mesh actually looks like. One PNG
per asset with a 1.8 m human bar for scale, plus `sheet.md` listing every
frame with its measurements so the two can be read together.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TOOLCHAIN = json.loads((Path(__file__).parent / "config" / "toolchain.json").read_text())
SCRIPT = Path(__file__).parent / "blender" / "render_kit_sheet.py"


def _expand(p: str) -> Path:
    return Path(os.path.expanduser(p))


def to_windows(path: Path) -> str:
    return "Z:" + str(path.resolve()).replace("/", "\\")


def render(kit_id: str, assets: list[str], out_dir: Path, res: int) -> None:
    manifest = REPO_ROOT / "tooling/asset-pipeline/output/kits" / f"{kit_id}.kit.json"
    glb = manifest.with_suffix("").with_suffix(".glb")
    if not manifest.exists():
        raise SystemExit(f"{manifest} missing — build the kit first")
    summary = json.loads(manifest.read_text())
    by_id = {a["id"]: a for a in summary["assets"]}
    assets = assets or sorted(by_id)
    unknown = [a for a in assets if a not in by_id]
    if unknown:
        raise SystemExit(f"not in {kit_id}: {unknown}")

    out_dir.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env["WINEPREFIX"] = str(_expand(TOOLCHAIN["winePrefix"]))
    env["WINEDEBUG"] = "-all"
    env["KIT_GLB"] = to_windows(glb)
    env["OUTDIR"] = to_windows(out_dir)
    env["ASSETS"] = ",".join(assets)
    env["RES"] = str(res)
    cmd = [str(_expand(TOOLCHAIN["wine"])), str(_expand(TOOLCHAIN["blender"])),
           "--background", "--python", to_windows(SCRIPT)]
    proc = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=3600)
    for line in proc.stdout.splitlines():
        if line.startswith("[sheet]"):
            print("   " + line)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout[-4000:] + proc.stderr[-4000:])
        raise SystemExit("render failed")

    lines = [f"# {kit_id} candidate sheet", "",
             "| frame | height m | crown m | crown:height | triangles |",
             "|---|---|---|---|---|"]
    for asset_id in assets:
        a = by_id[asset_id]
        x, y, z = a["sizeM"]
        crown = max(x, y)
        safe = asset_id.replace(":", "__").replace("/", "_").replace(" ", "_")
        lines.append(f"| `{safe}.png` — {asset_id} | {z:.1f} | {crown:.1f} | "
                     f"{crown / z if z else 0:.2f} | {a['triangles']} |")
    (out_dir / "sheet.md").write_text("\n".join(lines) + "\n")
    print(f"[sheet] {len(assets)} frames -> {out_dir}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--kit", required=True)
    ap.add_argument("--assets", default="", help="comma-separated ids; default all")
    ap.add_argument("--out", required=True)
    ap.add_argument("--res", type=int, default=512)
    args = ap.parse_args()
    render(args.kit, [a for a in args.assets.split(",") if a],
           Path(args.out) if Path(args.out).is_absolute() else REPO_ROOT / args.out,
           args.res)


if __name__ == "__main__":
    main()
