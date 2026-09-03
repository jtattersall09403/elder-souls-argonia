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

Each path is classed by the ground it crosses and the size of what it serves:
`track` (cart-width, M3+ or serving many), `footpath` (everything smaller),
`boardwalk` (mostly wetland), `causeway` (mostly seasonal flood ground). A
place already within ARRIVAL_M of the network gets no path (it is on the
road). A place whose cheapest path exceeds MAX_TRACK_M is recorded as
`unconnected` — boat-, guide- or root-served, which is a design fact, not a
failure — and listed in the digest.

Deterministic: no randomness; ties in the heap break by (cost, row, col).

WHAT IT WRITES
--------------
* `apps/world-studio/public/province/routes-minor.json` — the network, px on
  the 1345 hydrology grid exactly like `routes.json` (the studio draws it;
  Part 6's compilers, vegetation clearing and the navmesh bake consume it).
* `world/sources/sites/minor-routes.md` — the digest.
"""

from __future__ import annotations

import argparse
import heapq
import json
from pathlib import Path

import numpy as np
from scipy import ndimage

from . import catalogue
from .routes import EDGE_MARGIN, EDGE_PENALTY, NEIGHBOR_OFFSETS
from .site_fields import ProvinceSurvey

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_JSON = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "routes-minor.json"
OUT_MD = REPO_ROOT / "world" / "sources" / "sites" / "minor-routes.md"

SCHEMA_VERSION = 1
ARRIVAL_M = 45.0          # already on the network: no path
MAX_TRACK_M = 2600.0      # beyond this the place is boat/guide/root-served
MAGNITUDE_RANK = {"M5": 5, "M4": 4, "M3": 3, "M2": 2, "M1": 1}

# per-metre relative costs (cf. routes.cost_surface, adapted to the published rasters)
COST_WETLAND = 3.0
COST_FLOOD = 1.8
COST_MOUNTAIN = 2.5       # above 40 m
COST_RIVER = 9.0          # a crossing
COST_DEEP = 60.0          # open water: effectively forbidden for a land path
COST_JUNGLE = 1.8
MARSH_REGIONS = (3, 4, 6, 7, 14)   # tidal delta, lagoon/salt marsh, rootland, interior swamp, mangrove


def cost_surface(s: ProvinceSurvey) -> np.ndarray:
    slope = np.radians(s.slope_grid)
    cost = 1.0 + np.tan(slope) * 12.0 + 30.0 * (np.tan(slope) / 0.5) ** 2
    wet = s.wetlands & ~s.open_water
    cost = np.where(wet, cost * COST_WETLAND, cost)
    cost = np.where(s.flood >= 2, cost * COST_FLOOD, cost)
    cost = np.where(s.height_grid > 40.0, cost * COST_MOUNTAIN, cost)
    cost = np.where(s.river_band >= 2, cost * COST_RIVER, cost)
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
    for r in s.routes:
        for x, z in r.points_m:
            row, col = s.grid_px(float(x), float(z))
            mask[row, col] = True
        # join the polyline: routes.json is per-pixel already, lanes too
    mask = ndimage.binary_dilation(mask, iterations=1)
    return mask & s.land


def multi_source_field(cost: np.ndarray, seeds: np.ndarray, px_m: float):
    """Dijkstra from every seed cell at once; returns (cost field, predecessor)."""
    h, w = cost.shape
    dist = np.full((h, w), np.inf)
    prev = np.full((h, w), -1, dtype=np.int64)
    heap: list[tuple[float, int, int]] = []
    for row, col in zip(*np.nonzero(seeds)):
        dist[row, col] = 0.0
        heap.append((0.0, int(row), int(col)))
    heapq.heapify(heap)
    while heap:
        d, y, x = heapq.heappop(heap)
        if d > dist[y, x]:
            continue
        cyx = cost[y, x]
        for dy, dx in NEIGHBOR_OFFSETS:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w:
                nd = d + (1.4142135623730951 if dy and dx else 1.0) * px_m * 0.5 * (cyx + cost[ny, nx])
                if nd < dist[ny, nx]:
                    dist[ny, nx] = nd
                    prev[ny, nx] = y * w + x
                    heapq.heappush(heap, (nd, ny, nx))
    return dist, prev


def trace(prev: np.ndarray, row: int, col: int, w: int) -> list[tuple[int, int]]:
    path = []
    cur = row * w + col
    while cur >= 0:
        path.append((cur % w, cur // w))     # (col, row) like routes.json px
        cur = int(prev[cur // w, cur % w])
    return path


def classify(s: ProvinceSurvey, path: list[tuple[int, int]], magnitude: str | None, cls: str) -> str:
    cells = np.array([(r, c) for c, r in path])
    reg = s.region_grid[cells[:, 0], cells[:, 1]]
    marsh = float((np.isin(reg, MARSH_REGIONS) | s.wetlands[cells[:, 0], cells[:, 1]]).mean())
    flood = float((s.flood[cells[:, 0], cells[:, 1]] >= 2).mean())
    if marsh >= 0.5:
        return "boardwalk"
    if flood >= 0.5:
        return "causeway"
    if cls == "settlement" and MAGNITUDE_RANK.get(magnitude or "", 0) >= 3:
        return "track"
    return "footpath"


def demand(files: list[catalogue.RegionFile]) -> list[list[dict]]:
    b1, b2, b3 = [], [], []
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
    key = lambda r: (-MAGNITUDE_RANK.get(r["classification"].get("magnitude") or "", 0), r["importanceTier"], r["id"])
    return [sorted(b1, key=key), sorted(b2, key=key), sorted(b3, key=key)]


def run(write: bool = True) -> dict:
    s = ProvinceSurvey()
    files = catalogue.load_region_files()
    cost = cost_surface(s)
    network = rasterise_routes(s)
    w = s.grid_n
    px_m = s.grid_px_m
    tracks: list[dict] = []
    unconnected: list[dict] = []
    on_road = 0
    batches = demand(files)
    for bi, batch in enumerate(batches, start=1):
        dist, prev = multi_source_field(cost, network, px_m)
        new_cells = np.zeros_like(network)
        for rec in batch:
            x, z = rec["positionM"]
            row, col = s.grid_px(float(x), float(z))
            if not s.land[row, col]:
                # a submerged / island record: walk to the nearest land cell first
                land_rc = np.argwhere(s.land)
                d2 = (land_rc[:, 0] - row) ** 2 + (land_rc[:, 1] - col) ** 2
                row, col = map(int, land_rc[int(np.argmin(d2))])
            if not np.isfinite(dist[row, col]):
                unconnected.append({"id": rec["id"], "why": "no land path at all"})
                continue
            path = trace(prev, row, col, w)
            length_m = sum(np.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]) * px_m
                           for i in range(len(path) - 1))
            if length_m <= ARRIVAL_M:
                on_road += 1
                continue
            if length_m > MAX_TRACK_M:
                unconnected.append({"id": rec["id"], "why": f"cheapest land path {length_m / 1000:.1f} km", "batch": bi})
                continue
            kind = classify(s, path, rec["classification"].get("magnitude"), rec["classification"]["class"])
            end_c, end_r = path[-1]
            tracks.append({
                "id": "track." + rec["id"].split(".", 1)[1],
                "kind": kind, "from": rec["id"], "to": "network",
                "batch": bi, "lengthKm": round(length_m / 1000.0, 3),
                "px": [[int(c), int(r)] for c, r in path],
            })
            for c, r in path:
                new_cells[r, c] = True
        network |= new_cells
    tracks.sort(key=lambda t: t["id"])
    doc = {"schemaVersion": SCHEMA_VERSION, "kind": "minor-routes",
           "generatedBy": "worldgen.compile_minor_routes (Phase 11 Part 3b, decision 0041)",
           "grid": {"size": w, "metresPerPixel": px_m},
           "costs": {"wetland": COST_WETLAND, "flood": COST_FLOOD, "mountain": COST_MOUNTAIN,
                     "river": COST_RIVER, "openWater": COST_DEEP, "jungle": COST_JUNGLE},
           "arrivalM": ARRIVAL_M, "maxTrackM": MAX_TRACK_M,
           "summary": {"tracks": len(tracks), "onRoadAlready": on_road, "unconnected": len(unconnected),
                       "byKind": {k: sum(1 for t in tracks if t["kind"] == k)
                                  for k in ("track", "footpath", "boardwalk", "causeway")},
                       "totalKm": round(sum(t["lengthKm"] for t in tracks), 2)},
           "unconnected": unconnected, "tracks": tracks}
    if write:
        OUT_JSON.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        OUT_MD.write_text(digest(doc), encoding="utf-8")
    return doc


def digest(doc: dict) -> str:
    sm = doc["summary"]
    L = ["# Minor routes — tracks, footpaths, boardwalks, causeways (Phase 11 Part 3b)", "",
         f"Derived from the macro plot by `worldgen.compile_minor_routes`; data in "
         f"`apps/world-studio/public/province/routes-minor.json`.", "",
         f"- **{sm['tracks']} paths**, {sm['totalKm']} km in total: " +
         ", ".join(f"{k} {v}" for k, v in sm["byKind"].items()),
         f"- {sm['onRoadAlready']} places were already on a road or landing (within {doc['arrivalM']:.0f} m)",
         f"- {sm['unconnected']} places have **no land path** (boat-, guide- or root-served — a design fact to check, "
         f"not a failure; longest allowed path {doc['maxTrackM'] / 1000:.1f} km):", ""]
    for u in doc["unconnected"]:
        L.append(f"  - `{u['id']}` — {u['why']}")
    L += ["", "## Longest paths", "", "| path | kind | km |", "|---|---|---|"]
    for t in sorted(doc["tracks"], key=lambda t: -t["lengthKm"])[:15]:
        L.append(f"| `{t['from']}` | {t['kind']} | {t['lengthKm']} |")
    return "\n".join(L) + "\n"


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    doc = run(write=not a.dry_run)
    sm = doc["summary"]
    print(f"[minor-routes] {sm['tracks']} paths ({sm['totalKm']} km) {sm['byKind']}; "
          f"on-road {sm['onRoadAlready']}; unconnected {sm['unconnected']}")


if __name__ == "__main__":
    main()
