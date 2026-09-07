import numpy as np
from .water_boundaries import ChannelOwnership, channel_cross_section, spill_connected_access


def test_shared_station_domain_does_not_depend_on_incident_record_id():
    ownership = ChannelOwnership(np.array([[0., 0.], [2., 0.], [2., 2.]]),
        np.array([1, 2, -1]), np.array([12., 10., 8.]), np.array([0, 1, 1]))
    probes = np.array([[1.8, .2], [2.2, -.2]])
    first = ownership.compatible(probes, 0, 10., anchor=[2., 0.])
    second = ownership.compatible(probes, 1, 10., anchor=[2., 0.])
    assert np.array_equal(first, second)
    assert first.all()
from .water_geometry import refine_channel_stations
from .water_features import compile_features


def test_distinct_standing_planes_keep_shared_basin_but_never_share_owner():
    from .water_boundaries import hydraulic_plane_owners
    basins = np.ones((3, 3), dtype=np.uint16)
    wet = np.ones((3, 3), bool)
    labels = np.zeros((3, 3), dtype=np.int32)
    labels[0, 0], labels[2, 2] = 1, 2
    owners, records = hydraulic_plane_owners(basins, wet, labels, labels > 0, np.indices((3, 3)))
    assert owners[0, 0] != owners[2, 2]
    by_index = {record['index']: record for record in records}
    assert by_index[int(owners[0, 0])]['basinIndex'] == by_index[int(owners[2, 2])]['basinIndex'] == 1
    assert len({record['id'] for record in records}) == len(records)


def test_width_audit_counts_connected_asymmetric_banks_and_rejects_dry_core():
    from .audit_water_sections import connected_width
    point = {'crossSection': [
        {'offsetM': -1., 'accessOffsetM': 1.},
        {'offsetM': 0., 'accessOffsetM': -1.},
        {'offsetM': 4., 'accessOffsetM': 1.}]}
    assert connected_width(point) == 2.5
    assert connected_width(point, -2.) == 0
    assert connected_width(point, 1.) == 5


def test_terrain_protection_uses_asymmetric_flood_envelope():
    from .water_terrain_mask import ribbon_vertex_mask
    section = [{'offsetM': -1}, {'offsetM': 4}]
    points = [{'x': 4., 'z': z, 'crossSection': section} for z in (2., 6.)]
    mask = ribbon_vertex_mask((10, 10), [{'points': points}], 1)
    # Flow +Z has normal -X: the broad positive side is west, not east.
    assert mask[4, 0] and mask[4, 4] and mask[4, 5]
    assert not mask[4, 8]


def test_packed_sections_merge_quantized_duplicates_and_round_trip(tmp_path):
    import json
    from .water_cross_sections import pack_cross_sections, load_water_metadata
    meta = {'ribbons': [{'id': 'water-ribbon.test', 'points': [{'crossSection': [
        {'offsetM': -1.827839, 'groundM': 1., 'accessOffsetM': -.2},
        {'offsetM': -1.827841, 'groundM': 1.000001, 'accessOffsetM': -.199999},
        {'offsetM': 0., 'groundM': .5, 'accessOffsetM': -.5},
        {'offsetM': 2., 'groundM': 2., 'accessOffsetM': 1.}]}]}]}
    pack_cross_sections(meta, tmp_path)
    assert meta['crossSections']['sampleCount'] == 3
    assert 'crossSection' not in meta['ribbons'][0]['points'][0]
    (tmp_path / 'water-meta.json').write_text(json.dumps(meta))
    loaded = load_water_metadata(tmp_path)['ribbons'][0]['points'][0]['crossSection']
    assert np.all(np.diff([sample['offsetM'] for sample in loaded]) > 0)
    assert loaded[0]['groundM'] >= 1
    assert len((tmp_path / 'water-cross-sections.bin').read_bytes()) == 36


def test_shared_coarse_reach_cannot_claim_remote_lower_plunge_plane():
    ownership = ChannelOwnership(np.array([[0., 0.], [0., 5.], [1., 0.], [1., 5.]]),
        np.array([1, -1, 3, -1]), np.array([10., 10., 4., 4.]), np.full(4, 7))
    assert not ownership.compatible(np.array([[.9, 2.5]]), 7, 10., anchor=[0., 0.])[0]
    assert ownership.compatible(np.array([[.1, 2.5]]), 7, 10., anchor=[0., 0.])[0]


def test_lower_plunge_cannot_claim_upper_bank_it_cannot_reach_at_peak():
    ground = np.tile([9., 9., 9., 9., 0., 0.], (9, 1))
    points = np.array([[0., 1.], [8., 1.], [0., 4.], [8., 4.]])
    ownership = ChannelOwnership(points, np.array([1, -1, 3, -1]),
        np.array([10., 10., 0., 0.]), np.array([0, 0, 2, 2]), ground=ground)
    probes = np.array([[4., 2.7], [4., 3.9]])
    assert ownership.compatible(probes, 0, 10., anchor=[0., 1.]).tolist() == [True, False]
    assert ownership.compatible(probes[1:], 2, 0., anchor=[0., 4.])[0]
    # A higher allowed tide genuinely makes the lower reach competitive.
    high_stage = ChannelOwnership(points, np.array([1, -1, 3, -1]),
        np.array([10., 10., 0., 0.]), np.array([0, 0, 2, 2]), ground=ground, maximum_offset=10.)
    assert not high_stage.compatible(probes[:1], 0, 10., anchor=[0., 1.])[0]


def test_nearest_reachable_portion_of_falling_segment_is_not_discarded():
    ownership = ChannelOwnership(np.array([[0., 0.], [10., 0.]]),
        np.array([1, -1]), np.array([10., 0.]), np.array([0, 0]))
    segment, fraction = ownership.reachable_nearest(np.array([[8., 1.]]), np.array([7.]))
    assert segment.tolist() == [0]
    assert np.allclose(fraction, [.3])


def test_reachable_owner_search_expands_past_nearby_low_water():
    points = np.array([[0., x] for x in np.linspace(.1, 1., 20)] + [[-10., 3.], [10., 3.]])
    links = np.full(22, -1); links[20] = 21
    ownership = ChannelOwnership(points, links, np.r_[np.zeros(20), 10., 10.], np.arange(22))
    segment, fraction = ownership.reachable_nearest(np.array([[0., 0.]]), np.array([8.]))
    assert segment.tolist() == [20]
    assert np.allclose(fraction, [.5])


def test_rejected_channel_does_not_truncate_an_accepted_ribbon():
    ground = np.zeros((9, 9))
    points = np.array([[0., 2.], [8., 2.], [0., 6.], [8., 6.]])
    links = np.array([1, -1, 3, -1])
    ribbons, _ = compile_features(ground, ground, np.ones_like(ground), np.ones_like(ground),
        points, links, np.array([8., 8., 4., 4.]), np.ones(4), 4,
        np.array([1, -1, -1, -1]), np.arange(4), 9, np.ones(4), 1., all_channels=True)
    assert len(ribbons) == 1
    point = ribbons[0]['points'][0]
    east = max(point['x'] + point['crossSectionNormalX']*s['offsetM'] for s in point['crossSection'])
    assert abs(east-8.) < 1e-4
    # A diagnostic export filter must not remove a real competing owner.
    filtered, _ = compile_features(ground, ground, np.ones_like(ground), np.ones_like(ground),
        points, links, np.array([8., 8., 4., 4.]), np.ones(4), 4,
        links, np.arange(4), 9, np.ones(4), 1., all_channels=True, source_filter={0})
    point = filtered[0]['points'][0]
    east = max(point['x'] + point['crossSectionNormalX']*s['offsetM'] for s in point['crossSection'])
    assert abs(east-4.) < 1e-3


def test_native_shore_protection_uses_local_stage_not_global_season_for_sea():
    from .water_terrain_mask import moving_shore_mask
    gap = np.array([-1., -.5, .5, 1.])
    support = np.full(4, 255)
    assert np.array_equal(moving_shore_mask(gap, support, 0., 1.), [False, True, True, False])
    assert np.array_equal(moving_shore_mask(gap, support, 1., 0.), [False, False, True, True])


def test_independent_banks_keep_the_broad_wet_side():
    # Thalweg near one bank: the opposite bank must not inherit its width.
    x = np.arange(17) - 8
    bed = np.where(x < 0, -1 + abs(x) * 2, -1 + x * .25)
    ground = np.broadcast_to(bed, (5, 17)).astype(float)
    section, widths = channel_cross_section(ground, [2, 8], [0, 1], 6, 0, 1)
    assert abs(widths[0] - .49975) < .001
    assert abs(widths[1] - 3.998) < .001
    assert min(p['offsetM'] for p in section) < -.5
    assert max(p['offsetM'] for p in section) > 4
    assert any(p['offsetM'] == 0 for p in section)


def test_low_outer_slope_waits_for_the_intervening_bank():
    ground = np.broadcast_to(np.array([-1, -1, -1, .7, 1, .6, -.4, -.8, -1]), (5, 9))
    section, _ = channel_cross_section(ground, [2, 2], [0, 1], 6, 0, 1)
    outer = next(p for p in section if p['offsetM'] == 6)
    assert outer['groundM'] == -1
    assert outer['accessOffsetM'] == 1
    # Dry season still wets the deep core. A zero seed threshold would
    # erroneously turn off whole rivers as soon as the season went negative.
    centre = next(p for p in section if p['offsetM'] == 0)
    assert centre['accessOffsetM'] == -1


def test_maximum_flood_domain_stops_at_an_inaccessible_crest():
    ground = np.broadcast_to(np.array([-1, -1, -1, 1, 3, -1, -1, -1, -1]), (5, 9))
    section, _ = channel_cross_section(ground, [2, 2], [0, 1], 6, 0, 1)
    assert max(p['offsetM'] for p in section) <= 1.75
    assert section[-1]['accessOffsetM'] > 1.9


def test_refined_stations_keep_interpolated_semantic_depth():
    ground = np.zeros((9, 9))
    ground[:, 4] = .4
    points, links, levels, radius, owners = refine_channel_stations(
        ground, np.array([[4., 1.], [4., 7.]]), np.array([1, -1]),
        np.array([.3, .85]), np.array([1., 1.]), minimum_depth=np.array([.3, .85]))
    for point, level in zip(points[2:], levels[2:]):
        fraction = (point[1] - 1) / 6
        target = .3 * (1 - fraction) + .85 * fraction
        # Profile is allowed to retain an even higher physical source head.
        from scipy.ndimage import map_coordinates
        bed = map_coordinates(ground, point[:, None], order=1)[0]
        assert level >= bed + target - 1e-6


def test_parallel_meanders_are_distinct_owners_even_in_one_connected_body():
    points = np.array([[0., 2.], [8., 2.], [0., 6.], [8., 6.]])
    links, owners = np.array([1, -1, 3, -1]), np.array([0, 0, 2, 2])
    ownership = ChannelOwnership(points, links, np.array([8., 8., 4., 4.]), owners)
    section, _ = channel_cross_section(np.zeros((9, 9)), [4, 2], [0, 1], 6, 8, 1,
                                        ownership=ownership, source=0)
    assert 1.99 <= max(p['offsetM'] for p in section) <= 2.001
    assert all(p['offsetM'] < 4 for p in section)
    # A same-plane confluence has no spurious owner-ID clipping seam.
    same_plane = ChannelOwnership(points, links, np.array([8., 8., 8., 8.]), owners)
    section, _ = channel_cross_section(np.zeros((9, 9)), [4, 2], [0, 1], 6, 8, 1,
                                        ownership=same_plane, source=0)
    assert section[-1]['offsetM'] == 6


def test_another_standing_pool_plane_is_not_claimed_as_dry_channel_margin():
    pool = np.full((9, 9), -np.inf)
    pool[:, 5:] = 2
    ownership = ChannelOwnership(np.array([[0., 2.], [8., 2.]]), np.array([1, -1]),
                                 np.array([4., 4.]), np.array([0, 0]), pool)
    section, _ = channel_cross_section(np.zeros((9, 9)), [4, 2], [0, 1], 6, 4, 1,
                                        ownership=ownership, source=0)
    assert 2.49 < section[-1]['offsetM'] <= 2.5


def test_flood_margin_crosses_lower_land_only_after_connected_spill_is_overtopped():
    ground = np.full((5, 9), -.5)
    ground[:, 2] = .8
    surface = np.zeros_like(ground)
    wet = np.zeros_like(ground, bool)
    wet[:, 0] = True
    access, support = spill_connected_access(ground, surface, wet, np.ones_like(ground, np.uint16))
    assert np.allclose(access[:, 0], -.5)
    assert np.allclose(access[:, 3:], .8)
    assert support.all()


def test_flood_margin_never_propagates_a_different_hydraulic_head_or_owner():
    ground = np.full((5, 9), -.5)
    surface = np.zeros_like(ground)
    surface[:, 4:] = 5
    wet = np.zeros_like(ground, bool)
    wet[:, 0] = True
    bodies = np.ones_like(ground, np.uint16)
    access, _ = spill_connected_access(ground, surface, wet, bodies)
    assert np.all(access[:, 4:] == 2)
    surface[:] = 0
    bodies[:, 4:] = 2
    access, _ = spill_connected_access(ground, surface, wet, bodies)
    assert np.all(access[:, 4:] == 2)


def test_flood_support_has_no_arbitrary_distance_ring_inside_reachable_water():
    ground = np.zeros((5, 150))
    ground[:, 0] = -.5
    wet = ground < 0
    access, support = spill_connected_access(ground, np.zeros_like(ground), wet,
                                              np.ones_like(ground, np.uint16))
    assert support[:, -1].all()
    assert np.all(access[:, -1] == 0)


def test_full_bank_closure_expands_past_semantic_radius_to_a_real_crest():
    ground = np.zeros((5, 12))
    ground[:, 8] = 4
    audit = {}
    section, _ = channel_cross_section(ground, [2, 2], [0, 1], 1, 1, 1,
                                        close_domain=True, diagnostics=audit)
    assert section[-1]['offsetM'] > 5
    assert section[-1]['accessOffsetM'] > 1.9
    assert audit['boundaryKinds'] == ['world-edge', 'terrain-bank']


def test_native_zx_cross_section_sign_matches_runtime_xz_and_level_response_is_owned():
    x = np.arange(9) - 4
    ground = np.broadcast_to(np.where(x < 0, -1 + abs(x) * 2, -1 + x * .25), (9, 9)).astype(float)
    ribbons, _ = compile_features(ground, np.zeros_like(ground), np.ones_like(ground, bool),
        np.ones_like(ground, np.uint16), np.array([[1., 4.], [7., 4.]]), np.array([1, -1]),
        np.array([0., 0.]), np.array([1., 1.]), 2, np.array([1, -1]), np.array([0, 1]), 9,
        np.array([1, 1]), 1, all_channels=True, season_response=np.array([1., .5]),
        tide_response=np.array([0., .25]))
    point = ribbons[0]['points'][0]
    positive_bank = next(p for p in point['crossSection'] if p['offsetM'] >= .5)
    assert positive_bank['groundM'] >= 0  # Positive means west for a southbound river.
    assert any(p['offsetM'] < -2 and p['groundM'] < 0 for p in point['crossSection'])
    assert point['seasonResponse'] == 1 and point['tideResponse'] == 0
    assert ribbons[0]['points'][-1]['seasonResponse'] == .5
    assert ribbons[0]['points'][-1]['tideResponse'] == .25
