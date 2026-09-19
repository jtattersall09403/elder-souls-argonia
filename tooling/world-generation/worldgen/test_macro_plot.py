"""Macro plot invariants (Phase 11 Part 3, decision 0041).

Fast tests read the committed catalogue; the slower checks share one province
survey while re-solving the plot and checking navigable water. The solve proves
the committed positions are what the solver produces — the determinism
standard (6) applied to the plot.
"""

from __future__ import annotations

import json
import math

import pytest
from .ladder import requires_delivered, requires_layer, requires_stage

from . import catalogue, macro_plot

ANCHORS = json.loads(macro_plot.REPO_ROOT.joinpath("world/sources/anchors/settlement-anchors.json").read_text())


def _live():
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            if rec.get("status") not in {"cut", "deferred"}:
                yield rf.region, rec


def test_every_live_record_is_plotted_with_a_why():
    missing = [rec["id"] for _z, rec in _live()
               if rec.get("workflow") not in {"plotted", "authored", "frozen"}
               or "position" not in rec or not rec.get("whySiteWon")]
    assert not missing, f"unplotted live records: {missing[:10]} (+{max(0, len(missing) - 10)})"


def test_deferred_and_cut_records_carry_no_position():
    stray = [rec["id"] for rf in catalogue.load_region_files() for rec in rf.places
             if rec.get("status") in {"cut", "deferred"} and "position" in rec]
    assert not stray


def test_settlement_anchors_keep_their_owner_approved_positions():
    by_slug = {a["id"]: a for a in ANCHORS["anchors"]}
    seen = set()
    for _z, rec in _live():
        slug = rec["id"].rsplit(".", 1)[-1]
        if rec["importanceTier"] == 0 and slug in by_slug:
            a = by_slug[slug]
            assert abs(rec["position"]["u"] - a["u"]) < 1e-6 and abs(rec["position"]["v"] - a["v"]) < 1e-6, rec["id"]
            seen.add(slug)
    assert seen == set(by_slug), f"anchors without a tier-0 catalogue record: {set(by_slug) - seen}"


def test_positions_are_inside_the_province_and_in_the_report():
    rep = json.loads(macro_plot.REPORT_JSON.read_text())
    assert rep["schemaVersion"] == macro_plot.SCHEMA_VERSION
    n = 0
    for _z, rec in _live():
        u, v = rec["position"]["u"], rec["position"]["v"]
        assert 0.0 <= u <= 1.0 and 0.0 <= v <= 1.0, rec["id"]
        n += 1
    assert rep["demand"]["plotted"] == n
    assert rep["demand"]["homelessUnresolved"] == 0, "the homeless batch must be resolved or recorded as cut/deferred"


def test_no_two_live_places_share_ground():
    """Two dots closer than the immutable collision floor is a solver bug.

    The floor a pair must ACTUALLY clear is the sum of their typed
    `footprintRadiusM` (2026-09-09); that is asserted on the solver in
    `test_type_siting`. This one is the absolute floor, and it holds over the
    shipped catalogue whether or not the re-plot has run yet.
    """
    pts = [(rec["id"], rec["positionM"]) for _z, rec in _live()]
    floor = macro_plot.COLLISION_MIN_M - 1e-6
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            d = math.hypot(pts[i][1][0] - pts[j][1][0], pts[i][1][1] - pts[j][1][1])
            assert d >= floor, f"{pts[i][0]} and {pts[j][0]} are {d:.0f} m apart"


def test_places_stay_within_spill_distance_of_their_zone():
    rep = json.loads(macro_plot.REPORT_JSON.read_text())
    for zone, z in rep["byZone"].items():
        assert z["plotted"] == z["live"], zone


@requires_delivered("16g")
def test_the_solve_keeps_every_committed_cell(survey):
    """A normal run must prove every committed cell remains valid and stable.

    The owner-approved full re-plot has removed the temporary water-rescue
    exemptions, so any invalid committed site is now a hard failure.
    Slow; shares the process-wide province survey with the water-role gate."""
    _d, _f, _sc, _fr, result, unresolved, resite, pinned, _cr = macro_plot.solve(survey)
    assert not unresolved
    assert not resite, (
        "records the current fields invalidate. Do NOT re-run the full plot to clear this: "
        "the committed spacing (580/580, nearest-neighbour p5 70 m, median 133 m, "
        "Clark-Evans 1.124) is owner-approved and re-solving against changed rasters "
        "destroys it. Instead diagnose the ONE named record: measure the gate it fails "
        "(sightline: ProvinceSurvey.sightline_clearance; water: the compiled depth at the "
        "dot) and decide whether the FIELD is wrong (fix the raster or the compiler), the "
        "GATE is wrong (measuring below its own resolution), or the RECORD's prose is wrong "
        "(re-author the claim). Moving a dot is the owner's call, via pin_overrides. "
        + "; ".join(f"{h['id']} ({h['reason']})" for h in resite))
    assert not pinned
    committed = {rec["id"]: rec["positionM"] for _z, rec in _live()}
    for did, r in result.items():
        c = r["candidate"]
        assert committed[did] == [round(c.x, 1), round(c.z, 1)], did


def test_the_sightline_gate_fails_on_real_relief_and_not_on_sampler_noise(survey):
    """Both directions of the sightline gate, on synthetic ground.

    The tolerance is derived from the local 3x3 relief so the verdict is not
    decided by the 5.48 m sampler's own quantisation — but a tolerance is only
    honest if the gate can still fail. A gentle 50 m hill (local spread ~0.4 m)
    must block; a 0.2 m graze in ground whose own cell spans 5 m must not.
    """
    import numpy as np
    ax, az, bx, bz = 4000.0, 4000.0, 4900.0, 4000.0
    base = survey.height_view
    row, col = survey.grid_px(0.5 * (ax + bx), az)
    try:
        g = np.zeros_like(base)
        rr, cc = np.ogrid[:g.shape[0], :g.shape[1]]
        g[:] = np.maximum(0.0, 50.0 - 0.6 * np.hypot(rr - row, cc - col))
        survey.__dict__["height_view"] = g
        hill = survey.sightline_clearance(ax, az, bx, bz, eye_a=1.7, eye_b=8.0)
        assert not hill["clear"], hill
        assert hill["clearanceM"] < -40.0 and hill["toleranceM"] < 1.0, hill

        g = np.zeros_like(base)
        g[row - 1:row + 2, col - 1:col + 2] = [[0.0, 5.0, 0.0],
                                               [5.0, 5.05, 5.0],
                                               [0.0, 5.0, 0.0]]
        survey.__dict__["height_view"] = g
        graze = survey.sightline_clearance(ax, az, bx, bz, eye_a=1.7, eye_b=8.0)
        assert graze["clear"], graze
        assert -1.0 < graze["clearanceM"] < 0.0 and graze["toleranceM"] > 2.0, graze

        # ...and a blockage of twice the tolerance in that same broken ground
        # is still a break: the tolerance forgives noise, never relief.
        g[row, col] = 12.0
        survey.__dict__["height_view"] = g
        real = survey.sightline_clearance(ax, az, bx, bz, eye_a=1.7, eye_b=8.0)
        assert not real["clear"], real
    finally:
        survey.__dict__["height_view"] = base


@requires_delivered("16g")
def test_navigable_roles_sit_on_navigable_water(survey):
    """97 A8 / G5: a record whose prose claims navigable water (`navigable`
    hint) must plot where the published depth within 150 m clears its hull
    class. There are no exemptions after the owner-approved full re-plot.
    Slow: loads the survey."""
    bad = macro_plot.navigable_violations(survey)
    assert not bad, (
        "97 A8/G5 — navigable roles on water too shallow for their hull class: "
        + "; ".join(f"{v['id']} ({v['hullClass']}: {v['depthM']} m < {v['needM']} m)" for v in bad)
    )


# --------------------------------------------------------------------------- #
# the two typed water ties (16g): `sitingPrefs.nearWater` / `minDepthM`
#
# Prose ties ("on the warm pools of central Shadowfen", "a laden wreck") were
# never read by the solver, so the from-scratch re-plot put a hatchery on the
# sea coast and wrecks on 0.0 m ground. These gates are HARD and are identity:
# no relaxation stage weakens them, which is what the `relaxed=True` calls
# below assert.
# --------------------------------------------------------------------------- #
class WaterStub:
    """Minimum of the ProvinceSurvey surface the two water gates touch:
    which entity is nearest a point, how far, and which river a reach is on."""

    class _Graph:
        def __init__(self, reaches):
            self._reaches = reaches

        def reach(self, entity_id):
            return self._reaches.get(entity_id)

    def __init__(self, nearest: dict[tuple[float, float], dict],
                 reaches: dict[str, dict] | None = None):
        import numpy as np
        self._nearest = nearest
        self.water = self._Graph(reaches or {})
        self.extent_m = 10000.0
        self.height_grid = None
        self.water_depth_m = np.zeros((100, 100), dtype="float32")
        self.danger = np.full((100, 100), 2, dtype="int16")
        self.region_grid = np.zeros((100, 100), dtype="int16")

    def grid_px(self, x, z):
        return int(z / 100.0), int(x / 100.0)

    def nearest_water_entity(self, x, z):
        return self._nearest.get((x, z))

    def line_of_sight(self, ax, az, bx, bz, eye_a=1.7, eye_b=8.0):
        return True


def _water_demand(rid="place.test.hatchery", **kw) -> macro_plot.Demand:
    return macro_plot.Demand(
        id=rid, zone="hist-heartland", tier=2, layer="fine-tempo", magnitude=None,
        cls="camp", type="camp", danger=2, landforms=["any-firm-ground"],
        landforms_from_recipe=False, regions=set(), parents=[], **kw)


def _water_candidate(cid, x, z, navigable_depth_m=0.0, depth_m=0.0) -> macro_plot.Candidate:
    return macro_plot.Candidate(
        id=cid, kind="free", landform="any-firm-ground", x=x, z=z,
        region="firm lowland", danger=2, zone="hist-heartland", route_m=500.0,
        water_m=40.0, depth_m=depth_m, slope=0.0, prominence=0.0, visibility=0.0,
        concealment=0.0, water_relation=0.0, anchor_m=5000.0,
        navigable_depth_m=navigable_depth_m)


def _two_river_stub():
    return WaterStub(
        nearest={(1000.0, 1000.0): {"entityId": "reach.x1", "distanceM": 30.0},
                 (2000.0, 2000.0): {"entityId": "reach.y1", "distanceM": 5.0},
                 (3000.0, 3000.0): {"entityId": "reach.x2", "distanceM": 600.0}},
        reaches={"reach.x1": {"river": "river.x"}, "reach.x2": {"river": "river.x"},
                 "reach.y1": {"river": "river.y"}})


def test_near_water_never_takes_the_wrong_river_however_good_the_ground():
    """A record tied to river X is refused river Y's bank even where the rest
    of the score is better (Y's dot is at the water's edge, X's is 30 m off)."""
    s = _two_river_stub()
    d = _water_demand(near_water=("river.x", 250.0))
    on_x = _water_candidate("c-x", 1000.0, 1000.0)
    on_y = _water_candidate("c-y", 2000.0, 2000.0)
    assert macro_plot.near_water_ok(d, on_x, s)
    assert not macro_plot.near_water_ok(d, on_y, s)
    for relaxed in (False, True):
        assert macro_plot.score_pair(d, on_y, {}, relaxed, s)[1] == {"near-water": -9.0}
        assert macro_plot.score_pair(d, on_x, {}, relaxed, s)[0] > -9.0


def test_near_water_max_m_binds():
    """The right river 600 m away is not "on" it."""
    s = _two_river_stub()
    far = _water_candidate("c-far", 3000.0, 3000.0)
    assert macro_plot.near_water_ok(_water_demand(near_water=("river.x", 1000.0)), far, s)
    assert not macro_plot.near_water_ok(_water_demand(near_water=("river.x", 250.0)), far, s)


def test_near_water_matches_a_body_or_a_reach_by_its_own_id():
    s = WaterStub(nearest={(1000.0, 1000.0): {"entityId": "body.lake", "distanceM": 12.0}})
    c = _water_candidate("c", 1000.0, 1000.0)
    assert macro_plot.near_water_ok(_water_demand(near_water=("body.lake", 50.0)), c, s)
    assert not macro_plot.near_water_ok(_water_demand(near_water=("body.other", 50.0)), c, s)


def test_min_depth_refuses_shallow_water_at_every_stage():
    """A 1.5 m record is never placed where the RECORD depth within 150 m is
    0.6 m; and a submerged record must MEASURE its depth at its own dot."""
    s = _two_river_stub()
    d = _water_demand(min_depth_m=1.5)
    shallow = _water_candidate("c-shallow", 1000.0, 1000.0, navigable_depth_m=0.6)
    deep = _water_candidate("c-deep", 1000.0, 1000.0, navigable_depth_m=2.0)
    assert not macro_plot.min_depth_ok(d, shallow)
    assert macro_plot.min_depth_ok(d, deep)
    for relaxed in (False, True):
        assert macro_plot.score_pair(d, shallow, {}, relaxed, s)[1] == {"min-depth": -9.0}
        assert macro_plot.score_pair(d, deep, {}, relaxed, s)[0] > -9.0
    sub = _water_demand(min_depth_m=1.5, hints={"submerged": True})
    assert not macro_plot.min_depth_ok(sub, deep)              # 0.0 m measured at the dot
    assert macro_plot.min_depth_ok(
        sub, _water_candidate("c-sunk", 1000.0, 1000.0, navigable_depth_m=2.0, depth_m=1.9))


def test_committed_invalid_reason_names_a_broken_water_tie():
    s = _two_river_stub()
    wrong = macro_plot.committed_invalid_reason(
        _water_demand(near_water=("river.x", 250.0)),
        _water_candidate("c-y", 2000.0, 2000.0), {}, s)
    assert wrong and "river.x" in wrong and "reach.y1" in wrong
    shallow = macro_plot.committed_invalid_reason(
        _water_demand(min_depth_m=1.5),
        _water_candidate("c-shallow", 1000.0, 1000.0, navigable_depth_m=0.6), {}, s)
    assert shallow and "0.6 m" in shallow and "1.5 m" in shallow
    assert macro_plot.committed_invalid_reason(
        _water_demand(near_water=("river.x", 250.0), min_depth_m=1.5),
        _water_candidate("c-x", 1000.0, 1000.0, navigable_depth_m=2.0), {}, s) is None


def test_typed_siting_violations_reports_both_water_gates():
    s = _two_river_stub()
    d1 = _water_demand("place.test.a", near_water=("river.x", 250.0))
    d2 = _water_demand("place.test.b", min_depth_m=1.5)
    result = {"place.test.a": {"candidate": _water_candidate("c-y", 2000.0, 2000.0)},
              "place.test.b": {"candidate": _water_candidate("c-shallow", 9000.0, 9000.0,
                                                             navigable_depth_m=0.6)}}
    gates = {(v["id"], v["gate"]) for v in macro_plot.typed_siting_violations([d1, d2], result, s)}
    assert ("place.test.a", "nearWater") in gates
    assert ("place.test.b", "minDepthM") in gates
    ok = {"place.test.a": {"candidate": _water_candidate("c-x", 1000.0, 1000.0)},
          "place.test.b": {"candidate": _water_candidate("c-deep", 9000.0, 9000.0,
                                                         navigable_depth_m=2.0)}}
    assert not [v for v in macro_plot.typed_siting_violations([d1, d2], ok, s)
                if v["gate"] in {"nearWater", "minDepthM"}]


def test_why_text_says_what_the_water_ties_bind_to():
    why = macro_plot.why_text(
        _water_demand(near_water=("river.x", 250.0), min_depth_m=1.5),
        _water_candidate("c", 1000.0, 1000.0), {}, None)
    assert "bound to river.x within 250 m" in why
    assert "needs 1.5 m of water" in why


def test_apply_to_records_writes_the_footprint_fields_it_must_carry():
    """`plot_remedies` clears position AND the footprint fields; a re-plotted
    record must get them back or the validator rejects it."""
    rf = catalogue.load_region_files()[0]
    src = next(r for r in rf.places if r.get("footprintSource") == "band")
    rec = {k: v for k, v in src.items()
           if k not in {"footprintRadiusM", "footprintSource", "position", "positionM"}}
    macro_plot.apply_footprint_fields(rec)
    assert rec["footprintRadiusM"] == src["footprintRadiusM"]
    assert rec["footprintSource"] == "band"
    poly = {"id": "place.x.y", "footprintSource": "polygon", "footprintPolygon": [[0, 0]],
            "classification": src["classification"]}
    macro_plot.apply_footprint_fields(poly)
    assert poly["footprintSource"] == "polygon" and "footprintRadiusM" not in poly
