"""Solve the MAJOR roads once, below the freeze gate, on the frozen ground.

    cd tooling/world-generation
    python3 -m worldgen.solve_major_routes            # writes routes.json + routes-natural.json
    python3 -m worldgen.solve_major_routes --dry-run  # report only

WHY THIS EXISTS (owner, 2026-09-15; decision 0068)
--------------------------------------------------
The major roads used to be solved by `compile_society` above the freeze gate
on the Phase 3 water classes, then repaired stretch by stretch below it
(`reroute_majors`, retired here). The published lines ran along river beds
(Stormhold-Thorn), sat in marsh where higher ground was a short detour
(Archon-Gideon) and needed 70 m viaducts over sub-metre pips because the
cost never knew a span was expensive. The frozen ground is the ground now,
so the roads are solved on it, once, from the record:

* the ground cost is the frozen analysis grid (`ProvinceSurvey.height_grid`,
  the NATURAL array `apply_terrain_patches` wrote; never a graded one, so a
  road can never re-route itself on the grading it caused);
* every STEP carries its own longitudinal gradient (`routes.grade_factor`):
  a contour line is cheap, the class cap is a wall, so the solver zigzags up
  a long slope by itself (ruling 9);
* water is read from the record (0066): a flowing reach is priced by what
  crossing it costs — a ford where the recorded width and depth allow one,
  a span where they do not, a ferry across a backwater or a standing body —
  and a fall or chute is never crossed. Running ALONG a river bed pays the
  crossing price on every cell, so the road leaves the bed;
* marsh bodies cost enough that a dry detour wins;
* a typed JUNCTION (`world/sources/routes/junctions.json`) is a point named
  roads must pass through — the Gideon-Archon x Helstrom-Blackrose crossroads
  first — so where roads meet is a record, not an accident of two solves.

Outputs (same shape `compile_society` published, so every reader is unchanged):
`routes.json` and `routes-natural.json` (identical: there is no repair step
any more, the solve IS the natural line) under the studio province directory,
and `output/major-routes-report.json` with each road's length, over-cap
metres on the analysis grid, wet samples and channel samples — the numbers
the 16e ledger prints before and after.
"""
from __future__ import annotations

import argparse
import heapq
import json
import math
from pathlib import Path

import numpy as np

from .authored_routes import load_by_id, to_px
from .routes import NEIGHBOR_OFFSETS, grade_factor
from .site_fields import STANDING_BODY_KINDS, ProvinceSurvey, _resample

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
ROUTES_PATH = PROVINCE / "routes.json"
NATURAL_PATH = PROVINCE / "routes-natural.json"
REGISTRY_PATH = REPO_ROOT / "world" / "sources" / "routes" / "registry.json"
ANCHORS_PATH = REPO_ROOT / "world" / "sources" / "anchors" / "settlement-anchors.json"
JUNCTIONS_PATH = REPO_ROOT / "world" / "sources" / "routes" / "junctions.json"
REPORT_PATH = Path(__file__).resolve().parents[1] / "output" / "major-routes-report.json"
SCHEMA_VERSION = 2   # +junctions, +solvedOn (the natural-ground sha)

# The road classes this stage solves (the registry's `class`); tracks are the
# minor network (16g) and are never graded.
MAJOR_CLASSES = ("road", "trunk")
CAP_DEG = {"road": 8.0, "trunk": 8.0}          # = grade_routes.GRADIENT_CAP_DEG["road"]

# --- per-cell ground costs (multipliers on a 1.0 base) ----------------------
SLOPE_LINEAR = 12.0        # x tan(slope): gentle ground preferred
SLOPE_QUADRATIC = 30.0     # x (tan/0.5)^2: cliff faces near-prohibitive
COST_MOUNTAIN = 3.0        # above MOUNTAIN_M
MOUNTAIN_M = 40.0
COST_JUNGLE = 2.0          # region 13: dense canopy slows roads
COST_WET = 3.0             # measured shallow standing water off any recorded body
COST_WET_SEASON = 2.0      # ground the wet season floods
COST_MARSH_FRINGE = 3.0    # marsh-fringe, mudflat bodies
COST_MARSH_DEEP = 16.0     # marsh-deep, swamp, backswamp: a dry detour wins unless it is very long
COST_BANK = 4.0            # the cells beside a flowing reach: its carved bank, which grading may never touch
BANK_CELLS = 2             # how many analysis cells (5.48 m) of bank are priced
# --- crossing prices, per cell inside the water (a wide crossing is more
# cells, so the price scales with the recorded width as well) ---------------
COST_FORD = 8.0            # a reach narrower than FORD_MAX_WIDTH_M and shallower than FORD_MAX_DEPTH_M
COST_SPAN = 40.0           # a reach a deck or bridge must carry the road over
COST_FERRY = 120.0         # a backwater reach or an inland standing body: ferry only
# The sea is never crossed by a road (a coast road runs above the high-water
# line, which is where the ocean entity ends): a wall, like a fall.
FORD_MAX_WIDTH_M = 20.0    # = ferry-crossings.json policy: ford < 20 m
FORD_MAX_DEPTH_M = 1.2     # HULL_CLASS_DEPTH_M["small-draft"]: deeper than this is not waded
SPAN_MAX_WIDTH_M = 70.0    # = policy: span 20-70 m, ferry over
NEVER_CROSSED = frozenset({"vertical-fall", "sloped-chute"})
MARSH_FRINGE_KINDS = frozenset({"marsh-fringe", "mudflat"})
MARSH_DEEP_KINDS = frozenset({"marsh-deep", "swamp", "backswamp"})
# Roads avoid the world border: ramping penalty inside this edge fraction.
EDGE_MARGIN = 0.06
EDGE_PENALTY = 6.0
# A* box: the search is confined to the legs' bounding box padded by this
# fraction of the leg's straight-line length (min PAD_MIN_PX cells); a leg
# that finds no path inside the box is re-run on the whole grid.
PAD_FRACTION = 0.6
PAD_MIN_PX = 120
# Roads attract roads (owner 2026-09-16): once a road is solved its cells cost
# this fraction of their ground cost to the roads solved after it, so two
# roads heading the same way share one road and split later instead of
# running side by side. Roads are solved longest first.
ROAD_REUSE = 0.35


# ---------------------------------------------------------------------------
# the cost surface, from the record
# ---------------------------------------------------------------------------
def crossing_factor_surface(entities: list[dict], reaches: dict[str, dict],
                            ids: np.ndarray) -> np.ndarray:
    """Per-texel water multiplier on the SURFACE grid (`ids` is the entity
    raster: 0 none, else 1 + index into `entities`). 1.0 on dry ground; inf
    where a road is never built (a fall, a chute)."""
    lut = np.ones(len(entities) + 1, dtype=np.float64)
    for i, e in enumerate(entities, 1):
        kind = e.get("kind")
        rec = reaches.get(e.get("id"))
        if rec is not None:
            if kind in NEVER_CROSSED:
                lut[i] = np.inf
            elif kind == "horizontal-backwater":
                lut[i] = COST_FERRY
            else:
                width = float(rec.get("widthM") or 0.0)
                depth = float(rec.get("depthM") or 0.0)
                if width < FORD_MAX_WIDTH_M and depth <= FORD_MAX_DEPTH_M:
                    lut[i] = COST_FORD
                elif width < SPAN_MAX_WIDTH_M:
                    lut[i] = COST_SPAN
                else:
                    lut[i] = COST_FERRY
        elif kind == "ocean":
            lut[i] = np.inf
        elif kind in STANDING_BODY_KINDS:
            lut[i] = COST_FERRY
        elif kind in MARSH_FRINGE_KINDS:
            lut[i] = COST_MARSH_FRINGE
        elif kind in MARSH_DEEP_KINDS:
            lut[i] = COST_MARSH_DEEP
    return lut[ids]


def block_max(a: np.ndarray, size: int) -> np.ndarray:
    """Max-pool a surface-grid array onto the `size` analysis grid so a reach
    one texel wide still walls the cell it runs through (a nearest resample
    would drop every other texel of a thin channel)."""
    if a.shape[0] == size:
        return a
    ridx = np.minimum((np.arange(a.shape[0]) * (size / a.shape[0])).astype(np.int64), size - 1)
    cidx = np.minimum((np.arange(a.shape[1]) * (size / a.shape[1])).astype(np.int64), size - 1)
    out = np.full((size, size), -np.inf, dtype=np.float64)
    rows = np.repeat(ridx, a.shape[1])
    cols = np.tile(cidx, a.shape[0])
    np.maximum.at(out, (rows, cols), a.ravel().astype(np.float64))
    return out


def cost_surface(s: ProvinceSurvey) -> np.ndarray:
    """The per-cell road cost on the analysis grid, from the frozen ground
    and the water record. Every water term is read through the entity
    raster and the graph (0066); the only sampled water is the measured
    wet mask, which is a measurement."""
    slope = np.tan(np.radians(s.slope_grid))
    cost = 1.0 + slope * SLOPE_LINEAR + SLOPE_QUADRATIC * (slope / 0.5) ** 2
    cost = np.where(s.height_grid > MOUNTAIN_M, cost * COST_MOUNTAIN, cost)
    cost = np.where(s.region_grid == 13, cost * COST_JUNGLE, cost)
    cost = np.where(s.wet_season_grid & ~s.wet_grid, cost * COST_WET_SEASON, cost)
    water = s.water
    if water.ids is not None:
        reaches, _bodies = water._graph_index
        factor = block_max(crossing_factor_surface(water.entities, reaches, water.ids), s.grid_n)
        # a bank cell (beside a flowing reach, not itself water) costs too, so
        # a road runs off the shoulder that grading may never raise and only
        # meets the water where it crosses
        from scipy import ndimage
        from .site_fields import CHANNEL_REACH_KINDS
        reach_cells = block_max(water.kind_grid(CHANNEL_REACH_KINDS).astype(np.float64), s.grid_n) > 0
        bank = ndimage.binary_dilation(reach_cells, iterations=BANK_CELLS) & (factor <= 1.0)
        factor = np.where(bank, COST_BANK, factor)
        cost = cost * factor
        # measured shallow water outside any recorded entity (a puddle the
        # graph does not name): wading ground, priced like the minor router's
        off_record = s.wet_grid & ~s.open_water & (factor <= 1.0)
        cost = np.where(off_record, cost * COST_WET, cost)
    n = cost.shape[0]
    t = np.arange(n) / n
    edge = np.minimum(np.minimum(t, 1 - t)[None, :], np.minimum(t, 1 - t)[:, None])
    cost *= 1.0 + EDGE_PENALTY * np.clip(1.0 - edge / EDGE_MARGIN, 0.0, 1.0)
    return cost.astype(np.float64)


# ---------------------------------------------------------------------------
# the solver: gradient-walled A* (the box search `reroute_majors` used, on
# the whole road instead of a repair window)
# ---------------------------------------------------------------------------
def solve_leg(cost: np.ndarray, height: np.ndarray, px_m: float, cap_deg: float,
              start: tuple[int, int], goal: tuple[int, int],
              box: tuple[int, int, int, int] | None = None) -> list[tuple[int, int]] | None:
    """Least-cost path from `start` to `goal` (both (col, row)) where each
    step costs `run * mean(cell costs) * grade_factor(dz, run, cap)`. The A*
    heuristic is the straight-line run at the minimum cell cost inside the
    box, which is admissible because every multiplier is >= 1. Returns the
    px list, ends included, or None when no finite path exists."""
    h, w = cost.shape
    r0, r1, c0, c1 = box if box is not None else (0, h, 0, w)
    sub_cost = cost[r0:r1, c0:c1]
    sub_h = height[r0:r1, c0:c1]
    hh, ww = sub_cost.shape
    sy, sx = start[1] - r0, start[0] - c0
    gy, gx = goal[1] - r0, goal[0] - c0
    if not (0 <= sy < hh and 0 <= sx < ww and 0 <= gy < hh and 0 <= gx < ww):
        return None
    if not np.isfinite(sub_cost[sy, sx]) or not np.isfinite(sub_cost[gy, gx]):
        # an anchor on the waterfront: the end cells are always enterable
        sub_cost = sub_cost.copy()
        sub_cost[sy, sx] = min(sub_cost[sy, sx], COST_FERRY)
        sub_cost[gy, gx] = min(sub_cost[gy, gx], COST_FERRY)
    finite = sub_cost[np.isfinite(sub_cost)]
    c_min = float(finite.min()) if finite.size else 1.0
    dist = np.full((hh, ww), np.inf)
    prev = np.full((hh, ww), -1, dtype=np.int64)
    dist[sy, sx] = 0.0
    heap = [(0.0, 0.0, sy, sx)]
    while heap:
        _f, d, y, x = heapq.heappop(heap)
        if d > dist[y, x]:
            continue
        if (y, x) == (gy, gx):
            break
        cyx, zyx = sub_cost[y, x], float(sub_h[y, x])
        for dy, dx in NEIGHBOR_OFFSETS:
            ny, nx = y + dy, x + dx
            if 0 <= ny < hh and 0 <= nx < ww:
                cn = sub_cost[ny, nx]
                if not np.isfinite(cn):
                    continue
                run = (1.4142135623730951 if dy and dx else 1.0) * px_m
                nd = d + run * 0.5 * (cyx + cn) * float(
                    grade_factor(float(sub_h[ny, nx]) - zyx, run, cap_deg))
                if nd < dist[ny, nx]:
                    dist[ny, nx] = nd
                    prev[ny, nx] = y * ww + x
                    hx = math.hypot(gx - nx, gy - ny) * px_m * c_min
                    heapq.heappush(heap, (nd + hx, nd, ny, nx))
    if not np.isfinite(dist[gy, gx]):
        return None
    out: list[tuple[int, int]] = []
    cur = gy * ww + gx
    while cur >= 0:
        out.append((cur % ww + c0, cur // ww + r0))
        cur = int(prev[cur // ww, cur % ww])
    out.reverse()
    return out


def solve_via(cost: np.ndarray, height: np.ndarray, px_m: float, cap_deg: float,
              points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Solve a road through an ordered list of points (start, vias..., goal),
    boxed first and on the whole grid if the box has no path."""
    h, w = cost.shape
    path: list[tuple[int, int]] = []
    for a, b in zip(points[:-1], points[1:]):
        pad = max(PAD_MIN_PX, int(PAD_FRACTION * math.hypot(b[0] - a[0], b[1] - a[1])))
        box = (max(0, min(a[1], b[1]) - pad), min(h, max(a[1], b[1]) + pad + 1),
               max(0, min(a[0], b[0]) - pad), min(w, max(a[0], b[0]) + pad + 1))
        leg = solve_leg(cost, height, px_m, cap_deg, a, b, box)
        if leg is None:
            leg = solve_leg(cost, height, px_m, cap_deg, a, b, None)
        if leg is None:
            raise SystemExit(f"solve_major_routes: no finite path from {a} to {b}: a wall "
                             f"(a fall, a chute) closes every line; author the road or fix the record")
        path.extend(leg if not path else leg[1:])
    return path


# ---------------------------------------------------------------------------
# records
# ---------------------------------------------------------------------------
def load_junctions(path: Path = JUNCTIONS_PATH) -> list[dict]:
    if not path.exists():
        return []
    doc = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for j in doc.get("junctions", []):
        for key in ("id", "positionM", "roads", "why"):
            if key not in j:
                raise SystemExit(f"junctions.json: {j.get('id', '?')} lacks `{key}`")
        if not str(j["id"]).startswith("junction."):
            raise SystemExit(f"junctions.json: id {j['id']!r} is not `junction.*`")
        out.append(j)
    return out


def endpoints(anchors_doc: dict, w: int, h: int) -> dict[str, tuple[int, int]]:
    """Anchor ids and exit-gate ids to grid px (col, row)."""
    def px(u: float, v: float) -> tuple[int, int]:
        return (min(int(u * w), w - 1), min(int(v * h), h - 1))
    pts = {a["id"]: px(a["u"], a["v"]) for a in anchors_doc["anchors"]}
    for ext in anchors_doc.get("externalConnections", []):
        pts[ext["id"]] = px(ext["exitUV"][0], ext["exitUV"][1])
    return pts


def road_points(road: dict, ends: dict[str, tuple[int, int]], junctions: list[dict],
                s: ProvinceSurvey) -> list[tuple[int, int]]:
    """start, the junctions this road passes through (ordered by distance
    from the start), goal."""
    a, b = ends[road["from"]], ends[road["to"]]
    vias = []
    for j in junctions:
        if road["id"] in j["roads"]:
            row, col = s.grid_px(float(j["positionM"][0]), float(j["positionM"][1]))   # (row, col)
            vias.append((col, row))                                                  # the solver's (col, row)
    vias.sort(key=lambda p: math.hypot(p[0] - a[0], p[1] - a[1]))
    return [a, *vias, b]


def measure(px: list[tuple[int, int]], s: ProvinceSurvey, cap_deg: float) -> dict:
    """The numbers the ledger prints per road, on the analysis grid."""
    p = np.asarray(px, dtype=np.int64)
    z = s.height_grid[p[:, 1], p[:, 0]]
    d = np.hypot(np.diff(p[:, 0]), np.diff(p[:, 1])) * s.grid_px_m
    deg = np.degrees(np.arctan(np.abs(np.diff(z)) / np.maximum(d, 1e-6)))
    over = deg > cap_deg
    return {
        "lengthKm": round(float(d.sum()) / 1000.0, 3),
        "overCapM": round(float(d[over].sum()), 1),
        "worstDeg": round(float(deg.max()) if len(deg) else 0.0, 2),
        "channelSamples": int((s.channel_grid[p[:, 1], p[:, 0]] > 0).sum()),
        "standingBodySamples": int((s.standing_body_grid[p[:, 1], p[:, 0]] > 0).sum()),
        "wetSamples": int(s.wet_grid[p[:, 1], p[:, 0]].sum()),
        "samples": int(len(p)),
    }


def solve_all(s: ProvinceSurvey, roads: list[dict], anchors_doc: dict,
              junctions: list[dict], cost: np.ndarray | None = None) -> tuple[list[dict], dict]:
    cost = cost_surface(s) if cost is None else cost
    height = s.height_grid
    px_m = s.grid_px_m
    ends = endpoints(anchors_doc, s.grid_n, s.grid_n)
    authored = load_by_id()
    out, report = [], {}
    cost = cost.copy()
    built = np.zeros(cost.shape, bool)
    def straight(road):
        a, b = ends[road["from"]], ends[road["to"]]
        return math.hypot(a[0] - b[0], a[1] - b[1])
    roads = sorted(roads, key=lambda r: (r["class"] != "trunk", -straight(r)))
    for road in roads:
        cap = CAP_DEG[road["class"]]
        override = authored.get(road["id"])
        if override is not None:
            px = [tuple(p) for p in to_px(override, s)]
            how = "authored"
        else:
            px = solve_via(cost, height, px_m, cap, road_points(road, ends, junctions, s))
            how = "solved"
        rec = {"id": road["id"], "name": road.get("name"), "class": road["class"],
               "from": road["from"], "to": road["to"],
               "lengthKm": round(sum(math.hypot(px[i + 1][0] - px[i][0], px[i + 1][1] - px[i][1])
                                     for i in range(len(px) - 1)) * px_m / 1000.0, 2),
               # every cell of the solve (no decimation: a junction cell must stay on the line)
               "px": [[int(c), int(r)] for c, r in px],
               "junctions": [j["id"] for j in junctions if road["id"] in j["roads"]],
               "geometry": how}
        if override is not None:
            rec["authoredGeometryDigest"] = override["contentDigest"]
        out.append(rec)
        report[road["id"]] = {"geometry": how, **measure(px, s, cap)}
        for c, r in px:
            if not built[r, c] and np.isfinite(cost[r, c]):
                cost[r, c] *= ROAD_REUSE
                built[r, c] = True
    order = {r["id"]: i for i, r in enumerate(load_roads())}
    out.sort(key=lambda rec: order.get(rec["id"], 999))
    return out, report


def load_roads(path: Path = REGISTRY_PATH) -> list[dict]:
    reg = json.loads(path.read_text(encoding="utf-8"))["routes"]
    return [r for r in reg if r.get("class") in MAJOR_CLASSES]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    s = ProvinceSurvey()
    roads = load_roads()
    anchors_doc = json.loads(ANCHORS_PATH.read_text(encoding="utf-8"))
    junctions = load_junctions()
    routes, report = solve_all(s, roads, anchors_doc, junctions)
    for rid, r in report.items():
        print(f"  {rid:44s} {r['geometry']:8s} {r['lengthKm']:6.2f} km  over-cap {r['overCapM']:7.1f} m  "
              f"worst {r['worstDeg']:5.1f} deg  channel {r['channelSamples']:3d}  body {r['standingBodySamples']:3d}")
    if args.dry_run:
        return 0
    doc = {"schemaVersion": SCHEMA_VERSION, "routes": routes,
           "junctions": [{"id": j["id"], "positionM": j["positionM"], "roads": j["roads"]} for j in junctions]}
    text = json.dumps(doc, indent=1) + "\n"
    ROUTES_PATH.write_text(text, encoding="utf-8")
    NATURAL_PATH.write_text(text, encoding="utf-8")
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps({"schemaVersion": 1, "roads": report}, indent=1) + "\n", encoding="utf-8")
    print(f"solve_major_routes: {len(routes)} roads -> {ROUTES_PATH.name}, {NATURAL_PATH.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
