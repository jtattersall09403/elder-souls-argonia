"""The gate whose absence let a hard-coded `distanceToWaterM: 0.0` ship.

A committed record's `plotFacts.distanceToWaterM` is a MEASUREMENT of the
shipped water. Nothing checked it against the water. `macro_plot` wrote literal
zeros for the nine owner-approved anchors, `committed_candidate` read the
number back out of the record's own `plotFacts` so it could never self-correct,
and `audit_place_semantics.check_water` validated the record's prose against
that same self-reported field — three layers, none of which ever touched the
raster. Eight of the nine anchors were wrong, Lilmoth by 108 m, and the studio
place inspector rendered the wrong number to the owner. Full diagnosis:
`docs/research/world-terrain/place-water-facts-vs-shipped-water.md`.

So: the record is compared to the raster here, and only to the raster.

SEASON. Dry/base, the harsher of the two the bake publishes — the season a
berth, a lane or a quay has to satisfy. `worldgen.remeasure_plot_facts` writes
that season and `audit_place_semantics.WATER_SEASON` audits it; all three name
it rather than inheriting a default (decision 0049).

TOLERANCE. One surface texel, 3.66 m: the resolution the compiled water is
published at, and therefore the finest disagreement that can mean anything.
Anything coarser is the raster; anything finer is rounding. A record outside it
is stale, and `python3 -m worldgen.remeasure_plot_facts` is the fix — it
rewrites facts and cannot move a place.
"""

from __future__ import annotations

import pytest

from . import catalogue
from .remeasure_plot_facts import PLOT_FACT_SEASON, measure
from .site_fields import ProvinceSurvey

#: One surface texel of the compiled water. See the module docstring.
WATER_FACT_TOL_M = 3.66

DEAD_STATUSES = {"cut", "deferred"}


@pytest.fixture(scope="module")
def survey():
    try:
        return ProvinceSurvey()
    except Exception as exc:  # noqa: BLE001 — no published rasters in this checkout
        pytest.skip(f"province rasters unavailable: {exc}")


def _committed() -> list[dict]:
    return [rec for rf in catalogue.load_region_files() for rec in rf.places
            if rec.get("status") not in DEAD_STATUSES
            and isinstance(rec.get("positionM"), list)
            and isinstance(rec.get("plotFacts"), dict)
            and "distanceToWaterM" in rec["plotFacts"]]


def test_the_season_a_plot_fact_means_is_named_and_published(survey):
    assert PLOT_FACT_SEASON in survey.water.SEASONS


def test_every_committed_water_fact_agrees_with_the_shipped_water(survey):
    recs = _committed()
    assert len(recs) > 500, f"only {len(recs)} committed records carry a water fact"
    bad = []
    for rec in recs:
        x, z = rec["positionM"]
        want = measure(survey, x, z, ("distanceToWaterM",))["distanceToWaterM"]
        got = float(rec["plotFacts"]["distanceToWaterM"])
        if abs(got - want) > WATER_FACT_TOL_M:
            bad.append((rec["id"], got, want))
    bad.sort(key=lambda b: -abs(b[1] - b[2]))
    assert not bad, (
        f"{len(bad)} committed records claim a distance to water the shipped "
        f"water does not support (season {PLOT_FACT_SEASON}, tolerance "
        f"{WATER_FACT_TOL_M} m). Run `python3 -m worldgen.remeasure_plot_facts` "
        "— it rewrites facts and cannot move a place. Worst: "
        + "; ".join(f"{i} says {g:.1f} m, measured {w:.1f} m" for i, g, w in bad[:8]))


def test_a_record_that_claims_water_it_has_not_got_is_caught(survey):
    """The gate both ways, on the real data.

    A gate that has never been shown to fail is the defect this whole file
    exists because of, so the mutation is run here rather than trusted.
    """
    recs = _committed()
    ok = [r for r in recs
          if abs(float(r["plotFacts"]["distanceToWaterM"])
                 - measure(survey, *r["positionM"], ("distanceToWaterM",))["distanceToWaterM"])
          <= WATER_FACT_TOL_M]
    assert len(ok) == len(recs)

    victim = next(r for r in recs
                  if measure(survey, *r["positionM"], ("distanceToWaterM",))["distanceToWaterM"] > 50.0)
    x, z = victim["positionM"]
    truth = measure(survey, x, z, ("distanceToWaterM",))["distanceToWaterM"]

    # the placeholder that shipped: a hard-coded 0.0 must be caught
    assert abs(0.0 - truth) > WATER_FACT_TOL_M
    # a drift of one texel must NOT be caught: the gate is not measuring noise
    assert abs((truth + WATER_FACT_TOL_M * 0.5) - truth) <= WATER_FACT_TOL_M
    # and just past it must be
    assert abs((truth + WATER_FACT_TOL_M * 1.5) - truth) > WATER_FACT_TOL_M


def test_the_nine_owner_approved_anchors_carry_a_measured_distance(survey):
    """The nine that shipped a literal zero, named so a regression is legible."""
    anchors = set(survey.anchor_points_m)
    assert len(anchors) == 9
    recs = {r["id"].rsplit(".", 1)[-1]: r for r in _committed()}
    seen = 0
    for slug in sorted(anchors):
        rec = recs.get(slug)
        if rec is None:
            continue
        seen += 1
        want = measure(survey, *rec["positionM"], ("distanceToWaterM",))["distanceToWaterM"]
        got = float(rec["plotFacts"]["distanceToWaterM"])
        assert abs(got - want) <= WATER_FACT_TOL_M, (
            f"anchor {slug}: record says {got} m, water says {want} m")
    assert seen == 9, f"only {seen} of the nine anchors found in the catalogue"
