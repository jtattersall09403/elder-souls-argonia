import numpy as np
import pytest
from .water_station_anchors import apply_station_overrides


def fixture():
    original = np.full((5, 5), 5.)
    original[2, 1] = 3.
    pool = np.full((5, 5), -np.inf)
    pool[2, 1] = 4.
    record = {'previous': [2, 2], 'point': [2, 1], 'poolHeadM': 4.}
    return original, pool, record


def test_dry_bank_anchor_moves_into_original_pool_without_moving_id_or_ground():
    original, pool, record = fixture()
    points = np.array([[2., 2.], [3., 3.]])
    result = apply_station_overrides(points, [7, 8], {7: record}, original, pool)
    assert np.array_equal(result, [[2, 1], [3, 3]])
    assert np.array_equal(points, [[2, 2], [3, 3]])
    assert original[2, 2] == 5 and pool[2, 1] == 4


@pytest.mark.parametrize('change', [dict(previous=[1, 2]), dict(point=[2, 4]),
    dict(point=[2.1, 1]), dict(poolHeadM=3.5), dict(point=[-1, 1])])
def test_unreviewed_anchor_or_other_pool_cannot_be_substituted(change):
    original, pool, record = fixture()
    with pytest.raises(ValueError):
        apply_station_overrides([[2, 2]], [7], {7: {**record, **change}}, original, pool)


def test_original_wet_anchor_cannot_be_moved_to_hide_a_bed_problem():
    original, pool, record = fixture()
    original[2, 2] = 3.
    with pytest.raises(ValueError, match='originally dry'):
        apply_station_overrides([[2, 2]], [7], {7: record}, original, pool)


def test_reviewed_channel_anchor_uses_existing_lateral_bed_without_excavation():
    original=np.full((11,11),10.)
    original[5,7]=8.
    pools=np.full_like(original,-np.inf)
    record=dict(kind='channel-thalweg',previous=[5,5],point=[5,7])
    context={7:dict(centre=[5,5],direction=[1,0],radius=3.,depth=.3)}
    args=([[5,5]],[7],{7:record},original,pools)
    result=apply_station_overrides(*args,channel_context=context)
    assert np.array_equal(result,[[5,7]]) and original[5,7]==8.
    with pytest.raises(ValueError,match='original channel geometry'):
        apply_station_overrides(*args)
    original[5,6]=12.
    with pytest.raises(ValueError,match='without crossing a bank'):
        apply_station_overrides(*args,channel_context=context)
    original[5,6]=10.;pools[5,7]=8.5
    with pytest.raises(ValueError,match='standing or marine'):
        apply_station_overrides(*args,channel_context=context)
    pools[5,7]=-np.inf
    context[7].update(rivulet=True,footprint=np.zeros_like(original,bool))
    with pytest.raises(ValueError,match='authored rivulet footprint'):
        apply_station_overrides(*args,channel_context=context)
