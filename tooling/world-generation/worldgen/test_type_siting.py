"""The typed FOOTPRINT and PROXIMITY gates (owner ruling 2026-09-09).

Every gate here was mutation-tested: the mutation is named in the docstring of
the test that covers it, and each one turned the test red before the real
implementation turned it green again.
"""

import json
import math

import pytest

from . import author_type_siting, travel_cost, macro_plot
from .audit_place_semantics import CHECKS, Ctx, check_type_proximity


# --------------------------------------------------------------------------- #
# fixtures
# --------------------------------------------------------------------------- #
def demand(rid: str, cls: str = "camp", type_: str = "camp",
           footprint: float = 40.0, proximity: dict | None = None,
           zone: str = "hist-heartland", **kw) -> macro_plot.Demand:
    return macro_plot.Demand(
        id=rid, zone=zone, tier=2, layer="fine-tempo", magnitude=None,
        cls=cls, type=type_, danger=2, landforms=["any-firm-ground"],
        landforms_from_recipe=False, regions=set(), parents=[],
        footprint_m=footprint, proximity=proximity or {}, **kw)


def candidate(cid: str, x: float, z: float, route_m: float = 500.0) -> macro_plot.Candidate:
    return macro_plot.Candidate(
        id=cid, kind="free", landform="any-firm-ground", x=x, z=z,
        region="firm lowland", danger=2, zone="hist-heartland", route_m=route_m,
        water_m=500.0, depth_m=0.0, slope=0.0, prominence=0.0,
        visibility=0.0, concealment=0.0, water_relation=0.0, anchor_m=500.0)


class SightStub:
    """Minimum of the ProvinceSurvey surface `separation_ok` touches."""

    def __init__(self, visible: bool):
        self.visible = visible

    def line_of_sight(self, ax, az, bx, bz):
        return self.visible


@pytest.fixture(scope="module")
def recipes() -> dict[str, dict]:
    return {t["type"]: t
            for t in json.loads(author_type_siting.RECIPES_PATH.read_text())["types"]}


# --------------------------------------------------------------------------- #
# 1. the authored data
# --------------------------------------------------------------------------- #
def test_every_type_carries_a_footprint_radius(recipes):
    for typ, recipe in recipes.items():
        r = recipe.get("footprintRadiusM")
        assert isinstance(r, int), f"{typ} has no integer footprintRadiusM"
        assert r >= author_type_siting.FOOTPRINT_FLOOR_M, typ


def test_footprints_are_derived_from_the_blueprints_built_ground_not_hand_typed(recipes):
    """MUTATION: change `rebuilt-stilt-city` to 100 in type-recipes.json — red
    (the derivation says 225, measured off Lilmoth's built ground)."""
    measured = author_type_siting.built_ground_radii()
    assert measured, "no built ground measured — the deriver is not reading the blueprints"
    for typ, radius_m in measured.items():
        expected = int(round(radius_m / 5.0) * 5)
        assert recipes[typ]["footprintRadiusM"] == expected, typ
        assert recipes[typ]["footprintSource"] == "built-ground", typ


def test_the_built_ground_is_what_stands_there_not_the_outer_boundary():
    """A footprint is the ground a place occupies, not the polygon drawn round it.

    `blueprint.boundary` encloses the approach, the water a landing sits in and
    the yard: the sap camp's boundary went from 32 m to 254 m when its boat
    landing moved to the head of the tide, and the derivation followed it to a
    two-hut works the size of Lilmoth. The built ground does not move, because
    the works did not.

    MUTATION: derive from `bp["boundary"]` instead — red on both revisions.
    """
    import math
    import subprocess
    from worldgen.scale import PROVINCE_EXTENT_M as extent

    def circumradius(pts):
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        return max(math.hypot(x - cx, z - cz) for x, z in pts)

    path = ("world/sources/blueprints/"
            "place.hist-heartland.sap-tapping-licensed.json")
    live = json.loads((author_type_siting.REPO_ROOT / path).read_text())["blueprint"]
    head = json.loads(subprocess.run(
        ["git", "show", f"HEAD:{path}"], cwd=author_type_siting.REPO_ROOT,
        capture_output=True, text=True, check=True).stdout)["blueprint"]
    for name, bp in (("working tree", live), ("HEAD", head)):
        built = circumradius(author_type_siting.built_ground_points(bp))
        assert 20.0 <= built <= 35.0, f"{name}: built ground reads {built:.1f} m"
    # ...and the two revisions' outer boundaries really are miles apart, so
    # this test would be vacuous if it were reading them.
    outer = [circumradius([(u * extent, v * extent) for u, v in bp["boundary"]])
             for bp in (live, head)]
    assert max(outer) - min(outer) > 100.0, outer


def test_the_authored_recipe_file_matches_its_deriver():
    """MUTATION: edit any footprintRadiusM or proximity block by hand — red."""
    assert author_type_siting.main(["--check"]) == 0


def test_proximity_rows_only_name_real_classes_and_quote_their_evidence(recipes):
    classes = {r["class"] for r in recipes.values()} | {"route"}
    for typ, recipe in recipes.items():
        prox = recipe.get("proximity")
        if prox is None:
            continue
        assert prox.get("why"), f"{typ} proximity has no recorded evidence"
        for key in ("minFromClassM", "maxFromM"):
            assert set(prox.get(key) or {}) <= classes, (typ, key)
        assert set(prox.get("outOfSightOf") or ()) <= classes, typ
        assert set(prox.get("mayAbut") or ()) <= classes, typ


def test_absent_proximity_is_the_explicit_default(recipes):
    """A type whose prose states no distance carries no block at all, and the
    solver reads that as unconstrained rather than as zero."""
    assert any("proximity" not in r for r in recipes.values())
    d = demand("place.hist-heartland.plain")
    assert d.proximity == {}
    assert macro_plot.separation_ok(
        d, candidate("anywhere", 5000, 5000), {})[0] is True


# --------------------------------------------------------------------------- #
# 2. the footprint gate
# --------------------------------------------------------------------------- #
def test_two_footprints_may_never_overlap():
    """MUTATION: `physical_need = COLLISION_MIN_M` (the old line) — red at 90 m."""
    a = demand("place.hist-heartland.city", cls="settlement", type_="city", footprint=230.0)
    b = demand("place.hist-heartland.lighthouse", type_="lighthouse", footprint=40.0)
    plotted = {a.id: (a, candidate("city-site", 0, 0))}
    for dist in (38.0, 90.0, 269.0):
        ok, blocker = macro_plot.separation_ok(b, candidate("near", dist, 0), plotted)
        assert not ok and blocker == a.id, dist
    assert macro_plot.separation_ok(b, candidate("clear", 271.0, 0), plotted)[0]


def test_the_footprint_floor_never_relaxes():
    """MUTATION: multiply `physical_need` by `factor` — red at factor 0.5."""
    a = demand("place.hist-heartland.city", cls="settlement", type_="city", footprint=230.0)
    b = demand("place.hist-heartland.camp", footprint=40.0)
    plotted = {a.id: (a, candidate("city-site", 0, 0))}
    for factor in (1.0, 0.75, 0.5, 0.25):
        assert not macro_plot.separation_ok(
            b, candidate("near", 200.0, 0), plotted, factor)[0], factor


def test_a_related_place_that_may_abut_sits_inside_its_parents_ground():
    """MUTATION: drop the `abuts` branch — red (mazzatun-hist cannot sit in
    Mazzatun); MUTATION: make `abuts` return True for everything — the
    lighthouse case above goes red."""
    city = demand("place.dunmer-north.mazzatun", cls="settlement", type_="heretic-stone-village",
                  footprint=130.0, zone="dunmer-north")
    hist = demand("place.dunmer-north.mazzatun-hist", cls="sacred", type_="city-hist",
                  footprint=35.0, zone="dunmer-north",
                  proximity={"maxFromM": {"settlement": 250}, "mayAbut": ["settlement"]})
    hist.bound_to = city.id
    plotted = {city.id: (city, candidate("city-site", 0, 0))}
    assert macro_plot.separation_ok(hist, candidate("inside", 60.0, 0), plotted)[0]
    # ...but still two distinct dots
    assert not macro_plot.separation_ok(hist, candidate("on-top", 20.0, 0), plotted)[0]


def test_relationships_are_symmetric():
    """MUTATION: read `bound_to` only off the record being placed — red (which
    of the pair the solver reached first changed the answer)."""
    city = demand("place.dunmer-north.mazzatun", cls="settlement", type_="v",
                  footprint=130.0, zone="dunmer-north")
    hist = demand("place.dunmer-north.mazzatun-hist", cls="sacred", type_="h",
                  footprint=35.0, zone="dunmer-north", proximity={"mayAbut": ["settlement"]})
    hist.bound_to = city.id
    assert macro_plot.related_pair(city, hist) and macro_plot.related_pair(hist, city)
    assert macro_plot.abuts(city, hist) and macro_plot.abuts(hist, city)


# --------------------------------------------------------------------------- #
# 3. the proximity gates
# --------------------------------------------------------------------------- #
def test_an_isolation_floor_is_a_hard_gate_in_both_directions():
    """MUTATION: delete the reverse (`o_prox`) half — red on the second case,
    which is exactly how a village plotted later walked into a hermitage."""
    hermit = demand("place.hist-heartland.hermit", cls="lone", type_="hermit-hut",
                    footprint=30.0, proximity={"minFromClassM": {"settlement": 600}})
    village = demand("place.hist-heartland.village", cls="settlement", type_="hist-village",
                     footprint=120.0)
    at_village = {village.id: (village, candidate("village-site", 0, 0))}
    assert not macro_plot.separation_ok(hermit, candidate("too-near", 400.0, 0), at_village)[0]
    assert macro_plot.separation_ok(hermit, candidate("far", 620.0, 0), at_village)[0]
    at_hermit = {hermit.id: (hermit, candidate("hermit-site", 0, 0))}
    assert not macro_plot.separation_ok(village, candidate("too-near", 400.0, 0), at_hermit)[0]


def test_a_max_from_dependency_is_a_hard_gate():
    """MUTATION: `if near is not None and near > limit` -> `< limit` — red."""
    ruin = demand("place.hist-heartland.ruin", cls="ruin", type_="xanmeer", footprint=90.0)
    dig = demand("place.hist-heartland.dig", type_="dig-camp", footprint=35.0,
                 proximity={"maxFromM": {"ruin": 500}})
    plotted = {ruin.id: (ruin, candidate("ruin-site", 0, 0))}
    assert macro_plot.separation_ok(dig, candidate("beside", 200.0, 0), plotted)[0]
    ok, blocker = macro_plot.separation_ok(dig, candidate("miles-off", 900.0, 0), plotted)
    assert not ok and blocker == "max-from:ruin"


def test_the_route_pseudo_class_is_measured_on_the_candidate():
    flier = demand("place.hist-heartland.flier", cls="lone", type_="fallen-flier",
                   footprint=25.0,
                   proximity={"minFromClassM": {"route": 400}, "maxFromM": {"route": 1500}})
    assert macro_plot.separation_ok(flier, candidate("good", 0, 0, route_m=800.0), {})[0]
    assert not macro_plot.separation_ok(flier, candidate("on-road", 0, 0, route_m=100.0), {})[0]
    assert not macro_plot.separation_ok(flier, candidate("lost", 0, 0, route_m=2000.0), {})[0]


def test_out_of_sight_of_is_really_evaluated():
    """MUTATION: drop the `line_of_sight` call — red on the first case."""
    ledge = demand("place.hist-heartland.ledge", cls="works", type_="smugglers-ledge",
                   footprint=30.0, proximity={"minFromClassM": {"settlement": 250},
                                              "maxFromM": {"settlement": 800},
                                              "outOfSightOf": ["settlement"]})
    post = demand("place.hist-heartland.post", cls="settlement", type_="v", footprint=65.0)
    plotted = {post.id: (post, candidate("post-site", 0, 0))}
    c = candidate("ledge-site", 400.0, 0)
    assert not macro_plot.separation_ok(ledge, c, plotted, 1.0, SightStub(True))[0]
    assert macro_plot.separation_ok(ledge, c, plotted, 1.0, SightStub(False))[0]


def test_the_closing_pass_catches_what_the_ordering_hid():
    """`separation_ok` only sees what is already plotted, so the finished plot
    is re-checked with no ordering at all.
    MUTATION: return [] from `typed_siting_violations` — red."""
    hermit = demand("place.hist-heartland.hermit", cls="lone", type_="hermit-hut",
                    footprint=30.0, proximity={"minFromClassM": {"settlement": 600}})
    village = demand("place.hist-heartland.village", cls="settlement", type_="v", footprint=120.0)
    result = {hermit.id: {"candidate": candidate("h", 0, 0)},
              village.id: {"candidate": candidate("v", 100.0, 0)}}
    rows = macro_plot.typed_siting_violations([hermit, village], result)
    gates = {r["gate"] for r in rows}
    assert "minFromClassM" in gates and "footprint" in gates


# --------------------------------------------------------------------------- #
# 4. the semantic audit
# --------------------------------------------------------------------------- #
def _record(rid: str, typ: str, cls: str, pos) -> dict:
    return {"id": rid, "name": rid.rsplit(".", 1)[-1].title(), "status": "active",
            "classification": {"class": cls, "type": typ}, "positionM": list(pos)}


def test_the_semantic_audit_fails_a_record_that_contradicts_its_type_prose():
    """MUTATION: remove `check_type_proximity` from CHECKS — the 19 isolation
    records that violate their own type prose go back to passing clean."""
    recipes = {"hermit-hut": {"type": "hermit-hut", "class": "lone",
                              "proximity": {"minFromClassM": {"settlement": 600},
                                            "why": "deliberately far from everything"}},
               "hist-village": {"type": "hist-village", "class": "settlement"}}
    records = {"place.z.hermit": _record("place.z.hermit", "hermit-hut", "lone", (0, 0)),
               "place.z.village": _record("place.z.village", "hist-village", "settlement", (96, 0))}
    ctx = Ctx(terrain=SightStub(False), routes=[], records=records,
              region_of={k: "z" for k in records}, recipes=recipes)
    assert ("type-proximity", check_type_proximity) in CHECKS, \
        "the check exists but the audit driver never runs it"
    findings = check_type_proximity(ctx, records["place.z.hermit"])
    assert [f.check for f in findings] == ["type-proximity"]
    assert findings[0].severity == "high" and "96 m" in findings[0].fact
    # ...and the village, which claims nothing about distance, is left alone
    assert check_type_proximity(ctx, records["place.z.village"]) == []


# --------------------------------------------------------------------------- #
# 5. the SHIPPED catalogue — a ratchet, not yet a clean bill
# --------------------------------------------------------------------------- #
# The re-plot that would satisfy these gates over the whole catalogue is
# BLOCKED (2026-09-09): a `--resolve-all` under the footprint model leaves 6 of
# 580 records with no honest site, so the solve cannot be committed. Evidence,
# the six records and the decision the owner has to make are in decision 0041
# and docs/research/phase11/phase11-gap-plan.md. Until then this is a ratchet:
# the shipped catalogue may not get WORSE, and when the re-plot lands these
# numbers go to zero and the test becomes the clean assertion.
# 2026-09-09, second pass: the footprint derivation was corrected to read the
# BUILT GROUND rather than the outer boundary (426 -> 415 overlapping pairs),
# and the isolation floors are now judged in equivalent flat metres of walking
# rather than plan metres (31 -> 21 breaches). Both are RATCHETS DOWN: the
# numbers may only fall.
SHIPPED_FOOTPRINT_OVERLAPS = 415
SHIPPED_MIN_FROM_CLASS_VIOLATIONS = 21


@pytest.fixture(scope="module")
def survey():
    from worldgen.site_fields import ProvinceSurvey
    return ProvinceSurvey()


def _shipped_violations(s=None):
    from . import catalogue
    recipes = {t["type"]: t
               for t in json.loads(author_type_siting.RECIPES_PATH.read_text())["types"]}
    live = [rec for rf in catalogue.load_region_files() for rec in rf.places
            if rec.get("status") not in {"cut", "deferred"}
            and isinstance(rec.get("positionM"), list)]
    rows = [(rec["id"], rec["classification"]["class"],
             recipes[rec["classification"]["type"]], rec["positionM"]) for rec in live]
    overlaps = 0
    for i, (_ida, _ca, ra, pa) in enumerate(rows):
        for _idb, _cb, rb, pb in rows[i + 1:]:
            need = max(macro_plot.COLLISION_MIN_M,
                       ra["footprintRadiusM"] + rb["footprintRadiusM"])
            if (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2 < need * need:
                overlaps += 1
    # Isolation floors are judged in effort, not plan distance. Effort is
    # never below plan distance, so only a neighbour already inside the floor
    # on the plan can be inside it in walking: that is the short-circuit, and
    # `test_travel_cost` is what holds it up.
    metric = None if s is None else travel_cost.EffortMetric(s)
    floors = 0
    for ida, _ca, ra, pa in rows:
        for cls, limit in ((ra.get("proximity") or {}).get("minFromClassM") or {}).items():
            if cls == "route":
                continue
            inside = [(math.dist(pa, pb), pb) for idb, cb, _rb, pb in rows
                      if cb == cls and idb != ida and math.dist(pa, pb) < limit]
            if not inside:
                continue
            if metric is None:
                floors += 1
                continue
            if min(metric(pa[0], pa[1], pb[0], pb[1]) for _d, pb in inside) < limit:
                floors += 1
    return overlaps, floors


def test_the_shipped_catalogue_does_not_get_worse(survey):
    overlaps, floors = _shipped_violations(survey)
    assert overlaps <= SHIPPED_FOOTPRINT_OVERLAPS, (
        f"{overlaps} pairs now overlap footprints, up from {SHIPPED_FOOTPRINT_OVERLAPS}")
    assert floors <= SHIPPED_MIN_FROM_CLASS_VIOLATIONS, (
        f"{floors} records now sit inside their type's own isolation floor, "
        f"up from {SHIPPED_MIN_FROM_CLASS_VIOLATIONS}")


# --------------------------------------------------------------------------- #
# 5. isolation is measured as EFFORT, not as plan distance (2026-09-09)
# --------------------------------------------------------------------------- #
class RimStub:
    """A survey stub with a real height grid: flat marsh, then a rim face.

    Ground rises 1 m per metre east of x = 300, so a record placed up the face
    is a climb away, not a stroll away."""

    grid_px_m = 10.0
    grid_n = 256
    visible = False

    def __init__(self, rise_from_m: float = 300.0, rise: float = 1.0):
        import numpy as np
        xs = np.arange(self.grid_n, dtype=np.float64) * self.grid_px_m
        col = np.maximum(xs - rise_from_m, 0.0) * rise
        self.height_grid = np.tile(col, (self.grid_n, 1))

    def line_of_sight(self, ax, az, bx, bz):
        return self.visible


def test_an_isolation_floor_is_judged_on_the_climb_not_the_plan():
    """The type prose says the effort-to-reach IS the design, so a hermitage
    up a rim face clears a floor that the same plan distance across flat marsh
    does not.

    MUTATION: judge `minFromClassM` on `dist` again — red on the first case.
    """
    hermit = demand("place.dunmer-north.rim-hermitage", cls="lone",
                    type_="snowline-hermitage", footprint=30.0, zone="dunmer-north",
                    proximity={"minFromClassM": {"settlement": 600}})
    village = demand("place.dunmer-north.village", cls="settlement", type_="v",
                     footprint=120.0, zone="dunmer-north")
    plotted = {village.id: (village, candidate("village-site", 200.0, 500.0))}
    up_the_face = candidate("up-the-rim", 500.0, 500.0)
    assert macro_plot.separation_ok(hermit, up_the_face, plotted, 1.0, RimStub())[0]
    # ...and the same 300 m across the flat marsh is still far too close.
    flat = candidate("across-the-marsh", 200.0, 800.0)
    assert not macro_plot.separation_ok(hermit, flat, plotted, 1.0, RimStub())[0]


def test_flat_ground_gates_are_unchanged_by_the_effort_measure():
    """Not a blanket loosening: over flat marsh, equivalent flat metres ARE
    metres, so every authored floor keeps the calibration it was written with.

    MUTATION: normalise by TOBLER_PEAK_KMH instead of FLAT_SPEED_KMH — red
    (a 620 m flat neighbour starts reading as 520 and fails)."""
    hermit = demand("place.hist-heartland.hermit", cls="lone", type_="hermit-hut",
                    footprint=30.0, proximity={"minFromClassM": {"settlement": 600}})
    village = demand("place.hist-heartland.village", cls="settlement", type_="v",
                     footprint=120.0)
    plotted = {village.id: (village, candidate("village-site", 100.0, 100.0))}
    flat = RimStub(rise_from_m=1e9)
    assert not macro_plot.separation_ok(hermit, candidate("in", 690.0, 100.0),
                                        plotted, 1.0, flat)[0]
    assert macro_plot.separation_ok(hermit, candidate("out", 721.0, 100.0),
                                    plotted, 1.0, flat)[0]


def test_the_closing_pass_uses_the_same_effort_measure():
    """MUTATION: leave `typed_siting_violations` on plan distance — red, the
    closing pass would report a breach the solver deliberately admitted."""
    hermit = demand("place.dunmer-north.rim-hermitage", cls="lone",
                    type_="snowline-hermitage", footprint=30.0, zone="dunmer-north",
                    proximity={"minFromClassM": {"settlement": 600}})
    village = demand("place.dunmer-north.village", cls="settlement", type_="v",
                     footprint=120.0, zone="dunmer-north")
    result = {hermit.id: {"candidate": candidate("h", 500.0, 500.0)},
              village.id: {"candidate": candidate("v", 200.0, 500.0)}}
    assert not [r for r in macro_plot.typed_siting_violations(
        [hermit, village], result, RimStub()) if r["gate"] == "minFromClassM"]
    assert [r for r in macro_plot.typed_siting_violations(
        [hermit, village], result, None) if r["gate"] == "minFromClassM"]


def test_the_audit_reads_the_binding_neighbour_in_effort_not_on_the_plan():
    """`check_type_proximity` used to take the nearest neighbour on the plan
    and judge the floor on it. The binding neighbour is the one nearest in
    WALKING.

    MUTATION: go back to `nearest[cls]` and plan distance — red."""
    def _EFFORT_DISTANCE(self, ax, az, bx, bz):
        from . import travel_cost
        return travel_cost.effort_distance_m(self, ax, az, bx, bz)

    class Terrain(RimStub):
        def terrain_at(self, x, z):
            return {}

        effort_distance = _EFFORT_DISTANCE

    def rec(rid, cls, typ, pos):
        return {"id": rid, "name": rid, "status": "active",
                "classification": {"class": cls, "type": typ},
                "positionM": pos}

    hermit = rec("place.dunmer-north.rim-hermitage", "lone", "snowline-hermitage",
                 [500.0, 500.0])
    village = rec("place.dunmer-north.village", "settlement", "hist-village",
                  [200.0, 500.0])
    recipes = {"snowline-hermitage": {"type": "snowline-hermitage", "class": "lone",
                                      "proximity": {"minFromClassM": {"settlement": 600},
                                                    "why": "test"}},
               "hist-village": {"type": "hist-village", "class": "settlement"}}
    ctx = Ctx(records={r["id"]: r for r in (hermit, village)},
              region_of={hermit["id"]: "dunmer-north", village["id"]: "dunmer-north"},
              recipes=recipes, routes=[], terrain=Terrain())
    assert not check_type_proximity(ctx, hermit)
    # ...and this is not vacuous: on plan distance the same pair is a finding.
    plain = Terrain()
    del plain.__class__.effort_distance
    try:
        assert [f for f in check_type_proximity(
            Ctx(records=ctx.records, region_of=ctx.region_of, recipes=recipes,
                routes=[], terrain=plain), hermit)]
    finally:
        Terrain.effort_distance = _EFFORT_DISTANCE


# --------------------------------------------------------------------------- #
# 6. the two ordering holes the finished plot exposed (2026-09-09)
# --------------------------------------------------------------------------- #
def test_a_maxfrom_ceiling_missed_by_ordering_is_repaired_against_the_finished_plot():
    """`separation_ok` admits a ceiling un-judged when nothing of the target
    class is plotted yet. `ceiling_repair_pass` lifts the offender off the map
    and re-solves it against everything.

    MUTATION: drop the `len(after) < len(before)` guard — the rollback case
    below goes red."""
    fair = demand("place.dunmer-north.the-tide-fair", cls="civic",
                  type_="market-fair-ground", footprint=45.0, zone="dunmer-north",
                  proximity={"maxFromM": {"settlement": 350}})
    village = demand("place.dunmer-north.village", cls="settlement", type_="v",
                     footprint=120.0, zone="dunmer-north")
    demands = [fair, village]
    far = {fair.id: {"candidate": candidate("far", 900.0, 0)},
           village.id: {"candidate": candidate("v", 0, 0)}}
    assert [r for r in macro_plot.typed_siting_violations(demands, far) if r["gate"] == "maxFromM"]

    def fake_assign(ds, cands, s, anchors, preplaced=None, thomas_prior=None):
        out = dict(preplaced or {})
        out[fair.id] = {"candidate": candidate("near", 300.0, 0)}
        return out, []

    result = dict(far)
    trace = _run_repair(demands, result, fake_assign)
    assert trace[0]["accepted"] and trace[0]["offenders"] == [fair.id]
    assert not macro_plot.typed_siting_violations(demands, result)
    assert result[fair.id]["candidate"].id == "near"


def test_a_repair_that_would_leave_a_record_homeless_is_rolled_back():
    fair = demand("place.dunmer-north.the-tide-fair", cls="civic",
                  type_="market-fair-ground", footprint=45.0, zone="dunmer-north",
                  proximity={"maxFromM": {"settlement": 350}})
    village = demand("place.dunmer-north.village", cls="settlement", type_="v",
                     footprint=120.0, zone="dunmer-north")
    demands = [fair, village]
    result = {fair.id: {"candidate": candidate("far", 900.0, 0)},
              village.id: {"candidate": candidate("v", 0, 0)}}

    def fake_assign(ds, cands, s, anchors, preplaced=None, thomas_prior=None):
        return dict(preplaced or {}), [{"id": fair.id}]

    trace = _run_repair(demands, result, fake_assign)
    assert not trace[0]["accepted"]
    assert result[fair.id]["candidate"].id == "far"


def _run_repair(demands, result, fake_assign):
    real = macro_plot.assign
    macro_plot.assign = fake_assign
    try:
        class _Survey:
            anchor_points_m = {}
            height_grid = None
        return macro_plot.ceiling_repair_pass(demands, result, [], _Survey(), {})
    finally:
        macro_plot.assign = real


def test_a_thomas_parent_is_occupied_by_every_record_inside_its_kernel():
    """Culture parent floors (400-700 m) are below 2 x the 300 m child radius,
    so kernels overlap. Crediting only the NEAREST parent made a full kernel
    read as empty and failed `--resolve-all` on imperial-penal-south.

    MUTATION: credit `nearest` only — red."""
    prior = {"dunmer-north": {"parentFloorM": 400.0, "sigmaM": 110.0, "childRadiusM": 300.0,
                              "targetParents": 2, "parents": [(0.0, 0.0), (442.0, 0.0)]}}
    ds = [demand(f"place.dunmer-north.r{i}", zone="dunmer-north") for i in range(3)]
    for d in ds:
        d.landforms = []
    result = {d.id: {"candidate": candidate(f"c{i}", 200.0 + 10.0 * i, 0)}
              for i, d in enumerate(ds)}
    outcome, errors = macro_plot.thomas_outcome(prior, ds, result, [])
    assert outcome["parentOccupancy"]["dunmer-north"] == [3, 3]
    assert not outcome["emptyParents"] and not errors
