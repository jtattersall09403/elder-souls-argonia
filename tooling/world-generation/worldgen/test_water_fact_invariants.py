"""No gate deciding a PHYSICAL water fact may read the class raster.

`water-class.png` is a TYPE label over a strict superset of the wet area — the
water bake says so itself in `water-meta.json` (`klass.meaning`), because it is
deliberately dilated `CLASS_EXT_PX = 4` pixels (~22 m) past the shoreline for
shore blending, and it also carries some of the wet season's reach. On the
shipped bake it calls 31.38 km2 water, of which 21.44 km2 is wet in the base
season, 25.39 km2 at the seasonal maximum, and **6.52 km2 is dry in every
season**. So every class-based "is there water here" test over-reports and
never under-reports, and one already shipped a berth 91 m from usable water
past a 10 m wet-join rule (2026-09-09).

Every CLASS-side figure quoted here and in the consumers is measured on the
bake of 2026-09-09 and will move: the water compiler is still tuning the
dilation (`CLASS_EXT_PX` 4 -> 5, plus the `CLASS_EXT_RISE_M = 2.0` cap, which
together take the dry ground the class raster drops from 7.14 km2 to a
measured 4.96 km2 once the chain re-runs). The DEPTH-side figures do not move
with it. Nothing here is tuned to one bake; the report in
`world/sources/sites/hostility-frequency.md` measures the class-versus-depth
gap at render time rather than quoting it, for the same reason.

These tests assert on the SHIPPED RASTERS, not on the shape of the code: a
consumer that quietly goes back to a class mask fails here on the data.

Which season a gate wants is a separate, real question (decision 0049):
a lane wants the base season, a wall wants the wet season. Both are measured.
"""
from __future__ import annotations

import numpy as np
import pytest

from . import compile_minor_waterways as mw
from .site_fields import ProvinceSurvey
from .ladder import requires_layer, requires_stage

pytestmark = requires_layer("water")

@pytest.fixture(scope="module")
def survey():
    try:
        return ProvinceSurvey()
    except Exception as exc:  # noqa: BLE001 — no published rasters in this checkout
        pytest.skip(f"province rasters unavailable: {exc}")


def _cell_km2(s) -> float:
    return (s.grid_px_m / 1000.0) ** 2


def test_open_water_contains_no_dry_cell(survey):
    """`open_water` decides berths, walls, streets and sightlines."""
    dry = survey.open_water & survey.dry_grid
    assert int(dry.sum()) == 0, (
        f"{int(dry.sum())} cells are called open water on ground the water bake "
        f"publishes as dry ({dry.sum() * _cell_km2(survey):.3f} km2)")


def test_navigable_mask_contains_no_dry_cell(survey):
    """A boat lane may not be solved over ground with no water on it."""
    dry = mw.navigable(survey) & survey.dry_grid
    assert int(dry.sum()) == 0, (
        f"{int(dry.sum())} navigable cells are dry "
        f"({dry.sum() * _cell_km2(survey):.3f} km2 of boat lane over dry land)")


def test_distance_to_water_measures_real_water(survey):
    """`dist_to_water_m` feeds shore gates and "at the water's edge" prose."""
    at_water = survey.dist_to_water_m <= 0.0
    dry = at_water & survey.dry_grid
    assert int(dry.sum()) == 0, (
        f"{int(dry.sum())} cells report zero distance to water but are dry")


def test_hostility_denominator_is_measured_dry_ground(survey):
    """The denominator of every /km2 figure the owner reads."""
    from .hostility_frequency import build_report  # noqa: PLC0415
    assert not bool((survey.dry_grid & survey.wet_grid).any())
    class_land = np.isin(survey.water_class, (0, 5))
    excluded = survey.dry_grid & ~class_land
    # The bound is 3.0 km2, not the 7.14 km2 the bake excludes today, because
    # the water compiler is deliberately shrinking this number: `CLASS_EXT_PX`
    # 4 -> 5 with the new `CLASS_EXT_RISE_M = 2.0` cap takes the excluded area
    # to a measured 4.96 km2 once the chain re-runs (e7bbd279). Both bakes must
    # pass; a bound tuned to one of them would go red on the other and read as
    # a defect. If it ever drops below 3.0 the class raster has stopped being a
    # superset of the wet ground and decision 0049 needs re-reading.
    assert excluded.sum() * _cell_km2(survey) > 3.0, (
        f"the class raster excludes only "
        f"{excluded.sum() * _cell_km2(survey):.2f} km2 of dry ground; the bake "
        f"changed and decision 0049 needs review")
    # Asserted BOTH ways, per band. The class raster UNDER-reports land here
    # (26.38 km2 against 32.96 km2 measured on the bake this was written
    # against), so a one-sided "no more than the measured area" bound cannot
    # catch it — it passes while every /km2 figure runs too high.
    report = build_report()
    for band in report["bands"]:
        b = band["band"]
        measured = float(((survey.danger == b) & survey.dry_grid).sum()) * _cell_km2(survey)
        assert band["landKm2"] == pytest.approx(measured, abs=0.02), (
            f"band D{b} claims {band['landKm2']:.2f} km2 of land; measured dry "
            f"ground is {measured:.2f} km2 — the denominator is not the signed depth")


def test_the_class_raster_is_a_superset_never_a_wetness_mask(survey):
    """The contract `water-meta.json` states, asserted on the shipped data.

    Every wet cell carries a class; a classed cell need not be wet. If this
    ever inverts, the class raster has changed meaning and every consumer
    decision recorded in 0049 has to be re-judged.
    """
    classed = survey.water_class > 0
    assert int((survey.wet_grid & ~classed).sum()) == 0, (
        "a wet cell carries no class — the class raster is no longer a superset")
    assert int((classed & survey.dry_grid).sum()) > 0, (
        "the class raster no longer over-reports; re-read decision 0049")


def test_wet_season_extent_contains_the_base_season(survey):
    """The seasonal lift only ever adds water."""
    assert int((survey.wet_grid & ~survey.wet_season_grid).sum()) == 0
    # ...and it is really applied. Silently dropping the lift would make every
    # wall gate read the dry season again, which is the milder half of this
    # defect class, so the seasonal ground has to be measurably there.
    seasonal_only = (survey.wet_season_grid & ~survey.wet_grid).sum() * _cell_km2(survey)
    assert seasonal_only > 1.0, (
        f"only {seasonal_only:.2f} km2 of seasonal ground; the wet-season lift "
        f"(water-shore.png G x SEASON_AMPLITUDE_M) is not being applied")


def test_channel_season_types_rather_than_hides_seasonal_water(survey):
    """A flood-only lane is declared; a never-wet lane is a defect."""
    wet_rc = np.argwhere(survey.wet_grid)
    seasonal_only = np.argwhere(survey.wet_season_grid & ~survey.wet_grid)
    dry_rc = np.argwhere(survey.dry_grid & ~survey.wet_season_grid)
    if not (len(wet_rc) and len(seasonal_only) and len(dry_rc)):
        pytest.skip("bake has no example of one of the three seasonal states")
    year_round = [(int(c), int(r)) for r, c in wet_rc[:3]]
    flood_only = [(int(c), int(r)) for r, c in seasonal_only[:3]]
    never = [(int(c), int(r)) for r, c in dry_rc[:3]]
    assert mw.channel_season(survey, year_round) == (mw.SEASON_YEAR_ROUND, 0)
    assert mw.channel_season(survey, year_round + flood_only) == (mw.SEASON_WET, 0)
    season, dry_cells = mw.channel_season(survey, year_round + never)
    assert season == mw.SEASON_DRY and dry_cells == len(never)


def test_every_water_question_goes_through_one_reader_with_a_season(survey):
    """`ShippedWater` is the only reader of the compiled water, and it cannot
    be asked "is there water here" without being told which season.

    The survey delegates to it rather than decoding the PNGs a second time, so
    the two can never drift; and a season name is required, so a consumer has
    to make the base-or-wet choice decision 0049 records rather than inherit
    someone else's default.
    """
    from .water_report import ShippedWater  # noqa: PLC0415

    assert isinstance(survey.water, ShippedWater)
    assert survey.water_signed_depth_m is survey.water.depth2

    with pytest.raises(TypeError):
        survey.water.wet_grid()          # season is not optional
    with pytest.raises(ValueError):
        survey.water.wet_grid("summer")  # and it must be a season we publish

    base = survey.water.wet_grid("dry")
    peak = survey.water.wet_grid("wet")
    assert int((base & ~peak).sum()) == 0
    assert int((peak & ~base).sum()) > 0
    # the survey's grids are that same answer, resampled
    assert int(survey.wet_grid.sum()) > 0
    assert survey.wet_grid.shape == (survey.grid_n, survey.grid_n)
