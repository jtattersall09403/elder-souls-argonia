"""Minor-waterway network invariants (Phase 11 Part 3c, decision 0041)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import numpy as np
import pytest

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


def _fake_water(depth: np.ndarray, mpp: float = 1.0):
    """The two fields `compile_minor_waterways` reads off the compiled water."""
    return SimpleNamespace(depth2=depth.astype(np.float32), mpp2=mpp)


def test_fixed_dock_accepts_a_berth_standing_in_published_water():
    depth = np.zeros((200, 200), dtype=np.float32)
    depth[95:105, 95:105] = 1.4          # a real, published pool at the berth
    gap = mw.require_fixed_dock_wet_join(
        "waterway.test.near", (100.5, 100.5), "canoe", _fake_water(depth))
    assert gap <= mw.FIXED_DOCK_WET_JOIN_M
    assert mw.FIXED_DOCK_WET_JOIN_M == mw.bp_mod.DOCK_TERMINAL_TOLERANCE_M


def test_fixed_dock_refuses_a_berth_the_coarse_raster_alone_calls_water():
    """Defect 1 (2026-09-08). Sap-Tapping's berth sits inside a 50-cell macro
    hydrology 'lake' blob that the COMPILED water publishes as 100 % dry
    ground, with the real water ~91 m away at the head of the reach. The guard
    used to snap inside that blob, measure a 0 m gap and pass."""
    depth = np.zeros((200, 200), dtype=np.float32)
    depth[100, 9:20] = 1.0               # the only real water: ~91 m west
    with pytest.raises(ValueError, match=(
            r"publishes 0\.00 m of depth.*"
            r"nearest published water carrying 0\.6 m is 9[01]\.\d m away.*"
            r"authored-minor-waterways\.json")):
        mw.require_fixed_dock_wet_join(
            "waterway.hist-heartland.sap-tapping-licensed.landing",
            (110.5, 100.5), "canoe", _fake_water(depth))


def test_fixed_dock_with_no_published_water_anywhere_requires_authored_line():
    with pytest.raises(ValueError, match=(
            r"no published water carries 0\.6 m within 9 km.*"
            r"authored-minor-waterways\.json")):
        mw.require_fixed_dock_wet_join(
            "waterway.test.missing", (50.0, 50.0), "canoe",
            _fake_water(np.zeros((200, 200), dtype=np.float32)))


def _trench_water():
    """A 10 m creek running north, deepest on its axis at x = 45 m."""
    depth = np.zeros((200, 200), dtype=np.float32)
    depth[:, 40:51] = 1.0
    depth[:, 45] = 2.0
    return _fake_water(depth)


def test_derived_line_on_the_bank_is_snapped_into_its_trench():
    """Defect 2 (2026-09-08). `dock.wamasu-pond-adult.lane-landing` rode the
    east lip of its creek because the published line is a walk of 5.48 m cell
    centres and the trench is about 10 m wide."""
    bank = [[52.0, float(z)] for z in range(10, 61, 5)]
    snapped = mw.snap_points_to_wet_axis(bank, _trench_water())
    assert snapped[0] == [52.0, 10.0] and snapped[-1] == [52.0, 60.0], "terminals move"
    # onto the axis cell (x 45..46), from 7 m out on the dry east bank
    assert all(int(p[0]) == 45 for p in snapped[1:-1]), snapped
    assert [p[1] for p in snapped] == [float(z) for z in range(10, 61, 5)]


def test_authored_line_with_the_same_shape_is_never_snapped():
    class Survey:
        grid_px_m = 5.0

        @staticmethod
        def grid_px(x, z):
            return int(z // 5), int(x // 5)

        @staticmethod
        def uv_to_m(u, v):
            return u * 100.0, v * 100.0

    authored = {
        "id": "waterway.test.place",
        "pointsM": [[52.0, float(z)] for z in range(60, 9, -5)],
        "terminalM": [52.0, 10.0], "terminalId": "terminal.test.dock",
        "contentDigest": "abc123",
    }
    dock = {"id": "dock.test.place", "position": [0.52, 0.10], "fit": "to-water"}
    channel, _ = mw._authored_channel(authored, {"id": "place.test.place"}, 2, Survey(), [dock])
    # the author's geometry, published unmoved even though the water beside it
    # is deeper — an authored line is the author's, never the compiler's
    assert channel["pointsM"] == [[52.0, float(z)] for z in range(10, 61, 5)]
    assert channel["endsAtM"] == [52.0, 10.0]


def test_minor_water_repair_marker_is_content_addressed():
    natural = {"channels": [{"id": "waterway.a", "px": [[1, 2], [2, 3]]}]}
    fitted = {"channels": [{"id": "waterway.a", "px": [[4, 5], [2, 3]]}]}
    marker = mw.repair_marker(natural, fitted)
    assert marker["naturalSha256"] != marker["publishedSha256"]
    assert marker == mw.repair_marker(natural, fitted)
    changed = {"channels": [{"id": "waterway.a", "px": [[1, 3], [2, 3]]}]}
    assert mw.repair_marker(changed, fitted)["naturalSha256"] != marker["naturalSha256"]


def test_authored_waterway_is_published_at_its_exact_terminal_and_line():
    class Survey:
        grid_px_m = 5.0

        @staticmethod
        def grid_px(x, z):
            return int(z // 5), int(x // 5)

        @staticmethod
        def uv_to_m(u, v):
            return u * 100.0, v * 100.0

    authored = {
        "id": "waterway.test.place", "pointsM": [[80.0, 70.0], [60.0, 50.0]],
        "terminalM": [60.0, 50.0], "terminalId": "terminal.test.dock",
        "contentDigest": "abc123",
    }
    rec = {"id": "place.test.place"}
    dock = {"id": "dock.test.place", "position": [0.6, 0.5], "fit": "to-water"}

    channel, path = mw._authored_channel(authored, rec, 2, Survey(), [dock])

    assert channel["pointsM"] == [[60.0, 50.0], [80.0, 70.0]]
    assert channel["pointsM"][0] == channel["endsAtM"] == authored["terminalM"]
    assert channel["dockId"] == dock["id"]
    assert channel["authoredGeometryDigest"] == "abc123"
    assert path[0] == (12, 10) and path[-1] == (16, 14)


def _doc():
    return json.loads(mw.OUT_JSON.read_text())


def test_no_berth_is_refused_in_the_published_network():
    """The debt gate (owner 2026-09-09). A berth the compiled water cannot
    carry publishes NO connector — not a fabricated dry one — and this stays
    red until the berth is fixed or its pre-water centreline is authored in
    `world/sources/routes/authored-minor-waterways.json`. Same contract as the
    `unauthored` structures gate in `test_route_structure_authoring`."""
    refused = _doc().get("refusedBerths") or []
    assert not refused, "\n".join(r["why"] for r in refused)


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
    # a refused berth is EXPLAINED, not silently dropped: it is named here with
    # its measured numbers, and the debt gate above is what fails for it
    refused = {r["from"] for r in doc.get("refusedBerths") or []}
    assert len(on_network) == len(doc["onNetwork"])
    assert doc["summary"]["onNetworkAlready"] == len(on_network)
    assert not (channelled & unconnected or channelled & on_network or unconnected & on_network)
    served = channelled | unconnected | on_network | refused
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


def test_recompile_is_deterministic_and_shares_one_step_graph_per_run(monkeypatch):
    real = mw.StepGraph
    builds = 0

    class CountedStepGraph(real):
        def __init__(self, *args, **kwargs):
            nonlocal builds
            builds += 1
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(mw, "StepGraph", CountedStepGraph)
    # This test isolates graph reuse/determinism from live authored-water
    # completeness; the guard has its own scale-exact pass/fail tests above.
    monkeypatch.setattr(mw, "require_fixed_dock_wet_join",
                        lambda route_id, target_m, hull_class=None, water=None: 0.0)
    assert mw.run(write=False) == mw.run(write=False)
    assert builds == 2
