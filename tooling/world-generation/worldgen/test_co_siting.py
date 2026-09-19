"""`worldgen.co_siting` — every relation shown FAILING on a synthetic pair
before the real catalogue is allowed to pass (16g).

Each test names the mutation that turns it red, so none of them can quietly
stop measuring anything.
"""

from __future__ import annotations

from . import co_siting


class BlockedTerrain:
    """A survey stub: the sightline never clears."""

    def sightline_clearance(self, ax, az, bx, bz, eye_a=1.7, eye_b=8.0, step_m=None):
        return {"clearanceM": -4.2, "toleranceM": 0.5, "marginM": -4.7, "atT": 0.5, "clear": False}


class OpenTerrain:
    def sightline_clearance(self, ax, az, bx, bz, eye_a=1.7, eye_b=8.0, step_m=None):
        return {"clearanceM": 12.0, "toleranceM": 0.5, "marginM": 11.5, "atT": 0.5, "clear": True}


def rec(rid: str, pos, rows=None, water=None) -> dict:
    r = {"id": rid, "status": "active", "positionM": list(pos), "coSitedWith": rows or []}
    if water is not None:
        r["plotFacts"] = {"water": {"entityId": water}}
    return r


def pair(rel: str, measurement: dict, a_pos=(0.0, 0.0), b_pos=(100.0, 0.0), **kw):
    a = rec("place.testreg.a", a_pos,
            [{"place": "place.testreg.b", "relation": rel, "measurement": measurement}], **kw)
    b = rec("place.testreg.b", b_pos,
            [{"place": "place.testreg.a", "relation": rel, "measurement": measurement}],
            **({"water": kw["water"]} if "water" in kw else {}))
    return {a["id"]: a, b["id"]: b}


# --------------------------------------------------------------------------- #
# each relation, shown failing
# --------------------------------------------------------------------------- #
def test_a_sightline_the_terrain_blocks_fails():
    """MUTATION: return `None` for the sightline branch — red."""
    recs = pair("sightline", {"clearM": 6.0, "checked": "scour"})
    bad = co_siting.measure(recs, survey=BlockedTerrain(), services=({}, {}))
    assert len(bad) == 2 and all("sightline" in m and "blocked" in m for m in bad), bad
    assert co_siting.measure(recs, survey=OpenTerrain(), services=({}, {})) == []


def test_same_water_on_two_different_entities_fails():
    """MUTATION: compare only one end's entityId — red."""
    a = rec("place.testreg.a", (0, 0),
            [{"place": "place.testreg.b", "relation": "same-water",
              "measurement": {"entityId": "lake.blackrose"}}], water="lake.blackrose")
    b = rec("place.testreg.b", (50, 0),
            [{"place": "place.testreg.a", "relation": "same-water",
              "measurement": {"entityId": "lake.blackrose"}}], water="reach.183-1646")
    bad = co_siting.measure({a["id"]: a, b["id"]: b}, services=({}, {}))
    assert bad and all("stands in reach.183-1646" in m for m in bad), bad


def test_same_water_with_no_water_fact_is_a_failure_not_a_pass():
    """A record Lane A has not measured cannot be claimed to share water.
    MUTATION: `continue` when the fact is missing — red."""
    recs = pair("same-water", {"entityId": "lake.blackrose"})
    bad = co_siting.measure(recs, services=({}, {}))
    assert bad and all("no water fact" in m for m in bad), bad


def test_a_satellite_past_its_own_maxM_fails():
    """MUTATION: compare against `distanceM` instead of `maxM` — red."""
    recs = pair("satellite", {"distanceM": 100.0, "maxM": 60.0})
    bad = co_siting.measure(recs, services=({}, {}))
    assert bad and all("past maxM 60.0" in m for m in bad), bad
    ok = pair("satellite", {"distanceM": 100.0, "maxM": 400.0})
    assert co_siting.measure(ok, services=({}, {})) == []


def test_a_ferry_pair_with_no_service_fails():
    """MUTATION: treat a missing service as an unmeasured row — red."""
    recs = pair("ferry-pair", {"serviceId": "ferry.testreg.nobody-runs-this"})
    bad = co_siting.measure(recs, services=({}, {}))
    assert bad and all("not in travel-services.json" in m for m in bad), bad


def test_a_ferry_pair_calling_somewhere_else_fails():
    """A service that exists is not a service that carries YOU.
    MUTATION: stop comparing the station places — red."""
    services = ({"ferry.testreg.run": {"id": "ferry.testreg.run",
                                       "stations": ["station.testreg.a", "station.testreg.c"]}},
                {"station.testreg.a": "place.testreg.a", "station.testreg.c": "place.testreg.c"})
    recs = pair("ferry-pair", {"serviceId": "ferry.testreg.run"})
    bad = co_siting.measure(recs, services=services)
    assert bad and all("calls at" in m for m in bad), bad
    good = ({"ferry.testreg.run": {"id": "ferry.testreg.run",
                                   "stations": ["station.testreg.a", "station.testreg.b"]}},
            {"station.testreg.a": "place.testreg.a", "station.testreg.b": "place.testreg.b"})
    assert co_siting.measure(recs, services=good) == []


def test_approach_through_a_dead_record_fails():
    """MUTATION: drop the status test — red."""
    a = rec("place.testreg.a", (0, 0),
            [{"place": "place.testreg.b", "relation": "approach-through",
              "measurement": {"via": "place.testreg.gone"}}])
    b = rec("place.testreg.b", (50, 0))
    gone = rec("place.testreg.gone", (10, 0))
    gone["status"] = "cut"
    bad = co_siting.measure({r["id"]: r for r in (a, b, gone)}, services=({}, {}))
    assert bad and "is not live (cut)" in bad[0], bad


def test_a_pair_with_no_position_cannot_be_measured():
    """Silence is not a pass: an unplotted end is a failure.
    MUTATION: `return None` when positionM is missing — red."""
    recs = pair("satellite", {"distanceM": 10.0, "maxM": 400.0})
    del recs["place.testreg.b"]["positionM"]
    bad = co_siting.measure(recs, services=({}, {}))
    assert bad and all("no positionM" in m for m in bad), bad


# --------------------------------------------------------------------------- #
# the real catalogue
# --------------------------------------------------------------------------- #
def test_the_shipped_catalogue_measures_clean():
    assert co_siting.measure() == []
