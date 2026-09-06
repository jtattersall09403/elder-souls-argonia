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
