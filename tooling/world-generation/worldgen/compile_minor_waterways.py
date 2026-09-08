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

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_JSON = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "waterways-minor.json"
NATURAL_JSON = OUT_JSON.with_name("waterways-minor-natural.json")
REPAIR_MARKER = OUT_JSON.with_name("waterways-minor-repaired-by.json")
REGISTRY_PATH = REPO_ROOT / "world" / "sources" / "routes" / "registry.json"

SCHEMA_VERSION = 1
ARRIVAL_M = 45.0        # already on a lane or navigable river: no channel
MAX_CHANNEL_M = 9000.0  # beyond this the place is not water-served
SNAP_M = 260.0          # how far a dry-footed place may reach its own landing
CROSSING_M = 420.0      # a bank-to-bank ferry hop
BOAT_MODES = {"boat", "ferry", "lighter", "pilot"}
WATER_FAMILIES = {"landing", "water-village", "crossing", "submerged-way"}


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
    here = float(depth_grid[row, col])
    if s.open_water[row, col]:
        # the marsh credit blueprint.py documents: a cell the province calls
        # open water floats a poled hull even where it publishes no depth
        here = max(here, bp_mod.MARSH_WATER_CREDIT_M)
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


def navigable(s: ProvinceSurvey) -> np.ndarray:
    """Every cell a hull or a pole can move through."""
    return s.open_water | s.lakes | s.tidal | s.wetlands | (s.river_band > 0)


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
    # real water: deep enough for the hull class AND inside `open_water`, the
    # mask every other check reads (blueprint_integration's canal test among
    # them). Snapping a landing into 0.4 m of marsh the water mask calls dry is
    # how a dock ends up "beside" the water it is supposed to be on.
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
    points = list(reversed(authored["pointsM"]))
    cells: list[tuple[int, int]] = []
    for a, b in zip(points, points[1:]):
        ar, ac = s.grid_px(float(a[0]), float(a[1]))
        br, bc = s.grid_px(float(b[0]), float(b[1]))
        steps = max(abs(br - ar), abs(bc - ac), 1)
        for i in range(steps + 1):
            cell = (int(round(ac + (bc - ac) * i / steps)),
                    int(round(ar + (br - ar) * i / steps)))
            if not cells or cells[-1] != cell:
                cells.append(cell)
    return cells


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
    }, path)


def _solve(*, fit_docks: bool, context: SolveContext | None = None) -> dict:
    context = context or solve_context()
    s = context.survey
    files = context.files
    nav = context.nav
    network = context.seed.copy()
    depth_grid = context.depth
    docks_by_place = context.docks
    w, px_m = s.grid_n, s.grid_px_m
    channels: list[dict] = []
    unconnected: list[dict] = []
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
                if snapped is None:
                    unconnected.append({"id": rec["id"],
                                        "why": f"no connected navigable water within {SNAP_M:.0f} m",
                                        "batch": bi})
                    continue
                srow, scol = snapped
                path = trace(prev, srow, scol, w)
                length_m = sum(np.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]) * px_m
                               for i in range(len(path) - 1))
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
                }
                if dock is not None:
                    # the berth this channel serves, and the EXACT point it ends
                    # at: the traced line is a chain of 5.48 m raster cells, so
                    # its head is only the cell the berth falls in.
                    # water-to-dock ends the channel on the authored berth;
                    # to-water ends it on the water the berth must be moved to
                    # (and `blueprint.py` fails until the dock is authored there).
                    # to-water ends the channel at the CELL CENTRE, which is
                    # the point `ProvinceSurvey.sample()` reports the depth of
                    # and therefore the point blueprint.py checks the berth at.
                    ex, ez = (float(x), float(z)) if fit == "water-to-dock" else (
                        (scol + 0.5) * px_m, (srow + 0.5) * px_m)
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
    doc = {
        "schemaVersion": SCHEMA_VERSION, "kind": "minor-waterways",
        "generatedBy": "worldgen.compile_minor_waterways (Phase 11 Part 3c, decision 0041)",
        "grid": {"size": w, "metresPerPixel": px_m},
        "costs": {"note": "worldgen.routes.boat_cost_surface; land impassable"},
        "arrivalM": ARRIVAL_M, "maxChannelM": MAX_CHANNEL_M, "snapM": SNAP_M,
        "crossingM": CROSSING_M,
        "summary": {"channels": len(channels), "onNetworkAlready": len(on_network),
                    "unconnected": len(unconnected),
                    "byKind": {k: sum(1 for t in channels if t["kind"] == k)
                               for k in ("channel", "river", "crossing")},
                    "totalKm": round(sum(t["lengthKm"] for t in channels), 2)},
        "onNetwork": [on_network[key] for key in sorted(on_network)],
        "unconnected": unconnected, "channels": channels,
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
         f"- {sm['unconnected']} water-bound places have **no boat path** (reached on foot, by root "
         f"or by guide — a design fact to check, not a failure):", ""]
    for u in doc["unconnected"]:
        L.append(f"  - `{u['id']}` — {u['why']}")
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


if __name__ == "__main__":
    main()
