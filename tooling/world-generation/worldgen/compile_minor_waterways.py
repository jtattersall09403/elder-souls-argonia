"""Phase 11 Part 3c — the MINOR WATER network: channels, rivers, ferry crossings.

    cd tooling/world-generation
    python3 -m worldgen.compile_minor_waterways

WHY THIS EXISTS (owner ask, 2026-09-04)
---------------------------------------
Part 3b derived the minor LAND network (tracks, footpaths, boardwalks) but
left the water half undone: decision 0041 § Part 3b named it "Part 3c". In
Black Marsh the water *is* the road — a poled canoe reaches more places than
any cart — so the boat network has to be a real semantic network like the
roads, with every minor channel drawn on the map, not just the nine
anchor-to-anchor lanes of Phase 4.

WHAT IT DOES
------------
Least-cost water paths (Dijkstra on the published rasters via `ProvinceSurvey`,
using the Phase 4 boat cost surface from `worldgen.routes`) from every plotted
water-bound place to the nearest cell of the water network so far, in two
batches so channels chain into stations rather than each running to the
trunk lane:

    1. boat/ferry/lighter/pilot travel stations  → major lanes + river corridors
    2. every other water-bound place             → the network incl. batch 1

Water-bound means any of: a `travelStation` with a boat/ferry/lighter/pilot
mode; a `transit`/`landing` or `transit`/`crossing` place; a water-village;
a place with `underwaterAccess != none` sitting on or beside water; a place
whose `relations.travelServiceEdges` name a `route.boat.*` or a channel-class
`route.track.*`.

The graph is water only — land cells are impassable, so a path is a real
boat path and never a disguised portage. A place standing on dry ground is
snapped to the nearest navigable cell within SNAP_M (its own landing); if
there is none, or the water it sits on is a closed pool, it is listed as
`unconnected` — that is a design fact (a place reached on foot or by root),
not a failure.

Classes: `crossing` (a short bank-to-bank ferry hop), `river` (mostly a
navigable river corridor or lake), `channel` (poled/canoe shallow water —
the default).

Deterministic: no randomness; the batches are sorted by id and the heap
breaks ties by (cost, row, col).

WHAT IT WRITES
--------------
* `apps/world-studio/public/province/waterways-minor.json` — same shape as
  `routes-minor.json` (the studio draws it; Part 6's compilers and fast
  travel consume it).
* a section in `world/sources/sites/minor-routes.md` — the digest.
* `refusedBerths` in that JSON — a berth the COMPILED water cannot carry gets
  no connector at all, and a test stays red until it is authored or fixed. One
  unpublishable dock does not stop the network from publishing (owner
  2026-09-09), and it never buys its way in with a fabricated dry join.
* nothing else: registry solving is a separate opt-in flag (`--registry`).
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy import ndimage

from . import blueprint as bp_mod
from . import catalogue
from .compile_minor_routes import OUT_MD, StepGraph, trace
from .hydrology_intent import load_authored_minor_waterways
from .routes import boat_cost_surface
from .site_fields import ProvinceSurvey
from .water_report import ShippedWater

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_JSON = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "waterways-minor.json"
NATURAL_JSON = OUT_JSON.with_name("waterways-minor-natural.json")
REPAIR_MARKER = OUT_JSON.with_name("waterways-minor-repaired-by.json")
REGISTRY_PATH = REPO_ROOT / "world" / "sources" / "routes" / "registry.json"

SCHEMA_VERSION = 3   # +`season`/`dryCells` per channel; navigable is now the
                     # MEASURED base-season depth, not five class rasters
                     # (2026-09-09, decision 0049)
ARRIVAL_M = 45.0        # already on a lane or navigable river: no channel
MAX_CHANNEL_M = 9000.0  # beyond this the place is not water-served
SNAP_M = 260.0          # how far a dry-footed place may reach its own landing
CROSSING_M = 420.0      # a bank-to-bank ferry hop
# Re-ending a raster route on an authored berth may absorb only the ordinary
# cell-centre quantisation that the dock consumer already permits.  A longer
# gap is not route geometry: it is missing pre-water channel geometry, and
# drawing a straight segment across it fabricates water over unknown ground.
FIXED_DOCK_WET_JOIN_M = bp_mod.DOCK_TERMINAL_TOLERANCE_M
BOAT_MODES = {"boat", "ferry", "lighter", "pilot"}
WATER_FAMILIES = {"landing", "water-village", "crossing", "submerged-way"}

# How far a DERIVED centreline may be moved sideways onto the axis of the water
# it claims to run down (defect 2, owner review 2026-09-08). The routing grid is
# a 5.48 m cell walk, so a trench about two cells wide is clipped onto its lip
# at every bend. One and a half cells is enough to cross from a lip to the axis
# of such a trench and never enough to jump into a different body — and the
# scan below will only cross water that is continuously wet anyway.
AXIS_SNAP_M = 1.5 * 5.48352
AXIS_SNAP_STEP_M = 0.5          # finer than the routing grid, which is the point
# The shallowest hull the province floats: a berth may not be certified against
# mere membership of a raster blob, it needs water a poled canoe can sit in.
MIN_BERTH_DEPTH_M = bp_mod.HULL_CLASS_DEPTH_M["canoe"]


# --------------------------------------------------------------------------- #
# berths (owner review 2026-09-08)
# --------------------------------------------------------------------------- #
# A dock is a water terminal: the channel that serves a place ends AT the berth,
# not at the anchor pixel the macro plot put on the settlement's centre of
# gravity. This is the same mechanism `lane-terminals.json` gives the Phase 4
# boat lanes, derived here from the blueprint instead of hand-declared, and it
# runs BOTH ways per dock (`docks[].fit`):
#   water-to-dock — the channel is re-ended at the authored berth;
#   to-water      — the berth is the point the published water reaches, so the
#                   channel is solved to the nearest navigable cell that carries
#                   the dock's hull class and the blueprint's dock position is
#                   authored there.
# `blueprint.py` holds the HARD check that the two agree (within 10 m, at hull
# depth 100 m out); this module is what makes them agree.
HULL_DEPTH_M = bp_mod.HULL_CLASS_DEPTH_M


@lru_cache(maxsize=1)
def centre_depth_grid(s: ProvinceSurvey) -> np.ndarray:
    """Published water depth AT EACH GRID CELL CENTRE — the same number
    `ProvinceSurvey.sample()` reports, so the depth this compiler sites a berth
    by is the depth `blueprint.py` then checks it against."""
    idx = np.clip(((np.arange(s.grid_n) + 0.5) * s.grid_px_m / s.height_px_m).astype(int),
                  0, s.water_depth_m.shape[0] - 1)
    return s.water_depth_m[np.ix_(idx, idx)]


# --------------------------------------------------------------------------- #
# the COMPILED water — the only water this compiler validates against
# --------------------------------------------------------------------------- #
# The macro hydrology raster is a coarse plan; the signed-depth raster under
# `apps/world-studio/public/province/water/` is what ships and what the runtime
# and `dock_dredge` read. Validating a berth against the plan is the circular
# check decision 0047 exists to remove: a macro "lake" blob 50 cells across can
# publish as 100 % dry ground. Everything below therefore reads the compiled
# water, and where it cannot be opened it RAISES: a guard that cannot see the
# water it is guarding must not report success.
@lru_cache(maxsize=1)
def compiled_water() -> ShippedWater:
    try:
        return ShippedWater()
    except Exception as exc:  # noqa: BLE001 — any failure is a blind guard
        raise ValueError(
            "compiled water is unavailable "
            "(apps/world-studio/public/province/water/): the berth and centreline "
            f"checks cannot be run against the water that ships — {exc}") from exc


def compiled_depth_at(water: ShippedWater, x: float, z: float) -> float:
    """Published depth in metres at a world point, 0.0 on dry ground."""
    n = water.depth2.shape[0]
    row = int(np.clip(z / water.mpp2, 0, n - 1))
    col = int(np.clip(x / water.mpp2, 0, n - 1))
    return float(water.depth2[row, col])


def nearest_compiled_water_m(water: ShippedWater, x: float, z: float,
                             min_depth_m: float, radius_m: float) -> float | None:
    """Distance to the nearest COMPILED cell at least `min_depth_m` deep, or
    None if there is none within `radius_m`."""
    n = water.depth2.shape[0]
    cy, cx = z / water.mpp2, x / water.mpp2
    rad = int(np.ceil(radius_m / water.mpp2)) + 1
    r0, r1 = max(int(cy) - rad, 0), min(int(cy) + rad + 1, n)
    c0, c1 = max(int(cx) - rad, 0), min(int(cx) + rad + 1, n)
    deep = np.argwhere(water.depth2[r0:r1, c0:c1] >= min_depth_m)
    if not len(deep):
        return None
    dist = np.hypot((deep[:, 0] + r0 + 0.5) - cy, (deep[:, 1] + c0 + 0.5) - cx) * water.mpp2
    best = float(dist.min())
    return best if best <= radius_m else None


@lru_cache(maxsize=1)
def blueprint_docks() -> dict[str, list[dict]]:
    """{place id: [dock, ...]} — every berth the blueprints declare, in id
    order, so the channels are solved deterministically."""
    out: dict[str, list[dict]] = {}
    if not bp_mod.BLUEPRINT_DIR.exists():
        return out
    for path in sorted(bp_mod.BLUEPRINT_DIR.glob("*.json")):
        try:
            bp = json.loads(path.read_text()).get("blueprint") or {}
        except (OSError, json.JSONDecodeError):
            continue
        docks = [d for d in (bp.get("docks") or [])
                 if isinstance(d.get("position"), list) and len(d["position"]) == 2]
        if docks and bp.get("id"):
            out[bp["id"]] = sorted(docks, key=lambda d: str(d.get("id")))
    return out


def dock_fit(dock: dict, s: ProvinceSurvey, depth_grid) -> str:
    """The declared `fit`, or the derivation blueprint.py documents: the berth
    keeps its place when its own water already carries its hull class."""
    if dock.get("fit") in bp_mod.DOCK_FITS:
        return dock["fit"]
    need = HULL_DEPTH_M.get(dock.get("hullClass"), 0.0)
    x, z = s.uv_to_m(float(dock["position"][0]), float(dock["position"][1]))
    row, col = s.grid_px(x, z)
    # The published signed depth is the only answer. There is no credit for
    # class membership: the surface raster publishes a depth on every cell,
    # and where a berth is dry it reads negative (see blueprint._water_depth_at).
    here = float(depth_grid[row, col])
    return "water-to-dock" if here + 1e-6 >= need else "to-water"


def channel_targets(rec: dict, docks: list[dict], s: ProvinceSurvey,
                    *, fit_docks: bool) -> list[tuple[str, tuple[float, float], dict | None]]:
    """Return solve targets without allowing an ordinary dock to author water.

    The natural answer is always based on the macro place anchor.  Only a
    berth explicitly marked ``water-to-dock`` *and* carrying a structured
    ``fixedBerthReason`` may replace that physical target in publication.
    """
    slug = rec["id"].split(".", 1)[1]
    if fit_docks:
        fixed = [d for d in docks
                 if d.get("fit") == "water-to-dock" and d.get("fixedBerthReason")]
        if fixed:
            return [
                ("waterway." + slug + "." + str(d.get("id", "")).rsplit(".", 1)[-1],
                 s.uv_to_m(float(d["position"][0]), float(d["position"][1])), d)
                for d in fixed
            ]
    return [("waterway." + slug, tuple(rec["positionM"]), None)]


SEASON_YEAR_ROUND = "year-round"
SEASON_WET = "wet-season"
SEASON_DRY = "dry"          # never navigable; a defect, never published


def channel_season(s: ProvinceSurvey, path: list[tuple[int, int]]) -> tuple[str, int]:
    """Type a published channel by the season its water is actually there.

    Returns (season, cells dry in EVERY season). A lane navigable only in
    flood is a real thing in a marsh province — 90 of the 6,820 shipped minor
    channel cells (1.3%) are wet only in the wet season — so it is DECLARED,
    not inferred and not silently deleted. A cell dry in every season is not
    seasonal, it is wrong: 215 cells (3.2%) across 44 channels are in that
    group today, and the digest lists the worst of them.

    The A* solve runs on `navigable` (base season), so a solved channel comes
    out year-round by construction. This bites on `_authored_channel`, which
    publishes an authored centreline WITHOUT the navigable solve.
    """
    base_grid = getattr(s, "wet_grid", None)
    season_grid = getattr(s, "wet_season_grid", None)
    if not path or base_grid is None or season_grid is None:
        # duck-typed survey without the published rasters (the test stubs):
        # no measurement is available, so nothing is claimed.
        return SEASON_YEAR_ROUND, 0
    rows = np.array([r for _c, r in path])
    cols = np.array([c for c, _r in path])
    base = base_grid[rows, cols]
    seasonal = season_grid[rows, cols]
    dry_always = int((~seasonal).sum())
    if dry_always:
        return SEASON_DRY, dry_always
    return (SEASON_YEAR_ROUND if bool(base.all()) else SEASON_WET), 0


def navigable(s: ProvinceSurvey) -> np.ndarray:
    """Every cell a hull or a pole can move through: MEASURED standing water.

    BASE season: a published lane must carry its hull all year. A flood-only
    lane is typed via `channel_season`, never produced by accident here.

    Was `open_water | lakes | tidal | wetlands | river_band > 0` — five class
    rasters and not one depth. That mask covers 23.42 km2 of which 3.24 km2
    (13.8%) is ground the water compiler publishes as dry, so it licensed
    lanes over dry land: 187 of the cells now published still sit inside it
    while the depth reads dry. Nothing carves them — the `poling-channel` terrain patch carves
    the authored list only — so they are typed and listed instead.
    """
    return s.wet_grid


def cost_surface(s: ProvinceSurvey) -> np.ndarray:
    """Phase 4 boat costs on the published rasters; land is impassable."""
    ocean = s.open_water & ~s.lakes & (s.river_band == 0)
    cost = boat_cost_surface(ocean, s.lakes, s.river_band, s.tidal, s.wetlands)
    return np.where(navigable(s), cost, np.inf)


def seed_network(s: ProvinceSurvey) -> np.ndarray:
    """Major boat lanes plus the navigable river corridors (band >= 2)."""
    n = s.grid_n
    mask = np.zeros((n, n), dtype=bool)
    for r in s.routes:
        if r.kind != "boat":
            continue
        for x, z in r.points_m:
            row, col = s.grid_px(float(x), float(z))
            mask[row, col] = True
    mask = ndimage.binary_dilation(mask, iterations=1)
    mask |= s.river_band >= 2
    return mask & navigable(s)


def _snap(s: ProvinceSurvey, reachable: np.ndarray, row: int, col: int,
          depth_grid: np.ndarray | None = None, min_depth_m: float = 0.0) -> tuple[int, int] | None:
    """Nearest CONNECTED navigable cell within SNAP_M — the place's landing.

    Connected, not merely navigable: half the marsh raster is one-pixel
    puddles, and snapping into one would strand a place that in fact sits a
    few metres from a live channel."""
    # A BERTH (min_depth_m > 0) may only be sited where the province publishes
    # real water: deep enough for the hull class AND inside `open_water` — now
    # a measured mask (signed depth > 0.5 m), the same one every other check
    # reads (blueprint_integration's canal test among them). Snapping a landing
    # into 0.4 m of marsh is how a dock ends up "beside" its water.
    nav = reachable if (depth_grid is None or min_depth_m <= 0.0) else (
        reachable & (depth_grid >= min_depth_m) & s.open_water)
    if nav[row, col]:
        return row, col
    rad = int(SNAP_M / s.grid_px_m) + 1
    r0, r1 = max(row - rad, 0), min(row + rad + 1, s.grid_n)
    c0, c1 = max(col - rad, 0), min(col + rad + 1, s.grid_n)
    sub = np.argwhere(nav[r0:r1, c0:c1])
    if not len(sub):
        return None
    d2 = (sub[:, 0] + r0 - row) ** 2 + (sub[:, 1] + c0 - col) ** 2
    best = int(np.argmin(d2))
    if np.sqrt(d2[best]) * s.grid_px_m > SNAP_M:
        return None
    return int(sub[best, 0] + r0), int(sub[best, 1] + c0)


def is_water_bound(rec: dict) -> bool:
    ts = rec.get("travelStation") or {}
    if set(ts.get("modes") or []) & BOAT_MODES:
        return True
    cl = rec["classification"]
    if cl.get("family") in WATER_FAMILIES:
        return True
    if rec.get("underwaterAccess", "none") != "none":
        return True
    if rec["id"] in blueprint_docks():
        # a blueprint that declares a berth is water-served by construction —
        # the berth is the promise, and this compiler is what keeps it
        return True
    for edge in (rec.get("relations", {}) or {}).get("travelServiceEdges", []) or []:
        ref = edge.split(":", 1)[-1]
        if ref.startswith("route.boat.") or edge.split(":", 1)[0] in BOAT_MODES:
            return True
    return False


def demand(files: list[catalogue.RegionFile]) -> list[list[dict]]:
    b1, b2 = [], []
    for rf in files:
        for rec in rf.places:
            if rec.get("status") in {"cut", "deferred"} or "positionM" not in rec:
                continue
            if not is_water_bound(rec):
                continue
            ts = rec.get("travelStation") or {}
            (b1 if set(ts.get("modes") or []) & BOAT_MODES else b2).append(rec)
    return [sorted(b1, key=lambda r: r["id"]), sorted(b2, key=lambda r: r["id"])]


def is_ferry_crossing(rec: dict) -> bool:
    """A ferry crossing is a *named bank-to-bank service*, not just any short
    hop: the place has to be a crossing/landing that runs a ferry."""
    ts = rec.get("travelStation") or {}
    if "ferry" in (ts.get("modes") or []):
        return True
    return rec["classification"].get("family") == "crossing"


def classify(s: ProvinceSurvey, path: list[tuple[int, int]], length_m: float, rec: dict) -> str:
    cells = np.array([(r, c) for c, r in path])
    rows, cols = cells[:, 0], cells[:, 1]
    if length_m <= CROSSING_M and is_ferry_crossing(rec):
        return "crossing"
    corridor = float(((s.river_band[rows, cols] >= 2) | s.lakes[rows, cols]).mean())
    return "river" if corridor >= 0.5 else "channel"


@dataclass(frozen=True)
class SolveContext:
    """Immutable inputs shared by the natural and berth-fitted solves.

    Constructing the sparse step graph is the expensive part of this compiler.
    Natural and fitted publication use the same physical cost surface, so one
    graph is sufficient; each solve still computes its own distance fields as
    its growing channel network can differ.
    """

    survey: ProvinceSurvey
    files: list[catalogue.RegionFile]
    nav: np.ndarray
    seed: np.ndarray
    depth: np.ndarray
    docks: dict[str, list[dict]]
    authored: dict[str, dict]
    graph: StepGraph


def solve_context() -> SolveContext:
    s = ProvinceSurvey()
    files = catalogue.load_region_files()
    cost = cost_surface(s)
    nav = navigable(s)
    authored_rows, authored_errors = load_authored_minor_waterways()
    if authored_errors:
        raise ValueError("invalid authored minor waterways: " + "; ".join(authored_errors))
    return SolveContext(
        survey=s,
        files=files,
        nav=nav,
        seed=seed_network(s),
        depth=centre_depth_grid(s),
        docks=blueprint_docks(),
        authored={row["id"]: row for row in authored_rows},
        graph=StepGraph(cost, s.grid_px_m),
    )


def _authored_path(s: ProvinceSurvey, authored: dict) -> list[tuple[int, int]]:
    """Raster cells for an authored centreline, from its berth to the network."""
    return cells_along(s, list(reversed(authored["pointsM"])))


def _authored_dock(authored: dict, docks: list[dict], s: ProvinceSurvey) -> dict:
    terminal = tuple(float(v) for v in authored["terminalM"])
    matches = [dock for dock in docks
               if isinstance(dock.get("position"), list) and len(dock["position"]) == 2
               and np.hypot(*(np.asarray(s.uv_to_m(*dock["position"])) - terminal)) <= 0.05]
    if len(matches) != 1:
        raise ValueError(f"{authored['id']}: authored terminal must match exactly one blueprint "
                         f"dock; found {len(matches)}")
    return matches[0]


def _authored_channel(authored: dict, rec: dict, batch: int,
                      s: ProvinceSurvey, docks: list[dict]) -> tuple[dict, list[tuple[int, int]]]:
    """Publish the source centreline instead of inventing a second A* route."""
    dock = _authored_dock(authored, docks, s)
    path = _authored_path(s, authored)
    points = [list(map(float, point)) for point in reversed(authored["pointsM"])]
    length_m = sum(np.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:]))
    terminal = [round(float(v), 3) for v in authored["terminalM"]]
    season, dry_cells = channel_season(s, path)
    return ({
        "id": authored["id"], "kind": "channel", "class": "channel",
        "from": rec["id"], "to": "network", "batch": batch,
        "lengthKm": round(float(length_m) / 1000.0, 3),
        "px": [[int(c), int(r)] for c, r in path],
        # Exact metre geometry is authoritative. `px` remains for the studio's
        # map layer and network raster, but may not move the authored line.
        "pointsM": points,
        "dockId": dock["id"], "fit": dock.get("fit") or "to-water",
        "endsAtM": terminal, "terminalId": authored.get("terminalId"),
        "authoredGeometryDigest": authored["contentDigest"],
        "season": season, "dryCells": dry_cells,
    }, path)


def require_fixed_dock_wet_join(route_id: str, target_m: tuple[float, float],
                                hull_class: str | None = None,
                                water: ShippedWater | None = None) -> float:
    """Reject a synthetic dry join from a fixed berth to a wet-only solve.

    ``water-to-dock`` fixes the published terminal, but it does not author the
    unknown ground between that terminal and the first water a hull can float
    in.  The exact-terminal substitution is safe only inside the same 10 m
    tolerance used by the independent dock consumer.  Anything longer needs an
    absolute centreline in ``authored-minor-waterways.json`` so terrain can be
    carved before water and the route can publish that same geometry after.

    Measured against the COMPILED water (defect 1, 2026-09-08).  This used to
    read the macro hydrology raster, where a berth sitting inside a 50-cell
    "lake" blob that publishes as bone-dry ground scored a 0 m gap and passed —
    validating the dock against a coarser water than the one that ships.  Real
    published depth is required now, not membership of a plan raster.
    """
    hint = "world/sources/routes/authored-minor-waterways.json"
    water = water if water is not None else compiled_water()
    need = max(HULL_DEPTH_M.get(hull_class or "", 0.0), MIN_BERTH_DEPTH_M)
    x, z = float(target_m[0]), float(target_m[1])
    gap_m = nearest_compiled_water_m(water, x, z, need, FIXED_DOCK_WET_JOIN_M)
    if gap_m is not None:
        return gap_m
    far = nearest_compiled_water_m(water, x, z, need, MAX_CHANNEL_M)
    where = (f"the nearest published water carrying {need:.1f} m is {far:.1f} m away"
             if far is not None else
             f"no published water carries {need:.1f} m within {MAX_CHANNEL_M / 1000:.0f} km")
    raise ValueError(
        f"{route_id}: fixed water-to-dock berth stands where the compiled water "
        f"publishes {compiled_depth_at(water, x, z):.2f} m of depth (needs {need:.1f} m within "
        f"{FIXED_DOCK_WET_JOIN_M:.0f} m); {where}. Refusing to fabricate a dry "
        f"connector by replacing the route end: author the full pre-water "
        f"centreline in {hint} so it can be carved and published as one "
        f"physical channel")


def check_fixed_dock_wet_join(route_id: str, target_m: tuple[float, float],
                              hull_class: str | None,
                              water: ShippedWater) -> dict | None:
    """The refusal, scoped to the dock instead of to the run.

    One unpublishable berth must not stop the network from publishing (owner
    2026-09-09). The refusal itself is unchanged and absolute — no fabricated
    dry connector, no berth moved, no hull class lowered — but it is RECORDED
    on the output with its measured numbers rather than raised, and
    `test_minor_waterways` stays red while anything is recorded. Same shape as
    the `unauthored` structures in `worldgen.author_route_structures`.

    Returns None when the berth is wet, or the refusal record when it is not.
    """
    try:
        require_fixed_dock_wet_join(route_id, target_m, hull_class, water)
        return None
    except ValueError as refusal:
        x, z = float(target_m[0]), float(target_m[1])
        need = max(HULL_DEPTH_M.get(hull_class or "", 0.0), MIN_BERTH_DEPTH_M)
        nearest = nearest_compiled_water_m(water, x, z, need, MAX_CHANNEL_M)
        return {
            "id": route_id,
            "hullClass": hull_class,
            "berthM": [round(x, 3), round(z, 3)],
            "needM": need,
            "depthAtBerthM": round(compiled_depth_at(water, x, z), 3),
            "nearestWaterM": round(nearest, 1) if nearest is not None else None,
            "why": str(refusal),
        }


# --------------------------------------------------------------------------- #
# defect 2: a DERIVED centreline is snapped onto the axis of its own channel
# --------------------------------------------------------------------------- #
# An AUTHORED line is the author's geometry and is never touched — see
# `_authored_channel`, which publishes `pointsM` straight from the source file
# and never calls anything below. Only lines this compiler derives (an A* walk
# of 5.48 m cell centres) are snapped, because only they were quantised.
def wet_axis_offset_m(water: ShippedWater, x: float, z: float,
                      nx: float, nz: float, max_offset_m: float = AXIS_SNAP_M,
                      step_m: float = AXIS_SNAP_STEP_M) -> float:
    """Signed offset along the unit normal (nx, nz) from (x, z) to the deepest
    point of the ONE contiguous wet run nearest the point.

    Contiguity is what keeps this honest: the scan may cross from a bank into
    the trench beside it, but it can never hop a dry sill into a different body.
    """
    steps = int(max_offset_m / step_m)
    offsets = np.arange(-steps, steps + 1) * step_m
    depth = np.array([compiled_depth_at(water, x + nx * o, z + nz * o) for o in offsets])
    wet = depth > 0.0
    if not wet.any():
        return 0.0
    zero = steps                                   # index of offset 0.0
    if wet[zero]:
        start = zero
    else:                                          # nearest wet sample either side
        start = int(np.argmin(np.where(wet, np.abs(offsets), np.inf)))
    lo = start
    while lo > 0 and wet[lo - 1]:
        lo -= 1
    hi = start
    while hi + 1 < len(wet) and wet[hi + 1]:
        hi += 1
    run = slice(lo, hi + 1)
    best = depth[run].max()
    # deepest sample of the run; ties go to the one nearest the current line
    cands = np.flatnonzero(depth[run] >= best - 1e-9) + lo
    return float(offsets[cands[int(np.argmin(np.abs(offsets[cands])))]])


def snap_points_to_wet_axis(points_m: list[list[float]], water: ShippedWater) -> list[list[float]]:
    """Move each INTERIOR point of a derived line onto the wet axis of the
    water beneath it. The two ends are terminals — the berth (or its landing
    cell) and the join to the published network — so they stay put."""
    if len(points_m) < 3:
        return [[round(float(px), 3), round(float(pz), 3)] for px, pz in points_m]
    out = [list(points_m[0])]
    for i in range(1, len(points_m) - 1):
        (ax, az), (bx, bz) = points_m[i - 1], points_m[i + 1]
        tx, tz = bx - ax, bz - az
        norm = float(np.hypot(tx, tz))
        if norm < 1e-9:
            out.append(list(points_m[i]))
            continue
        nx, nz = -tz / norm, tx / norm       # unit normal to the local tangent
        x, z = points_m[i]
        off = wet_axis_offset_m(water, float(x), float(z), nx, nz)
        out.append([float(x) + nx * off, float(z) + nz * off])
    out.append(list(points_m[-1]))
    return [[round(float(px), 3), round(float(pz), 3)] for px, pz in out]


def cells_along(s: ProvinceSurvey, points_m) -> list[tuple[int, int]]:
    """The raster cells a metre polyline passes through, as [col, row] pairs."""
    cells: list[tuple[int, int]] = []
    for a, b in zip(points_m, points_m[1:]):
        ar, ac = s.grid_px(float(a[0]), float(a[1]))
        br, bc = s.grid_px(float(b[0]), float(b[1]))
        steps = max(abs(br - ar), abs(bc - ac), 1)
        for i in range(steps + 1):
            cell = (int(round(ac + (bc - ac) * i / steps)),
                    int(round(ar + (br - ar) * i / steps)))
            if not cells or cells[-1] != cell:
                cells.append(cell)
    return cells


def _solve(*, fit_docks: bool, context: SolveContext | None = None) -> dict:
    context = context or solve_context()
    s = context.survey
    files = context.files
    nav = context.nav
    network = context.seed.copy()
    depth_grid = context.depth
    docks_by_place = context.docks
    w, px_m = s.grid_n, s.grid_px_m
    water = compiled_water()   # raises if the water that ships cannot be read
    channels: list[dict] = []
    unconnected: list[dict] = []
    refused: list[dict] = []
    on_network: dict[str, dict] = {}
    for bi, batch in enumerate(demand(files), start=1):
        dist, prev = context.graph.field(network)
        reachable = np.isfinite(dist) & nav
        new_cells = np.zeros_like(network)
        for rec in batch:
            # The natural solve is deliberately dock-independent.  It records
            # where the physical water network reaches the place before an
            # authored berth can bias the answer.  The published solve may
            # then honour only explicitly-fixed berths.  This prevents a bad
            # dock from moving the evidence used to validate that same dock.
            targets = channel_targets(rec, docks_by_place.get(rec["id"], []), s,
                                      fit_docks=fit_docks)
            for cid, (x, z), dock in targets:
                authored = context.authored.get(cid)
                if authored is not None:
                    channel, path = _authored_channel(
                        authored, rec, bi, s, docks_by_place.get(rec["id"], []))
                    for c, r in path:
                        new_cells[r, c] = True
                    channels.append(channel)
                    continue
                row, col = s.grid_px(float(x), float(z))
                fit = dock_fit(dock, s, depth_grid) if dock else None
                need = HULL_DEPTH_M.get((dock or {}).get("hullClass"), 0.0) if fit == "to-water" else 0.0
                snapped = _snap(s, reachable, row, col, depth_grid, need)
                if snapped is None and need:
                    snapped = _snap(s, reachable, row, col)
                if dock is not None and fit == "water-to-dock":
                    refusal = check_fixed_dock_wet_join(
                        cid, (float(x), float(z)), dock.get("hullClass"), water)
                    if refusal is not None:
                        # publish NOTHING for this berth — no connector, no
                        # network cells — and carry the debt on the output
                        refused.append({**refusal, "from": rec["id"],
                                        "dockId": dock.get("id"), "batch": bi})
                        continue
                if snapped is None:
                    unconnected.append({"id": rec["id"],
                                        "why": f"no connected navigable water within {SNAP_M:.0f} m",
                                        "batch": bi})
                    continue
                srow, scol = snapped
                path = trace(prev, srow, scol, w)
                # The traced line is a walk of 5.48 m CELL CENTRES, so on a
                # trench about two cells wide it rides the lip through every
                # bend (defect 2). Publish exact metre geometry snapped onto
                # the wet axis instead; `px` is re-derived from it so the
                # studio layer and the network raster follow the same line.
                # ex/ez: water-to-dock ends the channel on the authored berth;
                # to-water ends it at the CELL CENTRE, which is the point
                # `ProvinceSurvey.sample()` reports the depth of and therefore
                # the point blueprint.py checks the berth at.
                ex, ez = ((float(x), float(z)) if fit == "water-to-dock"
                          else ((scol + 0.5) * px_m, (srow + 0.5) * px_m))
                raw_points = [[(c + 0.5) * px_m, (r + 0.5) * px_m] for c, r in path]
                raw_points[0] = [ex, ez]
                points_m = snap_points_to_wet_axis(raw_points, water)
                if len(points_m) >= 2:
                    path = cells_along(s, points_m)
                length_m = sum(float(np.hypot(b[0] - a[0], b[1] - a[1]))
                               for a, b in zip(points_m, points_m[1:]))
                if length_m > MAX_CHANNEL_M:
                    unconnected.append({"id": rec["id"], "why": f"nearest water path {length_m / 1000:.1f} km",
                                        "batch": bi})
                    continue
                for c, r in path:
                    new_cells[r, c] = True
                if length_m <= ARRIVAL_M and dock is None:
                    on_network[rec["id"]] = {
                        "id": rec["id"], "batch": bi,
                        "why": f"already within {ARRIVAL_M:.0f} m of the published network",
                    }
                    continue
                kind = classify(s, path, length_m, rec)
                channel = {
                    "id": cid,
                    "kind": kind, "class": kind, "from": rec["id"], "to": "network",
                    "batch": bi, "lengthKm": round(length_m / 1000.0, 3),
                    "px": [[int(c), int(r)] for c, r in path],
                    # Exact metre geometry, snapped to the channel axis. `px`
                    # is the raster shadow of this line, not the line itself.
                    "pointsM": points_m,
                }
                channel["season"], channel["dryCells"] = channel_season(s, path)
                if dock is not None:
                    # the berth this channel serves, and the EXACT point it ends
                    # at — `points_m[0]`, which the snap leaves untouched:
                    # water-to-dock ends the channel on the authored berth;
                    # to-water ends it on the water the berth must be moved to
                    # (and `blueprint.py` fails until the dock is authored there).
                    channel["dockId"] = dock.get("id")
                    channel["fit"] = fit
                    channel["endsAtM"] = [round(ex, 3), round(ez, 3)]
                if len(path) < 2:
                    # the berth already stands on the network: nothing to draw,
                    # but it IS served (blueprint.py measures to the lane).
                    on_network[rec["id"]] = {
                        "id": rec["id"], "batch": bi,
                        "why": "declared berth already stands on the published network",
                    }
                    continue
                channels.append(channel)
        network |= new_cells
    channels.sort(key=lambda t: t["id"])
    unconnected.sort(key=lambda u: u["id"])
    refused.sort(key=lambda r: r["id"])
    doc = {
        "schemaVersion": SCHEMA_VERSION, "kind": "minor-waterways",
        "generatedBy": "worldgen.compile_minor_waterways (Phase 11 Part 3c, decision 0041)",
        "grid": {"size": w, "metresPerPixel": px_m},
        "costs": {"note": "worldgen.routes.boat_cost_surface; land impassable"},
        "arrivalM": ARRIVAL_M, "maxChannelM": MAX_CHANNEL_M, "snapM": SNAP_M,
        "crossingM": CROSSING_M,
        "summary": {"channels": len(channels), "onNetworkAlready": len(on_network),
                    "unconnected": len(unconnected),
                    "refusedBerths": len(refused),
                    "byKind": {k: sum(1 for t in channels if t["kind"] == k)
                               for k in ("channel", "river", "crossing")},
                    "totalKm": round(sum(t["lengthKm"] for t in channels), 2),
                    # Which season each published lane's water is there in.
                    # Declared, not inferred: a flood-only channel is a real
                    # thing in a marsh province; a channel dry in EVERY season
                    # is a defect, and this is where it is visible.
                    "bySeason": {season: sum(1 for t in channels if t.get("season") == season)
                                 for season in (SEASON_YEAR_ROUND, SEASON_WET, SEASON_DRY)},
                    "dryCells": sum(int(t.get("dryCells") or 0) for t in channels)},
        "onNetwork": [on_network[key] for key in sorted(on_network)],
        "unconnected": unconnected,
        # Berths the compiled water cannot carry. Nothing is published for
        # them: no connector, no cells. Red in `test_minor_waterways` until
        # each is authored or fixed (owner 2026-09-09).
        "refusedBerths": refused,
        "channels": channels,
    }
    return doc


def _bytes(doc: dict) -> bytes:
    return (json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def repair_marker(natural: dict, fitted: dict) -> dict:
    """Content-address the repair against both immutable inputs and output."""
    return {
        "schemaVersion": 1,
        "kind": "minor-waterways-repair-marker",
        "naturalSha256": hashlib.sha256(_bytes(natural)).hexdigest(),
        "publishedSha256": hashlib.sha256(_bytes(fitted)).hexdigest(),
        "reason": "explicit water-to-dock berths fitted after the dock-independent solve",
    }


def publish(natural: dict, fitted: dict, *, write: bool = True) -> dict:
    """Publish a berth-fitted solve without losing its independent baseline.

    A repair marker binds the fitted file to the exact natural bytes.  If the
    physical solve changes, stale fitted geometry is never silently retained.
    This mirrors the major-road natural/published contract.
    """
    doc = fitted
    marker = repair_marker(natural, doc)
    if write:
        NATURAL_JSON.write_bytes(_bytes(natural))
        OUT_JSON.write_bytes(_bytes(doc))
        REPAIR_MARKER.write_text(json.dumps(marker, ensure_ascii=False, indent=2) + "\n",
                                 encoding="utf-8")
        write_digest(doc)
    return doc


def run(write: bool = True) -> dict:
    context = solve_context()
    natural = _solve(fit_docks=False, context=context)
    fitted = _solve(fit_docks=True, context=context)
    return publish(natural, fitted, write=write)


# --------------------------------------------------------------------------- #
# registry solving
# --------------------------------------------------------------------------- #
def solve_registry(doc: dict, write: bool = True) -> list[dict]:
    """Attach `geometryId` to registry entries whose from/to resolve to a place
    that now has minor water geometry, and flip them `solved: true`."""
    by_place = {c["from"]: c["id"] for c in doc["channels"]}
    slug_to_path: dict[str, str] = {}
    for pid, gid in by_place.items():
        slug_to_path.setdefault(pid.split(".")[-1], gid)
    data = json.loads(REGISTRY_PATH.read_text())
    solved: list[dict] = []
    for r in data["routes"]:
        if r.get("solved", True) or r.get("geometryId"):
            continue
        water = r.get("mode") == "boat" or r.get("class") == "channel"
        if not water:
            continue
        gid = next((slug_to_path[s] for s in (r.get("from"), r.get("to"))
                    if s in slug_to_path), None)
        if not gid:
            continue
        r["geometryId"] = gid
        r["solved"] = True
        solved.append({"id": r["id"], "geometryId": gid})
    if write and solved:
        REGISTRY_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                                 encoding="utf-8")
    return solved


# --------------------------------------------------------------------------- #
DIGEST_MARK = "## Minor waterways — channels, rivers, ferry crossings (Phase 11 Part 3c)"


def digest(doc: dict, solved: list[dict]) -> str:
    sm = doc["summary"]
    L = [DIGEST_MARK, "",
         "Derived from the macro plot by `worldgen.compile_minor_waterways` (the Phase 4 boat "
         "cost surface, land impassable); data in "
         "`apps/world-studio/public/province/waterways-minor.json`.", "",
         f"- **{sm['channels']} channels**, {sm['totalKm']} km in total: " +
         ", ".join(f"{k} {v}" for k, v in sm["byKind"].items()),
         f"- {sm['onNetworkAlready']} water-bound places already sit on a lane or navigable river "
         f"(within {doc['arrivalM']:.0f} m)",
         f"- **When each lane has its water**: {sm['bySeason'][SEASON_YEAR_ROUND]} carry a hull all "
         f"year, {sm['bySeason'][SEASON_WET]} only in the wet season and "
         f"{sm['bySeason'][SEASON_DRY]} run over ground that the water bake finds dry in every season "
         f"({sm['dryCells']} cells). That last group is a defect. Those lanes are drawn but cannot "
         f"be poled; each carries `\"season\": \"dry\"` in the JSON. The worst of them are listed "
         f"below. The fix is to carve the bed or to withdraw the lane.",
         f"- {sm['unconnected']} water-bound places have **no boat path** (reached on foot, by root "
         f"or by guide — a design fact to check, not a failure):", ""]
    for u in doc["unconnected"]:
        L.append(f"  - `{u['id']}` — {u['why']}")
    refused = doc.get("refusedBerths") or []
    if refused:
        L += ["", f"- **{len(refused)} REFUSED berths** — the compiled water cannot carry the hull "
              f"the blueprint promises, so no connector is published for them at all "
              f"(`test_minor_waterways` is red until each is authored or fixed):", ""]
        for r in refused:
            L.append(f"  - `{r['dockId']}` — needs {r['needM']:.1f} m, the water publishes "
                     f"{r['depthAtBerthM']:.2f} m at the berth; nearest water that deep "
                     f"{('%.1f m away' % r['nearestWaterM']) if r['nearestWaterM'] is not None else 'not within 9 km'}")
    dry = sorted((t for t in doc["channels"] if t.get("season") == SEASON_DRY),
                 key=lambda t: -int(t.get("dryCells") or 0))
    if dry:
        L += ["", "### Lanes drawn over dry ground", "",
              "| place | class | km | cells dry in every season |", "|---|---|---:|---:|"]
        for t in dry[:10]:
            L.append(f"| `{t['from']}` | {t['kind']} | {t['lengthKm']} | {t.get('dryCells') or 0} |")
        if len(dry) > 10:
            L.append(f"| _…{len(dry) - 10} more_ | | | |")
    L += ["", "### Longest channels", "", "| place | class | km |", "|---|---|---|"]
    for t in sorted(doc["channels"], key=lambda t: -t["lengthKm"])[:15]:
        L.append(f"| `{t['from']}` | {t['kind']} | {t['lengthKm']} |")
    L += ["", "### Registry entries solved by minor water geometry", ""]
    L += ([f"- `{e['id']}` → `{e['geometryId']}`" for e in solved] or ["- (none this run)"])
    return "\n".join(L) + "\n"


def write_digest(doc: dict, solved: list[dict] | None = None) -> None:
    body = digest(doc, solved or [])
    old = OUT_MD.read_text(encoding="utf-8") if OUT_MD.exists() else ""
    head = old.split(DIGEST_MARK)[0].rstrip("\n")
    OUT_MD.write_text((head + "\n\n" + body) if head else body, encoding="utf-8")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--registry", action="store_true",
                    help="also attach geometryId / solved:true to world/sources/routes/registry.json")
    a = ap.parse_args(argv)
    context = solve_context()
    natural = _solve(fit_docks=False, context=context)
    fitted = _solve(fit_docks=True, context=context)
    doc = publish(natural, fitted, write=not a.dry_run)
    solved: list[dict] = []
    if not a.dry_run and a.registry:
        solved = solve_registry(doc)
        write_digest(doc, solved)
    sm = doc["summary"]
    print(f"[minor-waterways] {sm['channels']} channels ({sm['totalKm']} km) {sm['byKind']}; "
          f"on-network {sm['onNetworkAlready']}; unconnected {sm['unconnected']}; "
          f"registry solved {len(solved)}")
    for r in doc.get("refusedBerths") or []:
        print(f"[minor-waterways] REFUSED {r['dockId']}: {r['why']}")
    if doc.get("refusedBerths"):
        print(f"[minor-waterways] {len(doc['refusedBerths'])} berth(s) refused; the rest of the "
              f"network is published. test_minor_waterways stays red until they are fixed.")


if __name__ == "__main__":
    main()
