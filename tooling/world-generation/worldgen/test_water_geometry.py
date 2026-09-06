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


def test_subpixel_bed_repair_updates_only_bilinear_support_corners():
    from .water_geometry import repair_channel_beds
    original = np.ones((8, 8), np.float32)
    corrected = original.copy()
    conflict = {0: {"requiredLevelM": 1.03, "obstructionBedM": 1.,
                    "obstructionNode": 0, "bedTargetM": .6}}
    assert repair_channel_beds(original, corrected, np.array([[3.5, 3.5]]), conflict) == 4
    assert np.allclose(corrected[3:5, 3:5], .6)


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


def test_pool_plane_reaches_wet_midpoint_even_when_nearest_corner_is_dry():
    from .water_geometry import sample_standing_levels
    ground = np.array([[457., 468.], [468., 462.]])
    pools = np.array([[465., -np.inf], [-np.inf, -np.inf]])
    level = sample_standing_levels(ground, pools, np.array([[.5, .5]]))
    assert level[0] == 465
    assert not np.isfinite(sample_standing_levels(ground, pools, np.array([[0., 1.]]))[0])


def test_sea_diagonal_uses_existing_wet_corner_instead_of_crossing_a_headland():
    ground = np.array([[-1., -1.], [-1., 108.]])
    points, links, levels, _, _ = refine_channel_stations(
        ground, np.array([[0., 1.], [1., 0.]]), np.array([1, -1]),
        np.array([0., 0.]), np.array([2., 2.]))
    assert len(points) == 3
    assert np.array_equal(points[links[0]], [0., 0.])
    assert np.all(levels == 0)
    assert np.all(ndimage.map_coordinates(ground, points.T, order=1) < 0)


def test_flat_accepted_channel_keeps_authored_drainage_and_prefers_a_real_drop():
    assert np.array_equal(downhill_graph([4., 4., 4.], [1, 2, -1]), [1, 2, -1])
    assert np.array_equal(downhill_graph([4., 4., 2.], [1, 2, -1]), [1, 2, -1])


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
    assert np.isclose(1. - ground[2, 2], .012)
    assert ground[2, 1] == 1.9 and ground[2, 3] == -.0001
    assert np.array_equal(levels, [2., 1., 0.])
