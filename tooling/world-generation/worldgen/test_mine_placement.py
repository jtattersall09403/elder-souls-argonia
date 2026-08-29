import math

import pytest

from .mine_placement import (
    Instance,
    _clumps,
    _nearest_neighbour_metres,
    _percentiles,
    _rotation_uniformity,
    bands,
    composition,
)


def make(species="tree.nif", category="tree", *, x=0.0, y=0.0, cell=(0, 0),
         rot_z=0.0, slope=0.0, depth=0.0):
    return Instance(
        species=species, category=category, cell=cell, x=x, y=y, z=0.0,
        scale=1.0, size_m=(1.0, 1.0, 4.0), rot_z=rot_z, tilt_deg=0.0,
        slope_deg=slope, above_water_m=0.0, sink_m=0.0,
        ground_water_depth_m=depth, ground=None,
    )


def test_percentiles_are_order_statistics_not_interpolated():
    assert _percentiles([1.0, 2.0, 3.0, 4.0, 5.0])["p50"] == 3.0
    assert _percentiles([]) == {}


def test_nearest_neighbour_finds_matches_across_bucket_boundaries():
    # 20 m apart with a 12 m bucket size: the pair straddles two buckets.
    points = [(0.0, 0.0), (20.0, 0.0)]
    assert _nearest_neighbour_metres(points) == pytest.approx(20.0)


def test_clark_evans_separates_a_regular_grid_from_clusters():
    def clark_evans(points, area):
        mean_nn = _nearest_neighbour_metres(points)
        expected = 0.5 / math.sqrt(len(points) / area)
        return mean_nn / expected

    grid = [(i * 10.0, j * 10.0) for i in range(10) for j in range(10)]
    assert clark_evans(grid, 100.0 * 100.0) > 1.5          # dispersed

    clustered = [
        (cx * 40.0 + dx, cy * 40.0 + dy)
        for cx in range(5) for cy in range(5)
        for dx, dy in ((0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0))
    ]
    assert clark_evans(clustered, 200.0 * 200.0) < 0.5     # clumped


def test_clumps_report_the_size_the_typical_instance_lives_in():
    points = [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)] + [(500.0, 500.0)]
    result = _clumps(points, link_m=3.0)
    assert result["clumps"] == 2
    assert result["clumpSize"]["p50"] == pytest.approx(2.5, abs=1.5)
    # Four of five points sit in the four-member clump.
    assert result["clumpSizeForTypicalInstance"]["p50"] == 4.0
    assert result["fractionInClumps"] == pytest.approx(0.8)


def test_rotation_uniformity_is_zero_when_every_copy_faces_the_same_way():
    same = [make(rot_z=0.0) for _ in range(24)]
    assert _rotation_uniformity(same) == pytest.approx(0.0)
    spread = [make(rot_z=i * math.tau / 24) for i in range(24)]
    assert _rotation_uniformity(spread) > 0.98  # bin edges land on float noise


def test_bands_split_by_water_depth_and_slope():
    instances = [
        make(species="reed.nif", category="aquatic-plant", depth=1.0, slope=2.0),
        make(species="reed.nif", category="aquatic-plant", depth=1.4, slope=2.0),
        make(species="fern.nif", category="plant", depth=-1.0, slope=20.0),
    ]
    result = bands(instances)
    shallow = result["byWaterDepth"]["shallow 0.5-2m"]
    assert shallow["instances"] == 2
    assert shallow["topSpecies"][0][0] == "reed.nif"
    assert result["byWaterDepth"]["dry 0.5-2m above"]["instances"] == 1
    assert result["bySlope"]["15-30deg"]["instances"] == 1


def test_composition_reports_concentration_and_richness():
    instances = (
        [make(species="a.nif") for _ in range(8)]
        + [make(species="b.nif", cell=(1, 0)) for _ in range(2)]
    )
    result = composition(instances)
    assert result["distinctSpecies"] == 2
    assert result["cumulativeShare"]["top1"] == 0.8
    assert result["speciesPerDressedCell"]["p50"] == 1.0
