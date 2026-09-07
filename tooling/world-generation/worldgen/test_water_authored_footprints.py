import numpy as np
import pytest
from . import fluvial
from .audit_water_authored_footprints import recover_channel_footprints


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
