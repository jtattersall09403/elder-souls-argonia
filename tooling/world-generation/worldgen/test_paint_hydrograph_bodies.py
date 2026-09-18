"""The `hydrograph-bodies` overlay agrees with the compiled record.

It is painted from `water-id.png` joined to the entity kinds, so every body
kind's hectares on the overlay must match the id raster's own within a few per
cent (the only difference is the nearest downsample to the coarse grid).
"""

from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from .hydrology_graph import BODY_COLOUR
from .paint_hydrograph_bodies import COARSE_M_PER_PX, OVERLAY_N, OVERLAY_PATH, paint
from .water_report import WATER_DIR, ShippedWater


@pytest.fixture(scope="module")
def water() -> ShippedWater:
    if not (WATER_DIR / "water-id.png").exists():
        pytest.skip("no compiled water rasters")
    return ShippedWater()


def _overlay_ha(arr: np.ndarray) -> dict[str, float]:
    px_ha = (COARSE_M_PER_PX ** 2) / 10000.0
    out = {}
    for kind, rgb in BODY_COLOUR.items():
        hit = ((arr[..., 0] == rgb[0]) & (arr[..., 1] == rgb[1])
               & (arr[..., 2] == rgb[2]) & (arr[..., 3] > 0))
        out[kind] = float(hit.sum()) * px_ha
    return out


def test_shipped_overlay_matches_the_record_per_kind(water):
    if not OVERLAY_PATH.exists():
        pytest.skip("no overlay shipped")
    arr = np.asarray(Image.open(OVERLAY_PATH).convert("RGBA"))
    assert arr.shape == (OVERLAY_N, OVERLAY_N, 4)
    on_map = _overlay_ha(arr)
    px_ha = (water.mpp2 ** 2) / 10000.0
    for kind in BODY_COLOUR:
        record = float(water.kind_grid({kind}).sum()) * px_ha
        if record <= 0.0:
            assert on_map[kind] == 0.0, kind
            continue
        assert on_map[kind] == pytest.approx(record, rel=0.03), kind


def test_reaches_are_not_painted(water):
    arr = paint(water)
    kinds = water.kind_index_grid()
    names = water.kind_names()
    reach_only = {n for n in names[1:] if n not in BODY_COLOUR}
    assert reach_only, "the vocabulary must have reach kinds"
    # a texel whose entity is a reach carries no colour on the overlay
    src = np.minimum((np.arange(OVERLAY_N) + 0.5) * kinds.shape[0] / OVERLAY_N,
                     kinds.shape[0] - 1).astype(np.int32)
    coarse = kinds[np.ix_(src, src)]
    idx = {n: i for i, n in enumerate(names)}
    for n in reach_only:
        sel = coarse == idx[n]
        if sel.any():
            assert arr[..., 3][sel].max() == 0, n
