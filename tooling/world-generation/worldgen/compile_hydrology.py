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

from .condition import base_terrain
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
    z_full = base_terrain(grid_path)  # image orientation: row 0 = north; sculpted if present (6b)
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

    # Province "air" raster (Phase 8a, module 55 §97): data channels for the
    # studio's aerial-perspective haze shader. R humidity, G mist propensity,
    # B canopy closure, each 0..1 -> 0..255. Humidity is a continuous field
    # (black-marsh-climatology §3: H = 0.55 + 0.3·wet + 0.2·exp(−dCoast/15km)
    # − altitude term; the seasonal term is applied at runtime) blended 50/50
    # with the smoothed per-class CLIMATE humidity so the authored class
    # character (dry border ranges, saturated basins) survives.
    wet01 = np.clip((result.twi - 3.0) / 5.5, 0.0, 1.0)
    wet01 = np.maximum(wet01, ndimage.gaussian_filter(
        (result.wetlands | result.lakes | (result.rivers >= 1)).astype(np.float32), 6))
    dist_coast_m = ndimage.distance_transform_edt(~result.ocean) * metres_per_px
    alt01 = np.clip(z / 400.0, 0.0, 1.0)  # sculpted border peaks reach ~650 m
    hum_phys = 0.55 + 0.3 * wet01 + 0.2 * np.exp(-dist_coast_m / 15000.0) - 0.5 * alt01
    hum_phys = ndimage.gaussian_filter(hum_phys.astype(np.float32), 2)
    hum_lookup = np.zeros(max(CLIMATE) + 1, dtype=np.float32)
    canopy_lookup = np.zeros(max(CLIMATE) + 1, dtype=np.float32)
    for cid, prof in CLIMATE.items():
        hum_lookup[cid] = prof["humidity"]
        canopy_lookup[cid] = prof["canopy"]
    humidity = np.clip(0.5 * hum_phys + 0.5 * ndimage.gaussian_filter(hum_lookup[reg.regions], 4), 0.0, 1.0)
    canopy = np.clip(ndimage.gaussian_filter(canopy_lookup[reg.regions], 4), 0.0, 1.0)
    air = np.zeros((*shape, 3), dtype=np.uint8)
    air[..., 0] = np.round(humidity * 255).astype(np.uint8)
    air[..., 1] = np.round(np.clip(mist, 0.0, 1.0) * 255).astype(np.uint8)
    air[..., 2] = np.round(canopy * 255).astype(np.uint8)
    save(air, "climate-air.png")

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
        "climateAir": {
            "file": "climate-air.png",
            "metresPerPixel": metres_per_px,
            "channels": {
                "R": "relative humidity 0..1 (byte/255): continuous climatology field blended with per-class humidity; seasonal term applied at runtime",
                "G": "mist propensity 0..1 (byte/255): same smoothed field as hydro-mist.png's alpha",
                "B": "canopy closure 0..1 (byte/255): per-class canopy (module 55 §96), gaussian-smoothed",
            },
            "boundaryLayerHeightM": 60,
            "note": "renderer uses boundaryLayerHeightM as the Mie haze scale height (boundary-layer Mie is shallow; Rayleigh scale height ~8 km)",
        },
        "soilLegend": {str(cid): name for cid, name in SOIL_CLASSES.items()},
        **result.stats,
        **reg.stats,
    }
    (PREVIEW_DIR / "hydrology-meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
