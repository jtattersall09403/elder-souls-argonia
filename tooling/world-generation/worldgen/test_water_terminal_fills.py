"""Terminal topology and additive end-fill contracts, without province assets."""

import numpy as np
import pytest
from .water_terminal_fills import terminal_directions
from .water_features import compile_features


def test_rejected_continuation_is_not_a_terminal():
    points = np.array([[2., 2.], [3., 2.], [4., 2.]])
    authored = np.array([1, 2, -1])
    accepted = np.array([1, -1, -1])
    directions = terminal_directions(points, authored, 3, accepted, authored, np.ones(3))
    assert set(directions) == {0}
    assert np.array_equal(directions[0], [-1., 0.])
    with pytest.raises(ValueError, match='subset'):
        terminal_directions(points, authored, 3, [2, -1, -1], authored, np.ones(3))


def test_coincident_junction_and_different_heads_are_not_terminals():
    points = np.array([[2., 2.], [3., 2.], [3., 2.], [4., 3.]])
    links = np.array([1, -1, 3, -1])
    directions = terminal_directions(points, links, 4, links, links, np.ones(4))
    assert set(directions) == {0, 3}  # Coordinate join, despite separate indices.
    points = np.array([[2., 2.], [3., 2.], [2., 2.], [3., 2.]])
    assert terminal_directions(points, links, 4, links, links, [1., 1., 2., 2.]) == {}


def test_terminal_direction_uses_native_route_not_coarse_chord():
    points = np.array([[2., 2.], [4., 4.], [2., 3.], [3., 4.]])
    links = np.array([2, -1, 3, 1])
    directions = terminal_directions(points, links, 2, [1, -1], [1, -1], np.ones(4))
    assert np.array_equal(directions[0], [0., -1.])
    assert np.array_equal(directions[1], [1., 0.])


def test_backtracking_route_is_not_an_authored_terminal():
    points = np.array([[2., 2.], [3., 2.], [2., 3.], [2., 2.]])
    links = np.array([1, 3, -1, 2])
    directions = terminal_directions(points, links, 3, [1, 2, -1], [1, 2, -1], np.ones(4))
    assert 1 not in directions


def test_export_preserves_longitudinal_records_and_shares_terminal_rays():
    ground = np.zeros((25, 25), np.float32)
    points = np.array([[12., 10.], [12., 14.]])
    links = np.array([1, -1])
    args = (ground, ground + 1, np.ones_like(ground, bool), np.ones_like(ground, np.uint16),
            points, links, np.ones(2), np.ones(2), 2, links, np.array([0, 1]),
            25, np.ones(2), 1.)
    old, _ = compile_features(*args, all_channels=True)
    new, _ = compile_features(*args, all_channels=True, terminal_authored_links=links)
    assert new[:len(old)] == old
    caps = new[len(old):]
    assert len(caps) == 16
    for start in (0, 8):
        fan = caps[start:start + 8]
        anchor = old[0]['points'][start // 8]
        for i, cap in enumerate(fan):
            assert cap['geometryRole'] == 'landing'
            if i:
                assert fan[i - 1]['points'][1] is cap['points'][0]
            for ray in cap['points']:
                assert [ray[k] for k in ('x', 'y', 'z')] == [anchor[k] for k in ('x', 'y', 'z')]
                assert ray['crossSection'][0]['offsetM'] == 0
                assert ray['boundaryKinds'][0] == 'section-join'
                assert 'fallingToNext' not in ray
        # Outer joins are the existing section's exact serialized endpoints.
        assert fan[0]['points'][0]['crossSection'][-1] == anchor['crossSection'][-1]
        last = fan[-1]['points'][1]['crossSection'][-1]
        assert last == {**anchor['crossSection'][0], 'offsetM': -anchor['crossSection'][0]['offsetM']}
