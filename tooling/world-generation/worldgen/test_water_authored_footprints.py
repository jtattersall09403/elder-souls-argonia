import numpy as np
import pytest
from . import fluvial
from .audit_water_authored_footprints import recover_channel_footprints


def test_pool_hollows_preserve_generation_and_include_tiny_wet_cuts():
    ground = np.full((81, 121), 10., np.float32)
    rivers = np.zeros(ground.shape, bool)
    rivers[:, 5] = True
    wet = np.ones(ground.shape, np.float32)
    ground[40, 6] = 9.  # Near-channel hollows belong to a separate target family.
    ground[40, 45] = 9.
    wet[40, 45] = 0.
    ground[40, 75] = 9.
    ground[40, 100] = 11.  # Raised wetland ground is not a hollow.
    ground[10, 75] = 9.
    wet[10, 75] = 1e-9  # Real predicate, even when subtraction rounds away.
    mask = np.zeros(ground.shape, bool)
    expected = fluvial._deepen_wetland_pools(ground.copy(), rivers, wet)
    actual = fluvial._deepen_wetland_pools(ground.copy(), rivers, wet, footprint=mask)
    assert np.array_equal(actual, expected)
    assert mask[40, 75] and mask[10, 75]
    assert actual[10, 75] == ground[10, 75]
    assert not mask[40, 6] and not mask[40, 45] and not mask[40, 100]
    assert not np.any((actual < ground) & ~mask)


def test_footprints_include_naturally_low_channel_and_exclude_far_ground():
    shape = (41, 61)
    ground = np.full(shape, 10., np.float32)
    ambient = ground.copy()
    rivers = np.zeros(shape, np.uint8); rivers[:, 10] = 1
    area = np.zeros(shape, np.float32); area[:, 10] = .1; area[:, 38:43] = .05
    wet = np.ones(shape, np.float32); regions = np.zeros(shape, np.uint8)
    steep = np.zeros(shape, bool)
    ground[20, 10] = ground[20, 40] = 3.
    channel = fluvial._carve_channels(ground.copy(), rivers > 0, area, steep, ambient)
    minor = fluvial._rivulets(channel.copy(), rivers > 0, area, wet, ambient)
    history = dict(prefluvialGround=ground, ambient=ambient, steep=steep,
                   continuumChannels=ground-channel, rivulets=channel-minor)
    masks = recover_channel_footprints(history, rivers, area, wet, regions)
    assert history['continuumChannels'][20, 10] == history['rivulets'][20, 40] == 0
    assert masks['continuumChannels'][20, 10] and masks['rivulets'][20, 40]
    assert not masks['continuumChannels'][20, 60] and not masks['rivulets'][20, 60]
    assert not np.any((history['rivulets'] > 0) & ~masks['rivulets'])
    history['rivulets'][20, 40] = .1
    with pytest.raises(ValueError, match='Rivulet replay differs'):
        recover_channel_footprints(history, rivers, area, wet, regions)


def test_pool_replay_requires_exact_final_natural_ground():
    from .refine_province import SEED, STEP
    shape = (61, 81)
    ground = np.full(shape, 10., np.float32)
    ground[30, 60] = 9.
    rivers = np.zeros(shape, np.uint8)
    rivers[:, 10] = 1
    riv = rivers > 0
    area = np.where(riv, .1, 0).astype(np.float32)
    wet = np.ones(shape, np.float32)
    steep = np.zeros(shape, bool)
    history = dict(prefluvialGround=ground.copy(), ambient=ground.copy(), steep=steep)

    def record(name, function, *args):
        nonlocal ground
        before = ground.copy()
        result = function(ground, *args)
        ground = result[0] if isinstance(result, tuple) else result
        history[name] = np.maximum(0, before-ground)

    record('continuumChannels', fluvial._carve_channels, riv, area, steep, history['ambient'])
    record('rivulets', fluvial._rivulets, riv, area, wet, history['ambient'])
    ground = fluvial._levees_and_floodplain(ground, riv, area, steep)
    rng = np.random.default_rng(SEED ^ 139)
    record('oxbows', fluvial._oxbows, riv, area, steep, rng)
    record('wetlandCompaction', fluvial._wetland_compaction, wet, riv)
    record('wetlandPools', fluvial._deepen_wetland_pools, riv, wet)
    continuation = dict(salinity=np.zeros(shape, np.float32),
                        rivers=np.zeros((2, 2), np.uint8),
                        flow_to=np.full((2, 2), -1), filled=np.zeros((2, 2)))
    record('deltas', fluvial._delta, riv, area, continuation['salinity'], rng)
    record('bedConditioning', fluvial._condition_bed, continuation['rivers'],
           continuation['flow_to'], continuation['filled'], STEP)
    continuation['ungraded_ground'] = ground.copy()
    regions = np.zeros(shape, np.uint8)
    masks = recover_channel_footprints(history, rivers, area, wet, regions, continuation)
    assert masks['wetlandPoolHollows'][30, 60]
    continuation['ungraded_ground'][0, 0] += 1
    with pytest.raises(ValueError, match='original ungraded terrain'):
        recover_channel_footprints(history, rivers, area, wet, regions, continuation)
