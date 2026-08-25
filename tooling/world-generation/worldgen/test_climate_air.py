"""Checks over the shipped climate-air raster (Phase 8a, module 55 §97).

climate-air.png is a committed studio consumable, so these run everywhere
(no vault needed): R humidity, G mist propensity, B canopy closure, 0..255.
"""

from pathlib import Path

import numpy as np
from PIL import Image

PROVINCE = Path(__file__).resolve().parents[3] / "apps" / "world-studio" / "public" / "province"


def _load(name: str) -> np.ndarray:
    return np.asarray(Image.open(PROVINCE / name))


def test_climate_air_shape_and_mode():
    img = Image.open(PROVINCE / "climate-air.png")
    assert img.mode == "RGB"
    assert img.size == (1345, 1345)


def test_humidity_has_dynamic_range():
    hum = _load("climate-air.png")[..., 0]
    assert np.percentile(hum, 5) < 120       # dry pole (border ranges) exists
    assert np.percentile(hum, 95) > 200      # saturated basins/coasts exist
    assert hum.std() > 20                    # a field, not a constant


def test_mountains_drier_than_deep_marsh():
    # Locate classes via the shipped hydro-regions overlay colours
    # (regions.REGION_CLASSES: border mountains rgb 150/150/160,
    # rootland deep marsh rgb 30/110/60).
    air = _load("climate-air.png")
    reg = _load("hydro-regions.png")
    mtn = (reg[..., 0] == 150) & (reg[..., 1] == 150) & (reg[..., 2] == 160)
    deep = (reg[..., 0] == 30) & (reg[..., 1] == 110) & (reg[..., 2] == 60)
    assert mtn.any() and deep.any()
    hum = air[..., 0].astype(np.float32)
    assert hum[mtn].mean() < hum[deep].mean() - 60  # distinctly drier ranges
    canopy = air[..., 2].astype(np.float32)
    assert canopy[mtn].mean() < 60                  # open crag
    assert canopy[deep].mean() > 150                # permanent-dusk forest
