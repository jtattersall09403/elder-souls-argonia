"""Build the terrain ground-material library (decision 0011).

Assembles the global ground-texture library the land-cover system indexes
into: CC0 PBR sources (ambientCG, Poly Haven — downloaded once into the
vault) plus retained vanilla Skyrim landscape textures from the BSA (some
hue-shifted tropical per the canonical climate, module 50 §33.1). Emits
512px albedo PNGs + `materials.json` manifest into the studio's public
assets (runtime-versioned per owner policy). Source vetting lives in
docs/research/black-marsh-ground-texture-sources.md; credits in
docs/CREDITS.md. Supersedes export_terrain_textures.py.

Usage:
  python3 -m worldgen.build_ground_materials [vault-Data-dir]
"""

from __future__ import annotations

import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tooling" / "asset-pipeline"))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
from pipeline.bsa import BSAArchive  # noqa: E402

DEFAULT_DATA = Path("/home/analyticalplatform/workspace/elder-souls-dev/"
                    "elder-scrolls-asset-pipeline/skyrim-source/Data")
MOD_SOURCES = Path("/home/analyticalplatform/workspace/elder-souls-dev/"
                   "elder-scrolls-asset-pipeline/skyrim-source/mod-sources")
CC0_CACHE = MOD_SOURCES / "cc0-ground-textures"
# Extracted mod archives (downloaded via the Nexus API, cached in the vault):
# Project Rainforest SE (SSE 20636, owner-approved) — tropical repaints of the
# vanilla landscape set under vanilla filenames; Aendemika of Vvardenfell
# (Morrowind 59713, credit-only) — renewed Bitter Coast swamp ground set.
PR_DIR = MOD_SOURCES / "project-rainforest-20636" / "extracted"
AEND_DIR = MOD_SOURCES / "aendemika-59713" / "extracted"
OUT_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "textures" / "ground"
UA = {"User-Agent": "elder-souls-argonia world tooling (personal fan project)"}

# The global library. Index order IS the material id in the control map —
# keep stable once a control map ships beyond the current gate packet.
# tileM = world metres per texture repeat.
# tint: (hue shift deg, saturation mul, value mul) applied in HSV — used to
# tropicalise cold-biome vanilla sources (canonical climate, module 50 §33.1).
# lum: target mean luminance (0-255). Sources are authored at wildly
# different exposures; normalising each to a semantic target (wet=dark,
# dry/sandy=bright) makes the palette cohere under the studio's shading.
# Owner feedback 2026-08-23: vanilla fieldgrass02/Ground037 read alpine —
# tropical grass/swamp slots now come from Project Rainforest ("pr") and
# Aendemika's Bitter Coast set ("aend", the Morrowind swamp vocabulary:
# bank/mud/muck/scum/moss/undergrowth).
MATERIALS = [
    # name,            kind,  source ref,                                  tileM, tint, lum
    ("water_silt",    "pr",  "riverbottom.dds",                             7.0, None, 45),
    ("river_mud",     "pr",  "rivermud.dds",                                6.0, None, 50),
    ("bank_wet",      "aend", "Tx_BC_bank.dds",                             6.0, None, 52),
    ("scum",          "aend", "Tx_BC_scum.dds",                             7.0, None, 48),
    ("black_mud",     "acg", "Ground051",                                   6.0, None, 48),
    ("puddle_mud",    "acg", "Ground050",                                   8.0, None, 60),
    ("clay_bank",     "acg", "Ground026",                                   6.0, None, 66),
    ("muck",          "aend", "Tx_BC_muck_01.dds",                          7.0, None, 50),
    ("bc_mud",        "aend", "Tx_BC_mud.dds",                              6.0, None, 52),
    ("peat",          "acg", "Ground024",                                   7.0, None, 55),
    ("mud_leaves",    "acg", "Ground040",                                   7.0, None, 55),
    ("marsh_grass",   "pr",  "frozenmarshgrass01.dds",                      8.0, None, 58),
    ("undergrowth",   "aend", "Tx_BC_undergrowth.dds",                      7.0, None, 50),
    ("bc_moss",       "aend", "Tx_BC_moss.dds",                             7.0, None, 52),
    ("moss",          "bsa", "textures/landscape/reachmoss01.dds",          8.0, None, 52),
    ("swamp_grass",   "aend", "Tx_BC_grass.dds",                            8.0, None, 58),
    ("trop_grass",    "pr",  "fieldgrass02.dds",                            9.0, None, 60),
    ("grass_dirt",    "pr",  "fielddirtgrass01.dds",                        8.0, None, 58),
    ("scrub",         "aend", "Tx_BC_scrub.dds",                            8.0, None, 58),
    ("jungle_floor",  "ph",  "mud_forest",                                  8.0, None, 42),
    ("forest_floor",  "pr",  "pineforest01.dds",                            8.0, None, 48),
    ("leaf_litter",   "pr",  "fallforestleaves01.dds",                      8.0, None, 55),
    ("mossy_rock",    "bsa", "textures/landscape/reachmossyrocks01.dds",   14.0, None, 52),
    ("bc_rock",       "aend", "Tx_BC_rock_01.dds",                         12.0, None, 50),
    ("tidal_sand",    "pr",  "coastbeach01.dds",                            8.0, None, 72),
    ("salt_flat",     "acg", "Ground054",                                   9.0, None, 78),
    ("dry_clay",      "ph",  "mud_cracked_dry_riverbed_002",                7.0, None, 75),
    ("dirt_path",     "pr",  "dirtpath01.dds",                              6.0, None, 62),
    ("peat_slope",    "bsa", "textures/landscape/frozenmarshdirtslopes01.dds", 8.0, (14, 1.08, 1.0), 45),
    ("track_mud",     "ph",  "aerial_mud_1",                                6.0, None, 55),
    ("bc_road",       "aend", "Tx_BC_mainroad_01.dds",                      6.0, None, 62),
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def acg_image(asset_id: str) -> Image.Image:
    """ambientCG 1K JPG zip (CC0), cached in the vault."""
    cache = CC0_CACHE / f"{asset_id}_1K-JPG.zip"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        data = fetch(f"https://ambientcg.com/get?file={asset_id}_1K-JPG.zip")
        if data[:2] != b"PK":
            raise RuntimeError(f"ambientCG download for {asset_id} is not a zip")
        cache.write_bytes(data)
    with zipfile.ZipFile(cache) as z:
        color = [n for n in z.namelist() if "_Color." in n or "_Color_" in n]
        return Image.open(io.BytesIO(z.read(color[0]))).convert("RGB")


def ph_image(slug: str) -> Image.Image:
    """Poly Haven 1K diffuse JPG (CC0), cached in the vault."""
    cache = CC0_CACHE / f"{slug}_diff_1k.jpg"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        files = json.loads(fetch(f"https://api.polyhaven.com/files/{slug}"))
        key = next(k for k in files if "diff" in k.lower())
        cache.write_bytes(fetch(files[key]["1k"]["jpg"]["url"]))
    return Image.open(cache).convert("RGB")


def _find(root: Path, name: str) -> Path:
    hits = [p for p in root.rglob("*") if p.name.lower() == name.lower()]
    if not hits:
        raise FileNotFoundError(f"{name} not found under {root}")
    return hits[0]


def apply_tint(img: Image.Image, tint) -> Image.Image:
    hue_deg, sat_mul, val_mul = tint
    hsv = np.asarray(img.convert("HSV"), dtype=np.float32)
    hsv[..., 0] = (hsv[..., 0] + hue_deg / 360.0 * 255.0) % 255.0
    hsv[..., 1] = np.clip(hsv[..., 1] * sat_mul, 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * val_mul, 0, 255)
    return Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")


def main() -> None:
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DATA
    archive = BSAArchive(data_dir / "Skyrim - Textures.bsa")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for idx, (name, kind, ref, tile_m, tint, lum) in enumerate(MATERIALS):
        if kind == "bsa":
            img = Image.open(io.BytesIO(archive.read(ref))).convert("RGB")
            source = f"Skyrim ({ref})"
        elif kind == "acg":
            img = acg_image(ref)
            source = f"ambientCG {ref} (CC0)"
        elif kind == "pr":
            img = Image.open(_find(PR_DIR, ref)).convert("RGB")
            source = f"Project Rainforest SE ({ref})"
        elif kind == "aend":
            img = Image.open(_find(AEND_DIR, ref)).convert("RGB")
            source = f"Aendemika of Vvardenfell ({ref})"
        else:
            img = ph_image(ref)
            source = f"Poly Haven {ref} (CC0)"
        if tint:
            img = apply_tint(img, tint)
        arr = np.asarray(img, dtype=np.float32)
        arr = np.clip(arr * (lum / max(arr.mean(), 1e-6)), 0, 255)
        img = Image.fromarray(arr.astype(np.uint8))
        img = img.resize((512, 512), Image.LANCZOS)
        out = OUT_DIR / f"{idx:02d}-{name}.png"
        img.save(out)
        avg = [round(c) for c in np.asarray(img).reshape(-1, 3).mean(0)]
        manifest.append({"id": idx, "name": name, "file": out.name,
                         "tileM": tile_m, "avgColor": avg, "source": source})
        print(f"{idx:2d} {name:14s} <- {source}")
    (OUT_DIR / "materials.json").write_text(json.dumps({"materials": manifest}, indent=1))
    print(f"{len(manifest)} materials -> {OUT_DIR}")


if __name__ == "__main__":
    main()
