"""Checks over the shipped climate-weather raster (Phase 8c, module 55 §98).

climate-weather.png is a committed studio consumable, so these run everywhere
(no vault needed): R rain amplitude, G storm exposure, B advection sea-fog
propensity, 0..255 (decision 0032; formulas from black-marsh-climatology §3
with province-compressed scale lengths).
"""

from pathlib import Path

import numpy as np
from PIL import Image

PROVINCE = Path(__file__).resolve().parents[3] / "apps" / "world-studio" / "public" / "province"


def _load(name: str) -> np.ndarray:
    return np.asarray(Image.open(PROVINCE / name))


def test_shape_and_mode():
    img = Image.open(PROVINCE / "climate-weather.png")
    assert img.mode == "RGB"
    assert img.size == Image.open(PROVINCE / "climate-air.png").size


def test_rain_amplitude_is_a_field_with_a_rain_shadow():
    rain = _load("climate-weather.png")[..., 0].astype(np.float32) / 255
    assert rain.std() > 0.15                      # a field, not a constant
    assert np.percentile(rain, 10) < 0.3          # dry lee exists
    assert np.percentile(rain, 90) > 0.8          # windward/coastal max exists
    # NW border (rows north-first, cols west-first) is the Deshaan-side rain
    # shadow; the ocean-fed south stays wetter (climatology §2/§4).
    h, w = rain.shape
    nw = rain[: h // 3, : w // 3].mean()
    south = rain[2 * h // 3 :, :].mean()
    assert south > nw + 0.1


def test_storm_exposure_is_coastal_only():
    x = _load("climate-weather.png")[..., 1].astype(np.float32) / 255
    reg = _load("hydro-regions.png")
    assert np.percentile(x, 50) < 0.1             # most of the map sheltered
    assert x.max() > 0.9                          # open coast fully exposed
    mtn = (reg[..., 0] == 150) & (reg[..., 1] == 150) & (reg[..., 2] == 160)
    assert x[mtn].mean() < 0.05                   # border mountains see no sea storms


def test_sea_fog_hugs_coasts_and_estuaries():
    fog = _load("climate-weather.png")[..., 2].astype(np.float32) / 255
    sal = _load("hydro-salinity.png")
    briny = sal[..., 3] > 120                     # strongly saline corridors
    inlandish = fog < 0.2                         # dry interior exists
    assert briny.any() and inlandish.any()
    assert fog[briny].mean() > 0.75               # estuary corridors carry fog
    assert inlandish.mean() > 0.1                 # and it does not blanket the map
