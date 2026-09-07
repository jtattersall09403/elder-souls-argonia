import numpy as np
import pytest

from .water_geometry import condition_channel_profiles
from .water_features import compile_features
from .water_stage import stage_range


def fixture():
    ground = np.full((5, 5), .9)
    ground[2, 1:4] = 1.
    points = np.array([[2., 1.], [2., 2.], [2., 3.]])
    links = np.array([1, 2, -1])
    return ground, points, links


def solve(budget=None):
    ground, points, links = fixture()
    return condition_channel_profiles(ground, points, links, np.full(3, 1.08),
        np.full(3, .5), 3, links, minimum_depth=.08, strict_banks=True,
        peak_depth_budget=budget)


def test_explicit_peak_budget_allows_a_dry_base_without_weakening_peak_depth():
    assert solve()[-1]
    levels, active, accepted, conflicts = solve(np.full(3, 1.4))
    assert not conflicts and np.array_equal(accepted, [1, 2, -1])
    assert np.all(levels[active] < 1.)
    assert np.all(levels[active] + 1.4 >= 1.08)
    # A shared permanent node keeps its original depth requirement.
    assert solve(np.array([1.4, 0., 1.4]))[-1]


def test_invalid_peak_budget_cannot_hide_a_depth_requirement():
    with pytest.raises(ValueError, match='peak depth budgets'):
        solve(np.array([1.4, -1., 1.4]))


def test_seasonal_outlet_taper_keeps_the_pool_fixed_and_the_peak_wet():
    ground, points, links = fixture()
    pools = np.full_like(ground, -np.inf)
    pools[2, 1] = 1.05
    levels, _, _, conflicts = condition_channel_profiles(ground, points, links,
        np.full(3, 1.08), np.full(3, .5), 3, links, pool_levels=pools,
        minimum_depth=.08, strict_banks=True, peak_depth_budget=[0., 1.4, 1.4])
    assert not conflicts and levels[0] == np.float32(1.05)
    assert levels[1] < ground[2, 2]
    assert levels[1] + 1.4 > ground[2, 2] + .015


def export(seasonal=(), minor=True, stage=None):
    ground, points, links = fixture()
    levels, _, accepted, _ = solve(np.full(3, 1.4))
    return compile_features(ground, ground, np.ones_like(ground, bool),
        np.ones_like(ground, np.uint16), points, links, levels, np.full(3, .5),
        3, accepted, np.array([1, 2, 3]), 5, np.ones(3), 1., all_channels=True,
        wetland_rivulets=np.full(3, minor), season_response=np.ones(3),
        tide_response=np.zeros(3), seasonal_sources=seasonal, stage=stage)


def test_export_requires_a_seasonal_regime_and_an_actual_reaching_stage():
    with pytest.raises(ValueError, match='below its native bed'):
        export()
    with pytest.raises(ValueError, match='authored wetland rivulets'):
        export({0, 1}, minor=False)
    records, _ = export({0, 1})
    assert len(records) == 2 and all(r['baseMayBeDry'] for r in records)
    shallow = {**stage_range(), 'seasonalAmplitudeM': .01, 'tidalAmplitudeM': 0.}
    with pytest.raises(ValueError, match='below its native bed'):
        export({0, 1}, stage=shallow)


def test_export_keeps_intermediate_pool_stage_contacts_and_blends_between_them():
    ground = np.ones((7, 7))
    # Original endpoints first; the native reach crosses a pool internally.
    points = np.array([[3., 1.], [3., 5.], [3., 2.], [3., 3.], [3., 4.]])
    links = np.array([2, -1, 3, 4, 1])
    anchors = np.array([np.nan, np.nan, np.nan, 1., np.nan])
    records, _ = compile_features(ground, ground, np.ones_like(ground, bool),
        np.ones_like(ground, np.uint16), points, links, np.full(5, 1.1),
        np.ones(5), 2, np.array([1, -1]), np.array([1, 5]), 7, np.ones(2), 1.,
        all_channels=True, season_response=np.zeros(2), tide_response=np.zeros(2),
        season_response_anchors=anchors, tide_response_anchors=anchors)
    assert len(records) == 1
    for key in ('seasonResponse', 'tideResponse'):
        assert [p[key] for p in records[0]['points']] == [0., .5, 1., .5, 0.]


def test_standing_contact_owner_is_the_same_triangle_corner_as_its_plane():
    from .water_geometry import sample_standing_levels
    ground = np.zeros((3, 3))
    pools = np.full((3, 3), -np.inf)
    pools[1, 1] = 2.
    points = np.array([[1., 1.], [0., 0.]])
    levels, owners = sample_standing_levels(ground, pools, points, return_owners=True)
    np.testing.assert_array_equal(owners, [4, -1])
    assert levels[0] == pools.flat[owners[0]] and np.isneginf(levels[1])
