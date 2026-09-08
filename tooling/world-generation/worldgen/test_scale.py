"""Exact registration checks for the shared province coordinate convention."""

import pytest

from .scale import (HYDRO_GRID_SAMPLES, HYDRO_PX_M, PROVINCE_EXTENT_M,
                    RAW_M, SOURCE_GRID_SAMPLES, hydro_sample_to_metres,
                    metres_to_hydro_sample, metres_to_uv, uv_to_metres)


def test_vertex_lattices_share_one_physical_extent():
    assert SOURCE_GRID_SAMPLES == 4033
    assert HYDRO_GRID_SAMPLES == 1345
    assert PROVINCE_EXTENT_M == pytest.approx((4033 - 1) * RAW_M, abs=1e-12)
    assert PROVINCE_EXTENT_M == pytest.approx((1345 - 1) * HYDRO_PX_M, abs=1e-12)
    assert PROVINCE_EXTENT_M == pytest.approx((2017 - 1) * (2 * RAW_M), abs=1e-12)
    assert PROVINCE_EXTENT_M == pytest.approx(7369.85088, abs=1e-9)


@pytest.mark.parametrize("uv", [0.0, 1.0, 0.5, 1.0 / 4032.0, 4031.0 / 4032.0])
def test_uv_metres_round_trip_at_boundaries_and_source_samples(uv):
    assert metres_to_uv(uv_to_metres(uv)) == pytest.approx(uv, abs=1e-6)


@pytest.mark.parametrize("index", [0.0, 1344.0, 0.5, 512.5, 1343.5])
def test_hydrology_sample_round_trip_at_boundaries_and_pixel_centres(index):
    metres = hydro_sample_to_metres(index)
    assert metres_to_hydro_sample(metres) == pytest.approx(index, abs=1e-6)
    assert metres_to_uv(uv_to_metres(metres_to_uv(metres))) == pytest.approx(
        metres_to_uv(metres), abs=1e-6)
