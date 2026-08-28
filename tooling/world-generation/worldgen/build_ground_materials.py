"""Build the terrain ground-material library (decision 0011).

Assembles the global ground-texture library the land-cover system indexes
into: CC0 PBR sources (ambientCG, Poly Haven — downloaded once into the
vault) plus retained vanilla Skyrim landscape textures from the BSA (some
hue-shifted tropical per the canonical climate, module 50 §33.1). Emits
512px albedo PNGs + `materials.json` manifest into the studio's public
assets (runtime-versioned per owner policy). Source vetting lives in
docs/research/black-marsh-ground-texture-sources.md; credits in
the root README Credits section. Supersedes export_terrain_textures.py.

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
# Tropical Skyrim — A Climate Overhaul (classic Skyrim 33017, Soolie; owner
# round-4 preferred source): full tropical replacer of the vanilla landscape
# set + purpose-made Beach/CoastOceanFloor/RiverGravel. SHA256s in the vault
# dir's SHA256SUMS. Much more inside (flora, creatures, ruins) for later
# phases — see module 90.
TS_DIR = MOD_SOURCES / "tropical-skyrim-33017" / "extracted"

# Black Marsh & Valenwood (ModDB, owner-directed VERY HIGH priority source —
# module 90 §74.1b). Ground candidates extracted from Data2.rar by the mining
# pass 2026-08-23 (contact-sheet ranked); the archive itself is gitignored.
BMV_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "black-marsh-mod-source" / "extracted-ground"

# Material SETS: each build writes textures/ground/<set>/ + its manifest, and
# registers itself in textures/ground/index.json. The studio picks a set via
# ?mats=<name> (default from the index) — so palette experiments (e.g. the
# Black Marsh & Valenwood mining) are A/B-comparable and instantly revertible
# (owner request 2026-08-23). Material NAMES/ids must stay aligned across
# sets; only the concrete textures change.
DEFAULT_SET = "bmv-v1"
GROUND_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "textures" / "ground"
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
    # water_silt/river_mud: Tropical Skyrim's riverbed set (owner round 4 —
    # the PR riverbottom read as mossy cobbles on every underwater surface)
    ("water_silt",    "ts",  "riverbottom.dds",                             7.0, None, 48),
    ("river_mud",     "ts",  "rivermud.dds",                                6.0, None, 50),
    ("bank_wet",      "ts",  "riverbededge.dds",                            6.0, None, 52),
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
    ("moss",          "ts",  "reachmoss01.dds",                             8.0, None, 52),
    ("swamp_grass",   "aend", "Tx_BC_grass.dds",                            8.0, None, 58),
    ("trop_grass",    "pr",  "fieldgrass02.dds",                            9.0, None, 60),
    ("grass_dirt",    "pr",  "fielddirtgrass01.dds",                        8.0, None, 58),
    ("scrub",         "aend", "Tx_BC_scrub.dds",                            8.0, None, 58),
    ("jungle_floor",  "ph",  "mud_forest",                                  8.0, None, 42),
    ("forest_floor",  "pr",  "pineforest01.dds",                            8.0, None, 48),
    ("leaf_litter",   "pr",  "fallforestleaves01.dds",                      8.0, None, 55),
    ("mossy_rock",    "ts",  "reachmossyrocks01.dds",                      14.0, None, 52),
    ("bc_rock",       "aend", "Tx_BC_rock_01.dds",                         12.0, None, 50),
    ("tidal_sand",    "pr",  "coastbeach01.dds",                            8.0, None, 72),
    ("salt_flat",     "acg", "Ground054",                                   9.0, None, 78),
    ("dry_clay",      "ph",  "mud_cracked_dry_riverbed_002",                7.0, None, 75),
    ("dirt_path",     "pr",  "dirtpath01.dds",                              6.0, None, 68),
    ("peat_slope",    "bsa", "textures/landscape/frozenmarshdirtslopes01.dds", 8.0, (14, 1.08, 1.0), 45),
    ("track_mud",     "ph",  "aerial_mud_1",                                6.0, None, 55),
    ("bc_road",       "aend", "Tx_BC_mainroad_01.dds",                      6.0, None, 74),
    ("mountain_rock", "ts",  "mountains/mountainslab01.dds",               16.0, None, 62),
    # Phase 8b rounds 3-4 — tropical shorelines (research Part C + Tropical
    # Skyrim, the owner's preferred source). Appended so all shipped
    # control-map ids stay stable.
    ("beach_sand",    "ts",  "Beach.dds",                                   8.0, None, 82),
    ("seabed_sand",   "ph",  "aerial_beach_01",                             9.0, None, 70),
    ("river_pebbles", "ts",  "Tropical/RiverGravel.dds",                    6.0, None, 60),
    ("ocean_floor",   "ts",  "CoastOceanFloor01.dds",                       9.0, None, 68),
    # slot 36 (landcover DIRT_CLIFF): dirtcliffsroots01 was a decorative
    # cliff-face STRIP (hanging roots over strata) — unusable as ground
    # tiling (owner round 6, "stripy"). Tropical rocks01 is isotropic.
    ("trop_rocks",    "ts",  "rocks01.dds",                                12.0, None, 55),
]

# bmv-v1: Black Marsh & Valenwood winners — contact-sheet ranked 2026-08-23,
# then corrected against the mod's ACTUAL painting (worldgen.esp_landtex over
# Black Marsh.esm: ~90% vanilla slots seen through the TEXTUREPACK replacer,
# plus custom grounds rocksgrasswater01 [1.6k paints — their signature wet
# mossy-stone ground] and road01fallforest01 [their road]). fieldgrass02 was
# dropped from trop_grass — it keeps vanilla's daisy-meadow look (owner
# report). Overrides apply per slot; everything else carries over so sets
# stay comparable.
BMV_OVERRIDES = {
    # water_silt/river_mud/bank_wet/mossy_rock overrides REMOVED (owner
    # round 6): the BMV riverbottom/riverbededge/reachmossyrocks files are
    # the green moss-cobble textures the owner kept finding on every bed and
    # waterline — the round-4 Tropical Skyrim swap in the BASE table was
    # silently undone here for the default set. Beds/banks now come from the
    # base table (Tropical Skyrim) in BOTH sets.
    "mud_leaves": ("bmv", "fallforestdirt01.dds",   7.0, None, 55),
    "marsh_grass": ("bmv", "fieldgrass01.dds",      8.0, None, 58),
    "moss":       ("bmv", "reachmoss01.dds",        8.0, None, 52),
    "swamp_grass": ("bmv", "fielddirtgrass01.dds",  8.0, None, 58),
    "trop_grass": ("bmv", "tundra01.dds",           9.0, None, 60),
    "grass_dirt": ("bmv", "reachgrass01.dds",       8.0, None, 58),
    "jungle_floor": ("bmv", "pineforest02.dds",     8.0, None, 42),
    "forest_floor": ("bmv", "pineforest03.dds",     8.0, None, 48),
    "leaf_litter": ("bmv", "pineforest01.dds",      8.0, None, 52),
    "bc_rock":    ("bmv", "rocksgrasswater01.dds", 10.0, None, 52),
    "tidal_sand": ("bmv", "coastbeach01.dds",       8.0, None, 72),
    "salt_flat":  ("bmv", "mineralpoolterrace.dds", 9.0, None, 78),
    # peat_slope was dirtcliffsroots01 — a CLIFF texture whose horizontal
    # strata tiled as parallel stripes on the ground (the owner's persistent
    # "stripes"; the terracing theories were wrong). reachdirt01 is isotropic.
    "peat_slope": ("bmv", "reachdirt01.dds",        8.0, None, 45),
    "bc_road":    ("bmv", "roads/road01fallforest01.dds", 6.0, None, 74),
    # salt_flat: mineralpoolterrace's terraced look read as stripes from the
    # air (owner round 6) — use the flat CC0 tidal mud-sand in this set too
    "salt_flat":  ("acg", "Ground054",                    9.0, None, 78),
    "mountain_rock": ("bmv", "mountains/mountainslab01.dds", 16.0, None, 62),
}

MATERIAL_SETS = {
    "aendemika-v1": ("Aendemika BC + Rainforest + CC0", MATERIALS),
    "bmv-v1": ("Black Marsh & Valenwood mix",
               [(n, *BMV_OVERRIDES[n]) if n in BMV_OVERRIDES else (n, k, r, t, ti, lu)
                for (n, k, r, t, ti, lu) in MATERIALS]),
}


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


def build_set(set_name: str, label: str, materials, archive) -> None:
    out_dir = GROUND_DIR / set_name
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for idx, (name, kind, ref, tile_m, tint, lum) in enumerate(materials):
        if kind == "bsa":
            img = Image.open(io.BytesIO(archive.read(ref))).convert("RGB")
            source = f"Skyrim ({ref})"
        elif kind == "acg":
            img = acg_image(ref)
            source = f"ambientCG {ref} (CC0)"
        elif kind == "pr":
            img = Image.open(_find(PR_DIR, ref)).convert("RGB")
            source = f"Project Rainforest SE ({ref})"
        elif kind == "ts":
            img = Image.open(_find(TS_DIR, ref.split("/")[-1])).convert("RGB")
            source = f"Tropical Skyrim ({ref})"
        elif kind == "aend":
            img = Image.open(_find(AEND_DIR, ref)).convert("RGB")
            source = f"Aendemika of Vvardenfell ({ref})"
        elif kind == "bmv":
            img = Image.open(_find(BMV_DIR, ref.split("/")[-1])).convert("RGB")
            source = f"Black Marsh & Valenwood ({ref})"
        else:
            img = ph_image(ref)
            source = f"Poly Haven {ref} (CC0)"
        if tint:
            img = apply_tint(img, tint)
        arr = np.asarray(img, dtype=np.float32)
        arr = np.clip(arr * (lum / max(arr.mean(), 1e-6)), 0, 255)
        img = Image.fromarray(arr.astype(np.uint8))
        img = img.resize((512, 512), Image.LANCZOS)
        out = out_dir / f"{idx:02d}-{name}.png"
        img.save(out)
        avg = [round(c) for c in np.asarray(img).reshape(-1, 3).mean(0)]
        manifest.append({"id": idx, "name": name, "file": out.name,
                         "tileM": tile_m, "avgColor": avg, "source": source})
        print(f"{idx:2d} {name:14s} <- {source}")
    (out_dir / "materials.json").write_text(json.dumps({"materials": manifest}, indent=1))
    print(f"set '{set_name}' ({label}): {len(manifest)} materials -> {out_dir}")


def main() -> None:
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DATA
    archive = BSAArchive(data_dir / "Skyrim - Textures.bsa")
    index = {"default": DEFAULT_SET, "sets": {}}
    for set_name, (label, materials) in MATERIAL_SETS.items():
        build_set(set_name, label, materials, archive)
        index["sets"][set_name] = {"label": label}
    (GROUND_DIR / "index.json").write_text(json.dumps(index, indent=1))
    print(f"default set: {DEFAULT_SET}")


if __name__ == "__main__":
    main()
