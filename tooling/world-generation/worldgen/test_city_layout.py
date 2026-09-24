"""The nine city layouts: the gate is on the road, the centre is buildable,
the way joins them, and a city with nowhere dry to stand is an owner call."""

from __future__ import annotations

import json
import math

import numpy as np
import pytest

from . import catalogue, city_layout as cl, macro_plot
from .site_fields import PROVINCE, shared_survey


@pytest.fixture(scope="module")
def survey():
    return shared_survey()


@pytest.fixture(scope="module")
def solved(survey):
    return cl.solve(survey, catalogue.load_region_files())


@pytest.fixture(scope="module")
def approach_px():
    return cl._approach_paths(PROVINCE)


def _placed(solved):
    return {slug: res for slug, res in solved.items() if "block" in res}


def test_every_city_is_solved_or_an_owner_call(solved):
    assert set(solved) == set(cl.MAIN_APPROACH)


def test_deterministic(survey, solved):
    again = cl.solve(survey, catalogue.load_region_files())
    assert json.dumps(again, sort_keys=True, default=str) == \
        json.dumps(solved, sort_keys=True, default=str)


def test_gate_lies_on_the_main_approach(survey, solved, approach_px):
    for slug, res in _placed(solved).items():
        pts = [((p[0] + 0.5) * survey.grid_px_m, (p[1] + 0.5) * survey.grid_px_m)
               for p in approach_px[cl.MAIN_APPROACH[slug]]]
        d = min(math.dist(res["block"]["gate"], p) for p in pts)
        assert d <= 6.0, f"{slug}: gate is {d:.1f} m off its approach"


def test_centre_is_dry_and_walkable(survey, solved):
    for slug, res in _placed(solved).items():
        x, z = res["block"]["centre"]
        row, col = survey.grid_px(x, z)
        assert not bool(survey.wet_grid[row, col]), f"{slug}: centre is wet"
        assert float(survey.slope_grid[row, col]) <= cl.SLOPE_MAX_DEG, f"{slug}: centre is steep"


def test_way_joins_gate_to_centre(solved):
    for slug, res in _placed(solved).items():
        b = res["block"]
        assert len(b["way"]) >= 2
        assert math.dist(b["way"][0], b["gate"]) <= 5.0, slug
        assert math.dist(b["way"][-1], b["centre"]) <= 5.0, slug
        assert b["source"] == "street_router"


def test_polygon_is_a_shape_containing_its_centre(solved):
    for slug, res in _placed(solved).items():
        poly = res["polygon"]
        if poly is None and res.get("footprintWhy"):
            continue            # an island city: its footprint is the radius disc (owner 2026-09-23)
        assert poly is not None and len(poly) >= 3, slug
        assert catalogue._point_in_polygon(res["block"]["centre"], poly), slug


class _AllWaterSurvey:
    """A city whose whole disc is water: nowhere to stand."""

    def __init__(self, s):
        self.grid_px_m = s.grid_px_m
        self.grid_n = 64
        self.extent_m = self.grid_n * self.grid_px_m
        self.wet_grid = np.ones((self.grid_n, self.grid_n), dtype=bool)
        self.dry_grid = ~self.wet_grid
        self.slope_grid = np.zeros((self.grid_n, self.grid_n), dtype=np.float32)

    def grid_px(self, x, z):
        return (min(max(int(z / self.grid_px_m), 0), self.grid_n - 1),
                min(max(int(x / self.grid_px_m), 0), self.grid_n - 1))


def test_a_drowned_city_is_an_owner_call(survey):
    stub = _AllWaterSurvey(survey)
    gate = (stub.extent_m / 2.0, stub.extent_m / 2.0)
    chosen, best = cl.choose_centre(stub, gate, 60.0, 0.0)
    assert chosen is None
    assert best is None            # every candidate cell is wet: hard reject


def test_city_centres_reads_only_records_with_a_block(tmp_path):
    with_block = {"id": "place.r.stormhold", "cityLayout": {"centre": [12.0, 34.0]}}
    without = {"id": "place.r.thorn"}
    rf = catalogue.RegionFile(tmp_path / "places-r.json", "r", "seed",
                              [with_block, without])
    centres = macro_plot.city_centres([rf])
    assert centres == {"stormhold": (12.0, 34.0)}
