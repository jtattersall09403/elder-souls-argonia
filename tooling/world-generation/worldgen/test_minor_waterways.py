"""Minor-waterway network invariants (Phase 11 Part 3c, decision 0041)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import numpy as np
import pytest

from . import catalogue, compile_minor_waterways as mw, known_red, routes


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
    known_red.assert_clear(
        "worldgen/test_minor_waterways.py::test_no_berth_is_refused_in_the_published_network",
        [r["why"] for r in refused])


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


def test_recompile_is_deterministic_and_shares_its_step_graphs_per_run(monkeypatch):
    """One physical graph per RUN, shared by the natural and the fitted solve,
    plus at most one re-lining graph per hull class that some lane actually
    needed (16g: the record floats the lane). Never one per solve, and never
    one per lane."""
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
    per_run = builds / 2
    assert per_run == int(per_run)
    assert 1 <= per_run <= 1 + len(mw.HULL_DEPTH_M), per_run


def test_boat_cost_from_record_reads_kinds_and_bands():
    """The cost surface comes from the record's kinds and reach bands
    (decision 0066): sea cheapest, a big reach cheaper than a small one,
    marsh is the pole cost and dry ground is a portage."""
    n = 6
    marsh = np.zeros((n, n), np.float32)
    marsh[0, 0] = 1.0
    band = np.zeros((n, n), np.int8)
    band[1, 0] = 1
    band[1, 1] = 3

    class _Water:
        def kind_grid(self, kinds):
            g = np.zeros((n, n), bool)
            ks = set(kinds)
            if "ocean" in ks:
                g[2, 0] = True
            if "horizontal-tidal" in ks:
                g[3, 0] = True
            if "lake-lowland" in ks:
                g[4, 0] = True
            return g

    s = SimpleNamespace(grid_n=n, marsh_grid=marsh, reach_band_grid=band, water=_Water())
    cost = mw.boat_cost_from_record(s)

    assert cost[2, 0] == routes.BOAT_OPEN_SEA
    assert cost[2, 0] == cost.min()
    assert cost[1, 1] < cost[1, 0]
    assert cost[1, 1] == routes.BOAT_MAJOR_RIVER
    assert cost[1, 0] == routes.BOAT_MINOR_RIVER
    assert cost[0, 0] == routes.BOAT_MARSH_POLE
    assert cost[3, 0] == routes.BOAT_TIDAL
    assert cost[4, 0] == routes.BOAT_LAKE
    assert cost[5, 5] == routes.BOAT_PORTAGE


# --------------------------------------------------------------------------
# 16g: the RECORD floats the lane's hull class, and a gap is never dredged
# --------------------------------------------------------------------------
class _RecordWater:
    """A duck-typed survey carrying only the record depth a lane is judged by."""

    def __init__(self, depth):
        self.recorded_depth_m = np.asarray(depth, dtype=np.float32)


def test_the_hull_class_comes_from_the_berth_then_the_station_then_the_canoe():
    canoe = {"id": "place.r.a"}
    assert mw.lane_hull_class(canoe, None) == "canoe"
    assert mw.lane_hull_class({"id": "place.r.a",
                               "travelStation": {"modes": ["boat"]}}, None) == "small-draft"
    assert mw.lane_hull_class(canoe, {"hullClass": "keeled"}) == "keeled"
    # an unknown class never silently becomes a deeper hull
    assert mw.lane_hull_class(canoe, {"hullClass": "barge"}) == "canoe"


def test_a_lane_sample_on_a_reach_shallower_than_its_hull_class_fails():
    """The decider is the RECORD's depth (a reach's `depthM`, a body's
    `maxDepthM`), never the bake's measurement (0065/0066)."""
    depth = np.full((4, 4), 3.0, dtype=np.float32)
    depth[1, 2] = 0.8                       # a reach the record gives 0.8 m
    s = _RecordWater(depth)
    assert mw.record_floats(s, "canoe")[1, 2], "0.8 m floats a poled canoe"
    assert not mw.record_floats(s, "keeled")[1, 2], "0.8 m does not float a keel"
    assert mw.record_floats(s, "keeled")[0, 0]
    line = [(2, 1), (2, 0)]                 # (col, row)
    assert mw.lane_features(s, line, "canoe") == []
    shallow = mw.lane_features(s, line, "keeled")
    assert [f["kind"] for f in shallow] == [mw.FEATURE_BOARDWALK]
    assert shallow[0]["px"] == [[2, 1]] and shallow[0]["cells"] == 1


def test_a_land_gap_becomes_a_portage_feature_and_is_never_dredged():
    depth = np.full((4, 6), 2.0, dtype=np.float32)
    depth[0, 2] = 0.0                       # the record has no water here at all
    depth[0, 3] = 0.0
    s = _RecordWater(depth)
    line = [(c, 0) for c in range(6)]
    features = mw.lane_features(s, line, "canoe")
    assert [f["kind"] for f in features] == [mw.FEATURE_PORTAGE]
    assert features[0]["px"] == [[2, 0], [3, 0]] and features[0]["cells"] == 2
    # the bed is untouched: the feature is the answer, not a dredge
    assert depth[0, 2] == 0.0 and depth[0, 3] == 0.0


def test_a_lane_with_both_a_dry_gap_and_a_shallow_run_types_each_separately():
    depth = np.array([[2.0, 0.0, 2.0, 0.8, 2.0, 2.0]], dtype=np.float32)
    s = _RecordWater(depth)
    line = [(c, 0) for c in range(6)]
    kinds = [f["kind"] for f in mw.lane_features(s, line, "small-draft")]
    assert kinds == [mw.FEATURE_PORTAGE, mw.FEATURE_BOARDWALK]
