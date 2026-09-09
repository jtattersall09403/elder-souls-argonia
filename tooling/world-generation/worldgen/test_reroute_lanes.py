"""`reroute_lanes` — the boat-lane repair that measures water instead of reading
a class label.

The province-scale proof lives in
`test_water_invariants.test_every_published_boat_lane_carries_a_hull_or_declares_a_portage`,
which measures the SHIPPED lanes. These are the unit-scale guards on the rules
the repair must not lose: it never crosses dry ground, it prefers a channel to
a flat, it keeps the lane's declared ends, and it says so plainly when the
water is not there rather than inventing a line.
"""

from __future__ import annotations

import numpy as np
import pytest

from . import dock_dredge as dd
from . import reroute_lanes as rl
from .scale import HYDRO_PX_M


def _bar_grid(n: int = 60, bar_col: int = 30, gap_row: int = 40) -> np.ndarray:
    """Deep water with a dry bar across it, pierced by one wet gap."""
    depth = np.full((n, n), 3.0)
    depth[:, bar_col] = -2.0
    depth[gap_row, bar_col] = 1.0
    return depth


def test_the_re_solve_never_crosses_dry_ground():
    mpp = 4.0
    depth = _bar_grid()
    path = rl.solve_box(depth, dd.LANE_MIN_DEPTH_M, mpp, (10, 10), (50, 10),
                        (0, depth.shape[0], 0, depth.shape[1]))
    assert path is not None
    assert all(depth[r, c] > rl.WET_FLOOR_M for c, r in path), \
        "the repair put the lane on dry ground"
    assert (30, 40) in path, "the only wet gap in the bar was not used"


def test_a_bar_with_no_gap_is_reported_not_invented():
    depth = _bar_grid()
    depth[40, 30] = -2.0                      # close the gap
    assert rl.solve_box(depth, dd.LANE_MIN_DEPTH_M, 4.0, (10, 10), (50, 10),
                        (0, depth.shape[0], 0, depth.shape[1])) is None


def test_shallow_water_is_dearer_than_a_channel_but_still_passable():
    """A shallow IS dredged, so it may be crossed; a channel is preferred."""
    n = 41
    depth = np.full((n, n), 0.05)             # a flat, wet but far under the promise
    depth[20, :] = 4.0                        # a channel straight down the middle
    path = rl.solve_box(depth, dd.LANE_MIN_DEPTH_M, 4.0, (0, 20), (40, 20),
                        (0, n, 0, n))
    assert path is not None and all(r == 20 for _, r in path), \
        "the re-solve wandered off the channel onto the flat"
    depth[20, 20] = 0.05                      # break the channel with a shallow
    broken = rl.solve_box(depth, dd.LANE_MIN_DEPTH_M, 4.0, (0, 20), (40, 20), (0, n, 0, n))
    assert broken is not None, "a shallow is passable — the dredger carries it"


def _lane(px, **extra):
    return dict({"id": "route.boat.test", "px": [list(p) for p in px]}, **extra)


class _FakeWater:
    """The smallest thing `overland_runs` needs: a water surface, a ground and
    the grid they share."""

    def __init__(self, depth: np.ndarray, mpp: float):
        self.mpp2 = mpp
        self.depth2 = depth.astype(np.float32)
        self.wet2 = depth > 0.0
        self.ground2 = np.where(depth > 0.0, -depth, -depth).astype(np.float32)
        self.w2 = np.zeros_like(self.ground2)

    def signed_depth_m(self, season):        # noqa: ARG002 — one season here
        return self.depth2.astype(np.float64)


def test_a_repaired_lane_keeps_its_declared_berths():
    """The berth is a placed thing; a geometry repair may never move it."""
    n = 80
    depth = np.full((n, n), 3.0)
    depth[:, 38:60] = -2.0                    # a 120 m bar, longer than a portage
    depth[70, 38:60] = 1.0                    # pierced by one wet gut
    water = _FakeWater(depth, HYDRO_PX_M)
    berth_a, berth_b = (60.0, 57.6), (390.0, 57.6)
    lane = _lane([(10, 10), (20, 10), (30, 10), (40, 10), (50, 10),
                  (60, 10), (70, 10)],
                 startsAtM=[berth_a[0], berth_a[1]], endsAtM=[berth_b[0], berth_b[1]])
    pts = rl._lane_points_m(lane)
    assert pts[0] == berth_a and pts[-1] == berth_b
    runs = rl.overland_runs(pts, water)
    repaired, edits = rl.repair(pts, water.signed_depth_m("base"), HYDRO_PX_M,
                                dd.LANE_MIN_DEPTH_M, runs)
    assert [e["status"] for e in edits] == ["rerouted"]
    assert repaired[0] == berth_a and repaired[-1] == berth_b
    assert rl.overland_runs(repaired, water) == [], "the bar is still crossed"


def test_the_published_px_trail_follows_the_exact_line():
    """`px` is the coarse trail beside `pointsM`, so the two must not describe
    two different lanes: every trail cell is one the line passes through."""
    pts = [(100.0, 100.0), (103.0, 100.0), (109.0, 105.0), (400.0, 402.0)]
    trail = rl._to_px(pts)
    assert trail == [[18, 18], [19, 19], [72, 73]]
    for x, y in pts:                      # every point lies in a trail cell
        assert [int(x / HYDRO_PX_M), int(y / HYDRO_PX_M)] in trail
    assert all(trail[i] != trail[i + 1] for i in range(len(trail) - 1))


def test_a_lane_with_no_overland_run_is_left_alone():
    """The repair is not a re-solve: a lane that keeps its promise is untouched,
    so this pass can be re-run without churning the published geometry."""
    n = 40
    water = _FakeWater(np.full((n, n), 3.0), HYDRO_PX_M)
    lane = _lane([(5, 5), (20, 5), (30, 5)])
    assert rl.overland_runs(rl._lane_points_m(lane), water) == []


def test_the_solver_is_deterministic():
    depth = _bar_grid()
    box = (0, depth.shape[0], 0, depth.shape[1])
    first = rl.solve_box(depth, dd.LANE_MIN_DEPTH_M, 4.0, (10, 10), (50, 10), box)
    for _ in range(3):
        assert rl.solve_box(depth, dd.LANE_MIN_DEPTH_M, 4.0, (10, 10), (50, 10), box) == first


def test_a_run_shorter_than_a_portage_is_not_repaired():
    """The province's declared portages run 11-89 m. A carry within that is the
    world working, not a defect, and the repair must not chase it."""
    n = 200
    depth = np.full((n, n), 3.0)
    depth[:, 100] = -2.0                      # a bar one 5.48 m cell wide
    water = _FakeWater(depth, HYDRO_PX_M)
    lane = _lane([(50, 50), (150, 50)])
    assert dd.LANE_PORTAGE_MAX_M > HYDRO_PX_M * 2
    assert rl.overland_runs(rl._lane_points_m(lane), water) == []


def test_it_refuses_to_run_without_the_refined_ground():
    """On a clean checkout (CI) there is no vault heightfield, and guessing one
    would repair lanes against ground that is not the world's."""
    water = _FakeWater(np.full((20, 20), 1.0), HYDRO_PX_M)
    water.ground2 = None
    with pytest.raises(RuntimeError, match="refined heightfield"):
        rl.overland_runs([(10.0, 10.0), (60.0, 10.0)], water)
