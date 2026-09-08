"""Minor-waterway network invariants (Phase 11 Part 3c, decision 0041)."""

from __future__ import annotations

import json

from . import catalogue, compile_minor_waterways as mw


class _TargetSurvey:
    @staticmethod
    def uv_to_m(u, v):
        return u * 100.0, v * 100.0


def test_natural_target_cannot_be_moved_by_an_authored_dock():
    rec = {"id": "place.hist.nine-trunks", "positionM": [20.0, 30.0]}
    dock = {"id": "dock.nine-trunks.landing", "position": [0.9, 0.8],
            "fit": "water-to-dock", "fixedBerthReason": "immovable stone quay"}
    assert mw.channel_targets(rec, [dock], _TargetSurvey(), fit_docks=False) == [
        ("waterway.hist.nine-trunks", (20.0, 30.0), None)]
    fitted = mw.channel_targets(rec, [dock], _TargetSurvey(), fit_docks=True)
    assert fitted[0][1] == (90.0, 80.0)
    assert fitted[0][2] is dock


def test_water_to_dock_without_structured_reason_cannot_bias_publication():
    rec = {"id": "place.hist.nine-trunks", "positionM": [20.0, 30.0]}
    dock = {"id": "dock.nine-trunks.landing", "position": [0.9, 0.8],
            "fit": "water-to-dock"}
    assert mw.channel_targets(rec, [dock], _TargetSurvey(), fit_docks=True) == [
        ("waterway.hist.nine-trunks", (20.0, 30.0), None)]


def test_minor_water_repair_marker_is_content_addressed():
    natural = {"channels": [{"id": "waterway.a", "px": [[1, 2], [2, 3]]}]}
    fitted = {"channels": [{"id": "waterway.a", "px": [[4, 5], [2, 3]]}]}
    marker = mw.repair_marker(natural, fitted)
    assert marker["naturalSha256"] != marker["publishedSha256"]
    assert marker == mw.repair_marker(natural, fitted)
    changed = {"channels": [{"id": "waterway.a", "px": [[1, 3], [2, 3]]}]}
    assert mw.repair_marker(changed, fitted)["naturalSha256"] != marker["naturalSha256"]


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
        dock = next((d for d in mw.blueprint_docks().get(c["from"], [])
                     if d.get("id") == c.get("dockId")), None)
        x, z = ([float(dock["position"][0]) * n * px,
                 float(dock["position"][1]) * n * px]
                if dock else rec["positionM"])
        snap = mw.SNAP_M / px + 2          # the path starts at the place's landing
        assert abs(c0 - x / px) <= snap and abs(r0 - z / px) <= snap, c["id"]
        assert 0 < c["lengthKm"] * 1000 <= mw.MAX_CHANNEL_M + px, c["id"]


def test_boat_stations_are_channelled_or_explained():
    """Every boat/ferry/lighter/pilot station is on the water network, has a
    channel, or is named in `unconnected` — none is silently dropped."""
    doc = _doc()
    channelled = {c["from"] for c in doc["channels"]}
    unconnected = {u["id"] for u in doc["unconnected"]}
    on_network = {u["id"] for u in doc["onNetwork"]}
    assert len(on_network) == len(doc["onNetwork"])
    assert doc["summary"]["onNetworkAlready"] == len(on_network)
    assert not (channelled & unconnected or channelled & on_network or unconnected & on_network)
    served = channelled | unconnected | on_network
    stations = [r["id"] for r in _plotted().values()
                if set((r.get("travelStation") or {}).get("modes") or []) & mw.BOAT_MODES]
    assert stations, "no boat stations in the catalogue?"
    assert not (set(stations) - served), "boat stations silently absent from the coverage ledger"
    assert any(c["from"] in stations for c in doc["channels"]), "no station got a channel"

    # The stronger invariant covers every water-bound plotted record, not just
    # travel stations. An aggregate count cannot prove that a particular id
    # did not disappear between demand and publication.
    expected = {r["id"] for batch in mw.demand(catalogue.load_region_files()) for r in batch}
    assert served == expected


def test_recompile_is_deterministic():
    assert mw.run(write=False) == mw.run(write=False)
