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
import json
from pathlib import Path

import numpy as np
from scipy import ndimage

from . import catalogue
from .compile_minor_routes import OUT_MD, multi_source_field, trace
from .routes import boat_cost_surface
from .site_fields import ProvinceSurvey

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_JSON = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "waterways-minor.json"
REGISTRY_PATH = REPO_ROOT / "world" / "sources" / "routes" / "registry.json"

SCHEMA_VERSION = 1
ARRIVAL_M = 45.0        # already on a lane or navigable river: no channel
MAX_CHANNEL_M = 9000.0  # beyond this the place is not water-served
SNAP_M = 260.0          # how far a dry-footed place may reach its own landing
CROSSING_M = 420.0      # a bank-to-bank ferry hop
BOAT_MODES = {"boat", "ferry", "lighter", "pilot"}
WATER_FAMILIES = {"landing", "water-village", "crossing", "submerged-way"}


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


def _snap(s: ProvinceSurvey, reachable: np.ndarray, row: int, col: int) -> tuple[int, int] | None:
    """Nearest CONNECTED navigable cell within SNAP_M — the place's landing.

    Connected, not merely navigable: half the marsh raster is one-pixel
    puddles, and snapping into one would strand a place that in fact sits a
    few metres from a live channel."""
    nav = reachable
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


def run(write: bool = True) -> dict:
    s = ProvinceSurvey()
    files = catalogue.load_region_files()
    cost = cost_surface(s)
    nav = navigable(s)
    network = seed_network(s)
    w, px_m = s.grid_n, s.grid_px_m
    channels: list[dict] = []
    unconnected: list[dict] = []
    on_network = 0
    for bi, batch in enumerate(demand(files), start=1):
        dist, prev = multi_source_field(cost, network, px_m)
        reachable = np.isfinite(dist) & nav
        new_cells = np.zeros_like(network)
        for rec in batch:
            x, z = rec["positionM"]
            row, col = s.grid_px(float(x), float(z))
            snapped = _snap(s, reachable, row, col)
            if snapped is None:
                unconnected.append({"id": rec["id"],
                                    "why": f"no connected navigable water within {SNAP_M:.0f} m",
                                    "batch": bi})
                continue
            row, col = snapped
            path = trace(prev, row, col, w)
            length_m = sum(np.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]) * px_m
                           for i in range(len(path) - 1))
            if length_m <= ARRIVAL_M:
                on_network += 1
                for c, r in path:
                    new_cells[r, c] = True
                continue
            if length_m > MAX_CHANNEL_M:
                unconnected.append({"id": rec["id"], "why": f"nearest water path {length_m / 1000:.1f} km",
                                    "batch": bi})
                continue
            kind = classify(s, path, length_m, rec)
            channels.append({
                "id": "waterway." + rec["id"].split(".", 1)[1],
                "kind": kind, "class": kind, "from": rec["id"], "to": "network",
                "batch": bi, "lengthKm": round(length_m / 1000.0, 3),
                "px": [[int(c), int(r)] for c, r in path],
            })
            for c, r in path:
                new_cells[r, c] = True
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
        "summary": {"channels": len(channels), "onNetworkAlready": on_network,
                    "unconnected": len(unconnected),
                    "byKind": {k: sum(1 for t in channels if t["kind"] == k)
                               for k in ("channel", "river", "crossing")},
                    "totalKm": round(sum(t["lengthKm"] for t in channels), 2)},
        "unconnected": unconnected, "channels": channels,
    }
    if write:
        OUT_JSON.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n",
                            encoding="utf-8")
        write_digest(doc)
    return doc


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
    doc = run(write=False)
    solved: list[dict] = []
    if not a.dry_run:
        if a.registry:
            solved = solve_registry(doc)
        OUT_JSON.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n",
                            encoding="utf-8")
        write_digest(doc, solved)
    sm = doc["summary"]
    print(f"[minor-waterways] {sm['channels']} channels ({sm['totalKm']} km) {sm['byKind']}; "
          f"on-network {sm['onNetworkAlready']}; unconnected {sm['unconnected']}; "
          f"registry solved {len(solved)}")


if __name__ == "__main__":
    main()
