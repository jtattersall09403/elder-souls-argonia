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

Fences are structures, not paths: they follow their `via` straight unless the
author asked for ``"arc"``.

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
import heapq
import json
import math
import sys
from pathlib import Path

from .blueprint_footprints import PROVINCE_EXTENT_M, UV_ROUND, _indent_of

WAY_KEYS = ("routes", "canals", "boardwalks", "fences")
WET_KINDS = {"boardwalk", "pier", "canal", "channel"}

CELL_M = 1.0
MARGIN_M = 30.0
K_SLOPE = 24.0                  # cost of climbing: ×grade²
K_CROSS = 6.0                   # cost of a side-slope: ×cross-grade²
TURN_M = 1.2                    # effective metres per 45° of direction change
PARCEL_PENALTY = 120.0
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

_HEIGHT_CACHE: dict = {}

_OFFSETS = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))


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


def sample_water(survey, x: float, z: float) -> bool:
    grid = survey.open_water
    n = len(grid)
    px = float(survey.grid_px_m)
    col = min(max(int(x / px), 0), n - 1)
    row = min(max(int(z / px), 0), n - 1)
    return bool(grid[row][col])


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

    def __init__(self, way: dict, bp: dict, survey, cell_m: float = CELL_M):
        self.survey = survey
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
        key = (id(survey), round(self.x0, 3), round(self.z0, 3), self.w, self.h, cell_m)
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
            parcels.append((poly, ENDS_PARCEL_PENALTY if p.get("id") in ends else PARCEL_PENALTY))

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
                    neighbours.append(via)

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
                for poly, pen in parcels:
                    if _point_in_poly(x, z, poly):
                        m *= pen
                        break
                for nb in neighbours:
                    if _dist_point_polyline((x, z), nb) <= NEIGHBOUR_M:
                        m *= NEIGHBOUR_PENALTY
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
                grade = abs(dh) / step
                # side-slope at the destination, measured across the step
                px, pz = -dc, dr
                cross = abs(self.height_rc(nr + pz, nc + px)
                            - self.height_rc(nr - pz, nc - px)) / (2.0 * step)
                terrain = 1.0 + K_SLOPE * grade * grade + K_CROSS * cross * cross
                turn = 0.0
                if di >= 0:
                    turn = TURN_M * _turn_steps(di, k)
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


def route_way(way: dict, bp: dict, survey=None) -> list[list[float]]:
    """The derived `points` polyline for one way, in province UV."""
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
    elif routing == "terrain" and not is_fence and survey is not None:
        field = LocalField(way, bp, survey)
        pts_m = []
        for a, b in zip(via_m, via_m[1:]):
            cells = field.astar(field.rc(*a), field.rc(*b))
            leg = [field.xz(r, c) for r, c in cells]
            leg[0], leg[-1] = a, b
            pts_m += leg if not pts_m else leg[1:]
    else:
        pts_m = via_m

    pts_m = douglas_peucker(pts_m, SIMPLIFY_M)
    out: list[list[float]] = []
    for x, z in pts_m:
        p = [round(x / extent_m, UV_ROUND), round(z / extent_m, UV_ROUND)]
        if not out or p != out[-1]:
            out.append(p)
    return out


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
            way["points"] = route_way(way, bp, survey)
        except Exception as exc:                       # noqa: BLE001 — reported, not raised
            problems.append(f"{key} {way.get('id')}: {exc}")
    return problems


def check_blueprint(bp: dict, survey=None) -> list[str]:
    """Ways whose stored `points` are not the router's derivation."""
    extent_m = _extent_m(survey) if survey is not None else PROVINCE_EXTENT_M
    problems: list[str] = []
    for key, way in iter_ways(bp):
        if way.get("routing") == "terrain" and survey is None and _way_class(bp, way) != "fences":
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
