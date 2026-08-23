"""Export ground textures from the vault's Skyrim BSA for the terrain preview.

Per the asset plan, terrain visuals derive from vanilla Skyrim textures (the
Hjaalmarch marsh vocabulary) — never bespoke art. This pulls a starter splat
set from `Skyrim - Textures.bsa`, decodes the DDS and writes 512px PNGs into
the studio's public assets (runtime-versioned per owner policy, as with the
sandbox GLBs). Formal per-asset registry records land with Phase 10.

Usage:
  python3 -m worldgen.export_terrain_textures [vault-Data-dir]
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tooling" / "asset-pipeline"))

from PIL import Image  # noqa: E402
from pipeline.bsa import BSAArchive  # noqa: E402

DEFAULT_DATA = Path("/home/analyticalplatform/workspace/elder-souls-dev/"
                    "elder-scrolls-asset-pipeline/skyrim-source/Data")
OUT_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "textures" / "terrain"

# splat channel -> BSA texture (Skyrim landscape set)
TEXTURES = {
    "grass": "textures/landscape/fieldgrass02.dds",
    "jungle": "textures/landscape/fallforestleaves01.dds",
    "sand": "textures/landscape/coastbeach01.dds",
    "marsh": "textures/landscape/reachmoss01.dds",
    "rock": "textures/landscape/reachmossyrocks01.dds",
    "mud": "textures/landscape/riverbottom.dds",
}


def main() -> None:
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DATA
    archive = BSAArchive(data_dir / "Skyrim - Textures.bsa")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for channel, name in TEXTURES.items():
        img = Image.open(io.BytesIO(archive.read(name))).convert("RGB")
        img = img.resize((512, 512), Image.LANCZOS)
        img.save(OUT_DIR / f"{channel}.png")
        print(f"{channel}: {name} -> {img.size}")


if __name__ == "__main__":
    main()
