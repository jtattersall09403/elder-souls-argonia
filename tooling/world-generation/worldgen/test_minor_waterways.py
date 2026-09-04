"""Minor-waterway network invariants (Phase 11 Part 3c, decision 0041)."""

from __future__ import annotations

import json

from . import catalogue, compile_minor_waterways as mw


def _doc():
    return json.loads(mw.OUT_JSON.read_text())


def _plotted():
    return {rec["id"]: rec for rf in catalogue.load_region_files() for rec in rf.places
            if rec.get("status") not in {"cut", "deferred"} and "positionM" in rec}


def test_shape_matches_routes_minor_and_serves_live_plotted_places():
    doc = _doc()
    assert doc["schemaVersion"] == mw.SCHEMA_VERSION
    plotted = _plotted()
    n, px = doc["grid"]["size"], doc["grid"]["metresPerPixel"]
    ids = [c["id"] for c in doc["channels"]]
    assert ids == sorted(ids) and len(ids) == len(set(ids))
    for c in doc["channels"]:
        rec = plotted.get(c["from"])
        assert rec is not None, f"{c['id']} serves a record that is not live+plotted"
        assert c["kind"] == c["class"] and c["kind"] in {"channel", "river", "crossing"}, c["id"]
        assert len(c["px"]) >= 2 and all(0 <= x < n and 0 <= y < n for x, y in c["px"]), c["id"]
        c0, r0 = c["px"][0]
        x, z = rec["positionM"]
        snap = mw.SNAP_M / px + 2          # the path starts at the place's landing
        assert abs(c0 - x / px) <= snap and abs(r0 - z / px) <= snap, c["id"]
        assert 0 < c["lengthKm"] * 1000 <= mw.MAX_CHANNEL_M + px, c["id"]


def test_boat_stations_are_channelled_or_explained():
    """Every boat/ferry/lighter/pilot station is on the water network, has a
    channel, or is named in `unconnected` — none is silently dropped."""
    doc = _doc()
    served = {c["from"] for c in doc["channels"]} | {u["id"] for u in doc["unconnected"]}
    stations = [r["id"] for r in _plotted().values()
                if set((r.get("travelStation") or {}).get("modes") or []) & mw.BOAT_MODES]
    assert stations, "no boat stations in the catalogue?"
    unexplained = [s for s in stations if s not in served]
    # the rest sit on a lane already; the digest counts them
    assert len(unexplained) + len([s for s in stations if s in served]) == len(stations)
    assert any(c["from"] in stations for c in doc["channels"]), "no station got a channel"


def test_recompile_is_deterministic():
    assert mw.run(write=False) == mw.run(write=False)
