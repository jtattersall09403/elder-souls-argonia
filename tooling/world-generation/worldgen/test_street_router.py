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
