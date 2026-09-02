"""Tests for the Phase 11 Part 0 site-survey tools (site_fields, site_dossier,
terrain_scour). They read the committed province rasters, so one shared
ProvinceSurvey is built per module."""

from __future__ import annotations

import re

import numpy as np
import pytest

from . import site_dossier, terrain_scour
from .site_fields import ProvinceSurvey

ID_SHAPE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*){2,}$")


@pytest.fixture(scope="module")
def survey() -> ProvinceSurvey:
    return ProvinceSurvey()


def test_coordinates_round_trip(survey):
    for u, v in ((0.0, 0.0), (0.25, 0.75), (0.999, 0.5)):
        x, z = survey.uv_to_m(u, v)
        assert survey.m_to_uv(x, z) == pytest.approx((u, v))


def test_anchor_positions_land_inside_the_province(survey):
    for _id, (x, z) in survey.anchor_points_m.items():
        assert 0.0 <= x < survey.extent_m and 0.0 <= z < survey.extent_m


def test_area_report_partitions_the_province(survey):
    a = survey.area_report()
    parts = (a["openSeaKm2"] + a["lakeKm2"] + a["deepRiverAndChannelKm2"]
             + a["authoredLandKm2"])
    assert parts == pytest.approx(a["provinceBoundingAreaKm2"], abs=0.05)
    # Sanity: Argonia is mostly land, but not all of it.
    assert 0.4 < a["authoredLandKm2"] / a["provinceBoundingAreaKm2"] < 0.8


def test_decoded_fields_have_plausible_ranges(survey):
    assert survey.danger.max() <= 5 and survey.danger.max() >= 4
    assert set(np.unique(survey.flood)) <= {0, 1, 2, 3}
    assert 0.0 <= survey.salinity.min() and survey.salinity.max() <= 1.0
    assert survey.region_grid.max() <= 14
    # every published raster decodes onto the same analysis grid
    for a in (survey.danger, survey.culture, survey.flood, survey.soil,
              survey.salinity, survey.humidity, survey.height_grid):
        assert a.shape == (survey.grid_n, survey.grid_n)


def test_sample_is_self_consistent(survey):
    x, z = survey.anchor_points_m["lilmoth"]
    s = survey.sample(x, z)
    assert s["regionName"]
    assert s["hydrology"]["heightAboveWaterTableM"] == pytest.approx(
        s["elevationM"] - s["hydrology"]["waterLevelM"], abs=0.01)
    assert 0.0 <= s["climate"]["humidity"] <= 1.0


def test_line_of_sight_is_reciprocal(survey):
    a = survey.anchor_points_m["lilmoth"]
    b = survey.anchor_points_m["blackrose"]
    assert survey.line_of_sight(*a, *b) == survey.line_of_sight(*b, *a)


def test_dossier_has_every_section_and_is_deterministic(survey):
    x, z = survey.anchor_points_m["stormhold"]
    first = site_dossier.build_dossier(survey, "stormhold", x, z, 300.0, 4000.0, 0)
    second = site_dossier.build_dossier(survey, "stormhold", x, z, 300.0, 4000.0, 0)
    assert first == second
    for key in ("centre", "terrain", "profiles", "hydrology", "context",
                "access", "vegetation", "viewshed", "minedFormAnalogues"):
        assert key in first
    assert first["schemaVersion"] >= 1
    assert first["minedFormAnalogues"], "the mined form tables should always match"
    assert site_dossier.digest(first).startswith("# Site dossier")


def test_harvest_respects_spacing_and_cap():
    score = np.arange(100 * 100, dtype=np.float64).reshape(100, 100)
    mask = np.ones((100, 100), bool)
    rng = np.random.default_rng(1)
    picks = terrain_scour.harvest(mask, score, spacing_m=50.0, cap=20,
                                  px_m=5.0, rng=rng)
    assert len(picks) == 20
    for i, (r1, c1, _s) in enumerate(picks):
        for r2, c2, _t in picks[i + 1:]:
            assert (r1 - r2) ** 2 + (c1 - c2) ** 2 >= (50.0 / 5.0) ** 2


def test_scour_is_deterministic_and_ids_are_well_formed(survey):
    classes = ["summit", "cove"]
    a = terrain_scour.sweep(survey, classes, seed=1109, do_viewshed=False)
    b = terrain_scour.sweep(survey, classes, seed=1109, do_viewshed=False)
    assert a["sites"] == b["sites"]
    assert a["sites"], "the province has summits and coves"
    ids = [s["id"] for s in a["sites"]]
    assert len(ids) == len(set(ids)), "candidate-site IDs must be unique"
    for site_id in ids:
        assert ID_SHAPE.match(site_id), site_id
        assert site_id.startswith("site.scour.")


def test_scour_sites_sit_where_their_landform_should(survey):
    result = terrain_scour.sweep(survey, ["summit", "cove"], 1109, False)
    summits = [s for s in result["sites"] if s["landform"] == "summit"]
    coves = [s for s in result["sites"] if s["landform"] == "cove"]
    assert all(s["scores"]["prominenceM"] > 0 for s in summits)
    # coves are water, so they are at or below the water line
    assert np.median([c["elevationM"] for c in coves]) < 5.0
