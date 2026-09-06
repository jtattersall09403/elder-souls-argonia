"""Geometric regression tests for the water rebuild; no asset vault needed."""

import numpy as np
from scipy import ndimage

from .water_geometry import (channel_surface, downhill_graph, extend_surface, lowest_spill_path,
                             monotone_backwater, refine_channel_stations, condition_channel_profiles)
from .water_features import compile_features
from .compile_water import reduce_surface_resolution
from .scale import RAW_M


def test_backwater_handles_tied_levels_confluences_and_long_chains():
    # Index order deliberately differs from drainage order.
    downstream = np.array([3, 0, 3, 4, -1])
    result = monotone_backwater([2, 1, 4, 3, 5], downstream)
    assert np.array_equal(result, np.full(5, 5))
    chain = np.arange(5000) - 1
    levels = np.zeros(5000)
    levels[0] = 7
    assert np.all(monotone_backwater(levels, chain) == 7)


def test_closed_drainage_cycle_forms_one_pool_and_backs_up_tributary():
    assert np.array_equal(monotone_backwater([1, 2, 0], [1, 0, 0]), [2, 2, 2])


def test_refined_terrain_reverses_stale_uphill_current_without_flooding_a_ridge():
    levels = np.array([30, 20, 120, 10, 0])
    downstream = downhill_graph(levels, [1, 2, 3, 4, -1])
    sources = np.flatnonzero(downstream >= 0)
    assert np.all(levels[sources] > levels[downstream[sources]])
    assert downstream[1] == -1  # a pool, not an uphill river to the ridge
    assert np.array_equal(levels, [30, 20, 120, 10, 0])


def test_sloped_river_is_connected_and_laterally_level_without_station_steps():
    y, x = np.mgrid[:41, :31]
    ground = 20 - y * 0.2 + np.abs(x - 15) * 0.4
    points = np.array([[0, 15], [10, 15], [20, 15], [30, 15], [40, 15]])
    levels = np.array([21, 19, 17, 15, 13], dtype=np.float32)
    water, ribbon, _ = channel_surface(ground, points, np.array([1, 2, 3, 4, -1]),
                                      levels, np.full(5, 5))
    expected = 21 - np.arange(41) * 0.2
    assert np.allclose(water[:, 15], expected)
    assert np.allclose(water[:, 12:19], expected[:, None])
    assert np.all(np.diff(water[:, 15]) < 0)
    assert np.all(water[:, 15] > ground[:, 15])
    assert ndimage.label(ribbon & (water > ground))[1] == 1


def test_native_stations_keep_a_steep_riffle_wet_between_coarse_endpoints():
    y, x = np.mgrid[:15, :15]
    profile = np.array([10, 10, 9.7, 9.5, 9.4, 9.3, 7, 4, 3, 2, 1, 0, 0, 0, 0])
    ground = profile[:, None] + np.abs(x - 7) * 0.4
    points = np.array([[1, 7], [5, 7], [9, 7], [13, 7]])
    levels = ground[points[:, 0], points[:, 1]] + 0.3
    refined, links, level, radius, _ = refine_channel_stations(
        ground, points, np.array([1, 2, 3, -1]), levels, np.full(4, 3))
    water, _, _ = channel_surface(ground, refined, links, level, radius)
    assert np.all(water[1:14, 7] > ground[1:14, 7] + 0.1)
    assert np.allclose(water[1:14, 6], water[1:14, 8])


def test_river_mouth_joins_sea_datum_without_a_film_depth_mound():
    ground = np.full((10, 10), -0.05)
    points = np.array([[1, 5], [8, 5]])
    refined, links, levels, radius, _ = refine_channel_stations(
        ground, points, np.array([1, -1]), np.array([0, 0]), np.array([3, 3]))
    water, ribbon, _ = channel_surface(ground, refined, links, levels, radius)
    assert np.all(water[ribbon] == 0)


def test_residual_raster_gap_gets_explicit_ribbon_and_downhill_cascade_record():
    y, _ = np.mgrid[:10, :10]
    ground = 10 - y.astype(float)
    points = np.array([[1, 5], [8, 5]])
    original_links = np.array([1, -1])
    refined, links, levels, radius, _ = refine_channel_stations(
        ground, points, original_links, np.array([9.3, 2.3]), np.array([2, 2]))
    args = (ground, ground - 1, np.ones_like(ground, bool), np.ones_like(ground, np.uint16),
            refined, links, levels, radius, 2, original_links, np.array([12, 22]), 10,
            np.array([1, 1]), 1.0)
    ribbons, falls = compile_features(*args)
    assert len(ribbons) == len(falls) == 1
    assert ribbons[0]["points"][0]["x"] == 5
    assert ribbons[0]["points"][0]["z"] == 1
    assert falls[0]["lip"]["y"] > falls[0]["plunge"]["y"]
    assert falls[0]["direction"]["z"] == 1
    assert compile_features(*args) == (ribbons, falls)


def test_good_raster_does_not_duplicate_a_channel_as_supplemental_geometry():
    ground = np.zeros((10, 10))
    ribbons, falls = compile_features(ground, ground + 1, np.ones_like(ground, bool),
        np.ones_like(ground, np.uint16), np.array([[1, 5], [8, 5]]), np.array([1, -1]),
        np.array([1, 1]), np.array([2, 2]), 2, np.array([1, -1]), np.array([12, 22]),
        10, np.array([1, 1]), 1)
    assert not ribbons
    assert not falls


def test_lower_memory_export_preserves_native_channel_geometry_and_world_coordinates():
    y, _ = np.mgrid[:9, :9]
    ground = 10 - y.astype(float)
    geometry = {"points": np.array([[0, 4], [8, 4]]), "links": np.array([1, -1]),
        "levels": np.array([10.3, 2.3]), "radius": np.array([2, 2]), "original_count": 2,
        "original_links": np.array([1, -1]), "cell_indices": np.array([12, 22]),
        "coarse_width": 10, "bands": np.array([1, 1])}
    native = {"w2": ground + 0.3, "ground2": ground, "depth2": ground * 0 + 0.3,
        "shore2": ground * 0, "fringe": ground < 0, "riv2": ground > 0,
        "support2": ground > 0, "bodies2": np.ones_like(ground, np.uint16),
        "nodata2": ground < 0, "feature_inputs": geometry, "topology_stats": {}}
    _, native_falls = compile_features(ground, native["w2"], native["support2"], native["bodies2"],
                                      **geometry, metres_per_pixel=RAW_M)
    low = reduce_surface_resolution(native, 2)
    assert np.array_equal(low["w2"], native["w2"][::2, ::2])
    assert low["cascades"][0]["lip"] == native_falls[0]["lip"]
    assert low["cascades"][0]["plunge"] == native_falls[0]["plunge"]
    assert low["cascades"][0]["dropM"] == native_falls[0]["dropM"]
    assert np.array_equal(geometry["points"], [[0, 4], [8, 4]])


def test_native_bed_hump_becomes_backwater_not_a_reversing_flow_peak():
    profile = np.array([84.1478, 84.4612, 84.7226, 84.5323, 84.1424, 83.7])
    y, x = np.mgrid[:6, :11]
    ground = profile[:, None] - 0.2 + abs(x - 5) * 0.75
    order = np.array([0, 5, 1, 2, 3, 4])
    points = np.column_stack([order, np.full(6, 5)])
    links = np.array([2, -1, 3, 4, 5, 1])
    level, active, accepted, conflicts = condition_channel_profiles(
        ground, points, links, profile[order], np.full(6, 2), 2, np.array([1, -1]))
    path = level[[0, 2, 3, 4, 5, 1]]
    assert np.all(np.diff(path) <= 0)
    assert np.allclose(path[:3], 84.7226)
    assert active.any() and not conflicts
    assert accepted[0] == 1


def test_backwater_adjustment_propagates_through_a_shared_reach_junction():
    y, x = np.mgrid[:6, :11]
    profile = np.array([85, 84.6, 84.1478, 84.7226, 84.1424, 83.7])
    ground = profile[:, None] - 0.2 + abs(x - 5) * 0.75
    order = np.array([0, 2, 5, 1, 3, 4])
    points = np.column_stack([order, np.full(6, 5)])
    level, _, _, conflicts = condition_channel_profiles(ground, points,
        np.array([3, 4, -1, 1, 5, 2]), profile[order], np.full(6, 2), 3, np.array([1, 2, -1]))
    assert np.isclose(level[1], 84.7226)
    assert np.all(np.diff(level[[0, 3, 1, 4, 5, 2]]) <= 0)
    assert not conflicts


def test_insufficient_banks_are_reported_and_excluded_instead_of_overtopped():
    profile = np.array([4, 4.7, 3])
    y, x = np.mgrid[:3, :7]
    ground = profile[:, None] - 0.2 + abs(x - 3) * 0.01
    points = np.array([[0, 3], [2, 3], [1, 3]])
    level, active, accepted, conflicts = condition_channel_profiles(ground, points,
        np.array([2, -1, 1]), profile[[0, 2, 1]], np.ones(3), 2, np.array([1, -1]))
    assert accepted[0] == -1
    assert not active.any()
    assert conflicts[0]["requiredLevelM"] > conflicts[0]["bankCapM"]
    assert level[0] <= 4


def test_a_riffle_thins_within_real_banks_before_rejecting_the_reach():
    profile = np.array([4, 4.1, 3])
    _, x = np.mgrid[:3, :11]
    ground = profile[:, None] - 0.2 + abs(x - 5) * 0.075
    points = np.array([[0, 5], [2, 5], [1, 5]])
    level, _, accepted, conflicts = condition_channel_profiles(ground, points,
        np.array([2, -1, 1]), profile[[0, 2, 1]], np.full(3, 2), 2, np.array([1, -1]))
    assert accepted[0] == 1 and not conflicts
    assert np.all(np.diff(level[[0, 2, 1]]) <= 0)
    assert level[2] < 4.1
    assert np.all(level >= np.array([3.8, 2.8, 3.9]) + 0.029)


def test_native_path_follows_existing_low_corridor_around_a_bed_obstruction():
    ground = np.zeros((7, 7))
    ground[3, 3] = 3
    path = lowest_spill_path(ground, [1, 3], [5, 3], max_deviation=1.5)
    assert all(ground[tuple(point.astype(int))] == 0 for point in path)
    assert np.array_equal(path[0], [1, 3])
    assert np.array_equal(path[-1], [5, 3])
    assert np.max(abs(path[:, 1] - 3)) <= 1.5
    assert ground[3, 3] == 3  # the compiler routes; it never edits terrain


def test_river_connected_pool_needs_uniform_head_over_its_outlet_sill():
    _, x = np.mgrid[:3, :9]
    ground = np.array([9.5, 10, 9])[:, None] + abs(x - 4) * 0.3
    points = np.array([[0, 4], [2, 4], [1, 4]])
    links = np.array([2, -1, 1])
    pool = np.full(ground.shape, -np.inf)
    pool[0, :] = 9.95
    _, _, old_links, _ = condition_channel_profiles(ground, points, links,
        np.array([9.95, 9.2, 10.2]), np.full(3, 2), 2, np.array([1, -1]), pool)
    assert old_links[0] == -1  # old level sits below the actual spill sill
    pool[0, :] = 10.08
    level, _, accepted, conflicts = condition_channel_profiles(ground, points, links,
        np.array([10.08, 9.2, 10.2]), np.full(3, 2), 2, np.array([1, -1]), pool)
    assert accepted[0] == 1 and not conflicts
    assert level[0] == np.float32(10.08)
    assert np.all(np.diff(level[[0, 2, 1]]) <= 0)


def test_shoreline_extrapolation_cannot_dome_or_sink_a_flat_pool():
    ground = np.full((31, 31), 8.0)
    ground[10:21, 10:21] = 1
    surface = np.full(ground.shape, np.nan)
    surface[10:21, 10:21] = 3
    level, support, bodies = extend_surface(surface, ground, 5)
    # All interpolation stencils across the edge contain the physical level.
    assert np.all(level == 3)
    assert np.all(support[9:22, 9:22])
    assert not support[0, 0]
    assert bodies[15, 15] > 0
    assert bodies[0, 0] == 0


def test_separate_pool_levels_are_never_gaussian_blended():
    ground = np.full((25, 35), 20.0)
    surface = np.full(ground.shape, np.nan)
    ground[5:20, 3:12] = 0
    ground[5:20, 23:32] = 8
    surface[5:20, 3:12] = 2
    surface[5:20, 23:32] = 10
    level, _, bodies = extend_surface(surface, ground)
    assert set(np.unique(level)) == {2, 10}
    assert bodies[12, 7] != bodies[12, 27]


def test_empty_world_does_not_invent_water():
    ground = np.ones((10, 10))
    _, support, bodies = extend_surface(np.full_like(ground, np.nan), ground)
    assert not support.any()
    assert not bodies.any()


def test_bed_repairs_are_sparse_bounded_and_never_excavate_for_a_pool_head():
    from .water_geometry import repair_channel_beds
    original = np.ones((8, 8), np.float32)
    corrected = original.copy()
    points = np.array([[3., 3.], [5., 5.]])
    conflicts = {0: {"requiredLevelM": 1.03, "obstructionBedM": 1.,
                     "obstructionNode": 0, "bedTargetM": .6},
                 1: {"requiredLevelM": 2., "obstructionBedM": 1.,
                     "obstructionNode": 1, "bedTargetM": .5}}
    assert repair_channel_beds(original, corrected, points, conflicts) == 1
    assert np.isclose(corrected[3, 3], .6)
    assert corrected[5, 5] == 1
    conflicts[0]["bedTargetM"] = -.01
    assert repair_channel_beds(original, corrected, points, conflicts) == 0
    assert np.count_nonzero(original != corrected) == 1


def test_subpixel_bed_repair_updates_only_actual_triangle_edge_corners():
    from .water_geometry import repair_channel_beds
    original = np.ones((8, 8), np.float32)
    corrected = original.copy()
    conflict = {0: {"requiredLevelM": 1.03, "obstructionBedM": 1.,
                    "obstructionNode": 0, "bedTargetM": .6}}
    assert repair_channel_beds(original, corrected, np.array([[3.5, 3.5]]), conflict) == 2
    assert np.allclose(corrected[3:5, 3:5], [[1, .6], [.6, 1]])


def test_three_metre_channel_breach_preserves_neighbouring_banks_and_original():
    from .water_geometry import repair_channel_beds
    original = np.full((8, 8), 9., np.float32)
    original[3, 3] = 5
    corrected = original.copy()
    conflict = {0: {"requiredLevelM": 5.03, "obstructionBedM": 5.,
                    "obstructionNode": 0, "bedTargetM": 2.2}}
    assert repair_channel_beds(original, corrected, np.array([[3., 3.]]), conflict, 3) == 1
    assert np.isclose(corrected[3, 3], 2.2)
    assert original[3, 3] == 5
    assert np.count_nonzero(original != corrected) == 1
    conflict[0]["bedTargetM"] = 1.99
    assert repair_channel_beds(original, corrected, np.array([[3., 3.]]), conflict, 3) == 0


def test_pool_plane_reaches_its_actual_triangle_shore_but_not_a_bilinear_false_pool():
    from .water_geometry import sample_standing_levels
    ground = np.array([[457., 468.], [468., 462.]])
    pools = np.array([[465., -np.inf], [-np.inf, -np.inf]])
    level = sample_standing_levels(ground, pools, np.array([[.25, .25]]))
    assert level[0] == 465
    assert not np.isfinite(sample_standing_levels(ground, pools, np.array([[.5, .5]]))[0])
    assert not np.isfinite(sample_standing_levels(ground, pools, np.array([[0., 1.]]))[0])


def test_sea_along_actual_diagonal_does_not_invent_a_bilinear_headland():
    from .terrain_triangles import sample_terrain
    ground = np.array([[-1., -1.], [-1., 108.]])
    points, links, levels, _, _ = refine_channel_stations(
        ground, np.array([[0., 1.], [1., 0.]]), np.array([1, -1]),
        np.array([0., 0.]), np.array([2., 2.]))
    assert len(points) == 3
    assert np.array_equal(points[links[0]], [.5, .5])
    assert np.all(levels == 0)
    assert np.all(sample_terrain(ground, points.T) < 0)


def test_flat_accepted_channel_keeps_authored_drainage_and_prefers_a_real_drop():
    assert np.array_equal(downhill_graph([4., 4., 4.], [1, 2, -1]), [1, 2, -1])
    assert np.array_equal(downhill_graph([4., 4., 2.], [1, 2, -1]), [1, 2, -1])


def test_repair_cannot_reverse_original_reach_intent_or_flat_current():
    ground = np.full((5, 7), 5.)
    ground[2, 1:6] = 0
    points = np.array([[2., 1.], [2., 5.], [2., 3.]])
    links = np.array([2, -1, 1])
    levels, _, _, conflicts = condition_channel_profiles(
        ground, points, links, np.array([.2, .5, .3]), np.full(3, 1.),
        2, np.array([1, -1]), orientation_levels=np.array([1., .5]))
    assert not conflicts
    assert levels[0] >= levels[2] >= levels[1]
    assert np.array_equal(downhill_graph([4., 4.], [1, -1], [1., 2.]), [-1, 0])


def test_flowing_pool_freeboard_can_lower_only_as_a_whole_above_its_spill():
    from .water_geometry import contain_pool_freeboards
    labels = np.ones((3, 3), dtype=int)
    pool = np.full((3, 3), 2.08, dtype=np.float32)
    filled = np.full((3, 3), 2.)
    points = np.array([[1., 1.]])
    conflict = {0: {'requiredLevelM': 2.08, 'obstructionBedM': 1.,
                    'obstructionNode': 0, 'bankCapM': 2.072}}
    changes = contain_pool_freeboards(pool, labels, filled, points, conflict)
    assert len(changes) == 1 and np.allclose(pool, 2.072)
    conflict[0].update(requiredLevelM=2.072, bankCapM=2.001)
    assert not contain_pool_freeboards(pool, labels, filled, points, conflict)
    assert np.allclose(pool, 2.072)


def test_same_pool_route_uses_existing_wet_corridor_beyond_two_pixel_chord():
    ground = np.zeros((13, 13))
    ground[4:9, 5:8] = 4
    pools = np.full((13, 13), 1.)
    points, _, _, _, _ = refine_channel_stations(ground, np.array([[6., 3.], [6., 9.]]),
        np.array([1, -1]), np.array([1., 1.]), np.array([2., 2.]), pool_levels=pools)
    from .terrain_triangles import sample_terrain
    assert np.max(sample_terrain(ground, points.T)) < 1
    assert np.max(abs(points[:, 0] - 6)) > 2
    assert ground.max() == 4


def test_bank_constraint_measures_near_crest_not_lower_ground_beyond_it():
    ground = np.full((31, 31), 2.)
    ground[:, 14] = ground[:, 16] = 6.
    ground[15, 15] = 4.
    ground[20, 15] = 1.
    points = np.array([[10., 15.], [20., 15.], [15., 15.]])
    levels, _, accepted, conflicts = condition_channel_profiles(
        ground, points, np.array([2, -1, 1]), np.array([2.3, 1.3, 4.2]),
        np.full(3, 2.), 2, np.array([1, -1]))
    assert not conflicts
    assert accepted[0] == 1
    assert levels[0] >= levels[2] >= levels[1]
    assert levels[0] < 6


def test_visible_channel_film_lowers_only_interior_bed_not_water_or_terminal_shore():
    from .water_geometry import repair_channel_films
    original = np.full((5, 5), 5.)
    original[2, 1:4] = [1.9, .999, -.0001]
    ground = original.copy()
    points = np.array([[2., 1.], [2., 2.], [2., 3.]])
    levels = np.array([2., 1., 0.])
    changes = repair_channel_films(original, ground, points, np.array([1, 2, -1]), levels,
                                    np.array([True, True, False]))
    assert changes == 1
    assert np.isclose(1. - ground[2, 2], .020)
    assert ground[2, 1] == 1.9 and ground[2, 3] == -.0001
    assert np.array_equal(levels, [2., 1., 0.])


def test_true_bank_caps_require_bounded_bed_repair_for_semantic_depth():
    from .water_geometry import repair_channel_beds
    ground = np.full((9, 9), 10., dtype=np.float32)
    original = ground.copy()
    points = np.array([[2., 4.], [6., 4.]])
    links = np.array([1, -1])
    args = (points, links, np.array([10.3, 10.3]), np.ones(2), 2, links)
    diagnostics = {}
    _, active, _, conflicts = condition_channel_profiles(
        ground, *args, strict_banks=True, minimum_depth=.3, diagnostics=diagnostics)
    assert conflicts and not active.any()
    assert np.all(diagnostics['bankCap'] < diagnostics['bed'])
    assert repair_channel_beds(original, ground, points, conflicts, 3,
        depth_targets=diagnostics['depthTargets'], pinned=diagnostics['pinned']) == 2
    level, _, accepted, conflicts = condition_channel_profiles(
        ground, *args, strict_banks=True, minimum_depth=.3)
    assert not conflicts and accepted[0] == 1
    assert np.all(level - ground[points[:, 0].astype(int), points[:, 1].astype(int)] >= .29999)
    assert np.all(level < 10)
    assert np.count_nonzero(ground != original) == 2
    assert np.max(original - ground) < .32


def test_bank_interpolation_uses_corrected_ground_without_changing_route_intent():
    original = np.full((9, 9), 9., dtype=np.float32)
    original[:, 4] = 10
    corrected = original.copy()
    corrected[:, 4] = 9.5
    points = np.array([[2., 4.2], [6., 4.2]])
    links = np.array([1, -1])
    intent = np.array([10.3, 10.2])
    before, after = {}, {}
    args = (points, links, intent, np.ones(2), 2, links)
    condition_channel_profiles(original, *args, strict_banks=True, minimum_depth=.3,
                               orientation_levels=intent, diagnostics=before)
    condition_channel_profiles(corrected, *args, strict_banks=True, minimum_depth=.3,
                               orientation_levels=intent, diagnostics=after)
    assert np.all(after['measuredBankCap'] < before['measuredBankCap'] - .2)
    # Bed repair may change the bank sampled through the same native
    # triangle, but never the immutable geometric routing intention.
    first = refine_channel_stations(original, points, links, intent, np.ones(2), routing_ground=original)
    second = refine_channel_stations(corrected, points, links, intent, np.ones(2), routing_ground=original)
    assert np.array_equal(first[0], second[0])
    assert np.array_equal(first[1], second[1])


def test_strict_depth_repair_does_not_excavate_a_real_pinned_pool():
    from .water_geometry import repair_channel_beds
    original = np.full((5, 5), 2.)
    ground = original.copy()
    conflict = {0: {'bedTargetM': 1., 'pathNodes': [0], 'drainageNodes': [0],
                    'requiredLevelM': 2.08, 'obstructionBedM': 2., 'bankCapM': 2.04}}
    assert repair_channel_beds(original, ground, np.array([[2., 2.]]), conflict, 3,
        depth_targets=np.array([.3]), pinned=np.array([True])) == 0
    assert np.array_equal(ground, original)


def test_terrain_protection_hull_covers_both_possible_bend_diagonals():
    from .water_terrain_mask import interval_hull
    from scipy.spatial import Delaunay
    first = np.array([[1., 1.], [5., 1.]])
    second = np.array([[3., 2.], [5., 5.]])
    hull = np.array(interval_hull(first, second))
    triangulation = Delaunay(hull)
    endpoints = np.concatenate([first, second])
    # All three-vertex combinations include both zipper arrangements,
    # unlike a fixed pair of diagonals through a concave quadrilateral.
    import itertools
    for vertices in itertools.combinations(endpoints, 3):
        assert triangulation.find_simplex(np.mean(vertices, axis=0)) >= 0


def test_actual_freefall_is_not_excavated_to_match_a_ravine_bank():
    ground = np.full((7, 7), -1., dtype=np.float32)
    ground[2, 3] = 100
    ground[3, 3] = 50
    points = np.array([[2., 3.], [4., 3.], [3., 3.]])
    diagnostics = {}
    levels, _, accepted, conflicts = condition_channel_profiles(
        ground, points, np.array([2, -1, 1]), np.array([100.3, 0., 50.3]),
        np.ones(3), 2, np.array([1, -1]), strict_banks=True, minimum_depth=.3,
        allow_freefall=True, diagnostics=diagnostics)
    assert not conflicts and accepted[0] == 1
    assert np.array_equal(diagnostics['falling'], [True, False, True])
    assert levels[1] == 0
    assert np.all(np.diff(levels[[0, 2, 1]]) < 0)
    assert ground[2, 3] == 100 and ground[3, 3] == 50


def test_degree_two_record_join_uses_one_shared_bisector_including_alias_nodes():
    from .water_features import shared_section_normals
    points = np.array([[0., 0.], [2., 0.], [2., 2.], [2., 0.]])
    normals = shared_section_normals(points, np.array([1, -1, -1, 2]), 4, np.array([1, -1, -1, 2]))
    assert normals[0] is None and normals[2] is None
    assert np.array_equal(normals[1], normals[3])
    assert np.allclose(abs(normals[1]), np.sqrt(.5))


def test_coupled_bank_solver_accounts_for_moving_corner_interpolation_exactly():
    from .water_geometry import coupled_bank_lowering
    amount = coupled_bank_lowering(10., np.array([1.]), np.array([3.]),
        np.array([10., 10.]), np.array([[.75], [.5]]), .3)
    assert np.isclose(amount, 1.260001)
    assert coupled_bank_lowering(10., np.array([1.]), np.array([1.]),
        np.array([10., 10.]), np.array([[.75], [.5]]), .3) is None


def test_coupled_correction_resolves_fractional_bank_in_one_bounded_step():
    from .water_geometry import repair_channel_beds
    original = np.full((9, 9), 9., dtype=np.float32)
    original[:, 4] = 10
    ground = original.copy()
    points = np.array([[2., 4.2], [6., 4.2]])
    links, radius = np.array([1, -1]), np.ones(2)
    args = (points, links, np.array([10., 10.]), radius, 2, links)
    diagnostics = {}
    _, _, _, conflicts = condition_channel_profiles(ground, *args, strict_banks=True,
        minimum_depth=.3, diagnostics=diagnostics)
    assert repair_channel_beds(original, ground, points, conflicts, 3,
        depth_targets=diagnostics['depthTargets'], pinned=diagnostics['pinned'],
        links=links, radius=radius) > 0
    levels, _, accepted, conflicts = condition_channel_profiles(ground, *args,
        strict_banks=True, minimum_depth=.3)
    assert not conflicts and accepted[0] == 1
    assert np.max(original - ground) < 1.2
    assert np.all(levels < 9)


def test_existing_thalweg_search_stays_lateral_and_cannot_cross_a_bank():
    from .water_geometry import select_channel_anchors
    ground = np.full((11, 11), 8.)
    ground[5, 5:8] = [4., 3., 2.]
    args = (np.array([[5., 5.]]), np.array([[1., 0.]]), np.array([2.]), np.array([.3]))
    assert np.array_equal(select_channel_anchors(ground, *args), [[5., 7.]])
    ground[5, 6] = 5.
    assert np.array_equal(select_channel_anchors(ground, *args), [[5., 5.]])


def test_degree_two_records_share_full_ground_access_cross_section_not_only_normal():
    ground = np.zeros((15, 15))
    points = np.array([[3., 5.], [7., 5.], [7., 9.]])
    links = np.array([1, 2, -1])
    records, _ = compile_features(ground, ground + 2, np.ones_like(ground, bool),
        np.ones_like(ground, np.uint16), points, links, np.array([3., 2., 1.]),
        np.full(3, 2.), 3, links, np.array([12, 22, 32]), 10, np.ones(3), 1., all_channels=True)
    end, start = records[0]['points'][-1], records[1]['points'][0]
    assert end['crossSectionNormalX'] == start['crossSectionNormalX']
    assert end['crossSectionNormalZ'] == start['crossSectionNormalZ']
    assert end['crossSection'] == start['crossSection']
    assert end['boundaryKinds'] == start['boundaryKinds']


def test_coupled_solver_can_preserve_bank_corner_and_lower_other_support_corner():
    from .water_geometry import coupled_bank_lowering, bounded_bank_correction
    args = (10., np.array([.5, .5]), np.array([3., 3.]),
            np.array([10., 10.]), np.array([[1., 0.], [0., 0.]]), .3)
    assert coupled_bank_lowering(*args) is None
    correction = bounded_bank_correction(*args)
    assert correction is not None
    assert np.allclose(correction, [0., .63])


def test_isolated_below_sea_channel_repair_never_creates_an_ocean_datum_pin():
    from .water_geometry import connected_marine_terrain, sample_marine_mask
    ground = np.full((9, 9), 2.)
    ground[:, 0] = -1
    ground[4, 4:7] = -.2
    seeds = np.zeros_like(ground, bool)
    seeds[:, 0] = True
    marine = connected_marine_terrain(ground, seeds)
    assert marine[:, 0].all() and not marine[4, 4:7].any()
    points = np.array([[4., 4.], [4., 6.], [4., 5.]])
    links = np.array([2, -1, 1])
    assert not sample_marine_mask(ground, marine, points).any()
    levels, _, accepted, conflicts = condition_channel_profiles(ground, points, links,
        np.full(3, .1), np.ones(3), 2, np.array([1, -1]), strict_banks=True,
        minimum_depth=.3, marine_ground=marine)
    assert not conflicts and accepted[0] == 1
    assert np.allclose(levels, .1)
    refined = refine_channel_stations(ground, points[:2], np.array([1, -1]),
        np.full(2, .1), np.ones(2), minimum_depth=.3, marine_ground=marine)
    assert np.allclose(refined[2], .1)
