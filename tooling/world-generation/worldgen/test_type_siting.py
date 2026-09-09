"""The typed FOOTPRINT and PROXIMITY gates (owner ruling 2026-09-09).

Every gate here was mutation-tested: the mutation is named in the docstring of
the test that covers it, and each one turned the test red before the real
implementation turned it green again.
"""

import json
import math

import pytest

from . import author_type_siting, macro_plot
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
        assert r <= author_type_siting.FOOTPRINT_CEILING_M, typ


def test_footprints_are_derived_from_the_blueprint_boundaries_not_hand_typed(recipes):
    """MUTATION: change `rebuilt-stilt-city` to 100 in type-recipes.json — red
    (the derivation says 275, measured off Lilmoth's authored boundary)."""
    measured = author_type_siting.blueprint_radii()
    assert measured, "no blueprint boundaries measured — the deriver is not reading them"
    for typ, radius_m in measured.items():
        expected = int(round(min(radius_m, author_type_siting.FOOTPRINT_CEILING_M) / 5.0) * 5)
        assert recipes[typ]["footprintRadiusM"] == expected, typ
        assert recipes[typ]["footprintSource"] == "blueprint", typ


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
SHIPPED_FOOTPRINT_OVERLAPS = 426
SHIPPED_MIN_FROM_CLASS_VIOLATIONS = 31


def _shipped_violations():
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
    floors = 0
    for ida, _ca, ra, pa in rows:
        for cls, limit in ((ra.get("proximity") or {}).get("minFromClassM") or {}).items():
            if cls == "route":
                continue
            near = min((math.dist(pa, pb) for idb, cb, _rb, pb in rows
                        if cb == cls and idb != ida), default=None)
            if near is not None and near < limit:
                floors += 1
    return overlaps, floors


def test_the_shipped_catalogue_does_not_get_worse():
    overlaps, floors = _shipped_violations()
    assert overlaps <= SHIPPED_FOOTPRINT_OVERLAPS, (
        f"{overlaps} pairs now overlap footprints, up from {SHIPPED_FOOTPRINT_OVERLAPS}")
    assert floors <= SHIPPED_MIN_FROM_CLASS_VIOLATIONS, (
        f"{floors} records now sit inside their type's own isolation floor, "
        f"up from {SHIPPED_MIN_FROM_CLASS_VIOLATIONS}")
