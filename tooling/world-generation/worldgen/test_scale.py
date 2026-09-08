"""Exact registration checks for the shared province coordinate convention."""

import pytest

from .scale import (AUTHORED_UV_EXTENT_M, AUTHORED_UV_RAW_SPACINGS,
                    HYDRO_GRID_SAMPLES, HYDRO_PX_M, HYDRO_RASTER_EDGE_EXTENT_M,
                    PROVINCE_EXTENT_M, RAW_M, SOURCE_GRID_SAMPLES,
                    TERRAIN_SUPPORT_EXTENT_M,
                    hydro_pixel_center_to_metres, metres_to_hydro_pixel,
                    metres_to_uv, uv_to_metres)


def test_three_coordinate_spans_are_explicit_and_independently_derived():
    assert SOURCE_GRID_SAMPLES == 4033
    assert HYDRO_GRID_SAMPLES == 1345
    assert AUTHORED_UV_RAW_SPACINGS == 4034
    assert AUTHORED_UV_EXTENT_M == pytest.approx(4034 * RAW_M, abs=1e-12)
    assert TERRAIN_SUPPORT_EXTENT_M == pytest.approx((SOURCE_GRID_SAMPLES - 1) * RAW_M)
    assert HYDRO_RASTER_EDGE_EXTENT_M == pytest.approx(HYDRO_GRID_SAMPLES * HYDRO_PX_M)
    assert AUTHORED_UV_EXTENT_M - TERRAIN_SUPPORT_EXTENT_M == pytest.approx(2 * RAW_M)
    assert HYDRO_RASTER_EDGE_EXTENT_M - AUTHORED_UV_EXTENT_M == pytest.approx(RAW_M)
    assert PROVINCE_EXTENT_M == AUTHORED_UV_EXTENT_M  # compatibility alias only
    assert AUTHORED_UV_EXTENT_M == pytest.approx(7373.50656, abs=1e-9)
    assert hydro_pixel_center_to_metres(HYDRO_GRID_SAMPLES - 1) < AUTHORED_UV_EXTENT_M


@pytest.mark.parametrize("uv", [0.0, 1.0, 0.5, 1.0 / 4032.0, 4031.0 / 4032.0])
def test_uv_metres_round_trip_at_boundaries_and_source_samples(uv):
    assert metres_to_uv(uv_to_metres(uv)) == pytest.approx(uv, abs=1e-6)


@pytest.mark.parametrize("index", [0.0, 1344.0, 0.5, 512.5, 1343.5])
def test_hydrology_pixel_centre_round_trip(index):
    metres = hydro_pixel_center_to_metres(index)
    assert metres_to_hydro_pixel(metres) == pytest.approx(index, abs=1e-6)
    assert metres_to_uv(uv_to_metres(metres_to_uv(metres))) == pytest.approx(
        metres_to_uv(metres), abs=1e-6)


def test_nine_trunks_is_an_authored_uv_regression_not_terrain_extent_evidence():
    metres = hydro_pixel_center_to_metres(910)
    assert metres == pytest.approx(4992.74496, abs=1e-9)
    assert metres_to_uv(metres) == pytest.approx(0.6771194843827467, abs=1e-12)

    from .province_network import _px_to_m
    network_point = _px_to_m([[910, 690]], HYDRO_PX_M)[0]
    assert network_point[0] == pytest.approx(4992.74496, abs=1e-9)
    assert network_point[1] == pytest.approx(3786.37056, abs=1e-9)
