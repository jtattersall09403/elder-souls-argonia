"""The travel-service graph resolves, and the water it rests on is measured.

The reference-integrity check is fast and vault-free, so it gates on every
runner. The re-derivation of `water-crossings.json` needs the vault and is
marked slow. The unit tests build tiny records in a tmp dir so migrate, derive
and check are each exercised on data whose right answer is known.
"""

import json

import pytest

from . import travel_services as ts
from . import derive_crossings as wc


def test_the_travel_graph_resolves():
    """Every route, place, station, crossing, string, predicate and mesh a
    service names exists. A dangling id here is a runtime failure for the
    travel system and the quest system alike."""
    errs = ts.check()
    assert not errs, "travel-services.json:\n  " + "\n  ".join(errs)


def test_the_checker_can_fail():
    """CLAUDE.md: a check that cannot fail is a defect. Break one reference and
    the checker must say so."""
    doc = json.loads(ts.SERVICES.read_text(encoding="utf-8"))
    doc["services"][0]["text"]["name"] = "text.travel.does-not-exist"
    errs = ts.check(doc)
    assert any("does-not-exist" in e for e in errs), errs
    assert ts._text_ids(), "no text catalogue ids parsed — the string check would pass vacuously"


def test_every_ferry_water_is_measured_water():
    """A `road-crossing` ferry may only sit where the bake says a way stands in
    water: its crossing is a row of `water-crossings.json` and its span and
    depth are that row's, not an author's."""
    doc = json.loads(ts.SERVICES.read_text(encoding="utf-8"))
    crossings = {c["id"]: c for c in
                 json.loads(ts.CROSSINGS.read_text(encoding="utf-8"))["crossings"]}
    for s in doc["services"]:
        if s.get("serviceKind") != "ferry" or s.get("form") != "road-crossing":
            continue
        if s.get("status") == "unmatched":
            assert s.get("unmatchedWhy"), f"{s['id']}: unmatched without a reason"
            continue
        cr = s.get("crossing")
        assert cr, f"{s['id']}: a road-crossing ferry must name its crossing"
        row = crossings[cr["id"]]
        assert cr["spanM"] == row["spanM"] and cr["maxDepthM"] == row["maxDepthM"], (
            f"{s['id']} claims {cr} but {row['id']} measures {row['spanM']} m / "
            f"{row['maxDepthM']} m — the bake is the authority")


def test_no_ford_is_deeper_than_a_wader():
    """Depth decides with span (16e, 2026-09-15: the record holds crossings
    18 m deep): a `ford`-band crossing is never deeper than the small-draft
    hull line, `dock_spec.HULL_CLASS_DEPTH_M["small-draft"]`."""
    from .dock_spec import HULL_CLASS_DEPTH_M
    doc = json.loads(ts.CROSSINGS.read_text(encoding="utf-8"))
    deep_fords = [c["id"] for c in doc["crossings"]
                  if c["band"] == "ford" and c["maxDepthM"] > HULL_CLASS_DEPTH_M["small-draft"] + 1e-6]
    assert deep_fords == [], f"ford-band crossings deeper than a wader: {deep_fords[:8]}"


def test_the_crossing_list_is_current():
    """Re-derive from the live bake and diff. Needs the vault."""
    try:
        rows = wc.derive()
    except FileNotFoundError:
        pytest.skip("asset vault absent")
    have = json.loads(ts.CROSSINGS.read_text(encoding="utf-8"))
    assert wc.document(rows) == have, (
        "water-crossings.json is stale — re-run `python3 -m worldgen.derive_crossings`")


# --------------------------------------------------------------------------
# unit tests on stub records
# --------------------------------------------------------------------------

def _stub_graph():
    """Two stations 100 m apart on one road-crossing ferry."""
    return {
        "schemaVersion": 1,
        "craft": {"_": "", "raft": {"pieceRef": "x", "kit": "nope-v1"}},
        "vocabulary": {"kinds": ts.SERVICE_KINDS, "stationKinds": ts.STATION_KINDS,
                       "hopFollows": ts.HOP_FOLLOWS},
        "stations": [
            {"id": "ferry-landing.stub.a", "kind": "ferry-landing",
             "positionM": [1000.0, 1000.0], "status": "active"},
            {"id": "ferry-landing.stub.b", "kind": "ferry-landing",
             "positionM": [1000.0, 1100.0], "status": "active"},
        ],
        "services": [{
            "id": "ferry.stub.run", "serviceKind": "ferry", "form": "road-crossing",
            "status": "active", "severs": ["route.road.stub"],
            "hullClass": "canoe", "craft": "raft",
            "landings": ["ferry-landing.stub.a", "ferry-landing.stub.b"],
            "crossing": None,
            "hops": [{"from": "ferry-landing.stub.a", "to": "ferry-landing.stub.b",
                      "follows": {"road": "route.road.stub"}, "lengthM": 100.0}],
            "operator": {"slotId": "ferry-slot.stub.poler",
                         "socket": {"stationId": "ferry-landing.stub.a"}},
            "fare": {"gold": 1, "freeIf": []}, "available": [], "refusedIf": [],
            "text": {},
        }],
        "rootways": [],
    }


def _stub_crossing(x, z, cid="crossing.major.900"):
    return {"id": cid, "servesRoutes": ["route.road.stub"], "entityId": "body.1-1",
            "entityKind": "lake-lowland", "spanM": 90.0, "maxDepthM": 1.1,
            "banks": [[x, z - 45.0], [x, z + 45.0]]}


def test_derive_matches_a_crossing_within_the_radius():
    doc = _stub_graph()
    lines = ts.derive(doc, [_stub_crossing(1000.0, 1050.0)], sw=None)
    s = doc["services"][0]
    assert s["status"] == "active" and s["crossing"]["id"] == "crossing.major.900"
    assert s["measured"] == {"spanM": 90.0, "maxDepthM": 1.1,
                             "source": "world/sources/routes/water-crossings.json"}
    pos = {st["id"]: st["positionM"] for st in doc["stations"]}
    assert pos["ferry-landing.stub.a"] == [1000.0, 1005.0], "the landing moves onto its bank"
    assert pos["ferry-landing.stub.b"] == [1000.0, 1095.0]
    assert any("matched" in ln for ln in lines)


def test_derive_marks_a_distant_crossing_unmatched_and_moves_nothing():
    doc = _stub_graph()
    ts.derive(doc, [_stub_crossing(1000.0, 3000.0)], sw=None)
    s = doc["services"][0]
    assert s["status"] == "unmatched" and s["crossing"] is None
    assert "crossing.major.900" in s["unmatchedWhy"] and "m" in s["unmatchedWhy"]
    pos = {st["id"]: st["positionM"] for st in doc["stations"]}
    assert pos["ferry-landing.stub.a"] == [1000.0, 1000.0], "an unmatched landing never moves"


def test_check_fails_on_a_dangling_station_and_on_an_unmatched_active_ferry():
    doc = _stub_graph()
    doc["services"][0]["landings"][1] = "ferry-landing.stub.ghost"
    errs = ts.check(doc)
    assert any("ferry-landing.stub.ghost" in e for e in errs), errs

    doc = _stub_graph()          # active, crossing None (derive never ran)
    errs = ts.check(doc)
    assert any("must carry status `unmatched`" in e for e in errs), errs


def test_migrate_produces_namespaced_stations_and_typed_hops(tmp_path, monkeypatch):
    """A two-service legacy stub migrates to the station ids and hop shapes the
    schema promises: a landing keeps its id, a catalogue station is renamed,
    and a hop names the road or lane it follows."""
    legacy = tmp_path / "ferry-crossings.json"
    legacy.write_text(json.dumps({
        "schemaVersion": 1, "policy": {}, "operatorModel": {}, "craft": {"_": "", "raft": {}},
        "services": [
            {"id": "ferry.stub.road", "kind": "road-crossing", "status": "active",
             "severs": ["route.road.helstrom-blackrose"], "hullClass": "canoe", "craft": "raft",
             "landings": [{"id": "ferry-landing.stub.n", "positionM": [10.0, 10.0],
                           "piece": "landing-argonian"},
                          {"id": "ferry-landing.stub.s", "positionM": [10.0, 40.0],
                           "piece": "landing-argonian"}],
             "operator": {"slotId": "ferry-slot.stub.poler"}, "fare": {"gold": 1}},
            {"id": "ferry.stub.run", "kind": "station-run", "status": "active",
             "hullClass": "small-draft", "craft": "raft",
             "stations": ["place.imperial-penal-south.lake-ferry-stage",
                          "place.imperial-penal-south.blackrose"],
             "operator": {"slotId": "ferry-slot.stub.keeper"}, "fare": {"gold": 1}},
        ]}), encoding="utf-8")
    roots = tmp_path / "root-transit.json"
    roots.write_text(json.dumps({
        "stations": [{"id": "root-helstrom", "u": 0.47, "v": 0.38},
                     {"id": "root-naga-deeps", "u": 0.47, "v": 0.66}],
        "edges": [{"from": "root-helstrom", "to": "root-naga-deeps"}]}), encoding="utf-8")
    monkeypatch.setattr(ts, "LEGACY_FERRIES", legacy)
    monkeypatch.setattr(ts, "LEGACY_ROOT", roots)

    doc = ts.migrate()
    ids = {s["id"] for s in doc["stations"]}
    assert {"ferry-landing.stub.n", "ferry-landing.stub.s",
            "station.imperial-penal-south.blackrose",
            "station.imperial-penal-south.lake-ferry-stage",
            "root-node.helstrom", "root-node.naga-deeps"} <= ids

    by_id = {s["id"]: s for s in doc["services"]}
    road = by_id["ferry.stub.road"]
    assert road["serviceKind"] == "ferry" and road["form"] == "road-crossing"
    assert road["landings"] == ["ferry-landing.stub.n", "ferry-landing.stub.s"]
    assert road["hops"] == [{"from": "ferry-landing.stub.n", "to": "ferry-landing.stub.s",
                             "follows": {"road": "route.road.helstrom-blackrose"},
                             "lengthM": 30.0}]
    assert road["operator"]["socket"] == {"stationId": "ferry-landing.stub.n"}

    run = by_id["ferry.stub.run"]
    assert run["stations"] == ["station.imperial-penal-south.lake-ferry-stage",
                               "station.imperial-penal-south.blackrose"]
    assert run["hops"][0]["follows"] == {"lane": "route.boat.blackrose-lake-ferry"}

    worm = by_id["rootworm.underground-express"]
    assert worm["status"] == "placeholder" and worm["placeholderWhy"]
    assert worm["hops"][0]["follows"] == {"rootway": "rootway.helstrom-naga-deeps"}
    assert doc["rootways"] == [{"id": "rootway.helstrom-naga-deeps",
                                "from": "root-node.helstrom", "to": "root-node.naga-deeps",
                                "status": "placeholder"}]
    assert any(s["serviceKind"] == "boat" for s in doc["services"]), \
        "the registry's boat lanes between catalogue stations become services"


class _StubWater:
    """Depth rises linearly from 0.3 m at the bank to `deep` m at `at` m in."""

    def __init__(self, deep=1.5, at=12.0):
        self.deep, self.at = deep, at

    def water_at(self, x, z):
        d = abs(z - 1005.0)          # distance in from the stub's north bank
        t = min(1.0, d / self.at)
        return {"id": "body.1-1", "kind": "lake-lowland",
                "depthM": 0.3 + (self.deep - 0.3) * t}


def test_the_berth_is_the_first_floating_sample_and_jetty_is_the_walk():
    doc = _stub_graph()
    doc["services"][0]["hullClass"] = "small-draft"
    from .dock_spec import HULL_CLASS_DEPTH_M
    need = HULL_CLASS_DEPTH_M["small-draft"]
    ts.derive(doc, [_stub_crossing(1000.0, 1050.0)], sw=_StubWater())
    s = doc["services"][0]
    assert s["status"] == "active", s.get("unmatchedWhy")
    b = {st["id"]: st["berth"] for st in doc["stations"] if st.get("berth")}["ferry-landing.stub.a"]
    assert b["floats"] is True and b["depthM"] >= need
    assert 0 < b["jettyM"] <= 12.0
    assert b["positionM"] == [1000.0, round(1005.0 + b["jettyM"], 1)]
    assert not [e for e in ts.check(doc) if "berth" in e]


def test_a_shallow_berth_warns_and_the_service_stays_active():
    """Depth is reported, never gated (rule 2, owner 2026-09-18): the shortfall
    is written down on the service and the landing, and 16h answers it with
    the craft or the jetty. Only DRY ground unmatches."""
    doc = _stub_graph()
    doc["services"][0]["hullClass"] = "small-draft"
    ts.derive(doc, [_stub_crossing(1000.0, 1050.0)], sw=_StubWater(deep=0.4, at=1.0))
    s = doc["services"][0]
    assert s["status"] == "active", s.get("unmatchedWhy")
    warn = s["warnings"]
    assert [w["kind"] for w in warn] == ["shallow-berth", "shallow-berth"]
    assert warn[0] == {"kind": "shallow-berth", "depthM": 0.4, "needM": 1.2,
                       "at": "ferry-landing.stub.a"}
    b = {st["id"]: st["berth"] for st in doc["stations"] if st.get("berth")}["ferry-landing.stub.a"]
    assert b["floats"] is False and b["jettyM"] is None and b["depthM"] == 0.4
    assert not [e for e in ts.check(doc) if "does not float" in e], \
        "the warning is recorded, so --check must not turn it into an error"
    del s["warnings"]
    assert [e for e in ts.check(doc) if "does not float" in e], \
        "a SILENT shallow berth is still an error"


def test_check_fails_on_an_active_berth_without_a_jetty():
    doc = _stub_graph()
    doc["services"][0]["hullClass"] = "small-draft"
    ts.derive(doc, [_stub_crossing(1000.0, 1050.0)], sw=_StubWater())
    for st in doc["stations"]:
        if st.get("berth"):
            st["berth"]["jettyM"] = None
    assert any("no jettyM" in e for e in ts.check(doc)), ts.check(doc)


# --------------------------------------------------------------------------
# 16g deliverable 6: connectedness gates, depth only reports, hops follow the
# published lanes, a harbour per city, the rootworm network re-sited.
# --------------------------------------------------------------------------

def _two_lane_net():
    """Two straight lanes meeting end to end at [200, 0]."""
    return ts.LaneNetwork([
        ("route.boat.west", [[0.0, 0.0], [100.0, 0.0], [200.0, 0.0]]),
        ("route.boat.east", [[200.0, 0.0], [300.0, 0.0], [400.0, 0.0]]),
    ])


def _run_graph():
    """A two-hop station run whose three stations sit on the two lanes."""
    return {
        "schemaVersion": 1, "craft": {"_": ""},
        "vocabulary": {"kinds": ts.SERVICE_KINDS, "stationKinds": ts.STATION_KINDS,
                       "hopFollows": ts.HOP_FOLLOWS},
        "stations": [
            {"id": "station.stub.a", "kind": "place", "placeId": "place.stub.a",
             "positionM": [0.0, 0.0], "status": "active"},
            {"id": "station.stub.b", "kind": "place", "placeId": "place.stub.b",
             "positionM": [400.0, 0.0], "status": "active"},
        ],
        "services": [{
            "id": "boat.stub.run", "serviceKind": "boat", "form": "station-run",
            "status": "active", "hullClass": "small-draft",
            "stations": ["station.stub.a", "station.stub.b"],
            "hops": [{"from": "station.stub.a", "to": "station.stub.b",
                      "follows": {"reaches": []}, "lengthM": 400.0, "unresolved": True}],
            "operator": {"slotId": "boat-slot.stub.owner", "role": "boat owner",
                         "socket": {"stationId": "station.stub.a"}},
            "fare": {"gold": 1, "freeIf": []}, "available": [], "refusedIf": [],
            "text": {},
        }],
        "rootways": [],
    }


def _stub_places():
    return {"place.stub.a": {"id": "place.stub.a", "status": "active", "positionM": [0.0, 0.0],
                             "travelStation": {"modes": ["boat"]}},
            "place.stub.b": {"id": "place.stub.b", "status": "active", "positionM": [400.0, 0.0],
                             "travelStation": {"modes": ["boat"]}}}


def test_check_fails_when_the_active_network_is_an_island():
    """Connectedness over depth (rule 1, owner 2026-09-18): a station nobody
    can reach from the rest of the network is a hard error."""
    doc = _run_graph()
    doc["harbourStations"] = {}
    assert not [e for e in ts.check(doc) if "not connected" in e], "the joined graph passes"
    doc["stations"].append({"id": "station.stub.island", "kind": "place",
                            "placeId": "place.stub.a", "positionM": [9.0, 9.0],
                            "status": "active"})
    errs = [e for e in ts.check(doc) if "not connected" in e]
    assert errs and "station.stub.island" in errs[0], ts.check(doc)


def test_a_shallow_hop_is_a_warning_and_the_service_stays_active():
    """Depth is reported, never gated (rule 2)."""
    doc = _run_graph()
    ts.derive(doc, [], sw=_StubWater(deep=0.2, at=1.0), places=_stub_places(),
              net=_two_lane_net(), roots={}, harbours={}, anchors=[])
    s = doc["services"][0]
    assert s["status"] == "active", s.get("unmatchedWhy")
    warn = s["warnings"]
    assert warn[0]["kind"] == "shallow-hop" and warn[0]["needM"] == 1.2
    assert warn[0]["depthM"] < 1.2 and warn[0]["at"].startswith("station.stub.a")
    assert not [e for e in ts.check(doc) if "shallow" in e]


def test_a_dry_landing_is_unmatched():
    """The one berth fault that still unmatches: no water under the landing."""
    class _Dry:
        def water_at(self, x, z):
            return None

    doc = _stub_graph()
    ts.derive(doc, [_stub_crossing(1000.0, 1050.0)], sw=_Dry())
    s = doc["services"][0]
    assert s["status"] == "unmatched" and "is dry" in s["unmatchedWhy"], s.get("unmatchedWhy")


def test_a_hop_paths_over_two_lanes_and_reports_the_walked_length():
    doc = _run_graph()
    ts.derive(doc, [], sw=None, places=_stub_places(), net=_two_lane_net(),
              roots={}, harbours={}, anchors=[])
    hop = doc["services"][0]["hops"][0]
    assert hop["follows"] == {"lanes": ["route.boat.west", "route.boat.east"]}
    assert hop["lengthM"] == 400.0 and "unresolved" not in hop


def test_a_station_off_the_lane_network_is_unmatched_with_the_distance():
    doc = _run_graph()
    places = _stub_places()
    places["place.stub.b"]["positionM"] = [400.0, 500.0]
    ts.derive(doc, [], sw=None, places=places, net=_two_lane_net(),
              roots={}, harbours={}, anchors=[])
    s = doc["services"][0]
    assert s["status"] == "unmatched" and "500 m from the nearest lane vertex" in s["unmatchedWhy"]


def test_a_station_moves_when_its_place_moves():
    """Rule 7: every hop is re-derived from the current record positions."""
    doc = _run_graph()
    places = _stub_places()
    places["place.stub.a"]["positionM"] = [100.0, 0.0]
    ts.derive(doc, [], sw=None, places=places, net=_two_lane_net(),
              roots={}, harbours={}, anchors=[])
    by_id = {st["id"]: st for st in doc["stations"]}
    assert by_id["station.stub.a"]["positionM"] == [100.0, 0.0]
    assert doc["services"][0]["hops"][0]["lengthM"] == 300.0


def test_an_unfilled_harbour_is_a_warning_and_a_city_quay_fills_itself():
    doc = _run_graph()
    places = _stub_places()
    places["place.stub.a"]["cityLayout"] = {"gate": [0.0, 0.0]}
    anchors = [{"id": "a", "rank": "major"}, {"id": "b", "rank": "major"}]
    ts.derive(doc, [], sw=None, places=places, net=_two_lane_net(),
              roots={}, harbours={}, anchors=anchors)
    block = doc["harbourStations"]
    assert block["a"] == {"stationId": "station.stub.a", "placeId": "place.stub.a",
                          "why": "the city's own quay"}
    assert block["b"]["placeId"] is None
    warn: list[str] = []
    errs = ts.check(doc, warn)
    assert not [e for e in errs if "harbour b" in e], errs
    assert any("harbour b" in w for w in warn), warn


def test_a_root_node_is_re_sited_at_its_place_and_carries_its_waykeeper():
    doc = _run_graph()
    doc["services"].append({
        "id": "rootworm.underground-express", "serviceKind": "rootworm",
        "form": "station-run", "status": "placeholder", "placeholderWhy": "pass 1",
        "stations": [], "hops": [],
        "operator": {"slotId": "rootworm-slot.underground-express.waykeeper",
                     "role": "Waykeeper", "socket": {"stationId": "station.stub.a"}},
        "fare": {"gold": 0, "freeIf": []}, "available": [], "refusedIf": [], "text": {}})
    roots = {"stations": [{"id": "root-node.helstrom", "placeId": "place.stub.a",
                           "kind": "hub", "why": "the hub"},
                          {"id": "root-node.deeps", "placeId": None,
                           "kind": "station", "why": "not chosen yet"}],
             "rootways": [{"from": "root-node.helstrom", "to": "root-node.deeps"}]}
    places = _stub_places()
    places["place.stub.a"]["positionM"] = [10.0, 20.0]
    ts.derive(doc, [], sw=None, places=places, net=_two_lane_net(),
              roots=roots, harbours={}, anchors=[])
    by_id = {st["id"]: st for st in doc["stations"]}
    hub = by_id["root-node.helstrom"]
    assert hub["positionM"] == [10.0, 20.0] and hub["status"] == "active"
    assert hub["operator"] == {"role": "Waykeeper", "slotId": "rootworm-slot.helstrom.keeper",
                               "socket": {"stationId": "root-node.helstrom"}}
    assert by_id["root-node.deeps"]["status"] == "placeholder"
    assert doc["rootways"] == [{"id": "rootway.helstrom-deeps", "from": "root-node.helstrom",
                                "to": "root-node.deeps", "status": "placeholder"}]
    worm = [s for s in doc["services"] if s["id"] == "rootworm.underground-express"][0]
    assert worm["hops"][0]["follows"] == {"rootway": "rootway.helstrom-deeps"}


def test_the_retired_root_transit_record_is_gone():
    """0068 retired `anchors/root-transit.json`; the rootworm network is
    authored in `routes/rootworm-stations.json` now."""
    assert not ts.LEGACY_ROOT.exists(), f"{ts.LEGACY_ROOT} is back"
    assert ts.ROOT_STATIONS.exists()


def test_every_fast_node_resolves():
    doc = json.loads(ts.SERVICES.read_text(encoding="utf-8"))
    assert not ts._check_fast_nodes({s["id"] for s in doc["services"]})
    assert ts._check_fast_nodes(set()), "the FAST check would pass vacuously"
