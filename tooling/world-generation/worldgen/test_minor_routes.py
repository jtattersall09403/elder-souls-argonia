"""Minor-route network invariants (Phase 11 Part 3b, decision 0041)."""

from __future__ import annotations

import json

import numpy as np

from . import catalogue, compile_minor_routes as mr
from .routes import GRADE_MARGIN, grade_factor


def _doc():
    return json.loads(mr.OUT_JSON.read_text())


def _plotted():
    return {rec["id"]: rec for rf in catalogue.load_region_files() for rec in rf.places
            if rec.get("status") not in {"cut", "deferred"} and "positionM" in rec}


def test_every_track_serves_a_live_plotted_place_and_starts_at_it():
    doc = _doc()
    assert doc["schemaVersion"] == mr.SCHEMA_VERSION
    plotted = _plotted()
    n = doc["grid"]["size"]
    px = doc["grid"]["metresPerPixel"]
    for t in doc["tracks"]:
        rec = plotted.get(t["from"])
        assert rec is not None, f"{t['id']} serves a record that is not live+plotted"
        assert t["kind"] in {"track", "footpath", "boardwalk", "causeway"}, t["id"]
        assert len(t["px"]) >= 2 and all(0 <= c < n and 0 <= r < n for c, r in t["px"]), t["id"]
        c0, r0 = t["px"][0]
        x, z = rec["positionM"]
        # the path starts on the record's cell (or the nearest land cell for a submerged record)
        assert abs(c0 * px - x) <= mr.SNAP_M + px and abs(r0 * px - z) <= mr.SNAP_M + px, t["id"]
        # Only a settlement may exceed the walking limit: it always keeps its
        # path (compile_minor_routes.run), and the digest lists the length.
        assert t["lengthKm"] > 0, t["id"]
        if t["lengthKm"] * 1000 > mr.MAX_TRACK_M + px:
            assert rec["classification"]["class"] == "settlement", t["id"]


def test_track_ids_are_unique_and_sorted():
    ids = [t["id"] for t in _doc()["tracks"]]
    assert ids == sorted(ids) and len(ids) == len(set(ids))


def test_every_settlement_is_reached_on_road_by_track_or_listed_unconnected():
    doc = _doc()
    served = {t["from"] for t in doc["tracks"]} | {u["id"] for u in doc["unconnected"]}
    settlements = [rid for rid, rec in _plotted().items() if rec["classification"]["class"] == "settlement"]
    unaccounted = [rid for rid in settlements if rid not in served]
    # the remainder must be the "already on a road" count
    assert len(unaccounted) == doc["summary"]["onRoadAlready"] - sum(
        1 for rid, rec in _plotted().items()
        if rid not in served and rec["classification"]["class"] != "settlement" and rec.get("discovery") == "road"
        and rec["classification"]["class"] not in {"lair", "camp"})


# --------------------------------------------------------------------------
# the gradient wall (owner requirement 2026-09-05: every way walkable)
# --------------------------------------------------------------------------
def test_grade_factor_is_free_on_the_flat_and_walls_above_the_cap():
    assert grade_factor(0.0, 5.5, 12.0) == 1.0
    at_cap = grade_factor(np.tan(np.radians(12.0)) * GRADE_MARGIN * 5.5, 5.5, 12.0)
    assert 5.0 < at_cap < 20.0, "the cap itself is dear, not forbidden"
    over = grade_factor(np.tan(np.radians(30.0)) * 5.5, 5.5, 12.0)
    assert over > 100 * at_cap, "over the cap must be a wall, not a preference"
    assert np.isfinite(over), "the wall stays finite: a walled-in place still gets a path"


def test_grade_factor_is_symmetric_and_monotone():
    ups = [float(grade_factor(dz, 5.5, 12.0)) for dz in (0.2, 0.6, 1.2, 3.0)]
    assert ups == sorted(ups)
    assert grade_factor(-1.7, 5.5, 12.0) == grade_factor(1.7, 5.5, 12.0)


def _ramp_world(n=41):
    """A flat plain with one steep ridge across it, breached by a gentle ramp
    at the top edge: straight over the ridge is short and over the cap; round
    by the ramp is long and walkable."""
    h = np.zeros((n, n), dtype=np.float64)
    h[:, 20:] = 12.0            # a 12 m step over one 5.5 m cell — 65 deg
    h[0, 8:21] = np.arange(13) * 1.0        # the ramp along the top edge:
    h[0, 21:] = 12.0                        # 1 m per cell, 10.3 deg, walkable
    return h


def test_the_solver_goes_round_a_wall_it_cannot_climb():
    h = _ramp_world()
    cost = np.ones_like(h)
    seeds = np.zeros(h.shape, dtype=bool)
    seeds[20, 0] = True
    plain, _ = mr.multi_source_field(cost, seeds, 5.5)
    walled, prev = mr.multi_source_field(cost, seeds, 5.5, h, mr.ROUTING_CAP_DEG)
    goal = (20, 40)
    assert np.isfinite(walled[goal]), "the wall never disconnects a place"
    assert walled[goal] > plain[goal], "climbing the ridge must have got dearer"
    path = mr.trace(prev, goal[0], goal[1], h.shape[1])
    # every step of the chosen line is inside the cap (the ramp cells included)
    for (c0, r0), (c1, r1) in zip(path[:-1], path[1:]):
        run = np.hypot(c1 - c0, r1 - r0) * 5.5
        deg = np.degrees(np.arctan(abs(h[r1, c1] - h[r0, c0]) / run))
        assert deg <= mr.ROUTING_CAP_DEG + 1e-6, f"{deg:.1f} deg step at {(c1, r1)}"


def test_the_walled_solver_is_deterministic():
    h = _ramp_world()
    cost = np.ones_like(h)
    seeds = np.zeros(h.shape, dtype=bool)
    seeds[20, 0] = True
    a, pa = mr.multi_source_field(cost, seeds, 5.5, h, mr.ROUTING_CAP_DEG)
    b, pb = mr.multi_source_field(cost, seeds, 5.5, h, mr.ROUTING_CAP_DEG)
    assert np.array_equal(a, b) and np.array_equal(pa, pb)
