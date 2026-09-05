"""Layer-integration checks for a blueprint (owner ruling 2026-09-05).

The owner found a quay deck sitting on a boardwalk crossroads, huts standing
on a boardwalk, two boardwalks overlapping, a gate arch beside its road and a
door facing away from the only way. Each is one layer ignoring another. These
checks run inside `compile_settlement` and FAIL the compile:

  parcel-on-way     a way (route/boardwalk/canal), buffered to half its width,
                    may not cross a parcel footprint — unless the way `endsAt`
                    that parcel, in which case only its end segment may touch
                    (the boardwalk attaches to the deck; the deck IS the node).
  way-overlap       two ways of the same class may not run within
                    OVERLAP_M of each other, near-parallel, for more than
                    OVERLAP_RUN_M (that is one path drawn twice).
  parcel-overlap    two parcel footprints may not intersect.
  gate-spans        a parcel with `spans: <way id>` must have that way pass
                    through its footprint (a gate stands ACROSS its road).
  door-to-way       every door threshold must lie within DOOR_REACH_M of a
                    route/boardwalk centreline (of any width) — or the design
                    adds a footpath way that ends at the parcel.
  parcel-gap        two building centres may not sit closer than
                    PARCEL_GAP_MIN_M (97 C5, the measured p10) unless the pair
                    was DESIGNED to touch: a declared `stacksOn`, a declared
                    `abuts` (with its `abutsWhy`), a gate that `spans` a way,
                    or an enclosure piece (a wall or a fence parcel).
  passage           where a way runs between two building hulls, the clear gap
                    between those hulls must be at least PASSAGE_MIN_M — two
                    character widths (97 C3 / D8), or the player cannot pass.
  network-stitch    (97 C-stitch, owner requirement 2026-09-05) the roads and
                    paths INTO a place must be one continuous network with the
                    streets inside it. For each `networkTerminals[]` entry: the
                    named PROVINCE route's polyline passes within
                    TERMINAL_ROUTE_M of `entryUV`; the blueprint way `wayId`
                    starts or ends within TERMINAL_WAY_M of the same point; the
                    way's class is not lower than the route's (a road does not
                    shrink to a footpath at the gate); a parcel that `spans`
                    that way stands on a road/track terminal. And no
                    road/track way may cross the boundary anywhere that is not
                    a terminal — that is an unplanned second entrance.
                    The join must also be STRAIGHT (owner example 2026-09-05,
                    Lilmoth: the road arrives at the gate from the south-west,
                    the blueprint's gate way leaves it to the north-west, so
                    the gate sits obliquely across the road it is meant to
                    close): the way's end segment runs within
                    TERMINAL_BEARING_TOL_DEG of the route's bearing over its
                    last TERMINAL_BEARING_RUN_M into the entry point; a `spans`
                    gate stands square ACROSS that bearing, which puts its
                    `yawDeg` — the piece's FACING; its wall run comes out on
                    yaw + 90 — ALONG the road
                    (±GATE_SQUARE_TOL_DEG); and an approach that names a
                    terminal's route must put its first `viaUV` point on that
                    route, at least APPROACH_STANDOFF_M out, so the sequence
                    the designer wrote is a walk along the real road.
  water-way         a canal/channel must be over published water for most of
                    its length (a channel drawn over dry ground is a mistake);
                    a boardwalk/pier may cross water, a road may not for more
                    than a ford's length.

Coordinates: everything is converted to world metres before testing; shapely
does the geometry.
"""

from __future__ import annotations

import math

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points, unary_union

from . import province_network as pn
from .blueprint import PARCEL_GAP_MIN_M, PASSAGE_MIN_M

OVERLAP_M = 1.5
OVERLAP_RUN_M = 6.0
DOOR_REACH_M = 4.0
THROUGH_AREA_M2 = 2.0      # an attached way may brush the edge it ends at; more than this is running through
ABUT_EXEMPT_USES = {"wall", "fence", "palisade", "hedge"}   # 97 C10 enclosure
ROAD_WATER_MAX_M = 12.0     # a ford; anything longer needs a bridge/boardwalk piece
CHANNEL_DRY_MAX_FRAC = 0.25
# 97 C-stitch tolerances. Three metres is a road's half-width plus a little:
# the province line is drawn on a 5.5 m raster, so it may not pass exactly
# through the gate, but it must pass through the gateway. One and a half is a
# way end that meets the terminal — anything more is a gap in the network.
TERMINAL_ROUTE_M = 3.0
TERMINAL_WAY_M = 1.5
# a road/track way crossing the boundary this far from a declared terminal is
# a second entrance nobody planned
TERMINAL_CROSS_M = 3.0
WAY_CLASS_RANK = pn.CLASS_RANK
# how straight the join has to be. 20 deg is a bend a cart takes without
# noticing; beyond it the eye reads two different roads meeting at the gate.
TERMINAL_BEARING_TOL_DEG = 20.0
TERMINAL_BEARING_RUN_M = 15.0
# a gate stands ACROSS its road: the piece's long axis (its wall run) is square
# to the road, which — since `yawDeg` is the facing and the hull's long side is
# on local +x — means its YAW runs parallel to the road's bearing.
GATE_SQUARE_TOL_DEG = 15.0
# how far out the approach arrow has to start, on the route itself
APPROACH_STANDOFF_M = 30.0
APPROACH_ON_ROUTE_M = 3.0


def _m(survey, uv):
    return survey.uv_to_m(float(uv[0]), float(uv[1]))


def _poly(survey, uv_poly) -> Polygon | None:
    try:
        pts = [_m(survey, p) for p in uv_poly]
        poly = Polygon(pts)
        return poly if poly.is_valid and poly.area > 0 else poly.buffer(0)
    except Exception:
        return None


def _line(survey, uv_pts) -> LineString | None:
    try:
        pts = [_m(survey, p) for p in uv_pts]
        return LineString(pts) if len(pts) >= 2 else None
    except Exception:
        return None


def _water_at(survey, x: float, z: float) -> bool:
    row, col = survey.grid_px(x, z)
    try:
        return bool(survey.open_water[row, col])
    except Exception:
        return False


def check_integration(bp: dict, survey) -> list[str]:
    errors: list[str] = []
    parcels = {p["id"]: p for p in bp.get("parcels", []) if p.get("footprint")}
    polys = {pid: _poly(survey, p["footprint"]) for pid, p in parcels.items()}
    polys = {k: v for k, v in polys.items() if v is not None}
    ways: list[tuple[str, dict, LineString]] = []
    for key in ("routes", "boardwalks", "canals"):
        for w in bp.get(key, []) or []:
            ln = _line(survey, w.get("points") or [])
            if ln is not None:
                ways.append((key, w, ln))

    # parcel-on-way
    for key, w, ln in ways:
        half = float(w.get("widthM", 2.0)) / 2.0
        buf = ln.buffer(half)
        ends = set(w.get("endsAt") or [])
        for pid, poly in polys.items():
            if not buf.intersects(poly):
                continue
            if pid in ends:
                # only the terminal segment may touch the parcel
                coords = list(ln.coords)
                first = LineString(coords[:2]).buffer(half)
                last = LineString(coords[-2:]).buffer(half)
                interior = LineString(coords[1:-1]).buffer(half) if len(coords) > 3 else None
                # the way may attach at its end; its interior may not cross the parcel
                if interior is not None and interior.intersection(poly).area > THROUGH_AREA_M2:
                    errors.append(f"integration: {key} {w['id']} runs THROUGH {pid} although it is meant to end there")
                elif not (first.intersects(poly) or last.intersects(poly)):
                    errors.append(f"integration: {key} {w['id']} touches {pid} mid-way rather than at an end")
                continue
            errors.append(f"integration: {key} {w['id']} crosses parcel {pid} — a way may only touch a building it endsAt (attach the way to the deck/door, or move the building)")

    # way-overlap (same class)
    for i in range(len(ways)):
        for j in range(i + 1, len(ways)):
            ki, wi, li = ways[i]
            kj, wj, lj = ways[j]
            if ki != kj:
                continue
            shared = li.buffer(OVERLAP_M).intersection(lj)
            if shared.length > OVERLAP_RUN_M:
                errors.append(f"integration: {ki} {wi['id']} and {wj['id']} run together for {shared.length:.0f} m — one path drawn twice; merge them or make one end at the other")

    # parcel-overlap
    ids = sorted(polys)
    stacked = {(pid, parcels[pid]["stacksOn"]) for pid in parcels if parcels[pid].get("stacksOn")}
    for a in range(len(ids)):
        for b in range(a + 1, len(ids)):
            if (ids[a], ids[b]) in stacked or (ids[b], ids[a]) in stacked:
                continue     # a declared stack (scaffold top on its base)
            pa, pb = polys[ids[a]], polys[ids[b]]
            if pa.intersects(pb) and pa.intersection(pb).area > 0.25:
                errors.append(f"integration: parcels {ids[a]} and {ids[b]} overlap ({pa.intersection(pb).area:.1f} m²)")

    # gate-spans
    by_way = {w["id"]: (k, w, ln) for k, w, ln in ways}
    for pid, p in parcels.items():
        span = p.get("spans")
        if not span:
            continue
        if span not in by_way:
            errors.append(f"integration: parcel {pid} spans unknown way {span}")
            continue
        _k, _w, ln = by_way[span]
        poly = polys.get(pid)
        if poly is None or not ln.intersects(poly):
            errors.append(f"integration: gate {pid} does not stand across {span} — the way must pass through the gate's footprint")

    # door-to-way
    walk_ways = [ln for k, w, ln in ways if k in ("routes", "boardwalks")]
    for d in bp.get("doors", []) or []:
        pt = Point(*_m(survey, d["thresholdUV"]))
        if walk_ways and min(ln.distance(pt) for ln in walk_ways) > DOOR_REACH_M:
            errors.append(f"integration: door {d['id']} is {min(ln.distance(pt) for ln in walk_ways):.1f} m from any route or boardwalk — add a footpath way that endsAt its parcel, or turn the door")
        elif not walk_ways:
            errors.append(f"integration: door {d['id']} — the blueprint has no routes or boardwalks for any door to open onto")

    # parcel-gap (97 C5): nearest-neighbour spacing is a legibility constant —
    # p50 13–16 m between building centres in every culture and size class, and
    # p10 never under 8 m. Contact is only ever DESIGNED contact.
    designed = set(stacked) | {(b, a) for a, b in stacked}
    for pid, p in parcels.items():
        for other in p.get("abuts") or []:
            designed.add((pid, other))
            designed.add((other, pid))
    centres = {pid: _m(survey, p["centreUV"]) for pid, p in parcels.items() if p.get("centreUV")}
    gap_ids = sorted(centres)
    for a in range(len(gap_ids)):
        for b in range(a + 1, len(gap_ids)):
            ia, ib = gap_ids[a], gap_ids[b]
            if (ia, ib) in designed:
                continue
            pa, pb = parcels[ia], parcels[ib]
            if (pa.get("use") or "") in ABUT_EXEMPT_USES or (pb.get("use") or "") in ABUT_EXEMPT_USES:
                continue
            if pa.get("spans") or pb.get("spans"):
                continue     # a gate stands across its way, hard against what flanks it
            (ax, az), (bx, bz) = centres[ia], centres[ib]
            d = math.hypot(ax - bx, az - bz)
            if d < PARCEL_GAP_MIN_M:
                errors.append(
                    f"integration: 97 C5 — parcels {ia} and {ib} stand {d:.1f} m apart, centre to centre; "
                    f"the floor is {PARCEL_GAP_MIN_M:.0f} m. Move one, or declare the contact with "
                    f"`abuts` + `abutsWhy` if these pieces were designed to touch")

    # passage (97 C3 / D8): where a way runs between two hulls, a player has to
    # fit — two character widths, ~1.3 m.
    for key, w, ln in ways:
        near = [(pid, poly) for pid, poly in polys.items()
                if ln.distance(poly) <= float(w.get("widthM", 2.0)) / 2.0 + PASSAGE_MIN_M]
        for a in range(len(near)):
            for b in range(a + 1, len(near)):
                (ia, pa), (ib, pb) = near[a], near[b]
                if (ia, ib) in designed:
                    continue
                gap = pa.distance(pb)
                if gap >= PASSAGE_MIN_M:
                    continue
                p1, p2 = nearest_points(pa, pb)
                if LineString([p1, p2]).intersects(ln):
                    errors.append(
                        f"integration: 97 C3 — {key} {w['id']} passes between {ia} and {ib}, which leave "
                        f"{gap:.2f} m between their hulls; a player needs {PASSAGE_MIN_M} m (two character widths)")

    # water-way
    for key, w, ln in ways:
        n = max(2, int(ln.length / 4.0))
        wet = 0
        for i in range(n + 1):
            pt = ln.interpolate(i / n, normalized=True)
            wet += 1 if _water_at(survey, pt.x, pt.y) else 0
        frac_wet = wet / (n + 1)
        if key == "canals" and (1.0 - frac_wet) > CHANNEL_DRY_MAX_FRAC:
            errors.append(f"integration: {w.get('kind')} {w['id']} is over dry ground for {(1 - frac_wet) * 100:.0f} % of its length — a canal is a cut into water, a channel is drawn in water")
        if key == "routes" and w.get("kind") in ("road", "track") and frac_wet * ln.length > ROAD_WATER_MAX_M:
            errors.append(f"integration: {w.get('kind')} {w['id']} crosses {frac_wet * ln.length:.0f} m of water — longer than a ford; needs a bridge or a boardwalk piece")

    # network-stitch (97 C-stitch) — only when the survey can reach the published
    # province bundles (the synthetic surveys in the tests pass their own).
    if getattr(survey, "province", None) is not None:
        errors += check_network_stitch(bp, survey)
    return errors


def _bearing(p0, p1) -> float | None:
    """Compass bearing p0 -> p1 in world metres (x east, z south, north = -z),
    the same convention as `yawDeg`."""
    dx, dz = p1[0] - p0[0], p1[1] - p0[1]
    if dx == 0.0 and dz == 0.0:
        return None
    return math.degrees(math.atan2(dx, -dz)) % 360.0


def _axis_delta(a: float, b: float) -> float:
    """Angle between two LINES (undirected), 0–90 deg: a way and the route it
    continues may be digitised in either direction."""
    d = abs(a - b) % 180.0
    return min(d, 180.0 - d)


def _line_bearing_at(line: LineString, pt: Point, run_m: float) -> float | None:
    """Bearing of `line` over `run_m` either side of the point nearest `pt`."""
    if line.length <= 0:
        return None
    sd = line.project(pt)
    p0 = line.interpolate(max(0.0, sd - run_m))
    p1 = line.interpolate(min(line.length, sd + run_m))
    return _bearing((p0.x, p0.y), (p1.x, p1.y))


def check_network_stitch(bp: dict, survey, network: dict | None = None) -> list[str]:
    """97 C-stitch: the province network and the place's streets are one network.

    `network` is `{route id: province_network.NetworkRoute}`; when omitted it is
    loaded from the published bundles. Returns one message per failure, each
    with the metres it is out by.
    """
    errors: list[str] = []
    terminals = bp.get("networkTerminals") or []
    if network is None:
        try:
            network = pn.load_network()
        except Exception:      # noqa: BLE001 — a partial checkout cannot geometry-check
            return errors

    ways: dict[str, tuple[str, dict, LineString]] = {}
    for key in ("routes", "boardwalks", "canals"):
        for w in bp.get(key, []) or []:
            ln = _line(survey, w.get("points") or [])
            if ln is not None:
                ways[w["id"]] = (key, w, ln)
    spanned = {p.get("spans") for p in bp.get("parcels", []) or [] if p.get("spans")}
    boundary = _poly(survey, bp.get("boundary") or [])

    terminal_pts: list[Point] = []
    for t in terminals:
        tid = t.get("id")
        entry = t.get("entryUV")
        if not (isinstance(entry, list) and len(entry) == 2):
            continue      # schema failure; reported by the validator
        pt = Point(*_m(survey, entry))
        terminal_pts.append(pt)

        route = (network or {}).get(t.get("routeId"))
        if route is None:
            errors.append(f"network-stitch: terminal {tid} names route {t.get('routeId')!r}, which is not in "
                          f"the published province network")
        elif len(route.points_m) >= 2:
            d = LineString(route.points_m).distance(pt)
            if d > TERMINAL_ROUTE_M:
                errors.append(f"network-stitch: terminal {tid} sits {d:.1f} m from route {route.id} "
                              f"(limit {TERMINAL_ROUTE_M} m) — the entry point must be ON the province "
                              f"line, or the road into the place misses its own gate")

        route_bearing = None
        if route is not None and len(route.points_m) >= 2:
            route_bearing = _line_bearing_at(LineString(route.points_m), pt, TERMINAL_BEARING_RUN_M)

        entry_ways = ways.get(t.get("wayId"))
        if entry_ways is None:
            continue      # schema failure; reported by the validator
        wkey, w, ln = entry_ways
        coords = list(ln.coords)
        d_end = min(Point(coords[0]).distance(pt), Point(coords[-1]).distance(pt))
        if d_end > TERMINAL_WAY_M:
            errors.append(f"network-stitch: way {w['id']} does not start or end at terminal {tid} — its "
                          f"nearer end is {d_end:.1f} m away (limit {TERMINAL_WAY_M} m); the street inside "
                          f"must pick the route up where it arrives")
        # class: the way that carries a route on may not be a lower rank
        route_rank = route.rank if (route is not None and not route.is_water) else None
        way_rank = WAY_CLASS_RANK.get(w.get("kind") or "")
        if route_rank is not None and way_rank is not None and way_rank < route_rank:
            errors.append(f"network-stitch: terminal {tid} carries {route.cls} {route.id} onto "
                          f"{w.get('kind')} {w['id']} — a way may not be a lower class than the route it "
                          f"continues (97 C-stitch); widen the way or re-class the terminal")
        # (a) no oblique kink at the gate: the street continues the road's line
        if route_bearing is not None and len(coords) >= 2:
            near_start = Point(coords[0]).distance(pt) <= Point(coords[-1]).distance(pt)
            end = coords[0] if near_start else coords[-1]
            end_line = LineString(coords if near_start else coords[::-1])
            inner = end_line.interpolate(min(TERMINAL_BEARING_RUN_M, end_line.length))
            way_bearing = _bearing(end, (inner.x, inner.y))
            if way_bearing is not None:
                off = _axis_delta(way_bearing, route_bearing)
                if off > TERMINAL_BEARING_TOL_DEG:
                    errors.append(f"network-stitch: terminal {tid} — {route.cls} {route.id} arrives on "
                                  f"{route_bearing:.0f}deg but way {w['id']} leaves the entry point on "
                                  f"{way_bearing:.0f}deg, {off:.0f}deg off (limit "
                                  f"{TERMINAL_BEARING_TOL_DEG:.0f}deg); the street must continue the road's "
                                  f"line, not meet it obliquely at the gate")
            # (b) a gate stands square across the road it closes: the PIECE's
            # long axis (its wall run) is perpendicular to the road, so the arch
            # spans the carriageway instead of leaning along it.
            #
            # `yawDeg` is the piece's FACING, not its long axis: the footprint
            # derivation (`blueprint_footprints.rotate_m`) turns the measured
            # local hull, whose long side lies on local +x, by yaw, so the wall
            # run comes out on bearing yaw + 90. A wall/arch square ACROSS the
            # road therefore has yaw PARALLEL to the road's bearing (corrected
            # 2026-09-05: the check read the axis the other way round, which
            # would have laid every gate lengthways down its own carriageway —
            # the measured hulls are the ground truth, not the label).
            for parcel in bp.get("parcels", []) or []:
                if parcel.get("spans") != w["id"]:
                    continue
                yaw = parcel.get("yawDeg")
                if not isinstance(yaw, (int, float)):
                    continue
                square = _axis_delta(float(yaw), route_bearing)
                if square > GATE_SQUARE_TOL_DEG:
                    errors.append(f"network-stitch: gate {parcel.get('id')} faces {float(yaw):.0f}deg against a "
                                  f"road bearing of {route_bearing:.0f}deg — {square:.0f}deg off square (limit "
                                  f"{GATE_SQUARE_TOL_DEG:.0f}deg); a gate stands ACROSS its road")

        if t.get("kind") in ("road", "track") and w["id"] not in spanned:
            errors.append(f"network-stitch: terminal {tid} is a {t.get('kind')} entrance but no parcel "
                          f"`spans` {w['id']} — a road or cart track enters through something (a gate, an "
                          f"arch, a barrier); add the piece or declare the terminal a footpath")

    # (c) the approach is described along the real road: its arrow starts ON the
    # province route, a standoff out from the entry point
    by_route = {t.get("routeId"): t for t in terminals if t.get("routeId")}
    entry_of = {t.get("routeId"): Point(*_m(survey, t["entryUV"])) for t in terminals
                if t.get("routeId") and isinstance(t.get("entryUV"), list) and len(t["entryUV"]) == 2}
    for ap in bp.get("approaches", []) or []:
        rid = ap.get("fromRouteId")
        if rid not in by_route:
            continue
        route = (network or {}).get(rid)
        via = ap.get("viaUV")
        if not (isinstance(via, list) and via and isinstance(via[0], list) and len(via[0]) == 2):
            errors.append(f"network-stitch: approach {ap.get('id')} names route {rid} but carries no viaUV "
                          f"arrow, so there is nothing to check the sequence against — give it the "
                          f"[u,v] points the player walks in along")
            continue
        start = Point(*_m(survey, via[0]))
        entry = entry_of.get(rid)
        if entry is not None:
            out_m = start.distance(entry)
            if out_m < APPROACH_STANDOFF_M:
                errors.append(f"network-stitch: approach {ap.get('id')} starts {out_m:.0f} m from its entry "
                              f"point; the sequence is judged from at least {APPROACH_STANDOFF_M:.0f} m out "
                              f"along the road")
        if route is not None and len(route.points_m) >= 2:
            d = LineString(route.points_m).distance(start)
            if d > APPROACH_ON_ROUTE_M:
                errors.append(f"network-stitch: approach {ap.get('id')} starts {d:.1f} m off route {rid} "
                              f"(limit {APPROACH_ON_ROUTE_M} m) — the approach must be described along the "
                              f"road the player is actually on")

    # an unplanned second entrance: a road/track way crossing the boundary away
    # from every declared terminal
    if boundary is not None and terminals:
        edge = boundary.exterior
        for wid, (wkey, w, ln) in sorted(ways.items()):
            if wkey != "routes" or w.get("kind") not in ("road", "track"):
                continue
            hit = ln.intersection(edge)
            if hit.is_empty:
                continue
            pts = [hit] if isinstance(hit, Point) else [g for g in getattr(hit, "geoms", []) if isinstance(g, Point)]
            for xp in pts:
                d = min((xp.distance(tp) for tp in terminal_pts), default=float("inf"))
                if d > TERMINAL_CROSS_M:
                    errors.append(f"network-stitch: {w.get('kind')} {wid} crosses the boundary {d:.1f} m "
                                  f"from the nearest declared terminal — an unplanned second entrance; "
                                  f"declare a networkTerminal for it or end the way inside the boundary")
    return errors


def stitch_report(bp: dict, survey, network: dict | None = None) -> list[str]:
    """The C-stitch failures, plus — for a blueprint that has no terminals yet —
    the province routes its ways already touch, so a designer can see which
    terminal to declare and where. Diagnostic only; nothing here fails a
    compile."""
    if network is None:
        network = pn.load_network()
    lines = list(check_network_stitch(bp, survey, network))
    if bp.get("networkTerminals"):
        return lines
    lines.append("no networkTerminals declared — candidate joins, measured:")
    net_lines = {rid: LineString(r.points_m) for rid, r in network.items() if len(r.points_m) >= 2}
    for key in ("routes", "boardwalks", "canals"):
        for w in bp.get(key, []) or []:
            ln = _line(survey, w.get("points") or [])
            if ln is None:
                continue
            for end_name, end in (("start", Point(ln.coords[0])), ("end", Point(ln.coords[-1]))):
                best = min(((line.distance(end), rid) for rid, line in net_lines.items()),
                           default=None)
                if best is None or best[0] > 25.0:
                    continue
                rid = best[1]
                bearing = _line_bearing_at(net_lines[rid], end, TERMINAL_BEARING_RUN_M)
                coords = list(ln.coords) if end_name == "start" else list(ln.coords)[::-1]
                inner = LineString(coords).interpolate(min(TERMINAL_BEARING_RUN_M, ln.length))
                wb = _bearing(coords[0], (inner.x, inner.y))
                off = _axis_delta(wb, bearing) if (wb is not None and bearing is not None) else float("nan")
                lines.append(f"  {w['id']} ({w.get('kind')}) {end_name}: {best[0]:.1f} m from "
                             f"{rid} ({network[rid].cls}); route bearing {bearing:.0f}deg, way "
                             f"{wb:.0f}deg, {off:.0f}deg apart")
    return lines


def main(argv: list[str] | None = None) -> int:
    import argparse
    import json as _json
    from pathlib import Path as _Path

    from . import blueprint as _bp_mod
    from .site_fields import ProvinceSurvey

    ap = argparse.ArgumentParser(description="97 C-stitch report for one or more blueprints")
    ap.add_argument("paths", nargs="*", type=_Path)
    args = ap.parse_args(argv)
    paths = args.paths or sorted(_bp_mod.BLUEPRINT_DIR.glob("*.json"))
    survey = ProvinceSurvey()
    network = pn.load_network()
    bad = 0
    for path in paths:
        bp = _json.loads(path.read_text()).get("blueprint") or {}
        print(f"== {bp.get('id', path.name)}")
        for line in stitch_report(bp, survey, network) or ["  stitched: no C-stitch failures"]:
            print(f"  {line}")
            bad += 1 if line.startswith("network-stitch") else 0
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
