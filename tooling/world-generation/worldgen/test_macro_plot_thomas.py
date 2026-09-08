"""Focused checks for the culture-specific Thomas-process placement prior."""

import math

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


def test_children_are_strictly_clumped_with_relaxed_escape_hatch():
    d = demand("place.hist-heartland.child")
    prior = {"hist-heartland": {"parents": [(0.0, 0.0)], "sigmaM": 100.0,
                                  "childRadiusM": 300.0}}
    assert macro_plot.thomas_prior_score(d, candidate("near", 100, 0), prior, False) > 0
    assert macro_plot.thomas_prior_score(d, candidate("far", 301, 0), prior, False) is None
    assert macro_plot.thomas_prior_score(d, candidate("far", 301, 0), prior, True) < 0


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
