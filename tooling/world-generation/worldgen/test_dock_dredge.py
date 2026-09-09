"""A dock's approach is dredged to the depth its hull class promises.

Source-only: a synthetic shelf and deep water, no vault rasters.
"""
from __future__ import annotations

import numpy as np

from worldgen import dock_dredge as dd


def _shelf_and_deep(n=160, level=2.0):
    """Deep water left of x=30, a 1.6 m-deep shallow shelf, a 4 m quay bank.

    The berth sits at the landward end of the shelf; the route runs out west
    into the deep. The bank at x >= 120 stands above the waterline.
    """
    h = np.full((n, n), 0.4, dtype=np.float32)      # shelf: 1.6 m of water
    h[:, :30] = -6.0                                # open deep water
    h[:, 120:] = 4.0                                # dry bank / quay ground
    level_field = np.full((n, n), np.nan, dtype=np.float32)
    wet = h < level
    level_field[wet] = level
    return h, level_field, wet


def _promise(need=3.0, hull="keeled"):
    return {
        "placeId": "place.test.port", "dockId": "dock.test.quay", "hullClass": hull,
        "needM": need, "routeId": "route.boat.test",
        "berthM": (118.0, 80.0),
        # route runs from the berth westward into the deep water
        "pointsM": [(118.0, 80.0), (60.0, 78.0), (10.0, 78.0)],
    }


def test_approach_is_dredged_to_the_promised_depth():
    h, level, wet = _shelf_and_deep()
    before = h.copy()
    row = _promise()
    h, stats = dd.dredge_docks(h, level, mpp=1.0, promises=[row])
    assert len(stats) == 1
    rec = stats[0]
    assert rec["status"] == "dredged", rec
    assert rec["waterLevelAtBerthM"] == 2.0
    assert rec["existingMinDepthM"] < 3.0
    assert rec["dredgedMinDepthM"] >= 3.0, rec

    # and the dredged water is CONNECTED to the deep water, not a pond
    seed = np.zeros(h.shape, dtype=bool)
    seed[:, :5] = True
    depth = dd.connected_depth(h, 2.0, seed)
    pts = dd.approach_points_m(row["pointsM"], row["berthM"])[:51]
    for x, z in pts:
        d = depth[int(round(z)), int(round(x))]
        assert d >= row["needM"], f"({x:.0f},{z:.0f}) is {d:.2f} m, needs {row['needM']}"


def test_ground_above_the_waterline_is_untouched_and_nothing_is_raised():
    h, level, wet = _shelf_and_deep()
    before = h.copy()
    h, _ = dd.dredge_docks(h, level, mpp=1.0, promises=[_promise()])
    above = before >= 2.0
    assert np.array_equal(h[above], before[above]), "ground above the waterline was re-graded"
    assert np.all(h <= before + 1e-6), "the dredge raised ground"


def test_sides_are_sloped_not_a_slot():
    h, level, wet = _shelf_and_deep()
    h, stats = dd.dredge_docks(h, level, mpp=1.0, promises=[_promise()])
    bed = stats[0]["bedAtBerthM"]
    half = stats[0]["halfWidthM"]
    row_z = 78
    # walking out from the centreline the bed rises steadily to the old ground
    profile = [float(h[row_z + off, 60]) for off in range(0, 30)]
    assert profile[0] <= bed + 1e-3
    assert profile[int(half)] <= profile[int(half) + 3] <= profile[int(half) + 6]
    assert profile[-1] > bed + 1.0, "the cut never returns to the shelf: it is a slot"


def test_a_bar_above_the_waterline_is_reported_not_forced():
    h, level, wet = _shelf_and_deep()
    h[70:90, 55:65] = 3.0        # an island across the channel, standing dry
    level[70:90, 55:65] = np.nan
    wet[70:90, 55:65] = False
    before = h.copy()
    h, stats = dd.dredge_docks(h, level, mpp=1.0, promises=[_promise()])
    assert stats[0]["status"] == "blocked", stats[0]
    assert stats[0]["blockedSamples"] > 0 and stats[0]["blockedFirstAtM"] > 0
    # nothing is dug at all: a half-dredged approach would hide the fault
    assert np.array_equal(h, before)


def test_already_deep_approach_is_left_alone():
    h, level, wet = _shelf_and_deep()
    before = h.copy()
    h, stats = dd.dredge_docks(h, level, mpp=1.0, promises=[_promise(need=0.6, hull="canoe")])
    assert stats[0]["status"] == "already-deep"
    assert np.array_equal(h, before)


def test_promises_are_read_from_the_blueprints_not_hard_coded():
    rows = dd.load_dock_promises()
    ids = {(r["dockId"], r["routeId"]) for r in rows}
    assert ("dock.lilmoth.lighter-quay", "route.boat.soulrest-lilmoth") in ids
    for r in rows:
        assert r["needM"] == dd.HULL_CLASS_DEPTH_M[r["hullClass"]]
        assert len(r["pointsM"]) >= 2
