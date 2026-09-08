"""Compile Phase 4 pass-1 outputs: road corridors, fixed danger, cultures.

Usage:
  python3 -m worldgen.compile_society <path-to-hydrology-pass1.npz>

Reads the Phase 3 cache plus world/sources/anchors/settlement-anchors.json,
computes least-cost road corridors for every suggested connection, then the
fixed danger field and culture territories. Writes overlay PNGs, routes.json
and society-meta.json into apps/world-studio/public/province/.

Lane terminals: boat lanes are solved anchor-to-anchor, and a city's anchor is
its centre of gravity on land — no boat can tie up there. Where
``world/sources/routes/lane-terminals.json`` declares a terminal for a city
(``{terminalUV, dockId, why}``, keyed by anchor id), every lane touching that
city is routed to that pixel instead, so the published geometry ends at the
berth and a blueprint ``networkTerminals[]`` entry can stitch to it (97
C-stitch). A terminal must lie on boatable water; this module asserts it. The
mechanism is general — add a city, get the same behaviour. Roads are never
overridden: a road's terminal is its gate, declared in the blueprint.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

from .routes import BOAT_PORTAGE, boat_cost_surface, cost_surface, routes_from
from .society import CULTURES, DANGER_BANDS, compute_society, depth_cost_surface

# Candidate boat lanes between water-served anchors; kept only if the solved
# path is genuinely waterborne (>=70% water cells) — else the pair has no
# sensible pass-1 boat route.
WATER_EDGES = [
    ("soulrest", "lilmoth"), ("lilmoth", "archon"), ("archon", "thorn"),
    ("stormhold", "alten-corimont"), ("blackrose", "lilmoth"),
    # MQ05 escorted convoy line into Helstrom (owner decision 2026-08-23)
    ("alten-corimont", "helstrom"),
]

from .scale import HSCALE as SCALE, PROVINCE_EXTENT_M, RAW_METRES_PER_SAMPLE

STEP = 3

REPO_ROOT = Path(__file__).resolve().parents[3]
PREVIEW_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
ANCHORS_PATH = REPO_ROOT / "world" / "sources" / "anchors" / "settlement-anchors.json"
LANE_TERMINALS_PATH = REPO_ROOT / "world" / "sources" / "routes" / "lane-terminals.json"


def load_lane_terminal_uv(path: Path = LANE_TERMINALS_PATH) -> dict[str, tuple[float, float]]:
    """{anchor id: (u, v)} — the declared boat terminal for each city."""
    if not path.exists():
        return {}
    doc = json.loads(path.read_text())
    if doc.get("schemaVersion") != 1:
        raise ValueError(f"{path}: schemaVersion must be 1")
    return {city: (float(spec["terminalUV"][0]), float(spec["terminalUV"][1]))
            for city, spec in doc.get("terminals", {}).items()}


def publish_roads(routes_out: list[dict], province: Path = PREVIEW_DIR) -> bool:
    """Publish the society solve's roads without clobbering a live repair.

    `reroute_majors` repairs the published `routes.json` in place and records
    what it repaired FROM in `routes-repaired-by.json` (`naturalSha256`, the
    hash of `routes-natural.json`). So this writes the solver output to
    `routes-natural.json` — the file siting reads — and then:

      * hash unchanged and a repaired `routes.json` on disk  -> leave it alone;
      * anything else -> write `routes.json` and drop the repair marker, so the
        chain knows `reroute_majors` has to run again.

    Returns True if `routes.json` was rewritten.
    """
    natural = province / "routes-natural.json"
    roads = province / "routes.json"
    marker = province / "routes-repaired-by.json"
    natural.write_text(json.dumps({"routes": routes_out}))
    # stamp the registry ids/names onto the geometry files (worldgen.route_registry)
    from .route_registry import attach as _attach_route_ids
    _attach_route_ids()
    fresh = hashlib.sha256(natural.read_bytes()).hexdigest()
    stamped = json.loads(marker.read_text()) if marker.exists() else {}
    if roads.exists() and stamped.get("naturalSha256") == fresh:
        print("routes: natural roads unchanged - keeping the reroute_majors repair "
              "in routes.json (routes-natural.json refreshed)")
        return False
    roads.write_text(natural.read_text())
    if marker.exists():
        marker.unlink()
        print("routes: natural roads CHANGED - routes.json rewritten and the repair "
              "marker cleared; re-run `python3 -m worldgen.reroute_majors`")
    else:
        print("routes: routes.json written from the society solve "
              "(no repair marker; run `python3 -m worldgen.reroute_majors` next)")
    return True


def _canonical_bytes(doc: dict) -> bytes:
    return (json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def _sha256(doc: dict) -> str:
    return hashlib.sha256(_canonical_bytes(doc)).hexdigest()


def waterway_marker(natural: dict, fitted: dict, fit_inputs: dict) -> dict:
    """Bind a fitted major-lane baseline to every input that can move it."""
    return {
        "schemaVersion": 1,
        "kind": "major-waterways-repair-marker",
        "naturalSha256": _sha256(natural),
        "fitInputsSha256": _sha256(fit_inputs),
        "publishedSha256": _sha256(fitted),
        "reason": "declared major-lane terminals fitted after the anchor-to-anchor solve",
    }


def publish_waterways(natural_paths: list[dict], fitted_paths: list[dict],
                      fit_inputs: dict, province: Path = PREVIEW_DIR) -> bool:
    """Publish fitted lanes without silently overwriting a later repair.

    The marker records the independent natural solve and all berth-fit inputs.
    When both are unchanged, the current published bytes win: they may contain
    a reviewed terrain/water repair made after this compiler's fitted baseline.
    A changed solve or fit input invalidates that repair and republishes.
    """
    natural_doc = {"lanes": natural_paths}
    fitted_doc = {"lanes": fitted_paths}
    natural = province / "waterways-natural.json"
    published = province / "waterways.json"
    marker_path = province / "waterways-repaired-by.json"
    marker = waterway_marker(natural_doc, fitted_doc, fit_inputs)
    natural.write_bytes(_canonical_bytes(natural_doc))
    old = json.loads(marker_path.read_text()) if marker_path.exists() else {}
    same_inputs = (old.get("naturalSha256") == marker["naturalSha256"] and
                   old.get("fitInputsSha256") == marker["fitInputsSha256"])
    if published.exists() and same_inputs:
        print("waterways: natural lanes and fit inputs unchanged - keeping the "
              "reviewed waterways.json publication")
        return False
    published.write_bytes(_canonical_bytes(fitted_doc))
    marker_path.write_text(json.dumps(marker, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    if old:
        print("waterways: natural lanes or fit inputs CHANGED - waterways.json "
              "republished and its repair baseline renewed")
    else:
        print("waterways: fitted waterways.json published with a content-addressed baseline")
    return True


def main() -> None:
    npz = np.load(Path(sys.argv[1]))
    z = npz["conditioned"]
    h, w = z.shape
    metres_per_px = RAW_METRES_PER_SAMPLE * STEP * SCALE

    anchors_file = json.loads(ANCHORS_PATH.read_text())
    anchors_px = {a["id"]: (int(a["u"] * w), int(a["v"] * h)) for a in anchors_file["anchors"]}
    edges = [(c["from"], c["to"]) for c in anchors_file["suggestedConnections"]]

    jungle = npz["regions"] == 13
    gy, gx = np.gradient(z, metres_per_px)
    cost = cost_surface(z, np.hypot(gx, gy), npz["ocean"], npz["lakes"],
                        npz["rivers"], npz["wetlands"], npz["flood"])
    cost = np.where(jungle & ~npz["wetlands"], cost * 2.0, cost)  # dense canopy slows roads

    # Group edges by source so each city needs only one Dijkstra run. External
    # roads (canon exits to Cyrodiil/Morrowind) route to map-edge gate points.
    by_source: dict[str, list[tuple[str, tuple[int, int]]]] = {}
    for a, b in edges:
        by_source.setdefault(a, []).append((b, anchors_px[b]))
    for ext in anchors_file.get("externalConnections", []):
        exit_px = (int(ext["exitUV"][0] * w), int(ext["exitUV"][1] * h))
        by_source.setdefault(ext["from"], []).append((ext["id"], exit_px))
    road_mask = np.zeros((h, w), dtype=bool)
    routes_out = []
    for source, targets in by_source.items():
        result = routes_from(cost, anchors_px[source],
                             [px for _, px in targets], metres_per_px)
        for name, px in targets:
            path, length_m = result[px]
            for x, y in path:
                road_mask[y, x] = True
            routes_out.append({
                "from": source, "to": name, "lengthKm": round(length_m / 1000.0, 2),
                # every 3rd point is plenty for drawing at province scale
                "px": [[int(x), int(y)] for x, y in path[::3]] + [[*path[-1]]] if path else [],
            })

    depth_cost = depth_cost_surface(z, np.hypot(gx, gy), npz["ocean"], npz["lakes"],
                                    npz["rivers"], npz["wetlands"], npz["flood"], jungle)
    soc = compute_society(npz["regions"], anchors_px, road_mask, depth_cost,
                          npz["ocean"], metres_per_px)

    # Boat lanes over the water network (canoe channels + marsh poling count).
    boat_cost = boat_cost_surface(npz["ocean"], npz["lakes"], npz["rivers"],
                                  npz["tidal"], npz["wetlands"])
    water = boat_cost < BOAT_PORTAGE
    water_mask = np.zeros((h, w), dtype=bool)
    water_routes = []
    by_water_source: dict[str, list[str]] = {}
    for a, b in WATER_EDGES:
        by_water_source.setdefault(a, []).append(b)
    portage_mask = np.zeros((h, w), dtype=bool)
    # Declared berths win over the anchor pixel for lane endpoints (see the
    # module docstring); a terminal that is not on boatable water is a data bug.
    lane_terminal_uv = load_lane_terminal_uv()
    lane_terminals = {c: (int(u * w), int(v * h)) for c, (u, v) in lane_terminal_uv.items()}
    for city, (tx, ty) in lane_terminals.items():
        if city not in anchors_px:
            raise ValueError(f"lane-terminals.json: {city!r} is not a settlement anchor")
        if not water[ty, tx]:
            raise ValueError(f"lane-terminals.json: {city!r} terminal px ({tx}, {ty}) is not on "
                             f"boatable water (boat_cost {boat_cost[ty, tx]:.1f} >= {BOAT_PORTAGE})")

    def solve_lanes(endpoint_px, terminals, mark_masks):
        """Solve every WATER_EDGES lane between `endpoint_px`; returns
        (lane records, water-route stats). `mark_masks` paints the water /
        portage overlays (only the published solve does)."""
        paths, stats = [], []
        for source, targets in by_water_source.items():
            result = routes_from(boat_cost, endpoint_px[source],
                                 [endpoint_px[t] for t in targets], metres_per_px)
            for t in targets:
                path, length_m = result[endpoint_px[t]]
                if not path:
                    continue
                water_frac = sum(water[y, x] for x, y in path) / len(path)
                if water_frac < 0.7:
                    continue
                if mark_masks:
                    for x, y in path:
                        # land hops are portages — drawn amber so refinement passes
                        # know where to carve channels or place boardwalks (plan §45)
                        (water_mask if water[y, x] else portage_mask)[y, x] = True
                stats.append({"from": source, "to": t,
                              "lengthKm": round(length_m / 1000.0, 2),
                              "waterFraction": round(float(water_frac), 2)})
                # persist the ordered path with per-px land flags so watershed
                # refinement can resolve each portage hop explicitly (plan §45)
                lane = {"from": source, "to": t,
                        "px": [[int(x), int(y)] for x, y in path],
                        "land": [0 if water[y, x] else 1 for x, y in path]}
                # A declared terminal is an exact point; path[0]/path[-1] are only
                # the raster cells it falls in. Publish the exact metres so the
                # 97 C-stitch check measures the join against the real berth
                # (the same trick compile_minor_routes uses for `endsAtM`).
                for key, city in (("startsAtM", source), ("endsAtM", t)):
                    if city in terminals:
                        u, v = lane_terminal_uv[city]
                        lane[key] = [round(u * PROVINCE_EXTENT_M, 3),
                                     round(v * PROVINCE_EXTENT_M, 3)]
                paths.append(lane)
        return paths, stats

    # The SITING SEAM (decision 0025 / the rebuild chain, the same rule the
    # roads already follow): a place's siting score depends on how near a lane
    # it is, so scoring on the terminal-corrected line would feed a berth back
    # into the macro plot and move committed records. `waterways-natural.json`
    # is the anchor-to-anchor solve that `site_fields.ProvinceSurvey` reads;
    # `waterways.json` — ending at the declared berths — is what the world
    # carries. With no terminals declared the two files are identical.
    natural_paths, _natural_stats = solve_lanes(anchors_px, {}, mark_masks=False)
    lane_px = {a: lane_terminals.get(a, px) for a, px in anchors_px.items()}
    waterway_paths, lane_stats = solve_lanes(lane_px, lane_terminals, mark_masks=True)
    water_routes.extend(lane_stats)
    # Establish identity on the fresh natural solve by endpoint pair once.
    # The fitted publication then inherits those ids; it never independently
    # re-keys by endpoint pair, which protects later geometry repairs.
    from . import route_registry as _route_registry
    registry_routes = _route_registry.load()
    _route_registry._stamp_entries(natural_paths, "boat", registry_routes,
                                   allow_registry_pair=True)
    lane_identities = _route_registry._identity_pairs(natural_paths, registry_routes)
    _route_registry._stamp_entries(waterway_paths, "boat", registry_routes,
                                   pair_fallback=lane_identities)
    publish_waterways(natural_paths, waterway_paths, {
        "laneTerminals": {city: list(uv) for city, uv in sorted(lane_terminal_uv.items())},
        "waterEdges": WATER_EDGES,
        "rasterSize": [w, h],
        "metresPerPixel": metres_per_px,
        "boatPortage": BOAT_PORTAGE,
    })

    # Rootworm transit (speculative pass 1, AGENT_AUTHORED — plan §19).
    root_file = json.loads((ANCHORS_PATH.parent / "root-transit.json").read_text())
    root_px = {s["id"]: (int(s["u"] * w), int(s["v"] * h)) for s in root_file["stations"]}

    routes_img = np.zeros((h, w, 4), dtype=np.uint8)
    wide = ndimage.binary_dilation(road_mask)
    routes_img[wide] = (225, 205, 160, 235)
    Image.fromarray(routes_img).save(PREVIEW_DIR / "soc-routes.png")

    waterways_img = np.zeros((h, w, 4), dtype=np.uint8)
    waterways_img[ndimage.binary_dilation(water_mask)] = (120, 215, 255, 220)
    waterways_img[ndimage.binary_dilation(portage_mask)] = (245, 180, 90, 230)
    Image.fromarray(waterways_img).save(PREVIEW_DIR / "soc-waterways.png")

    # Rootways drawn as straight faint arcs between stations (schematic only).
    rootways_img = np.zeros((h, w, 4), dtype=np.uint8)
    for e in root_file["edges"]:
        (x0, y0), (x1, y1) = root_px[e["from"]], root_px[e["to"]]
        n = int(max(abs(x1 - x0), abs(y1 - y0)))
        for i in range(0, n, 4):  # dotted
            t = i / n
            rootways_img[int(y0 + (y1 - y0) * t), int(x0 + (x1 - x0) * t)] = (150, 240, 150, 235)
    rootways_img = np.array(Image.fromarray(rootways_img).filter(ImageFilter.MaxFilter(3)))
    for sid, (x, y) in root_px.items():
        rootways_img[max(y-2,0):y+3, max(x-2,0):x+3] = (110, 230, 110, 255)
    Image.fromarray(rootways_img).save(PREVIEW_DIR / "soc-rootways.png")

    danger_img = np.zeros((h, w, 4), dtype=np.uint8)
    for band, (_, colour) in DANGER_BANDS.items():
        danger_img[soc.danger_band == band] = (*colour, 95)
    danger_img[npz["ocean"]] = (0, 0, 0, 0)  # keep sea legible; sea danger in data
    Image.fromarray(danger_img).save(PREVIEW_DIR / "soc-danger.png")

    culture_img = np.zeros((h, w, 4), dtype=np.uint8)
    for ci, (name, spec) in enumerate(CULTURES.items()):
        culture_img[soc.culture == ci + 1] = (*spec["colour"], 100)
    Image.fromarray(culture_img).save(PREVIEW_DIR / "soc-cultures.png")

    publish_roads(routes_out)
    meta = {
        "dangerLegend": {str(b): {"name": name, "rgb": list(rgb)} for b, (name, rgb) in DANGER_BANDS.items()},
        "cultureLegend": {name: {"name": name, "rgb": list(spec["colour"])} for name, spec in CULTURES.items()},
        "routeLengthsKm": {f"{r['from']}->{r['to']}": r["lengthKm"] for r in routes_out},
        "waterRoutes": water_routes,
        "rootStations": list(root_px.keys()),
        "dangerModel": "base(region) + 2.9*depth/10km(cost) - road relief; edges/coast seed access, Helstrom excluded (canon: unconquered heart); high dry ground capped at band 3",
        **soc.stats,
    }
    (PREVIEW_DIR / "society-meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
