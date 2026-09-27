"""`wb.py SCENE scan SPEC.json`: site feasibility before editing (speed lane,
owner 2026-09-27). For each building in the spec (a piece, a snapped
pair laid as one unit (`pair`, the anchor first), or a yard set, a centre, a radius, a step, yaws), every candidate pose on the grid is
measured on the scene's ground, across the fork pool:

* the pad's legality (0101 + the round-3 batter, `pads.resolve` / `refusal`
  and the pad edges `pad_fit` reads) and its worst edge, or, unpadded, the
  compile's own fit rules (`wb._fit_rules`: slope, delta, sill); a yard
  set, the dressing slope and each ground member's deltaRule
  (`member_delta`);
* the footprint's overlap with the painted road (`rules._road_cells`, the
  roadSurfaceRule's paint) and with the scene's paths and other pieces;
* the water depth one metre past the footprint along `landingBearing`;
* the piece's designed sink (manifest) and, for the listed candidates, the
  room free of pieces, paths and paint on each world side (n, e, s, w; the
  yard apron's room, up to `APRON_REACH_M`).

Candidates are ranked legal first (a legal pad or fit, no paint over
ROAD_OVERLAP_MIN_M2, clear of pieces and paths), then by worst pad edge
(or slope), then by distance from the centre. The top `verify` legal poses
are then placed on a copy of the scene and judged by the rules themselves
(`padRule` via `pads.pad_fit`, `roadSurfaceRule`, `sillRule` with the
porch's step to the ground), so the scan's first pose is one `check` passes.
The prior art is tooling/.reports/16k/walk2/P-pod-site-scan*.py and
P-yard-scan.py (walk 2 lane P)."""
from __future__ import annotations

import math

from . import measure, pads, parallel, rules
from .scene import Piece, plan_to_province

APRON_REACH_M = 6.0
APRON_STEP_M = 0.25
LANDING_PAST_M = 1.0
SIDES = {"n": (0.0, -1.0), "e": (1.0, 0.0), "s": (0.0, 1.0), "w": (-1.0, 0.0)}


def pair_join(cat, spec: dict) -> dict:
    """A snapped pair's join (`spec.pair`: {asset, childFace, parentFace,
    by: evidence | geometry, pick?, lateral?}): the child's plan offset from
    the anchor (`spec.asset`) in the anchor's frame and its yaw off the
    anchor's, found once by the `snap` op's own functions on the anchor at
    the origin, so every candidate lays the two as one unit (the stall
    halves st1 + st2; wb-gaps-1)."""
    from . import snap
    pr = spec["pair"]
    parent = Piece("scan:anchor", spec["asset"], 0.0, 0.0, 0.0,
                   scale=cat.placed_scale(spec["asset"]))
    parent.y = 0.0
    child = Piece("scan:pair", pr["asset"], 0.0, 0.0, 0.0, scale=cat.placed_scale(pr["asset"]))
    cf, pf = snap.face(pr.get("childFace")), snap.face(pr.get("parentFace"))
    if pr.get("by", "evidence") == "evidence":
        snap.snap_evidence(child, parent, cf, pf, int(pr.get("pick", 0)))
    else:
        if cf is None or pf is None:
            raise ValueError("scan pair: a geometric snap needs both faces")
        snap.snap_geometry(cat, child, parent, cf, pf, float(pr.get("lateral", 0.0)))
    return {"atM": (child.x, child.z), "yaw": child.yaw % 360.0}


def _members(cat, spec: dict, x: float, z: float, yaw: float) -> list[Piece]:
    """The pieces the pose lays: one piece, a snapped pair (anchor first),
    or a yard set's members."""
    if spec.get("group"):
        from . import assembly
        grp = assembly.load_group(spec["group"])
        out = []
        for m in grp["members"]:
            px, pz = plan_to_province((x, z), yaw, m["atM"])
            out.append(Piece("scan:" + m["uid"], m["asset"], px, pz,
                             (yaw + float(m.get("yaw", 0.0))) % 360.0,
                             scale=cat.placed_scale(m["asset"])))
        return out
    p = Piece("scan", spec["asset"], x, z, yaw % 360.0, scale=cat.placed_scale(spec["asset"]))
    if spec.get("pad") is not None:
        p.pad = dict(spec["pad"])
    if not spec.get("pair"):
        return [p]
    join = spec.get("_join") or pair_join(cat, spec)
    cx, cz = plan_to_province((x, z), yaw, join["atM"])
    return [p, Piece("scan:pair", spec["pair"]["asset"], cx, cz, (yaw + join["yaw"]) % 360.0,
                     scale=cat.placed_scale(spec["pair"]["asset"]))]


def _context(cat, scene, spec: dict):
    from shapely.geometry import LineString, Polygon
    from shapely.ops import unary_union
    skip = set(spec.get("skip") or [])
    others = [Polygon(measure.footprint_province(cat, q)).buffer(0.15) for q in scene.pieces
              if q.uid not in skip and q.y is not None and not (q.role or {}).get("socket")]
    ways = [LineString(w["pointsM"]).buffer(float(w.get("widthM", 3.0)) / 2.0)
            for w in scene.paths if len(w["pointsM"]) >= 2 and w["id"] not in skip]
    return (unary_union(others) if others else None), (unary_union(ways) if ways else None)


def _room(poly, blocked, side: str) -> float:
    """How far the footprint's world side can grow before it meets `blocked`."""
    from shapely.geometry import box
    x0, z0, x1, z1 = poly.bounds
    dx, dz = SIDES[side]
    d = 0.0
    while d < APRON_REACH_M:
        n = d + APRON_STEP_M
        strip = (box(x0, z0 - n, x1, z0) if side == "n" else box(x1, z0, x1 + n, z1) if side == "e"
                 else box(x0, z1, x1, z1 + n) if side == "s" else box(x0 - n, z0, x0, z1))
        if blocked is not None and strip.intersects(blocked):
            break
        d = n
    return round(d, 2)


def measure_pose(cat, scene, g, spec: dict, ctx, x: float, z: float, yaw: float) -> dict | None:
    """One candidate pose's numbers, or None outside the ground window."""
    from shapely.geometry import Point, Polygon
    from shapely.ops import unary_union
    others, ways = ctx["others"], ctx["ways"]
    pieces = _members(cat, spec, x, z, yaw)
    polys = [Polygon(measure.footprint_province(cat, p)) for p in pieces]
    outline = unary_union(polys)
    if not ctx["window"].contains(outline.buffer(1.0)):
        return None
    out = {"at": [round(x, 2), round(z, 2)], "yaw": round(yaw % 360.0, 1),
           "fromCentreM": round(math.hypot(x - spec["centre"][0], z - spec["centre"][1]), 2)}
    cells = rules._road_cells(outline)
    out["roadPaintM2"] = round(float(outline.intersection(unary_union(cells)).area), 2) if cells else 0.0
    out["piecesOverlapM2"] = (round(float(outline.intersection(others).area), 2)
                              if others is not None and ctx["othersP"].intersects(outline) else 0.0)
    out["pathOverlapM2"] = (round(float(outline.intersection(ways).area), 2)
                            if ways is not None and ctx["waysP"].intersects(outline) else 0.0)
    try:
        if pieces[0].pad is not None:
            p = pieces[0]
            # a pad resolves and is judged on the FROZEN ground, as
            # `scene_pads` and `pad_fit` (padRule) do; a pair's pad is its
            # anchor's
            g0 = ctx["frozen"]
            pad = pads.resolve_on_frozen(cat, g0, p)
            why = pads.refusal(cat, g0, p, pad)
            edges = ([] if pad.get("error") else pads.pad_edges_on(g0, pad["polygonM"], pad["datumM"]))
            worst = max([max(e["fillM"], e["cutM"]) for e in edges] or [0.0])
            srp = pads._srp()
            limit = srp.BATTER_MAX_M if p.pad.get("batter") else srp.RETAIN_BAR_M
            out.update({"padDatumM": None if pad.get("error") else round(pad["datumM"], 3),
                        "worstPadEdgeM": round(worst, 3), "padLimitM": limit,
                        "padRefusal": why,
                        "padLegal": why is None and worst <= limit})
            out["legalGround"] = out["padLegal"]
            out["rank"] = worst
            if len(pieces) > 1:
                # a padded pair's child: no outline vertex on wet ground, and
                # its whole footprint inside the anchor's resolved pad + its
                # blend (the pad is its ground, `pads.fit_ground`; planner
                # ruling 2026-09-27); `verify` then judges its fit rules
                wet = any(g.wet(a, b) for poly in polys[1:]
                          for a, b in list(poly.exterior.coords)[:-1])
                on_pad = False
                if not pad.get("error"):
                    reach = Polygon(pad["polygonM"]).buffer(float(pad["blendM"]) + 1e-6)
                    on_pad = all(reach.contains(poly) for poly in polys[1:])
                out["pairWetVertex"] = wet
                out["pairOnPad"] = on_pad
                out["legalGround"] = out["padLegal"] and not wet and on_pad
        else:
            worst_slope, wet = 0.0, False
            for p, poly in zip(pieces, polys):
                ring = list(poly.exterior.coords)[:-1]
                s = g.dressing_slope_deg(ring) if hasattr(g, "dressing_slope_deg") else None
                s = g.footprint_max_slope_deg(ring) if s is None else s
                worst_slope = max(worst_slope, s)
                wet = wet or any(g.wet(a, b) for a, b in ring)
            fit = ctx["fit_rules"](cat, g, pieces[0]) if len(pieces) == 1 else None
            out.update({"maxSlopeDeg": round(worst_slope, 2), "wetVertex": wet})
            if spec.get("pair"):
                # an unpadded pair: every member by the compile's own fit rules
                fits = [ctx["fit_rules"](cat, g, p) for p in pieces]
                out["groundFit"] = [f.get("groundFit") for f in fits]
                out["legalGround"] = all(bool(f["ok"]) for f in fits) and not wet
            elif fit is not None:
                out.update({k: fit.get(k) for k in ("groundFit", "slopeRule", "deltaRule",
                                                     "sillRule", "surveyDeltaM")})
                out["legalGround"] = bool(fit["ok"]) and not wet
            else:
                # a group: the dressing slope, and every ground member by
                # the single-piece scan's deltaRule (`measure.ground_delta`)
                out["memberDeltaRule"] = member_delta(cat, g, spec, pieces)
                out["legalGround"] = (worst_slope < ctx["dressing_slope_max"] and not wet
                                      and not out["memberDeltaRule"])
            out["rank"] = worst_slope
    except ValueError as err:                   # a sample outside the ground window
        out["error"] = str(err)
        out["legalGround"] = False
        out["rank"] = math.inf
    bearing = spec.get("landingBearing")
    if bearing is not None:
        bx, bz = math.sin(math.radians(bearing)), -math.cos(math.radians(bearing))
        edge = 0.0
        while outline.contains(Point(x + bx * edge, z + bz * edge)) and edge < 60.0:
            edge += 0.25
        lx, lz = x + bx * (edge + LANDING_PAST_M), z + bz * (edge + LANDING_PAST_M)
        out["landingWaterDepthM"] = round(float(max(0.0, g.depth(lx, lz))), 2)
    out["designedSinkM"] = [cat.row(p.asset).get("designedSinkM") for p in pieces][0] \
        if len(pieces) == 1 else None
    out["legal"] = (out["legalGround"] and out["roadPaintM2"] <= rules.ROAD_OVERLAP_MIN_M2
                    and out["piecesOverlapM2"] == 0.0 and out["pathOverlapM2"] == 0.0)
    return out


def member_delta(cat, g, spec: dict, pieces, grounds=None) -> dict:
    """A group's ground members failing the compile's ground-delta rule
    (`measure.ground_delta`, the single-piece scan's deltaRule), by member
    uid: {uid: why}. A member mounted on another (`upM`) is not on the
    ground and is skipped. ``grounds``: uid -> the ground that member is
    judged on (verify's padded fit ground), else ``g``."""
    from . import assembly, paths
    paths.bridge()
    from worldgen import compile_settlement as cs
    members = assembly.load_group(spec["group"])["members"]
    out = {}
    for m, p in zip(members, pieces):
        if m.get("upM") is not None:
            continue
        why = measure.ground_delta(cat, (grounds or {}).get(p.uid, g), p, cs)["deltaRule"]
        if why:
            out[m["uid"]] = why
    return out


def apron_room(cat, spec: dict, ctx, cand: dict) -> dict:
    """The room free of pieces, paths and paint on each world side of the
    candidate's outline (the yard apron's room; ranked candidates only)."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    x, z = cand["at"]
    outline = unary_union([Polygon(measure.footprint_province(cat, p))
                           for p in _members(cat, spec, x, z, cand["yaw"])])
    blocked = [b for b in (ctx["others"], ctx["ways"]) if b is not None]
    near = rules._road_cells(outline.buffer(APRON_REACH_M))
    if near:
        blocked.append(unary_union(near))
    blocked = unary_union(blocked) if blocked else None
    return {s: _room(outline, blocked, s) for s in SIDES}


def _poses_task(cat, scene, g, spec, ctx, poses):
    return [measure_pose(cat, scene, g, spec, ctx, x, z, yaw) for x, z, yaw in poses]


def grid(spec: dict) -> list[tuple[float, float, float]]:
    cx, cz = spec["centre"]
    r, step = float(spec.get("radius", 4.0)), float(spec.get("step", 1.0))
    yaws = spec.get("yaws")
    if yaws is None:
        ys = float(spec.get("yawStep", 15.0))
        yaws = [k * ys for k in range(int(round(360.0 / ys)))]
    n = int(math.floor(r / step + 1e-9))
    out = []
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            x, z = cx + i * step, cz + j * step
            if math.hypot(x - cx, z - cz) <= r + 1e-9:
                out += [(x, z, float(y)) for y in yaws]
    return out


def verify(cat, scene, spec: dict, cand: dict, fit_rules, judge=None) -> dict:
    """The candidate placed on a copy of the scene (its own pad declared,
    seated on the padded ground as `settle` seats it) and judged by the
    rules themselves."""
    trial = _without(scene, set(spec.get("skip") or []))
    x, z = cand["at"]
    placed = _members(cat, spec, x, z, cand["yaw"])
    uid = spec.get("id", "scan")
    for k, p in enumerate(placed):
        p.uid = uid if len(placed) == 1 else f"{uid}-{k}"
        if spec.get("parcel"):
            p.role = {"kind": "parcel", "id": spec["parcel"]}
        if spec.get("pair") and k > 0:
            # the snapped child is its anchor's assembly member (the layout's
            # st2), judged as `check` judges it
            p.role = {"kind": "assembly", "id": spec.get("parcel") or uid, "on": "ground"}
        trial.pieces.append(p)
    for p in placed:
        p.y = measure.seat(cat, pads.ground_for(cat, trial, p), p)["y"]
    got = {"uids": [p.uid for p in placed]}
    declared = pads.scene_pads(cat, trial)
    for p in placed:
        if p.uid in declared:
            got["padRule"] = pads.pad_fit(cat, trial, p, declared[p.uid])["padRule"]
    road = rules.road_surface(cat, trial, uids=got["uids"])
    got["roadSurfaceRule"] = [f for f in road["failures"] if f.split(":")[0] in got["uids"]]
    sill = rules.sill(cat, trial, uids=got["uids"])
    got["sillRule"] = [f for f in sill["failures"]
                       if f.removeprefix("door:").split(":")[0].split(".")[0] in got["uids"]]
    got["sill"] = {k: v for k, v in sill["doors"].items()
                   if k.removeprefix("door:").split(".")[0] in got["uids"]}
    if len(placed) == 1:
        got["fit"] = {k: v for k, v in fit_rules(cat, pads.ground_for(cat, trial, placed[0]),
                                                 placed[0]).items()
                      if k in ("ok", "slopeRule", "deltaRule", "sillRule", "maxSlopeDeg")}
    elif spec.get("group"):
        # every ground member by deltaRule on the ground it stands on
        # (`pads.fit_ground`), as the cheap pass judges it: gating
        got["memberDeltaRule"] = member_delta(
            cat, None, spec, placed, {p.uid: pads.fit_ground(cat, trial, p, declared)
                                      for p in placed})
    elif spec.get("pair"):
        # every member the anchor's pad does not judge, by the fit rules on
        # the ground it stands on (`pads.fit_ground`: on the anchor's pad,
        # the pad is its ground; planner ruling 2026-09-27): gating
        def fit(p):
            if judge is not None:
                return judge(cat, trial, p)
            return fit_rules(cat, pads.fit_ground(cat, trial, p, declared), p)
        got["childFit"] = {p.uid: {k: v for k, v in fit(p).items()
                                   if k in ("ok", "slopeRule", "deltaRule", "sillRule",
                                            "maxSlopeDeg")}
                           for p in placed if p.uid not in declared}
    got["passes"] = (not got.get("padRule") and not got["roadSurfaceRule"]
                     and not got["sillRule"] and not got.get("memberDeltaRule")
                     and all(f["ok"] for f in (got.get("childFit") or {}).values()))
    return got


def _without(scene, skip: set):
    from .scene import Scene
    return Scene(path=scene.path, placeId=scene.placeId, groundStem=scene.groundStem,
                 pieces=[q for q in scene.pieces if q.uid not in skip], paths=scene.paths)


REGION_MARGIN_M = 25.0      # beyond the scan disc: the largest piece + its pad apron + blend


def local_ground(cat, scene, spec: dict):
    """The padded ground of the scene WITHOUT the building being scanned
    (its own old pad must not stand under its candidates), keeping only the
    overlays that reach the scan's region: an overlay returns the ground
    unchanged outside its box + reach (`pad_overlay.overlay_one`), so every
    height sampled in the region is the full padded ground's, bit for bit."""
    from . import paths
    paths.bridge()
    from worldgen import pad_overlay
    g = pads.ground_for(cat, _without(scene, set(spec.get("skip") or [])), None)
    if not isinstance(g, pads.PaddedGround):
        return g
    cx, cz = spec["centre"]
    r = float(spec.get("radius", 4.0)) + REGION_MARGIN_M
    keep = []
    for o in g.overlays:
        reach = float(o["hardM"]) + float(o["blendM"])
        x0, z0, x1, z1 = o["bboxM"]
        if x0 - reach <= cx + r and x1 + reach >= cx - r and z0 - reach <= cz + r \
                and z1 + reach >= cz - r:
            keep.append(o)
    local = object.__new__(pads.PaddedGround)   # PaddedGround delegates unknown names to _g
    local.__dict__.update(g.__dict__)
    local.overlays = keep
    local._chunks = pad_overlay.ground(g._g.chunk_height, keep)
    local._survey = pad_overlay.ground(g._g.survey_height, keep)
    return local


def scan(cat, scene, doc: dict, fit_rules, serial: bool = False, judge=None) -> dict:
    """Every building in the scan spec: its candidates ranked, the top
    `limit` listed, the first `verify` legal ones placed and judged."""
    from shapely.geometry import box
    g0 = scene.ground()
    wx, wz = g0.meta["centreM"]
    half = g0.meta["halfM"]
    window = box(wx - half, wz - half, wx + half, wz + half)
    n = 1 if serial else parallel.workers()
    out = {"schemaVersion": 1, "buildings": []}
    for spec in doc["buildings"]:
        if spec.get("pair"):
            spec = {**spec, "_join": pair_join(cat, spec)}
        g = local_ground(cat, scene, spec)
        others, ways = _context(cat, scene, spec)
        from shapely.prepared import prep
        ctx = {"others": others, "ways": ways, "window": window, "fit_rules": fit_rules,
               "frozen": g0,
               "othersP": prep(others) if others is not None else None,
               "waysP": prep(ways) if ways is not None else None,
               "dressing_slope_max": float(spec.get("slopeMaxDeg", 2.0))}
        poses = grid(spec)
        tasks = [(_poses_task, (cat, scene, g, spec, ctx, c))
                 for c in parallel.chunks(poses, 4 * n)]
        found = [r for chunk in parallel.run(tasks, n) for r in chunk if r is not None]
        found.sort(key=lambda r: (not r["legal"], r["roadPaintM2"] > rules.ROAD_OVERLAP_MIN_M2,
                                  r["rank"], r["fromCentreM"], r["yaw"]))
        legal = [r for r in found if r["legal"]]
        checked = []
        for cand in legal[: int(spec.get("verify", 3))]:
            checked.append({"at": cand["at"], "yaw": cand["yaw"],
                            **verify(cat, scene, spec, cand, fit_rules, judge)})
        for r in found:
            r.pop("rank", None)
        for r in found[: int(spec.get("limit", 10))]:
            r["apronRoomM"] = apron_room(cat, spec, ctx, r)
        out["buildings"].append({
            "id": spec.get("id"), "asset": spec.get("asset"), "group": spec.get("group"),
            "pair": ({**spec["pair"], "atM": [round(v, 4) for v in spec["_join"]["atM"]],
                      "yaw": round(spec["_join"]["yaw"], 3)} if spec.get("pair") else None),
            "centre": spec["centre"], "poses": len(poses), "measured": len(found),
            "legal": len(legal), "top": found[: int(spec.get("limit", 10))],
            "verified": checked})
    return out
