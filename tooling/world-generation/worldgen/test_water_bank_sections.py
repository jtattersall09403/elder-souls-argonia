import numpy as np
from .water_bank_sections import bank_crest_heights, bank_section_distances
from .terrain_triangles import sample_terrain


def test_exact_bank_corner_between_quarter_grid_samples():
    ground = np.zeros((5, 5)); ground[2, 2] = 10.
    point = np.array([1., 1.]); normal = np.array([1., 1.])/np.sqrt(2.)
    old = sample_terrain(ground, point[:, None]+normal[:, None]*np.arange(.25, 4.25, .25)).max()
    assert old < 9.5
    assert np.isclose(bank_crest_heights(ground, [point], [normal], [2.])[0], 10.)


def test_batched_crests_match_exact_rays_with_flipped_diagonals_and_edges():
    rng = np.random.default_rng(73)
    ground = rng.uniform(-3., 20., (9, 11))
    points = rng.uniform([0, 0], [8, 10], (30, 2))
    angle = rng.uniform(-np.pi, np.pi, 30)
    normals = np.column_stack([np.cos(angle), np.sin(angle)])
    radii = rng.uniform(.05, 4., 30)
    flips = rng.random((8, 10)) > .5
    actual = bank_crest_heights(ground, points, normals, radii, flips)
    expected = [sample_terrain(ground, p[:, None]+n[:, None]*bank_section_distances(p, n, r), flips).max()
                for p, n, r in zip(points, normals, radii)]
    assert np.allclose(actual, expected, atol=1e-10)
