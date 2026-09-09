"""The effort metric behind the isolation floors (`worldgen.travel_cost`)."""

from __future__ import annotations

import math

import numpy as np
import pytest

from . import travel_cost


class FlatSurvey:
    """A survey-shaped stub over a synthetic height grid."""

    grid_px_m = 10.0
    grid_n = 128

    def __init__(self, grid=None):
        self.height_grid = (np.zeros((self.grid_n, self.grid_n), dtype=np.float64)
                            if grid is None else grid)


def ramp(rise_per_m: float) -> FlatSurvey:
    n = FlatSurvey.grid_n
    xs = np.arange(n, dtype=np.float64) * FlatSurvey.grid_px_m * rise_per_m
    return FlatSurvey(np.tile(xs, (n, 1)))


def test_flat_ground_is_one_to_one_with_plan_metres():
    """The unit is equivalent flat metres, so the authored 600 m floors keep
    their calibration over the marsh they were calibrated on.

    MUTATION: drop the FLAT_SPEED_KMH normalisation (use TOBLER_PEAK_KMH) —
    red, flat ground reads 503 m for 600."""
    s = FlatSurvey()
    assert travel_cost.effort_distance_m(s, 100.0, 100.0, 700.0, 100.0) == pytest.approx(600.0)


def test_a_climb_costs_more_than_the_same_distance_on_the_flat():
    """MUTATION: use |S| instead of |S + 0.05|, or drop the ascent term — the
    ratio collapses toward 1."""
    s = ramp(0.5)   # 1-in-2 face, ~27 deg
    climbed = travel_cost.effort_distance_m(s, 100.0, 100.0, 300.0, 100.0)
    assert climbed > 200.0 * 4.0, climbed


def test_effort_is_symmetric_between_the_two_records():
    """A siting gate is a property of a PAIR, so the measure may not depend on
    which record the solver reached first.

    Tobler is anisotropic, so this is not free: it holds because the endpoints
    are put in a canonical order and the two traverse directions are averaged.
    MUTATION: drop the canonical ordering in `effort_distance_m` — red."""
    s = ramp(0.3)
    a = travel_cost.effort_distance_m(s, 120.0, 120.0, 520.0, 120.0)
    b = travel_cost.effort_distance_m(s, 520.0, 120.0, 120.0, 120.0)
    assert a == pytest.approx(b)


@pytest.mark.parametrize("rise", [0.0, 0.01, 0.03, 0.05, 0.1, 0.4, 1.0, 3.0,
                                  -0.01, -0.029, -0.03, -0.05, -0.1, -0.4])
def test_effort_is_never_less_than_plan_distance(rise):
    """The short-circuit in `effort_or_plan` (and in the shipped-catalogue
    gate) is only sound because effort >= plan everywhere, including the
    gentle downhill where Tobler is faster than flat.

    MUTATION: remove the two-direction mean and take one leg alone — red at
    rise = -0.029, where Tobler's peak speed makes a one-way descent FASTER
    than the flat and a 400 m plan distance would read 394 m of effort."""
    s = ramp(rise)
    plan = 400.0
    assert travel_cost.effort_distance_m(s, 100.0, 100.0, 500.0, 100.0) >= plan - 1e-9


def test_a_cliff_is_a_climb_not_an_infinity():
    """Tobler is fitted to walking and explodes past ~45 deg: unclamped, one
    67 deg rim face read 778,920 equivalent flat metres over 125 plan metres.

    MUTATION: raise MAX_GRADIENT to 10 — red."""
    s = ramp(4.0)
    d = travel_cost.effort_distance_m(s, 100.0, 100.0, 300.0, 100.0)
    assert d <= 200.0 * math.exp(travel_cost.TOBLER_DECAY) * 1.001, d


def test_the_cached_metric_agrees_with_the_direct_measure_and_is_order_free():
    s = ramp(0.25)
    m = travel_cost.EffortMetric(s)
    direct = travel_cost.effort_distance_m(s, 100.0, 100.0, 600.0, 100.0)
    assert m(100.0, 100.0, 600.0, 100.0) == pytest.approx(direct, rel=1e-6)
    assert m(600.0, 100.0, 100.0, 100.0) == pytest.approx(m(100.0, 100.0, 600.0, 100.0))


def test_a_pair_already_clear_on_the_plan_is_not_walked():
    """MUTATION: make `effort_or_plan` always walk — still correct, but the
    short-circuit this asserts is what keeps the solver's inner loop cheap."""
    calls = []

    def metric(ax, az, bx, bz):
        calls.append(1)
        return 0.0

    assert travel_cost.effort_or_plan(metric, 0, 0, 700, 0, 700.0, 600.0) == 700.0
    assert not calls
    assert travel_cost.effort_or_plan(metric, 0, 0, 500, 0, 500.0, 600.0) == 0.0
    assert calls


def test_without_terrain_the_gates_fall_back_to_plan_distance():
    assert travel_cost.effort_or_plan(None, 0, 0, 100, 0, 100.0, 600.0) == 100.0
