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

from .blueprint import PARCEL_GAP_MIN_M, PASSAGE_MIN_M

OVERLAP_M = 1.5
OVERLAP_RUN_M = 6.0
DOOR_REACH_M = 4.0
THROUGH_AREA_M2 = 2.0      # an attached way may brush the edge it ends at; more than this is running through
ABUT_EXEMPT_USES = {"wall", "fence", "palisade", "hedge"}   # 97 C10 enclosure
ROAD_WATER_MAX_M = 12.0     # a ford; anything longer needs a bridge/boardwalk piece
CHANNEL_DRY_MAX_FRAC = 0.25


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
    return errors
