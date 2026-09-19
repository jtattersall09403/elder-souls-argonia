"""Phase 11 Part 3b — the MINOR ROUTE network: tracks, footpaths, boardwalks.

    cd tooling/world-generation
    python3 -m worldgen.compile_minor_routes

WHY THIS EXISTS (owner question, 2026-09-03)
--------------------------------------------
Phase 4 built the *major* graph (roads and boat lanes between the nine
anchors) and Part 6 blueprints will lay each settlement's own streets — but
nothing in between: no track from a village to the road, no footpath to a
shrine, no boardwalk across the reeds to a stilt hamlet. That middle layer is
most of what a player actually walks in Morrowind, and it is derivable the
moment the macro plot gives every place a position. So it is derived here,
from the plot, and re-derived whenever the plot changes.

WHAT IT DOES
------------
Least-cost paths (Dijkstra on the published rasters via `ProvinceSurvey`) from
each plotted place to the nearest cell of the network so far, in three
batches so paths chain rather than each running to the highway:

    1. settlements M3+            → roads and boat landings
    2. settlements M1–M2          → the network incl. batch-1 tracks
    3. road-discovered places     → the network incl. batches 1–2
       (discovery == road, not a lair or camp — hidden places get no path)
    4. UNMAPPED heads             → a place found by rumour that nevertheless
       has a blueprint `networkTerminals[]` entry (owner requirement
       2026-09-05). Its design says a way arrives — the worn track to a sap
       camp, the bank path up from a poling landing — and the network has to
       carry that way, or the blueprint's terminal joins nothing. The path is
       routed, graded and painted exactly like any other, and flagged
       `unmapped: true`: it is real ground, but it is not drawn on the player's
       map or minimap, so the place is still found by rumour and by walking.
       The flag rides through `export_routes` into `routes-index.json` so the
       studio (and later the map UI) can style it faint or hide it.

Each path is classed by the ground it crosses and the size of what it serves:
`track` (cart-width, M3+ or serving many), `footpath` (everything smaller),
`boardwalk` (mostly wetland), `causeway` (mostly seasonal flood ground). A
place already within ARRIVAL_M of the network gets no path (it is on the
road). A place whose cheapest path exceeds MAX_TRACK_M is recorded as
`unconnected` — boat-, guide- or root-served, which is a design fact, not a
failure — and listed in the digest.

Every step of the search carries its own longitudinal gradient
(`routes.grade_factor`), so a path prefers to follow the contour and is walled
off above ROUTING_CAP_DEG: a track to a hill village switchbacks up the spur
instead of running straight at it and leaving `grade_routes` a climb no cut or
fill can hold (owner requirement 2026-09-05 — every way walkable end to end).

**A TRACK IS NEVER GRADED, AND THE CAP IS A WALL** (owner 2026-09-15). The
roads are patched by `grade_routes`, so their solver prices an over-cap step as
earthworks (`routes.grade_factor(..., gradable_m=...)`). A minor way gets no
cut and no fill: it lies on the ground as the ground is. So this module calls
`grade_factor` WITHOUT `gradable_m` — the wall branch, `GRADE_WALL` per unit of
excess over the cap — and a step over ROUTING_CAP_DEG is not priced as a dearer
crossing, it is refused: any line that goes round costs less, however long, so
the search reroutes rather than climbing. The wall stays finite only so that a
place ringed by over-cap ground still receives a path instead of vanishing from
the network; `over_cap_steps` then counts the steps that had to break the cap
and every published track carries the count (`overCapSteps`), so a way that
could only be reached by breaking the cap is visible rather than silent.

NAMED REGISTRY TRACKS (16g deliverable 5)
-----------------------------------------
`world/sources/routes/registry.json` carries named minor routes that the Phase 4
anchor network never solved: a row with `solved: false`, a land mode and a minor
class, whose `from`/`to` name two live plotted records. Those are laid here, by
the same cost surface and the same gradient wall, through their STAGE places in
order — the row's own `stages`, or the records whose `relations.reachedVia` /
`relations.travelServiceEdges` name the route id — so the line passes within
ARRIVAL_M of each stage in turn instead of taking the cheapest line between the
two ends. A row may name `joinsRouteId`: its far end is then the nearest point
of that published route's geometry rather than a place anchor (0069's "a local
boardwalk spur from the freehold up to the Thorn trunk"), and the trunk carries
it the rest of the way. `--registry` writes `geometryId`/`solved: true` back to
the registry, exactly as `compile_minor_waterways` does for the water half.

VEGETATION CLEARANCE (decision 0070)
------------------------------------
Every solved minor way emits one `vegetation-clearance` patch into
`world/sources/flora/vegetation-patches.json` (`patch.clearance.track.<id>`):
its running surface is `hardClear`, its worked fringe is `thinned`, and
`worldgen.apply_vegetation_patches` takes the plants out of the published
bundles. The whole set of `patch.clearance.track.*` ids is REPLACED on every
run and every other patch id is left alone, so the file is one record with many
authors and re-running duplicates nothing.

AUTHORED OVERRIDES
------------------
A track named in `world/sources/routes/authored-routes.json` is not solved at
all: its hand-drawn metre-space centreline is rasterised and published exactly
as authored (`worldgen/authored_routes.py`), the same contract the authored
minor waterways keep. Use it for a way whose right line is a design fact the
cost surface cannot express — never to paper over an over-cap window that is
really sub-metre surface roughness.

BLUEPRINT TERMINALS (owner requirement 2026-09-05)
--------------------------------------------------
Where a place has a Part 6 blueprint with `networkTerminals[]`, the minor path
ends at the terminal's `entryUV` — the gate, the landing, the path head the
blueprint designed — and not at the plotted dot in the middle of the place.
The major-route side of the line is untouched: the search still starts from the
network, so the track into the village and the street inside it are one line
with no jog at the boundary. A place with several terminals uses the one whose
`kind` is walkable (road/track/footpath/boardwalk), highest class first, so the
derived path meets the entrance the design treats as the main way in. That
terminal's KIND also caps the derived path's class: a path may not arrive
grander than the entrance it was designed to meet.

This is part of the plot's dependant chain: `worldgen.apply_sitings` re-runs
this module after any siting move, so a blueprint that moves its gate re-draws
its own approach.

Deterministic: no randomness; ties in the heap break by (cost, row, col).

WHAT IT WRITES
--------------
* `world/sources/flora/vegetation-patches.json` — the `patch.clearance.track.*`
  rows (the rest of the file untouched).
* `apps/world-studio/public/province/routes-minor.json` — the network, px on
  the 1345 hydrology grid exactly like `routes.json` (the studio draws it;
  Part 6's compilers, vegetation clearing and the navmesh bake consume it).
* `world/sources/sites/minor-routes.md` — the digest.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from scipy import ndimage

from . import blueprint as bp_mod
from . import catalogue
from . import province_network as pn
from . import vegetation_patches as vp
from .authored_routes import load_by_id, to_px
from .routes import EDGE_MARGIN, EDGE_PENALTY, NEIGHBOR_OFFSETS, grade_factor
from .site_fields import ProvinceSurvey, shared_survey

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_JSON = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "routes-minor.json"
OUT_MD = REPO_ROOT / "world" / "sources" / "sites" / "minor-routes.md"

SCHEMA_VERSION = 1
ARRIVAL_M = 45.0          # already on the network: no path
# Beyond this the place is boat/guide/root-served. Raised from 2600 m when the
# solver learned about gradient (2026-09-05): a path that switchbacks up a spur
# or contours round it is legitimately longer than the straight climb it
# replaces, and holding the old number would have retired fifteen places'
# paths for being walkable. The limit says "past here, walking is not how you
# get there" — it is a statement about effort, so it moved with the geometry.
MAX_TRACK_M = 4000.0
# How far a water-sited record may reach for its own land head. Beyond this it
# is a boat place, not a walked one, and a track that starts hundreds of metres
# away is a lie about where the path begins (found 2026-09-04, when a re-plot
# moved a divers' yard 118 m off the nearest land and the compiler drew the
# track from there anyway). Mirrors compile_minor_waterways.SNAP_M.
SNAP_M = 65.0
MAGNITUDE_RANK = {"M5": 5, "M4": 4, "M3": 3, "M2": 2, "M1": 1}

# per-metre relative costs (cf. routes.cost_surface, adapted to the published rasters)
COST_WETLAND = 3.0
COST_WET_SEASON = 1.8
COST_MOUNTAIN = 2.5       # above 40 m
COST_RIVER = 9.0          # a crossing
COST_DEEP = 60.0          # open water: effectively forbidden for a land path
COST_JUNGLE = 1.8
# Longitudinal gradient the solver routes to. A minor path is only classed
# (track / footpath / boardwalk / causeway) once its line is known, so routing
# holds the strictest cap any class it might land in carries — the track and
# causeway cap of 12 deg (grade_routes.GRADIENT_CAP_DEG) — and every kind of
# minor way then comes out walkable. Routed on the NATURAL heights, which is
# what `ProvinceSurvey` reads and what `grade_routes` grades from.
ROUTING_CAP_DEG = 12.0
# Which terminal a derived path aims at when a blueprint declares several: the
# highest-class WALKABLE entrance (a lane terminal is a boat landing, not the
# end of a track).
TERMINAL_PRIORITY = {"road": 0, "track": 1, "boardwalk": 2, "footpath": 3}
#: Running width of each minor class, metres — the ground the way itself
#: occupies, and therefore the width of the `hardClear` corridor it clears.
CLASS_WIDTH_M = {"footpath": 2.5, "track": 4.0, "boardwalk": 3.0, "causeway": 5.0}
#: Prefix of every patch this module owns. The whole set is rewritten each run.
TRACK_PATCH_PREFIX = "patch.clearance.track."
#: How far the derived line may be from a blueprint way point and still count
#: as having reached it: one cell diagonal of the 5.48 m routing grid.
WAY_MEET_CELLS = 1.5
#: Douglas-Peucker tolerance for the corridor polygon, metres. The patch only
#: has to say which ground is cleared; a vertex every half-width is plenty and
#: keeps the published polygon list small.
CORRIDOR_SIMPLIFY_M = 4.0
REGISTRY_PATH = REPO_ROOT / "world" / "sources" / "routes" / "registry.json"
#: Registry rows this module lays: a named minor LAND route with no geometry.
REGISTRY_LAND_MODES = {"road", "track"}
REGISTRY_LAND_CLASSES = {"track", "footpath", "boardwalk", "causeway"}


def blueprint_terminals() -> dict[str, dict]:
    """{place id: {"entryUV", "kind", "wayPoints"}} — the entry point each
    blueprint's walkable network terminal declares, the kind of entrance it is,
    and the points of the place's OWN way that the terminal is the head of.

    The minor path to that place ends there, may not arrive grander than that
    entrance, and is clamped to the first point of that way it reaches
    (`clamp_to_way`)."""
    out: dict[str, dict] = {}
    if not bp_mod.BLUEPRINT_DIR.exists():
        return out
    for path in sorted(bp_mod.BLUEPRINT_DIR.glob("*.json")):
        try:
            bp = json.loads(path.read_text()).get("blueprint") or {}
        except (OSError, json.JSONDecodeError):
            continue
        ways = {str(w.get("id")): w for group in ("routes", "boardwalks", "canals")
                for w in (bp.get(group) or []) if isinstance(w, dict)}
        best = None
        for t in bp.get("networkTerminals") or []:
            rank = TERMINAL_PRIORITY.get(t.get("kind"))
            entry = t.get("entryUV")
            if rank is None or not (isinstance(entry, list) and len(entry) == 2):
                continue
            key = (rank, str(t.get("id")))
            way = ways.get(str(t.get("wayId"))) or {}
            points = [[float(u), float(v)] for u, v in (way.get("points") or way.get("via") or [])]
            if best is None or key < best[0]:
                best = (key, {"entryUV": (float(entry[0]), float(entry[1])),
                              "kind": str(t["kind"]), "wayPoints": points})
        if best and bp.get("id"):
            out[bp["id"]] = best[1]
    return out


def clamp_to_way(path: list[tuple[int, int]], way_px: list[tuple[int, int]],
                 tol_cells: float = WAY_MEET_CELLS) -> list[tuple[int, int]]:
    """Cut the derived line where it FIRST meets the place's own way.

    `path` runs from the terminal end (index 0) back to the network (index -1),
    so the approaching traveller walks it in reverse. A blueprint's declared
    terminal is where the design says the road arrives; but the solved line is
    free to reach some other point of that way earlier and then run on beside
    it into the middle of the place — the "licensed camp track overrun"
    (backlog, 16g). The track head is therefore the DECLARED terminal clamped
    to the first way point the approaching track reaches: everything past that
    meeting is the place's own way, not the approach, and is dropped.

    General by construction — no hand-moved coordinate — so a blueprint 16i
    re-authors is clamped wherever its way then lands.
    """
    if not way_px or len(path) < 2:
        return path
    tol2 = tol_cells * tol_cells
    for i in range(len(path) - 1, -1, -1):
        c, r = path[i]
        for wc, wr in way_px:
            if (c - wc) ** 2 + (r - wr) ** 2 <= tol2:
                return path[i:] if len(path[i:]) >= 2 else path
    return path


def over_cap_steps(path: list[tuple[int, int]], height: np.ndarray, px_m: float,
                   cap_deg: float = ROUTING_CAP_DEG) -> int:
    """How many steps of a line break the gradient cap.

    A minor way is never graded, so the cap is a wall the solver goes round
    (`routes.grade_factor` without `gradable_m`). The wall is finite only so a
    place ringed by over-cap ground still gets a path; this counts the steps
    that had to break it, and `run` publishes the count on every track.
    """
    n = 0
    for (c0, r0), (c1, r1) in zip(path[:-1], path[1:]):
        run = float(np.hypot(c1 - c0, r1 - r0)) * px_m
        if run <= 0:
            continue
        dz = abs(float(height[r1, c1]) - float(height[r0, c0]))
        if np.degrees(np.arctan(dz / run)) > cap_deg + 1e-6:
            n += 1
    return n


def cost_surface(s: ProvinceSurvey) -> np.ndarray:
    slope = np.radians(s.slope_grid)
    cost = 1.0 + np.tan(slope) * 12.0 + 30.0 * (np.tan(slope) / 0.5) ** 2
    # measured shallow standing water — ground you wade, not ground you sail
    wet = s.wet_grid & ~s.open_water
    cost = np.where(wet, cost * COST_WETLAND, cost)
    cost = np.where(s.wet_season_grid & ~s.wet_grid, cost * COST_WET_SEASON, cost)   # analysis grid; `wet_season` is the surface grid
    cost = np.where(s.height_grid > 40.0, cost * COST_MOUNTAIN, cost)
    cost = np.where(s.reach_band_grid >= 2, cost * COST_RIVER, cost)
    cost = np.where(s.region_grid == 13, cost * COST_JUNGLE, cost)
    cost = np.where(s.open_water, cost * COST_DEEP, cost)
    # keep paths off the map rim, as the road compiler does (routes.EDGE_*)
    n = cost.shape[0]
    t = np.arange(n) / n
    edge = np.minimum(np.minimum(t, 1 - t)[None, :], np.minimum(t, 1 - t)[:, None])
    cost *= 1.0 + EDGE_PENALTY * np.clip(1.0 - edge / EDGE_MARGIN, 0.0, 1.0)
    return cost.astype(np.float64)


def rasterise_routes(s: ProvinceSurvey) -> np.ndarray:
    """Mask of major roads + boat lanes on the analysis grid, dilated by one
    pixel onto land so a track can end at a lane's landing without entering
    the water."""
    n = s.grid_n
    mask = np.zeros((n, n), dtype=bool)
    # The PUBLISHED geometry, not `s.routes`: that one is the natural-state
    # snapshot siting reads (site_fields), and a track has to meet the road
    # the world actually carries — the one `solve_major_routes` published.
    ways = [r["px"] for r in json.loads((s.province / "routes.json").read_text())["routes"]]
    ways += [lane["px"] for lane in json.loads((s.province / "waterways.json").read_text())["lanes"]]
    for px in ways:
        for c, r in px:
            mask[int(r), int(c)] = True
        # join the polyline: routes.json is per-pixel already, lanes too
    mask = ndimage.binary_dilation(mask, iterations=1)
    return mask & s.land


def multi_source_field(cost: np.ndarray, seeds: np.ndarray, px_m: float,
                      height: np.ndarray | None = None, cap_deg: float | None = None):
    """Dijkstra from every seed cell at once; returns (cost field, predecessor).

    With `height` and `cap_deg` the cost of each STEP carries its own
    longitudinal gradient (`routes.grade_factor`): gentle contour-following
    lines are cheap, and anything above the class cap is behind a wall, so a
    path switchbacks up a spur instead of climbing it head-on. The 5.48 m grid
    is fine enough to hold a switchback: at 12 deg a step may gain 1.17 m.
    """
    return StepGraph(cost, px_m, height, cap_deg).field(seeds)


class StepGraph:
    """The step costs of the 8-connected grid, solved as a sparse graph.

    Every step's cost depends only on the two cells it joins — the mean of
    their per-metre costs over the run, times the gradient factor of the
    height they differ by — so the whole search space is a STATIC weighted
    graph. Building it once and handing it to `scipy.sparse.csgraph.dijkstra`
    does in seconds what the per-step Python loop it replaced did in minutes
    (the loop called `grade_factor` ~58 million times per run), and the four
    batches now share one build instead of re-deriving every step's cost.

    The step cost is symmetric (the gradient factor takes |dz|), so only four
    of the eight offsets are stored and the solve runs undirected.

    Results are IDENTICAL to the heap loop's, not merely equivalent:

    * `dist` is the shortest-path distance, which the same float64 recurrence
      fixes regardless of the order nodes settle in;
    * `prev` is rebuilt with the heap's own tie-break rather than taken from
      scipy. The old loop only overwrote a predecessor on a STRICTLY smaller
      distance, so a cell's predecessor is whichever of its exactly-minimal
      neighbours popped first — that is, smallest `(dist, row, col)`. Since
      every step cost is positive, all of them settle before the cell does,
      and `_predecessors` picks the same one by that key.
    """

    def __init__(self, cost: np.ndarray, px_m: float,
                 height: np.ndarray | None = None, cap_deg: float | None = None):
        from scipy import sparse
        self.shape = cost.shape
        h, w = self.shape
        self.n = h * w
        graded = height is not None and cap_deg is not None
        z = np.asarray(height, dtype=np.float64) if graded else None
        # One weight plane per offset, indexed by the SOURCE cell; inf where
        # the neighbour falls off the grid.
        self.weights: dict[tuple[int, int], np.ndarray] = {}
        rows, cols, data = [], [], []
        flat = np.arange(self.n, dtype=np.int32).reshape(h, w)
        for dy, dx in NEIGHBOR_OFFSETS:
            src = (slice(max(0, -dy), h - max(0, dy)), slice(max(0, -dx), w - max(0, dx)))
            dst = (slice(max(0, dy), h - max(0, -dy)), slice(max(0, dx), w - max(0, -dx)))
            run = (1.4142135623730951 if dy and dx else 1.0) * px_m
            step = run * 0.5 * (cost[src] + cost[dst])
            if graded:
                step = step * grade_factor(z[dst] - z[src], run, cap_deg)
            plane = np.full(self.shape, np.inf)
            plane[src] = step
            self.weights[(dy, dx)] = plane
            if (dy, dx) < (0, 0):      # one of each opposite pair; solved undirected
                continue
            rows.append(flat[src].ravel())
            cols.append(flat[dst].ravel())
            data.append(step.ravel())
        self._graph = sparse.csr_matrix(
            (np.concatenate(data), (np.concatenate(rows), np.concatenate(cols))),
            shape=(self.n, self.n))

    def field(self, seeds: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        from scipy.sparse import csgraph
        sources = np.flatnonzero(np.asarray(seeds).ravel())
        if sources.size == 0:
            return np.full(self.shape, np.inf), np.full(self.shape, -1, dtype=np.int64)
        dist = csgraph.dijkstra(self._graph, directed=False, indices=sources,
                                min_only=True).reshape(self.shape)
        return dist, self._predecessors(dist)

    def _predecessors(self, dist: np.ndarray) -> np.ndarray:
        h, w = self.shape
        best_d = np.full(self.shape, np.inf)
        best_u = np.full(self.shape, np.iinfo(np.int64).max, dtype=np.int64)
        rowcol = np.arange(self.n, dtype=np.int64).reshape(h, w)
        for (dy, dx), plane in self.weights.items():
            # cell (y, x) reached from (y - dy, x - dx)
            src = (slice(max(0, -dy), h - max(0, dy)), slice(max(0, -dx), w - max(0, dx)))
            dst = (slice(max(0, dy), h - max(0, -dy)), slice(max(0, dx), w - max(0, -dx)))
            with np.errstate(invalid="ignore"):
                hit = ((dist[src] + plane[src]) == dist[dst]) & np.isfinite(dist[dst])
            cand_d = np.where(hit, dist[src], np.inf)
            cand_u = np.where(hit, rowcol[src], np.iinfo(np.int64).max)
            view_d, view_u = best_d[dst], best_u[dst]
            better = (cand_d < view_d) | ((cand_d == view_d) & (cand_u < view_u))
            best_d[dst] = np.where(better, cand_d, view_d)
            best_u[dst] = np.where(better, cand_u, view_u)
        return np.where(best_u == np.iinfo(np.int64).max, -1, best_u)


def trace(prev: np.ndarray, row: int, col: int, w: int) -> list[tuple[int, int]]:
    path = []
    cur = row * w + col
    while cur >= 0:
        path.append((cur % w, cur // w))     # (col, row) like routes.json px
        cur = int(prev[cur // w, cur % w])
    return path


def classify(s: ProvinceSurvey, path: list[tuple[int, int]], magnitude: str | None, cls: str,
             terminal_kind: str | None = None) -> str:
    """The class of a derived path, from the ground it crosses and the size of
    what it serves — then capped by the blueprint's declared entrance. A path
    may not arrive grander than the terminal it is designed to meet (owner
    requirement 2026-09-05): a rumoured lair whose blueprint designs a footpath
    head does not get a boardwalk driven up to it because the rootland it
    crosses is wet."""
    kind = _classify_ground(s, path, magnitude, cls)
    rank = pn.CLASS_RANK.get(terminal_kind or "")
    if rank is not None and rank < pn.CLASS_RANK.get(kind, 0):
        return terminal_kind          # type: ignore[return-value]
    return kind


def _classify_ground(s: ProvinceSurvey, path: list[tuple[int, int]], magnitude: str | None, cls: str) -> str:
    """Deck, embankment or beaten earth — a physical choice, so it is made on
    measured water, not on the region/wetland class rasters.

    A BOARDWALK is a deck standing over water: it is earned where the way
    crosses ground that measurably holds water now (`wet_grid`) or goes under
    in the wet season (`wet_season`, the refined inundation mask). The old test
    was `region in marsh regions or wetlands`, both authored classes, so a way
    over permanently dry marsh-labelled ground was decked.
    """
    cells = np.array([(r, c) for c, r in path])
    rows, cols = cells[:, 0], cells[:, 1]
    wet_n = int(s.wet_season.shape[0])
    scale = wet_n / s.grid_n
    wr = np.clip((rows * scale).astype(int), 0, wet_n - 1)
    wc = np.clip((cols * scale).astype(int), 0, wet_n - 1)
    under_water = float((s.wet_grid[rows, cols] | s.wet_season[wr, wc]).mean())
    seasonal = float(s.wet_season[wr, wc].mean())
    if under_water >= 0.5:
        return "boardwalk"
    if seasonal >= 0.5:
        return "causeway"
    if cls == "settlement" and MAGNITUDE_RANK.get(magnitude or "", 0) >= 3:
        return "track"
    return "footpath"


def demand(files: list[catalogue.RegionFile],
           terminal_places: set[str] | None = None) -> list[list[dict]]:
    """The four batches, in the order they are solved. `terminal_places` is the
    set of place ids whose blueprint declares a walkable network terminal; a
    hidden place in that set earns batch 4, the unmapped heads."""
    terminal_places = terminal_places or set()
    b1, b2, b3, b4 = [], [], [], []
    for rf in files:
        for rec in rf.places:
            if rec.get("status") in {"cut", "deferred"} or "position" not in rec:
                continue
            cls = rec["classification"]["class"]
            mag = rec["classification"].get("magnitude")
            if cls == "settlement":
                (b1 if MAGNITUDE_RANK.get(mag or "", 0) >= 3 else b2).append(rec)
            elif rec.get("discovery") == "road" and cls not in {"lair", "camp"}:
                b3.append(rec)
            elif rec["id"] in terminal_places:
                # found by rumour, but its blueprint designed a way in: route it
                # and keep it off the drawn map (batch 4, owner 2026-09-05)
                b4.append(rec)
    key = lambda r: (-MAGNITUDE_RANK.get(r["classification"].get("magnitude") or "", 0), r["importanceTier"], r["id"])
    return [sorted(b1, key=key), sorted(b2, key=key), sorted(b3, key=key), sorted(b4, key=key)]


def way_cells(s, uv_points) -> list[tuple[int, int]]:
    """A blueprint way's points as (col, row) cells of the analysis grid."""
    out: list[tuple[int, int]] = []
    for u, v in uv_points:
        row, col = s.grid_px(*s.uv_to_m(float(u), float(v)))
        cell = (int(col), int(row))
        if not out or out[-1] != cell:
            out.append(cell)
    return out


def nearest_land_cell(s, x: float, z: float, snap_m: float = SNAP_M
                      ) -> tuple[int, int] | None:
    """(row, col) of the cell at (x, z), or the nearest land cell within
    `snap_m` when that one is under water."""
    row, col = s.grid_px(float(x), float(z))
    if s.land[row, col]:
        return int(row), int(col)
    land_rc = np.argwhere(s.land)
    d2 = (land_rc[:, 0] - row) ** 2 + (land_rc[:, 1] - col) ** 2
    k = int(np.argmin(d2))
    if float(np.sqrt(d2[k])) * s.grid_px_m > snap_m:
        return None
    return int(land_rc[k, 0]), int(land_rc[k, 1])


# --------------------------------------------------------------------------- #
# named registry tracks (16g)
# --------------------------------------------------------------------------- #
def load_registry(path: Path | None = None) -> list[dict]:
    path = path or REGISTRY_PATH
    return json.loads(path.read_text())["routes"]


def registry_stage_ids(route_id: str, aliases: set[str], files) -> list[str]:
    """Records whose `relations.reachedVia` / `relations.travelServiceEdges`
    name this route: the stages the line must pass, endpoints excluded."""
    names = {route_id} | set(aliases)
    out: list[str] = []
    for rf in files:
        for rec in rf.places:
            if rec.get("status") in {"cut", "deferred"} or "positionM" not in rec:
                continue
            rel = rec.get("relations") or {}
            refs = list(rel.get("reachedVia") or []) + list(rel.get("travelServiceEdges") or [])
            if any(any(n in str(ref) for n in names) for ref in refs):
                out.append(rec["id"])
    return sorted(out)


def registry_place_gap(slug: str, all_by_slug: dict[str, dict]) -> str:
    """Why this endpoint cannot carry a line, or "" when it can."""
    rec = all_by_slug.get(slug)
    if rec is None:
        return f"{slug}: no place of that name in the catalogue"
    if rec.get("status") in {"cut", "deferred"}:
        return f"{rec['id']}: {rec['status']}"
    if "positionM" not in rec:
        return f"{rec['id']}: no positionM in the macro plot"
    return ""


def registry_demand(files, routes: list[dict] | None = None) -> list[dict]:
    """Every registry row this run lays: a named minor LAND route with no
    geometry whose `from` and `to` both resolve to a live plotted record.

    The result carries the row, the resolved endpoint record ids and the
    ordered stage record ids. Deterministic: rows in registry order, stages
    ordered by their projection on the straight line between the two ends.
    """
    rows = routes if routes is not None else load_registry()
    by_slug: dict[str, dict] = {}
    all_by_slug: dict[str, dict] = {}
    by_id: dict[str, dict] = {}
    for rf in files:
        for rec in rf.places:
            by_id[rec["id"]] = rec
            all_by_slug.setdefault(rec["id"].rsplit(".", 1)[-1], rec)
            if rec.get("status") in {"cut", "deferred"} or "positionM" not in rec:
                continue
            by_slug.setdefault(rec["id"].rsplit(".", 1)[-1], rec)
    out: list[dict] = []
    for row in rows:
        gid = row.get("geometryId")
        # A row this stage already laid is laid AGAIN: the compile rewrites
        # routes-minor.json from scratch, so skipping a solved row silently
        # dropped its track from the published file on every re-run
        # (found 2026-09-19). A geometryId from another stage is not ours.
        ours = isinstance(gid, str) and gid.startswith("track.")
        if not ours and (row.get("solved", True) or gid):
            continue
        if row.get("mode") not in REGISTRY_LAND_MODES or row.get("class") not in REGISTRY_LAND_CLASSES:
            continue
        start = by_slug.get(str(row.get("from")))
        end = by_slug.get(str(row.get("to")))
        joins = row.get("joinsRouteId")
        stage_ids = [sid for sid in (row.get("stages")
                                     or registry_stage_ids(row["id"], set(row.get("aliases") or []), files))
                     if sid in by_id
                     and sid not in {(start or {}).get("id"), (end or {}).get("id")}]
        # A row this stage is asked to lay gets an ANSWER, never silence: an
        # end or a stage the macro plot never placed is a refusal with a
        # reason, mirroring the minor-waterway rule (16g, 2026-09-19).
        gaps = [registry_place_gap(str(row.get("from")), all_by_slug)]
        if not joins:
            gaps.append(registry_place_gap(str(row.get("to")), all_by_slug))
        gaps += [f"stage {sid}: no positionM in the macro plot"
                 for sid in stage_ids if "positionM" not in by_id[sid]]
        gaps = [g for g in gaps if g]
        if gaps:
            out.append({"row": row, "from": start, "to": end, "joinsRouteId": joins,
                        "stages": [], "refusal": "; ".join(gaps)})
            continue
        stages = [by_id[sid] for sid in stage_ids]
        if end is not None:
            ax, az = start["positionM"]
            bx, bz = end["positionM"]
            vx, vz = bx - ax, bz - az
            stages.sort(key=lambda r: ((r["positionM"][0] - ax) * vx
                                       + (r["positionM"][1] - az) * vz))
        out.append({"row": row, "from": start, "to": end, "joinsRouteId": joins,
                    "stages": stages, "refusal": ""})
    return out


def route_geometry_cells(s, route_id: str) -> list[tuple[int, int]]:
    """The published cells of a major route, as (col, row)."""
    doc = json.loads((s.province / "routes.json").read_text())
    for r in doc["routes"]:
        if r.get("id") == route_id:
            return [(int(c), int(rr)) for c, rr in r["px"]]
    return []


def lay_registry_track(s, graph: "StepGraph", job: dict, height, px_m: float
                       ) -> tuple[dict | None, str]:
    """Solve one named registry row through its stages, in order.

    Each leg is its own least-cost solve on the same walled graph, so the whole
    line obeys the gradient cap and the line passes within one cell of every
    stage it was authored to serve. Returns (track, why) — `track` is None when
    an end or a stage has no land cell, or a leg has no land path at all.
    """
    row = job["row"]
    waypoints: list[tuple[int, int]] = []
    # `joinsRouteId` REPLACES the far endpoint: the row ends on the trunk, and
    # the trunk carries it the rest of the way to the place its `to` names.
    far = [] if job["joinsRouteId"] else ([job["to"]] if job["to"] else [])
    for rec in [job["from"]] + list(job["stages"]) + far:
        cell = nearest_land_cell(s, *rec["positionM"])
        if cell is None:
            return None, f"{rec['id']} has no land cell within {SNAP_M:.0f} m"
        if not waypoints or waypoints[-1] != cell:
            waypoints.append(cell)
    if job["joinsRouteId"]:
        cells = route_geometry_cells(s, job["joinsRouteId"])
        if not cells:
            return None, f"{job['joinsRouteId']} has no published geometry to join"
        r0, c0 = waypoints[-1]
        col, rr = min(cells, key=lambda p: (p[1] - r0) ** 2 + (p[0] - c0) ** 2)
        waypoints.append((int(rr), int(col)))
    if len(waypoints) < 2:
        return None, "both ends are the same cell"
    path: list[tuple[int, int]] = []
    for (ar, ac), (br, bc) in zip(waypoints, waypoints[1:]):
        seeds = np.zeros((s.grid_n, s.grid_n), dtype=bool)
        seeds[ar, ac] = True
        dist, prev = graph.field(seeds)
        if not np.isfinite(dist[br, bc]):
            return None, f"no land path from ({ar},{ac}) to ({br},{bc})"
        leg = list(reversed(trace(prev, br, bc, s.grid_n)))   # from a to b
        path += leg[1:] if path else leg
    length_m = sum(float(np.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1])) * px_m
                   for i in range(len(path) - 1))
    track = {
        "id": "track." + row["id"].split(".", 1)[1],
        "kind": row["class"],
        "endsAtTerminal": False,
        "from": job["from"]["id"],
        "to": (job["to"] or {}).get("id") or job["joinsRouteId"],
        "batch": 0, "lengthKm": round(length_m / 1000.0, 3),
        "px": [[int(c), int(r)] for c, r in path],
        "registryRoute": row["id"],
        "stages": [rec["id"] for rec in job["stages"]],
        "overCapSteps": over_cap_steps(path, height, px_m),
    }
    return track, ""


def solve_registry(doc: dict, write: bool = True, path: Path | None = None) -> list[dict]:
    """Settle every registry row this stage was asked to lay.

    A row it drew gets `geometryId` / `solved: true`; a row on
    `registryUnlaid` gets `solved: false` + `reason` and loses any stale
    `geometryId`. Mirrors the minor-waterway rule: an answer, never silence.
    """
    path = path or REGISTRY_PATH
    laid = {t["registryRoute"]: t["id"] for t in doc["tracks"] if t.get("registryRoute")}
    unlaid = {u["id"]: u["why"] for u in doc.get("registryUnlaid") or []}
    data = json.loads(path.read_text())
    solved = []
    changed = False
    for row in data["routes"]:
        gid = laid.get(row["id"])
        if gid:
            if row.get("geometryId") != gid or row.get("solved") is not True or "reason" in row:
                changed = True
            row["geometryId"], row["solved"] = gid, True
            row.pop("reason", None)
            solved.append({"id": row["id"], "geometryId": gid})
        elif row["id"] in unlaid:
            # asked for and not drawn: the row says so instead of carrying a
            # stale geometryId no file backs
            reason = unlaid[row["id"]]
            if (row.get("solved") is not False or row.get("geometryId")
                    or row.get("reason") != reason):
                changed = True
            row.pop("geometryId", None)
            row["solved"], row["reason"] = False, reason
    if write and changed:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return solved


# --------------------------------------------------------------------------- #
# vegetation clearance (decision 0070)
# --------------------------------------------------------------------------- #
def _simplify(points: list[tuple[float, float]], tol_m: float) -> list[tuple[float, float]]:
    """Douglas-Peucker, iterative so a long line cannot blow the stack."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        ax, az = points[i]
        bx, bz = points[j]
        dx, dz = bx - ax, bz - az
        norm = math.hypot(dx, dz)
        best_k, best_d = -1, tol_m
        for k in range(i + 1, j):
            x, z = points[k]
            d = (abs(dx * (az - z) - (ax - x) * dz) / norm if norm > 1e-9
                 else math.hypot(x - ax, z - az))
            if d > best_d:
                best_k, best_d = k, d
        if best_k >= 0:
            keep[best_k] = True
            stack += [(i, best_k), (best_k, j)]
    return [pt for pt, k in zip(points, keep) if k]


def corridor_polygons(points_m: list[tuple[float, float]], half_width_m: float
                      ) -> list[list[list[float]]]:
    """One quad per segment of a line, `half_width_m` either side.

    A single buffered outline round a kilometres-long switchbacking track
    self-intersects at every hairpin and the even-odd point-in-polygon test
    then reports the inside of the bend as outside. Per-segment quads cannot:
    each is convex, they overlap at the joints (which the union takes care of),
    and `vegetation_patches` already treats each field as a LIST of polygons.
    """
    out: list[list[list[float]]] = []
    for (ax, az), (bx, bz) in zip(points_m, points_m[1:]):
        dx, dz = bx - ax, bz - az
        norm = math.hypot(dx, dz)
        if norm < 1e-9:
            continue
        nx, nz = -dz / norm * half_width_m, dx / norm * half_width_m
        # extend each end by the half width so the joints are capped
        ex, ez = dx / norm * half_width_m, dz / norm * half_width_m
        out.append([[round(ax - ex + nx, 3), round(az - ez + nz, 3)],
                    [round(bx + ex + nx, 3), round(bz + ez + nz, 3)],
                    [round(bx + ex - nx, 3), round(bz + ez - nz, 3)],
                    [round(ax - ex - nx, 3), round(az - ez - nz, 3)]])
    return out


def clearance_patch(track: dict, px_m: float) -> dict | None:
    """The `vegetation-clearance` patch one minor way clears for itself.

    `hardClear` is the running surface — the way's own class width, nothing
    grows on it. `thinned` is the trodden fringe either side, one width wide,
    which the patch grades from `FRINGE_MIN_KEEP` at the edge of the surface
    out to wild marsh: a track through rootland is walked, not landscaped.
    """
    width = CLASS_WIDTH_M.get(track["kind"])
    if width is None:
        return None
    line = _simplify([((c + 0.5) * px_m, (r + 0.5) * px_m) for c, r in track["px"]],
                     CORRIDOR_SIMPLIFY_M)
    hard = corridor_polygons(line, width / 2.0)
    thinned = corridor_polygons(line, width / 2.0 + width)
    if not hard:
        return None
    return {
        "id": TRACK_PATCH_PREFIX + track["id"],
        "kind": vp.PATCH_KIND,
        "owner": {"record": track["from"], "chunk": "16g"},
        "why": (f"the {track['kind']} is walked ground. Nothing grows on the "
                f"{width:.1f} m running surface. The fringe either side is trodden down, "
                f"not landscaped"),
        "fringeFalloffM": round(float(width), 3),
        "hardClear": hard,
        "thinned": thinned,
    }


def write_clearance_patches(doc: dict, px_m: float, path: Path | None = None) -> list[dict]:
    """Replace the whole `patch.clearance.track.*` set in the patch file.

    Every other patch id is left exactly as it was — 16h's settlements and
    Phase 15's packets are other authors writing into the same one record —
    and the result is sorted by id and byte-stable, so a run that changes no
    track rewrites the same bytes.
    """
    path = path or vp.PATCHES_PATH
    data = json.loads(path.read_text())
    mine = [p for p in (clearance_patch(t, px_m) for t in doc["tracks"]) if p]
    others = [p for p in data.get("patches", [])
              if not str(p.get("id", "")).startswith(TRACK_PATCH_PREFIX)]
    data["patches"] = sorted(others + mine, key=lambda p: p["id"])
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return mine


def run(write: bool = True) -> dict:
    s = shared_survey()
    files = catalogue.load_region_files()
    cost = cost_surface(s)
    height = s.height_grid            # natural ground; the property re-derives, so hoist it
    network = rasterise_routes(s)
    w = s.grid_n
    px_m = s.grid_px_m
    tracks: list[dict] = []
    unconnected: list[dict] = []
    on_road = 0
    # WHICH records arrived already on a road, not just how many: the invariant
    # test used to reconstruct the number from the catalogue and could only
    # ever restate its own arithmetic (16g review, 2026-09-19).
    on_road_ids: list[str] = []
    terminals = blueprint_terminals()
    # A hand-authored track is published exactly as drawn — same contract as
    # `authored_waterways`. It still gets its length, its class and its network
    # cells from the authored line, so everything downstream sees a real way.
    authored = load_by_id()
    batches = demand(files, set(terminals))
    # One graph for all four batches: only the seeds change between them.
    graph = StepGraph(cost, px_m, height, ROUTING_CAP_DEG)
    for bi, batch in enumerate(batches, start=1):
        dist, prev = graph.field(network)
        new_cells = np.zeros_like(network)
        for rec in batch:
            x, z = rec["positionM"]
            # A blueprint's declared gate/landing wins over the plotted dot: the
            # path must end where the place lets you in (owner 2026-09-05).
            terminal = terminals.get(rec["id"])
            entry_uv = terminal["entryUV"] if terminal else None
            if entry_uv is not None:
                x, z = s.uv_to_m(*entry_uv)
            track_id = "track." + rec["id"].split(".", 1)[1]
            override = authored.get(track_id)
            if override is not None:
                # AUTHORED: the drawn line IS the path. No solve, no arrival or
                # length test — the author has already answered both questions.
                path = [(int(c), int(r)) for c, r in to_px(override, px_m, w)]
            else:
                path = None
            row, col = s.grid_px(float(x), float(z))
            if path is None and not s.land[row, col]:
                # a submerged / island record: walk to the nearest land cell first
                land_rc = np.argwhere(s.land)
                d2 = (land_rc[:, 0] - row) ** 2 + (land_rc[:, 1] - col) ** 2
                k = int(np.argmin(d2))
                if float(np.sqrt(d2[k])) * px_m > SNAP_M:
                    unconnected.append({"id": rec["id"], "why": "no land within the snap; boat-served"})
                    continue
                row, col = map(int, land_rc[k])
            if path is None and not np.isfinite(dist[row, col]):
                unconnected.append({"id": rec["id"], "why": "no land path at all"})
                continue
            if path is None:
                path = trace(prev, row, col, w)
                if terminal and terminal["wayPoints"]:
                    # the track head is the declared terminal CLAMPED to the
                    # first point of the place's own way the line reaches
                    path = clamp_to_way(path, way_cells(s, terminal["wayPoints"]))
            length_m = sum(np.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]) * px_m
                           for i in range(len(path) - 1))
            if override is None and length_m <= ARRIVAL_M:
                on_road += 1
                on_road_ids.append(rec["id"])
                continue
            if override is None and length_m > MAX_TRACK_M and rec["classification"]["class"] != "settlement":
                unconnected.append({"id": rec["id"], "why": f"cheapest land path {length_m / 1000:.1f} km", "batch": bi})
                continue
            # A SETTLEMENT always keeps its path, however long. People live
            # there and walk out; "no way in on foot" is a worse world fact
            # than a long one, and since the solver holds the gradient cap the
            # long line is the honest length of a walkable approach to a hill
            # village. Listed in the digest so the length stays visible.
            kind = classify(s, path, rec["classification"].get("magnitude"), rec["classification"]["class"],
                            terminal["kind"] if terminal else None)
            end_c, end_r = path[-1]
            track = {
                "id": track_id,
                "kind": kind,
                "endsAtTerminal": entry_uv is not None, "from": rec["id"], "to": "network",
                "batch": bi, "lengthKm": round(length_m / 1000.0, 3),
                "px": [[int(c), int(r)] for c, r in path],
            }
            if override is not None:
                track["authoredGeometryDigest"] = override["contentDigest"]
            if entry_uv is not None:
                # the EXACT terminal, in world metres. The traced path is a
                # chain of 5.48 m raster cells, so its first vertex is the cell
                # the gate falls in, up to a cell-diagonal from the gate itself;
                # `province_network` puts this point back on the head of the
                # line so a blueprint's terminal check measures against the
                # place the path actually ends, not the pixel it rounded to.
                tx, tz = s.uv_to_m(*entry_uv)
                if terminal and terminal["wayPoints"]:
                    # the clamp may have stopped the line short of the declared
                    # gate: the head the world carries is where it actually ends
                    head_c, head_r = path[0]
                    tx, tz = (head_c + 0.5) * px_m, (head_r + 0.5) * px_m
                track["endsAtM"] = [round(float(tx), 3), round(float(tz), 3)]
            track["overCapSteps"] = over_cap_steps(path, height, px_m)
            if bi == 4:
                # real ground, off the drawn map: the place stays found by rumour
                track["unmapped"] = True
            tracks.append(track)
            for c, r in path:
                new_cells[r, c] = True
        network |= new_cells
    # The NAMED rows of the route registry, laid through their stages on the
    # same walled graph (16g deliverable 5).
    registry_unlaid: list[dict] = []
    registry_laid: list[str] = []
    for job in registry_demand(files):
        if job["refusal"]:
            registry_unlaid.append({"id": job["row"]["id"], "why": job["refusal"]})
            continue
        track, why = lay_registry_track(s, graph, job, height, px_m)
        if track is None:
            registry_unlaid.append({"id": job["row"]["id"], "why": why})
            continue
        tracks.append(track)
        registry_laid.append(job["row"]["id"])
        for c, r in track["px"]:
            network[r, c] = True
    tracks.sort(key=lambda t: t["id"])
    doc = {"schemaVersion": SCHEMA_VERSION, "kind": "minor-routes",
           "generatedBy": "worldgen.compile_minor_routes (Phase 11 Part 3b, decision 0041)",
           "grid": {"size": w, "metresPerPixel": px_m},
           "costs": {"wetland": COST_WETLAND, "wetSeason": COST_WET_SEASON, "mountain": COST_MOUNTAIN,
                     "river": COST_RIVER, "openWater": COST_DEEP, "jungle": COST_JUNGLE},
           "arrivalM": ARRIVAL_M, "maxTrackM": MAX_TRACK_M,
           "summary": {"tracks": len(tracks), "onRoadAlready": on_road,
                       "onRoadIds": sorted(on_road_ids), "unconnected": len(unconnected),
                       "byKind": {k: sum(1 for t in tracks if t["kind"] == k)
                                  for k in ("track", "footpath", "boardwalk", "causeway")},
                       "totalKm": round(sum(t["lengthKm"] for t in tracks), 2)},
           "unconnected": unconnected,
           "registryLaid": registry_laid, "registryUnlaid": registry_unlaid,
           "tracks": tracks}
    doc["summary"]["registryTracks"] = len(registry_laid)
    doc["summary"]["overCapSteps"] = sum(int(t.get("overCapSteps") or 0) for t in tracks)
    doc["summary"]["unmapped"] = sum(1 for t in tracks if t.get("unmapped"))
    if write:
        write_clearance_patches(doc, px_m)
        OUT_JSON.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        # keep any Part 3c (minor waterways) section that follows ours
        old = OUT_MD.read_text(encoding="utf-8") if OUT_MD.exists() else ""
        mark = "## Minor waterways"
        tail = ("\n\n" + mark + old.split(mark, 1)[1].rstrip("\n") + "\n") if mark in old else ""
        OUT_MD.write_text(digest(doc).rstrip("\n") + "\n" + tail, encoding="utf-8")
    return doc


def digest(doc: dict) -> str:
    sm = doc["summary"]
    L = ["# Minor routes — tracks, footpaths, boardwalks, causeways (Phase 11 Part 3b)", "",
         f"Derived from the macro plot by `worldgen.compile_minor_routes`; data in "
         f"`apps/world-studio/public/province/routes-minor.json`.", "",
         f"- **{sm['tracks']} paths**, {sm['totalKm']} km in total: " +
         ", ".join(f"{k} {v}" for k, v in sm["byKind"].items()),
         f"- {sm['onRoadAlready']} places were already on a road or landing (within {doc['arrivalM']:.0f} m)",
         f"- {sm.get('unmapped', 0)} of the paths are **unmapped** (batch 4): routed, graded and painted "
         f"ground that the player's map never draws, so a rumoured place is still found by walking",
         f"- {sm['unconnected']} places have **no land path** (boat-, guide- or root-served — a design fact to check, "
         f"not a failure; longest allowed path {doc['maxTrackM'] / 1000:.1f} km):", ""]
    for u in doc["unconnected"]:
        L.append(f"  - `{u['id']}` — {u['why']}")
    long = [t for t in doc["tracks"] if t["lengthKm"] * 1000.0 > doc["maxTrackM"]]
    if long:
        L += ["", f"- {len(long)} settlements sit further than {doc['maxTrackM'] / 1000:.1f} km "
              "along the cheapest walkable line and keep their path anyway "
              "(a settlement is always reachable on foot): " +
              ", ".join(f"`{t['from']}` ({t['lengthKm']} km)" for t in
                        sorted(long, key=lambda t: -t["lengthKm"]))]
    L += ["", "## Longest paths", "", "| path | kind | km |", "|---|---|---|"]
    for t in sorted(doc["tracks"], key=lambda t: -t["lengthKm"])[:15]:
        L.append(f"| `{t['from']}` | {t['kind']} | {t['lengthKm']} |")
    return "\n".join(L) + "\n"


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--registry", action="store_true",
                    help="also attach geometryId / solved:true to world/sources/routes/registry.json")
    a = ap.parse_args(argv)
    doc = run(write=not a.dry_run)
    solved: list[dict] = []
    if not a.dry_run and a.registry:
        solved = solve_registry(doc)
    sm = doc["summary"]
    print(f"[minor-routes] {sm['tracks']} paths ({sm['totalKm']} km) {sm['byKind']}; "
          f"on-road {sm['onRoadAlready']}; unconnected {sm['unconnected']}; "
          f"named registry tracks {sm['registryTracks']}; registry solved {len(solved)}")
    for u in doc["registryUnlaid"]:
        print(f"[minor-routes] NOT LAID {u['id']}: {u['why']}")


if __name__ == "__main__":
    main()
