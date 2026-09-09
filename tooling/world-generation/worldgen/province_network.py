"""The province network as one addressable set of polylines (owner requirement
2026-09-05: the road INTO a place and the street INSIDE it are one network).

Three published bundles carry the network geometry, all in pixels on the same
1345 hydrology grid:

    apps/world-studio/public/province/routes.json        major roads
    apps/world-studio/public/province/waterways.json     boat lanes / channels
    apps/world-studio/public/province/waterways-minor.json  poling channels
    apps/world-studio/public/province/routes-minor.json  tracks, footpaths,
                                                         boardwalks, causeways

A boat lane whose endpoint is a declared berth (`world/sources/routes/lane-terminals.json`)
carries `startsAtM` / `endsAtM` for the same reason, and is treated the same way.

A minor path routed to a blueprint's `networkTerminals[]` entry also carries
`endsAtM` — the exact terminal in world metres — because the traced line is a
chain of 5.48 m raster cells and its head is only the cell the gate falls in.
`load_network()` puts that exact point back at the head of the polyline, so the
97 C-stitch check measures the join against the point the path really ends at.

`load_network()` joins them into `{route id: NetworkRoute}` with the polyline
in WORLD METRES, so a blueprint's `networkTerminals[]` can be measured against
the line the world actually carries. Route CLASS comes from the authoring
registry (`world/sources/routes/registry.json`) where the route is registered,
and from the derived `kind` for minor paths.

`CLASS_RANK` is the hierarchy of module 97 Part C: a way may carry a route on
at the same rank or a higher one, never a lower one — a road does not shrink to
a footpath at the gate. Water classes (`lane`, `channel`) have no land rank and
are exempt from that comparison.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .scale import HYDRO_PX_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
REGISTRY_PATH = REPO_ROOT / "world" / "sources" / "routes" / "registry.json"

# module 97 Part C street hierarchy, shared by province routes and blueprint
# ways. Higher carries more traffic and reads as more important.
CLASS_RANK = {
    "footpath": 1, "stair": 1, "ramp": 1, "path": 1,
    "boardwalk": 2, "pier": 2,
    "track": 3, "causeway": 3,
    "road": 4, "trunk": 4,
}
# `river` belongs here (2026-09-09): `compile_minor_waterways` classes a minor
# waterway `river` when it runs down water that already exists rather than a cut
# line, so a berth on a natural reach was served by a route the water set did
# not contain — `blueprint._water_routes` reported it absent from the published
# network and `dock_dredge` never saw its approach. A river is water.
WATER_CLASSES = {"lane", "channel", "canal", "river"}


@dataclass(frozen=True)
class NetworkRoute:
    id: str
    cls: str                      # road|trunk|track|footpath|causeway|boardwalk|lane|channel
    layer: str                    # "major" | "water" | "minor"
    points_m: tuple[tuple[float, float], ...]

    @property
    def rank(self) -> int | None:
        return CLASS_RANK.get(self.cls)

    @property
    def is_water(self) -> bool:
        return self.cls in WATER_CLASSES


def _registry_classes(registry_path: Path = REGISTRY_PATH) -> dict[str, str]:
    # A missing or unreadable registry is a FAILURE (review 2026-09-07): it used
    # to return {}, which silently re-classed every route to its bundle default
    # and disabled the class-rank half of the C-stitch check.
    try:
        doc = json.loads(registry_path.read_text())
    except OSError as exc:
        raise RuntimeError(
            f"province network: cannot read the route registry at {registry_path} — {exc}. "
            f"Route classes come from it, so a missing registry turns the class checks off; "
            f"restore the file rather than running without it") from exc
    routes = doc["routes"] if isinstance(doc, dict) else doc
    return {r["id"]: r.get("class") or "" for r in routes if r.get("id")}


def _px_to_m(px, px_m: float) -> tuple[tuple[float, float], ...]:
    # px rows/cols are cell ids [col, row], so geometry sits at cell centres.
    return tuple(((float(c) + 0.5) * px_m, (float(r) + 0.5) * px_m) for c, r in px)


@lru_cache(maxsize=4)
def load_network(province: Path = PROVINCE, registry_path: Path = REGISTRY_PATH) -> dict[str, NetworkRoute]:
    """{route id: NetworkRoute} over the three published bundles. Missing
    bundles are skipped, so this works in a partial checkout."""
    classes = _registry_classes(registry_path)
    out: dict[str, NetworkRoute] = {}
    minor_path = province / "routes-minor.json"
    px_m = HYDRO_PX_M
    if minor_path.exists():
        px_m = float(json.loads(minor_path.read_text())["grid"]["metresPerPixel"])

    major = province / "routes.json"
    if major.exists():
        for r in json.loads(major.read_text())["routes"]:
            out[r["id"]] = NetworkRoute(r["id"], classes.get(r["id"], "road"), "major",
                                        _px_to_m(r["px"], px_m))
    water = province / "waterways.json"
    if water.exists():
        for lane in json.loads(water.read_text())["lanes"]:
            # An exact metre line wins over the raster trail, exactly as it does
            # for a poling channel below: `reroute_lanes` re-solves an overland
            # stretch on the 3.66 m water grid, and re-quantising that onto the
            # 5.48 m hydrology lattice would put the lane back on the bank.
            # `px` remains the coarse trail the studio overlay draws.
            exact_points = lane.get("pointsM")
            pts = (tuple((float(p[0]), float(p[1])) for p in exact_points)
                   if isinstance(exact_points, list) and len(exact_points) >= 2
                   else _px_to_m(lane["px"], px_m))
            # a declared lane terminal is an exact berth, not the raster cell
            # it falls in (compile_society; 97 C-stitch)
            for key, index in (("startsAtM", 0), ("endsAtM", -1)):
                end = lane.get(key)
                if isinstance(end, list) and len(end) == 2 and pts:
                    exact = (float(end[0]), float(end[1]))
                    pts = ((exact,) + pts[1:]) if index == 0 else (pts[:-1] + (exact,))
            out[lane["id"]] = NetworkRoute(lane["id"], classes.get(lane["id"], lane.get("class") or "lane"),
                                           "water", pts)
    # Poling channels (the derived minor waterway network): a marsh village may
    # declare one as its `networkTerminals[].routeId`, so they are addressable
    # too (Phase 11 stream C).
    minor_water = province / "waterways-minor.json"
    if minor_water.exists():
        for ch in json.loads(minor_water.read_text())["channels"]:
            exact_points = ch.get("pointsM")
            pts = (tuple((float(point[0]), float(point[1])) for point in exact_points)
                   if isinstance(exact_points, list) and len(exact_points) >= 2
                   else _px_to_m(ch["px"], px_m))
            end = ch.get("endsAtM")
            if not exact_points and isinstance(end, list) and len(end) == 2 and pts:
                # the channel was solved to a blueprint BERTH (`dockId`): px[0]
                # is only the raster cell the dock falls in, so put the exact
                # berth back on the head of the line — the same treatment a
                # declared lane terminal gets above (owner review 2026-09-08).
                pts = ((float(end[0]), float(end[1])),) + pts[1:]
            out[ch["id"]] = NetworkRoute(ch["id"], classes.get(ch["id"], ch.get("class") or "channel"),
                                         "water", pts)
    if minor_path.exists():
        for t in json.loads(minor_path.read_text())["tracks"]:
            pts = _px_to_m(t["px"], px_m)
            end = t.get("endsAtM")
            if isinstance(end, list) and len(end) == 2 and pts:
                # the path was routed to a blueprint's declared terminal; px[0]
                # is only the raster cell that terminal falls in, so put the
                # exact point back on the head of the line (97 C-stitch)
                pts = ((float(end[0]), float(end[1])),) + pts[1:]
            out[t["id"]] = NetworkRoute(t["id"], classes.get(t["id"], t.get("kind") or "footpath"),
                                        "minor", pts)
    return out


def route_ids(province: Path = PROVINCE) -> set[str]:
    """Every addressable route id. RAISES if the network cannot be loaded
    (review 2026-09-07): this used to return an empty set on any failure, and
    an empty set passes every `routeId` the schema check looks up — the check
    was off, not passing."""
    return set(load_network(province))
