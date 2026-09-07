"""Coverage screening must expose missing geometry and disconnected wet ground."""
import numpy as np
import pytest
from .water_coverage import screen_field_tile, require_compiled_stage
from .audit_water_coverage import audit_targets


def test_flowing_proxy_cannot_certify_water_and_access_is_independent_of_depth():
    zero = np.zeros(5)
    bits, classes = screen_field_tile(zero, [10., 1., -3., 1., 10.],
                                      [0., 0., 0., 3., 0.], np.ones(5), np.ones(5),
                                      [0, 255, 255, 255, 128])
    assert classes.tolist() == [0, 1, 2, 3, 4]
    assert bits.tolist() == [0, 6, 0, 0, 0]  # Zero-height access sill blocks the low stage.


def test_upper_stage_change_preserves_lows_and_zero_response_water():
    args = (np.zeros(3), np.array([-2., .004, .005]), np.full(3, -2.),
            np.array([1., 0., 0.]), np.zeros(3), np.full(3, 255))
    old, _ = screen_field_tile(*args)
    new, _ = screen_field_tile(*args, stage=dict(tidalAmplitudeM=.5, seasonalAmplitudeM=3.,
                                               lowTideAmplitudeM=.5, drySeasonAmplitudeM=.28))
    assert old.tolist() == [0, 0, 7]
    assert new.tolist() == [4, 0, 7]
    assert np.array_equal(old & 3, new & 3)
    with pytest.raises(ValueError, match='responses'):
        screen_field_tile(np.zeros(1), np.ones(1), np.zeros(1), [1.1], [0.], [255])


def test_tiled_audit_counts_complete_overlapping_families_once_per_family():
    shape = (3, 5)
    fields = dict(ground2=np.zeros(shape), w2=np.ones(shape), access2=np.zeros(shape),
                  season2=np.ones(shape), tidal2=np.ones(shape), support_kind2=np.full(shape, 255),
                  bodies2=np.ones(shape, np.uint16))
    fields['support_kind2'][2, 4] = 128
    targets = {'all': np.ones(shape, bool), 'lastRow': np.indices(shape)[0] == 2}
    small = audit_targets(fields, targets, tile_size=2)
    assert small == audit_targets(fields, targets, tile_size=256)
    assert small['footprints']['all']['nativeVertices'] == 15
    assert small['footprints']['all']['standingFieldWet'] == dict(low=0, base=14, maximum=14)
    assert small['footprints']['lastRow']['maximumClasses']['flowing-geometry-unverified'] == 1
    assert sum(small['footprints']['lastRow']['maximumClasses'].values()) == 5
    assert small['footprints']['all']['problemGroups'] == [
        {'bodyIndex': 1, 'classification': 'flowing-geometry-unverified', 'nativeVertices': 1,
         'representativeNativeVertex': [2, 4]}]


def test_old_flood_sentinels_cannot_certify_a_higher_stage():
    higher = dict(tidalAmplitudeM=.5, seasonalAmplitudeM=3., lowTideAmplitudeM=.5, drySeasonAmplitudeM=.28)
    with pytest.raises(ValueError, match='compile fresh fields'):
        require_compiled_stage(higher, None)
    assert require_compiled_stage(higher, higher) == higher


def test_mesh_coverage_removes_proxy_failures_from_problem_groups():
    shape = (2, 3)
    fields = dict(ground2=np.zeros(shape), w2=np.ones(shape), access2=np.zeros(shape),
                  season2=np.ones(shape), tidal2=np.ones(shape), support_kind2=np.full(shape, 128),
                  bodies2=np.ones(shape, np.uint16))
    target = np.ones(shape, bool)
    mesh_bits = np.full(shape, 4, np.uint8)
    row = audit_targets(fields, {'river': target}, channel_coverage=(target, mesh_bits))['footprints']['river']
    assert row['standingFieldWet']['maximum'] == 0
    assert row['channelOrStandingFieldWet']['maximum'] == 6
    assert row['maximumUnresolvedAfterSuppliedGeometry'] == 0
    assert row['problemGroups'] == []
