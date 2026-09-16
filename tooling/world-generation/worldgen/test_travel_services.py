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


@pytest.mark.slow
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
    b = {st["id"]: st["berth"] for st in doc["stations"]}["ferry-landing.stub.a"]
    assert b["floats"] is True and b["depthM"] >= need
    assert 0 < b["jettyM"] <= 12.0
    assert b["positionM"] == [1000.0, round(1005.0 + b["jettyM"], 1)]
    assert not [e for e in ts.check(doc) if "berth" in e]


def test_a_shallow_berth_demotes_the_service_with_the_dredging_reason():
    doc = _stub_graph()
    doc["services"][0]["hullClass"] = "small-draft"
    ts.derive(doc, [_stub_crossing(1000.0, 1050.0)], sw=_StubWater(deep=0.4, at=1.0))
    s = doc["services"][0]
    assert s["status"] == "unmatched"
    assert "no dredging" in s["unmatchedWhy"] and "small-draft" in s["unmatchedWhy"]
    b = {st["id"]: st["berth"] for st in doc["stations"]}["ferry-landing.stub.a"]
    assert b["floats"] is False and b["jettyM"] is None and b["depthM"] == 0.4
    assert not [e for e in ts.check(doc) if "does not float" in e], \
        "derive demoted the service, so --check must not also fire on the berth"


def test_check_fails_on_an_active_berth_without_a_jetty():
    doc = _stub_graph()
    doc["services"][0]["hullClass"] = "small-draft"
    ts.derive(doc, [_stub_crossing(1000.0, 1050.0)], sw=_StubWater())
    for st in doc["stations"]:
        st["berth"]["jettyM"] = None
    assert any("no jettyM" in e for e in ts.check(doc)), ts.check(doc)
