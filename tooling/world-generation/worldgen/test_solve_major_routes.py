"""Pure-function tests for the major-road solver (16e).

Every test runs on small synthetic arrays: no province files are read and no
`ProvinceSurvey` is constructed, so the suite is fast and deterministic.
"""
from __future__ import annotations

import json
import math
from types import SimpleNamespace

import numpy as np
import pytest

from .solve_major_routes import (
    COST_FERRY,
    COST_FORD,
    COST_MARSH_DEEP,
    COST_MARSH_FRINGE,
    COST_SPAN,
    block_max,
    crossing_factor_surface,
    load_junctions,
    measure,
    road_points,
    solve_leg,
    solve_via,
)


# ---------------------------------------------------------------------------
# 1. the crossing-price lookup
# ---------------------------------------------------------------------------
def test_crossing_factor_surface_prices_every_kind_from_the_record():
    entities = [
        {"id": "body.sea", "kind": "ocean"},
        {"id": "body.lake", "kind": "lake-lowland"},
        {"id": "body.deep", "kind": "marsh-deep"},
        {"id": "body.fringe", "kind": "marsh-fringe"},
        {"id": "reach.ford", "kind": "horizontal-channel"},
        {"id": "reach.span", "kind": "horizontal-channel"},
        {"id": "reach.back", "kind": "horizontal-backwater"},
        {"id": "reach.fall", "kind": "vertical-fall"},
    ]
    reaches = {
        "reach.ford": {"widthM": 8.0, "depthM": 0.5},
        "reach.span": {"widthM": 40.0, "depthM": 1.0},
        "reach.back": {"widthM": 30.0, "depthM": 2.0},
        "reach.fall": {"widthM": 6.0, "depthM": 0.4},
    }
    ids = np.tile(np.arange(len(entities) + 1, dtype=np.int64), (3, 1))

    factor = crossing_factor_surface(entities, reaches, ids)

    assert factor.shape == ids.shape
    expected = [1.0, np.inf, COST_FERRY, COST_MARSH_DEEP, COST_MARSH_FRINGE,
                COST_FORD, COST_SPAN, COST_FERRY, np.inf]
    assert list(factor[0]) == expected
    assert list(factor[2]) == expected


# ---------------------------------------------------------------------------
# 2. pooling a thin reach onto the analysis grid
# ---------------------------------------------------------------------------
def test_block_max_keeps_a_single_walling_texel():
    a = np.ones((6, 6), dtype=np.float64)
    a[0, 0] = np.inf      # -> analysis cell (0, 0)
    a[5, 2] = 5.0         # -> analysis cell (2, 1)

    out = block_max(a, 3)

    assert out.shape == (3, 3)
    assert out[0, 0] == np.inf
    assert out[2, 1] == 5.0
    rest = [out[r, c] for r in range(3) for c in range(3) if (r, c) not in {(0, 0), (2, 1)}]
    assert rest == [1.0] * 7


def test_block_max_is_a_no_op_at_matching_size():
    a = np.arange(9, dtype=np.float64).reshape(3, 3)
    assert block_max(a, 3) is a


# ---------------------------------------------------------------------------
# 3. the walled A*
# ---------------------------------------------------------------------------
def _walled_grid(gap_row: int | None):
    cost = np.ones((40, 40), dtype=np.float64)
    cost[:, 20] = np.inf
    if gap_row is not None:
        cost[gap_row, 20] = COST_FORD
    return cost


def test_solve_leg_threads_the_only_gap_in_a_wall():
    cost = _walled_grid(30)
    height = np.zeros((40, 40), dtype=np.float64)

    path = solve_leg(cost, height, 5.48, 8.0, (5, 5), (35, 5))

    assert path is not None
    assert path[0] == (5, 5) and path[-1] == (35, 5)
    assert (20, 30) in path
    assert all(np.isfinite(cost[r, c]) for c, r in path)


def test_solve_leg_returns_none_when_the_wall_is_closed():
    cost = _walled_grid(None)
    height = np.zeros((40, 40), dtype=np.float64)

    assert solve_leg(cost, height, 5.48, 8.0, (5, 5), (35, 5)) is None


def test_solve_leg_walks_round_a_gradient_band_with_an_open_flank():
    cost = np.ones((40, 40), dtype=np.float64)
    height = np.zeros((40, 40), dtype=np.float64)
    for r in range(15, 26):
        height[r, :] = 3.0 * (r - 14)
    height[26:, :] = height[25, 0]

    path = solve_leg(cost, height, 5.48, 8.0, (5, 35), (35, 35))

    assert path is not None
    assert path[0] == (5, 35) and path[-1] == (35, 35)
    assert not any(15 <= r <= 25 for _c, r in path)


# ---------------------------------------------------------------------------
# 5. legs stitched through a via
# ---------------------------------------------------------------------------
def test_solve_via_passes_through_its_via_point():
    cost = np.ones((40, 40), dtype=np.float64)
    height = np.zeros((40, 40), dtype=np.float64)

    path = solve_via(cost, height, 5.48, 8.0, [(2, 2), (20, 30), (38, 2)])

    assert path[0] == (2, 2)
    assert path[-1] == (38, 2)
    assert (20, 30) in path
    # the join is stitched, not duplicated
    assert path.count((20, 30)) == 1


# ---------------------------------------------------------------------------
# 6. junction ordering along a road
# ---------------------------------------------------------------------------
def test_road_points_orders_vias_by_distance_from_the_start():
    # ProvinceSurvey.grid_px returns (row, col); road_points must hand the
    # solver (col, row). The stub keeps that order so a transposed via fails.
    survey = SimpleNamespace(grid_px=lambda x, z: (int(z / 5), int(x / 5)))
    road = {"id": "route.major.test", "from": "a", "to": "b"}
    ends = {"a": (0, 0), "b": (40, 40)}
    junctions = [
        {"id": "junction.far", "positionM": [100, 150], "roads": ["route.major.test"]},
        {"id": "junction.near", "positionM": [50, 75], "roads": ["route.major.test"]},
        {"id": "junction.other", "positionM": [10, 10], "roads": ["route.major.elsewhere"]},
    ]

    assert road_points(road, ends, junctions, survey) == [(0, 0), (10, 15), (20, 30), (40, 40)]


# ---------------------------------------------------------------------------
# 7. the per-road measurement
# ---------------------------------------------------------------------------
def test_measure_reports_hand_computed_numbers():
    px_m = 5.48
    height = np.zeros((3, 3), dtype=np.float64)
    height[0, 0], height[0, 1], height[1, 1] = 0.0, 1.0, 3.0
    channel = np.zeros((3, 3), dtype=np.float64)
    channel[0, 1] = 1.0
    standing = np.zeros((3, 3), dtype=np.float64)
    standing[1, 1] = 1.0
    wet = np.zeros((3, 3), dtype=bool)
    wet[0, 0] = wet[0, 1] = True
    survey = SimpleNamespace(height_grid=height, grid_px_m=px_m, channel_grid=channel,
                             standing_body_grid=standing, wet_grid=wet)

    out = measure([(0, 0), (1, 0), (1, 1)], survey, 8.0)

    # two orthogonal steps of one cell each
    assert out["lengthKm"] == round(2 * px_m / 1000.0, 3)
    # both steps rise faster than the 8 deg cap (10.34 deg, 20.04 deg)
    assert out["overCapM"] == round(2 * px_m, 1)
    assert out["worstDeg"] == round(math.degrees(math.atan(2.0 / px_m)), 2)
    assert out["channelSamples"] == 1
    assert out["standingBodySamples"] == 1
    assert out["wetSamples"] == 2
    assert out["samples"] == 3


# ---------------------------------------------------------------------------
# 8. the junction record is typed
# ---------------------------------------------------------------------------
def _write(tmp_path, junctions):
    p = tmp_path / "junctions.json"
    p.write_text(json.dumps({"schemaVersion": 1, "junctions": junctions}), encoding="utf-8")
    return p


def test_load_junctions_accepts_a_complete_record(tmp_path):
    p = _write(tmp_path, [{"id": "junction.gideon-archon", "positionM": [1.0, 2.0],
                           "roads": ["route.major.a"], "why": "the crossroads"}])
    assert [j["id"] for j in load_junctions(p)] == ["junction.gideon-archon"]


def test_load_junctions_rejects_a_junction_without_why(tmp_path):
    p = _write(tmp_path, [{"id": "junction.x", "positionM": [1.0, 2.0], "roads": []}])
    with pytest.raises(SystemExit, match="lacks `why`"):
        load_junctions(p)


def test_load_junctions_rejects_an_untyped_id(tmp_path):
    p = _write(tmp_path, [{"id": "crossroads.x", "positionM": [1.0, 2.0],
                           "roads": [], "why": "because"}])
    with pytest.raises(SystemExit, match="not `junction"):
        load_junctions(p)


def test_load_junctions_on_a_missing_file_is_empty(tmp_path):
    assert load_junctions(tmp_path / "nope.json") == []
