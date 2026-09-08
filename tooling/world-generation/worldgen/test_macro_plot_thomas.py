"""Focused checks for the culture-specific Thomas-process placement prior."""

import math

import pytest

from . import macro_plot


def demand(rid: str, zone: str = "hist-heartland", type_: str = "camp") -> macro_plot.Demand:
    return macro_plot.Demand(
        id=rid, zone=zone, tier=2, layer="fine-tempo", magnitude=None,
        cls="camp", type=type_, danger=2, landforms=["any-firm-ground"],
        landforms_from_recipe=False, regions=set(), parents=[])


def candidate(cid: str, x: float, z: float, zone: str = "hist-heartland") -> macro_plot.Candidate:
    return macro_plot.Candidate(
        id=cid, kind="free", landform="any-firm-ground", x=x, z=z,
        region="firm lowland", danger=2, zone=zone, route_m=500.0,
        water_m=500.0, depth_m=0.0, slope=0.0, prominence=0.0,
        visibility=0.0, concealment=0.0, water_relation=0.0, anchor_m=500.0)


def test_thomas_parents_are_seeded_deterministic_and_clear_culture_floor():
    demands = [demand(f"place.hist-heartland.test-{i}") for i in range(17)]
    cands = [candidate(f"site.{i}", float(x), float(z))
             for i, (x, z) in enumerate((
                 (0, 0), (350, 0), (700, 0), (1050, 0),
                 (0, 700), (350, 700), (700, 700), (1050, 700)))]
    first = macro_plot.build_thomas_prior(demands, cands, seed=42)
    second = macro_plot.build_thomas_prior(demands, list(reversed(cands)), seed=42)
    assert first == second
    cluster = first["hist-heartland"]
    assert len(cluster["parents"]) == 3
    assert all(math.dist(a, b) >= cluster["parentFloorM"]
               for i, a in enumerate(cluster["parents"])
               for b in cluster["parents"][i + 1:])


def test_children_stay_strictly_clumped_even_in_relaxed_placement_stages():
    d = demand("place.hist-heartland.child")
    prior = {"hist-heartland": {"parents": [(0.0, 0.0)], "sigmaM": 100.0,
                                  "childRadiusM": 300.0}}
    assert macro_plot.thomas_prior_score(d, candidate("near", 100, 0), prior, False) > 0
    assert macro_plot.thomas_prior_score(d, candidate("far", 301, 0), prior, False) is None
    assert macro_plot.thomas_prior_score(d, candidate("far", 301, 0), prior, True) is None


def test_relaxation_never_weakens_distinct_footprint_clearance():
    child = demand("place.hist-heartland.child")
    other = demand("place.hist-heartland.other", type_="other")
    occupied = {other.id: (other, candidate("occupied", 0, 0))}
    ok, blocker = macro_plot.separation_ok(
        child, candidate("overlap", 29.9, 0), occupied, factor=0.5)
    assert not ok
    assert blocker == other.id


def test_typed_depth_class_is_an_executable_navigation_promise():
    d = demand("place.hist-heartland.future-channel")
    d.record = {"terrainRequests": [{
        "kind": "pool", "radiusM": 40,
        "delivery": {"feature": "dive-pool", "depthClass": "diving"},
        "note": "fixture",
    }]}
    assert macro_plot.promised_navigable_depth_m(d) >= 3.0


def test_underwater_infill_cannot_become_a_culture_parent():
    demands = [demand("place.hist-heartland.a")]
    land = candidate("land", 0, 0)
    water = candidate("water", 1000, 0)
    water.kind = "free-water"
    prior = macro_plot.build_thomas_prior(demands, [water, land], seed=42)
    assert prior["hist-heartland"]["parents"] == [(land.x, land.z)]


def test_authored_locality_is_a_conditional_parent_without_expanding_child_radius():
    d = demand("place.hist-heartland.local")
    d.near_point = (1000.0, 1000.0, 500.0)
    prior = {"hist-heartland": {"parents": [(0.0, 0.0)], "sigmaM": 100.0,
                                  "childRadiusM": 300.0}}
    assert macro_plot.thomas_prior_score(
        d, candidate("local", 1250, 1000), prior, True) is not None
    # The nearPoint's own relaxed max is 1,000 m, but the Thomas ceiling stays
    # authoritative: conditional parents solve the conflict, never an escape.
    assert macro_plot.thomas_prior_score(
        d, candidate("outside-kernel", 1301, 1000), prior, True) is None


def test_bound_child_becomes_locally_scarce_only_after_parent_is_resolved():
    d = demand("place.hist-heartland.bound-child")
    d.bound_to = "place.hist-heartland.parent"
    assert not macro_plot.has_resolved_locality(d, {})
    plotted = {d.bound_to: (900.0, 900.0)}
    assert macro_plot.has_resolved_locality(d, plotted)
    prior = {"hist-heartland": {"parents": [(0.0, 0.0)], "sigmaM": 100.0,
                                  "childRadiusM": 300.0}}
    assert macro_plot.thomas_prior_score(
        d, candidate("by-parent", 1100, 900), prior, True, plotted) is not None
    assert macro_plot.thomas_prior_score(
        d, candidate("past-parent-kernel", 1201, 900), prior, True, plotted) is None


def test_reference_site_must_leave_a_real_candidate_in_child_local_domain():
    child = demand("place.hist-heartland.child")
    child.near_point = (1000.0, 1000.0, 100.0)
    child.bound_to = "place.hist-heartland.parent"
    deps = {child.bound_to: [child]}

    class Survey:
        @staticmethod
        def line_of_sight(*_args, **_kwargs):
            return True

    assert macro_plot.reference_supports_local_dependents(
        child.bound_to, candidate("parent-near", 1250, 1000), deps,
        relaxed=False, survey=Survey(),
        local_candidates={child.id: [candidate("child-site", 1000, 1000)]})
    assert not macro_plot.reference_supports_local_dependents(
        child.bound_to, candidate("parent-strands-child", 1401, 1000), deps,
        relaxed=False, survey=Survey(), local_candidates={child.id: []})

    child.bound_to = None
    child.sightline_to = ["place.hist-heartland.lookout"]
    deps = {child.sightline_to[0]: [child]}
    assert not macro_plot.reference_supports_local_dependents(
        child.sightline_to[0], candidate("lookout", 1200, 1000), deps,
        relaxed=False, survey=Survey(), local_candidates={child.id: []})
    assert macro_plot.reference_supports_local_dependents(
        child.sightline_to[0], candidate("lookout", 1200, 1000), deps,
        relaxed=False, survey=Survey(),
        local_candidates={child.id: [candidate("visible-child-site", 1050, 1000)]})


def test_parent_shortfall_is_a_failure_not_a_quietly_weaker_prior():
    demands = [demand(f"place.hist-heartland.test-{i}") for i in range(17)]
    cands = [candidate("site.a", 0, 0), candidate("site.b", 100, 0)]
    with pytest.raises(ValueError, match="needs 3 Thomas parents but only 1"):
        macro_plot.build_thomas_prior(demands, cands, seed=42)


def test_outcome_gate_checks_homeless_radius_and_parent_occupancy(monkeypatch):
    monkeypatch.setattr(macro_plot, "load_overrides", lambda: [])
    demands = [demand("place.hist-heartland.a"), demand("place.hist-heartland.b")]
    prior = {"hist-heartland": {"parents": [(0.0, 0.0), (600.0, 0.0), (1200.0, 0.0)],
                                  "childRadiusM": 300.0}}
    result = {
        demands[0].id: {"candidate": candidate("near", 10, 0)},
        demands[1].id: {"candidate": candidate("far", 1800, 0)},
    }
    audit, errors = macro_plot.thomas_outcome(
        prior, demands, result, [{"id": "place.hist-heartland.missing"}])
    assert audit["outsideRadius"] == [demands[1].id]
    # An out-of-kernel child cannot make a latent parent look occupied.
    assert audit["emptyParents"] == {"hist-heartland": [1, 2]}
    assert len(errors) == 3


def test_general_even_spacing_floor_is_gone_but_collision_and_repetition_remain():
    a = demand("place.hist-heartland.a", type_="camp-a")
    b = demand("place.hist-heartland.b", type_="camp-b")
    origin = candidate("origin", 0, 0)
    assert macro_plot.separation_ok(b, candidate("near", 40, 0), {a.id: (a, origin)}) == (True, None)
    assert macro_plot.separation_ok(b, candidate("collision", 20, 0), {a.id: (a, origin)})[0] is False
    b.type = a.type
    assert macro_plot.separation_ok(b, candidate("repeat", 200, 0), {a.id: (a, origin)})[0] is False


def test_the_four_authored_exemplar_overrides_remain_post_solve_pins():
    overrides = macro_plot.load_overrides()
    assert {o["id"] for o in overrides} == {
        "place.dunmer-north.mazzatun",
        "place.hist-heartland.nine-trunks",
        "place.hist-heartland.sap-tapping-licensed",
        "place.naga-kur-deeps.wamasu-pond-adult",
    }
    assert all(o["source"].startswith("world/sources/blueprints/") for o in overrides)
