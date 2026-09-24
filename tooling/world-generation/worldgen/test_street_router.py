"""Street router tests (owner ruling 2026-09-05: ways follow the ground)."""

import math

from . import street_router as sr

EXTENT_M = 1000.0
N = 100                     # 100 cells of 10 m over a 1000 m square
PX_M = EXTENT_M / N


class SurveyStub:
    """The little of ProvinceSurvey the router touches: heights, open water,
    the grid pitch and the province extent."""

    def __init__(self, height_fn=None, water_fn=None):
        self.extent_m = EXTENT_M
        self.grid_px_m = PX_M
        self.grid_n = N
        hf = height_fn or (lambda x, z: 0.0)
        wf = water_fn or (lambda x, z: False)
        self.height_grid = [[float(hf((c + 0.5) * PX_M, (r + 0.5) * PX_M)) for c in range(N)]
                            for r in range(N)]
        self.open_water = [[bool(wf((c + 0.5) * PX_M, (r + 0.5) * PX_M)) for c in range(N)]
                           for r in range(N)]

    def uv_to_m(self, u, v):
        return u * self.extent_m, v * self.extent_m

    def m_to_uv(self, x, z):
        return x / self.extent_m, z / self.extent_m


def uv(x, z):
    return [x / EXTENT_M, z / EXTENT_M]


def to_m(points):
    return [(p[0] * EXTENT_M, p[1] * EXTENT_M) for p in points]


def _densify(pts_m, step=1.0):
    """Sample a polyline every metre (simplification leaves long segments)."""
    out = [pts_m[0]]
    for a, b in zip(pts_m, pts_m[1:]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        out += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n)
                for i in range(1, n + 1)]
    return out


def _bp(way, **over):
    bp = {"boundary": [uv(100, 100), uv(400, 100), uv(400, 400), uv(100, 400)],
          "parcels": [], "routes": [way]}
    bp.update(over)
    return bp


# --------------------------------------------------------------------------- #
def test_straight_passes_the_via_polyline_through():
    way = {"id": "route.t.a", "kind": "road", "widthM": 4.0, "routing": "straight",
           "via": [uv(150, 150), uv(250, 150), uv(250, 300)]}
    pts = sr.route_way(way, _bp(way), SurveyStub())
    assert to_m(pts) == [(150, 150), (250, 150), (250, 300)]


def test_arc_is_smooth_and_passes_through_the_waypoints():
    via = [uv(150, 150), uv(250, 200), uv(350, 150)]
    way = {"id": "route.t.arc", "kind": "road", "widthM": 4.0, "routing": "arc", "via": via}
    pts_m = to_m(sr.route_way(way, _bp(way), SurveyStub()))
    for want in to_m(via):
        assert min(math.hypot(p[0] - want[0], p[1] - want[1]) for p in pts_m) < 0.7
    # smooth: no corner sharper than a gentle bend, and it actually curves
    assert len(pts_m) > len(via)
    angles = []
    for a, b, c in zip(pts_m, pts_m[1:], pts_m[2:]):
        v1 = (b[0] - a[0], b[1] - a[1])
        v2 = (c[0] - b[0], c[1] - b[1])
        n1 = math.hypot(*v1) or 1e-9
        n2 = math.hypot(*v2) or 1e-9
        cos = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))
        angles.append(math.degrees(math.acos(cos)))
    assert max(angles) < 60.0


def test_terrain_routing_goes_around_a_ridge():
    """A 25 m ridge across the straight line: the cheap way is round its end."""
    def height(x, z):
        on_ridge = 220.0 <= x <= 260.0 and z <= 300.0
        return 25.0 if on_ridge else 0.0

    way = {"id": "route.t.terrain", "kind": "footpath", "widthM": 2.0, "routing": "terrain",
           "via": [uv(150, 200), uv(350, 200)]}
    pts_m = _densify(to_m(sr.route_way(way, _bp(way), SurveyStub(height))))
    # the route crosses the ridge band only south of the ridge's end
    crossings = [p for p in pts_m if 220.0 <= p[0] <= 260.0]
    assert crossings, "the route must still get across the ridge band"
    assert max(p[1] for p in pts_m) > 300.0
    assert all(p[1] > 295.0 for p in crossings)


def test_a_parcel_in_the_way_is_avoided():
    parcel = {"id": "parcel.t.hall",
              "footprint": [uv(230, 180), uv(270, 180), uv(270, 220), uv(230, 220)]}
    way = {"id": "route.t.lane", "kind": "footpath", "widthM": 2.0, "routing": "terrain",
           "via": [uv(150, 200), uv(350, 200)]}
    bp = _bp(way, parcels=[parcel])
    pts_m = _densify(to_m(sr.route_way(way, bp, SurveyStub())))
    poly = to_m(parcel["footprint"])
    assert not any(sr._point_in_poly(x, z, poly) for x, z in pts_m)


def test_a_boardwalk_prefers_the_wet_line():
    """Water is what a boardwalk is for: it takes the channel, not the bank."""
    def water(x, z):
        return 190.0 <= z <= 210.0          # a wet band along the straight line

    def dry_detour_cost(pts):
        return sum(1 for _x, z in pts if not 190.0 <= z <= 210.0)

    via = [uv(150, 200), uv(350, 200)]
    wet_way = {"id": "boardwalk.t.spine", "kind": "boardwalk", "widthM": 3.0,
               "routing": "terrain", "via": via}
    road = {"id": "route.t.road", "kind": "road", "widthM": 4.0,
            "routing": "terrain", "via": via}
    survey = SurveyStub(water_fn=water)
    wet_pts = _densify(to_m(sr.route_way(wet_way, {"boundary": _bp(road)["boundary"], "parcels": [],
                                          "boardwalks": [wet_way]}, survey)))
    road_pts = _densify(to_m(sr.route_way(road, _bp(road), survey)))
    assert dry_detour_cost(wet_pts) == 0          # the boardwalk stays over water
    assert dry_detour_cost(road_pts) > 0          # the road leaves the water


def test_endsat_snaps_to_the_parcel_edge():
    parcel = {"id": "parcel.t.deck",
              "footprint": [uv(300, 180), uv(340, 180), uv(340, 220), uv(300, 220)]}
    way = {"id": "route.t.spur", "kind": "footpath", "widthM": 2.0, "routing": "straight",
           "via": [uv(150, 200), uv(360, 200)], "endsAt": ["parcel.t.deck"]}
    pts_m = to_m(sr.route_way(way, _bp(way, parcels=[parcel]), SurveyStub()))
    end = pts_m[-1]
    _q, d = sr._nearest_on_polyline(end, to_m(parcel["footprint"]), closed=True)
    assert d < 0.1                                  # on the footprint edge
    assert not sr._point_in_poly(end[0], end[1], to_m(parcel["footprint"]))


def test_routing_is_deterministic():
    def height(x, z):
        return 4.0 * math.sin(x / 37.0) + 3.0 * math.cos(z / 51.0)

    way = {"id": "route.t.det", "kind": "track", "widthM": 3.0, "routing": "terrain",
           "via": [uv(150, 150), uv(330, 320)]}
    bp = _bp(way)
    survey = SurveyStub(height)
    assert sr.route_way(way, bp, survey) == sr.route_way(way, bp, SurveyStub(height))


def test_route_cache_is_content_keyed_and_returns_fresh_points(monkeypatch):
    way = {"id": "route.t.cached", "kind": "track", "widthM": 3.0,
           "routing": "terrain", "via": [uv(150, 150), uv(180, 180)]}
    bp = {"boundary": [uv(140, 140), uv(190, 140), uv(190, 190), uv(140, 190)],
          "parcels": [], "routes": [way]}
    survey = SurveyStub()
    survey.routing_cache_token = "unchanged-v1"
    calls = 0
    original = sr._route_way_uncached

    def counted(*args, **kwargs):
        nonlocal calls
        calls += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(sr, "_route_way_uncached", counted)
    sr._ROUTE_CACHE.clear()
    first = sr.route_way(way, bp, survey)
    second = sr.route_way(way, bp, survey)
    assert calls == 1
    assert second == first
    assert second is not first
    assert all(a is not b for a, b in zip(first, second))

    # Mutating a returned result cannot poison the cache.
    first[0][0] = 0.99
    assert sr.route_way(way, bp, survey) == second
    assert calls == 1

    # Every routing input is represented by the full content key, and a
    # different survey identity cannot reuse results derived from this raster.
    way["via"][1] = uv(175, 180)
    sr.route_way(way, bp, survey)
    assert calls == 2
    sr.route_way(way, bp, SurveyStub())
    assert calls == 3


def test_mutable_survey_without_revision_never_reuses_a_cached_route(monkeypatch):
    way = {"id": "route.t.mutable", "kind": "track", "widthM": 3.0,
           "routing": "terrain", "via": [uv(150, 150), uv(180, 180)]}
    bp = _bp(way)
    survey = SurveyStub()
    calls = 0
    original = sr._route_way_uncached

    def counted(*args, **kwargs):
        nonlocal calls
        calls += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(sr, "_route_way_uncached", counted)
    sr._ROUTE_CACHE.clear()
    sr.route_way(way, bp, survey)
    survey.height_grid[15][15] += 100.0
    sr.route_way(way, bp, survey)
    assert calls == 2


def test_apply_then_check_is_clean():
    way = {"id": "route.t.apply", "kind": "footpath", "widthM": 2.0, "routing": "terrain",
           "via": [uv(150, 150), uv(300, 260)]}
    bp = _bp(way)
    survey = SurveyStub()
    assert sr.apply_to_blueprint(bp, survey) == []
    assert sr.check_blueprint(bp, survey) == []
    bp["routes"][0]["points"][1] = uv(200, 260)
    assert sr.check_blueprint(bp, survey)


def test_validator_rejects_hand_edited_points():
    """The schema check is the gate: derived points cannot be hand-edited."""
    from . import blueprint
    from .test_blueprint import _bp

    way = {"id": "route.reed-cut-camp.lane", "kind": "footpath", "widthM": 2.0,
           "routing": "straight", "why": "The lane from the landing to the huts.",
           "via": [[0.11, 0.11], [0.15, 0.12]],
           "points": [[0.11, 0.11], [0.15, 0.12]]}
    ok = blueprint.validate_blueprint(_bp(routes=[way]), None)
    assert not [e for e in ok if "derived route" in e]
    way = dict(way, points=[[0.11, 0.11], [0.16, 0.12]])
    bad = blueprint.validate_blueprint(_bp(routes=[way]), None)
    assert [e for e in bad if "derived route" in e and "--apply" in e]


# --------------------------------------------------------------------------- #
# fences and walls are routed too (owner ruling 2026-09-08)
# --------------------------------------------------------------------------- #
def _fence(**over):
    f = {"id": "fence.t.wall", "kind": "palisade", "class": "palisade", "widthM": 0.3,
         "routing": "terrain", "why": "The wall round the yards, on the ground.",
         "assetRef": "kit:none", "via": [uv(150, 150), uv(150, 300)]}
    f.update(over)
    return f


def _fence_bp(fence, **over):
    bp = {"boundary": [uv(100, 100), uv(400, 100), uv(400, 400), uv(100, 400)],
          "parcels": [], "routes": [], "fences": [fence]}
    bp.update(over)
    return bp


def test_a_routed_wall_follows_the_contour_instead_of_crossing_it():
    """A slope running east–west: the straight line up it crosses 15 m of fall,
    the routed line stays on its band."""
    def height(x, z):
        return 0.15 * (z - 150.0)          # ground falls to the south

    fence = _fence(via=[uv(150, 200), uv(300, 210)])
    survey = SurveyStub(height)
    pts_m = to_m(sr.route_way(fence, _fence_bp(fence), survey))
    hs = [height(x, z) for x, z in _densify(pts_m)]
    assert max(hs) - min(hs) < 1.6         # the straight line crosses 1.5 m of fall
    assert len(pts_m) > 2                  # ... by bending


def test_a_pole_wall_with_waterok_stands_in_the_shallows():
    """The lore drives poles: the wall takes the wet line, not the dry one."""
    def water(x, z):
        return x > 250.0

    fence = _fence(**{"class": "pole-wall", "waterOk": {"maxDepthM": 1.0},
                      "via": [uv(260, 150), uv(260, 300)]})
    survey = SurveyStub(water_fn=water)
    wet = to_m(sr.route_way(fence, _fence_bp(fence), survey))
    assert all(water(x, z) for x, z in _densify(wet))
    # the same wall without the licence keeps out of the water entirely
    dry_fence = _fence(via=[uv(260, 150), uv(260, 300)])
    dry = _densify(to_m(sr.route_way(dry_fence, _fence_bp(dry_fence), survey)))
    assert sum(1 for x, z in dry if water(x, z)) < 0.2 * len(dry)


def test_a_wall_avoids_a_parcel_and_crosses_a_way_only_at_its_declared_gap():
    from . import blueprint

    parcel = {"id": "parcel.t.hall", "footprint": [uv(190, 200), uv(230, 200),
                                                   uv(230, 240), uv(190, 240)]}
    way = {"id": "route.t.lane", "kind": "footpath", "widthM": 2.0, "routing": "straight",
           "why": "The lane through the gate.", "via": [uv(120, 220), uv(300, 220)],
           "points": [[120 / EXTENT_M, 220 / EXTENT_M], [300 / EXTENT_M, 220 / EXTENT_M]]}
    survey = SurveyStub()
    # routed, the wall goes round the hall by itself and crosses the lane once
    routed = _fence(via=[uv(210, 160), uv(210, 300)])
    bp = _fence_bp(routed, parcels=[parcel], routes=[way])
    sr.apply_to_blueprint(bp, survey)
    routed_fails = blueprint._fence_failures(bp, survey)
    assert not [f for f in routed_fails if "crosses the hull" in f]
    assert [f for f in routed_fails if "crosses the way" in f]

    # drawn as a ruled line, the same wall runs through the hall: HARD
    fence = _fence(routing="straight", via=[uv(210, 160), uv(210, 300)],
                   points=[uv(210, 160), uv(210, 300)])
    bp = _fence_bp(fence, parcels=[parcel], routes=[way])
    fails = blueprint._fence_failures(bp, survey)
    assert [f for f in fails if "crosses the hull" in f]
    assert [f for f in fails if "crosses the way" in f]
    # declared: the hall is designed contact, the lane is the gate
    bp["fences"][0]["gapAt"] = ["route.t.lane"]
    bp["fences"][0]["abuts"] = ["parcel.t.hall"]
    assert blueprint._fence_failures(bp, survey) == []


def test_a_wall_in_water_without_waterok_fails_and_too_deep_fails():
    from . import blueprint

    fence = _fence(routing="straight", via=[uv(260, 150), uv(260, 300)],
                   points=[uv(260, 150), uv(260, 300)])
    bp = _fence_bp(fence)
    survey = SurveyStub(water_fn=lambda x, z: x > 250.0)
    assert [f for f in blueprint._fence_failures(bp, survey) if "declares no waterOk" in f]
    fence["waterOk"] = {"maxDepthM": 1.0}       # stub depth is UNKNOWN_DEPTH_M
    assert blueprint._fence_failures(bp, survey) == []
    fence["waterOk"] = {"maxDepthM": 0.1}
    assert [f for f in blueprint._fence_failures(bp, survey) if "no pole is driven there" in f]


def test_a_long_unbent_run_across_falling_ground_warns():
    from . import blueprint

    fence = _fence(routing="straight", moduleM=2.0,
                   via=[uv(150, 150), uv(150, 250)],
                   points=[uv(150, 150), uv(150, 250)])
    bp = _fence_bp(fence)
    flat = SurveyStub()
    assert blueprint._fence_warnings(bp, flat) == []
    slope = SurveyStub(lambda x, z: 0.05 * z)
    assert [w for w in blueprint._fence_warnings(bp, slope) if "with no bend" in w]


def test_a_routed_wall_is_built_in_whole_modules():
    fence = _fence(moduleM=4.0, via=[uv(150, 150), uv(150, 290)])
    pts_m = to_m(sr.route_way(fence, _fence_bp(fence), SurveyStub()))
    for a, b in zip(pts_m, pts_m[1:]):
        run = math.hypot(b[0] - a[0], b[1] - a[1])
        assert abs(run / 4.0 - round(run / 4.0)) < 0.02


def test_a_straight_wall_keeps_its_surveyed_line():
    """`straight` is the surveyed line: no routing, no module quantising."""
    fence = _fence(routing="straight", moduleM=4.0, via=[uv(150, 150), uv(150, 293)])
    assert to_m(sr.route_way(fence, _fence_bp(fence), SurveyStub())) == [(150, 150), (150, 293)]


# --------------------------------------------------------------------------- #
# the whole-grid field build equals the per-cell rule it replaced (step C,
# 2026-09-23). `_scalar_mult` is the per-cell loop exactly as it stood before
# the field was vectorised: the oracle, frozen here so a later change to the
# vectorised build is measured against the rule, not against itself.
# --------------------------------------------------------------------------- #
import json
from pathlib import Path

import pytest

BLUEPRINTS = Path(__file__).resolve().parents[3] / "world" / "sources" / "blueprints"


def _scalar_mult(field, way, bp, survey):
    E = field.extent_m
    ends = set(way.get("endsAt") or [])
    parcels = []
    for p in bp.get("parcels") or []:
        fp = p.get("footprint")
        if not fp:
            continue
        poly = [(float(q[0]) * E, float(q[1]) * E) for q in fp]
        bx = [q[0] for q in poly]; bz = [q[1] for q in poly]
        if not field.is_fence:
            bx += [min(bx) - field.half_m, max(bx) + field.half_m]
            bz += [min(bz) - field.half_m, max(bz) + field.half_m]
        entry = sr.door_thresholds_m(bp, E).get(p.get("id"), []) if p.get("id") in ends else []
        pen = sr.PARCEL_PENALTY if entry or p.get("id") not in ends else sr.ENDS_PARCEL_PENALTY
        parcels.append((poly, pen, (min(bx), min(bz), max(bx), max(bz)), entry))
    out = [[1.0] * field.w for _ in range(field.h)]
    if field.is_fence:
        water_ok = way.get("waterOk") if isinstance(way.get("waterOk"), dict) else None
        max_depth = float(water_ok.get("maxDepthM", 0.0)) if water_ok else 0.0
        hug = bool(field.profile["hug"])
        hull = sr.built_hull(bp, E) if hug else []
        gaps = {g for g in (way.get("gapAt") or []) if isinstance(g, str)}
        crossings = []
        for key in ("routes", "canals", "boardwalks"):
            for w in bp.get(key) or []:
                if w.get("id") in gaps:
                    continue
                via = [(float(q[0]) * E, float(q[1]) * E) for q in (w.get("via") or [])]
                if len(via) < 2:
                    continue
                half = max(float(w.get("widthM") or 1.0) / 2.0, 0.5)
                nx = [q[0] for q in via]; nz = [q[1] for q in via]
                crossings.append((via, half, (min(nx) - half, min(nz) - half,
                                              max(nx) + half, max(nz) + half)))
        for r in range(field.h):
            for c in range(field.w):
                x, z = field.xz(r, c)
                m = 1.0
                wet = sr.sample_wet_season_water(survey, x, z)
                if water_ok:
                    if not wet:
                        m *= sr.FENCE_DRY_PENALTY_WET
                    elif sr.sample_wet_season_depth_m(survey, x, z) > max_depth:
                        m *= sr.FENCE_DEEP_PENALTY
                elif wet:
                    m *= sr.FENCE_WATER_PENALTY
                if hug and not wet and len(hull) >= 3:
                    inside = sr._point_in_poly(x, z, hull)
                    d = sr._dist_point_polyline((x, z), hull + [hull[0]])
                    if inside and d > sr.FENCE_HULL_BAND_M:
                        m *= sr.FENCE_INSIDE_PENALTY
                    elif not inside and d > sr.FENCE_HULL_BAND_M:
                        m *= sr.FENCE_OUTSIDE_PENALTY
                for poly, _pen, (bx0, bz0, bx1, bz1), _entry in parcels:
                    if bx0 <= x <= bx1 and bz0 <= z <= bz1 and sr._point_in_poly(x, z, poly):
                        m *= sr.FENCE_PARCEL_PENALTY
                        break
                for via, half, (nx0, nz0, nx1, nz1) in crossings:
                    if (nx0 <= x <= nx1 and nz0 <= z <= nz1
                            and sr._dist_point_polyline((x, z), via) <= half):
                        m *= sr.FENCE_WAY_PENALTY
                        break
                out[r][c] = m
        return out
    wet_way = field._is_wet_way(way)
    neighbours = []
    for key in sr.WAY_KEYS:
        if key == "fences" or not field._same_class(way, key, bp):
            continue
        for w in bp.get(key) or []:
            if w.get("id") == way.get("id"):
                continue
            via = [(float(q[0]) * E, float(q[1]) * E) for q in (w.get("via") or [])]
            if len(via) >= 2:
                nx = [q[0] for q in via]; nz = [q[1] for q in via]
                neighbours.append((via, (min(nx) - sr.NEIGHBOUR_M, min(nz) - sr.NEIGHBOUR_M,
                                         max(nx) + sr.NEIGHBOUR_M, max(nz) + sr.NEIGHBOUR_M)))
    for r in range(field.h):
        for c in range(field.w):
            x, z = field.xz(r, c)
            m = 1.0
            water = sr.sample_water(survey, x, z)
            if wet_way:
                if not water:
                    m *= sr.DRY_PENALTY_WET_WAY
            elif water:
                m *= sr.WATER_PENALTY_DRY_WAY
            for poly, pen, (bx0, bz0, bx1, bz1), entry in parcels:
                if bx0 <= x <= bx1 and bz0 <= z <= bz1 and (
                        sr._point_in_poly(x, z, poly)
                        or sr._dist_point_polyline((x, z), poly + [poly[0]]) <= field.half_m):
                    if any(math.hypot(x - dx, z - dz) <= sr.DOOR_CLEAR_M for dx, dz in entry):
                        pen = sr.ENDS_PARCEL_PENALTY
                    m *= pen
                    break
            for nb, (nx0, nz0, nx1, nz1) in neighbours:
                if (nx0 <= x <= nx1 and nz0 <= z <= nz1
                        and sr._dist_point_polyline((x, z), nb) <= sr.NEIGHBOUR_M):
                    m *= sr.NEIGHBOUR_PENALTY
                    break
            out[r][c] = m
    return out


def _scalar_heights(field, survey):
    return [[sr.sample_height_m(survey, *field.xz(r, c)) for c in range(field.w)]
            for r in range(field.h)]


def _assert_field_matches_rule(way, bp, survey):
    is_fence = sr._way_class(bp, way) == "fences"
    field = sr.LocalField(way, bp, survey, is_fence=is_fence)
    assert field.mult == _scalar_mult(field, way, bp, survey), way.get("id")
    assert field.height == _scalar_heights(field, survey), way.get("id")


def test_vectorised_field_equals_the_per_cell_rule_on_stub_ground():
    """Water, parcels (first hit wins), neighbours, and a wall with its hull
    band, shallows and gap, on a stub survey: every cell the same float."""
    wet = lambda x, z: 230 < x < 260 or (x - 300) ** 2 + (z - 200) ** 2 < 900
    survey = SurveyStub(height_fn=lambda x, z: 0.05 * x + 3.0 * math.sin(z / 20.0),
                        water_fn=wet)
    parcels = [
        {"id": "parcel.a", "footprint": [uv(180, 180), uv(210, 182), uv(205, 215), uv(178, 210)]},
        {"id": "parcel.b", "footprint": [uv(195, 195), uv(240, 195), uv(240, 240), uv(195, 240)]},
        {"id": "parcel.c", "footprint": [uv(300, 300), uv(330, 300), uv(315, 330)]},
    ]
    route = {"id": "route.t.a", "kind": "track", "widthM": 2.0, "routing": "terrain",
             "endsAt": ["parcel.a"], "via": [uv(150, 150), uv(350, 350)]}
    other = {"id": "route.t.b", "kind": "track", "widthM": 3.0, "routing": "terrain",
             "via": [uv(150, 350), uv(250, 250), uv(350, 150)]}
    walk = {"id": "boardwalk.t.a", "kind": "boardwalk", "widthM": 2.0, "routing": "terrain",
            "via": [uv(200, 120), uv(290, 210)]}
    bp = {"boundary": [uv(100, 100), uv(400, 100), uv(400, 400), uv(100, 400)],
          "parcels": parcels, "routes": [route, other], "boardwalks": [walk], "fences": []}
    for fence in (_fence(), _fence(id="fence.t.pole", **{"class": "pole-wall"},
                                   waterOk={"maxDepthM": 0.4}, gapAt=["route.t.b"])):
        bp["fences"] = [fence]
        _assert_field_matches_rule(fence, bp, survey)
    for way in (route, other, walk):
        _assert_field_matches_rule(way, bp, survey)


@pytest.mark.parametrize("name", ["place.fixture.proving-ground.json",
                                  "testdata/place.fixture.mire-landing.json"])
def test_vectorised_field_equals_the_per_cell_rule_on_the_shipped_places(name):
    """Every terrain-routed way of a real-ground blueprint over the real survey:
    the field is the per-cell rule's, cell for cell (the published rasters are
    needed; a schema-only checkout skips). Lilmoth and the sap camp proved this
    until their retirement (2026-09-23); the shipped yard's ways are all
    straight, so they are routed over terrain here, and the mire-landing test
    fixture carries an authored terrain way."""
    survey = sr.default_survey()
    if survey is None:
        pytest.skip("province survey rasters are not in this checkout")
    path = (Path(__file__).parent / name) if name.startswith("testdata/") else (BLUEPRINTS / name)
    bp = json.loads(path.read_text())["blueprint"]
    if name == "place.fixture.proving-ground.json":
        for _k, way in sr.iter_ways(bp):
            way["routing"] = "terrain"
    ways = [w for _k, w in sr.iter_ways(bp) if w.get("routing") == "terrain"]
    assert ways
    for way in ways:
        _assert_field_matches_rule(way, bp, survey)
