"""The painted ways of a PUBLISHED place, measured (16k walk 6, owner):
`wb.py paint-check PLACE_ID`.

Reads `settlement.groundPaint` (schemaVersion 2: every entry carries its
`centrelineM` and `widthM`) and the doors of the published bundle, and the
province road paint the exporter clips against
(`export_settlement_bundle.province_road_paint`). Four measures, each a list
of failures:

- `danglingEnds`: a way end that is not on another way's centreline (within
  that way's half width), at a door threshold, at a floor or pad it serves
  (a well, a stall, a landing: any placed footprint), on the province road
  paint, or leaving the place as a run-out (`runOutEnds`: the paint narrows
  to nothing). A way that stops dead in the grass.
- `acuteJoins`: a way end that joins another way at under `JOIN_MIN_DEG` to
  either of the host's legs there. Two spurs off one corner, a Y at 30 deg.
- `doorGaps`: a door threshold farther than `DOOR_GAP_M` from the paint's
  half-alpha edge.
- `roadOverlapM2`: place paint lying on the province road paint (the road is
  never painted twice).

Pure over the bundle rows (`measure`), so the unit test feeds it a fixture.
"""
from __future__ import annotations

import math

JOIN_MIN_DEG = 50.0
DOOR_GAP_M = 0.3
DOOR_END_M = 1.2          # a way end this near a threshold ends AT the door
ROAD_END_M = 1.0          # ... this near the province road paint ends ON the road
EDGE_END_M = 2.0          # ... this near the place boundary runs out at the edge
SITE_END_M = 1.0          # ... this near a floor or pad (a well, a stall, a landing) serves it
ROAD_OVERLAP_MAX_M2 = 0.5


def _bearing(a, b) -> float:
    return math.degrees(math.atan2(b[0] - a[0], b[1] - a[1])) % 360.0


def _diff(a: float, b: float) -> float:
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def _host_legs(line, p) -> list[float]:
    """Bearings from `p` along `line` (a shapely LineString) both ways, at the
    nearest point of the line: one leg at a line end, two elsewhere."""
    from shapely.geometry import Point
    s = line.project(Point(p))
    q = line.interpolate(s)
    legs = []
    for t in (s - 1.5, s + 1.5):
        if -1e-6 <= t <= line.length + 1e-6 and abs(t - s) > 0.2:
            r = line.interpolate(t)
            legs.append(_bearing((q.x, q.y), (r.x, r.y)))
    if not legs:                     # a host shorter than a leg: its whole run
        a, b = line.coords[0], line.coords[-1]
        legs = [_bearing((q.x, q.y), b if math.dist((q.x, q.y), a) < math.dist((q.x, q.y), b) else a)]
    return legs


def measure(site: dict, doors: list[dict], road=None, treatments: list[dict] = (),
            placements: list[dict] = ()) -> dict:
    """Rows and failures for one published settlement (`site`, the bundle's
    `settlement` object), its `doors`, its building floors (`treatments`,
    the bundle's `groundTreatments`) and `placements` (a way may end at the
    thing it serves: a well, a stall, a landing, a canoe) and the province road paint geometry near it (`road`, shapely,
    or None)."""
    from shapely.geometry import LineString, Point, Polygon
    from shapely.ops import unary_union
    paint = site.get("groundPaint") or {}
    # the ways only: a building's seam (`seam_paint`: its trampled ring and
    # contact shade) is no way, and would hide a way that stops short of a door
    entries = [e for e in paint.get("entries") or [] if "routeId" in e]
    out = {"schemaVersion": paint.get("schemaVersion"), "entries": len(entries),
           "surfaces": 1 if entries else 0, "danglingEnds": [], "acuteJoins": [], "doorGaps": [],
           "roadOverlapM2": 0.0, "failures": []}
    if paint.get("schemaVersion") != 2:
        out["failures"].append(f"groundPaint schemaVersion {paint.get('schemaVersion')!r}, expected 2")
        return out
    ways = {}
    for e in entries:
        ways.setdefault(e["routeId"], e)
    lines = {rid: LineString(e["centrelineM"]) for rid, e in ways.items()}
    union = unary_union([Polygon(e["polygonM"]).buffer(0) for e in entries]) if entries else None
    # the way's visible edge: the half-alpha line, `edgeM / 2` inside the polygon (the exporter buffers
    # the centreline by width / 2 + edgeM / 2), so a threshold under the faint feather is still a gap
    seen = unary_union([Polygon(e["polygonM"]).buffer(0).buffer(-float(e["edgeM"]) / 2)
                        for e in entries]) if entries else None
    boundary = site.get("boundaryM") or []
    area = Polygon(boundary).buffer(0) if len(boundary) >= 3 else None
    sites = [Polygon(t["footprintM"]).buffer(0) for t in treatments
             if len(t.get("footprintM") or []) >= 3 and ".assembly." not in t["id"]]
    sites += [Polygon(piece["polygonM"]).buffer(0) for o in (site.get("groundOverlays") or {}).get("pads") or []
              for piece in o.get("pieces") or [] if not str(o.get("id", "")).startswith("pool.")]
    sites += [Polygon(p["footprintM"]).buffer(0) for p in placements if len(p.get("footprintM") or []) >= 3]
    served = unary_union(sites) if sites else None
    thresholds = [(d["id"], tuple(d["thresholdM"])) for d in doors if d.get("thresholdM")]
    for rid, e in sorted(ways.items()):
        pts = e["centrelineM"]
        run_out = set(e.get("runOutEnds") or [])
        for name, end, prev in (("start", pts[0], pts[1]), ("end", pts[-1], pts[-2])):
            p = Point(end)
            leg = _bearing(end, prev)
            hosts = [(other, lines[other]) for other in sorted(lines) if other != rid
                     and lines[other].distance(p) <= float(ways[other]["widthM"]) / 2 + 0.05]
            at_door = any(math.hypot(end[0] - t[0], end[1] - t[1]) <= DOOR_END_M for _, t in thresholds)
            on_road = road is not None and not road.is_empty and road.distance(p) <= ROAD_END_M
            # leaving the place is fine only as a run-out (the paint narrows to nothing)
            at_edge = name in run_out and area is not None and (
                not area.contains(p) or area.exterior.distance(p) <= EDGE_END_M)
            at_site = served is not None and served.distance(p) <= SITE_END_M
            if not (hosts or at_door or on_road or at_edge or at_site):
                out["danglingEnds"].append({"way": rid, "endM": [round(end[0], 2), round(end[1], 2)]})
                out["failures"].append(f"{rid}: end {end[0]:.1f},{end[1]:.1f} stops dead "
                                       "(not on a way, a door, a served floor or pad, the road, or a run-out at the place edge)")
            for other, line in hosts:
                worst = min((_diff(leg, h) for h in _host_legs(line, end)), default=180.0)
                if worst < JOIN_MIN_DEG:
                    out["acuteJoins"].append({"way": rid, "host": other, "deg": round(worst, 1),
                                              "atM": [round(end[0], 2), round(end[1], 2)]})
                    out["failures"].append(f"{rid}: joins {other} at {worst:.0f} deg "
                                           f"(>= {JOIN_MIN_DEG:.0f}) at {end[0]:.1f},{end[1]:.1f}")
    for did, t in thresholds:
        gap = seen.distance(Point(t)) if seen is not None and not seen.is_empty else math.inf
        if gap > DOOR_GAP_M:
            out["doorGaps"].append({"door": did, "gapM": round(gap, 2)})
            out["failures"].append(f"{did}: paint stops {gap:.2f} m short of the threshold (<= {DOOR_GAP_M})")
    if road is not None and union is not None and not road.is_empty:
        area = union.intersection(road).area
        out["roadOverlapM2"] = round(area, 2)
        if area > ROAD_OVERLAP_MAX_M2:
            out["failures"].append(f"place paint lies on {area:.1f} m2 of province road paint "
                                   f"(<= {ROAD_OVERLAP_MAX_M2})")
    return out


def load_doc(place_id: str, preview: bool = False) -> dict:
    """The published bundle `province/settlements/<place>.json`; with
    ``preview``, its `groundPaint` recomputed from the authored blueprint's
    routes by the exporter's own `ground_paint` + `clip_ground_paint` (over
    the published pads and floors): the paint the next publish will ship,
    measured before the publish (a layout round's check)."""
    import json
    from workbench import paths
    paths.bridge()
    doc = json.loads((paths.PROVINCE / "settlements" / f"{place_id}.json").read_text())
    if preview:
        from worldgen import export_settlement_bundle as ex
        bp = json.loads((paths.BLUEPRINTS / f"{place_id}.json").read_text())["blueprint"]
        site = doc["settlement"]
        site["groundPaint"], road = ex._place_ground_paint(place_id, bp, ex.shared_survey())
        ids = set(site.get("placementIds") or [])
        ex.clip_ground_paint(site, [t for t in doc.get("groundTreatments") or []
                                    if t["id"].removeprefix("treatment.") in ids], road=road)
    return doc


def check_published(place_id: str, preview: bool = False) -> dict:
    """`measure` over the published bundle (or its `preview`, `load_doc`)."""
    from workbench import paths
    paths.bridge()
    from shapely.geometry import MultiPoint
    from worldgen.export_settlement_bundle import province_road_paint
    doc = load_doc(place_id, preview)
    site = doc["settlement"]
    pts = [p for e in (site.get("groundPaint") or {}).get("entries") or [] for p in e["polygonM"]]
    road = province_road_paint(MultiPoint(pts).buffer(10).bounds) if pts else None
    return {"place": place_id, **({"preview": True} if preview else {}),
            **measure(site, doc.get("doors") or [], road, doc.get("groundTreatments") or [],
                      [p for p in doc.get("placements") or []
                       if p.get("id") in set(site.get("placementIds") or [])])}
