"""RETIRED AS A TERRAIN STAGE (Phase 16b, ruling 6): the tests that asserted a
dredge reshapes the ground are gone; what remains tests the MEASUREMENT the
module still provides (a berth's water carries its hull, or is blocked) and
that promises come from the blueprints.

A dock's approach is dredged to the depth its hull class promises.

Source-only: a synthetic shelf and deep water, no vault rasters.
"""
from __future__ import annotations

import json

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


def test_promises_are_read_from_the_blueprints_not_hard_coded(tmp_path):
    # The shipped yard fixture has no dock and the 2026-09-09 places are
    # retired, so the blueprint is written here: one keeled dock on a real
    # published water route. The row must come from this file, not a table.
    bp = {"id": "place.test.port", "docks": [
        {"id": "dock.test.quay", "position": [0.529192, 0.863633], "hullClass": "keeled"}],
        "networkTerminals": [
            {"id": "terminal.test.quay", "routeId": "route.boat.soulrest-lilmoth",
             "dockId": "dock.test.quay", "kind": "lane"},
            {"id": "terminal.test.road", "routeId": "route.boat.soulrest-lilmoth",
             "dockId": "dock.test.quay", "kind": "road"}]}
    (tmp_path / "place.test.port.json").write_text(json.dumps({"blueprint": bp}))
    rows = dd.load_dock_promises(tmp_path)
    ids = {(r["dockId"], r["routeId"]) for r in rows}
    assert ids == {("dock.test.quay", "route.boat.soulrest-lilmoth")}
    assert dd.load_dock_promises(tmp_path / "empty") == []
    for r in rows:
        assert r["needM"] == dd.HULL_CLASS_DEPTH_M[r["hullClass"]]
        assert len(r["pointsM"]) >= 2
