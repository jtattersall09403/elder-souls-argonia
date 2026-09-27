"""Terrain pads under a modular run the ground drops away from (16k carried
item 13, lane F; decision 0059 typed patches, 0081 addendum).

A run (a wall, a fence, a boardwalk) seats as ONE rigid chain
(`anchoring.ts anchorRun`, commit 259b200a): the datum is the member with the
highest mean ground under its own footprint, at that mean less its sink, and
every other member sits at datum + riseM_i - riseM_datum. Where the ground
falls away under the chain a member floats. The fix is ground, not a bent
chain: the export emits one typed terrain patch per run,
``patch.pad.settlement.<placeId>.<runId>`` (kind ``settlement-pad``), that
grades the ground under every member whose contact gap (its designed ground
line, pivot + sink, over the lowest ground under its footprint) exceeds
``SEAT_BAR_M`` up to that line.

Authoring is CUMULATIVE (`merge_pad_patches`): measured on ground a pad has
already raised, the gap is gone, so a re-derived set would drop the pad that
fixed it. A member's entry is replaced only by a new measurement that still
finds a gap; nothing is dropped by a re-measure.

A BUILDING may declare a pad too (decision 0101): the parcel's `pad`
{datumM, apronM, floorMinM?} grades its footprint plus an apron to one datum
(``patch.pad.settlement.<placeId>.<parcelId>``). The workbench resolves the
datum (`resolve_pad`: the median ground under the pad, clamped so fill and
cut each stay within MAX_PAD_DELTA_M, never below a place's flood floor) and
exports it; the compile reads it as a record, refuses a pad whose fill or cut
exceeds MAX_PAD_DELTA_M, and seats the piece on the patched ground; the
bundle export writes the patch through the one writer `pad_patch`, as for
runs. An edge whose fill or cut against the ground beyond it exceeds
RETAIN_BAR_M needs a retaining wall of the building kit's wall family
(`RETAINING_WALLS`, rule R1); a kit with no wall family keeps every edge
within RETAIN_BAR_M.

`pad_overlay` is the one pad maths (decision 0102): the runtime overlay the
bundle carries, `pad_ground` (the workbench and the compile's seat and slope
rules on padded ground) and `patched_height_at` (the yard gates over the
bundle's `groundOverlays`) all apply it point by point; `pad_overlay.apply_grid`
is its grid form (the terrain patch code refuses the `settlement-pad` kind
since 0102). A
building pad's patch carries ``hardM`` 0: its polygon already holds the
apron, so the graded area is exactly footprint + apron (0101), where a run
member's hard zone reaches PAD_HARD_RADIUS_PX samples past its footprint.
`building_pad` is the one judge of a building pad (the compile's refusal and
the workbench's `check`), on whatever ground it is handed.
"""

from __future__ import annotations

import math

import numpy as np

SEAT_BAR_M = 0.05          # a run member whose ground line stands this far over the ground gets a pad
PAD_BLEND_M = 3.0          # the pad tapers back to the natural ground over this
BATTER_MAX_M = 1.2         # 0101 R1 amendment (planner ruling 2026-09-27 r3): a kit with no
BATTER_RUN = 2.0           # wall family grades an edge up to BATTER_MAX_M over a blend ramp
                           # BATTER_RUN x the edge height wide (never under PAD_BLEND_M)
PAD_HARD_RADIUS_PX = 1.5   # every sample within this many samples of the footprint takes the target,
                           # so any sampler (nearest pixel or bilinear) at a footprint point reads it
MAX_PAD_DELTA_M = 2.0      # = grade_settlement_pads.MAX_PAD_DELTA_M: a pad is a small engineered base
PAD_APRON_M = 1.5          # a building pad reaches this far beyond its footprint (0101)
RETAIN_BAR_M = 0.6         # R1: a pad edge whose fill or cut exceeds this is a retaining-wall run
RETAIN_REACH_M = 1.0       # R1: a wall piece within this of a pad edge retains it (= workbench pads.RETAIN_REACH_M)
PAD_SAMPLE_STEP_M = 1.0    # the grid the ground under a building pad is read on
#: R1: the retaining-wall family of a building's kit (asset id prefixes the
#: wall run's pieces must carry). A kit absent here has none (argonian mud:
#: the pad keeps every edge within RETAIN_BAR_M; move or change the piece).
RETAINING_WALLS = {
    "settlement-imperial-v1": ("vanilla:architecture/farmhouse/stonewall/stonewall",
                               "composite:farmhouse/stonewall-run-"),
}


def run_seats(rows: list[dict], height_at) -> dict[str, float]:
    """placement id -> pivot y of every run member, seated as one rigid chain
    (`anchoring.ts anchorRun`). ``rows`` are one place's bundle placements."""
    runs: dict[str, list] = {}
    for p in rows:
        if p.get("run") and p.get("footprintM"):
            runs.setdefault(p["run"]["id"], []).append(p)
    out: dict[str, float] = {}
    for members in runs.values():
        means = [sum(height_at(float(x), float(z)) for x, z in p["footprintM"])
                 / len(p["footprintM"]) for p in members]
        d = max(range(len(members)), key=lambda i: means[i])
        datum = means[d] - float(members[d]["anchor"]["designedSinkM"]["p50"]) * float(
            members[d].get("scale", 1.0))
        for p in members:
            out[p["id"]] = datum + float(p["run"]["riseM"]) - float(members[d]["run"]["riseM"])
    return out


def run_pad_patches(rows: list[dict], place_id: str, height_at, is_wet=None) -> list[dict]:
    """One `settlement-pad` patch per run with a member over the seat bar. A
    member with any footprint point in water (``is_wet(x, z)``) is left out:
    a pad never fills water (0059 invariant 4)."""
    seats = run_seats(rows, height_at)
    by_run: dict[str, list[dict]] = {}
    for p in rows:
        if p["id"] not in seats:
            continue
        if is_wet is not None and any(is_wet(float(x), float(z)) for x, z in p["footprintM"]):
            continue
        line = seats[p["id"]] + float(p["anchor"]["designedSinkM"]["p50"]) * float(p.get("scale", 1.0))
        low = min(height_at(float(x), float(z)) for x, z in p["footprintM"])
        gap = line - low
        if gap > SEAT_BAR_M:
            by_run.setdefault(p["run"]["id"], []).append({
                "placementId": p["id"], "targetM": round(line, 3), "gapM": round(gap, 3),
                "footprintM": [[round(float(x), 3), round(float(z), 3)] for x, z in p["footprintM"]]})
    return [pad_patch(place_id, run_id, pieces) for run_id, pieces in sorted(by_run.items())]


def pad_patch(place_id: str, owner_id: str, pieces: list[dict], owner: str = "run") -> dict:
    """The one `settlement-pad` writer, for a run's pad and a building's
    (``owner`` "run" or "building"; ``owner_id`` the run id or the parcel id)."""
    pieces = sorted(pieces, key=lambda r: r["placementId"])
    xs = [x for r in pieces for x, _ in r["footprintM"]]
    zs = [z for r in pieces for _, z in r["footprintM"]]
    # a run id already starts with its place id: the patch id names it once
    short = owner_id.removeprefix(f"{place_id}.")
    if owner == "run":
        why = (f"run {owner_id} seats as one rigid chain and the ground falls away under "
               f"{len(pieces)} member(s) by more than {SEAT_BAR_M} m: the pad grades it up to "
               f"each member's designed ground line")
    else:
        why = (f"building {owner_id} declares a pad (0101): its footprint and apron are graded "
               f"to the datum {pieces[0]['targetM']} m")
    return {
        "id": f"patch.pad.settlement.{place_id}.{short}", "kind": "settlement-pad",
        "order": 3, "after": [], "crosses": [], "makesWater": False,
        "bboxM": [round(min(xs), 3), round(min(zs), 3), round(max(xs), 3), round(max(zs), 3)],
        "blendM": PAD_BLEND_M, "maxDeltaM": MAX_PAD_DELTA_M,
        "source": {"placeId": place_id, ("runId" if owner == "run" else "buildingId"): owner_id,
                   "by": "worldgen.export_settlement_bundle (settlement_run_pads)"},
        "params": {"pieces": pieces},
        "why": why,
    }


def building_pad_patches(rows: list[dict], place_id: str) -> list[dict]:
    """One `settlement-pad` patch per building placement that carries the
    compile's resolved `pad` {datumM, polygonM} (decision 0101); ``hardM`` 0,
    so the realised pad is the polygon and `pad_ground` is its surface."""
    out = []
    for p in rows:
        pad = p.get("pad")
        if not isinstance(pad, dict):
            continue
        # the pad block names its parcel (the compile writes it; a bundle
        # placement carries no parcelId of its own)
        patch = pad_patch(place_id, pad["parcelId"], [{
            "placementId": p["id"], "targetM": round(float(pad["datumM"]), 3), "gapM": None,
            "footprintM": [[round(float(x), 3), round(float(z), 3)] for x, z in pad["polygonM"]]}],
            owner="building")
        patch["hardM"] = 0.0
        patch["blendM"] = float(pad.get("blendM", PAD_BLEND_M))    # a batter's graded ramp
        out.append(patch)
    return sorted(out, key=lambda q: q["id"])


def depth_is_wet(depth: np.ndarray, extent_m: float):
    """``is_wet(x, z)`` over a province water-depth raster (nearest cell)."""
    px = extent_m / depth.shape[0]

    def is_wet(x: float, z: float) -> bool:
        row = min(max(int(z // px), 0), depth.shape[0] - 1)
        col = min(max(int(x // px), 0), depth.shape[1] - 1)
        return float(depth[row, col]) > 0.0
    return is_wet


def batter_blend_m(polygon, datum: float, height_at) -> float:
    """The blend width a battered pad grades its edges over: BATTER_RUN x
    its highest edge (fill or cut, `pad_edges`), never under PAD_BLEND_M."""
    h = max((max(e["fillM"], e["cutM"]) for e in pad_edges(polygon, datum, height_at)), default=0.0)
    return round(max(PAD_BLEND_M, BATTER_RUN * h), 3)


def building_pad(spec, foot_m, height_at, is_wet) -> tuple[dict | None, str | None]:
    """The one judge of a building's declared pad (decision 0101) on the
    ground ``height_at`` with water ``is_wet``: (pad, None) with its polygon
    (footprint grown by the apron), fill, cut and the footing slope of the
    patched surface; (None, why) when the compile refuses it (no datumM,
    fill or cut over MAX_PAD_DELTA_M, water under it: a pad never fills
    water, 0059 invariant 4; a datum under its flood floor)."""
    if not isinstance(spec, dict) or not isinstance(spec.get("datumM"), (int, float)):
        return None, "pad: declares no datumM (the workbench export resolves it; 0101)"
    apron = float(spec.get("apronM", PAD_APRON_M))
    polygon = pad_polygon(foot_m, apron)
    samples = footprint_samples(polygon)
    datum = float(spec["datumM"])
    got = pad_delta(datum, [height_at(x, z) for x, z in samples])
    if got["error"]:
        return None, got["error"]
    wet = sum(1 for x, z in samples if is_wet(x, z))
    if wet:
        return None, (f"pad: {wet} sample(s) under it are water; a pad never fills water "
                      f"(0059 invariant 4)")
    floor = spec.get("floorMinM")
    if isinstance(floor, (int, float)) and datum < float(floor) - 1e-6:
        return None, f"pad: datum {datum:.2f} m is below its flood floor {float(floor):.2f} m"
    blend = batter_blend_m(polygon, datum, height_at) if spec.get("batter") else PAD_BLEND_M
    patched = pad_ground(height_at, [{"polygonM": polygon, "datumM": datum, "blendM": blend}])
    return {"datumM": round(datum, 3), "apronM": apron, "blendM": blend,
            "polygonM": [[round(x, 3), round(z, 3)] for x, z in polygon],
            "fillM": got["fillM"], "cutM": got["cutM"],
            "slopeDeg": surface_slope_deg(patched, foot_m)}, None


class PaddedSurvey:
    """A survey whose `height_at` is the ground with building pads applied
    (`pad_ground`); every other attribute is the survey's. What the compile
    reads for everything after the pads are resolved (0101)."""

    def __init__(self, survey, pads: list[dict]):
        self._survey = survey
        self.pad_index = PadIndex([p["polygonM"] for p in pads])
        self.height_at = pad_ground(survey.height_at, pads)

    def pad_slope_deg(self, polygon) -> float | None:
        """The footing slope of the patched surface under ``polygon`` where
        it touches a pad (`padded_slope_deg`), else None: the analysis
        grid's cells read the frozen ground there. Any padded surface (the
        workbench's `PaddedGround`, the yard gate's raster-patched survey)
        exposes the same method; `compile_settlement.footprint_max_slope_deg`
        reads it wherever it exists."""
        from .compile_settlement import grid_max_slope_deg
        return padded_slope_deg(self.height_at, self.pad_index, polygon,
                                lambda ring: grid_max_slope_deg(ring, self._survey))

    def __getattr__(self, name):
        return getattr(self._survey, name)


def merge_pad_patches(existing: list[dict], new: list[dict],
                      rebuilt: dict[str, dict] | None = None) -> list[dict]:
    """The cumulative merge: a pad in ``new`` adds its members, a member
    measured again with a gap replaces its old entry; other kinds are
    untouched. Cumulative is about MEASUREMENT (a pad that worked measures no
    gap), never about the layout: for every place in ``rebuilt``
    ({placeId: {"runs": run ids, "buildings": padded parcel ids}}, the places
    this export rebuilt), an existing pad of this writer whose run or
    building is no longer there is dropped. Returns the merged list
    (unordered). A member whose placement is no longer in its rebuilt place
    (``rebuilt[place]["placements"]``) is dropped from its pad."""
    def gone(patch: dict) -> bool:
        src = patch.get("source") or {}
        live = (rebuilt or {}).get(src.get("placeId"))
        if patch.get("kind") != "settlement-pad" or live is None:
            return False
        if "buildingId" in src:
            return src["buildingId"] not in live["buildings"]
        return "runId" in src and src["runId"] not in live["runs"]

    out = {}
    for p in existing:
        if gone(p):
            continue
        live = ((rebuilt or {}).get((p.get("source") or {}).get("placeId")) or {}).get("placements")
        if p.get("kind") == "settlement-pad" and live is not None:
            # a member that left the rebuilt layout takes its grading with it
            kept = [r for r in p["params"]["pieces"] if r["placementId"] in live]
            if not kept:
                continue
            if len(kept) != len(p["params"]["pieces"]):
                src = p["source"]
                owner = "run" if "runId" in src else "building"
                rebuilt_patch = pad_patch(src["placeId"], src.get("runId") or src["buildingId"],
                                          kept, owner)
                if owner == "building":
                    rebuilt_patch["hardM"] = 0.0
                p = rebuilt_patch
        out[p["id"]] = p
    for patch in new:
        old = out.get(patch["id"])
        if old is None:
            out[patch["id"]] = patch
            continue
        pieces = {r["placementId"]: r for r in old["params"]["pieces"]}
        pieces.update({r["placementId"]: r for r in patch["params"]["pieces"]})
        src = patch["source"]
        owner = "run" if "runId" in src else "building"
        merged = pad_patch(src["placeId"], src.get("runId") or src["buildingId"],
                           list(pieces.values()), owner)
        if owner == "building":
            # building_pad_patches always sets hardM 0.0 (the realised pad IS
            # the polygon); pad_patch itself has no opinion, so re-apply it
            # after the merge or grading falls back to PAD_HARD_RADIUS_PX.
            merged["hardM"] = 0.0
        out[patch["id"]] = merged
    return list(out.values())


# --- building pads (decision 0101) -------------------------------------------------

def pad_polygon(footprint, apron_m: float = PAD_APRON_M) -> list[tuple[float, float]]:
    """The footprint's least rotated rectangle grown by the apron, corners
    kept square: an engineered base has four straight edges, each one wall
    run or none (R1), whatever the outline's own vertex count."""
    from shapely.geometry import Polygon
    grown = (Polygon(footprint).minimum_rotated_rectangle
             .buffer(float(apron_m), join_style=2, mitre_limit=3.0))
    return [(round(x, 3), round(z, 3)) for x, z in list(grown.exterior.coords)[:-1]]


def footprint_samples(polygon, step: float = PAD_SAMPLE_STEP_M) -> list[tuple[float, float]]:
    """The polygon's vertices and every point of a ``step`` grid inside it."""
    from shapely.geometry import Point, Polygon
    poly = Polygon(polygon)
    x0, z0, x1, z1 = poly.bounds
    pts = [(float(x), float(z)) for x, z in polygon]
    for i in range(int((z1 - z0) // step) + 1):
        for j in range(int((x1 - x0) // step) + 1):
            x, z = x0 + (j + 0.5) * step, z0 + (i + 0.5) * step
            if poly.contains(Point(x, z)):
                pts.append((x, z))
    return pts


def resolve_pad(heights, datum_m: float | None = None, floor_min_m: float | None = None,
                also=None) -> dict:
    """The pad's datum over the ground ``heights`` under it: the authored
    ``datum_m``, else the median clamped so the fill (datum over the lowest
    ground) and the cut (highest ground over the datum) each stay within
    MAX_PAD_DELTA_M on ``heights`` and on ``also`` (the same points on the
    ground the compile judges, when the median is read on another); then
    raised to ``floor_min_m`` (a place's flood floor). ``error`` names a pad
    the compile refuses (fill or cut over the limit)."""
    hs = sorted(float(h) for h in heights)
    every = hs + [float(h) for h in (also or [])]
    lo, hi = min(every), max(every)
    n = len(hs)
    median = hs[n // 2] if n % 2 else 0.5 * (hs[n // 2 - 1] + hs[n // 2])
    if datum_m is not None:
        datum, how = float(datum_m), "authored"
    else:
        datum = min(max(median, hi - MAX_PAD_DELTA_M), lo + MAX_PAD_DELTA_M)
        how = "median" if datum == median else "median-clamped"
        # the record carries the datum to 1 mm: round it inside the clamp
        datum = round(datum, 3)
        if datum - lo > MAX_PAD_DELTA_M:
            datum = round(datum - 0.001, 3)
        elif hi - datum > MAX_PAD_DELTA_M:
            datum = round(datum + 0.001, 3)
    if floor_min_m is not None and datum < float(floor_min_m):
        datum, how = float(floor_min_m), "flood-floor"
    out = {"datumM": round(datum, 3), "how": how, "medianM": round(median, 3),
           "groundMinM": round(lo, 3), "groundMaxM": round(hi, 3)}
    out.update(pad_delta(datum, every))
    return out


def pad_delta(datum: float, heights) -> dict:
    """Fill and cut of a datum over the ground under the pad, and why the
    compile refuses it (either over MAX_PAD_DELTA_M), or None."""
    fill = max(0.0, float(datum) - min(heights))
    cut = max(0.0, max(heights) - float(datum))
    worst = max(fill, cut)
    return {"fillM": round(fill, 3), "cutM": round(cut, 3),
            "error": None if worst <= MAX_PAD_DELTA_M + 1e-9 else
            (f"pad datum {datum:.2f} m {'fills' if fill >= cut else 'cuts'} {worst:.2f} m "
             f"(limit {MAX_PAD_DELTA_M} m, 0101): re-site the piece or choose a fit made for "
             f"the slope")}


def pad_ground(height_at, pads: list[dict]):
    """``height_at`` with building pads applied point by point, through the
    overlay maths (`pad_overlay.ground`, decision 0102: one pad surface for
    the workbench, the compile, the gates and the runtime). ``pads``:
    [{polygonM, datumM, id?}]; each is one overlay (``hardM`` 0, blend
    PAD_BLEND_M), applied in id order (a pad without an id takes its index)."""
    if not pads:
        return height_at
    from . import pad_overlay
    overlays = [pad_overlay.building_overlay(str(p.get("id", f"pad.{i:04d}")), p["polygonM"],
                                             float(p["datumM"]), float(p.get("blendM", PAD_BLEND_M)))
                for i, p in enumerate(pads)]
    return pad_overlay.ground(height_at, overlays)


def surface_slope_deg(height_at, polygon, step: float = PAD_SAMPLE_STEP_M,
                      probe: float = 0.5) -> float:
    """The steepest gradient of the surface ``height_at`` at the polygon's
    sample points (central differences over ``probe`` metres): the footing
    slope rule on patched ground, where the analysis grid's 5.48 m cells
    would read the frozen ground."""
    worst = 0.0
    for x, z in footprint_samples(polygon, step):
        gx = (height_at(x + probe, z) - height_at(x - probe, z)) / (2 * probe)
        gz = (height_at(x, z + probe) - height_at(x, z - probe)) / (2 * probe)
        worst = max(worst, math.degrees(math.atan(math.hypot(gx, gz))))
    return worst


class PadIndex:
    """The graded polygons of a set of pads, built once: `split` cuts a
    footprint into the parts on a pad and the parts off every pad (bounding
    boxes first)."""

    def __init__(self, polygons):
        from shapely.geometry import Polygon
        from shapely.ops import unary_union
        self._union = unary_union([Polygon(p) for p in polygons]) if polygons else None
        self._bounds = None if self._union is None else self._union.bounds

    def split(self, polygon) -> tuple[list, list] | None:
        """(on-pad parts, off-pad parts) of ``polygon``, each a list of
        exterior rings; None when it touches no pad."""
        from shapely.geometry import Polygon
        if self._union is None:
            return None
        poly = Polygon(polygon)
        x0, z0, x1, z1 = poly.bounds
        b = self._bounds
        if not (b[0] <= x1 and x0 <= b[2] and b[1] <= z1 and z0 <= b[3]):
            return None
        on = poly.intersection(self._union)
        if on.is_empty or on.area <= 0.0:
            return None

        def rings(geom):
            parts = getattr(geom, "geoms", [geom])
            return [list(g.exterior.coords)[:-1] for g in parts
                    if g.geom_type == "Polygon" and g.area > 1e-6]
        return rings(on), rings(poly.difference(self._union))

    def pad_side(self, points, reach_m: float) -> list:
        """The pad points nearest each of ``points`` that lies on a pad or
        within ``reach_m`` of one: the pad side of a piece laid along a pad
        edge."""
        from shapely.geometry import Point
        from shapely.ops import nearest_points
        if self._union is None:
            return []
        out = []
        for x, z in points:
            pt = Point(x, z)
            if self._union.distance(pt) <= reach_m:
                got = nearest_points(self._union, pt)[0]
                out.append((got.x, got.y))
        return out


def retaining_sill_m(height_at, index: "PadIndex | None", samples, pivot,
                     top_m: float, reach_m: float = RETAIN_REACH_M) -> float | None:
    """The yard-gate sill of a retaining-wall piece (0101 rule 10, planner
    2026-09-26): measured on the pad side against the padded ground, where
    the wall's top course must meet the pad: how far its placed top ``top_m``
    falls short of the padded ground at the pad point nearest its pivot (0
    when the top reaches or stands above it; the drop it retains below is its
    job, not a gap). None when no footprint sample lies within ``reach_m``
    (R1's reach) of a pad: the ordinary sill applies."""
    if index is None or not index.pad_side(samples, reach_m):
        return None
    near = index.pad_side([pivot], float("inf"))
    if not near:
        return None
    return max(0.0, height_at(*near[0]) - float(top_m))


def padded_slope_deg(height_at, index: PadIndex, polygon, grid_slope,
                     probe: float = 0.5) -> float | None:
    """97 B3 on patched ground (0101): where ``polygon`` touches a pad of
    ``index``, the steeper of the padded surface ``height_at`` under the
    part on the pad (`surface_slope_deg`, its samples kept ``probe`` inside
    the pad so the probe never reads the blend) and ``grid_slope`` (the
    caller's analysis grid, a callable on a ring) under the part off every
    pad; None where it touches none, so the caller reads its grid alone.
    One rule for the compile (`PaddedSurvey`), the workbench
    (`PaddedGround`) and the yard gate."""
    from shapely.geometry import Polygon
    parts = index.split(polygon)
    if parts is None:
        return None
    on, off = parts
    worst = 0.0
    for ring in on:
        inner = Polygon(ring).buffer(-probe, join_style=2)
        for g in getattr(inner, "geoms", [inner]):
            if g.geom_type == "Polygon" and not g.is_empty:
                worst = max(worst, surface_slope_deg(height_at, list(g.exterior.coords)[:-1],
                                                     probe=probe))
    for ring in off:
        worst = max(worst, grid_slope(ring))
    return worst


def pad_edges(polygon, datum: float, height_at, step: float = PAD_SAMPLE_STEP_M,
              out_m: float = 0.25) -> list[dict]:
    """R1: every edge of the pad polygon with its worst fill or cut against
    the ground just beyond it (``out_m`` outside the edge, every ``step``)."""
    from shapely.geometry import Polygon
    ring = [(float(x), float(z)) for x, z in polygon]
    ccw = Polygon(ring).exterior.is_ccw
    edges = []
    for i, (a, b) in enumerate(zip(ring, ring[1:] + ring[:1])):
        dx, dz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dz)
        if length < 1e-6:
            continue
        # outward normal: right of the edge for a counter-clockwise ring
        nx, nz = (dz / length, -dx / length) if ccw else (-dz / length, dx / length)
        n = max(2, int(length // step) + 1)
        fill = cut = 0.0
        for k in range(n):
            t = k / (n - 1)
            g = height_at(a[0] + dx * t + nx * out_m, a[1] + dz * t + nz * out_m)
            fill, cut = max(fill, datum - g), max(cut, g - datum)
        edges.append({"edge": i, "fromM": [round(a[0], 2), round(a[1], 2)],
                      "toM": [round(b[0], 2), round(b[1], 2)], "lengthM": round(length, 2),
                      "fillM": round(max(fill, 0.0), 3), "cutM": round(max(cut, 0.0), 3),
                      "needsWall": max(fill, cut) > RETAIN_BAR_M})
    return edges


def declare_order(patches: list[dict], shape=(4033, 4033)) -> None:
    """Fill each settlement pad's `after` (invariant 5) with every patch
    earlier in (order, id) whose region meets it; pads come last (order 3,
    above every other kind), so no other patch's `after` changes."""
    from . import terrain_patches as tp
    ranked = tp.ordered(patches)
    boxes = {p["id"]: tp.region_box(p, shape) for p in ranked}
    for i, p in enumerate(ranked):
        if p["kind"] != "settlement-pad":
            continue
        p["after"] = sorted(q["id"] for q in ranked[:i] if tp._intersects(boxes[q["id"]], boxes[p["id"]]))


def patched_height_at(survey, overlays: list[dict]):
    """The survey's `height_at` with a place's bundle ``groundOverlays`` pads
    applied (the yard gates; decision 0102): the overlay maths at the exact
    point, the surface the runtime draws."""
    from . import pad_overlay
    return pad_overlay.ground(survey.height_at, overlays)
