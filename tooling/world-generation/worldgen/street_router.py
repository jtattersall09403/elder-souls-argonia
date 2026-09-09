"""Route a blueprint's ways over the real ground (owner ruling 2026-09-05).

The owner looked at the exemplar blueprints and saw streets, boardwalks and
lanes drawn as straight lines between squared-off corners. Real lanes are not
drawn, they are *worn*: they take the dry line, the gentle grade, the gap
between two houses. So a way is authored as intent — `via` waypoints, a
`widthM`, an `endsAt` and a `why` — and its `points` polyline is DERIVED here,
exactly as a parcel's `footprint` is derived from its measured kit piece by
`blueprint_footprints`. `points` is never hand-edited; the validator recomputes
it and fails on drift.

THE CULTURAL SWITCH (`routing`)
-------------------------------
* ``"straight"`` — the surveyed line. An Imperial road, a laid-out quay, a
  planned grid: cultures that *survey* build straight and cut the ground to
  suit. The `via` polyline passes through unchanged.
* ``"arc"``      — a smooth curve through the waypoints (Catmull–Rom, sampled
  every ~2 m). A sweep round a bay, a curved terrace: authored shape, softened.
* ``"terrain"``  — the worn line. A* between consecutive waypoints on a local
  1 m grid, least cost over the actual heights, water and buildings. This is
  the default for Argonian tracks, village lanes and reed boardwalks.

FENCES AND WALLS (owner ruling 2026-09-08)
------------------------------------------
The owner looked at the exemplars and saw the same fault in the enclosure that
the streets used to have: walls drawn as ruled lines, and Lilmoth's estuary
pole wall lying across the shoreline instead of standing in it. So a fence is
routed by the same A* over the same survey, with the costs a WALL cares about
rather than the ones a lane cares about. The class is on the entry
(`fences[].class`, one of pole-wall | curtain | palisade | fence | ring-panel)
and it picks the profile in `FENCE_PROFILES`:

  * **contour** — a wall is built along a height band, not up and over one, so
    the climb term is on |Δheight| per step (K_FENCE_CONTOUR), not on grade².
  * **the outer edge of the built hull** — an enclosing class (pole-wall,
    curtain, palisade) is cheap in the band from the parcels' convex hull to
    `FENCE_HULL_BAND_M` beyond it, and dear well inside it: a wall runs round
    the yards, not through them. `fence` and `ring-panel` are interior work
    (a pen line, a panel plugging one gap in a ring of dwellings) and carry no
    hull preference. Water is never a yard, so the hull terms apply on dry
    cells only.
  * **dry ground, unless the lore drives poles** — water costs
    ×FENCE_WATER_PENALTY unless the entry declares `waterOk: {maxDepthM}`.
    With `waterOk` the sense flips as it does for a boardwalk: dry ground costs
    ×FENCE_DRY_PENALTY_WET, water within `maxDepthM` is free and water deeper
    than that is ×FENCE_DEEP_PENALTY — a driven pole stands where a pole can
    be driven. Depth is read from the survey's `water_depth_m`; a survey stub
    without one treats wet cells as `UNKNOWN_DEPTH_M`.
  * **ways** — crossing another way costs ×FENCE_WAY_PENALTY within its half
    width, EXCEPT the way ids the entry lists in `gapAt`: those are the gate,
    the opening, the place the wall is meant to be broken.

`points` are then quantised into runs of the wall's own module — the long axis
of the measured piece in ``<kit>.footprints.json`` (a connectors file, when the
pipeline publishes one, would be read in preference) — so every straight run is
a whole number of modules and the bends are where corner pieces go. `moduleM`
is written back onto the entry as derived data. A `straight` fence keeps its
surveyed line exactly (that is what `straight` means, and it is allowed only
with a `routingWhy`), so quantisation applies to `terrain` and `arc` fences.

THE COST MODEL (terrain routing)
--------------------------------
Cost of a step from cell a to cell b, in "effective metres":

    step   = 1 m (orthogonal) or √2 m (diagonal)
    grade  = |Δheight| / step                     — the climb along the step
    cross  = |Δheight across the step| / 2 m      — the side-slope at b
    cost   = step × (1 + K_SLOPE·grade² + K_CROSS·cross²) × cell(b)
             + turn penalty (TURN_M per 45° of direction change)

`cell(b)` multiplies in the things a path should keep away from:

  * **parcels** — inside any parcel footprint costs ×PARCEL_PENALTY (a lane
    does not run through a house). A parcel the way `endsAt` is only
    ×ENDS_PARCEL_PENALTY, because the way is meant to arrive there; its
    terminal point is snapped onto that parcel's edge, so the path touches the
    building without entering it (what `blueprint_integration` allows).
  * **water** — for a road/track/footpath/stair/ramp, water costs
    ×WATER_PENALTY_DRY_WAY: short fords survive, a long crossing never wins,
    which is the same rule `blueprint_integration.ROAD_WATER_MAX_M` enforces.
    For a **boardwalk, pier, canal or channel the sense flips**: water is free
    and dry ground costs ×DRY_PENALTY_WET_WAY, because a boardwalk exists in
    order to cross wet ground and a channel is a line *in* the water.
  * **another way of the same class** — running within NEIGHBOUR_M of another
    route (or another boardwalk) costs ×NEIGHBOUR_PENALTY, so two boardwalks
    do not converge into one drawn-twice line (integration's `way-overlap`).

The turn penalty is the "gentle straightness preference": with no reason to
bend, the cheapest line is the straight one, and each 45° of wiggle has to buy
itself back in slope or dryness. The A* heuristic is plain Euclidean distance
(admissible: every multiplier is ≥ 1), and the frontier breaks ties on
(cost, row, col, direction), so the result is deterministic.

The neighbour mask is built from the other ways' **`via`** polylines, never
their derived `points` — otherwise routing would depend on the order ways were
applied in, and a second `--apply` could give a different answer.

Finally the polyline is simplified (Douglas–Peucker, SIMPLIFY_M) and rounded to
UV_ROUND, so a way carries a handful of meaningful vertices rather than a
thousand grid steps.

Run (from tooling/world-generation/), after `blueprint_footprints --apply`:

    python3 -m worldgen.street_router --apply <blueprint.json> [...]
    python3 -m worldgen.street_router --check <blueprint.json> [...]
"""

from __future__ import annotations

import argparse
import hashlib
import heapq
import json
import math
import sys
from pathlib import Path

from .blueprint_footprints import UV_ROUND, _indent_of
from .scale import PROVINCE_EXTENT_M

WAY_KEYS = ("routes", "canals", "boardwalks", "fences")
WET_KINDS = {"boardwalk", "pier", "canal", "channel"}

CELL_M = 1.0
MARGIN_M = 30.0
K_SLOPE = 24.0                  # cost of climbing: ×grade²
K_CROSS = 6.0                   # cost of a side-slope: ×cross-grade²
TURN_M = 1.2                    # effective metres per 45° of direction change
#: A parcel a way does not `endsAt` is IMPASSABLE, not merely expensive.
#:
#: This was 120.0 — a strong cost, but a cost, so a way whose detour was dearer
#: still went straight through a house. The integration validator then rejected
#: it outright ("a way may only touch a building it endsAt"), which is one rule
#: with two implementations: a soft one in the router and a hard one in the
#: check. Found 2026-09-09 when a chain stage re-derived every way against
#: re-carved ground and three of the five exemplars produced a route through a
#: building at once.
#:
#: A very large FINITE cost, not infinity: with an infinite multiplier every
#: candidate cost becomes inf, A* can no longer order them, and the search
#: reports success on a path that still goes through the house (measured
#: 2026-09-09 — three of five exemplars crossed a building while the router
#: said OK). A million makes any detour that exists cheaper than crossing, so
#: the router goes round wherever it can, and where it genuinely cannot the
#: crossing survives to be caught by the integration check with the way and the
#: building named — which is a finding a person can act on.
PARCEL_PENALTY = 1.0e6
ENDS_PARCEL_PENALTY = 8.0
WATER_PENALTY_DRY_WAY = 40.0    # a road may ford, never swim
DRY_PENALTY_WET_WAY = 1.6       # a boardwalk on dry ground is a wasted boardwalk
NEIGHBOUR_M = 1.5
NEIGHBOUR_PENALTY = 4.0
ARC_SAMPLE_M = 2.0
SIMPLIFY_M = 0.6
SNAP_MAX_M = 30.0               # how far a terminal waypoint may be pulled onto its endsAt
MATCH_TOLERANCE_M = 0.3
MAX_CELLS = 900_000             # a blueprint bigger than this is a plot, not a place

# --- fence/wall routing (owner ruling 2026-09-08) --------------------------- #
FENCE_CLASSES = ("pole-wall", "curtain", "palisade", "fence", "ring-panel")
# hug: the enclosing classes want the outer edge of the built hull.
FENCE_PROFILES = {
    "pole-wall":  {"hug": True,  "contour": 1.0},
    "curtain":    {"hug": True,  "contour": 0.6},   # surveyed masonry cuts the ground a little
    "palisade":   {"hug": True,  "contour": 1.0},
    "fence":      {"hug": False, "contour": 1.0},
    "ring-panel": {"hug": False, "contour": 1.0},
}
K_FENCE_CONTOUR = 6.0           # cost of crossing a height band: ×(|Δh| / FENCE_BAND_M)²
FENCE_BAND_M = 0.5              # the height band a wall run is built along
FENCE_TURN_M = 0.6              # a wall bends more readily than a lane wears a corner
FENCE_HULL_BAND_M = 4.0         # the built hull, buffered: where an enclosing wall stands
FENCE_INSIDE_PENALTY = 5.0      # well inside the hull: a wall does not run through the yards
FENCE_OUTSIDE_PENALTY = 2.5     # far outside it: a wall that encloses nothing
FENCE_PARCEL_PENALTY = 400.0    # a wall may not cross a building (HARD in the validator)
FENCE_WATER_PENALTY = 60.0      # dry ground unless the entry declares waterOk
FENCE_DRY_PENALTY_WET = 1.6     # a pole wall on dry land is not the wall the lore describes
FENCE_DEEP_PENALTY = 200.0      # deeper than maxDepthM: no pole can be driven
FENCE_WAY_PENALTY = 90.0        # crossing a way that is not a declared gapAt opening
UNKNOWN_DEPTH_M = 0.6           # wet cell, survey with no depth grid (stubs and fixtures)
MODULE_MIN_M = 0.25             # below this a "module" is a stake, and quantising is noise

_HEIGHT_CACHE: dict = {}

_OFFSETS = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))


def _survey_cache_token(survey):
    """Return a safe raster identity, or ``None`` for mutable surveys.

    Production surveys expose read-only NumPy fields, so object identity is a
    valid content identity for their lifetime. Tests/tools with mutable lists
    are deliberately uncached unless they expose and maintain an explicit
    ``routing_cache_token`` revision. This keeps the speed-up without letting
    an in-place raster edit reuse stale paths.
    """
    explicit = getattr(survey, "routing_cache_token", None)
    if explicit is not None:
        return (id(survey), explicit)
    for name in ("height_grid", "open_water"):
        value = getattr(survey, name, None)
        flags = getattr(value, "flags", None)
        if flags is None or bool(flags.writeable):
            return None
    return id(survey)


# --------------------------------------------------------------------------- #
# survey sampling (duck-typed: height_grid, open_water, grid_px_m, grid_n)
# --------------------------------------------------------------------------- #
def _extent_m(survey) -> float:
    return float(getattr(survey, "extent_m", PROVINCE_EXTENT_M))


def sample_height_m(survey, x: float, z: float) -> float:
    """Bilinear height at world metres (x east, z south)."""
    grid = survey.height_grid
    n = len(grid)
    px = float(survey.grid_px_m)
    gx = min(max(x / px - 0.5, 0.0), n - 1.0)
    gz = min(max(z / px - 0.5, 0.0), n - 1.0)
    c0, r0 = int(gx), int(gz)
    c1, r1 = min(c0 + 1, n - 1), min(r0 + 1, n - 1)
    tx, tz = gx - c0, gz - r0
    h00 = float(grid[r0][c0]); h01 = float(grid[r0][c1])
    h10 = float(grid[r1][c0]); h11 = float(grid[r1][c1])
    return (h00 * (1 - tx) + h01 * tx) * (1 - tz) + (h10 * (1 - tx) + h11 * tx) * tz


def sample_depth_m(survey, x: float, z: float) -> float:
    """Standing water depth at world metres, 0.0 on dry ground.

    Reads the survey's `water_depth_m` raster (its own resolution, which is not
    the hydrology grid's). A duck-typed survey without one — the test stubs —
    reports UNKNOWN_DEPTH_M wherever `open_water` is set, so a `waterOk` fence
    still routes deterministically without the published rasters."""
    grid = getattr(survey, "water_depth_m", None)
    if grid is None:
        return UNKNOWN_DEPTH_M if sample_water(survey, x, z) else 0.0
    n = len(grid)
    px = _extent_m(survey) / n
    col = min(max(int(x / px), 0), n - 1)
    row = min(max(int(z / px), 0), n - 1)
    return float(grid[row][col])


def sample_water(survey, x: float, z: float) -> bool:
    """Open water in the BASE season — water that is there all year.

    `survey.open_water` is a MEASURED mask (signed depth > 0.5 m). It used to
    be `region in {ocean, lake} OR depth > 0.5`, and the class half of that OR
    is why a berth 91 m from usable water once passed a 10 m wet-join rule.
    """
    return _sample_mask(survey, survey.open_water, x, z)


def _sample_mask(survey, grid, x: float, z: float) -> bool:
    n = len(grid)
    px = float(survey.grid_px_m)
    col = min(max(int(x / px), 0), n - 1)
    row = min(max(int(z / px), 0), n - 1)
    return bool(grid[row][col])


def sample_wet_season_water(survey, x: float, z: float) -> bool:
    """Standing water at the SEASONAL MAXIMUM — what a built thing must clear.

    A wall or a floor is judged against the wet season, not the dry one: a
    house must not stand in water four months a year. A duck-typed survey
    without the seasonal field (the test stubs) falls back to the base mask.
    """
    grid = getattr(survey, "wet_season_grid", None)
    if grid is None:
        return sample_water(survey, x, z)
    return _sample_mask(survey, grid, x, z)


def sample_wet_season_depth_m(survey, x: float, z: float) -> float:
    """Standing depth at the SEASONAL MAXIMUM, 0.0 where it never floods.

    This is what `waterOk.maxDepthM` is judged against, so a record declares
    the worst water it actually stands in rather than the calmest.
    """
    grid = getattr(survey, "wet_season_depth_m", None)
    if grid is None:
        return sample_depth_m(survey, x, z)
    n = len(grid)
    px = _extent_m(survey) / n
    col = min(max(int(x / px), 0), n - 1)
    row = min(max(int(z / px), 0), n - 1)
    return max(float(grid[row][col]), 0.0)


# --------------------------------------------------------------------------- #
# small geometry helpers
# --------------------------------------------------------------------------- #
def _point_in_poly(x: float, z: float, poly: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]
        xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-30) + xi:
            inside = not inside
        j = i
    return inside


def _nearest_on_segment(p, a, b):
    ax, az = a
    bx, bz = b
    dx, dz = bx - ax, bz - az
    d2 = dx * dx + dz * dz
    if d2 <= 1e-12:
        return (ax, az)
    t = ((p[0] - ax) * dx + (p[1] - az) * dz) / d2
    t = min(max(t, 0.0), 1.0)
    return (ax + t * dx, az + t * dz)


def _nearest_on_polyline(p, pts, closed: bool = False):
    best, best_d = None, float("inf")
    n = len(pts)
    last = n if closed else n - 1
    for i in range(last):
        q = _nearest_on_segment(p, pts[i], pts[(i + 1) % n])
        d = math.hypot(q[0] - p[0], q[1] - p[1])
        if d < best_d:
            best, best_d = q, d
    return best, best_d


def _dist_point_polyline(p, pts) -> float:
    _q, d = _nearest_on_polyline(p, pts)
    return d


def convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Monotone chain hull, counter-clockwise, no repeated last point."""
    pts = sorted(set((round(x, 4), round(z, 4)) for x, z in points))
    if len(pts) < 3:
        return pts

    def half(seq):
        out: list[tuple[float, float]] = []
        for p in seq:
            while len(out) >= 2:
                (ax, az), (bx, bz) = out[-2], out[-1]
                if (bx - ax) * (p[1] - az) - (bz - az) * (p[0] - ax) > 0:
                    break
                out.pop()
            out.append(p)
        return out

    return half(pts)[:-1] + half(reversed(pts))[:-1]


def built_hull(bp: dict, extent_m: float) -> list[tuple[float, float]]:
    """The convex hull of every parcel footprint, in metres — the built edge a
    wall is measured against (the same hull `blueprint` reports density on)."""
    pts: list[tuple[float, float]] = []
    for p in bp.get("parcels") or []:
        for q in p.get("footprint") or []:
            pts.append((float(q[0]) * extent_m, float(q[1]) * extent_m))
    return convex_hull(pts)


def quantise_to_module(pts_m: list[tuple[float, float]], module_m: float
                       ) -> list[tuple[float, float]]:
    """Snap each straight run to a whole number of wall modules.

    The first vertex is the wall's start; every following segment keeps its
    direction and takes the nearest whole number of modules of length (at least
    one). A run is then a chain of straight modules and each retained vertex is
    a corner piece."""
    if module_m < MODULE_MIN_M or len(pts_m) < 2:
        return list(pts_m)
    out = [pts_m[0]]
    for b in pts_m[1:]:
        ax, az = out[-1]
        dx, dz = b[0] - ax, b[1] - az
        length = math.hypot(dx, dz)
        if length <= 1e-9:
            continue
        n = max(1, int(round(length / module_m)))
        snapped = n * module_m
        out.append((ax + dx / length * snapped, az + dz / length * snapped))
    return out


def douglas_peucker(pts: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    if len(pts) <= 2:
        return list(pts)
    a, b = pts[0], pts[-1]
    worst_i, worst_d = 0, -1.0
    for i in range(1, len(pts) - 1):
        q = _nearest_on_segment(pts[i], a, b)
        d = math.hypot(pts[i][0] - q[0], pts[i][1] - q[1])
        if d > worst_d:
            worst_i, worst_d = i, d
    if worst_d <= eps:
        return [a, b]
    left = douglas_peucker(pts[:worst_i + 1], eps)
    right = douglas_peucker(pts[worst_i:], eps)
    return left[:-1] + right


def catmull_rom(via_m: list[tuple[float, float]], sample_m: float = ARC_SAMPLE_M):
    """Smooth curve through every waypoint (uniform Catmull–Rom, ends doubled)."""
    if len(via_m) < 3:
        return list(via_m)
    pts = [via_m[0]] + list(via_m) + [via_m[-1]]
    out: list[tuple[float, float]] = [via_m[0]]
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        seg = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        steps = max(2, int(math.ceil(seg / sample_m)))
        for s in range(1, steps + 1):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append((
                0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
                       + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
                       + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
            ))
    return out


# --------------------------------------------------------------------------- #
# the local cost field
# --------------------------------------------------------------------------- #
class LocalField:
    """A 1 m grid over the blueprint's boundary bbox + margin, with the cell
    multipliers a way of this class must respect."""

    def __init__(self, way: dict, bp: dict, survey, cell_m: float = CELL_M,
                 is_fence: bool = False):
        self.survey = survey
        self.is_fence = bool(is_fence)
        self.profile = FENCE_PROFILES.get(str(way.get("class")), FENCE_PROFILES["fence"])
        self.extent_m = _extent_m(survey)
        self.cell_m = cell_m
        pts_uv: list[list[float]] = list(bp.get("boundary") or [])
        for key in WAY_KEYS:
            for w in bp.get(key) or []:
                pts_uv += list(w.get("via") or [])
        for p in bp.get("parcels") or []:
            pts_uv += list(p.get("footprint") or [])
            if isinstance(p.get("centreUV"), list):
                pts_uv.append(p["centreUV"])
        xs = [float(p[0]) * self.extent_m for p in pts_uv]
        zs = [float(p[1]) * self.extent_m for p in pts_uv]
        self.x0 = min(xs) - MARGIN_M
        self.z0 = min(zs) - MARGIN_M
        self.w = int(math.ceil((max(xs) + MARGIN_M - self.x0) / cell_m)) + 1
        self.h = int(math.ceil((max(zs) + MARGIN_M - self.z0) / cell_m)) + 1
        if self.w * self.h > MAX_CELLS:
            raise ValueError(f"street_router: local grid {self.w}×{self.h} is too big "
                             f"for a settlement blueprint (boundary spans too much ground)")

        # heights do not depend on the way, so every way in one blueprint
        # shares the sampled block (the router is called once per way)
        survey_token = _survey_cache_token(survey)
        key = (survey_token, round(self.x0, 3), round(self.z0, 3), self.w, self.h, cell_m)
        if survey_token is None:
            self.height = [[sample_height_m(survey, *self.xz(r, c))
                            for c in range(self.w)] for r in range(self.h)]
        else:
            if _HEIGHT_CACHE.get("key") != key:
                _HEIGHT_CACHE["key"] = key
                _HEIGHT_CACHE["grid"] = [[sample_height_m(survey, *self.xz(r, c))
                                          for c in range(self.w)] for r in range(self.h)]
            self.height = _HEIGHT_CACHE["grid"]
        wet = self._is_wet_way(way)
        ends = set(way.get("endsAt") or [])

        parcels: list[tuple[list[tuple[float, float]], float]] = []
        for p in bp.get("parcels") or []:
            fp = p.get("footprint")
            if not fp:
                continue
            poly = [(float(q[0]) * self.extent_m, float(q[1]) * self.extent_m) for q in fp]
            # bbox is carried alongside the polygon purely to skip the ray cast
            # for cells that cannot possibly be inside it: an exact prefilter,
            # never a change to which cells are penalised.
            bx = [q[0] for q in poly]; bz = [q[1] for q in poly]
            parcels.append((poly, ENDS_PARCEL_PENALTY if p.get("id") in ends else PARCEL_PENALTY,
                            (min(bx), min(bz), max(bx), max(bz))))

        if self.is_fence:
            self._build_fence_field(way, bp, survey, parcels)
            return

        neighbours: list[list[tuple[float, float]]] = []
        for key in WAY_KEYS:
            if key == "fences" or not self._same_class(way, key, bp):
                continue
            for w in bp.get(key) or []:
                if w.get("id") == way.get("id"):
                    continue
                via = [(float(q[0]) * self.extent_m, float(q[1]) * self.extent_m)
                       for q in (w.get("via") or [])]
                if len(via) >= 2:
                    nx = [q[0] for q in via]; nz = [q[1] for q in via]
                    neighbours.append((via, (min(nx) - NEIGHBOUR_M, min(nz) - NEIGHBOUR_M,
                                             max(nx) + NEIGHBOUR_M, max(nz) + NEIGHBOUR_M)))

        self.mult = [[1.0] * self.w for _ in range(self.h)]
        for r in range(self.h):
            for c in range(self.w):
                x, z = self.xz(r, c)
                m = 1.0
                water = sample_water(survey, x, z)
                if wet:
                    if not water:
                        m *= DRY_PENALTY_WET_WAY
                elif water:
                    m *= WATER_PENALTY_DRY_WAY
                for poly, pen, (bx0, bz0, bx1, bz1) in parcels:
                    if bx0 <= x <= bx1 and bz0 <= z <= bz1 and _point_in_poly(x, z, poly):
                        m *= pen
                        break
                for nb, (nx0, nz0, nx1, nz1) in neighbours:
                    if (nx0 <= x <= nx1 and nz0 <= z <= nz1
                            and _dist_point_polyline((x, z), nb) <= NEIGHBOUR_M):
                        m *= NEIGHBOUR_PENALTY
                        break
                self.mult[r][c] = m

    # ------------------------------------------------------------- fences --
    def _build_fence_field(self, way: dict, bp: dict, survey, parcels) -> None:
        """The wall's cost field: the built hull's outer edge, dry ground (or
        the declared shallows), and the ways it may not cross."""
        water_ok = way.get("waterOk") if isinstance(way.get("waterOk"), dict) else None
        max_depth = float(water_ok.get("maxDepthM", 0.0)) if water_ok else 0.0
        hug = bool(self.profile["hug"])
        hull = built_hull(bp, self.extent_m) if hug else []
        gaps = {g for g in (way.get("gapAt") or []) if isinstance(g, str)}

        crossings: list[tuple[list[tuple[float, float]], float, tuple]] = []
        for key in ("routes", "canals", "boardwalks"):
            for w in bp.get(key) or []:
                if w.get("id") in gaps:
                    continue
                via = [(float(q[0]) * self.extent_m, float(q[1]) * self.extent_m)
                       for q in (w.get("via") or [])]
                if len(via) < 2:
                    continue
                half = max(float(w.get("widthM") or 1.0) / 2.0, 0.5)
                nx = [q[0] for q in via]; nz = [q[1] for q in via]
                crossings.append((via, half, (min(nx) - half, min(nz) - half,
                                              max(nx) + half, max(nz) + half)))

        self.mult = [[1.0] * self.w for _ in range(self.h)]
        for r in range(self.h):
            for c in range(self.w):
                x, z = self.xz(r, c)
                m = 1.0
                # a wall is judged against the WET SEASON: it has to stand
                # wherever the water reaches, not only where it sits in March
                wet = sample_wet_season_water(survey, x, z)
                if water_ok:
                    if not wet:
                        m *= FENCE_DRY_PENALTY_WET
                    elif sample_wet_season_depth_m(survey, x, z) > max_depth:
                        m *= FENCE_DEEP_PENALTY
                elif wet:
                    m *= FENCE_WATER_PENALTY
                if hug and not wet and len(hull) >= 3:
                    inside = _point_in_poly(x, z, hull)
                    d = _dist_point_polyline((x, z), hull + [hull[0]])
                    if inside and d > FENCE_HULL_BAND_M:
                        m *= FENCE_INSIDE_PENALTY
                    elif not inside and d > FENCE_HULL_BAND_M:
                        m *= FENCE_OUTSIDE_PENALTY
                for poly, _pen, (bx0, bz0, bx1, bz1) in parcels:
                    if bx0 <= x <= bx1 and bz0 <= z <= bz1 and _point_in_poly(x, z, poly):
                        m *= FENCE_PARCEL_PENALTY
                        break
                for via, half, (nx0, nz0, nx1, nz1) in crossings:
                    if (nx0 <= x <= nx1 and nz0 <= z <= nz1
                            and _dist_point_polyline((x, z), via) <= half):
                        m *= FENCE_WAY_PENALTY
                        break
                self.mult[r][c] = m

    @staticmethod
    def _is_wet_way(way: dict) -> bool:
        return str(way.get("kind")) in WET_KINDS

    @staticmethod
    def _same_class(way: dict, key: str, bp: dict) -> bool:
        """Ways of the same class keep apart. Routes and boardwalks are both
        walked, so they count as one class for this purpose; canals are their
        own (a lane beside a canal is normal)."""
        walked = str(way.get("kind")) not in {"canal", "channel"}
        return (key in ("routes", "boardwalks")) if walked else (key == "canals")

    def xz(self, r: int, c: int) -> tuple[float, float]:
        return self.x0 + (c + 0.5) * self.cell_m, self.z0 + (r + 0.5) * self.cell_m

    def rc(self, x: float, z: float) -> tuple[int, int]:
        r = min(max(int((z - self.z0) / self.cell_m), 0), self.h - 1)
        c = min(max(int((x - self.x0) / self.cell_m), 0), self.w - 1)
        return r, c

    def height_rc(self, r: int, c: int) -> float:
        return self.height[min(max(r, 0), self.h - 1)][min(max(c, 0), self.w - 1)]

    # ----------------------------------------------------------------- A* --
    def astar(self, start: tuple[int, int], goal: tuple[int, int]) -> list[tuple[int, int]]:
        if start == goal:
            return [start]
        gh, gw = self.h, self.w
        gr, gc = goal
        cell = self.cell_m

        def heur(r: int, c: int) -> float:
            return math.hypot(r - gr, c - gc) * cell

        start_state = (start[0], start[1], -1)
        dist = {start_state: 0.0}
        prev: dict = {}
        heap = [(heur(*start), 0.0, start[0], start[1], -1)]
        while heap:
            _f, d, r, c, di = heapq.heappop(heap)
            state = (r, c, di)
            if d > dist.get(state, float("inf")):
                continue
            if (r, c) == goal:
                path = [(r, c)]
                while state in prev:
                    state = prev[state]
                    path.append((state[0], state[1]))
                path.reverse()
                return path
            h_here = self.height[r][c]
            for k, (dr, dc) in enumerate(_OFFSETS):
                nr, nc = r + dr, c + dc
                if not (0 <= nr < gh and 0 <= nc < gw):
                    continue
                step = cell * (1.4142135623730951 if dr and dc else 1.0)
                dh = self.height[nr][nc] - h_here
                if self.is_fence:
                    # a wall follows the contour: the cost is the height band
                    # it crosses, not the grade it climbs
                    band = abs(dh) / FENCE_BAND_M
                    terrain = 1.0 + K_FENCE_CONTOUR * self.profile["contour"] * band * band
                    turn_m = FENCE_TURN_M
                else:
                    grade = abs(dh) / step
                    # side-slope at the destination, measured across the step
                    px, pz = -dc, dr
                    cross = abs(self.height_rc(nr + pz, nc + px)
                                - self.height_rc(nr - pz, nc - px)) / (2.0 * step)
                    terrain = 1.0 + K_SLOPE * grade * grade + K_CROSS * cross * cross
                    turn_m = TURN_M
                turn = 0.0
                if di >= 0:
                    turn = turn_m * _turn_steps(di, k)
                nd = d + step * terrain * self.mult[nr][nc] + turn
                nstate = (nr, nc, k)
                if nd < dist.get(nstate, float("inf")) - 1e-12:
                    dist[nstate] = nd
                    prev[nstate] = state
                    heapq.heappush(heap, (nd + heur(nr, nc), nd, nr, nc, k))
        return [start, goal]


_DIR_ANGLE = {i: math.atan2(dr, dc) for i, (dr, dc) in enumerate(_OFFSETS)}


def _turn_steps(a: int, b: int) -> float:
    """Direction change between two of the eight offsets, in 45° units."""
    d = abs(_DIR_ANGLE[a] - _DIR_ANGLE[b]) % (2 * math.pi)
    d = min(d, 2 * math.pi - d)
    return d / (math.pi / 4.0)


# --------------------------------------------------------------------------- #
# endsAt snapping
# --------------------------------------------------------------------------- #
def _targets(bp: dict, extent_m: float) -> dict:
    out: dict = {}
    for p in bp.get("parcels") or []:
        if p.get("footprint"):
            out[p.get("id")] = ("poly", [(float(q[0]) * extent_m, float(q[1]) * extent_m)
                                         for q in p["footprint"]])
    for d in bp.get("docks") or []:
        if isinstance(d.get("position"), list):
            out[d.get("id")] = ("point", (float(d["position"][0]) * extent_m,
                                          float(d["position"][1]) * extent_m))
    for lm in bp.get("landmarks") or []:
        if isinstance(lm.get("position"), list):
            out[lm.get("id")] = ("point", (float(lm["position"][0]) * extent_m,
                                           float(lm["position"][1]) * extent_m))
    return out


def snap_endpoints(way: dict, via_m: list[tuple[float, float]], bp: dict,
                   extent_m: float) -> list[tuple[float, float]]:
    """Pull the way's terminal waypoints onto what it `endsAt`: the nearest
    point on a parcel's footprint edge, or a dock/landmark position. Only a
    terminal within SNAP_MAX_M is pulled — an `endsAt` whose target is far from
    both ends is an authoring error for `blueprint_integration` to report, not
    something to paper over by dragging the way across the settlement."""
    ends = [e for e in (way.get("endsAt") or []) if isinstance(e, str)]
    if not ends or len(via_m) < 2:
        return via_m
    targets = _targets(bp, extent_m)
    via = list(via_m)
    free = {0, len(via) - 1}
    for ref in ends:
        target = targets.get(ref)
        if target is None or not free:
            continue
        kind, geom = target
        best_i, best_pt, best_d = None, None, float("inf")
        for i in sorted(free):
            if kind == "poly":
                pt, d = _nearest_on_polyline(via[i], geom, closed=True)
            else:
                pt, d = geom, math.hypot(via[i][0] - geom[0], via[i][1] - geom[1])
            if d < best_d:
                best_i, best_pt, best_d = i, pt, d
        if best_i is None or best_d > SNAP_MAX_M:
            # neither end is near this target: the author's waypoints, not the
            # snap, decide where the way goes (and integration will say so).
            continue
        via[best_i] = best_pt
        free.discard(best_i)
    return via


# --------------------------------------------------------------------------- #
# routing
# --------------------------------------------------------------------------- #
def _way_class(bp: dict, way: dict) -> str:
    for key in WAY_KEYS:
        for w in bp.get(key) or []:
            if w is way or w.get("id") == way.get("id"):
                return key
    return "routes"


_FIELD_CACHE: dict = {}
_FIELD_CACHE_MAX = 64
_ROUTE_CACHE: dict = {}
_ROUTE_CACHE_MAX = 128


def module_m(way: dict) -> float | None:
    """The wall module: the long axis of the measured piece, in metres.

    Read from the kit connectors file when the pipeline publishes one for this
    kit (the author's own snap length), else from the piece's measured ground
    hull in `<kit>.footprints.json`. None when the piece is not in the vault
    measurements (a schema-only checkout)."""
    ref = way.get("assetRef")
    if not isinstance(ref, str):
        return None
    from . import blueprint_footprints as bf
    lib = bf.library()
    kit = lib.kit_of.get(ref)
    if kit:
        conn = bf.KITS_DIR / f"{kit}.connectors.json"
        if conn.exists():
            faces = (json.loads(conn.read_text()).get("assets") or {}).get(ref) or []
            # the module is the span between the two OPPOSED connector faces:
            # what the author left for the next piece to butt against.
            span = 0.0
            for i, a in enumerate(faces):
                for b in faces[i + 1:]:
                    if abs(abs(float(a.get("normalDeg", 0)) - float(b.get("normalDeg", 0))) - 180.0) > 1.0:
                        continue
                    pa, pb = a.get("positionInPiece") or [0, 0], b.get("positionInPiece") or [0, 0]
                    span = max(span, math.hypot(float(pa[0]) - float(pb[0]),
                                                float(pa[1]) - float(pb[1])))
            if span > 0:
                return round(span, 3)
    record = lib.get(ref)
    if not record:
        return None
    long_axis = max(float(record.get("widthM") or 0.0), float(record.get("depthM") or 0.0))
    return round(long_axis, 3) if long_axis > 0 else None


def local_field(way: dict, bp: dict, survey, cell_m: float = CELL_M,
                is_fence: bool = False) -> "LocalField":
    """`LocalField(way, bp, survey)`, memoised on the inputs that determine it.

    A field is expensive (a cost multiplier per 1 m cell) and is rebuilt
    identically every time the same blueprint is validated — which the suites
    do many times over. The key is the full content the constructor reads, so
    any edit to the way, the boundary, the parcels or the sibling ways misses
    the cache; a *different* survey object misses it too. Read-only after
    construction, so sharing one is safe."""
    try:
        survey_token = _survey_cache_token(survey)
        if survey_token is None:
            return LocalField(way, bp, survey, cell_m, is_fence)
        key = (survey_token, cell_m, is_fence, json.dumps(
            [way, bp.get("boundary"), [(p.get("id"), p.get("footprint")) for p in bp.get("parcels") or []],
             [[(w.get("id"), w.get("kind"), w.get("via")) for w in bp.get(k) or []] for k in WAY_KEYS]],
            sort_keys=True, default=str))
    except (TypeError, ValueError):                     # noqa: BLE001 - uncacheable input
        return LocalField(way, bp, survey, cell_m, is_fence)
    field = _FIELD_CACHE.get(key)
    if field is None:
        if len(_FIELD_CACHE) >= _FIELD_CACHE_MAX:
            _FIELD_CACHE.clear()
        field = _FIELD_CACHE[key] = LocalField(way, bp, survey, cell_m, is_fence)
    return field


def _route_way_uncached(way: dict, bp: dict, survey=None) -> list[list[float]]:
    """Compute the derived `points` polyline for one way, in province UV."""
    extent_m = _extent_m(survey) if survey is not None else PROVINCE_EXTENT_M
    via = way.get("via") or []
    if len(via) < 2:
        return [[round(float(p[0]), UV_ROUND), round(float(p[1]), UV_ROUND)] for p in via]
    via_m = [(float(p[0]) * extent_m, float(p[1]) * extent_m) for p in via]
    via_m = snap_endpoints(way, via_m, bp, extent_m)

    routing = way.get("routing")
    is_fence = _way_class(bp, way) == "fences"
    if routing == "arc":
        pts_m = catmull_rom(via_m)
    elif routing == "terrain" and survey is not None:
        field = local_field(way, bp, survey, is_fence=is_fence)
        pts_m = []
        for a, b in zip(via_m, via_m[1:]):
            cells = field.astar(field.rc(*a), field.rc(*b))
            leg = [field.xz(r, c) for r, c in cells]
            leg[0], leg[-1] = a, b
            pts_m += leg if not pts_m else leg[1:]
    else:
        pts_m = via_m

    pts_m = douglas_peucker(pts_m, SIMPLIFY_M)
    if is_fence and routing != "straight":
        # a routed wall is built in its own module: whole modules between the
        # bends, and a corner piece at each bend (owner ruling 2026-09-08)
        mod = way.get("moduleM")
        if not isinstance(mod, (int, float)) or mod <= 0:
            mod = module_m(way)
        if isinstance(mod, (int, float)) and mod > 0:
            pts_m = quantise_to_module(pts_m, float(mod))
    out: list[list[float]] = []
    for x, z in pts_m:
        p = [round(x / extent_m, UV_ROUND), round(z / extent_m, UV_ROUND)]
        if not out or p != out[-1]:
            out.append(p)
    return out


def route_way(way: dict, bp: dict, survey=None) -> list[list[float]]:
    """Return the derived route, memoised on every input that can affect it.

    Schema validation, settlement compilation and integration checks commonly
    ask for the same terrain route in one process. ``local_field`` already
    avoids rebuilding its cost raster, but A* was still repeated each time.
    The full way and blueprint content make edits miss the cache; the retained
    survey object both distinguishes raster instances and prevents Python from
    reusing an object id while its entry is live. Callers always receive fresh
    point lists, so mutating a returned derivation cannot poison later checks.
    """
    if way.get("routing") != "terrain" or survey is None:
        return _route_way_uncached(way, bp, survey)
    try:
        content = json.dumps([way, bp], sort_keys=True, separators=(",", ":"),
                             ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError):                    # uncacheable fixture/input
        return _route_way_uncached(way, bp, survey)
    survey_token = _survey_cache_token(survey)
    if survey_token is None:
        return _route_way_uncached(way, bp, survey)
    key = (survey_token, hashlib.sha256(content).digest())
    hit = _ROUTE_CACHE.get(key)
    if hit is not None and hit[0] is survey:
        return [point[:] for point in hit[1]]
    result = _route_way_uncached(way, bp, survey)
    if len(_ROUTE_CACHE) >= _ROUTE_CACHE_MAX:
        _ROUTE_CACHE.clear()
    _ROUTE_CACHE[key] = (survey, [point[:] for point in result])
    return [point[:] for point in result]


# --------------------------------------------------------------------------- #
# apply / check
# --------------------------------------------------------------------------- #
def iter_ways(bp: dict):
    for key in WAY_KEYS:
        for w in bp.get(key) or []:
            yield key, w


def points_match(a, b, extent_m: float, tolerance_m: float = MATCH_TOLERANCE_M) -> bool:
    if not isinstance(a, list) or not isinstance(b, list) or len(a) != len(b):
        return False
    tol_uv = tolerance_m / extent_m
    return all(abs(float(p[0]) - float(q[0])) <= tol_uv and abs(float(p[1]) - float(q[1])) <= tol_uv
               for p, q in zip(a, b))


def apply_to_blueprint(bp: dict, survey=None) -> list[str]:
    problems: list[str] = []
    for key, way in iter_ways(bp):
        try:
            if key == "fences":
                mod = module_m(way)
                if mod is not None:
                    way["moduleM"] = mod
            way["points"] = route_way(way, bp, survey)
        except Exception as exc:                       # noqa: BLE001 — reported, not raised
            problems.append(f"{key} {way.get('id')}: {exc}")
    return problems


def check_blueprint(bp: dict, survey=None) -> list[str]:
    """Ways whose stored `points` are not the router's derivation."""
    extent_m = _extent_m(survey) if survey is not None else PROVINCE_EXTENT_M
    problems: list[str] = []
    for key, way in iter_ways(bp):
        if way.get("routing") == "terrain" and survey is None:
            continue                                    # cannot derive without ground
        try:
            derived = route_way(way, bp, survey)
        except Exception as exc:                        # noqa: BLE001
            problems.append(f"{key} {way.get('id')}: {exc}")
            continue
        if not points_match(way.get("points"), derived, extent_m):
            problems.append(
                f"{key} {way.get('id')}: points are not the derived route (routing="
                f"{way.get('routing')!r}) — run 'python3 -m worldgen.street_router "
                f"--apply <file>'")
    return problems


_SURVEY_CACHE: list = [None]


def default_survey():
    """The province survey, loaded once per process. Returns None if the
    published rasters are not in this checkout (schema-only checks still run)."""
    if _SURVEY_CACHE[0] is None:
        try:
            from .site_fields import ProvinceSurvey
            _SURVEY_CACHE[0] = ProvinceSurvey()
        except Exception:                               # noqa: BLE001
            _SURVEY_CACHE[0] = False
    return _SURVEY_CACHE[0] or None


def apply_to_file(path: Path, survey=None) -> list[str]:
    text = path.read_text()
    data = json.loads(text)
    problems = apply_to_blueprint(data.get("blueprint", {}), survey)
    path.write_text(json.dumps(data, indent=_indent_of(text)) + "\n")
    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="rewrite every way's points in place")
    ap.add_argument("--check", action="store_true", help="report ways whose points have drifted")
    ap.add_argument("paths", nargs="+")
    args = ap.parse_args(argv)
    if args.apply == args.check:
        ap.error("choose exactly one of --apply / --check")

    survey = default_survey()
    if survey is None:
        print("street_router: no province survey in this checkout — terrain ways "
              "cannot be routed", file=sys.stderr)
    failures = 0
    for raw in args.paths:
        path = Path(raw)
        if args.apply:
            problems = apply_to_file(path, survey)
            n = sum(1 for _ in iter_ways(json.loads(path.read_text()).get("blueprint", {})))
            print(f"street_router: {path.name} — {n} ways routed, {len(problems)} unresolved")
        else:
            problems = check_blueprint(json.loads(path.read_text()).get("blueprint", {}), survey)
        for p in problems:
            print(f"street_router: {path.name}: {p}", file=sys.stderr)
        failures += len(problems)
    print(f"street_router: {'FAIL' if failures else 'OK'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
