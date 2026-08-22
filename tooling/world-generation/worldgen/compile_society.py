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
from PIL import Image
from scipy import ndimage

from .routes import cost_surface, routes_from
from .society import CULTURES, DANGER_BANDS, compute_society

RAW_METRES_PER_SAMPLE = 4096.0 * 0.01428 / 32.0
SCALE = 3.0
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

    gy, gx = np.gradient(z, metres_per_px)
    cost = cost_surface(z, np.hypot(gx, gy), npz["ocean"], npz["lakes"],
                        npz["rivers"], npz["wetlands"], npz["flood"])

    # Group edges by source so each city needs only one Dijkstra run.
    by_source: dict[str, list[str]] = {}
    for a, b in edges:
        by_source.setdefault(a, []).append(b)
    road_mask = np.zeros((h, w), dtype=bool)
    routes_out = []
    for source, targets in by_source.items():
        result = routes_from(cost, anchors_px[source],
                             [anchors_px[t] for t in targets], metres_per_px)
        for t in targets:
            path, length_m = result[anchors_px[t]]
            for x, y in path:
                road_mask[y, x] = True
            routes_out.append({
                "from": source, "to": t, "lengthKm": round(length_m / 1000.0, 2),
                # every 3rd point is plenty for drawing at province scale
                "px": [[int(x), int(y)] for x, y in path[::3]] + [[*path[-1]]] if path else [],
            })

    soc = compute_society(npz["regions"], anchors_px, road_mask, metres_per_px)

    routes_img = np.zeros((h, w, 4), dtype=np.uint8)
    wide = ndimage.binary_dilation(road_mask)
    routes_img[wide] = (225, 205, 160, 235)
    Image.fromarray(routes_img).save(PREVIEW_DIR / "soc-routes.png")

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
        **soc.stats,
    }
    (PREVIEW_DIR / "society-meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
