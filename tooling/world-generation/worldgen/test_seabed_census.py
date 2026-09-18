"""The sea-floor gate on the PRODUCT: pieces per 100 m^2 of ocean floor by
distance from the shore, from the shipped bundles (16f round 4).

Shown failing on the 2026-09-18 round-3 bundles: 2.30 inside 50 m, 0.87 at
100-150 m, 0.38 at 150-200 m, 0.024 at 400-600 m, 0.015 at 800-1000 m.
The owner's report ("some, but not very much", 33 m out) was that floor.

Skipped when no bundles are published (a fresh clone).
"""

from __future__ import annotations

import pytest

from . import seabed_census as sc
from .rock_census import VEGETATION

pytestmark = pytest.mark.skipif(
    not any(VEGETATION.glob("chunk_*_vegetation.bin")),
    reason="no published vegetation bundles")


@pytest.fixture(scope="module")
def doc() -> dict:
    return sc.census()


def _per100(doc, lo) -> float:
    return next(r["per100m2"] for r in doc["byDistanceM"] if r["from"] == lo)


def test_the_near_shore_floor_is_dense(doc):
    """Inside 100 m of the beach a swimmer sees several pieces in every
    10 x 10 m (at least 5 per 100 m^2; the round-3 floor had 2.3 and 1.8),
    and at least 2.5 out to 150 m (round 3: 0.87)."""
    for lo in (0, 50):
        assert _per100(doc, lo) >= 5.0, (lo, _per100(doc, lo))
    assert _per100(doc, 100) >= 2.5, _per100(doc, 100)


def test_the_floor_fades_out_over_a_long_run(doc):
    """Still dressed well out and thinning monotonically, never bare: at
    least 1.5 at 150-200 m (round 3: 0.38), 1.0 at 200-400 m (0.15, 0.09),
    0.5 at 400-1000 m (0.02), 0.2 past 2 km (0.01). Past ~150 m the fade
    is the depth bells' as much as the shoreline ramp's: the floor is
    16-25 m down over most of the sea."""
    assert _per100(doc, 150) >= 1.5
    assert _per100(doc, 200) >= 1.0
    assert _per100(doc, 300) >= 1.0
    assert _per100(doc, 400) >= 0.5
    assert _per100(doc, 600) >= 0.5
    assert _per100(doc, 800) >= 0.5
    assert _per100(doc, 2000) >= 0.2
    values = [r["per100m2"] for r in doc["byDistanceM"]]
    assert values[0] >= values[3] >= values[6] >= values[9] >= values[-1]


def test_the_deep_floor_keeps_its_stone(doc):
    """Past 16 m (77 % of the sea floor) the bed is shingle, stone and
    sponge rather than bare: at least 0.7 per 100 m^2 (round 3: 0.02)."""
    deep = next(r["per100m2"] for r in doc["byDepthM"] if r["from"] == 16.0)
    assert deep >= 0.7, deep


def test_the_breadth_is_used(doc):
    assert doc["distinctSpecies"] >= 60
