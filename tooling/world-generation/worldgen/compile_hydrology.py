"""Compile first-pass province hydrology and studio overlay rasters.

Usage:
  python3 -m worldgen.compile_hydrology <path-to-heightfield-f32.npy>

Reads the raw stitched heightfield from the vault, applies the owner-chosen
mild conditioning (decision 0005) and the world scale from scale.py (decision 0015),
runs worldgen.hydrology, then writes:

- full arrays -> <heightfield dir>/hydrology-pass1.npz (vault build cache)
- RGBA overlay PNGs + hydrology-meta.json -> apps/world-studio/public/province/
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from .condition import condition
from .hydrology import compute
from .regions import CLIMATE, REGION_CLASSES, SOIL_CLASSES, compute_regions
from .scale import HSCALE as SCALE, RAW_METRES_PER_SAMPLE

STEP = 3     # work at preview resolution (1345^2)

REPO_ROOT = Path(__file__).resolve().parents[3]
PREVIEW_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province"

WATERSHED_PALETTE = [
    (86, 156, 214), (206, 145, 120), (181, 206, 168), (220, 220, 170),
    (197, 134, 192), (78, 201, 176), (215, 186, 125), (128, 160, 194),
    (240, 128, 128), (152, 195, 121), (229, 192, 123), (97, 175, 239),
]


def rgba(shape) -> np.ndarray:
    return np.zeros((*shape, 4), dtype=np.uint8)


def save(img: np.ndarray, name: str) -> None:
    Image.fromarray(img).save(PREVIEW_DIR / name)


def main() -> None:
    grid_path = Path(sys.argv[1])
    raw = np.load(grid_path)
    z_full = condition(np.flipud(raw))  # image orientation: row 0 = north
    z = z_full[::STEP, ::STEP]
    metres_per_px = RAW_METRES_PER_SAMPLE * STEP * SCALE
    result = compute(z, metres_per_px)
    reg = compute_regions(z, result, metres_per_px)

    np.savez_compressed(
        grid_path.parent / "hydrology-pass1.npz",
        conditioned=z, ocean=result.ocean, filled=result.filled.astype(np.float32),
        flow_to=result.flow_to.astype(np.int32), accum_km2=result.accum_km2,
        rivers=result.rivers, watersheds=result.watersheds, twi=result.twi,
        wetlands=result.wetlands, lakes=result.lakes, tidal=result.tidal,
        salinity=result.salinity, hand=reg.hand, flood=reg.flood, soil=reg.soil,
        regions=reg.regions,
    )

    shape = z.shape
    # Rivers: line weight/alpha by hierarchy (majors drawn wider); lakes filled.
    rivers = rgba(shape)
    for band, colour, alpha, widen in (
        (1, (95, 172, 235), 120, 0),
        (2, (70, 150, 230), 200, 0),
        (3, (45, 115, 225), 255, 1),
    ):
        m = result.rivers == band
        if widen:
            m = ndimage.binary_dilation(m, iterations=widen)
        rivers[m] = (*colour, alpha)
    rivers[result.lakes] = (60, 130, 215, 210)
    save(rivers, "hydro-rivers.png")

    wet = rgba(shape)
    wet[result.wetlands] = (60, 200, 140, 110)
    wet[result.tidal & ~result.ocean] = (170, 205, 130, 110)
    save(wet, "hydro-wetlands.png")

    sheds = rgba(shape)
    ids = np.unique(result.watersheds[result.watersheds > 0])
    areas = {int(i): float((result.watersheds == i).sum() * result.stats["cellKm2"]) for i in ids}
    top = sorted(areas, key=areas.get, reverse=True)[:len(WATERSHED_PALETTE)]
    for rank, basin in enumerate(top):
        sheds[result.watersheds == basin] = (*WATERSHED_PALETTE[rank], 90)
    save(sheds, "hydro-watersheds.png")

    sal = rgba(shape)
    s = np.clip(result.salinity, 0, 1)
    m = s > 0.02
    sal[m, 0] = (40 + 180 * s[m]).astype(np.uint8)
    sal[m, 1] = (60 + 80 * s[m]).astype(np.uint8)
    sal[m, 2] = (160 - 60 * s[m]).astype(np.uint8)
    sal[m, 3] = (60 + 140 * s[m]).astype(np.uint8)
    save(sal, "hydro-salinity.png")

    flood = rgba(shape)
    for band, colour, alpha in ((1, (120, 170, 220), 60), (2, (80, 140, 220), 110), (3, (50, 100, 210), 160)):
        flood[reg.flood == band] = (*colour, alpha)
    save(flood, "hydro-flood.png")

    soil = rgba(shape)
    for cid, colour in ((1, (135, 135, 145)), (2, (165, 150, 105)), (3, (95, 140, 85)),
                        (4, (80, 60, 40)), (5, (150, 110, 70))):
        soil[reg.soil == cid] = (*colour, 110)
    save(soil, "hydro-soil.png")

    regions_img = rgba(shape)
    for cid, (_, colour) in REGION_CLASSES.items():
        if cid == 0:
            continue
        regions_img[reg.regions == cid] = (*colour, 120)
    save(regions_img, "hydro-regions.png")

    # Macro mist/steaminess field (plan §33.1): per-region mist propensity,
    # smoothed so it reads as air, not class boundaries.
    mist_lookup = np.zeros(max(CLIMATE) + 1, dtype=np.float32)
    for cid, prof in CLIMATE.items():
        mist_lookup[cid] = prof["mist"]
    mist = ndimage.gaussian_filter(mist_lookup[reg.regions], 4)
    mist_img = rgba(shape)
    mist_img[..., 0] = 225
    mist_img[..., 1] = 232
    mist_img[..., 2] = 238
    mist_img[..., 3] = (mist * 150).astype(np.uint8)
    save(mist_img, "hydro-mist.png")

    meta = {
        "metresPerPixel": metres_per_px,
        "scaleApplied": SCALE,
        "conditioning": "mild (decision 0005, re-revised 2026-08-23 at the Phase 6 gate)",
        "imageWidth": shape[1],
        "imageHeight": shape[0],
        "topBasinsKm2": {str(b): round(areas[b], 1) for b in top},
        "regionsLegend": {str(cid): {"name": name, "rgb": list(colour)}
                          for cid, (name, colour) in REGION_CLASSES.items()},
        "climateProfiles": {REGION_CLASSES[cid][0]: prof for cid, prof in CLIMATE.items()},
        "soilLegend": {str(cid): name for cid, name in SOIL_CLASSES.items()},
        **result.stats,
        **reg.stats,
    }
    (PREVIEW_DIR / "hydrology-meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
