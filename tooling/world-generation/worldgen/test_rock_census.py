"""The rock gates on the PRODUCT: every rock in the shipped bundles, measured
on the shipped ground (16f round 4).

`test_rock_layers.py` checks the palette and the sampler in memory; both were
green while the owner walked past floating, over-tilted shells with their
open backs turned outward. The bundle writer clamped negative yaws to 0 and
the tilt rule double-counted the slope, and no test read the bundle back.
These do. Before the fix (2026-09-18 bundles, 20,249 rocks): 30 % floated,
25 % were past their mined tilt p95, 3,926 open backs faced outward, 54 %
had yaw exactly 0.

Skipped when no bundles are published (a fresh clone).
"""

from __future__ import annotations

import math

import pytest

from . import rock_census as rc
from . import rock_dressing as rd

pytestmark = pytest.mark.skipif(
    not any(rc.VEGETATION.glob("chunk_*_vegetation.bin")),
    reason="no published vegetation bundles")


@pytest.fixture(scope="module")
def rows() -> list[rc.RockMeasure]:
    return rc.census(rc.load_fields())


def _share(rows, pred) -> float:
    return sum(1 for r in rows if pred(r)) / max(1, len(rows))


def test_there_are_rocks(rows):
    assert len(rows) > 5000


def test_no_rock_floats(rows):
    """The base plane under a rock's footprint sits on or under the ground
    (the raster's own noise allowed). A hollow underside showing is what the
    owner calls a hollow rock."""
    floating = [r for r in rows if r.floats]
    assert _share(rows, lambda r: r.floats) < 0.02, (
        len(floating), floating[:5])


def test_tilt_within_the_mined_band(rows):
    """Total off-vertical angle at or under the species' mined tiltDeg p95.
    The mine's p95 is polluted by unnormalised rotations on a few species
    (rockl04 117 deg, rockpilem01 342 deg); the authoring never reads it
    (it takes the p25 residual and the p50/slope-p50 ratio), so a piece can
    only get near it by lying with a steep hillside its own mined slope
    band admits — rockl04 at 66 deg on a 52 deg face is Bethesda's own
    habit (its mined p75 is 78 deg)."""
    over = [r for r in rows if r.over_tilted]
    assert _share(rows, lambda r: r.over_tilted) < 0.01, (len(over), over[:5])


def test_open_backs_face_the_hill(rows):
    """Every open-backed shell's missing face points uphill, within the
    sampler's +-8 deg jitter plus the yaw byte's quantum (1.4 deg) and the
    difference between the shipped and the sampler's slope estimate."""
    shells = [r for r in rows if r.back_off_uphill_deg is not None]
    assert shells
    out = [r for r in shells if r.back_off_uphill_deg > 25.0]
    assert len(out) / len(shells) < 0.02, (len(out), len(shells), out[:5])


def test_yaws_are_not_clamped_to_zero(rows):
    """A yaw of exactly 0 is one byte of 255; more than a few percent of any
    species there means the writer clamped rather than wrapped."""
    zero = _share(rows, lambda r: r.yaw_deg == 0.0)
    assert zero < 0.03, zero


def test_scale_within_the_mined_range(rows):
    """Bed and cascade rocks are scaled to their authored radius by design
    (`_bed_scale`); every other rock stays in its mined p5-p95."""
    off = [r for r in rows if r.off_scale and r.species not in (
        rd.CASCADE_LIP_SPECIES, rd.CASCADE_RIM_SPECIES,
        *[s for _, s in rd._BED_BY_RADIUS])]
    assert _share(rows, lambda r: r in off) < 0.005, (len(off), off[:5])


def test_no_rock_is_swallowed(rows):
    """Something of every rock shows: its top is above the lowest ground
    under its footprint."""
    gone = [r for r in rows if r.swallowed]
    assert _share(rows, lambda r: r.swallowed) < 0.02, (len(gone), gone[:5])


def test_sink_is_the_mined_median_band(rows):
    """The shipped pivot sink is the species' mined p50 within the composed
    jitter (0.5-1.5 x) plus the burial the ground demanded, never a class
    default (rule 1): so it is never UNDER half the mined median."""
    shallow = [r for r in rows if r.sink_m < 0.5 * r.mined_sink_p50 - 0.05]
    assert _share(rows, lambda r: r in shallow) < 0.01, (len(shallow), shallow[:5])
