import numpy as np
from .water_mesh_coverage import raster_channel_triangles


def test_overlapping_blocked_surface_cannot_hide_wet_lower_triangle():
    triangles = np.array([[[0, 1, 0], [4, 1, 0], [0, 1, 4]],
                          [[4, 10, 4], [4, 10, 0], [0, 10, 4]]], float)
    access = np.array([[-2] * 3, [100] * 3])
    response = np.zeros((2, 3, 2))
    ground = np.zeros((5, 5)); targets = np.ones((5, 5), bool)
    present, wet = raster_channel_triangles(triangles, access, response, ground, targets, 1., tile_size=2)
    assert present.all()
    y, x = np.indices(ground.shape)
    assert np.array_equal(wet, np.where(x + y <= 4, 7, 0))
    other = raster_channel_triangles(triangles[::-1], access[::-1], response[::-1], ground, targets, 1., tile_size=64)
    assert np.array_equal(present, other[0]) and np.array_equal(wet, other[1])


def test_true_terrain_and_seasonal_response_determine_coverage():
    triangle = np.array([[[0, 0, 0], [2, 0, 0], [0, 0, 2]]], float)
    ground = np.zeros((3, 3)); ground[0, 1] = 2.
    response = np.array([[[0., 1.]] * 3])
    present, wet = raster_channel_triangles(triangle, np.full((1, 3), -2.), response,
                                            ground, np.ones((3, 3), bool), 1.)
    assert present.sum() == 6
    assert np.count_nonzero(wet == 4) == 5
    assert wet[0, 1] == 0 and wet[2, 2] == 0


def test_vertical_sheet_does_not_claim_a_water_column():
    triangle = np.array([[[1, 5, 0], [1, 0, 0], [1, 0, 2]]], float)
    present, wet = raster_channel_triangles(triangle, np.zeros((1, 3)), np.zeros((1, 3, 2)),
                                            np.zeros((3, 3)), np.ones((3, 3), bool), 1.)
    assert not present.any() and not wet.any()
