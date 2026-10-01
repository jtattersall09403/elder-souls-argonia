"""The ground round one placed building, for the seam look (16k walk 9).

    python3 tooling/visual-look/subjects/seam_ground.py <placeId> <placement-id-suffix> [--half 24] [--step 0.5]

Prints JSON: the placement row, the frozen ground with the place's own
ground overlays applied (`pad_overlay.ground_many`, the one pad surface the
runtime overlays at load), as a grid of heights over a square of `2 * half`
metres round the footprint's centre, and whether each post is wet.
"""
import json
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "tooling/world-generation"))

from worldgen import pad_overlay  # noqa: E402
from worldgen.settlement_run_pads import depth_is_wet  # noqa: E402
from worldgen.site_fields import shared_survey  # noqa: E402


def main(argv: list[str]) -> int:
    place_id, suffix = argv[0], argv[1]
    half = float(argv[argv.index("--half") + 1]) if "--half" in argv else 24.0
    step = float(argv[argv.index("--step") + 1]) if "--step" in argv else 0.5
    doc = json.loads((REPO / f"apps/world-studio/public/province/settlements/{place_id}.json").read_text())
    rows = [p for p in doc["placements"] if p["id"].endswith(suffix)]
    if len(rows) != 1:
        print(f"{suffix}: {len(rows)} placements match in {place_id}", file=sys.stderr)
        return 1
    row = rows[0]
    fp = np.array(row["footprintM"] or [row["positionM"][::2]], dtype=float)
    cx, cz = fp.mean(axis=0)
    n = int(round(2 * half / step)) + 1
    xs = cx - half + step * np.arange(n)
    zs = cz - half + step * np.arange(n)
    X, Z = np.meshgrid(xs, zs)
    survey = shared_survey()
    base = np.vectorize(survey.height_at)(X, Z)
    overlays = (doc["settlement"].get("groundOverlays") or {}).get("pads") or []
    H = pad_overlay.ground_many(base, X, Z, overlays)
    wet = np.vectorize(depth_is_wet(survey.water_signed_depth_m, survey.extent_m))(X, Z)
    print(json.dumps({"row": row, "x0": float(xs[0]), "z0": float(zs[0]), "step": step, "n": n,
                      "heights": [round(float(h), 3) for h in H.ravel()],
                      "wet": [int(w) for w in wet.ravel()],
                      "paint": doc["settlement"].get("groundPaint") or {"entries": []}}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
