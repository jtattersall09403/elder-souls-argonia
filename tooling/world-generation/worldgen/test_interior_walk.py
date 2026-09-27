"""walkRule inside a bundle (owner ruling B, interiors round 2): a two-storey
cell's upper sockets are reached by its stairs (a ramp deck), a sealed room is
not, and the storey count of the same cell is 2."""

from __future__ import annotations

import math

import numpy as np
import pytest

trimesh = pytest.importorskip("trimesh")
pytest.importorskip("scipy")

from . import interior_walk as iw  # noqa: E402
from .interior_cells import storeys_from_levels  # noqa: E402


def _box(lo, hi):
    lo, hi = np.asarray(lo, float), np.asarray(hi, float)
    b = trimesh.creation.box(extents=hi - lo)
    b.apply_translation((lo + hi) / 2)
    return b


def _ramp(x0, x1, rise, z0, z1):
    run = x1 - x0
    length = math.hypot(run, rise)
    b = trimesh.creation.box(extents=[length, 0.2, z1 - z0])
    b.apply_transform(trimesh.transformations.rotation_matrix(math.atan2(rise, run), [0, 0, 1]))
    b.apply_translation([(x0 + x1) / 2, rise / 2 - 0.1, (z0 + z1) / 2])
    return b


def _cell(with_ramp=True):
    parts = [
        _box([0, -0.2, 0], [12, 0, 8]),          # ground floor
        _box([6, 3.0, 0], [12, 3.2, 8]),         # upper floor (storey 2)
        # a sealed room on the ground floor, walled up to the upper floor
        _box([9.3, 0, 5.0], [9.5, 3.0, 8]),
        _box([9.3, 0, 4.8], [12, 3.0, 5.0]),
    ]
    if with_ramp:
        parts.append(_ramp(0.0, 6.0, 3.2, 0.0, 2.0))  # 28 deg: the stairs as a walkable deck
    owner = np.concatenate([np.full(len(p.faces), i) for i, p in enumerate(parts)])
    return trimesh.util.concatenate(parts), owner


TARGETS = [
    {"id": "ground-bench", "positionM": [3.0, 0.0, 6.0]},
    {"id": "upper-bed", "positionM": [10.0, 3.2, 3.0]},
    {"id": "sealed-chest", "positionM": [10.8, 0.0, 6.5]},
]
START = [[1.0, 0.0, 6.0]]


def test_two_storey_fixture_counts_two_storeys():
    # floor levels of the fixture: the ground floor's top and the upper floor's top
    assert storeys_from_levels([0.0, 3.2]) == 2


def test_upper_sockets_are_reached_by_the_stairs_and_a_sealed_room_is_not():
    mesh, owner = _cell()
    out = iw.walk_mesh(mesh, owner, START, TARGETS)
    got = {t["id"]: t["ok"] for t in out["targets"]}
    assert got == {"ground-bench": True, "upper-bed": True, "sealed-chest": False}
    assert len(out["failures"]) == 1 and out["failures"][0].startswith("sealed-chest")


def test_without_the_stairs_the_upper_storey_is_unreachable():
    mesh, owner = _cell(with_ramp=False)
    out = iw.walk_mesh(mesh, owner, START, TARGETS)
    got = {t["id"]: t["ok"] for t in out["targets"]}
    assert got["upper-bed"] is False and got["ground-bench"] is True


def test_hosted_sockets_reach_1_m_other_sockets_need_their_own_cell():
    """Ruling 5 (interiors round 3): a socket on host furniture is reached
    from a walk cell within 1.0 m; a bare idle marker needs its own cell. A
    solid block 1.2 m wide stands on the floor: its centre is 0.75 m from the
    nearest floor cell outside it."""
    parts = [_box([0, -0.2, 0], [12, 0, 8]), _box([5.4, 0, 3.4], [6.6, 2.6, 4.6])]
    owner = np.concatenate([np.full(len(p.faces), i) for i, p in enumerate(parts)])
    mesh = trimesh.util.concatenate(parts)
    targets = [
        {"id": "bench", "kind": "idle", "host": "p.bench", "positionM": [6.0, 0.0, 4.0]},
        {"id": "marker", "kind": "idle", "host": None, "positionM": [6.0, 0.0, 4.0]},
        {"id": "open-marker", "kind": "idle", "host": None, "positionM": [2.0, 0.0, 2.0]},
    ]
    out = iw.walk_mesh(mesh, owner, START, targets)
    got = {t["id"]: t["ok"] for t in out["targets"]}
    assert got == {"bench": True, "marker": False, "open-marker": True}


def test_a_hosted_socket_is_reached_from_its_hosts_plan_box():
    """Ruling 6 (interiors round 4): a table with its bench is 3.1 m long;
    its pivot is 1.55 m from the floor at its ends, so a pivot reach of 1.0 m
    fails it; the reach is measured from the host piece's own plan box."""
    parts = [_box([0, -0.2, 0], [12, 0, 8]), _box([4.45, 0, 3.0], [7.55, 0.9, 5.0])]
    owner = np.concatenate([np.full(len(p.faces), i) for i, p in enumerate(parts)])
    mesh = trimesh.util.concatenate(parts)
    bench = {"id": "bench", "kind": "idle", "host": "p.table", "positionM": [6.0, 0.0, 4.0]}
    pivot = iw.walk_mesh(mesh, owner, START, [bench])
    assert pivot["targets"][0]["ok"] is False
    box = iw.host_box(mesh, owner, 1, 0.0)
    assert box["hi"][0] - box["lo"][0] == pytest.approx(3.1)
    boxed = iw.walk_mesh(mesh, owner, START, [{**bench, "hostBox": box}])
    assert boxed["targets"][0]["ok"] is True
