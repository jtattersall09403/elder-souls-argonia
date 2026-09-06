import numpy as np
from .terrain_triangles import (sample_terrain, fill_terrain_depressions, label_terrain_components,
                               derive_channel_diagonal_flips)
from .water_geometry import lowest_spill_path, repair_channel_beds


def test_matches_rendered_and_raycast_rapier_anti_diagonal():
    ground = np.array([[0., 0.], [0., 4.]])
    actual = sample_terrain(ground, [[.25, .25, .75], [.25, .75, .75]])
    assert np.allclose(actual, [0, 0, 2])
    assert sample_terrain(ground, [[1], [1]])[0] == 4


def test_flood_cannot_escape_across_the_wrong_diagonal():
    ground = np.full((5, 5), 10.)
    ground[0, 0] = ground[1, 1] = ground[2, 2] = 0
    filled = fill_terrain_depressions(ground, np.zeros_like(ground, bool))
    assert filled[2, 2] == 10
    ground = np.fliplr(ground)
    filled = fill_terrain_depressions(ground, np.zeros_like(ground, bool))
    assert filled[2, 2] == 0


def test_routing_accounts_for_a_diagonal_triangle_saddle():
    ground = np.array([[0., 0., 0.], [0., 0., 10.], [0., 1., 0.]])
    path = lowest_spill_path(ground, [1., 1.], [2., 2.], max_deviation=1)
    assert any(np.allclose(point, [2, 1]) for point in path)
    assert len(path) >= 3


def test_bed_repair_uses_only_actual_triangle_support_weights():
    original = np.full((3, 3), 1.)
    corrected = original.copy()
    points = np.array([[.25, .25]])
    conflicts = {0: {'bedTargetM': .5, 'requiredLevelM': 1.03,
                     'obstructionBedM': 1., 'obstructionNode': 0, 'pathNodes': [0]}}
    assert repair_channel_beds(original, corrected, points, conflicts, 1) == 3
    assert corrected[1, 1] == 1  # Bilinear sampling used to cut this unrelated corner.
    assert abs(sample_terrain(corrected, points.T)[0] - .5) < 1e-6


def test_audited_diagonal_flip_connects_authored_low_bed_without_moving_vertices():
    ground = np.full((9, 9), 10.)
    ground[2, 2] = ground[3, 3] = 0
    ground[6, 0] = ground[7, 1] = 0  # Similar feature, but not an authored channel.
    original = ground.copy()
    rivers = np.zeros((3, 3), int)
    rivers[0, 0] = rivers[1, 1] = 1
    flow = np.full((3, 3), -1)
    flow[0, 0] = 4
    flips, audit = derive_channel_diagonal_flips(ground, rivers, flow)
    assert flips.sum() == 1 and flips[2, 2]
    assert len(audit) == 1 and audit[0]['sourceCell'] == 0
    assert np.array_equal(ground, original)
    assert sample_terrain(ground, [[2.5], [2.5]])[0] == 10
    assert sample_terrain(ground, [[2.5], [2.5]], flips)[0] == 0
    for y, x in ((2, 2), (2, 3), (3, 2), (3, 3)):
        assert sample_terrain(ground, [[y], [x]], flips)[0] == ground[y, x]


def test_flip_changes_component_edges_and_drainage_consistently():
    mask = np.array([[True, False], [False, True]])
    flips = np.ones((1, 1), bool)
    assert label_terrain_components(mask)[1] == 2
    assert label_terrain_components(mask, flips)[1] == 1
    assert label_terrain_components(~mask, flips)[1] == 2
    ground = np.full((5, 5), 10.)
    ground[0, 0] = ground[1, 1] = ground[2, 2] = 0
    flips = np.zeros((4, 4), bool)
    flips[0, 0] = flips[1, 1] = True
    assert fill_terrain_depressions(ground, np.zeros_like(ground, bool), flips)[2, 2] == 0
