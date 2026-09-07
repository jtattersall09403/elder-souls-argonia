import numpy as np
import pytest
from .water_authored_pools import retain_authored_pool_basins


def test_authored_selection_adds_whole_ponds_and_preserves_existing():
    labels = np.repeat(np.arange(6)[:, None], 30, axis=1)
    authored = np.zeros(labels.shape, bool)
    authored[0, 0] = authored[2, 0] = authored[3, 0] = authored[4, 0] = True
    existing = np.array([False, True, False, False, False, False])
    depths = np.array([.01, .5, .09, .5, .5])
    areas = np.array([30, 30, 30, 23, 30])
    result = retain_authored_pool_basins(existing, labels, authored, depths, areas)
    assert result.tolist() == [False, True, True, False, False, False]
    assert result[labels][2].all()  # One authored hollow retains the whole basin.
    assert existing.tolist() == [False, True, False, False, False, False]
    with pytest.raises(ValueError, match='matching component'):
        retain_authored_pool_basins(existing, labels, authored[:, :-1], depths, areas)
