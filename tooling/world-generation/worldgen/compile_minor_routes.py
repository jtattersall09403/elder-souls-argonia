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

from . import blueprint as bp_mod
from . import catalogue
from . import province_network as pn
from .routes import EDGE_MARGIN, EDGE_PENALTY, NEIGHBOR_OFFSETS, grade_factor
from .site_fields import ProvinceSurvey

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
COST_FLOOD = 1.8
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
MARSH_REGIONS = (3, 4, 6, 7, 14)   # tidal delta, lagoon/salt marsh, rootland, interior swamp, mangrove
# Which terminal a derived path aims at when a blueprint declares several: the
# highest-class WALKABLE entrance (a lane terminal is a boat landing, not the
# end of a track).
TERMINAL_PRIORITY = {"road": 0, "track": 1, "boardwalk": 2, "footpath": 3}


def blueprint_terminals() -> dict[str, tuple[tuple[float, float], str]]:
    """{place id: ((u, v), kind)} — the entry point each blueprint's walkable
    network terminal declares, and the kind of entrance it is. The minor path
    to that place ends there, and may not arrive grander than that entrance."""
    out: dict[str, tuple[tuple[float, float], str]] = {}
    if not bp_mod.BLUEPRINT_DIR.exists():
        return out
    for path in sorted(bp_mod.BLUEPRINT_DIR.glob("*.json")):
        try:
            bp = json.loads(path.read_text()).get("blueprint") or {}
        except (OSError, json.JSONDecodeError):
            continue
        best = None
        for t in bp.get("networkTerminals") or []:
            rank = TERMINAL_PRIORITY.get(t.get("kind"))
            entry = t.get("entryUV")
            if rank is None or not (isinstance(entry, list) and len(entry) == 2):
                continue
            key = (rank, str(t.get("id")))
            if best is None or key < best[0]:
                best = (key, ((float(entry[0]), float(entry[1])), str(t["kind"])))
        if best and bp.get("id"):
            out[bp["id"]] = best[1]
    return out


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
    # The PUBLISHED geometry, not `s.routes`: that one is the natural-state
    # snapshot siting reads (site_fields), and a track has to meet the road
    # the world actually carries — the one `reroute_majors` repaired.
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
    h, w = cost.shape
    dist = np.full((h, w), np.inf)
    prev = np.full((h, w), -1, dtype=np.int64)
    heap: list[tuple[float, int, int]] = []
    for row, col in zip(*np.nonzero(seeds)):
        dist[row, col] = 0.0
        heap.append((0.0, int(row), int(col)))
    heapq.heapify(heap)
    graded = height is not None and cap_deg is not None
    while heap:
        d, y, x = heapq.heappop(heap)
        if d > dist[y, x]:
            continue
        cyx = cost[y, x]
        zyx = float(height[y, x]) if graded else 0.0
        for dy, dx in NEIGHBOR_OFFSETS:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w:
                run = (1.4142135623730951 if dy and dx else 1.0) * px_m
                step = run * 0.5 * (cyx + cost[ny, nx])
                if graded:
                    step *= float(grade_factor(float(height[ny, nx]) - zyx, run, cap_deg))
                nd = d + step
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


def run(write: bool = True) -> dict:
    s = ProvinceSurvey()
    files = catalogue.load_region_files()
    cost = cost_surface(s)
    height = s.height_grid            # natural ground; the property re-derives, so hoist it
    network = rasterise_routes(s)
    w = s.grid_n
    px_m = s.grid_px_m
    tracks: list[dict] = []
    unconnected: list[dict] = []
    on_road = 0
    terminals = blueprint_terminals()
    batches = demand(files, set(terminals))
    for bi, batch in enumerate(batches, start=1):
        dist, prev = multi_source_field(cost, network, px_m, height, ROUTING_CAP_DEG)
        new_cells = np.zeros_like(network)
        for rec in batch:
            x, z = rec["positionM"]
            # A blueprint's declared gate/landing wins over the plotted dot: the
            # path must end where the place lets you in (owner 2026-09-05).
            terminal = terminals.get(rec["id"])
            entry_uv = terminal[0] if terminal else None
            if entry_uv is not None:
                x, z = s.uv_to_m(*entry_uv)
            row, col = s.grid_px(float(x), float(z))
            if not s.land[row, col]:
                # a submerged / island record: walk to the nearest land cell first
                land_rc = np.argwhere(s.land)
                d2 = (land_rc[:, 0] - row) ** 2 + (land_rc[:, 1] - col) ** 2
                k = int(np.argmin(d2))
                if float(np.sqrt(d2[k])) * px_m > SNAP_M:
                    unconnected.append({"id": rec["id"], "why": "no land within the snap; boat-served"})
                    continue
                row, col = map(int, land_rc[k])
            if not np.isfinite(dist[row, col]):
                unconnected.append({"id": rec["id"], "why": "no land path at all"})
                continue
            path = trace(prev, row, col, w)
            length_m = sum(np.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]) * px_m
                           for i in range(len(path) - 1))
            if length_m <= ARRIVAL_M:
                on_road += 1
                continue
            if length_m > MAX_TRACK_M and rec["classification"]["class"] != "settlement":
                unconnected.append({"id": rec["id"], "why": f"cheapest land path {length_m / 1000:.1f} km", "batch": bi})
                continue
            # A SETTLEMENT always keeps its path, however long. People live
            # there and walk out; "no way in on foot" is a worse world fact
            # than a long one, and since the solver holds the gradient cap the
            # long line is the honest length of a walkable approach to a hill
            # village. Listed in the digest so the length stays visible.
            kind = classify(s, path, rec["classification"].get("magnitude"), rec["classification"]["class"],
                            terminal[1] if terminal else None)
            end_c, end_r = path[-1]
            track = {
                "id": "track." + rec["id"].split(".", 1)[1],
                "kind": kind,
                "endsAtTerminal": entry_uv is not None, "from": rec["id"], "to": "network",
                "batch": bi, "lengthKm": round(length_m / 1000.0, 3),
                "px": [[int(c), int(r)] for c, r in path],
            }
            if entry_uv is not None:
                # the EXACT terminal, in world metres. The traced path is a
                # chain of 5.48 m raster cells, so its first vertex is the cell
                # the gate falls in, up to a cell-diagonal from the gate itself;
                # `province_network` puts this point back on the head of the
                # line so a blueprint's terminal check measures against the
                # place the path actually ends, not the pixel it rounded to.
                tx, tz = s.uv_to_m(*entry_uv)
                track["endsAtM"] = [round(float(tx), 3), round(float(tz), 3)]
            if bi == 4:
                # real ground, off the drawn map: the place stays found by rumour
                track["unmapped"] = True
            tracks.append(track)
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
    doc["summary"]["unmapped"] = sum(1 for t in tracks if t.get("unmapped"))
    if write:
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
    a = ap.parse_args(argv)
    doc = run(write=not a.dry_run)
    sm = doc["summary"]
    print(f"[minor-routes] {sm['tracks']} paths ({sm['totalKm']} km) {sm['byKind']}; "
          f"on-road {sm['onRoadAlready']}; unconnected {sm['unconnected']}")


if __name__ == "__main__":
    main()
