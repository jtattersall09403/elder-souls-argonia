"""Exact registration checks for the shared province coordinate convention."""

import pytest

from .scale import (HYDRO_GRID_SAMPLES, HYDRO_PX_M, PROVINCE_EXTENT_M,
                    PROVINCE_EXTENT_RAW_SPACINGS, RAW_M, SOURCE_GRID_SAMPLES,
                    hydro_pixel_center_to_metres, metres_to_hydro_pixel,
                    metres_to_uv, uv_to_metres)


def test_authored_coordinate_extent_and_hydrology_overshoot_are_explicit():
    assert SOURCE_GRID_SAMPLES == 4033
    assert HYDRO_GRID_SAMPLES == 1345
    assert PROVINCE_EXTENT_RAW_SPACINGS == 4034
    assert PROVINCE_EXTENT_M == pytest.approx(4034 * RAW_M, abs=1e-12)
    assert HYDRO_GRID_SAMPLES * HYDRO_PX_M - PROVINCE_EXTENT_M == pytest.approx(RAW_M)
    assert PROVINCE_EXTENT_M == pytest.approx(7373.50656, abs=1e-9)


@pytest.mark.parametrize("uv", [0.0, 1.0, 0.5, 1.0 / 4032.0, 4031.0 / 4032.0])
def test_uv_metres_round_trip_at_boundaries_and_source_samples(uv):
    assert metres_to_uv(uv_to_metres(uv)) == pytest.approx(uv, abs=1e-6)


@pytest.mark.parametrize("index", [0.0, 1344.0, 0.5, 512.5, 1343.5])
def test_hydrology_pixel_centre_round_trip(index):
    metres = hydro_pixel_center_to_metres(index)
    assert metres_to_hydro_pixel(metres) == pytest.approx(index, abs=1e-6)
    assert metres_to_uv(uv_to_metres(metres_to_uv(metres))) == pytest.approx(
        metres_to_uv(metres), abs=1e-6)


def test_nine_trunks_authored_waterway_round_trip():
    metres = hydro_pixel_center_to_metres(910)
    assert metres == pytest.approx(4992.74496, abs=1e-9)
    assert metres_to_uv(metres) == pytest.approx(0.6771194843827467, abs=1e-12)
