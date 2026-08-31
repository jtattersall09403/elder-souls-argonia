"""Unit tests for the interior/settlement miners.

Synthetic inputs only — the real plugins are not in the test environment, so
these pin the *statistics* (snap detection, chamber segmentation, two-level
building clustering) rather than any mined number.
"""

from __future__ import annotations

import math

from .mine_interiors import (
    SNAP_GRIDS,
    Adjacency,
    Piece,
    SnapStats,
    _kit_family,
    chambers,
)
from .mine_settlements import Building, cluster, structures


def _piece(x, y, z, name="dungeons/nordic/norrmsmfloor01.nif", yaw=0.0):
    return Piece(species=name, category="dungeon-kit", x=x, y=y, z=z,
                 rot=(0.0, 0.0, yaw), scale=1.0)


def test_kit_family_is_directory_first():
    assert _kit_family("meshes/dungeons/nordic/rooms/a.nif") == "dungeons/nordic"
    assert _kit_family("architecture/whiterun/wrhouse01.nif") == "architecture/whiterun"


def test_snap_detects_a_grid_and_reports_lift():
    stats = SnapStats()
    for i in range(200):
        a = _piece(0.0, 0.0, 0.0)
        b = _piece(128.0 * (1 + i % 3), 0.0, 0.0)
        stats.add_pair(a, b)
        stats.add_piece(a)
    report = stats.report()
    # y and z deltas are zero; x lands on 128 every time.
    assert report["zeroAxisFraction"] > 0.6
    assert report["nonZeroAxisOnGrid"]["128"] == 1.0
    assert report["nonZeroAxisOnGridLiftOverChance"]["128"] > 10
    assert report["yawOnMultipleOf"]["90"] == 1.0
    assert report["tiltedFraction"] == 0.0


def test_snap_reports_no_quantisation_for_scattered_pieces():
    stats = SnapStats()
    for i in range(400):
        a = _piece(0.0, 0.0, 0.0)
        b = _piece(37.3 + i * 3.11, 11.7 + i * 5.03, 2.9 + i * 1.7)
        stats.add_pair(a, b)
        stats.add_piece(a)
    lift = stats.report()["nonZeroAxisOnGridLiftOverChance"]
    assert all(lift[str(g)] < 3.0 for g in SNAP_GRIDS if g < 512)


def test_chambers_split_on_the_link_distance():
    near = [_piece(i * 100.0, 0.0, 0.0) for i in range(10)]
    far = [_piece(5000.0 + i * 100.0, 0.0, 0.0) for i in range(10)]
    rooms = chambers(near + far)
    assert len(rooms) == 2
    assert sorted(len(r) for r in rooms) == [10, 10]


def test_adjacency_records_join_offsets():
    adj = Adjacency()
    for _ in range(30):
        adj.add_chamber([
            _piece(0.0, 0.0, 0.0, "kit/a.nif"),
            _piece(256.0, 0.0, 0.0, "kit/b.nif"),
        ] + [_piece(600.0 + i * 40, 0.0, 0.0, "kit/c.nif") for i in range(8)])
    rows = adj.report()
    pair = next(r for r in rows if {r["a"], r["b"]} == {"kit/a.nif", "kit/b.nif"})
    assert pair["chambers"] == 30
    assert math.isclose(pair["joinOffsets"][0]["planarM"], 3.64, abs_tol=0.05)


def _building(x, y, yaw=0.0):
    return Building(species="architecture/phitt/hut01.nif", kit="architecture/phitt",
                    x=x, y=y, z=0.0, yaw_deg=yaw, size_m=(6.0, 5.0, 4.0))


def test_structures_fuse_kit_pieces_into_one_building():
    # Two houses of three pieces each, 40 m apart.
    pieces = [_building(0, 0), _building(3, 0), _building(0, 3),
              _building(40, 0), _building(43, 0), _building(40, 3)]
    built = structures(pieces, 8.0)
    assert len(built) == 2
    assert {s.pieces for s in built} == {3}


def test_cluster_groups_by_link_distance():
    pieces = [_building(0, 0), _building(10, 0), _building(200, 0)]
    groups = cluster(pieces, 45.0)
    assert sorted(len(g) for g in groups) == [1, 2]
