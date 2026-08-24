"""Compile Phase 4 pass-1 outputs: road corridors, fixed danger, cultures.

Usage:
  python3 -m worldgen.compile_society <path-to-hydrology-pass1.npz>

Reads the Phase 3 cache plus world/sources/anchors/settlement-anchors.json,
computes least-cost road corridors for every suggested connection, then the
fixed danger field and culture territories. Writes overlay PNGs, routes.json
and society-meta.json into apps/world-studio/public/province/.
"""

from __future__ import annotations

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

from .scale import HSCALE as SCALE, RAW_METRES_PER_SAMPLE

STEP = 3

REPO_ROOT = Path(__file__).resolve().parents[3]
PREVIEW_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
ANCHORS_PATH = REPO_ROOT / "world" / "sources" / "anchors" / "settlement-anchors.json"


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
    waterway_paths = []
    for source, targets in by_water_source.items():
        result = routes_from(boat_cost, anchors_px[source],
                             [anchors_px[t] for t in targets], metres_per_px)
        for t in targets:
            path, length_m = result[anchors_px[t]]
            if not path:
                continue
            water_frac = sum(water[y, x] for x, y in path) / len(path)
            if water_frac < 0.7:
                continue
            for x, y in path:
                # land hops are portages — drawn amber so refinement passes
                # know where to carve channels or place boardwalks (plan §45)
                (water_mask if water[y, x] else portage_mask)[y, x] = True
            water_routes.append({"from": source, "to": t,
                                 "lengthKm": round(length_m / 1000.0, 2),
                                 "waterFraction": round(float(water_frac), 2)})
            # persist the ordered path with per-px land flags so watershed
            # refinement can resolve each portage hop explicitly (plan §45)
            waterway_paths.append({"from": source, "to": t,
                                   "px": [[int(x), int(y)] for x, y in path],
                                   "land": [0 if water[y, x] else 1 for x, y in path]})
    (PREVIEW_DIR / "waterways.json").write_text(json.dumps({"lanes": waterway_paths}))

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

    (PREVIEW_DIR / "routes.json").write_text(json.dumps({"routes": routes_out}))
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
