import numpy as np
import pytest
from .water_stage import stage_range, access_bounds
from .water_boundaries import spill_connected_access, channel_cross_section
from .water_terrain_mask import moving_shore_mask
from .audit_water_bankfull import section_peak_requirement


def test_upper_stage_extension_preserves_low_water_and_encoding_guard():
    stage = stage_range()
    stage['seasonalAmplitudeM'] = 4.
    assert stage_range(stage)['drySeasonAmplitudeM'] == .28
    lo, hi = access_bounds(stage)
    assert lo == -2 and hi > 4.5 + .04
    assert moving_shore_mask(np.array([3., -.4]), np.array([255, 255]), 1., 0., stage).tolist() == [True, False]


@pytest.mark.parametrize('value', [{}, {'seasonalAmplitudeM': 4}, {**stage_range(), 'tidalAmplitudeM': float('nan')}])
def test_invalid_stage_ranges_fail(value):
    with pytest.raises(ValueError): stage_range(value)


def test_extended_flood_crosses_newly_reachable_bank_without_claiming_unvisited_owners():
    ground = np.array([[-1., 3., 1., 9., -1.]])
    wet = np.array([[True, False, False, False, False]])
    bodies = np.ones_like(ground, dtype=int)
    access, support = spill_connected_access(ground, np.zeros_like(ground), wet, bodies, maximum_offset=4.)
    assert np.allclose(access[0, :3], [-1., 3., 3.])
    assert (access[0, 3:] > 4.04).all()
    old_access, _ = spill_connected_access(ground, np.zeros_like(ground), wet, bodies)
    assert (old_access[0, 1:] > 1.94).all()


def test_extended_cross_section_reaches_high_bank_and_keeps_dry_guard():
    ground = np.broadcast_to([-1., -1., 0., 3., 1., 5., 6.], (3, 7))
    old, _ = channel_cross_section(ground, [1, 1], [0, 1], 1, 0, 1, close_domain=True)
    new, _ = channel_cross_section(ground, [1, 1], [0, 1], 1, 0, 1, close_domain=True, maximum_offset=4.)
    assert new[-1]['offsetM'] > old[-1]['offsetM']
    assert new[-1]['accessOffsetM'] > 4.


def test_fullness_measures_both_banks_and_intervening_sills():
    ground = np.broadcast_to([0., 1., -1., -1., 4., 0., 0.], (3, 7))
    assert section_peak_requirement(ground, [1, 3], [0, 1], 0, 3, 1) == 4.
