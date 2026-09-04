"""Minor-route network invariants (Phase 11 Part 3b, decision 0041)."""

from __future__ import annotations

import json

from . import catalogue, compile_minor_routes as mr


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
        assert 0 < t["lengthKm"] * 1000 <= mr.MAX_TRACK_M + px, t["id"]


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
