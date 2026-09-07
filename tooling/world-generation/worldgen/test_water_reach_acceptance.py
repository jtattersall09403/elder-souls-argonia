import numpy as np
from .water_reach_acceptance import restore_feasible_reaches


def test_upstream_reach_returns_after_obstructed_downstream_record_is_removed():
    # Both low banks initially fail against the final5m pool. Removing the
    # downstream record also removes the cause of the upstream failure.
    edges = np.array([[0, 1], [1, 2], [2, 3]])
    owner = np.array([0, 1, 1])
    lower = np.array([0., 0., 0., 5.])
    cap = np.array([1., 5., 1., 5.])
    keep, restored = restore_feasible_reaches(edges, owner, np.zeros(3, bool), lower, cap, lower)
    assert keep.tolist() == [True, False, False] and restored == [0]
    # Restoring the blocked downstream record must still fail against the
    # upstream retained bank, even if its own intermediate bank is higher.
    cap[2] = 5.
    keep, restored = restore_feasible_reaches(edges, owner, np.array([True, False, False]), lower, cap, lower)
    assert keep.tolist() == [True, False, False] and not restored


def test_profile_conditioner_exports_recovered_upstream_reach(monkeypatch):
    from . import water_bank_sections
    from .water_geometry import condition_channel_profiles
    # Original stations0→1→2; native station3 lies inside reach1→2.
    points = np.array([[2., 1.], [2., 2.], [2., 4.], [2., 3.]])
    links = np.array([1, 3, -1, 2])
    ground = np.zeros((5, 6)); ground[2, 4] = 4.8
    monkeypatch.setattr(water_bank_sections, 'bank_crest_heights',
                        lambda *args: np.array([1.005, 5.005, 5.005, 1.005]))
    levels, active, accepted, conflicts = condition_channel_profiles(
        ground, points, links, np.array([.2, .2, 5., .2]), np.ones(4),
        3, np.array([1, 2, -1]), minimum_depth=.2, strict_banks=True,
        orientation_levels=np.array([10., 9., 0.]))
    assert accepted.tolist() == [1, -1, -1]
    assert set(conflicts) == {1} and active[0]
    assert np.allclose(levels[:2], [.2, .2])
