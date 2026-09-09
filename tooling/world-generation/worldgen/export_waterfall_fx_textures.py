"""Export the vanilla waterfall/whitewater FX textures to a runtime set.

The waterfall look is ~20 DDS files (audit:
docs/research/rendering/waterfall-assets-vault-audit.md §2.5). The kit
pipeline drops the gradient ramps and cannot express alpha blend (§6), so we
take the textures directly and author the material in our own renderer.

Route is the one build_ground_materials.py uses: pipeline.bsa.BSAArchive ->
PIL -> PNG in the studio's public assets (the format the studio already
loads). RGBA is preserved: these are alpha-blended FX layers.

Usage:
  python3 -m worldgen.export_waterfall_fx_textures [vault-Data-dir]
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
from pathlib import Path

from .vault import REPO_ROOT, asset_pipeline_root  # noqa: E402

sys.path.insert(0, str(REPO_ROOT / "tooling" / "asset-pipeline"))

from PIL import Image  # noqa: E402
from pipeline.bsa import BSAArchive  # noqa: E402

_VAULT_ROOT = asset_pipeline_root()
DEFAULT_DATA = _VAULT_ROOT / "skyrim-source" / "Data"
OUT_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "kits" / "waterfall-fx-textures"

MAX_TILE_PX = 512

# (bsa path, tiles, role, scroll note from audit §4)
TEXTURES = [
    ("textures/effects/fxfluidtile01.dds", True, "sheet-main",
     "thin sheets + body inner shell; V -0.857, U +0.030 (falls); -0.760 weir; -1.250 spray sheet"),
    ("textures/effects/fxfluidsub01.dds", True, "sheet-second",
     "second, slower sheet layer; pair with the main tile at a near-but-unequal rate"),
    ("textures/effects/fxwatertile01.dds", True, "body-inner-albedo",
     "lit inner shell; V -0.120, U +-0.036 wobble"),
    ("textures/effects/fxwatertile01_n.dds", True, "body-inner-normal",
     "normal for the lit inner shell; same -0.120 / +-0.036"),
    ("textures/effects/fxwatertile02_n.dds", True, "body-normal",
     "body normal; body unlit layers scroll -0.313 and -0.333"),
    ("textures/effects/fxwhitewater01.dds", True, "whitewater-main",
     "rapids/foam/cross-stream; rapids planes -0.150/-0.150/-0.500, big runs -0.300"),
    ("textures/effects/fxwhitewater02.dds", True, "whitewater-second",
     "rapids second layer; crest strip -0.500/-0.075/-0.150"),
    ("textures/effects/fxwhitewater.dds", True, "plunge-ring",
     "plunge-pool foam ring; ripples -0.667 x2, puffs +0.375 (counter-scroll)"),
    ("textures/effects/fxwaterfalllitscrolling.dds", True, "falls-lit-albedo",
     "lit scrolling falls layer; sheet lit layer -0.30"),
    ("textures/effects/fxwaterfalllitscrolling_n.dds", True, "falls-lit-normal",
     "normal for the lit scrolling falls layer"),
    ("textures/effects/fxwaterfallwhitestrip.dds", True, "falls-white-strip",
     "cross-stream white strip on the body; -0.313 / -0.333"),
    ("textures/effects/fxwaterfallwhitestriplite.dds", True, "falls-white-strip-lite",
     "lighter white strip variant; same -0.313 / -0.333 pair"),
    ("textures/effects/vaportile01.dds", True, "spray",
     "sheet spray/vapor; V -0.200, U +0.015 (softFalloffDepth 1.07 m)"),
    ("textures/effects/fxcloudroundtile.dds", True, "mist-cloud",
     "mist blast / skirt fog card; -0.158"),
    ("textures/effects/fxcloudroundtilestrip.dds", True, "mist-cloud-strip",
     "skirt fog strip; skirt foam -0.545 x2 and +0.362 (one layer scrolls up)"),
    ("textures/effects/fxsteamthinanim.dds", False, "mist-anim",
     "mist blast animated sheet; card scroll -0.158"),
    ("textures/effects/foamtile01.dds", True, "foam-tile",
     "seamless foam tile, unused by the vanilla NIFs; for our own pool/run-out foam"),
    ("textures/effects/gradients/gradwhitewater.dds", False, "ramp-whitewater",
     "alpha/colour ramp for the whitewater layers (second shader slot; no scroll)"),
    ("textures/effects/gradients/gradwhitewatermedsoft.dds", False, "ramp-whitewater-medsoft",
     "softer whitewater ramp (no scroll)"),
    ("textures/effects/gradients/gradwhitewatermedsoftinv.dds", False, "ramp-whitewater-medsoftinv",
     "inverted soft whitewater ramp (no scroll)"),
    ("textures/effects/gradients/gradwhitewatersoft.dds", False, "ramp-whitewater-soft",
     "softest whitewater ramp (no scroll)"),
    ("textures/effects/gradients/gradsteamthin.dds", False, "ramp-steam",
     "mist/steam ramp for the mist cards (no scroll)"),
    ("textures/effects/gradients/gradsmokediss.dds", False, "ramp-smoke-diss",
     "mist dissolve ramp (no scroll)"),
]


def main() -> None:
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DATA
    archive = BSAArchive(data_dir / "Skyrim - Textures.bsa")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    entries = []
    for bsa_path, tiles, role, scroll in TEXTURES:
        raw = archive.read(bsa_path)
        img = Image.open(io.BytesIO(raw))
        img.load()
        src_size = list(img.size)
        img = img.convert("RGBA")
        # Downscale only a tiling noise tile that is genuinely larger than the
        # cap in BOTH axes: a 32x1024 strip is a strip, and scaling its long
        # axis would squash the pattern it exists to carry.
        if tiles and min(img.size) > MAX_TILE_PX:
            scale = MAX_TILE_PX / max(img.size)
            img = img.resize((max(1, round(img.width * scale)),
                              max(1, round(img.height * scale))), Image.LANCZOS)
        name = Path(bsa_path).stem + ".png"
        out = OUT_DIR / name
        img.save(out, optimize=True)
        entries.append({
            "id": Path(bsa_path).stem,
            "file": name,
            "role": role,
            "sourceBsa": "Skyrim - Textures.bsa",
            "sourcePath": bsa_path,
            "sha256Dds": hashlib.sha256(raw).hexdigest(),
            "ddsBytes": len(raw),
            "sourcePx": src_size,
            "px": list(img.size),
            "tiles": tiles,
            "scroll": scroll,
            "pngBytes": out.stat().st_size,
        })
        print(f"{name:36s} {src_size[0]}x{src_size[1]} -> {img.size[0]}x{img.size[1]} "
              f"{out.stat().st_size/1024:6.1f} KB")
    manifest = {
        "schemaVersion": 1,
        "id": "waterfall-fx-textures",
        "source": "Vanilla Skyrim (Bethesda Softworks) - Skyrim - Textures.bsa",
        "credit": "Bethesda Softworks (Skyrim vanilla art); see root README Credits.",
        "audit": "docs/research/rendering/waterfall-assets-vault-audit.md",
        "notes": (
            "Alpha blend SRC_ALPHA/INV_SRC_ALPHA, depth-write off, double-sided, "
            "UV wrap in both axes; scroll the UV offset, never the vertices. "
            "Scroll rates are in UV tiles/second (negative = downward)."),
        "maxTilePx": MAX_TILE_PX,
        "textures": entries,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    total = sum(e["pngBytes"] for e in entries)
    print(f"{len(entries)} textures, {total/1024/1024:.2f} MB -> {OUT_DIR}")


if __name__ == "__main__":
    main()
