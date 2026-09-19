"""Macro plot invariants (Phase 11 Part 3, decision 0041).

Fast tests read the committed catalogue; the slower checks share one province
survey while re-solving the plot and checking navigable water. The solve proves
the committed positions are what the solver produces — the determinism
standard (6) applied to the plot.
"""

from __future__ import annotations

import json
import math

import numpy as np
import pytest
from .ladder import requires_delivered, requires_layer, requires_stage

from . import catalogue, macro_plot

ANCHORS = json.loads(macro_plot.REPO_ROOT.joinpath("world/sources/anchors/settlement-anchors.json").read_text())

ACCEPTED_HOMELESS_IDS = {
    r["id"] for r in json.loads(macro_plot.HOMELESS_ACCEPTED.read_text())["records"]
}


def _live():
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            if rec.get("status") not in {"cut", "deferred"}:
                yield rf.region, rec


def test_every_live_record_is_plotted_with_a_why():
    live = {rec["id"]: rec for _z, rec in _live()}
    missing = [rid for rid, rec in live.items()
               if rid not in ACCEPTED_HOMELESS_IDS
               and (rec.get("workflow") not in {"plotted", "authored", "frozen"}
                    or "position" not in rec or not rec.get("whySiteWon"))]
    assert not missing, f"unplotted live records: {missing[:10]} (+{max(0, len(missing) - 10)})"
    for rid in ACCEPTED_HOMELESS_IDS:
        rec = live.get(rid)
        assert rec is not None, rid
        assert "position" not in rec and rec.get("workflow") == "derived", rid


def test_deferred_and_cut_records_carry_no_position():
    stray = [rec["id"] for rf in catalogue.load_region_files() for rec in rf.places
             if rec.get("status") in {"cut", "deferred"} and "position" in rec]
    assert not stray


def test_settlement_anchors_keep_their_owner_approved_positions():
    """The owner's gate/centre rule (2026-09-18, macro_plot.assign step 1).

    A city that carries a `cityLayout` puts its RECORD on the solved centre
    and its GATE on the main road at the anchor pixel, so the anchor's u,v is
    a tolerance on the gate, not an exact match on the dot. A city without a
    layout block still sits exactly where the anchor says."""
    by_slug = {a["id"]: a for a in ANCHORS["anchors"]}
    seen = set()
    survey = None
    for _z, rec in _live():
        slug = rec["id"].rsplit(".", 1)[-1]
        if rec["importanceTier"] == 0 and slug in by_slug:
            a = by_slug[slug]
            layout = rec.get("cityLayout") or {}
            centre, gate = layout.get("centre"), layout.get("gate")
            if centre and gate:
                x, z = rec["positionM"]
                assert abs(x - centre[0]) < 1e-3 and abs(z - centre[1]) < 1e-3, \
                    f"{rec['id']}: the dot is not the cityLayout centre"
                if survey is None:
                    survey = macro_plot.shared_survey()
                gu, gv = survey.m_to_uv(float(gate[0]), float(gate[1]))
                tol = float(a["toleranceUV"])
                assert abs(gu - a["u"]) <= tol and abs(gv - a["v"]) <= tol, \
                    f"{rec['id']}: the gate is outside the anchor's toleranceUV"
            else:
                assert abs(rec["position"]["u"] - a["u"]) < 1e-6 \
                    and abs(rec["position"]["v"] - a["v"]) < 1e-6, rec["id"]
            seen.add(slug)
    assert seen == set(by_slug), f"anchors without a tier-0 catalogue record: {set(by_slug) - seen}"


def test_positions_are_inside_the_province_and_in_the_report():
    rep = json.loads(macro_plot.REPORT_JSON.read_text())
    assert rep["schemaVersion"] == macro_plot.SCHEMA_VERSION
    n = 0
    for _z, rec in _live():
        if rec["id"] in ACCEPTED_HOMELESS_IDS:
            assert "position" not in rec, rec["id"]
            continue
        u, v = rec["position"]["u"], rec["position"]["v"]
        assert 0.0 <= u <= 1.0 and 0.0 <= v <= 1.0, rec["id"]
        n += 1
    assert rep["demand"]["plotted"] == n
    # the batch is resolved or recorded as cut/deferred — except the records
    # the owner has ACCEPTED as unsited, which is exactly this register
    assert rep["demand"]["homelessUnresolved"] == len(ACCEPTED_HOMELESS_IDS), \
        "the homeless batch must be resolved, recorded as cut/deferred, or accepted"


def test_no_two_live_places_share_ground():
    """Two dots closer than the immutable collision floor is a solver bug.

    The floor a pair must ACTUALLY clear is the sum of their typed
    `footprintRadiusM` (2026-09-09); that is asserted on the solver in
    `test_type_siting`. This one is the absolute floor, and it holds over the
    shipped catalogue whether or not the re-plot has run yet.
    """
    pts = [(rec["id"], rec["positionM"]) for _z, rec in _live()
           if rec["id"] not in ACCEPTED_HOMELESS_IDS]
    for rid in ACCEPTED_HOMELESS_IDS:      # they hold no ground because they have none
        rec = next(r for _z, r in _live() if r["id"] == rid)
        assert "positionM" not in rec, rid
    floor = macro_plot.COLLISION_MIN_M - 1e-6
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            d = math.hypot(pts[i][1][0] - pts[j][1][0], pts[i][1][1] - pts[j][1][1])
            assert d >= floor, f"{pts[i][0]} and {pts[j][0]} are {d:.0f} m apart"


def test_places_stay_within_spill_distance_of_their_zone():
    rep = json.loads(macro_plot.REPORT_JSON.read_text())
    accepted_by_zone: dict[str, int] = {}
    for zone, rec in _live():
        if rec["id"] in ACCEPTED_HOMELESS_IDS:
            accepted_by_zone[zone] = accepted_by_zone.get(zone, 0) + 1
    for zone, z in rep["byZone"].items():
        assert z["plotted"] == z["live"] - accepted_by_zone.get(zone, 0), zone


@requires_delivered("16g")
def test_the_solve_keeps_every_committed_cell(survey):
    """A normal run must prove every committed cell remains valid and stable.

    The owner-approved full re-plot has removed the temporary water-rescue
    exemptions, so any invalid committed site is now a hard failure.
    Slow; shares the process-wide province survey with the water-role gate."""
    _d, _f, _sc, _fr, result, unresolved, resite, pinned, _cr = macro_plot.solve(survey)
    # A record on the accepted-homeless register is accepted as homeless: the
    # solve reporting it unresolved is the register doing its job, not a
    # regression. Same loader as the other tests on this file.
    unresolved = [h for h in unresolved if h.get("id") not in ACCEPTED_HOMELESS_IDS]
    resite = [h for h in resite if h.get("id") not in ACCEPTED_HOMELESS_IDS]
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
    Slow: loads the survey.

    A city (M5) whose harbour is DECLARED in `harbour-stations.json` is judged
    at that harbour's berth, not at the city dot: decision 0078 item 9 (owner
    2026-09-18, "connectedness over depth") makes the city's boat access the
    station it boards from. A shortfall at a declared berth is a warning line,
    not an assertion; a declared berth on dry ground (0 m) still fails, because
    that is a landing no hull can reach at all.
    """
    bad = macro_plot.navigable_violations(survey)
    harboured = _harbour_berths(survey)
    hard, warned = [], []
    for v in bad:
        berth = harboured.get(v["id"])
        if berth is None:
            hard.append(v)
        elif berth["depthM"] <= 0.0:
            hard.append(dict(v, depthM=berth["depthM"], berth=berth["stationId"]))
        else:
            warned.append(dict(v, depthM=berth["depthM"], berth=berth["stationId"]))
    for v in warned:
        print(f"warn: 97 A8/G5 {v['id']}: the city dot is shallow, but its declared "
              f"harbour berth {v['berth']} carries {v['depthM']} m against the "
              f"{v['hullClass']} need of {v['needM']} m (0078 item 9: connectedness "
              f"over depth)")
    assert not hard, (
        "97 A8/G5 — navigable roles on water too shallow for their hull class: "
        + "; ".join(f"{v['id']} ({v['hullClass']}: {v['depthM']} m < {v['needM']} m)"
                    for v in hard)
    )


def _harbour_berths(survey) -> dict[str, dict]:
    """`{cityPlaceId: {stationId, depthM}}` for every M5 record whose harbour is
    declared in `harbour-stations.json`.

    The berth depth is the hop's own `laneDepthM` for that station where the
    travel compile wrote one (it is only written on hops it re-resolved onto
    the lane network); otherwise it is the record depth within
    `macro_plot.NAVIGABLE_REACH_M` of the station's plotted point — the same
    measurement `navigable_violations` makes, taken at the berth instead of at
    the city dot.
    """
    from scipy import ndimage

    root = macro_plot.REPO_ROOT / "world" / "sources" / "routes"
    declared = json.loads((root / "harbour-stations.json").read_text())["harbours"]
    services = json.loads((root / "travel-services.json").read_text())
    resolved = services.get("harbourStations") or {}
    stations = {s["id"]: s for s in services.get("stations", [])}
    lane_depth: dict[str, float] = {}
    for svc in services.get("services", []):
        for hop in svc.get("hops", []):
            for sid, d in (hop.get("laneDepthM") or {}).items():
                if d is not None:
                    lane_depth[sid] = max(lane_depth.get(sid, 0.0), float(d))

    magnitude = {rec["id"]: (rec.get("classification") or {}).get("magnitude")
                 for _z, rec in _live()}
    rec_depth = survey.recorded_depth_m
    n = rec_depth.shape[0]
    px = survey.extent_m / n
    deep = ndimage.maximum_filter(
        rec_depth, size=int(round(2 * macro_plot.NAVIGABLE_REACH_M / px)) + 1)

    out: dict[str, dict] = {}
    for key in declared:
        row = resolved.get(key) or declared[key]
        sid = row.get("stationId")
        station = stations.get(sid) if sid else None
        if station is None:
            continue
        city = station.get("placeId") or row.get("placeId")
        if city is None or magnitude.get(city) != "M5":
            continue
        if sid in lane_depth:
            depth = lane_depth[sid]
        else:
            pos = station.get("positionM")
            if not isinstance(pos, list) or len(pos) != 2:
                continue
            r = min(n - 1, max(0, int(pos[1] / px)))
            c = min(n - 1, max(0, int(pos[0] / px)))
            depth = float(deep[r, c])
        out[city] = {"stationId": sid, "depthM": round(depth, 2)}
    return out


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
        def __init__(self, reaches, entities):
            self._reaches = reaches
            self.entities = [{"id": eid} for eid in entities]

        def reach(self, entity_id):
            return self._reaches.get(entity_id)

    def __init__(self, nearest: dict[tuple[float, float], dict],
                 reaches: dict[str, dict] | None = None,
                 entities: dict[str, list[tuple[int, int]]] | None = None):
        import numpy as np
        self._nearest = nearest
        # which CELLS each entity occupies: the `nearWater` tie measures the
        # distance to the named entity's own water, not to the nearest water
        entities = entities or {}
        self.water = self._Graph(reaches or {}, entities)
        self.extent_m = 10000.0
        self.grid_n = 100
        self.grid_px_m = 100.0
        self.height_grid = None
        self.water_depth_m = np.zeros((100, 100), dtype="float32")
        self.danger = np.full((100, 100), 2, dtype="int16")
        self.region_grid = np.zeros((100, 100), dtype="int16")
        self._entity_label_grid = np.zeros((100, 100), dtype="int32")
        for i, cells in enumerate(entities.values()):
            for row, col in cells:
                self._entity_label_grid[row, col] = i + 1

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
                 "reach.y1": {"river": "river.y"}},
        # cells are 100 m: x1 under (1000, 1000), y1 under (2000, 2000),
        # x2 600 m east of (3000, 3000)
        entities={"reach.x1": [(10, 10)], "reach.y1": [(20, 20)], "reach.x2": [(30, 36)]})


def test_near_water_never_takes_the_wrong_river_however_good_the_ground():
    """A record tied to river X is refused river Y's bank: X is 1 km away
    there, and the tie is a distance to the NAMED river's own water (ruling
    2026-09-19). Water nearer than the named entity is simply irrelevant."""
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
    s = WaterStub(nearest={(1000.0, 1000.0): {"entityId": "body.lake", "distanceM": 12.0}},
                  entities={"body.lake": [(10, 10)]})
    c = _water_candidate("c", 1000.0, 1000.0)
    assert macro_plot.near_water_ok(_water_demand(near_water=("body.lake", 50.0)), c, s)
    assert not macro_plot.near_water_ok(_water_demand(near_water=("body.other", 50.0)), c, s)


def test_tie_to_a_body_absent_from_the_bundle_reads_the_graph_redirect(monkeypatch):
    """A graph body the compile merged away (`realisedBy`) still resolves: the
    graph is the water record (0065/0066), so the tie follows the redirect
    rather than yielding an empty mask. `body.1290-3508`, the Blackrose lake,
    is the live instance."""
    s = WaterStub(nearest={(1000.0, 1000.0): {"entityId": "body.kept", "distanceM": 12.0}},
                  entities={"body.kept": [(10, 10)]})
    c = _water_candidate("c", 1000.0, 1000.0)
    d = _water_demand(near_water=("body.merged", 50.0))
    assert not macro_plot.near_water_ok(d, c, s)          # no redirect yet
    monkeypatch.setattr(macro_plot, "_graph_realised_by",
                        lambda: {"body.merged": "body.kept"})
    s._entity_distance_cache = {}
    assert macro_plot._tie_entity_labels(s, "body.merged") == {1}
    assert macro_plot.near_water_ok(d, c, s)


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


def test_route_reference_ids_resolve_registry_routes_and_lanes(tmp_path):
    """`danglingRelations` resolved place ids only, so every road/track/lane
    reference was reported dangling. A registry id, a registry alias and a
    published lane id all resolve; a made-up id does not."""
    reg = tmp_path / "registry.json"
    reg.write_text(json.dumps({"schemaVersion": 1, "routes": [
        {"id": "route.road.gideon-soulrest", "aliases": ["road:gideon-soulrest"]}]}))
    prov = tmp_path / "province"
    prov.mkdir()
    (prov / "waterways.json").write_text(json.dumps(
        {"lanes": [{"id": "route.boat.lilmoth-archon"}]}))
    ids = macro_plot.route_reference_ids(reg, prov)
    assert "route.road.gideon-soulrest" in ids
    assert "road:gideon-soulrest" in ids
    assert "route.boat.lilmoth-archon" in ids
    assert "route.road.nowhere-at-all" not in ids


def test_route_reference_ids_cover_the_committed_registry():
    """The real registry: a committed `route.road.*` id resolves, a made-up
    one does not."""
    ids = macro_plot.route_reference_ids()
    registry = json.loads(macro_plot.ROUTE_REGISTRY_PATH.read_text())
    real = next(r["id"] for r in registry["routes"] if r["id"].startswith("route.road."))
    assert real in ids
    assert "route.road.made-up-by-this-test" not in ids


# --------------------------------------------------------------------------
# local candidates for a typed tie (16g review, 2026-09-19)
# --------------------------------------------------------------------------
def _tie_demand(rid: str, zone: str, **kw) -> macro_plot.Demand:
    """A synthetic demand carrying nothing but the typed tie under test."""
    fields = dict(id=rid, zone=zone, tier=3, layer="fine-tempo", magnitude=None,
                  cls="wonder", type="shrine-wayside", danger=2,
                  landforms=["any-firm-ground"], landforms_from_recipe=True,
                  regions=set(), parents=[], hints={}, record={})
    fields.update(kw)
    return macro_plot.Demand(**fields)


def _base_pool(s):
    return (macro_plot.load_scour(s)
            + macro_plot.free_ground(s, macro_plot.DEFAULT_SEED)
            + macro_plot.roadside_ground(s, macro_plot.DEFAULT_SEED))


def _prepared(s, cands):
    macro_plot.attach_zone_distances(s, cands)
    macro_plot.attach_water_depth(s, cands)
    macro_plot.attach_anchor_ids(s, cands)
    return cands


@requires_delivered("16g")
def test_a_typed_near_point_is_sited_where_the_province_lattice_has_nothing(survey):
    """`sitingPrefs.nearPoint` names a domain tens of metres across; the
    province-wide supply is a 140 m lattice plus the scour sites, so a tie this
    tight can have no candidate at all. The demand brings its own (fails on the
    base pool alone, which is what left 30 live records homeless in 16g)."""
    s = survey
    base = _prepared(s, _base_pool(s))
    xs = np.array([c.x for c in base])
    zs = np.array([c.z for c in base])
    point = None
    step = 8
    # the homeless batch widens a nearPoint by NEAR_POINT_RELAX, so the tie is
    # only genuinely unreachable when the lattice is outside the RELAXED radius
    clear_m = 60.0 * macro_plot.NEAR_POINT_RELAX
    for row in range(step, s.grid_n - step, step):
        for col in range(step, s.grid_n - step, step):
            if macro_plot._classify_free(s, row, col) != "any-firm-ground":
                continue
            x = (col + 0.5) * s.grid_px_m
            z = (row + 0.5) * s.grid_px_m
            if float(np.min(np.hypot(xs - x, zs - z))) <= clear_m:
                continue
            zone = s.culture_names.get(int(s.culture[row, col]))
            if zone:
                point = (x, z, zone)
                break
        if point:
            break
    assert point, "no firm-ground cell in the province is that far from the lattice"
    x, z, zone = point
    d = _tie_demand("place.test.near-point", zone, near_point=(x, z, 60.0))

    _r, homeless = macro_plot.assign([d], base, s, s.anchor_points_m)
    assert [h["id"] for h in homeless] == [d.id], "the base pool already reaches this tie"

    local = macro_plot.local_tie_candidates(s, [d])
    assert local, "no local candidates were generated for the typed nearPoint"
    assert all(c.for_demand == d.id and math.hypot(c.x - x, c.z - z) <= 60.0 for c in local)
    result, homeless = macro_plot.assign([d], base + _prepared(s, local), s, s.anchor_points_m)
    assert not homeless, "the record is still homeless with its own local candidates"
    c = result[d.id]["candidate"]
    assert math.hypot(c.x - x, c.z - z) <= 60.0


@requires_delivered("16g")
def test_a_typed_min_depth_is_sited_on_water_that_records_that_depth(survey):
    """`sitingPrefs.minDepthM` is read off the RECORD depth grid (0066). The
    submerged lattice is 60 m and carries no depth guarantee, so a 5 m tie can
    find nothing; the demand's own water candidates are cells of its named body
    that record the depth."""
    s = survey
    rec_depth = s.recorded_depth_m
    deep = np.argwhere(rec_depth >= 5.0)
    assert len(deep), "the province records no water 5 m deep"
    point = None
    for row, col in deep[:: max(1, len(deep) // 200)]:
        x = (int(col) + 0.5) * s.grid_px_m
        z = (int(row) + 0.5) * s.grid_px_m
        if macro_plot._point_depth_m(s, x, z) < macro_plot.SUBMERGED_MIN_DEPTH_M:
            continue
        zone = s.culture_names.get(int(s.culture[int(row), int(col)]))
        near = s.nearest_water_entity(x, z)
        if zone and near and near.get("entityId"):
            point = (x, z, zone, near["entityId"])
            break
    assert point, "no 5 m cell is also measurably submerged inside a culture zone"
    x, z, zone, eid = point
    d = _tie_demand("place.test.min-depth", zone, hints={"submerged": True},
                    min_depth_m=5.0, near_water=(eid, 60.0),
                    record={"positionM": [x, z]})

    base = _prepared(s, _base_pool(s) + macro_plot.free_submerged(s, macro_plot.DEFAULT_SEED, {zone}))
    _r, homeless = macro_plot.assign([d], base, s, s.anchor_points_m)

    local = macro_plot.local_tie_candidates(s, [d])
    assert local, "no local water candidates were generated for the typed minDepthM"
    for c in local:
        row, col = s.grid_px(c.x, c.z)
        assert float(rec_depth[row, col]) >= 5.0 and c.landform == "open-water"
    result, homeless2 = macro_plot.assign([d], base + _prepared(s, local), s, s.anchor_points_m)
    assert not homeless2, "the record is still homeless with its own water candidates"
    c = result[d.id]["candidate"]
    row, col = s.grid_px(c.x, c.z)
    assert float(rec_depth[row, col]) >= 5.0


def test_accepted_homeless_register_replaces_the_raise_and_keeps_no_dot(tmp_path):
    """A live record the seeded solve cannot site raises — unless the owner has
    accepted it in `plot-homeless-accepted.json`, and then it still ships with
    no position and `workflow: derived` (16g round D, 2026-09-19)."""
    from pathlib import Path
    reg = tmp_path / "plot-homeless-accepted.json"
    unresolved = [{"id": "place.test.unsitable"}]

    assert macro_plot.accepted_homeless(reg) == {}          # no register yet
    assert macro_plot.blocking_homeless(unresolved, {}) == unresolved

    reg.write_text(json.dumps({"schemaVersion": 1, "records": [
        {"id": "place.test.unsitable", "reason": "tie contradicts the frozen ground",
         "since": "2026-09-19"}]}))
    accepted = macro_plot.accepted_homeless(reg)
    assert accepted == {"place.test.unsitable": "tie contradicts the frozen ground"}
    assert macro_plot.blocking_homeless(unresolved, accepted) == []

    # accepted or not, the record keeps NO dot: `apply_to_records` sees no result
    rec = {"id": "place.test.unsitable", "workflow": "plotted",
           "position": {"u": 0.5, "v": 0.5}, "positionM": [10.0, 10.0],
           "plotFacts": {"landform": "stale"}}
    rf = catalogue.RegionFile(path=Path("x.json"), region="test", seed="t", places=[rec])
    d = _water_demand(rid="place.test.unsitable")
    macro_plot.apply_to_records({"test": rf}, [d], {}, None)
    assert "position" not in rec and "positionM" not in rec and "plotFacts" not in rec
    assert rec["workflow"] == "derived"


def test_the_accepted_register_ships_the_schema_the_solver_reads():
    doc = json.loads(macro_plot.HOMELESS_ACCEPTED.read_text())
    assert doc["schemaVersion"] == 1
    for r in doc["records"]:
        assert set(r) == {"id", "reason", "since"} and r["reason"] and r["since"]


def test_a_kept_seeded_record_with_a_cleared_footprint_gets_one():
    """A remedy that clears the footprint and re-pins the same cell leaves the
    record SEEDED, so the solve never rewrites it: the keep path fills the
    missing footprint itself (16g, 2026-09-19)."""
    from pathlib import Path
    src = next(r for rf in catalogue.load_region_files() for r in rf.places
               if r.get("footprintSource") == "band")
    rec = dict(src, footprintRadiusM=None, footprintSource=None)
    rf = catalogue.RegionFile(path=Path("x.json"), region="test", seed="t", places=[rec])
    d = _water_demand(rid=rec["id"])
    macro_plot.apply_to_records({"test": rf}, [d], {rec["id"]: {"seeded": True}}, None)
    assert rec["footprintRadiusM"] == src["footprintRadiusM"]
    assert rec["footprintSource"] == "band"
    assert rec["position"] == src["position"]       # nothing else moved


def test_refresh_footprints_fills_only_the_missing_ones():
    assert macro_plot.refresh_footprints(write=False) == []
